import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export class VegetationManager {
  constructor(scene, roadSpline) {
    this.scene = scene;
    this.roadSpline = roadSpline;
    this.noise2D = createNoise2D(() => 99);
    
    // Shared geometries & materials
    this.pineGeo = new THREE.ConeGeometry(1, 3, 6);
    this.roundGeo = new THREE.SphereGeometry(1.2, 8, 8);
    this.trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1, 5);
    this.rockGeo = new THREE.DodecahedronGeometry(0.85, 1);

    this.foliageMat = new THREE.MeshStandardMaterial({ color: 0x2d5a3d, flatShading: true });
    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3323 });
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, flatShading: true, roughness: 0.9 });
  }

  // Populate fixed vegetation ONCE per chunk so there is ZERO blinking/flickering!
  populateChunk(chunkMesh, cx, cz, chunkSize, getElevationFn) {
    const treeCount = 20;
    const rockCount = 8;

    const pineFoliage = new THREE.InstancedMesh(this.pineGeo, this.foliageMat, treeCount);
    const pineTrunks = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, treeCount);
    const roundFoliage = new THREE.InstancedMesh(this.roundGeo, this.foliageMat, treeCount);
    const roundTrunks = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, treeCount);
    const rocks = new THREE.InstancedMesh(this.rockGeo, this.rockMat, rockCount);

    pineFoliage.castShadow = true;
    roundFoliage.castShadow = true;
    rocks.castShadow = true;

    const dummy = new THREE.Object3D();
    let pinePlaced = 0, roundPlaced = 0, rockPlaced = 0;

    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    // Use deterministic seed for this chunk
    for (let i = 0; i < 140; i++) {
      const lx = (this.noise2D(cx * 97 + i, cz * 57 + i * 3) - 0.5) * chunkSize * 0.92;
      const lz = (this.noise2D(cz * 131 + i, cx * 71 + i * 2) - 0.5) * chunkSize * 0.92;
      const wx = originX + lx;
      const wz = originZ + lz;

      // Distance check from road
      if (this.roadSpline) {
        const roadInfo = this.roadSpline.getRoadInfo(wx, wz);
        if (roadInfo.distance < 13.5) continue;
      }

      const h = getElevationFn(wx, wz);
      const rotY = this.noise2D(wx * 0.05, wz * 0.05) * Math.PI * 4;
      const s = 0.6 + Math.abs(this.noise2D(wx * 0.1, wz * 0.1)) * 0.9;
      const type = this.noise2D(wx * 0.3, wz * 0.3);

      if (type > 0.45 && pinePlaced < treeCount) {
        dummy.position.set(lx, h + 1.5 * s, lz);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        pineFoliage.setMatrixAt(pinePlaced, dummy.matrix);

        dummy.position.y = h + 0.5 * s;
        dummy.updateMatrix();
        pineTrunks.setMatrixAt(pinePlaced, dummy.matrix);
        pinePlaced++;

      } else if (type > 0.1 && roundPlaced < treeCount) {
        dummy.position.set(lx, h + 1.3 * s, lz);
        dummy.scale.set(s * 0.9, s * 1.1, s * 0.9);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        roundFoliage.setMatrixAt(roundPlaced, dummy.matrix);

        dummy.position.y = h + 0.5 * s;
        dummy.updateMatrix();
        roundTrunks.setMatrixAt(roundPlaced, dummy.matrix);
        roundPlaced++;

      } else if (rockPlaced < rockCount) {
        dummy.position.set(lx, h + 0.35 * s, lz);
        dummy.scale.set(s * 0.95, s * 0.65, s * 0.95);
        dummy.rotation.set(rotY, rotY * 1.4, 0);
        dummy.updateMatrix();
        rocks.setMatrixAt(rockPlaced, dummy.matrix);
        rockPlaced++;
      }
    }

    pineFoliage.count = pinePlaced;
    pineTrunks.count = pinePlaced;
    roundFoliage.count = roundPlaced;
    roundTrunks.count = roundPlaced;
    rocks.count = rockPlaced;

    chunkMesh.add(pineFoliage);
    chunkMesh.add(pineTrunks);
    chunkMesh.add(roundFoliage);
    chunkMesh.add(roundTrunks);
    chunkMesh.add(rocks);
  }
}
