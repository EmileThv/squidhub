// next.config.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig = {
  // Pin the project root so a stray lockfile higher up (e.g. in ~) isn't picked as the workspace root
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
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