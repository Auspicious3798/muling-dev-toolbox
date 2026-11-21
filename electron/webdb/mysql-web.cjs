'use strict';

const mysql = require('mysql2/promise');
const { randomUUID } = require('crypto');
const { readBody, sendJson, sendFile, fail } = require('./common.cjs');
const { SqlScriptParser, splitStatements } = require('./sql-split.cjs');

function quoteIdent(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function safeDir(value) {
  return String(value || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
}

const SYSTEM_SCHEMAS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);

const IDENT = /^[A-Za-z0-9_$-]{1,64}$/;

const EXPORT_LIMIT = 50000;

function pad(n) {
  return String(n).padStart(2, '0');
}

function stampNow() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function dateText(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function plainValue(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return '0x' + value.toString('hex');
  if (value instanceof Date) return dateText(value);
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function csvCell(value) {
  const plain = plainValue(value);
  if (plain === null) return '';
  const text = String(plain);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return `'${dateText(value)}'`;
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`;
  const text = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\x1a/g, '\\Z');
  return `'${text}'`;
}

function buildExport(format, db, table, columns, rows) {
  // mysql2 默认返回对象行，这里统一成按列顺序的二维数组，三种格式共用
  const matrix = rows.map((row) => columns.map((column) => row[column]));
  if (format === 'sql') {
    const head = `-- ${db}.${table} · 导出 ${matrix.length} 行 · ${new Date().toLocaleString('zh-CN')}\n`;
    const target = `${quoteIdent(db)}.${quoteIdent(table)}`;
    const columnList = columns.map((c) => quoteIdent(c)).join(', ');
    const body = matrix
      .map((row) => `INSERT INTO ${target} (${columnList}) VALUES (${row.map((v) => sqlLiteral(v)).join(', ')});`)
      .join('\n');
    return {
      ext: 'sql',
      contentType: 'application/sql; charset=utf-8',
      text: head + body + (body ? '\n' : '')
    };
  }
  if (format === 'json') {
    const objects = matrix.map((row) => {
      const item = {};
      columns.forEach((column, index) => {
        item[column] = plainValue(row[index]);
      });
      return item;
    });
    return {
      ext: 'json',
      contentType: 'application/json; charset=utf-8',
      text: JSON.stringify(objects, null, 2)
    };
  }
  const lines = [columns.map((c) => csvCell(c)).join(',')];
  for (const row of matrix) lines.push(row.map((v) => csvCell(v)).join(','));
  return {
    ext: 'csv',
    contentType: 'text/csv; charset=utf-8',
    // BOM 让 Excel 正确识别 UTF-8 中文
    text: '\ufeff' + lines.join('\r\n') + '\r\n'
  };
}


function serializeValue(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return `<binary ${value.length} bytes>`;
  if (value instanceof Date) return value.toISOString().replace('T', ' ').replace('Z', '');
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}


function resultFromQuery(rows, fields, tookMs, statement) {
  if (Array.isArray(rows) && Array.isArray(fields)) {
    return {
      kind: 'rows',
      statement,
      columns: fields.map((f) => f.name),
      rows: rows.slice(0, 5000).map((row) => (Array.isArray(row) ? row.map(serializeValue) : fields.map((f) => serializeValue(row[f.name])))),
      truncated: rows.length > 5000,
      tookMs
    };
  }
  const info = rows || {};
  return {
    kind: 'write',
    statement,
    affectedRows: info.affectedRows || 0,
    insertId: info.insertId ? String(info.insertId) : null,
    changedRows: info.changedRows || 0,
    warningStatus: info.warningStatus || 0,
    info: info.info || '',
    tookMs
  };
}

class MysqlWebBackend {
  constructor() {
    this.pool = null;
    this.meta = null;
    // 脚本导入会话：每次导入独占一个连接，保证 USE / SET / LOCK / 事务状态连续
    this.imports = new Map();
    this.importTimer = setInterval(() => this.sweepImports(), 60000);
    if (this.importTimer.unref) this.importTimer.unref();
  }

  async connect(conn) {
    await this.close();
    const pool = mysql.createPool({
      host: conn.host || '127.0.0.1',
      port: Number(conn.port) || 3306,
      user: conn.user || 'root',
      password: conn.password || '',
      connectionLimit: 4,
      connectTimeout: 8000,
      waitForConnections: true,
      charset: 'utf8mb4',
      dateStrings: true
    });
    const [rows] = await pool.query('SELECT VERSION() AS version, @@hostname AS hostname');
    this.pool = pool;
    this.meta = {
      host: conn.host || '127.0.0.1',
      port: Number(conn.port) || 3306,
      user: conn.user || 'root',
      version: rows[0] ? rows[0].version : '',
      hostname: rows[0] ? rows[0].hostname : ''
    };
    return this.meta;
  }

  async close() {
    for (const session of [...this.imports.values()]) {
      this.disposeImportSession(session);
    }
    if (this.importTimer) {
      clearInterval(this.importTimer);
      this.importTimer = null;
    }
    if (this.pool) {
      const pool = this.pool;
      this.pool = null;
      try {
        await pool.end();
      } catch (err) {
        // 忽略关闭失败
      }
    }
  }

  /* ---------------- 脚本导入 ---------------- */

  sweepImports() {
    const now = Date.now();
    for (const session of [...this.imports.values()]) {
      if (now - session.touchedAt > 10 * 60 * 1000) this.disposeImportSession(session);
    }
  }

  disposeImportSession(session) {
    this.imports.delete(session.id);
    try {
      session.conn.release();
    } catch (err) {
      // 连接可能已经断开
    }
  }

  importSnapshot(session) {
    return {
      id: session.id,
      db: session.db,
      executed: session.index,
      ok: session.ok,
      failed: session.failed.length,
      done: session.done,
      stopped: session.stopped,
      cancelled: session.cancelled,
      elapsedMs: Date.now() - session.startedAt,
      failedList: session.failed.slice(0, 20)
    };
  }

  async runImported(session, statements) {
    for (const statement of statements) {
      if (session.cancelled || session.stopped) break;
      session.index += 1;
      try {
        await session.conn.query(statement);
        session.ok += 1;
      } catch (err) {
        session.failed.push({
          index: session.index,
          message: err.message || String(err),
          code: err.code || '',
          sql: statement.replace(/\s+/g, ' ').slice(0, 160)
        });
        if (!session.continueOnError) {
          session.stopped = true;
          break;
        }
      }
    }
  }

  async query(sql, params) {
    if (!this.pool) throw new Error('MySQL 连接未建立');
    return this.pool.query(sql, params);
  }

  async api(req, res, url) {
    const route = url.pathname.replace(/^\/api\//, '');
    try {
      if (route === 'ping') {
        sendJson(res, 200, { ok: true, data: { pong: Date.now() } });
        return;
      }
      if (route === 'meta') {
        const [dbs] = await this.query('SELECT COUNT(*) AS n FROM information_schema.SCHEMATA');
        sendJson(res, 200, { ok: true, data: { ...this.meta, databases: dbs[0] ? dbs[0].n : 0 } });
        return;
      }
      if (route === 'databases') {
        const [rows] = await this.query(
          'SELECT SCHEMA_NAME AS name, DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation FROM information_schema.SCHEMATA ORDER BY SCHEMA_NAME'
        );
        sendJson(res, 200, { ok: true, data: rows });
        return;
      }
      if (route === 'database' && req.method === 'POST') {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const name = String(body.name || '').trim();
        if (!/^[A-Za-z0-9_$-]{1,64}$/.test(name)) {
          fail(res, 400, '库名只能包含字母、数字、下划线、$ 和 -');
          return;
        }
        if (SYSTEM_SCHEMAS.has(name.toLowerCase())) {
          fail(res, 400, '系统库不能操作');
          return;
        }
        if (action === 'create') {
          const charset = /^[A-Za-z0-9_]{1,32}$/.test(String(body.charset || '')) ? String(body.charset) : 'utf8mb4';
          await this.query(`CREATE DATABASE IF NOT EXISTS ${quoteIdent(name)} CHARACTER SET ${charset}`);
          sendJson(res, 200, { ok: true, data: { name, created: true } });
          return;
        }
        if (action === 'drop') {
          if (String(body.confirm || '') !== name) {
            fail(res, 400, '请输入完整的库名确认删除');
            return;
          }
          await this.query(`DROP DATABASE ${quoteIdent(name)}`);
          sendJson(res, 200, { ok: true, data: { name, dropped: true } });
          return;
        }
        fail(res, 400, '不支持的库操作：' + action);
        return;
      }
      if (route === 'table' && req.method === 'POST') {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const db = String(body.db || '').trim();
        const name = String(body.name || '').trim();
        if (!IDENT.test(db) || !IDENT.test(name)) {
          fail(res, 400, '表名只能包含字母、数字、下划线、$ 和 -');
          return;
        }
        const tableRef = `${quoteIdent(db)}.${quoteIdent(name)}`;
        if (action === 'rename') {
          const newName = String(body.newName || '').trim();
          if (!IDENT.test(newName)) {
            fail(res, 400, '新表名只能包含字母、数字、下划线、$ 和 -');
            return;
          }
          await this.query(`RENAME TABLE ${tableRef} TO ${quoteIdent(db)}.${quoteIdent(newName)}`);
          sendJson(res, 200, { ok: true, data: { name, newName, renamed: true } });
          return;
        }
        if (action === 'truncate') {
          if (String(body.confirm || '') !== name) {
            fail(res, 400, '请输入完整的表名确认清空');
            return;
          }
          await this.query(`TRUNCATE TABLE ${tableRef}`);
          sendJson(res, 200, { ok: true, data: { name, truncated: true } });
          return;
        }
        if (action === 'drop') {
          if (String(body.confirm || '') !== name) {
            fail(res, 400, '请输入完整的表名确认删除');
            return;
          }
          await this.query(`DROP TABLE ${tableRef}`);
          sendJson(res, 200, { ok: true, data: { name, dropped: true } });
          return;
        }
        fail(res, 400, '不支持的表操作：' + action);
        return;
      }
      if (route === 'row' && req.method === 'POST') {
        const body = await readBody(req);
        const action = String(body.action || '').trim();
        const db = String(body.db || '').trim();
        const name = String(body.name || '').trim();
        if (!IDENT.test(db) || !IDENT.test(name)) {
          fail(res, 400, '库名或表名不合法');
          return;
        }
        const tableRef = `${quoteIdent(db)}.${quoteIdent(name)}`;
        const [colRows] = await this.query(
          `SELECT COLUMN_NAME AS name, COLUMN_KEY AS colKey, EXTRA AS extra
             FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
          [db, name]
        );
        if (!colRows.length) {
          fail(res, 404, '表不存在或没有字段');
          return;
        }
        const allowed = new Set(colRows.map((row) => row.name));
        const pk = colRows.filter((row) => row.colKey === 'PRI').map((row) => row.name);
        const take = (obj) => {
          const out = {};
          for (const [key, value] of Object.entries(obj && typeof obj === 'object' ? obj : {})) {
            if (!allowed.has(key)) continue;
            out[key] = value === undefined ? null : value;
          }
          return out;
        };
        const key = take(body.key);
        const keyError = () => {
          if (!pk.length) return '该表没有主键，不能修改或删除行';
          const missing = pk.filter((column) => !(column in key));
          return missing.length ? '缺少主键列：' + missing.join(', ') : '';
        };
        if (action === 'update') {
          const changes = take(body.changes);
          const columns = Object.keys(changes);
          if (!columns.length) {
            fail(res, 400, '没有要修改的字段');
            return;
          }
          const problem = keyError();
          if (problem) {
            fail(res, 400, problem);
            return;
          }
          const sql =
            `UPDATE ${tableRef} SET ${columns.map((column) => `${quoteIdent(column)} = ?`).join(', ')}` +
            ` WHERE ${pk.map((column) => `${quoteIdent(column)} <=> ?`).join(' AND ')} LIMIT 1`;
          const params = [...columns.map((column) => changes[column]), ...pk.map((column) => key[column])];
          const [result] = await this.query(sql, params);
          sendJson(res, 200, { ok: true, data: { affectedRows: result.affectedRows || 0, changedRows: result.changedRows || 0 } });
          return;
        }
        if (action === 'delete') {
          const problem = keyError();
          if (problem) {
            fail(res, 400, problem);
            return;
          }
          const sql = `DELETE FROM ${tableRef} WHERE ${pk.map((column) => `${quoteIdent(column)} <=> ?`).join(' AND ')} LIMIT 1`;
          const [result] = await this.query(sql, pk.map((column) => key[column]));
          sendJson(res, 200, { ok: true, data: { affectedRows: result.affectedRows || 0 } });
          return;
        }
        if (action === 'insert') {
          const values = take(body.values);
          const columns = Object.keys(values);
          if (!columns.length) {
            fail(res, 400, '没有要写入的字段');
            return;
          }
          const sql =
            `INSERT INTO ${tableRef} (${columns.map((column) => quoteIdent(column)).join(', ')})` +
            ` VALUES (${columns.map(() => '?').join(', ')})`;
          const [result] = await this.query(sql, columns.map((column) => values[column]));
          sendJson(res, 200, {
            ok: true,
            data: { affectedRows: result.affectedRows || 0, insertId: result.insertId ? String(result.insertId) : null }
          });
          return;
        }
        fail(res, 400, '不支持的行操作：' + action);
        return;
      }
      if (route === 'tables') {
        const db = url.searchParams.get('db') || '';
        const [rows] = await this.query(
          `SELECT TABLE_NAME AS name, ENGINE AS engine, TABLE_ROWS AS rowEstimate,
                  DATA_LENGTH + INDEX_LENGTH AS bytes, TABLE_COMMENT AS comment
             FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_NAME`,
          [db]
        );
        sendJson(res, 200, { ok: true, data: rows });
        return;
      }
      if (route === 'columns') {
        const db = url.searchParams.get('db') || '';
        const table = url.searchParams.get('table') || '';
        const [columns] = await this.query(
          `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_KEY AS colKey,
                  COLUMN_DEFAULT AS colDefault, EXTRA AS extra, COLUMN_COMMENT AS comment
             FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION`,
          [db, table]
        );
        const [indexRows] = await this.query(
          `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName, SEQ_IN_INDEX AS seq, INDEX_TYPE AS type
             FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
          [db, table]
        );
        const indexMap = new Map();
        for (const row of indexRows) {
          if (!indexMap.has(row.name)) {
            indexMap.set(row.name, { name: row.name, unique: !Number(row.nonUnique), type: row.type, columns: [] });
          }
          indexMap.get(row.name).columns.push(row.columnName);
        }
        let ddl = '';
        try {
          const [create] = await this.query(`SHOW CREATE TABLE ${quoteIdent(db)}.${quoteIdent(table)}`);
          ddl = create && create[0] ? create[0]['Create Table'] || create[0]['Create View'] || '' : '';
        } catch (err) {
          ddl = `-- 无法获取建表语句：${err.message}`;
        }
        sendJson(res, 200, { ok: true, data: { columns, indexes: [...indexMap.values()], ddl } });
        return;
      }
      if (route === 'rows') {
        const db = url.searchParams.get('db') || '';
        const table = url.searchParams.get('table') || '';
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 500);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
        const order = url.searchParams.get('order') || '';
        const dir = safeDir(url.searchParams.get('dir'));
        const where = (url.searchParams.get('where') || '').trim();
        const whereSql = where ? ` WHERE ${where}` : '';
        const tableRef = `${quoteIdent(db)}.${quoteIdent(table)}`;
        const orderSql = order ? ` ORDER BY ${quoteIdent(order)} ${dir}` : '';
        const [[countRow]] = await this.query(`SELECT COUNT(*) AS total FROM ${tableRef}${whereSql}`);
        const [rows, fields] = await this.query(
          `SELECT * FROM ${tableRef}${whereSql}${orderSql} LIMIT ${limit} OFFSET ${offset}`
        );
        const columns = (fields || []).map((f) => f.name);
        sendJson(res, 200, {
          ok: true,
          data: {
            columns,
            rows: rows.map((row) => columns.map((c) => serializeValue(row[c]))),
            total: countRow ? Number(countRow.total) : 0,
            limit,
            offset
          }
        });
        return;
      }
      if (route === 'export') {
        const db = url.searchParams.get('db') || '';
        const table = url.searchParams.get('table') || '';
        if (!IDENT.test(db) || !IDENT.test(table)) {
          fail(res, 400, '库名或表名不合法');
          return;
        }
        const format = ['csv', 'sql', 'json'].includes(url.searchParams.get('format'))
          ? url.searchParams.get('format')
          : 'csv';
        const where = (url.searchParams.get('where') || '').trim();
        const order = url.searchParams.get('order') || '';
        const dir = safeDir(url.searchParams.get('dir'));
        const scope = url.searchParams.get('scope') === 'page' ? 'page' : 'all';
        const pageLimit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 500);
        const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
        const whereSql = where ? ` WHERE ${where}` : '';
        const orderSql = order ? ` ORDER BY ${quoteIdent(order)} ${dir}` : '';
        const tableRef = `${quoteIdent(db)}.${quoteIdent(table)}`;
        const limitSql =
          scope === 'page' ? ` LIMIT ${pageLimit} OFFSET ${offset}` : ` LIMIT ${EXPORT_LIMIT + 1}`;
        const [rawRows, fields] = await this.query(
          `SELECT * FROM ${tableRef}${whereSql}${orderSql}${limitSql}`
        );
        const truncated = rawRows.length > EXPORT_LIMIT;
        const rows = truncated ? rawRows.slice(0, EXPORT_LIMIT) : rawRows;
        const columns = (fields || []).map((f) => f.name);
        const payload = buildExport(format, db, table, columns, rows);
        const filename = `${table}-${stampNow()}.${payload.ext}`;
        sendFile(res, 200, payload.text, payload.contentType, filename, {
          'x-webdb-export-rows': String(rows.length),
          'x-webdb-export-truncated': truncated ? '1' : '0'
        });
        return;
      }
      if (route === 'import/start' && req.method === 'POST') {
        if (!this.pool) throw new Error('MySQL 连接未建立');
        const body = await readBody(req);
        const db = String(body.db || '').trim();
        const conn = await this.pool.getConnection();
        const session = {
          id: randomUUID(),
          conn,
          parser: new SqlScriptParser(),
          db,
          index: 0,
          ok: 0,
          failed: [],
          continueOnError: Boolean(body.continueOnError),
          stopped: false,
          cancelled: false,
          done: false,
          startedAt: Date.now(),
          touchedAt: Date.now()
        };
        try {
          if (db) await conn.query(`USE ${quoteIdent(db)}`);
        } catch (err) {
          conn.release();
          throw new Error(`切不到库 ${db}：${err.message}`);
        }
        this.imports.set(session.id, session);
        sendJson(res, 200, { ok: true, data: { id: session.id, db } });
        return;
      }
      if (route === 'import/chunk' && req.method === 'POST') {
        const body = await readBody(req);
        const session = this.imports.get(String(body.id || ''));
        if (!session) {
          fail(res, 404, '导入会话不存在或已过期，请重新开始');
          return;
        }
        session.touchedAt = Date.now();
        const statements = session.parser.push(String(body.text || ''));
        if (body.last) statements.push(...session.parser.finish());
        await this.runImported(session, statements);
        if (body.last) session.done = true;
        const snapshot = this.importSnapshot(session);
        if (session.done || session.stopped || session.cancelled) {
          snapshot.finished = true;
          this.disposeImportSession(session);
        }
        sendJson(res, 200, { ok: true, data: snapshot });
        return;
      }
      if (route === 'import/cancel' && req.method === 'POST') {
        const body = await readBody(req);
        const session = this.imports.get(String(body.id || ''));
        if (session) {
          session.cancelled = true;
          this.disposeImportSession(session);
        }
        sendJson(res, 200, { ok: true, data: { cancelled: Boolean(session) } });
        return;
      }
      if (route === 'query' && req.method === 'POST') {
        const body = await readBody(req);
        const sqlText = String(body.sql || '').trim();
        if (!sqlText) {
          fail(res, 400, 'SQL 不能为空');
          return;
        }
        const statements = splitStatements(sqlText);
        if (!statements.length) {
          fail(res, 400, '没有可执行的语句');
          return;
        }
        const results = [];
        const conn = await this.pool.getConnection();
        try {
          if (body.db) await conn.query(`USE ${quoteIdent(String(body.db))}`);
          for (const statement of statements.slice(0, 50)) {
            const started = Date.now();
            const [rows, fields] = await conn.query(statement);
            results.push(resultFromQuery(rows, fields, Date.now() - started, statement.slice(0, 200)));
          }
        } finally {
          conn.release();
        }
        sendJson(res, 200, { ok: true, data: { results, statements: results.length } });
        return;
      }
      fail(res, 404, `未知接口：${route}`);
    } catch (err) {
      fail(res, 400, err.message || String(err), err.code || 'MYSQL_ERR');
    }
  }
}

module.exports = { MysqlWebBackend, splitStatements };
