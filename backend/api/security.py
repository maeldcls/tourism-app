"""Constantes JWT partagées — séparées de routes/auth.py pour éviter les imports circulaires avec deps.py."""
import os

SECRET_KEY = os.getenv("SECRET_KEY", "changeme-super-secret-key-tourism-app")
ALGORITHM = "HS256"
