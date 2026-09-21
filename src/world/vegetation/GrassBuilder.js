import * as THREE from 'three';
import { MAX_ROCKS, MAX_SHADOW_TAPS } from './GrassUniforms.js';
import {
  GROUND_MASK_UNIFORMS,
  GROUND_MASK_GLSL,
  GRASS_BLADE_UNIFORMS,
  GRASS_BLADE_VERTEX,
  GRASS_SHADOW_VERTEX,
  FLOWER_WIND_UNIFORMS,
  FLOWER_WIND_VERTEX,
  FLOWER_UNIFORMS,
  FLOWER_DIFFUSE,
} from './GrassShaders.js';

// ── Backward-compatible GLOBAL_WIND alias ──────────────────────
export const GLOBAL_WIND = {
  uTime:         { value: 0.0 },
  uWindStrength: { value: 0.35 },
  uWindSpeed:    { value: 1.4 },
  uWindFreq:     { value: 0.35 },
  uWindDir:      { value: new THREE.Vector2(0.8, 0.6).normalize() },
};

// ── Blade Geometry ─────────────────────────────────────────────
/**
 * Half-width of blade at normalized height t [0..1].
 * Tapers exponentially to a delicate concave tip.
 */
function bladeHalfWidth(t) {
  return 0.5 * Math.pow(Math.max(0, 1 - t), 1.2);
}

/**
 * Creates unit-size tapered blade strip geometry (base width = 1, height = 1).
 * The instance scale matrix scales this to world dimensions (e.g. width ~ 0.12m, height ~ 0.65m).
 * @param {number} segments Bend quality segments (default 3 = 7 vertices, 5 triangles).
 */
export function makeBladeGeometry(segments = 3) {
  const seg = Math.max(1, Math.round(segments));
  const positions = new Float32Array((seg * 2 + 1) * 3);

  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    const w = bladeHalfWidth(t);
    positions[i * 6 + 0] = -w;
    positions[i * 6 + 1] = t;
    positions[i * 6 + 2] = 0;
    positions[i * 6 + 3] = w;
    positions[i * 6 + 4] = t;
    positions[i * 6 + 5] = 0;
  }
  positions[seg * 6 + 0] = 0; // tip at x = 0
  positions[seg * 6 + 1] = 1; // tip at y = 1
  positions[seg * 6 + 2] = 0;

  const indices = [];
  for (let i = 0; i < seg - 1; i++) {
    const l  = i * 2;
    const r  = l + 1;
    const nl = l + 2;
    const nr = l + 3;
    indices.push(l, nl, r, r, nl, nr);
  }
  const lastL = (seg - 1) * 2;
  indices.push(lastL, seg * 2, lastL + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates dense multi-blade tuft clump geometry (4 organically fanned blades).
 * Multiplies grass density by 4x per instance for a thick stylized meadow at low vertex cost.
 */
export function makeClumpBladeGeometry(numBlades = 4, segments = 2) {
  const seg = Math.max(1, Math.round(segments));
  const vertsPerBlade = seg * 2 + 1;
  const positions = [];
  const indices = [];

  for (let b = 0; b < numBlades; b++) {
    const angle = (b / numBlades) * Math.PI + (b * 0.38);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const radOffset = 0.12 * (b % 2 === 0 ? 0.7 : 1.0);
    const ox = Math.cos(angle + Math.PI * 0.5) * radOffset;
    const oz = Math.sin(angle + Math.PI * 0.5) * radOffset;
    const tilt = 0.08 + (b % 2) * 0.05;
    const hScale = 0.88 + ((b * 5) % 4) * 0.08;

    const baseVertex = (b * vertsPerBlade);

    for (let i = 0; i < seg; i++) {
      const t = i / seg;
      const w = bladeHalfWidth(t) * 0.9;
      const curY = t * hScale;
      const leanX = sinA * t * tilt;
      const leanZ = -cosA * t * tilt;

      // Left vertex
      const lx = -w * cosA + ox + leanX;
      const lz = -w * sinA + oz + leanZ;
      positions.push(lx, curY, lz);

      // Right vertex
      const rx = w * cosA + ox + leanX;
      const rz = w * sinA + oz + leanZ;
      positions.push(rx, curY, rz);
    }
    // Tip vertex
    const tipX = ox + sinA * tilt * 1.4;
    const tipZ = oz - cosA * tilt * 1.4;
    positions.push(tipX, 1.0 * hScale, tipZ);

    // Indices for this blade
    for (let i = 0; i < seg - 1; i++) {
      const l = baseVertex + i * 2;
      const r = l + 1;
      const nl = l + 2;
      const nr = l + 3;
      indices.push(l, nl, r, r, nl, nr);
    }
    const lastL = baseVertex + (seg - 1) * 2;
    indices.push(lastL, baseVertex + seg * 2, lastL + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ── Stylized Blade Material ────────────────────────────────────
/**
 * Creates the stylized blade material with +Y normal flattening, base-to-tip gradient,
 * dirt patch shortening/tinting, soft ring shadow averaging, and backlight translucency glow.
 */
export function makeBladeMaterial(surfaceUniforms) {
  const mat = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, surfaceUniforms);

    // ── Vertex Shader ──────────────────────────────────────────
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      #define MAX_ROCKS ${MAX_ROCKS}
      #define GRASS_SHADOW_TAPS ${MAX_SHADOW_TAPS}
      ${GROUND_MASK_UNIFORMS}
      ${GROUND_MASK_GLSL}
      ${GRASS_BLADE_UNIFORMS}`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      GRASS_BLADE_VERTEX
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      GRASS_SHADOW_VERTEX
    );

    // Force shading normal to +Y so blades don't shimmer as camera or blade rotates
    shader.vertexShader = shader.vertexShader.replace(
      '#include <defaultnormal_vertex>',
      `#include <defaultnormal_vertex>
      transformedNormal = normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) );`
    );

    // ── Fragment Shader ────────────────────────────────────────
    shader.fragmentShader =
      `#define GRASS_SHADOW_TAPS ${MAX_SHADOW_TAPS}
      varying float vBH;
      varying vec3  vWorldPos;
      varying vec3  vBladeN;
      varying float vDirt;
      varying float vPatch;
      uniform vec3  uGrassBottom;
      uniform vec3  uGrassTop;
      uniform float uBrightness;
      uniform float uGradStart;
      uniform float uGradEnd;
      uniform float uGradPower;
      uniform vec3  uDirtColor;
      uniform float uDirtBlend;
      uniform vec3  uPatchLush;
      uniform vec3  uPatchDry;
      uniform float uPatchStrength;
      uniform float uPatchBias;
      uniform int   uShadowSamples;
      uniform float uShadowStrength;
      uniform vec3  uSunDir;
      uniform vec3  uSunColor;
      uniform vec3  uTransColor;
      uniform float uTransStrength;
      uniform float uTransPower;
      uniform float uTransTip;
      uniform float uTransShadow;
      #ifdef USE_SHADOWMAP
        varying vec4 vGrassShCoord[ ${MAX_SHADOW_TAPS} ];
      #endif\n` + shader.fragmentShader;

    // Force shading normal to +Y on both faces (eliminates dark backface flip)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      normal = normalize( mat3( viewMatrix ) * vec3( 0.0, 1.0, 0.0 ) );`
    );

    // Base-to-tip gradient + macro environmental patches + dirt tint
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      `float _gT = clamp( ( vBH - uGradStart ) / max( uGradEnd - uGradStart, 0.001 ), 0.0, 1.0 );
      _gT = pow( _gT, uGradPower );
      vec3 _bladeCol = mix( uGrassBottom, uGrassTop, _gT );

      // Macro lush->dry environmental drift
      float _pt = pow( clamp( vPatch, 0.0, 1.0 ), uPatchBias );
      _bladeCol = mix( _bladeCol, mix( uPatchLush, uPatchDry, _pt ), uPatchStrength );

      // Tint whole height on dirt patches so leftover short blades blend into soil
      _bladeCol = mix( _bladeCol, uDirtColor, vDirt * uDirtBlend );

      vec4 diffuseColor = vec4( _bladeCol * uBrightness, opacity );`
    );

    // Soft ring shadow averaging + subsurface backlight translucency glow
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      {
        float _shadow = 1.0;
        #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
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
              vGrassShCoord[ _k ]
            );
            _sN++;
          }
          _shadow = _sSum / float( max( _sN, 1 ) );
        #endif

        gl_FragColor.rgb *= ( 1.0 - uShadowStrength * ( 1.0 - _shadow ) );

        // Backlight translucency glow for golden hour / low sun angles
        vec3  _L    = normalize( uSunDir );
        vec3  _V    = normalize( cameraPosition - vWorldPos );
        float _back = pow( max( dot( _V, -_L ), 0.0 ), uTransPower );
        float _thin = mix( 1.0, vBH, uTransTip );
        float _edge = 1.0 - abs( dot( normalize( vBladeN ), _L ) );
        float _sh   = mix( 1.0, _shadow, uTransShadow );

        vec3 _trans = uTransColor * uSunColor * uTransStrength
                    * _back * _thin * _edge * _sh;

        gl_FragColor.rgb += _trans;
      }`
    );
  };

  return mat;
}

// ── Flower Materials ───────────────────────────────────────────
const FLOWER_VERTEX_HEADER =
  FLOWER_WIND_UNIFORMS + GROUND_MASK_UNIFORMS + GROUND_MASK_GLSL;

export function makeFlowerMaterial(tex, flu, dirt) {
  const hasMask = { value: tex.uFlowerMask.value ? 1.0 : 0.0 };

  const mat = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    transparent: false,
    depthWrite: true,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tex, flu, dirt, { uHasFlowerMask: hasMask });

    shader.vertexShader = FLOWER_VERTEX_HEADER + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      FLOWER_WIND_VERTEX
    );

    shader.fragmentShader = FLOWER_UNIFORMS + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec4 diffuseColor = vec4( diffuse, opacity );',
      FLOWER_DIFFUSE
    );
  };

  return mat;
}

export function makeFlowerDepthMaterial(tex, flu, dirt) {
  const hasMask = { value: tex.uFlowerMask.value ? 1.0 : 0.0 };

  const mat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    side: THREE.DoubleSide,
  });

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tex, flu, dirt, { uHasFlowerMask: hasMask });

    shader.vertexShader = FLOWER_VERTEX_HEADER + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      FLOWER_WIND_VERTEX
    );

    shader.fragmentShader =
      `varying vec2 vFlUv;
      uniform sampler2D uFlowerMask;
      uniform float uHasFlowerMask;\n` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      if ( uHasFlowerMask > 0.5 ) {
        if ( texture2D( uFlowerMask, vFlUv ).r < 0.48 ) discard;
      } else {
        vec2 p = vFlUv - vec2(0.5, 0.65);
        float r = length(p);
        float a = atan(p.y, p.x);
        float petal = 0.28 + 0.12 * cos(a * 5.0);
        if (vFlUv.y > 0.25 && r > petal) discard;
        if (vFlUv.y <= 0.25 && abs(vFlUv.x - 0.5) > 0.04) discard;
      }`
    );
  };

  return mat;
}

// ── Surface Sampler (Area-Weighted Triangle Sampling) ──────────
export function seededLcg(seed) {
  let s = (seed * 1664525 + 1013904223) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function buildSurfaceSampler(mesh) {
  const pos = mesh.geometry.attributes.position;
  const idx = mesh.geometry.index;
  const mw  = mesh.matrixWorld;

  const verts = [];
  const cumArea = [];
  let totalArea = 0;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();

  const triCount = idx ? idx.count / 3 : pos.count / 3;
  for (let f = 0; f < triCount; f++) {
    const i0 = idx ? idx.getX(f * 3) : f * 3;
    const i1 = idx ? idx.getX(f * 3 + 1) : f * 3 + 1;
    const i2 = idx ? idx.getX(f * 3 + 2) : f * 3 + 2;

    a.fromBufferAttribute(pos, i0).applyMatrix4(mw);
    b.fromBufferAttribute(pos, i1).applyMatrix4(mw);
    c.fromBufferAttribute(pos, i2).applyMatrix4(mw);

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    n.crossVectors(ab, ac);
    const dbl = n.length();
    if (dbl < 1e-8) continue;

    totalArea += dbl * 0.5;
    cumArea.push(totalArea);
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }

  return { verts, cumArea, totalArea };
}

export function samplePoint(s, rng, out) {
  const r = rng() * s.totalArea;
  let lo = 0;
  let hi = s.cumArea.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.cumArea[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  const t = lo * 9;

  let u = rng();
  let v = rng();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  const w = 1 - u - v;

  return out.set(
    s.verts[t] * w + s.verts[t + 3] * u + s.verts[t + 6] * v,
    s.verts[t + 1] * w + s.verts[t + 4] * u + s.verts[t + 7] * v,
    s.verts[t + 2] * w + s.verts[t + 5] * u + s.verts[t + 8] * v
  );
}

// ── Flower Cross-Billboard Geometry ────────────────────────────
export function createCrossBillboardFlowerGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0); // anchor at base
  return geo;
}

// ── Texture Loading Helper ─────────────────────────────────────
export function loadFlowerTextures(textureLoader, basePath = '/assets/textures/flower/') {
  const loadSafe = (file) => {
    const tex = textureLoader.load(basePath + file, (t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }, undefined, () => {
      console.log(`[GrassBuilder] Texture ${file} fallback mode active.`);
    });
    return tex;
  };

  return {
    uFlowerMask:     { value: loadSafe('flowers.png') },
    uFlowerRGB:      { value: loadSafe('flowersRGB.png') },
    uFlowerGradient: { value: loadSafe('flowersGradient.png') },
  };
}

export function loadBarkTextures(textureLoader, basePath = '/assets/textures/bark/') {
  const loadSafe = (file, isColor = false) => {
    const tex = textureLoader.load(basePath + file, (t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      if (isColor && THREE.SRGBColorSpace) {
        t.colorSpace = THREE.SRGBColorSpace;
      }
      t.needsUpdate = true;
    }, undefined, () => {
      console.log(`[GrassBuilder] Texture ${file} fallback mode.`);
    });
    return tex;
  };

  return {
    uBarkColorMap:  { value: loadSafe('bark_color.png', true) },
    uBarkAOMap:     { value: loadSafe('bark_AO.png', false) },
    uBarkHeightMap: { value: loadSafe('bark_height.png', false) },
  };
}

export class GrassBuilder {
  constructor(uniformBag) {
    this.uniforms = uniformBag;
    // Multi-blade clump geometry for authentic dense grass coverage
    this.bladeGeo = makeClumpBladeGeometry(6, 3);
    this.singleBladeGeo = makeBladeGeometry(3);
    this.flowerQuadGeo = createCrossBillboardFlowerGeometry();

    const texLoader = new THREE.TextureLoader();
    this.texA = loadFlowerTextures(texLoader, '/assets/textures/flower/');
    this.texB = loadFlowerTextures(texLoader, '/assets/textures/flower3/');
    this.barkTex = loadBarkTextures(texLoader, '/assets/textures/bark/');

    // Connect loaded textures to uniform bag
    this.uniforms.flowerTexA.uFlowerMask.value     = this.texA.uFlowerMask.value;
    this.uniforms.flowerTexA.uFlowerRGB.value      = this.texA.uFlowerRGB.value;
    this.uniforms.flowerTexA.uFlowerGradient.value = this.texA.uFlowerGradient.value;

    this.uniforms.flowerTexB.uFlowerMask.value     = this.texB.uFlowerMask.value;
    this.uniforms.flowerTexB.uFlowerRGB.value      = this.texB.uFlowerRGB.value;
    this.uniforms.flowerTexB.uFlowerGradient.value = this.texB.uFlowerGradient.value;

    if (this.uniforms.bark) {
      this.uniforms.bark.uBarkColorMap.value  = this.barkTex.uBarkColorMap.value;
      this.uniforms.bark.uBarkAOMap.value     = this.barkTex.uBarkAOMap.value;
      this.uniforms.bark.uBarkHeightMap.value = this.barkTex.uBarkHeightMap.value;
    }

    // Compiled materials shared across all chunk instances
    this.bladeMaterial = makeBladeMaterial(this.uniforms.surface);

    this.flowerMatA = makeFlowerMaterial(this.texA, this.uniforms.flower, this.uniforms.surface);
    this.flowerMatB = makeFlowerMaterial(this.texB, this.uniforms.flower, this.uniforms.surface);

    this.flowerDepthMatA = makeFlowerDepthMaterial(this.texA, this.uniforms.flower, this.uniforms.surface);
    this.flowerDepthMatB = makeFlowerDepthMaterial(this.texB, this.uniforms.flower, this.uniforms.surface);
  }
}
