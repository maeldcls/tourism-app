"""
Routes de test temporaires — CRUD sur toutes les tables.
A SUPPRIMER avant la mise en production.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import models

router = APIRouter(prefix="/test", tags=["TEST - A supprimer"])


# ─── SCHEMAS ──────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    username: str
    password_hash: str
    xp: Optional[int] = 0
    level: Optional[int] = 1

class UserUpdate(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    xp: Optional[int] = None
    level: Optional[int] = None


class MonumentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class MonumentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    city: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class BadgeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon_url: Optional[str] = None

class BadgeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon_url: Optional[str] = None


class VisitCreate(BaseModel):
    user_id: int
    monument_id: int
    gpt_lat: Optional[float] = None
    gps_lon: Optional[float] = None


class XpHistoryCreate(BaseModel):
    user_id: int
    action: str
    xp: int


class UserBadgeCreate(BaseModel):
    user_id: int
    badge_id: int


class MonumentThemeCreate(BaseModel):
    theme: str
    confidence: Optional[float] = None


# ─── USERS ────────────────────────────────────────────────────────────────────

@router.get("/users")
def get_users(db: Session = Depends(get_db)):
    return db.query(models.User).all()

@router.post("/users")
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    user = models.User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"deleted": user_id}


# ─── MONUMENTS ────────────────────────────────────────────────────────────────

@router.get("/monuments")
def get_monuments(db: Session = Depends(get_db)):
    return db.query(models.Monument).all()

@router.post("/monuments")
def create_monument(data: MonumentCreate, db: Session = Depends(get_db)):
    monument = models.Monument(**data.model_dump())
    db.add(monument)
    db.commit()
    db.refresh(monument)
    return monument

@router.put("/monuments/{monument_id}")
def update_monument(monument_id: int, data: MonumentUpdate, db: Session = Depends(get_db)):
    monument = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument not found")
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(monument, key, value)
    db.commit()
    db.refresh(monument)
    return monument

@router.delete("/monuments/{monument_id}")
def delete_monument(monument_id: int, db: Session = Depends(get_db)):
    monument = db.query(models.Monument).filter(models.Monument.id == monument_id).first()
    if not monument:
        raise HTTPException(status_code=404, detail="Monument not found")
    db.delete(monument)
    db.commit()
    return {"deleted": monument_id}


# ─── BADGES ───────────────────────────────────────────────────────────────────

@router.get("/badges")
def get_badges(db: Session = Depends(get_db)):
    return db.query(models.Badge).all()

@router.post("/badges")
def create_badge(data: BadgeCreate, db: Session = Depends(get_db)):
    badge = models.Badge(**data.model_dump())
    db.add(badge)
    db.commit()
    db.refresh(badge)
    return badge

@router.put("/badges/{badge_id}")
def update_badge(badge_id: int, data: BadgeUpdate, db: Session = Depends(get_db)):
    badge = db.query(models.Badge).filter(models.Badge.id == badge_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(badge, key, value)
    db.commit()
    db.refresh(badge)
    return badge

@router.delete("/badges/{badge_id}")
def delete_badge(badge_id: int, db: Session = Depends(get_db)):
    badge = db.query(models.Badge).filter(models.Badge.id == badge_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Badge not found")
    db.delete(badge)
    db.commit()
    return {"deleted": badge_id}


# ─── VISITS ───────────────────────────────────────────────────────────────────

@router.get("/visits")
def get_visits(db: Session = Depends(get_db)):
    return db.query(models.Visit).all()

@router.post("/visits")
def create_visit(data: VisitCreate, db: Session = Depends(get_db)):
    visit = models.Visit(**data.model_dump())
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return visit

@router.delete("/visits/{visit_id}")
def delete_visit(visit_id: int, db: Session = Depends(get_db)):
    visit = db.query(models.Visit).filter(models.Visit.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visit not found")
    db.delete(visit)
    db.commit()
    return {"deleted": visit_id}


# ─── XP HISTORY ───────────────────────────────────────────────────────────────

@router.get("/xp-history")
def get_xp_history(db: Session = Depends(get_db)):
    return db.query(models.XpHistory).all()

@router.post("/xp-history")
def create_xp_history(data: XpHistoryCreate, db: Session = Depends(get_db)):
    entry = models.XpHistory(**data.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

@router.delete("/xp-history/{entry_id}")
def delete_xp_history(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(models.XpHistory).filter(models.XpHistory.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    return {"deleted": entry_id}


# ─── USER BADGES ──────────────────────────────────────────────────────────────

@router.get("/user-badges")
def get_user_badges(db: Session = Depends(get_db)):
    return db.query(models.UserBadge).all()

@router.post("/user-badges")
def create_user_badge(data: UserBadgeCreate, db: Session = Depends(get_db)):
    ub = models.UserBadge(**data.model_dump())
    db.add(ub)
    db.commit()
    db.refresh(ub)
    return ub

@router.delete("/user-badges/{user_id}/{badge_id}")
def delete_user_badge(user_id: int, badge_id: int, db: Session = Depends(get_db)):
    ub = db.query(models.UserBadge).filter(
        models.UserBadge.user_id == user_id,
        models.UserBadge.badge_id == badge_id
    ).first()
    if not ub:
        raise HTTPException(status_code=404, detail="UserBadge not found")
    db.delete(ub)
    db.commit()
    return {"deleted": {"user_id": user_id, "badge_id": badge_id}}


# ─── MONUMENTS THEME ──────────────────────────────────────────────────────────

@router.get("/monuments-theme")
def get_monuments_theme(db: Session = Depends(get_db)):
    return db.query(models.MonumentTheme).all()

@router.post("/monuments-theme")
def create_monument_theme(data: MonumentThemeCreate, db: Session = Depends(get_db)):
    theme = models.MonumentTheme(**data.model_dump())
    db.add(theme)
    db.commit()
    db.refresh(theme)
    return theme

@router.delete("/monuments-theme/{theme_id}")
def delete_monument_theme(theme_id: int, db: Session = Depends(get_db)):
    theme = db.query(models.MonumentTheme).filter(models.MonumentTheme.id == theme_id).first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")
    db.delete(theme)
    db.commit()
    return {"deleted": theme_id}
