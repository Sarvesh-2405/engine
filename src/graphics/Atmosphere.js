import * as THREE from 'three';

// ── Slow Roads–inspired environment presets ───────────────
const PRESETS = {
  daylight: {
    skyTop:       0x4a90d0,  // Slow Roads bright cornflower blue
    skyMid:       0x7ec8e3,  // Light horizon blue
    skyBottom:    0xc8e8f5,  // Near-horizon pale
    fogColor:     0xbaddf0,
    fogDensity:   0.00045,
    sunOffset:    new THREE.Vector3(-60, 180, -60),
    sunIntensity: 1.55,
    sunColor:     0xfff5e0,
    hemiSky:      0x9ecae8,
    hemiGround:   0x4a8a38,
    hemiIntensity: 0.95,
    exposure:     1.15,
    ambientColor: 0x8ab5d8,
    ambientIntensity: 0.55,
  },
  morning: {
    skyTop:       0x3a7ec8,
    skyMid:       0xf0c060,
    skyBottom:    0xf8e0a0,
    fogColor:     0xf0d898,
    fogDensity:   0.0006,
    sunOffset:    new THREE.Vector3(120, 55, -140),
    sunIntensity: 1.1,
    sunColor:     0xffe0a0,
    hemiSky:      0xf5d880,
    hemiGround:   0x3a6030,
    hemiIntensity: 0.60,
    exposure:     1.05,
    ambientColor: 0xd4b870,
    ambientIntensity: 0.45,
  },
  sunset: {
    skyTop:       0x1a1240,
    skyMid:       0xd05020,
    skyBottom:    0xf08030,
    fogColor:     0xd86820,
    fogDensity:   0.0009,
    sunOffset:    new THREE.Vector3(-220, 28, -90),
    sunIntensity: 1.9,
    sunColor:     0xff8844,
    hemiSky:      0xd06030,
    hemiGround:   0x3a1800,
    hemiIntensity: 0.55,
    exposure:     1.0,
    ambientColor: 0xd05830,
    ambientIntensity: 0.40,
  },
  night: {
    skyTop:       0x000312,
    skyMid:       0x081538,
    skyBottom:    0x14224c,
    fogColor:     0x0a1630,
    fogDensity:   0.00060,
    sunOffset:    new THREE.Vector3(80, 200, 80),
    sunIntensity: 0.70,
    sunColor:     0x90b0f0,  // Bright crisp moonlight
    hemiSky:      0x1c2e60,
    hemiGround:   0x0a1224,
    hemiIntensity: 0.50,
    exposure:     1.10,
    ambientColor: 0x1e2c58,
    ambientIntensity: 0.45,
  },
};

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;
    this._currentPreset = 'daylight';
    this._sunOffset = new THREE.Vector3();

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this._initLighting();
    this._initSkySphere();
    this.setEnvironment('daylight');
  }

  _initLighting() {
    // Main sun directional light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.55);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.left   = -140;
    this.sunLight.shadow.camera.right  =  140;
    this.sunLight.shadow.camera.top    =  140;
    this.sunLight.shadow.camera.bottom = -140;
    this.sunLight.shadow.camera.near   = 0.5;
    this.sunLight.shadow.camera.far    = 500;
    this.sunLight.shadow.mapSize.width  = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.0002;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Hemisphere sky/ground
    this.hemiLight = new THREE.HemisphereLight(0x9ecae8, 0x4a8a38, 0.95);
    this.scene.add(this.hemiLight);

    // Soft ambient — Slow Roads uses very bright ambient for the washed-out diffuse look
    this.ambientLight = new THREE.AmbientLight(0x8ab5d8, 0.55);
    this.scene.add(this.ambientLight);
  }

  _initSkySphere() {
    // 3-stop sky gradient: top (deep blue), mid (lighter blue), bottom (pale horizon)
    this._skyUniforms = {
      topColor:    { value: new THREE.Color(0x4a90d0) },
      midColor:    { value: new THREE.Color(0x7ec8e3) },
      bottomColor: { value: new THREE.Color(0xc8e8f5) },
      sunDir:      { value: new THREE.Vector3(-0.3, 0.85, -0.3).normalize() },
      sunColor:    { value: new THREE.Color(1.0, 0.97, 0.88) },
    };

    const skyMat = new THREE.ShaderMaterial({
      uniforms: this._skyUniforms,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        uniform vec3 sunColor;
        varying vec3 vWorldPosition;

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = dir.y; // -1..1

          // 3-stop gradient: bottom pale → mid clear → top deep
          float t1 = clamp(h / 0.18, 0.0, 1.0);      // horizon → mid
          float t2 = clamp((h - 0.18) / 0.55, 0.0, 1.0); // mid → top

          // Smooth curves for a natural sky gradient
          t1 = t1 * t1 * (3.0 - 2.0 * t1);
          t2 = t2 * t2 * (3.0 - 2.0 * t2);

          vec3 sky = mix(bottomColor, midColor, t1);
          sky = mix(sky, topColor, t2);

          // Subtle sun halo — soft and not too strong (Slow Roads style)
          float sunDot = max(dot(dir, sunDir), 0.0);
          float sunDisc = pow(sunDot, 380.0) * 5.0;    // tight disc
          float sunHalo = pow(sunDot, 12.0) * 0.20;    // wide soft corona
          sky += sunColor * (sunDisc + sunHalo);

          // Very slight horizontal haze band at horizon
          float hazeBand = exp(-abs(h) * 8.0) * 0.12;
          sky += bottomColor * hazeBand;

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const skyGeo  = new THREE.SphereGeometry(2000, 32, 20);
    this.skyMesh  = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -1000;
    this.scene.add(this.skyMesh);
  }

  setEnvironment(name) {
    const p = PRESETS[name] || PRESETS.daylight;
    this._currentPreset = name;
    this._sunOffset = p.sunOffset.clone();

    // Sky gradient
    this._skyUniforms.topColor.value.setHex(p.skyTop);
    this._skyUniforms.midColor.value.setHex(p.skyMid);
    this._skyUniforms.bottomColor.value.setHex(p.skyBottom);

    // Fog — use fog color matching sky horizon
    this.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);

    // Sun
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;

    // Update sky sun direction
    const sunDir = p.sunOffset.clone().normalize();
    this._skyUniforms.sunDir.value.copy(sunDir);
    this._skyUniforms.sunColor.value.setHex(p.sunColor);

    // Hemisphere
    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    // Ambient — key to Slow Roads' bright, washed-out look
    this.ambientLight.color.setHex(p.ambientColor);
    this.ambientLight.intensity = p.ambientIntensity;

    // Exposure
    this.renderer.toneMappingExposure = p.exposure;
  }

  update(carPosition) {
    if (!carPosition || !this.sunLight) return;

    // Sun tracks the car
    this.sunLight.position.set(
      carPosition.x + this._sunOffset.x,
      carPosition.y + this._sunOffset.y,
      carPosition.z + this._sunOffset.z,
    );
    this.sunLight.target.position.copy(carPosition);
    this.sunLight.target.updateMatrixWorld();

    // Sky sphere follows the car so the horizon is always centered
    if (this.skyMesh) {
      this.skyMesh.position.copy(carPosition);
    }
  }
}
