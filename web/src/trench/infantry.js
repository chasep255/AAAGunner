import
{
  sweptHit
}
from '../game.js';

const ZERO = {
  x: 0,
  y: 0,
  z: 0
};

// The renderer and hit volumes share posture, footing and limb animation.
export function infantryPose(target, terrain)
{
  const firing = target.fireRemaining > 0;
  const scale = target.climbing ? 1 : target.coverRemaining > 0 && !firing ? .55 : target.suppressed || firing ? .75 : 1;
  const gait = Math.sin(target.age * 10 + (target.phase || 0));
  const climb = Math.sin(Math.min(1, (target.climbAge || 0) / 1.15) * Math.PI);
  return {
    x: target.position.x,
    y: target.climbing ? target.position.y - 1 : terrain.height(target.position.x, target.position.z),
    z: target.position.z,
    yaw: Math.atan2(target.velocity.x, target.velocity.z),
    scale,
    legs: [target.climbing ? -climb * .9 : firing ? 0 : -gait * .65, target.climbing ? climb * .45 : firing ? 0 : gait * .65],
    arms: [target.climbing ? -1.1 - climb * .5 : firing ? -1.1 : -.45 - gait * .35, target.climbing ? -1.1 - climb * .5 : firing ? -1.1 : -.45 + gait * .35]
  };
}

function localPoint(point, pose)
{
  const x = point.x - pose.x,
    z = point.z - pose.z;
  const c = Math.cos(pose.yaw),
    s = Math.sin(pose.yaw);
  return {
    x: c * x - s * z,
    y: (point.y - pose.y) / pose.scale,
    z: s * x + c * z
  };
}

function limbPoint(point, x, y, angle)
{
  const dy = point.y - y,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    x: point.x - x,
    y: c * dy + s * point.z,
    z: -s * dy + c * point.z
  };
}

function ellipsoid(a, b, center, radii)
{
  const scale = p => (
  {
    x: (p.x - center[0]) / radii[0],
    y: (p.y - center[1]) / radii[1],
    z: (p.z - center[2]) / radii[2]
  });
  return sweptHit(scale(a), scale(b), ZERO, ZERO, 1);
}

// A vertical capsule: finite cylinder plus both rounded ends.
function capsule(a, b, low, high, radius)
{
  let hit = null;
  const accept = t =>
  {
    if (t !== null && (hit === null || t < hit)) hit = t;
  };
  for (const y of [low, high]) accept(sweptHit(a, b,
  {
    x: 0,
    y,
    z: 0
  },
  {
    x: 0,
    y,
    z: 0
  }, radius));
  const dx = b.x - a.x,
    dz = b.z - a.z,
    aa = dx * dx + dz * dz;
  const cc = a.x * a.x + a.z * a.z - radius * radius;
  if (cc <= 0 && a.y >= low && a.y <= high) return 0;
  const bb = 2 * (a.x * dx + a.z * dz),
    discriminant = bb * bb - 4 * aa * cc;
  if (aa > 1e-12 && discriminant >= 0)
  {
    const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
    const y = a.y + (b.y - a.y) * t;
    if (t >= 0 && t <= 1 && y >= low && y <= high) accept(t);
  }
  return hit;
}

export function infantryHit(start, end, target, terrain, stationary = false)
{
  const current = infantryPose(target, terrain);
  const previous = stationary ? current : target.previousPose || infantryPose(
  {
    ...target,
    position: target.previous || target.position
  }, terrain);
  const center = p => (
  {
    x: p.x,
    y: p.y + .9 * p.scale,
    z: p.z
  });
  if (sweptHit(start, end, center(previous), center(current), 1.2) === null) return null;
  const a = localPoint(start, previous),
    b = localPoint(end, current);
  let hit = null;
  const accept = (fraction, part) =>
  {
    if (fraction === null || hit && fraction >= hit.fraction) return;
    hit = {
      fraction,
      part,
      position:
      {
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
        z: start.z + (end.z - start.z) * fraction
      }
    };
  };
  accept(ellipsoid(a, b, [0, 1.59, 0], [.205, .22, .205]), 'head');
  accept(capsule(a, b, 1.37, 1.49, .105), 'torso');
  accept(capsule(a, b, .90, 1.20, .235), 'torso');
  accept(ellipsoid(a, b, [0, .77, 0], [.23, .17, .20]), 'torso');
  for (let i = 0; i < 2; i++)
  {
    const side = i ? 1 : -1;
    const legA = limbPoint(a, side * .115, .79, previous.legs[i]),
      legB = limbPoint(b, side * .115, .79, current.legs[i]);
    accept(capsule(legA, legB, -.64, -.04, .085), 'leg');
    accept(ellipsoid(legA, legB, [0, -.72, .07], [.09, .085, .17]), 'leg');
    const armA = limbPoint(a, side * .25, 1.3, previous.arms[i]),
      armB = limbPoint(b, side * .25, 1.3, current.arms[i]);
    accept(capsule(armA, armB, -.445, -.015, .075), 'arm');
  }
  return hit;
}