-- =============================================================================
-- Schemat users – tabele do logowania aplikacji Biomass Explorer
-- Wykonaj jako admin: cpadmin
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS users;

-- Tabela kont użytkowników aplikacji
CREATE TABLE IF NOT EXISTS users.accounts (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL,
    email           TEXT,
    full_name       VARCHAR(255),
    hashed_password TEXT         NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'user',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_accounts_username UNIQUE (username),
    CONSTRAINT uq_accounts_email    UNIQUE (email),
    CONSTRAINT ck_accounts_role     CHECK  (role IN ('admin', 'user'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_username
    ON users.accounts (username);

CREATE INDEX IF NOT EXISTS idx_accounts_email
    ON users.accounts (lower(email))
    WHERE email IS NOT NULL;

-- Uprawnienia dla użytkownika aplikacji
GRANT USAGE  ON SCHEMA users TO app_biomas_user;
GRANT SELECT, INSERT, UPDATE ON TABLE users.accounts TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE users.accounts_id_seq TO app_biomas_user;
