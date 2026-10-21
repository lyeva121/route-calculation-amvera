const COLS = ['point','zmpu','distance','windDir','windSpeed','mk','time','note'];
const ROW_KEYS = ['point','zmpu','distance','windDir','windSpeed','note'];
let rows = [];
let history = [];
let historyPos = -1;
let totalDistance = 0;
let totalTime = '0:00';
let restoring = false;

const $ = (id)=>document.getElementById(id);
const tbody = $('tbody');

function cellInput(row, key){ return row.querySelector(`[data-key="${key}"]`); }
function num(v){ return Number(String(v ?? '').replace(',', '.').trim()); }
function val(row,key){ const el = cellInput(row,key); return el && 'value' in el ? el.value.trim() : ''; }
function setVal(row,key,value){ const el = cellInput(row,key); if(el){ el.value = value ?? ''; if(key==='note') resizeNote(el); } }
function setText(row,key,value){ const el = row.querySelector(`[data-key="${key}"]`); if(el){ el.textContent = value ?? ''; } }
function validateAngle(value, label){ if(value < 0 || value > 359){ alert(`${label} должен быть в диапазоне 0–359`); return false; } return true; }
function hMin(min){ return `${Math.floor(min/60)}:${String(min%60).padStart(2,'0')}`; }

function createRow(first=false){
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><input class="point" data-key="point"></td><td><input data-key="zmpu" inputmode="decimal"></td><td><input data-key="distance" inputmode="decimal"></td><td><input data-key="windDir" inputmode="decimal"></td><td><input data-key="windSpeed" inputmode="decimal"></td><td class="mk" data-key="mk"></td><td class="time" data-key="time"></td><td><textarea class="note" data-key="note" rows="1" wrap="soft"></textarea></td>`;
  if(first){ cellInput(tr,'zmpu').disabled = true; cellInput(tr,'distance').disabled = true; setText(tr,'mk','—'); setText(tr,'time','—'); }
  tr.addEventListener('input', e => { if(e.target.dataset.key==='note') resizeNote(e.target); scheduleHistory(); });
  tbody.appendChild(tr); rows.push(tr); return tr;
}
function addDefaultRows(){ for(let i=0;i<10;i++) createRow(i===0); }
function snapshot(){ return {speed:$('speed').value, sameWind:$('sameWind').checked, rows:rows.map(r=>Object.fromEntries(ROW_KEYS.map(k=>[k,val(r,k)])))}; }
function applyState(st){ restoring = true; $('speed').value = st.speed || ''; $('sameWind').checked = !!st.sameWind; while(rows.length < (st.rows||[]).length) createRow(false); rows.forEach((r,i)=>{ ROW_KEYS.forEach(k=>setVal(r,k, st.rows?.[i]?.[k] || '')); setText(r,'mk', i===0 ? '—' : ''); setText(r,'time', i===0 ? '—' : ''); }); restoring = false; }
function pushHistory(){ if(restoring) return; const st = snapshot(); if(history[historyPos] && JSON.stringify(history[historyPos])===JSON.stringify(st)) return; history = history.slice(0, historyPos+1); history.push(st); if(history.length>21) history.shift(); historyPos = history.length-1; }
let histTimer; function scheduleHistory(){ clearTimeout(histTimer); histTimer=setTimeout(pushHistory,500); }
function undo(){ if(historyPos<=0) return; historyPos--; applyState(history[historyPos]); }
function redo(){ if(historyPos>=history.length-1) return; historyPos++; applyState(history[historyPos]); }
function calculateMk(zmpu, windDir, windSpeed, speed){ const angle = (windDir + 180 - zmpu) * Math.PI/180; const correction = (windSpeed / speed) * Math.sin(angle) * 57.3; return ((pyRound(zmpu - correction) % 360) + 360) % 360; }
function calculateTime(distance,zmpu,windDir,windSpeed,speed){ const angle=(windDir+180-zmpu)*Math.PI/180; const groundSpeed=speed + windSpeed*Math.cos(angle); return groundSpeed>0 ? distance/groundSpeed : 0; }

function onSameWindToggle(){ if(!$('sameWind').checked) return; let wd='', ws=''; for(const r of rows){ if(val(r,'windDir') || val(r,'windSpeed')){ wd=val(r,'windDir'); ws=val(r,'windSpeed'); break; }} if(wd && !validateAngle(num(wd),'Направление ветра')) return; pushHistory(); rows.forEach(r=>{ if(val(r,'point')){ setVal(r,'windDir',wd); setVal(r,'windSpeed',ws); }}); pushHistory(); }
function calculateRoute(){
  const speed = num($('speed').value); if(!speed || speed<=0){ alert('Не задана или некорректна скорость. Проверьте данные перед расчётом.'); return false; }
  document.querySelectorAll('.invalid').forEach(e=>e.classList.remove('invalid'));
  const missing=[];
  rows.forEach((r,i)=>{ const p=val(r,'point'); if(!p){ if(['zmpu','distance','windDir','windSpeed','note'].some(k=>val(r,k))) missing.push(`строка ${i+1}: ППМ`); return; } if(i===0){ if(Boolean(val(r,'windDir'))!==Boolean(val(r,'windSpeed'))) missing.push(`ППМ '${p}': направление/скорость ветра`); return; } if(!val(r,'zmpu')) missing.push(`ППМ '${p}': ЗМПУ`); if(!val(r,'distance')) missing.push(`ППМ '${p}': Расстояние`); if(Boolean(val(r,'windDir'))!==Boolean(val(r,'windSpeed'))) missing.push(`ППМ '${p}': направление/скорость ветра`); });
  if(missing.length && !confirm('Обнаружены пропущенные или неполные данные:\n\n'+missing.slice(0,12).join('\n')+(missing.length>12?`\n… и ещё ${missing.length-12}`:'')+'\n\nПродолжить расчёт?')) return false;
  if($('sameWind').checked){ let td='',ts=''; for(const r of rows){ if(val(r,'point') && (val(r,'windDir')||val(r,'windSpeed'))){ td=val(r,'windDir'); ts=val(r,'windSpeed'); break; }} if(td||ts) rows.forEach(r=>{ if(val(r,'point') && !val(r,'windDir') && !val(r,'windSpeed')){ setVal(r,'windDir',td); setVal(r,'windSpeed',ts); }}); }
  else { let cd='',cs=''; rows.forEach(r=>{ if(!val(r,'point')) return; if(val(r,'windDir')||val(r,'windSpeed')){ cd=val(r,'windDir'); cs=val(r,'windSpeed'); } else if(cd||cs){ setVal(r,'windDir',cd); setVal(r,'windSpeed',cs); }}); }
  let totalMin=0,totalDist=0, activeDir=null, activeSpeed=null;
  rows.forEach((r,i)=>{ if(i===0){ if(val(r,'windDir')){ activeDir=num(val(r,'windDir')); if(!validateAngle(activeDir,'Направление ветра')) throw new Error('bad'); } if(val(r,'windSpeed')) activeSpeed=num(val(r,'windSpeed')); return; } if(!val(r,'point')) return; const z=num(val(r,'zmpu')), dist=num(val(r,'distance')); if(Number.isNaN(z)||Number.isNaN(dist)) return; if(!validateAngle(z,'ЗМПУ')) throw new Error('bad'); let nextDir=activeDir, nextSpeed=activeSpeed; if(val(r,'windDir')){ nextDir=num(val(r,'windDir')); if(!validateAngle(nextDir,'Направление ветра')) throw new Error('bad'); } if(val(r,'windSpeed')) nextSpeed=num(val(r,'windSpeed')); if(activeDir===null || activeSpeed===null){ alert(`Не заданы параметры ветра для участка до ППМ '${val(r,'point')}'`); throw new Error('wind'); } const mk=calculateMk(z,activeDir,activeSpeed,speed); const minutes=Math.round(calculateTime(dist,z,activeDir,activeSpeed,speed)*60); totalMin+=minutes; totalDist+=dist; setText(r,'mk',String(mk)); setText(r,'time',`${hMin(minutes)} / ${hMin(totalMin)}`); activeDir=nextDir; activeSpeed=nextSpeed; });
  totalDistance=Math.round(totalDist); totalTime=hMin(totalMin); $('result').textContent=`Общее расстояние: ${totalDistance} км\nОбщее время: ${totalTime}`; return true;
}
function safeCalculate(){ try{return calculateRoute()}catch(e){return false} }
function removeWind(){ pushHistory(); rows.forEach((r,i)=>{ setVal(r,'windDir',''); setVal(r,'windSpeed',''); setText(r,'mk',i===0?'—':''); setText(r,'time',i===0?'—':''); }); totalDistance=0; totalTime='0:00'; $('result').textContent=''; pushHistory(); }
function newRoute(){ if(!confirm('Очистить текущий маршрут?')) return; restoring=true; tbody.innerHTML=''; rows=[]; $('speed').value=''; $('sameWind').checked=false; $('result').textContent=''; $('warning').classList.add('hidden'); addDefaultRows(); restoring=false; history=[]; historyPos=-1; pushHistory(); }
function saveRoute(){ const data={speed:$('speed').value, rows:rows.map(r=>({point:val(r,'point'), zmpu:val(r,'zmpu'), distance:val(r,'distance'), note:val(r,'note')}))}; download(`route-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(data,null,4), 'application/json'); }
function openRoute(file){ if(!file) return; const reader=new FileReader(); reader.onload=()=>{ try{ const data=JSON.parse(reader.result); restoring=true; tbody.innerHTML=''; rows=[]; addDefaultRows(); $('speed').value=data.speed||''; (data.rows||[]).forEach((item,i)=>{ while(rows.length<=i) createRow(false); setVal(rows[i],'point',item.point||''); setVal(rows[i],'note',item.note||''); if(i!==0){ setVal(rows[i],'zmpu',item.zmpu||''); setVal(rows[i],'distance',item.distance||''); }}); restoring=false; pushHistory(); }catch(e){ alert('Не удалось открыть JSON-файл'); }}; reader.readAsText(file); $('openRoute').value=''; }
function reverseRoute(){ const currSpeed=$('speed').value, currSame=$('sameWind').checked; const route=rows.filter(r=>val(r,'point')).map(r=>({point:val(r,'point'),zmpu:val(r,'zmpu'),distance:val(r,'distance'),windDir:val(r,'windDir'),windSpeed:val(r,'windSpeed'),note:cellInput(r,'note').value})); if(route.length<2){ alert('Недостаточно ППМ'); return; } pushHistory(); const n=route.length, rev=[...route].reverse(), effD=Array(n).fill(''), effS=Array(n).fill(''); let cd='',cs=''; for(let i=1;i<n;i++){ if(route[i-1].windDir) cd=route[i-1].windDir; if(route[i-1].windSpeed) cs=route[i-1].windSpeed; effD[i]=cd; effS[i]=cs; } const legs=[]; for(let j=1;j<n;j++){ const src=n-j, item=route[src]; const z=num(item.zmpu); legs.push({zmpu:Number.isNaN(z)?'':String(Math.round((z+180)%360)), distance:item.distance, windDir:effD[src], windSpeed:effS[src]}); } restoring=true; tbody.innerHTML=''; rows=[]; addDefaultRows(); $('speed').value=currSpeed; $('sameWind').checked=currSame; while(rows.length<rev.length) createRow(false); rev.forEach((item,i)=>{ setVal(rows[i],'point',item.point); setVal(rows[i],'note', i<n-1 ? route[n-2-i].note : ''); if(i<n-1){ const next=legs[i], prev=i===0?{windDir:'',windSpeed:''}:legs[i-1]; if(next.windDir && (i===0 || next.windDir!==prev.windDir)) setVal(rows[i],'windDir',next.windDir); if(next.windSpeed && (i===0 || next.windSpeed!==prev.windSpeed)) setVal(rows[i],'windSpeed',next.windSpeed); } if(i>0){ setVal(rows[i],'zmpu',legs[i-1].zmpu); setVal(rows[i],'distance',legs[i-1].distance); }}); restoring=false; pushHistory(); $('warning').classList.remove('hidden'); }
function download(name, content, type){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([content],{type})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
function pdfNoteFontSize(text){
  const len = String(text || '').length;
  if(len > 350) return 6;
  if(len > 220) return 7;
  if(len > 120) return 8;
  return 9;
}
function escPdfText(text){ return String(text ?? ''); }
function exportPdf(){
  if(!window.pdfMake){ alert('Библиотека PDF ещё не загрузилась. Попробуйте снова.'); return; }
  const pdfWindow=window.open('', '_blank');
  if(!pdfWindow){ alert('Разрешите открытие новых вкладок для этого сайта.'); return; }
  pdfWindow.document.body.textContent='Подготовка PDF…';
  const cm = 28.3464567;
  const valid = rows.filter(r=>val(r,'point'));
  const title = valid.length>=2
    ? `Маршрут: ${val(valid[0],'point')} — ${val(valid[valid.length-1],'point')}`
    : valid.length===1 ? `Маршрут: ${val(valid[0],'point')}` : 'Маршрут: —';

  const body = [[
    {text:'ППМ', bold:true, alignment:'center'},
    {text:'S', bold:true, alignment:'center'},
    {text:'МК', bold:true, alignment:'center'},
    {text:'Время', bold:true, alignment:'center'},
    {text:'Примечание', bold:true}
  ]];
  const wind = [];

  rows.forEach((r,i)=>{
    if(!val(r,'point')) return;
    if(val(r,'windDir') || val(r,'windSpeed')){
      wind.push({ppm:val(r,'point'), wind:`${val(r,'windDir')}° / ${val(r,'windSpeed')} км/ч`});
    }
    const note = cellInput(r,'note').value;
    body.push([
      {text:escPdfText(val(r,'point')), alignment:'left'},
      {text:escPdfText(i ? val(r,'distance') : '—'), alignment:'center'},
      {text:escPdfText(i ? r.querySelector('[data-key="mk"]').textContent : '—'), alignment:'center'},
      {text:escPdfText(i ? r.querySelector('[data-key="time"]').textContent : '—'), alignment:'center'},
      {text:escPdfText(note), alignment:'left', fontSize:pdfNoteFontSize(note)}
    ]);
  });

  let windText = 'Ветер по маршруту: —';
  if(wind.length){
    const first = wind[0].wind;
    if(wind.every(w=>w.wind===first)) windText = `Ветер по маршруту: ${first}`;
    else {
      const parts = [first];
      let last = first;
      wind.slice(1).forEach(w=>{
        if(w.wind!==last){ parts.push(`после ППМ ${w.ppm} ${w.wind}`); last=w.wind; }
      });
      windText = `Ветер по маршруту: (${parts.join('; ')})`;
    }
  }

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [1.5*cm, 5*cm, 1.5*cm, 1.5*cm],
    defaultStyle: {font: 'Roboto', fontSize: 9},
    content: [
      {text:title, fontSize:12, margin:[0,0,0,6]},
      {
        table: {
          headerRows: 1,
          widths: [4.0, 1.1, 1.4, 2.8, 4.7].map(w=>w*cm - (40 + 6*0.7)/5),
          body
        },
        layout: {
          fillColor: (rowIndex)=> rowIndex===0 ? '#d9d9d9' : null,
          hLineColor: ()=> '#000000', vLineColor: ()=> '#000000',
          hLineWidth: ()=> 0.7, vLineWidth: ()=> 0.7,
          paddingLeft: ()=> 4, paddingRight: ()=> 4,
          paddingTop: ()=> 3, paddingBottom: ()=> 3
        }
      },
      {text:`Общее расстояние: ${totalDistance} км`, margin:[0,10,0,0]},
      {text:`Общее время: ${totalTime}`, margin:[0,2,0,0]},
      {text:windText, margin:[0,2,0,0]}
    ]
  };
  try { pdfMake.createPdf(docDefinition).open({}, pdfWindow); } catch(e) { pdfWindow.close(); alert('Не удалось создать PDF: '+e.message); }
}
const helpText=`Данное приложение предназначено для подготовки к полету по заранее известному маршруту с учетом ветра.

Пользователь вносит необходимые для приложения данные: ППМ, ЗМПУ и расстояние. Указывает метеорологический ветер, а именно направление (откуда дует) и скорость в км/ч. Если ветер меняется по маршруту, то пользователю достаточно указать данные ветра в ячейках напротив того ППМ, где он изменяется (при расчете маршрута предыдущие ячейки данных ветра заполнятся предыдущими значениями), а последующие ячейки последующими данными ветра. Таким образом, если ветер часто меняется по маршруту, то необходимо указывать его только напротив того ППМ, где он изменился, пустые ячейки заполняться автоматически.

В столбце «Примечание» можно писать любую необходимую пользователю информацию.

Также необходимо заполнить ячейку «Скорость», указав значение в км/ч.

При нажатии кнопки «Расчет» будет выполнен расчет элементов полета по указанным пользователем параметрам ветра, а именно МК и время (время до следующего ППМ и время, накопленное с начала полета).

При нажатии кнопки «PDF» откроется файл с формате .pdf с необходимыми для выполнения полета данными. Этот файл можно распечатать или сохранить.

Кнопка «Сохранить» дает возможность сохранить файл в формате .json для последующего использования этого маршрута в другом полете. Сохраняются все данные, кроме ветра.

Кнопка «Открыть» соответственно дает возможность открыть сохраненные маршруты.

Кнопка «Добавить ППМ» вставляет строку перед строкой курсора. Если курсор вне таблицы — строка добавляется в конец.

Кнопка «Реверс» разворачивает маршрут. ВНИМАНИЕ: при нажатии этой кнопки появляется предупреждение о необходимости проверить соответствие данных в ячейках «Примечание», возможно несовпадение данных с соответствующими ППМ.

Кнопка «Убрать ветер» удаляет данные ветра в текущем маршруте.

Кнопка «Новый маршрут» очищает все ячейки.

Кнопки со стрелками «вперед – назад» позволяют отменить последние 20 изменений.

При внесении данных маршрута перемещать курсор по ячейкам можно с помощью мыши или стрелок на клавиатуре.

Также есть возможность с помощью мыши копировать, вставлять или вырезать отдельные символы, ячейки или целые строки.

Галочка «Ветер по всему маршруту одинаковый» проставляет по всему маршруту данные ветра, указанные в первой строчке.`;
function init(){ addDefaultRows(); $('helpText').textContent=helpText; $('addRow').onclick=insertBeforeCursor; $('undo').onclick=undo; $('redo').onclick=redo; $('sameWind').onchange=onSameWindToggle; $('calculate').onclick=safeCalculate; $('removeWind').onclick=removeWind; $('newRoute').onclick=newRoute; $('saveRoute').onclick=saveRoute; $('openRoute').onchange=e=>openRoute(e.target.files[0]); $('reverse').onclick=reverseRoute; $('pdf').onclick=exportPdf; $('help').onclick=()=>$('helpDialog').showModal(); $('closeHelp').onclick=()=>$('helpDialog').close(); $('closeWarning').onclick=()=>$('warning').classList.add('hidden'); $('speed').addEventListener('input', scheduleHistory); pushHistory(); }

const SELECT_KEYS=['point','zmpu','distance','note'];
let selection=new Set(), anchor=null, draggingCells=false, selectionMode=false, cellClipboard=null;
function resizeNote(el){ el.style.height='auto'; el.style.height=Math.max(30,el.scrollHeight)+'px'; }
function position(el){ const row=el.closest('tr'); return row && rows.includes(row) && el.dataset.key ? [rows.indexOf(row),COLS.indexOf(el.dataset.key)] : null; }
function editable(r,c){ const el=rows[r] && cellInput(rows[r],COLS[c]); return el && !el.disabled && SELECT_KEYS.includes(COLS[c]); }
function paintSelection(){ tbody.querySelectorAll('[data-key]').forEach(el=>{ const pos=position(el); el.classList.toggle('cell-selected',!!pos && selection.has(pos.join(':'))); }); }
function clearCells(){ selection.clear(); paintSelection(); }
function selectRange(a,b){ selection.clear(); for(let r=Math.min(a[0],b[0]);r<=Math.max(a[0],b[0]);r++) for(let c=Math.min(a[1],b[1]);c<=Math.max(a[1],b[1]);c++) if(editable(r,c)) selection.add(r+':'+c); paintSelection(); }
function selectionPayload(){const points=[...selection].map(id=>id.split(':').map(Number));if(!points.length)return null;const rr=[...new Set(points.map(p=>p[0]))].sort((a,b)=>a-b),cc=[...new Set(points.map(p=>p[1]))].sort((a,b)=>a-b);return {height:rr.length,width:cc.length,cells:points.map(([r,c])=>({r:rr.indexOf(r),c:cc.indexOf(c),value:cellInput(rows[r],COLS[c]).value}))};}
function payloadText(data){ const h=1+Math.max(...data.cells.map(p=>p.r)), w=1+Math.max(...data.cells.map(p=>p.c)); const grid=Array.from({length:h},()=>Array(w).fill('')); data.cells.forEach(p=>grid[p.r][p.c]=p.value); return grid.map(row=>row.map(v=>/["\t\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v).join('\t')).join('\n'); }
function eraseCells(){ if(!selection.size)return; pushHistory(); selection.forEach(id=>{const [r,c]=id.split(':').map(Number); if(editable(r,c))setVal(rows[r],COLS[c],'');}); pushHistory(); }
function pastePayload(data){if(!data?.cells?.length)return;const pp=[...selection].map(id=>id.split(':').map(Number)), rr=[...new Set(pp.map(p=>p[0]))].sort((a,b)=>a-b),cc=[...new Set(pp.map(p=>p[1]))].sort((a,b)=>a-b);const h=data.height||1+Math.max(...data.cells.map(p=>p.r)),w=data.width||1+Math.max(...data.cells.map(p=>p.c));if(!pp.length||pp.length!==rr.length*cc.length||h!==rr.length||w!==cc.length){alert(`Количество ячеек не совпадает. Скопировано: ${h} × ${w}. Выделено: ${rr.length} × ${cc.length}. Выделите такой же прямоугольный диапазон.`);return;}flushHistory();data.cells.forEach(p=>{const r=rr[p.r],c=cc[p.c];if(editable(r,c))setVal(rows[r],COLS[c],p.value);});clearCells();pushHistory();}
function textPayload(text){ const cells=[]; let value='',r=0,c=0,quoted=false; for(let i=0;i<=text.length;i++){const ch=text[i]; if(ch==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(ch==='\t'||ch==='\n'||ch===undefined)){cells.push({r,c,value:value.replace(/\r$/,'')}); value='';if(ch==='\t')c++;else{r++;c=0;}}else value+=ch;}return {cells}; }
function initEditing(){
 const toolbar=document.createElement('section'); toolbar.className='cell-tools'; toolbar.innerHTML='<button type="button" id="selectMode">Выделение ячеек</button><button type="button" data-action="copy">Копировать</button><button type="button" data-action="cut">Вырезать</button><button type="button" data-action="paste">Вставить</button><button type="button" data-action="erase">Очистить</button><span>Shift + клик — диапазон; Ctrl + клик — отдельные ячейки</span>'; document.querySelector('.table-wrap').before(toolbar);
 $('selectMode').onclick=()=>{selectionMode=!selectionMode; $('selectMode').classList.toggle('active',selectionMode); if(!selectionMode)clearCells();};
 toolbar.addEventListener('pointerdown',e=>{if(e.target.dataset.action)e.preventDefault();});
 toolbar.addEventListener('click',async e=>{const action=e.target.dataset.action;if(!action)return; if(action==='erase'){eraseCells();return;} if(action==='paste'){if(cellClipboard)pastePayload(cellClipboard);else try{pastePayload(textPayload(await navigator.clipboard.readText()));}catch{alert('Для вставки используйте Ctrl+V.');}return;} const data=selectionPayload();if(!data)return;cellClipboard=data;try{await navigator.clipboard.writeText(payloadText(data));}catch{}if(action==='cut')eraseCells();});
 tbody.addEventListener('pointerdown',e=>{const pos=position(e.target);if(!pos)return;if(selectionMode||e.shiftKey||e.ctrlKey||e.metaKey){if(!editable(...pos))return;e.preventDefault();if(e.shiftKey&&anchor)selectRange(anchor,pos);else if(e.ctrlKey||e.metaKey){const id=pos.join(':');selection.has(id)?selection.delete(id):selection.add(id);paintSelection();anchor=pos;}else{if(selectionMode&&anchor&&selection.size){selectRange(anchor,pos);}else{anchor=pos;selectRange(pos,pos);}}draggingCells=e.pointerType==='mouse';}else{clearCells();anchor=pos;draggingCells=e.pointerType==='mouse';}});
 tbody.addEventListener('pointerover',e=>{const pos=position(e.target);if(draggingCells&&e.buttons===1&&anchor&&pos&&editable(...anchor)&&editable(...pos)&&pos.join(':')!==anchor.join(':'))selectRange(anchor,pos);});
 document.addEventListener('pointerup',()=>draggingCells=false);
 document.addEventListener('copy',e=>{if(!selection.size)return;const data=selectionPayload();cellClipboard=data;e.preventDefault();e.clipboardData.setData('text/plain',payloadText(data));e.clipboardData.setData('application/x-route-cells',JSON.stringify(data));});
 document.addEventListener('cut',e=>{if(!selection.size)return;const data=selectionPayload();cellClipboard=data;e.preventDefault();e.clipboardData.setData('text/plain',payloadText(data));e.clipboardData.setData('application/x-route-cells',JSON.stringify(data));eraseCells();});
 document.addEventListener('paste',e=>{if(!position(e.target)&&!selection.size)return;const raw=e.clipboardData.getData('application/x-route-cells'), text=e.clipboardData.getData('text/plain'); if(!raw&&!selection.size&&!text.includes('\t'))return;e.preventDefault();pastePayload(raw?JSON.parse(raw):(cellClipboard&&payloadText(cellClipboard)===text?cellClipboard:textPayload(text)));});
 document.addEventListener('keydown',e=>{if(selection.size&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();eraseCells();return;} const pos=position(e.target);if(!pos)return; const [r,c]=pos; if(e.shiftKey&&e.key.startsWith('Arrow')){const dr=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0,dc=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;const dest=[r+dr,c+dc];if(editable(...dest)){e.preventDefault();anchor=anchor||pos;selectRange(anchor,dest);cellInput(rows[dest[0]],COLS[dest[1]]).focus();}return;} if(e.target.tagName==='TEXTAREA')return; if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return; // Alt+Enter allows a manual newline in notes; arrows navigate cells.
 const inputs=rows.flatMap(row=>ROW_KEYS.map(k=>cellInput(row,k)).filter(el=>!el.disabled));let next;if(e.key==='ArrowUp'||e.key==='ArrowDown'){next=rows[r+(e.key==='ArrowUp'?-1:1)]&&cellInput(rows[r+(e.key==='ArrowUp'?-1:1)],COLS[c]);}else next=inputs[inputs.indexOf(e.target)+(e.key==='ArrowLeft'?-1:1)];if(next&&!next.disabled){e.preventDefault();clearCells();anchor=position(next);next.focus();next.select();}
 });
 new MutationObserver(()=>{if([...selection].some(id=>!rows[Number(id.split(':')[0])]))clearCells(); tbody.querySelectorAll('textarea').forEach(resizeNote);}).observe(tbody,{childList:true});
}

// Preserve the desktop application's state transitions and wind semantics.
let autoWind = new Map(), lastFocused = null;
function pyRound(x){const f=Math.floor(x), d=x-f;return d===0.5 ? (f%2===0?f:f+1) : Math.round(x);}
function clearResults(){rows.forEach((r,i)=>{setText(r,'mk',i?'':'—');setText(r,'time',i?'':'—');});totalDistance=0;totalTime='0:00';$('result').textContent='';}
function snapshot(){return {speed:$('speed').value,rows:rows.map(r=>Object.fromEntries(ROW_KEYS.map(k=>[k,cellInput(r,k).disabled?'':cellInput(r,k).value]))),results:rows.map(r=>['mk','time'].map(k=>cellInput(r,k).textContent)),auto:rows.map(r=>autoWind.get(r)||null),totalDistance,totalTime,result:$('result').textContent,warning:!$('warning').classList.contains('hidden')};}
function applyState(st){restoring=true;clearCells();tbody.replaceChildren();rows=[];autoWind=new Map();st.rows.forEach((data,i)=>{const r=createRow(i===0);ROW_KEYS.forEach(k=>{if(!cellInput(r,k).disabled)setVal(r,k,data[k]);});['mk','time'].forEach((k,j)=>setText(r,k,st.results?.[i]?.[j]??(i?'':'—')));if(st.auto?.[i])autoWind.set(r,st.auto[i]);});$('speed').value=st.speed;totalDistance=st.totalDistance||0;totalTime=st.totalTime||'0:00';$('result').textContent=st.result||'';$('warning').classList.toggle('hidden',!st.warning);lastFocused=null;restoring=false;}
function flushHistory(){clearTimeout(histTimer);pushHistory();}
function undo(){flushHistory();if(historyPos>0)applyState(history[--historyPos]);}
function redo(){flushHistory();if(historyPos<history.length-1)applyState(history[++historyPos]);}
function calculateRoute(){
 flushHistory();clearResults();document.querySelectorAll('.invalid').forEach(e=>e.classList.remove('invalid'));
 try{
 const speed=num($('speed').value);if(!Number.isFinite(speed)||speed<=0){alert('Не задана или некорректна скорость. Проверьте данные перед расчётом.');return false;}
 const errors=[],missing=[], numeric=/^\d+(?:[.,]\d+)?$/;
 function error(r,k,text){cellInput(r,k).classList.add('invalid');errors.push(text);}
 const used=rows.some((r,i)=>(i?['point','zmpu','distance']:['point']).some(k=>val(r,k)));
 rows.forEach((r,i)=>{const point=val(r,'point'), label=`строка ${i+1}${point?` (ППМ '${point}')`:''}`;
 if(i===0){if(used&&!point)error(r,'point','строка 1: не заполнена ячейка «ППМ»');}
 else if(['point','zmpu','distance'].some(k=>val(r,k))){for(const [k,title] of [['point','ППМ'],['zmpu','ЗМПУ'],['distance','Расстояние']]){const v=val(r,k);if(!v)error(r,k,`${label}: не заполнена ячейка «${title}»`);else if(k!=='point'&&(!(k==='zmpu'?/^\d+$/:numeric).test(v)||!Number.isFinite(num(v))||(k==='zmpu'&&num(v)>359)))error(r,k,`${label}: некорректное значение «${title}»${k==='zmpu'?' (целое число 0–359)':''}`);}}
 if(point||i===0)for(const k of ['windDir','windSpeed']){const v=val(r,k);if(v&&(!numeric.test(v)||!Number.isFinite(num(v))||(k==='windDir'&&num(v)>359)))error(r,k,`${label}: некорректные параметры ветра (направление 0–359°, скорость неотрицательная)`);}
 if(!point&&['zmpu','distance','windDir','windSpeed','note'].some(k=>val(r,k)))missing.push(`${label}: ППМ`);else if(point&&!!val(r,'windDir')!==!!val(r,'windSpeed'))missing.push(`${label}: направление/скорость ветра`);
 });
 if(errors.length){alert('Расчёт не выполнен. Проверьте данные:\n\n'+errors.slice(0,12).join('\n'));return false;}
 if(missing.length&&!confirm('Обнаружены неполные данные:\n'+missing.slice(0,12).join('\n')+'\nПродолжить расчёт?'))return false;
 for(const [r,info] of autoWind){if(val(r,'windDir')===info[0]&&val(r,'windSpeed')===info[1]){setVal(r,'windDir','');setVal(r,'windSpeed','');}}autoWind.clear();
 let cd='',cs='';for(const r of rows){if(!val(r,'point'))continue;const d=val(r,'windDir'),w=val(r,'windSpeed');if(d||w){cd=d;cs=w;}else if(cd||cs){setVal(r,'windDir',cd);setVal(r,'windSpeed',cs);autoWind.set(r,[cd,cs]);}}
 let wd=null,ws=null,minutesTotal=0,distanceTotal=0;const results=[];
 for(const [i,r] of rows.entries()){if(i>0&&!val(r,'point'))continue;if(i>0){if(wd===null||ws===null){alert(`Не заданы параметры ветра для участка до ППМ '${val(r,'point')}'`);return false;}
 const z=num(val(r,'zmpu')),d=num(val(r,'distance')),angle=(wd+180-z)*Math.PI/180,gs=speed+ws*Math.cos(angle);
 if(gs<=0){alert(`На участке до ППМ '${val(r,'point')}' встречная составляющая ветра не меньше скорости полёта: расчёт времени невозможен`);return false;}
 const m=pyRound(d/gs*60);minutesTotal+=m;distanceTotal+=d;results.push([r,calculateMk(z,wd,ws,speed),`${hMin(m)} / ${hMin(minutesTotal)}`]);}
 if(val(r,'windDir'))wd=num(val(r,'windDir'));if(val(r,'windSpeed'))ws=num(val(r,'windSpeed'));}
 results.forEach(([r,m,t])=>{setText(r,'mk',m);setText(r,'time',t);});totalDistance=pyRound(distanceTotal);totalTime=hMin(minutesTotal);$('result').textContent=`Общее расстояние: ${totalDistance} км\nОбщее время: ${totalTime}`;return true;
 }finally{pushHistory();}
}
function resetRoute(){clearCells();tbody.replaceChildren();rows=[];autoWind.clear();lastFocused=null;addDefaultRows();$('speed').value='';$('warning').classList.add('hidden');clearResults();}
function newRoute(){flushHistory();if(!confirm('Очистить текущий маршрут?'))return;resetRoute();pushHistory();}
function removeWind(){flushHistory();rows.forEach(r=>{setVal(r,'windDir','');setVal(r,'windSpeed','');});autoWind.clear();clearResults();pushHistory();}
function insertBeforeCursor(){flushHistory();const st=snapshot(),pos=lastFocused&&position(lastFocused),i=pos?pos[0]:st.rows.length;st.rows.splice(i,0,Object.fromEntries(ROW_KEYS.map(k=>[k,''])));st.auto.splice(i,0,null);st.results=st.rows.map((r,j)=>j?['','']:['—','—']);st.totalDistance=0;st.totalTime='0:00';st.result='';applyState(st);pushHistory();}
function openRoute(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data||typeof data!=='object'||!Array.isArray(data.rows)||!data.rows.every(r=>r&&typeof r==='object'&&!Array.isArray(r)))throw Error();flushHistory();resetRoute();$('speed').value=String(data.speed??'');data.rows.forEach((item,i)=>{while(rows.length<=i)createRow(false);for(const k of ['point','note','zmpu','distance'])if(!cellInput(rows[i],k).disabled)setVal(rows[i],k,String(item[k]??''));});pushHistory();}catch{alert('Не удалось открыть файл: это не сохранённый маршрут или файл повреждён.');}};reader.onerror=()=>alert('Не удалось прочитать файл');reader.readAsText(file);$('openRoute').value='';}
const originalReverse=reverseRoute;
reverseRoute=function(){flushHistory();const n=rows.filter(r=>val(r,'point')).length;if(n<2){alert('Недостаточно ППМ');return;}originalReverse();autoWind.clear();clearCells();clearResults();pushHistory();};
init();initEditing();
$('sameWind').closest('label').hidden=true;
$('sameWind').closest('label').style.display='none';
$('helpText').textContent=helpText.replace(/Галочка «Ветер по всему маршруту одинаковый»[\s\S]*/, 'На смартфоне включите «Выделение ячеек»: коснитесь первой и затем последней ячейки диапазона. Копирование и вставка текста доступны через системное меню. Таблица прокручивается по горизонтали. PDF открывается отдельной вкладкой, где его можно сохранить или распечатать.');
document.addEventListener('focusin',e=>{if(position(e.target))lastFocused=e.target;});
document.addEventListener('focusout',e=>{if(e.target.matches('input,textarea'))flushHistory();});
tbody.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.altKey){const pos=position(e.target);if(pos){e.preventDefault();for(let i=pos[0]+1;i<rows.length;i++){const el=cellInput(rows[i],COLS[pos[1]]);if(el&&!el.disabled){el.focus();el.select();break;}}}}});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&!(document.activeElement.matches('input,textarea'))){e.preventDefault();selectRange([0,0],[rows.length-1,7]);}});
