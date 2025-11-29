import fs from "fs";
import path from "path";
import { Pool } from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
  if (!PGUSER || !PGPASSWORD || !PGHOST || !PGPORT || !PGDATABASE) {
    console.error("❌ Missing environment variables for PostgreSQL connection!");
    console.error("Check your .env file for PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE.");
    process.exit(1);
  }
  connectionString = `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD)}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
}

console.log("✅ Using connection:", connectionString);

const pool = new Pool({ connectionString });


const SEED_DIR = path.join(__dirname, "seeds");

(async () => {
  const client = await pool.connect();
  try {
    console.log("🌱 Starting data seeding...");

    const files = fs
      .readdirSync(SEED_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(SEED_DIR, file), "utf8");
      console.log(`→ Running ${file}`);
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log(`✔  ${file} done`);
    }

    console.log("🔁 Refreshing materialized view...");
    await client.query("SELECT refresh_mv_hotel_search();");

    console.log("✅ All data inserted successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Error inserting data:", err.message);
  } finally {
    client.release();
    await pool.end();
  }
})();
