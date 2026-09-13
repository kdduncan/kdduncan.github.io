import { MooringLine } from './MooringLine.js';
import { DOCK_CONFIG } from './config.js';

/**
 * Mooring Line Manager UI:
 * Handles line attachment, line adjustments, release, and mooring presets.
 */
export class LineManagerUI {
  constructor(boat, linesArray, onLinesChanged = () => {}) {
    this.boat = boat;
    this.lines = linesArray;
    this.onLinesChanged = onLinesChanged;

    this.container = document.getElementById('active-lines-list');
    this.statusBanner = document.getElementById('line-action-status');

    this.bindGlobalButtons();
  }

  bindGlobalButtons() {
    const clearBtn = document.getElementById('btn-clear-lines');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAllLines());
    }

    const presetStandardBtn = document.getElementById('btn-preset-standard');
    if (presetStandardBtn) {
      presetStandardBtn.addEventListener('click', () => this.applyPresetStandard());
    }

    const presetSpringBtn = document.getElementById('btn-preset-spring');
    if (presetSpringBtn) {
      presetSpringBtn.addEventListener('click', () => this.applyPresetSpring());
    }

    const presetFullBtn = document.getElementById('btn-preset-full');
    if (presetFullBtn) {
      presetFullBtn.addEventListener('click', () => this.applyPresetFull());
    }
  }

  /**
   * Adds a new mooring line between a boat cleat and a dock piling/cleat.
   */
  addLine(boatCleatId, dockId, dockX, dockY, dockName) {
    const cleatName = this.boat.specs.cleats[boatCleatId]?.name || boatCleatId;
    const cleatPos = this.boat.getCleatWorldPos(boatCleatId);
    const initialDist = Math.hypot(dockX - cleatPos.x, dockY - cleatPos.y);

    const newLine = new MooringLine({
      id: `line_${Date.now()}`,
      name: `${cleatName} → ${dockName}`,
      boatCleatId: boatCleatId,
      dockId: dockId,
      dockX: dockX,
      dockY: dockY,
      dockName: dockName,
      restLength: Math.max(1.0, initialDist), // Snug to current distance
    });

    this.lines.push(newLine);
    this.updateUI();
    this.onLinesChanged();
    return newLine;
  }

  removeLine(lineId) {
    const idx = this.lines.findIndex(l => l.id === lineId);
    if (idx !== -1) {
      this.lines.splice(idx, 1);
      this.updateUI();
      this.onLinesChanged();
    }
  }

  clearAllLines() {
    this.lines.length = 0;
    this.updateUI();
    this.onLinesChanged();
  }

  /**
   * Preset 1: Standard 4-Line Tie-Up
   */
  applyPresetStandard() {
    this.lines.length = 0;
    const dock = DOCK_CONFIG;
    
    // 1. Bow Port -> Inner Port Piling
    this.addLine('bow_port', 'pile_inner_port', dock.pilings[2].x, dock.pilings[2].y, dock.pilings[2].name);
    // 2. Bow Starboard -> Inner Starboard Piling
    this.addLine('bow_starboard', 'pile_inner_starboard', dock.pilings[3].x, dock.pilings[3].y, dock.pilings[3].name);
    // 3. Stern Port -> Outer Port Piling
    this.addLine('stern_port', 'pile_outer_port', dock.pilings[0].x, dock.pilings[0].y, dock.pilings[0].name);
    // 4. Stern Starboard -> Outer Starboard Piling
    this.addLine('stern_starboard', 'pile_outer_starboard', dock.pilings[1].x, dock.pilings[1].y, dock.pilings[1].name);

    this.updateUI();
  }

  /**
   * Preset 2: Spring Line Maneuver (Port Midship Spring -> Finger Pier End Cleat)
   */
  applyPresetSpring() {
    this.lines.length = 0;
    const fpCleat = DOCK_CONFIG.fingerPier.cleats[0]; // Finger Pier Outer End Cleat
    this.addLine('mid_port', fpCleat.id, fpCleat.x, fpCleat.y, fpCleat.name);
    this.updateUI();
  }

  /**
   * Preset 3: Full Moor with Springs
   */
  applyPresetFull() {
    this.applyPresetStandard();
    const fpCleats = DOCK_CONFIG.fingerPier.cleats;
    // Add Port Midship Spring to Finger End
    this.addLine('mid_port', fpCleats[0].id, fpCleats[0].x, fpCleats[0].y, 'Finger End (Fwd Spring)');
    // Add Port Stern Spring to Finger Mid
    this.addLine('stern_port', fpCleats[1].id, fpCleats[1].x, fpCleats[1].y, 'Finger Mid (Aft Spring)');
    this.updateUI();
  }

  updateUI() {
    if (!this.container) return;

    if (this.lines.length === 0) {
      this.container.innerHTML = `
        <div class="empty-lines-state">
          <p>No mooring lines secured.</p>
          <small>Click a cleat on the boat and then a piling or dock cleat to tie a line, or choose a preset below.</small>
        </div>
      `;
      return;
    }

    this.container.innerHTML = '';
    for (const line of this.lines) {
      const lineCard = document.createElement('div');
      lineCard.className = `line-card ${line.isTaut ? 'taut' : 'slack'}`;
      
      const tensionLbs = Math.round(line.tension * 0.2248);
      const tensionPercent = Math.min(100, Math.round((line.tension / line.breakingStrain) * 100));
      
      let tensionClass = 'normal';
      if (tensionPercent > 75) tensionClass = 'critical';
      else if (tensionPercent > 35) tensionClass = 'warning';

      lineCard.innerHTML = `
        <div class="line-header">
          <span class="line-title">${line.name}</span>
          <button class="btn-cast-off" data-line-id="${line.id}" title="Release / Cast off this line">Cast Off</button>
        </div>
        <div class="line-controls-row">
          <div class="length-adjuster">
            <button class="btn-step" data-action="shorten" data-line-id="${line.id}">-</button>
            <span class="length-val">${line.restLength.toFixed(1)} m</span>
            <button class="btn-step" data-action="lengthen" data-line-id="${line.id}">+</button>
          </div>
          <div class="tension-display ${tensionClass}">
            <span class="tension-text">${line.isTaut ? `${tensionLbs} lbs` : 'Slack'}</span>
            <div class="tension-bar-track">
              <div class="tension-bar-fill" style="width: ${tensionPercent}%"></div>
            </div>
          </div>
        </div>
      `;

      this.container.appendChild(lineCard);
    }

    // Bind item buttons
    this.container.querySelectorAll('.btn-cast-off').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.removeLine(e.target.dataset.lineId);
      });
    });

    this.container.querySelectorAll('.btn-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lineId = e.target.dataset.lineId;
        const line = this.lines.find(l => l.id === lineId);
        if (line) {
          const delta = e.target.dataset.action === 'shorten' ? -0.2 : 0.2;
          line.adjustLength(delta);
          this.updateUI();
          this.onLinesChanged();
        }
      });
    });
  }

  /**
   * Periodic tension update for UI meters without rebuilding DOM tree
   */
  updateTensionMeters() {
    if (!this.container || this.lines.length === 0) return;
    const cards = this.container.querySelectorAll('.line-card');
    
    this.lines.forEach((line, idx) => {
      const card = cards[idx];
      if (!card) return;

      const tensionLbs = Math.round(line.tension * 0.2248);
      const tensionPercent = Math.min(100, Math.round((line.tension / line.breakingStrain) * 100));
      
      const tensionText = card.querySelector('.tension-text');
      const tensionFill = card.querySelector('.tension-bar-fill');
      const tensionDisplay = card.querySelector('.tension-display');

      if (tensionText) {
        tensionText.textContent = line.isTaut ? `${tensionLbs} lbs` : 'Slack';
      }
      if (tensionFill) {
        tensionFill.style.width = `${tensionPercent}%`;
      }
      if (tensionDisplay) {
        tensionDisplay.className = `tension-display ${tensionPercent > 75 ? 'critical' : (tensionPercent > 35 ? 'warning' : 'normal')}`;
      }

      if (line.isTaut) {
        card.classList.add('taut');
        card.classList.remove('slack');
      } else {
        card.classList.add('slack');
        card.classList.remove('taut');
      }
    });
  }
}
