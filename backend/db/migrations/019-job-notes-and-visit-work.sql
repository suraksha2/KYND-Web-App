-- Vendor Job detail parity for KYND marketplace visits (bookings matched to a
-- vendor's own team member, which have no `jobs` row): checklist, photos,
-- notes and a "started" stamp per visit, plus a Notes field on `jobs`.
-- See booking_visit_work in db.sql and the mkt-* routes in routes/vendor.ts.
--
--   mysql -u root -p urban_service < backend/db/migrations/019-job-notes-and-visit-work.sql
--
-- Idempotent: the column add is guarded with information_schema.

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
      AND COLUMN_NAME = 'notes') = 0,
  'ALTER TABLE jobs ADD COLUMN notes TEXT NULL AFTER issue_resolved_at',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS booking_visit_work (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  occurrence_key INT NOT NULL DEFAULT 0,
  notes TEXT NULL,
  started_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_booking_visit_work (booking_id, occurrence_key),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_visit_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  visit_work_id INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  done TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_visit_checklist (visit_work_id, position),
  FOREIGN KEY (visit_work_id) REFERENCES booking_visit_work(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS booking_visit_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  visit_work_id INT NOT NULL,
  image_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_visit_photos (visit_work_id),
  FOREIGN KEY (visit_work_id) REFERENCES booking_visit_work(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);
