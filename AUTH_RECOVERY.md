# Acceso y recuperación de contraseña

## Cuenta propietaria consultada el 4 de octubre de 2026

La cuenta `gamezinmusic@gmail.com` existe en Supabase Auth, está confirmada y tiene `app_metadata.role = admin`. La configuración local de `YOUTUBE_CHANNEL_ADMIN_EMAIL` coincide con ese correo. No se cambió el correo, el rol ni la contraseña durante esta reparación del código. Las variables de producción de YouTube necesitan coincidir con esta cuenta para configurar el canal.

## Flujo corregido

1. En `/login`, escribe el correo y pulsa **¿Olvidaste tu contraseña?**, o abre `/reset-password` y solicita un enlace.
2. La web solicita el correo a Supabase mediante `/api/auth/recover`, usando la clave pública y el servicio de recuperación de Supabase.
3. Abre el correo más reciente. El enlace nuevo no depende de la cookie de otro navegador. Los enlaces antiguos que contienen un código PKCE siguen necesitando el navegador donde se solicitaron.
4. La página procesa el enlace, confirma la sesión con Supabase y muestra el correo de la cuenta antes de aceptar la contraseña nueva.
5. Introduce y confirma una contraseña de al menos ocho caracteres. Los requisitos adicionales del proyecto los valida Supabase.
6. Tras guardar, vuelves al destino solicitado. Si no había uno, el administrador vuelve a `/admin` y el cliente a `/account`.

Se aceptan enlaces de recuperación con tokens en el fragmento, códigos PKCE y `token_hash`. El intercambio se comparte entre los componentes para evitar consumir dos veces el mismo enlace. Los parámetros de autenticación se retiran de la barra de direcciones y la página de contraseña utiliza `no-referrer`.

La pantalla de enlace vencido ahora incluye el campo de correo y el botón para pedir otro enlace. Los errores de contraseña débil, contraseña repetida, sesión vencida, conexión y exceso de intentos tienen mensajes distintos. La pantalla sirve a todas las cuentas y ya no se identifica como exclusiva de administradores.

Los destinos de navegación se restringen al propio sitio y se conservan las cookies de sesión al redirigir desde middleware.

## Correo y vencimiento

Supabase controla el envío, la duración de los enlaces y los límites de solicitudes. Una respuesta de envío aceptada no confirma la entrega al buzón. Si el correo tarda, revisa Spam y abre el enlace más reciente; una solicitud posterior puede reemplazar el enlace anterior.

La configuración del servidor de correo, Site URL, URL permitidas y duración de los enlaces se administra en Supabase. Esta sesión tiene acceso al catálogo/Auth mediante la clave de servicio existente, pero no una sesión de Management API ni acceso al dashboard para modificar esa configuración. Los cambios del código no aumentan la duración configurada ni sustituyen un proveedor de correo.

Opcionalmente, la plantilla **Reset password** de Supabase puede utilizar:

```html
<a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">Cambiar contraseña</a>
```

El código incluye el procesamiento de esa plantilla, pero no se modificó la plantilla remota. Para la plantilla estándar con `ConfirmationURL`, se procesa la sesión que devuelve Supabase.

Documentación de referencia: [contraseñas de Supabase](https://supabase.com/docs/guides/auth/passwords), [plantillas de correo](https://supabase.com/docs/guides/auth/auth-email-templates).

## Comprobaciones y publicación

TypeScript, ESLint de los archivos de recuperación y compilación de producción completaron correctamente. La compilación conserva las advertencias previas de middleware y de rutas dinámicas. No se ejecutaron scripts que cambian contraseñas o crean cuentas de prueba.

La reparación está preparada en el código local. La publicación de esta ronda fue autorizada; falta confirmar la versión pública y generar un enlace nuevo para la cuenta propietaria. No se afirma que un enlace vencido se haya restaurado ni que se haya comprobado una contraseña que el usuario no proporcionó.
