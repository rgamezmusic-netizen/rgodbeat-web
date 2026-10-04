# Configurar el canal compartido de RGODBEAT

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
- `CLOUDFLARE_R2_ACCOUNT_ID` (ID de la cuenta de Cloudflare, usado para formar el endpoint S3)
- `CLOUDFLARE_R2_YOUTUBE_BUCKET_NAME` (nombre de un bucket R2 privado dedicado a temporales)
- `CLOUDFLARE_R2_YOUTUBE_ACCESS_KEY_ID` y `CLOUDFLARE_R2_YOUTUBE_SECRET_ACCESS_KEY` (credenciales S3 con acceso solo a ese bucket)

El bucket dedicado para este flujo se llama `rgodbeat-youtube-temp`. En `/admin/youtube`, el botón **Comprobar conexión R2** verifica desde el servidor que puede escribir, leer y borrar un objeto temporal. No hace falta habilitar acceso público.

Genera la clave de cifrado localmente con `openssl rand -hex 32`. No la agregues a Git. Configura las mismas variables en `.env.local` para desarrollo.

## 3. Base de datos y autorización

Ejecuta `supabase/migrations/20261003000001_youtube_channel.sql` en Supabase. Luego abre `/admin/youtube` con la cuenta cuyo correo coincide con `YOUTUBE_CHANNEL_ADMIN_EMAIL` y conecta el canal.

## Exportar desde el Studio

El botón nuevo descarga el master WAV y, con confirmación del artista, envía una copia temporal en fragmentos pequeños a un bucket R2 privado dedicado. Crea ese bucket en Cloudflare, no habilites su dominio público y genera una clave S3 con acceso a ese bucket únicamente; así no se cambian ni amplían las credenciales de la tienda. Vercel convierte el WAV a MP4 con la portada del beat; también se puede elegir una imagen JPG, PNG o WebP de hasta 4 MB. Los archivos temporales se eliminan al terminar o al fallar el proceso. Agrega una regla de ciclo de vida en Cloudflare para borrar objetos bajo `youtube/exports/` después de un día, para limpiar cargas interrumpidas si el usuario cierra el navegador. El WAV descargado permanece en el dispositivo.

El artista solo escribe el nombre que quiere mostrar. El servidor forma el título `TOP 23 RGODBEAT ft. [nombre]`, usa la categoría Música y prepara descripción y etiquetas con los datos disponibles del beat (estilo, BPM y tonalidad). El estado inicial es **no listado**. El artista confirma los derechos del audio y la imagen y declara si el vídeo está hecho para niños. El endpoint limita el canal a 80 intentos diarios para reservar margen dentro de la cuota de carga de YouTube. La función de Vercel de conversión/subida está configurada para un máximo de 300 segundos; los masters grandes o conexiones muy lentas pueden requerir reintentar.

Publica la pantalla de consentimiento OAuth de Google como **Producción**: en estado de prueba, el refresh token de aplicaciones externas con estos permisos vence a los siete días ([regla de Google](https://developers.google.com/identity/protocols/oauth2)). Un proyecto de YouTube API sin auditar puede restringir las cargas a privadas hasta completar la auditoría ([regla de `videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert)). Vercel instala el binario FFmpeg adecuado para Linux desde el lockfile y `next.config.ts` lo incluye en la función de publicación; no hace falta instalar FFmpeg en el panel de Vercel. Configura Google OAuth, R2, las variables de Vercel y aplica la migración de Supabase para activar el botón.
