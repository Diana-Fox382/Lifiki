/**
 * world.js — класс World: «аквариум», в котором всё происходит.
 *
 * Хранит списки еды, яда и существ, выращивает новую еду,
 * знает размеры мира и умеет работать с замкнутыми краями
 * (мир как бублик-тор: правый край склеен с левым, верхний — с нижним).
 */
class World {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.food = [];       // [{x, y, phase}]
    this.poison = [];     // [{x, y, phase}]
    this.creatures = [];  // [Creature]

    this.foodAccumulator = 0;
    this.poisonAccumulator = 0;

    // Рекорды для статистики и эволюции
    this.recordAge = 0;
    this.bestBrain = null;
    this.bestGeneration = 0;
  }

  get megapixels() { return (this.width * this.height) / 1e6; }
  get maxFood() { return Math.round(CONFIG.world.foodPerMegapixel * this.megapixels); }
  get maxPoison() { return Math.round(CONFIG.world.poisonPerMegapixel * this.megapixels); }

  /** Окно изменило размер — переносим всё внутрь новых границ. */
  resize(width, height) {
    this.width = width;
    this.height = height;
    for (const list of [this.food, this.poison, this.creatures]) {
      for (const item of list) this.wrap(item);
    }
    // Если экран стал меньше — убираем лишнее
    if (this.food.length > this.maxFood) this.food.length = this.maxFood;
    if (this.poison.length > this.maxPoison) this.poison.length = this.maxPoison;
  }

  randomPoint() {
    return { x: Math.random() * this.width, y: Math.random() * this.height };
  }

  spawnFood() {
    const p = this.randomPoint();
    this.food.push({ x: p.x, y: p.y, phase: randRange(0, TAU) });
  }

  spawnPoison() {
    const p = this.randomPoint();
    this.poison.push({ x: p.x, y: p.y, phase: randRange(0, TAU) });
  }

  /** Заполнить мир едой и ядом при старте. */
  populate() {
    while (this.food.length < this.maxFood) this.spawnFood();
    while (this.poison.length < this.maxPoison) this.spawnPoison();
  }

  /** Еда растёт постепенно (с постоянной скоростью), яд — восстанавливается. */
  update(dt) {
    this.foodAccumulator += CONFIG.world.foodRegenPerMegapixel * this.megapixels * dt;
    while (this.foodAccumulator >= 1) {
      this.foodAccumulator -= 1;
      if (this.food.length < this.maxFood) this.spawnFood();
    }
    this.poisonAccumulator += CONFIG.world.poisonRegenPerSecond * dt;
    while (this.poisonAccumulator >= 1) {
      this.poisonAccumulator -= 1;
      if (this.poison.length < this.maxPoison) this.spawnPoison();
    }
  }

  /** Замкнутый мир: вышел за край — появился с другой стороны. */
  wrap(obj) {
    if (obj.x < 0) obj.x += this.width;
    else if (obj.x >= this.width) obj.x -= this.width;
    if (obj.y < 0) obj.y += this.height;
    else if (obj.y >= this.height) obj.y -= this.height;
  }

  /**
   * Кратчайший вектор от точки 1 к точке 2 с учётом замкнутых краёв.
   * Например, если существо у правого края, а еда у левого —
   * ближе «перешагнуть» через край, чем идти через весь экран.
   */
  delta(x1, y1, x2, y2) {
    let dx = x2 - x1, dy = y2 - y1;
    const hw = this.width / 2, hh = this.height / 2;
    if (dx > hw) dx -= this.width; else if (dx < -hw) dx += this.width;
    if (dy > hh) dy -= this.height; else if (dy < -hh) dy += this.height;
    return { x: dx, y: dy };
  }

  /** Найти ближайший объект из списка в радиусе maxDist. */
  findNearest(list, x, y, maxDist) {
    const w = this.width, h = this.height, hw = w / 2, hh = h / 2;
    let bestIndex = -1, bestD2 = maxDist * maxDist, bestDx = 0, bestDy = 0;
    for (let i = 0; i < list.length; i++) {
      let dx = list[i].x - x, dy = list[i].y - y;
      if (dx > hw) dx -= w; else if (dx < -hw) dx += w;
      if (dy > hh) dy -= h; else if (dy < -hh) dy += h;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2; bestIndex = i; bestDx = dx; bestDy = dy;
      }
    }
    if (bestIndex < 0) return null;
    return { item: list[bestIndex], index: bestIndex, dx: bestDx, dy: bestDy, dist: Math.sqrt(bestD2) };
  }

  /** Быстрое удаление: на место удаляемого ставим последний элемент. */
  removeAt(list, index) {
    list[index] = list[list.length - 1];
    list.pop();
  }

  /** Запоминаем рекордсмена: его мозг пригодится для новых поколений. */
  recordDeath(creature) {
    if (creature.age > this.recordAge) {
      this.recordAge = creature.age;
      this.bestBrain = creature.brain.copy();
      this.bestGeneration = creature.generation;
    }
  }

  /** Самое старое живое существо (рекордсмен среди живых). */
  oldestCreature() {
    let best = null;
    for (const c of this.creatures) if (!best || c.age > best.age) best = c;
    return best;
  }

  averageGeneration() {
    if (this.creatures.length === 0) return 0;
    let sum = 0;
    for (const c of this.creatures) sum += c.generation;
    return sum / this.creatures.length;
  }

  maxGeneration() {
    let m = 0;
    for (const c of this.creatures) if (c.generation > m) m = c.generation;
    return m;
  }
}
