-- =============================================================================
-- Kynd / Helpr — PRODUCTION MySQL 8 import (schema + sanitized catalog seed)
-- =============================================================================
-- Replaces the MariaDB phpMyAdmin dump (credentials, localhost URLs, test
-- bookings, nullable slugs, missing FKs). Safe to load on MySQL 8.0+.
--
-- Fresh database:
--   mysql -u root -p < db_new.sql
--
-- Existing Docker volume (schema only — do NOT wipe data):
--   cat backend/db/db.sql | docker compose --env-file .env.docker exec -T mysql \
--     bash -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service'
--
-- NEVER commit password hashes, reset tokens, or real PII into this file.
-- Create admins via POST /api/auth/signup + ADMIN_SIGNUP_SECRET after deploy.
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';

CREATE DATABASE IF NOT EXISTS urban_service
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE urban_service;

-- ---------------------------------------------------------------------------
-- Schema (MySQL 8 — mirrors backend/db/db.sql, inline keys/FKs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  createdAt DATETIME,
  updatedAt DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  label VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  image VARCHAR(255),
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_subcategory_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cityName VARCHAR(255) NOT NULL,
  pinCode TEXT NOT NULL,
  serviceCategoryId VARCHAR(255),
  createdAt DATETIME,
  updatedAt DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS city_areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city_id INT NOT NULL,
  area_name VARCHAR(255) NOT NULL,
  pincode VARCHAR(20),
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(100),
  price DECIMAL(10,2),
  availability VARCHAR(100),
  status VARCHAR(50),
  image VARCHAR(255),
  duration VARCHAR(100),
  rating DECIMAL(3,2) DEFAULT 0.00,
  review_count INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  mobile VARCHAR(20),
  city VARCHAR(100),
  status VARCHAR(50),
  joined DATE,
  avatar VARCHAR(10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS city_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('Active', 'Pending', 'Suspended', 'Completed') DEFAULT 'Pending',
  provider VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  budget DECIMAL(10,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(100),
  price DECIMAL(10,2),
  availability VARCHAR(100),
  status VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT,
  service_id INT,
  amount DECIMAL(10,2),
  status VARCHAR(50),
  date DATE,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  status VARCHAR(50) DEFAULT 'active',
  joined DATE DEFAULT (CURRENT_DATE),
  avatar VARCHAR(10),
  reset_token VARCHAR(255),
  reset_token_expiry DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_name VARCHAR(255),
  profile_email VARCHAR(255),
  profile_role VARCHAR(50),
  bio TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month VARCHAR(20),
  orders INT,
  revenue DECIMAL(10,2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  mobile VARCHAR(20) NOT NULL,
  services JSON NOT NULL,
  city VARCHAR(100) NOT NULL,
  status ENUM('active', 'inactive', 'busy') DEFAULT 'active',
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_jobs INT DEFAULT 0,
  review_count INT DEFAULT 0,
  avatar VARCHAR(255),
  working_hours JSON,
  joined DATE DEFAULT (CURRENT_DATE),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id VARCHAR(50) NOT NULL UNIQUE,
  items JSON NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  schedule ENUM('instant', 'scheduled', 'recurring') NOT NULL,
  scheduled_at DATETIME,
  cadence VARCHAR(50),
  recurrence JSON,
  contact_name VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  contact_address TEXT NOT NULL,
  contact_city VARCHAR(100) NOT NULL,
  contact_pincode VARCHAR(20) NOT NULL,
  contact_area VARCHAR(100),
  notes TEXT,
  payment VARCHAR(50) NOT NULL,
  placed_at DATETIME NOT NULL,
  status ENUM('upcoming', 'completed', 'cancelled') DEFAULT 'upcoming',
  cancelled_by ENUM('customer', 'admin', 'provider'),
  cancelled_at DATETIME,
  cancel_reason VARCHAR(255),
  user_id INT,
  provider_id INT,
  assigned_at DATETIME,
  history JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bookings_user (user_id),
  KEY idx_bookings_provider (provider_id),
  KEY idx_bookings_status_placed (status, placed_at),
  CONSTRAINT fk_bookings_provider FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL,
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  seq INT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  provider_id INT,
  status ENUM('upcoming', 'completed', 'cancelled') DEFAULT 'upcoming',
  notified_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_booking_occurrence (booking_id, seq),
  KEY idx_occurrence_due (status, scheduled_at),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  user_id INT,
  provider_id INT,
  rating TINYINT NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_booking_review (booking_id),
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS waitlist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  source VARCHAR(50) DEFAULT 'landing',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_waitlist_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  variant_schema JSON NOT NULL DEFAULT (JSON_ARRAY()),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS catalog_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image VARCHAR(255),
  duration VARCHAR(100),
  status ENUM('live', 'pending_rates', 'paused') DEFAULT 'pending_rates',
  default_partner_cost DECIMAL(10,2),
  markup_pct_override DECIMAL(5,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_booking_modes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  mode ENUM('on_demand', 'scheduled', 'recurring') NOT NULL,
  min_lead_time_hours INT,
  blackout_dates JSON,
  recurrence_frequency VARCHAR(50),
  recurrence_discount_pct DECIMAL(5,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_service_mode (service_id, mode),
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_pricing_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  strategy ENUM('flat', 'hourly', 'tiered', 'per_unit', 'custom_quote') NOT NULL,
  params JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS addons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  customer_price DECIMAL(10,2) NOT NULL,
  partner_cost DECIMAL(10,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_addons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT,
  category_id INT,
  addon_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (addon_id) REFERENCES addons(id) ON DELETE CASCADE,
  CONSTRAINT chk_service_addons_target CHECK (service_id IS NOT NULL OR category_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_variant_attributes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  attribute_key VARCHAR(100) NOT NULL,
  attribute_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS service_subcategory_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subcategory_id INT NOT NULL,
  service_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_subcategory_catalog_service (subcategory_id, service_id),
  FOREIGN KEY (subcategory_id) REFERENCES service_subcategories(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Sanitized seed (NO users, providers, bookings, passwords, or PII)
-- Relative /images/… paths only — never localhost absolute URLs.
-- ---------------------------------------------------------------------------

INSERT INTO cities (id, cityName, pinCode, serviceCategoryId, createdAt, updatedAt)
VALUES (
  1,
  'Singapore',
  JSON_ARRAY(JSON_OBJECT('areaName', 'Singapore Changi Airport', 'pinCode', '819643')),
  JSON_ARRAY('1'),
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  cityName = VALUES(cityName),
  pinCode = VALUES(pinCode),
  updatedAt = NOW();

INSERT INTO city_areas (id, city_id, area_name, pincode, status)
VALUES (1, 1, 'Singapore Changi Airport', '819643', 'active')
ON DUPLICATE KEY UPDATE
  area_name = VALUES(area_name),
  pincode = VALUES(pincode),
  status = VALUES(status);

INSERT INTO catalog_categories (id, name, description, variant_schema) VALUES
  (1, 'Home Cleaning', 'Cleaning', JSON_ARRAY()),
  (2, 'Tutor', 'Tutoring', JSON_ARRAY()),
  (3, 'Elderly care', 'Elder support', JSON_ARRAY()),
  (4, 'AC Cleaning', 'Aircon', JSON_ARRAY())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description);

INSERT INTO catalog_services (id, category_id, name, description, image, duration, status, default_partner_cost, markup_pct_override) VALUES
  (1, 1, 'Home Cleaning', NULL, '/images/Home Cleaning.png', NULL, 'live', 30.00, 20.00),
  (2, 2, 'Tutor', NULL, '/images/Tutor.png', NULL, 'live', 30.00, 10.00),
  (3, 3, 'Elderly care', NULL, '/images/Baby Sitter.png', '60 mins', 'live', 30.00, 10.00),
  (4, 4, 'AC Cleaning', NULL, '/images/AC Cleaning.png', NULL, 'live', 25.00, 20.00)
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  name = VALUES(name),
  image = VALUES(image),
  duration = VALUES(duration),
  status = VALUES(status),
  default_partner_cost = VALUES(default_partner_cost),
  markup_pct_override = VALUES(markup_pct_override);

INSERT INTO service_booking_modes (service_id, mode, min_lead_time_hours, blackout_dates) VALUES
  (1, 'on_demand', 0, JSON_ARRAY()),
  (1, 'scheduled', 0, JSON_ARRAY()),
  (1, 'recurring', 0, JSON_ARRAY()),
  (2, 'on_demand', 0, JSON_ARRAY()),
  (3, 'on_demand', 0, JSON_ARRAY()),
  (3, 'scheduled', 0, JSON_ARRAY()),
  (3, 'recurring', 0, JSON_ARRAY()),
  (4, 'on_demand', 0, JSON_ARRAY()),
  (4, 'scheduled', 0, JSON_ARRAY())
ON DUPLICATE KEY UPDATE min_lead_time_hours = VALUES(min_lead_time_hours);

INSERT INTO service_pricing_rules (id, service_id, strategy, params) VALUES
  (1, 1, 'flat', JSON_OBJECT('amount', 36)),
  (2, 2, 'flat', JSON_OBJECT('amount', 33)),
  (3, 3, 'hourly', JSON_OBJECT('rate_schedule', JSON_ARRAY(JSON_OBJECT('start', '08:00', 'end', '10:00', 'rate', '20')))),
  (4, 4, 'flat', JSON_OBJECT('amount', 30))
ON DUPLICATE KEY UPDATE
  service_id = VALUES(service_id),
  strategy = VALUES(strategy),
  params = VALUES(params);

INSERT INTO addons (id, name, customer_price, partner_cost) VALUES
  (1, 'Room Cleaning', 5.00, 2.00),
  (2, 'Helping Elders', 2.00, 4.00)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  customer_price = VALUES(customer_price),
  partner_cost = VALUES(partner_cost);

INSERT INTO service_addons (id, service_id, category_id, addon_id) VALUES
  (1, 1, NULL, 1),
  (2, 1, NULL, 2),
  (3, 3, NULL, 1)
ON DUPLICATE KEY UPDATE
  service_id = VALUES(service_id),
  addon_id = VALUES(addon_id);

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
JOIN catalog_services cs ON cs.name IN ('Home Cleaning', 'Tutor')
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
JOIN catalog_services cs ON cs.name IN ('Home Cleaning')
WHERE sc.slug = 'date-night';

-- Legacy `services` mirror (admin UIs that still read this table)
INSERT INTO services (id, name, category, price, availability, status, image) VALUES
  (1, 'Home Cleaning', 'Home Cleaning', 36.00, 'Mon-Sat', 'Available', '/images/Home Cleaning.png'),
  (2, 'Tutor', 'Tutor', 33.00, 'Mon-Sat', 'Available', '/images/Tutor.png'),
  (3, 'Elderly care', 'Elderly care', 33.00, 'Mon-Sun', 'Available', '/images/Baby Sitter.png'),
  (4, 'AC Cleaning', 'AC Cleaning', 30.00, 'Mon-Sat', 'Available', '/images/AC Cleaning.png')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  category = VALUES(category),
  price = VALUES(price),
  image = VALUES(image);

INSERT INTO service_categories (id, name, description, createdAt, updatedAt) VALUES
  (1, 'Home Cleaning', '', NOW(), NOW()),
  (2, 'Tutor', '', NOW(), NOW()),
  (3, 'Elderly care', '', NOW(), NOW()),
  (4, 'AC Cleaning', '', NOW(), NOW())
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------------
-- Security hygiene (always safe to re-run)
-- ---------------------------------------------------------------------------
UPDATE users SET reset_token = NULL, reset_token_expiry = NULL
 WHERE reset_token IS NOT NULL OR reset_token_expiry IS NOT NULL;
