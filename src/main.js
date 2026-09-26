import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';

import { FormulaCarMesh }    from './car/FormulaCarMesh.js';
import { VehicleController } from './car/VehicleController.js';
import { CameraManager }     from './camera/CameraManager.js';
import { RoadSpline }        from './world/RoadSpline.js';
import { RoadMeshBuilder }   from './world/RoadMeshBuilder.js';
import { TerrainManager }    from './world/TerrainManager.js';
import { VegetationManager } from './world/VegetationManager.js';
import { Atmosphere }        from './graphics/Atmosphere.js';
import { HUD }               from './ui/HUD.js';
import { DebugPanel }        from './ui/DebugPanel.js';

class GameApp {
  constructor() {
    this.container = document.getElementById('app');

    // ── Renderer ──────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'mediump',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));

    // Enable soft shadow mapping with optimized footprint
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Force canvas to fill the container absolutely
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.top      = '0';
    canvas.style.left     = '0';
    canvas.style.width    = '100%';
    canvas.style.height   = '100%';
    canvas.style.display  = 'block';
    this.container.insertBefore(canvas, this.container.firstChild);

    // ── Scene ─────────────────────────────────────────────
    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.35, 2200);

    // ── Atmosphere ────────────────────────────────────────
    this.atmosphere = new Atmosphere(this.scene, this.renderer);

    // ── Car ───────────────────────────────────────────────
    this.carMesh = new FormulaCarMesh();
    this.scene.add(this.carMesh.root);
    this.vehicleController = new VehicleController(this.carMesh);

    // ── Road ──────────────────────────────────────────────
    this.barrierMode = 'dynamic'; // 'dynamic' | 'none' | 'all'
    this.roadWidth   = 9.8;
    this.roadSpline  = new RoadSpline(123);
    this.roadGroup   = RoadMeshBuilder.buildMeshes(this.roadSpline, this.roadWidth, this.barrierMode);
    this.scene.add(this.roadGroup);
    this.vehicleController._roadSplineRef = this.roadSpline;

    // ── World ─────────────────────────────────────────────
    this.vegetationManager = new VegetationManager(this.scene, this.roadSpline);
    this.terrainManager    = new TerrainManager(this.scene, this.roadSpline, this.vegetationManager);
    this.vegetationManager.onTreesLoaded = () => {
      this.terrainManager.repopulateChunks();
    };

    // ── Camera ────────────────────────────────────────────
    this.cameraManager = new CameraManager(this.camera);
    this.cameraManager.onModeChange((name) => {
      if (this.hud) this.hud.setCameraModeLabel(name);
    });

    // ── Post-Processing Pipeline (UnrealBloomPass) ─────────
    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(this.renderPass);

    // Render bloom at half-resolution for 75% GPU fillrate savings
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(Math.round(window.innerWidth * 0.5), Math.round(window.innerHeight * 0.5)),
      0.40,  // strength
      0.55,  // radius
      0.82   // threshold
    );
    this.composer.addPass(this.bloomPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    // ── Headlights ────────────────────────────────────────
    this._headlightsOn = false;
    this._buildHeadlights();

    // ── Debug Panel (Tweakpane) ───────────────────────────
    this.debugPanel = new DebugPanel(this);

    // ── HUD ───────────────────────────────────────────────
    this.hud = new HUD({
      onEnvironmentChange: (name) => this._setEnvironment(name),
      onCameraChange:      (name) => this.cameraManager.setMode(name),
      onQualityChange:     (q)    => this._applyQuality(q),
      onResetCar:          ()     => this._respawn(),
      onAutodriveChange:   (on)   => this.vehicleController.setAutodrive(on),
      onHeadlightChange:   (on)   => this._setHeadlights(on),
      onBarrierChange:     (mode) => this._setBarrierMode(mode),
      onToggleDebugPanel:  ()     => this.debugPanel.toggle(),
    });

    // ── Environment cycling state ─────────────────────────
    this._envList = ['daylight', 'morning', 'sunset', 'night'];
    this._envIdx  = 0;

    // ── Input & Default State ─────────────────────────────
    this.keys = {};
    this._applyQuality('high');
    this._placeCarOnRoad(0.02);
    this._initInput();
    window.addEventListener('resize', () => this._onResize());

    // Reset lastTime on tab-focus to avoid giant dt spikes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.lastTime = performance.now();
    });

    // ── Render loop ───────────────────────────────────────
    this.lastTime = performance.now();
    this._animate  = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  // ── Headlights ────────────────────────────────────────────
  _buildHeadlights() {
    // Twin high-power Xenon high-beam SpotLights
    this.headlightL = new THREE.SpotLight(0xfff8ee, 0, 260, Math.PI / 4.2, 0.55, 1.0);
    this.headlightR = new THREE.SpotLight(0xfff8ee, 0, 260, Math.PI / 4.2, 0.55, 1.0);

    this.scene.add(this.headlightL, this.headlightL.target);
    this.scene.add(this.headlightR, this.headlightR.target);

    // Wide-angle forward road flood light (illuminates road lanes, lines, and kerbs brightly)
    this.roadFloodLight = new THREE.SpotLight(0xffffff, 0, 110, Math.PI / 2.8, 0.75, 1.1);
    this.scene.add(this.roadFloodLight, this.roadFloodLight.target);

    // Ambient fill so the car chassis, wheels, and road verges are clearly visible
    this.nightAmbient = new THREE.PointLight(0x4060b0, 0, 50, 1.4);
    this.scene.add(this.nightAmbient);

    // Glowing headlight bulb meshes on car nose
    const bulbGeo = new THREE.SphereGeometry(0.08, 12, 12);
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    this.bulbL = new THREE.Mesh(bulbGeo, this.bulbMat);
    this.bulbR = new THREE.Mesh(bulbGeo, this.bulbMat);
    this.bulbL.position.set(-0.65, 0.38, 2.7);
    this.bulbR.position.set(0.65, 0.38, 2.7);
    this.carMesh.root.add(this.bulbL, this.bulbR);
  }

  _setHeadlights(on) {
    this._headlightsOn = on;
    const beamIntensity = on ? 22.0 : 0;
    this.headlightL.intensity = beamIntensity;
    this.headlightR.intensity = beamIntensity;
    this.roadFloodLight.intensity = on ? 14.0 : 0;
    this.nightAmbient.intensity = on ? 2.5 : 0;
    this.bulbMat.opacity = on ? 0.95 : 0;
  }

  _updateHeadlightPositions() {
    if (!this._headlightsOn) return;
    const pos = this.vehicleController.position;
    const h   = this.vehicleController.headingAngle;
    const fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const rgt = new THREE.Vector3(Math.cos(h), 0, -Math.sin(h));

    // Left headlight (casts far ahead down the road)
    this.headlightL.position.copy(pos)
      .addScaledVector(rgt, -0.65)
      .addScaledVector(fwd, 2.8)
      .add(new THREE.Vector3(0, 0.42, 0));
    this.headlightL.target.position.copy(pos)
      .addScaledVector(fwd, 85)
      .add(new THREE.Vector3(0, -0.2, 0));
    this.headlightL.target.updateMatrixWorld();

    // Right headlight (casts far ahead down the road)
    this.headlightR.position.copy(pos)
      .addScaledVector(rgt, 0.65)
      .addScaledVector(fwd, 2.8)
      .add(new THREE.Vector3(0, 0.42, 0));
    this.headlightR.target.position.copy(pos)
      .addScaledVector(fwd, 85)
      .add(new THREE.Vector3(0, -0.2, 0));
    this.headlightR.target.updateMatrixWorld();

    // Wide road flood light (illuminates immediate asphalt and kerbs)
    this.roadFloodLight.position.copy(pos)
      .addScaledVector(fwd, 2.5)
      .add(new THREE.Vector3(0, 0.55, 0));
    this.roadFloodLight.target.position.copy(pos)
      .addScaledVector(fwd, 40)
      .add(new THREE.Vector3(0, -0.4, 0));
    this.roadFloodLight.target.updateMatrixWorld();

    // Night ambient follows car
    this.nightAmbient.position.copy(pos).add(new THREE.Vector3(0, 2.0, 0));
  }

  // ── Environment ───────────────────────────────────────────
  _setEnvironment(name) {
    this.atmosphere.setEnvironment(name);
    const isNight = name === 'night';
    this._setHeadlights(isNight);
    if (this.hud) {
      this.hud._setHeadlights(isNight);
      this.hud.setEnvironmentLabel(name);
    }
    const idx = this._envList.indexOf(name);
    if (idx >= 0) this._envIdx = idx;
  }

  // ── Barrier mode change ───────────────────────────────────
  _setBarrierMode(mode) {
    this.barrierMode = mode;
    this._rebuildRoadMesh();
  }

  // ── Respawn ───────────────────────────────────────────────
  _respawn() {
    this._placeCarOnRoad(0.02);
    this.vehicleController.velocity.set(0, 0, 0);
    this.vehicleController._smoothY = null; // reset smooth Y
  }

  // ── Place car on road ─────────────────────────────────────
  _placeCarOnRoad(t = 0.02) {
    const pt      = this.roadSpline.curve.getPointAt(t);
    const tangent = this.roadSpline.curve.getTangentAt(t).normalize();
    this.vehicleController.position.copy(pt);
    this.vehicleController.headingAngle = Math.atan2(tangent.x, tangent.z);
    const groundY = this.terrainManager.getElevationAt(pt.x, pt.z);
    const safeY   = isFinite(groundY) ? groundY : 0;
    this.vehicleController.position.y = safeY + 0.16;
    this.vehicleController._smoothY   = safeY + 0.16;
  }

  // ── Road rebuild ─────────────────────────────────────────
  _rebuildRoadMesh(width) {
    if (width !== undefined) this.roadWidth = width;
    this.scene.remove(this.roadGroup);
    this.roadGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
    });
    this.roadGroup = RoadMeshBuilder.buildMeshes(this.roadSpline, this.roadWidth, this.barrierMode);
    this.scene.add(this.roadGroup);
  }

  // ── Quality ───────────────────────────────────────────────
  _applyQuality(preset) {
    this.vegetationManager.setQuality(preset);
    this.atmosphere.setQuality(preset);

    switch (preset) {
      case 'ultra':
        this.terrainManager.chunkRadius = 3;
        this.renderer.shadowMap.enabled = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.30));
        break;
      case 'high':
        this.terrainManager.chunkRadius = 3;
        this.renderer.shadowMap.enabled = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
        break;
      case 'medium':
        this.terrainManager.chunkRadius = 3;
        this.renderer.shadowMap.enabled = false;
        this.renderer.setPixelRatio(1.0);
        break;
      case 'low':
        this.terrainManager.chunkRadius = 2;
        this.renderer.shadowMap.enabled = false;
        this.renderer.setPixelRatio(1.0);
        break;
    }
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
    }
    this.terrainManager.repopulateChunks();
    this.terrainManager.update(this.vehicleController.position, 0.016);
  }

  // ── Input ─────────────────────────────────────────────────
  _initInput() {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      this.keys[k] = true;

      // Camera cycle
      if (k === 'c') this.cameraManager.cycleMode();

      // Road barrier cycle
      if (k === 'b') this.hud.cycleBarrierMode();

      // Mute toggle: M
      if (k === 'm') this.hud.toggleMute();

      // Environment cycle: E = next, Q = prev
      if (k === 'e') {
        this._envIdx = (this._envIdx + 1) % this._envList.length;
        this._setEnvironment(this._envList[this._envIdx]);
      }
      if (k === 'q') {
        this._envIdx = (this._envIdx - 1 + this._envList.length) % this._envList.length;
        this._setEnvironment(this._envList[this._envIdx]);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.composer) {
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  // ── Main loop ──────────────────────────────────────────────
  _animate() {
    requestAnimationFrame(this._animate);

    const now = performance.now();
    const dt  = Math.min(Math.max((now - this.lastTime) / 1000, 0.001), 0.05);
    this.lastTime = now;

    // Inputs
    const forward   = !!(this.keys['w'] || this.keys['arrowup']);
    const backward  = !!(this.keys['s'] || this.keys['arrowdown']);
    const left      = !!(this.keys['a'] || this.keys['arrowleft']);
    const right     = !!(this.keys['d'] || this.keys['arrowright']);
    const handbrake = !!(this.keys[' ']);
    const boost     = !!(this.keys['shift']);

    this.vehicleController.setInputs(forward, backward, left, right, handbrake, boost);

    // Physics
    this.vehicleController.update(
      dt,
      (x, z) => this.terrainManager.getDrivingElevationAt(x, z),
      (x, z) => this.roadSpline.getRoadInfo(x, z)
    );

    // Extend road ahead
    if (this.roadSpline.extendIfNecessary(this.vehicleController.position)) {
      this._rebuildRoadMesh();
    }

    // Stream terrain chunks & water wave updates
    this.terrainManager.update(this.vehicleController.position, dt);
    this.vegetationManager.update(dt, this.vehicleController.position, this.atmosphere);

    // Sky / sun / cloud tracking
    this.atmosphere.update(this.vehicleController.position, dt);

    // Headlights
    this._updateHeadlightPositions();

    // Camera
    this.cameraManager.update(this.vehicleController, dt);

    // HUD
    this.hud.update(
      this.vehicleController.speedKmh,
      this.vehicleController.gear,
      this.vehicleController.rpm,
      this.vehicleController.isBoosting,
      this.vehicleController.distanceTravelled,
    );
    this.hud.setMinimapData(
      this.roadSpline.roadPoints,
      this.vehicleController.position,
    );

    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => new GameApp());
