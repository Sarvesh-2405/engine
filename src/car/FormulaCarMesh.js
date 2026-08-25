import * as THREE from 'three';

export class FormulaCarMesh {
  constructor(options = {}) {
    this.primaryColor = options.bodyColor || 0x0d47a1; // Cobalt Blue
    this.secondaryColor = options.secondaryColor || 0xf8fafc; // Alpine White
    this.accentColor = options.accentColor || 0xfacc15; // Neon Gold
    
    this.root = new THREE.Group();
    
    this.wheels = {
      frontLeft: null,
      frontRight: null,
      rearLeft: null,
      rearRight: null
    };
    
    this.wheelSteerPivots = {
      frontLeft: null,
      frontRight: null
    };
    
    this.brakeLights = [];
    this._buildCar();
  }

  _buildCar() {
    const carGroup = new THREE.Group();
    this.root.add(carGroup);

    // --- MATERIALS ---
    const primaryMat = new THREE.MeshStandardMaterial({
      color: this.primaryColor,
      roughness: 0.14,
      metalness: 0.82,
      envMapIntensity: 1.8
    });

    const secondaryMat = new THREE.MeshStandardMaterial({
      color: this.secondaryColor,
      roughness: 0.12,
      metalness: 0.1,
      envMapIntensity: 1.5
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: this.accentColor,
      roughness: 0.16,
      metalness: 0.7,
      envMapIntensity: 1.6
    });

    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.75,
      metalness: 0.2
    });

    const sponsorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.0
    });

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.92,
      roughness: 0.15
    });

    // Procedural Tire Tread Texture
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
        ctx.moveTo(0, y); ctx.lineTo(20, y + 8);
        ctx.moveTo(34, y + 8); ctx.lineTo(57, y + 16);
        ctx.moveTo(71, y + 16); ctx.lineTo(94, y + 24);
        ctx.moveTo(108, y + 24); ctx.lineTo(128, y + 32);
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 6);
      tex.anisotropy = 8;
      return tex;
    }

    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x111113,
      map: createTreadTexture(),
      roughness: 0.85,
      metalness: 0.1
    });

    // --- 1. SHARPLY TAPERED NOSE CONE ---
    const chassisGeo = new THREE.BoxGeometry(0.72, 0.40, 1.8);
    const chassis = new THREE.Mesh(chassisGeo, primaryMat);
    chassis.position.set(0, 0.40, 0.1);
    chassis.castShadow = true; chassis.receiveShadow = true;
    carGroup.add(chassis);

    const tubStripe = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.04, 1.5), secondaryMat);
    tubStripe.position.set(0, 0.61, 0.1);
    tubStripe.castShadow = true;
    carGroup.add(tubStripe);

    const nosePoints = [
      new THREE.Vector2(0.04, 2.7),
      new THREE.Vector2(0.12, 2.3),
      new THREE.Vector2(0.20, 1.8),
      new THREE.Vector2(0.28, 1.3),
      new THREE.Vector2(0.35, 0.9)
    ];
    const noseGeo = new THREE.LatheGeometry(nosePoints, 16);
    noseGeo.rotateX(-Math.PI / 2);
    noseGeo.scale(1.0, 0.62, 1.0);
    const nose = new THREE.Mesh(noseGeo, primaryMat);
    nose.position.set(0, 0.32, 0.0);
    nose.castShadow = true; nose.receiveShadow = true;
    carGroup.add(nose);

    const noseTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 12), carbonMat);
    noseTip.rotation.x = Math.PI / 2;
    noseTip.position.set(0, 0.23, 2.72);
    carGroup.add(noseTip);

    const noseGoldStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 1.6), accentMat);
    noseGoldStripe.position.set(0, 0.38, 1.8);
    noseGoldStripe.rotation.x = -0.06;
    carGroup.add(noseGoldStripe);

    // --- 2. MULTI-ELEMENT LOW FRONT WING ---
    const fwMain = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.025, 0.32), carbonMat);
    fwMain.position.set(0, 0.12, 2.58);
    fwMain.castShadow = true;
    carGroup.add(fwMain);

    const fwUpper = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.02, 0.18), carbonMat);
    fwUpper.position.set(0, 0.16, 2.54);
    fwUpper.rotation.x = -0.15;
    fwUpper.castShadow = true;
    carGroup.add(fwUpper);

    [-1.02, 1.02].forEach(x => {
      const endplate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.26, 0.45), secondaryMat);
      endplate.position.set(x, 0.22, 2.58);
      endplate.castShadow = true;
      carGroup.add(endplate);

      const spBlock = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.22), sponsorMat);
      spBlock.position.set(x * 1.01, 0.22, 2.58);
      carGroup.add(spBlock);
    });

    // --- 3. SCULPTED SIDEPODS & REAR DIFFUSER ---
    [-0.54, 0.54].forEach(x => {
      const sidepodGeo = new THREE.BoxGeometry(0.38, 0.36, 1.5);
      const sidepod = new THREE.Mesh(sidepodGeo, primaryMat);
      sidepod.position.set(x, 0.36, -0.2);
      sidepod.castShadow = true; sidepod.receiveShadow = true;
      carGroup.add(sidepod);

      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.30, 0.08), carbonMat);
      intake.position.set(x, 0.36, 0.52);
      carGroup.add(intake);

      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.04, 1.3), accentMat);
      trim.position.set(x, 0.53, -0.2);
      carGroup.add(trim);

      const sideSponsor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.6), sponsorMat);
      sideSponsor.position.set(x > 0 ? x + 0.195 : x - 0.195, 0.36, -0.1);
      carGroup.add(sideSponsor);
    });

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 1.4), carbonMat);
    diffuser.position.set(0, 0.14, -0.9);
    diffuser.rotation.x = 0.08;
    diffuser.castShadow = true;
    carGroup.add(diffuser);

    // --- 4. OPEN COCKPIT, AEROSCREEN & AIRBOX ROLL-HOOP (NO HALO) ---
    const cockpitBorder = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.75), carbonMat);
    cockpitBorder.position.set(0, 0.56, 0.12);
    carGroup.add(cockpitBorder);

    const windscreenMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
      transmission: 0.9
    });
    const windscreen = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.12, 12, 1, true, -Math.PI / 3, (2 * Math.PI) / 3), windscreenMat);
    windscreen.rotation.y = Math.PI;
    windscreen.position.set(0, 0.64, 0.48);
    carGroup.add(windscreen);

    const helmetMat = new THREE.MeshStandardMaterial({ color: this.accentColor, roughness: 0.2, metalness: 0.6 });
    const driverHelmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), helmetMat);
    driverHelmet.position.set(0, 0.64, 0.05);
    driverHelmet.castShadow = true;
    carGroup.add(driverHelmet);

    const airboxShape = new THREE.BoxGeometry(0.38, 0.45, 0.7);
    const airbox = new THREE.Mesh(airboxShape, secondaryMat);
    airbox.position.set(0, 0.76, -0.32);
    airbox.castShadow = true;
    carGroup.add(airbox);

    const airboxIntakeHole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.10, 0.12, 14), carbonMat);
    airboxIntakeHole.rotation.x = Math.PI / 2;
    airboxIntakeHole.position.set(0, 0.88, 0.02);
    carGroup.add(airboxIntakeHole);

    // --- 5. HIGH MOUNTED TWIN REAR WING ON ANGLED PYLONS ---
    [-0.18, 0.18].forEach(x => {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.12), carbonMat);
      pylon.position.set(x, 0.72, -1.55);
      pylon.rotation.x = -0.22;
      pylon.castShadow = true;
      carGroup.add(pylon);
    });

    const rwLower = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.03, 0.28), carbonMat);
    rwLower.position.set(0, 0.88, -1.62);
    rwLower.castShadow = true;
    carGroup.add(rwLower);

    const rwUpper = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.035, 0.24), carbonMat);
    rwUpper.position.set(0, 1.04, -1.66);
    rwUpper.rotation.x = -0.12;
    rwUpper.castShadow = true;
    carGroup.add(rwUpper);

    [-0.83, 0.83].forEach(x => {
      const rearEP = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.48, 0.55), primaryMat);
      rearEP.position.set(x, 0.94, -1.64);
      rearEP.castShadow = true;
      carGroup.add(rearEP);

      const epAccent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.10, 0.55), accentMat);
      epAccent.position.set(x * 1.01, 1.10, -1.64);
      carGroup.add(epAccent);
    });

    const brakeGlowMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x990000, roughness: 0.3 });
    const fiaLight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.05), brakeGlowMat);
    fiaLight.position.set(0, 0.38, -1.62);
    carGroup.add(fiaLight);
    this.brakeLights.push(fiaLight);

    // --- 6. EXPOSED SUSPENSION LINKAGES ---
    const createSuspensionCorner = (x, y, z, isFront) => {
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
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, len, 8), carbonMat);
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

    carGroup.add(createSuspensionCorner(xFront, yWheel, zFront, true));
    carGroup.add(createSuspensionCorner(-xFront, yWheel, zFront, true));
    carGroup.add(createSuspensionCorner(xRear, yWheel, zRear, false));
    carGroup.add(createSuspensionCorner(-xRear, yWheel, zRear, false));

    // --- 7. WHEEL ASSEMBLIES WITH STEERING PIVOTS ---
    const createWheelAssembly = (isFront) => {
      const wheelGroup = new THREE.Group();
      const radius = isFront ? 0.35 : 0.38;
      const width = isFront ? 0.34 : 0.44;

      const tireMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 28), tireMat);
      tireMesh.rotation.z = Math.PI / 2;
      tireMesh.castShadow = true;
      wheelGroup.add(tireMesh);

      [-width / 2 - 0.002, width / 2 + 0.002].forEach(swX => {
        const sidewallMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.7 });
        const sidewall = new THREE.Mesh(new THREE.RingGeometry(radius * 0.55, radius, 28), sidewallMat);
        sidewall.position.x = swX;
        sidewall.rotation.y = Math.PI / 2;
        wheelGroup.add(sidewall);
      });

      const rimSpokes = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.56, radius * 0.56, width + 0.005, 10), metalMat);
      rimSpokes.rotation.z = Math.PI / 2;
      wheelGroup.add(rimSpokes);

      const centerNut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, width + 0.02, 8), accentMat);
      centerNut.rotation.z = Math.PI / 2;
      wheelGroup.add(centerNut);

      return { wheelGroup, tireMesh };
    };

    // FL
    const steerFL = new THREE.Group();
    steerFL.position.set(xFront, yWheel, zFront);
    const { wheelGroup: wgFL } = createWheelAssembly(true);
    steerFL.add(wgFL);
    carGroup.add(steerFL);
    this.wheelSteerPivots.frontLeft = steerFL;
    this.wheels.frontLeft = wgFL;

    // FR
    const steerFR = new THREE.Group();
    steerFR.position.set(-xFront, yWheel, zFront);
    const { wheelGroup: wgFR } = createWheelAssembly(true);
    steerFR.add(wgFR);
    carGroup.add(steerFR);
    this.wheelSteerPivots.frontRight = steerFR;
    this.wheels.frontRight = wgFR;

    // RL
    const rearFL = new THREE.Group();
    rearFL.position.set(xRear, yWheel, zRear);
    const { wheelGroup: wgRL } = createWheelAssembly(false);
    rearFL.add(wgRL);
    carGroup.add(rearFL);
    this.wheels.rearLeft = wgRL;

    // RR
    const rearFR = new THREE.Group();
    rearFR.position.set(-xRear, yWheel, zRear);
    const { wheelGroup: wgRR } = createWheelAssembly(false);
    rearFR.add(wgRR);
    carGroup.add(rearFR);
    this.wheels.rearRight = wgRR;
  }

  updateVisuals(steeringAngle, speedRatio, isBraking, dt) {
    if (this.wheelSteerPivots.frontLeft) {
      this.wheelSteerPivots.frontLeft.rotation.y = steeringAngle;
      this.wheelSteerPivots.frontRight.rotation.y = steeringAngle;
    }

    const spinRate = speedRatio * 35 * dt;
    if (this.wheels.frontLeft) this.wheels.frontLeft.rotation.x += spinRate;
    if (this.wheels.frontRight) this.wheels.frontRight.rotation.x += spinRate;
    if (this.wheels.rearLeft) this.wheels.rearLeft.rotation.x += spinRate;
    if (this.wheels.rearRight) this.wheels.rearRight.rotation.x += spinRate;

    this.brakeLights.forEach(light => {
      light.material.color.setHex(isBraking ? 0xff0000 : 0x550000);
    });
  }
}
