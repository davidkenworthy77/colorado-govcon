/* ============================================================
   DECK ENGINE
   Navigation, build steps, HUD, navigator, speaker notes.

   Deck-agnostic: reads the DOM, assumes nothing about slide
   content. Per-deck behaviour attaches via Deck.onEnter().

   The one non-obvious thing in here is that RIGHT does not always
   mean "next slide". On a slide with [data-steps] it means "next
   beat", and only advances the deck once the build is exhausted.
   Going backwards unwinds the same way, and arriving at a slide
   from the left opens it fully built — otherwise stepping back
   into a slide would replay a build the room has already seen.
   ============================================================ */

window.Deck = (() => {
  const slides    = Array.from(document.querySelectorAll('.slide'));
  const sectionEl = document.getElementById('hud-section');
  const counterEl = document.getElementById('hud-slide');
  const progress  = document.getElementById('progress');
  const help      = document.getElementById('help');
  const stage     = document.getElementById('stage');
  const hudEl     = document.querySelector('.hud');

  const pad   = n => String(n).padStart(2, '0');
  const total = slides.length;
  let i = 0;

  /* per-deck hooks: Deck.onEnter('s-ecosystem', el => {…}) */
  const enterHooks = {};
  const leaveHooks = {};

  /* ---------- build steps ----------
     Normalise authoring shorthand into explicit numbers once, on
     load. Bare [data-step] auto-increments; an explicit data-step="N"
     pins the beat and resets the counter, so authors can interleave
     the two without tracking indices by hand. */
  const stepState = new Map();   /* slide -> { max, at } */

  function initSteps(slide) {
    if (!slide.hasAttribute('data-steps')) return;
    let auto = 0, max = 0;
    slide.querySelectorAll('[data-step]').forEach(el => {
      const raw = el.getAttribute('data-step');
      let n;
      if (raw === '' || raw == null) { n = ++auto; }
      else { n = parseInt(raw, 10); if (!isFinite(n) || n < 1) n = ++auto; else auto = n; }
      el.setAttribute('data-step', n);
      if (n > max) max = n;
    });
    slide.querySelectorAll('[data-step-until]').forEach(el => {
      const n = parseInt(el.getAttribute('data-step-until'), 10) || 1;
      if (n > max) max = n;
    });
    /* data-step-dim retires one beat AFTER the element it sits on, so it
       needs no number of its own: it dims when the next beat lands. */
    let dimAuto = 0;
    slide.querySelectorAll('[data-step-dim]').forEach(el => {
      if (!el.getAttribute('data-step-dim')) {
        const own = parseInt(el.getAttribute('data-step'), 10);
        el.setAttribute('data-step-dim', isFinite(own) ? own + 1 : ++dimAuto + 1);
      }
    });
    stepState.set(slide, { max, at: 0 });

    const ticks = slide.querySelector('.build-ticks');
    if (ticks && max > 0) {
      ticks.innerHTML = '';
      for (let n = 0; n < max; n++) {
        const t = document.createElement('span');
        t.className = 'build-ticks__tick';
        ticks.appendChild(t);
      }
    }
  }

  function applySteps(slide) {
    const st = stepState.get(slide);
    if (!st) return;
    slide.querySelectorAll('[data-step]').forEach(el => {
      const n = parseInt(el.getAttribute('data-step'), 10);
      if (n <= st.at) el.setAttribute('data-step-on', '');
      else el.removeAttribute('data-step-on');
    });
    slide.querySelectorAll('[data-step-until]').forEach(el => {
      const n = parseInt(el.getAttribute('data-step-until'), 10);
      el.toggleAttribute('data-step-spent', st.at >= n);
    });
    slide.querySelectorAll('[data-step-dim]').forEach(el => {
      const n = parseInt(el.getAttribute('data-step-dim'), 10);
      el.toggleAttribute('data-step-spent', st.at >= n);
    });
    const ticks = slide.querySelectorAll('.build-ticks__tick');
    ticks.forEach((t, idx) => t.classList.toggle('is-on', idx < st.at));

    /* A chart revealed by a step has to draw when the step lands, not
       when the slide did — it had no layout box to measure until now. */
    if (window.DeckCharts) window.DeckCharts.refresh(slide);
  }

  /* ---------- click counter in the HUD ----------
     One dot per click on the current slide, filled as each lands, next to
     the slide number. It lives in the presenter bar rather than on the
     slide so it is always in the same place, always visible, and never
     part of the design the room is looking at. */
  let hudSteps = document.getElementById('hud-steps');
  if (!hudSteps && counterEl) {
    hudSteps = document.createElement('span');
    hudSteps.id = 'hud-steps';
    hudSteps.className = 'hud-steps';
    counterEl.after(hudSteps);
  }
  function renderHudSteps() {
    if (!hudSteps) return;
    const st = stepState.get(slides[i]);
    if (!st || !st.max) { hudSteps.innerHTML = ''; return; }
    hudSteps.innerHTML = Array.from({ length: st.max },
      (_, k) => `<i class="${k < st.at ? 'is-on' : ''}"></i>`).join('');
    hudSteps.title = `${st.max - st.at} of ${st.max} clicks left on this slide`;
  }

  const stepsLeft = slide => {
    const st = stepState.get(slide);
    return st ? st.max - st.at : 0;
  };
  function setSteps(slide, at) {
    const st = stepState.get(slide);
    if (!st) return;
    st.at = Math.max(0, Math.min(st.max, at));
    applySteps(slide);
    if (slide === slides[i]) renderHudSteps();
  }

  /* ---------- live countdown ----------
     <div data-countdown="2026-09-23T09:00:00Z">
       <span data-cd="days"></span><span data-cd="hrs"></span> … */
  function initCountdowns() {
    const nodes = Array.from(document.querySelectorAll('[data-countdown]'));
    if (!nodes.length) return;
    const tick = () => {
      nodes.forEach(node => {
        const target = Date.parse(node.dataset.countdown);
        if (Number.isNaN(target)) return;
        const diff = Math.max(0, target - Date.now());
        const t = Math.floor(diff / 1000);
        const parts = {
          days: Math.floor(t / 86400).toLocaleString('en-US'),
          hrs:  pad(Math.floor((t % 86400) / 3600)),
          mins: pad(Math.floor((t % 3600) / 60)),
          secs: pad(t % 60)
        };
        node.querySelectorAll('[data-cd]').forEach(el => {
          const v = parts[el.dataset.cd];
          if (v !== undefined && el.textContent !== v) el.textContent = v;
        });
      });
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- count-up ----------
     <div data-countup>2,000+</div> animates 0 → value on arrival.
     Non-numeric values (e.g. "#1") just fade in. The target markup is
     stashed on first sight so suffixes and <span>s survive the count. */
  function collect(root) {
    return Array.from(root.querySelectorAll('[data-countup]')).map(el => {
      if (!el.dataset.targetHtml) el.dataset.targetHtml = el.innerHTML;
      return el;
    });
  }
  /* One shared timer list, cleared only when a NEW count starts. It must
     not be cleared by resetCountUps: setActive resets every other slide
     in the same pass, and the slides after the active one would then
     cancel the timers the active slide had just queued — which reads as
     every number on the deck being stuck at zero. */
  const countTimers = [];
  const clearCountTimers = () => { while (countTimers.length) clearTimeout(countTimers.pop()); };

  function resetCountUps(root) {
    collect(root).forEach(el => { el.style.opacity = ''; el.innerHTML = el.dataset.targetHtml; });
  }
  function runCountUps(root) {
    clearCountTimers();
    resetCountUps(root);
    collect(root).forEach((el, idx) => {
      const targetHtml = el.dataset.targetHtml;
      const m = el.textContent.trim().match(/^(-?[\d,]+(?:\.\d+)?)(.*)$/s);
      if (m) {
        const raw     = m[1].replace(/,/g, '');
        const num     = parseFloat(raw);
        const decs    = (raw.split('.')[1] || '').length;
        const grouped = m[1].includes(',');
        const show = v => grouped
          ? v.toLocaleString('en-US', { minimumFractionDigits: decs, maximumFractionDigits: decs })
          : v.toFixed(decs);
        el.innerHTML = targetHtml.replace(/^-?[\d,]+(\.\d+)?/, show(0));
        countTimers.push(setTimeout(() => {
          const start = performance.now(), dur = 1050;
          (function frame(now) {
            const t = Math.min(1, (now - start) / dur);
            const v = (1 - Math.pow(1 - t, 3)) * num;
            el.innerHTML = targetHtml.replace(/^-?[\d,]+(\.\d+)?/, show(v));
            if (t < 1) requestAnimationFrame(frame);
            else el.innerHTML = targetHtml;
          })(performance.now());
        }, 300 + idx * 150));
      } else {
        el.style.opacity = '0';
        countTimers.push(setTimeout(() => { el.style.opacity = ''; }, 900));
      }
    });
  }

  /* ---------- deep link ----------
     The slide number lives in the hash, so a refresh, a reopened tab or
     a pasted link lands on the slide you were on. replaceState, not
     assignment, so stepping through a deck does not fill the back
     button with one entry per slide. */
  function startIndex() {
    const m = /^#(\d+)$/.exec(location.hash);
    if (!m) return 0;
    const n = parseInt(m[1], 10) - 1;
    return (n >= 0 && n < total) ? n : 0;
  }
  function writeHash() {
    const h = '#' + (i + 1);
    if (location.hash !== h) history.replaceState(null, '', h);
  }

  /* ---------- slide navigator ---------- */
  let navEl = null, navSel = 0;
  const navOpen = () => !!navEl && navEl.classList.contains('open');

  function buildNav() {
    navEl = document.createElement('div');
    navEl.className = 'nav-overlay';
    const inner = document.createElement('div'); inner.className = 'nav-inner';
    const head  = document.createElement('div'); head.className  = 'nav-head';
    const h1 = document.createElement('span'); h1.textContent = 'Jump to slide';
    const h2 = document.createElement('span');
    h2.textContent = 'Arrows move · Enter selects · N or ESC closes';
    head.append(h1, h2);
    const grid = document.createElement('div'); grid.className = 'nav-grid';
    slides.forEach((s, idx) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'nav-card';
      const n = document.createElement('span'); n.className = 'nc-n'; n.textContent = pad(idx + 1);
      const t = document.createElement('span'); t.className = 'nc-t';
      t.textContent = s.dataset.title || s.dataset.section || ('Slide ' + (idx + 1));
      b.append(n, t);
      b.addEventListener('click', () => { setActive(idx); closeNav(); });
      b.addEventListener('mouseenter', () => { navSel = idx; markNav(); });
      grid.appendChild(b);
    });
    inner.append(head, grid);
    navEl.appendChild(inner);
    navEl.addEventListener('click', e => { if (e.target === navEl) closeNav(); });
    document.body.appendChild(navEl);
  }
  function markNav() {
    if (!navEl) return;
    navEl.querySelectorAll('.nav-card').forEach((c, idx) => {
      c.classList.toggle('current', idx === i);
      c.classList.toggle('sel', idx === navSel);
    });
  }
  /* Column count is measured, not assumed: the grid is auto-fill, so how
     many cards sit per row depends on the viewport. Up/Down step by that. */
  function navCols() {
    const cards = navEl ? navEl.querySelectorAll('.nav-card') : [];
    if (cards.length < 2) return 1;
    const top = cards[0].getBoundingClientRect().top;
    let n = 0;
    for (const c of cards) {
      if (Math.abs(c.getBoundingClientRect().top - top) < 2) n++; else break;
    }
    return Math.max(1, n);
  }
  function moveSel(d) {
    navSel = Math.max(0, Math.min(total - 1, navSel + d));
    markNav();
    const c = navEl.querySelectorAll('.nav-card')[navSel];
    if (c) c.scrollIntoView({ block: 'nearest' });
  }
  const openNav   = () => { if (!navEl) buildNav(); navSel = i; markNav(); navEl.classList.add('open'); };
  const closeNav  = () => { if (navEl) navEl.classList.remove('open'); };
  const toggleNav = () => navOpen() ? closeNav() : openNav();

  /* ---------- navigation ---------- */
  function setActive(next, opts = {}) {
    next = Math.max(0, Math.min(total - 1, next));
    slides.forEach((s, idx) => {
      if (idx === next) {
        s.classList.remove('active');
        void s.offsetWidth;                 /* restart arrival animations */
        s.classList.add('active');
        /* Entering forwards starts the build at zero; entering backwards
           opens it fully built, so stepping back never replays a beat. */
        setSteps(s, opts.built ? (stepState.get(s)?.max ?? 0) : 0);
        runCountUps(s);
        if (window.DeckCharts) window.DeckCharts.render(s);
        Object.keys(enterHooks).forEach(cls => {
          if (s.classList.contains(cls)) enterHooks[cls](s);
        });
      } else {
        if (s.classList.contains('active')) {
          Object.keys(leaveHooks).forEach(cls => {
            if (s.classList.contains(cls)) leaveHooks[cls](s);
          });
        }
        s.classList.remove('active');
        resetCountUps(s);
      }
    });
    i = next;
    const cur = slides[i];
    if (sectionEl) sectionEl.textContent = (cur.dataset.section || '&middot;').toUpperCase();
    if (counterEl) counterEl.textContent = `${pad(i + 1)} / ${pad(total)}`;
    if (progress)  progress.style.width = (total > 1 ? i / (total - 1) * 100 : 100) + '%';
    if (hudEl)     hudEl.dataset.mode = cur.dataset.hud || '';
    renderHudSteps();
    writeHash();
    markNav();
    document.dispatchEvent(new CustomEvent('deck:change', { detail: { index: i, slide: cur } }));
  }

  /* Forward: consume a build beat if one is pending, else change slide. */
  function advance() {
    const cur = slides[i];
    if (stepsLeft(cur) > 0) { setSteps(cur, stepState.get(cur).at + 1); return; }
    if (i < total - 1) setActive(i + 1);
  }
  /* Back: unwind the build first; stepping off the front of a slide lands
     on the previous one fully built. */
  function retreat() {
    const cur = slides[i];
    const st = stepState.get(cur);
    if (st && st.at > 0) { setSteps(cur, st.at - 1); return; }
    if (i > 0) setActive(i - 1, { built: true });
  }

  window.addEventListener('keydown', e => {
    /* While the navigator is open it owns the keyboard: arrows move the
       selection rather than the deck, so nothing flashes past behind the
       overlay, and Enter commits the slide under the cursor. */
    if (navOpen()) {
      e.preventDefault();
      if      (e.key === 'ArrowRight') moveSel(1);
      else if (e.key === 'ArrowLeft')  moveSel(-1);
      else if (e.key === 'ArrowDown')  moveSel(navCols());
      else if (e.key === 'ArrowUp')    moveSel(-navCols());
      else if (e.key === 'Home')       { navSel = 0; markNav(); }
      else if (e.key === 'End')        { navSel = total - 1; markNav(); }
      else if (e.key === 'Enter' || e.key === ' ') { setActive(navSel); closeNav(); }
      else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') closeNav();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;   /* leave Cmd+P alone */

    if (['ArrowRight', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); advance(); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key))             { e.preventDefault(); retreat(); }
    /* Down/Up jump the whole slide, skipping the build — the escape hatch
       when a question drags you somewhere else mid-build. */
    else if (e.key === 'ArrowDown')                               { e.preventDefault(); setActive(i + 1); }
    else if (e.key === 'ArrowUp')                                 { e.preventDefault(); setActive(i - 1, { built: true }); }
    else if (e.key === 'Home')                                    { e.preventDefault(); setActive(0); }
    else if (e.key === 'End')                                     { e.preventDefault(); setActive(total - 1, { built: true }); }
    else if (e.key === 'n' || e.key === 'N')                      { e.preventDefault(); toggleNav(); }
    else if (e.key === 'Escape')                                  { closeNav(); }
    else if (e.key === 's' || e.key === 'S')                      { e.preventDefault(); window.DeckNotes && window.DeckNotes.toggle(); }
    else if (e.key === 'p' || e.key === 'P')                      { e.preventDefault(); window.DeckNotes && window.DeckNotes.print(); }
    else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    }
  });

  if (counterEl) counterEl.addEventListener('click', openNav);

  window.addEventListener('hashchange', () => {
    const n = startIndex();
    if (n !== i) setActive(n);
  });

  if (stage) {
    stage.addEventListener('click', e => {
      /* Anything interactive on a slide handles its own click. */
      if (e.target.closest('a, button, .flip, [data-no-advance]')) return;
      const r = stage.getBoundingClientRect();
      (e.clientX - r.left > r.width * 0.35) ? advance() : retreat();
    });
    let touchStart = 0;
    stage.addEventListener('touchstart', e => { touchStart = e.changedTouches[0].clientX; }, { passive: true });
    stage.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - touchStart;
      if (Math.abs(dx) >= 40) dx < 0 ? advance() : retreat();
    }, { passive: true });
  }

  if (help) {
    let t;
    setTimeout(() => help.classList.add('fade'), 6000);
    window.addEventListener('mousemove', () => {
      help.classList.remove('fade');
      clearTimeout(t);
      t = setTimeout(() => help.classList.add('fade'), 3500);
    });
  }

  /* ---------- boot ---------- */
  slides.forEach(initSteps);
  /* index children of every .fx-auto container so CSS can stagger them */
  document.querySelectorAll('.fx-auto').forEach(c => {
    Array.from(c.children).forEach((child, n) => child.style.setProperty('--i', n));
  });
  initCountdowns();
  setActive(startIndex());

  return {
    go: setActive,
    next: advance,
    prev: retreat,
    get index() { return i; },
    get total() { return total; },
    get slide() { return slides[i]; },
    onEnter: (cls, fn) => { enterHooks[cls] = fn; },
    onLeave: (cls, fn) => { leaveHooks[cls] = fn; },
    openNav, closeNav, toggleNav
  };
})();


/* ============================================================
   SPEAKER NOTES
   Reads <aside class="notes"> inside each .slide. The aside is
   hidden on stage by deck.css; this module surfaces it.

     S — notes overlay for the current slide (prep mode)
     P — the whole deck as one printable notes document.
         Cmd/Ctrl+P from there prints it. Reload to return.
   ============================================================ */
window.DeckNotes = (() => {
  const slides = Array.from(document.querySelectorAll('.slide'));
  const pad = n => String(n).padStart(2, '0');
  let panel = null;

  function titleOf(s) {
    if (s.dataset.title) return s.dataset.title;
    /* A slide's title is its first heading; <br> reads as a space so
       "SELLING<br>SUMMER" does not print as one word. */
    const h = s.querySelector('h1, h2, .d-mega, .d-xl, .d-lg, .d-md');
    if (!h) return s.dataset.section || '';
    const t = document.createElement('div');
    t.innerHTML = h.innerHTML.replace(/<br\s*\/?>/gi, ' ');
    return t.textContent.replace(/\s+/g, ' ').trim();
  }
  const notesOf = s => {
    const a = s.querySelector('aside.notes');
    return a ? a.innerHTML : '<p><em>No notes for this slide.</em></p>';
  };

  function build() {
    panel = document.createElement('div');
    panel.className = 'notes-panel';
    panel.innerHTML = '<div class="notes-head"><span class="nh-n"></span><span class="nh-t"></span>'
                    + '<span class="nh-k">S closes · P prints all</span></div>'
                    + '<div class="notes-body"></div>';
    document.body.appendChild(panel);
  }
  function render() {
    if (!panel) return;
    const idx = window.Deck ? window.Deck.index : 0;
    const s = slides[idx];
    panel.querySelector('.nh-n').textContent = pad(idx + 1) + ' / ' + pad(slides.length);
    panel.querySelector('.nh-t').textContent = titleOf(s);
    panel.querySelector('.notes-body').innerHTML = notesOf(s);
  }
  function toggle() {
    if (!panel) build();
    panel.classList.toggle('open');
    render();
  }
  document.addEventListener('deck:change', () => {
    if (panel && panel.classList.contains('open')) render();
  });

  function print() {
    const title = document.title;
    const doc = document.createElement('div');
    doc.className = 'notes-doc';
    let html = '<h1>' + title + '</h1><p class="nd-sub">Speaker notes · ' + slides.length
             + ' slides · S on any slide shows its notes</p>';
    slides.forEach((s, idx) => {
      html += '<section class="nd-slide"><div class="nd-meta"><span>' + pad(idx + 1)
            + '</span><span>' + (s.dataset.section || '') + '</span></div>'
            + '<h2>' + titleOf(s) + '</h2><div class="nd-notes">' + notesOf(s) + '</div></section>';
    });
    doc.innerHTML = html;
    document.body.className = 'notes-mode';
    document.body.innerHTML = '';
    document.body.appendChild(doc);
    window.scrollTo(0, 0);
  }

  return { toggle, print, render };
})();
