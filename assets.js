/**
 * assets.js — AssetManager: всё, что связано с картинками.
 *
 * 1. Пытается загрузить creature.png из папки с игрой.
 *    Если файл есть — существа рисуются этой картинкой
 *    (картинка должна «смотреть» вправо →).
 * 2. Если файла нет (по умолчанию) — рисуем милую чернушку прямо кодом:
 *    чёрное ядро и большие глаза (здесь) + шерсть с физикой (fur.js).
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
    // --- Ядро чернушки: чёрный шар с бликом и пушистым «подшёрстком» -----
    // Сотни коротких ворсинок по краю рисуются ОДИН раз в спрайт, поэтому
    // край выглядит мохнатым, но не стоит ни капли FPS.
    {
      const size = 128, c0 = size / 2, R = 46;
      const c = AssetManager.makeCanvas(size, size);
      const g = c.getContext('2d');
      g.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const a = Math.random() * TAU;
        const r0 = R * randRange(0.7, 0.95);
        const r1 = R * randRange(1.05, 1.35);
        const bend = randRange(-0.25, 0.25);
        g.strokeStyle = Math.random() < 0.85 ? '#060609' : '#2a2a36';
        g.lineWidth = randRange(1.5, 3);
        g.beginPath();
        g.moveTo(c0 + Math.cos(a) * r0, c0 + Math.sin(a) * r0);
        g.lineTo(c0 + Math.cos(a + bend) * r1, c0 + Math.sin(a + bend) * r1);
        g.stroke();
      }
      const grad = g.createRadialGradient(c0 - 14, c0 - 16, 3, c0, c0, R);
      grad.addColorStop(0, '#3b3b4a');
      grad.addColorStop(0.45, '#15151d');
      grad.addColorStop(1, '#050508');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(c0, c0, R, 0, TAU);
      g.fill();
      this.sprites.body = c;
      this.sprites.bodyScale = size / 2 / R; // во сколько раз спрайт больше самого шара
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

    // --- Оранжевое «марево» вокруг перегревшегося существа (летом) ---------
    {
      const c = AssetManager.makeCanvas(64, 64);
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 120, 40, 0.5)');
      grad.addColorStop(0.5, 'rgba(255, 90, 30, 0.18)');
      grad.addColorStop(1, 'rgba(255, 90, 30, 0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      this.sprites.heat = c;
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

  /** Перегрев: пульсирующее оранжевое свечение, сила 0..1. */
  drawHeatGlow(ctx, x, y, r, strength, now) {
    const s = r * 2.6 * (1 + Math.sin(now * 0.006) * 0.08);
    ctx.globalAlpha = Math.min(1, strength);
    ctx.drawImage(this.sprites.heat, x - s / 2, y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }

  drawHalo(ctx, x, y, r) {
    const s = r * 5;
    ctx.drawImage(this.sprites.halo, x - s / 2, y - s / 2, s, s);
  }

  /** Режим creature.png: картинка уже повёрнута и масштабирована снаружи. */
  drawCreatureImage(ctx, r) {
    ctx.drawImage(this.creatureImage, -r * 1.5, -r * 1.5, r * 3, r * 3);
  }

  /**
   * Чёрное круглое ядро чернушки. Рисуется в координатах ядра:
   * (0,0) — центр, деформация (дыхание, мурчание…) уже применена снаружи.
   */
  drawSootCore(ctx, coreR) {
    const s = coreR * this.sprites.bodyScale; // учитываем ворсинки за краем шара
    ctx.drawImage(this.sprites.body, -s, -s, s * 2, s * 2);
  }

  /**
   * Раскладки глаз в зависимости от гена numEyes.
   * x, y — позиция в долях радиуса ядра; size — множитель размера глаза.
   */
  static eyeLayout(numEyes) {
    switch (numEyes) {
      case 1: // циклоп — один большой глаз
        return [{ x: 0, y: -0.05, size: 1.45 }];
      case 3: // забавная кучка: два внизу, один сверху
        return [
          { x: -0.33, y: 0.06, size: 0.85 },
          { x: 0.33, y: 0.06, size: 0.85 },
          { x: 0, y: -0.38, size: 0.75 },
        ];
      case 4: // сетка 2×2
        return [
          { x: -0.3, y: -0.26, size: 0.72 },
          { x: 0.3, y: -0.26, size: 0.72 },
          { x: -0.3, y: 0.24, size: 0.72 },
          { x: 0.3, y: 0.24, size: 0.72 },
        ];
      default: // 2 — классика
        return [
          { x: -0.31, y: -0.06, size: 1 },
          { x: 0.31, y: -0.06, size: 1 },
        ];
    }
  }

  /**
   * Большие милые глаза (количество и раскладка — из ДНК).
   * Не вращаются вместе с движением — всегда смотрят на зрителя.
   *   • зрачки смещаются в сторону движения (creature.pupilX / pupilY);
   *   • моргание; при голоде — сонные полузакрытые глаза;
   *   • при поглаживании — счастливые «^ ^» и румянец.
   */
  drawSootEyes(ctx, creature, r) {
    const eyes = AssetManager.eyeLayout(creature.dna.numEyes);
    const baseRX = r * 0.26;
    const baseRY = r * 0.31;

    if (creature.isPetted) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      for (const e of eyes) {
        const erx = baseRX * e.size, ery = baseRY * e.size;
        ctx.lineWidth = Math.max(1.2, r * 0.11 * e.size);
        ctx.beginPath();
        ctx.arc(e.x * r, e.y * r + ery * 0.45, erx * 0.8, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255, 120, 170, 0.6)';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * r * 0.5, r * 0.36, r * 0.13, r * 0.08, 0, 0, TAU);
        ctx.fill();
      }
      return;
    }

    let open = 1 - creature.blink;
    if (creature.energyRatio < 0.25) open *= 0.55; // голодный — сонный
    open = Math.max(0.08, open);

    const shift = CONFIG.soot.pupilShift;
    for (const e of eyes) {
      const cx = e.x * r, cy = e.y * r;
      const erx = baseRX * e.size, ery = baseRY * e.size;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(cx, cy, erx, ery * open, 0, 0, TAU);
      ctx.fill();
      if (open > 0.3) {
        const px = cx + creature.pupilX * erx * shift;
        const py = cy + creature.pupilY * ery * shift * open;
        const pr = r * 0.13 * e.size;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, TAU);
        ctx.fill();
        // Блик в глазу — делает взгляд «живым»
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px + pr * 0.3, py - pr * 0.38, pr * 0.32, 0, TAU);
        ctx.fill();
      }
    }
  }

  /**
   * Пиксельная звёздочка над рекордсменом (самым старым живым существом).
   * Нарисована по клеточкам, как в пиксель-арте:
   *   o — тёмно-золотой контур, y — жёлтый, l — светлый блик.
   * Рисуем её в крошечный canvas 11×11 один раз, а потом увеличиваем
   * БЕЗ сглаживания (imageSmoothingEnabled = false) — пиксели остаются чёткими.
   */
  static buildStarSprite() {
    const rows = [
      '.....o.....',
      '....oyo....',
      '....oyo....',
      'ooooyyyoooo',
      'oyyyylyyyyo',
      '.oyyllyyyo.',
      '..oyyyyyo..',
      '..oyyyyyo..',
      '.oyyyoyyyo.',
      '.oyyo.oyyo.',
      '.ooo...ooo.',
    ];
    const colors = { o: '#a87a00', y: '#ffd93b', l: '#fff6b0' };
    const c = AssetManager.makeCanvas(11, 11);
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        if (!colors[ch]) return;
        g.fillStyle = colors[ch];
        g.fillRect(x, y, 1, 1);
      });
    });
    return c;
  }

  /** Звёздочка плавно подпрыгивает (bounce) и чуть покачивается. */
  drawStar(ctx, x, y, time) {
    if (!this.sprites.star) this.sprites.star = AssetManager.buildStarSprite();
    const phase = time * 2.6;
    const bounce = Math.abs(Math.sin(phase)) * 5;          // «прыг-прыг»
    const squash = 1 + Math.max(0, 0.12 - Math.abs(Math.sin(phase)) * 0.4); // сплющилась у «земли»
    const tilt = Math.sin(phase * 0.5) * 0.12;
    const size = 22;                                        // 11 пикселей × 2

    ctx.save();
    ctx.translate(x, y - bounce);
    // Мягкое золотое свечение за звездой
    ctx.globalAlpha = 0.5;
    ctx.drawImage(this.sprites.halo, -size, -size, size * 2, size * 2);
    ctx.globalAlpha = 1;
    ctx.rotate(tilt);
    ctx.scale(squash, 2 - squash);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.sprites.star, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  /**
   * Облачко речи со «словом» (см. language.js).
   * @param {object} word  — {color, id}
   * @param {number} alpha — насколько громко (0..1)
   */
  drawSpeechBubble(ctx, x, y, word, alpha) {
    const w = 22, h = 18, r = 6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    // Облачко с хвостиком вниз-влево (к говорящему)
    ctx.beginPath();
    ctx.moveTo(-w / 2 + r, -h / 2);
    ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
    ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
    ctx.lineTo(-w / 2 + 8, h / 2);
    ctx.lineTo(-w / 2 - 2, h / 2 + 6);
    ctx.lineTo(-w / 2 + 3, h / 2);
    ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
    ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fill();

    // Символ слова
    ctx.fillStyle = word.color;
    ctx.strokeStyle = word.color;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    switch (word.id) {
      case 'triangle':
        ctx.moveTo(0, -5.5); ctx.lineTo(6, 4.5); ctx.lineTo(-6, 4.5); ctx.closePath(); ctx.fill();
        break;
      case 'wave':
        ctx.moveTo(-7, 0);
        ctx.bezierCurveTo(-4.5, -6, -2, -6, 0, 0);
        ctx.bezierCurveTo(2, 6, 4.5, 6, 7, 0);
        ctx.stroke();
        break;
      case 'square':
        ctx.rect(-4.5, -4.5, 9, 9); ctx.fill();
        break;
      default: // circle
        ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
