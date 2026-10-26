(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ToolboxCore = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIMITS = { rows: 100, cols: 40, figureRows: 30, text: 20000, imageData: 16 * 1024 * 1024 };
  var SIZES = ['footnotesize', 'small', 'normalsize', 'large'];
  var DEFAULT_STYLE = { bold: false, italic: false, align: 'left', valign: 'top', fg: '#1f2937', bg: '#ffffff', size: 'small' };
  var CAPTION_STYLE = { bold: false, italic: false, align: 'center', valign: 'top', fg: '#1f2937', bg: '#ffffff', size: 'small' };
  function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function number(value, fallback, min, max) {
    var n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return Math.min(max, Math.max(min, n));
  }
  function integer(value, fallback, min, max) { return Math.round(number(value, fallback, min, max)); }
  function fitWeights(weights, target, minimum) {
    var excess = weights.reduce(function (sum, w) { return sum + w - minimum; }, 0);
    var available = target - weights.length * minimum;
    return excess > 1e-12 ? weights.map(function (w) { return minimum + (w - minimum) / excess * available; }) : weights.map(function () { return target / weights.length; });
  }
  function string(value, fallback, max) { return typeof value === 'string' ? value.replace(/\u0000/g, '').slice(0, max || LIMITS.text) : fallback; }
  function choice(value, list, fallback) { return list.indexOf(value) !== -1 ? value : fallback; }
  function style(value, base) {
    value = record(value) ? value : {};
    base = base || DEFAULT_STYLE;
    return {
      bold: typeof value.bold === 'boolean' ? value.bold : base.bold,
      italic: typeof value.italic === 'boolean' ? value.italic : base.italic,
      align: choice(value.align, ['left', 'center', 'right'], base.align),
      valign: choice(value.valign, ['top', 'middle', 'bottom'], base.valign),
      fg: typeof value.fg === 'string' && /^#[\da-f]{6}$/i.test(value.fg) ? value.fg.toLowerCase() : base.fg,
      bg: typeof value.bg === 'string' && /^#[\da-f]{6}$/i.test(value.bg) ? value.bg.toLowerCase() : base.bg,
      size: choice(value.size, SIZES, base.size)
    };
  }
  function cell(value) {
    value = record(value) ? value : { text: typeof value === 'string' ? value : '' };
    var b = record(value.borders) ? value.borders : {};
    return { text: string(value.text, ''), style: style(value.style), borders: { top: b.top === true, right: b.right === true, bottom: b.bottom === true, left: b.left === true } };
  }
  function makeTable(rows, cols) {
    var cells = Array.from({ length: rows }, function () { return Array.from({ length: cols }, function () { return cell({}); }); });
    return { rows: rows, cols: cols, cells: cells, merges: [], colWidths: Array(cols).fill(1 / cols), mode: 'tabularx', borderPreset: 'booktabs', header: true, caption: '', label: '', captionStyle: style({}, CAPTION_STYLE), span: 'single', width: 1 };
  }
  function normalizeTable(value) {
    value = record(value) ? value : {};
    var cellsInput = Array.isArray(value.cells) ? value.cells : [];
    var inferredCols = cellsInput.slice(0, LIMITS.rows).reduce(function (max, row) { return Math.max(max, Array.isArray(row) ? row.length : 0); }, 0);
    var rows = integer(value.rows, cellsInput.length || 5, 1, LIMITS.rows);
    var cols = integer(value.cols, inferredCols || 4, 1, LIMITS.cols);
    var t = makeTable(rows, cols);
    t.cells = Array.from({ length: rows }, function (_, r) {
      return Array.from({ length: cols }, function (_, c) { return cell(Array.isArray(cellsInput[r]) ? cellsInput[r][c] : undefined); });
    });
    t.mode = choice(value.mode, ['tabular', 'tabularx'], 'tabularx');
    t.borderPreset = choice(value.borderPreset, ['booktabs', 'grid', 'none', 'custom'], 'booktabs');
    t.header = value.header !== false;
    t.caption = string(value.caption, '', 2000);
    t.label = string(value.label, '', 200);
    t.captionStyle = style(value.captionStyle, CAPTION_STYLE);
    t.span = value.span === 'double' ? 'double' : 'single';
    t.width = number(value.width, 1, 0.2, 1);
    var widths = Array.from({ length: cols }, function (_, i) { return number(Array.isArray(value.colWidths) ? value.colWidths[i] : undefined, 1 / cols, 0.001, 1); });
    var sum = widths.reduce(function (a, b) { return a + b; }, 0);
    t.colWidths = Math.abs(sum - 1) < 1e-10 ? widths : fitWeights(widths, 1, 0.001);
    var occupied = Array.from({ length: rows }, function () { return Array(cols).fill(false); });
    (Array.isArray(value.merges) ? value.merges.slice(0, rows * cols) : []).forEach(function (m) {
      if (!record(m) || ![m.r, m.c, m.rs, m.cs].every(Number.isInteger)) return;
      if (m.r < 0 || m.c < 0 || m.rs < 1 || m.cs < 1 || m.r + m.rs > rows || m.c + m.cs > cols || m.rs * m.cs === 1) return;
      for (var r = m.r; r < m.r + m.rs; r++) for (var c = m.c; c < m.c + m.cs; c++) if (occupied[r][c]) return;
      t.merges.push({ r: m.r, c: m.c, rs: m.rs, cs: m.cs });
      for (var rr = m.r; rr < m.r + m.rs; rr++) for (var cc = m.c; cc < m.c + m.cs; cc++) occupied[rr][cc] = true;
    });
    return t;
  }
  function filename(value, fallback) {
    var name = string(value, fallback, 2000).replace(/\\/g, '/').split('/').pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!name || !/\.(png|jpe?g|svg|pdf)$/i.test(name)) return fallback;
    return name;
  }
  function imageSource(value) {
    if (typeof value !== 'string' || value.length > LIMITS.imageData) return '';
    if (/^data:(?:image\/(?:png|jpeg|svg\+xml)|application\/pdf)(?:;[^,]*)?,/i.test(value)) return value;
    return '';
  }
  function figureBudget(row, gap) {
    var items = record(row) && Array.isArray(row.items) ? row.items : [];
    var total = items.reduce(function (sum, item) { return sum + (record(item) && typeof item.width === 'number' && Number.isFinite(item.width) ? Math.max(0, item.width) : 0); }, 0) + number(gap, 0.02, 0, 0.15) * Math.max(0, items.length - 1);
    return { total: total, remaining: 1 - total, overflow: total > 1 + 1e-8 };
  }
  function normalizeFigure(value) {
    value = record(value) ? value : {};
    var gap = number(value.gap, 0.02, 0, 0.15);
    var used = new Set();
    function id(raw, fallback) {
      var candidate = string(raw, fallback, 80).replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!candidate) candidate = fallback;
      var result = candidate, n = 2;
      while (used.has(result)) result = candidate + '-' + n++;
      used.add(result);
      return result;
    }
    var rows = (Array.isArray(value.rows) ? value.rows : []).slice(0, LIMITS.figureRows).map(function (row, ri) {
      row = record(row) ? row : {};
      var sourceItems = Array.isArray(row.items) ? row.items.slice(0, 3) : [];
      var ideal = (1 - Math.max(0, sourceItems.length - 1) * gap) / (sourceItems.length || 1);
      var items = sourceItems.map(function (im, ii) {
        im = record(im) ? im : {};
        return { id: id(im.id, 'image-' + (ri + 1) + '-' + (ii + 1)), name: filename(im.name, 'image-' + (ri + 1) + '-' + (ii + 1) + '.png'), src: imageSource(im.src), width: number(im.width, ideal, 0.02, 1), caption: string(im.caption, '', 2000), label: string(im.label, '', 200), style: style(im.style, CAPTION_STYLE) };
      });
      var available = 1 - Math.max(0, items.length - 1) * gap;
      var widthSum = items.reduce(function (sum, im) { return sum + im.width; }, 0);
      if (widthSum > available + 1e-10) {
        var fitted = fitWeights(items.map(function (im) { return im.width; }), available, 0.02);
        items.forEach(function (im, i) { im.width = fitted[i]; });
      }
      return { id: id(row.id, 'row-' + (ri + 1)), items: items };
    });
    return { rows: rows, caption: string(value.caption, '', 2000), label: string(value.label, '', 200), captionStyle: style(value.captionStyle, CAPTION_STYLE), span: value.span === 'double' ? 'double' : 'single', width: number(value.width, 1, 0.2, 1), gap: gap, align: value.align === 'bottom' ? 'bottom' : 'top' };
  }
  function createProject() {
    var t = makeTable(5, 4);
    var sample = [['Method', 'Latency (µs)', 'Throughput', 'Speedup'], ['Baseline', '24.8', '1.00×', '1.00×'], ['Shared cache', '18.6', '1.34×', '1.33×'], ['Adaptive routing', '14.2', '1.75×', '1.75×'], ['Our approach', '10.9', '2.28×', '2.28×']];
    t.colWidths = [0.38, 0.22, 0.22, 0.18];
    t.caption = 'Performance comparison across system configurations.';
    t.label = 'tab:performance';
    sample.forEach(function (row, r) { row.forEach(function (text, c) { t.cells[r][c].text = text; t.cells[r][c].style.align = c === 0 ? 'left' : 'center'; if (r === 0 || r === 4) t.cells[r][c].style.bold = true; if (r === 4) t.cells[r][c].style.bg = '#eef6f4'; }); });
    var f = normalizeFigure({ rows: [{ id: 'row-1', items: [{ id: 'architecture', name: 'architecture.svg', width: 0.49, caption: 'System architecture', label: 'fig:architecture' }, { id: 'results', name: 'evaluation.png', width: 0.49, caption: 'Evaluation results', label: 'fig:results' }] }], caption: 'An overview of the design and its experimental evaluation.', label: 'fig:overview', gap: 0.02, width: 1 });
    return { version: 1, name: 'Research layout study', active: 'table', table: t, figure: f };
  }
  function normalizeProject(value) {
    if (!record(value) || !own(value, 'version') || value.version !== 1) throw new Error('无效的项目文件：只支持 version 为 1 的工具箱项目。');
    if (!record(value.table) || !record(value.figure)) throw new Error('无效的项目文件：缺少 table 或 figure 数据。');
    return { version: 1, name: string(value.name, 'Untitled project', 150), active: value.active === 'figure' ? 'figure' : 'table', table: normalizeTable(value.table), figure: normalizeFigure(value.figure) };
  }
  function escapeLatex(value) {
    var map = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '%': '\\%', '_': '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}', '<': '\\textless{}', '>': '\\textgreater{}' };
    return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\\{}$&#%_^~<>]/g, function (char) { return map[char]; }).replace(/\t/g, ' ').replace(/\n/g, '\\newline{}');
  }
  function parseCSV(text, delimiter) {
    if (typeof text !== 'string') throw new Error('CSV 内容必须是文本。');
    delimiter = delimiter == null ? ',' : delimiter;
    if (typeof delimiter !== 'string' || delimiter.length !== 1 || /["\r\n]/.test(delimiter)) throw new Error('CSV 分隔符必须是一个非引号、非换行字符。');
    text = text.replace(/^\uFEFF/, '');
    if (!text.length) return [['']];
    var rows = [], row = [], field = '', quoted = false, afterQuote = false, start = true;
    function pushField() { row.push(field); field = ''; start = true; afterQuote = false; }
    function pushRow() { pushField(); rows.push(row); row = []; }
    for (var i = 0; i < text.length; i++) {
      var char = text[i];
      if (quoted) {
        if (char === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; afterQuote = true; } }
        else if (char === '\r') { field += '\n'; if (text[i + 1] === '\n') i++; }
        else field += char;
      } else if (char === delimiter) pushField();
      else if (char === '\r' || char === '\n') { pushRow(); if (char === '\r' && text[i + 1] === '\n') i++; }
      else if (char === '"' && start) { quoted = true; start = false; }
      else if (afterQuote) { if (char !== ' ' && char !== '\t') throw new Error('CSV 引号字段结束后包含多余字符（位置 ' + (i + 1) + '）。'); }
      else { field += char; start = false; }
    }
    if (quoted) throw new Error('CSV 存在未闭合的双引号字段。');
    if (field !== '' || row.length || !/[\r\n]$/.test(text)) pushRow();
    var columns = Math.max(1, rows.reduce(function (max, r) { return Math.max(max, r.length); }, 0));
    return rows.map(function (r) { while (r.length < columns) r.push(''); return r; });
  }
  function importCSV(text, delimiter) {
    var data = parseCSV(text, delimiter);
    if (data.length > LIMITS.rows || data[0].length > LIMITS.cols) throw new Error('原型支持最多 ' + LIMITS.rows + ' 行、' + LIMITS.cols + ' 列；请缩小 CSV 后重试。');
    var table = makeTable(data.length, data[0].length);
    data.forEach(function (row, r) { row.forEach(function (text, c) { table.cells[r][c].text = text.slice(0, LIMITS.text); table.cells[r][c].style.bold = r === 0; }); });
    return table;
  }
  function fmt(value) { return Number(value.toFixed(6)).toString(); }
  function dedupe(values) { return Array.from(new Set(values)); }
  function safeLabel(value, warnings) {
    if (!value.trim()) return '';
    var result = value.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9:._-]/g, '');
    if (result !== value.trim()) warnings.push('Label “' + value + '” 已清理为 “' + result + '”；建议使用英文字母、数字、冒号和连字符。');
    return result;
  }
  function styledText(text, s, paragraph) {
    var commands = [];
    if (paragraph) commands.push(s.align === 'center' ? '\\centering' : s.align === 'right' ? '\\raggedleft' : '\\raggedright');
    if (paragraph) commands.push('\\arraybackslash');
    commands.push('\\' + s.size, '\\color[HTML]{' + s.fg.slice(1).toUpperCase() + '}');
    if (s.bold) commands.push('\\bfseries');
    if (s.italic) commands.push('\\itshape');
    return '{' + commands.join(' ') + ' ' + escapeLatex(text) + (paragraph ? '\\par' : '') + '}';
  }
  function captionLines(text, label, s, warnings) {
    var result = [];
    if (text) {
      result.push('\\captionsetup{justification=' + (s.align === 'left' ? 'raggedright' : s.align === 'right' ? 'raggedleft' : 'centering') + ',singlelinecheck=false}');
      result.push('\\caption{' + styledText(text, s, false) + '}');
    }
    var safe = safeLabel(label, warnings);
    if (safe) { if (!text) result.push('\\phantomcaption'); result.push('\\label{' + safe + '}'); }
    return result;
  }
  function tableMap(table) {
    var map = Array.from({ length: table.rows }, function (_, r) { return Array.from({ length: table.cols }, function (_, c) { return { r: r, c: c, rs: 1, cs: 1 }; }); });
    table.merges.forEach(function (m) { for (var r = m.r; r < m.r + m.rs; r++) for (var c = m.c; c < m.c + m.cs; c++) map[r][c] = m; });
    return map;
  }
  function exportTable(value) {
    var table = normalizeTable(value), warnings = [], map = tableMap(table);
    var packages = ['\\usepackage{array}', '\\usepackage[table]{xcolor}', '\\usepackage{adjustbox}', '\\usepackage{caption}'];
    if (table.mode === 'tabularx') packages.push('\\usepackage{tabularx}');
    if (table.borderPreset === 'booktabs') packages.push('\\usepackage{booktabs}');
    if (table.merges.some(function (m) { return m.rs > 1; })) packages.push('\\usepackage{multirow}');
    var ruled = table.borderPreset === 'grid' || table.borderPreset === 'custom';
    var ruleCount = ruled ? table.cols + 1 : 0;
    function widthAt(c, cs) {
      var weight = table.colWidths.slice(c, c + cs).reduce(function (a, b) { return a + b; }, 0);
      var tab = 2 * (cs - 1) - 2 * table.cols * weight;
      var rules = (ruled ? cs - 1 : 0) - ruleCount * weight;
      var expression = fmt(weight * table.width) + '\\linewidth';
      if (Math.abs(tab) > 1e-8) expression += (tab < 0 ? '-' : '+') + fmt(Math.abs(tab)) + '\\tabcolsep';
      if (Math.abs(rules) > 1e-8) expression += (rules < 0 ? '-' : '+') + fmt(Math.abs(rules)) + '\\arrayrulewidth';
      return '\\dimexpr' + expression + '\\relax';
    }
    function owner(r, c) { var m = map[r][c]; return table.cells[m.r][m.c]; }
    function vertical(r, boundary) {
      if (table.borderPreset === 'grid') return true;
      if (table.borderPreset !== 'custom') return false;
      if (boundary === 0) return owner(r, 0).borders.left;
      if (boundary === table.cols) return owner(r, table.cols - 1).borders.right;
      if (map[r][boundary - 1] === map[r][boundary]) return false;
      return owner(r, boundary - 1).borders.right || owner(r, boundary).borders.left;
    }
    function horizontal(boundary, booktabs) {
      var bits = [];
      for (var c = 0; c < table.cols; c++) {
        var same = boundary > 0 && boundary < table.rows && map[boundary - 1][c] === map[boundary][c];
        var show = false;
        if (!same) {
          if (booktabs || table.borderPreset === 'grid') show = true;
          else if (table.borderPreset === 'custom') show = (boundary > 0 && owner(boundary - 1, c).borders.bottom) || (boundary < table.rows && owner(boundary, c).borders.top);
        }
        bits.push(show);
      }
      if (bits.every(Boolean)) return booktabs ? (boundary === 0 ? '\\toprule' : boundary === table.rows ? '\\bottomrule' : '\\midrule') : '\\hline';
      var segments = [], start = -1;
      bits.concat(false).forEach(function (flag, i) { if (flag && start < 0) start = i; if (!flag && start >= 0) { segments.push((booktabs ? '\\cmidrule' : '\\cline') + '{' + (start + 1) + '-' + i + '}'); start = -1; } });
      return segments.join(' ');
    }
    var spec = table.colWidths.map(function (w, c) {
      var column = table.mode === 'tabularx' ? '>{\\hsize=' + fmt(w * table.cols) + '\\hsize\\linewidth=\\hsize\\raggedright\\arraybackslash}X' : '>{\\raggedright\\arraybackslash}p{' + widthAt(c, 1) + '}';
      return (table.borderPreset === 'grid' && c === 0 ? '|' : '') + column + (table.borderPreset === 'grid' ? '|' : '');
    }).join('');
    var env = table.span === 'double' ? 'table*' : 'table';
    var lines = ['\\begin{' + env + '}[tbp]', '\\centering'];
    lines = lines.concat(captionLines(table.caption, table.label, table.captionStyle, warnings));
    lines.push('\\begingroup', '\\setlength{\\tabcolsep}{' + fmt(table.width * Math.min(0.0125, 0.2 / table.cols)) + '\\linewidth}');
    lines.push('\\begin{adjustbox}{max width=' + fmt(table.width) + '\\linewidth}');
    lines.push('\\begin{' + table.mode + '}' + (table.mode === 'tabularx' ? '{' + fmt(table.width) + '\\linewidth}' : '') + '{' + spec + '}');
    var top = table.borderPreset === 'booktabs' ? horizontal(0, true) : horizontal(0, false);
    if (top) lines.push(top);
    for (var r = 0; r < table.rows; r++) {
      var values = [];
      for (var c = 0; c < table.cols;) {
        var m = map[r][c];
        if (c !== m.c) { c++; continue; }
        var anchor = table.cells[m.r][m.c], covered = r !== m.r;
        var content = covered ? '' : (anchor.style.bg !== '#ffffff' ? '\\cellcolor[HTML]{' + anchor.style.bg.slice(1).toUpperCase() + '}' : '') + styledText(anchor.text, anchor.style, true);
        if (!covered && m.rs > 1) content = '\\multirow[' + (anchor.style.valign === 'bottom' ? 'b' : anchor.style.valign === 'middle' ? 'c' : 't') + ']{' + m.rs + '}{=}{' + content + '}';
        var override = m.cs > 1 || m.rs > 1 || table.borderPreset === 'custom' || anchor.style.valign !== 'top';
        if (override) {
          var col = anchor.style.valign === 'bottom' ? 'b' : anchor.style.valign === 'middle' ? 'm' : 'p';
          var format = (c === 0 && vertical(r, c) ? '|' : '') + col + '{' + widthAt(c, m.cs) + '}' + (vertical(r, c + m.cs) ? '|' : '');
          content = '\\multicolumn{' + m.cs + '}{' + format + '}{' + content + '}';
        }
        values.push(content);
        c += m.cs;
      }
      lines.push(values.join(' & ') + ' \\\\');
      var rule = '';
      if (table.borderPreset === 'booktabs') { if (r === table.rows - 1 || (r === 0 && table.header)) rule = horizontal(r + 1, true); }
      else if (table.borderPreset !== 'none') rule = horizontal(r + 1, false);
      if (rule) lines.push(rule);
    }
    lines.push('\\end{' + table.mode + '}', '\\end{adjustbox}', '\\endgroup', '\\end{' + env + '}');
    if (table.cols > 12 || table.width < 0.4) warnings.push('当前表格列数较多或整体较窄；请在实际文档中检查换行与可读性。');
    if (table.merges.some(function (m) { return m.rs > 1 && table.cells[m.r][m.c].style.bg !== '#ffffff'; })) warnings.push('跨行合并单元格的背景色在 multirow / colortbl 中可能只覆盖首行；请在实际 PDF 中检查。');
    return { code: lines.join('\n'), packages: dedupe(packages), warnings: dedupe(warnings) };
  }
  function assetFilename(name) {
    return filename(name, 'image.png').replace(/[{}%\r\n]/g, '_');
  }
  function graphicsFilename(name, warnings) {
    var clean = assetFilename(name);
    if (clean !== name) {
      warnings.push('图片文件名 “' + name + '” 含 TeX 路径特殊字符；代码使用 “' + clean + '”，请相应重命名图片。');
      return clean;
    }
    return name;
  }
  function exportFigure(value) {
    var warnings = [];
    if (record(value) && Array.isArray(value.rows)) value.rows.forEach(function (row, i) { if (figureBudget(row, value.gap).overflow) warnings.push('第 ' + (i + 1) + ' 行超过可用宽度；已自动缩小子图宽度。'); });
    var figure = normalizeFigure(value), packages = ['\\usepackage{graphicx}', '\\usepackage{subcaption}', '\\usepackage[table]{xcolor}'];
    var env = figure.span === 'double' ? 'figure*' : 'figure';
    var lines = ['\\begin{' + env + '}[tbp]', '\\centering', '\\begin{minipage}{' + fmt(figure.width) + '\\linewidth}', '\\centering'];
    var validRows = figure.rows.filter(function (row, i) { if (!row.items.length) { warnings.push('第 ' + (i + 1) + ' 行没有图片，导出时已跳过。'); return false; } return true; });
    if (!validRows.length) warnings.push('尚未添加图片；导出代码只包含空的图片环境。');
    var imageCount = validRows.reduce(function (count, row) { return count + row.items.length; }, 0);
    if (imageCount > 26) {
      lines.push('\\renewcommand{\\thesubfigure}{\\arabic{subfigure}}');
      warnings.push('子图超过 26 张，当前图片组使用数字子图编号。');
    }
    var labels = new Set();
    validRows.forEach(function (row, ri) {
      var printedGap = Number(fmt(figure.gap));
      var available = 1 - printedGap * Math.max(0, row.items.length - 1);
      var sum = row.items.reduce(function (total, im) { return total + im.width; }, 0);
      lines.push('\\noindent%');
      row.items.forEach(function (im, ii) {
        var name = graphicsFilename(im.name, warnings), svg = /\.svg$/i.test(name);
        if (svg) { packages.push('\\usepackage{svg}'); warnings.push('SVG 使用 \\includesvg，实际编译通常需要安装 Inkscape 并允许 shell-escape。'); }
        var printedWidth = Math.floor(im.width * Math.min(1, available / sum) * 100000000) / 100000000;
        lines.push('\\begin{subfigure}[' + (figure.align === 'bottom' ? 'b' : 't') + ']{' + printedWidth + '\\linewidth}');
        lines.push('\\centering', '\\' + (svg ? 'includesvg' : 'includegraphics') + '[width=\\linewidth]{\\detokenize{' + name + '}}');
        var safe = safeLabel(im.label, warnings);
        if (safe && labels.has(safe)) warnings.push('Label “' + safe + '” 重复；请为各子图设置不同的 label。');
        if (safe) labels.add(safe);
        lines = lines.concat(captionLines(im.caption, im.label, im.style, warnings));
        if (!im.caption && !safe) lines.push('\\phantomcaption');
        lines.push('\\end{subfigure}%');
        if (ii < row.items.length - 1 && printedGap > 0) lines.push('\\hspace{' + printedGap + '\\linewidth}%');
      });
      if (ri < validRows.length - 1) lines.push('\\par');
    });
    lines.push('\\end{minipage}');
    if (figure.label && labels.has(safeLabel(figure.label, warnings))) warnings.push('总图 label 与子图 label 重复，请修改。');
    lines = lines.concat(captionLines(figure.caption, figure.label, figure.captionStyle, warnings));
    lines.push('\\end{' + env + '}');
    return { code: lines.join('\n'), packages: dedupe(packages), warnings: dedupe(warnings) };
  }
  function exportProject(project, kind) {
    if (!record(project)) throw new Error('缺少项目数据。');
    if (kind === 'both' || kind === 'all') {
      var t = exportTable(project.table), f = exportFigure(project.figure);
      return { code: t.code + '\n\n' + f.code, packages: dedupe(t.packages.concat(f.packages)), warnings: dedupe(t.warnings.concat(f.warnings)) };
    }
    return (kind || project.active) === 'figure' ? exportFigure(project.figure) : exportTable(project.table);
  }
  return { createProject: createProject, normalizeProject: normalizeProject, escapeLatex: escapeLatex, parseCSV: parseCSV, importCSV: importCSV, exportTable: exportTable, exportFigure: exportFigure, exportProject: exportProject, figureBudget: figureBudget, assetFilename: assetFilename, limits: Object.freeze(LIMITS) };
});
