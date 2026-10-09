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
    // Настроение «Сеанса связи» больше не скрытая карма, а то, что существа
    // сами выучили о руке Создателя (см. Creature.learnHand и handMood()).
    this.hive = new HiveMind(() => ({ ...this.handMood(), lexicon: this.language.summary() }),
      () => this.competence.ratio);
    this.language = new LanguageStats(); // «словарь»: наблюдаем, что значат слова
    this.logo = new LogoSoot(document.getElementById('logo'), assets);

    this.time = 0;            // «игровое» время в секундах (на паузе стоит)
    this.paused = false;
    this.speed = 1;           // 1x, 2x, 4x
    this.lastFrame = 0;
    this.uiTimer = 0;
    this.genesisRunning = false;
    this.competence = new CompetenceMeter(); // «Разум популяции»: экзамен против случайных мозгов

    // Состояние указателя (мышь или палец)
    this.pointer = { x: 0, y: 0, vx: 0, vy: 0, t: 0, down: false, inside: false, touch: false };
    this.dragged = null;      // кого держим «на ручках»
    this.dragOffsetX = 0;     // за какое место схватили
    this.dragOffsetY = 0;
    this.hovered = null;      // над кем курсор (показываем круг зрения)

    // «Запас жизни»: пока существ не больше этого числа, мир бережёт их от смерти
    // своей смертью (голод → спячка, яд → болезнь). Новые рождаются только делением.
    // Каждое убийство руками Создателя навсегда уменьшает запас на 1 — поэтому
    // полностью вымереть мир может ТОЛЬКО от ваших рук.
    this.lifeReserveMax = 0;  // считается от предела экрана в beginLife()
    this.lifeReserve = 0;
    this.userKills = 0;

    // Камера (зум и перемещение). zoom = 1 — виден весь мир.
    this.cam = { zoom: 1, x: 0, y: 0 };
    this.follow = null;       // за кем следит камера (двойной клик/тап по существу)
    this.touches = new Map(); // активные пальцы/указатели: id → {x, y}
    this.pinch = null;        // состояние щипка двумя пальцами
    this.pan = null;          // перетаскивание пустого места (сдвиг камеры)
    this.lastTap = { t: 0, x: 0, y: 0 };
  }

  // ===========================================================================
  //  КАМЕРА: зум колёсиком / щипком, перемещение, слежение за существом
  // ===========================================================================

  /** Экранная точка (CSS-пиксели) → точка мира. */
  screenToWorld(sx, sy) {
    return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + sy / this.cam.zoom };
  }

  /** Не даём камере уехать за края мира и выйти за пределы зума. */
  clampCamera() {
    const c = this.cam, w = this.world;
    c.zoom = clamp(c.zoom, 1, CONFIG.camera.maxZoom);
    c.x = clamp(c.x, 0, w.width - w.width / c.zoom);
    c.y = clamp(c.y, 0, w.height - w.height / c.zoom);
  }

  /** Зум так, чтобы точка под (sx, sy) осталась на месте (как в картах). */
  zoomAt(sx, sy, zoom) {
    const anchor = this.screenToWorld(sx, sy);
    this.cam.zoom = clamp(zoom, 1, CONFIG.camera.maxZoom);
    this.cam.x = anchor.x - sx / this.cam.zoom;
    this.cam.y = anchor.y - sy / this.cam.zoom;
    this.clampCamera();
  }

  /** Вернуться к общему виду (весь мир на экране). */
  resetCamera() {
    this.follow = null;
    this.cam.zoom = 1;
    this.clampCamera();
  }

  /** Плавно держим в центре существо, за которым следим. */
  updateCamera(dt) {
    const f = this.follow;
    if (!f) return;
    if (f.dead || !this.world.creatures.includes(f)) { this.follow = null; return; }
    const c = this.cam, w = this.world;
    const tx = f.x - w.width / c.zoom / 2, ty = f.y - w.height / c.zoom / 2;
    const k = Math.min(1, dt * 4);
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    this.clampCamera();
  }

  // ===========================================================================
  //  ЗАПУСК
  // ===========================================================================
  start() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.world.populate();
    // Первые существа — потомки «первичного бульона» (genesis.js). Дальше — только деление.
    this.beginLife();

    this.bindInput();
    this.ui.bindSettings();
    this.ui.bindVisibility();
    this.ui.bindCamera({ onReset: () => this.resetCamera(), onReseed: () => this.reseed() });
    this.ui.bind({
      onPause: () => this.togglePause(),
      onSpeed: () => {
        this.speed = this.speed >= 4 ? 1 : this.speed * 2;
        this.ui.setSpeed(this.speed);
      },
      onCall: () => {
        if (!this.hive.active) this.hive.start(this.world, this.particles, this.ui, true);
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
    this.dpr = dpr;
    this.world.resize(w, h);
    if (this.cam) this.clampCamera();
    this.assets.buildBackground(w, h);
  }

  togglePause() {
    this.paused = !this.paused;
    this.ui.setPaused(this.paused);
  }

  /**
   * Зарождение жизни: прокручиваем «первичный бульон» (без отрисовки, ~0.3–1 с)
   * и выпускаем в мир потомков жизнеспособной линии.
   */
  beginLife() {
    this.genesisRunning = true;
    this.competence.reset();
    // Запас жизни — доля от предела экрана (и всегда меньше предела, чтобы шла эволюция)
    this.lifeReserveMax = Math.max(2, Math.min(this.world.maxPopulation - 2,
      Math.round(this.world.maxPopulation * CONFIG.population.reserveShare)));
    this.lifeReserve = this.lifeReserveMax;
    this.ui.showGenesis(true, null);
    Genesis.run(this.world.width, this.world.height, (p) => this.ui.showGenesis(true, p)).then((founders) => {
      this.placeFounders(founders);
      this.genesisRunning = false;
      this.ui.showGenesis(false, null);
    });
  }

  /** Выпустить основателей в мир: подальше от яда, с чистым опытом, разного возраста. */
  placeFounders(founders) {
    const n = Math.min(founders.length, this.world.maxPopulation);
    for (let i = 0; i < n; i++) {
      const f = founders[i];
      const p = this.world.safePoint(CONFIG.world.spawnSafeDistance, this.world.poison);
      const c = new Creature(p.x, p.y, f.brain.copy(false), f.generation, f.dna);
      c.energy = c.maxEnergy * 0.6;
      c.age = randRange(0, CONFIG.evolution.maturityAge); // не все — новорождённые
      this.world.creatures.push(c);
      this.particles.emitSparkles(c.x, c.y, '#c9ffd8', 10, 60);
    }
  }

  // ===========================================================================
  //  ВВОД: «ПОГЛАДИТЬ»
  // ===========================================================================
  bindInput() {
    const c = this.canvas;
    const screenPos = (e) => {
      const rect = c.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const updatePos = (e) => {
      const { x, y } = screenPos(e);
      // Скорость указателя (сглаженная) — чтобы существо можно было «бросить»
      const t = performance.now();
      const dtMs = Math.max(1, t - this.pointer.t);
      this.pointer.vx = lerp(this.pointer.vx, ((x - this.pointer.x) / dtMs) * 1000, 0.35);
      this.pointer.vy = lerp(this.pointer.vy, ((y - this.pointer.y) / dtMs) * 1000, 0.35);
      this.pointer.x = x;
      this.pointer.y = y;
      this.pointer.touch = e.pointerType === 'touch'; // палец: рука «в мире», только пока касается
      this.pointer.t = t;
    };
    const dragTarget = () => {
      const p = this.screenToWorld(this.pointer.x, this.pointer.y);
      return [p.x + this.dragOffsetX, p.y + this.dragOffsetY];
    };

    // ---- Колёсико мыши: зум к точке под курсором ----
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      const factor = Math.exp(-e.deltaY * unit * 0.0015);
      const { x, y } = screenPos(e);
      if (this.follow) {
        // Следим за существом — зумим к нему, а не к курсору
        this.cam.zoom = clamp(this.cam.zoom * factor, 1, CONFIG.camera.maxZoom);
        if (this.cam.zoom <= 1.001) this.follow = null;
        this.clampCamera();
      } else {
        this.zoomAt(x, y, this.cam.zoom * factor);
      }
    }, { passive: false });

    // ---- Нажатие ----
    c.addEventListener('pointerdown', (e) => {
      const pos = screenPos(e);
      this.touches.set(e.pointerId, pos);
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* синтетические события или старые браузеры */ }

      // Второй палец → начинаем щипок (зум). Существо из «рук» отпускаем.
      if (this.touches.size === 2) {
        this.dragged = null;
        this.pan = null;
        this.startPinch();
        return;
      }
      if (this.touches.size > 2) return;

      updatePos(e);
      this.pointer.vx = this.pointer.vy = 0;
      this.pointer.down = true;
      const world = this.screenToWorld(pos.x, pos.y);
      const target = this.pickCreature(world.x, world.y);

      // Двойной клик / двойное касание: по существу — следить за ним, по пустому месту — общий вид
      const now = performance.now();
      const isDouble = now - this.lastTap.t < 320 && Math.hypot(pos.x - this.lastTap.x, pos.y - this.lastTap.y) < 30;
      this.lastTap = { t: isDouble ? 0 : now, x: pos.x, y: pos.y };
      if (isDouble) {
        if (target) {
          this.follow = target;
          if (this.cam.zoom < CONFIG.camera.followZoom) this.cam.zoom = CONFIG.camera.followZoom;
        } else {
          this.resetCamera();
        }
      }

      if (target) {
        // ВЗЯЛИ НА РУЧКИ (оно сразу начинает мурчать)
        this.dragged = target;
        // Запоминаем, за какое место схватили, — чтобы существо не «прыгало» центром под курсор
        this.dragOffsetX = target.x - world.x;
        this.dragOffsetY = target.y - world.y;
        target.pet(CONFIG.petting.clickDuration); // даже короткий клик даёт помурчать
      } else if (this.cam.zoom > 1.001) {
        // Пустое место при зуме — двигаем камеру
        this.pan = { sx: pos.x, sy: pos.y, cx: this.cam.x, cy: this.cam.y };
      }
    });

    // ---- Движение ----
    c.addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, screenPos(e));
      if (this.pinch) { this.updatePinch(); return; }
      updatePos(e);
      this.pointer.inside = true;
      if (this.dragged) {
        this.dragTo(...dragTarget()); // существо жёстко следует за курсором
      } else if (this.pan && this.pointer.down) {
        this.follow = null;
        this.cam.x = this.pan.cx - (this.pointer.x - this.pan.sx) / this.cam.zoom;
        this.cam.y = this.pan.cy - (this.pointer.y - this.pan.sy) / this.cam.zoom;
        this.clampCamera();
      }
    });

    // ---- Отпустили. Если резко дёрнули мышкой — существо можно «бросить». ----
    const release = (e) => {
      this.touches.delete(e.pointerId);
      if (this.pinch) {
        if (this.touches.size < 2) this.pinch = null;
        if (this.touches.size === 0) this.pointer.down = false;
        return;
      }
      const d = this.dragged;
      if (d && !d.dead) {
        // скорость указателя — в экранных px/с, переводим в мировые
        const vx = this.pointer.vx / this.cam.zoom, vy = this.pointer.vy / this.cam.zoom;
        const speed = Math.hypot(vx, vy);
        if (speed > CONFIG.petting.throwMinSpeed) {
          const s = Math.min(speed, d.maxSpeed * 1.5);
          d.angle = Math.atan2(vy, vx);
          d.vx = Math.cos(d.angle) * s;
          d.vy = Math.sin(d.angle) * s;
          d.pettingTimer = 0; // полетел — уже не мурчит
          d.learnHand(-1, CONFIG.hand.thrown); // и немного испугался
        }
      }
      this.pointer.down = false;
      this.dragged = null;
      this.pan = null;
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
      } else if (e.code === 'Escape' || e.code === 'Digit0') {
        this.resetCamera();
      } else if (e.key === '+' || e.key === '=') {
        this.zoomAt(this.world.width / 2, this.world.height / 2, this.cam.zoom * 1.25);
      } else if (e.key === '-') {
        this.zoomAt(this.world.width / 2, this.world.height / 2, this.cam.zoom / 1.25);
        if (this.cam.zoom <= 1.001) this.follow = null;
      }
    });
  }

  /** Начало щипка: запоминаем расстояние между пальцами и точку мира под их серединой. */
  startPinch() {
    const [a, b] = [...this.touches.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.pinch = {
      dist: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      zoom: this.cam.zoom,
      anchor: this.screenToWorld(mid.x, mid.y),
    };
  }

  /** Щипок: зум по расстоянию между пальцами, а середина пальцев «держит» точку мира (можно и двигать). */
  updatePinch() {
    const pts = [...this.touches.values()];
    if (pts.length < 2) return;
    const [a, b] = pts;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
    this.follow = null;
    this.cam.zoom = clamp(this.pinch.zoom * (dist / this.pinch.dist), 1, CONFIG.camera.maxZoom);
    this.cam.x = this.pinch.anchor.x - mid.x / this.cam.zoom;
    this.cam.y = this.pinch.anchor.y - mid.y / this.cam.zoom;
    this.clampCamera();
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
      if (c.checkContacts(w, this.particles, true)) {
        // Яд! Существо погибло прямо в руках Создателя. Те, кто это видел,
        // запоминают: рука опасна. «Запас жизни» навсегда уменьшается (см. lifeReserve)
        this.witness(c.x, c.y, -1, CONFIG.hand.witnessKill, c);
        this.userKills++;
        this.lifeReserve = Math.max(0, this.lifeReserve - 1);
        this.dragged = null;
        this.removeDead();
        return;
      }
    }
    c.vx = c.vy = 0;
    // Покормили с рук — рука добрая
    if (c.foodEaten > eatenBefore) c.learnHand(1, CONFIG.hand.feed);
  }

  /** Где сейчас рука Создателя в мировых координатах (или null — её нет в мире). */
  handPosition() {
    const p = this.pointer;
    if (this.pinch || !(p.touch ? p.down : p.inside)) return null;
    const w = this.screenToWorld(p.x, p.y);
    return { x: w.x, y: w.y };
  }

  /**
   * Свидетели: все, кто в пределах своего радиуса зрения от события,
   * выучивают урок о руке (суматоху — облако сажи, сердечки — замечают
   * даже краем глаза, поэтому конус обзора здесь не учитываем).
   */
  witness(x, y, target, strength, except = null) {
    for (const o of this.world.creatures) {
      if (o === except || o.dead) continue;
      const d = this.world.delta(x, y, o.x, o.y);
      if (Math.hypot(d.x, d.y) <= o.dna.visionRadius) o.learnHand(target, strength);
    }
  }

  /** Что популяция думает о руке Создателя: среднее доверие и доля боящихся. */
  handMood() {
    const list = this.world.creatures;
    if (list.length === 0) return { trust: 0, afraid: 0 };
    let sum = 0, afraid = 0;
    for (const c of list) {
      sum += c.handTrust;
      if (c.handTrust <= -CONFIG.hand.minTrust) afraid++;
    }
    return { trust: sum / list.length, afraid: afraid / list.length };
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
      if (dist < cr.radius + cr.hairLength * 0.4 + CONFIG.petting.pickPadding && dist < bestD) {
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
    // Гладим: сам пушистик и те, кто видит его сердечки, понемногу доверяют руке
    t.learnHand(1, CONFIG.hand.petPerSecond * dt);
    this.witness(t.x, t.y, 1, CONFIG.hand.witnessPetPerSecond * dt, t);
    // Держим под курсором (и проверяем, не выросла ли еда прямо под ним)
    const p = this.screenToWorld(this.pointer.x, this.pointer.y);
    this.dragTo(p.x + this.dragOffsetX, p.y + this.dragOffsetY);
  }

  // ===========================================================================
  //  ЛОГИКА (один шаг симуляции)
  // ===========================================================================
  step(dt) {
    this.time += dt;
    const world = this.world;

    world.update(dt);
    // Рука Создателя в мире: курсор над миром (на телефоне — только пока палец касается)
    world.hand = this.handPosition();
    this.applyDrag(dt);
    this.hive.update(dt, world, this.particles, this.ui, this.time);

    // «Запас жизни»: пока существ не больше запаса, мир бережёт их от смерти своей смертью
    const isProtected = world.creatures.length <= this.lifeReserve;
    for (const c of world.creatures) c.protected = isProtected;

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

    this.language.record(world.creatures, dt);
    this.particles.update(dt);

    // Мир опустел (это возможно только когда запас жизни исчерпан вашими руками)
    this.ui.showExtinct(world.creatures.length === 0 && !this.genesisRunning);
  }

  /** «Начать жизнь заново» после полного вымирания. */
  reseed() {
    if (this.genesisRunning) return;
    this.userKills = 0;
    this.ui.showExtinct(false);
    this.beginLife();
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

    // Камера: всё, что ниже, рисуется в координатах МИРА с учётом зума и сдвига
    this.updateCamera(frameDt);
    const z = this.cam.zoom * this.dpr;
    ctx.setTransform(z, 0, 0, z, -this.cam.x * z, -this.cam.y * z);

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

    this.particles.draw(ctx);

    // Снег падает «на экран», а не в мир — рисуем его без зума
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    climate.drawSnow(ctx);
    this.logo.render(frameDt, now);
  }

  /** Курсор и всплывающая подсказка над существом. */
  updateHover() {
    this.hovered = null;
    if (!this.pointer.inside) return;
    const wp = this.screenToWorld(this.pointer.x, this.pointer.y);
    const c = this.pickCreature(wp.x, wp.y);
    this.hovered = c;
    this.canvas.style.cursor = c ? (this.pointer.down ? 'grabbing' : 'grab')
      : (this.pan ? 'grabbing' : this.cam.zoom > 1.001 ? 'move' : 'default');
    if (c) {
      const d = c.dna, t = c.traits;
      const energy = Math.round(c.energyRatio * 100);
      const state = c.isPetted ? '😊 мурчит' : c.dormant ? '💤 спячка — копит силы'
        : c.sickTimer > 0 ? '🤢 болеет' : c.isCommunicating ? '💬 на связи' : '🍃 гуляет';
      const b = c.brain;
      this.ui.showTooltip(this.pointer.x, this.pointer.y,
        `<b>Пушистик #${c.id}</b> · поколение ${c.generation}<br>Возраст: ${UI.formatAge(c.age)}` +
        `<br>Энергия: ${energy}% из ${Math.round(c.maxEnergy)}<br>Съел: ${c.foodEaten} · Детей: ${c.children}` +
        `<br><span class="tt-head">🧬 ДНК</span>` +
        `<br>Ядро: ${d.baseRadius.toFixed(1)} px · Глаз: ${d.numEyes}${d.isMutant ? ' (мутант)' : ''}` +
        `<br>Шерсть: ${d.hairCount} × ${d.hairLength.toFixed(0)} px · сейчас ${Math.round(c.coat * 100)}% (линька)` +
        `<br>Зрение: ${Math.round(d.visionRadius)} px · обзор ${Math.round(t.fov * 180 / Math.PI)}°` +
        `<br><span class="tt-head">⚙️ Тело</span>` +
        `<br>Скорость: ${Math.round(t.maxSpeed)} px/с` +
        `<br>Трата: ${t.idleCost.toFixed(1)}/с в покое, +${t.moveCost.toFixed(1)}/с на бегу` +
        `<br>Погода: ${UI.thermalLabel(c)}` +
        `<br><span class="tt-head">🗣 Речь</span>` +
        `<br>Говорит: ${UI.wordLabel(c.signal)} · слышит: ${c.speaker ? UI.wordLabel(c.heardSignal) : 'никого'}` +
        `<br>Общительность: ${Math.round(c.sociability * 100)}%` +
        `<br>Доверие к вам: ${UI.trustLabel(c.handTrust, 0, true)} · пугливость ${Math.round(c.skittish * 100)}%` +
        (c.seenHand ? `<br>${c.seenHand === 'food' ? '👋 видит вашу руку и тянется к ней' : '😨 видит вашу руку и убегает'}` : '') +
        `<br><span class="tt-head">🧠 Мозг</span>` +
        `<br>Обучаемость (ген): ${Math.round(b.plasticity / CONFIG.brain.plasticity.max * 100)}%` +
        `<br>Уроков жизни: ${b.experience} · опыт изменил мозг на ${b.experienceMagnitude().toFixed(1)}` +
        `<br>Память: ${c.memory.map(m => m.toFixed(2)).join(' · ')}` +
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
    if (this.ui.hidden) return; // в режиме «чистых обоев» — никаких подсказок
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
      competence: this.competence.ratio,
      dna: world.averageDNA(),
      avgFur: world.creatures.reduce((s, c) => s + c.coatTraits.fur, 0) / Math.max(1, world.creatures.length),
      climate: world.climate,
      language: this.language.summary(),
      hand: this.handMood(),
      lifeReserve: this.lifeReserve,
      lifeReserveMax: this.lifeReserveMax,
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
      this.competence.update(dt, this.world); // по одному экзамену за кадр
    }
    this.render(dt);
    this.updateHover();

    // Интерфейс обновляем 4 раза в секунду — чаще не нужно
    this.uiTimer -= dt;
    this.ui.updateZoom(this.cam.zoom, !!this.follow);
    if (this.uiTimer <= 0) {
      if (!this.ui.hidden) this.ui.update(this.stats());
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
