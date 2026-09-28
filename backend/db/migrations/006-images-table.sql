-- Stores admin-uploaded service artwork in the database instead of
-- public/images. Committed artwork ships inside the Docker image, so bytes
-- written to disk at runtime would be lost on the next deploy — and a named
-- volume mounted there would mask the baked-in files. POST /api/images/upload
-- now INSERTs here; GET /images/:filename serves a row when no file on disk
-- matches (express.static still wins for committed artwork).
--
-- Uploads are capped at 5MB, so the server's max_allowed_packet must exceed
-- that. MySQL 8 defaults to 64MB (the Docker image is fine); XAMPP ships with
-- 1MB — raise it in my.cnf if local uploads over ~1MB fail with a 500.
--
--   docker compose --env-file .env.docker exec -T mysql \
--     mysql -u root -p"$MYSQL_ROOT_PASSWORD" urban_service < backend/db/migrations/006-images-table.sql
--
-- Idempotent.

USE urban_service;

CREATE TABLE IF NOT EXISTS images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_image_filename (filename)
);
