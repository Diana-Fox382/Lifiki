/**
 * utils.js — маленькие математические помощники, которые нужны везде.
 */

const TAU = Math.PI * 2;

/** Ограничивает число v диапазоном [min, max]. */
function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Линейная интерполяция: при t=0 вернёт a, при t=1 вернёт b. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Случайное число в диапазоне [min, max). */
function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/** Приводит угол к диапазону [-PI, PI] — так проще сравнивать направления. */
function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

/** Плавно поворачивает угол a к углу b по кратчайшему пути. */
function lerpAngle(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

/**
 * Случайное число с нормальным (гауссовым) распределением.
 * Большинство значений около 0, редкие — далеко от нуля.
 * Идеально для мутаций: обычно маленькие изменения, иногда большие.
 */
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/** Плавная функция «с перелётом» — для упругих анимаций появления. */
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
