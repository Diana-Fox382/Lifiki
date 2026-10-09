/**
 * neural.js — простая нейросеть прямого распространения (Feed-Forward).
 *
 * Схема:   [5 входов] → [8 скрытых нейронов] → [2 выхода]
 *
 * Каждый нейрон считает взвешенную сумму входов + смещение (bias)
 * и пропускает её через функцию активации tanh (результат от -1 до 1).
 *
 * Сеть НЕ обучается градиентным спуском. Вместо этого работает эволюция:
 * потомок получает копию мозга родителя с небольшими случайными
 * изменениями (мутациями). Удачные мутации выживают и размножаются,
 * неудачные — вымирают. Это и есть нейроэволюция.
 */
class NeuralNetwork {
  constructor(inputCount, hiddenCount, outputCount) {
    this.inputCount = inputCount;
    this.hiddenCount = hiddenCount;
    this.outputCount = outputCount;

    // weightsIH[i][j] — связь от входа j к скрытому нейрону i
    this.weightsIH = NeuralNetwork.randomMatrix(hiddenCount, inputCount);
    this.biasH = NeuralNetwork.randomArray(hiddenCount);

    // weightsHO[i][j] — связь от скрытого нейрона j к выходу i
    this.weightsHO = NeuralNetwork.randomMatrix(outputCount, hiddenCount);
    this.biasO = NeuralNetwork.randomArray(outputCount);
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

  /** «Подумать»: получить выходы сети по входам. */
  predict(inputs) {
    const hidden = NeuralNetwork.layer(inputs, this.weightsIH, this.biasH);
    return NeuralNetwork.layer(hidden, this.weightsHO, this.biasO);
  }

  /** Глубокая копия мозга (для потомка). */
  copy() {
    const nn = new NeuralNetwork(this.inputCount, this.hiddenCount, this.outputCount);
    nn.weightsIH = this.weightsIH.map(row => row.slice());
    nn.biasH = this.biasH.slice();
    nn.weightsHO = this.weightsHO.map(row => row.slice());
    nn.biasO = this.biasO.slice();
    return nn;
  }

  /**
   * Мутация: каждый вес с вероятностью `rate` слегка сдвигается
   * на гауссово случайное число * `amount`. Очень редко вес
   * заменяется целиком — это даёт «скачки» в эволюции.
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
    return this; // чтобы можно было писать brain.copy().mutate(...)
  }
}
