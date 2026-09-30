-- Merges Beauty Services' "Waxing" (311) into "Threading" (310), renamed to
-- "Waxing & Threading", so the storefront shows one card whose threading and
-- waxing services are all listed together on one booking page.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/011-merge-waxing-threading.sql
--
-- Idempotent: the UPDATEs/DELETE are no-ops once applied.

USE urban_service;

UPDATE catalog_services SET subcategory_id = 310 WHERE subcategory_id = 311;

UPDATE catalog_subcategories
   SET name = 'Waxing & Threading',
       description = 'Eyebrow, lips, face, arms, legs, underarm and back.',
       sort_order = 9
 WHERE id = 310;

DELETE FROM catalog_subcategories WHERE id = 311;
