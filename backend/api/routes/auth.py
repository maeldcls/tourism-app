"""
Auth routes — page Login / Register (pas encore de page dédiée dans le front,
mais nécessaire pour toutes les pages protégées).

POST /auth/register  → créer un compte
POST /auth/login     → vérifier le mot de passe, retourne les infos user
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from database import get_db
import models

router = APIRouter(prefix="/auth", tags=["Auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "xp": user.xp,
        "level": user.level,
    }


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "xp": user.xp,
        "level": user.level,
    }
