import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // モノレポ構成での「Collecting build traces」ハング対策。
  // 依存ファイル追跡の起点を frontend 配下に固定し、リポジトリ直下や
  // backend/ まで走査しないようにする。
  experimental: {
    outputFileTracingRoot: __dirname,
  },
};

export default nextConfig;
