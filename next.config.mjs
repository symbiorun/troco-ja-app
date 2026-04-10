/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        (process.env.NEXT_PUBLIC_APP_URL ?? "").replace("https://", ""),
      ].filter(Boolean),
    },
  },
};

export default nextConfig;
