/**
 * competence.js — «Разум популяции»: честный замер, а не счётчик поколений.
 *
 * Раз в interval секунд берём несколько существ популяции и устраиваем им
 * экзамен на «арене» (маленький мир без отрисовки, еда + яд). Рядом с каждым
 * сдаёт тот же экзамен его «двойник»: ТО ЖЕ тело (ДНК), но СЛУЧАЙНЫЙ мозг,
 * на ТОЙ ЖЕ арене (одинаковое расположение еды и яда).
 *
 * Очки: съеденная еда; гибель от яда — −3 и экзамен окончен.
 * Результат = (очки популяции + 0.5) / (очки случайных мозгов + 0.5):
 *   ×1 — популяция не умнее случайных мозгов;
 *   ×2 — ищет еду и избегает яда вдвое лучше, и т.д.
 * Экзамены идут по одному за кадр, чтобы не тормозить обои.
 */
class CompetenceMeter {
  constructor() {
    this.ratio = null;        // текущая оценка (null — ещё не измеряли)
    this.queue = [];          // экзамены, ожидающие проведения
    this.batch = null;        // {evolved: [], random: []} — результаты текущей серии
    this.timer = 3;           // первая проверка — через 3 секунды
    this.lastSample = 0;      // сколько существ сдавали в последний раз
  }

  /** Новый мир — новая история замеров. */
  reset() {
    this.ratio = null;
    this.queue = [];
    this.batch = null;
    this.timer = 3;
  }

  /** Простой генератор псевдослучайных чисел (одинаковые арены для пары). */
  static rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Один экзамен. Возвращает очки. */
  static trial(brain, dna, seed) {
    const cfg = CONFIG.competence;
    const rnd = CompetenceMeter.rng(seed);
    const w = new World(cfg.arenaWidth, cfg.arenaHeight);
    w.update = () => {};                 // на арене еда не отрастает
    for (let i = 0; i < cfg.food; i++) w.food.push({ x: rnd() * w.width, y: rnd() * w.height, phase: 0 });
    for (let i = 0; i < cfg.poison; i++) {
      // яд не прямо под стартовой точкой
      let x, y;
      do { x = rnd() * w.width; y = rnd() * w.height; } while (Math.hypot(x - w.width / 2, y - w.height / 2) < 70);
      w.poison.push({ x, y, phase: 0 });
    }
    const particles = { emitHeart() {}, emitSparkles() {}, emitSoot() {} };
    const c = new Creature(w.width / 2, w.height / 2, brain, 0, dna);
    c.angle = rnd() * TAU;
    c.vx = c.vy = 0;
    w.creatures.push(c);
    const dt = 1 / 20;
    for (let i = 0; i < cfg.seconds / dt; i++) {
      c.energy = c.maxEnergy * 0.6;      // экзамен на ум, а не на выносливость
      c.update(dt, w, particles);
      if (c.dead) return c.foodEaten - 3;
    }
    return c.foodEaten;
  }

  /** Вызывается каждый кадр. */
  update(dt, world) {
    if (this.queue.length > 0) {
      const job = this.queue.shift();
      const score = CompetenceMeter.trial(job.brain, job.dna, job.seed);
      this.batch[job.kind].push(score);
      if (this.queue.length === 0) this.finishBatch();
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;

    // Выбираем экзаменуемых (живых, не спящих) и их «двойников» со случайным мозгом
    const pool = world.creatures.filter(c => !c.dead && !c.dormant);
    if (pool.length === 0) return; // некого экзаменовать — попробуем в следующем кадре
    this.timer = CONFIG.competence.interval;
    const picks = pool.sort(() => Math.random() - 0.5).slice(0, CONFIG.competence.sample);
    this.batch = { evolved: [], random: [] };
    this.lastSample = picks.length;
    const b = CONFIG.brain;
    for (const c of picks) {
      for (let k = 0; k < CONFIG.competence.arenasPerCreature; k++) {
        const seed = (Math.random() * 1e9) | 0;
        this.queue.push({ kind: 'evolved', brain: c.brain.copy(true), dna: c.dna, seed });
        this.queue.push({ kind: 'random', brain: new NeuralNetwork(b.inputs, b.hidden, b.outputs), dna: c.dna, seed });
      }
    }
  }

  finishBatch() {
    const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const r = (mean(this.batch.evolved) + 0.5) / (Math.max(0, mean(this.batch.random)) + 0.5);
    // Сглаживаем, чтобы цифра не прыгала от серии к серии
    this.ratio = Math.max(0, this.ratio === null ? r : lerp(this.ratio, r, 0.4));
    this.batch = null;
  }
}
