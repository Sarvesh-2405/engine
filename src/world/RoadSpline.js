import * as THREE from 'three';

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi),     b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
}

export function fbm(x, y, octaves = 4) {
  let total = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    total += valueNoise(x * freq, y * freq) * amp;
    freq *= 2; amp *= 0.5;
  }
  return total;
}

const EXTEND_THRESHOLD  = 1200; // Extend when car is within 1.2km of the road end
const MIN_BEHIND_POINTS = 45;   // Keep at least 45 control points (~1.5km) behind car at all times
const GRID_CELL_SIZE    = 50.0; // Spatial hash cell size in meters

export class RoadSpline {
  constructor(seed = 42) {
    this.controlPoints = [];
    this.roadPoints    = [];
    this.curve         = null;
    this.headingSeed   = 0;
    this.cpSpacing     = 35;
    this.heightScale   = 12;
    this.spatialGrid   = new Map();

    this._initSpline();
  }

  _baseHeight(x, z) {
    return 4.8 + fbm(x * 0.0035, z * 0.0035, 3) * this.heightScale;
  }

  _addControlPoint() {
    const last = this.controlPoints.length
      ? this.controlPoints[this.controlPoints.length - 1]
      : new THREE.Vector3(0, this._baseHeight(0, 0), 0);
    const idx = this.controlPoints.length;

    const turn = (valueNoise(idx * 0.22, 77) - 0.5) * 0.48;
    this.headingSeed += turn;

    const nx = last.x + Math.sin(this.headingSeed) * this.cpSpacing;
    const nz = last.z + Math.cos(this.headingSeed) * this.cpSpacing;
    const ny = this._baseHeight(nx, nz);
    this.controlPoints.push(new THREE.Vector3(nx, ny, nz));
  }

  _initSpline() {
    const originY = this._baseHeight(0, 0);
    this.controlPoints.push(new THREE.Vector3(0, originY, 0));
    for (let i = 0; i < 90; i++) this._addControlPoint();
    this.rebuild();
  }

  rebuild() {
    if (this.controlPoints.length < 4) return;

    this.curve = new THREE.CatmullRomCurve3(this.controlPoints, false, 'catmullrom', 0.5);
    const totalLen = this.curve.getLength();
    // 1 sample per ~3 meters along the spline
    const num = Math.max(20, Math.floor(totalLen / 3.0));
    const pts = this.curve.getSpacedPoints(num);

    const roadData = [];
    let cumDist = 0;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i > 0) {
        cumDist += p.distanceTo(pts[i - 1]);
      }

      const t = Math.min(i / (pts.length - 1), 0.9999);
      const tangent = this.curve.getTangentAt(t).normalize();
      const normal2D = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      let curvature = 0;
      if (i > 0 && i < pts.length - 1) {
        const tPrev = Math.max(0, (i - 1) / (pts.length - 1));
        const tNext = Math.min(1, (i + 1) / (pts.length - 1));
        const tanPrev = this.curve.getTangentAt(tPrev).normalize();
        const tanNext = this.curve.getTangentAt(tNext).normalize();
        const crossY = tanPrev.x * tanNext.z - tanPrev.z * tanNext.x;
        const segDist = pts[i + 1].distanceTo(pts[i - 1]);
        curvature = segDist > 0.001 ? crossY / segDist : 0;
      }

      const banking = THREE.MathUtils.clamp(-curvature * 14.0, -0.07, 0.07);

      roadData.push({
        x: p.x,
        y: p.y,
        z: p.z,
        dist: cumDist,
        tangent,
        normal: normal2D,
        curvature,
        banking,
        t,
      });
    }

    this.roadPoints = roadData;

    // ── Build Fast Spatial Grid ──────────────────────────────
    this.spatialGrid.clear();
    const pad = 18.0;

    for (let i = 0; i < roadData.length - 1; i++) {
      const p1 = roadData[i];
      const p2 = roadData[i + 1];

      const minX = Math.min(p1.x, p2.x) - pad;
      const maxX = Math.max(p1.x, p2.x) + pad;
      const minZ = Math.min(p1.z, p2.z) - pad;
      const maxZ = Math.max(p1.z, p2.z) + pad;

      const minCellX = Math.floor(minX / GRID_CELL_SIZE);
      const maxCellX = Math.floor(maxX / GRID_CELL_SIZE);
      const minCellZ = Math.floor(minZ / GRID_CELL_SIZE);
      const maxCellZ = Math.floor(maxZ / GRID_CELL_SIZE);

      for (let cx = minCellX; cx <= maxCellX; cx++) {
        for (let cz = minCellZ; cz <= maxCellZ; cz++) {
          const key = `${cx},${cz}`;
          let cell = this.spatialGrid.get(key);
          if (!cell) {
            cell = [];
            this.spatialGrid.set(key, cell);
          }
          cell.push(i);
        }
      }
    }
  }

  extendIfNecessary(carPos) {
    if (!this.controlPoints.length) return false;

    const last = this.controlPoints[this.controlPoints.length - 1];
    const distToLast = last.distanceTo(carPos);

    if (distToLast < EXTEND_THRESHOLD) {
      // 1. Add 35 new control points ahead (~1.2km)
      for (let i = 0; i < 35; i++) this._addControlPoint();

      // 2. Find the control point closest to the car's current position
      let closestIdx = 0;
      let minDistSq = Infinity;
      for (let i = 0; i < this.controlPoints.length; i++) {
        const d2 = this.controlPoints[i].distanceToSquared(carPos);
        if (d2 < minDistSq) {
          minDistSq = d2;
          closestIdx = i;
        }
      }

      // 3. ONLY prune points that are far BEHIND the car (keeping at least 45 points / ~1.5km behind)
      if (closestIdx > (MIN_BEHIND_POINTS + 15)) {
        const pruneCount = closestIdx - MIN_BEHIND_POINTS;
        this.controlPoints.splice(0, pruneCount);
      }

      this.rebuild();
      return true;
    }
    return false;
  }

  getRoadInfo(x, z) {
    const pts = this.roadPoints;
    if (!pts || pts.length < 2) {
      return { distance: Infinity, height: 0, point: null, crossOffset: 0, banking: 0, curvature: 0 };
    }

    const centerCellX = Math.floor(x / GRID_CELL_SIZE);
    const centerCellZ = Math.floor(z / GRID_CELL_SIZE);

    let minSq = Infinity;
    let closestY = 0;
    let closestPt = null;
    let closestCrossOffset = 0;
    let closestBanking = 0;
    let closestCurvature = 0;
    let closestTangent = null;
    let testedCount = 0;

    // Query 3x3 neighboring cells to ensure 100% continuous coverage across cell borders
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = `${centerCellX + dx},${centerCellZ + dz}`;
        const candidateIndices = this.spatialGrid.get(key);
        if (!candidateIndices) continue;

        for (let k = 0; k < candidateIndices.length; k++) {
          const i = candidateIndices[k];
          const p1 = pts[i];
          const p2 = pts[i + 1];
          if (!p2) continue;

          testedCount++;
          const abx = p2.x - p1.x, abz = p2.z - p1.z;
          const apx = x - p1.x,   apz = z - p1.z;
          const ab2 = abx * abx + abz * abz;
          const t   = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
          const projX = p1.x + t * abx;
          const projZ = p1.z + t * abz;
          const pdx = x - projX;
          const pdz = z - projZ;
          const d2  = pdx * pdx + pdz * pdz;

          if (d2 < minSq) {
            minSq = d2;
            closestY = p1.y + t * (p2.y - p1.y);
            closestPt = p1;
            closestBanking = p1.banking + t * (p2.banking - p1.banking);
            closestCurvature = p1.curvature + t * (p2.curvature - p1.curvature);
            closestTangent = p1.tangent;

            const cross = pdx * p1.normal.x + pdz * p1.normal.z;
            closestCrossOffset = cross;
          }
        }
      }
    }

    if (testedCount === 0 || !isFinite(minSq)) {
      return { distance: Infinity, height: 0, point: null, crossOffset: 0, banking: 0, curvature: 0 };
    }

    const adjustedHeight = closestY + (closestCrossOffset * Math.sin(closestBanking));

    return {
      distance: Math.sqrt(minSq),
      height:   adjustedHeight,
      rawHeight: closestY,
      point:    closestPt,
      crossOffset: closestCrossOffset,
      banking:  closestBanking,
      curvature: closestCurvature,
      tangent:  closestTangent,
    };
  }
}
