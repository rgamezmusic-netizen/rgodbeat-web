Optimización de carga de RGODBEAT, medida el 10 de octubre de 2026.

La portada reduce el tiempo hasta el evento `load` un 34,6 % y los datos recibidos un 34,2 %. El catálogo reduce los datos recibidos un 60,1 %. El contenido principal visible (LCP) mejora un 8,3 % en la portada y permanece igual en el catálogo en estas pruebas.

Se sustituyeron las imágenes de la interfaz y los fondos del catálogo por `next/image`, con compresión de calidad 75, negociación de WebP, `srcset`, `sizes` y carga diferida. El logotipo visible de navegación tiene prioridad alta; las demás imágenes usan `loading="lazy"`. Next.js transforma y cachea las variantes al servirlas. Los archivos originales se conservan.

Las previsualizaciones usan `preload="none"`; el reproductor global asigna la URL al pulsar play. El control de previsualización del editor de beats también usa `preload="none"`. El carrito y la interfaz del reproductor se importan al utilizarlos. El carrito permanece montado después de abrirlo por primera vez para conservar su estado. Los scripts de Next.js ya se sirven con `async`; el polyfill `nomodule` no se ejecuta en el navegador moderno usado en la prueba.

| Página | Métrica | Antes | Después | Reducción |
| --- | --- | ---: | ---: | ---: |
| `/` | Primer contenido (FCP) | 1108 ms | 1016 ms | 8.3 % |
| `/` | Contenido principal visible (LCP) | 1108 ms | 1016 ms | 8.3 % |
| `/` | Evento load | 3302 ms | 2160 ms | 34.6 % |
| `/` | Datos recibidos | 632.1 KB | 415.8 KB | 34.2 % |
| `/` | Datos de imágenes | 270.8 KB | 64.6 KB | 76.1 % |
| `/` | JavaScript recibido | 260.4 KB | 249.4 KB | 4.2 % |
| `/beats` | Primer contenido (FCP) | 1064 ms | 1064 ms | 0.0 % |
| `/beats` | Contenido principal visible (LCP) | 1064 ms | 1064 ms | 0.0 % |
| `/beats` | Evento load | No ocurrió durante la ventana | 3656 ms | No comparable |
| `/beats` | Datos recibidos | 1733.8 KB | 691.0 KB | 60.1 % |
| `/beats` | Datos de imágenes | 1423.7 KB | 363.6 KB | 74.5 % |
| `/beats` | JavaScript recibido | 260.2 KB | 249.7 KB | 4.0 % |

Se observaron cero solicitudes de audio antes de play y CLS = 0 en las seis ejecuciones de cada versión. No hubo errores de ejecución de JavaScript. La igualdad del LCP del catálogo indica que no hay mejora medida de ese indicador; no debe confundirse la reducción de datos con una mejora equivalente del primer contenido visible.

Las cifras son medianas de tres ejecuciones por página, sobre una compilación local de producción (`next build --webpack` y `next start`), con Chrome sin interfaz, viewport de 390 × 844, DPR 3, descarga de 1,6 Mb/s, latencia de 150 ms y CPU ralentizada 4 veces. Cada ejecución usa un contexto nuevo y caché del navegador desactivada; el servidor está caliente. Las mediciones finales se ejecutaron sin otras pruebas de navegador simultáneas. La referencia corresponde al código del commit `b6a1241c456a71e05521652e01dfe774aa3d7a82`.

Los bytes incluyen las respuestas y descargas en curso durante ocho segundos después de `DOMContentLoaded`, antes de las capturas y sin desplazamiento ni interacción. En el catálogo original, varias portadas aún se descargaban al terminar esa ventana: `load = 0` significa que el evento todavía no había ocurrido, no un tiempo de carga de cero. El evento `load` tampoco representa la descarga de todos los recursos diferidos. Son mediciones de laboratorio local, no resultados del sitio desplegado ni una puntuación de Lighthouse.

La compilación de producción y TypeScript pasan. La prueba de navegador comprueba WebP, imágenes responsivas y diferidas, scripts asíncronos, descarga de JavaScript del carrito al abrirlo, audio al pulsar play, pausa, reanudación, desplazamiento en el audio y conservación de artículos al reabrir el carrito. Los textos y las cajas de navegación, títulos, párrafos, secciones y tarjetas coinciden en las páginas `/` y `/beats`, a 390 y 1440 píxeles; se revisaron las capturas del inicio y de la galería. Las estrellas animadas existentes cambian de posición entre capturas. ESLint conserva 11 errores y 32 advertencias previos en los archivos modificados; no se añadieron diagnósticos nuevos.

Datos originales: [antes](before.json), [después](after.json), [medianas](summary.json) y [comprobación de diseño](layout-verification.json).

Para repetir la medición, iniciar el servidor de producción en el puerto 3100 y ejecutar lo siguiente con una instalación disponible de Playwright y Google Chrome:

```sh
RG_PERF_PLAYWRIGHT_MODULE=/ruta/absoluta/playwright/index.mjs node scripts/measure-load.mjs /tmp/rg-performance
RG_PERF_PLAYWRIGHT_MODULE=/ruta/absoluta/playwright/index.mjs node tests/load-performance-browser.mjs
```

`RG_PERF_URL` permite medir otra URL y `RG_PERF_RUNS` cambiar el número de repeticiones. Si Playwright está instalado en el proyecto, puede omitirse `RG_PERF_PLAYWRIGHT_MODULE`.
