import { FormulaCarMesh } from './FormulaCarMesh.js';
import { SportCarMesh }   from './SportCarMesh.js';

/**
 * VehicleSelector — Manages two cars and swaps between them.
 *
 * The "active" vehicle's mesh is visible and owned by the VehicleController.
 * The "inactive" vehicle is hidden but its mesh stays in the scene so
 * switching back is instant (no rebuild cost).
 *
 * Press V to cycle between: Formula → Sport → Formula → …
 */
export class VehicleSelector {
  /**
   * @param {THREE.Scene}        scene
   * @param {VehicleController}  vehicleController
   * @param {Function}           onSwitch  - called with (vehicleName) after each switch
   */
  constructor(scene, vehicleController, onSwitch) {
    this.scene             = scene;
    this.vehicleController = vehicleController;
    this.onSwitch          = onSwitch || (() => {});

    // Build both meshes up-front
    this._formulaMesh = new FormulaCarMesh();
    this._sportMesh   = new SportCarMesh();

    // Add both roots to the scene (one will be hidden)
    this.scene.add(this._formulaMesh.root);
    this.scene.add(this._sportMesh.root);

    // Start on Formula
    this._activeIndex = 0;  // 0 = formula, 1 = sport

    this._vehicles = [
      { name: 'Formula',  mesh: this._formulaMesh },
      { name: 'GT Sport', mesh: this._sportMesh   },
    ];

    // Hide sport car initially
    this._sportMesh.root.visible = false;

    // Give the controller the formula mesh
    this.vehicleController.carMesh = this._formulaMesh;

    // Debounce to prevent rapid-fire switches
    this._switchCooldown = 0;
  }

  /** Active vehicle name (for HUD display) */
  get activeName() {
    return this._vehicles[this._activeIndex].name;
  }

  /** Active mesh */
  get activeMesh() {
    return this._vehicles[this._activeIndex].mesh;
  }

  /**
   * Switch to the next vehicle.
   * Preserves position, velocity, heading, pitch, roll, smoothY, and autodrive state.
   */
  switchNext() {
    if (this._switchCooldown > 0) return;
    this._switchCooldown = 0.60; // 600 ms cooldown

    const vc = this.vehicleController;

    // Hide current
    this._vehicles[this._activeIndex].mesh.root.visible = false;

    // Advance index
    this._activeIndex = (this._activeIndex + 1) % this._vehicles.length;
    const next = this._vehicles[this._activeIndex];

    // Show next
    next.mesh.root.visible = true;

    // Sync position / orientation to match current physics state
    next.mesh.root.position.copy(vc.position);
    next.mesh.root.rotation.set(vc.chassisPitch, vc.headingAngle, vc.chassisRoll, 'YXZ');

    // Hand mesh reference to controller (it calls carMesh.updateVisuals() every frame)
    vc.carMesh = next.mesh;

    this.onSwitch(next.name);
  }

  /**
   * Call from the main loop every frame with dt to handle cooldown.
   */
  update(dt) {
    if (this._switchCooldown > 0) {
      this._switchCooldown = Math.max(0, this._switchCooldown - dt);
    }
  }
}
