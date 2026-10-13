// ajustes.js: revisa que los ajustes que escribes en el panel de Ajustes sean válidos,
// y maneja la opción "Arrancar con Windows".

const { app } = require('electron');
const { t, OPCIONES_IDIOMA } = require('./idiomas');

// Cada cuántos minutos se puede consultar el uso (nunca menos de 5, para no molestar a claude.ai).
const OPCIONES_INTERVALO = [5, 10, 15, 30, 60];

// Tamaño del widget, en %: 100 es el normal. Lo usan la validación y el atajo Ctrl + rueda del mouse.
const ESCALA_MINIMA = 70;
const ESCALA_MAXIMA = 160;

// Vistas del widget y su orientación (la orientación vale para la vista normal).
const OPCIONES_FORMATO_REINICIO = ['relativo', 'hora'];
const OPCIONES_TAMANO_CONTEXTO = ['auto', '200k', '1m'];
const OPCIONES_MODO = ['normal', 'compacto', 'completo', 'tablero', 'cuentas', 'mini'];
const OPCIONES_ORIENTACION = ['vertical', 'horizontal'];

// Temas de color: oscuro, claro, o automático (sigue el tema de Windows).
const OPCIONES_TEMA = ['oscuro', 'claro', 'auto'];

// Revisa los ajustes recibidos desde el panel. El panel ya valida, pero aquí se vuelve
// a revisar porque nunca hay que fiarse de lo que llega desde una pantalla.
// Devuelve { ok: true, valores } o { ok: false, error: 'mensaje en español' }.
function validar(datos) {
  const limiteDiario = Number(datos.limiteDiario);
  const umbralAviso = Number(datos.umbralAviso);
  const intervaloMin = Number(datos.intervaloMin);

  if (!Number.isFinite(limiteDiario) || limiteDiario < 1 || limiteDiario > 100) {
    return { ok: false, error: t('err.limite') };
  }
  if (!Number.isFinite(umbralAviso) || umbralAviso < 1) {
    return { ok: false, error: t('err.avisoMinimo') };
  }
  if (umbralAviso >= limiteDiario) {
    return { ok: false, error: t('err.avisoMenor') };
  }
  if (!OPCIONES_INTERVALO.includes(intervaloMin)) {
    return { ok: false, error: t('err.intervalo') };
  }
  const umbralSesion = Number(datos.umbralSesion);
  if (!Number.isFinite(umbralSesion) || umbralSesion < 50 || umbralSesion > 99) {
    return { ok: false, error: t('err.umbralSesion') };
  }
  // Aviso de la cuota semanal (si no viene, se usan los valores de siempre)
  const umbralSemana = datos.umbralSemana === undefined ? 85 : Number(datos.umbralSemana);
  if (!Number.isFinite(umbralSemana) || umbralSemana < 50 || umbralSemana > 99) {
    return { ok: false, error: t('err.umbralSemana') };
  }
  if (datos.alertasSemana !== undefined && typeof datos.alertasSemana !== 'boolean') {
    return { ok: false, error: t('err.opcion') };
  }
  // Opciones nuevas: si no vienen, se usan los valores de siempre.
  const siNoViene = (valor, porDefecto) => (valor === undefined ? porDefecto : valor);
  const avisoRitmo = siNoViene(datos.avisoRitmo, true);
  const iconoDeColor = siNoViene(datos.iconoDeColor, true);
  const atajoGlobal = siNoViene(datos.atajoGlobal, true);
  const buscarActualizaciones = siNoViene(datos.buscarActualizaciones, true);
  const pausarOculto = siNoViene(datos.pausarOculto, true);
  const resumenes = siNoViene(datos.resumenes, true);
  const seguirAClaude = siNoViene(datos.seguirAClaude, false);
  const sinBarras = siNoViene(datos.sinBarras, false);
  const ocultarHoy = siNoViene(datos.ocultarHoy, false);
  const consultaRapida = siNoViene(datos.consultaRapida, false);
  const avisoRitmoSemana = siNoViene(datos.avisoRitmoSemana, true);
  if ([avisoRitmo, iconoDeColor, atajoGlobal, buscarActualizaciones, pausarOculto, resumenes, seguirAClaude, sinBarras, ocultarHoy, consultaRapida, avisoRitmoSemana].some((valor) => typeof valor !== 'boolean')) {
    return { ok: false, error: t('err.opcion') };
  }
  // Contexto de Claude Code
  const contextoVisible = siNoViene(datos.contextoVisible, true);
  const avisoContexto = siNoViene(datos.avisoContexto, true);
  if (typeof contextoVisible !== 'boolean' || typeof avisoContexto !== 'boolean') {
    return { ok: false, error: t('err.opcion') };
  }
  const umbralContexto = Number(siNoViene(datos.umbralContexto, 70));
  if (!Number.isFinite(umbralContexto) || umbralContexto < 10 || umbralContexto > 95) {
    return { ok: false, error: t('err.umbralContexto') };
  }
  const tamanoContexto = siNoViene(datos.tamanoContexto, 'auto');
  if (!OPCIONES_TAMANO_CONTEXTO.includes(tamanoContexto)) {
    return { ok: false, error: t('err.opcion') };
  }
  const formatoReinicio = siNoViene(datos.formatoReinicio, 'relativo');
  if (!OPCIONES_FORMATO_REINICIO.includes(formatoReinicio)) {
    return { ok: false, error: t('err.opcion') };
  }
  // Colores propios: null (los de siempre) o los cuatro en formato #rrggbb.
  let colores = null;
  if (datos.colores !== null && datos.colores !== undefined) {
    const esColor = (valor) => typeof valor === 'string' && /^#[0-9a-fA-F]{6}$/.test(valor);
    const { acento, verde, amarillo, rojo } = datos.colores;
    if (![acento, verde, amarillo, rojo].every(esColor)) return { ok: false, error: t('err.colores') };
    colores = { acento: acento.toLowerCase(), verde: verde.toLowerCase(), amarillo: amarillo.toLowerCase(), rojo: rojo.toLowerCase() };
  }

  if (
    typeof datos.siempreEncima !== 'boolean' ||
    typeof datos.arrancarConWindows !== 'boolean' ||
    typeof datos.alertasSesion !== 'boolean'
  ) {
    return { ok: false, error: t('err.opcion') };
  }

  // Apariencia
  if (!OPCIONES_MODO.includes(datos.modo)) {
    return { ok: false, error: t('err.vista') };
  }
  if (!OPCIONES_ORIENTACION.includes(datos.orientacion)) {
    return { ok: false, error: t('err.disposicion') };
  }
  if (!OPCIONES_IDIOMA.includes(datos.idioma)) {
    return { ok: false, error: t('err.idioma') };
  }
  if (!OPCIONES_TEMA.includes(datos.tema)) {
    return { ok: false, error: t('err.tema') };
  }
  const opacidad = Number(datos.opacidad);
  if (!Number.isFinite(opacidad) || opacidad < 40 || opacidad > 100) {
    return { ok: false, error: t('err.transparencia') };
  }

  const escala = Number(datos.escala);
  if (!Number.isFinite(escala) || escala < ESCALA_MINIMA || escala > ESCALA_MAXIMA) {
    return { ok: false, error: t('err.escala', { min: ESCALA_MINIMA, max: ESCALA_MAXIMA }) };
  }

  // Límites distintos por día: null (el mismo límite todos los días) o 7 números, de lunes a domingo.
  let limitesPorDia = null;
  if (datos.limitesPorDia !== null && datos.limitesPorDia !== undefined) {
    if (!Array.isArray(datos.limitesPorDia) || datos.limitesPorDia.length !== 7) {
      return { ok: false, error: t('err.limitesSiete') };
    }
    limitesPorDia = datos.limitesPorDia.map(Number);
    if (limitesPorDia.some((limite) => !Number.isFinite(limite) || limite < 1 || limite > 100)) {
      return { ok: false, error: t('err.limiteDia') };
    }
    limitesPorDia = limitesPorDia.map((limite) => Math.round(limite * 10) / 10);
  }

  return {
    ok: true,
    valores: {
      // Un decimal como máximo (ej. 12,5)
      limiteDiario: Math.round(limiteDiario * 10) / 10,
      umbralAviso: Math.round(umbralAviso * 10) / 10,
      intervaloMin,
      alertasSesion: datos.alertasSesion,
      umbralSesion: Math.round(umbralSesion),
      alertasSemana: datos.alertasSemana !== false,
      avisoRitmo,
      iconoDeColor,
      atajoGlobal,
      buscarActualizaciones,
      pausarOculto,
      resumenes,
      seguirAClaude,
      sinBarras,
      ocultarHoy,
      consultaRapida,
      avisoRitmoSemana,
      formatoReinicio,
      colores,
      umbralSemana: Math.round(umbralSemana),
      contextoVisible,
      avisoContexto,
      umbralContexto: Math.round(umbralContexto),
      tamanoContexto,
      siempreEncima: datos.siempreEncima,
      arrancarConWindows: datos.arrancarConWindows,
      modo: datos.modo,
      orientacion: datos.orientacion,
      tema: datos.tema,
      idioma: datos.idioma,
      opacidad: Math.round(opacidad),
      escala: Math.round(escala),
      limitesPorDia,
      limiteAutomatico: datos.limiteAutomatico === true,
      todasLasCuentas: datos.todasLasCuentas !== false,
      ventanasSeparadas: datos.ventanasSeparadas === true,
    },
  };
}

// ----- Arrancar con Windows -----

// Mientras la app no esté instalada (Fase 6), Windows tiene que saber que debe abrir Electron
// apuntando a la carpeta del proyecto; si no, abriría una ventana vacía de Electron.
function opcionesDeInicio() {
  return app.isPackaged ? {} : { path: process.execPath, args: [app.getAppPath()] };
}

// ¿Está activado hoy "arrancar con Windows"? Se pregunta a Windows directamente.
function arrancaConWindows() {
  return app.getLoginItemSettings(opcionesDeInicio()).openAtLogin;
}

// Activa o desactiva el arranque con Windows (queda en la lista de aplicaciones de inicio).
function cambiarArranqueConWindows(activar) {
  app.setLoginItemSettings({ openAtLogin: activar, ...opcionesDeInicio() });
}

// La app antes se llamaba "Cupo": si quedó activado "arrancar con Windows" apuntando al programa viejo (Cupo.exe),
// se vuelve a activar con el programa de ahora. Solo en la versión instalada.
function migrarArranqueDeCupo() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  try {
    const { launchItems = [] } = app.getLoginItemSettings();
    const vieja = launchItems.find((item) => item.enabled && /[\\/]Cupo\.exe$/i.test(item.path || ''));
    if (vieja && !arrancaConWindows()) cambiarArranqueConWindows(true);
  } catch (error) {
    console.error('No se pudo revisar el arranque con Windows:', error.message);
  }
}

module.exports = {
  migrarArranqueDeCupo,
  OPCIONES_MODO,
  OPCIONES_ORIENTACION,
  ESCALA_MINIMA,
  ESCALA_MAXIMA,
  OPCIONES_INTERVALO,
  OPCIONES_TEMA,
  validar,
  arrancaConWindows,
  cambiarArranqueConWindows,
};
