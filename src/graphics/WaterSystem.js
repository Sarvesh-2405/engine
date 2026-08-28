import * as THREE from 'three';

/**
 * Procedural Tileable Water Normal Ripple Texture
 */
function createWaterNormalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width  = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const imgData = ctx.createImageData(512, 512);
  const data = imgData.data;

  // Multi-frequency sinusoidal wave normals
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const u = (x / 512) * Math.PI * 8;
      const v = (y / 512) * Math.PI * 8;

      // Wave slopes (derivatives)
      const dx = Math.cos(u * 1.5 + v * 0.8) * 0.45 + Math.cos(u * 3.0 - v * 2.0) * 0.25;
      const dy = Math.sin(v * 1.5 + u * 0.8) * 0.45 + Math.sin(v * 3.0 - u * 2.0) * 0.25;

      const idx = (y * 512 + x) * 4;
      data[idx]     = Math.floor(128 + dx * 110); // Normal X (Red)
      data[idx + 1] = Math.floor(128 + dy * 110); // Normal Y (Green)
      data[idx + 2] = 250;                        // Normal Z (Blue pointing up)
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(120, 120); // dense sparkling ripples across vast lake
  return texture;
}

export class WaterSystem {
  constructor(scene, waterLevel = 1.2) {
    this.scene = scene;
    this.waterLevel = waterLevel;

    this.normalTex = createWaterNormalTexture();

    const waterGeo = new THREE.PlaneGeometry(24000, 24000, 4, 4);
    waterGeo.rotateX(-Math.PI / 2);

    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,          // Deep vibrant azure alpine blue
      roughness: 0.05,          // Glassy mirror specular
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
    this._flowTime += dt * 0.04;
    this.normalTex.offset.x = (this._flowTime * 0.7) % 1;
    this.normalTex.offset.y = (this._flowTime * 0.5) % 1;
  }

  setWaterLevel(level) {
    this.waterLevel = level;
    this.mesh.position.y = level;
  }
}
