// config/testDB.js
import { pool } from './db.js';

try {
  const result = await pool.query('SELECT NOW() AS now');
  console.log('✅ DB connected @', result.rows[0].now);
} catch (error) {
  console.error('❌ DB connection failed:', error.message);
} finally {
  await pool.end();
}
