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
    this.dna = dna || DNA.wildType();
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
    this.attention = null;      // единичный вектор «куда смотрю» (на яд/еду) или null
    // Общительность (0..1): насколько охотно выходит на «Сеанс связи». Личная черта.
    this.sociability = randRange(0.4, 1);
    this.carefulTimer = 0;      // > 0 — только что вышел из сеанса связи и обходит яд
    this.memory = new Array(CONFIG.brain.memory).fill(0); // нейроны памяти
    this.fearCooldown = 0;      // чтобы «испуг» от яда не повторялся каждое мгновение
    this.protected = false;     // под защитой «запаса жизни» (выставляет Simulation)
    this.dormant = false;       // спячка
    this.sickTimer = 0;         // > 0 — болеет (тронул яд, будучи под защитой)
    // Доверие к руке Создателя (−1…1): выучено из своего опыта и увиденного
    this.handTrust = 0;
    // «Запах» — метка родства (3 числа). Детёныш наследует её почти без изменений,
    // поэтому у близкой родни запахи почти одинаковые (см. Creature.kinship)
    this.scent = [Math.random(), Math.random(), Math.random()];
    this.dangerPlaces = [];     // опасные места, которые помнит: [{x, y, strength}]
    this.seenSites = new Set(); // какие пятна гибели уже видел (чтобы не учиться дважды)
    this.siteTimer = Math.random() * 0.5;
    this.grief = 0;             // > 0 — грустит: видел гибель родича
    // Линька: какая доля «зимней шубы» из ДНК сейчас на существе (1 — зимняя, 0.5 — летняя)
    this.coat = null;           // выставится по погоде в первом update()
    this.coatTraits = { fur: 0 };
    this.seenHand = null;       // видит ли руку прямо сейчас: 'food' (тянется) / 'danger' (убегает)
    this.handSeen = null;       // откуда бежать: {dx, dy, dist} (видит руку или помнит, где видел)
    this.alarm = null;          // тревога: {x, y, timer} — где видел страшную руку
    this.frightFlash = 0;       // > 0 — только что испугался (мелькает «!»)
    // Пугливость (0..1): сила врождённого рефлекса бегства от того, что выучено как опасное.
    // Личная черта: наследуется с небольшими мутациями, её подбирает отбор.
    this.skittish = randRange(0.1, 1);
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
  get visualRadius() { return this.radius + this.hairLength; }
  /** Текущая длина шерсти: ген (зимняя шуба) × линька. */
  get hairLength() { return this.dna.hairLength * (this.coat ?? 1); }
  get speed() { return Math.hypot(this.vx, this.vy); }
  get isPetted() { return this.pettingTimer > 0; }
  get isCommunicating() { return this.commTarget !== null; }

  /** Можно ли делиться: сыт, взрослый и не занят (не гладят, не на связи). */
  canDivide() {
    const maturity = CONFIG.evolution.maturityAge / CONFIG.evolution.tempo;
    return !this.dead && !this.dormant && this.energy >= this.maxEnergy && this.age >= maturity
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
    // Линька: к лету шерсть плавно редеет и укорачивается, к зиме отрастает
    const m = CONFIG.molt;
    const target = lerp(m.winter, m.summer, (world.climate.temperature + 1) / 2);
    this.coat = this.coat === null ? target : lerp(this.coat, target, Math.min(1, dt / m.time));
    this.coatTraits.fur = this.traits.fur * this.coat; // греет та шуба, что сейчас надета
    this.thermalCost = world.climate.thermalCost(this.coatTraits);
    this.coldStress = world.climate.coldStress(this.coatTraits);
    this.heatStress = world.climate.heatStress(this.coatTraits);
    this.updateAnimations(dt);
    if (this.sickTimer > 0) this.sickTimer -= dt;
    if (this.frightFlash > 0) this.frightFlash -= dt;
    if (this.grief > 0) this.grief -= dt;
    // Память об опасных местах понемногу тает
    if (this.dangerPlaces.length > 0) {
      const k = Math.pow(0.5, dt / CONFIG.deathSites.halfLife);
      for (const d of this.dangerPlaces) d.strength *= k;
      this.dangerPlaces = this.dangerPlaces.filter(d => d.strength > 0.05);
    }
    if (this.handTrust !== 0) this.handTrust *= Math.pow(0.5, dt / CONFIG.hand.halfLife); // время лечит

    if (this.isPetted) this.updatePetting(dt, particles);
    else if (this.dormant) this.updateDormant(dt);
    else if (this.isCommunicating) this.updateCommunication(dt, world, particles);
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

    if (this.energy <= 0) {
      // Последних (пока популяция в пределах «запаса жизни») мир бережёт:
      // от голода и холода они не умирают, а засыпают.
      if (this.protected) this.enterDormancy();
      else this.die('hunger');
    }
  }

  /** Спячка: не двигается, медленно восстанавливает силы, просыпается при 35 % энергии. */
  enterDormancy() {
    this.dormant = true;
    this.energy = 0.01;
    this.signal = 0;
    this.attention = null;
  }

  updateDormant(dt) {
    const damp = Math.max(0, 1 - dt * 6);
    this.vx *= damp;
    this.vy *= damp;
    this.signal = 0;
    this.attention = null;
    this.energy += CONFIG.population.dormantRecovery * dt;
    if (this.energy >= this.maxEnergy * CONFIG.population.wakeAt) this.dormant = false;
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
    let food = foodScan.seen;
    let poison = poisonScan.seen;

    // РУКА СОЗДАТЕЛЯ — сама по себе нейтральный стимул. Что она значит, каждое
    // существо выучивает само (handTrust, см. learnHand), и только тогда замечает её:
    //   • доверяет — видит руку «как еду», и врождённый поиск еды ведёт к ней;
    //   • боится — срабатывает врождённый рефлекс бегства (сила — черта «пугливость»).
    //     Почему не «как яд»: замеры показали, что от яда они не убегают, а обходят его
    //     вплотную — от неподвижной угрозы этого хватает, от хватающей руки нет.
    // Чем слабее чувство, тем «дальше» кажется рука (до 2 раз; сильное чувство — как есть).
    this.seenHand = null;
    this.handSeen = null;
    const ht = this.handTrust, hc = CONFIG.hand;
    if (world.hand && Math.abs(ht) >= hc.minTrust) {
      const h = world.scan([world.hand], this.x, this.y, vision, this.angle, halfFov, 0).seen;
      if (h) {
        if (ht > 0) {
          const felt = { ...h, dist: Math.min(vision * 0.999, h.dist * (2 - ht)) };
          if (!food || felt.dist < food.dist) { food = felt; this.seenHand = 'food'; }
        } else {
          this.seenHand = 'danger';
          if (!this.alarm) this.frightFlash = 0.8; // новый испуг (а не продолжение старого)
          this.alarm = { x: world.hand.x, y: world.hand.y, timer: hc.alarmTime };
        }
      }
    }
    // Тревога: испуг не пропадает в тот же миг, когда рука скрылась из виду, —
    // ещё немного уходим от места, где её видели
    if (this.alarm) {
      this.alarm.timer -= dt;
      if (this.alarm.timer <= 0) this.alarm = null;
      else {
        const d = world.delta(this.x, this.y, this.alarm.x, this.alarm.y);
        this.handSeen = { dx: d.x, dy: d.y, dist: Math.hypot(d.x, d.y), fade: this.alarm.timer / hc.alarmTime };
      }
    }
    this.seenFood = food && this.seenHand !== 'food' ? food.item : null;      // для подсветки при наведении курсора
    this.seenPoison = poison ? poison.item : null;
    // Куда смотрят глаза: на яд (страх важнее), иначе на еду (единичный вектор)
    const look = this.handSeen || poison || food; // испуг важнее всего — глаза на руку
    this.attention = look ? { x: look.dx / (look.dist || 1), y: look.dy / (look.dist || 1) } : null;

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
      ...this.memory,                              // ПАМЯТЬ: что «записал» себе в прошлое мгновение
    ];

    // 3) МОЗГ ДУМАЕТ: выходы от -1 до 1
    this.brain.forget(dt);
    const output = this.brain.predict(inputs);
    const accel = output[0];   // output[0] → ускорение (газ / тормоз)
    const turn = output[1];    // output[1] → изменение угла (rotation delta)
    this.signal = output[2];   // output[2] → EmitSignal: что я «говорю» (слово выбирает эволюция)
    // output[3..] → запись в память: эти числа мозг получит на вход в следующее мгновение
    for (let m = 0; m < this.memory.length; m++) this.memory[m] = output[3 + m];

    // ОПЫТ: яд оказался совсем рядом — испуг (наказание), сеть ослабит то, что сейчас делала
    this.fearCooldown -= dt;
    if (this.fearCooldown <= 0 && world.findNearest(world.poison, this.x, this.y, reach + CONFIG.brain.plasticity.nearMiss)) {
      this.brain.reward(CONFIG.brain.plasticity.poisonPenalty);
      this.fearCooldown = 1.5;
    }

    // 4) ДВИЖЕНИЕ: только по выходам сети; пределы скорости/ускорения — из ДНК
    this.angle = wrapAngle(this.angle + turn * c.maxTurnRate * dt);
    let speed = this.speed + accel * t.maxAccel * dt;
    speed -= speed * c.friction * dt;
    speed = clamp(speed, 0, t.maxSpeed);
    this.vx = Math.cos(this.angle) * speed;
    this.vy = Math.sin(this.angle) * speed;

    // МЕСТА ГИБЕЛИ: увидел пятно сажи там, где рука убила кого-то (или где погиб
    // родич), — запоминает место как опасное. Смотрим раз в полсекунды (экономим).
    this.siteTimer -= dt;
    if (this.siteTimer <= 0 && world.deathSites.length > 0) {
      this.siteTimer = 0.5;
      this.lookAtDeathSites(world, vision, halfFov);
    }

    // Рефлекс бегства от руки, которой боится: тем сильнее, чем ближе рука,
    // чем сильнее страх и чем пугливее характер. Бегство тратит силы (см. трату ниже).
    let flee = 0;
    if (this.handSeen) {
      const hs = this.handSeen, d = hs.dist || 1;
      flee = this.skittish * Math.max(0, -ht) * Math.max(0, 1 - d / vision) * (hs.fade ?? 1);
      const push = CONFIG.hand.fleeAccel * flee * dt;
      this.vx -= (hs.dx / d) * push;
      this.vy -= (hs.dy / d) * push;
      const v = Math.hypot(this.vx, this.vy);
      if (v > t.maxSpeed) { this.vx *= t.maxSpeed / v; this.vy *= t.maxSpeed / v; }
      if (v > 1) this.angle = Math.atan2(this.vy, this.vx);
    }
    // Тот же рефлекс уводит от опасных мест, которые существо помнит
    // (выучено, ГДЕ опасно; само бегство — врождённое, сила — пугливость)
    for (const place of this.dangerPlaces) {
      const d = world.delta(this.x, this.y, place.x, place.y);
      const dist = Math.hypot(d.x, d.y) || 1;
      const R = CONFIG.deathSites.radius + this.radius;
      if (dist >= R) continue;
      const k = this.skittish * Math.min(1, place.strength) * (1 - dist / R);
      flee += k;
      const push = CONFIG.hand.fleeAccel * k * dt;
      this.vx -= (d.x / dist) * push;
      this.vy -= (d.y / dist) * push;
      const v = Math.hypot(this.vx, this.vy);
      if (v > t.maxSpeed) { this.vx *= t.maxSpeed / v; this.vy *= t.maxSpeed / v; }
      if (v > 1) this.angle = Math.atan2(this.vy, this.vx);
    }

    // Первые секунды после «Сеанса связи» существо ещё осторожно: огибает яд,
    // пока «приходит в себя» (иначе, выходя из фигуры, оно спотыкалось о соседний яд).
    if (this.carefulTimer > 0) {
      this.carefulTimer -= dt;
      const a = this.avoidPoison(world, this.vx, this.vy);
      this.vx += a.x * dt;
      this.vy += a.y * dt;
      if (Math.hypot(this.vx, this.vy) > 1) this.angle = Math.atan2(this.vy, this.vx);
    }

    // 5) ТРАТА ЭНЕРГИИ — связана с телом (см. DNA.computeTraits) и погодой:
    //    покой (размер, зрение, глаза) + движение (растёт с размером и скоростью)
    //    + климат (зимой мёрзнут лысые, летом перегреваются пушистые — seasons.js)
    const speedRatio = speed / t.maxSpeed;
    //    + болтовня (signalCost × сигнал²): говорить просто так — невыгодно
    const talkCost = CONFIG.language.signalCost * this.signal * this.signal;
    this.energy -= (t.idleCost + t.moveCost * (speedRatio * speedRatio + flee) + this.thermalCost + talkCost) * dt;

    // 6) ЕДА И ЯД: съедаем то, чего касаемся (даже если не видим — например, спиной)
    this.consumeTouch(world, particles, foodScan.touch, poisonScan.touch, false);
  }

  /**
   * Проверка касаний «здесь и сейчас» без зрения — нужна при перетаскивании
   * мышкой: куда Создатель притащил, то и съедено.
   * @returns {boolean} true — если существо погибло (наткнулось на яд)
   */
  /**
   * @param {boolean} byHand — true: существо тащит Создатель (тогда яд убивает всегда)
   */
  checkContacts(world, particles, byHand = false) {
    const reach = this.radius + CONFIG.world.eatPadding;
    const food = world.scan(world.food, this.x, this.y, 0, 0, Math.PI, reach).touch;
    const poison = world.scan(world.poison, this.x, this.y, 0, 0, Math.PI, reach).touch;
    this.consumeTouch(world, particles, food, poison, byHand);
    return this.dead;
  }

  /** Съесть еду и/или яд, которых касаемся. */
  consumeTouch(world, particles, food, poison, byHand) {
    if (food) {
      world.removeAt(world.food, food.index);
      this.energy = Math.min(this.maxEnergy, this.energy + CONFIG.energy.food);
      this.foodEaten++;
      this.eatScale = 1.3; // резкий scale(1.3) при поедании
      particles.emitSparkles(food.item.x, food.item.y, '#7dffb0', 7, 60);
      this.brain.reward(CONFIG.brain.plasticity.foodReward); // ОПЫТ: «это было хорошо»
    }
    if (poison) {
      world.removeAt(world.poison, poison.index);
      particles.emitSparkles(poison.item.x, poison.item.y, '#ff4d6d', 10, 80);
      if (this.protected && !byHand) {
        // Защищённые («запас жизни») от яда своей смертью не умирают — тяжело болеют
        this.energy *= 1 - CONFIG.population.sicknessLoss;
        this.sickTimer = 3;
        this.brain.reward(CONFIG.brain.plasticity.poisonPenalty * 2); // и хорошо запоминают
      } else {
        this.die(byHand ? 'hand' : 'poison');
      }
    }
  }

  /** Режим «Погладить»: стоим, мурчим, пускаем сердечки, набираем энергию. */
  updatePetting(dt, particles) {
    this.pettingTimer -= dt;
    this.signal *= Math.max(0, 1 - dt * 3); // на ручках не до разговоров — замолкает
    this.attention = null;
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
  updateCommunication(dt, world, particles) {
    const cfg = CONFIG.comm;
    this.signal *= Math.max(0, 1 - dt * 3); // в ритуале существа молчат
    this.attention = null;
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
    // Яд НЕ игнорируем: обходим его (отталкивание + «скольжение» вбок вокруг яда).
    // Если точка фигуры у самого яда — существо просто встанет поодаль:
    // фигура выйдет менее ровной, зато это их собственный выбор, а не слепое повиновение.
    const avoid = this.avoidPoison(world, desiredX, desiredY);
    steerX += avoid.x;
    steerY += avoid.y;

    this.vx += steerX * dt;
    this.vy += steerY * dt;

    // Касание — как обычно: еду съедят, а на яд наткнуться всё ещё можно (если не успели свернуть)
    this.checkContacts(world, particles);
  }

  /**
   * Сила «обхода яда» для режима сеанса связи (steering behavior «avoid»).
   * Каждый яд ближе (радиус + comm.avoidRadius) отталкивает тем сильнее, чем он ближе,
   * и подталкивает вбок — в ту сторону, куда существу и так надо (огибает, а не застревает).
   */
  avoidPoison(world, desiredX, desiredY) {
    const cfg = CONFIG.comm;
    const R = this.radius + cfg.avoidRadius;
    let ax = 0, ay = 0, strongest = 0, look = null;
    for (const p of world.poison) {
      const d = world.delta(this.x, this.y, p.x, p.y);
      const dist = Math.hypot(d.x, d.y);
      if (dist >= R || dist === 0) continue;
      const k = (R - dist) / R;
      const force = k * k * cfg.avoidForce;
      const nx = d.x / dist, ny = d.y / dist;
      ax -= nx * force;
      ay -= ny * force;
      // Вбок: перпендикуляр, повёрнутый в сторону желаемого движения
      let px = -ny, py = nx;
      if (px * desiredX + py * desiredY < 0) { px = -px; py = -py; }
      ax += px * force * 0.6;
      ay += py * force * 0.6;
      if (k > strongest) { strongest = k; look = { x: nx, y: ny }; }
    }
    if (look) this.attention = look; // глаза — на яд, который обходим
    return { x: ax, y: ay };
  }

  /**
   * Родство двух существ по «запаху»: 1 — запах совпадает (мать и дитя),
   * 0 — чужие. Настоящей родословной они не знают — только похожесть запаха.
   */
  static kinship(a, b) {
    const s1 = a.scent, s2 = b.scent;
    const d = Math.hypot(s1[0] - s2[0], s1[1] - s2[1], s1[2] - s2[2]);
    return clamp(1 - d / CONFIG.kin.scentRange, 0, 1);
  }

  /** Запомнить опасное место (близкие места сливаются, помним самые сильные). */
  rememberDanger(x, y, strength) {
    if (strength <= 0) return;
    const cfg = CONFIG.deathSites;
    for (const d of this.dangerPlaces) {
      if (Math.hypot(d.x - x, d.y - y) < cfg.radius * 0.5) {
        d.strength = Math.min(1.5, Math.max(d.strength, strength) + strength * 0.3);
        return;
      }
    }
    this.dangerPlaces.push({ x, y, strength });
    this.dangerPlaces.sort((a, b) => b.strength - a.strength);
    if (this.dangerPlaces.length > cfg.memory) this.dangerPlaces.length = cfg.memory;
  }

  /** Существо своими глазами (радиус и конус обзора) находит пятна сажи — места гибели. */
  lookAtDeathSites(world, vision, halfFov) {
    const cfg = CONFIG.deathSites;
    if (this.seenSites.size > 60) { // забываем пятна, которых уже нет
      const alive = new Set(world.deathSites.map(s => s.id));
      for (const id of this.seenSites) if (!alive.has(id)) this.seenSites.delete(id);
    }
    for (const site of world.deathSites) {
      if (this.seenSites.has(site.id)) continue;
      const d = world.delta(this.x, this.y, site.x, site.y);
      const dist = Math.hypot(d.x, d.y);
      if (dist > vision) continue;
      if (halfFov < Math.PI - 1e-6 && Math.cos(Math.atan2(d.y, d.x) - this.angle) < Math.cos(halfFov)) continue;
      this.seenSites.add(site.id);
      const k = Creature.kinship(this, site);
      // Чужая смерть от голода ничего не говорит об опасности; гибель от руки
      // или смерть родича — говорит (и пугает тем сильнее, чем ближе родство)
      this.rememberDanger(site.x, site.y, (cfg.danger[site.cause] || 0) * cfg.foundShare * (0.5 + k));
      if (k >= CONFIG.kin.relative && site.age < 30) this.grief = Math.max(this.grief, CONFIG.kin.griefTime * 0.5);
    }
  }

  /**
   * Выучить отношение к руке (правило Рескорлы — Вагнера: чем неожиданнее
   * событие, тем сильнее урок). target: +1 — рука добрая, −1 — опасная.
   * strength: насколько впечатляющее событие. Ген обучаемости ускоряет выучивание.
   */
  learnHand(target, strength) {
    const p = CONFIG.brain.plasticity;
    const gene = 0.3 + this.brain.plasticity / p.initialMax;    // 0.3 (не учится по-другому) … 2.3
    const a = clamp(CONFIG.hand.learnRate * gene * strength, 0, 1);
    this.handTrust = clamp(this.handTrust + a * (target - this.handTrust), -1, 1);
  }

  /**
   * Захочет ли существо выйти на связь? Это его выбор:
   *   • общительность — личная черта (наследуется с небольшими мутациями);
   *   • голодному не до разговоров;
   *   • доверяет руке Создателя — откликается охотнее, боится — реже;
   *   • если Создатель позвал сам — откликаются чуть охотнее.
   */
  wantsToTalk(mood, called) {
    if (this.dead || this.isPetted) return false;
    let p = CONFIG.comm.joinChance * this.sociability;
    if (this.energyRatio < 0.3) p *= 0.3;
    p *= 1 + 0.3 * this.handTrust;
    if (called) p += 0.1;
    return Math.random() < p;
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
    // Характер наследуется: общительность родителя ± немного
    child.sociability = clamp(this.sociability + gaussianRandom() * 0.08, 0.15, 1);
    // Отношение к руке Создателя — не гены, а «культура»: детёныш перенимает часть
    // страха или доверия родителя (так и звери учатся бояться у матери)
    child.handTrust = this.handTrust * CONFIG.hand.culture;
    child.skittish = clamp(this.skittish + gaussianRandom() * 0.08, 0, 1);
    // «Запах» — почти родительский: так родня и узнаёт друг друга
    child.scent = this.scent.map(v => clamp(v + gaussianRandom() * CONFIG.kin.scentMutation, 0, 1));

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
      jx = Math.sin(now * 0.23 + this.id * 3) * r * 0.012;  // дрожь еле заметна
      jy = Math.cos(now * 0.29 + this.id * 5) * r * 0.012;
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
    body.hairLength = this.hairLength;
    body.coat = this.coat ?? 1;
    body.breath = breath;
    body.purring = purring;
    return body;
  }

  /** Обновляет визуальные части: деформацию ядра, зрачки, физику шерсти. */
  animateVisuals(dt, now) {
    const body = this.computeBody(now);

    // Взгляд: глаза и зрачки смещаются туда, куда существо смотрит.
    //   1) видит яд или еду — смотрит на них (на яд в первую очередь: страх!);
    //   2) иначе — туда, куда ползёт (вектор скорости);
    //   3) на ручках — на Создателя (прямо на нас, в центр).
    let tx = 0, ty = 0;
    if (!this.isPetted) {
      if (this.attention) {
        tx = this.attention.x;
        ty = this.attention.y;
      } else {
        const sp = this.speed;
        const k = Math.min(1, sp / (this.maxSpeed * 0.6));
        if (sp > 1) { tx = (this.vx / sp) * k; ty = (this.vy / sp) * k; }
      }
    }
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

    const top = this.y - r - this.hairLength * 0.8;
    if (isChampion) assets.drawStar(ctx, this.x, top - 12, time);

    // Траур: видел гибель родича — по щеке медленно катится слезинка
    if (this.grief > 0) {
      const k = (now % 1600) / 1600;
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.grief) * Math.sin(k * Math.PI) * 0.85;
      ctx.fillStyle = '#9fd3ff';
      ctx.beginPath();
      ctx.arc(this.x + r * 0.35, this.y + r * (0.05 + k * 0.45), Math.max(1.5, r * 0.09), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Испуг: первые мгновения тревоги над головой мелькает «!»
    if (this.frightFlash > 0) {
      const k = 1 - this.frightFlash / 0.8;
      ctx.save();
      ctx.globalAlpha = Math.sin(k * Math.PI);
      ctx.fillStyle = '#ffd36b';
      ctx.font = '800 15px Nunito, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', this.x - r * 0.7, top - 2 - k * 6);
      ctx.restore();
    }

    // Спячка: над головой медленно всплывает «z»
    if (this.dormant) {
      const k = (now % 2400) / 2400;
      ctx.save();
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
      ctx.fillStyle = '#dfe8ff';
      ctx.font = `800 ${Math.round(9 + k * 5)}px Nunito, sans-serif`;
      ctx.fillText('z', this.x + r * 0.6 + k * 6, top - k * 14);
      ctx.restore();
    }
    // Болеет (тронул яд под защитой мира): лёгкая зеленоватая дымка
    if (this.sickTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.sickTimer) * 0.35;
      ctx.fillStyle = '#7dff9a';
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.visualRadius * 0.7, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

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
    assets.drawCreatureImage(ctx, r + this.hairLength * 0.5);
    ctx.restore();
  }
}
