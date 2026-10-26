/* ===== Totales generales =====
   Agrega la fila TOTAL GENERAL al final de las tablas de PICKING y PACKING. */
/* =====================================================================
   TOTALES GENERALES · agrega la fila "TOTAL GENERAL" al final de las tablas
   de PICKING y PACKING. Se recalcula sola cada vez que la tabla se redibuja.
   Los promedios y rendimientos se calculan con los datos reales
   (unidades ÷ horas), no sumando redondeos.
   ===================================================================== */
(function(){
const nrm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const num=t=>{const s=String(t).replace(/[\s,%+]/g,'');if(s===''||s==='-'||s==='—')return 0;const n=parseFloat(s);return isNaN(n)?0:n;};
const sum=(a,k)=>a.reduce((s,r)=>s+(Number(r[k])||0),0);
const div=(a,b)=>b>0?a/b:0;
const body=t=>[...t.rows].filter(r=>!r.classList.contains('trow-total')&&r.rowIndex>0);
const colSum=(t,i)=>body(t).reduce((s,r)=>s+(r.cells[i]?num(r.cells[i].textContent):0),0);
const meta=()=>{try{return activeMeta()||160;}catch(e){return 125;}};
const P=(x)=>Math.round(x)+'%';
// cada función recibe (tabla, encabezados normalizados) y devuelve el texto de cada celda
const SPEC={
 mgmtTable:(t,H)=>{const a=lastMgmtRows||[],u=sum(a,'units'),ho=sum(a,'hhOp'),he=sum(a,'hhEff');
  return H.map(h=>h==='PERIODO'?'TOTAL GENERAL':h==='UNIDADES'?fmt(u):h==='PROD. OPERATIVA'?fmt(div(u,ho)):h==='PROD. EFECTIVA'?fmt(div(u,he)):h==='UTILIZACION'?P(div(he,ho)*100):h==='HH OPER.'?fmt(ho):h==='HH EFECT.'?fmt(he):h==='SESIONES'?fmt(sum(a,'tasks')):'-');},
 catMixTable:(t,H)=>{const c=H.indexOf('CALZADO'),a=H.indexOf('ACCESORIO'),p=H.indexOf('PP'),T=H.indexOf('TOTAL'),tot=colSum(t,T),v=i=>colSum(t,i);
  return H.map((h,i)=>i===0?'TOTAL GENERAL':h==='CALZADO'||h==='ACCESORIO'||h==='PP'||h==='TOTAL'?fmt(v(i)):h==='% CALZ.'?P(div(v(c),tot)*100):h==='% ACC.'?P(div(v(a),tot)*100):h==='% PP'?P(div(v(p),tot)*100):'-');},
 startTable:(t,H)=>H.map((h,i)=>i===0?'TOTAL GENERAL':h==='USUARIO'?body(t).length+' registros':'-'),
 userDayTable:(t,H)=>{const a=lastUserDay||[],u=sum(a,'units'),ho=sum(a,'hhOp'),he=sum(a,'hhEff');
  return H.map(h=>h==='#'?'':h==='USUARIO'?'TOTAL GENERAL':h==='HH OPER.'?fmt(ho):h==='PRODUCCION'?fmt(u):h==='PROD. OPERATIVA'?fmt(div(u,ho)):h==='CUMPL.'?P(div(div(u,ho),meta())*100):h==='PROD. EFECTIVA'?fmt(div(u,he)):h==='UTILIZ.'?P(div(he,ho)*100):'-');},
 jefWeekTable:(t,H)=>{const a=lastJefWeekRows||[],tot=sum(a,'total'),ho=sum(a,'hhOp'),he=sum(a,'hhEff'),D={LUNES:'lunes',MARTES:'martes',MIERCOLES:'miercoles',JUEVES:'jueves',VIERNES:'viernes',SABADO:'sabado',DOMINGO:'domingo'};
  return H.map(h=>h==='USUARIO'?'TOTAL GENERAL':D[h]?fmt(sum(a,D[h])):h==='TOTAL'?fmt(tot):h==='HH OPER.'?fmt(ho):h==='PROD. OPER.'?fmt(div(tot,ho)):h==='HH EFECT.'?fmt(he):h==='PROD. EFECT.'?fmt(div(tot,he)):h==='UTILIZ.'?P(div(he,ho)*100):'-');},
 rankTable:(t,H)=>{const a=lastRanking||[],u=sum(a,'units'),ho=sum(a,'hhOp'),he=sum(a,'hhEff');
  return H.map(h=>h==='#'?'':h==='USUARIO'?'TOTAL GENERAL':h==='UNIDADES'?fmt(u):h==='HH OPER.'?fmt(ho):h==='UND/HH OPER.'?fmt(div(u,ho)):h==='CUMPL.'?P(div(div(u,ho),meta())*100):h==='UTILIZ.'?P(div(he,ho)*100):'-');},
 supHourTable:(t,H)=>{const a=lastSupervisorRows||[],u=sum(a,'units'),hh=sum(a,'hh'),last=a[a.length-1]||{};
  return H.map(h=>h==='HORA'?'TOTAL GENERAL':h==='UNID.'?fmt(u):h==='ACUM.'?fmt(last.cumUnits||u):h==='UND/HH'?fmt(div(u,hh)):h==='BRECHA'?((last.gap>0?'+':'')+fmt(last.gap||0)):'-');},
 supHeatTable:(t,H)=>H.map((h,i)=>i===0?'TOTAL GENERAL':h.startsWith('PROM')?'-':fmt(colSum(t,i))),
 heatDetailTable:(t,H)=>H.map((h,i)=>h==='FECHA'?'TOTAL GENERAL':h==='ORDEN'?body(t).length+' líneas':h==='CANTIDAD'?fmt(colSum(t,i)):'-')
};
function apply(t,fn){
 t.querySelectorAll('tr.trow-total').forEach(r=>r.remove());
 const head=t.rows[0];if(!head||head.cells.length<3||body(t).length<1)return;
 const H=[...head.cells].map(c=>nrm(c.textContent)),cells=fn(t,H);
 const tr=document.createElement('tr');tr.className='trow-total';
 cells.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i>0&&/^[-+]?[\d.,]+%?$/.test(v))td.className='num';tr.appendChild(td);});
 (t.tBodies[0]||t).appendChild(tr);
}
Object.keys(SPEC).forEach(id=>{const t=document.getElementById(id);if(!t)return;
 const obs=new MutationObserver(()=>{obs.disconnect();try{apply(t,SPEC[id]);}catch(e){}obs.observe(t,{childList:true,subtree:false});});
 obs.observe(t,{childList:true});apply(t,SPEC[id]);});
})();
