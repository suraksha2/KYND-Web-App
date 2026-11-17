-- Session-version revocation. Existing stateless tokens have no `sv` claim and
-- are intentionally invalid after this migration; users sign in once again.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'session_version') = 0,
  'ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'session_version') = 0,
  'ALTER TABLE service_providers ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vendor_users'
      AND COLUMN_NAME = 'session_version') = 0,
  'ALTER TABLE vendor_users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 1',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
