import * as THREE from 'three';

// ── Rock & Geological Materials ───────────────────────────────
export const MAT_GRANITE = new THREE.MeshStandardMaterial({
  color: 0x5e6570, // Cool alpine granite
  roughness: 0.92,
  metalness: 0.04,
  flatShading: true,
});

export const MAT_SANDSTONE = new THREE.MeshStandardMaterial({
  color: 0x827768, // Warm earthy sandstone
  roughness: 0.95,
  metalness: 0.02,
  flatShading: true,
});

export const MAT_MOSSY_ROCK = new THREE.MeshStandardMaterial({
  color: 0x546348, // Moss-draped forest boulder
  roughness: 0.90,
  metalness: 0.02,
  flatShading: true,
});

export const MAT_PEBBLE = new THREE.MeshStandardMaterial({
  color: 0x73706a, // Scree & river pebble stone
  roughness: 0.88,
  metalness: 0.05,
  flatShading: true,
});

// ── Procedural Geological Geometry Builders ───────────────────

/**
 * Creates an organic, faceted weathered boulder with sharp planar cleavage faces.
 */
export function createFacetedBoulderGeometry(radius = 1.0, detail = 1, flatness = 0.75) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    // Multi-octave directional deformation
    const noise = Math.sin(v.x * 2.5) * Math.cos(v.y * 2.2) * Math.sin(v.z * 2.8) * 0.28 * radius;
    v.addScaledVector(v.clone().normalize(), noise);

    // Flatten bottom and scale height
    v.y *= flatness;
    if (v.y < 0) {
      v.y *= 0.7; // flatter underside to sit naturally in ground
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a flat bedrock slab / plateau rock.
 */
export function createRockSlabGeometry(radius = 1.4) {
  const geo = new THREE.DodecahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.y *= 0.38; // highly flattened slab
    v.x *= 1.35; // elongated oval
    const noise = (Math.sin(v.x * 3.0) + Math.cos(v.z * 3.0)) * 0.12;
    v.y += noise;
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a small multi-pebble scree cluster.
 */
export function createPebbleClusterGeometry() {
  const geo = new THREE.DodecahedronGeometry(0.35, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.y *= 0.65;
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

export class RockBuilder {
  constructor() {
    // Large prominent mountain boulder
    this.boulderLargeGeo  = createFacetedBoulderGeometry(1.6, 1, 0.85);
    // Medium roadside / slope rock
    this.boulderMediumGeo = createFacetedBoulderGeometry(1.0, 1, 0.70);
    // Low flat bedrock slab
    this.rockSlabGeo      = createRockSlabGeometry(1.5);
    // Pebble / scree cluster
    this.pebbleGeo        = createPebbleClusterGeometry();
  }
}
