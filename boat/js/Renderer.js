import { Vector2 } from './Vector2.js';
import { DOCK_CONFIG } from './config.js';
import { BoatRenderer } from './BoatRenderer.js';
import { EffectsRenderer } from './EffectsRenderer.js';

/**
 * Master Canvas Renderer for the Marina World, Slip, Pilings, Mooring Lines, and Vessels.
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.boatRenderer = new BoatRenderer();
    this.effectsRenderer = new EffectsRenderer();

    // Camera settings
    this.scale = 22; // Pixels per meter (initial zoom framing both slip and boat)
    this.cameraPos = new Vector2(0, 3.5); // World position at center of screen
    this.cameraMode = 'dock'; // 'dock' | 'follow' | 'free'

    // Interactive cleat selection state
    this.selectedCleat = null; // { type: 'boat'|'dock', id, name, worldPos, x, y }
    this.selectedBoatCleatId = null;
    this.hoveredBoatCleatId = null;
    this.hoveredDockCleatId = null;
    this.hoveredLineId = null;
    this.mouseWorldPos = null;
    this.mouseScreenPos = null;
    this.isPaused = false;

    // Display Toggles
    this.showVectors = true;
    this.showTrail = true;
    this.showLabels = true;

    // Handle high-DPI displays
    this.pixelRatio = window.devicePixelRatio || 1;
    this.resize();
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== width * this.pixelRatio || this.canvas.height !== height * this.pixelRatio) {
      this.canvas.width = width * this.pixelRatio;
      this.canvas.height = height * this.pixelRatio;
    }
  }

  /**
   * Transforms world coordinate (x: east, y: north) to screen pixel coordinate (x: right, y: down).
   * Uses CSS pixels matching clientWidth/clientHeight.
   * Note: in world coords, +Y is North, so screen Y is inverted (-Y).
   */
  worldToScreen(worldPoint) {
    const centerX = this.canvas.clientWidth / 2;
    const centerY = this.canvas.clientHeight / 2;
    const screenX = centerX + (worldPoint.x - this.cameraPos.x) * this.scale;
    const screenY = centerY - (worldPoint.y - this.cameraPos.y) * this.scale;
    return new Vector2(screenX, screenY);
  }

  /**
   * Transforms screen pixel coordinate (CSS pixels from getBoundingClientRect) to world coordinate.
   */
  screenToWorld(screenPoint) {
    const centerX = this.canvas.clientWidth / 2;
    const centerY = this.canvas.clientHeight / 2;
    const worldX = this.cameraPos.x + (screenPoint.x - centerX) / this.scale;
    const worldY = this.cameraPos.y - (screenPoint.y - centerY) / this.scale;
    return new Vector2(worldX, worldY);
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
  }

  zoom(factor, screenPivot = null) {
    const minScale = 12;
    const maxScale = 90;
    const oldScale = this.scale;
    this.scale = Math.max(minScale, Math.min(maxScale, this.scale * factor));

    if (screenPivot) {
      // Zoom centered on cursor in CSS pixels
      const worldBefore = this.screenToWorld(screenPivot);
      const centerX = this.canvas.clientWidth / 2;
      const centerY = this.canvas.clientHeight / 2;
      this.cameraPos.x = worldBefore.x - (screenPivot.x - centerX) / this.scale;
      this.cameraPos.y = worldBefore.y + (screenPivot.y - centerY) / this.scale;
    }
  }

  pan(deltaPixels) {
    this.cameraPos.x -= deltaPixels.x / this.scale;
    this.cameraPos.y += deltaPixels.y / this.scale;
    this.cameraMode = 'free';
  }

  centerOnBoat(boat) {
    this.cameraPos.x = boat.position.x;
    this.cameraPos.y = boat.position.y;
    this.cameraMode = 'follow';
  }

  fitView(boat) {
    // Frame both the boat and the slip (between boat Y and head dock Y=13)
    const boatY = boat ? boat.position.y : -4.5;
    const boatX = boat ? boat.position.x : 0;
    this.cameraPos.x = boatX * 0.3;
    this.cameraPos.y = Math.max(2.5, (boatY - 4.5 + 13.5) * 0.5);
    this.scale = 22;
    this.cameraMode = 'dock';
  }

  render(boat, env, mooringLines = []) {
    this.resize();
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.pixelRatio, this.pixelRatio);

    const viewW = this.canvas.width / this.pixelRatio;
    const viewH = this.canvas.height / this.pixelRatio;

    // Camera NaN protection
    if (isNaN(this.cameraPos.x) || isNaN(this.cameraPos.y)) {
      this.cameraPos.set(0, 3.5);
    }
    if (isNaN(this.scale) || this.scale <= 5 || !isFinite(this.scale)) {
      this.scale = 22;
    }

    // 1. Camera Tracking
    if (this.cameraMode === 'follow') {
      const targetPos = boat.position;
      this.cameraPos.x += (targetPos.x - this.cameraPos.x) * 0.08;
      this.cameraPos.y += (targetPos.y - this.cameraPos.y) * 0.08;
    } else if (this.cameraMode === 'dock') {
      // Intelligently frame both the slip and approaching boat
      const targetX = boat.position.x * 0.25;
      const targetY = Math.max(3.0, (boat.position.y - 4.5 + 13.5) * 0.5);
      this.cameraPos.x += (targetX - this.cameraPos.x) * 0.08;
      this.cameraPos.y += (targetY - this.cameraPos.y) * 0.08;
    }

    // 2. Draw Sea / Water Background
    this.drawWater(ctx, viewW, viewH, env);

    // Apply World-to-Screen Transformation Matrix
    ctx.save();
    const centerX = viewW / 2;
    const centerY = viewH / 2;
    ctx.translate(centerX, centerY);
    ctx.scale(this.scale, -this.scale); // Invert Y so +Y is up (North)
    ctx.translate(-this.cameraPos.x, -this.cameraPos.y);

    // 3. Draw Water Grid / Nautical Depth Markings
    this.drawWaterGrid(ctx);

    // 4. Draw Breadcrumb Trail
    if (this.showTrail) {
      this.effectsRenderer.renderTrail(ctx);
    }

    // 5. Draw Marina Structures: Head dock, Port finger pier, Pilings
    this.drawMarina(ctx);

    // 6. Draw Mooring Lines
    this.drawMooringLines(ctx, boat, mooringLines);

    // 7. Draw Prop Wash & Wake Effects
    this.effectsRenderer.renderPropWash(ctx);

    // 8. Draw Beneteau 331 Boat
    ctx.save();
    ctx.translate(boat.position.x, boat.position.y);
    ctx.rotate(-boat.heading); // Invert rotation for canvas +Y coordinate system
    const isTargetMode = this.selectedCleat?.type === 'dock';
    const selectedBoatId = this.selectedCleat?.type === 'boat' ? this.selectedCleat.id : this.selectedBoatCleatId;
    this.boatRenderer.renderBoat(ctx, boat, selectedBoatId, this.hoveredBoatCleatId, isTargetMode);
    ctx.restore();

    // 9. Draw Wind Streamers
    this.effectsRenderer.renderWindStreamers(ctx, env);

    // 10. Draw Force Vectors & Diagnostics
    if (this.showVectors) {
      this.effectsRenderer.renderForceVectors(ctx, boat, mooringLines);
    }

    // 11. Draw interactive line-tossing guide
    if (this.selectedCleat || this.selectedBoatCleatId) {
      this.drawLineCreationGuide(ctx, boat);
    }

    ctx.restore(); // Restore world transform

    // 12. Draw On-Screen Overlays (Scale bar, Compass Rose, Pause Banner)
    this.drawCompassRose(ctx, env, viewW, viewH);
    this.drawScaleBar(ctx, viewW, viewH);
    if (this.isPaused) {
      this.drawPauseOverlay(ctx, viewW, viewH);
    }

    ctx.restore();
  }

  drawWater(ctx, w, h, env) {
    // Nautical deep azure water gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a233a');
    grad.addColorStop(1, '#0e3454');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  drawWaterGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 0.03;
    
    // Grid every 5 meters
    const minX = Math.floor((this.cameraPos.x - 30) / 5) * 5;
    const maxX = Math.ceil((this.cameraPos.x + 30) / 5) * 5;
    const minY = Math.floor((this.cameraPos.y - 30) / 5) * 5;
    const maxY = Math.ceil((this.cameraPos.y + 30) / 5) * 5;

    ctx.beginPath();
    for (let x = minX; x <= maxX; x += 5) {
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
    }
    for (let y = minY; y <= maxY; y += 5) {
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
    }
    ctx.stroke();

    // Slip Fairway boundary lines (subtle channel guides)
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.18)';
    ctx.setLineDash([0.5, 0.5]);
    ctx.beginPath();
    // Centerline into slip
    ctx.moveTo(0, -25);
    ctx.lineTo(0, 13);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  drawMarina(ctx) {
    const dock = DOCK_CONFIG;
    ctx.save();

    // A. Head Dock (North Walkway Pier: Y = 13.0 to Y = 15.5)
    ctx.fillStyle = '#bcaaa4'; // Weathered marina dock decking
    ctx.fillRect(dock.headDock.minX, dock.headDock.y, 
                 dock.headDock.maxX - dock.headDock.minX, dock.headDock.thickness);
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 0.08;
    ctx.strokeRect(dock.headDock.minX, dock.headDock.y, 
                   dock.headDock.maxX - dock.headDock.minX, dock.headDock.thickness);

    // Head dock planking lines
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let x = dock.headDock.minX; x <= dock.headDock.maxX; x += 0.4) {
      ctx.moveTo(x, dock.headDock.y);
      ctx.lineTo(x, dock.headDock.y + dock.headDock.thickness);
    }
    ctx.stroke();

    // B. Port-Side Finger Pier (Extends ~1/3 of boat length down to Y = 9.4)
    const fp = dock.fingerPier;
    const fpX = fp.startX - fp.width; // Left side of finger pier
    ctx.fillStyle = '#a1887f';
    ctx.fillRect(fpX, fp.endY, fp.width, fp.startY - fp.endY);
    ctx.strokeStyle = '#4e342e';
    ctx.lineWidth = 0.08;
    ctx.strokeRect(fpX, fp.endY, fp.width, fp.startY - fp.endY);

    // Finger pier planking
    ctx.strokeStyle = '#6d4c41';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    for (let y = fp.endY; y <= fp.startY; y += 0.35) {
      ctx.moveTo(fpX, y);
      ctx.lineTo(fp.startX, y);
    }
    ctx.stroke();

    // White rubber rub-rail along finger pier slip edge (at X = -2.7)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(fp.startX, fp.endY);
    ctx.lineTo(fp.startX, fp.startY);
    ctx.stroke();

    // Pier Terminus end marker (yellow hazard bumper)
    ctx.fillStyle = '#fbc02d';
    ctx.fillRect(fpX, fp.endY, fp.width, 0.2);

    // Finger Pier Cleats
    for (const cleat of fp.cleats) {
      this.drawDockCleat(ctx, cleat.x, cleat.y, cleat.id, cleat.name);
    }

    // Head dock cleats
    for (const cleat of dock.headDockCleats) {
      this.drawDockCleat(ctx, cleat.x, cleat.y, cleat.id, cleat.name);
    }

    // C. The Four Pilings ("phones")
    for (const piling of dock.pilings) {
      this.drawPiling(ctx, piling);
    }

    // D. Neighbor Slip Outline & Starboard Boundary marker
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.setLineDash([0.3, 0.3]);
    ctx.beginPath();
    ctx.moveTo(dock.starboardBoundaryX, 0);
    ctx.lineTo(dock.starboardBoundaryX, 13);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  drawPiling(ctx, piling) {
    const isSelected = this.selectedCleat?.id === piling.id;
    const isHovered = this.hoveredDockCleatId === piling.id;
    const isTargetMode = this.selectedCleat?.type === 'boat' || (this.selectedBoatCleatId && !this.selectedCleat);

    ctx.save();
    ctx.translate(piling.x, piling.y);

    // Interactive ring highlight if selected, hovered, or in target mode
    if (isSelected || isHovered || isTargetMode) {
      ctx.beginPath();
      ctx.arc(0, 0, piling.radius + 0.38, 0, Math.PI * 2);
      if (isSelected) {
        ctx.fillStyle = 'rgba(0, 230, 118, 0.45)';
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 0.06;
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 0.05;
      } else {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.16)';
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
        ctx.lineWidth = 0.035;
      }
      ctx.fill();
      ctx.stroke();
    }

    // Underwater foundation shadow
    ctx.beginPath();
    ctx.arc(0.06, -0.06, piling.radius + 0.05, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fill();

    // Wood Timber Piling Outer Ring
    ctx.beginPath();
    ctx.arc(0, 0, piling.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#3e2723';
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = '#1b0000';
    ctx.stroke();

    // Piling Cap (White conical or flat fiberglass cap common on marina pilings)
    ctx.beginPath();
    ctx.arc(0, 0, piling.radius * 0.85, 0, Math.PI * 2);
    ctx.fillStyle = '#eceff1';
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#78909c';
    ctx.stroke();

    // Center Mooring Eye / Ring
    ctx.beginPath();
    ctx.arc(0, 0, 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#263238';
    ctx.fill();

    // Text Label
    if (this.showLabels) {
      ctx.save();
      // Counter-rotate text so it stays upright
      ctx.scale(1, -1);
      ctx.font = 'bold 0.38px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(piling.name, 0, piling.radius + 0.55);
      ctx.restore();
    }

    ctx.restore();
  }

  drawDockCleat(ctx, x, y, id, name) {
    const isSelected = this.selectedCleat?.id === id;
    const isHovered = this.hoveredDockCleatId === id;
    const isTargetMode = this.selectedCleat?.type === 'boat' || (this.selectedBoatCleatId && !this.selectedCleat);

    ctx.save();
    ctx.translate(x, y);

    if (isSelected || isHovered || isTargetMode) {
      ctx.beginPath();
      ctx.arc(0, 0, 0.42, 0, Math.PI * 2);
      if (isSelected) {
        ctx.fillStyle = 'rgba(0, 230, 118, 0.45)';
        ctx.strokeStyle = '#00e676';
        ctx.lineWidth = 0.06;
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 0.05;
      } else {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.16)';
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
        ctx.lineWidth = 0.035;
      }
      ctx.fill();
      ctx.stroke();
    }

    // Dock Cleat Base Plate
    ctx.fillStyle = '#37474f';
    ctx.fillRect(-0.08, -0.15, 0.16, 0.30);

    // Cleat Horns
    ctx.fillStyle = '#cfd8dc';
    ctx.beginPath();
    ctx.moveTo(-0.04, -0.22);
    ctx.lineTo(0.04, -0.22);
    ctx.lineTo(0.04, 0.22);
    ctx.lineTo(-0.04, 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = '#263238';
    ctx.stroke();

    if (this.showLabels && isHovered) {
      ctx.save();
      ctx.scale(1, -1);
      ctx.font = '0.35px sans-serif';
      ctx.fillStyle = '#ffe082';
      ctx.textAlign = 'center';
      ctx.fillText(name, 0, -0.4);
      ctx.restore();
    }

    ctx.restore();
  }

  drawMooringLines(ctx, boat, mooringLines) {
    ctx.save();

    for (const line of mooringLines) {
      const p1 = boat.getCleatWorldPos(line.boatCleatId);
      const p2 = line.dockPos;

      const dist = p1.distanceTo(p2);
      const isTaut = dist >= line.restLength;
      const tension = line.tension;

      // Determine rope color based on tension strain
      let ropeColor = '#f5f5dc'; // Cream rope when slack
      let lineWidth = 0.06;

      if (isTaut) {
        if (tension < 400) {
          ropeColor = '#f1c40f'; // Gold under light load
          lineWidth = 0.07;
        } else if (tension < 2500) {
          ropeColor = '#e67e22'; // Orange under working load
          lineWidth = 0.08;
        } else {
          ropeColor = '#e74c3c'; // Red under heavy load / strain
          lineWidth = 0.10;
        }
      }

      // Cast-off highlight halo: only when line itself is hovered away from cleats
      const isHoveredLine = this.hoveredLineId === line.id;

      if (isHoveredLine) {
        ctx.save();
        ctx.strokeStyle = '#ff5252';
        ctx.lineWidth = lineWidth + 0.08;
        ctx.setLineDash([0.3, 0.2]);
        ctx.lineDashOffset = -performance.now() * 0.005;
        ctx.beginPath();
        if (!isTaut) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2;
          const sagAmount = Math.min(0.8, (line.restLength - dist) * 0.4);
          const dir = Vector2.sub(p2, p1).normalize();
          const perp = new Vector2(-dir.y, dir.x);
          ctx.moveTo(p1.x, p1.y);
          ctx.quadraticCurveTo(midX + perp.x * sagAmount, midY + perp.y * sagAmount, p2.x, p2.y);
        } else {
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
        }
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.strokeStyle = ropeColor;
      ctx.lineWidth = lineWidth;

      if (!isTaut) {
        // Catenary sag curve for slack rope
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const sagAmount = Math.min(0.8, (line.restLength - dist) * 0.4);
        
        // Sag perpendicular to line
        const dir = Vector2.sub(p2, p1).normalize();
        const perp = new Vector2(-dir.y, dir.x);
        const ctrlX = midX + perp.x * sagAmount;
        const ctrlY = midY + perp.y * sagAmount;

        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo(ctrlX, ctrlY, p2.x, p2.y);
        ctx.stroke();
      } else {
        // Taut straight line
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Tension readout badge at line midpoint
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        
        ctx.save();
        ctx.scale(1, -1);
        ctx.font = 'bold 0.35px sans-serif';
        ctx.fillStyle = tension > 2500 ? '#ff5252' : '#ffeb3b';
        ctx.textAlign = 'center';
        const tensionLbf = Math.round(tension * 0.2248);
        ctx.fillText(`${line.name}: ${tensionLbf} lbs`, midX, -midY - 0.25);
        ctx.restore();
      }

      // If hovering line, show "✂ Click to Cast Off" badge
      if (isHoveredLine) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.save();
        ctx.scale(1, -1);
        ctx.font = 'bold 0.38px sans-serif';
        ctx.fillStyle = '#ff5252';
        ctx.textAlign = 'center';
        ctx.fillText(`✂ Click to Cast Off`, midX, -midY + 0.35);
        ctx.restore();
      }

      // Attachment splices at both ends
      ctx.fillStyle = '#2c3e50';
      ctx.beginPath();
      ctx.arc(p1.x, p1.y, 0.09, 0, Math.PI * 2);
      ctx.arc(p2.x, p2.y, 0.09, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  drawLineCreationGuide(ctx, boat) {
    if (!this.selectedCleat && !this.selectedBoatCleatId) return;

    let anchorPos = null;
    let anchorType = 'boat';
    if (this.selectedCleat) {
      anchorType = this.selectedCleat.type;
      anchorPos = this.selectedCleat.type === 'boat'
        ? boat.getCleatWorldPos(this.selectedCleat.id)
        : this.selectedCleat.worldPos;
    } else if (this.selectedBoatCleatId) {
      anchorPos = boat.getCleatWorldPos(this.selectedBoatCleatId);
      anchorType = 'boat';
    }

    if (!anchorPos) return;

    ctx.save();

    // 1. Pulsing guide circle on selected anchor
    const pulse = 0.45 + Math.sin(performance.now() * 0.008) * 0.08;
    ctx.beginPath();
    ctx.arc(anchorPos.x, anchorPos.y, pulse, 0, Math.PI * 2);
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 0.06;
    ctx.stroke();

    // 2. Animated dashed rubber-band line to mouse cursor
    if (this.mouseWorldPos) {
      ctx.beginPath();
      ctx.moveTo(anchorPos.x, anchorPos.y);
      ctx.lineTo(this.mouseWorldPos.x, this.mouseWorldPos.y);
      ctx.strokeStyle = '#00e676';
      ctx.lineWidth = 0.06;
      ctx.setLineDash([0.3, 0.2]);
      ctx.lineDashOffset = -performance.now() * 0.005;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  drawPauseOverlay(ctx, viewW, viewH) {
    if (!this.isPaused) return;

    ctx.save();
    const bannerW = 340;
    const bannerH = 46;
    const x = (viewW - bannerW) / 2;
    const y = 26;

    ctx.shadowColor = 'rgba(255, 214, 0, 0.5)';
    ctx.shadowBlur = 12;

    ctx.fillStyle = 'rgba(8, 22, 38, 0.92)';
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(x, y, bannerW, bannerH, 23);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.fillStyle = '#ffd600';
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⏸ SIMULATION PAUSED', viewW / 2, y + 16);

    ctx.fillStyle = '#b0bec5';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("Press 'P' or click Pause button to resume", viewW / 2, y + 32);

    ctx.restore();
  }

  drawCompassRose(ctx, env, viewW, viewH) {
    const x = viewW - 65;
    const y = 65;
    const radius = 42;

    ctx.save();
    ctx.translate(x, y);

    // Outer dial plate
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 25, 45, 0.85)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Cardinal Points
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#e74c3c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, -radius + 10);
    ctx.fillStyle = '#eceff1';
    ctx.fillText('S', 0, radius - 10);
    ctx.fillText('E', radius - 10, 0);
    ctx.fillText('W', -radius + 10, 0);

    // True Wind Direction Needle
    if (env) {
      // Wind comes FROM windDirectionDeg.
      const windRad = (env.windDirectionDeg * Math.PI) / 180;
      ctx.save();
      ctx.rotate(windRad);
      ctx.beginPath();
      ctx.moveTo(0, -radius + 3);
      ctx.lineTo(5, -radius + 18);
      ctx.lineTo(-5, -radius + 18);
      ctx.closePath();
      ctx.fillStyle = '#00e5ff';
      ctx.fill();
      ctx.restore();

      // Current Flow Direction Needle
      const currentRad = (env.currentDirectionDeg * Math.PI) / 180;
      ctx.save();
      ctx.rotate(currentRad);
      ctx.beginPath();
      ctx.moveTo(0, radius - 4);
      ctx.lineTo(4, radius - 16);
      ctx.lineTo(-4, radius - 16);
      ctx.closePath();
      ctx.fillStyle = '#ff9100';
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  drawScaleBar(ctx, viewW, viewH) {
    const x = 20;
    const y = viewH - 25;
    const barLengthMeters = 5; // 5 meters
    const barLengthPixels = barLengthMeters * this.scale;

    ctx.save();
    ctx.fillStyle = 'rgba(10, 25, 45, 0.75)';
    ctx.fillRect(x - 5, y - 18, barLengthPixels + 10, 24);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + barLengthPixels, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.moveTo(x + barLengthPixels, y - 4);
    ctx.lineTo(x + barLengthPixels, y + 4);
    ctx.stroke();

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`5 m (~16.4 ft)`, x + barLengthPixels / 2 - 32, y - 5);
    ctx.restore();
  }
}
