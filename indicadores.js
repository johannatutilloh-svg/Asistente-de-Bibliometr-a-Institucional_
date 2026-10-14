/* Indicadores · lectura, validación y cálculo.
 * Funciones puras: no tocan el DOM ni la red. El panel, los gráficos y el
 * informe usan el MISMO objeto que devuelve calcular(), de modo que ninguna
 * cifra del texto puede diferir de un gráfico.
 * También se carga en Node para las pruebas (scripts/prueba_panel.js).
 */
(function (raiz) {
  'use strict';

  var REQUERIDAS = ['eid', 'anio', 'tipo', 'fuente', 'citas', 'acceso_abierto', 'cuartil',
    'unidades', 'paises', 'internacional'];
  var OPCIONALES = ['doi', 'titulo', 'issn'];
  // Columnas que delatan nombres de personas: la base del panel no debe tenerlas.
  var PATRON_PERSONAS = /(autor|author|investigador|researcher|orcid|nombre)/i;
  var CUARTILES = ['Q1', 'Q2', 'Q3', 'Q4'];

  // ------------------------------------------------------------ CSV (RFC 4180)
  function parsearCSV(texto) {
    texto = texto.replace(/^\uFEFF/, '');
    var filas = [], fila = [], campo = '', comillas = false;
    for (var i = 0; i < texto.length; i++) {
      var c = texto[i];
      if (comillas) {
        if (c === '"') {
          if (texto[i + 1] === '"') { campo += '"'; i++; } else { comillas = false; }
        } else { campo += c; }
      } else if (c === '"') { comillas = true; }
      else if (c === ',') { fila.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        fila.push(campo); campo = '';
        if (fila.length > 1 || fila[0] !== '') filas.push(fila);
        fila = [];
      } else { campo += c; }
    }
    if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  function siNo(v) {
    v = String(v || '').trim().toLowerCase();
    if (['sí', 'si', 'yes', 'true', '1'].indexOf(v) >= 0) return true;
    if (['no', 'false', '0', ''].indexOf(v) >= 0) return false;
    return null;
  }

  function lista(v) {
    return String(v || '').split('|').map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
  }

  // ------------------------------------------------------------ base limpia
  function cargarBase(texto, anioActual) {
    anioActual = anioActual || new Date().getFullYear();
    var errores = [], docs = [];
    var filas = parsearCSV(texto);
    if (!filas.length) return { docs: [], errores: ['El archivo está vacío.'] };
    var cab = filas[0].map(function (c) { return c.trim().toLowerCase(); });

    var personas = cab.filter(function (c) { return PATRON_PERSONAS.test(c); });
    if (personas.length) {
      return { docs: [], errores: ['El archivo tiene columnas con nombres de personas (' +
        personas.join(', ') + '). Por privacidad, el panel solo acepta la base limpia ' +
        'sin autores que produce el Componente 1. No se cargó ningún dato.'] };
    }
    var faltan = REQUERIDAS.filter(function (c) { return cab.indexOf(c) < 0; });
    if (faltan.length) {
      return { docs: [], errores: ['Faltan columnas: ' + faltan.join(', ') +
        '. ¿Es una exportación directa de Scopus? El panel necesita la base limpia del ' +
        'Componente 1.'] };
    }
    var idx = {};
    REQUERIDAS.concat(OPCIONALES).forEach(function (c) { idx[c] = cab.indexOf(c); });
    var vistos = Object.create(null);

    for (var i = 1; i < filas.length; i++) {
      var f = filas[i], n = i + 1;
      var g = function (c) { return idx[c] >= 0 ? (f[idx[c]] || '').trim() : ''; };
      var eid = g('eid');
      var anio = Number(g('anio'));
      var citas = g('citas') === '' ? 0 : Number(g('citas'));
      var oa = siNo(g('acceso_abierto'));
      var intl = siNo(g('internacional'));
      var q = g('cuartil').toUpperCase();
      if (!eid) errores.push('Fila ' + n + ': falta el EID.');
      else if (vistos[eid]) errores.push('Fila ' + n + ': el EID ' + eid + ' está repetido (ya aparece en la fila ' + vistos[eid] + ').');
      else vistos[eid] = n;
      if (!Number.isInteger(anio) || anio < 1900 || anio > anioActual + 1)
        errores.push('Fila ' + n + ': el año «' + g('anio') + '» está fuera de rango.');
      if (!Number.isInteger(citas) || citas < 0)
        errores.push('Fila ' + n + ': las citas «' + g('citas') + '» no son un número entero.');
      if (oa === null) errores.push('Fila ' + n + ': acceso_abierto debe ser «sí» o «no».');
      if (intl === null) errores.push('Fila ' + n + ': internacional debe ser «sí» o «no».');
      if (q && CUARTILES.indexOf(q) < 0) errores.push('Fila ' + n + ': cuartil «' + q + '» no válido.');
      docs.push({
        eid: eid, anio: anio, tipo: g('tipo'), fuente: g('fuente'), citas: citas,
        oa: oa === true, cuartil: q, unidades: lista(g('unidades')), paises: lista(g('paises')),
        internacional: intl === true, doi: g('doi'), titulo: g('titulo'), issn: g('issn')
      });
      if (errores.length > 20) { errores.push('Hay más errores; se muestran los primeros 20.'); break; }
    }
    if (!docs.length && !errores.length) errores.push('El archivo no tiene documentos.');
    return { docs: errores.length ? [] : docs, errores: errores };
  }

  // ------------------------------------------------------------ registro
  var CLAVES_REGISTRO = ['fecha_descarga', 'consulta_scopus', 'archivos', 'n_bruto',
    'n_duplicados', 'n_excluidos', 'n_final', 'version_tabla_afiliaciones', 'archivo_sjr',
    'regla_cuartil', 'regla_conteo_unidades'];

  function validarRegistro(reg, docs) {
    var avisos = [];
    if (!reg || typeof reg !== 'object') return ['El registro no es un objeto JSON válido.'];
    var faltan = CLAVES_REGISTRO.filter(function (k) { return !(k in reg); });
    if (faltan.length) avisos.push('Al registro le faltan campos: ' + faltan.join(', ') + '.');
    if ('n_final' in reg && docs && Number(reg.n_final) !== docs.length) {
      avisos.push('El registro indica n_final = ' + reg.n_final + ', pero la base cargada tiene ' +
        docs.length + ' documentos. La base y el registro no corresponden a la misma ejecución.');
    }
    if (['n_bruto', 'n_duplicados', 'n_excluidos', 'n_final'].every(function (k) { return k in reg; })) {
      var esperado = reg.n_bruto - reg.n_duplicados - (reg.n_duplicados_probables || 0) - reg.n_excluidos;
      if (esperado !== Number(reg.n_final)) {
        avisos.push('Las cuentas del registro no cuadran: ' + reg.n_bruto + ' − ' + reg.n_duplicados +
          ' − ' + (reg.n_duplicados_probables || 0) + ' − ' + reg.n_excluidos + ' = ' + esperado +
          ', no ' + reg.n_final + '.');
      }
    }
    return avisos;
  }

  // ------------------------------------------------------------ cálculo
  function filtrar(docs, f) {
    return docs.filter(function (d) {
      if (d.anio < f.anioDesde || d.anio > f.anioHasta) return false;
      if (f.tipos.indexOf(d.tipo) < 0) return false;
      if (f.todasUnidades) return true;
      return d.unidades.some(function (u) { return f.unidades.indexOf(u) >= 0; });
    });
  }

  function indiceH(citas) {
    var c = citas.slice().sort(function (a, b) { return b - a; }), h = 0;
    while (h < c.length && c[h] >= h + 1) h++;
    return h;
  }

  function redondear(x, d) {
    var m = Math.pow(10, d);
    return Math.round((x + 1e-9) * m) / m;
  }

  function pct(a, b) { return b ? redondear(100 * a / b, 1) : null; }

  // Cuenta conservando el orden de primera aparición; ante empates, ese orden decide.
  function contar(valores) {
    var m = new Map();
    valores.forEach(function (v) { m.set(v, (m.get(v) || 0) + 1); });
    return Array.from(m, function (e, i) { return { clave: e[0], n: e[1], orden: i }; })
      .sort(function (a, b) { return b.n - a.n || a.orden - b.orden; });
  }

  function calcular(docs, opciones) {
    opciones = opciones || {};
    var pais = opciones.paisInstitucion || 'Ecuador';
    var n = docs.length;
    var citas = docs.reduce(function (s, d) { return s + d.citas; }, 0);
    var r = { n: n, citas: citas };
    r.citasPorDoc = n ? redondear(citas / n, 2) : null;
    r.h = indiceH(docs.map(function (d) { return d.citas; }));
    r.sinCitas = docs.filter(function (d) { return d.citas === 0; }).length;

    var desde = opciones.anioDesde, hasta = opciones.anioHasta;
    if (desde == null && n) desde = Math.min.apply(null, docs.map(function (d) { return d.anio; }));
    if (hasta == null && n) hasta = Math.max.apply(null, docs.map(function (d) { return d.anio; }));
    r.porAnio = [];
    for (var a = desde; n && a <= hasta; a++) r.porAnio.push({ anio: a, docs: 0, citas: 0 });
    docs.forEach(function (d) {
      var x = r.porAnio[d.anio - desde];
      if (x) { x.docs++; x.citas += d.citas; }
    });

    r.tipos = contar(docs.map(function (d) { return d.tipo; }))
      .map(function (t) { return { tipo: t.clave, n: t.n }; });

    r.cuartiles = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, sin: 0 };
    docs.forEach(function (d) { r.cuartiles[d.cuartil || 'sin']++; });
    r.conCuartil = n - r.cuartiles.sin;
    r.q12 = r.cuartiles.Q1 + r.cuartiles.Q2;
    r.pctQ12 = pct(r.q12, r.conCuartil);

    r.oa = docs.filter(function (d) { return d.oa; }).length;
    r.pctOA = pct(r.oa, n);
    r.intl = docs.filter(function (d) { return d.internacional; }).length;
    r.pctIntl = pct(r.intl, n);

    var listaPaises = [];
    docs.forEach(function (d) {
      Array.from(new Set(d.paises)).forEach(function (p) { if (p !== pais) listaPaises.push(p); });
    });
    r.paises = contar(listaPaises).map(function (p) { return { pais: p.clave, n: p.n, pct: pct(p.n, n) }; });
    r.paisesPrincipales = r.paises.filter(function (p) { return r.paises.length && p.n === r.paises[0].n; });
    r.paisPrincipal = r.paises.length ? r.paises[0].pais : null;

    var fuentes = new Map();
    docs.forEach(function (d) {
      var f = fuentes.get(d.fuente) || { fuente: d.fuente, n: 0, citas: 0, cuartil: '' };
      f.n++; f.citas += d.citas; if (!f.cuartil && d.cuartil) f.cuartil = d.cuartil;
      fuentes.set(d.fuente, f);
    });
    r.fuentes = Array.from(fuentes.values()).sort(function (a, b) {
      return b.n - a.n || a.fuente.localeCompare(b.fuente, 'es');
    });

    var unidades = new Map();
    docs.forEach(function (d) {
      d.unidades.forEach(function (u) {
        var x = unidades.get(u) || { unidad: u, n: 0, compartidos: 0, citas: 0, lista: [] };
        x.n++; x.citas += d.citas; x.lista.push(d.citas);
        if (d.unidades.length > 1) x.compartidos++;
        unidades.set(u, x);
      });
    });
    // Orden alfabético a propósito: el panel no ordena unidades como ranking.
    r.unidades = Array.from(unidades.values()).sort(function (a, b) {
      return a.unidad.localeCompare(b.unidad, 'es');
    }).map(function (x) {
      return { unidad: x.unidad, n: x.n, compartidos: x.compartidos, citas: x.citas,
        citasPorDoc: redondear(x.citas / x.n, 2), h: indiceH(x.lista) };
    });
    r.sumaUnidades = docs.reduce(function (s, d) { return s + d.unidades.length; }, 0);
    r.anioDesde = desde; r.anioHasta = hasta;
    return r;
  }

  var api = { parsearCSV: parsearCSV, cargarBase: cargarBase, validarRegistro: validarRegistro,
    filtrar: filtrar, calcular: calcular, indiceH: indiceH, redondear: redondear,
    REQUERIDAS: REQUERIDAS };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Indicadores = api;
})(this);
