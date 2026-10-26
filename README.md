# Ponci Tracker

App web personal (PWA) para seguir peso y hábitos. HTML, CSS y JavaScript puro: sin frameworks, sin dependencias y sin build. Funciona sin internet y está pensada para iPhone (Safari) y computador.

## Archivos

`index.html`, `styles.css`, `app.js`, `sw.js` (modo offline), `manifest.webmanifest`, `icon.svg` y los PNG de íconos.

## Probar en local

```bash
python3 -m http.server 8000   # y abrir http://localhost:8000
```

(El service worker solo funciona con http://localhost o https.)

## Publicar gratis

### GitHub Pages
1. Sube estos archivos a la raíz de un repositorio de GitHub.
2. En **Settings → Pages**, elige *Deploy from a branch*, rama `main` (o la que uses) y carpeta `/ (root)`.
3. Tras un minuto tendrás la app en `https://TU-USUARIO.github.io/NOMBRE-REPO/`.

### Netlify
1. Entra a [app.netlify.com/drop](https://app.netlify.com/drop).
2. Arrastra la carpeta del proyecto. Netlify te da una URL `https://algo.netlify.app`.

## Instalar en el iPhone

1. Abre la URL en **Safari** (no en Chrome).
2. Toca **Compartir** (cuadrado con flecha hacia arriba) → **Agregar a pantalla de inicio** → **Agregar**.
3. Ábrela desde el ícono: se ve a pantalla completa y funciona sin conexión.

> Safari puede borrar los datos de sitios que no se abren por varios días. Instalada en la pantalla de inicio es mucho más segura, pero igual **haz un respaldo una vez al mes** (Ajustes → Exportar datos, o el botón de descarga arriba a la derecha).

## Datos y respaldo

- Todo se guarda en `localStorage` del dispositivo (clave `ponci-tracker:v1`). Nada sale a internet.
- Exportar descarga `ponci-tracker-AAAA-MM-DD.json`; Importar lo restaura.
- Los datos del iPhone y del computador son independientes; para pasarlos, exporta e importa.

## Probar con datos de ejemplo

Ajustes → *Herramientas de prueba* → **Cargar datos de ejemplo** crea 8 semanas falsas para ver gráfico, avisos, proyección y racha. Tus datos reales se guardan aparte y se restauran con **Quitar datos de ejemplo**.

## Actualizar la app

Si cambias archivos, sube la constante `VERSION` en `sw.js` para que los dispositivos descarguen la versión nueva.
