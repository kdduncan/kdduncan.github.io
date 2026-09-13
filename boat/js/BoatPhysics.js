import { Vector2 } from './Vector2.js';
import { BOAT_SPECS, KNOTS_TO_MS, MS_TO_KNOTS, RHO_WATER, RHO_AIR } from './config.js';

/**
 * Realistic Physics Engine for Beneteau 331 Sailboat.
 * Simulates rigid body mechanics, Beta 25 diesel engine, prop wash, prop walk,
 * keel hydrodynamics, rudder lift, and aerodynamic windage.
 */
export class BoatPhysics {
  constructor(initialState = {}) {
    // Rigid Body State (World Coordinates)
    this.position = new Vector2(initialState.x || 0, initialState.y || 0);
    this.velocity = new Vector2(0, 0); // World velocity (m/s)
    
    // Heading: compass angle in radians. 0 = North (+Y), PI/2 = East (+X), PI = South (-Y)
    const initHeadingDeg = initialState.headingDeg !== undefined ? initialState.headingDeg : 0;
    this.heading = (initHeadingDeg * Math.PI) / 180;
    this.angularVelocity = 0; // rad/s (positive = turning clockwise / to starboard)

    // Vessel Dimensions and Specs
    this.specs = BOAT_SPECS;
    this.mass = BOAT_SPECS.mass;
    this.inertia = BOAT_SPECS.inertia;

    // Helm & Engine Controls
    this.rudderAngleDeg = 0; // -35 (Port) to +35 (Starboard)
    this.throttle = 0;       // -1.0 (Full Reverse) to +1.0 (Full Forward)
    this.currentRpm = BOAT_SPECS.engine.idleRpm;

    // Telemetry & Force diagnostics for HUD visualizers
    this.diagnostics = {
      sogKnots: 0,
      stwKnots: 0,
      cogDeg: 0,
      headingDeg: initHeadingDeg,
      leewayDeg: 0,
      thrustForce: 0,
      propWalkForce: 0,
      rudderLiftForce: 0,
      keelLateralForce: 0,
      windForceVector: new Vector2(0, 0),
      currentForceVector: new Vector2(0, 0),
      netForce: new Vector2(0, 0),
      netTorque: 0,
      apparentWindSpeedKnots: 0,
      apparentWindAngleDeg: 0,
    };
  }

  /**
   * Direction unit vectors based on current heading.
   * Heading 0 = North (+Y), 90 deg = East (+X).
   */
  getForwardVector() {
    return new Vector2(Math.sin(this.heading), Math.cos(this.heading));
  }

  getStarboardVector() {
    return new Vector2(Math.cos(this.heading), -Math.sin(this.heading));
  }

  getPortVector() {
    return new Vector2(-Math.cos(this.heading), Math.sin(this.heading));
  }

  /**
   * Converts local body coordinate (x=stbd, y=bow) to world coordinate.
   */
  localToWorld(localPoint) {
    const fwd = this.getForwardVector();
    const stbd = this.getStarboardVector();
    return new Vector2(
      this.position.x + stbd.x * localPoint.x + fwd.x * localPoint.y,
      this.position.y + stbd.y * localPoint.x + fwd.y * localPoint.y
    );
  }

  /**
   * Converts world coordinate to local body coordinate.
   */
  worldToLocal(worldPoint) {
    const rel = Vector2.sub(worldPoint, this.position);
    const fwd = this.getForwardVector();
    const stbd = this.getStarboardVector();
    return new Vector2(
      rel.dot(stbd),
      rel.dot(fwd)
    );
  }

  /**
   * Returns current world position of a named cleat.
   */
  getCleatWorldPos(cleatId) {
    const cleat = this.specs.cleats[cleatId];
    if (!cleat) return this.position.clone();
    return this.localToWorld(cleat);
  }

  /**
   * Set rudder angle in degrees (-35 to +35).
   * Negative = Port, Positive = Starboard.
   */
  setRudder(deg) {
    this.rudderAngleDeg = Math.max(-this.specs.rudder.maxAngleDeg, 
                          Math.min(this.specs.rudder.maxAngleDeg, deg));
  }

  /**
   * Set throttle (-1.0 to +1.0).
   */
  setThrottle(val) {
    this.throttle = Math.max(-1.0, Math.min(1.0, val));
  }

  /**
   * Main Physics Step.
   * @param {number} dt - delta time in seconds
   * @param {Environment} env - Wind and current environment
   * @param {Array} externalForces - External forces from mooring lines or collisions:
   *        [{ worldPos: Vector2, worldForce: Vector2 }]
   */
  step(dt, env, externalForces = []) {
    const fwd = this.getForwardVector();
    const stbd = this.getStarboardVector();

    // 1. Water Current & Relative Speed Through Water (STW)
    const currentVel = env ? env.getCurrentVelocityWorld() : new Vector2(0, 0);
    const velRelWater = Vector2.sub(this.velocity, currentVel);

    // Body-frame relative velocities
    const surgeVel = velRelWater.dot(fwd);   // Forward (+) / Reverse (-) through water
    const swayVel = velRelWater.dot(stbd);   // Sideways drift to starboard (+) / port (-)

    // 2. Beta 25 Engine RPM & Thrust
    const engineCfg = this.specs.engine;
    let targetRpm = engineCfg.idleRpm;
    if (Math.abs(this.throttle) > 0.03) {
      const throttleMag = Math.abs(this.throttle);
      targetRpm = engineCfg.idleRpm + throttleMag * (engineCfg.maxRpm - engineCfg.idleRpm);
    }
    // Smooth engine ramp
    const rpmChangeRate = (targetRpm - this.currentRpm) * engineCfg.rpmResponseRate;
    this.currentRpm += rpmChangeRate * dt;

    // Thrust calculation
    const rpmFactor = Math.max(0, (this.currentRpm - engineCfg.idleRpm) / (engineCfg.maxRpm - engineCfg.idleRpm));
    let thrustMagnitude = 0;
    let propWalkMagnitude = 0;

    if (this.throttle > 0.03) {
      // Forward gear
      thrustMagnitude = engineCfg.maxThrust * Math.pow(rpmFactor, 1.7) * (this.throttle / Math.abs(this.throttle));
    } else if (this.throttle < -0.03) {
      // Reverse gear: produces reverse thrust and significant prop walk
      thrustMagnitude = -engineCfg.maxThrust * engineCfg.reverseThrustRatio * Math.pow(rpmFactor, 1.7);
      
      // PROP WALK: Right-hand prop discharges water sideways in reverse,
      // pushing the stern to PORT (towards -stbd).
      // Magnitude is proportional to reverse thrust.
      propWalkMagnitude = Math.abs(thrustMagnitude) * engineCfg.propWalkCoeff;
    }

    // Thrust force vector in world frame (acts along boat centerline)
    const thrustForce = Vector2.multiplyScalar(fwd, thrustMagnitude);

    // Prop walk force: acts laterally on the stern (pushes stern to PORT = -stbd)
    // Stern is at negative Y in body coordinates, so pushing stern to port causes bow to turn STARBOARD!
    const propWalkForce = Vector2.multiplyScalar(stbd, -propWalkMagnitude);
    const propWalkTorque = propWalkMagnitude * Math.abs(this.specs.rudder.positionY); // torque = F * arm

    // 3. Rudder Dynamics & Prop Wash
    const rudderRad = (this.rudderAngleDeg * Math.PI) / 180;
    
    // Prop Wash: When forward throttle is applied, high speed water is thrown directly over the rudder blade
    let washSpeed = 0;
    if (this.throttle > 0.03) {
      washSpeed = Math.sqrt(Math.max(0, thrustMagnitude) / (RHO_WATER * 0.15)) * (engineCfg.propWashFactor * 0.5);
    }
    
    // Effective speed of water flowing past the rudder
    const effectiveWaterSpeed = Math.hypot(surgeVel, washSpeed);
    
    // Rudder lift force: pushes stern sideways when turned
    // Turning rudder to STARBOARD (+rudderRad) pushes stern to PORT (-stbd), turning boat to STARBOARD (+torque).
    const rudderLift = 0.5 * RHO_WATER * this.specs.rudder.area * this.specs.rudder.liftCoeff 
                      * Math.sin(rudderRad) * Math.pow(effectiveWaterSpeed, 2);
    
    // Rudder lateral force on boat:
    const rudderForceWorld = Vector2.multiplyScalar(stbd, -rudderLift);
    const rudderTorque = rudderLift * Math.abs(this.specs.rudder.positionY); // Positive = turns bow to starboard

    // 4. Keel & Hull Hydrodynamics (Lateral resistance & forward/reverse drag)
    const hydro = this.specs.hydrodynamics;
    
    // Forward/reverse surge drag
    const surgeDragCoeff = surgeVel >= 0 ? hydro.forwardDrag : hydro.reverseDrag;
    const surgeDragMag = -Math.sign(surgeVel) * surgeDragCoeff * (surgeVel * surgeVel);
    const surgeDragForce = Vector2.multiplyScalar(fwd, surgeDragMag);

    // Lateral sway resistance (Keel): Enormous resistance preventing the sailboat from sliding sideways
    const swayDragMag = -swayVel * hydro.lateralDrag * (Math.abs(swayVel) + 0.25);
    const swayDragForce = Vector2.multiplyScalar(stbd, swayDragMag);

    // Keel lateral lift when boat has forward speed and a small leeway angle
    let keelLiftMag = 0;
    if (Math.abs(surgeVel) > 0.1) {
      const leewayAngle = Math.atan2(-swayVel, Math.abs(surgeVel));
      keelLiftMag = Math.sin(leewayAngle) * hydro.keelLiftFactor * Math.abs(surgeVel);
    }
    const keelLiftForce = Vector2.multiplyScalar(stbd, keelLiftMag);

    // Rotational hydrodynamic yaw damping (resists spinning in water)
    const yawDampingTorque = -this.angularVelocity * (hydro.yawDamping * Math.abs(this.angularVelocity) + 18000);

    // 5. Aerodynamic Windage (Wind pushing on topsides, cabin, and mast)
    let windForceWorld = new Vector2(0, 0);
    let windTorque = 0;
    let apparentWindSpeedKnots = 0;
    let apparentWindAngleDeg = 0;

    if (env) {
      const apparentWind = env.getApparentWind(this.velocity);
      const appWindSpeedMs = apparentWind.length();
      apparentWindSpeedKnots = appWindSpeedMs * MS_TO_KNOTS;

      if (appWindSpeedMs > 0.05) {
        // Apparent wind components in body frame
        const appWindFwd = apparentWind.dot(fwd);
        const appWindStbd = apparentWind.dot(stbd);

        // Wind angle relative to boat bow
        apparentWindAngleDeg = (Math.atan2(appWindStbd, appWindFwd) * 180 / Math.PI + 360) % 360;

        // Aerodynamic drag forces
        // Lateral wind force on topsides
        const windSideForce = 0.5 * RHO_AIR * this.specs.windageAreaSide * 1.15 * appWindStbd * appWindSpeedMs;
        // Longitudinal wind force
        const windFwdForce = 0.5 * RHO_AIR * this.specs.windageAreaFront * 0.95 * appWindFwd * appWindSpeedMs;

        windForceWorld = Vector2.add(
          Vector2.multiplyScalar(stbd, windSideForce),
          Vector2.multiplyScalar(fwd, windFwdForce)
        );

        // Wind Center of Effort (CE):
        // Beneteau 331 bow has high freeboard; wind pushes bow downwind (bow blow-off)
        // Center of lateral resistance is at clrOffset (-0.2m), CE is at ceOffset (+0.65m)
        const windTorqueArm = this.specs.ceOffset - this.specs.clrOffset;
        // Pushing starboard (+windSideForce) at forward arm (+arm) produces clockwise (+) torque (turns bow to starboard)
        windTorque = windSideForce * windTorqueArm;
      }
    }

    // 6. Assemble Internal Forces & Torques
    let totalForce = new Vector2(0, 0);
    totalForce.add(thrustForce);
    totalForce.add(propWalkForce);
    totalForce.add(rudderForceWorld);
    totalForce.add(surgeDragForce);
    totalForce.add(swayDragForce);
    totalForce.add(keelLiftForce);
    totalForce.add(windForceWorld);

    let totalTorque = propWalkTorque + rudderTorque + yawDampingTorque + windTorque;

    // 7. Add External Forces (Mooring lines & collision contacts)
    for (const ext of externalForces) {
      totalForce.add(ext.worldForce);
      // Maritime clockwise torque: r_y * F_x - r_x * F_y
      const r = Vector2.sub(ext.worldPos, this.position);
      const extTorque = r.y * ext.worldForce.x - r.x * ext.worldForce.y;
      totalTorque += extTorque;
    }

    // 8. Numerical Integration (Semi-Implicit Euler)
    const accel = Vector2.divideScalar(totalForce, this.mass);
    const angularAccel = totalTorque / this.inertia;

    // Update velocities
    this.velocity.add(Vector2.multiplyScalar(accel, dt));
    this.angularVelocity += angularAccel * dt;

    // Update positions
    this.position.add(Vector2.multiplyScalar(this.velocity, dt));
    this.heading += this.angularVelocity * dt;

    // Keep heading in [0, 2*PI)
    this.heading = (this.heading % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);

    // Safeguard against NaN or infinite values
    if (isNaN(this.position.x) || isNaN(this.position.y)) {
      this.position.set(0, -4.5);
      this.velocity.set(0, 0);
    }
    if (isNaN(this.velocity.x) || isNaN(this.velocity.y)) {
      this.velocity.set(0, 0);
    }
    if (isNaN(this.heading) || isNaN(this.angularVelocity)) {
      this.heading = 0;
      this.angularVelocity = 0;
    }

    // 9. Update Telemetry Diagnostics
    const sogMs = this.velocity.length();
    this.diagnostics.sogKnots = sogMs * MS_TO_KNOTS;
    this.diagnostics.stwKnots = velRelWater.length() * MS_TO_KNOTS;
    this.diagnostics.headingDeg = (this.heading * 180 / Math.PI + 360) % 360;
    this.diagnostics.cogDeg = (Math.atan2(this.velocity.x, this.velocity.y) * 180 / Math.PI + 360) % 360;
    this.diagnostics.leewayDeg = ((this.diagnostics.headingDeg - this.diagnostics.cogDeg + 540) % 360) - 180;
    this.diagnostics.thrustForce = thrustMagnitude;
    this.diagnostics.propWalkForce = propWalkMagnitude;
    this.diagnostics.rudderLiftForce = rudderLift;
    this.diagnostics.keelLateralForce = swayDragMag + keelLiftMag;
    this.diagnostics.windForceVector = windForceWorld;
    this.diagnostics.netForce = totalForce;
    this.diagnostics.netTorque = totalTorque;
    this.diagnostics.apparentWindSpeedKnots = apparentWindSpeedKnots;
    this.diagnostics.apparentWindAngleDeg = apparentWindAngleDeg;
  }

  /**
   * Resets boat to specific position, heading and speed.
   */
  resetTo(x, y, headingDeg, speedKnots = 0) {
    this.position.set(x, y);
    this.heading = (headingDeg * Math.PI) / 180;
    const fwd = this.getForwardVector();
    this.velocity = Vector2.multiplyScalar(fwd, speedKnots * KNOTS_TO_MS);
    this.angularVelocity = 0;
    this.rudderAngleDeg = 0;
    this.throttle = 0;
    this.currentRpm = this.specs.engine.idleRpm;
  }
}
