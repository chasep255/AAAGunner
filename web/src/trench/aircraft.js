import
{
  BIPLANE_HEALTH
}
from './biplanes.js';
import * as THREE from 'three';
export function buildBiplane(view)
{
  const group = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial(
    {
      color: 0x9d9270,
      roughness: .87
    }),
    paint = new THREE.MeshStandardMaterial(
    {
      color: 0x744e39,
      roughness: .65
    }),
    metal = new THREE.MeshStandardMaterial(
    {
      color: 0x3b4241,
      roughness: .45,
      metalness: .55
    }),
    wood = new THREE.MeshStandardMaterial(
    {
      color: 0x715237,
      roughness: .73
    });
  const mesh = (geometry, material, x, y, z) => view.mesh(geometry, material, group, x, y, z);
  mesh(new THREE.CapsuleGeometry(.45, 2.6, 5, 12), paint, 0, 0, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.ConeGeometry(.36, 2.2, 12), paint, 0, .05, 2).rotation.x = Math.PI / 2;
  const wires = [],
    wings = [];
  for (const y of [-.36, 1.05])
  {
    for (const side of [-1, 1])
    {
      const wing = mesh(new THREE.BoxGeometry(4.3, .12, 1.55), fabric, side * 2.15, y, -.2);
      wing.userData.side = side;
      wings.push(wing);
    }
    for (let x = -4; x <= 4; x += .34) wires.push(x, y + .065, -.96, x, y + .065, .57);
  }
  for (const x of [-3.1, -1.1, 1.1, 3.1])
    for (const z of [-.77, .37])
    {
      mesh(new THREE.CylinderGeometry(.035, .035, 1.42, 6), wood, x, .34, z);
      wires.push(x, -.3, -.77, x, 1.04, .37);
    }
  mesh(new THREE.BoxGeometry(2.6, .09, .92), fabric, 0, .16, 2.75);
  const tail = mesh(new THREE.SphereGeometry(.64, 10, 8), paint, 0, .49, 2.83);
  tail.scale.set(.12, 1, .85);
  mesh(new THREE.SphereGeometry(.28, 10, 6), metal, 0, .38, .56).scale.set(.9, .8, 1.3);
  mesh(new THREE.SphereGeometry(.15, 8, 6), wood, 0, .57, .57);
  for (const x of [-.7, .7])
  {
    mesh(new THREE.CylinderGeometry(.29, .29, .14, 12), metal, x, -1.1, -.5).rotation.z = Math.PI / 2;
    const leg = mesh(new THREE.CylinderGeometry(.04, .04, .93, 6), metal, x * .6, -.68, -.5);
    leg.rotation.z = -Math.sign(x) * .4;
  }
  mesh(new THREE.CylinderGeometry(.06, .06, 1.4, 6), metal, 0, -1.1, -.5).rotation.z = Math.PI / 2;
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  group.add(new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial(
  {
    color: 0x5b5545
  })));
  const prop = new THREE.Group();
  prop.position.set(0, 0, -2);
  group.add(prop);
  view.mesh(new THREE.BoxGeometry(.16, 2.05, .08), wood, prop);
  view.mesh(new THREE.CircleGeometry(1.05, 24), new THREE.MeshBasicMaterial(
  {
    color: 0x9d9270,
    transparent: true,
    opacity: .14,
    side: THREE.DoubleSide,
    depthWrite: false
  }), prop);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial(
  {
    map: view.glowTexture,
    color: 0xffdc93,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  }));
  flash.position.set(.25, .15, -2.15);
  flash.scale.setScalar(1.5);
  flash.visible = false;
  group.add(flash);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial(
  {
    map: view.glowTexture,
    color: 0xff681f,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  }));
  flame.position.set(0, .25, -1.6);
  flame.scale.set(.9, 1.8, 1);
  flame.visible = false;
  group.add(flame);
  group.userData = {
    prop,
    flash,
    flame,
    wings,
    smokeClock: 0
  };
  return group;
}
export function updateBiplanes(view, game, dt)
{
  if (!view.biplaneModels) view.biplaneModels = new Map();
  for (const plane of game.biplanes)
  {
    if (!plane.alive) continue;
    let model = view.biplaneModels.get(plane.id);
    if (!model)
    {
      model = buildBiplane(view);
      view.scene.add(model);
      view.biplaneModels.set(plane.id, model);
    }
    model.position.copy(plane.position);
    model.rotation.set(plane.pitch, -plane.heading, plane.bank, 'YXZ');
    const damage = 1 - plane.health / BIPLANE_HEALTH;
    const power = plane.crashed ? 0 : plane.disabled ? Math.exp(-plane.crashAge * 1.5) : 1 - damage * .45;
    model.userData.prop.rotation.z += dt * 95 * power;
    model.userData.flash.visible = !plane.disabled && plane.muzzleFlash > 0;
    model.userData.flame.visible = plane.disabled;
    model.userData.flame.material.opacity = .65 + Math.sin(view.clock * 31) * .18;
    for (const wing of model.userData.wings) wing.rotation.z = plane.crashed ? wing.userData.side * .24 : 0;
    if (damage > 0 && dt > 0)
    {
      model.userData.smokeClock -= dt;
      if (model.userData.smokeClock <= 0)
      {
        model.userData.smokeClock = plane.disabled ? .05 : .18;
        const cloud = view.smoke.find(item => item.life <= 0);
        if (cloud)
        {
          cloud.life = cloud.maxLife = 3 + damage * .5;
          cloud.size = 1.2 + damage * 2.4;
          cloud.dark = true;
          cloud.sprite.position.copy(plane.position);
          cloud.velocity.set(0, .7 + damage, 0);
          cloud.sprite.material.rotation = Math.random() * Math.PI * 2;
          cloud.sprite.visible = true;
        }
      }
    }
  }
  for (const [id, model] of view.biplaneModels)
    if (!game.biplanes.some(p => p.alive && p.id === id))
    {
      view.removeModel(model);
      view.biplaneModels.delete(id);
    }
}