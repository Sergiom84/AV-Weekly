# AV en Google Drive

Apps Script modular de `Tendencias AV_2026`. Sustituir el proyecto de
`Extensiones > Apps Script` por los ficheros `00_*.gs` a `07_*.gs` activa el
menú `⭐ AV Weekly`.

## Estructura modular (casa vs trabajo)

| Fichero | Qué contiene | Cuándo se toca |
| --- | --- | --- |
| `00_Entorno_IDs.gs` | **Solo IDs de carpetas y libro.** | Nunca tras configurarlo en cada Drive. |
| `01_Config_y_Menu.gs` | Rangos de pestañas, bloques y menú `⭐ AV Weekly`. | Solo si cambia la estructura de `Tendencias`. |
| `02_Importacion_Semanal.gs` | Lectura multi-template semanal (`Bruto`) sin pisar datos previos. | Cambios en importación semanal. |
| `03_Procesar_Mes.gs` | Conteo mensual (`Audiovisuales - Resueltas…`) y multianual 2026. | Cambios en cierre mensual. |
| `04_Eventos_Extraordinarios.gs` | Sincronización de `Eventos AV 2026` hacia `Eventos Extr.`. | Cambios en eventos/instalaciones. |
| `05_Exportacion_TXT_Looker.gs` | Tablas `Ubicacion`/`Resolucion`, `.txt` plano e histórico. | Cambios en Looker o contrato `.txt`. |
| `06_Speeches_Datos.gs` | Lectura de métricas y formateo para speeches. | Ajustes de datos de speeches. |
| `07_Speeches_Informes.gs` | Orquestador y plantillas de Sergio (HTML) y Carlos (texto). | Ajustes de redacción del speech. |
| `trabajo/00_Entorno_IDs.gs` | Plantilla de `00_Entorno_IDs.gs` con los IDs del entorno de trabajo. | Solo referencia para el trabajo. |

En Google Apps Script todos los `.gs` comparten el mismo ámbito global. Para
actualizar el entorno de trabajo sin riesgo, **deja intacto `00_Entorno_IDs.gs`**
y copia únicamente los `.gs` modificados (`01` a `07`).

El formato del TXT lo declara
[`shared/modules/av/texto.ts`](../../shared/modules/av/texto.ts)
y lo lee [`server/parseAvTexto.ts`](../../server/parseAvTexto.ts).

## Carpetas (entorno personal)

| Carpeta | ID / Resolución | Uso |
| --- | --- | --- |
| [Bruto](https://drive.google.com/drive/folders/1Uz7rU5hm8jUvp1nLLQyALgaiYjhCR8LW) | `ID_CARPETA_TEMPLATES` (o subcarpeta `Bruto`) | Templates semanal, mensual y eventos |
| [AV](https://drive.google.com/drive/folders/1KdBpANFQ2O2_PBhlTtV8LpC2-xfyhNiR) | `ID_CARPETA_TXT` (`ID_CARPETA_CONTENEDORA`) | TXT para AV Weekly |
| [histórico AV - txt](https://drive.google.com/drive/folders/10beuK3so7X4lHMVuWKQ4azWJDq7My99E) | `ID_CARPETA_HISTORICO_TXT` (o subcarpeta `histórico AV - txt`) | TXT anteriores, nunca se borran |

## Clasp (cuenta personal)

`scripts/av-drive/.clasp.json` apunta al proyecto de `Tendencias AV_2026`
personal (`1NRPNzg0uzrSU16tbsIlPB6UbuYZkRbNOREyL9dTKH8ZBlChD4A3ms3Ih`):

```bash
pnpm run av:clasp:status
pnpm run av:clasp:push
```

`.claspignore` sube únicamente `00_*.gs`–`07_*.gs` y `appsscript.json`, dejando
fuera `trabajo/`, tests y documentación.

## Cada semana y cada mes

1. Dejar los templates en `Bruto` en formato **Google Sheets** (`Abrir con > Hojas de cálculo de Google`).
2. `⭐ AV Weekly > Procesar semana` lee **todos** los templates semanales de
   `Bruto`, usa cada uno para el detalle de su última semana (pestañas 7–10) sin
   pisar ubicaciones ya guardadas, sincroniza `Eventos Extr.`, aplica el formato
   de tabla, actualiza Looker y genera `AV 2026-SXX.txt`.
3. `⭐ AV Weekly > Procesar mes` cuenta tickets cerrados del mes, sincroniza el
   multianual 2026 y los eventos extraordinarios, y regenera el `.txt`.
4. Subir ese `.txt` en `Audiovisuales > Texto plano (Drive)`.
