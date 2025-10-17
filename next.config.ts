// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Let the production build succeed even if ESLint finds problems
  eslint: { ignoreDuringBuilds: true },

  // Let the production build succeed even if there are type errors
  // (We can turn this back on once we’ve typed the APIs)
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
