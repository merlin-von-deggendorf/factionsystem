import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { applyTest, migrateDatabase, initializeDatabase } from './migrations.js';
import { dumpDatabaseSchema, closeManagementPool } from './databasemanagement.js';

export async function runDeploy() {
  const schemaPath = path.resolve('schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('schema.sql not found. Run the initialize step first.');
    process.exit(1);
  }

  try {
    await applyTest();
    await migrateDatabase(false);
    await dumpDatabaseSchema(process.env.DB_DATABASE);
  } finally {
    await closeManagementPool();
  }
}

await runDeploy();
