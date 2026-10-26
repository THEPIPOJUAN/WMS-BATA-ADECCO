/* ===== Operación y archivos cargados =====
   Selector PICKING / PACKING / AMBOS, lista de archivos cargados y progreso. */
(function(){
const opOf=r=>r.op||'PICKING';
window.OPSEL='PICKING';
function askOp(){return new Promise(res=>{
 const o=document.createElement('div');o.id='opModal';
 o.innerHTML='<div class="opbox"><div class="ophead">¿QUÉ FORMATO ESTÁ SUBIENDO?</div><div class="opbtns"><button data-op="PICKING">PICKING</button><button data-op="PACKING">PACKING</button></div><a href="#" class="opcancel">Cancelar</a></div>';
 o.addEventListener('click',e=>{const b=e.target.closest('button[data-op]');if(b){o.remove();res(b.dataset.op);}else if(e.target.closest('.opcancel')||e.target===o){e.preventDefault();o.remove();res(null);}});
 document.body.appendChild(o);});}
window.FILES=window.FILES||[];
const newSrc=(name,op,kind)=>{const id='f'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);window.FILES.push({id,name,op,kind,at:new Date().toISOString()});return id;};
window.__newSrc=(n,o,k)=>newSrc(n,o,k);
const tag=(a,from,op,src)=>{for(let i=from;i<a.length;i++)if(!a[i].op){a[i].op=op;if(src)a[i].src=src;}};
const pushAll=(t,s)=>{for(let i=0;i<s.length;i++)t.push(s[i]);};
const ln=a=>a.reduce((s,r)=>s+(Number(r.r)||0),0);
function report(added,dup,label){
 const t=added+dup,p=t?Math.round(added/t*100):100;
 $('progressBox').style.display='block';$('progressBar').style.width=p+'%';window.renderFiles&&window.renderFiles();
 $('progressText').innerHTML=label+': <b>'+p+'% procesado</b>'+(dup?' · <b style="color:#c92535">'+(100-p)+'% no se procesó por duplicidad</b> ('+fmt(dup)+' de '+fmt(t)+' líneas)':' · sin duplicados');
}
async function save(){try{if(window.saveCloud)await window.saveCloud();}catch(e){}}
// Formato Data: por Fecha+Usuario conserva la versión con más líneas (no duplica)
function mergeD(nr,op){
 const k=r=>r.d+'|'+r.u,ns=new Set(nr),ex=new Map(),nl=new Map();
 [HIST_DATA,DAY_DATA].forEach(a=>a.forEach(r=>{if(ns.has(r)||opOf(r)!==op)return;ex.set(k(r),(ex.get(k(r))||0)+(Number(r.r)||0));}));
 nr.forEach(r=>nl.set(k(r),(nl.get(k(r))||0)+(Number(r.r)||0)));
 let added=0,dup=0;const drop=new Set(),repl=new Set();
 nl.forEach((n,key)=>{const e=ex.get(key)||0;if(e>=n&&e>0){drop.add(key);dup+=n;}else{added+=n-e;dup+=e;if(e>0)repl.add(key);}});
 const keep=r=>ns.has(r)?!drop.has(k(r)):!(opOf(r)===op&&repl.has(k(r)));
 HIST_DATA=HIST_DATA.filter(keep);DAY_DATA=DAY_DATA.filter(keep);
 return {added,dup,drop,repl};
}
const sig=r=>[r.d,r.u,r.h,r.c,r.t,r.a,r.p,r.n,r.raw,r.r].join('|');
const _ud=updateDayData,_lh=loadHistoricalFiles,_lp=loadProcessedHistory;
updateDayData=async function(fl){
 const files=Array.isArray(fl)?fl:(fl?[fl]:[]);if(!files.length)return;const op=await askOp();if(!op)return;
 let A=0,D=0,done=0;
 for(const file of files){
  let up=file,pkInfo=null;if(op==='PACKING'){try{pkInfo=await window.__packingCSV(file);up=pkInfo.file;}catch(err){window.__toast('❌ '+file.name+': '+err.message);continue;}}
  const pd=DAY_DATA.length,pt=DAY_DETAILS.length,pm=DAY_META.length;
  await _ud(up);
  if(DAY_DATA.length===pd&&DAY_META.length===pm)continue;
  const sid=newSrc(file.name,op,'Operación del día');const nr=DAY_DATA.slice(pd);tag(DAY_DATA,pd,op,sid);tag(DAY_DETAILS,pt,op,sid);
  const meta=DAY_META.length>pm?DAY_META[DAY_META.length-1]:null;if(meta){meta.op=op;meta.src=sid;}
  let added=meta?meta.added||0:0,dup=meta?meta.duplicates||0:0;
  if(nr.length&&DAY_DETAILS.length===pt){const r=mergeD(nr,op);added=r.added;dup=r.dup;
   if(pkInfo){const kk=d=>d.d+'|'+d.u;DAY_DETAILS=DAY_DETAILS.filter(d=>!(opOf(d)===op&&r.repl.has(kk(d))));pkInfo.details.forEach(d=>{if(r.drop.has(kk(d)))return;d.op=op;d.src=sid;DAY_DETAILS.push(d);});}}
  rebuildCombinedData({resetRange:!HIST_DATA.length,preserveFilters:true});
  A+=added;D+=dup;done++;
 }
 if(!done)return;
 report(A,D,'Día ('+op+') · '+done+' archivo'+(done>1?'s':''));await save();
};
loadHistoricalFiles=async function(fl){
 const files=[...fl];if(!files.length)return;const op=await askOp();if(!op)return;
 const kh=HIST_DATA.filter(r=>opOf(r)!==op),kd=HIST_DETAILS.filter(r=>opOf(r)!==op),km=HIST_META.filter(m=>(m.op||'PICKING')!==op),orig=HIST_DATA;
 let fx=files;const pkis=[];if(op==='PACKING'){try{fx=[];for(const x of files){const pi=await window.__packingCSV(x);pkis.push(pi);fx.push(pi.file);}}catch(err){window.__toast('❌ '+err.message);return;}}
 const acc=[],accD=[],accM=[];let ok=0;
 for(let k=0;k<fx.length;k++){
  const bf=HIST_DATA;await _lh([fx[k]]);if(HIST_DATA===bf)continue;ok++;
  const sid=newSrc(files[k].name,op,'Histórico bruto');
  tag(HIST_DATA,0,op,sid);tag(HIST_DETAILS,0,op,sid);HIST_META.forEach(m=>{if(!m.op){m.op=op;m.src=sid;}});
  pushAll(acc,HIST_DATA);pushAll(accD,HIST_DETAILS);pushAll(accM,HIST_META);
  if(pkis[k])pkis[k].details.forEach(d=>{d.op=op;d.src=sid;accD.push(d);});
 }
 if(!ok){HIST_DATA=orig;return;}
 const seen=new Set(),nr=[];let dup=0;
 acc.forEach(r=>{const s=sig(r);if(seen.has(s))dup+=Number(r.r)||0;else{seen.add(s);nr.push(r);}});
 HIST_DATA=kh.concat(nr);HIST_DETAILS=kd.concat(accD);HIST_META=km.concat(accM);
 rebuildCombinedData({resetRange:true,preserveFilters:false});
 report(ln(nr),dup,'Histórico bruto ('+op+')');await save();
};
loadProcessedHistory=async function(file){
 if(!file)return;
 if(/\.(csv|txt|xlsx)$/i.test(file.name))return loadHistoricalFiles([file]);const op=await askOp();if(!op)return;
 const kh=HIST_DATA.filter(r=>opOf(r)!==op),kd=HIST_DETAILS.filter(r=>opOf(r)!==op),km=HIST_META.filter(m=>(m.op||'PICKING')!==op),before=HIST_DATA;
 await _lp(file);if(HIST_DATA===before)return;
 const sid=newSrc(file.name,op,'Histórico procesado');HIST_DATA.forEach(r=>{if(!r.op)r.op=op;r.src=sid;});HIST_META.forEach(m=>{if(!m.op){m.op=op;m.src=sid;}});
 const n=ln(HIST_DATA);HIST_DATA=kh.concat(HIST_DATA);HIST_DETAILS=kd;HIST_META=km.concat(HIST_META);
 rebuildCombinedData({resetRange:true,preserveFilters:false});
 report(n,0,'Histórico procesado ('+op+')');await save();
};
// ===== Resumen AMBOS =====
function renderOpSummary(){
 const box=document.getElementById('opSummary'),both=window.OPSEL==='AMBOS';
 const kp=document.querySelector('#dash section.kpis');if(kp)kp.style.display=both?'none':'';
 if(!box)return;box.style.display=both?'block':'none';if(!both)return;
 const sv=window.OPSEL,g={};
 try{['PICKING','PACKING'].forEach(o=>{window.OPSEL=o;g[o]=filtered();});}finally{window.OPSEL=sv;}
 const meta=activeMeta(),mode=currentProdMode(),uf=activeUnitFn();
 let cards=document.getElementById('opCards');if(!cards){cards=document.createElement('div');cards.id='opCards';cards.className='opcards';box.insertBefore(cards,box.querySelector('.heatbox'));}
 cards.innerHTML=['PICKING','PACKING'].map(o=>{const a=g[o];if(!a.length)return '<div class="opcard"><h4>'+o+'</h4><div class="opempty">Sin datos para los filtros seleccionados.</div></div>';
  const mo=o==='PACKING'?600:meta,S=summarize(a,mode,uf),col=colorFor(S.prod,mo);
  const t=(l,v,s)=>'<div class="opk"><span>'+l+'</span><b'+(s?' style="color:'+s+'"':'')+'>'+v+'</b></div>';
  return '<div class="opcard"><h4>'+o+'</h4><div class="opgrid">'+t('Unidades',fmt(S.units))+t('HH operativas',fmt1(S.hh))+t('Productividad (und/HH)',fmt1(S.prod),col)+t('% de meta',fmt1(S.prod/mo*100)+'%',col)+t('Usuarios activos',fmt(S.pickers))+t('Sesiones',fmt(S.tasks))+t('Prod. efectiva',fmt1(S.prodEff))+t('Utilización',fmt1(S.utilization)+'%')+'</div></div>';}).join('');
 const row=(n,a)=>{const u=new Set(a.map(r=>r.u)),d=new Set(a.map(r=>r.d)),un=a.reduce((s,r)=>s+(Number(r.n)||0),0);
  return '<tr><td class="name"><b>'+n+'</b></td><td class="num">'+fmt(ln(a))+'</td><td class="num">'+fmt(Math.round(un))+'</td><td class="num">'+u.size+'</td><td class="num">'+d.size+'</td><td class="num">'+fmt(Math.round(d.size&&u.size?un/(d.size*u.size):0))+'</td></tr>';};
 document.getElementById('opSumTable').innerHTML='<tr><th class="name">Transacción</th><th>Líneas</th><th>Unidades</th><th>Usuarios</th><th>Días</th><th>Und/usuario-día</th></tr>'+row('PICKING',g.PICKING)+row('PACKING',g.PACKING)+row('TOTAL',g.PICKING.concat(g.PACKING));
}
const _r=render;render=function(){_r.apply(this,arguments);renderOpSummary();};
const ekey=()=>{const ids=new Set(window.FILES.map(f=>f.id));return o=>o.src&&ids.has(o.src)?o.src:'legacy|'+(o.op||'PICKING');};
window.renderFiles=function(){const box=document.getElementById('filesTable');if(!box)return;
 const kOf0=ekey(),kOf=r=>r.isP?r.src:kOf0(r),st=new Map();
 HIST_DATA.concat(DAY_DATA).concat(window.PRESC||[]).forEach(r=>{const k=kOf(r);let o=st.get(k);if(!o){o={l:0,a:null,b:null};st.set(k,o);}o.l+=Number(r.r)||0;if(r.d){if(!o.a||r.d<o.a)o.a=r.d;if(!o.b||r.d>o.b)o.b=r.d;}});
 window.FILES=window.FILES.filter(f=>st.has(f.id));
 const q=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const rows=window.FILES.map(f=>({id:f.id,name:f.name,op:f.op,kind:f.kind,at:f.at,s:st.get(f.id)}));
 st.forEach((s,k)=>{if(k.startsWith('legacy|'))rows.push({id:k,name:'Datos anteriores (sin archivo asociado)',op:k.split('|')[1],kind:'—',at:'',s});});
 const html=rows.length?'<tr><th><input type="checkbox" class="fall" title="Marcar todos"></th><th class="name">Archivo</th><th>Operación</th><th>Tipo</th><th>Fechas</th><th>Líneas</th><th>Cargado</th><th></th></tr>'+rows.map(r=>'<tr><td><input type="checkbox" class="fchk" value="'+q(r.id)+'"></td><td class="name">'+q(r.name)+'</td><td>'+r.op+'</td><td>'+q(r.kind)+'</td><td>'+(r.s.a?labelDate(r.s.a)+' – '+labelDate(r.s.b):'-')+'</td><td class="num">'+Number(r.s.l).toLocaleString('es-PE')+'</td><td>'+(r.at?new Date(r.at).toLocaleString('es-PE'):'-')+'</td><td><button class="mini-btn" data-del="'+q(r.id)+'">Eliminar</button></td></tr>').join(''):'<tr><td>No hay archivos cargados.</td></tr>';
 ['filesTable','filesTable2'].forEach(i=>{const e=document.getElementById(i);if(e)e.innerHTML=html;});const c=document.getElementById('filesCount');if(c)c.textContent=rows.length?rows.length+' archivo(s) cargado(s)':'No hay archivos cargados.';};
async function delFiles(ids){if(!ids.length)return;if(!confirm('¿Eliminar '+ids.length+' archivo(s) cargado(s)? Se quitarán sus datos del dashboard.'))return;if(!window.requestUploadAccess())return;
 const S=new Set(ids),kOf=ekey(),keep=r=>!S.has(kOf(r)),ids2=new Set(window.FILES.map(f=>f.id)),mk=m=>!S.has(m.src&&ids2.has(m.src)?m.src:'legacy|'+(m.op||'PICKING'));
 HIST_DATA=HIST_DATA.filter(keep);DAY_DATA=DAY_DATA.filter(keep);HIST_DETAILS=HIST_DETAILS.filter(keep);DAY_DETAILS=DAY_DETAILS.filter(keep);HIST_META=HIST_META.filter(mk);DAY_META=DAY_META.filter(mk);window.PRESC=(window.PRESC||[]).filter(r=>!S.has(r.src));window.renderPresc&&window.renderPresc();
 rebuildCombinedData({resetRange:true,preserveFilters:false});window.renderFiles();window.__toast('Archivos eliminados.');await save();}
document.getElementById('filesTable').addEventListener('click',e=>{const b=e.target.closest('button[data-del]');if(b)delFiles([b.dataset.del]);});
document.getElementById('filesDelBtn').onclick=()=>{const ids=[...document.querySelectorAll('#filesTable .fchk:checked')].map(c=>c.value);if(!ids.length){window.__toast('Marca al menos un archivo.');return;}delFiles(ids);};
document.getElementById('filesTable2').addEventListener('click',e=>{const b=e.target.closest('button[data-del]');if(b)delFiles([b.dataset.del]);});
['filesTable','filesTable2'].forEach(id=>document.getElementById(id).addEventListener('change',e=>{if(e.target.classList.contains('fall'))document.querySelectorAll('#'+id+' .fchk').forEach(c=>c.checked=e.target.checked);}));
document.getElementById('filesDelBtn2').onclick=()=>{const ids=[...document.querySelectorAll('#filesTable2 .fchk:checked')].map(c=>c.value);if(!ids.length){window.__toast('Marca al menos un archivo.');return;}delFiles(ids);};
document.getElementById('filesReloadBtn').onclick=async()=>{window.__toast('Leyendo la lista desde la nube…');try{if(window.__cloudReload)await window.__cloudReload();}catch(e){window.__toast('❌ '+e.message);}window.renderFiles();};
let filesOpened=false;document.querySelector('.viewtab[data-view=archivos]').addEventListener('click',()=>{window.renderFiles();if(!filesOpened){filesOpened=true;document.getElementById('filesReloadBtn').click();}});
document.getElementById('anotherBtn').addEventListener('click',()=>setTimeout(window.renderFiles,50));
/* =====================================================================
   WMS EN LÍNEA: lee la carpeta data/ que deja el conector (wms_sync.py) y se actualiza sola cada 5 min.
   No usa contraseñas ni guarda nada en la nube: cada persona que abre la página recibe lo último del WMS.
   ===================================================================== */
let wmsBusy=false;
const hhmm=iso=>{const d=new Date(iso);return isNaN(d)?'':d.toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});};
function wmsBanner(state,idx){const b=document.getElementById('wmsBanner');if(!b)return;
 if(state==='off'){b.textContent='';return;}
 const last=idx.revisado&&idx.revisado>(idx.generado||'')?idx.revisado:idx.generado,min=last?(Date.now()-new Date(last))/60000:0,h=new Date().getHours();
 const viejo=min>90&&h>=8&&h<=20;
 b.style.color=viejo?'#d68b18':'#168a50';b.style.cursor='pointer';b.title='Clic para actualizar ahora';
 b.textContent=(viejo?'🟠 WMS sin actualizar desde ':'🟢 WMS en línea · actualizado ')+hhmm(last);}
async function wmsIngest(file,op,a){
 // el conector regenera el día completo: se reemplaza la carga anterior del MISMO archivo WMS
 const prev=window.FILES.filter(f=>f.kind==='WMS en línea'&&f.name===a.nombre).map(f=>f.id);
 if(prev.length){DAY_DATA=DAY_DATA.filter(r=>!prev.includes(r.src));DAY_DETAILS=DAY_DETAILS.filter(r=>!prev.includes(r.src));DAY_META=DAY_META.filter(m=>!prev.includes(m.src));window.FILES=window.FILES.filter(f=>!prev.includes(f.id));}
 const info=await window.__packingCSV(file,{silent:true});
 const pd=DAY_DATA.length,pt=DAY_DETAILS.length,pm=DAY_META.length;
 await _ud(file);
 if(DAY_DATA.length===pd&&DAY_META.length===pm)return false;
 const sid=newSrc(a.nombre,op,'WMS en línea');window.FILES[window.FILES.length-1].hash=a.hash;
 const nr=DAY_DATA.slice(pd);tag(DAY_DATA,pd,op,sid);tag(DAY_DETAILS,pt,op,sid);
 const meta=DAY_META.length>pm?DAY_META[DAY_META.length-1]:null;if(meta){meta.op=op;meta.src=sid;}
 if(nr.length){const r=mergeD(nr,op);const kk=d=>d.d+'|'+d.u;DAY_DETAILS=DAY_DETAILS.filter(d=>!(opOf(d)===op&&d.src!==sid&&r.repl.has(kk(d))));info.details.forEach(d=>{if(r.drop.has(kk(d)))return;d.op=op;d.src=sid;DAY_DETAILS.push(d);});}
 return true;}
window.wmsSync=async function(manual){
 if(wmsBusy)return;wmsBusy=true;
 try{
  const bases=[];if(/\.github\.io$/.test(location.hostname)){const u=location.hostname.split('.')[0],r=location.pathname.split('/')[1];if(u&&r)bases.push('https://raw.githubusercontent.com/'+u+'/'+r+'/main/data/');}bases.push('data/');
  let idx=null,base='';for(const b of bases){try{const r=await fetch(b+'index.json?t='+Date.now(),{cache:'no-store'});if(r.ok){idx=await r.json();base=b;break;}}catch(e){}}
  if(!idx){wmsBanner('off');if(manual)window.__toast('WMS en línea: todavía no hay datos del conector (carpeta data/).');return;}
  let n=0;
  for(const a of (idx.archivos||[])){
   if(window.FILES.some(f=>f.kind==='WMS en línea'&&f.name===a.nombre&&f.hash===a.hash))continue;
   const r=await fetch(base+encodeURIComponent(a.nombre)+'?h='+a.hash,{cache:'no-store'});if(!r.ok)continue;
   const file=new File([await r.text()],a.nombre,{type:'text/csv'});
   if(await wmsIngest(file,a.op||'PACKING',a))n++;}
  if(n){rebuildCombinedData({resetRange:!HIST_DATA.length,preserveFilters:true});render();window.renderFiles&&window.renderFiles();}
  wmsBanner('on',idx);if(manual)window.__toast('WMS en línea: '+(n?n+' archivo(s) actualizado(s).':'sin cambios.'));
 }catch(e){window.__toast('WMS en línea: '+e.message);}finally{wmsBusy=false;}};
document.getElementById('wmsBanner').addEventListener('click',()=>window.wmsSync(true));
setTimeout(()=>window.wmsSync(),1200);setInterval(()=>window.wmsSync(),5*60*1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)window.wmsSync();});
document.getElementById('opTabs').addEventListener('click',e=>{const b=e.target.closest('button[data-op]');if(!b)return;
 window.OPSEL=b.dataset.op;{const m=document.getElementById('meta');if(m)m.value=metaBase();const hm=document.getElementById('headerMeta');if(hm)hm.parentElement.innerHTML=(window.OPSEL==='PACKING')?'Meta packing: <b id="headerMeta">'+fmt1(Number(SETTINGS.metaPack)||500)+' und/HH por persona · '+fmt1(Math.round((Number(SETTINGS.metaPack)||500)*7.5))+' por día</b>':'Meta vigente: <b id="headerMeta">'+fmt1(SETTINGS.meta)+' und/HH · PP '+fmt1(SETTINGS.metaPP)+' cajas/HH</b>';}
document.querySelectorAll('#opTabs button').forEach(x=>x.classList.toggle('active',x===b));render();});
})();
