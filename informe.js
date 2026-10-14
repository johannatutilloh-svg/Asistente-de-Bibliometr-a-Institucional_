/* Informe · redacta el texto a partir del MISMO objeto de indicadores que
 * usan los gráficos. Ninguna cifra se escribe a mano ni sale de la IA.
 */
(function (raiz) {
  'use strict';

  var PAISES = {
    'Argentina': 'Argentina', 'Australia': 'Australia', 'Austria': 'Austria', 'Belgium': 'Bélgica',
    'Bolivia': 'Bolivia', 'Brazil': 'Brasil', 'Canada': 'Canadá', 'Chile': 'Chile', 'China': 'China',
    'Colombia': 'Colombia', 'Costa Rica': 'Costa Rica', 'Cuba': 'Cuba', 'Denmark': 'Dinamarca',
    'Ecuador': 'Ecuador', 'Finland': 'Finlandia', 'France': 'Francia', 'Germany': 'Alemania',
    'India': 'India', 'Italy': 'Italia', 'Japan': 'Japón', 'Mexico': 'México',
    'Netherlands': 'Países Bajos', 'Norway': 'Noruega', 'Panama': 'Panamá', 'Paraguay': 'Paraguay',
    'Peru': 'Perú', 'Poland': 'Polonia', 'Portugal': 'Portugal', 'Russian Federation': 'Rusia',
    'South Africa': 'Sudáfrica', 'South Korea': 'Corea del Sur', 'Spain': 'España',
    'Sweden': 'Suecia', 'Switzerland': 'Suiza', 'United Kingdom': 'Reino Unido',
    'United States': 'Estados Unidos', 'Uruguay': 'Uruguay', 'Venezuela': 'Venezuela'
  };
  var TIPOS_PLURAL = { 'Artículo': 'artículos', 'Ponencia': 'ponencias',
    'Capítulo de libro': 'capítulos de libro', 'Revisión': 'revisiones', 'Libro': 'libros',
    'Editorial': 'editoriales', 'Carta': 'cartas', 'Nota': 'notas' };

  function pais(p) { return PAISES[p] || p; }

  // 1530 -> «1.530»; 9.56 -> «9,6». Separadores fijos para que pantalla e informe coincidan.
  function num(x, dec) {
    if (x == null || isNaN(x)) return '—';
    dec = dec || 0;
    var m = Math.pow(10, dec);
    var s = (Math.round((Math.abs(x) + 1e-9) * m) / m).toFixed(dec).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (x < 0 ? '−' : '') + s.join(',');
  }
  function pct(x, dec) { return x == null ? '—' : num(x, dec == null ? 1 : dec) + ' %'; }
  function pctDe(a, b) { return b ? Math.round(100 * a / b) + ' %' : '—'; }

  function enumerar(items) {
    if (items.length <= 1) return items.join('');
    return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
  }

  function resumen(r, ctx) {
    if (!r.n) return 'No hay documentos con los filtros seleccionados.';
    return 'Entre ' + r.anioDesde + ' y ' + r.anioHasta + ', ' + ctx.institucion + ' registra ' +
      num(r.n) + ' documentos en Scopus, con ' + num(r.citas) + ' citas y un índice h de ' + r.h +
      '; el ' + pct(r.pctIntl, 0) + ' se escribió con coautores de otros países.';
  }

  function secciones(r, ctx) {
    if (!r.n) return [{ titulo: 'Sin documentos', parrafos: ['No hay documentos con los filtros seleccionados.'] }];
    var s = [];

    var tipos = r.tipos.map(function (t) {
      return num(t.n) + ' ' + (t.n === 1 ? t.tipo.toLowerCase() : (TIPOS_PLURAL[t.tipo] || t.tipo.toLowerCase())) +
        ' (' + pctDe(t.n, r.n) + ')';
    });
    var p1 = 'Entre ' + r.anioDesde + ' y ' + r.anioHasta + ', ' + ctx.institucion + ' registra ' +
      num(r.n) + ' documentos indexados en Scopus: ' + enumerar(tipos) + '.';
    var ini = r.porAnio[0], fin = r.porAnio[r.porAnio.length - 1];
    if (r.porAnio.length > 1) {
      p1 += ' La producción anual pasó de ' + num(ini.docs) + ' documentos en ' + ini.anio + ' a ' +
        num(fin.docs) + ' en ' + fin.anio;
      p1 += ini.docs ? ', una variación de ' + (fin.docs >= ini.docs ? '+' : '−') +
        Math.round(Math.abs(100 * (fin.docs - ini.docs) / ini.docs)) + ' %.' : '.';
    }
    s.push({ titulo: 'Producción', parrafos: [p1] });

    s.push({ titulo: 'Impacto', parrafos: ['En conjunto, estos documentos suman ' + num(r.citas) +
      ' citas registradas en Scopus' + (ctx.fechaDescarga ? ' a ' + ctx.fechaDescarga : '') +
      ', con un promedio de ' + num(r.citasPorDoc, 1) + ' citas por documento y un índice h de ' + r.h +
      '. ' + num(r.sinCitas) + ' documentos (' + pctDe(r.sinCitas, r.n) + ') aún no registran citas. ' +
      'Las citas son acumuladas: los documentos de los años más recientes han tenido menos tiempo para ' +
      'ser citados, por lo que su menor número de citas no indica menor impacto.'] });

    var q = r.cuartiles;
    var p3 = r.conCuartil
      ? 'De los ' + num(r.conCuartil) + ' documentos publicados en revistas con cuartil SJR, ' + num(r.q12) +
        ' (' + pct(r.pctQ12) + ') están en revistas Q1 o Q2 (Q1: ' + num(q.Q1) + '; Q2: ' + num(q.Q2) +
        '; Q3: ' + num(q.Q3) + '; Q4: ' + num(q.Q4) + '). '
      : 'Ningún documento filtrado está en una revista con cuartil SJR. ';
    if (q.sin) p3 += 'Otros ' + num(q.sin) + ' documentos no tienen cuartil (ponencias, capítulos o revistas no clasificadas). ';
    var f0 = r.fuentes[0], empF = r.fuentes.filter(function (f) { return f.n === f0.n; });
    p3 += empF.length === 1
      ? 'La fuente con más documentos es ' + f0.fuente + ' (' + num(f0.n) + ').'
      : 'Varias fuentes comparten el mayor número de documentos (' + num(f0.n) + ' cada una): ' +
        enumerar(empF.slice(0, 4).map(function (f) { return f.fuente; })) + (empF.length > 4 ? ', entre otras.' : '.');
    s.push({ titulo: 'Fuentes de publicación', parrafos: [p3] });

    var p4 = 'El ' + pct(r.pctIntl) + ' de los documentos (' + num(r.intl) + ') incluye al menos un coautor ' +
      'con afiliación fuera de ' + pais(ctx.paisInstitucion) + '. ';
    if (r.paises.length) {
      if (r.paisesPrincipales.length > 1) {
        p4 += 'Varios países empatan como colaboradores más frecuentes, con ' + num(r.paises[0].n) +
          ' documentos cada uno: ' + enumerar(r.paisesPrincipales.map(function (x) { return pais(x.pais); })) + '. ';
      } else {
        p4 += 'Los países colaboradores más frecuentes son ' + enumerar(r.paises.slice(0, 3).map(function (x) {
          return pais(x.pais) + ' (' + num(x.n) + ')';
        })) + '. ';
      }
    }
    p4 += 'Por otra parte, el ' + pct(r.pctOA) + ' de los documentos (' + num(r.oa) +
      ') está marcado como acceso abierto en Scopus.';
    s.push({ titulo: 'Colaboración y acceso abierto', parrafos: [p4] });

    if (r.unidades.length) {
      var maxU = Math.max.apply(null, r.unidades.map(function (u) { return u.n; }));
      var top = r.unidades.filter(function (u) { return u.n === maxU; }).map(function (u) { return u.unidad; });
      var p5 = 'Entre las ' + r.unidades.length + ' unidades ' + (ctx.todasUnidades ? 'incluidas' : 'que firman estos documentos') +
        ', ' + enumerar(top) + (top.length > 1 ? ' reúnen' : ' reúne') + ' el mayor número de documentos (' + num(maxU) + '). ';
      if (!ctx.todasUnidades) p5 += 'Con el filtro de unidad se incluyen también las unidades coautoras de los documentos seleccionados. ';
      p5 += 'Los documentos firmados por más de una unidad cuentan en cada una de ellas, por lo que la suma por unidades (' +
        num(r.sumaUnidades) + ') ' + (r.sumaUnidades > r.n ? 'es mayor que' : 'es igual a') + ' el total (' + num(r.n) + '). ' +
        'Las diferencias de citas e índice h entre unidades reflejan en buena parte los hábitos de citación de cada ' +
        'disciplina y no deben leerse como diferencias de calidad.';
      s.push({ titulo: 'Unidades académicas', parrafos: [p5] });
    }
    return s;
  }

  function notas(ctx) {
    var reg = ctx.registro, sin = 'No disponible: no se cargó el registro';
    var archivos = reg && Array.isArray(reg.archivos)
      ? reg.archivos.map(function (a) { return typeof a === 'string' ? a : a.nombre; }).join(', ') : sin;
    var depuracion = sin;
    if (reg && 'n_bruto' in reg) {
      depuracion = num(reg.n_bruto) + ' registros descargados; ' + num(reg.n_duplicados) +
        ' duplicados eliminados por EID; ' +
        (reg.n_duplicados_probables ? num(reg.n_duplicados_probables) + ' duplicados probables confirmados por una persona; ' : '') +
        num(reg.n_excluidos) + ' excluidos por no corresponder a la institución.';
    }
    var sjr = reg && reg.archivo_sjr
      ? (typeof reg.archivo_sjr === 'string' ? reg.archivo_sjr : reg.archivo_sjr.nombre + ' (SJR ' + reg.archivo_sjr.anio + ')')
      : sin;
    return [
      ['Fuente', 'Scopus (Elsevier)'],
      ['Consulta', reg && reg.consulta_scopus || sin],
      ['Fecha de descarga', reg && reg.fecha_descarga || sin],
      ['Archivos de origen', archivos],
      ['Depuración', depuracion],
      ['Tabla de afiliaciones', reg && reg.version_tabla_afiliaciones || sin],
      ['Cuartiles', reg ? sjr + '. ' + (reg.regla_cuartil || '') : sin],
      ['Conteo por unidad', reg && reg.regla_conteo_unidades ||
        'Conteo completo: un documento con dos unidades cuenta en ambas; el total institucional lo cuenta una vez.'],
      ['Base cargada', ctx.base],
      ['Filtros aplicados', ctx.filtros],
      ['Índice h', 'Mayor número h de documentos con al menos h citas cada uno, calculado sobre el conjunto filtrado.'],
      ['Trazabilidad', ctx.trazabilidad]
    ];
  }

  var api = { num: num, pct: pct, pais: pais, enumerar: enumerar, resumen: resumen,
    secciones: secciones, notas: notas };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Informe = api;
})(this);
