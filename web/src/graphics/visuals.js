import * as THREE from 'three';

// Procedural scenery and generic aircraft.
export function makeGlowTexture()
{
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.14, 'rgba(255,245,210,0.95)');
  gradient.addColorStop(0.38, 'rgba(255,175,80,0.35)');
  gradient.addColorStop(1, 'rgba(255,120,30,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function makeSmokeTexture()
{
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  for (let i = 0; i < 34; i++)
  {
    const angle = i * 2.39996,
      radius = 22 * Math.sqrt(i / 34);
    const x = 64 + Math.cos(angle) * radius,
      y = 64 + Math.sin(angle) * radius,
      size = 23 + (i % 5) * 3;
    const gradient = context.createRadialGradient(x, y, 0, x, y, size);
    gradient.addColorStop(0, 'rgba(255,255,255,0.19)');
    gradient.addColorStop(.45, 'rgba(215,215,215,0.13)');
    gradient.addColorStop(1, 'rgba(180,180,180,0)');
    context.fillStyle = gradient;
    context.fillRect(x - size, y - size, size * 2, size * 2);
  }
  return new THREE.CanvasTexture(canvas);
}

export function buildLandscape(view)
{
  const
  {
    scene
  } = view;
  const mesh = (...args) => view.mesh(...args);
  const sky = new THREE.ShaderMaterial(
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
    vertexShader: `varying vec3 vDirection;
      void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec3 vDirection; uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+17.;a*=.5;}return v;}
      void main(){vec3 d=normalize(vDirection);float h=max(d.y,0.);
        vec3 color=mix(vec3(.64,.71,.78),vec3(.12,.24,.38),pow(h,.55));
        vec3 sun=normalize(vec3(-.55,.34,-.85));float light=max(dot(d,sun),0.);
        color+=vec3(1.,.72,.36)*(pow(light,450.)*.23+pow(light,12000.)*1.4);
        vec2 p=d.xz/max(d.y,.09)*2.2+vec2(time*.001,0.);
        float n=fbm(p);float cloud=smoothstep(.49,.69,n)*smoothstep(.04,.18,h);
        color=mix(color,mix(vec3(.51,.57,.64),vec3(.91,.9,.86),smoothstep(.48,.8,n)),cloud*.92);
        gl_FragColor=vec4(color,1.);}`
  });
  view.skyMaterial = sky;
  mesh(new THREE.SphereGeometry(9000, 32, 20), sky, scene);
  view.waterMaterial = new THREE.ShaderMaterial(
  {
    uniforms:
    {
      time:
      {
        value: 0
      }
    },
    vertexShader: `varying vec3 world;void main(){world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
    fragmentShader: `varying vec3 world;uniform float time;
      void main(){vec2 p=world.xz;float t=time*.7;
        vec3 n=normalize(vec3(sin(p.x*.11+t)*.12+sin(p.x*.027+p.y*.07-t)*.1,1.,cos(p.y*.14-t)*.13));
        vec3 eye=normalize(cameraPosition-world);float fresnel=pow(1.-max(dot(n,eye),0.),3.);
        vec3 col=mix(vec3(.035,.11,.14),vec3(.36,.48,.57),fresnel);
        float glint=pow(max(dot(reflect(-normalize(vec3(-.55,.34,-.85)),n),eye),0.),95.);
        col+=vec3(.9,.75,.48)*glint*.65;
        float haze=smoothstep(250.,1900.,length(world.xz-cameraPosition.xz));
        gl_FragColor=vec4(mix(col,vec3(.53,.63,.7),haze*.8),1.);}`
  });
  const water = mesh(new THREE.PlaneGeometry(16000, 16000), view.waterMaterial, scene, 0, -4, -900);
  water.rotation.x = -Math.PI / 2;

  const loader = new THREE.TextureLoader();
  const tiled = (url, repeat, color = false) =>
  {
    const texture = loader.load(new URL(url, import.meta.url).href);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.anisotropy = Math.min(8, view.renderer.capabilities.getMaxAnisotropy());
    if (color) texture.colorSpace = THREE.SRGBColorSpace;
    view.textures.add(texture);
    return texture;
  };
  const terrain = new THREE.MeshStandardMaterial(
  {
    map: tiled('../../assets/textures/grass/Grass004_1K-JPG_Color.jpg', 55, true),
    normalMap: tiled('../../assets/textures/grass/Grass004_1K-JPG_NormalGL.jpg', 55),
    normalScale: new THREE.Vector2(.45, .45),
    color: 0x798071,
    roughness: 1,
    vertexColors: true
  });
  const ground = new THREE.PlaneGeometry(3000, 1800, 180, 100);
  ground.rotateX(-Math.PI / 2);
  const positions = ground.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++)
  {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const ridge = 80 + Math.sin(x * .004 + 2) * 45 + Math.sin(x * .011) * 20;
    const height = Math.max(0, 1 - Math.abs(z + 130 + Math.sin(x * .003) * 170) / 600) * ridge;
    const detail = Math.sin(x * .037) * Math.cos(z * .027) * 6 + Math.sin(x * .081 + z * .047) * 2;
    positions.setY(i, height + detail - 12);
    color.setRGB(.62 + height * .0015, .68 + height * .001, .58 + height * .0013);
    color.toArray(colors, i * 3);
  }
  ground.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  ground.computeVertexNormals();
  mesh(ground, terrain, scene, 0, -5, -1350);
  const concrete = new THREE.MeshStandardMaterial(
  {
    map: tiled('../../assets/textures/concrete/Concrete012_1K-JPG_Color.jpg', 4, true),
    normalMap: tiled('../../assets/textures/concrete/Concrete012_1K-JPG_NormalGL.jpg', 4),
    roughness: .95,
    color: 0x96958c
  });
  mesh(new THREE.CylinderGeometry(28, 31, 8, 64), concrete, scene, 0, -1, 12);
  const rail = new THREE.MeshStandardMaterial(
  {
    color: 0x4a4d48,
    metalness: .7,
    roughness: .48
  });
  for (let i = 0; i < 14; i++)
  {
    const a = Math.PI * (.16 + i / 13 * .68);
    const x = Math.cos(a) * 25,
      z = 12 - Math.sin(a) * 25;
    mesh(new THREE.CylinderGeometry(.08, .08, 2.8, 8), rail, scene, x, 4, z);
  }
  const rim = mesh(new THREE.TorusGeometry(25, .075, 6, 96, Math.PI * .68), rail, scene, 0, 5.4, 12);
  rim.rotation.set(Math.PI / 2, 0, Math.PI * .16);

}

function wingGeometry(points, thickness = .18)
{
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape,
  {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: .13,
    bevelThickness: .09,
    curveSegments: 8
  });
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

export function buildAircraft(view, target)
{
  const group = new THREE.Group();
  const mesh = (geometry, material, parent = group, x = 0, y = 0, z = 0) => view.mesh(geometry, material, parent, x, y, z);
  const heavy = target.kind === 'wing';
  const paint = new THREE.MeshStandardMaterial(
  {
    color: heavy ? 0x737f79 : 0x8e9797,
    metalness: .38,
    roughness: .48
  });
  const underside = new THREE.MeshStandardMaterial(
  {
    color: 0xb7babc,
    metalness: .45,
    roughness: .42
  });
  const dark = new THREE.MeshStandardMaterial(
  {
    color: 0x20282b,
    metalness: .7,
    roughness: .38
  });
  const stripe = new THREE.MeshStandardMaterial(
  {
    color: 0x9a4939,
    metalness: .25,
    roughness: .55
  });
  const glass = new THREE.MeshPhysicalMaterial(
  {
    color: 0x253d4a,
    metalness: .25,
    roughness: .12,
    clearcoat: 1
  });
  const points = [
    [0, -8.6],
    [.5, -8],
    [1.05, -5],
    [1.3, -2],
    [1.15, 1.5],
    [.7, 4.5],
    [.18, 8],
    [0, 8.4]
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const body = mesh(new THREE.LatheGeometry(points, 24), paint);
  body.rotation.x = Math.PI / 2;
  mesh(new THREE.SphereGeometry(1, 24, 16), glass, group, 0, 1.05, -2.1).scale.set(.85, .85, 2.6);
  for (const z of [-3.3, -1.4])
  {
    const frame = mesh(new THREE.TorusGeometry(.87, .045, 6, 24, Math.PI), dark, group, 0, 1.05, z);
    frame.scale.y = .9;
  }
  const span = heavy ? 12.5 : 10.5;
  for (const side of [-1, 1])
  {
    const wing = mesh(wingGeometry([
      [side * .8, -1.9],
      [side * span, 1.3],
      [side * (span - .6), 2.8],
      [side * .8, 2.4]
    ]), paint);
    wing.rotation.z = side * .035;
    mesh(wingGeometry([
      [side * .25, 5.5],
      [side * 4.4, 6.9],
      [side * 4.1, 7.8],
      [side * .2, 7.4]
    ], .12), underside);
    mesh(wingGeometry([
      [side * (span - 1.7), 1.05],
      [side * (span - .7), 1.33],
      [side * (span - .7), 2.55],
      [side * (span - 1.7), 2.5]
    ], .03), stripe, group, 0, .22, 0);
    const lamp = mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial(
    {
      color: side < 0 ? 0xc44838 : 0x86ab99
    }), group, side * span, 0, 1.8);
    lamp.scale.z = 1.7;
    const barrel = mesh(new THREE.CylinderGeometry(.12, .15, 2.7, 12), dark, group, side * 5, -.05, -2.4);
    barrel.rotation.x = Math.PI / 2;
  }
  const fin = wingGeometry([
    [0, 4.6],
    [2.9, 6.7],
    [2.7, 7.8],
    [0, 8]
  ], .15);
  fin.rotateZ(Math.PI / 2);
  mesh(fin, paint);
  group.userData.propellers = [];
  for (const x of heavy ? [-4.4, 4.4] : [0])
  {
    const z = heavy ? -2.6 : -8.1;
    if (heavy)
    {
      const nacelle = mesh(new THREE.SphereGeometry(1, 20, 12), paint, group, x, -.3, -.5);
      nacelle.scale.set(.95, .95, 3.2);
      const cowling = mesh(new THREE.CylinderGeometry(.92, .92, .85, 24), dark, group, x, -.3, z);
      cowling.rotation.x = Math.PI / 2;
    }
    const propeller = new THREE.Group();
    propeller.position.set(x, heavy ? -.3 : 0, z - .55);
    const hub = mesh(new THREE.SphereGeometry(.48, 16, 10), underside, propeller);
    hub.scale.z = 1.4;
    for (let i = 0; i < 3; i++)
    {
      const blade = mesh(new THREE.SphereGeometry(1, 12, 8), dark, propeller);
      blade.scale.set(.2, 2.4, .055);
      blade.rotation.z = i * Math.PI / 3;
    }
    const blur = mesh(new THREE.CircleGeometry(2.45, 32), new THREE.MeshBasicMaterial(
    {
      color: 0x66716d,
      transparent: true,
      opacity: .13,
      side: THREE.DoubleSide,
      depthWrite: false
    }), propeller);
    blur.position.z = -.1;
    group.add(propeller);
    group.userData.propellers.push(propeller);
  }
  const marker = mesh(new THREE.TorusGeometry(2, .12, 6, 32), new THREE.MeshBasicMaterial(
  {
    color: 0x82bdb0
  }), group, 0, 3.2, 0);
  group.userData.marker = marker;
  const muzzle = new THREE.Group();
  for (const x of [-5, 5])
  {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial(
    {
      map: view.glowTexture,
      color: 0xffe1aa,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    }));
    sprite.position.set(x, 0, -4);
    sprite.scale.set(3, 3, 1);
    muzzle.add(sprite);
  }
  group.add(muzzle);
  group.userData.muzzle = muzzle;
  view.scene.add(group);
  return group;
}