/**
 * creature.js — класс Creature: одно существо (пушистик-чернушка).
 *
 * У существа есть:
 *   • тело: позиция (x, y), скорость (vx, vy), направление (angle);
 *   • мозг: NeuralNetwork, который решает, куда ехать (ПОВЕДЕНИЕ);
 *   • ДНК: DNA — размер, шерсть, глаза, зрение (ТЕЛО, см. dna.js);
 *   • энергия: тратится на жизнь и движение, пополняется едой и поглаживанием;
 *   • 3 режима поведения:
 *       1) обычный     — думает нейросетью, ищет еду, избегает яд;
 *       2) petting     — его гладят: стоит, мурчит, пускает сердечки;
 *       3) общение     — во время «Сеанса связи» летит к своей точке фигуры.
 *   • анимации: подпрыгивание при ходьбе, «пульс» при поедании,
 *     вытягивание при делении, мурчание, моргание, дыхание;
 *   • шерсть с физикой (SootFur из fur.js).
 *
 * Как устроена отрисовка чернушки:
 *   1) computeBody() собирает все деформации ядра (дыхание, ходьба, деление,
 *      мурчание) в одну матрицу 2×2 — «как сейчас сжато/растянуто ядро»;
 *   2) по этой матрице шерсть (fur.js) находит корни волосков и считает физику;
 *   3) рисуем: волоски → ядро → глаза.
 * Ядро и глаза НЕ поворачиваются (глаза всегда смотрят на зрителя, как у
 * настоящих сусуватари), а направление движения видно по зрачкам, по шерсти,
 * которая тянется назад, и по сплющиванию вдоль вектора скорости.
 */
let creatureIdCounter = 0;

class Creature {
  /**
   * @param {NeuralNetwork|null} brain — null = случайный мозг (поколение 0)
   * @param {DNA|null} dna             — null = случайная ДНК (поколение 0)
   */
  constructor(x, y, brain = null, generation = 0, dna = null) {
    this.id = ++creatureIdCounter;

    // --- Физика ---
    this.x = x;
    this.y = y;
    this.angle = randRange(0, TAU);                 // куда «смотрит» мозг
    const startSpeed = randRange(20, 50);
    this.vx = Math.cos(this.angle) * startSpeed;
    this.vy = Math.sin(this.angle) * startSpeed;

    // --- Мозг и жизнь ---
    const b = CONFIG.brain;
    this.brain = brain || new NeuralNetwork(b.inputs, b.hidden, b.outputs);
    this.dna = dna || DNA.random();
    this.traits = this.dna.traits;  // готовые характеристики тела (скорость, траты…)
    this.generation = generation;
    this.energy = CONFIG.energy.start * this.maxEnergy;
    this.age = 0;
    this.foodEaten = 0;
    this.children = 0;
    this.dead = false;
    this.deathCause = null;

    // --- Режимы ---
    this.pettingTimer = 0;      // > 0 — существо сейчас гладят
    this.heartTimer = 0;
    this.commTarget = null;     // {x, y} — точка фигуры во время «Сеанса связи»
    this.sepX = 0;              // сила «расталкивания» от соседей (считает HiveMind)
    this.sepY = 0;
    this.signal = 0;            // EmitSignal: что существо «говорит» прямо сейчас (−1…1)
    this.heardSignal = 0;       // NearestSignal: что говорит ближайший сосед
    this.speaker = null;        // кого слушаем (для подсветки)
    this.seenFood = null;       // что существо видит прямо сейчас (для подсветки)
    this.seenPoison = null;
    this.thermalCost = 0;       // доп. трата энергии из-за погоды (в секунду)
    this.coldStress = 0;        // 0..1 — насколько мёрзнет
    this.heatStress = 0;        // 0..1 — насколько перегревается

    // --- Анимации ---
    this.drawAngle = this.angle;  // угол, под которым существо РИСУЕТСЯ (= atan2 скорости)
    this.walkPhase = randRange(0, 10);
    this.eatScale = 1;            // 1.3 сразу после еды, затем плавно → 1
    this.stretch = 0;             // 1 сразу после деления, затем плавно → 0
    this.appear = 0;              // 0 → 1 анимация появления
    this.blink = 0;
    this.blinkLeft = 0;
    this.blinkTimer = randRange(1, 5);

    // --- Внешность чернушки ---
    // Сдвиг фазы дыхания: толпа дышит вразнобой, а не как армия роботов
    this.breathOffset = randRange(0, CONFIG.breathing.cycle);
    this.pupilX = 0;              // смещение зрачков (−1..1) в сторону движения
    this.pupilY = 0;
    this.fur = new SootFur(this.dna);
    // Текущее состояние ядра (переиспользуем один объект, чтобы не мусорить память)
    this.body = { cx: x, cy: y, r: 10, coreR: 10, hairLength: 10, m00: 1, m01: 0, m10: 0, m11: 1, breath: 0, purring: false };
  }

  // --- Удобные «свойства» ---------------------------------------------------
  get maxEnergy() { return this.traits.maxEnergy; }
  get maxSpeed() { return this.traits.maxSpeed; }
  get energyRatio() { return clamp(this.energy / this.maxEnergy, 0, 1); }
  /** Радиус ядра: из ДНК, голодное существо чуть «сдувается» (до −15 %). */
  get radius() { return this.dna.baseRadius * (0.85 + 0.15 * this.energyRatio); }
  /** Радиус вместе с шерстью — для рисования, короны и т.п. */
  get visualRadius() { return this.radius + this.dna.hairLength; }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get isPetted() { return this.pettingTimer > 0; }
  get isCommunicating() { return this.commTarget !== null; }

  /** Можно ли делиться: сыт, взрослый и не занят (не гладят, не на связи). */
  canDivide() {
    const maturity = CONFIG.evolution.maturityAge / CONFIG.evolution.tempo;
    return !this.dead && this.energy >= this.maxEnergy && this.age >= maturity
      && !this.isPetted && !this.isCommunicating;
  }

  /** Вызывается при клике/удержании мышки на существе. */
  pet(duration) {
    this.pettingTimer = Math.max(this.pettingTimer, duration);
  }

  die(cause) {
    this.dead = true;
    this.deathCause = cause;
  }

  // ===========================================================================
  //  ОБНОВЛЕНИЕ (каждый кадр)
  // ===========================================================================
  update(dt, world, particles) {
    this.age += dt;
    // Погода: сколько сейчас стоит жизнь в этой шубке и насколько холодно (для дрожи)
    this.thermalCost = world.climate.thermalCost(this.traits);
    this.coldStress = world.climate.coldStress(this.traits);
    this.heatStress = world.climate.heatStress(this.traits);
    this.updateAnimations(dt);

    if (this.isPetted) this.updatePetting(dt, particles);
    else if (this.isCommunicating) this.updateCommunication(dt, world);
    else this.updateBrain(dt, world, particles);

    // Движение + замкнутый мир (вышел справа — появился слева)
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const beforeX = this.x, beforeY = this.y;
    world.wrap(this);
    // Перескочили через край — переносим и шерсть, иначе она «растянется» через весь экран
    if (this.x !== beforeX || this.y !== beforeY) this.fur.shift(this.x - beforeX, this.y - beforeY);

    // Поворот по вектору движения через Math.atan2 (плавно, чтобы не дёргался)
    if (this.speed > 3) {
      const target = Math.atan2(this.vy, this.vx);
      this.drawAngle = lerpAngle(this.drawAngle, target, Math.min(1, dt * 10));
    }

    if (this.energy <= 0) this.die('hunger');
  }

  /**
   * Обычная жизнь: органы чувств → нейросеть → движение.
   *
   * ВАЖНО: здесь нет никакого «наведения на еду». Существо только ВИДИТ
   * (входы), а куда повернуть и сколько газовать, решают ИСКЛЮЧИТЕЛЬНО
   * два выхода нейросети. У поколения 0 веса случайные — оно крутится
   * на месте или ползает кругами. Поворачивать к еде учит только эволюция.
   */
  updateBrain(dt, world, particles) {
    const c = CONFIG.creature;
    const t = this.traits;
    const vision = this.dna.visionRadius;
    const halfFov = t.fov / 2;
    const reach = this.radius + CONFIG.world.eatPadding;

    // 1) ОРГАНЫ ЧУВСТВ: видим только то, что в радиусе зрения (ген visionRadius)
    //    И внутри конуса обзора (зависит от числа глаз, ген numEyes).
    const foodScan = world.scan(world.food, this.x, this.y, vision, this.angle, halfFov, reach);
    const poisonScan = world.scan(world.poison, this.x, this.y, vision, this.angle, halfFov, reach);
    const food = foodScan.seen;
    const poison = poisonScan.seen;
    this.seenFood = food ? food.item : null;      // для подсветки при наведении курсора
    this.seenPoison = poison ? poison.item : null;

    // Слух: ближайший сосед в радиусе слышимости (во все стороны, без поля зрения).
    // Слышим ровно то число, которое он «произносит» — значение придумывает эволюция.
    this.speaker = world.nearestNeighbor(this, CONFIG.language.hearingRadius);
    this.heardSignal = this.speaker ? this.speaker.signal : 0;

    // 2) ВХОДЫ НЕЙРОСЕТИ. Если объект не виден — оба его входа = 0 («ничего нет»).
    //    Угол: −1…1 (слева/справа), близость: 1 = вплотную, →0 = на краю зрения.
    const inputs = [
      food ? wrapAngle(Math.atan2(food.dy, food.dx) - this.angle) / Math.PI : 0,
      food ? 1 - food.dist / vision : 0,
      poison ? wrapAngle(Math.atan2(poison.dy, poison.dx) - this.angle) / Math.PI : 0,
      poison ? 1 - poison.dist / vision : 0,
      this.energyRatio,                            // насколько я сыт
      this.heardSignal,                            // NearestSignal: что говорит ближайший сосед
    ];

    // 3) МОЗГ ДУМАЕТ: два выхода от -1 до 1
    const output = this.brain.predict(inputs);
    const accel = output[0];   // output[0] → ускорение (газ / тормоз)
    const turn = output[1];    // output[1] → изменение угла (rotation delta)
    this.signal = output[2];   // output[2] → EmitSignal: что я «говорю» (слово выбирает эволюция)

    // 4) ДВИЖЕНИЕ: только по выходам сети; пределы скорости/ускорения — из ДНК
    this.angle = wrapAngle(this.angle + turn * c.maxTurnRate * dt);
    let speed = this.speed + accel * t.maxAccel * dt;
    speed -= speed * c.friction * dt;
    speed = clamp(speed, 0, t.maxSpeed);
    this.vx = Math.cos(this.angle) * speed;
    this.vy = Math.sin(this.angle) * speed;

    // 5) ТРАТА ЭНЕРГИИ — связана с телом (см. DNA.computeTraits) и погодой:
    //    покой (размер, зрение, глаза) + движение (растёт с размером и скоростью)
    //    + климат (зимой мёрзнут лысые, летом перегреваются пушистые — seasons.js)
    const speedRatio = speed / t.maxSpeed;
    //    + болтовня (signalCost × сигнал²): говорить просто так — невыгодно
    const talkCost = CONFIG.language.signalCost * this.signal * this.signal;
    this.energy -= (t.idleCost + t.moveCost * speedRatio * speedRatio + this.thermalCost + talkCost) * dt;

    // 6) ЕДА И ЯД: съедаем то, чего касаемся (даже если не видим — например, спиной)
    this.consumeTouch(world, particles, foodScan.touch, poisonScan.touch);
  }

  /**
   * Проверка касаний «здесь и сейчас» без зрения — нужна при перетаскивании
   * мышкой: куда Создатель притащил, то и съедено.
   * @returns {boolean} true — если существо погибло (наткнулось на яд)
   */
  checkContacts(world, particles) {
    const reach = this.radius + CONFIG.world.eatPadding;
    const food = world.scan(world.food, this.x, this.y, 0, 0, Math.PI, reach).touch;
    const poison = world.scan(world.poison, this.x, this.y, 0, 0, Math.PI, reach).touch;
    this.consumeTouch(world, particles, food, poison);
    return this.dead;
  }

  /** Съесть еду и/или яд, которых касаемся. */
  consumeTouch(world, particles, food, poison) {
    if (food) {
      world.removeAt(world.food, food.index);
      this.energy = Math.min(this.maxEnergy, this.energy + CONFIG.energy.food);
      this.foodEaten++;
      this.eatScale = 1.3; // резкий scale(1.3) при поедании
      particles.emitSparkles(food.item.x, food.item.y, '#7dffb0', 7, 60);
    }
    if (poison) {
      world.removeAt(world.poison, poison.index);
      particles.emitSparkles(poison.item.x, poison.item.y, '#ff4d6d', 10, 80);
      this.die('poison');
    }
  }

  /** Режим «Погладить»: стоим, мурчим, пускаем сердечки, набираем энергию. */
  updatePetting(dt, particles) {
    this.pettingTimer -= dt;
    this.signal *= Math.max(0, 1 - dt * 3); // на ручках не до разговоров — замолкает
    const damp = Math.max(0, 1 - dt * 12);
    this.vx *= damp;
    this.vy *= damp;
    this.energy = Math.min(this.maxEnergy, this.energy + CONFIG.energy.petPerSecond * dt);

    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = CONFIG.petting.heartInterval;
      particles.emitHeart(this.x, this.y - this.radius);
    }
  }

  /**
   * Режим «Сеанс связи» — steering behaviors (рулевое поведение по Крейгу Рейнольдсу):
   *   seek/arrive  — лететь к своей точке и плавно тормозить возле неё;
   *   separation   — не налезать на соседей (силу считает HiveMind).
   * Еда и яд в этом режиме игнорируются, энергия не тратится.
   */
  updateCommunication(dt, world) {
    const cfg = CONFIG.comm;
    this.signal *= Math.max(0, 1 - dt * 3); // в ритуале существа молчат
    const d = world.delta(this.x, this.y, this.commTarget.x, this.commTarget.y);
    const dist = Math.hypot(d.x, d.y) || 0.0001;

    // arrive: чем ближе к цели — тем меньше желаемая скорость
    const desiredSpeed = dist < cfg.slowRadius ? cfg.speed * (dist / cfg.slowRadius) : cfg.speed;
    const desiredX = (d.x / dist) * desiredSpeed;
    const desiredY = (d.y / dist) * desiredSpeed;

    // steering = желаемая скорость - текущая скорость (+ расталкивание, слабеющее у цели)
    const sepWeight = Math.min(1, dist / 60);
    let steerX = (desiredX - this.vx) * 4 + this.sepX * sepWeight;
    let steerY = (desiredY - this.vy) * 4 + this.sepY * sepWeight;
    const mag = Math.hypot(steerX, steerY);
    if (mag > cfg.maxForce) {
      steerX = (steerX / mag) * cfg.maxForce;
      steerY = (steerY / mag) * cfg.maxForce;
    }
    this.vx += steerX * dt;
    this.vy += steerY * dt;
  }

  /** Таймеры анимаций. */
  updateAnimations(dt) {
    const speedRatio = Math.min(1, this.speed / this.maxSpeed);
    this.walkPhase += dt * (5 + speedRatio * 12);
    this.eatScale += (1 - this.eatScale) * Math.min(1, dt * 7);
    this.stretch = Math.max(0, this.stretch - dt * 1.6);
    this.appear = Math.min(1, this.appear + dt * 2.5);

    // Моргание
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkLeft = 0.16;
      this.blinkTimer = randRange(2, 6);
    }
    if (this.blinkLeft > 0) {
      this.blinkLeft -= dt;
      this.blink = Math.sin(Math.PI * clamp(1 - this.blinkLeft / 0.16, 0, 1));
    } else {
      this.blink = 0;
    }
  }

  /**
   * Деление. Родитель отдаёт часть энергии потомку.
   * Мозг потомка = копия мозга родителя + мутации весов.
   * ДНК потомка  = копия ДНК родителя + мутации генов (±10–20 %).
   */
  divide() {
    const e = CONFIG.energy;
    const b = CONFIG.brain;
    const tempo = CONFIG.evolution.tempo;
    const childBrain = this.brain.copy().mutate(Math.min(1, b.mutationRate * tempo), b.mutationAmount);
    const childDNA = this.dna.mutated();

    const back = this.drawAngle + Math.PI;
    const r = this.radius;
    const child = new Creature(this.x + Math.cos(back) * r, this.y + Math.sin(back) * r, childBrain, this.generation + 1, childDNA);

    // «Цена родов» фиксирована, поэтому маленьким (с маленьким запасом) она обходится дороже
    this.energy = this.maxEnergy * e.splitShare - e.splitCost / 2;
    child.energy = child.maxEnergy * e.splitShare - e.splitCost / 2;

    // Потомок «отталкивается» назад
    child.angle = wrapAngle(back + randRange(-0.6, 0.6));
    child.vx = Math.cos(child.angle) * 70;
    child.vy = Math.sin(child.angle) * 70;
    child.drawAngle = this.drawAngle; // вытягиваются вдоль одной оси
    child.appear = 1;

    // Сильное вытягивание при делении
    this.stretch = 1;
    child.stretch = 1;
    this.children++;
    return child;
  }

  // ===========================================================================
  //  ВИЗУАЛ (вызывается каждый кадр отрисовки, даже на паузе — существа дышат)
  // ===========================================================================

  /**
   * Собирает все деформации ядра в матрицу 2×2 (m00 m01 / m10 m11):
   *   • дыхание      — по осям экрана: шире по X, ниже по Y;
   *   • ходьба       — сплющивание вдоль вектора скорости (угол через Math.atan2);
   *   • деление      — сильное вытягивание вдоль вектора скорости;
   *   • еда/появление — равномерный масштаб;
   *   • мурчание     — высокочастотная мелкая вибрация масштаба и позиции.
   */
  computeBody(now) {
    const body = this.body;
    const r = this.radius;
    const speedRatio = Math.min(1, this.speed / this.maxSpeed);
    const purring = this.isPetted;

    // 1) Дыхание (асимметричный цикл 4.5 с, см. breathing.js)
    const breath = Breathing.amount(now, this.breathOffset);
    let bx = 1 + CONFIG.breathing.widen * breath;
    let by = 1 - CONFIG.breathing.flatten * breath;

    // 2) Деформации вдоль направления движения: hx — вдоль, hy — поперёк
    let hx = 1, hy = 1;
    const bob = Math.sin(this.walkPhase) * 0.07 * speedRatio;
    hx += bob;
    hy -= bob;
    if (this.stretch > 0) {
      const s = this.stretch;
      const jelly = Math.sin((1 - s) * 18) * s * 0.2;
      hx *= 1 + 0.9 * s * s + jelly;
      hy *= Math.max(0.3, 1 - 0.45 * s * s - jelly * 0.5);
    }

    // 3) Мурчание: частая мелкая дрожь ядра (~30 Гц)
    let jx = 0, jy = 0;
    if (purring) {
      const shake = Math.sin(now * 0.19 + this.id) * CONFIG.soot.purrCoreShake;
      bx *= 1 + shake;
      by *= 1 - shake;
      jx = Math.sin(now * 0.23 + this.id * 3) * r * 0.05;
      jy = Math.cos(now * 0.29 + this.id * 5) * r * 0.05;
    }

    // 3б) Дрожь от холода: мёрзнущие (лысые зимой) мелко трясутся
    if (!purring && this.coldStress > 0.12) {
      const sh = Math.min(1, this.coldStress) * 0.6;
      jx += Math.sin(now * 0.33 + this.id * 7) * r * 0.06 * sh;
      jy += Math.cos(now * 0.41 + this.id * 11) * r * 0.03 * sh;
    }

    // 4) Равномерный масштаб: появление «с пружинкой» и пульс после еды
    const appear = this.appear < 1 ? Math.max(0.01, easeOutBack(this.appear)) : 1;
    const u = appear * this.eatScale;

    // Матрица «растянуть вдоль угла a»: R(a) · diag(hx, hy) · R(−a)
    const c = Math.cos(this.drawAngle), s = Math.sin(this.drawAngle);
    const A = hx * c * c + hy * s * s;
    const B = (hx - hy) * c * s;
    const D = hx * s * s + hy * c * c;
    // …затем дыхание diag(bx, by) и общий масштаб u
    body.m00 = A * bx * u;  body.m01 = B * by * u;
    body.m10 = B * bx * u;  body.m11 = D * by * u;

    // Лёгкое подпрыгивание при ходьбе
    const hop = Math.abs(Math.sin(this.walkPhase * 0.5)) * r * 0.16 * speedRatio;
    body.cx = this.x + jx;
    body.cy = this.y + jy - hop;
    body.r = r;
    body.coreR = r;                       // ядро = baseRadius из ДНК
    body.hairLength = this.dna.hairLength;
    body.breath = breath;
    body.purring = purring;
    return body;
  }

  /** Обновляет визуальные части: деформацию ядра, зрачки, физику шерсти. */
  animateVisuals(dt, now) {
    const body = this.computeBody(now);

    // Зрачки плавно смещаются туда, куда существо движется
    const sp = this.speed;
    const k = Math.min(1, sp / (this.maxSpeed * 0.6));
    const tx = sp > 1 ? (this.vx / sp) * k : 0;
    const ty = sp > 1 ? (this.vy / sp) * k : 0;
    const follow = Math.min(1, dt * 8);
    this.pupilX += (tx - this.pupilX) * follow;
    this.pupilY += (ty - this.pupilY) * follow;

    this.fur.update(body, dt, now);
  }

  // ===========================================================================
  //  РИСОВАНИЕ
  // ===========================================================================
  draw(ctx, assets, time, isChampion, now) {
    const r = this.radius;
    const appear = this.appear < 1 ? Math.max(0.01, easeOutBack(this.appear)) : 1;
    assets.drawHalo(ctx, this.x, this.y, this.visualRadius * 0.45 * appear);
    // Летом пушистые перегреваются — вокруг них дрожит оранжевое свечение
    if (this.heatStress > 0.1) assets.drawHeatGlow(ctx, this.x, this.y, this.visualRadius * appear, this.heatStress, now);

    if (assets.creatureImage) this.drawImageSprite(ctx, assets);
    else this.drawSoot(ctx, assets, now);

    const top = this.y - r - this.dna.hairLength * 0.8;
    if (isChampion) assets.drawStar(ctx, this.x, top - 12, time);

    // «Речь»: если сигнал достаточно громкий — облачко со словом справа сверху
    const word = wordForSignal(this.signal);
    if (word) {
      const loud = clamp((Math.abs(this.signal) - CONFIG.language.speakThreshold) / 0.3, 0.35, 1);
      assets.drawSpeechBubble(ctx, this.x + r * 0.9 + 10, top - 4, word, loud);
    }
  }

  /** Процедурная чернушка: шерсть → ядро → глаза. */
  drawSoot(ctx, assets, now) {
    const body = this.body;
    this.fur.draw(ctx, body, now);

    ctx.save();
    // Применяем матрицу деформации ядра (ядро не вращается, только сжимается/тянется)
    ctx.transform(body.m00, body.m10, body.m01, body.m11, body.cx, body.cy);
    assets.drawSootCore(ctx, body.coreR);
    assets.drawSootEyes(ctx, this, body.r);
    ctx.restore();
  }

  /** Режим creature.png: картинка поворачивается по вектору движения (Math.atan2). */
  drawImageSprite(ctx, assets) {
    const r = this.radius;
    const speedRatio = Math.min(1, this.speed / this.maxSpeed);
    let sx = 1, sy = 1, sway = 0;

    if (this.isPetted) {
      const p = Math.sin(Date.now() * 0.19) * 0.06;
      sx *= 1 + p;
      sy *= 1 - p;
    } else {
      const bob = Math.sin(this.walkPhase) * 0.07 * speedRatio;
      sx *= 1 + bob;
      sy *= 1 - bob;
      sway = Math.sin(this.walkPhase * 0.5) * 0.18 * speedRatio;
    }
    sx *= this.eatScale;
    sy *= this.eatScale;
    if (this.stretch > 0) {
      const s = this.stretch;
      const jelly = Math.sin((1 - s) * 18) * s * 0.2;
      sx *= 1 + 0.9 * s * s + jelly;
      sy *= Math.max(0.3, 1 - 0.45 * s * s - jelly * 0.5);
    }
    const appear = this.appear < 1 ? Math.max(0.01, easeOutBack(this.appear)) : 1;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.drawAngle + sway);
    ctx.scale(sx * appear, sy * appear);
    assets.drawCreatureImage(ctx, r + this.dna.hairLength * 0.5);
    ctx.restore();
  }
}
