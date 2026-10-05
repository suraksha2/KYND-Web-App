-- Admin-editable office-cleaning pricing for the storefront's office
-- picker (src/pages/ServiceDetail.jsx, OfficePicker + OfficeRecurringPanel).
-- The premises-size monthly rates, one-time hourly rate/hour options and
-- dedicated-cleaner quote rows were previously hardcoded in the storefront;
-- this lets them be set per subcategory from Superadmin instead, while the
-- storefront falls back to the built-in tables when office_pricing is
-- NULL/empty.
--
-- Shape (camelCase, matching what ServiceDetail.jsx consumes):
--   {
--     "hourlyRate": 28,                  -- one-time visits: $/hr per cleaner
--     "hours": [2, 3, 4, 6, 8],          -- "Hours per visit" pill options
--     "sizes": [                         -- "Size of your office" pills; the
--       { "id": "1-2k",                  --   per-plan columns are the
--         "label": "1,000–2,000 sqft",   --   OFFICE_PLANS keys
--         "threeWeek": 450,              --   (threeWeek / daily). null =
--         "daily": 550 },                --   "By quote" -> Contact us card
--       ...
--     ],
--     "dedicated": [                     -- full-time onsite cleaner rows;
--       { "id": "dedicatedWeekday",      --   always quote-only ("range" is
--         "title": "Dedicated cleaner, Mon–Fri",  -- shown verbatim)
--         "subtitle": "Full-time, stationed onsite",
--         "range": "S$2,900–S$4,200/mo" },
--       ...
--     ]
--   }
--
-- Idempotent: column add is guarded with information_schema, and the
-- backfill only touches subcategory 401 ("General Office Cleaning", the
-- subcategory the office picker activates for today) and only when
-- office_pricing is still unset, so a value set from Superadmin afterwards
-- is left alone.
--
--   mysql -u root -p urban_service < backend/db/migrations/015-office-pricing.sql

USE urban_service;

SET @stmt := IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_subcategories'
      AND COLUMN_NAME = 'office_pricing') = 0,
  'ALTER TABLE catalog_subcategories ADD COLUMN office_pricing JSON NULL AFTER booking_behavior',
  'DO 0');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE catalog_subcategories
   SET office_pricing = JSON_OBJECT(
     'hourlyRate', 28,
     'hours', JSON_ARRAY(2, 3, 4, 6, 8),
     'sizes', JSON_ARRAY(
       JSON_OBJECT('id', '1-2k', 'label', '1,000–2,000 sqft',    'threeWeek', 450,  'daily', 550),
       JSON_OBJECT('id', '2-3k', 'label', '2,001–3,000 sqft',    'threeWeek', 650,  'daily', 750),
       JSON_OBJECT('id', '3-4k', 'label', '3,001–4,000 sqft',    'threeWeek', 850,  'daily', 1100),
       JSON_OBJECT('id', '4-5k', 'label', '4,001–5,000 sqft',    'threeWeek', NULL, 'daily', 1250),
       JSON_OBJECT('id', '5-7k', 'label', '5,001–7,000 sqft',    'threeWeek', NULL, 'daily', 1520),
       JSON_OBJECT('id', '7k+',  'label', '7,001 sqft onwards',  'threeWeek', NULL, 'daily', NULL)
     ),
     'dedicated', JSON_ARRAY(
       JSON_OBJECT('id', 'dedicatedWeekday', 'title', 'Dedicated cleaner, Mon–Fri',
                   'subtitle', 'Full-time, stationed onsite',      'range', 'S$2,900–S$4,200/mo'),
       JSON_OBJECT('id', 'dedicatedFull',    'title', 'Dedicated cleaner, Mon–Sun',
                   'subtitle', 'Full-time, incl. public holidays', 'range', 'S$3,800–S$4,800/mo')
     )
   )
 WHERE id = 401
   AND office_pricing IS NULL;
