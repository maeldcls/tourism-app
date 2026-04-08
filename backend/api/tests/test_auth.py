"""
Tests unitaires des routes d'authentification : /auth/register, /auth/login, /auth/me
"""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def register(client, email="user@test.com", username="testuser", password="pass1234"):
    return client.post("/auth/register", json={
        "email": email,
        "username": username,
        "password": password,
    })


def login(client, email="user@test.com", password="pass1234"):
    return client.post("/auth/login", json={"email": email, "password": password})


# ---------------------------------------------------------------------------
# POST /auth/register
# ---------------------------------------------------------------------------

class TestRegister:

    def test_register_retourne_201_et_token(self, client):
        res = register(client)
        assert res.status_code == 201
        data = res.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_register_retourne_les_infos_utilisateur(self, client):
        res = register(client, email="new@test.com", username="newuser")
        user = res.json()["user"]
        assert user["email"] == "new@test.com"
        assert user["username"] == "newuser"
        assert user["xp"] == 0
        assert user["level"] == 1

    def test_register_email_deja_utilise(self, client):
        register(client, email="dup@test.com", username="user1")
        res = register(client, email="dup@test.com", username="user2")
        assert res.status_code == 409
        assert res.json()["detail"] == "Email déjà utilisé"

    def test_register_username_deja_utilise(self, client):
        register(client, email="a@test.com", username="sameuser")
        res = register(client, email="b@test.com", username="sameuser")
        assert res.status_code == 409
        assert res.json()["detail"] == "Username déjà utilisé"

    def test_register_email_invalide(self, client):
        res = client.post("/auth/register", json={
            "email": "pas-un-email",
            "username": "testuser",
            "password": "pass1234",
        })
        # Pydantic EmailStr rejette le format
        assert res.status_code == 422

    def test_register_champs_manquants(self, client):
        res = client.post("/auth/register", json={"email": "x@test.com"})
        assert res.status_code == 422


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------

class TestLogin:

    def test_login_succes_retourne_token(self, client):
        register(client)
        res = login(client)
        assert res.status_code == 200
        assert "access_token" in res.json()

    def test_login_retourne_les_infos_utilisateur(self, client):
        register(client, email="login@test.com", username="loginuser")
        res = login(client, email="login@test.com")
        user = res.json()["user"]
        assert user["email"] == "login@test.com"
        assert user["username"] == "loginuser"

    def test_login_mauvais_mot_de_passe(self, client):
        register(client)
        res = login(client, password="mauvaispass")
        assert res.status_code == 401
        assert res.json()["detail"] == "Email ou mot de passe incorrect"

    def test_login_email_inexistant(self, client):
        res = login(client, email="inconnu@test.com")
        assert res.status_code == 401
        assert res.json()["detail"] == "Email ou mot de passe incorrect"

    def test_login_email_invalide(self, client):
        res = client.post("/auth/login", json={"email": "pas-un-email", "password": "pass"})
        assert res.status_code == 422

    def test_login_champs_manquants(self, client):
        res = client.post("/auth/login", json={"email": "x@test.com"})
        assert res.status_code == 422


# ---------------------------------------------------------------------------
# GET /auth/me
# ---------------------------------------------------------------------------

class TestMe:

    def test_me_retourne_utilisateur_courant(self, client):
        token = register(client, email="me@test.com", username="meuser").json()["access_token"]
        res = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res.status_code == 200
        data = res.json()
        assert data["email"] == "me@test.com"
        assert data["username"] == "meuser"

    def test_me_token_invalide(self, client):
        res = client.get("/auth/me", headers={"Authorization": "Bearer tokenbidon"})
        assert res.status_code == 401
        assert res.json()["detail"] == "Token invalide"

    def test_me_sans_header_authorization(self, client):
        res = client.get("/auth/me")
        # FastAPI retourne 422 si un Header(...) obligatoire est absent
        assert res.status_code == 422

    def test_me_token_du_bon_utilisateur(self, client):
        token_a = register(client, email="a@test.com", username="usera").json()["access_token"]
        register(client, email="b@test.com", username="userb")
        res = client.get("/auth/me", headers={"Authorization": f"Bearer {token_a}"})
        assert res.json()["email"] == "a@test.com"
