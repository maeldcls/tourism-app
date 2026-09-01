"""Constantes JWT partagées — séparées de routes/auth.py pour éviter les imports circulaires avec deps.py."""
import os

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY manquant : définissez cette variable d'environnement avant de démarrer l'API "
        "(aucune valeur par défaut n'est fournie pour éviter de signer des JWT avec un secret connu)."
    )
ALGORITHM = "HS256"
