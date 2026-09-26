-- Splits Wellness @ Home's single "Massage" card (201) into two: Head Massage
-- (201, renamed) keeps the 30/45/60 min head services, and a new Body Massage
-- (202) takes the 60/90/120 min body services. Each card then opens a booking
-- page listing only its own durations.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/008-split-massage-subcategories.sql
--
-- Idempotent: re-running is a no-op.

USE urban_service;

UPDATE catalog_subcategories
   SET name = 'Head Massage',
       description = 'Head, neck and shoulder massage. Female clients only, non-medical.',
       sort_order = 1
 WHERE id = 201;

INSERT INTO catalog_subcategories (id, category_id, name, description, sort_order) VALUES
  (202, 3, 'Body Massage', 'Full body massage. Female clients only, non-medical.', 2)
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order);

-- Match on the name so the split still works if service ids differ.
UPDATE catalog_services
   SET subcategory_id = 202
 WHERE subcategory_id = 201 AND name LIKE 'Body Massage%';
