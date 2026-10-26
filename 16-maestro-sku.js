/* ===== Maestro de artículos (SKU) =====
   Categoría por SKU (Calzado, Accesorio, Insumo, Materiales) y lector de .xlsx pesados por partes. */
(function(){
const $$=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nrm=s=>{s=String(s==null?'':s);try{s=decodeURIComponent(escape(s));}catch(e){}return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();};
const NAME={CALZ:'CALZADO',ACC:'ACCESORIO',INSUMO:'INSUMO',MATERIALES:'MATERIALES'};
const sk=s=>String(s==null?'':s).trim();
function catCode(s){const v=nrm(s);if(v.startsWith('CALZ'))return 'CALZ';if(v.startsWith('ACC'))return 'ACC';if(v.startsWith('INSUM'))return 'INSUMO';if(v.startsWith('MATERIAL'))return 'MATERIALES';return '';}
window.MAESTRO=window.MAESTRO||[];window.MAESTRO_MAP={};
window.masterCat=s=>window.MAESTRO_MAP[sk(s)]||window.MAESTRO_MAP[sk(s).slice(0,7)]||'';
function rebuild(){const m={};window.MAESTRO.forEach(r=>{const c=catCode(r.cat);if(c)m[sk(r.sku)]=c;});window.MAESTRO_MAP=m;}
window.renderMaestro=function(){rebuild();const t=$$('maestroTable');if(!t)return;
 const q=nrm($$('mSearch')?$$('mSearch').value:'');
 const all=window.MAESTRO.filter(r=>!q||nrm([r.sku,NAME[catCode(r.cat)]||r.cat,r.desc].join(' ')).includes(q)),L=all.slice(0,400);
 t.innerHTML='<tr><th>SKU</th><th>Categoría</th><th class="name">Descripción</th><th></th></tr>'+L.map(r=>'<tr><td>'+esc(r.sku)+'</td><td>'+esc(NAME[catCode(r.cat)]||r.cat)+'</td><td class="name">'+esc(r.desc)+'</td><td><button class="mini-btn" data-e="'+esc(r.sku)+'">Editar</button><button class="mini-btn" data-d="'+esc(r.sku)+'">Eliminar</button></td></tr>').join('')+(all.length>L.length?'<tr><td colspan="4">Se muestran 400 de '+all.length.toLocaleString('es-PE')+'. Usa el buscador para ver más.</td></tr>':'');
 const n=k=>window.MAESTRO.filter(r=>catCode(r.cat)===k).length;
 const m=window.MAESTRO.length?'Maestro SKU: '+window.MAESTRO.length.toLocaleString('es-PE')+' (Calzado '+n('CALZ')+' · Accesorio '+n('ACC')+' · Insumo '+n('INSUMO')+' · Materiales '+n('MATERIALES')+')':'Sin maestro SKU cargado.';
 ['maestroStatus','maestroStatus2'].forEach(i=>{if($$(i))$$(i).textContent=m;});};
function catFromAny(v,code){
 const c0=catCode(v);if(c0)return c0;const x=nrm(v),k=sk(code);
 if(x==='NON FOOTWEAR')return 'ACC';if(x==='FOOTWEAR')return 'CALZ';
 if(x==='NON COMMERCIAL')return k.length===5?'MATERIALES':(k[0]==='9'?'INSUMO':'');
 return '';}
function parseMaestro(rows){
 let hi=-1,iS=-1,iC=-1,iD=-1;
 for(let i=0;i<Math.min(rows.length,20)&&hi<0;i++){const H=Array.from(rows[i]||[],v=>nrm(v));
  const s=H.findIndex(x=>['SKU','CODARTICULO','CODIGO','CODIGO SKU','CODIGO DE ARTICULO','CODIGO ARTICULO','COD ARTICULO','COD SKU','ARTICULO','ITEM'].includes(x));
  let c=H.findIndex(x=>x.startsWith('CATEGORIA')||x==='CAT');if(c<0)c=H.findIndex(x=>x==='G. GENDER');
  if(s>=0&&c>=0){hi=i;iS=s;iC=c;iD=H.findIndex(x=>x==='SUBCATEGORY RIMS'||x.startsWith('DESCRIP')||x==='NOMBRE');}}
 if(hi<0)throw new Error('No encontré las columnas de SKU/Código de artículo y Categoría (o G. Gender) en el archivo.');
 const out=[];let bad=0;
 rows.slice(hi+1).forEach(r=>{if(!r)return;const s=sk(r[iS]);if(!s)return;const c=catFromAny(r[iC],s);if(!c){bad++;return;}out.push({sku:s,cat:c,desc:iD>=0?sk(r[iD]):''});});
 if(!out.length)throw new Error('El archivo no tiene artículos con categoría válida.');
 return {out,bad};
}
// ---- lector de .xlsx pesados por partes (sin cargar todo en memoria) ----
async function zipEntries(file){
 const size=file.size,tail=await file.slice(Math.max(0,size-66000),size).arrayBuffer(),dv=new DataView(tail);let e=-1;
 for(let i=tail.byteLength-22;i>=0;i--){if(dv.getUint32(i,true)===0x06054b50){e=i;break;}}
 if(e<0)throw new Error('El archivo .xlsx no es válido.');
 const cnt=dv.getUint16(e+10,true),cdSize=dv.getUint32(e+12,true),cdOff=dv.getUint32(e+16,true);
 const cd=await file.slice(cdOff,cdOff+cdSize).arrayBuffer(),cv=new DataView(cd),c8=new Uint8Array(cd),map={};let p=0;
 for(let k=0;k<cnt;k++){if(cv.getUint32(p,true)!==0x02014b50)break;
  const meth=cv.getUint16(p+10,true),csz=cv.getUint32(p+20,true),nl=cv.getUint16(p+28,true),el=cv.getUint16(p+30,true),cl=cv.getUint16(p+32,true),off=cv.getUint32(p+42,true);
  map[new TextDecoder().decode(c8.subarray(p+46,p+46+nl))]={meth,csz,off};p+=46+nl+el+cl;}
 return map;}
async function entryStream(file,ent){
 const lv=new DataView(await file.slice(ent.off,ent.off+30).arrayBuffer()),st=ent.off+30+lv.getUint16(26,true)+lv.getUint16(28,true);
 let s=file.slice(st,st+ent.csz).stream();if(ent.meth===8)s=s.pipeThrough(new DecompressionStream('deflate-raw'));
 return s.pipeThrough(new TextDecoderStream());}
async function* chunks(rs){const rd=rs.getReader();for(;;){const {value,done}=await rd.read();if(done)return;yield value;}}
const unesc=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
const colIdx=s=>{let n=0;for(const ch of s)n=n*26+ch.charCodeAt(0)-64;return n-1;};
async function readSmall(file,zip,name){const ent=zip[name];if(!ent)return '';let t='';for await(const c of chunks(await entryStream(file,ent)))t+=c;return t;}
async function xlsxStream(file,pick,onRow){
 const zip=await zipEntries(file),wbx=await readSmall(file,zip,'xl/workbook.xml'),rel=await readSmall(file,zip,'xl/_rels/workbook.xml.rels');
 const sheets=[...wbx.matchAll(/<sheet [^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/g)].map(m=>({name:unesc(m[1]),rid:m[2]}));
 const sel=sheets.find(s=>pick(s.name))||sheets[0],rr=[...rel.matchAll(/<Relationship [^>]*?>/g)].map(m=>m[0]).find(x=>x.includes('Id="'+sel.rid+'"'));
 let tg=(rr.match(/Target="([^"]+)"/)||[])[1].replace(/^\//,'');const path=tg.startsWith('xl/')?tg:'xl/'+tg;
 const sst=[];const sx=await readSmall(file,zip,'xl/sharedStrings.xml'),sre=/<si>([\s\S]*?)<\/si>/g;let m;
 while((m=sre.exec(sx))){let s='';const tr=/<t[^>]*>([\s\S]*?)<\/t>/g;let t;while((t=tr.exec(m[1])))s+=t[1];sst.push(unesc(s));}
 const cellRe=/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;let buf='';
 const handle=rx=>{const mr=rx.match(/<row [^>]*?r="(\d+)"/),arr=[];let has=false,c;cellRe.lastIndex=0;
  while((c=cellRe.exec(rx))){if(c[3]===undefined)continue;const t=(c[2].match(/t="(\w+)"/)||[])[1];let v;
   if(t==='s'){const i=c[3].match(/<v>(\d+)<\/v>/);v=i?sst[+i[1]]:undefined;}
   else if(t==='inlineStr'){v=unesc([...c[3].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join(''));}
   else{const i=c[3].match(/<v>([\s\S]*?)<\/v>/);v=i?unesc(i[1]):undefined;if(i&&(t===undefined||t==='n')&&v!==''&&!isNaN(v))v=Number(v);}
   if(v!==undefined&&v!==''){arr[colIdx(c[1])]=v;has=true;}}
  return has?[mr?+mr[1]:0,arr]:null;};
 for await(const c of chunks(await entryStream(file,zip[path]))){buf+=c;let pos=0,i;
  while((i=buf.indexOf('</row>',pos))>=0){const r=handle(buf.slice(pos,i+6));pos=i+6;if(r&&onRow(r[0],r[1])===false)return;}
  buf=buf.slice(pos);}
}
window.__xlsxStream=xlsxStream;
async function cargar(e){const f=e.target.files[0];if(!f)return;
 try{
  let rows;
  if(/\.xlsx$/i.test(f.name)&&f.size>8e6){window.__toast('Leyendo archivo pesado ('+Math.round(f.size/1e6)+' MB) por partes…');rows=[];await xlsxStream(f,n=>nrm(n)==='MAESTRO',(rn,arr)=>{rows.push(arr);});}
  else{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null});}
  const {out,bad}=parseMaestro(rows);
  const m=new Map(window.MAESTRO.map(r=>[sk(r.sku),r])),inFile=new Set();let nuevos=0,act=0;
  out.forEach(r=>{const k=sk(r.sku);inFile.add(k);const o=m.get(k);if(!o)nuevos++;else if(catCode(o.cat)!==r.cat||(r.desc&&o.desc!==r.desc))act++;m.set(k,{sku:k,cat:r.cat,desc:r.desc||(o?o.desc:'')});});
  let cons=0;m.forEach((v,k)=>{if(!inFile.has(k))cons++;});
  window.MAESTRO=[...m.values()];window.renderMaestro();
  window.__toast('Maestro SKU: '+nuevos+' nuevos · '+act+' actualizados · '+cons+' conservados (no estaban en el archivo)'+(bad?' · '+bad+' sin categoría válida omitidos':'')+'.');
  if(f.size>8e6)window.__toast('📉 Archivo liviano: '+Math.round(f.size/1e6)+' MB → '+(JSON.stringify(window.MAESTRO).length/1e6).toFixed(1)+' MB guardados (solo artículo, categoría y subcategoría).');
  await window.saveCloud();
 }catch(err){window.__toast('❌ '+err.message);}
 e.target.value='';}
$$('maestroInput').addEventListener('change',cargar);$$('maestroInput2').addEventListener('change',cargar);
$$('mSearch').addEventListener('input',window.renderMaestro);
const form=$$('mForm');
$$('mAddBtn').onclick=()=>{$$('mSku').value='';$$('mDesc').value='';$$('mCat').value='CALZ';form.style.display='grid';$$('mSku').focus();};
$$('mCancelBtn').onclick=()=>{form.style.display='none';};
$$('mSaveBtn').onclick=async()=>{const s=sk($$('mSku').value);if(!s){window.__toast('Escribe el SKU.');return;}
 if(!window.requestUploadAccess())return;const r={sku:s,cat:$$('mCat').value,desc:sk($$('mDesc').value)};
 const i=window.MAESTRO.findIndex(x=>sk(x.sku)===s);if(i>=0)window.MAESTRO[i]=r;else window.MAESTRO.push(r);form.style.display='none';window.renderMaestro();await window.saveCloud();};
$$('maestroTable').addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.e){const r=window.MAESTRO.find(x=>sk(x.sku)===sk(b.dataset.e));if(!r)return;$$('mSku').value=r.sku;$$('mCat').value=catCode(r.cat)||'CALZ';$$('mDesc').value=r.desc||'';form.style.display='grid';}
 if(b.dataset.d){if(!confirm('¿Eliminar el SKU '+b.dataset.d+' del maestro?')||!window.requestUploadAccess())return;window.MAESTRO=window.MAESTRO.filter(x=>sk(x.sku)!==sk(b.dataset.d));window.renderMaestro();await window.saveCloud();}});
$$('mDownBtn').onclick=()=>{if(!window.MAESTRO.length)return;const ws=XLSX.utils.aoa_to_sheet([['SKU','CATEGORIA','DESCRIPCION']].concat(window.MAESTRO.map(r=>[r.sku,NAME[catCode(r.cat)]||r.cat,r.desc||''])));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'MAESTRO SKU');XLSX.writeFile(wb,'MAESTRO_SKU.xlsx');};
window.renderMaestro();
})();
