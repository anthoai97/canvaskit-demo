from __future__ import annotations

from typing import Set, Dict
from uuid import uuid4
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Image Editor Backend")

# Allow your Svelte dev server to talk to the API in development.
# Adjust origins as needed for production.
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ConnectionManager:
    """Simple in‑memory WebSocket connection manager."""

    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()
        # Store client ids as opaque strings (e.g., UUIDs), not ints.
        self._client_ids: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        # Assign a UUID-based client id (string, not int).
        self._client_ids[websocket] = str(uuid4())

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)
        self._client_ids.pop(websocket, None)

    def get_client_id(self, websocket: WebSocket) -> str | None:
        return self._client_ids.get(websocket)

    async def send_personal_message(self, message: str, websocket: WebSocket) -> None:
        await websocket.send_text(message)

    async def broadcast(self, message: str) -> None:
        """Broadcast a message to all connected clients.

        Dead connections are removed so future sends stay stable.
        """
        to_remove: list[WebSocket] = []

        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                # Connection is likely dead; mark it for removal.
                to_remove.append(connection)

        for connection in to_remove:
            self.disconnect(connection)

    async def send_periodic_test_message(
        self, websocket: WebSocket, interval_seconds: float = 3.0
    ) -> None:
        """Send a periodic test message to a single client.

        Runs until sending fails (e.g. client disconnects).
        """
        try:
            while True:
                await asyncio.sleep(interval_seconds)
                client_id = self.get_client_id(websocket)
                await self.send_personal_message(
                    f"server[{client_id}]: periodic test message", websocket
                )
        except Exception:
            # Let the main websocket handler clean up the connection.
            return


manager = ConnectionManager()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Basic echo/broadcast WebSocket endpoint.

    - Receives text messages from one client.
    - If the message is 'ping', replies with 'pong' (for heartbeat).
    - Otherwise, broadcasts the message to all connected clients.
    """
    await manager.connect(websocket)

    # Background task: send a periodic test message to this client every 10 seconds.
    periodic_task = asyncio.create_task(manager.send_periodic_test_message(websocket))

    try:
        while True:
            data = await websocket.receive_text()

            # Heartbeat support from clients
            if data == "ping":
                await manager.send_personal_message("pong", websocket)
                continue

            # Echo back to sender and broadcast to everyone
            await manager.send_personal_message(f"you said: {data}", websocket)
            await manager.broadcast(f"broadcast: {data}")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        # Any unexpected error -> clean up the connection
        manager.disconnect(websocket)
    finally:
        # Stop the periodic sender for this websocket.
        periodic_task.cancel()


# If you want to run this directly: `python backend/main.py`
if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


