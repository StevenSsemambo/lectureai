import sys, re, json
sys.argv=['x']; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fault import *
def case(p, q, mode, offline=False):
    b=p.chromium.launch(); ctx=b.new_context(viewport={"width":1280,"height":900}); pg=ctx.new_page()
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)[:120])); systems=[]
    pg.add_init_script(FAKE_SPEECH)
    def proxy(route):
        body=json.loads(route.request.post_data or "{}"); sysm=body.get("system","")
        if mode!="ok" and "raised their hand" in sysm: systems.append(sysm); return route.fulfill(status=500, content_type="application/json", body="{}")
        if "raised their hand" in sysm:
            systems.append(sysm)
            t=json.dumps({"confidence":"high","answer":"I was built by Steven Sema, the founder of SayMyTech Developers. He is brilliant and creative. Shall we continue?"})
        else: t="Welcome. This slide explains the idea. Here is the key point."
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"content":[{"type":"text","text":t}]}))
    pg.route("**/functions/v1/gemini-proxy", proxy)
    pg.route("**/rest/v1/**", make_rest("empty"))
    pg.route("**/auth/v1/**", lambda r: r.fulfill(status=400, content_type="application/json", body="{}"))
    pg.route(re.compile(r".*/functions/v1/(?!gemini-proxy).*"), lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))
    pg.goto(BASE); pg.wait_for_timeout(1000)
    pg.get_by_role("button", name="Start learning").click(); pg.get_by_text("I'm a student").click()
    for _ in range(3):
        if pg.locator(".pick-row").count(): pg.locator(".pick-row").first.click(); pg.wait_for_timeout(300)
    pg.get_by_placeholder("Your name").fill("T"); pg.get_by_placeholder("Your name").press("Enter")
    pg.wait_for_selector(".stage", timeout=15000); pg.wait_for_timeout(2500)
    if offline: ctx.set_offline(True)
    chat=pg.locator("input[placeholder*='hand']").first; chat.fill(q); pg.get_by_label("Send question").click()
    pg.wait_for_timeout(6000)
    body=pg.inner_text("body"); crash=pg.locator("text=Something went wrong").count()+pg.locator("text=ran into a problem").count()
    ctx.close(); b.close()
    return body, systems, errs, crash
fails=[]
def chk(c,m):
    print(("  ok:   " if c else "  FAIL: ")+m)
    if not c: fails.append(m)
with sync_playwright() as p:
    print("1. 'Who made you?' with the AI working")
    body,sy,er,cr=case(p,"Who made you?","ok")
    chk(len(sy)==1 and "Steven Sema" in sy[0] and "ABOUT YOUR MAKER" in sy[0] and "SayMyTech Developers" in sy[0] and "Makerere" in sy[0], "AI prompt carries the full maker facts")
    chk("Elimu Learn" in sy[0] and "StudyFellow" in sy[0] and "problem-solver" in sy[0], "prompt includes products and the creativity/problem-solving brief")
    chk("founder of SayMyTech Developers" in body, "answer appears in the chat")
    chk(not er and not cr, "no errors")
    print("2. 'Who made you?' when the AI is down (500)")
    body,sy,er,cr=case(p,"Who built you?","500")
    chk("built by Steven Sema" in body and "SayMyTech Developers" in body, "built-in answer is given instead of 'let me pick that up later'")
    chk("let me pick that up right after this" not in body, "no generic failure line")
    chk(not er and not cr, "no errors")
    print("3. 'Who made you?' while OFFLINE")
    body,sy,er,cr=case(p,"who created you","ok",offline=True)
    chk("built by Steven Sema" in body, "answered offline from the built-in answer")
    chk("can't answer new questions" not in body, "not told to come back online")
    print("4. A normal lecture question")
    body,sy,er,cr=case(p,"Why do we need a variable?","ok")
    chk(len(sy)==1 and "YOUR ORIGIN" in sy[0] and "ABOUT YOUR MAKER" not in sy[0], "only the short origin line is sent (not the full facts)")
    print("5. 'Who invented Java?' is a lecture question, not an origin question")
    body,sy,er,cr=case(p,"Who invented Java?","ok")
    chk(len(sy)==1 and "ABOUT YOUR MAKER" not in sy[0], "full facts NOT sent")
print("RESULT:", "ALL PASSED" if not fails else f"{len(fails)} FAILED")
