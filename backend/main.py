from __future__ import annotations

import sys
import os

# Add the project root to sys.path to allow imports from 'backend'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import json
import struct
from contextlib import asynccontextmanager
from typing import Any, List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.database import SessionLocal
from backend.seed import seed_data
from backend.models import Document
from backend.websocket_manager import ConnectionManager
from backend.crud import get_document_data, get_audio_data, update_shape, create_shape, sync_page_shapes


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize and seed database on startup
    print("Seeding database...")
    seed_data()
    
    # Verify loaded data
    db = SessionLocal()
    try:
        docs = db.query(Document).all()
        print(f"Available Documents after seed: {[doc.id for doc in docs]}")
    finally:
        db.close()
        
    yield


app = FastAPI(title="Editor Backend", lifespan=lifespan)

# Allow your Svelte dev server to talk to the API in development.
# Adjust origins as needed for production.
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
		"https://canvaskit-demo.railway.internal"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


manager = ConnectionManager()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


async def send_binary_response(websocket: WebSocket, json_data: Any, blobs: List[bytes]) -> None:
    """
    Sends a binary frame:
    [4 bytes: JSON Length]
    [JSON Payload]
    [4 bytes: Blob 1 Length] [Blob 1]
    ...
    """
    json_bytes = json.dumps(json_data).encode("utf-8")
    json_len = len(json_bytes)
    
    payload = bytearray()
    payload.extend(struct.pack(">I", json_len))
    payload.extend(json_bytes)
    
    for blob in blobs:
        blob_len = len(blob)
        payload.extend(struct.pack(">I", blob_len))
        payload.extend(blob)
        
    await manager.send_bytes(bytes(payload), websocket)


async def send_binary_json(websocket: WebSocket, json_data: Any) -> None:
    """Helper to send simple JSON data wrapped in the binary protocol (0 blobs)."""
    await send_binary_response(websocket, json_data, [])


async def broadcast_binary_json(json_data: Any, exclude: WebSocket = None) -> None:
    """Broadcasts a binary JSON message to all connected clients, optionally excluding one."""
    for connection in manager.active_connections:
        if connection != exclude:
            try:
                await send_binary_json(connection, json_data)
            except Exception:
                # Connection might be closed or erroring
                pass


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """
    Handles WebSocket connections and events.
    ALL communications are now binary frames.
    
    Incoming Format:
    - Just UTF-8 JSON bytes.
    
    Outgoing Format (Binary Protocol):
    [4 bytes BigEndian: JSON Length]
    [JSON Payload (UTF-8)]
    [Optional: 4 bytes Blob 1 Length + Blob 1 Data...]
    """
    await manager.connect(websocket)

    try:
        while True:
            # Receive bytes instead of text
            data_bytes = await websocket.receive_bytes()

            # Parse incoming bytes as UTF-8 JSON
            try:
                data_text = data_bytes.decode("utf-8")
                message = json.loads(data_text)
            except (UnicodeDecodeError, json.JSONDecodeError):
                await send_binary_json(websocket, {
                    "event": "error",
                    "message": "Invalid JSON bytes"
                })
                continue

            # Handle "ping" (string) or {"event": "ping"}
            if message == "ping" or (isinstance(message, dict) and message.get("event") == "ping"):
                 await send_binary_json(websocket, {"event": "pong"})
                 continue

            event_type = message.get("event") if isinstance(message, dict) else None

            if event_type == "load_document":
                doc_id = message.get("document_id")
                if doc_id:
                    db = SessionLocal()
                    try:
                        doc_structure, _ = get_document_data(db, doc_id)
                        
                        if doc_structure:
                            response_event = {
                                "event": "document_loaded_binary",
                                "data": doc_structure
                            }
                            await send_binary_json(websocket, response_event)
                        else:
                            await send_binary_json(websocket, {
                                "event": "error",
                                "message": "Document not found"
                            })
                    finally:
                        db.close()
            
            elif event_type == "load_audio":
                db = SessionLocal()
                try:
                    audio_data = get_audio_data(db)
                    await send_binary_json(websocket, {
                        "event": "audio_loaded",
                        "data": audio_data
                    })
                finally:
                    db.close()
            
            elif event_type == "shape_update":
                data = message.get("data")
                shape_id = data.get("id")
                if shape_id:
                    db = SessionLocal()
                    try:
                        updated_shape = update_shape(db, shape_id, data)
                        if updated_shape:
                            # Broadcast to all OTHER clients
                            await broadcast_binary_json({
                                "event": "shape_updated",
                                "data": updated_shape
                            }, exclude=websocket)
                    finally:
                        db.close()
            
            elif event_type == "shape_create":
                data = message.get("data")
                page_id = message.get("page_id")
                if data and page_id:
                    db = SessionLocal()
                    try:
                        # Remove temporary ID if present, let DB assign one
                        if "id" in data:
                            del data["id"]
                            
                        new_shape = create_shape(db, page_id, data)
                        if new_shape:
                            # Broadcast to all clients (including sender, to confirm ID?)
                            # Actually, sender already has it optimistically. 
                            # But sender needs the REAL ID.
                            # For now, let's broadcast to others. Sender might need a specific ack to update ID.
                            # In this simple demo, we might just broadcast 'shape_created' to others.
                            # The sender might reload or we can send a specific 'shape_created' back to sender with temp_id mapping?
                            # For simplicity: Broadcast to others. Sender keeps using temp ID until reload? 
                            # Or better: Broadcast to ALL, sender updates its shape with real ID if it matches temp ID?
                            # But we deleted temp ID from data passed to create_shape.
                            
                            # Let's just broadcast to others for now.
                            await broadcast_binary_json({
                                "event": "shape_created",
                                "data": new_shape
                            }, exclude=websocket)
                            
                            # Send back to sender so they can update the ID
                            await send_binary_json(websocket, {
                                "event": "shape_created_ack",
                                "temp_id": message.get("temp_id"), # Frontend should send this
                                "data": new_shape
                            })
                    finally:
                        db.close()

            elif event_type == "sync_page_shapes":
                page_id = message.get("page_id")
                shapes_data = message.get("shapes")
                
                if page_id and shapes_data is not None:
                    db = SessionLocal()
                    try:
                        synced_shapes = sync_page_shapes(db, page_id, shapes_data)
                        
                        # Broadcast full sync to all clients (including sender to confirm IDs/state)
                        await broadcast_binary_json({
                            "event": "page_state_synced",
                            "page_id": page_id,
                            "shapes": synced_shapes
                        })
                    finally:
                        db.close()

            else:
                # Unknown event or plain message structure
                # Echo back as binary
                await send_binary_json(websocket, {
                    "event": "echo",
                    "data": message
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)


# If you want to run this directly: `python backend/main.py`
if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
