<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Material de producción y archivos temporales

El usuario ha pedido mantener los materiales de contenido fuera del proyecto web y de sus despliegues.

- Guarda videos promocionales, manuales generados, PDF, ZIP y capturas de producción en `../RGODBEAT-Contenido/`, fuera de este repositorio. La carpeta ya existe en el disco local.
- No uses `output/` ni `public/` para esos entregables. `public/` contiene los recursos que utiliza la aplicación.
- Crea los archivos temporales de producción en una carpeta temporal exclusiva de cada ejecución y retíralos al finalizar, también cuando falle la tarea. Conserva los originales, entregables y fuentes editables.
- Esta limpieza no debe borrar beats, autoguardados, proyectos de usuarios ni el estado del servicio de sincronización.
- Si se retiran materiales que Git ya seguía, consérvalos primero fuera del repositorio y comprueba su integridad. Las reglas de ignore por sí solas no retiran archivos ya versionados.
