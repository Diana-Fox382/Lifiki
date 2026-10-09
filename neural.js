/**
 * neural.js — нейросеть существа: врождённая часть + опыт одной жизни.
 *
 * Схема:   [входы] → [скрытые нейроны] → [выходы]
 * Каждый нейрон считает взвешенную сумму входов + смещение (bias)
 * и пропускает её через tanh (результат от −1 до 1).
 *
 * 1) ВРОЖДЁННОЕ (геном) — веса, которые передаются потомку с мутациями.
 *    Их подбирает эволюция: удачные мутации выживают и размножаются.
 *
 * 2) ОПЫТ ОДНОЙ ЖИЗНИ (обучение с подкреплением «методом проб»).
 *    Каждое мгновение к выходам подмешивается чуть-чуть случайности —
 *    сеть «пробует» немного повернуть или ускориться не так, как обычно.
 *    Она помнит, какие пробы делала недавно («след»). Когда приходит
 *    награда (съел еду: +1) или наказание (чуть не наткнулся на яд: −1),
 *    сеть закрепляет недавние пробы или, наоборот, отучается от них.
 *    Так учатся и настоящие животные: случайное движение → результат →
 *    «в похожей ситуации делай так чаще / реже».
 *    Насколько сильно учиться — ген «пластичности» (тоже эволюционирует).
 *    Опыт НЕ наследуется: потомок рождается с врождённым мозгом родителя,
 *    а свою «личность» набирает сам — из собственной жизни.
 */
class NeuralNetwork {
  constructor(inputCount, hiddenCount, outputCount) {
    this.inputCount = inputCount;
    this.hiddenCount = hiddenCount;
    this.outputCount = outputCount;

    // --- Геном ---
    // weightsIH[i][j] — связь от входа j к скрытому нейрону i
    this.weightsIH = NeuralNetwork.randomMatrix(hiddenCount, inputCount);
    this.biasH = NeuralNetwork.randomArray(hiddenCount);
    // weightsHO[i][j] — связь от скрытого нейрона j к выходу i
    this.weightsHO = NeuralNetwork.randomMatrix(outputCount, hiddenCount);
    this.biasO = NeuralNetwork.randomArray(outputCount);
    // Пластичность — насколько охотно учится при жизни (ген)
    this.plasticity = randRange(0, CONFIG.brain.plasticity.initialMax);

    this.resetExperience();
  }

  /** Чистый лист: опыта нет (так рождается каждое существо). */
  resetExperience() {
    const zeros = () => Array.from({ length: this.outputCount }, () => new Array(this.hiddenCount).fill(0));
    this.learned = zeros(); // поправки к weightsHO, накопленные за жизнь
    this.trace = zeros();   // «след»: что сеть недавно делала
    this.experience = 0;    // сколько раз пришло подкрепление (для интерфейса)
  }

  static randomArray(n) {
    return Array.from({ length: n }, () => randRange(-1, 1));
  }

  static randomMatrix(rows, cols) {
    return Array.from({ length: rows }, () => NeuralNetwork.randomArray(cols));
  }

  /** Один слой: для каждого нейрона tanh(bias + Σ вес × вход). */
  static layer(input, weights, biases) {
    const out = new Array(weights.length);
    for (let i = 0; i < weights.length; i++) {
      const row = weights[i];
      let sum = biases[i];
      for (let j = 0; j < row.length; j++) sum += row[j] * input[j];
      out[i] = Math.tanh(sum);
    }
    return out;
  }

  /** «Подумать»: выходы сети по входам (врождённые веса + опыт жизни + проба). */
  predict(inputs) {
    const hidden = NeuralNetwork.layer(inputs, this.weightsIH, this.biasH);
    const out = new Array(this.outputCount);
    const p = CONFIG.brain.plasticity;
    for (let i = 0; i < this.outputCount; i++) {
      const w = this.weightsHO[i], l = this.learned[i], tr = this.trace[i];
      let sum = this.biasO[i];
      for (let j = 0; j < this.hiddenCount; j++) sum += (w[j] + l[j]) * hidden[j];
      // «Проба»: чуть иначе, чем обычно. Пробуем только движения (газ и поворот) —
      // остальные выходы (речь, память) опытом не меняются. Пробы — часть
      // обучаемости: кто не учится (пластичность 0), тот и не «дёргается».
      const probe = i < p.learnOutputs && this.plasticity > 0
        ? gaussianRandom() * p.exploration * Math.min(1, this.plasticity / p.initialMax) : 0;
      out[i] = Math.tanh(sum + probe);
      // След: «когда этот скрытый нейрон был активен, я попробовал вот так»
      for (let j = 0; j < this.hiddenCount; j++) tr[j] = tr[j] * p.traceDecay + hidden[j] * probe;
    }
    return out;
  }

  /**
   * Подкрепление: r > 0 — «это было хорошо, делай так чаще»,
   * r < 0 — «это было плохо, делай так реже». Меняется только опыт (learned).
   */
  reward(r) {
    if (this.plasticity <= 0) return;
    const k = this.plasticity * r, lim = CONFIG.brain.plasticity.maxLearned;
    for (let i = 0; i < this.outputCount; i++) {
      const l = this.learned[i], tr = this.trace[i];
      for (let j = 0; j < this.hiddenCount; j++) l[j] = clamp(l[j] + k * tr[j], -lim, lim);
    }
    this.experience++;
  }

  /** Забывание: без новых подтверждений опыт понемногу тает (dt — секунды). */
  forget(dt) {
    const k = Math.exp(-dt / CONFIG.brain.plasticity.forgetTime);
    for (const row of this.learned) for (let j = 0; j < row.length; j++) row[j] *= k;
  }

  /** Насколько опыт жизни уже изменил поведение (сумма |поправок|). */
  experienceMagnitude() {
    let s = 0;
    for (const row of this.learned) for (const v of row) s += Math.abs(v);
    return s;
  }

  /**
   * Копия мозга.
   * @param {boolean} withExperience — false (по умолчанию): только геном,
   *        опыт чистый (так мозг получает потомок); true: точная копия «личности».
   */
  copy(withExperience = false) {
    const nn = new NeuralNetwork(this.inputCount, this.hiddenCount, this.outputCount);
    nn.weightsIH = this.weightsIH.map(row => row.slice());
    nn.biasH = this.biasH.slice();
    nn.weightsHO = this.weightsHO.map(row => row.slice());
    nn.biasO = this.biasO.slice();
    nn.plasticity = this.plasticity;
    if (withExperience) {
      nn.learned = this.learned.map(row => row.slice());
      nn.trace = this.trace.map(row => row.slice());
      nn.experience = this.experience;
    }
    return nn;
  }

  /**
   * Мутация генома: каждый вес с вероятностью `rate` слегка сдвигается
   * на гауссово случайное число * `amount`. Очень редко вес заменяется
   * целиком — это даёт «скачки» в эволюции. Мутирует и пластичность.
   */
  mutate(rate, amount) {
    const mutateValue = (v) => {
      if (Math.random() >= rate) return v;
      if (Math.random() < 0.05) return randRange(-1, 1);
      return clamp(v + gaussianRandom() * amount, -4, 4);
    };
    this.weightsIH = this.weightsIH.map(row => row.map(mutateValue));
    this.biasH = this.biasH.map(mutateValue);
    this.weightsHO = this.weightsHO.map(row => row.map(mutateValue));
    this.biasO = this.biasO.map(mutateValue);
    const p = CONFIG.brain.plasticity;
    if (Math.random() < rate * 3) {
      this.plasticity = clamp(this.plasticity + gaussianRandom() * p.mutationAmount, 0, p.max);
    }
    return this; // чтобы можно было писать brain.copy().mutate(...)
  }
}
