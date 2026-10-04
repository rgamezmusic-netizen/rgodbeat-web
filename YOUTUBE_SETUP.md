46#56 9Configurar el canal compartido de RGODBEAT

La conexión OAuth queda en el servidor y el token de renovación se cifra antes de guardarlo en Supabase. No pegues claves en el chat, el código del navegador ni GitHub.

## 1. Crear el cliente de Google

En Google Cloud Console, crea o selecciona un proyecto, habilita **YouTube Data API v3** y configura la pantalla OAuth como aplicación web. Agrega el dominio de producción como origen autorizado y esta URI de redirección exacta:

`https://TU-DOMINIO/api/admin/youtube/callback`

Descarga/guarda el Client ID y Client Secret en Vercel, en Preview y Production según corresponda. Autoriza la cuenta propietaria del canal con `YOUTUBE_CHANNEL_ADMIN_EMAIL`.

## 2. Variables privadas en Vercel

- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `YOUTUBE_REDIRECT_URI` (debe coincidir exactamente con Google)
- `YOUTUBE_CHANNEL_ADMIN_EMAIL` (correo exacto de la cuenta autorizada)
- `YOUTUBE_CHANNEL_ID` (ID exacto del canal dedicado; evita conectar por error otro canal del mismo Google account)
- `YOUTUBE_TOKEN_ENCRYPTION_KEY` (32 bytes aleatorios en hexadecimal, 64 caracteres)
- `CLOUDFLARE_R2_YOUTUBE_BUCKET_NAME` (nombre de un bucket R2 privado dedicado a temporales)
- `CLOUDFLARE_R2_YOUTUBE_ACCESS_KEY_ID` y `CLOUDFLARE_R2_YOUTUBE_SECRET_ACCESS_KEY` (credenciales S3 con acceso solo a ese bucket)

Genera la clave de cifrado localmente con `openssl rand -hex 32`. No la agregues a Git. Configura las mismas variables en `.env.local` para desarrollo.

## 3. Base de datos y autorización

Ejecuta `supabase/migrations/20261003000001_youtube_channel.sql` en Supabase. Luego abre `/admin/youtube` con la cuenta cuyo correo coincide con `YOUTUBE_CHANNEL_ADMIN_EMAIL` y conecta el canal.

## Exportar desde el Studio

El botón nuevo descarga el master WAV y, con confirmación del artista, envía una copia temporal en fragmentos pequeños a un bucket R2 privado dedicado. Crea ese bucket en Cloudflare, no habilites su dominio público y genera una clave S3 con acceso a ese bucket únicamente; así no se cambian ni amplían las credenciales de la tienda. Vercel convierte el WAV a MP4 con la portada del beat; también se puede elegir una imagen JPG, PNG o WebP de hasta 4 MB. Los archivos temporales se eliminan al terminar o al fallar el proceso. Agrega una regla de ciclo de vida en Cloudflare para borrar objetos bajo `youtube/exports/` después de un día, para limpiar cargas interrumpidas si el usuario cierra el navegador. El WAV descargado permanece en el dispositivo.

El estado inicial es **no listado**. El artista confirma que tiene los derechos del audio y la imagen. El endpoint limita el canal a 80 intentos diarios para reservar margen dentro de la cuota de carga de YouTube. La función de Vercel de conversión/subida está configurada para un máximo de 300 segundos; los masters grandes o conexiones muy lentas pueden requerir reintentar.

Publica la pantalla de consentimiento OAuth de Google como **Producción**: en estado de prueba, el refresh token de aplicaciones externas con estos permisos vence a los siete días ([regla de Google](https://developers.google.com/identity/protocols/oauth2)). Un proyecto de YouTube API sin auditar puede restringir las cargas a privadas hasta completar la auditoría ([regla de `videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert)). Vercel instala el binario FFmpeg adecuado para Linux desde el lockfile y `next.config.ts` lo incluye en la función de publicación; no hace falta instalar FFmpeg en el panel de Vercel. Configura Google OAuth, R2, las variables de Vercel y aplica la migración de Supabase para activar el botón.

## Prueba inicial desde iPhone

1. Configura las variables en el entorno **Production** de Vercel y vuelve a desplegar. La URI de OAuth debe usar el dominio publicado exacto: `https://TU-DOMINIO/api/admin/youtube/callback`.
2. Entra a `/admin/youtube` con `YOUTUBE_CHANNEL_ADMIN_EMAIL`. El panel muestra si OAuth, la migración, el bucket privado, FFmpeg y la autorización del canal están listos. Ejecuta ahí **Comprobar conexión R2**.
3. En el iPhone, abre el dominio publicado en Safari e inicia sesión con una cuenta que tenga acceso al Studio. Abre el respaldo de cuenta si está guardado ahí; si las tomas solo están en otro dispositivo, pasa el archivo `.rgodbeat` a Archivos en el iPhone e impórtalo en el Studio.
4. En Exportar, publica primero como **No listado**. Revisa el WAV descargado y el vídeo de YouTube. El título sugerido combina el nombre artístico y el beat; el título y la descripción se pueden editar. La descripción automática solo incluye esos nombres y los datos disponibles del beat. La página indica los bytes usados y bloquea la publicación si se supera el límite de YouTube.
5. Mantén Safari abierto hasta que el Studio confirme la subida y muestre el enlace del vídeo.

Las credenciales y el canal OAuth no se pueden completar desde el código: los crea el propietario en Google Cloud y Cloudflare, luego se guardan como variables privadas de Vercel. No subas un vídeo durante el chequeo del panel; usa Exportar cuando quieras probar una publicación real.
