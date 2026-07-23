"""
Auth routes — Register / Login / Me / Google OAuth

POST /auth/register  → créer un compte, retourne un JWT
POST /auth/login     → vérifier le mot de passe, retourne un JWT
POST /auth/google    → authentification via Google ID token, retourne un JWT
GET  /auth/me        → valider le token et retourner l'utilisateur courant
"""
from datetime import datetime, timedelta, timezone
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from database import get_db
from deps import get_current_user
from security import SECRET_KEY, ALGORITHM
import models
import os

router = APIRouter(prefix="/auth", tags=["Auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
ACCESS_TOKEN_EXPIRE_DAYS = 30


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def _user_payload(user: models.User, token: str) -> dict:
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "xp": user.xp,
            "level": user.level,
            "is_admin": user.is_admin,
        },
    }


def _unique_username(db: Session, base: str) -> str:
    slug = re.sub(r"[^a-z0-9_]", "_", base.lower())[:30].strip("_") or "user"
    candidate = slug
    counter = 1
    while db.query(models.User).filter(models.User.username == candidate).first():
        candidate = f"{slug}{counter}"
        counter += 1
    return candidate


class RegisterBody(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class GoogleBody(BaseModel):
    token: str


@router.post("/register", status_code=201)
def register(body: RegisterBody, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(status_code=409, detail="Email déjà utilisé")
    if db.query(models.User).filter(models.User.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username déjà utilisé")

    user = models.User(
        email=body.email,
        username=body.username,
        password_hash=pwd_context.hash(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_payload(user, create_access_token(user.id))


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not user.password_hash or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    return _user_payload(user, create_access_token(user.id))


@router.post("/google")
def google_auth(body: GoogleBody, db: Session = Depends(get_db)):
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth non configuré")
    try:
        id_info = id_token.verify_oauth2_token(
            body.token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Token Google invalide")

    google_id = id_info["sub"]
    email = id_info["email"]
    display_name = id_info.get("name", email.split("@")[0])

    user = db.query(models.User).filter(models.User.google_id == google_id).first()
    if not user:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            user.google_id = google_id
        else:
            user = models.User(
                email=email,
                username=_unique_username(db, display_name),
                google_id=google_id,
            )
            db.add(user)

    db.commit()
    db.refresh(user)
    return _user_payload(user, create_access_token(user.id))


@router.get("/me")
def me(user: models.User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "xp": user.xp,
        "level": user.level,
        "is_admin": user.is_admin,
    }
