-- Drops three tables that never had a live code path: `products` had no
-- route at all, `settings` was only ever written from a /api/settings
-- endpoint nothing calls (the superadmin Settings page saves through
-- /api/auth/update-profile instead), and `orders` was shadowed by
-- /api/orders reading from `bookings` directly. See routes/clients.ts for a
-- similar case (`clients`) that was left alone since it's still read.
--
--   mysql -u root -p urban_service < backend/db/migrations/018-drop-unused-tables.sql
--
-- No FKs reference any of the three, so this is a plain drop.

USE urban_service;

DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS orders;
