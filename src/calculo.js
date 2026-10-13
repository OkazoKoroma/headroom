// calculo.js: la lógica del límite diario y del reinicio semanal.
//
// Idea general: claude.ai solo nos dice cuánto de la cuota SEMANAL llevas usado (ej. 47%).
// Para saber cuánto usaste HOY, restamos lo que ya llevabas al empezar el día:
//
//     Hoy = porcentaje semanal actual − punto de partida del día
//
// Este archivo no usa Electron ni lee archivos: recibe datos y devuelve resultados.
// Así se puede probar fácilmente con casos inventados.

// Los días y las horas son los de la zona horaria de tu computador (en Chile, America/Santiago).
const ZONA_HORARIA = Intl.DateTimeFormat().resolvedOptions().timeZone;
const DIAS_DE_HISTORIAL = 400; // un poco más de un año (para ver tendencias mes a mes); los gráficos usan los últimos 30

// Devuelve el día en hora de Chile como texto "2026-10-02".
// El día va de 00:00 a 23:59 hora de Chile.
function diaLocal(fecha) {
  return fecha.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });
}

// Procesa una lectura nueva del uso semanal.
//
// Recibe:
//   estado      → lo que se guardó la vez anterior (o null la primera vez), con esta forma:
//                 { dia, puntoPartida, ultimaLectura, acumuladoPrevio, avisoEnviado, limiteEnviado }
//   historial   → lista de { dia, uso } de días anteriores
//   semana      → % semanal que acabamos de leer (ej. 47)
//   ahora       → fecha y hora de esta lectura
//   limite      → límite diario en % (ej. 14)
//   umbralAviso → aviso previo en % (ej. 10)
//   inicioSemana→ cuándo empezó la cuota semanal actual (fecha), si se sabe. Si empezó hoy,
//                 todo lo usado desde entonces es de hoy y el punto de partida es 0.
//
// Devuelve:
//   estado      → el estado nuevo, para guardarlo
//   historial   → el historial nuevo (máximo 30 días), para guardarlo
//   hoy         → % usado hoy
//   alertas     → qué notificaciones hay que enviar ahora: [], ['aviso'] o ['limite']
function procesarLectura({ estado, historial, semana, ahora, limite, umbralAviso, inicioSemana }) {
  const dia = diaLocal(ahora);
  let nuevo;

  if (!estado || estado.dia !== dia) {
    // ----- Primera lectura del día: este valor es el "punto de partida" -----
    // Caso especial: si la cuota semanal se reinició durante la noche (el % es menor que la
    // última lectura de ayer), lo consumido desde el reinicio hasta ahora cuenta como uso de hoy,
    // así que el punto de partida es 0 y no el valor leído.
    const huboReinicio = Boolean(estado) && semana < estado.ultimaLectura;
    nuevo = {
      dia,
      puntoPartida: huboReinicio ? 0 : semana,
      ultimaLectura: semana,
      acumuladoPrevio: 0,
      avisoEnviado: false,
      limiteEnviado: false,
      // Desde cuándo se está midiendo el uso de hoy (sirve para calcular el ritmo y proyectar).
      inicioMs: ahora.getTime(),
    };
  } else {
    nuevo = { ...estado };
    // Estados guardados antes de que existiera este dato: se parte desde la lectura actual.
    if (typeof nuevo.inicioMs !== 'number') nuevo.inicioMs = ahora.getTime();

    // ----- Reinicio de la cuota semanal durante el día -----
    // Si el % bajó respecto a la lectura anterior, la cuota se reinició.
    // Guardamos lo consumido antes del reinicio y el nuevo punto de partida pasa a ser 0.
    if (semana < estado.ultimaLectura) {
      nuevo.acumuladoPrevio = estado.acumuladoPrevio + (estado.ultimaLectura - estado.puntoPartida);
      nuevo.puntoPartida = 0;
    }
    nuevo.ultimaLectura = semana;
  }

  // Si la cuota semanal empezó HOY (por ejemplo, se reinició esta madrugada), partió desde 0%:
  // todo lo que lleva usado es de hoy, aunque la primera lectura del widget haya llegado más tarde.
  if (inicioSemana && diaLocal(inicioSemana) === dia) {
    nuevo.puntoPartida = 0;
    nuevo.inicioMs = inicioSemana.getTime(); // y se mide desde ese momento
  }

  // Uso de hoy (nunca negativo, por si acaso).
  const hoy = Math.max(0, nuevo.acumuladoPrevio + semana - nuevo.puntoPartida);

  // ----- Alertas: una sola vez por día cada una -----
  const alertas = [];
  if (hoy >= limite) {
    if (!nuevo.limiteEnviado) alertas.push('limite');
    // Si se pasa directo al límite, no tiene sentido avisar después del "aviso previo".
    nuevo.limiteEnviado = true;
    nuevo.avisoEnviado = true;
  } else if (hoy >= umbralAviso) {
    if (!nuevo.avisoEnviado) alertas.push('aviso');
    nuevo.avisoEnviado = true;
  }

  // ----- Historial: el uso de cada día (hasta DIAS_DE_HISTORIAL días) -----
  const otrosDias = (historial || []).filter((entrada) => entrada.dia !== dia);
  // Se guarda también el límite de ese día, para que el historial siga siendo correcto aunque cambies el límite después.
  // (se conserva lo demás que ya tenía ese día, como el detalle por producto)
  const deHoy = (historial || []).find((entrada) => entrada.dia === dia) || {};
  const nuevoHistorial = [...otrosDias, { ...deHoy, dia, uso: hoy, limite }]
    .sort((a, b) => (a.dia < b.dia ? -1 : 1))
    .slice(-DIAS_DE_HISTORIAL);

  return { estado: nuevo, historial: nuevoHistorial, hoy, alertas };
}

// Número del día de la semana en hora de Chile: 0 = lunes, 1 = martes ... 6 = domingo.
function diaDeLaSemana(fecha) {
  const nombre = fecha.toLocaleDateString('en-US', { weekday: 'short', timeZone: ZONA_HORARIA });
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(nombre);
}

// Límite diario y aviso previo que valen para el día de "ahora".
//   limiteBase   → el límite diario general de Ajustes (ej. 14)
//   umbralBase   → el aviso previo general (ej. 10)
//   limitesPorDia→ null (mismo límite todos los días) o una lista de 7 números [lun ... dom]
// Si ese día tiene un límite distinto, el aviso previo se ajusta en la misma proporción
// (ej. base 14 y aviso 10: un día con límite 20 avisa a los 14,3).
function limitesDelDia({ limiteBase, umbralBase, limitesPorDia, ahora }) {
  let limite = limiteBase;
  if (Array.isArray(limitesPorDia) && limitesPorDia.length === 7) {
    const delDia = limitesPorDia[diaDeLaSemana(ahora)];
    if (Number.isFinite(delDia) && delDia > 0) limite = delDia;
  }
  let umbral = limiteBase > 0 ? (umbralBase * limite) / limiteBase : umbralBase;
  umbral = Math.min(umbral, limite * 0.95); // el aviso siempre es menor que el límite
  return { limite, umbral: Math.round(umbral * 10) / 10 };
}

// ----- Límite diario automático -----
// Reparte lo que quedaba de la cuota semanal al empezar el día entre los días que faltan para el reinicio (contando hoy).
// Así, si ayer usaste poco, hoy te toca más, y al revés. No cambia durante el día.
//   semanaAlEmpezar → % de la cuota semanal usado cuando empezó el día (0 si la semana empezó hoy)
//   reinicio        → fecha del reinicio semanal
// Devuelve el límite de hoy en % (con un decimal; como mínimo 1).
const DIA_MS = 24 * 60 * 60 * 1000;
function limiteAutomatico({ semanaAlEmpezar, reinicio, ahora }) {
  const inicioDelDia = new Date(ahora);
  inicioDelDia.setHours(0, 0, 0, 0);
  // Días que faltan, contando hoy (un pedacito de día al final, como "el viernes hasta las 04:00", casi no cuenta).
  const dias = Math.max(1, Math.round((reinicio.getTime() - inicioDelDia.getTime()) / DIA_MS));
  const queda = Math.max(0, 100 - semanaAlEmpezar);
  return Math.max(1, Math.round((queda / dias) * 10) / 10);
}

// El % de la cuota semanal con que empezó el día, según el estado guardado del día (o la lectura de ahora, si es la primera).
function semanaAlEmpezarElDia({ estado, semana, inicioSemana, ahora }) {
  const dia = diaLocal(ahora);
  if (inicioSemana && diaLocal(inicioSemana) === dia) return 0; // la semana empezó hoy
  if (estado && estado.dia === dia && Number.isFinite(estado.puntoPartida)) return estado.puntoPartida;
  return semana;
}

// Devuelve los últimos "cantidad" días hasta hoy (en hora de Chile), del más antiguo al más reciente.
// Ejemplo: ultimosDias(ahora, 3) → ['2026-10-01', '2026-10-02', '2026-10-03']
// Se usan para el gráfico de los últimos 7 días.
function ultimosDias(ahora, cantidad) {
  const [anio, mes, dia] = diaLocal(ahora).split('-').map(Number);
  const dias = [];
  for (let i = cantidad - 1; i >= 0; i--) {
    // Se resta sobre la fecha (no sobre las horas), así los cambios de horario no la descuadran.
    dias.push(new Date(Date.UTC(anio, mes - 1, dia - i)).toISOString().slice(0, 10));
  }
  return dias;
}

// ----- Proyección: "a este ritmo..." -----
//
// Son ESTIMACIONES: suponen que seguirás usando Claude al mismo ritmo promedio con el que
// lo has usado hasta ahora. Si cambias de ritmo, el resultado cambia.

const HORA_MS = 60 * 60 * 1000;

// Cuántas horas faltan para que termine el día (medianoche de Chile).
function horasHastaFinDelDia(ahora) {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora);
  const valor = (tipo) => Number(partes.find((p) => p.type === tipo).value);
  const segundosDelDia = valor('hour') * 3600 + valor('minute') * 60 + valor('second');
  return (24 * 3600 - segundosDelDia) / 3600;
}

// ¿Llegarás hoy a tu límite diario?
// Devuelve { tipo, ... } con tipo:
//   'ya-llegaste'  → ya llegaste o pasaste el límite
//   'sin-datos'    → lleva muy poco tiempo midiendo (menos de 30 min) para estimar
//   'sin-uso'      → todavía no has usado nada hoy
//   'llegaras'     → a este ritmo llegarás al límite a la hora "cuando" (una fecha), todavía hoy
//   'no-llegaras'  → a este ritmo no llegarás hoy; "finDelDia" es el % con el que terminarías el día
function proyeccionDiaria({ hoy, limite, inicioMs, ahora }) {
  if (hoy >= limite) return { tipo: 'ya-llegaste' };

  const horas = (ahora.getTime() - inicioMs) / HORA_MS;
  if (!Number.isFinite(horas) || horas < 0.5) return { tipo: 'sin-datos' };
  if (hoy <= 0) return { tipo: 'sin-uso' };

  const ritmo = hoy / horas; // % por hora
  const horasParaElLimite = (limite - hoy) / ritmo;
  const horasQueQuedan = horasHastaFinDelDia(ahora);

  if (horasParaElLimite <= horasQueQuedan) {
    return { tipo: 'llegaras', cuando: new Date(ahora.getTime() + horasParaElLimite * HORA_MS) };
  }
  return { tipo: 'no-llegaras', finDelDia: hoy + ritmo * horasQueQuedan };
}

// ¿Llegarás al 100% de la cuota semanal antes de que se reinicie?
// Mismos tipos que arriba, pero 'no-llegaras' trae "finDeSemana" (el % con que terminarías la semana).
function proyeccionSemanal({ semana, inicioSemana, reinicio, ahora }) {
  if (semana >= 100) return { tipo: 'ya-llegaste' };
  if (!inicioSemana || !reinicio) return { tipo: 'sin-datos' };

  const horas = (ahora.getTime() - inicioSemana.getTime()) / HORA_MS;
  const horasHastaElReinicio = (reinicio.getTime() - ahora.getTime()) / HORA_MS;
  if (!Number.isFinite(horas) || horas < 3 || horasHastaElReinicio <= 0) return { tipo: 'sin-datos' };
  if (semana <= 0) return { tipo: 'sin-uso' };

  const ritmo = semana / horas;
  const horasParaCien = (100 - semana) / ritmo;

  if (horasParaCien <= horasHastaElReinicio) {
    return { tipo: 'llegaras', cuando: new Date(ahora.getTime() + horasParaCien * HORA_MS) };
  }
  return { tipo: 'no-llegaras', finDeSemana: semana + ritmo * horasHastaElReinicio };
}

// ¿Agotarás la sesión de 5 horas antes de que se reinicie? Mismos tipos que arriba; 'no-llegaras' trae "finDeSesion"
// (el % con que terminaría la sesión). Se estima con lo usado desde que empezó la sesión (5 horas antes de su reinicio).
function proyeccionDeSesion({ sesion5h, ahora }) {
  if (!sesion5h || !Number.isFinite(sesion5h.porcentaje) || !sesion5h.reinicio) return { tipo: 'sin-datos' };
  if (sesion5h.porcentaje >= 100) return { tipo: 'ya-llegaste' };
  const reinicioMs = sesion5h.reinicio.getTime();
  const horas = (ahora.getTime() - (reinicioMs - 5 * HORA_MS)) / HORA_MS;
  const horasHastaElReinicio = (reinicioMs - ahora.getTime()) / HORA_MS;
  if (!Number.isFinite(horas) || horas < 1 / 3 || horasHastaElReinicio <= 0) return { tipo: 'sin-datos' }; // antes de 20 minutos es muy pronto
  if (sesion5h.porcentaje <= 0) return { tipo: 'sin-uso' };
  const ritmo = sesion5h.porcentaje / horas;
  const horasParaCien = (100 - sesion5h.porcentaje) / ritmo;
  if (horasParaCien <= horasHastaElReinicio) {
    return { tipo: 'llegaras', cuando: new Date(ahora.getTime() + horasParaCien * HORA_MS) };
  }
  return { tipo: 'no-llegaras', finDeSesion: sesion5h.porcentaje + ritmo * horasHastaElReinicio };
}

// ----- Alertas de la sesión de 5 horas -----
//
// Cada "sesión" es una ventana de 5 horas que claude.ai reinicia a una hora fija.
// Se avisa una sola vez por sesión en cada uno de estos casos:
//   'sesion-aviso'      → el uso de la sesión llegó al umbral (ej. 80%)
//   'sesion-limite'     → el uso de la sesión llegó al 100%
//   'sesion-reiniciada' → la sesión terminó y se reinició, habiendo llegado antes al límite
//                         (para avisarte que ya puedes volver a usar Claude)

const MARGEN_AVISO_REINICIO_MS = 30 * 60 * 1000; // no avisamos un reinicio que pasó hace más de 30 min

// Identifica una sesión por su hora de reinicio, redondeada al minuto
// (claude.ai entrega esa hora con fracciones de segundo que cambian de una lectura a otra).
function reinicioRedondeado(fecha) {
  return Math.round(fecha.getTime() / 60000) * 60000;
}

// Procesa una lectura de la sesión de 5 horas.
//
// Recibe:
//   estado   → lo guardado la vez anterior (o null): { reinicioMs, avisoEnviado, limiteEnviado, reinicioAvisado }
//   sesion5h → { porcentaje, reinicio } de esta lectura, o null si claude.ai no entregó una sesión activa
//   umbral   → % en que llega el aviso (ej. 80)
//   ahora    → fecha y hora de esta lectura
//
// Devuelve { estado, alertas }, igual que procesarLectura.
const CINCO_HORAS_MS = 5 * 60 * 60 * 1000;
const RITMO_MINIMO_TRANSCURRIDO_MS = 20 * 60 * 1000; // antes de 20 minutos de sesión es muy pronto para estimar
const RITMO_PORCENTAJE_MINIMO = 20;                  // y con menos de 20% usado, también
const RITMO_MARGEN_MS = 10 * 60 * 1000;              // solo se avisa si llegarías al límite al menos 10 min antes del reinicio

// ¿A este ritmo llegarías al límite de la sesión antes de que se reinicie? Devuelve la hora (ms) en que llegarías, o null.
// La sesión dura 5 horas: empezó 5 horas antes de su hora de reinicio.
function llegadaAlLimiteDeSesion(porcentaje, reinicioMs, ahoraMs) {
  if (porcentaje >= 100 || porcentaje < RITMO_PORCENTAJE_MINIMO) return null;
  const transcurrido = ahoraMs - (reinicioMs - CINCO_HORAS_MS);
  if (transcurrido < RITMO_MINIMO_TRANSCURRIDO_MS) return null;
  const llegada = ahoraMs + ((100 - porcentaje) * transcurrido) / porcentaje;
  return llegada < reinicioMs - RITMO_MARGEN_MS ? llegada : null;
}

// "avisoRitmo": si es true, también avisa (una vez por sesión) cuando a este ritmo llegarías al límite antes del reinicio.
// En ese caso el estado guarda "llegadaMs": la hora estimada.
function procesarSesion({ estado, sesion5h, umbral, ahora, avisoRitmo = false }) {
  const alertas = [];
  let nuevo = estado ? { ...estado } : null;
  const reinicioActual = sesion5h ? reinicioRedondeado(sesion5h.reinicio) : null;

  // 1. ¿Terminó la sesión anterior, en la que se había llegado al límite?
  //    Termina cuando llegó su hora de reinicio, o cuando aparece una sesión distinta.
  if (nuevo && nuevo.limiteEnviado && !nuevo.reinicioAvisado) {
    const terminoPorHora = ahora.getTime() >= nuevo.reinicioMs;
    const terminoPorSesionNueva = reinicioActual !== null && reinicioActual !== nuevo.reinicioMs;
    if (terminoPorHora || terminoPorSesionNueva) {
      // Si ya pasó mucho rato desde el reinicio, el aviso no sirve: se descarta sin enviarlo.
      if (ahora.getTime() - nuevo.reinicioMs <= MARGEN_AVISO_REINICIO_MS) alertas.push('sesion-reiniciada');
      nuevo.reinicioAvisado = true;
    }
  }

  // 2. La lectura actual (si hay una sesión activa)
  if (sesion5h) {
    if (!nuevo || nuevo.reinicioMs !== reinicioActual) {
      // Sesión nueva: todo vuelve a empezar.
      nuevo = { reinicioMs: reinicioActual, avisoEnviado: false, limiteEnviado: false, reinicioAvisado: false };
    }

    if (sesion5h.porcentaje >= 100) {
      if (!nuevo.limiteEnviado) alertas.push('sesion-limite');
      // Si se pasa directo al límite, no se avisa después el "va en 80%".
      nuevo.limiteEnviado = true;
      nuevo.avisoEnviado = true;
    } else if (sesion5h.porcentaje >= umbral) {
      if (!nuevo.avisoEnviado) alertas.push('sesion-aviso');
      nuevo.avisoEnviado = true;
    }

    // Aviso de ritmo: una vez por sesión, solo si todavía no se llegó al límite.
    if (avisoRitmo && !nuevo.ritmoAvisado && !nuevo.limiteEnviado) {
      const llegada = llegadaAlLimiteDeSesion(sesion5h.porcentaje, reinicioActual, ahora.getTime());
      if (llegada !== null) {
        alertas.push('sesion-ritmo');
        nuevo.ritmoAvisado = true;
        nuevo.llegadaMs = llegada;
      }
    }
  }

  return { estado: nuevo, alertas };
}

// Procesa una lectura de la cuota semanal: avisa UNA vez por semana al llegar al porcentaje elegido.
//   estado   → lo guardado la vez anterior (o null): { reinicioMs, avisoEnviado }
//   semana   → % usado de la cuota semanal
//   reinicio → fecha en que se reinicia la cuota semanal (cada semana es distinta)
//   umbral   → % en que llega el aviso (ej. 85)
// Devuelve { estado, alertas } con alertas = [] o ['semana-aviso'].
// Con "avisoRitmo" (y sabiendo cuándo empezó la semana), avisa además UNA vez por semana si a este ritmo llegarías al 100%
// antes del reinicio ('semana-ritmo'; el estado guarda "llegadaMs": cuándo llegarías). Para no avisar por un arranque fuerte,
// se espera a que pase un día de la semana y a llevar al menos 30%; y no se avisa si llegarías a menos de 6 horas del reinicio.
const RITMO_SEMANAL_HORAS_MINIMAS = 24;
const RITMO_SEMANAL_PORCENTAJE_MINIMO = 30;
const RITMO_SEMANAL_MARGEN_MS = 6 * HORA_MS;
function procesarSemana({ estado, semana, reinicio, umbral, avisoRitmo = false, inicioSemana = null, ahora = null }) {
  const reinicioMs = reinicioRedondeado(reinicio);
  let nuevo = estado && estado.reinicioMs === reinicioMs ? { ...estado } : { reinicioMs, avisoEnviado: false };
  const alertas = [];
  if (semana >= umbral && !nuevo.avisoEnviado) {
    alertas.push('semana-aviso');
    nuevo.avisoEnviado = true;
  }
  if (avisoRitmo && inicioSemana && ahora && !nuevo.ritmoAvisado && semana >= RITMO_SEMANAL_PORCENTAJE_MINIMO && semana < 100) {
    const horas = (ahora.getTime() - inicioSemana.getTime()) / HORA_MS;
    const proyeccion = proyeccionSemanal({ semana, inicioSemana, reinicio, ahora });
    if (horas >= RITMO_SEMANAL_HORAS_MINIMAS && proyeccion.tipo === 'llegaras' && proyeccion.cuando.getTime() < reinicio.getTime() - RITMO_SEMANAL_MARGEN_MS) {
      alertas.push('semana-ritmo');
      nuevo.ritmoAvisado = true;
      nuevo.llegadaMs = proyeccion.cuando.getTime();
    }
  }
  return { estado: nuevo, alertas };
}

// ----- A qué horas usas más -----
// Reparte el uso de un día entre sus 24 horas, a partir de las lecturas de ese día.
//   puntos   → [{ t, hoy }] las lecturas del día, en orden (t = momento en ms, hoy = % usado hoy hasta ese momento)
//   inicioMs → desde cuándo se mide el uso de ese día (lo usado antes de la primera lectura se reparte desde ahí)
// Lo que subió entre dos lecturas se reparte entre las horas que pasaron entre ellas (si el widget estuvo oculto
// tres horas, no se sabe en cuál de las tres fue: se reparte parejo).
// Si entre dos lecturas pasaron más de 3 horas (el computador apagado, o la app recién instalada), no hay cómo saber
// a qué hora fue ese uso: no se anota en ninguna hora (mejor que inventar uso a las 3 de la mañana).
// Devuelve 24 números (de las 00 a las 23), en % de la cuota semanal.
const TRAMO_MAXIMO_MS = 3 * 60 * 60 * 1000;
function usoPorHora(puntos, inicioMs) {
  const horas = new Array(24).fill(0);
  if (!Array.isArray(puntos) || puntos.length === 0) return horas;
  const inicioDelDia = new Date(puntos[0].t);
  inicioDelDia.setHours(0, 0, 0, 0);
  const partida = Number.isFinite(inicioMs) ? Math.min(Math.max(inicioMs, inicioDelDia.getTime()), puntos[0].t) : puntos[0].t;
  let antes = { t: partida, hoy: 0 };
  for (const punto of puntos) {
    const subio = punto.hoy - antes.hoy;
    if (subio > 0) {
      const total = punto.t - antes.t;
      if (total <= 0) {
        horas[new Date(punto.t).getHours()] += subio;
      } else if (total <= TRAMO_MAXIMO_MS) {
        // Se recorre el tramo de hora en hora, y a cada hora le toca la parte que le corresponde
        let desde = antes.t;
        while (desde < punto.t) {
          const finDeLaHora = new Date(desde);
          finDeLaHora.setMinutes(60, 0, 0);
          const hasta = Math.min(punto.t, finDeLaHora.getTime());
          horas[new Date(desde).getHours()] += (subio * (hasta - desde)) / total;
          desde = hasta;
        }
      }
    }
    if (punto.hoy >= antes.hoy || punto.t > antes.t) antes = punto;
  }
  return horas.map((valor) => Math.round(valor * 100) / 100);
}

// ----- Comparar con la semana pasada -----
// Mientras avanza la semana se guarda su "curva": cuánto llevaba de la cuota a cada hora desde que empezó.
// Con la curva de la semana pasada se puede decir "a esta misma altura ibas en 35%".

const MAXIMO_DE_PUNTOS_DE_LA_CURVA = 7 * 24 + 2;

// Agrega una lectura a una curva: un punto por tramo como máximo (el último de cada tramo).
//   curva → [[horas desde que empezó, %], ...]
//   paso  → de cuántas horas es cada tramo: 1 para la semana, 0.25 (15 minutos) para el día, 0.1 (6 minutos) para la sesión
function agregarALaCurva(curva, horas, semana, paso = 1) {
  if (!Number.isFinite(horas) || horas < 0 || !Number.isFinite(semana)) return curva || [];
  const punto = [Math.round(horas * 100) / 100, semana];
  const lista = Array.isArray(curva) ? [...curva] : [];
  const ultimo = lista[lista.length - 1];
  if (ultimo && Math.floor(ultimo[0] / paso) === Math.floor(punto[0] / paso)) lista[lista.length - 1] = punto;
  else lista.push(punto);
  return lista.slice(-MAXIMO_DE_PUNTOS_DE_LA_CURVA);
}

// Cuánto llevaba la semana pasada a esas mismas horas de empezada (entre dos puntos, en línea recta).
// Devuelve null si la curva no llega hasta ahí (por ejemplo, si se empezó a guardar a mitad de semana).
function valorDeLaCurva(curva, horas) {
  if (!Array.isArray(curva) || curva.length === 0 || !Number.isFinite(horas)) return null;
  if (horas < curva[0][0] - 1) return null;
  if (horas <= curva[0][0]) return curva[0][1];
  for (let i = 1; i < curva.length; i++) {
    const [h0, v0] = curva[i - 1];
    const [h1, v1] = curva[i];
    if (horas <= h1) return h1 === h0 ? v1 : v0 + ((v1 - v0) * (horas - h0)) / (h1 - h0);
  }
  return curva[curva.length - 1][1];
}

// Lo mismo, pero estimado con el historial por día (cuando todavía no hay curva de la semana pasada):
// suma lo usado en los días de la semana pasada hasta el momento equivalente (de cada día, la parte que cae en ese tramo).
// Devuelve null si faltan días en el historial (si no, la cuenta saldría más baja de lo que fue).
function semanaPasadaSegunHistorial({ historial, inicioSemana, ahora }) {
  if (!inicioSemana || !Array.isArray(historial)) return null;
  const desde = inicioSemana.getTime() - 7 * DIA_MS;
  const hasta = ahora.getTime() - 7 * DIA_MS;
  if (!(hasta > desde)) return null;
  const porDia = new Map(historial.map((entrada) => [entrada.dia, entrada]));
  let suma = 0;
  let faltan = 0;
  let dias = 0;
  const cursor = new Date(desde);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < hasta) {
    const inicioDelDia = cursor.getTime();
    cursor.setDate(cursor.getDate() + 1);
    const finDelDia = cursor.getTime();
    const parte = (Math.min(hasta, finDelDia) - Math.max(desde, inicioDelDia)) / (finDelDia - inicioDelDia);
    const registro = porDia.get(diaLocal(new Date(inicioDelDia + 12 * HORA_MS)));
    dias += 1;
    if (registro && Number.isFinite(registro.uso)) suma += registro.uso * Math.max(0, Math.min(1, parte));
    else faltan += 1;
  }
  if (dias === 0 || faltan > 1 || faltan === dias) return null;
  return suma;
}

// Compara un valor de ahora con el de una curva anterior a la misma altura (ayer a esta hora, la sesión anterior...).
// Devuelve { diferencia, antes } (con un decimal) o null si la curva no llega hasta ahí.
function compararConCurva(valor, curva, horas) {
  if (!Number.isFinite(valor)) return null;
  const antes = valorDeLaCurva(curva, horas);
  if (antes === null) return null;
  const redondear = (numero) => Math.round(numero * 10) / 10;
  return { diferencia: redondear(valor - antes), antes: redondear(antes), aproximado: false };
}

// Compara lo que llevas esta semana con lo que llevabas la semana pasada a esta misma altura.
//   curvaPasada → { reinicioMs, puntos } de la semana anterior (o null)
// Devuelve { diferencia, antes, aproximado } (en puntos de la cuota semanal, con un decimal) o null si no se puede comparar.
function compararConSemanaPasada({ semana, inicioSemana, ahora, curvaPasada, historial }) {
  if (!inicioSemana || !Number.isFinite(semana)) return null;
  const horas = (ahora.getTime() - inicioSemana.getTime()) / HORA_MS;
  if (!(horas >= 0)) return null;
  let antes = null;
  let aproximado = false;
  // La curva sirve solo si es de la semana justo anterior (terminó cuando empezó esta)
  if (curvaPasada && Math.abs(curvaPasada.reinicioMs - inicioSemana.getTime()) < 12 * HORA_MS) {
    antes = valorDeLaCurva(curvaPasada.puntos, horas);
  }
  if (antes === null) {
    antes = semanaPasadaSegunHistorial({ historial, inicioSemana, ahora });
    aproximado = true;
  }
  if (antes === null) return null;
  const redondear = (valor) => Math.round(valor * 10) / 10;
  return { diferencia: redondear(semana - antes), antes: redondear(antes), aproximado };
}

// Lo mismo para el límite semanal propio de un modelo (Fable...), que tiene su propia fecha de reinicio.
//   guardado → { reinicioMs, puntos, pasada: { reinicioMs, puntos } o null } de ese modelo (o nada si es la primera vez)
// Devuelve { guardado, comparacion }: lo que hay que guardar ahora, y cómo va contra su semana anterior a esta misma altura
// (comparacion es null mientras no haya una semana anterior guardada).
// "historial" y "nombre" (opcionales): si la curva de la semana pasada no llega hasta este momento (por ejemplo, se empezó a
// guardar a mitad de semana), se estima con lo que ese modelo usó cada día (historial[].modelos[nombre]), como la semana general.
function seguirCurvaDeModelo(guardado, { porcentaje, reinicioMs, ahoraMs, historial = null, nombre = null }) {
  const horas = (ahoraMs - (reinicioMs - 7 * DIA_MS)) / HORA_MS;
  const sigue = Boolean(guardado) && Math.abs(reinicioMs - guardado.reinicioMs) <= 12 * HORA_MS;
  // Si la fecha de reinicio saltó, la semana de ese modelo terminó: su curva pasa a ser "la pasada"
  const pasada = guardado ? (sigue ? guardado.pasada || null : { reinicioMs: guardado.reinicioMs, puntos: guardado.puntos || [] }) : null;
  const puntos = agregarALaCurva(sigue ? guardado.puntos : [], horas, porcentaje);
  // La pasada sirve solo si es la semana justo anterior (terminó cuando empezó esta)
  const sirve = pasada && Math.abs(pasada.reinicioMs - (reinicioMs - 7 * DIA_MS)) < 12 * HORA_MS;
  let comparacion = sirve ? compararConCurva(porcentaje, pasada.puntos, horas) : null;
  if (!comparacion && Array.isArray(historial) && nombre && Number.isFinite(porcentaje)) {
    const porDia = historial.map((d) => ({ dia: d.dia, uso: d.modelos && Number.isFinite(d.modelos[nombre]) ? d.modelos[nombre] : undefined }));
    const antes = semanaPasadaSegunHistorial({ historial: porDia, inicioSemana: new Date(reinicioMs - 7 * DIA_MS), ahora: new Date(ahoraMs) });
    if (antes !== null) comparacion = { diferencia: Math.round((porcentaje - antes) * 10) / 10, antes: Math.round(antes * 10) / 10, aproximado: true };
  }
  return { guardado: { reinicioMs, puntos, pasada }, comparacion };
}

module.exports = {
  usoPorHora,
  seguirCurvaDeModelo,
  agregarALaCurva,
  valorDeLaCurva,
  semanaPasadaSegunHistorial,
  compararConSemanaPasada,
  compararConCurva,
  limiteAutomatico,
  semanaAlEmpezarElDia,
  llegadaAlLimiteDeSesion,
  procesarSemana,
  procesarLectura,
  diaDeLaSemana,
  limitesDelDia,
  diaLocal,
  ultimosDias,
  procesarSesion,
  proyeccionDiaria,
  proyeccionSemanal,
  proyeccionDeSesion,
  horasHastaFinDelDia,
};
