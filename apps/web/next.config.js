/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@meta-geo/engine", "@meta-geo/marketing"],
  experimental: {
    // Phosphor はバレル(index から数千個を再エクスポート)なので、素朴に import すると
    // 使っていないアイコンまで解決しにいってビルド時間とメモリが跳ねる(展開後 33MB ある)。
    // これを個別モジュールへの参照に書き換えさせる。
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  async headers() {
    // RRPoker のアプリの中に iframe で埋め込むため、そのオリジンからのフレーム化だけを許可する。
    // frame-ancestors は X-Frame-Options より細かく指定でき、ここに載っていないサイトからの
    // 埋め込みは全てブラウザ側で拒否される(クリックジャッキング対策も兼ねる)。
    // 未設定なら 'none' になり、どこからも埋め込めない従来どおりの状態に留まる。
    const parents = (process.env.NEXT_PUBLIC_EMBED_PARENT_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const frameAncestors = parents.length > 0 ? `'self' ${parents.join(" ")}` : "'none'";
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors};` }],
      },
    ];
  },
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
