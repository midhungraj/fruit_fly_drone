# NeuroDrone

**Connectome-Inspired Autonomous Navigation Simulator**

A browser-based 3D autonomous robotics research prototype where a simulated drone navigates a virtual environment using a brain-inspired neural controller based on the *Drosophila* (fruit-fly) connectome.

## Project Status

| Step | Description | Status |
|------|-------------|--------|
| 1 | 3D environment + drone + target + controls | ✅ Current |
| 2 | Drone movement (keyboard/manual) | ⬜ Next |
| 3 | Moving target + patrol behavior | ⬜ |
| 4 | Simulated camera sensor | ⬜ |
| 5 | Manual target following | ⬜ |
| 6 | Observation → Brain → Action interface | ⬜ |
| 7 | Rule-based baseline brain | ⬜ |
| 8 | LIF neuron model (Python) | ⬜ |
| 9 | Fly-inspired SNN | ⬜ |
| 10 | SNN → drone connection | ⬜ |
| 11 | Neural activity visualization | ⬜ |
| 12 | Experiments + sensor degradation | ⬜ |
| 13 | Metrics + experiment recording | ⬜ |
| 14 | Prepare for real connectome data | ⬜ |

## Quick Start

```bash
# Frontend (Three.js + Vite + TypeScript)
cd frontend
npm install
npm run dev

# Backend (Python + FastAPI — not yet active)
# cd backend
# pip install -r requirements.txt
# python main.py
```

## Architecture

```
Observation → Brain → Action
```

The brain is completely decoupled from Three.js. It receives sensor observations and returns high-level navigation commands. This allows the same brain to control a Webots, Isaac Sim, or real drone.

### Important Distinctions

1. **Synthetic baseline** — hand-tuned rule-based controller
2. **Fly-inspired architecture** — computational model inspired by Drosophila neural organization
3. **Connectome-derived architecture** — (future) connectivity from actual Drosophila connectome data

This project does NOT claim to be a literal biological brain simulation.

## Research Goal

Investigate whether connectome-inspired spiking neural architectures can produce useful autonomous navigation and robust behavior in an embodied agent. The simulator produces measurable results for comparison across controller types.

## Tech Stack

- **Frontend**: Three.js, TypeScript, Vite
- **Backend**: Python, FastAPI, WebSocket
- **AI**: PyTorch, Spiking Neural Networks, LIF neurons

## License

Research prototype — not for production use.
