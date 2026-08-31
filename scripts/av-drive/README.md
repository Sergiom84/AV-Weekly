# AV en Google Drive

Copia local del Apps Script de `Tendencias AV_2026`, con dos correcciones
respecto al volcado que estaba en producción el 31/08/2026.

El script vive en la hoja de Tendencias, no en esta app. Pegar `Codigo.gs`
en `Extensiones > Apps Script` sustituye el menú `Informes Unificados`.

| Fichero | Qué es |
| --- | --- |
| `Codigo.gs` | Importación semanal, speeches y volcado Looker. |

## Correcciones de esta copia

**Fila de semanas de Presenciales en `Ubicacion`.** `CONF_UBICACION` leía la
fila 21, que es la cabecera del bloque de resoluciones y deja vacía la
semana 14. El bloque de edificios está en las filas 29–34, con su cabecera
en la 28. `CONF_RESOLUCION` sigue en la 21: esa sí es su cabecera.

**VIDEO y BLUE BRANCH en Remotos.** El volcado y la importación solo
escribían ERRORES, CONEXION y OPERATIVA. VIDEO es una de las filas visibles
por defecto en el deck. Ahora se copian las filas 6 y 8 del template a las
filas 17 y 16 de Tendencias, y el volcado de `Resolucion` las incluye.

Tras pegar el script, ejecutar `Actualizar Looker Studio` una vez para
regenerar `Ubicacion` y `Resolucion` con el eje corregido.

El TXT de intercambio con AV Weekly queda fuera de este cambio: el deck ya
pinta desde la plantilla semanal, la tendencia mensual y el plano.
