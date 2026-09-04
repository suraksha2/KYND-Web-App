-- Harden an existing urban_service volume for production (MySQL 8).
-- Run after git pull:
--   cat backend/db/migrations/003-production-harden.sql | \
--     docker compose --env-file .env.docker exec -T mysql \
--     bash -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service'

USE urban_service;

-- Clear password-reset tokens left in dumps / stale sessions
UPDATE users SET reset_token = NULL, reset_token_expiry = NULL
 WHERE reset_token IS NOT NULL OR reset_token_expiry IS NOT NULL;

-- Rewrite localhost image URLs baked into booking JSON (best-effort)
UPDATE bookings
   SET items = REPLACE(items, 'http://localhost:3001', '')
 WHERE items LIKE '%http://localhost:3001%';

UPDATE bookings
   SET items = REPLACE(items, 'http://127.0.0.1:3001', '')
 WHERE items LIKE '%http://127.0.0.1:3001%';

-- Backfill empty help-moment slugs before NOT NULL
UPDATE service_subcategories
   SET slug = CONCAT('moment-', id)
 WHERE slug IS NULL OR slug = '';

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND COLUMN_NAME = 'slug' AND IS_NULLABLE = 'YES') > 0,
  'ALTER TABLE service_subcategories MODIFY COLUMN slug VARCHAR(100) NOT NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND INDEX_NAME = 'unique_subcategory_slug') = 0,
  'ALTER TABLE service_subcategories ADD UNIQUE KEY unique_subcategory_slug (slug)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bookings.user_id FK
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'fk_bookings_user') = 0
  AND (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users') = 0,
  'ALTER TABLE bookings ADD CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND INDEX_NAME = 'idx_bookings_user') = 0,
  'ALTER TABLE bookings ADD KEY idx_bookings_user (user_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND INDEX_NAME = 'idx_bookings_status_placed') = 0,
  'ALTER TABLE bookings ADD KEY idx_bookings_status_placed (status, placed_at)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategory_services'
      AND INDEX_NAME = 'unique_subcategory_catalog_service') = 0,
  'ALTER TABLE service_subcategory_services ADD UNIQUE KEY unique_subcategory_catalog_service (subcategory_id, service_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_booking_modes'
      AND INDEX_NAME = 'unique_service_mode') = 0,
  'ALTER TABLE service_booking_modes ADD UNIQUE KEY unique_service_mode (service_id, mode)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'review_count') = 0,
  'ALTER TABLE service_providers ADD COLUMN review_count INT DEFAULT 0',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'working_hours') = 0,
  'ALTER TABLE service_providers ADD COLUMN working_hours JSON',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Fix broken AUTO_INCREMENT on service_addons (phpMyAdmin dump often omits next value)
SET @next := (SELECT IFNULL(MAX(id), 0) + 1 FROM service_addons);
SET @stmt := CONCAT('ALTER TABLE service_addons AUTO_INCREMENT = ', @next);
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
