
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

# Zona horaria de Ciudad de México.
TIMEZONE = ZoneInfo("America/Mexico_City")

app = FastAPI(title="Chat Multiusuario")

app.mount(
    "/static",
    StaticFiles(directory=STATIC_DIR),
    name="static",
)


def current_timestamp():
    """Genera la fecha y hora en el servidor."""
    return datetime.now(TIMEZONE).isoformat(timespec="seconds")


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[WebSocket, str] = {}

        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, username: str):
        await websocket.accept()

        async with self.lock:
            existing_names = {
                name.casefold()
                for name in self.active_connections.values()
            }

            if username.casefold() in existing_names:
                await websocket.send_json({
                    "type": "error",
                    "content": "Ese nombre ya está en uso.",
                })
                await websocket.close(code=1008)
                return False

            self.active_connections[websocket] = username

            await self._broadcast({
                "type": "system",
                "content": f"{username} se ha conectado.",
                "timestamp": current_timestamp(),
            })

            await self._broadcast_users()

        return True

    async def disconnect(self, websocket: WebSocket):
        async with self.lock:
            username = self.active_connections.pop(
                websocket, None
            )

            if username is not None:
                await self._broadcast({
                    "type": "system",
                    "content": f"{username} se ha desconectado.",
                    "timestamp": current_timestamp(),
                })

                await self._broadcast_users()

    async def broadcast(self, message: dict):
        async with self.lock:
            await self._broadcast(message)

    async def _broadcast(self, message: dict):
        disconnected = []

        for websocket in list(self.active_connections):
            try:
                await websocket.send_json(message)
            except (WebSocketDisconnect, RuntimeError, OSError):
                disconnected.append(websocket)

        for websocket in disconnected:
            self.active_connections.pop(websocket, None)

    async def _broadcast_users(self):
        users = sorted(
            self.active_connections.values(),
            key=str.casefold,
        )

        await self._broadcast({
            "type": "users",
            "users": users,
        })


manager = ConnectionManager()


@app.get("/")
async def home():
    return FileResponse(STATIC_DIR / "index.html")


@app.websocket("/ws/{username}")
async def chat_endpoint(
    websocket: WebSocket,
    username: str,
):
    username = username.strip()

    if not username or len(username) > 30:
        await websocket.close(code=1008)
        return

    connected = await manager.connect(websocket, username)

    if not connected:
        return

    try:
        while True:
            content = await websocket.receive_text()
            content = content.strip()

            if not content:
                continue

            if len(content) > 1000:
                await websocket.send_json({
                    "type": "error",
                    "content": "El mensaje no puede superar "
                               "1000 caracteres.",
                })
                continue

            message = {
                "type": "message",
                "username": manager.active_connections.get(
                    websocket, username
                ),
                "content": content,
                "timestamp": current_timestamp(),
            }

            await manager.broadcast(message)

    except WebSocketDisconnect:
        pass

    finally:
        await manager.disconnect(websocket)
