# Nexo Studio

Demo de un portal de solicitudes para un estudio ficticio de diseño web, identidad visual y analítica de datos.

## Recorrido

1. Abre **Portal de servicios** y solicita cotización para un servicio.
2. Selecciona un proyecto ficticio y guarda la solicitud.
3. En **Solicitudes**, localiza el registro nuevo y cambia su estado a **Cotizada**.
4. Regresa a **Resumen** y consulta el total de cotizaciones. Prueba los filtros de periodo, servicio y estado.

El tablero calcula sus totales a partir de la selección activa. Las tarjetas cuentan estados actuales. El gráfico temporal agrupa las solicitudes por fecha de creación en horario de Bogotá. Los cierres indican seguimiento finalizado.

## Ejecutar en local

Requiere Node.js 24 o posterior. Desde este directorio, ejecuta `npm start` y abre [http://127.0.0.1:8787](http://127.0.0.1:8787). El servidor local usa la misma API y el mismo SQL del Worker, con SQLite integrado en Node como adaptador. Crea la base en `.data/local.sqlite`.

Para generar una vista sin servidor, ejecuta `node scripts/export-preview.mjs Nexo-Demo.html` y abre el HTML en el navegador. Esta variante guarda los cambios en el navegador mediante `localStorage` cuando está disponible.

## Publicar en Cloudflare Workers + D1

Desde el directorio del proyecto, con una cuenta de Cloudflare activa:

```bash
npm install
npx wrangler login
npx wrangler d1 create cotiza-demo-db
```

Sustituye el identificador de ejemplo en `wrangler.jsonc` por el `database_id` devuelto. Si el comando ofrece actualizar automáticamente la configuración del proyecto, verifica que se conserve una sola entrada con binding `DB`. Puedes cambiar `name` en `wrangler.jsonc` si quieres elegir otro nombre de Worker para esta demo.

```bash
npx wrangler d1 migrations apply cotiza-demo-db --remote
npx wrangler deploy
```

Abre la URL que devuelve Wrangler y repite el recorrido. La ruta pública sirve la interfaz y las rutas bajo `/api/` ejecutan el Worker.

## Caso de portafolio

**Problema.** Un estudio recibe solicitudes por distintos canales y necesita saber cuántas están pendientes, cuántas llegaron a cotización y qué servicios generan más demanda.

**Implementación.** La interfaz está hecha con HTML, CSS y JavaScript. El Worker valida el catálogo y los estados. D1 almacena las nuevas solicitudes y los cambios de estado mediante consultas parametrizadas. Las agregaciones SQL aplican los mismos filtros a la tabla, las tarjetas y los gráficos.

**Decisiones.** Los ejemplos iniciales son compartidos y los cambios quedan asociados a la sesión de cada navegador. El formulario usa un catálogo cerrado de proyectos ficticios y el flujo cubre el seguimiento comercial de la cotización. La sesión demo dura siete días.

**Verificación.** Se comprobó con SQLite que el conjunto inicial contiene 16 solicitudes, que crear una añade un registro al tablero, que cambiar el estado incrementa el conteo de cotizadas y que otra sesión conserva sus propios registros.
