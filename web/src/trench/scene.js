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
  MAX_INFANTRY,
  trenchHeight
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
    this.camera.position.set(0, 2.2, 5);
    this.camera.fov = 50;
    this.camera.lookAt(0, 0, -48);
    this.scene.fog = new THREE.Fog(0x8d8b7f, 170, 650);
    this.renderer.setClearColor(0x8d8b7f);
    const fill = new THREE.DirectionalLight(0xd0d5cc, 1.7);
    fill.position.set(-4, 8, 12);
    this.scene.add(fill);
    for (const item of this.scene.children)
      if (item.isLight) item.intensity *= .7;
    this.skyMaterial = new THREE.ShaderMaterial(
    {
      side: THREE.BackSide,
      depthWrite: false,
      uniforms:
      {
        time:
        {
          value: 0
        }
      },
      vertexShader: 'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec3 p;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}void main(){vec3 d=normalize(p);vec2 q=d.xz/max(.08,d.y)*1.8+time*.002;float n=noise(q)*.6+noise(q*3.1)*.25+noise(q*7.8)*.15;vec3 c=mix(vec3(.57,.56,.50),vec3(.22,.25,.27),max(0.,d.y));c+=vec3(.15)*smoothstep(.3,.8,n)*smoothstep(.015,.22,d.y);gl_FragColor=vec4(c,1.);}`
    });
    this.mesh(new THREE.SphereGeometry(900, 24, 16), this.skyMaterial, this.scene);
    const land = new THREE.PlaneGeometry(900, 700, 150, 130);
    land.rotateX(-Math.PI / 2);
    land.translate(0, 0, -280);
    const positions = land.attributes.position,
      colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++)
    {
      const x = positions.getX(i),
        z = positions.getZ(i);
      positions.setY(i, trenchHeight(x, z));
      const tone = .7 + .12 * Math.sin(x * 2.1 + z * .6) + .08 * Math.sin(x * .07 - z * .03);
      colors.set([.29 * tone, .255 * tone, .19 * tone], i * 3);
    }
    land.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    land.computeVertexNormals();
    this.mesh(land, new THREE.MeshStandardMaterial(
    {
      vertexColors: true,
      map: this.makeMudTexture(),
      roughness: .93
    }), this.scene);
    const mud = new THREE.MeshStandardMaterial(
    {
      color: 0x302b22,
      roughness: 1
    });
    const puddle = new THREE.MeshStandardMaterial(
    {
      color: 0x555e59,
      roughness: .22,
      metalness: .2
    });
    let seed = 741;
    const random = () =>
    {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 62; i++)
    {
      const x = (random() - .5) * 300,
        z = -24 - random() * 365,
        radius = 1.8 + random() * 5;
      const crater = this.mesh(new THREE.CircleGeometry(radius, 18), mud, this.scene, x, trenchHeight(x, z) + .04, z);
      crater.rotation.x = -Math.PI / 2;
      const water = this.mesh(new THREE.CircleGeometry(radius * .55, 16), puddle, this.scene, x, trenchHeight(x, z) + .055, z);
      water.rotation.x = -Math.PI / 2;
    }
    const bags = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.22, .75, 3, 8), new THREE.MeshStandardMaterial(
    {
      color: 0x776950,
      roughness: 1
    }), 180);
    const transform = new THREE.Object3D();
    let bagCount = 0;
    for (let row = 0; row < 3; row++)
      for (let i = -24; i <= 24; i++)
      {
        const x = i * .98 + (row % 2) * .45;
        transform.position.set(x, .27 + row * .39, -6 - Math.abs(x) * .22);
        transform.rotation.set(0, (random() - .5) * .12, Math.PI / 2);
        transform.scale.set(1, 1, 1.25);
        transform.updateMatrix();
        bags.setMatrixAt(bagCount++, transform.matrix);
      }
    bags.count = bagCount;
    this.scene.add(bags);
    const wood = new THREE.MeshStandardMaterial(
    {
      color: 0x494035,
      roughness: .95
    });
    for (let i = -12; i <= 12; i++) this.mesh(new THREE.BoxGeometry(.18, 1.2, .16), wood, this.scene, i * 2, .35, -5.5 - Math.abs(i * 2) * .22);
    const wire = [];
    for (const z of [-55, -110])
      for (let x = -140; x <= 140; x += 12)
      {
        if (Math.abs(x % 36) < 5) continue;
        const post = this.mesh(new THREE.BoxGeometry(.1, 1.45, .1), wood, this.scene, x, .55, z);
        post.rotation.z = Math.sin(x) * .18;
        for (const y of [.45, .9]) wire.push(x, y, z, x + 11, y - .15, z);
        for (let t = 0; t < 10; t++) wire.push(x + t, .8, z, x + t + .25, 1.05, z + .1);
      }
    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    this.scene.add(new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial(
    {
      color: 0x282a26
    })));
    for (let i = 0; i < 28; i++)
    {
      const x = (random() - .5) * 650,
        z = -230 - random() * 220,
        height = 3 + random() * 7;
      const trunk = this.mesh(new THREE.CylinderGeometry(.12, .4, height, 5), wood, this.scene, x, height / 2, z);
      trunk.rotation.z = (random() - .5) * .25;
      const branch = this.mesh(new THREE.CylinderGeometry(.04, .14, height * .6, 5), wood, this.scene, x + .8, height * .6, z);
      branch.rotation.z = .8;
    }
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
    this.blood = new BloodEffects(this.scene);
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
  makeMudTexture()
  {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d');
    const image = context.createImageData(256, 256);
    let seed = 104;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++)
      {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 4294967296;
        const grain = 165 + noise * 60 + Math.sin(x * .23 + Math.sin(y * .11)) * 18 + Math.sin(y * .35) * 10;
        const i = (y * 256 + x) * 4;
        image.data.set([grain, grain, grain, 255], i);
      }
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(110, 85);
    texture.anisotropy = 4;
    this.textures.add(texture);
    return texture;
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
      color: 0x302a23,
      roughness: .9
    });
    const part = (geometry, material, parent, x, y, z, tinted = false) =>
    {
      const node = this.mesh(geometry, material, parent, x, y, z);
      const instances = new THREE.InstancedMesh(geometry, material, MAX_INFANTRY + 40);
      instances.frustumCulled = false;
      instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
    this.head = part(new THREE.SphereGeometry(.14, 8, 6), skin, this.soldier, 0, 1.57, 0);
    const helmet = part(new THREE.SphereGeometry(.19, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), uniform, this.soldier, 0, 1.65, 0, true);
    helmet.scale.y = .75;
    this.helmet = helmet;
    this.wound = part(new THREE.SphereGeometry(.19, 7, 5), new THREE.MeshBasicMaterial(
    {
      color: 0x941f18
    }), this.soldier, .06, 1.07, .17);
    this.wound.scale.set(1, 1.2, .3);
    part(new THREE.BoxGeometry(.33, .4, .17), leather, this.soldier, 0, 1.04, -.22);
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
    const rifle = part(new THREE.BoxGeometry(.065, .08, .9), leather, this.arms[1], -.03, -.4, .35);
    rifle.rotation.x = .4;
  }
  buildTurret()
  {
    this.gun = new THREE.Group();
    this.gun.position.set(.35, -.66, -1.55);
    this.gun.scale.setScalar(.72);
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
    this.blood.update(dt);
    const people = [...game.targets, ...game.bodies, ...game.allies.map(ally => (
    {
      ...ally,
      allied: true,
      position:
      {
        x: ally.position.x,
        y: 1,
        z: ally.position.z + .45
      },
      velocity:
      {
        x: 0,
        y: 0,
        z: -1
      },
      age: this.clock
    }))];
    let n = 0;
    for (const target of people)
    {
      const dead = target.alive === false,
        gait = Math.sin(target.age * 10 + (target.phase || 0));
      this.soldier.position.set(target.position.x, target.position.y - 1, target.position.z);
      this.soldier.rotation.set(0, Math.atan2(target.velocity.x, target.velocity.z), 0);
      const size = dead ? Math.max(0, Math.min(1, 12 - target.age)) : 1;
      this.soldier.scale.setScalar(size);
      if (dead)
      {
        this.soldier.rotation.z = Math.min(1, target.age * 3) * 1.5;
        this.soldier.position.y += Math.min(1, target.age * 3) * .18;
      }
      if (target.suppressed) this.soldier.scale.y *= .75;
      this.legs.forEach((leg, i) =>
      {
        leg.rotation.x = dead || target.allied || reducedMotion ? 0 : gait * (i ? -.65 : .65);
      });
      this.arms.forEach((arm, i) =>
      {
        arm.rotation.x = target.allied ? -1.1 : -.45 + (dead || reducedMotion ? 0 : gait * (i ? .35 : -.35));
      });
      this.soldier.updateMatrixWorld(true);
      for (const part of this.soldierParts)
      {
        const missing = dead && (target.fragment === 0 && (part.node === this.head || part.node === this.helmet) || target.fragment === 1 && part.node.parent === this.arms[0] || target.fragment === 2 && part.node.parent === this.legs[1]);
        part.instances.setMatrixAt(n, missing || part.node === this.wound && !dead ? this.hiddenPart : part.node.matrixWorld);
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
    this.allyFlashes.forEach((model, i) =>
    {
      const ally = game.allies[i];
      this.friendlyMounts[i].position.set(ally.position.x, 0, ally.position.z + .78);
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
  dust(position)
  {
    let count = 3;
    for (const cloud of this.smoke)
    {
      if (cloud.life > 0) continue;
      cloud.life = cloud.maxLife = .6 + Math.random() * .5;
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
  }
  attackMarkers(game)
  {
    const markers = [];
    for (const ally of game.allies)
    {
      const p = this.flightDirection.set(ally.position.x, 2.1, ally.position.z).project(this.camera);
      if (Math.abs(p.x) < .93 && Math.abs(p.y) < .9) markers.push(
      {
        x: (p.x + 1) * 50,
        y: (1 - p.y) * 50,
        label: 'FRIENDLY',
        allied: true
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