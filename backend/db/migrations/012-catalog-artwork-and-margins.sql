-- Category and subcategory tile artwork, the "Mani Pedi" rename, and the
-- margin columns, as set up in Superadmin on the dev database (dump of
-- Oct 1 2026). The artwork files themselves are committed under
-- backend/db/public/images and ship in the backend image, so only the paths
-- are written here.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/012-catalog-artwork-and-margins.sql
--
-- Idempotent: columns are guarded with information_schema, and artwork is
-- only written where no image is set yet, so a tile changed in Superadmin
-- afterwards is left alone on a re-run.

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'net_margin') = 0,
  'ALTER TABLE catalog_services ADD COLUMN net_margin DECIMAL(10,2) NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'net_margin_pct') = 0,
  'ALTER TABLE catalog_services ADD COLUMN net_margin_pct DECIMAL(5,2) NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'actual_markup_pct') = 0,
  'ALTER TABLE catalog_services ADD COLUMN actual_markup_pct DECIMAL(5,2) NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE catalog_categories
   SET image = CASE id
     WHEN 1 THEN '/images/ChatGPT Image Sep 22 2026 10_08_58 PM.png'  -- Cleaning
     WHEN 3 THEN '/images/ChatGPT Image Sep 22 2026 10_00_24 PM.png'  -- Wellness @ Home
     WHEN 4 THEN '/images/ChatGPT Image Sep 22 2026 10_04_50 PM.png'  -- Beauty Services
     WHEN 5 THEN '/images/ChatGPT Image Sep 22 2026 10_06_47 PM.png'  -- Office Cleaning
     WHEN 6 THEN '/images/ChatGPT Image Sep 22 2026 10_07_56 PM.png'  -- Pest Control
   END
 WHERE id IN (1, 3, 4, 5, 6)
   AND (image IS NULL OR image = '');

UPDATE catalog_subcategories
   SET image = CASE id
     WHEN 103 THEN '/images/ChatGPT Image Sep 23 2026 03_29_20 PM-2.png'  -- General Package
     WHEN 105 THEN '/images/ChatGPT Image Sep 23 2026 03_32_18 PM.png'    -- Move-Out (HDB)
     WHEN 106 THEN '/images/ChatGPT Image Sep 23 2026 03_32_18 PM-2.png'  -- Move-Out (Condo)
     WHEN 108 THEN '/images/ChatGPT Image Sep 23 2026 07_13_08 PM.png'    -- Floor Deep Cleaning
     WHEN 109 THEN '/images/ChatGPT Image Sep 23 2026 07_15_04 PM.png'    -- Upholstery Cleaning
     WHEN 110 THEN '/images/ChatGPT Image Sep 23 2026 07_15_04 PM-2.png'  -- Carpet Cleaning
     WHEN 111 THEN '/images/ChatGPT Image Sep 22 2026 09_58_25 PM.png'    -- Curtain Cleaning
     WHEN 201 THEN '/images/ChatGPT Image Sep 23 2026 07_19_47 PM.png'    -- Head Massage
     WHEN 202 THEN '/images/ChatGPT Image Sep 23 2026 07_23_13 PM.png'    -- Body Massage
     WHEN 301 THEN '/images/ChatGPT Image Sep 23 2026 07_25_00 PM.png'    -- Hair Services
     WHEN 303 THEN '/images/ChatGPT Image Sep 23 2026 07_26_32 PM.png'    -- Nail Art
     WHEN 304 THEN '/images/ChatGPT Image Sep 23 2026 07_27_47 PM.png'    -- Heena Art
     WHEN 305 THEN '/images/ChatGPT Image Sep 23 2026 07_29_00 PM.png'    -- Bleach
     WHEN 306 THEN '/images/ChatGPT Image Sep 23 2026 07_30_55 PM.png'    -- Facial
     WHEN 307 THEN '/images/ChatGPT Image Sep 23 2026 07_32_24 PM.png'    -- Makeup
     WHEN 308 THEN '/images/ChatGPT Image Sep 23 2026 07_35_21 PM.png'    -- Mani Pedi
     WHEN 309 THEN '/images/ChatGPT Image Sep 23 2026 07_34_32 PM.png'    -- Hair Care
     WHEN 310 THEN '/images/ChatGPT Image Sep 23 2026 07_36_38 PM.png'    -- Waxing & Threading
     WHEN 401 THEN '/images/ChatGPT Image Sep 23 2026 07_39_13 PM.png'    -- General Office Cleaning
     WHEN 501 THEN '/images/ChatGPT Image Sep 22 2026 10_07_56 PM-2.png'  -- General Pest Control
   END
 WHERE id IN (103, 105, 106, 108, 109, 110, 111, 201, 202, 301, 303, 304, 305,
              306, 307, 308, 309, 310, 401, 501)
   AND (image IS NULL OR image = '');

UPDATE catalog_subcategories SET name = 'Mani Pedi' WHERE id = 308 AND name = 'Mani-Pedi';
