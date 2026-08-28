-- Run once on existing deployments that predate the slug column.
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/001-subcategory-slug.sql
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/seed/service-subcategories.sql

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND COLUMN_NAME = 'slug') = 0,
  'ALTER TABLE service_subcategories ADD COLUMN slug VARCHAR(100) NULL AFTER id',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND INDEX_NAME = 'unique_subcategory_slug') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND COLUMN_NAME = 'slug') > 0,
  'ALTER TABLE service_subcategories ADD UNIQUE KEY unique_subcategory_slug (slug)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
