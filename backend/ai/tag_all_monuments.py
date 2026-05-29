"""
Script batch : tague tous les monuments avec des thèmes et stocke les embeddings.
Usage : python tag_all_monuments.py
Variables requises : DATABASE_URL, AI_SERVICE_URL (optionnel, défaut localhost:8001)
"""
import os
import json
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:admin@localhost:5433/tourism_app_db")
AI_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8001")

BATCH_SIZE = 20


def get_connection():
    return psycopg2.connect(DATABASE_URL)


def fetch_untagged_monuments(conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT m.id, m.name, m.description, m.category
            FROM monuments m
            WHERE NOT EXISTS (
                SELECT 1 FROM monuments_theme mt WHERE mt.monument_id = m.id
            )
            ORDER BY m.id
        """)
        return cur.fetchall()


def tag_monument(monument: dict) -> list[dict]:
    resp = requests.post(f"{AI_URL}/tag-monument", json={
        "name": monument["name"] or "",
        "description": monument["description"] or "",
        "category": monument["category"] or "",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["themes"]


def embed_monument(monument: dict) -> list[float]:
    resp = requests.post(f"{AI_URL}/embed-monument", json={
        "name": monument["name"] or "",
        "description": monument["description"] or "",
        "category": monument["category"] or "",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["embedding"]


def save_monument_data(conn, monument_id: int, themes: list[dict], embedding: list[float]):
    with conn.cursor() as cur:
        for t in themes:
            cur.execute("""
                INSERT INTO monuments_theme (monument_id, theme, confidence)
                VALUES (%s, %s, %s)
                ON CONFLICT ON CONSTRAINT uq_monument_theme DO UPDATE SET confidence = EXCLUDED.confidence
            """, (monument_id, t["theme"], t["confidence"]))

        cur.execute(
            "UPDATE monuments SET embedding = %s WHERE id = %s",
            (json.dumps(embedding), monument_id)
        )
    conn.commit()


def main():
    conn = get_connection()
    monuments = fetch_untagged_monuments(conn)
    total = len(monuments)
    print(f"Monuments à tagger : {total}")

    for i, monument in enumerate(monuments, 1):
        try:
            themes = tag_monument(monument)
            embedding = embed_monument(monument)
            save_monument_data(conn, monument["id"], themes, embedding)
            print(f"[{i}/{total}] {monument['name']} -> {[t['theme'] for t in themes]}")
        except Exception as e:
            print(f"[{i}/{total}] ERREUR {monument['name']} : {e}")

    conn.close()
    print("Tagging terminé.")


if __name__ == "__main__":
    main()
