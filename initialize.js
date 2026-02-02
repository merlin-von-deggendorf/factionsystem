import 'dotenv/config';
import { initializeDatabase, migrateDatabase } from './migrations.js';
import { dumpDatabaseSchema, closeManagementPool } from './databasemanagement.js';

export async function runInitialize() {
  try {
    await initializeDatabase();
    await migrateDatabase(false);
    await dumpDatabaseSchema(process.env.DB_DATABASE);
  } finally {
    await closeManagementPool();
  }
}

await runInitialize();
