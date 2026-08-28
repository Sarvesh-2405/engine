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
    isNight:      0.0,
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
    isNight:      0.0,
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
    isNight:      0.0,
  },
  night: {
    skyTop:       0x01030d,  // Deep obsidian night
    skyMid:       0x030818,  // Twilight horizon blue
    skyBottom:    0x06112c,  // Distant horizon haze
    fogColor:     0x030818,
    fogDensity:   0.00065,
    sunOffset:    new THREE.Vector3(80, 180, 80),
    sunIntensity: 0.10,      // Moonlight only — trees stay dark & moody
    sunColor:     0x6080b0,  // Faint cool moonlight
    hemiSky:      0x050c1e,
    hemiGround:   0x010206,
    hemiIntensity: 0.08,     // Dim sky ambient
    exposure:     0.88,
    ambientColor: 0x050c1c,
    ambientIntensity: 0.04,  // Minimal ambient so landscape is dark
    isNight:      1.0,
  },
};

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;
    this._currentPreset = 'daylight';
    this._sunOffset = new THREE.Vector3();
    this.quality    = 'high';

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
    // Main sun / moon directional light
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.55);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.left   = -95;
    this.sunLight.shadow.camera.right  =  95;
    this.sunLight.shadow.camera.top    =  95;
    this.sunLight.shadow.camera.bottom = -95;
    this.sunLight.shadow.camera.near   = 0.5;
    this.sunLight.shadow.camera.far    = 400;
    this.sunLight.shadow.mapSize.width  = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.bias = -0.0003;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Hemisphere sky/ground
    this.hemiLight = new THREE.HemisphereLight(0x9ecae8, 0x4a8a38, 0.95);
    this.scene.add(this.hemiLight);

    // Soft ambient
    this.ambientLight = new THREE.AmbientLight(0x8ab5d8, 0.55);
    this.scene.add(this.ambientLight);
  }

  _initSkySphere() {
    this._skyUniforms = {
      topColor:    { value: new THREE.Color(0x4a90d0) },
      midColor:    { value: new THREE.Color(0x7ec8e3) },
      bottomColor: { value: new THREE.Color(0xc8e8f5) },
      sunDir:      { value: new THREE.Vector3(-0.3, 0.85, -0.3).normalize() },
      sunColor:    { value: new THREE.Color(1.0, 0.97, 0.88) },
      isNight:     { value: 0.0 },
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
        uniform float isNight;
        varying vec3 vWorldPosition;

        float hash21(vec2 p) {
          p = fract(p * vec2(234.34, 435.345));
          p += dot(p, p + 34.23);
          return fract(p.x * p.y);
        }

        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = dir.y; // -1..1

          // 3-stop gradient: bottom pale → mid clear → top deep
          float t1 = clamp(h / 0.18, 0.0, 1.0);
          float t2 = clamp((h - 0.18) / 0.55, 0.0, 1.0);

          t1 = t1 * t1 * (3.0 - 2.0 * t1);
          t2 = t2 * t2 * (3.0 - 2.0 * t2);

          vec3 sky = mix(bottomColor, midColor, t1);
          sky = mix(sky, topColor, t2);

          // Sun / Moon disc and halo
          float sunDot = max(dot(dir, sunDir), 0.0);
          float sunDisc = pow(sunDot, 380.0) * (isNight > 0.5 ? 2.5 : 5.0);
          float sunHalo = pow(sunDot, 12.0)  * (isNight > 0.5 ? 0.08 : 0.20);
          sky += sunColor * (sunDisc + sunHalo);

          // Horizontal haze band at horizon
          float hazeBand = exp(-abs(h) * 8.0) * (isNight > 0.5 ? 0.05 : 0.12);
          sky += bottomColor * hazeBand;

          // Twinkling stars in night sky
          if (isNight > 0.5 && dir.y > 0.06) {
            vec2 starUV = vec2(atan(dir.z, dir.x) * 45.0, dir.y * 80.0);
            vec2 cell   = floor(starUV);
            float rnd   = hash21(cell);
            if (rnd > 0.965) {
              vec2 fractUV = fract(starUV) - 0.5;
              float dist = length(fractUV);
              float starGlow = smoothstep(0.18, 0.0, dist) * ((rnd - 0.965) / 0.035);
              sky += vec3(0.85, 0.92, 1.0) * starGlow * smoothstep(0.06, 0.30, dir.y);
            }
          }

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
    this._skyUniforms.isNight.value = p.isNight;

    // Sun / Moon
    this.sunLight.color.setHex(p.sunColor);
    this.sunLight.intensity = p.sunIntensity;

    const sunDir = p.sunOffset.clone().normalize();
    this._skyUniforms.sunDir.value.copy(sunDir);
    this._skyUniforms.sunColor.value.setHex(p.sunColor);

    // Hemisphere
    this.hemiLight.color.setHex(p.hemiSky);
    this.hemiLight.groundColor.setHex(p.hemiGround);
    this.hemiLight.intensity = p.hemiIntensity;

    // Ambient
    this.ambientLight.color.setHex(p.ambientColor);
    this.ambientLight.intensity = p.ambientIntensity;

    // Exposure
    this.renderer.toneMappingExposure = p.exposure;

    // Apply distance fog matching current graphics quality
    this._updateFog();
  }

  setQuality(preset) {
    this.quality = preset;
    this._updateFog();
  }

  _updateFog() {
    const p = PRESETS[this._currentPreset] || PRESETS.daylight;
    let densityMult = 1.0;
    switch (this.quality) {
      case 'low':
        densityMult = 3.6;
        break;
      case 'medium':
        densityMult = 2.4;
        break;
      case 'high':
        densityMult = 1.8;
        break;
      case 'ultra':
      default:
        densityMult = 1.2;
        break;
    }
    this.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity * densityMult);
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

    // Sky sphere follows the car
    if (this.skyMesh) {
      this.skyMesh.position.copy(carPosition);
    }
  }
}
