# Design QA - Informática

## Referencias

- Fuente visual: `C:/Users/sergi/AppData/Local/Temp/codex-clipboard-4569020f-b0ae-45ef-9e97-e214f193edb2.png`
- Implementación revisada: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/informatica-top-ten.png`
- Encuestas revisada: `C:/Users/sergi/Desktop/Aplicaciones/AV Weekly/output/informatica-encuestas.png`
- Ruta local: `http://localhost:3510/informatica`

## Estado revisado

- Viewport de referencia: 1392 x 746 px, densidad normal.
- Viewport móvil: 390 x 844 px, densidad normal.
- Datos: base local con el maestro de edificios importado.
- Slides focales: 2.1.1, 2.1.3, 2.1.5 y 2.1.6.

## Resultado visual

- La slide 2.1.3 conserva la composición a dos columnas de la referencia.
- La izquierda contiene únicamente el gráfico horizontal de Componentes.
- La derecha presenta Portátil, Software y Sistema Operativo en ese orden.
- La slide 2.1.5 contiene una única tabla con las cinco valoraciones, cantidad y porcentaje.
- No se detectó overflow horizontal en escritorio ni móvil.
- No se detectaron errores o avisos de consola en la instancia aislada.

## Diferencias intencionadas respecto a la captura

- La tabla inferior izquierda de Componentes se sustituye por el gráfico solicitado.
- Sistema Operativo se mueve al tercer bloque derecho y Portátil ocupa el primero.
- Se mantienen tipografía, color, espaciado, bordes y estructura visual existentes.

## Historial de correcciones

1. Primera pasada: distribución y orden correctos; sin desbordamiento.
2. Verificación con BD local: el alias `0182-0065 - ADMON.CENTRAL MADRID` deja de aparecer y se agrupa como `Madrid`.
3. Verificación móvil y consola: sin desbordamiento ni errores.

## Resultado final

PASSED
