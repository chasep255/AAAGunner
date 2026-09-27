// Match the browser import map while exercising view math without WebGL.
export function resolve(specifier, context, nextResolve)
{
  if (specifier === 'three') return { url: new URL('../web/vendor/three/three.module.js', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
}
