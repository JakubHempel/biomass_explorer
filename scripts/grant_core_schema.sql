-- Uprawnienia do schematu core
-- Uruchom jako administrator bazy (właściciel bazy lub superuser).

-- 1. Utworzenie schematu (jeśli nie istnieje)
CREATE SCHEMA IF NOT EXISTS core;

-- 2. USAGE na schemacie – umożliwia wejście do schematu i odwołania do obiektów
GRANT USAGE ON SCHEMA core TO app_biomas_user;

-- 3. Pełne uprawnienia na wszystkich tabelach w core (obecnych)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO app_biomas_user;

-- 4. Uprawnienia do sekwencji (np. dla SERIAL/BIGSERIAL)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO app_biomas_user;

-- 5. Dla przyszłych tabel/sekwencji tworzonych w core (odblokuj, jeśli tabele tworzy inna rola)
-- ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_biomas_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT USAGE, SELECT ON SEQUENCES TO app_biomas_user;
