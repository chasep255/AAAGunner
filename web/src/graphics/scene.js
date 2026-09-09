import * as THREE from 'three';
import
{
  MissileSmoke
}
from './trails.js';
import
{
  buildLandscape,
  buildAircraft,
  makeGlowTexture,
  makeSmokeTexture,
  makeRoundGeometry,
  makeTracerMaterial,
  buildMissile
}
from './visuals.js';
import
{
  MAX_SHOTS,
  MAX_ENEMY_SHOTS,
  MAX_MISSILES
}
from '../game.js';

const FORWARD = new THREE.Vector3(0, 0, -1);
const UP = new THREE.Vector3(0, 1, 0);
const COLORS = {
  orange: 0xff793f,
  cream: 0xffecc0,
  navy: 0x233e4a,
  teal: 0x54c9b4
};

export class ArenaView
{
  constructor(canvas)
  {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer(
    {
      canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x86b6bd);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9eafb9, 1400, 8500);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10000);
    this.camera.position.set(0, 8, 0);
    this.camera.lookAt(0, 56, -210);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xc5d9ee, 0x4f534b, 1.8));
    const sun = new THREE.DirectionalLight(0xffdcc0, 3.2);
    sun.position.set(-550, 340, -850);
    this.scene.add(sun);
    this.materials = {};
    for (const [name, color] of Object.entries(COLORS)) this.materials[name] = new THREE.MeshStandardMaterial(
    {
      color,
      roughness: 0.7,
      flatShading: false
    });
    this.textures = new Set();
    this.glowTexture = makeGlowTexture();
    this.textures.add(this.glowTexture);
    this.smokeTexture = makeSmokeTexture();
    this.textures.add(this.smokeTexture);
    this.targetModels = new Map();
    this.aim = new THREE.Vector3();
    this.localAim = new THREE.Vector3();
    this.flightDirection = new THREE.Vector3();
    this.dummy = new THREE.Object3D();
    this.clock = 0;
    this.flashTime = 0;
    this.buildWorld();
    this.buildTurret();
    this.buildTracers();
    this.buildAttackEffects();
    this.buildParticles();
    this.resize();
  }

  mesh(geometry, material, parent, x = 0, y = 0, z = 0)
  {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  buildWorld()
  {
    buildLandscape(this);
  }

  buildTurret()
  {
    this.gun = new THREE.Group();
    this.gun.position.set(1.1, -1.25, -3.4);
    this.gun.scale.setScalar(.62);
    this.camera.add(this.gun);
    const steel = new THREE.MeshStandardMaterial(
    {
      color: 0x60676b,
      metalness: .8,
      roughness: .32
    });
    const receiver = new THREE.MeshStandardMaterial(
    {
      color: 0x333c3e,
      metalness: .65,
      roughness: .48
    });
    const dark = new THREE.MeshStandardMaterial(
    {
      color: 0x101718,
      metalness: .4,
      roughness: .58
    });
    const housing = this.mesh(new THREE.CylinderGeometry(.62, .62, 1.4, 32), receiver, this.gun, 0, 0, .1);
    housing.rotation.x = Math.PI / 2;
    this.mesh(new THREE.BoxGeometry(.9, .25, 1.2), receiver, this.gun, 0, -.55, .25);
    this.mesh(new THREE.BoxGeometry(.28, 1.5, .35), dark, this.gun, 0, -1.2, .2);
    const feed = this.mesh(new THREE.CylinderGeometry(.5, .5, .6, 24), receiver, this.gun, .75, -.1, .45);
    feed.rotation.z = Math.PI / 2;
    for (let i = 0; i < 8; i++)
    {
      const a = i * Math.PI / 4;
      this.mesh(new THREE.SphereGeometry(.07, 8, 6), steel, this.gun, Math.cos(a) * .58, Math.sin(a) * .58, .82);
      const rib = this.mesh(new THREE.BoxGeometry(.075, .075, .85), dark, this.gun, Math.cos(a) * .63, Math.sin(a) * .63, .05);
      rib.rotation.z = a;
    }
    this.rotor = new THREE.Group();
    this.gun.add(this.rotor);
    this.barrelMaterial = new THREE.MeshStandardMaterial(
    {
      color: 0x555e63,
      metalness: .85,
      roughness: .3,
      emissive: 0x000000
    });
    for (let i = 0; i < 6; i++)
    {
      const a = i * Math.PI / 3,
        x = Math.cos(a) * .36,
        y = Math.sin(a) * .36;
      const barrel = this.mesh(new THREE.CylinderGeometry(.095, .115, 2.8, 16), this.barrelMaterial, this.rotor, x, y, -1.9);
      barrel.rotation.x = Math.PI / 2;
      const bore = this.mesh(new THREE.CircleGeometry(.07, 16), dark, this.rotor, x, y, -3.31);
      bore.rotation.y = Math.PI;
      const collar = this.mesh(new THREE.TorusGeometry(.108, .025, 6, 16), steel, this.rotor, x, y, -3.2);
      collar.rotation.z = a;
    }
    for (const z of [-.8, -2.5]) this.mesh(new THREE.TorusGeometry(.42, .095, 8, 32), receiver, this.rotor, 0, 0, z);
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial(
    {
      map: this.glowTexture,
      color: 0xffdfa0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    this.flash.position.set(0, 0, -3.5);
    this.flash.visible = false;
    this.gun.add(this.flash);
  }

  buildTracers()
  {
    this.tracerPositions = new Float32Array(MAX_SHOTS * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.tracerPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial(
    {
      color: 0xffdd45,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      fog: false
    }));
    this.tracers.frustumCulled = false;
    this.scene.add(this.tracers);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SHOTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    glowGeometry.setDrawRange(0, 0);
    this.gunGlow = new THREE.Points(glowGeometry, new THREE.ShaderMaterial(
    {
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      uniforms:
      {
        glow:
        {
          value: this.glowTexture
        },
        pixelRatio:
        {
          value: this.renderer.getPixelRatio()
        }
      },
      vertexShader: `uniform float pixelRatio;
        void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_PointSize = clamp(700.0 / max(1.0, -p.z), 4.0, 10.0) * pixelRatio; }`,
      fragmentShader: `uniform sampler2D glow;
        void main() { vec4 texel = texture2D(glow, gl_PointCoord);
          gl_FragColor = vec4(vec3(1.0, .78, .12) * 1.3, texel.a * .95); }`
    }));
    this.gunGlow.frustumCulled = false;
    this.scene.add(this.gunGlow);
    this.projectileHeads = new THREE.InstancedMesh(makeRoundGeometry(), new THREE.MeshBasicMaterial(
    {
      color: 0xffe15a,
      toneMapped: false,
      fog: false
    }), MAX_SHOTS);
    this.projectileHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projectileHeads.frustumCulled = false;
    this.scene.add(this.projectileHeads);
    this.projectileStreaks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .008, 1, 6), makeTracerMaterial(true), MAX_SHOTS);
    this.projectileStreaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projectileStreaks.frustumCulled = false;
    this.projectileStreaks.count = 0;
    this.scene.add(this.projectileStreaks);
  }

  buildParticles()
  {
    this.particles = Array.from(
    {
      length: 420
    }, () => (
    {
      life: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3()
    }));
    this.particleMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial(
    {
      color: 0xffffff
    }), this.particles.length);
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);
    this.smoke = Array.from(
    {
      length: 96
    }, () =>
    {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial(
      {
        map: this.smokeTexture,
        color: 0x45413d,
        transparent: true,
        depthWrite: false
      }));
      sprite.visible = false;
      this.scene.add(sprite);
      return {
        sprite,
        life: 0,
        velocity: new THREE.Vector3()
      };
    });
    this.explosions = Array.from(
    {
      length: 32
    }, () =>
    {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial(
      {
        map: this.glowTexture,
        color: 0xffaa55,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false
      }));
      sprite.visible = false;
      this.scene.add(sprite);
      return {
        sprite,
        life: 0
      };
    });
  }

  buildAttackEffects()
  {
    const lines = (count, color) =>
    {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setDrawRange(0, 0);
      const mesh = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial(
      {
        color,
        transparent: true,
        opacity: 0.9
      }));
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.incomingTracers = lines(MAX_ENEMY_SHOTS, 0xff593d);
    this.incomingHeads = new THREE.InstancedMesh(makeRoundGeometry(), new THREE.MeshStandardMaterial(
    {
      color: 0xc6a075,
      metalness: .7,
      roughness: .3
    }), MAX_ENEMY_SHOTS);
    this.incomingStreaks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.035, .003, 1, 6), makeTracerMaterial(), MAX_ENEMY_SHOTS);
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_ENEMY_SHOTS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    glowGeometry.setDrawRange(0, 0);
    this.incomingGlow = new THREE.Points(glowGeometry, new THREE.PointsMaterial(
    {
      map: this.glowTexture,
      color: 0xffb76a,
      size: 0.5,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    this.incomingGlow.frustumCulled = false;
    this.scene.add(this.incomingGlow);
    for (const mesh of [this.incomingHeads, this.incomingStreaks])
    {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
    }
    this.missileSmoke = new MissileSmoke(this.scene, this.smokeTexture);
    this.missileModels = Array.from(
    {
      length: MAX_MISSILES
    }, () =>
    {
      const model = buildMissile(this);
      this.scene.add(model);
      return model;
    });
    this.flareMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1), new THREE.MeshBasicMaterial(
    {
      color: 0xffdc8a
    }), 24);
    this.flareMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flareMesh.frustumCulled = false;
    this.flareMesh.count = 0;
    this.scene.add(this.flareMesh);
  }

  burst(position, big, velocity = null, shell = false)
  {
    let smokeCount = big ? 14 : shell ? 4 : 2;
    for (const cloud of this.smoke)
    {
      if (cloud.life > 0) continue;
      cloud.life = cloud.maxLife = big ? 3 + Math.random() * 2 : (shell ? 1.6 : 1.2) + Math.random();
      cloud.size = big ? 8 + Math.random() * 10 : (shell ? 4 : 2) + Math.random() * 3;
      cloud.sprite.position.set(position.x + (Math.random() - .5) * 3, position.y, position.z + (Math.random() - .5) * 3);
      cloud.velocity.set((Math.random() - .5) * 8, 3 + Math.random() * 6, (Math.random() - .5) * 8);
      if (velocity) cloud.velocity.addScaledVector(velocity, .1);
      cloud.sprite.material.rotation = Math.random() * Math.PI * 2;
      cloud.sprite.visible = true;
      if (--smokeCount <= 0) break;
    }
    const explosion = this.explosions.find(item => item.life <= 0);
    if (explosion)
    {
      explosion.life = explosion.maxLife = big ? .65 : shell ? .42 : .22;
      explosion.size = big ? 25 : shell ? 12 : 5;
      explosion.sprite.position.set(position.x, position.y, position.z);
      explosion.sprite.visible = true;
    }
    let count = big ? 36 : shell ? 12 : 7;
    for (const particle of this.particles)
    {
      if (particle.life > 0) continue;
      particle.life = particle.maxLife = (big ? 1.3 : shell ? .7 : 0.4) + Math.random() * 0.5;
      particle.position.set(position.x, position.y, position.z);
      particle.velocity.set((Math.random() - 0.5) * 35, Math.random() * 25, (Math.random() - 0.5) * 35);
      if (velocity) particle.velocity.addScaledVector(velocity, .3);
      particle.color = big ? (count % 3 ? 0x6f6254 : 0xffb65f) : 0xffbf77;
      particle.size = big ? .65 : shell ? .35 : .2;
      if (--count <= 0) break;
    }
  }

  makeTarget(target)
  {
    return buildAircraft(this, target);
  }

  attackMarkers(game)
  {
    const markers = [];
    for (const target of game.targets)
    {
      if (target.muzzleFlash <= 0) continue;
      const p = this.flightDirection.set(target.position.x, target.position.y + 10, target.position.z).project(this.camera);
      if (p.z > -1 && p.z < 1 && Math.abs(p.x) < .95 && Math.abs(p.y) < .95) markers.push(
      {
        x: (p.x + 1) * 50,
        y: (1 - p.y) * 50
      });
    }
    return markers;
  }

  gunLeadMarker(game, direction)
  {
    const sight = game.gunLead(direction);
    if (!sight) return null;
    const point = this.flightDirection.set(sight.position.x, sight.position.y, sight.position.z).project(this.camera);
    if (point.z < -1 || point.z > 1 || Math.abs(point.x) > .94 || Math.abs(point.y) > .88) return null;
    return {
      x: (point.x + 1) * 50,
      y: (1 - point.y) * 50,
      distance: sight.distance
    };
  }

  directionAt(x, y, focused)
  {
    const fov = focused ? 43 : 60;
    if (this.camera.fov !== fov)
    {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    return this.aim.set(x, y, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
  }

  render(game, direction, dt, reducedMotion)
  {
    this.clock += dt;
    this.waterMaterial.uniforms.time.value = this.clock;
    this.skyMaterial.uniforms.time.value = this.clock;
    for (const target of game.targets)
    {
      let model = this.targetModels.get(target.id);
      if (!model)
      {
        model = this.makeTarget(target);
        this.targetModels.set(target.id, model);
      }
      model.position.set(target.position.x, target.position.y, target.position.z);
      this.flightDirection.set(target.position.x - target.previous.x, target.position.y - target.previous.y, target.position.z - target.previous.z);
      if (this.flightDirection.lengthSq() < 1e-8) this.flightDirection.set(0, 0, 1);
      this.flightDirection.normalize();
      model.rotation.set(target.pitch, target.heading, target.bank, 'YXZ');
      model.scale.setScalar(1);
      for (const propeller of model.userData.propellers) propeller.rotation.z = this.clock * 45;
      model.userData.marker.visible = target.health === 1;
      model.userData.muzzle.visible = target.muzzleFlash > 0 && (reducedMotion || target.muzzleFlash % .075 > .025);
      model.userData.muzzle.scale.setScalar(reducedMotion ? .8 : .9 + Math.sin(target.muzzleFlash * 45) * .1);
    }
    const ids = new Set(game.targets.map(target => target.id));
    for (const [id, model] of this.targetModels)
    {
      if (ids.has(id)) continue;
      this.removeModel(model);
      this.targetModels.delete(id);
    }
    let n = 0;
    for (const projectile of game.projectiles.slots)
    {
      if (!projectile.alive || projectile.age < 0.025) continue;
      const p = projectile.position,
        prev = projectile.previous;
      const i = n * 6;
      this.flightDirection.set(p.x - prev.x, p.y - prev.y, p.z - prev.z).normalize();
      const length = Math.min(16, Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z) * 1.5);
      this.tracerPositions.set([p.x, p.y, p.z, p.x - this.flightDirection.x * length, p.y - this.flightDirection.y * length, p.z - this.flightDirection.z * length], i);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.dummy.quaternion.setFromUnitVectors(UP, this.flightDirection);
      this.dummy.updateMatrix();
      this.projectileHeads.setMatrixAt(n, this.dummy.matrix);
      this.gunGlow.geometry.attributes.position.setXYZ(n, p.x, p.y, p.z);
      this.dummy.position.addScaledVector(this.flightDirection, -length / 2);
      this.dummy.scale.set(1, length, 1);
      this.dummy.updateMatrix();
      this.projectileStreaks.setMatrixAt(n++, this.dummy.matrix);
    }
    this.tracers.geometry.setDrawRange(0, n * 2);
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.gunGlow.geometry.setDrawRange(0, n);
    this.gunGlow.geometry.attributes.position.needsUpdate = true;
    this.projectileHeads.count = n;
    this.projectileHeads.instanceMatrix.needsUpdate = true;
    this.projectileStreaks.count = n;
    this.projectileStreaks.instanceMatrix.needsUpdate = true;
    const incoming = this.incomingTracers.geometry;
    n = 0;
    for (const shot of game.enemyShots)
    {
      if (shot.age <= 0 || !shot.launched) continue;
      const p = shot.position,
        prev = shot.previous;
      this.flightDirection.set(p.x - prev.x, p.y - prev.y, p.z - prev.z).normalize();
      const length = Math.min(5, shot.age * 650);
      const d = this.flightDirection;
      incoming.attributes.position.array.set([p.x, p.y, p.z, p.x - d.x * length, p.y - d.y * length, p.z - d.z * length], n * 6);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.dummy.quaternion.setFromUnitVectors(UP, d);
      this.dummy.updateMatrix();
      this.incomingHeads.setMatrixAt(n, this.dummy.matrix);
      this.incomingGlow.geometry.attributes.position.array.set([p.x, p.y, p.z], n * 3);
      this.dummy.position.addScaledVector(d, -length / 2);
      this.dummy.quaternion.setFromUnitVectors(UP, d);
      this.dummy.scale.set(1, length, 1);
      this.dummy.updateMatrix();
      this.incomingStreaks.setMatrixAt(n++, this.dummy.matrix);
    }
    incoming.setDrawRange(0, n * 2);
    incoming.attributes.position.needsUpdate = true;
    this.incomingGlow.geometry.setDrawRange(0, n);
    this.incomingGlow.geometry.attributes.position.needsUpdate = true;
    for (const mesh of [this.incomingHeads, this.incomingStreaks])
    {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.missileModels.forEach((model, i) =>
    {
      const missile = game.missiles[i];
      model.visible = Boolean(missile) && missile.age > 0.06;
      if (!missile) return;
      const p = missile.position,
        d = missile.direction;
      model.position.set(p.x, p.y, p.z);
      model.quaternion.setFromUnitVectors(FORWARD, this.flightDirection.set(d.x, d.y, d.z));
      if (model.userData.missileId !== missile.id)
      {
        model.userData.missileId = missile.id;
        model.userData.smokePosition.set(missile.previous.x, missile.previous.y, missile.previous.z);
      }
      if (dt > 0)
      {
        if (missile.age > .18) this.missileSmoke.emit(model.userData.smokePosition, model.position);
        else model.userData.smokePosition.copy(model.position);
      }
      const power = missile.age < 1.4 ? 1 : .65;
      model.userData.exhaust.material.opacity = power * (.85 + Math.sin(this.clock * 85) * .1);
      model.userData.flame.scale.y = power * (1 + Math.sin(this.clock * 90) * .12);
    });
    this.missileSmoke.update(dt, this.canvas.height / (2 * Math.tan(this.camera.fov * Math.PI / 360)));
    n = 0;
    for (const flare of game.flares)
    {
      for (let i = 0; i < 6 && n < 24; i++)
      {
        this.dummy.position.set(flare.position.x - flare.velocity.x * i * .04, flare.position.y - flare.velocity.y * i * .04, flare.position.z - flare.velocity.z * i * .04);
        this.dummy.scale.setScalar(Math.max(0, (1 - flare.age / 3) * (1.8 - i * 0.2)));
        this.dummy.rotation.set(flare.age, i, flare.age * 2);
        this.dummy.updateMatrix();
        this.flareMesh.setMatrixAt(n++, this.dummy.matrix);
      }
    }
    this.flareMesh.count = n;
    this.flareMesh.instanceMatrix.needsUpdate = true;
    n = 0;
    for (const particle of this.particles)
    {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      particle.velocity.y -= 13 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      this.dummy.position.copy(particle.position);
      this.dummy.scale.setScalar(Math.max(0, particle.life / particle.maxLife) * particle.size);
      this.dummy.rotation.set(particle.life, particle.life * 2, 0);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(n, this.dummy.matrix);
      this.particleMesh.setColorAt(n++, new THREE.Color(particle.color));
    }
    this.particleMesh.count = n;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    for (const explosion of this.explosions)
    {
      explosion.life = Math.max(0, explosion.life - dt);
      explosion.sprite.visible = explosion.life > 0;
      if (explosion.life <= 0) continue;
      const progress = 1 - explosion.life / explosion.maxLife;
      explosion.sprite.scale.setScalar(explosion.size * (.3 + progress));
      explosion.sprite.material.opacity = (1 - progress) * .9;
    }
    for (const cloud of this.smoke)
    {
      cloud.life = Math.max(0, cloud.life - dt);
      cloud.sprite.visible = cloud.life > 0;
      if (cloud.life <= 0) continue;
      const age = cloud.maxLife - cloud.life,
        progress = age / cloud.maxLife;
      cloud.sprite.position.addScaledVector(cloud.velocity, dt);
      cloud.sprite.scale.setScalar(cloud.size * (.3 + progress * 1.8));
      cloud.sprite.material.opacity = Math.min(1, age * 5) * (1 - progress) * .8;
      cloud.sprite.material.color.setRGB(.21 + Math.exp(-age * 7) * .7, .2 + Math.exp(-age * 9) * .23, .19);
      cloud.sprite.material.rotation += dt * .12;
    }
    this.localAim.copy(direction).transformDirection(this.camera.matrixWorldInverse);
    this.gun.quaternion.setFromUnitVectors(FORWARD, this.localAim);
    this.rotor.rotation.z -= game.spool * dt * 45;
    this.barrelMaterial.emissive.setRGB(game.heat * 0.5, game.heat * 0.08, 0);
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.flash.visible = this.flashTime > 0 && !reducedMotion;
    this.flash.rotation.z = this.clock * 7;
    this.flash.scale.set(1.6, 1.6, 1);
    this.gun.position.y = -1.25 + (reducedMotion ? 0 : Math.sin(this.clock * 62) * 0.013 * game.spool);
    this.renderer.render(this.scene, this.camera);
  }

  clearEffects()
  {
    this.missileSmoke.clear();
    for (const cloud of this.smoke)
    {
      cloud.life = 0;
      cloud.sprite.visible = false;
    }
    for (const particle of this.particles) particle.life = 0;
    for (const explosion of this.explosions)
    {
      explosion.life = 0;
      explosion.sprite.visible = false;
    }
    this.flashTime = 0;
  }

  resize()
  {
    const
    {
      width,
      height
    } = this.canvas.getBoundingClientRect();
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  removeModel(model)
  {
    this.scene.remove(model);
    model.traverse(object =>
    {
      object.geometry?.dispose();
      if (object.material && !Object.values(this.materials).includes(object.material)) object.material.dispose();
    });
  }

  dispose()
  {
    const geometries = new Set(),
      materials = new Set();
    this.scene.traverse(object =>
    {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.textures.forEach(texture => texture.dispose());
    this.targetModels.clear();
    this.renderer.dispose();
  }
}