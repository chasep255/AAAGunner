import * as THREE from 'three';

const material = (color, metalness = .25) => new THREE.MeshStandardMaterial({ color, roughness: .7, metalness });
const box = (view, parent, mat, size, pos) => view.mesh(new THREE.BoxGeometry(...size), mat, parent, ...pos);

export function buildWarthog(view)
{
  const root = new THREE.Group();
  const paint = material(0x74817d), light = material(0xa5aea5), dark = material(0x242e30), steel = material(0x657276, .7);
  const body = view.mesh(new THREE.SphereGeometry(1, 24, 16), paint, root, 0, 0, 0);
  body.scale.set(1.35, 1.35, 8);
  const nose = view.mesh(new THREE.SphereGeometry(1, 20, 12), light, root, 0, -.1, -6.2);
  nose.scale.set(1.12, .95, 2.7);
  const canopy = view.mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: 0x163e4c, metalness: .6, roughness: .18 }), root, 0, 1.25, -4.1);
  canopy.scale.set(.85, .95, 2.1);
  for (const side of [-1, 1])
  {
    const wing = box(view, root, paint, [8.4, .28, 3.2], [side * 5.3, -.22, -.25]);
    wing.rotation.z = side * .028;
    box(view, root, light, [2.8, .12, .85], [side * 7.7, -.27, 1.2]);
    box(view, root, paint, [4.1, .2, 1.85], [side * 2.6, .65, 6.1]);
    const fin = box(view, root, paint, [.22, 2.9, 2.4], [side * 3.7, 1.9, 6.1]);
    fin.rotation.x = -.14;
    box(view, root, dark, [.25, .2, 1.9], [side * 3.7, 3.32, 6.3]);
    const engine = view.mesh(new THREE.CylinderGeometry(1.05, .95, 4.6, 24), paint, root, side * 2, 1.9, 3.7);
    engine.rotation.x = Math.PI / 2;
    for (const z of [1.38, 6.02])
    {
      const inlet = view.mesh(new THREE.CircleGeometry(.85, 24), dark, root, side * 2, 1.9, z);
      if (z < 2) inlet.rotation.y = Math.PI;
      view.mesh(new THREE.TorusGeometry(.94, .12, 8, 24), light, root, side * 2, 1.9, z);
    }
    for (const x of [3.8, 6, 8])
    {
      box(view, root, dark, [.22, .75, 1.2], [side * x, -.65, .25]);
      const store = view.mesh(new THREE.SphereGeometry(1, 12, 8), paint, root, side * x, -1.1, .15);
      store.scale.set(.25, .25, 1.5);
    }
    box(view, root, light, [1.7, .035, .2], [side * 6.2, -.035, -.45]);
    box(view, root, light, [.23, .04, 1.25], [side * 6.2, -.03, -.45]);
  }
  const gun = new THREE.Group();
  gun.position.set(-.25, -.65, -8.6);
  root.add(gun);
  for (let i = 0; i < 7; i++)
  {
    const angle = i * Math.PI * 2 / 7;
    const barrel = view.mesh(new THREE.CylinderGeometry(.055, .055, .9, 8), steel, gun, Math.cos(angle) * .16, Math.sin(angle) * .16, 0);
    barrel.rotation.x = Math.PI / 2;
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: view.glowTexture, color: 0xffda83, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flash.position.z = -.6;
  flash.visible = false;
  gun.add(flash);
  gun.userData = { flash, shotTime: 0 };
  root.userData.gun = gun;
  root.userData.barrelMaterial = steel;
  return root;
}

export function buildTank(view)
{
  const root = new THREE.Group(), paint = material(0x666344), edges = material(0x969077), track = material(0x292b28), steel = material(0x3c4540, .6);
  box(view, root, paint, [5.6, 1.6, 8.5], [0, -.2, 0]);
  const front = box(view, root, edges, [5.3, .5, 2.8], [0, .45, -2.9]);
  front.rotation.x = -.15;
  for (const side of [-1, 1])
  {
    box(view, root, track, [1.2, 1.8, 9], [side * 2.8, -.75, 0]);
    box(view, root, paint, [1.35, .25, 9.5], [side * 2.8, .3, 0]);
    for (let i = 0; i < 6; i++)
    {
      const wheel = view.mesh(new THREE.CylinderGeometry(.65, .65, .2, 12), steel, root, side * 3.43, -.8, -3.2 + i * 1.3);
      wheel.rotation.z = Math.PI / 2;
    }
  }
  const turret = new THREE.Group();
  root.add(turret);
  box(view, turret, paint, [3.8, 1.5, 4.3], [0, 1.1, .1]);
  view.mesh(new THREE.CylinderGeometry(.7, .7, .15, 16), edges, turret, .8, 1.92, .4);
  box(view, turret, steel, [.04, 3.5, .04], [-1.35, 3, 1.5]);
  const barrel = new THREE.Group();
  barrel.position.set(0, 1.25, -1.4);
  turret.add(barrel);
  const tube = view.mesh(new THREE.CylinderGeometry(.18, .27, 5.5, 12), steel, barrel, 0, 0, -2.5);
  tube.rotation.x = Math.PI / 2;
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: view.glowTexture, color: 0xffa242, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  flash.position.z = -5.4; flash.scale.setScalar(9); flash.visible = false;
  barrel.add(flash);
  root.userData = { turret, barrel, flash, paint, edges };
  return root;
}
