import * as THREE from 'three';
import { ArenaView } from '../graphics/scene.js';
import { buildBomb } from '../graphics/visuals.js';
import { buildTank, buildWarthog } from './models.js';
import { terrainHeight, groundContact, add, sub, scale, length } from './flight.js';

export class A10View extends ArenaView
{
  get supportsMissiles() { return false; }

  buildWorld()
  {
    this.renderer.setClearColor(0xbacbd0);
    this.scene.fog = new THREE.Fog(0xbacbd0, 3800, 13500);
    this.camera.far = 18000;
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    const terrain = new THREE.PlaneGeometry(22000, 22000, 160, 160);
    terrain.rotateX(-Math.PI / 2);
    const positions = terrain.attributes.position, colors = [];
    for (let i = 0; i < positions.count; i++)
    {
      const x = positions.getX(i), z = positions.getZ(i);
      positions.setY(i, terrainHeight(x, z));
      const tone = .88 + .08 * Math.sin(x * .016) * Math.cos(z * .011) + .035 * Math.sin(x * .18 + z * .08);
      colors.push(.58 * tone, .48 * tone, .32 * tone);
    }
    terrain.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    terrain.computeVertexNormals();
    this.mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), this.scene);
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x756f5c, roughness: 1 });
    // Segmented roads follow the same height field as vehicles and collisions.
    const roads = new THREE.InstancedMesh(new THREE.PlaneGeometry(30, 72), roadMat, 240);
    const roadTile = new THREE.Object3D();
    roadTile.rotation.x = -Math.PI / 2;
    let roadIndex = 0;
    for (const x of [-1200, 600]) for (let z = -4200; z < 4200; z += 70)
    {
      roadTile.position.set(x, terrainHeight(x, z) + .4, z);
      roadTile.updateMatrix();
      roads.setMatrixAt(roadIndex++, roadTile.matrix);
    }
    this.scene.add(roads);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x988564, roughness: 1, flatShading: true });
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMat, 340);
    const dummy = new THREE.Object3D();
    let seed = 982;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 340; i++)
    {
      const x = (random() - .5) * 13000, z = (random() - .5) * 13000;
      dummy.position.set(x, terrainHeight(x, z) - 1, z);
      dummy.scale.set(6 + random() * 14, 2 + random() * 5, 5 + random() * 10);
      dummy.rotation.set(0, random() * 6.28, 0); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(rocks);
    for (let i = 0; i < 36; i++)
    {
      const angle = i / 36 * Math.PI * 2, radius = 7000 + random() * 1800;
      const shape = new THREE.SphereGeometry(1, 12, 7);
      const vertices = shape.attributes.position;
      for (let j = 0; j < vertices.count; j++)
      {
        const y = vertices.getY(j);
        vertices.setY(j, y > .65 ? .65 + (y - .65) * .3 : y);
      }
      shape.computeVertexNormals();
      const hill = this.mesh(shape, rockMat, this.scene, Math.sin(angle) * radius, -80, Math.cos(angle) * radius);
      hill.scale.set(900 + random() * 850, 500 + random() * 650, 850 + random() * 1000);
      hill.rotation.y = random() * 6.28;
    }
    // Low, non-colliding field details avoid invisible obstacles in the flight area.
    const padMat = new THREE.MeshStandardMaterial({ color: 0x8d8067, roughness: 1 });
    for (let i = 0; i < 45; i++)
    {
      const x = (random() - .5) * 8500, z = (random() - .5) * 8500;
      const pad = this.mesh(new THREE.CircleGeometry(15 + random() * 25, 12), padMat, this.scene, x, terrainHeight(x, z) + .5, z);
      pad.rotation.x = -Math.PI / 2;
    }
  }

  buildTurret()
  {
    this.aircraft = buildWarthog(this);
    this.scene.add(this.aircraft);
    this.cannons = [this.aircraft.userData.gun];
    this.barrelMaterial = this.aircraft.userData.barrelMaterial;
    this.chasePosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
  }

  buildAttackEffects()
  {
    super.buildAttackEffects();
    this.bombModels = Array.from({ length: 8 }, () => {
      const model = buildBomb(this);
      model.scale.setScalar(.5);
      this.scene.add(model);
      return model;
    });
    this.incomingGlow.material.size = 3;
    this.incomingTracers.material.color.setHex(0xff6b35);
  }

  aimGun() {}
  updateRecoil() {}
  gunLeadMarker() { return null; }
  directionAt() { return this.aim.copy(this.game?.flight.forward || { x: 0, y: 0, z: -1 }); }
  soundPosition(point) { return this.camera.worldToLocal(new THREE.Vector3(point.x, point.y, point.z)); }

  reticleAt()
  {
    if (!this.game) return { x: 0, y: 0 };
    const flight = this.game.flight, end = add(flight.muzzle, scale(flight.forward, 1800));
    const contact = groundContact(flight.muzzle, end);
    const point = contact === null ? end : add(flight.muzzle, scale(sub(end, flight.muzzle), contact));
    return this.flightDirection.copy(point).project(this.camera);
  }

  syncFlight(game)
  {
    this.game = game;
    const f = game.flight;
    this.aircraft.position.copy(f.position);
    this.aircraft.rotation.set(f.pitch, f.heading, f.bank, 'YXZ');
    // Follow pitch and heading but keep the horizon steady while the aircraft banks.
    this.chasePosition.set(0, 11, 39).applyEuler(new THREE.Euler(f.pitch * .65, f.heading, 0, 'YXZ')).add(this.aircraft.position);
    this.camera.position.copy(this.chasePosition);
    this.cameraTarget.copy(f.position).addScaledVector(this.flightDirection.copy(f.forward), 250);
    this.cameraTarget.y += 2;
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld(true);
  }

  updateTargets(game, dt)
  {
    for (const tank of game.targets)
    {
      let model = this.targetModels.get(tank.id);
      if (!model) { model = buildTank(this); this.targetModels.set(tank.id, model); this.scene.add(model); }
      model.position.copy(tank.position);
      model.rotation.y = tank.heading;
      const data = model.userData;
      data.turret.rotation.y = Math.atan2(-tank.aim.x, -tank.aim.z) - tank.heading;
      data.barrel.rotation.x = Math.asin(tank.aim.y);
      data.flash.visible = tank.alive && tank.muzzleFlash > 0;
      data.paint.color.setHex(tank.alive ? 0x666344 : 0x292821);
      data.edges.color.setHex(tank.alive ? 0x969077 : 0x38342b);
      data.paint.emissive.setHex(tank.hitFlash > 0 ? 0x9a4016 : 0x000000);
      if (!tank.alive && dt > 0 && Math.floor(this.clock * 3) !== Math.floor((this.clock - dt) * 3)) this.burst(tank.position, false);
    }
    const ids = new Set(game.targets.map(t => t.id));
    for (const [id, model] of this.targetModels) if (!ids.has(id)) { this.removeModel(model); this.targetModels.delete(id); }
  }

  attackMarkers(game)
  {
    const locked = game.jdamTarget(), markers = [];
    for (const tank of game.targets)
    {
      if (!tank.alive || length(sub(tank.position, game.flight.position)) > 3600) continue;
      if (groundContact(game.flight.position, tank.position) !== null) continue;
      const point = this.flightDirection.copy(tank.position).add(new THREE.Vector3(0, 8, 0)).project(this.camera);
      if (point.z < -1 || point.z > 1 || Math.abs(point.x) > .94 || Math.abs(point.y) > .82) continue;
      const distance = Math.round(length(sub(tank.position, game.flight.position)));
      markers.push({ x: (point.x + 1) * 50, y: (1 - point.y) * 50, locked: tank === locked,
        label: `${tank === locked ? '◇ JDAM' : tank.muzzleFlash > 0 ? '⚠ FIRING' : 'TANK'} · ${distance} M${tank.health < 100 ? ` · ${tank.health}%` : ''}` });
    }
    return markers;
  }

  navigation(game)
  {
    const tanks = game.targets.filter(t => t.alive).sort((a, b) => length(sub(a.position, game.flight.position)) - length(sub(b.position, game.flight.position)));
    if (!tanks.length) return 'SECTOR CLEAR · REINFORCEMENTS INBOUND';
    const tank = tanks[0], offset = sub(tank.position, game.flight.position);
    const heading = Math.atan2(-offset.x, -offset.z);
    const angle = Math.atan2(Math.sin(heading - game.flight.heading), Math.cos(heading - game.flight.heading));
    return `NEAREST ${(length(offset) / 1000).toFixed(1)} KM · ${Math.abs(angle) < .15 ? 'AHEAD' : `${angle > 0 ? '← LEFT' : 'RIGHT →'} ${Math.round(Math.abs(angle) * 180 / Math.PI)}°`}`;
  }

  render(game, direction, dt, reducedMotion)
  {
    this.syncFlight(game);
    super.render(game, direction, dt, reducedMotion);
  }

  clearEffects()
  {
    const position = this.cannons[0].position.clone();
    super.clearEffects();
    this.cannons[0].position.copy(position);
  }
}
