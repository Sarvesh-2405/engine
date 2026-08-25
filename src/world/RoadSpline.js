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
    return fbm(x * 0.004, z * 0.004, 2) * this.heightScale * 0.5;
  }

  _addControlPoint() {
    const last = this.controlPoints.length
      ? this.controlPoints[this.controlPoints.length - 1]
      : new THREE.Vector3(0, this._baseHeight(0, 0), 0);
    const idx = this.controlPoints.length;

    // Smooth winding — slightly gentler turns for high speed
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
    // Sample at ~2m spacing, capped so getRoadInfo loop is always fast
    const totalLen = this.curve.getLength();
    const num = Math.min(MAX_ROAD_POINTS, Math.max(2, Math.floor(totalLen / 2.0)));
    const pts = this.curve.getSpacedPoints(num);
    this.roadPoints = pts.map(p => ({ x: p.x, y: p.y, z: p.z }));
  }

  extendIfNecessary(carPos) {
    const last = this.controlPoints[this.controlPoints.length - 1];
    const distToLast = last.distanceTo(carPos);

    if (distToLast < EXTEND_THRESHOLD) {
      // Add more road ahead
      for (let i = 0; i < 25; i++) this._addControlPoint();

      // Prune OLD control points that are very far behind the car
      // Keep at most 120 control points total so the curve stays lean
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
    let minSq = Infinity;
    let closestY = 0;
    let closestPt = null;

    // Spatial short-circuit: only scan a window of 200 pts around closest
    // Full scan on first call, then cached
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1];
      const abx = p2.x - p1.x, abz = p2.z - p1.z;
      const apx = x - p1.x,   apz = z - p1.z;
      const ab2 = abx * abx + abz * abz;
      const t   = ab2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
      const dx  = x - (p1.x + t * abx);
      const dz  = z - (p1.z + t * abz);
      const d2  = dx * dx + dz * dz;
      if (d2 < minSq) {
        minSq = d2;
        closestY = p1.y;
        closestPt = p1;
      }
    }

    return {
      distance: isFinite(minSq) ? Math.sqrt(minSq) : Infinity,
      height:   closestY,
      point:    closestPt,
    };
  }
}
