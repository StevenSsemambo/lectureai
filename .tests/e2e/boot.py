import sys, re
from playwright.sync_api import sync_playwright
BASE="http://127.0.0.1:4173/"
with sync_playwright() as p:
    b=p.chromium.launch()
    # 1. app script blocked -> plain message, not a blank page
    pg=b.new_page(); pg.route(re.compile(r".*/assets/app-.*\.js"), lambda r: r.abort("failed"))
    pg.goto(BASE); pg.wait_for_timeout(3000)
    t=pg.inner_text("body"); print("script blocked ->", "SEMAI is having trouble starting" in t, "| has Reload button:", pg.get_by_role("button", name="Reload").count()==1)
    pg.close()
    # 2. normal load -> message must NOT appear
    pg=b.new_page(); pg.route("**/rest/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body="[]")); pg.goto(BASE); pg.wait_for_timeout(17000)
    print("normal load shows trouble message:", "having trouble starting" in pg.inner_text("body"), "| app drawn:", pg.get_by_role("button", name="Start learning").count()==1)
    b.close()
