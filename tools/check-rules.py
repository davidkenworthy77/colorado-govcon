#!/usr/bin/env python3
"""
Check the built deck against the companion document's hard rules.

These are content rules, not style preferences, and they are easy to break
with a one-word edit months from now. Run after any change to deck/index.html.

    python3 tools/check-rules.py
"""
import html
import pathlib
import re
import sys

DECK = pathlib.Path(__file__).resolve().parent.parent / "deck" / "index.html"

RULES = [
    ("em or en dash",        r"[—–]"),
    ("banned vocabulary",    r"\b(delve|leverage|robust|seamless|game.chang|"
                             r"transformative|harness|foster|underscore)\b"),
    ("research partner name", r"\b(SAM|Ski Area Management|Centium)\b"),
    ("horizon URL",          r"mmgyhorizon"),
]

def main() -> int:
    raw = DECK.read_text()
    # only the deck itself: the authoring comment above it names the rules and
    # would trip every one of them.
    body = raw[raw.index('<div class="deck-shell">'):]
    text = html.unescape(re.sub(r"<[^>]+>", " ", body))

    failed = False
    for name, pattern in RULES:
        hits = sorted(set(re.findall(pattern, text, re.I)))
        if hits:
            failed = True
            print(f"FAIL  {name}: {', '.join(map(str, hits))}")
        else:
            print(f"ok    {name}")

    slides = body.count('<section class="slide')
    notes = body.count('<aside class="notes">')
    print(f"\n{slides} slides, {notes} with speaker notes")
    if slides != notes:
        failed = True
        print("FAIL  every slide must keep its speaker notes")
    if not text.rstrip().endswith("full screen"):
        pass  # trailing chrome, not content

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
