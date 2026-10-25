import json, sys, time
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173/"
GOOD_DIAGRAM = {"confidence": "high", "answer": "Sure. Look at the diagram: the loop starts, checks the condition, runs the body, then repeats.",
                "visual": {"kind": "diagram", "title": "How a loop flows", "mermaid": "flowchart TD\n  A[\"Start\"] --> B[\"Check condition\"]\n  B --> C[\"Run body\"]\n  C --> B", "caption": "loop flow"}}
BAD_DIAGRAM = {"confidence": "high", "answer": "A loop repeats a block of code while a condition holds.",
               "visual": {"kind": "diagram", "title": "Broken", "mermaid": "flowchart TD\n  A[[[ --> ((( B"}}
PLAIN = {"confidence": "high", "answer": "Because the variable stores the value."}
HIGHLIGHT = {"confidence": "high", "answer": "These lines declare the variable.", "visual": {"kind": "highlight", "lines": [1, 2]}}

FAKE_SPEECH = """
(() => {
  const synth = {
    speaking: false, pending: false, paused: false,
    getVoices() { return []; },
    speak(u) { this.speaking = true; setTimeout(() => { u.onstart && u.onstart({}); }, 20);
      this._t = setTimeout(() => { this.speaking = false; u.onend && u.onend({}); }, 700); },
    cancel() { clearTimeout(this._t); this.speaking = false; },
    pause() {}, resume() {}, addEventListener() {}, removeEventListener() {},
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
})();
"""

def run_case(p, name, qa_reply, ask="Can you draw how a loop works?", kill=False, check=None):
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    errors, qa_systems = [], []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: errors.append("console.error: " + m.text) if m.type == "error" and "Failed to load resource" not in m.text and "ERR_" not in m.text else None)
    page.add_init_script(FAKE_SPEECH)
    if kill:
        page.add_init_script("localStorage.setItem('semai_detours','off')")

    def proxy(route):
        body = json.loads(route.request.post_data or "{}")
        system = body.get("system", "")
        if "raised their hand" in system:
            qa_systems.append(system)
            if qa_reply == "RAW_TRUNCATED":
                text = '{"confidence":"high","answer":"A loop repeats work.","visual":{"kind":"diagram","title":"x","mermaid":"flowchart TD\\n A[\\"St'
            else:
                text = json.dumps(qa_reply)
        else:
            text = "Welcome. Let us look at this together. This slide explains the idea step by step. Here is the key point."
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"content": [{"type": "text", "text": text}], "provider": "mock", "model": "mock"}))
    page.route("**/functions/v1/gemini-proxy", proxy)
    page.route("**/rest/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="[]"))
    page.route("**/auth/v1/**", lambda r: r.fulfill(status=400, content_type="application/json", body="{}"))
    page.route("**/functions/v1/!(gemini-proxy)", lambda r: r.fulfill(status=200, content_type="application/json", body="{}"))

    page.goto(BASE)
    page.get_by_role("button", name="Start learning").click(timeout=10000)
    page.get_by_text("I'm a student").click(timeout=8000)
    # pick the demo course / module if a list is shown
    for _ in range(2):
        rows = page.locator(".pick-row")
        if rows.count():
            rows.first.click()
    page.get_by_placeholder("Your name").fill("Tester")
    page.get_by_placeholder("Your name").press("Enter")
    page.wait_for_selector(".stage", timeout=15000)
    # let the lecture start talking
    page.wait_for_timeout(2500)
    title_before = page.locator(".stage .slide h2, .stage .ide .sk-ide-name").first.inner_text()

    box = page.locator("input[aria-label], textarea").filter(has=page.locator("xpath=.")).first
    chat = page.locator(".chat-input input, input[placeholder*='uestion'], input[placeholder*='sk']").first
    chat.fill(ask)
    page.get_by_label("Send question").click()
    result = {"name": name, "errors": errors, "qa_systems": qa_systems, "title_before": title_before}
    if check:
        check(page, result)
    ctx.close(); browser.close()
    return result

failures = []
def expect(cond, msg):
    if not cond: failures.append(msg); print("  FAIL:", msg)
    else: print("  ok:", msg)

with sync_playwright() as p:
    # 1. good diagram -> board appears, lecturer talks, board auto-returns, same slide afterwards
    print("1. diagram detour: appears, then returns to the same slide")
    def c1(page, r):
        page.wait_for_selector(".detour", timeout=15000)
        expect(page.locator(".stage.detouring").count() == 1, "stage marked as detouring")
        expect(page.locator(".detour-tag").inner_text().startswith("✎"), "banner shown")
        expect("How a loop flows" in page.locator(".detour").inner_text(), "diagram title visible")
        expect(page.locator(".stage > .slide, .stage > .ide").count() >= 1, "lecture slide still mounted underneath")
        expect(not page.locator(".stage > .slide, .stage > .ide").first.is_visible(), "lecture slide hidden while board is up")
        page.wait_for_selector(".detour svg", timeout=15000)
        expect(True, "mermaid diagram actually rendered an <svg>")
        page.wait_for_selector(".detour", state="detached", timeout=20000)
        expect(page.locator(".stage.detouring").count() == 0, "board gone, stage back to normal")
        expect(page.locator(".stage .slide h2, .stage .ide .sk-ide-name").first.inner_text() == r["title_before"], "same slide/file shown after returning")
        expect(any("OPTIONAL ON-SCREEN VISUAL" in s for s in r["qa_systems"]), "visual instructions were sent to the AI")
    r = run_case(p, "diagram", GOOD_DIAGRAM, check=c1)
    expect(not r["errors"], "no page errors: " + str(r["errors"][:2]))

    # 2. Back button closes at once
    print("2. Back to lecture closes the board immediately")
    def c2(page, r):
        page.wait_for_selector(".detour", timeout=15000)
        page.get_by_role("button", name="Back to lecture").click()
        expect(page.locator(".detour").count() == 0, "board closed by Back")
    r = run_case(p, "back", GOOD_DIAGRAM, check=c2)
    expect(not r["errors"], "no page errors: " + str(r["errors"][:2]))

    # 3. Escape closes
    print("3. Escape closes the board")
    def c3(page, r):
        page.wait_for_selector(".detour", timeout=15000)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        expect(page.locator(".detour").count() == 0, "board closed by Escape")
    r = run_case(p, "escape", GOOD_DIAGRAM, check=c3)

    # 4. Keep open pins it past the auto-return time
    print("4. Keep open stops the auto-return")
    def c4(page, r):
        page.wait_for_selector(".detour", timeout=15000)
        page.get_by_role("button", name="Keep open").click()
        page.wait_for_timeout(9000)
        expect(page.locator(".detour").count() == 1, "pinned board still up after 9s")
        expect(page.get_by_role("button", name="Auto-return").count() == 1, "button now says Auto-return")
        page.get_by_role("button", name="Back to lecture").click()
        expect(page.locator(".detour").count() == 0, "Back still works while pinned")
    run_case(p, "pin", GOOD_DIAGRAM, check=c4)

    # 5. invalid diagram -> no board, answer is still spoken, nothing broken on screen
    print("5. invalid diagram: no board, answer still given")
    def c5(page, r):
        page.wait_for_timeout(9000)
        expect(page.locator(".detour").count() == 0, "no board shown for an invalid diagram")
        expect("A loop repeats a block of code" in page.locator("body").inner_text(), "the spoken answer still appears in the transcript")
    r = run_case(p, "bad", BAD_DIAGRAM, check=c5)
    expect(not r["errors"], "no page errors: " + str(r["errors"][:2]))

    # 6. plain answer -> exactly the old behaviour
    print("6. plain answer: no board")
    def c6(page, r):
        page.wait_for_timeout(4000)
        expect(page.locator(".detour").count() == 0, "no board for a plain answer")
        expect("Because the variable stores the value" in page.locator("body").inner_text(), "answer in transcript")
    run_case(p, "plain", PLAIN, ask="Why do we need a variable?", check=c6)

    # 7. truncated JSON must never be spoken/printed raw
    print("7. truncated AI reply: never shows raw JSON")
    def c7(page, r):
        page.wait_for_timeout(5000)
        body = page.locator("body").inner_text()
        expect('{"confidence"' not in body and '"mermaid"' not in body, "no raw JSON on screen")
        expect("A loop repeats work." in body, "answer rescued from truncated JSON")
        expect(page.locator(".detour").count() == 0, "no board from truncated reply")
    run_case(p, "trunc", "RAW_TRUNCATED", check=c7)

    # 8. kill switch
    print("8. kill switch: behaves exactly like before")
    def c8(page, r):
        page.wait_for_timeout(5000)
        expect(page.locator(".detour").count() == 0, "no board when disabled")
        expect(r["qa_systems"] and not any("OPTIONAL ON-SCREEN VISUAL" in s for s in r["qa_systems"]), "AI prompt unchanged when disabled")
    run_case(p, "kill", GOOD_DIAGRAM, kill=True, check=c8)

print("\nRESULT:", "ALL PASSED" if not failures else f"{len(failures)} FAILED: {failures}")
sys.exit(1 if failures else 0)
