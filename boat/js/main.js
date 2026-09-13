import { BoatPhysics } from './BoatPhysics.js';
import { Environment } from './Environment.js';
import { CollisionSystem } from './Collision.js';
import { Renderer } from './Renderer.js';
import { HelmControls } from './HelmControls.js';
import { EnvironmentUI } from './EnvironmentUI.js';
import { LineManagerUI } from './LineManagerUI.js';
import { TelemetryHUD } from './TelemetryHUD.js';
import { Scenarios } from './Scenarios.js';
import { INITIAL_CONDITIONS, DOCK_CONFIG, BOAT_SPECS } from './config.js';
import { Vector2 } from './Vector2.js';

class App {
  constructor() {
    this.canvas = document.getElementById('sim-canvas');
    
    // Core simulation state
    this.boat = new BoatPhysics(INITIAL_CONDITIONS.approach);
    this.boat.setThrottle(INITIAL_CONDITIONS.approach.throttle);
    this.env = new Environment();
    this.collision = new CollisionSystem();
    this.mooringLines = [];
    this.selectedCleat = null; // { type: 'boat'|'dock', id, name, worldPos, x, y }

    // Simulation timing & speed
    this.simSpeed = 1.0; // 0 = paused, 0.5 = slow-mo, 1.0 = normal, 2.0 = fast
    this.isPaused = false;
    this.lastTime = performance.now();

    // Render & UI components
    this.renderer = new Renderer(this.canvas);
    this.helm = new HelmControls(this.boat, () => this.onHelmInput());
    this.envUI = new EnvironmentUI(this.env, () => {});
    this.lineManager = new LineManagerUI(this.boat, this.mooringLines, () => {});
    this.telemetryHUD = new TelemetryHUD(this.boat, this.env, this.mooringLines, this.renderer);
    this.scenarios = new Scenarios(this.boat, this.env, this.lineManager, this.renderer, this.telemetryHUD);
    this.scenarios.setEnvUI(this.envUI);
    this.scenarios.onScenarioLoaded = () => {
      this.onHelmInput();
    };

    this.bindCanvasEvents();
    this.bindControlPanels();
    this.bindWheelWidget();
    this.bindGlobalKeyboard();

    // Initial camera framing: guarantees boat and slip are centered and visible on startup
    this.renderer.fitView(this.boat);

    // Initial UI synchronization
    this.onHelmInput();
    this.updatePauseUI();

    // Start simulation loop
    requestAnimationFrame((t) => this.loop(t));
  }

  onHelmInput() {
    // 1. Update Rudder Slider & Text
    const rudderSlider = document.getElementById('rudder-slider');
    if (rudderSlider) rudderSlider.value = this.boat.rudderAngleDeg;

    const rudderAngleVal = document.getElementById('rudder-angle-val');
    if (rudderAngleVal) {
      const deg = Math.round(this.boat.rudderAngleDeg);
      if (deg === 0) {
        rudderAngleVal.textContent = '0° (Center)';
        rudderAngleVal.style.color = '#ffffff';
      } else if (deg < 0) {
        rudderAngleVal.textContent = `${Math.abs(deg)}° Port`;
        rudderAngleVal.style.color = '#ef5350';
      } else {
        rudderAngleVal.textContent = `${deg}° Starboard`;
        rudderAngleVal.style.color = '#66bb6a';
      }
    }

    // 2. Rotate SVG Helm Wheel Graphic
    const wheelGraphic = document.getElementById('helm-wheel-graphic');
    if (wheelGraphic) {
      const wheelAngle = this.boat.rudderAngleDeg * 3.5;
      wheelGraphic.style.transform = `rotate(${wheelAngle}deg)`;
    }

    // 3. Update Throttle Slider & Text
    const throttleSlider = document.getElementById('throttle-slider');
    if (throttleSlider) throttleSlider.value = this.boat.throttle;

    const throttleDisplayVal = document.getElementById('throttle-display-val');
    if (throttleDisplayVal) {
      const pct = Math.round(Math.abs(this.boat.throttle) * 100);
      if (Math.abs(this.boat.throttle) < 0.03) {
        throttleDisplayVal.textContent = 'NEUTRAL (0%)';
        throttleDisplayVal.style.color = '#ffd600';
      } else if (this.boat.throttle > 0) {
        throttleDisplayVal.textContent = `FORWARD (${pct}%)`;
        throttleDisplayVal.style.color = '#00e676';
      } else {
        throttleDisplayVal.textContent = `REVERSE (${pct}%)`;
        throttleDisplayVal.style.color = '#ff5252';
      }
    }
  }

  bindWheelWidget() {
    const wheel = document.getElementById('helm-wheel-graphic');
    if (!wheel) return;

    let isDragging = false;
    let lastClientX = 0;
    let lastClientY = 0;
    let dragDistTotal = 0;

    // Use Pointer Events for unified mouse, touch, and trackpad drag
    wheel.addEventListener('pointerdown', (e) => {
      isDragging = true;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      dragDistTotal = 0;
      wheel.style.cursor = 'grabbing';
      try {
        wheel.setPointerCapture(e.pointerId);
      } catch (_) {}
      e.preventDefault();
    });

    wheel.addEventListener('pointermove', (e) => {
      if (!isDragging) return;

      const dx = e.clientX - lastClientX;
      const dy = e.clientY - lastClientY;
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      dragDistTotal += Math.hypot(dx, dy);

      // Wheel geometry
      const rect = wheel.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rx = e.clientX - cx;
      const ry = e.clientY - cy;
      const r = Math.hypot(rx, ry);

      // Compute tangential displacement around wheel center (clockwise = positive)
      let tangentDelta = 0;
      if (r > 12) {
        // Tangent unit vector pointing clockwise: (-ry/r, rx/r)
        tangentDelta = (-dx * ry + dy * rx) / r;
      }

      // Blend tangential circular drag with horizontal scrub
      // Dragging right turns starboard, dragging left turns port, and circular drag works everywhere!
      const effectiveDelta = 0.65 * tangentDelta + 0.35 * dx;

      // Sensitivity: ~0.45 degrees of rudder per pixel of movement
      const deltaRudderDeg = effectiveDelta * 0.45;
      const newRudder = this.boat.rudderAngleDeg + deltaRudderDeg;

      this.helm.setRudder(newRudder);
      this.onHelmInput();
    });

    const endDrag = (e) => {
      if (!isDragging) return;
      isDragging = false;
      wheel.style.cursor = 'ew-resize';
      try {
        wheel.releasePointerCapture(e.pointerId);
      } catch (_) {}

      // If user clicked without dragging (distance < 5px):
      if (dragDistTotal < 5) {
        const rect = wheel.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const rx = e.clientX - cx;
        const ry = e.clientY - cy;

        if (Math.hypot(rx, ry) < 16) {
          // Center hub clicked -> center rudder
          this.helm.centerWheel();
        } else if (rx > 0) {
          // Clicked right side of wheel -> nudge starboard +5°
          this.helm.setRudder(this.boat.rudderAngleDeg + 5);
        } else {
          // Clicked left side of wheel -> nudge port -5°
          this.helm.setRudder(this.boat.rudderAngleDeg - 5);
        }
        this.onHelmInput();
      }
    };

    wheel.addEventListener('pointerup', endDrag);
    wheel.addEventListener('pointercancel', endDrag);

    // Double-click wheel: instant center
    wheel.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.helm.centerWheel();
      this.onHelmInput();
    });

    // Mouse wheel scroll on the steering wheel: quick adjustment
    wheel.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 3 : -3;
      this.helm.setRudder(this.boat.rudderAngleDeg + step);
      this.onHelmInput();
    }, { passive: false });
  }

  bindControlPanels() {
    // Wheel / Rudder Slider
    const rudderSlider = document.getElementById('rudder-slider');
    if (rudderSlider) {
      rudderSlider.addEventListener('input', (e) => {
        this.helm.setRudder(parseFloat(e.target.value));
        this.onHelmInput();
      });
    }

    // All Rudder Quick Buttons (Center, Port 15, Stbd 15, Hard Port/Stbd)
    document.querySelectorAll('.btn-rudder-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.rudder);
        if (val === 0) {
          this.helm.centerWheel();
        } else {
          this.helm.setRudder(val);
        }
        this.onHelmInput();
      });
    });

    // Morse Throttle Slider
    const throttleSlider = document.getElementById('throttle-slider');
    if (throttleSlider) {
      throttleSlider.addEventListener('input', (e) => {
        this.helm.setThrottle(parseFloat(e.target.value));
        this.onHelmInput();
      });
    }

    // All Throttle Quick Buttons (Neutral, Slow, Rev, Full)
    document.querySelectorAll('.btn-throttle-quick').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.throttle);
        this.helm.setThrottle(val);
        this.onHelmInput();
      });
    });

    // Camera Mode Dropdown Select
    const cameraSelect = document.getElementById('camera-mode-select');
    if (cameraSelect) {
      cameraSelect.value = this.renderer.cameraMode;
      cameraSelect.addEventListener('change', (e) => {
        this.renderer.setCameraMode(e.target.value);
      });
    }

    // Camera Navigation Buttons: Locate Boat & Fit View
    const locateBoatBtn = document.getElementById('btn-locate-boat');
    if (locateBoatBtn) {
      locateBoatBtn.addEventListener('click', () => {
        this.renderer.centerOnBoat(this.boat);
        if (cameraSelect) cameraSelect.value = 'follow';
      });
    }

    const fitViewBtn = document.getElementById('btn-fit-view');
    if (fitViewBtn) {
      fitViewBtn.addEventListener('click', () => {
        this.renderer.fitView(this.boat);
        if (cameraSelect) cameraSelect.value = 'dock';
      });
    }

    // Canvas Quick Navigation Toolbar Buttons
    const quickBoat = document.getElementById('btn-quick-boat');
    if (quickBoat) {
      quickBoat.addEventListener('click', () => {
        this.renderer.centerOnBoat(this.boat);
        if (cameraSelect) cameraSelect.value = 'follow';
      });
    }

    const quickDock = document.getElementById('btn-quick-dock');
    if (quickDock) {
      quickDock.addEventListener('click', () => {
        this.renderer.setCameraMode('dock');
        if (cameraSelect) cameraSelect.value = 'dock';
      });
    }

    const quickFit = document.getElementById('btn-quick-fit');
    if (quickFit) {
      quickFit.addEventListener('click', () => {
        this.renderer.fitView(this.boat);
        if (cameraSelect) cameraSelect.value = 'dock';
      });
    }

    const quickReset = document.getElementById('btn-quick-reset');
    if (quickReset) {
      quickReset.addEventListener('click', () => {
        this.scenarios.loadScenario('calm_approach');
        this.onHelmInput();
        if (cameraSelect) cameraSelect.value = 'dock';
      });
    }

    // Toggle Vectors & Trail Buttons
    const toggleVectorsBtn = document.getElementById('toggle-vectors');
    if (toggleVectorsBtn) {
      toggleVectorsBtn.addEventListener('click', () => {
        this.renderer.showVectors = !this.renderer.showVectors;
        toggleVectorsBtn.textContent = `Force Vectors: ${this.renderer.showVectors ? 'ON' : 'OFF'}`;
        toggleVectorsBtn.classList.toggle('active', this.renderer.showVectors);
      });
    }

    const toggleTrailBtn = document.getElementById('toggle-trail');
    if (toggleTrailBtn) {
      toggleTrailBtn.addEventListener('click', () => {
        this.renderer.showTrail = !this.renderer.showTrail;
        toggleTrailBtn.textContent = `Path Trail: ${this.renderer.showTrail ? 'ON' : 'OFF'}`;
        toggleTrailBtn.classList.toggle('active', this.renderer.showTrail);
      });
    }

    // Weather Preset Buttons
    document.querySelectorAll('.btn-weather-preset').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const preset = e.currentTarget.dataset.preset;
        this.envUI.applyPreset(preset);
      });
    });

    // Sim Speed Controls
    const pauseBtn = document.getElementById('btn-sim-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', () => this.togglePause());
    }

    const quickPause = document.getElementById('btn-quick-pause');
    if (quickPause) {
      quickPause.addEventListener('click', () => this.togglePause());
    }

    document.querySelectorAll('.btn-sim-speed').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-sim-speed').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.simSpeed = parseFloat(e.currentTarget.dataset.speed);
      });
    });

    // Sound toggle
    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const enabled = this.helm.toggleAudio();
        soundBtn.textContent = enabled ? '🔊 Sound: ON' : '🔇 Sound: OFF';
        soundBtn.classList.toggle('active', enabled);
      });
    }

    // Help / Quick Tutorial modal toggle
    const helpBtn = document.getElementById('btn-help');
    const helpModal = document.getElementById('help-modal');
    const closeHelpBtn = document.getElementById('btn-close-help');
    if (helpBtn && helpModal) {
      helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
    }
    if (closeHelpBtn && helpModal) {
      closeHelpBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
    }
  }

  bindGlobalKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'KeyP' || e.key.toLowerCase() === 'p') {
        this.togglePause();
        e.preventDefault();
      }
    });
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    this.renderer.isPaused = this.isPaused;
    this.updatePauseUI();
  }

  updatePauseUI() {
    const pauseBtn = document.getElementById('btn-sim-pause');
    if (pauseBtn) {
      pauseBtn.innerHTML = this.isPaused ? '▶ Resume <span class="key-badge">P</span>' : '⏸ Pause <span class="key-badge">P</span>';
      pauseBtn.classList.toggle('active', this.isPaused);
      pauseBtn.classList.toggle('paused', this.isPaused);
    }
    const quickPause = document.getElementById('btn-quick-pause');
    if (quickPause) {
      quickPause.innerHTML = this.isPaused ? '▶ Resume' : '⏸ Pause';
      quickPause.classList.toggle('paused', this.isPaused);
    }
  }

  getAllBoatCleats() {
    const list = [];
    for (const [id, cleat] of Object.entries(this.boat.specs.cleats)) {
      list.push({
        type: 'boat',
        id: id,
        name: cleat.name,
        worldPos: this.boat.getCleatWorldPos(id),
        radius: 0.4
      });
    }
    return list;
  }

  getAllDockTargets() {
    const list = [];
    for (const piling of DOCK_CONFIG.pilings) {
      list.push({
        type: 'dock',
        id: piling.id,
        name: piling.name,
        x: piling.x,
        y: piling.y,
        radius: piling.radius + 0.35,
        worldPos: new Vector2(piling.x, piling.y)
      });
    }
    for (const cleat of DOCK_CONFIG.fingerPier.cleats) {
      list.push({
        type: 'dock',
        id: cleat.id,
        name: cleat.name,
        x: cleat.x,
        y: cleat.y,
        radius: 0.45,
        worldPos: new Vector2(cleat.x, cleat.y)
      });
    }
    for (const cleat of DOCK_CONFIG.headDockCleats) {
      list.push({
        type: 'dock',
        id: cleat.id,
        name: cleat.name,
        x: cleat.x,
        y: cleat.y,
        radius: 0.45,
        worldPos: new Vector2(cleat.x, cleat.y)
      });
    }
    return list;
  }

  findCleatAtScreen(screenPos, worldPos) {
    const candidates = [...this.getAllBoatCleats(), ...this.getAllDockTargets()];
    let best = null;
    let bestDist = Infinity;

    for (const c of candidates) {
      const screenPt = this.renderer.worldToScreen(c.worldPos);
      const screenDist = screenPos.distanceTo(screenPt);

      // Hit threshold: comfortable 15 screen pixels (covers cleat + visual highlight ring)
      const maxScreenDist = 15; // pixels

      if (screenDist < maxScreenDist) {
        if (screenDist < bestDist) {
          bestDist = screenDist;
          best = c;
        }
      }
    }
    return best;
  }

  bindCanvasEvents() {
    let isMouseDown = false;
    let isDragging = false;
    let dragStart = new Vector2(0, 0);
    let mouseDownPos = new Vector2(0, 0);

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        isMouseDown = true;
        isDragging = false;
        dragStart.set(e.clientX, e.clientY);
        mouseDownPos.set(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const screenPos = new Vector2(e.clientX - rect.left, e.clientY - rect.top);
      const worldPos = this.renderer.screenToWorld(screenPos);

      this.renderer.mouseScreenPos = screenPos;
      this.renderer.mouseWorldPos = worldPos;

      // Cleat hover checks
      this.handleCanvasHover(screenPos, worldPos);

      if (isMouseDown) {
        const totalDist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
        if (totalDist > 6) {
          isDragging = true;
          const delta = new Vector2(e.clientX - dragStart.x, e.clientY - dragStart.y);
          this.renderer.pan(delta);
          dragStart.set(e.clientX, e.clientY);
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!isMouseDown) return;
      isMouseDown = false;

      // If user clicked (did not drag more than 6px total)
      if (!isDragging) {
        const rect = this.canvas.getBoundingClientRect();
        const screenPos = new Vector2(e.clientX - rect.left, e.clientY - rect.top);
        const worldPos = this.renderer.screenToWorld(screenPos);
        this.handleCanvasClick(screenPos, worldPos);
      }
      isDragging = false;
    });

    // Zoom on wheel
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.canvas.getBoundingClientRect();
      const screenPivot = new Vector2(e.clientX - rect.left, e.clientY - rect.top);
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      this.renderer.zoom(zoomFactor, screenPivot);
    }, { passive: false });
  }

  findLineAtScreen(screenPos, worldPos) {
    let bestLine = null;
    let bestDist = Infinity;

    for (const line of this.mooringLines) {
      const p1 = this.boat.getCleatWorldPos(line.boatCleatId);
      const p2 = line.dockPos;

      const s1 = this.renderer.worldToScreen(p1);
      const s2 = this.renderer.worldToScreen(p2);

      // Distance from screenPos to line segment s1-s2 in screen pixels
      const ab = Vector2.sub(s2, s1);
      const ap = Vector2.sub(screenPos, s1);
      const abLenSq = ab.lengthSq();
      let t = 0;
      if (abLenSq > 0) {
        t = Math.max(0, Math.min(1, ap.dot(ab) / abLenSq));
      }

      // Check distance to cleats at both ends (must be clicked away from a cleat!)
      const distToCleat1 = screenPos.distanceTo(s1);
      const distToCleat2 = screenPos.distanceTo(s2);
      const lineLen = Math.sqrt(abLenSq);

      // Safety margin away from cleat endpoints:
      // Minimum 22px, or 25% of line length if line is short
      const minEndMargin = Math.min(22, lineLen * 0.25);
      if (distToCleat1 < minEndMargin || distToCleat2 < minEndMargin) {
        continue; // Too close to cleat, do not treat as line click
      }

      const proj = new Vector2(s1.x + t * ab.x, s1.y + t * ab.y);
      const dist = screenPos.distanceTo(proj);

      if (dist < 18) { // within 18 screen pixels of the line body!
        if (dist < bestDist) {
          bestDist = dist;
          bestLine = line;
        }
      }
    }
    return bestLine;
  }

  handleCanvasHover(screenPos, worldPos) {
    const hoveredCleat = this.findCleatAtScreen(screenPos, worldPos);
    // Only search for hovered line if not over a cleat
    const hoveredLine = !hoveredCleat ? this.findLineAtScreen(screenPos, worldPos) : null;

    this.renderer.hoveredCleat = hoveredCleat;
    this.renderer.hoveredBoatCleatId = hoveredCleat?.type === 'boat' ? hoveredCleat.id : null;
    this.renderer.hoveredDockCleatId = hoveredCleat?.type === 'dock' ? hoveredCleat.id : null;
    this.renderer.hoveredLineId = hoveredLine?.id || null;

    if (hoveredCleat) {
      this.canvas.style.cursor = 'pointer';
    } else if (hoveredLine) {
      this.canvas.style.cursor = 'pointer';
    } else if (this.selectedCleat) {
      this.canvas.style.cursor = 'crosshair';
    } else {
      this.canvas.style.cursor = 'grab';
    }
  }

  setCleatSelection(cleat) {
    this.selectedCleat = cleat;
    this.renderer.selectedCleat = cleat;
    this.renderer.selectedBoatCleatId = cleat.type === 'boat' ? cleat.id : null;
  }

  clearCleatSelection() {
    this.selectedCleat = null;
    this.renderer.selectedCleat = null;
    this.renderer.selectedBoatCleatId = null;
  }

  handleCanvasClick(screenPos, worldPos) {
    const statusBanner = document.getElementById('line-action-status');
    const clickedCleat = this.findCleatAtScreen(screenPos, worldPos);

    // ========================================================
    // CASE 1: Clicked on a Cleat / Piling
    // ========================================================
    if (clickedCleat) {
      // 1A. Clicked the exact same cleat again -> deselect / cancel
      if (this.selectedCleat && this.selectedCleat.type === clickedCleat.type && this.selectedCleat.id === clickedCleat.id) {
        this.clearCleatSelection();
        if (statusBanner) statusBanner.classList.add('hidden');
        return;
      }

      // 1B. Nothing selected yet -> select this cleat (ready to tie a line or double up!)
      if (!this.selectedCleat) {
        this.setCleatSelection(clickedCleat);
        const attachedLines = this.mooringLines.filter(l =>
          (clickedCleat.type === 'boat' && l.boatCleatId === clickedCleat.id) ||
          (clickedCleat.type === 'dock' && l.dockId === clickedCleat.id)
        );

        if (statusBanner) {
          const doubleUpHint = attachedLines.length > 0
            ? ` (${attachedLines.length} line${attachedLines.length > 1 ? 's' : ''} attached — click opposite to double up)`
            : '';
          if (clickedCleat.type === 'boat') {
            statusBanner.innerHTML = `<span class="prompt-glow">⚓ Selected: <strong>${clickedCleat.name}</strong>${doubleUpHint}. Click dock piling to tie line (or click water to cancel).</span>`;
          } else {
            statusBanner.innerHTML = `<span class="prompt-glow">⚓ Selected: <strong>${clickedCleat.name}</strong>${doubleUpHint}. Click boat cleat to tie line (or click water to cancel).</span>`;
          }
          statusBanner.classList.remove('hidden');
        }
        return;
      }

      // 1C. Clicked another cleat on the SAME side -> switch selection
      if (this.selectedCleat.type === clickedCleat.type) {
        this.setCleatSelection(clickedCleat);
        const attachedLines = this.mooringLines.filter(l =>
          (clickedCleat.type === 'boat' && l.boatCleatId === clickedCleat.id) ||
          (clickedCleat.type === 'dock' && l.dockId === clickedCleat.id)
        );
        const doubleUpHint = attachedLines.length > 0
          ? ` (${attachedLines.length} line${attachedLines.length > 1 ? 's' : ''} attached — click opposite to double up)`
          : '';

        if (statusBanner) {
          statusBanner.innerHTML = `<span class="prompt-glow">Switched selection to <strong>${clickedCleat.name}</strong>${doubleUpHint}. Click opposite side to tie line.</span>`;
        }
        return;
      }

      // 1D. Clicked opposite side -> TIE LINE (allows doubling up on either cleat!)
      const boatCleat = this.selectedCleat.type === 'boat' ? this.selectedCleat : clickedCleat;
      const dockCleat = this.selectedCleat.type === 'dock' ? this.selectedCleat : clickedCleat;

      this.lineManager.addLine(boatCleat.id, dockCleat.id, dockCleat.x, dockCleat.y, dockCleat.name);
      this.clearCleatSelection();

      if (statusBanner) {
        statusBanner.innerHTML = `<span class="success-glow">✓ Secured line: <strong>${boatCleat.name}</strong> → <strong>${dockCleat.name}</strong>!</span>`;
        setTimeout(() => {
          if (!this.selectedCleat) {
            statusBanner.classList.add('hidden');
          }
        }, 4000);
      }
      return;
    }

    // ========================================================
    // CASE 2: Clicked on a Line in the Water (Away from Cleats)
    // ========================================================
    const clickedLine = this.findLineAtScreen(screenPos, worldPos);
    if (clickedLine) {
      this.lineManager.removeLine(clickedLine.id);
      this.clearCleatSelection();

      if (statusBanner) {
        statusBanner.innerHTML = `<span class="warning-glow">✂ Cast off line: <strong>${clickedLine.name}</strong></span>`;
        statusBanner.classList.remove('hidden');
        setTimeout(() => {
          if (!this.selectedCleat) statusBanner.classList.add('hidden');
        }, 3500);
      }
      return;
    }

    // ========================================================
    // CASE 3: Clicked into open water (NOT on a cleat, NOT on a line)
    // ========================================================
    if (this.selectedCleat) {
      // Simply deselect / cancel cleat selection without removing any lines!
      this.clearCleatSelection();
      if (statusBanner) statusBanner.classList.add('hidden');
    }
  }

  finishLineCreation(statusBanner, targetName) {
    this.clearCleatSelection();
    if (statusBanner) {
      setTimeout(() => {
        if (!this.selectedCleat) {
          statusBanner.classList.add('hidden');
        }
      }, 4000);
    }
  }

  loop(currentTime) {
    requestAnimationFrame((t) => this.loop(t));

    const rawDt = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    const dt = Math.min(rawDt, 0.05); // Cap to prevent large lag leaps

    if (!this.isPaused) {
      const effectiveDt = dt * this.simSpeed;

      // Physics Sub-stepping (4 sub-steps per frame for rock-solid line and collision stability)
      const subSteps = 4;
      const subDt = effectiveDt / subSteps;

      for (let s = 0; s < subSteps; s++) {
        // 1. Process helm controls
        this.helm.update(subDt);

        // 2. Resolve collisions with finger pier and pilings
        const collisionForces = this.collision.resolveCollisions(this.boat);

        // 3. Compute mooring line elastic tension forces
        const externalForces = [...collisionForces];
        for (const line of this.mooringLines) {
          const lineForce = line.computeForce(this.boat, subDt);
          if (lineForce) {
            externalForces.push(lineForce);
          }
        }

        // 4. Step rigid body boat physics
        this.boat.step(subDt, this.env, externalForces);
      }

      // Update environment animation timers
      this.env.update(effectiveDt);

      // Update effects renderer (particles, trail, bubbles)
      this.renderer.effectsRenderer.update(effectiveDt, this.boat, this.env);
    }

    // Render Canvas
    this.renderer.render(this.boat, this.env, this.mooringLines);

    // Update UI HUD & Line meters
    this.telemetryHUD.update();
    this.lineManager.updateTensionMeters();
  }
}

// Initialize when DOM is ready or immediately if already parsed
function startApp() {
  if (!window.simApp) {
    window.simApp = new App();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
