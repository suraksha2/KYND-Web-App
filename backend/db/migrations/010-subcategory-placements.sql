-- Lets a subcategory be listed under more than one category. Cleaning's
-- Move-Out (HDB) (105) and Move-Out (Condo) (106) keep Cleaning as their home
-- category and also appear in Office Cleaning (5), after General Office
-- Cleaning. Same services, prices and booking page in both places.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/010-subcategory-placements.sql
--
-- Idempotent: re-running is a no-op.

USE urban_service;

CREATE TABLE IF NOT EXISTS catalog_subcategory_placements (
  subcategory_id INT NOT NULL,
  category_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (subcategory_id, category_id),
  FOREIGN KEY (subcategory_id) REFERENCES catalog_subcategories(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
);

INSERT INTO catalog_subcategory_placements (subcategory_id, category_id, sort_order) VALUES
  (105, 5, 2),
  (106, 5, 3)
ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order);
