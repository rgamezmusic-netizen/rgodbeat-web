#!/bin/zsh -l
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print 'No se encontró Node. Instala Node y vuelve a abrir este archivo.'
  read '?Pulsa Enter para cerrar.'
  exit 1
fi
node --env-file=.env.local --import tsx scripts/sync-companion.ts --watch
if (( $? != 0 )); then
  print 'Consulta el error anterior. Si el servicio automático ya está activo, no necesitas abrir otra copia.'
  read '?Pulsa Enter para cerrar.'
fi
