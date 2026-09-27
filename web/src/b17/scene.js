import * as THREE from 'three';
import { ArenaView } from '../graphics/scene.js';
import { STATIONS } from './flight.js';
import { buildWarbird, flash } from './models.js';

export class BomberView extends ArenaView
{
  get supportsMissiles() { return false; }

  get tracerDelay() { return 0; }

  tracerStart(projectile, result)
  {
    // Show the muzzle-to-round segment on its first frame, including when a
    // render spans multiple physics ticks. Later streaks follow the free round.
    const emerging = !projectile.tracerShown && projectile.age <= .06;
    projectile.tracerShown = true;
    return emerging ? result.copy(projectile.launchPosition) : super.tracerStart(projectile, result);
  }

  updateRecoil(cannon, kick)
  {
    // Cycle the receiver, keeping the barrel tip aligned with the launch point.
    cannon.userData.bolt.position.z = .03 + kick * .045;
  }

  buildWorld()
  {
    this.scene.fog = new THREE.Fog(0xb6c6ce, 4000, 28000);
    this.camera.far = 35000;
    this.camera.position.copy(STATIONS.tail.position);
    this.camera.rotation.set(0, 0, 0);
    this.station = 'tail';
    const sky = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 direction; void main(){float h=normalize(direction).y; vec3 c=mix(vec3(.76,.82,.85),vec3(.18,.39,.60),smoothstep(-.12,.7,h)); gl_FragColor=vec4(c,1.0);}' });
    this.mesh(new THREE.SphereGeometry(34000, 32, 20), sky, this.scene);
    const map = document.createElement('canvas');
    map.width = map.height = 2048;
    const ctx = map.getContext('2d');
    const fields = ['#667650', '#8a8b57', '#a29769', '#68784f', '#536b4b', '#b4a378', '#7d814f'];
    ctx.fillStyle = '#6d815c';
    ctx.fillRect(0, 0, 2048, 2048);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++)
    {
      const hash = (x * 73 + y * 37 + x * y * 11) % 97;
      ctx.fillStyle = fields[hash % fields.length];
      const inset = hash % 4, split = hash % 3 === 0;
      ctx.fillRect(x * 64 + inset, y * 64 + 1, 63 - inset, 62);
      if (split) { ctx.fillStyle = fields[(hash + 3) % fields.length]; ctx.fillRect(x * 64 + 30, y * 64 + 1, 32, 62); }
      ctx.strokeStyle = '#b7af8728';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x * 64 + 5, y * 64 + 8 + i * 9); ctx.lineTo(x * 64 + 59, y * 64 + 8 + i * 9); ctx.stroke(); }
      if (hash < 18)
      {
        ctx.fillStyle = '#3a5141';
        for (let n = 0; n < 150; n++) { ctx.beginPath(); ctx.arc(x * 64 + 8 + n * 17 % 48, y * 64 + 6 + n * 23 % 52, 1 + n % 4, 0, Math.PI * 2); ctx.fill(); }
      }
      if (hash > 92)
      {
        ctx.fillStyle = '#b9b4a3';
        ctx.fillRect(x * 64 + 22, y * 64 + 5, 3, 54);
        ctx.fillStyle = '#66584f';
        for (let n = 0; n < 23; n++) ctx.fillRect(x * 64 + 12 + n * 7 % 26, y * 64 + 6 + n * 11 % 50, 2 + n % 3, 3);
      }
    }
    ctx.strokeStyle = '#bec2ae';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 1550); ctx.bezierCurveTo(500, 1150, 1250, 1300, 2048, 500); ctx.stroke();
    ctx.strokeStyle = '#648693';
    ctx.lineWidth = 25;
    ctx.beginPath(); ctx.moveTo(520, 0); ctx.bezierCurveTo(1650, 650, -100, 1400, 1250, 2048); ctx.stroke();
    // Fine surface grain keeps the high-altitude landscape from reading as a map.
    const pixels = ctx.getImageData(0, 0, 2048, 2048);
    let noise = 17;
    for (let i = 0; i < pixels.data.length; i += 4)
    {
      noise = (Math.imul(noise, 1664525) + 1013904223) >>> 0;
      const grain = (noise / 4294967296 - .5) * 18;
      for (let c = 0; c < 3; c++) pixels.data[i + c] += grain;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(map);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 5);
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.textures.add(texture);
    this.ground = this.mesh(new THREE.PlaneGeometry(100000, 100000), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }), this.scene, 0, -6000, 0);
    this.ground.rotation.x = -Math.PI / 2;
    this.clouds = [];
    const cloudMaterial = new THREE.SpriteMaterial({ map: this.smokeTexture, color: 0xffffff, opacity: .7, transparent: true, depthWrite: false, fog: true });
    for (let i = 0; i < 95; i++)
    {
      const cloud = new THREE.Sprite(cloudMaterial);
      cloud.position.set(Math.sin(i * 17.13) * 4300, -450 - (i % 7) * 100, (i / 95 - .5) * 10000);
      cloud.scale.set(450 + i % 5 * 110, 110 + i % 4 * 40, 1);
      this.scene.add(cloud);
      cloud.userData.home = { x: cloud.position.x, y: cloud.position.y, z: cloud.position.z };
      cloud.userData.worldPosition = { ...cloud.userData.home };
      this.clouds.push(cloud);
    }
    // Nearby cloud edges give strong parallax at the actual airspeed; the distant
    // cloud deck alone moves too little to communicate flight from a fixed gun.
    this.nearClouds = [];
    const mist = new THREE.SpriteMaterial({ map: this.smokeTexture, color: 0xf4f6f4, opacity: .3, transparent: true, depthWrite: false });
    for (let i = 0; i < 44; i++)
    {
      const cloud = new THREE.Sprite(mist);
      cloud.position.set((i % 2 ? 1 : -1) * (45 + i % 6 * 27), -22 - i % 5 * 17, -1250 + i * 63);
      cloud.scale.set(75 + i % 4 * 25, 22 + i % 3 * 12, 1);
      this.scene.add(cloud);
      cloud.userData.home = { x: cloud.position.x, y: cloud.position.y, z: cloud.position.z };
      cloud.userData.worldPosition = { ...cloud.userData.home };
      this.nearClouds.push(cloud);
    }
    this.ownBomber = buildWarbird(this, true);
    this.ownBomber.position.set(0, 8, 0);
    this.ownBomber.rotation.y = Math.PI;
    this.bomberModels = new Map();
    this.supportLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: .95, toneMapped: false }));
    this.supportLines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(320 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.supportLines.geometry.setDrawRange(0, 0);
    this.supportLines.frustumCulled = false;
    this.scene.add(this.supportLines);
    this.contrails = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, 1.3, 1, 6), new THREE.MeshBasicMaterial({ color: 0xecf1f1, transparent: true, opacity: .17, depthWrite: false }), 16);
    this.contrails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.contrails.frustumCulled = false;
    this.scene.add(this.contrails);
    this.flakModels = Array.from({ length: 12 }, () => {
      const group = new THREE.Group();
      for (let i = 0; i < 7; i++)
      {
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTexture, color: 0x222326, transparent: true, opacity: .9, depthWrite: false }));
        puff.position.set(Math.sin(i * 7) * 7, Math.cos(i * 4) * 5, Math.sin(i * 3) * 5);
        group.add(puff);
      }
      group.visible = false;
      this.scene.add(group);
      return group;
    });
    this.frame = new THREE.Group();
    this.camera.add(this.frame);
    const metal = new THREE.MeshStandardMaterial({ color: 0x4e5c49, roughness: .68, metalness: .45 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x202722, roughness: .9 });
    // Window edges follow viewport aspect so the firing aperture stays usable.
    this.frameSides = [-1, 1].map(side => {
      const beam = this.mesh(new THREE.BoxGeometry(.065, 1.7, .13), metal, this.frame, side, 0, -1.4);
      return beam;
    });
    this.frameTop = this.mesh(new THREE.BoxGeometry(3, .085, .13), metal, this.frame, 0, .77, -1.4);
    this.frameBottom = this.mesh(new THREE.BoxGeometry(3, .2, .2), metal, this.frame, 0, -.8, -1.4);
    this.mesh(new THREE.BoxGeometry(.7, .14, .32), rubber, this.frame, 0, -.62, -.9);
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++)
      this.mesh(new THREE.SphereGeometry(.014, 6, 5), rubber, this.frameSides[side === -1 ? 0 : 1], 0, -.65 + i * .19, .07);
    this.turretFrame = new THREE.Group();
    this.camera.add(this.turretFrame);
    this.turretRim = this.mesh(new THREE.TorusGeometry(.8, .045, 8, 64), metal, this.turretFrame, 0, 0, -1.4);
    this.mesh(new THREE.BoxGeometry(.065, .48, .08), metal, this.turretFrame, 0, .68, -1.4);
    this.turretFrame.visible = false;
    this.resetStations();
  }

  buildTurret()
  {
    this.gun = new THREE.Group();
    this.gun.position.set(0, -.36, -.65);
    this.camera.add(this.gun);
    const steel = new THREE.MeshStandardMaterial({ color: 0x4f5753, metalness: .75, roughness: .4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222a27, metalness: .45, roughness: .65 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xa28b4f, metalness: .6, roughness: .45 });
    this.barrelMaterial = steel;
    this.cannons = [-1, 1].map(side => {
      const barrel = new THREE.Group();
      this.gun.add(barrel);
      const x = side * .19;
      this.mesh(new THREE.BoxGeometry(.16, .18, .55), dark, barrel, x, 0, .04);
      barrel.userData.bolt = this.mesh(new THREE.BoxGeometry(.18, .035, .45), steel, barrel, x, .105, .03);
      this.mesh(new THREE.CylinderGeometry(.048, .055, .77, 14), steel, barrel, x, .025, -.56).rotation.x = Math.PI / 2;
      this.mesh(new THREE.CylinderGeometry(.025, .025, .3, 12), dark, barrel, x, .025, -1.08).rotation.x = Math.PI / 2;
      for (let i = 0; i < 9; i++)
        for (const flank of [-1, 1]) this.mesh(new THREE.SphereGeometry(.016, 6, 5), dark, barrel, x + flank * .04, .047, -.24 - i * .077).scale.set(.4, 1, 1);
      for (let i = 0; i < 8; i++) this.mesh(new THREE.CylinderGeometry(.012, .012, .12, 6), brass, barrel, x + side * (.1 + i * .035), -.02 - (i / 8) ** 2 * .1, .08).rotation.x = Math.PI / 2;
      this.mesh(new THREE.CylinderGeometry(.035, .035, .18, 10), dark, barrel, x + side * .08, -.055, .37);
      barrel.userData.flash = flash(this, barrel, new THREE.Vector3(x, .025, -1.27), .6);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(x, .025, -1.23);
      barrel.add(muzzle);
      barrel.userData.muzzle = muzzle;
      barrel.userData.shotTime = 0;
      return barrel;
    });
    this.muzzlePoint = new THREE.Vector3();
  }

  setStation(key)
  {
    const station = STATIONS[key];
    this.station = key;
    this.camera.position.copy(station.position);
    const aim = this.turretAngles[key];
    const direction = aim ? new THREE.Vector3(Math.sin(aim.yaw) * Math.cos(aim.pitch), Math.sin(aim.pitch), -Math.cos(aim.yaw) * Math.cos(aim.pitch)) : station.forward;
    this.camera.lookAt(new THREE.Vector3().copy(station.position).add(direction));
    this.stationRotation = this.camera.quaternion.clone();
    this.cannons[1].visible = station.guns === 2;
    this.cannons[0].position.x = station.guns === 1 ? .19 : 0;
    this.frame.visible = !station.rotating;
    this.turretFrame.visible = Boolean(station.rotating);
    this.camera.updateMatrixWorld();
  }

  resetStations()
  {
    this.turretAngles = { ball: { yaw: 0, pitch: -.8 }, top: { yaw: 0, pitch: .3 } };
  }

  updateStationAim(x, y, dt, game, keys, reducedMotion = false)
  {
    const aim = this.turretAngles[game.station];
    if (aim && game.state === 'playing')
    {
      const edge = v => Math.abs(v) < .55 ? 0 : Math.sign(v) * (Math.abs(v) - .55) / .45;
      aim.yaw += (edge(x) + Number(keys.right) - Number(keys.left)) * dt * 1.2;
      aim.yaw = Math.atan2(Math.sin(aim.yaw), Math.cos(aim.yaw));
      aim.pitch = Math.max(-1.48, Math.min(game.station === 'ball' ? -.04 : 1.48, aim.pitch + (edge(y) + Number(keys.up) - Number(keys.down)) * dt * .85));
    }
    this.setStation(game.station);
    // Freeze the complete camera pose BEFORE directionAt() and muzzlePosition().
    // Rendering must not bank the camera after a shot has used its unbanked ray.
    this.camera.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), game.flight.bank));
    if (!reducedMotion)
    {
      const t = this.clock;
      this.camera.rotateZ(Math.sin(t * 1.7) * .0025 + Math.sin(t * 29) * game.spool * .0009);
      this.camera.position.y += Math.sin(t * 2.1) * .025 + Math.sin(t * 31) * game.spool * .008;
      this.camera.rotateX(Math.sin(t * 1.1) * .0015);
    }
    this.camera.updateMatrixWorld();
  }

  muzzlePosition(barrel, direction)
  {
    this.aimGun(direction);
    this.cannons[barrel].userData.muzzle.getWorldPosition(this.muzzlePoint);
    return this.muzzlePoint;
  }

  isAttackVisible(target)
  {
    this.camera.updateMatrixWorld();
    const p = this.attackPosition.copy(target.position).applyMatrix4(this.camera.matrixWorldInverse);
    const depth = -p.z, halfHeight = depth * Math.tan(this.camera.fov * Math.PI / 360);
    return depth > 30 && (Math.abs(p.x) + 7) < halfHeight * this.camera.aspect * .83 && p.y - 7 > -halfHeight * .57 && p.y + 7 < halfHeight * .62;
  }

  smokeAt(position, size, dt)
  {
    if (dt <= 0 || this.clock < this.nextSmoke) return;
    const cloud = this.smoke.find(c => c.life <= 0);
    if (!cloud) return;
    cloud.life = cloud.maxLife = 2.8;
    cloud.dark = true;
    cloud.size = size;
    cloud.sprite.position.copy(position);
    cloud.velocity.set(0, 2, -22);
  }

  updateTargets(game, dt, reducedMotion)
  {
    if (this.station !== game.station) this.setStation(game.station);
    for (const cloud of [...this.clouds, ...this.nearClouds])
    {
      const w = cloud.userData.worldPosition, wind = game.flight.meanWind;
      cloud.position.copy(game.flight.toLocal({ x: w.x + wind.x * game.time, y: w.y, z: w.z + wind.z * game.time }));
      const boundary = this.nearClouds.includes(cloud) ? 1450 : 5500;
      if (cloud.position.z < -boundary || Math.abs(cloud.position.x) > boundary * 1.5)
      {
        cloud.position.set(cloud.userData.home.x, cloud.userData.home.y, boundary);
        const next = game.flight.toWorld(cloud.position);
        cloud.userData.worldPosition = { x: next.x - wind.x * game.time, y: next.y, z: next.z - wind.z * game.time };
      }
    }
    for (const prop of this.ownBomber.userData.propellers) prop.rotation.z = reducedMotion ? 0 : this.clock * 38;
    this.ownBomber.rotation.z = -game.flight.bank;
    this.ground.position.copy(game.flight.toLocal({ x: 0, y: -6000, z: 0 }));
    this.ground.rotation.set(-Math.PI / 2, -game.flight.heading, 0, 'YXZ');
    this.flakModels.forEach((model, i) => {
      const burst = game.flak[i];
      model.visible = Boolean(burst?.exploded);
      if (!model.visible) return;
      model.position.copy(burst.position);
      const age = 6 - burst.life;
      for (const puff of model.children)
      {
        puff.scale.setScalar(9 + age * 4);
        puff.material.opacity = Math.min(.88, burst.life / 2);
        puff.material.rotation = age * .13;
      }
    });
    for (const target of game.targets)
    {
      let model = this.targetModels.get(target.id);
      if (!model) { model = buildWarbird(this, false, target.kind); this.targetModels.set(target.id, model); }
      model.position.copy(target.position);
      model.rotation.set(target.pitch, target.heading, target.bank, 'YXZ');
      for (const prop of model.userData.propellers) prop.rotation.z = reducedMotion ? 0 : this.clock * (target.alive ? 42 : 9);
      model.userData.muzzle.visible = target.alive && target.muzzleFlash > 0;
      model.userData.paint.emissive.setRGB(target.hitFlash * .9, target.hitFlash * .2, 0);
      if (target.health < target.maxHealth * .7) this.smokeAt(target.position, target.alive ? 1.4 + (1 - target.health / target.maxHealth) * 1.8 : 3.5, dt);
    }
    const ids = new Set(game.targets.map(t => t.id));
    for (const [id, model] of this.targetModels) if (!ids.has(id)) { this.removeModel(model); this.targetModels.delete(id); }
    let trails = 0;
    for (const ally of game.allies)
    {
      let model = this.bomberModels.get(ally.id);
      if (!model) { model = buildWarbird(this, true); this.bomberModels.set(ally.id, model); }
      model.visible = ally.alive || ally.deadAge < 12;
      model.position.copy(ally.position);
      model.rotation.set(ally.alive ? 0 : -ally.deadAge * .035, Math.PI, ally.alive ? -game.flight.bank + Math.sin(this.clock * .2 + ally.home.x) * .012 : Math.min(1.2, ally.deadAge * .1));
      for (const prop of model.userData.propellers) prop.rotation.z = reducedMotion ? 0 : this.clock * 38;
      model.userData.muzzle.visible = ally.alive && ally.flash > 0;
      if (ally.health < 40 && model.visible) this.smokeAt(ally.position, ally.alive ? 2.5 : 5, dt);
      if (ally.alive) for (const x of [-10, -5, 5, 10])
      {
        this.dummy.position.set(ally.position.x + x, ally.position.y, ally.position.z - 145);
        this.dummy.rotation.set(-Math.PI / 2, 0, 0);
        this.dummy.scale.set(1, 260, 1);
        this.dummy.updateMatrix();
        this.contrails.setMatrixAt(trails++, this.dummy.matrix);
      }
    }
    this.contrails.count = trails;
    this.contrails.instanceMatrix.needsUpdate = true;
    if (dt > 0 && this.clock >= (this.nextSmoke || 0)) this.nextSmoke = this.clock + .08;
    let n = 0;
    const positions = this.supportLines.geometry.attributes.position;
    for (const shot of game.support.slots)
    {
      if (!shot.alive) continue;
      const p = shot.position, prev = shot.previous;
      positions.array.set([p.x, p.y, p.z, prev.x, prev.y, prev.z], n++ * 6);
    }
    this.supportLines.geometry.setDrawRange(0, n * 2);
    positions.needsUpdate = true;
  }

  resize()
  {
    super.resize();
    if (!this.frameSides) return;
    const half = Math.tan(this.camera.fov * Math.PI / 360) * 1.4;
    this.frameSides.forEach((beam, i) => beam.position.x = (i ? 1 : -1) * half * this.camera.aspect * .96);
    this.frameTop.scale.x = this.frameBottom.scale.x = half * this.camera.aspect * 2 / 3;
    if (this.turretRim) this.turretRim.scale.x = this.camera.aspect;
  }

  clearEffects()
  {
    super.clearEffects();
    this.supportLines.geometry.setDrawRange(0, 0);
    this.nextSmoke = 0;
    for (const cloud of [...this.clouds, ...this.nearClouds]) cloud.userData.worldPosition = { ...cloud.userData.home };
    for (const model of this.targetModels.values()) this.removeModel(model);
    this.targetModels.clear();
  }

  attackMarkers(game)
  {
    return game.targets.filter(t => t.alive && (t.muzzleFlash > 0 || t.health < t.maxHealth)).flatMap(target => {
      const p = this.flightDirection.copy(target.position).add(new THREE.Vector3(0, 9, 0)).project(this.camera);
      if (p.z < -1 || p.z > 1 || Math.abs(p.x) > .91 || Math.abs(p.y) > .8) return [];
      return [{ x: (p.x + 1) * 50, y: (1 - p.y) * 50, label: `${target.kind === 'bf109' ? 'Bf 109' : 'Fw 190'} · ${Math.ceil(target.health / target.maxHealth * 100)}%${target.muzzleFlash > 0 ? ' · FIRING' : ''}` }];
    });
  }
}
