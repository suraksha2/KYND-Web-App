-- Adds the middle level of the storefront taxonomy: Category -> Subcategory -> Service.
-- Run once on existing deployments that predate catalog_subcategories.
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/003-catalog-subcategories.sql
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/seed/catalog-taxonomy.sql

USE urban_service;

CREATE TABLE IF NOT EXISTS catalog_subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image VARCHAR(255),
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_subcategory_name_per_category (category_id, name),
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
);

-- Tile artwork and ordering for the storefront category grid.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_categories'
      AND COLUMN_NAME = 'image') = 0,
  'ALTER TABLE catalog_categories ADD COLUMN image VARCHAR(255) AFTER description',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_categories'
      AND COLUMN_NAME = 'sort_order') = 0,
  'ALTER TABLE catalog_categories ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER image',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Services keep working unassigned: subcategory_id is nullable.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'subcategory_id') = 0,
  'ALTER TABLE catalog_services ADD COLUMN subcategory_id INT NULL AFTER category_id',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND CONSTRAINT_NAME = 'fk_catalog_services_subcategory') = 0,
  'ALTER TABLE catalog_services ADD CONSTRAINT fk_catalog_services_subcategory
     FOREIGN KEY (subcategory_id) REFERENCES catalog_subcategories(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
