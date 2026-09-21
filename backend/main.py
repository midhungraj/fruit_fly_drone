"""
FastAPI Server for NeuroDrone Backend

Provides:
- WebSocket endpoint `/ws/drone` for real-time PyTorch SNN loop
- Healthcheck and info endpoints
- Drosophila Connectome LIF neural execution
"""

import math
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import torch
from brain.drosophila_snn import DrosophilaBrain

app = FastAPI(title="NeuroDrone SNN Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

brain = DrosophilaBrain()

@app.get("/")
def read_root():
    return {
        "system": "NeuroDrone Drosophila Connectome Backend",
        "status": "online",
        "engine": "PyTorch SNN (LIF)",
        "neurons": "LC10, LC4, LPTC/Optomotor, Descending Premotor",
    }

@app.websocket("/ws/drone")
async def websocket_drone_endpoint(websocket: WebSocket):
    await websocket.accept()
    brain.reset()
    print("[BACKEND] NeuroDrone WebSocket connected.")

    prev_angular_size = 0.0

    try:
        while True:
            data = await websocket.receive_json()

            # Parse observation from Three.js simulation
            # Expected format:
            # {
            #   "drone_pos": [x, y, z],
            #   "drone_yaw": float,
            #   "drone_speed": float,
            #   "target_pos": [x, y, z],
            #   "dt": float
            # }
            drone_pos = data.get("drone_pos", [0, 0, 0])
            drone_yaw = data.get("drone_yaw", 0.0)
            drone_speed = data.get("drone_speed", 0.0)
            target_pos = data.get("target_pos")
            dt = data.get("dt", 0.016)

            if not target_pos:
                await websocket.send_json({
                    "action": {"forward": 0.0, "lateral": 0.0, "vertical": 0.0, "yaw": 0.0},
                    "telemetry": {"locked": False}
                })
                continue

            # Compute relative vector in world coordinates
            dx = target_pos[0] - drone_pos[0]
            dy = target_pos[1] - drone_pos[1]
            dz = target_pos[2] - drone_pos[2]
            distance = math.sqrt(dx * dx + dy * dy + dz * dz)

            # Unrotate by drone yaw to get body coordinates
            cos_y = math.cos(-drone_yaw)
            sin_y = math.sin(-drone_yaw)
            body_x = dx * cos_y - dz * sin_y
            body_z = dx * sin_y + dz * cos_y

            # Azimuth angle (-pi to +pi)
            azimuth = math.atan2(body_x, -body_z)
            elevation = math.atan2(dy, math.sqrt(body_x * body_x + body_z * body_z))

            # Optical looming (expansion rate)
            angular_size = math.atan2(1.8, max(distance, 0.5))
            looming_rate = (angular_size - prev_angular_size) / max(dt, 0.001)
            prev_angular_size = angular_size

            # Desired altitude error (target 3.5m in attack dive, 12m in search)
            target_alt = 3.5 if distance < 20.0 else 12.0
            altitude_error = target_alt - drone_pos[1]

            # Construct PyTorch feature tensor
            features = torch.tensor([
                azimuth,
                elevation,
                distance,
                looming_rate,
                altitude_error,
                drone_speed,
            ], dtype=torch.float32)

            # Step PyTorch SNN
            with torch.no_grad():
                result = brain(features, dt=dt)

            result["telemetry"]["target_distance"] = round(distance, 2)
            result["telemetry"]["target_azimuth_deg"] = round(math.degrees(azimuth), 1)
            result["telemetry"]["locked"] = abs(azimuth) < math.radians(110)

            await websocket.send_json(result)

    except WebSocketDisconnect:
        print("[BACKEND] NeuroDrone WebSocket disconnected.")
    except Exception as e:
        print(f"[BACKEND] WebSocket error: {e}")
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
