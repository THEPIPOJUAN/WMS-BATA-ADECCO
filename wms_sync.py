#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WMS EN LÍNEA · Conector WMS Oracle Cloud → Dashboard Productividad WMS
======================================================================
Qué hace (cada vez que corre):
  1. Pide al WMS (API LGF) las líneas de PACKING de los últimos días.
  2. Les aplica la MISMA lógica del dashboard (zona por RUTAS, contenedor 508, cantidad convertida,
     categoría por Maestro SKU, área, turno).
  3. Escribe un CSV por día en la carpeta data/ + data/index.json.
  El dashboard lee esa carpeta solo y se actualiza (no hay que subir nada a mano).

Uso:
  python wms_sync.py diagnostico → comprueba hasta dónde llega la conexión con el WMS
  python wms_sync.py probar     → muestra los campos reales que devuelve el WMS (para confirmar el MAPEO)
  python wms_sync.py            → sincroniza

Claves: se leen de variables de entorno (GitHub Secrets). NUNCA se escriben en este archivo:
  WMS_USER, WMS_PASS            usuario y clave del WMS
Opcionales (valores por defecto abajo): WMS_BASE, WMS_ENTIDAD, WMS_CAMPO_FECHA, WMS_DIAS, WMS_TZ, WMS_TZ_API, WMS_MAPEO
"""
import os, sys, json, gzip, base64, re, unicodedata, hashlib, time, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

def env(n, d=''):
    return os.environ.get(n) or d

# ------------------------- CONFIGURACIÓN (ajustar tras «probar») -------------------------
BASE        = env('WMS_BASE', 'https://a10.wms.ocs.oraclecloud.com/bata').rstrip('/')
ENTIDAD     = env('WMS_ENTIDAD', 'allocation')        # ⚠ POR CONFIRMAR: entidad de la API con las líneas de packing
CAMPO_FECHA = env('WMS_CAMPO_FECHA', 'mod_ts')        # ⚠ POR CONFIRMAR: campo de fecha/hora de modificación
DIAS        = int(env('WMS_DIAS', '2'))               # cuántos días hacia atrás se vuelven a leer
DIAS_GUARDAR= int(env('WMS_DIAS_GUARDAR', '14'))      # cuántos días se conservan en data/
TZ_LOCAL    = ZoneInfo(env('WMS_TZ', 'America/Lima'))
TZ_API      = ZoneInfo(env('WMS_TZ_API', 'UTC'))      # zona en que el API entrega las horas
PAGINA      = int(env('WMS_PAGINA', '500'))
TIMEOUT     = int(env('WMS_TIMEOUT', '25'))                      # segundos que se espera la respuesta del WMS
CARPETA     = env('WMS_CARPETA', 'data')
# Campo del WMS  →  columna del Excel de packing que usa el dashboard.   ⚠ POR CONFIRMAR con «probar»
MAPEO_DEFECTO = {
    'order_nbr':           'NUMERO DE ORDEN',
    'item_alternate_code': 'CODIGO DE ARTICULO',
    'dest_facility':       'INSTALACION DE DESTINO',
    'packed_qty':          'CANTIDAD EMPAQUETADA',
    'from_locn':           'DE UBICACION',
    'container_nbr':       'NUMERO DE CONTENEDOR',
    'mod_ts':              'REGISTRO DE HORA DE MODIFICACION',
    'mod_user':            'USUARIO DE MODIFICACION',
    'iblpn_nbr':           'NUMERO DE LPN DE ENTRADA',
    'item_desc':           'DESCRIPCION DE ARTICULO',
}
MAPEO = json.loads(env('WMS_MAPEO')) if env('WMS_MAPEO') else MAPEO_DEFECTO
REQUERIDAS = ['NUMERO DE ORDEN','CODIGO DE ARTICULO','INSTALACION DE DESTINO','CANTIDAD EMPAQUETADA','DE UBICACION',
              'NUMERO DE CONTENEDOR','REGISTRO DE HORA DE MODIFICACION','USUARIO DE MODIFICACION']
INSUMOS = ['9992849','9992847','9992846','9005800','9992848','9945990','9946996','9946995','9949997','9949998','9949999','9900300','9900301','9903902','9903903','9900602']
CABECERA = 'Fecha,Categoria,Usuario,Turno,Area,Tipo_Pedido,Orden_ID,Und_Cantidad Conv,Und_cantidad,Und_PRE PACK.,hora,Hora de selección,SKU,LPN,LPN_Destino,Ubicacion,Instalacion,Tienda'

# ------------------------------------ WMS (API LGF) ------------------------------------
def _auth():
    u, p = os.environ.get('WMS_USER'), os.environ.get('WMS_PASS')
    if not u or not p: sys.exit('Faltan los secretos WMS_USER y WMS_PASS.')
    return 'Basic ' + base64.b64encode(f'{u}:{p}'.encode()).decode()

def api_get(url, reintentos=2):
    ultimo = None
    for i in range(reintentos):
        try:
            rq = urllib.request.Request(url, headers={'Authorization': _auth(), 'Accept': 'application/json'})
            with urllib.request.urlopen(rq, timeout=TIMEOUT) as r: return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403): sys.exit(f'El WMS rechazó el usuario/clave o no tiene permiso (HTTP {e.code}).')
            if e.code == 404: sys.exit(f'El WMS dice que esa dirección no existe (HTTP 404). Revisa WMS_BASE y WMS_ENTIDAD.\nURL: {url}')
            ultimo = f'HTTP {e.code}'
        except Exception as e:
            ultimo = f'{type(e).__name__}: {e}'
        time.sleep(3)
    sys.exit(f'El WMS no respondió después de {reintentos} intentos de {TIMEOUT} s ({ultimo}).\n'
             'Lo más probable: el WMS o su firewall BLOQUEA las conexiones que vienen de los servidores de GitHub,\n'
             'o la dirección del API no es la correcta. Ejecuta el modo «diagnostico» para ver cuál de las dos.')

def url_entidad(extra=''):
    return f'{BASE}/wms/lgfapi/v10/entity/{ENTIDAD}/?{extra}'

def filas(desde_utc):
    """Pagina el API y entrega cada fila (dict)."""
    q = urllib.parse.urlencode({f'{CAMPO_FECHA}__gte': desde_utc, 'page_size': PAGINA, 'page_mode': 'sequenced', 'ordering': CAMPO_FECHA})
    url = url_entidad(q)
    while url:
        d = api_get(url)
        for r in d.get('results', []): yield r
        url = d.get('next_page')

def aplanar(r, pref=''):
    out = {}
    for k, v in r.items():
        if isinstance(v, dict): out.update(aplanar(v, f'{pref}{k}__'))
        else: out[f'{pref}{k}'] = v
    return out

def probar():
    d = api_get(url_entidad('page_size=3'))
    res = d.get('results', [])
    print(f'Entidad: {ENTIDAD} · filas devueltas: {len(res)} · total reportado: {d.get("result_count")}')
    if not res: print('Sin filas: revisa WMS_ENTIDAD o los permisos del usuario.'); return
    print('\nCAMPOS DISPONIBLES (campo = ejemplo):')
    for k, v in sorted(aplanar(res[0]).items()): print(f'  {k} = {str(v)[:60]}')
    falt = [c for c in MAPEO if c not in aplanar(res[0])]
    print('\nCampos del MAPEO que NO existen en la respuesta (hay que corregirlos):', falt or 'ninguno ✔')

def diagnostico():
    """Prueba paso a paso hasta dónde llega la conexión con el WMS (sin cambiar nada)."""
    import socket
    from urllib.parse import urlparse
    def paso(t): print('\n== ' + t + ' ==')
    def pedir(url, auth=False, t=None):
        t = t or TIMEOUT
        t0 = time.time()
        try:
            h = {'Accept': 'application/json,text/html'}
            if auth: h['Authorization'] = _auth()
            with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=t) as r:
                cuerpo = r.read(300).decode('utf-8', 'replace').replace('\n', ' ')
                print(f'  Respondió HTTP {r.status} en {time.time()-t0:.1f} s · Server: {r.headers.get("Server")} · Tipo: {r.headers.get("Content-Type")}')
                print('  Inicio de la respuesta:', cuerpo[:160]); return r.status
        except urllib.error.HTTPError as e:
            print(f'  Respondió HTTP {e.code} en {time.time()-t0:.1f} s (el servidor SÍ contestó) · Server: {e.headers.get("Server")}')
            print('  Inicio de la respuesta:', e.read(200).decode('utf-8', 'replace').replace('\n', ' ')[:160]); return e.code
        except Exception as e:
            print(f'  SIN RESPUESTA tras {time.time()-t0:.1f} s → {type(e).__name__}: {e}'); return None
    paso('1) Desde dónde sale el robot')
    try: print('  IP pública del robot de GitHub:', urllib.request.urlopen('https://api.ipify.org', timeout=5).read().decode())
    except Exception as e: print('  (no pude leer la IP)', e)
    host = urlparse(BASE).hostname
    paso(f'2) Dirección del WMS ({host})')
    try: print('  IP del WMS:', sorted({x[4][0] for x in socket.getaddrinfo(host, 443)}))
    except Exception as e: print('  No se pudo resolver el nombre:', e)
    paso('3) Página principal del WMS (sin usuario)'); pedir(BASE + '/index/')
    paso('4) API LGF SIN usuario (lo normal es HTTP 401)'); r4 = pedir(url_entidad('page_size=1'))
    paso('5) API LGF CON usuario y clave'); r5 = pedir(url_entidad('page_size=1'), auth=True)
    print('\n== CONCLUSIÓN ==')
    if r4 is None and r5 is None: print('  El WMS no contesta a este robot: casi seguro BLOQUEA los servidores de GitHub (o la dirección del API es otra).\n  Alternativa: ejecutar el mismo robot en tu PC (Plan B del LEEME).')
    elif r5 in (401, 403): print('  El WMS contesta pero rechaza el usuario/clave: revisa los Secrets WMS_USER y WMS_PASS (o los permisos del usuario).')
    elif r5 == 404 or r4 == 404: print('  La dirección del API no existe: revisa WMS_BASE y WMS_ENTIDAD.')
    elif r5 == 200: print('  ¡Todo bien! Ahora ejecuta el modo «probar» para ver los campos.')
    else: print('  Resultado mixto: copia todo este registro y envíamelo.')

# ------------------------------------ Datos del dashboard ------------------------------------
def nrm(s): return unicodedata.normalize('NFD', str(s or '')).encode('ascii', 'ignore').decode().strip().upper()
def limpia(s): return re.sub(r'[",]', ' ', re.sub(r'[^\x20-\x7E]', ' ', unicodedata.normalize('NFD', str(s if s is not None else '')).encode('ascii', 'ignore').decode())).strip()

def leer_nube():
    """Lee RUTAS y MAESTRO del dashboard (Supabase) usando la clave pública de config.js."""
    try:
        cfg = open('config.js', encoding='utf-8').read()
        url = re.search(r"url:\s*'([^']+)'", cfg).group(1); key = re.search(r"anonKey:\s*'([^']+)'", cfg).group(1)
        rq = urllib.request.Request(f'{url}/rest/v1/dashboard_snapshots?id=eq.1&select=payload', headers={'apikey': key, 'Authorization': f'Bearer {key}'})
        p = json.loads(urllib.request.urlopen(rq, timeout=60).read().decode())[0]['payload']
        if isinstance(p, dict) and p.get('format') == 'gz1': p = json.loads(gzip.decompress(base64.b64decode(p['data'])).decode('utf-8'))
        return p.get('rutas') or [], p.get('maestro') or []
    except Exception as e:
        print('Aviso: no pude leer RUTAS/MAESTRO de la nube:', e); return [], []

def cdg_key(c):
    s = str(c).strip(); return str(int(s)) if s.isdigit() else s

# ------------------------------------ Lógica de PACKING (igual al dashboard) ------------------------------------
def convertir(raws, rutas, maestro):
    """raws: lista de dict con las columnas del Excel de packing (claves normalizadas). Devuelve {fecha: [líneas CSV]} + estadísticas."""
    zona = {cdg_key(r['cdg']): r for r in rutas}
    cat_m = {}
    for m in maestro:
        c = nrm(m.get('cat'))
        c = 'CALZ' if c.startswith('CALZ') else 'ACC' if c.startswith('ACC') else 'INSUMO' if c.startswith('INSUM') else 'MATERIALES' if c.startswith('MATERIAL') else ''
        if c: cat_m[str(m['sku']).strip()] = c
    por_dia, omit = {}, 0
    for r in raws:
        sku = str(r.get('CODIGO DE ARTICULO') or '').strip(); dest = str(r.get('INSTALACION DE DESTINO') or '').strip(); cont = str(r.get('NUMERO DE CONTENEDOR') or '')
        ruta = zona.get(cdg_key(dest)); z = (ruta or {}).get('zona') or 'OTROS'
        try: D = float(r.get('CANTIDAD EMPAQUETADA') or 0)
        except ValueError: D = 0
        if z == 'OTROS' or not cont.startswith('508') or D <= 0: omit += 1; continue          # cantidad 0 → se omite
        t = r.get('_ts')
        if not t: omit += 1; continue
        cat = cat_m.get(sku) or cat_m.get(sku[:7]) or ('MATERIALES' if len(sku) == 5 else 'INSUMO' if sku[:7] in INSUMOS else 'ACC' if sku[:1] == '9' else 'CALZ')
        l12 = len(sku) == 12
        try: mu = int(sku[10:12])
        except ValueError: mu = None
        E = D if l12 else (D if mu is None else mu * D); G = 0 if l12 else E
        x = str(r.get('DE UBICACION') or '').strip().upper(); area = (x[:3] if x[:1] in ('S', 'A') else x[:5]) or 'SIN AREA'
        fecha = t.strftime('%Y-%m-%d'); turno = 'NOCHE' if (t.hour >= 18 or t.hour < 6) else 'DIA'
        f = lambda n: ('%g' % n)
        linea = ','.join([fecha, cat, limpia(r.get('USUARIO DE MODIFICACION')), turno, limpia(area), z, limpia(r.get('NUMERO DE ORDEN')), f(E), f(D), f(G), str(t.hour),
                          t.strftime('%Y-%m-%d %H:%M:%S'), limpia(sku), limpia(r.get('NUMERO DE LPN DE ENTRADA')), limpia(cont), limpia(x), limpia(dest), limpia((ruta or {}).get('tienda'))])
        por_dia.setdefault(fecha, []).append((linea, E))
    return por_dia, omit

def fila_a_raw(r):
    """Fila del WMS → columnas del Excel de packing (según MAPEO) + fecha/hora local."""
    a = aplanar(r); o = {}
    for campo, col in MAPEO.items(): o[col] = a.get(campo)
    ts = o.get('REGISTRO DE HORA DE MODIFICACION'); t = None
    if ts:
        try:
            t = datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
            if t.tzinfo is None: t = t.replace(tzinfo=TZ_API)
            t = t.astimezone(TZ_LOCAL)
        except ValueError: t = None
    o['_ts'] = t
    return o

# ------------------------------------ Salida ------------------------------------
def escribir(por_dia):
    os.makedirs(CARPETA, exist_ok=True); archivos = []
    for fecha, ls in sorted(por_dia.items()):
        nombre = f'packing_{fecha}.csv'; ruta = os.path.join(CARPETA, nombre)
        texto = '\ufeff' + CABECERA + '\n' + '\n'.join(l for l, _ in ls) + '\n'
        previo = open(ruta, encoding='utf-8').read() if os.path.exists(ruta) else None
        if previo != texto: open(ruta, 'w', encoding='utf-8', newline='\n').write(texto)
        archivos.append({'nombre': nombre, 'op': 'PACKING', 'fecha': fecha, 'lineas': len(ls), 'unidades': round(sum(e for _, e in ls)),
                         'hash': hashlib.md5(texto.encode()).hexdigest()[:10]})
    # conservar solo los últimos días
    limite = (datetime.now(TZ_LOCAL) - timedelta(days=DIAS_GUARDAR)).strftime('%Y-%m-%d')
    for n in os.listdir(CARPETA):
        m = re.match(r'packing_(\d{4}-\d{2}-\d{2})\.csv$', n)
        if m and m.group(1) < limite and m.group(1) not in por_dia: os.remove(os.path.join(CARPETA, n))
    previos = []
    ip = os.path.join(CARPETA, 'index.json')
    if os.path.exists(ip):
        try: previos = [a for a in json.load(open(ip, encoding='utf-8')).get('archivos', []) if a['fecha'] not in por_dia and a['fecha'] >= limite]
        except Exception: pass
    idx = {'archivos': sorted(previos + archivos, key=lambda a: a['fecha'])}
    nuevo_hash = hashlib.md5(json.dumps(idx['archivos'], sort_keys=True).encode()).hexdigest()
    anterior = json.load(open(ip, encoding='utf-8')) if os.path.exists(ip) else {}
    if anterior.get('hash') != nuevo_hash:
        idx.update({'generado': datetime.now(TZ_LOCAL).isoformat(timespec='seconds'), 'hash': nuevo_hash, 'fuente': 'WMS Oracle Cloud'})
        json.dump(idx, open(ip, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    else:   # sin cambios en los datos: se marca la hora de revisión como máximo 1 vez por hora (evita guardar cambios vacíos)
        ult = anterior.get('revisado') or anterior.get('generado')
        if not ult or (datetime.now(TZ_LOCAL) - datetime.fromisoformat(ult)).total_seconds() > 3300:
            anterior['revisado'] = datetime.now(TZ_LOCAL).isoformat(timespec='seconds'); json.dump(anterior, open(ip, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return archivos

def sincronizar():
    faltan = [c for c in REQUERIDAS if c not in MAPEO.values()]
    if faltan: sys.exit(f'El MAPEO no cubre estas columnas: {faltan}')
    desde = (datetime.now(TZ_LOCAL) - timedelta(days=DIAS)).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(TZ_API).strftime('%Y-%m-%dT%H:%M:%S')
    rutas, maestro = leer_nube()
    if not rutas: sys.exit('No hay RUTAS cargadas en el dashboard: súbelas primero (módulo Rutas).')
    raws = [fila_a_raw(r) for r in filas(desde)]
    por_dia, omit = convertir(raws, rutas, maestro)
    arch = escribir(por_dia)
    print(f'WMS: {len(raws)} filas leídas · {omit} omitidas (cantidad 0 / OTROS / PEND) · {sum(a["lineas"] for a in arch)} líneas en {len(arch)} día(s)')
    for a in arch: print('  ', a['nombre'], a['lineas'], 'líneas', a['unidades'], 'und conv')

if __name__ == '__main__':
    modo = sys.argv[1] if len(sys.argv) > 1 else 'sincronizar'
    {'probar': probar, 'diagnostico': diagnostico}.get(modo, sincronizar)()
