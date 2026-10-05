-- Admin-editable home sizes for the storefront's house-cleaning size/hours/
-- cleaners picker (src/pages/ServiceDetail.jsx, HousePicker + HOME_SIZES).
-- That list was previously hardcoded in the storefront; this lets it be set
-- per subcategory from Superadmin instead, while the storefront UI itself is
-- unchanged — it just reads this column and falls back to the old
-- Studio/1BR/2BR/3BR/4BR+ defaults when it's NULL/empty.
--
-- Idempotent: column add is guarded with information_schema, and the backfill
-- only touches subcategory 103 ("General Package", the one subcategory the
-- house-cleaning picker activates for today) and only when home_sizes is
-- still unset, so a value set from Superadmin afterwards is left alone.
--
--   mysql -u root -p urban_service < backend/db/migrations/013-subcategory-home-sizes.sql

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'home_sizes') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN home_sizes JSON NULL AFTER is_addon',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE catalog_subcategories
   SET home_sizes = JSON_ARRAY(
     JSON_OBJECT('label', 'Studio', 'hours', 2,   'description', 'A studio'),
     JSON_OBJECT('label', '1BR',    'hours', 2.5, 'description', 'A 1-bedroom'),
     JSON_OBJECT('label', '2BR',    'hours', 3,   'description', 'A 2-bedroom'),
     JSON_OBJECT('label', '3BR',    'hours', 4,   'description', 'A 3-bedroom'),
     JSON_OBJECT('label', '4BR+',   'hours', 4,   'description', 'A 4-bedroom')
   )
 WHERE id = 103
   AND home_sizes IS NULL;
