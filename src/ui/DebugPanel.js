import { Pane } from 'tweakpane';
import * as THREE from 'three';
import { applyStylizedPreset } from '../world/vegetation/GrassUniforms.js';
import {
  MAT_TRUNK,
  MAT_PINE_TIER1, MAT_PINE_TIER2, MAT_PINE_TIER3, MAT_PINE_TIER4,
  MAT_OAK_MAIN, MAT_OAK_CLUSTER, MAT_OAK_TOP,
  MAT_AUTUMN_MAIN, MAT_AUTUMN_CLUSTER, MAT_AUTUMN_TOP
} from '../world/vegetation/TreeBuilder.js';
import { MAT_GRANITE, MAT_SANDSTONE, MAT_MOSSY_ROCK, MAT_PEBBLE } from '../world/vegetation/RockBuilder.js';

export class DebugPanel {
  constructor(app) {
    this.app = app;
    this.visible = false; // Hidden by default

    // Create container for Tweakpane with custom styling
    this.container = document.createElement('div');
    this.container.id = 'tweakpane-container';
    this.container.style.position = 'fixed';
    this.container.style.top = '12px';
    this.container.style.right = '12px';
    this.container.style.zIndex = '10000';
    this.container.style.maxHeight = '92vh';
    this.container.style.overflowY = 'auto';
    this.container.style.borderRadius = '12px';
    this.container.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.65)';
    this.container.style.backdropFilter = 'blur(16px)';
    this.container.style.webkitBackdropFilter = 'blur(16px)';
    this.container.style.display = 'none'; // Hidden by default
    document.body.appendChild(this.container);

    this.pane = new Pane({
      container: this.container,
      title: '🏎️ Real-Time Engine Debug Panel',
      expanded: true,
    });

    this._folderControllers = new Map();
    this._defaultStates = new Map();

    this._initPresets();
    this._buildUI();
    this._setupKeybindings();
  }

  toggle() {
    this.visible = !this.visible;
    this.container.style.display = this.visible ? 'block' : 'none';
  }

  show() {
    this.visible = true;
    this.container.style.display = 'block';
  }

  hide() {
    this.visible = false;
    this.container.style.display = 'none';
  }

  _setupKeybindings() {
    window.addEventListener('keydown', (e) => {
      // Toggle with ~ (Backquote) or P (when not typing in an input)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === '`' || e.key === '~' || e.key.toLowerCase() === 'p') {
        this.toggle();
      }
    });
  }

  // ── Preset Library ──────────────────────────────────────────
  _initPresets() {
    this.presets = {
      'Default F1': null, // Captured after UI build
      'Anime Meadow (Ghibli)': {
        'Grass & Wildflowers': {
          enabled: true,
          density: 120,
          rootColor: '#1b4a1c',
          tipColor: '#88d948',
          windStrength: 1.4,
          windSpeed: 3.2,
        },
        'Weather & Atmosphere': {
          preset: 'daylight',
          sunIntensity: 1.8,
          fogDensity: 0.00035,
          fogColor: '#c2e4f8',
        },
        'Post-Processing': {
          bloomEnabled: true,
          bloomStrength: 0.55,
          bloomThreshold: 0.78,
        },
      },
      'Cyberpunk Night': {
        'Weather & Atmosphere': {
          preset: 'night',
          sunIntensity: 0.05,
          fogDensity: 0.0009,
          fogColor: '#070b1a',
        },
        'Lighting & Shadows': {
          headlightIntensity: 35.0,
          roadFloodIntensity: 22.0,
        },
        'Post-Processing': {
          bloomEnabled: true,
          bloomStrength: 0.95,
          bloomThreshold: 0.52,
          exposure: 1.1,
        },
      },
      'Golden Hour Drift': {
        'Weather & Atmosphere': {
          preset: 'sunset',
          sunIntensity: 2.2,
          fogColor: '#d66a28',
          fogDensity: 0.0007,
        },
        'Car Physics': {
          onRoadGrip: 0.88,
          handbrakeGrip: 0.55,
          accelerationForce: 95.0,
        },
        'Post-Processing': {
          bloomEnabled: true,
          bloomStrength: 0.65,
          bloomThreshold: 0.72,
        },
      },
      'High-Grip F1 Track': {
        'Car Physics': {
          baseMaxSpeed: 95.0,
          boostMaxSpeed: 110.0,
          accelerationForce: 105.0,
          brakeForce: 130.0,
          onRoadGrip: 0.99,
          steerSpeed: 8.5,
        },
        'Road & Spline': {
          roadWidth: 11.0,
          barrierMode: 'all',
          maxBanking: 0.10,
        },
      },
    };
  }

  _buildUI() {
    const app = this.app;

    // ── Global Tools (Presets, Save/Load, Global Reset) ───────
    const globalFolder = this.pane.addFolder({ title: '⚡ Global Presets & Tools', expanded: true });

    const presetParams = { selectPreset: 'Default F1' };
    globalFolder.addBinding(presetParams, 'selectPreset', {
      label: 'Curated Look',
      options: {
        'Default F1': 'Default F1',
        'Anime Meadow (Ghibli)': 'Anime Meadow (Ghibli)',
        'Cyberpunk Night': 'Cyberpunk Night',
        'Golden Hour Drift': 'Golden Hour Drift',
        'High-Grip F1 Track': 'High-Grip F1 Track',
      },
    }).on('change', (ev) => {
      this._applyPreset(ev.value);
    });

    globalFolder.addButton({ title: '💾 Save Preset (Export JSON)' }).on('click', () => this.savePreset());
    globalFolder.addButton({ title: '📂 Load Preset (Import JSON)' }).on('click', () => this.loadPreset());
    globalFolder.addButton({ title: '🔄 Reset All Defaults' }).on('click', () => this.resetAll());

    // ── 1. TERRAIN FOLDER (Starts Expanded) ───────────────────
    try { this._buildTerrainFolder(); } catch (e) { console.error('Error building Terrain folder:', e); }

    // ── 2. CAR PHYSICS FOLDER (Starts Expanded) ───────────────
    try { this._buildCarPhysicsFolder(); } catch (e) { console.error('Error building Car Physics folder:', e); }

    // ── 3. GRASS & WILDFLOWERS FOLDER (Collapsed) ─────────────
    try { this._buildGrassFolder(); } catch (e) { console.error('Error building Grass folder:', e); }

    // ── 4. TREES & PROPS FOLDER (Collapsed) ───────────────────
    try { this._buildTreesFolder(); } catch (e) { console.error('Error building Trees folder:', e); }

    // ── 5. WATER FOLDER (Collapsed) ───────────────────────────
    try { this._buildWaterFolder(); } catch (e) { console.error('Error building Water folder:', e); }

    // ── 6. ROAD & SPLINE FOLDER (Collapsed) ───────────────────
    try { this._buildRoadFolder(); } catch (e) { console.error('Error building Road folder:', e); }

    // ── 7. CAR VISUALS FOLDER (Collapsed) ─────────────────────
    try { this._buildCarVisualsFolder(); } catch (e) { console.error('Error building Car Visuals folder:', e); }

    // ── 8. WEATHER & ATMOSPHERE FOLDER (Collapsed) ────────────
    try { this._buildAtmosphereFolder(); } catch (e) { console.error('Error building Atmosphere folder:', e); }

    // ── 9. LIGHTING & SHADOWS FOLDER (Collapsed) ──────────────
    try { this._buildLightingFolder(); } catch (e) { console.error('Error building Lighting folder:', e); }

    // ── 10. POST-PROCESSING FOLDER (Collapsed) ────────────────
    try { this._buildPostProcessingFolder(); } catch (e) { console.error('Error building Post-Processing folder:', e); }

    // ── 11. CAMERA FOLDER (Collapsed) ─────────────────────────
    try { this._buildCameraFolder(); } catch (e) { console.error('Error building Camera folder:', e); }

    // ── 12. AUDIO FOLDER (Collapsed) ──────────────────────────
    try { this._buildAudioFolder(); } catch (e) { console.error('Error building Audio folder:', e); }

    // Capture initial state as default
    this._captureDefaults();
  }

  // ── 1. Terrain Folder ───────────────────────────────────────
  _buildTerrainFolder() {
    const tm = this.app.terrainManager;
    const folder = this.pane.addFolder({ title: '🏔️ Terrain', expanded: true });

    const params = {
      chunkRadius: tm.chunkRadius || 3,
      roughness: (tm.terrainMaterial && tm.terrainMaterial.roughness !== undefined) ? tm.terrainMaterial.roughness : 0.8,
      metalness: (tm.terrainMaterial && tm.terrainMaterial.metalness !== undefined) ? tm.terrainMaterial.metalness : 0.05,
      waterLevel: 1.2,
      beachColor: '#d4b483',
      valleyColor: '#4a9e3f',
      midSlopeColor: '#3d8c35',
      highSlopeColor: '#7ab648',
      hilltopColor: '#6b9e40',
      rockColor: '#8a7d68',
      rebuildTerrain: () => {
        tm.repopulateChunks();
        tm.update(this.app.vehicleController.position, 0.016);
      },
    };

    folder.addBinding(params, 'chunkRadius', { min: 2, max: 4, step: 1, label: 'Render Radius' })
      .on('change', (ev) => { tm.chunkRadius = ev.value; params.rebuildTerrain(); });

    folder.addBinding(params, 'roughness', { min: 0.0, max: 1.0, step: 0.02, label: 'Roughness' })
      .on('change', (ev) => { if (tm.terrainMaterial && tm.terrainMaterial.roughness !== undefined) tm.terrainMaterial.roughness = ev.value; });

    folder.addBinding(params, 'metalness', { min: 0.0, max: 1.0, step: 0.02, label: 'Metalness' })
      .on('change', (ev) => { if (tm.terrainMaterial && tm.terrainMaterial.metalness !== undefined) tm.terrainMaterial.metalness = ev.value; });

    const colorSub = folder.addFolder({ title: 'Terrain Palette Colors', expanded: false });
    colorSub.addBinding(params, 'beachColor', { label: 'Beach Sand' }).on('change', () => params.rebuildTerrain());
    colorSub.addBinding(params, 'valleyColor', { label: 'Valley Grass' }).on('change', () => params.rebuildTerrain());
    colorSub.addBinding(params, 'midSlopeColor', { label: 'Mid-Slope' }).on('change', () => params.rebuildTerrain());
    colorSub.addBinding(params, 'highSlopeColor', { label: 'Bright Slope' }).on('change', () => params.rebuildTerrain());
    colorSub.addBinding(params, 'hilltopColor', { label: 'Hilltop Warm' }).on('change', () => params.rebuildTerrain());
    colorSub.addBinding(params, 'rockColor', { label: 'Steep Rock' }).on('change', () => params.rebuildTerrain());

    this._addFolderButtons(folder, 'Terrain', params);
  }

  // ── 2. Car Physics Folder ───────────────────────────────────
  _buildCarPhysicsFolder() {
    const vc = this.app.vehicleController;
    const folder = this.pane.addFolder({ title: '🏎️ Car Physics', expanded: true });

    const params = {
      baseMaxSpeed: vc.baseMaxSpeed,
      boostMaxSpeed: vc.boostMaxSpeed,
      accelerationForce: vc.accelerationForce,
      brakeForce: vc.brakeForce,
      reverseForce: vc.reverseForce,
      dragCoeff: vc.dragCoeff,
      rollingFriction: vc.rollingFriction,
      maxSteerAngle: vc.maxSteerAngle,
      steerSpeed: vc.steerSpeed,
      autodrive: vc.autodriveEnabled,
    };

    folder.addBinding(params, 'autodrive', { label: '🤖 Autodrive' })
      .on('change', (ev) => { vc.setAutodrive(ev.value); });

    folder.addBinding(params, 'baseMaxSpeed', { min: 40.0, max: 130.0, step: 1.0, label: 'Top Speed (m/s)' })
      .on('change', (ev) => { vc.baseMaxSpeed = ev.value; });

    folder.addBinding(params, 'boostMaxSpeed', { min: 60.0, max: 160.0, step: 1.0, label: 'Boost Speed (m/s)' })
      .on('change', (ev) => { vc.boostMaxSpeed = ev.value; });

    folder.addBinding(params, 'accelerationForce', { min: 30.0, max: 160.0, step: 2.0, label: 'Acceleration' })
      .on('change', (ev) => { vc.accelerationForce = ev.value; });

    folder.addBinding(params, 'brakeForce', { min: 40.0, max: 200.0, step: 2.0, label: 'Brake Force' })
      .on('change', (ev) => { vc.brakeForce = ev.value; });

    folder.addBinding(params, 'reverseForce', { min: 10.0, max: 60.0, step: 1.0, label: 'Reverse Force' })
      .on('change', (ev) => { vc.reverseForce = ev.value; });

    folder.addBinding(params, 'maxSteerAngle', { min: 0.15, max: 0.65, step: 0.01, label: 'Max Steer (rad)' })
      .on('change', (ev) => { vc.maxSteerAngle = ev.value; });

    folder.addBinding(params, 'steerSpeed', { min: 2.0, max: 14.0, step: 0.2, label: 'Steer Speed' })
      .on('change', (ev) => { vc.steerSpeed = ev.value; });

    folder.addBinding(params, 'dragCoeff', { min: 0.001, max: 0.008, step: 0.0002, label: 'Aero Drag' })
      .on('change', (ev) => { vc.dragCoeff = ev.value; });

    folder.addBinding(params, 'rollingFriction', { min: 0.005, max: 0.05, step: 0.002, label: 'Friction' })
      .on('change', (ev) => { vc.rollingFriction = ev.value; });

    this._addFolderButtons(folder, 'Car Physics', params);
  }

  // ── 3. Grass & Wildflowers Folder ───────────────────────────
  _buildGrassFolder() {
    const vm = this.app.vegetationManager;
    const u = vm.uniforms;
    const folder = this.pane.addFolder({ title: '🌾 Stylized Grass & Flora', expanded: false });

    const params = {
      enabled: vm.grassEnabled,
      densityMult: vm.grassDensityMult,

      // Wind
      windStrength: u.surface.uWindStrength.value,
      windSpeed: u.surface.uWindSpeed.value,
      windFreq: u.surface.uWindFreq.value,
      windTurb: u.surface.uWindTurb.value,
      windLean: u.surface.uWindLean.value,

      // Blades Colors & Gradient
      rootColor: '#' + u.surface.uGrassBottom.value.getHexString(),
      tipColor: '#' + u.surface.uGrassTop.value.getHexString(),
      brightness: u.surface.uBrightness.value,
      gradStart: u.surface.uGradStart.value,
      gradEnd: u.surface.uGradEnd.value,
      gradPower: u.surface.uGradPower.value,

      // Macro Environmental Patches
      patchLush: '#' + u.surface.uPatchLush.value.getHexString(),
      patchDry: '#' + u.surface.uPatchDry.value.getHexString(),
      patchStrength: u.surface.uPatchStrength.value,
      patchScale: u.surface.uPatchScale.value,

      // Procedural Ground Dirt Mask
      dirtColor: '#' + u.surface.uDirtColor.value.getHexString(),
      dirtScale: u.surface.uDirtScale.value,
      dirtCoverage: u.surface.uDirtCoverage.value,
      dirtSoftness: u.surface.uDirtSoftness.value,
      dirtWarp: u.surface.uDirtWarp.value,
      dirtCut: u.surface.uDirtCut.value,
      dirtBlend: u.surface.uDirtBlend.value,
      gndReliefStrength: u.surface.uGndReliefStrength.value,

      // Subsurface Backlight Translucency Glow
      transColor: '#' + u.surface.uTransColor.value.getHexString(),
      transStrength: u.surface.uTransStrength.value,
      transPower: u.surface.uTransPower.value,
      transTip: u.surface.uTransTip.value,

      // Wildflowers
      flowerColorR: '#' + u.flower.uColorR.value.getHexString(),
      flowerColorG: '#' + u.flower.uColorG.value.getHexString(),
      flowerColorB: '#' + u.flower.uColorB.value.getHexString(),
      flowerDirtMax: u.flower.uFlDirtMax.value,

      // Rock Trampling (Bend & Splay)
      rockRadiusMul: u.surface.uRockRadiusMul.value,
      rockFalloff: u.surface.uRockFalloff.value,
      rockFlatten: u.surface.uRockFlatten.value,
      rockBend: u.surface.uRockBend.value,
    };

    // ── Season Presets Subfolder ──
    const presetFolder = folder.addFolder({ title: '🎨 Season Looks & Presets', expanded: true });
    presetFolder.addButton({ title: '🌱 Spring Meadow (Default)' }).on('click', () => {
      applyStylizedPreset(u, 'default');
      this._syncGrassParams(params);
      folder.refresh();
    });
    presetFolder.addButton({ title: '🌅 Golden Hour (Backlit Glow)' }).on('click', () => {
      applyStylizedPreset(u, 'goldenHour');
      this._syncGrassParams(params);
      folder.refresh();
    });
    presetFolder.addButton({ title: '🍂 Autumn Countryside' }).on('click', () => {
      applyStylizedPreset(u, 'autumn');
      this._syncGrassParams(params);
      folder.refresh();
    });
    presetFolder.addButton({ title: '🪐 Alien Red Planet (Mars)' }).on('click', () => {
      applyStylizedPreset(u, 'mars');
      this._syncGrassParams(params);
      folder.refresh();
    });

    folder.addBinding(params, 'enabled', { label: 'Grass Enabled' }).on('change', (ev) => {
      vm.grassEnabled = ev.value;
      this.app.terrainManager.repopulateChunks();
    });

    folder.addBinding(params, 'densityMult', { min: 0.2, max: 2.5, step: 0.1, label: 'Density Multiplier' }).on('change', (ev) => {
      vm.grassDensityMult = ev.value;
      this.app.terrainManager.repopulateChunks();
    });

    // ── Wind Subfolder ──
    const windSub = folder.addFolder({ title: '🌬️ Wind Simulation', expanded: false });
    windSub.addBinding(params, 'windStrength', { min: 0.0, max: 2.0, step: 0.02, label: 'Wind Strength' }).on('change', (ev) => {
      u.surface.uWindStrength.value = ev.value;
      u.flower.uWindStrength.value = ev.value * 0.7;
    });
    windSub.addBinding(params, 'windSpeed', { min: 0.2, max: 4.0, step: 0.1, label: 'Wind Speed' }).on('change', (ev) => {
      u.surface.uWindSpeed.value = ev.value;
      u.flower.uWindSpeed.value = ev.value;
    });
    windSub.addBinding(params, 'windFreq', { min: 0.05, max: 1.0, step: 0.02, label: 'Wave Frequency' }).on('change', (ev) => {
      u.surface.uWindFreq.value = ev.value;
      u.flower.uWindFreq.value = ev.value;
    });
    windSub.addBinding(params, 'windTurb', { min: 0.0, max: 1.0, step: 0.05, label: 'Turbulence' }).on('change', (ev) => {
      u.surface.uWindTurb.value = ev.value;
      u.flower.uWindTurb.value = ev.value;
    });
    windSub.addBinding(params, 'windLean', { min: 0.0, max: 1.2, step: 0.05, label: 'Steady Lean' }).on('change', (ev) => {
      u.surface.uWindLean.value = ev.value;
      u.flower.uWindLean.value = ev.value;
    });

    // ── Blades Subfolder ──
    const bladeSub = folder.addFolder({ title: '🌾 Blade Gradient & Lighting', expanded: false });
    bladeSub.addBinding(params, 'rootColor', { label: 'Blade Base Color' }).on('change', (ev) => {
      u.surface.uGrassBottom.value.set(ev.value);
    });
    bladeSub.addBinding(params, 'tipColor', { label: 'Blade Tip Color' }).on('change', (ev) => {
      u.surface.uGrassTop.value.set(ev.value);
    });
    bladeSub.addBinding(params, 'brightness', { min: 0.3, max: 1.8, step: 0.02, label: 'Field Brightness' }).on('change', (ev) => {
      u.surface.uBrightness.value = ev.value;
    });
    bladeSub.addBinding(params, 'gradStart', { min: 0.0, max: 0.5, step: 0.02, label: 'Gradient Start' }).on('change', (ev) => {
      u.surface.uGradStart.value = ev.value;
    });
    bladeSub.addBinding(params, 'gradEnd', { min: 0.5, max: 1.5, step: 0.05, label: 'Gradient End' }).on('change', (ev) => {
      u.surface.uGradEnd.value = ev.value;
    });
    bladeSub.addBinding(params, 'gradPower', { min: 0.5, max: 3.5, step: 0.1, label: 'Gradient Exponent' }).on('change', (ev) => {
      u.surface.uGradPower.value = ev.value;
    });

    // ── Macro Environmental Patches ──
    const patchSub = folder.addFolder({ title: '🗺️ Environmental Noise Patches', expanded: false });
    patchSub.addBinding(params, 'patchLush', { label: 'Lush Patch Color' }).on('change', (ev) => {
      u.surface.uPatchLush.value.set(ev.value);
    });
    patchSub.addBinding(params, 'patchDry', { label: 'Dry Patch Color' }).on('change', (ev) => {
      u.surface.uPatchDry.value.set(ev.value);
    });
    patchSub.addBinding(params, 'patchStrength', { min: 0.0, max: 1.0, step: 0.05, label: 'Patch Contrast' }).on('change', (ev) => {
      u.surface.uPatchStrength.value = ev.value;
    });
    patchSub.addBinding(params, 'patchScale', { min: 0.01, max: 0.2, step: 0.01, label: 'Patch Frequency' }).on('change', (ev) => {
      u.surface.uPatchScale.value = ev.value;
    });

    // ── Procedural Dirt Mask ──
    const dirtSub = folder.addFolder({ title: '🟤 Procedural Ground Dirt', expanded: false });
    dirtSub.addBinding(params, 'dirtColor', { label: 'Dirt Soil Color' }).on('change', (ev) => {
      u.surface.uDirtColor.value.set(ev.value);
    });
    dirtSub.addBinding(params, 'dirtCoverage', { min: 0.0, max: 0.8, step: 0.02, label: 'Dirt Coverage' }).on('change', (ev) => {
      u.surface.uDirtCoverage.value = ev.value;
    });
    dirtSub.addBinding(params, 'dirtScale', { min: 0.01, max: 0.2, step: 0.005, label: 'Dirt Scale' }).on('change', (ev) => {
      u.surface.uDirtScale.value = ev.value;
    });
    dirtSub.addBinding(params, 'dirtSoftness', { min: 0.01, max: 0.3, step: 0.01, label: 'Edge Softness' }).on('change', (ev) => {
      u.surface.uDirtSoftness.value = ev.value;
    });
    dirtSub.addBinding(params, 'dirtWarp', { min: 0.0, max: 0.6, step: 0.02, label: 'Domain Warp' }).on('change', (ev) => {
      u.surface.uDirtWarp.value = ev.value;
    });
    dirtSub.addBinding(params, 'dirtCut', { min: 0.0, max: 1.0, step: 0.05, label: 'Blade Shortening' }).on('change', (ev) => {
      u.surface.uDirtCut.value = ev.value;
    });
    dirtSub.addBinding(params, 'dirtBlend', { min: 0.0, max: 1.0, step: 0.05, label: 'Blade Tint Blend' }).on('change', (ev) => {
      u.surface.uDirtBlend.value = ev.value;
    });
    dirtSub.addBinding(params, 'gndReliefStrength', { min: 0.0, max: 0.6, step: 0.02, label: 'Ground Relief Bump' }).on('change', (ev) => {
      u.surface.uGndReliefStrength.value = ev.value;
    });

    // ── Translucency ──
    const transSub = folder.addFolder({ title: '✨ Backlight Translucency (Golden Hour)', expanded: false });
    transSub.addBinding(params, 'transColor', { label: 'Transmission Tint' }).on('change', (ev) => {
      u.surface.uTransColor.value.set(ev.value);
    });
    transSub.addBinding(params, 'transStrength', { min: 0.0, max: 5.0, step: 0.1, label: 'Glow Strength' }).on('change', (ev) => {
      u.surface.uTransStrength.value = ev.value;
    });
    transSub.addBinding(params, 'transPower', { min: 1.0, max: 8.0, step: 0.2, label: 'Sun Angle Lobe Power' }).on('change', (ev) => {
      u.surface.uTransPower.value = ev.value;
    });
    transSub.addBinding(params, 'transTip', { min: 0.0, max: 1.0, step: 0.05, label: 'Tip Bias' }).on('change', (ev) => {
      u.surface.uTransTip.value = ev.value;
    });

    // ── Wildflowers ──
    const flowerSub = folder.addFolder({ title: '🌸 Wildflower Colors & Culling', expanded: false });
    flowerSub.addBinding(params, 'flowerColorR', { label: 'Poppy Red Channel' }).on('change', (ev) => {
      u.flower.uColorR.value.set(ev.value);
    });
    flowerSub.addBinding(params, 'flowerColorG', { label: 'Dandelion Yellow Channel' }).on('change', (ev) => {
      u.flower.uColorG.value.set(ev.value);
    });
    flowerSub.addBinding(params, 'flowerColorB', { label: 'Lavender Purple Channel' }).on('change', (ev) => {
      u.flower.uColorB.value.set(ev.value);
    });
    flowerSub.addBinding(params, 'flowerDirtMax', { min: 0.05, max: 1.0, step: 0.05, label: 'Dirt Culling Limit' }).on('change', (ev) => {
      u.flower.uFlDirtMax.value = ev.value;
    });

    // ── Rock Trampling ──
    const rockSub = folder.addFolder({ title: '🪨 Rock Trampling (Bend & Splay)', expanded: false });
    rockSub.addBinding(params, 'rockRadiusMul', { min: 0.5, max: 2.5, step: 0.05, label: 'Influence Radius' }).on('change', (ev) => {
      u.surface.uRockRadiusMul.value = ev.value;
    });
    rockSub.addBinding(params, 'rockFalloff', { min: 0.1, max: 2.0, step: 0.05, label: 'Soft Edge Falloff' }).on('change', (ev) => {
      u.surface.uRockFalloff.value = ev.value;
    });
    rockSub.addBinding(params, 'rockFlatten', { min: 0.0, max: 1.0, step: 0.05, label: 'Flatten Height' }).on('change', (ev) => {
      u.surface.uRockFlatten.value = ev.value;
    });
    rockSub.addBinding(params, 'rockBend', { min: 0.0, max: 1.0, step: 0.05, label: 'Tip Splay Outward' }).on('change', (ev) => {
      u.surface.uRockBend.value = ev.value;
    });

    this._addFolderButtons(folder, 'Grass & Wildflowers', params);
  }

  _syncGrassParams(params) {
    const u = this.app.vegetationManager.uniforms;
    params.rootColor = '#' + u.surface.uGrassBottom.value.getHexString();
    params.tipColor = '#' + u.surface.uGrassTop.value.getHexString();
    params.gradStart = u.surface.uGradStart.value;
    params.gradEnd = u.surface.uGradEnd.value;
    params.gradPower = u.surface.uGradPower.value;
    params.brightness = u.surface.uBrightness.value;
    params.dirtColor = '#' + u.surface.uDirtColor.value.getHexString();
    params.dirtCoverage = u.surface.uDirtCoverage.value;
    params.dirtScale = u.surface.uDirtScale.value;
    params.dirtSoftness = u.surface.uDirtSoftness.value;
    params.dirtCut = u.surface.uDirtCut.value;
    params.dirtBlend = u.surface.uDirtBlend.value;
    params.transColor = '#' + u.surface.uTransColor.value.getHexString();
    params.transStrength = u.surface.uTransStrength.value;
    params.windStrength = u.surface.uWindStrength.value;
    params.windSpeed = u.surface.uWindSpeed.value;
    params.flowerColorR = '#' + u.flower.uColorR.value.getHexString();
    params.flowerColorG = '#' + u.flower.uColorG.value.getHexString();
    params.flowerColorB = '#' + u.flower.uColorB.value.getHexString();
  }

  // ── 4. Trees & Props Folder ─────────────────────────────────
  _buildTreesFolder() {
    const vm = this.app.vegetationManager;
    const u = vm.uniforms.surface;
    const folder = this.pane.addFolder({ title: '🌲 Trees & Rocks', expanded: false });

    const params = {
      pineStyle: vm.pineStyle || 'glb',
      treeScale: vm.treeScaleFactor,
      minRoadDist: vm.minRoadDistance,
      trunkColor: '#' + MAT_TRUNK.color.getHexString(),
      pineBottom: '#' + MAT_PINE_TIER1.userData.bottomColor.value.getHexString(),
      pineTop:    '#' + MAT_PINE_TIER4.userData.topColor.value.getHexString(),
      oakBottom:  '#' + MAT_OAK_MAIN.userData.bottomColor.value.getHexString(),
      oakTop:     '#' + MAT_OAK_TOP.userData.topColor.value.getHexString(),
      autumnBottom: '#' + MAT_AUTUMN_MAIN.userData.bottomColor.value.getHexString(),
      autumnTop:    '#' + MAT_AUTUMN_TOP.userData.topColor.value.getHexString(),
      leafWindStrength: u.uLeafWindStrength.value,
      leafFlutterAmp:   u.uLeafFlutterAmp.value,
      leafDip:          u.uLeafDip.value,
      graniteColor: '#' + MAT_GRANITE.color.getHexString(),
      sandstoneColor: '#' + MAT_SANDSTONE.color.getHexString(),
    };

    folder.addBinding(params, 'pineStyle', {
      label: 'Pine Tree Model',
      options: {
        'Stylized Scanned (Branches & Needles)': 'glb',
        'Procedural Conical (Classic Low-Poly)': 'procedural',
      },
    }).on('change', (ev) => {
      vm.pineStyle = ev.value;
      this.app.terrainManager.repopulateChunks();
    });

    folder.addBinding(params, 'treeScale', { min: 0.5, max: 2.0, step: 0.05, label: 'Tree Scale' }).on('change', (ev) => {
      vm.treeScaleFactor = ev.value;
      this.app.terrainManager.repopulateChunks();
    });

    folder.addBinding(params, 'minRoadDist', { min: 8.0, max: 25.0, step: 1.0, label: 'Road Clearance' }).on('change', (ev) => {
      vm.minRoadDistance = ev.value;
      this.app.terrainManager.repopulateChunks();
    });

    folder.addBinding(params, 'trunkColor', { label: 'Trunk Bark' }).on('change', (ev) => {
      MAT_TRUNK.color.set(ev.value);
    });

    const canopySub = folder.addFolder({ title: '🎨 Foliage Color Bands', expanded: false });
    canopySub.addBinding(params, 'pineBottom', { label: 'Pine Base' }).on('change', (ev) => {
      MAT_PINE_TIER1.userData.bottomColor.value.set(ev.value);
      u.uLeafBottom.value.set(ev.value);
    });
    canopySub.addBinding(params, 'pineTop', { label: 'Pine Crown' }).on('change', (ev) => {
      MAT_PINE_TIER4.userData.topColor.value.set(ev.value);
      u.uLeafTop.value.set(ev.value);
    });
    canopySub.addBinding(params, 'oakBottom', { label: 'Oak Base' }).on('change', (ev) => {
      MAT_OAK_MAIN.userData.bottomColor.value.set(ev.value);
    });
    canopySub.addBinding(params, 'oakTop', { label: 'Oak Crown' }).on('change', (ev) => {
      MAT_OAK_TOP.userData.topColor.value.set(ev.value);
    });
    canopySub.addBinding(params, 'autumnBottom', { label: 'Autumn Base' }).on('change', (ev) => {
      MAT_AUTUMN_MAIN.userData.bottomColor.value.set(ev.value);
    });
    canopySub.addBinding(params, 'autumnTop', { label: 'Autumn Crown' }).on('change', (ev) => {
      MAT_AUTUMN_TOP.userData.topColor.value.set(ev.value);
    });

    const treeWindSub = folder.addFolder({ title: '🌬️ Tree Wind Sway & Flutter', expanded: false });
    treeWindSub.addBinding(params, 'leafWindStrength', { min: 0.0, max: 0.6, step: 0.02, label: 'Canopy Sway' }).on('change', (ev) => {
      u.uLeafWindStrength.value = ev.value;
    });
    treeWindSub.addBinding(params, 'leafFlutterAmp', { min: 0.0, max: 0.8, step: 0.05, label: 'Leaf Flutter' }).on('change', (ev) => {
      u.uLeafFlutterAmp.value = ev.value;
    });
    treeWindSub.addBinding(params, 'leafDip', { min: 0.0, max: 0.6, step: 0.02, label: 'Branch Dip' }).on('change', (ev) => {
      u.uLeafDip.value = ev.value;
    });

    const rockSub = folder.addFolder({ title: '🪨 Rock Materials', expanded: false });
    rockSub.addBinding(params, 'graniteColor', { label: 'Granite Boulder' }).on('change', (ev) => {
      MAT_GRANITE.color.set(ev.value);
    });
    rockSub.addBinding(params, 'sandstoneColor', { label: 'Sandstone Slab' }).on('change', (ev) => {
      MAT_SANDSTONE.color.set(ev.value);
    });

    this._addFolderButtons(folder, 'Trees & Rocks', params);
  }

  // ── 5. Water Folder ─────────────────────────────────────────
  _buildWaterFolder() {
    const ws = this.app.terrainManager.waterSystem;
    const folder = this.pane.addFolder({ title: '🌊 Water', expanded: false });

    const params = {
      waterLevel: ws.waterLevel,
      color: '#' + ws.waterMat.color.getHexString(),
      roughness: ws.waterMat.roughness,
      metalness: ws.waterMat.metalness,
      opacity: ws.waterMat.opacity,
      flowSpeed: ws.flowSpeed,
    };

    folder.addBinding(params, 'waterLevel', { min: -1.0, max: 4.0, step: 0.1, label: 'Water Level (Y)' })
      .on('change', (ev) => { ws.setWaterLevel(ev.value); });

    folder.addBinding(params, 'color', { label: 'Water Color' })
      .on('change', (ev) => { ws.waterMat.color.set(ev.value); });

    folder.addBinding(params, 'roughness', { min: 0.0, max: 0.8, step: 0.02, label: 'Roughness' })
      .on('change', (ev) => { ws.waterMat.roughness = ev.value; });

    folder.addBinding(params, 'metalness', { min: 0.0, max: 0.8, step: 0.02, label: 'Metalness' })
      .on('change', (ev) => { ws.waterMat.metalness = ev.value; });

    folder.addBinding(params, 'opacity', { min: 0.2, max: 1.0, step: 0.02, label: 'Opacity' })
      .on('change', (ev) => { ws.waterMat.opacity = ev.value; });

    folder.addBinding(params, 'flowSpeed', { min: 0.005, max: 0.15, step: 0.005, label: 'Flow Drift Speed' })
      .on('change', (ev) => { ws.flowSpeed = ev.value; });

    this._addFolderButtons(folder, 'Water', params);
  }

  // ── 6. Road & Spline Folder ─────────────────────────────────
  _buildRoadFolder() {
    const folder = this.pane.addFolder({ title: '🛣️ Road & Spline', expanded: false });

    const params = {
      barrierMode: this.app.barrierMode,
      roadWidth: 9.8,
      cpSpacing: this.app.roadSpline.cpSpacing,
      heightScale: this.app.roadSpline.heightScale,
    };

    folder.addBinding(params, 'barrierMode', {
      label: 'Barriers',
      options: {
        'Dynamic (Curves Only)': 'dynamic',
        'None (Open Road)': 'none',
        'All (Continuous)': 'all',
      },
    }).on('change', (ev) => {
      this.app._setBarrierMode(ev.value);
    });

    folder.addBinding(params, 'roadWidth', { min: 6.0, max: 15.0, step: 0.2, label: 'Road Width (m)' })
      .on('change', (ev) => {
        this.app._rebuildRoadMesh(ev.value);
      });

    folder.addBinding(params, 'cpSpacing', { min: 20, max: 60, step: 1, label: 'Curve Segment Len' })
      .on('change', (ev) => {
        this.app.roadSpline.cpSpacing = ev.value;
      });

    folder.addBinding(params, 'heightScale', { min: 4, max: 24, step: 1, label: 'Road Elevation Scale' })
      .on('change', (ev) => {
        this.app.roadSpline.heightScale = ev.value;
      });

    this._addFolderButtons(folder, 'Road & Spline', params);
  }

  // ── 7. Car Visuals Folder ───────────────────────────────────
  _buildCarVisualsFolder() {
    const cm = this.app.carMesh;
    const folder = this.pane.addFolder({ title: '🎨 Car Visuals & Paint', expanded: false });

    const params = {
      primaryPaint: '#' + cm.primaryMat.color.getHexString(),
      primaryRoughness: cm.primaryMat.roughness,
      primaryMetalness: cm.primaryMat.metalness,
      secondaryPaint: '#' + cm.secondaryMat.color.getHexString(),
      accentGold: '#' + cm.accentMat.color.getHexString(),
      carbonFiber: '#' + cm.carbonMat.color.getHexString(),
      chromeMetal: '#' + cm.metalMat.color.getHexString(),
      windscreenColor: '#' + cm.windscreenMat.color.getHexString(),
      windscreenOpacity: cm.windscreenMat.opacity,
    };

    folder.addBinding(params, 'primaryPaint', { label: 'Primary Livery' }).on('change', (ev) => {
      cm.primaryMat.color.set(ev.value);
    });
    folder.addBinding(params, 'primaryRoughness', { min: 0.05, max: 0.9, step: 0.02, label: 'Paint Roughness' }).on('change', (ev) => {
      cm.primaryMat.roughness = ev.value;
    });
    folder.addBinding(params, 'primaryMetalness', { min: 0.0, max: 1.0, step: 0.02, label: 'Paint Metalness' }).on('change', (ev) => {
      cm.primaryMat.metalness = ev.value;
    });

    folder.addBinding(params, 'secondaryPaint', { label: 'Stripe White' }).on('change', (ev) => {
      cm.secondaryMat.color.set(ev.value);
    });
    folder.addBinding(params, 'accentGold', { label: 'Accent Trim' }).on('change', (ev) => {
      cm.accentMat.color.set(ev.value);
      cm.helmetMat.color.set(ev.value);
    });
    folder.addBinding(params, 'carbonFiber', { label: 'Carbon Aero' }).on('change', (ev) => {
      cm.carbonMat.color.set(ev.value);
    });
    folder.addBinding(params, 'chromeMetal', { label: 'Chrome Exhaust/Rims' }).on('change', (ev) => {
      cm.metalMat.color.set(ev.value);
    });
    folder.addBinding(params, 'windscreenColor', { label: 'Visor Tint' }).on('change', (ev) => {
      cm.windscreenMat.color.set(ev.value);
    });
    folder.addBinding(params, 'windscreenOpacity', { min: 0.1, max: 0.9, step: 0.02, label: 'Visor Opacity' }).on('change', (ev) => {
      cm.windscreenMat.opacity = ev.value;
    });

    this._addFolderButtons(folder, 'Car Visuals', params);
  }

  // ── 8. Weather & Atmosphere Folder ──────────────────────────
  _buildAtmosphereFolder() {
    const at = this.app.atmosphere;
    const folder = this.pane.addFolder({ title: '⛅ Weather & Atmosphere', expanded: false });

    const params = {
      preset: at._currentPreset,
      skyTop: '#' + at._skyUniforms.topColor.value.getHexString(),
      skyMid: '#' + at._skyUniforms.midColor.value.getHexString(),
      skyBottom: '#' + at._skyUniforms.bottomColor.value.getHexString(),
      sunColor: '#' + at._skyUniforms.sunColor.value.getHexString(),
      sunIntensity: at.sunLight.intensity,
      fogColor: '#' + (this.app.scene.fog ? this.app.scene.fog.color.getHexString() : 'baddf0'),
      fogDensity: this.app.scene.fog ? this.app.scene.fog.density : 0.0006,
      starsEnabled: at._skyUniforms.starsEnabled.value > 0.5,
      cloudCount: at.cloudSystem ? at.cloudSystem.count : 28,
    };

    folder.addBinding(params, 'preset', {
      label: 'Time of Day',
      options: {
        'Daylight': 'daylight',
        'Morning': 'morning',
        'Sunset': 'sunset',
        'Night': 'night',
      },
    }).on('change', (ev) => {
      this.app._setEnvironment(ev.value);
      params.skyTop = '#' + at._skyUniforms.topColor.value.getHexString();
      params.skyMid = '#' + at._skyUniforms.midColor.value.getHexString();
      params.skyBottom = '#' + at._skyUniforms.bottomColor.value.getHexString();
      params.sunColor = '#' + at._skyUniforms.sunColor.value.getHexString();
      params.sunIntensity = at.sunLight.intensity;
      params.fogColor = '#' + this.app.scene.fog.color.getHexString();
      params.fogDensity = this.app.scene.fog.density;
      folder.refresh();
    });

    folder.addBinding(params, 'skyTop', { label: 'Sky Zenith' }).on('change', (ev) => {
      at._skyUniforms.topColor.value.set(ev.value);
    });
    folder.addBinding(params, 'skyMid', { label: 'Sky Mid' }).on('change', (ev) => {
      at._skyUniforms.midColor.value.set(ev.value);
    });
    folder.addBinding(params, 'skyBottom', { label: 'Horizon Band' }).on('change', (ev) => {
      at._skyUniforms.bottomColor.value.set(ev.value);
    });
    folder.addBinding(params, 'sunColor', { label: 'Sun Disc Color' }).on('change', (ev) => {
      at._skyUniforms.sunColor.value.set(ev.value);
      at.sunLight.color.set(ev.value);
    });
    folder.addBinding(params, 'sunIntensity', { min: 0.0, max: 3.5, step: 0.05, label: 'Sun Intensity' }).on('change', (ev) => {
      at.sunLight.intensity = ev.value;
    });

    folder.addBinding(params, 'fogColor', { label: 'Distance Fog' }).on('change', (ev) => {
      if (this.app.scene.fog) this.app.scene.fog.color.set(ev.value);
    });
    folder.addBinding(params, 'fogDensity', { min: 0.0001, max: 0.004, step: 0.0001, label: 'Fog Density' }).on('change', (ev) => {
      if (this.app.scene.fog) this.app.scene.fog.density = ev.value;
    });

    folder.addBinding(params, 'starsEnabled', { label: 'Night Stars' }).on('change', (ev) => {
      at._skyUniforms.starsEnabled.value = ev.value ? 1.0 : 0.0;
    });

    this._addFolderButtons(folder, 'Weather & Atmosphere', params);
  }

  // ── 9. Lighting & Shadows Folder ────────────────────────────
  _buildLightingFolder() {
    const at = this.app.atmosphere;
    const folder = this.pane.addFolder({ title: '💡 Lighting & Headlights', expanded: false });

    const params = {
      hemiIntensity: at.hemiLight.intensity,
      hemiSky: '#' + at.hemiLight.color.getHexString(),
      hemiGround: '#' + at.hemiLight.groundColor.getHexString(),
      ambientIntensity: at.ambientLight.intensity,
      headlightsOn: this.app._headlightsOn,
      headlightIntensity: 22.0,
      shadowsEnabled: this.app.renderer.shadowMap.enabled,
    };

    folder.addBinding(params, 'headlightsOn', { label: '💡 Car Headlights' }).on('change', (ev) => {
      this.app._setHeadlights(ev.value);
      if (this.app.hud) this.app.hud._setHeadlights(ev.value);
    });

    folder.addBinding(params, 'headlightIntensity', { min: 5.0, max: 50.0, step: 1.0, label: 'Xenon Beam Power' }).on('change', (ev) => {
      if (this.app._headlightsOn) {
        this.app.headlightL.intensity = ev.value;
        this.app.headlightR.intensity = ev.value;
      }
    });

    folder.addBinding(params, 'hemiIntensity', { min: 0.0, max: 2.0, step: 0.05, label: 'Hemisphere Ambient' }).on('change', (ev) => {
      at.hemiLight.intensity = ev.value;
    });

    folder.addBinding(params, 'hemiSky', { label: 'Sky Ambient Color' }).on('change', (ev) => {
      at.hemiLight.color.set(ev.value);
    });

    folder.addBinding(params, 'hemiGround', { label: 'Ground Bounce Color' }).on('change', (ev) => {
      at.hemiLight.groundColor.set(ev.value);
    });

    folder.addBinding(params, 'ambientIntensity', { min: 0.0, max: 1.5, step: 0.05, label: 'Soft Fill Intensity' }).on('change', (ev) => {
      at.ambientLight.intensity = ev.value;
    });

    folder.addBinding(params, 'shadowsEnabled', { label: 'Dynamic Shadows' }).on('change', (ev) => {
      this.app.renderer.shadowMap.enabled = ev.value;
      this.app.scene.traverse((obj) => {
        if (obj.material) obj.material.needsUpdate = true;
      });
    });

    this._addFolderButtons(folder, 'Lighting & Headlights', params);
  }

  // ── 10. Post-Processing Folder ──────────────────────────────
  _buildPostProcessingFolder() {
    const folder = this.pane.addFolder({ title: '✨ Post-Processing & Tone', expanded: false });

    const params = {
      bloomEnabled: this.app.bloomPass ? this.app.bloomPass.enabled : true,
      bloomStrength: this.app.bloomPass ? this.app.bloomPass.strength : 0.45,
      bloomRadius: this.app.bloomPass ? this.app.bloomPass.radius : 0.60,
      bloomThreshold: this.app.bloomPass ? this.app.bloomPass.threshold : 0.82,
      exposure: this.app.renderer.toneMappingExposure,
      pixelRatio: this.app.renderer.getPixelRatio(),
    };

    folder.addBinding(params, 'bloomEnabled', { label: 'Unreal Bloom' }).on('change', (ev) => {
      if (this.app.bloomPass) this.app.bloomPass.enabled = ev.value;
    });

    folder.addBinding(params, 'bloomStrength', { min: 0.0, max: 2.5, step: 0.05, label: 'Bloom Intensity' }).on('change', (ev) => {
      if (this.app.bloomPass) this.app.bloomPass.strength = ev.value;
    });

    folder.addBinding(params, 'bloomRadius', { min: 0.0, max: 1.5, step: 0.05, label: 'Bloom Spread Radius' }).on('change', (ev) => {
      if (this.app.bloomPass) this.app.bloomPass.radius = ev.value;
    });

    folder.addBinding(params, 'bloomThreshold', { min: 0.2, max: 1.0, step: 0.02, label: 'Bloom Threshold' }).on('change', (ev) => {
      if (this.app.bloomPass) this.app.bloomPass.threshold = ev.value;
    });

    folder.addBinding(params, 'exposure', { min: 0.4, max: 2.5, step: 0.05, label: 'Camera Exposure' }).on('change', (ev) => {
      this.app.renderer.toneMappingExposure = ev.value;
    });

    folder.addBinding(params, 'pixelRatio', { min: 0.75, max: 2.0, step: 0.1, label: 'Resolution Scale' }).on('change', (ev) => {
      this.app.renderer.setPixelRatio(ev.value);
      if (this.app.composer) this.app.composer.setPixelRatio(ev.value);
    });

    this._addFolderButtons(folder, 'Post-Processing', params);
  }

  // ── 11. Camera Folder ───────────────────────────────────────
  _buildCameraFolder() {
    const cm = this.app.cameraManager;
    const folder = this.pane.addFolder({ title: '🎥 Camera', expanded: false });

    const params = {
      mode: cm.mode,
      baseFov: cm.baseFov,
      maxFov: cm.maxFov,
      chaseDistance: cm.chaseOffset.z,
      chaseHeight: cm.chaseOffset.y,
    };

    folder.addBinding(params, 'mode', {
      label: 'Camera View',
      options: {
        'Chase': 'chase',
        'Close': 'close',
        'Cockpit': 'cockpit',
        'Orbit': 'orbit',
      },
    }).on('change', (ev) => {
      cm.setMode(ev.value);
    });

    folder.addBinding(params, 'baseFov', { min: 45, max: 95, step: 1, label: 'Base FOV' }).on('change', (ev) => {
      cm.baseFov = ev.value;
    });

    folder.addBinding(params, 'maxFov', { min: 65, max: 115, step: 1, label: 'High-Speed FOV' }).on('change', (ev) => {
      cm.maxFov = ev.value;
    });

    folder.addBinding(params, 'chaseDistance', { min: -12.0, max: -3.0, step: 0.2, label: 'Chase Distance' }).on('change', (ev) => {
      cm.chaseOffset.z = ev.value;
    });

    folder.addBinding(params, 'chaseHeight', { min: 1.0, max: 5.0, step: 0.1, label: 'Chase Height' }).on('change', (ev) => {
      cm.chaseOffset.y = ev.value;
    });

    this._addFolderButtons(folder, 'Camera', params);
  }

  // ── 12. Audio Folder ────────────────────────────────────────
  _buildAudioFolder() {
    const sm = this.app.hud ? this.app.hud.soundManager : null;
    const folder = this.pane.addFolder({ title: '🔊 Audio Engine', expanded: false });

    const params = {
      muted: sm ? sm._isMuted : false,
      masterVolume: sm ? sm._masterVolume : 0.55,
      filterQ: sm && sm.engineFilter ? sm.engineFilter.Q.value : 2.2,
    };

    folder.addBinding(params, 'muted', { label: 'Mute Audio' }).on('change', (ev) => {
      if (sm) sm.setMuted(ev.value);
    });

    folder.addBinding(params, 'masterVolume', { min: 0.0, max: 1.0, step: 0.05, label: 'Master Volume' }).on('change', (ev) => {
      if (sm && sm.masterGain) sm.masterGain.gain.value = ev.value;
    });

    folder.addBinding(params, 'filterQ', { min: 0.5, max: 5.0, step: 0.1, label: 'Exhaust Resonance' }).on('change', (ev) => {
      if (sm && sm.engineFilter) sm.engineFilter.Q.value = ev.value;
    });

    this._addFolderButtons(folder, 'Audio Engine', params);
  }

  // ── Helper: Add Randomize & Reset Buttons per Folder ───────
  _addFolderButtons(folder, name, paramsObject) {
    this._folderControllers.set(name, { folder, params: paramsObject });

    folder.addButton({ title: '🎲 Randomize ' + name }).on('click', () => this.randomizeFolder(name));
    folder.addButton({ title: '↺ Reset to Default' }).on('click', () => this.resetFolder(name));
  }

  _captureDefaults() {
    for (const [name, { params }] of this._folderControllers.entries()) {
      this._defaultStates.set(name, JSON.parse(JSON.stringify(params)));
    }
  }

  // ── Randomize Folder ────────────────────────────────────────
  randomizeFolder(name) {
    const entry = this._folderControllers.get(name);
    if (!entry) return;
    const { folder, params } = entry;

    for (const key of Object.keys(params)) {
      if (typeof params[key] === 'number') {
        // Randomize number by ±25% within reasonable bounds
        const orig = params[key];
        const variation = (Math.random() - 0.5) * 0.5 * (orig === 0 ? 1 : Math.abs(orig));
        params[key] = parseFloat((orig + variation).toFixed(3));
      } else if (typeof params[key] === 'string' && params[key].startsWith('#')) {
        // Randomize hex color with a curated variation
        const col = new THREE.Color(params[key]);
        const hsl = {};
        col.getHSL(hsl);
        hsl.h = (hsl.h + (Math.random() - 0.5) * 0.2 + 1.0) % 1.0;
        hsl.s = THREE.MathUtils.clamp(hsl.s + (Math.random() - 0.5) * 0.2, 0.2, 1.0);
        col.setHSL(hsl.h, hsl.s, hsl.l);
        params[key] = '#' + col.getHexString();
      }
    }
    folder.refresh();
  }

  // ── Reset Folder ────────────────────────────────────────────
  resetFolder(name) {
    const entry = this._folderControllers.get(name);
    const def = this._defaultStates.get(name);
    if (!entry || !def) return;
    const { folder, params } = entry;

    for (const key of Object.keys(def)) {
      params[key] = def[key];
    }
    folder.refresh();
  }

  // ── Global Reset ────────────────────────────────────────────
  resetAll() {
    for (const name of this._folderControllers.keys()) {
      this.resetFolder(name);
    }
  }

  // ── Save Preset (Download JSON + LocalStorage) ──────────────
  savePreset() {
    const exportData = {};
    for (const [name, { params }] of this._folderControllers.entries()) {
      exportData[name] = params;
    }
    const jsonStr = JSON.stringify(exportData, null, 2);

    // Save to localStorage
    try {
      localStorage.setItem('slowroads_saved_preset', jsonStr);
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }

    // Trigger browser download
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `slowroads-f1-preset-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Load Preset (File Picker / JSON Import) ──────────────────
  loadPreset() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          this._importPresetData(data);
        } catch (err) {
          alert('Failed to parse preset JSON file: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  _applyPreset(presetName) {
    if (presetName === 'Default F1') {
      this.resetAll();
      return;
    }
    const data = this.presets[presetName];
    if (data) this._importPresetData(data);
  }

  _importPresetData(data) {
    for (const [folderName, folderValues] of Object.entries(data)) {
      const entry = this._folderControllers.get(folderName);
      if (entry) {
        for (const [k, v] of Object.entries(folderValues)) {
          if (entry.params[k] !== undefined) {
            entry.params[k] = v;
          }
        }
        entry.folder.refresh();
      }
    }
  }
}
