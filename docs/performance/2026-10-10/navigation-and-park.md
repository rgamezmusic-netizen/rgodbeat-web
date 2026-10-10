# Navegación, reproducción y The Park

Cambios locales del 10 de octubre de 2026 sobre `a746214`. No se ha publicado esta versión.

## Cambios comprobados

- El contador del reproductor tiene una suscripción separada. Las tarjetas, el ranking, los overlays y el fondo ya no reciben cada actualización de progreso del audio. Los controles del reproductor y el detalle del beat conservan sus datos de progreso.
- Las tarjetas publican el movimiento del cursor mediante un contexto de acciones estable; no se suscriben al movimiento de todas las demás tarjetas.
- Studio, carrito y reproductor preparan su código al acercar el cursor o enfocar sus controles, en conexiones que permiten trabajo anticipado. No se importa automáticamente el DAW completo por permanecer en la portada. Al abrir estas funciones, se mantiene su carga bajo demanda en cualquier conexión.
- La cola de páginas y los enlaces del menú evitan precargas opcionales cuando el navegador informa ahorro de datos, 2G/3G, menos de 1,5 Mb/s o falta de conexión. Los enlaces siguen navegando y los accesos principales de la portada mantienen su comportamiento existente. Esto no convierte la web en una aplicación sin conexión.
- Las herramientas de documentos, registros, perfiles y proyectos de The Park se preparan al entrar en esa área. Las secciones principales mantienen su precarga y caché de navegación. La sincronización pequeña del reloj se conserva también con ahorro de datos para mantener correctas las fechas de temporadas precargadas.
- La portada, `/the-park` y `/park` distinguen grabación presencial en Austin y mix y master a distancia. Los contactos usan el correo existente. Se conserva la información previa y los accesos de organización; no se añaden precios, calendarios ni reservas ficticias. El botón de residencia también usa el correo, evitando un ancla de contacto inexistente en `/the-park`.
- Se libera el listener de movimiento reducido en dispositivos táctiles al desmontar el fondo, conservando la compatibilidad con navegadores sin `removeEventListener` en `MediaQueryList`.

## Verificación

`npm run build` termina correctamente, incluida la comprobación de TypeScript. Pasan 63 pruebas existentes de autenticación, cumplimiento de compras, webhooks, ranking y producto RG, ejecutadas con dependencias externas sustituidas por fixtures; no se efectuaron compras ni cambios de cuentas.

La prueba existente de carga verifica WebP, imágenes responsivas, scripts asíncronos, preview real al pulsar play, pausa, reanudación, avance, carrito y conservación de artículos al reabrirlo. La navegación se comprueba a 390 y 1440 px con latencia añadida: un solo documento, filtros y pestañas conservados, ausencia de pantallas de carga en rutas preparadas y renovación al vencer la caché. El escenario de precarga fija una señal de conexión rápida; los escenarios de ahorro de datos y conexión lenta se verifican por separado.

`tests/playback-rendering-browser.mjs` comprueba que un evento de avance del audio actualiza el contador sin renderizar de nuevo la tarjeta ni el fondo; también verifica volumen, aislamiento del hover y políticas de red. `tests/adaptive-load-browser.mjs` comprueba que el módulo de Studio no se descarga por permanecer en la portada, que se prepara al acercarse a su acceso y que The Park mantiene servicios, contactos, herramientas y anchura correcta en móvil y escritorio. `tests/rg-season-clock-browser.mjs` verifica reloj del servidor, cambio de temporada, regreso a la pestaña y datos precargados que vencieron.

Los archivos nuevos y los módulos centrales modificados pasan ESLint. Comparando cada archivo editado con su versión original, no se introducen diagnósticos: permanecen dos errores previos (`set-state-in-effect`) en el dashboard de The Park y el fondo atmosférico, y 16 advertencias previas. Se elimina una advertencia de dependencia en el reproductor.

## Medición

Comparación local de tres ejecuciones por ruta antes y después, con Chrome, producción de Next.js, viewport 390 × 844, DPR 3, descarga 1,6 Mb/s, latencia 150 ms y CPU ralentizada cuatro veces. Cada ejecución usa un contexto nuevo sin caché del navegador y un servidor caliente. Se observan ocho segundos desde `DOMContentLoaded`, antes de desplazar la página. Las mediciones finales se ejecutan sin otras pruebas de navegador simultáneas.

La precarga puede avanzar más o menos dentro de esa ventana y Chrome puede cambiar su estimación de red; los bytes son los recibidos durante la ventana, no el tamaño completo de todo el sitio. Las cifras no son una puntuación Lighthouse ni mediciones del dominio publicado. El aislamiento de actualizaciones de React se verifica con contadores de renderizado, no se deduce del LCP.

Medianas de las tres ejecuciones; una reducción negativa indica un aumento.

| Ruta | Métrica | Antes | Después | Reducción |
| --- | --- | ---: | ---: | ---: |
| `/` | FCP | 904.0 ms | 884.0 ms | +2.2 % |
| `/` | LCP | 1264.0 ms | 1240.0 ms | +1.9 % |
| `/` | Evento load | 1950.0 ms | 1948.3 ms | +0.1 % |
| `/` | Datos recibidos | 534.2 KiB | 441.6 KiB | +17.3 % |
| `/` | JavaScript recibido | 310.0 KiB | 262.4 KiB | +15.4 % |
| `/beats` | FCP | 920.0 ms | 924.0 ms | -0.4 % |
| `/beats` | LCP | 1260.0 ms | 1264.0 ms | -0.3 % |
| `/beats` | Evento load | 3478.4 ms | 3487.3 ms | -0.3 % |
| `/beats` | Datos recibidos | 797.8 KiB | 788.0 KiB | +1.2 % |
| `/beats` | JavaScript recibido | 302.9 KiB | 298.4 KiB | +1.5 % |

La portada recibe un 17,3 % menos de datos y un 15,4 % menos de JavaScript en esta ventana. En el catálogo la reducción de datos es de aproximadamente un 1,2 %. El LCP se mantiene próximo al original en ambas rutas; estas pruebas no demuestran una mejora grande del primer contenido visible. Las seis ejecuciones finales registran CLS = 0, ningún error de ejecución y cero solicitudes de audio antes de reproducir.

Datos por ejecución y condiciones: [navigation-and-park-measurements.json](navigation-and-park-measurements.json). Los registros completos y capturas locales de esta sesión están en `/tmp/rg-optimize-before`, `/tmp/rg-optimize-final` y `/tmp/rg-adaptive-load`.
