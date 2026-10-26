(function () {
  'use strict';

  const MAX_ROWS = 100;
  const MAX_COLS = 40;
  const DEFAULT_STYLE = { bold: false, italic: false, align: 'left', valign: 'middle', fg: '#1f2937', bg: '#ffffff', size: 'normalsize' };
  const FONT_SIZES = { footnotesize: '0.78rem', small: '0.88rem', normalsize: '1rem', large: '1.15rem' };
  const clone = value => JSON.parse(JSON.stringify(value));
  const blankCell = () => ({ text: '', style: { ...DEFAULT_STYLE }, borders: { top: false, right: false, bottom: false, left: false } });
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const columnName = index => {
    let result = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
    return result;
  };

  function element(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') Object.assign(node.style, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
    });
    (Array.isArray(children) ? children : children ? [children] : []).forEach(child => node.append(child));
    return node;
  }

  function mount(host, initialData, onChange) {
    let data = initialData;
    let selection = { r0: 0, c0: 0, r1: 0, c1: 0 };
    let anchor = { r: 0, c: 0 };
    let cursor = { r: 0, c: 0 };
    let structureSelection = null;
    let formatTarget = 'cells';
    let editing = null;
    let draggingSelection = false;
    let resizing = null;
    let destroyed = false;
    let noticeTimer = null;
    const controls = {};

    function ensureData() {
      data.rows = clamp(Math.floor(Number(data.rows) || 1), 1, MAX_ROWS);
      data.cols = clamp(Math.floor(Number(data.cols) || 1), 1, MAX_COLS);
      data.cells = Array.from({ length: data.rows }, (_, r) => Array.from({ length: data.cols }, (_, c) => {
        const cell = data.cells && data.cells[r] && data.cells[r][c] || blankCell();
        cell.text = String(cell.text == null ? '' : cell.text);
        cell.style = { ...DEFAULT_STYLE, ...cell.style };
        cell.borders = { top: false, right: false, bottom: false, left: false, ...cell.borders };
        return cell;
      }));
      data.merges = Array.isArray(data.merges) ? data.merges : [];
      data.colWidths = Array.from({ length: data.cols }, (_, c) => Math.max(0.0001, Number(data.colWidths && data.colWidths[c]) || 1 / data.cols));
      normalizeWidths();
      data.captionStyle = { ...DEFAULT_STYLE, ...data.captionStyle };
      data.caption = String(data.caption || '');
      data.label = String(data.label || '');
      data.width = clamp(Number(data.width) || 1, 0.2, 1);
      data.mode = data.mode === 'tabular' ? 'tabular' : 'tabularx';
      data.span = data.span === 'double' ? 'double' : 'single';
      data.borderPreset = data.borderPreset || 'booktabs';
    }

    function normalizeWidths() {
      const total = data.colWidths.reduce((sum, value) => sum + value, 0);
      data.colWidths = data.colWidths.map(value => value / total);
    }

    const root = element('div', { class: 'table-editor' });
    const essentialStyle = element('style', { text: `
      .table-editor .table-grid { border-collapse:collapse; table-layout:fixed; width:100%; }
      .table-editor .table-grid .table-cell { position:relative; min-width:0; padding:10px 12px; overflow-wrap:anywhere; cursor:cell; }
      .table-editor .cell-content { min-height:1.5em; white-space:pre-wrap; outline:none; }
      .table-editor .cell-content[contenteditable="true"] { cursor:text; min-width:1px; }
      .table-editor .table-cell.cell-selected { box-shadow:inset 0 0 0 1000px rgba(13,148,136,.075); }
      .table-editor .table-cell.cell-active { outline:2px solid #0d9488; outline-offset:-2px; z-index:2; }
      .table-editor .table-cell.cell-editing { outline:2px solid #0d9488; outline-offset:-2px; z-index:3; box-shadow:none; }
      .table-editor .grid-column-heading,.table-editor .grid-row-heading,.table-editor .grid-corner { background:#f4f7f6; color:#73827e; font:500 10px/1.5 ui-sans-serif,sans-serif; text-align:center; user-select:none; }
      .table-editor .grid-column-heading { position:relative; height:25px; padding:2px 4px; border-bottom:8px solid white; cursor:pointer; }
      .table-editor .grid-row-heading { width:30px; padding:4px; border-right:8px solid white; cursor:pointer; }
      .table-editor .grid-corner { width:30px; border-right:8px solid white; border-bottom:8px solid white; cursor:pointer; }
      .table-editor .column-resizer { position:absolute; right:-4px; top:0; bottom:8px; width:9px; cursor:col-resize; z-index:5; touch-action:none; }
      .table-editor .column-resizer:hover { background:rgba(13,148,136,.25); }
      .table-editor .table-grid:focus { outline:none; }
      .table-editor .table-sheet { width:100%; min-width:220px; }
      .table-editor .table-caption { display:inline; outline:none; white-space:pre-wrap; overflow-wrap:anywhere; }
      .table-editor .table-caption:empty::before { content:attr(data-placeholder); color:#9ca3af; }
      .table-editor .table-caption:focus { background:#f0fdfa; box-shadow:0 2px 0 #0d9488; }
      .table-editor .table-caption-line { margin:0 0 18px 30px; }
      .table-editor .table-caption-prefix { color:#64736e; user-select:none; }
      .table-editor .column-width-controls { display:flex; flex-wrap:wrap; gap:8px; }
      .table-editor .column-width-field { display:flex; align-items:center; gap:5px; font-size:11px; color:#64736e; }
      .table-editor .column-width-field input { width:64px; padding:5px 6px; }
      .table-editor .table-notice { min-height:1.4em; color:#0f766e; font-size:12px; }
      .table-editor .format-color { display:flex; align-items:center; gap:5px; font-size:12px; }
      .table-editor .format-color input { width:30px; height:30px; padding:2px; cursor:pointer; }
      .table-editor .toolbar-group { display:flex; align-items:center; flex-wrap:wrap; gap:6px; }
      .table-editor .table-toolbar-divider { width:1px; height:24px; background:#e2e8e5; margin:0 4px; }
      .table-editor .table-selection-summary { font-size:12px; color:#667871; }
      .table-editor .table-actions { display:flex; flex-wrap:wrap; gap:6px; }
      .table-editor .table-actions button { font-size:12px; }
      .table-editor .table-paper { overflow:auto; }
      .table-editor .table-paper::before { display:none; }
      .table-editor .table-column-panel { margin-top:12px; padding:10px 14px; border:1px solid #e0e6df; border-radius:9px; background:#fafbf8; }
      .table-editor .table-column-panel summary { cursor:pointer; font-size:12px; color:#647b69; }
      .table-editor .table-column-panel .table-help { margin:9px 0 0; }
      .table-editor .table-preview-stage { min-width:300px; padding:8px 0; }
      .table-editor .table-sheet { margin-left:auto; margin-right:auto; }
      .table-editor .table-preview-meta { display:flex; justify-content:space-between; gap:8px; margin-bottom:18px; color:#97a49d; font-size:10px; letter-spacing:.08em; }
      .table-editor .table-options { display:flex; flex-wrap:wrap; align-items:end; gap:12px; }
      .table-editor .table-options .field { min-width:110px; }
      .table-editor .table-options .table-label-field { flex:1; min-width:160px; }
      .table-editor .width-input-pair { display:flex; align-items:center; gap:8px; }
      .table-editor .width-input-pair input[type="range"] { width:115px; }
      .table-editor .width-input-pair input[type="number"] { width:66px; }
      .table-editor .table-help { font-size:11px; line-height:1.6; }
      .table-editor button[aria-pressed="true"] { background:#d9f2eb; color:#0f766e; border-color:#8ed6c3; }
      .table-editor .table-header-toggle { display:flex; align-items:center; gap:6px; font-size:12px; }
      .table-editor .table-header-toggle input { width:auto; }
      @media(max-width:600px) { .table-editor .table-options { gap:8px; } .table-editor .table-options .field { flex:1; } }
    ` });
    root.append(essentialStyle);

    function button(text, handler, attrs) {
      return element('button', { type: 'button', text, ...attrs, onclick: handler });
    }
    function field(text, input, className) {
      return element('label', { class: 'field' + (className ? ' ' + className : '') }, [element('span', { text }), input]);
    }
    function select(options, label, handler) {
      return element('select', { 'aria-label': label, onchange: handler }, options.map(([value, text]) => element('option', { value, text })));
    }
    function emit() {
      if (!destroyed && typeof onChange === 'function') onChange(data);
    }
    function notify(message) {
      notice.textContent = message;
      clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { if (!destroyed) notice.textContent = ''; }, 6000);
    }
    function commit(change) {
      finishEditing(true);
      change();
      renderAll();
      emit();
    }

    const options = element('div', { class: 'editor-panel table-layout-controls table-options' });
    controls.mode = select([['tabularx', 'tabularx · 自动铺满'], ['tabular', 'tabular · 固定列宽']], '表格环境', () => commit(() => { data.mode = controls.mode.value; }));
    controls.span = select([['single', '单栏'], ['double', '横跨双栏']], '表格跨栏', () => commit(() => { data.span = controls.span.value; }));
    controls.width = element('input', { type: 'range', min: 20, max: 100, step: 1, 'aria-label': '表格整体宽度百分比' });
    controls.widthNumber = element('input', { type: 'number', min: 20, max: 100, step: 1, 'aria-label': '整体宽度百分比' });
    controls.width.addEventListener('input', () => { controls.widthNumber.value = controls.width.value; sheet.style.width = controls.width.value + '%'; });
    controls.width.addEventListener('change', () => commit(() => { data.width = Number(controls.width.value) / 100; }));
    controls.widthNumber.addEventListener('change', () => commit(() => { data.width = clamp(Number(controls.widthNumber.value) || 100, 20, 100) / 100; }));
    controls.label = element('input', { type: 'text', placeholder: 'tab:results', 'aria-label': '表格 label', onchange: () => commit(() => { data.label = controls.label.value; }) });
    options.append(field('表格环境', controls.mode), field('栏布局', controls.span), field('整体宽度 · % linewidth', element('div', { class: 'width-input-pair' }, [controls.width, controls.widthNumber])), field('引用标签 · label', controls.label, 'table-label-field'));
    root.append(options);

    const toolbar = element('div', { class: 'editor-toolbar table-format-toolbar', 'aria-label': '表格格式工具栏' });
    controls.target = select([['cells', '所选单元格'], ['caption', '整组 caption']], '格式应用对象', () => { finishEditing(true); formatTarget = controls.target.value; updateControls(); });
    controls.bold = button('B', () => applyStyle('bold', !everyStyle('bold', true)), { title: '加粗', 'aria-label': '加粗', style: { fontWeight: '700' } });
    controls.italic = button('I', () => applyStyle('italic', !everyStyle('italic', true)), { title: '斜体', 'aria-label': '斜体', style: { fontStyle: 'italic' } });
    controls.align = select([['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], '水平对齐', () => applyStyle('align', controls.align.value));
    controls.valign = select([['top', '顶端对齐'], ['middle', '垂直居中'], ['bottom', '底端对齐']], '垂直对齐', () => applyStyle('valign', controls.valign.value));
    controls.size = select([['footnotesize', '较小'], ['small', '小号'], ['normalsize', '正文'], ['large', '大号']], '文字大小', () => applyStyle('size', controls.size.value));
    controls.fg = element('input', { type: 'color', 'aria-label': '文字颜色', onchange: () => applyStyle('fg', controls.fg.value) });
    controls.bg = element('input', { type: 'color', 'aria-label': '单元格背景颜色', onchange: () => applyStyle('bg', controls.bg.value) });
    toolbar.append(controls.target, element('span', { class: 'table-toolbar-divider' }), controls.bold, controls.italic, controls.size, controls.align, controls.valign, element('label', { class: 'format-color' }, [element('span', { text: '文字' }), controls.fg]), element('label', { class: 'format-color' }, [element('span', { text: '填充' }), controls.bg]));
    root.append(toolbar);

    const structure = element('div', { class: 'editor-toolbar table-structure-toolbar' });
    const actions = element('div', { class: 'table-actions' });
    controls.addRow = button('＋ 行', () => insertRows(selection.r1 + 1, 1), { title: '在所选区域下方插入一行' });
    controls.addCol = button('＋ 列', () => insertColumns(selection.c1 + 1, 1), { title: '在所选区域右侧插入一列' });
    controls.delRow = button('删除行', deleteRows, { title: '删除所选区域对应的行' });
    controls.delCol = button('删除列', deleteColumns, { title: '删除所选区域对应的列' });
    controls.merge = button('合并', mergeSelection, { title: '合并所选矩形区域；被覆盖内容会保留' });
    controls.split = button('拆分', splitSelection, { title: '拆分所选区域中的合并单元格' });
    actions.append(controls.addRow, controls.addCol, controls.delRow, controls.delCol, controls.merge, controls.split);
    controls.preset = select([['booktabs', '三线表'], ['grid', '完整网格'], ['none', '无边框'], ['custom', '自定义边框']], '边框预设', () => commit(() => {
      if (controls.preset.value === 'custom') materializeBorders();
      data.borderPreset = controls.preset.value;
    }));
    controls.header = element('input', { type: 'checkbox', 'aria-label': '第一行作为表头', onchange: () => commit(() => { data.header = controls.header.checked; }) });
    structure.append(actions, element('span', { class: 'table-toolbar-divider' }), controls.preset, element('label', { class: 'table-header-toggle' }, [controls.header, element('span', { text: '首行表头' })]));
    root.append(structure);

    const borders = element('div', { class: 'editor-toolbar table-border-toolbar', 'aria-label': '单元格边框' });
    borders.append(element('span', { class: 'muted', text: '区域边框' }));
    ['top', 'right', 'bottom', 'left'].forEach((edge, index) => {
      controls['border_' + edge] = button(['上', '右', '下', '左'][index], () => toggleEdge(edge), { title: ['上边框', '右边框', '下边框', '左边框'][index], 'aria-label': ['上边框', '右边框', '下边框', '左边框'][index] });
      borders.append(controls['border_' + edge]);
    });
    controls.borderAll = button('所有边框', () => setAllBorders(true));
    controls.borderNone = button('清除边框', () => setAllBorders(false));
    borders.append(controls.borderAll, controls.borderNone);
    const selectionSummary = element('div', { class: 'table-selection-summary', 'aria-live': 'polite' });
    borders.append(selectionSummary);
    root.append(borders);

    const paper = element('div', { class: 'paper-preview table-paper' });
    const previewMeta = element('div', { class: 'table-preview-meta' }, [element('span', { text: 'TABLE PREVIEW' }), element('span', { text: 'LAYOUT & STYLE' })]);
    const stage = element('div', { class: 'table-preview-stage' });
    const sheet = element('div', { class: 'table-sheet' });
    const captionLine = element('div', { class: 'table-caption-line' });
    const caption = element('div', { class: 'table-caption', contenteditable: 'true', role: 'textbox', 'aria-label': '表格总 caption', 'data-placeholder': '单击输入表格说明…', spellcheck: 'false' });
    captionLine.append(element('span', { class: 'table-caption-prefix', text: '表 1.  ' }), caption);
    const gridHost = element('div', { class: 'table-grid-host' });
    sheet.append(captionLine, gridHost);
    stage.append(sheet);
    paper.append(previewMeta, stage);
    root.append(paper);

    const widthPanel = element('details', { class: 'editor-panel table-column-panel' });
    const widthSummary = element('summary', { text: '列宽比例' });
    const widthHelp = element('p', { class: 'muted table-help', text: '拖动列名之间的分隔线，或输入百分比。修改一列时，其他列按比例调整；总和始终为 100%。' });
    const widthControls = element('div', { class: 'column-width-controls' });
    widthPanel.append(widthSummary, widthHelp, widthControls);
    root.append(widthPanel);
    const notice = element('div', { class: 'table-notice', role: 'status', 'aria-live': 'polite' });
    root.append(notice, element('p', { class: 'muted table-help', text: '单击选择，Shift + 单击或拖动选择区域；双击、Enter 或直接输入文字进行编辑。支持从电子表格复制并粘贴多行多列。Shift + Enter 在单元格内换行。' }));
    host.replaceChildren(root);

    function mergeAt(r, c) {
      return data.merges.find(m => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);
    }
    function masterAt(r, c) {
      const merged = mergeAt(r, c);
      return merged ? { r: merged.r, c: merged.c } : { r, c };
    }
    function intersects(merge, range) {
      return merge.r <= range.r1 && merge.r + merge.rs > range.r0 && merge.c <= range.c1 && merge.c + merge.cs > range.c0;
    }
    function normalizedSelection(range) {
      const result = { r0: clamp(Math.min(range.r0, range.r1), 0, data.rows - 1), c0: clamp(Math.min(range.c0, range.c1), 0, data.cols - 1), r1: clamp(Math.max(range.r0, range.r1), 0, data.rows - 1), c1: clamp(Math.max(range.c0, range.c1), 0, data.cols - 1) };
      let expanded;
      do {
        expanded = false;
        data.merges.forEach(merge => {
          if (!intersects(merge, result)) return;
          const next = { r0: Math.min(result.r0, merge.r), c0: Math.min(result.c0, merge.c), r1: Math.max(result.r1, merge.r + merge.rs - 1), c1: Math.max(result.c1, merge.c + merge.cs - 1) };
          if (Object.keys(next).some(key => next[key] !== result[key])) { Object.assign(result, next); expanded = true; }
        });
      } while (expanded);
      return result;
    }
    function setSelection(r, c, extend) {
      r = clamp(r, 0, data.rows - 1);
      c = clamp(c, 0, data.cols - 1);
      cursor = { r, c };
      structureSelection = null;
      if (!extend) anchor = { r, c };
      selection = normalizedSelection({ r0: anchor.r, c0: anchor.c, r1: r, c1: c });
      formatTarget = 'cells';
      updateSelection();
      updateControls();
    }
    function eachSelected(fn) {
      for (let r = selection.r0; r <= selection.r1; r++) for (let c = selection.c0; c <= selection.c1; c++) fn(data.cells[r][c], r, c);
    }
    function everyStyle(key, value) {
      if (formatTarget === 'caption') return data.captionStyle[key] === value;
      let result = true;
      eachSelected(cell => { if (cell.style[key] !== value) result = false; });
      return result;
    }
    function applyStyle(key, value) {
      commit(() => {
        if (formatTarget === 'caption') data.captionStyle[key] = value;
        else eachSelected(cell => { cell.style[key] = value; });
      });
    }
    function applyVisualStyle(node, style) {
      node.style.fontWeight = style.bold ? '700' : '400';
      node.style.fontStyle = style.italic ? 'italic' : 'normal';
      node.style.textAlign = style.align || 'left';
      node.style.color = style.fg || DEFAULT_STYLE.fg;
      node.style.fontSize = FONT_SIZES[style.size] || FONT_SIZES.normalsize;
    }
    function effectiveBorders(r, c, rs) {
      if (data.borderPreset === 'grid') return { top: true, right: true, bottom: true, left: true };
      if (data.borderPreset === 'booktabs') return { top: r === 0, right: false, bottom: r + rs === data.rows || data.header !== false && r === 0, left: false };
      if (data.borderPreset === 'none') return { top: false, right: false, bottom: false, left: false };
      return data.cells[r][c].borders;
    }
    function materializeBorders() {
      if (data.borderPreset === 'custom') return;
      for (let r = 0; r < data.rows; r++) for (let c = 0; c < data.cols; c++) data.cells[r][c].borders = { ...effectiveBorders(r, c, mergeAt(r, c)?.rs || 1) };
      data.borderPreset = 'custom';
    }
    function edgeCells(edge) {
      const positions = [];
      eachSelected((cell, r, c) => {
        if (edge === 'top' && r === selection.r0 || edge === 'bottom' && r === selection.r1 || edge === 'left' && c === selection.c0 || edge === 'right' && c === selection.c1) {
          const master = masterAt(r, c);
          if (!positions.some(p => p.r === master.r && p.c === master.c)) positions.push(master);
        }
      });
      return positions;
    }
    function clearAdjacentEdge(r, c, edge) {
      const merge = mergeAt(r, c) || { r, c, rs: 1, cs: 1 };
      const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }[edge];
      const positions = [];
      if (edge === 'top' || edge === 'bottom') for (let col = merge.c; col < merge.c + merge.cs; col++) positions.push({ r: edge === 'top' ? merge.r - 1 : merge.r + merge.rs, c: col });
      else for (let row = merge.r; row < merge.r + merge.rs; row++) positions.push({ r: row, c: edge === 'left' ? merge.c - 1 : merge.c + merge.cs });
      positions.forEach(p => { if (p.r >= 0 && p.r < data.rows && p.c >= 0 && p.c < data.cols) { const master = masterAt(p.r, p.c); data.cells[master.r][master.c].borders[opposite] = false; } });
    }
    function toggleEdge(edge) {
      commit(() => {
        const positions = edgeCells(edge);
        const enabled = !positions.every(p => effectiveBorders(p.r, p.c, mergeAt(p.r, p.c)?.rs || 1)[edge]);
        materializeBorders();
        positions.forEach(p => { data.cells[p.r][p.c].borders[edge] = enabled; if (!enabled) clearAdjacentEdge(p.r, p.c, edge); });
      });
    }
    function setAllBorders(enabled) {
      commit(() => {
        materializeBorders();
        eachSelected((cell, r, c) => {
          Object.keys(cell.borders).forEach(edge => { cell.borders[edge] = enabled; if (!enabled) clearAdjacentEdge(r, c, edge); });
        });
      });
    }

    function updateSelection() {
      gridHost.querySelectorAll('.table-cell').forEach(td => {
        const r = Number(td.dataset.r), c = Number(td.dataset.c);
        td.classList.toggle('cell-selected', r >= selection.r0 && r <= selection.r1 && c >= selection.c0 && c <= selection.c1);
        const master = masterAt(cursor.r, cursor.c);
        td.classList.toggle('cell-active', r === master.r && c === master.c);
        td.setAttribute('aria-selected', String(td.classList.contains('cell-selected')));
      });
      const start = columnName(selection.c0) + (selection.r0 + 1), end = columnName(selection.c1) + (selection.r1 + 1);
      selectionSummary.textContent = structureSelection ? (structureSelection.axis === 'row' ? '整行 ' + (structureSelection.start + 1) + (structureSelection.start === structureSelection.end ? '' : '–' + (structureSelection.end + 1)) : '整列 ' + columnName(structureSelection.start) + (structureSelection.start === structureSelection.end ? '' : '–' + columnName(structureSelection.end))) : (start === end ? start : start + ':' + end) + ' · ' + (selection.r1 - selection.r0 + 1) + ' 行 × ' + (selection.c1 - selection.c0 + 1) + ' 列';
    }
    function updateControls() {
      const style = formatTarget === 'caption' ? data.captionStyle : data.cells[selection.r0][selection.c0].style;
      controls.target.value = formatTarget;
      controls.bold.setAttribute('aria-pressed', String(everyStyle('bold', true)));
      controls.italic.setAttribute('aria-pressed', String(everyStyle('italic', true)));
      controls.align.value = style.align;
      controls.valign.value = style.valign;
      controls.size.value = style.size;
      controls.fg.value = style.fg;
      controls.bg.value = style.bg;
      controls.valign.disabled = controls.bg.disabled = formatTarget === 'caption';
      controls.mode.value = data.mode;
      controls.span.value = data.span;
      controls.width.value = controls.widthNumber.value = String(Math.round(data.width * 100));
      if (document.activeElement !== controls.label) controls.label.value = data.label;
      controls.preset.value = data.borderPreset;
      controls.header.checked = data.header !== false;
      controls.addRow.disabled = data.rows >= MAX_ROWS;
      controls.addCol.disabled = data.cols >= MAX_COLS;
      const selectedRows = structureSelection?.axis === 'row' ? structureSelection.end - structureSelection.start + 1 : selection.r1 - selection.r0 + 1;
      const selectedCols = structureSelection?.axis === 'column' ? structureSelection.end - structureSelection.start + 1 : selection.c1 - selection.c0 + 1;
      controls.delRow.disabled = selectedRows >= data.rows;
      controls.delCol.disabled = selectedCols >= data.cols;
      const selectedMerge = data.merges.find(m => m.r === selection.r0 && m.c === selection.c0 && m.r + m.rs - 1 === selection.r1 && m.c + m.cs - 1 === selection.c1);
      controls.merge.disabled = selection.r0 === selection.r1 && selection.c0 === selection.c1 || !!selectedMerge;
      controls.split.disabled = !data.merges.some(m => intersects(m, selection));
      ['top', 'right', 'bottom', 'left'].forEach(edge => {
        controls['border_' + edge].disabled = formatTarget === 'caption';
        controls['border_' + edge].setAttribute('aria-pressed', String(edgeCells(edge).every(p => effectiveBorders(p.r, p.c, mergeAt(p.r, p.c)?.rs || 1)[edge])));
      });
      controls.borderAll.disabled = controls.borderNone.disabled = formatTarget === 'caption';
    }

    function renderGrid() {
      const grid = element('table', { class: 'table-grid', role: 'grid', tabindex: '0', 'aria-label': '可视化表格编辑器', 'aria-rowcount': data.rows, 'aria-colcount': data.cols });
      const columns = element('colgroup');
      columns.append(element('col', { style: { width: '30px' } }));
      data.colWidths.forEach((width, c) => columns.append(element('col', { 'data-column': c, style: { width: (width * 100) + '%' } })));
      grid.append(columns);
      const head = element('thead');
      const labels = element('tr');
      labels.append(element('th', { class: 'grid-corner', text: '↘', 'aria-label': '选择全部单元格', title: '选择整个表格' }));
      for (let c = 0; c < data.cols; c++) {
        const heading = element('th', { class: 'grid-column-heading', scope: 'col', 'data-col-heading': c, text: columnName(c), title: '选择 ' + columnName(c) + ' 列' });
        if (c < data.cols - 1) heading.append(element('span', { class: 'column-resizer', 'data-resize': c, role: 'separator', 'aria-orientation': 'vertical', 'aria-label': '拖动调整 ' + columnName(c) + ' 列宽度' }));
        labels.append(heading);
      }
      head.append(labels);
      grid.append(head);
      const body = element('tbody');
      for (let r = 0; r < data.rows; r++) {
        const row = element('tr');
        row.append(element('th', { class: 'grid-row-heading', scope: 'row', 'data-row-heading': r, text: String(r + 1), title: '选择第 ' + (r + 1) + ' 行' }));
        for (let c = 0; c < data.cols; c++) {
          const merge = mergeAt(r, c);
          if (merge && (merge.r !== r || merge.c !== c)) continue;
          const cell = data.cells[r][c], rs = merge ? merge.rs : 1, cs = merge ? merge.cs : 1;
          const td = element('td', { class: 'table-cell', 'data-r': r, 'data-c': c, rowspan: rs, colspan: cs, role: 'gridcell', 'aria-label': columnName(c) + (r + 1), 'aria-rowindex': r + 1, 'aria-colindex': c + 1 });
          applyVisualStyle(td, cell.style);
          td.style.backgroundColor = cell.style.bg;
          td.style.verticalAlign = cell.style.valign;
          const edges = effectiveBorders(r, c, rs);
          ['top', 'right', 'bottom', 'left'].forEach(edge => {
            const heavy = data.borderPreset === 'booktabs' && (edge === 'top' && r === 0 || edge === 'bottom' && r + rs === data.rows);
            td.style['border' + edge[0].toUpperCase() + edge.slice(1)] = (heavy ? '2px' : '1px') + ' solid ' + (edges[edge] ? '#53625c' : 'transparent');
          });
          td.append(element('div', { class: 'cell-content', text: cell.text, spellcheck: 'false' }));
          row.append(td);
        }
        body.append(row);
      }
      grid.append(body);
      gridHost.replaceChildren(grid);
      updateSelection();
    }

    function renderColumnWidths() {
      widthControls.replaceChildren();
      data.colWidths.forEach((width, c) => {
        const input = element('input', { type: 'number', min: 0.5, max: 100, step: 0.1, value: (width * 100).toFixed(1), 'aria-label': columnName(c) + ' 列宽百分比', 'data-width-col': c, onchange: () => {
          const requested = Number(input.value) / 100;
          if (!Number.isFinite(requested)) { renderColumnWidths(); return; }
          commit(() => {
            if (data.cols === 1) { data.colWidths[0] = 1; return; }
            const target = clamp(requested, 0.005, 1 - 0.005 * (data.cols - 1));
            const others = 1 - data.colWidths[c];
            data.colWidths = data.colWidths.map((value, index) => index === c ? target : value / others * (1 - target));
            normalizeWidths();
          });
        } });
        widthControls.append(element('label', { class: 'column-width-field' }, [element('span', { text: columnName(c) }), input, element('span', { text: '%' })]));
      });
    }
    function renderCaption() {
      if (document.activeElement !== caption) caption.textContent = data.caption;
      applyVisualStyle(captionLine, data.captionStyle);
      sheet.style.width = (data.width * 100) + '%';
      previewMeta.lastChild.textContent = (data.span === 'double' ? '横跨双栏' : '单栏') + ' · ' + Math.round(data.width * 100) + '% LINEWIDTH';
    }
    function renderAll() {
      selection = normalizedSelection(selection);
      cursor.r = clamp(cursor.r, 0, data.rows - 1);
      cursor.c = clamp(cursor.c, 0, data.cols - 1);
      renderGrid();
      renderColumnWidths();
      renderCaption();
      updateControls();
    }

    function finishEditing(save) {
      if (!editing) return;
      const current = editing;
      editing = null;
      const text = current.content.innerText.replace(/\r/g, '');
      current.content.contentEditable = 'false';
      current.td.classList.remove('cell-editing');
      if (save && text !== current.original) {
        data.cells[current.r][current.c].text = text;
        current.content.textContent = text;
        emit();
      } else current.content.textContent = save ? text : current.original;
    }
    function startEditing(replacement) {
      finishEditing(true);
      const master = masterAt(cursor.r, cursor.c);
      const td = gridHost.querySelector('[data-r="' + master.r + '"][data-c="' + master.c + '"]');
      if (!td) return;
      const content = td.querySelector('.cell-content');
      editing = { r: master.r, c: master.c, content, td, original: data.cells[master.r][master.c].text };
      td.classList.add('cell-editing');
      content.contentEditable = 'true';
      if (replacement !== undefined) content.textContent = replacement;
      content.focus();
      const range = document.createRange();
      range.selectNodeContents(content);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    function focusGrid() {
      gridHost.querySelector('.table-grid')?.focus({ preventScroll: true });
    }
    function insertPlainText(text) {
      const selectionObject = window.getSelection();
      if (!selectionObject || !selectionObject.rangeCount) return;
      const range = selectionObject.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
      selectionObject.removeAllRanges();
      selectionObject.addRange(range);
    }

    function insertRows(index, count) {
      if (data.rows >= MAX_ROWS) { notify('原型最多支持 100 行。'); return; }
      commit(() => {
        count = Math.min(count, MAX_ROWS - data.rows);
        data.cells.splice(index, 0, ...Array.from({ length: count }, () => Array.from({ length: data.cols }, blankCell)));
        data.merges.forEach(m => { if (index <= m.r) m.r += count; else if (index < m.r + m.rs) m.rs += count; });
        data.rows += count;
        structureSelection = null;
        anchor = cursor = { r: index, c: selection.c0 };
        selection = { r0: index, r1: index + count - 1, c0: selection.c0, c1: selection.c1 };
      });
      focusGrid();
    }
    function insertColumns(index, count) {
      if (data.cols >= MAX_COLS) { notify('原型最多支持 40 列。'); return; }
      commit(() => {
        count = Math.min(count, MAX_COLS - data.cols);
        data.cells.forEach(row => row.splice(index, 0, ...Array.from({ length: count }, blankCell)));
        data.merges.forEach(m => { if (index <= m.c) m.c += count; else if (index < m.c + m.cs) m.cs += count; });
        const newCount = data.cols + count;
        data.colWidths = data.colWidths.map(value => value * data.cols / newCount);
        data.colWidths.splice(index, 0, ...Array(count).fill(1 / newCount));
        data.cols = newCount;
        structureSelection = null;
        normalizeWidths();
        anchor = cursor = { r: selection.r0, c: index };
        selection = { r0: selection.r0, r1: selection.r1, c0: index, c1: index + count - 1 };
      });
      focusGrid();
    }
    function deleteRows() {
      const start = structureSelection?.axis === 'row' ? structureSelection.start : selection.r0, end = structureSelection?.axis === 'row' ? structureSelection.end : selection.r1, count = end - start + 1;
      if (count >= data.rows) { notify('表格至少保留一行。'); return; }
      commit(() => {
        const oldCells = data.cells, oldMerges = data.merges;
        data.cells = oldCells.filter((_, r) => r < start || r > end);
        data.rows -= count;
        data.merges = oldMerges.flatMap(m => {
          const remaining = Array.from({ length: m.rs }, (_, offset) => m.r + offset).filter(r => r < start || r > end);
          if (!remaining.length) return [];
          const newR = remaining[0] > end ? remaining[0] - count : remaining[0];
          if (m.r >= start && m.r <= end) data.cells[newR][m.c] = clone(oldCells[m.r][m.c]);
          return remaining.length * m.cs > 1 ? [{ ...m, r: newR, rs: remaining.length }] : [];
        });
        const r = Math.min(start, data.rows - 1);
        structureSelection = null;
        anchor = cursor = { r, c: selection.c0 };
        selection = { r0: r, r1: r, c0: selection.c0, c1: selection.c1 };
      });
      focusGrid();
    }
    function deleteColumns() {
      const start = structureSelection?.axis === 'column' ? structureSelection.start : selection.c0, end = structureSelection?.axis === 'column' ? structureSelection.end : selection.c1, count = end - start + 1;
      if (count >= data.cols) { notify('表格至少保留一列。'); return; }
      commit(() => {
        const oldCells = data.cells, oldMerges = data.merges;
        data.cells = oldCells.map(row => row.filter((_, c) => c < start || c > end));
        data.cols -= count;
        data.colWidths = data.colWidths.filter((_, c) => c < start || c > end);
        normalizeWidths();
        data.merges = oldMerges.flatMap(m => {
          const remaining = Array.from({ length: m.cs }, (_, offset) => m.c + offset).filter(c => c < start || c > end);
          if (!remaining.length) return [];
          const newC = remaining[0] > end ? remaining[0] - count : remaining[0];
          if (m.c >= start && m.c <= end) data.cells[m.r][newC] = clone(oldCells[m.r][m.c]);
          return m.rs * remaining.length > 1 ? [{ ...m, c: newC, cs: remaining.length }] : [];
        });
        const c = Math.min(start, data.cols - 1);
        structureSelection = null;
        anchor = cursor = { r: selection.r0, c };
        selection = { r0: selection.r0, r1: selection.r1, c0: c, c1: c };
      });
      focusGrid();
    }
    function mergeSelection() {
      if (controls.merge.disabled) return;
      commit(() => {
        data.merges = data.merges.filter(m => !intersects(m, selection));
        data.merges.push({ r: selection.r0, c: selection.c0, rs: selection.r1 - selection.r0 + 1, cs: selection.c1 - selection.c0 + 1 });
        cursor = { r: selection.r0, c: selection.c0 };
      });
      notify('已合并。被覆盖的单元格内容会在拆分后恢复。');
      focusGrid();
    }
    function splitSelection() {
      if (controls.split.disabled) return;
      commit(() => { data.merges = data.merges.filter(m => !intersects(m, selection)); });
      focusGrid();
    }

    function parseTSV(text) {
      const rows = [], row = [];
      let fieldValue = '', quoted = false;
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"' && (quoted || fieldValue === '')) {
          if (quoted && text[i + 1] === '"') { fieldValue += '"'; i++; }
          else quoted = !quoted;
        } else if (!quoted && (char === '\t' || char === '\n' || char === '\r')) {
          row.push(fieldValue); fieldValue = '';
          if (char !== '\t') { rows.push(row.splice(0)); if (char === '\r' && text[i + 1] === '\n') i++; }
        } else fieldValue += char;
      }
      row.push(fieldValue);
      if (row.length > 1 || row[0] !== '' || !rows.length) rows.push(row);
      return rows;
    }
    function pasteMatrix(text) {
      const matrix = parseTSV(text);
      const startR = selection.r0, startC = selection.c0;
      const matrixWidth = matrix.reduce((max, row) => Math.max(max, row.length), 0);
      const height = Math.min(matrix.length, MAX_ROWS - startR), width = Math.min(matrixWidth, MAX_COLS - startC);
      commit(() => {
        const neededRows = Math.max(data.rows, startR + height), neededCols = Math.max(data.cols, startC + width);
        while (data.cells.length < neededRows) data.cells.push(Array.from({ length: data.cols }, blankCell));
        data.cells.forEach(row => { while (row.length < neededCols) row.push(blankCell()); });
        if (neededCols !== data.cols) {
          const oldCols = data.cols;
          data.colWidths = data.colWidths.map(value => value * oldCols / neededCols);
          while (data.colWidths.length < neededCols) data.colWidths.push(1 / neededCols);
          normalizeWidths();
        }
        data.rows = neededRows; data.cols = neededCols;
        const range = { r0: startR, c0: startC, r1: startR + height - 1, c1: startC + width - 1 };
        data.merges = data.merges.filter(m => !intersects(m, range));
        for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) data.cells[startR + r][startC + c].text = matrix[r][c] || '';
        selection = range; anchor = { r: startR, c: startC }; cursor = { ...anchor }; structureSelection = null;
      });
      notify('已粘贴 ' + height + ' 行 × ' + width + ' 列' + (height < matrix.length || width < matrixWidth ? '，超出原型尺寸上限的内容已忽略。' : '。'));
      focusGrid();
    }

    gridHost.addEventListener('pointerdown', event => {
      const resizeHandle = event.target.closest('[data-resize]');
      if (resizeHandle) {
        finishEditing(true);
        const index = Number(resizeHandle.dataset.resize), rect = gridHost.querySelector('.table-grid').getBoundingClientRect();
        resizing = { index, x: event.clientX, width: Math.max(1, rect.width - 30), widths: data.colWidths.slice() };
        event.preventDefault();
        return;
      }
      const td = event.target.closest('.table-cell');
      if (td) {
        if (editing && editing.td === td) return;
        finishEditing(true);
        if (event.button !== 0) return;
        setSelection(Number(td.dataset.r), Number(td.dataset.c), event.shiftKey);
        draggingSelection = true;
        focusGrid();
        event.preventDefault();
      } else {
        const col = event.target.closest('[data-col-heading]'), row = event.target.closest('[data-row-heading]'), corner = event.target.closest('.grid-corner');
        if (!col && !row && !corner) return;
        finishEditing(true);
        if (col) { const c = Number(col.dataset.colHeading), start = event.shiftKey && structureSelection?.axis === 'column' ? anchor.c : c; if (!event.shiftKey || structureSelection?.axis !== 'column') anchor = { r: 0, c }; cursor = { r: 0, c }; structureSelection = { axis: 'column', start: Math.min(start, c), end: Math.max(start, c) }; selection = normalizedSelection({ r0: 0, r1: data.rows - 1, c0: start, c1: c }); }
        if (row) { const r = Number(row.dataset.rowHeading), start = event.shiftKey && structureSelection?.axis === 'row' ? anchor.r : r; if (!event.shiftKey || structureSelection?.axis !== 'row') anchor = { r, c: 0 }; cursor = { r, c: 0 }; structureSelection = { axis: 'row', start: Math.min(start, r), end: Math.max(start, r) }; selection = normalizedSelection({ r0: start, r1: r, c0: 0, c1: data.cols - 1 }); }
        if (corner) { anchor = cursor = { r: 0, c: 0 }; structureSelection = null; selection = { r0: 0, c0: 0, r1: data.rows - 1, c1: data.cols - 1 }; }
        formatTarget = 'cells'; updateSelection(); updateControls(); focusGrid(); event.preventDefault();
      }
    });
    gridHost.addEventListener('pointerover', event => {
      if (!draggingSelection || event.buttons !== 1) return;
      const td = event.target.closest('.table-cell');
      if (td) setSelection(Number(td.dataset.r), Number(td.dataset.c), true);
    });
    gridHost.addEventListener('dblclick', event => {
      const td = event.target.closest('.table-cell');
      if (td) { setSelection(Number(td.dataset.r), Number(td.dataset.c), false); startEditing(); }
    });
    gridHost.addEventListener('focusout', event => { if (editing && event.target === editing.content) finishEditing(true); });
    gridHost.addEventListener('keydown', event => {
      if (event.isComposing || event.keyCode === 229 || event.key === 'Process') {
        if (!editing) startEditing('');
        return;
      }
      if (editing) {
        if (event.key === 'Escape') { event.preventDefault(); finishEditing(false); focusGrid(); }
        else if (event.key === 'Enter' && !event.shiftKey || event.key === 'Tab') {
          event.preventDefault(); const move = event.key === 'Tab'; finishEditing(true);
          setSelection(cursor.r + (move ? 0 : 1), cursor.c + (move ? event.shiftKey ? -1 : 1 : 0), false); focusGrid();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault(); structureSelection = null; selection = { r0: 0, c0: 0, r1: data.rows - 1, c1: data.cols - 1 }; updateSelection(); updateControls(); return;
      }
      const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0], Tab: [0, event.shiftKey ? -1 : 1] };
      if (moves[event.key]) {
        event.preventDefault();
        const [dr, dc] = moves[event.key], master = masterAt(cursor.r, cursor.c), merge = mergeAt(cursor.r, cursor.c);
        const r = dr > 0 && merge ? merge.r + merge.rs : dr < 0 ? master.r - 1 : cursor.r;
        const c = dc > 0 && merge ? merge.c + merge.cs : dc < 0 ? master.c - 1 : cursor.c;
        setSelection(r + (dr > 0 && !merge ? dr : 0), c + (dc > 0 && !merge ? dc : 0), event.shiftKey && event.key !== 'Tab');
      } else if (event.key === 'Enter' || event.key === 'F2') { event.preventDefault(); startEditing(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); commit(() => eachSelected(cell => { cell.text = ''; })); focusGrid(); }
      else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); startEditing(event.key); }
    });
    gridHost.addEventListener('paste', event => {
      const text = event.clipboardData?.getData('text/plain');
      if (text === undefined) return;
      event.preventDefault();
      if (editing) insertPlainText(text.replace(/\r\n?/g, '\n'));
      else pasteMatrix(text);
    });
    gridHost.addEventListener('copy', event => {
      if (editing) return;
      const rows = [];
      for (let r = selection.r0; r <= selection.r1; r++) {
        const row = [];
        for (let c = selection.c0; c <= selection.c1; c++) {
          const master = masterAt(r, c);
          const text = master.r === r && master.c === c ? data.cells[r][c].text : '';
          row.push(/[\t\r\n"]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text);
        }
        rows.push(row.join('\t'));
      }
      event.preventDefault(); event.clipboardData.setData('text/plain', rows.join('\n'));
    });
    caption.addEventListener('focus', () => { finishEditing(true); formatTarget = 'caption'; updateControls(); });
    caption.addEventListener('blur', () => {
      const text = caption.innerText.replace(/\r/g, '');
      if (text !== data.caption) { data.caption = text; caption.textContent = text; emit(); }
    });
    caption.addEventListener('paste', event => { event.preventDefault(); insertPlainText(event.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')); });

    function pointerMove(event) {
      if (!resizing) return;
      const index = resizing.index, total = resizing.widths[index] + resizing.widths[index + 1];
      const min = Math.min(0.02, total / 4);
      const left = clamp(resizing.widths[index] + (event.clientX - resizing.x) / resizing.width, min, total - min);
      data.colWidths[index] = left; data.colWidths[index + 1] = total - left;
      gridHost.querySelectorAll('col[data-column]').forEach(col => { col.style.width = (data.colWidths[Number(col.dataset.column)] * 100) + '%'; });
      widthControls.querySelectorAll('[data-width-col]').forEach(input => { input.value = (data.colWidths[Number(input.dataset.widthCol)] * 100).toFixed(1); });
      event.preventDefault();
    }
    function pointerUp() {
      draggingSelection = false;
      if (resizing) {
        const changed = resizing.widths.some((value, index) => Math.abs(value - data.colWidths[index]) > 0.00001);
        resizing = null;
        normalizeWidths();
        if (changed) emit();
      }
    }
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    ensureData();
    renderAll();

    return {
      refresh(nextData) {
        editing = null; resizing = null; draggingSelection = false;
        data = nextData; ensureData();
        structureSelection = null; selection = { r0: 0, c0: 0, r1: 0, c1: 0 }; anchor = cursor = { r: 0, c: 0 };
        renderAll();
      },
      destroy() {
        finishEditing(true);
        destroyed = true;
        clearTimeout(noticeTimer);
        window.removeEventListener('pointermove', pointerMove);
        window.removeEventListener('pointerup', pointerUp);
        window.removeEventListener('pointercancel', pointerUp);
        root.remove();
      }
    };
  }

  window.TableEditor = { mount };
})();
