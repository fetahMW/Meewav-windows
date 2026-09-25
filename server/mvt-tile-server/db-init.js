import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error("Error: Neither DATABASE_URL nor SUPABASE_DB_URL is defined.");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('127.0.0.1') || connectionString.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

async function runMigration() {
  console.log("=================================================");
  console.log("MEEWAV MVT SERVER - DATABASE INITIALIZATION");
  console.log("=================================================");
  console.log(`Connecting to database...`);
  
  let client;
  try {
    client = await pool.connect();
    console.log("Connected successfully.");

    const sqlPath = path.resolve(__dirname, 'init.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`init.sql not found at ${sqlPath}`);
    }

    const fullSql = fs.readFileSync(sqlPath, 'utf8');

    // Split SQL by semicolons, but do not split if inside single quotes, or let's use a robust splitter
    // Since our init.sql has statements clearly separated by semicolons on new lines, we can split them
    const statements = fullSql
      .split(/;(?=(?:[^']*'[^']*')*[^']*$)/) // Avoid splitting semicolons inside single quotes
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute.`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const firstLine = stmt.split('\n')[0].trim();
      console.log(`[${i + 1}/${statements.length}] Executing: "${firstLine}..."`);
      
      await client.query(stmt);
    }

    console.log("\n=================================================");
    console.log("SUCCESS: Database schema and Paris dataset ready!");
    console.log("=================================================");
  } catch (err) {
    console.error("\n=================================================");
    console.error("MIGRATION ERROR:", err.message);
    console.error("=================================================");
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

runMigration();
