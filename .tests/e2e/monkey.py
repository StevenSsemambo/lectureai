import json, sys, re, time, random, base64, os
from playwright.sync_api import sync_playwright
BASE = os.environ.get("BASE", "http://127.0.0.1:4173/")
def jwt(exp):
    b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return f"{b({'alg':'HS256'})}.{b({'exp': exp, 'sub': 'u1'})}.sig"
SLIDES = [{"type": "concept", "title": "Intro", "bullets": ["one", "two"]},
          {"type": "code_walkthrough", "title": "Hello", "hasCode": True, "language": "java", "code": "public class A {\n  public static void main(String[] a) {\n    System.out.println(1);\n  }\n}"},
          {"type": "diagram", "title": "Flow", "diagram": {"code": "flowchart TD\n A-->B"}},
          {"type": "quiz_check", "title": "Check", "question": "2+2?", "options": ["3", "4"], "answer": 1}]
COURSE = {"id": "c1", "code": "TST1", "title": "Test", "institution": "U", "tone": "friendly", "voice_provider": "browser", "owner_id": "u1", "created_at": "2026-01-01"}
MODULE = {"id": "m1", "course_id": "c1", "unit": "Unit 1", "duration_minutes": 45, "pace": "standard", "allow_live_code": True, "slides": SLIDES, "created_at": "2026-01-01"}
FAKE_SPEECH = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "fault.py")).read().split('FAKE_SPEECH = """')[1].split('"""')[0]

def run(p, role, seconds, seed):
    rnd = random.Random(seed)
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": rnd.choice([390, 768, 1280]), "height": 860}); pg = ctx.new_page()
    errs, logged = [], []
    pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
    pg.on("dialog", lambda d: d.accept() if rnd.random() < .5 else d.dismiss())
    pg.add_init_script(FAKE_SPEECH)
    if role == "lecturer":
        sess = {"accessToken": jwt(int(time.time()) + 900), "refreshToken": "r1", "user": {"id": "u1", "email": "l@x.com"}}
        pg.add_init_script(f"localStorage.setItem('semai_lecturer_session', {json.dumps(json.dumps(sess))});")
    pg.route("**/auth/v1/token*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"access_token": jwt(int(time.time()) + 900), "refresh_token": "r2", "user": {"id": "u1", "email": "l@x.com"}})))
    def proxy(route):
        body = json.loads(route.request.post_data or "{}")
        mode = rnd.choice(["ok", "ok", "ok", "500", "html", "abort", "empty", "diagram"])
        qa = "raised their hand" in body.get("system", "")
        if mode == "abort": return route.abort("failed")
        if mode == "500": return route.fulfill(status=500, content_type="application/json", body="{}")
        if mode == "html": return route.fulfill(status=200, content_type="text/html", body="<html/>")
        if mode == "empty": return route.fulfill(status=200, content_type="application/json", body='{"content":[]}')
        if mode == "diagram" and qa:
            t = json.dumps({"confidence": "high", "answer": "Look at the diagram.", "visual": {"kind": rnd.choice(["diagram", "slide", "code", "highlight"]), "title": "T", "mermaid": rnd.choice(["flowchart TD\n A-->B", "bad ((( syntax"]), "bullets": ["x"], "code": "int a;\nint b;", "language": "c", "lines": [1, 2]}})
        else:
            t = json.dumps({"confidence": "high", "answer": "Because."}) if qa else "Here is the idea. It matters. Remember it."
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"content": [{"type": "text", "text": t}]}))
    pg.route("**/functions/v1/gemini-proxy", proxy)
    pg.route(re.compile(r".*/functions/v1/(?!gemini-proxy).*"), lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
    def rest(route):
        req = route.request; url = req.url
        if req.method == "POST" and "client_errors" in url:
            try: logged.append(json.loads(req.post_data or "{}"))
            except Exception: pass
            return route.fulfill(status=201, body="")
        if rnd.random() < .08: return route.fulfill(status=500, content_type="application/json", body='{"message":"x"}')
        if req.method != "GET": return route.fulfill(status=201, content_type="application/json", body="[]")
        if "/rest/v1/courses" in url: return route.fulfill(status=200, content_type="application/json", body=json.dumps([COURSE]))
        if "/rest/v1/modules" in url: return route.fulfill(status=200, content_type="application/json", body=json.dumps([MODULE]))
        return route.fulfill(status=200, content_type="application/json", body="[]")
    pg.route("**/rest/v1/**", rest)
    pg.goto(BASE); pg.wait_for_timeout(1000)
    try:
        pg.get_by_role("button", name="Start learning").click(timeout=6000)
        if role == "student":
            pg.get_by_text("I'm a student").click(timeout=6000)
            for _ in range(3):
                if pg.locator(".pick-row").count(): pg.locator(".pick-row").first.click(); pg.wait_for_timeout(300)
            pg.get_by_placeholder("Your name").fill("Monkey"); pg.get_by_placeholder("Your name").press("Enter")
        else:
            pg.get_by_text("I'm the lecturer").click(timeout=6000)
        pg.wait_for_timeout(2500)
    except Exception as e:
        errs.append("setup: " + str(e).splitlines()[0][:100])
    t0 = time.time(); actions = 0
    while time.time() - t0 < seconds:
        try:
            r = rnd.random()
            if r < .72:
                els = pg.locator("button:visible, [role=button]:visible, select:visible, summary:visible, .pick-row:visible").all()
                els = [e for e in els if "Leave" not in (e.inner_text() or "") and "Sign out" not in (e.inner_text() or "") and "Delete account" not in (e.inner_text() or "")]
                if els: rnd.choice(els).click(timeout=700, no_wait_after=True)
            elif r < .85:
                inp = pg.locator("input:visible, textarea:visible").all()
                if inp: rnd.choice(inp).fill(rnd.choice(["Why?", "", "a" * 3000, "<script>alert(1)</script>", "😀 ünï", "{\"x\":1}"]), timeout=700)
            else:
                pg.keyboard.press(rnd.choice(["Escape", "Space", "ArrowRight", "ArrowLeft", "Tab", "Enter"]))
            actions += 1
            pg.wait_for_timeout(rnd.choice([50, 150, 400]))
        except Exception:
            pass
        crashed = pg.locator("text=Something went wrong").count() or pg.locator("text=ran into a problem").count() or pg.locator("text=couldn’t be shown").count()
        if crashed: errs.append("BOUNDARY SHOWN: " + (pg.inner_text("body")[:0] or "") + str(pg.locator("[role=alert]").first.inner_text())[:100]); break
    blank = pg.evaluate("document.getElementById('root').innerText.trim().length === 0")
    ctx.close(); b.close()
    return actions, errs, logged, blank

if __name__ == "__main__":
    secs = int(sys.argv[1]) if len(sys.argv) > 1 else 40
    bad = False
    with sync_playwright() as p:
        for role, seed in [("student", 1), ("student", 2), ("lecturer", 3), ("lecturer", 4)]:
            actions, errs, logged, blank = run(p, role, secs, seed)
            good = not errs and not blank
            bad |= not good
            print(("PASS " if good else "FAIL ") + f"{role} seed={seed} actions={actions} blank={blank} errors={len(errs)} logged={len(logged)}")
            for e in errs[:3]: print("     ", e)
            kinds = {}
            for l in logged: kinds[l.get("kind")] = kinds.get(l.get("kind"), 0) + 1
            if kinds: print("      logged kinds:", kinds, [ (l.get("message") or "")[:80] for l in logged[:3]])
            sys.stdout.flush()
    print("MONKEY: ALL SURVIVED" if not bad else "MONKEY: PROBLEMS FOUND")
