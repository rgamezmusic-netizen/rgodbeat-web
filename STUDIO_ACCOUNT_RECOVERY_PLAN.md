# Recuperación de cuentas y proyectos de Studio

## Diagnóstico comprobado

La cuenta autorizada se revisó en modo de lectura. `project.json` es válido,
contiene seis pistas y ninguno de sus audios referenciados falta. El espacio
anterior está vacío. No se borró ni modificó el proyecto de la cuenta.

El código anterior reintentaba indefinidamente y confundía cualquier proyecto
remoto con un conflicto. Un manifiesto anterior dañado podía impedir consultar
el proyecto actual. La configuración local de R2 y Supabase responde; esto no
demuestra que el entorno publicado tenga las mismas variables o permisos.

## Cambios implementados

1. Verificar la sesión antes de reconectar y renovarla una vez cuando falta.
   Pedir iniciar sesión si no se recupera. Detener reintentos permanentes y
   limitar los temporales a tres; mantener un botón manual.
2. Identificar el proyecto y su revisión confirmada. Reanudar el mismo respaldo
   y conservar el local cuando otro dispositivo cambió la copia remota.
3. Mostrar dos espacios independientes de nube. Al guardar, pedir nombre y
   destino; identificar el proyecto que se eliminará y exigir confirmación si
   es otro proyecto. Actualizar el espacio elegido con su revisión consultada:
   un conflicto obliga a consultar y elegir de nuevo. El otro espacio se conserva.
   Crear un proyecto nuevo solo archiva la copia local; no rota ni borra la nube.
   El autoguardado de un proyecto nuevo espera la primera elección explícita.
4. Recuperar los audios disponibles y avisar de los que faltan. Una descarga
   interrumpida, una cuenta distinta o un fallo de permisos no significan pérdida.
   Las consultas y descargas tienen un tiempo máximo.
5. Proteger localmente el proyecto antes de crear, importar o recuperar otro.
   Permitir iniciar un proyecto local cuando la nube falla y recuperar la copia
   anterior del dispositivo. Salir después de guardar localmente aunque la nube
   siga pendiente.
6. Mostrar «Guardar en dispositivo» para descargar archivos `.rgodbeat` con beat,
   voces y ajustes. Explicar brevemente el límite de dos proyectos en la nube.
7. El autoguardado local ya no inicia reintentos adicionales de conexión. Descargar
   cuando la nube falla activa el trabajo en dispositivo y pausa las consultas;
   la elección se recuerda para esa cuenta y proyecto al reabrir Studio. «Conectar
   nube» permite reanudar explícitamente. Los fallos del servidor incluyen una
   referencia para correlacionar el aviso del móvil con los registros de producción.

## Verificación

Última revisión: compilación de producción correcta, 19 pruebas de servidor/cliente
y 20 casos de navegador en Chrome/WebKit correctos. Regresión de Nuevo Proyecto
correcta. ESLint sin errores; conserva advertencias previas del proyecto.

- Pruebas de servidor y cliente: sesión, límites de reintento, permisos, manifiestos
  dañados, revisiones, audio faltante, descarga detenida y conservación de ambos espacios.
- Chrome y WebKit con API aislada: reconexión, inicio de sesión requerido, descarga
  real del archivo, edición del segundo espacio, recuperación parcial y trabajo
  local sin bucles ni pérdida de la voz abierta.
- R2 real con un prefijo temporal aislado: guardar, leer, reutilizar audio, rechazar
  revisiones antiguas y conservar los dos espacios. Los objetos de prueba se retiraron.
- Regresión de «Nuevo Proyecto»: modal inicial, menú, cancelación, conservación local
  ante fallo de nube y conservación de ambos espacios al crear un proyecto nuevo.
- Guardado en móvil: nombre persistente, espacio vacío, cancelación y reemplazo
  confirmado de espacio ocupado, conflicto de otra sesión y reintento tras fallo.

Las pruebas de navegador usan cuentas ficticias y respuestas controladas. No
constituyen una comprobación autenticada del despliegue de producción.

## Paso pendiente en producción

Publicar estos cambios y verificar `rgodbeat.com` con una sesión autenticada de la
cuenta afectada: consultar ambos respaldos, recuperar audio y crear un proyecto
nuevo. Si la conexión sigue fallando, revisar el estado HTTP y los registros del
despliegue y sus variables de R2/Supabase. No atribuir el fallo a datos dañados: el
proyecto de la cuenta revisada está sano.

## Limpieza excepcional

`scripts/repair-studio-account.mjs --email=…` solo inspecciona. `--repair` permite
retirar referencias confirmadas como dañadas o perdidas, con copia del manifiesto
original y escritura condicionada a su revisión. No elimina los audios. No fue
necesario ejecutarlo en modo de reparación para la cuenta autorizada.
