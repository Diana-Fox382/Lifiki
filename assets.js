/**
 * assets.js — AssetManager: всё, что связано с картинками.
 *
 * 1. Пытается загрузить creature.png из папки с игрой.
 *    Если файл есть — существа рисуются этой картинкой
 *    (картинка должна «смотреть» вправо →).
 * 2. Если файла нет (по умолчанию) — рисуем милого чёрного пушистика-чернушку
 *    прямо кодом: тело, шевелящаяся шерсть, глазки, моргание.
 * 3. Заранее «запекает» спрайты (еда, яд, тело, свечение, фон) в невидимые
 *    canvas'ы — так рисование каждого кадра становится очень быстрым.
 */
class AssetManager {
  constructor() {
    this.creatureImage = null; // HTMLImageElement, если creature.png нашёлся
    this.sprites = {};
    this.background = null;
  }

  /** Возвращает Promise, который выполнится, когда ассеты готовы (с картинкой или без). */
  load() {
    this.buildSprites();
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        if (ok) {
          this.creatureImage = img;
          console.log('[Lifiki] creature.png загружен — используем картинку.');
        } else {
          console.log('[Lifiki] creature.png не найден — рисуем пушистика через Canvas API.');
        }
        resolve();
      };
      img.onload = () => finish(img.naturalWidth > 0);
      img.onerror = () => finish(false);
      setTimeout(() => finish(false), 2000); // страховка, если загрузка зависла
      img.src = 'creature.png';
    });
  }

  /** Создаёт невидимый canvas нужного размера. */
  static makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /** «Запекаем» все спрайты один раз при старте. */
  buildSprites() {
    // --- Тело чернушки: чёрный шар с лёгким бликом -----------------------
    {
      const c = AssetManager.makeCanvas(64, 64);
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(24, 22, 2, 32, 32, 31);
      grad.addColorStop(0, '#3b3b4a');
      grad.addColorStop(0.45, '#15151d');
      grad.addColorStop(1, '#050508');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(32, 32, 31, 0, TAU);
      g.fill();
      this.sprites.body = c;
    }

    // --- Мягкое свечение под существом (чтобы чёрное было видно на тёмном) -
    {
      const c = AssetManager.makeCanvas(64, 64);
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(190, 210, 255, 0.22)');
      grad.addColorStop(0.5, 'rgba(160, 180, 255, 0.08)');
      grad.addColorStop(1, 'rgba(160, 180, 255, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.sprites.halo = c;
    }

    // --- Еда: светящийся зелёный шарик с бликом --------------------------
    {
      const c = AssetManager.makeCanvas(48, 48);
      const g = c.getContext('2d');
      const glow = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      glow.addColorStop(0, 'rgba(120, 255, 170, 0.9)');
      glow.addColorStop(0.3, 'rgba(70, 230, 130, 0.45)');
      glow.addColorStop(1, 'rgba(70, 230, 130, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 48, 48);
      const core = g.createRadialGradient(21, 21, 1, 24, 24, 7);
      core.addColorStop(0, '#eafff0');
      core.addColorStop(0.5, '#7dffb0');
      core.addColorStop(1, '#22c06a');
      g.fillStyle = core;
      g.beginPath();
      g.arc(24, 24, 7, 0, TAU);
      g.fill();
      this.sprites.food = c;
    }

    // --- Яд: красная колючая звёздочка -----------------------------------
    {
      const c = AssetManager.makeCanvas(48, 48);
      const g = c.getContext('2d');
      const glow = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      glow.addColorStop(0, 'rgba(255, 90, 110, 0.85)');
      glow.addColorStop(0.35, 'rgba(230, 40, 80, 0.35)');
      glow.addColorStop(1, 'rgba(230, 40, 80, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, 48, 48);
      g.beginPath();
      const spikes = 8;
      for (let i = 0; i <= spikes * 2; i++) {
        const a = (i / (spikes * 2)) * TAU;
        const r = i % 2 === 0 ? 10 : 5;
        const x = 24 + Math.cos(a) * r, y = 24 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fillStyle = '#ff4d6d';
      g.fill();
      g.fillStyle = '#7a0024';
      g.beginPath();
      g.arc(24, 24, 3.2, 0, TAU);
      g.fill();
      this.sprites.poison = c;
    }
  }

  /** Фон: тёмно-синий градиент + звёздная пыль. Пересоздаётся при изменении размера окна. */
  buildBackground(w, h) {
    const c = AssetManager.makeCanvas(Math.max(1, w), Math.max(1, h));
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    grad.addColorStop(0, '#34416a');
    grad.addColorStop(0.55, '#202a48');
    grad.addColorStop(1, '#0f1426');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // «Пыль» — сотни крошечных точек для фактуры
    const dots = Math.floor((w * h) / 3500);
    for (let i = 0; i < dots; i++) {
      g.globalAlpha = randRange(0.04, 0.18);
      g.fillStyle = Math.random() < 0.8 ? '#c9d6ff' : '#ffd6f0';
      g.beginPath();
      g.arc(Math.random() * w, Math.random() * h, randRange(0.4, 1.4), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    this.background = c;
  }

  drawBackground(ctx, w, h) {
    if (this.background) ctx.drawImage(this.background, 0, 0, w, h);
  }

  /** Еда и яд слегка «дышат» (пульсируют). */
  drawFood(ctx, item, time) {
    const s = 22 * (1 + Math.sin(time * 3 + item.phase) * 0.1);
    ctx.drawImage(this.sprites.food, item.x - s / 2, item.y - s / 2, s, s);
  }

  drawPoison(ctx, item, time) {
    const s = 24 * (1 + Math.sin(time * 4 + item.phase) * 0.08);
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(time * 0.6 + item.phase); // яд медленно вращается — выглядит угрожающе
    ctx.drawImage(this.sprites.poison, -s / 2, -s / 2, s, s);
    ctx.restore();
  }

  drawHalo(ctx, x, y, r) {
    const s = r * 5;
    ctx.drawImage(this.sprites.halo, x - s / 2, y - s / 2, s, s);
  }

  /**
   * Рисует существо в ЕГО СОБСТВЕННЫХ координатах:
   * (0,0) — центр, ось X смотрит «вперёд» (куда оно движется).
   * Поворот и масштаб уже применены снаружи (см. Creature.draw).
   */
  drawCreature(ctx, creature, r, time, speedRatio) {
    if (this.creatureImage) {
      ctx.drawImage(this.creatureImage, -r * 1.5, -r * 1.5, r * 3, r * 3);
      return;
    }
    this.drawFur(ctx, creature, r, time, speedRatio);
    ctx.drawImage(this.sprites.body, -r * 0.95, -r * 0.95, r * 1.9, r * 1.9);
    this.drawEyes(ctx, creature, r);
  }

  /**
   * Симуляция шерсти: каждая шерстинка — изогнутая линия от тела наружу.
   * Кончик шерстинки качается по синусоиде (у каждой своя фаза и скорость),
   * а при движении шерсть «сдувает» назад. При поглаживании — дрожит от мурчания.
   */
  drawFur(ctx, creature, r, time, speedRatio) {
    const purr = creature.isPetted;
    const drag = speedRatio * r * 0.35;

    // Слой 1: густая тёмная шерсть
    ctx.beginPath();
    for (const s of creature.fur) {
      const wave = Math.sin(time * s.speed + s.phase) * 0.22
        + (purr ? Math.sin(time * 32 + s.phase) * 0.12 : 0);
      const baseX = Math.cos(s.angle) * r * 0.55;
      const baseY = Math.sin(s.angle) * r * 0.55;
      const tipR = r * (0.95 + s.length * 0.3);
      const tipA = s.angle + wave + s.curl;
      const tipX = Math.cos(tipA) * tipR - drag;
      const tipY = Math.sin(tipA) * tipR;
      const ctrlA = s.angle + wave * 0.4;
      const ctrlX = Math.cos(ctrlA) * r * 0.85 - drag * 0.4;
      const ctrlY = Math.sin(ctrlA) * r * 0.85;
      ctx.moveTo(baseX, baseY);
      ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    }
    ctx.strokeStyle = '#08080c';
    ctx.lineWidth = Math.max(1.1, r * 0.13);
    ctx.lineCap = 'round';
    ctx.stroke();

    // Слой 2: тонкие светлые кончики — дают «блеск» шерсти
    ctx.beginPath();
    for (let i = 0; i < creature.fur.length; i += 2) {
      const s = creature.fur[i];
      const wave = Math.sin(time * s.speed + s.phase) * 0.22;
      const tipR = r * (0.9 + s.length * 0.28);
      const tipA = s.angle + wave + s.curl;
      ctx.moveTo(Math.cos(s.angle) * r * 0.8, Math.sin(s.angle) * r * 0.8);
      ctx.lineTo(Math.cos(tipA) * tipR - drag, Math.sin(tipA) * tipR);
    }
    ctx.strokeStyle = 'rgba(120, 125, 160, 0.35)';
    ctx.lineWidth = Math.max(0.6, r * 0.06);
    ctx.stroke();
  }

  /** Глазки: моргают, смотрят на еду, сонные при голоде, «^ ^» при поглаживании. */
  drawEyes(ctx, creature, r) {
    const ex = r * 0.34;   // глаза ближе к «носу» (вперёд по оси X)
    const ey = r * 0.36;   // расстояние между глазами
    const erx = r * 0.27;
    const ery = r * 0.31;

    if (creature.isPetted) {
      // Счастливые глазки-дужки + румянец
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, r * 0.12);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(ex - erx * 0.55, side * ey, erx * 0.8, -1.1, 1.1);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 120, 170, 0.55)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(r * 0.1, side * r * 0.66, r * 0.14, r * 0.2, 0, 0, TAU);
        ctx.fill();
      }
      return;
    }

    let open = 1 - creature.blink;
    if (creature.energy < CONFIG.energy.max * 0.25) open *= 0.55; // голодный — сонный
    open = Math.max(0.08, open);

    const lookX = Math.cos(creature.lookAngle) * erx * 0.38;
    const lookY = Math.sin(creature.lookAngle) * ery * 0.38;

    for (const side of [-1, 1]) {
      const cy = side * ey;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(ex, cy, erx, ery * open, 0, 0, TAU);
      ctx.fill();
      if (open > 0.3) {
        const px = ex + lookX, py = cy + lookY * open;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(px, py, r * 0.14, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px + r * 0.04, py - r * 0.05, r * 0.045, 0, TAU);
        ctx.fill();
      }
    }
  }

  /** Маленькая золотая корона над рекордсменом (самым старым живым существом). */
  drawCrown(ctx, x, y, time) {
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 3) * 1.5);
    ctx.beginPath();
    ctx.moveTo(-7, 4);
    ctx.lineTo(-7, -3);
    ctx.lineTo(-3.5, 1);
    ctx.lineTo(0, -5);
    ctx.lineTo(3.5, 1);
    ctx.lineTo(7, -3);
    ctx.lineTo(7, 4);
    ctx.closePath();
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.strokeStyle = '#b07d10';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}
