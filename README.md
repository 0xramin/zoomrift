# Zoomrift (Static WebGL Edition)

A pure static HTML/CSS/JS + WebGL infinite zoom viewer ported from the Zoomquilt Android app (`org.zoomquilt.zoomapp`), ready to deploy on **GitHub Pages** with zero build tools or backend.

## Features
- **6 Infinite Zoom Artworks** (`The Zoomquilt`, `Zoomquilt 2`, `Arkadia`, `Infinite Flowers`, `Hydromeda`, `Organic City`) with seamless exponential zooming.
- **On-Demand Streaming & LRU Texture Cache**: Loads visible layers first and prefetches upcoming tiles in the zoom direction without loading all 376 images into VRAM at once.
- **2-Pass WebGL Post-Processing**: Uses `postprocess.glsl` via an offscreen framebuffer (`Original`, `Hue`, `Fade`, `Prism`, `Swirl`, `Acid`, plus `Brightness`, `Contrast`, `Saturation`, and `Random Center Offset`).
- **Interactive Controls**:
  - Drag vertically on the canvas to dynamically zoom in/out; release to return smoothly to slider speed.
  - Scroll mouse wheel to scrub through layers.
  - Tap/click canvas (or press `H`) to hide/show the HUD.
  - Shortcuts: `Space` (play/pause), `←` / `→` (switch artwork), `↑` / `↓` (adjust speed), `R` (randomize), `F` (fullscreen).
  - URL parameters supported: e.g. `?quilt=zq2&fx=prism&speed=1.5`.

## Deploying to GitHub Pages
1. Create a new GitHub repository and push the contents of this folder (`index.html`, `styles.css`, `.nojekyll`, `js/`, `assets/`).
2. In your repository on GitHub, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose your branch (e.g. `main`) and folder `/ (root)`, then click **Save**.
4. Wait ~1–2 minutes for GitHub Pages to publish your static site.
