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
      uiToggle: $('ui-toggle'),
      zoomPill: $('zoom-pill'),
      extinct: $('extinct'),
      trust: $('stat-trust'),
      genesis: $('genesis'),
      genesisText: $('genesis-text'),
      reseedBtn: $('btn-reseed'),
      reserve: $('stat-reserve'),
      pauseBtn: $('btn-pause'),
      speedBtn: $('btn-speed'),
      callBtn: $('btn-call'),
      banner: $('banner'),
      tooltip: $('tooltip'),
      pauseBadge: $('pause-badge'),
    };
  }

  /**
   * Режим «чистые обои»: кнопка с глазом (или клавиша H) прячет весь интерфейс.
   * Выбор запоминается в браузере.
   */
  bindVisibility() {
    const KEY = 'lifiki.uiHidden';
    let hidden = false;
    try { hidden = localStorage.getItem(KEY) === '1'; } catch (e) { hidden = false; }
    const apply = () => {
      document.body.classList.toggle('ui-hidden', hidden);
      const label = hidden ? 'Показать интерфейс (H)' : 'Спрятать интерфейс (H)';
      this.el.uiToggle.title = label;
      this.el.uiToggle.setAttribute('aria-label', label);
      try { localStorage.setItem(KEY, hidden ? '1' : '0'); } catch (e) { /* не страшно */ }
    };
    const toggle = () => { hidden = !hidden; apply(); };
    this.el.uiToggle.addEventListener('click', toggle);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
    });
    apply();
  }

  /** Кнопка-индикатор зума и экран «Мир опустел». */
  bindCamera({ onReset, onReseed }) {
    this.el.zoomPill.addEventListener('click', onReset);
    this.el.reseedBtn.addEventListener('click', onReseed);
    this.lastZoomText = '';
  }

  /** Показываем «🔍 ×2.4» только когда приблизились (📌 — камера следит за существом). */
  updateZoom(zoom, following) {
    const visible = zoom > 1.01 || following;
    this.el.zoomPill.classList.toggle('visible', visible);
    if (!visible) return;
    const text = `🔍 ×${zoom.toFixed(1)}${following ? ' · 📌' : ''}`;
    if (text !== this.lastZoomText) { this.el.zoomPill.textContent = text; this.lastZoomText = text; }
  }

  showExtinct(show) {
    this.el.extinct.classList.toggle('visible', show);
  }

  /** Карточка «Зарождение жизни» (пока идёт доисторическая эпоха). */
  showGenesis(show, progress) {
    this.el.genesis.classList.toggle('visible', show);
    if (show && progress) {
      this.el.genesisText.textContent =
        `Доисторических минут: ${Math.round(progress.simMinutes)} · живых: ${progress.population} · поколение ${progress.generation.toFixed(1)}`;
    }
  }

  /** Интерфейс спрятан? (тогда не тратим время на обновление невидимых цифр) */
  get hidden() {
    return document.body.classList.contains('ui-hidden');
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
    // 🛡 — сейчас существ не больше запаса, и мир их бережёт (спячка вместо голодной смерти)
    this.el.reserve.textContent = `${stats.population <= stats.lifeReserve && stats.population > 0 ? '🛡 ' : ''}${stats.lifeReserve} / ${stats.lifeReserveMax}`;
    this.el.trust.textContent = UI.trustLabel(stats.hand.trust, stats.hand.afraid);
    const d = stats.dna;
    this.el.dnaRadius.textContent = `${d.baseRadius.toFixed(1)} px`;
    this.el.dnaVision.textContent = `${Math.round(d.visionRadius)} px`;
    this.el.dnaHair.textContent = `${Math.round(d.hairCount)} × ${Math.round(d.hairLength)} px`;
    this.el.dnaEyes.textContent = d.numEyes.toFixed(1);
    this.updateSeason(stats.climate, stats.avgFur);
    this.updateLexicon(stats.language);
    // Разум популяции: ×1 — как случайные мозги, ×3 и выше — полная полоска
    const r = stats.competence;
    this.el.awarenessBar.style.width = r === null ? '0%' : `${Math.round(clamp((r - 1) / 2, 0, 1) * 100)}%`;
    this.el.awarenessText.textContent = r === null ? 'измеряем…'
      : r >= 1.05 ? `×${r.toFixed(1)} лучше случайных` : `×${r.toFixed(1)} — не лучше случайных`;
  }

  setPaused(paused) {
    this.el.pauseBtn.textContent = paused ? '▶ Продолжить' : '⏸ Пауза';
    this.el.pauseBtn.classList.toggle('active', paused);
    this.el.pauseBadge.classList.toggle('visible', paused);
  }

  setSpeed(speed) {
    this.el.speedBtn.textContent = `⏩ x${speed}`;
  }

  /** Баннер сверху: заголовок + (необязательно) вторая строка-пояснение. */
  showBanner(text, subtitle = '') {
    clearTimeout(this.bannerTimer);
    const b = this.el.banner;
    b.textContent = '';
    const title = document.createElement('div');
    title.className = 'banner-title';
    title.textContent = text;
    b.appendChild(title);
    if (subtitle) {
      const sub = document.createElement('div');
      sub.className = 'banner-sub';
      sub.textContent = subtitle;
      b.appendChild(sub);
    }
    b.classList.add('visible');
  }

  /** Баннер на пару секунд (например, «никто не захотел выходить на связь»). */
  flashBanner(text, subtitle = '', ms = 3500) {
    this.showBanner(text, subtitle);
    this.bannerTimer = setTimeout(() => this.hideBanner(), ms);
  }

  hideBanner() {
    clearTimeout(this.bannerTimer);
    this.el.banner.classList.remove('visible');
  }

  /** Доверие к руке словами: «+0.42 · тянутся к вам» (one — про одно существо). */
  static trustLabel(trust, afraid = 0, one = false) {
    const t = CONFIG.hand.moodThreshold;
    const num = `${trust >= 0 ? '+' : '−'}${Math.abs(trust).toFixed(2)}`;
    const [loves, fears, unknown, watches] = one
      ? ['тянется к вам', 'боится рук', 'ещё не знает вас', 'присматривается']
      : ['тянутся к вам', 'боятся рук', 'ещё не знают вас', 'присматриваются'];
    const word = trust > t ? loves
      : afraid >= CONFIG.hand.avoidShare || trust < -t ? fears
      : Math.abs(trust) < 0.05 ? unknown : watches;
    return `${num} · ${word}`;
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
