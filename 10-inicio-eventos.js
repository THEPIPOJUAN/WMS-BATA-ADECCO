/* ===== Inicio y eventos =====
   Arranque de la pantalla y conexión de botones principales. Debe cargarse después de los módulos 02 a 09. */
function debounce(fn,ms=120){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms)}}
const renderDeb=debounce(render);
loadSettings();
applySettingsToInputs();
updateLoadStatuses();
$('dash').style.display='none';
['mgmtLevel','prodMode'].forEach(id=>$(id).addEventListener('change',renderDeb));
['day','month','week','cat','user','area','tipo','turno'].forEach(type=>{
  $(type+'Btn').addEventListener('click',e=>{e.stopPropagation();toggleMultiPanel(type)});
  $(type+'Panel').addEventListener('click',e=>e.stopPropagation());
});
$('userSearch').addEventListener('input',()=>renderMultiOptions('user'));
$('daySearch').addEventListener('input',()=>renderMultiOptions('day'));
document.querySelectorAll('[data-multi-all]').forEach(btn=>btn.addEventListener('click',()=>selectAllMulti(btn.dataset.multiAll)));
document.querySelectorAll('[data-multi-clear]').forEach(btn=>btn.addEventListener('click',()=>clearMulti(btn.dataset.multiClear)));
document.addEventListener('click',()=>{
  ['day','month','week','cat','user','area','tipo','turno'].forEach(type=>$(type+'Panel')?.classList.remove('show'));
});
$('dayDetail').addEventListener('change',()=>renderUserDay(filtered(),Number($('meta').value)||160));
['supDate','supDailyTarget','supStartHour','supEndHour'].forEach(id=>$(id).addEventListener('change',()=>{renderSupervisor(filtered(),Number($('meta').value)||160);renderSupervisorHeatmap(filtered());}));
$('captureBtn').addEventListener('click',openShareView);
$('exportMgmtBtn').addEventListener('click',exportMgmtTable);
$('exportJefWeekBtn').addEventListener('click',exportJefWeekTable);
$('jefWeekDetail').addEventListener('change',()=>renderJefWeekTable(filtered()));
document.querySelectorAll('.jefcat').forEach(el=>el.addEventListener('change',renderDeb));
document.querySelectorAll('.supcat').forEach(el=>el.addEventListener('change',()=>{renderSupervisor(filtered(),Number($('meta').value)||160);renderSupervisorHeatmap(filtered());}));
$('configBtn').addEventListener('click',openConfig);
$('closeConfigBtn').addEventListener('click',closeConfig);
$('saveConfigBtn').addEventListener('click',saveConfig);
$('resetConfigBtn').addEventListener('click',()=>{resetConfig(); closeConfig();});
$('exportConfigBtn').addEventListener('click',exportConfig);
$('importConfigInput').addEventListener('change',e=>{const f=e.target.files[0]; if(f) importConfigFile(f); e.target.value='';});
$('configModal').addEventListener('click',e=>{ if(e.target.id==='configModal') closeConfig(); });
$('clearBtn').onclick=()=>{
  ['day','month','week','cat','user','area','tipo','turno'].forEach(type=>clearMulti(type,false));
  if(DATA.length){$('d1').value=STATS.minDate;$('d2').value=STATS.maxDate;}
  $('meta').value=metaBase();
  render();
};

document.querySelectorAll('.viewtab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.viewtab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.viewsection').forEach(v=>v.classList.remove('active'));
    btn.classList.add('active');
    const target=document.getElementById('view-'+btn.dataset.view);
    if(target) target.classList.add('active');
    window.scrollTo({top:150,behavior:'smooth'});
  });
});

$('anotherBtn').onclick=()=>{
  const panel=$('upload');
  const opening=!panel.classList.contains('upload-open');
  if(opening && !requestUploadAccess()) return;
  panel.classList.toggle('upload-open',opening);
  panel.style.removeProperty('display');
  if(opening){panel.scrollIntoView({behavior:'smooth',block:'start'});}
  else {window.scrollTo({top:0,behavior:'smooth'});}
};
$('exportHeatmapBtn').onclick=()=>{
  if(lastHeatmapRows[0]?.mode==='day'){
    const dk=lastHeatmapRows[0].dayKeys;
    const rowsD=[['Categoria','Unidad','Usuario',...dk.map(labelDate),'TOTAL','PROM_DIA']];
    lastHeatmapRows.forEach(r=>rowsD.push([r.category,r.unit,r.user,...dk.map(d=>Math.round(r.days[d]||0)),Math.round(r.total),Math.round(r.avg)]));
    const csvD='\uFEFF'+rowsD.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const aD=document.createElement('a');aD.href=URL.createObjectURL(new Blob([csvD],{type:'text/csv;charset=utf-8'}));
    aD.download='Matriz_Supervision_por_dia.csv';aD.click();URL.revokeObjectURL(aD.href);
    return;
  }
  const start = lastHeatmapRows[0]?.start ?? Number($('supStartHour').value||SETTINGS.startHour);
  const end = lastHeatmapRows[0]?.end ?? Number($('supEndHour').value||SETTINGS.endHour);
  const header=['Fecha','Usuario'];
  for(let h=start; h<=end; h++) header.push(String(h).padStart(2,'0')+':00');
  header.push('TOTAL','PROM_H');
  const rows=[['Categoria','Unidad',...header]];
  lastHeatmapRows.forEach(r=>{
    const row=[r.category||supCategoryLabel(), r.unit||supUnitLabel(), labelDate(r.date), r.user];
    for(let h=start; h<=end; h++) row.push(Math.round(r.hours[h]||0));
    row.push(Math.round(r.total), Math.round(r.avg));
    rows.push(row);
  });
  const csv='\uFEFF'+rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='Matriz_Supervision_'+($('supDate').value||'detalle')+'.csv';a.click();URL.revokeObjectURL(a.href);
};
$('exportSupervisorBtn').onclick=()=>{
  const prodHead=isOnlyPP(supSelectedCats())?'Cajas_Hora':'Unidades_Hora';
  const prodUnit=isOnlyPP(supSelectedCats())?'cajas/HH':'und/HH';
  const rows=[['Categoria','Unidad','Fecha','Hora',prodHead,'Acumulado_Real','Acumulado_Esperado','Pickers_Activos','HH_'+(currentProdMode()==='effective'?'Efectivas':'Operativas'), 'Productividad_'+prodUnit,'Brecha','Cumplimiento']];
  lastSupervisorRows.forEach(r=>rows.push([
    r.category||supCategoryLabel(), r.unit||supUnitLabel(), labelDate(r.date),String(r.hour).padStart(2,'0')+':00',Math.round(r.units),Math.round(r.cumUnits),
    Math.round(r.expectedCum),r.pickers,fmt1(r.hh),fmt1(r.prod),Math.round(r.gap),fmt1(r.compliance)+'%'
  ]));
  const csv='\uFEFF'+rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='Avance_Horario_Picking_'+($('supDate').value||'detalle')+'.csv';a.click();URL.revokeObjectURL(a.href);
};
$('exportUserDayBtn').onclick=()=>{
  const rows=[['Categoria','Unidad','Fecha','Usuario',isOnlyPP(jefSelectedCats())?'Cajas_Dia':'Unidades_Dia','HH_Operativas','Prod_Operativa','HH_Efectivas','Prod_Efectiva','Utilizacion','Prod_Seleccionada','Cumplimiento_Meta']];
  const meta=Number($('meta').value)||160;
  lastUserDay.forEach(r=>rows.push([r.category||jefCategoryLabel(), r.unit||jefUnitLabel(), labelDate(r.date),r.k,Math.round(r.units),fmt1(r.hhOp),fmt1(r.prodOp),fmt1(r.hhEff),fmt1(r.prodEff),fmt1(r.utilization)+'%',fmt1(r.prod),fmt1(r.prod/meta*100)+'%']));
  const csv='\uFEFF'+rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='Picking_Usuario_Dia_'+($('dayDetail').value||'detalle')+'.csv';a.click();URL.revokeObjectURL(a.href);
};
$('exportBtn').onclick=()=>{
  const rows=[['Usuario',isOnlyPP(globalSelectedCats())?'Cajas':'Unidades','HH_Operativas','Prod_Operativa','HH_Efectivas','Prod_Efectiva','Utilizacion','Prod_Seleccionada']];
  lastRanking.forEach(r=>rows.push([r.k,Math.round(r.units),fmt1(r.hhOp),fmt1(r.prodOp),fmt1(r.hhEff),fmt1(r.prodEff),fmt1(r.utilization)+'%',fmt1(r.prod)]));
  const csv='\uFEFF'+rows.map(x=>x.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='Ranking_Picking_WMS.csv';a.click();URL.revokeObjectURL(a.href);
};

$('folderInput').addEventListener('change',e=>{
  const files=e.target.files;
  if(files?.length)loadHistoricalFiles(files);
  e.target.value='';
});
$('historyFilesInput').addEventListener('change',e=>{
  const files=e.target.files;
  if(files?.length)loadHistoricalFiles(files);
  e.target.value='';
});
$('processedInput').addEventListener('change',e=>{
  const file=e.target.files?.[0];
  if(file)loadProcessedHistory(file);
  e.target.value='';
});
['dayInput','dayFolderInput'].forEach(id=>$(id).addEventListener('change',e=>{
  const fs=[...(e.target.files||[])].filter(f=>/\.(csv|txt|xlsx)$/i.test(f.name)&&!f.name.startsWith('~$'));
  if(fs.length)updateDayData(fs);
  e.target.value='';
}));
$('exportProcessedBtn').addEventListener('click',exportProcessedHistory);
$('clearDayBtn').addEventListener('click',()=>{
  DAY_DATA=[];DAY_DETAILS=[];DAY_META=[];
  rebuildCombinedData({resetRange:false,preserveFilters:true});
  $('dayStatus').textContent='Sin actualización del día.';
  $('progressText').textContent='Se quitó la actualización del día; el dashboard volvió al histórico.';
  $('progressBox').style.display='block';$('progressBar').style.width='100%';
});
$('goDashBtn').addEventListener('click',()=>{
  if(DATA.length){
    $('upload').classList.remove('upload-open');
    $('upload').style.display='none';
    $('dash').style.display='block';
    window.scrollTo({top:0,behavior:'smooth'});
  }
});
