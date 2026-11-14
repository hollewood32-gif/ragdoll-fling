// Picks which ragdoll part a click or touch grabs.
//
// A mouse is precise, but a fingertip covers a lot of a phone screen, so a
// touch also grabs the nearest part within a radius, not only the part
// exactly under the finger.

import Matter from "matter-js";

const { Query } = Matter;

/** How far away a press can be and still grab, in game-world pixels. */
export const GRAB_RADIUS = { mouse: 12, touch: 45 };

/** Distance from a point to a box (0 if the point is inside it). */
export function distanceToBounds(point: Matter.Vector, bounds: Matter.Bounds): number {
  const dx = Math.max(bounds.min.x - point.x, 0, point.x - bounds.max.x);
  const dy = Math.max(bounds.min.y - point.y, 0, point.y - bounds.max.y);
  return Math.hypot(dx, dy);
}

export interface GrabTarget {
  body: Matter.Body;
  /** Where on the body to attach, measured from its center. */
  offset: Matter.Vector;
}

/**
 * Returns the part to grab, or null if nothing is close enough.
 * An exact hit attaches at the touched spot; a near miss attaches at the
 * part's center so the ragdoll isn't yanked by an invisible lever.
 */
export function pickPart(parts: Matter.Body[], point: Matter.Vector, radius: number): GrabTarget | null {
  const exact = Query.point(parts, point)[0];
  if (exact) {
    return { body: exact, offset: { x: point.x - exact.position.x, y: point.y - exact.position.y } };
  }

  let nearest: Matter.Body | null = null;
  let nearestDistance = radius;
  for (const part of parts) {
    const distance = distanceToBounds(point, part.bounds);
    if (distance <= nearestDistance) {
      nearest = part;
      nearestDistance = distance;
    }
  }
  return nearest ? { body: nearest, offset: { x: 0, y: 0 } } : null;
}
