/* ============================================================
   INTERACTIVE COMPONENTS
   Flip cards, image hotspots and tabs.

   All three are delegated from the document, so components added
   to a slide after load still work, and none of them need an id.

   Each swallows its own click. deck.js already skips advancing on
   `a, button, .flip, [data-no-advance]`, and every control here
   matches one of those — but the handlers stop propagation as well,
   because a hotspot inside a flip card would otherwise toggle both.
   ============================================================ */

(() => {
  "use strict";

  document.addEventListener("click", e => {

    /* ---- flip card ---- */
    const flip = e.target.closest(".flip");
    if (flip) {
      e.stopPropagation();
      flip.classList.toggle("is-flipped");
      return;
    }

    /* ---- hotspot ----
       One open at a time within an image: two cards over the same
       photo overlap and neither is readable. */
    const hot = e.target.closest(".hot");
    if (hot) {
      e.stopPropagation();
      const wrap = hot.closest(".hot-wrap") || document;
      const wasOpen = hot.classList.contains("is-open");
      wrap.querySelectorAll(".hot.is-open").forEach(h => h.classList.remove("is-open"));
      if (!wasOpen) hot.classList.add("is-open");
      return;
    }

    /* ---- tabs ---- */
    const tab = e.target.closest(".tabs__tab");
    if (tab) {
      e.stopPropagation();
      const tabs = tab.closest(".tabs");
      if (!tabs) return;
      const name = tab.dataset.tab;
      tabs.querySelectorAll(".tabs__tab").forEach(t => {
        const on = t === tab;
        t.classList.toggle("is-on", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
      });
      tabs.querySelectorAll(".tabs__panel").forEach(p => {
        const on = p.dataset.panel === name;
        p.classList.toggle("is-on", on);
        /* Redraw rather than refresh: the chart may already have been drawn
           while its panel was closed (the engine measures hidden figures so
           they survive into the PDF), and a plain refresh would skip it and
           show a static chart. Drawing again replays the animation. */
        if (on && window.DeckCharts) window.DeckCharts.render(p);
      });
      return;
    }

    /* A click anywhere else on the stage closes any open hotspot,
       then falls through to deck.js, which advances the slide. */
    document.querySelectorAll(".hot.is-open").forEach(h => h.classList.remove("is-open"));
  });

  /* Leaving a slide resets its interactive state, so coming back to it
     — or stepping back into it — shows the same thing the room saw
     first time rather than a card someone left flipped. */
  document.addEventListener("deck:change", () => {
    document.querySelectorAll(".slide:not(.active)").forEach(s => {
      s.querySelectorAll(".flip.is-flipped").forEach(f => f.classList.remove("is-flipped"));
      s.querySelectorAll(".hot.is-open").forEach(h => h.classList.remove("is-open"));
      const tabs = s.querySelectorAll(".tabs");
      tabs.forEach(t => {
        const first = t.querySelector(".tabs__tab");
        if (!first) return;
        t.querySelectorAll(".tabs__tab").forEach(x => x.classList.toggle("is-on", x === first));
        const name = first.dataset.tab;
        t.querySelectorAll(".tabs__panel").forEach(p => p.classList.toggle("is-on", p.dataset.panel === name));
      });
    });
  });

  /* Keyboard: tabs are real buttons, so they focus and fire on Enter
     already. This only adds left/right within a rail. */
  document.addEventListener("keydown", e => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const tab = document.activeElement?.closest?.(".tabs__tab");
    if (!tab) return;
    e.stopPropagation();
    e.preventDefault();
    const all = Array.from(tab.closest(".tabs").querySelectorAll(".tabs__tab"));
    const next = all[(all.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1) + all.length) % all.length];
    next.focus();
    next.click();
  }, true);   /* capture, so the deck's own arrow handler does not also fire */
})();
