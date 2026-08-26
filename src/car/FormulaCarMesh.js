import * as THREE from 'three';

/**
 * Procedural Tire Tread Texture
 */
function createTreadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#09090b';
  ctx.fillRect(20, 0, 14, 128);
  ctx.fillRect(57, 0, 14, 128);
  ctx.fillRect(94, 0, 14, 128);

  ctx.lineWidth = 4;
  ctx.strokeStyle = '#09090b';
  for (let y = -20; y < 150; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(20, y + 8);
    ctx.moveTo(34, y + 8);
    ctx.lineTo(57, y + 16);
    ctx.moveTo(71, y + 16);
    ctx.lineTo(94, y + 24);
    ctx.moveTo(108, y + 24);
    ctx.lineTo(128, y + 32);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Procedural Ambient Occlusion Contact Shadow Texture
 * Creates soft chassis AO + dark contact patches under all 4 tires
 */
function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 512);

  // 1. Soft overall underbody shadow
  const bodyGrad = ctx.createRadialGradient(256, 256, 30, 256, 256, 220);
  bodyGrad.addColorStop(0,   'rgba(0, 0, 0, 0.75)');
  bodyGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)');
  bodyGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.15)');
  bodyGrad.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(256, 256, 120, 200, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. 4 Dark Tire Contact Patches
  const drawTirePatch = (cx, cy, rx, ry) => {
    const tireGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry));
    tireGrad.addColorStop(0,   'rgba(0, 0, 0, 0.95)');
    tireGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.70)');
    tireGrad.addColorStop(0.9, 'rgba(0, 0, 0, 0.25)');
    tireGrad.addColorStop(1,   'rgba(0, 0, 0, 0)');
    ctx.fillStyle = tireGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // Front wheels (top in texture space: y ~ 385)
  drawTirePatch(105, 385, 36, 50); // FL
  drawTirePatch(407, 385, 36, 50); // FR

  // Rear wheels (bottom in texture space: y ~ 125)
  drawTirePatch(95, 125, 45, 60);  // RL
  drawTirePatch(417, 125, 45, 60); // RR

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

export class FormulaCarMesh {
  constructor() {
    this.root = new THREE.Group();

    // Wheel spin references
    this.spinningWheels = [];
    this.frontSteerGroups = [];

    // Particle pool for tire smoke & drift dust
    this.particles = [];
    this.maxParticles = 50;

    this._initMaterials();
    this._buildCar();
    this._buildContactShadow();
    this._buildParticleSystem();
  }

  _initMaterials() {
    this.primaryMat = new THREE.MeshStandardMaterial({
      color: 0x0d47a1, // Cobalt / Racing Blue
      roughness: 0.14,
      metalness: 0.82,
      envMapIntensity: 1.8
    });

    this.secondaryMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc, // Alpine White
      roughness: 0.12,
      metalness: 0.1,
      envMapIntensity: 1.5
    });

    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // Neon Gold / Electric Yellow
      roughness: 0.16,
      metalness: 0.7,
      envMapIntensity: 1.6
    });

    this.carbonMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.75,
      metalness: 0.2
    });

    this.sponsorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.0
    });

    this.metalMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.92,
      roughness: 0.15
    });

    this.tireTreadTexture = createTreadTexture();
    this.tireMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      map: this.tireTreadTexture,
      roughness: 0.85,
      metalness: 0.1
    });

    this.sidewallMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      roughness: 0.7
    });

    this.windscreenMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      transmission: 0.9
    });

    this.helmetMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.2,
      metalness: 0.6
    });

    this.brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x440000,
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
  }

  _buildCar() {
    const car = this.root;

    // ── 1. Monocoque & Nose Cone ──────────────────────────────
    const chassisGeo = new THREE.BoxGeometry(0.72, 0.40, 1.8);
    const chassis = new THREE.Mesh(chassisGeo, this.primaryMat);
    chassis.position.set(0, 0.40, 0.1);
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    car.add(chassis);

    const tubStripe = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 1.5), this.secondaryMat);
    tubStripe.position.set(0, 0.61, 0.1);
    tubStripe.castShadow = true;
    car.add(tubStripe);

    const nosePoints = [
      new THREE.Vector2(0.04, 2.7), // Tip
      new THREE.Vector2(0.12, 2.3),
      new THREE.Vector2(0.20, 1.8),
      new THREE.Vector2(0.28, 1.3),
      new THREE.Vector2(0.35, 0.9)  // Base at monocoque
    ];
    const noseGeo = new THREE.LatheGeometry(nosePoints, 16);
    noseGeo.rotateX(-Math.PI / 2);
    noseGeo.scale(1.0, 0.62, 1.0);
    const nose = new THREE.Mesh(noseGeo, this.primaryMat);
    nose.position.set(0, 0.32, 0.0);
    nose.castShadow = true;
    nose.receiveShadow = true;
    car.add(nose);

    const noseTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 12), this.carbonMat);
    noseTip.rotation.x = Math.PI / 2;
    noseTip.position.set(0, 0.23, 2.72);
    car.add(noseTip);

    const noseGoldStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 1.6), this.accentMat);
    noseGoldStripe.position.set(0, 0.38, 1.8);
    noseGoldStripe.rotation.x = -0.06;
    car.add(noseGoldStripe);

    // ── 2. Multi-Element Front Wing ──────────────────────────
    const fwMain = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.025, 0.32), this.carbonMat);
    fwMain.position.set(0, 0.12, 2.58);
    fwMain.castShadow = true;
    car.add(fwMain);

    const fwUpper = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.02, 0.18), this.carbonMat);
    fwUpper.position.set(0, 0.16, 2.54);
    fwUpper.rotation.x = -0.15;
    fwUpper.castShadow = true;
    car.add(fwUpper);

    [-1.02, 1.02].forEach(x => {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.45), this.secondaryMat);
      endplate.position.set(x, 0.22, 2.58);
      endplate.castShadow = true;
      car.add(endplate);

      const spBlock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.22), this.sponsorMat);
      spBlock.position.set(x * 1.01, 0.22, 2.58);
      car.add(spBlock);
    });

    // ── 3. Sculpted Sidepods & Rear Diffuser ──────────────────
    [-0.54, 0.54].forEach(x => {
      const sidepodGeo = new THREE.BoxGeometry(0.38, 0.36, 1.5);
      const sidepod = new THREE.Mesh(sidepodGeo, this.primaryMat);
      sidepod.position.set(x, 0.36, -0.2);
      sidepod.castShadow = true;
      sidepod.receiveShadow = true;
      car.add(sidepod);

      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, 0.08), this.carbonMat);
      intake.position.set(x, 0.36, 0.52);
      car.add(intake);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.04, 1.3), this.accentMat);
      trim.position.set(x, 0.53, -0.2);
      car.add(trim);

      const sideSponsor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.6), this.sponsorMat);
      sideSponsor.position.set(x > 0 ? x + 0.195 : x - 0.195, 0.36, -0.1);
      car.add(sideSponsor);
    });

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.4), this.carbonMat);
    diffuser.position.set(0, 0.14, -0.9);
    diffuser.rotation.x = 0.08;
    diffuser.castShadow = true;
    car.add(diffuser);

    // ── 4. Open Cockpit, Aeroscreen & Engine Airbox ───────────
    const cockpitBorder = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.75), this.carbonMat);
    cockpitBorder.position.set(0, 0.56, 0.12);
    car.add(cockpitBorder);

    const windscreen = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.27, 0.12, 12, 1, true, -Math.PI / 3, (2 * Math.PI) / 3),
      this.windscreenMat
    );
    windscreen.rotation.y = Math.PI;
    windscreen.position.set(0, 0.64, 0.48);
    car.add(windscreen);

    const driverHelmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), this.helmetMat);
    driverHelmet.position.set(0, 0.64, 0.05);
    driverHelmet.castShadow = true;
    car.add(driverHelmet);

    const airboxShape = new THREE.BoxGeometry(0.38, 0.45, 0.7);
    const airbox = new THREE.Mesh(airboxShape, this.secondaryMat);
    airbox.position.set(0, 0.76, -0.32);
    airbox.castShadow = true;
    car.add(airbox);

    const airboxIntakeHole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.10, 0.12, 14), this.carbonMat);
    airboxIntakeHole.rotation.x = Math.PI / 2;
    airboxIntakeHole.position.set(0, 0.88, 0.02);
    car.add(airboxIntakeHole);

    // ── 5. High-Mounted Twin Rear Wing & Rain Light ────────────
    [-0.18, 0.18].forEach(x => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.12), this.carbonMat);
      pylon.position.set(x, 0.72, -1.55);
      pylon.rotation.x = -0.22;
      pylon.castShadow = true;
      car.add(pylon);
    });

    const rwLower = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.03, 0.28), this.carbonMat);
    rwLower.position.set(0, 0.88, -1.62);
    rwLower.castShadow = true;
    car.add(rwLower);

    const rwUpper = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.035, 0.24), this.carbonMat);
    rwUpper.position.set(0, 1.04, -1.66);
    rwUpper.rotation.x = -0.12;
    rwUpper.castShadow = true;
    car.add(rwUpper);

    [-0.83, 0.83].forEach(x => {
      const rearEP = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.48, 0.55), this.primaryMat);
      rearEP.position.set(x, 0.94, -1.64);
      rearEP.castShadow = true;
      car.add(rearEP);

      const epAccent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.10, 0.55), this.accentMat);
      epAccent.position.set(x * 1.01, 1.10, -1.64);
      car.add(epAccent);
    });

    // Rain / Brake light
    this.rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), this.brakeLightMat);
    this.rainLight.position.set(0, 0.38, -1.62);
    car.add(this.rainLight);

    // Twin Exhausts
    [-0.14, 0.14].forEach(x => {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 12), this.metalMat);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(x, 0.38, -1.60);
      car.add(exhaust);
    });

    // ── 6. Suspension Linkages ────────────────────────────────
    const createSuspensionCorner = (x, y, z) => {
      const suspGroup = new THREE.Group();
      const innerX = x > 0 ? 0.32 : -0.32;
      const outerX = x;
      const hubY = y;
      const chassisUpperY = hubY + 0.12;
      const chassisLowerY = hubY - 0.12;

      const upperFore = new THREE.Vector3(innerX, chassisUpperY, z + 0.18);
      const upperAft  = new THREE.Vector3(innerX, chassisUpperY, z - 0.18);
      const outerHub  = new THREE.Vector3(outerX, hubY, z);

      const drawRod = (p1, p2) => {
        const dir = p2.clone().sub(p1);
        const len = dir.length();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 8), this.carbonMat);
        rod.position.copy(p1.clone().add(p2).multiplyScalar(0.5));
        rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        rod.castShadow = true;
        suspGroup.add(rod);
      };

      drawRod(upperFore, outerHub);
      drawRod(upperAft, outerHub);

      const lowerFore = new THREE.Vector3(innerX, chassisLowerY, z + 0.18);
      const lowerAft  = new THREE.Vector3(innerX, chassisLowerY, z - 0.18);
      drawRod(lowerFore, outerHub);
      drawRod(lowerAft, outerHub);

      const pushrodIn = new THREE.Vector3(innerX * 0.8, chassisUpperY + 0.15, z);
      drawRod(pushrodIn, outerHub);

      return suspGroup;
    };

    const xFront = 0.78, zFront = 1.5;
    const xRear = 0.82, zRear = -1.3;
    const yWheel = 0.35;

    car.add(createSuspensionCorner(xFront, yWheel, zFront));
    car.add(createSuspensionCorner(-xFront, yWheel, zFront));
    car.add(createSuspensionCorner(xRear, yWheel, zRear));
    car.add(createSuspensionCorner(-xRear, yWheel, zRear));

    // ── 7. Chunky Treaded Wheel Assemblies with Steering ───────
    const wheelPositions = [
      { x: xFront,  y: yWheel, z: zFront, isFront: true },  // Front Left [0]
      { x: -xFront, y: yWheel, z: zFront, isFront: true },  // Front Right [1]
      { x: xRear,   y: yWheel, z: zRear,  isFront: false }, // Rear Left [2]
      { x: -xRear,  y: yWheel, z: zRear,  isFront: false }  // Rear Right [3]
    ];

    wheelPositions.forEach(({ x, y, z, isFront }) => {
      const r = isFront ? 0.35 : 0.38;
      const w = isFront ? 0.34 : 0.44;

      // Position pivot group
      const posGroup = new THREE.Group();
      posGroup.position.set(x, y, z);

      // Steer group (for front wheels yaw rotation)
      const steerGroup = new THREE.Group();
      posGroup.add(steerGroup);
      if (isFront) {
        this.frontSteerGroups.push(steerGroup);
      }

      // Wheel spin group (rotates along X-axis as car moves)
      const spinGroup = new THREE.Group();
      steerGroup.add(spinGroup);
      this.spinningWheels.push({ group: spinGroup, radius: r });

      // Treaded Rubber Tire
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), this.tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      spinGroup.add(tire);

      // Plain Smooth Sidewall Rings
      [-w / 2 - 0.002, w / 2 + 0.002].forEach(swX => {
        const sidewall = new THREE.Mesh(new THREE.RingGeometry(r * 0.55, r, 28), this.sidewallMat);
        sidewall.position.x = swX;
        sidewall.rotation.y = Math.PI / 2;
        spinGroup.add(sidewall);
      });

      // Magnesium Rim & Center Lock Nut
      const rimSpokes = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.56, w + 0.005, 10), this.metalMat);
      rimSpokes.rotation.z = Math.PI / 2;
      spinGroup.add(rimSpokes);

      const centerNut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 0.02, 8), this.accentMat);
      centerNut.rotation.z = Math.PI / 2;
      spinGroup.add(centerNut);

      car.add(posGroup);
    });
  }

  // ── Ambient Occlusion Ground Contact Shadow Decal ───────────
  _buildContactShadow() {
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(2.4, 4.8);
    shadowGeo.rotateX(-Math.PI / 2);

    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits:  -4.0,
    });

    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, 0.015, 0.1);
    shadowMesh.renderOrder = 3;
    this.root.add(shadowMesh);
  }

  // ── Tire Smoke & Dust Particle Pool ─────────────────────────
  _buildParticleSystem() {
    this.particleGroup = new THREE.Group();
    const pGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    for (let i = 0; i < this.maxParticles; i++) {
      const mesh = new THREE.Mesh(pGeo, pMat.clone());
      mesh.visible = false;
      this.particles.push({
        mesh,
        life: 0,
        maxLife: 0.6,
        vel: new THREE.Vector3(),
        scale: 0.5,
      });
      this.particleGroup.add(mesh);
    }

    this.root.add(this.particleGroup);
  }

  _spawnSmokeParticle(x, y, z, isOnRoad) {
    const p = this.particles.find(part => part.life <= 0);
    if (!p) return;

    p.life = p.maxLife = 0.45 + Math.random() * 0.3;
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.1, z + (Math.random() - 0.5) * 0.2);
    p.vel.set((Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.2, -2.0 - Math.random() * 3.0);
    p.scale = 0.35 + Math.random() * 0.3;
    p.mesh.visible = true;
    p.mesh.material.opacity = isOnRoad ? 0.35 : 0.55;
    p.mesh.material.color.setHex(isOnRoad ? 0xe2e8f0 : 0x8a7455); // White tire smoke or brown off-road dust
  }

  /**
   * Update wheel steering, wheel rolling animation, brake lights, and tire smoke
   */
  updateVisuals(steerAngle, speedRatio, isBraking, dt, forwardSpeed, isTireSlipping = false, isOnRoad = true) {
    // 1. Front wheels steering yaw
    for (let i = 0; i < this.frontSteerGroups.length; i++) {
      this.frontSteerGroups[i].rotation.y = steerAngle;
    }

    // 2. Wheel rolling rotation
    const speed = forwardSpeed !== undefined ? forwardSpeed : (speedRatio * 83.33);
    for (let i = 0; i < this.spinningWheels.length; i++) {
      const { group, radius } = this.spinningWheels[i];
      const rollDelta = (speed / radius) * dt;
      group.rotateX(-rollDelta);
    }

    // 3. Brake light emissive glow
    if (isBraking) {
      this.brakeLightMat.emissive.setHex(0xff1111);
      this.brakeLightMat.emissiveIntensity = 3.5;
    } else {
      this.brakeLightMat.emissive.setHex(0x440000);
      this.brakeLightMat.emissiveIntensity = 0.6;
    }

    // 4. Tire smoke / dust emission
    if (isTireSlipping && speedRatio > 0.08) {
      if (Math.random() < 0.65) {
        this._spawnSmokeParticle(0.82, 0.0, -1.3, isOnRoad);
        this._spawnSmokeParticle(-0.82, 0.0, -1.3, isOnRoad);
      }
    }

    // 5. Update existing particles
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
        } else {
          p.mesh.position.addScaledVector(p.vel, dt);
          const progress = 1.0 - (p.life / p.maxLife);
          const currentScale = p.scale * (1.0 + progress * 2.5);
          p.mesh.scale.set(currentScale, currentScale, currentScale);
          p.mesh.material.opacity = (1.0 - progress) * (isOnRoad ? 0.35 : 0.55);
        }
      }
    }
  }
}
