-- Track reconciliation attempts so the cleanup job can progress past active or
-- provider-unknown intents without repeatedly scanning the same first batch.
-- Safe to run when 025 has not created payment_checkouts yet; apply after 025.
USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts') > 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts'
      AND COLUMN_NAME = 'last_reconciled_at') = 0,
  'ALTER TABLE payment_checkouts ADD COLUMN last_reconciled_at DATETIME NULL AFTER created_at',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts') > 0
  AND (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_checkouts'
      AND INDEX_NAME = 'idx_payment_checkouts_reconcile') = 0,
  'ALTER TABLE payment_checkouts ADD KEY idx_payment_checkouts_reconcile (last_reconciled_at, created_at)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
