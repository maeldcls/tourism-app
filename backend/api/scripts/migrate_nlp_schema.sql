-- Migration NLP schema
-- Run: docker-compose exec db psql -U postgres -d tourism_app_db -f /scripts/migrate_nlp_schema.sql

-- 1. Colonne taste_profile sur users (profil de goûts JSON)
ALTER TABLE users ADD COLUMN IF NOT EXISTS taste_profile TEXT;

-- 2. Changer embedding de BIGINT -> TEXT sur monuments
ALTER TABLE monuments ALTER COLUMN embedding TYPE TEXT USING NULL;

-- 3. Recréer monuments_theme avec la bonne structure (monument_id FK + contrainte unique)
DROP TABLE IF EXISTS monuments_theme CASCADE;

CREATE TABLE monuments_theme (
    id BIGSERIAL PRIMARY KEY,
    monument_id BIGINT NOT NULL REFERENCES monuments(id) ON DELETE CASCADE,
    theme VARCHAR(100) NOT NULL,
    confidence FLOAT NOT NULL,
    CONSTRAINT uq_monument_theme UNIQUE (monument_id, theme)
);
