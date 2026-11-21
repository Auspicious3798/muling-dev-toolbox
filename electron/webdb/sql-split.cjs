'use strict';

/**
 * SQL 脚本切分器（唯一实现，查询面板与脚本导入共用）。
 *
 * 支持：
 * - 自定义分隔符：`DELIMITER $$` / `DELIMITER //`（存储过程、触发器）
 * - 单/双引号字符串（含转义与重复引号）、反引号标识符
 * - `-- `、`#` 行注释，`/* ... *\/` 块注释（含 `/*! ... *\/` 条件注释）
 * - 增量喂入：分块读取大文件时，未结束的语句留在缓冲区里
 */

function isSpace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\v';
}

function onlySpaceAndComments(text) {
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isSpace(ch)) {
      i += 1;
      continue;
    }
    if (ch === '#' || (ch === '-' && text[i + 1] === '-' && (text[i + 2] === undefined || isSpace(text[i + 2])))) {
      const end = text.indexOf('\n', i);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return true;
      i = end + 2;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * 扫描缓冲区，能切出多少条完整语句就切多少。
 * @returns {{statements: string[], rest: string, delimiter: string}}
 */
function scanBuffer(buffer, delimiter) {
  const statements = [];
  let current = '';
  let hasToken = false;
  let i = 0;
  let quote = '';
  let inQuote = false;
  let delim = delimiter || ';';

  while (i < buffer.length) {
    // 语句开头且在行首：识别 DELIMITER 指令
    if (!inQuote && !hasToken && (i === 0 || buffer[i - 1] === '\n')) {
      const head = buffer.slice(i);
      const trimmed = head.replace(/^[ \t\r\n]+/, '');
      const offset = head.length - trimmed.length;
      if (/^delimiter\b/i.test(trimmed)) {
        const lineEnd = trimmed.indexOf('\n');
        if (lineEnd === -1) {
          return { statements, rest: buffer.slice(i), delimiter: delim };
        }
        const line = trimmed.slice(0, lineEnd).replace(/\r$/, '');
        const match = line.match(/^delimiter\s+(\S+)\s*$/i);
        if (match) delim = match[1];
        i += offset + lineEnd + 1;
        current = '';
        hasToken = false;
        continue;
      }
    }

    const ch = buffer[i];
    const next = buffer[i + 1];

    if (!inQuote) {
      if (isSpace(ch) && !hasToken) {
        i += 1;
        continue;
      }
      if (ch === '#') {
        const end = buffer.indexOf('\n', i);
        const stop = end === -1 ? buffer.length : end + 1;
        current += buffer.slice(i, stop);
        i = stop;
        continue;
      }
      if (ch === '-' && next === '-' && (buffer[i + 2] === undefined || isSpace(buffer[i + 2]))) {
        const end = buffer.indexOf('\n', i);
        const stop = end === -1 ? buffer.length : end + 1;
        current += buffer.slice(i, stop);
        i = stop;
        continue;
      }
      if (ch === '/' && next === '*') {
        const end = buffer.indexOf('*/', i + 2);
        if (end === -1) {
          current += buffer.slice(i);
          i = buffer.length;
          continue;
        }
        current += buffer.slice(i, end + 2);
        i = end + 2;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        inQuote = true;
        quote = ch;
        current += ch;
        hasToken = true;
        i += 1;
        continue;
      }
      if (buffer.startsWith(delim, i)) {
        const text = current.trim();
        if (text) statements.push(text);
        current = '';
        hasToken = false;
        i += delim.length;
        continue;
      }
      current += ch;
      hasToken = true;
      i += 1;
      continue;
    }

    if (ch === '\\' && quote !== '`') {
      current += ch + (buffer[i + 1] || '');
      i += 2;
      continue;
    }
    current += ch;
    if (ch === quote) {
      if (buffer[i + 1] === quote) {
        current += buffer[i + 1];
        i += 2;
        continue;
      }
      inQuote = false;
      quote = '';
    }
    i += 1;
  }

  return { statements, rest: current, delimiter: delim };
}

class SqlScriptParser {
  constructor(delimiter) {
    this.buffer = '';
    this.delimiter = delimiter || ';';
  }

  /** 喂入一段文本，返回这一块里能确定完整的语句 */
  push(chunk) {
    if (!chunk) return [];
    this.buffer += chunk;
    const result = scanBuffer(this.buffer, this.delimiter);
    this.buffer = result.rest;
    this.delimiter = result.delimiter;
    return result.statements;
  }

  /** 结束喂入，返回最后残留的一条语句（如果有） */
  finish() {
    const tail = this.buffer.trim();
    this.buffer = '';
    if (!tail || onlySpaceAndComments(tail)) return [];
    return [tail];
  }
}

/** 一次性切分（SQL 面板用） */
function splitStatements(sql) {
  const parser = new SqlScriptParser();
  const statements = parser.push(String(sql || ''));
  return statements.concat(parser.finish());
}

module.exports = { SqlScriptParser, splitStatements, scanBuffer };
