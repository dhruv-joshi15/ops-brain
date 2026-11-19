import {defineConfig} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {tmpdir} from "node:os";
import {join} from "node:path";
const env = {OPS_BUILD_DIR:".next-e2e",DATABASE_URL:`file:${join(tmpdir(),`ops-e2e-${randomUUID()}.db`)}`,OPENAI_API_KEY:"",OPS_DEMO_DATE:"2026-11-19"};
export default defineConfig({
  testDir:"tests",
  timeout:60_000,
  workers:1,
  testMatch:"**/*.spec.ts",
  use:{baseURL:"http://127.0.0.1:3052",trace:"retain-on-failure"},
  webServer:{command:"npm run setup && npm run dev -- --port 3052",env,url:"http://127.0.0.1:3052",timeout:120_000},
});
