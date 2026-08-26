import * as THREE from 'three';
import { FormulaCarMesh }    from './car/FormulaCarMesh.js';
import { VehicleController } from './car/VehicleController.js';
import { CameraManager }     from './camera/CameraManager.js';
import { RoadSpline }        from './world/RoadSpline.js';
import { RoadMeshBuilder }   from './world/RoadMeshBuilder.js';
import { TerrainManager }    from './world/TerrainManager.js';
import { VegetationManager } from './world/VegetationManager.js';
import { Atmosphere }        from './graphics/Atmosphere.js';
import { HUD }               from './ui/HUD.js';

class GameApp {
  constructor() {
    this.container = document.getElementById('app');

    // ── Renderer ──────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,   // prevents Z-fighting on road surfaces
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Enable soft shadow mapping by default
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
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 3000);

    // ── Atmosphere ────────────────────────────────────────
    this.atmosphere = new Atmosphere(this.scene, this.renderer);

    // ── Car ───────────────────────────────────────────────
    this.carMesh = new FormulaCarMesh();
    this.scene.add(this.carMesh.root);
    this.vehicleController = new VehicleController(this.carMesh);

    // ── Road ──────────────────────────────────────────────
    this.barrierMode = 'dynamic'; // 'dynamic' | 'none' | 'all'
    this.roadSpline = new RoadSpline(123);
    this.roadGroup  = RoadMeshBuilder.buildMeshes(this.roadSpline, 9.8, this.barrierMode);
    this.scene.add(this.roadGroup);
    this.vehicleController._roadSplineRef = this.roadSpline;

    // ── World ─────────────────────────────────────────────
    this.vegetationManager = new VegetationManager(this.scene, this.roadSpline);
    this.terrainManager    = new TerrainManager(this.scene, this.roadSpline, this.vegetationManager);

    // ── Camera ────────────────────────────────────────────
    this.cameraManager = new CameraManager(this.camera);
    this.cameraManager.onModeChange((name) => {
      if (this.hud) this.hud.setCameraModeLabel(name);
    });

    // ── Headlights ────────────────────────────────────────
    this._headlightsOn = false;
    this._buildHeadlights();

    // ── HUD ───────────────────────────────────────────────
    this.hud = new HUD({
      onEnvironmentChange: (name) => this._setEnvironment(name),
      onCameraChange:      (name) => this.cameraManager.setMode(name),
      onQualityChange:     (q)    => this._applyQuality(q),
      onResetCar:          ()     => this._respawn(),
      onAutodriveChange:   (on)   => this.vehicleController.setAutodrive(on),
      onHeadlightChange:   (on)   => this._setHeadlights(on),
      onBarrierChange:     (mode) => this._setBarrierMode(mode),
    });

    // ── Environment cycling state ─────────────────────────
    this._envList = ['daylight', 'morning', 'sunset', 'night'];
    this._envIdx  = 0;

    // ── Input ─────────────────────────────────────────────
    this.keys = {};
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

    this.headlightL.castShadow = true;
    this.headlightL.shadow.mapSize.width = 1024;
    this.headlightL.shadow.mapSize.height = 1024;
    this.headlightL.shadow.bias = -0.001;

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
    // Automatically enable ultra-bright headlights in night mode
    const isNight = name === 'night';
    this.hud._setHeadlights(isNight);
    this.hud.setEnvironmentLabel(name);
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
  _rebuildRoadMesh() {
    this.scene.remove(this.roadGroup);
    this.roadGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
    });
    this.roadGroup = RoadMeshBuilder.buildMeshes(this.roadSpline, 9.8, this.barrierMode);
    this.scene.add(this.roadGroup);
  }

  // ── Quality ───────────────────────────────────────────────
  _applyQuality(preset) {
    switch (preset) {
      case 'ultra':
        this.terrainManager.chunkRadius = 3;
        this.renderer.shadowMap.enabled = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        break;
      case 'high':
        this.terrainManager.chunkRadius = 2;
        this.renderer.shadowMap.enabled = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        break;
      case 'medium':
        this.terrainManager.chunkRadius = 2;
        this.renderer.shadowMap.enabled = false;
        this.renderer.setPixelRatio(1);
        break;
      case 'low':
        this.terrainManager.chunkRadius = 1;
        this.renderer.shadowMap.enabled = false;
        this.renderer.setPixelRatio(1);
        break;
    }
    this.terrainManager.update(this.vehicleController.position);
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
      (x, z) => this.terrainManager.getElevationAt(x, z),
      (x, z) => this.roadSpline.getRoadInfo(x, z)
    );

    // Extend road ahead
    if (this.roadSpline.extendIfNecessary(this.vehicleController.position)) {
      this._rebuildRoadMesh();
    }

    // Stream terrain chunks
    this.terrainManager.update(this.vehicleController.position);

    // Sky / sun tracking
    this.atmosphere.update(this.vehicleController.position);

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

    this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => new GameApp());
