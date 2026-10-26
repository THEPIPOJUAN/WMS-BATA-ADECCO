/* ===== Rutas, avisos y lógica de Packing =====
   Maestro de rutas, avisos (toast), tabla de Corrida de olas y conversión del Excel de Packing. */
(function(){
const $$=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nrm=s=>{s=String(s==null?'':s);try{s=decodeURIComponent(escape(s));}catch(e){}return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();};
const tb=document.createElement('div');tb.id='toastBox';document.body.appendChild(tb);
window.__toast=t=>{const d=document.createElement('div');d.className='toast';d.textContent=t;tb.appendChild(d);setTimeout(()=>d.remove(),9000);};
window.__toastLink=(t,label,href,name)=>{const d=document.createElement('div');d.className='toast';d.textContent=t+' ';const a=document.createElement('a');a.href=href;a.download=name;a.textContent=label;a.style.cssText='color:#ffd54a;font-weight:700';d.appendChild(a);tb.appendChild(d);setTimeout(()=>d.remove(),45000);};
// ---- RUTAS ----
window.RUTAS=window.RUTAS||[];let RIDX=new Map();
const key=c=>String(parseInt(c,10)||c).trim();
function rebuildIdx(){RIDX=new Map(window.RUTAS.map(r=>[key(r.cdg),r]));}
window.rutaZona=c=>{const r=RIDX.get(key(c));return r?r.zona:'';};
window.rutaNombre=c=>{const r=RIDX.get(key(c));return r?r.ruta:'';};
async function readWB(f){return XLSX.read(await f.arrayBuffer(),{type:'array'});}
function parseRutas(wb){
 const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''});
 const hi=rows.findIndex(r=>r.some(c=>nrm(c)==='CDG'));if(hi<0)throw new Error('No se encontró la columna CDG en el archivo de rutas.');
 const H=rows[hi].map(nrm),g=n=>H.lastIndexOf(n),iC=g('CDG'),iZ=g('ZONA'),iT=g('TRANSPORTE'),iN=g('TURNO'),iD=g('F. DESPACHO'),iS=g('TIENDA'),iP=g('DEPARTAMENTO');
 const out=[];
 rows.slice(hi+1).forEach(r=>{const cdg=String(r[iC]==null?'':r[iC]).trim();if(!cdg)return;
  const zona=nrm(r[iZ]);const ruta=zona==='LIMA'?(String(r[iD]||'').trim()+' '+String(r[iN]||'').trim()).trim():String(r[iT]||'').trim();
  out.push({cdg:String(parseInt(cdg,10)||cdg),tienda:String(r[iS]||'').trim(),depto:String(r[iP]||'').trim(),zona:zona||'SIN ZONA',ruta:ruta||'SIN RUTA'});});
 if(!out.length)throw new Error('El archivo de rutas no tiene tiendas con CDG.');return out;
}
window.renderRutas=function(){rebuildIdx();const t=$$('rutasTable');if(!t)return;
 const q=nrm($$('rutaSearch')?$$('rutaSearch').value:'');
 const L=window.RUTAS.filter(r=>!q||nrm([r.cdg,r.tienda,r.depto,r.zona,r.ruta].join(' ')).includes(q));
 t.innerHTML='<tr><th>CDG</th><th class="name">Tienda</th><th>Departamento</th><th>Zona</th><th>Ruta</th><th></th></tr>'+L.map(r=>'<tr><td>'+esc(r.cdg)+'</td><td class="name">'+esc(r.tienda)+'</td><td>'+esc(r.depto)+'</td><td>'+esc(r.zona)+'</td><td>'+esc(r.ruta)+'</td><td><button class="mini-btn" data-e="'+esc(r.cdg)+'">Editar</button><button class="mini-btn" data-d="'+esc(r.cdg)+'">Eliminar</button></td></tr>').join('');
 const m='Rutas cargadas: '+window.RUTAS.length.toLocaleString('es-PE')+' (Lima: '+window.RUTAS.filter(r=>r.zona==='LIMA').length+' · Provincia: '+window.RUTAS.filter(r=>r.zona==='PROVINCIA').length+')';
 ['rutasStatus','rutasStatus2'].forEach(i=>{if($$(i))$$(i).textContent=window.RUTAS.length?m:'Sin rutas cargadas.';});};
async function cargarRutas(e){const f=e.target.files[0];if(!f)return;
 try{const list=parseRutas(await readWB(f));const m=new Map(window.RUTAS.map(r=>[key(r.cdg),r]));list.forEach(r=>m.set(key(r.cdg),r));window.RUTAS=[...m.values()];window.renderRutas();window.__toast('Rutas leídas: '+list.length+' tiendas.');await window.saveCloud();}
 catch(err){window.__toast('❌ '+err.message);}e.target.value='';}
$$('rutasInput').addEventListener('change',cargarRutas);$$('rutasInput2').addEventListener('change',cargarRutas);
$$('rutaSearch').addEventListener('input',window.renderRutas);
const form=$$('rutaForm');
$$('rutaAddBtn').onclick=()=>{['rCdg','rTienda','rDepto','rRuta'].forEach(i=>$$(i).value='');$$('rCdg').disabled=false;form.style.display='grid';$$('rCdg').focus();};
$$('rutaCancelBtn').onclick=()=>{form.style.display='none';};
$$('rutaSaveBtn').onclick=async()=>{const cdg=$$('rCdg').value.trim();if(!cdg||!$$('rRuta').value.trim()){window.__toast('Completa código y ruta.');return;}
 if(!window.requestUploadAccess())return;const r={cdg:key(cdg),tienda:$$('rTienda').value.trim(),depto:$$('rDepto').value.trim(),zona:$$('rZona').value,ruta:$$('rRuta').value.trim()};
 const i=window.RUTAS.findIndex(x=>key(x.cdg)===r.cdg);if(i>=0)window.RUTAS[i]=r;else window.RUTAS.push(r);form.style.display='none';window.renderRutas();await window.saveCloud();};
$$('rutasTable').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.e){const r=window.RUTAS.find(x=>key(x.cdg)===key(b.dataset.e));if(!r)return;$$('rCdg').value=r.cdg;$$('rTienda').value=r.tienda;$$('rDepto').value=r.depto;$$('rZona').value=r.zona==='LIMA'?'LIMA':'PROVINCIA';$$('rRuta').value=r.ruta;form.style.display='grid';}
 if(b.dataset.d){if(!confirm('¿Eliminar la ruta '+b.dataset.d+'?')||!window.requestUploadAccess())return;window.RUTAS=window.RUTAS.filter(x=>key(x.cdg)!==key(b.dataset.d));window.renderRutas();await window.saveCloud();}});
$$('rutaDownBtn').onclick=()=>{if(!window.RUTAS.length)return;const ws=XLSX.utils.aoa_to_sheet([['CDG','TIENDA','DEPARTAMENTO','ZONA','RUTA']].concat(window.RUTAS.map(r=>[r.cdg,r.tienda,r.depto,r.zona,r.ruta])));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'RUTAS');XLSX.writeFile(wb,'RUTAS.xlsx');};
window.renderRutas();
// ---- Corrida de olas (módulo) ----
window.renderOla=o=>{const t=$$('olaTable');if(!t||!o)return;
 t.innerHTML='<tr>'+o.H.map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr>'+o.out.slice(0,500).map(r=>'<tr>'+r.map((v,i)=>'<td'+((i===16||i===17)&&v==='SIN STOCK'?' class="sinstock"':'')+'>'+esc(v)+'</td>').join('')+'</tr>').join('')+(o.out.length>500?'<tr><td colspan="'+o.H.length+'">Se muestran 500 de '+o.out.length.toLocaleString('es-PE')+' líneas. El Excel descargado trae todas.</td></tr>':'');};
$$('olaDownloadBtn2').onclick=()=>$$('olaDownloadBtn').click();
// ---- PACKING: lógica del Excel convertida al formato del dashboard ----
const INS=['9992849','9992847','9992846','9005800','9992848','9945990','9946996','9946995','9949997','9949998','9949999','9900300','9900301','9903902','9903903','9900602'];
const p2=n=>String(n).padStart(2,'0');
function dt(v){
 // k = tipo de fecha: n = número de Excel · i = texto ISO (aaaa-mm-dd, sin ambigüedad) · t = texto dd/mm/aaaa
 if(typeof v==='number'){const d=new Date(Math.round((v-25569)*864e5));return {Y:d.getUTCFullYear(),M:d.getUTCMonth()+1,D:d.getUTCDate(),h:d.getUTCHours(),m:d.getUTCMinutes(),s:d.getUTCSeconds(),k:'n'};}
 let m=String(v||'').match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);if(m)return {Y:+m[1],M:+m[2],D:+m[3],h:+m[4],m:+m[5],s:+(m[6]||0),k:'i'};
 m=String(v||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
 if(m){let D=+m[1],M=+m[2];if(M>12&&D<=12){const x=D;D=M;M=x;}return {Y:+m[3],M,D,h:+m[4],m:+m[5],s:+(m[6]||0),k:'t'};}
 return null;}
async function dateFixer(TT){
 // Excel a veces lee unas fechas como mes/día y deja otras como día/mes. Un día > 12 es seguro; las ambiguas se alinean con ellas.
 const refs=TT.filter(t=>t&&t.k!=='i'&&t.D>12).map(t=>Date.UTC(t.Y,t.M-1,t.D)).sort((a,b)=>a-b),med=refs.length?refs[refs.length>>1]:null,hoy=Date.now()+864e5;let swapped=0,forced=null;
 if(med==null){const amb=TT.filter(t=>t&&t.k!=='i'&&t.D<=12&&t.M<=12&&t.D!==t.M);
  if(amb.length&&!amb.some(t=>Date.UTC(t.Y,t.M-1,t.D)>hoy)&&!amb.some(t=>Date.UTC(t.Y,t.D-1,t.M)>hoy))forced=await askDateFmt(amb);}
 const fix=t=>{if(!t||t.k==='i'||t.D>12||t.M>12||t.D===t.M)return t;const a=Date.UTC(t.Y,t.M-1,t.D),b=Date.UTC(t.Y,t.D-1,t.M);
  const useB=forced?forced==='mdy':(med!=null?Math.abs(b-med)<Math.abs(a-med):(a>hoy&&b<=hoy));if(!useB)return t;swapped++;return Object.assign({},t,{M:t.D,D:t.M});};
 return {fix,count:()=>swapped};}
const clean=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').replace(/[",]/g,' ').trim();
async function readTextAny(file){const ab=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(ab);}catch(e){return new TextDecoder('windows-1252').decode(ab);}}
function csvLine(line,d){const o=[];let c='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(q){if(ch==='"'){if(line[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}else if(ch==='"')q=true;else if(ch===d){o.push(c);c='';}else c+=ch;}o.push(c);return o;}
// PACKING ya procesado (columnas A–N de tu hoja + filtros): ENCABEZADO 1 → ENCABEZADO 2
// Número de orden→Orden_ID · cantidad→Und_cantidad · Cantidad Conv→Und_Cantidad Conv · SOLI.→Und_SOLI. · PRE PACK.→Und_PRE PACK. · ZONA→Tipo_Pedido · Hora→hora
async function processedPacking(file,text){
 window.__toast('Leyendo packing procesado ('+(file.size/1e6).toFixed(1)+' MB)…');await new Promise(r=>setTimeout(r,40));
 const L=text.split(/\r?\n/),d=(L[0].split(';').length>L[0].split(',').length)?';':',';
 const H=csvLine(L[0].replace(/^\uFEFF/,''),d).map(nrm),c=n=>H.indexOf(n),ix={};
 [['f','FECHA'],['u','USUARIO'],['cv','CANTIDAD CONV'],['pp','PRE PACK.'],['cat','CATEGORIA'],['z','ZONA'],['fl','FILTRO']].forEach(([k,n])=>{ix[k]=c(n);if(ix[k]<0)throw new Error('Falta la columna '+n+' en el packing procesado.');});
 Object.assign(ix,{h:c('HORA'),q:c('CANTIDAD'),ar:c('AREA'),o:c('NUMERO DE ORDEN'),t:c('TURNO'),ts:c('REGISTRO DE HORA DE MODIFICACION'),sku:c('CODIGO DE ARTICULO'),lp:c('NUMERO DE LPN DE ENTRADA'),ct:c('NUMERO DE CONTENEDOR'),ub:c('DE UBICACION'),ds:c('INSTALACION DE DESTINO')});
 const R=[];for(let i=1;i<L.length;i++){if(L[i])R.push(csvLine(L[i],d));}
 const g=(r,k)=>ix[k]>=0&&r[ix[k]]!=null?String(r[ix[k]]).trim():'';
 const TT=R.map(r=>dt(g(r,'ts')||(g(r,'f')+' '+String(g(r,'h')||0).padStart(2,'0')+':00')));
 const DF=await dateFixer(TT),p2=n=>String(n).padStart(2,'0');
 const out=['Fecha,Categoria,Usuario,Turno,Area,Tipo_Pedido,Orden_ID,Und_Cantidad Conv,Und_cantidad,Und_PRE PACK.,hora,Hora de selección,SKU,LPN,LPN_Destino,Ubicacion,Instalacion,Tienda'],det=[];let skip=0;
 R.forEach((r,i)=>{
  const conv=Number(g(r,'cv'))||0,q=Number(g(r,'q'))||conv,zona=nrm(g(r,'z'));
  if(nrm(g(r,'fl'))!=='EMBALADO'||zona==='OTROS'||zona===''||conv<=0){skip++;return;}      // cantidad 0 → se omite
  const t=DF.fix(TT[i]);if(!t){skip++;return;}
  const sku=g(r,'sku'),cat0=nrm(g(r,'cat')),catF=['CALZ','ACC','INSUMO','MATERIALES'].includes(cat0)?cat0:'CALZ',cat=(window.masterCat&&window.masterCat(sku))||catF;
  const fecha=t.Y+'-'+p2(t.M)+'-'+p2(t.D),tu=nrm(g(r,'t')),turno=tu==='NOCHE'?'NOCHE':(tu?'DIA':((t.h>=18||t.h<6)?'NOCHE':'DIA')),dest=g(r,'ds'),usr=clean(g(r,'u')),ord=clean(g(r,'o'));
  out.push([fecha,cat,usr,turno,clean(g(r,'ar'))||'SIN AREA',zona,ord,conv,q,Number(g(r,'pp'))||0,t.h,fecha+' '+p2(t.h)+':'+p2(t.m)+':'+p2(t.s),clean(sku),clean(g(r,'lp')),clean(g(r,'ct')),clean(g(r,'ub')),clean(dest),clean(window.rutaTienda?window.rutaTienda(dest):'')].join(','));
  det.push({d:fecha,u:usr,h:t.h,ts:Date.UTC(t.Y,t.M-1,t.D,t.h,t.m,t.s),orden:ord,lpn:g(r,'lp'),lpnd:g(r,'ct'),sku,desc:'',ubicacion:g(r,'ub'),cantidad:conv,instalacion:dest,tienda:window.rutaTienda?window.rutaTienda(dest):''});
 });
 if(out.length<2)throw new Error('Ninguna línea del packing procesado cumple las condiciones (FILTRO = EMBALADO, ZONA distinta de OTROS, cantidad > 0).');
 const ds=det.map(x=>x.d).sort(),fm=s=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
 window.__toast('📅 Packing procesado: '+(out.length-1).toLocaleString('es-PE')+' líneas · '+skip.toLocaleString('es-PE')+' omitidas (cantidad 0 / PEND / OTROS) · fechas '+fm(ds[0])+(ds[0]!==ds[ds.length-1]?' – '+fm(ds[ds.length-1]):'')+(DF.count()?' · '+DF.count()+' fechas corregidas':'')+'.');
 return {file:new File(['\uFEFF'+out.join('\n')],'packing.csv',{type:'text/csv'}),kept:out.length-1,skip,details:det};}
function askDateFmt(amb){return new Promise((res,rej)=>{
 const mk=(f)=>{const v=amb.map(t=>f(t)).sort((a,b)=>a-b),fm=ms=>{const d=new Date(ms);return p2(d.getUTCDate())+'/'+p2(d.getUTCMonth()+1)+'/'+d.getUTCFullYear();};return {a:v[0],b:v[v.length-1],txt:fm(v[0])+(v[0]!==v[v.length-1]?' al '+fm(v[v.length-1]):'')};};
 const A=mk(t=>Date.UTC(t.Y,t.M-1,t.D)),B=mk(t=>Date.UTC(t.Y,t.D-1,t.M)),hoy=Date.now(),recA=Math.abs(hoy-A.b)<=Math.abs(hoy-B.b);
 const o=document.createElement('div');o.id='opModal';
 o.innerHTML='<div class="opbox" style="width:min(560px,94vw)"><div class="ophead">LAS FECHAS DEL ARCHIVO SON AMBIGUAS<br><span style="font-size:13px;font-weight:400">Ej.: 08/09 puede ser 8 de septiembre o 9 de agosto. ¿Cómo las leo?</span></div>'+
  '<div class="opbtns" style="flex-direction:column;gap:14px"><button data-f="dmy" style="width:100%">DÍA / MES<br><span style="font-weight:400;font-size:12px">'+A.txt+(recA?' · RECOMENDADO (más cercana a hoy)':'')+'</span></button>'+
  '<button data-f="mdy" style="width:100%">MES / DÍA<br><span style="font-weight:400;font-size:12px">'+B.txt+(!recA?' · RECOMENDADO (más cercana a hoy)':'')+'</span></button></div><a href="#" class="opcancel">Cancelar la carga</a></div>';
 o.addEventListener('click',e=>{const b=e.target.closest('button[data-f]');if(b){o.remove();res(b.dataset.f);}else if(e.target.closest('.opcancel')){e.preventDefault();o.remove();rej(new Error('Carga cancelada: no se confirmó el formato de fecha.'));}});
 document.body.appendChild(o);});}
window.rutaTienda=c=>{const r=RIDX.get(key(c));return r?r.tienda:'';};
window.__packingCSV=async function(file,opt){
 if(/\.(csv|txt)$/i.test(file.name)){
  const head=await file.slice(0,3000).text();
  if(/Und_Cantidad Conv/i.test(head)&&/,LPN,/.test(head)&&/Orden_ID/.test(head)){
   const L=(await file.text()).split(/\r?\n/),Hd=L[0].replace(/^\uFEFF/,'').split(','),ci=n=>Hd.indexOf(n),det=[];
   const g={f:ci('Fecha'),u:ci('Usuario'),h:ci('hora'),s:ci('Hora de selección'),o:ci('Orden_ID'),c:ci('Und_Cantidad Conv'),k:ci('SKU'),l:ci('LPN'),ld:ci('LPN_Destino'),x:ci('Ubicacion'),i:ci('Instalacion'),t:ci('Tienda')};
   for(let i=1;i<L.length;i++){if(!L[i])continue;const a=L[i].split(',');const t=dt(a[g.s]);if(!t)continue;
    det.push({d:a[g.f],u:a[g.u],h:+a[g.h],ts:Date.UTC(t.Y,t.M-1,t.D,t.h,t.m,t.s),orden:a[g.o],lpn:a[g.l]||'',lpnd:a[g.ld]||'',sku:a[g.k]||'',desc:'',ubicacion:a[g.x]||'',cantidad:+a[g.c]||0,instalacion:a[g.i]||'',tienda:a[g.t]||window.rutaTienda(a[g.i])||''});}
   if(!(opt&&opt.silent))window.__toast('Archivo liviano de packing reconocido: '+det.length.toLocaleString('es-PE')+' líneas.');
   return {file,kept:det.length,skip:0,details:det};}
  const txt=await readTextAny(file),h0=csvLine(txt.slice(0,txt.search(/\r?\n/)>0?txt.search(/\r?\n/):4000).replace(/^\uFEFF/,''),(txt.slice(0,3000).split(';').length>txt.slice(0,3000).split(',').length)?';':',').map(nrm);
  if(h0.includes('CANTIDAD CONV')&&h0.includes('SOLI.')&&h0.includes('FILTRO')&&h0.includes('ZONA'))return processedPacking(file,txt);
 }
 if(!window.RUTAS.length)throw new Error('Primero carga RUTAS (Gestionar datos → Rutas) para identificar la ZONA.');
 const big=file.size>5e6;if(big)window.__toast('Leyendo archivo de packing (puede tardar unos segundos)…');
 await new Promise(r=>setTimeout(r,60));
 const ab=await file.arrayBuffer();
 const names=XLSX.read(ab,{type:'array',bookSheets:true}).SheetNames;
 const pri=['EXCEL A SUBIR','HOJA1','LOGICA'],cand=[];
 pri.forEach(p=>{const n=names.find(x=>nrm(x)===p);if(n)cand.push(n);});names.forEach(n=>{if(!cand.includes(n))cand.push(n);});
 let rows=null,H=null,ix=null;
 for(const nm of cand){
  const wb=XLSX.read(ab,{type:'array',sheets:[nm],cellFormula:false,cellHTML:false,cellStyles:false});
  const sh=wb.Sheets[nm];if(!sh)continue;
  const rr=XLSX.utils.sheet_to_json(sh,{header:1,raw:true,defval:null});
  const hh=(rr[0]||[]).map(nrm),c=n=>hh.indexOf(n);
  const t={iO:c('NUMERO DE ORDEN'),iS:c('CODIGO DE ARTICULO'),iD:c('INSTALACION DE DESTINO'),iU:c('CANTIDAD EMPAQUETADA'),iX:c('DE UBICACION'),iC:c('NUMERO DE CONTENEDOR'),iT:c('REGISTRO DE HORA DE MODIFICACION'),iUs:c('USUARIO DE MODIFICACION'),iL:c('NUMERO DE LPN DE ENTRADA'),iDs:c('DESCRIPCION DE ARTICULO')};
  if(['iO','iS','iD','iU','iX','iC','iT','iUs'].every(k=>t[k]>=0)){rows=rr;ix=t;break;}
 }
 if(!rows)throw new Error('El archivo no parece de PACKING (faltan columnas como Cantidad empaquetada o Número de contenedor).');
 const TT=rows.map((r,i)=>i&&r?dt(r[ix.iT]):null);
 const DF=await dateFixer(TT),fixT=DF.fix;
 const out=['Fecha,Categoria,Usuario,Turno,Area,Tipo_Pedido,Orden_ID,Und_Cantidad Conv,Und_cantidad,Und_PRE PACK.,hora,Hora de selección,SKU,LPN,LPN_Destino,Ubicacion,Instalacion,Tienda'],det=[];let skip=0;
 const cl=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').replace(/[",]/g,' ').trim();
 for(let i=1;i<rows.length;i++){const r=rows[i];if(!r||r[ix.iO]==null)continue;
  const sku=String(r[ix.iS]==null?'':r[ix.iS]).trim(),dest=String(r[ix.iD]==null?'':r[ix.iD]).trim(),cont=String(r[ix.iC]==null?'':r[ix.iC]);
  const zona=window.rutaZona(dest)||'OTROS',D=(zona==='OTROS'||!cont.startsWith('508'))?0:(Number(r[ix.iU])||0);
  if(D<=0){skip++;continue;}
  const cat=(window.masterCat&&window.masterCat(sku))||(sku.length===5?'MATERIALES':INS.includes(sku.slice(0,7))?'INSUMO':sku[0]==='9'?'ACC':'CALZ');
  const l12=sku.length===12,mu=parseInt(sku.substr(10,2),10),E=l12?D:(isNaN(mu)?D:mu*D),G=l12?0:E;
  const x=String(r[ix.iX]||'').trim().toUpperCase(),area=((x[0]==='S'||x[0]==='A')?x.slice(0,3):x.slice(0,5))||'SIN AREA';
  const t=fixT(TT[i]);if(!t){skip++;continue;}
  const fecha=t.Y+'-'+p2(t.M)+'-'+p2(t.D),usr=String(r[ix.iUs]||'').trim(),ord=String(r[ix.iO]);
  out.push([fecha,cat,cl(usr),(t.h>=18||t.h<6)?'NOCHE':'DIA',cl(area),zona,cl(ord),E,D,G,t.h,fecha+' '+p2(t.h)+':'+p2(t.m)+':'+p2(t.s),cl(sku),cl(r[ix.iL]),cl(cont),cl(x),cl(dest),cl(window.rutaTienda(dest))].join(','));
  det.push({d:fecha,u:usr.replace(/[",\r\n]/g,' '),h:t.h,ts:Date.UTC(t.Y,t.M-1,t.D,t.h,t.m,t.s),orden:ord,lpn:String(r[ix.iL]==null?'':r[ix.iL]),lpnd:cont.trim(),sku,desc:String(r[ix.iDs]==null?'':r[ix.iDs]),ubicacion:x,cantidad:E,instalacion:dest,tienda:window.rutaTienda(dest)});}
 if(out.length<2)throw new Error('Ninguna línea de PACKING cumple las condiciones (zona en RUTAS y contenedor embalado).');
 window.__toast('Packing: '+(out.length-1).toLocaleString('es-PE')+' líneas válidas · '+skip.toLocaleString('es-PE')+' omitidas (cantidad 0).');
 if(det.length){const ds=det.map(x=>x.d).sort(),fm=s=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
  window.__toast('📅 Fechas del archivo: '+fm(ds[0])+(ds[0]!==ds[ds.length-1]?' – '+fm(ds[ds.length-1]):'')+(DF.count()?' · se corrigieron '+DF.count()+' fechas con día y mes invertidos.':''));}
 const light=new File(['\uFEFF'+out.join('\n')],'packing.csv',{type:'text/csv'});
 if(file.size>5e6){const nm='PACKING_liviano_'+file.name.replace(/\.[^.]+$/,'')+'.csv';window.__toastLink('📉 Versión liviana: '+(file.size/1e6).toFixed(1)+' MB → '+(light.size/1e6).toFixed(1)+' MB.','Descargar CSV liviano',URL.createObjectURL(light),nm);}
 return {file:light,kept:out.length-1,skip,details:det};
};
})();
