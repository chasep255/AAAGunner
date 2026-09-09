import * as THREE from 'three';
import
{
  BattlefieldTerrain,
  TRENCH_CAMERA,
  TRENCH_FRONT
}
from './terrain.js';

function randomSource(seed)
{
  return () =>
  {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function grainNoise(x, y, scale)
{
  const px = x / 512 * scale,
    py = y / 512 * scale,
    ix = Math.floor(px),
    iy = Math.floor(py),
    fx = px - ix,
    fy = py - iy;
  const hash = (a, b) =>
  {
    let n = Math.imul(a % scale + 17, 374761393) ^ Math.imul(b % scale + 31, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}

function surface(view, kind, color, repeat = 1)
{
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'),
    pixels = ctx.createImageData(512, 512),
    random = randomSource(83);
  for (let y = 0; y < 512; y++)
    for (let x = 0; x < 512; x++)
    {
      const grain = random();
      let value;
      if (kind === 'wood')
      {
        const wave = x + Math.sin(y * .018) * 6 + Math.sin(y * .049) * 2;
        value = .68 + Math.sin(wave * .55) * .09 + Math.sin(wave * 2.9) * .05 + grain * .14;
        if (x % 86 < 3) value *= .45;
      }
      else if (kind === 'cloth') value = .72 + grain * .18 + (x % 5 < 2 ? .05 : -.05) + (y % 5 < 2 ? .05 : -.05);
      else
      {
        const soil = grainNoise(x, y, 4) * .36 + grainNoise(x, y, 13) * .23 + grainNoise(x, y, 35) * .17 + grainNoise(x, y, 89) * .1;
        value = .4 + soil * .6 + grain * .12;
        if (grain > .996) value *= 1.35;
      }
      const i = (y * 512 + x) * 4;
      pixels.data.set([Math.min(255, value * 255), Math.min(255, value * 255), Math.min(255, value * 255), 255], i);
    }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = Math.min(8, view.renderer.capabilities.getMaxAnisotropy());
  view.textures.add(texture);
  return new THREE.MeshStandardMaterial(
  {
    color,
    map: texture,
    bumpMap: texture,
    bumpScale: kind === 'cloth' ? .012 : .065,
    roughness: kind === 'mud' ? .64 : .96
  });
}

function instanced(view, geometry, material, transforms, shadows = true)
{
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
  const dummy = new THREE.Object3D();
  transforms.forEach((item, i) =>
  {
    dummy.position.set(...item.position);
    dummy.rotation.set(...(item.rotation || [0, 0, 0]));
    dummy.scale.set(...(item.scale || [1, 1, 1]));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  view.scene.add(mesh);
  return mesh;
}

function timberWall(view, a, b, materials, random)
{
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = Math.hypot(dx, dz),
    yaw = Math.atan2(-dz, dx);
  const boards = [],
    posts = [];
  const count = Math.ceil(length / .23);
  for (let i = 0; i < count; i++)
  {
    const t = (i + .5) / count;
    boards.push(
    {
      position: [a[0] + dx * t, -.82 + random() * .025, a[1] + dz * t],
      rotation: [0, yaw, (random() - .5) * .025],
      scale: [.225, 1.75 + random() * .12, .09]
    });
    if (i % 6 === 0) posts.push(
    {
      position: [a[0] + dx * t, -.78, a[1] + dz * t + .09],
      rotation: [0, yaw, 0],
      scale: [.14, 1.94, .15]
    });
  }
  instanced(view, new THREE.BoxGeometry(1, 1, 1), materials.wood, boards);
  instanced(view, new THREE.BoxGeometry(1, 1, 1), materials.darkWood, posts);
  const earth = view.mesh(new THREE.BoxGeometry(length, 2.3, .8), materials.earth, view.scene, (a[0] + b[0]) / 2, -.67, (a[1] + b[1]) / 2 - .42);
  earth.rotation.y = yaw;
  earth.castShadow = earth.receiveShadow = true;
}
export function buildTrenchWorld(view)
{
  view.terrain = new BattlefieldTerrain();
  view.terrainRevision = -1;
  view.camera.position.copy(TRENCH_CAMERA);
  view.camera.fov = 60;
  view.camera.lookAt(0, -.6, -42);
  view.scene.fog = new THREE.FogExp2(0x929b99, .0034);
  view.renderer.setClearColor(0x929b99);
  view.renderer.shadowMap.enabled = true;
  view.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  view.renderer.toneMappingExposure = 1.12;
  for (const light of [...view.scene.children])
    if (light.isLight) view.scene.remove(light);
  view.scene.add(new THREE.HemisphereLight(0xdce9eb, 0x61503c, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b7, 2.6);
  sun.position.set(-24, 38, -30);
  sun.target.position.set(0, 0, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera,
  {
    left: -35,
    right: 35,
    top: 35,
    bottom: -35,
    near: 1,
    far: 130
  });
  sun.shadow.bias = -.00025;
  sun.shadow.normalBias = .045;
  sun.shadow.radius = 3;
  view.scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xd6e0e2, 1.05);
  fill.position.set(4, 10, 15);
  view.scene.add(fill);
  view.skyMaterial = new THREE.ShaderMaterial(
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
    vertexShader: 'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 p;uniform float time;
      float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(p);vec2 q=d.xz/(max(0.,d.y)+.27)*2.8+vec2(time*.002,0.);float n=0.,a=.55;for(int i=0;i<5;i++){n+=noise(q)*a;q=q*2.06+3.1;a*=.5;}
      vec3 c=mix(vec3(.38,.43,.44),vec3(.18,.25,.3),smoothstep(0.,.75,d.y));float clouds=smoothstep(.3,.76,n)*smoothstep(.005,.16,d.y);c=mix(c,vec3(.61,.61,.55),clouds*.85);
      float sunlight=pow(max(0.,dot(d,normalize(vec3(-.6,.35,-.7)))),14.);c+=vec3(.27,.18,.075)*sunlight;gl_FragColor=vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`
  });
  view.mesh(new THREE.SphereGeometry(950, 32, 20), view.skyMaterial, view.scene);
  const materials = {
    mud: surface(view, 'mud', 0x4d4941, 80),
    earth: surface(view, 'mud', 0x4b4032, 3),
    wood: surface(view, 'wood', 0x6b6250),
    darkWood: surface(view, 'wood', 0x5e513e),
    bags: surface(view, 'cloth', 0xa49a78, 2),
    metal: new THREE.MeshStandardMaterial(
    {
      color: 0x414941,
      roughness: .64,
      metalness: .45
    })
  };
  view.trenchMaterials = materials;
  const field = view.terrain;
  const geometry = new THREE.PlaneGeometry((field.columns - 1) * field.step, (field.rows - 1) * field.step, field.columns - 1, field.rows - 1);
  geometry.rotateX(-Math.PI / 2);
  // Plane rows run from negative Z to positive Z after this rotation.
  geometry.translate(0, 0, field.minZ + (field.rows - 1) * field.step / 2);
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
  materials.mud.vertexColors = true;
  materials.mud.bumpScale = .055;
  view.terrainMesh = view.mesh(geometry, materials.mud, view.scene);
  view.terrainMesh.receiveShadow = true;
  view.terrainMesh.frustumCulled = false;
  const water = new THREE.MeshStandardMaterial(
  {
    color: 0x657779,
    metalness: .38,
    roughness: .27,
    transparent: true,
    opacity: .72
  });
  view.craterWater = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), water, 160);
  view.craterWater.frustumCulled = false;
  view.scene.add(view.craterWater);
  view.craterRubble = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), materials.earth, 640);
  view.craterRubble.frustumCulled = false;
  view.scene.add(view.craterRubble);
  const random = randomSource(381);
  // A connected trench with deep floor, revetments, a firing step and side traverses.
  const floor = view.mesh(new THREE.PlaneGeometry(56, 8).rotateX(-Math.PI / 2), materials.earth, view.scene, 0, -1.72, 5);
  floor.receiveShadow = true;
  timberWall(view, [-28, TRENCH_FRONT], [28, TRENCH_FRONT], materials, random);
  timberWall(view, [-28, 9], [28, 9], materials, random);
  timberWall(view, [-6, 1.4], [-1.8, 7.5], materials, random);
  timberWall(view, [6, 1.4], [1.8, 7.5], materials, random);
  const step = view.mesh(new THREE.BoxGeometry(10.4, .85, 1.3), materials.wood, view.scene, 0, -1.2, 2.25);
  step.receiveShadow = true;
  const platform = view.mesh(new THREE.BoxGeometry(1.6, .85, 3.5), materials.darkWood, view.scene, 0, -1.2, 4.5);
  platform.receiveShadow = true;
  const duckboards = [];
  for (let i = 0; i < 72; i++) duckboards.push(
  {
    position: [(i % 24 - 11.5) * .38, -1.63, 4 + Math.floor(i / 24) * .85],
    rotation: [0, 0, (random() - .5) * .035],
    scale: [.34, .1, .8]
  });
  instanced(view, new THREE.BoxGeometry(1, 1, 1), materials.wood, duckboards);
  const bags = [];
  for (let row = 0; row < 2; row++)
    for (let i = -38; i <= 38; i++)
    {
      const x = i * .72 + (row % 2) * .34;
      const port = Math.min(Math.abs(x), Math.abs(x - 2.5), Math.abs(x + 2.5)) < .62;
      if (port && row === 1) continue;
      bags.push(
      {
        position: [x, .18 + row * .26, .87 + (random() - .5) * .1],
        rotation: [0, (random() - .5) * .12, Math.PI / 2],
        scale: [1, 1, 1.22]
      });
    }
  for (const side of [-1, 1])
    for (let i = 0; i < 11; i++)
      for (let row = 0; row < 2; row++)
      {
        const t = i / 10;
        bags.push(
        {
          position: [side * (6 - t * 4.2), .22 + row * .26, 1.4 + t * 6.1],
          rotation: [0, side * .96, Math.PI / 2],
          scale: [1, 1, 1.3]
        });
      }
  const bagGeometry = new THREE.CapsuleGeometry(.17, .39, 5, 12);
  const bp = bagGeometry.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setZ(i, bp.getZ(i) * (.92 + .08 * Math.cos(bp.getY(i) * 16)));
  bagGeometry.computeVertexNormals();
  instanced(view, bagGeometry, materials.bags, bags);
  const wire = [],
    poles = [];
  for (const z of [-37, -73])
    for (let x = -100; x < 100; x += 11)
    {
      if (Math.abs(x) < 8) continue;
      for (const px of [x, x + 9]) poles.push(
      {
        position: [px, field.height(px, z) + .5, z],
        rotation: [0, 0, Math.sin(px) * .17],
        scale: [.1, 1.55, .1]
      });
      for (let i = 0; i < 120; i++)
      {
        const a = i / 120,
          b = (i + 1) / 120,
          y = field.height(x + a * 9, z) + .65;
        wire.push(x + a * 9, y + Math.sin(a * Math.PI * 20) * .5, z + Math.cos(a * Math.PI * 20) * .5, x + b * 9, y + Math.sin(b * Math.PI * 20) * .5, z + Math.cos(b * Math.PI * 20) * .5);
        if (i % 6 === 0) wire.push(x + a * 9, y, z, x + a * 9 + .13, y + .16, z + .14);
      }
    }
  instanced(view, new THREE.BoxGeometry(1, 1, 1), materials.darkWood, poles);
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  view.scene.add(new THREE.LineSegments(wireGeometry, new THREE.LineBasicMaterial(
  {
    color: 0x343b37
  })));
  const grass = [];
  for (let i = 0; i < 650; i++)
  {
    const x = (random() - .5) * 180,
      z = -9 - random() * 150,
      y = field.height(x, z),
      h = .16 + random() * .34;
    for (let j = 0; j < 3; j++)
    {
      const a = random() * Math.PI,
        dx = Math.cos(a) * .08,
        dz = Math.sin(a) * .08;
      grass.push(x - dx, y, z - dz, x + dx, y, z + dz, x + dx * .3, y + h, z + dz * .3);
    }
  }
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute(grass, 3));
  grassGeometry.computeVertexNormals();
  view.mesh(grassGeometry, new THREE.MeshStandardMaterial(
  {
    color: 0x646345,
    roughness: 1,
    side: THREE.DoubleSide
  }), view.scene);
  const trees = [],
    branches = [];
  for (let i = 0; i < 60; i++)
  {
    const x = (random() - .5) * 380,
      z = -100 - random() * 300,
      height = 2 + random() * 7;
    trees.push(
    {
      position: [x, field.height(x, z) + height / 2, z],
      rotation: [0, 0, (random() - .5) * .24],
      scale: [1, height, 1]
    });
    branches.push(
    {
      position: [x + .5, field.height(x, z) + height * .65, z],
      rotation: [0, random() * 6, -.7],
      scale: [1, height * .48, 1]
    });
  }
  instanced(view, new THREE.CylinderGeometry(.07, .3, 1, 7), materials.darkWood, trees, false);
  instanced(view, new THREE.CylinderGeometry(.035, .12, 1, 5), materials.darkWood, branches, false);
  // Close equipment gives the emplacement a lived-in scale.
  for (const side of [-1, 1])
  {
    const crate = view.mesh(new THREE.BoxGeometry(.78, .56, .55), materials.wood, view.scene, side * 1.65, -1.37, 3.9);
    crate.rotation.y = side * .17;
    crate.castShadow = crate.receiveShadow = true;
    for (const offset of [-.23, .23]) view.mesh(new THREE.BoxGeometry(.055, .59, .57), materials.metal, crate, offset, 0, 0);
  }
  const shells = [];
  for (let i = 0; i < 85; i++) shells.push(
  {
    position: [.6 + random() * 1.1, -.72, 3.2 + random() * 2.3],
    rotation: [Math.PI / 2, 0, random() * Math.PI],
    scale: [1, 1, 1]
  });
  instanced(view, new THREE.CylinderGeometry(.014, .014, .07, 6), new THREE.MeshStandardMaterial(
  {
    color: 0xb99a54,
    metalness: .65,
    roughness: .38
  }), shells, false);
  updateBattlefield(view, field);
}
export function updateBattlefield(view, field)
{
  view.terrain = field;
  if (view.terrainRevision === field.revision) return;
  view.terrainRevision = field.revision;
  const
  {
    position,
    normal,
    color
  } = view.terrainMesh.geometry.attributes;
  const cols = field.columns,
    rows = field.rows;
  for (let i = 0; i < field.heights.length; i++)
  {
    const r = Math.floor(i / cols),
      c = i % cols,
      h = field.heights[i];
    position.setY(i, h);
    const dx = (field.heights[r * cols + Math.max(0, c - 1)] - field.heights[r * cols + Math.min(cols - 1, c + 1)]) / (field.step * 2);
    const dz = (field.heights[Math.max(0, r - 1) * cols + c] - field.heights[Math.min(rows - 1, r + 1) * cols + c]) / (field.step * 2);
    const n = Math.hypot(dx, 1, dz);
    normal.setXYZ(i, dx / n, 1 / n, dz / n);
    const shade = 1 - field.scorch[i] * .62;
    color.setXYZ(i, shade, shade * .98, shade * .94);
  }
  position.needsUpdate = normal.needsUpdate = color.needsUpdate = true;
  const dummy = new THREE.Object3D();
  let waterCount = 0,
    rubbleCount = 0;
  for (const crater of field.craters)
  {
    const floor = field.height(crater.x, crater.z);
    dummy.position.set(crater.x, floor + .07, crater.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(crater.radius * .26, 1, crater.radius * .23);
    dummy.updateMatrix();
    view.craterWater.setMatrixAt(waterCount++, dummy.matrix);
    for (let i = 0; i < 4; i++)
    {
      const a = crater.id * 4.7 + i * 1.6,
        x = crater.x + Math.cos(a) * crater.radius * 1.1,
        z = crater.z + Math.sin(a) * crater.radius * 1.1;
      dummy.position.set(x, field.height(x, z) + .08, z);
      dummy.rotation.set(a, a * .3, a);
      dummy.scale.set(.2, .12, .27);
      dummy.updateMatrix();
      view.craterRubble.setMatrixAt(rubbleCount++, dummy.matrix);
    }
  }
  view.craterWater.count = waterCount;
  view.craterWater.instanceMatrix.needsUpdate = true;
  view.craterRubble.count = rubbleCount;
  view.craterRubble.instanceMatrix.needsUpdate = true;
}