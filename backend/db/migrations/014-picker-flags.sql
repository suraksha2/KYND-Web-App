-- Explicit booking behavior + picker-option flags (the "proper" version of
-- what the storefront previously inferred from service names).
--
-- catalog_subcategories.booking_behavior:
--   NULL / 'auto' keeps today's behaviour — src/pages/ServiceDetail.jsx
--   infers the picker from service/category/subcategory name regexes
--   (HOUSE_RE, MOVE_OUT_RE, MULTI_SELECT_GROUPS, office/wellness, duration
--   list). An explicit value forces that picker regardless of names:
--     simple_list | duration_list | multi_select | room_type |
--     house_cleaning | office_cleaning | wellness_session
--
-- catalog_services.is_picker_option:
--   only read under 'house_cleaning' — flagged rows are the "Hours per
--   visit" options, unflagged siblings stay hidden (visiting one directly
--   still re-anchors to the closest flagged option). With zero flagged rows
--   the storefront falls back to the old "One-Time Cleaning" name rule, so
--   existing data keeps working before anyone touches the flags.
--
-- Backfill reproduces exactly what the storefront infers today, so this is
-- a no-op visually: subcategory 103 ("General Package") becomes
-- house_cleaning and its four "One-Time Cleaning X hr" rows are flagged.
-- Every other subcategory/service stays NULL/0 = auto.
--
--   mysql -u root -p urban_service < backend/db/migrations/014-picker-flags.sql

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'booking_behavior') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN booking_behavior VARCHAR(32) NULL AFTER home_sizes',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'is_picker_option') = 0,
  'ALTER TABLE catalog_services ADD COLUMN is_picker_option TINYINT(1) NOT NULL DEFAULT 0 AFTER status',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE catalog_subcategories
   SET booking_behavior = 'house_cleaning'
 WHERE id = 103
   AND booking_behavior IS NULL;

UPDATE catalog_services
   SET is_picker_option = 1
 WHERE subcategory_id = 103
   AND name LIKE 'One-Time Cleaning%';
