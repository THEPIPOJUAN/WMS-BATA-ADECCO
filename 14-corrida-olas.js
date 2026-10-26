/* ===== Corrida de olas =====
   Lee el Excel de olas y genera la hoja DETALLE OLAS WMS (día de atención, prioridad, pisos). */
(function(){
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const DAY={VIERNES:0,SABADO:1,DOMINGO:2,LUNES:3,MARTES:4,MIERCOLES:5,JUEVES:6};
const OMIT=new Set(['PISO','PARED','DIS','ACT','SIN','RECLAMOS']);
const NXT={VIERNES:'Lunes',SABADO:'Lunes',DOMINGO:'Lunes',LUNES:'Martes',MARTES:'Miércoles',MIERCOLES:'Jueves',JUEVES:'Viernes'};
const atn=(s,d)=>{const x=NXT[norm(d)];return x?(String(s).trim()+' '+x).trim():'';};
const mult=s=>{s=String(s).trim();if(s.length===15){const n=parseInt(s.slice(10,12),10);return isNaN(n)?1:n;}return 1;};
const num=v=>{const n=Number(v);return isNaN(n)?0:n;};
let OUT=null;
function sheet(wb,name){const k=wb.SheetNames.find(n=>norm(n)===name);if(!k)throw new Error('Falta la hoja '+name);return wb.Sheets[k];}
function piso(a,u){if(a==='MZN04')return '4TO PISO';if(a==='MZN03')return '3ER PISO';if(a==='MZN02')return '2DO PISO';if(OMIT.has(a))return 'OMITIR';if(u.startsWith('CDBUFFER-C'))return 'BUFFER-C';return '1ER PISO';}
function best(m){let b='',v=-Infinity;[...m.keys()].sort().forEach(k=>{if(m.get(k)>v){v=m.get(k);b=k;}});return b;}
function run(wb){
 const P=XLSX.utils.sheet_to_json(sheet(wb,'PEND'),{header:1,raw:true,defval:null}).slice(1);
 const S=XLSX.utils.sheet_to_json(sheet(wb,'STOCK'),{header:1,raw:true,defval:null}).slice(1);
 const R=XLSX.utils.sheet_to_json(sheet(wb,'RUTA Y PRIORIDAD'),{raw:true,defval:null});
 // stock
 const tot=new Map(),niv=new Map(),nbf=new Map();
 S.forEach(r=>{const a=norm(r[0]),sku=String(r[1]==null?'':r[1]).trim(),u=norm(r[3]);if(!sku)return;
  const n=piso(a,u);if(n==='OMITIR')return;const nb=(a==='CDBUFFER'&&u.includes('CDBUFFER-C'))?'BUFFER-C':(a==='CDBUFFER'&&(u.includes('CDBUFFER-A')||u.includes('CDBUFFER-B')))?'BUFFER-A-B':n;
  const d=(num(r[4])-num(r[5]))*mult(sku);tot.set(sku,(tot.get(sku)||0)+d);
  if(!niv.has(sku))niv.set(sku,new Map());niv.get(sku).set(n,(niv.get(sku).get(n)||0)+d);
  if(!nbf.has(sku))nbf.set(sku,new Map());nbf.get(sku).set(nb,(nbf.get(sku).get(nb)||0)+d);});
 // ruta (clave por nombre normalizado)
 const rm=new Map();
 R.forEach(r=>{const o={};Object.keys(r).forEach(k=>o[norm(k)]=r[k]);const ord=Number(o['ORDEN']);if(!isNaN(ord)&&!rm.has(ord))rm.set(ord,o);});
 const rows=P.filter(r=>r[0]!=null||r[2]!=null).map(r=>{
  const sku=String(r[2]==null?'':r[2]).trim(),no=Number(r[0]),ru=rm.get(no)||{};
  const sol=num(r[3]),asg=num(r[4]),pend=sol-asg,sem=String(ru['SEMANA']==null?'':ru['SEMANA']).trim(),dia=String(ru['DIA CORREO']==null?'':ru['DIA CORREO']).trim();
  const sn=parseInt((sem.match(/\d+/)||[])[0],10),dn=norm(dia),lpv=ru['LIMA / PROV']||(window.rutaZona?window.rutaZona(r[5]):'')||'',lp=norm(lpv);
  return {no,sku,sol,asg,pend,pc:pend*mult(sku),est:r[1],tda:r[5],desc:r[6],lp:lpv,ruta:ru['RUTA']||(window.rutaNombre?window.rutaNombre(r[5]):''),sd:(sem+' '+dia).trim(),at:atn(sem,dia),etq:String(ru['ETIQUETA']==null?'':ru['ETIQUETA']).trim(),nom:ru['NOMBR'],
   k:[isNaN(sn)?99999:sn,dn in DAY?DAY[dn]:99,lp.startsWith('LIMA')?0:lp?1:2,isNaN(Number(ru['ORDEN']))?99999:Number(ru['ORDEN']),no,sku],disp:tot.get(sku)||0,
   a:niv.has(sku)?best(niv.get(sku)):'',ab:nbf.has(sku)?best(nbf.get(sku)):''};});
 // PRIORIDAD: semana/día más antiguo → Lima → Provincia
 rows.sort((x,y)=>{for(let i=0;i<6;i++){if(x.k[i]<y.k[i])return -1;if(x.k[i]>y.k[i])return 1;}return 0;});
 const rest=new Map(tot);let si=0,no_=0;
 rows.forEach((r,i)=>{r.pr=i+1;const e=norm(r.etq);
  if(e==='INSUMOS'||e==='UNIFORMES'){r.A=e;r.AB=e;r.ok=true;si++;return;}
  const d=rest.get(r.sku)||0;
  if(r.pc<=0||d<=0||d<r.pc){if(r.pc>0&&d>0)rest.set(r.sku,0);r.A='SIN STOCK';r.AB='SIN STOCK';r.ok=false;no_++;return;}
  rest.set(r.sku,d-r.pc);r.A=r.a||'SIN STOCK';r.AB=r.ab||'SIN STOCK';r.ok=true;si++;});
 const H=['PRIORIDAD','LIMA/PROV','RUTA','SEMANA-DIA','DÍA DE ATENCIÓN','ETIQUETA','TDA DESTINO','NOMBRE TIENDA','N° ORDEN','SKU','DESCRIPCIÓN','ESTADO ORDEN','CANT. SOL','CANT. ASIG','CANT. PEND','PEND. CONVERTIDO','NIVEL (PISO)','NIVEL + BUFFER','DISP. CONVERTIDO'];
 const out=rows.map(r=>[r.pr,r.lp,r.ruta,r.sd,r.at,r.etq,r.tda,r.nom,r.no,r.sku,r.desc,r.est,r.sol,r.asg,r.pend,r.pc,r.A,r.AB,r.disp]);
 return {H,out,si,no:no_,first:rows[0]&&rows[0].sd,total:rows.length};
}
const inp=document.getElementById('olaInput'),st=document.getElementById('olaStatus'),btn=document.getElementById('olaDownloadBtn');
async function procOla(e){
 const file=e.target.files[0];if(!file)return;st.textContent='Procesando corrida…';btn.disabled=true;
 try{
  if(!window.XLSX)throw new Error('Motor Excel no disponible.');
  await new Promise(r=>setTimeout(r,30));
  OUT=run(XLSX.read(await file.arrayBuffer(),{type:'array'}));
  st.innerHTML='<b>'+file.name+'</b> · '+OUT.total.toLocaleString('es-PE')+' líneas · SÍ: <b>'+OUT.si.toLocaleString('es-PE')+'</b> · NO: <b>'+OUT.no.toLocaleString('es-PE')+'</b> · prioridad inicia en '+(OUT.first||'-');
  btn.disabled=false;const s2=document.getElementById('olaStatus2');if(s2)s2.innerHTML=st.innerHTML;window.renderOla&&window.renderOla(OUT);
 }catch(err){OUT=null;st.textContent='Error: '+err.message;const s2=document.getElementById('olaStatus2');if(s2)s2.textContent=st.textContent;}
 e.target.value='';
}
inp.addEventListener('change',procOla);const inp2=document.getElementById('olaInput2');if(inp2)inp2.addEventListener('change',procOla);
btn.addEventListener('click',()=>{if(!OUT)return;
 const ws=XLSX.utils.aoa_to_sheet([OUT.H].concat(OUT.out));ws['!cols']=OUT.H.map((h,i)=>({wch:[10,10,10,16,16,12,12,24,12,18,30,12,10,10,10,14,14,16,14][i]}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'DETALLE OLAS WMS');XLSX.writeFile(wb,'CORRIDA_OLA_WMS.xlsx');});
})();
