import * as THREE from 'three';

export class VehicleController {
  constructor(carMesh) {
    this.carMesh = carMesh;

    this.position      = new THREE.Vector3(0, 0, 0);
    this.velocity      = new THREE.Vector3(0, 0, 0);
    this.headingAngle  = 0;

    // F1-level speeds
    this.baseMaxSpeed    = 160.0;  // ~576 km/h
    this.boostMaxSpeed   = 200.0;
    this.maxSpeed        = 160.0;
    this.accelerationForce  = 180.0;
    this.brakeForce      = 130.0;
    this.reverseForce    = 28.0;
    this.dragCoeff       = 0.003;
    this.rollingFriction = 0.018;

    this.maxSteerAngle   = 0.42;
    this.steerSpeed      = 5.5;
    this.currentSteerAngle = 0;

    this.chassisRoll   = 0;
    this.chassisPitch  = 0;

    this.speedKmh        = 0;
    this.gear            = 1;
    this.rpm             = 1000;
    this.isBraking       = false;
    this.isOnRoad        = true;
    this.isBoosting      = false;
    this.distToRoadCenter = 0;
    this.distanceTravelled = 0;

    // Smoothed internal state
    this._offRoadFactor  = 1.0;
    this._smoothY        = null; // null until first terrain sample

    // Autodrive
    this.autodriveEnabled = false;
    this._roadSplineRef   = null;

    this.inputs = {
      forward: false, backward: false,
      left: false, right: false,
      handbrake: false, boost: false
    };
  }

  setInputs(forward, backward, left, right, handbrake = false, boost = false) {
    if (!this.autodriveEnabled) {
      this.inputs.forward   = forward;
      this.inputs.backward  = backward;
      this.inputs.left      = left;
      this.inputs.right     = right;
      this.inputs.handbrake = handbrake;
      this.inputs.boost     = boost;
    }
  }

  setAutodrive(enabled) {
    this.autodriveEnabled = enabled;
    if (!enabled) {
      this.inputs.forward = this.inputs.left = this.inputs.right = false;
    }
  }

  _computeAutodriveInputs() {
    const spline = this._roadSplineRef;
    if (!spline || !spline.roadPoints || spline.roadPoints.length < 2) return;
    const pts = spline.roadPoints;

    let minSq = Infinity, closestIdx = 0;
    for (let i = 0; i < pts.length; i++) {
      const dx = pts[i].x - this.position.x;
      const dz = pts[i].z - this.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minSq) { minSq = d2; closestIdx = i; }
    }

    const aheadIdx = Math.min(closestIdx + 10, pts.length - 1);
    const target   = pts[aheadIdx];
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const desired = Math.atan2(dx, dz);
    let diff = desired - this.headingAngle;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    this.inputs.forward  = true;
    this.inputs.backward = false;
    this.inputs.left     = diff > 0.05;
    this.inputs.right    = diff < -0.05;
    this.inputs.boost    = this.speedKmh < 260;
    this.inputs.handbrake = false;
  }

  update(dt, terrainHeightFn, roadDistanceFn) {
    // Clamp dt defensively
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);

    if (this.autodriveEnabled) this._computeAutodriveInputs();

    this.isBoosting = this.inputs.boost && this.inputs.forward;
    const accelMult = this.isBoosting ? 1.55 : 1.0;
    this.maxSpeed   = this.isBoosting ? this.boostMaxSpeed : this.baseMaxSpeed;

    // ── Steering ──────────────────────────────────────────
    let steerTarget = 0;
    if (this.inputs.left)  steerTarget += this.maxSteerAngle;
    if (this.inputs.right) steerTarget -= this.maxSteerAngle;

    const currentSpeedMag = this.velocity.length();
    const speedRatio = Math.min(currentSpeedMag / this.maxSpeed, 1.0);
    this.currentSteerAngle = THREE.MathUtils.lerp(
      this.currentSteerAngle, steerTarget,
      this.steerSpeed * (1.0 - speedRatio * 0.3) * safeDt
    );

    // ── Road distance (smoothed) ───────────────────────────
    if (roadDistanceFn) {
      const info = roadDistanceFn(this.position.x, this.position.z);
      this.distToRoadCenter = (info && isFinite(info.distance)) ? info.distance : 99;
      const onRoad = this.distToRoadCenter <= 5.5;
      this.isOnRoad = onRoad;
      const targetOffRoad = onRoad ? 1.0 : 0.62;
      this._offRoadFactor = THREE.MathUtils.lerp(this._offRoadFactor, targetOffRoad, 4.0 * safeDt);
    }

    // ── Engine force ──────────────────────────────────────
    const fwd = new THREE.Vector3(Math.sin(this.headingAngle), 0, Math.cos(this.headingAngle));
    const rgt = new THREE.Vector3(Math.cos(this.headingAngle), 0, -Math.sin(this.headingAngle));
    const forwardSpeed = this.velocity.dot(fwd);
    this.isBraking = false;

    let engineForce = 0;
    if (this.inputs.forward) {
      if (forwardSpeed < -0.5) {
        engineForce = this.brakeForce; this.isBraking = true;
      } else {
        const accelCurve = Math.max(0.12, 1.0 - Math.pow(forwardSpeed / (this.maxSpeed * this._offRoadFactor), 1.1));
        engineForce = this.accelerationForce * accelMult * accelCurve * this._offRoadFactor;
      }
    } else if (this.inputs.backward) {
      if (forwardSpeed > 0.5) {
        engineForce = -this.brakeForce; this.isBraking = true;
      } else {
        engineForce = -this.reverseForce * this._offRoadFactor;
      }
    }

    if (this.inputs.handbrake) { engineForce *= 0.1; this.isBraking = true; }

    // ── Velocity integration ──────────────────────────────
    this.velocity.addScaledVector(fwd, engineForce * safeDt);

    const speed    = this.velocity.length();
    const drag     = (this.dragCoeff * speed * speed + this.rollingFriction)
                     * (this.isOnRoad ? 1.0 : 2.2);
    this.velocity.addScaledVector(this.velocity.clone().normalize(), -Math.min(drag * safeDt, speed));

    if (speed < 0.04 && !this.inputs.forward && !this.inputs.backward) {
      this.velocity.set(0, 0, 0);
    }

    // Lateral grip
    const lateralSpeed = this.velocity.dot(rgt);
    const grip = this.inputs.handbrake ? 0.76 : (this.isOnRoad ? 0.96 : 0.80);
    this.velocity.addScaledVector(rgt, -lateralSpeed * grip);

    // ── Yaw ───────────────────────────────────────────────
    if (Math.abs(forwardSpeed) > 0.1) {
      const turnDir  = forwardSpeed > 0 ? 1 : -1;
      const turnRate = (forwardSpeed / 2.5) * Math.sin(this.currentSteerAngle) * turnDir;
      this.headingAngle += turnRate * safeDt;
    }

    // ── Horizontal position ───────────────────────────────
    const prevX = this.position.x, prevZ = this.position.z;
    this.position.x += this.velocity.x * safeDt;
    this.position.z += this.velocity.z * safeDt;

    // NaN guard for position
    if (!isFinite(this.position.x) || !isFinite(this.position.z)) {
      this.position.set(prevX, this.position.y || 0, prevZ);
      this.velocity.set(0, 0, 0);
    }

    this.distanceTravelled += Math.sqrt(
      Math.pow(this.position.x - prevX, 2) + Math.pow(this.position.z - prevZ, 2)
    );

    // ── Terrain snapping — smooth & no underground ────────
    let groundY = 0;
    let slopePitch = 0, slopeRoll = 0;

    if (terrainHeightFn) {
      const sh = this.headingAngle;
      const rawY  = terrainHeightFn(this.position.x, this.position.z);
      const hF = terrainHeightFn(this.position.x + Math.sin(sh) * 1.5, this.position.z + Math.cos(sh) * 1.5);
      const hB = terrainHeightFn(this.position.x - Math.sin(sh) * 1.5, this.position.z - Math.cos(sh) * 1.5);
      const hR = terrainHeightFn(this.position.x + Math.cos(sh) * 1.5, this.position.z - Math.sin(sh) * 1.5);
      const hL = terrainHeightFn(this.position.x - Math.cos(sh) * 1.5, this.position.z + Math.sin(sh) * 1.5);

      // Guard all samples
      groundY    = isFinite(rawY) ? rawY : 0;
      const safeF = isFinite(hF) ? hF : groundY;
      const safeB = isFinite(hB) ? hB : groundY;
      const safeR = isFinite(hR) ? hR : groundY;
      const safeL = isFinite(hL) ? hL : groundY;

      slopePitch = Math.atan2(safeF - safeB, 3.0);
      slopeRoll  = Math.atan2(safeL - safeR, 3.0);
    }

    // Clamp slope angles to avoid wild flipping
    slopePitch = THREE.MathUtils.clamp(slopePitch, -0.5, 0.5);
    slopeRoll  = THREE.MathUtils.clamp(slopeRoll,  -0.5, 0.5);

    // Car sits 0.25m above road surface, 0.35m above raw terrain off-road
    const surfaceOffset = this.isOnRoad ? 0.25 : 0.35;
    const targetY = groundY + surfaceOffset;

    // Smooth Y interpolation — prevents sudden pop-through-terrain
    if (this._smoothY === null) {
      this._smoothY = targetY;
    } else {
      // Fast snap downward (fall), smooth snap upward (rise)
      const yDiff = targetY - this._smoothY;
      const snapSpeed = yDiff < 0 ? 20.0 : 12.0; // fall quickly, rise smoothly
      this._smoothY = THREE.MathUtils.lerp(this._smoothY, targetY, snapSpeed * safeDt);
      // Never let car go below ground
      this._smoothY = Math.max(this._smoothY, targetY);
    }

    this.position.y = this._smoothY;

    // Chassis orientation
    const targetPitch = slopePitch + (this.inputs.forward ? -0.05 : (this.inputs.backward ? 0.08 : 0)) * speedRatio;
    const targetRoll  = slopeRoll + (this.currentSteerAngle * 0.20) * speedRatio;
    this.chassisPitch = THREE.MathUtils.lerp(this.chassisPitch, targetPitch, 10.0 * safeDt);
    this.chassisRoll  = THREE.MathUtils.lerp(this.chassisRoll,  targetRoll,  10.0 * safeDt);

    // Guard NaN in rotation
    if (!isFinite(this.chassisPitch)) this.chassisPitch = 0;
    if (!isFinite(this.chassisRoll))  this.chassisRoll  = 0;
    if (!isFinite(this.headingAngle)) this.headingAngle = 0;

    this.carMesh.root.position.copy(this.position);
    this.carMesh.root.rotation.set(this.chassisPitch, this.headingAngle, this.chassisRoll, 'YXZ');

    // ── Speedometer & Gears ───────────────────────────────
    const rawSpeed = this.velocity.length() * 3.6;
    this.speedKmh = isFinite(rawSpeed) ? Math.round(rawSpeed) : 0;

    if      (this.speedKmh < 80)  this.gear = 1;
    else if (this.speedKmh < 160) this.gear = 2;
    else if (this.speedKmh < 260) this.gear = 3;
    else if (this.speedKmh < 370) this.gear = 4;
    else if (this.speedKmh < 490) this.gear = 5;
    else if (this.speedKmh < 600) this.gear = 6;
    else                          this.gear = 7;

    const gearBands = [0, 80, 160, 260, 370, 490, 600, 800];
    const lo = gearBands[this.gear - 1], hi = gearBands[this.gear];
    const rpmPct = hi > lo ? (this.speedKmh - lo) / (hi - lo) : 0;
    this.rpm = Math.round(2000 + rpmPct * 10000 + (this.inputs.forward ? 1500 : 0));
    this.rpm = Math.min(14000, Math.max(800, this.rpm));

    this.carMesh.updateVisuals(this.currentSteerAngle, speedRatio, this.isBraking, safeDt);
  }
}
