import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {config} from "dotenv";

config({path:[".env.local",".env"],quiet:true});
const require = createRequire(import.meta.resolve("@prisma/adapter-better-sqlite3"));
const Database = require("better-sqlite3");
const url = process.env.DATABASE_URL || "file:./ops.db";
if (!url.startsWith("file:")) throw new Error("DATABASE_URL must start with file:.");
const file = url.startsWith("file://") ? fileURLToPath(url) : url.slice(5);
const db = new Database(file);
try {
  db.transaction(()=>db.exec(readFileSync(new URL("../prisma/init.sql",import.meta.url),"utf8")))();
  console.log("SQLite workspace initialized.");
} finally {
  db.close();
}
