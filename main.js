/**
 * main.js — «дирижёр» игры. Класс Simulation:
 *   • создаёт мир, существ, частицы, Hive Mind и интерфейс;
 *   • обрабатывает мышь/палец (поглаживание);
 *   • крутит игровой цикл: update (логика) → render (рисование) ~60 раз в секунду.
 */
class Simulation {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.assets = assets;
    this.ui = new UI();
    this.world = new World(window.innerWidth, window.innerHeight);
    this.particles = new ParticleSystem(CONFIG.simulation.maxParticles);
    // Карма Создателя: скрытая переменная −1…1 (см. addKarma). От неё зависит,
    // какие фигуры существа покажут на «Сеансе связи».
    this.karma = 0;
    this.hive = new HiveMind(() => ({ karma: this.karma, lexicon: this.language.summary() }));
    this.language = new LanguageStats(); // «словарь»: наблюдаем, что значат слова
    this.logo = new LogoSoot(document.getElementById('logo'), assets);

    this.time = 0;            // «игровое» время в секундах (на паузе стоит)
    this.paused = false;
    this.speed = 1;           // 1x, 2x, 4x
    this.lastFrame = 0;
    this.uiTimer = 0;
    this.respawnTimer = 0;

    // Состояние указателя (мышь или палец)
    this.pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, down: false, inside: false };
    this.dragged = null;      // кого держим «на ручках»
    this.dragOffsetX = 0;     // за какое место схватили
    this.dragOffsetY = 0;
    this.hovered = null;      // над кем курсор (показываем круг зрения)
  }

  // ===========================================================================
  //  ЗАПУСК
  // ===========================================================================
  start() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.world.populate();
    for (let i = 0; i < CONFIG.population.initial; i++) this.spawnCreature();

    this.bindInput();
    this.ui.bindSettings();
    this.ui.bind({
      onPause: () => this.togglePause(),
      onSpeed: () => {
        this.speed = this.speed >= 4 ? 1 : this.speed * 2;
        this.ui.setSpeed(this.speed);
      },
      onCall: () => {
        if (!this.hive.active) this.hive.start(this.world, this.particles, this.ui);
      },
    });

    requestAnimationFrame((t) => {
      this.lastFrame = t;
      this.loop(t);
    });
  }

  /** Подгоняем canvas под окно с учётом плотности пикселей (чёткость на Retina). */
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.world.resize(w, h);
    this.assets.buildBackground(w, h);
  }

  togglePause() {
    this.paused = !this.paused;
    this.ui.setPaused(this.paused);
  }

  /**
   * Новое существо («подселенец») в случайном месте.
   *
   * По умолчанию (CONFIG.population.immigrantsFromBest = 0) это честное
   * поколение 0: случайный мозг и случайная ДНК. Тогда «ум» появляется
   * ТОЛЬКО у потомков тех, кто сам сумел наесться и поделиться.
   *
   * Если поднять immigrantsFromBest (например, до 0.75), часть подселенцев
   * будет получать мутированные мозг и ДНК рекордсмена — это «элитизм»
   * из генетических алгоритмов: эволюция быстрее, но уже не чисто природная.
   */
  spawnCreature() {
    let brain = null, dna = null, generation = 0;
    const oldest = this.world.oldestCreature();
    let source = null;
    if (oldest && oldest.age > this.world.recordAge) source = { brain: oldest.brain, dna: oldest.dna, generation: oldest.generation };
    else if (this.world.bestBrain) source = { brain: this.world.bestBrain, dna: this.world.bestDNA, generation: this.world.bestGeneration };

    if (source && Math.random() < CONFIG.population.immigrantsFromBest) {
      brain = source.brain.copy().mutate(CONFIG.brain.mutationRate * 1.5, CONFIG.brain.mutationAmount);
      dna = source.dna.mutated();
      generation = source.generation + 1;
    }
    // Новые существа появляются подальше от яда (и от других существ)
    const p = this.world.safePoint(CONFIG.world.spawnSafeDistance, this.world.poison);
    const c = new Creature(p.x, p.y, brain, generation, dna);
    this.world.creatures.push(c);
    return c;
  }

  // ===========================================================================
  //  ВВОД: «ПОГЛАДИТЬ»
  // ===========================================================================
  bindInput() {
    const c = this.canvas;
    const updatePos = (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      // Скорость указателя (сглаженная) — чтобы существо можно было «бросить»
      const t = performance.now();
      const dtMs = Math.max(1, t - this.pointer.t);
      this.pointer.vx = lerp(this.pointer.vx, ((x - this.pointer.x) / dtMs) * 1000, 0.35);
      this.pointer.vy = lerp(this.pointer.vy, ((y - this.pointer.y) / dtMs) * 1000, 0.35);
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.t = t;
    };

    // Нажали на существо — ВЗЯЛИ НА РУЧКИ (оно сразу начинает мурчать)
    c.addEventListener('pointerdown', (e) => {
      updatePos(e);
      this.pointer.vx = this.pointer.vy = 0;
      this.pointer.down = true;
      c.setPointerCapture(e.pointerId);
      const target = this.pickCreature(this.pointer.x, this.pointer.y);
      if (target) {
        this.dragged = target;
        // Запоминаем, за какое место схватили, — чтобы существо не «прыгало» центром под курсор
        this.dragOffsetX = target.x - this.pointer.x;
        this.dragOffsetY = target.y - this.pointer.y;
        target.pet(CONFIG.petting.clickDuration); // даже короткий клик даёт помурчать
      }
    });

    // Тащим — существо жёстко следует за курсором
    c.addEventListener('pointermove', (e) => {
      updatePos(e);
      this.pointer.inside = true;
      if (this.dragged) this.dragTo(this.pointer.x + this.dragOffsetX, this.pointer.y + this.dragOffsetY);
    });

    // Отпустили. Если резко дёрнули мышкой — существо можно «бросить».
    const release = () => {
      const d = this.dragged;
      if (d && !d.dead) {
        const speed = Math.hypot(this.pointer.vx, this.pointer.vy);
        if (speed > CONFIG.petting.throwMinSpeed) {
          const s = Math.min(speed, d.maxSpeed * 1.5);
          d.angle = Math.atan2(this.pointer.vy, this.pointer.vx);
          d.vx = Math.cos(d.angle) * s;
          d.vy = Math.sin(d.angle) * s;
          d.pettingTimer = 0; // полетел — уже не мурчит
        }
      }
      this.pointer.down = false;
      this.dragged = null;
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', release);
    c.addEventListener('pointerleave', () => {
      this.pointer.inside = false;
      this.ui.hideTooltip();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePause();
      }
    });
  }

  /**
   * Перетащить существо в точку (x, y) с ПРОВЕРКОЙ СТОЛКНОВЕНИЙ ПО ВСЕМУ ПУТИ.
   * Если за один кадр курсор пролетел 80 px, мы не «телепортируем» существо,
   * а проходим путь маленькими шагами (по половине радиуса) и на каждом шаге
   * проверяем, не коснулось ли оно еды (съест) или яда (съест и умрёт).
   * Так существо не может «перепрыгнуть» через кусочек еды или яд.
   */
  dragTo(x, y) {
    const c = this.dragged;
    if (!c || c.dead) { this.dragged = null; return; }
    const w = this.world;
    x = clamp(x, 0, w.width - 0.01);
    y = clamp(y, 0, w.height - 0.01);

    const fromX = c.x, fromY = c.y;
    const eatenBefore = c.foodEaten;
    const dx = x - fromX, dy = y - fromY;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(2, c.radius * 0.5)));
    for (let i = 1; i <= steps; i++) {
      c.x = fromX + (dx * i) / steps;
      c.y = fromY + (dy * i) / steps;
      if (c.checkContacts(w, this.particles)) {
        // Яд! Существо погибло прямо в руках Создателя — карма резко падает
        this.addKarma(CONFIG.karma.kill);
        this.dragged = null;
        this.removeDead();
        return;
      }
    }
    c.vx = c.vy = 0;
    // Покормили с рук — карма растёт
    if (c.foodEaten > eatenBefore) this.addKarma(CONFIG.karma.feed * (c.foodEaten - eatenBefore));
  }

  /** Изменить карму Создателя (всегда в пределах −1…1). */
  addKarma(delta) {
    this.karma = clamp(this.karma + delta, -1, 1);
  }

  /** Убрать погибших (с облачком сажи) — используется и в шаге симуляции, и при перетаскивании. */
  removeDead() {
    const list = this.world.creatures;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (!c.dead) continue;
      this.world.recordDeath(c);
      this.particles.emitSoot(c.x, c.y, c.radius);
      list.splice(i, 1);
    }
  }

  /** Какое существо находится под курсором (или null). */
  pickCreature(x, y) {
    let best = null, bestD = Infinity;
    for (const cr of this.world.creatures) {
      const d = this.world.delta(x, y, cr.x, cr.y);
      const dist = Math.hypot(d.x, d.y);
      if (dist < cr.radius + cr.dna.hairLength * 0.4 + CONFIG.petting.pickPadding && dist < bestD) {
        best = cr;
        bestD = dist;
      }
    }
    return best;
  }

  /** Пока существо «на ручках» — оно мурчит, а мы держим его под курсором. */
  applyDrag(dt) {
    const t = this.dragged;
    if (!t) return;
    if (t.dead || !this.pointer.down) { this.dragged = null; return; }
    t.pet(CONFIG.petting.holdRefresh);
    this.addKarma(CONFIG.karma.petPerSecond * dt); // гладим — карма медленно растёт
    // Держим под курсором (и проверяем, не выросла ли еда прямо под ним)
    this.dragTo(this.pointer.x + this.dragOffsetX, this.pointer.y + this.dragOffsetY);
  }

  // ===========================================================================
  //  ЛОГИКА (один шаг симуляции)
  // ===========================================================================
  step(dt) {
    this.time += dt;
    const world = this.world;

    world.update(dt);
    this.applyDrag(dt);
    // Карма медленно «забывается» к нулю (существа прощают и забывают)
    this.karma *= Math.pow(0.5, dt / CONFIG.karma.halfLife);
    this.hive.update(dt, world, this.particles, this.ui, this.time);

    for (const c of world.creatures) c.update(dt, world, this.particles);

    // Смерти и рождения (идём с конца, чтобы безопасно удалять из массива)
    const born = [];
    for (let i = world.creatures.length - 1; i >= 0; i--) {
      const c = world.creatures[i];
      if (c.dead) continue; // уберём ниже одним вызовом removeDead()
      if (c.canDivide() && world.creatures.length + born.length < world.maxPopulation) {
        born.push(c.divide());
        this.particles.emitSparkles(c.x, c.y, '#d9c6ff', 12, 90);
      }
    }
    this.removeDead();
    world.creatures.push(...born);

    // Не даём миру вымереть
    this.respawnTimer -= dt;
    if (world.creatures.length < CONFIG.population.min && this.respawnTimer <= 0) {
      const c = this.spawnCreature();
      this.particles.emitSparkles(c.x, c.y, '#c9d6ff', 10, 60);
      this.respawnTimer = CONFIG.population.respawnInterval;
    }

    this.language.record(world.creatures, dt);
    this.particles.update(dt);
  }

  // ===========================================================================
  //  РИСОВАНИЕ
  // ===========================================================================
  /**
   * @param {number} frameDt — реальные секунды с прошлого кадра. Шерсть и дыхание
   *                           живут по реальному времени, поэтому чернушки дышат даже на паузе.
   */
  render(frameDt) {
    const ctx = this.ctx;
    const { width: w, height: h } = this.world;
    const time = this.time;
    const now = Date.now();

    const climate = this.world.climate;
    climate.animate(frameDt, w, h);

    // Фон (летом — с маревом) и сезонный оттенок
    climate.drawBackground(ctx, this.assets, w, h);
    climate.drawTint(ctx, w, h);
    SootFur.sheen = climate.furSheen(); // иней на кончиках шерсти зимой, тёплый блик летом

    for (const f of this.world.food) this.assets.drawFood(ctx, f, time);
    for (const p of this.world.poison) this.assets.drawPoison(ctx, p, time);

    this.hive.drawOverlay(ctx, w, h);
    this.drawVision(ctx);

    const champion = this.world.oldestCreature();
    for (const c of this.world.creatures) {
      c.animateVisuals(frameDt, now);
      c.draw(ctx, this.assets, time, c === champion, now);
    }

    climate.drawSnow(ctx);
    this.particles.draw(ctx);
    this.logo.render(frameDt, now);
  }

  /** Курсор и всплывающая подсказка над существом. */
  updateHover() {
    this.hovered = null;
    if (!this.pointer.inside) return;
    const c = this.pickCreature(this.pointer.x, this.pointer.y);
    this.hovered = c;
    this.canvas.style.cursor = c ? (this.pointer.down ? 'grabbing' : 'grab') : 'default';
    if (c) {
      const d = c.dna, t = c.traits;
      const energy = Math.round(c.energyRatio * 100);
      const state = c.isPetted ? '😊 мурчит' : c.isCommunicating ? '💬 на связи' : '🍃 гуляет';
      this.ui.showTooltip(this.pointer.x, this.pointer.y,
        `<b>Пушистик #${c.id}</b> · поколение ${c.generation}<br>Возраст: ${UI.formatAge(c.age)}` +
        `<br>Энергия: ${energy}% из ${Math.round(c.maxEnergy)}<br>Съел: ${c.foodEaten} · Детей: ${c.children}` +
        `<br><span class="tt-head">🧬 ДНК</span>` +
        `<br>Ядро: ${d.baseRadius.toFixed(1)} px · Глаз: ${d.numEyes}` +
        `<br>Шерсть: ${d.hairCount} × ${d.hairLength.toFixed(0)} px` +
        `<br>Зрение: ${Math.round(d.visionRadius)} px · обзор ${Math.round(t.fov * 180 / Math.PI)}°` +
        `<br><span class="tt-head">⚙️ Тело</span>` +
        `<br>Скорость: ${Math.round(t.maxSpeed)} px/с` +
        `<br>Трата: ${t.idleCost.toFixed(1)}/с в покое, +${t.moveCost.toFixed(1)}/с на бегу` +
        `<br>Погода: ${UI.thermalLabel(c)}` +
        `<br><span class="tt-head">🗣 Речь</span>` +
        `<br>Говорит: ${UI.wordLabel(c.signal)} · слышит: ${c.speaker ? UI.wordLabel(c.heardSignal) : 'никого'}` +
        `<br>${state}`);
    } else {
      this.ui.hideTooltip();
    }
  }

  /**
   * Поле зрения существа под курсором: полупрозрачный сектор
   * (радиус = ген visionRadius, угол = по числу глаз).
   * То, что существо видит прямо сейчас, обведено кружком.
   */
  drawVision(ctx) {
    const c = this.hovered;
    if (!c || c.dead) return;
    const R = c.dna.visionRadius;
    const half = c.traits.fov / 2;

    ctx.save();
    ctx.beginPath();
    if (half >= Math.PI - 1e-6) {
      ctx.arc(c.x, c.y, R, 0, TAU);              // 4 глаза — круг на 360°
    } else {
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, R, c.angle - half, c.angle + half);
      ctx.closePath();
    }
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
    g.addColorStop(0, 'rgba(143, 211, 255, 0.14)');
    g.addColorStop(1, 'rgba(143, 211, 255, 0.03)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(143, 211, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Кого существо слышит: пунктир до ближайшего соседа
    if (c.speaker && !c.speaker.dead) {
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.speaker.x, c.speaker.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Что существо видит сейчас: еда — зелёный кружок, яд — красный
    ctx.lineWidth = 2;
    for (const [item, color] of [[c.seenFood, '#7dffb0'], [c.seenPoison, '#ff4d6d']]) {
      if (!item) continue;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 14, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  stats() {
    const world = this.world;
    const champion = world.oldestCreature();
    const championAge = champion ? champion.age : 0;
    return {
      population: world.creatures.length,
      avgGeneration: world.averageGeneration(),
      maxGeneration: world.maxGeneration(),
      championAge,
      recordAge: Math.max(world.recordAge, championAge),
      food: world.food.length,
      poison: world.poison.length,
      awareness: this.hive.awareness(world),
      dna: world.averageDNA(),
      avgFur: world.creatures.reduce((s, c) => s + c.traits.fur, 0) / Math.max(1, world.creatures.length),
      climate: world.climate,
      language: this.language.summary(),
    };
  }

  // ===========================================================================
  //  ИГРОВОЙ ЦИКЛ
  // ===========================================================================
  loop(timestamp) {
    // dt — сколько секунд прошло с прошлого кадра (ограничиваем, чтобы не было «телепортов»)
    const dt = Math.min((timestamp - this.lastFrame) / 1000, CONFIG.simulation.maxDt);
    this.lastFrame = timestamp;

    if (!this.paused) {
      for (let i = 0; i < this.speed; i++) this.step(dt);
    }
    this.render(dt);
    this.updateHover();

    // Интерфейс обновляем 4 раза в секунду — чаще не нужно
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.ui.update(this.stats());
      this.uiTimer = 0.25;
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

// =============================================================================
//  ТОЧКА ВХОДА: загружаем ассеты и запускаем симуляцию
// =============================================================================
window.addEventListener('DOMContentLoaded', () => {
  const assets = new AssetManager();
  assets.load().then(() => {
    const sim = new Simulation(document.getElementById('world'), assets);
    sim.start();
    window.lifiki = sim; // для экспериментов из консоли браузера (F12)
  });
});
