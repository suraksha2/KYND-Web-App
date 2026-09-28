-- Storefront taxonomy: catalog_categories + catalog_subcategories.
-- Derived from the Category / Group columns of Kynd_Service_Master_4.xlsx
-- ("Service Master" tab). Services themselves are NOT seeded here.
--
-- Subcategory names are the customer-facing versions of the sheet's Group
-- column — the redundant category prefix ("Beauty - Facial", "House Cleaning -
-- Weekly Package") is dropped because the category is already on screen. The
-- original group string is kept in a comment next to each row.
--
-- Idempotent (explicit ids + ON DUPLICATE KEY UPDATE), so re-running is safe.
-- Assumes ids 1 and 3-6 are the catalog categories; on a fresh DB they will be.
--
--   mysql -u root -p urban_service < backend/db/seed/catalog-taxonomy.sql

USE urban_service;

INSERT INTO catalog_categories (id, name, description, sort_order) VALUES
  (1, 'Cleaning',        'Home cleaning, move-out, deep cleaning and add-ons.',       1),
  (3, 'Wellness @ Home', 'Massage and wellness treatments in your own home.',         2),
  (4, 'Beauty Services', 'Salon treatments delivered at home.',                       3),
  (5, 'Office Cleaning', 'Ad-hoc and contract cleaning for workplaces.',              4),
  (6, 'Pest Control',    'General treatment, termites and rodent control.',           5)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order);

-- Cleaning (category 1). Single Session / One-Time / General Package / Weekly
-- Package from the sheet are merged into one "General Package" card — every
-- service under it is a variant of the same offering and they are all listed
-- together on the booking page (see migration 007).
INSERT INTO catalog_subcategories (id, category_id, name, description, sort_order) VALUES
  (103, 1, 'General Package',      'Single visits, session bundles and weekly plans.',         1),  -- House Cleaning - Single Session / One-Time / General / Weekly
  (105, 1, 'Move-Out (HDB)',       'End-of-tenancy deep clean for HDB flats.',                 2),  -- Move-Out Cleaning - HDB
  (106, 1, 'Move-Out (Condo)',     'End-of-tenancy deep clean for condos, access included.',   3),  -- Move-Out Cleaning - Condo
  (107, 1, 'Add-On Services',      'Fans, fridge, oven, grilles and blinds.',                  4),  -- Add-On Services
  (108, 1, 'Floor Deep Cleaning',  'Floor scrubbing and polishing by area.',                   5),  -- Floor Deep Cleaning
  (109, 1, 'Upholstery Cleaning',  'Mattresses, sofas and baby cots.',                         6),  -- Upholstery Cleaning
  (110, 1, 'Carpet Cleaning',      'Carpets and rugs, priced by size.',                        7),  -- Carpet Cleaning
  (111, 1, 'Curtain Cleaning',     'Curtains by room or by piece.',                            8),  -- Curtain Cleaning

-- Wellness @ Home (category 3). The sheet's single Massage group is split into
-- head and body cards so each booking page lists only its own durations
-- (see migration 008).
  (201, 3, 'Head Massage',         'Head, neck and shoulder massage. Female clients only, non-medical.', 1),  -- Massage
  (202, 3, 'Body Massage',         'Full body massage. Female clients only, non-medical.',      2),  -- Massage

-- Beauty Services (category 4). The sheet's Hair Services and Hair Cut groups
-- are merged into one "Hair Services" card — every service under it is a
-- variant of the same offering and they are all listed together on the booking
-- page (see migration 009).
  (301, 4, 'Hair Services',        'Haircuts and styling by hair length.',                     1),  -- Beauty - Hair Services / Hair Cut
  (303, 4, 'Nail Art',             'Nail art and extensions.',                                 2),  -- Beauty - Nail Art
  (304, 4, 'Heena Art',            'Full hand and kids heena designs.',                        3),  -- Beauty - Heena Art
  (305, 4, 'Bleach',               'Oxy and chandan bleach.',                                   4),  -- Beauty - Bleach
  (306, 4, 'Facial',               'VLCC, O3, Lotus, Shahnaz and fruit facials.',               5),  -- Beauty - Facial
  (307, 4, 'Makeup',               'Party makeup, with or without hairstyling.',                6),  -- Beauty - Makeup
  (308, 4, 'Mani-Pedi',            'Manicure and pedicure.',                                    7),  -- Beauty - Mani - Pedi
  (309, 4, 'Hair Care',            'Hair spa, blow dry, heena and colour touch-up.',            8),  -- Beauty - Hair Care
  (310, 4, 'Threading',            'Eyebrow, lips, forehead and full face.',                    9),  -- Beauty - Threading
  (311, 4, 'Waxing',               'Face, arms, legs, underarm, tummy and back.',              10),  -- Beauty - Waxing

-- Office Cleaning (category 5) — pricing pending
  (401, 5, 'General Office Cleaning', 'Ad-hoc, weekly, daily and move-in/out deep cleans.',    1),  -- Office Cleaning - General

-- Pest Control (category 6) — pricing pending
  (501, 6, 'General Pest Control',    'General treatment, termites and rodent control.',       1)   -- Pest Control - General
ON DUPLICATE KEY UPDATE
  category_id = VALUES(category_id),
  name = VALUES(name),
  description = VALUES(description),
  sort_order = VALUES(sort_order);

-- Add-ons are sold on top of another booking, so this group is hidden from the
-- service grid and surfaces in the booking form's Add-ons panel instead.
UPDATE catalog_subcategories SET is_addon = 1 WHERE name = 'Add-On Services';

-- The Move-Out cards are also listed under Office Cleaning, after General
-- Office Cleaning (see migration 010).
INSERT INTO catalog_subcategory_placements (subcategory_id, category_id, sort_order) VALUES
  (105, 5, 2),
  (106, 5, 3)
ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order);
