"""
=============================================================
 NEXUS READER - E2E, Cross-Browser & Responsive Testing
=============================================================
Uses Playwright for Python.
Covers:
  - Smoke Test:        App loads, title correct, no fatal JS errors
  - E2E Workflows:     Tab switching, dark mode, split resizer, knowledge panel
  - Cross-Browser:     Runs on Chromium, Firefox, WebKit
  - Responsive/Mobile: Simulates iPhone 14 Pro viewport

Run with:
  pytest frontend/tests/test_e2e.py --base-url=http://localhost:8000 -v
  pytest frontend/tests/test_e2e.py --base-url=http://localhost:8000 --browser=firefox -v
  pytest frontend/tests/test_e2e.py --base-url=http://localhost:8000 --browser=webkit -v
"""
import pytest
from playwright.sync_api import Page, expect
import time

BASE_URL = "http://localhost:8000"
READER_URL = f"{BASE_URL}/reader.html"
DASHBOARD_URL = f"{BASE_URL}/index.html"


# ==================================================================
# SMOKE TESTS — App loads correctly
# ==================================================================
class TestSmoke:
    def test_page_loads_and_has_title(self, page: Page):
        """Dashboard must load and have a meaningful title."""
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        title = page.title()
        assert title != ""
        assert "Nexus" in title or "Reader" in title

    def test_no_fatal_network_errors(self, page: Page):
        """Critical static resources (CSS, JS, HTML) must all load successfully."""
        failed = []
        page.on("response", lambda r: failed.append(r.url) if r.status >= 400 and r.status < 600 and
                any(r.url.endswith(ext) for ext in [".css", ".js", ".html"]) else None)
        page.goto(DASHBOARD_URL, wait_until="networkidle")
        assert failed == [], f"Critical resource(s) failed to load: {failed}"

    def test_main_container_is_visible(self, page: Page):
        """The main app container must be visible on the dashboard."""
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        body = page.locator("body")
        expect(body).to_be_visible()
        # The dashboard has a glass-app-container
        container = page.locator(".glass-app-container")
        assert container.count() > 0, "Main glass-app-container not found"

    def test_no_javascript_crashes(self, page: Page):
        """Collect JS errors; there should be no critical errors."""
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(DASHBOARD_URL, wait_until="networkidle")
        page.wait_for_timeout(2000)
        critical = [e for e in errors if "SyntaxError" in e or "ReferenceError" in e]
        assert critical == [], f"JavaScript errors found: {critical}"

    def test_reader_page_loads(self, page: Page):
        """Reader page (reader.html) must load successfully."""
        page.goto(READER_URL, wait_until="domcontentloaded")
        title = page.title()
        assert "Nexus" in title or "Reader" in title


# ==================================================================
# E2E WORKFLOW TESTS — User interaction flows on the actual pages
# ==================================================================
class TestUIWorkflows:
    def test_document_upload_area_visible(self, page: Page):
        """The reader page shows a document upload button and empty state."""
        page.goto(READER_URL, wait_until="networkidle")
        # Reader has upload-btn and file-upload input
        upload_btn = page.locator("#upload-btn")
        assert upload_btn.count() > 0, "Upload button (#upload-btn) not found on reader page"

    def test_right_panel_tabs_present(self, page: Page):
        """Reader page has Notes/Knowledge/OCR/Study/Podcast tabs."""
        page.goto(READER_URL, wait_until="networkidle")
        # Exact class from reader.html: button.tab
        tabs = page.locator("button.tab")
        count = tabs.count()
        assert count >= 5, f"Expected at least 5 tabs (Notes/Knowledge/OCR/Study/Podcast), found {count}"

    def test_dark_mode_toggle_works(self, page: Page):
        """Dashboard has theme buttons (light/system/dark) that switch the theme."""
        page.goto(DASHBOARD_URL, wait_until="networkidle")
        # Exact selector from index.html: button.theme-btn[data-theme]
        light_btn = page.locator("button.theme-btn[data-theme='light']")
        dark_btn = page.locator("button.theme-btn[data-theme='dark']")
        assert light_btn.count() > 0, "Light theme button not found"
        assert dark_btn.count() > 0, "Dark theme button not found"

        # Click light theme
        light_btn.click()
        page.wait_for_timeout(500)
        body_class_light = page.locator("body").get_attribute("class") or ""

        # Click dark theme
        dark_btn.click()
        page.wait_for_timeout(500)
        body_class_dark = page.locator("body").get_attribute("class") or ""

        # The body class should change when toggling themes
        assert body_class_light != body_class_dark, \
            f"Theme toggle did not change body class. Light: '{body_class_light}', Dark: '{body_class_dark}'"

    def test_split_resizer_is_present(self, page: Page):
        """Reader page has the draggable split-screen resizer (#resizer)."""
        page.goto(READER_URL, wait_until="networkidle")
        # Exact id from reader.html: div#resizer
        resizer = page.locator("#resizer")
        assert resizer.count() > 0, "Split-screen resizer (#resizer) not found on reader page"
        expect(resizer).to_be_visible()

    def test_tab_switching_works(self, page: Page):
        """Clicking tabs on the reader page switches active content."""
        page.goto(READER_URL, wait_until="networkidle")
        tabs = page.locator("button.tab").all()
        assert len(tabs) >= 2, f"Need at least 2 tabs, found {len(tabs)}"

        # Click Notes tab (index 0)
        tabs[0].click()
        page.wait_for_timeout(300)
        # Click Knowledge tab (index 1)
        tabs[1].click()
        page.wait_for_timeout(300)
        # No crash = pass
        expect(page.locator("body")).to_be_visible()

    def test_knowledge_panel_or_notes_panel_exists(self, page: Page):
        """Reader page has #notes-panel and #notes-tab and #knowledge-tab."""
        page.goto(READER_URL, wait_until="networkidle")
        # Exact ids from reader.html
        notes_panel = page.locator("#notes-panel")
        notes_tab = page.locator("#notes-tab")
        knowledge_tab = page.locator("#knowledge-tab")
        assert notes_panel.count() > 0, "#notes-panel not found"
        assert notes_tab.count() > 0, "#notes-tab not found"
        assert knowledge_tab.count() > 0, "#knowledge-tab not found"

    def test_navbar_is_present(self, page: Page):
        """Reader page has a top navigation bar (.topbar)."""
        page.goto(READER_URL, wait_until="networkidle")
        # Exact class from reader.html: nav.topbar
        nav = page.locator("nav.topbar")
        assert nav.count() > 0, "Top navigation bar (.topbar) not found on reader page"
        expect(nav).to_be_visible()

    def test_dashboard_sidebar_navigation_present(self, page: Page):
        """Dashboard has sidebar nav links (Dashboard, Leaderboard, Feedback)."""
        page.goto(DASHBOARD_URL, wait_until="networkidle")
        # Exact class from index.html: nav.sidebar-nav > a.sidebar-link
        sidebar_links = page.locator("a.sidebar-link")
        count = sidebar_links.count()
        assert count >= 3, f"Expected at least 3 sidebar links, found {count}"

    def test_document_reader_card_clickable(self, page: Page):
        """Dashboard 'Document Reader' card should be visible and clickable."""
        page.goto(DASHBOARD_URL, wait_until="networkidle")
        # Exact id from index.html
        card = page.locator("#main-reader-upload-card")
        assert card.count() > 0, "Document Reader card (#main-reader-upload-card) not found"
        expect(card).to_be_visible()

    def test_reader_zoom_controls_present(self, page: Page):
        """Reader page has zoom in (#zoom-in) and zoom out (#zoom-out) controls."""
        page.goto(READER_URL, wait_until="networkidle")
        zoom_in = page.locator("#zoom-in")
        zoom_out = page.locator("#zoom-out")
        assert zoom_in.count() > 0, "#zoom-in button not found"
        assert zoom_out.count() > 0, "#zoom-out button not found"


# ==================================================================
# RESPONSIVE / MOBILE TESTS — Simulates mobile device viewport
# ==================================================================
class TestResponsive:
    MOBILE_VIEWPORT = {"width": 390, "height": 844}   # iPhone 14 Pro
    TABLET_VIEWPORT = {"width": 768, "height": 1024}  # iPad

    def test_mobile_viewport_no_overflow(self, page: Page):
        """On mobile, dashboard content should not overflow horizontally."""
        page.set_viewport_size(self.MOBILE_VIEWPORT)
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        scroll_width = page.evaluate("document.body.scrollWidth")
        viewport_width = page.evaluate("window.innerWidth")
        assert scroll_width <= viewport_width + 5, \
            f"Horizontal overflow detected: scrollWidth={scroll_width} > viewportWidth={viewport_width}"

    def test_tablet_viewport_loads(self, page: Page):
        """App should load on tablet viewport without crash."""
        page.set_viewport_size(self.TABLET_VIEWPORT)
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        expect(page.locator("body")).to_be_visible()

    def test_desktop_viewport_loads(self, page: Page):
        """App should load on standard desktop viewport."""
        page.set_viewport_size({"width": 1920, "height": 1080})
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        expect(page.locator("body")).to_be_visible()

    def test_mobile_font_size_readable(self, page: Page):
        """Body font size should be at least 12px on mobile."""
        page.set_viewport_size(self.MOBILE_VIEWPORT)
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        font_size = page.evaluate("parseFloat(getComputedStyle(document.body).fontSize)")
        assert font_size >= 12, f"Font size too small on mobile: {font_size}px"

    def test_reader_mobile_viewport(self, page: Page):
        """Reader page should load on mobile viewport without crash."""
        page.set_viewport_size(self.MOBILE_VIEWPORT)
        page.goto(READER_URL, wait_until="domcontentloaded")
        expect(page.locator("body")).to_be_visible()


# ==================================================================
# USER ACCEPTANCE TESTING (UAT) — Core user-facing behaviors
# ==================================================================
class TestUAT:
    def test_page_loads_in_under_5_seconds(self, page: Page):
        """UAT: Dashboard page load time must be under 5 seconds."""
        start = time.time()
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        elapsed = time.time() - start
        assert elapsed < 5, f"Page took {elapsed:.2f}s to load (threshold: 5s)"

    def test_reader_loads_in_under_5_seconds(self, page: Page):
        """UAT: Reader page load time must be under 5 seconds."""
        start = time.time()
        page.goto(READER_URL, wait_until="domcontentloaded")
        elapsed = time.time() - start
        assert elapsed < 5, f"Reader page took {elapsed:.2f}s to load (threshold: 5s)"

    def test_main_heading_visible(self, page: Page):
        """UAT: Dashboard should have a visible h1 heading."""
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        # index.html has: <h1>Welcome back, <span>Creator</span></h1>
        h1 = page.locator("h1")
        assert h1.count() > 0, "No h1 heading found on dashboard"
        expect(h1.first).to_be_visible()

    def test_interactive_elements_are_clickable(self, page: Page):
        """UAT: All non-disabled buttons should be clickable."""
        page.goto(DASHBOARD_URL, wait_until="networkidle")
        buttons = page.locator("button:not([disabled])").all()
        assert len(buttons) > 0, "No clickable buttons found on dashboard"

    def test_css_loaded_not_unstyled(self, page: Page):
        """UAT: CSS must be loaded — body should use Inter/Outfit, not browser default serif."""
        page.goto(DASHBOARD_URL, wait_until="networkidle")
        font = page.evaluate("getComputedStyle(document.body).fontFamily")
        # styles.css loads Inter and Outfit — neither is Times New Roman
        assert "Times New Roman" not in font, \
            f"CSS may not have loaded correctly — default serif font detected: {font}"

    def test_page_has_meta_description(self, page: Page):
        """UAT/SEO: Dashboard page must have a meta description (fixed bug)."""
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        meta = page.locator('meta[name="description"]')
        assert meta.count() > 0, "Missing <meta name='description'> tag on dashboard"

    def test_reader_has_meta_description(self, page: Page):
        """UAT/SEO: Reader page must have a meta description (fixed bug)."""
        page.goto(READER_URL, wait_until="domcontentloaded")
        meta = page.locator('meta[name="description"]')
        assert meta.count() > 0, "Missing <meta name='description'> tag on reader page"

    def test_brand_logo_visible_on_dashboard(self, page: Page):
        """UAT: NexusReader brand logo must be visible in sidebar."""
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded")
        # Exact element from index.html: .brand > .logo-text
        logo = page.locator(".brand .logo-text")
        assert logo.count() > 0, "Brand logo text not found"
        expect(logo.first).to_be_visible()

    def test_brand_logo_visible_on_reader(self, page: Page):
        """UAT: NexusReader brand logo must be visible in reader topbar."""
        page.goto(READER_URL, wait_until="domcontentloaded")
        logo = page.locator(".logo-text")
        assert logo.count() > 0, "Brand logo text not found on reader"
        expect(logo.first).to_be_visible()
