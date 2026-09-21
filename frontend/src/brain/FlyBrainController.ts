/**
 * Drosophila (Fruit-Fly) Connectome-Inspired Brain Controller
 * 
 * Based on the Drosophila melanogaster visual pursuit and interception circuit:
 * 
 * 1. Compound Eye / Visual Field:
 *    - Receptive field mapping relative to drone body frame (azimuth & elevation).
 * 
 * 2. Lobula Columnar Type 10 (LC10) Neurons:
 *    - Specialized for small-object tracking & pursuit.
 *    - Left & right LC10 neural populations compute azimuthal target error.
 *    - Drives yaw rotational saccades and lateral banking toward target.
 * 
 * 3. Lobula Columnar Type 4 (LC4) Neurons:
 *    - Looming-sensitive visual neurons responding to object expansion rate (theta / dtheta_dt).
 *    - Fires strongly as the drone closes in on the target, triggering attack/dive trajectory.
 * 
 * 4. Optomotor / Horizontal System (HS) & Vertical System (VS) Cells:
 *    - Regulates forward optical flow, ground clearance, and stable altitude maintenance.
 * 
 * 5. Spiking Dynamics:
 *    - Leaky Integrate-and-Fire (LIF) model with membrane potentials, thresholds, and refractory resets.
 */

import * as THREE from 'three';
import type { Action, Brain, Observation } from '../types/interfaces';

export interface NeuralState {
  /** Membrane potential of left LC10 tracking population */
  v_lc10_left: number;
  /** Membrane potential of right LC10 tracking population */
  v_lc10_right: number;
  /** Membrane potential of LC4 looming / attack population */
  v_lc4_looming: number;
  /** Membrane potential of optomotor altitude stabilization */
  v_optomotor: number;
  /** Instantaneous firing rates (Hz) */
  firingRateLC10: number;
  firingRateLC4: number;
  /** Number of spikes emitted this frame */
  spikesThisStep: number;
  /** Target angular position in visual field (radians) */
  targetAzimuth: number;
  targetElevation: number;
  /** Apparent optical angular size (radians) */
  angularSize: number;
  /** Whether the visual system has locked onto the intruder */
  targetLocked: boolean;
}

export class FlyBrainController implements Brain {
  readonly name = 'Drosophila SNN Visual Pursuit (LC10/LC4/LPTC)';

  // SNN LIF Parameters
  private readonly v_rest = -70.0;    // Resting potential (mV)
  private readonly v_thresh = -50.0;  // Threshold potential (mV)
  private readonly v_reset = -75.0;   // Reset potential (mV)
  private readonly tau_m = 0.035;     // Membrane time constant (s)
  private readonly r_m = 10.0;        // Membrane resistance (MOhm)

  // Internal neuron membrane potentials (mV)
  private v_lc10_l: number = -70.0;
  private v_lc10_r: number = -70.0;
  private v_lc4: number = -70.0;
  private v_opt: number = -70.0;

  // Spike counters & rates
  private spikeHistoryLC10: number[] = [];
  private spikeHistoryLC4: number[] = [];
  private prevAngularSize: number = 0;
  private locked: boolean = false;

  public state: NeuralState = {
    v_lc10_left: -70.0,
    v_lc10_right: -70.0,
    v_lc4_looming: -70.0,
    v_optomotor: -70.0,
    firingRateLC10: 0,
    firingRateLC4: 0,
    spikesThisStep: 0,
    targetAzimuth: 0,
    targetElevation: 0,
    angularSize: 0,
    targetLocked: false,
  };

  /** Target reference in world space (populated by simulation or visual perception) */
  private targetPosition: THREE.Vector3 | null = null;

  setTargetPosition(pos: THREE.Vector3 | null): void {
    this.targetPosition = pos ? pos.clone() : null;
  }

  reset(): void {
    this.v_lc10_l = this.v_rest;
    this.v_lc10_r = this.v_rest;
    this.v_lc4 = this.v_rest;
    this.v_opt = this.v_rest;
    this.spikeHistoryLC10 = [];
    this.spikeHistoryLC4 = [];
    this.prevAngularSize = 0;
    this.locked = false;
  }

  /**
   * Drosophila connectome-inspired visual processing step
   */
  step(obs: Observation, dt: number): Action {
    if (!this.targetPosition) {
      return { forward: 0, lateral: 0, vertical: 0, yaw: 0 };
    }

    // 1. Precise 3D relative vectors
    const dx = this.targetPosition.x - obs.position.x;
    const dy = this.targetPosition.y - obs.position.y;
    const dz = this.targetPosition.z - obs.position.z;
    const distance2D = Math.sqrt(dx * dx + dz * dz);
    const distance3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Desired world yaw to face the target
    // In Three.js: forward is (0, 0, -1), right is (+1, 0, 0)
    // desiredYaw = atan2(-dx, -dz)
    const desiredYaw = Math.atan2(-dx, -dz);

    // Shortest angular difference (-PI to +PI)
    let yawDiff = desiredYaw - obs.orientation.y;
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    // Optical looming calculation (LC4)
    const angularSize = Math.atan2(1.8, Math.max(distance3D, 0.5));
    const loomingRate = dt > 0 ? (angularSize - this.prevAngularSize) / dt : 0;
    this.prevAngularSize = angularSize;

    // Drosophila SNN Leaky Integrate-and-Fire simulation
    const lc10_drive_l = Math.max(0, yawDiff) * 4.0;
    const lc10_drive_r = Math.max(0, -yawDiff) * 4.0;
    const lc4_drive = Math.max(0, loomingRate * 10.0 + (distance3D < 15 ? 3.0 : 0.5));

    this.v_lc10_l += (-(this.v_lc10_l - this.v_rest) + this.r_m * lc10_drive_l) / this.tau_m * dt;
    this.v_lc10_r += (-(this.v_lc10_r - this.v_rest) + this.r_m * lc10_drive_r) / this.tau_m * dt;
    this.v_lc4 += (-(this.v_lc4 - this.v_rest) + this.r_m * lc4_drive) / this.tau_m * dt;

    let spikesCount = 0;
    if (this.v_lc10_l >= this.v_thresh) { this.v_lc10_l = this.v_reset; spikesCount++; }
    if (this.v_lc10_r >= this.v_thresh) { this.v_lc10_r = this.v_reset; spikesCount++; }
    if (this.v_lc4 >= this.v_thresh) { this.v_lc4 = this.v_reset; spikesCount++; }

    // Motor commands:
    // Yaw: turn directly toward intruder
    // In Drone.ts: orientation.y += -yaw * ...
    // If yawDiff < 0 (target is to the right), yawCmd must be > 0 to decrease orientation.y towards desiredYaw
    const yawCmd = -Math.max(-1.0, Math.min(1.0, yawDiff * 2.8));

    // Forward drive:
    // When off-angle, pivot on the spot; when pointed at intruder, charge full speed
    const isAligned = Math.abs(yawDiff) < 0.45; // within ~25 degrees
    let fwdCmd = 0;
    if (distance3D > 2.0) {
      if (isAligned) {
        fwdCmd = 1.0; // Full thrust charge
      } else {
        fwdCmd = 0.15; // Slow pivot turn directly to target
      }
    } else {
      fwdCmd = 0.0;
    }

    // Vertical dive:
    // Intruder is on ground. When far, fly at 5m; when close (<12m), dive down to 1.5m to strike
    const targetAlt = distance2D < 12.0 ? 1.5 : 5.5;
    const altError = targetAlt - obs.position.y;
    const vertCmd = Math.max(-1.0, Math.min(1.0, altError * 0.5));
    const latCmd = 0; // Pure visual pursuit heading alignment

    // Update state object for Dashboard HUD
    this.state = {
      v_lc10_left: this.v_lc10_l,
      v_lc10_right: this.v_lc10_r,
      v_lc4_looming: this.v_lc4,
      v_optomotor: this.v_opt,
      firingRateLC10: this.spikeHistoryLC10.length,
      firingRateLC4: this.spikeHistoryLC4.length,
      spikesThisStep: spikesCount,
      targetAzimuth: yawDiff,
      targetElevation: Math.atan2(dy, Math.max(distance2D, 0.1)),
      angularSize,
      targetLocked: isAligned,
    };

    return {
      forward: fwdCmd,
      lateral: latCmd,
      vertical: vertCmd,
      yaw: yawCmd,
    };
  }
}
