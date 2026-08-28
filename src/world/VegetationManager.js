import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import {
  TreeBuilder,
  MAT_TRUNK,
  MAT_PINE_TIER1,
  MAT_PINE_TIER2,
  MAT_PINE_TIER3,
  MAT_PINE_TIER4,
  MAT_OAK_MAIN,
  MAT_OAK_CLUSTER,
  MAT_OAK_TOP,
  MAT_AUTUMN_MAIN,
  MAT_AUTUMN_CLUSTER,
  MAT_AUTUMN_TOP,
} from './vegetation/TreeBuilder.js';
import {
  RockBuilder,
  MAT_GRANITE,
  MAT_SANDSTONE,
  MAT_MOSSY_ROCK,
  MAT_PEBBLE,
} from './vegetation/RockBuilder.js';

export class VegetationManager {
  constructor(scene, roadSpline) {
    this.scene = scene;
    this.roadSpline = roadSpline;
    this.noise2D = createNoise2D(() => 99);

    this.treeBuilder = new TreeBuilder();
    this.rockBuilder = new RockBuilder();
    this.quality     = 'high'; // default quality
  }

  setQuality(preset) {
    this.quality = preset;
  }

  getCounts() {
    switch (this.quality) {
      case 'ultra':
        return { pine: 48, oak: 24, aut: 16, bld: 3, moss: 3, slab: 2, peb: 3, maxSamples: 320 };
      case 'high':
        return { pine: 30, oak: 15, aut: 10, bld: 2, moss: 2, slab: 2, peb: 2, maxSamples: 240 };
      case 'medium':
        return { pine: 18, oak: 9,  aut: 6,  bld: 2, moss: 1, slab: 1, peb: 1, maxSamples: 160 };
      case 'low':
      default:
        return { pine: 9,  oak: 5,  aut: 3,  bld: 1, moss: 1, slab: 1, peb: 1, maxSamples: 100 };
    }
  }

  update(dt) {
    // Reserved for seasonal / weather updates
  }

  populateChunk(chunkMesh, cx, cz, chunkSize, getElevationFn) {
    const counts = this.getCounts();

    const PINE_COUNT       = counts.pine;
    const OAK_COUNT        = counts.oak;
    const AUTUMN_COUNT     = counts.aut;
    const BOULDER_COUNT    = counts.bld;
    const MOSSY_ROCK_COUNT = counts.moss;
    const SLAB_COUNT       = counts.slab;
    const PEBBLE_COUNT     = counts.peb;

    // ── Pine Instanced Meshes ─────────────────────────────────
    const iPineTrunk = new THREE.InstancedMesh(this.treeBuilder.pineTrunkGeo, MAT_TRUNK,      PINE_COUNT);
    const iPine1     = new THREE.InstancedMesh(this.treeBuilder.pineTier1,    MAT_PINE_TIER1, PINE_COUNT);
    const iPine2     = new THREE.InstancedMesh(this.treeBuilder.pineTier2,    MAT_PINE_TIER2, PINE_COUNT);
    const iPine3     = new THREE.InstancedMesh(this.treeBuilder.pineTier3,    MAT_PINE_TIER3, PINE_COUNT);
    const iPine4     = new THREE.InstancedMesh(this.treeBuilder.pineTier4,    MAT_PINE_TIER4, PINE_COUNT);

    // ── Oak (Summer Green) Instanced Meshes ───────────────────
    const iOakTrunk    = new THREE.InstancedMesh(this.treeBuilder.oakTrunkGeo,        MAT_TRUNK,        OAK_COUNT);
    const iOakMain     = new THREE.InstancedMesh(this.treeBuilder.oakCanopyMain,    MAT_OAK_MAIN,     OAK_COUNT);
    const iOakCluster1 = new THREE.InstancedMesh(this.treeBuilder.oakCanopyCluster, MAT_OAK_CLUSTER,  OAK_COUNT);
    const iOakCluster2 = new THREE.InstancedMesh(this.treeBuilder.oakCanopyCluster, MAT_OAK_CLUSTER,  OAK_COUNT);
    const iOakTop      = new THREE.InstancedMesh(this.treeBuilder.oakCanopyTop,     MAT_OAK_TOP,      OAK_COUNT);

    // ── Autumn (Golden Orange) Instanced Meshes ───────────────
    const iAutTrunk    = new THREE.InstancedMesh(this.treeBuilder.oakTrunkGeo,        MAT_TRUNK,           AUTUMN_COUNT);
    const iAutMain     = new THREE.InstancedMesh(this.treeBuilder.oakCanopyMain,    MAT_AUTUMN_MAIN,    AUTUMN_COUNT);
    const iAutCluster1 = new THREE.InstancedMesh(this.treeBuilder.oakCanopyCluster, MAT_AUTUMN_CLUSTER, AUTUMN_COUNT);
    const iAutCluster2 = new THREE.InstancedMesh(this.treeBuilder.oakCanopyCluster, MAT_AUTUMN_CLUSTER, AUTUMN_COUNT);
    const iAutTop      = new THREE.InstancedMesh(this.treeBuilder.oakCanopyTop,     MAT_AUTUMN_TOP,     AUTUMN_COUNT);

    // ── Geological Rocks (Sparse) ─────────────────────────────
    const iBoulderLarge = new THREE.InstancedMesh(this.rockBuilder.boulderLargeGeo,  MAT_GRANITE,    BOULDER_COUNT);
    const iBoulderMoss  = new THREE.InstancedMesh(this.rockBuilder.boulderMediumGeo, MAT_MOSSY_ROCK, MOSSY_ROCK_COUNT);
    const iRockSlab     = new THREE.InstancedMesh(this.rockBuilder.rockSlabGeo,      MAT_SANDSTONE,  SLAB_COUNT);
    const iPebble       = new THREE.InstancedMesh(this.rockBuilder.pebbleGeo,        MAT_PEBBLE,     PEBBLE_COUNT);

    // GPU Optimization: Cast shadows only, do not receive shadows on plant instances
    const allMeshes = [
      iPineTrunk, iPine1, iPine2, iPine3, iPine4,
      iOakTrunk, iOakMain, iOakCluster1, iOakCluster2, iOakTop,
      iAutTrunk, iAutMain, iAutCluster1, iAutCluster2, iAutTop,
      iBoulderLarge, iBoulderMoss, iRockSlab, iPebble
    ];
    for (const m of allMeshes) {
      m.castShadow = true;
      m.receiveShadow = false;
    }

    const dummy = new THREE.Object3D();
    let pCount = 0, oCount = 0, aCount = 0;
    let bldCount = 0, mossCount = 0, slabCount = 0, pebCount = 0;

    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    // ── Scatter samples ───────────────────────────────────────
    for (let i = 0; i < counts.maxSamples; i++) {
      if (
        pCount >= PINE_COUNT && oCount >= OAK_COUNT && aCount >= AUTUMN_COUNT &&
        bldCount >= BOULDER_COUNT && mossCount >= MOSSY_ROCK_COUNT &&
        slabCount >= SLAB_COUNT && pebCount >= PEBBLE_COUNT
      ) {
        break;
      }

      const lx = (this.noise2D(cx * 97  + i,      cz * 57  + i * 3) - 0.5) * chunkSize * 0.94;
      const lz = (this.noise2D(cz * 131 + i,      cx * 71  + i * 2) - 0.5) * chunkSize * 0.94;
      const wx = originX + lx;
      const wz = originZ + lz;

      let roadDist = 999;
      if (this.roadSpline) {
        const info = this.roadSpline.getRoadInfo(wx, wz);
        roadDist = info.distance;
      }

      const h = getElevationFn(wx, wz);

      // ── Beach / Shoreline Scatter ───────────────────────────
      if (h < 1.6) {
        if (h > 0.85 && pebCount < PEBBLE_COUNT) {
          const rotY = this.noise2D(wx * 0.2, wz * 0.2) * Math.PI * 4;
          const s    = 0.4 + Math.abs(this.noise2D(wx * 0.4, wz * 0.4)) * 0.5;
          dummy.position.set(lx, h + 0.12 * s, lz);
          dummy.scale.set(s * 1.1, s * 0.6, s * 1.0);
          dummy.rotation.set(rotY * 0.2, rotY, rotY * 0.1);
          dummy.updateMatrix();
          iPebble.setMatrixAt(pebCount++, dummy.matrix);
        }
        continue;
      }

      // Keep trees comfortably away from the road
      if (roadDist < 14.0) continue;

      const rotY    = this.noise2D(wx * 0.05, wz * 0.05) * Math.PI * 4;
      const s       = 0.75 + Math.abs(this.noise2D(wx * 0.08, wz * 0.08)) * 1.0;
      const typeVal = this.noise2D(wx * 0.25, wz * 0.25);
      const hillT   = THREE.MathUtils.clamp((h - 2.0) / 10.0, 0, 1);

      // ── Sparse Geological Rocks on High Peaks ───────────────
      const isRockZone = (hillT > 0.82 && Math.abs(typeVal) > 0.58);

      if (isRockZone && bldCount < BOULDER_COUNT) {
        dummy.position.set(lx, h + 0.5 * s, lz);
        dummy.scale.set(s * 1.1, s * 0.9, s * 1.1);
        dummy.rotation.set(rotY * 0.15, rotY, rotY * 0.1);
        dummy.updateMatrix();
        iBoulderLarge.setMatrixAt(bldCount++, dummy.matrix);
        continue;
      } else if (isRockZone && mossCount < MOSSY_ROCK_COUNT) {
        dummy.position.set(lx, h + 0.35 * s, lz);
        dummy.scale.set(s * 0.95, s * 0.75, s * 0.95);
        dummy.rotation.set(rotY * 0.2, rotY, -rotY * 0.15);
        dummy.updateMatrix();
        iBoulderMoss.setMatrixAt(mossCount++, dummy.matrix);
        continue;
      } else if (isRockZone && slabCount < SLAB_COUNT) {
        dummy.position.set(lx, h + 0.25 * s, lz);
        dummy.scale.set(s * 1.2, s * 0.7, s * 1.2);
        dummy.rotation.set(0.12, rotY, 0.08);
        dummy.updateMatrix();
        iRockSlab.setMatrixAt(slabCount++, dummy.matrix);
        continue;
      }

      // ── Tree Placement ──────────────────────────────────────
      const wantConifer = typeVal > -0.15 + hillT * 0.35;

      if (wantConifer && pCount < PINE_COUNT) {
        // Pine Tree (Trunk + 4 Foliage Tiers)
        dummy.position.set(lx, h, lz);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        iPineTrunk.setMatrixAt(pCount, dummy.matrix);

        dummy.position.set(lx, h + 1.2 * s, lz);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        iPine1.setMatrixAt(pCount, dummy.matrix);

        dummy.position.set(lx, h + 2.4 * s, lz);
        dummy.scale.set(s * 0.95, s * 0.95, s * 0.95);
        dummy.rotation.set(0, rotY + 0.5, 0);
        dummy.updateMatrix();
        iPine2.setMatrixAt(pCount, dummy.matrix);

        dummy.position.set(lx, h + 3.5 * s, lz);
        dummy.scale.set(s * 0.90, s * 0.90, s * 0.90);
        dummy.rotation.set(0, rotY + 1.0, 0);
        dummy.updateMatrix();
        iPine3.setMatrixAt(pCount, dummy.matrix);

        dummy.position.set(lx, h + 4.5 * s, lz);
        dummy.scale.set(s * 0.85, s * 0.85, s * 0.85);
        dummy.rotation.set(0, rotY + 1.5, 0);
        dummy.updateMatrix();
        iPine4.setMatrixAt(pCount, dummy.matrix);

        pCount++;

      } else if (!wantConifer) {
        const isAutumn = this.noise2D(wx * 0.35, wz * 0.35) > 0.15;

        if (!isAutumn && oCount < OAK_COUNT) {
          // Summer Oak Tree
          dummy.position.set(lx, h, lz);
          dummy.scale.set(s, s, s);
          dummy.rotation.set(0, rotY, 0);
          dummy.updateMatrix();
          iOakTrunk.setMatrixAt(oCount, dummy.matrix);

          dummy.position.set(lx, h + 2.8 * s, lz);
          dummy.scale.set(s, s * 0.95, s);
          dummy.rotation.set(0, rotY, 0);
          dummy.updateMatrix();
          iOakMain.setMatrixAt(oCount, dummy.matrix);

          dummy.position.set(lx - 0.7 * s, h + 3.2 * s, lz + 0.5 * s);
          dummy.scale.set(s * 0.9, s * 0.9, s * 0.9);
          dummy.rotation.set(0, rotY * 1.5, 0);
          dummy.updateMatrix();
          iOakCluster1.setMatrixAt(oCount, dummy.matrix);

          dummy.position.set(lx + 0.8 * s, h + 3.3 * s, lz - 0.4 * s);
          dummy.scale.set(s * 0.85, s * 0.85, s * 0.85);
          dummy.rotation.set(0, rotY * 2.2, 0);
          dummy.updateMatrix();
          iOakCluster2.setMatrixAt(oCount, dummy.matrix);

          dummy.position.set(lx + 0.1 * s, h + 4.1 * s, lz + 0.1 * s);
          dummy.scale.set(s * 0.8, s * 0.8, s * 0.8);
          dummy.rotation.set(0, rotY * 0.7, 0);
          dummy.updateMatrix();
          iOakTop.setMatrixAt(oCount, dummy.matrix);

          oCount++;

        } else if (aCount < AUTUMN_COUNT) {
          // Autumn Maple Tree
          dummy.position.set(lx, h, lz);
          dummy.scale.set(s, s, s);
          dummy.rotation.set(0, rotY, 0);
          dummy.updateMatrix();
          iAutTrunk.setMatrixAt(aCount, dummy.matrix);

          dummy.position.set(lx, h + 2.8 * s, lz);
          dummy.scale.set(s, s * 0.95, s);
          dummy.rotation.set(0, rotY, 0);
          dummy.updateMatrix();
          iAutMain.setMatrixAt(aCount, dummy.matrix);

          dummy.position.set(lx - 0.7 * s, h + 3.2 * s, lz + 0.5 * s);
          dummy.scale.set(s * 0.9, s * 0.9, s * 0.9);
          dummy.rotation.set(0, rotY * 1.5, 0);
          dummy.updateMatrix();
          iAutCluster1.setMatrixAt(aCount, dummy.matrix);

          dummy.position.set(lx + 0.8 * s, h + 3.3 * s, lz - 0.4 * s);
          dummy.scale.set(s * 0.85, s * 0.85, s * 0.85);
          dummy.rotation.set(0, rotY * 2.2, 0);
          dummy.updateMatrix();
          iAutCluster2.setMatrixAt(aCount, dummy.matrix);

          dummy.position.set(lx + 0.1 * s, h + 4.1 * s, lz + 0.1 * s);
          dummy.scale.set(s * 0.8, s * 0.8, s * 0.8);
          dummy.rotation.set(0, rotY * 0.7, 0);
          dummy.updateMatrix();
          iAutTop.setMatrixAt(aCount, dummy.matrix);

          aCount++;
        }
      }
    }

    // Set instance counts
    iPineTrunk.count = pCount;
    iPine1.count = pCount; iPine2.count = pCount;
    iPine3.count = pCount; iPine4.count = pCount;

    iOakTrunk.count = oCount;
    iOakMain.count = oCount;
    iOakCluster1.count = oCount; iOakCluster2.count = oCount;
    iOakTop.count = oCount;

    iAutTrunk.count = aCount;
    iAutMain.count = aCount;
    iAutCluster1.count = aCount; iAutCluster2.count = aCount;
    iAutTop.count = aCount;

    iBoulderLarge.count = bldCount;
    iBoulderMoss.count  = mossCount;
    iRockSlab.count     = slabCount;
    iPebble.count       = pebCount;

    // Attach all to chunk
    chunkMesh.add(
      iPineTrunk, iPine1, iPine2, iPine3, iPine4,
      iOakTrunk, iOakMain, iOakCluster1, iOakCluster2, iOakTop,
      iAutTrunk, iAutMain, iAutCluster1, iAutCluster2, iAutTop,
      iBoulderLarge, iBoulderMoss, iRockSlab, iPebble
    );
  }
}
