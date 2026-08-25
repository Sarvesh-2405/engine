import * as THREE from 'three';

const PRESETS = {
  daylight: {
    topColor:     0x1e40af,
    bottomColor:  0x93c5fd,
    fogColor:     0x93c5fd,
    fogDensity:   0.0006,
    sunOffset:    new THREE.Vector3(-40, 160, -40),
    sunIntensity: 1.6,
    sunColor:     0xfff8e8,
    hemiSky:      0xcde3f7,
    hemiGround:   0x264723,
    hemiIntensity: 0.8,
    exposure:     1.1,
  },
  sunset: {
    topColor:     0x1e1b4b,
    bottomColor:  0xf97316,
    fogColor:     0xf97316,
    fogDensity:   0.001,
    sunOffset:    new THREE.Vector3(-200, 30, -80),
    sunIntensity: 1.8,
    sunColor:     0xff9d5c,
    hemiSky:      0xfb923c,
    hemiGround:   0x3d1c00,
    hemiIntensity: 0.6,
    exposure:     0.95,
  },
  night: {
    topColor:     0x000010,
    bottomColor:  0x0a0a2e,
    fogColor:     0x050510,
    fogDensity:   0.003,
    sunOffset:    new THREE.Vector3(60, 180, 60),
    sunIntensity: 0.25,
    sunColor:     0x8080ff,
    hemiSky:      0x101040,
    hemiGround:   0x040408,
    hemiIntensity: 0.15,
    exposure:     0.6,
  },
  morning: {
    topColor:     0x0ea5e9,
    bottomColor:  0xfde68a,
    fogColor:     0xfde68a,
    fogDensity:   0.0008,
    sunOffset:    new THREE.Vector3(100, 60, -120),
    sunIntensity: 1.2,
    sunColor:     0xfff0c0,
    hemiSky:      0xfde68a,
    hemiGround:   0x2d4a1a,
    hemiIntensity: 0.55,
    exposure:     1.0,
  }
};

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene    = scene;
    this.renderer = renderer;
    this._currentPreset = 'daylight';

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    if (THREE.SRGBColorSpace) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this._initLighting();
    this._initSkySphere();
    this.setEnvironment('daylight');
  }

  _initLighting() {
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.left   = -120;
    this.sunLight.shadow.camera.right  =  120;
    this.sunLight.shadow.camera.top    =  120;
    this.sunLight.shadow.camera.bottom = -120;
    this.sunLight.shadow.camera.near   = 0.5;
    this.sunLight.shadow.camera.far    = 450;
    this.sunLight.shadow.mapSize.width  = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.bias = -0.0003;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0xcde3f7, 0x264723, 0.75);
    this.scene.add(this.hemiLight);
  }

  _initSkySphere() {
    this._skyUniforms = {
      topColor:    { value: new THREE.Color(0x1e3a8a) },
      bottomColor: { value: new THREE.Color(0x93c5fd) },
      sunDir:      { value: new THREE.Vector3(-0.4, 0.7, -0.3).normalize() },
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
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        varying vec3 vWorldPosition;
        void main() {
          vec3 dir = normalize(vWorldPosition);
          float h = max(dir.y, 0.0);
          vec3 sky = mix(bottomColor, topColor, pow(h, 0.55));
          float sunDot = max(dot(dir, sunDir), 0.0);
          float sunGlow = pow(sunDot, 160.0) * 3.5 + pow(sunDot, 18.0) * 0.7;
          sky += vec3(1.0, 0.95, 0.75) * sunGlow;
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });

    const skyGeo = new THREE.SphereGeometry(1800, 32, 16);
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -1000;
    this.scene.add(this.skyMesh);
  }

  setEnvironment(name) {
    const preset = PRESETS[name] || PRESETS.daylight;
    this._currentPreset = name;
    this._sunOffset = preset.sunOffset.clone();

    // Sky colours
    this._skyUniforms.topColor.value.setHex(preset.topColor);
    this._skyUniforms.bottomColor.value.setHex(preset.bottomColor);

    // Fog
    this.scene.fog = new THREE.FogExp2(preset.fogColor, preset.fogDensity);

    // Sun
    this.sunLight.color.setHex(preset.sunColor);
    this.sunLight.intensity = preset.sunIntensity;

    // Hemisphere
    this.hemiLight.color.setHex(preset.hemiSky);
    this.hemiLight.groundColor.setHex(preset.hemiGround);
    this.hemiLight.intensity = preset.hemiIntensity;

    // Exposure
    this.renderer.toneMappingExposure = preset.exposure;

    // Update sun direction uniform
    const sunDir = preset.sunOffset.clone().normalize();
    this._skyUniforms.sunDir.value.copy(sunDir);
  }

  update(carPosition) {
    if (carPosition && this.sunLight) {
      this.sunLight.position.set(
        carPosition.x + this._sunOffset.x,
        carPosition.y + this._sunOffset.y,
        carPosition.z + this._sunOffset.z
      );
      this.sunLight.target.position.copy(carPosition);
      this.sunLight.target.updateMatrixWorld();
      if (this.skyMesh) {
        this.skyMesh.position.copy(carPosition);
      }
    }
  }
}
