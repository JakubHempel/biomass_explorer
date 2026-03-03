-- Uprawnienia app_biomas_user do zapisu pól (core, geo, stg).
-- Uruchom jako administrator bazy.

-- core.fields
GRANT USAGE ON SCHEMA core TO app_biomas_user;
GRANT SELECT, INSERT ON TABLE core.fields TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE core.fields_id_seq TO app_biomas_user;

-- geo.fields_location
GRANT USAGE ON SCHEMA geo TO app_biomas_user;
GRANT SELECT, INSERT ON TABLE geo.fields_location TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE geo.fields_location_id_seq TO app_biomas_user;

-- stg.field_geom
GRANT USAGE ON SCHEMA stg TO app_biomas_user;
GRANT SELECT, INSERT ON TABLE stg.field_geom TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE stg.field_geom_id_seq TO app_biomas_user;

-- obs.vegetation_indices (existing)
GRANT USAGE ON SCHEMA obs TO app_biomas_user;
GRANT SELECT, INSERT, UPDATE ON TABLE obs.vegetation_indices TO app_biomas_user;
GRANT USAGE, SELECT ON SEQUENCE obs.vegetation_indices_id_seq TO app_biomas_user;
