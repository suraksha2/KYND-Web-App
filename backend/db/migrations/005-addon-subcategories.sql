-- Marks a subcategory as holding add-ons rather than standalone services.
-- The five rows under Cleaning > "Add-On Services" (ceiling fan, fridge, oven,
-- grilles, blinds) are catalog services like any other, but they are only sold
-- on top of a real booking — so they belong in the booking form's Add-ons
-- panel, not in the storefront's service grid.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/005-addon-subcategories.sql
--
-- Idempotent.

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'is_addon') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN is_addon TINYINT(1) NOT NULL DEFAULT 0 AFTER description',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE catalog_subcategories SET is_addon = 1 WHERE name = 'Add-On Services';
