/**
 * seasons.js — климат и смена сезонов (класс Climate).
 *
 * Год состоит из 4 сезонов: Весна → Лето → Осень → Зима → Весна…
 * У каждого сезона «целевая» температура:
 *     Весна  0 (нейтрально)   Лето +1 (жара)
 *     Осень  0 (нейтрально)   Зима −1 (холод)
 * Последние 20 % каждого сезона температура плавно перетекает
 * к следующему — никаких резких скачков.
 *
 * Как климат влияет на эволюцию (Climate.thermalCost):
 *   • Зимой существа с малым количеством шерсти ЗАМЕРЗАЮТ:
 *       доп. трата = coldCost × холод × (1 − шерсть)²
 *   • Летом пушистые ПЕРЕГРЕВАЮТСЯ:
 *       доп. трата = heatCost × жара × шерсть²
 *   • Весной и осенью штрафа нет — передышка.
 * «Шерсть» здесь — traits.fur из ДНК: (волоски × длина) / 2000, от 0.05 до 1.
 *
 * Время климата — игровое: на паузе сезоны стоят, на x4 летят вчетверо быстрее.
 */
const SEASONS = [
  { name: 'Весна', icon: '🌸', temp: 0 },
  { name: 'Лето', icon: '☀️', temp: 1 },
  { name: 'Осень', icon: '🍂', temp: 0 },
  { name: 'Зима', icon: '❄️', temp: -1 },
];

class Climate {
  constructor() {
    this.yearPhase = 0;      // 0..1 — где мы в году (0 = начало весны)
    this.temperature = 0;    // −1 (лютая зима) … +1 (пекло)
    this.flakes = [];        // снежинки (только для красоты)
    this.shimmerTime = 0;    // время для «марева» летом
  }

  // --- Состояние ------------------------------------------------------------
  get seasonIndex() { return Math.floor(this.yearPhase * 4) % 4; }
  get season() { return SEASONS[this.seasonIndex]; }
  get nextSeason() { return SEASONS[(this.seasonIndex + 1) % 4]; }
  /** Насколько прошёл текущий сезон (0..1). */
  get seasonProgress() { return (this.yearPhase * 4) % 1; }
  /** Секунды игрового времени до следующего сезона. */
  get secondsToNextSeason() { return (1 - this.seasonProgress) * CONFIG.climate.seasonLength; }
  get cold() { return Math.max(0, -this.temperature); }
  get heat() { return Math.max(0, this.temperature); }
  /** Температура «для людей»: −1 → −20 °C, 0 → +12 °C, +1 → +38 °C. */
  get celsius() {
    const t = this.temperature;
    return t < 0 ? 12 + t * 32 : 12 + t * 26;
  }

  /** Шаг климата (игровое время). */
  update(dt) {
    // Скорость хода года зависит от длины сезона: её можно менять «на лету» ползунком,
    // и сезон не «перепрыгнет», потому что мы накапливаем фазу, а не делим общее время.
    this.yearPhase = (this.yearPhase + dt / (4 * CONFIG.climate.seasonLength)) % 1;

    const i = this.seasonIndex;
    const q = this.seasonProgress;
    const from = SEASONS[i].temp;
    const to = SEASONS[(i + 1) % 4].temp;
    const blend = CONFIG.climate.transition;          // доля сезона на плавный переход
    const k = q < 1 - blend ? 0 : (q - (1 - blend)) / blend;
    const smooth = k * k * (3 - 2 * k);                // smoothstep: мягкое начало и конец
    this.temperature = lerp(from, to, smooth);
  }

  /** Дополнительная трата энергии в секунду из-за погоды для данного тела. */
  thermalCost(traits) {
    const c = CONFIG.climate;
    const f = traits.fur;
    const freeze = c.coldCost * this.cold * (1 - f) * (1 - f);
    const overheat = c.heatCost * this.heat * f * f;
    return c.strength * (freeze + overheat);
  }

  /** Насколько существо мёрзнет (0..1) — для дрожи. */
  coldStress(traits) {
    const f = traits.fur;
    return CONFIG.climate.strength * this.cold * (1 - f) * (1 - f);
  }

  /** Насколько существо перегревается (0..1). */
  heatStress(traits) {
    return CONFIG.climate.strength * this.heat * traits.fur * traits.fur;
  }

  // ===========================================================================
  //  ВИЗУАЛ (реальное время, работает и на паузе)
  // ===========================================================================

  /** Снежинки: их количество зависит от того, насколько холодно. */
  animate(dt, w, h) {
    this.shimmerTime += dt;
    const target = Math.round(CONFIG.climate.maxSnowflakes * this.cold);

    for (let i = this.flakes.length - 1; i >= 0; i--) {
      const f = this.flakes[i];
      f.y += f.vy * dt;
      f.x += Math.sin(this.shimmerTime * f.swaySpeed + f.phase) * 12 * dt;
      if (f.x < 0) f.x += w; else if (f.x > w) f.x -= w;
      if (f.y > h + 5) {
        // Упала: если снега стало меньше нужного — исчезает, иначе снова сверху
        if (this.flakes.length > target) this.flakes.splice(i, 1);
        else { f.y = -5; f.x = Math.random() * w; }
      }
    }
    // Добавляем по чуть-чуть, чтобы снег начинался постепенно
    if (this.flakes.length < target && Math.random() < 0.5) {
      this.flakes.push({
        x: Math.random() * w, y: -5,
        vy: randRange(18, 40),
        r: randRange(0.8, 2.2),
        phase: randRange(0, TAU),
        swaySpeed: randRange(0.5, 1.5),
        alpha: randRange(0.35, 0.8),
      });
    }
  }

  /**
   * Фон. Летом рисуем его горизонтальными полосками со сдвигом по синусоиде —
   * получается лёгкое «марево» (искажение горячего воздуха).
   */
  drawBackground(ctx, assets, w, h) {
    const bg = assets.background;
    if (!bg) return;
    const amp = this.heat * CONFIG.climate.shimmer;
    if (amp < 0.2) {
      ctx.drawImage(bg, 0, 0, w, h);
      return;
    }
    const strip = 6;
    const t = this.shimmerTime;
    for (let y = 0; y < h; y += strip) {
      const dx = Math.sin(y * 0.045 + t * 2.2) * amp + Math.sin(y * 0.11 - t * 3.1) * amp * 0.4;
      ctx.drawImage(bg, 0, y, w, strip, dx, y, w, strip);
      // Закрываем щель у края, которая появляется при сдвиге
      if (dx > 0) ctx.drawImage(bg, 0, y, 1, strip, 0, y, dx, strip);
      else if (dx < 0) ctx.drawImage(bg, w - 1, y, 1, strip, w + dx, y, -dx, strip);
    }
  }

  /** Оттенок фона: морозный синий зимой, тёмный красно-оранжевый летом. */
  drawTint(ctx, w, h) {
    if (this.cold > 0.01) {
      ctx.fillStyle = `rgba(70, 140, 255, ${0.16 * this.cold})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.heat > 0.01) {
      ctx.fillStyle = `rgba(190, 70, 20, ${0.2 * this.heat})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  drawSnow(ctx) {
    if (this.flakes.length === 0) return;
    ctx.fillStyle = '#ffffff';
    for (const f of this.flakes) {
      ctx.globalAlpha = f.alpha;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Цвет «блеска» на кончиках шерсти: иней зимой, тёплый отблеск летом. */
  furSheen() {
    if (this.cold > 0.05) return `rgba(215, 235, 255, ${0.3 + 0.35 * this.cold})`;
    if (this.heat > 0.05) return `rgba(255, 170, 120, ${0.25 + 0.15 * this.heat})`;
    return 'rgba(130, 135, 170, 0.3)';
  }
}
