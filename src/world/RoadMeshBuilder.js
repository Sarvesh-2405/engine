import * as THREE from 'three';

function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base Dark Asphalt
  ctx.fillStyle = '#1e2430';
  ctx.fillRect(0, 0, 512, 512);

  // Fine Aggregate Noise Speckles
  for (let i = 0; i < 28000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const val = Math.floor(Math.random() * 35);
    ctx.fillStyle = `rgba(${val + 30}, ${val + 35}, ${val + 45}, 0.18)`;
    ctx.fillRect(x, y, 2, 2);
  }

  // Faint Dark Rubber Tire Streaks
  const gradLeft = ctx.createLinearGradient(130, 0, 180, 0);
  gradLeft.addColorStop(0, 'rgba(10, 12, 16, 0.0)');
  gradLeft.addColorStop(0.5, 'rgba(10, 12, 16, 0.28)');
  gradLeft.addColorStop(1, 'rgba(10, 12, 16, 0.0)');
  ctx.fillStyle = gradLeft;
  ctx.fillRect(130, 0, 50, 512);

  const gradRight = ctx.createLinearGradient(330, 0, 380, 0);
  gradRight.addColorStop(0, 'rgba(10, 12, 16, 0.0)');
  gradRight.addColorStop(0.5, 'rgba(10, 12, 16, 0.28)');
  gradRight.addColorStop(1, 'rgba(10, 12, 16, 0.0)');
  ctx.fillStyle = gradRight;
  ctx.fillRect(330, 0, 50, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 80);
  texture.anisotropy = 16;
  return texture;
}

const roadAsphaltTexture = createAsphaltTexture();

export class RoadMeshBuilder {
  static buildMeshes(roadSpline, roadWidth = 10.0) {
    const curve = roadSpline.curve;
    const numPts = Math.max(2, Math.floor(curve.getLength() / 2.0));
    const pts = curve.getSpacedPoints(numPts);

    const positions = [];
    const uvs = [];

    // 1. Subdivided Asphalt Ribbon (+Y Upward Normals)
    const subSegments = 4;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const t = Math.min(i / (pts.length - 1), 0.999);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      for (let s = 0; s <= subSegments; s++) {
        const u = s / subSegments;
        const offset = -roadWidth / 2 + u * roadWidth;
        const pt = p.clone().addScaledVector(normal, offset);
        
        // Elevated 0.25m above terrain
        positions.push(pt.x, pt.y + 0.25, pt.z);
        uvs.push(u, t * 80);
      }
    }

    const indices = [];
    const stride = subSegments + 1;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s < subSegments; s++) {
        const a = i * stride + s;
        const b = a + 1;
        const c = (i + 1) * stride + s;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadAsphaltTexture,
      roughness: 0.65,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits: -4.0,
      side: THREE.DoubleSide
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.renderOrder = 10;

    // 2. Dashed Yellow Centerline Stripe
    const sp = [], si = [];
    let vi = 0;
    for (let i = 0; i < pts.length - 1; i += 2) {
      const p = pts[i], p2 = pts[Math.min(i + 1, pts.length - 1)];
      const t = Math.min(i / (pts.length - 1), 0.999);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const l1 = p.clone().addScaledVector(normal, 0.25), r1 = p.clone().addScaledVector(normal, -0.25);
      const l2 = p2.clone().addScaledVector(normal, 0.25), r2 = p2.clone().addScaledVector(normal, -0.25);

      sp.push(l1.x, l1.y + 0.30, l1.z, r1.x, r1.y + 0.30, r1.z, l2.x, l2.y + 0.30, l2.z, r2.x, r2.y + 0.30, r2.z);
      si.push(vi, vi + 2, vi + 1, vi + 1, vi + 2, vi + 3);
      vi += 4;
    }

    const stripeGeo = new THREE.BufferGeometry();
    stripeGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    stripeGeo.setIndex(si);
    stripeGeo.computeVertexNormals();

    const stripeMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Bright Gold Yellow
      roughness: 0.3,
      emissive: 0xb45309,
      emissiveIntensity: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -3.0,
      polygonOffsetUnits: -6.0,
      side: THREE.DoubleSide
    });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    stripeMesh.renderOrder = 11;

    // 3. Red & White Racing Curbs
    const cp = [], ci = [];
    let cvi = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], p2 = pts[i + 1];
      const t = Math.min(i / (pts.length - 1), 0.999);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const lc1 = p.clone().addScaledVector(normal, roadWidth / 2 + 0.5);
      const lc2 = p.clone().addScaledVector(normal, roadWidth / 2);
      const lc3 = p2.clone().addScaledVector(normal, roadWidth / 2 + 0.5);
      const lc4 = p2.clone().addScaledVector(normal, roadWidth / 2);

      cp.push(lc1.x, lc1.y + 0.28, lc1.z, lc2.x, lc2.y + 0.28, lc2.z, lc3.x, lc3.y + 0.28, lc3.z, lc4.x, lc4.y + 0.28, lc4.z);
      ci.push(cvi, cvi + 2, cvi + 1, cvi + 1, cvi + 2, cvi + 3);
      cvi += 4;

      const rc1 = p.clone().addScaledVector(normal, -roadWidth / 2);
      const rc2 = p.clone().addScaledVector(normal, -roadWidth / 2 - 0.5);
      const rc3 = p2.clone().addScaledVector(normal, -roadWidth / 2);
      const rc4 = p2.clone().addScaledVector(normal, -roadWidth / 2 - 0.5);

      cp.push(rc1.x, rc1.y + 0.28, rc1.z, rc2.x, rc2.y + 0.28, rc2.z, rc3.x, rc3.y + 0.28, rc3.z, rc4.x, rc4.y + 0.28, rc4.z);
      ci.push(cvi, cvi + 2, cvi + 1, cvi + 1, cvi + 2, cvi + 3);
      cvi += 4;
    }

    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    curbGeo.setIndex(ci);
    curbGeo.computeVertexNormals();

    const curbMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red racing curb
      roughness: 0.5,
      side: THREE.DoubleSide
    });
    const curbMesh = new THREE.Mesh(curbGeo, curbMat);
    curbMesh.renderOrder = 11;

    // 4. Steel Highway Guardrails
    const gp = [], gi = [];
    let gvi = 0;
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xc0c6d4, // Metallic Steel
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide
    });

    for (let i = 0; i < pts.length - 1; i += 2) {
      const p = pts[i], p2 = pts[Math.min(i + 2, pts.length - 1)];
      const t = Math.min(i / (pts.length - 1), 0.999);
      const tangent = curve.getTangentAt(t).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      [-roadWidth / 2 - 0.65, roadWidth / 2 + 0.65].forEach(offset => {
        const gl1 = p.clone().addScaledVector(normal, offset);
        const gl2 = p2.clone().addScaledVector(normal, offset);
        gp.push(gl1.x, gl1.y + 0.2, gl1.z, gl1.x, gl1.y + 0.8, gl1.z, gl2.x, gl2.y + 0.2, gl2.z, gl2.x, gl2.y + 0.8, gl2.z);
        gi.push(gvi, gvi + 2, gvi + 1, gvi + 1, gvi + 2, gvi + 3);
        gvi += 4;
      });
    }

    const railGeo = new THREE.BufferGeometry();
    railGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    railGeo.setIndex(gi);
    railGeo.computeVertexNormals();
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.castShadow = true;
    railMesh.renderOrder = 12;

    const group = new THREE.Group();
    group.add(roadMesh);
    group.add(stripeMesh);
    group.add(curbMesh);
    group.add(railMesh);
    return group;
  }
}
