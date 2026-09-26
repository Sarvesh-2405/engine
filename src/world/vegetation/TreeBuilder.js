import * as THREE from 'three';
import { GLOBAL_WIND } from './GrassBuilder.js';

// ── Shared Reference to Global Stylized Uniforms ──────────────
let _activeSurfaceUniforms = null;

export function setTreeSurfaceUniforms(uniforms) {
  _activeSurfaceUniforms = uniforms;
}

/**
 * Creates a stylized foliage material with vertical color banding, micro-noise variation,
 * wind sway with branch dip, and sun backlight translucency glow.
 */
export function createStylizedCanopyMaterial(bottomHex, topHex, roughness = 0.82, heightWeight = 1.0, flutterAmp = 0.06) {
  const bColor = new THREE.Color(bottomHex);
  const tColor = new THREE.Color(topHex);

  const mat = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    flatShading: true,
  });

  mat.userData = {
    bottomColor:  { value: bColor },
    topColor:     { value: tColor },
    heightWeight: { value: heightWeight },
    flutterAmp:   { value: flutterAmp },
  };

  mat.onBeforeCompile = (shader) => {
    // If active surface uniforms exist, link them; otherwise fallback to GLOBAL_WIND
    if (_activeSurfaceUniforms) {
      Object.assign(shader.uniforms, _activeSurfaceUniforms);
    } else {
      shader.uniforms.uTime         = GLOBAL_WIND.uTime;
      shader.uniforms.uWindStrength = GLOBAL_WIND.uWindStrength;
      shader.uniforms.uWindSpeed    = GLOBAL_WIND.uWindSpeed;
      shader.uniforms.uWindFreq     = GLOBAL_WIND.uWindFreq;
      shader.uniforms.uWindDir      = GLOBAL_WIND.uWindDir;
      shader.uniforms.uSunDir       = { value: new THREE.Vector3(-0.3, 0.85, -0.3).normalize() };
      shader.uniforms.uSunColor     = { value: new THREE.Color(1.0, 0.95, 0.85) };
      shader.uniforms.uTransColor   = { value: new THREE.Color('#cbf051') };
      shader.uniforms.uTransStrength = { value: 1.5 };
      shader.uniforms.uBrightness   = { value: 0.9 };
    }

    shader.uniforms.uFoliageBottom = mat.userData.bottomColor;
    shader.uniforms.uFoliageTop    = mat.userData.topColor;
    shader.uniforms.uHeightWeight  = mat.userData.heightWeight;
    shader.uniforms.uFlutterAmp    = mat.userData.flutterAmp;

    shader.vertexShader =
      `uniform float uTime;
      uniform float uWindStrength;
      uniform float uWindSpeed;
      uniform float uWindFreq;
      uniform vec2  uWindDir;
      uniform float uHeightWeight;
      uniform float uFlutterAmp;
      varying vec3  vFoliageLocal;
      varying vec3  vFoliageWorld;
      varying vec3  vFoliageNormal;\n` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vFoliageLocal = position;

      #ifdef USE_INSTANCING
        vec4 wInstance = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 wPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        mat3 instRot = mat3(
          normalize(vec3(instanceMatrix[0])),
          normalize(vec3(instanceMatrix[1])),
          normalize(vec3(instanceMatrix[2]))
        );
      #else
        vec4 wInstance = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec3 wPos = (modelMatrix * vec4(position, 1.0)).xyz;
        mat3 instRot = mat3(1.0);
      #endif
      vFoliageWorld = wPos;
      vFoliageNormal = normalize(mat3(modelMatrix) * instRot * normal);

      // Canopy height mask: upper branches sway more than lower base
      float hMask = clamp((position.y + 1.0) / 4.0, 0.1, 1.0);
      hMask = hMask * hMask;

      // Synchronized forest wind wave
      float wave = sin(dot(wInstance.xz, uWindDir) * uWindFreq + uTime * uWindSpeed);
      // High-frequency micro flutter across foliage needles/leaves
      float flutter = sin(wPos.x * 3.5 + wPos.z * 3.0 + uTime * uWindSpeed * 2.5) * cos(wPos.y * 2.5 + uTime * 2.0);

      float sway = (wave * 0.35 + flutter * uFlutterAmp) * uWindStrength * uHeightWeight * hMask;

      vec3 windWrong = vec3(uWindDir.x, 0.0, uWindDir.y);
      vec3 windRight = transpose(instRot) * windWrong;
      transformed += windRight * sway;

      // Pendulum dip: branches drop slightly when swinging outward
      transformed.y -= abs(wave) * uWindStrength * 0.12 * hMask;`
    );

    shader.fragmentShader =
      `varying vec3  vFoliageLocal;
      varying vec3  vFoliageWorld;
      varying vec3  vFoliageNormal;
      uniform vec3  uFoliageBottom;
      uniform vec3  uFoliageTop;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform vec3  uTransColor;
      uniform float uTransStrength;
      uniform float uBrightness;

      float _canopyHash(vec3 p) {
        p = fract(p * vec3(127.1, 311.7, 74.7));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }
      float _canopyNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 w = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(_canopyHash(i), _canopyHash(i + vec3(1,0,0)), w.x),
              mix(_canopyHash(i + vec3(0,1,0)), _canopyHash(i + vec3(1,1,0)), w.x), w.y),
          mix(mix(_canopyHash(i + vec3(0,0,1)), _canopyHash(i + vec3(1,0,1)), w.x),
              mix(_canopyHash(i + vec3(0,1,1)), _canopyHash(i + vec3(1,1,1)), w.x), w.y),
          w.z);
      }\n` + shader.fragmentShader;

    // Replace diffuseColor with vertical gradient color band + subtle cluster noise
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `float _normY = clamp((vFoliageLocal.y + 0.8) / 3.0, 0.0, 1.0);
      _normY = pow(_normY, 1.25);
      vec3 _foliageCol = mix(uFoliageBottom, uFoliageTop, _normY);

      // Micro tonal variation across foliage clusters
      float _cn = _canopyNoise(vFoliageWorld * 0.4) - 0.5;
      _foliageCol += _foliageCol * (_cn * 0.18);

      vec4 diffuseColor = vec4(_foliageCol * uBrightness, opacity);`
    );

    // Subsurface rim / backlight glow
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      {
        vec3  _L    = normalize(uSunDir);
        vec3  _V    = normalize(cameraPosition - vFoliageWorld);
        float _back = pow(max(dot(_V, -_L), 0.0), 2.6);
        float _rim  = 1.0 - abs(dot(normalize(vFoliageNormal), _L));
        vec3  _glow = uTransColor * uSunColor * (uTransStrength * 0.45) * _back * _rim;
        gl_FragColor.rgb += _glow;
      }`
    );
  };

  return mat;
}

// ── Stylized Wood Bark Material ────────────────────────────────
export const MAT_TRUNK = new THREE.MeshLambertMaterial({
  color: 0x3d2717,
  side: THREE.FrontSide,
  flatShading: true,
});

// ── Conifer / Pine Foliage Materials ───────────────────────────
export const MAT_PINE_TIER1 = createStylizedCanopyMaterial(0x13381b, 0x1d4e28, 0.85, 0.35, 0.03); // Underside skirt
export const MAT_PINE_TIER2 = createStylizedCanopyMaterial(0x1c4a24, 0x276633, 0.82, 0.55, 0.05); // Mid-low tier
export const MAT_PINE_TIER3 = createStylizedCanopyMaterial(0x235e2d, 0x338042, 0.80, 0.75, 0.07); // Mid-high tier
export const MAT_PINE_TIER4 = createStylizedCanopyMaterial(0x2e7539, 0x48a855, 0.78, 1.00, 0.09); // Top crown

// ── Summer Oak Foliage Materials ───────────────────────────────
export const MAT_OAK_MAIN    = createStylizedCanopyMaterial(0x28632a, 0x459948, 0.82, 0.60, 0.05); // Main clump
export const MAT_OAK_CLUSTER = createStylizedCanopyMaterial(0x357837, 0x54ab58, 0.80, 0.80, 0.07); // Side highlight
export const MAT_OAK_TOP     = createStylizedCanopyMaterial(0x428f45, 0x6ac26e, 0.78, 1.00, 0.09); // Sunlit crown

// ── Autumn Maple Foliage Materials ─────────────────────────────
export const MAT_AUTUMN_MAIN    = createStylizedCanopyMaterial(0xb45309, 0xd97706, 0.82, 0.60, 0.05); // Amber gold
export const MAT_AUTUMN_CLUSTER = createStylizedCanopyMaterial(0xc2410c, 0xea580c, 0.80, 0.80, 0.07); // Fiery orange
export const MAT_AUTUMN_TOP     = createStylizedCanopyMaterial(0xd97706, 0xf59e0b, 0.78, 1.00, 0.09); // Golden yellow

// ── Procedural Tree Geometries ─────────────────────────────────
function createPineConeTier(radius, height, segments = 7) {
  const geo = new THREE.ConeGeometry(radius, height, segments);
  geo.translate(0, height * 0.5, 0);
  return geo;
}

function createCanopyClumpGeometry(radius = 1.5, segments = 6, rings = 5) {
  const geo = new THREE.SphereGeometry(radius, segments, rings);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const noise = (Math.sin(v.x * 2.1) * Math.cos(v.y * 2.3) * Math.sin(v.z * 1.9)) * 0.14 * radius;
    v.addScaledVector(v.clone().normalize(), noise);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PINE_WIND_UNIFORMS,
  PINE_WIND_VERTEX,
  PINE_LEAF_FRAGMENT,
  BARK_UNIFORMS,
  BARK_NORMAL_RELIEF,
  BARK_FRAGMENT,
} from './GrassShaders.js';

export function makePineLeafMaterial(srcMat, mesh, u) {
  const uLeafYMin = 0.5;
  const uLeafYMax = 7.5;

  const mat = new THREE.MeshLambertMaterial({
    map: srcMat ? srcMat.map : null,
    alphaTest: srcMat && srcMat.alphaTest > 0 ? srcMat.alphaTest : 0.45,
    transparent: false,
    side: THREE.DoubleSide,
  });

  mat.userData = {
    bottomColor: u ? u.uLeafBottom : { value: new THREE.Color('#1c3b23') },
    topColor:    u ? u.uLeafTop    : { value: new THREE.Color('#5c8338') },
  };

  const bounds = {
    uLeafYMin: { value: uLeafYMin },
    uLeafYMax: { value: uLeafYMax },
  };

  mat.onBeforeCompile = (shader) => {
    if (u) {
      Object.assign(shader.uniforms, u, bounds);
    } else if (_activeSurfaceUniforms) {
      Object.assign(shader.uniforms, _activeSurfaceUniforms, bounds);
    }

    shader.vertexShader =
      PINE_WIND_UNIFORMS +
      `varying vec3 vLeafLocal;\nvarying vec3 vLeafWorld;\n` +
      shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      PINE_WIND_VERTEX +
      `\nvLeafLocal = position;\nvLeafWorld = (modelMatrix * vec4(position, 1.0)).xyz;\n`
    );

    shader.fragmentShader =
      `varying vec3  vLeafLocal;
      varying vec3  vLeafWorld;
      uniform vec3  uLeafBottom;
      uniform vec3  uLeafTop;
      uniform float uLeafBrightness;
      uniform float uLeafGradPower;
      uniform vec3  uLeafVarColor;
      uniform float uLeafVarStrength;
      uniform float uLeafVarScale;
      uniform float uLeafYMin;
      uniform float uLeafYMax;

      float _lfHash(vec3 p) {
        p = fract( p * vec3( 127.1, 311.7, 74.7 ) );
        p += dot( p, p.yzx + 19.19 );
        return fract( ( p.x + p.y ) * p.z );
      }
      float _lfNoise(vec3 p) {
        vec3 i = floor( p );
        vec3 f = fract( p );
        vec3 w = f * f * ( 3.0 - 2.0 * f );
        return mix(
          mix( mix( _lfHash( i ),               _lfHash( i + vec3(1,0,0) ), w.x ),
               mix( _lfHash( i + vec3(0,1,0) ), _lfHash( i + vec3(1,1,0) ), w.x ), w.y ),
          mix( mix( _lfHash( i + vec3(0,0,1) ), _lfHash( i + vec3(1,0,1) ), w.x ),
               mix( _lfHash( i + vec3(0,1,1) ), _lfHash( i + vec3(1,1,1) ), w.x ), w.y ),
          w.z );
      }\n` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      PINE_LEAF_FRAGMENT
    );
  };

  return mat;
}

export function makePineLeafDepthMaterial(srcMat) {
  return new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: srcMat ? srcMat.map : null,
    alphaTest: srcMat && srcMat.alphaTest > 0 ? srcMat.alphaTest : 0.45,
    side: THREE.DoubleSide,
  });
}

export function makeBarkMaterial(uBark, uSurface) {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.FrontSide });

  mat.onBeforeCompile = (shader) => {
    if (uBark) Object.assign(shader.uniforms, uBark);
    if (uSurface) {
      shader.uniforms.uTime = uSurface.uTime;
      shader.uniforms.uWindSpeed = uSurface.uWindSpeed;
      shader.uniforms.uWindFreq = uSurface.uWindFreq;
      shader.uniforms.uWindDir = uSurface.uWindDir;
      shader.uniforms.uLeafWindStrength = uSurface.uLeafWindStrength;
    } else if (_activeSurfaceUniforms) {
      shader.uniforms.uTime = _activeSurfaceUniforms.uTime;
      shader.uniforms.uWindSpeed = _activeSurfaceUniforms.uWindSpeed;
      shader.uniforms.uWindFreq = _activeSurfaceUniforms.uWindFreq;
      shader.uniforms.uWindDir = _activeSurfaceUniforms.uWindDir;
      shader.uniforms.uLeafWindStrength = _activeSurfaceUniforms.uLeafWindStrength;
    }

    shader.vertexShader =
      `uniform float uTime;
      uniform float uWindSpeed;
      uniform float uWindFreq;
      uniform vec2  uWindDir;
      uniform float uLeafWindStrength;
      varying vec2 vBarkUv;\n` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vBarkUv = uv;
      #ifdef USE_INSTANCING
        vec3 _trkWld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        mat3 _trkRot = mat3(
          normalize(vec3(instanceMatrix[0])),
          normalize(vec3(instanceMatrix[1])),
          normalize(vec3(instanceMatrix[2]))
        );
      #else
        vec3 _trkWld = (modelMatrix * vec4(position, 1.0)).xyz;
        mat3 _trkRot = mat3(1.0);
      #endif
      float _trkT = clamp(position.y / 7.5, 0.0, 1.0);
      float _trkMask = _trkT * _trkT;
      vec3 _trkWLocal = transpose(_trkRot) * vec3(uWindDir.x, 0.0, uWindDir.y);
      float _trkSway = sin(dot(_trkWld.xz, uWindDir) * uWindFreq + uTime * uWindSpeed);
      transformed += _trkWLocal * (_trkSway * uLeafWindStrength * 0.45 * _trkMask);`
    );

    shader.fragmentShader = BARK_UNIFORMS + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      BARK_NORMAL_RELIEF
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      BARK_FRAGMENT
    );
  };

  return mat;
}

export class TreeBuilder {
  constructor(uniformBag = null, onLoaded = null) {
    this.uniforms = uniformBag;
    this.onLoaded = onLoaded;
    this.glbLoaded = false;
    this.pineVariants = [];

    // Fallback procedural geometries for instant initialization
    this.pineTrunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 2.6, 6);
    this.pineTrunkGeo.translate(0, 1.3, 0);

    this.pineTier1 = createPineConeTier(2.10, 2.4, 7);
    this.pineTier2 = createPineConeTier(1.70, 2.2, 7);
    this.pineTier3 = createPineConeTier(1.25, 2.0, 7);
    this.pineTier4 = createPineConeTier(0.75, 1.8, 6);

    this.oakTrunkGeo = new THREE.CylinderGeometry(0.20, 0.38, 2.4, 6);
    this.oakTrunkGeo.translate(0, 1.2, 0);

    this.oakCanopyMain    = createCanopyClumpGeometry(1.9, 7, 6);
    this.oakCanopyCluster = createCanopyClumpGeometry(1.4, 6, 5);
    this.oakCanopyTop     = createCanopyClumpGeometry(1.2, 6, 5);

    this.glbTrunkMaterial = null;
    this.glbLeafMaterial  = null;
    this.glbLeafDepthMaterial = null;

    // Load authentic scanned pine trees from grass-scene.glb
    this._loadGLTF();
  }

  _loadGLTF() {
    const loader = new GLTFLoader();
    loader.load('/assets/grass-scene.glb', (gltf) => {
      const scene = gltf.scene;
      const surfaceU = this.uniforms ? this.uniforms.surface : _activeSurfaceUniforms;
      const barkU = this.uniforms ? this.uniforms.bark : null;

      this.glbTrunkMaterial = makeBarkMaterial(barkU, surfaceU);

      // Find all tree variants by grouping under Cylinder.xxx
      const treeGroups = new Map();
      let sampleLeafMesh = null;
      let sampleLeafMat = null;

      scene.updateMatrixWorld(true);

      scene.traverse((child) => {
        if (child.isMesh) {
          const mat = Array.isArray(child.material) ? child.material[0] : child.material;
          const matName = mat ? mat.name : '';

          // Look for leaf needle material (2237f4d60830642a24d65276e7abe1e6 or has alpha test)
          if (mat && (matName === '2237f4d60830642a24d65276e7abe1e6' || (mat.map && mat.alphaTest > 0))) {
            if (!sampleLeafMat) {
              sampleLeafMat = mat;
              sampleLeafMesh = child;
            }
          }

          const match = child.name.match(/^(Cylinder\.\d+)/);
          if (match) {
            const treeId = match[1];
            if (!treeGroups.has(treeId)) {
              treeGroups.set(treeId, { trunks: [], canopies: [] });
            }
            const group = treeGroups.get(treeId);
            const isTrunk = matName === 'Material.011' || child.name.includes('_0');
            const isCanopy = matName === '2237f4d60830642a24d65276e7abe1e6' || child.name.includes('_1');
            if (isTrunk) group.trunks.push(child);
            else if (isCanopy) group.canopies.push(child);
          }
        }
      });

      if (sampleLeafMat && sampleLeafMesh) {
        this.glbLeafMaterial = makePineLeafMaterial(sampleLeafMat, sampleLeafMesh, surfaceU);
        this.glbLeafDepthMaterial = makePineLeafDepthMaterial(sampleLeafMat);
      }

      for (const [treeId, group] of treeGroups.entries()) {
        if (group.trunks.length > 0 && group.canopies.length > 0) {
          const trunkGeos = group.trunks.map((m) => {
            const g = m.geometry.clone();
            g.applyMatrix4(m.matrixWorld);
            return g;
          });
          const canopyGeos = group.canopies.map((m) => {
            const g = m.geometry.clone();
            g.applyMatrix4(m.matrixWorld);
            return g;
          });

          const mergedTrunk = trunkGeos.length === 1 ? trunkGeos[0] : mergeGeometries(trunkGeos, false);
          const mergedCanopy = canopyGeos.length === 1 ? canopyGeos[0] : mergeGeometries(canopyGeos, false);

          if (mergedTrunk && mergedCanopy) {
            mergedTrunk.computeBoundingBox();
            mergedCanopy.computeBoundingBox();

            const minY = Math.min(mergedTrunk.boundingBox.min.y, mergedCanopy.boundingBox.min.y);
            const maxY = Math.max(mergedTrunk.boundingBox.max.y, mergedCanopy.boundingBox.max.y);
            const height = Math.max(maxY - minY, 0.1);
            const centerX = (mergedTrunk.boundingBox.min.x + mergedTrunk.boundingBox.max.x) * 0.5;
            const centerZ = (mergedTrunk.boundingBox.min.z + mergedTrunk.boundingBox.max.z) * 0.5;

            const targetH = 7.5;
            const s = targetH / height;

            mergedTrunk.translate(-centerX, -minY, -centerZ);
            mergedTrunk.scale(s, s, s);
            mergedCanopy.translate(-centerX, -minY, -centerZ);
            mergedCanopy.scale(s, s, s);

            mergedTrunk.computeVertexNormals();
            mergedCanopy.computeVertexNormals();

            this.pineVariants.push({
              name: treeId,
              trunkGeo: mergedTrunk,
              canopyGeo: mergedCanopy,
            });
          }
        }
      }

      if (this.pineVariants.length > 0) {
        this.glbLoaded = true;
        console.log(`[TreeBuilder] Successfully loaded and merged ${this.pineVariants.length} authentic scanned pine tree variants.`);
        if (this.onLoaded) this.onLoaded();
      }
    }, undefined, (err) => {
      console.warn('[TreeBuilder] GLB load fallback:', err);
    });
  }
}
