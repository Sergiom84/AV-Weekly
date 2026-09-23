# Informática SSCC: automatización semanal desde Drive

Fecha: 2026-08-28

Especificación del script que recrea el libro `SSCC- Informe Semanal limpio` a partir de
los ficheros que el equipo de Informática sube cada semana a Drive, y que genera la
pestaña de texto plano que alimenta AV Weekly.

Documentos relacionados, ambos en `Documentación/Informática/`, que está fuera de git por
contener volcados con datos personales: `_esquema-excel-plano.md` declara el contrato de
datos agregados, y `_analisis-informatica.md` recoge el análisis previo de las 17 páginas
del informe.

---

## 1. Objetivo

Hoy el libro se rellena a mano: se pegan cinco volcados en sus pestañas, se corrigen las
fechas americanas, se mueven los marcadores de semana y de mes, se congelan las celdas
vivas al cerrar el mes y se arrastran las cifras de la semana anterior. Cada uno de esos
pasos es una oportunidad de error y ninguno aporta criterio.

El script automatiza el pegado, los marcadores y el cierre de mes. **No** sustituye las
fórmulas del libro: las pestañas `(Informe)` siguen calculando solas, porque son la parte
que los compañeros entienden, auditan y ajustan.

Tres salidas:

1. El libro `SSCC- Informe Semanal limpio` actualizado, con el mismo aspecto de siempre.
2. Una pestaña `PLANO` con recuentos agregados en texto, que se copia y se pega en AV
   Weekly.
3. El histórico mensual completo dentro de ese `PLANO`, para que la aplicación lo persista
   y pueda generar informes de meses anteriores sin depender del libro.

---

## 2. Arquitectura

Réplica del patrón ya probado en `scripts/aga-drive/`: un Apps Script vinculado a la propia
hoja de cálculo, que lee la carpeta de Drive y escribe sobre sí mismo.

```
scripts/informatica-drive/
  Codigo.gs             Apps Script pegado en "SSCC- Informe Semanal limpio"
  verificar-local.mjs   Ejecuta la agregación fuera de Google, contra ficheros del disco
  README.md             Instalación y rutina semanal, para los compañeros

shared/modules/informatica/texto.ts   Contrato del formato PLANO
server/parseInformaticaTexto.ts       Parser del formato PLANO
```

Si cambia una sección del formato PLANO hay que tocar los tres sitios: `Codigo.gs`,
`texto.ts` y `parseInformaticaTexto.ts`. Es la misma regla que ya rige en AGA.

### Por qué Apps Script y no un script Node

Los compañeros trabajan sobre la hoja de Google. Un script externo que genere un `.xlsx`
les obligaría a sustituir su libro cada semana y perderían el historial de la hoja. El
Apps Script escribe donde ellos ya miran.

`verificar-local.mjs` existe para poder probar la agregación sin depender de Google:
importa las funciones puras de `Codigo.gs` y las corre contra los ficheros de
`Documentación/Informática/`.

### Interfaz

Menú `⭐ Informática Weekly` en la hoja:

- **Inicializar hoja** — crea `Configuración`, `Comprobación` y `PLANO` si no existen.
- **Procesar semana** — el paso semanal.
- **Cerrar mes** — el paso mensual del apartado 6. Se ofrece por separado porque no se
  hace todas las semanas y conviene que sea una decisión consciente.
- **Guardar PLANO como .txt en la carpeta** — alternativa a copiar y pegar.

Pestaña `Configuración`:

| Clave | Valor |
|---|---|
| `Carpeta Drive` | `17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH` |
| `Carpeta salida PLANO` | `1b1yyWSoWIj3cNwuCn-1Co1jtqgdGK2_A` |
| `Fecha de extracción` | Lunes de la semana que se informa |
| `Meses en la ventana de encuestas` | `19` |

De la fecha de extracción se derivan todos los marcadores de periodo del apartado 6. No se
introduce ninguna fecha más a mano.

### Identificación de los ficheros

Por contenido de cabecera, nunca por nombre de fichero. Es la regla que ya aplica
`server/convertInformaticaRaw.ts`, y existe por un motivo concreto: el volcado de work
orders se llama `Peticiones ON SITE SSCC`, es decir, el nombre miente.

| Formato | Cabeceras que lo identifican |
|---|---|
| Peticiones (backlog / gestionadas / liberadas) | `Denominación Producto` + `Estatus de la Posición` |
| Templates | las trece pestañas `N-N - ...` |
| IMAC | `Fecha limite` + `nº trabajos` |
| Renove | nombre de fichero con `Renove` + `España` o `Holding`, y `Ubicación` + `Estado` en las cuatro pestañas derivadas |

Renove es la excepción a la regla de la cabecera. El ámbito es el fichero, porque dentro
del libro no hay ninguna celda que lo declare, y dentro de cada libro seis o siete
pestañas comparten esas dos columnas: solo se leen `Onboarding semanal`,
`Renovados onboarding`, `Renove semanal` y `Renovados renove`, que son los resúmenes que
el propio libro deriva. Las crudas `Renove` y `Onboarding y averías` quedan fuera porque
son su origen, y una copia de trabajo como `Copia de Renove semanal` también. Eso es lo
que impide contar dos veces las mismas máquinas.

Los tres ficheros de peticiones comparten la misma cabecera de 19 columnas, así que entre
ellos se distinguen por nombre de fichero (`Backlog`, `Gestionadas`, `Liberadas`, sin
distinguir mayúsculas). Si aparecen dos ficheros del mismo tipo en la carpeta, se toma el
más reciente y se avisa en `Comprobación`.

---

## 3. Destinos y política de escritura

Mapeo verificado contra el libro actual, contando las filas de datos reales de cada
columna. **Todas las pestañas de datos son copia exacta de su origen: ninguna acumula.**

Los destinos de la tabla son los nombres nativos del Google Sheet. El XLSX de contraste
los limita a 31 caracteres y renombra varias colisiones como `Hoja 13`…`Hoja 19`; el
script resuelve ambas representaciones y nunca crea una pestaña funcional ausente.

| Origen | Filas | Destino | Rango | Política |
|---|---|---|---|---|
| `Backlog` | 734 | `2.2.1 Volum de peticiones (Datos Backlog)` | `A1:S` | reemplazo |
| `Liberadas` | 73 | `2.2.1 Volum de peticiones (Datos Liberadas)` | `A1:S` | reemplazo |
| `Gestionadas` | 47 | `2.2.1 Volum de peticiones (Datos Gestionadas)` | `A1:S` | reemplazo |
| Templates `1-1` | 3.263 | `2.1.5 Encuestas (datos)` | `A3:M` | reemplazo, solo columnas no personales |
| Templates `2-2` | 27 | `2.1.2 Top 5 incidencias (Datos)` | `A1:S` | reemplazo |
| Templates `3-3` | 17 | `2.1.1 Volumetria de Incidencias (Datos)` | `A3:D` | añade la fila del mes nuevo |
| Templates `4-4` | 19 | `2.1.1 Volumetria de Incidencias (Datos)` | `F3:I` | añade la fila del mes nuevo |
| Templates `5-5` | 24.316 | `2.1.6 Work Orders (Datos)` | `A1:O` | reemplazo |
| Templates `6-6` | 45.584 | `2.3.1 Volum de Citas SmartTech Semanal  (Datos)` | `A1:H`, más `J` y `N` | reemplazo |
| IMAC, pestaña del año | dinámico (259 en la muestra 2026) | `2.4.1 Vol Imacs resuelos OnSite (Datos)` | `A1:G` | reemplazo |

Las filas de origen y de destino coinciden exactamente en las cuatro pestañas grandes, lo
que confirma que no hay acumulación en ninguna. Las cifras que parecían indicar lo
contrario eran otra cosa: las 1.174 filas de `Hoja 17` son el maestro de direcciones de
`X:Z` (756 filas), y las 81.466 de `2.3.1` son fórmulas arrastradas muy por debajo del
dato.

### IMACS que entran por correo

`2.4.1!I1` advierte que muchos IMACS no vienen del documento, sino por correo. Como la
pestaña es copia exacta del fichero IMAC, esos IMACS se están añadiendo **al fichero
`Peticiones IMAC Onsite SSCC.xlsx` de Drive**, no al libro. Por tanto reemplazar la pestaña
es seguro y no pierde nada.

`Comprobación` avisa igualmente si el fichero IMAC de una semana trae menos filas que la
anterior, que es la señal de que alguien ha subido un fichero incompleto.

### Zonas intocables

El script no escribe nunca en:

- `Hoja 17!X:Z` — maestro dirección postal → DT → edificio, 756 filas.
- `2.1.6 Work Orders (Datos)!Y:Z` — maestro ID de técnico → territorial, 35 filas.
- `2.1.6 Work Orders (Datos)!AB` — catálogo de 18 edificios.
- `Hoja 18!BC:BE` — totales anuales 2022 a 2026, histórico previo que no está en ningún
  fichero y que no se puede recalcular.
- Ninguna pestaña `(Informe)`, salvo los marcadores, el cierre de mes del apartado 6,
  la rejilla anual de peticiones `L4:L15` × columnas de año desde `M`
  (`2.2.1 Volum de peticiones (Informe)`) y las dos rejillas de citas de
  `2.3.1 Volum de Citas SmartTech Semanal (Informe)`: el bloque mensual por sede
  (`AE4:AE22` / `AF4:AF22`, cabeceras de mes desde `AG3`, `AT3` = 2026/08) y el
  histórico anual `AW4:AW15` × `AX3:BB3`. Desde 2026/08 esas celdas se rellenan
  con el conteo del template `6-6 - Citas Smart Tech` (fechas americanas).
  No se pisan los bloques «Datos Año» a la derecha (`S3:T7` en peticiones,
  `BD3` hoy en citas).

Son tablas mantenidas a mano. Borrarlas deja el libro sin poder resolver ningún `VLOOKUP`.

### Columnas calculadas que sí se ajustan

Tres columnas de fórmula tienen que cubrir exactamente el número de filas escritas:

- `2.1.6 Work Orders (Datos)!P` = `VLOOKUP(F, Y:Z, 2, FALSE)` — 24.315 fórmulas hoy.
- `Hoja 17!T` = `VLOOKUP(I, X:Z, 2, FALSE)` y `!U` = `VLOOKUP(I, X:Z, 3, FALSE)` — 2.346
  fórmulas hoy.

El script las sustituye por **el valor ya resuelto**, calculado en JavaScript contra la
misma tabla maestra. El resultado es idéntico y el libro deja de recalcular 26.661
búsquedas en cada apertura.

De la columna `P` lo que importa es el territorial: es lo que hace que la columna
`Edificio` de la página 2.1.6 del informe muestre la ubicación. Si un técnico no está en
`Y:Z`, se escribe `#N/A` literal, igual que hoy, y se lista en `Comprobación` con su ID.
Un `#N/A` nuevo significa que ha entrado un técnico que falta en el maestro, y eso hay que
verlo antes de presentar.

---

## 4. Fechas

Tres formatos entran y uno solo sale.

| Entra | Ejemplo | Sale |
|---|---|---|
| Fecha y hora americana | `08/21/2026, 01:39:57 PM` | valor fecha, formato `dd/mm/yyyy` |
| Mes en texto | `2026/08` | primer día del mes, como valor fecha |
| Número en texto con separador | `6,380` | número |

La conversión se hace en JavaScript, al escribir. No queda ni una fórmula de fecha en el
libro.

Esto elimina las **651.729 fórmulas** `MID` y `DATE` de `2.3.1 Volum de Citas SmartTech`,
que hoy reconstruyen cada fecha a partir de trozos de texto:

```
K2 = MID(B2,1,2)   L2 = MID(B2,4,2)   M2 = MID(B2,7,4)   J2 = IFERROR(DATE(M2,L2,K2),"")
O2 = MID(C2,1,2)   P2 = MID(C2,4,2)   Q2 = MID(C2,7,4)   N2 = IFERROR(DATE(Q2,P2,O2),"")
```

El script escribe directamente el valor de fecha en `J` (Fecha Walkup) y `N` (Fecha Cita
Previa), que son las dos columnas que las `COUNTIFS` de `Hoja 18` leen. Las columnas
auxiliares `K:Q` se vacían. Es la mayor parte de los 11 MB del libro.

La anotación de `2.1.6 Work Orders (Informe)!K3` — *"Es necesario cambiar el formato a
fecha (Español) en el Template"* — queda resuelta: el paso manual desaparece.

---

## 5. Datos personales en encuestas

`2.1.5 Encuestas (datos)` conserva su ancho de 13 columnas, porque las fórmulas
referencian letras y desplazarlas las rompería. Solo se escriben las columnas que alimentan
el cálculo:

| Columna | Contenido | Se escribe |
|---|---|---|
| `A` | Incident Number | no, vacía |
| `B` | Last Resolved Date | no, vacía |
| `C` | Fecha (mes) | **sí** |
| `D` | Assigned Group | no, vacía |
| `E` | Ticket | no, vacía |
| `F` | Usuario | no, vacía |
| `G` | Fecha encuesta | no, vacía |
| `H` | Nivel de satisfacción | **sí** |
| `I` | Facilidad del proceso de apertura | **sí** |
| `J` | Motivo de la valoración, texto libre | no, vacía |
| `K` | Satisfecho con la solución | **sí** |
| `L` | Problema con la solución, texto libre | no, vacía |
| `M` | Comentarios adicionales | no, vacía |

Las fórmulas que dependen de esta pestaña son del tipo
`COUNTIFS(datos!C:C, mes, datos!H:H, nota)`, así que `C`, `H`, `I` y `K` bastan.

Con esto desaparecen del libro 3.262 matrículas de usuario y 1.470 respuestas de texto
libre, muchas de las cuales citan por su nombre al técnico que atendió.

El origen es el template **`1-1 - Encuestas de incidencias`**, cuyas trece columnas
coinciden una a una. La anotación de `B1` dice `5-5 - Peticiones ON SITE SSCC`, que es el
volcado de work orders y no tiene ninguna de esas columnas: es un error heredado. El script
la reescribe con la fuente correcta.

Las pestañas de peticiones, work orders y citas mantienen sus columnas tal cual: son las
que los compañeros cuadran contra sus propias herramientas. La pestaña `PLANO`, que es la
que sale del libro hacia AV Weekly, no lleva ningún dato personal en ningún caso.

---

## 6. Marcadores de periodo y cierre de mes

Este es el trabajo manual más silencioso y el que más caro sale cuando se olvida: si un
marcador no se mueve, el informe presenta el periodo anterior con los datos de este y nada
lo delata.

### Cada semana

| Celda | Hoy | Significa | Se deriva de |
|---|---|---|---|
| `2.1.6 Work Orders (Informe)!H1` | 01/08/2026 | primer día del mes informado | fecha de extracción |
| `2.1.6 Work Orders (Informe)!I1` | 31/08/2026 | último día del mes informado | fecha de extracción |
| `Hoja 18!J2` | 17/08/2026 | lunes de la semana informada | fecha de extracción |
| `Hoja 18!K2` | 23/08/2026 | domingo de la semana informada | fecha de extracción |
| `Hoja 19` filas 5 y 30 | pares | límites de cada mes de la serie IMACS | fecha de extracción |
| `2.1.5. (Informe)!L24` | 01/08/2026 | mes actual de las encuestas | fecha de extracción |

`2.2.1 (Informe)!G1` (`Fecha Comiendo DAAS 2023 ->`, 01/01/2023) es una constante
histórica, no un marcador. El script no la toca.

**Rodar la semana anterior.** `2.2.1 (Informe)!I4:I6` es la columna *Semana anterior* y hoy
contiene valores escritos a mano (`714`, `84`, `50`). La columna `J` calcula la variación
con `H*100/I-100`. Antes de escribir los datos nuevos, el script copia los valores actuales
de `H4:H6` a `I4:I6`. Ese orden importa: `H` se recalcula en cuanto se pegan los datos
nuevos y el valor viejo se pierde.

### Al cerrar el mes

Cuatro pestañas guardan histórico congelando la celda viva y abriendo una fila o columna
nueva. Hoy se hace a mano; pasa a hacerlo el script.

| Pestaña | Celda viva hoy | Qué hace el script |
|---|---|---|
| `2.1.1 Volumetria` | filas 4-19, una por mes | añade la fila del mes nuevo en `A:D` y en `F:I`, sin tocar las anteriores |
| `Hoja 13` | columna P (`VLOOKUP` a 2.1.1) | convierte P en valor y abre la columna Q con el mes nuevo |
| `Hoja 14` | `D11` (`= WO Informe!N43`) | convierte D11 en valor y escribe la fórmula en `D12` |
| `Hoja 15` | `B19` y `C19` | convierte la fila 19 en valor y abre la fila 20 con las dos fórmulas |
| `2.1.5. (Informe)` | fila 22 | ver apartado 7 |
| `2.1.6 (Informe)` filas 45-49 | literales `">=01/01/2026"` | escribe los límites del mes de cada columna a partir de su cabecera |

Las anotaciones de `Hoja 15!F19:F21` documentan de dónde sale cada columna y se conservan.

La cabecera de `2.1.6 (Informe)!E45` decía `2025` sobre columnas de 2026. Ya está corregida
a `2026` en el libro. El script deriva de ahora en adelante los literales de fecha de esas
fórmulas desde la cabecera de mes de cada columna, así que el error no puede repetirse.

---

## 7. Encuestas: histórico y ventana móvil

`2.1.5. Encuestas (Informe)` tiene tres piezas encadenadas y hoy se mantienen a mano.

**Histórico**, `B4:D22`. Una fila por mes desde febrero de 2025, con fecha, número de
encuestas y media. Crece indefinidamente, nunca se recorta.

**Fila viva**, la 22. `C22 = C31` y `D22 = J33`, es decir, el recuento y la media del mes en
curso, calculados desde `2.1.5 Encuestas (datos)`. La anotación de `E22` lo dice: `Vivo
(C31 y J33)`. La fila anterior lleva `Histórico`.

**Ventana móvil**, `G2:Y2` y `G3:Y3`. Diecinueve columnas de referencias, hoy `=B4…=B22` y
`=D4…=D22`. Es lo que dibuja la gráfica de barras de la página de satisfacción.

Al cerrar el mes el script hace, en este orden:

1. Convierte `C22` y `D22` en valores fijos, y pone `Histórico` en `E22`.
2. Escribe la fila 23: la fecha del mes nuevo en `B23`, `=C31` en `C23`, `=J33` en `D23`, y
   `Vivo (C31 y J33)` en `E23`.
3. Actualiza `L24` (`MES ACTUAL`) al mes nuevo, que es lo que gobierna las `COUNTIFS` de
   `C26:C30`.
4. Desplaza la ventana una posición: `G2:Y2` pasan a `=B5…=B23` y `G3:Y3` a `=D5…=D23`.

El resultado es el que pidieron: el histórico acumula todos los meses, y la tabla y la
gráfica muestran siempre los últimos N, dejando caer el más antiguo. En septiembre de 2026,
la ventana empieza en marzo de 2025 y termina en septiembre de 2026.

El ancho de la ventana es hoy de **19 meses**, no de 14. La etiqueta `F1` dice `14 meses` y
está obsoleta. El script la reescribe con el ancho real y lee ese ancho de `Configuración`,
para que cambiarlo sea editar una celda y no rehacer diecinueve fórmulas.

---

## 8. Pestaña PLANO e histórico en la base de datos

Formato de texto por secciones, mismo patrón que `shared/modules/aga/texto.ts`. Solo
recuentos agregados: ni un nombre, ni una matrícula, ni una descripción libre.

Cabecera con la semana ISO, el mes y la fecha de extracción. Después, una sección por
concepto:

| Sección | Dimensiones | Medida |
|---|---|---|
| `EDIFICIOS` | edificio, DT, alias | — |
| `INCIDENCIAS` | mes, categoría, subcategoría, métrica | tickets |
| `ENCUESTAS` | mes, valoración | respuestas |
| `WORKORDERS` | mes, edificio, tipo | órdenes |
| `PETICIONES` | semana, origen, estado, entidad | total |
| `PETICIONESPRODUCTO` | semana, producto, estado | total |
| `CITAS` | semana, edificio, tipo | citas |
| `IMACS` | mes, ciudad, métrica | total |
| `RENOVE` | día, mes, semana, ámbito, estado | equipos |

**Qué cuenta como un equipo.** Una línea con algo en la columna de petición
(`Nº Petición` en las derivadas, `Petición GPS` en las crudas), sea lo que sea lo que
ponga. Lo fijó el equipo de Informática el 22/09/2026: una misma petición puede cubrir
varias posiciones, así que `G500391` repetido son dos máquinas y no una contada dos veces
— comprobado en las pestañas crudas, donde cada repetición lleva un serial distinto, y
`G501865` llega a tres. Por la misma regla cuentan los marcadores de texto: `Llamada Ivan`
son quince equipos cuya petición no se ha creado todavía, y `VIP`, `pdte VIP` o
`SOPORTE VIP` lo mismo. La línea con esa celda vacía no es un equipo; en los libros del
21/09/2026 son cuatro, todas de España y todas sin serial tampoco.

`RENOVE` sale de los dos libros de Renove que el equipo deja en la misma carpeta de
Drive, `Renove Global PC España` y `Renove Global PC Holding`. Ambos son opcionales y se
nombran por separado: si uno no está esa semana, `Comprobación` escribe
`Renove España (ausente)` o `Renove Holding (ausente)` y ese ámbito sale vacío. Como el
PLANO se importa con `alcance completo`, una semana sin los libros deja las dos páginas
de Renove vacías; por eso su ausencia se nombra en vez de callarse.

El origen anterior era `Dashboards Renoves SSCC`, el tablero al que ambos libros
publicaban. Se retiró el 21/09/2026: sus cuatro pestañas `España - …` venían publicadas
desde el libro de Holding, de modo que el ámbito España del informe era en realidad
Holding repetido. Leer los libros directamente quita el paso de publicación, que era
donde los dos ámbitos podían cruzarse sin que nada lo dijera.
`Acumuladas` es el otro origen opcional: alimenta la rejilla anual de 2.2.1 (Informe),
no una sección propia del PLANO. Sin el fichero, `Comprobación` escribe
`Acumuladas (ausente)` y la serie anual no avanza.

No se emite `WASP` desde los ficheros semanales: no hay origen identificado.
`PeticionesAnual` sale de la rejilla de `2.2.1 (Informe)` después de que el script
haya escrito ahí el conteo de Acumuladas y la semilla de agosto 2026. `CitasAnual`
sigue saliendo de las citas del template, no de un histórico congelado aparte.

Las secciones y sus dimensiones son las mismas que ya declara
`Documentación/Informática/_esquema-excel-plano.md` y que `server/parseInformaticaPlano.ts`
sabe leer. Lo que cambia es el envoltorio: texto en una pestaña, en vez de doce hojas.

### El histórico va al PLANO, y de ahí a la base de datos

La aplicación tiene que poder generar un informe de un mes pasado sin abrir el libro. Para
eso el `PLANO` **emite siempre la serie mensual completa**, no solo la semana en curso:

- `INCIDENCIAS`, todos los meses de `2.1.1` y `Hoja 13`.
- `ENCUESTAS`, la distribución real mes × valoración de las columnas anonimizadas `C` y `H` de `2.1.5 Encuestas (datos)`. `B4:D22` solo conserva total y media y no permite reconstruir una distribución sin inventarla; se usa únicamente como contraste. El export actual puede incorporar respuestas tardías y por eso algún mes no coincide exactamente con el histórico ya congelado.
- `WORKORDERS`, la serie mensual de `Hoja 14` y el detalle del mes en curso.
- El total mensual combinado de `Hoja 15`.
- `IMACS`, los meses de `Hoja 19`.

Emitir el histórico entero cada semana hace la importación **idempotente**: subir dos veces
el mismo `PLANO` da el mismo resultado. La alternativa, mandar solo lo nuevo, obliga a la
aplicación a acertar qué falta, y una semana sin subir dejaría un hueco permanente.

`server/informatica-import-dedup.test.ts` ya cubre la deduplicación en el lado de la
aplicación; hay que confirmar que aplica también a las secciones históricas nuevas.

En AV Weekly se copia y se pega en `Informática > Texto plano (Drive)`, igual que ya se
hace con AGA.

---

## 9. Pestaña Comprobación

Se escribe en cada ejecución. Sirve para detectar una semana mala antes de presentarla.

- Fichero encontrado, fecha de modificación y filas leídas, por cada uno de los cinco.
- Filas escritas en cada pestaña destino, contrastadas con las leídas: tienen que coincidir.
- Técnicos que no están en `Y:Z` y direcciones que no están en `X:Z`, con el valor concreto.
- Aviso si el fichero IMAC trae menos filas que la semana anterior.
- Marcadores de periodo aplicados, en formato legible.
- Si se ha ejecutado el cierre de mes, qué celdas se han congelado.
- Totales clave: peticiones en vuelo, liberadas, gestionadas, work orders del mes, citas de
  la semana, incidencias resueltas del mes.

---

## 10. Correcciones a fórmulas existentes

Dentro de este trabajo, porque son defectos que producen cifras mal:

1. **`2.2.1 (Informe)!G6` está roto.** Contiene
   `COUNTIFS('Hoja 17'!F:F,"*EQUIPAMIENTO APPLE DAAS*",'Hoja 17'!G:G,">="&#REF!)`. La
   referencia perdida hace que la celda no cuente lo que debe, así que el dato de DAAS
   APPLE en gestionadas sale mal hoy. Se repara apuntando a `G1`, que es lo que hacen las
   celdas equivalentes `F5`, `F6` y `G5`.
2. **`2.1.2 (Datos)` fila `Total`.** Hoy es un número pegado. Pasa a ser `SUM` de las
   categorías, de modo que un desajuste entre el template y las filas cargadas se vea en
   vez de quedar tapado.
3. **Agregaciones sobre columnas enteras.** Las `COUNTIFS` de `2.1.6 (Informe)` y
   `Hoja 18`, y las `SUMIFS` de `Hoja 19`, barren columnas completas. Se acotan al
   número de filas realmente escrito, que el script conoce, y solo cuando la referencia
   pertenece a la pestaña de datos correspondiente.
4. **`Posiciones` mezcla días y cantidades.** El bloque de `2.2.1 (Informe)` suma hoy
   `Días Reales` para On Site/BBVA Technology y `Cantidad` para RENOVE/DAAS, llegando a
   mostrar 38.558 supuestas posiciones en el backlog de la muestra. El `PLANO` usa siempre
   la columna semántica `Cantidad`; la reparación del libro debe alinear sus fórmulas con
   esa misma regla.
5. **`Peticiones en vuelo` resta otra fila.** `2.2.1 (Informe)!D4` resta hoy `E5:G5`,
   que pertenecen a Liberadas. Debe restar los otros orígenes de su propia fila,
   `E4:G4`, antes de calcular `H4`.

---

## 11. Verificación

- `verificar-local.mjs` corre la agregación contra los seis ficheros del 2026-08-24 y
  compara los totales resultantes con los que hoy muestra el libro limpio. Una diferencia
  es un fallo del script o un defecto del libro; hay que decidir cuál antes de seguir.
- Tests `vitest` para `server/parseInformaticaTexto.ts`: cabecera, cada sección, secciones
  ausentes, líneas mal formadas, y un `PLANO` completo.
- Test de las conversiones de fecha del apartado 4, incluido el cambio de día que provoca
  una marca horaria de madrugada.
- Test del cierre de mes: ejecutarlo dos veces seguidas no puede duplicar la fila ni
  desplazar la ventana dos posiciones.
- Test de idempotencia de la importación: subir el mismo `PLANO` dos veces deja la base de
  datos igual.
- `pnpm run check` y `pnpm run build`.

Criterio de aceptación: ejecutar el script sobre una copia del libro con los ficheros del
2026-08-24 reproduce las cifras que hoy muestran las pestañas `(Informe)`, salvo en
`2.2.1 (Informe)` fila 6, donde debe corregir el `#REF!`.

---

## 12. Fuera de alcance

**Ignorado por decisión expresa**

- `2.1.7 Volumetria de WO anuales` y `2.1.8 Volumetria de incidencias` están vacías. No se
  tocan ni se rellenan.

**Después**

- `2.1.5 (Informe)!J33` usa `AVERAGE.WEIGHTED`, que solo existe en Google Sheets. Abierto
  en Excel el libro da error y arrastra el valor cacheado. Se sustituye por `SUMPRODUCT`.
- Los maestros están dispersos y escondidos dentro de hojas de datos: `Hoja 17!X:Z`,
  `2.1.6 Datos!Y:Z`, `2.1.6 Datos!AB`. Unificarlos en una pestaña `Maestros`.
- `Hoja 13` a `Hoja 19` son nombres sin significado que guardan datos históricos y tablas
  del informe. Renombrarlas.

**Experimental**

- Que el Apps Script calcule también las pestañas `(Informe)` y el libro quede como archivo
  auditable, sin ninguna fórmula. Es el final natural de este camino, pero quita a los
  compañeros la capacidad de ajustar el cálculo, así que no se hace sin pedirlo.

---

## 13. Pendientes

| Asunto | Estado |
|---|---|
| `Hoja 19` referencia una pestaña `'2025'` que no existe en la copia limpia. El `IFERROR` lo tapa devolviendo `"0"`, así que diciembre 2025 y enero 2026 de esa tabla salen a cero sin avisar | pendiente de mirar en el libro bueno |
| Qué hacer si el fichero IMAC trae una pestaña de año que el libro no tiene | pendiente |
| Quién mantiene los maestros `X:Z`, `Y:Z` y `AB`, y cada cuánto | pendiente, riesgo bajo: el script no los escribe, solo avisa de los valores que no encuentra |
| Origen de los datos de WASP y de las series anuales de peticiones y citas | sin origen conocido, se sigue pidiendo |
| Renove ya tiene origen: los libros `Renove Global PC España` y `Renove Global PC Holding` en la carpeta de Drive | resuelto, lo emite `Procesar semana` |
| Si los dos libros de Renove vuelven a publicar en `Dashboards Renoves SSCC`, ese tablero ya no lo lee nadie | resuelto por retirada; conviene que el equipo quite la publicación cruzada que duplicaba España |
| Bloque `2.1.6 (Informe)` filas 45-49 (Teclado / Ratón / Desinstalar SW): a qué página del informe sale | pendiente, no bloquea |
