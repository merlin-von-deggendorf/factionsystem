import 'dotenv/config';
import mariadb from 'mariadb';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

export async function createDatabase(dbName) {
  await pool.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
}

export async function deleteDatabase(dbName) {
  await pool.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
}

export async function dumpDatabaseSchema(dbName) {
  const dumpPath = process.env.DB_DUMP_TOOLS_PATH;
  const outputPath = path.resolve(`schema.sql`);

  const args = [
    '-h',
    process.env.DB_HOST,
    '-P',
    process.env.DB_PORT,
    '-u',
    process.env.DB_USER,
    `-p${process.env.DB_PASSWORD}`,
    '--no-data',
    '--routines',
    '--triggers',
    '--events',
    `--ignore-table=${dbName}.migration_state`,
    dbName,
  ];

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath, { encoding: 'utf8' });
    const proc = spawn(dumpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stdout.pipe(output);
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(`mysqldump failed with exit code ${code}: ${stderr.trim()}`)
        );
      }
    });
  });

  return outputPath;
}

export async function closeManagementPool() {
  await pool.end();
}
