/* ===== Render principal =====
   Redibuja la vista activa, alertas y la vista para compartir/imprimir. */
function render(){
  enforceDailyExecutiveView();
  const arr=filtered(), meta=activeMeta(), globalUnitFn=activeUnitFn(), S=summarize(arr,currentProdMode(),globalUnitFn);
  const jefArr=getJefArray(arr);
  const jefUnit=jefUnitFn();
  SETTINGS.prodMode=currentProdMode();
  saveSettingsToStorage();
  const isEff=currentProdMode()==='effective';
  $('kUnits').textContent=fmt(S.units);
  $('kUnits').previousElementSibling && ($('kUnits').previousElementSibling.textContent=activeUnitLabel());
  $('kHH').textContent=fmt1(S.hh);
  $('kProd').textContent=fmt1(S.prod);
  $('kPickers').textContent=fmt(S.pickers);
  $('kRows').textContent=fmt(S.tasks);
  $('kHHLabel').textContent=isEff?'HH efectivas Picking':'HH operativas estimadas';
  $('kHHSmall').textContent=isEff?'Sesiones activas por Fecha + Usuario':'MIN(primera selección, 08:11) a última selección, descuento según última selección';
  $('kProdLabel').textContent=isEff?'Productividad efectiva WMS':'Productividad operativa estimada';
  $('chartModeNote').textContent=modeLabel();
  $('kProd').style.color=colorFor(S.prod,meta);
  $('kProdMsg').innerHTML=`${productivityUnitText()} · <b style="color:${colorFor(S.prod,meta)}">${fmt1(S.prod/meta*100)}% de meta</b>`;
  $('kProdOp').textContent=fmt1(S.prodOp);
  $('kProdOp').style.color=colorFor(S.prodOp,meta);
  $('kProdEff').textContent=fmt1(S.prodEff);
  $('kProdEff').style.color=colorFor(S.prodEff,meta);
  $('kUtil').textContent=fmt1(S.utilization)+'%';
  $('kUtil').style.color=S.utilization>=90?'#168a50':S.utilization>=75?'#d68b18':'#c92535';
  renderSupervisor(arr,meta);
  renderSupervisorHeatmap(arr);
  renderMgmtTable(arr);
  renderJefWeekTable(arr);
  const daily=grouped(jefArr,r=>r.d,currentProdMode(),jefUnit).sort((a,b)=>a.k.localeCompare(b.k));
  dailyUnitsChart($('dayChart'),daily,meta,jefUnitLabel());
  renderUserDay(arr,meta);
  const weekly=grouped(arr,r=>weekStart(r.d),currentProdMode(),globalUnitFn).sort((a,b)=>a.k.localeCompare(b.k));
  renderManagementEvolutionChart(arr,meta);
  renderCategoryEvolution(arr,globalUnitFn);
  renderStartAnalysis(arr);
  lineChart($('weekChart'),weekly,meta,k=>'Sem '+isoWeekNumber(k));
  const cats=grouped(arr,r=>r.c,currentProdMode(),globalUnitFn).sort((a,b)=>b.prod-a.prod);
  barChart($('catChart'),cats,meta);
  const monthly=grouped(arr,r=>r.d.slice(0,7),currentProdMode(),globalUnitFn).sort((a,b)=>a.k.localeCompare(b.k));
  lineChart($('monthChart'),monthly,meta,monthName);

  const hours=grouped(jefArr,r=>String(r.h).padStart(2,'0')+':00',currentProdMode(),jefUnit).sort((a,b)=>a.k.localeCompare(b.k));
  barChart($('hourChart'),hours,meta,{horizontal:true,maxItems:16});
  const areas=grouped(jefArr,r=>r.a,currentProdMode(),jefUnit).sort((a,b)=>b.units-a.units).slice(0,10).sort((a,b)=>b.prod-a.prod);
  barChart($('areaChart'),areas,meta,{horizontal:true,maxItems:10});
  setTopContexts(arr,meta);
  setJefaturaContexts(arr,meta);
  const ranking=grouped(jefArr,r=>r.u,currentProdMode(),jefUnit).filter(r=>r.hh>=1).sort((a,b)=>b.prod-a.prod); lastRanking=ranking;
  const rankMode=currentProdMode()==='effective'?'Efect.':'Oper.';
  const unitHead=isOnlyPP(jefSelectedCats())?'Cajas':'Unidades';
  $('rankTable').innerHTML=`<tr><th>#</th><th>Usuario</th><th class="num">${unitHead}</th><th class="num">HH ${rankMode}</th><th class="num">${unitHead==='Cajas'?'Cajas/HH':'Und/HH'} ${rankMode}</th><th class="num">Cumpl.</th><th class="num">Utiliz.</th></tr>`+
    ranking.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.k)}</td><td class="num">${fmt(r.units)}</td><td class="num">${fmt1(r.hh)}</td><td class="num"><b>${fmt1(r.prod)}</b></td><td class="num ${r.prod>=meta?'good':r.prod>=meta*.88?'mid':'bad'}">${fmt1(r.prod/meta*100)}%</td><td class="num">${fmt1(r.utilization)}%</td></tr>`).join('');
  renderAlerts(arr,S,weekly,cats,grouped(arr,r=>String(r.h).padStart(2,'0')+':00',currentProdMode(),globalUnitFn).sort((a,b)=>a.k.localeCompare(b.k)),grouped(arr,r=>r.u,currentProdMode(),globalUnitFn).filter(r=>r.hh>=1).sort((a,b)=>b.prod-a.prod),meta,'alertsGerencia','metaGerencia',activeUnitLabel(),productivityUnitText());
  const jefSummary=summarize(jefArr,currentProdMode(),jefUnit);
  const jefWeekly=grouped(jefArr,r=>weekStart(r.d),currentProdMode(),jefUnit).sort((a,b)=>a.k.localeCompare(b.k));
  const jefCats=grouped(jefArr,r=>r.c,currentProdMode(),jefUnit).sort((a,b)=>b.prod-a.prod);
  renderAlerts(jefArr,jefSummary,jefWeekly,jefCats,hours,ranking,meta,'alerts',null,jefUnitLabel(),isOnlyPP(jefSelectedCats())?'cajas/HH':'und/HH');
  $('footRange').textContent=arr.length?currentFilterText():'Sin datos';
}
function renderAlerts(arr,S,weekly,cats,hours,ranking,meta,targetId='alerts',metaId=null,unitLabel='Unidades',unitText='und/HH'){
  const A=[];
  const lowThreshold=meta*.88;
  const low=ranking.filter(x=>x.prod<lowThreshold).length;
  if(low)A.push(`🔻 <b>${low} usuarios</b> están debajo de ${fmt1(lowThreshold)} ${unitText} (88% de la meta).`);
  if(cats.length){const w=[...cats].sort((a,b)=>a.prod-b.prod)[0];A.push(`📦 Categoría de menor productividad: <b>${escapeHtml(w.k)} · ${fmt1(w.prod)} ${unitText}</b>.`)}
  if(hours.length){const h=[...hours].sort((a,b)=>a.prod-b.prod)[0];A.push(`🕒 Franja más débil: <b>${escapeHtml(h.k)} · ${fmt1(h.prod)} ${unitText}</b>.`)}
  if(weekly.length>=2){const a=weekly.at(-1),b=weekly.at(-2),pct=b.prod?((a.prod/b.prod)-1)*100:0;A.push(`${pct>=0?'🟢':'🔻'} Última semana: <b>${pct>=0?'+':''}${fmt1(pct)}%</b> vs. semana previa.`)}
  A.push(`${S.prod>=meta?'✅':'⚠️'} Productividad ${modeLabel().toLowerCase()}: <b>${fmt1(S.prod)} ${unitText}</b> (${fmt1(S.prod/meta*100)}% de la meta).`);
  A.push(`⚙️ Comparativo: operativa <b>${fmt1(S.prodOp)}</b> · efectiva <b>${fmt1(S.prodEff)}</b> ${unitText} · utilización <b>${fmt1(S.utilization)}%</b>.`);
  const alertHtml=A.map(x=>`<div class="alert">${x}</div>`).join('');
  if($(targetId)) $(targetId).innerHTML=alertHtml;
  if(metaId && $(metaId)) $(metaId).textContent=fmt1(meta)+' '+unitText;
}

function showCaptureToast(message,ms=6500){
  const t=$('captureToast');
  if(!t) return;
  t.innerHTML=message;
  t.classList.add('show');
  clearTimeout(showCaptureToast._timer);
  showCaptureToast._timer=setTimeout(()=>t.classList.remove('show'),ms);
}
function activeViewName(){
  const btn=document.querySelector('.viewtab.active');
  return btn ? btn.textContent.trim() : 'REPORTE';
}
function filteredPeriodText(arr){
  if(!arr || !arr.length) return 'Sin datos';
  const dates=arr.map(r=>r.d).sort();
  const min=dates[0], max=dates[dates.length-1];
  return min===max ? labelDate(min) : `${labelDate(min)} – ${labelDate(max)}`;
}
function shortFilterText(){
  const t=currentFilterText();
  return t==='Todos los filtros' ? 'Filtros: Todos' : 'Filtros: '+t;
}
function setTopContexts(arr,meta){
  const period=filteredPeriodText(arr);
  const filterText=shortFilterText();
  const mode=modeLabel();
  if($('jefTopContext')){
    $('jefTopContext').innerHTML=`
      <span class="ctxchip">📅 <b>${escapeHtml(period)}</b></span>
      <span class="ctxchip">⚙️ <b>${escapeHtml(mode)}</b></span>
      <span class="ctxchip">🧩 Categorías <b>${escapeHtml(jefCategoryLabel())}</b></span>
      <span class="ctxchip">📦 Unidad <b>${escapeHtml(jefUnitLabel())}</b></span>
      <span class="ctxchip">🎯 Meta <b>${fmt1(meta)} ${jefUnitLabel()==='Cajas PP'?'cajas/HH':'und/HH'}</b></span>`;
    $('jefTopFilters').textContent='Aplica a avance diario, detalle usuario-día, evaluación semanal, ranking, productividad por hora, productividad por área y alertas. '+filterText;
  }
  if($('supTopContext')){
    const supDate=(window.__supCtx&&window.__supCtx.period)||($('supDate')?.value ? labelDate($('supDate').value) : 'Sin fecha');
    const hIni=String(Number($('supStartHour')?.value||8)).padStart(2,'0')+':00';
    const hFin=String(Number($('supEndHour')?.value||19)).padStart(2,'0')+':00';
    $('supTopContext').innerHTML=`
      <span class="ctxchip">📅 ${(window.__supCtx&&window.__supCtx.multi)?'Período':'Fecha'} <b>${escapeHtml(supDate)}</b></span>
      <span class="ctxchip">🧩 Categorías <b>${escapeHtml(supCategoryLabel())}</b></span>
      <span class="ctxchip">📦 Unidad <b>${escapeHtml(supUnitLabel())}</b></span>
      <span class="ctxchip">🕒 Rango hora <b>${hIni} - ${hFin}</b></span>
      <span class="ctxchip">🎯 Meta ${(window.__supCtx&&window.__supCtx.multi)?'del período':'día'} <b>${fmt(window.__supCtx&&window.__supCtx.target!=null?window.__supCtx.target:Number($('supDailyTarget')?.value||29400))} ${supUnitLabel()=='Cajas PP'?'cajas':'unidades'}</b></span>
      <span class="ctxchip">⚙️ <b>${escapeHtml(mode)}</b></span>`;
    $('supTopFilters').textContent='Aplica a avance por hora, acumulado real vs esperado y matriz por hora y usuario. '+filterText;
  }
}

function setJefaturaContexts(arr,meta){
  const period=filteredPeriodText(arr);
  const mode=modeLabel();
  const filterText=shortFilterText();
  const modeHH=currentProdMode()==='effective'?'HH efectivas WMS':'HH operativas estimadas';

  $('rankContext').innerHTML=`
    <span class="ctxchip">📅 <b>${escapeHtml(period)}</b></span>
    <span class="ctxchip">⚙️ <b>${escapeHtml(mode)}</b></span>
    <span class="ctxchip">🧩 Categoría <b>${escapeHtml(jefCategoryLabel())}</b></span>
    <span class="ctxchip">📦 Unidad <b>${escapeHtml(jefUnitLabel())}</b></span>
    <span class="ctxchip">🎯 Meta <b>${fmt1(meta)} ${jefUnitLabel()==='Cajas PP'?'cajas/HH':'und/HH'}</b></span>
    <span class="ctxchip">⏱ Mínimo <b>1 ${escapeHtml(modeHH)}</b></span>`;
  $('rankFilters').textContent=filterText;

  $('hourContext').innerHTML=`
    <span class="ctxchip">📅 <b>${escapeHtml(period)}</b></span>
    <span class="ctxchip">⚙️ <b>${escapeHtml(mode)}</b></span>
    <span class="ctxchip">🧩 Categoría <b>${escapeHtml(jefCategoryLabel())}</b></span>
    <span class="ctxchip">🕒 Agrupación <b>hora del día</b></span>`;
  $('hourFilters').textContent=filterText;

  $('areaContext').innerHTML=`
    <span class="ctxchip">📅 <b>${escapeHtml(period)}</b></span>
    <span class="ctxchip">⚙️ <b>${escapeHtml(mode)}</b></span>
    <span class="ctxchip">🧩 Categoría <b>${escapeHtml(jefCategoryLabel())}</b></span>
    <span class="ctxchip">📦 Criterio <b>Top 10 por volumen</b></span>`;
  $('areaFilters').textContent=filterText;

  $('alertContext').innerHTML=`
    <span class="ctxchip">📅 <b>${escapeHtml(period)}</b></span>
    <span class="ctxchip">⚙️ <b>${escapeHtml(mode)}</b></span>
    <span class="ctxchip">🧩 Categoría <b>${escapeHtml(jefCategoryLabel())}</b></span>
    <span class="ctxchip">🎯 Meta <b>${fmt1(meta)} ${jefUnitLabel()==='Cajas PP'?'cajas/HH':'und/HH'}</b></span>`;
  $('alertFilters').textContent=filterText;
}

function currentFilterText(){
  const parts=[];
  const day=multiText('day');
  const month=multiText('month');
  const week=multiText('week');
  const cat=multiText('cat');
  const user=multiText('user');
  const area=multiText('area');
  const tipo=multiText('tipo');
  const turnoTxt=multiText('turno');

  if(turnoTxt) parts.push(`Turno: ${turnoTxt}`);
  if(day) parts.push(`Día: ${day}`);
  if(month) parts.push(`Mes: ${month}`);
  if(week) parts.push(`Semana: ${week}`);
  if(cat) parts.push(`Categoría: ${cat}`);
  if(user) parts.push(`Usuario: ${user}`);
  if(area) parts.push(`Área: ${area}`);
  if(tipo) parts.push(`Pedido: ${tipo}`);
  return parts.join(' · ') || 'Todos los filtros';
}
function syncCaptureControls(src,clone){
  const srcInputs=src.querySelectorAll('input,select,textarea');
  const dstInputs=clone.querySelectorAll('input,select,textarea');
  srcInputs.forEach((el,i)=>{
    const c=dstInputs[i]; if(!c) return;
    if(el.tagName==='SELECT'){
      [...c.options].forEach((o,j)=>o.selected=(j===el.selectedIndex));
    }else{
      c.setAttribute('value',el.value||'');
      if(el.tagName==='TEXTAREA') c.textContent=el.value||'';
    }
  });
}
function openShareView(){
  const btn=$('captureBtn');
  const view=document.querySelector('.viewsection.active');
  if(!view){showCaptureToast('No hay una vista activa para compartir.');return;}
  btn.classList.add('capturebusy');
  btn.textContent='📤 Preparando vista...';
  try{
    const clone=view.cloneNode(true);
    syncCaptureControls(view,clone);
    clone.classList.add('active');
    clone.style.display='block';
    clone.querySelectorAll('button,.toolbar,.viewtabs').forEach(x=>x.remove());
    clone.querySelectorAll('[style*="max-height"]').forEach(x=>{x.style.maxHeight='none';x.style.overflow='visible';});
    clone.querySelectorAll('.heatbox,.tblbox').forEach(x=>{x.style.overflow='visible';x.style.maxHeight='none';});

    const css=[...document.querySelectorAll('style')].map(s=>s.textContent).join('\n');
    const cssLinks=[...document.querySelectorAll('link[rel="stylesheet"]')].map(l=>'<link rel="stylesheet" href="'+l.href+'">').join('');
    const win=window.open('','_blank');
    if(!win){throw new Error('El navegador bloqueó la ventana emergente. Habilita pop-ups para este archivo.');}
    const title = SETTINGS.title + ' - ' + activeViewName();
    const text = currentFilterText();
    win.document.open();
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
      ${cssLinks}<style>${css}
      body{background:#f4f7fa !important;padding:18px}
      .shareTop{background:#fff;border:1px solid #dfe7ee;border-radius:14px;padding:16px 18px;margin-bottom:12px}
      .shareTop h1{margin:0;color:#2d3139;font-size:28px}
      .shareTop .subline{margin-top:6px;color:#6e7c89;font-size:14px}
      .shareTools{position:sticky;top:0;z-index:9;display:flex;gap:8px;justify-content:flex-end;background:#f4f7fa;padding-bottom:10px;margin-bottom:8px}
      .shareTools button,.shareTools a{border:1px solid #dfe7ee;background:#fff;color:#2d3139;border-radius:10px;padding:10px 14px;font-weight:700;cursor:pointer;text-decoration:none}
      .viewsection{display:block !important}.viewsection.active{display:block !important}
      </style></head><body>
      <div class="shareTools">
        <button onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
        <a href="https://wa.me/?text=${encodeURIComponent(title+'\n'+text)}" target="_blank">WhatsApp Web</a>
        <button onclick="window.close()">↩ Cerrar y volver</button>
      </div>
      <div class="shareTop">
        <h1>${SETTINGS.title}</h1>
        <div class="subline">${activeViewName()} · ${text}</div>
        <div class="subline">Generado: ${new Date().toLocaleString('es-PE')} · Meta: ${fmt1(Number($('meta').value)||SETTINGS.meta)} und/HH</div>
      </div>
      ${clone.outerHTML}
      <div style="margin-top:14px;font-size:12px;color:#6e7c89">Sugerencia: si terminas de imprimir o guardar PDF, usa <b>Cerrar y volver</b> para regresar al reporte principal. Si deseas enviarlo como imagen al grupo de WhatsApp, usa la herramienta de recorte de Windows o la captura del navegador sobre esta vista limpia.</div>
      
<div id="resetBack" class="authback" style="display:none">
  <div class="authbox">
    <h3>🔑 Nueva contraseña</h3>
    <div class="mini">Escribe y confirma tu nueva contraseña.</div>
    <label>Nueva contraseña</label>
    <input id="newPassword" type="password" autocomplete="new-password">
    <label>Repetir nueva contraseña</label>
    <input id="newPassword2" type="password" autocomplete="new-password">
    <div class="authactions"><button class="cloudbtn update" id="saveNewPasswordBtn" type="button">Guardar contraseña</button></div>
    <div class="authmsg" id="resetMsg"></div>
  </div>
</div>

</body></html>`);
    win.document.close();
    showCaptureToast('✅ Se abrió una vista limpia para compartir. Desde esa ventana puedes imprimir/guardar PDF o hacer una captura rápida para WhatsApp.', 9000);
  }catch(err){
    showCaptureToast('⚠️ No se pudo abrir la vista para compartir: '+escapeHtml(err.message||String(err)),9000);
  }finally{
    btn.classList.remove('capturebusy');
    btn.textContent='📤 Compartir / Imprimir';
  }
}
