import * as THREE from 'three';
import { fbm } from './RoadSpline.js';

const COLOR_VALLEY = new THREE.Color(0x2d6a3b); // Deep rich lush green
const COLOR_SLOPE  = new THREE.Color(0x608b41); // Warm golden-yellow green
const COLOR_ROCK   = new THREE.Color(0x7a7265); // Steep rocky grey-brown

export class TerrainManager {
  constructor(scene, roadSpline, vegetationManager, chunkSize = 90, segments = 22) {
    this.scene = scene;
    this.roadSpline = roadSpline;
    this.vegetationManager = vegetationManager;
    this.chunkSize = chunkSize;
    this.segments = segments;

    this.activeChunks = new Map();
    this.chunkRadius = 3; // 7x7 grid around car

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.04
    });
  }

  getElevationAt(x, z) {
    const raw = fbm(x * 0.018, z * 0.018, 5) * 12.0;
    if (this.roadSpline) {
      const info = this.roadSpline.getRoadInfo(x, z);
      if (isFinite(info.distance)) {
        const roadRadius = 5.5;
        const blendRadius = 20.0;

        if (info.distance <= roadRadius) {
          return info.height;
        } else if (info.distance < blendRadius) {
          const t = (info.distance - roadRadius) / (blendRadius - roadRadius);
          const smoothstepT = t * t * (3 - 2 * t);
          return THREE.MathUtils.lerp(info.height, raw, smoothstepT);
        }
      }
    }
    return raw;
  }

  update(carPosition) {
    const currentChunkX = Math.round(carPosition.x / this.chunkSize);
    const currentChunkZ = Math.round(carPosition.z / this.chunkSize);

    const neededKeys = new Set();

    for (let dx = -this.chunkRadius; dx <= this.chunkRadius; dx++) {
      for (let dz = -this.chunkRadius; dz <= this.chunkRadius; dz++) {
        const cx = currentChunkX + dx;
        const cz = currentChunkZ + dz;
        const key = `${cx},${cz}`;
        neededKeys.add(key);

        if (!this.activeChunks.has(key)) {
          const mesh = this._createChunk(cx, cz);
          this.activeChunks.set(key, mesh);
          this.scene.add(mesh);
        }
      }
    }

    for (const [key, mesh] of this.activeChunks.entries()) {
      if (!neededKeys.has(key)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.activeChunks.delete(key);
      }
    }
  }

  _createChunk(cx, cz) {
    const halfSize = this.chunkSize / 2;
    const step = this.chunkSize / this.segments;
    const originX = cx * this.chunkSize;
    const originZ = cz * this.chunkSize;

    const positions = [];
    const uvs = [];
    const colors = [];

    for (let j = 0; j <= this.segments; j++) {
      for (let i = 0; i <= this.segments; i++) {
        const localX = -halfSize + i * step;
        const localZ = -halfSize + j * step;
        const worldX = originX + localX;
        const worldZ = originZ + localZ;

        const height = this.getElevationAt(worldX, worldZ);
        positions.push(localX, height, localZ);
        uvs.push(i / this.segments, j / this.segments);

        // Calculate slope gradient
        const hR = this.getElevationAt(worldX + 1.2, worldZ);
        const hL = this.getElevationAt(worldX - 1.2, worldZ);
        const hF = this.getElevationAt(worldX, worldZ + 1.2);
        const hB = this.getElevationAt(worldX, worldZ - 1.2);
        const dx = (hR - hL) / 2.4;
        const dz = (hF - hB) / 2.4;
        const slope = Math.sqrt(dx * dx + dz * dz);

        const slopeT = THREE.MathUtils.clamp(slope / 0.55, 0, 1);
        const rockT  = THREE.MathUtils.clamp((slope - 0.55) / 0.45, 0, 1);

        const vertexColor = COLOR_VALLEY.clone().lerp(COLOR_SLOPE, slopeT).lerp(COLOR_ROCK, rockT);
        const heightShift = THREE.MathUtils.clamp(height / 16.0, 0, 0.3);
        vertexColor.addScalar(heightShift * 0.08);

        colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
      }
    }

    const indices = [];
    const rowVertices = this.segments + 1;
    for (let j = 0; j < this.segments; j++) {
      for (let i = 0; i < this.segments; i++) {
        const a = j * rowVertices + i;
        const b = a + 1;
        const c = a + rowVertices;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    mesh.position.set(originX, 0, originZ);
    mesh.receiveShadow = true;

    if (this.vegetationManager) {
      this.vegetationManager.populateChunk(mesh, cx, cz, this.chunkSize, (x, z) => this.getElevationAt(x, z));
    }

    return mesh;
  }
}
