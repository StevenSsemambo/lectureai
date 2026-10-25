import json, sys, re, time
from playwright.sync_api import sync_playwright

import os
BASE = os.environ.get("BASE", "http://127.0.0.1:4173/")
LOGGED = []
FAKE_SPEECH = """
(() => {
  const synth = { speaking:false, pending:false, paused:false, getVoices(){return []},
    speak(u){ setTimeout(()=>{u.onstart&&u.onstart({})},20); this._t=setTimeout(()=>{u.onend&&u.onend({})},500)},
    cancel(){clearTimeout(this._t)}, pause(){}, resume(){}, addEventListener(){}, removeEventListener(){} };
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  window.SpeechSynthesisUtterance=function(t){this.text=t};
})();
"""
QA_OK = {"confidence": "high", "answer": "Because the variable stores the value."}

def proxy_handler(mode):
    def h(route):
        body = json.loads(route.request.post_data or "{}")
        is_qa = "raised their hand" in body.get("system", "")
        if body.get("stream") and mode.startswith("stream_"):
            if mode == "stream_hang": return  # never answers the streaming request
            if mode == "stream_ok":
                ev = 'data: ' + json.dumps({"t": json.dumps(QA_OK)}) + '\n\n' + 'data: ' + json.dumps({"done": True, "provider": "mock", "model": "m", "serverMs": 5}) + '\n\n'
            elif mode == "stream_error": ev = 'data: ' + json.dumps({"error": True}) + '\n\n'
            else: ev = 'data: not json at all\n\ndata: {broken\n\n'
            return route.fulfill(status=200, content_type="text/event-stream", body=ev)
        md = "ok" if mode.startswith("stream_") else mode
        ok_text = json.dumps(QA_OK) if is_qa else "Welcome. This slide explains the idea. Here is the key point."
        if md == "ok":
            return route.fulfill(status=200, content_type="application/json", body=json.dumps({"content":[{"type":"text","text":ok_text}],"provider":"mock","model":"m"}))
        if md == "500": return route.fulfill(status=500, content_type="application/json", body='{"error":"boom"}')
        if md == "429": return route.fulfill(status=429, content_type="application/json", body='{"error":"rate limited"}')
        if md == "html200": return route.fulfill(status=200, content_type="text/html", body="<html><body>Gateway</body></html>")
        if md == "emptycontent": return route.fulfill(status=200, content_type="application/json", body='{"content":[]}')
        if md == "nullcontent": return route.fulfill(status=200, content_type="application/json", body='{"content":null}')
        if md == "badjson": return route.fulfill(status=200, content_type="application/json", body='{"content":[{"type":"text","text":')
        if md == "emptybody": return route.fulfill(status=200, content_type="application/json", body='')
        if md == "abort": return route.abort("failed")
        if md == "hang": return  # never answers
        if md == "weirdtypes": return route.fulfill(status=200, content_type="application/json", body=json.dumps({"content":[{"type":"text","text":12345}]}))
    return h

def make_rest(mode):
    def h(route):
        m = route.request.method
        if m == "POST" and "client_errors" in route.request.url:
            try: LOGGED.append(json.loads(route.request.post_data or "{}"))
            except Exception: pass
        if m != "GET": return route.fulfill(status=201, content_type="application/json", body="[]")
        url = route.request.url
        if mode == "empty": return route.fulfill(status=200, content_type="application/json", body="[]")
        if mode == "500": return route.fulfill(status=500, content_type="application/json", body='{"message":"db down"}')
        if mode == "html": return route.fulfill(status=200, content_type="text/html", body="<html>oops</html>")
        if mode == "object": return route.fulfill(status=200, content_type="application/json", body='{"message":"not an array"}')
        if mode == "null": return route.fulfill(status=200, content_type="application/json", body="null")
        if mode == "abort": return route.abort("failed")
        if mode == "badcourse":
            if "/courses" in url:
                return route.fulfill(status=200, content_type="application/json", body=json.dumps([{"id":"c1","code":None,"title":None,"tone":None,"created_at":"x"},{"id":None},{"id":"c2","code":"X","title":"Weird","modules":"nope"}]))
            if "/modules" in url:
                return route.fulfill(status=200, content_type="application/json", body=json.dumps([
                    {"id":"m1","course_id":"c1","unit":None,"slides":None,"created_at":"bad"},
                    {"id":"m2","course_id":"c1","unit":"Unit","slides":"not-an-array","created_at":None},
                    {"id":"m3","course_id":"c2","unit":"Slides full of junk","duration_minutes":"abc","pace":None,"slides":[None,1,"x",[],{"type":"nonsense"},{"type":"concept"},{"type":"code_walkthrough","hasCode":True},{"type":"diagram","diagram":{}},{"title":{"a":1},"bullets":"str"}],"created_at":"2026-01-01"},
                    {"id":"m4","course_id":"c2","unit":"Empty slides","slides":[],"created_at":"2026-01-01"}]))
        return route.fulfill(status=200, content_type="application/json", body="[]")
    return h

def run(p, name, proxy="ok", rest="empty", init=None, block=None, offline_after=False, pick=None, act=None, ask=True, wait_room=True):
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)[:160]))
    page.add_init_script(FAKE_SPEECH if "nospeech" not in (init or "") else "")
    if init and init != "nospeech": page.add_init_script(init)
    if init == "nospeech":
        page.add_init_script("delete window.speechSynthesis; delete window.SpeechSynthesisUtterance;")
    page.route("**/functions/v1/gemini-proxy", proxy_handler(proxy))
    page.route("**/rest/v1/**", make_rest(rest))
    page.route("**/auth/v1/**", lambda r: r.fulfill(status=400, content_type="application/json", body="{}"))
    page.route(re.compile(r".*/functions/v1/(?!gemini-proxy).*"), lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
    if block:
        page.route(re.compile(block), lambda r: r.abort("failed"))
    status = {"room": False}
    try:
        page.goto(BASE, timeout=20000)
        page.wait_for_timeout(1200)
        if page.get_by_role("button", name="Start learning").count():
            page.get_by_role("button", name="Start learning").click(timeout=8000)
        page.get_by_text("I'm a student").click(timeout=8000)
        if isinstance(pick, tuple):
            for txt in pick:
                page.locator(".pick-row", has_text=txt).first.click(timeout=8000); page.wait_for_timeout(300)
        else:
          for _ in range(3):
            rows = page.locator(".pick-row")
            if rows.count():
                (rows.nth(pick) if isinstance(pick, int) else rows.first).click()
                page.wait_for_timeout(300)
        page.get_by_placeholder("Your name").fill("Tester")
        page.get_by_placeholder("Your name").press("Enter")
        if wait_room:
            try:
                page.locator(".stage").or_(page.get_by_text("has no slides yet")).first.wait_for(timeout=15000)
                status["room"] = page.locator(".stage").count() > 0
                status["empty_msg"] = page.locator("text=has no slides yet").count() > 0
            except Exception:
                pass
        page.wait_for_timeout(2500)
        if status["room"] and ask:
            chat = page.locator("input[placeholder*='hand']").first
            if chat.count():
                chat.fill("Why do we need a variable?")
                page.get_by_label("Send question").click()
                page.wait_for_timeout(4000)
        if status["room"] and act: act(page)
        if status["room"]:
            for lbl in ["Next", "Next", "Prev"]:
                b = page.get_by_role("button", name=lbl, exact=True)
                if b.count() and b.first.is_enabled(): b.first.click(); page.wait_for_timeout(400)
        if offline_after: ctx.set_offline(True); page.wait_for_timeout(500)
    except Exception as e:
        errs.append("harness: " + str(e).splitlines()[0][:140])
    try: answered = "Because the variable stores the value" in page.inner_text("body")
    except Exception: answered = None
    crash = page.locator("text=Something went wrong").count() > 0
    try: root_empty = page.evaluate("document.getElementById('root').innerText.trim().length === 0")
    except Exception: root_empty = None
    ctx.close(); browser.close()
    bad = [e for e in errs if not e.startswith("harness")]
    ok = (not crash) and (not root_empty) and (not bad)
    return {"answered": answered, "empty_msg": status.get("empty_msg"), "name": name, "ok": ok, "crash_screen": crash, "blank": root_empty, "room": status["room"], "errors": errs}

SCENARIOS = {
  "baseline": dict(),
  # corrupt / hostile storage
  "storage_garbage": dict(init="""(()=>{for (const k of ['semai_lecturer_session','semai_student_session','semai_adapt','semai_research_consent','semai_share_lecturer','semai_voice_prefs','semai_style_prefs','semai_offline_queue','semai_detours']) localStorage.setItem(k,'{not json');})()"""),
  "storage_wrongtypes": dict(init="""(()=>{for (const k of ['semai_lecturer_session','semai_student_session','semai_voice_prefs','semai_style_prefs','semai_offline_queue']) localStorage.setItem(k, JSON.stringify([1,{a:null},"x"]));})()"""),
  "storage_session_noshape": dict(init="""(()=>{localStorage.setItem('semai_lecturer_session', JSON.stringify({user:null,refreshToken:5})); localStorage.setItem('semai_student_session', JSON.stringify(123));})()"""),
  "storage_blocked": dict(init="""Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}}); Object.defineProperty(window,'sessionStorage',{get(){throw new DOMException('denied','SecurityError')}});"""),
  "storage_full": dict(init="""Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')};"""),
  "indexeddb_missing": dict(init="""delete window.indexedDB; """),
  "indexeddb_throws": dict(init="""window.indexedDB.open=function(){throw new Error('idb blocked')};"""),
  # AI proxy failure modes
  "ai_500": dict(proxy="500"), "ai_429": dict(proxy="429"), "ai_html200": dict(proxy="html200"),
  "ai_emptycontent": dict(proxy="emptycontent"), "ai_nullcontent": dict(proxy="nullcontent"),
  "ai_badjson": dict(proxy="badjson"), "ai_emptybody": dict(proxy="emptybody"), "ai_abort": dict(proxy="abort"),
  "ai_weirdtypes": dict(proxy="weirdtypes"),
  # database failure modes
  "db_500": dict(rest="500"), "db_html": dict(rest="html"), "db_object": dict(rest="object"), "db_null": dict(rest="null"), "db_abort": dict(rest="abort"),
  "badrows_empty_module": dict(rest="badcourse", pick=("—", "Untitled")),
  "badrows_string_slides": dict(rest="badcourse", pick=("—", "Unit")),
  "badrows_junk_slides": dict(rest="badcourse", pick=("Weird", "junk")),
  "badrows_empty_slides": dict(rest="badcourse", pick=("Weird", "Empty")),
  "stream_ok": dict(proxy="stream_ok"), "stream_error": dict(proxy="stream_error"), "stream_garbage": dict(proxy="stream_garbage"),
  # missing browser features
  "no_speech_api": dict(init="nospeech"),
  "no_audio_ctx": dict(init="""delete window.AudioContext; delete window.webkitAudioContext; window.Audio=undefined;"""),
  "no_fetch_streams": dict(init="""delete window.ReadableStream;"""),
  # chunks that fail to load
  "chunk_mermaid_blocked": dict(block=r".*/assets/(mermaid|cytoscape|flowchart|sequence|katex|jspdf|chunk-).*\.js"),
  # offline
  "offline_after_load": dict(offline_after=True),
}
if __name__ == "__main__":
    only = sys.argv[1:] 
    results = []
    with sync_playwright() as p:
        for name, kw in SCENARIOS.items():
            if only and name not in only and not any(name.startswith(o) for o in only): continue
            t = time.time()
            r = run(p, name, **kw)
            results.append(r)
            flag = "PASS" if r["ok"] else "FAIL"
            print(f"{flag}  {name:26s} answered={r.get('answered')!s:5} room={r['room']!s:5} crash={r['crash_screen']!s:5} blank={r['blank']!s:5} ({time.time()-t:.0f}s)")
            while LOGGED:
                le = LOGGED.pop(0)
                print("   logged:", le.get("kind"), "|", (le.get("message") or "")[:140], "|", ((le.get("stack") or "").split("\n")[1:3]))
                cs = (le.get("context") or {}).get("componentStack")
                if cs: print("   component stack:", " > ".join(x.strip() for x in cs.strip().split("\n")[:4]))
            if not r["ok"] or r["errors"]:
                for e in r["errors"][:4]: print("        ", e)
            sys.stdout.flush()
    bad = [r for r in results if not r["ok"]]
    print(f"\n{len(results)-len(bad)}/{len(results)} passed")
