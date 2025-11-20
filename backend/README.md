# Image Editor Backend

This is the Python backend for the CanvasKit Image Editor, built with FastAPI, SQLAlchemy (SQLite), and WebSockets.

## Features

-   **SQLite Database**: Stores documents, pages, shapes, and audio assets.
-   **WebSockets**: Real-time communication using a custom binary protocol for efficiency.
-   **Image Proxying**: Fetches images and serves them as binary blobs to the frontend.
-   **Data Seeding**: Automatically seeds the database with mock data on startup.

## Setup

### Prerequisites

-   Python 3.8+
-   `pip` (Python package installer)

### Installation

1.  Navigate to the `backend` directory:
    ```bash
    cd backend
    ```

2.  Create a virtual environment:
    ```bash
    python -m venv venv
    ```

3.  Activate the virtual environment:
    -   **macOS/Linux**:
        ```bash
        source venv/bin/activate
        ```
    -   **Windows**:
        ```bash
        venv\Scripts\activate
        ```

4.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

## Running the Server

Start the development server:

```bash
python main.py
```

Or use `uvicorn` directly (ensure you are in the project root or adjust the path):

```bash
# From project root
uvicorn backend.main:app --reload --port 8000
```

The server will start at `http://0.0.0.0:8000`.

## Database Seeding

The server automatically checks for data on startup. If the database is empty, it seeds it with data from `backend/mocks/`.

-   **Documents**: `backend/mocks/beautiful_mock_data.json`
-   **Audio**: `backend/mocks/audio.json`

## WebSocket API

The WebSocket endpoint is available at `/ws`. It uses a custom **Binary Protocol** for all messages to ensure efficient transfer of binary assets (images).

### Binary Protocol Format

All messages (incoming and outgoing) follow this structure:

1.  **JSON Length** (4 bytes, Big-Endian Integer): The size of the JSON metadata payload.
2.  **JSON Payload** (UTF-8 Bytes): The metadata describing the event (e.g., `{"event": "document_loaded", ...}`).
3.  **Binary Blobs** (Optional, Repeated):
    -   **Blob Length** (4 bytes, Big-Endian Integer)
    -   **Blob Data** (Raw Bytes)

### Events

#### Client -> Server

-   **Ping**: `{"event": "ping"}` (or simple string `"ping"`)
-   **Load Document**: `{"event": "load_document", "document_id": "1"}`
-   **Load Audio**: `{"event": "load_audio"}`

#### Server -> Client

-   **Pong**: `{"event": "pong"}`
-   **Document Loaded**: `{"event": "document_loaded_binary", "data": {...}}` followed by image blobs.
    -   Images in the JSON have a `binaryId` field corresponding to the index of the blob in the message.
-   **Audio Loaded**: `{"event": "audio_loaded", "data": [...]}`
-   **Error**: `{"event": "error", "message": "..."}`
