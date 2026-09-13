import { Vector2 } from './Vector2.js';
import { MOORING_SPECS } from './config.js';

/**
 * MooringLine class simulating elastic dock lines with tension,
 * length adjustments, slack, and torque applied to boat cleats.
 */
export class MooringLine {
  constructor(options = {}) {
    this.id = options.id || `line_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.name = options.name || "Mooring Line";
    
    // Boat cleat connection
    this.boatCleatId = options.boatCleatId; // e.g. "mid_port", "bow_port", "stern_starboard"
    
    // Dock connection (can be piling or dock cleat)
    this.dockId = options.dockId; // e.g. "pile_outer_port", "finger_end", etc.
    this.dockPos = new Vector2(options.dockX || 0, options.dockY || 0);
    this.dockName = options.dockName || "Dock Cleat";

    // Physical rope parameters
    this.restLength = options.restLength || 5.0; // Rest length in meters
    this.k = options.k || MOORING_SPECS.springConstant; // N/m
    this.snubK = options.snubK || MOORING_SPECS.snubConstant || 220000; // N/m (exponential snubbing)
    this.damping = options.damping || MOORING_SPECS.dampingConstant; // N*s/m
    this.maxStretchRatio = options.maxStretchRatio || MOORING_SPECS.maxStretchRatio || 0.05;
    this.breakingStrain = options.breakingStrain || MOORING_SPECS.maxBreakingStrain; // N

    // Live state
    this.currentLength = this.restLength;
    this.tension = 0; // Newtons
    this.isTaut = false;
    this.isBroken = false;
    this.prevLength = this.restLength;

    // Visual rendering helper
    this.boatCleatWorldPos = new Vector2(0, 0);
  }

  /**
   * Updates line state and calculates tension force applied to boat.
   * @param {BoatPhysics} boat - The boat instance
   * @param {number} dt - delta time in seconds
   * @returns {Object|null} { worldPos: Vector2, worldForce: Vector2, tension: number } or null if broken/slack
   */
  computeForce(boat, dt) {
    if (this.isBroken) return null;

    // 1. Get world position of boat cleat
    this.boatCleatWorldPos = boat.getCleatWorldPos(this.boatCleatId);

    // 2. Vector from boat cleat to dock anchor
    const lineVec = Vector2.sub(this.dockPos, this.boatCleatWorldPos);
    this.currentLength = lineVec.length();

    // 3. Elastic tension and fixed-distance arrest calculation
    if (this.currentLength > this.restLength) {
      this.isTaut = true;
      const stretch = this.currentLength - this.restLength;
      const maxAllowedStretch = Math.max(0.08, this.restLength * this.maxStretchRatio);

      // Direction unit vector (pulls boat cleat TOWARDS dock anchor)
      const dir = Vector2.divideScalar(lineVec, this.currentLength);

      // Relative velocity of cleat in world space
      const r = Vector2.sub(this.boatCleatWorldPos, boat.position);
      const cleatVel = Vector2.add(
        boat.velocity,
        new Vector2(-boat.angularVelocity * r.y, boat.angularVelocity * r.x)
      );

      // Rate of elongation (positive if cleat is pulling away from dock anchor)
      const pullAwaySpeed = -cleatVel.dot(dir);

      // Progressive non-linear tension:
      // Base stiffness + steep cubic snubbing curve as line nears physical limit
      const stretchRatio = Math.min(2.5, stretch / maxAllowedStretch);
      let tension = this.k * stretch + this.snubK * Math.pow(stretchRatio, 2.5) * stretch;
      if (pullAwaySpeed > 0) {
        tension += this.damping * pullAwaySpeed;
      }
      this.tension = Math.max(0, Math.min(this.breakingStrain, tension));

      // Hard Distance Constraint (eliminates "infinite give"):
      // When line reaches its physical limit, directly project boat position
      // and arrest outward momentum so the boat cannot drift beyond the line length!
      if (stretch > maxAllowedStretch) {
        const overshoot = stretch - maxAllowedStretch;
        // Project boat position towards anchor
        boat.position.add(Vector2.multiplyScalar(dir, overshoot * 0.85));

        // Kill velocity component pulling away from anchor
        if (pullAwaySpeed > 0) {
          boat.velocity.add(Vector2.multiplyScalar(dir, pullAwaySpeed * 0.95));
          boat.angularVelocity *= 0.96;
        }
      }

      const forceOnBoat = Vector2.multiplyScalar(dir, this.tension);
      this.prevLength = this.currentLength;

      return {
        worldPos: this.boatCleatWorldPos.clone(),
        worldForce: forceOnBoat,
        tension: this.tension,
      };
    } else {
      // Slack line
      this.isTaut = false;
      this.tension = 0;
      this.prevLength = this.currentLength;
      return null;
    }
  }

  /**
   * Adjust rest length (haul in or pay out line).
   */
  adjustLength(deltaMeters) {
    this.restLength = Math.max(0.5, Math.min(30.0, this.restLength + deltaMeters));
  }

  setLength(meters) {
    this.restLength = Math.max(0.5, Math.min(30.0, meters));
  }
}
