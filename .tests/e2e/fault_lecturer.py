import json, sys, re, time, base64, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE", "http://127.0.0.1:4173/")

def jwt(exp):
    b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return f"{b({'alg':'HS256'})}.{b({'exp': exp, 'sub': 'u1'})}.sig"
GOOD_SLIDES = [{"type": "concept", "title": "Intro", "bullets": ["one", "two"]}, {"type": "diagram", "title": "Flow", "diagram": {"code": "flowchart TD\n A-->B"}}]
COURSE = {"id": "c1", "code": "TST1", "title": "Test course", "institution": "U", "tone": "friendly", "voice_provider": "browser", "owner_id": "u1", "created_at": "2026-01-01"}
MODULE = {"id": "m1", "course_id": "c1", "unit": "Unit 1", "duration_minutes": 45, "pace": "standard", "allow_live_code": True, "slides": GOOD_SLIDES, "created_at": "2026-01-01"}

GARBAGE = {
  "mixed": '[{}, null, 7, "str", {"id":null,"created_at":"bad","student_key":5,"event_type":null,"payload":"x","slide_index":"y","dwell_ms":"z","concept":{"a":1}}]',
  "object": '{"message":"not an array"}',
  "null": 'null',
  "weird_events": json.dumps([{"session_id": i % 3, "event_type": t, "payload": p, "slide_index": si, "dwell_ms": d, "concept": c, "student_key": k, "created_at": ca}
        for i, (t, p, si, d, c, k, ca) in enumerate([
          ("quiz_answer", None, None, None, None, None, None), ("quiz_answer", "str", "2", "abc", {"x": 1}, 5, "bad"),
          ("signal", {"value": None}, -1, -5, "", "", ""), ("slide_view", {"correct": "yes"}, 999999, 1e12, None, None, 1),
          (None, {}, 0, 0, "c", "k", "2026-01-01"), ("ai_answer", [], 1.5, "NaN", 7, [], {})])]),
  "500": "__500__",
}

def run(p, name, mode):
    browser = p.chromium.launch(); ctx = browser.new_context(viewport={"width": 1280, "height": 900}); page = ctx.new_page()
    errs = []; logged = []
    page.on("pageerror", lambda e: errs.append(str(e)[:150]))
    far = int(time.time()) + 900
    sess = {"accessToken": jwt(far), "refreshToken": "r1", "user": {"id": "u1", "email": "l@x.com"}}
    page.add_init_script(f"localStorage.setItem('semai_lecturer_session', {json.dumps(json.dumps(sess))});")
    def refresh(r): r.fulfill(status=200, content_type="application/json", body=json.dumps({"access_token": jwt(int(time.time()) + 900), "refresh_token": "r2", "user": {"id": "u1", "email": "l@x.com"}}))
    page.route("**/auth/v1/token*", refresh)
    page.route(re.compile(r".*/functions/v1/.*"), lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
    def rest(route):
        req = route.request; url = req.url
        if req.method == "POST" and "client_errors" in url:
            try: logged.append(json.loads(req.post_data or "{}"))
            except Exception: pass
            return route.fulfill(status=201, body="")
        if "/rest/v1/courses" in url and req.method == "GET": return route.fulfill(status=200, content_type="application/json", body=json.dumps([COURSE]))
        if "/rest/v1/modules" in url and req.method == "GET": return route.fulfill(status=200, content_type="application/json", body=json.dumps([MODULE]))
        if req.method in ("PATCH", "DELETE") or (req.method == "POST" and "/rpc/" not in url): return route.fulfill(status=201, content_type="application/json", body="[]")
        body = GARBAGE[mode]
        if body == "__500__": return route.fulfill(status=500, content_type="application/json", body='{"message":"boom"}')
        return route.fulfill(status=200, content_type="application/json", body=body)
    page.route("**/rest/v1/**", rest)
    state = "ok"
    try:
        page.goto(BASE, timeout=20000); page.wait_for_timeout(1000)
        page.get_by_role("button", name="Start learning").click(timeout=8000)
        page.get_by_text("I'm the lecturer").click(timeout=8000)
        page.wait_for_selector("[aria-label='View insights for TST1']", timeout=12000)
        page.get_by_label("View insights for TST1").click()
        page.wait_for_timeout(3500)
        # open every collapsible section and every session row that exists
        for _ in range(3):
            for h in page.locator(".collapse-head").all():
                try: h.click(timeout=800)
                except Exception: pass
            for h in page.locator(".session-row").all()[:5]:
                try: h.click(timeout=800)
                except Exception: pass
            page.wait_for_timeout(800)
    except Exception as e:
        state = "harness: " + str(e).splitlines()[0][:120]
    body = page.inner_text("body") if page.locator("body").count() else ""
    screen = ("This screen ran into a problem" in body) or ("Something went wrong" in body)
    panels = body.count("The rest of the page still works")
    ctx.close(); browser.close()
    return {"name": name, "screen_crash": screen, "panel_crashes": panels, "errors": errs, "state": state, "logged": logged}

if __name__ == "__main__":
    ok_all = True
    with sync_playwright() as p:
        for mode in GARBAGE:
            r = run(p, f"lecturer_{mode}", mode)
            good = (not r["screen_crash"]) and r["panel_crashes"] == 0 and not r["errors"] and r["state"] == "ok"
            ok_all &= good
            print(("PASS " if good else "FAIL ") + f"{r['name']:24s} screen_crash={r['screen_crash']} panel_crashes={r['panel_crashes']} state={r['state']}")
            for e in r["errors"][:3]: print("      pageerror:", e)
            for l in r["logged"][:4]: print("      logged:", l.get("kind"), "|", (l.get("message") or "")[:110], "|", (l.get("context") or {}).get("label"))
            sys.stdout.flush()
    print("ALL PASSED" if ok_all else "SOME FAILED")
