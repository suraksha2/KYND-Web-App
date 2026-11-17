CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key CHAR(64) NOT NULL PRIMARY KEY,
  hit_count INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  KEY idx_api_rate_limits_expiry (expires_at)
);
