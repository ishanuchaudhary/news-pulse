/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allows the frontend to call the backend API during SSR if needed
  async rewrites() {
    return [
      {
        source:      "/api/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
