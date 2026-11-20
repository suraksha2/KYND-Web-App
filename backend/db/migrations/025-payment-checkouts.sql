-- Server-side snapshot of each card checkout so a paid order can be recovered
-- even if the browser loses its saved pending order.
USE urban_service;

CREATE TABLE IF NOT EXISTS payment_checkouts (
  payment_intent_id VARCHAR(128) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  booking_ref VARCHAR(50) NOT NULL,
  order_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_reconciled_at DATETIME NULL,
  KEY idx_payment_checkouts_user (user_id, created_at),
  KEY idx_payment_checkouts_reconcile (last_reconciled_at, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
