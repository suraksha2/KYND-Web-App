-- Removes the help moments for services Kynd no longer offers (elderly care,
-- tutoring). Their service links go with them via ON DELETE CASCADE.
--
--   mysql -u root -p urban_service < backend/db/migrations/027-remove-unavailable-moments.sql

USE urban_service;

DELETE FROM service_subcategories WHERE slug IN ('elder-care', 'back-to-school');
