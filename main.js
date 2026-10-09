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
    this.hive = new HiveMind();

    this.time = 0;            // «игровое» время в секундах (на паузе стоит)
    this.paused = false;
    this.speed = 1;           // 1x, 2x, 4x
    this.lastFrame = 0;
    this.uiTimer = 0;
    this.respawnTimer = 0;

    // Состояние указателя (мышь или палец)
    this.pointer = { x: 0, y: 0, down: false, inside: false };
    this.petTarget = null;    // кого сейчас гладим
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
   * Новое существо в случайном месте. Чаще всего ему достаётся
   * мутированный мозг рекордсмена — так эволюция не начинается с нуля,
   * даже если популяция почти вымерла. Иногда — совсем случайный мозг
   * (для разнообразия «генофонда»).
   */
  spawnCreature() {
    let brain = null, generation = 0;
    const oldest = this.world.oldestCreature();
    let source = null;
    if (oldest && oldest.age > this.world.recordAge) source = { brain: oldest.brain, generation: oldest.generation };
    else if (this.world.bestBrain) source = { brain: this.world.bestBrain, generation: this.world.bestGeneration };

    if (source && Math.random() < 0.75) {
      brain = source.brain.copy().mutate(CONFIG.brain.mutationRate * 1.5, CONFIG.brain.mutationAmount);
      generation = source.generation + 1;
    }
    const p = this.world.randomPoint();
    const c = new Creature(p.x, p.y, brain, generation);
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
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
    };

    c.addEventListener('pointerdown', (e) => {
      updatePos(e);
      this.pointer.down = true;
      c.setPointerCapture(e.pointerId);
      const target = this.pickCreature(this.pointer.x, this.pointer.y);
      if (target) {
        this.petTarget = target;
        target.pet(CONFIG.petting.clickDuration); // даже короткий клик даёт помурчать
      }
    });

    c.addEventListener('pointermove', (e) => {
      updatePos(e);
      this.pointer.inside = true;
      // Если провести зажатой мышкой по другим существам — гладим и их
      if (this.pointer.down) {
        const target = this.pickCreature(this.pointer.x, this.pointer.y);
        if (target && target !== this.petTarget) {
          this.petTarget = target;
          target.pet(CONFIG.petting.clickDuration);
        }
      }
    });

    const release = () => {
      this.pointer.down = false;
      this.petTarget = null;
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

  /** Какое существо находится под курсором (или null). */
  pickCreature(x, y) {
    let best = null, bestD = Infinity;
    for (const cr of this.world.creatures) {
      const d = this.world.delta(x, y, cr.x, cr.y);
      const dist = Math.hypot(d.x, d.y);
      if (dist < cr.radius + CONFIG.petting.pickPadding && dist < bestD) {
        best = cr;
        bestD = dist;
      }
    }
    return best;
  }

  /** Пока кнопка зажата над существом — продлеваем ему поглаживание. */
  applyPetting() {
    const t = this.petTarget;
    if (!t) return;
    if (t.dead) { this.petTarget = null; return; }
    if (!this.pointer.down) return;
    const d = this.world.delta(this.pointer.x, this.pointer.y, t.x, t.y);
    if (Math.hypot(d.x, d.y) < t.radius + CONFIG.petting.pickPadding * 2) {
      t.pet(CONFIG.petting.holdRefresh);
    }
  }

  // ===========================================================================
  //  ЛОГИКА (один шаг симуляции)
  // ===========================================================================
  step(dt) {
    this.time += dt;
    const world = this.world;

    world.update(dt);
    this.applyPetting();
    this.hive.update(dt, world, this.particles, this.ui, this.time);

    for (const c of world.creatures) c.update(dt, world, this.particles);

    // Смерти и рождения (идём с конца, чтобы безопасно удалять из массива)
    const born = [];
    for (let i = world.creatures.length - 1; i >= 0; i--) {
      const c = world.creatures[i];
      if (c.dead) {
        world.recordDeath(c);
        this.particles.emitSoot(c.x, c.y, c.radius);
        world.creatures.splice(i, 1);
        continue;
      }
      if (c.canDivide() && world.creatures.length + born.length < CONFIG.population.max) {
        born.push(c.divide());
        this.particles.emitSparkles(c.x, c.y, '#d9c6ff', 12, 90);
      }
    }
    world.creatures.push(...born);

    // Не даём миру вымереть
    this.respawnTimer -= dt;
    if (world.creatures.length < CONFIG.population.min && this.respawnTimer <= 0) {
      const c = this.spawnCreature();
      this.particles.emitSparkles(c.x, c.y, '#c9d6ff', 10, 60);
      this.respawnTimer = CONFIG.population.respawnInterval;
    }

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

    this.assets.drawBackground(ctx, w, h);
    for (const f of this.world.food) this.assets.drawFood(ctx, f, time);
    for (const p of this.world.poison) this.assets.drawPoison(ctx, p, time);

    this.hive.drawOverlay(ctx, w, h);

    const champion = this.world.oldestCreature();
    for (const c of this.world.creatures) {
      c.animateVisuals(frameDt, now);
      c.draw(ctx, this.assets, time, c === champion, now);
    }

    this.particles.draw(ctx);
  }

  /** Курсор и всплывающая подсказка над существом. */
  updateHover() {
    if (!this.pointer.inside) return;
    const c = this.pickCreature(this.pointer.x, this.pointer.y);
    this.canvas.style.cursor = c ? (this.pointer.down ? 'grabbing' : 'grab') : 'default';
    if (c) {
      const energy = Math.round((c.energy / CONFIG.energy.max) * 100);
      const state = c.isPetted ? '😊 мурчит' : c.isCommunicating ? '💬 на связи' : '🍃 гуляет';
      this.ui.showTooltip(this.pointer.x, this.pointer.y,
        `<b>Пушистик #${c.id}</b><br>Поколение: ${c.generation}<br>Возраст: ${UI.formatAge(c.age)}` +
        `<br>Энергия: ${energy}%<br>Съел: ${c.foodEaten} · Детей: ${c.children}<br>${state}`);
    } else {
      this.ui.hideTooltip();
    }
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
