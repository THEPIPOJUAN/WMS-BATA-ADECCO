/* ===== Vista Supervisión =====
   Usuarios por día, análisis de inicio, acumulado, meta de Packing (500 und/h) y matriz por hora. */
function renderUserDay(baseArr,meta){
  const workArr=getJefArray(baseArr);
  const unitFn=jefUnitFn();
  const dates=uniq(workArr.map(r=>r.d)).sort();
  const sel=$('dayDetail');
  const prev=sel.value;
  sel.innerHTML=dates.map(d=>`<option value="${d}">${supDayLabel(d)}</option>`).join('');
  if(prev && dates.includes(prev)) sel.value=prev;
  else if(dates.length) sel.value=dates[dates.length-1];

  const day=sel.value;
  const dayArr=workArr.filter(r=>r.d===day);
  const S=summarize(dayArr,currentProdMode(),unitFn);
  const byUser=grouped(dayArr,r=>r.u,currentProdMode(),unitFn).sort((a,b)=>b.units-a.units);
  const metaDay=isOnlyPP(jefSelectedCats())?(metaPPBase()):(metaBase());
  lastUserDay=byUser.map(r=>{
    const rows=dayArr.filter(x=>x.u===r.k);
    const first=rows.reduce((m,x)=>m==null||x.firstTs<m?x.firstTs:m,null);
    const last=rows.reduce((m,x)=>m==null||x.lastTs>m?x.lastTs:m,null);
    const startTs=rows.length?Math.min(...rows.map(x=>x.opStartTs)):NaN;
    const deviation=rows.length?((first-rows[0].standardStartTs)/60000):0;
    const discount=rows.length?Math.max(...rows.map(x=>x.discountMinutes||0)):0;
    const opMin=rows.length?Math.max(...rows.map(x=>x.opMinutesDay||0)):r.operationalMinutes;
    return {...r,date:day,category:jefCategoryLabel(),unit:jefUnitLabel(),firstTs:first,lastTs:last,opStartTs:startTs,startDeviationMinutes:deviation,discountMinutes:discount,opMinutes:opMin};
  });

  $('daySummary').innerHTML = day ? `
    <div class="chip">Fecha<br><b>${labelDate(day)}</b></div>
    <div class="chip">Categoría<br><b>${escapeHtml(jefCategoryLabel())}</b></div>
    <div class="chip">${escapeHtml(jefUnitLabel())}<br><b>${fmt(S.units)}</b></div>
    <div class="chip">Pickers<br><b>${fmt(S.pickers)}</b></div>
    <div class="chip">HH operativas<br><b>${fmt1(S.hhOp)}</b></div>
    <div class="chip">HH efectivas<br><b>${fmt1(S.hhEff)}</b></div>
    <div class="chip">Prod. operativa<br><b style="color:${colorFor(S.prodOp,metaDay)}">${fmt1(S.prodOp)} ${isOnlyPP(jefSelectedCats())?'cajas/HH':'und/HH'}</b></div>
    <div class="chip">Prod. efectiva<br><b style="color:${colorFor(S.prodEff,metaDay)}">${fmt1(S.prodEff)} ${isOnlyPP(jefSelectedCats())?'cajas/HH':'und/HH'}</b></div>
    <div class="chip">Utilización<br><b>${fmt1(S.utilization)}%</b></div>
    <div class="chip">${escapeHtml(jefUnitLabel())} / picker<br><b>${S.pickers?fmt1(S.units/S.pickers):'0'}</b></div>` : '';

  const modeText=currentProdMode()==='effective'?'Efectiva':'Operativa';
  const unitHead=isOnlyPP(jefSelectedCats())?'Cajas día':'Unidades día';
  $('userDayTable').innerHTML =
    `<tr><th>#</th><th>Usuario</th><th>Primera selección</th><th>Última selección</th><th>Desv. arranque</th><th>Descuento</th><th>HH oper.</th><th>Producción</th><th>Prod. ${modeText}</th><th>Cumpl.</th><th>Prod. efectiva</th><th>Utiliz.</th></tr>`+
    lastUserDay.map((r,i)=>{
      const cls=r.startDeviationMinutes<=0?'ok':r.startDeviationMinutes<=9?'warn':'bad';
      const sign=r.startDeviationMinutes>0?'+':'';
      const prodSel=currentProdMode()==='effective'?r.prodEff:r.prodOp;
      return `<tr>
        <td>${i+1}</td><td>${escapeHtml(r.k)}</td>
        <td>${timeLabel(r.firstTs)}</td><td>${timeLabel(r.lastTs)}</td>
        <td><span class="startbadge ${cls}">${sign}${Math.round(r.startDeviationMinutes)} min</span></td>
        <td>${fmt(r.discountMinutes)} min</td><td class="num">${fmt1(r.hhOp)}</td>
        <td class="num"><b>${fmt(r.units)}</b></td><td class="num">${fmt1(prodSel)}</td>
        <td class="num ${prodSel>=metaDay?'good':prodSel>=metaDay*.88?'mid':'bad'}">${fmt1(prodSel/metaDay*100)}%</td>
        <td class="num">${fmt1(r.prodEff)}</td><td class="num">${fmt1(r.utilization)}%</td>
      </tr>`;
    }).join('');
}
function timeLabel(ts){ return Number.isFinite(Number(ts)) ? new Date(Number(ts)).toISOString().slice(11,16) : '-'; }
function renderStartAnalysis(baseArr){
  const workArr=getJefArray(baseArr);
  const map=new Map();
  workArr.forEach(r=>{
    let x=map.get(r.d+'\u001f'+r.u);
    if(!x){x={d:r.d,u:r.u,first:r.firstTs,last:r.lastTs,standard:r.standardStartTs,dev:r.startDeviationMinutes||0,discount:r.discountMinutes||0,opMin:r.opMinutesDay||0};map.set(r.d+'\u001f'+r.u,x);}
    x.first=Math.min(x.first,r.firstTs); x.last=Math.max(x.last,r.lastTs); x.dev=(x.first-x.standard)/60000; x.discount=Math.max(x.discount,r.discountMinutes||0); x.opMin=Math.max(x.opMin,r.opMinutesDay||0);
  });
  const rows=[...map.values()].filter(x=>{const dow=new Date(x.d+'T00:00:00Z').getUTCDay();return dow>=1&&dow<=6;});
  const avg=rows.length?rows.reduce((s,r)=>s+r.first,0)/rows.length:0;
  const avgDelay=rows.length?rows.reduce((s,r)=>s+Math.max(0,r.dev),0)/rows.length:0;
  const early=rows.filter(r=>r.dev<=0).length, amber=rows.filter(r=>r.dev>0&&r.dev<=9).length, red=rows.filter(r=>r.dev>9).length;
  const k=$('startKpis'); if(k) k.innerHTML=`<div class="startkpi"><div class="lab">Arranque promedio</div><div class="val">${avg?timeLabel(avg):'-'}</div><div class="small">Primera selección real</div></div><div class="startkpi"><div class="lab">≤ 08:11</div><div class="val">${fmt(early)}</div><div class="small">Pickers / días-persona</div></div><div class="startkpi"><div class="lab">08:12–08:20</div><div class="val">${fmt(amber)}</div><div class="small">Arranque con demora</div></div><div class="startkpi"><div class="lab">&gt; 08:20</div><div class="val">${fmt(red)}</div><div class="small">Arranque tardío</div></div><div class="startkpi"><div class="lab">Demora promedio</div><div class="val">${fmt1(avgDelay)} min</div><div class="small">Solo demora positiva</div></div>`;
  const t=$('startTable');
  if(t) t.innerHTML=`<tr><th>Fecha</th><th>Usuario</th><th>Primera selección</th><th>Última selección</th><th>Desviación arranque</th><th>Descuento</th><th>HH operativas</th></tr>`+rows.sort((a,b)=>a.d.localeCompare(b.d)||a.u.localeCompare(b.u)).map(r=>{const cls=r.dev<=0?'ok':r.dev<=9?'warn':'bad';const sign=r.dev>0?'+':'';return `<tr><td>${labelDate(r.d)}</td><td>${escapeHtml(r.u)}</td><td>${timeLabel(r.first)}</td><td>${timeLabel(r.last)}</td><td><span class="startbadge ${cls}">${sign}${Math.round(r.dev)} min</span></td><td>${fmt(r.discount)} min</td><td>${fmt1(r.opMin/60)}</td></tr>`}).join('');
}


function supervisorCumulativeChart(el,rows){
  if(!rows.length){el.innerHTML='<div class="mini">Sin datos.</div>';return}
  const W=760,H=290,L=55,R=20,T=22,B=45;
  const maxY=Math.max(...rows.map(r=>Math.max(r.cumUnits,r.expectedCum)),1)*1.12;
  const pW=W-L-R,pH=H-T-B;
  const x=i=>L+(rows.length===1?pW/2:i*pW/(rows.length-1));
  const y=v=>T+pH-(v/maxY)*pH;
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){
    const v=maxY*i/4, yy=y(v);
    s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e7edf2"/>
        <text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#71808d">${Math.round(v).toLocaleString('es-PE')}</text>`;
  }
  const realPts=rows.map((r,i)=>`${x(i)},${y(r.cumUnits)}`).join(' ');
  const expPts=rows.map((r,i)=>`${x(i)},${y(r.expectedCum)}`).join(' ');
  s+=`<polyline points="${expPts}" fill="none" stroke="#94a3ad" stroke-width="2" stroke-dasharray="7 5"/>
      <polyline points="${realPts}" fill="none" stroke="#e31b2a" stroke-width="3"/>`;
  rows.forEach((r,i)=>{
    const xx=x(i),yy=y(r.cumUnits);
    s+=`<circle cx="${xx}" cy="${yy}" r="4" fill="#e31b2a"/>
        <text x="${xx}" y="${H-18}" text-anchor="middle" font-size="10" fill="#607181">${String(r.hour).padStart(2,'0')}:00</text>`;
  });
  s+=`<g font-size="10" fill="#607181">
        <line x1="${W-220}" y1="16" x2="${W-195}" y2="16" stroke="#e31b2a" stroke-width="3"/><text x="${W-190}" y="20">Real acumulado</text>
        <line x1="${W-110}" y1="16" x2="${W-85}" y2="16" stroke="#94a3ad" stroke-width="2" stroke-dasharray="6 4"/><text x="${W-80}" y="20">Esperado</text>
      </g>`;
  s+='</svg>'; el.innerHTML=s;
}

// Gráfico comparativo: una línea de acumulado por usuario seleccionado en la matriz (tipo "vs").
function supervisorCumulativeChartMulti(el, seriesList){
  seriesList=(seriesList||[]).filter(s=>s.points&&s.points.length);
  if(!seriesList.length){el.innerHTML='<div class="mini">Sin datos para el/los usuario(s) seleccionados en esta fecha.</div>';return}
  const W=760,H=290,L=55,R=20,T=22,B=45;
  const n=seriesList[0].points.length;
  const allVals=seriesList.flatMap(s=>s.points.map(p=>p.cumUnits));
  const maxY=Math.max(...allVals,1)*1.15;
  const pW=W-L-R,pH=H-T-B;
  const x=i=>L+(n===1?pW/2:i*pW/(n-1));
  const y=v=>T+pH-(v/maxY)*pH;
  const colors=['#e31b2a','#1b6fe3','#1ba872','#c98a1b','#7a3fe3','#e31b8f','#2a2a2a','#0aa5b8'];
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){
    const v=maxY*i/4, yy=y(v);
    s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e7edf2"/>
        <text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#71808d">${Math.round(v).toLocaleString('es-PE')}</text>`;
  }
  seriesList.forEach((ser,si)=>{
    const col=colors[si%colors.length];
    const pts=ser.points.map((p,i)=>`${x(i)},${y(p.cumUnits)}`).join(' ');
    s+=`<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="3"/>`;
    ser.points.forEach((p,i)=>{ s+=`<circle cx="${x(i)}" cy="${y(p.cumUnits)}" r="3.5" fill="${col}"/>`; });
  });
  seriesList[0].points.forEach((p,i)=>{
    s+=`<text x="${x(i)}" y="${H-18}" text-anchor="middle" font-size="10" fill="#607181">${String(p.hour).padStart(2,'0')}:00</text>`;
  });
  s+=`<g font-size="10" fill="#607181">`;
  seriesList.forEach((ser,si)=>{
    const col=colors[si%colors.length];
    const ly=16+si*14;
    s+=`<line x1="${L}" y1="${ly}" x2="${L+22}" y2="${ly}" stroke="${col}" stroke-width="3"/><text x="${L+27}" y="${ly+4}">${escapeHtml(ser.label)}</text>`;
  });
  s+=`</g></svg>`; el.innerHTML=s;
}

function renderGoalGauge(el,pct,actual,target){
  if(!el) return;
  const clamp=Math.max(0,Math.min(140,pct||0));
  const color = pct>=100?'#168a50':pct>=90?'#d68b18':'#c92535';
  const status = pct>=100?'Meta cumplida':pct>=90?'Cerca de la meta':'Debajo de la meta';
  const radius=70, cx=95, cy=95, circumference=2*Math.PI*radius;
  const offset=circumference*(1-(Math.min(clamp,100)/100));
  el.innerHTML = `
    <div class="gaugeWrap">
      <svg viewBox="0 0 190 190" aria-label="Avance de meta">
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#e7edf2" stroke-width="16"/>
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"/>
      </svg>
      <div class="gaugeCenter">
        <div class="pct" style="color:${color}">${fmt1(pct)}%</div>
        <div class="lbl">avance de meta</div>
      </div>
    </div>
    <div class="gaugeStatus" style="color:${color}">${status}</div>
    <div class="gaugeSub">Avance: <b>${fmt(actual)}</b><br>Meta: <b>${fmt(target)}</b></div>`;
}

// Meta de PACKING por tipo de día: lunes–viernes 36,000 (4,500 x persona) · sábado 16,800 (2,100 x persona) · domingo descanso. Por hora: 4,800 grupal (600 x persona).
const PACK_META={lv:{day:30000,hour:4000,dayP:3750,hourP:500},sab:{day:15000,hour:4000,dayP:1875,hourP:500}};
function syncPackMeta(){const h=Number(SETTINGS.metaPack)||500,n=8;PACK_META.lv={day:Math.round(h*7.5*n),hour:h*n,dayP:Math.round(h*7.5),hourP:h};PACK_META.sab={day:Math.round(h*3.75*n),hour:h*n,dayP:Math.round(h*3.75),hourP:h};}
syncPackMeta();
function packMetaFor(d,nU){const wd=new Date(d+'T00:00:00Z').getUTCDay(),m=wd===6?PACK_META.sab:(wd===0?{day:0,hour:0,dayP:0,hourP:0}:PACK_META.lv);return nU?{day:m.dayP*nU,hour:m.hourP*nU}:{day:m.day,hour:m.hour};}
function renderSupervisor(baseArr,meta){
  const workArr=getSupArray(baseArr);
  const unitFn=supUnitFn();
  const dates=uniq(workArr.map(r=>r.d)).sort();
  const sel=$('supDate');
  const prev=sel.value;
  // El reporte sigue EXACTAMENTE los filtros del tablero (Día, Mes, Semana, Turno, Categoría, Usuario…): ya no apunta a un solo día.
  const periodLabel=!dates.length?'Sin datos':dates.length===1?supDayLabel(dates[0]):`Según filtros: ${dates.length} días (${labelDate(dates[0]).slice(0,5)} – ${labelDate(dates[dates.length-1]).slice(0,5)})`;
  sel.innerHTML=dates.length?`<option value="${dates[dates.length-1]}">${periodLabel}</option>`:'';
  sel.disabled=true;

  const day=sel.value;
  const selNames=[...selectedHeatUsers];
  const groupTarget=Math.max(1,Number($('supDailyTarget').value)||29400);
  const dailyLabel=$('supDailyTarget')?.previousElementSibling; if(dailyLabel) dailyLabel.textContent=isOnlyPP(supSelectedCats())?'Meta diaria de cajas (grupal)':'Meta diaria de unidades (grupal)';
  const indLabel=$('supIndividualTarget')?.previousElementSibling; if(indLabel) indLabel.textContent=isOnlyPP(supSelectedCats())?'Meta individual (cajas/día por usuario)':'Meta individual (und/día por usuario)';
  const individualTarget=Math.max(1,Number($('supIndividualTarget').value)||1500);
  const isPP=isOnlyPP(supSelectedCats());
  const isPack=window.OPSEL==='PACKING',nU=selNames.length;
  $('supDailyTarget').disabled=isPack;$('supIndividualTarget').disabled=isPack;
  if(isPack){ if(dailyLabel)dailyLabel.textContent='Meta diaria packing (L–V 30,000 · Sáb 15,000)'; if(indLabel)indLabel.textContent='Meta individual packing (L–V 3,750 · Sáb 1,875)'; }
  const packRows=isPack?dates.map(d=>packMetaFor(d,nU)):null;
  // Meta del período = suma de la meta de cada día incluido en los filtros
  const target=isPack?packRows.reduce((s,m)=>s+m.day,0):(nU?individualTarget*nU:groupTarget)*Math.max(1,dates.length);
  const supMeta=isPP?(metaPPBase()):(metaBase());
  let start=Math.max(0,Math.min(23,Number($('supStartHour').value)||8));
  let end=Math.max(start+1,Math.min(23,Number($('supEndHour').value)||19));
  const slots=end-start+1;
  const hourlyTarget=target/slots;
  window.__supCtx={period:dates.length>1?periodLabel.replace('Según filtros: ',''):(dates[0]?labelDate(dates[0]):'Sin fecha'),multi:dates.length>1,target};
  document.querySelectorAll('#supTopContext .ctxchip').forEach(c=>{const t=c.textContent;
    if(t.includes('Fecha')||t.includes('Período'))c.innerHTML='📅 '+(window.__supCtx.multi?'Período':'Fecha')+' <b>'+escapeHtml(window.__supCtx.period)+'</b>';
    else if(t.includes('Meta día')||t.includes('Meta del período'))c.innerHTML='🎯 Meta '+(window.__supCtx.multi?'del período':'día')+' <b>'+fmt(target)+' '+(supUnitLabel()=='Cajas PP'?'cajas':'unidades')+'</b>';});
  const expFn=isPack?(k=>packRows.reduce((s,m)=>s+Math.min(m.day,m.hour*k),0)):(k=>hourlyTarget*k);

  const dayArrFull=workArr;
  const dayArr = selNames.length ? dayArrFull.filter(r=>selectedHeatUsers.has(r.u)) : dayArrFull;
  const hourGroups=grouped(dayArr,r=>Number(r.h),currentProdMode(),unitFn).sort((a,b)=>a.k-b.k);
  const hourMap=new Map(hourGroups.map(x=>[Number(x.k),x]));
  const rows=[];
  let cum=0;
  for(let h=start;h<=end;h++){
    const g=hourMap.get(h) || {units:0,hh:0,pickers:0,prod:0};
    cum+=g.units;
    const expectedCum=expFn(h-start+1);
    const gap=cum-expectedCum;
    const compliance=expectedCum?cum/expectedCum*100:0;
    rows.push({
      hour:h, units:g.units, hh:g.hh, pickers:g.pickers, prod:g.prod,
      cumUnits:cum, expectedCum, gap, compliance,
      category:supCategoryLabel(), unit:supUnitLabel()
    });
  }
  lastSupervisorRows=rows.map(r=>({...r,date:dates.length===1?dates[0]:periodLabel}));

  const S=summarize(dayArr,currentProdMode(),unitFn);
  const totalGap=S.units-target;
  const progressPct = target ? (S.units/target*100) : 0;
  const selChip = selNames.length ? `<div class="chip">Usuario(s) filtrado(s)<br><b>${escapeHtml(selNames.join(', '))}</b></div>` : '';
  $('supSummary').innerHTML = day ? `
    <div class="chip">${dates.length>1?'Período':'Fecha'}<br><b>${dates.length>1?escapeHtml(periodLabel.replace('Según filtros: ','')):labelDate(day)}</b></div>
    <div class="chip">Categoría<br><b>${escapeHtml(supCategoryLabel())}</b></div>
    <div class="chip">Unidad<br><b>${escapeHtml(supUnitLabel())}</b></div>
    <div class="chip">${selNames.length?'Meta individual x '+selNames.length:'Meta grupal'}<br><b>${fmt(target)}</b></div>
    <div class="chip">Avance<br><b>${fmt(S.units)}</b></div>
    <div class="chip">Cumplimiento<br><b style="color:${S.units>=target?'#168a50':'#c92535'}">${fmt1(progressPct)}%</b></div>
    <div class="chip">Brecha<br><b style="color:${totalGap>=0?'#168a50':'#c92535'}">${totalGap>=0?'+':''}${fmt(totalGap)}</b></div>
    <div class="chip">Prod. operativa<br><b style="color:${colorFor(S.prodOp,supMeta)}">${fmt1(S.prodOp)} ${isPP?'cajas/HH':'und/HH'}</b></div>
    <div class="chip">Prod. efectiva<br><b style="color:${colorFor(S.prodEff,supMeta)}">${fmt1(S.prodEff)} ${isPP?'cajas/HH':'und/HH'}</b></div>
    <div class="chip">Utilización<br><b>${fmt1(S.utilization)}%</b></div>
    <div class="chip">Pickers<br><b>${fmt(S.pickers)}</b></div>${selChip}` : '';

  renderGoalGauge($('supGoalGauge'), progressPct, S.units, target);

  const titleEl=$('supCumulativeTitle'), subEl=$('supCumulativeSubtitle');
  if(selNames.length){
    if(titleEl) titleEl.textContent = selNames.length===1 ? `Evolución de ${selNames[0]}` : `Comparativo: ${selNames.join(' vs ')}`;
    if(subEl) subEl.textContent = 'Acumulado real por hora del/de los usuario(s) seleccionados en la matriz. Click de nuevo sobre el nombre para quitar la selección.';
    const series=selNames.map(u=>{
      const uArr=dayArrFull.filter(r=>r.u===u);
      const uHourGroups=grouped(uArr,r=>Number(r.h),currentProdMode(),unitFn);
      const uHourMap=new Map(uHourGroups.map(x=>[Number(x.k),x]));
      let c=0; const points=[];
      for(let h=start;h<=end;h++){ const g=uHourMap.get(h)||{units:0}; c+=g.units; points.push({hour:h,cumUnits:c}); }
      return {label:u, points};
    });
    supervisorCumulativeChartMulti($('supCumulativeChart'), series);
  } else {
    if(titleEl) titleEl.textContent='Acumulado real vs. esperado';
    if(subEl) subEl.textContent=isPack?'Packing: el esperado crece 4,000 por hora (500 por persona) hasta la meta del día (L–V 30,000 · sábado 15,000), sumando los días de los filtros.':'El esperado distribuye la meta diaria de manera uniforme entre las horas configuradas y suma los días de los filtros.';
    supervisorCumulativeChart($('supCumulativeChart'),rows);
  }

  const unitHead=isOnlyPP(supSelectedCats())?'Cajas':'Unid.';
  $('supHourTable').innerHTML =
    `<tr><th>Hora</th><th class="num">${unitHead}</th><th class="num">Acum.</th><th class="num">Pickers</th><th class="num">${isOnlyPP(supSelectedCats())?'Cajas/HH':'Und/HH'}</th><th class="num">Brecha</th><th>Estado</th></tr>`+
    rows.map(r=>{
      const cls=r.compliance>=100?'ok':r.compliance>=90?'warn':'bad';
      const txt=r.compliance>=100?'En línea':r.compliance>=90?'Atención':'Atraso';
      return `<tr>
        <td><b>${String(r.hour).padStart(2,'0')}:00</b></td>
        <td class="num">${fmt(r.units)}</td>
        <td class="num"><b>${fmt(r.cumUnits)}</b></td>
        <td class="num">${fmt(r.pickers)}</td>
        <td class="num">${fmt1(r.prod)}</td>
        <td class="num ${r.gap>=0?'good':'bad'}">${r.gap>=0?'+':''}${fmt(r.gap)}</td>
        <td><span class="statuspill ${cls}">${txt}</span></td>
      </tr>`;
    }).join('');
}


function renderSupervisorHeatmap(baseArr){
  const table=$('supHeatTable');
  if(!table) return;
  const day=$('supDate').value;
  const workArr=getSupArray(baseArr);
  const unitFn=supUnitFn();
  const titleEl=$('heatTitle');
  if(shouldSeparateByDay()){
    // Sin 1 solo día seleccionado: resumen por día (no por hora)
    if(titleEl) titleEl.textContent='Matriz por día y usuario';
    const dayKeys=[...new Set(workArr.map(r=>r.d))].sort();
    const target=Math.max(1,Number($('supIndividualTarget')?.value)||1500);
    const um=new Map();
    workArr.forEach(r=>{
      let o=um.get(r.u); if(!o){o={user:r.u,days:{},total:0}; um.set(r.u,o);}
      const u=unitFn(r); o.days[r.d]=(o.days[r.d]||0)+u; o.total+=u;
    });
    const drows=[...um.values()].map(o=>{
      const n=Object.values(o.days).filter(v=>v>0).length;
      return {...o,avg:n?o.total/n:0};
    }).sort((a,b)=>b.total-a.total);
    lastHeatmapRows=drows.map(r=>({mode:'day',dayKeys,user:r.user,total:r.total,avg:r.avg,days:r.days,category:supCategoryLabel(),unit:supUnitLabel()}));
    const lg=$('heatLegend');
    if(lg) lg.textContent=`${supCategoryLabel()} · ${supUnitLabel()} · semáforo por día: meta individual ${fmt(target)}`;
    let t='<tr><th class="name">Usuario</th>';
    const multiY=new Set(dayKeys.map(d=>d.slice(0,4))).size>1;
    dayKeys.forEach(d=>{const L=labelDate(d);t+=`<th>${multiY?L.slice(0,6)+L.slice(8):L.slice(0,5)}</th>`;});
    t+=`<th>${isOnlyPP(supSelectedCats())?'CAJAS':'TOTAL'}</th><th>PROM./DÍA</th></tr>`;
    t+=drows.map(r=>{
      const nameCls='name heatname-click'+(selectedHeatUsers.has(r.user)?' heatname-selected':'');
      let row=`<tr><td class="${nameCls}" data-user="${escapeHtml(r.user)}" title="Click para comparar la evolución de este usuario arriba">${escapeHtml(r.user)}</td>`;
      dayKeys.forEach(d=>{
        const v=Math.round(r.days[d]||0);
        const c=!v?'heat-empty':(v<target*0.8?'heat-low':(v<target?'heat-mid':'heat-high'));
        row+=`<td class="${c}" title="${labelDate(d)}">${v?fmt(v):'-'}</td>`;
      });
      const ac=r.avg>=target?'good':(r.avg>=target*0.8?'mid':'bad');
      return row+`<td class="heat-total">${fmt(r.total)}</td><td class="heat-total heat-avg ${ac}">${fmt(Math.round(r.avg))}</td></tr>`;
    }).join('');
    if(!drows.length) t='<tr><th class="name">Usuario</th><th>Sin datos para los filtros/categorías seleccionados</th></tr>';
    table.innerHTML=t;
    return;
  }
  if(titleEl) titleEl.textContent='Matriz por hora y usuario';
  const heatMeta=isOnlyPP(supSelectedCats())?(metaPPBase()):(metaBase());
  let start=Math.max(0,Math.min(23,Number($('supStartHour').value)||SETTINGS.startHour));
  let end=Math.max(start+1,Math.min(23,Number($('supEndHour').value)||SETTINGS.endHour));
  const hours=[]; for(let h=start; h<=end; h++) hours.push(h);
  const dayArr=workArr.filter(r=>r.d===day);
  const userMap=new Map();
  dayArr.forEach(r=>{
    if(r.h<start || r.h>end) return;
    let obj=userMap.get(r.u);
    if(!obj){ obj={user:r.u, hours:{}, total:0}; userMap.set(r.u,obj); }
    const units=unitFn(r);
    obj.hours[r.h]=(obj.hours[r.h]||0)+units;
    obj.total+=units;
  });
  const rows=[...userMap.values()].map(obj=>{
    const avg=hours.length?obj.total/hours.length:0;
    return {...obj, avg};
  }).sort((a,b)=>b.total-a.total);
  lastHeatmapRows=rows.map(r=>({date:day,user:r.user,total:r.total,avg:r.avg,hours:r.hours,start,end,category:supCategoryLabel(),unit:supUnitLabel()}));
  const legend=$('heatLegend');
  if(legend) legend.textContent=`${supCategoryLabel()} · ${supUnitLabel()} · semáforo por hora: meta ${fmt1(heatMeta)}`;
  let htm='<tr><th class="name">Usuario</th>';
  hours.forEach(h=> htm += `<th>${String(h).padStart(2,'0')}:00</th>`);
  htm += `<th>${isOnlyPP(supSelectedCats())?'CAJAS':'TOTAL'}</th><th>PROM./H</th></tr>`;
  htm += rows.map(r=>{
    const nameCls='name heatname-click'+(selectedHeatUsers.has(r.user)?' heatname-selected':'');
    let row=`<tr><td class="${nameCls}" data-user="${escapeHtml(r.user)}" title="Click para comparar la evolución de este usuario arriba">${escapeHtml(r.user)}</td>`;
    hours.forEach(h=>{
      const v=Math.round(r.hours[h]||0);
      const cls=heatClass(v)+(v?' heatcell-click':'');
      const attrs=v?` data-user="${escapeHtml(r.user)}" data-hour="${h}" title="Click para ver el detalle de esta hora"`:'';
      row += `<td class="${cls}"${attrs}>${v?fmt(v):'-'}</td>`;
    });
    const avgClass = r.avg>=SETTINGS.highThr?'good':(r.avg>SETTINGS.lowThr?'mid':'bad');
    row += `<td class="heat-total">${fmt(r.total)}</td><td class="heat-total heat-avg ${avgClass}">${fmt(Math.round(r.avg))}</td></tr>`;
    return row;
  }).join('');
  if(!rows.length) htm='<tr><th class="name">Usuario</th><th>Sin datos para la fecha/filtros/categorías seleccionados</th></tr>';
  table.innerHTML=htm;
}


// ===== Interacción de la matriz por hora y usuario =====
function toggleHeatUser(user){
  if(!user) return;
  if(selectedHeatUsers.has(user)) selectedHeatUsers.delete(user);
  else selectedHeatUsers.add(user);
  const meta=Number($('meta').value)||160;
  renderSupervisor(filtered(),meta);
  renderSupervisorHeatmap(filtered());
}
let lastHeatDetailRows=[], lastHeatDetailLabel='';
function timeDiffClass(mins){
  if(mins==null) return '';
  if(mins<3) return 'tdiff-green';
  if(mins<10) return 'tdiff-yellow';
  return 'tdiff-red';
}
function showHeatDetail(user,hour){
  if(!user) return;
  const day=$('supDate').value;
  const h=Number(hour);
  const rows=allDetails().filter(x=>x.d===day && x.u===user && Number(x.h)===h && (window.OPSEL==='AMBOS'||(x.op||'PICKING')===(window.OPSEL||'PICKING'))).sort((a,b)=>a.ts-b.ts);
  const sec=$('heatDetailSection');
  sec.style.display='block';
  $('heatDetailTitle').textContent=`Detalle: ${user} · ${labelDate(day)} · ${String(h).padStart(2,'0')}:00`;
  const empty=$('heatDetailEmpty');
  lastHeatDetailRows=rows;
  lastHeatDetailLabel=`${user}_${day}_${String(h).padStart(2,'0')}h`;
  if(!rows.length){
    $('heatDetailTable').innerHTML='';
    empty.style.display='block';
    empty.textContent='No hay detalle disponible para esta celda. El detalle línea a línea (orden, LPN, SKU, ubicación, tienda) solo se guarda cuando cargas un archivo en formato Allocation del WMS; los archivos en formato Data.csv (procesado) no traen esos campos.';
  }else{
    empty.style.display='none';
    let prevTs=null;
    $('heatDetailTable').innerHTML =
      `<tr><th>Fecha</th><th>Hora</th><th>Orden</th><th>LPN origen</th><th>LPN destino</th><th>SKU</th><th>Ubicación</th><th class="num">Cantidad</th><th>Cód. instalación</th><th>Tienda</th><th>Tiempo entre lectura</th></tr>`+
      rows.map(r=>{
        const diffMin = prevTs!=null ? (r.ts-prevTs)/60000 : null;
        prevTs=r.ts;
        const diffLabel = diffMin==null ? '—' : `${diffMin.toFixed(1)} min`;
        const diffCls = timeDiffClass(diffMin);
        return `<tr>
        <td>${labelDate(r.d)}</td>
        <td>${new Date(r.ts).toISOString().slice(11,19)}</td>
        <td>${escapeHtml(r.orden)}</td>
        <td>${escapeHtml(r.lpn)}</td>
        <td>${escapeHtml(r.lpnd||'-')}</td>
        <td>${escapeHtml(r.sku)}</td>
        <td>${escapeHtml(r.ubicacion)}</td>
        <td class="num">${fmt(r.cantidad)}</td>
        <td>${escapeHtml(r.instalacion)}</td>
        <td>${escapeHtml(r.tienda)}</td>
        <td class="${diffCls}">${diffLabel}</td>
      </tr>`;}).join('');
  }
  if(sec.scrollIntoView) sec.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function closeHeatDetail(){
  const sec=$('heatDetailSection');
  if(sec) sec.style.display='none';
}
(function wireHeatmapClicks(){
  const table=$('supHeatTable');
  if(!table) return;
  table.addEventListener('click',(e)=>{
    const cell=e.target.closest('td');
    if(!cell) return;
    if(cell.classList.contains('heatcell-click')){
      showHeatDetail(cell.dataset.user, cell.dataset.hour);
    }else if(cell.classList.contains('heatname-click')){
      toggleHeatUser(cell.dataset.user);
    }
  });
  const closeBtn=$('closeHeatDetailBtn');
  if(closeBtn) closeBtn.addEventListener('click',closeHeatDetail);
  const downloadBtn=$('downloadHeatDetailBtn');
  if(downloadBtn) downloadBtn.addEventListener('click',()=>{
    if(!lastHeatDetailRows.length){ alert('No hay detalle para descargar.'); return; }
    const rows=[['Fecha','Hora','Orden','LPN_Origen','LPN_Destino','SKU','Descripcion','Ubicacion','Cantidad','Cod_Instalacion','Tienda','Minutos_Desde_Lectura_Anterior']];
    let prevTs=null;
    lastHeatDetailRows.forEach(r=>{
      const diffMin=prevTs!=null?((r.ts-prevTs)/60000).toFixed(1):'';
      prevTs=r.ts;
      rows.push([labelDate(r.d),new Date(r.ts).toISOString().slice(11,19),r.orden,r.lpn,r.lpnd||'',r.sku,r.desc||'',r.ubicacion,r.cantidad,r.instalacion,r.tienda,diffMin]);
    });
    const csv='\uFEFF'+rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    a.download='Detalle_Hora_'+lastHeatDetailLabel+'.csv';a.click();URL.revokeObjectURL(a.href);
  });
  const supDateSel=$('supDate');
  if(supDateSel) supDateSel.addEventListener('change',()=>{ selectedHeatUsers.clear(); closeHeatDetail(); });
})();
