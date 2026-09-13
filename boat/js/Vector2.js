/**
 * 2D Vector mathematics utility class.
 */
export class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  clone() {
    return new Vector2(this.x, this.y);
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  static add(a, b) {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  static sub(a, b) {
    return new Vector2(a.x - b.x, a.y - b.y);
  }

  multiplyScalar(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  static multiplyScalar(v, s) {
    return new Vector2(v.x * s, v.y * s);
  }

  divideScalar(s) {
    if (s !== 0) {
      this.x /= s;
      this.y /= s;
    }
    return this;
  }

  static divideScalar(v, s) {
    if (s !== 0) {
      return new Vector2(v.x / s, v.y / s);
    }
    return new Vector2(0, 0);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length();
    if (len > 1e-6) {
      this.x /= len;
      this.y /= len;
    } else {
      this.x = 0;
      this.y = 0;
    }
    return this;
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  /**
   * 2D Cross product (wedge product scalar): a.x * b.y - a.y * b.x
   */
  cross(v) {
    return this.x * v.y - this.y * v.x;
  }

  static cross(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y);
  }

  angle() {
    // Angle in radians from +X axis
    return Math.atan2(this.y, this.x);
  }

  /**
   * Rotates this vector by angle (radians) counter-clockwise
   */
  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  static rotate(v, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vector2(
      v.x * cos - v.y * sin,
      v.x * sin + v.y * cos
    );
  }
}
