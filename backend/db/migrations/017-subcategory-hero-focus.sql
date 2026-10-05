-- Focal point for the subcategory hero image (see 016-subcategory-hero-image.sql).
-- ServiceHero in src/pages/ServiceDetail.jsx renders the banner with
-- object-cover across several different aspect ratios (mobile -> desktop),
-- so a single crop can cut off the subject on some breakpoints. This stores
-- a CSS object-position keyword pair ("center top", "left center", ...) that
-- Superadmin's focal-point picker sets, so the important part of the photo
-- stays visible everywhere. NULL/unset falls back to "center center".
--
--   mysql -u root -p urban_service < backend/db/migrations/017-subcategory-hero-focus.sql
--
-- Idempotent: the column add is guarded with information_schema.

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'hero_image_focus') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN hero_image_focus VARCHAR(20) NULL AFTER hero_image',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
