/**
 * Military Drone Entity
 * 
 * Starts parked on the helipad. When an intruder breach is detected,
 * the drone activates, takes off, and begins tracking.
 * 
 * Control modes:
 * 1. PARKED     — sitting on helipad, motors off
 * 2. LAUNCHING  — automated takeoff sequence
 * 3. AUTONOMOUS — controlled by brain (rule-based tracker initially)
 * 4. MANUAL     — keyboard override (WASD + QE + arrows)
 * 
 * The simplified flight controller translates high-level commands
 * (forward/lateral/vertical/yaw) into smooth drone movement.
 */

import * as THREE from 'three';
import type { Action, Observation } from '../types/interfaces';

export type DroneMode = 'parked' | 'launching' | 'autonomous' | 'manual';

const DRONE_CONFIG = {
  maxSpeed: 10.0,
  maxVerticalSpeed: 5.0,
  maxYawRate: Math.PI * 1.2,
  accelFactor: 5.0,
  verticalAccelFactor: 3.5,
  drag: 2.5,
  launchAltitude: 15,
  launchSpeed: 3.0,
  rotorSpeed: 35,
};

export class Drone {
  readonly group: THREE.Group;
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  readonly orientation: THREE.Euler;

  mode: DroneMode = 'parked';
  isAttacking: boolean = false;
  readonly searchLight: THREE.SpotLight;
  readonly searchTarget: THREE.Object3D;
  readonly attackBeam: THREE.Line;
  private currentAction: Action = { forward: 0, lateral: 0, vertical: 0, yaw: 0 };
  private rotors: THREE.Mesh[] = [];
  private rotorMats: THREE.MeshStandardMaterial[] = [];
  private statusLight!: THREE.Mesh;
  private statusLightMat!: THREE.MeshStandardMaterial;
  private trail: THREE.Vector3[] = [];
  private trailLine: THREE.Line;
  private launchPadPos: THREE.Vector3;
  totalDistance = 0;

  // Keyboard state
  private keys: Set<string> = new Set();

  constructor(launchPadPos: THREE.Vector3 = new THREE.Vector3(0, 0, 0)) {
    this.group = new THREE.Group();
    this.launchPadPos = launchPadPos.clone();
    // Start on the helipad
    this.position = new THREE.Vector3(launchPadPos.x, 0.3, launchPadPos.z);
    this.velocity = new THREE.Vector3();
    this.orientation = new THREE.Euler(0, 0, 0, 'YXZ');

    // Targeting searchlight
    this.searchTarget = new THREE.Object3D();
    this.searchLight = new THREE.SpotLight(0x00e5ff, 0, 60, Math.PI / 7, 0.4, 1.2);
    this.searchLight.position.set(0, -0.2, 0);
    this.searchLight.target = this.searchTarget;
    this.group.add(this.searchLight);

    // Laser attack beam
    const beamGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const beamMat = new THREE.LineBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.0 });
    this.attackBeam = new THREE.Line(beamGeo, beamMat);

    this.buildModel();
    this.setupKeyboard();

    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.5 });
    this.trailLine = new THREE.Line(trailGeo, trailMat);
  }

  getTrailLine(): THREE.Line {
    return this.trailLine;
  }

  // ─── Visual Model ─────────────────────────────────────────────

  private buildModel(): void {
    // Main body — angular military style
    const bodyGeo = new THREE.BoxGeometry(1.4, 0.25, 1.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2d3436,
      roughness: 0.3,
      metalness: 0.5,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    this.group.add(body);

    // Under-body detail
    const underGeo = new THREE.BoxGeometry(0.8, 0.15, 0.8);
    const underMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.4, metalness: 0.6 });
    const under = new THREE.Mesh(underGeo, underMat);
    under.position.y = -0.15;
    this.group.add(under);

    // Camera gimbal (front)
    const camGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const camMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.6,
    });
    const cam = new THREE.Mesh(camGeo, camMat);
    cam.position.set(0, -0.18, -0.75);
    this.group.add(cam);

    // Arms + rotors (4 arms at diagonals)
    const armPositions: [number, number][] = [
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    for (const [dx, dz] of armPositions) {
      // Arm
      const armGeo = new THREE.BoxGeometry(0.14, 0.07, 0.95);
      const armMat = new THREE.MeshStandardMaterial({ color: 0x3d3d50, roughness: 0.4, metalness: 0.5 });
      const arm = new THREE.Mesh(armGeo, armMat);
      const angle = Math.atan2(dz, dx);
      arm.position.set(dx * 0.6, 0, dz * 0.6);
      arm.rotation.y = -angle + Math.PI / 2;
      arm.castShadow = true;
      this.group.add(arm);

      // Motor housing
      const motorGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.16, 8);
      const motorMat = new THREE.MeshStandardMaterial({ color: 0x444466 });
      const motor = new THREE.Mesh(motorGeo, motorMat);
      motor.position.set(dx * 0.95, 0.1, dz * 0.95);
      this.group.add(motor);

      // Rotor disc
      const rotorGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.02, 3);
      const rotorMat = new THREE.MeshStandardMaterial({
        color: 0x88aaff,
        transparent: true,
        opacity: 0.0, // invisible when parked
        side: THREE.DoubleSide,
      });
      const rotor = new THREE.Mesh(rotorGeo, rotorMat);
      rotor.position.set(dx * 0.95, 0.2, dz * 0.95);
      this.group.add(rotor);
      this.rotors.push(rotor);
      this.rotorMats.push(rotorMat);
    }

    // Status light
    const lightGeo = new THREE.SphereGeometry(0.07, 8, 8);
    this.statusLightMat = new THREE.MeshStandardMaterial({
      color: 0x666666,
      emissive: 0x666666,
      emissiveIntensity: 0.3,
    });
    this.statusLight = new THREE.Mesh(lightGeo, this.statusLightMat);
    this.statusLight.position.set(0, 0.18, 0);
    this.group.add(this.statusLight);

    // Landing gear (small legs)
    const legMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as [number, number][]) {
      const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.25, 4);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(lx, -0.25, lz);
      this.group.add(leg);
    }

    this.group.position.copy(this.position);
  }

  // ─── Keyboard ─────────────────────────────────────────────────

  private setupKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['KeyM'].includes(e.code)) {
        this.toggleManual();
      }
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  toggleManual(): void {
    if (this.mode === 'parked') return;
    this.mode = this.mode === 'manual' ? 'autonomous' : 'manual';
  }

  /** Read keyboard into an Action (for manual mode) */
  private readKeyboardAction(): Action {
    let forward = 0, lateral = 0, vertical = 0, yaw = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward = 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward = -1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) lateral = -1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) lateral = 1;
    if (this.keys.has('Space')) vertical = 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) vertical = -1;
    if (this.keys.has('KeyQ')) yaw = -1;
    if (this.keys.has('KeyE')) yaw = 1;

    return { forward, lateral, vertical, yaw };
  }

  // ─── Control ──────────────────────────────────────────────────

  applyAction(action: Action): void {
    if (this.mode === 'manual') return; // keyboard overrides
    this.currentAction = { ...action };
  }

  /** Activate drone — begin launch sequence */
  activate(): void {
    if (this.mode !== 'parked') return;
    this.mode = 'launching';
  }

  // ─── Physics Step ─────────────────────────────────────────────

  update(dt: number): void {
    // ── Status light color ──
    this.updateStatusLight();

    // ── Rotor visuals ──
    const isFlying = this.mode !== 'parked';
    for (let i = 0; i < this.rotors.length; i++) {
      if (isFlying) {
        this.rotorMats[i].opacity = 0.35;
        this.rotors[i].rotation.y += DRONE_CONFIG.rotorSpeed * dt;
      } else {
        this.rotorMats[i].opacity = 0.0;
      }
    }

    if (this.mode === 'parked') {
      this.group.position.copy(this.position);
      return;
    }

    // ── Launch sequence ──
    if (this.mode === 'launching') {
      this.velocity.set(0, DRONE_CONFIG.launchSpeed, 0);
      this.position.addScaledVector(this.velocity, dt);

      if (this.position.y >= DRONE_CONFIG.launchAltitude) {
        this.position.y = DRONE_CONFIG.launchAltitude;
        this.velocity.set(0, 0, 0);
        this.mode = 'autonomous';
      }

      this.group.position.copy(this.position);
      return;
    }

    // ── Manual override ──
    if (this.mode === 'manual') {
      this.currentAction = this.readKeyboardAction();
    }

    // ── Flight dynamics ──
    const { forward, lateral, vertical, yaw } = this.currentAction;

    // Yaw
    this.orientation.y += -yaw * DRONE_CONFIG.maxYawRate * dt;

    // Desired velocity in drone-local frame
    const localVel = new THREE.Vector3(
      lateral * DRONE_CONFIG.maxSpeed,
      vertical * DRONE_CONFIG.maxVerticalSpeed,
      -forward * DRONE_CONFIG.maxSpeed,
    );

    // Rotate to world
    const yawQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, this.orientation.y, 0)
    );
    const worldDesired = localVel.applyQuaternion(yawQuat);

    // Smooth acceleration
    this.velocity.x += (worldDesired.x - this.velocity.x) * DRONE_CONFIG.accelFactor * dt;
    this.velocity.z += (worldDesired.z - this.velocity.z) * DRONE_CONFIG.accelFactor * dt;
    this.velocity.y += (worldDesired.y - this.velocity.y) * DRONE_CONFIG.verticalAccelFactor * dt;

    // Drag
    const dragFactor = Math.max(0, 1 - DRONE_CONFIG.drag * dt);
    this.velocity.multiplyScalar(dragFactor);

    const prevPos = this.position.clone();
    this.position.addScaledVector(this.velocity, dt);

    // Altitude clamp
    if (this.position.y < 1.0) {
      this.position.y = 1.0;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    if (this.position.y > 60) {
      this.position.y = 60;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    this.totalDistance += this.position.distanceTo(prevPos);

    // Sync visuals
    this.group.position.copy(this.position);
    this.group.rotation.y = this.orientation.y;

    // Flight tilt
    const tilt = 0.2;
    this.group.rotation.z = -lateral * tilt;
    this.group.rotation.x = forward * tilt;

    // Trail
    this.trail.push(this.position.clone());
    if (this.trail.length > 600) this.trail.shift();
    const positions = new Float32Array(this.trail.length * 3);
    for (let i = 0; i < this.trail.length; i++) {
      positions[i * 3] = this.trail[i].x;
      positions[i * 3 + 1] = this.trail[i].y;
      positions[i * 3 + 2] = this.trail[i].z;
    }
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = new THREE.BufferGeometry();
    this.trailLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  // ─── Status Light & Targeting ───────────────────────────────────

  pointSpotlight(targetPos: THREE.Vector3 | null): void {
    if (this.mode === 'parked' || !targetPos) {
      this.searchLight.intensity = 0;
      (this.attackBeam.material as THREE.LineBasicMaterial).opacity = 0.0;
      return;
    }
    this.searchTarget.position.copy(targetPos);
    this.searchLight.intensity = this.isAttacking ? 3.5 : 1.8;
    this.searchLight.color.setHex(this.isAttacking ? 0xff1744 : 0x00e5ff);

    if (this.isAttacking) {
      const pts = [
        new THREE.Vector3(this.position.x, this.position.y - 0.2, this.position.z),
        new THREE.Vector3(targetPos.x, targetPos.y + 0.8, targetPos.z),
      ];
      this.attackBeam.geometry.dispose();
      this.attackBeam.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      (this.attackBeam.material as THREE.LineBasicMaterial).opacity = 0.85;
    } else {
      (this.attackBeam.material as THREE.LineBasicMaterial).opacity = 0.0;
    }
  }

  private updateStatusLight(): void {
    const colors: Record<DroneMode, number> = {
      parked: 0x666666,
      launching: 0xffc107,
      autonomous: this.isAttacking ? 0xff1744 : 0x00e676,
      manual: 0x2196f3,
    };
    const c = colors[this.mode];
    this.statusLightMat.color.setHex(c);
    this.statusLightMat.emissive.setHex(c);
    this.statusLightMat.emissiveIntensity = this.mode === 'parked' ? 0.3 : 1.8;
  }

  // ─── Observation ──────────────────────────────────────────────

  getObservation(timestamp: number): Observation {
    return {
      camera: null,
      cameraSize: { width: 0, height: 0 },
      position: this.position.clone(),
      velocity: this.velocity.clone(),
      orientation: this.orientation.clone(),
      altitude: this.position.y,
      timestamp,
    };
  }

  // ─── Reset ────────────────────────────────────────────────────

  reset(): void {
    this.position.set(this.launchPadPos.x, 0.3, this.launchPadPos.z);
    this.velocity.set(0, 0, 0);
    this.orientation.set(0, 0, 0);
    this.currentAction = { forward: 0, lateral: 0, vertical: 0, yaw: 0 };
    this.mode = 'parked';
    this.isAttacking = false;
    this.searchLight.intensity = 0;
    (this.attackBeam.material as THREE.LineBasicMaterial).opacity = 0.0;
    this.totalDistance = 0;
    this.trail = [];
    this.group.position.copy(this.position);
    this.group.rotation.set(0, 0, 0);
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = new THREE.BufferGeometry();
  }
}
