'use strict';

(function () {
  const TOKEN = new URLSearchParams(location.search).get('t') || '';
  const SYSTEM_DBS = new Set(['information_schema', 'mysql', 'performance_schema', 'sys']);
  const PAGE_SIZES = [50, 100, 300];

  const state = {
    meta: null,
    dbs: [],
    db: '',
    tables: [],
    table: '',
    tab: 'data',
    rows: null,
    page: 0,
    pageSize: 50,
    where: '',
    order: '',
    dir: 'asc',
    structure: null,
    structureTable: '',
    pending: {},
    undoStack: [],
    tableFilter: ''
  };

  const $ = (id) => document.getElementById(id);

  /* ---------------- 基础工具 ---------------- */

  async function api(path, options) {
    const opts = options || {};
    const res = await fetch('/api/' + path, {
      method: opts.method || 'GET',
      headers: {
        'content-type': 'application/json',
        'x-webdb-token': TOKEN
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    });
    let payload = null;
    try {
      payload = await res.json();
    } catch (err) {
      throw new Error('服务返回了无法解析的内容（HTTP ' + res.status + '）');
    }
    if (!payload || payload.ok !== true) {
      const message = payload && payload.error && payload.error.message ? payload.error.message : 'HTTP ' + res.status;
      const error = new Error(message);
      error.code = payload && payload.error ? payload.error.code : '';
      throw error;
    }
    return payload.data;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  let toastTimer = 0;
  function toast(message, isError) {
    const box = $('toast');
    box.textContent = message;
    box.classList.toggle('is-error', Boolean(isError));
    box.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('is-visible'), isError ? 4200 : 2000);
  }

  function fmtBytes(n) {
    const value = Number(n) || 0;
    if (value <= 0) return '0 B';
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    if (value < 1024 * 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + ' MB';
    return (value / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  function fmtNumber(n) {
    return Number(n || 0).toLocaleString('zh-CN');
  }

  function numText(value) {
    const text = String(value);
    return /^-?\d+(\.\d+)?$/.test(text) ? ' num' : '';
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast((label || '内容') + '已复制');
    } catch (err) {
      toast('复制失败：' + err.message, true);
    }
  }

  /* ---------------- 通用表格渲染 ---------------- */

  function renderTable(tableEl, columns, rows, options) {
    const opts = options || {};
    const edit = opts.edit || null;
    tableEl.textContent = '';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.appendChild(el('th', 'rownum', '#'));
    columns.forEach((column) => {
      const th = el('th');
      if (opts.sortable) {
        const button = el('button', 'th-sort', column);
        button.type = 'button';
        button.dataset.column = column;
        if (state.order === column) {
          button.dataset.active = 'true';
          button.textContent = column + (state.dir === 'asc' ? ' ↑' : ' ↓');
        }
        th.appendChild(button);
      } else {
        th.textContent = column;
      }
      headRow.appendChild(th);
    });
    if (edit && edit.canEdit) {
      const th = el('th', 'row-actions', '');
      th.title = '删除这一行';
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    if (!rows || !rows.length) {
      const tr = document.createElement('tr');
      const td = el('td', 'grid-empty', opts.emptyText || '暂无数据');
      td.colSpan = columns.length + 1;
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      const base = opts.startNumber === undefined ? 1 : opts.startNumber;
      let copyTimer = null;
      rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIndex = String(index);
        tr.appendChild(el('td', 'rownum', base + index));
        for (let i = 0; i < columns.length; i += 1) {
          const value = row[i];
          const isNull = value === null || value === undefined;
          const text = isNull ? 'NULL' : String(value);
          const td = el('td', 'cell' + (isNull ? ' null' : numText(text)), text);
          if (!isNull) {
            td.title = text;
            td.addEventListener('click', (event) => {
              if (event.detail > 1) return;
              clearTimeout(copyTimer);
              copyTimer = setTimeout(() => copyText(text, '单元格'), 220);
            });
          }
          if (edit && edit.canEdit) {
            td.classList.add('editable');
            td.title = (isNull ? 'NULL' : text) + '（双击修改）';
            td.addEventListener('dblclick', (event) => {
              event.preventDefault();
              event.stopPropagation();
              clearTimeout(copyTimer);
              startCellEdit(td, columns[i], isNull ? null : value, (column, nextValue) => edit.onEdit(index, column, nextValue));
            });
          }
          tr.appendChild(td);
        }
        if (edit && edit.canEdit) {
          const td = el('td', 'row-actions');
          const button = el('button', 'row-del', '删除');
          button.type = 'button';
          button.addEventListener('click', (event) => {
            event.stopPropagation();
            edit.onDelete(index, button);
          });
          td.appendChild(button);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    }
    tableEl.appendChild(tbody);
  }

  /* ---------------- 单元格编辑 ---------------- */

  function startCellEdit(td, column, value, onCommit) {
    if (td.querySelector('input')) return;
    const original = td.textContent;
    const input = document.createElement('input');
    input.className = 'cell-input';
    input.type = 'text';
    input.value = value === null || value === undefined ? '' : String(value);
    input.spellcheck = false;
    td.textContent = '';
    td.appendChild(input);
    td.classList.add('is-editing');
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const next = input.value;
      td.classList.remove('is-editing');
      if (!commit) {
        td.textContent = original;
        td.classList.toggle('null', original === 'NULL');
        return;
      }
      const normalized = next === '' ? null : next;
      td.textContent = normalized === null ? 'NULL' : normalized;
      td.classList.toggle('null', normalized === null);
      td.classList.toggle('num', normalized !== null && numText(normalized) !== '');
      onCommit(column, normalized);
    };
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /* ---------------- 连接与库表 ---------------- */

  async function loadMeta() {
    const meta = await api('meta');
    state.meta = meta;
    const badge = $('conn-badge');
    badge.textContent = (meta.user || 'root') + '@' + (meta.host || '127.0.0.1') + ':' + (meta.port || 3306) +
      ' · MySQL ' + (meta.version || '') + ' · ' + fmtNumber(meta.databases) + ' 个库';
    badge.classList.add('is-ok');
  }

  async function loadDatabases() {
    const dbs = await api('databases');
    state.dbs = dbs;
    renderDbList();
    const remembered = localStorage.getItem('webmysql.db');
    const candidates = [state.db, remembered, ...dbs.filter((d) => !SYSTEM_DBS.has(d.name)).map((d) => d.name), ...dbs.map((d) => d.name)];
    const pick = candidates.find((name) => name && dbs.some((d) => d.name === name)) || '';
    if (pick) {
      await selectDb(pick);
    }
  }

  function renderDbList() {
    const list = $('db-list');
    list.textContent = '';
    state.dbs.forEach((db) => {
      const li = el('li', 'db-item');
      if (db.name === state.db) li.classList.add('is-active');
      if (SYSTEM_DBS.has(db.name)) li.classList.add('is-system');
      li.dataset.db = db.name;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', db.name === state.db ? 'true' : 'false');
      li.title = db.name + (db.charset ? ' · ' + db.charset : '') + '\n点击切换，右键可删除或新建';
      li.appendChild(el('span', 'db-name', db.name));
      li.appendChild(el('span', 'db-meta', db.charset || ''));
      li.addEventListener('click', () => {
        closeDbPop();
        if (db.name !== state.db) selectDb(db.name).catch((err) => toast(err.message, true));
      });
      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openDbMenu(db.name, event.clientX, event.clientY);
      });
      list.appendChild(li);
    });
    $('db-current').textContent = state.db || '选择数据库';
  }

  function openDbPop() {
    $('db-pop').classList.remove('hidden');
    $('db-trigger').setAttribute('aria-expanded', 'true');
  }

  function closeDbPop() {
    $('db-pop').classList.add('hidden');
    $('db-trigger').setAttribute('aria-expanded', 'false');
  }

  /* ---------------- 库右键菜单与新建/删除 ---------------- */

  let menuDb = '';

  function openDbMenu(name, x, y) {
    menuDb = name || state.db;
    if (!menuDb) return;
    const menu = $('db-ctx');
    const system = SYSTEM_DBS.has(menuDb);
    menu.querySelector('[data-act="drop"]').disabled = system;
    menu.querySelector('[data-act="drop"]').title = system ? '系统库不能删除' : '';
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
    menu.querySelector('[data-act="open"]').focus();
  }

  function closeDbMenu() {
    $('db-ctx').classList.add('hidden');
  }

  function openDbModal(mode, name) {
    state.dbModal = { mode, name: name || '' };
    const creating = mode === 'create';
    $('db-modal-title').textContent = creating ? '新建数据库' : '删除数据库';
    $('db-modal-name').value = creating ? '' : '';
    $('db-modal-name').placeholder = creating ? '例如 muling_demo' : '输入 ' + name + ' 确认';
    $('db-modal-charset-field').classList.toggle('hidden', !creating);
    $('btn-db-modal-ok').textContent = creating ? '创建' : '删除';
    $('btn-db-modal-ok').className = creating ? 'btn primary' : 'btn danger';
    const hint = $('db-modal-hint');
    hint.classList.toggle('hidden', creating);
    hint.textContent = creating ? '' : '删除不可恢复。请在上面的输入框里再输入一次库名「' + name + '」以确认。';
    $('db-modal').classList.remove('hidden');
    const field = $('db-modal-name');
    if (!creating) field.value = '';
    setTimeout(() => field.focus(), 30);
  }

  function closeDbModal() {
    $('db-modal').classList.add('hidden');
    state.dbModal = null;
  }

  async function submitDbModal() {
    const modal = state.dbModal;
    if (!modal) return;
    const typed = $('db-modal-name').value.trim();
    const ok = $('btn-db-modal-ok');
    if (modal.mode === 'create') {
      if (!/^[A-Za-z0-9_$-]{1,64}$/.test(typed)) {
        toast('库名只能包含字母、数字、下划线、$ 和 -', true);
        $('db-modal-name').focus();
        return;
      }
      ok.disabled = true;
      try {
        await api('database', { method: 'POST', body: { action: 'create', name: typed, charset: $('db-modal-charset').value } });
        closeDbModal();
        await loadMeta();
        await loadDatabases();
        await selectDb(typed);
        toast('数据库 ' + typed + ' 已创建');
      } catch (err) {
        toast('创建失败：' + err.message, true);
      } finally {
        ok.disabled = false;
      }
      return;
    }
    if (typed !== modal.name) {
      toast('库名不一致，删除已取消', true);
      return;
    }
    ok.disabled = true;
    try {
      await api('database', { method: 'POST', body: { action: 'drop', name: modal.name, confirm: typed } });
      closeDbModal();
      if (state.db === modal.name) {
        state.db = '';
        localStorage.removeItem('webmysql.db');
      }
      await loadMeta();
      await loadDatabases();
      toast('数据库 ' + modal.name + ' 已删除');
    } catch (err) {
      toast('删除失败：' + err.message, true);
    } finally {
      ok.disabled = false;
    }
  }

  /* ---------------- 表右键菜单与重命名/清空/删除 ---------------- */

  let menuTable = null;
  let tblModal = null;

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('is-active', item.dataset.tab === tab));
    $('panel-data').classList.toggle('hidden', tab !== 'data');
    $('panel-structure').classList.toggle('hidden', tab !== 'structure');
    $('panel-sql').classList.toggle('hidden', tab !== 'sql');
    if (tab === 'sql') {
      $('sql-input').focus();
      renderSqlHighlight();
    }
  }

  function openTblMenu(name, x, y) {
    menuTable = name;
    if (!menuTable) return;
    const menu = $('tbl-ctx');
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
    menu.querySelector('[data-act="open"]').focus();
  }

  function closeTblMenu() {
    $('tbl-ctx').classList.add('hidden');
  }

  function openTblModal(mode, name) {
    tblModal = { mode, name };
    const renaming = mode === 'rename';
    $('tbl-modal-title').textContent = renaming ? '重命名表' : mode === 'truncate' ? '清空表数据' : '删除表';
    $('tbl-modal-label').textContent = renaming ? '新表名' : '表名';
    const input = $('tbl-modal-name');
    input.value = '';
    input.placeholder = renaming ? '例如 ' + name + '_backup' : '输入 ' + name + ' 确认';
    $('btn-tbl-modal-ok').textContent = renaming ? '重命名' : mode === 'truncate' ? '清空' : '删除';
    $('btn-tbl-modal-ok').className = renaming ? 'btn primary' : 'btn danger';
    const hint = $('tbl-modal-hint');
    hint.classList.toggle('hidden', renaming);
    hint.textContent = mode === 'truncate'
      ? '表结构会保留，表内数据全部删除且不可恢复。请再输入一次表名「' + name + '」确认。'
      : '删除后表和数据一起消失，不可恢复。请再输入一次表名「' + name + '」确认。';
    $('tbl-modal').classList.remove('hidden');
    setTimeout(() => input.focus(), 30);
  }

  function closeTblModal() {
    $('tbl-modal').classList.add('hidden');
    tblModal = null;
  }

  async function copyTableDdl(name) {
    try {
      const data = await api('columns?db=' + encodeURIComponent(state.db) + '&table=' + encodeURIComponent(name));
      if (!data.ddl) {
        toast('没有取到建表语句', true);
        return;
      }
      await copyText(data.ddl, '建表语句');
    } catch (err) {
      toast('读取建表语句失败：' + err.message, true);
    }
  }

  async function submitTblModal() {
    const modal = tblModal;
    if (!modal) return;
    const typed = $('tbl-modal-name').value.trim();
    const ok = $('btn-tbl-modal-ok');
    if (modal.mode === 'rename') {
      if (!/^[A-Za-z0-9_$-]{1,64}$/.test(typed)) {
        toast('表名只能包含字母、数字、下划线、$ 和 -', true);
        return;
      }
      if (typed === modal.name) {
        toast('新表名和原名一样', true);
        return;
      }
      ok.disabled = true;
      try {
        await api('table', { method: 'POST', body: { action: 'rename', db: state.db, name: modal.name, newName: typed } });
        closeTblModal();
        if (state.table === modal.name) state.table = typed;
        await loadTables();
        toast('表 ' + modal.name + ' 已重命名为 ' + typed);
      } catch (err) {
        toast('重命名失败：' + err.message, true);
      } finally {
        ok.disabled = false;
      }
      return;
    }
    if (typed !== modal.name) {
      toast('表名不一致，操作已取消', true);
      return;
    }
    ok.disabled = true;
    try {
      await api('table', { method: 'POST', body: { action: modal.mode, db: state.db, name: modal.name, confirm: typed } });
      closeTblModal();
      await loadTables();
      if (modal.mode === 'truncate') {
        if (state.table === modal.name) await loadRows();
        toast('表 ' + modal.name + ' 已清空');
      } else {
        if (state.table === modal.name) {
          state.table = '';
          updateCurrentTable();
          const first = state.tables[0];
          if (first) {
            await selectTable(first.name);
          } else {
            renderTable($('grid'), [], [], { emptyText: '这个库里还没有表' });
            $('page-info').textContent = '没有数据';
            $('row-count').textContent = '';
          }
        }
        toast('表 ' + modal.name + ' 已删除');
      }
    } catch (err) {
      toast((modal.mode === 'truncate' ? '清空' : '删除') + '失败：' + err.message, true);
    } finally {
      ok.disabled = false;
    }
  }

  async function selectDb(db) {
    state.db = db;
    state.table = '';
    state.rows = null;
    localStorage.setItem('webmysql.db', db);
    $('db-current').textContent = db || '选择数据库';
    renderDbList();
    updateCurrentTable();
    renderTable($('grid'), [], [], { emptyText: '选择左侧的数据表开始查看' });
    $('col-table').textContent = '';
    $('idx-table').textContent = '';
    $('ddl').textContent = '';
    await loadTables();
    if (!state.table && state.tables.length) await selectTable(state.tables[0].name);
  }

  async function loadTables() {
    if (!state.db) return;
    try {
      const tables = await api('tables?db=' + encodeURIComponent(state.db));
      state.tables = tables;
      renderTableList();
    } catch (err) {
      toast('读取数据表失败：' + err.message, true);
    }
  }

  function renderTableList() {
    const list = $('table-list');
    const filter = state.tableFilter.trim().toLowerCase();
    const tables = state.tables.filter((table) => !filter || table.name.toLowerCase().includes(filter));
    list.textContent = '';
    if (!tables.length) {
      list.appendChild(el('li', 'empty', filter ? '没有匹配的表' : '这个库里还没有表'));
    } else {
      tables.forEach((table) => {
        const li = el('li');
        if (table.name === state.table) li.classList.add('is-active');
        li.appendChild(el('span', null, table.name));
        li.appendChild(el('span', 'tbl-meta', fmtNumber(table.rowEstimate) + ' 行'));
        li.title = table.name + (table.comment ? ' · ' + table.comment : '') +
          '\n约 ' + fmtNumber(table.rowEstimate) + ' 行 · ' + fmtBytes(table.bytes) +
          '\n右键可重命名、清空或删除';
        li.addEventListener('click', () => selectTable(table.name));
        li.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          openTblMenu(table.name, event.clientX, event.clientY);
        });
        list.appendChild(li);
      });
    }
    $('table-count').textContent = state.tables.length
      ? '共 ' + state.tables.length + ' 张表' + (filter ? '，匹配 ' + tables.length : '')
      : '—';
  }

  async function selectTable(name) {
    state.table = name;
    state.page = 0;
    state.order = '';
    state.dir = 'asc';
    state.where = '';
    $('where-input').value = '';
    renderTableList();
    updateCurrentTable();
    await Promise.all([loadRows(), loadStructure()]);
  }

  function updateCurrentTable() {
    $('current-table').textContent = state.table ? state.db + '.' + state.table : state.db ? state.db : '';
  }

  /* ---------------- 数据 ---------------- */

  async function loadRows() {
    if (!state.db || !state.table) return;
    const grid = $('grid');
    grid.textContent = '';
    try {
      await ensureStructure();
      const params = new URLSearchParams({
        db: state.db,
        table: state.table,
        limit: String(state.pageSize),
        offset: String(state.page * state.pageSize)
      });
      if (state.where) params.set('where', state.where);
      if (state.order) {
        params.set('order', state.order);
        params.set('dir', state.dir);
      }
      const data = await api('rows?' + params.toString());
      state.rows = data;
      state.pending = {};
      const keys = primaryKey();
      renderTable(grid, data.columns, data.rows, {
        sortable: true,
        startNumber: data.offset + 1,
        edit: {
          canEdit: keys.length > 0,
          onEdit: (index, column, value) => queueCellEdit(index, column, value),
          onDelete: (index, button) => deleteRow(index, button)
        }
      });
      updateEditBar();
      const start = data.total ? data.offset + 1 : 0;
      const end = data.offset + data.rows.length;
      $('page-info').textContent = data.total
        ? '第 ' + fmtNumber(start) + '–' + fmtNumber(end) + ' 条 / 共 ' + fmtNumber(data.total) + ' 条'
        : '没有数据';
      $('row-count').textContent = data.columns.length + ' 个字段';
      $('btn-prev').disabled = state.page === 0;
      $('btn-next').disabled = data.offset + data.rows.length >= data.total;
    } catch (err) {
      renderTable(grid, [], [], { emptyText: '读取失败：' + err.message });
      $('page-info').textContent = '—';
      toast(err.message, true);
    }
  }

  async function ensureStructure() {
    if (state.structure && state.structureTable === state.table) return state.structure;
    return loadStructure();
  }

  async function loadStructure() {
    if (!state.db || !state.table) return;
    try {
      const data = await api('columns?db=' + encodeURIComponent(state.db) + '&table=' + encodeURIComponent(state.table));
      state.structure = data;
      state.structureTable = state.table;
      const columns = data.columns.map((column) => [
        column.name,
        column.type,
        column.nullable === 'YES' ? '可空' : '非空',
        column.colKey || '',
        column.colDefault === null ? 'NULL' : column.colDefault,
        column.extra || '',
        column.comment || ''
      ]);
      renderTable(
        $('col-table'),
        ['字段', '类型', '空值', '键', '默认值', '附加', '注释'],
        columns,
        { emptyText: '读取不到字段信息' }
      );
      const indexes = data.indexes.map((index) => [
        index.name,
        index.unique ? '唯一' : '普通',
        index.type,
        index.columns.join(', ')
      ]);
      renderTable($('idx-table'), ['索引', '类型', '算法', '列'], indexes, { emptyText: '没有索引' });
      $('ddl').innerHTML = highlightSql(data.ddl || '');
    } catch (err) {
      toast('读取表结构失败：' + err.message, true);
    }
  }

  /* ---------------- SQL ---------------- */

  function setSqlStatus(text, isError) {
    const box = $('sql-status');
    box.textContent = text || '';
    box.classList.toggle('is-error', Boolean(isError));
  }

  /* ---------------- SQL 语法高亮 ---------------- */

  const SQL_KEYWORDS = new Set(
    ('select from where group by order having limit offset insert into values update set delete create table drop alter ' +
      'add column index primary key foreign references join left right inner outer on as and or not null is in like ' +
      'between union all distinct case when then else end desc asc exists default auto_increment engine charset collate ' +
      'unique use show databases tables describe explain truncate rename replace ignore view if while begin commit ' +
      'rollback transaction start with recursive over partition').split(/\s+/)
  );

  const SQL_TOKEN = /(\/\*[\s\S]*?\*\/|--[^\n]*|#[^\n]*)|('(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*")|(`(?:[^`]|``)*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b)|([=<>!+\-*/%|&,;.()]+)/g;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function highlightSql(text) {
    const source = String(text || '');
    let out = '';
    let last = 0;
    let match;
    SQL_TOKEN.lastIndex = 0;
    while ((match = SQL_TOKEN.exec(source))) {
      if (match.index > last) out += escapeHtml(source.slice(last, match.index));
      const raw = match[0];
      if (match[1]) {
        out += '<span class="tok-comment">' + escapeHtml(raw) + '</span>';
      } else if (match[2]) {
        out += '<span class="tok-string">' + escapeHtml(raw) + '</span>';
      } else if (match[3]) {
        out += '<span class="tok-ident">' + escapeHtml(raw) + '</span>';
      } else if (match[4]) {
        out += '<span class="tok-number">' + escapeHtml(raw) + '</span>';
      } else if (match[5]) {
        const lower = raw.toLowerCase();
        const after = source.slice(match.index + raw.length);
        if (SQL_KEYWORDS.has(lower)) {
          out += '<span class="tok-keyword">' + escapeHtml(raw) + '</span>';
        } else if (/^\s*\(/.test(after)) {
          out += '<span class="tok-function">' + escapeHtml(raw) + '</span>';
        } else {
          out += escapeHtml(raw);
        }
      } else {
        out += '<span class="tok-op">' + escapeHtml(raw) + '</span>';
      }
      last = match.index + raw.length;
    }
    out += escapeHtml(source.slice(last));
    return out + '\n';
  }

  function renderSqlHighlight() {
    const input = $('sql-input');
    const layer = $('sql-highlight');
    if (!input || !layer) return;
    layer.innerHTML = highlightSql(input.value);
    const scrollbar = input.offsetWidth - input.clientWidth;
    layer.style.right = scrollbar + 'px';
    layer.style.transform = 'translate(' + (-input.scrollLeft) + 'px,' + (-input.scrollTop) + 'px)';
  }

  function renderSqlResults(results) {
    const wrap = $('sql-results');
    wrap.textContent = '';
    results.forEach((result) => {
      const card = el('div', 'result-card');
      const head = el('div', 'result-head');
      const statement = el('code');
      statement.innerHTML = highlightSql(result.statement || '');
      head.appendChild(statement);
      if (result.kind === 'rows') {
        head.appendChild(el('span', 'badge', fmtNumber(result.rows.length) + ' 行' +
          (result.truncated ? '（已截断）' : '') + ' · ' + result.tookMs + ' ms'));
      } else {
        head.appendChild(el('span', 'badge', '影响 ' + fmtNumber(result.affectedRows) + ' 行 · ' + result.tookMs + ' ms'));
      }
      card.appendChild(head);

      if (result.kind === 'rows') {
        const gridWrap = el('div', 'grid-wrap');
        const table = el('table', 'grid');
        renderTable(table, result.columns, result.rows, { emptyText: '查询结果为空' });
        gridWrap.appendChild(table);
        card.appendChild(gridWrap);
      } else {
        const info = el('div', 'sql-write-info');
        const bits = ['影响行数：' + fmtNumber(result.affectedRows)];
        if (result.insertId) bits.push('自增 ID：' + result.insertId);
        if (result.changedRows) bits.push('实际修改：' + fmtNumber(result.changedRows));
        if (result.warningStatus) bits.push('警告：' + result.warningStatus);
        info.textContent = bits.join(' · ');
        card.appendChild(info);
      }
      wrap.appendChild(card);
    });
  }

  async function runSql() {
    const sql = $('sql-input').value.trim();
    if (!sql) {
      setSqlStatus('先写一条 SQL 再执行', true);
      return;
    }
    const button = $('btn-sql-run');
    button.disabled = true;
    setSqlStatus('执行中…', false);
    const started = Date.now();
    try {
      const data = await api('query', { method: 'POST', body: { db: state.db, sql: sql } });
      renderSqlResults(data.results);
      setSqlStatus('一共执行 ' + data.statements + ' 条语句，用时 ' + (Date.now() - started) + ' ms', false);
      // DDL/DML 之后刷新元数据，避免列表陈旧
      await loadTables();
      if (state.table) await Promise.all([loadRows(), loadStructure()]);
    } catch (err) {
      const card = el('div', 'result-card is-error');
      const head = el('div', 'result-head');
      head.appendChild(el('code', null, '执行失败'));
      head.appendChild(el('span', 'badge', err.code || 'ERROR'));
      card.appendChild(head);
      const body = el('div', 'result-error', err.message);
      card.appendChild(body);
      $('sql-results').textContent = '';
      $('sql-results').appendChild(card);
      setSqlStatus(err.message, true);
    } finally {
      button.disabled = false;
    }
  }

  /* ---------------- 行编辑 · 新增 · 删除 · 撤销 ---------------- */

  function primaryKey() {
    if (!state.structure || !Array.isArray(state.structure.columns)) return [];
    return state.structure.columns.filter((column) => column.colKey === 'PRI').map((column) => column.name);
  }

  const deleteConfirm = { key: '', timer: 0 };

  function rowObject(index) {
    const data = state.rows;
    if (!data || !data.rows || !data.rows[index]) return null;
    const row = data.rows[index];
    const obj = {};
    data.columns.forEach((column, i) => {
      obj[column] = row[i];
    });
    return obj;
  }

  function updateEditBar() {
    const count = Object.values(state.pending).filter((entry) => Object.keys(entry.changes).length).length;
    const hasKey = primaryKey().length > 0;
    $('btn-save-edits').disabled = count === 0;
    $('btn-undo').disabled = state.undoStack.length === 0;
    $('btn-undo').title = state.undoStack.length ? '撤销：' + state.undoStack[state.undoStack.length - 1].label : '没有可撤销的操作';
    const hint = $('edit-hint');
    if (!state.table) {
      hint.textContent = '';
    } else if (!hasKey) {
      hint.textContent = '该表没有主键，网格内不能修改或删除行（新增行仍可用）';
    } else if (count) {
      hint.textContent = count + ' 行有未保存的修改';
    } else {
      hint.textContent = '双击单元格可修改';
    }
  }

  function queueCellEdit(index, column, value) {
    const row = rowObject(index);
    if (!row) return;
    const key = {};
    primaryKey().forEach((name) => {
      key[name] = row[name];
    });
    const id = JSON.stringify(key);
    const entry = state.pending[id] || (state.pending[id] = { key, changes: {}, originals: {} });
    if (!(column in entry.originals)) entry.originals[column] = row[column];
    const before = entry.originals[column];
    const same = value === before || (value === null && before === null) || (value !== null && before !== null && String(value) === String(before));
    if (same) {
      delete entry.changes[column];
      delete entry.originals[column];
      if (!Object.keys(entry.changes).length) delete state.pending[id];
    } else {
      entry.changes[column] = value;
    }
    updateEditBar();
  }

  function pushUndo(op) {
    state.undoStack.push(op);
    if (state.undoStack.length > 40) state.undoStack.shift();
  }

  async function runRowOp(op) {
    const body = { action: op.action, db: op.db, name: op.table };
    if (op.key) body.key = op.key;
    if (op.changes) body.changes = op.changes;
    if (op.values) body.values = op.values;
    return api('row', { method: 'POST', body });
  }

  async function saveEdits() {
    const entries = Object.values(state.pending).filter((entry) => Object.keys(entry.changes).length);
    if (!entries.length) return;
    const label = $('btn-save-edits');
    label.disabled = true;
    label.textContent = '保存中…';
    try {
      for (const entry of entries) {
        const data = await api('row', {
          method: 'POST',
          body: { action: 'update', db: state.db, name: state.table, key: entry.key, changes: entry.changes }
        });
        if (!data.affectedRows) throw new Error('没有匹配到对应的行，可能已被别人修改');
        pushUndo({
          db: state.db,
          table: state.table,
          label: '修改 ' + Object.keys(entry.changes).join('、'),
          inverse: { action: 'update', key: entry.key, changes: entry.originals }
        });
      }
      toast('已保存 ' + entries.length + ' 行修改');
      await loadRows();
    } catch (err) {
      toast('保存失败：' + err.message, true);
      updateEditBar();
    } finally {
      label.textContent = '保存修改';
      updateEditBar();
    }
  }

  async function undoLast() {
    const last = state.undoStack[state.undoStack.length - 1];
    if (!last) return;
    try {
      await runRowOp(Object.assign({}, last.inverse, { db: last.db, table: last.table }));
      state.undoStack.pop();
      toast('已撤销：' + last.label);
      if (last.db === state.db && last.table === state.table) await loadRows();
      else updateEditBar();
    } catch (err) {
      toast('撤销失败：' + err.message, true);
    }
  }

  function confirmDelete(button, key, row) {
    const id = JSON.stringify(key);
    if (deleteConfirm.key !== id) {
      deleteConfirm.key = id;
      button.textContent = '确认删除';
      button.classList.add('danger');
      clearTimeout(deleteConfirm.timer);
      deleteConfirm.timer = setTimeout(() => {
        button.textContent = '删除';
        button.classList.remove('danger');
        deleteConfirm.key = '';
      }, 2600);
      return;
    }
    clearTimeout(deleteConfirm.timer);
    deleteConfirm.key = '';
    button.disabled = true;
    button.textContent = '删除中…';
    api('row', { method: 'POST', body: { action: 'delete', db: state.db, name: state.table, key } })
      .then(async (data) => {
        if (!data.affectedRows) throw new Error('没有匹配到对应的行');
        pushUndo({
          db: state.db,
          table: state.table,
          label: '删除 1 行',
          inverse: { action: 'insert', values: row }
        });
        toast('已删除 1 行');
        await loadRows();
      })
      .catch((err) => {
        toast('删除失败：' + err.message, true);
        button.disabled = false;
        button.textContent = '删除';
        button.classList.remove('danger');
      });
  }

  function deleteRow(index, button) {
    const row = rowObject(index);
    if (!row) return;
    const key = {};
    primaryKey().forEach((name) => {
      key[name] = row[name];
    });
    confirmDelete(button, key, row);
  }

  function openRowModal() {
    if (!state.table) {
      toast('先选择一张表', true);
      return;
    }
    if (!state.structure || state.structureTable !== state.table) {
      toast('字段信息还没加载好，稍等再试', true);
      return;
    }
    const fields = $('row-fields');
    fields.textContent = '';
    const editable = state.structure.columns.filter((column) => !/auto_increment/i.test(column.extra || ''));
    editable.forEach((column) => {
      const wrap = el('div', 'field');
      const label = el('label', 'field-label', column.name + ' · ' + column.type + (column.nullable === 'NO' ? ' *' : ''));
      const input = document.createElement('input');
      input.className = 'input mono';
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.column = column.name;
      input.placeholder = column.nullable === 'YES'
        ? '留空表示 NULL'
        : column.colDefault !== null && column.colDefault !== undefined
          ? '默认 ' + column.colDefault
          : '必填';
      wrap.appendChild(label);
      wrap.appendChild(input);
      fields.appendChild(wrap);
    });
    $('row-modal').classList.remove('hidden');
    setTimeout(() => {
      const first = fields.querySelector('input');
      if (first) first.focus();
    }, 30);
  }

  function closeRowModal() {
    $('row-modal').classList.add('hidden');
    $('row-fields').textContent = '';
  }

  async function submitRowModal() {
    const inputs = Array.from($('row-fields').querySelectorAll('input'));
    const values = {};
    for (const input of inputs) {
      const raw = input.value;
      if (raw === '') continue;
      values[input.dataset.column] = raw;
    }
    if (!Object.keys(values).length) {
      toast('至少填一个字段', true);
      return;
    }
    const button = $('btn-row-modal-ok');
    button.disabled = true;
    try {
      const data = await api('row', { method: 'POST', body: { action: 'insert', db: state.db, name: state.table, values } });
      const keys = primaryKey();
      if (keys.length) {
        const key = {};
        let canUndo = true;
        keys.forEach((column) => {
          if (column in values) key[column] = values[column];
          else if (keys.length === 1 && data.insertId) key[column] = data.insertId;
          else canUndo = false;
        });
        if (canUndo) {
          pushUndo({ db: state.db, table: state.table, label: '插入 1 行', inverse: { action: 'delete', key } });
        }
      }
      closeRowModal();
      toast('已插入 1 行');
      await Promise.all([loadRows(), loadTables()]);
    } catch (err) {
      toast('插入失败：' + err.message, true);
    } finally {
      button.disabled = false;
    }
  }

  /* ---------------- 导出 ---------------- */

  const exportState = { format: 'csv', table: '' };

  function openExportModal(table) {
    exportState.table = table || state.table;
    if (!exportState.table) {
      toast('先选一张表', true);
      return;
    }
    $('export-subject').textContent = '把 ' + state.db + '.' + exportState.table + ' 的数据导出成文件';
    $('export-scope').value = 'all';
    document.querySelectorAll('#export-formats .fmt-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.fmt === exportState.format);
    });
    $('export-hint').textContent = '会带上当前的 WHERE 条件和排序；导出会直接下载到浏览器。';
    $('export-modal').classList.remove('hidden');
  }

  function closeExportModal() {
    $('export-modal').classList.add('hidden');
  }

  async function submitExport() {
    const table = exportState.table;
    if (!table) return;
    const scope = $('export-scope').value === 'page' ? 'page' : 'all';
    const button = $('btn-export-ok');
    button.disabled = true;
    button.textContent = '导出中…';
    try {
      const params = new URLSearchParams({
        db: state.db,
        table,
        format: exportState.format,
        scope,
        limit: String(state.pageSize),
        offset: String(state.page * state.pageSize)
      });
      if (state.where) params.set('where', state.where);
      if (state.order) {
        params.set('order', state.order);
        params.set('dir', state.dir);
      }
      const res = await fetch('/api/export?' + params.toString(), {
        headers: { 'x-webdb-token': TOKEN }
      });
      if (!res.ok) {
        let message = '导出失败（HTTP ' + res.status + '）';
        try {
          const payload = await res.json();
          if (payload && payload.error && payload.error.message) message = payload.error.message;
        } catch (err) {
          /* 非 JSON 响应，保留状态码提示 */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const rows = res.headers.get('x-webdb-export-rows') || '';
      const truncated = res.headers.get('x-webdb-export-truncated') === '1';
      const disposition = res.headers.get('content-disposition') || '';
      let filename = table + '.' + exportState.format;
      const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      if (match) {
        try {
          filename = decodeURIComponent(match[1]);
        } catch (err) {
          /* 保留默认文件名 */
        }
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      closeExportModal();
      toast(truncated ? `已导出 ${rows} 行（达到 5 万行上限，已截断）` : `已导出 ${rows} 行`);
    } catch (err) {
      toast(err.message, true);
    } finally {
      button.disabled = false;
      button.textContent = '导出';
    }
  }

  /* ---------------- 脚本导入 ---------------- */

  const IMPORT_CHUNK = 256 * 1024; // 每次请求携带的字符数
  const IMPORT_READ = 512 * 1024; // 每次从文件读取的字节数
  const IMPORT_BIG = 2 * 1024 * 1024; // 超过 2MB 需要输入库名确认

  const importState = {
    file: null,
    sessionId: '',
    cancelled: false,
    running: false,
    executed: 0
  };

  function openImportPicker() {
    if (!state.db) {
      toast('先选择一个数据库', true);
      return;
    }
    $('import-file-input').value = '';
    $('import-file-input').click();
  }

  function openImportModal(file) {
    if (!state.db) {
      toast('先选择一个数据库', true);
      return;
    }
    importState.file = file || null;
    const big = Boolean(file) && file.size >= IMPORT_BIG;
    $('import-subject').textContent = '把脚本导入到 ' + state.db;
    $('import-file-meta').textContent = file ? file.name + ' · ' + fmtBytes(file.size) : '尚未选择文件';
    $('import-continue').checked = false;
    $('import-charset').value = 'utf-8';
    $('import-confirm').value = '';
    $('import-confirm-wrap').classList.toggle('hidden', !big);
    $('import-confirm').placeholder = big ? '输入 ' + state.db + ' 确认' : '';
    $('import-hint').textContent = big
      ? '文件较大（≥ 2 MB），导入前请输入目标库名确认。脚本按原顺序执行，不可回滚。'
      : '脚本里的 DELIMITER、USE、SET 会按原顺序执行；导入不可回滚，请确认目标库。';
    $('import-modal').classList.remove('hidden');
  }

  function closeImportModal() {
    $('import-modal').classList.add('hidden');
  }

  function setImportBar(visible) {
    $('import-bar').classList.toggle('hidden', !visible);
  }

  function updateImportProgress(percent, text) {
    $('import-progress-fill').style.width = Math.max(0, Math.min(100, percent)) + '%';
    $('import-progress-text').textContent = text;
  }

  function renderImportReport(snapshot) {
    const box = $('import-report');
    box.textContent = '';
    box.classList.remove('hidden');
    const head = el('div', 'imp-head');
    head.textContent = snapshot.cancelled ? '导入已取消' : snapshot.stopped ? '导入已停止' : '导入完成';
    head.classList.toggle('imp-bad', Boolean(snapshot.stopped));
    box.appendChild(head);
    const seconds = (snapshot.elapsedMs / 1000).toFixed(1);
    const summary = el('div', 'imp-line');
    summary.textContent =
      '成功 ' + snapshot.ok + ' 条 · 失败 ' + snapshot.failed + ' 条 · 共执行 ' + snapshot.executed + ' 条 · 用时 ' + seconds + 's';
    box.appendChild(summary);
    if (snapshot.failedList && snapshot.failedList.length) {
      const list = el('div', 'imp-fails');
      snapshot.failedList.forEach((item) => {
        const row = el('div', 'imp-fail');
        const title = el('div', 'imp-fail-title');
        title.textContent = '第 ' + item.index + ' 条 · ' + item.message;
        row.appendChild(title);
        const code = el('code', 'imp-fail-sql');
        code.textContent = item.sql;
        row.appendChild(code);
        list.appendChild(row);
      });
      box.appendChild(list);
      if (snapshot.failed > snapshot.failedList.length) {
        box.appendChild(el('div', 'imp-line imp-dim', '还有 ' + (snapshot.failed - snapshot.failedList.length) + ' 条失败未列出。'));
      }
    }
    box.appendChild(
      el(
        'div',
        'imp-line imp-dim',
        snapshot.ok > 0 ? '已执行过的语句不会回滚，必要时请用备份恢复。' : '没有语句被执行。'
      )
    );
  }

  async function postImport(path, payload) {
    const res = await fetch('/api/import/' + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webdb-token': TOKEN },
      body: JSON.stringify(payload)
    });
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      throw new Error('服务返回了无法解析的内容（HTTP ' + res.status + '）');
    }
    if (!data || data.ok !== true) {
      const message = data && data.error && data.error.message ? data.error.message : 'HTTP ' + res.status;
      throw new Error(message);
    }
    return data.data;
  }

  async function runImport() {
    const file = importState.file;
    if (!file) {
      toast('先选择 .sql 文件', true);
      return;
    }
    if (!state.db) {
      toast('先选择一个数据库', true);
      return;
    }
    const needConfirm = !$('import-confirm-wrap').classList.contains('hidden');
    if (needConfirm && $('import-confirm').value.trim() !== state.db) {
      $('import-hint').textContent = '请输入目标库名「' + state.db + '」确认后再导入。';
      $('import-hint').classList.add('imp-warn');
      return;
    }

    const button = $('btn-import-start');
    button.disabled = true;
    button.textContent = '导入中…';
    importState.cancelled = false;
    importState.executed = 0;
    $('import-report').classList.add('hidden');
    $('import-report').textContent = '';
    $('sql-results').textContent = '';
    setSqlStatus('', false);

    try {
      const snapshotStart = await postImport('start', {
        db: state.db,
        continueOnError: $('import-continue').checked
      });
      importState.sessionId = snapshotStart.id;
      closeImportModal();
      setImportBar(true);
      $('import-file').textContent = file.name;
      updateImportProgress(0, '准备中…');
      importState.running = true;

      const decoder = new TextDecoder($('import-charset').value || 'utf-8');
      const started = Date.now();
      let offset = 0;
      let pending = '';
      let last = null;

      const flush = async (text, isLast) => {
        const snapshot = await postImport('chunk', {
          id: importState.sessionId,
          text,
          last: isLast
        });
        last = snapshot;
        importState.executed = snapshot.executed;
        const percent = Math.min(99, Math.round((offset / file.size) * 100));
        updateImportProgress(
          percent,
          '第 ' + snapshot.executed + ' 条 · ' + Math.round((offset / file.size) * 100) + '% · ' +
            ((Date.now() - started) / 1000).toFixed(1) + 's'
        );
        return snapshot;
      };

      while (offset < file.size) {
        if (importState.cancelled) break;
        const buffer = await file.slice(offset, offset + IMPORT_READ).arrayBuffer();
        offset += buffer.byteLength;
        pending += decoder.decode(buffer, { stream: true });
        while (pending.length >= IMPORT_CHUNK && !importState.cancelled) {
          const piece = pending.slice(0, IMPORT_CHUNK);
          pending = pending.slice(IMPORT_CHUNK);
          const snapshot = await flush(piece, false);
          if (snapshot.finished) {
            last = snapshot;
            break;
          }
        }
        if (last && last.finished) break;
      }

      if (!importState.cancelled && !(last && last.finished)) {
        pending += decoder.decode();
        last = await flush(pending, true);
      }

      if (last) {
        if (importState.cancelled) last.cancelled = true;
        updateImportProgress(100, '第 ' + last.executed + ' 条 · 100%');
        renderImportReport(last);
        if (last.cancelled) {
          toast('已取消导入，已执行 ' + last.executed + ' 条');
        } else if (last.failed > 0) {
          toast(last.stopped ? '导入在第 ' + last.failedList[0].index + ' 条失败' : '导入完成，有 ' + last.failed + ' 条失败', true);
        } else {
          toast('导入完成，共 ' + last.ok + ' 条');
        }
      }
    } catch (err) {
      toast(err.message, true);
      renderImportReport({
        cancelled: false,
        stopped: true,
        ok: 0,
        failed: 1,
        executed: importState.executed,
        elapsedMs: 0,
        failedList: [{ index: importState.executed, message: err.message, sql: '' }]
      });
    } finally {
      importState.running = false;
      setImportBar(false);
      button.disabled = false;
      button.textContent = '开始导入';
      try {
        await loadMeta();
        await loadDatabases();
        if (state.table) await loadRows();
      } catch (err) {
        /* 刷新失败不影响导入结果 */
      }
    }
  }

  async function cancelImport() {
    importState.cancelled = true;
    if (importState.sessionId) {
      try {
        await postImport('cancel', { id: importState.sessionId });
      } catch (err) {
        /* 会话可能已经结束 */
      }
    }
    setImportBar(false);
    updateImportProgress(0, '已取消');
  }

  /* ---------------- 交互绑定 ---------------- */

  function bindEvents() {
    $('btn-refresh').addEventListener('click', async () => {
      try {
        await loadMeta();
        await loadDatabases();
        toast('已刷新');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('btn-db-refresh').addEventListener('click', async () => {
      try {
        await loadDatabases();
        toast('数据库列表已刷新');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('db-trigger').addEventListener('click', (event) => {
      event.stopPropagation();
      if ($('db-pop').classList.contains('hidden')) openDbPop();
      else closeDbPop();
    });

    $('btn-db-new').addEventListener('click', (event) => {
      event.stopPropagation();
      closeDbPop();
      openDbModal('create');
    });

    $('db-ctx').addEventListener('click', (event) => {
      const item = event.target.closest('[data-act]');
      if (!item || item.disabled) return;
      const act = item.dataset.act;
      const name = menuDb;
      closeDbMenu();
      if (act === 'open') {
        if (name && name !== state.db) selectDb(name).catch((err) => toast(err.message, true));
      } else if (act === 'copy') {
        copyText(name, '库名');
      } else if (act === 'reload') {
        loadDatabases().then(() => toast('数据库列表已刷新')).catch((err) => toast(err.message, true));
      } else if (act === 'create') {
        openDbModal('create');
      } else if (act === 'drop') {
        openDbModal('drop', name);
      }
    });

    $('btn-db-modal-cancel').addEventListener('click', closeDbModal);
    $('btn-db-modal-ok').addEventListener('click', submitDbModal);
    $('db-modal').addEventListener('click', (event) => {
      if (event.target === $('db-modal')) closeDbModal();
    });
    $('db-modal-name').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitDbModal();
      }
    });

    $('tbl-ctx').addEventListener('click', (event) => {
      const item = event.target.closest('[data-act]');
      if (!item || item.disabled) return;
      const act = item.dataset.act;
      const name = menuTable;
      closeTblMenu();
      if (!name) return;
      if (act === 'open') {
        if (name !== state.table) selectTable(name).catch((err) => toast(err.message, true));
        setTab('data');
      } else if (act === 'structure') {
        if (name !== state.table) {
          selectTable(name).then(() => setTab('structure')).catch((err) => toast(err.message, true));
        } else {
          setTab('structure');
        }
      } else if (act === 'copy') {
        copyText(name, '表名');
      } else if (act === 'copy-ddl') {
        copyTableDdl(name);
      } else if (act === 'export') {
        if (name !== state.table) {
          selectTable(name).then(() => openExportModal(name)).catch((err) => toast(err.message, true));
        } else {
          openExportModal(name);
        }
      } else if (act === 'reload') {
        loadTables().then(() => toast('数据表已刷新')).catch((err) => toast(err.message, true));
      } else if (act === 'rename') {
        openTblModal('rename', name);
      } else if (act === 'truncate') {
        openTblModal('truncate', name);
      } else if (act === 'drop') {
        openTblModal('drop', name);
      }
    });

    $('btn-tbl-modal-cancel').addEventListener('click', closeTblModal);
    $('btn-export').addEventListener('click', () => openExportModal(state.table));
    document.querySelectorAll('#export-formats .fmt-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        exportState.format = chip.dataset.fmt;
        document.querySelectorAll('#export-formats .fmt-chip').forEach((item) => {
          item.classList.toggle('is-active', item === chip);
        });
      });
    });
    $('export-scope').addEventListener('change', () => {
      const page = $('export-scope').value === 'page';
      $('export-hint').textContent = page
        ? '只导出当前这一页（' + state.pageSize + ' 行），文件名会带上时间戳。'
        : '会带上当前的 WHERE 条件和排序；单次最多 5 万行，超出会截断。';
    });
    $('btn-export-cancel').addEventListener('click', closeExportModal);
    $('btn-export-ok').addEventListener('click', submitExport);
    $('export-modal').addEventListener('click', (event) => {
      if (event.target === $('export-modal')) closeExportModal();
    });

    $('btn-import-sql').addEventListener('click', openImportPicker);
    $('import-file-input').addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) openImportModal(file);
    });
    $('btn-import-modal-cancel').addEventListener('click', closeImportModal);
    $('btn-import-start').addEventListener('click', runImport);
    $('btn-import-cancel').addEventListener('click', cancelImport);
    $('import-modal').addEventListener('click', (event) => {
      if (event.target === $('import-modal')) closeImportModal();
    });
    $('import-confirm').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runImport();
      }
    });
    $('btn-tbl-modal-ok').addEventListener('click', submitTblModal);
    $('tbl-modal').addEventListener('click', (event) => {
      if (event.target === $('tbl-modal')) closeTblModal();
    });
    $('tbl-modal-name').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitTblModal();
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.db-picker')) closeDbPop();
      if (!event.target.closest('#db-ctx')) closeDbMenu();
      if (!event.target.closest('#tbl-ctx')) closeTblMenu();
    });
    window.addEventListener('resize', () => {
      closeDbMenu();
      closeTblMenu();
    });
    window.addEventListener('blur', () => {
      closeDbMenu();
      closeTblMenu();
    });

    $('table-search').addEventListener('input', (event) => {
      state.tableFilter = event.target.value;
      renderTableList();
    });

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => setTab(tab.dataset.tab));
    });

    $('btn-apply').addEventListener('click', () => {
      state.where = $('where-input').value.trim();
      state.page = 0;
      loadRows();
    });

    $('btn-reset').addEventListener('click', () => {
      $('where-input').value = '';
      state.where = '';
      state.order = '';
      state.dir = 'asc';
      state.page = 0;
      loadRows();
    });

    $('where-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        $('btn-apply').click();
      }
    });

    $('page-size').addEventListener('change', (event) => {
      state.pageSize = Number(event.target.value) || 50;
      state.page = 0;
      loadRows();
    });

    $('btn-data-refresh').addEventListener('click', () => loadRows());

    $('btn-add-row').addEventListener('click', openRowModal);
    $('btn-save-edits').addEventListener('click', saveEdits);
    $('btn-undo').addEventListener('click', undoLast);
    $('btn-row-modal-cancel').addEventListener('click', closeRowModal);
    $('btn-row-modal-ok').addEventListener('click', submitRowModal);
    $('row-modal').addEventListener('click', (event) => {
      if (event.target === $('row-modal')) closeRowModal();
    });
    $('row-fields').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
        event.preventDefault();
        submitRowModal();
      }
    });

    $('btn-prev').addEventListener('click', () => {
      if (state.page > 0) {
        state.page -= 1;
        loadRows();
      }
    });

    $('btn-next').addEventListener('click', () => {
      if (state.rows && state.rows.offset + state.rows.rows.length < state.rows.total) {
        state.page += 1;
        loadRows();
      }
    });

    $('grid').addEventListener('click', (event) => {
      const button = event.target.closest('.th-sort');
      if (!button) return;
      const column = button.dataset.column;
      if (state.order === column) {
        state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.order = column;
        state.dir = 'asc';
      }
      state.page = 0;
      loadRows();
    });

    $('btn-copy-ddl').addEventListener('click', () => {
      const ddl = $('ddl').textContent;
      if (ddl) copyText(ddl, '建表语句');
    });

    $('btn-sql-run').addEventListener('click', runSql);
    $('btn-sql-clear').addEventListener('click', () => {
      $('sql-input').value = '';
      $('sql-results').textContent = '';
      setSqlStatus('', false);
      renderSqlHighlight();
      $('sql-input').focus();
    });

    $('sql-input').addEventListener('input', renderSqlHighlight);
    $('sql-input').addEventListener('scroll', renderSqlHighlight);
    if (window.ResizeObserver) {
      new ResizeObserver(renderSqlHighlight).observe($('sql-input'));
    } else {
      window.addEventListener('resize', renderSqlHighlight);
    }
    renderSqlHighlight();

    $('sql-input').addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        runSql();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeDbMenu();
        closeTblMenu();
        closeDbPop();
        if (!$('db-modal').classList.contains('hidden')) closeDbModal();
        if (!$('tbl-modal').classList.contains('hidden')) closeTblModal();
        if (!$('row-modal').classList.contains('hidden')) closeRowModal();
        if (!$('export-modal').classList.contains('hidden')) closeExportModal();
        if (!$('import-modal').classList.contains('hidden')) closeImportModal();
        return;
      }
      if (event.key === 'F5') {
        event.preventDefault();
        if (state.tab === 'sql') return;
        loadRows();
      }
    });
  }

  /* ---------------- 启动 ---------------- */

  async function init() {
    bindEvents();
    if (PAGE_SIZES.indexOf(state.pageSize) === -1) state.pageSize = 50;
    $('page-size').value = String(state.pageSize);
    try {
      await loadMeta();
      await loadDatabases();
    } catch (err) {
      $('conn-badge').textContent = '连接失败';
      toast('连接 MySQL 失败：' + err.message, true);
      renderTable($('grid'), [], [], { emptyText: '连接失败：' + err.message });
    }
  }

  init();
})();
