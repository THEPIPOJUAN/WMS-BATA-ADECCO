/* ===== Nube (Supabase) =====
   Sesión, guardado/actualización de datos, compresión del guardado y enlace con los reportes. Usa config.js. */
(function(){
const CLOUD_CFG=window.PICKING_CLOUD_CONFIG||{url:'',anonKey:''};
/* ---- Utilidades de guardado: compresión y detalles en columnas (deben existir antes de leer la nube) ---- */
// ---- compresión del guardado (evita límites de tiempo/tamaño) ----
window.__pack=async obj=>{try{if(typeof CompressionStream==='undefined')return null;
 const cs=new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream('gzip'));
 const u=new Uint8Array(await new Response(cs).arrayBuffer());let bin='';for(let i=0;i<u.length;i+=0x8000)bin+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
 return {format:'gz1',savedAt:new Date().toISOString(),data:btoa(bin)};}catch(e){return null;}};
window.__unpack=async p=>{if(p&&p.format==='gz1'&&p.data){const bin=atob(p.data),u=Uint8Array.from(bin,c=>c.charCodeAt(0));
 const ds=new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));return JSON.parse(await new Response(ds).text());}return p;};
// ---- detalles en columnas (mucho más liviano al guardar) ----
window.__packDet=a=>{if(!a||!a.length)return a||[];const ks=[],seen=new Set();for(let i=0;i<a.length;i++)for(const k in a[i])if(!seen.has(k)){seen.add(k);ks.push(k);}
 return {_col:1,k:ks,c:ks.map(k=>a.map(o=>o[k]===undefined?null:o[k]))};};
window.__unpackDet=p=>{if(Array.isArray(p))return p;if(!p||!p._col)return [];const n=p.c.length?p.c[0].length:0,out=new Array(n);
 for(let i=0;i<n;i++){const o={};for(let j=0;j<p.k.length;j++){const v=p.c[j][i];if(v!==null)o[p.k[j]]=v;}out[i]=o;}return out;};
let sb=null,currentUser=null,currentProfile=null;
const $x=id=>document.getElementById(id);
const cfgReady=()=>!!(CLOUD_CFG.url&&CLOUD_CFG.anonKey&&window.supabase);

function setCloud(t,k='off'){
  if($x('cloudDot'))$x('cloudDot').className='cloud-dot '+k;
  if($x('cloudStatusText'))$x('cloudStatusText').textContent=t;
}
function notice(t,s=true){
  if(window.__toast&&t)window.__toast(t);
  const n=$x('cloudNotice');
  if(n){n.textContent=t;n.classList.toggle('show',s)}
}
function showAuth(){
  const b=$x('authBack');
  if(b)b.classList.add('show');
  setTimeout(()=>{$x('authEmail')?.focus()},50);
}
function hideAuth(){
  const b=$x('authBack');
  if(b)b.classList.remove('show');
}
function lockDashboard(){
  document.body.classList.add('dashboard-locked');
  showAuth();
}
function unlockDashboard(){
  document.body.classList.remove('dashboard-locked');
  hideAuth();
}
async function loadProfile(){
  if(!sb||!currentUser)return false;
  const q=await sb.from('user_profiles')
    .select('id,full_name,role,active')
    .eq('id',currentUser.id)
    .maybeSingle();
  if(q.error){
    notice('No se pudo comprobar el perfil: '+q.error.message,true);
    return false;
  }
  if(!q.data){
    notice('Tu usuario no tiene un perfil autorizado en el Dashboard.',true);
    return false;
  }
  if(q.data.active!==true){
    notice('Tu usuario está inactivo. Solicita al administrador que lo active.',true);
    return false;
  }
  currentProfile=q.data;
  return true;
}
async function init(){
  // La vista ejecutiva se muestra inmediatamente; no esperar a la conexión de nube.
  document.body.classList.remove('dashboard-locked');
  hideAuth();
  const uploadPanel=$x('upload'), dashboardPanel=$x('dash');
  if(uploadPanel){uploadPanel.classList.remove('upload-open');uploadPanel.style.display='none';}
  if(dashboardPanel)dashboardPanel.style.display='block';
  if(typeof render==='function')render();
  // PUBLIC MODE: no login, no password, no user profile check.
  if(!cfgReady()){
    setCloud('Nube no configurada');
    notice('Falta configurar Supabase en config.js.',true);
    return;
  }
  sb=window.supabase.createClient(CLOUD_CFG.url,CLOUD_CFG.anonKey);
  currentUser=null;
  currentProfile=null;
  refreshAuth();
  await checkRemote();
  setInterval(checkRemote,30000);
  await applyCloudIfAvailable();
  // El panel de carga permanece oculto hasta pulsar Gestionar datos.
}

function refreshAuth(){
  const b=$x('cloudLoginBtn'),s=$x('cloudSaveBtn'),r=$x('cloudRoleText');
  if(b)b.style.display='none';
  if(s){s.disabled=true;s.style.display='none';}
  if(r)r.textContent='';
  setUploadGate(uploadAuthorized);
  setCloud('Dashboard público · datos online', 'ok');
}

async function login(){
  if(!sb){showAuth();return}
  const email=$x('authEmail').value.trim();
  const password=$x('authPassword').value;
  if(!email||!password){
    $x('authMsg').textContent='Escribe usuario/correo y contraseña.';
    return;
  }
  $x('authMsg').textContent='Validando…';
  const q=await sb.auth.signInWithPassword({email,password});
  if(q.error){
    $x('authMsg').textContent='No se pudo ingresar: '+q.error.message;
    return;
  }
  currentUser=q.data.user;
  const ok=await loadProfile();
  if(!ok){
    await sb.auth.signOut();
    currentUser=null;
    currentProfile=null;
    refreshAuth();
    $x('authMsg').textContent='Usuario sin autorización para este Dashboard.';
    return;
  }
  $x('authMsg').textContent='';
  unlockDashboard();
  refreshAuth();
  await checkRemote();
}
const UPLOAD_PASSWORD='BATA2026';
let uploadAuthorized=false;
function setUploadGate(ok){
  uploadAuthorized=!!ok;
  const g=$x('uploadGate');
  if(g){g.classList.toggle('ok',uploadAuthorized);g.querySelector('span').textContent=uploadAuthorized?'✅ Carga autorizada. Los archivos se guardarán en la nube al terminar de procesarse.':'🔒 La carga y guardado de datos están protegidos. Ingresa la contraseña de carga para continuar.';}
  const b=$x('authorizeUploadBtn'); if(b)b.textContent=uploadAuthorized?'🔓 Carga autorizada':'🔐 Autorizar carga';
}
function requestUploadAccess(){
  if(uploadAuthorized)return true;
  const v=window.prompt('Contraseña para subir y guardar datos:');
  if(v===UPLOAD_PASSWORD){setUploadGate(true);notice('Carga autorizada.',true);return true;}
  if(v!==null)alert('Contraseña incorrecta.'); return false;
}
function requireEditor(){return requestUploadAccess();}
window.requestUploadAccess=requestUploadAccess;
window.saveCloud=saveCloud;
function snapshot(noDet){return {
  methodologyVersion:typeof METHODOLOGY_VERSION!=='undefined'?METHODOLOGY_VERSION:'V2',savedAt:new Date().toISOString(),
  histData:HIST_DATA||[],dayData:DAY_DATA||[],histMeta:HIST_META||[],dayMeta:DAY_META||[],histDetails:noDet?[]:window.__packDet(HIST_DETAILS||[]),dayDetails:noDet?[]:window.__packDet(DAY_DETAILS||[]),
  atTasks:typeof AT_TASKS!=='undefined'?AT_TASKS:[],atRoster:typeof AT_ROSTER!=='undefined'?AT_ROSTER:[],atSched:typeof AT_SCHED!=='undefined'?AT_SCHED:{},settings:typeof SETTINGS!=='undefined'?SETTINGS:{},rutas:window.RUTAS||[],usuarios:window.USUARIOS||[],asistencia:window.ASISTENCIA||{},files:window.FILES||[],maestro:window.MAESTRO||[],presc:window.PRESC||[]
};}
async function saveCloud(){
  if(!sb){const why=!(CLOUD_CFG.url&&CLOUD_CFG.anonKey)?'No se encontró config.js: en GitHub debe llamarse exactamente config.js y estar en la misma carpeta que el HTML.':'No cargó la librería de Supabase (revisa internet o si algo bloquea cdn.jsdelivr.net).';notice('❌ No se pudo guardar: '+why,true);return false;}
  if(!requestUploadAccess())return false;
  notice('Guardando datos en la nube…',true);
  try{
    if(!(window.RUTAS||[]).length||!(window.MAESTRO||[]).length||!(window.PRESC||[]).length){
      const g=await sb.from('dashboard_snapshots').select('payload').eq('id',1).maybeSingle();
      if(g&&g.data){const gp=await window.__unpack(g.data.payload||{});
        if(!(window.RUTAS||[]).length&&Array.isArray(gp.rutas)&&gp.rutas.length){window.RUTAS=gp.rutas;window.renderRutas&&window.renderRutas();}
        if(!(window.MAESTRO||[]).length&&Array.isArray(gp.maestro)&&gp.maestro.length){window.MAESTRO=gp.maestro;window.renderMaestro&&window.renderMaestro();}
        if(!(window.PRESC||[]).length&&Array.isArray(gp.presc)&&gp.presc.length){window.PRESC=gp.presc;window.renderPresc&&window.renderPresc();}}
    }
  }catch(e){}
  let last=null;
  for(const [mode,noDet] of [['gz',false],['gz',true],['raw',true]]){
    try{
      const snap=snapshot(noDet);
      const payload=mode==='gz'?await window.__pack(snap):snap;
      if(!payload)continue;
      const mb=((payload.data||JSON.stringify(payload)).length/1048576).toFixed(1),t0=Date.now();
      const q=await sb.rpc('save_dashboard_snapshot',{p_password:UPLOAD_PASSWORD,p_payload:payload});
      if(q.error)throw q.error;
      const t=q.data?.updated_at||new Date().toISOString();localStorage.setItem('PICKING_LAST_CLOUD_VERSION',t);updateCloudButton(false);
      const info=' ('+mb+' MB · '+((Date.now()-t0)/1000).toFixed(1)+' s)';
      notice(noDet?'⚠️ Guardado SIN el detalle por hora (era muy pesado): el clic en las cantidades solo funcionará en la PC donde subiste el archivo.'+info:'✅ Datos guardados en la nube. Al abrir en otra PC se cargarán solos.'+info,true);return true;
    }catch(e){last=e;}
  }
  notice('❌ No se pudo guardar: '+((last&&((last.code?last.code+': ':'')+(last.message||last.details||last.hint)))||String(last)),true);return false;
}

async function checkRemote(){
  if(!sb)return;
  const q=await sb.from('dashboard_snapshots')
    .select('id,updated_at')
    .eq('id',1)
    .maybeSingle();
  if(q.error){
    setCloud('Dashboard público · datos locales','warn');
    return;
  }
  if(!q.data){updateCloudButton(false);return}
  const local=localStorage.getItem('PICKING_LAST_CLOUD_VERSION')||'';
  const newer=!local||new Date(q.data.updated_at)>new Date(local);
  updateCloudButton(newer);
  if(newer){
    if($x('cloudVersionText'))$x('cloudVersionText').textContent='· Hay una actualización disponible';
    notice('Hay nuevos datos publicados. No se aplicarán automáticamente. Pulsa “Actualizar datos” cuando quieras.',true);
  }else if($x('cloudVersionText')){
    $x('cloudVersionText').textContent='· Datos actualizados';
  }
}
window.__cloudReload=()=>applyCloudIfAvailable();
async function applyCloudIfAvailable(){
  if(!sb)return;
  const q=await sb.from('dashboard_snapshots')
    .select('payload,updated_at')
    .eq('id',1)
    .maybeSingle();
  if(q.error){notice('❌ No se pudo leer la nube: '+q.error.message,true);return;}
  if(!q.data)return;
  const p=await window.__unpack(q.data.payload||{});
  if(Array.isArray(p.histData))HIST_DATA=p.histData;
  if(Array.isArray(p.dayData))DAY_DATA=p.dayData;
  if(Array.isArray(p.histMeta))HIST_META=p.histMeta;
  if(Array.isArray(p.dayMeta))DAY_META=p.dayMeta;
  if(p.histDetails)HIST_DETAILS=window.__unpackDet(p.histDetails);
  if(p.dayDetails)DAY_DETAILS=window.__unpackDet(p.dayDetails);
  if(Array.isArray(p.atTasks)&&typeof AT_TASKS!=='undefined')AT_TASKS=p.atTasks;
  if(Array.isArray(p.atRoster)&&typeof AT_ROSTER!=='undefined')AT_ROSTER=p.atRoster;
  if(p.atSched&&typeof AT_SCHED!=='undefined')AT_SCHED=p.atSched;
  if(p.settings&&typeof SETTINGS!=='undefined')Object.assign(SETTINGS,p.settings);
  if(Array.isArray(p.rutas)){window.RUTAS=p.rutas;window.renderRutas&&window.renderRutas();}
  if(Array.isArray(p.files))window.FILES=p.files;
  if(Array.isArray(p.maestro)){window.MAESTRO=p.maestro;window.renderMaestro&&window.renderMaestro();}
  if(Array.isArray(p.usuarios)){window.USUARIOS=p.usuarios;window.renderUsuarios&&window.renderUsuarios();}
  if(p.asistencia&&typeof p.asistencia==='object'){window.ASISTENCIA=p.asistencia;}
  if(Array.isArray(p.presc)){window.PRESC=p.presc;window.renderPresc&&window.renderPresc();}
  setTimeout(()=>window.wmsSync&&window.wmsSync(),300);
  window.renderFiles&&window.renderFiles();
  rebuildCombinedData({resetRange:false,preserveFilters:true});
  localStorage.setItem('PICKING_LAST_CLOUD_VERSION',q.data.updated_at);
  updateCloudButton(false);
}

function updateCloudButton(n){
  const b=$x('cloudUpdateBtn');
  if(!b)return;
  b.disabled=!n;
  b.className='cloudbtn '+(n?'update':'');
  b.textContent=n?'🟢 Actualizar datos':'🔴 Datos actualizados';
}
async function applyCloud(){
  if(!sb)return;
  const q=await sb.from('dashboard_snapshots')
    .select('payload,updated_at')
    .eq('id',1)
    .single();
  if(q.error){
    notice('No se pudo actualizar: '+q.error.message,true);
    return;
  }
  const p=await window.__unpack(q.data.payload||{});
  if(Array.isArray(p.histData))HIST_DATA=p.histData;
  if(Array.isArray(p.dayData))DAY_DATA=p.dayData;
  if(Array.isArray(p.histMeta))HIST_META=p.histMeta;
  if(Array.isArray(p.dayMeta))DAY_META=p.dayMeta;
  if(p.histDetails)HIST_DETAILS=window.__unpackDet(p.histDetails);
  if(p.dayDetails)DAY_DETAILS=window.__unpackDet(p.dayDetails);
  if(Array.isArray(p.atTasks)&&typeof AT_TASKS!=='undefined')AT_TASKS=p.atTasks;
  if(Array.isArray(p.atRoster)&&typeof AT_ROSTER!=='undefined')AT_ROSTER=p.atRoster;
  if(p.atSched&&typeof AT_SCHED!=='undefined')AT_SCHED=p.atSched;
  if(p.settings&&typeof SETTINGS!=='undefined')Object.assign(SETTINGS,p.settings);
  if(Array.isArray(p.rutas)){window.RUTAS=p.rutas;window.renderRutas&&window.renderRutas();}
  if(Array.isArray(p.files))window.FILES=p.files;
  if(Array.isArray(p.maestro)){window.MAESTRO=p.maestro;window.renderMaestro&&window.renderMaestro();}
  if(Array.isArray(p.usuarios)){window.USUARIOS=p.usuarios;window.renderUsuarios&&window.renderUsuarios();}
  if(p.asistencia&&typeof p.asistencia==='object'){window.ASISTENCIA=p.asistencia;}
  if(Array.isArray(p.presc)){window.PRESC=p.presc;window.renderPresc&&window.renderPresc();}
  setTimeout(()=>window.wmsSync&&window.wmsSync(),300);
  window.renderFiles&&window.renderFiles();
  rebuildCombinedData({resetRange:false,preserveFilters:true});
  localStorage.setItem('PICKING_LAST_CLOUD_VERSION',q.data.updated_at);
  updateCloudButton(false);
  notice('Datos actualizados manualmente. No se actualizarán solos.',true);
}
function tableRows(id){
  const t=$x(id);
  return t?[...t.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(c=>c.innerText.trim())):[];
}
function exportExcel(rows,name){
  if(!rows.length)return;
  if(!window.XLSX){alert('Motor Excel no disponible.');return}
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb,ws,'Reporte');
  XLSX.writeFile(wb,name+'.xlsx');
}
function exportPdf(id,title){
  const t=$x(id);if(!t)return;
  const w=window.open('','_blank');if(!w)return;
  w.document.write('<html><head><title>'+title+'</title><style>body{font-family:Arial;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:5px}th{background:#eee}@media print{button{display:none}}</style></head><body><h2>'+title+'</h2>'+t.outerHTML+'<script>window.onload=()=>window.print()<\\/script></body></html>');
  w.document.close();
}
async function exportChoice(id,name){
  const t=$x(id);
  if(!t||!tableRows(id).length){alert('No hay datos para exportar.');return}
  const f=await WMSX.exportMenu({title:'Descargar reporte'});
  if(!f)return;
  let sub='';try{sub=(typeof filteredPeriodText==='function'?filteredPeriodText(filtered()):'')||''}catch(e){}
  try{
    await WMSX.exportTable(f,t,{title:name.replace(/_/g,' '),file:name,subtitle:String(sub).replace(/\s+/g,' ').slice(0,160),
      chips:[['Transacción',window.OPSEL||'PICKING']],legend:/Matriz|Usuario_Dia|Semana_Usuario/i.test(name)});
  }catch(e){console.error(e);if(f==='xlsx')exportExcel(tableRows(id),name);else alert('No se pudo generar el PDF: '+e.message);}
}
// PUBLIC MODE: viewing is open; upload/save is protected by the upload password.
$x('authorizeUploadBtn')?.addEventListener('click',requestUploadAccess);
// El acceso se solicita en el manejador principal de Gestionar datos, antes de abrir el panel.
['folderInput','historyFilesInput','processedInput','dayInput','atTasksInput','atRosterInput'].forEach(id=>$x(id)?.addEventListener('click',e=>{if(!requestUploadAccess()){e.preventDefault();e.stopImmediatePropagation();}},true));
[['atDownloadBtn','atTasksTable','Asignacion_Tareas'],['atCumplDownloadBtn','atCumplTable','Cumplimiento_Capacidad_Usuario'],['atLeftoverDownloadBtn','atLeftoverTable','Tareas_Sin_Asignar'],['exportBtn','atCumplTable','Ranking_Picking_WMS'],['exportMgmtBtn','mgmtTable','Evolucion_Gerencia'],['exportSupervisorBtn','supHourTable','Avance_Horario_Picking'],['exportHeatmapBtn','supHeatTable','Matriz_Supervision'],['exportUserDayBtn','userDayTable','Picking_Usuario_Dia'],['exportJefWeekBtn','jefWeekTable','Jefatura_Semana_Usuario'],['downloadHeatDetailBtn','heatDetailTable','Detalle_Hora']].forEach(([id,table,name])=>$x(id)?.addEventListener('click',e=>{
  e.preventDefault();e.stopImmediatePropagation();exportChoice(table,name)
},true));
window.supDayLabel=d=>{
  const days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const dt=new Date(d+'T12:00:00');
  return `Sem ${typeof isoWeekNumber==='function'?isoWeekNumber(d):''} - ${days[dt.getDay()]}`;
};
function fill(id,vals,label){
  const e=$x(id);if(!e)return;
  const cur=e.value;
  e.innerHTML='<option value="">'+label+'</option>'+vals.sort((a,b)=>String(a).localeCompare(String(b),'es')).map(v=>`<option>${String(v).replace(/</g,'&lt;')}</option>`).join('');
  if(vals.includes(cur))e.value=cur;
}

// PUBLIC MODE: password recovery/change-password functions removed.

// ===== WMSX: reportes ejecutivos Picking/Packing =====
try{
  WMSX.configure({
    getRows:()=>DATA,
    getModo:()=>window.OPSEL,
    mapRow:r=>{
      const op=r.op||'PICKING', pp=r.c==='PP';
      const cat=r.k||(r.c==='CALZADO'?'CALZ':r.c==='ACCESORIO'?'ACC':r.c);
      return {fecha:r.d,usuario:r.u,categoria:cat,transaccion:op,
        bloque:(pp?'PRE ':'SOLI ')+'PACK',
        unidades:Number(r.n)||0,cajas:pp?(Number(r.raw)||0):0};
    },
    bloques:{
      PACKING:[{id:'SOLI PACK',conCajas:false},{id:'PRE PACK',conCajas:true}],
      PICKING:[{id:'SOLI PACK',conCajas:false},{id:'PRE PACK',conCajas:true}]
    },
    metaDia:{PACKING:3750,PICKING:1200},   // meta individual por día (7.5 h × 500 und/h packing · 7.5 h × 160 und/h picking)
    factorDia:{0:0,6:0.5}                  // sábado = media jornada (1875 / 600) · domingo = descanso
  });
  const tb=document.querySelector('.toolbar');
  if(tb)WMSX.mountReportButton(tb,{className:'btn',html:'📊 Generar reporte',before:'#anotherBtn'});
}catch(e){console.error('WMSX',e)}
init();
})();
