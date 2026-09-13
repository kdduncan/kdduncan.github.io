import { Vector2 } from './Vector2.js';

/**
 * Renders dynamic visual effects:
 * - Propeller wash bubbles & turbulence
 * - Hull wake and surface foam
 * - Wind stream particles
 * - Current flow indicators
 * - Force vectors & line tension indicators
 * - Breadcrumb path trail
 */
export class EffectsRenderer {
  constructor() {
    this.propWashParticles = [];
    this.windParticles = [];
    this.trailPoints = [];
    this.maxTrailPoints = 250;
    this.trailTimer = 0;

    // Initialize wind particles
    for (let i = 0; i < 60; i++) {
      this.windParticles.push({
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * 40,
        life: Math.random(),
        length: 1.5 + Math.random() * 2.0,
      });
    }
  }

  update(dt, boat, env) {
    // 1. Update Propeller Wash Particles
    const propWorldPos = boat.localToWorld(new Vector2(0, -4.5));
    const throttle = boat.throttle;
    const rpm = boat.currentRpm;

    if (Math.abs(throttle) > 0.05 && rpm > 900) {
      const emitCount = Math.floor(Math.abs(throttle) * 4) + 1;
      for (let i = 0; i < emitCount; i++) {
        // Flow direction: forward throttle pushes water aft (-fwd)
        // Reverse throttle pushes water forward (+fwd) and sideways
        const fwd = boat.getForwardVector();
        const stbd = boat.getStarboardVector();
        
        let flowDir = Vector2.multiplyScalar(fwd, throttle > 0 ? -1 : 0.8);
        if (throttle < 0) {
          // Prop walk discharge to starboard/port
          flowDir.add(Vector2.multiplyScalar(stbd, (Math.random() - 0.3) * 0.8));
        }

        const speed = (rpm / 3200) * 3.5 + Math.random() * 1.5;
        this.propWashParticles.push({
          x: propWorldPos.x + (Math.random() - 0.5) * 0.6,
          y: propWorldPos.y + (Math.random() - 0.5) * 0.6,
          vx: flowDir.x * speed + (Math.random() - 0.5) * 0.5,
          vy: flowDir.y * speed + (Math.random() - 0.5) * 0.5,
          radius: 0.15 + Math.random() * 0.25,
          life: 1.0,
          decay: 0.6 + Math.random() * 0.5,
        });
      }
    }

    // Update existing prop wash particles
    for (let i = this.propWashParticles.length - 1; i >= 0; i--) {
      const p = this.propWashParticles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.95;
      p.vy *= 0.95;
      p.radius += dt * 0.4;
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        this.propWashParticles.splice(i, 1);
      }
    }

    // 2. Update Wind Stream Particles
    if (env) {
      const windVel = env.getWindVelocityWorld();
      const windSpeed = windVel.length();
      if (windSpeed > 0.1) {
        const normWind = Vector2.divideScalar(windVel, windSpeed);
        for (const wp of this.windParticles) {
          wp.x += windVel.x * dt;
          wp.y += windVel.y * dt;
          wp.life -= dt * 0.35;

          // Wrap around canvas bounds relative to boat
          const relX = wp.x - boat.position.x;
          const relY = wp.y - boat.position.y;
          if (Math.abs(relX) > 22 || Math.abs(relY) > 25 || wp.life <= 0) {
            wp.x = boat.position.x - normWind.x * 22 + (Math.random() - 0.5) * 25;
            wp.y = boat.position.y - normWind.y * 25 + (Math.random() - 0.5) * 25;
            wp.life = 0.8 + Math.random() * 0.4;
          }
        }
      }
    }

    // 3. Update Breadcrumb Trail
    this.trailTimer += dt;
    if (this.trailTimer > 0.15) {
      this.trailTimer = 0;
      this.trailPoints.push({
        x: boat.position.x,
        y: boat.position.y,
        heading: boat.heading,
        speed: boat.velocity.length(),
      });
      if (this.trailPoints.length > this.maxTrailPoints) {
        this.trailPoints.shift();
      }
    }
  }

  clearTrail() {
    this.trailPoints = [];
  }

  renderTrail(ctx) {
    if (this.trailPoints.length < 2) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(this.trailPoints[0].x, this.trailPoints[0].y);
    for (let i = 1; i < this.trailPoints.length; i++) {
      ctx.lineTo(this.trailPoints[i].x, this.trailPoints[i].y);
    }
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.35)';
    ctx.lineWidth = 0.08;
    ctx.setLineDash([0.3, 0.3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  renderPropWash(ctx) {
    ctx.save();
    for (const p of this.propWashParticles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(225, 245, 254, ${p.life * 0.6})`;
      ctx.fill();
    }
    ctx.restore();
  }

  renderWindStreamers(ctx, env) {
    if (!env || env.windSpeedKnots < 1.0) return;
    const windVel = env.getWindVelocityWorld();
    const windSpeed = windVel.length();
    const norm = Vector2.divideScalar(windVel, windSpeed);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 0.04;
    for (const wp of this.windParticles) {
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y);
      ctx.lineTo(wp.x + norm.x * wp.length, wp.y + norm.y * wp.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Visualizes active physics force vectors for pedagogical insight.
   */
  renderForceVectors(ctx, boat, mooringLines = []) {
    ctx.save();
    const pos = boat.position;
    const diag = boat.diagnostics;

    // Helper to draw an arrow with label
    const drawVectorArrow = (origin, vec, scale, color, label) => {
      const len = vec.length();
      if (len * scale < 0.2) return;
      const end = Vector2.add(origin, Vector2.multiplyScalar(vec, scale));
      
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.08;
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(end.y - origin.y, end.x - origin.x);
      const headLen = 0.35;
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLen * Math.cos(angle - Math.PI / 6),
        end.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        end.x - headLen * Math.cos(angle + Math.PI / 6),
        end.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Text label (counter-invert Y so text is upright)
      ctx.save();
      ctx.translate(end.x + 0.2, end.y);
      ctx.scale(1, -1);
      ctx.font = 'bold 0.45px sans-serif';
      ctx.fillStyle = color;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    };

    // 1. Course Over Ground (COG / SOG)
    if (boat.velocity.length() > 0.05) {
      drawVectorArrow(pos, boat.velocity, 2.5, '#00e5ff', `SOG ${diag.sogKnots.toFixed(1)}kt`);
    }

    // 2. Beta 25 Engine Thrust
    if (Math.abs(diag.thrustForce) > 20) {
      const fwd = boat.getForwardVector();
      const thrustVec = Vector2.multiplyScalar(fwd, diag.thrustForce);
      const propPos = boat.localToWorld(new Vector2(0, -4.5));
      drawVectorArrow(propPos, thrustVec, 0.0018, '#00e676', `Thrust ${Math.round(diag.thrustForce)}N`);
    }

    // 3. Prop Walk Transverse Force (in reverse)
    if (diag.propWalkForce > 20) {
      const stbd = boat.getStarboardVector();
      const walkVec = Vector2.multiplyScalar(stbd, -diag.propWalkForce);
      const propPos = boat.localToWorld(new Vector2(0, -4.5));
      drawVectorArrow(propPos, walkVec, 0.004, '#ff9100', `Prop Walk ${Math.round(diag.propWalkForce)}N`);
    }

    // 4. Rudder Lift Force
    if (Math.abs(diag.rudderLiftForce) > 20) {
      const stbd = boat.getStarboardVector();
      const rudderLiftVec = Vector2.multiplyScalar(stbd, -diag.rudderLiftForce);
      const rudderPos = boat.localToWorld(new Vector2(0, -4.85));
      drawVectorArrow(rudderPos, rudderLiftVec, 0.002, '#e040fb', `Rudder ${Math.round(diag.rudderLiftForce)}N`);
    }

    // 5. Wind Force on Hull
    if (diag.windForceVector.length() > 30) {
      const cePos = boat.localToWorld(new Vector2(0, boat.specs.ceOffset));
      drawVectorArrow(cePos, diag.windForceVector, 0.0015, '#40c4ff', `Wind Force ${Math.round(diag.windForceVector.length())}N`);
    }

    // 6. Mooring Line Tension Vectors at Cleats
    for (const line of mooringLines) {
      if (line.isTaut && line.tension > 10) {
        const lineDir = Vector2.sub(line.dockPos, line.boatCleatWorldPos).normalize();
        const tensionVec = Vector2.multiplyScalar(lineDir, line.tension);
        drawVectorArrow(line.boatCleatWorldPos, tensionVec, 0.0005, '#ff5252', `${Math.round(line.tension * 0.2248)} lbf`);
      }
    }

    ctx.restore();
  }
}
