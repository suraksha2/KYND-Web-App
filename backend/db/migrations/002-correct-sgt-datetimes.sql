-- One-time correction for pre-SGT-migration bookings.
-- Previously `placed_at`, `scheduled_at`, `assigned_at`, and `cancelled_at`
-- were stored as UTC values inside Singapore-local DATETIME columns. This
-- migration adds 8 hours to those existing rows so they display correctly
-- as Singapore time (SGT, UTC+8).

USE urban_service;

UPDATE bookings
SET
  placed_at     = DATE_ADD(placed_at,     INTERVAL 8 HOUR),
  scheduled_at  = DATE_ADD(scheduled_at,  INTERVAL 8 HOUR),
  assigned_at   = DATE_ADD(assigned_at,   INTERVAL 8 HOUR),
  cancelled_at  = DATE_ADD(cancelled_at,  INTERVAL 8 HOUR);

-- Note: `history` JSON `at` values are not migrated because they are mixed
-- formats (some SGT, some ISO) and are not used for the booking list time.
-- If you need them corrected too, let me know.
