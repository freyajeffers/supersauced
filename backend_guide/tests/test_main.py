from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "1.0.0"

def test_routers_registered():
    routes = []
    for r in app.routes:
        if hasattr(r, "path"):
            routes.append(r.path)
        elif hasattr(r, "original_router"):
            prefix = getattr(r.include_context, "prefix", "")
            for sr in r.original_router.routes:
                if hasattr(sr, "path"):
                    routes.append(prefix + sr.path)
                    
    expected = ["/auth", "/user_profiles", "/functions", "/health"]
    for prefix in expected:
        assert any(p.startswith(prefix) for p in routes)
