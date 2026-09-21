/**
 * Intruder Target Agent
 * 
 * Simulates an intruder approaching a military base.
 * 
 * Behavior phases:
 * 1. APPROACHING — sneaking toward the perimeter from a random direction
 * 2. BREACHING   — crossing the perimeter fence
 * 3. INFILTRATING — moving through the base toward high-value targets
 * 4. EVADING     — once detected, tries to evade the drone
 * 
 * The drone should detect the breach and respond.
 */

import * as THREE from 'three';

export type IntruderPhase = 'approaching' | 'breaching' | 'infiltrating' | 'evading' | 'eliminated';

const CONFIG = {
  /** Approach speed before breach (m/s) — cautious */
  approachSpeed: 1.5,
  /** Speed inside perimeter (m/s) */
  infiltrateSpeed: 2.5,
  /** Evasion speed (m/s) — running */
  evadeSpeed: 4.0,
  /** Starting distance from center */
  spawnDistance: 80,
};

export class Target {
  readonly group: THREE.Group;
  readonly position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  phase: IntruderPhase = 'approaching';

  /** Has the intruder crossed the perimeter? */
  hasBreached = false;
  /** Is the intruder detected by the drone? */
  isDetected = false;
  /** Has the intruder been neutralized/eliminated by the drone? */
  isEliminated = false;

  private ring!: THREE.Mesh;
  private perimeterRadius: number;
  private waypoints: THREE.Vector3[] = [];
  private currentWaypointIdx = 0;
  private pauseTimer = 0;
  private trail: THREE.Vector3[] = [];
  trailLine: THREE.Line;

  constructor(perimeterRadius: number = 50) {
    this.group = new THREE.Group();
    this.perimeterRadius = perimeterRadius;
    this.speed = CONFIG.approachSpeed;
    this.velocity = new THREE.Vector3();

    // Spawn at random point outside perimeter
    const angle = Math.random() * Math.PI * 2;
    const spawnX = Math.cos(angle) * CONFIG.spawnDistance;
    const spawnZ = Math.sin(angle) * CONFIG.spawnDistance;
    this.position = new THREE.Vector3(spawnX, 0, spawnZ);

    this.buildModel();
    this.generateWaypoints(angle);

    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({ color: 0xff4081, transparent: true, opacity: 0.4 });
    this.trailLine = new THREE.Line(trailGeo, trailMat);
  }

  // ─── Visual Model (dark-clothed intruder) ─────────────────────

  private buildModel(): void {
    // Torso — dark clothing
    const torsoGeo = new THREE.CylinderGeometry(0.28, 0.32, 1.0, 8);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    this.group.add(torso);

    // Head — with dark balaclava
    const headGeo = new THREE.SphereGeometry(0.2, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.65;
    head.castShadow = true;
    this.group.add(head);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    for (const dx of [-0.14, 0.14]) {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(dx, 0.4, 0);
      leg.castShadow = true;
      this.group.add(leg);
    }

    // Backpack
    const packGeo = new THREE.BoxGeometry(0.35, 0.4, 0.2);
    const packMat = new THREE.MeshStandardMaterial({ color: 0x2a2a1a, roughness: 0.85 });
    const pack = new THREE.Mesh(packGeo, packMat);
    pack.position.set(0, 1.1, 0.25);
    this.group.add(pack);

    // Detection indicator ring (red glow — visible from above)
    const ringGeo = new THREE.TorusGeometry(0.6, 0.04, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xff1744,
      emissive: 0xff1744,
      emissiveIntensity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 2.3;
    ring.rotation.x = Math.PI / 2;
    this.ring = ring;
    this.group.add(ring);

    this.group.position.copy(this.position);
  }

  // ─── Waypoints ────────────────────────────────────────────────

  private generateWaypoints(approachAngle: number): void {
    // Path: outside → perimeter breach point → inside targets
    const breachX = Math.cos(approachAngle) * (this.perimeterRadius - 2);
    const breachZ = Math.sin(approachAngle) * (this.perimeterRadius - 2);

    // Approach waypoints (outside, getting closer)
    const midX = Math.cos(approachAngle) * (CONFIG.spawnDistance * 0.6);
    const midZ = Math.sin(approachAngle) * (CONFIG.spawnDistance * 0.6);

    this.waypoints = [
      // Approach
      new THREE.Vector3(midX, 0, midZ),
      new THREE.Vector3(breachX, 0, breachZ),
      // Inside — infiltration targets
      new THREE.Vector3(breachX * 0.5, 0, breachZ * 0.5),
      new THREE.Vector3(-10, 0, -10),
      new THREE.Vector3(0, 0, 0),    // helipad (high value)
      new THREE.Vector3(15, 0, 10),
      new THREE.Vector3(-20, 0, 15),
      new THREE.Vector3(10, 0, -20),
      new THREE.Vector3(-15, 0, -15), // command center
    ];
  }

  // ─── Update ───────────────────────────────────────────────────

  update(dt: number): void {
    if (this.isEliminated) {
      this.velocity.set(0, 0, 0);
      this.group.position.copy(this.position);
      this.group.position.y = 0.2;
      this.group.rotation.x = Math.PI / 2;
      return;
    }

    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      this.velocity.set(0, 0, 0);
      return;
    }

    // Check phase transitions
    const distFromCenter = Math.sqrt(this.position.x ** 2 + this.position.z ** 2);
    if (!this.hasBreached && distFromCenter < this.perimeterRadius) {
      this.hasBreached = true;
      this.phase = 'infiltrating';
      this.speed = CONFIG.infiltrateSpeed;
    }

    // If detected and infiltrating, switch to evading
    if (this.isDetected && this.phase === 'infiltrating') {
      this.phase = 'evading';
      this.speed = CONFIG.evadeSpeed;
    }

    // Get current target waypoint
    if (this.currentWaypointIdx >= this.waypoints.length) {
      this.currentWaypointIdx = 3; // loop inside the base
    }
    const target = this.waypoints[this.currentWaypointIdx];
    const toTarget = new THREE.Vector3().subVectors(target, this.position);
    toTarget.y = 0;
    const dist = toTarget.length();

    if (dist < 2.0) {
      this.currentWaypointIdx++;
      if (this.phase === 'approaching') {
        this.pauseTimer = 1.0; // cautious pause
      } else if (this.phase === 'evading') {
        // Pick random direction away from center
        const awayAngle = Math.atan2(this.position.z, this.position.x) + (Math.random() - 0.5) * Math.PI;
        const evadeTarget = new THREE.Vector3(
          this.position.x + Math.cos(awayAngle) * 20,
          0,
          this.position.z + Math.sin(awayAngle) * 20,
        );
        // Clamp within larger area
        evadeTarget.x = Math.max(-70, Math.min(70, evadeTarget.x));
        evadeTarget.z = Math.max(-70, Math.min(70, evadeTarget.z));
        this.waypoints.push(evadeTarget);
      }
      return;
    }

    // Move toward waypoint
    const direction = toTarget.normalize();

    // Evasion: add randomness
    if (this.phase === 'evading') {
      direction.x += (Math.random() - 0.5) * 0.3;
      direction.z += (Math.random() - 0.5) * 0.3;
      direction.normalize();
    }

    this.velocity.copy(direction).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = 0;

    // Face movement direction
    const angle = Math.atan2(direction.x, direction.z);
    this.group.rotation.y = angle;

    // Sync
    this.group.position.copy(this.position);

    // Walking bob — faster when running
    const bobSpeed = this.phase === 'evading' ? 0.015 : 0.008;
    const bobHeight = this.phase === 'evading' ? 0.12 : 0.06;
    this.group.position.y = Math.abs(Math.sin(Date.now() * bobSpeed)) * bobHeight;

    // Trail
    this.trail.push(this.position.clone());
    if (this.trail.length > 400) this.trail.shift();
    const positions = new Float32Array(this.trail.length * 3);
    for (let i = 0; i < this.trail.length; i++) {
      positions[i * 3] = this.trail[i].x;
      positions[i * 3 + 1] = 0.05;
      positions[i * 3 + 2] = this.trail[i].z;
    }
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = new THREE.BufferGeometry();
    this.trailLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  }

  eliminate(): void {
    if (this.isEliminated) return;
    this.isEliminated = true;
    this.phase = 'eliminated';
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.group.rotation.x = Math.PI / 2;
    this.group.position.y = 0.2;
    if (this.ring) {
      (this.ring.material as THREE.MeshStandardMaterial).color.setHex(0x333333);
      (this.ring.material as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
      (this.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
    }
  }

  // ─── Control ──────────────────────────────────────────────────

  setDetected(detected: boolean): void {
    this.isDetected = detected;
  }

  getPhase(): IntruderPhase {
    return this.phase;
  }

  // ─── Reset ────────────────────────────────────────────────────

  reset(): void {
    const angle = Math.random() * Math.PI * 2;
    this.position.set(
      Math.cos(angle) * CONFIG.spawnDistance,
      0,
      Math.sin(angle) * CONFIG.spawnDistance,
    );
    this.velocity.set(0, 0, 0);
    this.phase = 'approaching';
    this.hasBreached = false;
    this.isDetected = false;
    this.isEliminated = false;
    this.speed = CONFIG.approachSpeed;
    this.currentWaypointIdx = 0;
    this.pauseTimer = 0;
    this.trail = [];
    this.group.position.copy(this.position);
    this.group.rotation.set(0, 0, 0);
    if (this.ring) {
      (this.ring.material as THREE.MeshStandardMaterial).color.setHex(0xff1744);
      (this.ring.material as THREE.MeshStandardMaterial).emissive.setHex(0xff1744);
      (this.ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
    }
    this.generateWaypoints(Math.atan2(this.position.z, this.position.x));
    this.trailLine.geometry.dispose();
    this.trailLine.geometry = new THREE.BufferGeometry();
  }
}
