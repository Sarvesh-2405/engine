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

const MAX_ROAD_POINTS = 700; // keep loop short to avoid jank
const EXTEND_THRESHOLD = 800; // metres to last control point before extending

export class RoadSpline {
  constructor(seed = 42) {
    this.controlPoints = [];
    this.roadPoints    = [];
    this.curve         = null;
    this.headingSeed   = 0;
    this.cpSpacing     = 35;
    this.heightScale   = 12;

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

    // Smooth winding — natural flowing turns
    const turn = (valueNoise(idx * 0.22, 77) - 0.5) * 0.5;
    this.headingSeed += turn;

    const nx = last.x + Math.sin(this.headingSeed) * this.cpSpacing;
    const nz = last.z + Math.cos(this.headingSeed) * this.cpSpacing;
    const ny = this._baseHeight(nx, nz);
    this.controlPoints.push(new THREE.Vector3(nx, ny, nz));
  }

  _initSpline() {
    const originY = this._baseHeight(0, 0);
    this.controlPoints.push(new THREE.Vector3(0, originY, 0));
    for (let i = 0; i < 80; i++) this._addControlPoint();
    this.rebuild();
  }

  rebuild() {
    this.curve = new THREE.CatmullRomCurve3(this.controlPoints, false, 'catmullrom', 0.5);
    const totalLen = this.curve.getLength();
    const num = Math.min(MAX_ROAD_POINTS, Math.max(2, Math.floor(totalLen / 2.0)));
    const pts = this.curve.getSpacedPoints(num);

    const roadData = [];
    let cumDist = 0;

    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i > 0) {
        const prev = pts[i - 1];
        cumDist += p.distanceTo(prev);
      }

      const t = Math.min(i / (pts.length - 1), 0.9999);
      const tangent = this.curve.getTangentAt(t).normalize();
      // Horizontal perpendicular
      const normal2D = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      // Estimate curvature from surrounding tangents
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

      // Banking angle (superelevation inward into turns, up to ~4 degrees)
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
  }

  extendIfNecessary(carPos) {
    const last = this.controlPoints[this.controlPoints.length - 1];
    const distToLast = last.distanceTo(carPos);

    if (distToLast < EXTEND_THRESHOLD) {
      // Add more road ahead
      for (let i = 0; i < 25; i++) this._addControlPoint();

      // Prune OLD control points that are far behind the car
      if (this.controlPoints.length > 120) {
        const excess = this.controlPoints.length - 120;
        this.controlPoints.splice(0, excess);
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

    let minSq = Infinity;
    let closestY = 0;
    let closestPt = null;
    let closestCrossOffset = 0;
    let closestBanking = 0;
    let closestCurvature = 0;
    let closestTangent = null;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const abx = p2.x - p1.x, abz = p2.z - p1.z;
      const apx = x - p1.x,   apz = z - p1.z;
      const ab2 = abx * abx + abz * abz;
      const t   = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
      const projX = p1.x + t * abx;
      const projZ = p1.z + t * abz;
      const dx  = x - projX;
      const dz  = z - projZ;
      const d2  = dx * dx + dz * dz;

      if (d2 < minSq) {
        minSq = d2;
        closestY = p1.y + t * (p2.y - p1.y);
        closestPt = p1;
        closestBanking = p1.banking + t * (p2.banking - p1.banking);
        closestCurvature = p1.curvature + t * (p2.curvature - p1.curvature);
        closestTangent = p1.tangent;

        // Signed cross-track distance (positive to right of tangent, negative to left)
        const cross = dx * p1.normal.x + dz * p1.normal.z;
        closestCrossOffset = cross;
      }
    }

    // Height adjusted for road banking across the road cross section
    const adjustedHeight = closestY + (closestCrossOffset * Math.sin(closestBanking));

    return {
      distance: isFinite(minSq) ? Math.sqrt(minSq) : Infinity,
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
