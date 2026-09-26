-- Merges Cleaning's booking subcategories into one "General Package" card:
-- Single Session (101), One-Time Cleaning (102) and Weekly Package (104) all
-- become variants under General Package (103), so the storefront shows a
-- single card whose services are listed together on one booking page.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/007-merge-cleaning-packages.sql
--
-- Idempotent: the UPDATEs/DELETE are no-ops once applied.

USE urban_service;

UPDATE catalog_services SET subcategory_id = 103 WHERE subcategory_id IN (101, 102, 104);

UPDATE catalog_subcategories
   SET name = 'General Package',
       description = 'Single visits, session bundles and weekly plans.',
       sort_order = 1
 WHERE id = 103;

DELETE FROM catalog_subcategories WHERE id IN (101, 102, 104);

UPDATE catalog_subcategories
   SET sort_order = CASE id
     WHEN 105 THEN 2
     WHEN 106 THEN 3
     WHEN 107 THEN 4
     WHEN 108 THEN 5
     WHEN 109 THEN 6
     WHEN 110 THEN 7
     WHEN 111 THEN 8
     ELSE sort_order END
 WHERE id BETWEEN 105 AND 111;
