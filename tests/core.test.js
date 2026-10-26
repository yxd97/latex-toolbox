'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core.js');

function project() { return Core.createProject(); }
function floatWidths(code) { return Array.from(code.matchAll(/\\begin\{subfigure\}\[[tb]\]\{([\d.]+)\\linewidth\}/g), match => Number(match[1])); }

test('CSV preserves quoted commas, escaped quotes, newlines, BOM and empty fields', () => {
  assert.deepEqual(Core.parseCSV('\uFEFFName,Comment,Value\r\n"A, B","He said ""yes""\r\nnext line",\r\nC,D,3\r\n'), [
    ['Name', 'Comment', 'Value'], ['A, B', 'He said "yes"\nnext line', ''], ['C', 'D', '3']
  ]);
  assert.deepEqual(Core.parseCSV('a;b\n1\n2;;3', ';'), [['a', 'b', ''], ['1', '', ''], ['2', '', '3']]);
  assert.deepEqual(Core.parseCSV('a\tb\n1\t2', '\t'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(Core.parseCSV(''), [['']]);
  assert.deepEqual(Core.parseCSV('a,b,'), [['a', 'b', '']]);
  assert.throws(() => Core.parseCSV('"unterminated'), /未闭合/);
  assert.throws(() => Core.parseCSV('"quoted"junk,x'), /多余字符/);
  assert.throws(() => Core.parseCSV('x', '\n'), /分隔符/);
});

test('CSV import sizes a fresh rectangular table and enforces documented limits', () => {
  const table = Core.importCSV('Method,Value,Notes\nA,1\nB,2,ok');
  assert.equal(table.rows, 3);
  assert.equal(table.cols, 3);
  assert.equal(table.cells[1][2].text, '');
  assert.equal(table.cells[0][0].style.bold, true);
  assert.equal(table.cells[1][0].style.bold, false);
  assert.deepEqual(table.merges, []);
  assert.ok(Math.abs(table.colWidths.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.throws(() => Core.importCSV(Array(102).fill('x').join('\n')), /最多/);
});

test('ordinary text is escaped once and cannot become TeX commands', () => {
  const escaped = Core.escapeLatex('\\input{x} $a_b$ & 50% # ^ ~ < >\nnext');
  assert.equal(escaped, '\\textbackslash{}input\\{x\\} \\$a\\_b\\$ \\& 50\\% \\# \\textasciicircum{} \\textasciitilde{} \\textless{} \\textgreater{}\\newline{}next');
  const t = project().table;
  t.cells[1][0].text = '\\end{table} & %';
  t.caption = 'A & B_1';
  t.label = 'tab: safe}\\input{secret}';
  const out = Core.exportTable(t);
  assert.ok(out.code.includes('\\textbackslash{}end\\{table\\} \\& \\%'));
  assert.ok(out.code.includes('A \\& B\\_1'));
  assert.ok(out.code.includes('\\label{tab:-safeinputsecret}'));
  assert.ok(out.warnings.some(w => w.includes('Label')));
  assert.ok(!out.code.includes('\\input{secret}'));
});

test('default table exports weighted X columns and a complete adjustable float', () => {
  const t = project().table;
  const out = Core.exportTable(t);
  assert.match(out.code, /^\\begin\{table\}\[tbp\]/);
  assert.match(out.code, /\\begin\{adjustbox\}\{max width=1\\linewidth\}/);
  assert.match(out.code, /\\begin\{tabularx\}\{1\\linewidth\}/);
  assert.match(out.code, /\\hsize=1\.52\\hsize/);
  assert.match(out.code, /\\setlength\{\\tabcolsep\}\{0\.0125\\linewidth\}/);
  assert.match(out.code, /\\toprule/);
  assert.match(out.code, /\\midrule/);
  assert.match(out.code, /\\bottomrule/);
  assert.ok(out.code.indexOf('\\caption') < out.code.indexOf('\\begin{adjustbox}'));
  assert.ok(out.packages.includes('\\usepackage{tabularx}'));
  assert.ok(out.packages.includes('\\usepackage{booktabs}'));
  t.header = false;
  assert.ok(!Core.exportTable(t).code.includes('\\midrule'));
  t.mode = 'tabular';
  t.span = 'double';
  t.width = 0.8;
  const fixed = Core.exportTable(t);
  assert.match(fixed.code, /^\\begin\{table\*\}/);
  assert.match(fixed.code, /p\{\\dimexpr0\.304\\linewidth-3\.04\\tabcolsep\\relax\}/);
  assert.ok(!fixed.packages.includes('\\usepackage{tabularx}'));
});

test('merged cells export proper spans and do not draw rules through multirow', () => {
  const t = Core.importCSV('Group,C1,C2\nignore,10,20\nB,30,40');
  t.borderPreset = 'grid';
  t.merges = [{ r: 0, c: 0, rs: 2, cs: 1 }, { r: 2, c: 1, rs: 1, cs: 2 }];
  const out = Core.exportTable(t);
  assert.ok(out.code.includes('\\multirow[t]{2}{=}{'));
  assert.ok(out.code.includes('\\multicolumn{2}'));
  assert.ok(out.code.includes('\\cline{2-3}'));
  assert.ok(!out.code.includes('ignore'));
  assert.ok(!out.code.includes('40'));
  assert.ok(out.code.includes('30'));
  assert.ok(out.packages.includes('\\usepackage{multirow}'));
  assert.ok(out.code.includes('\\arrayrulewidth'));
});

test('custom borders, colors, typography and vertical alignment are represented', () => {
  const t = Core.importCSV('A,B\nC,D');
  t.borderPreset = 'custom';
  t.cells[0][0].borders = { top: true, bottom: true, left: true, right: true };
  t.cells[1][1].style = { bold: true, italic: true, align: 'right', valign: 'middle', fg: '#123abc', bg: '#eef6f4', size: 'large' };
  const out = Core.exportTable(t);
  assert.ok(out.code.includes('\\cline{1-1}'));
  assert.ok(out.code.includes('\\multicolumn{1}{|p{'));
  assert.ok(out.code.includes('\\multicolumn{1}{m{'));
  assert.ok(out.code.includes('\\cellcolor[HTML]{EEF6F4}'));
  assert.ok(out.code.includes('\\raggedleft \\arraybackslash \\large \\color[HTML]{123ABC} \\bfseries \\itshape'));
});

test('two- and three-panel budgets include gaps; exported rows fit after rounding', () => {
  assert.deepEqual(Core.figureBudget({ items: [{ width: 0.49 }, { width: 0.49 }] }, 0.02), { total: 1, remaining: 0, overflow: false });
  assert.equal(Core.figureBudget({ items: [{ width: 0.5 }, { width: 0.5 }] }, 0.02).overflow, true);
  const p = project();
  p.figure.rows = [{ id: 'triple', items: [1, 2, 3].map(n => ({ id: 'im' + n, name: 'image-' + n + '.png', width: 0.5, caption: '', label: '' })) }];
  p.figure.gap = 0.0170312345;
  const out = Core.exportFigure(p.figure);
  const widths = floatWidths(out.code);
  const gaps = Array.from(out.code.matchAll(/\\hspace\{([\d.]+)\\linewidth\}/g), m => Number(m[1]));
  assert.equal(widths.length, 3);
  assert.ok(widths.reduce((a, b) => a + b, 0) + gaps.reduce((a, b) => a + b, 0) <= 1);
  assert.ok(out.warnings.some(w => w.includes('超过可用宽度')));
  assert.match(out.code, /\\end\{subfigure\}%\n\\hspace/);
  assert.ok(!out.code.includes('\\vspace'));
});

test('figure exports filename-only graphics, SVG dependency, captions and spans', () => {
  const p = project();
  p.figure.span = 'double';
  p.figure.width = 0.9;
  p.figure.rows[0].items[0].name = 'C:\\somewhere\\design_1.svg';
  p.figure.rows[0].items[1].name = 'plot result.pdf';
  p.figure.rows.push({ id: 'empty', items: [] });
  const out = Core.exportFigure(p.figure);
  assert.match(out.code, /^\\begin\{figure\*\}/);
  assert.ok(out.code.includes('\\begin{minipage}{0.9\\linewidth}'));
  assert.ok(out.code.includes('\\includesvg[width=\\linewidth]{\\detokenize{design_1.svg}}'));
  assert.ok(out.code.includes('\\includegraphics[width=\\linewidth]{\\detokenize{plot result.pdf}}'));
  assert.ok(out.code.includes('\\label{fig:architecture}'));
  assert.ok(out.code.includes('\\label{fig:overview}'));
  assert.ok(out.packages.includes('\\usepackage{svg}'));
  assert.ok(out.warnings.some(w => w.includes('Inkscape')));
  assert.ok(out.warnings.some(w => w.includes('没有图片')));
  p.figure.rows[0].items[1].name = 'plot%{bad}.png';
  const safe = Core.exportFigure(p.figure);
  assert.ok(safe.code.includes('plot__bad_.png'));
  assert.ok(safe.warnings.some(w => w.includes('重命名')));
  assert.equal(Core.assetFilename('plot%{bad}.png'), 'plot__bad_.png');
  assert.equal(Core.assetFilename('C:\\local\\image name.svg'), 'image name.svg');
  assert.equal(Core.assetFilename('invalid.exe'), 'image.png');
  const longSVG = 'a'.repeat(220) + '.svg';
  assert.equal(Core.assetFilename(longSVG), longSVG);
  p.figure.rows[0].items[0].name = longSVG;
  assert.ok(Core.exportFigure(p.figure).code.includes('\\includesvg[width=\\linewidth]{\\detokenize{' + longSVG + '}}'));
});

test('unlabelled empty panels reserve ordinals and large figures use numeric counters', () => {
  const f = project().figure;
  f.rows[0].items[0].caption = '';
  f.rows[0].items[0].label = '';
  const emptyCaption = Core.exportFigure(f).code;
  assert.ok(emptyCaption.indexOf('\\phantomcaption') < emptyCaption.indexOf('Evaluation results'));
  f.rows = Array.from({ length: 9 }, (_, r) => ({ id: 'r' + r, items: [0, 1, 2].map(i => ({ id: 'i' + r + i, name: 'x.png', width: 0.32, caption: 'Panel', label: '' })) }));
  const many = Core.exportFigure(f);
  assert.ok(many.code.includes('\\renewcommand{\\thesubfigure}{\\arabic{subfigure}}'));
  assert.ok(many.warnings.some(w => w.includes('超过 26')));
});

test('normalization rejects unsupported roots and repairs untrusted nested data', () => {
  for (const value of [null, [], {}, { version: 2 }, { version: 1, table: {} }]) assert.throws(() => Core.normalizeProject(value));
  const p = project();
  p.table.rows = 2;
  p.table.cols = 2;
  p.table.cells = [[{ text: '<script>alert(1)</script>', style: { bold: 'yes', fg: 'red;\\input{bad}', align: 'evil' } }]];
  p.table.colWidths = [NaN, -50];
  p.table.merges = [{ r: 0, c: 0, rs: 2, cs: 1 }, { r: 1, c: 0, rs: 1, cs: 2 }, { r: 0, c: 1, rs: 9, cs: 1 }];
  p.table.width = Infinity;
  p.figure.rows[0].items[0].src = 'javascript:alert(1)';
  p.figure.rows[0].items[1].src = 'https://example.com/pixel.png';
  p.figure.rows[0].items[0].id = p.figure.rows[0].items[1].id = 'same';
  p.figure.rows[0].items[0].name = '../../my-image.png';
  p.figure.rows[0].items.push({ id: 'extra', width: 1, src: 'data:image/png;base64,AA==', name: 'x.png' });
  p.figure.rows[0].items.push({ id: 'truncated', width: 1 });
  p.figure.gap = 999;
  const normalized = Core.normalizeProject(p);
  assert.equal(normalized.table.cells.length, 2);
  assert.equal(normalized.table.cells[1].length, 2);
  assert.equal(normalized.table.cells[0][0].style.bold, false);
  assert.equal(normalized.table.cells[0][0].style.fg, '#1f2937');
  assert.equal(normalized.table.merges.length, 1);
  assert.equal(normalized.table.width, 1);
  assert.ok(normalized.table.colWidths.every(Number.isFinite));
  assert.equal(normalized.figure.rows[0].items.length, 3);
  assert.equal(normalized.figure.rows[0].items[0].src, '');
  assert.equal(normalized.figure.rows[0].items[1].src, '');
  assert.equal(normalized.figure.rows[0].items[0].name, 'my-image.png');
  assert.notEqual(normalized.figure.rows[0].items[0].id, normalized.figure.rows[0].items[1].id);
  assert.equal(normalized.figure.gap, 0.15);
  assert.equal(Core.figureBudget(normalized.figure.rows[0], normalized.figure.gap).overflow, false);
  assert.deepEqual(Core.normalizeProject(normalized), normalized);
  assert.notEqual(normalized.table, p.table);
  p.table.colWidths = [0.001, 1];
  p.figure.rows[0].items.forEach((im, i) => { im.width = i ? 1 : 0.02; });
  const edge = Core.normalizeProject(p);
  assert.deepEqual(Core.normalizeProject(edge), edge, 'normalization must not shrink minimum-width cells on every restore');
  assert.ok(edge.figure.rows[0].items.every(im => im.width >= 0.02));
  assert.ok(edge.table.colWidths.every(width => width >= 0.001));
});

test('project export deduplicates packages and never emits vertical space controls', () => {
  const p = project();
  const out = Core.exportProject(p, 'both');
  assert.ok(out.code.includes('\\begin{table}'));
  assert.ok(out.code.includes('\\begin{figure}'));
  assert.equal(out.packages.length, new Set(out.packages).size);
  assert.ok(!/\\(?:vspace|vskip|baselinestretch|arraystretch)/.test(out.code));
  p.active = 'figure';
  assert.equal(Core.exportProject(p).code, Core.exportFigure(p.figure).code);
});
