import * as THREE from 'three';

// ── Vibrant, Slow Roads & Low-Poly Nature Palettes ────────────
export const MAT_TRUNK = new THREE.MeshStandardMaterial({
  color: 0x422d1c, // Warm deep wood bark
  roughness: 0.95,
  metalness: 0.02,
  flatShading: true,
});

// Conifer / Pine Foliage — 4 lush gradient green tiers
export const MAT_PINE_TIER1 = new THREE.MeshStandardMaterial({
  color: 0x184423, // Deep forest underside
  roughness: 0.85,
  flatShading: true,
});

export const MAT_PINE_TIER2 = new THREE.MeshStandardMaterial({
  color: 0x225c30, // Rich evergreen mid-low
  roughness: 0.82,
  flatShading: true,
});

export const MAT_PINE_TIER3 = new THREE.MeshStandardMaterial({
  color: 0x2d753e, // Alpine spruce mid-high
  roughness: 0.80,
  flatShading: true,
});

export const MAT_PINE_TIER4 = new THREE.MeshStandardMaterial({
  color: 0x3d9453, // Fresh sunlit top crown
  roughness: 0.78,
  flatShading: true,
});

// Broadleaf / Summer Oak Foliage — lush volumetric greens
export const MAT_OAK_MAIN = new THREE.MeshStandardMaterial({
  color: 0x3d8c3f, // Vibrant summer green
  roughness: 0.82,
  flatShading: true,
});

export const MAT_OAK_CLUSTER = new THREE.MeshStandardMaterial({
  color: 0x4da850, // Bright leafy highlight
  roughness: 0.80,
  flatShading: true,
});

export const MAT_OAK_TOP = new THREE.MeshStandardMaterial({
  color: 0x5ebd62, // Sun-drenched crown
  roughness: 0.78,
  flatShading: true,
});

// Autumn Maple Foliage — warm glowing golden-orange
export const MAT_AUTUMN_MAIN = new THREE.MeshStandardMaterial({
  color: 0xd97706, // Rich amber gold
  roughness: 0.82,
  flatShading: true,
});

export const MAT_AUTUMN_CLUSTER = new THREE.MeshStandardMaterial({
  color: 0xea580c, // Vibrant fiery orange
  roughness: 0.80,
  flatShading: true,
});

export const MAT_AUTUMN_TOP = new THREE.MeshStandardMaterial({
  color: 0xf59e0b, // Golden yellow crown
  roughness: 0.78,
  flatShading: true,
});

// ── Geometries ────────────────────────────────────────────────

/**
 * Procedural scalloped pine cone tier with organic fluted base
 */
function createPineConeTier(radius, height, segments = 7) {
  const geo = new THREE.ConeGeometry(radius, height, segments);
  // Shift origin so (0,0,0) is at the base of this tier
  geo.translate(0, height * 0.5, 0);
  return geo;
}

/**
 * Procedural low-poly organic deformed canopy sphere for broadleaf trees
 */
function createCanopyClumpGeometry(radius = 1.5, segments = 6, rings = 5) {
  const geo = new THREE.SphereGeometry(radius, segments, rings);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  // Subtle organic deformation so it looks like a natural cluster of leaves
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const noise = (Math.sin(v.x * 2.1) * Math.cos(v.y * 2.3) * Math.sin(v.z * 1.9)) * 0.14 * radius;
    v.addScaledVector(v.clone().normalize(), noise);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export class TreeBuilder {
  constructor() {
    // ── Pine Geometries (Height ~ 6.2m) ─────────────────────
    // Trunk: height 2.6m (only bottom 1.4m is exposed)
    this.pineTrunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 2.6, 6);
    this.pineTrunkGeo.translate(0, 1.3, 0); // origin at base

    // 4 Overlapping Conical Needle Skirts
    this.pineTier1 = createPineConeTier(2.10, 2.4, 7); // y = 1.2
    this.pineTier2 = createPineConeTier(1.70, 2.2, 7); // y = 2.4
    this.pineTier3 = createPineConeTier(1.25, 2.0, 7); // y = 3.5
    this.pineTier4 = createPineConeTier(0.75, 1.8, 6); // y = 4.5

    // ── Broadleaf / Oak Geometries (Height ~ 5.6m) ──────────
    // Sturdy wooden trunk
    this.oakTrunkGeo = new THREE.CylinderGeometry(0.20, 0.38, 2.4, 6);
    this.oakTrunkGeo.translate(0, 1.2, 0); // origin at base

    // Multi-clump dense leaf canopy
    this.oakCanopyMain    = createCanopyClumpGeometry(1.9, 7, 6);
    this.oakCanopyCluster = createCanopyClumpGeometry(1.4, 6, 5);
    this.oakCanopyTop     = createCanopyClumpGeometry(1.2, 6, 5);
  }
}
