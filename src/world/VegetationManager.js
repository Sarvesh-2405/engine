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
        base = { pine: 38, oak: 18, aut: 12, bld: 2, moss: 2, slab: 2, peb: 2, grass: 750, flower: 65, maxSamples: 1400 };
        break;
      case 'high':
        base = { pine: 28, oak: 14, aut: 9, bld: 2, moss: 1, slab: 1, peb: 2, grass: 550, flower: 45, maxSamples: 1050 };
        break;
      case 'medium':
        base = { pine: 18, oak: 9, aut: 6, bld: 1, moss: 1, slab: 1, peb: 1, grass: 320, flower: 25, maxSamples: 650 };
        break;
      case 'low':
      default:
        base = { pine: 10, oak: 5, aut: 3, bld: 1, moss: 1, slab: 1, peb: 1, grass: 160, flower: 12, maxSamples: 350 };
        break;
    }
    if (!this.grassEnabled) {
      base.grass = 0;
      base.flower = 0;
    } else if (this.grassDensityMult !== 1.0) {
      base.grass = Math.round(base.grass * this.grassDensityMult);
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
    const OAK_COUNT        = counts.oak;
    const AUTUMN_COUNT     = counts.aut;
    const BOULDER_COUNT    = counts.bld;
    const MOSSY_ROCK_COUNT = counts.moss;
    const SLAB_COUNT       = counts.slab;
    const PEBBLE_COUNT     = counts.peb;
    const GRASS_COUNT      = counts.grass;
    const FLOWER_COUNT     = counts.flower;

    const chunkKey = `${cx},${cz}`;

    const useGlbPine = (this.pineStyle === 'glb') && this.treeBuilder.glbLoaded && this.treeBuilder.pineVariants.length > 0;
    const glbVariant = useGlbPine ? this.treeBuilder.pineVariants[0] : null;

    let iGlbPineTrunk = null;
    let iGlbPineCanopy = null;

    let iPineTrunk = null, iPine1 = null, iPine2 = null, iPine3 = null, iPine4 = null;

    if (useGlbPine) {
      iGlbPineTrunk = new THREE.InstancedMesh(
        glbVariant.trunkGeo,
        this.treeBuilder.glbTrunkMaterial,
        PINE_COUNT
      );
      iGlbPineCanopy = new THREE.InstancedMesh(
        glbVariant.canopyGeo,
        this.treeBuilder.glbLeafMaterial,
        PINE_COUNT
      );
      iGlbPineCanopy.customDepthMaterial = this.treeBuilder.glbLeafDepthMaterial;
      iGlbPineCanopy.castShadow = true;
      iGlbPineCanopy.receiveShadow = true;

      iGlbPineTrunk.castShadow = true;
      iGlbPineTrunk.receiveShadow = false;
    } else {
      // Procedural fallback while GLB is loading or when procedural style is selected
      iPineTrunk = new THREE.InstancedMesh(this.treeBuilder.pineTrunkGeo, MAT_TRUNK,      PINE_COUNT);
      iPine1     = new THREE.InstancedMesh(this.treeBuilder.pineTier1,    MAT_PINE_TIER1, PINE_COUNT);
      iPine2     = new THREE.InstancedMesh(this.treeBuilder.pineTier2,    MAT_PINE_TIER2, PINE_COUNT);
      iPine3     = new THREE.InstancedMesh(this.treeBuilder.pineTier3,    MAT_PINE_TIER3, PINE_COUNT);
      iPine4     = new THREE.InstancedMesh(this.treeBuilder.pineTier4,    MAT_PINE_TIER4, PINE_COUNT);
    }

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

    // ── Stylized Tapered Grass Blades (Tuft Clumps) ───────────
    const iGrassBlades = new THREE.InstancedMesh(
      this.grassBuilder.bladeGeo,
      this.grassBuilder.bladeMaterial,
      GRASS_COUNT
    );
    iGrassBlades.castShadow = false;
    iGrassBlades.receiveShadow = true;

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

    // Shadows configuration for trees & rocks
    const treeMeshes = [
      iOakTrunk, iOakMain, iOakCluster1, iOakCluster2, iOakTop,
      iAutTrunk, iAutMain, iAutCluster1, iAutCluster2, iAutTop,
      iBoulderLarge, iBoulderMoss, iRockSlab
    ];
    if (!useGlbPine) {
      treeMeshes.push(iPineTrunk, iPine1, iPine2, iPine3, iPine4);
    }
    for (const m of treeMeshes) {
      m.castShadow = true;
      m.receiveShadow = false;
    }
    iPebble.castShadow = false;
    iPebble.receiveShadow = false;

    const dummy = new THREE.Object3D();
    let pCount = 0, oCount = 0, aCount = 0;
    let bldCount = 0, mossCount = 0, slabCount = 0, pebCount = 0;
    let grassCount = 0;
    let flACount = 0, flBCount = 0;

    const originX = cx * chunkSize;
    const originZ = cz * chunkSize;

    // Road half-width is 4.9m + shoulder 1.2m = 6.1m. Enforce 6.8m minimum distance
    const GRASS_ROAD_CLEARANCE = 6.8;

    // ── Scatter Loop ──────────────────────────────────────────
    for (let i = 0; i < counts.maxSamples; i++) {
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

      // ── Shoreline Pebbles (Strict road clearance) ───────────
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

      // ── Roadside & Meadow Grass & Wildflowers (Clean clearance outside road shoulders) ──
      if (this.grassEnabled && roadDist > GRASS_ROAD_CLEARANCE && roadDist < 62.0 && h > 1.25) {
        const rotY = (this.noise2D(wx * 0.4, wz * 0.4) + 0.5) * Math.PI * 2;
        const gs   = 0.85 + Math.abs(this.noise2D(wx * 0.15, wz * 0.15)) * 0.55;

        // Wildflower chance in meadow verges
        if (roadDist < 25.0 && Math.abs(this.noise2D(wx * 0.75, wz * 0.75)) > 0.54) {
          const useB = Math.abs(this.noise2D(wx * 1.2, wz * 1.2)) > 0.5;
          const flowerTarget = (useB && flBCount < countFlowerB) ? iFlowerB : iFlowerA;
          const isTargetB = flowerTarget === iFlowerB;

          if (isTargetB && flBCount < countFlowerB) {
            const slot = flBCount++;
            const flowerScale = 0.55 * gs;
            dummy.position.set(lx, h, lz);
            dummy.scale.set(flowerScale, flowerScale, flowerScale);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            iFlowerB.setMatrixAt(slot * 2, dummy.matrix);

            dummy.rotation.set(0, rotY + Math.PI * 0.5, 0);
            dummy.updateMatrix();
            iFlowerB.setMatrixAt(slot * 2 + 1, dummy.matrix);
          } else if (!isTargetB && flACount < countFlowerA) {
            const slot = flACount++;
            const flowerScale = 0.55 * gs;
            dummy.position.set(lx, h, lz);
            dummy.scale.set(flowerScale, flowerScale, flowerScale);
            dummy.rotation.set(0, rotY, 0);
            dummy.updateMatrix();
            iFlowerA.setMatrixAt(slot * 2, dummy.matrix);

            dummy.rotation.set(0, rotY + Math.PI * 0.5, 0);
            dummy.updateMatrix();
            iFlowerA.setMatrixAt(slot * 2 + 1, dummy.matrix);
          }
        } else if (grassCount < GRASS_COUNT) {
          // Stylized tapered grass tuft clump
          const bladeW = (0.11 + Math.abs(this.noise2D(wx * 0.3, wz * 0.3)) * 0.09) * gs;
          const bladeH = (0.52 + Math.abs(this.noise2D(wx * 0.1, wz * 0.1)) * 0.42) * gs;
          const tiltX  = (this.noise2D(wx * 0.5, wz * 0.5)) * 0.20;
          const tiltZ  = (this.noise2D(wz * 0.5, wx * 0.5)) * 0.20;

          dummy.position.set(lx, h, lz);
          dummy.scale.set(bladeW, bladeH, bladeW);
          dummy.rotation.set(tiltX, rotY, tiltZ);
          dummy.updateMatrix();
          iGrassBlades.setMatrixAt(grassCount++, dummy.matrix);
        }
      }

      // Trees must respect clearance from road
      if (roadDist < this.minRoadDistance) continue;

      const rotY    = this.noise2D(wx * 0.05, wz * 0.05) * Math.PI * 4;
      const s       = (0.75 + Math.abs(this.noise2D(wx * 0.08, wz * 0.08)) * 1.0) * this.treeScaleFactor;
      const typeVal = this.noise2D(wx * 0.25, wz * 0.25);
      const hillT   = THREE.MathUtils.clamp((h - 2.0) / 10.0, 0, 1);

      // Geological Rocks on High Peaks
      const isRockZone = (hillT > 0.82 && Math.abs(typeVal) > 0.58);
      if (isRockZone && bldCount < BOULDER_COUNT) {
        dummy.position.set(lx, h + 0.5 * s, lz);
        dummy.scale.set(s * 1.1, s * 0.9, s * 1.1);
        dummy.rotation.set(rotY * 0.15, rotY, rotY * 0.1);
        dummy.updateMatrix();
        iBoulderLarge.setMatrixAt(bldCount++, dummy.matrix);
        this._registerRock(wx, h, wz, 1.8 * s, chunkKey);
        continue;
      } else if (isRockZone && mossCount < MOSSY_ROCK_COUNT) {
        dummy.position.set(lx, h + 0.35 * s, lz);
        dummy.scale.set(s * 0.95, s * 0.75, s * 0.95);
        dummy.rotation.set(rotY * 0.2, rotY, -rotY * 0.15);
        dummy.updateMatrix();
        iBoulderMoss.setMatrixAt(mossCount++, dummy.matrix);
        this._registerRock(wx, h, wz, 1.4 * s, chunkKey);
        continue;
      } else if (isRockZone && slabCount < SLAB_COUNT) {
        dummy.position.set(lx, h + 0.25 * s, lz);
        dummy.scale.set(s * 1.2, s * 0.7, s * 1.2);
        dummy.rotation.set(0.12, rotY, 0.08);
        dummy.updateMatrix();
        iRockSlab.setMatrixAt(slabCount++, dummy.matrix);
        this._registerRock(wx, h, wz, 1.6 * s, chunkKey);
        continue;
      }

      // Conifers vs Broadleaf
      const wantConifer = typeVal > -0.15 + hillT * 0.35;

      if (wantConifer && pCount < PINE_COUNT) {
        dummy.position.set(lx, h, lz);
        dummy.scale.set(s, s, s);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();

        if (useGlbPine) {
          iGlbPineTrunk.setMatrixAt(pCount, dummy.matrix);
          iGlbPineCanopy.setMatrixAt(pCount, dummy.matrix);
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

      } else if (!wantConifer) {
        const isAutumn = this.noise2D(wx * 0.35, wz * 0.35) > 0.15;

        if (!isAutumn && oCount < OAK_COUNT) {
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

    // Collect all instanced meshes for bounding assignment and frustum culling
    const allInstanced = [
      iOakTrunk, iOakMain, iOakCluster1, iOakCluster2, iOakTop,
      iAutTrunk, iAutMain, iAutCluster1, iAutCluster2, iAutTop,
      iBoulderLarge, iBoulderMoss, iRockSlab, iPebble,
      iGrassBlades, iFlowerA, iFlowerB
    ];

    // Set active counts
    if (useGlbPine) {
      iGlbPineTrunk.count = pCount;
      iGlbPineCanopy.count = pCount;
      iGlbPineTrunk.instanceMatrix.needsUpdate = true;
      iGlbPineCanopy.instanceMatrix.needsUpdate = true;
      allInstanced.push(iGlbPineTrunk, iGlbPineCanopy);
      chunkMesh.add(iGlbPineTrunk, iGlbPineCanopy);
    } else {
      iPineTrunk.count = pCount;
      iPine1.count = pCount; iPine2.count = pCount;
      iPine3.count = pCount; iPine4.count = pCount;
      iPineTrunk.instanceMatrix.needsUpdate = true;
      iPine1.instanceMatrix.needsUpdate = true;
      iPine2.instanceMatrix.needsUpdate = true;
      iPine3.instanceMatrix.needsUpdate = true;
      iPine4.instanceMatrix.needsUpdate = true;
      allInstanced.push(iPineTrunk, iPine1, iPine2, iPine3, iPine4);
      chunkMesh.add(iPineTrunk, iPine1, iPine2, iPine3, iPine4);
    }

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

    iGrassBlades.count  = grassCount;
    iFlowerA.count      = flACount * 2;
    iFlowerB.count      = flBCount * 2;

    iGrassBlades.instanceMatrix.needsUpdate = true;
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
    chunkMesh._grassInstancedMeshes = [iGrassBlades, iFlowerA, iFlowerB];

    chunkMesh.add(
      iOakTrunk, iOakMain, iOakCluster1, iOakCluster2, iOakTop,
      iAutTrunk, iAutMain, iAutCluster1, iAutCluster2, iAutTop,
      iBoulderLarge, iBoulderMoss, iRockSlab, iPebble,
      iGrassBlades, iFlowerA, iFlowerB
    );
  }
}
