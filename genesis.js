/**
 * genesis.js — «первичный бульон»: откуда берутся первые существа.
 *
 * В мире существа появляются ТОЛЬКО делением. Но кто-то должен быть первым.
 * Поэтому перед стартом мира (и после «Начать жизнь заново») за пару секунд,
 * без отрисовки, прокручивается доисторическая эпоха:
 *   • в «бульоне» (вечная весна) случайно самозарождаются существа
 *     поколения 0 со случайными мозгами — пока их меньше половины предела экрана;
 *   • почти все они гибнут, но изредка кто-то случайно наедается и делится;
 *   • эпоха заканчивается, когда возникает ЖИЗНЕСПОСОБНАЯ линия:
 *     популяция держится у предела stableTime секунд подряд, а среднее
 *     поколение ≥ minGeneration.
 * В настоящий мир выходят живые на конец эпохи — потомки этой линии
 * (их врождённые мозги и ДНК; опыт жизни у всех чистый).
 *
 * Работает «кусочками» (stepsPerChunk шагов за раз), чтобы страница не зависала.
 */
class Genesis {
  /**
   * @param {number} width, height — размер мира
   * @param {function} onProgress — ({simMinutes, population, generation, stableFor}) каждый кусочек
   * @returns {Promise<Array<{brain, dna, generation}>>}
   */
  static run(width, height, onProgress = () => {}) {
    const g = CONFIG.genesis;
    const world = new World(width, height);
    world.climate.update = () => {}; // вечная весна: в «бульоне» нет сезонов
    // «Бульон» плодороднее обычного мира: еды больше, она растёт быстрее
    const baseFood = CONFIG.world.foodPerMegapixel, baseRegen = CONFIG.world.foodRegenPerMegapixel;
    CONFIG.world.foodPerMegapixel = baseFood * g.foodBoost;
    CONFIG.world.foodRegenPerMegapixel = baseRegen * g.foodBoost;
    const restore = () => { CONFIG.world.foodPerMegapixel = baseFood; CONFIG.world.foodRegenPerMegapixel = baseRegen; };
    world.populate();
    const particles = { emitHeart() {}, emitSparkles() {}, emitSoot() {} };

    const spawnRandom = () => {
      const p = world.safePoint(CONFIG.world.spawnSafeDistance, world.poison);
      world.creatures.push(new Creature(p.x, p.y, null, 0, null));
    };
    for (let i = 0; i < Math.min(g.soupInitial, world.maxPopulation); i++) spawnRandom();

    let t = 0, stableFor = 0, spawnTimer = 0;
    const soupMin = Math.max(4, Math.floor(world.maxPopulation * g.soupShare));
    const target = Math.ceil(world.maxPopulation * g.stableShare);

    const stepOnce = () => {
      const dt = g.dt;
      t += dt;
      world.update(dt);
      for (const c of world.creatures) c.update(dt, world, particles);
      const born = [];
      for (const c of world.creatures) {
        if (!c.dead && c.canDivide() && world.creatures.length + born.length < world.maxPopulation) born.push(c.divide());
      }
      for (let i = world.creatures.length - 1; i >= 0; i--) {
        if (world.creatures[i].dead) { world.recordDeath(world.creatures[i]); world.creatures.splice(i, 1); }
      }
      world.creatures.push(...born);
      // Самозарождение — только здесь, в «бульоне»
      spawnTimer -= dt;
      if (world.creatures.length < soupMin && spawnTimer <= 0) { spawnRandom(); spawnTimer = 0.35; }
      // Жизнеспособная линия?
      const ok = world.creatures.length >= target && world.averageGeneration() >= g.minGeneration;
      stableFor = ok ? stableFor + dt : 0;
    };

    return new Promise((resolve) => {
      const chunk = () => {
        CONFIG.world.foodPerMegapixel = baseFood * g.foodBoost;      // (другой код мог читать CONFIG между кусочками)
        CONFIG.world.foodRegenPerMegapixel = baseRegen * g.foodBoost;
        for (let i = 0; i < g.stepsPerChunk; i++) {
          stepOnce();
          if (stableFor >= g.stableTime || t >= g.maxSimMinutes * 60) break;
        }
        onProgress({
          simMinutes: t / 60,
          population: world.creatures.length,
          generation: world.averageGeneration(),
          stableFor,
          done: false,
        });
        if (stableFor >= g.stableTime || t >= g.maxSimMinutes * 60) {
          // Выходят в мир живые на конец эпохи (если вдруг никого — лучшие по рекорду)
          let founders = world.creatures.map(c => ({ brain: c.brain.copy(false), dna: c.dna, generation: c.generation }));
          if (founders.length === 0 && world.bestBrain) {
            founders = [{ brain: world.bestBrain.copy(false), dna: world.bestDNA, generation: world.bestGeneration }];
          }
          restore();
          onProgress({ simMinutes: t / 60, population: founders.length, generation: world.averageGeneration(), stableFor, done: true });
          resolve(founders);
        } else {
          restore();                // пока ждём следующий кусочек — обычный мир живёт со своими настройками
          setTimeout(chunk, 0);
        }
      };
      chunk();
    });
  }
}
