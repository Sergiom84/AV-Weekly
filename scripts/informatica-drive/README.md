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
   gestionadas, peticiones IMAC y el template semanal. El template contiene
   encuestas, work orders y citas.
2. Escribir en `Configuración` la fecha de extracción de la semana.
3. Ejecutar `⭐ Informática Weekly > Procesar semana` **una sola vez**.
4. Revisar las siete líneas de `Comprobación`: archivo leído, fecha de
   modificación, filas leídas y escritas, desconocidos, cierre de meses
   pendientes, citas de **esa** semana y el nombre del TXT generado.
5. Subir el TXT que el propio proceso deja en `Carpeta salida PLANO`
   (`Informatica YYYY-MM-DD.txt`) en `Informática > Texto plano (Drive)`.
   El menú `Guardar PLANO como .txt` sigue existiendo por si hay que
   regenerarlo a mano. El TXT nunca se guarda junto a los Excel de
   `Carpeta Drive`.

Si se vuelve a pulsar `Procesar semana` con la misma fecha de extracción, la
columna *Semana anterior* se conserva: no se vuelve a copiar `H4:H6` sobre
`I4:I6`. Cuando la extracción pasa a un mes nuevo, el proceso cierra solo
los meses que ya quedaron atrás (agosto se congela al informar septiembre).
`Cerrar mes` sigue en el menú para congelar el mes en curso a propósito.

Los ficheros se reconocen por cabeceras. Solo backlog, liberadas y gestionadas
se distinguen por nombre porque comparten exactamente el mismo formato. Si
falta un origen obligatorio, el proceso se detiene antes de escribir datos.

## Cierre de mes

El cierre automático ocurre dentro de `Procesar semana` cuando la fecha de
extracción ya pertenece a un mes posterior al que sigue vivo en encuestas.

Para congelar el mes en curso sin esperar (última semana de agosto, extracción
todavía en agosto):

1. Procesar primero esa semana y comprobarla.
2. Ejecutar `⭐ Informática Weekly > Cerrar mes` una sola vez.
3. Confirmar en `Comprobación` las celdas cerradas y el mes nuevo abierto.

El cierre es idempotente: repetirlo para un mes ya cerrado no debe duplicar
columnas ni filas. La distribución histórica de encuestas sale de las
respuestas anonimizadas del template, no se reconstruye a partir de una media.

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
