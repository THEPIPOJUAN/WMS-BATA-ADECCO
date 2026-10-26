/* ===== Vistas Gerencia y Jefatura =====
   Categorías, evolución, tabla de gerencia, tabla semanal de jefatura y sus exportaciones. */
function selectedCatsByClass(cls){
  const vals=[...document.querySelectorAll('.'+cls+':checked')].map(x=>x.value);
  return vals.length ? vals : ['CALZADO','ACCESORIO','PP','PP UNDS','INSUMO','MATERIALES'];
}
function categoryDisplayName(c){
  return c==='CALZADO' ? 'Calzado' : c==='ACCESORIO' ? 'Accesorio' : c==='PP' ? 'PP CAJAS' : c==='PP UNDS' ? 'PP UNDS' : c==='INSUMO' ? 'Insumo' : c==='MATERIALES' ? 'Materiales' : c;
}
function catMultiLabel(vals){
  const nice=vals.map(categoryDisplayName);
  return nice.length>=6 ? 'Todas las categorías' : nice.join(' + ');
}
function isOnlyPP(vals){
  return vals.length===1 && vals[0]==='PP';
}
function unitLabelFromCats(vals){
  return isOnlyPP(vals) ? 'Cajas PP' : 'Unidades';
}
function unitFnFromCats(vals){
  return isOnlyPP(vals) ? (r=>Number(r.raw)||0) : (r=>Number(r.n)||0);
}
function globalSelectedCats(){
  const vals=[...getMultiSelected('cat')];
  return vals.length ? vals : ['CALZADO','ACCESORIO','PP','PP UNDS','INSUMO','MATERIALES'];
}
function activeUnitFn(){ return unitFnFromCats(globalSelectedCats()); }
function activeUnitLabel(){ return unitLabelFromCats(globalSelectedCats()); }
function metaBase(){return window.OPSEL==='PACKING'?(Number(SETTINGS.metaPack)||500):(Number(SETTINGS.meta)||160);}
function metaPPBase(){return window.OPSEL==='PACKING'?(Number(SETTINGS.metaPack)||500):(Number(SETTINGS.metaPP)||60);}
function activeMeta(){ return isOnlyPP(globalSelectedCats()) ? metaPPBase() : metaBase(); }
function productivityUnitText(){ return isOnlyPP(globalSelectedCats()) ? 'cajas/HH' : 'und/HH'; }
function getArrayByCats(arr,vals){
  const set=new Set(vals); if(set.has('PP UNDS'))set.add('PP');
  return arr.filter(r=>set.has(r.c));
}
function jefSelectedCats(){
  return selectedCatsByClass('jefcat');
}
function jefCategoryLabel(){
  return catMultiLabel(jefSelectedCats());
}
function jefUnitLabel(){
  return unitLabelFromCats(jefSelectedCats());
}
function jefUnitFn(){
  return unitFnFromCats(jefSelectedCats());
}
function getJefArray(arr){
  return getArrayByCats(arr,jefSelectedCats());
}
function supSelectedCats(){
  return selectedCatsByClass('supcat');
}
function supCategoryLabel(){
  return catMultiLabel(supSelectedCats());
}
function supUnitLabel(){
  return unitLabelFromCats(supSelectedCats());
}
function supUnitFn(){
  return unitFnFromCats(supSelectedCats());
}
function getSupArray(arr){
  return getArrayByCats(arr,supSelectedCats());
}
function periodLabel(level,key){
  if(level==='day') return labelDate(key);
  if(level==='week') return 'Sem '+isoWeekNumber(key)+' · '+labelDate(key);
  if(level==='month') return monthName(key);
  return key;
}
function evolutionLevelConfig(level){
  if(level==='day'){
    return {
      keyFn:r=>r.d,
      title:'Evolutivo diario: unidades picadas vs productividad',
      subtitle:'Barras = unidades picadas por día · línea = productividad WMS · línea punteada = meta',
      chartLabel:r=>labelDate(r.k).slice(0,5)
    };
  }
  if(level==='month'){
    return {
      keyFn:r=>r.d.slice(0,7),
      title:'Evolutivo mensual: unidades picadas vs productividad',
      subtitle:'Barras = unidades picadas por mes · línea = productividad WMS · línea punteada = meta',
      chartLabel:r=>monthFilterLabel(r.k).slice(0,3)
    };
  }
  return {
    keyFn:r=>weekStart(r.d),
    title:'Evolutivo semanal: unidades picadas vs productividad',
    subtitle:'Barras = unidades picadas por semana · línea = productividad WMS · línea punteada = meta',
    chartLabel:r=>'Sem '+isoWeekNumber(r.k)
  };
}
function renderManagementEvolutionChart(baseArr,meta){
  const level=$('mgmtLevel')?.value||'month';
  const cfg=evolutionLevelConfig(level);
  const rows=grouped(baseArr,cfg.keyFn,currentProdMode(),activeUnitFn()).sort((a,b)=>a.k.localeCompare(b.k));
  $('evolTitle').textContent=cfg.title;
  $('evolSubtitle').textContent=isOnlyPP(globalSelectedCats())?cfg.subtitle.replace(/unidades/gi,'cajas'):cfg.subtitle;
  weeklyUnitsProdChart($('weekUnitsProdChart'),rows,meta,cfg.chartLabel,activeUnitLabel(),productivityUnitText());
}
function renderMgmtTable(baseArr){
  const table=$('mgmtTable');
  if(!table) return;
  const level=$('mgmtLevel').value||'month';
  const cfg=evolutionLevelConfig(level);
  const rows=grouped(baseArr,cfg.keyFn,currentProdMode(),activeUnitFn()).sort((a,b)=>a.k.localeCompare(b.k)).map(r=>{
    const undPicker = r.pickers ? r.units/r.pickers : 0;
    const ordLabel = periodLabel(level,r.k);
    return {...r, label:ordLabel, undPicker};
  });
  lastMgmtRows=rows.map(r=>({...r, level}));
  table.innerHTML =
    '<tr><th>Periodo</th><th>Unidades</th><th>Prod. operativa</th><th>Prod. efectiva</th><th>Utilización</th><th>Pickers</th><th>HH oper.</th><th>HH efect.</th><th>Und/Picker</th><th>Sesiones</th></tr>' +
    rows.map(r=>`<tr>
      <td><b>${escapeHtml(r.label)}</b></td>
      <td>${fmt(r.units)}</td>
      <td class="${r.prodOp>=Number($('meta').value||SETTINGS.meta)?'good':r.prodOp>=Number($('meta').value||SETTINGS.meta)*0.88?'mid':'bad'}">${fmt1(r.prodOp)}</td>
      <td class="${r.prodEff>=Number($('meta').value||SETTINGS.meta)?'good':r.prodEff>=Number($('meta').value||SETTINGS.meta)*0.88?'mid':'bad'}">${fmt1(r.prodEff)}</td>
      <td>${fmt1(r.utilization)}%</td>
      <td>${fmt(r.pickers)}</td>
      <td>${fmt1(r.hhOp)}</td>
      <td>${fmt1(r.hhEff)}</td>
      <td>${fmt1(r.undPicker)}</td>
      <td>${fmt(r.tasks)}</td>
    </tr>`).join('');
  if(!rows.length){
    table.innerHTML='<tr><th>Periodo</th><th>Sin datos para los filtros seleccionados</th></tr>';
  }
}

function renderCategoryMixChart(el,rows){
  if(!rows.length){
    el.innerHTML='<div class="mini">Sin datos para los filtros seleccionados.</div>';
    return;
  }
  const baseW=980;
  const pxPerPoint=rows.length>40?58:rows.length>24?66:74;
  const W=Math.max(baseW,rows.length*pxPerPoint),H=320,L=90,R=20,T=26,B=54;
  const pW=W-L-R,pH=H-T-B;
  const x=i=>L+(i+.5)*pW/rows.length;
  const y=v=>T+pH-(v/100)*pH;
  const bw=Math.max(24,Math.min(54,pW/rows.length*.56));
  const labelSize=rows.length>40?9:10;
  const cols={CALZADO:'#2d3139',ACCESORIO:'#1f8f53',PP:'#d68b18'};
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;max-width:none;display:block">`;

  for(let i=0;i<=4;i++){
    const val=i*25, yy=y(val);
    s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf2"/>
        <text x="${L-10}" y="${yy+4}" text-anchor="end" font-size="10" fill="#71808d">${val}%</text>`;
  }

  rows.forEach((d,i)=>{
    const cx=x(i);
    const stack=[['CALZADO',d.calzPct||0],['ACCESORIO',d.accPct||0],['PP',d.ppPct||0]];
    let acum=0;
    stack.forEach(([k,v])=>{
      const top=acum+v;
      const yy=y(top), hh=y(acum)-yy;
      if(v>0){
        s+=`<rect x="${cx-bw/2}" y="${yy}" width="${bw}" height="${hh}" rx="2" fill="${cols[k]}"/>`;
        if(v>=8){
          s+=`<text x="${cx}" y="${yy+hh/2+4}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${Math.round(v)}%</text>`;
        }
      }
      acum=top;
    });
    s+=`<text x="${cx}" y="${H-24}" text-anchor="middle" font-size="${labelSize}" fill="#607181">${escapeHtml(d.labelShort)}</text>`;
  });

  s+=`<text x="18" y="${T+10}" font-size="10" fill="#607181">Participación</text>
      <g font-size="10" fill="#607181">
        <rect x="${W/2-135}" y="${H-10}" width="12" height="8" rx="2" fill="#2d3139"/>
        <text x="${W/2-118}" y="${H-3}">Calzado</text>
        <rect x="${W/2-48}" y="${H-10}" width="12" height="8" rx="2" fill="#1f8f53"/>
        <text x="${W/2-30}" y="${H-3}">Accesorio</text>
        <rect x="${W/2+63}" y="${H-10}" width="12" height="8" rx="2" fill="#d68b18"/>
        <text x="${W/2+81}" y="${H-3}">PP</text>
      </g></svg>`;
  const hint=W>baseW ? '<div class="scrollhint">↔ Desplázate horizontalmente para revisar todos los días del período.</div>' : '';
  el.innerHTML=`<div class="chartwrap">${s}</div>${hint}`;
}

function renderCategoryEvolution(baseArr,unitFn=activeUnitFn()){
  const level=$('mgmtLevel').value||'week';
  const cfg=evolutionLevelConfig(level);
  const periods=uniq(baseArr.map(cfg.keyFn)).sort();
  const rows=periods.map(k=>{
    const arr=baseArr.filter(r=>cfg.keyFn(r)===k);
    const total=arr.reduce((s,r)=>s+(Number(unitFn(r))||0),0);
    const calz=arr.filter(r=>r.c==='CALZADO').reduce((s,r)=>s+(Number(unitFn(r))||0),0);
    const acc=arr.filter(r=>r.c==='ACCESORIO').reduce((s,r)=>s+(Number(unitFn(r))||0),0);
    const pp=arr.filter(r=>r.c==='PP').reduce((s,r)=>s+(Number(unitFn(r))||0),0);
    return {
      k,
      label:periodLabel(level,k),
      labelShort: level==='day' ? labelDate(k).slice(0,5) : level==='week' ? ('Sem '+isoWeekNumber(k)) : monthFilterLabel(k).slice(0,3),
      total, calz, acc, pp,
      calzPct: total ? calz/total*100 : 0,
      accPct: total ? acc/total*100 : 0,
      ppPct: total ? pp/total*100 : 0
    };
  });
  renderCategoryMixChart($('catMixChart'),rows);
  const t=$('catMixTable');
  if(!rows.length){
    t.innerHTML='<tr><th>Periodo</th><th>Sin datos para los filtros seleccionados</th></tr>';
    return;
  }
  t.innerHTML =
    '<tr><th>Periodo</th><th>Calzado</th><th>% Calz.</th><th>Accesorio</th><th>% Acc.</th><th>PP</th><th>% PP</th><th>Total</th></tr>'+
    rows.map(r=>`<tr>
      <td><b>${escapeHtml(r.label)}</b></td>
      <td>${fmt(r.calz)}</td>
      <td>${fmt1(r.calzPct)}%</td>
      <td>${fmt(r.acc)}</td>
      <td>${fmt1(r.accPct)}%</td>
      <td>${fmt(r.pp)}</td>
      <td>${fmt1(r.ppPct)}%</td>
      <td><b>${fmt(r.total)}</b></td>
    </tr>`).join('');
}
function exportMgmtTable(){
  const rows=[['Nivel','Periodo','Unidades','Prod_Operativa','Prod_Efectiva','Utilizacion','Pickers','HH_Operativas','HH_Efectivas','Unid_Picker','Sesiones']];
  lastMgmtRows.forEach(r=>rows.push([r.level, r.label, Math.round(r.units), fmt1(r.prodOp), fmt1(r.prodEff), fmt1(r.utilization)+'%', r.pickers, fmt1(r.hhOp), fmt1(r.hhEff), fmt1(r.undPicker), r.tasks]));
  const csv='\uFEFF'+rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='Evolucion_Gerencia_'+($('mgmtLevel').value||'nivel')+'.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}


function weekCellClass(v, low, high){
  if(!v) return 'week-empty';
  if(v<=low) return 'week-low';
  if(v<high) return 'week-mid';
  return 'week-high';
}
function renderJefWeekTable(baseArr){
  const sel=$('jefWeekDetail');
  const unitFn=jefUnitFn();
  const workArr=getJefArray(baseArr);

  const weekStarts=uniq(workArr.map(r=>weekStart(r.d))).sort();
  const prev=sel.value;
  sel.innerHTML=weekStarts.map(ws=>`<option value="${ws}">Sem ${isoWeekNumber(ws)} · ${labelDate(ws)}</option>`).join('');
  if(prev && weekStarts.includes(prev)) sel.value=prev;
  else if(weekStarts.length) sel.value=weekStarts[weekStarts.length-1];

  const ws=sel.value;
  const table=$('jefWeekTable');
  const summary=$('jefWeekSummary');
  if(!ws){
    table.innerHTML='<tr><th class="name">Usuario</th><th>Sin datos</th></tr>';
    summary.innerHTML='';
    lastJefWeekRows=[];
    return;
  }

  const weekArr=workArr.filter(r=>weekStart(r.d)===ws);
  const perUser=new Map();

  weekArr.forEach(r=>{
    const d=new Date(r.d+'T00:00:00');
    const dow=(d.getDay()+6)%7;
    let obj=perUser.get(r.u);
    if(!obj){
      obj={user:r.u, days:[0,0,0,0,0,0,0], total:0};
      perUser.set(r.u,obj);
    }
    const units=unitFn(r);
    obj.days[dow]+=units;
    obj.total+=units;
  });

  const userMetricMap=new Map();
  weekArr.forEach(r=>{
    let x=userMetricMap.get(r.u);
    if(!x){x={eff:0,op:0};userMetricMap.set(r.u,x);}
    x.eff+=(r.m||0);
    x.op+=(r.om||0);
  });

  let allVals=[];
  const rows=[...perUser.values()].map(obj=>{
    const mm=userMetricMap.get(obj.user)||{eff:0,op:0};
    const hhEff=mm.eff/60, hhOp=mm.op/60;
    const prodEff=hhEff>0?obj.total/hhEff:0;
    const prodOp=hhOp>0?obj.total/hhOp:0;
    const utilization=hhOp>0?hhEff/hhOp*100:0;
    const hh=currentProdMode()==='effective'?hhEff:hhOp;
    const prod=currentProdMode()==='effective'?prodEff:prodOp;
    const activeDays=obj.days.filter(v=>v>0).length;
    const avgDay=activeDays ? obj.total/activeDays : 0;
    obj.days.forEach(v=>{ if(v>0) allVals.push(v); });
    return {...obj, hhEff,hhOp,prodEff,prodOp,utilization,hh,prod,activeDays,avgDay};
  }).sort((a,b)=>b.total-a.total);

  const sortedVals=allVals.sort((a,b)=>a-b);
  const low = sortedVals.length ? sortedVals[Math.floor((sortedVals.length-1)*0.33)] : 0;
  const high = sortedVals.length ? sortedVals[Math.floor((sortedVals.length-1)*0.66)] : 1e9;

  lastJefWeekRows=rows.map(r=>({
    week:ws, category:jefCategoryLabel(), unit:jefUnitLabel(), user:r.user,
    lunes:r.days[0], martes:r.days[1], miercoles:r.days[2], jueves:r.days[3], viernes:r.days[4], sabado:r.days[5], domingo:r.days[6],
    total:r.total, activeDays:r.activeDays, avgDay:r.avgDay, hh:r.hh, prod:r.prod, hhEff:r.hhEff,hhOp:r.hhOp,prodEff:r.prodEff,prodOp:r.prodOp,utilization:r.utilization
  }));

  const weekSummary=summarize(weekArr,currentProdMode(),unitFn);
  summary.innerHTML = `
    <div class="chip">Semana<br><b>Sem ${isoWeekNumber(ws)}</b></div>
    <div class="chip">Inicio semana<br><b>${labelDate(ws)}</b></div>
    <div class="chip">Categoría<br><b>${escapeHtml(jefCategoryLabel())}</b></div>
    <div class="chip">${escapeHtml(jefUnitLabel())}<br><b>${fmt(weekSummary.units)}</b></div>
    <div class="chip">Productividad<br><b style="color:${colorFor(weekSummary.prod,Number($('meta').value)||SETTINGS.meta)}">${fmt1(weekSummary.prod)} ${isOnlyPP(jefSelectedCats())?'cajas/HH':'und/HH'}</b></div>
    <div class="chip">Pickers<br><b>${fmt(weekSummary.pickers)}</b></div>
    <div class="chip">Usuarios en tabla<br><b>${fmt(rows.length)}</b></div>`;

  const unitCol = isOnlyPP(jefSelectedCats()) ? 'CAJAS' : 'TOTAL';
  let htm=`<tr><th class="name">Usuario</th><th>Lunes</th><th>Martes</th><th>Miércoles</th><th>Jueves</th><th>Viernes</th><th>Sábado</th><th>Domingo</th><th>${unitCol}</th><th>Días activos</th><th>PROM./DÍA</th><th>HH oper.</th><th>Prod. oper.</th><th>HH efect.</th><th>Prod. efect.</th><th>Utiliz.</th></tr>`;
  htm += rows.map(r=>{
    let row=`<tr><td class="name">${escapeHtml(r.user)}</td>`;
    r.days.forEach(v=> row += `<td class="${weekCellClass(Math.round(v), low, high)}">${v?fmt(Math.round(v)):'-'}</td>`);
    const metaNow=Number($('meta').value)||SETTINGS.meta;
    row += `<td class="week-total">${fmt(Math.round(r.total))}</td>
            <td class="week-total">${fmt(r.activeDays)}</td>
            <td class="week-total">${fmt(Math.round(r.avgDay))}</td>
            <td class="week-total">${fmt1(r.hhOp)}</td>
            <td class="week-total ${r.prodOp>=metaNow?'good':r.prodOp>=metaNow*.88?'mid':'bad'}">${fmt1(r.prodOp)}</td>
            <td class="week-total">${fmt1(r.hhEff)}</td>
            <td class="week-total ${r.prodEff>=metaNow?'good':r.prodEff>=metaNow*.88?'mid':'bad'}">${fmt1(r.prodEff)}</td>
            <td class="week-total">${fmt1(r.utilization)}%</td></tr>`;
    return row;
  }).join('');
  if(!rows.length) htm='<tr><th class="name">Usuario</th><th>Sin datos para la semana/categoría seleccionada</th></tr>';
  table.innerHTML=htm;
}
function exportJefWeekTable(){
  const rows=[['Semana','Categoria_Vista','Unidad','Usuario','Lunes','Martes','Miercoles','Jueves','Viernes','Sabado','Domingo','Total','Dias_Activos','Prom_Dia','HH_Operativas','Prod_Operativa','HH_Efectivas','Prod_Efectiva','Utilizacion']];
  lastJefWeekRows.forEach(r=>rows.push([
    'Sem '+isoWeekNumber(r.week)+' · '+labelDate(r.week), r.category, r.unit, r.user, Math.round(r.lunes), Math.round(r.martes),
    Math.round(r.miercoles), Math.round(r.jueves), Math.round(r.viernes), Math.round(r.sabado),
    Math.round(r.domingo), Math.round(r.total), r.activeDays, fmt1(r.avgDay), fmt1(r.hhOp), fmt1(r.prodOp), fmt1(r.hhEff), fmt1(r.prodEff), fmt1(r.utilization)+'%'
  ]));
  const csv='\uFEFF'+rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='Jefatura_Semana_Usuario_'+($('jefWeekDetail').value||'detalle')+'.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
