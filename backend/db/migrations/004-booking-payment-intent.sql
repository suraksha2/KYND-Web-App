-- Link card-paid bookings to Airwallex PaymentIntents (MySQL 8).
--   cat backend/db/migrations/004-booking-payment-intent.sql | \
--     docker compose --env-file .env.docker exec -T mysql \
--     bash -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service'

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'payment_intent_id') = 0,
  'ALTER TABLE bookings ADD COLUMN payment_intent_id VARCHAR(128) NULL AFTER payment',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND INDEX_NAME = 'idx_bookings_payment_intent') = 0,
  'ALTER TABLE bookings ADD UNIQUE KEY idx_bookings_payment_intent (payment_intent_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
