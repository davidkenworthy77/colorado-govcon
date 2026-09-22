/* ============================================================
   DECK CHARTS
   Hand-built SVG charts in the Colorado palette. No dependencies.

   Declare a chart with a type and a JSON config child:

     <figure class="chart" data-chart="column">
       <script type="application/json">
         {"categories":["Q1","Q2","Q3","Q4"],
          "series":[{"name":"Visitation","data":[42,55,61,78]}],
          "suffix":"%"}
       </script>
     </figure>

   Types
     column · bar · stacked · line · area · slope · scatter
     donut · gauge · progress · funnel · waffle · pictogram
     gantt · dumbbell · heatmap · sparkline · race · treemap

   SIZING — why there is no width/height in the config
   ---------------------------------------------------
   The stage scales with the viewport, so a chart cannot be drawn at
   fixed pixel sizes the way a 1920-canvas deck does. Instead every
   chart renders into a viewBox 1000 units wide and (1000 / aspect)
   tall, measured from the figure's own box. Everything inside is in
   those virtual units, so the SVG scales exactly as the rest of the
   slide does — at any window size, and identically in PDF. Give the
   figure a size in CSS (cqw/cqh) and the chart follows.

   COLOUR — the rule that keeps data on-brand
   ------------------------------------------
   Four brand colours cannot carry five data series, so series
   colours are TINTS of the brand, never new hues:

     1  gold        --ch-1    the hero: the number the room remembers
     2  mountain    --ch-2
     3  red         --ch-3
     4  currentColor--ch-4
     5  currentColor 38%  --ch-5

   currentColor in slots 4–5 is what lets one chart sit on paper,
   sand, navy or gold with no per-slide override. If you need a
   sixth series the slide is doing too much: split it.
   ============================================================ */

window.DeckCharts = (() => {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const SERIES = ["var(--ch-1)", "var(--ch-2)", "var(--ch-3)", "var(--ch-4)", "var(--ch-5)"];
  const SEQ = ["var(--seq-1)","var(--seq-2)","var(--seq-3)","var(--seq-4)","var(--seq-5)","var(--seq-6)"];
  const color = i => SERIES[i % SERIES.length];

  const el = (name, attrs = {}, text) => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  };

  /* A bad config should print a dash, not throw or render "NaN" to a room. */
  const fmt = (v, cfg) => {
    if (typeof v !== "number" || !isFinite(v)) return "—";
    const d = cfg.decimals ?? (Math.abs(v) < 10 && v % 1 !== 0 ? 1 : 0);
    let s = Math.abs(v).toFixed(d);
    if (cfg.comma !== false && Math.abs(v) >= 1000) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (v < 0 ? "−" : "") + (cfg.prefix || "") + s + (cfg.suffix || "");
  };

  const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
                   || window.matchMedia("print").matches;

  /* Every chart normalises its series through this, so one malformed
     entry cannot take the whole slide down mid-presentation. */
  const series = cfg =>
    (cfg.series || []).map(s => ({ ...s, data: Array.isArray(s.data) ? s.data.map(Number) : [] }));
  const allValues = list => list.flatMap(s => s.data).filter(n => isFinite(n));

  /* Nice round axis maximum so gridlines land on readable numbers. */
  function niceMax(v) {
    if (!isFinite(v) || v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  /* ---------- shared furniture ---------- */

  /* Colour goes on the STYLE attribute, not the fill attribute. Every text
     node here carries .ch-label, and that class sets `fill` in the
     stylesheet — a CSS declaration always beats a presentation attribute,
     so `fill="..."` on the element is silently ignored. Which means a label
     asked to be white on a dark bar would quietly render mid-grey. */
  const txt = (x, y, str, o = {}) => el("text", {
    x, y,
    "text-anchor": o.anchor || "middle",
    class: "ch-label" + (o.class ? " " + o.class : ""),
    "font-size": o.size || null,
    style: o.fill ? "fill:" + o.fill : null,
    opacity: o.opacity ?? null
  }, str);

  /* Legend, laid out by measured-ish width. SVG has no text metrics before
     paint, so names are costed at 0.52em per character — generous enough
     that entries never collide, tight enough that four fit on one row. */
  function legend(svg, cfg, W, y, tones) {
    const list = cfg.series || [];
    if (cfg.legend === false || list.length < 2) return y;
    const g = el("g", { class: "ch-legend" });
    const S = 20;
    const widths = list.map(s => S + 10 + (s.name || "").length * 10.4 + 34);
    const totalW = widths.reduce((a, b) => a + b, 0) - 34;
    let x = Math.max(0, (W - totalW) / 2);
    list.forEach((s, i) => {
      g.appendChild(el("rect", { x, y: y - S + 4, width: S, height: S, fill: (tones || color)(s.tone ?? i) }));
      g.appendChild(txt(x + S + 10, y, s.name || `Series ${i + 1}`, { anchor: "start", size: 21 }));
      x += widths[i];
    });
    svg.appendChild(g);
    return y + 42;
  }

  /* Readable text ON a filled shape. Which ramp slots are light is known
     exactly, so pick by slot rather than guessing at brightness: gold and
     the 38% tint are light grounds, the rest are dark. */
  const onFill = i => {
    const slot = i % SERIES.length;
    if (slot === 0) return "var(--navy-ink)";   /* gold */
    if (slot === 4) return "var(--ink)";        /* currentColor at 38% */
    return "#fff";
  };
  /* Same question for the sequential ramp, by index into SEQ. */
  const onSeq = i => (i >= 3 ? "#fff" : "var(--ink)");

  const anim = (node, name, delay, dur) => {
    node.classList.add(name);
    node.style.animationDelay = delay + "s";
    if (dur) node.style.animationDuration = dur + "s";
    return node;
  };

  /* ============================================================
     CHART TYPES
     Each receives (svg, cfg, W, H, go) where W/H are virtual units
     and `go` is false when motion is off.
     ============================================================ */
  const TYPES = {};

  /* ---- COLUMN — the workhorse for period-over-period ---- */
  TYPES.column = (svg, cfg, W, H, go) => {
    const cats = cfg.categories || [];
    const list = series(cfg);
    if (!cats.length || !list.length) return;
    const padB = 62, padL = cfg.axis === false ? 8 : 92;
    let top = legend(svg, cfg, W, 26);
    const y0 = H - padB, plotH = y0 - top;
    const max = cfg.max ?? niceMax(Math.max(...allValues(list), 0));

    if (cfg.axis !== false) {
      for (let k = 0; k <= 4; k++) {
        const v = (max / 4) * k, y = y0 - (v / max) * plotH;
        svg.appendChild(el("line", { x1: padL, x2: W, y1: y, y2: y, class: "ch-grid" }));
        svg.appendChild(txt(padL - 18, y + 7, fmt(v, cfg), { anchor: "end", size: 20 }));
      }
    }
    svg.appendChild(el("line", { x1: padL, x2: W, y1: y0, y2: y0, class: "ch-axis" }));

    const slot = (W - padL) / cats.length;
    const bw = (slot * 0.64) / list.length;
    cats.forEach((cat, c) => {
      const cx = padL + slot * c + slot / 2;
      list.forEach((s, si) => {
        const v = s.data[c] ?? 0;
        const h = Math.max(0, (v / max) * plotH);
        const x = cx - (bw * list.length) / 2 + bw * si;
        const r = el("rect", {
          x: x + 2, y: y0 - h, width: Math.max(1, bw - 4), height: h,
          /* `tone` lets a series claim a ramp slot out of order — so a
             GOOD/BETTER/BEST chart can escalate to gold on the last
             series instead of shouting on the first. */
          fill: color(s.tone ?? si)
        });
        if (go) { r.style.transformOrigin = `${x}px ${y0}px`; anim(r, "ch-rise", 0.07 * c + 0.05 * si); }
        svg.appendChild(r);
        if (cfg.values !== false && list.length === 1) {
          const t = txt(cx, y0 - h - 14, fmt(v, cfg), { class: "ch-value", size: 24 });
          if (go) anim(t, "ch-fade", 0.4 + 0.07 * c);
          svg.appendChild(t);
        }
      });
      svg.appendChild(txt(cx, H - 22, cat, { class: "ch-cat", size: 21 }));
    });
  };

  /* ---- BAR — best when the category names are long ----
     Single series by default. Pass more than one and the bars group
     per category, which is how a best-versus-worst comparison reads:
     the pair sits together under one label instead of as eight
     unrelated rows the audience has to mentally re-pair.

     Options beyond the shared ones:
       tones      ramp slot per category (single series)
       icons      image href per category, drawn left of the label
       barLabels  text printed on the bar. 1D for a single series,
                  [series][category] when grouped. Falls outside the
                  bar automatically when the bar is too short. */
  TYPES.bar = (svg, cfg, W, H, go) => {
    const cats = cfg.categories || [];
    const list = series(cfg);
    if (!cats.length || !list.length) return;

    const grouped = list.length > 1;
    const padL = cfg.labelWidth ?? 300;
    const padR = cfg.padR ?? 110;
    const catSize = cfg.labelSize ?? 22;
    const max = cfg.max ?? niceMax(Math.max(...allValues(list), 0));
    const track = W - padL - padR;

    let top = 0;
    if (grouped) top = legend(svg, cfg, W, 26);
    const slot = (H - top) / cats.length;

    /* `tones` assigns a ramp slot per category — a swim-lane chart pairs a
       destination's best and worst lane and needs them coloured differently
       within one series. */
    const tint = i => Array.isArray(cfg.tones) && cfg.tones[i] != null ? cfg.tones[i]
                    : cfg.highlight != null ? (cfg.highlight === i ? 0 : 4)
                    : cfg.flat ? 0 : Math.min(i, 4);

    const barLabel = (si, c) => {
      const bl = cfg.barLabels;
      if (!bl) return null;
      return grouped ? (bl[si] || [])[c] : bl[c];
    };

    cats.forEach((cat, c) => {
      const mid = top + slot * c + slot / 2;

      /* With icons the label column reads left to right, mark then name, so
         the two stay together. Right-aligned labels would leave each icon
         stranded at the far edge, a whole column away from its own row. */
      if (cfg.icons && cfg.icons[c]) {
        const size = catSize * 1.6;
        svg.appendChild(el("image", {
          href: cfg.icons[c], x: 0, y: mid - size / 2, width: size, height: size,
          preserveAspectRatio: "xMidYMid meet"
        }));
        svg.appendChild(txt(size + 16, mid + catSize * 0.36, cat,
          { anchor: "start", class: "ch-cat", size: catSize }));
      } else {
        svg.appendChild(txt(padL - 20, mid + catSize * 0.36, cat,
          { anchor: "end", class: "ch-cat", size: catSize }));
      }

      const bh = grouped ? Math.min(slot * 0.33, 44) : Math.min(slot * 0.58, 64);
      list.forEach((s, si) => {
        const v = s.data[c] ?? 0;
        /* A real value must leave a visible mark. On the adoption chart two
           months against nine hundred is a 0.2% bar, and rounding it away
           would delete the very row the slide is about. */
        const w = v > 0 ? Math.max(4, (v / max) * track) : Math.max(0, (v / max) * track);
        const y = grouped
          ? mid - (bh * list.length) / 2 + bh * si + 2
          : mid - bh / 2;
        const hh = grouped ? bh - 4 : bh;
        const slotIdx = grouped ? (s.tone ?? si) : tint(c);

        const r = el("rect", { x: padL, y, width: w, height: hh, fill: color(slotIdx) });
        if (go) { r.style.transformOrigin = `${padL}px 0`; anim(r, "ch-grow", 0.08 * c + 0.05 * si); }
        svg.appendChild(r);

        const vSize = grouped ? 21 : 24;
        const vStr = fmt(v, cfg);
        const t = txt(padL + w + 16, y + hh / 2 + vSize * 0.35, vStr,
          { anchor: "start", class: "ch-value", size: vSize });
        if (go) anim(t, "ch-fade", 0.3 + 0.08 * c);
        svg.appendChild(t);

        /* A label belongs on the bar when the bar can hold it, and after the
           value when it cannot. Costed at 0.54em a character; the weakest
           lane in a swim-lane pair is often a 1% bar with a long name. */
        const lab = barLabel(si, c);
        if (lab) {
          const lSize = grouped ? 19 : 20;
          const need = String(lab).length * lSize * 0.54 + 26;
          const inside = need <= w;
          const lx = inside ? padL + 13 : padL + w + 16 + vStr.length * vSize * 0.56 + 14;
          const lt = txt(lx, y + hh / 2 + lSize * 0.35, lab, {
            anchor: "start", size: lSize,
            fill: inside ? onFill(slotIdx) : "var(--ink-mute)"
          });
          if (go) anim(lt, "ch-fade", 0.45 + 0.08 * c);
          svg.appendChild(lt);
        }
      });
    });
  };

  /* ---- STACKED — composition over time. 100% mode with stack:"pct" ---- */
  TYPES.stacked = (svg, cfg, W, H, go) => {
    const cats = cfg.categories || [];
    const list = series(cfg);
    if (!cats.length || !list.length) return;
    const pct = cfg.stack === "pct";
    const padB = 62, padL = cfg.axis === false ? 8 : 92;
    let top = legend(svg, cfg, W, 26);
    const y0 = H - padB, plotH = y0 - top;
    const totals = cats.map((_, c) => list.reduce((a, s) => a + (s.data[c] ?? 0), 0));
    const max = pct ? 100 : (cfg.max ?? niceMax(Math.max(...totals, 0)));

    if (cfg.axis !== false) {
      for (let k = 0; k <= 4; k++) {
        const v = (max / 4) * k, y = y0 - (v / max) * plotH;
        svg.appendChild(el("line", { x1: padL, x2: W, y1: y, y2: y, class: "ch-grid" }));
        svg.appendChild(txt(padL - 18, y + 7, fmt(v, pct ? { suffix: "%" } : cfg), { anchor: "end", size: 20 }));
      }
    }
    svg.appendChild(el("line", { x1: padL, x2: W, y1: y0, y2: y0, class: "ch-axis" }));

    const slot = (W - padL) / cats.length;
    const bw = Math.min(slot * 0.62, 130);
    cats.forEach((cat, c) => {
      const cx = padL + slot * c + slot / 2;
      let acc = 0;
      list.forEach((s, si) => {
        const raw = s.data[c] ?? 0;
        const v = pct ? (totals[c] ? (raw / totals[c]) * 100 : 0) : raw;
        const h = (v / max) * plotH;
        const y = y0 - (acc / max) * plotH - h;
        const r = el("rect", { x: cx - bw / 2, y, width: bw, height: Math.max(0, h), fill: color(s.tone ?? si) });
        if (go) { r.style.transformOrigin = `0px ${y + h}px`; anim(r, "ch-grow-y", 0.08 * c + 0.05 * si); }
        svg.appendChild(r);
        if (cfg.values && h > 34) {
          svg.appendChild(txt(cx, y + h / 2 + 8, fmt(v, pct ? { suffix: "%", decimals: 0 } : cfg),
            { class: "ch-value", size: 20, fill: onFill(s.tone ?? si) }));
        }
        acc += v;
      });
      svg.appendChild(txt(cx, H - 22, cat, { class: "ch-cat", size: 21 }));
    });
  };

  /* ---- LINE / AREA — with the signature draw-on ---- */
  TYPES.line = TYPES.area = (svg, cfg, W, H, go, type) => {
    const cats = cfg.categories || [];
    const list = series(cfg).filter(s => s.data.length);
    if (!cats.length || !list.length) return;
    const padB = cfg.cats === false ? 16 : 62;
    const padL = cfg.axis === false ? 8 : 92;
    const padR = cfg.padR ?? (cfg.endLabels ? 210 : 24);
    let top = legend(svg, cfg, W, 26);
    const y0 = H - padB, plotH = y0 - top;
    const max = cfg.max ?? niceMax(Math.max(...allValues(list), 0));
    const min = cfg.min ?? 0;
    if (max === min) return;
    const X = i => padL + ((W - padL - padR) * i) / Math.max(1, cats.length - 1);
    const Y = v => y0 - ((v - min) / (max - min)) * plotH;

    if (cfg.axis !== false) {
      for (let k = 0; k <= 4; k++) {
        const v = min + ((max - min) / 4) * k, y = Y(v);
        svg.appendChild(el("line", { x1: padL, x2: W, y1: y, y2: y, class: "ch-grid" }));
        svg.appendChild(txt(padL - 18, y + 7, fmt(v, cfg), { anchor: "end", size: 20 }));
      }
    }
    svg.appendChild(el("line", { x1: padL, x2: W, y1: y0, y2: y0, class: "ch-axis" }));

    const endLabels = [];
    list.forEach((s, si) => {
      const pts = s.data.map((v, i) => [X(i), Y(v)]);
      const d = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
      if (type === "area") {
        const a = el("path", {
          d: `${d} L ${X(pts.length - 1)} ${y0} L ${X(0)} ${y0} Z`,
          fill: color(s.tone ?? si), opacity: 0.18
        });
        if (go) anim(a, "ch-fade", 0.45 + si * 0.12);
        svg.appendChild(a);
      }
      const path = el("path", {
        d, fill: "none", stroke: color(s.tone ?? si),
        "stroke-width": 5, "stroke-linecap": "round", "stroke-linejoin": "round"
      });
      svg.appendChild(path);
      if (go) {
        /* getTotalLength needs the node in the document, which it now is. */
        const len = path.getTotalLength ? path.getTotalLength() : 2000;
        path.style.strokeDasharray = len;
        path.style.setProperty("--len", len);
        anim(path, "ch-draw", si * 0.16, 1.4);
      }
      /* End labels instead of a legend: on an axis-free trend chart the line
         has to name itself, and a label at the last point reads faster than
         a key. Needs right padding in the config to sit in. */
      if (cfg.endLabels) {
        const last = pts[pts.length - 1];
        /* Two series can finish at almost the same height and their labels
           then print on top of each other. Remember where each one wants to
           sit; a pass after the loop spreads them out. */
        endLabels.push({ x: last[0] + 16, y: last[1] + 7, name: s.name || "",
                         note: s.note, fill: color(s.tone ?? si), i: si });
      }
      if (cfg.dots !== false) {
        pts.forEach((p, i) => {
          const c = el("circle", { cx: p[0], cy: p[1], r: 7, fill: color(s.tone ?? si) });
          if (go) anim(c, "ch-pop", 0.7 + si * 0.16 + i * 0.05);
          svg.appendChild(c);
          if (cfg.values && list.length === 1) {
            const t = txt(p[0], p[1] - 20, fmt(s.data[i], cfg), { class: "ch-value", size: 22 });
            if (go) anim(t, "ch-fade", 0.9 + i * 0.05);
            svg.appendChild(t);
          }
        });
      }
    });
    /* Spread the end labels: sort by where each wants to be, then walk down
       enforcing a minimum gap. A label with a note underneath needs two
       rows of clearance, so it reserves more. */
    if (endLabels.length) {
      endLabels.sort((a, b) => a.y - b.y);
      let floor = -Infinity;
      endLabels.forEach(l => {
        const need = l.note ? 62 : 34;
        if (l.y < floor) l.y = floor;
        floor = l.y + need;
      });
      endLabels.forEach(l => {
        const t = txt(l.x, l.y, l.name, { anchor: "start", size: 23, class: "ch-cat", fill: l.fill });
        if (go) anim(t, "ch-fade", 1.0 + l.i * 0.12);
        svg.appendChild(t);
        if (l.note) {
          const n = txt(l.x, l.y + 27, l.note, { anchor: "start", size: 18 });
          if (go) anim(n, "ch-fade", 1.1 + l.i * 0.12);
          svg.appendChild(n);
        }
      });
    }
    if (cfg.cats !== false) {
      cats.forEach((cat, i) => svg.appendChild(txt(X(i), H - 22, cat, { class: "ch-cat", size: 21 })));
    }
  };

  /* ---- RACE — time to reach a milestone, one line per contender ----
     Every line starts at launch and climbs to the same target; where it
     arrives on the time axis is the data. Time is logarithmic, because
     two months and seventy-five years cannot share a linear axis without
     the fast lines collapsing into a single vertical stroke. Ticks are
     written in plain words ("1 year", "10 years") so nobody has to read
     a log scale to get it.

       items   [{name, months, highlight}]
       target  label for the finish line, e.g. "100 million users"
       ticks   [{v: months, l: "label"}]

     The line shape between launch and arrival is illustrative. Only the
     arrival point is measured, and it is the only thing labelled. */
  TYPES.race = (svg, cfg, W, H, go) => {
    const items = (cfg.items || []).filter(d => d.months > 0);
    if (!items.length) return;
    const padL = 30, padR = 70, padB = 58;
    const tierH = 58;                         /* two label tiers above the finish */
    const yTarget = 40 + tierH * 2;
    const y0 = H - padB;
    const lo = Math.log10(cfg.min ?? 1), hi = Math.log10(cfg.max ?? 1000);
    const X = m => padL + ((Math.log10(Math.max(m, 1)) - lo) / (hi - lo)) * (W - padL - padR);

    (cfg.ticks || []).forEach(t => {
      const x = X(t.v);
      svg.appendChild(el("line", { x1: x, x2: x, y1: yTarget, y2: y0, class: "ch-grid" }));
      svg.appendChild(txt(x, H - 20, t.l, { size: 19 }));
    });
    svg.appendChild(el("line", { x1: padL, x2: W - padR + 30, y1: y0, y2: y0, class: "ch-axis" }));

    const finish = el("line", { x1: padL, x2: W - padR + 30, y1: yTarget, y2: yTarget,
      stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": "8 8", opacity: 0.4 });
    svg.appendChild(finish);
    if (cfg.target) svg.appendChild(txt(W - padR + 30, yTarget + 30, cfg.target,
      { anchor: "end", size: 19, class: "ch-cat" }));

    /* slowest first, so the hero draws last and on top */
    const order = items.slice().sort((a, b) => b.months - a.months);
    order.forEach((d, k) => {
      const hero = !!d.highlight;
      const xs = X(1), xe = X(d.months);
      const stroke = hero ? color(0) : color(4);
      /* launch, then a slow start and a steep finish: the adoption shape */
      const path = el("path", {
        d: `M ${xs} ${y0} C ${xs + (xe - xs) * 0.55} ${y0}, ${xe - (xe - xs) * 0.15} ${yTarget + (y0 - yTarget) * 0.35}, ${xe} ${yTarget}`,
        fill: "none", stroke, "stroke-width": hero ? 7 : 4, "stroke-linecap": "round"
      });
      svg.appendChild(path);
      if (go) {
        const len = path.getTotalLength ? path.getTotalLength() : 900;
        path.style.strokeDasharray = len; path.style.setProperty("--len", len);
        anim(path, "ch-draw", 0.1 + k * 0.16, hero ? 0.9 : 1.1);
      }
      const dot = el("circle", { cx: xe, cy: yTarget, r: hero ? 11 : 7, fill: stroke });
      if (go) anim(dot, "ch-pop", 0.9 + k * 0.16);
      svg.appendChild(dot);
    });

    /* Labels sit above the finish line, where no line can run through them,
       alternating between two tiers in time order so neighbours never share
       a row. A short leader ties each label back to its arrival point. */
    items.slice().sort((a, b) => a.months - b.months).forEach((d, i) => {
      const hero = !!d.highlight;
      const x = X(d.months);
      const ty = yTarget - (i % 2 === 0 ? 20 : 20 + tierH);
      svg.appendChild(el("line", { x1: x, x2: x, y1: ty + 8, y2: yTarget - 10,
        stroke: "currentColor", "stroke-width": 1.5, opacity: 0.3 }));
      const unit = d.months === 1 ? "month" : "months";
      const name = txt(x, ty - 19, d.name, { size: hero ? 19 : 16, class: "ch-cat",
        fill: hero ? "var(--gold-ink)" : null });
      const val = txt(x, ty, `${d.months.toLocaleString("en-US")} ${unit}`, { size: hero ? 17 : 15,
        class: "ch-value", fill: hero ? "var(--gold-ink)" : null });
      if (go) { anim(name, "ch-fade", 1.1 + i * 0.08); anim(val, "ch-fade", 1.15 + i * 0.08); }
      svg.appendChild(name); svg.appendChild(val);
    });
  };

  /* ---- TREEMAP — parts of a whole, where one part dominates ----
     Each box's AREA is its share, so a 55% slice is visibly more than
     half the chart: the thing a bar chart of shares cannot make you feel.
     Squarified layout (Bruls, Huizing and van Wijk): rows are grown while
     each new box keeps the row's worst aspect ratio improving, which keeps
     boxes close to square and therefore comparable by eye.

       data   [{name, value, tone}]   sorted largest first automatically
       suffix appended to the value label

     Labels degrade with the box: name and value, then value alone, then
     nothing. A label never spills out of its box. */
  TYPES.treemap = (svg, cfg, W, H, go) => {
    const items = (cfg.data || []).filter(d => d.value > 0).slice().sort((a, b) => b.value - a.value);
    if (!items.length) return;
    const total = items.reduce((a, d) => a + d.value, 0);
    const gap = cfg.gap ?? 5;
    let rect = { x: 0, y: 0, w: W, h: H };
    const scale = (W * H) / total;
    const nodes = items.map(d => ({ ...d, area: d.value * scale }));
    const out = [];

    const worst = (row, side) => {
      const sum = row.reduce((a, n) => a + n.area, 0);
      const mx = Math.max(...row.map(n => n.area)), mn = Math.min(...row.map(n => n.area));
      return Math.max((side * side * mx) / (sum * sum), (sum * sum) / (side * side * mn));
    };
    const layRow = (row) => {
      const sum = row.reduce((a, n) => a + n.area, 0);
      const horiz = rect.w >= rect.h;               /* lay the row along the short side */
      if (horiz) {
        const rw = sum / rect.h; let y = rect.y;
        row.forEach(n => { const h = n.area / rw; out.push({ ...n, x: rect.x, y, w: rw, h }); y += h; });
        rect = { x: rect.x + rw, y: rect.y, w: rect.w - rw, h: rect.h };
      } else {
        const rh = sum / rect.w; let x = rect.x;
        row.forEach(n => { const w = n.area / rh; out.push({ ...n, x, y: rect.y, w, h: rh }); x += w; });
        rect = { x: rect.x, y: rect.y + rh, w: rect.w, h: rect.h - rh };
      }
    };
    let row = [];
    nodes.forEach(n => {
      const side = Math.min(rect.w, rect.h);
      if (!row.length || worst(row.concat(n), side) <= worst(row, side)) row.push(n);
      else { layRow(row); row = [n]; }
    });
    if (row.length) layRow(row);

    out.forEach((b, k) => {
      const tone = b.tone ?? (k === 0 ? 0 : 4);
      const x = b.x + gap / 2, y = b.y + gap / 2, w = Math.max(0, b.w - gap), h = Math.max(0, b.h - gap);
      /* `shade` grades the supporting boxes (0 to 1 of the ink colour) so
         neighbours read as separate without each claiming a brand colour. */
      const fill = b.shade != null
        ? `color-mix(in srgb, currentColor ${Math.round(b.shade * 100)}%, transparent)` : color(tone);
      const r = el("rect", { x, y, width: w, height: h, style: "fill:" + fill });
      if (go) anim(r, "ch-pop", 0.06 * k);
      svg.appendChild(r);

      const ink = b.shade != null ? (b.shade > 0.55 ? "#fff" : "var(--ink)") : onFill(tone);
      const val = fmt(b.value, cfg);
      const pad = 14;
      /* Wrap the name onto as many as three lines, trying smaller sizes
         until name and value both fit inside the box. */
      const wrap = (str, size) => {
        const per = Math.max(1, Math.floor((w - pad * 2) / (size * 0.56)));
        const lines = []; let cur = "";
        String(str).split(" ").forEach(word => {
          const t = cur ? cur + " " + word : word;
          if (t.length <= per) cur = t; else { if (cur) lines.push(cur); cur = word; }
        });
        if (cur) lines.push(cur);
        return lines.every(l => l.length <= per) ? lines : null;
      };
      let fit = null;
      const fs = cfg.fontScale ?? 1;
      for (let size = Math.min(30 * fs, Math.sqrt(w * h) / 9 * fs); size >= 11; size -= 1) {
        const lines = wrap(b.name, size);
        const need = pad * 2 + (lines ? lines.length : 9) * size * 1.18 + size * 1.25;
        if (lines && lines.length <= 3 && need <= h) { fit = { size, lines }; break; }
      }
      if (fit) {
        const { size, lines } = fit;
        lines.forEach((l, li) => {
          const t = txt(x + pad, y + pad + size * 0.9 + li * size * 1.18, l,
            { anchor: "start", size, class: "ch-cat", fill: ink });
          if (go) anim(t, "ch-fade", 0.4 + 0.06 * k);
          svg.appendChild(t);
        });
        const t2 = txt(x + pad, y + pad + size * 0.9 + lines.length * size * 1.18 + size * 0.2, val,
          { anchor: "start", size: size * 1.05, class: "ch-value", fill: ink });
        if (go) anim(t2, "ch-fade", 0.45 + 0.06 * k);
        svg.appendChild(t2);
      } else {
        const vs = Math.max(11, Math.min(22 * (cfg.fontScale ?? 1), Math.sqrt(w * h) / 7 * (cfg.fontScale ?? 1)));
        if (val.length * vs * 0.6 + pad * 1.6 <= w && vs + pad * 1.6 <= h) {
          const t2 = txt(x + pad * 0.8, y + pad * 0.8 + vs * 0.85, val, { anchor: "start", size: vs, class: "ch-value", fill: ink });
          if (go) anim(t2, "ch-fade", 0.45 + 0.06 * k);
          svg.appendChild(t2);
        }
      }
    });
  };

  /* ---- SLOPE — two points, one story. Before/after across many rows ---- */
  TYPES.slope = (svg, cfg, W, H, go) => {
    const rows = cfg.rows || [];
    if (!rows.length) return;
    const labels = cfg.categories || ["Before", "After"];
    const padT = 56, padB = 40, padL = 210, padR = 210;
    const values = rows.flatMap(r => [r.from, r.to]).filter(isFinite);
    const max = cfg.max ?? niceMax(Math.max(...values, 0));
    const min = cfg.min ?? 0;
    const Y = v => H - padB - ((v - min) / (max - min || 1)) * (H - padT - padB);
    const xA = padL, xB = W - padR;

    svg.appendChild(txt(xA, 30, labels[0], { class: "ch-cat", size: 22 }));
    svg.appendChild(txt(xB, 30, labels[1], { class: "ch-cat", size: 22 }));
    svg.appendChild(el("line", { x1: xA, x2: xA, y1: padT, y2: H - padB, class: "ch-grid" }));
    svg.appendChild(el("line", { x1: xB, x2: xB, y1: padT, y2: H - padB, class: "ch-grid" }));

    rows.forEach((r, i) => {
      const yA = Y(r.from), yB = Y(r.to);
      const hero = cfg.highlight === i || r.highlight;
      const stroke = hero ? color(0) : (r.to >= r.from ? color(1) : color(2));
      const op = cfg.highlight != null && !hero ? 0.3 : 1;
      const p = el("path", { d: `M ${xA} ${yA} L ${xB} ${yB}`, stroke, "stroke-width": hero ? 6 : 4, fill: "none", opacity: op });
      svg.appendChild(p);
      if (go) {
        const len = p.getTotalLength ? p.getTotalLength() : 900;
        p.style.strokeDasharray = len; p.style.setProperty("--len", len);
        anim(p, "ch-draw", 0.06 * i, 0.9);
      }
      [[xA, yA, r.from, "end", -18], [xB, yB, r.to, "start", 18]].forEach(([x, y, v, an, dx]) => {
        const c = el("circle", { cx: x, cy: y, r: hero ? 9 : 7, fill: stroke, opacity: op });
        if (go) anim(c, "ch-pop", 0.5 + 0.06 * i);
        svg.appendChild(c);
        const t = txt(x + dx, y + 8, (an === "end" ? r.name + "  " : "") + fmt(v, cfg),
          { anchor: an, size: 21, class: "ch-value", opacity: op });
        if (go) anim(t, "ch-fade", 0.6 + 0.06 * i);
        svg.appendChild(t);
      });
    });
  };

  /* ---- SCATTER — two measures, optional bubble size ---- */
  TYPES.scatter = (svg, cfg, W, H, go) => {
    const pts = cfg.points || [];
    if (!pts.length) return;
    const padB = 74, padL = 96, padT = 26, padR = 30;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const xMax = cfg.xMax ?? niceMax(Math.max(...xs)), xMin = cfg.xMin ?? 0;
    const yMax = cfg.yMax ?? niceMax(Math.max(...ys)), yMin = cfg.yMin ?? 0;
    const X = v => padL + ((v - xMin) / (xMax - xMin || 1)) * (W - padL - padR);
    const Y = v => H - padB - ((v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);
    const rMax = Math.max(...pts.map(p => p.r || 1));

    for (let k = 0; k <= 4; k++) {
      const v = yMin + ((yMax - yMin) / 4) * k, y = Y(v);
      svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: y, y2: y, class: "ch-grid" }));
      svg.appendChild(txt(padL - 16, y + 7, fmt(v, { suffix: cfg.ySuffix }), { anchor: "end", size: 19 }));
    }
    for (let k = 0; k <= 4; k++) {
      const v = xMin + ((xMax - xMin) / 4) * k;
      svg.appendChild(txt(X(v), H - padB + 30, fmt(v, { suffix: cfg.xSuffix }), { size: 19 }));
    }
    svg.appendChild(el("line", { x1: padL, x2: W - padR, y1: H - padB, y2: H - padB, class: "ch-axis" }));
    if (cfg.xLabel) svg.appendChild(txt((W + padL) / 2, H - 12, cfg.xLabel, { class: "ch-cat", size: 21 }));
    if (cfg.yLabel) {
      const t = txt(0, 0, cfg.yLabel, { class: "ch-cat", size: 21 });
      t.setAttribute("transform", `translate(26 ${(H - padB + padT) / 2}) rotate(-90)`);
      svg.appendChild(t);
    }

    pts.forEach((p, i) => {
      const r = p.r ? 10 + (p.r / rMax) * 30 : 12;
      const c = el("circle", { cx: X(p.x), cy: Y(p.y), r, fill: color(p.tone ?? (p.highlight ? 0 : 1)),
                               opacity: p.highlight ? 1 : 0.82 });
      if (go) anim(c, "ch-pop", 0.1 + i * 0.05);
      svg.appendChild(c);
      if (p.name) {
        const t = txt(X(p.x), Y(p.y) - r - 12, p.name, { size: 20, class: "ch-cat" });
        if (go) anim(t, "ch-fade", 0.4 + i * 0.05);
        svg.appendChild(t);
      }
    });
  };

  /* ---- DONUT — parts of one whole. `center` prints in the hole ---- */
  TYPES.donut = (svg, cfg, W, H, go) => {
    const data = cfg.data || [];
    if (!data.length) return;
    const cx = cfg.legend === false ? W / 2 : W * 0.32, cy = H / 2;
    const R = Math.min(cy - 16, W * 0.30), r = R * (cfg.thickness ?? 0.60);
    const total = data.reduce((a, d) => a + (d.value || 0), 0) || 1;
    let a0 = -Math.PI / 2;

    const g = el("g", {});
    data.forEach((d, i) => {
      const a1 = a0 + (d.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (ang, rad) => [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad];
      const [x1, y1] = p(a0, R), [x2, y2] = p(a1, R), [x3, y3] = p(a1, r), [x4, y4] = p(a0, r);
      const path = el("path", {
        d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`,
        fill: color(d.tone ?? i)
      });
      if (go) { path.style.transformOrigin = `${cx}px ${cy}px`; anim(path, "ch-pop", 0.06 * i); }
      g.appendChild(path);
      a0 = a1;
    });
    svg.appendChild(g);

    if (cfg.center) {
      const t = txt(cx, cy + 4, cfg.center, { class: "ch-donut-mid", size: Math.min(R * 0.52, 92) });
      if (go) anim(t, "ch-fade", 0.5);
      svg.appendChild(t);
      if (cfg.centerLabel) {
        const s = txt(cx, cy + Math.min(R * 0.42, 56), cfg.centerLabel, { class: "ch-cat", size: 21 });
        if (go) anim(s, "ch-fade", 0.6);
        svg.appendChild(s);
      }
    }
    if (cfg.legend !== false) {
      const lx = W * 0.64, step = Math.min(52, (H - 40) / data.length);
      let ly = cy - (data.length - 1) * step / 2;
      data.forEach((d, i) => {
        const row = el("g", {});
        row.appendChild(el("rect", { x: lx, y: ly - 15, width: 20, height: 20, fill: color(d.tone ?? i) }));
        row.appendChild(txt(lx + 32, ly, d.name || "", { anchor: "start", size: 22 }));
        row.appendChild(txt(W - 8, ly, fmt(d.value, cfg), { anchor: "end", size: 22, class: "ch-value" }));
        if (go) anim(row, "ch-fade", 0.3 + i * 0.07);
        svg.appendChild(row);
        ly += step;
      });
    }
  };

  /* ---- GAUGE — one number against a ceiling, as a 240° arc ---- */
  TYPES.gauge = (svg, cfg, W, H, go) => {
    const v = Number(cfg.value) || 0;
    const max = cfg.max ?? 100;
    const cx = W / 2, cy = H * 0.62;
    const R = Math.min(cy - 20, W * 0.34), r = R * 0.72;
    const A0 = Math.PI * 0.82, A1 = Math.PI * 2.18;   /* 240° sweep, opening down */
    const arc = (from, to, fill, cls, delay) => {
      const large = to - from > Math.PI ? 1 : 0;
      const p = (a, rad) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
      const [x1, y1] = p(from, R), [x2, y2] = p(to, R), [x3, y3] = p(to, r), [x4, y4] = p(from, r);
      const path = el("path", {
        d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`,
        fill
      });
      if (cls && go) { path.style.transformOrigin = `${cx}px ${cy}px`; anim(path, cls, delay); }
      svg.appendChild(path);
    };
    arc(A0, A1, "currentColor", null);
    svg.querySelector("path").setAttribute("opacity", 0.13);
    arc(A0, A0 + (Math.min(v, max) / max) * (A1 - A0), color(cfg.tone ?? 0), "ch-pop", 0.12);

    const t = txt(cx, cy + 10, fmt(v, cfg), { size: Math.min(R * 0.66, 110), class: "ch-donut-mid" });
    if (go) anim(t, "ch-fade", 0.4);
    svg.appendChild(t);
    if (cfg.label) {
      const s = txt(cx, cy + Math.min(R * 0.52, 64), cfg.label, { class: "ch-cat", size: 22 });
      if (go) anim(s, "ch-fade", 0.5);
      svg.appendChild(s);
    }
  };

  /* ---- PROGRESS — stacked labelled tracks. Percentages, shares, quotas ---- */
  TYPES.progress = (svg, cfg, W, H, go) => {
    const rows = cfg.rows || [];
    if (!rows.length) return;
    const padL = cfg.labelWidth ?? 300, padR = 110;
    const max = cfg.max ?? 100;
    const slot = H / rows.length;
    const bh = Math.min(slot * 0.42, 34);
    rows.forEach((row, i) => {
      const y = slot * i + slot / 2 - bh / 2;
      const trackW = W - padL - padR;
      svg.appendChild(txt(padL - 20, y + bh - 6, row.name, { anchor: "end", class: "ch-cat", size: 22 }));
      svg.appendChild(el("rect", { x: padL, y, width: trackW, height: bh, fill: "currentColor", opacity: 0.11 }));
      const w = Math.max(0, Math.min(1, (row.value || 0) / max)) * trackW;
      const bar = el("rect", { x: padL, y, width: w, height: bh, fill: color(row.tone ?? (cfg.highlight === i ? 0 : cfg.flat ? 0 : Math.min(i, 4))) });
      if (go) { bar.style.transformOrigin = `${padL}px 0`; anim(bar, "ch-grow", 0.08 * i); }
      svg.appendChild(bar);
      const t = txt(padL + trackW + 16, y + bh - 6, fmt(row.value, cfg), { anchor: "start", class: "ch-value", size: 24 });
      if (go) anim(t, "ch-fade", 0.3 + 0.08 * i);
      svg.appendChild(t);
    });
  };

  /* ---- FUNNEL — drop-off through stages ---- */
  TYPES.funnel = (svg, cfg, W, H, go) => {
    const rows = cfg.rows || [];
    if (!rows.length) return;
    const padR = 260;
    const max = rows[0]?.value || 1;
    const slot = H / rows.length;
    const bh = Math.min(slot * 0.72, 92);
    rows.forEach((row, i) => {
      const y = slot * i + (slot - bh) / 2;
      const w = Math.max(6, ((row.value || 0) / max) * (W - padR));
      const x = (W - padR - w) / 2;
      const r = el("rect", { x, y, width: w, height: bh, fill: color(row.tone ?? Math.min(i, 4)) });
      if (go) { r.style.transformOrigin = `${x + w / 2}px 0`; anim(r, "ch-pop", 0.09 * i); }
      svg.appendChild(r);
      /* The whole point of a funnel is that the last bars are narrow, so the
         label will not fit inside them — and white-on-white is invisible
         rather than merely tight. Cost the label at ~12 units per character
         and move it outside, in ink, when the bar cannot hold it. */
      const labelW = String(row.name).length * 12 + 24;
      if (labelW <= w) {
        svg.appendChild(txt(x + w / 2, y + bh / 2 + 9, row.name,
          { size: 24, fill: onFill(row.tone ?? Math.min(i, 4)), class: "ch-value" }));
      } else {
        svg.appendChild(txt(x - 18, y + bh / 2 + 9, row.name, { anchor: "end", size: 22, class: "ch-cat" }));
      }
      const t = txt(W - padR + 28, y + bh / 2 + 9, fmt(row.value, cfg), { anchor: "start", class: "ch-value", size: 26 });
      svg.appendChild(t);
      /* Step-down between stages is the point of a funnel, so state it. */
      if (i > 0 && cfg.drop !== false) {
        const prev = rows[i - 1].value || 1;
        const pct = ((row.value - prev) / prev) * 100;
        svg.appendChild(txt(W - 8, y + bh / 2 + 9, (pct >= 0 ? "+" : "") + pct.toFixed(0) + "%",
          { anchor: "end", size: 21, fill: pct >= 0 ? "var(--pos)" : "var(--neg)" }));
      }
      if (go) anim(t, "ch-fade", 0.3 + 0.09 * i);
    });
  };

  /* ---- WAFFLE — a percentage you can count. 10×10 by default ---- */
  TYPES.waffle = (svg, cfg, W, H, go) => {
    const cols = cfg.cols || 10, rowsN = cfg.rows || 10;
    const pct = Math.max(0, Math.min(100, Number(cfg.value) || 0));
    const on = Math.round((pct / 100) * cols * rowsN);
    const size = Math.min((W * 0.46) / cols, (H - 20) / rowsN);
    const gap = size * 0.16, box = size - gap;
    const gx = 4, gy = (H - rowsN * size) / 2;
    for (let n = 0; n < cols * rowsN; n++) {
      const cx = n % cols, cy = Math.floor(n / cols);
      const lit = n < on;
      const r = el("rect", {
        x: gx + cx * size, y: gy + cy * size, width: box, height: box,
        fill: lit ? color(cfg.tone ?? 0) : "currentColor", opacity: lit ? 1 : 0.13
      });
      if (go && lit) anim(r, "ch-pop", 0.008 * n);
      svg.appendChild(r);
    }
    const tx = gx + cols * size + W * 0.06;
    const t = txt(tx, H / 2 - 6, fmt(pct, { suffix: "%", decimals: cfg.decimals ?? 0 }),
      { anchor: "start", class: "ch-donut-mid", size: Math.min(H * 0.34, 110) });
    if (go) anim(t, "ch-fade", 0.5);
    svg.appendChild(t);
    if (cfg.label) {
      const s = txt(tx, H / 2 + Math.min(H * 0.17, 46), cfg.label, { anchor: "start", class: "ch-cat", size: 23 });
      if (go) anim(s, "ch-fade", 0.6);
      svg.appendChild(s);
    }
  };

  /* ---- PICTOGRAM — "N in 10" as repeated glyphs ---- */
  TYPES.pictogram = (svg, cfg, W, H, go) => {
    const n = cfg.of ?? 10, on = cfg.value ?? 0;
    const perRow = cfg.perRow ?? n;
    const rowsN = Math.ceil(n / perRow);
    const cell = Math.min(W / perRow, (H - 30) / rowsN);
    const gy = (H - rowsN * cell) / 2;
    const gx = (W - Math.min(n, perRow) * cell) / 2;
    /* A simple standing figure — read as "people" at any size. */
    const glyph = (x, y, s, fill, op) => {
      const g = el("g", { fill, opacity: op });
      g.appendChild(el("circle", { cx: x + s * 0.5, cy: y + s * 0.22, r: s * 0.135 }));
      g.appendChild(el("path", { d:
        `M ${x + s * 0.5} ${y + s * 0.36}
         c ${-s * 0.2} 0 ${-s * 0.28} ${s * 0.1} ${-s * 0.28} ${s * 0.26}
         l 0 ${s * 0.2} l ${s * 0.11} 0 l ${s * 0.03} ${s * 0.26}
         l ${s * 0.28} 0 l ${s * 0.03} ${-s * 0.26} l ${s * 0.11} 0
         l 0 ${-s * 0.2} c 0 ${-s * 0.16} ${-s * 0.08} ${-s * 0.26} ${-s * 0.28} ${-s * 0.26} z` }));
      return g;
    };
    for (let k = 0; k < n; k++) {
      const cx = gx + (k % perRow) * cell, cy = gy + Math.floor(k / perRow) * cell;
      const lit = k < on;
      const g = glyph(cx + cell * 0.08, cy, cell * 0.84, lit ? color(cfg.tone ?? 0) : "currentColor", lit ? 1 : 0.15);
      if (go && lit) anim(g, "ch-pop", 0.07 * k);
      svg.appendChild(g);
    }
  };

  /* ---- GANTT — phases on a timeline ---- */
  TYPES.gantt = (svg, cfg, W, H, go) => {
    const rows = cfg.rows || [];
    const cols = cfg.categories || [];
    if (!rows.length || !cols.length) return;
    const padL = cfg.labelWidth ?? 260, padT = 44;
    const colW = (W - padL) / cols.length;
    cols.forEach((c, i) => {
      svg.appendChild(txt(padL + colW * i + colW / 2, 26, c, { class: "ch-cat", size: 21 }));
      svg.appendChild(el("line", { x1: padL + colW * i, x2: padL + colW * i, y1: padT - 12, y2: H, class: "ch-grid" }));
    });
    const slot = (H - padT) / rows.length;
    const bh = Math.min(slot * 0.52, 40);
    rows.forEach((row, i) => {
      const y = padT + slot * i + (slot - bh) / 2;
      svg.appendChild(txt(padL - 20, y + bh - 10, row.name, { anchor: "end", class: "ch-cat", size: 22 }));
      const x = padL + colW * (row.start ?? 0);
      const w = Math.max(4, colW * (row.span ?? 1));
      const r = el("rect", { x, y, width: w, height: bh, fill: color(row.tone ?? Math.min(i, 4)), rx: 2 });
      if (go) { r.style.transformOrigin = `${x}px 0`; anim(r, "ch-grow", 0.08 * i); }
      svg.appendChild(r);
      if (row.label) svg.appendChild(txt(x + w / 2, y + bh - 11, row.label,
        { size: 19, fill: onFill(row.tone ?? Math.min(i, 4)) }));
    });
  };

  /* ---- DUMBBELL — the gap between two measures, per row ---- */
  TYPES.dumbbell = (svg, cfg, W, H, go) => {
    const rows = cfg.rows || [];
    if (!rows.length) return;
    const padL = cfg.labelWidth ?? 280, padR = 120;
    const values = rows.flatMap(r => [r.from, r.to]).filter(isFinite);
    const max = cfg.max ?? niceMax(Math.max(...values, 0));
    const min = cfg.min ?? 0;
    const X = v => padL + ((v - min) / (max - min || 1)) * (W - padL - padR);
    const slot = H / rows.length;
    rows.forEach((row, i) => {
      const y = slot * i + slot / 2;
      svg.appendChild(txt(padL - 20, y + 8, row.name, { anchor: "end", class: "ch-cat", size: 22 }));
      const xa = X(row.from), xb = X(row.to);
      const ln = el("line", { x1: xa, x2: xb, y1: y, y2: y, stroke: "currentColor", "stroke-width": 5, opacity: 0.22 });
      if (go) { ln.style.transformOrigin = `${xa}px 0`; anim(ln, "ch-grow", 0.07 * i); }
      svg.appendChild(ln);
      [[xa, color(4), row.from], [xb, color(0), row.to]].forEach(([x, fill], k) => {
        const c = el("circle", { cx: x, cy: y, r: 11, fill });
        if (go) anim(c, "ch-pop", 0.25 + 0.07 * i + k * 0.06);
        svg.appendChild(c);
      });
      const t = txt(W - 8, y + 8, fmt(row.to, cfg), { anchor: "end", class: "ch-value", size: 23 });
      if (go) anim(t, "ch-fade", 0.4 + 0.07 * i);
      svg.appendChild(t);
    });
  };

  /* ---- HEATMAP — two categorical axes, one measure ---- */
  TYPES.heatmap = (svg, cfg, W, H, go) => {
    const cols = cfg.categories || [], rows = cfg.rows || [];
    if (!cols.length || !rows.length) return;
    const padL = cfg.labelWidth ?? 220, padT = 44;
    const cw = (W - padL) / cols.length, ch = (H - padT) / rows.length;
    const vals = rows.flatMap(r => r.data || []).filter(isFinite);
    const max = cfg.max ?? Math.max(...vals, 1), min = cfg.min ?? Math.min(...vals, 0);
    cols.forEach((c, i) => svg.appendChild(txt(padL + cw * i + cw / 2, 26, c, { class: "ch-cat", size: 20 })));
    rows.forEach((row, r) => {
      svg.appendChild(txt(padL - 16, padT + ch * r + ch / 2 + 7, row.name, { anchor: "end", class: "ch-cat", size: 20 }));
      (row.data || []).forEach((v, c) => {
        const t = (v - min) / (max - min || 1);
        const si = Math.min(SEQ.length - 1, Math.floor(t * SEQ.length));
        const cell = el("rect", {
          x: padL + cw * c + 2, y: padT + ch * r + 2,
          width: cw - 4, height: ch - 4,
          fill: SEQ[si]
        });
        if (go) anim(cell, "ch-fade", 0.02 * (r * cols.length + c));
        svg.appendChild(cell);
        if (cfg.values !== false) {
          svg.appendChild(txt(padL + cw * c + cw / 2, padT + ch * r + ch / 2 + 7, fmt(v, cfg),
            { size: 19, fill: onSeq(si) }));
        }
      });
    });
  };

  /* ---- SPARKLINE — trend only, no axis. Sits inline in a stat ---- */
  TYPES.sparkline = (svg, cfg, W, H, go) => {
    const d = (cfg.data || []).map(Number).filter(isFinite);
    if (d.length < 2) return;
    const max = Math.max(...d), min = Math.min(...d);
    const X = i => (W * i) / (d.length - 1);
    const Y = v => H - 6 - ((v - min) / (max - min || 1)) * (H - 12);
    const path = el("path", {
      d: d.map((v, i) => (i ? "L" : "M") + X(i) + " " + Y(v)).join(" "),
      fill: "none", stroke: color(cfg.tone ?? 0), "stroke-width": 4,
      "stroke-linecap": "round", "stroke-linejoin": "round"
    });
    svg.appendChild(path);
    if (go) {
      const len = path.getTotalLength ? path.getTotalLength() : 600;
      path.style.strokeDasharray = len; path.style.setProperty("--len", len);
      anim(path, "ch-draw", 0.1, 1.1);
    }
    const last = el("circle", { cx: X(d.length - 1), cy: Y(d[d.length - 1]), r: 6, fill: color(cfg.tone ?? 0) });
    if (go) anim(last, "ch-pop", 0.9);
    svg.appendChild(last);
  };

  /* ============================================================
     RENDER
     ============================================================ */
  /* A figure inside a closed tab panel is display:none and measures zero, so
     it cannot be drawn — and a chart that was never drawn cannot appear in
     the PDF either, because `beforeprint` measures the same zero box before
     the print stylesheet has revealed the panel.

     So: reveal the hidden ancestors just long enough to measure, then put
     them back exactly as they were. It is synchronous, costs one extra
     layout, only runs for figures that are actually hidden, and nothing is
     ever painted in the revealed state. */
  function measure(fig) {
    let box = fig.getBoundingClientRect();
    if (box.width >= 2 && box.height >= 2) return box;

    const restore = [];
    for (let n = fig; n && n !== document.body; n = n.parentElement) {
      if (getComputedStyle(n).display === "none") {
        restore.push([n, n.style.display]);
        n.style.display = "block";
      }
    }
    if (!restore.length) return box;              /* hidden some other way */
    box = fig.getBoundingClientRect();
    restore.forEach(([el, prev]) => { el.style.display = prev; });
    return box;
  }

  function draw(fig) {
    const type = fig.dataset.chart;
    const fn = TYPES[type];
    const box = measure(fig);
    /* Still no box — the slide itself is off-stage, or a build step has not
       opened. refresh() will come back when it does. */
    if (!fn || box.width < 2 || box.height < 2) return;

    let cfg = {};
    const src = fig.querySelector('script[type="application/json"]');
    if (src) {
      try { cfg = JSON.parse(src.textContent); }
      catch (e) {
        console.warn("[charts] bad JSON in", type, e);
        /* Fail visibly to the author, silently to the room. */
        cfg = {};
      }
    }

    const W = 1000;
    const H = Math.round((box.height / box.width) * W);
    const svg = el("svg", {
      viewBox: `0 0 ${W} ${H}`,
      preserveAspectRatio: "xMidYMid meet",
      class: "ch-svg", role: "img",
      "aria-label": cfg.alt || fig.getAttribute("aria-label") || (type + " chart")
    });
    const prev = fig.querySelector("svg");
    if (prev) prev.remove();
    fig.appendChild(svg);

    try { fn(svg, cfg, W, H, !still(), type); }
    catch (e) { console.warn("[charts] render failed:", type, e); }
  }

  const figures = root => Array.from((root || document).querySelectorAll("figure.chart[data-chart]"));

  /* Called by deck.js on slide entry: draw everything that has a box. */
  const render  = root => figures(root).forEach(draw);
  /* Called when a build step opens: draw only what was not drawable before,
     so a chart already on screen does not restart its animation. */
  const refresh = root => figures(root).forEach(f => { if (!f.querySelector("svg")) draw(f); });

  /* Re-draw on resize: the viewBox is derived from the figure's aspect
     ratio, and a window resize can change it (the stage is letterboxed
     against the viewport, not a fixed shape). Debounced, and only for
     slides on screen. */
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      document.querySelectorAll(".slide.active").forEach(s => figures(s).forEach(draw));
    }, 180);
  });

  /* Print asks for every chart at once, built and still. */
  window.addEventListener("beforeprint", () => figures().forEach(draw));

  return { render, refresh, draw, types: Object.keys(TYPES) };
})();
