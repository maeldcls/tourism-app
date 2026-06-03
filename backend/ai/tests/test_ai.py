import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_themes():
    res = client.get("/themes")
    assert res.status_code == 200
    data = res.json()
    assert "themes" in data
    assert len(data["themes"]) == 15


def test_tag_monument_retourne_themes():
    res = client.post("/tag-monument", json={
        "name": "Cathédrale Notre-Dame",
        "description": "Cathédrale gothique médiévale",
        "category": "religion",
    })
    assert res.status_code == 200
    data = res.json()
    assert "themes" in data
    assert isinstance(data["themes"], list)


def test_tag_monument_champs_optionnels():
    res = client.post("/tag-monument", json={"name": "Tour Eiffel"})
    assert res.status_code == 200


def test_embed_monument_retourne_vecteur():
    res = client.post("/embed-monument", json={
        "name": "Louvre",
        "category": "art",
    })
    assert res.status_code == 200
    data = res.json()
    assert "embedding" in data
    assert len(data["embedding"]) == 384


def test_user_taste_vide():
    res = client.post("/user-taste", json=[])
    assert res.status_code == 200
    data = res.json()
    assert data["themes"] == []
    assert data["embedding"] == []


def test_user_taste_avec_monuments():
    res = client.post("/user-taste", json=[{
        "monument_id": 1,
        "name": "Panthéon",
        "category": "histoire",
        "themes": [{"theme": "histoire", "confidence": 0.9}],
    }])
    assert res.status_code == 200
    data = res.json()
    assert "themes" in data
    assert "embedding" in data
