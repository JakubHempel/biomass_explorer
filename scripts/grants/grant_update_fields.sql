-- UPDATE permissions for app_biomas_user (needed for field editing)
GRANT UPDATE ON core.fields              TO app_biomas_user;
GRANT UPDATE ON agro.field_crops         TO app_biomas_user;
GRANT UPDATE ON geo.fields_location      TO app_biomas_user;
GRANT UPDATE ON geo.field_crop_geometry  TO app_biomas_user;
GRANT UPDATE ON stg.field_geom           TO app_biomas_user;
