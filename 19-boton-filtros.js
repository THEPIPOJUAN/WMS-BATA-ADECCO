/* ===== Botón FILTROS =====
   Muestra u oculta el panel de filtros. */
document.getElementById('filtersBtn').addEventListener('click',function(){const w=document.getElementById('filtersWrap'),on=w.style.display==='none';w.style.display=on?'block':'none';this.classList.toggle('active',on);this.innerHTML=on?'🔎 Ocultar filtros':'🔎 Filtros';});
