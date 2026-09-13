import { BOAT_SPECS } from './config.js';

/**
 * High-detail vector renderer for the Beneteau 331 Sailboat deck, hull, and fittings.
 */
export class BoatRenderer {
  constructor() {
    this.specs = BOAT_SPECS;
  }

  /**
   * Renders the Beneteau 331 centered at (0,0) in local coordinates (Bow is +Y, Starboard is +X)
   * The caller context should already be translated to boat world position and rotated by heading.
   */
  renderBoat(ctx, boat, selectedCleatId = null, hoveredCleatId = null, isTargetMode = false) {
    const loa = this.specs.loa;       // ~10.34m
    const beam = this.specs.beam;     // ~3.42m
    const halfBeam = beam / 2;        // ~1.71m
    const halfLength = loa / 2;       // ~5.17m

    ctx.save();

    // 1. Water shadow under hull
    ctx.beginPath();
    this.drawHullPath(ctx, halfBeam + 0.15, halfLength + 0.15);
    ctx.fillStyle = 'rgba(2, 12, 28, 0.45)';
    ctx.fill();

    // 2. Main Fiberglass Hull
    ctx.beginPath();
    this.drawHullPath(ctx, halfBeam, halfLength);
    ctx.fillStyle = '#f4f6f8'; // Off-white Beneteau marine gelcoat
    ctx.fill();
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = '#2c3e50';
    ctx.stroke();

    // 3. Molded Non-skid Deck Outline & Teak Toe-rail
    ctx.beginPath();
    this.drawHullPath(ctx, halfBeam - 0.12, halfLength - 0.14);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = '#c49a5b'; // Teak toe-rail
    ctx.stroke();

    // Non-skid inner deck gelcoat
    ctx.fillStyle = '#e8ecf1';
    ctx.fill();

    // 4. Beneteau Signature Coachroof & Cabin Trunk
    this.drawCabinTrunk(ctx);

    // 5. Cockpit & Twin Coamings
    this.drawCockpit(ctx, boat);

    // 6. Mast Step, Boom & Rigging Lines
    this.drawRigging(ctx);

    // 7. Rudder Blade (visible under transom/water)
    this.drawRudder(ctx, boat.rudderAngleDeg);

    // 8. Sugar Scoop / Transom Swim Platform Steps
    this.drawSwimPlatform(ctx);

    // 9. Port Fenders (hanging over port side)
    this.drawFenders(ctx);

    // 10. Cleats with Interactive Highlights
    this.drawCleats(ctx, selectedCleatId, hoveredCleatId, isTargetMode);

    // 11. Bow Heading Chevron & Vessel Nameplate
    this.drawDeckDetails(ctx);

    ctx.restore();
  }

  /**
   * Curves for the Beneteau 331 hull:
   * Plumb bow with fine entry, beam carried well aft, gentle taper to wide transom.
   */
  drawHullPath(ctx, hb, hl) {
    // Start at bow tip (+Y)
    ctx.moveTo(0, hl);
    
    // Starboard side: curve down to maximum beam around midship (y = 0), then slightly taper to wide transom
    ctx.bezierCurveTo(hb * 0.55, hl * 0.75, hb, hl * 0.25, hb, 0.0);
    ctx.bezierCurveTo(hb, -hl * 0.45, hb * 0.88, -hl * 0.85, hb * 0.78, -hl);

    // Transom (Sugar scoop curve at stern)
    ctx.quadraticCurveTo(0, -hl - 0.08, -hb * 0.78, -hl);

    // Port side: symmetric back to bow
    ctx.bezierCurveTo(-hb * 0.88, -hl * 0.85, -hb, -hl * 0.45, -hb, 0.0);
    ctx.bezierCurveTo(-hb, hl * 0.25, -hb * 0.55, hl * 0.75, 0, hl);
    ctx.closePath();
  }

  drawCabinTrunk(ctx) {
    ctx.save();
    // Coachroof shape
    ctx.beginPath();
    ctx.moveTo(0, 3.8);
    ctx.bezierCurveTo(0.85, 3.4, 1.25, 2.0, 1.28, 0.5);
    ctx.lineTo(1.28, -1.2);
    ctx.lineTo(-1.28, -1.2);
    ctx.lineTo(-1.28, 0.5);
    ctx.bezierCurveTo(-1.25, 2.0, -0.85, 3.4, 0, 3.8);
    ctx.closePath();

    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = '#b0bec5';
    ctx.stroke();

    // Tinted Deck Hatches (Beneteau smoked acrylic)
    // Foredeck Hatch
    ctx.fillStyle = 'rgba(20, 45, 75, 0.75)';
    ctx.fillRect(-0.35, 2.6, 0.70, 0.65);
    ctx.strokeStyle = '#78909c';
    ctx.lineWidth = 0.02;
    ctx.strokeRect(-0.35, 2.6, 0.70, 0.65);

    // Salon Main Hatch
    ctx.fillRect(-0.32, 1.2, 0.64, 0.55);
    ctx.strokeRect(-0.32, 1.2, 0.64, 0.55);

    // Companionway Sliding Hatch
    ctx.fillStyle = 'rgba(15, 35, 60, 0.85)';
    ctx.fillRect(-0.42, -1.15, 0.84, 0.7);
    ctx.strokeRect(-0.42, -1.15, 0.84, 0.7);

    ctx.restore();
  }

  drawCockpit(ctx, boat) {
    ctx.save();
    // Cockpit Well
    ctx.beginPath();
    ctx.rect(-0.95, -4.5, 1.90, 3.3);
    ctx.fillStyle = '#e2e7ec';
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#90a4ae';
    ctx.stroke();

    // Teak Inlaid Benches
    ctx.fillStyle = '#c89d62';
    // Port Bench
    ctx.fillRect(-0.92, -4.2, 0.38, 2.8);
    // Starboard Bench
    ctx.fillRect(0.54, -4.2, 0.38, 2.8);
    // Helm Aft Bench
    ctx.fillRect(-0.85, -4.45, 1.70, 0.28);

    // Steering Pedestal & Wheel
    const pedestalY = -3.8;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, pedestalY, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#455a64';
    ctx.stroke();

    // Stainless Steel Steering Wheel (rotates with rudder)
    const wheelRadius = 0.55;
    const rudderRad = (boat.rudderAngleDeg * Math.PI) / 180;
    // Scale wheel rotation for realistic 1.5-turn lock-to-lock feel
    const wheelAngle = rudderRad * 3.5;

    ctx.save();
    ctx.translate(0, pedestalY);
    ctx.rotate(wheelAngle);

    // Rim
    ctx.beginPath();
    ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = '#263238';
    ctx.stroke();

    // Spokes
    ctx.lineWidth = 0.02;
    for (let i = 0; i < 6; i++) {
      const spAng = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(spAng) * wheelRadius, Math.sin(spAng) * wheelRadius);
      ctx.stroke();
    }
    // Top-dead-center king spoke marker (leather wrap)
    ctx.fillStyle = '#d32f2f';
    ctx.fillRect(-0.04, wheelRadius - 0.05, 0.08, 0.07);

    ctx.restore();
    ctx.restore();
  }

  drawRigging(ctx) {
    ctx.save();
    // Mast collar at y = 1.95m
    ctx.beginPath();
    ctx.arc(0, 1.95, 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#b0bec5';
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#37474f';
    ctx.stroke();

    // Boom outline (extending aft to cockpit)
    ctx.beginPath();
    ctx.moveTo(0, 1.95);
    ctx.lineTo(0, -1.8);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = '#eceff1';
    ctx.stroke();
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = '#455a64';
    ctx.stroke();

    ctx.restore();
  }

  drawRudder(ctx, rudderAngleDeg) {
    ctx.save();
    // Rudder is mounted under stern (y = -4.85)
    ctx.translate(0, -4.85);
    ctx.rotate((rudderAngleDeg * Math.PI) / 180);

    // Rudder blade extending aft
    ctx.beginPath();
    ctx.moveTo(-0.04, 0);
    ctx.lineTo(0.04, 0);
    ctx.lineTo(0.03, -1.1);
    ctx.lineTo(-0.03, -1.1);
    ctx.closePath();

    ctx.fillStyle = 'rgba(41, 128, 185, 0.7)'; // Translucent underwater blue
    ctx.fill();
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = '#1a5276';
    ctx.stroke();

    ctx.restore();
  }

  drawSwimPlatform(ctx) {
    ctx.save();
    // Steps down the sugar scoop transom
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = '#c49a5b';
    ctx.beginPath();
    ctx.moveTo(-0.7, -4.85);
    ctx.lineTo(0.7, -4.85);
    ctx.moveTo(-0.6, -5.02);
    ctx.lineTo(0.6, -5.02);
    ctx.stroke();
    ctx.restore();
  }

  drawFenders(ctx) {
    ctx.save();
    for (const fender of this.specs.fenders) {
      // Draw hanging lanyard line from toerail to fender
      ctx.beginPath();
      ctx.moveTo(fender.x + 0.15, fender.y);
      ctx.lineTo(fender.x, fender.y);
      ctx.lineWidth = 0.02;
      ctx.strokeStyle = '#333333';
      ctx.stroke();

      // Cylindrical Fender body
      ctx.beginPath();
      ctx.ellipse(fender.x, fender.y, fender.radius, fender.radius * 1.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0277bd'; // Navy marine fender
      ctx.fill();
      ctx.lineWidth = 0.03;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Top/Bottom rubber eyes
      ctx.beginPath();
      ctx.arc(fender.x, fender.y - fender.radius * 1.4, 0.06, 0, Math.PI * 2);
      ctx.arc(fender.x, fender.y + fender.radius * 1.4, 0.06, 0, Math.PI * 2);
      ctx.fillStyle = '#263238';
      ctx.fill();
    }
    ctx.restore();
  }

  drawCleats(ctx, selectedCleatId, hoveredCleatId, isTargetMode = false) {
    ctx.save();
    const cleatEntries = Object.entries(this.specs.cleats);

    for (const [id, cleat] of cleatEntries) {
      const isSelected = selectedCleatId === id;
      const isHovered = hoveredCleatId === id;

      ctx.save();
      ctx.translate(cleat.x, cleat.y);

      // Interactive ring highlight if selected, hovered, or in target mode
      if (isSelected || isHovered || isTargetMode) {
        ctx.beginPath();
        ctx.arc(0, 0, 0.45, 0, Math.PI * 2);
        if (isSelected) {
          ctx.fillStyle = 'rgba(0, 230, 118, 0.4)';
          ctx.strokeStyle = '#00e676';
        } else if (isHovered) {
          ctx.fillStyle = 'rgba(0, 229, 255, 0.4)';
          ctx.strokeStyle = '#00e5ff';
        } else {
          ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
        }
        ctx.fill();
        ctx.lineWidth = 0.04;
        ctx.stroke();
      }

      // Horn Cleat Graphic
      ctx.beginPath();
      // Base plate
      ctx.rect(-0.06, -0.16, 0.12, 0.32);
      ctx.fillStyle = '#78909c';
      ctx.fill();

      // Cleat Horns
      ctx.beginPath();
      ctx.moveTo(-0.03, -0.22);
      ctx.lineTo(0.03, -0.22);
      ctx.lineTo(0.05, 0.22);
      ctx.lineTo(-0.05, 0.22);
      ctx.closePath();
      ctx.fillStyle = '#eceff1';
      ctx.fill();
      ctx.lineWidth = 0.02;
      ctx.strokeStyle = '#37474f';
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }

  drawDeckDetails(ctx) {
    ctx.save();
    // Bow Direction Arrow (Forward indicator)
    ctx.beginPath();
    ctx.moveTo(0, 4.4);
    ctx.lineTo(0.35, 3.8);
    ctx.lineTo(0.12, 3.8);
    ctx.lineTo(0.12, 3.4);
    ctx.lineTo(-0.12, 3.4);
    ctx.lineTo(-0.12, 3.8);
    ctx.lineTo(-0.35, 3.8);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0, 229, 255, 0.7)';
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 0.02;
    ctx.stroke();

    // Vessel Identification on Transom
    ctx.save();
    ctx.scale(1, -1);
    ctx.font = 'bold 0.28px sans-serif';
    ctx.fillStyle = '#1e3a8a';
    ctx.textAlign = 'center';
    ctx.fillText('BENETEAU 331', 0, 5.0);
    ctx.restore();

    ctx.restore();
  }
}
