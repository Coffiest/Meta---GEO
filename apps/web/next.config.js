/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@meta-geo/engine"],
  webpack: (config) => {
    // @meta-geo/engine is consumed straight from its TypeScript source and uses
    // NodeNext-style ".js" specifiers for its own relative imports (they resolve
    // to the sibling ".ts" file at compile time). Webpack doesn't know that
    // mapping by default, so teach it here.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

module.exports = nextConfig;
