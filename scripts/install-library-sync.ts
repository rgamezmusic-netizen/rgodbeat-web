/** Install/control the creator's macOS login service. No credentials enter the plist. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const label = "com.rgodbeat.local-library";
const project = path.resolve(__dirname, "..");
const state = path.join(project, ".local-sync");
const agents = path.join(os.homedir(), "Library", "LaunchAgents");
const logs = path.join(os.homedir(), "Library", "Logs", "RGodbeat");
const plist = path.join(agents, `${label}.plist`);
const domain = `gui/${process.getuid!()}`;
const service = `${domain}/${label}`;
const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
function launchctl(args: string[], required = true) {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (required && result.status !== 0) throw new Error(result.stderr.trim() || result.error?.message || "No se pudo administrar el servicio local.");
  return result;
}
async function main() {
  if (process.platform !== "darwin") throw new Error("Este servicio se instala en el Mac del creador.");
  if (process.argv.includes("--stop")) {
    launchctl(["bootout", service], false);
    console.log("Companion detenido. Para activarlo de nuevo: npm run sync:install");
    return;
  }
  if (process.argv.includes("--status")) {
    const result = launchctl(["print", service], false);
    const lines = result.stdout.split("\n").filter(line => /^\t(state|pid|last exit code|runs) =/.test(line));
    console.log(result.status === 0 ? `Servicio instalado: ${label}\n${lines.join("\n")}` : "Servicio no cargado.");
    if (result.status === 0 && !/^\tstate = running$/m.test(result.stdout)) console.log("El servicio no está ejecutándose. Revisa los registros en ~/Library/Logs/RGodbeat/.");
    const statusFile = path.join(state, "status.json");
    if (fs.existsSync(statusFile)) {
      const status = JSON.parse(fs.readFileSync(statusFile, "utf8"));
      const pid = Number(result.stdout.match(/^\tpid = (\d+)$/m)?.[1]);
      if (status.pid !== pid || Date.now() - Date.parse(status.checkedAt) > 120000) {
        console.log("Aún no hay una revisión reciente confirmada por el proceso activo. Si aparece el aviso de macOS para acceder al SSD, pulsa Permitir. Revisa los registros si continúa pendiente.");
      }
      console.log(JSON.stringify(status, null, 2));
    }
    return;
  }
  if (!fs.existsSync(path.join(project, ".env.local"))) throw new Error("Falta .env.local en el proyecto.");
  const { getConfig } = await import("./sync-companion");
  const { libraryRoot, supabaseUrl, supabaseServiceKey } = getConfig();
  if (!libraryRoot || !supabaseUrl || !supabaseServiceKey) throw new Error("Configura la biblioteca y Supabase en .env.local antes de instalar.");
  fs.mkdirSync(agents, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(logs, { recursive: true });
  const stableNode = ["/opt/homebrew/bin/node", "/usr/local/bin/node"].find(candidate => fs.existsSync(candidate) && fs.realpathSync(candidate) === fs.realpathSync(process.execPath));
  const args = [stableNode || process.execPath, `--env-file=${path.join(project, ".env.local")}`, "--import", pathToFileURL(createRequire(__filename).resolve("tsx")).href, path.join(project, "scripts", "sync-companion.ts"), "--watch"];
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join("")}</array>
<key>WorkingDirectory</key><string>${xml(os.homedir())}</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>30</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key><string>${xml(path.join(logs, "companion.log"))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(logs, "companion-error.log"))}</string>
</dict></plist>\n`;
  launchctl(["bootout", service], false);
  fs.writeFileSync(plist, content, { mode: 0o600 });
  const check = spawnSync("/usr/bin/plutil", ["-lint", plist], { encoding: "utf8" });
  if (check.status !== 0) throw new Error(check.stdout || check.stderr);
  launchctl(["bootstrap", domain, plist]);
  launchctl(["kickstart", service]);
  console.log(`Servicio automático instalado. Revisa el catálogo cada 30 segundos después de permitir el acceso al SSD en el aviso de macOS.\nBiblioteca: ${libraryRoot}\nEstado: npm run sync:status\nDetener: npm run sync:stop`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "No se pudo instalar el servicio."); process.exitCode = 1; });
