/**
 * Helm Controls: Interactive Steering Wheel and Single-Lever Morse Throttle
 * with keyboard support (W/S/A/D, Arrows) and Web Audio engine sounds.
 */
export class HelmControls {
  constructor(boat, onUpdate = () => {}) {
    this.boat = boat;
    this.onUpdate = onUpdate;

    this.rudderTarget = 0;
    this.throttleTarget = 0;
    this.audioEnabled = false;
    this.audioCtx = null;
    this.engineOsc = null;
    this.engineGain = null;

    this.keysDown = {};
    this.initKeyboard();
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

      this.keysDown[e.key.toLowerCase()] = true;
      this.keysDown[e.code] = true;

      // Quick-center wheel on Space
      if (e.code === 'Space') {
        this.centerWheel();
        e.preventDefault();
      }

      // Quick Neutral on N
      if (e.code === 'KeyN' || e.key.toLowerCase() === 'n') {
        this.setThrottle(0);
        e.preventDefault();
      }

      // Shift Forward by hitting W or ArrowUp
      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.key.toLowerCase() === 'w') {
        this.stepThrottle(1);
        e.preventDefault();
      }

      // Shift Neutral / Reverse by hitting S or ArrowDown
      if (e.code === 'KeyS' || e.code === 'ArrowDown' || e.key.toLowerCase() === 's') {
        this.stepThrottle(-1);
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown[e.key.toLowerCase()] = false;
      this.keysDown[e.code] = false;
    });
  }

  stepThrottle(dir) {
    // Marine single-lever Morse throttle detents:
    // Full Rev (-1.0), 3/4 Rev (-0.75), Half Rev (-0.50), Slow Rev / Walk (-0.25), Neutral (0.0),
    // Slow Ahead (+0.20), Half Ahead (+0.40), Cruising (+0.65), Full Ahead (+1.0)
    const detents = [-1.0, -0.75, -0.50, -0.25, 0.0, 0.20, 0.40, 0.65, 1.0];
    const current = Math.round(this.throttleTarget * 100) / 100;

    let target;
    if (dir > 0) {
      target = detents.find(d => d > current + 0.04);
      if (target === undefined) target = 1.0;
    } else {
      const reversed = [...detents].reverse();
      target = reversed.find(d => d < current - 0.04);
      if (target === undefined) target = -1.0;
    }

    this.setThrottle(target);
  }

  update(dt) {
    const boat = this.boat;
    let rudderChanged = false;

    // Keyboard Steering: A / D or Left / Right
    const steerRate = 45 * dt; // 45 degrees per second
    if (this.keysDown['a'] || this.keysDown['arrowleft']) {
      this.rudderTarget = Math.max(-boat.specs.rudder.maxAngleDeg, this.rudderTarget - steerRate);
      rudderChanged = true;
    }
    if (this.keysDown['d'] || this.keysDown['arrowright']) {
      this.rudderTarget = Math.min(boat.specs.rudder.maxAngleDeg, this.rudderTarget + steerRate);
      rudderChanged = true;
    }

    // Apply to boat
    boat.setRudder(this.rudderTarget);
    boat.setThrottle(this.throttleTarget);

    // Update audio synthesis if enabled
    this.updateAudio(boat.currentRpm, boat.throttle);

    if (rudderChanged) {
      this.onUpdate();
    }
  }

  setRudder(angleDeg) {
    this.rudderTarget = Math.max(-this.boat.specs.rudder.maxAngleDeg, 
                        Math.min(this.boat.specs.rudder.maxAngleDeg, angleDeg));
    this.boat.setRudder(this.rudderTarget);
    this.onUpdate();
  }

  centerWheel() {
    this.rudderTarget = 0;
    this.boat.setRudder(0);
    this.onUpdate();
  }

  setThrottle(value) {
    // Neutral detent snapping (-0.05 to +0.05 snaps to 0)
    let val = value;
    if (Math.abs(val) < 0.05) {
      val = 0;
    }
    this.throttleTarget = Math.max(-1.0, Math.min(1.0, val));
    this.boat.setThrottle(this.throttleTarget);
    this.onUpdate();
  }

  toggleAudio() {
    this.audioEnabled = !this.audioEnabled;
    if (this.audioEnabled) {
      this.initAudio();
    } else if (this.audioCtx) {
      this.audioCtx.suspend();
    }
    return this.audioEnabled;
  }

  initAudio() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
        
        // Low-frequency diesel rumble oscillator
        this.engineOsc = this.audioCtx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.setValueAtTime(32, this.audioCtx.currentTime);

        // Low-pass filter for diesel exhaust throb
        this.engineFilter = this.audioCtx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.setValueAtTime(140, this.audioCtx.currentTime);

        this.engineGain = this.audioCtx.createGain();
        this.engineGain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);

        this.engineOsc.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.audioCtx.destination);
        this.engineOsc.start();
      } else {
        this.audioCtx.resume();
      }
    } catch (e) {
      console.warn("Web Audio API not supported or blocked", e);
    }
  }

  updateAudio(rpm, throttle) {
    if (!this.audioEnabled || !this.audioCtx || !this.engineOsc) return;
    // Map RPM 850 - 3200 to oscillator pitch 28 Hz - 75 Hz
    const pitch = 28 + (rpm - 850) * 0.02;
    this.engineOsc.frequency.setTargetAtTime(pitch, this.audioCtx.currentTime, 0.1);

    // Gain increases under load
    const loadVolume = 0.04 + Math.abs(throttle) * 0.07;
    this.engineGain.gain.setTargetAtTime(loadVolume, this.audioCtx.currentTime, 0.1);
  }
}
