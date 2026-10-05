# AV en Google Drive

Copia local del Apps Script de `Tendencias AV_2026`. Pegar `Codigo.gs` en
`Extensiones > Apps Script` sustituye el menú por `⭐ AV Weekly`.

| Fichero | Qué es |
| --- | --- |
| `Codigo.gs` | Procesar semana, TXT, Looker y speeches. |

El formato del TXT lo declara
[`shared/modules/av/texto.ts`](../../shared/modules/av/texto.ts)
y lo lee [`server/parseAvTexto.ts`](../../server/parseAvTexto.ts).

## Carpetas

| Carpeta | ID | Uso |
| --- | --- | --- |
| [Bruto](https://drive.google.com/drive/folders/1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW) | `ID_CARPETA_TEMPLATES` | Templates semanal y mensual |
| [Carpeta de Tendencias](https://drive.google.com/drive/folders/1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR) | `ID_CARPETA_TXT` | TXT para AV Weekly |
| [histórico AV - txt](https://drive.google.com/drive/folders/10beuK3so7X4lHMVuWKQ4azWJDq7My99E) | `ID_CARPETA_HISTORICO_TXT` | TXT anteriores, nunca se borran |

Solo se abren Google Sheets: un `.xlsx` hay que abrirlo antes con
`Abrir con > Hojas de cálculo de Google`. El tipo lo decide el nombre y, si
hay varios del mismo tipo, se usa el más reciente:

| Nombre | Tipo |
| --- | --- |
| Empieza por `Templates semanales` o contiene `semanal` | Semanal |
| Empieza por `Audiovisuales - Resuelta…` o contiene la palabra `mes` | Mensual |

## Cada semana

1. Dejar el template en la carpeta Bruto.
2. `⭐ AV Weekly > Procesar semana`. Rellena todas las semanas del template que
   estén vacías en Tendencias (las que ya tienen datos no se tocan), actualiza
   Looker y deja `AV 2026-S40.txt` (la última semana) en la carpeta de
   Tendencias. Las pestañas de detalle (7 a 10) solo traen la última semana:
   las anteriores llevan ubicaciones y categorías de Remotos, sin resoluciones.
3. Descargar ese TXT y subirlo en `Audiovisuales > Texto plano (Drive)`.

## Cada mes

1. Dejar `Audiovisuales - Resueltas mes anterior` en la carpeta Bruto. Puede
   haber uno por mes (por ejemplo agosto y septiembre): se procesan todos.
2. `⭐ AV Weekly > Procesar mes`. Cuenta los tickets cerrados de cada mes, en la
   zona horaria del propio fichero, enseña
   los cinco valores, avisa si el fichero no cubre el mes entero o si ya había
   otros valores, y solo escribe tras confirmar. Después deja el TXT.

| Ticket | Pestaña |
| --- | --- |
| Grupo `SOPORTE WEBEX` | Remotos |
| Modulo `SOPORTE PROGRAMADO` | Programados |
| Modulo `SOPORTE PRESENCIAL` | Presenciales |
| Modulo `MANTENIMIENTO CORRECTIVO` | Correctivos |
| Modulo `MANTENIMIENTO` | No se cuenta |
| Cualquier otro módulo de `AUDIOVISUALES` | Incidencias |

La equivalencia se validó con septiembre de 2026: las semanas 37-39 del
fichero mensual coinciden tipo a tipo con el template semanal.

## La app no pisa lo que ya tiene

Subir un TXT solo añade lo que falta: semanas sin tickets, meses vacíos y
semanas de resolución nuevas. Lo ya guardado se conserva aunque el TXT traiga
otros números, para que un template incompleto no borre datos buenos. Un TXT
de otro año empieza el semanal de cero.

`Guardar PLANO como .txt en la carpeta` regenera el fichero sin volver a
importar. `Actualizar Looker Studio` solo sirve al informe de Looker; la app
ya no lo necesita.

## Correcciones respecto al script anterior

**Fila de semanas de Presenciales en `Ubicacion`.** `CONF_UBICACION` leía la
fila 21 (bloque de resoluciones, semana 14 vacía). El bloque de edificios
usa la fila 28. `CONF_RESOLUCION` sigue en la 21.

**VIDEO y BLUE BRANCH en Remotos.** Se copian las filas 6 y 8 del template a
las filas 17 y 16 de Tendencias, y el volcado de `Resolucion` las incluye.

**Etiquetas de Remotos.** El template ordena las categorías por volumen, así
que sus filas cambian de una semana a otra. ERRORES, OPERATIVA, CONEXION,
VIDEO y BLUE BRANCH se buscan por etiqueta, no por número de fila.

## Qué impide que se vuelva a perder una semana

- **Los TXT no se borran.** Al generar uno nuevo, los anteriores pasan a
  `histórico AV - txt`. Cada TXT lleva el detalle de resoluciones de todas las
  semanas hasta la suya.
- **Recuperación.** `Procesar semana` busca semanas con ubicaciones pero sin
  detalle de resolución y lo rellena desde el TXT archivado más reciente que lo
  tenga. Solo escribe en celdas vacías.
- **Revisión.** Al terminar, `Procesar semana` lista las semanas vacías o sin
  detalle. `Procesar mes` compara su conteo por semana con Tendencias en las
  semanas completas del mes y avisa de las que no cuadran (en Remotos una
  diferencia pequeña es normal: Tendencias solo guarda cinco categorías).
- **La app guarda copia de cada subida** (fichero y estado anterior de las
  tablas) en Turso. Ver `scripts/copias-seguridad.ts`.
