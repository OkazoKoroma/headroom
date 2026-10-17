// estadisticas.js: saca conclusiones de lo que la app ya tiene guardado (sin consultar nada a claude.ai):
// récords y rachas, qué días y a qué horas se usa más, cuánto sobra cada semana, un límite diario sugerido,
// las sesiones de 5 horas agotadas y un resumen mes a mes.
//
// Este archivo no usa Electron ni lee archivos: recibe datos y devuelve resultados (así se puede probar).

const { ultimosDias, diaLocal } = require('./calculo');

const redondear = (valor) => Math.round(valor * 10) / 10;
const promedio = (lista) => (lista.length ? lista.reduce((suma, v) => suma + v, 0) / lista.length : null);
// Día de la semana de "2026-10-05": 0 = lunes ... 6 = domingo.
const diaDeSemana = (dia) => (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7;

// Recibe:
//   historial      → [{ dia, uso, limite, horas }] todo lo guardado (hasta unos 400 días)
//   semanasPasadas → [{ inicio, semana }] las semanas terminadas
//   sesiones       → [{ inicioMs, finMs, maximo, llenaMs }] las sesiones de 5 horas terminadas
//   limiteDiario   → el límite de Ajustes (para los días que no guardaron el suyo)
//   ahora          → fecha de ahora
// Devuelve un objeto con todo calculado (cada cosa es null si todavía no hay datos para decirla).
function calcular({ historial = [], semanasPasadas = [], sesiones = [], limiteDiario = 14, ahora = new Date() }) {
  const porDia = new Map(historial.filter((d) => d && Number.isFinite(d.uso)).map((d) => [d.dia, d]));
  const limiteDe = (registro) => (Number.isFinite(registro.limite) ? registro.limite : limiteDiario);
  const dias30 = ultimosDias(ahora, 30).map((dia) => porDia.get(dia)).filter(Boolean);

  // --- Récords y rachas (últimos 30 días)
  const masAlto = dias30.reduce((mayor, d) => (!mayor || d.uso > mayor.uso ? d : mayor), null);
  const sobreElLimite = dias30.filter((d) => d.uso >= limiteDe(d)).length;
  // Racha: días seguidos (de hoy hacia atrás) bajo el límite. Un día sin registro no corta la racha ni la suma.
  let racha = 0;
  for (const dia of ultimosDias(ahora, 400).reverse()) {
    const registro = porDia.get(dia);
    if (!registro) continue;
    if (registro.uso >= limiteDe(registro)) break;
    racha += 1;
  }

  // --- Qué días de la semana se usa más (promedio de cada uno, en los últimos 30 días)
  const porDiaSemana = [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const valor = promedio(dias30.filter((d) => diaDeSemana(d.dia) === n).map((d) => d.uso));
    return valor === null ? null : redondear(valor);
  });

  // --- Mapa de la semana: día × hora (promedio de cada casilla, con los días que guardaron su uso por hora)
  const conHoras = dias30.filter((d) => Array.isArray(d.horas) && d.horas.length === 24);
  const mapa = conHoras.length === 0 ? null : [0, 1, 2, 3, 4, 5, 6].map((n) => {
    const delDia = conHoras.filter((d) => diaDeSemana(d.dia) === n);
    return Array.from({ length: 24 }, (_, hora) => (delDia.length ? Math.round(promedio(delDia.map((d) => Number(d.horas[hora]) || 0)) * 100) / 100 : null));
  });

  // --- Cuánto sobra cada semana (con las semanas terminadas)
  const finales = semanasPasadas.map((s) => s && s.semana).filter(Number.isFinite);
  const semanas = finales.length === 0 ? null : {
    cantidad: finales.length,
    termina: redondear(promedio(finales)),
    sobra: redondear(promedio(finales.map((v) => Math.max(0, 100 - v)))),
  };

  // --- Límite diario sugerido: repartir el 95% de la semana entre los días que de verdad se usa Claude.
  // (con al menos 7 días guardados; "días de uso" = los que pasaron de medio punto)
  let sugerido = null;
  if (dias30.length >= 7) {
    const deUso = dias30.filter((d) => d.uso >= 0.5).length;
    const porSemana = Math.max(1, Math.min(7, Math.round((deUso / dias30.length) * 7)));
    sugerido = { limite: Math.max(5, Math.min(50, Math.round((95 / porSemana) * 2) / 2)), diasPorSemana: porSemana };
  }

  // --- Sesiones de 5 horas: cuántas se agotaron en los últimos 7 días, y a qué hora suele pasar
  const hace7 = ahora.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recientes = sesiones.filter((s) => s && s.finMs >= hace7);
  const agotadas = sesiones.filter((s) => s && Number.isFinite(s.llenaMs));
  let horaTipica = null;
  if (agotadas.length) {
    const cuenta = new Array(24).fill(0);
    for (const s of agotadas) cuenta[new Date(s.llenaMs).getHours()] += 1;
    horaTipica = cuenta.indexOf(Math.max(...cuenta));
  }
  const resumenDeSesiones = sesiones.length === 0 ? null : {
    total7: recientes.length,
    agotadas7: recientes.filter((s) => Number.isFinite(s.llenaMs)).length,
    horaTipica,
  };

  // --- Mes a mes (con todo el historial)
  const meses = new Map();
  for (const d of porDia.values()) {
    const mes = d.dia.slice(0, 7);
    if (!meses.has(mes)) meses.set(mes, []);
    meses.get(mes).push(d);
  }
  const porMes = [...meses.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([mes, lista]) => ({
    mes,
    dias: lista.filter((d) => d.uso >= 0.5).length,
    total: redondear(lista.reduce((suma, d) => suma + d.uso, 0)),
    promedio: redondear(promedio(lista.map((d) => d.uso))),
    masAlto: redondear(Math.max(...lista.map((d) => d.uso))),
  }));

  return {
    dias: dias30.length,
    masAlto: masAlto && { dia: masAlto.dia, uso: redondear(masAlto.uso) },
    promedio: dias30.length ? redondear(promedio(dias30.map((d) => d.uso))) : null,
    racha,
    sobreElLimite,
    porDiaSemana,
    mapa,
    semanas,
    sugerido,
    sesiones: resumenDeSesiones,
    porMes,
    ultimos: dias30.map((d) => ({ dia: d.dia, uso: redondear(d.uso), limite: limiteDe(d) })),
  };
}

// ----- El Panel: lo que responde a "¿cómo voy ahora?", "¿cómo va la semana?", "¿cuándo y cómo uso Claude?" y "¿cómo voy en el año?" -----
// Todo sale de lo guardado por cuenta. Cada cosa es null (o vacía) mientras no haya datos para decirla.
const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const horaTexto = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// ¿Cómo voy ahora? Con las lecturas de hoy: el ritmo de la última hora, cuánto queda para el límite y a qué hora llegarías,
// las sesiones de hoy y la hora de arranque (de hoy, y la habitual según el historial).
function ahoraMismo({ lecturasDeHoy, hoy, limite, sesiones = [], sesion5h = null, historial = [], ahora = new Date() }) {
  const puntos = (lecturasDeHoy && lecturasDeHoy.puntos ? lecturasDeHoy.puntos : []).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.hoy));
  const ultimo = puntos[puntos.length - 1] || null;
  // Ritmo de la última hora: lo que subió "hoy" entre la lectura de hace una hora (o la más cercana) y la última
  let ritmo = null;
  if (ultimo) {
    const haceUnaHora = ultimo.t - HORA_MS;
    const antes = [...puntos].reverse().find((p) => p.t <= haceUnaHora) || puntos[0];
    const horas = (ultimo.t - antes.t) / HORA_MS;
    if (horas >= 1 / 3) ritmo = redondear(Math.max(0, ultimo.hoy - antes.hoy) / horas);
  }
  // Ritmo medio de hoy: lo usado desde la primera lectura con uso
  let ritmoMedio = null;
  const primeroConUso = puntos.find((p) => p.hoy > 0);
  if (primeroConUso && ultimo) {
    const horas = (ultimo.t - primeroConUso.t) / HORA_MS;
    if (horas >= 0.5) ritmoMedio = redondear(ultimo.hoy / horas);
  }
  const quedaHoy = Number.isFinite(hoy) && Number.isFinite(limite) ? Math.max(0, redondear(limite - hoy)) : null;
  const horasParaLimite = quedaHoy !== null && ritmo > 0 ? redondear(quedaHoy / ritmo) : null;
  // Sesiones de hoy: las terminadas hoy más la que está en curso
  const inicioDelDia = new Date(ahora); inicioDelDia.setHours(0, 0, 0, 0);
  const deHoy = sesiones.filter((se) => se && se.finMs >= inicioDelDia.getTime() && se.inicioMs <= ahora.getTime());
  const sesionesHoy = { total: deHoy.length + (sesion5h ? 1 : 0), agotadas: deHoy.filter((se) => Number.isFinite(se.llenaMs)).length + (sesion5h && sesion5h.porcentaje >= 100 ? 1 : 0) };
  // Arranque: la primera lectura de hoy con uso; la habitual, la primera hora con uso de cada día del historial (promedio)
  const arranqueHoy = primeroConUso ? horaTexto(primeroConUso.t) : null;
  const primerasHoras = historial.filter((d) => Array.isArray(d.horas)).map((d) => d.horas.findIndex((v) => v > 0)).filter((h) => h >= 0);
  const arranqueHabitual = primerasHoras.length >= 3 ? `${String(Math.round(promedio(primerasHoras))).padStart(2, '0')}:00` : null;
  return { ritmo, ritmoMedio, quedaHoy, horasParaLimite, sesionesHoy, arranqueHoy, arranqueHabitual };
}

// ¿Cómo va la semana? La curva de esta semana contra la de la pasada (en horas desde que empezó), lo mismo para cada
// modelo (Fable...), y qué producto crece o baja respecto de la semana pasada (por su parte del total).
function semanaContraPasada({ semanaEnCurso, curvaSemanaPasada, curvasDeModelos, semanasPasadas = [] }) {
  const reinicioMs = semanaEnCurso ? semanaEnCurso.reinicioMs : null;
  const esLaAnterior = (pasada) => pasada && Number.isFinite(reinicioMs) && Math.abs(pasada.reinicioMs - (reinicioMs - 7 * DIA_MS)) < 12 * HORA_MS;
  const curvaEsta = semanaEnCurso && Array.isArray(semanaEnCurso.curva) ? semanaEnCurso.curva : [];
  const curvaPasada = esLaAnterior(curvaSemanaPasada) ? curvaSemanaPasada.puntos : null;
  const modelos = {};
  for (const [nombre, curva] of Object.entries(curvasDeModelos || {})) {
    const sirve = curva.pasada && Math.abs(curva.pasada.reinicioMs - (curva.reinicioMs - 7 * DIA_MS)) < 12 * HORA_MS;
    modelos[nombre] = { curvaEsta: curva.puntos || [], curvaPasada: sirve ? curva.pasada.puntos : null };
  }
  // Productos: la parte de cada uno en el total de la semana, contra la parte que tuvo la semana pasada
  const actual = semanaEnCurso && semanaEnCurso.productos ? semanaEnCurso.productos : {};
  const anterior = semanasPasadas.length ? semanasPasadas[semanasPasadas.length - 1].productos || {} : {};
  const parte = (productos, clave) => { const total = Object.values(productos).reduce((a, b) => a + (b || 0), 0); return total > 0 ? ((productos[clave] || 0) / total) * 100 : null; };
  const productos = Object.keys(actual).map((clave) => {
    const ahora = parte(actual, clave);
    const antes = parte(anterior, clave);
    const cambio = ahora !== null && antes !== null && antes > 0 ? Math.round(((ahora - antes) / antes) * 100) : null;
    return { clave, valor: actual[clave] || 0, parte: ahora === null ? null : redondear(ahora), cambio };
  }).sort((a, b) => b.valor - a.valor);
  return { curvaEsta, curvaPasada, modelos, productos };
}

// ¿Cuándo y cómo uso Claude? El reparto mañana / tarde / noche, los días sin uso del mes y la mejor racha bajo el límite.
function habitos({ historial = [], limiteDiario = 14, ahora = new Date() }) {
  const limiteDe = (d) => (Number.isFinite(d.limite) ? d.limite : limiteDiario);
  const porDia = new Map(historial.filter((d) => d && Number.isFinite(d.uso)).map((d) => [d.dia, d]));
  const dias30 = ultimosDias(ahora, 30);
  const conHoras = dias30.map((dia) => porDia.get(dia)).filter((d) => d && Array.isArray(d.horas) && d.horas.length === 24);
  let diaTipo = null;
  if (conHoras.length) {
    const suma = [0, 0, 0]; // mañana (6–12), tarde (12–19), noche (19–6)
    for (const d of conHoras) d.horas.forEach((v, h) => { suma[h >= 6 && h < 12 ? 0 : h >= 12 && h < 19 ? 1 : 2] += Number(v) || 0; });
    const total = suma[0] + suma[1] + suma[2];
    if (total > 0) diaTipo = { manana: Math.round((suma[0] / total) * 100), tarde: Math.round((suma[1] / total) * 100), noche: Math.round((suma[2] / total) * 100) };
  }
  const diasSinUso = dias30.filter((dia) => { const d = porDia.get(dia); return !d || d.uso < 0.5; }).length;
  // Mejor racha: la tira más larga de días seguidos (de los guardados) bajo el límite
  let mejorRacha = 0;
  let racha = 0;
  for (const dia of [...porDia.keys()].sort()) {
    const d = porDia.get(dia);
    if (d.uso >= limiteDe(d)) racha = 0;
    else { racha += 1; mejorRacha = Math.max(mejorRacha, racha); }
  }
  return { diaTipo, diasSinUso, mejorRacha };
}

// ¿Cómo voy en el año? Las últimas semanas (cómo terminó cada una, y lo que lleva la actual), lo mismo para cada modelo,
// las sesiones agotadas por semana, y los récords.
function anio({ semanasPasadas = [], semanaEnCurso = null, inicioSemanaMs = null, sesiones = [], cuantas = 12 }) {
  const terminadas = semanasPasadas.filter((se) => se && Number.isFinite(se.semana));
  const lista = terminadas.slice(-(cuantas - 1)).map((se) => ({ inicio: se.inicio, semana: redondear(se.semana), modelos: se.modelos || null, enCurso: false }));
  if (semanaEnCurso && Number.isFinite(inicioSemanaMs)) {
    lista.push({ inicio: diaLocal(new Date(inicioSemanaMs)), semana: redondear(semanaEnCurso.semana), modelos: semanaEnCurso.modelos || null, enCurso: true });
  }
  // Sesiones por semana: las que terminaron dentro de cada semana (desde su inicio, 7 días)
  const sesionesPorSemana = lista.map((se) => {
    const desde = new Date(`${se.inicio}T00:00:00`).getTime();
    const dentro = sesiones.filter((x) => x && x.finMs >= desde && x.finMs < desde + 7 * DIA_MS);
    return { inicio: se.inicio, total: dentro.length, agotadas: dentro.filter((x) => Number.isFinite(x.llenaMs)).length };
  });
  const nombresDeModelos = [...new Set(lista.flatMap((se) => Object.keys(se.modelos || {})))];
  const modelos = Object.fromEntries(nombresDeModelos.map((nombre) => [nombre, lista.map((se) => (se.modelos && Number.isFinite(se.modelos[nombre]) ? redondear(se.modelos[nombre]) : null))]));
  const mayor = (xs) => xs.reduce((m, x) => (!m || x.semana > m.semana ? x : m), null);
  const menor = (xs) => xs.reduce((m, x) => (!m || x.semana < m.semana ? x : m), null);
  const records = terminadas.length ? {
    semanaMax: (({ inicio, semana }) => ({ inicio, valor: redondear(semana) }))(mayor(terminadas)),
    semanaMin: (({ inicio, semana }) => ({ inicio, valor: redondear(semana) }))(menor(terminadas)),
    pctAgotadas: Math.round((terminadas.filter((se) => se.semana >= 100).length / terminadas.length) * 100),
    modelos: Object.fromEntries(nombresDeModelos.map((nombre) => {
      const con = terminadas.filter((se) => se.modelos && Number.isFinite(se.modelos[nombre]));
      const top = con.reduce((m, se) => (!m || se.modelos[nombre] > m.modelos[nombre] ? se : m), null);
      return [nombre, top ? { inicio: top.inicio, valor: redondear(top.modelos[nombre]) } : null];
    })),
  } : null;
  return { semanas: lista, sesionesPorSemana, modelos, records, promedio: terminadas.length ? redondear(promedio(terminadas.map((se) => se.semana))) : null };
}

module.exports = { calcular, ahoraMismo, semanaContraPasada, habitos, anio };
