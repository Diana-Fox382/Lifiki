/**
 * dna.js — ДНК существа: наследуемые параметры тела.
 *
 * Мозг (neural.js) отвечает за ПОВЕДЕНИЕ, а ДНК — за ТЕЛО (морфологию).
 * Оба наследуются при делении и оба мутируют, поэтому эволюция
 * подбирает не только «как двигаться», но и «каким быть».
 *
 * Гены:
 *   baseRadius   — размер ядра (10…25 px)
 *   hairCount    — количество волосков (10…50)
 *   hairLength   — длина волосков (10…40 px)
 *   numEyes      — количество глаз (1…4)
 *   visionRadius — радиус зрения (100…400 px)
 *
 * Компромиссы (из чего эволюция выбирает), формулы — в DNA.computeTraits():
 *   • Большой  → больше запас энергии, длиннее шаг (быстрее), шире «рот»,
 *                но дороже жизнь и ОЧЕНЬ дорого движение; дольше копить на деление.
 *   • Зоркий   → видит еду и яд издалека, но мозг «жжёт калории» даже в покое.
 *   • Пушистый → тормозит (ниже скорость); зимой спасает от холода, летом перегревается
 *                (это считает климат — seasons.js).
 *   • Глаза    → шире поле зрения (1 глаз — узкий конус, 4 глаза — все 360°),
 *                но каждый лишний глаз нагружает мозг (доп. трата в покое).
 */
const DNA_GENES = {
  baseRadius:   { min: 10,  max: 25,  integer: false },
  hairCount:    { min: 10,  max: 50,  integer: true  },
  hairLength:   { min: 10,  max: 40,  integer: false },
  numEyes:      { min: 1,   max: 4,   integer: true  },
  visionRadius: { min: 100, max: 400, integer: false },
};

class DNA {
  constructor(genes) {
    for (const name of Object.keys(DNA_GENES)) this[name] = genes[name];
    this.traits = this.computeTraits();
  }

  /** Случайная ДНК для поколения 0: каждый ген равномерно в своём диапазоне. */
  static random() {
    const genes = {};
    for (const [name, g] of Object.entries(DNA_GENES)) {
      const v = randRange(g.min, g.max + (g.integer ? 1 : 0));
      genes[name] = g.integer ? Math.min(g.max, Math.floor(v)) : v;
    }
    return new DNA(genes);
  }

  /**
   * Копия с мутациями. Каждый ген с вероятностью `rate` изменяется
   * на случайные ±(обычно 10, максимум 20) %.
   */
  mutated(rate = Math.min(1, CONFIG.dna.mutationRate * CONFIG.evolution.tempo)) {
    const genes = {};
    for (const [name, g] of Object.entries(DNA_GENES)) {
      let v = this[name];
      if (Math.random() < rate) {
        const factor = 1 + clamp(gaussianRandom() * CONFIG.dna.mutationAmount, -CONFIG.dna.maxStep, CONFIG.dna.maxStep);
        let nv = v * factor;
        if (g.integer) {
          nv = Math.round(nv);
          // У маленьких целых (глаза: 1–4) ±20 % может не дотянуть до следующего числа,
          // поэтому иногда делаем шаг ±1 напрямую — иначе ген «застрянет».
          if (nv === v) nv = v + (Math.random() < 0.5 ? -1 : 1);
        }
        v = clamp(nv, g.min, g.max);
      }
      genes[name] = v;
    }
    return new DNA(genes);
  }

  /**
   * Физиология: превращаем гены в характеристики тела.
   * Считается один раз при рождении (гены не меняются при жизни).
   */
  computeTraits() {
    const p = CONFIG.physiology;
    const size = this.baseRadius / 15;                                 // 0.67…1.67 (1 = «средний»)
    const fur = (this.hairCount * this.hairLength) / (50 * 40);        // 0.05…1 — «сколько шерсти»
    const vision = this.visionRadius / 250;                            // 0.4…1.6

    return {
      size,
      fur,
      // Запас энергии растёт с размером. Деление — когда запас полон.
      maxEnergy: p.energyPerSize * size,
      // Поле зрения (радианы) — по количеству глаз
      fov: (CONFIG.vision.fovByEyes[this.numEyes - 1] * Math.PI) / 180,
      // Длинные ноги — быстрее шаг; густая длинная шерсть — сопротивление (drag).
      maxSpeed: (p.baseSpeed * Math.sqrt(size)) / (1 + p.furDrag * fur),
      // Тяжёлым труднее разгоняться
      maxAccel: p.baseAccel / Math.sqrt(size),
      // Трата в покое: тело (∝ размеру) + мозг/зрение (∝ дальности²) + лишние глаза
      idleCost: p.bodyCost * size + p.visionCost * vision * vision + p.eyeCost * (this.numEyes - 1),
      // Трата на движение на полной скорости: растёт с размером быстрее, чем линейно
      moveCost: p.moveCost * Math.pow(size, p.moveSizeExp),
    };
  }
}
