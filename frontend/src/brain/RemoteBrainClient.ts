/**
 * Remote PyTorch SNN Brain Client (WebSocket)
 * 
 * Bridges the Three.js frontend simulation to the Python FastAPI backend
 * running the PyTorch Leaky Integrate-and-Fire (LIF) Drosophila connectome.
 */

import type { Action } from '../types/interfaces';

export interface RemoteTelemetry {
  lc10_spikes: number;
  lc4_spikes: number;
  opt_spikes: number;
  v_lc10_mean: number;
  v_lc4_mean: number;
  target_distance: number;
  target_azimuth_deg: number;
  locked: boolean;
}

export class RemoteBrainClient {
  private ws: WebSocket | null = null;
  private url: string;
  public isConnected = false;
  public lastTelemetry: RemoteTelemetry | null = null;
  private latestAction: Action = { forward: 0, lateral: 0, vertical: 0, yaw: 0 };

  constructor(url: string = 'ws://localhost:8000/ws/drone') {
    this.url = url;
    this.connect();
  }

  private connect(): void {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log('%c[BACKEND] Connected to PyTorch Drosophila SNN Brain!', 'color: #00e676; font-weight: bold;');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.action) {
            this.latestAction = data.action;
          }
          if (data.telemetry) {
            this.lastTelemetry = data.telemetry;
          }
        } catch (err) {
          console.error('[BACKEND] Error parsing brain packet:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        // Retry connection after delay
        setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };
    } catch {
      this.isConnected = false;
    }
  }

  sendObservation(payload: {
    drone_pos: [number, number, number];
    drone_yaw: number;
    drone_speed: number;
    target_pos: [number, number, number] | null;
    dt: number;
  }): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  getAction(): Action {
    return this.latestAction;
  }
}
