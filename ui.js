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
      dnaRadius: $('dna-radius'),
      dnaVision: $('dna-vision'),
      dnaHair: $('dna-hair'),
      dnaEyes: $('dna-eyes'),
      awarenessBar: $('awareness-bar'),
      awarenessText: $('awareness-text'),
      seasonIcon: $('season-icon'),
      seasonName: $('season-name'),
      seasonTemp: $('season-temp'),
      seasonMarker: $('season-marker'),
      seasonNext: $('season-next'),
      seasonEffect: $('season-effect'),
      seasonFur: $('season-fur'),
      setTempo: $('set-tempo'),
      setSeason: $('set-season'),
      setClimate: $('set-climate'),
      valTempo: $('val-tempo'),
      valSeason: $('val-season'),
      valClimate: $('val-climate'),
      resetSettings: $('btn-reset-settings'),
      lexiconRows: $('lexicon-rows'),
      lexiconSilence: $('lexicon-silence'),
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

  // ===========================================================================
  //  НАСТРОЙКИ МИРА (ползунки). Сохраняются в браузере (localStorage),
  //  поэтому после перезагрузки страницы остаются такими, как вы их оставили.
  // ===========================================================================
  bindSettings() {
    const KEY = 'lifiki.settings';
    const defaults = {
      tempo: CONFIG.evolution.tempo,
      seasonMinutes: CONFIG.climate.seasonLength / 60,
      climate: CONFIG.climate.strength,
    };
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
    const s = { ...defaults };
    for (const k of Object.keys(defaults)) if (Number.isFinite(saved[k])) s[k] = saved[k];

    const apply = () => {
      CONFIG.evolution.tempo = s.tempo;
      CONFIG.climate.seasonLength = s.seasonMinutes * 60;
      CONFIG.climate.strength = s.climate;
      this.el.setTempo.value = s.tempo;
      this.el.setSeason.value = s.seasonMinutes;
      this.el.setClimate.value = s.climate;
      this.el.valTempo.textContent = `×${s.tempo}`;
      this.el.valSeason.textContent = `${s.seasonMinutes} мин`;
      this.el.valClimate.textContent = s.climate === 0 ? 'выкл' : `×${s.climate}`;
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* приватный режим — не страшно */ }
    };

    this.el.setTempo.addEventListener('input', (e) => { s.tempo = +e.target.value; apply(); });
    this.el.setSeason.addEventListener('input', (e) => { s.seasonMinutes = +e.target.value; apply(); });
    this.el.setClimate.addEventListener('input', (e) => { s.climate = +e.target.value; apply(); });
    this.el.resetSettings.addEventListener('click', (e) => {
      e.preventDefault();
      Object.assign(s, defaults);
      apply();
    });
    apply();
  }

  /** Текст для карточки существа: как ему сейчас погода. */
  static thermalLabel(c) {
    if (c.coldStress > 0.1) return `🥶 мёрзнет (−${c.thermalCost.toFixed(1)}/с)`;
    if (c.heatStress > 0.1) return `🥵 перегрев (−${c.thermalCost.toFixed(1)}/с)`;
    return '😌 комфортно';
  }

  /** «▲ (громко)» или «молчит» — для карточки существа. */
  static wordLabel(signal) {
    const w = wordForSignal(signal);
    return w ? `<span style="color:${w.color}">${w.glyph}</span> ${w.name.toLowerCase()}` : 'молчит';
  }

  /** Словарь: доля каждого слова в речи и его «значение», если оно появилось. */
  updateLexicon(summary) {
    const names = { poison: '⚠️ рядом яд', food: '🍀 рядом еда', none: '🌫 ничего не видно' };
    this.el.lexiconRows.innerHTML = summary.words.map(({ word, share, meaning }) => {
      const pct = Math.round(share * 100);
      const m = meaning
        ? `звучит, когда <b>${names[meaning.context]}</b> (×${meaning.lift.toFixed(1)})`
        : (pct > 0 ? 'значение пока не сложилось' : 'не используется');
      return `<div class="lex-row">
          <span class="lex-glyph" style="color:${word.color}">${word.glyph}</span>
          <span class="lex-bar"><span style="width:${pct}%;background:${word.color}"></span></span>
          <span class="lex-share">${pct}%</span>
          <span class="lex-meaning">${m}</span>
        </div>`;
    }).join('');
    this.el.lexiconSilence.textContent = `🤫 Молчат: ${Math.round(summary.silenceShare * 100)}% времени`;
  }

  static formatClock(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** Карточка сезона. */
  updateSeason(climate, avgFur) {
    const season = climate.season;
    this.el.seasonIcon.textContent = season.icon;
    this.el.seasonName.textContent = season.name;
    const c = Math.round(climate.celsius);
    this.el.seasonTemp.textContent = `${c > 0 ? '+' : ''}${c} °C`;
    this.el.seasonMarker.style.left = `${(climate.yearPhase * 100).toFixed(2)}%`;
    this.el.seasonNext.textContent = `${climate.nextSeason.icon} ${climate.nextSeason.name} через ${UI.formatClock(climate.secondsToNextSeason)}`;

    let effect = 'Нейтральный сезон — передышка';
    if (CONFIG.climate.strength === 0) effect = 'Климат выключен';
    else if (climate.cold > 0.3) effect = 'Холодно: лысые замерзают';
    else if (climate.heat > 0.3) effect = 'Жарко: пушистые перегреваются';
    this.el.seasonEffect.textContent = effect;
    this.el.seasonFur.textContent = `${Math.round(avgFur * 100)}%`;

    // Цвет карточки следует за температурой
    const card = this.el.seasonIcon.closest('.season');
    card.classList.toggle('is-cold', climate.cold > 0.3);
    card.classList.toggle('is-hot', climate.heat > 0.3);
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
    const d = stats.dna;
    this.el.dnaRadius.textContent = `${d.baseRadius.toFixed(1)} px`;
    this.el.dnaVision.textContent = `${Math.round(d.visionRadius)} px`;
    this.el.dnaHair.textContent = `${Math.round(d.hairCount)} × ${Math.round(d.hairLength)} px`;
    this.el.dnaEyes.textContent = d.numEyes.toFixed(1);
    this.updateSeason(stats.climate, stats.avgFur);
    this.updateLexicon(stats.language);
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
    // Если карточка не помещается справа/снизу — показываем её слева/сверху от курсора
    const w = t.offsetWidth, h = t.offsetHeight;
    const left = x + 16 + w > window.innerWidth ? x - 16 - w : x + 16;
    const top = y + 16 + h > window.innerHeight ? y - 16 - h : y + 16;
    t.style.transform = `translate(${Math.round(Math.max(4, left))}px, ${Math.round(Math.max(4, top))}px)`;
    t.classList.add('visible');
  }

  hideTooltip() {
    this.el.tooltip.classList.remove('visible');
  }
}
