(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const core = window.ToolboxCore;
  if (!core || !window.TableEditor || !window.FigureEditor) {
    $('editor-host').textContent = '编辑器未能加载，请确保 core.js、table-editor.js、figure-editor.js 与 index.html 位于同一目录。';
    return;
  }
  let project = core.createProject();
  let editor, lastSnapshot = '', undoStack = [], redoStack = [], saveTimer, toastTimer;
  let codeTab = 'code', currentExport = {code:'',packages:[],warnings:[]}, csvText = '', csvRows = [];
  let ready = false, saveRevision = 0, dbPromise;
  const clone = value => JSON.parse(JSON.stringify(value));
  // History shares immutable image data; formatting edits must not copy megabytes per keystroke.
  const assetPool = new Map(), assetIds = new Map(); let assetCounter = 0;
  function snapshotProject() { return JSON.stringify(project,(key,value)=>{if(key==='src' && typeof value==='string' && value.startsWith('data:')){let id=assetIds.get(value);if(!id){id=String(++assetCounter);assetIds.set(value,id);assetPool.set(id,value);}return '@asset:'+id;}return value;}); }
  function parseSnapshot(snapshot) { return JSON.parse(snapshot,(key,value)=>key==='src' && typeof value==='string' && value.startsWith('@asset:') ? assetPool.get(value.slice(7)) || '' : value); }
  function trimHistory() {
    function collect(){const used=new Set();for(const snapshot of [lastSnapshot,...undoStack,...redoStack])for(const match of snapshot.matchAll(/"src":"@asset:(\d+)"/g))used.add(match[1]);let size=0;for(const [id,src] of assetPool){if(!used.has(id)){assetPool.delete(id);assetIds.delete(src);}else size+=src.length;}return size;}
    let size=collect();
    while((size>120*1024*1024 || undoStack.reduce((n,s)=>n+s.length,0)>8*1024*1024) && undoStack.length){undoStack.shift();size=collect();}
    while(size>120*1024*1024 && redoStack.length){redoStack.shift();size=collect();}
  }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3500); }
  function status(message, error = false) { $('save-status').textContent = message; $('save-status').classList.toggle('error',error); }
  function historyButtons() { $('undo').disabled = !undoStack.length; $('redo').disabled = !redoStack.length; }
  function commit() {
    const next = snapshotProject();
    if (next === lastSnapshot) return;
    if (lastSnapshot) undoStack.push(lastSnapshot);
    if (undoStack.length > 35) undoStack.shift();
    redoStack = []; lastSnapshot = next; trimHistory(); historyButtons(); renderCode(); scheduleSave();
  }
  function mountEditor() {
    if (editor) editor.destroy();
    document.querySelectorAll('[data-editor]').forEach(button => { const active = button.dataset.editor === project.active; button.classList.toggle('active',active); if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
    const table = project.active === 'table';
    $('editor-title').textContent = table ? '让表格，井然有序。' : '让每张图，各得其所。';
    $('editor-description').textContent = table ? '在画布上编辑内容，用熟悉的方式完成论文排版。' : '从单图到多联图，把图像与说明排成清晰的一行。';
    $('project-kind').textContent = $('code-kind').textContent = table ? 'TABLE' : 'FIGURE';
    document.querySelector('.editor-number').innerHTML = (table ? '01' : '02') + '<span> / 02</span>';
    $('import-csv').hidden = !table;
    $('project-name').value = project.name;
    const kind = project.active;
    editor = (table ? window.TableEditor : window.FigureEditor).mount($('editor-host'), project[kind], value => { project[kind] = value; commit(); });
    renderCode();
  }
  function highlight(code) {
    const fragment = document.createDocumentFragment();
    code.split('\n').forEach((line,index) => {
      const row = document.createElement('span'); row.className = 'code-line';
      const number = document.createElement('span'); number.className = 'line-no'; number.textContent = index+1; number.setAttribute('aria-hidden','true'); row.append(number);
      const pattern = /(\\[a-zA-Z@]+\*?|%.*$|[{}\[\]])/g;
      let offset = 0;
      for (const match of line.matchAll(pattern)) { row.append(document.createTextNode(line.slice(offset,match.index))); const token=document.createElement('span'); token.className = match[0][0] === '%' ? 'token-comment' : match[0][0] === '\\' ? 'token-command' : 'token-bracket'; token.textContent=match[0]; row.append(token); offset=match.index+match[0].length; }
      row.append(document.createTextNode(line.slice(offset))); fragment.append(row);
    });
    $('latex-code').replaceChildren(fragment);
  }
  function renderCode() {
    try { currentExport = project.active === 'table' ? core.exportTable(project.table) : core.exportFigure(project.figure); }
    catch(error) { currentExport = {code:'% 无法导出：'+error.message,packages:[],warnings:['当前内容需要修正：'+error.message]}; }
    const content = codeTab === 'code' ? currentExport.code : currentExport.packages.join('\n');
    highlight(content || '% 此元素不需要额外宏包。');
    $('line-count').textContent = content.split('\n').length + ' 行';
    $('package-count').textContent = currentExport.packages.length;
    $('export-warnings').replaceChildren(...currentExport.warnings.map(message=>{const p=document.createElement('p');p.textContent='↳ '+message;return p;}));
    $('tab-code').classList.toggle('active',codeTab==='code'); $('tab-code').setAttribute('aria-selected',String(codeTab==='code'));
    $('tab-packages').classList.toggle('active',codeTab==='packages'); $('tab-packages').setAttribute('aria-selected',String(codeTab==='packages'));
  }
  function exportText() { return '% TeX 作坊 · '+(project.active==='table'?'Table':'Figure')+'\n% 将下列宏包放入主文档导言区：\n'+currentExport.packages.map(p=>'% '+p).join('\n')+'\n\n'+currentExport.code+'\n'; }
  function safeName(name) { return String(name || 'latex-project').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().slice(0,100) || 'latex-project'; }
  function download(content,name,type='text/plain;charset=utf-8') { const url=URL.createObjectURL(new Blob([content],{type})); const link=document.createElement('a'); link.href=url; link.download=name; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); }
  async function copy(text) {
    try { if(!navigator.clipboard) throw Error('fallback'); await navigator.clipboard.writeText(text); }
    catch { const input=document.createElement('textarea'); input.value=text;input.style.position='fixed';input.style.left='-9999px';document.body.append(input);input.select();const ok=document.execCommand('copy');input.remove();if(!ok) throw Error('浏览器未允许复制，请下载 .tex 或在代码框中选择复制。'); }
  }
  function openDB() {
    if (!dbPromise) dbPromise = new Promise((resolve,reject)=>{
      if(!window.indexedDB) return reject(Error('IndexedDB unavailable'));
      const request=indexedDB.open('tex-workbench-local',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('projects');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return dbPromise;
  }
  async function persist(snapshot, revision) {
    try {
      const db=await openDB();
      await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(JSON.parse(snapshot),'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
      if(revision===saveRevision) status('已保存到浏览器');
    } catch {
      try { localStorage.setItem('tex-workbench-current',snapshot); if(revision===saveRevision) status('已保存到浏览器'); }
      catch { status('请下载项目备份',true); if(!persist.warned){toast('浏览器存储不可用或空间不足，请点击“保存项目”下载备份。');persist.warned=true;} }
    }
  }
  function scheduleSave() { if(!ready)return; clearTimeout(saveTimer);status('正在保存…');const revision=++saveRevision;saveTimer=setTimeout(()=>persist(JSON.stringify(project),revision),450); }
  async function restore() {
    let saved;
    try { const db=await openDB();saved=await new Promise((resolve,reject)=>{const req=db.transaction('projects','readonly').objectStore('projects').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); } catch {}
    if(!saved) {try{const raw=localStorage.getItem('tex-workbench-current');if(raw)saved=JSON.parse(raw);}catch{}}
    if(saved) {try{project=core.normalizeProject(saved);status('已恢复本地项目');}catch{status('备份格式异常',true);toast('未能恢复旧项目，已载入示例。');}} else status('已就绪');
    ready=true;lastSnapshot=snapshotProject();mountEditor();historyButtons();
  }
  function restoreSnapshot(snapshot) { project=core.normalizeProject(parseSnapshot(snapshot));lastSnapshot=snapshotProject();trimHistory();mountEditor();historyButtons();scheduleSave(); }
  function detectDelimiter(text) { const choices=[',','\t',';'];let best=',',count=0;for(const delimiter of choices){try{const rows=core.parseCSV(text,delimiter);const width=Math.max(...rows.slice(0,10).map(row=>row.length));if(width>count){best=delimiter;count=width;}}catch{}}return best; }
  function csvDelimiter() {const value=$('csv-delimiter').value;return value==='auto'?detectDelimiter(csvText):value==='tab'?'\t':value;}
  function previewCSV() {
    try {
      csvRows=core.parseCSV(csvText,csvDelimiter());
      if(!csvRows.length || (csvRows.length===1 && csvRows[0].every(value=>!value)))throw Error('文件里没有可导入的数据。');
      const columns=Math.max(...csvRows.map(row=>row.length));
      if(csvRows.length>core.limits.rows || columns>core.limits.cols)throw Error('原型最多支持 '+core.limits.rows+' 行、'+core.limits.cols+' 列，请缩小 CSV 后再导入。');
      $('csv-summary').textContent=csvRows.length+' 行 × '+columns+' 列 · 预览前 6 行、前 8 列';
      const table=document.createElement('table');
      csvRows.slice(0,6).forEach(row=>{const tr=document.createElement('tr');for(let c=0;c<Math.min(columns,8);c++){const td=document.createElement('td');td.textContent=row[c]||'';tr.append(td);}table.append(tr);});
      $('csv-preview').replaceChildren(table);$('csv-error').textContent='';$('csv-confirm').disabled=false;
    }catch(error){csvRows=[];$('csv-summary').textContent='';$('csv-preview').replaceChildren();$('csv-error').textContent=error.message;$('csv-confirm').disabled=true;}
  }
  function importCSV() {
    if(!csvRows.length)return;
    try {
      // Re-serialize the parsed matrix so all delimiter modes use the same core import path.
      const canonical=csvRows.map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n');
      const table=core.importCSV(canonical);const previous=project.table;
      for(const key of ['mode','span','width','caption','label','captionStyle'])if(previous[key]!==undefined)table[key]=clone(previous[key]);
      table.header=$('csv-header').checked;
      if(!table.header && table.cells[0])table.cells[0].forEach(cell=>cell.style.bold=false);
      project.table=table;project.active='table';commit();mountEditor();toast('已导入 '+table.rows+' 行 × '+table.cols+' 列。');
    }catch(error){toast('导入失败：'+error.message);}
  }
  // Small, dependency-free ZIP writer (STORE). UTF-8 filenames; original image bytes retained.
  const encoder=new TextEncoder();
  let crcTable;
  function crc32(bytes){if(!crcTable){crcTable=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0;}}let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
  function zipFiles(files){const chunks=[],central=[];let offset=0,centralSize=0;for(const file of files){const name=encoder.encode(file.name),data=typeof file.data==='string'?encoder.encode(file.data):file.data;const crc=crc32(data);const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);chunks.push(local,data);const directory=new Uint8Array(46+name.length),d=new DataView(directory.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);directory.set(name,46);central.push(directory);centralSize+=directory.length;offset+=local.length+data.length;}const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);return new Blob([...chunks,...central,end],{type:'application/zip'});}
  function dataBytes(src){const comma=src.indexOf(',');if(comma<0)throw Error('图片内容缺失');if(/;base64/i.test(src.slice(0,comma))){const binary=atob(src.slice(comma+1));return Uint8Array.from(binary,c=>c.charCodeAt(0));}return encoder.encode(decodeURIComponent(src.slice(comma+1)));}
  function exportZIP(){
    const files=[{name:project.active+'.tex',data:exportText()},{name:'README.txt',data:'TeX 作坊导出\n\n1. 将 .tex 中注释列出的宏包加入主文档导言区。\n2. 将浮动体代码粘贴到正文。\n3. 图片仅引用文件名，请复制到实际工程目录或自行修改引用路径。\n4. SVG 自动转换需要 Inkscape 和 shell-escape；中文请使用支持中文的编译配置。\n5. 浏览器预览不保证与 PDF 的字体和换行完全一致。\n\n'+currentExport.warnings.join('\n')}];
    if(project.active==='figure'){
      const seen=new Map();
      for(const row of project.figure.rows)for(const item of row.items){if(!item.src)continue;const name=core.assetFilename?core.assetFilename(item.name):String(item.name).split(/[\\/]/).pop();if(!name || name==='.' || name==='..' || files.some(file=>file.name===name))throw Error('图片文件名与导出文件冲突，请重命名图片。');if(seen.has(name)){if(seen.get(name)!==item.src)throw Error('不同图片使用同一文件名“'+name+'”，请先重命名。');continue;}seen.set(name,item.src);files.push({name,data:dataBytes(item.src)});}
    }
    download(zipFiles(files),safeName(project.name)+'-'+project.active+'.zip','application/zip');toast('已导出代码'+(project.active==='figure'?'与原图':'')+'。');
  }
  document.querySelectorAll('[data-editor]').forEach(button=>button.addEventListener('click',()=>{if(project.active===button.dataset.editor)return;document.activeElement?.blur();project.active=button.dataset.editor;commit();mountEditor();}));
  $('project-name').addEventListener('change',()=>{project.name=$('project-name').value.trim()||'未命名项目';$('project-name').value=project.name;commit();});
  $('undo').addEventListener('click',()=>{if(!undoStack.length)return;redoStack.push(lastSnapshot);restoreSnapshot(undoStack.pop());});
  $('redo').addEventListener('click',()=>{if(!redoStack.length)return;undoStack.push(lastSnapshot);restoreSnapshot(redoStack.pop());});
  $('new-project').addEventListener('click',()=>{document.activeElement?.blur();project=core.createProject();project.name='未命名项目';commit();mountEditor();toast('已新建项目，可撤销返回原项目。');});
  $('save-project').addEventListener('click',()=>{document.activeElement?.blur();download(JSON.stringify(project,null,2),safeName(project.name)+'.texproject.json','application/json');toast('项目已下载，包含布局、样式与图片。');});
  $('import-project').addEventListener('click',()=>$('project-file').click());
  $('project-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>80*1024*1024)throw Error('项目超过 80 MiB，请减少图片后重试。');const imported=core.normalizeProject(JSON.parse(await file.text()));const mediaSize=imported.figure.rows.reduce((total,row)=>total+row.items.reduce((n,item)=>n+item.src.length,0),0);if(mediaSize>60*1024*1024)throw Error('内嵌图片数据超过 60 MiB，请减少图片后重试。');document.activeElement?.blur();project=imported;commit();mountEditor();toast('项目已打开。');}catch(error){toast('打开失败：'+error.message);}});
  $('import-csv').addEventListener('click',()=>$('csv-file').click());
  $('csv-file').addEventListener('change',async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;try{if(file.size>5*1024*1024)throw Error('CSV 超过 5 MB，请精简后重试。');csvText=await file.text();$('csv-delimiter').value='auto';previewCSV();$('csv-dialog').showModal();}catch(error){toast('读取失败：'+error.message);}});
  $('csv-delimiter').addEventListener('change',previewCSV);
  $('csv-dialog').addEventListener('close',()=>{if($('csv-dialog').returnValue==='default')importCSV();});
  $('tab-code').addEventListener('click',()=>{codeTab='code';renderCode();});$('tab-packages').addEventListener('click',()=>{codeTab='packages';renderCode();});
  $('copy-code').addEventListener('click',async()=>{document.activeElement?.blur();try{await copy(codeTab==='packages'?currentExport.packages.join('\n'):exportText());toast('已复制'+(codeTab==='packages'?'宏包清单':'LaTeX 代码')+'。');}catch(error){toast(error.message);}});
  $('download-tex').addEventListener('click',()=>{document.activeElement?.blur();download(exportText(),safeName(project.name)+'-'+project.active+'.tex');toast('LaTeX 代码已下载。');});
  $('download-zip').addEventListener('click',()=>{document.activeElement?.blur();try{exportZIP();}catch(error){toast('导出失败：'+error.message);}});
  $('help-button').addEventListener('click',()=>$('help-dialog').showModal());$('close-help').addEventListener('click',()=>$('help-dialog').close());
  document.addEventListener('keydown',event=>{const target=event.target;const editing=target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&!editing){event.preventDefault();$(event.shiftKey?'redo':'undo').click();}});
  window.addEventListener('pagehide',()=>{if(ready){clearTimeout(saveTimer);persist(JSON.stringify(project),++saveRevision);}});
  window.ToolboxApp={getProject:()=>clone(project),getExport:()=>clone(currentExport),zipFiles,exportText};
  restore();
})();
