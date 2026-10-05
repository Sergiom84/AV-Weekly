# Informática SSCC en Google Drive

Automatiza el informe semanal de Informática: los cinco orígenes se dejan en
una carpeta de Drive, el Apps Script actualiza el libro de trabajo y genera una
pestaña `PLANO` con los recuentos que AV Weekly importa.

| Fichero | Qué es |
| --- | --- |
| `Codigo.gs` | Script que se instala en `SSCC- Informe Semanal limpio`. |
| `SPEC.md` | Contrato de datos, pestañas, periodos y zonas que no se modifican. |
| `verificar-local.mjs` | Ejecuta la agregación contra los XLSX del disco, sin escribirlos. |

El formato de intercambio se declara en
[`shared/modules/informatica/texto.ts`](../../shared/modules/informatica/texto.ts)
y lo lee
[`server/parseInformaticaTexto.ts`](../../server/parseInformaticaTexto.ts). Los
tres puntos deben cambiar juntos si se modifica una sección de `PLANO`.

## Instalación, una sola vez

1. Abrir `SSCC- Informe Semanal limpio` en Google Sheets.
2. Entrar en `Extensiones > Apps Script`, sustituir el contenido por
   `Codigo.gs`, guardar y volver a cargar la hoja.
3. Ejecutar `⭐ Informática Weekly > Inicializar hoja`.
4. Revisar en `Configuración` las carpetas de entrada y salida y la ventana de encuestas.
5. Autorizar la lectura de Drive y la escritura en la hoja cuando Google lo
   solicite. Los permisos corresponden a la cuenta que ejecuta el script.

`Inicializar hoja` crea únicamente las pestañas auxiliares que falten y aplica
las reparaciones idempotentes del libro. No reemplaza los maestros mantenidos
por el equipo.

## Rutina semanal

1. Dejar en la carpeta un solo fichero de cada tipo: backlog, liberadas,
   gestionadas, **Acumuladas**, peticiones IMAC y el template semanal. El
   template contiene encuestas, work orders y citas. Añadir también los dos
   libros de Renove, `Renove Global PC España` y `Renove Global PC Holding`,
   que alimentan las dos páginas de Renove. El nombre de Acumuladas tiene que
   contener la palabra `Acumuladas`; el recuento mensual de posiciones
   (filas, no peticiones distintas) por `Fecha Gestionado` se escribe en
   `2.2.1 Volum de peticiones (Informe)`: agosto 2026 en `Q11`, septiembre
   en `Q12`, y así. Sin ese fichero el proceso no se detiene, pero
   `Comprobación` apunta `Acumuladas (ausente)` y la serie anual no avanza.
2. Ejecutar `⭐ Informática Weekly > Procesar semana`. La fecha de extracción
   la escribe el propio proceso: es el día de hoy. No hay que abrir
   `Configuración` para ponerla, ni para vaciarla. Las carpetas y los 19 meses
   de encuestas siguen en esa pestaña y ya vienen rellenos.
3. Revisar las siete líneas de `Comprobación`: archivo leído, fecha de
   modificación, filas leídas y escritas, desconocidos, cierre de meses
   pendientes, citas de **esa** semana y el nombre del TXT generado.
4. Subir el TXT que el propio proceso deja en `Carpeta salida PLANO`
   (`Informatica YYYY-MM-DD.txt`) en `Informática > Texto plano (Drive)`.
   El menú `Guardar PLANO como .txt` sigue existiendo por si hay que
   regenerarlo a mano. El TXT nunca se guarda junto a los Excel de
   `Carpeta Drive`.

Pulsar `Procesar semana` otra vez el mismo día vuelve a leer la carpeta y
reescribe los datos. No copia otra vez *Semana anterior*: esa columna solo
rueda cuando el día cambia. `Última extracción procesada` la escribe el
proceso. Vaciarla obliga a copiar *Semana anterior* en la siguiente ejecución;
en un día normal no hace falta tocarla.

Si la celda trae una fecha posterior a hoy, el proceso la sustituye por hoy
antes de leer los ficheros. La fecha decide qué meses se cierran, y una fecha
futura cerraría el mes en curso con datos parciales. Antes de la primera
escritura de datos se validan además las pestañas del template que pueden
fallar (HIC, comparativas, SLAs y la columna `Estado` de citas), para que un
origen mal formado detenga el proceso sin dejar el libro a medias.

Cuando la extracción pasa a un mes nuevo, el proceso cierra solo el mes que
quedó atrás (agosto se cierra al informar septiembre). Ya no hay paso manual de
cierre: ver *Cierre de mes*.

El cierre mensual de peticiones es otro trío con la misma cabecera:
`BacklogMes`, `LiberadasMes` y `GestionadasMes`, o con el mes en el nombre
(`BacklogSeptiembre`, `GestionadasSeptiembre`, `LiberadasSepriembre`; se admite
una errata). Basta subirlo una vez al mes: el proceso lo guarda en la pestaña
`Peticiones mes` y las semanas siguientes lo vuelven a emitir en `PLANO` hasta
que llega el siguiente cierre. Los semanales llevan fecha (`Backlog 20261005`);
un nombre con una palabra distinta del mes tras el tipo se sigue leyendo como
semanal.

Los ficheros se reconocen por cabeceras. Backlog, liberadas, gestionadas y
Acumuladas se distinguen por nombre porque comparten exactamente el mismo
formato, y los dos libros de Renove también: el ámbito está en el nombre del
fichero y no dentro del libro. Si falta un origen obligatorio, el proceso se
detiene antes de escribir datos.

Los dos libros de Renove y `Acumuladas` son opcionales: el proceso no se
detiene sin ellos. De cada libro de Renove se leen solo sus cuatro pestañas
derivadas (`Onboarding semanal`, `Renovados onboarding`, `Renove semanal`,
`Renovados renove`), nunca las crudas `Renove` ni `Onboarding y averías` de las
que salen, porque contarlas sumaría cada equipo dos veces. Si falta uno de los
dos, `Comprobación` escribe `Renove España (ausente)` o `Renove Holding
(ausente)` y ese ámbito sale vacío; si faltan los dos, el TXT sale sin sección
`RENOVE`. Sin Acumuladas escribe `Acumuladas (ausente)` y la rejilla anual de
2.2.1 se queda como estaba, salvo la semilla de agosto 2026.

Hasta el 21/09/2026 el origen era `Dashboards Renoves SSCC`, el tablero donde
ambos libros publicaban sus pestañas. Ese paso desaparece de la rutina: sus
cuatro pestañas `España - …` estaban publicadas desde el libro de Holding, así
que el informe contaba Holding dos veces (789 renovados) y la población de
España no llegaba nunca. Leídos los dos libros, son 858 renovados, 431 de
España y 427 de Holding, con dos peticiones en común de 978.

Las citas del template `6-6 - Citas Smart Tech` alimentan la slide 2.3.3 y, a
la vez, `2.3.1 (Informe)`: `AT` es agosto 2026, `AU` septiembre, y el script
añade columnas antes de `Ene` cuando el mes nuevo lo necesita. El histórico
anual (`AX` = 2022 … `BB` = 2026, `BC` = 2027) recibe el total del mes. Las
fechas del export van en formato americano.
De ese libro se leen sus ocho pestañas `Holding - …` y `España - …`; cualquier
copia de trabajo con otro nombre se ignora para no contar equipos dos veces.

## Cierre de mes

Las tablas mensuales del libro (`2.1.1`, `Hoja 13`, `Hoja 14`, `Hoja 15` y el
histórico de `2.1.5. Encuestas (Informe)`) se escriben como valores dentro de
`Procesar semana`, después de volcar los datos:

| Mes | Qué pasa |
| --- | --- |
| El de la extracción | Vivo: se reescribe en cada ejecución. |
| Los anteriores aún sin cerrar | Se escriben una vez con este export y quedan cerrados. Normalmente es solo el mes anterior. |
| Los posteriores a la extracción | Se vacían. |

El mes cerrado no vuelve a cambiar aunque llegue una encuesta tardía o una
corrección. Por eso conviene que la primera ejecución del mes sea el export del
día 1, que trae el mes anterior completo. `Configuración > Último mes cerrado`
guarda hasta dónde llega lo cerrado; vaciarlo o poner un mes anterior obliga a
reescribir los meses siguientes en la próxima ejecución.

De dónde sale cada cifra:

- Incidencias (`2.1.1`, `Hoja 13`, `Hoja 15!B`): pestañas `3-3` y `4-4` del
  template, mes a mes.
- Encuestas: pestaña `1-1`, respuestas valoradas de 1 a 5 y su media.
- Work orders (`Hoja 14`, `Hoja 15!C`): la tabla Edificio × tipo de
  `2.1.6 Work Orders (Informe)`, con sus marcadores `H1:I1` puestos en cada mes.
  Cuenta por territorial y tipo, como el informe; los técnicos sin territorial
  de `Comprobación` quedan fuera.

`Hoja 19` (IMACS) no se congela: cada par de columnas lleva sus propias fechas.
El script añade los pares hasta el mes vivo y vacía los posteriores.

Una ejecución con fecha equivocada se corrige con la siguiente ejecución con la
fecha buena: lo que abrió de más se vacía. Lo único que no se deshace solo es un
mes que llegó a cerrarse; para reescribirlo hay que retroceder `Último mes
cerrado`.

## Decisiones de datos

- `PLANO` contiene recuentos agregados, nunca identificadores, nombres de
  técnicos ni respuestas libres.
- Las posiciones de peticiones suman la columna semántica `Cantidad`. El libro
  de referencia usa `Días Reales` en dos orígenes y puede mostrar 38.558
  supuestas posiciones en la muestra; esa diferencia es un defecto conocido
  de sus fórmulas, no una pérdida del script.
- Las fuentes semanales son vivas. Una respuesta tardía o una corrección puede
  hacer que un mes ya cerrado difiera de la foto congelada del libro limpio.
- `PLANO` emite el histórico mensual completo disponible para que importar dos
  veces el mismo texto deje el mismo resultado en la base de datos.

## Verificación local

El arnés carga el mismo `Codigo.gs`, comprueba primero la resolución dual de
los 20 nombres nativos de Google Sheets y sus alias del XLSX sin crear pestañas
duplicadas, clasifica los cinco orígenes por cabecera, lee los maestros del
libro limpio y genera el texto sin acceder a Drive ni modificar ningún XLSX:

```bash
node scripts/informatica-drive/verificar-local.mjs "C:/ruta/Informática SSCC" 2026-08-24 > tmp/plano-20260824.txt
```

La salida estándar contiene solo el texto importable. El resumen de secciones,
archivos leídos e ignorados se escribe por la salida de error.

### Contraste de la muestra del 24/08/2026

El contraste se hizo contra los seis XLSX de esa fecha, sin recalcular ni
modificar el libro limpio:

| Métrica | `PLANO` | Libro limpio | Explicación |
| --- | ---: | ---: | --- |
| Peticiones en vuelo | 733 | 1.104 (`2.2.1…Informe!H4`) | El dato correcto son las 733 filas del backlog. La fórmula de `D4` resta `E5:G5`, de liberadas, en vez de `E4:G4`, y duplica parte del reparto. |
| Posiciones en vuelo | 740 | 38.558 (`2.2.1…Informe!H11`) | `PLANO` suma `Cantidad`; el libro usa `Días Reales` en On Site y BBVA Technology. |
| Work orders de agosto | 585 | 576 (`2.1.6…Informe!N43`) | El template vivo contiene nueve órdenes más que la foto congelada en el libro limpio. |
| Encuestas de agosto | 91, media 4,923076923 | 91, media 4,923076923 (`2.1.5…Informe!C22:D22`) | Coincidencia exacta. |

Por tanto, una diferencia no se corrige a ciegas para hacer coincidir dos
números. Primero se decide si la fuente cambió después de congelar el libro o
si la fórmula del libro representa otra magnitud.
