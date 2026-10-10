# Home, Servicios y precarga progresiva

## Cambios

- Se retiró `CATALOG // LATEST WORKS / Latest Releases` del home. Las pistas, su reproducción y su compra permanecen en `/beats`.
- El home ya no consulta el catálogo ni fuerza renderizado dinámico. La compilación de producción lo genera como página estática. Los accesos por género se conservan sin mostrar contadores ficticios.
- Servicios utiliza una sola configuración (`lib/data/services.ts`) en el home y en `/services`. Se conservaron los importes publicados previamente: producción desde $350 USD, mix y master desde $180 USD, desarrollo artístico $600 USD/mes y audiovisual desde $500 USD. No son tarifas nuevas confirmadas por el propietario.
- Se aclaran modalidad de cobro, entregables propios de cada servicio y plazos de referencia. Alcance, revisiones, derechos y fecha se confirman en la cotización. Los enlaces de consulta preparan un correo con el servicio y la tarifa publicada, en lugar de apuntar a un ancla inexistente en `/services`.
- Se mantiene la distinción entre grabación presencial en Austin, mix y master remoto, organización en The Park y la app Studio. No se inventó un precio para grabar en Austin ni se modificaron los productos de checkout.
- Tras la carga inicial, las rutas públicas principales se preparan en periodos de inactividad. Al desplazarse al menos un tercio de la ventana (máximo 240 px), se amplía la cola a las herramientas públicas de The Park y al código de Studio, carrito y reproductor. No se montan esas herramientas ni se reproducen audios por precargarlas.
- El scroll activo, una pestaña oculta, una conexión limitada o el ahorro de datos detienen nuevas descargas opcionales. No se precargan flujos privados, pagos ni páginas de cuenta. Las rutas caducadas se renuevan usando la caché de Next.

## Verificación local

- `npm run build`: correcto; `/` aparece como estático.
- TypeScript, ESLint de los módulos modificados y `git diff --check`: correctos.
- `tests/load-performance-browser.mjs`: correcto. Comprueba ausencia de previews en home, reproducción/pausa/reanudación/seek en Beats y apertura/reapertura del carrito.
- `tests/adaptive-load-browser.mjs`: correcto. Comprueba precarga después del scroll sin audio, igualdad de las cuatro tarjetas de Servicios, enlaces de consulta, ahorro de datos y contenido/herramientas de The Park a 390 y 1440 px.
- `tests/navigation-preload-browser.mjs`: correcto a 390 y 1440 px. Comprueba reutilización de rutas sin nuevas consultas al navegar, conservación de filtros y pestaña seleccionada, renovación de caché y ausencia de solicitudes de micrófono o contextos de audio.
- Revisión visual de Servicios a 390 y 1440 px; sin desbordamiento horizontal en móvil. Capturas locales en `/tmp/rg-adaptive-load/services-390.png` y `services-1440.png`.
- Revisión general con `node --test tests/*.test.mjs`: 149 pruebas correctas. Dos archivos de pruebas SQL (`rg-phase2-sql` y `studio-signup-promotion`) no pudieron iniciar porque falta `RG_TEST_PGLITE_MODULE` y no está presente la instalación aislada de PGlite documentada. No se modificó SQL ni se utilizó una base de datos real para esta tarea.

Estas comprobaciones usan el servidor de producción local. No constituyen una medición de velocidad del alojamiento público ni un despliegue.
