/**
 * Dashboard UI
 * 
 * Builds the HTML overlay for the research dashboard:
 * - Military base defense status & breach alerts
 * - Drone operational controls (scramble, manual override, camera modes)
 * - Drosophila connectome neural telemetry (LC10 azimuth, LC4 looming attack dive, optomotor)
 * - Metrics panel (distance, speed, interceptions, trajectory)
 */

import type { SimulationManager } from '../simulation/SimulationManager';

export class DashboardUI {
  private container: HTMLDivElement;
  private sim: SimulationManager;
  private onCameraToggle?: () => void;

  // Panel elements for updating
  private statusElements: Record<string, HTMLElement> = {};
  private startBtn!: HTMLButtonElement;
  private pauseBtn!: HTMLButtonElement;
  private scrambleBtn!: HTMLButtonElement;
  private manualBtn!: HTMLButtonElement;
  private cameraBtn!: HTMLButtonElement;
  private speedSlider!: HTMLInputElement;
  private speedLabel!: HTMLSpanElement;
  private alertBanner!: HTMLDivElement;

  constructor(sim: SimulationManager, onCameraToggle?: () => void) {
    this.sim = sim;
    this.onCameraToggle = onCameraToggle;
    this.container = document.createElement('div');
    this.container.id = 'dashboard';
    document.body.appendChild(this.container);

    this.buildStyles();
    this.buildHeader();
    this.buildAlertBanner();
    this.buildControlPanel();
    this.buildStatusPanel();
    this.buildNeuralPanel();
    this.buildInfoPanel();
  }

  // ─── Styling ──────────────────────────────────────────────────────

  private buildStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { overflow: hidden; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; background: #0a0a0f; }
      canvas { display: block; }

      #dashboard {
        position: fixed;
        top: 0; right: 0;
        width: 340px;
        height: 100vh;
        background: rgba(12, 14, 24, 0.94);
        backdrop-filter: blur(24px);
        border-left: 1px solid rgba(0, 229, 255, 0.18);
        color: #e0e0e0;
        display: flex;
        flex-direction: column;
        gap: 0;
        z-index: 100;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(0,229,255,0.25) transparent;
        box-shadow: -4px 0 25px rgba(0, 0, 0, 0.6);
      }

      .panel-header {
        background: linear-gradient(135deg, rgba(0, 229, 255, 0.15), rgba(0, 150, 200, 0.08));
        padding: 16px 18px;
        border-bottom: 1px solid rgba(0, 229, 255, 0.15);
      }

      .panel-header h1 {
        font-size: 17px;
        font-weight: 700;
        background: linear-gradient(135deg, #00e5ff, #00b0ff);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        letter-spacing: 2px;
        text-transform: uppercase;
      }

      .panel-header .subtitle {
        font-size: 10px;
        color: rgba(255,255,255,0.4);
        letter-spacing: 1px;
        margin-top: 3px;
        text-transform: uppercase;
      }

      .alert-banner {
        padding: 10px 18px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1px;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 8px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        transition: all 0.3s ease;
      }

      .alert-banner.secure {
        background: rgba(0, 230, 118, 0.12);
        color: #00e676;
        border-left: 4px solid #00e676;
      }

      .alert-banner.breached {
        background: rgba(255, 23, 68, 0.22);
        color: #ff1744;
        border-left: 4px solid #ff1744;
        animation: pulseAlert 1.5s infinite;
      }

      @keyframes pulseAlert {
        0%, 100% { background: rgba(255, 23, 68, 0.2); }
        50% { background: rgba(255, 23, 68, 0.45); }
      }

      .panel-section {
        padding: 13px 18px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }

      .panel-section h3 {
        font-size: 10px;
        font-weight: 700;
        color: rgba(0, 229, 255, 0.75);
        letter-spacing: 1.5px;
        text-transform: uppercase;
        margin-bottom: 10px;
      }

      .stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 11.5px;
      }

      .stat-label { color: rgba(255,255,255,0.55); font-size: 11px; }
      .stat-value {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11.5px;
        color: #e0e0e0;
      }

      .stat-value.highlight { color: #00e5ff; }
      .stat-value.success { color: #00e676; }
      .stat-value.warn { color: #ffc107; }
      .stat-value.danger { color: #ff1744; font-weight: 700; }

      .controls-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 10px;
      }

      .ctrl-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #e0e0e0;
        padding: 7px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
      }

      .ctrl-btn:hover {
        background: rgba(0, 229, 255, 0.15);
        border-color: rgba(0, 229, 255, 0.4);
        color: #00e5ff;
      }

      .ctrl-btn.active {
        background: rgba(0, 230, 118, 0.2);
        border-color: #00e676;
        color: #00e676;
      }

      .ctrl-btn.danger-btn {
        border-color: rgba(255, 23, 68, 0.3);
      }
      .ctrl-btn.danger-btn:hover {
        background: rgba(255, 23, 68, 0.2);
        border-color: #ff1744;
        color: #ff1744;
      }

      .ctrl-btn.accent-btn {
        grid-column: span 2;
        background: linear-gradient(135deg, rgba(255, 23, 68, 0.25), rgba(255, 145, 0, 0.25));
        border: 1px solid rgba(255, 23, 68, 0.5);
        color: #ff5252;
      }
      .ctrl-btn.accent-btn:hover {
        background: linear-gradient(135deg, rgba(255, 23, 68, 0.4), rgba(255, 145, 0, 0.4));
        color: #fff;
      }

      .speed-control {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .speed-control input[type="range"] {
        flex: 1;
        -webkit-appearance: none;
        appearance: none;
        height: 4px;
        background: rgba(0, 229, 255, 0.15);
        border-radius: 2px;
        outline: none;
      }

      .speed-control input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #00e5ff;
        cursor: pointer;
      }

      .state-badge {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 3px;
        font-size: 9.5px;
        font-weight: 700;
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }

      .state-badge.stopped { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }
      .state-badge.running { background: rgba(0, 230, 118, 0.15); color: #00e676; }
      .state-badge.paused { background: rgba(255, 193, 7, 0.15); color: #ffc107; }

      .state-badge.parked { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.4); }
      .state-badge.launching { background: rgba(255, 193, 7, 0.2); color: #ffc107; }
      .state-badge.autonomous { background: rgba(0, 229, 255, 0.18); color: #00e5ff; }
      .state-badge.manual { background: rgba(33, 150, 243, 0.2); color: #2196f3; }
      .state-badge.attack { background: rgba(255, 23, 68, 0.25); color: #ff1744; font-weight: 800; }

      /* Live neural meter bar */
      .meter-bar-container {
        width: 100px;
        height: 6px;
        background: rgba(255,255,255,0.08);
        border-radius: 3px;
        overflow: hidden;
      }
      .meter-bar-fill {
        height: 100%;
        background: #00e5ff;
        border-radius: 3px;
        transition: width 0.08s ease;
      }
      .meter-bar-fill.danger { background: #ff1744; }

      .info-panel {
        margin-top: auto;
        padding: 12px 18px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }

      .info-panel p {
        font-size: 10px;
        color: rgba(255,255,255,0.35);
        line-height: 1.6;
      }

      kbd {
        display: inline-block;
        padding: 1px 4px;
        font-size: 9.5px;
        font-family: 'JetBrains Mono', monospace;
        background: rgba(255,255,255,0.09);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 3px;
        color: rgba(255,255,255,0.7);
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Header ───────────────────────────────────────────────────────

  private buildHeader(): void {
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <h1>🧠 NeuroDrone</h1>
      <div class="subtitle">Drosophila Connectome Base Defense</div>
    `;
    this.container.appendChild(header);
  }

  // ─── Alert Banner ─────────────────────────────────────────────────

  private buildAlertBanner(): void {
    this.alertBanner = document.createElement('div');
    this.alertBanner.className = 'alert-banner secure';
    this.alertBanner.innerHTML = `<span>🛡️ PERIMETER SECURE</span>`;
    this.container.appendChild(this.alertBanner);
  }

  // ─── Controls ─────────────────────────────────────────────────────

  private buildControlPanel(): void {
    const section = this.createSection('Simulation Controls');

    const grid = document.createElement('div');
    grid.className = 'controls-grid';

    this.startBtn = this.createButton('Start', () => {
      if (this.sim.state === 'stopped') {
        this.sim.start();
      } else if (this.sim.state === 'paused') {
        this.sim.resume();
      }
    });

    this.pauseBtn = this.createButton('Pause', () => {
      this.sim.pause();
    });

    const resetBtn = this.createButton('Reset', () => {
      this.sim.reset();
    });
    resetBtn.classList.add('danger-btn');

    this.scrambleBtn = this.createButton('⚡ Scramble Drone', () => {
      if (this.sim.state === 'stopped') this.sim.start();
      this.sim.scrambleDrone();
    });
    this.scrambleBtn.classList.add('accent-btn');

    this.manualBtn = this.createButton('Manual Mode (M)', () => {
      this.sim.drone.toggleManual();
    });

    this.cameraBtn = this.createButton('Camera (C)', () => {
      if (this.onCameraToggle) this.onCameraToggle();
    });

    grid.appendChild(this.startBtn);
    grid.appendChild(this.pauseBtn);
    grid.appendChild(resetBtn);
    grid.appendChild(this.cameraBtn);
    grid.appendChild(this.scrambleBtn);
    grid.appendChild(this.manualBtn);
    section.appendChild(grid);

    // Speed control
    const speedDiv = document.createElement('div');
    speedDiv.className = 'speed-control';
    const speedLabelText = document.createElement('span');
    speedLabelText.className = 'stat-label';
    speedLabelText.textContent = 'Sim Speed';

    this.speedSlider = document.createElement('input');
    this.speedSlider.type = 'range';
    this.speedSlider.min = '0.1';
    this.speedSlider.max = '4.0';
    this.speedSlider.step = '0.1';
    this.speedSlider.value = '1.0';
    this.speedSlider.addEventListener('input', () => {
      const val = parseFloat(this.speedSlider.value);
      this.sim.config.timeScale = val;
      this.speedLabel.textContent = `${val.toFixed(1)}×`;
    });

    this.speedLabel = document.createElement('span');
    this.speedLabel.className = 'stat-value highlight';
    this.speedLabel.textContent = '1.0×';

    speedDiv.appendChild(speedLabelText);
    speedDiv.appendChild(this.speedSlider);
    speedDiv.appendChild(this.speedLabel);
    section.appendChild(speedDiv);

    this.container.appendChild(section);
  }

  // ─── Status Panel ─────────────────────────────────────────────────

  private buildStatusPanel(): void {
    const section = this.createSection('Tactical Telemetry');

    const rows: [string, string][] = [
      ['Defense Status', 'defenseStatus'],
      ['Drone Mode', 'droneModeBadge'],
      ['Intruder Phase', 'intruderPhase'],
      ['Interceptions', 'interceptions'],
      ['Distance to Intruder', 'distance'],
      ['Drone Altitude', 'droneAlt'],
      ['Drone Speed', 'droneSpeed'],
      ['Sim Time', 'simTime'],
      ['FPS', 'fps'],
    ];

    for (const [label, key] of rows) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'stat-label';
      labelSpan.textContent = label;
      const valueSpan = document.createElement('span');
      valueSpan.className = 'stat-value';
      valueSpan.textContent = '—';
      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      section.appendChild(row);
      this.statusElements[key] = valueSpan;
    }

    this.container.appendChild(section);
  }

  // ─── Drosophila Connectome Neural Panel ───────────────────────────

  private buildNeuralPanel(): void {
    const section = this.createSection('Fruit-Fly Connectome (SNN)');

    const rows: [string, string][] = [
      ['Backend Engine', 'backendEngine'],
      ['Visual Lock (FOV)', 'neuralLock'],
      ['LC10 Azimuth Pursuit', 'lc10Rate'],
      ['LC4 Looming Attack', 'lc4Rate'],
      ['Optomotor Altitude', 'optomotorVm'],
      ['Neural Spikes / s', 'neuralSpikes'],
    ];

    for (const [label, key] of rows) {
      const row = document.createElement('div');
      row.className = 'stat-row';
      const labelSpan = document.createElement('span');
      labelSpan.className = 'stat-label';
      labelSpan.textContent = label;
      const valueSpan = document.createElement('span');
      valueSpan.className = 'stat-value';
      valueSpan.textContent = '—';
      row.appendChild(labelSpan);
      row.appendChild(valueSpan);
      section.appendChild(row);
      this.statusElements[key] = valueSpan;
    }

    this.container.appendChild(section);
  }

  // ─── Info Panel ───────────────────────────────────────────────────

  private buildInfoPanel(): void {
    const section = document.createElement('div');
    section.className = 'info-panel';
    section.innerHTML = `
      <p>
        <strong style="color: rgba(255,255,255,0.6);">Flight & Camera Controls</strong><br>
        <kbd>Space</kbd> Start/Pause (or Climb in Manual)<br>
        <kbd>W</kbd><kbd>S</kbd> Pitch | <kbd>A</kbd><kbd>D</kbd> Roll | <kbd>Q</kbd><kbd>E</kbd> Yaw<br>
        <kbd>Shift</kbd> Descend | <kbd>M</kbd> Manual Toggle<br>
        <kbd>L</kbd> Scramble Drone | <kbd>C</kbd> Camera Mode<br>
        <kbd>R</kbd> Reset Scene | <kbd>Mouse</kbd> Orbit
      </p>
    `;
    this.container.appendChild(section);
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private createSection(title: string): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'panel-section';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    section.appendChild(h3);
    return section;
  }

  private createButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'ctrl-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // ─── Live Update ──────────────────────────────────────────────────

  update(): void {
    const { sim } = this;
    const m = sim.metrics;
    const d = sim.drone;
    const t = sim.target;
    const fb = sim.flyBrain.state;

    // Defense alert banner
    if (t.isEliminated) {
      this.alertBanner.className = 'alert-banner secure';
      this.alertBanner.innerHTML = `<span>🎯 THREAT ELIMINATED — BASE SECURED!</span>`;
      this.statusElements['defenseStatus'].textContent = 'THREAT ELIMINATED';
      this.statusElements['defenseStatus'].className = 'stat-value success';
    } else if (sim.breachAlert) {
      this.alertBanner.className = 'alert-banner breached';
      this.alertBanner.innerHTML = `<span>🚨 BREACH DETECTED — SCRAMBLE DRONE!</span>`;
      this.statusElements['defenseStatus'].textContent = 'BREACH DETECTED';
      this.statusElements['defenseStatus'].className = 'stat-value danger';
    } else {
      this.alertBanner.className = 'alert-banner secure';
      this.alertBanner.innerHTML = `<span>🛡️ PERIMETER SECURE</span>`;
      this.statusElements['defenseStatus'].textContent = 'SECURE';
      this.statusElements['defenseStatus'].className = 'stat-value success';
    }

    // Button states
    this.startBtn.classList.toggle('active', sim.state === 'running');
    this.pauseBtn.classList.toggle('active', sim.state === 'paused');
    this.manualBtn.classList.toggle('active', d.mode === 'manual');

    // Drone mode badge
    let modeClass: string = d.mode;
    let modeLabel = d.mode.toUpperCase();
    if (d.mode === 'parked') modeLabel = 'PARKED (HIDING)';
    if (d.mode === 'launching') modeLabel = 'SCRAMBLE TAKEOFF';
    if (d.mode === 'autonomous') {
      if (t.isEliminated) {
        modeClass = 'success';
        modeLabel = 'THREAT NEUTRALIZED (HOVER)';
      } else if (d.isAttacking) {
        modeClass = 'attack';
        modeLabel = 'ATTACK DIVE / PURSUIT';
      } else {
        modeLabel = 'FLY BRAIN TRACKING';
      }
    }
    this.statusElements['droneModeBadge'].innerHTML = `<span class="state-badge ${modeClass}">${modeLabel}</span>`;

    // Intruder phase badge
    const phase = t.getPhase().toUpperCase();
    let phaseClass = 'highlight';
    if (t.isEliminated) phaseClass = 'stopped';
    else if (t.getPhase() === 'evading') phaseClass = 'danger';
    else if (t.getPhase() === 'infiltrating') phaseClass = 'warn';
    this.statusElements['intruderPhase'].innerHTML = `<span class="state-badge ${phaseClass}">${phase}</span>`;

    // Stats
    this.statusElements['interceptions'].textContent = `${sim.interceptions}`;
    this.statusElements['interceptions'].className = `stat-value ${sim.interceptions > 0 ? 'success' : ''}`;

    this.statusElements['distance'].textContent = `${m.distanceToTarget.toFixed(1)} m`;
    this.statusElements['distance'].className = `stat-value ${m.distanceToTarget < 5 ? 'danger' : m.distanceToTarget < 20 ? 'warn' : 'highlight'}`;

    this.statusElements['droneAlt'].textContent = `${d.position.y.toFixed(1)} m`;
    this.statusElements['droneSpeed'].textContent = `${d.velocity.length().toFixed(1)} m/s`;

    this.statusElements['simTime'].textContent = formatTime(m.simulationTime);
    this.statusElements['fps'].textContent = `${m.fps}`;
    this.statusElements['fps'].className = `stat-value ${m.fps > 50 ? 'success' : m.fps > 30 ? '' : 'danger'}`;

    // Neural telemetry
    if (sim.remoteBrain.isConnected) {
      this.statusElements['backendEngine'].innerHTML = `<span class="state-badge running">PyTorch (Port 8000)</span>`;
    } else {
      this.statusElements['backendEngine'].innerHTML = `<span class="state-badge autonomous">Client SNN (Standalone)</span>`;
    }

    if (fb.targetLocked) {
      this.statusElements['neuralLock'].textContent = 'LOCKED (ACTIVE)';
      this.statusElements['neuralLock'].className = 'stat-value success';
    } else {
      this.statusElements['neuralLock'].textContent = 'SEARCHING...';
      this.statusElements['neuralLock'].className = 'stat-value warn';
    }

    this.statusElements['lc10Rate'].textContent = `${fb.firingRateLC10} Hz (${fb.v_lc10_left.toFixed(0)}mV)`;
    this.statusElements['lc4Rate'].textContent = `${fb.firingRateLC4} Hz (${fb.v_lc4_looming.toFixed(0)}mV)`;
    this.statusElements['lc4Rate'].className = `stat-value ${fb.firingRateLC4 > 5 ? 'danger' : 'highlight'}`;

    this.statusElements['optomotorVm'].textContent = `${fb.v_optomotor.toFixed(1)} mV`;
    this.statusElements['neuralSpikes'].textContent = `${fb.spikesThisStep} spikes/step`;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}
