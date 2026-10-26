/* Ponci Tracker — lógica de la aplicación (JavaScript vanilla, sin dependencias). */
(() => {
  'use strict';

  /* =====================================================================
     1. CONSTANTES Y UTILIDADES BÁSICAS
     ===================================================================== */
  const CLAVE = 'ponci-tracker:v1';        // clave versionada de localStorage
  const ZONA = 'America/Santiago';
  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const PESO_MIN = 40;
  const PESO_MAX = 250;

  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

  /** Escapa texto del usuario antes de insertarlo como HTML. */
  function esc(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /* ---------- Números: se muestran con coma y se aceptan con coma o punto ---------- */

  /** 1234.5 -> "1234,5" */
  function num(n, dec = 1) {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return Number(n).toFixed(dec).replace('.', ',');
  }

  /** Número con signo explícito: +0,8 / −0,8 / 0,0 */
  function conSigno(n, dec = 1) {
    const r = Number(Number(n).toFixed(dec));
    if (r === 0) return num(0, dec);
    return (r > 0 ? '+' : '−') + num(Math.abs(r), dec);
  }

  /** Número que puede ser negativo, con el signo menos tipográfico. */
  function numNeg(n, dec = 1) {
    const r = Number(Number(n).toFixed(dec));
    return (r < 0 ? '−' : '') + num(Math.abs(r), dec);
  }

  /** Lee texto escrito por el usuario. Devuelve null si está vacío, NaN si es inválido. */
  function leerNumero(texto) {
    const s = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (s === '') return null;
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  const promedio = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  /* ---------- Fechas: se manejan como texto "AAAA-MM-DD" en hora de Santiago ---------- */

  /** Fecha de hoy en Santiago como "AAAA-MM-DD". */
  function hoy() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }
  /** "AAAA-MM-DD" -> número de día absoluto (sin problemas de horario de verano). */
  function dias(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(a, m - 1, d) / 86400000);
  }
  const deDias = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const sumarDias = (iso, n) => deDias(dias(iso) + n);
  const diaSemana = (iso) => new Date(dias(iso) * 86400000).getUTCDay(); // 0 = domingo
  /** Lunes de la semana (lunes a domingo) a la que pertenece la fecha. */
  const lunesDe = (iso) => sumarDias(iso, -((diaSemana(iso) + 6) % 7));
  /** "AAAA-MM-DD" -> "dd-mm-aaaa" */
  function fechaCL(iso) {
    const [a, m, d] = iso.split('-');
    return `${d}-${m}-${a}`;
  }
  const fechaCorta = (iso) => fechaCL(iso).slice(0, 5); // dd-mm
  const fechaValida = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && deDias(dias(iso)) === iso;

  /* =====================================================================
     2. ESTADO Y ALMACENAMIENTO
     ===================================================================== */
  let almacenamientoOk = true;
  let S = null; // estado de la app

  /** Datos precargados la primera vez. */
  function datosIniciales() {
    return {
      version: 1,
      perfil: { nombre: 'Ponci', edad: 22 },
      ajustes: { meta: 85, ritmo: 0.75, altura: 1.8, diaPesaje: 2, inicioFecha: '2026-10-26', inicioPeso: 108 },
      registros: [{
        id: nuevoId(), fecha: '2026-10-26', peso: 108,
        entrenos: null, pasos: null, plan: null, deshoras: null, sueno: null, energia: null, notas: '',
      }],
      medidas: [],
      ui: { instalarCerrado: false, ultimoRespaldo: null, demo: null },
    };
  }

  function nuevoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /** Número finito dentro de un rango o null. */
  function numOpcional(v, min, max) {
    const n = typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  }

  /**
   * Valida y normaliza un objeto de datos (de localStorage o de un archivo importado).
   * Lanza Error con un mensaje en español si el contenido no sirve.
   */
  function normalizar(bruto) {
    if (!bruto || typeof bruto !== 'object' || !Array.isArray(bruto.registros)) {
      throw new Error('El archivo no tiene el formato de Ponci Tracker.');
    }
    const base = datosIniciales();
    const aj = { ...base.ajustes, ...(bruto.ajustes || {}) };
    const ajustesOk = ['meta', 'ritmo', 'altura', 'inicioPeso'].every((k) => Number.isFinite(aj[k]))
      && [0, 1, 2, 3, 4, 5, 6].includes(aj.diaPesaje) && fechaValida(aj.inicioFecha);
    if (!ajustesOk) throw new Error('Los ajustes del archivo no son válidos.');

    const registros = bruto.registros.map((r) => {
      if (!r || !fechaValida(r.fecha) || !Number.isFinite(r.peso) || r.peso < PESO_MIN || r.peso > PESO_MAX) {
        throw new Error('Hay registros de peso inválidos en el archivo.');
      }
      return {
        id: typeof r.id === 'string' ? r.id : nuevoId(),
        fecha: r.fecha, peso: r.peso,
        entrenos: numOpcional(r.entrenos, 0, 14),
        pasos: numOpcional(r.pasos, 0, 100000),
        plan: numOpcional(r.plan, 1, 5),
        deshoras: ['nunca', '1-2', 'varias'].includes(r.deshoras) ? r.deshoras : null,
        sueno: numOpcional(r.sueno, 0, 24),
        energia: numOpcional(r.energia, 1, 5),
        notas: typeof r.notas === 'string' ? r.notas.slice(0, 2000) : '',
      };
    });
    const medidas = (Array.isArray(bruto.medidas) ? bruto.medidas : [])
      .filter((m) => m && fechaValida(m.fecha))
      .map((m) => ({
        id: typeof m.id === 'string' ? m.id : nuevoId(), fecha: m.fecha,
        cintura: numOpcional(m.cintura, 20, 250), abdomen: numOpcional(m.abdomen, 20, 250), pecho: numOpcional(m.pecho, 20, 250),
      }));
    return {
      version: 1,
      perfil: { ...base.perfil, ...(bruto.perfil || {}) },
      ajustes: aj,
      registros,
      medidas,
      ui: { ...base.ui, ...(bruto.ui || {}) },
    };
  }

  function cargar() {
    try {
      const crudo = localStorage.getItem(CLAVE);
      if (!crudo) return null;
      return normalizar(JSON.parse(crudo));
    } catch (e) {
      // Datos ilegibles: se conserva una copia para no perderlos y se parte de cero.
      try { localStorage.setItem(CLAVE + ':corrupto', localStorage.getItem(CLAVE) || ''); } catch (e2) { /* sin acceso */ }
      return null;
    }
  }

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(S));
    } catch (e) {
      almacenamientoOk = false;
    }
    avisarAlmacenamiento();
  }

  function avisarAlmacenamiento() {
    const caja = $('#avisoAlmacenamiento');
    caja.hidden = almacenamientoOk;
    if (!almacenamientoOk) {
      caja.innerHTML = '<strong>No se pueden guardar los datos en este navegador.</strong><p>Puede ser el modo privado. Exporta un respaldo desde Ajustes antes de cerrar la app.</p>';
    }
  }

  /** Pide al navegador que no borre los datos (ayuda en Safari/iOS; no está garantizado). */
  function pedirPersistencia() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) { /* no disponible */ }
  }

  /* =====================================================================
     3. CÁLCULOS
     ===================================================================== */
  const ordenados = () => [...S.registros].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  /** Peso ideal en una fecha según la ruta planificada (nunca bajo la meta). */
  function pesoIdeal(iso) {
    const a = S.ajustes;
    const semanas = (dias(iso) - dias(a.inicioFecha)) / 7;
    return Math.max(a.meta, a.inicioPeso - a.ritmo * semanas);
  }

  /** Promedio móvil de los últimos 3 registros hasta el índice i. */
  function promedioMovil(lista, i) {
    return promedio(lista.slice(Math.max(0, i - 2), i + 1).map((r) => r.peso));
  }

  const imc = (peso) => peso / (S.ajustes.altura ** 2);

  function categoriaImc(v) {
    if (v < 18.5) return 'Bajo peso';
    if (v < 25) return 'Normal';
    if (v < 30) return 'Sobrepeso';
    return 'Obesidad';
  }

  /**
   * Ritmo real de pérdida (kg/semana, positivo = bajando): pendiente de la
   * regresión lineal con los registros de las últimas 3 semanas. null si no hay datos.
   */
  function ritmoReal(lista) {
    if (lista.length < 2) return null;
    const ultimo = lista[lista.length - 1];
    const tope = dias(ultimo.fecha) - 21;
    const pts = lista.filter((r) => dias(r.fecha) >= tope).map((r) => ({ x: dias(r.fecha), y: r.peso }));
    if (pts.length < 2 || pts[pts.length - 1].x - pts[0].x < 5) return null;
    const mx = promedio(pts.map((p) => p.x));
    const my = promedio(pts.map((p) => p.y));
    const num_ = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
    const den = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    return den === 0 ? null : -(num_ / den) * 7;
  }

  /** Semanas consecutivas (lunes-domingo) con al menos un registro. */
  function rachaSemanas(lista) {
    const semanas = new Set(lista.map((r) => lunesDe(r.fecha)));
    let cursor = lunesDe(hoy());
    if (!semanas.has(cursor)) cursor = sumarDias(cursor, -7); // la semana en curso aún puede completarse
    let n = 0;
    while (semanas.has(cursor)) { n += 1; cursor = sumarDias(cursor, -7); }
    return n;
  }

  /** Estado de la semana para el banner principal. */
  function estadoSemana(lista) {
    const h = hoy();
    const ultimo = lista[lista.length - 1];
    if (!ultimo) return { tipo: 'sin-datos' };
    const sinRegistrar = dias(h) - dias(ultimo.fecha);
    const hayEstaSemana = lista.some((r) => lunesDe(r.fecha) === lunesDe(h));
    const pos = (d) => (d + 6) % 7; // posición del día dentro de la semana lunes-domingo
    const dia = S.ajustes.diaPesaje;
    if (sinRegistrar > 7) return { tipo: 'rojo', dias: sinRegistrar };
    if (hayEstaSemana) return { tipo: 'verde' };
    if (diaSemana(h) === dia) return { tipo: 'durazno-hoy' };
    if (pos(diaSemana(h)) > pos(dia)) return { tipo: 'durazno-pasado' };
    return { tipo: 'neutro', proximo: sumarDias(h, (dia - diaSemana(h) + 7) % 7) };
  }

  /* =====================================================================
     4. RENDER — PANTALLA PRINCIPAL
     ===================================================================== */
  function renderEncabezado() {
    const h = hoy();
    $('#saludo').textContent = `Hola, ${S.perfil.nombre}`;
    $('#fechaHoy').textContent = `${DIAS_SEMANA[diaSemana(h)]} ${fechaCL(h)}`;
  }

  function renderBanner(lista) {
    const e = estadoSemana(lista);
    const dia = DIAS_SEMANA[S.ajustes.diaPesaje];
    let html = '';
    if (e.tipo === 'rojo') {
      html = `<div class="banner banner-rojo" role="alert"><strong>Llevas ${e.dias} días sin registrar tu peso</strong>
        <p>No pasa nada: retomar hoy es lo que cuenta.</p>
        <button class="btn btn-bloque" type="button" data-accion="registrar">Registrar ahora</button></div>`;
    } else if (e.tipo === 'durazno-hoy') {
      html = `<div class="banner banner-durazno"><strong>Hoy es día de pesaje. Pésate en ayunas y regístrate</strong>
        <button class="btn btn-bloque" type="button" data-accion="registrar">Registrar mi peso</button></div>`;
    } else if (e.tipo === 'durazno-pasado') {
      html = `<div class="banner banner-durazno"><strong>Esta semana aún no registras tu peso</strong>
        <p>Tu día de pesaje es el ${dia}. Pésate en ayunas y regístrate.</p>
        <button class="btn btn-bloque" type="button" data-accion="registrar">Registrar mi peso</button></div>`;
    } else if (e.tipo === 'verde') {
      html = '<div class="banner banner-verde"><strong>Registro de esta semana listo ✔</strong></div>';
    } else if (e.tipo === 'neutro') {
      html = `<div class="banner banner-neutro"><strong>Próximo pesaje: ${dia} ${fechaCL(e.proximo)}</strong><p>En ayunas, después de ir al baño.</p></div>`;
    } else {
      html = `<div class="banner banner-durazno"><strong>Aún no tienes registros</strong>
        <button class="btn btn-bloque" type="button" data-accion="registrar">Registrar mi peso</button></div>`;
    }
    if (S.ui.demo) {
      html = '<div class="banner banner-durazno" style="margin-bottom:14px"><strong>Modo ejemplo activo</strong><p>Estás viendo datos falsos. Quítalos en Ajustes → Herramientas de prueba.</p></div>' + html;
    }
    $('#bannerEstado').innerHTML = html;
  }

  /** Aviso de medición si han pasado 28 días o más desde la última. */
  function diasDesdeUltimaMedida() {
    if (!S.medidas.length) return null;
    const ultima = [...S.medidas].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
    return dias(hoy()) - dias(ultima.fecha);
  }

  function renderBannerMedidas() {
    const d = diasDesdeUltimaMedida();
    $('#bannerMedidas').innerHTML = d !== null && d >= 28
      ? `<div class="banner banner-durazno"><strong>Toca medirte</strong><p>Han pasado ${d} días desde tu última medición (se mide cada 28 días).</p>
         <button class="btn btn-bloque" type="button" data-accion="ir-medidas">Ir a Medidas</button></div>`
      : '';
  }

  function estaInstalada() {
    return window.navigator.standalone === true
      || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }

  function renderAvisosDiscretos() {
    // Aviso de instalación (descartable)
    $('#avisoInstalar').innerHTML = !estaInstalada() && !S.ui.instalarCerrado
      ? `<div class="banner banner-neutro"><div class="banner-fila"><div>
          <strong>Instálala en tu pantalla de inicio</strong>
          <p>En Safari: Compartir → «Agregar a pantalla de inicio». Así el iPhone no borra tus datos por falta de uso.</p></div>
          <button class="banner-cerrar" type="button" data-accion="cerrar-instalar" aria-label="Descartar aviso">✕</button></div></div>`
      : '';

    // Recordatorio de respaldo (si nunca o hace más de 30 días)
    const ult = S.ui.ultimoRespaldo;
    const dd = ult ? dias(hoy()) - dias(ult) : null;
    const toca = S.registros.length >= 2 && (dd === null || dd > 30);
    $('#avisoRespaldo').innerHTML = toca
      ? `<div class="banner banner-neutro"><strong>Haz un respaldo</strong>
          <p>${dd === null ? 'Aún no has respaldado tus datos.' : `Tu último respaldo fue hace ${dd} días.`}</p>
          <button class="btn btn-secundario btn-bloque" type="button" data-accion="exportar">Respaldar ahora</button></div>`
      : '';
  }

  function renderResumen(lista) {
    const a = S.ajustes;
    const actual = lista.length ? lista[lista.length - 1].peso : a.inicioPeso;
    const perdido = a.inicioPeso - actual;
    const falta = Math.max(0, actual - a.meta);
    const valorImc = imc(actual);
    $('#resumen').innerHTML = `
      <div class="cifra"><div class="rotulo">Peso actual</div><div class="valor">${num(actual)} <small>kg</small></div></div>
      <div class="cifra"><div class="rotulo">Perdido total</div><div class="valor">${numNeg(perdido)} <small>kg</small></div>
        <div class="sub">${numNeg((perdido / a.inicioPeso) * 100)} % del peso inicial</div></div>
      <div class="cifra"><div class="rotulo">Falta para la meta</div><div class="valor">${num(falta)} <small>kg</small></div>
        <div class="sub">${falta === 0 ? '¡Meta lograda!' : `Meta: ${num(a.meta)} kg`}</div></div>
      <div class="cifra"><div class="rotulo">IMC actual</div><div class="valor">${num(valorImc)}</div>
        <div class="sub">${categoriaImc(valorImc)}</div></div>`;
  }

  function renderProgreso(lista) {
    const a = S.ajustes;
    const actual = lista.length ? lista[lista.length - 1].peso : a.inicioPeso;
    const total = a.inicioPeso - a.meta;
    const pct = total > 0 ? Math.min(100, Math.max(0, ((a.inicioPeso - actual) / total) * 100)) : 0;
    $('#progreso').innerHTML = `
      <div class="barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="Progreso hacia la meta"><span style="width:${pct.toFixed(1)}%"></span></div>
      <div class="barra-pie"><span>${num(a.inicioPeso)} kg</span><strong>${num(pct, 0)} %</strong><span>${num(a.meta)} kg</span></div>`;
  }

  function renderProyeccion(lista) {
    const a = S.ajustes;
    const caja = $('#proyeccion');
    if (!lista.length) { caja.innerHTML = '<p class="ayuda">Registra tu primera semana para ver la proyección.</p>'; return; }
    const ultimo = lista[lista.length - 1];
    const actual = ultimo.peso;

    // (a) Ritmo planificado
    const semPlan = a.ritmo > 0 ? (a.inicioPeso - a.meta) / a.ritmo : null;
    const fechaPlan = semPlan !== null ? fechaCL(sumarDias(a.inicioFecha, Math.round(semPlan * 7))) : '—';

    // (b) Ritmo real de las últimas 3 semanas
    const real = ritmoReal(lista);
    let filaReal;
    if (actual <= a.meta) {
      filaReal = { v: '¡Meta alcanzada!', sub: '' };
    } else if (real === null) {
      filaReal = { v: 'Sin datos aún', sub: 'Necesito al menos 2 registros recientes' };
    } else if (real <= 0.05) {
      filaReal = { v: `${numNeg(real, 2)} kg/sem`, sub: 'A este ritmo no se llega a la meta' };
    } else {
      const sem = (actual - a.meta) / real;
      filaReal = { v: fechaCL(sumarDias(ultimo.fecha, Math.round(sem * 7))), sub: `${num(real, 2)} kg/sem · ~${Math.ceil(sem)} semanas` };
    }

    // Adelanto o atraso respecto a la ruta ideal
    const dif = actual - pesoIdeal(ultimo.fecha);
    let etiqueta;
    if (dif < -0.05) etiqueta = `<span class="etiqueta etiqueta-ok">Vas ${num(-dif)} kg adelantado de la ruta ideal</span>`;
    else if (dif > 0.05) etiqueta = `<span class="etiqueta etiqueta-mal">Vas ${num(dif)} kg atrasado de la ruta ideal</span>`;
    else etiqueta = '<span class="etiqueta etiqueta-ok">Vas justo en la ruta ideal</span>';

    caja.innerHTML = `<div class="filas">
        <div><span class="k">Con ritmo planificado<br>(${num(a.ritmo, 2)} kg/sem)</span><span class="v">${fechaPlan}</span></div>
        <div><span class="k">Con ritmo real<br>(últimas 3 semanas)</span><span class="v">${filaReal.v}${filaReal.sub ? `<small>${filaReal.sub}</small>` : ''}</span></div>
      </div>${etiqueta}`;
  }

  function renderRacha(lista) {
    const ultimas = lista.slice(-4);
    const entrenos = promedio(ultimas.map((r) => r.entrenos).filter((v) => v !== null));
    const plan = promedio(ultimas.map((r) => r.plan).filter((v) => v !== null));
    const racha = rachaSemanas(lista);
    $('#racha').innerHTML = `<div class="filas">
      <div><span class="k">Semanas seguidas registradas</span><span class="v">${racha} ${racha === 1 ? 'semana' : 'semanas'}${racha >= 3 ? ' 🔥' : ''}</span></div>
      <div><span class="k">Entrenos por semana<br>(últimas 4)</span><span class="v">${entrenos === null ? '—' : num(entrenos)}</span></div>
      <div><span class="k">Cumplimiento del plan<br>(últimas 4)</span><span class="v">${plan === null ? '—' : num(plan) + ' / 5'}</span></div>
    </div>`;
  }

  /* =====================================================================
     5. GRÁFICO DE PESO (SVG propio)
     ===================================================================== */
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let puntosGrafico = [];

  /** Paso "redondo" del eje Y según el rango. */
  function pasoEje(rango) {
    if (rango <= 6) return 1;
    if (rango <= 12) return 2;
    if (rango <= 30) return 5;
    return 10;
  }

  function dibujarGrafico() {
    const caja = $('#grafico');
    if (!caja.offsetParent && !caja.clientWidth) return; // pestaña oculta
    const lista = ordenados();
    const a = S.ajustes;
    const W = Math.max(260, caja.clientWidth || 320);
    const H = Math.round(Math.min(300, Math.max(230, W * 0.7)));
    const m = { i: 40, d: 16, s: 14, b: 30 };
    const ini = dias(a.inicioFecha);

    const pts = lista.map((r) => ({ x: dias(r.fecha) - ini, y: r.peso, r }));
    const xMin = Math.min(0, ...pts.map((p) => p.x));
    const xMax = Math.max(28, Math.ceil(Math.max(0, ...pts.map((p) => p.x)) / 7) * 7);
    const idealFin = pesoIdeal(deDias(ini + xMax));
    const ys = [...pts.map((p) => p.y), a.meta, a.inicioPeso, idealFin];
    const paso = pasoEje(Math.max(...ys) - Math.min(...ys) + 2);
    const yMin = Math.floor((Math.min(...ys) - 0.5) / paso) * paso;
    const yMax = Math.ceil((Math.max(...ys) + 0.5) / paso) * paso;

    const sx = (x) => m.i + ((x - xMin) / (xMax - xMin)) * (W - m.i - m.d);
    const sy = (y) => m.s + ((yMax - y) / (yMax - yMin)) * (H - m.s - m.b);

    const partes = [];
    // Cuadrícula horizontal y eje Y (kg)
    for (let v = yMin; v <= yMax + 1e-9; v += paso) {
      partes.push(`<line x1="${m.i}" x2="${W - m.d}" y1="${sy(v)}" y2="${sy(v)}" stroke="#E3E9E1" stroke-width="1"/>`);
      partes.push(`<text x="${m.i - 6}" y="${sy(v) + 4}" text-anchor="end">${num(v, 0)}</text>`);
    }
    // Eje X (fechas)
    const nTicks = W < 420 ? 4 : 6;
    for (let k = 0; k < nTicks; k += 1) {
      const x = Math.round(xMin + (k * (xMax - xMin)) / (nTicks - 1));
      const anchor = k === 0 ? 'start' : k === nTicks - 1 ? 'end' : 'middle';
      partes.push(`<text x="${sx(x)}" y="${H - 8}" text-anchor="${anchor}">${fechaCorta(deDias(ini + x))}</text>`);
    }
    // Meta (línea horizontal fina)
    partes.push(`<line x1="${m.i}" x2="${W - m.d}" y1="${sy(a.meta)}" y2="${sy(a.meta)}" stroke="#5F6E66" stroke-width="1.2"/>`);
    partes.push(`<text x="${W - m.d}" y="${sy(a.meta) - 5}" text-anchor="end" style="font-weight:600">Meta ${num(a.meta)}</text>`);
    // Ruta ideal (punteada durazno)
    partes.push(`<line x1="${sx(0)}" y1="${sy(a.inicioPeso)}" x2="${sx(xMax)}" y2="${sy(idealFin)}" stroke="#F2A65A" stroke-width="2.5" stroke-dasharray="6 5" stroke-linecap="round"/>`);
    // Peso real
    if (pts.length > 1) {
      partes.push(`<polyline fill="none" stroke="#3F8F6B" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}"/>`);
    }
    pts.forEach((p) => {
      partes.push(`<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="${pts.length > 20 ? 3 : 4.5}" fill="#fff" stroke="#3F8F6B" stroke-width="2.5"/>`);
    });
    partes.push('<g id="puntoSel"></g>');

    const actual = lista.length ? lista[lista.length - 1].peso : a.inicioPeso;
    caja.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gráfico de peso: ${lista.length} registros, último ${num(actual)} kilos, meta ${num(a.meta)} kilos">${partes.join('')}</svg><div class="tooltip-grafico" id="tooltip" hidden></div>`;
    puntosGrafico = pts.map((p) => ({ ...p, px: sx(p.x), py: sy(p.y) }));
    activarTooltip(caja, W);
  }

  /** Muestra el detalle del punto más cercano al tocar o pasar el mouse. */
  function activarTooltip(caja, W) {
    const svg = $('svg', caja);
    const tip = $('#tooltip', caja);
    const sel = $('#puntoSel', caja);
    const ocultar = () => { tip.hidden = true; sel.innerHTML = ''; };

    const mostrar = (ev) => {
      const r = svg.getBoundingClientRect();
      const escala = W / r.width;
      const x = (ev.clientX - r.left) * escala;
      const y = (ev.clientY - r.top) * escala;
      let mejor = null;
      let dMejor = Infinity;
      puntosGrafico.forEach((p) => {
        const d = Math.hypot(p.px - x, p.py - y);
        if (d < dMejor) { dMejor = d; mejor = p; }
      });
      if (!mejor || dMejor > 34) { ocultar(); return; }
      sel.innerHTML = `<circle cx="${mejor.px}" cy="${mejor.py}" r="8" fill="#3F8F6B" fill-opacity=".25"/><circle cx="${mejor.px}" cy="${mejor.py}" r="5.5" fill="#3F8F6B"/>`;
      const lista = ordenados();
      const i = lista.indexOf(mejor.r);
      const previo = i > 0 ? mejor.r.peso - lista[i - 1].peso : null;
      tip.innerHTML = `<strong>${num(mejor.r.peso)} kg</strong>${fechaCL(mejor.r.fecha)}<br>${previo === null ? 'Primer registro' : `${conSigno(previo)} kg vs. anterior`}<br>Ideal: ${num(pesoIdeal(mejor.r.fecha))} kg`;
      tip.hidden = false;
      const ancho = tip.offsetWidth;
      const izq = Math.min(Math.max(mejor.px / escala - ancho / 2, 0), r.width - ancho);
      tip.style.left = `${izq}px`;
      tip.style.top = `${Math.max(mejor.py / escala - tip.offsetHeight - 14, 0)}px`;
    };

    svg.addEventListener('pointerdown', mostrar);
    svg.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') mostrar(ev); });
    svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') ocultar(); });
  }

  /* =====================================================================
     6. RENDER — HISTORIAL, MEDIDAS Y AJUSTES
     ===================================================================== */
  const ETIQUETA_DESHORAS = { nunca: 'Nunca', '1-2': '1-2 veces', varias: 'Varias veces' };
  const textoEntrenos = (v) => (v === null ? '—' : v >= 4 ? '4+' : String(v));
  const textoSueno = (v) => (v === null ? 's/d' : v >= 8 ? '8+' : String(v));

  function claseVariacion(v) {
    if (v < -0.05) return 'var-baja';
    if (v > 0.05) return 'var-sube';
    return 'var-igual';
  }

  function renderHistorial(lista) {
    const ul = $('#listaHistorial');
    if (!lista.length) { ul.innerHTML = '<li class="vacio">Aún no hay registros.</li>'; return; }
    ul.innerHTML = [...lista].map((r, i) => {
      const previo = i > 0 ? r.peso - lista[i - 1].peso : null;
      return { r, i, previo };
    }).reverse().map(({ r, i, previo }) => `
      <li><button class="fila-hist" type="button" data-id="${esc(r.id)}" aria-label="Editar registro del ${fechaCL(r.fecha)}">
        <div class="fh-top"><div><div class="fh-fecha">${fechaCL(r.fecha)}${i === 0 ? ' · semana 0' : ''}</div><div class="fh-peso">${num(r.peso)} kg</div></div>
          <div class="var ${previo === null ? 'var-igual' : claseVariacion(previo)}">${previo === null ? '—' : conSigno(previo) + ' kg'}</div></div>
        <div class="fh-datos">
          <span>Prom. 3 sem<b>${num(promedioMovil(lista, i))} kg</b></span>
          <span>Entrenos<b>${textoEntrenos(r.entrenos)}</b></span>
          <span>Plan<b>${r.plan === null ? '—' : r.plan + '/5'}</b></span>
        </div>
        ${r.notas ? `<div class="fh-notas">${esc(r.notas)}</div>` : ''}
      </button></li>`).join('');
  }

  function renderMedidas() {
    const lista = [...S.medidas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const d = diasDesdeUltimaMedida();
    let estado;
    if (d === null) estado = '<div class="banner banner-durazno"><strong>Aún no tienes mediciones</strong><p>Mídete cada 4 semanas, a la misma hora y sin apretar la huincha.</p></div>';
    else if (d >= 28) estado = `<div class="banner banner-durazno"><strong>Toca medirte</strong><p>Han pasado ${d} días desde la última medición.</p></div>`;
    else estado = `<div class="banner banner-verde"><strong>Medición al día</strong><p>Próxima medición en ${28 - d} ${28 - d === 1 ? 'día' : 'días'} (${fechaCL(sumarDias(hoy(), 28 - d))}).</p></div>`;
    $('#estadoMedidas').innerHTML = estado;

    const caja = $('#tablaMedidas');
    if (!lista.length) { caja.innerHTML = '<p class="vacio">Sin mediciones todavía.</p>'; return; }
    const primera = lista[0];
    const celda = (m, k, i) => {
      if (m[k] === null) return '<td>—</td>';
      const v = i > 0 && primera[k] !== null ? `<small>${conSigno(m[k] - primera[k])}</small>` : (i === 0 ? '<small>base</small>' : '');
      return `<td>${num(m[k])}${v}</td>`;
    };
    caja.innerHTML = `<table><thead><tr><th scope="col">Fecha</th><th scope="col">Cintura</th><th scope="col">Abdomen</th><th scope="col">Pecho</th><th scope="col"><span class="visualmente-oculto">Eliminar</span></th></tr></thead>
      <tbody>${lista.map((m, i) => `<tr><td>${fechaCL(m.fecha)}</td>${celda(m, 'cintura', i)}${celda(m, 'abdomen', i)}${celda(m, 'pecho', i)}
        <td><button class="btn-mini" type="button" data-medida="${esc(m.id)}" aria-label="Eliminar medición del ${fechaCL(m.fecha)}">🗑</button></td></tr>`).join('')}</tbody></table>
      <p class="ayuda">Medidas en cm. Debajo de cada valor: variación respecto a la primera medición.</p>`;
  }

  function renderAjustes() {
    const a = S.ajustes;
    $('#a-meta').value = num(a.meta);
    $('#a-ritmo').value = num(a.ritmo, 2);
    $('#a-altura').value = num(a.altura, 2);
    $('#a-dia').value = String(a.diaPesaje);
    $('#a-inicio-fecha').value = a.inicioFecha;
    $('#a-inicio-peso').value = num(a.inicioPeso);
    $('#ultimoRespaldo').textContent = S.ui.ultimoRespaldo
      ? `Último respaldo: ${fechaCL(S.ui.ultimoRespaldo)}`
      : 'Aún no has hecho un respaldo.';
    $('#btnDemo').hidden = !!S.ui.demo;
    $('#btnQuitarDemo').hidden = !S.ui.demo;
  }

  function renderTodo() {
    const lista = ordenados();
    renderEncabezado();
    renderBanner(lista);
    renderBannerMedidas();
    renderAvisosDiscretos();
    renderResumen(lista);
    renderProgreso(lista);
    renderProyeccion(lista);
    renderRacha(lista);
    renderHistorial(lista);
    renderMedidas();
    renderAjustes();
    dibujarGrafico();
  }

  /* =====================================================================
     7. DIÁLOGOS Y AVISOS
     ===================================================================== */
  let resolverDialogo = null;

  /**
   * Muestra un diálogo. botones: [{ texto, valor, clase, cancelar }]. Devuelve una
   * promesa con el valor del botón pulsado (o el del botón "cancelar" con Escape).
   */
  function dialogo({ titulo, texto, botones }) {
    return new Promise((resolver) => {
      $('#dlgTitulo').textContent = titulo;
      $('#dlgTexto').textContent = texto;
      const caja = $('#dlgBotones');
      caja.innerHTML = '';
      botones.forEach((b) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `btn ${b.clase || ''}`.trim();
        el.textContent = b.texto;
        el.addEventListener('click', () => cerrarDialogo(b.valor));
        caja.appendChild(el);
      });
      const cancel = botones.find((b) => b.cancelar);
      resolverDialogo = { resolver, valorCancelar: cancel ? cancel.valor : botones[botones.length - 1].valor };
      $('#fondoDialogo').hidden = false;
      caja.firstElementChild.focus();
    });
  }

  function cerrarDialogo(valor) {
    $('#fondoDialogo').hidden = true;
    if (resolverDialogo) { const { resolver } = resolverDialogo; resolverDialogo = null; resolver(valor); }
  }

  /** Confirmación sí/no. */
  const confirmar = (titulo, texto, textoOk = 'Sí, continuar', peligro = false) => dialogo({
    titulo, texto,
    botones: [
      { texto: textoOk, valor: true, clase: peligro ? 'btn-peligro' : '' },
      { texto: 'Cancelar', valor: false, clase: 'btn-secundario', cancelar: true },
    ],
  });

  let temporizadorToast = null;
  function toast(mensaje) {
    const el = $('#toast');
    el.textContent = mensaje;
    el.classList.add('visible');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(() => el.classList.remove('visible'), 2400);
  }

  /* =====================================================================
     8. FORMULARIO "REGISTRAR SEMANA"
     ===================================================================== */
  const OPCIONES = {
    entrenos: [0, 1, 2, 3, 4].map((v) => ({ v, t: v === 4 ? '4+' : String(v) })),
    plan: [
      { v: 1, t: '1', e: '😣', d: 'Me descontrolé' }, { v: 2, t: '2', e: '😕', d: 'Me costó mucho' },
      { v: 3, t: '3', e: '😐', d: 'Más o menos' }, { v: 4, t: '4', e: '🙂', d: 'Bastante bien' },
      { v: 5, t: '5', e: '🤩', d: 'Perfecto' },
    ],
    deshoras: [{ v: 'nunca', t: 'Nunca' }, { v: '1-2', t: '1-2 veces' }, { v: 'varias', t: 'Varias veces' }],
    sueno: [5, 6, 7, 8].map((v) => ({ v, t: v === 8 ? '8+' : String(v) })),
    energia: [
      { v: 1, t: '1', e: '🪫', d: 'Sin energía' }, { v: 2, t: '2', e: '😴', d: 'Baja' },
      { v: 3, t: '3', e: '😊', d: 'Normal' }, { v: 4, t: '4', e: '💪', d: 'Buena' },
      { v: 5, t: '5', e: '⚡', d: 'A tope' },
    ],
  };
  const AYUDA_PLAN = '1 = Me descontrolé · 3 = Más o menos · 5 = Perfecto';
  const AYUDA_ENERGIA = '1 = Sin energía · 5 = A tope';

  let F = null; // valores de los selectores del formulario abierto
  let editandoId = null;
  let elementoPrevio = null;

  function construirSelectores() {
    $$('.opciones[data-campo]').forEach((caja) => {
      const campo = caja.dataset.campo;
      const grupo = caja.closest('fieldset');
      caja.setAttribute('role', 'group');
      caja.setAttribute('aria-label', $('legend', grupo).textContent);
      caja.innerHTML = OPCIONES[campo].map((o) => `<button type="button" class="opt" data-valor="${esc(o.v)}" aria-pressed="false"${o.d ? ` aria-label="${esc(o.t)}: ${esc(o.d)}"` : ''}>
        ${o.e ? `<span class="emoji" aria-hidden="true">${o.e}</span>` : ''}<span>${esc(o.t)}</span></button>`).join('');
      caja.addEventListener('click', (ev) => {
        const b = ev.target.closest('.opt');
        if (!b) return;
        const op = OPCIONES[campo].find((o) => String(o.v) === b.dataset.valor);
        F[campo] = F[campo] === op.v ? null : op.v; // volver a tocar deselecciona
        pintarSelectores();
      });
    });
  }

  function pintarSelectores() {
    $$('.opciones[data-campo]').forEach((caja) => {
      const campo = caja.dataset.campo;
      $$('.opt', caja).forEach((b) => {
        b.setAttribute('aria-pressed', String(F[campo] !== null && String(F[campo]) === b.dataset.valor));
      });
    });
    const dPlan = OPCIONES.plan.find((o) => o.v === F.plan);
    $('#f-plan-txt').textContent = dPlan ? `${dPlan.t}/5 · ${dPlan.d}` : AYUDA_PLAN;
    const dEn = OPCIONES.energia.find((o) => o.v === F.energia);
    $('#f-energy-txt').textContent = dEn ? `${dEn.t}/5 · ${dEn.d}` : AYUDA_ENERGIA;
  }

  /** Registro anterior a una fecha (ignorando el que se está editando). */
  function registroAnterior(fecha) {
    return ordenados().filter((r) => r.id !== editandoId && r.fecha < fecha).pop() || null;
  }

  /** Referencia y variación en vivo bajo el campo de peso. */
  function actualizarReferencia() {
    const fecha = $('#f-fecha').value;
    const previo = fechaValida(fecha) ? registroAnterior(fecha) : null;
    const caja = $('#f-ref');
    if (!previo) { caja.textContent = 'Primer registro: no hay peso anterior.'; return; }
    let html = `Peso anterior: <strong>${num(previo.peso)} kg</strong> (${fechaCL(previo.fecha)})`;
    const p = leerNumero($('#f-peso').value);
    if (p !== null && !Number.isNaN(p) && p >= PESO_MIN && p <= PESO_MAX) {
      const v = p - previo.peso;
      html += `<br><span class="var-viva ${claseVariacion(v)}">${conSigno(v)} kg vs. semana pasada</span>`;
    }
    caja.innerHTML = html;
  }

  function abrirHoja(id = null) {
    editandoId = id;
    const r = id ? S.registros.find((x) => x.id === id) : null;
    F = {
      entrenos: r ? r.entrenos : null, plan: r ? r.plan : null, deshoras: r ? r.deshoras : null,
      sueno: r ? r.sueno : null, energia: r ? r.energia : null,
    };
    $('#hojaTitulo').textContent = r ? 'Editar registro' : 'Registrar semana';
    $('#f-fecha').value = r ? r.fecha : hoy();
    $('#f-fecha').max = '2100-12-31';
    $('#f-peso').value = r ? num(r.peso) : '';
    $('#f-pasos').value = r && r.pasos !== null ? String(r.pasos) : '';
    $('#f-notas').value = r ? r.notas : '';
    $('#btnEliminar').hidden = !r;
    mostrarError('#f-error', '');
    pintarSelectores();
    actualizarReferencia();

    elementoPrevio = document.activeElement;
    $('#fondoHoja').hidden = false;
    const hoja = $('#hoja');
    hoja.hidden = false;
    document.body.classList.add('sin-scroll');
    hoja.scrollTop = 0;
    requestAnimationFrame(() => {
      hoja.classList.add('abierta');
      if (!r) $('#f-peso').focus({ preventScroll: true });
    });
  }

  function cerrarHoja() {
    const hoja = $('#hoja');
    hoja.classList.remove('abierta');
    $('#fondoHoja').hidden = true;
    document.body.classList.remove('sin-scroll');
    setTimeout(() => { if (!hoja.classList.contains('abierta')) hoja.hidden = true; }, 300);
    if (elementoPrevio && elementoPrevio.focus) elementoPrevio.focus({ preventScroll: true });
  }

  const hojaAbierta = () => $('#hoja').classList.contains('abierta');

  function mostrarError(sel, mensaje) {
    const el = $(sel);
    el.textContent = mensaje;
    el.hidden = !mensaje;
  }

  /** Mensaje motivador según el resultado, sin culpar. */
  function mensajeResultado(variacion, perdidoTotal) {
    if (variacion === null) {
      return { titulo: '¡Primer registro guardado! 🌱', texto: 'Ya tienes tu punto de partida. Lo importante ahora es la constancia: una semana a la vez.' };
    }
    if (variacion < -0.05) {
      return { titulo: `¡Bajaste ${num(-variacion)} kg! 🎉`, texto: `Muy buen trabajo, Ponci. Llevas ${numNeg(perdidoTotal)} kg menos desde el inicio. Mantén lo que te está funcionando.` };
    }
    if (variacion > 0.05) {
      return { titulo: `Subió ${num(variacion)} kg esta semana`, texto: 'Es normal: el peso varía ±1 kg entre semanas por agua, sal, comidas y sueño. Lo que importa es la tendencia, no un pesaje aislado. Vuelve a tu plan y sigue registrando. 💚' };
    }
    return { titulo: 'Peso estable esta semana ⚖️', texto: 'Hay semanas de pausa y es parte del proceso. Lo que cuenta es la tendencia: sigue con tus hábitos y revisa cómo vas en 2 o 3 semanas.' };
  }

  async function guardarRegistro(ev) {
    ev.preventDefault();
    const fecha = $('#f-fecha').value;
    const peso = leerNumero($('#f-peso').value);
    const pasos = leerNumero($('#f-pasos').value);

    // Validaciones
    if (!fechaValida(fecha)) return mostrarError('#f-error', 'Elige una fecha válida.');
    if (fecha > hoy()) return mostrarError('#f-error', 'La fecha no puede ser futura.');
    if (peso === null || Number.isNaN(peso) || peso < PESO_MIN || peso > PESO_MAX) {
      $('#f-peso').focus();
      return mostrarError('#f-error', `Ingresa un peso entre ${PESO_MIN} y ${PESO_MAX} kg (ej: 104,6).`);
    }
    if (Number.isNaN(pasos) || (pasos !== null && (pasos > 100000 || !Number.isInteger(pasos)))) {
      return mostrarError('#f-error', 'Los pasos deben ser un número entero entre 0 y 100.000.');
    }
    mostrarError('#f-error', '');

    // ¿Ya existe un registro en la misma semana?
    const semana = lunesDe(fecha);
    const choque = S.registros.find((r) => r.id !== editandoId && lunesDe(r.fecha) === semana);
    if (choque) {
      const ok = await confirmar('Ya registraste esta semana',
        `Hay un registro del ${fechaCL(choque.fecha)} (${num(choque.peso)} kg) en la misma semana. ¿Quieres reemplazarlo por este?`, 'Reemplazar');
      if (!ok) return null;
      S.registros = S.registros.filter((r) => r.id !== choque.id);
    }

    const nuevo = {
      id: editandoId || nuevoId(), fecha, peso,
      entrenos: F.entrenos, pasos, plan: F.plan, deshoras: F.deshoras, sueno: F.sueno, energia: F.energia,
      notas: $('#f-notas').value.trim(),
    };
    const i = S.registros.findIndex((r) => r.id === nuevo.id);
    if (i >= 0) S.registros[i] = nuevo; else S.registros.push(nuevo);
    guardar();
    cerrarHoja();
    renderTodo();

    const lista = ordenados();
    const pos = lista.findIndex((r) => r.id === nuevo.id);
    const variacion = pos > 0 ? nuevo.peso - lista[pos - 1].peso : null;
    const msg = mensajeResultado(variacion, S.ajustes.inicioPeso - nuevo.peso);
    const copiar = await dialogo({
      titulo: msg.titulo, texto: msg.texto,
      botones: [{ texto: 'Listo', valor: false, cancelar: true }, { texto: 'Copiar resumen para Claude', valor: true, clase: 'btn-secundario' }],
    });
    if (copiar) copiarResumen();
    return null;
  }

  async function eliminarRegistro() {
    const r = S.registros.find((x) => x.id === editandoId);
    if (!r) return;
    const ok = await confirmar('¿Eliminar este registro?', `Se borrará el registro del ${fechaCL(r.fecha)} (${num(r.peso)} kg). No se puede deshacer.`, 'Eliminar', true);
    if (!ok) return;
    S.registros = S.registros.filter((x) => x.id !== r.id);
    guardar();
    cerrarHoja();
    renderTodo();
    toast('Registro eliminado');
  }

  /* =====================================================================
     9. MEDIDAS Y AJUSTES (formularios)
     ===================================================================== */
  function guardarMedidas(ev) {
    ev.preventDefault();
    const fecha = $('#m-fecha').value;
    const v = { cintura: leerNumero($('#m-cintura').value), abdomen: leerNumero($('#m-abdomen').value), pecho: leerNumero($('#m-pecho').value) };
    if (!fechaValida(fecha) || fecha > hoy()) return mostrarError('#m-error', 'Elige una fecha válida (no futura).');
    const valores = Object.values(v);
    if (valores.every((x) => x === null)) return mostrarError('#m-error', 'Ingresa al menos una medida.');
    if (valores.some((x) => x !== null && (Number.isNaN(x) || x < 20 || x > 250))) {
      return mostrarError('#m-error', 'Las medidas deben estar entre 20 y 250 cm.');
    }
    mostrarError('#m-error', '');
    const existente = S.medidas.find((m) => m.fecha === fecha);
    if (existente) Object.assign(existente, v);
    else S.medidas.push({ id: nuevoId(), fecha, ...v });
    guardar();
    renderTodo();
    ['#m-cintura', '#m-abdomen', '#m-pecho'].forEach((s) => { $(s).value = ''; });
    toast('Medidas guardadas ✔');
    return null;
  }

  async function eliminarMedida(id) {
    const m = S.medidas.find((x) => x.id === id);
    if (!m) return;
    const ok = await confirmar('¿Eliminar medición?', `Se borrará la medición del ${fechaCL(m.fecha)}.`, 'Eliminar', true);
    if (!ok) return;
    S.medidas = S.medidas.filter((x) => x.id !== id);
    guardar();
    renderTodo();
    toast('Medición eliminada');
  }

  function guardarAjustes(ev) {
    ev.preventDefault();
    const meta = leerNumero($('#a-meta').value);
    const ritmo = leerNumero($('#a-ritmo').value);
    let altura = leerNumero($('#a-altura').value);
    const inicioPeso = leerNumero($('#a-inicio-peso').value);
    const inicioFecha = $('#a-inicio-fecha').value;
    if (altura !== null && altura > 3) altura /= 100; // si escribe 180, se interpreta como cm

    if (meta === null || Number.isNaN(meta) || meta < PESO_MIN || meta > PESO_MAX) return mostrarError('#a-error', `La meta debe estar entre ${PESO_MIN} y ${PESO_MAX} kg.`);
    if (ritmo === null || Number.isNaN(ritmo) || ritmo <= 0 || ritmo > 2) return mostrarError('#a-error', 'El ritmo debe ser mayor que 0 y hasta 2 kg por semana.');
    if (altura === null || Number.isNaN(altura) || altura < 1.2 || altura > 2.3) return mostrarError('#a-error', 'La altura debe estar entre 1,20 y 2,30 m.');
    if (inicioPeso === null || Number.isNaN(inicioPeso) || inicioPeso < PESO_MIN || inicioPeso > PESO_MAX) return mostrarError('#a-error', 'El peso de la semana 0 no es válido.');
    if (!fechaValida(inicioFecha)) return mostrarError('#a-error', 'La fecha de la semana 0 no es válida.');
    if (meta >= inicioPeso) return mostrarError('#a-error', 'La meta debe ser menor que el peso de la semana 0.');
    mostrarError('#a-error', '');

    S.ajustes = { meta, ritmo, altura, diaPesaje: Number($('#a-dia').value), inicioFecha, inicioPeso };
    guardar();
    renderTodo();
    toast(ritmo < 0.5 || ritmo > 1 ? 'Guardado. Ojo: el rango seguro es 0,5 a 1 kg/sem' : 'Ajustes guardados ✔');
    return null;
  }

  /* =====================================================================
     10. RESUMEN PARA EL COACH
     ===================================================================== */
  function textoResumen() {
    const lista = ordenados();
    if (!lista.length) return null;
    const i = lista.length - 1;
    const r = lista[i];
    const previo = i > 0 ? r.peso - lista[i - 1].peso : null;
    const perdido = S.ajustes.inicioPeso - r.peso;
    const dato = (v, f) => (v === null ? 's/d' : f(v));
    let t = `Check-in semanal — ${fechaCL(r.fecha)}. `
      + `Peso: ${num(r.peso)} kg (variación ${previo === null ? 's/d' : conSigno(previo) + ' kg'}; total perdido ${numNeg(perdido)} kg). `
      + `Promedio móvil 3 sem: ${num(promedioMovil(lista, i))} kg. `
      + `Entrenos: ${dato(r.entrenos, textoEntrenos)}. `
      + `Pasos promedio: ${dato(r.pasos, (v) => v.toLocaleString('es-CL'))}. `
      + `Cumplimiento plan: ${dato(r.plan, (v) => v + '/5')}. `
      + `Comidas a deshoras: ${dato(r.deshoras, (v) => ETIQUETA_DESHORAS[v])}. `
      + `Sueño: ${dato(r.sueno, (v) => textoSueno(v) + ' h')}. `
      + `Energía: ${dato(r.energia, (v) => v + '/5')}. `
      + `Notas: ${r.notas ? r.notas.replace(/\s+/g, ' ') : '—'}`;
    const conCintura = [...S.medidas].filter((m) => m.cintura !== null).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (conCintura.length) {
      const ult = conCintura[conCintura.length - 1];
      const var0 = conCintura.length > 1 ? ` (${conSigno(ult.cintura - conCintura[0].cintura)} cm vs. primera medición)` : '';
      t += `\nCintura: ${num(ult.cintura)} cm${var0}, medida el ${fechaCL(ult.fecha)}.`;
    }
    return t;
  }

  async function copiarTexto(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch (e) {
      // Respaldo para navegadores sin API de portapapeles
      const area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      area.remove();
      return ok;
    }
  }

  async function copiarResumen() {
    const t = textoResumen();
    if (!t) { toast('Aún no hay registros'); return; }
    const ok = await copiarTexto(t);
    if (ok) toast('Copiado ✔');
    else await dialogo({ titulo: 'No se pudo copiar', texto: t, botones: [{ texto: 'Cerrar', valor: true }] });
  }

  /* =====================================================================
     11. RESPALDO: EXPORTAR / IMPORTAR / BORRAR / DATOS DE EJEMPLO
     ===================================================================== */
  function exportarDatos() {
    S.ui.ultimoRespaldo = hoy();
    guardar();
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `ponci-tracker-${hoy()}.json`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    renderTodo();
    toast('Respaldo descargado ✔');
  }

  async function importarDatos(archivo) {
    if (!archivo) return;
    try {
      const nuevo = normalizar(JSON.parse(await archivo.text()));
      const ok = await confirmar('¿Restaurar este respaldo?',
        `El archivo tiene ${nuevo.registros.length} registros y ${nuevo.medidas.length} mediciones. Reemplazará todos los datos actuales.`, 'Restaurar', true);
      if (!ok) return;
      S = nuevo;
      guardar();
      renderTodo();
      toast('Datos restaurados ✔');
    } catch (e) {
      await dialogo({ titulo: 'No se pudo importar', texto: e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : e.message, botones: [{ texto: 'Entendido', valor: true }] });
    }
  }

  async function borrarTodo() {
    const ok1 = await confirmar('¿Borrar todos los datos?', 'Se eliminarán todos tus registros y medidas. Te recomiendo exportar un respaldo antes.', 'Continuar', true);
    if (!ok1) return;
    const ok2 = await confirmar('Última confirmación', 'Esto no se puede deshacer. La app volverá al estado inicial (semana 0, 108,0 kg).', 'Sí, borrar todo', true);
    if (!ok2) return;
    S = datosIniciales();
    guardar();
    renderTodo();
    cambiarVista('inicio');
    toast('Datos borrados');
  }

  /** Genera 8 semanas de datos falsos (guardando los reales aparte) para probar la app. */
  async function cargarDemo() {
    const ok = await confirmar('¿Cargar datos de ejemplo?', 'Tus datos reales se guardan aparte y se restauran al quitar el ejemplo.', 'Cargar ejemplo');
    if (!ok) return;
    const inicio = sumarDias(hoy(), -58); // el último registro queda 2 días atrás
    const pesos = [108, 107.4, 106.5, 105.9, 105.8, 104.7, 104.1, 103.6, 102.9];
    const ent = [null, 2, 3, 3, 1, 3, 4, 3, 3];
    const plan = [null, 3, 4, 4, 2, 4, 5, 4, 4];
    const respaldo = { registros: S.registros, medidas: S.medidas, ajustes: S.ajustes };
    S.ui.demo = respaldo;
    S.ajustes = { ...S.ajustes, inicioFecha: inicio, inicioPeso: 108 };
    S.registros = pesos.map((p, k) => ({
      id: nuevoId(), fecha: sumarDias(inicio, k * 7), peso: p,
      entrenos: ent[k], pasos: k ? 7000 + k * 400 : null, plan: plan[k],
      deshoras: k ? (k % 3 === 0 ? '1-2' : 'nunca') : null, sueno: k ? 6 + (k % 3) : null, energia: k ? 3 + (k % 3 === 0 ? 1 : 0) : null,
      notas: k === 4 ? 'Semana de cumpleaños, comí de más.' : '',
    }));
    S.medidas = [
      { id: nuevoId(), fecha: sumarDias(inicio, 7), cintura: 104, abdomen: 110, pecho: 112 },
      { id: nuevoId(), fecha: sumarDias(inicio, 28), cintura: 101.5, abdomen: 107, pecho: 110.5 },
    ];
    guardar();
    renderTodo();
    cambiarVista('inicio');
    toast('Datos de ejemplo cargados');
  }

  async function quitarDemo() {
    if (!S.ui.demo) return;
    const ok = await confirmar('¿Quitar datos de ejemplo?', 'Se restauran tus datos reales.', 'Quitar ejemplo');
    if (!ok) return;
    const real = S.ui.demo;
    S.registros = real.registros;
    S.medidas = real.medidas;
    S.ajustes = real.ajustes;
    S.ui.demo = null;
    guardar();
    renderTodo();
    toast('Datos reales restaurados');
  }

  /* =====================================================================
     12. NAVEGACIÓN Y EVENTOS
     ===================================================================== */
  let vistaActual = 'inicio';

  function cambiarVista(nombre) {
    vistaActual = nombre;
    $$('.vista').forEach((v) => { v.hidden = v.id !== `vista-${nombre}`; });
    $$('.tab').forEach((t) => {
      const activa = t.dataset.vista === nombre;
      t.setAttribute('aria-selected', String(activa));
      t.tabIndex = activa ? 0 : -1;
    });
    $('#barraAccion').hidden = !(nombre === 'inicio' || nombre === 'historial');
    window.scrollTo(0, 0);
    if (nombre === 'inicio') dibujarGrafico();
    if (nombre === 'medidas' && !$('#m-fecha').value) $('#m-fecha').value = hoy();
  }

  function manejarAcciones(ev) {
    const b = ev.target.closest('[data-accion]');
    if (!b) return;
    const accion = b.dataset.accion;
    if (accion === 'registrar') abrirHoja();
    else if (accion === 'ir-medidas') cambiarVista('medidas');
    else if (accion === 'exportar') exportarDatos();
    else if (accion === 'cerrar-instalar') { S.ui.instalarCerrado = true; guardar(); renderAvisosDiscretos(); }
  }

  function iniciarEventos() {
    $$('.tab').forEach((t) => t.addEventListener('click', () => cambiarVista(t.dataset.vista)));
    // Navegación con flechas entre pestañas
    $('.tabs').addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      const tabs = $$('.tab');
      const i = tabs.findIndex((t) => t.dataset.vista === vistaActual);
      const sig = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      cambiarVista(sig.dataset.vista);
      sig.focus();
    });

    document.addEventListener('click', manejarAcciones);
    $('#btnRegistrar').addEventListener('click', () => abrirHoja());
    $('#btnRespaldoRapido').addEventListener('click', exportarDatos);
    $('#btnCopiar').addEventListener('click', copiarResumen);
    $('#listaHistorial').addEventListener('click', (ev) => {
      const fila = ev.target.closest('.fila-hist');
      if (fila) abrirHoja(fila.dataset.id);
    });
    $('#tablaMedidas').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-medida]');
      if (b) eliminarMedida(b.dataset.medida);
    });

    // Hoja de registro
    $('#hoja').addEventListener('submit', guardarRegistro);
    $('#btnCerrarHoja').addEventListener('click', cerrarHoja);
    $('#fondoHoja').addEventListener('click', cerrarHoja);
    $('#btnEliminar').addEventListener('click', eliminarRegistro);
    $('#f-peso').addEventListener('input', actualizarReferencia);
    $('#f-fecha').addEventListener('change', actualizarReferencia);

    // Medidas y ajustes
    $('#formMedidas').addEventListener('submit', guardarMedidas);
    $('#formAjustes').addEventListener('submit', guardarAjustes);
    $('#btnExportar').addEventListener('click', exportarDatos);
    $('#archivoImportar').addEventListener('change', (ev) => { importarDatos(ev.target.files[0]); ev.target.value = ''; });
    $('#lblImportar').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('#archivoImportar').click(); } });
    $('#btnBorrarTodo').addEventListener('click', borrarTodo);
    $('#btnDemo').addEventListener('click', cargarDemo);
    $('#btnQuitarDemo').addEventListener('click', quitarDemo);

    // Escape cierra diálogo u hoja
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (resolverDialogo) cerrarDialogo(resolverDialogo.valorCancelar);
      else if (hojaAbierta()) cerrarHoja();
    });

    // Redibujar el gráfico si cambia el ancho (giro de pantalla, escritorio)
    let anchoPrevio = window.innerWidth;
    let temporizador = null;
    window.addEventListener('resize', () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        if (window.innerWidth !== anchoPrevio) { anchoPrevio = window.innerWidth; dibujarGrafico(); }
      }, 120);
    });
    // Al volver a abrir la app, refrescar (puede haber cambiado el día)
    document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTodo(); });
  }

  /* =====================================================================
     13. SERVICE WORKER (modo sin conexión)
     ===================================================================== */
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* la app funciona igual sin SW */ });
    });
  }

  /* =====================================================================
     14. ARRANQUE
     ===================================================================== */
  function iniciar() {
    S = cargar() || datosIniciales();
    construirSelectores();
    F = { entrenos: null, plan: null, deshoras: null, sueno: null, energia: null };
    iniciarEventos();
    guardar(); // deja guardados los datos iniciales la primera vez
    pedirPersistencia();
    cambiarVista('inicio');
    renderTodo();
    registrarServiceWorker();
  }

  iniciar();
})();
