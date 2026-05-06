"""
ETL : import d'un fichier .osm.pbf vers la table monuments de PostgreSQL.
Résout les images via plusieurs stratégies gratuites (sans clé API) :
  1. Tags OSM directs  : image, wikimedia_commons, wikidata
  2. Wikipedia         : miniature de l'article lié (tag wikipedia)
  3. Commons geosearch : photos géolocalisées près des coordonnées

Usage :
    cd backend
    python etl/import_osm.py "C:/Users/paulb/Downloads/corse-260420.osm.pbf"
"""

import os
import sys
import time
import osmium
import pg8000.dbapi as pg
import requests

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
        self.image_meta: list[dict] = []

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
        self.image_meta.append({
            "osm_id":            osm_id,
            "lat":               lat,
            "lon":               lon,
            "image":             tags.get("image"),
            "wikimedia_commons": tags.get("wikimedia_commons"),
            "wikidata":          tags.get("wikidata"),
            "wikipedia":         tags.get("wikipedia"),
        })
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
        self._add(-w.id, name, lat, lon, tags)


# ── Résolution des images ─────────────────────────────────────────────────────
THUMB_WIDTH   = 800
GEOSEARCH_RADIUS = 100  # mètres autour du monument
GEOSEARCH_LIMIT  = 3    # max photos par monument via geosearch

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "tourism-app-etl/1.0 (formation)"})


def commons_url(value: str) -> str:
    if value.startswith("http"):
        return value
    name = value.removeprefix("File:").replace(" ", "_")
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{name}?width={THUMB_WIDTH}"


def wikidata_image_url(qid: str) -> str | None:
    """Propriété P18 (image) depuis Wikidata."""
    try:
        r = SESSION.get(
            f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json",
            timeout=10,
        )
        r.raise_for_status()
        claims = r.json()["entities"][qid].get("claims", {})
        p18 = claims.get("P18", [])
        if p18:
            return commons_url(p18[0]["mainsnak"]["datavalue"]["value"])
    except Exception:
        pass
    return None


def wikipedia_image_url(wp_tag: str) -> str | None:
    """
    Miniature principale de l'article Wikipedia.
    Le tag OSM est au format  "fr:Titre" ou "Titre" (sans langue).
    """
    try:
        if ":" in wp_tag and not wp_tag.startswith("http"):
            lang, title = wp_tag.split(":", 1)
        else:
            lang, title = "fr", wp_tag

        r = SESSION.get(
            f"https://{lang}.wikipedia.org/w/api.php",
            params={
                "action":       "query",
                "titles":       title,
                "prop":         "pageimages",
                "pithumbsize":  THUMB_WIDTH,
                "pilimit":      1,
                "format":       "json",
            },
            timeout=10,
        )
        r.raise_for_status()
        pages = r.json()["query"]["pages"]
        page = next(iter(pages.values()))
        thumb = page.get("thumbnail")
        if thumb:
            return thumb["source"]
    except Exception:
        pass
    return None


def commons_geosearch(lat: float, lon: float) -> list[str]:
    """
    Cherche des photos Wikimedia Commons géolocalisées près du monument.
    Retourne jusqu'à GEOSEARCH_LIMIT URLs.
    """
    try:
        r = SESSION.get(
            "https://commons.wikimedia.org/w/api.php",
            params={
                "action":       "query",
                "list":         "geosearch",
                "gsnamespace":  6,          # namespace File:
                "gslat":        round(lat, 5),
                "gslon":        round(lon, 5),
                "gsradius":     GEOSEARCH_RADIUS,
                "gslimit":      GEOSEARCH_LIMIT,
                "format":       "json",
            },
            timeout=10,
        )
        r.raise_for_status()
        hits = r.json()["query"].get("geosearch", [])
        return [commons_url(h["title"]) for h in hits if h.get("title")]
    except Exception:
        return []


def resolve_images(image_meta: list[dict]) -> dict[int, list[str]]:
    """
    Applique 3 stratégies dans l'ordre pour maximiser la couverture.
    Retourne {osm_id: [url, ...]}
    """
    result: dict[int, list[str]] = {}
    need_wikipedia:  list[dict] = []
    need_geosearch:  list[dict] = []

    # ── Passe 1 : tags OSM directs (pas d'appel API) ──────────────────────────
    for meta in image_meta:
        osm_id = meta["osm_id"]
        urls: list[str] = []

        if meta["image"] and meta["image"].startswith("http"):
            urls.append(meta["image"])
        if meta["wikimedia_commons"]:
            urls.append(commons_url(meta["wikimedia_commons"]))

        if urls:
            result[osm_id] = urls
        else:
            # Pas d'image directe → on essaiera wikidata + wikipedia ensemble
            need_wikipedia.append(meta)

    # ── Passe 2 : Wikidata P18 + Wikipedia thumbnail ──────────────────────────
    total = len(need_wikipedia)
    if total:
        print(f"\n  Passe 2 – Wikipedia/Wikidata ({total:,} POI)...")
        for i, meta in enumerate(need_wikipedia, 1):
            osm_id = meta["osm_id"]
            urls = []

            if meta["wikidata"]:
                url = wikidata_image_url(meta["wikidata"])
                if url:
                    urls.append(url)

            if not urls and meta["wikipedia"]:
                url = wikipedia_image_url(meta["wikipedia"])
                if url:
                    urls.append(url)

            if urls:
                result[osm_id] = urls
            else:
                need_geosearch.append(meta)

            if i % 100 == 0:
                print(f"  {i:,}/{total:,}...", end="\r")
                time.sleep(0.2)

    # ── Passe 3 : Commons geosearch (monuments encore sans image) ─────────────
    total = len(need_geosearch)
    if total:
        print(f"\n  Passe 3 – Commons geosearch ({total:,} POI restants)...")
        for i, meta in enumerate(need_geosearch, 1):
            urls = commons_geosearch(meta["lat"], meta["lon"])
            if urls:
                result[meta["osm_id"]] = urls
            if i % 50 == 0:
                print(f"  {i:,}/{total:,}...", end="\r")
                time.sleep(0.3)

    return result


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

def load(pois: list[tuple], images_by_osm: dict[int, list[str]]):
    total = len(pois)
    conn = pg.connect(**DB_PARAMS)
    cur = conn.cursor()
    try:
        # 1. Upsert monuments
        inserted = 0
        for start in range(0, total, BATCH_SIZE):
            batch = pois[start:start + BATCH_SIZE]
            cur.executemany(UPSERT_SQL, batch)
            inserted += len(batch)
            print(f"  {inserted:,}/{total:,} monuments insérés...", end="\r")
        conn.commit()
        print(f"\n  {total:,} monuments insérés/mis à jour.")

        # 2. Mapping osm_id → id en base
        osm_ids_with_images = list(images_by_osm.keys())
        if not osm_ids_with_images:
            print("  Aucune image à insérer.")
            return

        osm_to_db_id: dict[int, int] = {}
        for start in range(0, len(osm_ids_with_images), BATCH_SIZE):
            chunk = osm_ids_with_images[start:start + BATCH_SIZE]
            placeholders = ",".join(["%s"] * len(chunk))
            cur.execute(
                f"SELECT id, osm_id FROM monuments WHERE osm_id IN ({placeholders})",
                chunk,
            )
            osm_to_db_id.update({osm_id: db_id for db_id, osm_id in cur.fetchall()})

        # 3. Supprimer les anciennes images et réinsérer (idempotent)
        monument_ids = list(osm_to_db_id.values())
        for start in range(0, len(monument_ids), BATCH_SIZE):
            chunk = monument_ids[start:start + BATCH_SIZE]
            placeholders = ",".join(["%s"] * len(chunk))
            cur.execute(f"DELETE FROM monument_images WHERE monument_id IN ({placeholders})", chunk)

        image_rows = [
            (osm_to_db_id[osm_id], url)
            for osm_id, urls in images_by_osm.items()
            if osm_id in osm_to_db_id
            for url in urls
        ]
        cur.executemany(
            "INSERT INTO monument_images (monument_id, image_url) VALUES (%s, %s)",
            image_rows,
        )
        conn.commit()
        print(f"  {len(image_rows):,} images insérées pour {len(osm_to_db_id):,} monuments.")
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
    print(f"\n{len(handler.pois):,} POI extraits.")

    print("Résolution des images (3 passes)...")
    images_by_osm = resolve_images(handler.image_meta)
    coverage = len(images_by_osm) / len(handler.pois) * 100 if handler.pois else 0
    print(f"  {len(images_by_osm):,} POI ont des images ({coverage:.0f}% de couverture).")

    print("Insertion en base...")
    load(handler.pois, images_by_osm)
    print("Import terminé.")
