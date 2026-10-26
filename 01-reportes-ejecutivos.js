/* ===== Reportes ejecutivos (WMSX) =====
   Filtro PP CAJAS/UNDS, menú Excel | PDF, botón "Generar reporte" (PICKING / PACKING) con semáforo.
   Se carga en el <head>; expone window.WMSX. */
/*!
 * WMS BATA · Módulo de Reportes Ejecutivos  (v1.0)
 * ------------------------------------------------------------------
 * Archivo autocontenido (JS puro, sin framework). Expone  window.WMSX
 *
 *  1) WMSX.PP        -> filtro "PP CAJAS" / "PP UNDS" y conversión de la medida
 *  2) WMSX.exportMenu / WMSX.exportMatriz
 *                    -> menú EXCEL | PDF (reemplaza el confirm()), PDF ejecutivo
 *                       con semáforo que se DESCARGA directo (sin window.open)
 *  3) WMSX.mountReportButton / WMSX.openReportModal
 *                    -> botón "Generar reporte" (PICKING / PACKING por semana)
 *                       con Excel + PDF ejecutivo y gráfico diario sin usuarios
 *
 * Dependencias (se cargan solas, bajo demanda, desde cdnjs):
 *   jsPDF 2.5.1 · jspdf-autotable 3.8.2 · ExcelJS 4.4.0
 *
 * Único punto de conexión con el dashboard: WMSX.configure({ getRows, mapRow })
 * (ver INTEGRACION.md).
 */
(function (global) {
  'use strict';

  /* ================================================================
   *  CONFIGURACIÓN (todo ajustable desde WMSX.configure)
   * ================================================================ */
  const CFG = {
    cdn: {
      jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
      exceljs: 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
    },
    // Debe devolver el arreglo de líneas "crudas" del dashboard (ya cargadas en memoria).
    getRows: null,
    // Convierte UNA línea cruda al formato normalizado (ver abajo). Si tus filas ya vienen así, déjalo null.
    //   { fecha:'YYYY-MM-DD'|Date|'D/M/YYYY', usuario, categoria:'CALZ'|'ACC'|'INSUMO',
    //     transaccion:'PICKING'|'PACKING', bloque:'SOLI PACK'|'PRE PACK'|..., unidades:Number, cajas:Number }
    mapRow: null,
    // Devuelve 'PICKING' | 'PACKING' | 'AMBOS' del modo activo del dashboard (opcional, solo preselecciona).
    getModo: null,
    // Meta individual por DÍA (unidades) según transacción.
    metaDia: { PACKING: 3750, PICKING: 1500 },
    // Peso de cada día de la semana para la meta (0=dom … 6=sáb). Sábado = media jornada.
    factorDia: { 0: 0.5, 6: 0.5 },
    // Un usuario solo "cuenta" el día para la meta si produjo al menos esto ese día (calibrado con el ejemplo: 363 cuenta, 110 no).
    minDiaUnidades: 200,
    // Semáforo (% de la meta): verde >= verde ; ámbar >= ambar ; rojo < ambar
    umbral: { verde: 1, ambar: 0.8 },
    // Bloques por transacción. Si no se define, se deducen de los datos.
    //   conCajas:true => ese bloque aporta la columna "Cant cajas" y su reporte en CAJAS
    bloques: {
      PACKING: [{ id: 'SOLI PACK', conCajas: false }, { id: 'PRE PACK', conCajas: true }]
    },
    categoriasExcluidasGeneral: ['INSUMO', 'MATERIALES'],
    unidadesPorCaja: null, // solo si tus filas traen cajas pero no unidades convertidas
    empresa: 'WMS BATA · ADECCO',
    nombreArchivo: 'WMS'
  };

  /* ================================================================
   *  UTILIDADES
   * ================================================================ */
  const NAVY = [45, 49, 57], NAVY_HEX = '#2d3139';
  const SEM = {
    verde: { fill: [168, 213, 186], text: [22, 101, 52], hexFill: 'FFA8D5BA', hexText: 'FF166534' },
    ambar: { fill: [243, 223, 142], text: [133, 100, 4], hexFill: 'FFF3DF8E', hexText: 'FF856404' },
    rojo: { fill: [247, 214, 218], text: [155, 28, 46], hexFill: 'FFF7D6DA', hexText: 'FF9B1C2E' }
  };
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const fmt = n => Math.round(n || 0).toLocaleString('en-US');
  const pad = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toISO(v) {
    if (v instanceof Date) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
    const s = String(v || '').trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
    return '';
  }
  const utc = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const isoOf = dt => dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
  const addDays = (iso, n) => { const d = utc(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
  const dmy = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const dm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const dowOf = iso => utc(iso).getUTCDay();

  function isoWeekStart(year, week) {
    const jan4 = utc(year + '-01-04');
    const dow = (jan4.getUTCDay() + 6) % 7;
    jan4.setUTCDate(jan4.getUTCDate() - dow + (week - 1) * 7);
    return isoOf(jan4);
  }
  function isoWeekOf(iso) {
    const d = utc(iso);
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow + 3); // jueves de esa semana
    const year = d.getUTCFullYear();
    const first = new Date(Date.UTC(year, 0, 4));
    const week = 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
    return { year, week };
  }
  function weeksInYear(year) { return isoWeekOf(year + '-12-28').week; }

  function semaforo(ratio) {
    if (ratio >= CFG.umbral.verde) return 'verde';
    if (ratio >= CFG.umbral.ambar) return 'ambar';
    return 'rojo';
  }

  const loaded = {};
  function loadScript(url) {
    return loaded[url] || (loaded[url] = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.onload = res;
      s.onerror = () => { delete loaded[url]; rej(new Error('No se pudo cargar ' + url)); };
      document.head.appendChild(s);
    }));
  }
  async function ensure(list) {
    if (list.includes('pdf')) {
      if (!(global.jspdf && global.jspdf.jsPDF)) await loadScript(CFG.cdn.jspdf);
      if (!global.jspdf.jsPDF.API.autoTable) await loadScript(CFG.cdn.autotable);
    }
    if (list.includes('xlsx') && !global.ExcelJS) await loadScript(CFG.cdn.exceljs);
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  const stamp = () => { const d = new Date(); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };

  /* ================================================================
   *  1) FILTRO PP CAJAS / PP UNDS
   * ================================================================ */
  const PP = {
    CAJAS: 'PP CAJAS',
    UNDS: 'PP UNDS',
    /** Reemplaza la opción única "PP" de una lista de opciones por PP CAJAS y PP UNDS.
     *  options: array de strings  o  de {value,label}. Devuelve un arreglo NUEVO. */
    patchOptions(options, key) {
      key = key || 'PP';
      const out = [];
      options.forEach(o => {
        const v = typeof o === 'string' ? o : (o.value != null ? o.value : o.label);
        if (String(v).trim().toUpperCase() === key) {
          out.push(typeof o === 'string' ? PP.CAJAS : { value: PP.CAJAS, label: PP.CAJAS });
          out.push(typeof o === 'string' ? PP.UNDS : { value: PP.UNDS, label: PP.UNDS });
        } else out.push(o);
      });
      return out;
    },
    /** Una selección guardada con "PP" antiguo se convierte en ambas opciones. */
    normalizeSelection(sel) {
      const s = Array.from(sel || []);
      const i = s.findIndex(v => String(v).trim().toUpperCase() === 'PP');
      if (i >= 0) s.splice(i, 1, PP.CAJAS, PP.UNDS);
      return s;
    },
    /** 'CAJAS' únicamente cuando se seleccionó PP CAJAS y NO PP UNDS. En cualquier otro caso 'UNDS'. */
    mode(selected) {
      const s = PP.normalizeSelection(selected).map(v => String(v).toUpperCase());
      return s.includes(PP.CAJAS) && !s.includes(PP.UNDS) ? 'CAJAS' : 'UNDS';
    },
    /** Valor a mostrar de una fila normalizada según el filtro (cajas o unidades convertidas). */
    measure(row, selected) {
      if (PP.mode(selected) === 'CAJAS') {
        if (row.cajas != null && row.cajas !== '') return +row.cajas || 0;
        return CFG.unidadesPorCaja ? (+row.unidades || 0) / CFG.unidadesPorCaja : 0;
      }
      if (row.unidades != null && row.unidades !== '') return +row.unidades || 0;
      return CFG.unidadesPorCaja ? (+row.cajas || 0) * CFG.unidadesPorCaja : 0;
    },
    label(selected) { return PP.mode(selected) === 'CAJAS' ? 'Cajas' : 'Unidades'; },
    /** ¿La fila pertenece al tipo PP seleccionado? (útil si "PP" es un valor de Tipo pedido) */
    includes(selected, tipoPedido) {
      const s = PP.normalizeSelection(selected).map(v => String(v).toUpperCase());
      return s.includes(String(tipoPedido).toUpperCase());
    }
  };

  /* ================================================================
   *  ESTILOS + MODAL BASE
   * ================================================================ */
  function injectCSS() {
    if (document.getElementById('wmsx-css')) return;
    const st = document.createElement('style'); st.id = 'wmsx-css';
    st.textContent = `
.wmsx-ov{position:fixed;inset:0;background:rgba(10,24,41,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;animation:wmsxf .15s ease}
@keyframes wmsxf{from{opacity:0}to{opacity:1}}
.wmsx-modal{background:#fff;border-radius:16px;width:100%;max-width:460px;box-shadow:0 24px 60px rgba(10,24,41,.35);overflow:hidden;font-family:inherit;color:#1c2b3a}
.wmsx-mh{background:linear-gradient(135deg,#2d3139,#1d5a8e);color:#fff;padding:18px 22px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.wmsx-mh h3{margin:0;font-size:17px;font-weight:700;letter-spacing:.2px}
.wmsx-mh p{margin:4px 0 0;font-size:12.5px;opacity:.8}
.wmsx-x{background:rgba(255,255,255,.15);border:0;color:#fff;width:30px;height:30px;border-radius:8px;font-size:18px;cursor:pointer;line-height:1}
.wmsx-x:hover{background:rgba(255,255,255,.28)}
.wmsx-mb{padding:20px 22px 6px}
.wmsx-lb{display:block;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#5b6b7c;margin:0 0 8px}
.wmsx-sec{margin-bottom:18px}
.wmsx-week{display:flex;align-items:center;gap:8px}
.wmsx-week input,.wmsx-week select{border:1px solid #cfd8e3;border-radius:10px;padding:10px 12px;font-size:15px;font-weight:600;color:#2d3139;background:#fff;width:80px;text-align:center;font-family:inherit}
.wmsx-week select{width:100%;text-align:left;font-size:13.5px;font-weight:500}
.wmsx-week input:focus,.wmsx-week select:focus{outline:2px solid #2f7fc1;outline-offset:1px;border-color:#2f7fc1}
.wmsx-step{width:38px;height:40px;border:1px solid #cfd8e3;background:#f4f7fb;border-radius:10px;font-size:18px;cursor:pointer;color:#2d3139}
.wmsx-step:hover{background:#e6eef7}
.wmsx-range{margin-top:8px;font-size:12.5px;color:#5b6b7c}
.wmsx-range b{color:#2d3139}
.wmsx-seg{display:grid;grid-template-columns:1fr 1fr;background:#eef2f7;border-radius:12px;padding:4px;gap:4px}
.wmsx-seg button{border:0;background:transparent;padding:11px;border-radius:9px;font-weight:700;font-size:13.5px;letter-spacing:.5px;color:#5b6b7c;cursor:pointer;font-family:inherit}
.wmsx-seg button.on{background:#fff;color:#2d3139;box-shadow:0 1px 4px rgba(18,58,94,.18)}
.wmsx-stat{background:#f4f7fb;border:1px dashed #cfd8e3;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#41536a;min-height:20px}
.wmsx-stat.warn{background:#fff6e5;border-color:#f0c36d;color:#7a5200}
.wmsx-mf{display:flex;gap:10px;justify-content:flex-end;padding:14px 22px 20px;flex-wrap:wrap}
.wmsx-b{border:1px solid #cfd8e3;background:#fff;color:#2d3139;border-radius:10px;padding:10px 18px;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit}
.wmsx-b:hover{background:#f1f5fa}
.wmsx-b.pri{background:#2d3139;border-color:#2d3139;color:#fff}.wmsx-b.pri:hover{background:#1b4d7c}
.wmsx-b.xl{background:#1e7a4f;border-color:#1e7a4f;color:#fff}.wmsx-b.xl:hover{background:#25925f}
.wmsx-b.pd{background:#b3261e;border-color:#b3261e;color:#fff}.wmsx-b.pd:hover{background:#cc3027}
.wmsx-b[disabled]{opacity:.55;cursor:wait}
.wmsx-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:20px 22px 8px}
.wmsx-card{border:1.5px solid #dbe3ec;border-radius:14px;padding:18px 12px;text-align:center;cursor:pointer;background:#fff;font-family:inherit;transition:.15s}
.wmsx-card:hover{border-color:#2f7fc1;box-shadow:0 6px 18px rgba(47,127,193,.18);transform:translateY(-1px)}
.wmsx-card b{display:block;font-size:17px;letter-spacing:.5px;color:#2d3139}
.wmsx-card span{font-size:12px;color:#6b7c8e}
.wmsx-card i{display:inline-block;font-style:normal;font-size:11px;font-weight:800;padding:3px 8px;border-radius:6px;color:#fff;margin-bottom:8px}
.wmsx-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid #cfd8e3;background:#fff;color:#2d3139;border-radius:10px;padding:9px 15px;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
.wmsx-btn:hover{background:#f1f5fa;border-color:#9db4cc}
.wmsx-toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#2d3139;color:#fff;padding:11px 20px;border-radius:10px;font-size:13px;z-index:100000;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.wmsx-toast.err{background:#b3261e}`;
    document.head.appendChild(st);
  }
  function toast(msg, err) {
    injectCSS();
    const t = document.createElement('div'); t.className = 'wmsx-toast' + (err ? ' err' : ''); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5000 : 2600);
  }
  function modal(html) {
    injectCSS();
    const ov = document.createElement('div'); ov.className = 'wmsx-ov';
    ov.innerHTML = '<div class="wmsx-modal" role="dialog" aria-modal="true">' + html + '</div>';
    const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    document.body.appendChild(ov);
    return { ov, close, $: s => ov.querySelector(s), $$: s => ov.querySelectorAll(s) };
  }

  /* ================================================================
   *  2) MENÚ EXCEL | PDF  +  EXPORTAR MATRIZ (semáforo)
   * ================================================================ */
  /** Reemplaza al confirm("Aceptar = Excel / Cancelar = PDF").  Devuelve Promise<'xlsx'|'pdf'|null> */
  function exportMenu(opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const m = modal(
        '<div class="wmsx-mh"><div><h3>' + esc(opts.title || 'Descargar') + '</h3><p>' + esc(opts.subtitle || 'Elige el formato de salida') + '</p></div>' +
        '<button class="wmsx-x" data-close aria-label="Cerrar">×</button></div>' +
        '<div class="wmsx-cards">' +
        '<button class="wmsx-card" data-f="xlsx"><i style="background:#1e7a4f">XLSX</i><b>EXCEL</b><span>Hoja editable con semáforo</span></button>' +
        '<button class="wmsx-card" data-f="pdf"><i style="background:#b3261e">PDF</i><b>PDF</b><span>Reporte ejecutivo</span></button></div>' +
        '<div class="wmsx-mf"><button class="wmsx-b" data-close>Cancelar</button></div>');
      let done = false;
      const fin = v => { if (done) return; done = true; m.close(); resolve(v); };
      m.$$('[data-f]').forEach(b => b.addEventListener('click', () => fin(b.dataset.f)));
      m.$$('[data-close]').forEach(b => b.addEventListener('click', () => fin(null)));
      m.ov.addEventListener('mousedown', e => { if (e.target === m.ov) fin(null); });
    });
  }

  /**
   * data = {
   *   titulo:'Matriz por día y usuario', subtitulo:'Vista semáforo…', archivo:'Matriz_Supervision',
   *   chips:[['Período','6 días (05/10 – 10/10)'],['Categorías','Todas'],…],
   *   kpis:[['Meta grupal','196,800'],['Avance','179,885'],['Cumplimiento','91%'],['Brecha','-16,915','rojo'],…],
   *   days:[{key:'2026-10-05',label:'05/10'},…],
   *   rows:[{usuario:'pquispe3', byDay:{'2026-10-05':2898,…}},…],
   *   metaIndividual:1500, unidad:'Unidades'
   * }
   */
  function matrixModel(d) {
    const rows = d.rows.map(r => {
      const vals = d.days.map(x => +r.byDay[x.key] || 0);
      const total = vals.reduce((a, b) => a + b, 0);
      const act = vals.filter(v => v > 0).length;
      const prom = act ? total / act : 0;
      return { usuario: r.usuario, vals, total, prom };
    }).sort((a, b) => b.total - a.total);
    const totDay = d.days.map((_, i) => rows.reduce((s, r) => s + r.vals[i], 0));
    return { rows, totDay, total: totDay.reduce((a, b) => a + b, 0) };
  }

  async function exportMatriz(fmt, d) {
    if (!fmt) fmt = await exportMenu({ title: 'Descargar matriz' });
    if (!fmt) return;
    try {
      if (fmt === 'pdf') await matrixPDF(d); else await matrixXLSX(d);
      toast('Descarga lista');
    } catch (e) { console.error(e); toast('No se pudo generar el archivo: ' + e.message, true); }
  }

  function drawHeader(doc, title, sub, W) {
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 20, 'F');
    doc.setFillColor(47, 127, 193); doc.rect(0, 20, W, 1.2, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(title, 12, 10.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (sub) doc.text(sub, 12, 16);
    doc.setFontSize(8.5); doc.text(CFG.empresa, W - 12, 10.5, { align: 'right' });
    doc.setTextColor(0);
  }
  function footers(doc, W, H) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
      doc.setDrawColor(210); doc.line(12, H - 10, W - 12, H - 10);
      doc.text('Generado el ' + stamp() + ' · ' + CFG.empresa, 12, H - 5.5);
      doc.text('Página ' + i + ' de ' + n, W - 12, H - 5.5, { align: 'right' });
    }
  }
  function chipsAndKpis(doc, d, W, y) {
    // chips
    let x = 12;
    doc.setFontSize(8);
    (d.chips || []).forEach(([k, v]) => {
      const t = k + ': ' + v; const w = doc.getTextWidth(t) + 8;
      if (x + w > W - 12) { x = 12; y += 8; }
      doc.setFillColor(238, 243, 249); doc.setDrawColor(207, 216, 227);
      doc.roundedRect(x, y, w, 6, 3, 3, 'FD');
      doc.setTextColor(65, 83, 106); doc.setFont('helvetica', 'normal'); doc.text(k + ': ', x + 4, y + 4.1);
      const kw = doc.getTextWidth(k + ': ');
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(String(v), x + 4 + kw, y + 4.1);
      x += w + 3;
    });
    y += 10;
    // KPIs
    const k = d.kpis || [];
    if (k.length) {
      const gap = 3, w = (W - 24 - gap * (k.length - 1)) / k.length;
      k.forEach(([lab, val, tone], i) => {
        const xx = 12 + i * (w + gap);
        doc.setFillColor(244, 247, 251); doc.setDrawColor(219, 227, 236);
        doc.roundedRect(xx, y, w, 15, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(95, 110, 128);
        doc.text(String(lab), xx + 3, y + 5);
        const c = tone && SEM[tone] ? SEM[tone].text : NAVY;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...c);
        doc.text(String(val), xx + 3, y + 12);
      });
      y += 19;
    }
    doc.setTextColor(0);
    return y;
  }

  async function matrixPDF(d) {
    await ensure(['pdf']);
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210, M = matrixModel(d), meta = d.metaIndividual || CFG.metaDia.PACKING;
    const draw = () => drawHeader(doc, d.titulo || 'Matriz por día y usuario', d.subtitulo || ('Unidad: ' + (d.unidad || 'Unidades')), W);
    draw();
    const y = chipsAndKpis(doc, d, W, 27);
    const head = [['Usuario'].concat(d.days.map(x => x.label), ['TOTAL', 'PROM./DÍA'])];
    const body = M.rows.map(r => [r.usuario].concat(r.vals.map(v => v ? fmt(v) : '-'), [fmt(r.total), fmt(r.prom)]));
    const foot = [['TOTAL GENERAL'].concat(M.totDay.map(fmt), [fmt(M.total), '-'])];
    const nd = d.days.length;
    doc.autoTable({
      head, body, foot, startY: y, margin: { left: 12, right: 12, top: 26, bottom: 14 },
      theme: 'grid', styles: { fontSize: 7.6, cellPadding: 1.5, lineColor: [255, 255, 255], lineWidth: 0.3, halign: 'center', textColor: [30, 40, 55] },
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: [238, 239, 241], textColor: NAVY, fontStyle: 'bold' },
      bodyStyles: { fillColor: [242, 242, 242] },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 34 } },
      showFoot: 'lastPage',
      didParseCell(h) {
        if (h.section !== 'body') return;
        const r = M.rows[h.row.index], c = h.column.index;
        if (c >= 1 && c <= nd) {
          const v = r.vals[c - 1];
          if (v > 0) { const s = SEM[semaforo(v / meta)]; h.cell.styles.fillColor = s.fill; h.cell.styles.textColor = s.text; }
          else h.cell.styles.textColor = [150, 150, 150];
        } else if (c === nd + 1) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [248, 250, 252]; }
        else if (c === nd + 2) { h.cell.styles.fontStyle = 'bold'; h.cell.styles.fillColor = [248, 250, 252]; h.cell.styles.textColor = SEM[semaforo(r.prom / meta)].text; }
      },
      didDrawPage(h) { if (h.pageNumber > 1) draw(); }
    });
    // Leyenda
    let ly = doc.lastAutoTable.finalY + 5;
    if (ly > H - 22) { doc.addPage(); draw(); ly = 28; }
    doc.setFontSize(8); doc.setTextColor(90);
    doc.text('Semáforo por celda (meta individual ' + fmt(meta) + '):', 12, ly + 3);
    [['verde', '≥ ' + Math.round(CFG.umbral.verde * 100) + '% de la meta'], ['ambar', Math.round(CFG.umbral.ambar * 100) + '% – ' + (Math.round(CFG.umbral.verde * 100) - 1) + '%'], ['rojo', '< ' + Math.round(CFG.umbral.ambar * 100) + '%']]
      .forEach((l, i) => { const x = 82 + i * 42; doc.setFillColor(...SEM[l[0]].fill); doc.roundedRect(x, ly, 6, 4, 1, 1, 'F'); doc.setTextColor(60); doc.text(l[1].replace('≥', '>='), x + 8, ly + 3); });
    footers(doc, W, H);
    doc.save((d.archivo || 'Matriz_Supervision') + '_' + stampFile() + '.pdf');
  }
  const stampFile = () => { const t = new Date(); return t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()) + '_' + pad(t.getHours()) + pad(t.getMinutes()); };

  async function matrixXLSX(d) {
    await ensure(['xlsx']);
    const M = matrixModel(d), meta = d.metaIndividual || CFG.metaDia.PACKING;
    const wb = new global.ExcelJS.Workbook(); wb.creator = CFG.empresa;
    const ws = wb.addWorksheet('Matriz', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
    const nd = d.days.length, nc = nd + 3;
    ws.mergeCells(1, 1, 1, nc);
    Object.assign(ws.getCell(1, 1), { value: d.titulo || 'Matriz por día y usuario' });
    ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } };
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3139' } };
    ws.getRow(1).height = 28;
    ws.mergeCells(2, 1, 2, nc);
    ws.getCell(2, 1).value = (d.chips || []).map(c => c[0] + ': ' + c[1]).join('   |   ');
    ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF41536A' } };
    ws.mergeCells(3, 1, 3, nc);
    ws.getCell(3, 1).value = (d.kpis || []).map(c => c[0] + ': ' + c[1]).join('   |   ');
    ws.getCell(3, 1).font = { size: 10, bold: true, color: { argb: 'FF2D3139' } };
    const hr = ws.getRow(4);
    ['Usuario'].concat(d.days.map(x => x.label), ['TOTAL', 'PROM./DÍA']).forEach((t, i) => {
      const c = hr.getCell(i + 1); c.value = t;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3139' } };
    });
    const thin = { style: 'thin', color: { argb: 'FFFFFFFF' } };
    M.rows.forEach((r, ri) => {
      const row = ws.getRow(5 + ri);
      row.getCell(1).value = r.usuario; row.getCell(1).font = { bold: true };
      r.vals.forEach((v, i) => {
        const c = row.getCell(2 + i); c.alignment = { horizontal: 'center' }; c.numFmt = '#,##0';
        if (v > 0) { const s = SEM[semaforo(v / meta)]; c.value = v; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.hexFill } }; c.font = { color: { argb: s.hexText } }; }
        else { c.value = '-'; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }; c.font = { color: { argb: 'FF999999' } }; }
        c.border = { top: thin, left: thin, bottom: thin, right: thin };
      });
      const t = row.getCell(nd + 2); t.value = r.total; t.numFmt = '#,##0'; t.font = { bold: true }; t.alignment = { horizontal: 'center' };
      const p = row.getCell(nd + 3); p.value = Math.round(r.prom); p.numFmt = '#,##0'; p.alignment = { horizontal: 'center' };
      p.font = { bold: true, color: { argb: SEM[semaforo(r.prom / meta)].hexText } };
    });
    const fr = ws.getRow(5 + M.rows.length);
    fr.getCell(1).value = 'TOTAL GENERAL';
    M.totDay.forEach((v, i) => { fr.getCell(2 + i).value = v; });
    fr.getCell(nd + 2).value = M.total; fr.getCell(nd + 3).value = '-';
    for (let i = 1; i <= nc; i++) {
      const c = fr.getCell(i); c.font = { bold: true, color: { argb: 'FF2D3139' } }; c.numFmt = '#,##0';
      c.alignment = { horizontal: i === 1 ? 'left' : 'center' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEFF1' } };
      c.border = { top: { style: 'medium', color: { argb: 'FF2D3139' } } };
    }
    ws.getColumn(1).width = 22; for (let i = 2; i <= nc; i++) ws.getColumn(i).width = 12;
    const buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), (d.archivo || 'Matriz_Supervision') + '_' + stampFile() + '.xlsx');
  }


  /* ---------- Exportar CUALQUIER <table> del dashboard conservando colores (semáforo) ---------- */
  function parseColor(c) {
    const m = String(c || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x)); if (p.length === 4 && p[3] < 0.05) return null;
    if (p[0] > 250 && p[1] > 250 && p[2] > 250) return null;
    return [p[0], p[1], p[2]];
  }
  const hex = c => 'FF' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const isNum = t => /^[-+]?[\d.,]+%?$/.test(t) && /\d/.test(t);
  const toNum = t => { const n = parseFloat(t.replace(/,/g, '').replace('%', '')); return isNaN(n) ? t : n; };

  function readTable(tbl) {
    const rows = [...tbl.querySelectorAll('tr')].map(tr => [...tr.children].map(td => {
      const cs = getComputedStyle(td), txt = (td.innerText || '').replace(/\s+/g, ' ').trim();
      const bold = parseInt(cs.fontWeight, 10) >= 600;
      return { t: txt, span: td.colSpan || 1, th: td.tagName === 'TH', bg: parseColor(cs.backgroundColor), fg: parseColor(cs.color), bold };
    })).filter(r => r.length);
    let h = 0; while (h < rows.length && rows[h].every(c => c.th)) h++;
    return { head: rows.slice(0, h), body: rows.slice(h) };
  }

  /** fmt: 'pdf'|'xlsx'. opts: {title, subtitle, file, chips:[[k,v]], legend:true} */
  async function exportTable(fmtSel, tbl, opts) {
    opts = opts || {};
    const T = readTable(tbl);
    if (!T.body.length && !T.head.length) throw new Error('La tabla está vacía');
    const title = opts.title || 'Reporte', file = (opts.file || title).replace(/[^\w\-]+/g, '_') + '_' + stampFile();
    const ncols = Math.max(...T.head.concat(T.body).map(r => r.reduce((s, c) => s + c.span, 0)));
    if (fmtSel === 'pdf') {
      await ensure(['pdf']);
      const { jsPDF } = global.jspdf;
      const big = ncols > 22;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: big ? 'a3' : 'a4' });
      const W = big ? 420 : 297, H = big ? 297 : 210;
      const draw = () => drawHeader(doc, title, opts.subtitle || '', W);
      draw();
      let y = 27;
      if (opts.chips && opts.chips.length) y = chipsAndKpis(doc, { chips: opts.chips }, W, y);
      const fs = ncols > 26 ? 5.8 : ncols > 18 ? 6.4 : ncols > 11 ? 7.2 : 8.2;
      const cell = c => {
        const st = {};
        if (c.bg) st.fillColor = c.bg;
        if (c.fg && !c.th) st.textColor = c.fg;
        if (c.bold) st.fontStyle = 'bold';
        if (isNum(c.t)) st.halign = 'center';
        return { content: c.t, colSpan: c.span, styles: st };
      };
      const isTot = r => /^total/i.test(r[0].t);
      doc.autoTable({
        head: T.head.map(r => r.map(c => ({ content: c.t, colSpan: c.span }))),
        body: T.body.map(r => r.map(cell)),
        startY: y, margin: { left: 12, right: 12, top: 26, bottom: 14 }, theme: 'grid',
        styles: { fontSize: fs, cellPadding: fs > 7 ? 1.6 : 1.1, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [30, 40, 55], overflow: 'linebreak' },
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell(h) {
          if (h.section !== 'body') return;
          const r = T.body[h.row.index];
          if (isTot(r)) { h.cell.styles.fillColor = [238, 239, 241]; h.cell.styles.textColor = NAVY; h.cell.styles.fontStyle = 'bold'; }
        },
        didDrawPage() { draw(); }
      });
      if (opts.legend) {
        let ly = doc.lastAutoTable.finalY + 5; if (ly > H - 20) { doc.addPage(); draw(); ly = 28; }
        doc.setFontSize(8); doc.setTextColor(90); doc.text('Semáforo:', 12, ly + 3);
        [['verde', 'Cumple la meta'], ['ambar', 'Entre 80% y 99%'], ['rojo', 'Menos de 80%']].forEach((l, i) => { const x = 30 + i * 42; doc.setFillColor(...SEM[l[0]].fill); doc.roundedRect(x, ly, 6, 4, 1, 1, 'F'); doc.setTextColor(60); doc.text(l[1], x + 8, ly + 3); });
      }
      footers(doc, W, H);
      doc.save(file + '.pdf');
    } else {
      await ensure(['xlsx']);
      const wb = new global.ExcelJS.Workbook(); wb.creator = CFG.empresa;
      const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*\[\]:]/g, '-'), { views: [{ state: 'frozen', ySplit: 3 + T.head.length }] });
      const fill = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
      ws.mergeCells(1, 1, 1, Math.max(ncols, 2));
      Object.assign(ws.getCell(1, 1), { value: title }); ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }; ws.getCell(1, 1).fill = fill('FF2D3139'); ws.getRow(1).height = 28;
      ws.mergeCells(2, 1, 2, Math.max(ncols, 2)); ws.getCell(2, 1).value = [opts.subtitle].concat((opts.chips || []).map(c => c[0] + ': ' + c[1])).filter(Boolean).join('   |   '); ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF41536A' } };
      let rr = 4;
      const put = (r, head) => {
        let c = 1;
        r.forEach(cell => {
          const x = ws.getCell(rr, c); x.value = head ? cell.t : (isNum(cell.t) ? toNum(cell.t) : cell.t);
          if (!head && isNum(cell.t)) { x.numFmt = /%$/.test(cell.t) ? '0.0%' : '#,##0.##'; if (/%$/.test(cell.t)) x.value = toNum(cell.t) / 100; x.alignment = { horizontal: 'center' }; }
          if (head) { x.font = { bold: true, color: { argb: 'FFFFFFFF' } }; x.fill = fill('FF2D3139'); x.alignment = { horizontal: 'center', wrapText: true }; }
          else {
            if (cell.bg) x.fill = fill(hex(cell.bg));
            x.font = { bold: cell.bold || /^total/i.test(r[0].t), color: { argb: cell.fg ? hex(cell.fg) : 'FF1E2837' } };
            if (/^total/i.test(r[0].t)) { x.fill = fill('FFEEEFF1'); x.font = { bold: true, color: { argb: 'FF2D3139' } }; }
            x.border = { bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
          }
          if (cell.span > 1) { ws.mergeCells(rr, c, rr, c + cell.span - 1); }
          c += cell.span;
        });
        rr++;
      };
      T.head.forEach(r => put(r, true)); T.body.forEach(r => put(r, false));
      ws.getColumn(1).width = 24; for (let i = 2; i <= ncols; i++) ws.getColumn(i).width = 13;
      const buf = await wb.xlsx.writeBuffer();
      download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), file + '.xlsx');
    }
  }

  /* ================================================================
   *  3) REPORTES PICKING / PACKING POR SEMANA
   * ================================================================ */
  function normRows() {
    const raw = typeof CFG.getRows === 'function' ? CFG.getRows() : [];
    const out = [];
    (raw || []).forEach(r => {
      const m = CFG.mapRow ? CFG.mapRow(r) : r;
      if (!m) return;
      const f = toISO(m.fecha); if (!f) return;
      out.push({
        fecha: f, usuario: String(m.usuario || '').trim(), categoria: String(m.categoria || '').trim().toUpperCase(),
        transaccion: String(m.transaccion || '').trim().toUpperCase(), bloque: String(m.bloque || '').trim().toUpperCase(),
        unidades: +m.unidades || 0, cajas: +m.cajas || 0
      });
    });
    return out;
  }

  function bloquesFor(tx, rows) {
    if (CFG.bloques && CFG.bloques[tx]) return CFG.bloques[tx];
    const ids = [...new Set(rows.map(r => r.bloque).filter(Boolean))];
    ids.sort((a, b) => (/PRE/.test(a) ? 1 : 0) - (/PRE/.test(b) ? 1 : 0) || a.localeCompare(b));
    return ids.map(id => ({ id, conCajas: /PRE/.test(id) }));
  }

  function pivot(rows, days, val) {
    const map = new Map(), byDay = {}; days.forEach(d => byDay[d] = 0); let total = 0;
    rows.forEach(r => {
      const v = val(r); if (!v) return;
      let u = map.get(r.usuario);
      if (!u) { u = { usuario: r.usuario, by: {}, total: 0 }; map.set(r.usuario, u); }
      u.by[r.fecha] = (u.by[r.fecha] || 0) + v; u.total += v; byDay[r.fecha] += v; total += v;
    });
    return { users: [...map.values()].sort((a, b) => b.total - a.total || a.usuario.localeCompare(b.usuario)), byDay, total };
  }

  function buildReport(all, { year, week, transaccion, sinMeta }) {
    const tx = transaccion;
    const d0 = isoWeekStart(year, week), d6 = addDays(d0, 6);
    const rows = all.filter(r => r.transaccion === tx && r.fecha >= d0 && r.fecha <= d6);
    const days = [...new Set(rows.map(r => r.fecha))].sort();
    const bloques = bloquesFor(tx, rows);
    const excl = CFG.categoriasExcluidasGeneral.map(s => s.toUpperCase());
    const cats = [...new Set(rows.map(r => r.categoria).filter(Boolean))];
    const order = ['ACC', 'CALZ', 'INSUMO'];
    cats.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) || a.localeCompare(b));

    // --- Resumen categoría x bloque
    const cajasIds = bloques.filter(b => b.conCajas).map(b => b.id);
    const summary = cats.filter(c => !excl.includes(c)).map(cat => {
      const by = {}; let total = 0, cajas = 0;
      bloques.forEach(b => {
        by[b.id] = rows.filter(r => r.categoria === cat && r.bloque === b.id).reduce((s, r) => s + r.unidades, 0);
        total += by[b.id];
      });
      cajas = rows.filter(r => r.categoria === cat && cajasIds.includes(r.bloque)).reduce((s, r) => s + r.cajas, 0);
      return { cat, by, total, cajas };
    });
    const sumTot = { by: {}, total: 0, cajas: 0 };
    bloques.forEach(b => sumTot.by[b.id] = summary.reduce((s, r) => s + r.by[b.id], 0));
    sumTot.total = summary.reduce((s, r) => s + r.total, 0); sumTot.cajas = summary.reduce((s, r) => s + r.cajas, 0);

    // --- General (sin insumos): meta por usuario
    const gRows = rows.filter(r => !excl.includes(r.categoria) && bloques.some(b => b.id === r.bloque));
    const gen = pivot(gRows, days, r => r.unidades);
    const metaDia = CFG.metaDia[tx] || 0;
    gen.users.forEach(u => {
      let met = 0;
      days.forEach(d => { if ((u.by[d] || 0) >= CFG.minDiaUnidades) { const f = CFG.factorDia[dowOf(d)]; met += metaDia * (f == null ? 1 : f); } });
      u.meta = met; u.pct = met ? u.total / met : null;
    });
    gen.users.sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct) || b.total - a.total);
    gen.meta = gen.users.reduce((s, u) => s + u.meta, 0);
    gen.pct = gen.meta ? gen.total / gen.meta : null;
    if (sinMeta) { gen.users.forEach(u => { u.meta = 0; u.pct = null; }); gen.users.sort((a, b) => b.total - a.total); gen.meta = 0; gen.pct = null; }

    // --- Tablas de detalle
    const tables = [];
    tables.push({ id: 'general', title: 'REPORTE PRODUCCIÓN GENERAL (' + bloques.map(b => b.id).join(' + ') + ') — SIN INSUMOS', pv: gen, general: !sinMeta, sheet: 'General' });
    bloques.forEach(b => {
      const bRows = rows.filter(r => r.bloque === b.id);
      if (!b.conCajas) {
        cats.filter(c => !excl.includes(c)).forEach(c =>
          tables.push({ id: b.id + c, title: 'REPORTE PRODUCCIÓN ' + c + ' · ' + b.id, pv: pivot(bRows.filter(r => r.categoria === c), days, r => r.unidades), sheet: c + ' ' + b.id }));
        tables.push({ id: b.id + 'T', title: 'REPORTE PRODUCCIÓN ' + b.id + ' · TOTAL (SIN INSUMOS)', pv: pivot(bRows.filter(r => !excl.includes(r.categoria)), days, r => r.unidades), sheet: b.id + ' TOTAL' });
      } else {
        tables.push({ id: b.id + 'U', title: 'REPORTE PRODUCCIÓN ' + b.id + ' / UNIDADES (PARES)', pv: pivot(bRows, days, r => r.unidades), sheet: b.id + ' UND' });
        tables.push({ id: b.id + 'C', title: 'REPORTE PRODUCCIÓN ' + b.id + ' / CAJAS', pv: pivot(bRows, days, r => r.cajas), sheet: b.id + ' CAJAS' });
      }
    });

    // --- Series para gráficos (sin usuarios)
    const nonEx = cats.filter(c => !excl.includes(c));
    const chartCat = {
      labels: days.map(d => DOW[dowOf(d)] + ' ' + dm(d)),
      series: nonEx.map(c => ({ name: c, values: days.map(d => rows.filter(r => r.fecha === d && r.categoria === c).reduce((s, r) => s + r.unidades, 0)) }))
    };
    const chartBlq = {
      labels: chartCat.labels,
      series: bloques.map(b => ({ name: b.id, values: days.map(d => rows.filter(r => r.fecha === d && r.bloque === b.id && !excl.includes(r.categoria)).reduce((s, r) => s + r.unidades, 0)) }))
    };
    const dayTot = days.map((d, i) => chartCat.series.reduce((s, x) => s + x.values[i], 0));
    let best = -1, low = -1;
    dayTot.forEach((v, i) => { if (best < 0 || v > dayTot[best]) best = i; if (low < 0 || v < dayTot[low]) low = i; });

    return {
      tx, year, week, d0, d6, days, sinMeta: !!sinMeta, bloques, cats, summary, sumTot, gen, tables, chartCat, chartBlq, dayTot,
      best: best >= 0 ? { label: chartCat.labels[best], v: dayTot[best] } : null,
      low: low >= 0 ? { label: chartCat.labels[low], v: dayTot[low] } : null,
      users: gen.users.length, nRows: rows.length,
      generalTotal: gen.total
    };
  }

  /* ---------- Gráfico a PNG (canvas) ---------- */
  const PALETTE = ['#2f8f68', '#2f7fc1', '#e0a43a', '#8a6fbf', '#5f7388'];
  const COLOR_BY_NAME = { CALZ: '#2f8f68', ACC: '#2f7fc1', 'SOLI PACK': '#2d3139', 'PRE PACK': '#e0a43a' };
  const colorOf = (n, i) => COLOR_BY_NAME[n] || PALETTE[i % PALETTE.length];

  function chartPNG(title, ch, w, h) {
    w = w || 1000; h = h || 400; const S = 2;
    const c = document.createElement('canvas'); c.width = w * S; c.height = h * S;
    const g = c.getContext('2d'); g.scale(S, S);
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    const n = ch.labels.length;
    const totals = ch.labels.map((_, i) => ch.series.reduce((s, x) => s + x.values[i], 0));
    const mx = Math.max(1, ...totals);
    const mag = Math.pow(10, Math.floor(Math.log10(mx))), step0 = mag / 2;
    let top = Math.ceil(mx * 1.12 / step0) * step0; const ticks = 5; const step = top / ticks;
    const L = 84, R = 18, T = 80, B = 52, pw = w - L - R, ph = h - T - B;
    g.font = '700 24px Helvetica, Arial, sans-serif'; g.fillStyle = NAVY_HEX; g.textAlign = 'left'; g.fillText(title, L - 40, 30);
    // leyenda
    let lx = L - 40; g.font = '18px Helvetica, Arial, sans-serif';
    ch.series.forEach((s, i) => { g.fillStyle = colorOf(s.name, i); g.fillRect(lx, 45, 16, 16); g.fillStyle = '#41536a'; g.fillText(s.name, lx + 22, 59); lx += 42 + g.measureText(s.name).width; });
    g.textAlign = 'right'; g.font = '16px Helvetica, Arial, sans-serif';
    for (let i = 0; i <= ticks; i++) {
      const y = T + ph - (ph * i / ticks);
      g.strokeStyle = i ? '#e3e9f0' : '#9db0c4'; g.lineWidth = 1; g.beginPath(); g.moveTo(L, y); g.lineTo(w - R, y); g.stroke();
      g.fillStyle = '#6b7c8e'; g.fillText(fmt(step * i), L - 8, y + 6);
    }
    const slot = pw / Math.max(n, 1), bw = Math.min(slot * 0.58, 90);
    ch.labels.forEach((lab, i) => {
      const x = L + slot * i + (slot - bw) / 2; let y = T + ph;
      ch.series.forEach((s, si) => {
        const v = s.values[i]; if (!v) return;
        const hh = ph * v / top; y -= hh;
        g.fillStyle = colorOf(s.name, si); g.fillRect(x, y, bw, hh);
        if (hh > 22) { g.fillStyle = '#fff'; g.font = '700 16px Helvetica, Arial, sans-serif'; g.textAlign = 'center'; g.fillText(fmt(v), x + bw / 2, y + hh / 2 + 6); }
      });
      g.textAlign = 'center'; g.fillStyle = NAVY_HEX; g.font = '700 18px Helvetica, Arial, sans-serif';
      if (totals[i]) g.fillText(fmt(totals[i]), x + bw / 2, y - 8);
      g.fillStyle = '#41536a'; g.font = '17px Helvetica, Arial, sans-serif';
      g.fillText(lab, x + bw / 2, T + ph + 28);
    });
    return { url: c.toDataURL('image/png'), w, h };
  }

  /* ---------- Textos de reporte ---------- */
  const repTitle = r => 'REPORTE EJECUTIVO DE PRODUCCIÓN · ' + r.tx + (r.sinMeta ? ' · AVANCE' : ' · VS META');
  const repSub = r => 'Semana ' + r.week + ' / ' + r.year + ' · ' + dmy(r.d0) + ' al ' + dmy(r.d6);
  const repFile = r => CFG.nombreArchivo + '_Reporte_' + r.tx + (r.sinMeta ? '_Avance' : '_VsMeta') + '_Sem' + pad(r.week) + '_' + r.year;
  function kpisOf(r) {
    const pct = r.gen.pct;
    const k = [
      ['Total ' + r.tx.toLowerCase() + ' (sin insumos)', fmt(r.gen.total)],
      ['Meta de la semana', r.gen.meta ? fmt(r.gen.meta) : '-'],
      ['Cumplimiento vs meta', pct == null ? '-' : Math.round(pct * 100) + '%', pct == null ? null : semaforo(pct)],
      ['Cant. cajas', fmt(r.sumTot.cajas)],
      ['Usuarios activos', fmt(r.users)],
      ['Mejor día', r.best ? r.best.label + ' · ' + fmt(r.best.v) : '-']
    ];
    return r.sinMeta ? k.filter((x, i) => i !== 1 && i !== 2) : k;
  }
  function lectura(r) {
    const out = [];
    if (r.best) out.push('Mejor día: ' + r.best.label + ' con ' + fmt(r.best.v) + ' unidades.');
    if (r.low && r.days.length > 1) out.push('Día más bajo: ' + r.low.label + ' con ' + fmt(r.low.v) + ' unidades.');
    const gtot = r.sumTot.total || 1;
    r.bloques.forEach(b => out.push(b.id + ' representa el ' + Math.round(100 * r.sumTot.by[b.id] / gtot) + '% de la producción SIN INSUMOS (' + fmt(r.sumTot.by[b.id]) + ').'));
    if (r.gen.pct != null) out.push('Cumplimiento semanal vs meta: ' + Math.round(r.gen.pct * 100) + '% (brecha ' + fmt(r.gen.total - r.gen.meta) + ').');
    return out;
  }

  /* ---------- PDF del reporte ---------- */
  async function reportPDF(r) {
    await ensure(['pdf']);
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;
    const draw = () => drawHeader(doc, repTitle(r), repSub(r), W);
    draw();
    let y = 27;
    const k = kpisOf(r);
    y = chipsAndKpis(doc, { chips: [['Transacción', r.tx], ['Semana', r.week + ' / ' + r.year], ['Período', dm(r.d0) + ' – ' + dm(r.d6)], ['Días con datos', r.days.length]], kpis: k }, W, y);

    // Resumen
    const sumHead = [['Categoría'].concat(r.bloques.map(b => b.id), ['Cant. cajas', 'Total'])];
    const sumBody = r.summary.map(s => [s.cat].concat(r.bloques.map(b => fmt(s.by[b.id])), [fmt(s.cajas), fmt(s.total)]));
    const sumFoot = [['Total general'].concat(r.bloques.map(b => fmt(r.sumTot.by[b.id])), [fmt(r.sumTot.cajas), fmt(r.sumTot.total)])];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY); doc.text('Resumen de producción — SIN INSUMOS', 12, y + 3);
    doc.autoTable({
      head: sumHead, body: sumBody, foot: sumFoot, startY: y + 6, margin: { left: 12 }, tableWidth: 128, theme: 'striped',
      styles: { fontSize: 10.5, cellPadding: 2.4, halign: 'center' }, headStyles: { fillColor: NAVY, textColor: 255, halign: 'center' },
      footStyles: { fillColor: [238, 239, 241], textColor: NAVY, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 248, 249] },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } }
    });
    let ty = doc.lastAutoTable.finalY + 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text('Total ' + r.tx.charAt(0) + r.tx.slice(1).toLowerCase() + ' (sin insumos): ' + fmt(r.sumTot.total), 12, ty + 3);
    // Lectura ejecutiva
    ty += 11; doc.setFontSize(12); doc.text('Lectura ejecutiva', 12, ty);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(50, 65, 85);
    lectura(r).forEach((t, i) => { const lines = doc.splitTextToSize('• ' + t, 128); doc.text(lines, 12, ty + 7 + i * 6.4); ty += (lines.length - 1) * 5; });

    // Gráficos (derecha)
    const c1 = chartPNG('Producción diaria por categoría', r.chartCat), c2 = chartPNG('Producción diaria por tipo (' + r.bloques.map(b => b.id).join(' / ') + ')', r.chartBlq);
    const cw = 136, ch1 = cw * c1.h / c1.w;
    doc.addImage(c1.url, 'PNG', 149, y, cw, ch1, undefined, 'FAST');
    doc.addImage(c2.url, 'PNG', 149, y + ch1 + 4, cw, cw * c2.h / c2.w, undefined, 'FAST');

    // Tablas
    r.tables.forEach(t => {
      doc.addPage(); draw();
      const nd = r.days.length;
      const head = ['Usuario'].concat(r.days.map(d => DOW[dowOf(d)] + ' ' + dm(d)), ['Total'], t.general ? ['Meta', '% vs Meta'] : []);
      const body = t.pv.users.map(u => [u.usuario].concat(r.days.map(d => u.by[d] ? fmt(u.by[d]) : ''), [fmt(u.total)],
        t.general ? [u.meta ? fmt(u.meta) : '', u.pct == null ? '—' : Math.round(u.pct * 100) + '%'] : []));
      const foot = [['Total general'].concat(r.days.map(d => fmt(t.pv.byDay[d])), [fmt(t.pv.total)],
        t.general ? [fmt(t.pv.meta), t.pv.pct == null ? '—' : Math.round(t.pv.pct * 100) + '%'] : [])];
      const FS = 10, PADH = 3.2, cols = head.length, cw = new Array(cols).fill(0);
      doc.setFontSize(FS); doc.setFont('helvetica', 'bold');
      [head].concat(body, foot).forEach(row => row.forEach((c, i) => { cw[i] = Math.max(cw[i], doc.getTextWidth(String(c)) + 2 * PADH); }));
      const tw = cw.reduce((a, b) => a + b, 0), ml = Math.max(12, (W - tw) / 2);
      const cs = {}; cw.forEach((w, i) => { cs[i] = { cellWidth: w, halign: i ? 'center' : 'left' }; }); cs[0].fontStyle = 'bold'; cs[nd + 1].fontStyle = 'bold';
      doc.setFontSize(13); doc.setTextColor(...NAVY); doc.text(t.title, ml, 30);
      doc.autoTable({
        head: [head], body, foot, startY: 34, margin: { left: ml, right: ml, top: 26, bottom: 14 }, tableWidth: tw, theme: 'striped',
        styles: { fontSize: FS, cellPadding: { top: 1.8, bottom: 1.8, left: PADH, right: PADH }, halign: 'center', textColor: [30, 40, 55] },
        headStyles: { fillColor: NAVY, textColor: 255, halign: 'center' },
        footStyles: { fillColor: [238, 239, 241], textColor: NAVY, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 248, 249] },
        columnStyles: cs, showFoot: 'lastPage',
        didParseCell(h) {
          if (!t.general || h.column.index !== nd + 3) return;
          if (h.section === 'body') {
            const u = t.pv.users[h.row.index]; if (u.pct == null) return;
            const s = SEM[semaforo(u.pct)]; h.cell.styles.fillColor = s.fill; h.cell.styles.textColor = s.text; h.cell.styles.fontStyle = 'bold'; h.cell.styles.halign = 'center';
          } else if (h.section === 'foot' && t.pv.pct != null) {
            const s = SEM[semaforo(t.pv.pct)]; h.cell.styles.fillColor = s.fill; h.cell.styles.textColor = s.text; h.cell.styles.halign = 'center';
          }
        },
        didDrawPage() { draw(); }
      });
    });
    footers(doc, W, H);
    doc.save(repFile(r) + '.pdf');
  }

  /* ---------- Excel del reporte ---------- */
  async function reportXLSX(r) {
    await ensure(['xlsx']);
    const wb = new global.ExcelJS.Workbook(); wb.creator = CFG.empresa; wb.created = new Date();
    const fillOf = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });
    const NAV = 'FF2D3139';
    const banner = (ws, nc, title, sub) => {
      ws.mergeCells(1, 1, 1, nc); const a = ws.getCell(1, 1); a.value = title; a.font = { bold: true, size: 15, color: { argb: 'FFFFFFFF' } }; a.fill = fillOf(NAV); a.alignment = { vertical: 'middle' }; ws.getRow(1).height = 30;
      ws.mergeCells(2, 1, 2, nc); const b = ws.getCell(2, 1); b.value = sub; b.font = { size: 10, color: { argb: 'FF41536A' } };
    };
    const head = (row, vals) => vals.forEach((t, i) => { const c = row.getCell(i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = fillOf(NAV); c.alignment = { horizontal: i ? 'center' : 'left' }; });
    const numc = (c, v, bold) => { c.value = v; c.numFmt = '#,##0'; c.alignment = { horizontal: 'center' }; if (bold) c.font = { bold: true }; };

    // Hoja Resumen
    const ws = wb.addWorksheet('Resumen', { views: [{ showGridLines: false }] });
    const nc = 3 + r.bloques.length;
    banner(ws, 9, repTitle(r), repSub(r));
    ws.getRow(4).getCell(1).value = 'Resumen de producción — SIN INSUMOS'; ws.getRow(4).getCell(1).font = { bold: true, size: 12, color: { argb: NAV } };
    head(ws.getRow(5), ['Categoría'].concat(r.bloques.map(b => b.id), ['Cant. cajas', 'Total']));
    r.summary.forEach((s, i) => { const row = ws.getRow(6 + i); row.getCell(1).value = s.cat; row.getCell(1).font = { bold: true }; r.bloques.forEach((b, j) => numc(row.getCell(2 + j), s.by[b.id])); numc(row.getCell(2 + r.bloques.length), s.cajas); numc(row.getCell(3 + r.bloques.length), s.total, true); });
    const fr = ws.getRow(6 + r.summary.length);
    fr.getCell(1).value = 'Total general'; r.bloques.forEach((b, j) => numc(fr.getCell(2 + j), r.sumTot.by[b.id])); numc(fr.getCell(2 + r.bloques.length), r.sumTot.cajas); numc(fr.getCell(3 + r.bloques.length), r.sumTot.total);
    for (let i = 1; i <= nc; i++) { const c = fr.getCell(i); c.font = { bold: true, color: { argb: NAV } }; c.fill = fillOf('FFEEEFF1'); c.border = { top: { style: 'medium', color: { argb: NAV } } }; }
    const kr = 8 + r.summary.length;
    ws.getRow(kr).getCell(1).value = 'Indicadores'; ws.getRow(kr).getCell(1).font = { bold: true, size: 12, color: { argb: NAV } };
    kpisOf(r).forEach(([l, v, tone], i) => { const row = ws.getRow(kr + 1 + i); row.getCell(1).value = l; row.getCell(2).value = v; row.getCell(2).font = { bold: true, color: { argb: tone ? SEM[tone].hexText : NAV } }; if (tone) row.getCell(2).fill = fillOf(SEM[tone].hexFill); row.getCell(2).alignment = { horizontal: 'center' }; });
    const lr = kr + 8;
    ws.getRow(lr).getCell(1).value = 'Lectura ejecutiva'; ws.getRow(lr).getCell(1).font = { bold: true, size: 12, color: { argb: NAV } };
    lectura(r).forEach((t, i) => { ws.getRow(lr + 1 + i).getCell(1).value = '• ' + t; });
    ws.getColumn(1).width = 30; for (let i = 2; i <= 9; i++) ws.getColumn(i).width = 15;
    const c1 = chartPNG('Producción diaria por categoría', r.chartCat), c2 = chartPNG('Producción diaria por tipo', r.chartBlq);
    const i1 = wb.addImage({ base64: c1.url, extension: 'png' }), i2 = wb.addImage({ base64: c2.url, extension: 'png' });
    const gr = lr + lectura(r).length + 3;
    ws.addImage(i1, { tl: { col: 0, row: gr }, ext: { width: 640, height: Math.round(640 * c1.h / c1.w) } });
    ws.addImage(i2, { tl: { col: 0, row: gr + 18 }, ext: { width: 640, height: Math.round(640 * c2.h / c2.w) } });

    // Hojas de detalle
    r.tables.forEach(t => {
      const name = t.sheet.replace(/[\\/?*\[\]:]/g, '-').slice(0, 31);
      const w = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }] });
      const cols = 1 + r.days.length + 1 + (t.general ? 2 : 0);
      banner(w, cols, t.title, repSub(r));
      w.getRow(3).height = 6;
      head(w.getRow(4), ['Usuario'].concat(r.days.map(d => DOW[dowOf(d)] + ' ' + dm(d)), ['Total'], t.general ? ['Meta', '% vs Meta'] : []));
      t.pv.users.forEach((u, i) => {
        const row = w.getRow(5 + i); row.getCell(1).value = u.usuario; row.getCell(1).font = { bold: true };
        r.days.forEach((d, j) => { if (u.by[d]) numc(row.getCell(2 + j), u.by[d]); });
        numc(row.getCell(2 + r.days.length), u.total, true);
        if (t.general) {
          if (u.meta) numc(row.getCell(3 + r.days.length), u.meta);
          const p = row.getCell(4 + r.days.length); p.alignment = { horizontal: 'center' };
          if (u.pct == null) p.value = '—'; else { const s = SEM[semaforo(u.pct)]; p.value = u.pct; p.numFmt = '0%'; p.font = { bold: true, color: { argb: s.hexText } }; p.fill = fillOf(s.hexFill); }
        }
        if (i % 2) for (let c = 1; c <= cols - (t.general ? 1 : 0); c++) { const cell = row.getCell(c); if (!cell.fill || !cell.fill.fgColor) cell.fill = fillOf('FFF7FAFD'); }
      });
      const f = w.getRow(5 + t.pv.users.length); f.getCell(1).value = 'Total general';
      r.days.forEach((d, j) => numc(f.getCell(2 + j), t.pv.byDay[d])); numc(f.getCell(2 + r.days.length), t.pv.total);
      if (t.general) { numc(f.getCell(3 + r.days.length), t.pv.meta); const p = f.getCell(4 + r.days.length); if (t.pv.pct != null) { p.value = t.pv.pct; p.numFmt = '0%'; p.alignment = { horizontal: 'center' }; } }
      for (let c = 1; c <= cols; c++) { const cell = f.getCell(c); cell.font = { bold: true, color: { argb: NAV } }; cell.fill = fillOf('FFEEEFF1'); cell.border = { top: { style: 'medium', color: { argb: NAV } } }; }
      if (t.general && t.pv.pct != null) { const s = SEM[semaforo(t.pv.pct)]; const p = f.getCell(4 + r.days.length); p.fill = fillOf(s.hexFill); p.font = { bold: true, color: { argb: s.hexText } }; }
      w.getColumn(1).width = 20; for (let c = 2; c <= cols; c++) w.getColumn(c).width = 13;
    });
    const buf = await wb.xlsx.writeBuffer();
    download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), repFile(r) + '.xlsx');
  }

  /* ---------- Ventana "Generar reporte" ---------- */
  function openReportModal(opts) {
    opts = opts || {};
    const all = normRows();
    const weeksOf = tx => {
      const set = new Map();
      all.filter(r => r.transaccion === tx).forEach(r => { const w = isoWeekOf(r.fecha); set.set(w.year + '-' + w.week, w); });
      return [...set.values()].sort((a, b) => b.year - a.year || b.week - a.week);
    };
    let modo = (typeof CFG.getModo === 'function' ? String(CFG.getModo() || '') : '').toUpperCase();
    if (modo !== 'PICKING' && modo !== 'PACKING') modo = opts.transaccion || 'PACKING';
    const hoy = isoWeekOf(toISO(new Date()));
    let st = { md: 'meta', tx: modo, year: hoy.year, week: hoy.week };
    const initWeeks = weeksOf(st.tx); if (initWeeks.length) { st.year = initWeeks[0].year; st.week = initWeeks[0].week; }

    const m = modal(
      '<div class="wmsx-mh"><div><h3>Generar reporte de producción</h3><p>Elige la semana y la transacción</p></div><button class="wmsx-x" data-close aria-label="Cerrar">×</button></div>' +
      '<div class="wmsx-mb">' +
      '<div class="wmsx-sec"><span class="wmsx-lb">Tipo de reporte</span><div class="wmsx-seg"><button data-md="meta">Producción vs Meta</button><button data-md="avance">Producción vs Avance</button></div></div>' +
      '<div class="wmsx-sec"><span class="wmsx-lb">Transacción</span><div class="wmsx-seg"><button data-tx="PICKING">PICKING</button><button data-tx="PACKING">PACKING</button></div></div>' +
      '<div class="wmsx-sec"><span class="wmsx-lb">Semana</span><div class="wmsx-week">' +
      '<button class="wmsx-step" data-step="-1" aria-label="Semana anterior">‹</button>' +
      '<input id="wmsx-w" type="number" min="1" max="53" aria-label="Número de semana">' +
      '<input id="wmsx-y" type="number" min="2020" max="2100" aria-label="Año" style="width:92px">' +
      '<button class="wmsx-step" data-step="1" aria-label="Semana siguiente">›</button></div>' +
      '<div class="wmsx-week" style="margin-top:8px"><select id="wmsx-sel" aria-label="Semanas con datos"></select></div>' +
      '<div class="wmsx-range" id="wmsx-range"></div></div>' +
      '<div class="wmsx-sec"><div class="wmsx-stat" id="wmsx-stat"></div></div></div>' +
      '<div class="wmsx-mf"><button class="wmsx-b" data-close>Cancelar</button>' +
      '<button class="wmsx-b xl" data-go="xlsx">Excel</button><button class="wmsx-b pd" data-go="pdf">PDF</button></div>');

    const $w = m.$('#wmsx-w'), $y = m.$('#wmsx-y'), $sel = m.$('#wmsx-sel'), $range = m.$('#wmsx-range'), $stat = m.$('#wmsx-stat');
    function refresh(fromSel) {
      st.week = Math.min(Math.max(+$w.value || 1, 1), 53); st.year = +$y.value || st.year;
      const d0 = isoWeekStart(st.year, st.week);
      $range.innerHTML = 'Del <b>' + DOW[1] + ' ' + dmy(d0) + '</b> al <b>' + DOW[0] + ' ' + dmy(addDays(d0, 6)) + '</b>';
      m.$$('[data-tx]').forEach(b => b.classList.toggle('on', b.dataset.tx === st.tx));
      m.$$('[data-md]').forEach(b => b.classList.toggle('on', b.dataset.md === st.md));
      if (!fromSel) {
        const ws = weeksOf(st.tx);
        $sel.innerHTML = '<option value="">Semanas con datos (' + st.tx + ')…</option>' + ws.map(w => '<option value="' + w.year + '-' + w.week + '"' + (w.year === st.year && w.week === st.week ? ' selected' : '') + '>Semana ' + w.week + ' · ' + w.year + ' (' + dm(isoWeekStart(w.year, w.week)) + ' – ' + dm(addDays(isoWeekStart(w.year, w.week), 6)) + ')</option>').join('');
      }
      const rows = all.filter(r => r.transaccion === st.tx && r.fecha >= d0 && r.fecha <= addDays(d0, 6));
      const dias = new Set(rows.map(r => r.fecha)).size;
      const und = rows.filter(r => !CFG.categoriasExcluidasGeneral.includes(r.categoria)).reduce((s, r) => s + r.unidades, 0);
      const ok = rows.length > 0;
      $stat.classList.toggle('warn', !ok);
      $stat.textContent = ok ? dias + ' día(s) con datos · ' + fmt(und) + ' unidades (sin insumos) · ' + new Set(rows.map(r => r.usuario)).size + ' usuarios' : 'No hay datos de ' + st.tx + ' en esa semana.';
      m.$$('[data-go]').forEach(b => b.disabled = !ok);
    }
    $w.value = st.week; $y.value = st.year; refresh();
    $w.addEventListener('input', () => refresh()); $y.addEventListener('input', () => refresh());
    $sel.addEventListener('change', () => { if (!$sel.value) return; const [y, w] = $sel.value.split('-'); $y.value = y; $w.value = w; refresh(true); });
    m.$$('[data-tx]').forEach(b => b.addEventListener('click', () => { st.tx = b.dataset.tx; const ws = weeksOf(st.tx); if (ws.length && !ws.some(w => w.year === +$y.value && w.week === +$w.value)) { $y.value = ws[0].year; $w.value = ws[0].week; } refresh(); }));
    m.$$('[data-md]').forEach(b => b.addEventListener('click', () => { st.md = b.dataset.md; refresh(true); }));
    m.$$('[data-step]').forEach(b => b.addEventListener('click', () => {
      let w = (+$w.value || 1) + (+b.dataset.step), y = +$y.value || st.year;
      if (w < 1) { y--; w = weeksInYear(y); } else if (w > weeksInYear(y)) { y++; w = 1; }
      $w.value = w; $y.value = y; refresh();
    }));
    m.$$('[data-go]').forEach(b => b.addEventListener('click', async () => {
      const fmtSel = b.dataset.go; const old = b.textContent; b.disabled = true; b.textContent = 'Generando…';
      try {
        const rep = buildReport(normRows(), { year: st.year, week: st.week, transaccion: st.tx, sinMeta: st.md === 'avance' });
        if (!rep.nRows) throw new Error('Sin datos para la semana elegida');
        if (fmtSel === 'pdf') await reportPDF(rep); else await reportXLSX(rep);
        m.close(); toast('Reporte generado');
      } catch (e) { console.error(e); b.disabled = false; b.textContent = old; toast('No se pudo generar: ' + e.message, true); }
    }));
    return m;
  }

  /** Crea el botón "Generar reporte" dentro de `target` (selector o elemento). */
  function mountReportButton(target, o) {
    injectCSS(); o = o || {};
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host) { console.warn('WMSX: contenedor no encontrado', target); return null; }
    const b = document.createElement('button');
    b.type = 'button'; b.className = o.className || 'wmsx-btn'; b.id = o.id || 'wmsx-report-btn';
    b.innerHTML = o.html || '📊 Generar reporte';
    b.addEventListener('click', () => openReportModal(o));
    if (o.before) host.insertBefore(b, typeof o.before === 'string' ? host.querySelector(o.before) : o.before); else host.appendChild(b);
    return b;
  }

  /* ================================================================
   *  API PÚBLICA
   * ================================================================ */
  function configure(o) {
    Object.keys(o || {}).forEach(k => {
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && CFG[k] && typeof CFG[k] === 'object') Object.assign(CFG[k], o[k]);
      else CFG[k] = o[k];
    });
    return CFG;
  }
  global.WMSX = {
    version: '1.1.0', configure, PP, exportMenu, exportMatriz, exportTable,
    mountReportButton, openReportModal,
    // expuestos para pruebas / uso avanzado
    _buildReport: (rows, o) => buildReport(rows, o), _normRows: normRows, _isoWeekOf: isoWeekOf, _isoWeekStart: isoWeekStart,
    _reportPDF: reportPDF, _reportXLSX: reportXLSX, _chartPNG: chartPNG, _cfg: CFG
  };
})(window);
