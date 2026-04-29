# 3D Model Viewer

3D Model Viewer: [https://andrewsink.github.io/3d-model-viewer/](https://andrewsink.github.io/3d-model-viewer/)

A simple, browser-based viewer for common 3D model files. Open the page, drop in a model, and orbit around it. Designed for non-technical users who just want to see what an `.stl` file (or similar) looks like.

A live example screenshot, the build platform, the orbit controls, and the screenshot button are all you need — no accounts, no installs, no sign-ups.

## Privacy: your files never leave your computer

**This is the most important thing to know about this tool.**

Every file you upload is processed entirely inside your own browser tab. The viewer does not upload your model anywhere. There is no server, no API, no analytics, no telemetry, and no third-party file sharing of any kind.

Specifically:

- The file you choose is read by the browser into local memory using the standard `FileReader` API.
- Parsing happens locally — Three.js parses `.stl` / `.obj` / `.ply` in JavaScript, and `.step` / `.stp` is parsed by an OpenCascade WebAssembly module that also runs entirely in your browser.
- Rendering happens locally — Three.js draws the model using your computer's GPU through WebGL.
- The "Screenshot" button creates a PNG using the browser's `canvas.toDataURL()` API and triggers a normal download to your computer's default download folder. Nothing is uploaded.

## Features

- **Supported formats**: `.stl`, `.obj`, `.ply`, `.step` / `.stp`
- **Z-up orientation** — matches the convention used by most CAD/CAM tools
- **Build platform** — a 200 × 200 mm grid centered at the origin to give models a sense of scale
- **Orbit / pan / zoom** with the mouse
- **Right-sidebar control panel**:
  - **File**: pick a model
  - **Display**: pick the model's color, toggle wireframe mode
  - **View**: reset the camera framing, toggle a rotate gizmo for spinning the model around any axis
  - **Export**: save a PNG screenshot of the viewport to your Downloads folder

## Tech stack

- Static HTML + ES modules — no bundler, no framework
- [Tailwind CSS](https://tailwindcss.com/) (Play CDN runtime) for styling
- [Three.js](https://threejs.org/) `0.160.0` for rendering, controls, and `.stl` / `.obj` / `.ply` loaders
- [occt-import-js](https://github.com/kovacsv/occt-import-js) `0.0.23` (OpenCascade compiled to WebAssembly) for `.step` / `.stp` parsing, lazy-loaded only when needed

## Files

- `index.html` — page layout and Tailwind classes
- `main.js` — Three.js scene, file loading, sidebar wiring, screenshot
- `model.stl` — the default model that loads on page open

## Author

Andrew Sink — 2026 — <https://andrewsink.xyz>
