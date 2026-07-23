"""
Monuments routes — pages Destinations, MapPage, Monument.

GET  /monuments              → page Destinations : liste tous les monuments
                               ?city=Paris         → filtre par ville
                               ?theme=histoire     → filtre par thème
                               ?q=louvre           → recherche par nom (page MapPage)
GET  /monuments/nearby       → page MapPage : monuments proches d'une position GPS
                               ?lat=48.8&lon=2.3&radius_km=5
GET  /monuments/{id}         → page Monument : détail d'un monument
POST /monuments/upsert       → crée ou retourne le monument (par osm_id), fetch images si nécessaire
"""
import httpx
from math import radians, cos, sin, asin, sqrt
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
import models

router = APIRouter(prefix="/monuments", tags=["Monuments"])


class MonumentBody(BaseModel):
    name: str
    city: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = "monument"
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MonumentUpsertBody(BaseModel):
    osm_id: int
    name: str
    city: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = "monument"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    # Tags OSM utiles pour trouver des images
    wikimedia_commons: Optional[str] = None
    wikipedia: Optional[str] = None
    image: Optional[str] = None


# ── Helpers images ─────────────────────────────────────────────────────────────

async def _fetch_wikimedia_image_url(page_title: str) -> Optional[str]:
    """Récupère l'URL de l'image principale d'une page Wikimedia Commons."""
    try:
        url = "https://en.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "titles": f"File:{page_title}" if not page_title.startswith("File:") else page_title,
            "prop": "imageinfo",
            "iiprop": "url",
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, params=params)
            data = res.json()
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            info = page.get("imageinfo", [])
            if info:
                return info[0].get("url")
    except Exception:
        pass
    return None


async def _fetch_wikipedia_thumbnail(wiki_tag: str) -> Optional[str]:
    """Récupère la miniature de la page Wikipedia (format 'fr:Titre_page')."""
    try:
        # Extraire la langue et le titre
        if ":" in wiki_tag:
            lang, title = wiki_tag.split(":", 1)
        else:
            lang, title = "fr", wiki_tag

        url = f"https://{lang}.wikipedia.org/w/api.php"
        params = {
            "action": "query",
            "titles": title,
            "prop": "pageimages",
            "pithumbsize": 800,
            "format": "json",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(url, params=params)
            data = res.json()
        pages = data.get("query", {}).get("pages", {})
        for page in pages.values():
            thumb = page.get("thumbnail", {})
            if thumb.get("source"):
                return thumb["source"]
    except Exception:
        pass
    return None


async def _collect_images(body: MonumentUpsertBody) -> list[str]:
    """Retourne une liste d'URLs d'images pour le monument."""
    urls: list[str] = []

    # 1. Image directe dans les tags OSM
    if body.image:
        urls.append(body.image)

    # 2. Wikipedia thumbnail
    if body.wikipedia and len(urls) < 3:
        thumb = await _fetch_wikipedia_thumbnail(body.wikipedia)
        if thumb:
            urls.append(thumb)

    # 3. Wikimedia Commons
    if body.wikimedia_commons and len(urls) < 3:
        img = await _fetch_wikimedia_image_url(body.wikimedia_commons)
        if img:
            urls.append(img)

    return urls


# ── POST /monuments/upsert ─────────────────────────────────────────────────────
@router.post("/upsert")
async def upsert_monument(body: MonumentUpsertBody, db: Session = Depends(get_db)):
    """
    Crée le monument s'il n'existe pas (par osm_id), sinon retourne l'existant.
    Fetche les images la première fois uniquement.
    """
    m = db.query(models.Monument).filter(models.Monument.osm_id == body.osm_id).first()

    if not m:
        m = models.Monument(
            osm_id=body.osm_id,
            name=body.name,
            city=body.city,
            description=body.description,
            category=body.category,
            latitude=body.latitude,
            longitude=body.longitude,
        )
        db.add(m)
        db.commit()
        db.refresh(m)

        # Fetch images uniquement à la création
        image_urls = await _collect_images(body)
        for url in image_urls:
            db.add(models.MonumentImage(monument_id=m.id, image_url=url))
        if image_urls:
            db.commit()
            db.refresh(m)

    return _monument_to_dict(m, include_images=True)


# ── POST /monuments ────────────────────────────────────────────────────────────
@router.post("", status_code=201)
def create_monument(body: MonumentBody, db: Session = Depends(get_db)):
    """Crée un monument s'il n'existe pas déjà (même nom + coords proches)."""
    existing = db.query(models.Monument).filter(
        models.Monument.name == body.name,
        models.Monument.latitude == body.latitude,
        models.Monument.longitude == body.longitude,
    ).first()
    if existing:
        return _monument_to_dict(existing)

    m = models.Monument(
        name=body.name,
        city=body.city,
        description=body.description,
        category=body.category,
        latitude=body.latitude,
        longitude=body.longitude,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return _monument_to_dict(m)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance en km entre deux points GPS (formule de Haversine)."""
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 2 * R * asin(sqrt(a))


def _monument_to_dict(m: models.Monument, include_images: bool = False) -> dict:
    d = {
        "id": m.id,
        "osm_id": m.osm_id,
        "name": m.name,
        "description": m.description,
        "city": m.city,
        "category": m.category or "monument",
        "latitude": m.latitude,
        "longitude": m.longitude,
    }
    if include_images:
        d["images"] = [img.image_url for img in m.images]
    return d


# ── GET /monuments ─────────────────────────────────────────────────────────────
# Page : Destinations
@router.get("")
def get_monuments(
    city: Optional[str] = Query(None, description="Filtrer par ville"),
    theme: Optional[str] = Query(None, description="Filtrer par thème"),
    q: Optional[str] = Query(None, description="Recherche par nom"),
    db: Session = Depends(get_db),
):
    query = db.query(models.Monument)
    if city:
        query = query.filter(models.Monument.city.ilike(f"%{city}%"))
    if q:
        query = query.filter(models.Monument.name.ilike(f"%{q}%")).limit(8)
    monuments = query.all()
    return [_monument_to_dict(m) for m in monuments]


# ── GET /monuments/bbox ────────────────────────────────────────────────────────
# Page : MapPage — monuments dans une bounding box (BETWEEN sur lat/lon, rapide avec index)
@router.get("/bbox")
def get_monuments_bbox(
    south: float = Query(..., description="Latitude sud de la bbox"),
    west:  float = Query(..., description="Longitude ouest de la bbox"),
    north: float = Query(..., description="Latitude nord de la bbox"),
    east:  float = Query(..., description="Longitude est de la bbox"),
    db: Session = Depends(get_db),
):
    monuments = db.query(models.Monument).filter(
        models.Monument.latitude.between(south, north),
        models.Monument.longitude.between(west, east),
    ).limit(500).all()
    return [_monument_to_dict(m) for m in monuments]


# ── GET /monuments/nearby ──────────────────────────────────────────────────────
# Page : MapPage — monuments dans un rayon autour de la position GPS du user
@router.get("/nearby")
def get_nearby_monuments(
    lat: float = Query(..., description="Latitude du user"),
    lon: float = Query(..., description="Longitude du user"),
    radius_km: float = Query(5.0, description="Rayon de recherche en km"),
    db: Session = Depends(get_db),
):
    monuments = db.query(models.Monument).filter(
        models.Monument.latitude.isnot(None),
        models.Monument.longitude.isnot(None),
    ).all()

    nearby = []
    for m in monuments:
        distance = _haversine_km(lat, lon, m.latitude, m.longitude)
        if distance <= radius_km:
            data = _monument_to_dict(m)
            data["distance_km"] = round(distance, 2)
            nearby.append(data)

    nearby.sort(key=lambda x: x["distance_km"])
    return nearby


# ── GET /monuments/{id} ────────────────────────────────────────────────────────
# Page : Monument — détail complet d'un monument
@router.get("/{monument_id}")
def get_monument(monument_id: int, db: Session = Depends(get_db)):
    m = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Monument introuvable")

    visit_count = len(m.visits)
    return {
        **_monument_to_dict(m, include_images=True),
        "visit_count": visit_count,
    }
