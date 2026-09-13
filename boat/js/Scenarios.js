import { INITIAL_CONDITIONS, DOCK_CONFIG } from './config.js';

/**
 * Scenarios manager for pre-configured docking drills and slip stress tests.
 */
export class Scenarios {
  constructor(boat, env, lineManager, renderer, telemetryHUD) {
    this.boat = boat;
    this.env = env;
    this.lineManager = lineManager;
    this.renderer = renderer;
    this.telemetryHUD = telemetryHUD;

    this.bindButtons();
  }

  bindButtons() {
    const scenarioSelect = document.getElementById('scenario-select');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', (e) => {
        this.loadScenario(e.target.value);
      });
    }

    const resetApproachBtn = document.getElementById('btn-reset-approach');
    if (resetApproachBtn) {
      resetApproachBtn.addEventListener('click', () => this.loadScenario('calm_approach'));
    }

    const resetSlipBtn = document.getElementById('btn-reset-slip');
    if (resetSlipBtn) {
      resetSlipBtn.addEventListener('click', () => this.loadScenario('tied_in_slip'));
    }
  }

  loadScenario(scenarioId) {
    this.renderer.effectsRenderer.clearTrail();

    switch (scenarioId) {
      case 'calm_approach':
        // Approach right outside slip entrance (outer pilings at y = 0.5), heading North
        this.boat.resetTo(0, -4.5, 0, 1.0);
        this.boat.setThrottle(0.20);
        this.boat.setRudder(0);
        this.env.setWind(0, 0);
        this.env.setCurrent(0, 0);
        this.lineManager.clearAllLines();
        this.renderer.setCameraMode('follow');
        break;

      case 'port_crosswind':
        // 15 kt crosswind from port (West, 270°) pushing boat away from the short finger pier
        this.boat.resetTo(-0.8, -4.5, 4, 1.2);
        this.boat.setThrottle(0.25);
        this.boat.setRudder(0);
        this.env.setWind(15, 270);
        this.env.setCurrent(0.3, 0);
        this.lineManager.clearAllLines();
        this.renderer.setCameraMode('follow');
        break;

      case 'starboard_crosswind':
        // 15 kt crosswind from starboard (East, 90°) pushing boat onto finger pier
        this.boat.resetTo(0.8, -4.5, -4, 1.2);
        this.boat.setThrottle(0.22);
        this.boat.setRudder(0);
        this.env.setWind(15, 90);
        this.env.setCurrent(0.3, 0);
        this.lineManager.clearAllLines();
        this.renderer.setCameraMode('follow');
        break;

      case 'spring_line_drill':
        // Boat in slip alongside the 1/3 finger pier, with midship spring line attached
        this.boat.resetTo(-0.6, 7.0, 0, 0);
        this.boat.setThrottle(0.15); // Forward idle against spring
        this.boat.setRudder(15); // Wheel turned away from dock to snug stern
        this.env.setWind(10, 270);
        this.env.setCurrent(0, 0);
        this.lineManager.applyPresetSpring();
        this.renderer.setCameraMode('dock');
        break;

      case 'tied_in_slip':
        // Boat tied securely in the slip with standard lines
        this.boat.resetTo(-0.6, 7.0, 0, 0);
        this.boat.setThrottle(0);
        this.boat.setRudder(0);
        this.env.setWind(12, 270);
        this.env.setCurrent(0.4, 0);
        this.lineManager.applyPresetFull();
        this.renderer.setCameraMode('dock');
        break;

      case 'backing_out':
        // Backing out from slip into fairway - tests reverse prop walk handling
        this.boat.resetTo(-0.6, 8.5, 0, 0);
        this.boat.setThrottle(-0.35);
        this.boat.setRudder(0);
        this.env.setWind(8, 270);
        this.env.setCurrent(0, 0);
        this.lineManager.clearAllLines();
        this.renderer.setCameraMode('follow');
        break;
    }

    // Immediately snap camera to frame boat and slip
    this.renderer.cameraPos.set(this.boat.position.x * 0.4, (this.boat.position.y + 11) * 0.5);

    // Refresh UI components
    if (this.envUI) this.envUI.updateDisplay();
    this.telemetryHUD.update();
    if (this.onScenarioLoaded) this.onScenarioLoaded();
  }

  setEnvUI(envUI) {
    this.envUI = envUI;
  }
}
