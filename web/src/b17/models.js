import * as THREE from 'three';

function wing(points, depth)
{
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function flash(view, parent, position, size = 1)
{
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: view.glowTexture, color: 0xffdc7d, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sprite.position.copy(position);
  sprite.scale.setScalar(size);
  sprite.visible = false;
  parent.add(sprite);
  return sprite;
}

export function buildWarbird(view, bomber = false, variant = 'bf109')
{
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: bomber ? 0x66705a : variant === 'fw190' ? 0x727b75 : 0x697568, roughness: .62, metalness: .25 });
  const underside = new THREE.MeshStandardMaterial({ color: bomber ? 0x999f96 : 0xa3b4b6, roughness: .6, metalness: .2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242d2a, roughness: .55, metalness: .5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6d9ca8, metalness: .7, roughness: .18 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd5b351, roughness: .6 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = group) => view.mesh(geo, mat, parent, x, y, z);
  const fuselage = mesh(new THREE.SphereGeometry(1, 24, 16), paint);
  fuselage.scale.set(bomber ? 1.5 : .76, bomber ? 1.7 : .85, bomber ? 11 : 4.8);
  const belly = mesh(new THREE.SphereGeometry(1, 20, 12), underside, 0, bomber ? -.4 : -.22, 0);
  belly.scale.set(bomber ? 1.36 : .72, bomber ? 1.15 : .63, bomber ? 10.3 : 4.5);
  const canopy = mesh(new THREE.SphereGeometry(1, 16, 10), glass, 0, bomber ? 1.1 : .8, bomber ? -5.6 : -.8);
  canopy.scale.set(bomber ? 1.24 : .58, bomber ? 1.1 : .65, bomber ? 2 : 1.5);
  if (bomber)
  {
    const top = new THREE.Group(), ball = new THREE.Group();
    group.add(top, ball);
    group.userData.stationParts = { top, ball };
    mesh(new THREE.SphereGeometry(1, 16, 12), glass, 0, .05, -9.8).scale.set(1.05, 1.15, 1.6);
    mesh(new THREE.SphereGeometry(.85, 14, 8), dark, 0, 1.75, -3, top);
    mesh(new THREE.SphereGeometry(.8, 12, 8), glass, 0, -1.55, -.2, ball);
    mesh(new THREE.CylinderGeometry(.045, .045, 1.3, 8), dark, .2, .1, -11.1).rotation.x = Math.PI / 2;
    for (const x of [-.3, .3])
    {
      mesh(new THREE.CylinderGeometry(.06, .06, 1.8, 8), dark, x, 2, -4.15, top).rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(.06, .06, 1.5, 8), dark, x, -1.9, -1.05, ball).rotation.x = Math.PI / 2;
    }
  }
  const span = bomber ? 15.8 : 5.8, root = bomber ? 3.7 : 1.25;
  for (const side of [-1, 1])
  {
    mesh(wing([[0, -root], [side * span * .76, -root * .7], [side * span, -.3], [side * span, .65], [side * 3, root * .7], [0, root]], bomber ? .24 : .14), paint);
    mesh(wing([[0, bomber ? 6.7 : 3.25], [side * (bomber ? 6 : 2.25), bomber ? 8.2 : 3.75], [side * (bomber ? 6 : 2.25), bomber ? 9.4 : 4.35], [0, bomber ? 9.8 : 4.6]], .12), paint, 0, .3);
    if (bomber)
    {
      mesh(new THREE.BoxGeometry(.05, .8, 1.6), glass, side * 1.42, .3, 2.8);
      mesh(new THREE.CylinderGeometry(.07, .07, 1.8, 8), dark, side * 2, .3, 2.8).rotation.z = Math.PI / 2;
    }
    else
    {
      mesh(new THREE.BoxGeometry(1.6, .04, .52), dark, side * 3.9, .1, .15);
      mesh(new THREE.BoxGeometry(.52, .045, 1.6), dark, side * 3.9, .11, .15);
      mesh(new THREE.BoxGeometry(1.85, .025, .22), underside, side * 3.9, .14, .15);
      mesh(new THREE.BoxGeometry(.22, .025, 1.85), underside, side * 3.9, .14, .15);
      mesh(new THREE.CylinderGeometry(.06, .06, 1.4, 8), dark, side * 1.6, .05, -1.15).rotation.x = Math.PI / 2;
    }
  }
  const fin = mesh(new THREE.SphereGeometry(1, 12, 8), paint, 0, bomber ? 2.1 : 1.05, bomber ? 8.1 : 3.9);
  fin.scale.set(.16, bomber ? 2.7 : 1.45, bomber ? 2.5 : 1.2);
  group.userData.propellers = [];
  for (const x of bomber ? [-10, -5, 5, 10] : [0])
  {
    const z = bomber ? -2.9 : -4.25, radius = bomber ? .95 : .7;
    if (bomber)
    {
      mesh(new THREE.SphereGeometry(1, 14, 10), paint, x, 0, -.9).scale.set(radius, radius, 2.8);
      mesh(new THREE.CylinderGeometry(radius, radius, 1.4, 20), underside, x, 0, z).rotation.x = Math.PI / 2;
    }
    else mesh(new THREE.CylinderGeometry(radius, radius, .7, 16), yellow, 0, 0, z).rotation.x = Math.PI / 2;
    const prop = new THREE.Group();
    prop.position.set(x, 0, z - (bomber ? .85 : .55));
    group.add(prop);
    for (let i = 0; i < 3; i++)
    {
      const blade = mesh(new THREE.BoxGeometry(.2, bomber ? 3.8 : 2.8, .06), dark, 0, 0, 0, prop);
      blade.rotation.z = i * Math.PI / 3;
    }
    mesh(new THREE.SphereGeometry(bomber ? .34 : .28, 10, 8), bomber ? dark : yellow, 0, 0, -.12, prop);
    const disc = mesh(new THREE.CircleGeometry(bomber ? 1.9 : 1.4, 24), new THREE.MeshBasicMaterial({ color: 0xdbe1d8, transparent: true, opacity: .085, side: THREE.DoubleSide, depthWrite: false }), 0, 0, .02, prop);
    disc.renderOrder = 1;
    group.userData.propellers.push(prop);
  }
  if (bomber)
  {
    // US star-and-bar roundels on both wings and fuselage sides.
    const navy = new THREE.MeshBasicMaterial({ color: 0x243848, side: THREE.DoubleSide });
    const white = new THREE.MeshBasicMaterial({ color: 0xe3e4d7, side: THREE.DoubleSide });
    for (const side of [-1, 1])
    {
      const badge = new THREE.Group();
      badge.position.set(side * 11.8, .2, .1);
      badge.rotation.x = -Math.PI / 2;
      group.add(badge);
      mesh(new THREE.CircleGeometry(1.1, 24), navy, 0, 0, 0, badge);
      mesh(new THREE.PlaneGeometry(3.2, .65), white, 0, 0, .015, badge);
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++)
      {
        const angle = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .4 : .95;
        i ? star.lineTo(Math.cos(angle) * r, Math.sin(angle) * r) : star.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      star.closePath();
      mesh(new THREE.ShapeGeometry(star), white, 0, 0, .025, badge);
      mesh(new THREE.BoxGeometry(.07, 1, 1.5), yellow, side * .18, 3, 8.4);
    }
  }
  const muzzle = new THREE.Group();
  group.add(muzzle);
  if (bomber) flash(view, muzzle, new THREE.Vector3(0, 2.2, 0), 2.3);
  else for (const x of [-1.6, 1.6]) flash(view, muzzle, new THREE.Vector3(x, .1, -2), 1.8);
  for (const child of muzzle.children) child.visible = true;
  muzzle.visible = false;
  group.userData.muzzle = muzzle;
  group.userData.paint = paint;
  view.scene.add(group);
  return group;
}
