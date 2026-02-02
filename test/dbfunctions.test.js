import 'dotenv/config';
import { test, before, after } from 'node:test';
import {
  deleteDatabase,
  closeManagementPool,
} from '../databasemanagement.js';
import { migrateDatabase, initializeDatabase } from '../migrations.js';
const dbName = process.env.DB_DATABASE;


before(async () => {
  await initializeDatabase();
  await migrateDatabase(true);
});

after(async () => {
  await closeDbPool();
  await deleteDatabase(dbName);
  await closeManagementPool();
});
