"""Executed against the patched vvvsrx/get_jobs candidate before promotion.

No external browser, network or recruiting account is used by this contract test.
"""
import asyncio
import os
import sys
from types import ModuleType, SimpleNamespace
from urllib.parse import parse_qs, urlsplit

assert len(sys.argv) == 2, "Usage: test-get-jobs-native-filters.py <candidate-root>"
sys.path.insert(0, sys.argv[1])

from app.worker.zhilian_bot import ZhilianBot


async def main():
    bot = ZhilianBot(config={}, db_session_factory=None)
    base = "https://www.zhaopin.com/sou/jl653/p1"
    assert bot._build_search_url("653") == base
    assert bot._build_search_url("653", "0200", 2) == base.replace("/p1", "/p2") + "?sl=0200"
    for code in ("-1", "0001", "0103"):
        url = bot._build_search_url("653", "", 1, code, "2")
        qs = parse_qs(urlsplit(url).query)
        assert qs == {"we": [code], "et": ["2"]}, qs
    for invalid in ("0305", "0510", "invalid"):
        try:
            bot._build_search_url("653", "", 1, invalid, "2")
            assert False, f"Forbidden Zhilian 3+ years band {invalid} was accepted"
        except ValueError:
            pass
    try:
        bot._build_search_url("653", "", 1, "0103", "3")
        assert False, "Non-full-time filter was accepted"
    except ValueError:
        pass

    os.environ["JOB_HARNESS_GET_JOBS_COLLECT_ONLY"] = "1"
    class FakeSession:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            return None
    class FakeConfigService:
        def __init__(self, session):
            pass
        async def get_or_create_zhilian_config(self):
            return SimpleNamespace(keywords="Agent,前端开发", city_code="653", salary=None)
    class FakeCookieService:
        def __init__(self, session):
            pass
        async def get_cookie(self, site):
            return None
    def fake_module(name, attr, value):
        module=ModuleType(name)
        setattr(module, attr, value)
        sys.modules[name] = module
    fake_module("app.services.config_service", "ConfigService", FakeConfigService)
    fake_module("app.services.cookie_service", "CookieService", FakeCookieService)

    calls=[]
    proper = ZhilianBot(
        config={"nativeSearchFilters": {
            "experienceCodes": ["-1", "0001", "0103"],
            "employmentCode": "2",
        }},
        db_session_factory=lambda: FakeSession(),
    )
    async def nav(url):
        pass
    async def logged_in():
        return True
    async def submit(keyword, city, salary, task, **kwargs):
        calls.append((keyword, city, kwargs["experience_code"], kwargs["employment_code"], kwargs["max_cards_override"]))
        return 1
    proper.navigate = nav
    proper.is_logged_in = logged_in
    proper._submit_keyword = submit

    # Don't pay the real login wait in a mocked unit run.
    from app.worker.task_state import task_state
    task_state.start('zhilian')
    original_sleep = asyncio.sleep
    async def noop(*args):
        return None
    asyncio.sleep = noop
    try:
        await proper.run_delivery()
    finally:
        asyncio.sleep = original_sleep
        task_state.stop()

    assert len(calls) == 6, calls
    assert {(x[2], x[3], x[4]) for x in calls} == {
        ("-1", "2", 20),
        ("0001", "2", 20),
        ("0103", "2", 20),
    }, calls
    assert {x[0] for x in calls} == {"Agent", "前端开发"}

    # An explicitly smaller budget must not multiply on 3 separate filters.
    os.environ["JOB_HARNESS_GET_JOBS_MAX_CARDS_PER_KEYWORD"] = "20"
    task_state.start("zhilian")
    calls.clear()
    asyncio.sleep = noop
    try:
        await proper.run_delivery()
    finally:
        asyncio.sleep = original_sleep
        task_state.stop()
        os.environ.pop("JOB_HARNESS_GET_JOBS_MAX_CARDS_PER_KEYWORD", None)
    assert len(calls) == 6, calls
    assert {x[4] for x in calls} == {7}, calls

    bad = ZhilianBot(config={},db_session_factory=lambda: FakeSession())
    bad.navigate = nav
    bad.is_logged_in = logged_in
    try:
        await bad.run_delivery()
        assert False, "Missing filters did not prevent collection"
    except RuntimeError as exc:
        assert "filters" in str(exc).lower()

    invalid = ZhilianBot(config={"nativeSearchFilters": {
        "experienceCodes": ["0305"], "employmentCode": "2",
    }}, db_session_factory=lambda: FakeSession())
    invalid.navigate = nav
    invalid.is_logged_in = logged_in
    try:
        await invalid.run_delivery()
        assert False, "Senior experience band did not fail closed"
    except RuntimeError as exc:
        assert "Invalid Zhilian" in str(exc)

    print("Zhilian native URL filters, full-time safety, three-band coverage and fail-closed collection: PASS")


asyncio.run(main())
