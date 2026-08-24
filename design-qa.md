# Design QA - segunda corrección visual de Informática

## Fuentes visuales

- Slide 3: `C:/Users/sergi/AppData/Local/Temp/codex-clipboard-8952c309-b63e-49e3-bf86-1081df87f463.png` (1316 × 461 px), con la colisión original como evidencia del defecto.
- Slide 5: `C:/Users/sergi/AppData/Local/Temp/codex-clipboard-0677eb02-286a-4621-bbf3-ce0bdc3a6343.png` (660 × 511 px), con los huecos Portátil–Total y Total–Sistema Operativo.
- Slide 7: `C:/Users/sergi/AppData/Local/Temp/codex-clipboard-b979cb38-89db-48d3-bfc9-db59cfd8eb07.png` (1300 × 62 px), con la cabecera recortada.
- La instrucción escrita del usuario prevalece sobre los defectos visibles de estas capturas: eliminar cascada/solapes, compactar bloques y mostrar completos los encabezados.

## Implementación revisada

- Slide 3: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/qa-final/slide-3.png` (864 × 518 px).
- Slide 5: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/qa-final/slide-5.png` (864 × 518 px).
- Slide 7: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/qa-final/slide-7.png` (864 × 518 px).
- Comparaciones conjuntas: `output/qa-final/comparison-slide-3.png`, `output/qa-final/comparison-slide-5.png` y `output/qa-final/comparison-slide-7.png`.
- Ruta local: `http://localhost:3510/informatica`.

## Viewport, densidad y estado

- Escritorio solicitado: 1392 × 746 CSS px; el navegador útil quedó en 1377 × 738 px por su barra de desplazamiento. Slide medida en 864 × 517,6 CSS px. `deviceScaleFactor: 1`.
- Móvil: 390 × 844 CSS px; área útil de 375 px. `deviceScaleFactor: 1`.
- Tema claro, deck bloqueado, datos locales de julio de 2026.
- Las comparaciones focales se normalizaron a una anchura común; no se comparó el panel lateral ni el marco del navegador.

## Comparación completa y focal

- Slide 3: las 66 cifras permanecen visibles y en lectura horizontal. Las parejas se abren a izquierda/derecha, las columnas usan `barGap: 0` y `barCategoryGap: 2%`, y la comprobación geométrica devuelve 0 intersecciones. Tamaño mínimo renderizado en el editor: 6,02 px; en el lienzo completo escala con `cqi`.
- Slide 5: el último dato y Total tienen 0 px de hueco artificial en los tres bloques. La distancia Total–siguiente bloque es idéntica en Portátil y Software: 5,61 px.
- Slide 7: la tabla ocupa el 103% del ancho anterior, centrada. Los 16 encabezados se revisaron individualmente: desbordamiento horizontal máximo 0 px y vertical máximo 0 px; el cuerpo, los 23 edificios, 14 tipos y total 1.152 no cambian.

## Superficies de fidelidad

- Tipografía: se conservan Cormorant Garamond y JetBrains Mono. Sólo la cabecera `report` reduce su escala; el cuerpo y los totales mantienen la jerarquía existente.
- Espaciado y layout: gráfico sin cascada, bloques Top Ten en flujo natural y tabla WorkOrders ampliada sin salir del lienzo.
- Colores y tokens: se reutilizan `primary`, `primary-foreground`, `muted`, `foreground` y `border`; no se añaden colores ni superficies nuevas.
- Imágenes y activos: no existen imágenes que recrear en estas tres zonas; gráficos y tablas siguen siendo elementos nativos y nítidos.
- Copia y contenido: no se ocultan, inventan ni reclasifican cifras, meses, edificios o tipos. Los textos completos de WorkOrders siguen en `title` y en el encabezado visible.
- Accesibilidad y estados: semántica de tabla conservada, tooltips/títulos completos, escritorio y móvil sin overflow horizontal; consola limpia en una pestaña nueva.

## Historial de correcciones

1. [P1] La primera solución escalonó verticalmente las etiquetas de HIC. Se reemplazó por apertura horizontal de cada pareja y columnas más anchas. Evidencia posterior: 66/66 etiquetas, 0 solapes en `comparison-slide-3.png`.
2. [P2] `mt-auto` y tres filas de igual altura alejaban Total de AVERIA y del siguiente bloque. Se eliminó el anclaje inferior y se usó flujo `content-start`. Evidencia posterior: 0 px fila–Total y 5,61 px constantes entre bloques en `comparison-slide-5.png`.
3. [P2] La cabecera WorkOrders partía y recortaba textos. Se amplió la tabla 3%, se redujo sólo la cabecera y se habilitó wrapping controlado. Evidencia posterior: 0 px de overflow en los 16 encabezados y comparación focal en `comparison-slide-7.png`.

## Verificación funcional

- Interacciones probadas: navegación directa a slides 3, 5 y 7; render posterior a recarga; deck bloqueado.
- Navegador: consola final sin errores ni avisos.
- Viewport: escritorio y móvil sin overflow horizontal del documento.
- Prueba discriminante: al forzar todas las etiquetas al mismo anclaje, el test específico falló; la mutación se restauró y volvió a verde.

## Seguimiento menor

- Ningún P0, P1 o P2 pendiente. La densidad de 14 tipos en una sola slide obliga a una cabecera compacta, pero ya no corta contenido.

final result: passed
