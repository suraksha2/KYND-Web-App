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
  referral_code VARCHAR(20) NULL,
  -- Saved booking defaults ("Saved details" in the customer account). Prefills
  -- the booking form, including for a customer who has not booked yet.
  default_phone VARCHAR(40) NULL,
  default_address TEXT NULL,
  default_city VARCHAR(255) NULL,
  default_area VARCHAR(255) NULL,
  default_pincode VARCHAR(10) NULL,
  default_payment VARCHAR(20) NULL,
  reset_token VARCHAR(255),
  reset_token_expiry DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Migration: add referral_code to pre-existing users tables.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'referral_code') = 0,
  'ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) NULL AFTER avatar',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND INDEX_NAME = 'unique_referral_code') = 0,
  'ALTER TABLE users ADD UNIQUE KEY unique_referral_code (referral_code)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: saved booking defaults for pre-existing users tables. All six
-- columns are added together, so guarding on the first one is enough.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users'
      AND COLUMN_NAME = 'default_address') = 0,
  'ALTER TABLE users
     ADD COLUMN default_phone VARCHAR(40) NULL AFTER referral_code,
     ADD COLUMN default_address TEXT NULL AFTER default_phone,
     ADD COLUMN default_city VARCHAR(255) NULL AFTER default_address,
     ADD COLUMN default_area VARCHAR(255) NULL AFTER default_city,
     ADD COLUMN default_pincode VARCHAR(10) NULL AFTER default_area,
     ADD COLUMN default_payment VARCHAR(20) NULL AFTER default_pincode',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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
  review_count INT DEFAULT 0,
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
  referral_code VARCHAR(20),
  payment_intent_id VARCHAR(128) NULL,
  placed_at DATETIME NOT NULL,
  status ENUM('upcoming', 'completed', 'cancelled') DEFAULT 'upcoming',
  cancelled_by ENUM('customer', 'admin', 'provider'),
  cancelled_at DATETIME,
  cancel_reason VARCHAR(255),
  user_id INT,
  provider_id INT,
  vendor_id INT NULL,
  vendor_job_id INT NULL,
  assigned_at DATETIME,
  missed_notified_at DATETIME,
  history JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bookings_user (user_id),
  KEY idx_bookings_provider (provider_id),
  KEY idx_bookings_vendor (vendor_id),
  KEY idx_bookings_status_placed (status, placed_at),
  UNIQUE KEY idx_bookings_payment_intent (payment_intent_id),
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

-- Migration: track referral code used at checkout.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'referral_code') = 0,
  'ALTER TABLE bookings ADD COLUMN referral_code VARCHAR(20) AFTER payment',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: `missed_notified_at` records that the admin was already alerted
-- about a booking whose slot passed without being marked done, so the
-- dispatch cron does not re-alert every run.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'missed_notified_at') = 0,
  'ALTER TABLE bookings ADD COLUMN missed_notified_at DATETIME AFTER assigned_at',
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
  missed_notified_at DATETIME,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_booking_occurrence (booking_id, seq),
  KEY idx_occurrence_due (status, scheduled_at),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL
);

-- Migration: add completed_at tracking for individual visit completion.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_occurrences'
      AND COLUMN_NAME = 'completed_at') = 0,
  'ALTER TABLE booking_occurrences ADD COLUMN completed_at DATETIME',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: same once-only admin alert flag for individual recurring visits.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_occurrences'
      AND COLUMN_NAME = 'missed_notified_at') = 0,
  'ALTER TABLE booking_occurrences ADD COLUMN missed_notified_at DATETIME AFTER notified_at',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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
  CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5),
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

-- Middle level of the storefront taxonomy: Category -> Subcategory -> Service.
-- Mirrors the "Group" column of the Kynd Service Master sheet (e.g. Cleaning ->
-- "House Cleaning - Weekly Package"). Not to be confused with the older
-- `service_subcategories` table, which holds the home page "help moments".
CREATE TABLE IF NOT EXISTS catalog_subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- Services in this group are sold as add-ons to another booking, not on
  -- their own: hidden from the service grid, listed in the Add-ons panel.
  is_addon TINYINT(1) NOT NULL DEFAULT 0,
  -- Home-size suggestions (label/hours/description) for the storefront's
  -- house-cleaning size/hours/cleaners picker (src/pages/ServiceDetail.jsx,
  -- HousePicker) — only read when this subcategory has 2+ services named
  -- "One-Time Cleaning X hr". NULL/empty falls back to the storefront's
  -- built-in Studio/1BR/2BR/3BR/4BR+ defaults, so this is opt-in.
  home_sizes JSON,
  -- Which booking picker the storefront renders for this subcategory's
  -- services (see migrations/014-picker-flags.sql). NULL means 'auto': keep
  -- inferring it from service/category names, the legacy behaviour. An
  -- explicit value ('simple_list', 'duration_list', 'multi_select',
  -- 'room_type', 'house_cleaning', 'office_cleaning', 'wellness_session')
  -- forces that picker regardless of names.
  booking_behavior VARCHAR(32) NULL,
  -- Office-cleaning contract pricing for the storefront's office picker
  -- (src/pages/ServiceDetail.jsx, OfficePicker + OfficeRecurringPanel):
  -- {hourlyRate, hours[], sizes[{id,label,threeWeek,daily}], dedicated[]}.
  -- NULL/empty falls back to the storefront's built-in tables; only read
  -- when the picker resolves to 'office_cleaning'.
  office_pricing JSON,
  image VARCHAR(255),
  -- Optional ServiceDetail banner, shared by every service under this
  -- subcategory. The hero falls back to the committed people artwork, then
  -- the service's own `image`, then this subcategory/category tile.
  hero_image VARCHAR(255),
  -- CSS object-position keyword pair ("center top", "left center", ...) so the
  -- banner's object-cover crop (which changes shape between mobile and
  -- desktop) keeps the photo's subject in frame. NULL means "center center".
  hero_image_focus VARCHAR(20),
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_subcategory_name_per_category (category_id, name),
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
);

-- Extra categories a subcategory is also listed under (e.g. Cleaning's
-- Move-Out cards shown in Office Cleaning too). The home category stays
-- catalog_subcategories.category_id; sort_order positions the card within
-- the extra category.
CREATE TABLE IF NOT EXISTS catalog_subcategory_placements (
  subcategory_id INT NOT NULL,
  category_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (subcategory_id, category_id),
  FOREIGN KEY (subcategory_id) REFERENCES catalog_subcategories(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  subcategory_id INT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image VARCHAR(255),
  duration VARCHAR(100),
  -- Crew size and rate basis ('day_rate', 'per_unit', 'package', ...), shown
  -- under each option in the storefront's variant picker.
  worker_count TINYINT UNSIGNED,
  rate_type VARCHAR(32),
  status ENUM('live', 'pending_rates', 'paused') DEFAULT 'pending_rates',
  -- In a subcategory whose booking_behavior is 'house_cleaning', flagged
  -- services are the picker's "Hours per visit" options; unflagged siblings
  -- stay hidden (they still re-anchor to the closest option if visited
  -- directly). Ignored by every other picker.
  is_picker_option TINYINT(1) NOT NULL DEFAULT 0,
  default_partner_cost DECIMAL(10,2),
  markup_pct_override DECIMAL(5,2),
  net_margin DECIMAL(10,2),
  net_margin_pct DECIMAL(5,2),
  actual_markup_pct DECIMAL(5,2),
  -- Carried over from the Service Master sheet's research columns.
  competitor_reference VARCHAR(255),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (subcategory_id) REFERENCES catalog_subcategories(id) ON DELETE SET NULL
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
  UNIQUE KEY unique_service_mode (service_id, mode),
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
  UNIQUE KEY unique_subcategory_catalog_service (subcategory_id, service_id),
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

-- Migration: add duration to catalog_services if it was created before this column.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'duration') = 0,
  'ALTER TABLE catalog_services ADD COLUMN duration VARCHAR(100) AFTER image',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: give catalog_categories the tile artwork and ordering the
-- storefront category grid needs.
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

-- Migration: attach existing catalog_services rows to the new subcategory level.
-- Nullable, so services created before subcategories existed keep working.
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

-- Migration: research columns carried over from the Service Master sheet.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'competitor_reference') = 0,
  'ALTER TABLE catalog_services ADD COLUMN competitor_reference VARCHAR(255) AFTER markup_pct_override',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'notes') = 0,
  'ALTER TABLE catalog_services ADD COLUMN notes TEXT AFTER competitor_reference',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: crew size and rate basis (see migrations/004-service-crew-rate.sql
-- for the accompanying backfill).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'worker_count') = 0,
  'ALTER TABLE catalog_services ADD COLUMN worker_count TINYINT UNSIGNED NULL AFTER duration',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'rate_type') = 0,
  'ALTER TABLE catalog_services ADD COLUMN rate_type VARCHAR(32) NULL AFTER worker_count',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: margin columns (see migrations/012-catalog-artwork-and-margins.sql).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'net_margin') = 0,
  'ALTER TABLE catalog_services ADD COLUMN net_margin DECIMAL(10,2) NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'net_margin_pct') = 0,
  'ALTER TABLE catalog_services ADD COLUMN net_margin_pct DECIMAL(5,2) NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'actual_markup_pct') = 0,
  'ALTER TABLE catalog_services ADD COLUMN actual_markup_pct DECIMAL(5,2) NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: add-on groups (see migrations/005-addon-subcategories.sql).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'is_addon') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN is_addon TINYINT(1) NOT NULL DEFAULT 0 AFTER description',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: admin-editable home sizes for the house-cleaning picker (see
-- migrations/013-subcategory-home-sizes.sql).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'home_sizes') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN home_sizes JSON NULL AFTER is_addon',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: explicit booking behavior + picker-option flag (see
-- migrations/014-picker-flags.sql).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'booking_behavior') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN booking_behavior VARCHAR(32) NULL AFTER home_sizes',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_services'
      AND COLUMN_NAME = 'is_picker_option') = 0,
  'ALTER TABLE catalog_services ADD COLUMN is_picker_option TINYINT(1) NOT NULL DEFAULT 0 AFTER status',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: admin-editable office-cleaning pricing tables (see
-- migrations/015-office-pricing.sql).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'office_pricing') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN office_pricing JSON NULL AFTER booking_behavior',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: per-subcategory hero banner for ServiceDetail, shared by every
-- service under it (see migrations/016-subcategory-hero-image.sql).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'hero_image') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN hero_image VARCHAR(255) NULL AFTER image',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: hero image focal point, so object-cover crops consistently
-- without losing the subject on every screen size (see
-- migrations/017-subcategory-hero-focus.sql).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'hero_image_focus') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN hero_image_focus VARCHAR(20) NULL AFTER hero_image',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Messages table for temporary in-app messaging between customers and providers
-- Messages are scoped to a booking and available around the time of service
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  sender_type ENUM('customer', 'provider') NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  read_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_booking_messages (booking_id, created_at),
  KEY idx_sender (sender_type, sender_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- --- Production hardening (idempotent; safe on existing MySQL 8 volumes) ---

-- bookings.user_id FK (missing from many phpMyAdmin dumps)
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND CONSTRAINT_NAME = 'fk_bookings_user') = 0
  AND (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'user_id') > 0,
  'ALTER TABLE bookings ADD CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND INDEX_NAME = 'idx_bookings_user') = 0,
  'ALTER TABLE bookings ADD KEY idx_bookings_user (user_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND INDEX_NAME = 'idx_bookings_status_placed') = 0,
  'ALTER TABLE bookings ADD KEY idx_bookings_status_placed (status, placed_at)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- service_subcategories.slug must be NOT NULL for /help/:slug routing
UPDATE service_subcategories
   SET slug = CONCAT('moment-', id)
 WHERE slug IS NULL OR slug = '';

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategories'
      AND COLUMN_NAME = 'slug' AND IS_NULLABLE = 'YES') > 0,
  'ALTER TABLE service_subcategories MODIFY COLUMN slug VARCHAR(100) NOT NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_subcategory_services'
      AND INDEX_NAME = 'unique_subcategory_catalog_service') = 0,
  'ALTER TABLE service_subcategory_services ADD UNIQUE KEY unique_subcategory_catalog_service (subcategory_id, service_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_booking_modes'
      AND INDEX_NAME = 'unique_service_mode') = 0,
  'ALTER TABLE service_booking_modes ADD UNIQUE KEY unique_service_mode (service_id, mode)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Clear stale password-reset tokens (security hygiene on schema refresh)
UPDATE users SET reset_token = NULL, reset_token_expiry = NULL
 WHERE reset_token IS NOT NULL OR reset_token_expiry IS NOT NULL;

-- Admin-uploaded service artwork. POST /api/images/upload stores the bytes
-- here (not public/, which is baked into the Docker image); GET /images/:name
-- serves a row when no committed file on disk matches. `filename` doubles as
-- the public URL tail, so it stays unique across the table and the directory.
CREATE TABLE IF NOT EXISTS images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_image_filename (filename)
);

-- ---------------------------------------------------------------------------
-- Vendor Partner OS: a vendor is a partner company (e.g. a cleaning agency)
-- that owns a team of workers, takes offers fanned out from Kynd bookings,
-- and runs its own-customer jobs through the same pipeline. See
-- VENDOR_DASHBOARD_PLAN.md for the full design; this is the Home-screen slice.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vendors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL UNIQUE,
  mobile VARCHAR(20),
  city VARCHAR(100),
  categories JSON,
  status ENUM('active', 'inactive') DEFAULT 'active',
  payout_details JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seats on a vendor's Partner OS account. `owner`/`manager` are desk roles;
-- `field` seats are linked to a `service_providers` row for mobile job access.
CREATE TABLE IF NOT EXISTS vendor_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  provider_id INT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner', 'manager', 'field') NOT NULL DEFAULT 'owner',
  status ENUM('active', 'invited', 'disabled') DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vendor_users_vendor (vendor_id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE SET NULL
);

-- Migration: workers can belong to a vendor's own team (vs. the platform's
-- marketplace gig pool, which stays vendor_id NULL and admin-assigned).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'vendor_id') = 0,
  'ALTER TABLE service_providers ADD COLUMN vendor_id INT NULL AFTER id,
     ADD CONSTRAINT fk_service_providers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- One row per Kynd booking offered to a vendor. Multiple vendors can be
-- offered the same booking (broadcast fan-out); first accept wins.
CREATE TABLE IF NOT EXISTS offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  booking_id INT NULL,
  service_label VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  area VARCHAR(100),
  window_start DATETIME NOT NULL,
  window_end DATETIME,
  price DECIMAL(10,2) NOT NULL,
  fee_pct DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  status ENUM('open', 'accepted', 'declined', 'expired', 'taken') DEFAULT 'open',
  decline_reason VARCHAR(255),
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_offers_vendor_status (vendor_id, status),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
);

-- Vendor-side work item: an accepted Kynd offer or a vendor's own-customer
-- booking. Owns the vendor job lifecycle independently of `bookings.status`.
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  offer_id INT NULL,
  booking_id INT NULL,
  source ENUM('kynd', 'own') NOT NULL DEFAULT 'own',
  status ENUM('accepted', 'assigned', 'in_progress', 'completed', 'paid', 'cancelled') DEFAULT 'accepted',
  issue_type VARCHAR(50) NULL,
  issue_note VARCHAR(255) NULL,
  issue_resolved_at DATETIME NULL,
  assignee_provider_id INT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  customer_address VARCHAR(255),
  customer_area VARCHAR(100),
  service_label VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  window_start DATETIME NOT NULL,
  window_end DATETIME,
  gross DECIMAL(10,2) NOT NULL DEFAULT 0,
  fee_pct DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  net DECIMAL(10,2) NOT NULL DEFAULT 0,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  paid_at DATETIME NULL,
  -- Set when a Kynd payout batch settles this job; NULL = not yet paid out.
  -- The FK to vendor_payouts is added below, after that table is created.
  payout_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_jobs_vendor_window (vendor_id, window_start),
  KEY idx_jobs_vendor_status (vendor_id, status),
  KEY idx_jobs_assignee (assignee_provider_id),
  KEY idx_jobs_payout (payout_id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  FOREIGN KEY (assignee_provider_id) REFERENCES service_providers(id) ON DELETE SET NULL
);

-- Payout batches run for a vendor (platform fee already netted out).
CREATE TABLE IF NOT EXISTS vendor_payouts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  jobs INT NOT NULL DEFAULT 0,
  gross DECIMAL(10,2) NOT NULL DEFAULT 0,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  net DECIMAL(10,2) NOT NULL DEFAULT 0,
  status ENUM('scheduled', 'pending', 'paid') DEFAULT 'scheduled',
  paid_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vendor_payouts_vendor (vendor_id, status),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- Migrations for databases created before payouts existed: jobs.payout_id
-- (declared in the CREATE TABLE above for fresh installs) and its FK to
-- vendor_payouts, both guarded for MySQL 8 (no IF NOT EXISTS on ALTER).
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
      AND COLUMN_NAME = 'payout_id') = 0,
  'ALTER TABLE jobs ADD COLUMN payout_id INT NULL, ADD KEY idx_jobs_payout (payout_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
      AND CONSTRAINT_NAME = 'fk_jobs_payout') = 0,
  'ALTER TABLE jobs ADD CONSTRAINT fk_jobs_payout FOREIGN KEY (payout_id) REFERENCES vendor_payouts(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: once a vendor accepts a Kynd offer for a booking, that booking's
-- visit is owned by the vendor's own `jobs` lifecycle instead of the
-- marketplace `service_providers` pool. These columns let the legacy
-- marketplace paths (auto-assignment at creation, manual admin assignment,
-- the dispatch-due cron and the missed-job sweep) recognise a vendor-claimed
-- booking and stop dispatching/notifying for it in parallel with the vendor's
-- own team. NULL (the default) is an ordinary marketplace booking untouched
-- by any vendor — fully backward compatible with existing rows.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'vendor_id') = 0,
  'ALTER TABLE bookings
     ADD COLUMN vendor_id INT NULL AFTER provider_id,
     ADD KEY idx_bookings_vendor (vendor_id)',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Guarded on its own column, not vendor_id: databases that picked up
-- vendor_id from an earlier import still need vendor_job_id.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'vendor_job_id') = 0,
  'ALTER TABLE bookings ADD COLUMN vendor_job_id INT NULL AFTER vendor_id',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND CONSTRAINT_NAME = 'fk_bookings_vendor') = 0,
  'ALTER TABLE bookings ADD CONSTRAINT fk_bookings_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND CONSTRAINT_NAME = 'fk_bookings_vendor_job') = 0,
  'ALTER TABLE bookings ADD CONSTRAINT fk_bookings_vendor_job FOREIGN KEY (vendor_job_id) REFERENCES jobs(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Training/certification records for a vendor's workers, used to flag
-- upcoming expiries that would block them from being booked.
CREATE TABLE IF NOT EXISTS team_member_certs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  issued_at DATE,
  expires_at DATE NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_team_member_certs_provider (provider_id),
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE CASCADE
);

-- Planned leave for a vendor's team member. Dates are inclusive whole days
-- (SGT). Leave rows surface in the schedule grid and warn — never hard-block —
-- when assigning a job inside the window. vendor_id duplicates the provider's
-- ownership so every lookup can stay vendor-scoped.
CREATE TABLE IF NOT EXISTS team_member_leave (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  provider_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note VARCHAR(160) NOT NULL DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_leave_member (provider_id, start_date),
  KEY idx_leave_vendor (vendor_id, start_date),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE CASCADE
);

-- Migration for existing databases.
SET @has_leave := (
  SELECT COUNT(*) FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'team_member_leave'
);
SET @sql_leave := IF(@has_leave = 0, 'CREATE TABLE team_member_leave (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  provider_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note VARCHAR(160) NOT NULL DEFAULT '''',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_leave_member (provider_id, start_date),
  KEY idx_leave_vendor (vendor_id, start_date),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES service_providers(id) ON DELETE CASCADE
)', 'SELECT 1');
PREPARE stmt_leave FROM @sql_leave;
EXECUTE stmt_leave;
DEALLOCATE PREPARE stmt_leave;

-- A vendor's own category pricing, submitted for superadmin review before it
-- can appear on the customer storefront. draft (editable, not submitted) ->
-- under_review (submitted) -> live (approved, bookable) or rejected (back to
-- the vendor with review_note; editable and resubmittable).
CREATE TABLE IF NOT EXISTS vendor_service_prices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  category VARCHAR(100) NOT NULL,
  unit ENUM('hour', 'sqft', 'day', 'job') NOT NULL DEFAULT 'hour',
  price DECIMAL(10,2) NOT NULL,
  status ENUM('draft', 'under_review', 'live', 'rejected') DEFAULT 'draft',
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_vendor_service_prices_vendor (vendor_id, status),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE
);

-- "Services and hours" (vendor Partner OS): a vendor picks one of Kynd's real
-- storefront subcategories (catalog_subcategories) to offer, instead of typing
-- a free-text category like vendor_service_prices above. Each subcategory the
-- vendor adds gets its own row here (one per vendor+subcategory), its own
-- open hours, and a price per catalog_services row underneath it in
-- vendor_service_category_items. Same draft -> under_review -> live/rejected
-- lifecycle as vendor_service_prices, reviewed by a superadmin.
-- `hours` is a 7-entry JSON array, one per weekday ({day, open, start, end}),
-- since each day can be toggled open/closed with its own start/end time
-- (vendor Services page's inline hours editor).
CREATE TABLE IF NOT EXISTS vendor_service_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  subcategory_id INT NOT NULL,
  status ENUM('draft', 'under_review', 'live', 'rejected') NOT NULL DEFAULT 'draft',
  hours JSON NOT NULL,
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(255) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_vendor_subcategory (vendor_id, subcategory_id),
  KEY idx_vendor_service_categories_vendor (vendor_id, status),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (subcategory_id) REFERENCES catalog_subcategories(id) ON DELETE CASCADE
);

-- One row per catalog_services item the vendor can price within a
-- vendor_service_categories row. price stays NULL until the vendor fills it
-- in; a category can only be submitted once every item here has a price.
CREATE TABLE IF NOT EXISTS vendor_service_category_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_category_id INT NOT NULL,
  catalog_service_id INT NOT NULL,
  price DECIMAL(10,2) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_category_service (vendor_category_id, catalog_service_id),
  FOREIGN KEY (vendor_category_id) REFERENCES vendor_service_categories(id) ON DELETE CASCADE,
  FOREIGN KEY (catalog_service_id) REFERENCES catalog_services(id) ON DELETE CASCADE
);

-- Migration: a booking placed directly against one vendor's approved listing
-- (as opposed to the marketplace pool) carries that vendor_id so admin/
-- superadmin can tell the two apart, and so the matching `jobs` row knows
-- which vendor it belongs to.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings'
      AND COLUMN_NAME = 'vendor_id') = 0,
  'ALTER TABLE bookings
     ADD COLUMN vendor_id INT NULL AFTER provider_id,
     ADD CONSTRAINT fk_bookings_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: a worker's pay rate, used by the vendor's Expenses page to work
-- out real cost (and so margin) per job. Not payroll — just this rate times
-- the job's hours (pay_mode 'hour') or a flat amount per job (pay_mode 'job').
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'pay_mode') = 0,
  "ALTER TABLE service_providers
     ADD COLUMN pay_mode ENUM('hour','job') NOT NULL DEFAULT 'hour',
     ADD COLUMN pay_rate DECIMAL(10,2) NOT NULL DEFAULT 0",
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Migration: "team lead" is purely a display flag on the vendor Team member
-- profile (badge next to their role) — it doesn't change permissions, which
-- stay governed by vendor_users.role.
SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_providers'
      AND COLUMN_NAME = 'is_team_lead') = 0,
  'ALTER TABLE service_providers ADD COLUMN is_team_lead TINYINT(1) NOT NULL DEFAULT 0',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- A vendor's own out-of-pocket costs (supplies, chemicals, transport, etc.),
-- optionally linked to the job they were for. Feeds the Expenses page and
-- the Money page's "Profit by service" margin.
CREATE TABLE IF NOT EXISTS expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  job_id INT NULL,
  category VARCHAR(100) NOT NULL,
  note VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_expenses_vendor_date (vendor_id, expense_date),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

-- Invoices a vendor issues to its own customers for finished 'own' jobs
-- (Kynd-booked work is paid via platform payouts instead, so it never
-- appears here). `status` is 'sent' or 'paid' — "overdue" is derived on read
-- from due_date, never stored, so it can't drift out of date. job_id is
-- unique so the same job can't be invoiced twice.
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  vendor_id INT NOT NULL,
  job_id INT NULL,
  customer_name VARCHAR(255) NOT NULL,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('sent','paid','cancelled') NOT NULL DEFAULT 'sent',
  issued_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  due_date DATE NOT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_invoices_job (job_id),
  KEY idx_invoices_vendor (vendor_id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
);

-- Job detail page (vendor Partner OS): a per-job checklist seeded from a
-- built-in template the first time the job is opened (see checklistTemplate()
-- in routes/vendor.ts), on-site photos (bytes live in `images`, same as
-- admin-uploaded artwork — job_photos just links a job to one), and a simple
-- message log standing in for the "Kynd customer chat" thread shown on the
-- job page. None of this is customer-facing yet; only the vendor side writes
-- to these tables today.
CREATE TABLE IF NOT EXISTS job_checklist_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  label VARCHAR(255) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  done TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_checklist_job (job_id, position),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  image_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_job_photos_job (job_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS job_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  sender_type ENUM('vendor', 'customer') NOT NULL DEFAULT 'vendor',
  sender_id INT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_job_messages_job (job_id, created_at),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- Approved vendor rates captured at assignment, separately from customer prices.
-- occurrence_key = 0 is a single visit or the template for a recurring series.
-- Recurring templates never enter payouts; each occurrence has its own row.
CREATE TABLE IF NOT EXISTS vendor_booking_financials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  occurrence_key INT NOT NULL DEFAULT 0,
  vendor_id INT NOT NULL,
  customer_total DECIMAL(10,2) NOT NULL,
  gross DECIMAL(10,2) NOT NULL,
  fee_pct DECIMAL(5,2) NOT NULL,
  fee DECIMAL(10,2) NOT NULL,
  net DECIMAL(10,2) NOT NULL,
  rate_items JSON NOT NULL,
  completed_at DATETIME NULL,
  payout_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_vendor_booking_visit (booking_id, occurrence_key),
  KEY idx_vendor_financial_payout (vendor_id, payout_id, completed_at),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  FOREIGN KEY (payout_id) REFERENCES vendor_payouts(id)
);
