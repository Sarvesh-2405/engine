export class HUD {
  constructor(options = {}) {
    this.container = document.getElementById('hud');

    this.onEnvironmentChange = options.onEnvironmentChange || (() => {});
    this.onCameraChange      = options.onCameraChange      || (() => {});
    this.onQualityChange     = options.onQualityChange     || (() => {});
    this.onResetCar          = options.onResetCar          || (() => {});
    this.onAutodriveChange   = options.onAutodriveChange   || (() => {});
    this.onHeadlightChange   = options.onHeadlightChange   || (() => {});
    this.onBarrierChange     = options.onBarrierChange     || (() => {});

    this._autodriveOn    = false;
    this._headlightsOn   = false;
    this._barrierMode    = 'dynamic'; // 'dynamic' | 'none' | 'all'
    this._barrierList    = ['dynamic', 'none', 'all'];
    this._envList        = ['daylight', 'morning', 'sunset', 'night'];
    this._envIdx         = 0;
    this._minimapCtx     = null;
    this._roadPoints     = [];
    this._carPos         = { x: 0, z: 0 };
    this._minimapBounds  = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };

    this.touchSteer = 0; this.touchAccel = 0; this.touchBrake = 0;

    this._render();
    this._setupEvents();
    this._initAudio();
  }

  // ── Minimap data ───────────────────────────────────────
  setMinimapData(roadPoints, carPos) {
    this._roadPoints = roadPoints;
    this._carPos     = carPos;
    if (roadPoints && roadPoints.length > 0) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of roadPoints) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
      this._minimapBounds = { minX, maxX, minZ, maxZ };
    }
  }

  // ── DOM build ──────────────────────────────────────────
  _render() {
    this.container.innerHTML = `
      <!-- TOP-RIGHT pills -->
      <div class="hud-topright">
        <button class="hud-pill" id="btnBarrier" title="Cycle Barriers (B)">🛡️ <span class="pill-text" id="barrierPillText">Barriers: Dynamic</span></button>
        <button class="hud-pill" id="btnAutodrive">🤖 <span class="pill-text">Autodrive</span></button>
        <button class="hud-pill" id="btnRespawn">🔄 <span class="pill-text">Respawn</span></button>
        <button class="hud-pill" id="btnSettings">⚙ <span class="pill-text">Settings</span></button>
      </div>

      <!-- TOP-LEFT gear + RPM bar -->
      <div class="hud-gear-bar">
        <div class="hud-gear-val" id="gearVal">G1</div>
        <div class="rpm-track"><div class="rpm-fill" id="rpmFill"></div></div>
        <div class="boost-track"><div class="boost-fill" id="boostFill"></div></div>
      </div>

      <!-- Minimap – bottom right, above speed readout -->
      <div class="minimap-wrap">
        <canvas class="minimap-canvas" id="minimapCanvas" width="120" height="120"></canvas>
        <div class="minimap-label">MAP</div>
      </div>

      <!-- BOTTOM BAR — Slow Roads style: dist | autodrive | speed -->
      <div class="hud-bottom-bar">
        <div class="hud-dist-block">
          <div class="hud-dist-value" id="distVal">0.0</div>
          <div class="hud-dist-label">KILOMETERS</div>
        </div>
        <div class="hud-autodrive-label" id="autodriveLabel">AUTODRIVE</div>
        <div class="hud-speed-block">
          <div class="hud-speed-value" id="speedVal">0</div>
          <div class="hud-speed-label">KILOMETERS PER HOUR</div>
        </div>
      </div>

      <!-- Settings backdrop -->
      <div class="settings-backdrop" id="settingsBackdrop"></div>

      <!-- Settings panel -->
      <div class="settings-panel" id="settingsPanel">
        <div class="settings-header">
          <span class="settings-title">Settings</span>
          <button class="settings-close" id="btnCloseSettings">✕</button>
        </div>

        <div class="settings-tabs">
          <button class="stab active" data-tab="style">Style & Road</button>
          <button class="stab" data-tab="camera">Camera</button>
          <button class="stab" data-tab="graphics">Graphics</button>
          <button class="stab" data-tab="controls">Controls</button>
        </div>

        <!-- STYLE tab -->
        <div class="stab-content active" id="tab-style">
          <p class="settings-label">Time of Day &nbsp;<small style="font-size:0.65em;font-weight:400;opacity:0.5;">(Q / E)</small></p>
          <div class="env-grid">
            <button class="env-tile active" data-env="daylight"><div class="env-preview env-day"></div>Daylight</button>
            <button class="env-tile"        data-env="morning"><div class="env-preview env-morning"></div>Morning</button>
            <button class="env-tile"        data-env="sunset"><div class="env-preview env-sunset"></div>Sunset</button>
            <button class="env-tile"        data-env="night"><div class="env-preview env-night"></div>Night</button>
          </div>

          <p class="settings-label" style="margin-top:1.1rem;">Roadside Barriers &nbsp;<small style="font-size:0.65em;font-weight:400;opacity:0.5;">(B)</small></p>
          <div class="barrier-seg" id="barrierSeg">
            <button class="bseg active" data-barrier="dynamic">Dynamic (Curves Only)</button>
            <button class="bseg"        data-barrier="none">None (Open Road)</button>
            <button class="bseg"        data-barrier="all">All (Everywhere)</button>
          </div>

          <p class="settings-label" style="margin-top:1.1rem;">Headlights &nbsp;<small style="font-size:0.65em;font-weight:400;opacity:0.5;">(H)</small></p>
          <div class="headlight-row" id="headlightRow">
            <span style="font-size:0.82rem;font-weight:600;opacity:0.85;">💡 Car Headlights</span>
            <div class="toggle-switch" id="headlightToggle"></div>
          </div>
        </div>

        <!-- CAMERA tab -->
        <div class="stab-content" id="tab-camera">
          <p class="settings-label">Camera Mode &nbsp;<small style="font-size:0.65em;font-weight:400;opacity:0.5;">(C)</small></p>
          <div class="cam-grid" style="grid-template-columns: repeat(4, 1fr);">
            <button class="cam-tile active" data-cam="chase">
              <div class="cam-icon">🎥</div><span>Chase</span><small>Follow behind</small>
            </button>
            <button class="cam-tile" data-cam="close">
              <div class="cam-icon">🏎️</div><span>Close</span><small>Low grounded</small>
            </button>
            <button class="cam-tile" data-cam="cockpit">
              <div class="cam-icon">🪖</div><span>Cockpit</span><small>Driver view</small>
            </button>
            <button class="cam-tile" data-cam="orbit">
              <div class="cam-icon">🛸</div><span>Orbit</span><small>Free orbit</small>
            </button>
          </div>
        </div>

        <!-- GRAPHICS tab -->
        <div class="stab-content" id="tab-graphics">
          <p class="settings-label">Quality Preset</p>
          <div class="quality-seg" id="qualitySeg">
            <button class="qseg active" data-q="ultra">Ultra</button>
            <button class="qseg" data-q="high">High</button>
            <button class="qseg" data-q="medium">Medium</button>
            <button class="qseg" data-q="low">Low</button>
          </div>
          <div class="quality-desc" id="qualityDesc">Ultra: 2K soft shadows, full vegetation, ACES HDR</div>
        </div>

        <!-- CONTROLS tab -->
        <div class="stab-content" id="tab-controls">
          <p class="settings-label">Keyboard Controls</p>
          <table class="ctrl-table">
            <tr><td><span class="kbd">W</span> / <span class="kbd">↑</span></td><td>Accelerate</td></tr>
            <tr><td><span class="kbd">S</span> / <span class="kbd">↓</span></td><td>Brake / Reverse</td></tr>
            <tr><td><span class="kbd">A</span> / <span class="kbd">←</span></td><td>Steer Left</td></tr>
            <tr><td><span class="kbd">D</span> / <span class="kbd">→</span></td><td>Steer Right</td></tr>
            <tr><td><span class="kbd">⇧ Shift</span></td><td>Nitro Boost</td></tr>
            <tr><td><span class="kbd">Space</span></td><td>Handbrake / Drift</td></tr>
            <tr><td><span class="kbd">B</span></td><td>Toggle Road Barriers (Dynamic / None / All)</td></tr>
            <tr><td><span class="kbd">C</span></td><td>Cycle Camera Mode</td></tr>
            <tr><td><span class="kbd">Q</span> / <span class="kbd">E</span></td><td>Prev / Next Time of Day</td></tr>
            <tr><td><span class="kbd">H</span></td><td>Toggle Headlights</td></tr>
            <tr><td><span class="kbd">R</span></td><td>Respawn Car</td></tr>
          </table>
        </div>
      </div>

      <!-- Mobile joystick -->
      <div class="virtual-joystick" id="vJoystick">
        <div class="joystick-knob" id="vKnob"></div>
      </div>
    `;

    // Element refs
    this.speedValEl       = document.getElementById('speedVal');
    this.gearValEl        = document.getElementById('gearVal');
    this.rpmFillEl        = document.getElementById('rpmFill');
    this.boostFillEl      = document.getElementById('boostFill');
    this.distValEl        = document.getElementById('distVal');
    this.autodriveLabelEl = document.getElementById('autodriveLabel');
    this.btnAutodriveEl   = document.getElementById('btnAutodrive');
    this.btnBarrierEl     = document.getElementById('btnBarrier');
    this.barrierPillText  = document.getElementById('barrierPillText');
    this.headlightToggle  = document.getElementById('headlightToggle');
    this.headlightRow     = document.getElementById('headlightRow');
    const canvas          = document.getElementById('minimapCanvas');
    if (canvas) this._minimapCtx = canvas.getContext('2d');
  }

  _setupEvents() {
    // Settings open/close
    document.getElementById('btnSettings').addEventListener('click', () => this._openSettings());
    document.getElementById('btnCloseSettings').addEventListener('click', () => this._closeSettings());
    document.getElementById('settingsBackdrop').addEventListener('click', () => this._closeSettings());

    // Respawn
    document.getElementById('btnRespawn').addEventListener('click', () => this.onResetCar());

    // Barrier pill button
    this.btnBarrierEl.addEventListener('click', () => this.cycleBarrierMode());

    // Autodrive
    this.btnAutodriveEl.addEventListener('click', () => {
      this._autodriveOn = !this._autodriveOn;
      this.btnAutodriveEl.classList.toggle('active', this._autodriveOn);
      this.autodriveLabelEl.classList.toggle('active', this._autodriveOn);
      this.onAutodriveChange(this._autodriveOn);
    });

    // Headlights
    this.headlightRow.addEventListener('click', () => this._toggleHeadlights());

    // Tabs
    document.querySelectorAll('.stab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.stab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      });
    });

    // Environment tiles
    document.querySelectorAll('.env-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        const env = tile.dataset.env;
        this._setEnvTile(env);
        this.onEnvironmentChange(env);
      });
    });

    // Barrier segment buttons
    document.querySelectorAll('.bseg').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setBarrierMode(btn.dataset.barrier);
      });
    });

    // Camera tiles
    document.querySelectorAll('.cam-tile').forEach(tile => {
      tile.addEventListener('click', () => {
        document.querySelectorAll('.cam-tile').forEach(t => t.classList.remove('active'));
        tile.classList.add('active');
        this.onCameraChange(tile.dataset.cam);
      });
    });

    // Quality segment
    const descs = {
      ultra:  'Ultra: 2K soft shadows, full vegetation, ACES HDR',
      high:   'High: 1K soft shadows, full vegetation',
      medium: 'Medium: Reduced shadows, reduced vegetation',
      low:    'Low: Minimal shadows, minimal vegetation',
    };
    document.querySelectorAll('.qseg').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qseg').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('qualityDesc').textContent = descs[btn.dataset.q] || '';
        this.onQualityChange(btn.dataset.q);
      });
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'r') this.onResetCar();
      if (k === 'h') this._toggleHeadlights();
      if (k === 'b') this.cycleBarrierMode();
    });

    // Touch joystick
    const vJoystick = document.getElementById('vJoystick');
    const vKnob     = document.getElementById('vKnob');
    let isTouching  = false;
    vJoystick.addEventListener('touchstart', () => { isTouching = true; }, { passive: true });
    vJoystick.addEventListener('touchmove', (e) => {
      if (!isTouching) return;
      const touch = e.touches[0];
      const rect  = vJoystick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      let dx = touch.clientX - cx, dy = touch.clientY - cy;
      const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 40);
      const ang  = Math.atan2(dy, dx);
      dx = Math.cos(ang) * dist; dy = Math.sin(ang) * dist;
      vKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touchSteer = -dx / 40;
      this.touchAccel = dy < 0 ? Math.abs(dy) / 40 : 0;
      this.touchBrake = dy > 0 ? Math.abs(dy) / 40 : 0;
    }, { passive: true });
    const resetJ = () => {
      isTouching = false;
      vKnob.style.transform = '';
      this.touchSteer = 0; this.touchAccel = 0; this.touchBrake = 0;
    };
    vJoystick.addEventListener('touchend',   resetJ, { passive: true });
    vJoystick.addEventListener('touchcancel', resetJ, { passive: true });
  }

  _openSettings()  {
    document.getElementById('settingsPanel').classList.add('open');
    document.getElementById('settingsBackdrop').classList.add('open');
  }
  _closeSettings() {
    document.getElementById('settingsPanel').classList.remove('open');
    document.getElementById('settingsBackdrop').classList.remove('open');
  }

  _toggleHeadlights() { this._setHeadlights(!this._headlightsOn); }

  _setHeadlights(on) {
    this._headlightsOn = on;
    this.headlightToggle.classList.toggle('on', on);
    this.headlightRow.classList.toggle('active', on);
    this.onHeadlightChange(on);
  }

  // ── Barrier Mode ───────────────────────────────────────
  setBarrierMode(mode) {
    this._barrierMode = mode;
    document.querySelectorAll('.bseg').forEach(b => {
      b.classList.toggle('active', b.dataset.barrier === mode);
    });
    const labels = { dynamic: 'Barriers: Dynamic', none: 'Barriers: None', all: 'Barriers: All' };
    if (this.barrierPillText) this.barrierPillText.textContent = labels[mode] || mode;
    this.btnBarrierEl.classList.toggle('active', mode !== 'none');
    this.onBarrierChange(mode);
  }

  cycleBarrierMode() {
    const idx = this._barrierList.indexOf(this._barrierMode);
    const nextMode = this._barrierList[(idx + 1) % this._barrierList.length];
    this.setBarrierMode(nextMode);
    return nextMode;
  }

  // ── Public sync methods ────────────────────────────────
  setCameraModeLabel(modeName) {
    document.querySelectorAll('.cam-tile').forEach(t => {
      t.classList.toggle('active', t.dataset.cam === modeName);
    });
  }

  setEnvironmentLabel(name) { this._setEnvTile(name); }

  _setEnvTile(name) {
    this._envIdx = this._envList.indexOf(name);
    document.querySelectorAll('.env-tile').forEach(t => {
      t.classList.toggle('active', t.dataset.env === name);
    });
    if (name === 'night' && !this._headlightsOn) this._setHeadlights(true);
    else if (name !== 'night' && this._headlightsOn) this._setHeadlights(false);
  }

  cycleEnv(dir) {
    this._envIdx = (this._envIdx + dir + this._envList.length) % this._envList.length;
    const env = this._envList[this._envIdx];
    this._setEnvTile(env);
    this.onEnvironmentChange(env);
    return env;
  }

  // ── Audio ──────────────────────────────────────────────
  _initAudio() {
    try {
      this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this._oscNode  = this._audioCtx.createOscillator();
      this._gainNode = this._audioCtx.createGain();
      this._oscNode.type = 'sawtooth';
      this._oscNode.frequency.value = 55;
      this._gainNode.gain.value     = 0;
      this._oscNode.connect(this._gainNode);
      this._gainNode.connect(this._audioCtx.destination);
      this._oscNode.start();
      this._audioReady = true;
      const resume = () => { if (this._audioCtx.state === 'suspended') this._audioCtx.resume(); };
      window.addEventListener('keydown', resume, { once: true });
      window.addEventListener('click',   resume, { once: true });
    } catch (e) { this._audioReady = false; }
  }

  _updateAudio(speedKmh, rpm) {
    if (!this._audioReady) return;
    const safeRpm   = isFinite(rpm)      ? rpm      : 0;
    const safeSpeed = isFinite(speedKmh) ? speedKmh : 0;
    const freq = 55 + (safeRpm / 14000) * 165;
    this._oscNode.frequency.setTargetAtTime(freq, this._audioCtx.currentTime, 0.06);
    const vol = safeSpeed > 5 ? Math.min(0.08, 0.01 + (safeSpeed / 800) * 0.07) : 0;
    this._gainNode.gain.setTargetAtTime(vol, this._audioCtx.currentTime, 0.12);
  }

  // ── Minimap ────────────────────────────────────────────
  _drawMinimap() {
    const ctx = this._minimapCtx;
    if (!ctx) return;
    const W = 120, H = 120, R = W / 2;

    ctx.clearRect(0, 0, W, H);

    // Background circle
    ctx.fillStyle = 'rgba(5,10,22,0.82)';
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.fill();

    const pts = this._roadPoints;
    if (!pts || pts.length < 2) return;

    const { minX, maxX, minZ, maxZ } = this._minimapBounds;
    const spanX = maxX - minX || 1, spanZ = maxZ - minZ || 1;
    const pad = 10;
    const toS = (x, z) => ({
      sx: pad + ((x - minX) / spanX) * (W - pad * 2),
      sy: pad + ((z - minZ) / spanZ) * (H - pad * 2),
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const p0 = toS(pts[0].x, pts[0].z);
    ctx.moveTo(p0.sx, p0.sy);
    for (let i = 1; i < pts.length; i++) {
      const p = toS(pts[i].x, pts[i].z);
      ctx.lineTo(p.sx, p.sy);
    }
    ctx.stroke();

    // Car dot
    const cs = toS(this._carPos.x || 0, this._carPos.z || 0);
    ctx.beginPath();
    ctx.arc(cs.sx, cs.sy, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#60a5fa';
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();

    // Clip to circle
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath(); ctx.arc(R, R, R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ── Main update — called every frame ──────────────────
  update(speedKmh, gear, rpm, isBoosting, distanceMetres) {
    const safeSpeed = isFinite(speedKmh)       ? speedKmh       : 0;
    const safeGear  = isFinite(gear)           ? gear           : 1;
    const safeRpm   = isFinite(rpm)            ? rpm            : 0;
    const safeDist  = isFinite(distanceMetres) ? distanceMetres : 0;

    // Slow Roads–style values: integer speed, 1-decimal km
    this.speedValEl.textContent = Math.round(safeSpeed);
    this.gearValEl.textContent  = `G${safeGear}`;
    this.distValEl.textContent  = (safeDist / 1000).toFixed(1);

    this.rpmFillEl.style.width   = `${Math.min(100, Math.round((safeRpm / 14000) * 100))}%`;
    this.boostFillEl.style.width = isBoosting ? '100%' : '0%';
    this.boostFillEl.classList.toggle('boosting', !!isBoosting);

    this._updateAudio(safeSpeed, safeRpm);
    this._drawMinimap();
  }
}
