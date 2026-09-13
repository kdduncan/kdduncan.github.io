/**
 * Manages Environment controls (Wind & Current speed and direction)
 * and weather scenario presets.
 */
export class EnvironmentUI {
  constructor(env, onUpdate = () => {}) {
    this.env = env;
    this.onUpdate = onUpdate;

    this.initElements();
    this.bindEvents();
    this.updateDisplay();
  }

  initElements() {
    this.windSpeedInput = document.getElementById('wind-speed');
    this.windSpeedVal = document.getElementById('wind-speed-val');
    this.windDirInput = document.getElementById('wind-dir');
    this.windDirVal = document.getElementById('wind-dir-val');
    this.windCompassNeedle = document.getElementById('wind-compass-needle');

    this.currentSpeedInput = document.getElementById('current-speed');
    this.currentSpeedVal = document.getElementById('current-speed-val');
    this.currentDirInput = document.getElementById('current-dir');
    this.currentDirVal = document.getElementById('current-dir-val');
    this.currentCompassNeedle = document.getElementById('current-compass-needle');
  }

  bindEvents() {
    if (this.windSpeedInput) {
      this.windSpeedInput.addEventListener('input', (e) => {
        this.env.setWind(parseFloat(e.target.value), this.env.windDirectionDeg);
        this.updateDisplay();
        this.onUpdate();
      });
    }

    if (this.windDirInput) {
      this.windDirInput.addEventListener('input', (e) => {
        this.env.setWind(this.env.windSpeedKnots, parseFloat(e.target.value));
        this.updateDisplay();
        this.onUpdate();
      });
    }

    if (this.currentSpeedInput) {
      this.currentSpeedInput.addEventListener('input', (e) => {
        this.env.setCurrent(parseFloat(e.target.value), this.env.currentDirectionDeg);
        this.updateDisplay();
        this.onUpdate();
      });
    }

    if (this.currentDirInput) {
      this.currentDirInput.addEventListener('input', (e) => {
        this.env.setCurrent(this.env.currentSpeedKnots, parseFloat(e.target.value));
        this.updateDisplay();
        this.onUpdate();
      });
    }
  }

  updateDisplay() {
    if (this.windSpeedVal) this.windSpeedVal.textContent = `${this.env.windSpeedKnots.toFixed(0)} kts`;
    if (this.windSpeedInput) this.windSpeedInput.value = this.env.windSpeedKnots;

    const windCardinal = this.getCardinal(this.env.windDirectionDeg);
    if (this.windDirVal) this.windDirVal.textContent = `${this.env.windDirectionDeg.toFixed(0)}° (${windCardinal})`;
    if (this.windDirInput) this.windDirInput.value = this.env.windDirectionDeg;
    if (this.windCompassNeedle) {
      this.windCompassNeedle.style.transform = `rotate(${this.env.windDirectionDeg}deg)`;
    }

    if (this.currentSpeedVal) this.currentSpeedVal.textContent = `${this.env.currentSpeedKnots.toFixed(1)} kts`;
    if (this.currentSpeedInput) this.currentSpeedInput.value = this.env.currentSpeedKnots;

    const currentCardinal = this.getCardinal(this.env.currentDirectionDeg);
    if (this.currentDirVal) this.currentDirVal.textContent = `${this.env.currentDirectionDeg.toFixed(0)}° (${currentCardinal})`;
    if (this.currentDirInput) this.currentDirInput.value = this.env.currentDirectionDeg;
    if (this.currentCompassNeedle) {
      this.currentCompassNeedle.style.transform = `rotate(${this.env.currentDirectionDeg}deg)`;
    }
  }

  getCardinal(deg) {
    const val = (deg % 360 + 360) % 360;
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const idx = Math.round(val / 45) % 8;
    return directions[idx];
  }

  applyPreset(presetKey) {
    switch (presetKey) {
      case 'calm':
        this.env.setWind(0, 0);
        this.env.setCurrent(0, 0);
        break;
      case 'port_crosswind': // Blowing FROM West (270°), pushes boat to East (off the port finger pier)
        this.env.setWind(15, 270);
        this.env.setCurrent(0.3, 0);
        break;
      case 'starboard_crosswind': // Blowing FROM East (90°), pushes boat to West (onto port finger pier)
        this.env.setWind(15, 90);
        this.env.setCurrent(0.2, 0);
        break;
      case 'headwind': // Blowing FROM North (0°), blowing straight out of the slip
        this.env.setWind(18, 0);
        this.env.setCurrent(0.4, 180);
        break;
      case 'tailwind': // Blowing FROM South (180°), blowing into the slip
        this.env.setWind(14, 180);
        this.env.setCurrent(0.5, 0);
        break;
      case 'strong_current': // Strong flood current setting across slip entrance
        this.env.setWind(8, 270);
        this.env.setCurrent(1.8, 90); // 1.8 kts setting to East
        break;
      case 'gale_test': // Heavy wind test for lines in slip
        this.env.setWind(28, 290);
        this.env.setCurrent(0.8, 45);
        break;
    }
    this.updateDisplay();
    this.onUpdate();
  }
}
