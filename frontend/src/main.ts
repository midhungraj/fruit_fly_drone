/**
 * NeuroDrone — Main Entry Point
 * 
 * Sets up the Three.js renderer, camera, orbit controls,
 * multi-camera perspectives (Orbit / Drone Chase / Intruder Cam),
 * and the simulation animation loop.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SimulationManager } from './simulation/SimulationManager';
import { DashboardUI } from './ui/Dashboard';

// ─── Renderer ─────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setSize(window.innerWidth - 340, window.innerHeight); // leave room for dashboard
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ─── Simulation Manager ───────────────────────────────────────────────

const sim = new SimulationManager();

// ─── Camera & Modes ───────────────────────────────────────────────────

export type CameraMode = 'orbit' | 'drone' | 'intruder';
let cameraMode: CameraMode = 'orbit';

const camera = new THREE.PerspectiveCamera(
  55,
  (window.innerWidth - 340) / window.innerHeight,
  0.1,
  600,
);
camera.position.set(45, 38, 55);

// Orbit controls for free inspection
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 4, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.04; // prevent going below ground
controls.minDistance = 4;
controls.maxDistance = 250;

function cycleCamera(): void {
  if (cameraMode === 'orbit') {
    cameraMode = 'drone';
  } else if (cameraMode === 'drone') {
    cameraMode = 'intruder';
  } else {
    cameraMode = 'orbit';
  }
  console.log(`[CAMERA] Mode switched to: ${cameraMode.toUpperCase()}`);
}

// ─── Dashboard UI ─────────────────────────────────────────────────────

const ui = new DashboardUI(sim, cycleCamera);

// ─── Keyboard Controls ───────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'Space':
      // In manual mode, Space is drone climb up — don't toggle simulation pause
      if (sim.drone.mode === 'manual') {
        return;
      }
      e.preventDefault();
      if (sim.state === 'stopped') sim.start();
      else sim.togglePause();
      break;

    case 'KeyR':
      sim.reset();
      break;

    case 'KeyL':
      if (sim.state === 'stopped') sim.start();
      sim.scrambleDrone();
      break;

    case 'KeyC':
      cycleCamera();
      break;
  }
});

// ─── Resize ───────────────────────────────────────────────────────────

function onResize(): void {
  const w = window.innerWidth - 340;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ─── Animation Loop ──────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05); // cap to avoid delta-time explosions

  // Update simulation
  sim.update(dt);

  // Camera tracking modes
  if (cameraMode === 'drone') {
    const offset = new THREE.Vector3(0, 3.5, 7.5);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), sim.drone.orientation.y);
    offset.applyQuaternion(yawQuat);
    camera.position.copy(sim.drone.position).add(offset);
    controls.target.copy(sim.drone.position);
  } else if (cameraMode === 'intruder') {
    const offset = new THREE.Vector3(0, 3.5, 7.0);
    camera.position.copy(sim.target.position).add(offset);
    controls.target.copy(sim.target.position);
  }

  // Update controls
  controls.update();

  // Update dashboard telemetry
  ui.update();

  // Render scene
  renderer.render(sim.scene, camera);
}

// Auto-start simulation so defense scenario activates immediately
sim.start();

animate();

console.log(
  '%c🧠 NeuroDrone Base Defense Simulation Active',
  'color: #00e5ff; font-size: 15px; font-weight: bold;'
);
