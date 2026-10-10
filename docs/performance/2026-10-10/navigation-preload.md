# Precarga de secciones y conservación de la navegación

Fecha: 2026-10-10. Cambios locales; no publicados en el dominio.

## Problema observado

Las rutas dinámicas usaban precarga automática hasta la pantalla de carga y el tiempo de conservación de páginas dinámicas era cero. En una sesión local de producción, TOP 23 y el catálogo hicieron una nueva petición de datos en cada clic, incluso al volver: 871/820 ms para TOP 23 y 815/814 ms para el catálogo. Son tiempos de la acción completa del navegador, no una medición de usuarios en producción.

## Comportamiento implementado

- Precarga completa de los enlaces principales y de los detalles de beats/perfiles visibles.
- Cola persistente para preparar TOP 23, catálogo, portada, The Park, Studio, descarga, servicios, biografía y herramientas de The Park, aunque el menú móvil esté cerrado.
- Conservación de las páginas en la caché nativa de Next durante cinco minutos. La cola vuelve a consultar esa caché cada 30 segundos: las entradas válidas se reutilizan y las vencidas se preparan en segundo plano.
- Trabajo adicional espaciado mediante `requestIdleCallback` después de cargar la página. Pausa cuando la pestaña está oculta o sin conexión; no mantiene la cola mientras se graba en Studio ni en las rutas de cuenta o checkout.
- Importación anticipada del código de Studio, carrito y reproductor sin montarlos. Los audios no se descargan antes de pulsar reproducir.
- Búsqueda, género, orden del catálogo y pestaña de TOP 23 conservados en memoria de esta pestaña del navegador. No es almacenamiento permanente ni modo sin conexión.
- Navegación interna hacia acceso de artistas mediante el router, conservando el documento.
- Sincronización ligera con la hora del servidor para evitar que una temporada precargada parezca seguir activa después de cerrar. No depende del reloj del dispositivo.
- Los botones de reintento solicitan datos nuevos mediante `router.refresh()`, para evitar reutilizar una respuesta de error guardada.

## Verificación

- Compilación de producción y TypeScript correctos; ESLint de los archivos modificados sin errores ni advertencias.
- 26 pruebas de ranking y producto RG correctas.
- Prueba aislada del reloj: reloj del teléfono incorrecto, cambio de temporada, pestaña oculta, ausencia de bucles y temporada precargada que ya venció.
- `tests/navigation-preload-browser.mjs`: navegador de producción a 390 y 1440 px, con 600 ms de latencia añadida a las peticiones de rutas. Verifica precarga antes del clic, navegación y retorno sin peticiones nuevas para esas páginas ni pantallas de carga, conservación de pestaña/búsqueda/orden/género, un solo documento y renovación en segundo plano tras adelantar 310 segundos el reloj del navegador. También verifica que no se inicialice audio ni se solicite micrófono durante la precarga.
- `tests/load-performance-browser.mjs`: reproducción de un preview real, pausa, reanudación, avance y apertura/reapertura del carrito; sin descarga de audio antes de reproducir.

Estos resultados corresponden a la vista previa local. Una primera visita o un clic antes de terminar la precarga todavía depende de la conexión y del servidor.
