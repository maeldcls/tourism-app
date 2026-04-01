"""
Auth routes — Register / Login / Me

POST /auth/register  → créer un compte, retourne un JWT
POST /auth/login     → vérifier le mot de passe, retourne un JWT
GET  /auth/me        → valider le token et retourner l'utilisateur courant
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import JWTError, jwt
from database import get_db
import models
import os

router = APIRouter(prefix="/auth", tags=["Auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-super-secret-key-tourism-app")
ALGORITHM = "HS256"
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
        },
    }


class RegisterBody(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginBody(BaseModel):
    email: EmailStr
    password: str


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
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    return _user_payload(user, create_access_token(user.id))


@router.get("/me")
def me(authorization: str = Header(...), db: Session = Depends(get_db)):
    token = authorization.removeprefix("Bearer ").removeprefix("bearer ")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token invalide")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "xp": user.xp,
        "level": user.level,
    }
