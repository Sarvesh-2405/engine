import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { createGrassFieldUniforms, MAX_ROCKS } from './vegetation/GrassUniforms.js';
import {
  TreeBuilder,
  setTreeSurfaceUniforms,
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
import {
  GrassBuilder,
  GLOBAL_WIND,
} from './vegetation/GrassBuilder.js';

export class VegetationManager {
  constructor(scene, roadSpline) {
    this.scene = scene;
    this.roadSpline = roadSpline;
    this.noise2D = createNoise2D(() => 99);

    // ── Global Shared Uniform Bag ──────────────────────────────
    this.uniforms = createGrassFieldUniforms();
    setTreeSurfaceUniforms(this.uniforms.surface);

    this.onTreesLoaded = null;
    this.treeBuilder  = new TreeBuilder(this.uniforms, () => {
      if (this.onTreesLoaded) this.onTreesLoaded();
    });
    this.rockBuilder  = new RockBuilder();
    this.grassBuilder = new GrassBuilder(this.uniforms);
    this.quality      = 'high';

    // Live tunable parameters
    this.grassEnabled     = true;
    this.minRoadDistance  = 14.0;
    this.treeScaleFactor  = 1.0;
    this.grassDensityMult = 1.0;
    this.pineStyle        = 'glb'; // 'glb' (authentic scanned branches & leaves) | 'procedural' (conical tiers)

    // Rock tracking for grass trampling effect
    this.activeRocks = [];
  }

  setQuality(preset) {
    this.quality = preset;
  }

  getCounts() {
    let base;
    switch (this.quality) {
      case 'ultra':
        base = { pine: 18, bld: 2, moss: 2, slab: 2, peb: 2, grass: 3000, bush: 120, flower: 90, maxSamples: 5800 };
        break;
      case 'high':
        base = { pine: 16, bld: 2, moss: 1, slab: 1, peb: 2, grass: 2100, bush: 85, flower: 60, maxSamples: 4000 };
        break;
      case 'medium':
        base = { pine: 10, bld: 1, moss: 1, slab: 1, peb: 1, grass: 1100, bush: 45, flower: 35, maxSamples: 2400 };
        break;
      case 'low':
      default:
        base = { pine: 5, bld: 1, moss: 1, slab: 1, peb: 1, grass: 550, bush: 20, flower: 18, maxSamples: 1200 };
        break;
    }
    if (!this.grassEnabled) {
      base.grass = 0;
      base.bush = 0;
      base.flower = 0;
    } else if (this.grassDensityMult !== 1.0) {
      base.grass = Math.round(base.grass * this.grassDensityMult);
      base.bush = Math.round(base.bush * this.grassDensityMult);
      base.flower = Math.round(base.flower * this.grassDensityMult);
    }
    return base;
  }

  _registerRock(x, y, z, radius, chunkKey) {
    this.activeRocks.push({ x, y, z, radius, chunkKey });
    // Keep list bounded to last 160 rocks
    if (this.activeRocks.length > 160) {
      this.activeRocks.shift();
    }
  }

  update(dt = 0.016, carPosition = null, atmosphere = null) {
    // Advance shared wind simulation for grass, ground, flowers, and trees
    this.uniforms.surface.uTime.value += dt;
    this.uniforms.flower.uTime.value += dt;
    GLOBAL_WIND.uTime.value = this.uniforms.surface.uTime.value;

    // Track sun direction and color from atmosphere
    if (atmosphere && atmosphere.sunLight) {
      if (atmosphere._skyUniforms && atmosphere._skyUniforms.sunDir) {
        this.uniforms.surface.uSunDir.value.copy(atmosphere._skyUniforms.sunDir.value);
      }
      this.uniforms.surface.uSunColor.value.copy(atmosphere.sunLight.color)
        .multiplyScalar(atmosphere.sunLight.intensity);
    }

    // Update nearest rocks into uRocks uniform array for blade trampling
    if (carPosition && this.activeRocks.length > 0) {
      const px = carPosition.x;
      const pz = carPosition.z;

      // Sort rocks by distance to car
      const nearest = this.activeRocks
        .slice()
        .sort((a, b) => {
          const d1 = (a.x - px) * (a.x - px) + (a.z - pz) * (a.z - pz);
          const d2 = (b.x - px) * (b.x - px) + (b.z - pz) * (b.z - pz);
          return d1 - d2;
        });

      const count = Math.min(nearest.length, MAX_ROCKS);
      for (let i = 0; i < count; i++) {
        const r = nearest[i];
        this.uniforms.surface.uRocks.value[i].set(r.x, r.y, r.z, r.radius);
      }
      this.uniforms.surface.uRockCount.value = count;
    }
  }

  populateChunk(chunkMesh, cx, cz, chunkSize, getElevationFn) {
    const counts = this.getCounts();

    const PINE_COUNT       = counts.pine;
    const BOULDER_COUNT    = counts.bld;
    const MOSSY_ROCK_COUNT = counts.moss;
    const SLAB_COUNT       = counts.slab;
    const PEBBLE_COUNT     = counts.peb;
    const GRASS_COUNT      = counts.grass;
    const BUSH_COUNT       = counts.bush || 0;
    const FLOWER_COUNT     = counts.flower;

    const chunkKey = `${cx},${cz}`;

    const useGlbPine = (this.pineStyle === 'glb') && this.treeBuilder.glbLoaded && this.treeBuilder.pineVariants.length > 0;
    const pineVariants = useGlbPine ? this.treeBuilder.pineVariants : [];
    const numVariants = pineVariants.length;

    const glbTrunkMeshes = [];
    const glbCanopyMeshes = [];
    const glbVariantCounts = [];

    let iPineTrunk = null, iPine1 = null, iPine2 = null, iPine3 = null, iPine4 = null;

    if (useGlbPine) {
      const maxPerVar = Math.ceil(PINE_COUNT / numVariants) + 4;
      for (let v = 0; v < numVariants; v++) {
        const variant = pineVariants[v];
        const tMesh = new THREE.InstancedMesh(variant.trunkGeo, this.treeBuilder.glbTrunkMaterial, maxPerVar);
        const cMesh = new THREE.InstancedMesh(variant.canopyGeo, this.treeBuilder.glbLeafMaterial, maxPerVar);
        cMesh.customDepthMaterial = this.treeBuilder.glbLeafDepthMaterial;
        cMesh.castShadow = true;
        cMesh.receiveShadow = true;
        tMesh.castShadow = true;
        tMesh.receiveShadow = false;
        glbTrunkMeshes.push(tMesh);
        glbCanopyMeshes.push(cMesh);
        glbVariantCounts.push(0);
      }
    } else {
      // Procedural fallback while GLB is loading or when procedural style is selected
      iPineTrunk = new THREE.InstancedMesh(this.treeBuilder.pineTrunkGeo, MAT_TRUNK,      PINE_COUNT);
      iPine1     = new THREE.InstancedMesh(this.treeBuilder.pineTier1,    MAT_PINE_TIER1, PINE_COUNT);
      iPine2     = new THREE.InstancedMesh(this.treeBuilder.pineTier2,    MAT_PINE_TIER2, PINE_COUNT);
      iPine3     = new THREE.InstancedMesh(this.treeBuilder.pineTier3,    MAT_PINE_TIER3, PINE_COUNT);
      iPine4     = new THREE.InstancedMesh(this.treeBuilder.pineTier4,    MAT_PINE_TIER4, PINE_COUNT);
      iPineTrunk.castShadow = true;
      iPine1.castShadow = true;
      iPine2.castShadow = true;
      iPine3.castShadow = true;
      iPine4.castShadow = true;
    }

    // ── Geological Rocks (Sparse on peaks & shorelines) ───────
    const iBoulderLarge = new THREE.InstancedMesh(this.rockBuilder.boulderLargeGeo,  MAT_GRANITE,    BOULDER_COUNT);
    const iBoulderMoss  = new THREE.InstancedMesh(this.rockBuilder.boulderMediumGeo, MAT_MOSSY_ROCK, MOSSY_ROCK_COUNT);
    const iRockSlab     = new THREE.InstancedMesh(this.rockBuilder.rockSlabGeo,      MAT_SANDSTONE,  SLAB_COUNT);
    const iPebble       = new THREE.InstancedMesh(this.rockBuilder.pebbleGeo,        MAT_PEBBLE,     PEBBLE_COUNT);

    iBoulderLarge.castShadow = true;
    iBoulderMoss.castShadow = true;
    iRockSlab.castShadow = true;
    iPebble.castShadow = false;

    // ── Stylized Slender Tapered Grass Blades (Tuft Clumps) ──
    const iGrassBlades = new THREE.InstancedMesh(
      this.grassBuilder.bladeGeo,
      this.grassBuilder.bladeMaterial,
      GRASS_COUNT
    );
    iGrassBlades.castShadow = false;
    iGrassBlades.receiveShadow = true;

    // ── Stylized Spherical Grass Bushes (Lush Wild Grass Shrub Tussocks) ──
    const iGrassBushes = new THREE.InstancedMesh(
      this.grassBuilder.bushGeo,
      this.grassBuilder.bladeMaterial,
      BUSH_COUNT
    );
    iGrassBushes.castShadow = false;
    iGrassBushes.receiveShadow = true;

    // ── Stylized Cross-Billboard Flowers (Two Texture Variants) ──
    const countFlowerA = Math.ceil(FLOWER_COUNT * 0.55);
    const countFlowerB = Math.max(0, FLOWER_COUNT - countFlowerA);

    // ×2 quads per flower cross-billboard
    const iFlowerA = new THREE.InstancedMesh(
      this.grassBuilder.flowerQuadGeo,
      this.grassBuilder.flowerMatA,
      countFlowerA * 2
    );
    iFlowerA.customDepthMaterial = this.grassBuilder.flowerDepthMatA;
    iFlowerA.castShadow = true;
    iFlowerA.receiveShadow = true;

    const iFlowerB = new THREE.InstancedMesh(
      this.grassBuilder.flowerQuadGeo,
      this.grassBuilder.flowerMatB,
      countFlowerB * 2
    );
    iFlowerB.customDepthMaterial = this.grassBuilder.flowerDepthMatB;
    iFlowerB.castShadow = true;
    iFlowerB.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let pCount = 0;
    let bldCount = 0, mossCount = 0, slabCount = 0, pebCount = 0;
    let grassCount = 0;
    let bushCount = 0;
    let flACount = 0, flBCount = 0;

    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    // Road clearance constraints
    const GRASS_ROAD_CLEARANCE = 6.8;

    // Track placed objects within this chunk to strictly prevent overlapping/intersections
    const placedRocks = [];
    const placedTrees = [];

    // Helper: 2D euclidean distance squared
    const distSq2D = (x1, z1, x2, z2) => (x1 - x2) * (x1 - x2) + (z1 - z2) * (z1 - z2);

    // ── Phase 1: Geological Rocks & Shoreline Pebbles ────────
    const rockMaxSamples = Math.min(counts.maxSamples, 400);
    for (let i = 0; i < rockMaxSamples; i++) {
      if (bldCount >= BOULDER_COUNT && mossCount >= MOSSY_ROCK_COUNT && slabCount >= SLAB_COUNT && pebCount >= PEBBLE_COUNT) {
        break;
      }

      const lx = (this.noise2D(cx * 97  + i * 7, cz * 57  + i * 5) - 0.5) * chunkSize * 0.94;
      const lz = (this.noise2D(cz * 131 + i * 5, cx * 71  + i * 7) - 0.5) * chunkSize * 0.94;
      const wx = originX + lx;
      const wz = originZ + lz;

      let roadDist = 999;
      if (this.roadSpline) {
        const info = this.roadSpline.getRoadInfo(wx, wz);
        roadDist = info.distance;
      }
      const h = getElevationFn(wx, wz);

      // Shoreline Pebbles
      if (h < 1.6) {
        if (h > 0.85 && pebCount < PEBBLE_COUNT && roadDist > GRASS_ROAD_CLEARANCE) {
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

      // Mountain / Peak Rocks
      if (roadDist < this.minRoadDistance) continue;
      const hillT = THREE.MathUtils.clamp((h - 2.0) / 10.0, 0, 1);
      const isRockZone = (hillT > 0.82 && Math.abs(this.noise2D(wx * 0.25, wz * 0.25)) > 0.58);
      if (!isRockZone) continue;

      const rotY = this.noise2D(wx * 0.05, wz * 0.05) * Math.PI * 4;
      const s    = (0.85 + Math.abs(this.noise2D(wx * 0.08, wz * 0.08)) * 0.80) * this.treeScaleFactor;

      if (bldCount < BOULDER_COUNT) {
        dummy.position.set(lx, h + 0.5 * s, lz);
        dummy.scale.set(s * 1.1, s * 0.9, s * 1.1);
        dummy.rotation.set(rotY * 0.15, rotY, rotY * 0.1);
        dummy.updateMatrix();
        iBoulderLarge.setMatrixAt(bldCount++, dummy.matrix);
        placedRocks.push({ x: lx, z: lz, r: 2.2 * s });
        this._registerRock(wx, h, wz, 1.8 * s, chunkKey);
      } else if (mossCount < MOSSY_ROCK_COUNT) {
        dummy.position.set(lx, h + 0.35 * s, lz);
        dummy.scale.set(s * 0.95, s * 0.75, s * 0.95);
        dummy.rotation.set(rotY * 0.2, rotY, -rotY * 0.15);
        dummy.updateMatrix();
        iBoulderMoss.setMatrixAt(mossCount++, dummy.matrix);
        placedRocks.push({ x: lx, z: lz, r: 1.8 * s });
        this._registerRock(wx, h, wz, 1.4 * s, chunkKey);
      } else if (slabCount < SLAB_COUNT) {
        dummy.position.set(lx, h + 0.25 * s, lz);
        dummy.scale.set(s * 1.2, s * 0.7, s * 1.2);
        dummy.rotation.set(0.12, rotY, 0.08);
        dummy.updateMatrix();
        iRockSlab.setMatrixAt(slabCount++, dummy.matrix);
        placedRocks.push({ x: lx, z: lz, r: 2.0 * s });
        this._registerRock(wx, h, wz, 1.6 * s, chunkKey);
      }
    }

    // ── Phase 2: Pine Trees (Strict Stone Clearance & Mutual Distance) ──
    const treeMaxSamples = Math.min(counts.maxSamples, 500);
    for (let i = 0; i < treeMaxSamples; i++) {
      if (pCount >= PINE_COUNT) break;

      const lx = (this.noise2D(cx * 83  + i * 11, cz * 61  + i * 9) - 0.5) * chunkSize * 0.94;
      const lz = (this.noise2D(cz * 127 + i * 9,  cx * 79  + i * 11) - 0.5) * chunkSize * 0.94;
      const wx = originX + lx;
      const wz = originZ + lz;

      let roadDist = 999;
      if (this.roadSpline) {
        const info = this.roadSpline.getRoadInfo(wx, wz);
        roadDist = info.distance;
      }
      if (roadDist < this.minRoadDistance) continue;

      const h = getElevationFn(wx, wz);
      if (h < 1.6) continue;

      const s = (0.85 + Math.abs(this.noise2D(wx * 0.08, wz * 0.08)) * 0.80) * this.treeScaleFactor;

      // 1. Strict Rock Clearance: Never spawn inside or against stones
      let insideRock = false;
      for (let r = 0; r < placedRocks.length; r++) {
        const rock = placedRocks[r];
        const minReqDist = rock.r + 1.8 * s;
        if (distSq2D(lx, lz, rock.x, rock.z) < minReqDist * minReqDist) {
          insideRock = true;
          break;
        }
      }
      if (insideRock) continue;

      // 2. Mutual Tree Clearance: Space trees naturally apart
      let tooCloseTree = false;
      const minTreeSpacing = 5.2;
      for (let t = 0; t < placedTrees.length; t++) {
        const tree = placedTrees[t];
        if (distSq2D(lx, lz, tree.x, tree.z) < minTreeSpacing * minTreeSpacing) {
          tooCloseTree = true;
          break;
        }
      }
      if (tooCloseTree) continue;

      // Valid Tree Placement
      placedTrees.push({ x: lx, z: lz, r: 1.6 * s });

      const rotY = this.noise2D(wx * 0.05, wz * 0.05) * Math.PI * 4;
      dummy.position.set(lx, h, lz);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();

      if (useGlbPine) {
        const vIdx = pCount % numVariants;
        const slot = glbVariantCounts[vIdx]++;
        glbTrunkMeshes[vIdx].setMatrixAt(slot, dummy.matrix);
        glbCanopyMeshes[vIdx].setMatrixAt(slot, dummy.matrix);
      } else {
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
      }
      pCount++;
    }

    // ── Phase 3: Meadow Grass, Small Bushes & Wildflowers ────
    if (this.grassEnabled) {
      for (let i = 0; i < counts.maxSamples; i++) {
        if (grassCount >= GRASS_COUNT && bushCount >= BUSH_COUNT && flACount >= countFlowerA && flBCount >= countFlowerB) {
          break;
        }

        const lx = (this.noise2D(cx * 97  + i, cz * 57  + i * 3) - 0.5) * chunkSize * 0.94;
        const lz = (this.noise2D(cz * 131 + i, cx * 71  + i * 2) - 0.5) * chunkSize * 0.94;
        const wx = originX + lx;
        const wz = originZ + lz;

        let roadDist = 999;
        if (this.roadSpline) {
          const info = this.roadSpline.getRoadInfo(wx, wz);
          roadDist = info.distance;
        }
        if (roadDist <= GRASS_ROAD_CLEARANCE || roadDist >= 70.0) continue;

        const h = getElevationFn(wx, wz);
        if (h <= 1.25) continue;

        const rotY = (this.noise2D(wx * 0.4, wz * 0.4) + 0.5) * Math.PI * 2;
        const gs   = 0.85 + Math.abs(this.noise2D(wx * 0.15, wz * 0.15)) * 0.55;

        // Strict Clearance Check with Tree Trunks (No bushes or grass inside trees!)
        let nearTree = false;
        let nearTreeTrunkForBush = false;
        for (let t = 0; t < placedTrees.length; t++) {
          const tree = placedTrees[t];
          const d2 = distSq2D(lx, lz, tree.x, tree.z);
          if (d2 < 0.65 * 0.65) {
            nearTree = true;
            break;
          }
          if (d2 < 1.9 * 1.9) {
            nearTreeTrunkForBush = true;
          }
        }
        if (nearTree) continue;

        // Strict Clearance Check with Rocks (No bushes or grass clipping inside rocks!)
        let nearRock = false;
        let nearRockForBush = false;
        for (let r = 0; r < placedRocks.length; r++) {
          const rock = placedRocks[r];
          const d2 = distSq2D(lx, lz, rock.x, rock.z);
          if (d2 < (rock.r * 0.7) * (rock.r * 0.7)) {
            nearRock = true;
            break;
          }
          if (d2 < (rock.r * 1.2) * (rock.r * 1.2)) {
            nearRockForBush = true;
          }
        }
        if (nearRock) continue;

        // 1. Wildflower placement
        if (roadDist < 25.0 && Math.abs(this.noise2D(wx * 0.75, wz * 0.75)) > 0.54) {
          const useB = Math.abs(this.noise2D(wx * 1.2, wz * 1.2)) > 0.5;
          const flowerTarget = (useB && flBCount < countFlowerB) ? iFlowerB : iFlowerA;
          const isTargetB = flowerTarget === iFlowerB;

          if (isTargetB && flBCount < countFlowerB) {
            const slot = flBCount++;
            const flowerScale = 0.45 * gs;
            dummy.position.set(lx, h, lz);
            dummy.scale.set(flowerScale, flowerScale, flowerScale);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            iFlowerB.setMatrixAt(slot * 2, dummy.matrix);

            dummy.rotation.set(0, rotY + Math.PI * 0.5, 0);
            dummy.updateMatrix();
            iFlowerB.setMatrixAt(slot * 2 + 1, dummy.matrix);
            continue;
          } else if (!isTargetB && flACount < countFlowerA) {
            const slot = flACount++;
            const flowerScale = 0.45 * gs;
            dummy.position.set(lx, h, lz);
            dummy.scale.set(flowerScale, flowerScale, flowerScale);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            iFlowerA.setMatrixAt(slot * 2, dummy.matrix);

            dummy.rotation.set(0, rotY + Math.PI * 0.5, 0);
            dummy.updateMatrix();
            iFlowerA.setMatrixAt(slot * 2 + 1, dummy.matrix);
            continue;
          }
        }

        // 2. Medium Compact Grass Bush / Tussock placement
        if (bushCount < BUSH_COUNT && !nearTreeTrunkForBush && !nearRockForBush && Math.abs(this.noise2D(wx * 0.35, wz * 0.35)) > 0.64) {
          // Neat, lush wild grass bush / tussock (diameter ~0.45-0.65m)
          const bushW = (0.38 + Math.abs(this.noise2D(wx * 0.2, wz * 0.2)) * 0.22) * gs;
          const bushH = (0.36 + Math.abs(this.noise2D(wz * 0.25, wx * 0.25)) * 0.20) * gs;
          const tiltX = (this.noise2D(wx * 0.5, wz * 0.5)) * 0.12;
          const tiltZ = (this.noise2D(wz * 0.5, wx * 0.5)) * 0.12;

          dummy.position.set(lx, h, lz);
          dummy.scale.set(bushW, bushH, bushW);
          dummy.rotation.set(tiltX, rotY, tiltZ);
          dummy.updateMatrix();
          iGrassBushes.setMatrixAt(bushCount++, dummy.matrix);
          continue;
        }

        // 3. Slender Meadow Grass Blade Clump placement
        if (grassCount < GRASS_COUNT) {
          const bladeW = (0.036 + Math.abs(this.noise2D(wx * 0.3, wz * 0.3)) * 0.026) * gs;
          const bladeH = (0.44 + Math.abs(this.noise2D(wx * 0.1, wz * 0.1)) * 0.34) * gs;
          const tiltX  = (this.noise2D(wx * 0.5, wz * 0.5)) * 0.20;
          const tiltZ  = (this.noise2D(wz * 0.5, wx * 0.5)) * 0.20;

          dummy.position.set(lx, h, lz);
          dummy.scale.set(bladeW, bladeH, bladeW);
          dummy.rotation.set(tiltX, rotY, tiltZ);
          dummy.updateMatrix();
          iGrassBlades.setMatrixAt(grassCount++, dummy.matrix);
        }
      }
    }

    // Collect all instanced meshes for bounding assignment and frustum culling
    const allInstanced = [
      iBoulderLarge, iBoulderMoss, iRockSlab, iPebble,
      iGrassBlades, iGrassBushes, iFlowerA, iFlowerB
    ];

    if (useGlbPine) {
      for (let v = 0; v < numVariants; v++) {
        glbTrunkMeshes[v].count = glbVariantCounts[v];
        glbCanopyMeshes[v].count = glbVariantCounts[v];
        glbTrunkMeshes[v].instanceMatrix.needsUpdate = true;
        glbCanopyMeshes[v].instanceMatrix.needsUpdate = true;
        allInstanced.push(glbTrunkMeshes[v], glbCanopyMeshes[v]);
        chunkMesh.add(glbTrunkMeshes[v], glbCanopyMeshes[v]);
      }
    } else {
      iPineTrunk.count = pCount;
      iPine1.count = pCount;
      iPine2.count = pCount;
      iPine3.count = pCount;
      iPine4.count = pCount;
      iPineTrunk.instanceMatrix.needsUpdate = true;
      iPine1.instanceMatrix.needsUpdate = true;
      iPine2.instanceMatrix.needsUpdate = true;
      iPine3.instanceMatrix.needsUpdate = true;
      iPine4.instanceMatrix.needsUpdate = true;
      allInstanced.push(iPineTrunk, iPine1, iPine2, iPine3, iPine4);
      chunkMesh.add(iPineTrunk, iPine1, iPine2, iPine3, iPine4);
    }

    iBoulderLarge.count = bldCount;
    iBoulderMoss.count  = mossCount;
    iRockSlab.count     = slabCount;
    iPebble.count       = pebCount;

    iGrassBlades.count  = grassCount;
    iGrassBushes.count  = bushCount;
    iFlowerA.count      = flACount * 2;
    iFlowerB.count      = flBCount * 2;

    iGrassBlades.instanceMatrix.needsUpdate = true;
    iGrassBushes.instanceMatrix.needsUpdate = true;
    iFlowerA.instanceMatrix.needsUpdate = true;
    iFlowerB.instanceMatrix.needsUpdate = true;

    // Compute bounding sphere encompassing the entire chunk for fast Three.js frustum culling
    const chunkSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), chunkSize * 0.95);
    const chunkBox = new THREE.Box3(
      new THREE.Vector3(-chunkSize * 0.55, -8, -chunkSize * 0.55),
      new THREE.Vector3(chunkSize * 0.55, 30, chunkSize * 0.55)
    );

    for (let m = 0; m < allInstanced.length; m++) {
      const mesh = allInstanced[m];
      mesh.geometry.boundingSphere = chunkSphere;
      mesh.geometry.boundingBox = chunkBox;
      mesh.frustumCulled = true;
    }

    // Attach grass references for distance-based LOD visibility toggling
    chunkMesh._grassInstancedMeshes = [iGrassBlades, iGrassBushes, iFlowerA, iFlowerB];

    chunkMesh.add(
      iBoulderLarge, iBoulderMoss, iRockSlab, iPebble,
      iGrassBlades, iGrassBushes, iFlowerA, iFlowerB
    );
  }
}
