import * as THREE from 'three';

/**
 * Procedural Tire Tread Texture
 */
function createTreadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#111113';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#08080a';
  ctx.fillRect(18, 0, 12, 128);
  ctx.fillRect(55, 0, 12, 128);
  ctx.fillRect(92, 0, 12, 128);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#08080a';
  for (let y = -16; y < 150; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(18, y + 7);
    ctx.moveTo(30, y + 7); ctx.lineTo(55, y + 14);
    ctx.moveTo(67, y + 14); ctx.lineTo(92, y + 21);
    ctx.moveTo(104, y + 21); ctx.lineTo(128, y + 28);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 5);
  tex.anisotropy = 8;
  return tex;
}

/**
 * Contact shadow decal (soft underbody AO)
 */
function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 512);
  const g = ctx.createRadialGradient(256, 256, 20, 256, 256, 210);
  g.addColorStop(0,    'rgba(0,0,0,0.72)');
  g.addColorStop(0.5,  'rgba(0,0,0,0.42)');
  g.addColorStop(0.85, 'rgba(0,0,0,0.12)');
  g.addColorStop(1,    'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(256, 256, 130, 205, 0, 0, Math.PI * 2);
  ctx.fill();
  const drawTire = (cx, cy, rx, ry) => {
    const tg = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(rx, ry));
    tg.addColorStop(0,    'rgba(0,0,0,0.90)');
    tg.addColorStop(0.65, 'rgba(0,0,0,0.60)');
    tg.addColorStop(0.9,  'rgba(0,0,0,0.20)');
    tg.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  drawTire(108, 375, 38, 52);
  drawTire(404, 375, 38, 52);
  drawTire(100, 130, 44, 58);
  drawTire(412, 130, 44, 58);
  return new THREE.CanvasTexture(canvas);
}

/**
 * SportCarMesh — Stylized aerodynamic sports GT car.
 *
 * Inspired by Slow Roads aesthetic:
 *   - Curvy hatchback/GT body silhouette
 *   - Closed greenhouse (windshield + roof + rear glass)
 *   - Wide flush arches, sculpted rear diffuser
 *   - Low-slung stance, chunky 5-spoke alloy wheels
 *
 * Implements the same updateVisuals() interface as FormulaCarMesh
 * for drop-in compatibility with VehicleController.
 */
export class SportCarMesh {
  constructor() {
    this.root = new THREE.Group();
    this.spinningWheels   = [];
    this.frontSteerGroups = [];
    this.particles        = [];
    this.maxParticles     = 50;

    this._initMaterials();
    this._buildCar();
    this._buildContactShadow();
    this._buildParticleSystem();
  }

  _initMaterials() {
    // Pearl white body
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf0f4f8,
      roughness: 0.12,
      metalness: 0.55,
      envMapIntensity: 2.0,
    });

    // Vivid coral accent (roof stripe, spoiler, diffuser)
    this.accentMat = new THREE.MeshStandardMaterial({
      color: 0xff4757,
      roughness: 0.18,
      metalness: 0.30,
    });

    // Matte charcoal (underbody, vents, grille)
    this.darkMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a22,
      roughness: 0.78,
      metalness: 0.15,
    });

    // Tinted glass
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x2a4a6e,
      transparent: true,
      opacity: 0.55,
      roughness: 0.06,
      transmission: 0.80,
    });

    // Chrome trim
    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd8dde4,
      metalness: 0.96,
      roughness: 0.10,
    });

    // Rubber tire
    this.tireMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      map: createTreadTexture(),
      roughness: 0.88,
      metalness: 0.05,
    });

    this.sidewallMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      roughness: 0.72,
    });

    // Alloy rim
    this.rimMat = new THREE.MeshStandardMaterial({
      color: 0xb0b8c4,
      metalness: 0.90,
      roughness: 0.18,
    });

    // Brake disc
    this.brakeMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.85,
      roughness: 0.35,
    });

    // Caliper (orange)
    this.caliperMat = new THREE.MeshStandardMaterial({
      color: 0xff6000,
      roughness: 0.30,
      metalness: 0.20,
    });

    // Brake / tail light
    this.brakeLightMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0x440000,
      emissiveIntensity: 0.6,
      roughness: 0.22,
    });

    // DRL strip
    this.drlMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.4,
      roughness: 0.12,
    });
  }

  _buildCar() {
    const car = this.root;

    // ── 1. Body Shell ──────────────────────────────────────────
    // Lower sill / belly
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.22, 3.80), this.bodyMat);
    sill.position.set(0, 0.42, 0);
    sill.castShadow = true; sill.receiveShadow = true;
    car.add(sill);

    // Wide door / fender volume
    const mid = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.34, 3.40), this.bodyMat);
    mid.position.set(0, 0.62, -0.05);
    mid.castShadow = true; mid.receiveShadow = true;
    car.add(mid);

    // Shoulder taper
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.18, 3.0), this.bodyMat);
    shoulder.position.set(0, 0.82, -0.10);
    shoulder.castShadow = true;
    car.add(shoulder);

    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.14, 1.65), this.bodyMat);
    roof.position.set(0, 0.96, -0.28);
    roof.castShadow = true;
    car.add(roof);

    // Roof coral accent stripe
    const roofStripe = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.145, 1.65), this.accentMat);
    roofStripe.position.set(0, 0.962, -0.28);
    car.add(roofStripe);

    // ── 2. Front Fascia ────────────────────────────────────────
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.10, 1.10), this.bodyMat);
    hood.position.set(0, 0.82, 1.35);
    hood.rotation.x = 0.14;
    hood.castShadow = true;
    car.add(hood);

    const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.24, 0.32), this.bodyMat);
    frontBumper.position.set(0, 0.40, 1.92);
    frontBumper.castShadow = true;
    car.add(frontBumper);

    // Splitter
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.05, 0.28), this.darkMat);
    splitter.position.set(0, 0.28, 1.98);
    car.add(splitter);

    // Main grille
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.00, 0.14, 0.06), this.darkMat);
    grille.position.set(0, 0.42, 1.97);
    car.add(grille);

    // Lower intake
    const lowerIntake = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.06), this.darkMat);
    lowerIntake.position.set(0, 0.30, 1.97);
    car.add(lowerIntake);

    // Headlights + DRL strips (each side)
    [-0.70, 0.70].forEach(x => {
      const drl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.06), this.drlMat);
      drl.position.set(x, 0.62, 1.97);
      car.add(drl);

      const hlHousing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.08), this.darkMat);
      hlHousing.position.set(x, 0.54, 1.94);
      car.add(hlHousing);

      const hlBezel = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.16, 0.04), this.chromeMat);
      hlBezel.position.set(x, 0.54, 1.97);
      car.add(hlBezel);
    });

    // ── 3. Greenhouse (Windshield + Rear Glass) ────────────────
    const ws = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.52, 0.06), this.glassMat);
    ws.position.set(0, 0.86, 0.80);
    ws.rotation.x = -0.70;
    car.add(ws);

    const rw = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.42, 0.06), this.glassMat);
    rw.position.set(0, 0.88, -1.05);
    rw.rotation.x = 0.70;
    car.add(rw);

    // A-pillars
    [-0.69, 0.69].forEach(x => {
      const ap = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.52, 0.06), this.bodyMat);
      ap.position.set(x, 0.86, 0.80);
      ap.rotation.x = -0.70;
      car.add(ap);
    });

    // ── 4. Rear & Boot ─────────────────────────────────────────
    const boot = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.10, 0.90), this.bodyMat);
    boot.position.set(0, 0.82, -1.45);
    boot.rotation.x = -0.12;
    boot.castShadow = true;
    car.add(boot);

    const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.26, 0.32), this.bodyMat);
    rearBumper.position.set(0, 0.40, -1.94);
    rearBumper.castShadow = true;
    car.add(rearBumper);

    // Rear diffuser
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.16, 0.60), this.darkMat);
    diffuser.position.set(0, 0.26, -1.82);
    diffuser.rotation.x = -0.18;
    diffuser.castShadow = true;
    car.add(diffuser);

    for (let fi = -2; fi <= 2; fi++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.10, 0.55), this.darkMat);
      fin.position.set(fi * 0.22, 0.24, -1.82);
      fin.rotation.x = -0.18;
      car.add(fin);
    }

    // Boot lip spoiler
    const spoilerBase = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.06, 0.12), this.accentMat);
    spoilerBase.position.set(0, 0.90, -1.28);
    car.add(spoilerBase);

    const spoilerBlade = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.03, 0.22), this.darkMat);
    spoilerBlade.position.set(0, 0.97, -1.32);
    spoilerBlade.rotation.x = -0.22;
    car.add(spoilerBlade);

    // ── 5. Tail Lights ─────────────────────────────────────────
    [-0.72, 0.72].forEach(x => {
      const tl  = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.10, 0.07), this.brakeLightMat);
      tl.position.set(x, 0.54, -1.97);
      car.add(tl);

      const tlV = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.07), this.brakeLightMat);
      tlV.position.set(x > 0 ? x + 0.125 : x - 0.125, 0.48, -1.97);
      car.add(tlV);

      const tlSurround = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.04), this.chromeMat);
      tlSurround.position.set(x, 0.54, -1.96);
      car.add(tlSurround);
    });

    // Exhaust tips
    [-0.36, 0.36].forEach(x => {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.24, 12), this.chromeMat);
      exhaust.rotation.x = Math.PI / 2;
      exhaust.position.set(x, 0.31, -1.97);
      car.add(exhaust);
    });

    // ── 6. Side Mirrors ────────────────────────────────────────
    [-0.94, 0.94].forEach(x => {
      const mirrorArm  = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.16), this.bodyMat);
      mirrorArm.position.set(x > 0 ? x - 0.04 : x + 0.04, 0.76, 0.75);
      car.add(mirrorArm);

      const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.10, 0.10), this.accentMat);
      mirrorHead.position.set(x, 0.77, 0.78);
      car.add(mirrorHead);
    });

    // ── 7. Wheel Arch Lips ─────────────────────────────────────
    [[0.88, 1.40], [-0.88, 1.40], [0.90, -1.25], [-0.90, -1.25]].forEach(([x, z]) => {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.52), this.bodyMat);
      arch.position.set(x, 0.54, z);
      car.add(arch);
    });

    // ── 8. Wheel Assemblies ─────────────────────────────────────
    const wheelDef = [
      { x:  0.90, y: 0.33, z:  1.38, isFront: true  },
      { x: -0.90, y: 0.33, z:  1.38, isFront: true  },
      { x:  0.92, y: 0.33, z: -1.24, isFront: false },
      { x: -0.92, y: 0.33, z: -1.24, isFront: false },
    ];

    wheelDef.forEach(({ x, y, z, isFront }) => {
      const radius = isFront ? 0.32 : 0.33;
      const width  = isFront ? 0.22 : 0.24;

      const posGroup   = new THREE.Group();
      posGroup.position.set(x, y, z);

      const steerGroup = new THREE.Group();
      posGroup.add(steerGroup);
      if (isFront) this.frontSteerGroups.push(steerGroup);

      const spinGroup = new THREE.Group();
      steerGroup.add(spinGroup);
      this.spinningWheels.push({ group: spinGroup, radius });

      // Tire barrel
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), this.tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      spinGroup.add(tire);

      // Sidewalls
      [-width / 2 - 0.003, width / 2 + 0.003].forEach(swX => {
        const sw = new THREE.Mesh(new THREE.RingGeometry(radius * 0.52, radius, 24), this.sidewallMat);
        sw.position.x = swX;
        sw.rotation.y = Math.PI / 2;
        spinGroup.add(sw);
      });

      // Rim barrel
      const rimBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.54, radius * 0.54, width + 0.006, 8),
        this.rimMat
      );
      rimBarrel.rotation.z = Math.PI / 2;
      spinGroup.add(rimBarrel);

      // 5 spokes
      for (let s = 0; s < 5; s++) {
        const angle = (s / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.85, radius * 0.06, radius * 0.44),
          this.rimMat
        );
        spoke.rotation.z = angle;
        spinGroup.add(spoke);
      }

      // Hub
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, width + 0.008, 8),
        this.rimMat
      );
      hub.rotation.z = Math.PI / 2;
      spinGroup.add(hub);

      // Brake disc
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.55, radius * 0.56, 0.04, 16),
        this.brakeMat
      );
      disc.rotation.z = Math.PI / 2;
      disc.position.x = (x > 0) ? -width * 0.3 : width * 0.3;
      spinGroup.add(disc);

      // Caliper
      const caliper = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, radius * 0.40, 0.08),
        this.caliperMat
      );
      caliper.position.set((x > 0) ? -width * 0.3 : width * 0.3, radius * 0.52, 0.04);
      posGroup.add(caliper);

      car.add(posGroup);
    });
  }

  _buildContactShadow() {
    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.PlaneGeometry(2.2, 4.4);
    shadowGeo.rotateX(-Math.PI / 2);

    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.80,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2.0,
      polygonOffsetUnits:  -4.0,
    });

    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.set(0, 0.014, -0.05);
    shadowMesh.renderOrder = 3;
    this.root.add(shadowMesh);
  }

  _buildParticleSystem() {
    this.particleGroup = new THREE.Group();
    const pGeo = new THREE.PlaneGeometry(0.5, 0.5);
    const pMat = new THREE.MeshBasicMaterial({
      color: 0xe2e8f0,
      transparent: true,
      opacity: 0.40,
      depthWrite: false,
    });

    for (let i = 0; i < this.maxParticles; i++) {
      const mesh = new THREE.Mesh(pGeo, pMat.clone());
      mesh.visible = false;
      this.particles.push({
        mesh, life: 0, maxLife: 0.6,
        vel: new THREE.Vector3(), scale: 0.5,
      });
      this.particleGroup.add(mesh);
    }
    this.root.add(this.particleGroup);
  }

  _spawnSmokeParticle(x, y, z, isOnRoad) {
    const p = this.particles.find(part => part.life <= 0);
    if (!p) return;
    p.life = p.maxLife = 0.45 + Math.random() * 0.30;
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.1, z + (Math.random() - 0.5) * 0.2);
    p.vel.set((Math.random() - 0.5) * 1.5, 0.7 + Math.random() * 1.1, -1.8 - Math.random() * 2.5);
    p.scale = 0.30 + Math.random() * 0.28;
    p.mesh.visible = true;
    p.mesh.material.opacity = isOnRoad ? 0.35 : 0.55;
    p.mesh.material.color.setHex(isOnRoad ? 0xe2e8f0 : 0x8a7455);
  }

  /**
   * Drop-in compatible with FormulaCarMesh.updateVisuals()
   */
  updateVisuals(steerAngle, speedRatio, isBraking, dt, forwardSpeed, isTireSlipping = false, isOnRoad = true) {
    // 1. Steering
    for (let i = 0; i < this.frontSteerGroups.length; i++) {
      this.frontSteerGroups[i].rotation.y = steerAngle;
    }

    // 2. Wheel rolling
    const speed = forwardSpeed !== undefined ? forwardSpeed : speedRatio * 60;
    for (let i = 0; i < this.spinningWheels.length; i++) {
      const { group, radius } = this.spinningWheels[i];
      group.rotateX(-(speed / radius) * dt);
    }

    // 3. Brake lights
    if (isBraking) {
      this.brakeLightMat.emissive.setHex(0xff1111);
      this.brakeLightMat.emissiveIntensity = 3.5;
    } else {
      this.brakeLightMat.emissive.setHex(0x440000);
      this.brakeLightMat.emissiveIntensity = 0.6;
    }

    // 4. Smoke / dust
    if (isTireSlipping && speedRatio > 0.08 && Math.random() < 0.60) {
      this._spawnSmokeParticle( 0.92, 0.0, -1.24, isOnRoad);
      this._spawnSmokeParticle(-0.92, 0.0, -1.24, isOnRoad);
    }

    // 5. Particle update
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        p.life -= dt;
        if (p.life <= 0) {
          p.mesh.visible = false;
        } else {
          p.mesh.position.addScaledVector(p.vel, dt);
          const progress  = 1.0 - p.life / p.maxLife;
          const s = p.scale * (1.0 + progress * 2.5);
          p.mesh.scale.set(s, s, s);
          p.mesh.material.opacity = (1.0 - progress) * (isOnRoad ? 0.35 : 0.55);
        }
      }
    }
  }
}
