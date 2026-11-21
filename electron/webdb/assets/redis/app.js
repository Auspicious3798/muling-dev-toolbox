'use strict';

(function () {
  const TOKEN = new URLSearchParams(location.search).get('t') || '';
  const TYPE_LABEL = {
    string: 'string',
    hash: 'hash',
    list: 'list',
    set: 'set',
    zset: 'zset',
    stream: 'stream',
    none: 'none'
  };

  const state = {
    meta: null,
    db: 0,
    pattern: '*',
    cursor: '0',
    keys: [],
    typeFilter: '',
    key: null,
    tab: 'detail',
    confirmDelete: false,
    cliHistory: [],
    cliIndex: -1
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
    toastTimer = setTimeout(() => box.classList.remove('is-visible'), isError ? 4200 : 2000);
  }

  function typeClass(type) {
    return 'type-' + (TYPE_LABEL[type] ? type : 'none');
  }

  function ttlText(ttl) {
    if (ttl === -1) return '永久';
    if (ttl === -2) return '已过期';
    if (ttl === null || ttl === undefined) return '—';
    if (ttl < 60) return ttl + ' 秒后过期';
    if (ttl < 3600) return Math.round(ttl / 60) + ' 分钟后过期';
    if (ttl < 86400) return Math.round(ttl / 3600) + ' 小时后过期';
    return Math.round(ttl / 86400) + ' 天后过期';
  }

  function fmtNumber(n) {
    return Number(n || 0).toLocaleString('zh-CN');
  }

  /* ---------------- 键列表 ---------------- */

  function renderKeyList() {
    const list = $('key-list');
    list.textContent = '';
    const keys = state.keys.filter((key) => !state.typeFilter || key.type === state.typeFilter);
    if (!keys.length) {
      list.appendChild(el('li', 'empty', state.keys.length ? '没有该类型的键' : '没有匹配的键'));
    } else {
      keys.forEach((key) => {
        const li = el('li');
        if (state.key && state.key.name === key.name) li.classList.add('is-active');
        li.appendChild(el('span', 'type-badge ' + typeClass(key.type), key.type));
        li.appendChild(el('span', 'key-name', key.name));
        if (key.ttl > 0) li.appendChild(el('span', 'key-ttl', key.ttl + 's'));
        li.title = key.name + '\n类型：' + key.type + '\nTTL：' + ttlText(key.ttl);
        li.addEventListener('click', () => selectKey(key.name));
        list.appendChild(li);
      });
    }
    $('key-count').textContent = state.keys.length
      ? '已加载 ' + state.keys.length + ' 个键' + (state.typeFilter ? '，匹配 ' + keys.length : '')
      : '—';
    $('btn-more').disabled = state.cursor === '0';
  }

  async function loadKeys(reset) {
    try {
      const params = new URLSearchParams({
        pattern: state.pattern || '*',
        cursor: reset ? '0' : state.cursor,
        count: '200'
      });
      const data = await api('keys?' + params.toString());
      state.cursor = data.cursor;
      state.keys = reset ? data.keys : state.keys.concat(data.keys);
      renderKeyList();
    } catch (err) {
      toast('读取键失败：' + err.message, true);
    }
  }

  /* ---------------- 键详情 ---------------- */

  async function selectKey(name) {
    try {
      const data = await api('key?name=' + encodeURIComponent(name));
      state.key = data;
      state.confirmDelete = false;
      $('btn-delete').textContent = '删除';
      if (data.type === 'none') {
        toast('这个键已经不存在了', true);
        renderKeyHeader();
        renderEditor();
        await loadKeys(true);
        return;
      }
      renderKeyHeader();
      renderEditor();
      renderKeyList();
    } catch (err) {
      toast('读取键失败：' + err.message, true);
    }
  }

  function renderKeyHeader() {
    const key = state.key;
    const nameEl = $('key-name');
    const badge = $('key-type-badge');
    const active = key && key.type !== 'none';
    nameEl.textContent = key ? key.name : '未选择键';
    badge.textContent = key ? key.type : '—';
    badge.className = 'badge ' + (key ? typeClass(key.type) : '');
    $('key-length').textContent = key && active
      ? (key.type === 'stream' ? fmtNumber(key.length) + ' 条消息' : fmtNumber(key.length) + ' 个元素')
      : '';
    $('key-ttl').textContent = key && active ? 'TTL ' + ttlText(key.ttl) : '';
    $('ttl-hint').textContent = key && active ? '当前：' + ttlText(key.ttl) : '';
    $('ttl-input').value = key && key.ttl > 0 ? String(key.ttl) : '';
    ['btn-rename', 'btn-refresh-key', 'btn-delete', 'btn-ttl-apply', 'btn-ttl-persist'].forEach((id) => {
      $(id).disabled = !active;
    });
  }

  function editorWrap() {
    const box = $('editor');
    box.textContent = '';
    return box;
  }

  function emptyEditor(text) {
    const box = editorWrap();
    box.appendChild(el('div', 'editor-empty', text));
  }

  function renderEditor() {
    const key = state.key;
    if (!key || key.type === 'none') {
      emptyEditor('在左侧选择一个键查看内容，或点「+ 新建」创建一个。');
      return;
    }
    if (key.type === 'string') return renderStringEditor(key);
    if (key.type === 'hash') return renderHashEditor(key);
    if (key.type === 'list') return renderListEditor(key);
    if (key.type === 'set') return renderSetEditor(key);
    if (key.type === 'zset') return renderZSetEditor(key);
    if (key.type === 'stream') return renderStreamEditor(key);
    emptyEditor('暂不支持编辑 ' + key.type + ' 类型');
  }

  function makeToolbar(hintText, onSave) {
    const bar = el('div', 'editor-toolbar');
    bar.appendChild(el('span', 'hint', hintText));
    if (onSave) {
      const save = el('button', 'btn primary small', '保存');
      save.type = 'button';
      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          await onSave();
        } catch (err) {
          toast('保存失败：' + err.message, true);
        } finally {
          save.disabled = false;
        }
      });
      bar.appendChild(save);
    }
    return bar;
  }

  function ttlValue() {
    const ttl = Number($('ttl-input').value);
    return Number.isFinite(ttl) && ttl > 0 ? ttl : -1;
  }

  async function saveValue(type, value) {
    const data = await api('key/set', {
      method: 'POST',
      body: { name: state.key.name, type, value, ttl: ttlValue() }
    });
    state.key = data;
    renderKeyHeader();
    renderEditor();
    await loadKeys(true);
    toast('已保存');
  }

  function renderStringEditor(key) {
    const box = editorWrap();
    const wrap = el('div', 'string-editor');
    const toolbar = el('div', 'editor-toolbar');
    toolbar.appendChild(el('span', 'hint', '整段重写字符串值 · ' + fmtNumber(key.length) + ' 字符'));
    wrap.appendChild(toolbar);
    const shell = el('div', 'code-editor');
    const layer = el('pre', 'code-highlight');
    layer.setAttribute('aria-hidden', 'true');
    const area = el('textarea', 'textarea mono code-input');
    area.spellcheck = false;
    area.value = key.value && key.value.value != null ? key.value.value : '';
    shell.appendChild(layer);
    shell.appendChild(area);
    wrap.appendChild(shell);
    attachHighlight(area, layer);
    const bar = el('div', 'editor-toolbar');
    bar.appendChild(el('span', 'hint', '保存时会覆盖原值'));
    const save = el('button', 'btn primary small', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await saveValue('string', area.value);
      } catch (err) {
        toast('保存失败：' + err.message, true);
      } finally {
        save.disabled = false;
      }
    });
    bar.appendChild(save);
    wrap.appendChild(bar);
    box.appendChild(wrap);
  }

  function makeRowTable(headers, rows, onDelete) {
    const wrap = el('div', 'table-wrap');
    const table = el('table', 'kv-table');
    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    headers.forEach((header) => tr.appendChild(el('th', null, header)));
    if (onDelete) tr.appendChild(el('th', null, ''));
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((cells, index) => {
      const row = document.createElement('tr');
      cells.forEach((cell) => {
        const td = document.createElement('td');
        const input = el('input');
        input.type = 'text';
        input.value = cell.value === null || cell.value === undefined ? '' : String(cell.value);
        input.placeholder = cell.placeholder || '';
        if (cell.readOnly) input.readOnly = true;
        input.addEventListener('input', () => {
          cell.value = input.value;
        });
        td.appendChild(input);
        row.appendChild(td);
      });
      if (onDelete) {
        const td = document.createElement('td');
        const button = el('button', 'row-del', '✕');
        button.type = 'button';
        button.title = '删除这一行';
        button.addEventListener('click', () => onDelete(index));
        td.appendChild(button);
        row.appendChild(td);
      }
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderHashEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).map((item) => ({
      field: item.field,
      value: item.value
    }));
    const toolbar = el('div', 'editor-toolbar');
    toolbar.appendChild(el('span', 'hint', fmtNumber(items.length) + ' 个字段 · 保存时整体重写'));
    const add = el('button', 'btn ghost small', '+ 添加字段');
    add.type = 'button';
    add.addEventListener('click', () => {
      items.push({ field: '', value: '' });
      renderHashEditor(key);
    });
    const save = el('button', 'btn primary small', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      const rows = items.filter((item) => item.field.trim());
      try {
        await saveValue('hash', rows.map((item) => ({ field: item.field, value: item.value })));
      } catch (err) {
        toast('保存失败：' + err.message, true);
      }
    });
    toolbar.appendChild(add);
    toolbar.appendChild(save);
    box.appendChild(toolbar);
    box.appendChild(
      makeRowTable(
        ['字段', '值'],
        items.map((item) => [
          { value: item.field, placeholder: 'field' },
          { value: item.value, placeholder: 'value' }
        ]),
        (index) => {
          items.splice(index, 1);
          renderHashEditor(key);
        }
      )
    );
  }

  function renderListEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).map((item) => item.value);
    const toolbar = el('div', 'editor-toolbar');
    toolbar.appendChild(el('span', 'hint', fmtNumber(key.length) + ' 个元素' + (key.length > items.length ? '（仅显示前 1000 个）' : '')));
    const add = el('button', 'btn ghost small', '+ 添加元素');
    add.type = 'button';
    add.addEventListener('click', () => {
      items.push('');
      renderListEditor(key);
    });
    const save = el('button', 'btn primary small', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      try {
        await saveValue('list', items.map((value) => value));
      } catch (err) {
        toast('保存失败：' + err.message, true);
      }
    });
    toolbar.appendChild(add);
    toolbar.appendChild(save);
    box.appendChild(toolbar);
    box.appendChild(
      makeRowTable(
        ['#', '值'],
        items.map((value, index) => [{ value: String(index), readOnly: true }, { value: value }]),
        (index) => {
          items.splice(index, 1);
          renderListEditor(key);
        }
      )
    );
  }

  function renderSetEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).map((item) => item.value);
    const toolbar = el('div', 'editor-toolbar');
    toolbar.appendChild(el('span', 'hint', fmtNumber(key.length) + ' 个成员' + (key.length > items.length ? '（仅显示前 1000 个）' : '')));
    const add = el('button', 'btn ghost small', '+ 添加成员');
    add.type = 'button';
    add.addEventListener('click', () => {
      items.push('');
      renderSetEditor(key);
    });
    const save = el('button', 'btn primary small', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      try {
        await saveValue('set', items.filter((value) => value !== ''));
      } catch (err) {
        toast('保存失败：' + err.message, true);
      }
    });
    toolbar.appendChild(add);
    toolbar.appendChild(save);
    box.appendChild(toolbar);
    box.appendChild(
      makeRowTable(
        ['成员'],
        items.map((value) => [{ value: value }]),
        (index) => {
          items.splice(index, 1);
          renderSetEditor(key);
        }
      )
    );
  }

  function renderZSetEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []).map((item) => ({
      value: item.value,
      score: item.score
    }));
    const toolbar = el('div', 'editor-toolbar');
    toolbar.appendChild(el('span', 'hint', fmtNumber(key.length) + ' 个成员 · 按分数排序，保存时整体重写'));
    const add = el('button', 'btn ghost small', '+ 添加成员');
    add.type = 'button';
    add.addEventListener('click', () => {
      items.push({ value: '', score: 0 });
      renderZSetEditor(key);
    });
    const save = el('button', 'btn primary small', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      try {
        await saveValue(
          'zset',
          items
            .filter((item) => item.value.trim())
            .map((item) => ({ value: item.value, score: Number(item.score) || 0 }))
        );
      } catch (err) {
        toast('保存失败：' + err.message, true);
      }
    });
    toolbar.appendChild(add);
    toolbar.appendChild(save);
    box.appendChild(toolbar);
    box.appendChild(
      makeRowTable(
        ['成员', '分数'],
        items.map((item) => [
          { value: item.value },
          { value: item.score, type: 'number' }
        ]),
        (index) => {
          items.splice(index, 1);
          renderZSetEditor(key);
        }
      )
    );
  }

  function renderStreamEditor(key) {
    const box = editorWrap();
    const items = (key.value && key.value.value ? key.value.value : []);
    box.appendChild(
      makeToolbar('stream 只读展示最近 100 条消息；增删请使用命令行或应用写入。')
    );
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
    $('rename-bar').classList.toggle('hidden', !show);
    if (show) {
      $('rename-input').value = state.key ? state.key.name : '';
      $('rename-input').focus();
      $('rename-input').select();
    }
  }

  async function confirmRename() {
    const name = $('rename-input').value.trim();
    if (!name) {
      toast('键名不能为空', true);
      return;
    }
    if (!state.key || name === state.key.name) {
      toggleRename(false);
      return;
    }
    try {
      await api('key/rename', { method: 'POST', body: { name: state.key.name, newName: name } });
      toast('已重命名');
      toggleRename(false);
      await loadKeys(true);
      await selectKey(name);
    } catch (err) {
      toast('重命名失败：' + err.message, true);
    }
  }

  async function deleteKey() {
    if (!state.key) return;
    if (!state.confirmDelete) {
      state.confirmDelete = true;
      $('btn-delete').textContent = '确认删除？';
      setTimeout(() => {
        state.confirmDelete = false;
        $('btn-delete').textContent = '删除';
      }, 3200);
      return;
    }
    try {
      await api('key/delete', { method: 'POST', body: { names: [state.key.name] } });
      toast('已删除 ' + state.key.name);
      state.key = null;
      $('btn-delete').textContent = '删除';
      renderKeyHeader();
      renderEditor();
      await loadKeys(true);
    } catch (err) {
      toast('删除失败：' + err.message, true);
    }
  }

  /* ---------------- 新建键 ---------------- */

  function parseNewValue(type) {
    const text = $('new-value').value;
    if (type === 'string') return text;
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (type === 'hash') {
      return lines.map((line) => {
        const index = line.indexOf('=');
        return index === -1
          ? { field: line, value: '' }
          : { field: line.slice(0, index), value: line.slice(index + 1) };
      });
    }
    if (type === 'zset') {
      return lines.map((line) => {
        const index = line.indexOf('=');
        if (index === -1) return { value: line, score: 0 };
        const score = Number(line.slice(0, index));
        return { value: line.slice(index + 1), score: Number.isFinite(score) ? score : 0 };
      });
    }
    return lines;
  }

  function openModal() {
    $('modal').classList.remove('hidden');
    $('new-name').value = '';
    $('new-type').value = 'string';
    $('new-value').value = '';
    $('new-ttl').value = '';
    $('new-name').focus();
  }

  function closeModal() {
    $('modal').classList.add('hidden');
  }

  async function createKey() {
    const name = $('new-name').value.trim();
    if (!name) {
      toast('键名不能为空', true);
      return;
    }
    const type = $('new-type').value;
    const ttl = Number($('new-ttl').value);
    const button = $('btn-new-ok');
    button.disabled = true;
    try {
      await api('key/set', {
        method: 'POST',
        body: { name, type, value: parseNewValue(type), ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : -1 }
      });
      toast('已创建 ' + name);
      closeModal();
      await loadKeys(true);
      await selectKey(name);
    } catch (err) {
      toast('创建失败：' + err.message, true);
    } finally {
      button.disabled = false;
    }
  }

  /* ---------------- 命令行 ---------------- */

  function cliAppend(command, output, isError) {
    const out = $('cli-out');
    const placeholder = out.querySelector('.cli-placeholder');
    if (placeholder) placeholder.remove();
    const entry = el('div', 'cli-entry' + (isError ? ' is-error' : ''));
    entry.appendChild(el('div', 'cmd', '> ' + command));
    entry.appendChild(el('div', 'out', output));
    out.appendChild(entry);
    out.scrollTop = out.scrollHeight;
    if (out.children.length > 300) out.removeChild(out.firstChild);
  }

  async function runCli() {
    const input = $('cli-input');
    const text = input.value.trim();
    if (!text) return;
    state.cliHistory.push(text);
    state.cliIndex = -1;
    input.value = '';
    if (text.toLowerCase() === 'clear') {
      $('cli-out').textContent = '';
      $('cli-out').appendChild(el('div', 'cli-placeholder', '输出已清空。输入 Redis 命令并回车执行。'));
      return;
    }
    try {
      const data = await api('command', { method: 'POST', body: { cmd: text } });
      cliAppend(text, '[' + data.type + '] ' + data.value + '  (' + data.tookMs + ' ms)', false);
      if (/^SELECT\s+\d+$/i.test(text)) {
        await refreshMeta();
        await loadKeys(true);
      }
    } catch (err) {
      cliAppend(text, err.message, true);
    }
  }

  /* ---------------- 元信息 / 启动 ---------------- */

  async function refreshMeta() {
    const meta = await api('meta');
    state.meta = meta;
    state.db = meta.db;
    const badge = $('conn-badge');
    badge.textContent = (meta.host || '127.0.0.1') + ':' + (meta.port || 6379) +
      ' · Redis ' + (meta.version || '') + ' · db' + meta.db + ' · ' + fmtNumber(meta.dbsize) + ' 个键';
    badge.classList.add('is-ok');
    $('db-hint').textContent = 'db' + meta.db + ' / ' + (meta.databases || 16) + ' · ' + fmtNumber(meta.dbsize) + ' 个键';
    $('cli-db').textContent = String(meta.db);
    const select = $('db-select');
    if (select.options.length !== meta.databases) {
      select.textContent = '';
      for (let i = 0; i < meta.databases; i += 1) {
        const option = el('option', null, 'db' + i);
        option.value = String(i);
        select.appendChild(option);
      }
    }
    select.value = String(meta.db);
  }

  async function selectDb(db) {
    try {
      await api('select', { method: 'POST', body: { db } });
      await refreshMeta();
      state.keys = [];
      state.cursor = '0';
      state.key = null;
      renderKeyHeader();
      renderEditor();
      await loadKeys(true);
      toast('已切换到 db' + db);
    } catch (err) {
      toast('切换数据库失败：' + err.message, true);
    }
  }

  function bindEvents() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        state.tab = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('is-active', item === tab));
        $('panel-detail').classList.toggle('hidden', state.tab !== 'detail');
        $('panel-cli').classList.toggle('hidden', state.tab !== 'cli');
        if (state.tab === 'cli') $('cli-input').focus();
      });
    });

    let patternTimer = 0;
    $('key-pattern').addEventListener('input', (event) => {
      clearTimeout(patternTimer);
      patternTimer = setTimeout(() => {
        state.pattern = event.target.value.trim() || '*';
        state.keys = [];
        state.cursor = '0';
        loadKeys(true);
      }, 320);
    });

    $('key-pattern').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        state.pattern = event.target.value.trim() || '*';
        state.keys = [];
        state.cursor = '0';
        loadKeys(true);
      }
    });

    $('type-filter').addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      state.typeFilter = chip.dataset.type;
      document.querySelectorAll('#type-filter .chip').forEach((item) => item.classList.toggle('is-active', item === chip));
      renderKeyList();
    });

    $('btn-more').addEventListener('click', () => loadKeys(false));

    $('db-select').addEventListener('change', (event) => {
      selectDb(Number(event.target.value) || 0);
    });

    $('btn-refresh').addEventListener('click', async () => {
      try {
        await refreshMeta();
        await loadKeys(true);
        if (state.key && state.key.type !== 'none') await selectKey(state.key.name);
        toast('已刷新');
      } catch (err) {
        toast(err.message, true);
      }
    });

    $('btn-refresh-key').addEventListener('click', () => {
      if (state.key) selectKey(state.key.name);
    });

    $('btn-rename').addEventListener('click', () => toggleRename(true));
    $('btn-rename-ok').addEventListener('click', confirmRename);
    $('btn-rename-cancel').addEventListener('click', () => toggleRename(false));
    $('rename-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') confirmRename();
      if (event.key === 'Escape') toggleRename(false);
    });

    $('btn-delete').addEventListener('click', deleteKey);

    $('btn-ttl-apply').addEventListener('click', () => applyTtl(false));
    $('btn-ttl-persist').addEventListener('click', () => applyTtl(true));

    $('btn-new').addEventListener('click', openModal);
    $('btn-new-cancel').addEventListener('click', closeModal);
    $('btn-new-ok').addEventListener('click', createKey);
    $('modal').addEventListener('click', (event) => {
      if (event.target === $('modal')) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('modal').classList.contains('hidden')) closeModal();
    });

    $('btn-cli-run').addEventListener('click', runCli);
    $('cli-input').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        runCli();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (!state.cliHistory.length) return;
        state.cliIndex = state.cliIndex === -1 ? state.cliHistory.length - 1 : Math.max(0, state.cliIndex - 1);
        $('cli-input').value = state.cliHistory[state.cliIndex];
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (state.cliIndex === -1) return;
        state.cliIndex = state.cliIndex + 1;
        if (state.cliIndex >= state.cliHistory.length) {
          state.cliIndex = -1;
          $('cli-input').value = '';
        } else {
          $('cli-input').value = state.cliHistory[state.cliIndex];
        }
      }
    });
  }

  async function init() {
    bindEvents();
    $('cli-out').appendChild(el('div', 'cli-placeholder', '输入 Redis 命令并回车执行，例如 GET user:1、KEYS *、INFO server。'));
    try {
      await refreshMeta();
      await loadKeys(true);
    } catch (err) {
      $('conn-badge').textContent = '连接失败';
      toast('连接 Redis 失败：' + err.message, true);
      emptyEditor('连接失败：' + err.message);
    }
  }

  init();
})();
