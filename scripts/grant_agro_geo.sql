-- Uprawnienia app_biomas_user na tabele agro i geo.field_crop_geometry
-- Uruchom jako administrator bazy.

GRANT USAGE ON SCHEMA agro TO app_biomas_user;
GRANT SELECT, INSERT       ON agro.crops          TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE agro.crops_id_seq TO app_biomas_user;
GRANT SELECT, INSERT       ON agro.field_crops     TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE agro.field_crops_id_seq TO app_biomas_user;

GRANT SELECT, INSERT       ON geo.field_crop_geometry TO app_biomas_user;

-- core.owners + core.field_owners (potrzebne do zapisu właściciela)
GRANT SELECT, INSERT       ON core.owners         TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE core.owners_id_seq TO app_biomas_user;
GRANT SELECT, INSERT       ON core.field_owners   TO app_biomas_user;
