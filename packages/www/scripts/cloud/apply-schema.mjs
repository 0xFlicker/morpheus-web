import { readFile } from 'node:fs/promises';
import { Pool, neonConfig } from '@neondatabase/serverless';
import WebSocket from 'ws';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
try {
  await pool.query(schema);
} finally {
  await pool.end();
}
console.log('Morpheus Cloud schema applied.');
