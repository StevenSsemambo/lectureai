# Browser robustness tests (optional)

These drive a real Chromium with the AI and database mocked, and deliberately break things.
They are **not** part of `npm test` (they need Playwright), but are worth running before a release.

Setup (once): `pip install playwright && playwright install chromium`

```
npm run build
cd dist && python3 -m http.server 4173 --bind 127.0.0.1 &      # serve the built app
python3 .tests/e2e/fault.py            # ~45 injected failures: storage, AI, database, bad rows, offline...
python3 .tests/e2e/fault_lecturer.py   # lecturer dashboard with malformed database data
python3 .tests/e2e/monkey.py 40        # random clicks/typing with random AI + database failures
python3 .tests/e2e/boot.py             # the "trouble starting" fallback
python3 .tests/e2e/detour_e2e.py       # question detours (diagram boards)
```

Set `BASE=http://127.0.0.1:5173/` to test the dev server instead. Each script prints PASS/FAIL per scenario.
