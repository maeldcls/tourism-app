"""
Configuration pytest partagée pour tous les tests backend.

On utilise une base SQLite en mémoire pour éviter de dépendre de PostgreSQL
pendant les tests. La dépendance get_db est surchargée via FastAPI dependency override.
"""
import sys
import os

# Permet à pytest de trouver les modules du projet (models, database, main…)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base, get_db
from main import app

SQLITE_URL = "sqlite:///./test_tourism.db"

engine = create_engine(SQLITE_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Crée les tables avant chaque test et les supprime après."""
    Base.metadata.create_all(bind=engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """Client HTTP de test avec la DB SQLite injectée."""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
