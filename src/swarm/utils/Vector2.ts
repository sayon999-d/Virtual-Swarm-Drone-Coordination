export class Vector2 {
  constructor(public x: number, public y: number) {}

  add(v: Vector2): Vector2 {
    return new Vector2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vector2): Vector2 {
    return new Vector2(this.x - v.x, this.y - v.y);
  }

  mult(n: number): Vector2 {
    return new Vector2(this.x * n, this.y * n);
  }

  div(n: number): Vector2 {
    return new Vector2(this.x / n, this.y / n);
  }

  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  magSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): Vector2 {
    const m = this.mag();
    if (m !== 0) {
      return this.div(m);
    }
    return new Vector2(0, 0);
  }

  limit(max: number): Vector2 {
    if (this.magSq() > max * max) {
      return this.normalize().mult(max);
    }
    return new Vector2(this.x, this.y);
  }

  distance(v: Vector2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  distanceSq(v: Vector2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  copy(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  lerp(v: Vector2, t: number): Vector2 {
    return new Vector2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t);
  }

  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }
}
