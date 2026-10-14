/* Panel · carga de archivos, filtros y dibujo.
 * Sin red (la CSP lo impide), sin localStorage, sin analítica: al cerrar la
 * pestaña no queda ningún dato.
 */
(function () {
  'use strict';
  var I = window.Indicadores, G = window.Graficos, T = window.Informe;
  var $ = function (id) { return document.getElementById(id); };

  var estado = {
    docs: null, nombreBase: '', hashBase: null, demo: false,
    registro: null, nombreRegistro: '', avisosRegistro: [], erroresBase: [], erroresRegistro: [],
    filtros: null, tipos: [], unidades: [], anios: []
  };

  // ------------------------------------------------------------ utilidades
  function sha256(buffer) {
    if (!window.crypto || !crypto.subtle) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', buffer).then(function (h) {
      return Array.from(new Uint8Array(h)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }).catch(function () { return null; });
  }

  function leerArchivo(archivo) {
    return archivo.arrayBuffer().then(function (buf) {
      return sha256(buf).then(function (hash) {
        return { texto: new TextDecoder('utf-8').decode(buf), hash: hash };
      });
    });
  }

  function mensaje(tipo, titulo, lineas) {
    var caja = G.h('div', 'mensaje mensaje-' + tipo);
    caja.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    caja.appendChild(G.h('strong', '', titulo));
    if (lineas && lineas.length) {
      var ul = G.h('ul');
      lineas.forEach(function (l) { ul.appendChild(G.h('li', '', l)); });
      caja.appendChild(ul);
    }
    return caja;
  }

  function paisInstitucion() {
    if (estado.registro && estado.registro.pais_institucion) return estado.registro.pais_institucion;
    // Sin registro: el país presente en más documentos.
    var c = {};
    estado.docs.forEach(function (d) { d.paises.forEach(function (p) { c[p] = (c[p] || 0) + 1; }); });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0] || '';
  }

  function trazabilidadCompleta() {
    return !!estado.registro && !estado.avisosRegistro.length && !hashNoCoincide();
  }

  function hashNoCoincide() {
    var r = estado.registro;
    return !!(r && r.base_limpia && r.base_limpia.sha256 && estado.hashBase &&
      r.base_limpia.sha256 !== estado.hashBase);
  }

  // ------------------------------------------------------------ carga
  function cargarBaseTexto(texto, nombre, hash, demo) {
    var res = I.cargarBase(texto);
    estado.erroresBase = res.errores;
    if (res.errores.length) {
      estado.docs = null;
    } else {
      estado.docs = res.docs; estado.nombreBase = nombre; estado.hashBase = hash; estado.demo = !!demo;
      estado.anios = Array.from(new Set(res.docs.map(function (d) { return d.anio; }))).sort();
      estado.tipos = ordenarPorFrecuencia(res.docs.map(function (d) { return d.tipo; }));
      estado.unidades = Array.from(new Set([].concat.apply([], res.docs.map(function (d) { return d.unidades; }))))
        .sort(function (a, b) { return a.localeCompare(b, 'es'); });
      restablecerFiltros();
    }
    revalidarRegistro();
    dibujar();
  }

  function ordenarPorFrecuencia(valores) {
    var c = {};
    valores.forEach(function (v) { c[v] = (c[v] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b, 'es'); });
  }

  function cargarRegistroTexto(texto, nombre) {
    try {
      estado.registro = JSON.parse(texto);
      estado.nombreRegistro = nombre;
      estado.erroresRegistro = [];
    } catch (e) {
      estado.registro = null;
      estado.erroresRegistro = ['«' + nombre + '» no es un JSON válido: ' + e.message];
    }
    revalidarRegistro();
    dibujar();
  }

  function revalidarRegistro() {
    estado.avisosRegistro = estado.registro && estado.docs ? I.validarRegistro(estado.registro, estado.docs) : [];
    if (hashNoCoincide()) {
      estado.avisosRegistro.push('La huella SHA-256 de la base cargada no coincide con la del registro: ' +
        'la base pudo modificarse después de generarse.');
    }
  }

  function quitarDatos() {
    estado.docs = null; estado.registro = null; estado.demo = false;
    estado.erroresBase = []; estado.erroresRegistro = []; estado.avisosRegistro = [];
    $('archivo-base').value = ''; $('archivo-registro').value = '';
    dibujar();
  }

  // ------------------------------------------------------------ filtros
  function restablecerFiltros() {
    estado.filtros = {
      anioDesde: estado.anios[0], anioHasta: estado.anios[estado.anios.length - 1],
      tipos: estado.tipos.slice(), unidades: estado.unidades.slice(), todasUnidades: true
    };
  }

  function opciones(select, valores, actual) {
    select.replaceChildren.apply(select, valores.map(function (v) {
      var o = document.createElement('option'); o.value = v; o.textContent = v;
      o.selected = v === actual; return o;
    }));
  }

  function chips(contenedor, valores, seleccion, alCambiar) {
    contenedor.replaceChildren.apply(contenedor, valores.map(function (v) {
      var b = G.h('button', 'chip', v);
      b.type = 'button';
      b.setAttribute('aria-pressed', seleccion.indexOf(v) >= 0 ? 'true' : 'false');
      b.addEventListener('click', function () { alCambiar(v); });
      return b;
    }));
  }

  function alternar(lista, v) {
    var i = lista.indexOf(v);
    if (i >= 0) lista.splice(i, 1); else lista.push(v);
  }

  function textoFiltros() {
    var f = estado.filtros;
    var tipos = f.tipos.length === estado.tipos.length ? 'todos los tipos de documento'
      : f.tipos.length ? 'tipos: ' + T.enumerar(f.tipos) : 'ningún tipo seleccionado';
    var unidades = f.todasUnidades ? 'todas las unidades'
      : f.unidades.length ? 'unidades: ' + T.enumerar(f.unidades) : 'ninguna unidad seleccionada';
    return 'años ' + f.anioDesde + '–' + f.anioHasta + '; ' + tipos + '; ' + unidades;
  }

  // ------------------------------------------------------------ dibujo
  function dibujarMensajes() {
    var m = $('mensajes');
    var cajas = [];
    if (estado.erroresBase.length) cajas.push(mensaje('error', 'No se pudo cargar la base.', estado.erroresBase));
    if (estado.erroresRegistro.length) cajas.push(mensaje('error', 'No se pudo leer el registro.', estado.erroresRegistro));
    if (estado.docs && !estado.registro) {
      cajas.push(mensaje('aviso', 'Trazabilidad incompleta: falta el registro de la ejecución (registro.json).',
        ['Sin él no se puede rastrear la fecha de descarga, la consulta ni las reglas aplicadas. El informe quedará marcado como «sin trazabilidad completa».']));
    }
    if (estado.avisosRegistro.length) {
      cajas.push(mensaje('aviso', 'Trazabilidad incompleta: el registro no corresponde a la base cargada.', estado.avisosRegistro));
    }
    m.replaceChildren.apply(m, cajas);
  }

  function dibujarEstado() {
    var e = $('estado');
    if (!estado.docs) {
      e.textContent = 'Ningún dato cargado. Los archivos se leen en este navegador y no se envían a ningún servidor.';
      return;
    }
    e.replaceChildren();
    if (estado.demo) e.appendChild(G.h('span', 'insignia', 'Datos ficticios de demostración'));
    var partes = [estado.nombreBase, T.num(estado.docs.length) + ' documentos'];
    if (estado.registro && estado.registro.fecha_descarga) partes.push('descarga ' + estado.registro.fecha_descarga);
    partes.push(estado.registro ? 'registro: ' + estado.nombreRegistro : 'sin registro');
    e.appendChild(document.createTextNode(partes.join(' · ')));
  }

  function cifra(valor, etiqueta, detalle) {
    var d = G.h('div', 'cifra');
    d.appendChild(G.h('p', 'cifra-valor', valor));
    d.appendChild(G.h('p', 'cifra-etiqueta', etiqueta));
    if (detalle) d.appendChild(G.h('p', 'cifra-detalle', detalle));
    return d;
  }

  function dibujar() {
    dibujarMensajes();
    dibujarEstado();
    var hay = !!estado.docs;
    $('vacio').hidden = hay;
    $('contenido').hidden = !hay;
    $('quitar-datos').hidden = !hay && !estado.registro;
    if (!hay) return;

    var f = estado.filtros;
    opciones($('anio-desde'), estado.anios, f.anioDesde);
    opciones($('anio-hasta'), estado.anios, f.anioHasta);
    chips($('chips-tipos'), estado.tipos, f.tipos, function (v) { alternar(f.tipos, v); dibujar(); });
    chips($('chips-unidades'), estado.unidades, f.todasUnidades ? estado.unidades : f.unidades, function (v) {
      if (f.todasUnidades) { f.unidades = estado.unidades.slice(); f.todasUnidades = false; }
      alternar(f.unidades, v);
      f.todasUnidades = f.unidades.length === estado.unidades.length;
      dibujar();
    });

    var pais = paisInstitucion();
    var docs = I.filtrar(estado.docs, f);
    var r = I.calcular(docs, { paisInstitucion: pais, anioDesde: f.anioDesde, anioHasta: f.anioHasta });
    var ctx = {
      institucion: estado.registro && estado.registro.institucion || 'la institución',
      paisInstitucion: pais,
      fechaDescarga: estado.registro && estado.registro.fecha_descarga,
      todasUnidades: f.todasUnidades,
      registro: estado.registro,
      base: estado.nombreBase + ' · ' + T.num(estado.docs.length) + ' documentos' +
        (estado.hashBase ? ' · SHA-256 ' + estado.hashBase.slice(0, 12) + '…' +
          (estado.registro && estado.registro.base_limpia ? (hashNoCoincide() ? ' (no coincide con el registro)' : ' (coincide con el registro)') : '') : ''),
      filtros: textoFiltros(),
      trazabilidad: trazabilidadCompleta() ? 'Completa: la base y el registro corresponden a la misma ejecución.'
        : 'Sin trazabilidad completa. ' + (estado.registro ? estado.avisosRegistro.join(' ') : 'No se cargó el registro de la ejecución.')
    };

    $('resumen').textContent = T.resumen(r, ctx);

    $('cifras').replaceChildren(
      cifra(T.num(r.n), 'Documentos', T.num(r.conCuartil) + ' en revistas con cuartil'),
      cifra(T.num(r.citas), 'Citas', ctx.fechaDescarga ? 'a la fecha de descarga' : 'acumuladas'),
      cifra(T.num(r.citasPorDoc, 1), 'Citas por documento', T.num(r.sinCitas) + ' sin citas'),
      cifra(String(r.h), 'Índice h', 'del conjunto filtrado'),
      cifra(T.pct(r.pctQ12), 'En revistas Q1–Q2', 'sobre documentos con cuartil'),
      cifra(T.pct(r.pctIntl), 'Colaboración internacional', T.num(r.intl) + ' documentos'),
      cifra(T.pct(r.pctOA), 'Acceso abierto', T.num(r.oa) + ' documentos')
    );

    G.barrasVerticales($('g-docs-anio'), r.porAnio.map(function (a) { return { etiqueta: String(a.anio), valor: a.docs }; }),
      { titulo: 'Documentos por año de publicación', formato: function (v) { return T.num(v); } });
    G.barrasVerticales($('g-citas-anio'), r.porAnio.map(function (a) { return { etiqueta: String(a.anio), valor: a.citas }; }),
      { titulo: 'Citas acumuladas por año de publicación', formato: function (v) { return T.num(v); } });
    G.tabla($('t-anio'), [
      { titulo: 'Año', clave: 'anio' }, { titulo: 'Documentos', clave: 'docs', num: true, formato: T.num },
      { titulo: 'Citas', clave: 'citas', num: true, formato: T.num }
    ], r.porAnio, { leyenda: 'Documentos y citas por año' });

    var q = r.cuartiles;
    G.barrasHorizontales($('g-cuartiles'), ['Q1', 'Q2', 'Q3', 'Q4', 'sin'].map(function (k) {
      return { etiqueta: k === 'sin' ? 'Sin cuartil' : k, valor: q[k],
        detalle: T.num(q[k]) + ' · ' + (r.n ? Math.round(100 * q[k] / r.n) : 0) + ' %' };
    }), { max: r.n || 1 });
    var sjr = estado.registro && estado.registro.archivo_sjr;
    $('nota-cuartiles').textContent = (sjr ? 'Cuartiles según ' + (sjr.nombre || sjr) + (sjr.anio ? ' (SJR ' + sjr.anio + ')' : '') + '. ' : '') +
      'Mejor cuartil de la revista entre sus categorías. «Sin cuartil» agrupa ponencias, capítulos y revistas no clasificadas por SJR. ' +
      'Los porcentajes de esta lista son sobre todos los documentos; el % Q1–Q2 de las cifras es sobre los documentos con cuartil.';

    G.barrasHorizontales($('g-tipos'), r.tipos.map(function (t) {
      return { etiqueta: t.tipo, valor: t.n, detalle: T.num(t.n) + ' · ' + Math.round(100 * t.n / r.n) + ' %' };
    }), { max: r.n || 1 });

    var top = r.paises.slice(0, 10);
    G.barrasHorizontales($('g-paises'), top.map(function (p) {
      return { etiqueta: T.pais(p.pais), valor: p.n, detalle: T.num(p.n) + ' · ' + Math.round(p.pct) + ' %',
        resaltar: r.paisesPrincipales.length > 1 && p.n === r.paises[0].n };
    }), { vacio: 'Ningún documento filtrado tiene coautores de otros países.' });
    $('nota-paises').textContent = 'Porcentaje sobre el total de documentos filtrados. Un documento puede tener coautores de varios países.' +
      (r.paisesPrincipales.length > 1 ? ' Hay un empate en el primer lugar entre ' +
        T.enumerar(r.paisesPrincipales.map(function (p) { return T.pais(p.pais); })) + ' (' + T.num(r.paises[0].n) + ' documentos cada uno).' : '');

    G.tabla($('t-fuentes'), [
      { titulo: 'Fuente', clave: 'fuente' },
      { titulo: 'Cuartil', clave: 'cuartil', formato: function (v) { return v || '—'; },
        clase: function (f) { return 'cuartil cuartil-' + (f.cuartil || 'no'); } },
      { titulo: 'Documentos', clave: 'n', num: true, formato: T.num },
      { titulo: 'Citas', clave: 'citas', num: true, formato: T.num }
    ], r.fuentes.slice(0, 15), { leyenda: 'Fuentes con más documentos' });

    G.tabla($('t-unidades'), [
      { titulo: 'Unidad', clave: 'unidad' },
      { titulo: 'Documentos', clave: 'n', num: true, formato: T.num },
      { titulo: 'Compartidos', clave: 'compartidos', num: true, formato: T.num },
      { titulo: 'Citas', clave: 'citas', num: true, formato: T.num },
      { titulo: 'Citas/doc.', clave: 'citasPorDoc', num: true, formato: function (v) { return T.num(v, 1); } },
      { titulo: 'Índice h', clave: 'h', num: true }
    ], r.unidades, { leyenda: 'Producción por unidad académica' });
    $('nota-unidades').textContent = 'Ordenado alfabéticamente. «Compartidos» son documentos firmados con otra unidad: cuentan en cada una, ' +
      'por lo que la suma por unidades (' + T.num(r.sumaUnidades) + ') puede superar el total (' + T.num(r.n) + '). ' +
      (f.todasUnidades ? '' : 'Con el filtro de unidad aparecen también las unidades coautoras de los documentos seleccionados. ') +
      'Las citas y el índice h dependen de los hábitos de cada disciplina: no los use para comparar unidades de áreas distintas (DORA, Manifiesto de Leiden).';

    dibujarInforme(r, ctx);
  }

  function dibujarInforme(r, ctx) {
    var ahora = new Date();
    var fecha = ahora.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' }) + ' a las ' +
      ahora.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
    $('informe-meta').textContent = (ctx.institucion.charAt(0).toUpperCase() + ctx.institucion.slice(1)) +
      ' · Generado el ' + fecha + ' · Filtros: ' + ctx.filtros;

    var avisos = [];
    if (estado.demo) avisos.push(mensaje('aviso', 'Datos ficticios. Este informe usa datos de demostración y no describe ninguna institución real.'));
    if (!trazabilidadCompleta()) avisos.push(mensaje('aviso', 'Informe sin trazabilidad completa.', [ctx.trazabilidad]));
    $('informe-avisos').replaceChildren.apply($('informe-avisos'), avisos);

    var cuerpo = [];
    T.secciones(r, ctx).forEach(function (s) {
      cuerpo.push(G.h('h3', '', s.titulo));
      s.parrafos.forEach(function (p) { cuerpo.push(G.h('p', '', p)); });
    });
    $('informe-cuerpo').replaceChildren.apply($('informe-cuerpo'), cuerpo);

    var dl = [];
    T.notas(ctx).forEach(function (n) { dl.push(G.h('dt', '', n[0])); dl.push(G.h('dd', '', n[1])); });
    $('informe-notas').replaceChildren.apply($('informe-notas'), dl);

    $('pie-impresion').textContent = 'Filtros: ' + ctx.filtros + ' · Generado el ' + fecha +
      (trazabilidadCompleta() ? '' : ' · SIN TRAZABILIDAD COMPLETA');
  }

  // ------------------------------------------------------------ eventos
  $('archivo-base').addEventListener('change', function (e) {
    var a = e.target.files[0];
    if (!a) return;
    // Si había datos de ejemplo, su registro no corresponde a la base nueva.
    if (estado.demo) { estado.registro = null; estado.nombreRegistro = ''; }
    leerArchivo(a).then(function (x) { cargarBaseTexto(x.texto, a.name, x.hash, false); });
  });
  $('archivo-registro').addEventListener('change', function (e) {
    var a = e.target.files[0];
    if (!a) return;
    a.text().then(function (t) { cargarRegistroTexto(t, a.name); });
  });
  $('usar-demo').addEventListener('click', function () {
    var d = window.DATOS_DEMO;
    sha256(new TextEncoder().encode(d.csv)).then(function (hash) {
      estado.registro = d.registro; estado.nombreRegistro = 'registro.json (ejemplo)'; estado.erroresRegistro = [];
      cargarBaseTexto(d.csv, d.nombre, hash, true);
    });
  });
  $('quitar-datos').addEventListener('click', quitarDatos);
  $('restablecer').addEventListener('click', function () { restablecerFiltros(); dibujar(); });
  $('anio-desde').addEventListener('change', function (e) {
    estado.filtros.anioDesde = Number(e.target.value);
    if (estado.filtros.anioHasta < estado.filtros.anioDesde) estado.filtros.anioHasta = estado.filtros.anioDesde;
    dibujar();
  });
  $('anio-hasta').addEventListener('change', function (e) {
    estado.filtros.anioHasta = Number(e.target.value);
    if (estado.filtros.anioDesde > estado.filtros.anioHasta) estado.filtros.anioDesde = estado.filtros.anioHasta;
    dibujar();
  });
  $('imprimir').addEventListener('click', function () {
    document.body.classList.add('solo-informe');
    window.print();
  });
  window.addEventListener('afterprint', function () { document.body.classList.remove('solo-informe'); });

  dibujar();
})();
