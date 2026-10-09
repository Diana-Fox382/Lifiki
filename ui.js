/**
 * ui.js — класс UI: связь между симуляцией и HTML-интерфейсом.
 *
 * Симуляция ничего не знает про HTML — она просто передаёт сюда
 * числа, а UI раскладывает их по нужным элементам страницы.
 */
class UI {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      population: $('stat-population'),
      generation: $('stat-generation'),
      generationMax: $('stat-generation-max'),
      record: $('stat-record'),
      recordAlive: $('stat-record-alive'),
      food: $('stat-food'),
      poison: $('stat-poison'),
      awarenessBar: $('awareness-bar'),
      awarenessText: $('awareness-text'),
      pauseBtn: $('btn-pause'),
      speedBtn: $('btn-speed'),
      callBtn: $('btn-call'),
      banner: $('banner'),
      tooltip: $('tooltip'),
      pauseBadge: $('pause-badge'),
    };
  }

  /** Подключаем кнопки к функциям симуляции. */
  bind({ onPause, onSpeed, onCall }) {
    this.el.pauseBtn.addEventListener('click', onPause);
    this.el.speedBtn.addEventListener('click', onSpeed);
    this.el.callBtn.addEventListener('click', onCall);
  }

  static formatAge(seconds) {
    const s = Math.floor(seconds);
    if (s < 60) return `${s} с`;
    const m = Math.floor(s / 60);
    return `${m} мин ${String(s % 60).padStart(2, '0')} с`;
  }

  update(stats) {
    this.el.population.textContent = stats.population;
    this.el.generation.textContent = stats.avgGeneration.toFixed(1);
    this.el.generationMax.textContent = stats.maxGeneration;
    this.el.record.textContent = UI.formatAge(stats.recordAge);
    this.el.recordAlive.textContent = UI.formatAge(stats.championAge);
    this.el.food.textContent = stats.food;
    this.el.poison.textContent = stats.poison;
    this.el.awarenessBar.style.width = `${Math.round(stats.awareness * 100)}%`;
    this.el.awarenessText.textContent = stats.awareness >= 1
      ? 'Пробуждены ✨'
      : `${Math.round(stats.awareness * 100)}%`;
  }

  setPaused(paused) {
    this.el.pauseBtn.textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
    this.el.pauseBtn.classList.toggle('active', paused);
    this.el.pauseBadge.classList.toggle('visible', paused);
  }

  setSpeed(speed) {
    this.el.speedBtn.textContent = `⏩ x${speed}`;
  }

  showBanner(text) {
    this.el.banner.textContent = text;
    this.el.banner.classList.add('visible');
  }

  hideBanner() {
    this.el.banner.classList.remove('visible');
  }

  showTooltip(x, y, html) {
    const t = this.el.tooltip;
    t.innerHTML = html;
    t.style.transform = `translate(${Math.round(x + 16)}px, ${Math.round(y + 16)}px)`;
    t.classList.add('visible');
  }

  hideTooltip() {
    this.el.tooltip.classList.remove('visible');
  }
}
