/**
 * language.js — эмерджентный язык существ.
 *
 * У нейросети есть выход EmitSignal (число от −1 до 1) — «что я сейчас говорю»
 * и вход NearestSignal — «что говорит ближайший сосед» (в радиусе слышимости).
 * Никаких заранее заданных значений у сигналов НЕТ: что значит «▲» —
 * решает эволюция. Например, если мутация заставила кого-то кричать «▲»
 * при виде яда, а у соседей другая мутация заставляет убегать, услышав «▲»,
 * — эта семья выживает лучше, и слово закрепляется.
 *
 * Спектр сигнала поделён на «слова» (символы в облачке над существом).
 * Тихая зона |сигнал| < 0.3 — молчание (облачко не рисуется).
 *
 *   −1 … −0.65   ▲  красный треугольник
 *   −0.65 … −0.3  ∿  оранжевая волна
 *   −0.3 … 0.3       (молчание)
 *    0.3 … 0.65   ■  синий квадрат
 *    0.65 … 1     ●  зелёный кружок
 *
 * LanguageStats — «словарь»: следит, В КАКОЙ СИТУАЦИИ звучит каждое слово
 * (видит говорящий яд, еду или ничего) и сравнивает с обычной ситуацией.
 * Если слово звучит рядом с ядом заметно чаще обычного — у него появилось
 * значение «опасность». Это наблюдение, а не подсказка: на поведение
 * существ словарь никак не влияет.
 */
const WORDS = [
  { id: 'triangle', glyph: '▲', name: 'Треугольник', color: '#ff6b6b', min: -1.01, max: -0.65 },
  { id: 'wave',     glyph: '∿', name: 'Волна',       color: '#ffa94d', min: -0.65, max: -0.3 },
  { id: 'square',   glyph: '■', name: 'Квадрат',     color: '#74c0fc', min: 0.3,   max: 0.65 },
  { id: 'circle',   glyph: '●', name: 'Кружок',      color: '#69db7c', min: 0.65,  max: 1.01 },
];

const CONTEXTS = ['poison', 'food', 'none'];

/** Какое слово соответствует сигналу (или null — молчание). */
function wordForSignal(s) {
  if (Math.abs(s) < CONFIG.language.speakThreshold) return null;
  for (const w of WORDS) if (s >= w.min && s < w.max) return w;
  return null;
}

/** В какой ситуации сейчас существо: видит яд / видит еду / ничего. */
function contextOf(creature) {
  if (creature.seenPoison) return 'poison';
  if (creature.seenFood) return 'food';
  return 'none';
}

class LanguageStats {
  constructor() {
    // usage[word.id][context] — «сколько секунд звучало слово в такой ситуации»
    this.usage = {};
    for (const w of WORDS) this.usage[w.id] = { poison: 0, food: 0, none: 0 };
    // baseline[context] — сколько времени существа вообще проводят в такой ситуации
    this.baseline = { poison: 0, food: 0, none: 0 };
    this.silence = 0;
  }

  /**
   * Учёт за один шаг. Старые наблюдения постепенно «забываются»
   * (период полураспада CONFIG.language.memory секунд), поэтому словарь
   * отражает текущую «культуру», а не историю с начала игры.
   */
  record(creatures, dt) {
    const decay = Math.pow(0.5, dt / CONFIG.language.memory);
    for (const w of WORDS) for (const k of CONTEXTS) this.usage[w.id][k] *= decay;
    for (const k of CONTEXTS) this.baseline[k] *= decay;
    this.silence *= decay;

    for (const c of creatures) {
      if (c.dead || c.isPetted || c.isCommunicating) continue;
      const ctx = contextOf(c);
      this.baseline[ctx] += dt;
      const w = wordForSignal(c.signal);
      if (w) this.usage[w.id][ctx] += dt;
      else this.silence += dt;
    }
  }

  /**
   * Сводка для интерфейса: для каждого слова — доля в речи и «значение».
   * Значение = ситуация, в которой слово звучит заметно чаще, чем обычно
   * (lift = доля ситуации при слове / обычная доля ситуации ≥ 1.5).
   */
  summary() {
    const baseTotal = this.baseline.poison + this.baseline.food + this.baseline.none || 1;
    let talkTotal = 0;
    for (const w of WORDS) for (const k of CONTEXTS) talkTotal += this.usage[w.id][k];
    const allTotal = talkTotal + this.silence || 1;

    const words = WORDS.map((w) => {
      const u = this.usage[w.id];
      const total = u.poison + u.food + u.none;
      let meaning = null;
      if (total > 2) {
        let best = null, bestLift = 0;
        for (const k of CONTEXTS) {
          const share = u[k] / total;
          const base = this.baseline[k] / baseTotal || 1e-6;
          const lift = share / base;
          if (lift > bestLift && share > 0.25) { bestLift = lift; best = { context: k, share, lift }; }
        }
        if (best && best.lift >= 1.5) meaning = best;
      }
      return { word: w, share: total / allTotal, meaning };
    });
    return { words, silenceShare: this.silence / allTotal };
  }
}
