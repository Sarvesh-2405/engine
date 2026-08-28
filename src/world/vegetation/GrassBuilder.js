import * as THREE from 'three';

// ── Grass & Wildflower Materials ──────────────────────────────
export const MAT_GRASS_MEADOW = new THREE.MeshStandardMaterial({
  color: 0x4fa83b, // Vibrant meadow green
  roughness: 0.88,
  metalness: 0.02,
  flatShading: true,
  side: THREE.DoubleSide,
});

export const MAT_GRASS_WARM = new THREE.MeshStandardMaterial({
  color: 0x6ca336, // Warm sunlit grass
  roughness: 0.90,
  metalness: 0.02,
  flatShading: true,
  side: THREE.DoubleSide,
});

export const MAT_FLOWER_POPPY = new THREE.MeshStandardMaterial({
  color: 0xef4444, // Red poppy
  roughness: 0.80,
  flatShading: true,
});

export const MAT_FLOWER_DANDELION = new THREE.MeshStandardMaterial({
  color: 0xfacc15, // Golden yellow dandelion
  roughness: 0.80,
  flatShading: true,
});

export const MAT_FLOWER_LAVENDER = new THREE.MeshStandardMaterial({
  color: 0xa855f7, // Wild purple lavender
  roughness: 0.80,
  flatShading: true,
});

// ── Lightweight Procedural Geometries (Ultra Low-Poly, High Aesthetic) ─

/**
 * Creates an arched cross-quad blade tuft (6 faces, 12 vertices)
 */
export function createGrassBladeTuftGeometry(radius = 0.45, height = 0.65) {
  const positions = [];
  const uvs       = [];
  const indices   = [];

  const numBlades = 3;
  for (let b = 0; b < numBlades; b++) {
    const angle = (b / numBlades) * Math.PI;
    const cos = Math.cos(angle) * radius;
    const sin = Math.sin(angle) * radius;

    const baseIdx = (b * 4);

    // Quad: 2 bottom base vertices, 2 arched top vertices
    // Bottom left / right
    positions.push(-cos * 0.5, 0, -sin * 0.5);
    positions.push( cos * 0.5, 0,  sin * 0.5);
    // Top left / right (flaring outward slightly)
    positions.push(-cos * 1.0, height, -sin * 1.0);
    positions.push( cos * 1.0, height,  sin * 1.0);

    uvs.push(0, 0,  1, 0,  0, 1,  1, 1);

    indices.push(
      baseIdx, baseIdx + 1, baseIdx + 2,
      baseIdx + 1, baseIdx + 3, baseIdx + 2
    );
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a delicate stem + flower head cluster for roadside wildflowers
 */
export function createWildflowerGeometry(stemHeight = 0.55) {
  const geo = new THREE.ConeGeometry(0.12, 0.18, 5);
  // Shift to top of stem
  geo.translate(0, stemHeight, 0);
  return geo;
}

export class GrassBuilder {
  constructor() {
    this.bladeTuftGeo = createGrassBladeTuftGeometry(0.42, 0.60);
    this.flowerGeo    = createWildflowerGeometry(0.55);
  }
}
