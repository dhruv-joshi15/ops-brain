import type {NextConfig} from "next";
const config: NextConfig = {devIndicators:false,distDir:process.env.OPS_BUILD_DIR || ".next",outputFileTracingIncludes:{"/api/ops":["./prisma/init.sql"]},serverExternalPackages:["better-sqlite3","@prisma/adapter-better-sqlite3"]};
export default config;
