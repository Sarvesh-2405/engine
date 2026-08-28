import * as THREE from 'three';

// ── Low-Poly Cumulus Cloud Geometry ───────────────────────────
function createCloudPuffGeometry() {
  const geo = new THREE.DodecahedronGeometry(1.0, 1);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Organic cloud flattening & puffing
    v.y *= 0.65;
    const noise = Math.sin(v.x * 2.0) * Math.cos(v.z * 2.0) * 0.18;
    v.addScaledVector(v.clone().normalize(), noise);
    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geo.computeVertexNormals();
  return geo;
}

export class CloudSystem {
  constructor(scene, count = 28) {
    this.scene = scene;
    this.count = count;

    this.cloudPuffGeo = createCloudPuffGeometry();

    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.98,
      metalness: 0.0,
      flatShading: true,
      transparent: true,
      opacity: 0.92,
    });

    // Instanced mesh for all cloud puffs across the sky
    const puffsPerCloud = 5;
    const totalPuffs    = this.count * puffsPerCloud;
    this.iClouds        = new THREE.InstancedMesh(this.cloudPuffGeo, this.cloudMat, totalPuffs);
    this.iClouds.castShadow    = false;
    this.iClouds.receiveShadow = false;
    this.scene.add(this.iClouds);

    // Procedural cloud anchors
    this.cloudAnchors = [];
    const skyRadius = 1400;

    for (let i = 0; i < this.count; i++) {
      const angle = (i / this.count) * Math.PI * 2 + Math.random() * 0.5;
      const dist  = 180 + Math.random() * (skyRadius - 180);
      const x     = Math.cos(angle) * dist;
      const z     = Math.sin(angle) * dist;
      const y     = 220 + Math.random() * 80;
      const scale = 14 + Math.random() * 22;

      this.cloudAnchors.push({
        baseX: x,
        baseY: y,
        baseZ: z,
        scale,
        rotY: Math.random() * Math.PI * 2,
        driftSpeed: 3.5 + Math.random() * 2.5,
      });
    }

    this._dummy = new THREE.Object3D();
    this._windTime = 0;
  }

  setEnvironment(envName) {
    if (envName === 'night') {
      this.cloudMat.color.setHex(0x1e293b); // Deep moonlit silver-blue
      this.cloudMat.opacity = 0.70;
    } else if (envName === 'sunset') {
      this.cloudMat.color.setHex(0xfda4af); // Warm sunset peach / pink
      this.cloudMat.opacity = 0.90;
    } else if (envName === 'morning') {
      this.cloudMat.color.setHex(0xfef08a); // Soft golden morning
      this.cloudMat.opacity = 0.90;
    } else {
      this.cloudMat.color.setHex(0xf8fafc); // Crisp bright daylight white
      this.cloudMat.opacity = 0.92;
    }
  }

  update(dt, carPosition) {
    if (!carPosition || !this.iClouds) return;

    this._windTime += dt;
    let puffIdx = 0;
    const dummy = this._dummy;

    const windDirX = 0.8;
    const windDirZ = 0.6;
    const skySpan  = 1600;

    for (let i = 0; i < this.count; i++) {
      const c = this.cloudAnchors[i];

      // Wind drift relative to car center
      const driftOffset = this._windTime * c.driftSpeed;
      let cx = carPosition.x + ((c.baseX + driftOffset * windDirX + skySpan) % (skySpan * 2)) - skySpan;
      let cz = carPosition.z + ((c.baseZ + driftOffset * windDirZ + skySpan) % (skySpan * 2)) - skySpan;
      let cy = c.baseY;
      const cs = c.scale;

      // 5 Overlapping Puffs per Cloud Formation
      // 1. Center Main Puff
      dummy.position.set(cx, cy, cz);
      dummy.scale.set(cs * 1.6, cs * 0.9, cs * 1.4);
      dummy.rotation.set(0, c.rotY, 0);
      dummy.updateMatrix();
      this.iClouds.setMatrixAt(puffIdx++, dummy.matrix);

      // 2. Left Puff
      dummy.position.set(cx - cs * 0.9, cy - cs * 0.1, cz + cs * 0.3);
      dummy.scale.set(cs * 1.1, cs * 0.75, cs * 1.0);
      dummy.rotation.set(0, c.rotY + 0.4, 0);
      dummy.updateMatrix();
      this.iClouds.setMatrixAt(puffIdx++, dummy.matrix);

      // 3. Right Puff
      dummy.position.set(cx + cs * 0.95, cy - cs * 0.15, cz - cs * 0.2);
      dummy.scale.set(cs * 1.2, cs * 0.8, cs * 1.1);
      dummy.rotation.set(0, c.rotY + 0.8, 0);
      dummy.updateMatrix();
      this.iClouds.setMatrixAt(puffIdx++, dummy.matrix);

      // 4. Front Puff
      dummy.position.set(cx + cs * 0.2, cy - cs * 0.2, cz + cs * 0.8);
      dummy.scale.set(cs * 1.0, cs * 0.7, cs * 0.9);
      dummy.rotation.set(0, c.rotY + 1.2, 0);
      dummy.updateMatrix();
      this.iClouds.setMatrixAt(puffIdx++, dummy.matrix);

      // 5. Top Dome Puff
      dummy.position.set(cx - cs * 0.1, cy + cs * 0.35, cz - cs * 0.1);
      dummy.scale.set(cs * 1.1, cs * 0.85, cs * 1.0);
      dummy.rotation.set(0, c.rotY + 1.6, 0);
      dummy.updateMatrix();
      this.iClouds.setMatrixAt(puffIdx++, dummy.matrix);
    }

    this.iClouds.instanceMatrix.needsUpdate = true;
  }
}
