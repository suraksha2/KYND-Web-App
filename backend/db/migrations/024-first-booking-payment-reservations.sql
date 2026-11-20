-- Bind the one-time first-booking discount to the unpaid intent that reserved it.
-- Existing redemption rows remain consumed; only new rows can be reservations.
USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'first_booking_discount_redemptions'
      AND COLUMN_NAME = 'payment_intent_id') = 0,
  'ALTER TABLE first_booking_discount_redemptions ADD COLUMN payment_intent_id VARCHAR(128) NULL AFTER booking_id',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'first_booking_discount_redemptions'
      AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE first_booking_discount_redemptions ADD COLUMN status ENUM(''reserved'', ''redeemed'') NOT NULL DEFAULT ''redeemed'' AFTER payment_intent_id',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'first_booking_discount_redemptions'
      AND INDEX_NAME = 'unique_first_booking_payment_intent') = 0,
  'ALTER TABLE first_booking_discount_redemptions ADD UNIQUE KEY unique_first_booking_payment_intent (payment_intent_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
