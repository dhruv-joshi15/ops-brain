import base from "eslint-config-next";
import {defineConfig,globalIgnores} from "eslint/config";
export default defineConfig([...base,globalIgnores(["generated/**","test-results/**","playwright-report/**"])]);
