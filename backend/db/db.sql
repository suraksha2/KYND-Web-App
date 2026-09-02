-- Create the database
CREATE DATABASE IF NOT EXISTS urban_service;
USE urban_service;

-- Service Categories table
CREATE TABLE IF NOT EXISTS service_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  createdAt DATETIME,
  updatedAt DATETIME
);

-- Service Subcategories table (e.g. "New baby moment" under a parent category like "Childcare")
CREATE TABLE IF NOT EXISTS service_subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(100) NOT NULL,       -- URL slug, e.g. "new-baby" → /help/new-baby
  category VARCHAR(100),            -- parent category name, e.g. "Tutor"
  label VARCHAR(255) NOT NULL,      -- display label, e.g. "Back to school moment"
  title VARCHAR(255) NOT NULL,      -- card title, e.g. "Back to school"
  image VARCHAR(255),               -- image path
  sort_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_subcategory_slug (slug)
);

-- Migration: add slug to pre-existing service_subcategories tables.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND COLUMN_NAME = 'slug') = 0,
  'ALTER TABLE service_subcategories ADD COLUMN slug VARCHAR(100) NULL AFTER id',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND INDEX_NAME = 'unique_subcategory_slug') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND COLUMN_NAME = 'slug') > 0,
  'ALTER TABLE service_subcategories ADD UNIQUE KEY unique_subcategory_slug (slug)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Cities table
CREATE TABLE IF NOT EXISTS cities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cityName VARCHAR(255) NOT NULL,
  pinCode TEXT NOT NULL,
  serviceCategoryId VARCHAR(255),
  -- Selected and written by src/lib/cities-db.ts; without these every
  -- /api/cities request fails with ER_BAD_FIELD_ERROR.
  createdAt DATETIME,
  updatedAt DATETIME
);

-- City Areas table (areas/localities per city)
CREATE TABLE IF NOT EXISTS city_areas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  city_id INT NOT NULL,
  area_name VARCHAR(255) NOT NULL,
  pincode VARCHAR(20),
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE
);

-- Services table
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
);

-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  mobile VARCHAR(20),
  city VARCHAR(100),
  status VARCHAR(50),
  joined DATE,
  avatar VARCHAR(10)
);

-- City Services table (admin-managed civic services per city)
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
);

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255),
  category VARCHAR(100),
  price DECIMAL(10,2),
  availability VARCHAR(100),
  status VARCHAR(50)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT,
  service_id INT,
  amount DECIMAL(10,2),
  status VARCHAR(50),
  date DATE,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);

-- Users table
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
);

-- Settings table (optional)
CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  profile_name VARCHAR(255),
  profile_email VARCHAR(255),
  profile_role VARCHAR(50),
  bio TEXT
);

-- Analytics table (optional)
CREATE TABLE IF NOT EXISTS analytics (
  id INT AUTO_INCREMENT PRIMARY KEY,
  month VARCHAR(20),
  orders INT,
  revenue DECIMAL(10,2)
);

-- Service Providers table
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
  avatar VARCHAR(255),
  working_hours JSON,
  joined DATE DEFAULT (CURRENT_DATE),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Bookings table
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
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Migration: add user_id to bookings tables created before it existed.
-- `ADD COLUMN IF NOT EXISTS` is MariaDB-only syntax; on MySQL 8 it is a syntax
-- error (1064) that aborts the whole script, so guard on information_schema.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'user_id') = 0,
  'ALTER TABLE bookings ADD COLUMN user_id INT',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: add the optional customer instructions column for the partner.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'notes') = 0,
  'ALTER TABLE bookings ADD COLUMN notes TEXT AFTER contact_area',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: record who cancelled a booking (and why) so the apps can show it.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'cancelled_by') = 0,
  'ALTER TABLE bookings
     ADD COLUMN cancelled_by ENUM(''customer'', ''admin'', ''provider'') AFTER status,
     ADD COLUMN cancelled_at DATETIME AFTER cancelled_by,
     ADD COLUMN cancel_reason VARCHAR(255) AFTER cancelled_at',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: existing cancelled rows predate the column. Their history JSON
-- records the actor in the note text, so infer it there; default to customer.
UPDATE bookings
   SET cancelled_by = IF(LOWER(COALESCE(history, '')) LIKE '%by admin%', 'admin',
                      IF(LOWER(COALESCE(history, '')) LIKE '%by provider%', 'provider', 'customer'))
 WHERE status = 'cancelled' AND cancelled_by IS NULL;

-- Migration: add structured recurrence details for recurring bookings.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'recurrence') = 0,
  'ALTER TABLE bookings ADD COLUMN recurrence JSON AFTER cadence',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Individual visits of a recurring booking. The parent `bookings` row owns the
-- cadence and the contact/payment details; each occurrence carries its own date,
-- provider and status so cancelling or rescheduling one visit leaves the rest of
-- the series intact. `notified_at` is what stops the dispatcher double-sending.
CREATE TABLE IF NOT EXISTS booking_occurrences (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  seq INT NOT NULL,
  scheduled_at DATETIME NOT NULL,
  provider_id INT,
  status ENUM('upcoming', 'completed', 'cancelled') DEFAULT 'upcoming',
  notified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_booking_occurrence (booking_id, seq),
  KEY idx_occurrence_due (status, scheduled_at),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL
);

-- Reviews table for customer feedback on service providers
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
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL
);

-- Migration: add review_count to pre-existing service_providers tables.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'review_count') = 0,
  'ALTER TABLE service_providers ADD COLUMN review_count INT DEFAULT 0',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: add working_hours to pre-existing service_providers tables.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'working_hours') = 0,
  'ALTER TABLE service_providers ADD COLUMN working_hours JSON',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Launch waitlist signups collected by the pre-launch landing page.
CREATE TABLE IF NOT EXISTS waitlist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(40),
  source VARCHAR(50) DEFAULT 'landing',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_waitlist_email (email)
);

-- Modular catalog schema (v2). Legacy `services` and `service_categories` tables
-- remain in place until the storefront and admin UIs are fully migrated.
CREATE TABLE IF NOT EXISTS catalog_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  variant_schema JSON NOT NULL DEFAULT (JSON_ARRAY()),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS catalog_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image VARCHAR(255),
  status ENUM('live', 'pending_rates', 'paused') DEFAULT 'pending_rates',
  default_partner_cost DECIMAL(10,2),
  markup_pct_override DECIMAL(5,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
);

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
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_pricing_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  strategy ENUM('flat', 'hourly', 'tiered', 'per_unit', 'custom_quote') NOT NULL,
  params JSON NOT NULL DEFAULT (JSON_OBJECT()),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS addons (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  customer_price DECIMAL(10,2) NOT NULL,
  partner_cost DECIMAL(10,2),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
  CHECK (service_id IS NOT NULL OR category_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS service_variant_attributes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_id INT NOT NULL,
  attribute_key VARCHAR(100) NOT NULL,
  attribute_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
);

-- Link help moments (service_subcategories) to catalog services.
CREATE TABLE IF NOT EXISTS service_subcategory_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subcategory_id INT NOT NULL,
  service_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subcategory_id) REFERENCES service_subcategories(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
);

-- Migration: add description to catalog_categories if it was created before this column.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_categories'
      AND COLUMN_NAME = 'description') = 0,
  'ALTER TABLE catalog_categories ADD COLUMN description TEXT AFTER name',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: add image to catalog_services if it was created before this column.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'image') = 0,
  'ALTER TABLE catalog_services ADD COLUMN image VARCHAR(255) AFTER description',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;
