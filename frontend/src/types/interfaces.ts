/**
 * NeuroDrone Core Interfaces
 * 
 * These interfaces define the clean abstraction boundary between
 * the simulation (Three.js) and the brain (Python SNN).
 * 
 * The brain only ever receives Observations and returns Actions.
 * It never directly manipulates 3D objects.
 * 
 * This design allows the same brain to control:
 * - This Three.js simulation
 * - A Webots robot
 * - An Isaac Sim robot
 * - A real drone (eventually)
 */

import * as THREE from 'three';

// ─── Observation: what the brain sees ───────────────────────────────────

/**
 * Complete sensory observation delivered to the brain each tick.
 * Mirrors what a real drone's sensor suite would provide.
 */
export interface Observation {
  /** Simulated RGB camera image as a flat Uint8Array (width × height × 4 RGBA) */
  camera: Uint8Array | null;
  /** Camera image dimensions */
  cameraSize: { width: number; height: number };
  /** Drone position in world coordinates (meters) */
  position: THREE.Vector3;
  /** Drone velocity in world frame (m/s) */
  velocity: THREE.Vector3;
  /** Drone orientation as Euler angles (radians) */
  orientation: THREE.Euler;
  /** Altitude above ground (meters) */
  altitude: number;
  /** Optional LiDAR / range-sensor distances (meters) in N directions */
  lidar?: number[];
  /** Simulation timestamp (seconds) */
  timestamp: number;
}

// ─── Action: what the brain commands ────────────────────────────────────

/**
 * High-level navigation command returned by the brain.
 * 
 * These are NOT raw motor thrusts; the drone's internal flight
 * controller translates them into motor commands.  This mirrors
 * how real autopilots expose velocity-setpoint interfaces.
 * 
 * Values are normalized to roughly [-1, 1].
 */
export interface Action {
  /** Forward / backward   (+1 = full forward) */
  forward: number;
  /** Left / right strafe  (+1 = full right) */
  lateral: number;
  /** Vertical climb/descend (+1 = full up) */
  vertical: number;
  /** Yaw rotation         (+1 = full clockwise) */
  yaw: number;
}

// ─── Brain interface ────────────────────────────────────────────────────

/**
 * Any controller — rule-based, MLP, RNN, SNN — must implement this.
 * This is the sole contract between the simulation and the brain.
 */
export interface Brain {
  readonly name: string;
  /** Process one observation and return a navigation action */
  step(obs: Observation, dt: number): Action;
  /** Reset internal state (e.g. membrane potentials) */
  reset(): void;
}

// ─── Simulation state ───────────────────────────────────────────────────

export type SimulationState = 'stopped' | 'running' | 'paused';

export interface SimulationConfig {
  /** Target movement speed (m/s) */
  targetSpeed: number;
  /** Additive Gaussian noise σ on sensor readings */
  sensorNoise: number;
  /** Additive Gaussian noise σ on camera pixels */
  cameraNoise: number;
  /** Whether GPS/position sensor is available */
  gpsAvailable: boolean;
  /** Whether LiDAR/range sensor is available */
  lidarAvailable: boolean;
  /** Lighting condition */
  lighting: 'day' | 'dusk' | 'night';
  /** Simulation speed multiplier (1.0 = real-time) */
  timeScale: number;
}

export const DEFAULT_CONFIG: SimulationConfig = {
  targetSpeed: 2.0,
  sensorNoise: 0.0,
  cameraNoise: 0.0,
  gpsAvailable: true,
  lidarAvailable: true,
  lighting: 'day',
  timeScale: 1.0,
};

// ─── Metrics ────────────────────────────────────────────────────────────

export interface SimulationMetrics {
  /** Whether target is currently detected in camera */
  targetDetected: boolean;
  /** Distance to target (m) */
  distanceToTarget: number;
  /** Total collisions since start */
  collisionCount: number;
  /** Total distance the drone has traveled (m) */
  trajectoryLength: number;
  /** Elapsed simulation time (s) */
  simulationTime: number;
  /** Render frames per second */
  fps: number;
  /** Current intruder behavior phase */
  intruderPhase?: string;
  /** Whether perimeter breach alarm has triggered */
  breachAlert?: boolean;
  /** Current drone operational mode */
  droneMode?: string;
}
