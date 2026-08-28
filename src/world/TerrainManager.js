import * as THREE from 'three';
import { fbm } from './RoadSpline.js';

import { WaterSystem } from '../graphics/WaterSystem.js';

// ── Slow Roads–style terrain palette ──────────────────────
const COLOR_WATER_DEEP  = new THREE.Color(0x3b82f6); // Blue water
const COLOR_BEACH       = new THREE.Color(0xd4b483); // Sandy shore
const COLOR_VALLEY      = new THREE.Color(0x4a9e3f); // Vibrant valley green
const COLOR_MID         = new THREE.Color(0x3d8c35); // Mid-slope green
const COLOR_SLOPE       = new THREE.Color(0x7ab648); // Light bright-slope green
const COLOR_HILL        = new THREE.Color(0x6b9e40); // Hilltop warm green
const COLOR_ROCK        = new THREE.Color(0x8a7d68); // Rocky steep grey-brown

// Water level — valleys below this are filled with water
const WATER_LEVEL = 1.2;

export class TerrainManager {
  constructor(scene, roadSpline, vegetationManager, chunkSize = 90, segments = 28) {
    this.scene = scene;
    this.roadSpline = roadSpline;
    this.vegetationManager = vegetationManager;
    this.chunkSize = chunkSize;
    this.segments = segments;

    this.activeChunks = new Map();
    this.chunkRadius = 3; // 7x7 grid around car

    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.0,
    });

    this.waterSystem = new WaterSystem(this.scene, WATER_LEVEL);
  }

  getElevationAt(x, z) {
    // Multi-octave terrain with gentle rolling hills
    const raw = fbm(x * 0.016, z * 0.016, 6) * 18.0 - 1.5;
    if (this.roadSpline) {
      const info = this.roadSpline.getRoadInfo(x, z);
      if (isFinite(info.distance)) {
        const roadRadius  = 5.2;
        const blendRadius = 20.0;

        if (info.distance <= roadRadius) {
          return info.height - 0.06;
        } else if (info.distance < blendRadius) {
          const t = (info.distance - roadRadius) / (blendRadius - roadRadius);
          const smoothT = t * t * (3 - 2 * t);
          return THREE.MathUtils.lerp(info.height - 0.06, raw, smoothT);
        }
      }
    }
    return raw;
  }

  update(carPosition, dt = 0.016) {
    // Update water waves and tracking
    if (this.waterSystem) {
      this.waterSystem.update(dt, carPosition);
    }

    const currentChunkX = Math.round(carPosition.x / this.chunkSize);
    const currentChunkZ = Math.round(carPosition.z / this.chunkSize);
    const neededKeys = new Set();
    const missingChunks = [];

    for (let dx = -this.chunkRadius; dx <= this.chunkRadius; dx++) {
      for (let dz = -this.chunkRadius; dz <= this.chunkRadius; dz++) {
        const cx = currentChunkX + dx;
        const cz = currentChunkZ + dz;
        const key = `${cx},${cz}`;
        neededKeys.add(key);

        if (!this.activeChunks.has(key)) {
          const distSq = dx * dx + dz * dz;
          missingChunks.push({ cx, cz, key, distSq });
        }
      }
    }

    // Sort missing chunks so the nearest chunk in front of car is built first
    if (missingChunks.length > 0) {
      missingChunks.sort((a, b) => a.distSq - b.distSq);
      // Stream up to 2 chunks per frame to keep forward road populated without frame hitches
      const chunksToBuild = Math.min(2, missingChunks.length);
      for (let i = 0; i < chunksToBuild; i++) {
        const { cx, cz, key } = missingChunks[i];
        const mesh = this._createChunk(cx, cz);
        this.activeChunks.set(key, mesh);
        this.scene.add(mesh);
      }
    }

    // Smoothly ease in new chunks so terrain & trees glide in without popping
    for (const [key, mesh] of this.activeChunks.entries()) {
      if (mesh._spawnT !== undefined && mesh._spawnT < 1.0) {
        mesh._spawnT = Math.min(1.0, mesh._spawnT + (dt || 0.016) * 4.5);
        const t = mesh._spawnT;
        const ease = t * t * (3.0 - 2.0 * t); // cubic smoothstep
        mesh.position.y = (1.0 - ease) * -8.0;
        mesh.scale.set(1.0, 0.5 + ease * 0.5, 1.0);
      }

      if (!neededKeys.has(key)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.activeChunks.delete(key);
      }
    }
  }

  repopulateChunks() {
    for (const [key, mesh] of this.activeChunks.entries()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.activeChunks.clear();
  }

  _createChunk(cx, cz) {
    const halfSize = this.chunkSize / 2;
    const step     = this.chunkSize / this.segments;
    const originX  = cx * this.chunkSize;
    const originZ  = cz * this.chunkSize;

    const positions = [];
    const uvs       = [];
    const colors    = [];

    for (let j = 0; j <= this.segments; j++) {
      for (let i = 0; i <= this.segments; i++) {
        const localX = -halfSize + i * step;
        const localZ = -halfSize + j * step;
        const worldX = originX + localX;
        const worldZ = originZ + localZ;

        const height = this.getElevationAt(worldX, worldZ);

        // Clamp position at water level so terrain doesn't dip below water
        const posY = Math.max(height, WATER_LEVEL - 0.05);
        positions.push(localX, posY, localZ);
        uvs.push(i / this.segments, j / this.segments);

        // ── Vertex color based on elevation & slope ──────
        const hR = this.getElevationAt(worldX + 1.5, worldZ);
        const hL = this.getElevationAt(worldX - 1.5, worldZ);
        const hF = this.getElevationAt(worldX, worldZ + 1.5);
        const hB = this.getElevationAt(worldX, worldZ - 1.5);
        const dxSlope = (hR - hL) / 3.0;
        const dzSlope = (hF - hB) / 3.0;
        const slope = Math.sqrt(dxSlope * dxSlope + dzSlope * dzSlope);

        let vertexColor;

        if (height < WATER_LEVEL + 0.05) {
          // Under water — use beach/sand color near shore
          vertexColor = COLOR_BEACH.clone();
        } else if (height < WATER_LEVEL + 0.8) {
          // Sandy beach transition
          const t = (height - WATER_LEVEL) / 0.8;
          vertexColor = COLOR_BEACH.clone().lerp(COLOR_VALLEY, t * t);
        } else {
          // Normal terrain — slope-based color
          const heightT  = THREE.MathUtils.clamp((height - WATER_LEVEL) / 14.0, 0, 1);
          const slopeT   = THREE.MathUtils.clamp(slope / 0.5, 0, 1);
          const rockT    = THREE.MathUtils.clamp((slope - 0.5) / 0.4, 0, 1);

          // Base: blend valley → mid → slope greens by slope gradient
          let base = COLOR_VALLEY.clone().lerp(COLOR_MID, heightT * 0.6).lerp(COLOR_SLOPE, slopeT * 0.5);

          // High hilltops — warm slightly yellower green
          if (heightT > 0.6) {
            base.lerp(COLOR_HILL, (heightT - 0.6) / 0.4 * 0.4);
          }

          // Steep rocky faces
          base.lerp(COLOR_ROCK, rockT * 0.85);

          // Subtle brightness variation using FBM for micro-detail
          const detail = fbm(worldX * 0.04, worldZ * 0.04, 2) * 0.08 - 0.04;
          base.r = THREE.MathUtils.clamp(base.r + detail, 0, 1);
          base.g = THREE.MathUtils.clamp(base.g + detail, 0, 1);
          base.b = THREE.MathUtils.clamp(base.b + detail * 0.5, 0, 1);

          vertexColor = base;
        }

        colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
      }
    }

    const indices = [];
    const rowVerts = this.segments + 1;
    for (let j = 0; j < this.segments; j++) {
      for (let i = 0; i < this.segments; i++) {
        const a = j * rowVerts + i;
        const b = a + 1;
        const c = a + rowVerts;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.terrainMaterial);
    mesh._spawnT = 0.0;
    mesh.position.set(originX, -8.0, originZ);
    mesh.scale.set(1.0, 0.5, 1.0);
    mesh.receiveShadow = true;

    if (this.vegetationManager) {
      this.vegetationManager.populateChunk(mesh, cx, cz, this.chunkSize, (x, z) => this.getElevationAt(x, z));
    }

    return mesh;
  }
}
