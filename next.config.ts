import type { NextConfig } from 'next';

const githubPages = process.env.GITHUB_PAGES === 'true';
const nextConfig: NextConfig = {
  ...(githubPages
    ? { output: 'export', basePath: '/test', trailingSlash: true }
    : {}),
  env: { NEXT_PUBLIC_BASE_PATH: githubPages ? '/test' : '' },
};

export default nextConfig;
