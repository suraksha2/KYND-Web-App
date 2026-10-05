-- Optional hero/banner artwork for the storefront's ServiceDetail page
-- (ServiceHero in src/pages/ServiceDetail.jsx), set once per subcategory so
-- every service under it (e.g. all "General Package" duration options)
-- shares the same banner. Uploaded from Superadmin's Subcategory editor next
-- to the existing listing "Image". When NULL the hero keeps its existing
-- fallback chain (committed people artwork -> service image -> subcategory/
-- category tile).
--
--   mysql -u root -p urban_service < backend/db/migrations/016-subcategory-hero-image.sql
--
-- Idempotent: the column add is guarded with information_schema.

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'hero_image') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN hero_image VARCHAR(255) NULL AFTER image',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
