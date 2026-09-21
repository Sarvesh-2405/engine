import { MAX_ROCKS, MAX_SHADOW_TAPS } from './GrassUniforms.js';

// ── Ground Dirt Mask GLSL ──────────────────────────────────────
export const GROUND_MASK_UNIFORMS = /* glsl */ `
  uniform vec3  uDirtColor;
  uniform float uDirtScale;      // patch size (world units⁻¹)
  uniform float uDirtCoverage;   // 0 = no dirt, 1 = all dirt
  uniform float uDirtSoftness;   // width of the grass→dirt transition
  uniform float uDirtWarp;       // domain warp — breaks up round blobs
`;

export const GROUND_MASK_GLSL = /* glsl */ `
  float _gmHash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  float _gmNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(_gmHash(i),                  _gmHash(i + vec2(1.0, 0.0)), u.x),
      mix(_gmHash(i + vec2(0.0, 1.0)), _gmHash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float _gmFbm(vec2 p) {
    float v = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 4; i++) {
      v += a * _gmNoise(p);
      n += a;
      p = p * 2.03 + vec2(3.1, 7.7);
      a *= 0.5;
    }
    return v / max(n, 0.001);
  }

  float groundDirt(vec2 worldXZ) {
    vec2 p = worldXZ * uDirtScale;
    if (uDirtWarp > 0.001) {
      vec2 w = vec2(_gmFbm(p + vec2(11.3, 2.7)), _gmFbm(p + vec2(5.9, 17.1)));
      p += (w - 0.5) * uDirtWarp;
    }
    float n = _gmFbm(p);
    float threshold = 1.0 - uDirtCoverage;
    return smoothstep(threshold - uDirtSoftness, threshold + uDirtSoftness, n);
  }
`;

// ── Grass Blade Vertex GLSL ────────────────────────────────────
export const GRASS_BLADE_UNIFORMS = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  uniform float uWindSpeed;
  uniform float uWindFreq;
  uniform float uWindTurb;
  uniform float uWindLean;
  uniform vec2  uWindDir;

  varying float vBH;        // blade height [0 = base, 1 = tip], after shrinking
  varying vec3  vWorldPos;
  varying vec3  vBladeN;    // real world facing normal for translucency
  varying float vDirt;      // sampled once at base
  varying float vPatch;     // large-scale environmental lush->dry drift
  uniform float uPatchScale;
  varying float vRockInfl;

  uniform float uWindFixLocal;
  uniform float uDirtCut;        // blade shortening over dirt
  uniform float uShadowSampleY;  // height up the blade the shadow kernel sits at
  uniform float uShadowRadius;   // world-space radius of the soft-shadow kernel

  #ifdef USE_SHADOWMAP
    varying vec4 vGrassShCoord[ ${MAX_SHADOW_TAPS} ];
  #endif

  uniform vec4  uRocks[ ${MAX_ROCKS} ];
  uniform int   uRockCount;
  uniform float uRockRadiusMul;
  uniform float uRockFalloff;
  uniform float uRockFlatten;
  uniform float uRockBend;
`;

export const GRASS_BLADE_VERTEX = /* glsl */ `
  #include <begin_vertex>

  #ifdef USE_INSTANCING
    vec2 baseXZ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  #else
    vec2 baseXZ = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  #endif

  vDirt  = groundDirt(baseXZ);
  vPatch = _gmFbm(baseXZ * uPatchScale);

  // ── Rock Trampling (Blades flatten and splay outward) ─────
  float rockInfl = 0.0;
  vec2  rockAway = vec2(1.0, 0.0);
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    if (i >= uRockCount) break;
    vec4  rock = uRocks[i];
    vec2  d    = baseXZ - rock.xz;
    float dist = length(d);
    float rad  = rock.w * uRockRadiusMul;
    float infl = 1.0 - smoothstep(rad, rad + uRockFalloff, dist);
    if (infl > rockInfl) {
      rockInfl = infl;
      rockAway = dist > 1e-4 ? d / dist : vec2(1.0, 0.0);
    }
  }
  vRockInfl = rockInfl;

  // Thin out over dirt and press down under boulders
  float shrink = (1.0 - uDirtCut * vDirt) * (1.0 - uRockFlatten * rockInfl);
  transformed.y *= shrink;

  vBH = position.y * shrink;
  float hMask = vBH * vBH;

  #ifdef USE_INSTANCING
    vec3 wPos = (instanceMatrix * vec4(position, 1.0)).xyz;
    vWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;

    mat3 instRot = mat3(
      normalize(vec3(instanceMatrix[0])),
      normalize(vec3(instanceMatrix[1])),
      normalize(vec3(instanceMatrix[2]))
    );
  #else
    vec3 wPos = (modelMatrix * vec4(position, 1.0)).xyz;
    vWorldPos = wPos;
    mat3 instRot = mat3(1.0);
  #endif

  float primary = sin(dot(wPos.xz, uWindDir) * uWindFreq + uTime * uWindSpeed);
  float second  = sin(dot(wPos.xz, uWindDir) * uWindFreq * 2.6 + uTime * uWindSpeed * 1.8 + 1.3) * 0.35;
  vec2  perp    = vec2(-uWindDir.y, uWindDir.x);
  float turb    = sin(dot(wPos.xz, perp) * uWindFreq * 1.9 + uTime * uWindSpeed * 0.7 + 2.6) * uWindTurb;
  float swing   = (primary + second + turb) * uWindStrength * hMask;
  float lean    = uWindLean * hMask;

  vec3 windWrong = vec3(uWindDir.x, 0.0, uWindDir.y);
  vec3 windRight = transpose(instRot) * windWrong;
  vec3 windLocal = mix(windWrong, windRight, uWindFixLocal);
  transformed += windLocal * (swing + lean);

  // Splay tips outward from boulder center
  if (rockInfl > 0.001) {
    vec3 awayLocal = transpose(instRot) * vec3(rockAway.x, 0.0, rockAway.y);
    transformed += awayLocal * (uRockBend * rockInfl * hMask);
  }

  vBladeN = normalize(mat3(modelMatrix) * instRot * normal);
`;

export const GRASS_SHADOW_VERTEX = /* glsl */ `
  // Disable Lambert built-in point-shadow sample by moving coordinate outside frustum
  #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )
    vec4 worldPosition = vec4( 1e6, 1e6, 1e6, 1.0 );
  #endif

  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    #ifdef USE_INSTANCING
      vec3 _shBase = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      vec3 _shTip  = ( modelMatrix * instanceMatrix * vec4( 0.0, 1.0, 0.0, 1.0 ) ).xyz;
    #else
      vec3 _shBase = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      vec3 _shTip  = ( modelMatrix * vec4( 0.0, 1.0, 0.0, 1.0 ) ).xyz;
    #endif
    vec3 _shCenter = mix( _shBase, _shTip, uShadowSampleY );

    // Per-blade pseudo-random rotation of the sampling ring
    float _rot = fract( sin( dot( _shBase.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;

    // Multi-tap ring in world XZ for smooth penumbra
    for ( int _k = 0; _k < ${MAX_SHADOW_TAPS}; _k++ ) {
      float _a   = _rot + 6.2831853 * ( float( _k ) + 0.5 ) / float( ${MAX_SHADOW_TAPS} );
      vec2  _off = vec2( cos( _a ), sin( _a ) ) * uShadowRadius;
      vGrassShCoord[ _k ] = directionalShadowMatrix[ 0 ] * vec4( _shCenter + vec3( _off.x, 0.0, _off.y ), 1.0 );
    }
  #endif
`;

// ── Flower Shaders ─────────────────────────────────────────────
export const FLOWER_WIND_UNIFORMS = /* glsl */ `
  uniform float uTime;
  uniform float uWindStrength;
  uniform float uWindSpeed;
  uniform float uWindFreq;
  uniform float uWindTurb;
  uniform float uWindLean;
  uniform vec2  uWindDir;
  uniform float uBendAmp;
  uniform float uBendFreq;
  uniform float uFlDirtMax;
  varying vec2  vFlUv;
`;

export const FLOWER_WIND_VERTEX = /* glsl */ `
  #include <begin_vertex>
  vFlUv = uv;

  // Cull flowers on bare dirt patches
  #ifdef USE_INSTANCING
    vec2 _flBaseXZ = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  #else
    vec2 _flBaseXZ = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  #endif

  if (groundDirt(_flBaseXZ) > uFlDirtMax) {
    transformed = vec3(0.0);
  }

  float _flH = transformed.y * transformed.y;

  #ifdef USE_INSTANCING
    vec3 _flWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    mat3 _flRot = mat3(
      normalize(vec3(instanceMatrix[0])),
      normalize(vec3(instanceMatrix[1])),
      normalize(vec3(instanceMatrix[2]))
    );
    vec3 _flWindLocal = transpose(_flRot) * vec3(uWindDir.x, 0.0, uWindDir.y);
  #else
    vec3 _flWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vec3 _flWindLocal = vec3(uWindDir.x, 0.0, uWindDir.y);
  #endif

  float _flPrimary = sin(dot(_flWorld.xz, uWindDir) * uWindFreq + uTime * uWindSpeed);
  float _flSecond  = sin(dot(_flWorld.xz, uWindDir) * uWindFreq * 2.6 + uTime * uWindSpeed * 1.8 + 1.3) * 0.35;
  vec2  _flPerp    = vec2(-uWindDir.y, uWindDir.x);
  float _flTurb    = sin(dot(_flWorld.xz, _flPerp) * uWindFreq * 1.9 + uTime * uWindSpeed * 0.7 + 2.6) * uWindTurb;

  transformed += _flWindLocal * ((_flPrimary + _flSecond + _flTurb) * uWindStrength * _flH + uWindLean * _flH);
  transformed.x += sin(transformed.y * uBendFreq + uTime * uWindSpeed * 0.4 + _flWorld.x * 0.7) * uBendAmp * _flH;
`;

export const FLOWER_UNIFORMS = /* glsl */ `
  varying vec2 vFlUv;
  uniform sampler2D uFlowerMask;
  uniform sampler2D uFlowerRGB;
  uniform sampler2D uFlowerGradient;
  uniform vec3  uColorR;
  uniform vec3  uColorG;
  uniform vec3  uColorB;
  uniform vec3  uColorStem;
  uniform vec3  uGrassColor;
  uniform float uBrightness;
  uniform float uHasFlowerMask;
`;

export const FLOWER_DIFFUSE = /* glsl */ `
  // Alpha cutout discard
  if (uHasFlowerMask > 0.5) {
    if (texture2D(uFlowerMask, vFlUv).r < 0.48) discard;
  } else {
    // Procedural daisy/wildflower silhouette fallback if texture still loading
    vec2 p = vFlUv - vec2(0.5, 0.65);
    float r = length(p);
    float a = atan(p.y, p.x);
    float petal = 0.28 + 0.12 * cos(a * 5.0);
    if (vFlUv.y > 0.25 && r > petal) discard;
    if (vFlUv.y <= 0.25 && abs(vFlUv.x - 0.5) > 0.04) discard;
  }

  vec3 _fc = uColorStem;
  float _gradFade = 1.0;

  if (uHasFlowerMask > 0.5) {
    _gradFade = smoothstep(0.0, 0.6, texture2D(uFlowerGradient, vFlUv).r);
    vec3 _rgb = texture2D(uFlowerRGB, vFlUv).rgb;

    float _isR = max(0.0, _rgb.r - max(_rgb.g, _rgb.b));
    float _isG = max(0.0, _rgb.g - max(_rgb.r, _rgb.b));
    float _isB = max(0.0, _rgb.b - max(_rgb.r, _rgb.g));
    float _isW = min(_rgb.r, min(_rgb.g, _rgb.b));
    float _tot = _isR + _isG + _isB + _isW;

    _fc = _tot < 0.01 ? uColorStem :
      (_isR * uColorR + _isG * uColorG + _isB * uColorB + _isW * uColorStem) / _tot;
  } else {
    // Procedural stem vs blossom
    _gradFade = smoothstep(0.18, 0.35, vFlUv.y);
    _fc = (vFlUv.y > 0.35) ? uColorR : uColorStem;
  }

  vec3 _flCol = mix(uGrassColor, _fc, _gradFade) * uBrightness;
  vec4 diffuseColor = vec4(_flCol, opacity);
`;

// ── Pine Leaf Foliage Shader ───────────────────────────────────
export const PINE_WIND_UNIFORMS = /* glsl */ `
  uniform float uTime;
  uniform float uWindSpeed;
  uniform float uWindFreq;
  uniform vec2  uWindDir;
  uniform float uLeafWindStrength;  // 0 = still
  uniform float uLeafFlutterAmp;    // fast, small-scale shimmer on top of sway
  uniform float uLeafFlutterSpeed;
  uniform float uLeafDip;           // pendulum: canopy dips as it swings out
  uniform float uLeafYMin;
  uniform float uLeafYMax;
`;

export const PINE_WIND_VERTEX = /* glsl */ `
  #include <begin_vertex>

  float _pnT    = clamp( ( position.y - uLeafYMin ) / max( uLeafYMax - uLeafYMin, 0.001 ), 0.0, 1.0 );
  float _pnMask = _pnT * _pnT;

  #ifdef USE_INSTANCING
    vec3 _pnWorld = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;
    mat3 _pnRot = mat3(
      normalize( vec3( instanceMatrix[0] ) ),
      normalize( vec3( instanceMatrix[1] ) ),
      normalize( vec3( instanceMatrix[2] ) )
    );
  #else
    vec3 _pnWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;
    mat3 _pnRot = mat3(
      normalize( vec3( modelMatrix[0] ) ),
      normalize( vec3( modelMatrix[1] ) ),
      normalize( vec3( modelMatrix[2] ) )
    );
  #endif

  vec3 _pnWindLocal = transpose( _pnRot ) * vec3( uWindDir.x, 0.0, uWindDir.y );

  float _pnSway    = sin( dot( _pnWorld.xz, uWindDir ) * uWindFreq + uTime * uWindSpeed );
  float _pnFlutter = sin( uTime * uWindSpeed * uLeafFlutterSpeed + _pnWorld.y * 2.3 + _pnWorld.x )
                   * uLeafFlutterAmp;
  float _pnWave    = _pnSway + _pnFlutter;

  transformed += _pnWindLocal * ( _pnWave * uLeafWindStrength * _pnMask );
  transformed.y -= abs( _pnWave ) * uLeafWindStrength * _pnMask * uLeafDip;
`;

export const PINE_LEAF_FRAGMENT = /* glsl */ `
  #include <map_fragment>
  {
    float _t = clamp( ( vLeafLocal.y - uLeafYMin ) / max( uLeafYMax - uLeafYMin, 0.001 ), 0.0, 1.0 );
    _t = pow( _t, uLeafGradPower );
    vec3 _leaf = mix( uLeafBottom, uLeafTop, _t );
    float _n = _lfNoise( vLeafWorld * uLeafVarScale ) - 0.5;
    _leaf += ( uLeafVarColor - _leaf ) * _n * uLeafVarStrength;
    diffuseColor.rgb = max( _leaf, vec3( 0.0 ) ) * uLeafBrightness;
  }
`;

// ── Bark Material Shaders ──────────────────────────────────────
export const BARK_UNIFORMS = /* glsl */ `
  varying vec2 vBarkUv;
  uniform sampler2D uBarkColorMap;
  uniform sampler2D uBarkAOMap;
  uniform sampler2D uBarkHeightMap;
  uniform float uBarkScale;
  uniform vec3  uBarkTint;
  uniform float uBarkTintStrength;
  uniform float uBarkSaturation;
  uniform float uBarkBrightness;
  uniform float uBarkAOStrength;
  uniform float uBarkRelief;
`;

export const BARK_NORMAL_RELIEF = /* glsl */ `
  #include <normal_fragment_begin>
  if ( uBarkRelief > 0.001 ) {
    float _bh = texture2D( uBarkHeightMap, vBarkUv * uBarkScale ).r;
    normal = normalize( normal - uBarkRelief * vec3( dFdx( _bh ), dFdy( _bh ), 0.0 ) );
  }
`;

export const BARK_FRAGMENT = /* glsl */ `
  #include <map_fragment>
  {
    vec2 _buv  = vBarkUv * uBarkScale;
    vec3 _bark = texture2D( uBarkColorMap, _buv ).rgb;

    float _luma = dot( _bark, vec3( 0.2126, 0.7152, 0.0722 ) );
    _bark = mix( vec3( _luma ), _bark, uBarkSaturation );
    _bark = mix( _bark, _bark * uBarkTint, uBarkTintStrength );

    float _ao = texture2D( uBarkAOMap, _buv ).r;
    _bark *= mix( 1.0, _ao, uBarkAOStrength );

    diffuseColor.rgb = _bark * uBarkBrightness;
  }
`;
