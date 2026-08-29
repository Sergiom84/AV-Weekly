# Fuentes del PLANO de Informática

Este inventario es el contrato operativo entre el libro, `Codigo.gs` y el
importador. Los rangos son los de la muestra local de 2026-08-24; el script
reconoce las tablas por cabeceras y no por el nombre de fichero.

| Sección | Fuente, pestaña y rango | Cabeceras / periodo | Transformación |
|---|---|---|---|
| `HIC` | Template, `3-3 - HIC (SSCC) - Incidencias` `A1:D17`; `4-4 - HIC (SSCC) - Incidencias` `A1:D19`; `2-2 - HIC (SSCC) Mensual - Inci` `A1:S27` | `Fecha`, `Incidencias resueltas`, `Asignadas`, `Asignaciones`; el pivote usa meses en fila 2 y categorías en filas 3:26; excluir Total fila 27. 2025/05–2026/08. | Series por ámbito/métrica y pivote de categorías; nunca reconstruir desde incidencias diarias. |
| `COMPARATIVAS` | Template: `8-8 - Comparativa Componente_ E` `A1:D12`; `9-9 - Comparativa Comonente_ EQ` `A1:D3`; `10-9 - Comparativa Comonente_ E` `A1:D3`; `11-10 - Comparativa Comonente_` `A1:D11` | `Elemento` o `Modulo`, `Mes Actual`, `Mes Anterior`, `Hace dos meses`. Ancla: último mes HIC explícito. | Despivotar a meses reales; omitir `N/A`. |
| `SLAS` | Template: `12-11 - SLAs finalizados mes en...` `A1:E9`; `13-12 - SLAs finalizados mes an...` `A1:E11` | Fila 2: `SVTTitle`, `Cumplido`, `Incumplido`, `Total`; filas 3+. Mes actual y anterior respecto del ancla HIC. | Extraer sólo el entero inicial de `n (p%)`; conservar el total publicado. |
| `PETICIONESANUAL` | Libro limpio, `2.2.1 Volum de peticiones (Informe)`, `L3:Q15` | Meses `L4:L15`, años `M3:Q3`, valores `M4:Q15`; serie histórica agregada 2022–2026. | Es la única fuente disponible; no derivar desde snapshots semanales. |
| `CITAS` y `CITASANUAL` | Template, `6-6 - Citas Smart Tech` `A1:H45584` | `Walkup`, `Cita_Previa`, `Smart_Tech`; 2025-05-21–2026-09-03. | Preferir `Cita_Previa`, si falta `Walkup`; `Con Cita`/`Sin Cita`, excluir Telefonía y fechas posteriores a `asOfDate`. |
| `WORKORDERS` | Template, `5-5 - Peticiones ON SITE SSCC` `A1:O24316` | `Submit Date`, ubicación y `Categorization Tier 2`; 2024-02-19–2026-08-22. | Agregar por semana y mes; las tablas `Hoja 14`/`Hoja 15` son contraste, no origen. |
| `IMACS` | `Peticiones IMAC Onsite SSCC.xlsx`, pestaña `2026` `A1:I1555` | `Fecha limite`, `Edificio`, `nº trabajos`, `Solicitudes`; 2026-01-02–2026-08-19. | Primer día de mes y sede canónica; sumar Solicitudes e Intervenciones. |
| `WASP` | Sin fuente identificada | Sección opcional. | No emitir hasta identificar documento origen; ausencia significa sin datos. |
| `RENOVE` | Sin fuente identificada | Sección opcional, fuera del deck activo. | No emitir ni inferir desde productos de peticiones. |

El preámbulo del TXT siempre declara `asOfDate`, `semana` y `alcance completo`.
Las filas conservan año dentro de `mes`, y las secciones semanales conservan
además `fecha` y `semana`; las anuales transportan `anio` y `mes`.
