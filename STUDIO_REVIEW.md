# RGodbeat Studio — revisión y correcciones

La propuesta que se desprende del código es un estudio vocal portátil: cargar un beat, grabar voces por pistas, editar tomas, ajustar la mezcla y exportar WAV o stems. Hay seis pistas vocales iniciales y dos pistas de apoyo opcionales. La demo limita la grabación a Lead 1 y bloquea la exportación.

## Cambios realizados

### Ajustes del 3 de octubre de 2026

- Detener una grabación devuelve la misma promesa a todos los controles. Desconectar el micrófono, buscar otra posición, cambiar de beat o guardar espera al cierre de la toma; el último fragmento del AudioWorklet se conserva antes de liberar el micrófono.
- Cada grabación mantiene su origen temporal y su compensación de latencia, también al cambiar de pista. Los fragmentos recibidos tarde no usan la posición de una búsqueda posterior. Al empezar en cero se recortan exactamente las muestras compensadas que quedarían antes del inicio del proyecto. El diario de recuperación recibe el mismo PCM y la misma posición que la toma terminada.
- Se conservan las tomas menores de 200 ms. Un bloque de entrada ausente se registra como silencio, sin acortar la línea de tiempo; esta posibilidad está descrita en la [documentación de AudioWorkletProcessor](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process).
- Cancelar durante la preparación del respaldo impide que el micrófono comience a grabar después. El cambio de modo de escucha espera a terminar la toma y no ejecuta efectos dentro de un actualizador de estado.
- El análisis y la carga de beats usan las pistas actuales al aplicar sus resultados. Un análisis de otro beat se descarta; se retiró otra aplicación tardía de afinación que podía reinstalar un estado anterior. Los cortes y recortes comprueban que el proyecto sigue siendo el mismo tras esperar al AudioContext.
- Una referencia antigua a un clip borrado ya no elimina todas las voces de su pista. La selección visible y el botón de corte usan el clip vigente después de cortar o deshacer.
- La copia local se ofrece aunque la cuenta tenga una revisión más reciente. En ese caso se detiene el respaldo automático a la cuenta hasta cargarla expresamente o comenzar un proyecto nuevo. Abrir un archivo o cargar la cuenta pausa las escrituras locales automáticas durante el reemplazo.
- Guardar y descargar rechazan voces sin audio. Un fallo al codificar el beat rechaza el archivo completo. Un archivo antiguo que no contiene el beat solo se abre si ese mismo beat está disponible en la biblioteca; nunca se empareja silenciosamente con otra pista.
- La conversión del archivo descargable a Base64 usa fragmentos limitados y cede tiempo a la interfaz. No construye una cadena binaria completa byte por byte. El medidor del micrófono se actualiza a 20 Hz para reducir trabajo de interfaz durante la grabación.
- El editor explica cómo seleccionar, recortar y mover una toma. Corte y recorte solo se habilitan con el cabezal dentro del clip. Se aclara el botón «Desbloquear para mover», se conserva precisión de milisegundos al arrastrar y se limpia el gesto del cabezal si el navegador cancela un toque. La compensación Bluetooth se presenta como un ajuste fijo y se bloquea durante una toma.

Comprobaciones de esta ronda:

- `test-studio-audio.ts`: regresiones anteriores y nuevas de cierre simultáneo, último fragmento, tomas muy cortas, compensación al inicio, reloj inmutable y silencio por entrada ausente.
- `test-studio-project-storage.ts`: sustitución, fallos, conflictos y aislamiento con almacenamiento simulado.
- `test-studio-browser.mjs`: Chrome con audio simulado; edición, posición numérica, duplicación, deshacer/rehacer, descarga y reapertura real de `.rgodbeat`, recarga, archivo incompleto, guardado incompleto, fallo de codificación del beat, recuperación tras caída de pestaña y conservación local frente a una cuenta más reciente. APIs de cuenta/nube simuladas.
- `test-studio-webkit.mjs`: WebKit de Playwright con interfaz móvil táctil; apertura del archivo generado en Chrome, corte, recorte, movimiento, deshacer y recuperación tras recarga con posiciones y duraciones originales. Grabación por dos canales usando un oscilador como micrófono, continuidad entre tomas y cierre simultáneo. Este navegador usa el motor de Safari, pero no reproduce el hardware de un iPhone.
- TypeScript, ESLint de los archivos modificados sin errores y `git diff --check`. Permanecen advertencias previas de hooks, imágenes, funciones sin uso y navegación. La compilación de producción con webpack completó; sigue mostrando las advertencias previas sobre middleware y renderizado dinámico de la tienda.

Las comprobaciones reales de R2 enumeradas más abajo pertenecen a la revisión anterior; no se repitieron en esta ronda ni se escribieron proyectos de clientes. Los resultados y capturas de navegador se generan en la carpeta temporal `rgodbeat-studio-qa`.

- Captura PCM con AudioWorklet y un inicio programado según el reloj de audio. Se mantiene ScriptProcessor como alternativa para navegadores sin AudioWorklet.
- Cambio de pista durante la grabación con cierre del segmento anterior antes de comenzar el siguiente. Se retiró la ruta que reutilizaba un único archivo MediaRecorder y podía incorporar audio de la pista anterior.
- Cancelación de permisos/conteo pendientes, limpieza del micrófono y cierre del AudioContext al abandonar el estudio.
- Mute y solo durante la reproducción; SOLO disponible en el editor. Pausar o buscar otra posición limpia las colas de efectos anteriores.
- Corte y recorte al cabezal, conservación de la versión afinada cuando está disponible, posición numérica con milisegundos, ajuste opcional al beat, más zoom y deshacer de movimientos pequeños.
- El editor móvil permite llegar al panel de ajustes; los botones Grabador/Edición caben en la barra superior. La guía de instalación se ofrece una vez y después de resolver el inicio del proyecto.
- Afinación con procesamiento cancelable y pausas para mantener la interfaz disponible. Los resultados se aplican únicamente a los clips y ajustes que siguen vigentes; cambiar EQ no vuelve a afinar todas las tomas.
- Compresión y saturación se pueden desactivar realmente. El master exportado usa los ajustes de compresión del master de escucha, respeta el beat silenciado y reduce el nivel si las muestras exceden el margen de salida.
- La duración exportada incluye las voces situadas después del beat y las colas de delay/reverb. El crossover de sidechain recompone el beat cuando no hay reducción.
- Guardado local de audio a 24 bits, caché de codificación, protección contra guardados anteriores que terminan tarde y persistencia de borrados intencionales. Guardar y salir espera a la toma y conserva el proyecto abierto si falla el guardado local.
- El guardado local, el archivo de proyecto y la nube conservan filtros, volumen y silencio del beat. Los archivos anteriores siguen siendo compatibles.
- Los proyectos en la nube incluyen el audio del beat del catálogo y conservan el bloqueo de clips y las pistas de apoyo. Se comprobó la serialización con solicitudes simuladas.
- Se retiraron los textos que anunciaban MP3 en controles cuya implementación exporta WAV.

## Respaldo del proyecto activo por cuenta

El flujo sigue siendo un estudio vocal sobre un beat. El Top 23 existente conecta catálogo, ranking y votos semanales con el selector del Studio; esos componentes y los archivos de autenticación no se modificaron.

- Antes de recuperar o escribir proyectos se verifica la cuenta. Las voces anónimas no se copian automáticamente a otra cuenta. La copia local se identifica por cuenta y por proyecto.
- Antes de abrir el micrófono se confirma una copia del beat, las pistas y los ajustes. Durante la toma se guarda PCM por fragmentos de 4096 muestras (unos 85 ms a 48 kHz) en IndexedDB. Un cierre brusco puede perder el último fragmento aún no confirmado; no se depende de que `beforeunload` termine.
- Al volver, los fragmentos se reconstruyen como una toma y respetan el punch-in. Se eliminan después de confirmar la copia completa. Los fragmentos de un proyecto anterior no se mezclan con uno nuevo.
- La cuenta recibe la toma en curso cada 20 segundos, además del guardado tras finalizar o editar. La interfaz distingue copia local, respaldo de cuenta y respaldo pendiente. Los cambios pendientes se reintentan al recuperar conexión. Un conflicto con otra sesión conserva la copia local y pide guardar un archivo antes de cargar la cuenta.
- Las subidas se serializan y las ediciones pendientes se agrupan en la más reciente. Un hash del audio permite conservar los objetos existentes y omitir la subida de audio sin cambios.
- Los audios nuevos se escriben por separado; el manifiesto se sustituye mediante una condición sobre su revisión. Si algo falla, la versión anterior sigue disponible. Un borrado deja un pequeño marcador que impide que un guardado atrasado reviva el proyecto anterior. Se confirmó el soporte de las condiciones en la [documentación oficial de Cloudflare R2](https://developers.cloudflare.com/r2/api/s3/api/).
- Después de confirmar el manifiesto, se borran los audios que ya no utiliza. Las subidas fallidas se limpian cuando puede verificarse que no forman parte del proyecto. En el siguiente guardado también se revisan objetos abandonados de más de 24 horas; el margen evita borrar subidas en curso.
- Consultar un proyecto o vencer un pase ya no elimina el respaldo. Las restricciones existentes de grabación y exportación de la demo se conservan; el respaldo protege a la cuenta autenticada.
- Descargar `.rgodbeat` mantiene protegido el proyecto mientras se continúa editando. «Nuevo proyecto» avisa que reemplaza el único respaldo y pide comprobar el archivo descargado. Primero se limpia la cuenta y el dispositivo; si falla, el espacio abierto se conserva. Los beats de la biblioteca de 23 slots permanecen. Cambiar de proyecto también libera deshacer/rehacer y la sesión pendiente.
- Los archivos y respaldos con una voz ilegible se rechazan completos: no se presentan como un proyecto recuperado para luego guardar una versión incompleta.
- R2 no devuelve autorización CORS para `https://www.rgodbeat.com` y esta clave no puede cambiar las reglas del bucket. La recuperación del beat y las voces usa una ruta del mismo dominio que comprueba la sesión y que el audio figure en el proyecto activo antes de transmitirlo.
- Vercel limita el cuerpo de cada solicitud a 4,5 MB. Si los audios nuevos superan 2,5 MB en conjunto, el Studio los sube en fragmentos de hasta 2 MB, comprueba su SHA-256, verifica los objetos preparados en R2 y confirma un manifiesto pequeño. Los fragmentos temporales de una subida interrumpida se retiran en una revisión posterior de almacenamiento.

## Verificación

- `node --import tsx scripts/test-studio-audio.ts`: cortes por muestras, audio original intacto, punch-in con fragmentos cortos, duración y colas, encabezado WAV, afinación cancelable y funcionamiento del capturador PCM.
- `scripts/test-studio-project-storage.ts`: autorización exacta del audio por proyecto, objetos preparados, sustitución atómica, subida interrumpida, fallo de manifiesto, reuso de audio, limpieza, conflictos, respuesta perdida después de confirmar y aislamiento de cuentas. Almacenamiento simulado.
- `node --env-file=.env.local --import tsx scripts/test-studio-r2-live.ts`: prueba aislada en el R2 real de escritura condicional, lectura, reutilización, objeto preparado y limpieza. No se tocaron proyectos de usuarios.
- `scripts/test-studio-browser.mjs`: Chrome con micrófono simulado, grabación/cambio de pista, recorte/corte/deshacer desde la interfaz, controles móviles accesibles, activación de una pista silenciada, exportación después del beat, guardado/restauración local y nube simulada. Incluye la división y confirmación de un beat superior al límite de una solicitud, y un fallo real del proceso de la pestaña (`Page.crash`) durante una grabación, rescate de la voz, verificación de cuenta con respuesta demorada, aislamiento de dos cuentas, limpieza de proyecto y fragmentos antiguos, agrupación de guardados, omisión de audio sin cambios y rechazo de una descarga parcial. No utiliza una cuenta real ni sube archivos a R2.
- TypeScript y revisión del diff sin errores. ESLint de los archivos de Studio revisados sin errores; permanecen advertencias de hooks, imágenes y código previo no utilizado. No se afirma que el lint de todo el repositorio esté limpio.
- Compilación de producción mediante `npm run build -- --webpack` completada. El build predeterminado con Turbopack falla al abrir un puerto interno en este entorno. Next también informa sobre la convención middleware y mensajes de renderizado dinámico de la tienda.

Para repetir la prueba de navegador se necesita Playwright y Chrome; la prueba adicional requiere instalar WebKit con Playwright. Si Playwright está fuera del proyecto, indicar la ruta de su archivo `index.mjs` en `STUDIO_PLAYWRIGHT_PATH`. Se pueden configurar `STUDIO_TEST_URL` y `STUDIO_TEST_OUTPUT`. Ejecutar primero `test-studio-browser.mjs`, que genera el archivo `edited-project.rgodbeat`, y después `test-studio-webkit.mjs`, que lo abre con el mismo directorio de resultados.

## Límites de esta entrega

Las pruebas actuales usaron Chrome y WebKit con audio simulado. La revisión anterior verificó operaciones de R2 con objetos aislados, pero falta una prueba de extremo a extremo con una cuenta real en la web publicada y proyectos largos bajo los límites de tiempo del hosting. Falta probar micrófono, auriculares, interrupciones del sistema y latencia en teléfonos Android/iPhone físicos. El navegador o el usuario pueden borrar IndexedDB; es necesaria la copia descargada. La nube depende de conexión y de confirmación del servidor. El ajuste Bluetooth sigue siendo una compensación fija, no una calibración automática del dispositivo.

La afinación implementada procesa tomas grabadas. No hay monitorización afinada del micrófono en directo. Exportar a 24 bits/48 kHz no aumenta la calidad original del micrófono ni de un archivo comprimido.

Los cambios están en el código local de la web, disponibles para revisar en GitHub Desktop. Vercel, Supabase y Cloudflare son las integraciones existentes del proyecto; una sesión ausente en una CLI no significa que la web esté desconectada. Esta ronda no publicó una versión ni reconstruyó el APK. Las modificaciones previas en `lib/actions/beats.ts` y `scripts/sync-companion.ts` se conservaron.

## Base existente para la siguiente etapa: Top 23 y catálogo

- La web está creada con Next.js y React. Supabase contiene catálogo, licencias, cuentas y votos; Cloudflare R2 ya dispone de cliente y almacenamiento de proyectos/audio. Los archivos del catálogo conservan su ruta en `beat_files.storage_path`. Hay flujos de subida que usan Supabase Storage y otros que usan R2: antes de migrar se debe comprobar la ubicación real de cada archivo.
- El selector del Studio consulta `/api/beats/ranking`; el voto pasa por `/api/beats/[id]/vote`. Hay una migración con un voto por usuario, beat y semana. La puntuación actual de esa ruta combina reproducciones, favoritos y ventas acumuladas. Eso todavía necesita una revisión si el resultado debe ser un ranking semanal.
- `getPublishedBeats()` consulta el catálogo completo publicado, mientras el ranking limita a 23 por puntuación. La portada actual usa seis destacados en «Latest Releases». La presentación de programa musical solicitada puede construirse sobre estos datos, manteniendo una entrada separada al catálogo completo.
- Salir del Top 23 debe cambiar la posición visible, conservando la publicación, las licencias, las compras y los archivos del beat. No se debe borrar un master por salir del ranking. Mover audio a R2 exige conservar referencias y descargas de compras existentes.
- Antes de usar los votos como ranking definitivo hay que corregir su incremento como operación atómica: la ruta actual lee y luego escribe el contador, y puede continuar tras un fallo al insertar el voto. Dos votos simultáneos pueden perder un incremento o registrar un resultado inconsistente.

Estos son hallazgos del código local; no confirman por sí solos qué migraciones están aplicadas o el estado de los archivos en producción. La implementación visual y los cambios de ranking quedan para la siguiente etapa pedida por el usuario.
