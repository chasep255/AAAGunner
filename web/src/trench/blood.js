import * as THREE from 'three';
import
{
  trenchHeight
}
from './game.js';

// Fixed pools keep a full round of sprays, fragments, and stains bounded.
export class BloodEffects
{
  constructor(scene, heightAt = trenchHeight)
  {
    this.heightAt = heightAt;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    this.drops = Array.from(
    {
      length: 900
    }, () => (
    {
      life: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3()
    }));
    this.fragments = Array.from(
    {
      length: 120
    }, () => (
    {
      life: 0,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      rotation: new THREE.Vector3()
    }));
    this.stains = Array.from(
    {
      length: 320
    }, () => (
    {
      life: 0
    }));
    this.dropCursor = this.fragmentCursor = this.stainCursor = 0;
    this.dropMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial(
    {
      color: 0xb51d1b
    }), this.drops.length);
    this.fragmentMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.11, .25, 2, 5), new THREE.MeshStandardMaterial(
    {
      color: 0xffffff,
      roughness: .62
    }), this.fragments.length);
    const stainGeometry = new THREE.CircleGeometry(1, 24);
    const positions = stainGeometry.attributes.position;
    for (let i = 1; i < positions.count; i++)
    {
      const radius = .7 + .3 * Math.sin(i * 17.8) ** 2;
      positions.setXYZ(i, positions.getX(i) * radius, positions.getY(i) * radius, 0);
    }
    stainGeometry.rotateX(-Math.PI / 2);
    this.stainMesh = new THREE.InstancedMesh(stainGeometry, new THREE.MeshBasicMaterial(
    {
      color: 0x76201b,
      transparent: true,
      opacity: .83,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1
    }), this.stains.length);
    for (const mesh of [this.dropMesh, this.fragmentMesh, this.stainMesh])
    {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
  }
  stain(x, z, size)
  {
    const stain = this.stains[this.stainCursor++ % this.stains.length];
    Object.assign(stain,
    {
      x,
      z,
      size,
      life: 55,
      rotation: Math.random() * Math.PI * 2
    });
  }
  burst(position, source, velocity)
  {
    const blast = source === 'artillery',
      stab = source === 'bayonet';
    this.stain(position.x, position.z, blast ? 2.4 : 1.1);
    for (let i = 0; i < (stab ? 20 : blast ? 140 : 65); i++)
    {
      const drop = this.drops[this.dropCursor++ % this.drops.length];
      drop.life = .65 + Math.random() * .9;
      drop.size = stab ? .018 + Math.random() * .025 : .04 + Math.random() * (blast ? .16 : .11);
      drop.position.set(position.x, position.y + (Math.random() - .5) * .5, position.z);
      drop.velocity.set((Math.random() - .5) * (blast ? 15 : 8), 1 + Math.random() * (blast ? 10 : 4), (Math.random() - .5) * (blast ? 15 : 7) - (blast ? 0 : 3));
      if (stab)
      {
        drop.velocity.z = -2 - Math.random() * 3;
        drop.velocity.y *= .4;
      }
      if (velocity) drop.velocity.addScaledVector(velocity, .2);
    }
    for (let i = 0; i < (stab ? 0 : blast ? 9 : 2); i++)
    {
      const fragment = this.fragments[this.fragmentCursor++ % this.fragments.length];
      fragment.life = 10;
      fragment.size = blast ? .65 + Math.random() : .3 + Math.random() * .4;
      fragment.color = i % 3 ? 0x9f3025 : 0x514c35;
      fragment.position.set(position.x, position.y, position.z);
      fragment.velocity.set((Math.random() - .5) * (blast ? 17 : 5), 2 + Math.random() * (blast ? 10 : 3), (Math.random() - .5) * (blast ? 17 : 5));
      fragment.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      fragment.landed = false;
    }
  }
  update(dt)
  {
    let count = 0;
    for (const drop of this.drops)
    {
      if (drop.life <= 0) continue;
      drop.life -= dt;
      drop.velocity.y -= 9.81 * dt;
      drop.position.addScaledVector(drop.velocity, dt);
      if (drop.position.y <= this.heightAt(drop.position.x, drop.position.z) + .03)
      {
        drop.life = 0;
        if (this.dropCursor++ % 7 === 0) this.stain(drop.position.x, drop.position.z, .15 + drop.size * 2);
        continue;
      }
      this.dummy.position.copy(drop.position);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(drop.size, drop.size * 1.4, drop.size);
      this.dummy.updateMatrix();
      this.dropMesh.setMatrixAt(count++, this.dummy.matrix);
    }
    this.dropMesh.count = count;
    this.dropMesh.instanceMatrix.needsUpdate = true;
    count = 0;
    for (const fragment of this.fragments)
    {
      if (fragment.life <= 0) continue;
      fragment.life -= dt;
      if (!fragment.landed)
      {
        fragment.velocity.y -= 9.81 * dt;
        fragment.position.addScaledVector(fragment.velocity, dt);
        fragment.rotation.x += dt * 7;
        fragment.rotation.z += dt * 4;
        const ground = this.heightAt(fragment.position.x, fragment.position.z) + .09;
        if (fragment.position.y < ground)
        {
          fragment.position.y = ground;
          fragment.landed = true;
          fragment.rotation.z = Math.PI / 2;
          this.stain(fragment.position.x, fragment.position.z, .45);
        }
      }
      this.dummy.position.copy(fragment.position);
      this.dummy.rotation.set(fragment.rotation.x, fragment.rotation.y, fragment.rotation.z);
      this.dummy.scale.setScalar(fragment.size * Math.min(1, fragment.life));
      this.dummy.updateMatrix();
      this.fragmentMesh.setMatrixAt(count, this.dummy.matrix);
      this.fragmentMesh.setColorAt(count++, this.color.setHex(fragment.color));
    }
    this.fragmentMesh.count = count;
    this.fragmentMesh.instanceMatrix.needsUpdate = true;
    if (this.fragmentMesh.instanceColor) this.fragmentMesh.instanceColor.needsUpdate = true;
    count = 0;
    for (const stain of this.stains)
    {
      if (stain.life <= 0) continue;
      stain.life -= dt;
      this.dummy.position.set(stain.x, this.heightAt(stain.x, stain.z) + .055, stain.z);
      this.dummy.rotation.set(0, stain.rotation, 0);
      this.dummy.scale.set(stain.size * Math.min(1, stain.life / 5), 1, stain.size * .65 * Math.min(1, stain.life / 5));
      this.dummy.updateMatrix();
      this.stainMesh.setMatrixAt(count++, this.dummy.matrix);
    }
    this.stainMesh.count = count;
    this.stainMesh.instanceMatrix.needsUpdate = true;
  }
  clear()
  {
    for (const pool of [this.drops, this.fragments, this.stains])
      for (const item of pool) item.life = 0;
    for (const mesh of [this.dropMesh, this.fragmentMesh, this.stainMesh]) mesh.count = 0;
  }
}