import { Vector2 } from './Vector2.js';
import { DOCK_CONFIG } from './config.js';

/**
 * Continuous Hull Polygon Collision System:
 * Provides continuous perimeter collision detection between the Beneteau 331
 * (hull polygon and fenders) and all slip structures (4 pilings, 1/3 finger pier, head dock).
 * Enforces hard non-penetration position projection, velocity restitution, contact spring forces,
 * and friction.
 */
export class CollisionSystem {
  constructor() {
    this.dock = DOCK_CONFIG;

    // Contact parameters
    this.fenderSpring = 55000;   // N/m (fender cushion)
    this.fenderDamping = 5500;   // N*s/m
    this.fenderFriction = 0.35;  // Rubber fender on wood/composite

    this.hullSpring = 180000;    // N/m (solid fiberglass contact)
    this.hullDamping = 14000;    // N*s/m
    this.hullFriction = 0.45;

    this.lastContactIntensity = 0;

    // Pre-build the 44-point hull perimeter polygon in local boat coordinates
    this.hullLocalPolygon = this.buildHullPolygon();
  }

  /**
   * Generates a 44-point dense polygon outlining the exact perimeter of the Beneteau 331.
   * Bow is +Y, Starboard is +X.
   */
  buildHullPolygon() {
    const pts = [];
    const hl = 5.17; // half-length (meters)
    const hb = 1.71; // half-beam (meters)

    // 1. Plumb Bow Tip
    pts.push(new Vector2(0, hl));

    // 2. Starboard Bow to Midship (9 curve samples)
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const y = hl * (1 - t);
      const x = hb * Math.sin(t * Math.PI / 2) * (1 - 0.08 * (1 - t));
      pts.push(new Vector2(x, y));
    }
    // Starboard Midship Maximum Beam
    pts.push(new Vector2(hb, 0));

    // 3. Starboard Midship to Transom (9 curve samples)
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const y = -hl * t;
      const x = hb - 0.38 * Math.pow(t, 1.3);
      pts.push(new Vector2(x, y));
    }
    // Starboard Transom Corner
    pts.push(new Vector2(1.33, -hl));

    // 4. Transom Swim Platform Steps Curve (4 samples)
    pts.push(new Vector2(0.66, -hl - 0.05));
    pts.push(new Vector2(0, -hl - 0.08));
    pts.push(new Vector2(-0.66, -hl - 0.05));
    pts.push(new Vector2(-1.33, -hl));

    // 5. Port Transom to Midship (9 curve samples)
    for (let i = 9; i >= 1; i--) {
      const t = i / 10;
      const y = -hl * t;
      const x = -(hb - 0.38 * Math.pow(t, 1.3));
      pts.push(new Vector2(x, y));
    }
    // Port Midship
    pts.push(new Vector2(-hb, 0));

    // 6. Port Midship to Bow (9 curve samples)
    for (let i = 9; i >= 1; i--) {
      const t = i / 10;
      const y = hl * (1 - t);
      const x = -(hb * Math.sin(t * Math.PI / 2) * (1 - 0.08 * (1 - t)));
      pts.push(new Vector2(x, y));
    }

    return pts;
  }

  /**
   * Evaluates all collision contacts and returns array of external forces:
   * [{ worldPos: Vector2, worldForce: Vector2, type: 'fender'|'hull', name: string }]
   */
  resolveCollisions(boat) {
    const contactForces = [];
    let maxIntensity = 0;

    // Transform full hull polygon to world space
    const worldPolygon = this.hullLocalPolygon.map(p => boat.localToWorld(p));
    const numPts = worldPolygon.length;

    // ========================================================
    // A. Check Fenders against Finger Pier & Pilings
    // ========================================================
    for (const fender of boat.specs.fenders) {
      const fenderWorldPos = boat.localToWorld(fender);
      const fenderRadius = fender.radius;

      // Fenders vs Pilings
      for (const piling of this.dock.pilings) {
        const pilingPos = new Vector2(piling.x, piling.y);
        const dist = fenderWorldPos.distanceTo(pilingPos);
        const minDist = fenderRadius + piling.radius;

        if (dist < minDist && dist > 0.001) {
          const penetration = minDist - dist;
          const normal = Vector2.sub(fenderWorldPos, pilingPos).normalize();

          // Hard position projection for fender cushion
          boat.position.add(Vector2.multiplyScalar(normal, penetration * 0.75));

          const r = Vector2.sub(fenderWorldPos, boat.position);
          const pointVel = Vector2.add(
            boat.velocity,
            new Vector2(-boat.angularVelocity * r.y, boat.angularVelocity * r.x)
          );

          const vNormal = pointVel.dot(normal);
          let fNormal = this.fenderSpring * penetration - this.fenderDamping * vNormal;
          fNormal = Math.max(0, fNormal);

          const tangent = new Vector2(-normal.y, normal.x);
          const vTangent = pointVel.dot(tangent);
          const fFriction = -Math.sign(vTangent) * Math.min(Math.abs(vTangent) * 2500, fNormal * this.fenderFriction);

          contactForces.push({
            worldPos: fenderWorldPos,
            worldForce: Vector2.add(
              Vector2.multiplyScalar(normal, fNormal),
              Vector2.multiplyScalar(tangent, fFriction)
            ),
            type: "fender",
            name: `${fender.name} on ${piling.name}`,
          });
          maxIntensity = Math.max(maxIntensity, fNormal);
        }
      }

      // Fenders vs Port Finger Pier (X in [-3.8, -2.7], Y in [9.4, 13.0])
      const fp = this.dock.fingerPier;
      const clampedX = Math.max(fp.startX - fp.width, Math.min(fp.startX, fenderWorldPos.x));
      const clampedY = Math.max(fp.endY, Math.min(fp.startY, fenderWorldPos.y));
      const closestPoint = new Vector2(clampedX, clampedY);
      const distPier = fenderWorldPos.distanceTo(closestPoint);

      if (distPier < fenderRadius && distPier > 0.0001) {
        const penetration = fenderRadius - distPier;
        const normal = Vector2.sub(fenderWorldPos, closestPoint).normalize();

        boat.position.add(Vector2.multiplyScalar(normal, penetration * 0.75));

        const r = Vector2.sub(fenderWorldPos, boat.position);
        const pointVel = Vector2.add(
          boat.velocity,
          new Vector2(-boat.angularVelocity * r.y, boat.angularVelocity * r.x)
        );

        const vNormal = pointVel.dot(normal);
        let fNormal = this.fenderSpring * penetration - this.fenderDamping * vNormal;
        fNormal = Math.max(0, fNormal);

        const tangent = new Vector2(-normal.y, normal.x);
        const vTangent = pointVel.dot(tangent);
        const fFriction = -Math.sign(vTangent) * Math.min(Math.abs(vTangent) * 2500, fNormal * this.fenderFriction);

        contactForces.push({
          worldPos: fenderWorldPos,
          worldForce: Vector2.add(
            Vector2.multiplyScalar(normal, fNormal),
            Vector2.multiplyScalar(tangent, fFriction)
          ),
          type: "fender",
          name: `${fender.name} on Finger Pier`,
        });
        maxIntensity = Math.max(maxIntensity, fNormal);
      }
    }

    // ========================================================
    // B. Continuous Hull Polygon Collision vs Pilings
    // ========================================================
    for (const piling of this.dock.pilings) {
      const pPos = new Vector2(piling.x, piling.y);
      let minDist = Infinity;
      let bestContactPoint = null;
      let bestNormal = null;

      // Test against all 44 line segments of the hull boundary
      for (let i = 0; i < numPts; i++) {
        const a = worldPolygon[i];
        const b = worldPolygon[(i + 1) % numPts];

        const ab = Vector2.sub(b, a);
        const ap = Vector2.sub(pPos, a);
        const abLenSq = ab.lengthSq();
        const t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
        const closest = new Vector2(a.x + t * ab.x, a.y + t * ab.y);
        const d = pPos.distanceTo(closest);

        if (d < minDist) {
          minDist = d;
          bestContactPoint = closest;
        }
      }

      // Check if piling center has penetrated inside the hull polygon
      const isInside = this.pointInPolygon(pPos, worldPolygon);

      if (minDist < piling.radius || isInside) {
        // Concrete piling collision detected!
        const penetration = isInside ? (piling.radius + minDist) : (piling.radius - minDist);
        
        // Outward normal that pushes boat away from piling
        let normal;
        if (isInside) {
          // Piling center is inside hull. Vector from boundary towards boat interior:
          normal = minDist > 0.001
            ? Vector2.sub(pPos, bestContactPoint).normalize()
            : Vector2.sub(boat.position, pPos).normalize();
        } else {
          // Piling center is outside hull. Vector from piling towards boat contact point:
          normal = minDist > 0.001
            ? Vector2.sub(bestContactPoint, pPos).normalize()
            : Vector2.sub(boat.position, pPos).normalize();
        }

        // 1. HARD NON-PENETRATION PROJECTION:
        // Instantly push boat out so hull CANNOT intersect the piling!
        const pushDist = Math.min(0.35, penetration * 0.92);
        boat.position.add(Vector2.multiplyScalar(normal, pushDist));

        // 2. Relative contact velocity
        const r = Vector2.sub(bestContactPoint, boat.position);
        const pointVel = Vector2.add(
          boat.velocity,
          new Vector2(-boat.angularVelocity * r.y, boat.angularVelocity * r.x)
        );
        const vNormal = pointVel.dot(normal);

        // 3. Velocity rebound (restitution)
        if (vNormal < 0) {
          const restitution = 0.20; // fiberglass on wood piling
          const deltaV = -(1 + restitution) * vNormal;
          boat.velocity.add(Vector2.multiplyScalar(normal, deltaV * 0.65));
          // Maritime torque: r_y * F_x - r_x * F_y kicks bow away from contact
          const impulseTorque = (r.y * normal.x - r.x * normal.y) * deltaV * 2800;
          boat.angularVelocity += impulseTorque / boat.inertia;
        }

        // 4. Stiff contact spring-damper force + friction
        const fNormal = Math.max(0, this.hullSpring * penetration - this.hullDamping * vNormal);
        const tangent = new Vector2(-normal.y, normal.x);
        const vTangent = pointVel.dot(tangent);
        const fFriction = -Math.sign(vTangent) * Math.min(Math.abs(vTangent) * 6000, fNormal * this.hullFriction);

        contactForces.push({
          worldPos: bestContactPoint,
          worldForce: Vector2.add(
            Vector2.multiplyScalar(normal, fNormal),
            Vector2.multiplyScalar(tangent, fFriction)
          ),
          type: "hull",
          name: `Hull on ${piling.name}`,
        });

        maxIntensity = Math.max(maxIntensity, fNormal);
      }
    }

    // ========================================================
    // C. Continuous Hull Collision vs Head Dock (Y = 13.0)
    // ========================================================
    for (const pt of worldPolygon) {
      if (pt.y > this.dock.headDock.y) {
        const penetration = pt.y - this.dock.headDock.y;
        const normal = new Vector2(0, -1); // push South

        // Hard position projection
        boat.position.y -= penetration * 0.90;

        const r = Vector2.sub(pt, boat.position);
        const pointVel = Vector2.add(
          boat.velocity,
          new Vector2(-boat.angularVelocity * r.y, boat.angularVelocity * r.x)
        );
        const vNormal = pointVel.dot(normal);
        if (vNormal < 0) {
          boat.velocity.y = Math.min(boat.velocity.y, -Math.abs(boat.velocity.y) * 0.15);
        }

        const fNormal = Math.max(0, this.hullSpring * penetration - this.hullDamping * vNormal);
        contactForces.push({
          worldPos: pt.clone(),
          worldForce: Vector2.multiplyScalar(normal, fNormal),
          type: "hull",
          name: "Hull on Head Dock",
        });
        maxIntensity = Math.max(maxIntensity, fNormal);
      }
    }

    // ========================================================
    // D. Continuous Hull Collision vs Port Finger Pier
    // ========================================================
    const fp = this.dock.fingerPier;
    const pierLeft = fp.startX - fp.width; // -3.8
    const pierRight = fp.startX;           // -2.7
    const pierBottom = fp.endY;            // 9.4
    const pierTop = fp.startY;             // 13.0

    for (const pt of worldPolygon) {
      if (pt.x > pierLeft && pt.x < pierRight && pt.y > pierBottom && pt.y < pierTop) {
        const distRight = pierRight - pt.x;
        const distBottom = pt.y - pierBottom;

        let normal, pen;
        if (distRight <= distBottom) {
          normal = new Vector2(1, 0); // push East into slip
          pen = distRight;
          boat.position.x += pen * 0.88;
        } else {
          normal = new Vector2(0, -1); // push South
          pen = distBottom;
          boat.position.y -= pen * 0.88;
        }

        const fNormal = Math.max(0, this.hullSpring * pen);
        contactForces.push({
          worldPos: pt.clone(),
          worldForce: Vector2.multiplyScalar(normal, fNormal),
          type: "hull",
          name: "Hull on Finger Pier",
        });
        maxIntensity = Math.max(maxIntensity, fNormal);
      }
    }

    this.lastContactIntensity = maxIntensity;
    return contactForces;
  }

  /**
   * Ray casting algorithm to determine if a world point is inside the hull polygon.
   */
  pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
