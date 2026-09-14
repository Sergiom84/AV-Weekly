# AGA en Google Drive

Automatiza el informe semanal de AGA: los tres exports en bruto se dejan en una
carpeta de Drive, un Apps Script los agrega y escribe una pestaña `PLANO` con el
texto que AV Weekly importa. Sustituye al proceso de tablas dinámicas copiadas a
mano.

| Fichero | Qué es |
| --- | --- |
| `Codigo.gs` | El script. Se pega en el editor de Apps Script de la hoja. |
| `verificar-local.mjs` | Ejecuta la agregación de `Codigo.gs` fuera de Google, contra ficheros del disco. |

El formato del texto lo declara [`shared/modules/aga/texto.ts`](../../shared/modules/aga/texto.ts)
y lo lee [`server/parseAgaTexto.ts`](../../server/parseAgaTexto.ts). Si cambia
una sección hay que tocar los tres sitios.

## Instalación, una sola vez

1. Crear una hoja de cálculo nueva en Drive, por ejemplo `AV Weekly - AGA`.
2. `Extensiones > Apps Script`, borrar lo que haya y pegar `Codigo.gs`. Guardar.
3. Volver a la hoja y recargar. Aparece el menú `⭐ AGA Weekly`.
4. `⭐ AGA Weekly > Inicializar hoja`. Crea las pestañas y las tablas de mapeo.
5. Crear la carpeta de Drive donde se dejarán los ficheros y pegar su ID en la
   pestaña `Configuración`. El ID es lo que va después de `/folders/` en la URL.
6. La primera ejecución pide permisos: leer Drive y la hoja. Son los de la
   cuenta que ejecuta, no se comparte nada.

## Cada semana

1. Subir a la carpeta los tres ficheros tal cual llegan, sin renombrarlos ni
   tocarlos: el GPS de peticiones pendientes, el `Gestionado` de ZPT025 y el de
   licencias Office.
2. Poner la fecha de extracción (el lunes) en `Configuración`, con apóstrofo
   delante: `'2026-09-07`.
3. `⭐ AGA Weekly > Procesar semana`. Antes de empezar sale un recordatorio con
   los dos fallos que llegan al informe y que nada aguas abajo puede reparar:
   la fecha convertida por Sheets y los edificios que faltan en el mapa. Muestra
   lo que la hoja tiene escrito ahora mismo en la celda de la fecha, y se puede
   cancelar.
4. Comprobar los totales en la pestaña `Comprobación`.
5. Copiar la pestaña `PLANO` entera y subirla en AV Weekly, en
   `AGA > Texto plano (Drive)`. También vale
   `⭐ AGA Weekly > Guardar PLANO como .txt en la carpeta` y subir el fichero.

## Decisiones que conviene conocer

### Fechas y control del corte

La fecha de extracción debe ser un lunes válido. Para evitar una conversión
regional, introdúcela como texto ISO (`2026-09-07`, precedido por apóstrofo si
Sheets intenta convertirlo). Ese corte representa la semana AGA 36, del 31 de
agosto al 6 de septiembre. El número opcional de semana no corrige una fecha
de extracción equivocada.

El Gestionado semanal es el fichero entero: una semana, la del lunes de
`Configuración`. `Fecha Gestionado` no se usa para agrupar. Drive y Sheets
convierten esa columna, y un cierre entre el 1 y el 12 no deja ninguna celda
de texto que ancle el intercambio; partir por fecha escribe cinco semanas y
envenena el histórico. Office sí mira fechas: una columna convertida se
contrasta con el mes del corte y el anterior; una interpretación ambigua
bloquea el proceso. Las fechas ya normalizadas no se invierten otra vez. Los
productos Office sin familia también bloquean la generación:
`MICROSOFT OFFICE 2021 (MAC)` tiene una serie propia y no se suma a Standard.

Actualizar este archivo o `Codigo.gs` localmente no actualiza el script instalado
en Google Sheets. En una hoja existente, sustituir y guardar el script; conservar
las pestañas de mapas y no volver a inicializarlas. Antes de importar, verificar
fecha, total en gestión, total gestionado y desglose Office en `Comprobación`.
Un TXT corregido no elimina automáticamente claves erróneas importadas antes:
esa reparación necesita revisar el histórico y su copia de respaldo.

**Los ficheros se reconocen por su cabecera, no por el nombre.** El script abre
cada fichero de la carpeta y mira qué columnas trae. Así sigue funcionando
aunque cada semana lleguen con un nombre distinto. Si hay dos ficheros del mismo
tipo, gana el más reciente.

**Una semana sólo escribe en Office su mes y el anterior.** El export de
licencias lista lo gestionado del mes en curso, y a principio de mes arrastra el
cierre del anterior. Todo lo demás es histórico y sólo se reescribe a propósito,
subiendo el libro Office desde el panel de AV Weekly. Sin ese límite, un fichero
con las fechas mal convertidas escribe en meses que ya nadie va a volver a
escribir. Las posiciones que caen fuera se descartan y se cuentan en
`Comprobación`.

**Las fechas americanas se corrigen en Office, no en Gestionado.**
Si una columna de Office mezcla fechas de verdad con texto de día 13 o mayor,
es que un Excel en inglés convirtió las que podía y les cambió el día por el
mes; entonces se deshace el cambio y `Comprobación` dice cuántas celdas se
corrigieron. Una columna homogénea de Office se contrasta con el mes informado.
Gestionado no entra en ese juego: `Comprobación` anota que `Fecha Gestionado`
se ignoró y que las 758 filas (o las que sean) van a la extracción.

**El GPS en bruto no trae la columna `semana`.** El script le pone la fecha de
extracción de `Configuración`. Si el fichero sí trae la columna, manda la
columna, de forma que un GPS montado a la manera antigua sigue importándose.

**Las etiquetas se deciden en Drive.** AV Weekly no vuelve a renombrar nada: lo
que escribe el script es lo que sale en las gráficas. Las pestañas de mapeo son
el único sitio donde se nombra un departamento, un proyecto o un edificio.

**Nada se descarta en silencio.** Un departamento sin mapear sale con su nombre
en bruto, un edificio desconocido cuenta como `Sin clasificar`, y ambos se
avisan al terminar. Es lo que mantiene los totales cuadrados.

**La tercera columna de `Mapa departamentos` es la sección 2.** Vacía significa
que ese departamento no sale en la gráfica de gestionadas, aunque sus posiciones
sí cuentan para el total de la semana. Es una etiqueta y no un sí/no porque las
dos secciones han llamado siempre distinto al mismo departamento
(`Plataforma Portátiles` frente a `Portatiles Plataforma`).

**La sección 3 no sale de estos tres ficheros.** La evolución anual compara años
completos y ninguno de los exports llega más allá del mes en curso. Se mantiene
a mano en la pestaña `Anual`. Si está vacía, el texto no trae esas secciones y
AV Weekly conserva lo que ya tuviera.

**El histórico lo acumula la app.** El GPS solo trae dos semanas y las gráficas
enseñan diez. Cada importación funde sus semanas con las guardadas, sustituyendo
una semana que ya estuviera y añadiendo el resto, así que no hay que guardar el
histórico en Drive.

**El texto lleva todos los productos, no el top.** Una semana trae unos sesenta
y la slide 2.3 dibuja quince, pero los elige la app una vez unidas las dos
semanas. Recortar aquí guardaría el top de cada semana por separado, y un
producto que entra en el top esta semana saldría con un cero en la anterior
aunque tuviera cifra: es justo el fallo del método manual que esto sustituye.

## Verificación local

`Codigo.gs` no se puede probar con el resto de la suite: solo corre dentro de una
hoja. `verificar-local.mjs` carga ese mismo fichero en un VM de Node con los
globales de Google simulados y le da los tres libros desde el disco:

```bash
node scripts/aga-drive/verificar-local.mjs "ruta/a/la/carpeta" 2026-08-17
```

Escribe el texto por la salida estándar y un resumen por la de error. Ejercita la
agregación, que es donde están las reglas de negocio; lo que habla con Drive y
con la hoja no se ejecuta.

Contrastado con la semana 33 de 2026: el texto que produce coincide posición a
posición con lo que dan `parseAgaOffice.ts` y `parseAgaGestionado.ts` sobre los
mismos ficheros, y con los números de la presentación publicada.
