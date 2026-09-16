#!/usr/bin/env python3
"""
Local preview server for the deck.

Plain `python3 -m http.server` lets the browser heuristically cache
deck.js, charts.js and the stylesheets, so an edit does not show up on
reload and you end up debugging the previous version of your own code.
This sends no-store on everything instead.

    python3 serve.py [port]        default 4477
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # one line per request is enough; drop the timestamp noise
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4477
    print(f"Deck at http://localhost:{port}/deck/   ·   library at /library/")
    ThreadingHTTPServer(("", port), NoCache).serve_forever()
