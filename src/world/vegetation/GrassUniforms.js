import * as THREE from 'three';

export const MAX_ROCKS = 24;
export const MAX_SHADOW_TAPS = 4;

/**
 * Creates the complete shared uniform bag driving terrain ground, grass blades,
 * flowers, and tree canopies.
 */
export function createGrassFieldUniforms() {
  const rocks = Array.from({ length: MAX_ROCKS }, () => new THREE.Vector4());

  const uniforms = {
    surface: {
      uTime: { value: 0 },

      // Wind
      uWindStrength: { value: 0.35 },
      uWindSpeed:    { value: 1.4 },
      uWindFreq:     { value: 0.35 },
      uWindTurb:     { value: 0.25 },
      uWindLean:     { value: 0.45 },
      uWindDir:      { value: new THREE.Vector2(0.8, 0.6).normalize() },

      // Blade Colors & Gradient
      uGrassBottom:  { value: new THREE.Color('#386b16') },
      uGrassTop:     { value: new THREE.Color('#78b024') },
      uBrightness:   { value: 0.85 },
      uGradStart:    { value: 0.12 },
      uGradEnd:      { value: 1.0 },
      uGradPower:    { value: 1.5 },

      // Environmental Patches (macro lush -> dry noise drift)
      uPatchLush:     { value: new THREE.Color('#5f8f20') },
      uPatchDry:      { value: new THREE.Color('#b89d42') },
      uPatchStrength: { value: 0.35 },
      uPatchScale:    { value: 0.04 },
      uPatchBias:     { value: 1.5 },

      // Soft Per-Blade Shadow Ring
      uShadowStrength: { value: 0.65 },
      uShadowSamples:  { value: 4 },
      uShadowSampleY:  { value: 0.35 },
      uShadowRadius:   { value: 0.32 },

      // Dirt Colormap (sampled by ground, blades, and flowers alike)
      uDirtColor:    { value: new THREE.Color('#947952') },
      uDirtScale:    { value: 0.05 },
      uDirtCoverage: { value: 0.28 },
      uDirtSoftness: { value: 0.08 },
      uDirtWarp:     { value: 0.22 },
      uDirtCut:      { value: 0.95 },
      uDirtBlend:    { value: 0.85 },

      // Rock Trampling (Blades bend and splay away from rocks)
      uRocks:          { value: rocks },
      uRockCount:      { value: 0 },
      uRockRadiusMul:  { value: 1.15 },
      uRockFalloff:    { value: 0.6 },
      uRockFlatten:    { value: 0.85 },
      uRockBend:       { value: 0.35 },

      // Translucency (Subsurface Backlight Glow for Golden-Hour Sun Angles)
      uSunDir:        { value: new THREE.Vector3(-0.3, 0.85, -0.3).normalize() },
      uSunColor:      { value: new THREE.Color(1.0, 0.95, 0.85) },
      uTransColor:    { value: new THREE.Color('#cbf051') },
      uTransStrength: { value: 1.8 },
      uTransPower:    { value: 2.8 },
      uTransTip:      { value: 0.65 },
      uTransShadow:   { value: 1.0 },

      // Debug switches
      uDebugChannel: { value: 0 },
      uWindFixLocal: { value: 1 },

      // Ground specifics (matches blade bottom & adds micro grain/relief)
      uTintFloor:         { value: 1 },
      uFlatFloorNormal:   { value: 1 },
      uGndVarColor:       { value: new THREE.Color('#b59365') },
      uGndVarScale:       { value: 0.12 },
      uGndVarStrength:    { value: 0.75 },
      uGndGrainScale:     { value: 1.2 },
      uGndGrainStrength:  { value: 0.6 },
      uGndReliefScale:    { value: 0.08 },
      uGndReliefStrength: { value: 0.15 },

      // Tree Canopy / Pine Foliage specifics
      uLeafBottom:       { value: new THREE.Color('#1c3b23') },
      uLeafTop:          { value: new THREE.Color('#5c8338') },
      uLeafBrightness:   { value: 1.05 },
      uLeafGradPower:    { value: 1.1 },
      uLeafVarColor:     { value: new THREE.Color('#1e4430') },
      uLeafVarStrength:  { value: 0.5 },
      uLeafVarScale:     { value: 0.35 },
      uLeafWindStrength: { value: 0.15 },
      uLeafFlutterAmp:   { value: 0.30 },
      uLeafFlutterSpeed: { value: 3.0 },
      uLeafDip:          { value: 0.22 },
    },

    flower: {
      uColorR:       { value: new THREE.Color('#e04848') }, // Poppy red
      uColorG:       { value: new THREE.Color('#eab308') }, // Dandelion gold
      uColorB:       { value: new THREE.Color('#a855f7') }, // Lavender violet
      uColorStem:    { value: new THREE.Color('#4c731e') }, // Stem green
      uGrassColor:   { value: new THREE.Color('#386b16') },
      uBrightness:   { value: 1.0 },
      uTime:         { value: 0 },
      uWindStrength: { value: 0.22 },
      uWindSpeed:    { value: 1.4 },
      uWindFreq:     { value: 0.35 },
      uWindTurb:     { value: 0.2 },
      uWindLean:     { value: 0.3 },
      uWindDir:      { value: new THREE.Vector2(0.8, 0.6).normalize() },
      uBendAmp:      { value: 0.14 },
      uBendFreq:     { value: 2.8 },
      uFlDirtMax:    { value: 0.25 }, // Culls flowers on dirt patches
    },

    flowerTexA: {
      uFlowerMask:     { value: null },
      uFlowerRGB:      { value: null },
      uFlowerGradient: { value: null },
    },

    flowerTexB: {
      uFlowerMask:     { value: null },
      uFlowerRGB:      { value: null },
      uFlowerGradient: { value: null },
    },

    bark: {
      uBarkColorMap:     { value: null },
      uBarkAOMap:        { value: null },
      uBarkHeightMap:    { value: null },
      uBarkScale:        { value: 1.0 },
      uBarkTint:         { value: new THREE.Color('#554030') },
      uBarkTintStrength: { value: 0.6 },
      uBarkSaturation:   { value: 0.6 },
      uBarkBrightness:   { value: 0.8 },
      uBarkAOStrength:   { value: 0.85 },
      uBarkRelief:       { value: 0.8 },
    },
  };

  return uniforms;
}

// ── Preset Definitions ─────────────────────────────────────────
export const STYLIZED_PRESETS = {
  default: {
    label: 'Spring Meadow',
    values: {
      uGrassBottom: '#386b16',
      uGrassTop: '#78b024',
      uGradStart: 0.12,
      uGradEnd: 1.0,
      uGradPower: 1.5,
      uBrightness: 0.85,
      uDirtColor: '#947952',
      uDirtCoverage: 0.28,
      uDirtScale: 0.05,
      uDirtSoftness: 0.08,
      uDirtCut: 0.95,
      uDirtBlend: 0.85,
      uGndVarColor: '#b59365',
      uGndVarStrength: 0.75,
      uTransColor: '#cbf051',
      uTransStrength: 1.8,
      uWindStrength: 0.35,
      uWindSpeed: 1.4,
      uLeafBottom: '#1c3b23',
      uLeafTop: '#5c8338',
      uColorR: '#e04848',
      uColorG: '#eab308',
      uColorB: '#a855f7',
    },
  },

  goldenHour: {
    label: 'Golden Hour',
    values: {
      uGrassBottom: '#465912',
      uGrassTop: '#a4b322',
      uGradStart: 0.10,
      uGradEnd: 0.95,
      uGradPower: 1.3,
      uBrightness: 0.92,
      uDirtColor: '#966d3a',
      uDirtCoverage: 0.32,
      uDirtScale: 0.045,
      uDirtSoftness: 0.09,
      uDirtCut: 0.90,
      uDirtBlend: 0.88,
      uGndVarColor: '#c48f4b',
      uGndVarStrength: 0.80,
      uTransColor: '#ffee55',
      uTransStrength: 3.2,
      uWindStrength: 0.42,
      uWindSpeed: 1.6,
      uLeafBottom: '#2d4414',
      uLeafTop: '#8da62b',
      uColorR: '#f43f5e',
      uColorG: '#f59e0b',
      uColorB: '#d946ef',
    },
  },

  autumn: {
    label: 'Autumn Countryside',
    values: {
      uGrassBottom: '#6a6b18',
      uGrassTop: '#c8b628',
      uGradStart: 0.14,
      uGradEnd: 1.0,
      uGradPower: 1.4,
      uBrightness: 0.88,
      uDirtColor: '#ad7e34',
      uDirtCoverage: 0.40,
      uDirtScale: 0.04,
      uDirtSoftness: 0.10,
      uDirtCut: 0.80,
      uDirtBlend: 0.92,
      uGndVarColor: '#c79446',
      uGndVarStrength: 0.85,
      uTransColor: '#f7d040',
      uTransStrength: 2.6,
      uWindStrength: 0.45,
      uWindSpeed: 1.8,
      uLeafBottom: '#b45309',
      uLeafTop: '#ea580c',
      uColorR: '#f97316',
      uColorG: '#facc15',
      uColorB: '#e11d48',
    },
  },

  mars: {
    label: 'Alien Red Planet (Mars)',
    values: {
      uGrassBottom: '#8f2f18',
      uGrassTop: '#e659b8',
      uGradStart: 0.10,
      uGradEnd: 0.80,
      uGradPower: 1.8,
      uBrightness: 0.95,
      uDirtColor: '#4f7d9c',
      uDirtCoverage: 0.38,
      uDirtScale: 0.035,
      uDirtSoftness: 0.12,
      uDirtCut: 1.0,
      uDirtBlend: 0.90,
      uGndVarColor: '#7c59a3',
      uGndVarStrength: 0.90,
      uTransColor: '#ffffff',
      uTransStrength: 2.5,
      uWindStrength: 0.50,
      uWindSpeed: 2.4,
      uLeafBottom: '#7c2d12',
      uLeafTop: '#ec4899',
      uColorR: '#06b6d4',
      uColorG: '#f43f5e',
      uColorB: '#8b5cf6',
    },
  },
};

/**
 * Applies a preset over the uniform bag, resetting to 'default' baseline first
 * so no values linger unexpectedly when switching looks.
 */
export function applyStylizedPreset(uniformBag, presetKey) {
  const target = STYLIZED_PRESETS[presetKey] || STYLIZED_PRESETS.default;
  const baseline = STYLIZED_PRESETS.default.values;
  const targetValues = target.values;

  const merged = { ...baseline, ...targetValues };

  for (const [key, val] of Object.entries(merged)) {
    // Check surface uniforms
    if (uniformBag.surface[key]) {
      if (typeof val === 'string' && val.startsWith('#')) {
        uniformBag.surface[key].value.set(val);
      } else {
        uniformBag.surface[key].value = val;
      }
    }
    // Check flower uniforms
    if (uniformBag.flower[key]) {
      if (typeof val === 'string' && val.startsWith('#')) {
        uniformBag.flower[key].value.set(val);
      } else {
        uniformBag.flower[key].value = val;
      }
    }
  }
}
