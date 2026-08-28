-- Help moments (service_subcategories) — production data with URL slugs.
-- Idempotent: safe on fresh Docker boot and on existing DBs (adds slug column via db.sql first).
--
--   mysql -u helpr -p urban_service < backend/db/seed/service-subcategories.sql

USE urban_service;

-- Backfill slugs when rows already exist from an older schema (no slug column yet).
UPDATE service_subcategories SET slug = 'new-baby' WHERE id = 1 AND (slug IS NULL OR slug = '');
UPDATE service_subcategories SET slug = 'elder-care' WHERE id = 2 AND (slug IS NULL OR slug = '');
UPDATE service_subcategories SET slug = 'back-to-school' WHERE id = 3 AND (slug IS NULL OR slug = '');
UPDATE service_subcategories SET slug = 'date-night' WHERE id = 4 AND (slug IS NULL OR slug = '');

INSERT INTO service_subcategories (id, slug, category, label, title, image, sort_order)
VALUES
  (1, 'new-baby', 'Childcare', 'New baby moment', 'Getting ready for a new baby', '/images/people-image-service/Baby-prep.png', 1),
  (2, 'elder-care', 'Care', 'Elder care moment', 'Looking after mum & dad', '/images/people-image-service/Elderly care.png', 2),
  (3, 'back-to-school', 'Tutor', 'Back to school moment', 'Back to school', '/images/people-image-service/tutor.png', 3),
  (4, 'date-night', 'Childcare', 'Date night moment', 'Planning a date night', '/images/people-image-service/Date.png', 4)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug),
  category = VALUES(category),
  label = VALUES(label),
  title = VALUES(title),
  image = VALUES(image),
  sort_order = VALUES(sort_order);

ALTER TABLE service_subcategories AUTO_INCREMENT = 5;

-- Service links (service_id 9, 11, 12 must exist in your services table).
INSERT IGNORE INTO service_subcategory_services (id, subcategory_id, service_id) VALUES
  (1, 1, 9),
  (2, 3, 11),
  (3, 1, 12),
  (4, 3, 12),
  (5, 4, 9),
  (6, 4, 12);

ALTER TABLE service_subcategory_services AUTO_INCREMENT = 7;
