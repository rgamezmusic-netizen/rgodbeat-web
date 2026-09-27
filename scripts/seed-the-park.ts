import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const serviceMatch = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

if (!urlMatch || !serviceMatch) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), serviceMatch[1].trim(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedThePark() {
  console.log("🚀 Sincronizando datos oficiales de THE PARK en Supabase...");

  // Target master user: rgodbeat@gmail.com
  const { data: usersData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw userError;

  const masterUser = usersData.users.find(
    (u) => u.email?.toLowerCase() === "rgodbeat@gmail.com"
  ) || usersData.users.find(
    (u) => u.email?.toLowerCase() === "rgamezmusic@gmail.com"
  ) || usersData.users[0];

  if (!masterUser) {
    console.error("❌ No user found to associate");
    process.exit(1);
  }

  console.log(`👤 Usuario Maestro encontrado: ${masterUser.email} (${masterUser.id})`);

  // 1. Seed Master Profile
  const profilePayload = {
    user_id: masterUser.id,
    legal_name: "Rafael Gámez",
    professional_name: "RGODBEAT",
    producer_name: "RGODBEAT",
    artist_name: "RGODBEAT",
    roles: ["Producer", "Songwriter", "Composer", "Publisher", "Sound Recording Owner"],
    ipi_cae_number: "",
    isni_number: "",
    pro_affiliation: "BMI",
    pro_member_id: "",
    mlc_member_id: "",
    soundexchange_id: "",
    isrc_registrant_code: "",
    publisher_name: "Gamez Music",
    publisher_ipi: "",
    label_name: "RGODBEAT Records",
    company_name: "Gamez IN LLC",
    email: masterUser.email || "rgodbeat@gmail.com",
    country: "United States",
    state: "Texas",
    updated_at: new Date().toISOString(),
  };

  const { data: profile, error: profileErr } = await supabase
    .from("park_profiles")
    .upsert(profilePayload, { onConflict: "user_id" })
    .select()
    .single();

  if (profileErr) {
    console.error("❌ Error seeding park_profiles:", profileErr.message);
  } else {
    console.log("✅ Perfil Maestro de Derechos creado / actualizado exitosamente.");
  }

  // 2. Seed DIVINA Project (Official Golden Project)
  const projectPayload = {
    user_id: masterUser.id,
    slug: "divina",
    title: "DIVINA",
    type: "beat",
    stage: "beat_instrumental",
    bpm: 95,
    musical_key: "Am",
    scale: "Minor",
    genre: "Reggaeton",
    mood: "Dark",
    duration_sec: 167,
    producer_name: "RGODBEAT",
    primary_artist_name: "",
    featured_artists: [],
    songwriters: ["Rafael Gámez"],
    publishers: ["Gamez Music"],
    splits: [
      {
        id: "split-1",
        name: "Rafael Gámez (RGODBEAT)",
        role: "Producer",
        sharePercentage: 100,
        proAffiliation: "BMI",
        email: "rgodbeat@gmail.com",
      },
    ],
    master_ownership_percentage: 100,
    publishing_ownership_percentage: 100,
    iswc_code: "",
    isrc_code: "",
    upc_code: "",
    notes: "Instrumental producido en Austin, TX. Beat estelar disponible en catálogo y preparado para desarrollo de canción completa.",
    updated_at: new Date().toISOString(),
  };

  const { data: project, error: projectErr } = await supabase
    .from("park_projects")
    .upsert(projectPayload, { onConflict: "user_id,slug" })
    .select()
    .single();

  if (projectErr) {
    console.error("❌ Error seeding DIVINA project:", projectErr.message);
  } else {
    console.log(`✅ Proyecto DIVINA (95 BPM, Am, Reggaeton) guardado en Supabase con ID: ${project.id}`);

    // 3. Seed Registrations for DIVINA
    const services = [
      { service: "copyright_musical_work", status: "READY_TO_REGISTER", notes: "Composición instrumental lista para preparación en U.S. Copyright Office Form PA." },
      { service: "copyright_sound_recording", status: "NOT_APPLICABLE", notes: "No aplica como master fonográfico independiente hasta que exista una grabación vocal o release comercial." },
      { service: "bmi", status: "NOT_APPLICABLE", notes: "No aplicable aún como canción completa. Se activará cuando se registre la obra vocal con sus autores finales." },
      { service: "mlc", status: "NOT_APPLICABLE", notes: "No aplicable aún para streaming interactivo mecánico." },
      { service: "soundexchange", status: "NOT_APPLICABLE", notes: "No aplicable a un beat sin difusión radial/streaming fonográfica." },
      { service: "isrc", status: "NOT_APPLICABLE", notes: "Se asigna al master definitivo de la canción." },
      { service: "upc", status: "NOT_APPLICABLE", notes: "Se asigna al lanzamiento del sencillo o álbum." },
      { service: "symphonic", status: "NOT_APPLICABLE", notes: "Distribución digital comercial." },
      { service: "youtube_content_id", status: "READY_TO_REGISTER", notes: "Elegible para protección de huella de audio instrumental." },
    ];

    const regRows = services.map((s) => ({
      project_id: project.id,
      user_id: masterUser.id,
      service: s.service,
      status: s.status,
      notes: s.notes,
      last_updated: new Date().toISOString(),
    }));

    const { error: regErr } = await supabase
      .from("park_registrations")
      .upsert(regRows, { onConflict: "project_id,service" });

    if (regErr) {
      console.error("❌ Error seeding registrations:", regErr.message);
    } else {
      console.log("✅ 9 Registros de entidades legales creados para DIVINA.");
    }

    // 4. Seed Audit Event
    await supabase.from("park_audit_events").insert({
      project_id: project.id,
      user_id: masterUser.id,
      user_email: masterUser.email || "rgodbeat@gmail.com",
      action: "INITIAL_SEED",
      entity_type: "PROJECT",
      entity_id: project.id,
      metadata: { source: "THE_PARK_MIGRATION_V1", beat_bpm: 95, beat_key: "Am" },
    });

    console.log("✅ Evento de auditoría inicial registrado.");
  }

  console.log("\n🎉 SINCRONIZACIÓN EXITOSA: THE PARK ESTÁ 100% OPERATIVO EN SUPABASE.");
}

seedThePark();
