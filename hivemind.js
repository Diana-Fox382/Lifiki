/**
 * hivemind.js — «Общение с Создателем» (Hive Mind Communication).
 *
 * Когда среднее поколение популяции превышает CONFIG.comm.minAvgGeneration,
 * у существ появляется «осознанность». Примерно раз в минуту запускается
 * Communication Event:
 *   1) gather — все существа бросают еду и летят к своей точке фигуры.
 *               Фигура зависит от КАРМЫ Создателя (см. chooseShape):
 *               любовь → сердце/смайлик/цветок…, ненависть → череп/крест/⚠…,
 *               нейтрально → геометрия или слово их собственного языка;
 *   2) hold   — несколько секунд держат фигуру, пуская сердечки;
 *   3) конец  — разлетаются в разные стороны и живут дальше.
 *
 * Фигуры описаны как набор ломаных линий в координатах от -1 до 1.
 * Мы равномерно расставляем на этих линиях ровно столько точек,
 * сколько сейчас существ, и каждому выдаём ближайшую свободную точку.
 */

/** Окружность (или дуга) в виде ломаной. */
function arcPolyline(cx, cy, r, from, to, segments) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

/** Замкнутый многоугольник из точек [[x, y], ...]. */
function closedPoly(points) {
  const pts = points.map(([x, y]) => ({ x, y }));
  pts.push({ ...pts[0] });
  return pts;
}

/** Звезда с n лучами (внешний радиус 1, внутренний inner). */
function starPolyline(n, inner) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? 1 : inner;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return closedPoly(pts);
}

/**
 * Библиотека фигур. Каждая фигура — набор ломаных в координатах −1…1.
 * icon — что показывается в баннере («Они говорят: 🤍»).
 */
const SHAPES = {
  // ---------- Симпатия ----------
  heart: {
    icon: '🤍',
    build() {
      const pts = [];
      for (let i = 0; i <= 90; i++) {
        const t = (i / 90) * TAU;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push({ x: x / 17, y: y / 17 - 0.15 });
      }
      return [pts];
    },
  },
  smile: {
    icon: '🙂',
    build() {
      return [
        arcPolyline(0, 0, 1, 0, TAU, 64),
        arcPolyline(-0.36, -0.3, 0.13, 0, TAU, 14),
        arcPolyline(0.36, -0.3, 0.13, 0, TAU, 14),
        arcPolyline(0, 0.02, 0.58, Math.PI * 0.15, Math.PI * 0.85, 24),
      ];
    },
  },
  flower: {
    icon: '🌸',
    build() {
      // 5 лепестков: «роза» r = |cos(2.5θ)| + серединка
      const petals = [];
      for (let i = 0; i <= 160; i++) {
        const a = (i / 160) * TAU;
        const r = 0.3 + 0.7 * Math.abs(Math.cos(2.5 * a));
        petals.push({ x: Math.cos(a - Math.PI / 2) * r, y: Math.sin(a - Math.PI / 2) * r });
      }
      return [petals, arcPolyline(0, 0, 0.16, 0, TAU, 12)];
    },
  },
  star: { icon: '⭐', build: () => [starPolyline(5, 0.42)] },
  hi: {
    icon: '👋',
    build() {
      const p = (x, y) => ({ x: x + 0.05, y });
      return [
        [p(-0.85, -0.8), p(-0.85, 0.8)], [p(-0.25, -0.8), p(-0.25, 0.8)], [p(-0.85, 0), p(-0.25, 0)],
        [p(0.5, -0.8), p(0.5, 0.8)], [p(0.22, -0.8), p(0.78, -0.8)], [p(0.22, 0.8), p(0.78, 0.8)],
      ];
    },
  },

  // ---------- Ненависть / страх ----------
  skull: {
    icon: '💀',
    build() {
      // Череп: купол с челюстью одним контуром и две большие глазницы
      // (мелкие детали вроде зубов при 30–50 существах всё равно не читаются)
      const cranium = arcPolyline(0, -0.2, 0.85, Math.PI * 0.82, Math.PI * 2.18, 40);
      const l = cranium[0], r = cranium[cranium.length - 1];
      const jaw = [r, { x: 0.45, y: 0.5 }, { x: 0.45, y: 0.85 }, { x: -0.45, y: 0.85 }, { x: -0.45, y: 0.5 }, l];
      return [
        cranium.concat(jaw),
        arcPolyline(-0.33, -0.1, 0.24, 0, TAU, 16),
        arcPolyline(0.33, -0.1, 0.24, 0, TAU, 16),
      ];
    },
  },
  cross: {
    icon: '✖️',
    build: () => [
      [{ x: -0.85, y: -0.85 }, { x: 0.85, y: 0.85 }],
      [{ x: 0.85, y: -0.85 }, { x: -0.85, y: 0.85 }],
    ],
  },
  danger: {
    icon: '⚠️',
    build: () => [
      closedPoly([[0, -0.95], [0.95, 0.75], [-0.95, 0.75]]),
      [{ x: 0, y: -0.42 }, { x: 0, y: 0.22 }],
      arcPolyline(0, 0.45, 0.07, 0, TAU, 8),
    ],
  },
  frown: {
    icon: '☹️',
    build() {
      return [
        arcPolyline(0, 0, 1, 0, TAU, 64),
        arcPolyline(-0.36, -0.3, 0.13, 0, TAU, 14),
        arcPolyline(0.36, -0.3, 0.13, 0, TAU, 14),
        arcPolyline(0, 0.75, 0.5, Math.PI * 1.2, Math.PI * 1.8, 20), // дуга вверх — грусть
      ];
    },
  },
  lightning: {
    icon: '⚡',
    build: () => [closedPoly([[0.15, -1], [-0.45, 0.1], [-0.02, 0.1], [-0.2, 1], [0.45, -0.15], [0.02, -0.15]])],
  },

  // ---------- Нейтральная геометрия ----------
  circle: { icon: '⭕', build: () => [arcPolyline(0, 0, 1, 0, TAU, 64)] },
  triangle: { icon: '🔺', build: () => [closedPoly([[0, -1], [0.95, 0.7], [-0.95, 0.7]])] },
  square: { icon: '⬜', build: () => [closedPoly([[-0.85, -0.85], [0.85, -0.85], [0.85, 0.85], [-0.85, 0.85]])] },
  spiral: {
    icon: '🌀',
    build() {
      const pts = [];
      for (let i = 0; i <= 120; i++) {
        const t = (i / 120) * Math.PI * 6;
        const r = 0.08 + (0.92 * t) / (Math.PI * 6);
        pts.push({ x: Math.cos(t) * r, y: Math.sin(t) * r });
      }
      return [pts];
    },
  },
  infinity: {
    icon: '♾️',
    build() {
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * TAU;
        const d = 1 + Math.sin(t) * Math.sin(t);
        pts.push({ x: Math.cos(t) / d, y: (Math.sin(t) * Math.cos(t)) / d * 1.2 });
      }
      return [pts];
    },
  },
};

/** Фигуры-«слова» их собственного языка (см. language.js): та же форма, что в облачке речи. */
const WORD_SHAPES = {
  triangle: () => SHAPES.triangle.build(),
  square: () => SHAPES.square.build(),
  circle: () => SHAPES.circle.build(),
  wave: () => {
    const pts = [];
    for (let i = 0; i <= 80; i++) {
      const x = -1 + (2 * i) / 80;
      pts.push({ x, y: Math.sin(x * Math.PI * 1.5) * 0.45 });
    }
    return [pts];
  },
};

/**
 * «Перевод» под баннером «Они говорят: …» — по настроению (карме).
 * Первая фраза в каждом списке — основная, остальные — для разнообразия.
 * Меняйте и добавляйте свои!
 */
const MOOD_PHRASES = {
  love: [
    'Вы им нравитесь',
    'Они рады, что вы рядом',
    'Кажется, это благодарность',
    'Они доверяют вашим рукам',
    'Это похоже на «спасибо»',
    'Они помнят вашу заботу',
    'Вас считают своим',
    'Они мурлычут хором',
    'Им тепло, когда вы здесь',
    'Они хотят, чтобы вы остались',
  ],
  hate: [
    'Вы им не нравитесь',
    'Они вас боятся',
    'Это предупреждение',
    'Они помнят каждый яд',
    'Похоже на протест',
    'Они просят оставить их в покое',
    'Доверие придётся заслужить заново',
    'В их взглядах — обида',
    'Кажется, это проклятие на их языке',
    'Они больше не ждут от вас добра',
  ],
  neutral: [
    'Они что-то говорят, но что?',
    'Значение ещё не определено',
    'Похоже на вопрос',
    'Они присматриваются к вам',
    'Может, это приветствие?',
    'Слово из их языка — без перевода',
    'Они ещё не решили, кто вы',
    'Кажется, им просто любопытно',
    'Смысл ускользает…',
    'Они рассказывают что-то своё',
  ],
};

/** Перевод слов их языка, у которых словарь уже нашёл значение. */
const MEANING_PHRASES = {
  poison: 'Кажется, это их слово для «опасно»',
  food: 'Кажется, это их слово для «еда»',
  none: 'Кажется, это их слово для «пусто, ничего нет»',
};

/** Наборы фигур по настроению (карма Создателя). */
const MOOD_SHAPES = {
  love: ['heart', 'smile', 'flower', 'star', 'hi'],
  hate: ['skull', 'cross', 'danger', 'frown', 'lightning'],
  neutral: ['circle', 'triangle', 'square', 'spiral', 'infinity'],
};

/** Общая длина набора ломаных (в единицах фигуры). */
function polylineLength(polylines) {
  let total = 0;
  for (const poly of polylines) {
    for (let i = 1; i < poly.length; i++) total += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y);
  }
  return total || 1;
}

/** Равномерно расставляет n точек вдоль набора ломаных. */
function samplePolylines(polylines, n) {
  const segments = [];
  let total = 0;
  for (const poly of polylines) {
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1], b = poly[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      segments.push({ a, b, len, start: total });
      total += len;
    }
  }
  const points = [];
  const step = total / n;
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (k + 0.5) * step;
    while (j < segments.length - 1 && segments[j].start + segments[j].len < d) j++;
    const s = segments[j];
    const t = s.len > 0 ? clamp((d - s.start) / s.len, 0, 1) : 0;
    points.push({ x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t) });
  }
  return points;
}

class HiveMind {
  /**
   * @param {function} getMood — возвращает {karma, lexicon}: карму Создателя
   *                             и сводку словаря (чтобы выбрать фигуру).
   */
  constructor(getMood = () => ({ karma: 0, lexicon: null })) {
    this.getMood = getMood;
    this.mood = 'neutral';        // 'love' | 'hate' | 'neutral' — настроение текущего сеанса
    this.lastShapeKey = null;
    this.active = false;
    this.phase = null;            // 'gather' | 'hold'
    this.timer = 0;
    this.cooldown = HiveMind.nextWait(CONFIG.comm.firstDelay);
    this.shapeIndex = 0;
    this.participants = [];
    this.intensity = 0;           // 0..1 — для плавного затемнения экрана
    this.heartTimer = 0;
    this.shape = null;
  }

  /** Доля «осознанности» (0..1) — показывается полоской в интерфейсе. */
  awareness(world) {
    return clamp(world.averageGeneration() / CONFIG.comm.minAvgGeneration, 0, 1);
  }

  update(dt, world, particles, ui, time) {
    this.intensity = lerp(this.intensity, this.active ? 1 : 0, Math.min(1, dt * 2));

    if (!this.active) {
      // Ждём, пока популяция «поумнеет», затем отсчитываем таймер
      // Сами по себе они выходят на связь ОЧЕНЬ редко — это должно ощущаться как чудо.
      if (CONFIG.comm.enabled && world.averageGeneration() > CONFIG.comm.minAvgGeneration) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) {
          this.start(world, particles, ui, false);
          if (!this.active) this.cooldown = HiveMind.nextWait(CONFIG.comm.minCooldown); // никто не захотел
        }
      }
      return;
    }

    this.participants = this.participants.filter(c => !c.dead);
    this.computeSeparation(world);

    this.timer += dt;
    if (this.phase === 'gather' && this.timer >= CONFIG.comm.gatherTime) {
      this.phase = 'hold';
      this.timer = 0;
      ui.showBanner(`Они говорят: ${this.shape.icon}`, this.phrase());
    }

    if (this.phase === 'hold') {
      // Лёгкое «дыхание» фигуры и сердечки от случайных участников
      this.participants.forEach((c, i) => {
        const t = c.commTarget;
        t.x = t.baseX + Math.sin(time * 3 + i * 0.7) * 1.5;
        t.y = t.baseY + Math.cos(time * 2.5 + i * 0.5) * 1.5;
      });
      // Частицы по настроению: любовь — сердечки, ненависть — сажа и красные искры
      this.heartTimer -= dt;
      if (this.heartTimer <= 0 && this.participants.length > 0) {
        this.heartTimer = 0.08;
        const c = this.participants[Math.floor(Math.random() * this.participants.length)];
        if (this.mood === 'love') particles.emitHeart(c.x, c.y - c.radius);
        else if (this.mood === 'hate') {
          particles.emitSoot(c.x, c.y, c.radius * 0.6);
          particles.emitSparkles(c.x, c.y, '#ff4d6d', 3, 50);
        } else particles.emitSparkles(c.x, c.y, '#c9d6ff', 3, 40);
      }
      if (this.timer >= CONFIG.comm.holdTime) this.end(world, particles, ui);
    }
  }

  /**
   * Сколько ждать следующего «чуда»: минимальная пауза + случайная
   * (экспоненциальная) добавка в среднем comm.meanWait секунд.
   */
  static nextWait(minPause) {
    return minPause - Math.log(1 - Math.random()) * CONFIG.comm.meanWait;
  }

  /**
   * Запуск сеанса связи.
   * @param {boolean} called — true: Создатель позвал кнопкой; false: они сами захотели.
   * Участие ДОБРОВОЛЬНОЕ: каждое существо решает само (см. Creature.wantsToTalk).
   * Возвращает false, если желающих слишком мало.
   */
  start(world, particles, ui, called = true) {
    this.shape = this.chooseShape();
    const all = world.creatures.filter(c => !c.dead);
    const creatures = all.filter(c => c.wantsToTalk(this.mood, called));
    if (creatures.length < CONFIG.comm.minParticipants) {
      if (called) ui.flashBanner('🤫 Никто не захотел выходить на связь', `Желающих: ${creatures.length} из ${all.length}`);
      return false;
    }
    this.joined = creatures.length;
    this.total = all.length;

    // Размер фигуры подстраивается под число существ: точки должны идти
    // примерно через comm.spacing px — тогда контур читается, а существа не слипаются.
    const polylines = this.shape.build();
    const minSide = Math.min(world.width, world.height);
    // Шаг — не меньше comm.spacing и не меньше «размера» среднего существа (с шерстью)
    const avgVisual = creatures.reduce((a, c) => a + c.visualRadius, 0) / creatures.length;
    const spacing = Math.max(CONFIG.comm.spacing, avgVisual * 1.25);
    const size = clamp((creatures.length * spacing) / polylineLength(polylines),
      minSide * CONFIG.comm.minShapeScale, minSide * CONFIG.comm.maxShapeScale);
    const cx = world.width / 2, cy = world.height / 2;
    const targets = samplePolylines(polylines, creatures.length).map(p => {
      const x = cx + p.x * size, y = cy + p.y * size;
      return { x, y, baseX: x, baseY: y };
    });

    // Жадное распределение: каждой точке — ближайшее свободное существо
    const free = creatures.slice();
    for (const t of targets) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < free.length; i++) {
        const d = world.delta(free[i].x, free[i].y, t.x, t.y);
        const d2 = d.x * d.x + d.y * d.y;
        if (d2 < bestD) { bestD = d2; bestI = i; }
      }
      free[bestI].commTarget = t;
      world.removeAt(free, bestI);
    }

    this.participants = creatures;
    this.active = true;
    this.phase = 'gather';
    this.timer = 0;
    ui.showBanner(called ? '💬 Вы позвали — они собираются' : '✨ Они сами вышли на связь',
      `Откликнулись: ${this.joined} из ${this.total}`);
    return true;
  }

  /** Конец сеанса: разлетаемся! */
  end(world, particles, ui) {
    // Расходятся спокойно и не вслепую: если рядом яд — уходят ОТ него
    for (const c of this.participants) {
      c.commTarget = null;
      c.sepX = c.sepY = 0;
      c.carefulTimer = CONFIG.comm.carefulAfter;
      const danger = world.findNearest(world.poison, c.x, c.y, c.radius + 140);
      c.angle = danger ? Math.atan2(-danger.dy, -danger.dx) : randRange(0, TAU);
      const s = c.maxSpeed * 0.35;
      c.vx = Math.cos(c.angle) * s;
      c.vy = Math.sin(c.angle) * s;
    }
    const burst = { love: '#ffd6f0', hate: '#ff4d6d', neutral: '#c9d6ff' }[this.mood];
    particles.emitSparkles(world.width / 2, world.height / 2, burst, 40, 260);
    this.participants = [];
    this.active = false;
    this.phase = null;
    this.cooldown = HiveMind.nextWait(CONFIG.comm.minCooldown);
    ui.hideBanner();
  }

  /**
   * Выбор фигуры по карме Создателя:
   *   карма > 0.4  — любовь: сердце, смайлик, цветок, звезда, «HI»;
   *   карма < −0.4 — ненависть/страх: череп, крест, знак опасности, грустный смайлик,
   *                  молния, а если в их языке есть слово «опасность» — это слово;
   *   иначе        — нейтрально: случайная геометрия ИЛИ случайное слово
   *                  их собственного языка (чем чаще слово звучит, тем вероятнее).
   * Одна и та же фигура два раза подряд не повторяется.
   */
  chooseShape() {
    const { karma, lexicon } = this.getMood();
    const t = CONFIG.karma.moodThreshold;
    this.mood = karma > t ? 'love' : karma < -t ? 'hate' : 'neutral';

    // Кандидаты: [ключ, {icon, build}]
    let pool = MOOD_SHAPES[this.mood].map(k => [k, SHAPES[k]]);
    const words = lexicon ? lexicon.words.filter(w => w.share > 0.03) : [];
    const asWord = (w) => [`word:${w.word.id}`, {
      icon: w.word.glyph,
      build: WORD_SHAPES[w.word.id],
      meaning: w.meaning ? w.meaning.context : null, // значение слова, если словарь его уже вывел
    }];

    if (this.mood === 'hate') {
      // Их собственное слово «опасность» (если эволюция его придумала) — самый сильный протест
      const dangerWord = words.find(w => w.meaning && w.meaning.context === 'poison');
      if (dangerWord) pool.push(asWord(dangerWord), asWord(dangerWord)); // вдвое вероятнее
    } else if (this.mood === 'neutral' && words.length > 0 && Math.random() < 0.5) {
      // Слово их языка, вероятность — по частоте употребления
      let r = Math.random() * words.reduce((a, w) => a + w.share, 0);
      for (const w of words) { r -= w.share; if (r <= 0) { pool = [asWord(w)]; break; } }
    }

    const fresh = pool.filter(([k]) => k !== this.lastShapeKey);
    const [key, shape] = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    this.lastShapeKey = key;
    return shape;
  }

  /**
   * Вторая строчка баннера: «перевод» по настроению.
   * Если они «сказали» слово своего языка, у которого уже есть значение, —
   * переводим его («Кажется, это их слово для «опасно»»).
   */
  phrase() {
    if (this.shape.meaning) return MEANING_PHRASES[this.shape.meaning];
    const list = MOOD_PHRASES[this.mood];
    return list[Math.floor(Math.random() * list.length)];
  }

  /** Separation: существа отталкиваются от слишком близких соседей. */
  computeSeparation(world) {
    const list = this.participants;
    const range = CONFIG.comm.separation;
    for (const c of list) { c.sepX = 0; c.sepY = 0; }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const d = world.delta(a.x, a.y, b.x, b.y);
        const dist = Math.hypot(d.x, d.y);
        if (dist > 0 && dist < range) {
          const push = ((range - dist) / range) * 250;
          const nx = d.x / dist, ny = d.y / dist;
          a.sepX -= nx * push; a.sepY -= ny * push;
          b.sepX += nx * push; b.sepY += ny * push;
        }
      }
    }
  }

  /** Затемнение краёв экрана во время сеанса — как «прожектор» на фигуру. */
  drawOverlay(ctx, w, h) {
    if (this.intensity < 0.01) return;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(255, 200, 230, 0)');
    g.addColorStop(1, `rgba(5, 5, 20, ${0.45 * this.intensity})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
