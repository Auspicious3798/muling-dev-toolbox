'use strict';

(function () {
  const TOKEN = new URLSearchParams(location.search).get('t') || '';
  const PAGE_SIZE = 200;
  const IMPORT_CHUNK = 128 * 1024;
  const IMPORT_READ = 256 * 1024;
  const HISTORY_KEY = 'wbredis.cli.history';
  const FAV_KEY = 'wbredis.cli.favs';
  const DANGER = /^\s*(flushdb|flushall|shutdown|config\s+set|debug\s+|swapdb|replicaof|slaveof|del\s+\*|keys\s+\*)/i;

  const state = {
    meta: null,
    db: 0,
    pattern: '*',
    cursor: '0',
    keys: [],
    loaded: 0,
    typeFilter: '',
    key: null,
    tab: 'detail',
    confirmDelete: false,
    cliHistory: [],
    cliIndex: -1,
    cliFavs: [],
    pageCursor: '0',
    pageOffset: 0,
    ctxKey: null,
    exportScope: 'key',
    exportTarget: '',
    exportFormat: 'cmd',
    import: { id: '', name: '', size: 0, running: false, cancelled: false },
    dangerArmed: ''
  };

  const $ = (id) => document.getElementById(id);

  /* ---------------- 基础 ---------------- */

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
      throw new Error(payload && payload.error ? payload.error.message : 'HTTP ' + res.status);
    }
    return payload.data;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function fmtNumber(n) {
    return Number(n || 0).toLocaleString('zh-CN');
  }

  /* ---------------- JSON / 文本高亮 ---------------- */

  const JSON_TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}\[\],:])/g;

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }

  function looksJson(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return false;
    return /"[^"\n]*"\s*:/.test(trimmed) || trimmed[0] === '[';
  }

  function highlightText(text) {
    const source = String(text || '');
    if (!looksJson(source)) return escapeHtml(source) + '\n';
    let out = '';
    let last = 0;
    let match;
    JSON_TOKEN.lastIndex = 0;
    while ((match = JSON_TOKEN.exec(source))) {
      if (match.index > last) out += escapeHtml(source.slice(last, match.index));
      if (match[1]) {
        const isKey = Boolean(match[2]);
        out += '<span class="' + (isKey ? 'tok-key' : 'tok-string') + '">' + escapeHtml(match[1]) + '</span>';
        if (match[2]) out += '<span class="tok-punct">:</span>';
      } else if (match[3]) {
        out += '<span class="tok-number">' + escapeHtml(match[3]) + '</span>';
      } else if (match[4]) {
        out += '<span class="tok-literal">' + escapeHtml(match[4]) + '</span>';
      } else {
        out += '<span class="tok-punct">' + escapeHtml(match[0]) + '</span>';
      }
      last = match.index + match[0].length;
    }
    out += escapeHtml(source.slice(last));
    return out + '\n';
  }

  function attachHighlight(input, layer) {
    const sync = () => {
      layer.innerHTML = highlightText(input.value);
      const scrollbar = input.offsetWidth - input.clientWidth;
      layer.style.right = scrollbar + 'px';
      layer.style.transform = 'translate(' + (-input.scrollLeft) + 'px,' + (-input.scrollTop) + 'px)';
    };
    input.addEventListener('input', sync);
    input.addEventListener('scroll', sync);
    if (window.ResizeObserver) new ResizeObserver(sync).observe(input);
    sync();
    return sync;
  }

  let toastTimer = 0;
  function toast(message, isError) {
    const box = $('toast');
    box.textContent = message;
    box.classList.toggle('is-error', Boolean(isError));
    box.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => box.classList.remove('is-visible'), 2600);
  }

  function typeClass(type) {
    return 'type-' + String(type || '').replace(/[^a-z]/g, '');
  }

  function ttlText(ttl) {
    if (ttl === -1) return 'TTL 永久';
    if (ttl === -2) return '已过期';
    if (ttl < 60) return 'TTL ' + ttl + 's';
    if (ttl < 3600) return 'TTL ' + Math.round(ttl / 60) + ' 分钟';
    if (ttl < 86400) return 'TTL ' + Math.round(ttl / 3600) + ' 小时';
    return 'TTL ' + Math.round(ttl / 86400) + ' 天';
  }

  function bytesText(bytes) {
    const n = Number(bytes || 0);
    if (!n) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ---------------- 键列表 ---------------- */

  function renderKeyList() {
    const list = $('key-list');
    list.innerHTML = '';
    const filtered = state.typeFilter
      ? state.keys.filter((item) => item.type === state.typeFilter)
      : state.keys;
    filtered.forEach((item) => {
      const li = el('li', 'key-item' + (state.key && state.key.name === item.name ? ' is-active' : ''));
      li.dataset.key = item.name;
      li.title = '点击查看 · 右键更多操作';
      const typeBadge = el('span', 'type-badge ' + typeClass(item.type), item.type);
      const name = el('span', 'key-name', item.name);
      const ttl = el('span', 'key-ttl', ttlText(item.ttl));
      li.appendChild(typeBadge);
      li.appendChild(name);
      li.appendChild(ttl);
      li.addEventListener('click', () => selectKey(item.name));
      li.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        openKeyMenu(item, event.clientX, event.clientY);
      });
      list.appendChild(li);
    });
    $('btn-more').disabled = state.cursor === '0';
    const total = state.meta ? state.meta.dbsize : 0;
    if (state.pattern === '*' && state.meta) {
      $('key-count').textContent = '已加载 ' + fmtNumber(state.keys.length) + ' / 共 ' + fmtNumber(total) + ' 个键';
    } else {
      $('key-count').textContent = '已加载 ' + fmtNumber(state.keys.length) + ' 个匹配键（按 SCAN 抽样）';
    }
  }

  async function loadKeys(reset) {
    if (reset) {
      state.cursor = '0';
      state.keys = [];
    }
    try {
      const params = new URLSearchParams({ pattern: state.pattern, cursor: state.cursor, count: '200' });
      const data = await api('keys?' + params.toString());
      state.cursor = data.cursor;
      const existing = new Set(state.keys.map((item) => item.name));
      data.keys.forEach((item) => {
        if (!existing.has(item.name)) state.keys.push(item);
      });
      state.keys.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      renderKeyList();
      if (reset && state.keys.length && !state.key) await selectKey(state.keys[0].name);
    } catch (err) {
      toast('读取键列表失败：' + err.message, true);
    }
  }

  function activateTab(name) {
    state.tab = name;
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('is-active', item.dataset.tab === name));
    $('panel-detail').classList.toggle('hidden', name !== 'detail');
    $('panel-cli').classList.toggle('hidden', name !== 'cli');
    if (name === 'cli') {
      $('cli-input').focus();
    }
  }

  async function selectKey(name, options) {
    const opts = options || {};
    const params = new URLSearchParams({ name: name });
    if (opts.cursor !== undefined) params.set('cursor', opts.cursor);
    if (opts.offset !== undefined) params.set('offset', opts.offset);
    params.set('count', String(PAGE_SIZE));
    try {
      const data = await api('key?' + params.toString());
      state.key = data;
      state.pageCursor = data.cursor || '0';
      state.pageOffset = data.offset || 0;
      state.confirmDelete = false;
      renderKeyHeader();
      renderEditor();
      renderKeyList();
      if (state.tab !== 'detail') activateTab('detail');
    } catch (err) {
      toast('读取键失败：' + err.message, true);
    }
  }

  async function loadMoreItems() {
    if (!state.key) return;
    const key = state.key;
    if (key.type === 'hash' || key.type === 'set' || key.type === 'zset') {
      if (!state.pageCursor || state.pageCursor === '0') return;
      try {
        const data = await api('key?' + new URLSearchParams({
          name: key.name, cursor: state.pageCursor, count: String(PAGE_SIZE)
        }).toString());
        state.pageCursor = data.cursor || '0';
        key.value.value = key.value.value.concat((data.value && data.value.value) || []);
        renderEditor();
      } catch (err) {
        toast('加载失败：' + err.message, true);
      }
    }
  }

  /* ---------------- 键头 ---------------- */

  function renderKeyHeader() {
    const key = state.key;
    const has = Boolean(key);
    $('btn-rename').disabled = !has;
    $('btn-refresh-key').disabled = !has;
    $('btn-delete').disabled = !has;
    $('btn-export-key').disabled = !has;
    $('btn-ttl-apply').disabled = !has;
    $('btn-ttl-persist').disabled = !has;
    if (!has) {
      $('key-name').textContent = '未选择键';
      $('key-type-badge').textContent = '';
      $('key-type-badge').className = 'badge';
      $('key-length').textContent = '';
      $('key-ttl').textContent = '';
      $('key-memory').textContent = '';
      $('key-encoding').textContent = '';
      $('ttl-hint').textContent = '';
      return;
    }
    $('key-name').textContent = key.name;
    $('key-type-badge').textContent = key.type;
    $('key-type-badge').className = 'badge ' + typeClass(key.type);
    $('key-length').textContent = key.length === undefined ? '' : fmtNumber(key.length) + ' 个元素';
    $('key-ttl').textContent = ttlText(key.ttl);
    $('key-memory').textContent = key.memory ? bytesText(key.memory) : '';
    $('key-encoding').textContent = key.encoding || '';
    $('ttl-hint').textContent = '当前：' + ttlText(key.ttl);
    $('ttl-input').value = key.ttl > 0 ? String(key.ttl) : '';
    $('btn-delete').textContent = state.confirmDelete ? '确认删除' : '删除';
    $('btn-delete').classList.toggle('is-armed', state.confirmDelete);
  }

  /* ---------------- 编辑器骨架 ---------------- */

  function editorWrap() {
    const box = el('div', 'editor-box');
    box.id = 'editor-box';
    return box;
  }

  function emptyEditor(text) {
    const box = editorWrap();
    box.appendChild(el('div', 'editor-empty', text));
    return box;
  }

  function makeToolbar(hintText, action) {
    const bar = el('div', 'editor-toolbar');
    bar.appendChild(el('span', 'hint', hintText));
    if (action) bar.appendChild(action);
    return bar;
  }

  function pagerFor(key, count, offset) {
    const bar = el('div', 'editor-pager');
    if (key.type === 'list') {
      const total = Number(key.length) || 0;
      bar.appendChild(el('span', 'hint', '第 ' + (total ? offset + 1 : 0) + '–' + Math.min(offset + count, total) + ' 条 / 共 ' + fmtNumber(total) + ' 条'));
      const prev = el('button', 'btn ghost small', '上一页');
      prev.type = 'button';
      prev.disabled = offset <= 0;
      prev.addEventListener('click', () => selectKey(key.name, { offset: Math.max(0, offset - PAGE_SIZE) }));
      const next = el('button', 'btn ghost small', '下一页');
      next.type = 'button';
      next.disabled = offset + count >= total;
      next.addEventListener('click', () => selectKey(key.name, { offset: offset + PAGE_SIZE }));
      bar.appendChild(prev);
      bar.appendChild(next);
    } else {
      const loaded = (key.value && key.value.value ? key.value.value.length : 0);
      bar.appendChild(el('span', 'hint', '已加载 ' + fmtNumber(loaded) + ' / ' + fmtNumber(key.length) + ' 个元素（游标分页）'));
      const more = el('button', 'btn ghost small', '加载更多');
      more.type = 'button';
      more.disabled = state.pageCursor === '0';
      more.addEventListener('click', loadMoreItems);
      bar.appendChild(more);
    }
    return bar;
  }

  async function refreshKey() {
    if (!state.key) return;
    await selectKey(state.key.name);
    await loadKeys(true);
  }

  async function fieldOp(payload, successText) {
    if (!state.key) return null;
    try {
      const data = await api('key/field', {
        method: 'POST',
        body: Object.assign({ name: state.key.name, type: state.key.type }, payload)
      });
      if (successText) toast(successText);
      return data;
    } catch (err) {
      toast('操作失败：' + err.message, true);
      throw err;
    }
  }

  function renderEditor() {
    const box = $('editor');
    box.innerHTML = '';
    const key = state.key;
    if (!key || key.type === 'none') {
      box.appendChild(emptyEditor('左侧选择一个键开始查看，或右键键名做更多操作。'));
      return;
    }
    if (key.type === 'string') box.appendChild(renderStringEditor(key));
    else if (key.type === 'hash') box.appendChild(renderHashEditor(key));
    else if (key.type === 'list') box.appendChild(renderListEditor(key));
    else if (key.type === 'set') box.appendChild(renderSetEditor(key));
    else if (key.type === 'zset') box.appendChild(renderZSetEditor(key));
    else if (key.type === 'stream') box.appendChild(renderStreamEditor(key));
    else box.appendChild(emptyEditor('暂不支持的类型：' + key.type));
  }

  /* ---------------- string ---------------- */

  function renderStringEditor(key) {
    const box = editorWrap();
    const value = key.value && typeof key.value.value === 'string' ? key.value.value : '';
    const bar = el('div', 'editor-toolbar');
    bar.appendChild(el('span', 'hint', fmtNumber(key.length) + ' 个字符' + (looksJson(value) ? ' · 看起来是 JSON' : '')));
    const pretty = el('button', 'btn ghost small', '美化');
    pretty.type = 'button';
    let syncLayer = null;
    pretty.addEventListener('click', () => {
      try {
        input.value = JSON.stringify(JSON.parse(input.value), null, 2);
        if (syncLayer) syncLayer();
        toast('已美化');
      } catch (err) {
        toast('不是合法 JSON', true);
      }
    });
    const compact = el('button', 'btn ghost small', '压缩');
    compact.type = 'button';
    compact.addEventListener('click', () => {
      try {
        input.value = JSON.stringify(JSON.parse(input.value));
        if (syncLayer) syncLayer();
        toast('已压缩');
      } catch (err) {
        toast('不是合法 JSON', true);
      }
    });
    const save = el('button', 'btn primary small', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      try {
        await api('key/string', { method: 'POST', body: { name: key.name, value: input.value } });
        toast('已保存');
        await refreshKey();
      } catch (err) {
        toast('保存失败：' + err.message, true);
      }
    });
    bar.appendChild(pretty);
    bar.appendChild(compact);
    bar.appendChild(save);
    box.appendChild(bar);

    const shell = el('div', 'code-editor');
    const layer = el('pre', 'code-highlight');
    layer.setAttribute('aria-hidden', 'true');
    const input = document.createElement('textarea');
    input.className = 'textarea mono code-input';
    input.spellcheck = false;
    input.value = value;
    shell.appendChild(layer);
    shell.appendChild(input);
    box.appendChild(shell);
    syncLayer = attachHighlight(input, layer);
    return box;
  }

  /* ---------------- 行表格 ---------------- */

  function makeRowTable(headers, rows, handlers) {
    const opts = handlers || {};
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'kv-table');
    const thead = document.createElement('thead');
    const head = document.createElement('tr');
    headers.forEach((text) => head.appendChild(el('th', null, text)));
    if (opts.onDelete) head.appendChild(el('th', 'row-actions-head', ''));
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      (row.cells || []).forEach((cell) => {
        const td = document.createElement('td');
        if (cell.readOnly) {
          td.textContent = cell.value;
          td.className = 'readonly';
        } else {
          const input = document.createElement('input');
          input.className = 'cell-input';
          input.value = cell.value === null || cell.value === undefined ? '' : String(cell.value);
          input.placeholder = cell.placeholder || '';
          input.type = cell.inputType || 'text';
          if (cell.onCommit) {
            input.addEventListener('change', () => cell.onCommit(input.value, input));
            input.addEventListener('blur', () => {
              if (input.dataset.dirty === '1') return;
            });
          }
          td.appendChild(input);
        }
        tr.appendChild(td);
      });
      if (opts.onDelete) {
        const td = document.createElement('td');
        td.className = 'row-actions';
        const button = el('button', 'row-del', '✕');
        button.type = 'button';
        button.title = '删除这一项';
        button.addEventListener('click', () => opts.onDelete(index));
        td.appendChild(button);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  /* ---------------- hash / list / set / zset（逐字段写回） ---------------- */

  function renderHashEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).slice();
    box.appendChild(makeToolbar(fmtNumber(key.length) + ' 个字段 · 改动即时写回（HSET/HDEL），不再整键覆盖'));
    box.appendChild(pagerFor(key, items.length, 0));
    box.appendChild(makeRowTable(
      ['字段', '值'],
      items.map((item) => ({
        cells: [
          { value: item.field, placeholder: 'field', onCommit: (value) => renameHashField(key, item, value) },
          { value: item.value, placeholder: 'value', onCommit: (value) => fieldOp({ action: 'set', field: item.field, value }, '已更新字段') }
        ]
      })),
      {
        onDelete: async (index) => {
          const item = items[index];
          await fieldOp({ action: 'del', field: item.field }, '已删除字段 ' + item.field);
          key.value.value.splice(index, 1);
          key.length = Math.max(0, (Number(key.length) || 0) - 1);
          renderKeyHeader();
          renderEditor();
        }
      }
    ));
    box.appendChild(makeAddRow('+ 添加字段', ['字段名', '值'], async (values) => {
      if (!values[0]) throw new Error('字段名不能为空');
      await fieldOp({ action: 'set', field: values[0], value: values[1] }, '已添加字段');
      await selectKey(key.name);
    }));
    return box;
  }

  async function renameHashField(key, item, newField) {
    const field = String(newField || '').trim();
    if (!field || field === item.field) return;
    try {
      await fieldOp({ action: 'set', field, value: item.value });
      await fieldOp({ action: 'del', field: item.field });
      item.field = field;
      toast('已重命名字段');
    } catch (err) {
      toast('重命名字段失败：' + err.message, true);
    }
  }

  function renderListEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).slice();
    const offset = key.offset || 0;
    box.appendChild(makeToolbar(fmtNumber(key.length) + ' 个元素 · 改动即时写回（LSET/LREM）'));
    box.appendChild(pagerFor(key, items.length, offset));
    box.appendChild(makeRowTable(
      ['#', '值'],
      items.map((item) => ({
        cells: [
          { value: item.index, readOnly: true },
          { value: item.value, placeholder: 'value', onCommit: (value) => fieldOp({ action: 'set', index: item.index, value }, '已更新第 ' + item.index + ' 项') }
        ]
      })),
      {
        onDelete: async (index) => {
          const item = items[index];
          await fieldOp({ action: 'remove', value: item.value }, '已删除一项');
          await selectKey(key.name, { offset: Math.max(0, offset) });
        }
      }
    ));
    const add = el('div', 'editor-add');
    const input = el('input', 'input grow', '');
    input.placeholder = '新元素内容，回车追加到末尾';
    const button = el('button', 'btn ghost small', '+ 追加');
    const push = async () => {
      if (!input.value) return;
      try {
        await fieldOp({ action: 'push', side: 'right', value: input.value }, '已追加元素');
        input.value = '';
        await selectKey(key.name, { offset });
      } catch (err) {
        /* fieldOp 已提示 */
      }
    };
    button.type = 'button';
    button.addEventListener('click', push);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') push();
    });
    add.appendChild(input);
    add.appendChild(button);
    box.appendChild(add);
    return box;
  }

  function renderSetEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).slice();
    box.appendChild(makeToolbar(fmtNumber(key.length) + ' 个成员 · 改动即时写回（SADD/SREM）'));
    box.appendChild(pagerFor(key, items.length, 0));
    box.appendChild(makeRowTable(
      ['成员'],
      items.map((item) => ({
        cells: [{ value: item.value, readOnly: true }]
      })),
      {
        onDelete: async (index) => {
          const item = items[index];
          await fieldOp({ action: 'remove', value: item.value }, '已删除成员');
          items.splice(index, 1);
          key.length = Math.max(0, (Number(key.length) || 0) - 1);
          renderKeyHeader();
          renderEditor();
        }
      }
    ));
    box.appendChild(makeAddRow('+ 添加成员', ['成员'], async (values) => {
      if (!values[0]) throw new Error('成员不能为空');
      await fieldOp({ action: 'add', value: values[0] }, '已添加成员');
      await selectKey(key.name);
    }));
    return box;
  }

  function renderZSetEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).slice();
    box.appendChild(makeToolbar(fmtNumber(key.length) + ' 个成员 · 改分数即时写回（ZADD），删除用 ZREM'));
    box.appendChild(pagerFor(key, items.length, 0));
    box.appendChild(makeRowTable(
      ['成员', '分数'],
      items.map((item) => ({
        cells: [
          { value: item.value, readOnly: true },
          { value: item.score, inputType: 'number', onCommit: (value) => fieldOp({ action: 'add', value: item.value, score: Number(value) || 0 }, '已更新分数') }
        ]
      })),
      {
        onDelete: async (index) => {
          const item = items[index];
          await fieldOp({ action: 'remove', value: item.value }, '已删除成员');
          items.splice(index, 1);
          key.length = Math.max(0, (Number(key.length) || 0) - 1);
          renderKeyHeader();
          renderEditor();
        }
      }
    ));
    box.appendChild(makeAddRow('+ 添加成员', ['成员', '分数'], async (values) => {
      if (!values[0]) throw new Error('成员不能为空');
      await fieldOp({ action: 'add', value: values[0], score: Number(values[1]) || 0 }, '已添加成员');
      await selectKey(key.name);
    }));
    return box;
  }

  function makeAddRow(label, placeholders, submit) {
    const wrap = el('div', 'editor-add');
    const inputs = placeholders.map((placeholder) => {
      const input = el('input', 'input', '');
      input.placeholder = placeholder;
      return input;
    });
    const button = el('button', 'btn ghost small', label);
    button.type = 'button';
    const run = async () => {
      try {
        await submit(inputs.map((input) => input.value.trim()));
        inputs.forEach((input) => { input.value = ''; });
      } catch (err) {
        toast('添加失败：' + err.message, true);
      }
    };
    button.addEventListener('click', run);
    inputs[inputs.length - 1].addEventListener('keydown', (event) => {
      if (event.key === 'Enter') run();
    });
    inputs.forEach((input) => wrap.appendChild(input));
    wrap.appendChild(button);
    return wrap;
  }

  function renderStreamEditor(key) {
    const box = editorWrap();
    const items = key.value && key.value.value ? key.value.value : [];
    box.appendChild(makeToolbar('stream 只读展示最近 ' + items.length + ' 条消息；增删请用命令行。'));
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'kv-table');
    const thead = document.createElement('thead');
    const head = document.createElement('tr');
    head.appendChild(el('th', null, '消息 ID'));
    head.appendChild(el('th', null, '字段'));
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', 'stream-id', item.id));
      const fields = (item.fields || []).map((field) => field.field + '=' + field.value).join(', ');
      const td = el('td', null, fields || '（空字段）');
      td.title = fields;
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    box.appendChild(wrap);
    return box;
  }

  /* ---------------- 键右键菜单 ---------------- */

  function closeKeyMenu() {
    $('key-ctx').classList.add('hidden');
    state.ctxKey = null;
  }

  function openKeyMenu(item, x, y) {
    state.ctxKey = item;
    const menu = $('key-ctx');
    menu.classList.remove('hidden');
    menu.style.left = '0px';
    menu.style.top = '0px';
    const rect = menu.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top = Math.max(8, top) + 'px';
  }

  async function handleKeyMenu(action) {
    const item = state.ctxKey;
    if (!item) return;
    closeKeyMenu();
    if (action === 'open') return selectKey(item.name);
    if (action === 'copy-name') return copyText(item.name, '键名已复制');
    if (action === 'copy-value') {
      try {
        const data = await api('key?' + new URLSearchParams({ name: item.name }).toString());
        const value = data.value && data.value.value;
        const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
        return copyText(text, '值已复制');
      } catch (err) {
        return toast('复制失败：' + err.message, true);
      }
    }
    if (action === 'ttl') {
      await selectKey(item.name);
      $('ttl-input').focus();
      return undefined;
    }
    if (action === 'rename') {
      await selectKey(item.name);
      toggleRename(true);
      $('rename-input').value = item.name;
      $('rename-input').focus();
      return undefined;
    }
    if (action === 'export') {
      await selectKey(item.name);
      return openExportModal('key', item.name);
    }
    if (action === 'delete') {
      await selectKey(item.name);
      state.confirmDelete = false;
      return deleteKey();
    }
    return undefined;
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch (err) {
      toast('复制失败，浏览器不允许访问剪贴板', true);
    }
  }

  /* ---------------- TTL / 重命名 / 删除 ---------------- */

  async function applyTtl(persist) {
    if (!state.key) return;
    const ttl = persist ? 0 : Number($('ttl-input').value);
    if (!persist && (!Number.isFinite(ttl) || ttl <= 0)) {
      toast('请输入大于 0 的秒数，或点「设为永久」', true);
      return;
    }
    try {
      await api('key/ttl', { method: 'POST', body: { name: state.key.name, ttl: persist ? 0 : ttl } });
      toast(persist ? '已设为永久' : 'TTL 已更新');
      await selectKey(state.key.name);
      await loadKeys(true);
    } catch (err) {
      toast('设置 TTL 失败：' + err.message, true);
    }
  }

  function toggleRename(show) {
    const bar = $('rename-bar');
    const visible = show === undefined ? bar.classList.contains('hidden') : show;
    bar.classList.toggle('hidden', !visible);
    if (visible) {
      $('rename-input').value = state.key ? state.key.name : '';
      $('rename-input').focus();
    }
  }

  async function confirmRename() {
    if (!state.key) return;
    const next = $('rename-input').value.trim();
    if (!next) {
      toast('新键名不能为空', true);
      return;
    }
    try {
      await api('key/rename', { method: 'POST', body: { name: state.key.name, newName: next } });
      toggleRename(false);
      toast('已重命名为 ' + next);
      await loadKeys(true);
      await selectKey(next);
    } catch (err) {
      toast('重命名失败：' + err.message, true);
    }
  }

  let deleteTimer = 0;
  async function deleteKey() {
    if (!state.key) return;
    if (!state.confirmDelete) {
      state.confirmDelete = true;
      renderKeyHeader();
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(() => {
        state.confirmDelete = false;
        renderKeyHeader();
      }, 2600);
      return;
    }
    clearTimeout(deleteTimer);
    try {
      await api('key/delete', { method: 'POST', body: { name: state.key.name } });
      toast('已删除 ' + state.key.name);
      state.key = null;
      renderKeyHeader();
      renderEditor();
      await loadKeys(true);
    } catch (err) {
      toast('删除失败：' + err.message, true);
    } finally {
      state.confirmDelete = false;
    }
  }

  /* ---------------- 新建键 ---------------- */

  function parseNewValue(type) {
    const text = $('new-value').value;
    if (type === 'string') return text;
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    if (type === 'hash') {
      return lines.map((line) => {
        const at = line.indexOf('=');
        return at < 0 ? { field: line, value: '' } : { field: line.slice(0, at), value: line.slice(at + 1) };
      });
    }
    if (type === 'zset') {
      return lines.map((line) => {
        const at = line.indexOf('=');
        if (at < 0) return { score: 0, value: line };
        return { score: Number(line.slice(0, at)) || 0, value: line.slice(at + 1) };
      });
    }
    return lines;
  }

  function openModal() {
    $('modal').classList.remove('hidden');
    $('new-name').value = '';
    $('new-value').value = '';
    $('new-ttl').value = '';
    $('new-name').focus();
  }

  function closeModal() {
    $('modal').classList.add('hidden');
  }

  async function createKey() {
    const name = $('new-name').value.trim();
    const type = $('new-type').value;
    const ttl = Number($('new-ttl').value) || -1;
    if (!name) {
      toast('键名不能为空', true);
      return;
    }
    try {
      await api('key/set', { method: 'POST', body: { name, type, ttl, value: parseNewValue(type) } });
      closeModal();
      toast('已创建 ' + name);
      await loadKeys(true);
      await selectKey(name);
    } catch (err) {
      toast('创建失败：' + err.message, true);
    }
  }

  /* ---------------- 导出 / 导入 ---------------- */

  function openExportModal(scope, target) {
    state.exportScope = scope;
    state.exportTarget = target || '';
    state.exportFormat = 'cmd';
    $('export-subject').textContent = scope === 'key'
      ? '导出键 ' + target
      : '导出匹配「' + (target || state.pattern) + '」的键（最多 500 个）';
    document.querySelectorAll('#export-formats .fmt-chip').forEach((chip) => {
      chip.classList.toggle('is-active', chip.dataset.format === 'cmd');
    });
    $('export-modal').classList.remove('hidden');
  }

  function closeExportModal() {
    $('export-modal').classList.add('hidden');
  }

  async function submitExport() {
    const params = new URLSearchParams({ scope: state.exportScope, format: state.exportFormat });
    if (state.exportScope === 'key') params.set('name', state.exportTarget);
    else params.set('pattern', state.exportTarget || state.pattern);
    try {
      const res = await fetch('/api/export?' + params.toString(), { headers: { 'x-webdb-token': TOKEN } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      const rows = res.headers.get('x-webdb-export-keys') || '';
      const truncated = res.headers.get('x-webdb-export-truncated') === '1';
      const disposition = res.headers.get('content-disposition') || '';
      const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : 'redis-export.txt';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      closeExportModal();
      toast('已导出 ' + (rows ? rows + ' 个键' : '文件') + (truncated ? '（超出上限已截断）' : ''));
    } catch (err) {
      toast('导出失败：' + err.message, true);
    }
  }

  function openImportPicker() {
    $('import-cmd-file').click();
  }

  function openImportModal(file) {
    state.import.name = file ? file.name : '';
    state.import.size = file ? file.size : 0;
    state.import.file = file;
    $('import-subject').textContent = file ? file.name + ' · ' + bytesText(file.size) : '';
    $('import-modal').classList.remove('hidden');
  }

  function closeImportModal() {
    $('import-modal').classList.add('hidden');
  }

  function updateImportProgress(text) {
    $('import-bar-text').textContent = text;
  }

  async function runImport() {
    const file = state.import.file;
    if (!file) return;
    closeImportModal();
    $('import-bar').classList.remove('hidden');
    state.import.cancelled = false;
    state.import.running = true;
    updateImportProgress('准备导入…');
    let id = '';
    try {
      const started = await api('import/start', { method: 'POST', body: {} });
      id = started.id;
      state.import.id = id;
      const decoder = new TextDecoder('utf-8');
      let offset = 0;
      let buffer = '';
      while (offset < file.size) {
        if (state.import.cancelled) break;
        const slice = file.slice(offset, offset + IMPORT_READ);
        const bytes = new Uint8Array(await slice.arrayBuffer());
        buffer += decoder.decode(bytes, { stream: true });
        offset += bytes.length;
        while (buffer.length >= IMPORT_CHUNK) {
          const cut = buffer.lastIndexOf('\n', IMPORT_CHUNK);
          const take = cut < 0 ? IMPORT_CHUNK : cut + 1;
          await api('import/chunk', { method: 'POST', body: { id, text: buffer.slice(0, take), last: false } });
          buffer = buffer.slice(take);
          updateImportProgress('已读取 ' + Math.round((offset / file.size) * 100) + '% · 待执行剩余 ' + Math.round(buffer.length / 1024) + ' KB');
        }
      }
      buffer += decoder.decode();
      const final = await api('import/chunk', { method: 'POST', body: { id, text: buffer, last: true } });
      state.import.running = false;
      $('import-bar').classList.add('hidden');
      if (state.import.cancelled) {
        toast('已取消导入，已执行 ' + final.executed + ' 条');
      } else {
        toast(final.failed ? '导入完成：本次执行 ' + final.executed + ' 条，失败 ' + final.failed + ' 条' : '导入完成，共执行 ' + final.executed + ' 条');
      }
      cliAppend('IMPORT', '导入完成：共执行 ' + final.executed + ' 条，成功 ' + final.ok + ' 条，失败 ' + final.failed + ' 条' + (final.failed ? '\n' + final.failedList.map((item) => '#' + item.index + ' ' + item.line + '\n  ' + item.message).join('\n') : ''), Boolean(final.failed));
      await loadKeys(true);
      if (state.key) await selectKey(state.key.name);
    } catch (err) {
      state.import.running = false;
      $('import-bar').classList.add('hidden');
      toast('导入失败：' + err.message, true);
    }
  }

  async function cancelImport() {
    if (!state.import.running) return;
    state.import.cancelled = true;
    if (state.import.id) {
      try {
        await api('import/cancel', { method: 'POST', body: { id: state.import.id } });
      } catch (err) {
        /* 会话可能已结束 */
      }
    }
  }

  /* ---------------- 命令行 ---------------- */

  function loadCliPrefs() {
    try {
      state.cliHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch (err) {
      state.cliHistory = [];
    }
    try {
      state.cliFavs = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    } catch (err) {
      state.cliFavs = [];
    }
  }

  function saveCliPrefs() {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.cliHistory.slice(-50)));
    localStorage.setItem(FAV_KEY, JSON.stringify(state.cliFavs.slice(-20)));
    renderFavs();
  }

  function renderFavs() {
    const box = $('cli-favs');
    box.innerHTML = '';
    if (!state.cliFavs.length) {
      box.appendChild(el('span', 'hint', '收藏的命令会出现在这里'));
      return;
    }
    state.cliFavs.forEach((cmd) => {
      const chip = el('button', 'chip', cmd);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        $('cli-input').value = cmd;
        $('cli-input').focus();
      });
      box.appendChild(chip);
    });
  }

  function cliAppend(command, output, isError) {
    const out = $('cli-out');
    const block = el('div', 'cli-block' + (isError ? ' is-error' : ''));
    block.appendChild(el('div', 'cli-cmd', '> ' + command));
    block.appendChild(el('pre', 'cli-result', output));
    out.appendChild(block);
    out.scrollTop = out.scrollHeight;
  }

  async function runCli() {
    const input = $('cli-input');
    const cmd = input.value.trim();
    if (!cmd) return;
    if (DANGER.test(cmd) && state.dangerArmed !== cmd) {
      state.dangerArmed = cmd;
      $('btn-cli-run').classList.add('is-armed');
      $('btn-cli-run').textContent = '再点一次执行';
      toast('这是危险命令，3 秒内再点一次执行', true);
      setTimeout(() => {
        state.dangerArmed = '';
        $('btn-cli-run').classList.remove('is-armed');
        $('btn-cli-run').textContent = '执行';
      }, 3000);
      return;
    }
    state.dangerArmed = '';
    $('btn-cli-run').classList.remove('is-armed');
    $('btn-cli-run').textContent = '执行';
    input.value = '';
    state.cliHistory.push(cmd);
    state.cliIndex = state.cliHistory.length;
    saveCliPrefs();
    try {
      const data = await api('command', { method: 'POST', body: { cmd } });
      cliAppend(cmd, '[' + data.type + '] ' + data.value + '\n(' + data.tookMs + ' ms)', false);
      if (/^(select|flushdb|flushall|set|del|expire|rename|hset|hdel|lpush|rpush|sadd|srem|zadd|zrem)\b/i.test(cmd)) {
        await loadKeys(true);
        if (state.key) await selectKey(state.key.name);
      }
    } catch (err) {
      cliAppend(cmd, err.message, true);
    }
  }

  function favouriteCli() {
    const cmd = $('cli-input').value.trim();
    if (!cmd) {
      toast('先输入一条命令再收藏', true);
      return;
    }
    if (!state.cliFavs.includes(cmd)) state.cliFavs.push(cmd);
    saveCliPrefs();
    toast('已收藏');
  }

  /* ---------------- 顶部 / 初始化 ---------------- */

  async function refreshMeta() {
    try {
      const meta = await api('meta');
      state.meta = meta;
      state.db = meta.db;
      $('conn-badge').textContent = meta.host + ':' + meta.port + ' · Redis ' + meta.version + ' · db' + meta.db + ' · ' + fmtNumber(meta.dbsize) + ' 个键';
      const select = $('db-select');
      if (!select.options.length) {
        for (let i = 0; i < meta.databases; i += 1) {
          const option = document.createElement('option');
          option.value = String(i);
          option.textContent = 'db' + i;
          select.appendChild(option);
        }
      }
      select.value = String(meta.db);
      $('db-hint').textContent = 'db' + meta.db + ' / ' + meta.databases;
      $('cli-db').textContent = String(meta.db);
      renderKeyList();
    } catch (err) {
      toast('读取连接信息失败：' + err.message, true);
    }
  }

  async function selectDb(db) {
    try {
      await api('select', { method: 'POST', body: { db } });
      state.key = null;
      renderKeyHeader();
      renderEditor();
      await refreshMeta();
      await loadKeys(true);
    } catch (err) {
      toast('切换数据库失败：' + err.message, true);
    }
  }

  function bindEvents() {
    $('btn-refresh').addEventListener('click', async () => {
      await refreshMeta();
      await loadKeys(true);
      if (state.key) await selectKey(state.key.name);
    });
    $('btn-more').addEventListener('click', () => loadKeys(false));
    $('key-pattern').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      state.pattern = $('key-pattern').value.trim() || '*';
      state.key = null;
      state.cursor = '0';
      state.keys = [];
      loadKeys(true);
    });
    $('type-filter').addEventListener('click', (event) => {
      const target = event.target.closest('.chip');
      if (!target) return;
      state.typeFilter = target.dataset.type || '';
      document.querySelectorAll('#type-filter .chip').forEach((chip) => {
        chip.classList.toggle('is-active', chip === target);
      });
      renderKeyList();
    });
    $('db-select').addEventListener('change', () => selectDb(Number($('db-select').value)));

    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });

    $('btn-rename').addEventListener('click', () => toggleRename(true));
    $('btn-rename-ok').addEventListener('click', confirmRename);
    $('btn-rename-cancel').addEventListener('click', () => toggleRename(false));
    $('rename-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') confirmRename();
      if (event.key === 'Escape') toggleRename(false);
    });
    $('btn-refresh-key').addEventListener('click', () => state.key && selectKey(state.key.name));
    $('btn-delete').addEventListener('click', deleteKey);
    $('btn-ttl-apply').addEventListener('click', () => applyTtl(false));
    $('btn-ttl-persist').addEventListener('click', () => applyTtl(true));

    $('btn-new').addEventListener('click', openModal);
    $('btn-new-cancel').addEventListener('click', closeModal);
    $('btn-new-ok').addEventListener('click', createKey);
    $('modal').addEventListener('click', (event) => {
      if (event.target === $('modal')) closeModal();
    });

    $('btn-export-key').addEventListener('click', () => {
      if (state.key) openExportModal('key', state.key.name);
    });
    $('btn-export-pattern').addEventListener('click', () => openExportModal('pattern', state.pattern));
    document.querySelectorAll('#export-formats .fmt-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.exportFormat = chip.dataset.format;
        document.querySelectorAll('#export-formats .fmt-chip').forEach((item) => {
          item.classList.toggle('is-active', item === chip);
        });
      });
    });
    $('btn-export-ok').addEventListener('click', submitExport);
    $('btn-export-cancel').addEventListener('click', closeExportModal);
    $('export-modal').addEventListener('click', (event) => {
      if (event.target === $('export-modal')) closeExportModal();
    });

    $('btn-import-cmd').addEventListener('click', openImportPicker);
    $('import-cmd-file').addEventListener('change', () => {
      const file = $('import-cmd-file').files[0];
      $('import-cmd-file').value = '';
      if (file) openImportModal(file);
    });
    $('btn-import-ok').addEventListener('click', runImport);
    $('btn-import-cancel').addEventListener('click', closeImportModal);
    $('import-modal').addEventListener('click', (event) => {
      if (event.target === $('import-modal')) closeImportModal();
    });
    $('btn-import-stop').addEventListener('click', cancelImport);

    $('btn-cli-run').addEventListener('click', runCli);
    $('btn-cli-fav').addEventListener('click', favouriteCli);
    $('cli-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        runCli();
        return;
      }
      if (event.key === 'ArrowUp' && state.cliHistory.length) {
        event.preventDefault();
        state.cliIndex = Math.max(0, state.cliIndex - 1);
        $('cli-input').value = state.cliHistory[state.cliIndex] || '';
      }
      if (event.key === 'ArrowDown' && state.cliHistory.length) {
        event.preventDefault();
        state.cliIndex = Math.min(state.cliHistory.length, state.cliIndex + 1);
        $('cli-input').value = state.cliHistory[state.cliIndex] || '';
      }
    });

    document.addEventListener('click', (event) => {
      if (!$('key-ctx').classList.contains('hidden') && !event.target.closest('#key-ctx')) closeKeyMenu();
    });
    $('key-ctx').addEventListener('click', (event) => {
      const target = event.target.closest('.ctx-item');
      if (target) handleKeyMenu(target.dataset.act);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!$('key-ctx').classList.contains('hidden')) closeKeyMenu();
      else if (!$('export-modal').classList.contains('hidden')) closeExportModal();
      else if (!$('import-modal').classList.contains('hidden')) closeImportModal();
      else if (!$('modal').classList.contains('hidden')) closeModal();
      else if (!$('rename-bar').classList.contains('hidden')) toggleRename(false);
    });
    window.addEventListener('resize', closeKeyMenu);
  }

  async function init() {
    loadCliPrefs();
    renderFavs();
    bindEvents();
    await refreshMeta();
    await loadKeys(true);
    renderKeyHeader();
    renderEditor();
  }

  init();
})();
