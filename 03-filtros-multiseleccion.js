/* ===== Filtros de selección múltiple =====
   Día, mes, semana, categoría, usuario, área, tipo y turno (paneles con búsqueda). */
const MULTI_STATE={day:new Set(),month:new Set(),week:new Set(),cat:new Set(),user:new Set(),area:new Set(),tipo:new Set(),turno:new Set()};
const MULTI_VALUES={day:[],month:[],week:[],cat:[],user:[],area:[],tipo:[],turno:[]};

function populateMulti(type,values){
  MULTI_VALUES[type]=[...values].sort((a,b)=>String(a).localeCompare(String(b),'es',{sensitivity:'base'}));
  MULTI_STATE[type].clear();
  if((type==='user'||type==='day') && $((type==='user'?'userSearch':'daySearch'))) $((type==='user'?'userSearch':'daySearch')).value='';
  renderMultiOptions(type);
  updateMultiButton(type);
}
function renderMultiOptions(type){
  const box=$(type+'Options');
  if(!box) return;
  const q=(type==='user'||type==='day') ? ($((type==='user'?'userSearch':'daySearch'))?.value||'').trim().toLowerCase() : '';
  const vals=MULTI_VALUES[type].filter(v=>!q || String(v).toLowerCase().includes(q));
  box.innerHTML=vals.map(v=>{
    const checked=MULTI_STATE[type].has(String(v))?'checked':'';
    const label=multiLabel(type,v);
    return `<label class="multiopt"><input type="checkbox" data-multi-type="${type}" value="${escapeHtml(v)}" ${checked}><span>${escapeHtml(label)}</span></label>`;
  }).join('');
  box.querySelectorAll(`input[data-multi-type="${type}"]`).forEach(cb=>{
    cb.addEventListener('change',()=>{
      if(cb.checked) MULTI_STATE[type].add(cb.value);
      else MULTI_STATE[type].delete(cb.value);
      updateMultiButton(type);
      renderDeb();
    });
  });
}
function updateMultiButton(type){
  const btn=$(type+'Btn'), count=$(type+'Count');
  if(!btn) return;
  const selected=[...MULTI_STATE[type]];
  const total=MULTI_VALUES[type].length;
  if(selected.length===0) btn.textContent=multiDefaultLabel(type);
  else if(selected.length===1) btn.textContent=multiLabel(type,selected[0]);
  else btn.textContent=`${selected.length} seleccionados`;
  if(count) count.textContent=selected.length===0 ? `Mostrando todos (${total})` : `${selected.length} de ${total} seleccionados`;
}
function getMultiSelected(type){return MULTI_STATE[type]}
function clearMulti(type,rerender=true){
  MULTI_STATE[type].clear();
  if((type==='user'||type==='day') && $((type==='user'?'userSearch':'daySearch'))) $((type==='user'?'userSearch':'daySearch')).value='';
  renderMultiOptions(type);updateMultiButton(type);
  if(rerender) renderDeb();
}
function selectAllMulti(type){
  MULTI_VALUES[type].forEach(v=>MULTI_STATE[type].add(String(v)));
  renderMultiOptions(type);updateMultiButton(type);renderDeb();
}
function toggleMultiPanel(type){
  ['day','month','week','cat','user','area','tipo','turno'].forEach(x=>{if(x!==type) $(x+'Panel')?.classList.remove('show')});
  $(type+'Panel')?.classList.toggle('show');
}
function multiText(type){
  const sel=[...MULTI_STATE[type]];
  if(sel.length===0)return '';
  if(sel.length<=3)return sel.map(v=>multiLabel(type,v)).join(', ');
  return `${sel.length} seleccionados`;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
