# Biblioteca local de beats

La biblioteca configurada es `/Volumes/RGodbeat XXX/RGODBEAT 23 SALE`.

La web guarda los archivos y datos en el almacenamiento del catálogo. El companion del Mac los descarga al SSD, revisando el catálogo cada 30 segundos. Funciona con la web publicada aunque el formulario anterior no solicite expresamente otra copia, porque también compara los cambios del catálogo con el manifiesto local.

El Mac necesita estar encendido, con tu sesión iniciada, acceso a Internet y el SSD conectado. Los beats subidos mientras está apagado se recogen al volver. Se dejan 20 segundos de margen para cambios recientes antes de copiar; el tiempo total también depende de la descarga.

## Permiso de macOS

El servicio `com.rgodbeat.local-library` está instalado en `~/Library/LaunchAgents/`. macOS puede mostrar un aviso para que **node acceda a los archivos del volumen extraíble**. Pulsa **Permitir** para que el proceso automático pueda acceder al SSD. Este permiso pertenece al sistema; no se cambia desde el código.

Si deniegas el aviso, revisa Ajustes del Sistema → Privacidad y seguridad → Archivos y carpetas → node → Volúmenes extraíbles, y vuelve a iniciar el servicio. No hace falta conceder acceso completo al disco para este flujo.

Estado y registros:

- `npm run sync:status`: estado del servicio y última revisión del catálogo.
- `~/Library/Logs/RGodbeat/companion.log`: actividad del servicio.
- `~/Library/Logs/RGodbeat/companion-error.log`: errores.
- `.local-sync/status.json`: última revisión. Su PID debe coincidir con el proceso activo para confirmar esa revisión automática.

## Organización de cada beat

| Carpeta | Contenido |
| --- | --- |
| `01_MASTER` | Todos los masters WAV registrados |
| `02_MP3` | Previews y archivos MP3 registrados |
| `03_ARTWORK` | Artwork del catálogo |
| `04_METADATA` | `beat.json`, inventario `archivos.txt` y manifiesto con tamaños y SHA-256 |
| `05_YOUTUBE` | `titulo.txt`, `descripcion.txt`, `etiquetas.txt` y `youtube_metadata.txt` |
| `06_BEATSTARS` | Información real del catálogo para BeatStars |
| `07_LICENSE` | Resumen de licencias activas y contratos registrados |
| `08_STEMS` | Stems o ZIP que estén registrados en la web |
| `09_EXCLUSIVE` | Archivos de exclusiva registrados |
| `10_OTHER_FILES` | Otros tipos de archivo registrados |

Los proyectos Ableton y sus carpetas Samples existentes se conservan en sus ubicaciones originales. Los archivos ZIP se guardan completos y no se descomprimen. El formulario actual carga artwork, preview y WAV; este cambio no añade un cargador de proyectos Ableton ni de samples individuales. Si un archivo no está subido/registrado en el catálogo, el companion no puede descargarlo.

Las carpetas se identifican primero por el ID del beat en `04_METADATA/beat.json`. Se reutilizan nombres exactos de carpetas existentes y la carpeta histórica `DAIMOND` para DIAMONDS. No se reubica un beat por cambios de ranking. No se borran archivos al retirar un beat del catálogo.

## Integridad y actualizaciones

Las descargas se escriben a archivos temporales y se verifican antes de sustituir el destino. El manifiesto registra tamaño y SHA-256; se comprueba el hash al iniciar el proceso y cuando cambia el archivo local. Si el contenido del destino cambia, se conserva su versión anterior dentro de `_VERSIONES_ANTERIORES` de esa misma carpeta.

Las descargas verificadas se reutilizan tras un fallo. Un archivo ausente, vacío, ilegible o con tamaño incorrecto mantiene el beat sin confirmar y se reintenta. El SSD desconectado no provoca una copia en otra ubicación. Un cambio de catálogo durante la descarga se vuelve a procesar.

La web pasa de `PENDING` a `SYNCED` cuando se han guardado todos los archivos registrados y los textos. `FAILED` indica que el companion encontró un error; revisa los registros. El botón **COPIAR AL SSD** solicita otra copia y no afirma que el servidor web haya escrito directamente en tu Mac. La tabla actualiza estos estados cada 30 segundos mientras haya copias pendientes y la pestaña esté visible.

Los textos no inventan BPM, tonalidades, licencias, autores, permisos de samples ni la condición «FREE». Incluyen la información existente del beat y su enlace del catálogo.

## Controles

Desde la carpeta del proyecto:

```sh
npm run sync:install              # instalar o volver a iniciar al iniciar sesión
npm run sync:status               # consultar el proceso y última revisión
npm run sync:stop                 # detener el servicio de esta sesión
```

Para una copia manual, detén primero el servicio automático:

```sh
npm run sync:library -- --all      # reparar/reconciliar el catálogo completo
npm run sync:library -- --slug diamonds
npm run sync:library -- --force    # volver a descargar todos los archivos
npm run sync:library -- --dry-run  # mostrar destinos sin escribir ni cambiar estados
npm run sync:watch                # mantener la sincronización en esta terminal
```

También puedes abrir `SINCRONIZAR_BIBLIOTECA.command` para iniciar el companion en Terminal. Una biblioteca solo admite un proceso de copia a la vez.

La configuración y credenciales se leen de `.env.local`; no entran en los textos, metadatos ni el archivo del servicio. La cuenta local utiliza la clave de servicio existente para leer masters privados y confirmar estados de sincronización. Supabase Storage y referencias `r2:` están soportadas.

Si se mueve el proyecto o se actualiza/elimina Node, ejecuta `npm run sync:install` desde su ubicación vigente. El proyecto y sus dependencias tienen que seguir disponibles para que arranque el servicio.

## Restauración del 4 de octubre de 2026

Se guardaron los nueve archivos actualmente registrados: WAV, MP3 y artwork de DIVINA, HAAS y DIAMONDS. Las descargas y tamaños se confirmaron y se generaron manifiestos SHA-256, textos de YouTube, información de BeatStars y licencias del catálogo. El catálogo confirmó los tres beats como `synced`.

Destinos utilizados: `divina`, `HAAS` y `DAIMOND`. Los proyectos `DIVINA Copiar Project`, `HAAS  Project` y `DiaMONdS  Project` permanecen en sus carpetas. `SI TU SUPIERAS up soom` se conserva; ese beat no aparece actualmente en el catálogo consultado. No hay stems registrados en estos tres beats.

El servicio se cargó en macOS. Su primera revisión automática queda pendiente del permiso de acceso al volumen extraíble mostrado por el sistema. Los cambios de la interfaz web están en el código local; esta ronda no publica una nueva versión de Vercel.
