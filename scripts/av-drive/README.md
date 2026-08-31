# AV en Google Drive

Copia local del Apps Script de `Tendencias AV_2026`. Pegar `Codigo.gs` en
`Extensiones > Apps Script` sustituye el menú por `⭐ AV Weekly`.

| Fichero | Qué es |
| --- | --- |
| `Codigo.gs` | Procesar semana, TXT, Looker y speeches. |

El formato del TXT lo declara
[`shared/modules/av/texto.ts`](../../shared/modules/av/texto.ts)
y lo lee [`server/parseAvTexto.ts`](../../server/parseAvTexto.ts).

## Cada semana

1. Dejar el template en la carpeta de buzón.
2. `⭐ AV Weekly > Procesar semana`. Hidrata Tendencias, actualiza Looker y
   deja `AV 2026-S35.txt` (o la semana que toque) en la misma carpeta.
3. Descargar ese TXT y subirlo en `Audiovisuales > Texto plano (Drive)`.

`Guardar PLANO como .txt en la carpeta` regenera el fichero sin volver a
importar. `Actualizar Looker Studio` solo sirve al informe de Looker; la app
ya no lo necesita.

## Correcciones respecto al script anterior

**Fila de semanas de Presenciales en `Ubicacion`.** `CONF_UBICACION` leía la
fila 21 (bloque de resoluciones, semana 14 vacía). El bloque de edificios
usa la fila 28. `CONF_RESOLUCION` sigue en la 21.

**VIDEO y BLUE BRANCH en Remotos.** Se copian las filas 6 y 8 del template a
las filas 17 y 16 de Tendencias, y el volcado de `Resolucion` las incluye.
