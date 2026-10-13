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

`pnpm dev` levanta a la vez el servidor Express y el cliente Vite. Por defecto el cliente
queda en `http://localhost:3500` y la API en `http://localhost:3501`.

Otros comandos:

```bash
pnpm run check   # tsc --noEmit
pnpm run build   # build del cliente y empaquetado del servidor
pnpm start       # arranque en producción sobre dist/
```

### Uso local en un equipo de trabajo

La aplicación no necesita Render ni una base de datos remota. La primera vez,
con Node.js LTS instalado, ejecuta `scripts/Preparar-AV-Weekly.ps1`: instala las
dependencias y compila la aplicación. Después basta con hacer doble clic en
`Iniciar-AV-Weekly.cmd`. El script inicia el servidor únicamente en
`http://localhost:3000` y abre esa dirección en el navegador; no publica nada
en Internet. Si hay que cerrarla al terminar la jornada, ejecuta
`Detener-AV-Weekly.cmd`.

Conviene instalarla en una carpeta donde el usuario tenga permisos de escritura
(por ejemplo, dentro de `Documentos`), no en `Program Files`. La carpeta `data/`
contiene la base de datos y las imágenes subidas: es la única carpeta que hay
que copiar para conservar o restaurar los informes.

En equipos gestionados, el preparador no intenta instalar `pnpm` en `Program
Files`: usa Corepack desde el perfil del usuario. Aun así necesita acceso a
`registry.npmjs.org` solo durante esa primera preparación.

Si la red corporativa usa un proxy con certificado propio o bloquea el registro,
prepara el paquete en un equipo con acceso antes de trasladarlo:

```powershell
.\scripts\Empaquetar-AV-Weekly-Portable.ps1
```

El resultado queda en `release/AV-Weekly-portable`. Copia esa carpeta al portátil
y usa directamente `Iniciar-AV-Weekly.cmd`: no ejecuta `pnpm`, Corepack ni ninguna
descarga. El paquete incluye el servidor compilado, el cliente y únicamente las
dependencias de producción. Debe generarse en Windows con la misma arquitectura de
Node que el portátil, porque SQLite incluye un componente nativo.

Los informes, la base de datos y las imágenes no se incluyen dentro del paquete:
al primer arranque se crean en la carpeta hermana `AV Weekly - Datos`. Así se puede
sustituir `AV-Weekly-portable` por una versión nueva sin perder los datos. Para una
copia de seguridad, conserva esa carpeta hermana.

## Informes guardados de AV

Después de revisar una presentación, pulsa **Guardar informe** en el apartado
**Informes guardados** del panel lateral. Se conserva el PDF completo, incluidas
las imágenes, los filtros y las correcciones de ese momento. Los iconos de ver
y descargar recuperan ese mismo archivo aunque el informe actual haya cambiado.

Se guardan las cinco semanas más recientes. Guardar otra vez una misma semana
actualiza su PDF; al guardar una sexta semana se elimina la más antigua del
histórico. Los archivos se identifican por año y semana y persisten en libSQL,
también después de reiniciar o desplegar la aplicación. Las copias técnicas de
las importaciones conservan su funcionamiento independiente.

## Datos: los dos Excel

El deck se alimenta de dos libros que se suben desde el panel lateral del informe:

- **Plantilla semanal** (`Templates semanales audiovisuales`): hojas en matriz, una fila por
  categoría o ubicación y una columna por semana ISO. Alimenta las páginas de soporte
  semanal, con los desgloses por tipo de soporte, categoría y ubicación.
- **Resueltas del mes** (`Audiovisuales - Resueltas mes anterior`): volcado plano de tickets
  resueltos que se agrega en totales mensuales por tipo de soporte. Alimenta la página de
  tendencia mensual. Cada carga se acumula sobre los meses ya almacenados.

## Base de datos

Por defecto la aplicación usa una base de datos local en fichero: `data/av-weekly.db`. Al
primer arranque crea automáticamente el fichero y todas las tablas necesarias; no hace
falta ejecutar SQL ni instalar un servidor de base de datos.

Para apuntar a una base remota libSQL/Turso, define `URL_TURSO` y `TOKEN_TURSO` en un `.env`
en la raíz. Ver `.env.example`.
