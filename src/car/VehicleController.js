import * as THREE from 'three';

export class VehicleController {
  constructor(carMesh) {
    this.carMesh = carMesh;

    this.position      = new THREE.Vector3(0, 0, 0);
    this.velocity      = new THREE.Vector3(0, 0, 0);
    this.headingAngle  = 0;

    // Calibrated realistic Formula 1 speeds (Base ~300 km/h, Boost ~360 km/h)
    this.baseMaxSpeed    = 83.33;  // ~300 km/h
    this.boostMaxSpeed   = 100.0;  // ~360 km/h
    this.maxSpeed        = 83.33;
    this.accelerationForce  = 72.0;
    this.brakeForce      = 90.0;
    this.reverseForce    = 20.0;
    this.dragCoeff       = 0.0025;
    this.rollingFriction = 0.018;

    // Calibrated steering (moderately quick, smooth, and perfectly responsive)
    this.maxSteerAngle   = 0.34; // ~19.5 degrees max steer
    this.steerSpeed      = 5.5;  // Responsive, fluid steer-in speed
    this.currentSteerAngle = 0;

    this.chassisRoll   = 0;
    this.chassisPitch  = 0;

    this.speedKmh        = 0;
    this.gear            = 1;
    this.rpm             = 1000;
    this.isBraking       = false;
    this.isOnRoad        = true;
    this.isBoosting      = false;
    this.isDrifting      = false;
    this.distToRoadCenter = 0;
    this.distanceTravelled = 0;

    // Smoothed internal state
    this._offRoadFactor  = 1.0;
    this._smoothY        = null;
    this._rumbleTime     = 0;

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

    const aheadIdx = Math.min(closestIdx + 8, pts.length - 1);
    const target   = pts[aheadIdx];
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const desired = Math.atan2(dx, dz);
    let diff = desired - this.headingAngle;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    this.inputs.forward  = true;
    this.inputs.backward = false;
    this.inputs.left     = diff > 0.04;
    this.inputs.right    = diff < -0.04;
    this.inputs.boost    = this.speedKmh < 240;
    this.inputs.handbrake = false;
  }

  update(dt, terrainHeightFn, roadDistanceFn) {
    // Clamp dt defensively
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);

    if (this.autodriveEnabled) this._computeAutodriveInputs();

    this.isBoosting = this.inputs.boost && this.inputs.forward;
    const accelMult = this.isBoosting ? 1.48 : 1.0;
    this.maxSpeed   = this.isBoosting ? this.boostMaxSpeed : this.baseMaxSpeed;

    const currentSpeedMag = this.velocity.length();
    const speedRatio = Math.min(currentSpeedMag / this.maxSpeed, 1.0);

    // ── Calibrated Speed-Sensitive Steering ────────────────
    const speedSensitivity = 1.0 / (1.0 + speedRatio * 0.9);
    const maxActiveSteer = this.maxSteerAngle * speedSensitivity;

    let steerTarget = 0;
    if (this.inputs.left)  steerTarget += maxActiveSteer;
    if (this.inputs.right) steerTarget -= maxActiveSteer;

    this.currentSteerAngle = THREE.MathUtils.lerp(
      this.currentSteerAngle, steerTarget,
      this.steerSpeed * safeDt
    );

    // ── Road distance & Off-road handling ───────────────────
    let roadBanking = 0;
    if (roadDistanceFn) {
      const info = roadDistanceFn(this.position.x, this.position.z);
      this.distToRoadCenter = (info && isFinite(info.distance)) ? info.distance : 99;
      const onRoad = this.distToRoadCenter <= 5.2;
      this.isOnRoad = onRoad;
      if (info && info.banking) roadBanking = info.banking;

      const targetOffRoad = onRoad ? 1.0 : 0.45;
      this._offRoadFactor = THREE.MathUtils.lerp(this._offRoadFactor, targetOffRoad, 3.5 * safeDt);
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
        const accelCurve = Math.max(0.12, 1.0 - Math.pow(forwardSpeed / (this.maxSpeed * this._offRoadFactor), 1.15));
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

    const speed = this.velocity.length();
    const offRoadDragMult = this.isOnRoad ? 1.0 : 3.2;
    const drag = (this.dragCoeff * speed * speed + this.rollingFriction) * offRoadDragMult;
    this.velocity.addScaledVector(this.velocity.clone().normalize(), -Math.min(drag * safeDt, speed));

    if (speed < 0.04 && !this.inputs.forward && !this.inputs.backward) {
      this.velocity.set(0, 0, 0);
    }

    // Lateral grip & Drifting
    const lateralSpeed = this.velocity.dot(rgt);
    const slipRatio = Math.abs(lateralSpeed) / (speed + 0.1);
    this.isDrifting = (slipRatio > 0.28 && speedRatio > 0.15) || (this.inputs.handbrake && speedRatio > 0.1);

    const grip = this.inputs.handbrake ? 0.68 : (this.isOnRoad ? 0.96 : 0.74);
    this.velocity.addScaledVector(rgt, -lateralSpeed * grip);

    // ── Smooth Yaw (Progressive Turning) ────────────────────
    if (Math.abs(forwardSpeed) > 0.1) {
      const turnDir  = forwardSpeed > 0 ? 1 : -1;
      const driftBonus = this.inputs.handbrake ? 1.3 : 1.0;
      // Controlled turn rate that feels natural, agile, and not too twitchy
      const turnRate = Math.sin(this.currentSteerAngle) * (3.4 + speedRatio * 1.2) * turnDir * driftBonus;
      const clampedTurnRate = THREE.MathUtils.clamp(turnRate, -2.2, 2.2);
      this.headingAngle += clampedTurnRate * safeDt;
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

    // ── 4-Wheel Terrain Sampling & Ground Contact Clamping ──
    let slopePitch = 0, slopeRoll = 0;
    let targetY = 0;

    if (terrainHeightFn) {
      const sh = this.headingAngle;
      const fwdX = Math.sin(sh), fwdZ = Math.cos(sh);
      const rgtX = Math.cos(sh), rgtZ = -Math.sin(sh);

      // Wheel contact offsets relative to vehicle center
      const frontDist = 1.5;
      const rearDist  = 1.3;
      const halfTrack = 0.8;

      // Sample ground elevation directly beneath all 4 wheels
      const yFL = terrainHeightFn(this.position.x + fwdX * frontDist - rgtX * halfTrack, this.position.z + fwdZ * frontDist - rgtZ * halfTrack);
      const yFR = terrainHeightFn(this.position.x + fwdX * frontDist + rgtX * halfTrack, this.position.z + fwdZ * frontDist + rgtZ * halfTrack);
      const yRL = terrainHeightFn(this.position.x - fwdX * rearDist - rgtX * halfTrack, this.position.z - fwdZ * rearDist - rgtZ * halfTrack);
      const yRR = terrainHeightFn(this.position.x - fwdX * rearDist + rgtX * halfTrack, this.position.z - fwdZ * rearDist + rgtZ * halfTrack);

      const safeFL = isFinite(yFL) ? yFL : 0;
      const safeFR = isFinite(yFR) ? yFR : 0;
      const safeRL = isFinite(yRL) ? yRL : 0;
      const safeRR = isFinite(yRR) ? yRR : 0;

      const avgFront = (safeFL + safeFR) * 0.5;
      const avgRear  = (safeRL + safeRR) * 0.5;
      const avgLeft  = (safeFL + safeRL) * 0.5;
      const avgRight = (safeFR + safeRR) * 0.5;

      const wheelbase  = frontDist + rearDist; // 2.8m
      const trackWidth = halfTrack * 2.0;    // 1.6m

      // MATHEMATICALLY CORRECT ORIENTATION FOR THREE.JS ('YXZ' Euler order):
      // -X rotation tilts nose UP (+Z upwards) when climbing uphill (avgFront > avgRear)
      // -Z rotation tilts left side UP (-X upwards) when left side is higher (avgLeft > avgRight)
      slopePitch = -Math.atan2(avgFront - avgRear, wheelbase);
      slopeRoll  = -Math.atan2(avgLeft - avgRight, trackWidth);

      // Clamp slope angles defensively
      slopePitch = THREE.MathUtils.clamp(slopePitch, -0.45, 0.45);
      slopeRoll  = THREE.MathUtils.clamp(slopeRoll,  -0.40, 0.40);

      // Exact tire contact height (average ground height beneath all 4 tire patches)
      const wheelBaseGround = (safeFL + safeFR + safeRL + safeRR) * 0.25;

      // When the car is on the road, match the elevated road surface with zero air gap
      targetY = wheelBaseGround + (this.isOnRoad ? 0.22 : 0.02);
    }

    // ── Firm ground tracking & smooth suspension damping ──
    if (this._smoothY === null) {
      this._smoothY = targetY;
    } else {
      const trackSpeed = 38.0;
      this._smoothY = THREE.MathUtils.lerp(this._smoothY, targetY, Math.min(1.0, trackSpeed * safeDt));
    }

    this.position.y = this._smoothY;

    // ── Off-road micro-rumble tactile feedback ─────────────
    let rumble = 0;
    if (!this.isOnRoad && speedRatio > 0.05) {
      this._rumbleTime += safeDt * (24.0 + speedRatio * 30.0);
      rumble = (Math.sin(this._rumbleTime) * 0.005 + Math.sin(this._rumbleTime * 2.3) * 0.003) * speedRatio;
    }

    // Chassis dynamic pitch & roll (acceleration squat / braking dive / corner lean)
    const accelTilt = (this.inputs.forward ? -0.025 : (this.inputs.backward ? 0.035 : 0)) * speedRatio;
    const steerRoll = (this.currentSteerAngle * 0.08) * speedRatio;
    const targetPitch = slopePitch + accelTilt + rumble;
    const targetRoll  = slopeRoll + steerRoll + (rumble * 0.6);

    this.chassisPitch = THREE.MathUtils.lerp(this.chassisPitch, targetPitch, Math.min(1.0, 20.0 * safeDt));
    this.chassisRoll  = THREE.MathUtils.lerp(this.chassisRoll,  targetRoll,  Math.min(1.0, 20.0 * safeDt));

    // Guard NaN in rotation
    if (!isFinite(this.chassisPitch)) this.chassisPitch = 0;
    if (!isFinite(this.chassisRoll))  this.chassisRoll  = 0;
    if (!isFinite(this.headingAngle)) this.headingAngle = 0;

    this.carMesh.root.position.copy(this.position);
    this.carMesh.root.rotation.set(this.chassisPitch, this.headingAngle, this.chassisRoll, 'YXZ');

    // ── Speedometer & Realistic F1 Gears ──────────────────
    const rawSpeed = this.velocity.length() * 3.6;
    this.speedKmh = isFinite(rawSpeed) ? Math.round(rawSpeed) : 0;

    if      (this.speedKmh < 60)  this.gear = 1;
    else if (this.speedKmh < 110) this.gear = 2;
    else if (this.speedKmh < 160) this.gear = 3;
    else if (this.speedKmh < 210) this.gear = 4;
    else if (this.speedKmh < 260) this.gear = 5;
    else if (this.speedKmh < 305) this.gear = 6;
    else                          this.gear = 7;

    const gearBands = [0, 60, 110, 160, 210, 260, 305, 380];
    const lo = gearBands[this.gear - 1], hi = gearBands[this.gear];
    const rpmPct = hi > lo ? (this.speedKmh - lo) / (hi - lo) : 0;
    this.rpm = Math.round(3000 + rpmPct * 9000 + (this.inputs.forward ? 1200 : 0));
    this.rpm = Math.min(13500, Math.max(1000, this.rpm));

    const isTireSlipping = this.isDrifting || (this.isBraking && this.speedKmh > 35);
    this.carMesh.updateVisuals(this.currentSteerAngle, speedRatio, this.isBraking, safeDt, forwardSpeed, isTireSlipping, this.isOnRoad);
  }
}
