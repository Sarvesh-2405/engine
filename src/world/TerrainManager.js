import * as THREE from 'three';
import { fbm } from './RoadSpline.js';
import { WaterSystem } from '../graphics/WaterSystem.js';
import { GROUND_MASK_UNIFORMS, GROUND_MASK_GLSL } from './vegetation/GrassShaders.js';
import { MAX_SHADOW_TAPS } from './vegetation/GrassUniforms.js';

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

/**
 * Creates stylized ground material sharing the procedural dirt mask, blade bottom color,
 * normal flattening, micro grain, and soft ring shadow averaging.
 */
export function makeGroundMaterial(surfaceUniforms) {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.FrontSide,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, surfaceUniforms);

    shader.vertexShader =
      `#define GRASS_SHADOW_TAPS ${MAX_SHADOW_TAPS}
      uniform float uFlatFloorNormal;
      uniform float uShadowRadius;
      varying vec2 vGndXZ;
      #ifdef USE_SHADOWMAP
        varying vec4 vGndShCoord[ ${MAX_SHADOW_TAPS} ];
      #endif\n` + shader.vertexShader;

    // Normal flattening to +Y so ground lighting response matches grass blades
    shader.vertexShader = shader.vertexShader.replace(
      '#include <defaultnormal_vertex>',
      `#include <defaultnormal_vertex>
      vec3 _upView = normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) );
      transformedNormal = normalize( mix( transformedNormal, _upView, uFlatFloorNormal ) );`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vGndXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )
        vec4 worldPosition = vec4( 1e6, 1e6, 1e6, 1.0 );
      #endif
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        vec3 _gwp = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        for ( int _k = 0; _k < ${MAX_SHADOW_TAPS}; _k++ ) {
          float _a   = 6.2831853 * ( float( _k ) + 0.5 ) / float( ${MAX_SHADOW_TAPS} );
          vec2  _off = vec2( cos( _a ), sin( _a ) ) * uShadowRadius;
          vGndShCoord[ _k ] = directionalShadowMatrix[ 0 ] * vec4( _gwp + vec3( _off.x, 0.0, _off.y ), 1.0 );
        }
      #endif`
    );

    shader.fragmentShader =
      `#define GRASS_SHADOW_TAPS ${MAX_SHADOW_TAPS}
      varying vec2  vGndXZ;
      uniform vec3  uGrassBottom;
      uniform float uBrightness;
      uniform float uTintFloor;
      uniform vec3  uPatchLush;
      uniform vec3  uPatchDry;
      uniform float uPatchStrength;
      uniform float uPatchScale;
      uniform float uPatchBias;
      uniform vec3  uGndVarColor;
      uniform float uGndVarScale;
      uniform float uGndVarStrength;
      uniform float uGndGrainScale;
      uniform float uGndGrainStrength;
      uniform float uGndReliefScale;
      uniform float uGndReliefStrength;
      uniform int   uShadowSamples;
      uniform float uShadowStrength;
      #ifdef USE_SHADOWMAP
        varying vec4 vGndShCoord[ ${MAX_SHADOW_TAPS} ];
      #endif\n` +
      GROUND_MASK_UNIFORMS +
      GROUND_MASK_GLSL +
      shader.fragmentShader;

    // Normal fake relief slope displacement
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      if ( uGndReliefStrength > 0.001 ) {
        vec2  _rp = vGndXZ * uGndReliefScale;
        float _e  = 0.5;
        float _hL = _gmFbm( _rp - vec2( _e, 0.0 ) );
        float _hR = _gmFbm( _rp + vec2( _e, 0.0 ) );
        float _hD = _gmFbm( _rp - vec2( 0.0, _e ) );
        float _hU = _gmFbm( _rp + vec2( 0.0, _e ) );
        vec3  _wn = normalize( vec3( -( _hR - _hL ), 1.0, -( _hU - _hD ) )
                             * vec3( uGndReliefStrength, 1.0, uGndReliefStrength ) );
        normal = normalize( mat3( viewMatrix ) * _wn );
      }`
    );

    // Blend base vertexColors toward grass bottom and procedural dirt patches
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `float _dirt = groundDirt( vGndXZ );

      float _pt = pow( clamp( _gmFbm( vGndXZ * uPatchScale ), 0.0, 1.0 ), uPatchBias );
      vec3 _grassTint = mix( uGrassBottom, mix( uPatchLush, uPatchDry, _pt ), uPatchStrength );

      vec3 _gndCol = mix( diffuse, _grassTint * uBrightness, uTintFloor );
      _gndCol = mix( _gndCol, uDirtColor * uBrightness, _dirt );

      // Two scales of tonal break-up: large patch variance + close-up tactile grain
      float _var   = _gmFbm( vGndXZ * uGndVarScale )   - 0.5;
      float _grain = _gmFbm( vGndXZ * uGndGrainScale ) - 0.5;
      vec3  _varCol = uGndVarColor * uBrightness;
      _gndCol += ( _varCol - _gndCol ) * _var   * uGndVarStrength   * _dirt;
      _gndCol += ( _varCol - _gndCol ) * _grain * uGndGrainStrength * _dirt;
      _gndCol = max( _gndCol, vec3( 0.0 ) );

      vec4 diffuseColor = vec4( _gndCol, opacity );`
    );

    // Soft ring shadow PCF average
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
        {
          DirectionalLightShadow _dls = directionalLightShadows[ 0 ];
          float _sSum = 0.0;
          int   _sN   = 0;
          for ( int _k = 0; _k < ${MAX_SHADOW_TAPS}; _k++ ) {
            if ( _k >= uShadowSamples ) break;
            _sSum += getShadow(
              directionalShadowMap[ 0 ],
              _dls.shadowMapSize,
              _dls.shadowIntensity,
              _dls.shadowBias,
              _dls.shadowRadius,
              vGndShCoord[ _k ]
            );
            _sN++;
          }
          float _gShadow = _sSum / float( max( _sN, 1 ) );
          gl_FragColor.rgb *= ( 1.0 - uShadowStrength * ( 1.0 - _gShadow ) );
        }
      #endif`
    );
  };

  return mat;
}

export class TerrainManager {
  constructor(scene, roadSpline, vegetationManager, chunkSize = 90, segments = 22) {
    this.scene = scene;
    this.roadSpline = roadSpline;
    this.vegetationManager = vegetationManager;
    this.chunkSize = chunkSize;
    this.segments = segments;

    this.activeChunks = new Map();
    this.chunkRadius = 3; // 7x7 grid around car

    if (this.vegetationManager && this.vegetationManager.uniforms) {
      this.terrainMaterial = makeGroundMaterial(this.vegetationManager.uniforms.surface);
    } else {
      this.terrainMaterial = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.88,
        metalness: 0.0,
      });
    }

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

    // Sort missing chunks so nearest in front of car is built first
    if (missingChunks.length > 0) {
      missingChunks.sort((a, b) => a.distSq - b.distSq);
      const chunksToBuild = Math.min(2, missingChunks.length);
      for (let i = 0; i < chunksToBuild; i++) {
        const { cx, cz, key } = missingChunks[i];
        const mesh = this._createChunk(cx, cz);
        this.activeChunks.set(key, mesh);
        this.scene.add(mesh);
      }
    }

    const grassMaxDistSq = (this.chunkSize * 1.55) * (this.chunkSize * 1.55);

    // Smoothly ease in new chunks so terrain & trees glide in without popping
    for (const [key, mesh] of this.activeChunks.entries()) {
      if (mesh._spawnT !== undefined && mesh._spawnT < 1.0) {
        mesh._spawnT = Math.min(1.0, mesh._spawnT + (dt || 0.016) * 4.5);
        const t = mesh._spawnT;
        const ease = t * t * (3.0 - 2.0 * t);
        mesh.position.y = (1.0 - ease) * -8.0;
        mesh.scale.set(1.0, 0.5 + ease * 0.5, 1.0);
      }

      // Distance LOD: Grass and wildflower instances are active only in near chunks (~140m).
      // Distant chunks use the procedural ground shader grass/dirt blend, cutting 80%+ blade overhead.
      if (mesh._grassInstancedMeshes) {
        const cdx = mesh.position.x - carPosition.x;
        const cdz = mesh.position.z - carPosition.z;
        const distSq = cdx * cdx + cdz * cdz;
        const isNear = distSq < grassMaxDistSq;
        for (let k = 0; k < mesh._grassInstancedMeshes.length; k++) {
          mesh._grassInstancedMeshes[k].visible = isNear;
        }
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

        // Clamp position at water level
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
          vertexColor = COLOR_BEACH.clone();
        } else if (height < WATER_LEVEL + 0.8) {
          const t = (height - WATER_LEVEL) / 0.8;
          vertexColor = COLOR_BEACH.clone().lerp(COLOR_VALLEY, t * t);
        } else {
          const heightT  = THREE.MathUtils.clamp((height - WATER_LEVEL) / 14.0, 0, 1);
          const slopeT   = THREE.MathUtils.clamp(slope / 0.5, 0, 1);
          const rockT    = THREE.MathUtils.clamp((slope - 0.5) / 0.4, 0, 1);

          let base = COLOR_VALLEY.clone().lerp(COLOR_MID, heightT * 0.6).lerp(COLOR_SLOPE, slopeT * 0.5);

          if (heightT > 0.6) {
            base.lerp(COLOR_HILL, (heightT - 0.6) / 0.4 * 0.4);
          }

          base.lerp(COLOR_ROCK, rockT * 0.85);

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
