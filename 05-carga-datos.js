/* ===== Carga y procesamiento de datos =====
   Lectura de CSV/Excel (usa el worker de index.html), histórico bruto, histórico procesado y operación del día. */
function heatClass(v,meta=metaBase()){
  if(!v) return 'heat-empty';
  const low=Math.min(Number(SETTINGS.lowThr)||100,meta*0.8);
  const high=Math.min(Number(SETTINGS.highThr)||143,meta);
  if(v<=low) return 'heat-low';
  if(v<high) return 'heat-mid';
  return 'heat-high';
}


function deriveCombinedStats(records,label='Base combinada'){
  if(!records.length){
    return {minDate:'',maxDate:'',kept:0,sessions:0,totalOperationalMinutes:0,totalEffectiveMinutes:0,file:label};
  }
  let minDate='9999-99-99',maxDate='0000-00-00',kept=0,op=0,eff=0;
  const sessions=new Set();
  for(const r of records){
    if(r.d<minDate)minDate=r.d;
    if(r.d>maxDate)maxDate=r.d;
    kept+=(r.r||0);
    op+=(r.om||0);
    eff+=(r.m||0);
    if(r.task)sessions.add(r.task);
  }
  return {
    minDate,maxDate,kept,sessions:sessions.size,
    totalOperationalMinutes:op,totalEffectiveMinutes:eff,
    file:label,gapMinutes:SETTINGS.gapMinutes
  };
}
function fmtDateRange(minDate,maxDate){
  if(!minDate||!maxDate)return 'Sin datos';
  return `${labelDate(minDate)} – ${labelDate(maxDate)}`;
}
function refreshFilterOptions(preserve=true){
  const types=['day','month','week','cat','user','area','tipo','turno'];
  const prev={};
  types.forEach(type=>prev[type]=preserve?new Set(MULTI_STATE[type]):new Set());

  const values={
    day:uniq(DATA.map(r=>r.d)).sort(),
    month:uniq(DATA.map(r=>r.d.slice(0,7))).sort(),
    week:uniq(DATA.map(r=>weekFilterKey(r.d))).sort(),
    cat:(v=>v.includes('PP')&&!v.includes('PP UNDS')?v.concat('PP UNDS'):v)(uniq(DATA.map(r=>r.c))),
    user:uniq(DATA.map(r=>r.u)),
    area:uniq(DATA.map(r=>r.a)),
    tipo:uniq(DATA.map(r=>r.p)),
    turno:['DIA','NOCHE']
  };

  types.forEach(type=>populateMulti(type,values[type]));

  if(preserve){
    types.forEach(type=>{
      prev[type].forEach(v=>{if(values[type].includes(v))MULTI_STATE[type].add(v)});
      renderMultiOptions(type);
      updateMultiButton(type);
    });
  }
}
function rebuildCombinedData({resetRange=false,preserveFilters=true}={}){
  const dayDates=new Set(DAY_DATA.map(r=>(r.op||'PICKING')+'|'+r.d));
  const histWithoutUpdatedDays=HIST_DATA.filter(r=>!dayDates.has((r.op||'PICKING')+'|'+r.d));
  DATA=histWithoutUpdatedDays.concat(DAY_DATA);
  DATA.sort((a,b)=>a.d.localeCompare(b.d)||String(a.u).localeCompare(String(b.u))||Number(a.h)-Number(b.h));

  STATS=deriveCombinedStats(DATA,'Histórico + actualización día');
  refreshFilterOptions(preserveFilters);

  if(DATA.length){
    if(resetRange || !$('d1').value || !$('d2').value){
      $('d1').value=STATS.minDate;$('d2').value=STATS.maxDate;
    }else{
      if($('d1').value<STATS.minDate)$('d1').value=STATS.minDate;
      if($('d2').value>STATS.maxDate)$('d2').value=STATS.maxDate;
    }
    $('goDashBtn').disabled=false;
    $('exportProcessedBtn').disabled=!HIST_DATA.length;
    $('dash').style.display='block';
    $('fileStatus').innerHTML=`Base: <b>${fmtDateRange(STATS.minDate,STATS.maxDate)}</b> · ${fmt(DATA.length)} registros procesados`;
    render();
  }else{
    $('goDashBtn').disabled=true;
    $('exportProcessedBtn').disabled=true;
    $('dash').style.display='none';
    $('fileStatus').textContent='Sin datos cargados';
  }
  updateLoadStatuses();
}
function updateLoadStatuses(){
  const histStats=deriveCombinedStats(HIST_DATA,'Histórico');
  const dayStats=deriveCombinedStats(DAY_DATA,'Día');
  $('sumHistory').textContent=HIST_DATA.length?`${fmt(HIST_DATA.length)} registros · ${fmtDateRange(histStats.minDate,histStats.maxDate)}`:'0 registros procesados';
  $('sumDay').textContent=DAY_DATA.length?`${fmt(DAY_DATA.length)} registros · ${fmtDateRange(dayStats.minDate,dayStats.maxDate)}`:'Sin archivo';
  $('sumCombined').textContent=DATA.length?`${fmt(DATA.length)} registros · ${fmtDateRange(STATS.minDate,STATS.maxDate)}`:'0 registros';

  if(HIST_DATA.length){
    const sourceCount=HIST_META.length;
    $('histStatus').innerHTML=`<b>${fmt(HIST_DATA.length)}</b> registros procesados · ${fmtDateRange(histStats.minDate,histStats.maxDate)}${sourceCount?` · ${sourceCount} archivo(s) fuente`:''}`;
  }else $('histStatus').textContent='Aún no se cargó histórico bruto.';

  if(DAY_DATA.length && Array.isArray(DAY_META) && DAY_META.length){
    const totalDup=DAY_META.reduce((s,m)=>s+(m.duplicates||0),0);
    const fileList=DAY_META.map(m=>escapeHtml(m.file)).join(', ');
    $('dayStatus').innerHTML=`Fusionado desde <b>${fileList}</b> (${DAY_META.length} archivo(s)) · ${fmtDateRange(dayStats.minDate,dayStats.maxDate)} · ${fmt(DAY_DATA.length)} registros`+(totalDup?` · ${fmt(totalDup)} duplicado(s) ignorado(s) en total`:'');
  }else $('dayStatus').textContent='Sin actualización del día.';

  if(HIST_WARNINGS.length){
    $('loadWarning').style.display='block';
    $('loadWarning').innerHTML='⚠️ '+HIST_WARNINGS.map(escapeHtml).join('<br>⚠️ ');
  }else $('loadWarning').style.display='none';
}
function rangesOverlap(a,b){
  return a.minDate<=b.maxDate && b.minDate<=a.maxDate;
}
function currentWorkerParams(){
  const gapMinutes=Math.max(1,Math.min(120,Number($('sessionGapInput').value)||SETTINGS.gapMinutes||10));
  SETTINGS.gapMinutes=gapMinutes;
  saveSettingsToStorage();
  return {
    gapMinutes,
    opStartTime:SETTINGS.opStartTime||'08:11',
    master:window.MAESTRO_MAP||{}
  };
}
async function normalizeRawUploadFile(file){
  if(!/\.xlsx$/i.test(file.name)) return file;
  if(!window.XLSX) throw new Error('Motor Excel no disponible para leer XLSX.');
  $('progressText').textContent=`Convirtiendo XLSX a formato de trabajo: ${file.name}…`;
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false,raw:false});
  const name=wb.SheetNames?.[0]; if(!name) throw new Error('El XLSX no contiene hojas.');
  const csv=XLSX.utils.sheet_to_csv(wb.Sheets[name],{FS:';',RS:'\n',blankrows:false});
  if(!csv.trim()) throw new Error('La primera hoja del XLSX está vacía.');
  return new File([csv],file.name.replace(/\.xlsx$/i,'.csv'),{type:'text/csv;charset=utf-8'});
}
function processRawFile(file,contextLabel='Archivo',extraParams={}){
  return new Promise((resolve,reject)=>{
    normalizeRawUploadFile(file).then(file=>{
      const code=$('worker-script').textContent;
    let handled=false;
    const fallback=()=>{
      if(handled)return; handled=true;
      runInlineFallback(file,contextLabel,extraParams).then(resolve,reject);
    };
    let worker;
    try{
      worker=new Worker(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));
    }catch(err){
      // Algunos visores/entornos bloquean crear Web Workers desde blob: por su política de seguridad (CSP).
      // En ese caso se procesa el archivo igual, pero en el hilo principal.
      fallback();
      return;
    }
    worker.onmessage=ev=>{
      const m=ev.data;
      if(m.type==='progress'){
        $('progressText').textContent=`${contextLabel}: ${escapeHtml(file.name)} · ${Number(m.rows).toLocaleString('es-PE')} líneas…`;
      }else if(m.type==='error'){
        if(handled)return; handled=true;
        worker.terminate();reject(new Error(`${file.name}: ${m.message}`));
      }else if(m.type==='done'){
        if(handled)return; handled=true;
        worker.terminate();resolve(m);
      }
    };
    worker.onerror=e=>{
      worker.terminate();
      fallback();
    };
    worker.postMessage({file,...currentWorkerParams(),...extraParams});
    }).catch(reject);
  });
}
// Respaldo sin Web Worker: ejecuta el mismo código de procesamiento en el hilo principal.
// Se usa cuando el navegador/visor no permite crear Workers desde blob: (bloqueo de CSP).
function runInlineFallback(file,contextLabel,extraParams={}){
  return new Promise((resolve,reject)=>{
    const code=$('worker-script').textContent;
    const fakeSelf={
      postMessage(m){
        if(m.type==='progress'){
          $('progressText').textContent=`${contextLabel}: ${escapeHtml(file.name)} · ${Number(m.rows).toLocaleString('es-PE')} líneas… (modo compatibilidad)`;
        }else if(m.type==='error'){
          reject(new Error(`${file.name}: ${m.message}`));
        }else if(m.type==='done'){
          resolve(m);
        }
      }
    };
    try{
      const getOnMessage=new Function('self', code+'\nreturn self.onmessage;');
      const onmessage=getOnMessage(fakeSelf);
      Promise.resolve(onmessage({data:{file,...currentWorkerParams(),...extraParams}})).catch(reject);
    }catch(err){
      reject(new Error(`${file.name}: ${err.message||'error de procesamiento (modo compatibilidad)'}`));
    }
  });
}
async function loadHistoricalFiles(fileList){
  const files=[...fileList].filter(f=>/\.(csv|txt|xlsx)$/i.test(f.name)).sort((a,b)=>(a.webkitRelativePath||a.name).localeCompare(b.webkitRelativePath||b.name));
  if(!files.length){alert('No se encontraron archivos CSV/TXT en la selección.');return;}
  $('progressBox').style.display='block';$('progressBar').style.width='2%';
  HIST_WARNINGS=[];
  const all=[], metas=[], detailsAll=[];
  let ranges=[];
  try{
    for(let i=0;i<files.length;i++){
      const f=files[i];
      $('progressText').textContent=`Histórico ${i+1}/${files.length}: ${f.name}`;
      $('progressBar').style.width=`${Math.max(3,Math.round(i/files.length*92))}%`;
      const m=await processRawFile(f,`Histórico ${i+1}/${files.length}`);
      all.push(...m.records);
      if(m.details&&m.details.length) detailsAll.push(...m.details);
      const meta={file:f.webkitRelativePath||f.name,minDate:m.stats.minDate,maxDate:m.stats.maxDate,kept:m.stats.kept};
      for(const prev of ranges){
        if(rangesOverlap(meta,prev)){
          HIST_WARNINGS.push(`Rangos superpuestos: "${prev.file}" (${prev.minDate} a ${prev.maxDate}) y "${meta.file}" (${meta.minDate} a ${meta.maxDate}). Revisa que no exista información duplicada.`);
        }
      }
      ranges.push(meta);metas.push(meta);
    }
    HIST_DATA=all;HIST_META=metas;HIST_DETAILS=detailsAll;
    $('progressBar').style.width='100%';
    $('progressText').textContent=`Histórico listo: ${files.length} archivo(s) · ${fmt(HIST_DATA.length)} registros procesados.`;
    $('processedStatus').textContent='Histórico bruto listo. Puedes exportarlo como histórico procesado.';
    rebuildCombinedData({resetRange:true,preserveFilters:false});
    setTimeout(()=>{$('upload').style.display='none';window.scrollTo({top:0,behavior:'smooth'})},500);
  }catch(err){
    $('progressText').innerHTML=`<span style="color:#c92535;font-weight:700">${escapeHtml(err.message)}</span>`;
    $('progressBar').style.width='0%';
  }
}
async function loadProcessedHistory(file){
  $('progressBox').style.display='block';$('progressText').textContent='Leyendo histórico procesado…';$('progressBar').style.width='20%';
  try{
    const raw=await file.text();
    const obj=JSON.parse(raw);
    if(!obj || obj.format!=='PICKING_WMS_PROCESSED_V2' || obj.methodologyVersion!==METHODOLOGY_VERSION || !Array.isArray(obj.records)){
      throw new Error('⚠️ Este histórico procesado usa una metodología anterior o incompatible. Debes reprocesar el CSV original con esta versión del dashboard.');
    }
    HIST_DATA=obj.records;
    HIST_META=Array.isArray(obj.sourceFiles)?obj.sourceFiles:[{file:file.name,minDate:obj.minDate||'',maxDate:obj.maxDate||''}];
    HIST_WARNINGS=[];
    HIST_DETAILS=[]; // El histórico procesado (JSON) no conserva el detalle línea a línea.
    if(obj.methodology){
      SETTINGS.gapMinutes=10;
      SETTINGS.opStartTime='08:11';
      SETTINGS.metaPP=Number(obj.methodology.metaPP)||60;
      saveSettingsToStorage();applySettingsToInputs();
    }
    $('progressBar').style.width='100%';
    $('progressText').textContent=`Histórico procesado cargado: ${fmt(HIST_DATA.length)} registros.`;
    $('processedStatus').innerHTML=`Cargado: <b>${escapeHtml(file.name)}</b> · ${obj.createdAt?new Date(obj.createdAt).toLocaleString('es-PE'):''}`;
    rebuildCombinedData({resetRange:true,preserveFilters:false});
    setTimeout(()=>{$('upload').style.display='none';window.scrollTo({top:0,behavior:'smooth'})},400);
  }catch(err){
    $('progressText').innerHTML=`<span style="color:#c92535;font-weight:700">${escapeHtml(err.message)}</span>`;
    $('progressBar').style.width='0%';
  }
}
// Claves de todas las líneas ya cargadas (histórico + día), para que un archivo nuevo
// se fusione con lo existente en vez de reemplazarlo: las líneas repetidas se ignoran.
function buildExistingRowKeys(){
  const keys=[];
  for(const r of HIST_DETAILS) keys.push(['A',r.d,r.ts,r.orden||'',r.lpn||'',r.sku||'',r.ubicacion||''].join('\u001f'));
  for(const r of DAY_DETAILS) keys.push(['A',r.d,r.ts,r.orden||'',r.lpn||'',r.sku||'',r.ubicacion||''].join('\u001f'));
  return keys;
}
async function updateDayData(file){
  if(!file)return;
  $('progressBox').style.display='block';$('progressText').textContent=`Procesando actualización del día: ${file.name}…`;$('progressBar').style.width='20%';
  try{
    const existingKeys=buildExistingRowKeys();
    const m=await processRawFile(file,'Actualización día',{existingKeys});
    // Fusiona: agrega solo lo nuevo, no reemplaza lo ya cargado. Las líneas que ya
    // existían en el dashboard (mismo pedido/LPN/SKU/ubicación/hora) fueron ignoradas
    // por el worker y no vienen en m.records / m.details.
    DAY_DATA=DAY_DATA.concat(m.records);
    DAY_DETAILS=DAY_DETAILS.concat(m.details||[]);
    if(!Array.isArray(DAY_META)) DAY_META=[];
    DAY_META.push({file:file.name,minDate:m.stats.minDate,maxDate:m.stats.maxDate,loadedAt:new Date().toISOString(),added:m.stats.kept,duplicates:m.stats.duplicates||0});
    $('progressBar').style.width='100%';
    const dup=m.stats.duplicates||0;
    const added=m.stats.kept||0;
    $('progressText').textContent=`Día actualizado: ${fmt(added)} registro(s) nuevo(s) agregado(s)`+(dup?` · ${fmt(dup)} duplicado(s) ignorado(s) (ya estaban cargados)`:'')+'.';
    rebuildCombinedData({resetRange:!HIST_DATA.length,preserveFilters:true});
    setTimeout(()=>{$('upload').style.display='none';window.scrollTo({top:0,behavior:'smooth'})},400);
  }catch(err){
    $('progressText').innerHTML=`<span style="color:#c92535;font-weight:700">${escapeHtml(err.message)}</span>`;
    $('progressBar').style.width='0%';
  }
}
function exportProcessedHistory(){
  if(!HIST_DATA.length){alert('Primero carga un histórico.');return;}
  try{
    $('processedStatus').textContent='Preparando archivo procesado…';
    const stats=deriveCombinedStats(HIST_DATA,'Histórico');
    const payload={
      format:'PICKING_WMS_PROCESSED_V2',
      methodologyVersion:METHODOLOGY_VERSION,
      createdAt:new Date().toISOString(),
      minDate:stats.minDate,maxDate:stats.maxDate,
      methodology:{
        gapMinutes:10,
        opStartTime:'08:11',
        metaNormal:SETTINGS.meta,
        metaPP:SETTINGS.metaPP
      },
      sourceFiles:HIST_META,
      records:HIST_DATA
    };
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`Picking_Historico_Procesado_${stats.minDate||'inicio'}_${stats.maxDate||'fin'}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    $('processedStatus').innerHTML=`Exportado histórico procesado · <b>${fmt(HIST_DATA.length)}</b> registros.`;
  }catch(err){
    $('processedStatus').textContent='No se pudo exportar: '+(err.message||String(err));
  }
}
