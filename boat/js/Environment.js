import { Vector2 } from './Vector2.js';
import { KNOTS_TO_MS, MS_TO_KNOTS } from './config.js';

/**
 * Environmental conditions: Wind and Current simulation.
 */
export class Environment {
  constructor() {
    // Wind: direction FROM which wind blows (0 = North, 90 = East, 180 = South, 270 = West)
    this.windSpeedKnots = 10;
    this.windDirectionDeg = 270; // Default: West wind (crosswind from port as boat heads North)
    this.windGustiness = 0.15;   // Gust factor (0 = steady, 0.3 = gusty)

    // Current: direction TOWARDS which water is flowing (set)
    this.currentSpeedKnots = 0.5;
    this.currentDirectionDeg = 0; // Default: flowing North into slip

    // Internal timers for gusts
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
  }

  /**
   * Returns current true wind velocity vector in m/s (World coordinates).
   * Direction is where wind blows TOWARDS in world space.
   */
  getWindVelocityWorld() {
    // Nautical wind: angle is FROM. So velocity points in opposite direction: angle + 180 deg
    const fromAngleRad = (this.windDirectionDeg * Math.PI) / 180;
    // 0 deg (North) blows South (-Y). 90 deg (East) blows West (-X).
    // Vector pointing towards where wind goes:
    const toAngle = fromAngleRad + Math.PI;

    // Subtle gust oscillation
    const gustNoise = Math.sin(this.time * 0.7) * 0.5 + Math.sin(this.time * 1.9 + 1.2) * 0.3;
    const gustMultiplier = 1.0 + this.windGustiness * gustNoise;
    const speedMs = Math.max(0, this.windSpeedKnots * KNOTS_TO_MS * gustMultiplier);

    // In 2D math where +Y is North and +X is East:
    // angle 0 is North: x = 0, y = 1.
    // So for fromAngle: x = -sin(fromAngle), y = -cos(fromAngle)
    return new Vector2(
      -Math.sin(fromAngleRad) * speedMs,
      -Math.cos(fromAngleRad) * speedMs
    );
  }

  /**
   * Returns water current velocity vector in m/s (World coordinates).
   * Direction is where current is flowing TOWARDS (0 = North, 90 = East, etc.)
   */
  getCurrentVelocityWorld() {
    const towardsAngleRad = (this.currentDirectionDeg * Math.PI) / 180;
    const speedMs = this.currentSpeedKnots * KNOTS_TO_MS;

    // 0 = flowing North (+Y), 90 = flowing East (+X)
    return new Vector2(
      Math.sin(towardsAngleRad) * speedMs,
      Math.cos(towardsAngleRad) * speedMs
    );
  }

  /**
   * Calculates apparent wind vector experienced by the boat:
   * V_apparent = V_wind_true - V_boat
   */
  getApparentWind(boatVelocityWorld) {
    const trueWind = this.getWindVelocityWorld();
    return Vector2.sub(trueWind, boatVelocityWorld);
  }

  setWind(speedKnots, directionDeg) {
    this.windSpeedKnots = Math.max(0, speedKnots);
    this.windDirectionDeg = (directionDeg % 360 + 360) % 360;
  }

  setCurrent(speedKnots, directionDeg) {
    this.currentSpeedKnots = Math.max(0, speedKnots);
    this.currentDirectionDeg = (directionDeg % 360 + 360) % 360;
  }
}
