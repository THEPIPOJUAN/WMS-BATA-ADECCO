/* ===== Estado global y utilidades =====
   Variables de datos, metas por defecto (Picking 160 und/h), formatos numéricos y fechas/semanas. */
const $=id=>document.getElementById(id);
let DATA=[], HIST_DATA=[], DAY_DATA=[], STATS={}, HIST_META=[], DAY_META=[], HIST_WARNINGS=[];
let HIST_DETAILS=[], DAY_DETAILS=[]; // Detalle a nivel de línea (orden/LPN/SKU/ubicación), solo para archivos en formato Allocation.
let selectedHeatUsers=new Set(); // Usuarios seleccionados en la matriz de Supervisión (para comparar su evolución arriba).
function allDetails(){ return HIST_DETAILS.length ? HIST_DETAILS.concat(DAY_DETAILS) : DAY_DETAILS; }
let lastRanking=[], lastUserDay=[], lastSupervisorRows=[], lastHeatmapRows=[], lastMgmtRows=[], lastJefWeekRows=[];
const METHODOLOGY_VERSION='PICKING_WMS_METHODOLOGY_V2_0811';
const DEFAULT_SETTINGS={
  methodologyVersion:METHODOLOGY_VERSION,
  title:'Logística Picking & Packing WMS',
  subtitle:'Reporte ejecutivo web · datos centralizados y actualización controlada',
  meta:160,
  dailyTarget:29400,
  startHour:8,
  endHour:19,
  lowThr:100,
  highThr:143,
  gapMinutes:10,
  opStartTime:'08:11',
  metaPP:60,
  prodMode:'operational',
  supLabel:'Uso operativo'
};
let SETTINGS={...DEFAULT_SETTINGS};
const fmt=n=>Math.round(n).toLocaleString('es-PE');
const fmt1=n=>Math.round(Number(n)||0).toLocaleString('es-PE');
const uniq=a=>[...new Set(a)].sort((x,y)=>String(x).localeCompare(String(y),'es',{numeric:true}));
function weekStart(d){
  const x=new Date(d+'T00:00:00Z'), day=(x.getUTCDay()+6)%7;
  x.setUTCDate(x.getUTCDate()-day); return x.toISOString().slice(0,10);
}
function isoWeekNumber(d){
  const x=new Date(d+'T00:00:00Z');
  x.setUTCHours(0,0,0,0);
  x.setUTCDate(x.getUTCDate()+3-((x.getUTCDay()+6)%7));
  const week1=new Date(Date.UTC(x.getUTCFullYear(),0,4));
  return 1+Math.round(((x-week1)/86400000-3+((week1.getUTCDay()+6)%7))/7);
}
function weekFilterKey(d){
  const ws=weekStart(d);
  return ws;
}
function weekFilterLabel(ws){
  return `Sem ${isoWeekNumber(ws)} · ${labelDate(ws)}`;
}
function labelDate(d){const [y,m,da]=d.split('-');return `${da}/${m}/${y}`}
function monthName(k){
  const [y,m]=k.split('-').map(Number);
  return new Intl.DateTimeFormat('es',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));
}
function monthFilterLabel(k){
  const [y,m]=String(k).split('-').map(Number);
  const name=new Intl.DateTimeFormat('es',{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));
  return name.charAt(0).toUpperCase()+name.slice(1)+' '+y;
}
function turnoKey(t){const s=String(t==null?'':t).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();return s==='NOCHE'?'NOCHE':'DIA';}
function multiLabel(type,v){
  if(type==='turno') return v==='NOCHE'?'Noche':'Día';
  if(type==='day') return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][new Date(v+'T00:00:00Z').getUTCDay()]+' '+labelDate(v);
  if(type==='month') return monthFilterLabel(v);
  if(type==='week') return weekFilterLabel(v);
  if(type==='cat') return v==='PP'?'PP CAJAS':String(v);
  return String(v);
}
function multiDefaultLabel(type){
  return ({day:'Todos',month:'Todos',week:'Todas',cat:'Todas',user:'Todos',area:'Todas',tipo:'Todos',turno:'Todos'})[type]||'Todos';
}
function colorFor(v,meta){return v>=meta?'#168a50':v>=meta*.88?'#d68b18':'#e31b2a'}
