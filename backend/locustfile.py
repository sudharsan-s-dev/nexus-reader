"""
=============================================================
 NEXUS READER - Load Testing with Locust
=============================================================
Simulates 50 concurrent users hitting all major API endpoints.
Run with:
  locust -f backend/locustfile.py --headless -u 50 -r 10 -t 30s --host=http://127.0.0.1:5000
"""
from locust import HttpUser, task, between
import random
import json


WORDS = ["algorithm", "neural", "python", "machine", "learning", "document", "reader"]
TEXTS = [
    "The quick brown fox jumps over the lazy dog.",
    "Machine learning is a subset of artificial intelligence.",
    "Python is a high-level programming language.",
    "Natural language processing helps computers understand human text.",
]

# Shared pool of tokens for authenticated tasks
_auth_tokens = []
_user_counter = [0]


class NexusReaderPublicUser(HttpUser):
    """Simulates an anonymous user hitting public endpoints."""
    wait_time = between(0.5, 2)
    weight = 3  # 3x more public users than authenticated

    @task(4)
    def get_meaning(self):
        word = random.choice(WORDS)
        self.client.get(f"/api/meaning?word={word}", name="/api/meaning")

    @task(3)
    def translate_text(self):
        text = random.choice(TEXTS)
        langs = ["es", "fr", "de", "hi", "ta"]
        self.client.post(
            "/api/translate",
            json={"text": text, "lang": random.choice(langs)},
            name="/api/translate",
        )

    @task(2)
    def fetch_wikipedia(self):
        queries = ["Python", "Machine learning", "Flask", "Document", "Artificial intelligence"]
        self.client.get(
            f"/api/wikipedia?query={random.choice(queries)}",
            name="/api/wikipedia",
        )

    @task(1)
    def explain_text(self):
        self.client.post(
            "/api/explain",
            json={"text": random.choice(TEXTS)},
            name="/api/explain",
        )

    @task(1)
    def check_session(self):
        self.client.get("/api/auth/session", name="/api/auth/session")

    @task(1)
    def load_home_page(self):
        self.client.get("/", name="/ (Frontend)")


class NexusReaderAuthUser(HttpUser):
    """Simulates an authenticated user with file/notes operations."""
    wait_time = between(1, 3)
    weight = 1

    def on_start(self):
        """Login before running tasks."""
        _user_counter[0] += 1
        self.email = f"loadtest_user_{_user_counter[0]}@locust.test"
        self.token = None

        # Request OTP
        resp = self.client.post(
            "/api/auth/request-otp",
            json={"email": self.email},
            name="/api/auth/request-otp (Login)",
        )
        if resp.status_code == 200:
            otp = resp.json().get("simulation_otp")
            # Verify OTP
            verify_resp = self.client.post(
                "/api/auth/verify-otp",
                json={"email": self.email, "otp": otp},
                name="/api/auth/verify-otp (Login)",
            )
            if verify_resp.status_code == 200:
                self.token = verify_resp.json().get("token")

    def _get_headers(self):
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task(3)
    def list_my_files(self):
        self.client.get("/api/files/list", headers=self._get_headers(), name="/api/files/list")

    @task(2)
    def load_notes(self):
        doc_ids = ["doc_001", "doc_002", "doc_003"]
        doc = random.choice(doc_ids)
        self.client.get(
            f"/api/notes/load?document_id={doc}",
            headers=self._get_headers(),
            name="/api/notes/load",
        )

    @task(1)
    def save_notes(self):
        doc_ids = ["doc_001", "doc_002", "doc_003"]
        self.client.post(
            "/api/notes/save",
            headers=self._get_headers(),
            json={"document_id": random.choice(doc_ids), "content": "<p>Load test note content</p>"},
            name="/api/notes/save",
        )

    @task(1)
    def check_auth_session(self):
        self.client.get("/api/auth/session", headers=self._get_headers(), name="/api/auth/session (Auth)")
