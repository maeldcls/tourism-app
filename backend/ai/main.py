from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from detoxify import Detoxify
import numpy as np
from typing import Optional

app = FastAPI(title="AI Recommendation Service")

model = SentenceTransformer("all-MiniLM-L6-v2")

# Modèle multilingue (fr, en, es, it, pt, tr, ru) pour la pré-modération des commentaires
toxicity_model = Detoxify("multilingual")
TOXICITY_THRESHOLD = 0.5

# Taxonomie fixe de thèmes avec descriptions sémantiques pour le zero-shot
THEMES: dict[str, str] = {
    "musée": "museum exhibition collection gallery artifacts display",
    "art": "painting artwork sculpture fine arts canvas brushwork",
    "antiquité": "ancient antique greco-roman egyptian prehistoric archaeological ruins",
    "architecture": "building architectural facade design construction engineering landmark",
    "religion": "church cathedral mosque temple sacred religious spiritual worship",
    "nature": "garden park forest natural landscape botanical outdoor greenery",
    "histoire": "historical history heritage memorial war revolution political past",
    "moderne": "contemporary modern 20th century design innovation recent urban",
    "médiéval": "medieval middle ages castle fortress knight gothic ramparts",
    "militaire": "military fortress war battle defense army citadel bunker",
    "science": "science technology discovery invention natural history laboratory",
    "château": "palace château royal residence aristocratic mansion stately home",
    "spectacle": "theater opera concert hall performance entertainment stage cultural",
    "sport": "sport stadium arena olympic athletics competition gymnasium",
    "gastronomie": "gastronomy food wine culinary market cuisine tasting local produce",
}

_theme_embeddings: dict[str, np.ndarray] | None = None


def get_theme_embeddings() -> dict[str, np.ndarray]:
    global _theme_embeddings
    if _theme_embeddings is None:
        _theme_embeddings = {
            theme: model.encode(desc)
            for theme, desc in THEMES.items()
        }
    return _theme_embeddings


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


# --- Schémas ---

class MonumentInput(BaseModel):
    name: str
    description: Optional[str] = ""
    category: Optional[str] = ""


class ThemeScore(BaseModel):
    theme: str
    confidence: float


class TagResponse(BaseModel):
    themes: list[ThemeScore]


class EmbedResponse(BaseModel):
    embedding: list[float]


class MonumentWithThemes(BaseModel):
    monument_id: int
    name: str
    description: Optional[str] = ""
    category: Optional[str] = ""
    themes: list[ThemeScore] = []


class UserTasteResponse(BaseModel):
    themes: list[ThemeScore]
    embedding: list[float]


class ModerationInput(BaseModel):
    text: str


class ModerationResponse(BaseModel):
    score: float
    labels: dict[str, float]
    flagged: bool


# --- Endpoints ---

@app.post("/tag-monument", response_model=TagResponse)
def tag_monument(monument: MonumentInput):
    text = f"{monument.name} {monument.category} {monument.description or ''}".strip()
    monument_emb = model.encode(text)
    theme_embs = get_theme_embeddings()

    scores = []
    for theme, theme_emb in theme_embs.items():
        sim = cosine_similarity(monument_emb, theme_emb)
        if sim >= 0.2:
            scores.append(ThemeScore(theme=theme, confidence=round(sim, 4)))

    scores.sort(key=lambda x: x.confidence, reverse=True)
    return TagResponse(themes=scores[:5])


@app.post("/embed-monument", response_model=EmbedResponse)
def embed_monument(monument: MonumentInput):
    text = f"{monument.name} {monument.category} {monument.description or ''}".strip()
    embedding = model.encode(text).tolist()
    return EmbedResponse(embedding=embedding)


@app.post("/user-taste", response_model=UserTasteResponse)
def user_taste(monuments: list[MonumentWithThemes]):
    if not monuments:
        return UserTasteResponse(themes=[], embedding=[])

    # Agrège les scores de thèmes pondérés par confidence
    theme_scores: dict[str, float] = {}
    for monument in monuments:
        for ts in monument.themes:
            theme_scores[ts.theme] = theme_scores.get(ts.theme, 0.0) + ts.confidence

    # Normalise
    total = sum(theme_scores.values()) or 1.0
    aggregated = [
        ThemeScore(theme=t, confidence=round(s / total, 4))
        for t, s in theme_scores.items()
    ]
    aggregated.sort(key=lambda x: x.confidence, reverse=True)

    # Embedding moyen des monuments connus
    embeddings = []
    for m in monuments:
        text = f"{m.name} {m.category} {m.description or ''}".strip()
        embeddings.append(model.encode(text))

    mean_embedding = np.mean(embeddings, axis=0).tolist()

    return UserTasteResponse(themes=aggregated[:8], embedding=mean_embedding)


@app.get("/themes")
def list_themes():
    return {"themes": list(THEMES.keys())}


@app.post("/moderate-comment", response_model=ModerationResponse)
def moderate_comment(body: ModerationInput):
    """Score de toxicité d'un commentaire. `score` = le plus élevé de tous les labels prédits."""
    raw = toxicity_model.predict(body.text)
    labels = {k: round(float(v), 4) for k, v in raw.items()}
    score = max(labels.values()) if labels else 0.0
    return ModerationResponse(score=score, labels=labels, flagged=score >= TOXICITY_THRESHOLD)
