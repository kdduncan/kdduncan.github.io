/**
 * Telemetry HUD: Real-time Multi-Function Display (MFD) instruments,
 * status indicators, view toggles, and nautical coaching tips.
 */
export class TelemetryHUD {
  constructor(boat, env, mooringLines, renderer) {
    this.boat = boat;
    this.env = env;
    this.mooringLines = mooringLines;
    this.renderer = renderer;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.sogEl = document.getElementById('hud-sog');
    this.stwEl = document.getElementById('hud-stw');
    this.hdgEl = document.getElementById('hud-hdg');
    this.cogEl = document.getElementById('hud-cog');
    this.rpmEl = document.getElementById('hud-rpm');
    this.rudderAngleEl = document.getElementById('hud-rudder-val');
    this.rudderBarEl = document.getElementById('hud-rudder-bar');
    this.gearEl = document.getElementById('hud-gear');
    this.throttlePercentEl = document.getElementById('hud-throttle-percent');
    this.coachBannerEl = document.getElementById('coach-tip-text');

    this.toggleVectorsBtn = document.getElementById('toggle-vectors');
    this.toggleTrailBtn = document.getElementById('toggle-trail');
    this.cameraModeSelect = document.getElementById('camera-mode-select');
  }

  bindEvents() {
    if (this.toggleVectorsBtn) {
      this.toggleVectorsBtn.addEventListener('click', () => {
        this.renderer.showVectors = !this.renderer.showVectors;
        this.toggleVectorsBtn.classList.toggle('active', this.renderer.showVectors);
      });
    }

    if (this.toggleTrailBtn) {
      this.toggleTrailBtn.addEventListener('click', () => {
        this.renderer.showTrail = !this.renderer.showTrail;
        this.toggleTrailBtn.classList.toggle('active', this.renderer.showTrail);
      });
    }

    if (this.cameraModeSelect) {
      this.cameraModeSelect.addEventListener('change', (e) => {
        this.renderer.setCameraMode(e.target.value);
      });
    }
  }

  update() {
    const boat = this.boat;
    const diag = boat.diagnostics;

    // Numerical instruments
    if (this.sogEl) this.sogEl.textContent = diag.sogKnots.toFixed(1);
    if (this.stwEl) this.stwEl.textContent = diag.stwKnots.toFixed(1);
    if (this.hdgEl) this.hdgEl.textContent = `${Math.round(diag.headingDeg).toString().padStart(3, '0')}°`;
    if (this.cogEl) {
      this.cogEl.textContent = diag.sogKnots > 0.08 ? `${Math.round(diag.cogDeg).toString().padStart(3, '0')}°` : '---°';
    }
    if (this.rpmEl) this.rpmEl.textContent = `${Math.round(boat.currentRpm)} RPM`;

    // Rudder Display
    if (this.rudderAngleEl) {
      const angle = Math.round(boat.rudderAngleDeg);
      const dir = angle < 0 ? 'P' : (angle > 0 ? 'S' : '');
      this.rudderAngleEl.textContent = `${Math.abs(angle)}° ${dir}`;
    }
    if (this.rudderBarEl) {
      // Percentage from center: -35 (Port) -> 0% to +35 (Starboard) -> 100%
      const pct = 50 + (boat.rudderAngleDeg / 35) * 50;
      this.rudderBarEl.style.width = `${Math.abs(boat.rudderAngleDeg / 35) * 50}%`;
      this.rudderBarEl.style.left = boat.rudderAngleDeg >= 0 ? '50%' : `${pct}%`;
      this.rudderBarEl.style.backgroundColor = boat.rudderAngleDeg < 0 ? '#ef5350' : '#66bb6a';
    }

    // Gear & Throttle Display
    if (this.gearEl) {
      let gear = 'NEUTRAL';
      let gearClass = 'neutral';
      if (boat.throttle > 0.03) {
        gear = 'FORWARD';
        gearClass = 'fwd';
      } else if (boat.throttle < -0.03) {
        gear = 'REVERSE';
        gearClass = 'rev';
      }
      this.gearEl.textContent = gear;
      this.gearEl.className = `gear-badge ${gearClass}`;
    }

    if (this.throttlePercentEl) {
      const pct = Math.round(Math.abs(boat.throttle) * 100);
      this.throttlePercentEl.textContent = `${pct}%`;
    }

    // Real-time Skipper Coaching Insight
    this.updateCoachInsight();
  }

  updateCoachInsight() {
    if (!this.coachBannerEl) return;
    const boat = this.boat;
    const diag = boat.diagnostics;
    const env = this.env;

    // Check spring line condition
    const hasActiveSpring = this.mooringLines.some(l => l.isTaut && l.boatCleatId === 'mid_port');
    if (hasActiveSpring && boat.throttle > 0.1) {
      this.coachBannerEl.innerHTML = `<strong>Springing onto Pier:</strong> Motoring forward against the Port Midship spring line brings the stern snugly in against the short finger pier!`;
      return;
    }

    // Check reverse prop walk
    if (boat.throttle < -0.15 && Math.abs(boat.angularVelocity) > 0.003) {
      this.coachBannerEl.innerHTML = `<strong>Prop Walk Active:</strong> The Beta 25 right-hand propeller transverse paddlewheel effect is walking your stern to <strong>PORT</strong>. Expect bow to swing Starboard until sternway is established!`;
      return;
    }

    // Check forward prop wash
    if (boat.throttle > 0.25 && diag.sogKnots < 0.6 && Math.abs(boat.rudderAngleDeg) > 10) {
      this.coachBannerEl.innerHTML = `<strong>Prop Wash Steering:</strong> Forward propeller slipstream is flowing over the spade rudder blade, generating turn authority before the boat gains speed.`;
      return;
    }

    // Check bow blow-off
    if (env && env.windSpeedKnots > 8 && diag.sogKnots < 0.4 && Math.abs(diag.windForceVector.x) > 150) {
      this.coachBannerEl.innerHTML = `<strong>Bow Blow-Off:</strong> Because the Beneteau 331 has high bow topsides and no bow thruster, crosswind will blow your bow downwind when stopped. Maintain gentle headway to preserve steerage!`;
      return;
    }

    // Check slip entrance approach
    if (boat.position.y > -2 && boat.position.y < 12) {
      if (diag.sogKnots > 2.0) {
        this.coachBannerEl.innerHTML = `<strong>Speed Caution:</strong> ${diag.sogKnots.toFixed(1)} kts is brisk inside the slip. Remember: <em>"Never approach a dock faster than you are willing to hit it."</em>`;
        return;
      } else {
        this.coachBannerEl.innerHTML = `<strong>Slip Maneuver:</strong> Align along the port finger pier. Note that the finger extends only ~1/3 length; use the outer pilings and midship cleat to control your drift.`;
        return;
      }
    }

    // Default fairway tip
    this.coachBannerEl.innerHTML = `<strong>Fairway Approach:</strong> Line up into the slip. Use W/S for throttle, A/D for wheel. Click cleats to tie mooring lines to pilings or finger pier.`;
  }
}
