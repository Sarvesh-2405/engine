import * as THREE from 'three';

const MODES = ['chase', 'close', 'cockpit', 'orbit'];

export class CameraManager {
  constructor(camera) {
    this.camera = camera;
    this.mode   = 'chase';

    // Perfectly calibrated grounded chase positions
    this.chaseOffset = new THREE.Vector3(0, 2.5, -7.2);
    this.closeOffset = new THREE.Vector3(0, 1.7, -5.2);
    this.lookAtOffset = new THREE.Vector3(0, 0.95, 8.0);

    this.currentPos    = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    this.baseFov = 60;
    this.maxFov  = 84; // dramatic FOV stretch at high speed

    this.orbitYaw   = 0;
    this.orbitPitch = 0.35;
    this.isMouseDown = false;
    this.prevMouseX  = 0;
    this.prevMouseY  = 0;

    this._shakeTime = 0;
    this._onModeChange = null; // callback(modeName)
    this._setupListeners();
  }

  /** Called by HUD or external code when user clicks camera button */
  setMode(modeName) {
    if (MODES.includes(modeName)) {
      this.mode = modeName;
      if (this._onModeChange) this._onModeChange(modeName);
    }
  }

  /** Cycle through modes; returns the new mode name */
  cycleMode() {
    const idx  = MODES.indexOf(this.mode);
    this.mode  = MODES[(idx + 1) % MODES.length];
    if (this._onModeChange) this._onModeChange(this.mode);
    return this.mode;
  }

  onModeChange(cb) {
    this._onModeChange = cb;
  }

  _setupListeners() {
    window.addEventListener('mousedown', (e) => {
      if (this.mode === 'orbit') {
        this.isMouseDown = true;
        this.prevMouseX = e.clientX;
        this.prevMouseY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isMouseDown && this.mode === 'orbit') {
        const dx = e.clientX - this.prevMouseX;
        const dy = e.clientY - this.prevMouseY;
        this.orbitYaw  -= dx * 0.008;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch + dy * 0.008, 0.05, 1.2);
        this.prevMouseX = e.clientX;
        this.prevMouseY = e.clientY;
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
    });
  }

  update(vehicleController, dt) {
    const carPos    = vehicleController.position;
    const carHeading = vehicleController.headingAngle;
    const speedRatio = vehicleController.velocity.length() / vehicleController.maxSpeed;

    // Speed-dependent micro vibration (only active when moving)
    const speed = vehicleController.velocity.length();
    let shakeX = 0;
    let shakeY = 0;

    if (speed > 0.5) {
      this._shakeTime += dt * 28.0;
      const shakeIntensity = (speedRatio * 0.012) + (vehicleController.isOnRoad ? 0 : speedRatio * 0.025);
      shakeX = Math.sin(this._shakeTime) * shakeIntensity;
      shakeY = Math.cos(this._shakeTime * 1.6) * shakeIntensity * 0.7;
    } else {
      this._shakeTime = 0;
    }

    if (this.mode === 'chase' || this.mode === 'close') {
      const baseOffset = this.mode === 'close' ? this.closeOffset : this.chaseOffset;
      const rotated = baseOffset.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0), carHeading
      );

      // Subtle dynamic lateral sway when steering
      const steerRollOffset = vehicleController.currentSteerAngle * 0.6;
      rotated.x += Math.sin(carHeading + Math.PI / 2) * steerRollOffset;

      const targetPos    = carPos.clone().add(rotated);
      targetPos.x += shakeX;
      targetPos.y += shakeY;

      const rotatedLookAt = this.lookAtOffset.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0), carHeading
      );
      const targetLookAt = carPos.clone().add(rotatedLookAt);

      if (this.currentPos.lengthSq() === 0) {
        this.currentPos.copy(targetPos);
        this.currentLookAt.copy(targetLookAt);
      } else {
        const followSpeed = this.mode === 'close' ? 16.0 : 13.0;
        this.currentPos.lerp(targetPos,       followSpeed * dt);
        this.currentLookAt.lerp(targetLookAt, 18.0 * dt);
      }

      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);

      const targetFov = THREE.MathUtils.lerp(this.baseFov, this.maxFov, speedRatio);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 6.0 * dt);
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'cockpit') {
      // Smoothly dampen pitch and roll so chassis bumps don't violently jerk the driver's eyes
      const smoothPitch = vehicleController.chassisPitch * 0.40;
      const smoothRoll  = vehicleController.chassisRoll * 0.40;
      const carEuler    = new THREE.Euler(smoothPitch, carHeading, smoothRoll, 'YXZ');

      // Driver helmet position: elevated above cockpit rim for clear road sightlines
      const eyeOffset  = new THREE.Vector3(0, 0.88, 0.42).applyEuler(carEuler);
      const lookOffset = new THREE.Vector3(0, 0.82, 32.0).applyEuler(carEuler);

      const targetEye    = carPos.clone().add(eyeOffset);
      const targetLookAt = carPos.clone().add(lookOffset);

      // Subtle high-speed micro rumble
      if (speedRatio > 0.2) {
        targetEye.x += shakeX * 0.15;
        targetEye.y += shakeY * 0.15;
      }

      if (this.currentPos.lengthSq() === 0) {
        this.currentPos.copy(targetEye);
        this.currentLookAt.copy(targetLookAt);
      } else {
        // High-frequency tracking with smooth suspension stabilization
        this.currentPos.lerp(targetEye, Math.min(1.0, 30.0 * dt));
        this.currentLookAt.lerp(targetLookAt, Math.min(1.0, 34.0 * dt));
      }

      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);

      // Dynamic FOV for speed sensation
      const targetFov = THREE.MathUtils.lerp(72, 88, speedRatio);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 8.0 * dt);
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'orbit') {
      const radius = 9.0;
      const ox = carPos.x + Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * radius;
      const oy = carPos.y + Math.sin(this.orbitPitch) * radius + 0.8;
      const oz = carPos.z + Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * radius;
      this.camera.position.set(ox, oy, oz);
      this.camera.lookAt(carPos.x, carPos.y + 0.6, carPos.z);
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
    }
  }
}
