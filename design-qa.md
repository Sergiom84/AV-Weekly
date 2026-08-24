# Design QA - correcciones visuales de Informática

## Fuentes visuales

- Etiquetas de columnas: `C:/Users/sergi/AppData/Local/Temp/codex-clipboard-8952c309-b63e-49e3-bf86-1081df87f463.png` (1316 × 461 px, 120 dpi).
- Bloques Top Ten: `C:/Users/sergi/AppData/Local/Temp/codex-clipboard-6fe49f2a-38da-4a96-95c4-c8c0e0ce4960.png` (662 × 563 px, 120 dpi).
- Tabla AV de referencia: `C:/Users/sergi/AppData/Local/Temp/codex-clipboard-c0a64467-3635-4a36-8511-05a6d8417d84.png` (1302 × 298 px, 120 dpi).

## Implementación revisada

- Slide 3: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/informatica-hic-visual-fix.png` (849 × 478 px).
- Slide 5: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/informatica-top-visual-fix.png` (849 × 478 px).
- Slide 7: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/informatica-wo-visual-fix.png` (842 × 476 px).
- Comparaciones normalizadas: `output/qa-compare-hic.png`, `output/qa-compare-top.png` y `output/qa-compare-workorders.png`.
- Ruta local: `http://localhost:3510/informatica`.

## Viewport y estado

- Escritorio: 1392 × 746 CSS px; slide medida en 848,8 × 477,45 CSS px; densidad 1.
- Móvil: 390 × 844 CSS px; densidad 1.
- Tema claro, deck bloqueado, datos locales de julio de 2026.
- Las referencias parciales y las capturas de implementación se escalaron a la misma altura en cada comparación conjunta; se comparó contenido, no navegador ni panel lateral.

## Comparación completa y focal

- Slide 3: las cuatro etiquetas de cada mes conservan todos sus valores y ocupan niveles verticales distintos. La comprobación geométrica encontró 66 etiquetas y 0 intersecciones.
- Slide 5: Portátil, Software y Sistema Operativo tienen la misma caja (387,26 × 117,78 CSS px), separación uniforme y los mismos estilos computados: título 8,27 px/600; cabecera y filas 6,70 px/400; total con el mismo ritmo y anclado abajo.
- Slide 7: mantiene los 23 edificios, 14 tipos, 107 combinaciones y total 1.152. La cabecera y el total usan el color primario de AV; la primera columna se diferencia, cada fila tiene total y las semanas 27–31 quedan visibles.

## Superficies de fidelidad

- Tipografía: JetBrains Mono y Cormorant Garamond existentes; jerarquías consistentes y sin mezcla de tamaños entre bloques equivalentes.
- Espaciado: tres filas idénticas en Top Ten; no hay colisiones, recortes de slide ni overflow de viewport.
- Color: se reutilizan `primary`, `primary-foreground`, `muted` y `border`; no se introducen colores nuevos.
- Imágenes e iconos: no hay activos gráficos que recrear; las referencias son tablas y gráficos nativos.
- Contenido: cifras, meses, edificios, tipos y totales proceden del dataset; no se ocultan ni inventan datos.
- Accesibilidad y estados: roles de tabla conservados, títulos largos disponibles mediante `title`, consola sin errores/avisos, escritorio y móvil sin overflow horizontal.

## Historial de correcciones

1. [P1] Las etiquetas agrupadas compartían línea base y formaban números ilegibles. Se sustituyeron por etiquetas con nivel estable por serie, margen superior calculado, tamaño compacto y halo de fondo. Evidencia posterior: 0 intersecciones en `qa-compare-hic.png`.
2. [P2] Cada tabla de Top Ten se autoescalaba de forma independiente, produciendo tipografía y ritmo distintos. Se creó una única tabla de detalle con métricas fijas para los tres bloques. Evidencia posterior: estilos computados y alturas iguales en `qa-compare-top.png`.
3. [P2] WorkOrders no compartía la jerarquía visual de AV 7. Se aplicaron cabecera/pie primarios, primera columna diferenciada, bordes, totales y contexto semanal. Una transposición literal habría generado 107 filas; se mantuvo la matriz completa y legible. Evidencia posterior: `qa-compare-workorders.png`.

## Seguimiento menor

- La cabecera de WorkOrders es necesariamente densa por sus 14 tipos. Se permite salto de línea y tooltip en pantalla; es una restricción esperada por conservar toda la información en una slide.

final result: passed
