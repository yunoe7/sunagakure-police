/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Images : autorise les domaines externes que tu utilises
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'raw.githubusercontent.com' },
      { protocol: 'https', hostname: 'flagcdn.com' },
    ],
  },
};

export default nextConfig;
