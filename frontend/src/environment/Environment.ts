/**
 * Military Base Environment
 * 
 * A secured military compound with:
 * - Perimeter fence with barbed wire
 * - Guard towers at corners
 * - Main hangar / command center
 * - Bunkers
 * - Drone launch pad (helipad)
 * - Watch towers
 * - Vehicle barriers
 * - Sandbag positions
 * - Restricted zones
 * 
 * The intruder approaches from outside the perimeter.
 * The drone is stationed at the helipad until breach is detected.
 */

import * as THREE from 'three';

const C = {
  ground: 0x3d3522,        // desert/dirt
  groundDark: 0x2a2518,
  concrete: 0x6b6b6b,
  concreteDark: 0x4a4a4a,
  metal: 0x5c6370,
  metalDark: 0x3b4048,
  fence: 0x888888,
  fencePost: 0x555555,
  hangar: 0x4a5a3a,         // military green
  hangarDark: 0x3a4a2a,
  bunker: 0x5a5a4a,
  sandbag: 0x8b7d5c,
  tower: 0x6a6a5a,
  helipad: 0x555555,
  helipadMark: 0xdddddd,
  warning: 0xf57c00,
  danger: 0xff1744,
  spotlight: 0xffffcc,
  barbed: 0x999999,
};

export interface EnvironmentObjects {
  ground: THREE.Mesh;
  buildings: THREE.Mesh[];
  walls: THREE.Mesh[];
  obstacles: THREE.Mesh[];
  restrictedZones: THREE.Mesh[];
  collidables: THREE.Object3D[];
  /** Position of the drone launch pad */
  launchPadPosition: THREE.Vector3;
  /** Perimeter breach detection radius */
  perimeterRadius: number;
}

export function createEnvironment(scene: THREE.Scene): EnvironmentObjects {
  const buildings: THREE.Mesh[] = [];
  const walls: THREE.Mesh[] = [];
  const obstacles: THREE.Mesh[] = [];
  const restrictedZones: THREE.Mesh[] = [];

  // ── Ground (desert terrain) ─────────────────────────────────────
  const groundGeo = new THREE.PlaneGeometry(300, 300, 32, 32);
  // Add subtle terrain variation
  const posAttr = groundGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const noise = Math.sin(x * 0.05) * Math.cos(y * 0.07) * 0.3;
    posAttr.setZ(i, noise);
  }
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshStandardMaterial({
    color: C.ground,
    roughness: 0.95,
    metalness: 0.0,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Subtle inner compound concrete floor
  const floorGeo = new THREE.PlaneGeometry(100, 100);
  const floorMat = new THREE.MeshStandardMaterial({
    color: C.concreteDark,
    roughness: 0.85,
    metalness: 0.05,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  scene.add(floor);

  // ── Perimeter Fence ─────────────────────────────────────────────
  const perimeterRadius = 50;
  const fenceHeight = 3.5;
  const fenceSegments = 64;
  const postSpacing = Math.PI * 2 / fenceSegments;

  for (let i = 0; i < fenceSegments; i++) {
    const angle = i * postSpacing;
    const nextAngle = (i + 1) * postSpacing;
    const x = Math.cos(angle) * perimeterRadius;
    const z = Math.sin(angle) * perimeterRadius;
    const nx = Math.cos(nextAngle) * perimeterRadius;
    const nz = Math.sin(nextAngle) * perimeterRadius;

    // Fence post
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, fenceHeight + 0.5, 4);
    const postMat = new THREE.MeshStandardMaterial({ color: C.fencePost, roughness: 0.5, metalness: 0.4 });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, fenceHeight / 2, z);
    post.castShadow = true;
    scene.add(post);

    // Fence panel (chain link — thin box)
    const dx = nx - x;
    const dz = nz - z;
    const panelLen = Math.sqrt(dx * dx + dz * dz);
    const panelGeo = new THREE.BoxGeometry(panelLen, fenceHeight, 0.05);
    const panelMat = new THREE.MeshStandardMaterial({
      color: C.fence,
      transparent: true,
      opacity: 0.3,
      roughness: 0.6,
      metalness: 0.3,
      side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set((x + nx) / 2, fenceHeight / 2, (z + nz) / 2);
    panel.rotation.y = -Math.atan2(dz, dx);
    scene.add(panel);
    walls.push(panel);

    // Barbed wire on top (every other post)
    if (i % 2 === 0) {
      const barbGeo = new THREE.TorusGeometry(0.15, 0.02, 4, 8);
      const barbMat = new THREE.MeshStandardMaterial({ color: C.barbed, roughness: 0.4, metalness: 0.6 });
      const barb = new THREE.Mesh(barbGeo, barbMat);
      barb.position.set(x, fenceHeight + 0.3, z);
      barb.rotation.x = Math.PI / 2;
      scene.add(barb);
    }
  }

  // ── Guard Towers (4 corners) ────────────────────────────────────
  const towerAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
  for (const angle of towerAngles) {
    const tx = Math.cos(angle) * (perimeterRadius - 1);
    const tz = Math.sin(angle) * (perimeterRadius - 1);
    createGuardTower(scene, tx, tz, buildings);
  }

  // ── Main Hangar / Command Center ────────────────────────────────
  createHangar(scene, -15, -15, 22, 8, 14, C.hangar, buildings);
  createHangar(scene, 18, -20, 16, 6, 10, C.hangarDark, buildings);

  // ── Bunkers ─────────────────────────────────────────────────────
  createBunker(scene, -25, 15, buildings);
  createBunker(scene, 25, 20, buildings);
  createBunker(scene, -10, 30, buildings);

  // ── Drone Launch Pad (Helipad) ──────────────────────────────────
  const launchPadPos = new THREE.Vector3(0, 0, 0);
  createHelipad(scene, launchPadPos.x, launchPadPos.z);

  // ── Sandbag Positions ───────────────────────────────────────────
  const sandbagPositions: [number, number][] = [
    [10, 10], [-10, 10], [10, -10], [-20, -5],
    [30, 0], [0, 25], [-30, -20],
  ];
  for (const [sx, sz] of sandbagPositions) {
    createSandbags(scene, sx, sz, obstacles);
  }

  // ── Vehicle Barriers (Jersey barriers) ──────────────────────────
  const barrierPositions: { pos: [number, number]; angle: number }[] = [
    { pos: [0, -35], angle: 0 },          // main gate approach
    { pos: [3, -35], angle: 0 },
    { pos: [-3, -35], angle: 0 },
    { pos: [0, -38], angle: Math.PI / 6 },
    { pos: [4, -38], angle: -Math.PI / 6 },
  ];
  for (const b of barrierPositions) {
    createBarrier(scene, b.pos[0], b.pos[1], b.angle, obstacles);
  }

  // ── Restricted Zones ────────────────────────────────────────────
  // Inner high-security zone around helipad
  const innerZoneGeo = new THREE.RingGeometry(8, 8.3, 64);
  const innerZoneMat = new THREE.MeshBasicMaterial({
    color: C.danger,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
  });
  const innerZone = new THREE.Mesh(innerZoneGeo, innerZoneMat);
  innerZone.rotation.x = -Math.PI / 2;
  innerZone.position.y = 0.03;
  scene.add(innerZone);
  restrictedZones.push(innerZone);

  // Outer perimeter warning zone
  const outerZoneGeo = new THREE.RingGeometry(perimeterRadius - 0.3, perimeterRadius + 0.3, 128);
  const outerZoneMat = new THREE.MeshBasicMaterial({
    color: C.warning,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const outerZone = new THREE.Mesh(outerZoneGeo, outerZoneMat);
  outerZone.rotation.x = -Math.PI / 2;
  outerZone.position.y = 0.02;
  scene.add(outerZone);
  restrictedZones.push(outerZone);

  // ── Lighting ────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x8899aa, 0.35);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
  sun.position.set(60, 80, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 200;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0xc4a882, 0x3d3522, 0.35);
  scene.add(hemi);

  // ── Sky (dusk military atmosphere) ──────────────────────────────
  scene.background = new THREE.Color(0x4a6070);
  scene.fog = new THREE.FogExp2(0x4a6070, 0.006);

  const collidables: THREE.Object3D[] = [...buildings, ...obstacles];

  return {
    ground, buildings, walls, obstacles, restrictedZones,
    collidables,
    launchPadPosition: launchPadPos,
    perimeterRadius,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Helper builders
// ═══════════════════════════════════════════════════════════════════════

function createGuardTower(scene: THREE.Scene, x: number, z: number, buildings: THREE.Mesh[]): void {
  const group = new THREE.Group();

  // Legs (4 pillars)
  const legGeo = new THREE.CylinderGeometry(0.15, 0.2, 7, 6);
  const legMat = new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.5, metalness: 0.4 });
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(dx * 1.2, 3.5, dz * 1.2);
    leg.castShadow = true;
    group.add(leg);
  }

  // Platform
  const platGeo = new THREE.BoxGeometry(3.5, 0.3, 3.5);
  const platMat = new THREE.MeshStandardMaterial({ color: C.tower, roughness: 0.7 });
  const platform = new THREE.Mesh(platGeo, platMat);
  platform.position.y = 7;
  platform.castShadow = true;
  group.add(platform);
  buildings.push(platform);

  // Walls (half-height parapet)
  const wallMat = new THREE.MeshStandardMaterial({ color: C.tower, roughness: 0.7, metalness: 0.1 });
  for (const [wx, wz, ww, wd] of [
    [0, -1.6, 3.5, 0.15], [0, 1.6, 3.5, 0.15],
    [-1.6, 0, 0.15, 3.5], [1.6, 0, 0.15, 3.5],
  ] as [number, number, number, number][]) {
    const wallGeo = new THREE.BoxGeometry(ww, 1.2, wd);
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(wx, 7.75, wz);
    wall.castShadow = true;
    group.add(wall);
  }

  // Roof
  const roofGeo = new THREE.ConeGeometry(2.8, 1.5, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: C.hangarDark, roughness: 0.6 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 9.1;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);

  // Spotlight
  const spotLight = new THREE.SpotLight(C.spotlight, 2, 60, Math.PI / 6, 0.5, 1.5);
  spotLight.position.set(0, 7.5, 2);
  spotLight.target.position.set(x + 15 * Math.sign(x || 1), 0, z + 15 * Math.sign(z || 1));
  group.add(spotLight);
  scene.add(spotLight.target);

  group.position.set(x, 0, z);
  scene.add(group);
}

function createHangar(
  scene: THREE.Scene, x: number, z: number,
  w: number, h: number, d: number, color: number,
  buildings: THREE.Mesh[]
): void {
  const group = new THREE.Group();

  // Main structure (quonset hut shape — box + half-cylinder roof)
  const wallGeo = new THREE.BoxGeometry(w, h * 0.7, d);
  const wallMat = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.15 });
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.y = h * 0.35;
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.userData = { type: 'building', collidable: true };
  group.add(wallMesh);
  buildings.push(wallMesh);

  // Curved roof
  const roofGeo = new THREE.CylinderGeometry(w / 2, w / 2, d, 16, 1, false, 0, Math.PI);
  const roofMat = new THREE.MeshStandardMaterial({ color: C.metalDark, roughness: 0.4, metalness: 0.3 });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.rotation.x = Math.PI / 2;
  roofMesh.rotation.z = Math.PI / 2;
  roofMesh.position.y = h * 0.7;
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // Door marking (darker rectangle on front)
  const doorGeo = new THREE.PlaneGeometry(w * 0.6, h * 0.6);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, h * 0.3, d / 2 + 0.05);
  group.add(door);

  group.position.set(x, 0, z);
  scene.add(group);
}

function createBunker(scene: THREE.Scene, x: number, z: number, buildings: THREE.Mesh[]): void {
  // Low, reinforced structure
  const geo = new THREE.BoxGeometry(6, 2.5, 5);
  const mat = new THREE.MeshStandardMaterial({ color: C.bunker, roughness: 0.85, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 1.25, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'bunker', collidable: true };
  scene.add(mesh);
  buildings.push(mesh);

  // Observation slit
  const slitGeo = new THREE.BoxGeometry(4, 0.3, 0.3);
  const slitMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const slit = new THREE.Mesh(slitGeo, slitMat);
  slit.position.set(x, 2.0, z + 2.6);
  scene.add(slit);

  // Sand piled around base
  const sandGeo = new THREE.CylinderGeometry(4, 4.5, 0.5, 8);
  const sandMat = new THREE.MeshStandardMaterial({ color: C.sandbag, roughness: 0.95 });
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.position.set(x, 0.25, z);
  scene.add(sand);
}

function createHelipad(scene: THREE.Scene, x: number, z: number): void {
  // Concrete pad
  const padGeo = new THREE.CylinderGeometry(6, 6, 0.15, 32);
  const padMat = new THREE.MeshStandardMaterial({ color: C.helipad, roughness: 0.8 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.set(x, 0.075, z);
  pad.receiveShadow = true;
  scene.add(pad);

  // "H" marking
  const hMat = new THREE.MeshStandardMaterial({ color: C.helipadMark, roughness: 0.7 });

  // H left vertical
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 3), hMat);
  h1.position.set(x - 1.0, 0.16, z);
  scene.add(h1);

  // H right vertical
  const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 3), hMat);
  h2.position.set(x + 1.0, 0.16, z);
  scene.add(h2);

  // H crossbar
  const h3 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.02, 0.4), hMat);
  h3.position.set(x, 0.16, z);
  scene.add(h3);

  // Circle marking
  const circleGeo = new THREE.RingGeometry(4.5, 4.8, 48);
  const circleMat = new THREE.MeshBasicMaterial({ color: C.helipadMark, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  const circle = new THREE.Mesh(circleGeo, circleMat);
  circle.rotation.x = -Math.PI / 2;
  circle.position.set(x, 0.17, z);
  scene.add(circle);

  // Landing lights (4 corners)
  const lightColor = 0x00ff88;
  for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]] as [number, number][]) {
    const lightGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const lightMat = new THREE.MeshStandardMaterial({
      color: lightColor,
      emissive: lightColor,
      emissiveIntensity: 2.0,
    });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.set(x + lx, 0.2, z + lz);
    scene.add(light);
  }
}

function createSandbags(scene: THREE.Scene, x: number, z: number, obstacles: THREE.Mesh[]): void {
  // Semicircular sandbag wall
  const mat = new THREE.MeshStandardMaterial({ color: C.sandbag, roughness: 0.95, metalness: 0.0 });

  for (let i = 0; i < 5; i++) {
    const angle = (i / 4) * Math.PI - Math.PI / 2;
    const r = 1.5;
    const bagGeo = new THREE.BoxGeometry(1.2, 0.4, 0.5);
    const bag = new THREE.Mesh(bagGeo, mat);
    bag.position.set(x + Math.cos(angle) * r, 0.2 + Math.floor(i / 5) * 0.4, z + Math.sin(angle) * r);
    bag.rotation.y = -angle;
    bag.castShadow = true;
    scene.add(bag);
    obstacles.push(bag);
  }

  // Second row
  for (let i = 0; i < 4; i++) {
    const angle = (i / 3) * Math.PI - Math.PI / 2;
    const r = 1.5;
    const bagGeo = new THREE.BoxGeometry(1.0, 0.35, 0.45);
    const bag = new THREE.Mesh(bagGeo, mat);
    bag.position.set(x + Math.cos(angle) * r, 0.6, z + Math.sin(angle) * r);
    bag.rotation.y = -angle;
    bag.castShadow = true;
    scene.add(bag);
  }
}

function createBarrier(scene: THREE.Scene, x: number, z: number, angle: number, obstacles: THREE.Mesh[]): void {
  // Jersey barrier (concrete road barrier)
  const geo = new THREE.BoxGeometry(0.6, 0.9, 2.0);
  const mat = new THREE.MeshStandardMaterial({ color: C.concrete, roughness: 0.8 });
  const barrier = new THREE.Mesh(geo, mat);
  barrier.position.set(x, 0.45, z);
  barrier.rotation.y = angle;
  barrier.castShadow = true;
  barrier.userData = { type: 'barrier', collidable: true };
  scene.add(barrier);
  obstacles.push(barrier);

  // Warning stripe
  const stripeGeo = new THREE.BoxGeometry(0.62, 0.15, 2.02);
  const stripeMat = new THREE.MeshStandardMaterial({ color: C.warning, roughness: 0.7 });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.set(x, 0.75, z);
  stripe.rotation.y = angle;
  scene.add(stripe);
}
