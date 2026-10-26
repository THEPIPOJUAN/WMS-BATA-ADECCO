/* ===== Usuarios y asistencia =====
   Lista de usuarios, meta individual y asistencia semanal. */
(function(){
const $$=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nrm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[_\-]+/g,' ').trim().toUpperCase();
const ukey=u=>String(u||'').trim().toLowerCase();
window.USUARIOS=window.USUARIOS||[];window.ASISTENCIA=window.ASISTENCIA||{};
// ---- Enlaces listos para medir producción contra la meta individual ----
window.metaIndividual=u=>{const r=window.USUARIOS.find(x=>ukey(x.usuario)===ukey(u));return r&&Number(r.prom)>0?Number(r.prom):null;};
window.usuarioInfo=u=>window.USUARIOS.find(x=>ukey(x.usuario)===ukey(u))||null;
window.asistenciaDe=(sem,u)=>((window.ASISTENCIA[sem]||{})[ukey(u)])||null;   // sem = 'AAAA-Wss'
const fullName=r=>((r.nombres||'')+' '+(r.apellidos||'')).trim();
window.renderUsuarios=function(){
 const t=$$('usrTable');if(!t)return;const q=nrm($$('usrSearch').value),all=window.USUARIOS.slice().sort((a,b)=>String(a.area).localeCompare(String(b.area))||String(a.apellidos).localeCompare(String(b.apellidos)));
 const L=all.filter(r=>!q||nrm([r.usuario,r.nombres,r.apellidos,r.area].join(' ')).includes(q));
 $$('usrStatus').textContent=all.length?'Usuarios: '+all.length.toLocaleString('es-PE')+(L.length!==all.length?' · mostrando '+L.length:''):'Sin usuarios cargados.';
 t.innerHTML='<tr><th class="name">USUARIO</th><th>NOMBRES</th><th>APELLIDOS</th><th>ÁREA</th><th>PROMEDIO / HORA</th><th></th></tr>'+L.map(r=>'<tr><td class="name"><b>'+esc(r.usuario)+'</b></td><td>'+esc(r.nombres)+'</td><td>'+esc(r.apellidos)+'</td><td>'+esc(r.area)+'</td><td class="num">'+(Number(r.prom)>0?Number(r.prom).toLocaleString('es-PE'):'-')+'</td><td><button class="btn pw-btn" data-e="'+esc(r.usuario)+'" type="button">Editar</button> <button class="btn pw-btn" data-d="'+esc(r.usuario)+'" type="button">Borrar</button></td></tr>').join('');};
const persist=async()=>{window.renderUsuarios();if(window.saveCloud)await window.saveCloud();};
// ---- Cargar Excel / CSV ----
async function leer(file){
 if(/\.(csv|txt)$/i.test(file.name)){const b=new Uint8Array(await file.arrayBuffer());let tx=new TextDecoder('utf-8').decode(b);
  if(tx.includes('\uFFFD')){const o=[];let i=0;while(i<b.length){const c=b[i];if(c<128){o.push(c);i++;}else if(c>=194&&c<=223&&(b[i+1]&192)===128){o.push(((c&31)<<6)|(b[i+1]&63));i+=2;}else if(c>=224&&c<=239&&(b[i+1]&192)===128&&(b[i+2]&192)===128){o.push(((c&15)<<12)|((b[i+1]&63)<<6)|(b[i+2]&63));i+=3;}else{o.push(c);i++;}}tx=String.fromCharCode.apply(null,o);}
  return XLSX.read(tx.replace(/^\uFEFF/,''),{type:'string'});}
 return XLSX.read(await file.arrayBuffer(),{type:'array'});}
const MAP={nombres:['NOMBRES','NOMBRE'],apellidos:['APELLIDOS','APELLIDO'],usuario:['USUARIO','USER','USUARIO WMS'],area:['AREA'],prom:['PROMEDIO HORA','PROMEDIO POR HORA','PROMEDIO','PROM HORA','PROM H','UND H','UND HH','META']};
async function cargar(e){const f=e.target.files[0];e.target.value='';if(!f)return;
 try{const wb=await leer(f);let hit=null;
  for(const sn of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null});
   for(let i=0;i<Math.min(rows.length,10);i++){const H=(rows[i]||[]).map(nrm);if(MAP.usuario.some(k=>H.includes(k))){hit={rows,hi:i,H};break;}}if(hit)break;}
  if(!hit)throw new Error('No encontré la columna USUARIO. Las columnas deben ser: NOMBRES, APELLIDOS, USUARIO, AREA, PROMEDIO_HORA.');
  const ix={};Object.keys(MAP).forEach(k=>{ix[k]=hit.H.findIndex(h=>MAP[k].includes(h));});
  if(!window.requestUploadAccess())return;
  const m=new Map(window.USUARIOS.map(r=>[ukey(r.usuario),r]));let nu=0,ac=0,om=0;
  hit.rows.slice(hit.hi+1).forEach(r=>{const g=k=>ix[k]>=0&&r[ix[k]]!=null?String(r[ix[k]]).trim():'',u=g('usuario');if(!u){om++;return;}
   const p=Number(String(g('prom')).replace(',','.'))||0,o={usuario:u,nombres:g('nombres'),apellidos:g('apellidos'),area:g('area'),prom:p},k=ukey(u);if(m.has(k))ac++;else nu++;m.set(k,o);});
  window.USUARIOS=[...m.values()];window.__toast&&window.__toast('Usuarios: '+nu+' nuevos · '+ac+' actualizados'+(om?' · '+om+' filas sin usuario omitidas':'')+'.');await persist();
 }catch(err){window.__toast&&window.__toast('❌ '+err.message);}}
$$('usrInput').addEventListener('change',cargar);$$('usrSearch').addEventListener('input',window.renderUsuarios);
// ---- Agregar / editar / borrar ----
const form=$$('usrForm');let editKey=null;
$$('usrAddBtn').onclick=()=>{editKey=null;['uNom','uApe','uUsr','uArea','uProm'].forEach(i=>$$(i).value='');form.style.display='grid';$$('uNom').focus();};
$$('usrCancelBtn').onclick=()=>{form.style.display='none';};
$$('usrSaveBtn').onclick=async()=>{const u=$$('uUsr').value.trim();if(!u){window.__toast&&window.__toast('Escribe el usuario.');return;}if(!window.requestUploadAccess())return;
 const o={usuario:u,nombres:$$('uNom').value.trim(),apellidos:$$('uApe').value.trim(),area:$$('uArea').value.trim(),prom:Number($$('uProm').value)||0};
 const k=editKey||ukey(u),i=window.USUARIOS.findIndex(x=>ukey(x.usuario)===k);if(i>=0)window.USUARIOS[i]=o;else window.USUARIOS.push(o);
 if(editKey&&editKey!==ukey(u)&&window.USUARIOS.filter(x=>ukey(x.usuario)===ukey(u)).length>1)window.USUARIOS=window.USUARIOS.filter((x,j)=>!(ukey(x.usuario)===ukey(u)&&j!==i));
 form.style.display='none';await persist();};
$$('usrTable').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.e){const r=window.USUARIOS.find(x=>ukey(x.usuario)===ukey(b.dataset.e));if(!r)return;editKey=ukey(r.usuario);$$('uNom').value=r.nombres||'';$$('uApe').value=r.apellidos||'';$$('uUsr').value=r.usuario;$$('uArea').value=r.area||'';$$('uProm').value=r.prom||'';form.style.display='grid';}
 if(b.dataset.d){if(!confirm('¿Borrar al usuario '+b.dataset.d+'?')||!window.requestUploadAccess())return;window.USUARIOS=window.USUARIOS.filter(x=>ukey(x.usuario)!==ukey(b.dataset.d));await persist();}});
$$('usrDownBtn').onclick=()=>{const rows=[['NOMBRES','APELLIDOS','USUARIO','AREA','PROMEDIO_HORA']].concat(window.USUARIOS.map(r=>[r.nombres,r.apellidos,r.usuario,r.area,r.prom||'']));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'USUARIOS');XLSX.writeFile(wb,'USUARIOS.xlsx');};
// ---- Asistencia semanal ----
function isoNow(){const d=new Date(),t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));const y=t.getUTCFullYear();return {y,w:Math.ceil(((t-Date.UTC(y,0,1))/864e5+1)/7)};}
function monday(y,w){const j=new Date(Date.UTC(y,0,4)),d=j.getUTCDay()||7;return new Date(j.getTime()+((w-1)*7-(d-1))*864e5);}
const DN=['Lun','Mar','Mié','Jue','Vie','Sáb'],fm=d=>String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0');
let unlocked=false;
const wkey=()=>$$('asisYear').value+'-W'+String($$('asisWeek').value).padStart(2,'0');
function estado(){const n=isoNow(),y=+$$('asisYear').value,w=+$$('asisWeek').value,a=y*100+w,b=n.y*100+n.w;return a<b?'past':a>b?'future':'now';}
function pintar(){
 const y=+$$('asisYear').value,w=+$$('asisWeek').value;if(!y||!w)return;const mo=monday(y,w),st=estado(),ro=st==='past'&&!unlocked,saved=window.ASISTENCIA[wkey()]||{};
 $$('asisRange').textContent='del '+fm(mo)+' al '+fm(new Date(mo.getTime()+5*864e5));
 $$('asisTag').textContent=st==='now'?'Semana actual · se puede llenar':st==='future'?'Semana futura · se puede llenar':(ro?'Semana anterior · solo lectura':'Semana anterior · edición habilitada');
 $$('asisUnlock').style.display=st==='past'&&ro?'':'none';$$('asisSave').style.display=ro?'none':'';$$('asisAllA').style.display=ro?'none':'';
 const us=window.USUARIOS.slice().sort((a,b)=>String(a.area).localeCompare(String(b.area))||String(a.apellidos).localeCompare(String(b.apellidos)));
 if(!us.length){$$('asisTable').innerHTML='<tr><td>Primero agrega usuarios en este módulo.</td></tr>';$$('asisSum').textContent='';return;}
 let cnt={A:0,T:0,F:0,P:0};
 const head='<tr><th class="l">USUARIO</th><th class="l">NOMBRE</th><th>ÁREA</th>'+DN.map((d,i)=>'<th>'+d+'<br>'+fm(new Date(mo.getTime()+i*864e5))+'</th>').join('')+'</tr>';
 const body=us.map(r=>{const rec=saved[ukey(r.usuario)]||{};return '<tr><td class="l"><b>'+esc(r.usuario)+'</b></td><td class="l">'+esc(fullName(r))+'</td><td>'+esc(r.area)+'</td>'+DN.map((d,i)=>{const v=rec['d'+i]||'';if(cnt[v]!=null)cnt[v]++;
  return ro?'<td class="'+(v?'as-'+v:'')+'"><b>'+(v||'—')+'</b></td>':'<td class="'+(v?'as-'+v:'')+'"><select data-u="'+esc(ukey(r.usuario))+'" data-d="d'+i+'"><option value=""></option>'+['A','T','F','P'].map(o=>'<option'+(o===v?' selected':'')+'>'+o+'</option>').join('')+'</select></td>';}).join('')+'</tr>';}).join('');
 $$('asisTable').innerHTML=head+body;
 $$('asisSum').textContent=Object.keys(saved).length?'Registrado: Asistió '+cnt.A+' · Tardanza '+cnt.T+' · Faltó '+cnt.F+' · Permiso '+cnt.P:(st==='past'?'Sin asistencia registrada para esta semana.':'Aún sin registrar.');}
function abrir(){const n=isoNow();$$('asisYear').value=n.y;$$('asisWeek').value=n.w;unlocked=false;$$('asisBack').classList.add('show');pintar();}
$$('usrAsisBtn').onclick=abrir;$$('asisClose').onclick=()=>$$('asisBack').classList.remove('show');
['asisYear','asisWeek'].forEach(i=>$$(i).addEventListener('change',()=>{unlocked=false;pintar();}));
const mover=k=>{let y=+$$('asisYear').value,w=+$$('asisWeek').value+k;if(w<1){y--;w=52;}if(w>52){const mx=isoWeeks(y);if(w>mx){w=1;y++;}}$$('asisYear').value=y;$$('asisWeek').value=w;unlocked=false;pintar();};
function isoWeeks(y){const d=new Date(Date.UTC(y,11,28)),t=new Date(d);t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));return Math.ceil(((t-Date.UTC(t.getUTCFullYear(),0,1))/864e5+1)/7);}
$$('asisPrev').onclick=()=>mover(-1);$$('asisNext').onclick=()=>mover(1);$$('asisNow').onclick=abrir;
$$('asisUnlock').onclick=()=>{unlocked=true;pintar();};
$$('asisAllA').onclick=()=>{$$('asisTable').querySelectorAll('select').forEach(s=>{if(!s.value){s.value='A';s.parentElement.className='as-A';}});};
$$('asisTable').addEventListener('change',e=>{const s=e.target.closest('select');if(s)s.parentElement.className=s.value?'as-'+s.value:'';});
$$('asisSave').onclick=async()=>{if(!window.requestUploadAccess())return;const rec={};
 $$('asisTable').querySelectorAll('select').forEach(s=>{if(s.value){const u=s.dataset.u;(rec[u]=rec[u]||{})[s.dataset.d]=s.value;}});
 window.ASISTENCIA[wkey()]=rec;window.__toast&&window.__toast('Asistencia de la semana '+$$('asisWeek').value+' guardada.');pintar();if(window.saveCloud)await window.saveCloud();};
window.renderUsuarios();
})();
