import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// ── Slow Roads–style tree palette ─────────────────────────
const MAT_CONIFER   = new THREE.MeshStandardMaterial({ color: 0x1f4d2a, flatShading: true, roughness: 0.9 });
const MAT_CONIFER2  = new THREE.MeshStandardMaterial({ color: 0x17401e, flatShading: true, roughness: 0.9 });
const MAT_BROADLEAF = new THREE.MeshStandardMaterial({ color: 0x3a7d44, flatShading: true, roughness: 0.85 });
const MAT_BROADLEAF2= new THREE.MeshStandardMaterial({ color: 0x4a9950, flatShading: true, roughness: 0.85 });
const MAT_TRUNK     = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95 });
const MAT_ROCK      = new THREE.MeshStandardMaterial({ color: 0x7a7468, flatShading: true, roughness: 0.92 });
const MAT_GRASS_TUFT= new THREE.MeshStandardMaterial({ color: 0x5aae48, flatShading: true, roughness: 0.9 });

export class VegetationManager {
  constructor(scene, roadSpline) {
    this.scene = scene;
    this.roadSpline = roadSpline;
    this.noise2D = createNoise2D(() => 99);

    // ── Conifer (pine/fir) — tall pointed crown ──────────
    this.coniferGeo1 = new THREE.ConeGeometry(1.0, 3.2, 7);   // main crown
    this.coniferGeo2 = new THREE.ConeGeometry(0.7, 2.2, 7);   // upper crown
    this.coniferGeo3 = new THREE.ConeGeometry(0.42, 1.4, 7);  // top crown

    // ── Broadleaf — rounded cluster canopy ───────────────
    this.broadLeafGeo1 = new THREE.SphereGeometry(1.3, 7, 6);
    this.broadLeafGeo2 = new THREE.SphereGeometry(1.0, 6, 5);

    // ── Trunk ─────────────────────────────────────────────
    this.trunkGeo = new THREE.CylinderGeometry(0.12, 0.20, 1.2, 5);

    // ── Rocks ─────────────────────────────────────────────
    this.rockGeo = new THREE.DodecahedronGeometry(0.9, 1);

    // ── Grass tufts ───────────────────────────────────────
    this.grassGeo = new THREE.ConeGeometry(0.25, 0.7, 4);
  }

  populateChunk(chunkMesh, cx, cz, chunkSize, getElevationFn) {
    const CONIFER_COUNT   = 55;
    const BROADLEAF_COUNT = 35;
    const ROCK_COUNT      = 12;
    const GRASS_COUNT     = 40;

    // Instanced meshes
    const iConifer1  = new THREE.InstancedMesh(this.coniferGeo1,   MAT_CONIFER,    CONIFER_COUNT);
    const iConifer2  = new THREE.InstancedMesh(this.coniferGeo2,   MAT_CONIFER2,   CONIFER_COUNT);
    const iConifer3  = new THREE.InstancedMesh(this.coniferGeo3,   MAT_CONIFER,    CONIFER_COUNT);
    const iTrunkC    = new THREE.InstancedMesh(this.trunkGeo,      MAT_TRUNK,      CONIFER_COUNT);

    const iBroad1    = new THREE.InstancedMesh(this.broadLeafGeo1, MAT_BROADLEAF,  BROADLEAF_COUNT);
    const iBroad2    = new THREE.InstancedMesh(this.broadLeafGeo2, MAT_BROADLEAF2, BROADLEAF_COUNT);
    const iTrunkB    = new THREE.InstancedMesh(this.trunkGeo,      MAT_TRUNK,      BROADLEAF_COUNT);

    const iRock      = new THREE.InstancedMesh(this.rockGeo,       MAT_ROCK,       ROCK_COUNT);
    const iGrass     = new THREE.InstancedMesh(this.grassGeo,      MAT_GRASS_TUFT, GRASS_COUNT);

    for (const m of [iConifer1, iConifer2, iConifer3, iBroad1, iBroad2]) {
      m.castShadow = true;
      m.receiveShadow = false;
    }
    iRock.castShadow = true;

    const dummy  = new THREE.Object3D();
    let   cCount = 0, bCount = 0, rCount = 0, gCount = 0;

    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    // ── Scatter samples ──────────────────────────────────
    for (let i = 0; i < 300 && (cCount < CONIFER_COUNT || bCount < BROADLEAF_COUNT || rCount < ROCK_COUNT || gCount < GRASS_COUNT); i++) {
      const lx = (this.noise2D(cx * 97  + i,      cz * 57  + i * 3) - 0.5) * chunkSize * 0.93;
      const lz = (this.noise2D(cz * 131 + i,      cx * 71  + i * 2) - 0.5) * chunkSize * 0.93;
      const wx = originX + lx;
      const wz = originZ + lz;

      // Keep trees away from the road
      if (this.roadSpline) {
        const info = this.roadSpline.getRoadInfo(wx, wz);
        if (info.distance < 14.0) continue;
      }

      const h    = getElevationFn(wx, wz);
      // Don't place things underwater
      if (h < 1.5) {
        // Maybe place a rock on the beach
        if (rCount < ROCK_COUNT && h > 0.8) {
          const rotY = this.noise2D(wx * 0.11, wz * 0.11) * Math.PI * 4;
          const s    = 0.4 + Math.abs(this.noise2D(wx * 0.2, wz * 0.2)) * 0.5;
          dummy.position.set(lx, h + 0.25 * s, lz);
          dummy.scale.set(s * 0.9, s * 0.55, s * 0.9);
          dummy.rotation.set(rotY * 0.3, rotY, 0);
          dummy.updateMatrix();
          iRock.setMatrixAt(rCount++, dummy.matrix);
        }
        continue;
      }

      const rotY    = this.noise2D(wx * 0.05, wz * 0.05) * Math.PI * 4;
      const s       = 0.7 + Math.abs(this.noise2D(wx * 0.08, wz * 0.08)) * 1.1;
      const typeVal = this.noise2D(wx * 0.25, wz * 0.25);
      const hillT   = THREE.MathUtils.clamp((h - 2.0) / 10.0, 0, 1); // prefer conifers on high ground

      const wantConifer = typeVal > -0.15 + hillT * 0.4;

      if (wantConifer && cCount < CONIFER_COUNT) {
        // 3-layer stacked pine/fir cone
        const th = h; // trunk base
        const ts = s;

        // Trunk
        dummy.position.set(lx, th + 0.6 * ts, lz);
        dummy.scale.set(ts * 0.8, ts, ts * 0.8);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        iTrunkC.setMatrixAt(cCount, dummy.matrix);

        // Lower crown (widest)
        dummy.position.set(lx, th + 1.6 * ts, lz);
        dummy.scale.set(ts, ts, ts);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        iConifer1.setMatrixAt(cCount, dummy.matrix);

        // Middle crown
        dummy.position.set(lx, th + 2.7 * ts, lz);
        dummy.scale.set(ts * 0.85, ts * 0.85, ts * 0.85);
        dummy.rotation.set(0, rotY + 0.3, 0);
        dummy.updateMatrix();
        iConifer2.setMatrixAt(cCount, dummy.matrix);

        // Top crown (spire)
        dummy.position.set(lx, th + 3.6 * ts, lz);
        dummy.scale.set(ts * 0.6, ts * 0.7, ts * 0.6);
        dummy.rotation.set(0, rotY + 0.6, 0);
        dummy.updateMatrix();
        iConifer3.setMatrixAt(cCount, dummy.matrix);

        cCount++;

      } else if (!wantConifer && bCount < BROADLEAF_COUNT) {
        // Broadleaf — round multi-ball canopy
        const ts = s * 0.9;

        dummy.position.set(lx, h + 0.6 * ts, lz);
        dummy.scale.set(ts * 0.8, ts, ts * 0.8);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        iTrunkB.setMatrixAt(bCount, dummy.matrix);

        dummy.position.set(lx, h + 1.6 * ts, lz);
        dummy.scale.set(ts, ts * 0.95, ts);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        iBroad1.setMatrixAt(bCount, dummy.matrix);

        dummy.position.set(lx + 0.4 * ts, h + 2.1 * ts, lz + 0.3 * ts);
        dummy.scale.set(ts * 0.75, ts * 0.75, ts * 0.75);
        dummy.rotation.set(0, rotY * 1.4, 0);
        dummy.updateMatrix();
        iBroad2.setMatrixAt(bCount, dummy.matrix);

        bCount++;

      } else if (rCount < ROCK_COUNT) {
        dummy.position.set(lx, h + 0.3 * s, lz);
        dummy.scale.set(s * 0.9, s * 0.6, s * 0.9);
        dummy.rotation.set(rotY * 0.2, rotY, 0);
        dummy.updateMatrix();
        iRock.setMatrixAt(rCount++, dummy.matrix);

      } else if (gCount < GRASS_COUNT) {
        dummy.position.set(lx, h + 0.3, lz);
        dummy.scale.set(s * 0.5, s * 0.7, s * 0.5);
        dummy.rotation.set(0, rotY * 3, 0);
        dummy.updateMatrix();
        iGrass.setMatrixAt(gCount++, dummy.matrix);
      }
    }

    // Set final counts
    iConifer1.count = cCount;  iConifer2.count = cCount;
    iConifer3.count = cCount;  iTrunkC.count   = cCount;
    iBroad1.count   = bCount;  iBroad2.count   = bCount;
    iTrunkB.count   = bCount;
    iRock.count     = rCount;
    iGrass.count    = gCount;

    // Attach all as children of terrain chunk mesh
    chunkMesh.add(iConifer1, iConifer2, iConifer3, iTrunkC);
    chunkMesh.add(iBroad1, iBroad2, iTrunkB);
    chunkMesh.add(iRock, iGrass);
  }
}
