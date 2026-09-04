#!/bin/sh
# Generate nginx config for APP_BASE ("" = domain root, or "/mykynd") then start nginx.
set -eu
BASE="${APP_BASE:-}"
BASE="${BASE%/}"
ROOT="/usr/share/nginx/html"

cat > /etc/nginx/conf.d/default.conf <<EOF
server {
    listen 80;
    server_name _;
    root ${ROOT};
    index index.html;

    resolver 127.0.0.11 valid=10s ipv6=off;
    set \$backend backend:3001;

    client_max_body_size 20m;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    location ${BASE}/api/ {
        rewrite ^${BASE}(/api/.*)\$ \$1 break;
        proxy_pass http://\$backend;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location ^~ ${BASE}/images/ {
        alias /usr/share/nginx/html${BASE}/images/;
        error_page 404 = @backend_images;
    }

    location @backend_images {
        rewrite ^${BASE}(/images/.*)\$ \$1 break;
        proxy_pass http://\$backend;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location = ${BASE}/admin { return 301 ${BASE}/admin/; }
    location = ${BASE}/provider { return 301 ${BASE}/provider/; }
    location = ${BASE}/superadmin { return 301 ${BASE}/superadmin/; }
EOF

if [ -n "$BASE" ]; then
  cat >> /etc/nginx/conf.d/default.conf <<EOF
    location = ${BASE} { return 301 ${BASE}/; }
EOF
fi

cat >> /etc/nginx/conf.d/default.conf <<EOF
    location ${BASE}/admin/ {
        try_files \$uri \$uri/ ${BASE}/admin/index.html;
    }

    location ${BASE}/provider/ {
        try_files \$uri \$uri/ ${BASE}/provider/index.html;
    }

    location ${BASE}/superadmin/ {
        try_files \$uri \$uri/ ${BASE}/superadmin/index.html;
    }

    location ${BASE}/assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    location ${BASE}/ {
        try_files \$uri \$uri/ ${BASE}/index.html;
    }

    location = ${BASE}/index.html {
        add_header Cache-Control "no-cache";
    }

    location = ${BASE}/admin/index.html {
        add_header Cache-Control "no-cache";
    }

    location = ${BASE}/provider/index.html {
        add_header Cache-Control "no-cache";
    }

    location = ${BASE}/superadmin/index.html {
        add_header Cache-Control "no-cache";
    }
}
EOF

exec nginx -g 'daemon off;'
