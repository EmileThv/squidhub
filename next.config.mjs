// next.config.mjs
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.discordapp.com',
      },
        {
        protocol: 'https',
        hostname: 'www.lemagducine.fr',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
      },
      {
        protocol: 'https',
        hostname: 'static.inaturalist.org',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'inaturalist-open-data.s3.amazonaws.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.inaturalist.org',
        pathname: '/**',
      }
    ],
  },
};

export default nextConfig;