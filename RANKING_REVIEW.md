# Top 23 — implementación y estado real

Actualizado: 3 de octubre de 2026.

## Presentación

- Nueva página `/ranking`, enlazada desde la navegación y el botón principal de inicio.
- Negro, blanco cálido y dorado. El número uno protagoniza la portada; las demás posiciones conservan portada, preview, voto, conversación y licencia.
- El ranking se presenta en una superficie de cristal con fondo espacial. Las nebulosas, la galaxia decorativa, las estrellas y las constelaciones se generan localmente y cambian al montar la página. Son elementos artísticos, sin nombres ni datos astronómicos atribuidos.
- Animación lenta, pausada en pestañas ocultas; la preferencia de movimiento reducido detiene las animaciones. Canvas limitado a 190 estrellas en escritorio y 85 en móvil, resolución máxima 1.5 y dibujo aproximado a 24/20 cuadros por segundo. No añade librerías ni descargas de imágenes espaciales.
- El efecto de cristal se aplica inicialmente al ranking. El resto de las páginas conserva su presentación.
- Compra y conversación usan paneles laterales. Los paneles del ranking se montan fuera del cristal mediante un portal para que `backdrop-filter` no cambie su posición fija.

## Regla del ranking

- Fuente de verdad: votos reales de `beat_votes` durante la semana ISO en UTC.
- Un voto por cuenta, por beat y por semana. Reinicio los lunes a las 00:00 UTC.
- Orden: votos semanales descendentes, fecha completa de creación descendente, ID como último desempate estable.
- Primeros 23 beats publicados: Top 23. El resto sigue disponible y puede recibir votos, regresar al Top y vender licencias.
- Compras, reproducciones y comentarios no alteran esta clasificación. `performance_score` se conserva como métrica histórica compatible con código anterior.
- La comparación con la semana pasada sólo muestra posición anterior cuando hubo votos reales para ese beat. No se inventan posiciones previas sin actividad registrada.
- Ranking público, lista del Studio y orden «ranking» del catálogo comparten esta fuente de datos. La página pública actualiza la lista cada 30 segundos mientras esté visible y después de votar/comentar.
- Actualmente hay tres beats publicados. Se muestran tres entradas reales; no se rellena la lista con beats ficticios.
- Se retiró el bloqueo de previews y compra que el catálogo aplicaba a los beats del Top para visitantes sin acceso Pro. El acceso y los derechos del Studio conservan sus reglas.

## Comentarios y votos

La migración `supabase/migrations/20261003000000_chart_community.sql` fue ejecutada por Rafael en el SQL Editor. Se confirmó mediante lectura que existen `beat_comments` y la función `get_public_beat_activity`.

- Comentarios ligados al `beat_id`, independiente de su posición. Desplazarlo del Top no borra sus conversaciones ni sus compras.
- Lectura pública, publicación autenticada, 2–600 caracteres, separación de 15 segundos entre publicaciones de una cuenta y paginación por fecha/ID.
- Nombre de artista/perfil, sin publicar el correo. El contenido se renderiza como texto de React.
- El autor y los administradores reconocidos por metadatos privados o las cuentas administrativas ya existentes pueden ocultar comentarios. No se usa el rol editable de `user_metadata` para moderar.
- Voto y actualización de métricas se ejecutan en una transacción con bloqueo de fila; duplicados no incrementan métricas. La API no presenta un fallo de inserción como éxito.
- Las mutaciones directas de votos/comentarios desde claves públicas están restringidas. Las APIs verifican la cuenta antes de llamar a las funciones con credenciales de servidor.
- La compatibilidad con instalaciones anteriores permite leer votos y votar mientras no exista la nueva función; no actualiza contadores mediante escrituras concurrentes en JavaScript.

## Almacenamiento: conexión frente a archivos existentes

| Elemento | Ubicación / estado |
| --- | --- |
| Catálogo completo, votos, comentarios, licencias y compras | Registros de Supabase/Postgres; se conservan al salir del Top |
| Portadas y previews públicos | Rutas públicas actuales de Supabase Storage |
| Archivos comerciales registrados en `beat_files` | Lectura actual: cinco referencias de Supabase, ninguna referencia `r2:`; unos 135.9 MB registrados |
| Cloudflare R2 | Ya configurado; el código existente permite archivos privados `r2:` y descargas firmadas después de verificar la compra |
| Carga directa actual del administrador | WAV a Supabase Storage; la ruta antigua de subida ya intenta R2 con respaldo Supabase |

No se trasladaron ni borraron archivos durante este cambio visual y comunitario. El número de puesto no cambia las rutas comerciales ni `published`. No hace falta mover archivos al subir/bajar de posición.

La estrategia eficiente propuesta es mantener todos los registros en Postgres y usar R2 como ubicación permanente de los masters grandes. Para aplicarla a los archivos actuales falta una migración específica: copiar los masters, comprobar su integridad, actualizar únicamente `beat_files.storage_path` y mantener una copia recuperable antes de retirar originales. También se debe adaptar la carga directa de nuevos masters y revisar CORS del dominio real. Ese traslado no está implementado ni se ha liberado espacio por este cambio.

Fuentes: [Base de datos de Supabase](https://supabase.com/docs/guides/database/overview) y [almacenamiento de objetos R2](https://developers.cloudflare.com/r2/).

## Revisión realizada

- Compilación de producción (`npm run build -- --webpack`) completada; TypeScript sin errores y análisis ESLint de los componentes y APIs nuevos sin errores. La advertencia de Next sobre la convención `middleware` ya existía. Hay advertencias/errores de lint previos en archivos generales del proyecto; no se afirma que todo el repositorio tenga lint limpio.
- Capturas de la página real en Chrome de escritorio y WebKit móvil, con datos reales de Supabase. Vista móvil de 390 píxeles sin desbordamiento horizontal observado.
- Vista de licencias, carrito lateral y conversación anónima. Al abrir el carrito la dirección sigue siendo `/ranking`.
- Lecturas de la tabla de comentarios y de la función agregadora instalada.
- No se creó contenido de ejemplo en la base de producción, ni se emitieron votos o comentarios con una cuenta real, ni se efectuó una compra durante esta revisión.
- Estas observaciones no sustituyen una revisión completa de publicación autenticada, moderación y pago real. No se añadieron ni ejecutaron suites de pruebas en este turno.

## YouTube: fase posterior

No hay un flujo de publicación implementado. Para publicar exportaciones desde el Studio se necesita:

1. Autorizar el canal con OAuth y `youtube.upload`, y definir privacidad, título y nombre artístico.
2. Crear un vídeo a partir del audio exportado y una portada; el endpoint de vídeos recibe un archivo de vídeo.
3. Preparar un trabajo persistente de conversión/subida, con estado y reintentos; la descarga local del proyecto o WAV debe seguir funcionando si falla YouTube.
4. Revisar el estado de verificación del proyecto de Google. Las subidas de ciertos proyectos API sin verificar quedan restringidas a privado hasta completar la auditoría.

Fuente: [YouTube — videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert). No se configuró un canal ni se publicaron vídeos.
