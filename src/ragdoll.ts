// Builds a ragdoll: simple shapes (head, torso, arms, legs) pinned together by joints.

import Matter from "matter-js";

const { Bodies, Body, Composite, Constraint } = Matter;

export interface Ragdoll {
  composite: Matter.Composite;
  parts: Matter.Body[]; // in drawing order: back to front
}

const COLORS = {
  head: "#ffd166",
  torso: "#ef476f",
  arm: "#118ab2",
  leg: "#06d6a0",
};

// A joint pins a point on one body to a point on another.
// Points are measured from each body's center. Joints are slightly soft and
// damped: fully stiff joints can fight the floor and make limbs twitch forever.
function joint(
  bodyA: Matter.Body,
  pointA: Matter.Vector,
  bodyB: Matter.Body,
  pointB: Matter.Vector,
): Matter.Constraint {
  return Constraint.create({ bodyA, pointA, bodyB, pointB, length: 0, stiffness: 0.6, damping: 0.1 });
}

/** Creates a ragdoll whose torso is centered at (x, y). */
export function createRagdoll(x: number, y: number): Ragdoll {
  // Parts in the same negative group never collide with each other,
  // so the limbs can overlap the torso without fighting it.
  const group = Body.nextGroup(true);

  const options = (color: string): Matter.IChamferableBodyDefinition => ({
    label: "ragdoll",
    collisionFilter: { group },
    friction: 0.3,
    frictionAir: 0.02, // a little air drag so stray wobbles die down
    restitution: 0.4, // a little bounce
    chamfer: { radius: 5 }, // rounded corners
    render: { fillStyle: color },
  });

  // Torso is 34 wide, 70 tall. Its top edge is y-35, bottom edge y+35.
  const torso = Bodies.rectangle(x, y, 34, 70, options(COLORS.torso));
  const head = Bodies.circle(x, y - 53, 18, {
    label: "ragdoll",
    collisionFilter: { group },
    friction: 0.3,
    frictionAir: 0.02,
    restitution: 0.4,
    render: { fillStyle: COLORS.head },
  });

  // Arms hang from the shoulders (upper arm 36 tall, lower arm 34 tall).
  const upperArmL = Bodies.rectangle(x - 17, y - 10, 12, 36, options(COLORS.arm));
  const lowerArmL = Bodies.rectangle(x - 17, y + 25, 10, 34, options(COLORS.arm));
  const upperArmR = Bodies.rectangle(x + 17, y - 10, 12, 36, options(COLORS.arm));
  const lowerArmR = Bodies.rectangle(x + 17, y + 25, 10, 34, options(COLORS.arm));

  // Legs hang from the hips (each segment 40 tall).
  const upperLegL = Bodies.rectangle(x - 9, y + 55, 14, 40, options(COLORS.leg));
  const lowerLegL = Bodies.rectangle(x - 9, y + 95, 12, 40, options(COLORS.leg));
  const upperLegR = Bodies.rectangle(x + 9, y + 55, 14, 40, options(COLORS.leg));
  const lowerLegR = Bodies.rectangle(x + 9, y + 95, 12, 40, options(COLORS.leg));

  const joints = [
    joint(torso, { x: 0, y: -35 }, head, { x: 0, y: 18 }), // neck
    joint(torso, { x: -17, y: -28 }, upperArmL, { x: 0, y: -18 }), // left shoulder
    joint(upperArmL, { x: 0, y: 18 }, lowerArmL, { x: 0, y: -17 }), // left elbow
    joint(torso, { x: 17, y: -28 }, upperArmR, { x: 0, y: -18 }), // right shoulder
    joint(upperArmR, { x: 0, y: 18 }, lowerArmR, { x: 0, y: -17 }), // right elbow
    joint(torso, { x: -9, y: 35 }, upperLegL, { x: 0, y: -20 }), // left hip
    joint(upperLegL, { x: 0, y: 20 }, lowerLegL, { x: 0, y: -20 }), // left knee
    joint(torso, { x: 9, y: 35 }, upperLegR, { x: 0, y: -20 }), // right hip
    joint(upperLegR, { x: 0, y: 20 }, lowerLegR, { x: 0, y: -20 }), // right knee
  ];

  // Drawing order: limbs behind, then torso, then head on top.
  const parts = [
    upperLegL, lowerLegL, upperLegR, lowerLegR,
    upperArmL, lowerArmL, upperArmR, lowerArmR,
    torso, head,
  ];

  const composite = Composite.create({ label: "ragdoll" });
  Composite.add(composite, [...parts, ...joints]);

  return { composite, parts };
}

/**
 * How fast the ragdoll's center of mass is moving: the speed of the body as a
 * whole, ignoring limbs flapping around it.
 */
export function wholeBodySpeed(ragdoll: Ragdoll): number {
  let mass = 0;
  let momentumX = 0;
  let momentumY = 0;
  for (const part of ragdoll.parts) {
    mass += part.mass;
    momentumX += part.mass * part.velocity.x;
    momentumY += part.mass * part.velocity.y;
  }
  return Math.hypot(momentumX, momentumY) / mass;
}
