# Temporada 1 — comprobación del 6 de octubre de 2026

La base configurada y la API pública de `www.rgodbeat.com/api/rg/rankings`
responden con la temporada 1 activa. Comienza el 5 de octubre de 2026 a las
22:50:15 UTC y termina el 19 de octubre a la misma hora. La temporada 2 ya
está programada del 19 de octubre al 2 de noviembre. No se reinició el calendario.

No hay publicaciones RG verificadas, eventos de puntuación, saldo emitido ni
sponsors. Las tres clasificaciones están vacías y el fondo acumula 0 RG.
Estas comprobaciones no crearon participantes, puntos, pagos ni premios.

El cambio local sustituye el título por «MANTANTE EN EL TOP», elimina los dos
avisos solicitados, muestra «EN CURSO» cuando el estado real es activo y presenta
el fondo numérico, incluido 0 RG. Al cruzar el límite real de la temporada, una
página abierta solicita una actualización al servidor una vez, en lugar de
permanecer indefinidamente en «TEMPORADA CERRADA». Se usa el reloj del servidor
y se vuelve a comprobar al regresar a la pestaña.

Compras, uso de RG y pagos de sponsors siguen apagados en la configuración real.
No hay precio de compra definido ni despacho de pagos RG conectado al webhook
existente. El usuario recibió una pregunta para definir si desea activar esos
pagos, el precio y las opciones de aportación. Quitar textos no conecta pagos.
El cierre automático con métricas de YouTube requiere verificar los secretos
y la ejecución del cron en Vercel; esa conexión no está disponible localmente.

Los cambios de interfaz aún necesitan desplegarse en la web publicada. La
temporada activa sí se comprobó en producción.
