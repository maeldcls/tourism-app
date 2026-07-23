"""Dépendances d'authentification partagées entre les routes."""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from database import get_db
from security import SECRET_KEY, ALGORITHM
import models


def get_current_user(authorization: str = Header(...), db: Session = Depends(get_db)) -> models.User:
    token = authorization.removeprefix("Bearer ").removeprefix("bearer ")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token invalide")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Accès réservé aux administrateurs")
    return user
