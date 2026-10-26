/* ===== Configuración =====
   Lectura y guardado de ajustes, ventana de configuración, exportar/importar ajustes. */
function loadSettings(){
  try{
    const raw=localStorage.getItem('picking_wms_settings_v2');
    if(raw){ const saved=JSON.parse(raw); SETTINGS=(saved.methodologyVersion===METHODOLOGY_VERSION)?{...DEFAULT_SETTINGS,...saved}:{...DEFAULT_SETTINGS}; }
  }catch(e){SETTINGS={...DEFAULT_SETTINGS};}
}
function saveSettingsToStorage(){
  localStorage.setItem('picking_wms_settings_v2', JSON.stringify(SETTINGS));
}
function applySettingsToInputs(){
  if($('cfgTitle')) $('cfgTitle').value=SETTINGS.title;
  if($('cfgSubtitle')) $('cfgSubtitle').value=SETTINGS.subtitle;
  {const pk=window.OPSEL==='PACKING';
   if($('cfgMeta')) $('cfgMeta').value=pk?(Number(SETTINGS.metaPack)||500):SETTINGS.meta;
   if($('cfgMetaLabel')) $('cfgMetaLabel').textContent=pk?'Meta Packing (und/HH por persona)':'Meta Picking (und/HH)';
   if($('cfgTxLabel')) $('cfgTxLabel').textContent=pk?'PACKING':(window.OPSEL==='AMBOS'?'PICKING (elige Packing para su meta)':'PICKING');}
  if($('cfgMetaPP')) $('cfgMetaPP').value=SETTINGS.metaPP;
  if($('cfgDailyTarget')) $('cfgDailyTarget').value=SETTINGS.dailyTarget;
  if($('cfgStartHour')) $('cfgStartHour').value=SETTINGS.startHour;
  if($('cfgEndHour')) $('cfgEndHour').value=SETTINGS.endHour;
  if($('cfgLowThr')) $('cfgLowThr').value=SETTINGS.lowThr;
  if($('cfgHighThr')) $('cfgHighThr').value=SETTINGS.highThr;
  if($('cfgGapMinutes')) $('cfgGapMinutes').value=SETTINGS.gapMinutes;
  if($('sessionGapInput')) $('sessionGapInput').value=SETTINGS.gapMinutes;
  if($('cfgOpStartTime')) $('cfgOpStartTime').value=SETTINGS.opStartTime;
  if($('prodMode')) $('prodMode').value=SETTINGS.prodMode||'operational';
  if($('cfgSupLabel')) $('cfgSupLabel').value=SETTINGS.supLabel;
  if($('meta')) $('meta').value=metaBase();
  if($('headerMeta')) $('headerMeta').textContent=fmt1(SETTINGS.meta)+' und/HH · PP '+fmt1(SETTINGS.metaPP)+' cajas/HH';
  if($('supDailyTarget')) $('supDailyTarget').value=SETTINGS.dailyTarget;
  if($('supStartHour')) $('supStartHour').value=SETTINGS.startHour;
  if($('supEndHour')) $('supEndHour').value=SETTINGS.endHour;
  if($('reportTitle')) $('reportTitle').textContent=SETTINGS.title;
  if($('reportSubtitle')) $('reportSubtitle').textContent=SETTINGS.subtitle;
  const pills=document.querySelectorAll('.pill');
  if(pills[0]) pills[0].textContent=SETTINGS.supLabel;
}
function openConfig(){ $('configModal').classList.add('show'); applySettingsToInputs(); }
function closeConfig(){ $('configModal').classList.remove('show'); }
function resetConfig(){ SETTINGS={...DEFAULT_SETTINGS}; applySettingsToInputs(); render(); }
function saveConfig(){
  SETTINGS.title=$('cfgTitle').value.trim()||DEFAULT_SETTINGS.title;
  SETTINGS.subtitle=$('cfgSubtitle').value.trim()||DEFAULT_SETTINGS.subtitle;
  if(window.OPSEL==='PACKING') SETTINGS.metaPack=Math.max(1, Number($('cfgMeta').value)||500);
  else SETTINGS.meta=Math.max(1, Number($('cfgMeta').value)||DEFAULT_SETTINGS.meta);
  if(typeof syncPackMeta==='function') syncPackMeta();
  SETTINGS.metaPP=Math.max(1, Number($('cfgMetaPP').value)||DEFAULT_SETTINGS.metaPP);
  SETTINGS.dailyTarget=Math.max(1, Number($('cfgDailyTarget').value)||DEFAULT_SETTINGS.dailyTarget);
  SETTINGS.startHour=Math.max(0, Math.min(23, Number($('cfgStartHour').value)||DEFAULT_SETTINGS.startHour));
  SETTINGS.endHour=Math.max(SETTINGS.startHour+1, Math.min(23, Number($('cfgEndHour').value)||DEFAULT_SETTINGS.endHour));
  SETTINGS.lowThr=Math.max(0, Number($('cfgLowThr').value)||DEFAULT_SETTINGS.lowThr);
  SETTINGS.highThr=Math.max(SETTINGS.lowThr+1, Number($('cfgHighThr').value)||DEFAULT_SETTINGS.highThr);
  SETTINGS.gapMinutes=Math.max(1, Math.min(120, Number($('cfgGapMinutes').value)||DEFAULT_SETTINGS.gapMinutes));
  const opTime=/^([01]\d|2[0-3]):[0-5]\d$/.test($('cfgOpStartTime').value)?$('cfgOpStartTime').value:DEFAULT_SETTINGS.opStartTime;
  SETTINGS.opStartTime=opTime;
  SETTINGS.prodMode=$('prodMode')?.value||SETTINGS.prodMode||'operational';
  SETTINGS.supLabel=$('cfgSupLabel').value.trim()||DEFAULT_SETTINGS.supLabel;
  saveSettingsToStorage();
  applySettingsToInputs();
  closeConfig();
  render();
}
function exportConfig(){
  const blob=new Blob([JSON.stringify(SETTINGS,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='configuracion_picking_wms.json';a.click();URL.revokeObjectURL(a.href);
}
function importConfigFile(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const obj=JSON.parse(reader.result);
      SETTINGS={...DEFAULT_SETTINGS,...obj};
      saveSettingsToStorage();
      applySettingsToInputs();
      render();
      closeConfig();
    }catch(e){alert('No se pudo importar la configuración.');}
  };
  reader.readAsText(file);
}
