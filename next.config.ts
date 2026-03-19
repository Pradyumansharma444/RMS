import type { NextConfig } from "next";
import path from "node:path";

// Only load the orchids visual-edits loader in development (not during Vercel build)
const isDev = process.env.NODE_ENV === "development";
let turbopack: NextConfig["turbopack"] = undefined;

if (isDev) {
  try {
    const loaderPath = require.resolve('orchids-visual-edits/loader.js');
    turbopack = {
      rules: {
        "*.{jsx,tsx}": {
          loaders: [loaderPath]
        }
      }
    };
  } catch {
    // orchids-visual-edits not available, skip
  }
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Tree-shake large packages so only imported symbols are bundled
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "recharts",
      "date-fns",
      "framer-motion",
    ],
  },
  ...(turbopack ? { turbopack } : {}),
} as NextConfig;

export default nextConfig;
