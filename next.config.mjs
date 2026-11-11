import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8100",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8100",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "localhost",
        port: "8443",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "192.168.*.*",
        pathname: "/**",
      },
    ],
  },
};

export default withBundleAnalyzer(nextConfig);
