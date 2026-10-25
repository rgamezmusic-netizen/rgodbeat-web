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

## Continuidad y protección de lo existente

Instrucción del usuario: corregir sin inventar y conservar la web actual, sus funciones, todas las API, credenciales y conexiones.

- Permiso confirmado el 25 de octubre de 2026 para continuar la limpieza y el mantenimiento acordados, condicionado a conservar lo que ya funciona. Comprobar dependencias antes de retirar algo; conservar los elementos de uso incierto. No ampliar esta autorización a tareas distintas de las acordadas.
- Al comenzar, lee `../AGENTS.md` y `../RGODBEAT-Contenido/CONTINUIDAD_RGODBEAT.md`. Comprueba el estado de Git y revalida cualquier dato externo que pueda haber cambiado.
- Una limpieza de Vercel se limita a los despliegues antiguos identificados. No elimines rutas API, variables de entorno, claves, tokens, OAuth, webhooks, dominios, integraciones, proyectos externos, bases de datos ni buckets como parte de esa limpieza.
- Conserva beats, grabaciones, proyectos, autoguardados y datos de usuarios. Si no se conoce el uso de un servicio o dependencia, consérvalo y registra la incertidumbre.
- Nunca copies valores de credenciales a documentación, Git o respuestas. Registra solo propósito, ubicación y nombres cuando sea necesario.
- `RGODBEAT_STUDIO_VISUAL_ROUTE.md` es documentación de preproducción/promoción. Contrasta sus afirmaciones con el código y con pruebas actuales antes de usarlas como descripción de funcionamiento verificado.
- Actualiza el registro de continuidad al terminar o cambiar de tarea: fecha, objetivo, decisiones, cambios reales, validación y límites, pendientes y siguiente paso. Distingue código implementado, pruebas locales, despliegue y verificación real en producción.
- Guarda los registros de mantenimiento en `../RGODBEAT-Contenido/`, fuera del despliegue web. Las instrucciones nuevas del usuario prevalecen sobre las decisiones anteriores registradas.
