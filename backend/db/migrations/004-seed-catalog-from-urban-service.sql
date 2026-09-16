-- Seed catalog / storefront data from urban_service.sql (Sep 12 2026 dump).
-- Sanitized: NO users, providers, bookings, password hashes, reset tokens, or waitlist PII.
-- Idempotent — safe to re-run on an empty or partially filled production volume.
--
--   cat backend/db/migrations/004-seed-catalog-from-urban-service.sql | \
--     docker compose --env-file .env.docker exec -T mysql \
--     bash -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service'
--
-- Verify:
--   curl -s https://kyndpro.com/api/catalog/services

USE urban_service;

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- ---------------------------------------------------------------------------
-- Cities
-- ---------------------------------------------------------------------------
INSERT INTO cities (id, cityName, pinCode, serviceCategoryId, createdAt, updatedAt)
VALUES (
  7,
  'Singapore',
  JSON_ARRAY(JSON_OBJECT('areaName', 'Singapore Changi Airport', 'pinCode', '819643')),
  JSON_ARRAY('2', '10', '11', '12'),
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  cityName = VALUES(cityName),
  pinCode = VALUES(pinCode),
  serviceCategoryId = VALUES(serviceCategoryId),
  updatedAt = NOW();

INSERT INTO city_areas (id, city_id, area_name, pincode, status)
VALUES
  (7, 7, 'Singapore Changi Airport', '819643', 'active'),
  (8, 7, 'Marina Bay', '333333', 'active')
ON DUPLICATE KEY UPDATE
  area_name = VALUES(area_name),
  pincode = VALUES(pincode),
  status = VALUES(status);

-- ---------------------------------------------------------------------------
-- Catalog categories (IDs match urban_service.sql; skip TestCat/Walking/Chat)
-- ---------------------------------------------------------------------------
INSERT INTO catalog_categories (id, name, description, variant_schema) VALUES
  (2, 'Home Cleaning', 'Cleaning', JSON_ARRAY()),
  (3, 'Tutor', 'Tutoring', JSON_ARRAY()),
  (4, 'AC Cleaning', 'Aircon', JSON_ARRAY()),
  (5, 'Elderly care', 'Elder support', JSON_ARRAY())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  variant_schema = VALUES(variant_schema);

-- ---------------------------------------------------------------------------
-- Catalog services (IDs 3–6 from dump)
-- ---------------------------------------------------------------------------
INSERT INTO catalog_services (
  id, category_id, name, description, image, duration, status,
  default_partner_cost, markup_pct_override
) VALUES
  (3, 2, 'Home Cleaning', NULL, '/images/Home Cleaning.png', NULL, 'live', 30.00, 20.00),
  (4, 3, 'Tutor', NULL, '/images/1788256586452-Tutor.png', NULL, 'live', 30.00, 10.00),
  (5, 5, 'Elderly care', NULL, '/images/1788349539986-Baby Sitter.png', '60 mins', 'live', 30.00, 10.00),
  (6, 3, 'Baby Sitting', NULL, '/images/1789113712231-Baby Sitter.png', '30mins', 'live', 12.00, 20.00)
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  name = VALUES(name),
  image = VALUES(image),
  duration = VALUES(duration),
  status = VALUES(status),
  default_partner_cost = VALUES(default_partner_cost),
  markup_pct_override = VALUES(markup_pct_override);

-- ---------------------------------------------------------------------------
-- Booking modes
-- ---------------------------------------------------------------------------
INSERT INTO service_booking_modes (id, service_id, mode, min_lead_time_hours, blackout_dates) VALUES
  (7, 3, 'recurring', 0, JSON_ARRAY()),
  (8, 3, 'scheduled', 0, JSON_ARRAY()),
  (9, 3, 'on_demand', 0, JSON_ARRAY()),
  (10, 4, 'on_demand', 0, JSON_ARRAY()),
  (20, 5, 'on_demand', 0, JSON_ARRAY()),
  (21, 5, 'scheduled', 0, JSON_ARRAY()),
  (22, 5, 'recurring', 0, JSON_ARRAY()),
  (26, 6, 'on_demand', 0, JSON_ARRAY()),
  (27, 6, 'scheduled', 0, JSON_ARRAY()),
  (28, 6, 'recurring', 0, JSON_ARRAY())
ON DUPLICATE KEY UPDATE
  min_lead_time_hours = VALUES(min_lead_time_hours),
  blackout_dates = VALUES(blackout_dates);

-- ---------------------------------------------------------------------------
-- Pricing rules
-- ---------------------------------------------------------------------------
INSERT INTO service_pricing_rules (id, service_id, strategy, params) VALUES
  (3, 3, 'hourly', JSON_OBJECT(
    'rate_schedule', JSON_ARRAY(JSON_OBJECT('start', '08:00', 'end', '09:00', 'rate', '10'))
  )),
  (4, 4, 'flat', JSON_OBJECT('amount', 30)),
  (8, 5, 'hourly', JSON_OBJECT(
    'rate_schedule', JSON_ARRAY(JSON_OBJECT('start', '08:00', 'end', '10:00', 'rate', '20'))
  )),
  (10, 6, 'flat', JSON_OBJECT('amount', 30))
ON DUPLICATE KEY UPDATE
  service_id = VALUES(service_id),
  strategy = VALUES(strategy),
  params = VALUES(params);

-- ---------------------------------------------------------------------------
-- Variant attributes
-- ---------------------------------------------------------------------------
INSERT INTO service_variant_attributes (id, service_id, attribute_key, attribute_value) VALUES
  (2, 3, 'Carpet Cleaning', '5'),
  (6, 5, 'Taking care', '10')
ON DUPLICATE KEY UPDATE
  attribute_key = VALUES(attribute_key),
  attribute_value = VALUES(attribute_value);

-- ---------------------------------------------------------------------------
-- Addons + links
-- ---------------------------------------------------------------------------
INSERT INTO addons (id, name, customer_price, partner_cost) VALUES
  (1, 'Room Cleaning', 5.00, 2.00),
  (2, 'Helping Elders', 2.00, 4.00),
  (3, 'Baby Food Prep', 20.00, 5.00)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  customer_price = VALUES(customer_price),
  partner_cost = VALUES(partner_cost);

INSERT INTO service_addons (id, service_id, category_id, addon_id) VALUES
  (2, 5, NULL, 1),
  (3, 3, NULL, 2),
  (4, 3, NULL, 1),
  (5, 6, NULL, 3)
ON DUPLICATE KEY UPDATE
  service_id = VALUES(service_id),
  addon_id = VALUES(addon_id);

-- ---------------------------------------------------------------------------
-- Help moments (storefront /help/:slug) + catalog service links
-- ---------------------------------------------------------------------------
INSERT INTO service_subcategories (id, slug, category, label, title, image, sort_order) VALUES
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

INSERT IGNORE INTO service_subcategory_services (subcategory_id, service_id)
SELECT sc.id, cs.id
FROM service_subcategories sc
JOIN catalog_services cs ON cs.name IN ('Home Cleaning', 'Tutor', 'Baby Sitting')
WHERE sc.slug = 'new-baby';

INSERT IGNORE INTO service_subcategory_services (subcategory_id, service_id)
SELECT sc.id, cs.id
FROM service_subcategories sc
JOIN catalog_services cs ON cs.name IN ('Elderly care')
WHERE sc.slug = 'elder-care';

INSERT IGNORE INTO service_subcategory_services (subcategory_id, service_id)
SELECT sc.id, cs.id
FROM service_subcategories sc
JOIN catalog_services cs ON cs.name IN ('Tutor')
WHERE sc.slug = 'back-to-school';

INSERT IGNORE INTO service_subcategory_services (subcategory_id, service_id)
SELECT sc.id, cs.id
FROM service_subcategories sc
JOIN catalog_services cs ON cs.name IN ('Home Cleaning', 'Baby Sitting')
WHERE sc.slug = 'date-night';

-- ---------------------------------------------------------------------------
-- Legacy mirrors (admin UIs that still read these tables)
-- ---------------------------------------------------------------------------
INSERT INTO service_categories (id, name, description, createdAt, updatedAt) VALUES
  (10, 'Home Cleaning', '', NOW(), NOW()),
  (11, 'AC Cleaning', '', NOW(), NOW()),
  (12, 'Tutor', '', NOW(), NOW()),
  (13, 'Baby Sitter', '', NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO services (id, name, category, price, availability, status, image) VALUES
  (9, 'Home Cleaning', 'Home Cleaning', 20.00, 'Mon-Sat', 'Available', '/images/Home Cleaning.png'),
  (10, 'AC Cleaning', 'AC Cleaning', 10.00, 'Mon-Sat', 'Available', '/images/AC Cleaning.png'),
  (11, 'Tutor', 'Tutor', 15.00, 'Mon-Sat', 'Available', '/images/Tutor.png'),
  (12, 'Baby Sitter', 'Baby Sitter', 30.00, 'Mon-Sun', 'Available', '/images/Baby Sitter.png')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  price = VALUES(price),
  image = VALUES(image);

-- Keep AUTO_INCREMENT ahead of seeded IDs
ALTER TABLE catalog_categories AUTO_INCREMENT = 10;
ALTER TABLE catalog_services AUTO_INCREMENT = 10;
ALTER TABLE addons AUTO_INCREMENT = 10;
ALTER TABLE service_booking_modes AUTO_INCREMENT = 50;
ALTER TABLE service_pricing_rules AUTO_INCREMENT = 20;
ALTER TABLE service_addons AUTO_INCREMENT = 10;
ALTER TABLE service_variant_attributes AUTO_INCREMENT = 10;
ALTER TABLE service_subcategories AUTO_INCREMENT = 20;
ALTER TABLE cities AUTO_INCREMENT = 20;
ALTER TABLE city_areas AUTO_INCREMENT = 20;
