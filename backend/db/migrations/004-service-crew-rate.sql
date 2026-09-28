-- Crew size and rate basis per catalog service, so the storefront's variant
-- picker can render "1 worker · day rate" under each option instead of parsing
-- it back out of the free-text description.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/004-service-crew-rate.sql
--
-- Idempotent: guarded with information_schema, and the backfill only writes
-- rows that are still NULL.

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'worker_count') = 0,
  'ALTER TABLE catalog_services ADD COLUMN worker_count TINYINT UNSIGNED NULL AFTER duration',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Free-form rather than an ENUM: new rate bases (public holiday, weekend, ...)
-- should not need another ALTER.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'rate_type') = 0,
  'ALTER TABLE catalog_services ADD COLUMN rate_type VARCHAR(32) NULL AFTER worker_count',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill from the text the Service Master import left behind. Kept in sync
-- with the same block at the end of backend/db/seed/catalog-services.sql.
UPDATE catalog_services
   SET worker_count = CAST(SUBSTRING_INDEX(REGEXP_SUBSTR(description, '[0-9]+ worker'), ' ', 1) AS UNSIGNED)
 WHERE worker_count IS NULL
   AND description REGEXP '[0-9]+ worker';

UPDATE catalog_services
   SET rate_type = CASE
     WHEN notes LIKE '%day rate applied here%' THEN 'day_rate'
     WHEN description LIKE 'Per unit%' THEN 'per_unit'
     WHEN description LIKE 'Per job%' THEN 'per_job'
     WHEN notes LIKE '%Monthly package price%'
       OR notes LIKE '%sessions combined%'
       OR description LIKE '%session bundle%' THEN 'package'
     ELSE NULL
   END
 WHERE rate_type IS NULL;
