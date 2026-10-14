/* Gráficos en SVG hechos a mano: cero dependencias y cero CDN.
 * Todo texto se inserta con textContent (los nombres de fuentes vienen del CSV).
 */
(function (raiz) {
  'use strict';
  var SVG = 'http://www.w3.org/2000/svg';

  function el(nombre, attrs, texto) {
    var e = document.createElementNS(SVG, nombre);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (texto != null) e.textContent = texto;
    return e;
  }

  function h(etiqueta, clase, texto) {
    var e = document.createElement(etiqueta);
    if (clase) e.className = clase;
    if (texto != null) e.textContent = texto;
    return e;
  }

  function pasoBonito(max) {
    if (max <= 0) return 1;
    var bruto = max / 4, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var n = bruto / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  /* Barras verticales: datos = [{etiqueta, valor}] */
  function barrasVerticales(contenedor, datos, opciones) {
    opciones = opciones || {};
    var fmt = opciones.formato || String;
    var W = 640, H = 230, m = { a: 18, d: 8, i: 48, b: 28 };
    var max = Math.max.apply(null, datos.map(function (d) { return d.valor; }).concat([0]));
    var paso = pasoBonito(max), tope = Math.max(paso, Math.ceil(max / paso) * paso);
    var ancho = (W - m.i - m.d) / Math.max(datos.length, 1);
    var y = function (v) { return H - m.b - (H - m.a - m.b) * v / tope; };

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', class: 'svg-barras',
      'aria-label': opciones.titulo || '' });
    for (var t = 0; t <= tope + 1e-9; t += paso) {
      svg.appendChild(el('line', { x1: m.i, x2: W - m.d, y1: y(t), y2: y(t), class: 'rejilla-linea' }));
      svg.appendChild(el('text', { x: m.i - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'eje' }, fmt(t)));
    }
    datos.forEach(function (d, i) {
      var x = m.i + i * ancho, bw = Math.min(ancho * 0.62, 48);
      var cx = x + ancho / 2;
      var barra = el('rect', { x: cx - bw / 2, y: y(d.valor), width: bw,
        height: Math.max(0, H - m.b - y(d.valor)), class: 'barra', rx: 2 });
      barra.appendChild(el('title', {}, d.etiqueta + ': ' + fmt(d.valor)));
      svg.appendChild(barra);
      svg.appendChild(el('text', { x: cx, y: y(d.valor) - 5, 'text-anchor': 'middle', class: 'valor' }, fmt(d.valor)));
      svg.appendChild(el('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'eje' }, d.etiqueta));
    });
    contenedor.replaceChildren(svg);
  }

  /* Barras horizontales como lista: datos = [{etiqueta, valor, detalle, resaltar}] */
  function barrasHorizontales(contenedor, datos, opciones) {
    opciones = opciones || {};
    var max = opciones.max || Math.max.apply(null, datos.map(function (d) { return d.valor; }).concat([1]));
    var lista = h('ul', 'barras-h');
    if (!datos.length) lista.appendChild(h('li', 'sin-datos', opciones.vacio || 'Sin datos con estos filtros.'));
    datos.forEach(function (d) {
      var li = h('li', d.resaltar ? 'resaltar' : '');
      li.appendChild(h('span', 'barras-h-etiqueta', d.etiqueta));
      var pista = el('svg', { class: 'barras-h-pista', viewBox: '0 0 100 10', preserveAspectRatio: 'none',
        'aria-hidden': 'true' });
      pista.appendChild(el('rect', { x: 0, y: 0, height: 10, width: Math.max(0, 100 * d.valor / max),
        class: 'barra', rx: 1 }));
      li.appendChild(pista);
      li.appendChild(h('span', 'barras-h-valor', d.detalle));
      lista.appendChild(li);
    });
    contenedor.replaceChildren(lista);
  }

  /* Tabla accesible: columnas = [{titulo, clave, num}] */
  function tabla(contenedor, columnas, filas, opciones) {
    opciones = opciones || {};
    var t = h('table', 'tabla');
    if (opciones.leyenda) t.appendChild(h('caption', 'oculto-accesible', opciones.leyenda));
    var cab = h('thead'), tr = h('tr');
    columnas.forEach(function (c) {
      var th = h('th', c.num ? 'num' : '', c.titulo); th.scope = 'col'; tr.appendChild(th);
    });
    cab.appendChild(tr); t.appendChild(cab);
    var cuerpo = h('tbody');
    filas.forEach(function (f) {
      var fila = h('tr');
      columnas.forEach(function (c, i) {
        var celda = h(i === 0 ? 'th' : 'td', c.num ? 'num' : (c.clase ? c.clase(f) : ''),
          c.formato ? c.formato(f[c.clave]) : f[c.clave]);
        if (i === 0) celda.scope = 'row';
        fila.appendChild(celda);
      });
      cuerpo.appendChild(fila);
    });
    if (!filas.length) {
      var vacia = h('tr'), td = h('td', 'sin-datos', 'Sin datos con estos filtros.');
      td.colSpan = columnas.length; vacia.appendChild(td); cuerpo.appendChild(vacia);
    }
    t.appendChild(cuerpo);
    contenedor.replaceChildren(t);
  }

  raiz.Graficos = { barrasVerticales: barrasVerticales, barrasHorizontales: barrasHorizontales,
    tabla: tabla, h: h };
})(this);
