# CanvasKit Demo Project

A high-performance web-based graphics editor built with **CanvasKit-WASM** (Skia) and **SvelteKit**, featuring a **FastAPI** backend. This project demonstrates how to build a professional-grade design tool on the web with advanced rendering capabilities, animation support, and video export.

## 1. Features

### 🎨 Rich Graphics Editor
- **High-Performance Rendering**: Powered by CanvasKit (WebAssembly version of Skia), providing native-like drawing performance.
- **Shape Manipulation**: Create, move, resize, and rotate shapes, text, and images with precision.
- **Multi-page Support**: seamless switching between multiple pages within a document.
- **Zoom & Pan**: Infinite canvas navigation with smooth camera controls.

### 🎬 Animation & Video Export
- **Animation Engine**: Support for animated properties on shapes (position, scale, rotation, etc.).
- **Video Recording**: Export your canvas animations directly to video files (WebM/MP4) with synchronized audio.
- **Off-screen Rendering**: Uses dedicated off-screen surfaces for rendering video frames to ensure high quality without affecting the UI.

### ⚡ Real-time & Backend
- **Binary WebSocket Protocol**: Custom binary protocol for efficient bi-directional communication, optimizing the transfer of JSON data alongside binary assets (images/audio).
- **Persistence**: Saves documents, pages, and assets to a SQLite database.
- **Thumbnail Generation**: Automatically generates and caches thumbnails for pages using a background rendering process.

## 2. Tech Stack

### Frontend
- **Framework**: [SvelteKit](https://kit.svelte.dev/) (Svelte 5)
- **Graphics Engine**: [CanvasKit-WASM](https://skia.org/docs/user/modules/canvaskit/)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Bundler**: Vite

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/)
- **Database**: SQLite (via SQLAlchemy)
- **Real-time**: Websockets (standard library + custom manager)
- **Language**: Python 3.x

## 3. Architecture

The application follows a Client-Server architecture designed for performance and real-time capabilities.

```text
+-----------------------------------------------------------+
|                  Client (Frontend / Browser)              |
|                                                           |
|   +----------------+       +------------------------+     |
|   |  SvelteKit UI  | ----> |   CanvasKit Engine     |     |
|   +----------------+       | (WASM Graphics Core)   |     |
|           |                +-----------+------------+     |
|           |                            |                  |
|           v                            v                  |
|   +----------------+       +------------------------+     |
|   | WebSocket Client|      |     Video Recorder     |     |
|   +-------+--------+       +------------------------+     |
+-----------|-----------------------------------------------+
            ^
            |  Binary Protocol (JSON + Raw Bytes)
            v
+-----------|-----------------------------------------------+
|   +-------+--------+       +------------------------+     |
|   |WebSocket Manager|      |        HTTP API        |     |
|   +-------+--------+       +-----------+------------+     |
|           |                            |                  |
|           v                            v                  |
|   +-------------------------------------------------+     |
|   |                 SQLite Database                 |     |
|   +-------------------------------------------------+     |
|                                                           |
|                   Server (Backend / Python)               |
+-----------------------------------------------------------+
```

### Communication Protocol
The project uses a custom **Binary WebSocket Protocol** to handle complex data structures efficiently:
1.  **Header**: 4 bytes indicating the length of the JSON metadata.
2.  **JSON Payload**: UTF-8 encoded JSON string containing event details and document structure.
3.  **Blobs**: Sequence of binary blobs (images, audio) with their lengths, allowing single-message transfer of a document and its assets.

## 4. Performance Highlights

### 🚀 WebAssembly (WASM)
By using **CanvasKit**, the application bypasses the standard HTML5 Canvas 2D API limitations. It uses **Skia**, the same graphics engine that powers Google Chrome, compiled to WebAssembly. This allows for:
- Complex path operations and effects.
- Sub-pixel anti-aliasing.
- Consistent rendering across all browsers.

### 📦 Binary Data Transfer
Traditional REST APIs often struggle with mixed content (JSON + Binary). This project's **WebSocket Binary Protocol** eliminates Base64 encoding overhead (which increases size by ~33%) by streaming raw bytes for images and audio immediately after the JSON metadata in a single frame.

### 🎞️ Dedicated Rendering Pipelines
- **Main Thread**: Handles user interaction and UI rendering.
- **Video Export**: Uses a separate `Surface` and `Canvas` to render frames at target resolutions (720p/1080p/2K) independent of the screen resolution, ensuring consistent export quality.
- **Thumbnails**: Background processes capture low-res snapshots of pages without interrupting the user workflow.
