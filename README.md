# AV Weekly

AV Weekly es el informe semanal del servicio de Audiovisuales presentado como un deck de
diapositivas editable. Cada página del deck (portada, índice, secciones, soporte semanal y
tendencia mensual) se genera a partir de los datos importados y puede corregirse a mano
desde el propio editor: los valores importados no se modifican, las correcciones viven en
el estado del deck y se guardan en la base de datos.

## Puesta en marcha

```bash
pnpm install
pnpm dev
```

`pnpm dev` levanta a la vez el servidor Express y el cliente Vite. El cliente queda en el
puerto de Vite y la API en `http://localhost:3001`.

Otros comandos:

```bash
pnpm run check   # tsc --noEmit
pnpm run build   # build del cliente y empaquetado del servidor
pnpm start       # arranque en producción sobre dist/
```

## Datos: los dos Excel

El deck se alimenta de dos libros que se suben desde el panel lateral del informe:

- **Plantilla semanal** (`Templates semanales audiovisuales`): hojas en matriz, una fila por
  categoría o ubicación y una columna por semana ISO. Alimenta las páginas de soporte
  semanal, con los desgloses por tipo de soporte, categoría y ubicación.
- **Resueltas del mes** (`Audiovisuales - Resueltas mes anterior`): volcado plano de tickets
  resueltos que se agrega en totales mensuales por tipo de soporte. Alimenta la página de
  tendencia mensual. Cada carga se acumula sobre los meses ya almacenados.

## Base de datos

Por defecto la aplicación usa una base de datos local en fichero: `data/av-weekly.db`. No
hace falta configuración adicional para trabajar en local.

Para apuntar a una base remota libSQL/Turso, define `URL_TURSO` y `TOKEN_TURSO` en un `.env`
en la raíz. Ver `.env.example`.
