/**
 * Simulation Manager
 * 
 * Central orchestrator for the military base defense simulation:
 * - Coordinates Drone, Intruder Target, Environment, and FlyBrainController.
 * - Monitors perimeter security and triggers automatic scramble upon intruder breach.
 * - Ticks the Drosophila connectome-inspired visual pursuit SNN (LC10 / LC4 / LPTC).
 * - Computes real-time defense and neural telemetry metrics.
 */

import * as THREE from 'three';
import { Drone } from '../drone/Drone';
import { Target } from './Target';
import { createEnvironment, type EnvironmentObjects } from '../environment/Environment';
import { FlyBrainController } from '../brain/FlyBrainController';
import { RemoteBrainClient } from '../brain/RemoteBrainClient';
import type { SimulationState, SimulationConfig, SimulationMetrics } from '../types/interfaces';

export class SimulationManager {
  readonly scene: THREE.Scene;
  readonly drone: Drone;
  readonly target: Target;
  readonly environment: EnvironmentObjects;
  readonly flyBrain: FlyBrainController;
  readonly remoteBrain: RemoteBrainClient;

  state: SimulationState = 'stopped';
  config: SimulationConfig;
  metrics: SimulationMetrics;

  breachAlert = false;
  droneScrambled = false;
  interceptions = 0;

  private simTime = 0;
  private frameCount = 0;
  private fpsTimer = 0;
  private currentFps = 0;

  constructor(config?: Partial<SimulationConfig>) {
    this.scene = new THREE.Scene();

    this.config = {
      targetSpeed: 2.0,
      sensorNoise: 0.0,
      cameraNoise: 0.0,
      gpsAvailable: true,
      lidarAvailable: true,
      lighting: 'day',
      timeScale: 1.0,
      ...config,
    };

    this.metrics = this.resetMetrics();

    // 1. Build Military Base Environment
    this.environment = createEnvironment(this.scene);

    // 2. Fruit-Fly Connectome Controller (Client & Remote PyTorch)
    this.flyBrain = new FlyBrainController();
    this.remoteBrain = new RemoteBrainClient();

    // 3. Create Drone at Base Helipad
    this.drone = new Drone(this.environment.launchPadPosition);
    this.scene.add(this.drone.group);
    this.scene.add(this.drone.getTrailLine());
    this.scene.add(this.drone.searchTarget); // for searchlight pointing
    this.scene.add(this.drone.attackBeam);   // for laser attack beam

    // 4. Create Intruder Target outside base
    this.target = new Target(this.environment.perimeterRadius);
    this.scene.add(this.target.group);
    this.scene.add(this.target.trailLine);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────

  start(): void {
    this.state = 'running';
  }

  pause(): void {
    if (this.state === 'running') this.state = 'paused';
  }

  resume(): void {
    if (this.state === 'paused') this.state = 'running';
  }

  togglePause(): void {
    if (this.state === 'running') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  reset(): void {
    this.state = 'stopped';
    this.simTime = 0;
    this.frameCount = 0;
    this.breachAlert = false;
    this.droneScrambled = false;
    this.interceptions = 0;
    this.flyBrain.reset();
    this.drone.reset();
    this.target.reset();
    this.metrics = this.resetMetrics();
  }

  /** Force scramble the drone immediately (e.g. from UI button or hotkey) */
  scrambleDrone(): void {
    if (this.drone.mode === 'parked') {
      this.drone.activate();
      this.droneScrambled = true;
    }
  }

  // ─── Main Tick ────────────────────────────────────────────────────

  /**
   * Advance the simulation by one frame.
   * @param dt wall-clock delta time in seconds
   */
  update(dt: number): void {
    if (this.state !== 'running') return;

    const scaledDt = dt * this.config.timeScale;
    this.simTime += scaledDt;

    // 1. Update Intruder Agent
    this.target.update(scaledDt);

    // 2. Perimeter Breach Detection
    const intruderDistFromCenter = Math.sqrt(this.target.position.x ** 2 + this.target.position.z ** 2);
    const hasBreachedFence = intruderDistFromCenter <= this.environment.perimeterRadius || this.target.hasBreached;

    if (hasBreachedFence) {
      if (!this.breachAlert) {
        this.breachAlert = true;
        console.warn(`[DEFENSE ALARM] Perimeter breached by intruder at distance ${intruderDistFromCenter.toFixed(1)}m!`);
      }
      // Scramble drone if still parked
      if (this.drone.mode === 'parked') {
        this.scrambleDrone();
      }
    }

    // 3. Drone Flight & Brain Control
    const distToTarget = this.drone.position.distanceTo(this.target.position);

    if (this.drone.mode === 'autonomous') {
      // Connect Fruit-Fly SNN visual pursuit tracker
      this.flyBrain.setTargetPosition(this.target.position);
      const obs = this.drone.getObservation(this.simTime);
      const brainAction = this.flyBrain.step(obs, scaledDt);
      this.drone.applyAction(brainAction);

      // Stream telemetry to PyTorch backend
      if (this.remoteBrain.isConnected) {
        this.remoteBrain.sendObservation({
          drone_pos: [this.drone.position.x, this.drone.position.y, this.drone.position.z],
          drone_yaw: this.drone.orientation.y,
          drone_speed: this.drone.velocity.length(),
          target_pos: [this.target.position.x, this.target.position.y, this.target.position.z],
          dt: scaledDt,
        });
      }

      // Target lock, searchlight, and attack laser beam
      this.drone.pointSpotlight(this.target.position);

      // Interception & Elimination logic
      if (this.target.isEliminated) {
        // Intruder is neutralized: drone hovers victoriously above target
        this.drone.isAttacking = false;
        const hoverAlt = 4.0;
        const altErr = hoverAlt - this.drone.position.y;
        this.drone.applyAction({ forward: 0, lateral: 0, vertical: Math.max(-0.6, Math.min(0.6, altErr * 0.5)), yaw: 0.15 });
      } else if (distToTarget < 3.8) {
        // Direct strike impact! Eliminate the intruder!
        this.target.eliminate();
        this.interceptions++;
        this.drone.isAttacking = true;
        console.warn(`[DEFENSE SUCCESS] Intruder ELIMINATED by Drone at (${this.target.position.x.toFixed(1)}, ${this.target.position.z.toFixed(1)})! Base secured.`);
      } else if (distToTarget < 25.0) {
        // Attack dive / high-speed closing strike
        this.drone.isAttacking = true;
      } else {
        this.drone.isAttacking = false;
      }
    } else if (this.drone.mode === 'manual') {
      // Manual pilot mode (WASD)
      this.drone.pointSpotlight(this.target.position);
      if (distToTarget < 3.8 && !this.target.isEliminated) {
        this.target.eliminate();
        this.interceptions++;
      }
    } else {
      this.drone.pointSpotlight(null);
    }

    // 4. Update Drone Physics & Visuals
    this.drone.update(scaledDt);

    // 5. Update Telemetry Metrics
    this.updateMetrics(dt, distToTarget);
  }

  // ─── Metrics ──────────────────────────────────────────────────────

  private resetMetrics(): SimulationMetrics {
    return {
      targetDetected: false,
      distanceToTarget: 0,
      collisionCount: 0,
      trajectoryLength: 0,
      simulationTime: 0,
      fps: 0,
      intruderPhase: 'approaching',
      breachAlert: false,
      droneMode: 'parked',
    };
  }

  private updateMetrics(wallDt: number, distToTarget: number): void {
    // FPS calculation (smoothed)
    this.frameCount++;
    this.fpsTimer += wallDt;
    if (this.fpsTimer >= 0.5) {
      this.currentFps = this.frameCount / this.fpsTimer;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    this.metrics.fps = Math.round(this.currentFps);
    this.metrics.simulationTime = this.simTime;
    this.metrics.distanceToTarget = distToTarget;
    this.metrics.trajectoryLength = this.drone.totalDistance;
    this.metrics.targetDetected = this.flyBrain.state.targetLocked;
    this.metrics.collisionCount = this.interceptions;
    this.metrics.intruderPhase = this.target.getPhase();
    this.metrics.breachAlert = this.breachAlert;
    this.metrics.droneMode = this.drone.mode;
  }

  // ─── Accessors ────────────────────────────────────────────────────

  getSimTime(): number {
    return this.simTime;
  }
}
