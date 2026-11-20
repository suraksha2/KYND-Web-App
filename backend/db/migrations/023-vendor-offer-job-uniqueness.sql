-- Enforce one Kynd offer per vendor/booking and one job per offer.
-- WARNING: this is not a dry run. The diagnostic SELECTs below are followed by
-- cleanup and ALTER statements in the same script. Run the SELECTs separately,
-- review their output, take a backup, and pause offer/job writes before applying.
-- Run against a backup first. The diagnostic result sets list duplicate groups
-- before cleanup. Cleanup preserves every row: redundant offers are detached
-- from the booking, and redundant jobs are detached from the offer. A keeper
-- prefers an existing job / most advanced job state, then the lowest id.
--
--   mysql -u root -p urban_service < backend/db/migrations/023-vendor-offer-job-uniqueness.sql

USE urban_service;

SELECT vendor_id, booking_id, COUNT(*) AS duplicate_count, GROUP_CONCAT(id ORDER BY id) AS offer_ids
  FROM offers
 WHERE booking_id IS NOT NULL
 GROUP BY vendor_id, booking_id
HAVING COUNT(*) > 1;

SELECT offer_id, COUNT(*) AS duplicate_count, GROUP_CONCAT(id ORDER BY id) AS job_ids
  FROM jobs
 WHERE offer_id IS NOT NULL
 GROUP BY offer_id
HAVING COUNT(*) > 1;

-- Keep an offer already referenced by a job when possible, then an accepted
-- offer, so cleanup does not detach the established accepted work item.
CREATE TEMPORARY TABLE tmp_offer_duplicate_map AS
SELECT id, FIRST_VALUE(id) OVER (
         PARTITION BY vendor_id, booking_id
         ORDER BY (COALESCE(j.job_count, 0) > 0) DESC,
                  (status = 'accepted') DESC,
                  (accepted_at IS NOT NULL) DESC,
                  id ASC
       ) AS keeper_id
  FROM offers o
  LEFT JOIN (
    SELECT offer_id, COUNT(*) AS job_count
      FROM jobs
     WHERE offer_id IS NOT NULL
     GROUP BY offer_id
  ) j ON j.offer_id = o.id
 WHERE booking_id IS NOT NULL;

UPDATE offers o
JOIN tmp_offer_duplicate_map d ON d.id = o.id
   SET o.booking_id = NULL
 WHERE d.id <> d.keeper_id;

DROP TEMPORARY TABLE tmp_offer_duplicate_map;

-- Keep the most advanced job per offer. Older/less advanced duplicate rows
-- remain intact for audit, but no longer claim the unique offer relationship.
CREATE TEMPORARY TABLE tmp_job_duplicate_map AS
SELECT id, FIRST_VALUE(id) OVER (
         PARTITION BY offer_id
         ORDER BY CASE status
                    WHEN 'paid' THEN 6
                    WHEN 'completed' THEN 5
                    WHEN 'in_progress' THEN 4
                    WHEN 'assigned' THEN 3
                    WHEN 'accepted' THEN 2
                    ELSE 1
                  END DESC,
                  id ASC
       ) AS keeper_id
  FROM jobs
 WHERE offer_id IS NOT NULL;

UPDATE jobs j
JOIN tmp_job_duplicate_map d ON d.id = j.id
   SET j.offer_id = NULL
 WHERE d.id <> d.keeper_id;

DROP TEMPORARY TABLE tmp_job_duplicate_map;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'offers'
      AND INDEX_NAME = 'unique_offers_vendor_booking') = 0,
  'ALTER TABLE offers ADD UNIQUE KEY unique_offers_vendor_booking (vendor_id, booking_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
      AND INDEX_NAME = 'unique_jobs_offer') = 0,
  'ALTER TABLE jobs ADD UNIQUE KEY unique_jobs_offer (offer_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
