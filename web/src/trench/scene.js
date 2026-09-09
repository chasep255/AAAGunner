import
{
  updateBiplanes
}
from './aircraft.js';
import
{
  TRENCH_CAMERA
}
from './terrain.js';
import
{
  buildTrenchWorld,
  updateBattlefield
}
from './world.js';
import * as THREE from 'three';
import
{
  BloodEffects
}
from './blood.js';
import
{
  ArenaView
}
from '../graphics/scene.js';
import
{
  MAX_INFANTRY
}
from './game.js';

export class TrenchView extends ArenaView
{
  get supportsMissiles()
  {
    return false;
  }
  buildWorld()
  {
    buildTrenchWorld(this);
    this.buildSoldiers();
    this.friendlyMounts = [-1, 1].map(() =>
    {
      const mount = new THREE.Group();
      const material = new THREE.MeshStandardMaterial(
      {
        color: 0x3f4841,
        roughness: .55,
        metalness: .5
      });
      this.mesh(new THREE.BoxGeometry(.36, .27, .58), material, mount, 0, 1.4, .3);
      this.mesh(new THREE.CylinderGeometry(.13, .13, .85, 12), material, mount, 0, 1.4, -.35).rotation.x = Math.PI / 2;
      for (const side of [-1, 1])
      {
        const leg = this.mesh(new THREE.CylinderGeometry(.035, .045, 1.2, 6), material, mount, side * .22, .65, .35);
        leg.rotation.z = side * .35;
      }
      this.scene.add(mount);
      return mount;
    });
    this.blood = new BloodEffects(this.scene, (x, z) => this.terrain.height(x, z));
    this.hiddenPart = new THREE.Matrix4().makeScale(0, 0, 0);
    this.artilleryModels = Array.from(
    {
      length: 6
    }, () =>
    {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial(
      {
        map: this.glowTexture,
        color: 0xffd79b,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }));
      glow.scale.setScalar(1.4);
      glow.visible = false;
      this.scene.add(glow);
      return glow;
    });
    this.rifleFlashes = Array.from(
    {
      length: MAX_INFANTRY
    }, () =>
    {
      const model = new THREE.Sprite(new THREE.SpriteMaterial(
      {
        map: this.glowTexture,
        color: 0xffd99a,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }));
      model.scale.setScalar(1.15);
      model.visible = false;
      this.scene.add(model);
      return model;
    });
    this.allyFlashes = Array.from(
    {
      length: 2
    }, () =>
    {
      const glow = new THREE.Sprite(new THREE.SpriteMaterial(
      {
        map: this.glowTexture,
        color: 0xffdca1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }));
      glow.scale.setScalar(.85);
      glow.visible = false;
      this.scene.add(glow);
      return glow;
    });
  }
  buildSoldiers()
  {
    this.soldier = new THREE.Group();
    this.soldierParts = [];
    const uniform = new THREE.MeshStandardMaterial(
    {
      color: 0xffffff,
      roughness: .92
    });
    const skin = new THREE.MeshStandardMaterial(
    {
      color: 0xb6a28b,
      roughness: .85
    });
    const leather = new THREE.MeshStandardMaterial(
    {
      color: 0x594b36,
      roughness: .9
    });
    const part = (geometry, material, parent, x, y, z, tinted = false) =>
    {
      const node = this.mesh(geometry, material, parent, x, y, z);
      const instances = new THREE.InstancedMesh(geometry, material, MAX_INFANTRY + 40);
      instances.frustumCulled = false;
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      instances.castShadow = true;
      instances.receiveShadow = true;
      this.scene.add(instances);
      this.soldierParts.push(
      {
        node,
        instances,
        tinted
      });
      return node;
    };
    part(new THREE.CapsuleGeometry(.22, .3, 3, 6), uniform, this.soldier, 0, 1.05, 0, true);
    part(new THREE.CylinderGeometry(.08, .09, .15, 8), skin, this.soldier, 0, 1.445, 0);
    this.head = part(new THREE.SphereGeometry(.14, 8, 6), skin, this.soldier, 0, 1.57, 0);
    const helmet = part(new THREE.SphereGeometry(.19, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), uniform, this.soldier, 0, 1.65, 0, true);
    helmet.scale.y = .75;
    this.helmet = helmet;
    const brim = part(new THREE.SphereGeometry(.22, 14, 8, 0, Math.PI * 2, Math.PI * .43, Math.PI * .14), uniform, this.soldier, 0, 1.63, 0, true);
    brim.scale.y = .26;
    part(new THREE.CylinderGeometry(.105, .12, .07, 10), uniform, this.soldier, 0, 1.39, 0, true);
    part(new THREE.BoxGeometry(.44, .085, .3), leather, this.soldier, 0, .86, 0);
    for (const side of [-1, 1])
    {
      part(new THREE.SphereGeometry(.047, 7, 5), skin, this.soldier, side * .13, 1.57, .015);
      const strap = part(new THREE.BoxGeometry(.047, .56, .045), leather, this.soldier, side * .13, 1.13, .206);
      strap.rotation.z = side * .13;
      part(new THREE.BoxGeometry(.105, .14, .1), leather, this.soldier, side * .135, .94, .24);
      part(new THREE.SphereGeometry(.061, 8, 6), leather, this.soldier, side * .25, 1.07, .4);
    }
    part(new THREE.SphereGeometry(.036, 7, 5), skin, this.soldier, 0, 1.57, .13).scale.set(1, 1.3, 1.5);
    const eyes = new THREE.MeshStandardMaterial(
    {
      color: 0x302b24,
      roughness: .8
    });
    for (const side of [-1, 1])
    {
      const eye = part(new THREE.SphereGeometry(.017, 7, 5), eyes, this.soldier, side * .055, 1.595, .127);
      eye.scale.y = .6;
      const brow = part(new THREE.BoxGeometry(.049, .012, .014), leather, this.soldier, side * .055, 1.62, .125);
      brow.rotation.z = side * .18;
    }
    part(new THREE.BoxGeometry(.052, .011, .01), eyes, this.soldier, 0, 1.52, .128);
    this.wound = part(new THREE.SphereGeometry(.19, 7, 5), new THREE.MeshBasicMaterial(
    {
      color: 0x941f18
    }), this.soldier, .06, 1.07, .17);
    this.wound.scale.set(1, 1.2, .3);
    this.pack = part(new THREE.BoxGeometry(.33, .4, .17), leather, this.soldier, 0, 1.04, -.22);
    this.legs = [-1, 1].map(side =>
    {
      const pivot = new THREE.Group();
      pivot.position.set(side * .115, .79, 0);
      this.soldier.add(pivot);
      part(new THREE.CapsuleGeometry(.075, .6, 2, 5), uniform, pivot, 0, -.34, 0, true);
      part(new THREE.BoxGeometry(.16, .12, .3), leather, pivot, 0, -.72, .07);
      return pivot;
    });
    this.arms = [-1, 1].map(side =>
    {
      const pivot = new THREE.Group();
      pivot.position.set(side * .25, 1.3, 0);
      this.soldier.add(pivot);
      part(new THREE.CapsuleGeometry(.06, .43, 2, 5), uniform, pivot, 0, -.23, 0, true);
      return pivot;
    });
    this.rifle = part(new THREE.BoxGeometry(.06, .08, .7), leather, this.soldier, .18, 1.12, .52);
    this.rifle.rotation.x = .3;
    const rifleSteel = new THREE.MeshStandardMaterial(
    {
      color: 0x384039,
      metalness: .65,
      roughness: .4
    });
    part(new THREE.CylinderGeometry(.021, .026, .5, 10), rifleSteel, this.rifle, 0, .035, .37).rotation.x = Math.PI / 2;
    part(new THREE.BoxGeometry(.065, .065, .22), rifleSteel, this.rifle, 0, .025, .01);
    part(new THREE.BoxGeometry(.015, .035, .018), rifleSteel, this.rifle, 0, .065, .58);
    this.bayonet = part(new THREE.ConeGeometry(.025, .4, 3), new THREE.MeshStandardMaterial(
    {
      color: 0x9caaa8,
      metalness: .72,
      roughness: .28
    }), this.soldier, .18, 1.12, 1.22);
    this.bayonet.rotation.x = Math.PI / 2;
  }
  buildTurret()
  {
    this.gun = new THREE.Group();
    this.gun.position.set(.22, -.37, -1.45);
    this.gun.scale.setScalar(.66);
    this.camera.add(this.gun);
    const steel = new THREE.MeshStandardMaterial(
    {
      color: 0x70766a,
      metalness: .45,
      roughness: .34
    });
    const dark = new THREE.MeshStandardMaterial(
    {
      color: 0x525b4d,
      roughness: .6,
      metalness: .25
    });
    const brass = new THREE.MeshStandardMaterial(
    {
      color: 0x9d8554,
      metalness: .65,
      roughness: .4
    });
    const wood = new THREE.MeshStandardMaterial(
    {
      color: 0x64432a,
      roughness: .75
    });
    this.barrelMaterial = steel;
    steel.emissiveIntensity = 0;
    this.mesh(new THREE.BoxGeometry(.45, .39, .8), dark, this.gun, 0, 0, .08);
    this.mesh(new THREE.BoxGeometry(.48, .05, .85), steel, this.gun, 0, .22, .07);
    for (const side of [-1, 1])
    {
      this.mesh(new THREE.CylinderGeometry(.06, .06, .33, 12), wood, this.gun, side * .28, -.02, .63);
      this.mesh(new THREE.BoxGeometry(.3, .07, .09), steel, this.gun, side * .15, .14, .6);
    }
    const barrel = new THREE.Group();
    this.gun.add(barrel);
    this.mesh(new THREE.CylinderGeometry(.2, .2, 1.5, 24), steel, barrel, 0, .035, -1.02).rotation.x = Math.PI / 2;
    for (const z of [-.28, -1.75]) this.mesh(new THREE.TorusGeometry(.2, .035, 6, 24), brass, barrel, 0, .035, z);
    this.mesh(new THREE.CylinderGeometry(.065, .065, .22, 12), dark, barrel, 0, .035, -1.9).rotation.x = Math.PI / 2;
    this.mesh(new THREE.CylinderGeometry(.065, .08, .1, 12), brass, barrel, 0, .26, -.62);
    this.mesh(new THREE.BoxGeometry(.025, .14, .03), dark, barrel, 0, .29, -1.5);
    this.mesh(new THREE.BoxGeometry(.07, .15, .7), dark, this.gun, 0, -.32, .16);
    for (const side of [-1, 1])
    {
      const leg = this.mesh(new THREE.CylinderGeometry(.035, .05, .9, 8), steel, this.gun, side * .25, -.62, .35);
      leg.rotation.z = side * .55;
    }
    for (let i = 0; i < 15; i++)
    {
      const link = this.mesh(new THREE.CylinderGeometry(.025, .025, .21, 6), brass, this.gun, -.29 - i * .052, -.02 - (i / 15) ** 2 * .35, .02);
      link.rotation.x = Math.PI / 2;
    }
    const hosePath = new THREE.CatmullRomCurve3([new THREE.Vector3(.18, .04, -1.65), new THREE.Vector3(.35, -.3, -1), new THREE.Vector3(.7, -.75, -.1), new THREE.Vector3(.8, -.64, .3)]);
    this.mesh(new THREE.TubeGeometry(hosePath, 18, .025, 6, false), dark, this.gun);
    this.mesh(new THREE.CylinderGeometry(.2, .2, .5, 16), steel, this.gun, .8, -.85, .3);
    const flash = new THREE.Sprite(new THREE.SpriteMaterial(
    {
      map: this.glowTexture,
      color: 0xffd597,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    flash.position.set(0, .035, -2.06);
    flash.visible = false;
    barrel.add(flash);
    barrel.userData.flash = flash;
    barrel.userData.shotTime = 0;
    this.cannons = [barrel];
    this.muzzlePoint = new THREE.Vector3();
    this.steam = new THREE.Sprite(new THREE.SpriteMaterial(
    {
      map: this.smokeTexture,
      color: 0xe3e0d3,
      transparent: true,
      depthWrite: false,
      opacity: 0
    }));
    this.steam.position.set(.02, .55, -.6);
    this.steam.scale.set(.42, .72, 1);
    this.gun.add(this.steam);
  }
  muzzlePosition(barrel, direction)
  {
    this.aimGun(direction);
    return this.cannons[0].userData.flash.getWorldPosition(this.muzzlePoint);
  }
  updateTargets(game, dt, reducedMotion)
  {
    updateBattlefield(this, game.terrain);
    updateBiplanes(this, game, dt);
    this.blood.update(dt);
    const people = [...game.targets, ...game.bodies, ...(game.killer ? [game.killer] : []), ...game.allies.map(ally => (
    {
      ...ally,
      allied: true,
      position:
      {
        x: ally.position.x,
        y: .25,
        z: ally.position.z + 1.6
      },
      velocity:
      {
        x: 0,
        y: 0,
        z: -1
      },
      age: ally.alive ? this.clock : ally.deadAge
    }))];
    let n = 0;
    for (const target of people)
    {
      const dead = target.alive === false,
        gait = Math.sin(target.age * 10 + (target.phase || 0));
      this.soldier.position.set(target.position.x, dead || target.allied || target.cinematic ? target.position.y - 1 : game.terrain.height(target.position.x, target.position.z), target.position.z);
      this.soldier.rotation.set(0, Math.atan2(target.velocity.x, target.velocity.z), 0);
      const size = dead ? Math.max(0, Math.min(1, 12 - target.age)) : 1;
      this.soldier.scale.setScalar(size);
      if (dead)
      {
        this.soldier.rotation.z = Math.min(1, target.age * 3) * 1.5;
        this.soldier.position.y += Math.min(1, target.age * 3) * .18;
      }
      if (target.coverRemaining > 0 && target.fireRemaining <= 0) this.soldier.scale.y *= .55;
      else if (target.suppressed || target.fireRemaining > 0) this.soldier.scale.y *= .75;
      this.rifle.rotation.x = target.allied || target.fireRemaining > 0 || target.cinematic ? 0 : .3;
      this.rifle.position.z = .52 + (target.cinematic ? target.thrust * .55 : 0);
      this.bayonet.position.z = 1.22 + (target.cinematic ? target.thrust * .55 : 0);
      if (target.cinematic) this.soldier.rotation.x = target.thrust * .12;
      this.legs.forEach((leg, i) =>
      {
        leg.rotation.x = dead || target.allied || target.fireRemaining > 0 || reducedMotion ? 0 : gait * (i ? -.65 : .65);
      });
      this.arms.forEach((arm, i) =>
      {
        arm.rotation.x = target.allied || target.fireRemaining > 0 || target.cinematic ? -1.1 : -.45 + (dead || reducedMotion ? 0 : gait * (i ? .35 : -.35));
      });
      this.soldier.updateMatrixWorld(true);
      for (const part of this.soldierParts)
      {
        const missing = dead && (target.fragment === 0 && (part.node === this.head || part.node === this.helmet) || target.fragment === 1 && part.node.parent === this.arms[0] || target.fragment === 2 && part.node.parent === this.legs[1]);
        part.instances.setMatrixAt(n, missing || target.allied && (part.node === this.rifle || part.node.parent === this.rifle || part.node === this.pack || part.node === this.bayonet) || part.node === this.wound && !dead ? this.hiddenPart : part.node.matrixWorld);
        if (part.tinted) part.instances.setColorAt(n, new THREE.Color(target.allied ? 0x48645b : dead ? 0x684538 : 0x585b48));
      }
      n++;
    }
    for (const part of this.soldierParts)
    {
      part.instances.count = n;
      part.instances.instanceMatrix.needsUpdate = true;
      if (part.instances.instanceColor) part.instances.instanceColor.needsUpdate = true;
    }
    this.rifleFlashes.forEach((model, i) =>
    {
      const target = game.targets[i];
      model.visible = Boolean(target?.alive && target.flash > 0);
      if (target) model.position.set(target.position.x, game.terrain.height(target.position.x, target.position.z) + 1, target.position.z + .7);
    });
    this.allyFlashes.forEach((model, i) =>
    {
      const ally = game.allies[i];
      this.friendlyMounts[i].position.set(ally.position.x, -.75, ally.position.z + .78);
      model.visible = ally.flash > 0;
      model.position.set(ally.position.x, ally.position.y, ally.position.z);
    });
    this.artilleryModels.forEach((model, i) =>
    {
      const shell = game.artillery[i];
      model.visible = Boolean(shell);
      if (shell) model.position.copy(shell.position);
    });
    this.steam.material.opacity = Math.max(0, game.heat - .2) * .28;
    this.steam.material.rotation = this.clock * .1;
    this.steam.position.y = .55 + Math.sin(this.clock * 2) * .04;
  }
  render(game, direction, dt, reducedMotion)
  {
    const height = TRENCH_CAMERA.y - (game.ducking ? .78 : 0) - (game.killer ? Math.max(0, game.defeatAge - 1.24) * .35 : 0);
    this.camera.position.y += (height - this.camera.position.y) * Math.min(1, dt * 12);
    this.gun.position.y = -.37 - (game.killer ? Math.max(0, game.defeatAge - .45) * 1.2 : 0);
    super.render(game, direction, dt, reducedMotion);
  }
  planeCrash(position, velocity)
  {
    this.burst(position, true, velocity);
    for (const explosion of this.explosions)
      if (explosion.life === explosion.maxLife && explosion.sprite.position.distanceToSquared(new THREE.Vector3(position.x, position.y, position.z)) < 1) explosion.size = 11;
    for (const cloud of this.smoke)
      if (cloud.life === cloud.maxLife && cloud.sprite.position.distanceToSquared(new THREE.Vector3(position.x, position.y, position.z)) < 10) cloud.size = 3 + Math.random() * 4;
  }
  artilleryImpact(position)
  {
    this.burst(position, true);
    for (const cloud of this.smoke)
    {
      if (cloud.life <= 0 || cloud.sprite.position.distanceTo(new THREE.Vector3(position.x, position.y, position.z)) > 5) continue;
      cloud.life = cloud.maxLife = 5 + Math.random() * 4;
      cloud.size = 4 + Math.random() * 6;
      cloud.velocity.set((Math.random() - .5) * 2, 2 + Math.random() * 4, (Math.random() - .5) * 2);
    }
  }
  dust(position)
  {
    let count = 3;
    for (const cloud of this.smoke)
    {
      if (cloud.life > 0) continue;
      cloud.life = cloud.maxLife = .6 + Math.random() * .5;
      cloud.dark = false;
      cloud.size = .5 + Math.random();
      cloud.sprite.position.copy(position);
      cloud.velocity.set((Math.random() - .5) * 2, 1 + Math.random() * 2, (Math.random() - .5) * 2);
      cloud.sprite.visible = true;
      if (--count === 0) break;
    }
  }
  clearEffects()
  {
    super.clearEffects();
    this.blood.clear();
    this.camera.position.copy(TRENCH_CAMERA);
    this.gun.position.y = -.37;
    for (const model of this.biplaneModels?.values() || []) this.removeModel(model);
    this.biplaneModels?.clear();
  }
  attackMarkers(game)
  {
    const markers = [];
    for (const target of game.biplanes.filter(p => p.alive && p.muzzleFlash > 0))
    {
      const p = this.flightDirection.copy(target.position).add(new THREE.Vector3(0, 5, 0)).project(this.camera);
      if (p.z > -1 && p.z < 1 && Math.abs(p.x) < .94 && Math.abs(p.y) < .86) markers.push(
      {
        x: (p.x + 1) * 50,
        y: (1 - p.y) * 50,
        label: 'STRAFING'
      });
    }
    return markers;
  }
  gunLeadMarker(game, direction)
  {
    const sight = game.gunLead(direction);
    if (!sight) return null;
    const p = this.flightDirection.copy(sight.position).project(this.camera);
    if (Math.abs(p.x) > .94 || Math.abs(p.y) > .88 || p.z > 1) return null;
    return {
      x: (p.x + 1) * 50,
      y: (1 - p.y) * 50,
      distance: sight.distance
    };
  }
}