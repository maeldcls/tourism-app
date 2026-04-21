"""
ETL : import d'un fichier .osm.pbf vers la table monuments de PostgreSQL.

Usage :
    cd backend
    python etl/import_osm.py "C:/Users/paulb/Downloads/corse-260420.osm.pbf"
"""

import os
import sys
import osmium
import pg8000.dbapi as pg

WANTED = {
    "tourism":  {"attraction", "museum", "artwork", "viewpoint", "gallery", "zoo", "theme_park"},
    "historic": {"monument", "memorial", "castle", "ruins", "archaeological_site", "fort", "building"},
    "leisure":  {"park", "garden", "nature_reserve"},
    "amenity":  {"place_of_worship"},
}

def is_wanted(tags: dict) -> bool:
    for key, values in WANTED.items():
        if tags.get(key) in values:
            return True
    return False

def tags_to_category(tags: dict) -> str:
    tourism  = tags.get("tourism")
    historic = tags.get("historic")
    amenity  = tags.get("amenity")
    leisure  = tags.get("leisure")
    if tourism == "museum":                              return "musee"
    if tourism == "attraction" or historic:              return "monument"
    if amenity == "place_of_worship":                    return "eglise"
    if leisure in ("park", "garden", "nature_reserve"):  return "parc"
    if tourism:                                          return "monument"
    return "autre"


# ── Handler osmium ────────────────────────────────────────────────────────────
class PoiHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.pois: list[tuple] = []

    def _add(self, osm_id: int, name: str, lat: float, lon: float, tags: dict):
        desc = tags.get("description") or tags.get("wikipedia") or ""
        self.pois.append((
            name[:255],
            round(lat, 7),
            round(lon, 7),
            tags_to_category(tags),
            (tags.get("addr:city") or "")[:100],
            desc[:500],
            osm_id,
        ))
        if len(self.pois) % 10_000 == 0:
            print(f"  {len(self.pois):,} POI trouvés...")

    def node(self, n):
        if not n.location.valid():
            return
        tags = dict(n.tags)
        name = tags.get("name") or tags.get("name:fr") or tags.get("name:en")
        if not name or not is_wanted(tags):
            return
        self._add(n.id, name, n.location.lat, n.location.lon, tags)

    def way(self, w):
        tags = dict(w.tags)
        name = tags.get("name") or tags.get("name:fr") or tags.get("name:en")
        if not name or not is_wanted(tags):
            return
        coords = [(nd.location.lat, nd.location.lon) for nd in w.nodes if nd.location.valid()]
        if not coords:
            return
        lat = sum(c[0] for c in coords) / len(coords)
        lon = sum(c[1] for c in coords) / len(coords)
        # negative IDs = ways (évite les conflits avec les IDs de nodes)
        self._add(-w.id, name, lat, lon, tags)


# ── Connexion PostgreSQL ──────────────────────────────────────────────────────
DB_PARAMS = {
    "database": "tourism_app_db",
    "user":     "postgres",
    "password": "admin",
    "host":     "127.0.0.1",
    "port":     5433,
}

BATCH_SIZE = 500

UPSERT_SQL = """
    INSERT INTO monuments (name, latitude, longitude, category, city, description, osm_id)
    VALUES (%s, %s, %s, %s, %s, %s, %s)
    ON CONFLICT (osm_id)
    DO UPDATE SET
        name        = EXCLUDED.name,
        latitude    = EXCLUDED.latitude,
        longitude   = EXCLUDED.longitude,
        category    = EXCLUDED.category,
        city        = EXCLUDED.city,
        description = EXCLUDED.description
"""

def load(pois: list[tuple]):
    total = len(pois)
    conn = pg.connect(**DB_PARAMS)
    cur = conn.cursor()
    try:
        inserted = 0
        for start in range(0, total, BATCH_SIZE):
            batch = pois[start:start + BATCH_SIZE]
            cur.executemany(UPSERT_SQL, batch)
            inserted += len(batch)
            print(f"  {inserted:,}/{total:,} insérés...", end="\r")
        conn.commit()
        print(f"\n  {total:,} lignes insérées/mises à jour.")
    finally:
        cur.close()
        conn.close()


# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python etl/import_osm.py <chemin/vers/fichier.osm.pbf>")
        sys.exit(1)

    pbf_path = sys.argv[1]
    if not os.path.exists(pbf_path):
        print(f"Fichier introuvable : {pbf_path}")
        sys.exit(1)

    print(f"Lecture de {pbf_path} ...")
    handler = PoiHandler()
    handler.apply_file(pbf_path, locations=True)

    print(f"\n{len(handler.pois):,} POI extraits. Insertion en base...")
    load(handler.pois)
    print("Import terminé.")
