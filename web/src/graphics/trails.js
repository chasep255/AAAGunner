import * as THREE from 'three';

// One draw call for a bounded pool of exhaust left in world space.
export class MissileSmoke
{
  constructor(scene, texture)
  {
    this.next = 0;
    this.puffs = Array.from(
    {
      length: 4096
    }, () => (
    {
      position: new THREE.Vector3(),
      life: 0,
      seed: 0
    }));
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [
        ['position', 3],
        ['size', 1],
        ['opacity', 1],
        ['rotation', 1]
      ])
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(this.puffs.length * size), size).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    const material = new THREE.ShaderMaterial(
    {
      transparent: true,
      depthWrite: false,
      uniforms:
      {
        smoke:
        {
          value: texture
        },
        projectionScale:
        {
          value: 600
        }
      },
      vertexShader: `attribute float size; attribute float opacity; attribute float rotation;
        uniform float projectionScale; varying float alpha; varying float spin;
        void main() { vec4 p = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * p;
          gl_PointSize = clamp(size * projectionScale / max(1.0, -p.z), 0.0, 180.0);
          alpha = opacity; spin = rotation; }`,
      fragmentShader: `uniform sampler2D smoke; varying float alpha; varying float spin;
        void main() { vec2 p = gl_PointCoord - 0.5;
          vec2 uv = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * p + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
          vec4 texel = texture2D(smoke, uv);
          gl_FragColor = vec4(mix(vec3(.56,.60,.61), vec3(.85,.87,.85), texel.r), texel.a * alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    this.mesh = new THREE.Points(geometry, material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  emit(from, to)
  {
    const distance = from.distanceTo(to);
    if (distance < 1.5) return;
    const step = new THREE.Vector3().subVectors(to, from).multiplyScalar(1.5 / distance);
    const count = Math.min(48, Math.floor(distance / 1.5));
    for (let i = 0; i < count; i++)
    {
      from.add(step);
      const puff = this.puffs[this.next++ % this.puffs.length];
      puff.position.copy(from);
      puff.life = 3.2;
      puff.seed = this.next * 2.39996;
    }
  }

  update(dt, projectionScale)
  {
    const attributes = this.mesh.geometry.attributes;
    let count = 0;
    for (const puff of this.puffs)
    {
      puff.life = Math.max(0, puff.life - dt);
      if (!puff.life) continue;
      const age = 3.2 - puff.life;
      puff.position.y += .7 * dt;
      puff.position.x += Math.sin(puff.seed) * .5 * dt;
      attributes.position.setXYZ(count, puff.position.x, puff.position.y, puff.position.z);
      attributes.size.setX(count, 1.8 + age * .8);
      attributes.opacity.setX(count, .22 * Math.min(1, puff.life / 1.2));
      attributes.rotation.setX(count++, puff.seed + age * .1);
    }
    this.mesh.geometry.setDrawRange(0, count);
    for (const attribute of Object.values(attributes)) attribute.needsUpdate = true;
    this.mesh.material.uniforms.projectionScale.value = projectionScale;
  }

  clear()
  {
    for (const puff of this.puffs) puff.life = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }
}