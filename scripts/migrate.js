'use strict';

require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigrations() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const migrationsDir = path.resolve(__dirname, '../migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error('ERROR: migrations/ directory not found');
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    await pool.end();
    return;
  }

  console.log(`Found ${files.length} migration file(s):`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`  Running: ${file}...`);
    try {
      await pool.query(sql);
      console.log(`  ✓ ${file} applied successfully`);
    } catch (err) {
      console.error(`  ✗ ${file} failed: ${err.message}`);
      await pool.end();
      process.exit(1);
    }
  }

  console.log('\nAll migrations applied successfully.');
  await pool.end();
}

runMigrations().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
