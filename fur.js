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
  /**
   * @param {SootFur|null} template — если передан, «причёска» копируется
   *                                  (потомок похож на родителя).
   */
  constructor(template = null) {
    const cfg = CONFIG.soot;
    this.hairs = [];
    this.initialized = false;

    for (let i = 0; i < cfg.hairs; i++) {
      const src = template ? template.hairs[i] : null;
      const angle = src ? src.angle : (i / cfg.hairs) * TAU + randRange(-0.1, 0.1);
      const nodes = [];
      for (let k = 0; k < cfg.hairSegments; k++) nodes.push({ x: 0, y: 0, ox: 0, oy: 0 });
      this.hairs.push({
        angle,
        dirX: Math.cos(angle),                // направление «наружу» из центра
        dirY: Math.sin(angle),
        length: src ? src.length : randRange(cfg.hairLength[0], cfg.hairLength[1]),
        curl: src ? src.curl : randRange(-0.6, 0.6),        // лёгкий природный изгиб
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
      const seg = (body.r * h.length) / h.nodes.length;
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
    const windAmp = body.r * cfg.windAmplitude;
    const segCount = this.hairs[0].nodes.length;

    for (const h of this.hairs) {
      this.computeRoot(h, body);
      const seg = (body.r * h.length * fluff) / segCount;
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
   * Рисуем все волоски ОДНИМ путём (один stroke на существо — это быстро).
   * Кривая проходит через точки волоска по «средним точкам» — получается гладко.
   */
  draw(ctx, body, now) {
    const cfg = CONFIG.soot;
    const r = body.r;
    const vibAmp = body.purring ? r * cfg.purrAmplitude : 0;

    ctx.beginPath();
    for (const h of this.hairs) {
      const nodes = h.nodes;
      // Мурчание: мелкая частая дрожь, сильнее к кончику (только визуально, не в физике)
      const vib = vibAmp ? Math.sin(now * 0.21 + h.phase * 13) * vibAmp : 0;
      const px = -h.dirY * vib, py = h.dirX * vib;
      const last = nodes.length - 1;

      ctx.moveTo(h.rootX, h.rootY);
      for (let k = 0; k < last; k++) {
        const t = (k + 1) / nodes.length, t2 = (k + 2) / nodes.length;
        const ax = nodes[k].x + px * t, ay = nodes[k].y + py * t;
        const bx = nodes[k + 1].x + px * t2, by = nodes[k + 1].y + py * t2;
        ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
      }
      ctx.lineTo(nodes[last].x + px, nodes[last].y + py);
    }
    ctx.strokeStyle = '#060609';
    ctx.lineWidth = Math.max(1.2, r * cfg.hairWidth);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Тонкий «блеск» на кончиках каждого второго волоска — шерсть выглядит объёмнее
    ctx.beginPath();
    for (let i = 0; i < this.hairs.length; i += 2) {
      const nodes = this.hairs[i].nodes;
      const a = nodes[nodes.length - 2], b = nodes[nodes.length - 1];
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.strokeStyle = 'rgba(130, 135, 170, 0.3)';
    ctx.lineWidth = Math.max(0.6, r * 0.05);
    ctx.stroke();
  }
}
