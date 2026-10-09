/**
 * logo.js — живой логотип рядом с надписью «Lifiki».
 *
 * Это настоящая маленькая чернушка (тот же класс Creature, та же физика
 * шерсти и то же асимметричное дыхание), только живёт она в крошечном
 * canvas'е в шапке панели и не участвует в симуляции:
 *   • лёгкое «геймдевное» покачивание: плавает вверх-вниз и чуть в стороны,
 *     шерсть отстаёт по инерции;
 *   • зрачки следят за курсором мыши;
 *   • навели курсор на логотип — мурчит (глазки «^ ^», дрожь, шерсть пушится).
 */
class LogoSoot {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.size = 46; // CSS-пиксели
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = this.size * dpr;
    canvas.height = this.size * dpr;
    canvas.style.width = `${this.size}px`;
    canvas.style.height = `${this.size}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Маленькая чернушка с «логотипной» ДНК
    const dna = new DNA({ baseRadius: 11, hairCount: 30, hairLength: 8, numEyes: 2, visionRadius: 100 });
    this.soot = new Creature(this.size / 2, this.size / 2, null, 0, dna);
    this.soot.appear = 1;
    this.soot.energy = this.soot.maxEnergy; // сытая и довольная
    this.t = 0;

    // Куда смотреть: координаты мыши относительно центра логотипа
    this.lookX = 0;
    this.lookY = 0;
    window.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.lookX = e.clientX - (rect.left + rect.width / 2);
      this.lookY = e.clientY - (rect.top + rect.height / 2);
    });
    canvas.addEventListener('pointermove', () => this.soot.pet(0.3));
    canvas.addEventListener('pointerdown', () => this.soot.pet(1.2));
  }

  render(dt, now) {
    const s = this.soot;
    this.t += dt;
    if (s.pettingTimer > 0) s.pettingTimer -= dt;
    s.updateAnimations(dt);

    // Покачивание: плавное «парение» по восьмёрке
    const c = this.size / 2;
    s.x = c + Math.sin(this.t * 1.3) * 1.6;
    s.y = c + Math.sin(this.t * 2.1) * 2.2;

    // Зрачки смотрят на курсор (через «виртуальную скорость» — так их считает Creature)
    const d = Math.hypot(this.lookX, this.lookY) || 1;
    const k = Math.min(1, d / 200);
    s.vx = (this.lookX / d) * k * s.maxSpeed * 0.6;
    s.vy = (this.lookY / d) * k * s.maxSpeed * 0.6;
    s.walkPhase = 0; // но не «шагаем» на месте

    s.animateVisuals(dt, now);
    this.ctx.clearRect(0, 0, this.size, this.size);
    s.drawSoot(this.ctx, this.assets, now);
  }
}
