/**
 * breathing.js — физиология дыхания чернушки.
 *
 * Дыхание в покое НЕ симметрично (не простая синусоида).
 * Один цикл длится 4.5 секунды и состоит из 4 фаз:
 *
 *   0 ──── 1200 мс   ВДОХ          активное расширение (ease-out: быстро в начале, мягко в конце)
 *   1200 ─ 1500 мс   ПАУЗА НА ВДОХЕ задержка дыхания (hold)
 *   1500 ─ 3200 мс   ВЫДОХ         расслабленное «сдувание» (ease-in-out)
 *   3200 ─ 4500 мс   ПАУЗА НА ВЫДОХЕ полный покой
 *
 * Функция возвращает «наполненность лёгких» от 0 (выдохнул) до 1 (вдохнул).
 * Существо само решает, как это нарисовать (см. Creature.computeBody):
 * ядро становится шире и чуть ниже, корни волосков раздвигаются.
 */
const Breathing = {
  /** Плавный старт и мягкая остановка в конце — для вдоха. */
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  },

  /** Медленно → быстрее → медленно — для расслабленного выдоха. */
  easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  },

  /**
   * @param {number} nowMs     текущее время (Date.now())
   * @param {number} offsetMs  личный сдвиг фазы существа (breathOffset)
   * @returns {number} 0..1 — насколько существо «набрало воздуха»
   */
  amount(nowMs, offsetMs) {
    const b = CONFIG.breathing;
    const t = (nowMs + offsetMs) % b.cycle;

    if (t < b.inhaleEnd) {
      return Breathing.easeOutCubic(t / b.inhaleEnd);              // 1) вдох
    }
    if (t < b.holdEnd) {
      return 1;                                                    // 2) задержка на вдохе
    }
    if (t < b.exhaleEnd) {
      const p = (t - b.holdEnd) / (b.exhaleEnd - b.holdEnd);
      return 1 - Breathing.easeInOutSine(p);                       // 3) выдох
    }
    return 0;                                                      // 4) покой
  },
};
