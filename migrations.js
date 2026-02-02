import 'dotenv/config';
import mariadb from 'mariadb';
import fs from 'node:fs';
import path from 'node:path';
import { createDatabase } from './databasemanagement.js';

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  multipleStatements: true,
});

async function executeSqlFile(filePath) {
  const sql = await fs.promises.readFile(filePath, 'utf8');
  if (sql.trim().length === 0) return;

  const connection = await pool.getConnection();
  try {
    await connection.query(sql);
  } finally {
    connection.release();
  }
}

async function createMigrationTable() {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      'CREATE TABLE IF NOT EXISTS `migration_state` (`id` TINYINT UNSIGNED NOT NULL PRIMARY KEY, `version` INT UNSIGNED NOT NULL)'
    );
    await connection.query(
      'INSERT IGNORE INTO `migration_state` (`id`, `version`) VALUES (1, 0)'
    );
  } finally {
    connection.release();
  }
}

async function setMigrationNumber(version) {
  const connection = await pool.getConnection();
  try {
    await connection.query(
      'UPDATE `migration_state` SET `version` = ? WHERE `id` = 1',
      [version]
    );
  } finally {
    connection.release();
  }
}

async function getMigrationNumber() {
  const connection = await pool.getConnection();
  try {
    const rows = await connection.query(
      'SELECT `version` FROM `migration_state` WHERE `id` = 1'
    );
    return rows[0]?.version ?? 0;
  } finally {
    connection.release();
  }
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*(--|#).*$/gm, '');
}

function hasSqlOperation(sql) {
  const cleaned = stripSqlComments(sql).replace(/[\s;]/g, '');
  return cleaned.length > 0;
}


async function closeMigrationPool() {
  await pool.end();
}

export async function applyTest() {
  const testFile = 'test.sql';
  const migrationsDir = 'migrations';
  const testPath = path.resolve(testFile);
  const sql = await fs.promises.readFile(testPath, 'utf8');
  if (!hasSqlOperation(sql)) {
    throw new Error(`${path.basename(testFile)} contains no migration statements.`);
  }

  const directory = path.resolve(migrationsDir);
  const files = await fs.promises.readdir(directory);
  const fileSet = new Set(files);
  let nextVersion = 1;
  while (true) {
    const candidateName = `${nextVersion}.sql`;
    if (!fileSet.has(candidateName)) break;
    nextVersion += 1;
  }
  const targetPath = path.join(directory, `${nextVersion}.sql`);

  await fs.promises.rename(testPath, targetPath);
  await fs.promises.writeFile(testPath, '', 'utf8');

  return { version: nextVersion, file: targetPath };
}
export async function migrateDatabase(applyTestMigration) {
  let currentVersion = await getMigrationNumber();
  console.log(`Current database migration version: ${currentVersion}`);
  const migrationsDir = 'migrations';
  const directory = path.resolve(migrationsDir);
  const files = await fs.promises.readdir(directory);
  const fileSet = new Set(files);
  while (true) {
    let nextVersion = currentVersion + 1;
    const migrationFile = path.resolve(`migrations/${nextVersion}.sql`);
    if (!fileSet.has(`${nextVersion}.sql`)) {
      console.log('No more migration files found. Migration complete.');
      break;
    }
    console.log(`Applying migration version ${nextVersion}...`);
    await executeSqlFile(migrationFile);
    await setMigrationNumber(nextVersion);
    currentVersion = nextVersion;
    console.log(`Migration to version ${nextVersion} applied successfully.`);

  }
  if (applyTestMigration) {
    const testMigrationFile = path.resolve(`test.sql`);
    await executeSqlFile(testMigrationFile);
    console.log(`Test migration applied successfully.`);
  }

  await closeMigrationPool();

}

export async function initializeDatabase() {
  await createDatabase(process.env.DB_DATABASE);
  await createMigrationTable();
}
