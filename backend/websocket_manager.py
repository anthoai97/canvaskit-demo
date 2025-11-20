from __future__ import annotations
from typing import Set, Dict, Any
from uuid import uuid4
import asyncio
from fastapi import WebSocket

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
    
    async def send_json(self, data: Any, websocket: WebSocket) -> None:
        await websocket.send_json(data)

    async def send_bytes(self, data: bytes, websocket: WebSocket) -> None:
        await websocket.send_bytes(data)

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
