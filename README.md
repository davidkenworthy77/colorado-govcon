# Marketing to Your Most Important Ambassador: AI

David Kenworthy, MMGY. Colorado Governor's Tourism Conference, Breckenridge,
September 2026. A 35 minute talk, 23 slides, no Q&A.

A digital deck, built as code. Full screen at 16:9, animates as you click, works
as a shared link, exports to PDF. No build step, no framework, no network at
presentation time — fonts, logos and photography are all local, so it runs from
a laptop with the wifi off.

## Open it

```bash
python3 serve.py
```

Then <http://localhost:4477/> — the launcher links to both:

| | |
|---|---|
| **`deck/`** | the talk, 23 slides |
| **`deck/archive.html`** | slides taken out of the talk, still working |
| **`library/`** | every layout, component and chart, live. **Start here when building.** |

You can also open `deck/index.html` straight from Finder. The one thing that
needs the server is the PDF export.

`serve.py` exists because plain `python3 -m http.server` lets the browser cache
`deck.js` and the stylesheets, and you end up debugging the previous version of
your own code. It sends `no-store` on everything.

## Present it

| Key | Does |
|---|---|
| **→** / space / click right of centre | Next beat, then next slide |
| **←** / click left of centre | Back one beat, then back one slide |
| **↓** / **↑** | Next / previous slide, skipping the build |
| **N** / click the slide counter | Slide index. Arrows move, Enter jumps, N or Esc closes |
| **S** | Speaker notes for the current slide, as an overlay |
| **P** | The whole deck as one printable notes document. Reload to return |
| **F** | Full screen |
| Home / End | First / last slide |

Press **F** before the room fills.

The slide number lives in the URL hash (`#12`), so a refresh or a pasted link
lands on the slide you were on.

**On a slide with a build, → advances the build before it changes slide.** ↓ is
the escape hatch when a question drags you somewhere else. Stepping backwards
into a slide opens it fully built, so you never replay a beat the room has
already seen.

## The talk

Built from `ambassador-deck-wireframe.pptx` (content and order) and
`ambassador-deck-companion.md` (context, data and rules). Speaker notes are
verbatim from the wireframe; press **S** to read them, **P**
to print the whole talk track.

Six beats, matching the companion's narrative spine:

| Slides | Block |
|---|---|
| 1 | Open |
| 2 to 8 | The ambassador you didn't hire |
| 9 to 18 | Part 1, how it decides |
| 19 to 24 | What it says about Colorado |
| 25 to 26 | Part 2, how we measure |
| 27 to 32 | Part 3, how we win |

Ten native charts, click-through builds (5, 10, 11, 12, 16, 17, 28, 32), numbers that count
up on arrival. Nothing is an image of a chart.

On a build slide the engine adds a small progress indicator just above the
conference lockup, bottom right. No markup needed: any slide with `data-steps`
gets one.

The vendors' own logos sit wherever a platform is named (`brand/logos/llm/`),
as `.llm-icon` inline or `.llm-chip` with the name. They keep their own colours
and are never recoloured to the brand palette; the two monochrome marks get
`.llm-icon-mono` so they knock out to white on dark grounds.

### House rules, enforced

The companion's hard rules are checked mechanically against the built deck, on
both on-screen text and speaker notes:

- no em dashes or en dashes anywhere (arrows are data notation and stay)
- no research partner or trade publication names
- no `mmgyhorizon.ai` URL
- none of the banned AI-writing vocabulary

To re-run the check after an edit:

```bash
python3 tools/check-rules.py
```

### Before this ships

One thing left to settle, repeated at the top of `deck/index.html`:

1. **Slide 3** adoption curve is external and unverified. The two usage
   figures are sourced (OpenAI, June 2026; Google, August 2026).

## Where things came from

Three sources, deliberately:

- **The engine** — the 16:9 stage, HUD, navigator, speaker notes, deep links and
  print rules — is the [selling-summer](https://github.com/CentiumAI/selling-summer-deck)
  engine. Its good idea is that the stage is a CSS container, so every size is
  in `cqw`/`cqh` and type scales with the stage deterministically. No resize
  listener, no fit-box arithmetic, and the PDF renders identically to the screen.
- **The motion and chart layers** come from [mmgy-slides-deck](https://github.com/davidkenworthy77/mmgy-slides-deck):
  the `.fx` entrance vocabulary, the `data-step` click-through builds, and the
  dependency-free SVG charts. Its platform parts — the deck registry, share
  gating, the multi-deck index — are deliberately **not** here. This is one deck.
- **The styling** is read out of `2026_GovernorsConference_Deck Template.pptx`,
  from the slide and layout XML rather than guessed. See `brand/colorado.css`,
  which lists every colour with the number of times the template uses it.

The template supplies nine colours, three typefaces and five real layouts —
title, speakers, headline-and-bullets, separator, thank you — with no charts,
no data components and no motion. Everything past that point in
`brand/components.css` is new, built from the template's own vocabulary: the
sand panel, the tracked all-caps subhead, the hard edges, gold as the single
accent.

## Files

```
index.html            launcher
deck/index.html       THE DECK — one file, one <section class="slide"> per slide
deck/archive.html     parked slides, same engine; copy a <section> back to restore it
library/index.html    the pattern catalogue, 41 slides. Every pattern, live.

engine/               presentation chrome. Brand-agnostic, no colours in here.
  deck.css              stage, HUD, navigator, type scale, motion, print
  deck.js               navigation, build steps, count-ups, notes
  charts.css            chart type and motion
  charts.js             17 SVG chart types, no dependencies
  interactive.js        flip cards, hotspots, tabs

brand/                the Colorado layer. Every colour lives here.
  colorado.css          tokens, grounds, logo marks
  components.css       layouts (l-*) and components
  fonts/                Bebas Neue, Inter, Roboto Slab — self-hosted
  logos/                Governor's Conference (stacked, and horizontal in grey
                        and white), MMGY, CTO, CO150 badge
deck/img/sep/         ten separator photos, cropped to the template's framing
deck/img/aside/       five half-slide photos for the aside layouts

tools/export-pdf.sh   one 16:9 PDF page per slide, via headless Chrome
serve.py              local preview, no-cache
```

## Build a slide

1. Open `library/` and find the pattern you want. The tag in the top-left
   corner of each slide names the classes it uses.
2. Copy that `<section class="slide …">` block into `deck/index.html`.
3. Replace the copy. Delete the `lib-tag` div.
4. Set `data-section` (groups slides in the HUD) and `data-title` (names the
   slide in the N navigator and in the notes).

Rules that are worth keeping:

- **Body copy never below `2.0cqh`.** A deck is read across a room. If something
  does not fit, cut words — or trim padding — rather than shrinking type.
- **Never invent a statistic.** Delete the slide instead.
- **Never write a hex value outside `brand/colorado.css`.** Derive tints with
  `color-mix()` on a token, or use `currentColor`.
- **Do not set `position: relative` on a `.slide` root.** The engine positions
  slides; overriding it stacks the deck vertically down the page, and the
  failure is invisible in the PDF.

### Template layouts

Two follow-up files from the conference define the template's own content
voice, and the layouts built from them are the ones to reach for first:

| Layout | Source | What it is |
|---|---|---|
| `l-sep` | separator slides.pptx | Full-bleed photo, charcoal tab off the left edge, white lockup bottom-right |
| `l-simple` | Simple slides.pptx | Sand ground, headline, subhead, bullets or paragraph |
| `l-aside` | Simple slides.pptx | The same, with a photo filling the right half |
| `l-aside-left` | new | Mirrored — photo left |
| `l-aside` + `.aside-stat` | new | A big number in place of the bullets |
| `l-simple` + `.t-cols-2` | new | Two columns of bullets |
| `l-simple` + a chart | new | Any chart type in the template frame |
| `l-simple` + `.photo-strip` | new | Three photos with captions |

Their type is **not** the same as the layouts above: a Helvetica Neue Bold
headline in sentence case with a light all-caps subhead *under* it
(`.t-head`, `.t-sub`), rather than a Bebas headline with an eyebrow over it.

**Separators.** The tab sizes to its title — 39% wide at minimum, as in the
template, growing to 70% and then wrapping onto a balanced second line. Add
`.sep-tab-sm` for a title that would need three. `<span class="sep-kicker">`
puts an optional section number over the title. Ten photos ship in
`deck/img/sep/`; library slide 6 shows them all as miniature separators.

**The footer lockup.** Every slide in both files carries the horizontal
conference lockup bottom-right — `<img class="foot-mark">`, using
`govconf-h.png` on sand and `govconf-h-white.png` on photography. Because it
owns that corner, the presenter HUD now sits entirely bottom-left.

**`data-hud` on a slide** controls the HUD over it: `light` for photo slides,
where grey type disappears, or `off` to hide it.

### Grounds

A slide picks one: `.g-sand`, `.g-parchment`, `.g-navy`, `.g-mountain`,
`.g-gold`, `.g-red`, `.g-ink`, or nothing for white. The ground re-maps `--ink`,
`--hairline` and the chart ramp for everything inside it, which is why one card,
one table and one chart work on all eight without a per-slide override.

### Motion

`.fx` animates an element when its slide arrives. Stagger siblings with
`.fx-1` … `.fx-12`, or put `.fx-auto` on the container and let it count.
Pick the motion with `.fx--left`, `--right`, `--down`, `--in`, `--scale`,
`--wipe`, `--wipe-up`, `--wipe-dn`, `--grow-x`, `--grow-y`, `--draw`, `--bleed`.

The rule underneath: **the visible state is the base style**. Animations run
*from* hidden, never *to* it, so print, reduced-motion and a failed script all
show finished content.

### Builds

```html
<section class="slide …" data-steps>
  <h2>Always visible</h2>
  <div data-step>Revealed on click 1</div>
  <div data-step class="fx--left">Revealed on click 2</div>
  <div data-step="2">Also click 2 — same number groups elements</div>
  <p data-step-until="2">Retires once step 2 arrives</p>
  <li data-step-dim>Greys back as the build moves on</li>
  <div class="build-ticks"></div>   <!-- optional progress ticks -->
</section>
```

Bare `data-step` auto-numbers in DOM order; an explicit `data-step="N"` pins the
beat and resets the counter, so you can interleave the two freely. In print,
every step is fully built.

### Charts

```html
<figure class="chart" data-chart="column" style="height:56cqh">
  <script type="application/json">
    {"categories":["Q1","Q2","Q3","Q4"],
     "series":[{"name":"Visitation","data":[42,55,61,78]}],
     "suffix":"%"}
  </script>
</figure>
```

Seventeen types: `column` `bar` `stacked` `line` `area` `slope` `scatter`
`donut` `gauge` `progress` `funnel` `waffle` `pictogram` `gantt` `dumbbell`
`heatmap` `sparkline`. All are demonstrated in the library.

**Give the figure a height** — in a flex or grid child an SVG will otherwise
collapse to nothing and the chart will silently skip its draw.

Charts render into a 1000-unit-wide viewBox measured from the figure's own box,
so they scale exactly as the rest of the slide does and print identically.

Series colours are tints of the brand, never new hues: slot 1 is gold — the
hero, where the number the room should remember goes — then mountain blue, red,
and two slots of `currentColor`. `currentColor` is what lets one chart sit on
paper, sand, navy or gold with no override. If you need a sixth series, the
slide is doing too much: split it.

`tone` lets a series claim a ramp slot out of order, so a good/better/best chart
can escalate to gold on the *last* series instead of shouting on the first.
`highlight: n` on a bar or progress chart makes one row the hero and mutes the
rest.

Entities are not decoded inside a `<script type="application/json">` block —
write `&`, not `&amp;`, or it will render literally.

### Speaker notes

Put an `<aside class="notes">` at the bottom of any slide. It never shows on
stage. **S** opens it as an overlay; **P** rebuilds the page as a printable
document of the whole talk track. Use `<span class="cue">Label</span>` for a
section cue.

## PDF

```bash
./tools/export-pdf.sh
```

Writes `deck/deck.pdf` — one 16:9 page per slide. Arrival animations are frozen
in their finished state, builds are fully built, flip cards print their front
face only, tab panels all print, and the presentation chrome is dropped. PDFs
are gitignored; rebuild after edits.

`./tools/export-pdf.sh library` does the same for the pattern library.

## Known edges

- The Colorado "C" bullet and the mountain `.ridge` are drawn in CSS, not
  assets — they tint with `currentColor` and print cleanly, but they are
  approximations of the flag mark, not the official logo. Use the real lockup
  in `brand/logos/` anywhere the mark needs to be exact.
- Photography in `deck/img/photo/` is lifted from the first template for
  layout purposes. **Confirm rights before presenting.** The separator and
  aside photos came from the conference's own follow-up files, so they are
  presumably cleared — but worth the same check.
- Separator and aside photos are pre-cropped to exactly the framing the
  template used. A replacement photo is cover-fitted, so check where it
  lands — especially under the white lockup, which has a faint shade behind
  it for exactly that reason.
- Body font is Helvetica Neue where it exists (macOS) and self-hosted Inter
  everywhere else. They are close enough that line breaks hold, but check the
  cover and any tight headline on the machine you will present from.
