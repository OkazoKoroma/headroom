// Pruebas de la copia de seguridad y de los cálculos nuevos (horas de más uso, comparación con la semana pasada).
// Se corren con: npm test
const { test } = require('node:test');
const assert = require('node:assert');
const copia = require('../src/copia');
const calculo = require('../src/calculo');

test('copia: lo que se guarda se vuelve a leer igual', () => {
  const datos = {
    intervaloMin: 10, tema: 'claro',
    cuentas: [{ id: 'c1', nombre: '', particion: 'persist:claude', limiteDiario: 20, historial: [{ dia: '2026-10-01', uso: 8, limite: 20 }] }],
  };
  const leida = copia.leer(copia.crear(datos, '0.8.0', new Date('2026-10-03T12:00:00Z')));
  assert.strictEqual(leida.ok, true);
  assert.strictEqual(leida.version, '0.8.0');
  assert.deepStrictEqual(leida.datos, datos);
});

test('copia: un archivo cualquiera no sirve', () => {
  assert.strictEqual(copia.leer('hola').ok, false);
  assert.strictEqual(copia.leer('{"cuentas":[]}').ok, false);
  assert.strictEqual(copia.leer(JSON.stringify({ app: 'headroom-copia', datos: { cuentas: [] } })).ok, false);
});

test('copia: lo desconocido o con otro tipo no pasa, y la sesión de cada cuenta es siempre la suya', () => {
  const texto = JSON.stringify({
    app: 'headroom-copia',
    datos: {
      intervaloMin: 'mucho', raro: 1, tema: 'oscuro',
      cuentas: [
        { id: 'c2', nombre: 'Trabajo', particion: 'otra-cosa', limiteDiario: 'x', umbralAviso: 9, inventado: true },
        { id: 'c2', nombre: 'Repetida' },
        { id: '../x', nombre: 'Mala' },
      ],
    },
  });
  const { ok, datos } = copia.leer(texto);
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(datos, { tema: 'oscuro', cuentas: [{ id: 'c2', nombre: 'Trabajo', particion: 'persist:claude-c2', umbralAviso: 9 }] });
});

const a_las = (hora, dia = '2026-10-06') => new Date(`${dia}T${hora}:00`);

test('horas de más uso: lo que sube entre dos lecturas se reparte entre las horas que pasaron', () => {
  const puntos = [
    { t: a_las('09:00').getTime(), hoy: 0 },
    { t: a_las('09:30').getTime(), hoy: 2 },   // 2 puntos entre las 9:00 y las 9:30
    { t: a_las('12:30').getTime(), hoy: 5 },   // 3 puntos en tres horas: media hora de las 9, las 10, las 11 y media de las 12
  ];
  const horas = calculo.usoPorHora(puntos, a_las('09:00').getTime());
  assert.strictEqual(horas.length, 24);
  assert.deepStrictEqual(horas.slice(9, 13), [2.5, 1, 1, 0.5]);
  assert.strictEqual(Math.round(horas.reduce((a, b) => a + b, 0) * 100) / 100, 5);
});

test('horas de más uso: si la primera lectura ya trae uso (la semana se reinició hoy), se reparte desde ese momento', () => {
  const horas = calculo.usoPorHora([{ t: a_las('10:00').getTime(), hoy: 4 }], a_las('08:00').getTime());
  assert.deepStrictEqual(horas.slice(8, 10), [2, 2]);
  assert.deepStrictEqual(calculo.usoPorHora([], 0), new Array(24).fill(0));
  // Más de 3 horas sin lecturas: no se sabe a qué hora fue ese uso, así que no se anota en ninguna
  const conHueco = calculo.usoPorHora([{ t: a_las('16:00').getTime(), hoy: 8 }, { t: a_las('16:30').getTime(), hoy: 9 }], a_las('00:00').getTime());
  assert.deepStrictEqual(conHueco.filter((v) => v > 0), [1]);
  assert.strictEqual(conHueco[16], 1);
});

test('curva de la semana: un punto por hora, y se lee en línea recta entre dos puntos', () => {
  let curva = calculo.agregarALaCurva([], 0.2, 1);
  curva = calculo.agregarALaCurva(curva, 0.8, 2);   // misma hora: reemplaza
  curva = calculo.agregarALaCurva(curva, 10, 12);
  assert.deepStrictEqual(curva, [[0.8, 2], [10, 12]]);
  assert.strictEqual(calculo.valorDeLaCurva(curva, 0.5), 2);
  assert.strictEqual(Math.round(calculo.valorDeLaCurva(curva, 5.4) * 10) / 10, 7);
  assert.strictEqual(calculo.valorDeLaCurva(curva, 100), 12);
  assert.strictEqual(calculo.valorDeLaCurva([[50, 30]], 10), null); // la curva empezó a guardarse después
});

test('comparar con la semana pasada: con la curva, y si no hay, con el historial por día', () => {
  const inicioSemana = a_las('04:00', '2026-10-05');
  const ahora = a_las('16:00', '2026-10-06'); // 36 horas de empezada
  const curvaPasada = { reinicioMs: inicioSemana.getTime(), puntos: [[0, 0], [24, 10], [48, 30]] };
  assert.deepStrictEqual(
    calculo.compararConSemanaPasada({ semana: 32, inicioSemana, ahora, curvaPasada, historial: [] }),
    { diferencia: 12, antes: 20, aproximado: false },
  );
  // Sin curva: lo usado la semana pasada del lunes 28 a las 04:00 al martes 29 a las 16:00
  const historial = [{ dia: '2026-09-28', uso: 12 }, { dia: '2026-09-29', uso: 9 }];
  const r = calculo.compararConSemanaPasada({ semana: 10, inicioSemana, ahora, curvaPasada: null, historial });
  assert.strictEqual(r.aproximado, true);
  assert.strictEqual(r.antes, 16); // 20 de 24 horas del lunes (10) + 16 de 24 del martes (6)
  assert.strictEqual(r.diferencia, -6);
  // Sin datos de la semana pasada no hay comparación
  assert.strictEqual(calculo.compararConSemanaPasada({ semana: 10, inicioSemana, ahora, curvaPasada: null, historial: [] }), null);
});

test('Claude abierto: se reconoce claude.exe en la lista de programas de Windows', () => {
  const { hayClaudeEn } = require('../src/claude-abierto');
  assert.strictEqual(hayClaudeEn('"Claude.exe","1234","Console","1","250.000 KB"\r\n'), true);
  assert.strictEqual(hayClaudeEn('\r\n"claude.exe","99","Console","1","10 KB"'), true);
  assert.strictEqual(hayClaudeEn('INFORMACIÓN: no hay tareas ejecutándose que coincidan con los criterios especificados.'), false);
  assert.strictEqual(hayClaudeEn('"notclaude.exe","1","Console","1","10 KB"'), false);
});

test('comparar con una curva anterior: ayer a esta hora, la sesión anterior', () => {
  let curva = [];
  for (const [h, v] of [[9, 0], [9.1, 1], [9.3, 2], [12, 8]]) curva = calculo.agregarALaCurva(curva, h, v, 0.25);
  assert.deepStrictEqual(curva, [[9.1, 1], [9.3, 2], [12, 8]]); // un punto por cada 15 minutos
  assert.deepStrictEqual(calculo.compararConCurva(9, curva, 12), { diferencia: 1, antes: 8, aproximado: false });
  assert.strictEqual(calculo.compararConCurva(9, curva, 3), null); // ayer a esa hora todavía no había lecturas
  assert.strictEqual(calculo.compararConCurva(9, [], 12), null);
});

test('límite por modelo (Fable): se compara con su semana anterior a esta misma altura', () => {
  const HORA = 60 * 60 * 1000;
  const reinicio1 = new Date('2026-10-08T10:00:00').getTime();
  const inicio1 = reinicio1 - 7 * 24 * HORA;
  let guardado;
  let comparacion;
  // Primera semana: no hay con qué comparar
  for (const [horas, porcentaje] of [[24, 10], [48, 20], [72, 40]]) {
    ({ guardado, comparacion } = calculo.seguirCurvaDeModelo(guardado, { porcentaje, reinicioMs: reinicio1, ahoraMs: inicio1 + horas * HORA }));
    assert.strictEqual(comparacion, null);
  }
  // Semana siguiente: a las 48 horas la pasada iba en 20
  const reinicio2 = reinicio1 + 7 * 24 * HORA;
  ({ guardado, comparacion } = calculo.seguirCurvaDeModelo(guardado, { porcentaje: 26, reinicioMs: reinicio2, ahoraMs: reinicio1 + 48 * HORA }));
  assert.deepStrictEqual(comparacion, { diferencia: 6, antes: 20, aproximado: false });
  assert.deepStrictEqual(guardado.puntos, [[48, 26]]);
  assert.strictEqual(guardado.pasada.reinicioMs, reinicio1);
  // Si la curva de la semana pasada empezó a guardarse tarde, se estima con lo que el modelo usó cada día (aproximado)
  const tarde = { reinicioMs: reinicio2, puntos: [], pasada: { reinicioMs: reinicio1, puntos: [[120, 50], [168, 70]] } };
  const dias = [];
  for (let n = 0; n < 7; n++) { const d = new Date(inicio1 + n * 24 * HORA); dias.push({ dia: d.toISOString().slice(0, 10), uso: 1, modelos: { Fable: 10 } }); }
  ({ comparacion } = calculo.seguirCurvaDeModelo(tarde, { porcentaje: 30, reinicioMs: reinicio2, ahoraMs: reinicio1 + 48 * HORA, historial: dias, nombre: 'Fable' }));
  assert.strictEqual(comparacion.aproximado, true);
  assert.ok(Math.abs(comparacion.antes - 20) <= 5, 'unos 20 (dos días de 10): ' + comparacion.antes); // dos días de la semana anterior
  // Si se saltó una semana entera, la curva guardada ya no es la anterior: no se compara
  const reinicio4 = reinicio2 + 14 * 24 * HORA;
  ({ comparacion } = calculo.seguirCurvaDeModelo(guardado, { porcentaje: 5, reinicioMs: reinicio4, ahoraMs: reinicio4 - 6 * 24 * HORA }));
  assert.strictEqual(comparacion, null);
});

test('aviso de ritmo semanal: una vez por semana, si llegarías al 100% bastante antes del reinicio', () => {
  const inicioSemana = new Date('2026-10-05T04:00:00');
  const reinicio = new Date('2026-10-12T04:00:00');
  const base = { reinicio, umbral: 85, avisoRitmo: true, inicioSemana };
  // 50% a los dos días: a ese ritmo, 100% a los cuatro días (tres antes del reinicio)
  let r = calculo.procesarSemana({ ...base, estado: null, semana: 50, ahora: new Date('2026-10-07T04:00:00') });
  assert.deepStrictEqual(r.alertas, ['semana-ritmo']);
  assert.strictEqual(new Date(r.estado.llegadaMs).toISOString(), new Date('2026-10-09T04:00:00').toISOString());
  r = calculo.procesarSemana({ ...base, estado: r.estado, semana: 55, ahora: new Date('2026-10-07T10:00:00') });
  assert.deepStrictEqual(r.alertas, []); // ya se avisó esta semana
  // Ritmo tranquilo, el primer día o con poco uso: no se avisa
  assert.deepStrictEqual(calculo.procesarSemana({ ...base, estado: null, semana: 30, ahora: new Date('2026-10-09T04:00:00') }).alertas, []);
  assert.deepStrictEqual(calculo.procesarSemana({ ...base, estado: null, semana: 40, ahora: new Date('2026-10-05T14:00:00') }).alertas, []);
  assert.deepStrictEqual(calculo.procesarSemana({ ...base, estado: null, semana: 20, ahora: new Date('2026-10-06T04:00:00') }).alertas, []);
  // Con la opción apagada, tampoco
  assert.deepStrictEqual(calculo.procesarSemana({ ...base, avisoRitmo: false, estado: null, semana: 50, ahora: new Date('2026-10-07T04:00:00') }).alertas, []);
});

test('estadísticas: récords, racha, días de la semana, lo que sobra, límite sugerido y sesiones', () => {
  const estadisticas = require('../src/estadisticas');
  const ahora = new Date('2026-10-11T15:00:00'); // domingo
  const horas = (hora, valor) => Array.from({ length: 24 }, (_, h) => (h === hora ? valor : 0));
  const historial = [
    { dia: '2026-10-05', uso: 10, limite: 14, horas: horas(10, 10) },  // lunes
    { dia: '2026-10-06', uso: 16, limite: 14, horas: horas(16, 16) },  // martes: sobre el límite
    { dia: '2026-10-07', uso: 8, limite: 14 },
    { dia: '2026-10-08', uso: 0, limite: 14 },
    { dia: '2026-10-09', uso: 12, limite: 14 },
    { dia: '2026-10-10', uso: 0.2, limite: 14 },
    { dia: '2026-10-11', uso: 6, limite: 14 },                         // hoy
  ];
  const sesiones = [
    { inicioMs: new Date('2026-10-09T10:00:00').getTime(), finMs: new Date('2026-10-09T15:00:00').getTime(), maximo: 100, llenaMs: new Date('2026-10-09T13:20:00').getTime() },
    { inicioMs: new Date('2026-10-10T10:00:00').getTime(), finMs: new Date('2026-10-10T15:00:00').getTime(), maximo: 40, llenaMs: null },
    { inicioMs: new Date('2026-09-01T10:00:00').getTime(), finMs: new Date('2026-09-01T15:00:00').getTime(), maximo: 100, llenaMs: new Date('2026-09-01T13:50:00').getTime() },
  ];
  const r = estadisticas.calcular({ historial, semanasPasadas: [{ inicio: '2026-09-21', semana: 80 }, { inicio: '2026-09-28', semana: 60 }], sesiones, limiteDiario: 14, ahora });
  assert.deepStrictEqual(r.masAlto, { dia: '2026-10-06', uso: 16 });
  assert.strictEqual(r.sobreElLimite, 1);
  assert.strictEqual(r.racha, 5);                       // del miércoles a hoy
  assert.deepStrictEqual(r.porDiaSemana, [10, 16, 8, 0, 12, 0.2, 6]);
  assert.strictEqual(r.mapa[0][10], 10);                // lunes a las 10
  assert.strictEqual(r.mapa[2][10], null);              // el miércoles no guardó su uso por hora
  assert.deepStrictEqual(r.semanas, { cantidad: 2, termina: 70, sobra: 30 });
  assert.deepStrictEqual(r.sugerido, { limite: 19, diasPorSemana: 5 }); // 5 de 7 días con uso: 95 / 5
  assert.deepStrictEqual(r.sesiones, { total7: 2, agotadas7: 1, horaTipica: 13 });
  assert.strictEqual(r.porMes.length, 1);
  assert.strictEqual(r.porMes[0].dias, 5);
});

test('estadísticas: sin datos no falla (todo queda vacío)', () => {
  const r = require('../src/estadisticas').calcular({ ahora: new Date('2026-10-11T15:00:00') });
  assert.strictEqual(r.masAlto, null);
  assert.strictEqual(r.mapa, null);
  assert.strictEqual(r.semanas, null);
  assert.strictEqual(r.sugerido, null);
  assert.strictEqual(r.sesiones, null);
  assert.strictEqual(r.racha, 0);
});
