/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit `.next/standalone`: a self-contained server with only the traced
  // node_modules, which is what the Docker image ships (1.03GB -> ~250MB).
  // `next start` / PM2 deployments are unaffected.
  output: 'standalone',
};

module.exports = nextConfig;
