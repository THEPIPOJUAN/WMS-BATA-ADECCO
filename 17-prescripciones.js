/* ===== Prescripciones semanales =====
   Excel del área comercial, día de atención, resumen por semana/día y compactación para la nube. */
/* =====================================================================
   MÓDULO · PRESCRIPCIONES SEMANALES (+ compactación de detalles para la nube)
   ===================================================================== */
(function(){
const $$=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nrm=s=>{s=String(s==null?'':s);try{s=decodeURIComponent(escape(s));}catch(e){}return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();};
window.PRESC=window.PRESC||[];
// ---- calendario de correo: semana viernes→jueves ----
const DAYN=['DOMINGO','LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO'];
const RANK={VIERNES:0,SABADO:1,DOMINGO:2,LUNES:3,MARTES:4,MIERCOLES:5,JUEVES:6};
const ATN={VIERNES:['LUNES',3],SABADO:['LUNES',2],DOMINGO:['LUNES',1],LUNES:['MARTES',1],MARTES:['MIERCOLES',1],MIERCOLES:['JUEVES',1],JUEVES:['VIERNES',1]};
// Semana de trabajo: lunes a jueves = semana ISO de la fecha; viernes, sábado y domingo pasan a la semana del lunes siguiente
const ADJ={5:3,6:2,0:1,1:0,2:0,3:0,4:0};
function isoWeek(ms){const t=new Date(ms);t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));const y0=Date.UTC(t.getUTCFullYear(),0,1);return Math.ceil(((t-y0)/864e5+1)/7);}
function pdate(v){if(v==null||v==='')return null;
 if(typeof v==='number')return (Math.floor(v)-25569)*864e5;
 if(v instanceof Date)return Date.UTC(v.getFullYear(),v.getMonth(),v.getDate());
 const s=String(v).trim();let m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);if(m)return Date.UTC(+m[3],+m[2]-1,+m[1]);
 m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);return null;}
const iso=ms=>new Date(ms).toISOString().slice(0,10),lab=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
function enrich(r){const ms=Date.parse(r.d+'T00:00:00Z'),wd=new Date(ms).getUTCDay(),n=DAYN[wd],fri=ms-((wd+2)%7)*864e5,sem='SEM '+isoWeek(ms+ADJ[wd]*864e5),a=ATN[n];
 const cdg='50'+String(r.tienda||'').replace(/\D/g,'').padStart(3,'0');
 return Object.assign({},r,{fri,rk:RANK[n],sem,semdia:sem+' '+n,atn:sem+' '+a[0],fatn:iso(ms+a[1]*864e5),zona:(window.rutaZona&&window.rutaZona(cdg))||'SIN RUTA',ruta:(window.rutaNombre&&window.rutaNombre(cdg))||''});}
function all(){const L=window.PRESC.map((r,i)=>Object.assign(enrich(r),{ix:i,dup:''})),zr=z=>z==='LIMA'?0:z==='PROVINCIA'?1:2,g=new Map();
 L.forEach(r=>{if(!g.has(r.guia))g.set(r.guia,[]);g.get(r.guia).push(r);});
 // Guía repetida: se conservan ambas; la más nueva lleva la observación con la(s) anterior(es)
 g.forEach(a=>{if(a.length<2)return;a.sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:x.ix-y.ix);a.forEach((r,k)=>{if(!k)return;const seen=[];a.slice(0,k).forEach(p=>{const t=p.semdia+' '+lab(p.d).slice(0,5)+(p.d===r.d?' (mismo correo)':'');if(!seen.includes(t))seen.push(t);});r.dup=seen.join(' · ');});});
 L.sort((a,b)=>a.fri-b.fri||a.rk-b.rk||zr(a.zona)-zr(b.zona)||String(a.ruta).localeCompare(String(b.ruta))||String(a.guia).localeCompare(String(b.guia)));
 L.forEach((r,i)=>r.pri=i+1);return L;}
// Fecha del correo = fecha escrita en el NOMBRE del Excel (ej. «Guías_13_10.xlsx» → 13/10). Si el nombre no tiene fecha, se usa la columna FECHA.
function mailFromName(name,yearHint){const b=String(name).replace(/\.[^.]+$/,''),m=b.match(/(\d{1,2})[._\-\s](\d{1,2})(?:[._\-\s](\d{2,4}))?/);if(!m)return null;
 const dd=+m[1],mm=+m[2];if(mm<1||mm>12||dd<1||dd>31)return null;let y=m[3]?+m[3]:0;if(y&&y<100)y+=2000;if(!y)y=yearHint||new Date().getFullYear();return Date.UTC(y,mm-1,dd);}
function header(rows){for(let i=0;i<Math.min(rows.length,15);i++){const x=Array.from(rows[i]||[],v=>nrm(v));if(x.indexOf('GUIA')>=0&&x.indexOf('TIEND')>=0)return {hi:i,H:x};}return null;}
function parse(rows,H,hi,fname){
 const c=n=>H.indexOf(n),c2=(a,b)=>c(a)>=0?c(a):c(b),iC=H.findIndex(x=>x.startsWith('SUMA DE CANTI')||x==='CANTIDAD'||x==='CANTI'),iF=c2('FECHAPR','FECHA'),iD=c2('DIST','DIS'),iK=c2('CAD','CADENA');
 const data=rows.slice(hi+1).filter(r=>r&&r[c('GUIA')]!=null&&r[c('GUIA')]!=='');
 const years=data.map(r=>pdate(r[iF])).filter(v=>v!=null).map(v=>new Date(v).getUTCFullYear());
 const fromName=mailFromName(fname,years.length?Math.max(...years):0),out=[];let bad=0;
 data.forEach(r=>{const fp=iF>=0?pdate(r[iF]):null,ms=fromName!=null?fromName:fp;if(ms==null){bad++;return;}
  const v=k=>{const i=typeof k==='number'?k:c(k);return i>=0&&r[i]!=null?String(r[i]).trim():'';};
  out.push({d:iso(ms),fp:fp!=null?iso(fp):'',dist:v(iD),cad:v(iK),tienda:v('TIEND'),nombre:v('NOMBR'),prioridad:v('PRIORIDAD'),etiqueta:v('ETIQUETA'),guia:String(r[c('GUIA')]).trim(),almac:v('ALMAC'),desp:v('DESPACHAR'),cant:Number(iC>=0?r[iC]:0)||0,cd:v('CD'),r:1,isP:1});});
 if(!out.length)throw new Error(fromName==null?'El nombre del archivo no trae una fecha (ej. Guías_13_10.xlsx) y no hay columna FECHA.':'El archivo no tiene filas con guía.');
 return {out,bad,byName:fromName!=null};}
async function cargar(files){files=[...files].filter(f=>/\.xlsx?$/i.test(f.name)&&!f.name.startsWith('~$'));if(!files.length)return;
 let nuevas=0,reemp=0,ok=0;
 for(const f of files){try{
   const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});let hit=null;
   for(const sn of wb.SheetNames){const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:true,defval:null}),hd=header(rows);if(hd){hit={rows,hd};break;}}
   if(!hit)throw new Error('No encontré las columnas GUIA y TIEND en ninguna hoja. ¿Es el Excel de prescripciones?');
   const {out,bad,byName}=parse(hit.rows,hit.hd.H,hit.hd.hi,f.name);
   // si se vuelve a subir el MISMO archivo, se reemplaza solo su carga anterior (las guías repetidas de otros correos se conservan)
   const prev=window.FILES.filter(x=>x.kind==='Prescripciones'&&x.name===f.name).map(x=>x.id);
   if(prev.length){const n0=window.PRESC.length;window.PRESC=window.PRESC.filter(r=>!prev.includes(r.src));reemp+=n0-window.PRESC.length;window.FILES=window.FILES.filter(x=>!prev.includes(x.id));}
   const sid=window.__newSrc(f.name,'—','Prescripciones');out.forEach(r=>{r.src=sid;window.PRESC.push(r);nuevas++;});ok++;
   window.__toast(f.name+': fecha del correo '+lab(out[0].d)+(byName?' (tomada del nombre del archivo)':' (tomada de la columna FECHA, el nombre no trae fecha)')+'.');
   if(bad)window.__toast(f.name+': '+bad+' filas sin fecha válida se omitieron.');
  }catch(err){window.__toast('❌ '+f.name+': '+err.message);}}
 if(!ok)return;
 if(!(window.RUTAS||[]).length)window.__toast('Aviso: carga RUTAS para ver si cada tienda es Lima o Provincia.');
 const nd=all().filter(r=>r.dup).length;
 window.__toast('Prescripciones: '+nuevas+' líneas cargadas'+(reemp?' ('+reemp+' reemplazadas del mismo archivo)':'')+(nd?' · '+nd+' guía(s) repetida(s): se conservaron ambas y se marcaron en «Guia Duplicada».':'.'));
 render();window.renderFiles&&window.renderFiles();await window.saveCloud();}
['prescInput','prescFolderInput','prescInput2','prescFolder2'].forEach(id=>$$(id).addEventListener('change',e=>{const fs=[...(e.target.files||[])];e.target.value='';cargar(fs);}));
function fill(id,title,vals){const s=$$(id),cur=s.value;s.innerHTML='<option value="">'+title+'</option>'+vals.map(v=>'<option>'+esc(v)+'</option>').join('');if(vals.includes(cur))s.value=cur;}
const COLS=['FECHA DE CORREO','SEMANA CORREO','FECHA DE ATENCION','SEMANA ATENCION','Cadena','TIEND','NOMBR','Prioridad','Etiqueta','FECHA','GUIA','ALMAC','Despachar','Suma de CANTI','CD','Guia Duplicada','PRIORIDAD ATENCIÓN','ZONA','RUTA','DIS'];
const rowVals=r=>[lab(r.d),r.semdia,lab(r.fatn),r.atn,r.cad,r.tienda,r.nombre,r.prioridad,r.etiqueta,lab(r.fp),r.guia,r.almac,r.desp,r.cant,r.cd,r.dup,r.pri,r.zona,r.ruta,r.dist];
let detMode=null;
function render(){const A=all(),t=$$('prescTable');if(!t)return;
 fill('pfSem','Todas las semanas',[...new Set(A.map(r=>r.sem))]);fill('pfAtn','Todos los días de atención',[...new Set(A.map(r=>r.atn))]);fill('pfZona','Lima y Provincia',[...new Set(A.map(r=>r.zona))]);fill('pfEt','Todas las etiquetas',[...new Set(A.map(r=>r.etiqueta))].filter(Boolean));
 const fs=$$('pfSem').value,fa=$$('pfAtn').value,fz=$$('pfZona').value,fe=$$('pfEt').value,fd=$$('pfDup').value,q=nrm($$('pfQ').value);
 const L=A.filter(r=>(!fs||r.sem===fs)&&(!fa||r.atn===fa)&&(!fz||r.zona===fz)&&(!fe||r.etiqueta===fe)&&(!fd||(fd==='dup'?!!r.dup:!r.dup))&&(!q||nrm([r.tienda,r.nombre,r.guia,r.ruta,r.prioridad].join(' ')).includes(q)));
 const gs=new Set(L.map(r=>r.guia)),ts=new Set(L.map(r=>r.tienda)),ss=new Set(L.map(r=>r.sem)),qty=L.reduce((s,r)=>s+r.cant,0),f0=n=>Number(n).toLocaleString('es-PE');
 $$('prescKpis').innerHTML=[['Guías',gs.size],['Cantidad',qty],['Tiendas',ts.size],['Semanas de correo',ss.size],['Guías repetidas',L.filter(r=>r.dup).length]].map(x=>'<div class="pk"><span>'+x[0]+'</span><b>'+f0(x[1])+'</b></div>').join('');
 $$('prescStatus2').textContent=A.length?'Prescripciones cargadas: '+f0(A.length)+' líneas · '+f0(new Set(A.map(r=>r.guia)).size)+' guías · '+f0(A.filter(r=>r.dup).length)+' repetidas.':'Sin prescripciones cargadas.';
 if($$('prescStatus'))$$('prescStatus').textContent=$$('prescStatus2').textContent;
 const g=new Map();L.forEach(r=>{const k=r.atn+'|'+r.fatn;let o=g.get(k);if(!o){o={atn:r.atn,fatn:r.fatn,pri:r.pri,z:{}};g.set(k,o);}o.pri=Math.min(o.pri,r.pri);const z=o.z[r.zona]||(o.z[r.zona]={g:new Set(),c:0});z.g.add(r.guia);z.c+=r.cant;});
 const zs=['LIMA','PROVINCIA'].concat([...new Set(L.map(r=>r.zona))].filter(z=>z!=='LIMA'&&z!=='PROVINCIA'));
 const rowsS=[...g.values()].sort((a,b)=>a.pri-b.pri);
 $$('prescSum').innerHTML='<tr><th class="name">SEMANA ATENCION</th><th>Fecha</th>'+zs.map(z=>'<th>'+z+' · guías</th><th>'+z+' · cant.</th>').join('')+'<th>Total guías</th><th>Total cant.</th></tr>'+rowsS.map(o=>{const tg=new Set();let tc=0;
  const cells=zs.map(z=>{const x=o.z[z];if(x){x.g.forEach(v=>tg.add(v));tc+=x.c;}return '<td class="num">'+(x?f0(x.g.size):'-')+'</td><td class="num">'+(x?f0(x.c):'-')+'</td>';}).join('');
  return '<tr><td class="name"><b>'+esc(o.atn)+'</b></td><td>'+lab(o.fatn)+'</td>'+cells+'<td class="num"><b>'+f0(tg.size)+'</b></td><td class="num"><b>'+f0(tc)+'</b></td></tr>';}).join('');
 weekDay(A,L,fs,f0);
 t.innerHTML='<tr>'+COLS.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr>'+L.slice(0,500).map(r=>'<tr>'+rowVals(r).map((v,i)=>{const k=COLS[i];return '<td'+(k==='Guia Duplicada'&&v?' style="background:#f4a3a3;font-weight:700"':(k==='Suma de CANTI'||k==='PRIORIDAD ATENCIÓN'?' class="num"':''))+'>'+esc(k==='Suma de CANTI'?f0(v):v)+'</td>';}).join('')+'</tr>').join('')+
  (L.length>500?'<tr><td colspan="'+COLS.length+'">Se muestran 500 de '+f0(L.length)+'. Usa los filtros o descarga el Excel.</td></tr>':'');}
const CATN=e=>{const n=nrm(e);return n.startsWith('CALZ')?'CALZADO':n.startsWith('ACC')?'ACCESORIOS':n.startsWith('INSUM')?'INSUMOS':(String(e||'').trim()||'OTROS');};
const DAYS=['LUNES','MARTES','MIERCOLES','JUEVES','VIERNES','SABADO','DOMINGO'],DLAB={MIERCOLES:'MIÉRCOLES',SABADO:'SÁBADO'};
const PAL=['#d9232d','#2d3139','#e0a43a','#8a94a3','#2f8f5b','#b04a9c'];
function chart(el,labels,series,title){
 if(!el)return;if(!labels.length){el.innerHTML='';return;}
 const W=Math.max(560,labels.length*96+90),H=300,Lm=70,Rm=12,Tm=44,Bm=48,pw=W-Lm-Rm,ph=H-Tm-Bm,tot=labels.map((_,i)=>series.reduce((a,x)=>a+(x.v[i]||0),0)),mx=Math.max(1,...tot);
 const step=Math.pow(10,Math.floor(Math.log10(mx))),nice=Math.ceil(mx/step*2)/2*step||mx,f=n=>Number(n).toLocaleString('es-PE');
 let g='<text x="'+Lm+'" y="22" font-size="17" font-weight="700" fill="#2d3139">'+esc(title)+'</text>';
 let lx=Lm;series.forEach((x,k)=>{g+='<rect x="'+lx+'" y="30" width="12" height="12" fill="'+PAL[k%PAL.length]+'"/><text x="'+(lx+17)+'" y="41" font-size="13" fill="#41536a">'+esc(x.name)+'</text>';lx+=36+x.name.length*8;});
 for(let i=0;i<=4;i++){const y=Tm+ph-ph*i/4;g+='<line x1="'+Lm+'" x2="'+(W-Rm)+'" y1="'+y+'" y2="'+y+'" stroke="#e5ebf0"/><text x="'+(Lm-8)+'" y="'+(y+5)+'" font-size="13" text-anchor="end" fill="#41536a">'+f(nice*i/4)+'</text>';}
 const bw=Math.min(64,pw/labels.length*0.62);
 labels.forEach((lb,i)=>{const cx=Lm+pw*(i+.5)/labels.length;let y=Tm+ph;
  series.forEach((x,k)=>{const v=x.v[i]||0,h=ph*v/nice;if(v>0){y-=h;g+='<rect x="'+(cx-bw/2)+'" y="'+y+'" width="'+bw+'" height="'+h+'" fill="'+PAL[k%PAL.length]+'"><title>'+esc(lb+' · '+x.name+': '+f(v))+'</title></rect>';if(h>20)g+='<text x="'+cx+'" y="'+(y+h/2+5)+'" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">'+f(v)+'</text>';}});
  g+='<text x="'+cx+'" y="'+(y-6)+'" font-size="14" font-weight="700" fill="#2d3139" text-anchor="middle">'+f(tot[i])+'</text><text x="'+cx+'" y="'+(Tm+ph+22)+'" font-size="14" fill="#41536a" text-anchor="middle">'+esc(lb)+'</text>';});
 el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" style="width:100%;max-width:'+Math.max(W,760)+'px;height:auto" role="img">'+g+'</svg>';}
function weekDay(A,L,fs,f0){
 const fz=$$('pfZona').value,fe=$$('pfEt').value,LW=A.filter(r=>(!fz||r.zona===fz)&&(!fe||r.etiqueta===fe));
 const dOf=r=>String(r.atn).split(' ').slice(2).join(' '),sems=[...new Set(LW.map(r=>r.sem))].sort((a,b)=>parseInt(a.slice(4))-parseInt(b.slice(4)));
 const days=DAYS.filter(d=>LW.some(r=>dOf(r)===d)),cats=['CALZADO','ACCESORIOS','INSUMOS'].concat([...new Set(LW.map(r=>CATN(r.etiqueta)))].filter(c=>!['CALZADO','ACCESORIOS','INSUMOS'].includes(c)));
 let h='<tr><th class="name">SEMANA</th><th>CATEGORÍA</th>'+days.map(d=>'<th>'+(DLAB[d]||d)+'</th>').join('')+'<th>TOTAL</th><th>TOTAL SEMANA</th></tr>';
 sems.forEach(sm=>{const R0=LW.filter(r=>r.sem===sm),cs=cats.filter(c=>R0.some(r=>CATN(r.etiqueta)===c)),tw=R0.reduce((a,r)=>a+r.cant,0);
  cs.forEach((c,k)=>{const RC=R0.filter(r=>CATN(r.etiqueta)===c);h+='<tr>'+(k?'':'<td class="name" rowspan="'+cs.length+'"><b>'+esc(sm)+'</b><br><button class="btn pw-btn" data-sem="'+esc(sm)+'" type="button">Ver detalle</button></td>')+'<td class="name"><b>'+c+'</b></td>'+days.map(d=>'<td class="num">'+f0(RC.filter(r=>dOf(r)===d).reduce((a,r)=>a+r.cant,0))+'</td>').join('')+'<td class="num"><b>'+f0(RC.reduce((a,r)=>a+r.cant,0))+'</b></td>'+(k?'':'<td class="num" rowspan="'+cs.length+'"><b>'+f0(tw)+'</b></td>')+'</tr>';});});
 $$('prescWeek').innerHTML=sems.length?h:'<tr><td>Sin datos.</td></tr>';
 chart($$('prescWeekChart'),sems,cats.map(c=>({name:c,v:sems.map(sm=>LW.filter(r=>r.sem===sm&&CATN(r.etiqueta)===c).reduce((a,r)=>a+r.cant,0))})).filter(x=>x.v.some(v=>v>0)),'Cantidad por semana de atención y categoría');
 const ats=[...new Set(L.slice().sort((a,b)=>a.pri-b.pri).map(r=>r.atn))],zs=[...new Set(L.map(r=>r.zona))];
 chart($$('prescDayChart'),ats,zs.map(z=>({name:z,v:ats.map(a=>L.filter(r=>r.atn===a&&r.zona===z).reduce((q,r)=>q+r.cant,0))})),'Cantidad por día de atención y zona');
 const sel=$$('prescDetSem');sel.innerHTML='<option value="">SEMANA…</option>'+sems.map(x=>'<option'+(fs===x&&detMode?' selected':'')+'>'+esc(x)+'</option>').join('');
 $$('prescDetail').style.display=detMode===null?'none':'block';
 $$('prescDetTitle').textContent='Detalle ordenado por prioridad de atención — '+(fs||'todas las semanas');}
$$('prescDetAll').onclick=()=>{$$('pfSem').value='';detMode='ALL';render();$$('prescDetail').scrollIntoView({behavior:'smooth'});};
$$('prescDetSem').addEventListener('change',e=>{const v=e.target.value;$$('pfSem').value=v;detMode=v||'ALL';render();$$('prescDetail').scrollIntoView({behavior:'smooth'});});
$$('prescDetHide').onclick=()=>{detMode=null;render();};
$$('prescWeek').addEventListener('click',e=>{const b=e.target.closest('[data-sem]');if(!b)return;$$('pfSem').value=b.dataset.sem;detMode=b.dataset.sem;render();$$('prescDetail').scrollIntoView({behavior:'smooth'});});
window.renderPresc=render;
['pfSem','pfAtn','pfZona','pfEt','pfDup'].forEach(id=>$$(id).addEventListener('change',render));$$('pfQ').addEventListener('input',render);
$$('prescDown').onclick=()=>{const A=all();if(!A.length)return;
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet([COLS].concat(A.map(rowVals)));
 ws['!cols']=COLS.map(()=>({wch:18}));XLSX.utils.book_append_sheet(wb,ws,'PRESCRIPCIONES');
 const g=new Map();A.forEach(r=>{const k=r.atn+'|'+r.zona;let o=g.get(k);if(!o){o={atn:r.atn,f:r.fatn,z:r.zona,g:new Set(),c:0,p:r.pri};g.set(k,o);}o.g.add(r.guia);o.c+=r.cant;});
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['SEMANA ATENCION','FECHA DE ATENCION','ZONA','GUIAS','CANTIDAD']].concat([...g.values()].sort((a,b)=>a.p-b.p).map(o=>[o.atn,lab(o.f),o.z,o.g.size,o.c]))),'RESUMEN');
 XLSX.writeFile(wb,'PRESCRIPCIONES_SEMANALES.xlsx');};
const _rr=window.renderRutas;window.renderRutas=function(){if(_rr)_rr.apply(this,arguments);render();};
render();
})();
