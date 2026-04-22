import { pool } from "../config/db.js";

const cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

export async function getTableColumns(tableName) {
  const now = Date.now();
  const cached = cache.get(tableName);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.columns;
  }

  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${tableName}\``);
  const columns = new Set(rows.map((row) => row.Field));
  cache.set(tableName, { columns, timestamp: now });
  return columns;
}

export async function getTableColumnMap(tableName) {
  const now = Date.now();
  const cacheKey = `${tableName}__map`;
  const cached = cache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.columnMap;
  }

  const [rows] = await pool.query(`SHOW COLUMNS FROM \`${tableName}\``);
  const columnMap = new Map(rows.map((row) => [row.Field, row]));
  cache.set(cacheKey, { columnMap, timestamp: now });
  return columnMap;
}

export function invalidateCache(tableName) {
  cache.delete(tableName);
  cache.delete(`${tableName}__map`);
}
