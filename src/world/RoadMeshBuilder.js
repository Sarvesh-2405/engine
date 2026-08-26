import * as THREE from 'three';

// ── Realistic High-Contrast Asphalt Texture ─────────────────
function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width  = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Rich dark slate charcoal asphalt
  ctx.fillStyle = '#222328';
  ctx.fillRect(0, 0, 1024, 1024);

  // Micro-aggregate mineral speckle (fine limestone & basalt granules)
  const imgData = ctx.getImageData(0, 0, 1024, 1024);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 42;
    data[i]     = Math.min(255, Math.max(0, data[i] + noise));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise + 3));
  }
  ctx.putImageData(imgData, 0, 0);

  // Realistic tire rubber wear lanes (darker grooved tire contact tracks)
  const makeRubberTrack = (x1, x2) => {
    const g = ctx.createLinearGradient(x1, 0, x2, 0);
    g.addColorStop(0,   'rgba(12, 13, 16, 0)');
    g.addColorStop(0.2, 'rgba(12, 13, 16, 0.35)');
    g.addColorStop(0.5, 'rgba(12, 13, 16, 0.55)');
    g.addColorStop(0.8, 'rgba(12, 13, 16, 0.35)');
    g.addColorStop(1,   'rgba(12, 13, 16, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x1, 0, x2 - x1, 1024);
  };

  // Left and right lane wheel tracks
  makeRubberTrack(130, 270); // Lane 1 left tire
  makeRubberTrack(290, 430); // Lane 1 right tire
  makeRubberTrack(590, 730); // Lane 2 left tire
  makeRubberTrack(750, 890); // Lane 2 right tire

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 16;
  return texture;
}

// ── Red & White Racing Kerb Texture ───────────────────────
function createKerbTexture() {
  const canvas = document.createElement('canvas');
  canvas.width  = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Alternating vibrant red & crisp white blocks
  ctx.fillStyle = '#ef4444'; // Bright racing red
  ctx.fillRect(0, 0, 128, 64);
  ctx.fillStyle = '#f8fafc'; // Crisp white
  ctx.fillRect(0, 64, 128, 64);

  // Subtle bevel shade
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0,   'rgba(0,0,0,0.20)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.10)');
  g.addColorStop(1,   'rgba(0,0,0,0.30)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// ── Gravel Shoulder Texture ───────────────────────────────
function createShoulderTexture() {
  const canvas = document.createElement('canvas');
  canvas.width  = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Earthy grey-brown gravel
  ctx.fillStyle = '#4a463f';
  ctx.fillRect(0, 0, 256, 256);

  const imgData = ctx.getImageData(0, 0, 256, 256);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 60;
    d[i]   = Math.min(255, Math.max(0, d[i] + n + 4));
    d[i+1] = Math.min(255, Math.max(0, d[i+1] + n));
    d[i+2] = Math.min(255, Math.max(0, d[i+2] + n - 4));
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const _asphaltTex  = createAsphaltTexture();
const _kerbTex     = createKerbTexture();
const _shoulderTex = createShoulderTexture();

export class RoadMeshBuilder {
  /**
   * Builds the complete high-fidelity road group:
   * 1. Main Asphalt surface with arc-length UVs, double-sided materials and banking
   * 2. Side bevelled shoulders & downward ground skirts (no gaps underneath)
   * 3. Crisp solid edge lines & dashed center line
   * 4. Red & white corner apex kerbs on sharp turns
   * 5. Dynamic disappearing roadside barriers (or configurable mode)
   */
  static buildMeshes(roadSpline, roadWidth = 9.8, barrierMode = 'dynamic') {
    const pts = roadSpline.roadPoints;
    if (!pts || pts.length < 2) return new THREE.Group();

    const group = new THREE.Group();
    const subSegs = 8;
    const halfW   = roadWidth * 0.5;
    const ROAD_Y_OFFSET = 0.20; // clean elevation above terrain mesh

    // ── 1. Asphalt Road Surface ─────────────────────────────
    const rPos = [], rUV = [];
    const metersPerRepeat = 6.0;

    for (let i = 0; i < pts.length; i++) {
      const p       = pts[i];
      const norm    = p.normal;
      const banking = p.banking || 0;
      const v       = p.dist / metersPerRepeat;

      for (let s = 0; s <= subSegs; s++) {
        const u      = s / subSegs;
        const offset = -halfW + u * roadWidth;
        const bankY  = offset * Math.sin(banking);
        const px = p.x + norm.x * offset;
        const py = p.y + bankY + ROAD_Y_OFFSET;
        const pz = p.z + norm.z * offset;

        rPos.push(px, py, pz);
        rUV.push(u, v);
      }
    }

    const rIdx   = [];
    const stride = subSegs + 1;
    for (let i = 0; i < pts.length - 1; i++) {
      for (let s = 0; s < subSegs; s++) {
        const a = i * stride + s, b = a + 1;
        const c = (i + 1) * stride + s, d = c + 1;
        // Standard CCW front-facing winding
        rIdx.push(a, b, c, b, d, c);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    roadGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(rUV, 2));
    roadGeo.setIndex(rIdx);
    roadGeo.computeVertexNormals();

    const roadMat = new THREE.MeshStandardMaterial({
      map: _asphaltTex,
      color: 0xffffff,
      roughness: 0.72,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    roadMesh.renderOrder   = 1;
    group.add(roadMesh);

    // ── 2. Roadside Shoulders & Downward Skirts ─────────────
    const sPos = [], sUV = [], sIdx = [];
    let sVertCount = 0;
    const shoulderW = 1.1;
    const skirtDepth = 1.2;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const v1 = p1.dist / metersPerRepeat;
      const v2 = p2.dist / metersPerRepeat;

      // Left shoulder + skirt
      {
        const norm1 = p1.normal, norm2 = p2.normal;
        const b1 = p1.banking || 0, b2 = p2.banking || 0;

        const in1 = new THREE.Vector3(p1.x - norm1.x * halfW, p1.y - halfW * Math.sin(b1) + ROAD_Y_OFFSET, p1.z - norm1.z * halfW);
        const in2 = new THREE.Vector3(p2.x - norm2.x * halfW, p2.y - halfW * Math.sin(b2) + ROAD_Y_OFFSET, p2.z - norm2.z * halfW);

        const out1 = new THREE.Vector3(p1.x - norm1.x * (halfW + shoulderW), in1.y - 0.12, p1.z - norm1.z * (halfW + shoulderW));
        const out2 = new THREE.Vector3(p2.x - norm2.x * (halfW + shoulderW), in2.y - 0.12, p2.z - norm2.z * (halfW + shoulderW));

        const skirt1 = new THREE.Vector3(out1.x, out1.y - skirtDepth, out1.z);
        const skirt2 = new THREE.Vector3(out2.x, out2.y - skirtDepth, out2.z);

        // Shoulder top
        sPos.push(in1.x, in1.y, in1.z,  out1.x, out1.y, out1.z,
                  in2.x, in2.y, in2.z,  out2.x, out2.y, out2.z);
        sUV.push(0, v1,  1, v1,  0, v2,  1, v2);
        sIdx.push(sVertCount, sVertCount + 1, sVertCount + 2, sVertCount + 1, sVertCount + 3, sVertCount + 2);
        sVertCount += 4;

        // Downward skirt
        sPos.push(out1.x, out1.y, out1.z,  skirt1.x, skirt1.y, skirt1.z,
                  out2.x, out2.y, out2.z,  skirt2.x, skirt2.y, skirt2.z);
        sUV.push(0, v1,  1, v1,  0, v2,  1, v2);
        sIdx.push(sVertCount, sVertCount + 1, sVertCount + 2, sVertCount + 1, sVertCount + 3, sVertCount + 2);
        sVertCount += 4;
      }

      // Right shoulder + skirt
      {
        const norm1 = p1.normal, norm2 = p2.normal;
        const b1 = p1.banking || 0, b2 = p2.banking || 0;

        const in1 = new THREE.Vector3(p1.x + norm1.x * halfW, p1.y + halfW * Math.sin(b1) + ROAD_Y_OFFSET, p1.z + norm1.z * halfW);
        const in2 = new THREE.Vector3(p2.x + norm2.x * halfW, p2.y + halfW * Math.sin(b2) + ROAD_Y_OFFSET, p2.z + norm2.z * halfW);

        const out1 = new THREE.Vector3(p1.x + norm1.x * (halfW + shoulderW), in1.y - 0.12, p1.z + norm1.z * (halfW + shoulderW));
        const out2 = new THREE.Vector3(p2.x + norm2.x * (halfW + shoulderW), in2.y - 0.12, p2.z + norm2.z * (halfW + shoulderW));

        const skirt1 = new THREE.Vector3(out1.x, out1.y - skirtDepth, out1.z);
        const skirt2 = new THREE.Vector3(out2.x, out2.y - skirtDepth, out2.z);

        // Shoulder top
        sPos.push(in1.x, in1.y, in1.z,  out1.x, out1.y, out1.z,
                  in2.x, in2.y, in2.z,  out2.x, out2.y, out2.z);
        sUV.push(0, v1,  1, v1,  0, v2,  1, v2);
        sIdx.push(sVertCount, sVertCount + 2, sVertCount + 1, sVertCount + 1, sVertCount + 2, sVertCount + 3);
        sVertCount += 4;

        // Downward skirt
        sPos.push(out1.x, out1.y, out1.z,  skirt1.x, skirt1.y, skirt1.z,
                  out2.x, out2.y, out2.z,  skirt2.x, skirt2.y, skirt2.z);
        sUV.push(0, v1,  1, v1,  0, v2,  1, v2);
        sIdx.push(sVertCount, sVertCount + 2, sVertCount + 1, sVertCount + 1, sVertCount + 2, sVertCount + 3);
        sVertCount += 4;
      }
    }

    const shoulderGeo = new THREE.BufferGeometry();
    shoulderGeo.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
    shoulderGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(sUV, 2));
    shoulderGeo.setIndex(sIdx);
    shoulderGeo.computeVertexNormals();

    const shoulderMat = new THREE.MeshStandardMaterial({
      map: _shoulderTex,
      color: 0xded9cf,
      roughness: 0.94,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const shoulderMesh = new THREE.Mesh(shoulderGeo, shoulderMat);
    shoulderMesh.receiveShadow = true;
    shoulderMesh.renderOrder   = 0;
    group.add(shoulderMesh);

    // ── 3. Road Markings (Solid Edges & Dashed Center) ───────
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.28,
      emissive: 0xffffff,
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide,
    });

    const edgeLineW = 0.22;
    const lPos = [], lIdx = [];
    let lvi = 0;
    const LINE_Y = ROAD_Y_OFFSET + 0.012;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const n1 = p1.normal, n2 = p2.normal;
      const b1 = p1.banking || 0, b2 = p2.banking || 0;

      // Left Solid White Line
      const oL1 = -halfW + 0.10, oL2 = oL1 + edgeLineW;
      const lA1 = new THREE.Vector3(p1.x + n1.x * oL1, p1.y + oL1 * Math.sin(b1) + LINE_Y, p1.z + n1.z * oL1);
      const lB1 = new THREE.Vector3(p1.x + n1.x * oL2, p1.y + oL2 * Math.sin(b1) + LINE_Y, p1.z + n1.z * oL2);
      const lA2 = new THREE.Vector3(p2.x + n2.x * oL1, p2.y + oL1 * Math.sin(b2) + LINE_Y, p2.z + n2.z * oL1);
      const lB2 = new THREE.Vector3(p2.x + n2.x * oL2, p2.y + oL2 * Math.sin(b2) + LINE_Y, p2.z + n2.z * oL2);

      lPos.push(lA1.x, lA1.y, lA1.z,  lB1.x, lB1.y, lB1.z,
                lA2.x, lA2.y, lA2.z,  lB2.x, lB2.y, lB2.z);
      lIdx.push(lvi, lvi+1, lvi+2, lvi+1, lvi+3, lvi+2);
      lvi += 4;

      // Right Solid White Line
      const oR1 = halfW - 0.10 - edgeLineW, oR2 = halfW - 0.10;
      const rA1 = new THREE.Vector3(p1.x + n1.x * oR1, p1.y + oR1 * Math.sin(b1) + LINE_Y, p1.z + n1.z * oR1);
      const rB1 = new THREE.Vector3(p1.x + n1.x * oR2, p1.y + oR2 * Math.sin(b1) + LINE_Y, p1.z + n1.z * oR2);
      const rA2 = new THREE.Vector3(p2.x + n2.x * oR1, p2.y + oR1 * Math.sin(b2) + LINE_Y, p2.z + n2.z * oR1);
      const rB2 = new THREE.Vector3(p2.x + n2.x * oR2, p2.y + oR2 * Math.sin(b2) + LINE_Y, p2.z + n2.z * oR2);

      lPos.push(rA1.x, rA1.y, rA1.z,  rB1.x, rB1.y, rB1.z,
                rA2.x, rA2.y, rA2.z,  rB2.x, rB2.y, rB2.z);
      lIdx.push(lvi, lvi+1, lvi+2, lvi+1, lvi+3, lvi+2);
      lvi += 4;
    }

    // Dashed center line (3.2m dash, 3.2m gap)
    const dashLength = 3.2;
    const gapLength  = 3.2;
    const cycleLen   = dashLength + gapLength;
    const cLineHalfW = 0.12;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const d1 = p1.dist % cycleLen;
      if (d1 > dashLength) continue;

      const n1 = p1.normal, n2 = p2.normal;
      const b1 = p1.banking || 0, b2 = p2.banking || 0;

      const cA1 = new THREE.Vector3(p1.x - n1.x * cLineHalfW, p1.y - cLineHalfW * Math.sin(b1) + LINE_Y, p1.z - n1.z * cLineHalfW);
      const cB1 = new THREE.Vector3(p1.x + n1.x * cLineHalfW, p1.y + cLineHalfW * Math.sin(b1) + LINE_Y, p1.z + n1.z * cLineHalfW);
      const cA2 = new THREE.Vector3(p2.x - n2.x * cLineHalfW, p2.y - cLineHalfW * Math.sin(b2) + LINE_Y, p2.z - n2.z * cLineHalfW);
      const cB2 = new THREE.Vector3(p2.x + n2.x * cLineHalfW, p2.y + cLineHalfW * Math.sin(b2) + LINE_Y, p2.z + n2.z * cLineHalfW);

      lPos.push(cA1.x, cA1.y, cA1.z,  cB1.x, cB1.y, cB1.z,
                cA2.x, cA2.y, cA2.z,  cB2.x, cB2.y, cB2.z);
      lIdx.push(lvi, lvi+1, lvi+2, lvi+1, lvi+3, lvi+2);
      lvi += 4;
    }

    const linesGeo = new THREE.BufferGeometry();
    linesGeo.setAttribute('position', new THREE.Float32BufferAttribute(lPos, 3));
    linesGeo.setIndex(lIdx);
    linesGeo.computeVertexNormals();
    const linesMesh = new THREE.Mesh(linesGeo, lineMat);
    linesMesh.renderOrder = 2;
    group.add(linesMesh);

    // ── 4. Red & White Apex Kerbs on Sharp Turns ──────────────
    const kerbPos = [], kerbUV = [], kerbIdx = [];
    let kvi = 0;
    const kerbWidth = 0.70;
    const kerbHeight = 0.08;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const cur = Math.abs(p1.curvature);
      if (cur < 0.006) continue; // spawn kerbs on turns

      const side = p1.curvature > 0 ? 1 : -1;
      const n1 = p1.normal, n2 = p2.normal;
      const b1 = p1.banking || 0, b2 = p2.banking || 0;
      const v1 = p1.dist * 0.8;
      const v2 = p2.dist * 0.8;

      const innerOff = side * halfW;
      const outerOff = side * (halfW + kerbWidth);

      const kA1 = new THREE.Vector3(p1.x + n1.x * innerOff, p1.y + innerOff * Math.sin(b1) + LINE_Y, p1.z + n1.z * innerOff);
      const kB1 = new THREE.Vector3(p1.x + n1.x * outerOff, p1.y + outerOff * Math.sin(b1) + LINE_Y + kerbHeight, p1.z + n1.z * outerOff);
      const kA2 = new THREE.Vector3(p2.x + n2.x * innerOff, p2.y + innerOff * Math.sin(b2) + LINE_Y, p2.z + n2.z * innerOff);
      const kB2 = new THREE.Vector3(p2.x + n2.x * outerOff, p2.y + outerOff * Math.sin(b2) + LINE_Y + kerbHeight, p2.z + n2.z * outerOff);

      kerbPos.push(kA1.x, kA1.y, kA1.z,  kB1.x, kB1.y, kB1.z,
                   kA2.x, kA2.y, kA2.z,  kB2.x, kB2.y, kB2.z);
      kerbUV.push(0, v1,  1, v1,  0, v2,  1, v2);

      if (side > 0) {
        kerbIdx.push(kvi, kvi+1, kvi+2, kvi+1, kvi+3, kvi+2);
      } else {
        kerbIdx.push(kvi, kvi+2, kvi+1, kvi+1, kvi+2, kvi+3);
      }
      kvi += 4;
    }

    if (kerbPos.length > 0) {
      const kerbGeo = new THREE.BufferGeometry();
      kerbGeo.setAttribute('position', new THREE.Float32BufferAttribute(kerbPos, 3));
      kerbGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(kerbUV, 2));
      kerbGeo.setIndex(kerbIdx);
      kerbGeo.computeVertexNormals();

      const kerbMat = new THREE.MeshStandardMaterial({
        map: _kerbTex,
        roughness: 0.45,
        metalness: 0.05,
        side: THREE.DoubleSide,
      });
      const kerbMesh = new THREE.Mesh(kerbGeo, kerbMat);
      kerbMesh.receiveShadow = true;
      kerbMesh.castShadow = true;
      kerbMesh.renderOrder = 3;
      group.add(kerbMesh);
    }

    // ── 5. Dynamic Roadside Barriers (Disappearing on Straights) ─
    if (barrierMode !== 'none') {
      const railMat = new THREE.MeshStandardMaterial({
        color: 0xc8d0d8,
        metalness: 0.88,
        roughness: 0.20,
        side: THREE.DoubleSide,
      });

      const postMat = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        metalness: 0.65,
        roughness: 0.5,
      });

      const postGeo = new THREE.BoxGeometry(0.08, 0.80, 0.08);
      const railGroup = new THREE.Group();

      [-1, 1].forEach(side => {
        const railOffset = side * (halfW + 0.95);

        // Identify which indices need barriers
        const needsBarrier = new Array(pts.length).fill(false);

        for (let i = 0; i < pts.length; i++) {
          if (barrierMode === 'all') {
            needsBarrier[i] = true;
            continue;
          }

          const cur = pts[i].curvature;
          const isOutsideSharpCurve = side === 1 ? cur < -0.004 : cur > 0.004;
          const isExtremeCurve      = Math.abs(cur) > 0.007;
          const isLowNearWater      = pts[i].y < 6.2; // near water causeway

          if (isOutsideSharpCurve || isExtremeCurve || isLowNearWater) {
            const radius = 6;
            for (let k = Math.max(0, i - radius); k <= Math.min(pts.length - 1, i + radius); k++) {
              needsBarrier[k] = true;
            }
          }
        }

        // Build continuous segments of barrier with smooth tapered terminals
        let inSegment = false;
        let segStart = 0;
        const segments = [];

        for (let i = 0; i < pts.length; i++) {
          if (needsBarrier[i] && !inSegment) {
            inSegment = true;
            segStart = i;
          } else if (!needsBarrier[i] && inSegment) {
            inSegment = false;
            if (i - segStart >= 3) {
              segments.push({ start: segStart, end: i - 1 });
            }
          }
        }
        if (inSegment && pts.length - 1 - segStart >= 3) {
          segments.push({ start: segStart, end: pts.length - 1 });
        }

        if (segments.length === 0) return;

        // Render each barrier segment
        const bPos = [], bIdx = [];
        let bvi = 0;
        const postTransforms = [];

        segments.forEach(seg => {
          const segLen = seg.end - seg.start;
          const taperSpan = Math.min(4, Math.floor(segLen * 0.3));

          for (let i = seg.start; i < seg.end; i++) {
            const p1 = pts[i], p2 = pts[i + 1];
            const n1 = p1.normal, n2 = p2.normal;
            const b1 = p1.banking || 0, b2 = p2.banking || 0;

            const distFromStart = i - seg.start;
            const distFromEnd   = seg.end - i;
            const taperFactor1  = Math.min(1.0, Math.min(distFromStart, distFromEnd) / Math.max(1, taperSpan));
            const taperFactor2  = Math.min(1.0, Math.min(distFromStart + 1, distFromEnd - 1) / Math.max(1, taperSpan));

            const baseHeight1 = (ROAD_Y_OFFSET + 0.12) * taperFactor1;
            const topHeight1  = (ROAD_Y_OFFSET + 0.45) * taperFactor1;
            const baseHeight2 = (ROAD_Y_OFFSET + 0.12) * taperFactor2;
            const topHeight2  = (ROAD_Y_OFFSET + 0.45) * taperFactor2;

            const A1 = new THREE.Vector3(p1.x + n1.x * railOffset, p1.y + railOffset * Math.sin(b1) + baseHeight1, p1.z + n1.z * railOffset);
            const B1 = new THREE.Vector3(p1.x + n1.x * railOffset, p1.y + railOffset * Math.sin(b1) + topHeight1,  p1.z + n1.z * railOffset);
            const A2 = new THREE.Vector3(p2.x + n2.x * railOffset, p2.y + railOffset * Math.sin(b2) + baseHeight2, p2.z + n2.z * railOffset);
            const B2 = new THREE.Vector3(p2.x + n2.x * railOffset, p2.y + railOffset * Math.sin(b2) + topHeight2,  p2.z + n2.z * railOffset);

            bPos.push(A1.x, A1.y, A1.z,  B1.x, B1.y, B1.z,
                      A2.x, A2.y, A2.z,  B2.x, B2.y, B2.z);
            bIdx.push(bvi, bvi+1, bvi+2, bvi+1, bvi+3, bvi+2);
            bvi += 4;

            // Add posts every 3rd step
            if (i % 3 === 0 && taperFactor1 > 0.3) {
              const postMat4 = new THREE.Matrix4();
              const postPos = new THREE.Vector3(p1.x + n1.x * railOffset, p1.y + railOffset * Math.sin(b1) + (ROAD_Y_OFFSET + 0.20) * taperFactor1, p1.z + n1.z * railOffset);
              postMat4.setPosition(postPos);
              postTransforms.push(postMat4);
            }
          }
        });

        if (bPos.length > 0) {
          const bGeo = new THREE.BufferGeometry();
          bGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
          bGeo.setIndex(bIdx);
          bGeo.computeVertexNormals();
          const beamMesh = new THREE.Mesh(bGeo, railMat);
          beamMesh.castShadow = true;
          beamMesh.receiveShadow = true;
          beamMesh.renderOrder = 4;
          railGroup.add(beamMesh);
        }

        if (postTransforms.length > 0) {
          const iPostMesh = new THREE.InstancedMesh(postGeo, postMat, postTransforms.length);
          iPostMesh.castShadow = true;
          for (let p = 0; p < postTransforms.length; p++) {
            iPostMesh.setMatrixAt(p, postTransforms[p]);
          }
          iPostMesh.instanceMatrix.needsUpdate = true;
          railGroup.add(iPostMesh);
        }
      });

      group.add(railGroup);
    }

    return group;
  }
}
