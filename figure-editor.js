(function () {
  'use strict';

  var defaults = { bold: false, italic: false, align: 'center', valign: 'top', fg: '#1f2937', bg: '#ffffff', size: 'small' };
  var MEDIA_BUDGET = 60 * 1024 * 1024;
  var nextId = 0;
  function uid(prefix) { return prefix + '-' + Date.now().toString(36) + '-' + (++nextId).toString(36); }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function node(tag, className, text) {
    var element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function button(text, title, action, className) {
    var result = node('button', className || 'secondary', text);
    result.type = 'button';
    if (title) { result.title = title; result.setAttribute('aria-label', title); }
    result.addEventListener('click', action);
    return result;
  }
  function input(type, value, label) {
    var result = node('input');
    result.type = type;
    result.value = value;
    if (label) result.setAttribute('aria-label', label);
    return result;
  }
  function field(label, control, hint) {
    var result = node('label', 'field');
    result.append(node('span', 'field-label', label), control);
    if (hint) result.append(node('span', 'field-hint muted', hint));
    return result;
  }
  function select(options, current, label) {
    var result = node('select');
    result.setAttribute('aria-label', label);
    options.forEach(function (option) {
      var item = node('option', '', option[1]); item.value = option[0]; result.append(item);
    });
    result.value = current;
    return result;
  }
  function format(value) { return Number(value.toFixed(4)).toString(); }
  function rowLimit() { return window.ToolboxCore && window.ToolboxCore.limits ? window.ToolboxCore.limits.figureRows : 30; }
  function styleOf(value) { return Object.assign({}, defaults, value || {}); }
  function captionAppearance(element, style) {
    var sizes = { footnotesize: '0.78em', small: '0.88em', normalsize: '1em', large: '1.12em' };
    element.style.fontWeight = style.bold ? '700' : '400';
    element.style.fontStyle = style.italic ? 'italic' : 'normal';
    element.style.textAlign = style.align;
    element.style.color = style.fg;
    element.style.fontSize = sizes[style.size] || sizes.small;
  }
  function distribute(row, gap) {
    if (!row.items.length) return;
    var width = (1 - Math.max(0, row.items.length - 1) * gap) / row.items.length;
    row.items.forEach(function (item) { item.width = Number(width.toFixed(6)); });
  }
  function budget(row, gap) {
    return row.items.reduce(function (sum, item) { return sum + Number(item.width); }, 0) + Math.max(0, row.items.length - 1) * gap;
  }
  function trustedSvg(kind) {
    var start = '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="450" viewBox="0 0 720 450"><rect width="720" height="450" fill="#f8fafc"/><g font-family="Arial, sans-serif">';
    var end = '</g></svg>';
    var content = kind === 'architecture'
      ? '<text x="40" y="50" fill="#64748b" font-size="15" letter-spacing="2">SYSTEM ARCHITECTURE</text><rect x="40" y="100" width="180" height="110" rx="15" fill="#e0e7ff"/><text x="130" y="149" text-anchor="middle" fill="#4338ca" font-size="20" font-weight="700">Workload</text><text x="130" y="179" text-anchor="middle" fill="#6366f1" font-size="14">Requests / queries</text><path d="M225 155 H275 M263 147 L275 155 L263 163" fill="none" stroke="#94a3b8" stroke-width="3"/><rect x="285" y="100" width="180" height="110" rx="15" fill="#4f46e5"/><text x="375" y="149" text-anchor="middle" fill="white" font-size="20" font-weight="700">Scheduler</text><text x="375" y="179" text-anchor="middle" fill="#c7d2fe" font-size="14">Adaptive placement</text><path d="M470 155 H520 M508 147 L520 155 L508 163" fill="none" stroke="#94a3b8" stroke-width="3"/><rect x="530" y="100" width="150" height="110" rx="15" fill="#d1fae5"/><text x="605" y="149" text-anchor="middle" fill="#047857" font-size="20" font-weight="700">Workers</text><text x="605" y="179" text-anchor="middle" fill="#059669" font-size="14">Parallel execution</text><rect x="285" y="295" width="180" height="85" rx="15" fill="#ffedd5"/><text x="375" y="344" text-anchor="middle" fill="#c2410c" font-size="19" font-weight="700">Shared memory</text><path d="M375 215 V287 M367 275 L375 287 L383 275" fill="none" stroke="#94a3b8" stroke-width="3"/><path d="M605 215 V337 H475" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-dasharray="7 6"/>'
      : '<text x="40" y="50" fill="#64748b" font-size="15" letter-spacing="2">END-TO-END LATENCY</text><g stroke="#e2e8f0" stroke-width="1"><path d="M100 100 H670 M100 165 H670 M100 230 H670 M100 295 H670 M100 360 H670"/></g><g fill="#94a3b8" font-size="13" text-anchor="end"><text x="85" y="105">80</text><text x="85" y="170">60</text><text x="85" y="235">40</text><text x="85" y="300">20</text><text x="85" y="365">0</text></g><text transform="translate(40 250) rotate(-90)" text-anchor="middle" fill="#64748b" font-size="14">Latency (ms)</text><rect x="160" y="126" width="65" height="234" rx="5" fill="#c7d2fe"/><rect x="235" y="217" width="65" height="143" rx="5" fill="#4f46e5"/><rect x="405" y="165" width="65" height="195" rx="5" fill="#c7d2fe"/><rect x="480" y="256" width="65" height="104" rx="5" fill="#4f46e5"/><g fill="#475569" font-size="15" text-anchor="middle"><text x="230" y="391">Read-heavy</text><text x="475" y="391">Mixed</text></g><rect x="420" y="43" width="12" height="12" rx="2" fill="#c7d2fe"/><text x="439" y="54" fill="#64748b" font-size="13">Baseline</text><rect x="540" y="43" width="12" height="12" rx="2" fill="#4f46e5"/><text x="559" y="54" fill="#64748b" font-size="13">Ours</text>';
    return 'data:image/svg+xml;base64,' + btoa(start + content + end);
  }

  function mount(host, initialData, onChange) {
    var data = copy(initialData);
    var selected = 'global';
    var dead = false;
    var statusMessage = '';
    var statusError = false;
    var statusElement;
    var toolsHost;
    var filePicker;
    var pendingRowId = null;
    var dragItemId = null;
    var object = node('div', 'figure-editor');
    host.replaceChildren(object);

    function imageById(id) {
      for (var r = 0; r < data.rows.length; r++) {
        var i = data.rows[r].items.findIndex(function (item) { return item.id === id; });
        if (i >= 0) return { row: data.rows[r], rowIndex: r, item: data.rows[r].items[i], index: i };
      }
      return null;
    }
    function mediaUsage() {
      return data.rows.reduce(function (total, row) {
        return total + row.items.reduce(function (sum, item) { return sum + (typeof item.src === 'string' ? item.src.length : 0); }, 0);
      }, 0);
    }
    function notify(message, error) {
      statusMessage = message; statusError = !!error;
      if (statusElement) {
        statusElement.textContent = message;
        statusElement.classList.toggle('is-error', statusError);
      }
    }
    function commit(renderAgain) {
      if (dead) return;
      onChange(copy(data));
      if (renderAgain !== false) render();
    }
    function selectedStyle() {
      var found = imageById(selected);
      return found ? found.item.style : data.captionStyle;
    }
    function updateCaptionStyles() {
      object.querySelectorAll('[data-caption-for]').forEach(function (element) {
        var item = imageById(element.dataset.captionFor);
        captionAppearance(element, styleOf(item ? item.item.style : data.captionStyle));
      });
    }
    function choose(id) {
      selected = id;
      object.querySelectorAll('.figure-card').forEach(function (element) {
        element.classList.toggle('is-selected', element.dataset.imageId === selected);
      });
      renderTools();
    }
    function styleChange(key, value) {
      var found = imageById(selected);
      if (found) found.item.style = Object.assign(styleOf(found.item.style), { [key]: value });
      else data.captionStyle = Object.assign(styleOf(data.captionStyle), { [key]: value });
      updateCaptionStyles(); commit(false); renderTools();
    }
    function renderTools() {
      if (!toolsHost) return;
      toolsHost.replaceChildren();
      var options = [['global', '总图注']];
      var counter = 0;
      data.rows.forEach(function (row) { row.items.forEach(function (item) { options.push([item.id, '子图 ' + (++counter) + ' · ' + item.name]); }); });
      if (!options.some(function (option) { return option[0] === selected; })) selected = 'global';
      var target = select(options, selected, '图注格式应用对象');
      target.addEventListener('change', function () { choose(target.value); });
      toolsHost.append(field('图注格式', target));
      var style = styleOf(selectedStyle());
      var bold = button('B', '加粗整段图注', function () { styleChange('bold', !style.bold); }, 'icon-button text-bold');
      bold.setAttribute('aria-pressed', String(style.bold));
      var italic = button('I', '斜体整段图注', function () { styleChange('italic', !style.italic); }, 'icon-button text-italic');
      italic.setAttribute('aria-pressed', String(style.italic));
      var toggles = node('div', 'figure-format-toggles'); toggles.append(bold, italic);
      toolsHost.append(field('字形', toggles));
      var alignment = select([['left', '左对齐'], ['center', '居中'], ['right', '右对齐']], style.align, '图注对齐');
      alignment.addEventListener('change', function () { styleChange('align', alignment.value); });
      toolsHost.append(field('对齐', alignment));
      var size = select([['footnotesize', '较小'], ['small', '小号'], ['normalsize', '正文'], ['large', '大号']], style.size, '图注字号');
      size.addEventListener('change', function () { styleChange('size', size.value); });
      toolsHost.append(field('字号', size));
      var color = input('color', style.fg, '图注文字颜色');
      color.addEventListener('change', function () { styleChange('fg', color.value); });
      toolsHost.append(field('颜色', color));
    }
    function captionEditor(value, id, placeholder, change) {
      var edit = node('div', 'figure-caption-editor figure-caption', value);
      edit.contentEditable = 'plaintext-only';
      edit.setAttribute('role', 'textbox');
      edit.setAttribute('aria-multiline', 'true');
      edit.setAttribute('aria-label', id === 'global' ? '总图注，可直接编辑' : '子图注，可直接编辑');
      edit.dataset.placeholder = placeholder;
      edit.dataset.captionFor = id;
      captionAppearance(edit, styleOf(id === 'global' ? data.captionStyle : imageById(id).item.style));
      edit.addEventListener('focus', function () { choose(id); });
      edit.addEventListener('input', function () {
        var text = edit.innerText.replace(/\r/g, '');
        if (text === '\n') text = '';
        change(text); commit(false);
      });
      edit.addEventListener('paste', function (event) {
        event.preventDefault();
        var text = event.clipboardData.getData('text/plain');
        var selection = window.getSelection();
        if (!selection.rangeCount) return;
        var range = selection.getRangeAt(0);
        if (!edit.contains(range.commonAncestorContainer)) return;
        range.deleteContents();
        var inserted = document.createTextNode(text); range.insertNode(inserted);
        range.setStartAfter(inserted); range.collapse(true); selection.removeAllRanges(); selection.addRange(range);
        edit.dispatchEvent(new Event('input', { bubbles: true }));
      });
      return edit;
    }
    function setItemWidth(id, newWidth, control) {
      var found = imageById(id);
      if (!found) return;
      var next = Number(newWidth);
      var remaining = 1 - budget(found.row, data.gap) + Number(found.item.width);
      if (!Number.isFinite(next) || next < 0.02 || next > remaining + 0.000001) {
        if (control) control.value = format(found.item.width);
        notify('宽度未修改：这张图片最多可用 ' + format(remaining) + ' \\linewidth。请先缩小同一行的其他图片。', true);
        return;
      }
      found.item.width = Number(next.toFixed(6)); notify('图片宽度已更新。'); commit();
    }
    function move(id, targetRowId, targetIndex) {
      var found = imageById(id);
      var target = data.rows.find(function (row) { return row.id === targetRowId; });
      if (!found || !target) return;
      if (target !== found.row && target.items.length >= 3) {
        notify('移动未完成：一行最多 3 张图片，请先新建一行或移出一张图片。', true); return;
      }
      var sameRow = target === found.row;
      var position = targetIndex;
      if (sameRow && found.index < position) position--;
      found.row.items.splice(found.index, 1);
      target.items.splice(Math.max(0, Math.min(position, target.items.length)), 0, found.item);
      if (!sameRow) { distribute(found.row, data.gap); distribute(target, data.gap); }
      selected = id;
      notify(sameRow ? '图片顺序已更新。' : '图片已移到目标行；两行宽度已按默认间隔重新均分。'); commit();
    }
    function dropOn(event, rowId, index) {
      event.preventDefault(); event.stopPropagation();
      object.querySelectorAll('.is-drag-over').forEach(function (item) { item.classList.remove('is-drag-over'); });
      if (event.dataTransfer.files && event.dataTransfer.files.length) { loadFiles(event.dataTransfer.files, rowId); return; }
      var id = event.dataTransfer.getData('application/x-latex-toolbox-image') || dragItemId;
      if (id) move(id, rowId, index);
      dragItemId = null;
    }
    function openPicker(rowId) { pendingRowId = rowId || null; filePicker.click(); }
    async function loadFiles(fileList, targetRowId) {
      var files = Array.from(fileList);
      var rejected = [];
      var loaded = [];
      var pendingMedia = 0;
      for (var f = 0; f < files.length; f++) {
        var file = files[f];
        var extension = file.name.split('.').pop().toLowerCase();
        if (!/^(png|jpe?g|svg|pdf)$/.test(extension)) { rejected.push(file.name + '（不支持的格式）'); continue; }
        if (file.size > 10 * 1024 * 1024) { rejected.push(file.name + '（超过原型单文件 10 MiB 上限）'); continue; }
        try {
          var src = await new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(new Error('读取失败')); };
            reader.readAsDataURL(file);
          });
          var mime = extension === 'svg' ? 'image/svg+xml' : extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
          src = 'data:' + mime + ';base64,' + src.split(',')[1];
          if (dead) return;
          if (mediaUsage() + pendingMedia + src.length > MEDIA_BUDGET) {
            rejected.push(file.name + '（项目内嵌图片数据将超过 60 MiB，请先移除部分图片）'); continue;
          }
          loaded.push({ id: uid('image'), name: file.name, src: src, width: 1, caption: '', label: '', style: copy(defaults) });
          pendingMedia += src.length;
        } catch (_) { rejected.push(file.name + '（读取失败）'); }
      }
      if (dead) return;
      var row = data.rows.find(function (item) { return item.id === targetRowId; });
      var insertedCount = 0;
      // Recheck against current state: another file batch may have finished while this one was reading.
      var currentMedia = mediaUsage();
      loaded.forEach(function (item) {
        if (currentMedia + item.src.length > MEDIA_BUDGET) { rejected.push(item.name + '（项目内嵌图片数据将超过 60 MiB，请先移除部分图片）'); return; }
        if (!row || row.items.length >= 3) {
          if (!targetRowId && data.rows.length && data.rows[data.rows.length - 1].items.length < 3) row = data.rows[data.rows.length - 1];
          else {
            if (data.rows.length >= rowLimit()) { rejected.push(item.name + '（已达 ' + rowLimit() + ' 行上限）'); return; }
            row = { id: uid('row'), items: [] }; data.rows.push(row);
          }
        }
        row.items.push(item); distribute(row, data.gap); selected = item.id; insertedCount++; currentMedia += item.src.length;
      });
      var message = insertedCount ? '已在本地载入 ' + insertedCount + ' 张图片；导出代码只使用文件名。' : '没有载入图片。';
      if (rejected.length) message += ' 未载入：' + rejected.join('、');
      notify(message, rejected.length > 0); if (insertedCount) commit();
    }
    function imageCard(item, row, rowIndex, itemIndex, number) {
      var card = node('article', 'figure-card' + (selected === item.id ? ' is-selected' : ''));
      card.dataset.imageId = item.id;
      card.style.flex = '0 0 ' + (item.width * 100) + '%';
      card.style.minWidth = '0';
      card.addEventListener('click', function () { if (selected !== item.id) choose(item.id); });
      card.addEventListener('dragover', function (event) { event.preventDefault(); event.stopPropagation(); card.classList.add('is-drag-over'); });
      card.addEventListener('dragleave', function () { card.classList.remove('is-drag-over'); });
      card.addEventListener('drop', function (event) {
        var rect = card.getBoundingClientRect();
        dropOn(event, row.id, itemIndex + (event.clientX > rect.left + rect.width / 2 ? 1 : 0));
      });
      var header = node('div', 'figure-card-header');
      var handle = node('span', 'figure-drag-handle', '⠿');
      handle.draggable = true; handle.tabIndex = 0;
      handle.title = '拖动图片排序；也可使用下方移动按钮';
      handle.setAttribute('aria-label', '拖动 ' + item.name + ' 排序，也可使用移动按钮');
      handle.addEventListener('dragstart', function (event) {
        dragItemId = item.id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-latex-toolbox-image', item.id);
        event.dataTransfer.setData('text/plain', item.id);
      });
      handle.addEventListener('dragend', function () { dragItemId = null; object.querySelectorAll('.is-drag-over').forEach(function (element) { element.classList.remove('is-drag-over'); }); });
      header.append(handle, node('span', 'figure-filename', item.name));
      var remove = button('×', '移除 ' + item.name, function () {
        row.items.splice(itemIndex, 1); distribute(row, data.gap); if (selected === item.id) selected = 'global';
        notify('图片已移除；当前行宽度已重新均分。'); commit();
      }, 'icon-button danger');
      header.append(remove); card.append(header);
      var media = node('div', 'figure-image');
      if (/\.pdf$/i.test(item.name)) {
        var placeholder = node('div', 'figure-pdf-placeholder');
        placeholder.append(node('span', 'figure-file-type', 'PDF'), node('strong', '', item.name), node('span', 'muted', 'PDF 使用占位预览，导出时由 LaTeX 排版。')); media.append(placeholder);
      } else if (item.src) {
        var image = node('img'); image.src = item.src; image.alt = item.caption || item.name;
        image.draggable = false; image.style.width = '100%'; image.style.height = 'auto'; image.style.display = 'block';
        image.addEventListener('error', function () {
          media.replaceChildren(node('div', 'figure-pdf-placeholder', '无法预览 ' + item.name + '，可移除后重新选择文件。'));
        }, { once: true });
        media.append(image);
      } else media.append(node('div', 'figure-pdf-placeholder', '尚未载入图片 · ' + item.name));
      card.append(media);
      var caption = node('div', 'figure-subcaption');
      var panelCount = data.rows.reduce(function (sum, figureRow) { return sum + figureRow.items.length; }, 0);
      caption.append(node('span', 'figure-subcaption-letter', '(' + (panelCount > 26 ? number : String.fromCharCode(96 + number)) + ')'), captionEditor(item.caption, item.id, '点击输入子图注…', function (value) { item.caption = value; }));
      card.append(caption);
      var controls = node('div', 'figure-controls');
      var width = input('number', format(item.width), item.name + ' 宽度，以 linewidth 为单位');
      width.min = '0.02'; width.max = format(1 - budget(row, data.gap) + item.width); width.step = '0.01';
      width.addEventListener('change', function () { setItemWidth(item.id, width.value, width); });
      controls.append(field('宽度 / \\linewidth', width));
      var slider = input('range', item.width, item.name + ' 宽度滑块');
      slider.min = '0.02'; slider.max = width.max; slider.step = '0.005';
      slider.value = String(item.width);
      slider.addEventListener('input', function () {
        width.value = slider.value;
        card.style.flexBasis = (Number(slider.value) * 100) + '%';
      });
      slider.addEventListener('change', function () { setItemWidth(item.id, slider.value, slider); });
      controls.append(slider);
      var label = input('text', item.label, item.name + ' 的 label');
      label.placeholder = 'fig:detail';
      label.addEventListener('input', function () { item.label = label.value; commit(false); });
      controls.append(field('Label', label));
      var movers = node('div', 'figure-move-actions');
      var left = button('←', '在当前行向左移动 ' + item.name, function () { move(item.id, row.id, itemIndex - 1); }, 'icon-button');
      left.disabled = itemIndex === 0;
      var right = button('→', '在当前行向右移动 ' + item.name, function () { move(item.id, row.id, itemIndex + 2); }, 'icon-button');
      right.disabled = itemIndex === row.items.length - 1;
      var up = button('↑', '把 ' + item.name + ' 移到上一行', function () { var target = data.rows[rowIndex - 1]; if (target) move(item.id, target.id, target.items.length); }, 'icon-button');
      up.disabled = rowIndex === 0 || data.rows[rowIndex - 1].items.length >= 3;
      var down = button('↓', '把 ' + item.name + ' 移到下一行', function () { var target = data.rows[rowIndex + 1]; if (target) move(item.id, target.id, target.items.length); }, 'icon-button');
      down.disabled = rowIndex === data.rows.length - 1 || data.rows[rowIndex + 1].items.length >= 3;
      movers.append(left, right, up, down); controls.append(movers); card.append(controls);
      return card;
    }
    function renderRow(row, rowIndex, countBefore) {
      var result = node('section', 'figure-row');
      var heading = node('div', 'figure-row-heading');
      heading.append(node('span', 'section-label', '第 ' + (rowIndex + 1) + ' 行'), node('span', 'figure-row-meta muted', row.items.length + ' / 3 张'));
      var actions = node('div', 'figure-row-actions');
      if (row.items.length) actions.append(button('均分宽度', '按当前水平间隔均分本行图片宽度', function () { distribute(row, data.gap); notify('本行图片宽度已均分。'); commit(); }, 'text-button'));
      var add = button('+ 图片', '给第 ' + (rowIndex + 1) + ' 行添加图片', function () { openPicker(row.id); }, 'text-button');
      add.disabled = row.items.length >= 3; actions.append(add);
      actions.append(button('删除行', '删除第 ' + (rowIndex + 1) + ' 行及其图片', function () {
        data.rows.splice(rowIndex, 1); if (!imageById(selected)) selected = 'global'; notify('已删除此行，可使用撤销恢复。'); commit();
      }, 'text-button danger'));
      heading.append(actions); result.append(heading);
      var strip = node('div', 'figure-strip');
      strip.style.display = 'flex'; strip.style.gap = (data.gap * 100) + '%';
      strip.style.alignItems = data.align === 'bottom' ? 'flex-end' : 'flex-start';
      strip.addEventListener('dragover', function (event) { event.preventDefault(); strip.classList.add('is-drag-over'); });
      strip.addEventListener('dragleave', function (event) { if (!strip.contains(event.relatedTarget)) strip.classList.remove('is-drag-over'); });
      strip.addEventListener('drop', function (event) { dropOn(event, row.id, row.items.length); });
      row.items.forEach(function (item, i) { strip.append(imageCard(item, row, rowIndex, i, countBefore + i + 1)); });
      if (!row.items.length) {
        var empty = node('div', 'figure-row-empty');
        empty.append(node('span', '', '把图片拖到这里，或从本地选择文件'), button('选择图片', '为当前行选择本地图片', function () { openPicker(row.id); }, 'secondary'));
        strip.append(empty);
      }
      result.append(strip);
      var total = budget(row, data.gap);
      var used = node('div', 'figure-budget' + (total > 1.000001 ? ' is-error' : ''));
      var parts = row.items.map(function (item) { return format(item.width); });
      var formula = row.items.length ? parts.join(' + ') + (row.items.length > 1 ? ' + ' + (row.items.length - 1) + ' × ' + format(data.gap) + '（间隔）' : '') : '空行导出时自动跳过';
      used.append(node('span', 'muted', formula), node('strong', '', row.items.length ? '= ' + format(total) + ' / 1.0' : ''));
      result.append(used);
      return result;
    }
    function render() {
      object.replaceChildren();
      data.captionStyle = styleOf(data.captionStyle);
      data.rows.forEach(function (row) { row.items.forEach(function (item) { item.style = styleOf(item.style); }); });
      var toolbar = node('div', 'editor-toolbar');
      var actions = node('div', 'figure-toolbar-actions');
      actions.append(button('+ 添加图片', '从本地添加 PNG、JPEG、SVG 或 PDF 图片', function () { openPicker(); }, 'primary'));
      var addRow = button('+ 添加一行', '添加一行，最多排布三张图片；原型最多 ' + rowLimit() + ' 行', function () {
        if (data.rows.length >= rowLimit()) { notify('当前原型最多支持 ' + rowLimit() + ' 行，请先删除空行。', true); return; }
        data.rows.push({ id: uid('row'), items: [] }); notify('新行已添加，可放入 1–3 张图片。'); commit();
      }, 'secondary');
      addRow.disabled = data.rows.length >= rowLimit(); actions.append(addRow);
      actions.append(button('载入示例', '载入系统架构与延迟图示例，替换当前图片布局', function () {
        data.rows = [{ id: uid('row'), items: [
          { id: uid('image'), name: 'architecture.svg', src: trustedSvg('architecture'), width: 0.49, caption: '系统架构', label: 'fig:architecture', style: copy(defaults) },
          { id: uid('image'), name: 'latency.svg', src: trustedSvg('latency'), width: 0.49, caption: '端到端延迟对比', label: 'fig:latency', style: copy(defaults) }
        ] }];
        data.gap = 0.02; data.caption = '系统架构与端到端延迟对比。'; data.label = 'fig:overview'; selected = 'global';
        notify('示例已载入。图中的 SVG 可随项目保存，导出代码使用 architecture.svg 和 latency.svg。'); commit();
      }, 'secondary'));
      toolbar.append(actions, node('span', 'muted', '本地读取 · 不上传文件'));
      object.append(toolbar);
      filePicker = input('file', '', '选择本地图片'); filePicker.multiple = true;
      filePicker.accept = '.png,.jpg,.jpeg,.svg,.pdf,image/png,image/jpeg,image/svg+xml,application/pdf'; filePicker.hidden = true;
      filePicker.addEventListener('change', function () { var files = Array.from(filePicker.files); filePicker.value = ''; if (files.length) loadFiles(files, pendingRowId); });
      object.append(filePicker);
      var settings = node('div', 'figure-layout-panel field-row');
      var span = select([['single', '单栏 · figure'], ['double', '跨双栏 · figure*']], data.span, '图片栏宽模式');
      span.addEventListener('change', function () { data.span = span.value; notify('已切换栏宽环境；预览仅示意相对布局。'); commit(); });
      settings.append(field('栏宽模式', span));
      var width = input('number', format(data.width), '元素整体宽度'); width.min = '0.2'; width.max = '1'; width.step = '0.05';
      width.addEventListener('change', function () {
        var number = Number(width.value);
        if (!Number.isFinite(number) || number < 0.2 || number > 1) { width.value = format(data.width); notify('整体宽度需在 0.2–1 \\linewidth 之间。', true); return; }
        data.width = number; notify('整体宽度已更新。'); commit();
      }); settings.append(field('整体宽度 / \\linewidth', width));
      var gap = input('number', format(data.gap), '子图水平间隔'); gap.min = '0'; gap.max = '0.15'; gap.step = '0.01';
      gap.addEventListener('change', function () {
        var number = Number(gap.value);
        if (!Number.isFinite(number) || number < 0 || number > 0.15) { gap.value = format(data.gap); notify('水平间隔需在 0–0.15 \\linewidth 之间。', true); return; }
        var fitted = false;
        data.rows.forEach(function (row) {
          var available = 1 - Math.max(0, row.items.length - 1) * number;
          var totalWidths = row.items.reduce(function (sum, item) { return sum + item.width; }, 0);
          if (totalWidths > available + 0.000001) {
            row.items.forEach(function (item) { item.width = Math.floor(item.width / totalWidths * available * 1000000) / 1000000; }); fitted = true;
          }
        });
        data.gap = number;
        notify(fitted ? '水平间隔已更新；超出预算的行已等比例缩小图片宽度。' : '水平间隔已更新。'); commit();
      }); settings.append(field('子图间隔 / \\linewidth', gap));
      var align = select([['top', '顶部对齐'], ['bottom', '底部对齐']], data.align, '同一行图片的对齐方式');
      align.addEventListener('change', function () { data.align = align.value; commit(); }); settings.append(field('行内对齐', align));
      var globalLabel = input('text', data.label, '整组图片的 label'); globalLabel.placeholder = 'fig:overview';
      globalLabel.addEventListener('input', function () { data.label = globalLabel.value; commit(false); }); settings.append(field('总 Label', globalLabel));
      object.append(settings);
      toolsHost = node('div', 'figure-caption-tools field-row'); object.append(toolsHost); renderTools();
      var canvasHeader = node('div', 'figure-canvas-header');
      canvasHeader.append(node('span', 'section-label', '图片布局画布'), node('span', 'muted', '点击图注编辑 · 拖动 ⠿ 调整顺序'));
      object.append(canvasHeader);
      var paper = node('div', 'paper-preview figure-paper');
      var paperContext = node('div', 'figure-paper-context', data.span === 'double' ? '跨双栏 · 文章正文宽度' : '单栏 · 当前栏宽度');
      paper.append(paperContext);
      var body = node('div', 'figure-content'); body.style.width = (data.width * 100) + '%'; body.style.marginInline = 'auto';
      if (!data.rows.length) {
        var empty = node('div', 'figure-empty-state');
        empty.append(node('div', 'figure-empty-icon', '▧'), node('h3', '', '把论文里的图片排在一起'), node('p', 'muted', '支持单图、二联图和三联图。选择本地图片后，直接编辑图注并调整宽度。'), button('选择本地图片', '选择本地图片开始排布', function () { openPicker(); }, 'primary'));
        empty.addEventListener('dragover', function (event) { event.preventDefault(); empty.classList.add('is-drag-over'); });
        empty.addEventListener('dragleave', function () { empty.classList.remove('is-drag-over'); });
        empty.addEventListener('drop', function (event) { event.preventDefault(); if (event.dataTransfer.files.length) loadFiles(event.dataTransfer.files); });
        body.append(empty);
      }
      var count = 0;
      data.rows.forEach(function (row, i) { body.append(renderRow(row, i, count)); count += row.items.length; });
      var globalCaption = node('div', 'figure-global-caption');
      globalCaption.append(node('span', 'figure-caption-prefix', 'Figure 1.'), captionEditor(data.caption, 'global', '点击输入整组图片的 caption…', function (value) { data.caption = value; }));
      body.append(globalCaption); paper.append(body); object.append(paper);
      var footnote = node('p', 'figure-help muted', '宽度和水平间隔均相对于当前容器的 \\linewidth。PNG / JPEG / PDF 导出 includegraphics，SVG 导出 includesvg；SVG 编译需要 Inkscape 和 shell-escape。浏览器预览为布局示意。');
      object.append(footnote);
      object.append(node('p', 'figure-media-budget muted', '本地图片：单文件最多 10 MiB；编码后的内嵌数据合计最多 60 MiB，当前 ' + (mediaUsage() / 1024 / 1024).toFixed(1) + ' MiB。'));
      statusElement = node('div', 'editor-status figure-status' + (statusError ? ' is-error' : ''), statusMessage);
      statusElement.setAttribute('role', 'status'); statusElement.setAttribute('aria-live', 'polite'); object.append(statusElement);
    }
    render();
    return {
      refresh: function (nextData) { if (!dead) { data = copy(nextData); render(); } },
      destroy: function () { dead = true; host.replaceChildren(); }
    };
  }

  window.FigureEditor = { mount: mount };
}());
