-- Enforce one first-booking discount redemption per customer.
-- Run with: mysql -u root -p urban_service < backend/db/migrations/020-first-booking-discount-redemptions.sql

USE urban_service;

CREATE TABLE IF NOT EXISTS first_booking_discount_redemptions (
  user_id INT NOT NULL PRIMARY KEY,
  booking_id INT NULL UNIQUE,
  redeemed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);
