/**
 * fur.js — физика шерсти чернушки (Verlet integration + пружины).
 *
 * Каждый волосок — маленькая цепочка точек:
 *
 *     корень ●───○───○───○ кончик
 *            (на ядре)  (свободные точки)
 *
 * • Корень приклеен к краю ядра и двигается вместе с ним
 *   (раздвигается на вдохе, сплющивается при ходьбе и делении).
 * • Свободные точки живут по закону инерции (Verlet): каждая точка помнит
 *   своё прошлое положение, а скорость = (сейчас − раньше). Поэтому когда
 *   ядро резко сдвигается, кончики «не успевают» и тянутся следом (drag).
 * • Пружина «памяти формы» тянет каждую точку к позе покоя
 *   (волосок торчит наружу). Ближе к корню пружина жёстче, к кончику — мягче.
 * • Ограничение длины (constraint) не даёт волоску растянуться.
 *
 * Поверх физики:
 *   — «ветерок» (idle): медленные несимметричные колебания кончиков;
 *   — «мурчание» (petting): высокочастотная мелкая вибрация.
 *
 * Все точки хранятся в МИРОВЫХ координатах (а не относительно существа) —
 * именно поэтому возникает инерция.
 */
class SootFur {
  /** Цвет блеска на кончиках шерсти (один на всех, меняется с сезоном — см. Climate.furSheen). */
  static sheen = 'rgba(130, 135, 170, 0.3)';

  /**
   * @param {DNA} dna — количество (hairCount) и длина (hairLength, px) волосков берутся из генов.
   */
  constructor(dna) {
    const cfg = CONFIG.soot;
    const count = dna.hairCount;
    this.hairs = [];
    this.initialized = false;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + randRange(-0.1, 0.1);
      const nodes = [];
      for (let k = 0; k < cfg.hairSegments; k++) nodes.push({ x: 0, y: 0, ox: 0, oy: 0 });
      this.hairs.push({
        angle,
        dirX: Math.cos(angle),                // направление «наружу» из центра
        dirY: Math.sin(angle),
        length: dna.hairLength * randRange(0.8, 1.15),       // px, ±15 % — шерсть не «под линейку»
        curl: randRange(-0.6, 0.6),        // лёгкий природный изгиб
        phase: randRange(0, TAU),                            // у каждого волоска свой «ветерок»
        windPeriod: randRange(700, 1300),                    // мс — скорость колыхания
        rootX: 0, rootY: 0,
        nodes,
      });
    }
  }

  /** Мгновенно поставить все волоски в позу покоя (при рождении). */
  reset(body) {
    for (const h of this.hairs) {
      this.computeRoot(h, body);
      const seg = h.length / h.nodes.length;
      h.nodes.forEach((n, k) => {
        n.x = n.ox = h.rootX + h.dirX * seg * (k + 1);
        n.y = n.oy = h.rootY + h.dirY * seg * (k + 1);
      });
    }
    this.initialized = true;
  }

  /** Существо перескочило через край мира — переносим шерсть вместе с ним. */
  shift(dx, dy) {
    for (const h of this.hairs) {
      for (const n of h.nodes) {
        n.x += dx; n.ox += dx;
        n.y += dy; n.oy += dy;
      }
    }
  }

  /**
   * Корень волоска = центр ядра + (матрица деформации ядра) × направление.
   * Матрица (m00..m11) уже содержит дыхание, сплющивание, вытягивание.
   */
  computeRoot(h, body) {
    const rr = body.coreR * CONFIG.soot.rootDepth;
    const lx = h.dirX * rr, ly = h.dirY * rr;
    h.rootX = body.cx + body.m00 * lx + body.m01 * ly;
    h.rootY = body.cy + body.m10 * lx + body.m11 * ly;
  }

  /**
   * Шаг физики. Вызывается каждый кадр отрисовки.
   * @param {object} body  — описание ядра (см. Creature.computeBody)
   * @param {number} dt    — секунды с прошлого кадра
   * @param {number} now   — Date.now()
   */
  update(body, dt, now) {
    if (!this.initialized) this.reset(body);

    const cfg = CONFIG.soot;
    // Приводим коэффициенты к «60 кадрам в секунду», чтобы на мониторах 60/120/144 Гц
    // шерсть вела себя одинаково.
    const frames = clamp(dt * 60, 0.25, 3);
    const damping = Math.pow(cfg.damping, frames);
    // На вдохе шерсть чуть распушается, при поглаживании — заметно (от удовольствия)
    const fluff = 1 + CONFIG.breathing.fluff * body.breath + (body.purring ? cfg.purrFluff : 0);
    const windAmp = body.hairLength * cfg.windAmplitude;
    const segCount = this.hairs[0].nodes.length;

    for (const h of this.hairs) {
      this.computeRoot(h, body);
      const seg = (h.length * fluff) / segCount;
      const perpX = -h.dirY, perpY = h.dirX;

      // Idle-«ветерок»: две несоразмерные синусоиды → движение не выглядит механическим
      const wind = (Math.sin(now / h.windPeriod + h.phase)
        + 0.5 * Math.sin(now / (h.windPeriod * 0.53) + h.phase * 1.7)) * windAmp;

      let prevX = h.rootX, prevY = h.rootY;
      for (let k = 0; k < segCount; k++) {
        const n = h.nodes[k];
        const t = (k + 1) / segCount;  // 0 у корня → 1 у кончика

        // 1) Verlet: продолжаем двигаться по инерции (с затуханием)
        const vx = (n.x - n.ox) * damping;
        const vy = (n.y - n.oy) * damping;
        n.ox = n.x; n.oy = n.y;
        n.x += vx; n.y += vy;

        // 2) Пружина к позе покоя (волосок торчит наружу + изгиб + ветерок)
        const bend = h.curl * t * t * seg + wind * t;
        const restX = h.rootX + h.dirX * seg * (k + 1) + perpX * bend;
        const restY = h.rootY + h.dirY * seg * (k + 1) + perpY * bend;
        const stiff = 1 - Math.pow(1 - cfg.stiffness[k], frames);
        n.x += (restX - n.x) * stiff;
        n.y += (restY - n.y) * stiff;

        // 3) Ограничение длины: точка всегда на расстоянии seg от предыдущей
        const dx = n.x - prevX, dy = n.y - prevY;
        const d = Math.hypot(dx, dy) || 0.0001;
        n.x = prevX + (dx / d) * seg;
        n.y = prevY + (dy / d) * seg;

        prevX = n.x; prevY = n.y;
      }
    }
  }

  /**
   * Рисуем шерсть: каждый волосок — гладкая кривая, которая СУЖАЕТСЯ к кончику
   * (как настоящая шерстинка): у корня ~2–3 px, на кончике ~0.4 px.
   *
   * Как это сделано быстро: кривую волоска делим на несколько кусочков
   * (по 2 на каждый изгиб). Толщина у кусочков разная, поэтому кусочки
   * ОДНОГО уровня у всех волосков рисуем одним stroke():
   * всего ~5 вызовов stroke на существо, а не по вызову на каждый волосок.
   */
  draw(ctx, body, now) {
    const cfg = CONFIG.soot;
    const r = body.r;
    const vibAmp = body.purring ? body.hairLength * cfg.purrAmplitude : 0;
    const hairs = this.hairs;
    const n = hairs[0].nodes.length;
    const segs = 2 * (n - 1) + 1;           // кусочков в одном волоске
    const stride = (segs + 1) * 2;          // точек (x, y) на волосок
    if (!this.pts || this.pts.length !== hairs.length * stride) {
      this.pts = new Float32Array(hairs.length * stride);
    }
    const P = this.pts;

    // 1) Точки гладкой кривой каждого волоска (те же квадратичные изгибы, что и раньше)
    hairs.forEach((h, hi) => {
      const nodes = h.nodes;
      // Мурчание: мелкая частая дрожь, сильнее к кончику (только визуально, не в физике)
      const vib = vibAmp ? Math.sin(now * 0.21 + h.phase * 13) * vibAmp : 0;
      const px = -h.dirY * vib, py = h.dirX * vib;
      let o = hi * stride;
      let sx = h.rootX, sy = h.rootY;
      P[o++] = sx; P[o++] = sy;
      for (let k = 0; k < n - 1; k++) {
        const t = (k + 1) / n, t2 = (k + 2) / n;
        const cx = nodes[k].x + px * t, cy = nodes[k].y + py * t;
        const ex = (cx + nodes[k + 1].x + px * t2) / 2, ey = (cy + nodes[k + 1].y + py * t2) / 2;
        // середина квадратичной кривой (t = 0.5) и её конец
        P[o++] = 0.25 * sx + 0.5 * cx + 0.25 * ex; P[o++] = 0.25 * sy + 0.5 * cy + 0.25 * ey;
        P[o++] = ex; P[o++] = ey;
        sx = ex; sy = ey;
      }
      P[o++] = nodes[n - 1].x + px; P[o++] = nodes[n - 1].y + py;
    });

    // 2) Рисуем уровнями: от толстых кусочков у корня к тонким у кончика
    const rootW = clamp(r * cfg.hairWidth, 1.4, 3.2);
    const tipW = cfg.hairTipWidth;
    ctx.strokeStyle = '#060609';
    ctx.lineCap = 'round';
    for (let s = 0; s < segs; s++) {
      ctx.beginPath();
      for (let hi = 0; hi < hairs.length; hi++) {
        const o = hi * stride + s * 2;
        ctx.moveTo(P[o], P[o + 1]);
        ctx.lineTo(P[o + 2], P[o + 3]);
      }
      ctx.lineWidth = lerp(rootW, tipW, (s + 0.5) / segs);
      ctx.stroke();
    }

    // 3) Тонкий «блеск» на самых кончиках каждого второго волоска — шерсть объёмнее
    ctx.beginPath();
    for (let hi = 0; hi < hairs.length; hi += 2) {
      const o = hi * stride + (segs - 1) * 2;
      ctx.moveTo(P[o], P[o + 1]);
      ctx.lineTo(P[o + 2], P[o + 3]);
    }
    ctx.strokeStyle = SootFur.sheen; // цвет задаёт климат (иней зимой, тёплый блик летом)
    ctx.lineWidth = Math.max(0.4, tipW);
    ctx.stroke();
  }
}
