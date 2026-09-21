import * as THREE from 'three';

/**
 * Procedural Tileable Water Normal Ripple Texture
 * Multi-octave sinusoidal & trochoidal wave slope derivatives
 */
function createWaterNormalTexture(resolution = 512) {
  const canvas = document.createElement('canvas');
  canvas.width  = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');

  const imgData = ctx.createImageData(resolution, resolution);
  const data = imgData.data;

  for (let y = 0; y < resolution; y++) {
    for (let x = 0; x < resolution; x++) {
      const u = (x / resolution) * Math.PI * 8;
      const v = (y / resolution) * Math.PI * 8;

      // Multi-frequency wave slope derivatives
      const dx = Math.cos(u * 1.5 + v * 0.8) * 0.45 +
                 Math.cos(u * 3.2 - v * 2.1) * 0.28 +
                 Math.sin(u * 5.5 + v * 4.2) * 0.12;

      const dy = Math.sin(v * 1.5 + u * 0.8) * 0.45 +
                 Math.sin(v * 3.2 - u * 2.1) * 0.28 +
                 Math.cos(v * 5.5 + u * 4.2) * 0.12;

      const idx = (y * resolution + x) * 4;
      data[idx]     = Math.floor(128 + dx * 105);
      data[idx + 1] = Math.floor(128 + dy * 105);
      data[idx + 2] = 248;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(120, 120);
  return texture;
}

export class WaterSystem {
  constructor(scene, waterLevel = 1.2) {
    this.scene = scene;
    this.waterLevel = waterLevel;
    this.flowSpeed  = 0.04;

    this.normalTex = createWaterNormalTexture();

    const waterGeo = new THREE.PlaneGeometry(24000, 24000, 4, 4);
    waterGeo.rotateX(-Math.PI / 2);

    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,          // Deep vibrant azure alpine blue
      roughness: 0.05,          // Glassy specular
      metalness: 0.12,
      normalMap: this.normalTex,
      normalScale: new THREE.Vector2(0.35, 0.35),
      transparent: true,
      opacity: 0.88,
    });

    this.mesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.mesh.position.y = this.waterLevel;
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);

    this._flowTime = 0;
  }

  update(dt, carPosition) {
    if (!carPosition) return;

    // Follow car position seamlessly
    this.mesh.position.x = carPosition.x;
    this.mesh.position.z = carPosition.z;

    // Animate gentle water wave drift
    this._flowTime += dt * this.flowSpeed;
    this.normalTex.offset.x = (this._flowTime * 0.7) % 1;
    this.normalTex.offset.y = (this._flowTime * 0.5) % 1;
  }

  setWaterLevel(level) {
    this.waterLevel = level;
    this.mesh.position.y = level;
  }
}
