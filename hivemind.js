/**
 * hivemind.js — «Общение с Создателем» (Hive Mind Communication).
 *
 * Когда среднее поколение популяции превышает CONFIG.comm.minAvgGeneration,
 * у существ появляется «осознанность». Примерно раз в минуту запускается
 * Communication Event:
 *   1) gather — все существа бросают еду и летят к своей точке фигуры
 *               (сердце / смайлик / «HI»);
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

const HIVE_SHAPES = [
  {
    title: '❤ Сердце',
    build() {
      // Классическая параметрическая кривая сердца
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
  {
    title: '☺ Смайлик',
    build() {
      return [
        arcPolyline(0, 0, 1, 0, TAU, 64),                          // лицо
        arcPolyline(-0.36, -0.3, 0.13, 0, TAU, 14),                 // левый глаз
        arcPolyline(0.36, -0.3, 0.13, 0, TAU, 14),                  // правый глаз
        arcPolyline(0, 0.02, 0.58, Math.PI * 0.15, Math.PI * 0.85, 24), // улыбка
      ];
    },
  },
  {
    title: '👋 «HI»',
    build() {
      const p = (x, y) => ({ x: x + 0.05, y });
      return [
        [p(-0.85, -0.8), p(-0.85, 0.8)],   // H: левая палочка
        [p(-0.25, -0.8), p(-0.25, 0.8)],   // H: правая палочка
        [p(-0.85, 0), p(-0.25, 0)],        // H: перекладина
        [p(0.5, -0.8), p(0.5, 0.8)],       // I: палочка
        [p(0.22, -0.8), p(0.78, -0.8)],    // I: верхняя засечка
        [p(0.22, 0.8), p(0.78, 0.8)],      // I: нижняя засечка
      ];
    },
  },
];

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
  constructor() {
    this.active = false;
    this.phase = null;            // 'gather' | 'hold'
    this.timer = 0;
    this.cooldown = CONFIG.comm.firstDelay;
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
      if (world.averageGeneration() > CONFIG.comm.minAvgGeneration) {
        this.cooldown -= dt;
        if (this.cooldown <= 0) this.start(world, particles, ui);
      }
      return;
    }

    this.participants = this.participants.filter(c => !c.dead);
    this.computeSeparation(world);

    this.timer += dt;
    if (this.phase === 'gather' && this.timer >= CONFIG.comm.gatherTime) {
      this.phase = 'hold';
      this.timer = 0;
      ui.showBanner(`✨ Они говорят: ${this.shape.title}`);
    }

    if (this.phase === 'hold') {
      // Лёгкое «дыхание» фигуры и сердечки от случайных участников
      this.participants.forEach((c, i) => {
        const t = c.commTarget;
        t.x = t.baseX + Math.sin(time * 3 + i * 0.7) * 1.5;
        t.y = t.baseY + Math.cos(time * 2.5 + i * 0.5) * 1.5;
      });
      this.heartTimer -= dt;
      if (this.heartTimer <= 0 && this.participants.length > 0) {
        this.heartTimer = 0.08;
        const c = this.participants[Math.floor(Math.random() * this.participants.length)];
        particles.emitHeart(c.x, c.y - c.radius);
      }
      if (this.timer >= CONFIG.comm.holdTime) this.end(world, particles, ui);
    }
  }

  /** Запуск сеанса связи. Возвращает false, если существ слишком мало. */
  start(world, particles, ui) {
    const creatures = world.creatures.filter(c => !c.dead);
    if (creatures.length < 5) return false;

    this.shape = HIVE_SHAPES[this.shapeIndex % HIVE_SHAPES.length];
    this.shapeIndex++;

    const size = Math.min(world.width, world.height) * CONFIG.comm.shapeScale;
    const cx = world.width / 2, cy = world.height / 2;
    const targets = samplePolylines(this.shape.build(), creatures.length).map(p => {
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
    ui.showBanner('💬 Сеанс связи с Создателем… они собираются вместе');
    return true;
  }

  /** Конец сеанса: разлетаемся! */
  end(world, particles, ui) {
    for (const c of this.participants) {
      c.commTarget = null;
      c.sepX = c.sepY = 0;
      c.angle = randRange(0, TAU);
      const s = CONFIG.creature.maxSpeed * 0.7;
      c.vx = Math.cos(c.angle) * s;
      c.vy = Math.sin(c.angle) * s;
    }
    particles.emitSparkles(world.width / 2, world.height / 2, '#ffd6f0', 40, 260);
    this.participants = [];
    this.active = false;
    this.phase = null;
    this.cooldown = CONFIG.comm.interval;
    ui.hideBanner();
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
