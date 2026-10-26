/* ===== Asignación de tareas =====
   Distribución de tareas por usuario (independiente del flujo principal). */
// ===== MÓDULO: DISTRIBUCIÓN / ASIGNACIÓN DE TAREAS (independiente del pipeline principal) =====
let AT_TASKS=[], AT_ROSTER=[];
let AT_HOURS_DIA=8.5;
let AT_SCHED={inicio:8*60,pausa:13*60,reinicio:14*60,salida:17.5*60};
let AT_PLAN=null;
let AT_PLAN_CAPLOG_C1=[], AT_PLAN_CAPLOG_C2=[];
const AT_AREA_ORDER=['BUFFER-C','MZN04','MZN03','MZN02','1er PISO'];

function taNorm(s){return (s==null?'':String(s)).replace(/^\uFEFF/,'').trim();}
function taFixMojibake(s){
  if(!s || !/[ÃÂ]/.test(s)) return s;
  try{
    const codes=[...s].map(c=>c.charCodeAt(0));
    if(codes.some(c=>c>255)) return s;
    const bytes=Uint8Array.from(codes);
    const fixed=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return fixed || s;
  }catch(e){return s;}
}
function taKey(s){return taFixMojibake(taNorm(s)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');}
function taNum(v){if(v==null||v==='')return 0;if(typeof v==='number')return v;const n=parseFloat(String(v).replace(/,/g,'.'));return isNaN(n)?0:n;}
const AT_AREA_GROUP={'and':'1er PISO','sel':'1er PISO','mzn01':'1er PISO','cdbuffer-c':'BUFFER-C'};
function taMapArea(raw){
  const k=taKey(raw);
  if(AT_AREA_GROUP[k])return AT_AREA_GROUP[k];
  if(k==='4to piso')return 'MZN04';
  if(k==='3er piso')return 'MZN03';
  if(k==='2do piso')return 'MZN02';
  if(k==='1er piso'||k==='1erpiso')return '1er PISO';
  if(k==='buffer-c'||k==='buffer c')return 'BUFFER-C';
  return taNorm(raw).toUpperCase();
}
function taToMinutes(v){
  if(v instanceof Date)return v.getHours()*60+v.getMinutes();
  if(typeof v==='number'){return v<2?Math.round(v*24*60):Math.round(v);}
  const s=String(v),m=s.match(/(\d{1,2}):(\d{2})/);
  return m?parseInt(m[1])*60+parseInt(m[2]):null;
}
function taTimeInputToMinutes(id){
  const v=$(id).value; if(!v)return null;
  const [h,m]=v.split(':').map(Number); return h*60+m;
}

// ---- Día de referencia y prioridad de rutas ----
const AT_DAY_PREFIX=['dom','lun','mar','mie','jue','vie','sab']; // getDay(): 0=domingo
function taBaseDate(){
  const v=$('atFechaHoy')?.value;
  if(v){const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d);}
  return new Date();
}
function taDayPrefixForOffset(base,offsetDays){
  const d=new Date(base);d.setDate(d.getDate()+offsetDays);
  return AT_DAY_PREFIX[d.getDay()];
}
function taRutaHasDayPrefix(ruta,prefix){
  const k=taKey(ruta);
  const tokens=k.split(/[^a-z]+/).filter(Boolean);
  return tokens.some(t=>t.startsWith(prefix));
}
// bucket: 0/1 = Lima día+1/+2, 2 = Lima otro, 3 = Provincia
function taBucketOf(row,p1,p2){
  if(taKey(row.zona)==='lima'){
    if(taRutaHasDayPrefix(row.ruta,p1))return 0;
    if(taRutaHasDayPrefix(row.ruta,p2))return 1;
    return 2;
  }
  return 3;
}
const AT_SUBCAT_LABEL=['Sub prioridad 1','Sub prioridad 2','Sub prioridad 3','Sub prioridad 4'];
function taSubcatLabel(bucket){return AT_SUBCAT_LABEL[bucket]||'';}
// Ordena el pool de un área según la prioridad de tareas (Lima día+1 > día+2 > otros Lima > Provincia por cantidad de ruta asc)
function taSortAreaPool(rows,p1,p2){
  const tagged=rows.map(r=>({r,bucket:taBucketOf(r,p1,p2)}));
  const routeTotal=new Map();
  tagged.filter(t=>t.bucket===3).forEach(t=>{
    routeTotal.set(t.r.ruta,(routeTotal.get(t.r.ruta)||0)+t.r.rem);
  });
  tagged.sort((a,b)=>{
    if(a.bucket!==b.bucket)return a.bucket-b.bucket;
    if(a.bucket===3){
      const d=(routeTotal.get(a.r.ruta)||0)-(routeTotal.get(b.r.ruta)||0);
      if(d!==0)return d;
    }
    return (a.r.zona+a.r.ruta).localeCompare(b.r.zona+b.r.ruta);
  });
  return tagged;
}

function taReadWorkbook(file){
  return new Promise((resolve,reject)=>{
    const isCsv=/\.csv$/i.test(file.name);
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error);
    reader.onload=()=>{
      try{
        const wb=isCsv
          ? XLSX.read(reader.result,{type:'string',cellDates:true})
          : XLSX.read(new Uint8Array(reader.result),{type:'array',cellDates:true});
        resolve(wb);
      }catch(err){reject(err);}
    };
    if(isCsv)reader.readAsText(file,'utf-8');else reader.readAsArrayBuffer(file);
  });
}
function taSheetRows(wb){
  const ws=wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
}
function taFindCol(headerRow,candidates){
  const keys=headerRow.map(h=>taKey(h));
  for(const c of candidates){const i=keys.findIndex(k=>k===c);if(i>=0)return i;}
  for(const c of candidates){const i=keys.findIndex(k=>k.includes(c));if(i>=0)return i;}
  return -1;
}

async function taLoadTasksFile(file){
  try{
    const wb=await taReadWorkbook(file);
    const rows=taSheetRows(wb);
    const headerRowIdx=rows.findIndex(r=>r&&r.some(c=>taKey(c)==='numero de tarea'));
    if(headerRowIdx<0){$('atStatus').textContent='⚠ No se encontró la columna "Número de tarea" en el archivo de tareas.';return;}
    const header=rows[headerRowIdx];
    const cTarea=taFindCol(header,['numero de tarea']);
    const cZona=taFindCol(header,['zona']);
    const cRuta=taFindCol(header,['ruta']);
    const cArea=taFindCol(header,['area']);
    const cCod=taFindCol(header,['instalacion de destino','cod tda']);
    const cTienda=taFindCol(header,['tienda']);
    const cCant=taFindCol(header,['cantidad asignada','cantidad conv','cantidad','cant']);
    const agg=new Map();
    for(let i=headerRowIdx+1;i<rows.length;i++){
      const r=rows[i];if(!r)continue;
      const tarea=taFixMojibake(taNorm(r[cTarea]));if(!tarea)continue;
      const zona=cZona>=0?taFixMojibake(taNorm(r[cZona])):'';
      const ruta=cRuta>=0?taFixMojibake(taNorm(r[cRuta])):'';
      const area=taMapArea(taFixMojibake(taNorm(cArea>=0?r[cArea]:'')));
      const cod=cCod>=0?taFixMojibake(taNorm(r[cCod])):'';
      const tienda=cTienda>=0?taFixMojibake(taNorm(r[cTienda])):'';
      const cant=cCant>=0?taNum(r[cCant]):0;
      const key=tarea+'|'+zona+'|'+ruta+'|'+area+'|'+cod;
      if(!agg.has(key))agg.set(key,{tarea,zona,ruta,area,cod,tienda,cant:0});
      agg.get(key).cant+=cant;
    }
    AT_TASKS=[...agg.values()];
    taUpdateStatus();
    taRecomputeIfReady();
  }catch(err){$('atStatus').textContent='⚠ Error leyendo el archivo de tareas: '+err.message;}
}

async function taLoadRosterFile(file){
  try{
    const wb=await taReadWorkbook(file);
    const rows=taSheetRows(wb);
    const labelMap={'hora de inicio':'inicio','hora de pausa':'pausa','hora re inicio':'reinicio','hora reinicio':'reinicio','hora salida':'salida'};
    const sched={};
    for(let i=0;i<Math.min(rows.length,6);i++){
      const r=rows[i]||[];
      for(let j=0;j<r.length;j++){
        const k=taKey(r[j]);
        if(labelMap[k]){
          let v=null;
          for(let jj=j+1;jj<r.length;jj++){if(r[jj]!=null&&r[jj]!==''){v=r[jj];break;}}
          if(v!=null)sched[labelMap[k]]=taToMinutes(v);
        }
      }
    }
    if(sched.inicio!=null&&sched.pausa!=null&&sched.reinicio!=null&&sched.salida!=null){
      AT_SCHED=sched;
      AT_HOURS_DIA=((sched.pausa-sched.inicio)+(sched.salida-sched.reinicio))/60;
    }
    const headerRowIdx=rows.findIndex(r=>r&&r.some(c=>taKey(c)==='usuario'));
    if(headerRowIdx<0){$('atStatus').textContent='⚠ No se encontró la columna "USUARIO" en el archivo de usuarios.';return;}
    const header=rows[headerRowIdx];
    const cUser=taFindCol(header,['usuario']);
    const cGrupo=taFindCol(header,['grupo']);
    const cPrio=taFindCol(header,['prioridad']);
    const areaCols=[1,2,3].map(n=>({a:taFindCol(header,[`area ${n}`]),m:taFindCol(header,[`meta x dia area ${n}`,`meta dia area ${n}`])}));
    const roster=[];
    for(let i=headerRowIdx+1;i<rows.length;i++){
      const r=rows[i];if(!r)continue;
      const usuario=taFixMojibake(taNorm(r[cUser]));if(!usuario)continue;
      const grupo=taNum(r[cGrupo]);
      const prioridad=taNum(r[cPrio]);
      const areas=[];
      areaCols.forEach(({a,m})=>{
        if(a>=0&&r[a]!=null&&taNorm(r[a])!==''){
          areas.push({area:taMapArea(taFixMojibake(taNorm(r[a]))),meta:m>=0?taNum(r[m]):0});
        }
      });
      if(areas.length)roster.push({usuario,grupo,prioridad,areas});
    }
    AT_ROSTER=roster;
    taUpdateStatus();
    taRecomputeIfReady();
  }catch(err){$('atStatus').textContent='⚠ Error leyendo el archivo de usuarios: '+err.message;}
}

function taUpdateStatus(){
  const parts=[];
  if(AT_TASKS.length){
    const totalCant=AT_TASKS.reduce((s,r)=>s+r.cant,0);
    parts.push(`${AT_TASKS.length} tareas · ${Math.round(totalCant)} pares`);
  }
  if(AT_ROSTER.length){
    parts.push(`${AT_ROSTER.length} usuarios (jornada efectiva ${AT_HOURS_DIA.toFixed(1)} h)`);
  }
  $('atStatus').textContent=parts.length?parts.join(' · '):'Sin datos de tareas cargados.';
}
function taRecomputeIfReady(){if(AT_TASKS.length&&AT_ROSTER.length){taComputePlan();taRenderView();}}

// Cola de áreas a intentar por usuario en un corte dado
function taUserAreaQueue(user,cutIdx){
  const rotating=user.grupo===3||user.grupo===4;
  if(rotating){
    const a=user.areas[cutIdx]||user.areas[user.areas.length-1];
    return a?[a]:[];
  }
  return user.areas; // grupos 1,2,5: en orden, con cascada a su 2da/3ra área si la 1ra se agota
}
function taEffectiveHoursInRange(ini,fin){
  const total=Math.max(0,fin-ini);
  const overlap=Math.max(0,Math.min(fin,AT_SCHED.reinicio)-Math.max(ini,AT_SCHED.pausa));
  return Math.max(0,total-overlap)/60;
}
function taGetCortes(){
  const c1i=taTimeInputToMinutes('atC1Ini'),c1f=taTimeInputToMinutes('atC1Fin');
  const c2i=taTimeInputToMinutes('atC2Ini'),c2f=taTimeInputToMinutes('atC2Fin');
  return [{ini:c1i,fin:c1f},{ini:c2i,fin:c2f}];
}

function taComputePlan(){
  const cortes=taGetCortes();
  const base=taBaseDate();
  const rows=AT_TASKS.map(r=>({...r,rem:r.cant}));
  const cortesOut=[[],[]];
  let deficit=new Map(); // usuario -> pares que le faltaron en el corte anterior

  for(let ci=0;ci<cortes.length;ci++){
    const horas=taEffectiveHoursInRange(cortes[ci].ini,cortes[ci].fin);
    const p1=taDayPrefixForOffset(base,1), p2=taDayPrefixForOffset(base,2);

    const uState=new Map();
    const totalCap=new Map();
    AT_ROSTER.forEach(u=>{
      const queue=taUserAreaQueue(u,ci).filter(a=>a && a.meta>0);
      if(!queue.length)return;
      const q=queue.map(a=>({area:a.area,cap:Math.round(a.meta/(AT_HOURS_DIA||8.5)*horas)}));
      if(deficit.has(u.usuario)) q[0].cap+=deficit.get(u.usuario);
      uState.set(u.usuario,{usuario:u.usuario,prioridad:u.prioridad,grupo:u.grupo,queue:q,qi:0,used:0});
      totalCap.set(u.usuario, q.reduce((s,x)=>s+x.cap,0));
    });
    const totalUsed=new Map([...uState.keys()].map(k=>[k,0]));

    const capLog=[];
    AT_AREA_ORDER.forEach(area=>{
      const own=rows.filter(r=>r.rem>0 && r.area===area);
      const extra=area==='1er PISO' ? rows.filter(r=>r.rem>0 && r.area==='CDBUFFER') : [];
      const combined=own.concat(extra);
      if(!combined.length)return;
      const sortedPool=taSortAreaPool(combined,p1,p2);

      // agrupa en rutas consecutivas (ya vienen ordenadas por prioridad/zona/ruta): cierra una antes de abrir la siguiente
      const routes=[];
      let curKey=null,curArr=null;
      sortedPool.forEach(item=>{
        const key=item.r.zona+'|'+item.r.ruta;
        if(key!==curKey){curKey=key;curArr=[];routes.push(curArr);}
        curArr.push(item);
      });

      const eligible=[...uState.values()]
        .filter(u=>u.qi<u.queue.length && u.queue[u.qi].area===area)
        .sort((a,b)=>a.prioridad-b.prioridad);
      if(!eligible.length)return;
      const capLeft=new Map(eligible.map(u=>[u.usuario,u.queue[u.qi].cap]));

      routes.forEach(routeItems=>{
        for(const u of eligible){
          let cap=capLeft.get(u.usuario);
          if(cap<=0)continue;
          for(const item of routeItems){
            if(cap<=0)break;
            const t=item.r;
            if(t.rem<=0)continue;
            if(t.area==='CDBUFFER' && !(u.grupo===3||u.grupo===4))continue;
            const take=Math.min(cap,t.rem);
            if(take<=0)continue;
            cortesOut[ci].push({tarea:t.tarea,zona:t.zona,ruta:t.ruta,cod:t.cod,tienda:t.tienda,area:t.area,cant:take,usuario:u.usuario,subcat:taSubcatLabel(item.bucket)});
            t.rem-=take;cap-=take;
          }
          capLeft.set(u.usuario,cap);
        }
      });

      eligible.forEach(u=>{
        const capOrig=u.queue[u.qi].cap;
        const used=capOrig-capLeft.get(u.usuario);
        totalUsed.set(u.usuario,(totalUsed.get(u.usuario)||0)+used);
        capLog.push({usuario:u.usuario,grupo:u.grupo,corte:ci+1,area,cap:capOrig,used});
        u.qi++;
      });
    });

    deficit=new Map();
    uState.forEach((u,usuario)=>{
      const d=(totalCap.get(usuario)||0)-(totalUsed.get(usuario)||0);
      if(d>0)deficit.set(usuario,d);
    });
    if(ci===0) AT_PLAN_CAPLOG_C1=capLog; else AT_PLAN_CAPLOG_C2=capLog;
  }

  const p1f=taDayPrefixForOffset(base,1), p2f=taDayPrefixForOffset(base,2);
  const sinAsignar=rows.filter(r=>r.rem>0).map(r=>({tarea:r.tarea,zona:r.zona,ruta:r.ruta,cod:r.cod,tienda:r.tienda,area:r.area,cant:r.rem,subcat:taSubcatLabel(taBucketOf(r,p1f,p2f))}));
  AT_PLAN={cortes:cortesOut,sinAsignar,cortesDef:cortes,capLog:[...AT_PLAN_CAPLOG_C1,...AT_PLAN_CAPLOG_C2]};
}

function taFmtHM(min){if(min==null)return'--:--';const h=Math.floor(min/60),m=min%60;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');}

function taAreaChartByCorte(el,byAreaC1,byAreaC2){
  const areas=[...new Set([...byAreaC1.keys(),...byAreaC2.keys()])];
  const data=areas.map(a=>{
    const c1=byAreaC1.get(a)||{cant:0,tasks:0}, c2=byAreaC2.get(a)||{cant:0,tasks:0};
    return {k:a,c1:c1.cant,c1u:c1.tasks?Math.round(c1.cant/c1.tasks):0,c2:c2.cant,c2u:c2.tasks?Math.round(c2.cant/c2.tasks):0};
  }).sort((a,b)=>(b.c1+b.c2)-(a.c1+a.c2));
  if(!data.length){el.innerHTML='<div class="mini">Sin datos.</div>';return;}
  const W=420,rowH=30,H=data.length*rowH+12,L=78,R=64,T=6;
  const mx=Math.max(...data.map(d=>Math.max(d.c1,d.c2)))*1.1||1;
  let s=`<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:460px;height:auto;display:block;margin:0 auto">`;
  data.forEach((d,i)=>{
    const y=T+i*rowH;
    const w1=(W-L-R)*d.c1/mx, w2=(W-L-R)*d.c2/mx;
    s+=`<text x="${L-6}" y="${y+11}" text-anchor="end" font-size="8.5" fill="#405565">${escapeHtml(d.k)}</text>`+
       `<rect x="${L}" y="${y+1}" width="${w1}" height="11" rx="2" fill="#f4d03f"/>`+
       `<text x="${L+w1+5}" y="${y+10}" font-size="8" font-weight="700" fill="#7a5b00">${Math.round(d.c1)} (UPT ${d.c1u})</text>`+
       `<rect x="${L}" y="${y+14}" width="${w2}" height="11" rx="2" fill="#4caf50"/>`+
       `<text x="${L+w2+5}" y="${y+23}" font-size="8" font-weight="700" fill="#1e5c22">${Math.round(d.c2)} (UPT ${d.c2u})</text>`;
  });
  s+='</svg>';el.innerHTML=s;
}

function taRenderTable(el,rows,withCorte){
  if(!rows.length){el.innerHTML='<div class="mini">Sin tareas.</div>';return;}
  const cols=withCorte
    ? '<th>Corte</th><th>Tarea</th><th>Zona</th><th>Sub Categoria</th><th>Ruta</th><th>Cod TDA</th><th>Área</th><th>Cant</th><th>UPT</th><th>Usuario</th>'
    : '<th>Tarea</th><th>Zona</th><th>Sub Categoria</th><th>Ruta</th><th>Cod TDA</th><th>Área</th><th>Cant</th><th>UPT</th><th>Usuario</th>';
  let h=`<thead><tr>${cols}</tr></thead><tbody>`;
  const byUser=new Map();
  rows.forEach(r=>{
    const k=r.usuario+'|'+(r.corte||'');
    if(!byUser.has(k))byUser.set(k,{cant:0,tasks:0});
    const u=byUser.get(k);u.cant+=r.cant;u.tasks+=1;
  });
  rows.forEach(r=>{
    const u=byUser.get(r.usuario+'|'+(r.corte||''));
    const upt=u.tasks?Math.round(u.cant/u.tasks):0;
    const rowStyle=withCorte ? ` style="background:${r.corte===1?'#fff6cf':'#e2f6e3'}"` : '';
    const corteTd=withCorte ? `<td>${r.corte===1?'Corte 1':'Corte 2'}</td>` : '';
    h+=`<tr${rowStyle}>${corteTd}<td>${escapeHtml(r.tarea)}</td><td>${escapeHtml(r.zona)}</td><td>${escapeHtml(r.subcat||'')}</td><td>${escapeHtml(r.ruta)}</td><td>${escapeHtml(r.cod||'')}</td><td>${escapeHtml(r.area)}</td><td>${Math.round(r.cant)}</td><td>${upt}</td><td>${escapeHtml(r.usuario)}</td></tr>`;
  });
  h+='</tbody>';el.innerHTML=h;
}

function taRowsToCsv(rows,withCorte){
  const head=withCorte
    ? ['Corte','Numero de tarea','ZONA','Sub Categoria','Ruta','Cod TDA','Tienda','Area','Cant','UPT','Usuario']
    : ['Numero de tarea','ZONA','Sub Categoria','Ruta','Cod TDA','Tienda','Area','Cant','UPT','Usuario'];
  const byUser=new Map();
  rows.forEach(r=>{const k=r.usuario+'|'+(r.corte||'');if(!byUser.has(k))byUser.set(k,{cant:0,tasks:0});const u=byUser.get(k);u.cant+=r.cant;u.tasks+=1;});
  const lines=[head.join(',')];
  rows.forEach(r=>{
    const u=byUser.get(r.usuario+'|'+(r.corte||''));const upt=u.tasks?Math.round(u.cant/u.tasks):0;
    const vals=withCorte
      ? [r.corte===1?'Corte 1':'Corte 2',r.tarea,r.zona,r.subcat||'',r.ruta,r.cod||'',r.tienda||'',r.area,Math.round(r.cant),upt,r.usuario]
      : [r.tarea,r.zona,r.subcat||'',r.ruta,r.cod||'',r.tienda||'',r.area,Math.round(r.cant),upt,r.usuario];
    lines.push(vals.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  });
  return lines.join('\n');
}
function taDownloadCsv(rows,filename,withCorte){
  const csv='\uFEFF'+taRowsToCsv(rows,withCorte);
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}


function taRenderCumplTable(){
  const el=$('atCumplTable');
  const log=(AT_PLAN&&AT_PLAN.capLog)||[];
  if(!log.length){el.innerHTML='<div class="mini">Sin datos.</div>';return;}
  let h='<thead><tr><th>Usuario</th><th>Grupo</th><th>Corte</th><th>Área</th><th>Capacidad esperada</th><th>Asignado</th><th>Cumplimiento</th></tr></thead><tbody>';
  log.sort((a,b)=> a.corte-b.corte || a.usuario.localeCompare(b.usuario));
  log.forEach(r=>{
    const pct=r.cap>0?Math.round(100*r.used/r.cap):100;
    const color=pct>=95?'#1e5c22':pct>=70?'#7a5b00':'#8a1f1f';
    const bg=r.corte===1?'#fff6cf':'#e2f6e3';
    h+=`<tr style="background:${bg}"><td>${escapeHtml(r.usuario)}</td><td>${r.grupo}</td><td>Corte ${r.corte}</td><td>${escapeHtml(r.area)}</td><td>${r.cap}</td><td>${Math.round(r.used)}</td><td style="color:${color};font-weight:700">${pct}%</td></tr>`;
  });
  h+='</tbody>';el.innerHTML=h;
}

function taRenderView(){
  if(!AT_PLAN)return;
  const cortesDef=AT_PLAN.cortesDef;
  $('atC1Label').textContent='Corte 1 ('+taFmtHM(cortesDef[0].ini)+'–'+taFmtHM(cortesDef[0].fin)+')';
  $('atC2Label').textContent='Corte 2 ('+taFmtHM(cortesDef[1].ini)+'–'+taFmtHM(cortesDef[1].fin)+')';

  const byAreaByCorte=[0,1].map(ci=>{
    const byArea=new Map();
    AT_PLAN.cortes[ci].forEach(r=>{
      if(!byArea.has(r.area))byArea.set(r.area,{cant:0,tasks:0});
      const a=byArea.get(r.area);a.cant+=r.cant;a.tasks+=1;
    });
    return byArea;
  });
  taAreaChartByCorte($('atAreaChart'),byAreaByCorte[0],byAreaByCorte[1]);
  taRenderCumplTable();

  const allRows=AT_PLAN.cortes[0].map(r=>({...r,corte:1})).concat(AT_PLAN.cortes[1].map(r=>({...r,corte:2})));
  taRenderTable($('atTasksTable'),allRows,true);
  taRenderTable($('atLeftoverTable'),AT_PLAN.sinAsignar,false);

  const totalTareas=AT_TASKS.length;
  const totalPares=AT_TASKS.reduce((s,r)=>s+r.cant,0);
  const asignadas1=AT_PLAN.cortes[0].reduce((s,r)=>s+r.cant,0);
  const asignadas2=AT_PLAN.cortes[1].reduce((s,r)=>s+r.cant,0);
  const sinAsig=AT_PLAN.sinAsignar.reduce((s,r)=>s+r.cant,0);
  $('atSummary').innerHTML=`<b>${totalTareas}</b> tareas · <b>${Math.round(totalPares)}</b> pares totales &nbsp;|&nbsp; `+
    `Corte 1: <b>${Math.round(asignadas1)}</b> pares &nbsp;·&nbsp; Corte 2: <b>${Math.round(asignadas2)}</b> pares &nbsp;|&nbsp; `+
    `Sin asignar: <b>${Math.round(sinAsig)}</b>`;
  AT_PLAN.allRows=allRows;
}

(function(){
  const el=$('atFechaHoy');
  if(el && !el.value){
    const d=new Date();
    el.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
})();
$('atTasksInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f){if(!requestUploadAccess()){e.target.value='';return;}await taLoadTasksFile(f);await saveCloud();}e.target.value='';});
$('atRosterInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f){if(!requestUploadAccess()){e.target.value='';return;}await taLoadRosterFile(f);await saveCloud();}e.target.value='';});
$('atRecalcBtn').addEventListener('click',()=>taRecomputeIfReady());
$('atDownloadBtn').addEventListener('click',()=>{if(AT_PLAN)taDownloadCsv(AT_PLAN.allRows,'asignacion_tareas.csv',true);});
