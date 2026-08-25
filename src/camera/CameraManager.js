import * as THREE from 'three';

const MODES = ['chase', 'cockpit', 'orbit'];

export class CameraManager {
  constructor(camera) {
    this.camera = camera;
    this.mode   = 'chase';

    this.chaseOffset  = new THREE.Vector3(0, 3.4, -9.0);
    this.lookAtOffset = new THREE.Vector3(0, 1.1, 6.0);

    this.currentPos    = new THREE.Vector3();
    this.currentLookAt = new THREE.Vector3();

    this.baseFov = 62;
    this.maxFov  = 82; // more dramatic FOV stretch at high speed

    this.orbitYaw   = 0;
    this.orbitPitch = 0.35;
    this.isMouseDown = false;
    this.prevMouseX  = 0;
    this.prevMouseY  = 0;

    this._onModeChange = null; // callback(modeName)
    this._setupListeners();
  }

  /** Called by HUD or external code when user clicks camera button */
  setMode(modeName) {
    this.mode = modeName;
    if (this._onModeChange) this._onModeChange(modeName);
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

    if (this.mode === 'chase') {
      const rotated = this.chaseOffset.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0), carHeading
      );
      // Slight lateral sway when steering
      const steerRollOffset = vehicleController.currentSteerAngle * 1.2;
      rotated.x += Math.sin(carHeading + Math.PI / 2) * steerRollOffset;

      const targetPos    = carPos.clone().add(rotated);
      const rotatedLookAt = this.lookAtOffset.clone().applyAxisAngle(
        new THREE.Vector3(0, 1, 0), carHeading
      );
      const targetLookAt = carPos.clone().add(rotatedLookAt);

      if (this.currentPos.lengthSq() === 0) {
        this.currentPos.copy(targetPos);
        this.currentLookAt.copy(targetLookAt);
      } else {
        this.currentPos.lerp(targetPos,    10.0 * dt);
        this.currentLookAt.lerp(targetLookAt, 14.0 * dt);
      }

      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);

      const targetFov = THREE.MathUtils.lerp(this.baseFov, this.maxFov, speedRatio);
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 5.0 * dt);
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'cockpit') {
      const offset = new THREE.Vector3(0, 0.72, 0.1).applyAxisAngle(
        new THREE.Vector3(0, 1, 0), carHeading
      );
      const lookAt = carPos.clone().add(
        new THREE.Vector3(Math.sin(carHeading) * 14, 0.5, Math.cos(carHeading) * 14)
      );
      this.camera.position.copy(carPos.clone().add(offset));
      this.camera.lookAt(lookAt);
      this.camera.fov = 72;
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'orbit') {
      const radius = 10.0;
      const ox = carPos.x + Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * radius;
      const oy = carPos.y + Math.sin(this.orbitPitch) * radius + 1.0;
      const oz = carPos.z + Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * radius;
      this.camera.position.set(ox, oy, oz);
      this.camera.lookAt(carPos.x, carPos.y + 0.8, carPos.z);
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    }
  }
}
