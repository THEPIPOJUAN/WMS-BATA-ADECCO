/* ===== Resumen y gráficos base =====
   Filtrado de datos, resúmenes por periodo y gráficos de líneas/barras. */
function filtered(){
  const days=getMultiSelected('day');
  const months=getMultiSelected('month');
  const weeks=getMultiSelected('week');
  const cats=getMultiSelected('cat');
  const users=getMultiSelected('user');
  const areas=getMultiSelected('area');
  const tipos=getMultiSelected('tipo');
  const turnos=getMultiSelected('turno');

  return DATA.filter(r=>
    (!days.size || days.has(r.d)) &&
    (!months.size || months.has(r.d.slice(0,7))) &&
    (!weeks.size || weeks.has(weekFilterKey(r.d))) &&
    (!cats.size || cats.has(r.c) || (r.c==='PP' && cats.has('PP UNDS'))) &&
    (!users.size || users.has(r.u)) &&
    (!areas.size || areas.has(r.a)) &&
    (!tipos.size || tipos.has(r.p)) &&
    (!turnos.size || turnos.has(turnoKey(r.t))) &&
    (window.OPSEL==='AMBOS' || (r.op||'PICKING')===(window.OPSEL||'PICKING'))
  );
}
function currentProdMode(){
  return $('prodMode')?.value || SETTINGS.prodMode || 'operational';
}
function shouldSeparateByDay(){return getMultiSelected('day').size!==1;}
function enforceDailyExecutiveView(){const s=$('mgmtLevel');if(s&&shouldSeparateByDay()&&s.value!=='day')s.value='day';}
function modeLabel(){
  return currentProdMode()==='effective' ? 'Efectiva WMS' : 'Operativa estimada';
}
function summarize(arr,mode=currentProdMode(),unitFn=(r)=>r.n){
  let units=0,rows=0,effectiveMinutes=0,operationalMinutes=0;
  const users=new Set(),tasks=new Set();
  for(const r of arr){
    units+=Number(unitFn(r))||0;
    rows+=r.r;
    effectiveMinutes+=(r.m||0);
    operationalMinutes+=(r.om||0);
    users.add(r.u);
    if(r.task)tasks.add(r.task);
  }
  const hhEff=effectiveMinutes/60;
  const hhOp=operationalMinutes/60;
  const prodEff=hhEff>0?units/hhEff:0;
  const prodOp=hhOp>0?units/hhOp:0;
  const utilization=hhOp>0?(hhEff/hhOp*100):0;
  const hh=mode==='effective'?hhEff:hhOp;
  const prod=mode==='effective'?prodEff:prodOp;
  return {
    units,rows,effectiveMinutes,operationalMinutes,
    hhEff,hhOp,prodEff,prodOp,utilization,
    hh,prod,minutes:mode==='effective'?effectiveMinutes:operationalMinutes,
    pickers:users.size,tasks:tasks.size,mode
  };
}
function grouped(arr,keyFn,mode=currentProdMode(),unitFn=(r)=>r.n){
  const m=new Map();
  for(const r of arr){
    const k=keyFn(r);
    let g=m.get(k);
    if(!g){
      g={k,units:0,rows:0,effectiveMinutes:0,operationalMinutes:0,users:new Set(),tasks:new Set()};
      m.set(k,g);
    }
    g.units+=unitFn(r);
    g.rows+=r.r;
    g.effectiveMinutes+=(r.m||0);
    g.operationalMinutes+=(r.om||0);
    g.users.add(r.u);
    if(r.task)g.tasks.add(r.task);
  }
  return [...m.values()].map(g=>{
    const hhEff=g.effectiveMinutes/60;
    const hhOp=g.operationalMinutes/60;
    const prodEff=hhEff>0?g.units/hhEff:0;
    const prodOp=hhOp>0?g.units/hhOp:0;
    const utilization=hhOp>0?(hhEff/hhOp*100):0;
    const hh=mode==='effective'?hhEff:hhOp;
    const prod=mode==='effective'?prodEff:prodOp;
    return {
      k:g.k,units:g.units,rows:g.rows,
      effectiveMinutes:g.effectiveMinutes,operationalMinutes:g.operationalMinutes,
      hhEff,hhOp,prodEff,prodOp,utilization,
      hh,prod,
      pickers:g.users.size,tasks:g.tasks.size,mode
    };
  });
}

function weeklyUnitsProdChart(el,data,meta,labelFn=d=>'Sem '+isoWeekNumber(d.k),unitLabel='Unidades',unitText='und/HH'){
  if(!data.length){el.innerHTML='<div class="mini">Sin datos para los filtros seleccionados.</div>';return}
  const baseW=900;
  const pxPerPoint=data.length>40?56:data.length>24?64:72;
  const W=Math.max(baseW,data.length*pxPerPoint);
  const H=330,L=72,R=72,T=28,B=56;
  const maxUnits=Math.max(...data.map(d=>d.units),1)*1.15;
  const maxProd=Math.max(meta,...data.map(d=>d.prod),1)*1.18;
  const pW=W-L-R,pH=H-T-B;
  const x=i=>L+(i+.5)*pW/data.length;
  const yU=v=>T+pH-(v/maxUnits)*pH;
  const yP=v=>T+pH-(v/maxProd)*pH;
  const bw=Math.max(14,Math.min(48,pW/data.length*.52));
  const labelSize=data.length>40?9:10;
  const valueSize=data.length>40?9:10;
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;max-width:none;display:block">`;

  for(let i=0;i<=4;i++){
    const vu=maxUnits*i/4, yy=yU(vu);
    s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf2"/>
        <text x="${L-10}" y="${yy+4}" text-anchor="end" font-size="10" fill="#71808d">${Math.round(vu).toLocaleString('es-PE')}</text>`;
  }

  for(let i=0;i<=4;i++){
    const vp=maxProd*i/4, yy=yP(vp);
    s+=`<text x="${W-R+10}" y="${yy+4}" text-anchor="start" font-size="10" fill="#71808d">${Math.round(vp)}</text>`;
  }

  data.forEach((d,i)=>{
    const cx=x(i), yy=yU(d.units), h=T+pH-yy;
    const topLabel = d.units>=1000 ? `${Math.round(d.units/1000)}k` : `${Math.round(d.units)}`;
    s+=`<rect x="${cx-bw/2}" y="${yy}" width="${bw}" height="${h}" rx="3" fill="#2d3139" opacity=".88"/>
        <text x="${cx}" y="${Math.max(13,yy-7)}" text-anchor="middle" font-size="${valueSize}" font-weight="700" fill="#2d3139">${topLabel}</text>`;
  });

  const my=yP(meta);
  s+=`<line x1="${L}" y1="${my}" x2="${W-R}" y2="${my}" stroke="#98a6b2" stroke-dasharray="6 5"/>
      <text x="${W-R}" y="${my-7}" text-anchor="end" font-size="10" fill="#71808d">Meta ${meta}</text>`;

  const pts=data.map((d,i)=>`${x(i)},${yP(d.prod)}`).join(' ');
  s+=`<polyline points="${pts}" fill="none" stroke="#e31b2a" stroke-width="3"/>`;
  data.forEach((d,i)=>{
    const xx=x(i),yy=yP(d.prod);
    s+=`<circle cx="${xx}" cy="${yy}" r="4.5" fill="#e31b2a"/>
        <text x="${xx}" y="${yy-10}" text-anchor="middle" font-size="${valueSize}" font-weight="800" fill="#e31b2a">${fmt1(d.prod)}</text>
        <text x="${xx}" y="${H-24}" text-anchor="middle" font-size="${labelSize}" fill="#607181">${escapeHtml(labelFn(d))}</text>`;
  });

  s+=`<text x="18" y="${T+10}" font-size="10" fill="#607181">${escapeHtml(unitLabel)}</text>
      <text x="${W-18}" y="${T+10}" text-anchor="end" font-size="10" fill="#607181">${escapeHtml(unitText)}</text>
      <g font-size="10" fill="#607181">
        <rect x="${W/2-130}" y="${H-10}" width="12" height="8" rx="2" fill="#2d3139"/>
        <text x="${W/2-112}" y="${H-3}">${escapeHtml(unitLabel)}</text>
        <line x1="${W/2-38}" y1="${H-6}" x2="${W/2-18}" y2="${H-6}" stroke="#e31b2a" stroke-width="3"/>
        <text x="${W/2-10}" y="${H-3}">Productividad</text>
      </g></svg>`;
  const hint=W>baseW ? '<div class="scrollhint">↔ Desplázate horizontalmente para revisar todos los días del período.</div>' : '';
  el.innerHTML=`<div class="chartwrap">${s}</div>${hint}`;
}

function lineChart(el,data,meta,labelFn=x=>x){
  if(!data.length){el.innerHTML='<div class="mini">Sin datos para los filtros seleccionados.</div>';return}
  const baseW=760,pxPerPoint=data.length>40?58:data.length>24?66:74;
  const W=Math.max(baseW,data.length*pxPerPoint),H=290,L=54,R=18,T=22,B=48;
  const vals=data.map(x=>x.prod), max=Math.max(meta,...vals)*1.15,min=0, plotW=W-L-R,plotH=H-T-B;
  const x=i=>L+(data.length===1?plotW/2:i*plotW/(data.length-1));
  const y=v=>T+plotH-(v-min)/(max-min||1)*plotH;
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:${W}px;height:${H}px;max-width:none;display:block">`;
  for(let i=0;i<=4;i++){const v=max*i/4, yy=y(v);s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf2"/><text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="11" fill="#71808d">${Math.round(v)}</text>`}
  const my=y(meta); s+=`<line x1="${L}" y1="${my}" x2="${W-R}" y2="${my}" stroke="#98a6b2" stroke-dasharray="6 5"/><text x="${W-R}" y="${my-6}" text-anchor="end" font-size="10" fill="#71808d">Meta ${meta}</text>`;
  const pts=data.map((d,i)=>`${x(i)},${y(d.prod)}`).join(' ');
  s+=`<polyline points="${pts}" fill="none" stroke="#e31b2a" stroke-width="3"/>`;
  const every=Math.max(1,Math.ceil(data.length/12));
  data.forEach((d,i)=>{const xx=x(i),yy=y(d.prod);s+=`<circle cx="${xx}" cy="${yy}" r="4.5" fill="#e31b2a"/><text x="${xx}" y="${yy-10}" text-anchor="middle" font-size="11" font-weight="700" fill="#23384b">${fmt1(d.prod)}</text>`; if(i%every===0||i===data.length-1)s+=`<text x="${xx}" y="${H-18}" text-anchor="middle" font-size="10" fill="#607181">${escapeHtml(labelFn(d.k))}</text>`});
  s+='</svg>';
  const hint=W>baseW?'<div class="scrollhint">↔ Desplázate horizontalmente para revisar todos los períodos.</div>':'';
  el.innerHTML=`<div class="chartwrap">${s}</div>${hint}`;
}
function barChart(el,data,meta,opts={}){
  const horizontal=opts.horizontal||false, maxItems=opts.maxItems||12;
  data=data.slice(0,maxItems); if(!data.length){el.innerHTML='<div class="mini">Sin datos.</div>';return}
  if(horizontal){
    const W=560,rowH=30,H=Math.max(230,data.length*rowH+35),L=115,R=55,T=12;
    const mx=Math.max(meta,...data.map(d=>d.prod))*1.08;
    let s=`<svg viewBox="0 0 ${W} ${H}">`;
    data.forEach((d,i)=>{const y=T+i*rowH,w=(W-L-R)*d.prod/(mx||1);s+=`<text x="${L-7}" y="${y+16}" text-anchor="end" font-size="10" fill="#405565">${escapeHtml(d.k)}</text><rect x="${L}" y="${y+4}" width="${w}" height="17" rx="3" fill="${colorFor(d.prod,meta)}"/><text x="${L+w+5}" y="${y+17}" font-size="10" font-weight="700" fill="#263a4b">${fmt1(d.prod)}</text>`});
    s+='</svg>';el.innerHTML=s;return;
  }
  const W=520,H=280,L=45,R=15,T=18,B=55,mx=Math.max(meta,...data.map(d=>d.prod))*1.15,pW=W-L-R,pH=H-T-B,bw=pW/data.length*.62;
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){const v=mx*i/4, yy=T+pH-v/mx*pH;s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e7edf2"/><text x="${L-6}" y="${yy+4}" text-anchor="end" font-size="10" fill="#71808d">${Math.round(v)}</text>`}
  data.forEach((d,i)=>{const cx=L+(i+.5)*pW/data.length,h=pH*d.prod/(mx||1),y=T+pH-h;s+=`<rect x="${cx-bw/2}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${colorFor(d.prod,meta)}"/><text x="${cx}" y="${y-7}" text-anchor="middle" font-size="11" font-weight="700" fill="#24384a">${fmt1(d.prod)}</text><text x="${cx}" y="${H-23}" text-anchor="middle" font-size="10" fill="#607181">${escapeHtml(d.k)}</text>`});
  s+='</svg>';el.innerHTML=s;
}

function dailyUnitsChart(el,data,meta,unitLabel='Unidades'){
  if(!data.length){el.innerHTML='<div class="mini">Sin datos para el período seleccionado.</div>';return}
  const W=820,H=300,L=60,R=18,T=25,B=48;
  const maxUnits=Math.max(...data.map(d=>d.units),1)*1.15;
  const pW=W-L-R,pH=H-T-B;
  const bw=Math.max(3,Math.min(30,pW/data.length*.68));
  const x=i=>L+(i+.5)*pW/data.length;
  const y=v=>T+pH-(v/maxUnits)*pH;
  let s=`<svg viewBox="0 0 ${W} ${H}">`;
  for(let i=0;i<=4;i++){
    const v=maxUnits*i/4, yy=y(v);
    s+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e6edf2"/>
        <text x="${L-8}" y="${yy+4}" text-anchor="end" font-size="10" fill="#71808d">${Math.round(v).toLocaleString('es-PE')}</text>`;
  }
  const labelEvery=Math.max(1,Math.ceil(data.length/9));
  data.forEach((d,i)=>{
    const cx=x(i), yy=y(d.units), h=(T+pH)-yy, col=colorFor(d.prod,meta);
    s+=`<rect x="${cx-bw/2}" y="${yy}" width="${bw}" height="${h}" rx="2" fill="${col}" opacity=".9"/>`;
    if(data.length<=16){
      s+=`<text x="${cx}" y="${Math.max(12,yy-6)}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#263a4b">${fmt(d.units)}</text>`;
    }
    if(i%labelEvery===0 || i===data.length-1){
      s+=`<text x="${cx}" y="${H-21}" text-anchor="middle" font-size="9.5" fill="#607181">${labelDate(d.k).slice(0,5)}</text>`;
    }
  });
  s+=`<text x="${W-R}" y="${T+10}" text-anchor="end" font-size="10" fill="#607181">${escapeHtml(unitLabel)} · verde ≥ meta · ámbar cerca · rojo bajo meta</text>`;
  s+='</svg>'; el.innerHTML=s;
}
