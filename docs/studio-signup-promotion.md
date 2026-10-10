# Promoción de nuevas cuentas: 90 días de RG Studio

Activada y verificada en producción el 10 de octubre de 2026 a las 03:58:34 UTC (9 de octubre, 22:58:34 en Chicago). Cierra el 9 de noviembre de 2026 a las 03:58:34 UTC (8 de noviembre, 21:58:34 en Chicago). Aviso publicado en `https://www.rgodbeat.com/login?mode=signup`; el endpoint público devolvió `active: true` después de publicar.

La migración de esta promoción se aplicó individualmente con `supabase db query --linked --file …`. El historial remoto ya tenía diferencias con los archivos locales; no se ejecutó `db push --include-all` ni se reaplicaron migraciones anteriores.

Aplicar `supabase/migrations/20261012000000_studio_signup_promotion.sql` después de las migraciones existentes. Requiere `auth.users.created_at`, el puente comercial `rg_commerce_link_verified_customer` y `rg_extend_studio_access`.

Antes de aplicar, ejecutar `supabase/preflight/20261012000000_studio_signup_promotion.sql`: todos los valores `ready` deben ser verdaderos. Después, comprobar `supabase/verify/20261012000000_studio_signup_promotion.sql`.

La primera aplicación inicia una única ventana de 720 horas (30 días). La fecha real de creación en Supabase Auth determina la elegibilidad: inicio incluido, fin excluido. Las cuentas anteriores quedan fuera. No se reinicia al publicar de nuevo ni al repetir la migración.

Al confirmar el correo se añaden 90 días al acceso existente, o se activan 90 días desde ese momento si no hay un pase vigente. También funciona si el correo se confirma después de cerrar la campaña. No requiere tarjeta ni crea una suscripción o cobro. No otorga licencias de beats.

La concesión y su registro son una sola transacción. Repetir la confirmación, iniciar sesión o recrear una cuenta con un correo ya premiado no concede otros 90 días. Los registros de concesión se conservan al borrar cuentas para evitar duplicados.

El aviso del registro consulta la campaña en la base de datos, se oculta al terminar y no se muestra si falta la migración o no se puede verificar la oferta.

Comprobar la activación con:

```sql
SELECT * FROM public.rg_signup_studio_campaign_status();
SELECT count(*) AS grants FROM public.studio_signup_grants;
```

Validación aislada (sin acceder a la base de producción):

```sh
RG_TEST_PGLITE_MODULE=/private/tmp/rg-signup-promo-test/node_modules/@electric-sql/pglite/dist/index.js node --test tests/studio-signup-promotion.test.mjs
```
