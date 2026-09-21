# Fuentes del PLANO de Informática

Este inventario es el contrato operativo entre el libro, `Codigo.gs` y el
importador. Los rangos son los de la muestra local de 2026-08-24; el script
reconoce las tablas por cabeceras y no por el nombre de fichero.

| Sección | Fuente, pestaña y rango | Cabeceras / periodo | Transformación |
|---|---|---|---|
| `HIC` | Template, `3-3 - HIC (SSCC) - Incidencias` `A1:D17`; `4-4 - HIC (SSCC) - Incidencias` `A1:D19`; `2-2 - HIC (SSCC) Mensual - Inci` `A1:S27` | `Fecha`, `Incidencias resueltas`, `Asignadas`, `Asignaciones`; el pivote usa meses en fila 2 y categorías en filas 3:26; excluir Total fila 27. 2025/05–2026/08. | Series por ámbito/métrica y pivote de categorías; nunca reconstruir desde incidencias diarias. |
| `COMPARATIVAS` | Template: `8-8 - Comparativa Componente_ E` `A1:D12`; `9-9 - Comparativa Comonente_ EQ` `A1:D3`; `10-9 - Comparativa Comonente_ E` `A1:D3`; `11-10 - Comparativa Comonente_` `A1:D11` | `Elemento` o `Modulo`, `Mes Actual`, `Mes Anterior`, `Hace dos meses`. Ancla: último mes HIC explícito. | Despivotar a meses reales; omitir `N/A`. |
| `SLAS` | Template: `12-11 - SLAs finalizados mes en...` `A1:E9`; `13-12 - SLAs finalizados mes an...` `A1:E11` | Fila 2: `SVTTitle`, `Cumplido`, `Incumplido`, `Total`; filas 3+. Mes actual y anterior respecto del ancla HIC. | Extraer sólo el entero inicial de `n (p%)`; conservar el total publicado. |
| `PETICIONESANUAL` | Libro limpio, `2.2.1 Volum de peticiones (Informe)`, rejilla anual desde `L3` | Meses `L4:L15`, años consecutivos desde `M3` (2026 = `Q`, 2027 = `R3`). Agosto 2026 = `Q11` semilla 776. Desde septiembre 2026, conteo de filas de **Acumuladas** por `Fecha Gestionado` (`Q12` = 319 en la muestra del 15/09/2026). | No derivar desde backlog/liberadas/gestionadas semanales. Acumuladas se reconoce por el nombre; comparte cabecera con esos tres. El script escribe la celda del año/mes y el PLANO la relée. No pisar `S3:T7` «Datos Año». |
| `CITAS` y `CITASANUAL` | Template, `6-6 - Citas Smart Tech` | `Walkup`, `Cita_Previa`, `Smart_Tech`. Fechas americanas (`MM/DD/YYYY`, con o sin hora). | Preferir `Cita_Previa`, si falta `Walkup`; `Con Cita`/`Sin Cita`; excluir Telefonía y fechas posteriores a la extracción. El script escribe además `2.3.1 (Informe)`: columnas mensuales por sede desde `AG` (`AT3` = 2026/08, `AU3` = 2026/09, inserta columna antes de `Ene` si hace falta) y el histórico anual `AW4:AW15` × `AX3…BB3` (2027 = `BC3`, 2028 = `BD3` si está libre). No pisar el bloque «Datos Año» a la derecha de BB. |
| `WORKORDERS` | Template, `5-5 - Peticiones ON SITE SSCC` `A1:O24316` | `Submit Date`, ubicación y `Categorization Tier 2`; 2024-02-19–2026-08-22. | Agregar por semana y mes; las tablas `Hoja 14`/`Hoja 15` son contraste, no origen. |
| `IMACS` | `Peticiones IMAC Onsite SSCC.xlsx`, pestaña `2026` `A1:I1555` | `Fecha limite`, `Edificio`, `nº trabajos`, `Solicitudes`; 2026-01-02–2026-08-19. | Primer día de mes y sede canónica; sumar Solicitudes e Intervenciones. |
| `WASP` | Sin fuente identificada | Sección opcional. | No emitir hasta identificar documento origen; ausencia significa sin datos. |
| `RENOVE` | `Renove Global PC España*.xlsx` y `Renove Global PC Holding*.xlsx`, cuatro pestañas de cada uno: `Onboarding semanal`, `Renovados onboarding`, `Renove semanal`, `Renovados renove` | `Estado`, `Ubicacion`, `Fecha Renovado` o `Fecha de Estado`, `Nº Peticion`. | Ámbito por nombre de fichero: dentro del libro no hay celda que lo declare. No leer las crudas `Renove` ni `Onboarding y averías`, que son el origen de esas cuatro. No inferir desde productos de peticiones. |

`RENOVE` sale de los dos libros de Renove de la carpeta de Drive y lo emite
`Procesar semana` como una sección más. Hasta el 21/09/2026 venía del tablero
`Dashboards Renoves SSCC`, donde ambos libros publicaban sus pestañas; ese paso
se retiró porque las cuatro pestañas `España - …` estaban publicadas desde el
libro de Holding y el informe contaba Holding dos veces.

El preámbulo del TXT siempre declara `asOfDate`, `semana` y `alcance completo`.
Las filas conservan año dentro de `mes`, y las secciones semanales conservan
además `fecha` y `semana`; las anuales transportan `anio` y `mes`.

## Cabeceras de dos filas

El pivote `2-2` y las dos pestañas de SLAs tienen la cabecera repartida en dos
filas mediante celdas combinadas. Ese bloque **no se lee igual en las dos
formas del mismo fichero**:

| | XLSX leído en local | Google Sheets tras convertir |
|---|---|---|
| `2-2`, fila 1 | `"", "Fecha", 2025/05, 2025/06…` | igual |
| `2-2`, fila 2 | `"Categorization Tier 1", "", 2025/05, 2025/06…` | `"Categorization Tier 1"` y el resto vacío |
| `12-11`, fila 1 | `"", "MeasurementStatus", "Cumplido", "Incumplido", "Total"` | igual |
| `12-11`, fila 2 | `"SVTTitle", "", "Cumplido", "Incumplido", "Total"` | `"SVTTitle"` y el resto vacío |

Al leer el XLSX, una celda combinada aparece materializada en todas las filas
que abarca. Google conserva el valor sólo en la fila superior de la
combinación. Un lector que se fíe de una sola fila encuentra la cabecera en la
verificación local y no encuentra nada en producción, además en silencio,
porque una columna ausente se salta en lugar de fallar.

Por eso `mergedHeaderRow` aplana el bloque tomando la primera celda no vacía de
cada columna, y `agregarHic` y `agregarSlas` lanzan error si la pestaña se
identifica pero sus columnas no aparecen. Esto costó dos ejecuciones vivas que
terminaron correctamente publicando un PLANO sin pivote de categorías y sin
`SLAS`: cualquier lectura nueva de cabecera debe usar el mismo helper.
