-- Help moments — production seed (catalog service links, not legacy services.id).
--   mysql … urban_service < backend/db/seed/service-subcategories.sql

USE urban_service;

UPDATE service_subcategories SET slug = 'new-baby' WHERE id = 1 AND (slug IS NULL OR slug = '');
UPDATE service_subcategories SET slug = 'date-night' WHERE id = 4 AND (slug IS NULL OR slug = '');

INSERT INTO service_subcategories (id, slug, category, label, title, image, sort_order)
VALUES
  (1, 'new-baby', 'Home Cleaning', 'New baby moment', 'Getting ready for a new baby', '/images/people-image-service/Baby-prep.png', 1),
  (4, 'date-night', 'Home Cleaning', 'Date night moment', 'Planning a date night', '/images/people-image-service/Date.png', 4)
ON DUPLICATE KEY UPDATE
  slug = VALUES(slug),
  category = VALUES(category),
  label = VALUES(label),
  title = VALUES(title),
  image = VALUES(image),
  sort_order = VALUES(sort_order);

ALTER TABLE service_subcategories AUTO_INCREMENT = 5;

INSERT IGNORE INTO service_subcategory_services (subcategory_id, service_id)
SELECT sc.id, cs.id
FROM service_subcategories sc
JOIN catalog_services cs ON cs.name IN ('One-Time Cleaning 2.0 hr')
WHERE sc.slug = 'new-baby';

INSERT IGNORE INTO service_subcategory_services (subcategory_id, service_id)
SELECT sc.id, cs.id
FROM service_subcategories sc
JOIN catalog_services cs ON cs.name IN ('One-Time Cleaning 2.0 hr')
WHERE sc.slug = 'date-night';
