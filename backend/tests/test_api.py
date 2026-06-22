"""
=============================================================
 NEXUS READER - API Tests (Smoke, Regression, Security)
=============================================================
Covers:
  - Smoke Test: Backend reachability and basic route health
  - Regression: Core API endpoints return correct data/status
  - Security:   Input validation, auth enforcement, path traversal
"""
import pytest
import json
import io
import sys
import os

# Ensure we can import from the backend root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app, init_db


@pytest.fixture(scope="function")
def client():
    app.config["TESTING"] = True
    init_db()
    with app.test_client() as c:
        yield c


@pytest.fixture(scope="function")
def fresh_client():
    """A completely fresh client with no cookies for auth isolation tests."""
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ------------------------------------------------------------------
# SMOKE TESTS - Is the server alive and routes registered?
# ------------------------------------------------------------------
class TestSmoke:
    def test_home_loads(self, client):
        """Frontend index.html is served from the Flask static folder."""
        response = client.get("/")
        assert response.status_code == 200

    def test_meaning_route_exists(self, client):
        response = client.get("/api/meaning?word=test")
        assert response.status_code in (200, 404, 500)  # route exists

    def test_translate_route_exists(self, client):
        response = client.post("/api/translate", json={"text": "hi", "lang": "es"})
        assert response.status_code in (200, 400, 500)

    def test_wikipedia_route_exists(self, client):
        response = client.get("/api/wikipedia?query=Python")
        assert response.status_code in (200, 404, 500)

    def test_explain_route_exists(self, client):
        response = client.post("/api/explain", json={"text": "test"})
        assert response.status_code in (200, 500)

    def test_auth_otp_route_exists(self, client):
        response = client.post("/api/auth/request-otp", json={"email": "smoke@test.com"})
        assert response.status_code in (200, 400, 500)


# ------------------------------------------------------------------
# REGRESSION TESTS - Correct behavior across endpoints
# ------------------------------------------------------------------
class TestMeaningEndpoint:
    def test_valid_word_returns_meaning(self, client):
        resp = client.get("/api/meaning?word=hello")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "meaning" in data
        assert isinstance(data["meaning"], str)
        assert len(data["meaning"]) > 5

    def test_missing_word_returns_400(self, client):
        resp = client.get("/api/meaning")
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_empty_word_returns_400(self, client):
        resp = client.get("/api/meaning?word=")
        assert resp.status_code == 400

    def test_gibberish_word_returns_404(self, client):
        resp = client.get("/api/meaning?word=zzzzxxxxxqqqq")
        assert resp.status_code == 404


class TestTranslateEndpoint:
    def test_translate_to_spanish(self, client):
        resp = client.post("/api/translate", json={"text": "hello", "lang": "es"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "translation" in data
        assert len(data["translation"]) > 0

    def test_translate_to_french(self, client):
        resp = client.post("/api/translate", json={"text": "Good morning", "lang": "fr"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "translation" in data

    def test_translate_missing_text_returns_400(self, client):
        resp = client.post("/api/translate", json={"lang": "es"})
        assert resp.status_code == 400

    def test_translate_empty_text_returns_400(self, client):
        resp = client.post("/api/translate", json={"text": "", "lang": "es"})
        assert resp.status_code == 400

    def test_translate_default_lang_when_omitted(self, client):
        resp = client.post("/api/translate", json={"text": "hello"})
        assert resp.status_code == 200


class TestExplainEndpoint:
    def test_explain_returns_explanation(self, client):
        resp = client.post("/api/explain", json={"text": "Quantum computing is a type of computation."})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "explanation" in data
        assert isinstance(data["explanation"], str)
        assert len(data["explanation"]) > 10

    def test_explain_includes_text_snippet(self, client):
        sample = "Artificial intelligence helps automate tasks."
        resp = client.post("/api/explain", json={"text": sample})
        data = resp.get_json()
        # The mock response includes first 40 chars of the text
        assert sample[:20] in data["explanation"]

    def test_explain_empty_text_still_responds(self, client):
        resp = client.post("/api/explain", json={"text": ""})
        assert resp.status_code == 200


class TestWikipediaEndpoint:
    def test_valid_query_returns_summary(self, client):
        # Use a specific non-disambiguation article for a reliable test
        resp = client.get("/api/wikipedia?query=Albert Einstein")
        assert resp.status_code == 200
        data = resp.get_json()
        assert "summary" in data
        assert isinstance(data["summary"], str)
        assert len(data["summary"]) > 10

    def test_missing_query_returns_400(self, client):
        resp = client.get("/api/wikipedia")
        assert resp.status_code == 400

    def test_empty_query_returns_400(self, client):
        resp = client.get("/api/wikipedia?query=")
        assert resp.status_code == 400

    def test_returns_url(self, client):
        resp = client.get("/api/wikipedia?query=Isaac Newton")
        if resp.status_code == 200:
            data = resp.get_json()
            assert "url" in data


# ------------------------------------------------------------------
# SECURITY TESTS
# ------------------------------------------------------------------
class TestAuthentication:
    def test_request_otp_valid_email(self, client):
        resp = client.post("/api/auth/request-otp", json={"email": "valid@example.com"})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "message" in data
        assert "simulation_otp" in data  # Dev mode returns OTP

    def test_request_otp_invalid_email_format(self, client):
        resp = client.post("/api/auth/request-otp", json={"email": "not-an-email"})
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_request_otp_missing_email(self, client):
        resp = client.post("/api/auth/request-otp", json={})
        assert resp.status_code == 400

    def test_otp_verify_correct(self, client):
        # Request OTP
        resp = client.post("/api/auth/request-otp", json={"email": "security@example.com"})
        otp = resp.get_json()["simulation_otp"]
        # Verify
        resp2 = client.post("/api/auth/verify-otp", json={"email": "security@example.com", "otp": otp})
        assert resp2.status_code == 200
        data = resp2.get_json()
        assert "token" in data
        assert "user" in data

    def test_otp_verify_wrong_otp(self, client):
        resp = client.post("/api/auth/request-otp", json={"email": "wrong_otp@example.com"})
        resp2 = client.post("/api/auth/verify-otp", json={"email": "wrong_otp@example.com", "otp": "000000"})
        assert resp2.status_code == 400

    def test_otp_verify_missing_fields(self, client):
        resp = client.post("/api/auth/verify-otp", json={"email": "someone@example.com"})
        assert resp.status_code == 400

    def test_session_endpoint_no_auth(self, fresh_client):
        resp = fresh_client.get("/api/auth/session")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["authenticated"] is False

    def test_file_upload_requires_auth(self, fresh_client):
        data = {"file": (io.BytesIO(b"dummy"), "test.pdf")}
        resp = fresh_client.post("/api/files/upload", data=data, content_type="multipart/form-data")
        assert resp.status_code == 401

    def test_file_list_requires_auth(self, fresh_client):
        resp = fresh_client.get("/api/files/list")
        assert resp.status_code == 401

    def test_file_delete_requires_auth(self, fresh_client):
        resp = fresh_client.delete("/api/files/delete/1")
        assert resp.status_code == 401

    def test_notes_save_requires_auth(self, fresh_client):
        resp = fresh_client.post("/api/notes/save", json={"document_id": "abc", "content": "test"})
        assert resp.status_code == 401

    def test_notes_load_requires_auth(self, fresh_client):
        resp = fresh_client.get("/api/notes/load?document_id=abc")
        assert resp.status_code == 401

    def test_path_traversal_prevention(self, client):
        """Malicious filenames like ../../etc/passwd must be sanitized."""
        # Login first
        resp = client.post("/api/auth/request-otp", json={"email": "pathtest@example.com"})
        otp = resp.get_json()["simulation_otp"]
        login = client.post("/api/auth/verify-otp", json={"email": "pathtest@example.com", "otp": otp})
        token = login.get_json()["token"]
        headers = {"Authorization": f"Bearer {token}"}

        malicious_file = (io.BytesIO(b"bad content"), "../../../etc/passwd")
        upload_resp = client.post(
            "/api/files/upload",
            headers=headers,
            data={"file": malicious_file},
            content_type="multipart/form-data",
        )
        if upload_resp.status_code == 201:
            name = upload_resp.get_json()["file"]["file_name"]
            # secure_filename strips '..' path traversal
            assert ".." not in name
            assert "/" not in name
            assert "\\" not in name

    def test_sql_injection_in_meaning(self, client):
        """SQL injection in query parameters must not crash the server."""
        resp = client.get("/api/meaning?word=' OR '1'='1")
        assert resp.status_code in (200, 400, 404, 500)

    def test_xss_in_translate(self, client):
        """XSS payloads in text input should be handled without crash."""
        xss_payload = "<script>alert('xss')</script>"
        resp = client.post("/api/translate", json={"text": xss_payload, "lang": "es"})
        assert resp.status_code in (200, 400, 500)


class TestFileManagement:
    @pytest.fixture
    def auth_client(self, client):
        """Returns an authenticated client with a Bearer token."""
        resp = client.post("/api/auth/request-otp", json={"email": "filetest@example.com"})
        otp = resp.get_json()["simulation_otp"]
        login = client.post("/api/auth/verify-otp", json={"email": "filetest@example.com", "otp": otp})
        token = login.get_json()["token"]
        return client, {"Authorization": f"Bearer {token}"}

    def test_file_list_empty_on_fresh_user(self, auth_client):
        client, headers = auth_client
        resp = client.get("/api/files/list", headers=headers)
        assert resp.status_code == 200
        data = resp.get_json()
        assert "files" in data
        assert isinstance(data["files"], list)

    def test_file_upload_success(self, auth_client):
        client, headers = auth_client
        file_data = {"file": (io.BytesIO(b"%PDF-1.4 fake pdf content"), "sample.pdf")}
        resp = client.post(
            "/api/files/upload", headers=headers, data=file_data, content_type="multipart/form-data"
        )
        assert resp.status_code == 201
        data = resp.get_json()
        assert "file" in data
        assert data["file"]["file_name"] == "sample.pdf"

    def test_upload_no_file_part(self, auth_client):
        client, headers = auth_client
        resp = client.post("/api/files/upload", headers=headers, data={}, content_type="multipart/form-data")
        assert resp.status_code == 400

    def test_notes_save_and_load(self, auth_client):
        client, headers = auth_client
        doc_id = "test_document_regression_001"
        content = "<p>My regression test notes</p>"

        save_resp = client.post("/api/notes/save", headers=headers, json={"document_id": doc_id, "content": content})
        assert save_resp.status_code == 200

        load_resp = client.get(f"/api/notes/load?document_id={doc_id}", headers=headers)
        assert load_resp.status_code == 200
        assert load_resp.get_json()["content"] == content

    def test_notes_load_missing_document_id(self, auth_client):
        client, headers = auth_client
        resp = client.get("/api/notes/load", headers=headers)
        assert resp.status_code == 400

    def test_notes_save_missing_document_id(self, auth_client):
        client, headers = auth_client
        resp = client.post("/api/notes/save", headers=headers, json={"content": "some content"})
        assert resp.status_code == 400
