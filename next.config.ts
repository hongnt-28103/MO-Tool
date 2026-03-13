import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ADMOB_PUB_NAMI: process.env.ADMOB_PUB_NAMI,
    NEXT_PUBLIC_ADMOB_PUB_NASUS: process.env.ADMOB_PUB_NASUS,
  },
};
export default nextConfig;
