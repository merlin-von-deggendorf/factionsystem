import 'dotenv/config';
import mariadb from 'mariadb';
import bcrypt from 'bcrypt';

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});


export async function closeDbPool() {
  await pool.end();
}
