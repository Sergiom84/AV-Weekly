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

Hoy el libro se rellena a mano: se pegan seis volcados en sus pestañas, se corrigen las
fechas americanas, se mueven los marcadores de semana y de mes, y se arrastran las cifras
de la semana anterior. Cada uno de esos pasos es una oportunidad de error y ninguno aporta
criterio.

El script automatiza el pegado y los marcadores. **No** sustituye las fórmulas del libro:
las pestañas `(Informe)` siguen calculando solas, porque son la parte que los compañeros
entienden, auditan y ajustan.

Dos salidas:

1. El libro `SSCC- Informe Semanal limpio` actualizado, con el mismo aspecto de siempre.
2. Una pestaña `PLANO` con recuentos agregados en texto, que se copia y se pega en AV
   Weekly para generar la presentación.

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
- **Guardar PLANO como .txt en la carpeta** — alternativa a copiar y pegar.

Pestaña `Configuración`:

| Clave | Valor |
|---|---|
| `Carpeta Drive` | `17O7dORS6oIDN0hyLP1AXQEN7tR6k3ZbH` |
| `Fecha de extracción` | Lunes de la semana que se informa |

De la fecha de extracción se derivan todos los marcadores de periodo del apartado 5. No se
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

Los tres ficheros de peticiones comparten la misma cabecera de 19 columnas, así que entre
ellos se distinguen por nombre de fichero (`Backlog`, `Gestionadas`, `Liberadas`, sin
distinguir mayúsculas). Si aparecen dos ficheros del mismo tipo en la carpeta, se toma el
más reciente y se avisa en `Comprobación`.

---

## 3. Destinos y política de escritura

Mapeo verificado contra el libro actual, por número de filas y por las fórmulas que cada
pestaña `(Informe)` lanza sobre ella.

| Origen | Destino | Rango de escritura | Política |
|---|---|---|---|
| `Backlog` | `2.2.1 Volum de peticiones (Datos)` | `A1:S` | reemplazo |
| `Liberadas` | `Hoja 16` | `A1:S` | reemplazo |
| `Gestionadas` | `Hoja 17` | `A1:S` | acumula, dedup por `Nº Petición de sistemas` + `Posición` |
| Templates `1-1` | `2.1.5 Encuestas (datos)` | `A3:M` | reemplazo, solo columnas no personales |
| Templates `2-2` | `2.1.2 Top 5 incidencias (Datos)` | `A1:S` | reemplazo |
| Templates `3-3` | `2.1.1 Volumetria de Incidencias` | `A3:D` | reemplazo |
| Templates `4-4` | `2.1.1 Volumetria de Incidencias` | `F3:I` | reemplazo |
| Templates `5-5` | `2.1.6 Work Orders (Datos)` | `A1:O` | reemplazo |
| Templates `6-6` | `2.3.1 Volum de Citas SmartTech` | `A1:H`, más `J` y `N` | acumula, dedup por `Incidencia` |
| IMAC, pestaña del año en curso | `2.4.1 Vol Imacs resuelos OnSite` | `A1:G` | fusiona, dedup por `Número` |

### Zonas intocables

El script no escribe nunca en:

- `Hoja 17!X:Z` — maestro ubicación postal → DT → edificio.
- `2.1.6 Work Orders (Datos)!Y:Z` — maestro ID de técnico → territorial.
- `2.1.6 Work Orders (Datos)!AB` — catálogo de edificios.
- Ninguna pestaña `(Informe)`, ni `Hoja 13`, `14`, `15`, `18`, `19`, salvo los marcadores
  de periodo del apartado 5.

Son tablas mantenidas a mano. Borrarlas deja el libro sin poder resolver ningún `VLOOKUP`.

### Columnas calculadas que sí se ajustan

Tres columnas de fórmula tienen que cubrir exactamente el número de filas escritas, ni una
más ni una menos:

- `2.1.6 Work Orders (Datos)!P` = `VLOOKUP(F, Y:Z, 2, FALSE)` — 24.315 fórmulas hoy.
- `Hoja 17!T` = `VLOOKUP(I, X:Z, 2, FALSE)` y `Hoja 17!U` = `VLOOKUP(I, X:Z, 3, FALSE)` —
  2.346 fórmulas hoy.

El script las sustituye por **el valor ya resuelto**, calculado en JavaScript contra la
misma tabla maestra. El resultado es idéntico y el libro deja de recalcular 26.661
búsquedas en cada apertura. Si un valor no se encuentra en el maestro, se escribe `#N/A`
literal, igual que hoy, y se cuenta en `Comprobación`: un `#N/A` nuevo significa que ha
aparecido una ubicación o un técnico que falta en el maestro, y eso hay que verlo.

### Acumulación: asunción declarada

Las dos políticas de acumulación están deducidas de los conteos actuales, no confirmadas
por escrito:

- `Hoja 17` tiene 1.174 filas frente a las 47 del fichero `Gestionadas` de la semana.
- `2.3.1` tiene 81.466 filas frente a las 45.584 del template.

En ambos casos el destino es mayor que el origen, lo que solo se explica acumulando. **Hay
que confirmarlo con quien mantiene el libro antes de la primera ejecución real**, y
confirmar también desde qué fecha arranca cada acumulado. Mientras no se confirme, el
script escribe en una copia de la hoja, no sobre la original.

### `2.4.1` fusiona, no reemplaza

El propio libro lo advierte en `2.4.1!I1`:

> Muchos de los IMACS que figuran en ésta pestaña no provienen del documento. Entran por
> correo.

Reemplazar la pestaña borraría los que se introducen a mano. El script fusiona por
`Número`: actualiza las filas que vienen en el fichero IMAC y deja intactas las demás. Las
filas que solo existen en la hoja se cuentan aparte en `Comprobación`, para que se vea
cuántos IMACS de esa semana entraron por correo.

---

## 4. Fechas y datos personales

### Conversión de fechas

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
auxiliares `K:M` y `O:Q` se vacían. Es la mayor parte de los 11 MB del libro.

La anotación de `2.1.6 Work Orders (Informe)!K3` — *"Es necesario cambiar el formato a
fecha (Español) en el Template"* — queda resuelta: el paso manual desaparece.

### Encuestas sin datos personales

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

Las pestañas de peticiones, work orders y citas mantienen sus columnas tal cual: son las
que los compañeros cuadran contra sus propias herramientas. La pestaña `PLANO`, que es la
que sale del libro hacia AV Weekly, no lleva ningún dato personal en ningún caso.

---

## 5. Marcadores de periodo

Este es el paso manual más silencioso y el que más caro sale cuando se olvida: si el
marcador no se mueve, el informe presenta la semana anterior con los datos de esta y nada
lo delata.

Todas las `COUNTIFS` del libro se acotan con estos pares de celdas:

| Celda | Hoy | Significa | Se deriva de |
|---|---|---|---|
| `2.1.6 Work Orders (Informe)!H1` | 46235 | primer día del mes informado | fecha de extracción |
| `2.1.6 Work Orders (Informe)!I1` | 46265 | último día del mes informado | fecha de extracción |
| `Hoja 18!J2` | 46251 | lunes de la semana informada | fecha de extracción |
| `Hoja 18!K2` | 46257 | domingo de la semana informada | fecha de extracción |
| `Hoja 19!` fila 5 y fila 30 | pares | límites de cada mes de la serie | fecha de extracción |
| `2.2.1 (Informe)!G1` | 44927 | inicio de DAAS, constante | no se toca |

`2.2.1 (Informe)!G1` es una constante histórica (`Fecha Comiendo DAAS 2023 ->`), no un
marcador de periodo. El script no la modifica.

### Rodar la semana anterior

`2.2.1 (Informe)!I4:I6` es la columna **Semana anterior** y hoy contiene valores escritos a
mano (`714`, `84`, `50`). La columna `J` calcula la variación con `H*100/I-100`.

Antes de escribir los datos nuevos, el script copia los valores actuales de `H4:H6` a
`I4:I6`. Es decir: el total de esta semana pasa a ser la semana anterior de la siguiente.
Ese orden importa y hay que respetarlo, porque `H` se recalcula en cuanto se pegan los
datos nuevos y el valor viejo se pierde.

---

## 6. Pestaña PLANO

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

No se emiten `WASP`, `RENOVE`, `PeticionesAnual` ni `CitasAnual`: ninguno de los cinco
ficheros de la carpeta contiene esos datos. Las páginas del deck que dependen de ellos
siguen en "Próximamente", que es preferible a inventar la cifra.

Las secciones y sus dimensiones son las mismas que ya declara
`Documentación/Informática/_esquema-excel-plano.md` y que `server/parseInformaticaPlano.ts`
sabe leer. Lo que cambia es el envoltorio: texto en una pestaña, en vez de doce hojas.

En AV Weekly se copia y se pega en `Informática > Texto plano (Drive)`, igual que ya se
hace con AGA.

---

## 7. Pestaña Comprobación

Se escribe en cada ejecución. Sirve para detectar una semana mala antes de presentarla.

- Fichero encontrado, fecha de modificación y filas leídas, por cada uno de los cinco.
- Filas escritas en cada pestaña destino, y cuántas se han descartado por duplicado.
- `#N/A` nuevos en los maestros, con el valor concreto que no se ha encontrado.
- IMACS presentes en la hoja pero no en el fichero, es decir, los que entraron por correo.
- Marcadores de periodo aplicados, en formato legible.
- Totales clave contrastados: peticiones en vuelo, liberadas, gestionadas, work orders del
  mes, citas de la semana, incidencias resueltas del mes.

---

## 8. Correcciones a fórmulas existentes

Dentro de este trabajo, porque son defectos que producen cifras mal:

1. **`2.2.1 (Informe)!G6` está roto.** Contiene
   `COUNTIFS('Hoja 17'!F:F,"*EQUIPAMIENTO APPLE DAAS*",'Hoja 17'!G:G,">="&#REF!)`. La
   referencia perdida hace que la celda no cuente lo que debe, así que el dato de DAAS
   APPLE en gestionadas sale mal hoy. Se repara apuntando a `G1`, que es lo que hacen las
   celdas equivalentes `F5`, `F6` y `G5`.
2. **`COUNTIFS` sobre columnas enteras.** Todas las de `2.1.6 (Informe)`, `Hoja 18` y
   `Hoja 19` barren `$P:$P`, `$I:$I`, `$B:$B` completas. Se acotan al número de filas
   realmente escrito, que el script conoce.

---

## 9. Verificación

- `verificar-local.mjs` corre la agregación contra los ficheros de
  `Documentación/Informática/` y contra los seis de la carpeta local de MIX, y compara los
  totales resultantes con los que hoy muestra el libro limpio. Una diferencia es un fallo
  del script o un defecto del libro; hay que decidir cuál antes de seguir.
- Tests `vitest` para `server/parseInformaticaTexto.ts`: cabecera, cada sección, secciones
  ausentes, líneas mal formadas, y el caso de un `PLANO` completo.
- Test de las conversiones de fecha: los tres formatos de entrada del apartado 4, incluido
  el cambio de día que provoca una marca horaria de madrugada.
- `pnpm run check` y `pnpm run build`.

Criterio de aceptación: ejecutar el script sobre una copia del libro con los ficheros del
2026-08-24 tiene que reproducir las cifras que hoy muestran las pestañas `(Informe)`, salvo
en `2.2.1 (Informe)` fila 6, donde debe corregir el `#REF!`.

---

## 10. Fuera de alcance

Propuestas de mejora identificadas al analizar el libro, que no entran en este trabajo:

**Después**

- `2.1.5 (Informe)!J33` usa `AVERAGE.WEIGHTED`, que solo existe en Google Sheets. Abierto
  en Excel el libro da error y arrastra el valor cacheado. Se sustituye por `SUMPRODUCT`.
- Los maestros están dispersos y escondidos dentro de hojas de datos: `Hoja 17!X:Z`,
  `2.1.6 Datos!Y:Z`, `2.1.6 Datos!AB`. Unificarlos en una pestaña `Maestros` los haría
  mantenibles.
- `Hoja 13` a `Hoja 19` son nombres sin significado que guardan datos históricos y tablas
  del informe. Renombrarlas.

**Experimental**

- Que el Apps Script calcule también las pestañas `(Informe)` y el libro quede como archivo
  auditable, sin ninguna fórmula. Es el final natural de este camino, pero quita a los
  compañeros la capacidad de ajustar el cálculo, así que no se hace sin pedirlo.

---

## 11. Riesgos y decisiones pendientes

| Asunto | Estado |
|---|---|
| Política de acumulación de `Hoja 17` y `2.3.1` | deducida de los conteos, **pendiente de confirmar** |
| Fecha de arranque de cada acumulado | pendiente |
| Qué hacer si el fichero IMAC trae una pestaña de año que no existe en el libro | pendiente |
| Origen de los datos de WASP, RENOVE y series anuales | sin origen conocido, se sigue pidiendo |

Mientras la primera fila de esta tabla siga pendiente, el script escribe sobre una copia
del libro, nunca sobre el original.
