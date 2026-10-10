/**
 * particles.js — простая система частиц.
 *
 * Частица — это маленький объект с позицией, скоростью и «временем жизни».
 * Каждый кадр мы двигаем все частицы, уменьшаем им жизнь и удаляем умершие.
 *
 * Типы частиц:
 *   heart   — сердечки при поглаживании;
 *   sparkle — светящиеся искорки (еда, деление, появление);
 *   soot    — сажа, в которую рассыпается умерший пушистик.
 */
class ParticleSystem {
  constructor(maxParticles = 900) {
    this.particles = [];
    this.maxParticles = maxParticles;
    this.heartSprite = ParticleSystem.createHeartSprite();
  }

  /** Контур сердечка в прямоугольнике (x, y, w, h). */
  static heartPath(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y + h / 4);
    ctx.quadraticCurveTo(x, y, x + w / 4, y);
    ctx.quadraticCurveTo(x + w / 2, y, x + w / 2, y + h / 4);
    ctx.quadraticCurveTo(x + w / 2, y, x + (w * 3) / 4, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + h / 4);
    ctx.quadraticCurveTo(x + w, y + h / 2, x + (w * 3) / 4, y + (h * 3) / 4);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x + w / 4, y + (h * 3) / 4);
    ctx.quadraticCurveTo(x, y + h / 2, x, y + h / 4);
    ctx.closePath();
  }

  /**
   * Рисуем красивое сердечко ОДИН раз в отдельный (невидимый) canvas.
   * Потом просто копируем картинку — это намного быстрее, чем каждый раз
   * строить градиенты и тени.
   */
  static createHeartSprite() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');

    g.shadowColor = 'rgba(255, 80, 140, 0.9)';
    g.shadowBlur = 10;
    const grad = g.createLinearGradient(0, 12, 0, 54);
    grad.addColorStop(0, '#ffc2da');
    grad.addColorStop(1, '#ff3d7f');
    g.fillStyle = grad;
    ParticleSystem.heartPath(g, 12, 14, 40, 36);
    g.fill();

    // Блик
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255, 255, 255, 0.75)';
    g.beginPath();
    g.ellipse(23, 23, 5, 3, -0.6, 0, TAU);
    g.fill();
    return c;
  }

  add(p) {
    if (this.particles.length >= this.maxParticles) this.particles.shift();
    this.particles.push(p);
  }

  /** Одно сердечко, улетающее вверх. */
  emitHeart(x, y) {
    const life = randRange(1.2, 1.7);
    this.add({
      type: 'heart',
      x: x + randRange(-6, 6), y,
      vx: randRange(-28, 28), vy: randRange(-80, -45),
      gravity: -12,           // отрицательная гравитация — сердечки «всплывают»
      life, maxLife: life,
      size: randRange(11, 18),
      rotation: randRange(-0.3, 0.3),
      wobble: randRange(0, TAU),
    });
  }

  /** Россыпь искорок заданного цвета. */
  emitSparkles(x, y, color, count = 8, speed = 70) {
    for (let i = 0; i < count; i++) {
      const a = randRange(0, TAU);
      const s = randRange(speed * 0.3, speed);
      const life = randRange(0.35, 0.8);
      this.add({
        type: 'sparkle',
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        gravity: 0,
        life, maxLife: life,
        size: randRange(1.5, 3.2),
        color,
      });
    }
  }

  /** Облачко сажи — так «умирает» чернушка. */
  emitSoot(x, y, radius) {
    for (let i = 0; i < 12; i++) {
      const a = randRange(0, TAU);
      const s = randRange(10, 45);
      const life = randRange(0.8, 1.6);
      this.add({
        type: 'soot',
        x: x + Math.cos(a) * radius * 0.5, y: y + Math.sin(a) * radius * 0.5,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10,
        gravity: -8,
        life, maxLife: life,
        size: randRange(2, radius * 0.45),
      });
    }
  }

  update(dt) {
    // «Уплотняем» массив на месте: живые частицы сдвигаются вперёд, мёртвые отбрасываются.
    let alive = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'heart') {
        p.wobble += dt * 4;
        p.vx *= 1 - dt * 1.5; // сердечки быстро теряют боковую скорость
      } else {
        p.vx *= 1 - dt * 2;
        p.vy *= 1 - dt * 2;
      }
      this.particles[alive++] = p;
    }
    this.particles.length = alive;
  }

  draw(ctx) {
    // 1-й проход: сажа и сердечки (обычное смешивание цветов)
    for (const p of this.particles) {
      const t = 1 - p.life / p.maxLife; // 0 → только родилась, 1 → умирает
      if (p.type === 'soot') {
        ctx.globalAlpha = (1 - t) * 0.55;
        ctx.fillStyle = '#0a0a10';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 + t), 0, TAU);
        ctx.fill();
      } else if (p.type === 'heart') {
        const appear = t < 0.18 ? easeOutBack(t / 0.18) : 1;
        ctx.globalAlpha = t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
        const s = p.size * appear;
        ctx.save();
        ctx.translate(p.x + Math.sin(p.wobble) * 4, p.y);
        ctx.rotate(p.rotation + Math.sin(p.wobble) * 0.25);
        ctx.drawImage(this.heartSprite, -s, -s, s * 2, s * 2);
        ctx.restore();
      }
    }

    // 2-й проход: светящиеся искорки (режим «lighter» складывает цвета — получается свечение)
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.type !== 'sparkle') continue;
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
