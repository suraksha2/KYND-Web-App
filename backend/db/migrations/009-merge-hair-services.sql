-- Merges Beauty Services' "Hair Cut" (302) into "Hair Services" (301), so the
-- storefront shows one Hair Services card whose cuts and length-based styling
-- are all listed together on one booking page.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/009-merge-hair-services.sql
--
-- Idempotent: the UPDATEs/DELETE are no-ops once applied.

USE urban_service;

UPDATE catalog_services SET subcategory_id = 301 WHERE subcategory_id = 302;

UPDATE catalog_subcategories
   SET name = 'Hair Services',
       description = 'Haircuts and styling by hair length.',
       sort_order = 1
 WHERE id = 301;

DELETE FROM catalog_subcategories WHERE id = 302;

UPDATE catalog_subcategories
   SET sort_order = CASE id
     WHEN 303 THEN 2
     WHEN 304 THEN 3
     WHEN 305 THEN 4
     WHEN 306 THEN 5
     WHEN 307 THEN 6
     WHEN 308 THEN 7
     WHEN 309 THEN 8
     WHEN 310 THEN 9
     WHEN 311 THEN 10
     ELSE sort_order END
 WHERE id BETWEEN 303 AND 311;
