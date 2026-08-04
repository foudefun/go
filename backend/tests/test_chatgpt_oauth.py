import json
from urllib.parse import parse_qs, urlparse

from app import main


def create_user(username, password):
    salt, password_hash = main.build_password_record(password)
    db = main.SessionLocal()
    try:
        db.merge(main.UserModel(username=username, password_salt=salt, password_hash=password_hash, is_admin=False, language="en"))
        db.commit()
    finally:
        db.close()


def exchange_code(client, username, password):
    redirect_uri = "https://chatgpt.com/aip/g-test/oauth/callback"
    response = client.post(
        "/oauth/authorize",
        data={
            "client_id": main.CHATGPT_OAUTH_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": main.CHATGPT_OAUTH_SCOPE,
            "state": "state-123",
            "username": username,
            "password": password,
        },
        follow_redirects=False,
    )
    assert response.status_code == 303
    query = parse_qs(urlparse(response.headers["location"]).query)
    assert query["state"] == ["state-123"]
    token_response = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "client_id": main.CHATGPT_OAUTH_CLIENT_ID,
            "client_secret": main.get_chatgpt_oauth_client_secret(),
            "code": query["code"][0],
            "redirect_uri": redirect_uri,
        },
    )
    assert token_response.status_code == 200
    return token_response.json()


def test_chatgpt_oauth_is_read_only_and_user_scoped(client):
    create_user("oauth-alice", "safe-password-1")
    create_user("oauth-bob", "safe-password-2")
    db = main.SessionLocal()
    try:
        db.add(main.SessionModel(username="oauth-alice", date="2026-08-01", data=json.dumps({"plan_title": "Easy ride", "plan_activity_type": "velo", "duration_target_min": 60, "plan_notes": "Flexible by one day", "activities": [{"title": "Alice Ride", "activity_type": "velo", "status": "done", "source_files": [{"id": "a", "metrics": {"duration": {"seconds": 3600}, "distance": {"km": 25}}}]}]})))
        db.add(main.SessionModel(username="oauth-bob", date="2026-08-02", data=json.dumps({"activities": [{"title": "Bob Secret Run", "activity_type": "course", "status": "done"}]})))
        db.commit()
    finally:
        db.close()

    tokens = exchange_code(client, "oauth-alice", "safe-password-1")
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    activities = client.get("/api/gpt/activities", headers=headers).json()["activities"]
    assert [item["title"] for item in activities] == ["Alice Ride"]
    assert "Bob Secret Run" not in json.dumps(activities)
    summary = client.get("/api/gpt/training-summary", headers=headers).json()
    assert summary["activity_count"] == 1
    assert summary["total_duration_hours"] == 1
    calendar = client.get("/api/gpt/calendar?oldest=2026-08-01&newest=2026-08-31", headers=headers).json()
    assert calendar["count"] == 1
    assert calendar["planned_days"][0]["title"] == "Easy ride"
    assert calendar["planned_days"][0]["completed_activities"][0]["title"] == "Alice Ride"

    refreshed = client.post(
        "/oauth/token",
        data={
            "grant_type": "refresh_token",
            "client_id": main.CHATGPT_OAUTH_CLIENT_ID,
            "client_secret": main.get_chatgpt_oauth_client_secret(),
            "refresh_token": tokens["refresh_token"],
        },
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["access_token"] != tokens["access_token"]


def test_chatgpt_oauth_rejects_untrusted_redirect(client):
    response = client.get(
        "/oauth/authorize",
        params={
            "client_id": main.CHATGPT_OAUTH_CLIENT_ID,
            "redirect_uri": "https://attacker.example/oauth/callback",
            "response_type": "code",
            "scope": main.CHATGPT_OAUTH_SCOPE,
        },
    )
    assert response.status_code == 400
