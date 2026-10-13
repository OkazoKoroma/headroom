// main.js: es el "arranque" de la app. Electron ejecuta este archivo primero.
// Aquí se crean la ventana del widget y el ícono de la bandeja del sistema.

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Tray, Menu, screen, nativeImage, ipcMain, dialog, globalShortcut, shell } = require('electron');
const almacen = require('./almacen');
const sesion = require('./sesion');
const uso = require('./uso');
const { ErrorUso } = uso;
const idiomas = require('./idiomas');
const { t } = idiomas;
const calculo = require('./calculo');
const alertas = require('./alertas');
const ajustes = require('./ajustes');
const exportar = require('./exportar');
const copia = require('./copia');
const estadisticas = require('./estadisticas');
const informe = require('./informe');
const { claudeEstaAbierto } = require('./claude-abierto');
const actualizaciones = require('./actualizaciones');
const contexto = require('./contexto');
const { rutaDeAsset } = require('./rutas');

// Modo de prueba: se activa abriendo la app con "--prueba" (ver "Abrir widget (modo prueba).bat").
// En este modo el uso es INVENTADO (lo controlas desde el menú de la bandeja) y se guarda
// en un archivo aparte, así que no toca tu historial real. Sirve para probar las alertas.
const MODO_PRUEBA = process.argv.includes('--prueba');
// Con "--invisible" (solo en el modo de prueba) las ventanas no se ven ni reciben el mouse: así las pruebas automáticas
// corren sin estorbar en la pantalla. Por dentro todo funciona igual (se dibujan, cambian de tamaño...).
const INVISIBLE = MODO_PRUEBA && process.argv.includes('--invisible');

// La página de claude.ai con el detalle oficial del uso (se abre en tu navegador).
const PAGINA_DE_USO = 'https://claude.ai/settings/usage';
if (MODO_PRUEBA) almacen.usarArchivo('datos-prueba.json');
// En el modo de prueba, un error no muestra el cuadro de Windows: se anota en la consola (lo lee pruebas/pantalla.js).
if (MODO_PRUEBA) process.on('uncaughtException', (error) => console.error('ERROR EN LA APP:', error && error.stack));

// Identificador con el que Windows reconoce a esta app (para mostrar sus notificaciones con su nombre).
// En la versión instalada debe ser igual al "appId" de package.json; en la de desarrollo da igual.
app.setAppUserModelId(app.isPackaged ? 'cl.widget-uso-claude' : 'Headroom');

// La ventana es un poco más grande que la tarjeta (un margen transparente alrededor) para que quepa
// la sombra suave que la hace "flotar".
const MARGEN = 1;

// Medidas de la tarjeta (sin el margen) en cada vista, en píxeles.
const MEDIDAS_DE_VISTA = {
  'normal-vertical': { ancho: 300, alto: 154 },    // las tres barras, una bajo la otra
  'normal-horizontal': { ancho: 540, alto: 92 },   // las tres barras, lado a lado
  compacto: { ancho: 300, alto: 44 },              // una sola línea con la barra de Hoy
  mini: { ancho: 64, alto: 64 },                   // un círculo con el anillo de Hoy
  completo: { ancho: 760, alto: 92 + 8 + 250 },    // las barras arriba y, abajo, el historial, el desglose y la proyección juntos
  cuentas: { ancho: 760, alto: 0 },                // todas las cuentas a la vez, una fila por cuenta (el alto depende de cuántas haya)
  // el panel de control: la vista completa (más ancha) y, debajo, seis gráficos más en dos filas (ver #tablero en widget.css)
  // (con el margen de la ventana mide 1280 × 720)
  tablero: { ancho: 1278, alto: 92 + 8 + 250 + 8 + 360 },
};
// El panel de control es la vista completa con una sección más: casi todo lo que vale para una vale para la otra.
const esVistaCompleta = (vista) => vista.modo === 'completo' || vista.modo === 'tablero';

// Tamaño del widget (se elige en Ajustes, o con Ctrl + rueda del mouse): todas las medidas de la ventana
// se multiplican por la escala. 1 = tamaño normal (100%). La pantalla del widget se amplía igual con "zoom".
let escalaActual = 1;
const px = (valor) => Math.round(valor * escalaActual);
// El ancho de la ventana: el de la vista, o el que pide el panel abierto si es más ancho (Ajustes lo es).
const ancho = (w) => px(Math.max(medidasDeVista(w).ancho + 2 * MARGEN, w.expansion.anchoPanel));
const margen = () => px(MARGEN);

// Los íconos de la tarjeta despliegan un panel (historial, desglose, proyección o ajustes) que hace
// crecer la ventana. Lo que crece es el alto del panel más la separación con la tarjeta.
// Cada panel pide su propio alto (Ajustes es más alto que los demás); aquí solo se revisa que sea razonable.
// (PANEL_SEPARACION debe coincidir con --separacion en widget.css.)
const PANEL_ALTO_NORMAL = 196;
const PANEL_ALTO_MINIMO = 120;
const PANEL_ALTO_MAXIMO = 1400; // (además, nunca más alto que lo que cabe en la pantalla)
const PANEL_SEPARACION = 8;

// Todas las horas se muestran en la zona horaria de tu computador.
const ZONA_HORARIA = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Nunca se consulta más seguido que esto (para no molestar a claude.ai).
// El intervalo normal lo eliges tú en Ajustes (por defecto 5 minutos).
const MINIMO_ENTRE_CONSULTAS_MS = 5 * 60 * 1000;
// Con la opción "consulta rápida", mientras la sesión de 5 horas de alguna cuenta va sobre 70% se consulta cada 2 minutos
// (es cuando más importa enterarse a tiempo); el resto del tiempo vale el intervalo normal.
const CONSULTA_RAPIDA_MS = 2 * 60 * 1000;
const CONSULTA_RAPIDA_DESDE = 70; // % de la sesión de 5 horas
// Si la última lectura falló, se reintenta a los 5 minutos (o antes, si tu intervalo es más corto).
const REINTENTO_TRAS_ERROR_MS = 5 * 60 * 1000;

let bandeja = null;

// ----- Las ventanas del widget -----
// Normalmente hay una sola ventana: la "principal", que muestra la cuenta elegida (o todas a la vez).
// Con "cada cuenta en su propia ventana" (Ajustes), cada una de las demás cuentas tiene además su propia ventana,
// que se mueve por su cuenta y tiene su propia vista. Cada ventana guarda su estado en un objeto "w":
//   cuentaId   → la cuenta que muestra (null en la principal: la cuenta elegida)
//   ventana    → la ventana de Electron
//   vista      → modo ('normal', 'compacto', 'completo' o 'cuentas') y orientación ('vertical' u 'horizontal')
//   expansion  → cuánto ha crecido la ventana por el panel desplegable, y hacia dónde (arriba o abajo).
//                "extra" es lo que creció (ya multiplicado por la escala) y "alto" es el alto del panel en píxeles sin escalar.
//                "anchoPanel" es el ancho que pidió el panel abierto (0 = no pide más ancho que la vista) y "anclaDerecha"
//                dice si, al ensancharse, la ventana crece hacia la izquierda (quedando quieto su borde derecho).
//   redimension → datos del arrastre de un borde, mientras estiras la ventana (null si no)
//   cambiandoDeVista → evita que un segundo clic interrumpa la animación de cambio de vista
//   limitesExtra → cuántas barras extra (Fable, Contexto...) tiene la tarjeta
function nuevoWidget(cuentaId, vista = { modo: 'normal', orientacion: 'vertical' }) {
  return {
    cuentaId,
    ventana: null,
    vista,
    expansion: { extra: 0, alto: 0, anchoPanel: 0, anclaDerecha: false, haciaArriba: true },
    redimension: null,
    cambiandoDeVista: false,
    limitesExtra: 0,
  };
}
const principal = nuevoWidget(null);
const secundarias = new Map(); // id de la cuenta → su ventana propia
// Partes del widget sacadas a su propia ventana. Cada una es de una cuenta (la de la ventana de donde salió):
// la clave es "<cuenta>:<parte>", por ejemplo "c2:historial", o "principal:historial" si salió del widget principal.
const PARTES_SEPARABLES = ['historial', 'desglose', 'proyeccion', 'productos', 'chats'];
const partes = new Map(); // clave → su ventana
const claveDeParte = (parte, cuentaId) => `${cuentaId || 'principal'}:${parte}`;
const CHATS_SEPARADOS = claveDeParte('chats', null);
const todasLasVentanas = () => [principal, ...secundarias.values(), ...partes.values()];
const estaViva = (w) => Boolean(w.ventana && !w.ventana.isDestroyed());
// La cuenta que muestra una ventana.
const cuentaDe = (w) => w.cuentaId || cuentaActivaId();
// La ventana desde la que llegó un mensaje de una pantalla.
const ventanaDelEvento = (evento) => todasLasVentanas().find((w) => estaViva(w) && w.ventana.webContents === evento.sender) || principal;
let ventanasSeparadas = false; // ajuste: cada cuenta en su propia ventana

function claveDeVista(vista) {
  return vista.modo === 'normal' ? 'normal-' + vista.orientacion : vista.modo;
}

// La vista completa muestra, entre la tarjeta y los paneles, una fila por cada cuenta (si hay más de una).
// (Estas medidas deben coincidir con #resumen-cuentas en widget.css.)
const RESUMEN_SEPARACION = 8;
const RESUMEN_RELLENO = 16;
const RESUMEN_FILA = 22;
let totalDeCuentas = 1; // cuántas cuentas hay (se actualiza al agregar o eliminar)
let sinBarras = false; // ajuste "solo números": la tarjeta sin barras es más baja (ver AHORRO_SIN_BARRA_* y widget.css)
let ocultarHoy = false; // ajuste "ocultar la barra de Hoy": la tarjeta vertical pierde un medidor; en la compacta y la mínima se ve la sesión
const AHORRO_SIN_BARRA_VERTICAL = 13; // por cada medidor de la tarjeta vertical: la barra (10) y su separación (3)
const AHORRO_SIN_BARRA_FRANJA = 15;   // en las vistas de franja (horizontal, completa y panel de control): la barra (9) y su separación (6)
let verTodasLasCuentas = true; // ajuste: en la vista normal y la compacta, mostrar todas las cuentas a la vez (si hay más de una)

// Cuando se muestran todas las cuentas a la vez, la tarjeta de siempre se reemplaza por una lista (una fila o un bloque por cuenta).
// Estas medidas deben coincidir con widget.css (body.todas).
// Los límites extra (por ejemplo Fable) de la cuenta que se muestra: cada uno es una barra más en la tarjeta.
const ALTO_POR_LIMITE_EXTRA = 38;   // vista vertical (debe coincidir con widget.css)
const ANCHO_POR_LIMITE_EXTRA = 110; // vista horizontal

const LISTA_CABECERA = 24; // el título con sus botones
const LISTA_BLOQUE = 84;   // una cuenta con sus tres barras una bajo la otra (vista normal vertical)
const LISTA_BLOQUE_SIN_DATOS = 28; // una cuenta sin sesión o sin datos: una sola línea
const LISTA_FILA_EXTRA = 19;       // cada límite extra (Fable...) de una cuenta: una barra más en su bloque
const ANCHO_COLUMNA_EXTRA_LISTA = 183; // cada límite extra: una columna más en las filas anchas

// Los límites extra (por modelo) de una cuenta, según lo último leído.
function limitesExtraDe(id) {
  const uso = lecturaDe(id).uso;
  return uso && Array.isArray(uso.limitesExtra) ? uso.limitesExtra : [];
}

// ----- Chats de Claude Code: cuánto de su ventana de contexto lleva cada uno -----
// Es solo para Claude Code usado en este mismo computador (sus chats quedan guardados aquí); los chats de claude.ai
// no informan su contexto. Solo se muestra con una cuenta: con varias (que suelen usarse en distintos equipos) no sirve.

let chatsActuales = []; // [{ sesion, titulo, tokens, tamano, porcentaje }], del más reciente al más antiguo
const avisosDeChats = new Map(); // sesión del chat → estado de su aviso (ver contexto.tocaAvisar)

// Medidas de la sección "Chats de Claude Code" (deben coincidir con .chats en widget.css)
const CHATS_SEPARACION = 8;
const CHATS_RELLENO = 16;
const CHATS_CABECERA = 18;
const CHATS_FILA = 22;

// El alto que suma la sección de chats a una ventana: solo en la principal y no en la vista compacta.
function altoDeChats(w, vista = w.vista) {
  if (w !== principal || partes.has(CHATS_SEPARADOS) || vista.modo === 'compacto' || vista.modo === 'mini' || chatsActuales.length === 0) return 0;
  return CHATS_SEPARACION + CHATS_RELLENO + CHATS_CABECERA + CHATS_FILA * chatsActuales.length;
}

// "108k / 1M"
function textoDeTokens(tokens) {
  if (tokens >= 1000000) return `${Math.round(tokens / 100000) / 10}M`.replace('.', idiomas.locale().startsWith('en') ? '.' : ',');
  return `${Math.round(tokens / 1000)}k`;
}

function chatsParaLaPantalla() {
  return chatsActuales.map((chat) => ({
    sesion: chat.sesion,
    titulo: chat.titulo || t('chats.sinNombre'),
    porcentaje: chat.porcentaje,
    detalle: `${textoDeTokens(chat.tokens)} / ${textoDeTokens(chat.tamano)}`,
  }));
}

// Mira los chats de Claude Code (es leer archivos locales: barato). Avisa si toca y, si algo cambió, redibuja.
function revisarContexto() {
  const config = almacen.leer();
  let chats = [];
  if ((config.contextoVisible || config.avisoContexto) && totalDeCuentas === 1) {
    try {
      chats = contexto.leerChats({ tamano: config.tamanoContexto });
    } catch (error) {
      console.error('No se pudo leer el contexto de Claude Code:', error.message);
    }
  }
  if (config.avisoContexto) {
    for (const chat of chats) {
      if (!avisosDeChats.has(chat.sesion)) avisosDeChats.set(chat.sesion, { sesion: null, avisadoHasta: null });
      if (contexto.tocaAvisar(avisosDeChats.get(chat.sesion), chat, config.umbralContexto)) {
        alertas.enviarContexto(chat.porcentaje, chat.titulo);
      }
    }
  }
  const mostrar = config.contextoVisible ? chats : [];
  const firma = (lista) => lista.map((d) => [d.sesion, d.titulo, d.tokens, d.tamano].join('|')).join('/');
  if (firma(mostrar) === firma(chatsActuales)) return;
  const otraCantidad = mostrar.length !== chatsActuales.length;
  chatsActuales = mostrar;
  if (otraCantidad) {
    reajustarLaVentana(principal);
    if (partes.has(CHATS_SEPARADOS)) reajustarLaVentana(partes.get(CHATS_SEPARADOS));
  }
  enviarUso();
}

// La mayor cantidad de límites extra que tiene una sola cuenta.
function maximoDeLimitesExtra() {
  return idsDeCuentas.reduce((mayor, id) => Math.max(mayor, limitesExtraDe(id).length), 0);
}
let idsDeCuentas = ['c1']; // los ids de las cuentas, en orden (se actualiza junto con totalDeCuentas)

function actualizarTotalDeCuentas() {
  idsDeCuentas = almacen.leer().cuentas.map((c) => c.id);
  totalDeCuentas = idsDeCuentas.length;
}

// El alto de la lista en la vista normal vertical: cada cuenta con datos es un bloque de tres barras; las demás, una línea.
function alturaDeLosBloques() {
  return idsDeCuentas.reduce((suma, id) => {
    const lectura = lecturaDe(id);
    const conDatos = sesion.estadoDe(id) === 'conectado' && lectura.uso && !lectura.error;
    return suma + (conDatos ? LISTA_BLOQUE + LISTA_FILA_EXTRA * limitesExtraDe(id).length - (ocultarHoy ? LISTA_FILA_EXTRA : 0) : LISTA_BLOQUE_SIN_DATOS);
  }, 0);
}

// ¿Esa ventana muestra todas las cuentas a la vez (una lista) en vez de la tarjeta de una sola?
// Con cada cuenta en su propia ventana, solo en la vista "Cuentas".
function todasALaVez(w, vista = w.vista) {
  if (w.parte) return false;
  if (vista.modo === 'cuentas') return true;
  if (vista.modo === 'mini') return false;
  if (esVistaCompleta(vista) || ventanasSeparadas) return false;
  return totalDeCuentas >= 2 && verTodasLasCuentas;
}

// ¿La vista completa lleva el resumen con una fila por cuenta? (Con cada cuenta en su ventana, no hace falta.)
const hayResumenDeCuentas = () => totalDeCuentas >= 2 && !ventanasSeparadas;

// Con muchas cuentas a la vez, el desglose y la proyección necesitan más alto (una línea por cuenta).
// (Estas cuentas deben coincidir con las de widget.js → tamanoBaseDePanel.)
const ALTO_POR_CUENTA_EN_PROYECCION = 54; // una línea en "Hoy", otra en "Sesión 5 h" y otra en "Semana"
const ALTO_POR_CUENTA_EN_DESGLOSE = 24;
// La vista completa crece lo que le falta a la proyección a partir de la cuarta cuenta.
const extraDeCompletoPorCuentas = () => (hayResumenDeCuentas() ? Math.max(0, totalDeCuentas - 2) * ALTO_POR_CUENTA_EN_PROYECCION : 0);

function altoDelResumen() {
  return hayResumenDeCuentas() ? RESUMEN_SEPARACION + RESUMEN_RELLENO + RESUMEN_FILA * totalDeCuentas : 0;
}

// Lo que el usuario estiró la ventana de cada vista (en píxeles sin escala), por vista: { ancho, alto }.
// Se guarda en los datos de la app ("tamanos"). La ventana nunca es más chica que la medida base de su vista.
let tamanosGuardados = {};
const claveDeTamano = (w, vista = w.vista) => (w.parte ? 'parte-' + w.parte : claveDeVista(vista) + (todasALaVez(w, vista) ? '-todas' : ''));

// ¿Se puede estirar esa vista a lo alto? Solo a lo ancho en la compacta y en las listas de cuentas (su alto depende de las cuentas).
const permiteAlto = (w, vista = w.vista) => w.parte !== 'chats' && vista.modo !== 'compacto' && vista.modo !== 'mini' && !todasALaVez(w, vista);

function extrasDeVista(w, vista = w.vista) {
  if (vista.modo === 'mini') return { ancho: 0, alto: 0 }; // el círculo no se estira
  const guardado = tamanosGuardados[claveDeTamano(w, vista)] || {};
  return {
    ancho: Math.max(0, Math.round(guardado.ancho || 0)),
    alto: permiteAlto(w, vista) ? Math.max(0, Math.round(guardado.alto || 0)) : 0,
  };
}

// Las medidas de una vista, con lo que el usuario la estiró.
function medidasDeVista(w, vista = w.vista) {
  const base = medidasBase(w, vista);
  const extras = extrasDeVista(w, vista);
  return { ancho: base.ancho + extras.ancho, alto: base.alto + extras.alto };
}

// El panel de control es alto (718 px más los chats y las cuentas): si no cabe en la pantalla, la sección de gráficos
// de abajo se achica lo justo (hasta RECORTE_MAXIMO_DEL_TABLERO). La pantalla recibe ese recorte en la apariencia.
const RECORTE_MAXIMO_DEL_TABLERO = 120;
function recorteDelTablero(w, vista = w.vista) {
  if (vista.modo !== 'tablero' || w.parte) return 0;
  const sinRecorte = MEDIDAS_DE_VISTA.tablero.alto + altoDelResumen() + extraDeCompletoPorCuentas() + altoDeChats(w, vista) + 2 * MARGEN;
  const area = (estaViva(w) ? screen.getDisplayMatching(w.ventana.getBounds()) : screen.getPrimaryDisplay()).workArea;
  const sobra = Math.ceil(sinRecorte - area.height / escalaActual);
  return Math.max(0, Math.min(RECORTE_MAXIMO_DEL_TABLERO, sobra));
}

// Las medidas de una vista sin estirar.
function medidasBase(w, vista = w.vista) {
  const medidas = medidasSinChats(w, vista);
  return { ...medidas, alto: medidas.alto + altoDeChats(w, vista) };
}

// Tamaño de cada parte separada (la de los chats depende de cuántos haya).
const MEDIDAS_DE_PARTE = {
  historial: { ancho: 320, alto: 250 },
  desglose: { ancho: 300, alto: 230 },
  proyeccion: { ancho: 300, alto: 322 },
  productos: { ancho: 500, alto: 300 },
};
// "w": la ventana de esa parte. Si muestra todas las cuentas a la vez, el desglose y la proyección crecen con ellas.
function medidasDeParte(parte, w) {
  if (parte === 'chats') return { ancho: 300, alto: CHATS_RELLENO + CHATS_CABECERA + CHATS_FILA * Math.max(1, chatsActuales.length) };
  const base = MEDIDAS_DE_PARTE[parte];
  const cuentas = w && !w.cuentaId && hayResumenDeCuentas() ? totalDeCuentas : 1;
  if (cuentas < 2) return base;
  if (parte === 'proyeccion') return { ...base, alto: Math.max(base.alto, 176 + 48 * cuentas) };
  if (parte === 'desglose') return { ...base, alto: Math.max(base.alto, 154 + ALTO_POR_CUENTA_EN_DESGLOSE * cuentas) };
  if (parte === 'historial') return { ...base, alto: base.alto + (cuentas >= 3 ? 40 : 0) }; // la leyenda va en sus propias líneas
  return base;
}

function medidasSinChats(w, vista) {
  if (w.parte) return medidasDeParte(w.parte, w);
  const base = MEDIDAS_DE_VISTA[claveDeVista(vista)];
  if (vista.modo === 'mini') return base;
  // La vista completa: más alta con el resumen de cuentas, y más ancha si alguna cuenta tiene límites extra (una columna por cada uno).
  if (esVistaCompleta(vista)) {
    const columnasExtra = hayResumenDeCuentas() ? maximoDeLimitesExtra() : 0;
    return { ancho: base.ancho + ANCHO_COLUMNA_EXTRA_LISTA * columnasExtra, alto: base.alto + altoDelResumen() + extraDeCompletoPorCuentas() - (sinBarras ? AHORRO_SIN_BARRA_FRANJA : 0) - recorteDelTablero(w, vista) };
  }
  // Cada límite extra (por ejemplo Fable) es una barra más: en la vista vertical la tarjeta crece a lo alto, y en la horizontal a lo ancho.
  if (!todasALaVez(w, vista) && vista.modo === 'normal') {
    if (vista.orientacion === 'vertical') {
      const porMedidor = sinBarras ? AHORRO_SIN_BARRA_VERTICAL : 0;
      const medidoresExtra = w.limitesExtra - (ocultarHoy ? 1 : 0); // sin Hoy, un medidor menos
      return { ...base, alto: base.alto - 3 * porMedidor + (ALTO_POR_LIMITE_EXTRA - porMedidor) * medidoresExtra };
    }
    return { ...base, ancho: base.ancho + ANCHO_POR_LIMITE_EXTRA * w.limitesExtra, alto: base.alto - (sinBarras ? AHORRO_SIN_BARRA_FRANJA : 0) };
  }
  if (todasALaVez(w, vista)) {
    const cabecera = RESUMEN_RELLENO + LISTA_CABECERA;
    if (vista.modo === 'compacto') return { ancho: 300, alto: cabecera + RESUMEN_FILA * totalDeCuentas };
    if (vista.modo === 'normal' && vista.orientacion === 'vertical') return { ancho: 300, alto: cabecera + alturaDeLosBloques() };
    // horizontal y la vista "Cuentas": una fila por cuenta, con una columna más por cada límite extra (Fable...) que tenga alguna cuenta
    return { ancho: 760 + ANCHO_COLUMNA_EXTRA_LISTA * maximoDeLimitesExtra(), alto: cabecera + RESUMEN_FILA * totalDeCuentas };
  }
  return base;
}

// Alto de la ventana sin el panel desplegable, según la vista.
function altoBase(w) {
  return px(medidasDeVista(w).alto + 2 * MARGEN);
}

// Estado de la lectura del uso (general).
let horaActualizada = null; // hora de la última lectura buena (para el texto de la bandeja)
let ultimaConsulta = 0;     // momento (en ms) de la última consulta, para respetar el mínimo
let consultando = false;    // true mientras hay una consulta en curso
let formatoAvisado = false; // true si ya se avisó que claude.ai cambió su página (se avisa una sola vez)
let temporizadorUso = null; // temporizador de la próxima consulta automática
const pendientesDeLeer = new Set(); // cuentas que iniciaron sesión mientras había otra consulta en curso

// Lo último leído de cada cuenta, por su id:
//   uso           → último dato leído bien: { semana, hoy, limiteDiario, reinicioTexto, ... } (null si aún no hay)
//   error         → clave del mensaje corto si la última lectura falló (ej. 'error.formato'), o null si salió bien
//   inicioSemana / reinicioSemana → cuándo empezó y cuándo se reinicia la cuota semanal actual
//   inicioHoyMs   → desde cuándo se mide el uso de hoy (para las proyecciones)
//   fallosDeFormato → cuántas lecturas seguidas han fallado porque claude.ai entregó datos distintos
const lecturas = new Map();
function lecturaDe(id) {
  if (!lecturas.has(id)) {
    lecturas.set(id, { uso: null, error: null, inicioSemana: null, reinicioSemana: null, inicioHoyMs: null, fallosDeFormato: 0 });
  }
  return lecturas.get(id);
}

// La cuenta que se muestra en la tarjeta, y el nombre con que se la muestra
// (la primera cuenta no tiene nombre hasta que le pongas uno).
const cuentaActivaId = () => almacen.leer().cuentaActiva;
const nombreDeCuenta = (cuenta) => cuenta.nombre || t('cuentas.principal');
// En los avisos y archivos el nombre solo se usa si hay más de una cuenta (si no, sobra).
const nombreSiHayVarias = (cuenta) => (totalDeCuentas > 1 ? nombreDeCuenta(cuenta) : undefined);
const hayAlgunaConectada = () => almacen.leer().cuentas.some((c) => sesion.estadoDe(c.id) === 'conectado');

// Solo para el modo de prueba: el uso semanal inventado y cuántos días "adelantamos" el reloj.
// "reinicio" es la hora en que se reiniciaría la cuota semanal; null = en 3 días.
// "sesion" es el uso inventado de la sesión de 5 horas y "reinicioSesion" la hora en que terminaría.
const HORAS = 60 * 60 * 1000;
const simulacion = {
  semana: 20,
  diasAdelantados: 0,
  horasAdelantadas: 0,
  fallaFormato: false,
  reinicio: null,
  sesion: 30,
  reinicioSesion: new Date(Date.now() + 3 * HORAS),
};

// Calcula dónde poner la ventana al abrir.
// - Si hay una posición guardada Y ese lugar todavía cae dentro de algún monitor conectado, la usa.
// - Si no (primera vez, o el monitor ya no está), la pone en la esquina inferior derecha del monitor principal.
// - Una ventana propia de una cuenta que se abre por primera vez aparece a la izquierda de la principal.
function calcularPosicionInicial(w) {
  const guardada = guardadoDeVentana(w).posicion;

  if (guardada) {
    const cabeEnAlgunMonitor = screen.getAllDisplays().some((monitor) => {
      const area = monitor.workArea;
      // El margen transparente de la ventana puede quedar un poco fuera de la pantalla sin problema.
      return (
        guardada.x >= area.x - margen() &&
        guardada.y >= area.y - margen() &&
        guardada.x + ancho(w) <= area.x + area.width + margen() &&
        guardada.y + altoBase(w) <= area.y + area.height + margen()
      );
    });
    if (cabeEnAlgunMonitor) return guardada;
  }

  if (w !== principal && estaViva(principal)) {
    const junto = principal.ventana.getBounds();
    const area = screen.getDisplayMatching(junto).workArea;
    const yaHay = todasLasVentanas().filter((otra) => otra !== w && otra !== principal && estaViva(otra)).length;
    const y = Math.max(area.y, Math.min(junto.y + junto.height - altoBase(w), area.y + area.height - altoBase(w)));
    // A la izquierda del widget (una al lado de la otra); si por ese lado no cabe, a la derecha
    const izquierda = junto.x - (ancho(w) + 12) * (yaHay + 1);
    if (izquierda >= area.x) return { x: izquierda, y };
    const derecha = junto.x + junto.width + 12 + (ancho(w) + 12) * yaHay;
    if (derecha + ancho(w) <= area.x + area.width) return { x: derecha, y };
    return { x: Math.max(area.x, izquierda), y }; // (no cabe en ningún lado: acomodarSinTapar la correrá a donde pueda)
  }

  const area = screen.getPrimaryDisplay().workArea;
  return {
    x: area.x + area.width - ancho(w) - 12,
    y: area.y + area.height - altoBase(w) - 12,
  };
}

// Cambia el tamaño (y el lugar) de una ventana sin parpadeo. Si su borde de arriba se mueve (crece o se achica hacia arriba),
// Windows alcanza a mostrar un instante el contenido viejo pegado arriba antes de redibujarlo, y la tarjeta "salta".
// Para que no se vea, la ventana se vuelve invisible ese instante (unos 2 cuadros) y reaparece ya redibujada.
function ponerTamano(w, medidas) {
  const actual = w.ventana.getBounds();
  setTimeout(() => despejarAlrededor(w), 80); // si ahora tapa a otra ventana de la app, esa se corre
  if (medidas.y === actual.y) {
    w.ventana.setBounds(medidas);
    return;
  }
  clearTimeout(w.temporizadorOpacidad);
  w.ventana.setOpacity(0);
  w.ventana.setBounds(medidas);
  w.temporizadorOpacidad = setTimeout(() => { if (estaViva(w)) w.ventana.setOpacity(INVISIBLE ? 0 : 1); }, 32);
}

// Lo guardado de cada ventana (posición y vista): el de la principal va en los ajustes generales; el de la ventana
// propia de una cuenta, dentro de esa cuenta ("ventana").
function guardadoDeVentana(w) {
  if (w === principal) return almacen.leer();
  if (w.parte) return (almacen.leer().partes || {})[w.clave] || {};
  const cuenta = almacen.cuenta(w.cuentaId);
  return (cuenta && cuenta.ventana) || {};
}

function guardarDeVentana(w, cambios) {
  if (w === principal) return almacen.guardar(cambios);
  if (w.parte) {
    const todas = almacen.leer().partes || {};
    return almacen.guardar({ partes: { ...todas, [w.clave]: { ...(todas[w.clave] || {}), ...cambios } } });
  }
  if (!almacen.cuenta(w.cuentaId)) return;
  almacen.guardarCuenta(w.cuentaId, { ventana: { ...guardadoDeVentana(w), ...cambios } });
}

// Hace crecer la ventana para el panel desplegable (abierto = true, con el alto y el ancho que pide ese panel)
// o la devuelve a su tamaño (abierto = false). Hay tres casos:
//   - Abrir desde cero: crece hacia ARRIBA, dejando la tarjeta donde está; si arriba no hay espacio en
//     la pantalla, crece hacia ABAJO. Si no cabe en ninguna dirección, la ventana se corre lo justo.
//   - Cambiar a un panel de otro tamaño (con uno ya abierto): se ajusta en el mismo lugar. Si el nuevo
//     no cabe, responde { noCabe: true } y no cambia nada (la pantalla cierra y vuelve a abrir).
//   - Cerrar: la ventana vuelve a su tamaño.
// Si el panel es más ancho que la vista (Ajustes), la ventana también se ensancha: queda quieto el borde
// (izquierdo o derecho) más cercano al borde de la pantalla.
// Devuelve hacia dónde creció, para que la pantalla ponga el panel del lado correcto.
// "preferirAbajo": crecer hacia abajo si cabe (lo usa la vista completa, que tiene la tarjeta arriba).
function ajustarVentanaAlPanel(w, abierto, altoPanel, anchoPanel, preferirAbajo = false) {
  const altoPedido = Number.isFinite(altoPanel) ? altoPanel : PANEL_ALTO_NORMAL;
  const actual = w.ventana.getBounds();
  const area = screen.getDisplayMatching(actual).workArea;
  // El panel nunca puede ser más alto que lo que cabe en tu pantalla (con el widget grande, o en pantallas chicas).
  const maximoQueCabe = Math.floor((area.height - altoBase(w)) / escalaActual) - PANEL_SEPARACION;
  const alto = Math.max(PANEL_ALTO_MINIMO, Math.min(Math.round(altoPedido), PANEL_ALTO_MAXIMO, maximoQueCabe));
  const extra = abierto ? px(alto + PANEL_SEPARACION) : 0;
  // El ancho que pide el panel (incluye los márgenes), sin pasar del ancho de la pantalla.
  const anchoPedido = abierto && Number.isFinite(anchoPanel)
    ? Math.min(Math.round(anchoPanel), Math.floor(area.width / escalaActual))
    : 0;
  if (extra === w.expansion.extra && anchoPedido === w.expansion.anchoPanel) {
    return { haciaArriba: w.expansion.haciaArriba, anclaDerecha: w.expansion.anclaDerecha, alto };
  }

  const limiteSuperior = area.y - margen();
  const limiteInferior = area.y + area.height + margen();
  let y = actual.y;

  if (w.expansion.extra === 0) {
    // ABRIR desde cero: ¿cabe arriba? ¿cabe abajo?
    w.expansion.anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;
    const nuevoAlto = actual.height + extra;
    const cabeArriba = actual.y - extra >= limiteSuperior;
    const cabeAbajo = actual.y + nuevoAlto <= limiteInferior;
    if (preferirAbajo && cabeAbajo) {
      w.expansion.haciaArriba = false;
    } else if (cabeArriba) {
      w.expansion.haciaArriba = true;
      y = actual.y - extra;
    } else if (cabeAbajo) {
      w.expansion.haciaArriba = false;
    } else {
      // No cabe en ninguna dirección: se elige el lado con más espacio y la ventana se corre lo justo para que quepa.
      const espacioArriba = actual.y - area.y;
      const espacioAbajo = area.y + area.height - (actual.y + actual.height);
      w.expansion.haciaArriba = espacioArriba >= espacioAbajo;
      const yDeseada = w.expansion.haciaArriba ? actual.y - extra : actual.y;
      y = Math.max(limiteSuperior, Math.min(yDeseada, limiteInferior - nuevoAlto));
    }
  } else if (extra === 0) {
    // CERRAR: si había crecido hacia arriba, la ventana vuelve a bajar a su lugar.
    if (w.expansion.haciaArriba) y = actual.y + w.expansion.extra;
  } else {
    // CAMBIAR de panel con otro abierto (distinto tamaño): se ajusta en el mismo lugar y en la misma dirección.
    const diferencia = extra - w.expansion.extra;
    if (w.expansion.haciaArriba) {
      if (diferencia > 0 && actual.y - diferencia < limiteSuperior) return { haciaArriba: true, noCabe: true, alto };
      y = actual.y - diferencia;
    } else if (diferencia > 0 && actual.y + actual.height + diferencia > limiteInferior) {
      return { haciaArriba: false, noCabe: true, alto };
    }
  }

  w.expansion.extra = extra;
  w.expansion.alto = abierto ? alto : 0;
  w.expansion.anchoPanel = anchoPedido;
  const anchoNuevo = ancho(w);
  // Si cambió el ancho, queda quieto el borde izquierdo o el derecho (el que está más cerca del borde de la pantalla).
  const xDeseada = w.expansion.anclaDerecha ? actual.x + actual.width - anchoNuevo : actual.x;
  const x = Math.max(area.x - margen(), Math.min(xDeseada, area.x + area.width + margen() - anchoNuevo));
  ponerTamano(w, { x, y, width: anchoNuevo, height: altoBase(w) + extra });
  return { haciaArriba: w.expansion.haciaArriba, anclaDerecha: w.expansion.anclaDerecha, alto };
}

// Lo que las pantallas necesitan para escribir sus textos: el idioma activo, su "locale" y todos los textos.
function datosDeIdioma() {
  return { idioma: idiomas.idioma(), locale: idiomas.locale(), textos: idiomas.textos() };
}

function enviarIdioma() {
  for (const w of todasLasVentanas()) if (estaViva(w)) w.ventana.webContents.send('idioma', datosDeIdioma());
}

// Vuelve a escribir los textos que dependen del idioma (nombres de días, "viernes 04:00"...) con los datos ya leídos.
function refrescarTextosDeFechas() {
  for (const [id, lectura] of lecturas) {
    const uso = lectura.uso;
    if (!uso) continue;
    uso.reinicioTexto = textoDeReinicio(uso.reinicio);
    for (const extra of uso.limitesExtra || []) {
      if (extra.credito) escribirTextosDelCredito(extra);
      else extra.reinicioTexto = textoDeReinicio(extra.reinicio);
    }
    if (uso.sesion5h) {
      uso.sesion5h.reinicioTexto = textoDeHora(redondearAlMinuto(uso.sesion5h.reinicio));
    }
    uso.proyeccion = calcularProyecciones(id);
  }
}

// El texto que se ve al dejar el mouse sobre el ícono de la bandeja.
function actualizarTooltip() {
  if (!bandeja) return;
  bandeja.setToolTip(horaActualizada ? t('tray.actualizado', { hora: horaActualizada }) : t('app.nombre'));
}

// Cambia el idioma de toda la app al instante: el menú, el tooltip, las pantallas y los textos con fechas.
function cambiarIdioma(elegido) {
  idiomas.fijar(elegido);
  refrescarTextosDeFechas();
  if (bandeja) construirMenu();
  actualizarTooltip();
  enviarIdioma();
  enviarUso();
}

// La apariencia que se manda a las pantallas: tema, transparencia, vista y orientación.
function aparienciaActual(w) {
  const config = almacen.leer();
  return {
    tema: config.tema,
    opacidad: config.opacidad,
    modo: w.vista.modo,
    orientacion: w.vista.orientacion,
    escala: Math.round(escalaActual * 100),
    todas: todasALaVez(w),             // true = en vez de la tarjeta se ve la lista con todas las cuentas
    sinBarras,                         // true = la tarjeta muestra solo los números, sin barras
    ocultarHoy,                        // true = sin la barra de Hoy (la compacta y la mínima muestran la sesión)
    // cuánto estiraste la ventana de esta vista (la pantalla estira su contenido igual); en la vista completa cuenta también
    // lo que creció por tener muchas cuentas
    extra: { ...extrasDeVista(w), alto: extrasDeVista(w).alto + (esVistaCompleta(w.vista) && !w.parte ? extraDeCompletoPorCuentas() : 0) },
    extraPorCuentas: esVistaCompleta(w.vista) && !w.parte ? extraDeCompletoPorCuentas() : 0, // la parte de ese alto que es por tener muchas cuentas
    recorteTablero: recorteDelTablero(w),  // cuánto se achicó la sección de gráficos del panel de control para caber en la pantalla
    redimensionando: Boolean(w.redimension), // true mientras estás arrastrando un borde
    altoPanel: w.expansion.alto || null, // alto del panel abierto (puede achicarse si ya no cabe en la pantalla)
    anchoPanel: w.expansion.anchoPanel || 0, // ancho del panel abierto, si es más ancho que la vista
    paneles: tamanosDePaneles(),      // el tamaño que le diste a cada panel desplegado: { historial: { ancho, alto }, ... }
    formatoReinicio: config.formatoReinicio, // 'relativo' (en 2 h 15 min) u 'hora' (15:06)
    anchoVista: medidasDeVista(w).ancho, // ancho de la tarjeta: no crece aunque un panel (Ajustes) sea más ancho
    altoLista: medidasSinChats(w, w.vista).alto, // alto de la lista de cuentas (todas a la vez): no se estira cuando crece la ventana
    colores: config.colores,          // colores propios, o null
  };
}

// Los tamaños guardados de los paneles desplegados (los que estiraste arrastrando un borde con el panel abierto).
function tamanosDePaneles() {
  const paneles = {};
  for (const [clave, tamano] of Object.entries(tamanosGuardados)) {
    if (clave.startsWith('panel-') && tamano) paneles[clave.slice(6)] = { ancho: tamano.ancho || 0, alto: tamano.alto || 0 };
  }
  return paneles;
}

// Avisa a la pantalla del widget que la apariencia cambió.
function enviarApariencia(w) {
  if (w.ventana && !w.ventana.isDestroyed()) w.ventana.webContents.send('apariencia', aparienciaActual(w));
}

// Cambia el tamaño del widget (porcentaje: 100 = normal). El widget no se corre de lugar: queda quieto el
// borde que está más cerca del borde de la pantalla (el de la izquierda o el de la derecha, y el de arriba
// o el de abajo; con un panel abierto se sigue la dirección del panel). Después se revisa que no se salga de la pantalla.
// La escala es la misma para todas las ventanas.
function aplicarEscala(porcentaje) {
  const nueva = porcentaje / 100;
  if (nueva === escalaActual) return;
  escalaActual = nueva;
  almacen.guardar({ escala: porcentaje });
  for (const w of todasLasVentanas()) if (estaViva(w)) aplicarEscalaA(w);
  if (bandeja) construirMenu();
}

function aplicarEscalaA(w) {
  const nueva = escalaActual;
  const actual = w.ventana.getBounds();
  const area = screen.getDisplayMatching(actual).workArea;
  const anclaAbajo = w.expansion.extra > 0
    ? w.expansion.haciaArriba
    : actual.y + actual.height / 2 > area.y + area.height / 2;
  const anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;

  // Si hay un panel abierto, se recalcula con la escala nueva (y se achica si ya no cabe en la pantalla).
  if (w.expansion.alto > 0) {
    const maximoQueCabe = Math.floor((area.height - altoBase(w)) / escalaActual) - PANEL_SEPARACION;
    w.expansion.alto = Math.max(PANEL_ALTO_MINIMO, Math.min(w.expansion.alto, maximoQueCabe));
    w.expansion.extra = px(w.expansion.alto + PANEL_SEPARACION);
  }

  const anchoNuevo = ancho(w);
  const altoNuevo = altoBase(w) + w.expansion.extra;
  const dentro = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));
  const x = dentro(
    anclaDerecha ? actual.x + actual.width - anchoNuevo : actual.x,
    area.x - margen(), area.x + area.width + margen() - anchoNuevo
  );
  const y = dentro(
    anclaAbajo ? actual.y + actual.height - altoNuevo : actual.y,
    area.y - margen(), area.y + area.height + margen() - altoNuevo
  );

  w.ventana.webContents.setZoomFactor(nueva);
  ponerTamano(w, { x, y, width: anchoNuevo, height: altoNuevo });
  enviarApariencia(w);
}

// Cambia la vista del widget (normal, compacto o completo) y/o su orientación (vertical u horizontal).
//
// La tarjeta NO se mueve de lugar: queda quieto el borde donde está anclado el widget (el de arriba o el de abajo,
// y el de la izquierda o el de la derecha, según en qué mitad de la pantalla esté).
//   - Si solo cambia el ALTO (compacto <-> normal vertical): la tarjeta se anima como un despliegue. La ventana se
//     agranda ANTES de que la tarjeta crezca y se achica DESPUÉS de que la tarjeta termina de encogerse.
//   - Si cambia el ANCHO (horizontal, completo...): el contenido se desvanece un instante, la ventana cambia de
//     tamaño en ese momento, y el contenido vuelve a aparecer.
// Si había un panel desplegado, primero se cierra.
const DURACION_FUNDIDO_MS = 140;    // el contenido se desvanece un instante al cambiar de vista (ver widget.js)
const DURACION_TARJETA_MS = 300;    // lo que tarda la tarjeta en cambiar de alto (ver widget.css)
const DURACION_CIERRE_PANEL_MS = 480; // lo que tarda en cerrarse un panel desplegado (animación + ventana)

function cambiarVista(w, pedida) {
  const destino = {
    modo: pedida.modo || w.vista.modo,
    orientacion: pedida.orientacion || w.vista.orientacion,
  };
  if (destino.modo === w.vista.modo && destino.orientacion === w.vista.orientacion) return;
  if (w.cambiandoDeVista) return;
  w.cambiandoDeVista = true;

  const anchoAntes = ancho(w);
  const anchoDespues = px(Math.max(medidasDeVista(w, destino).ancho + 2 * MARGEN, w.expansion.anchoPanel));
  const mismoAncho = anchoDespues === anchoAntes;

  // Con un panel desplegado y un cambio de ancho (o con un panel ancho, como Ajustes): se cierra el panel y se vuelve a intentar.
  if (w.expansion.extra > 0 && (!mismoAncho || w.expansion.anchoPanel > 0)) {
    w.ventana.webContents.send('cerrar-panel');
    setTimeout(() => { w.cambiandoDeVista = false; cambiarVista(w, destino); }, DURACION_CIERRE_PANEL_MS);
    return;
  }

  w.vista = destino;
  guardarDeVentana(w, { modo: destino.modo, orientacion: destino.orientacion });
  if (bandeja) construirMenu();

  const actual = w.ventana.getBounds();
  const area = screen.getDisplayMatching(actual).workArea;
  const nuevoAlto = altoBase(w) + w.expansion.extra;

  // ¿Qué bordes quedan quietos? Con un panel abierto, el mismo en que creció el panel; si no, según la mitad de la pantalla.
  const anclaAbajo = w.expansion.extra > 0
    ? w.expansion.haciaArriba
    : actual.y + actual.height / 2 > area.y + area.height / 2;
  const anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;
  const dentro = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));
  const x = dentro(
    anclaDerecha ? actual.x + actual.width - anchoDespues : actual.x,
    area.x - margen(), area.x + area.width + margen() - anchoDespues
  );
  const y = dentro(
    anclaAbajo ? actual.y + actual.height - nuevoAlto : actual.y,
    area.y - margen(), area.y + area.height + margen() - nuevoAlto
  );
  const cambiarTamano = () => {
    if (!w.ventana.isDestroyed()) ponerTamano(w, { x, y, width: anchoDespues, height: nuevoAlto });
  };

  // 1. La pantalla acomoda la tarjeta contra el borde que queda quieto (todavía no se nota nada).
  if (!w.ventana.isDestroyed()) w.ventana.webContents.send('ancla', anclaAbajo);

  let duracionTotal;
  if (!mismoAncho) {
    // Cambia el ancho: el contenido se desvanece, y a mitad del desvanecido la ventana cambia de tamaño.
    enviarApariencia(w);
    setTimeout(cambiarTamano, DURACION_FUNDIDO_MS + 20);
    duracionTotal = DURACION_FUNDIDO_MS + 400;
  } else if (nuevoAlto < actual.height) {
    // Achicar: primero la tarjeta se encoge dentro de la ventana grande, y al final se achica la ventana.
    setTimeout(() => enviarApariencia(w), 50);
    setTimeout(cambiarTamano, 50 + DURACION_FUNDIDO_MS + DURACION_TARJETA_MS + 80);
    duracionTotal = 50 + DURACION_FUNDIDO_MS + DURACION_TARJETA_MS + 200;
  } else {
    // Agrandar: primero crece la ventana (la tarjeta sigue chica) y después la tarjeta se despliega.
    setTimeout(cambiarTamano, 50);
    setTimeout(() => enviarApariencia(w), 110);
    duracionTotal = 50 + DURACION_FUNDIDO_MS + DURACION_TARJETA_MS + 200;
  }
  setTimeout(() => { w.cambiandoDeVista = false; }, duracionTotal);
}

// Si cambia la cantidad de cuentas (o el ajuste de verlas todas a la vez), la ventana cambia de tamaño.
// Queda quieto el borde de la pantalla más cercano (el de arriba o el de abajo, el izquierdo o el derecho; con un panel
// abierto, el mismo lado hacia donde creció el panel).
function reajustarTodas() {
  for (const w of todasLasVentanas()) reajustarLaVentana(w);
}

function reajustarLaVentana(w) {
  if (!w.ventana || w.ventana.isDestroyed()) return;
  const actual = w.ventana.getBounds();
  const anchoNuevo = ancho(w);
  const altoNuevo = altoBase(w) + w.expansion.extra;
  if (anchoNuevo === actual.width && altoNuevo === actual.height) return;
  const area = screen.getDisplayMatching(actual).workArea;
  const anclaAbajo = w.expansion.extra > 0 ? w.expansion.haciaArriba : actual.y + actual.height / 2 > area.y + area.height / 2;
  const anclaDerecha = actual.x + actual.width / 2 > area.x + area.width / 2;
  const dentro = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));
  const x = dentro(anclaDerecha ? actual.x + actual.width - anchoNuevo : actual.x, area.x - margen(), area.x + area.width + margen() - anchoNuevo);
  const y = dentro(anclaAbajo ? actual.y + actual.height - altoNuevo : actual.y, area.y - margen(), area.y + area.height + margen() - altoNuevo);
  ponerTamano(w, { x, y, width: anchoNuevo, height: altoNuevo });
  enviarApariencia(w);
}

// ----- Estirar la ventana arrastrando sus bordes -----
// Los bordes (y esquinas) de la pantalla avisan cuándo empieza y termina el arrastre; mientras tanto, aquí se mira
// dónde está el mouse y se va cambiando el tamaño. Queda quieto el borde contrario al que arrastras.
// (w.redimension = { borde, inicio, cursor, area, clave, temporizador } mientras se arrastra)

// Con un panel desplegado: a lo alto se estira ese panel (cada panel recuerda su alto); a lo ancho se estira TODO
// (la tarjeta, el contexto y el panel juntos: es el ancho de la vista, y queda así al cerrar el panel).
// "minimos" es el tamaño de siempre del panel ({ alto, ancho }), que la pantalla manda para que no quede más chico que eso.
// (En la vista completa los paneles están siempre a la vista: ahí se estira la vista, sin ningún panel abierto encima.)
function empezarRedimension(w, borde, minimos) {
  if (w.redimension || !w.ventana || w.ventana.isDestroyed()) return;
  if (typeof borde !== 'string' || !/^(n|s|e|w|ne|nw|se|sw)$/.test(borde)) return;
  const conPanel = w.expansion.extra > 0;
  if (conPanel && (esVistaCompleta(w.vista) || !/^[a-z]{3,20}$/.test(w.panelAbierto || ''))) return;
  const inicio = w.ventana.getBounds();
  const numero = (valor) => (Number.isFinite(valor) && valor > 0 ? Math.round(valor) : 0);
  w.redimension = {
    borde,
    inicio,
    cursor: screen.getCursorScreenPoint(),
    area: screen.getDisplayMatching(inicio).workArea,
    clave: conPanel ? 'panel-' + w.panelAbierto : claveDeTamano(w),
    claveDeLaVista: claveDeTamano(w),
    // El panel nunca queda más chico que su tamaño de siempre (ni que como está ahora, si la pantalla ya lo había achicado)
    panel: conPanel
      ? { alto: Math.max(PANEL_ALTO_MINIMO, Math.min(numero(minimos && minimos.alto) || PANEL_ALTO_MINIMO, w.expansion.alto)), ancho: numero(minimos && minimos.ancho) }
      : null,
    temporizador: setInterval(() => moverRedimension(w), 16),
  };
}

function moverRedimension(w) {
  if (!w.redimension || !w.ventana || w.ventana.isDestroyed()) return terminarRedimension(w);
  const { borde, inicio, cursor, area, clave, panel, claveDeLaVista } = w.redimension;
  const punto = screen.getCursorScreenPoint();
  const dx = punto.x - cursor.x;
  const dy = punto.y - cursor.y;
  const base = medidasBase(w);
  // Con un panel abierto: la ventana mide la tarjeta más el panel. A lo alto cambia el panel; a lo ancho, la vista entera.
  const minAncho = panel ? Math.max(px(base.ancho + 2 * MARGEN), px(panel.ancho)) : px(base.ancho + 2 * MARGEN);
  const minAlto = panel ? altoBase(w) + px(panel.alto + PANEL_SEPARACION) : px(base.alto + 2 * MARGEN);
  const maxAncho = area.width + 2 * margen();
  const maxAlto = panel ? Math.min(area.height + 2 * margen(), altoBase(w) + px(PANEL_ALTO_MAXIMO + PANEL_SEPARACION)) : area.height + 2 * margen();
  const entre = (valor, minimo, maximo) => Math.max(minimo, Math.min(valor, maximo));

  let { x, y, width, height } = inicio;
  if (borde.includes('e')) width = entre(inicio.width + dx, minAncho, maxAncho);
  if (borde.includes('w')) {
    width = entre(inicio.width - dx, minAncho, maxAncho);
    x = inicio.x + inicio.width - width;
  }
  if (panel) {
    if (borde.includes('s')) height = entre(inicio.height + dy, minAlto, Math.max(minAlto, maxAlto));
    if (borde.includes('n')) {
      height = entre(inicio.height - dy, minAlto, Math.max(minAlto, maxAlto));
      y = inicio.y + inicio.height - height;
    }
    w.expansion.extra = height - altoBase(w);
    w.expansion.alto = Math.round(w.expansion.extra / escalaActual) - PANEL_SEPARACION;
    tamanosGuardados[clave] = { ancho: 0, alto: w.expansion.alto };
    // El ancho es de la vista: la tarjeta se ensancha con el panel (un panel que de por sí es más ancho, como Ajustes, sigue pidiendo el suyo)
    if (borde.includes('e') || borde.includes('w')) {
      const anterior = tamanosGuardados[claveDeLaVista] || {};
      tamanosGuardados[claveDeLaVista] = { ancho: Math.max(0, Math.round(width / escalaActual) - 2 * MARGEN - base.ancho), alto: anterior.alto || 0 };
    }
    w.ventana.setBounds({ x, y, width, height });
    enviarApariencia(w);
    return;
  }
  if (permiteAlto(w)) {
    if (borde.includes('s')) height = entre(inicio.height + dy, minAlto, maxAlto);
    if (borde.includes('n')) {
      height = entre(inicio.height - dy, minAlto, maxAlto);
      y = inicio.y + inicio.height - height;
    }
  }

  tamanosGuardados[clave] = {
    ancho: Math.round((width - minAncho) / escalaActual),
    alto: Math.round((height - minAlto) / escalaActual),
  };
  w.ventana.setBounds({ x, y, width, height });
  enviarApariencia(w);
}

function terminarRedimension(w) {
  if (!w.redimension) return;
  clearInterval(w.redimension.temporizador);
  w.redimension = null;
  almacen.guardar({ tamanos: tamanosGuardados });
  enviarApariencia(w);
  despejarAlrededor(w); // si al crecer quedó encima de otra ventana de la app, esa se corre
}

// Vuelve la ventana de la vista actual a su tamaño de siempre.
// Con un panel desplegado, el que vuelve a su tamaño de siempre es ese panel (la pantalla pide después ese tamaño).
function restablecerTamano(w) {
  if (w.redimension) return;
  if (w.expansion.extra > 0) {
    if (esVistaCompleta(w.vista) || !w.panelAbierto) return;
    delete tamanosGuardados['panel-' + w.panelAbierto];
    almacen.guardar({ tamanos: tamanosGuardados });
    enviarApariencia(w);
    return;
  }
  delete tamanosGuardados[claveDeTamano(w)];
  almacen.guardar({ tamanos: tamanosGuardados });
  reajustarLaVentana(w);
  enviarApariencia(w);
}

// Crea la ventana del widget.
function crearVentana(w) {
  const posicion = calcularPosicionInicial(w);

  w.ventana = new BrowserWindow({
    width: ancho(w),
    height: altoBase(w),
    x: posicion.x,
    y: posicion.y,
    frame: false,        // sin bordes ni barra de título
    transparent: true,   // permite las esquinas redondeadas (las dibuja el CSS)
    resizable: false,    // el tamaño es fijo
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,   // no aparece en la barra de tareas; se controla desde la bandeja
    hasShadow: false,
    alwaysOnTop: almacen.leer().siempreEncima,
    title: t('app.nombre'),
    show: false,                  // aparece recién cuando ya está dibujada (así no se ve un destello al abrirla)
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // puente seguro hacia la pantalla
      // En las pruebas invisibles las ventanas están tapadas y Windows las 'duerme': así siguen contestando
      backgroundThrottling: !INVISIBLE,
    },
  });

  w.ventana.setMenuBarVisibility(false);
  if (INVISIBLE) {
    w.ventana.setOpacity(0);
    w.ventana.setIgnoreMouseEvents(true);
  }
  // "Siempre encima": se vuelve a afirmar cada vez que la ventana aparece (al mostrarla desde la bandeja, al abrir Claude...)
  ponerEncima(w, almacen.leer().siempreEncima);
  w.ventana.on('show', () => ponerEncima(w, almacen.leer().siempreEncima));
  if (w === principal) w.ventana.on('show', retomarConsultas); // al volver a mostrarla, se retoman las consultas
  // Cada vez que la pantalla del widget termina de cargar, se le aplica el tamaño elegido (zoom).
  w.ventana.webContents.on('did-finish-load', () => w.ventana.webContents.setZoomFactor(escalaActual));
  w.ventana.loadFile(path.join(__dirname, 'ventanas', 'widget.html'), w.parte ? { query: { parte: w.parte } } : {});
  w.ventana.once('ready-to-show', () => {
    // Las ventanas propias de las cuentas solo aparecen si la principal está a la vista (si no, se muestran con ella).
    // (y con "mostrar solo mientras Claude está abierto", si Claude está cerrado al arrancar, el widget parte oculto)
    const esperaAClaude = almacen.leer().seguirAClaude && claudeAbierto === false;
    if (estaViva(w) && !esperaAClaude && (w === principal || principal.ventana.isVisible())) w.ventana.show();
  });

  // Cada vez que se mueve la ventana, guardamos su posición.
  // Esperamos 400 ms desde el último movimiento para no escribir el archivo cientos de veces mientras arrastras.
  let temporizador = null;
  // Al soltarla: si quedó encima de otra ventana de la app, se acomoda al lado (y se imanta a los bordes cercanos).
  w.ventana.on('moved', () => acomodarSinTapar(w));
  w.ventana.on('move', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (!w.ventana || w.ventana.isDestroyed()) return;
      const [x, y] = w.ventana.getPosition();
      // Se guarda donde estaría la ventana SIN el panel abierto (si creció hacia arriba, su borde de arriba subió).
      const yBase = w.expansion.haciaArriba ? y + w.expansion.extra : y;
      guardarDeVentana(w, { posicion: { x, y: yBase } });
    }, 400);
  });
}

// ----- Ventanas que no se tapan -----
// Al soltar una ventana encima de otra de la app, se corre lo mínimo para quedar al lado (izquierda, derecha, arriba o abajo),
// sin salirse de la pantalla. Además, si queda cerca del borde de otra, se pega a ella (como un imán) y se alinea.
const SEPARACION_ENTRE_VENTANAS = 6;
const DISTANCIA_DEL_IMAN = 16;

// El lugar que ocupa una ventana. Con Ajustes abierto cuenta solo el widget (sin Ajustes), porque Ajustes sí puede tapar a otras.
function espacioDe(otra) {
  const b = otra.ventana.getBounds();
  if (otra.panelAbierto !== 'ajustes' || otra.expansion.extra === 0) return b;
  const anchoSinPanel = px(medidasDeVista(otra).ancho + 2 * MARGEN);
  return {
    x: otra.expansion.anclaDerecha ? b.x + b.width - anchoSinPanel : b.x,
    y: otra.expansion.haciaArriba ? b.y + otra.expansion.extra : b.y,
    width: anchoSinPanel,
    height: b.height - otra.expansion.extra,
  };
}

// Si una ventana creció y ahora tapa a otras, esas otras se corren al lado (Ajustes abierto no empuja a nadie).
function despejarAlrededor(w) {
  if (!estaViva(w) || w.panelAbierto === 'ajustes') return;
  const b = w.ventana.getBounds();
  for (const otra of todasLasVentanas()) {
    if (otra === w || !estaViva(otra) || !otra.ventana.isVisible() || otra.redimension) continue;
    const o = espacioDe(otra);
    if (o.x < b.x + b.width && o.x + o.width > b.x && o.y < b.y + b.height && o.y + o.height > b.y) acomodarSinTapar(otra, true);
  }
}

// "soloSiTapa": solo correrla si está encima de otra (sin imán); se usa cuando la que cambió fue otra ventana.
function acomodarSinTapar(w, soloSiTapa = false) {
  if (!estaViva(w) || w.redimension || w.acomodando) return;
  const b = espacioDe(w);
  const area = screen.getDisplayMatching(b).workArea;
  const otras = todasLasVentanas()
    .filter((otra) => otra !== w && estaViva(otra) && otra.ventana.isVisible())
    .map(espacioDe);
  const SEP = SEPARACION_ENTRE_VENTANAS;
  const tapa = (x, y, o) => x < o.x + o.width && x + b.width > o.x && y < o.y + o.height && y + b.height > o.y;
  const cabe = (p) => p.x >= area.x - 2 && p.y >= area.y - 2 && p.x + b.width <= area.x + area.width + 2 && p.y + b.height <= area.y + area.height + 2;
  let { x, y } = b;
  if (soloSiTapa && !otras.some((o) => tapa(x, y, o))) return;

  // 1. Imán: cerca del borde de otra ventana, se pega a ella; y si están lado a lado, se alinean arriba (o abajo).
  for (const o of soloSiTapa ? [] : otras) {
    const mismaAltura = y < o.y + o.height + DISTANCIA_DEL_IMAN && y + b.height > o.y - DISTANCIA_DEL_IMAN;
    const mismaColumna = x < o.x + o.width + DISTANCIA_DEL_IMAN && x + b.width > o.x - DISTANCIA_DEL_IMAN;
    if (mismaAltura) {
      if (Math.abs(x - (o.x + o.width + SEP)) < DISTANCIA_DEL_IMAN) x = o.x + o.width + SEP;
      else if (Math.abs(x + b.width + SEP - o.x) < DISTANCIA_DEL_IMAN) x = o.x - b.width - SEP;
      if (x === o.x + o.width + SEP || x === o.x - b.width - SEP) {
        if (Math.abs(y - o.y) < DISTANCIA_DEL_IMAN) y = o.y;
        else if (Math.abs(y + b.height - (o.y + o.height)) < DISTANCIA_DEL_IMAN) y = o.y + o.height - b.height;
      }
    }
    if (mismaColumna) {
      if (Math.abs(y - (o.y + o.height + SEP)) < DISTANCIA_DEL_IMAN) y = o.y + o.height + SEP;
      else if (Math.abs(y + b.height + SEP - o.y) < DISTANCIA_DEL_IMAN) y = o.y - b.height - SEP;
      if (y === o.y + o.height + SEP || y === o.y - b.height - SEP) {
        if (Math.abs(x - o.x) < DISTANCIA_DEL_IMAN) x = o.x;
        else if (Math.abs(x + b.width - (o.x + o.width)) < DISTANCIA_DEL_IMAN) x = o.x + o.width - b.width;
      }
    }
  }

  // 2. Sin tapar: si todavía queda encima de otra, se corre al lado más cercano donde quepa (varias vueltas por si hay más ventanas).
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const o = otras.find((otra) => tapa(x, y, otra));
    if (!o) break;
    const opciones = [
      { x: o.x - b.width - SEP, y }, { x: o.x + o.width + SEP, y },
      { x, y: o.y - b.height - SEP }, { x, y: o.y + o.height + SEP },
    ].filter(cabe).filter((p) => !otras.some((otra) => otra !== o && tapa(p.x, p.y, otra)));
    if (opciones.length === 0) break;
    opciones.sort((p, q) => (Math.abs(p.x - x) + Math.abs(p.y - y)) - (Math.abs(q.x - x) + Math.abs(q.y - y)));
    ({ x, y } = opciones[0]);
  }

  if (x !== b.x || y !== b.y) {
    w.acomodando = true;
    const real = w.ventana.getBounds(); // (b puede ser el espacio sin Ajustes: se mueve la ventana entera lo mismo)
    w.ventana.setPosition(Math.round(real.x + x - b.x), Math.round(real.y + y - b.y));
    setTimeout(() => { w.acomodando = false; }, 300);
  }
}

// ----- Partes separadas en su propia ventana -----
// El historial, el desglose, la proyección y la ventana de contexto se pueden sacar del widget (botón junto a la X del panel)
// y ponerlas donde quieras. Con la X de esa ventana vuelven al widget. Se recuerdan al cerrar y abrir la app.
// "cuentaId": la cuenta de la ventana de donde sale (null = el widget principal). Los chats siempre son del principal.
function separarParte(parte, cuentaId = null) {
  if (!PARTES_SEPARABLES.includes(parte) || !estaViva(principal)) return;
  if (parte === 'chats') cuentaId = null;
  if (cuentaId && !almacen.cuenta(cuentaId)) return;
  const clave = claveDeParte(parte, cuentaId);
  if (partes.has(clave)) {
    partes.get(clave).ventana.show();
    return;
  }
  const w = nuevoWidget(cuentaId);
  w.parte = parte;
  w.clave = clave;
  partes.set(clave, w);
  crearVentana(w);
  guardarDeVentana(w, { abierta: true });
  // Se acomoda al aparecer y otra vez cuando ya tomó su tamaño final (el contenido la agranda después de cargar)
  w.ventana.once('ready-to-show', () => {
    setTimeout(() => acomodarSinTapar(w), 50);
    setTimeout(() => acomodarSinTapar(w, true), 700);
  });
  if (parte === 'chats') reajustarLaVentana(principal); // los chats salen del widget principal
  enviarUso();
}

function juntarParte(clave) {
  const w = partes.get(clave);
  if (!w) return;
  partes.delete(clave);
  guardarDeVentana(w, { abierta: false });
  if (estaViva(w)) w.ventana.destroy();
  if (w.parte === 'chats') reajustarLaVentana(principal); // los chats vuelven al widget principal
  enviarUso();
}

// Si se elimina una cuenta, sus partes separadas se cierran.
function cerrarPartesDeCuentasEliminadas() {
  for (const [clave, w] of partes) {
    if (w.cuentaId && !almacen.cuenta(w.cuentaId)) {
      partes.delete(clave);
      if (estaViva(w)) w.ventana.destroy();
    }
  }
}

// Al abrir la app: las partes que habías dejado separadas.
function abrirPartesGuardadas() {
  const guardadas = almacen.leer().partes || {};
  for (const [clave, datos] of Object.entries(guardadas)) {
    if (!datos || !datos.abierta) continue;
    const [cuenta, parte] = clave.split(':');
    separarParte(parte, cuenta === 'principal' ? null : cuenta);
  }
}

// Muestra las ventanas si están ocultas, y las oculta si están visibles (todas juntas, según la principal).
function mostrarOcultar() {
  const ocultar = principal.ventana.isVisible();
  for (const w of todasLasVentanas()) {
    if (!estaViva(w)) continue;
    if (ocultar) w.ventana.hide();
    else w.ventana.show();
  }
}

// ----- Mostrar solo mientras Claude está abierto (opción de Ajustes) -----
// Cada 5 segundos se mira si Claude está abierto (la app de escritorio o Claude Code). Cuando se abre, el widget aparece;
// cuando se cierra, se oculta (Headroom sigue en la bandeja, y con el widget oculto no consulta nada).
// Solo se actúa cuando CAMBIA: si lo muestras u ocultas a mano mientras tanto, se respeta.
let claudeAbierto = null; // true / false; null = todavía no se sabe (o la opción está apagada)

async function seguirAClaude() {
  if (!almacen.leer().seguirAClaude) {
    claudeAbierto = null;
    return;
  }
  const abierto = await claudeEstaAbierto();
  if (abierto === null || abierto === claudeAbierto || !estaViva(principal)) return;
  const primeraVez = claudeAbierto === null;
  claudeAbierto = abierto;
  const visible = principal.ventana.isVisible();
  // (la primera vez que se mira, por ejemplo al activar la opción, no se oculta: sería raro que desaparezca al guardar)
  if ((abierto && !visible) || (!abierto && visible && !primeraVez)) mostrarOcultar();
}

// Deja una ventana por encima de las demás (o no). Se usa el nivel más alto de Windows: con el nivel normal, otra ventana
// que también esté "siempre encima" (o una a pantalla completa) podía tapar el widget.
function ponerEncima(w, activar) {
  if (!estaViva(w)) return;
  if (activar) w.ventana.setAlwaysOnTop(true, 'screen-saver');
  else w.ventana.setAlwaysOnTop(false);
}

// Activa o desactiva "siempre encima" y lo recuerda para la próxima vez.
function cambiarSiempreEncima(activar) {
  for (const w of todasLasVentanas()) if (estaViva(w)) ponerEncima(w, activar);
  almacen.guardar({ siempreEncima: activar });
}

// Pide al widget principal que despliegue uno de sus paneles: 'historial', 'desglose', 'proyeccion' o 'ajustes'.
// Si el widget estaba oculto, lo muestra.
function pedirPanel(nombre) {
  if (!principal.ventana.isVisible()) principal.ventana.show();
  // En el modo mínimo no cabe un panel: primero vuelve a la vista normal.
  if (principal.vista.modo === 'mini') {
    cambiarVista(principal, { modo: 'normal' });
    setTimeout(() => principal.ventana.webContents.send('abrir-panel', nombre), 700);
    return;
  }
  principal.ventana.webContents.send('abrir-panel', nombre);
}

// Los ajustes tal como los muestra el panel de Ajustes de una ventana (los límites son los de la cuenta que muestra).
function ajustesActuales(w) {
  const config = almacen.leer();
  const cuenta = almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva();
  return {
    limiteDiario: cuenta.limiteDiario,   // los límites son de la cuenta que se muestra
    umbralAviso: cuenta.umbralAviso,
    nombreDeCuenta: nombreSiHayVarias(cuenta) || null,
    todasLasCuentas: verTodasLasCuentas,
    ventanasSeparadas,
    intervaloMin: Math.max(5, config.intervaloMin), // (si quedó guardado uno menor de una versión anterior, se muestra el mínimo)
    limitesPorDia: cuenta.limitesPorDia,
    limiteAutomatico: Boolean(cuenta.limiteAutomatico),
    limiteDeHoy: (lecturaDe(cuenta.id).uso || {}).limiteDiario ?? null, // el límite que rige hoy (para mostrar el automático)
    alertasSesion: config.alertasSesion,
    umbralSesion: config.umbralSesion,
    alertasSemana: config.alertasSemana,
    umbralSemana: config.umbralSemana,
    contextoVisible: config.contextoVisible,
    avisoContexto: config.avisoContexto,
    umbralContexto: config.umbralContexto,
    tamanoContexto: config.tamanoContexto,
    avisoRitmo: config.avisoRitmo,
    iconoDeColor: config.iconoDeColor,
    atajoGlobal: config.atajoGlobal,
    buscarActualizaciones: config.buscarActualizaciones,
    pausarOculto: config.pausarOculto !== false,
    resumenes: config.resumenes !== false,
    seguirAClaude: config.seguirAClaude === true,
    consultaRapida: config.consultaRapida === true,
    avisoRitmoSemana: config.avisoRitmoSemana !== false,
    sinBarras,
    formatoReinicio: config.formatoReinicio,
    colores: config.colores,
    siempreEncima: config.siempreEncima,
    arrancarConWindows: ajustes.arrancaConWindows(),
    tema: config.tema,
    opacidad: config.opacidad,
    modo: w.vista.modo,
    orientacion: w.vista.orientacion,
    idioma: config.idioma,
    escala: Math.round(escalaActual * 100),
    opcionesIntervalo: ajustes.OPCIONES_INTERVALO,
    // Acerca de: la versión instalada, quién la hizo y, si ya se encontró, la versión nueva que espera
    version: app.getVersion(),
    autor: AUTOR,
    versionNueva: actualizaciones.estado.versionNueva ? actualizaciones.estado.versionNueva.version : null,
  };
}

// Revisa y guarda los ajustes nuevos, y los aplica AL INSTANTE (sin reiniciar la app).
function guardarAjustes(w, datos) {
  const revision = ajustes.validar(datos);
  if (!revision.ok) return revision;
  const nuevos = revision.valores;
  const idiomaAntes = almacen.leer().idioma;

  const cuenta = almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva();
  almacen.guardarCuenta(cuenta.id, {
    limiteDiario: nuevos.limiteDiario,
    umbralAviso: nuevos.umbralAviso,
    limitesPorDia: nuevos.limitesPorDia,
    limiteAutomatico: nuevos.limiteAutomatico,
  });
  almacen.guardar({
    todasLasCuentas: nuevos.todasLasCuentas,
    ventanasSeparadas: nuevos.ventanasSeparadas,
    intervaloMin: nuevos.intervaloMin,
    alertasSesion: nuevos.alertasSesion,
    umbralSesion: nuevos.umbralSesion,
    alertasSemana: nuevos.alertasSemana,
    umbralSemana: nuevos.umbralSemana,
    contextoVisible: nuevos.contextoVisible,
    avisoContexto: nuevos.avisoContexto,
    umbralContexto: nuevos.umbralContexto,
    tamanoContexto: nuevos.tamanoContexto,
    avisoRitmo: nuevos.avisoRitmo,
    iconoDeColor: nuevos.iconoDeColor,
    atajoGlobal: nuevos.atajoGlobal,
    buscarActualizaciones: nuevos.buscarActualizaciones,
    pausarOculto: nuevos.pausarOculto,
    resumenes: nuevos.resumenes,
    seguirAClaude: nuevos.seguirAClaude,
    consultaRapida: nuevos.consultaRapida,
    avisoRitmoSemana: nuevos.avisoRitmoSemana,
    sinBarras: nuevos.sinBarras,
    ocultarHoy: nuevos.ocultarHoy,
    formatoReinicio: nuevos.formatoReinicio,
    colores: nuevos.colores,
    siempreEncima: nuevos.siempreEncima,
    tema: nuevos.tema,
    idioma: nuevos.idioma,
    opacidad: nuevos.opacidad,
  });

  // Idioma: se aplica al instante en todo (menú, tooltip, pantallas y avisos).
  if (nuevos.idioma !== idiomaAntes) cambiarIdioma(nuevos.idioma);

  // Tamaño del widget: se aplica al instante (el widget queda quieto en su borde más cercano de la pantalla).
  if (nuevos.escala !== Math.round(escalaActual * 100)) aplicarEscala(nuevos.escala);

  // Solo números (sin barras) y ocultar Hoy: la tarjeta cambia de alto.
  if (nuevos.sinBarras !== sinBarras || nuevos.ocultarHoy !== ocultarHoy) {
    sinBarras = nuevos.sinBarras;
    ocultarHoy = nuevos.ocultarHoy;
    reajustarTodas();
    for (const otra of todasLasVentanas()) enviarApariencia(otra);
  }
  // Ver todas las cuentas a la vez: cambia el tamaño de la ventana (en la vista normal y en la compacta).
  if (nuevos.todasLasCuentas !== verTodasLasCuentas) {
    verTodasLasCuentas = nuevos.todasLasCuentas;
    reajustarTodas();
  }
  // Cada cuenta en su propia ventana: se abren o se cierran las ventanas de las demás cuentas.
  if (nuevos.ventanasSeparadas !== ventanasSeparadas) {
    ventanasSeparadas = nuevos.ventanasSeparadas;
    sincronizarVentanas();
    reajustarTodas();
  }

  // Apariencia: tema y transparencia al instante; la vista y la orientación cambian el tamaño de la ventana.
  if (nuevos.modo !== w.vista.modo || nuevos.orientacion !== w.vista.orientacion) {
    cambiarVista(w, { modo: nuevos.modo, orientacion: nuevos.orientacion }); // también avisa a las pantallas
  } else {
    enviarApariencia(w);
  }

  // Siempre encima: se aplica a la ventana y se actualiza la casilla del menú de la bandeja.
  cambiarSiempreEncima(nuevos.siempreEncima);

  // Arrancar con Windows: solo se toca si cambió.
  if (nuevos.arrancarConWindows !== ajustes.arrancaConWindows()) {
    ajustes.cambiarArranqueConWindows(nuevos.arrancarConWindows);
  }

  // Intervalo: la próxima consulta se reprograma con el valor nuevo (y si estaba en pausa y apagaste la opción, se retoma).
  programarProximaConsulta();
  retomarConsultas();

  seguirAClaude(); // (si se acaba de activar la opción y Claude está abierto, el widget queda a la vista)
  // Ícono de la bandeja, atajo de teclado y búsqueda de actualizaciones: al instante.
  actualizarIconoDeBandeja();
  aplicarAtajoGlobal();
  if (nuevos.buscarActualizaciones) buscarVersionNueva();
  // Contexto de Claude Code: se vuelve a mirar con los ajustes nuevos (el umbral nuevo empieza de cero).
  avisosDeChats.clear();
  chatsActuales = [];
  revisarContexto();

  // Límite y aviso: se recalcula con el último dato, para que la barra y las alertas
  // reflejen el nuevo límite de inmediato (sin esperar a la próxima consulta).
  const lectura = lecturaDe(cuenta.id);
  if (lectura.uso) {
    const recalculado = registrarLectura(almacen.cuenta(cuenta.id), lectura.uso.semana, lectura.inicioSemana, lectura.reinicioSemana);
    lectura.uso.hoy = recalculado.hoy;
    lectura.uso.limiteDiario = recalculado.limiteDiario;
    lectura.inicioHoyMs = recalculado.inicioMs;
    lectura.uso.proyeccion = calcularProyecciones(cuenta.id);
    enviarUso();
  }
  if (bandeja) construirMenu();

  return { ok: true };
}

// Datos para el gráfico: el uso de cada uno de los últimos 7 días (null si ese día no hay registro).
// Con varias cuentas a la vez (sin ventanas separadas) trae además el de cada cuenta ("cuentas").
// "horas": a qué horas del día se usa más (el promedio de cada hora, entre los días guardados).
function datosDelHistorial(w, cantidadDeDias = 7) {
  if (cantidadDeDias === 'horas') {
    const cuentas = hayResumenDeCuentas() && !w.cuentaId ? almacen.leer().cuentas : [almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva()];
    return { porHora: true, cuentas: cuentas.map(horasDeCuenta) };
  }
  // "Hoy": el gráfico del día (de la cuenta de esa ventana, o de todas si se muestran todas a la vez).
  if (cantidadDeDias === 1) {
    const cuentas = hayResumenDeCuentas() && !w.cuentaId ? almacen.leer().cuentas : [almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva()];
    const inicio = fechaActual();
    inicio.setHours(0, 0, 0, 0);
    return { delDia: true, inicioMs: inicio.getTime(), ahoraMs: fechaActual().getTime(), cuentas: cuentas.map(graficoDelDia) };
  }
  const cantidad = cantidadDeDias === 30 ? 30 : 7;
  const datos = historialDeCuenta(almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva(), cantidad);
  if (hayResumenDeCuentas() && !w.cuentaId) {
    datos.cuentas = almacen.leer().cuentas.map((cuenta) => ({ id: cuenta.id, nombre: nombreDeCuenta(cuenta), ...historialDeCuenta(cuenta, cantidad) }));
  }
  return datos;
}

// El promedio de uso de cada hora del día de una cuenta, entre los días guardados. Hoy también cuenta (así el gráfico
// se mueve con cada consulta), pero solo en las horas que ya pasaron: en las que faltan bajaría el promedio sin razón.
function horasDeCuenta(cuenta) {
  const ahora = fechaActual();
  const hoy = calculo.diaLocal(ahora);
  const desde = calculo.ultimosDias(ahora, 30)[0]; // (el historial guarda más de un año: aquí valen los últimos 30 días)
  const conHoras = (cuenta.historial || []).filter((d) => d.dia >= desde && Array.isArray(d.horas) && d.horas.length === 24);
  const horas = Array.from({ length: 24 }, (_, hora) => {
    const dias = conHoras.filter((d) => d.dia !== hoy || hora <= ahora.getHours());
    return dias.length ? Math.round((dias.reduce((suma, d) => suma + (Number(d.horas[hora]) || 0), 0) / dias.length) * 100) / 100 : 0;
  });
  return { id: cuenta.id, nombre: nombreDeCuenta(cuenta), horas, dias: conHoras.length };
}

// El historial de una cuenta: los últimos días con su uso y su límite.
function historialDeCuenta(config, cantidad) {
  const porDia = new Map(config.historial.map((entrada) => [entrada.dia, entrada]));

  // El límite de un día: el que quedó guardado con su registro; si no hay registro, el que le corresponde a ese día.
  const limiteDeEseDia = (dia) => calculo.limitesDelDia({
    limiteBase: config.limiteDiario,
    umbralBase: config.umbralAviso,
    limitesPorDia: config.limitesPorDia,
    ahora: new Date(`${dia}T15:00:00Z`), // mediodía en Chile: así la zona horaria no cambia el día
  }).limite;

  const dias = calculo.ultimosDias(fechaActual(), cantidad).map((dia) => {
    const registro = porDia.get(dia);
    return {
      dia,
      uso: registro ? registro.uso : null,
      limite: registro && typeof registro.limite === 'number' ? registro.limite : limiteDeEseDia(dia),
    };
  });
  return { dias, limiteDiario: config.limiteDiario, hoy: calculo.diaLocal(fechaActual()) };
}

// Guarda el historial en un archivo CSV que se abre en Excel. Pregunta dónde guardarlo (cuadro "Guardar como").
// Devuelve { ok: true, ruta, cantidad }, { ok: false, cancelado: true } o { ok: false, error }.
// "ventanaPadre" es la ventana desde la que se pidió: el cuadro queda pegado a ella, así aparece al frente.
async function exportarHistorial(w, ventanaPadre) {
  const config = almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva();
  if (config.historial.length === 0) {
    return { ok: false, error: t('exportar.vacio') };
  }

  // Con varias cuentas, el nombre de la cuenta va en el nombre del archivo (sin símbolos que Windows no acepte).
  const nombreDeLaCuenta = nombreSiHayVarias(config);
  const sufijo = nombreDeLaCuenta ? '-' + nombreDeLaCuenta.replace(/[^\p{L}\p{N}_-]+/gu, '_') : '';
  const nombreSugerido = t('exportar.nombreArchivo', { fecha: calculo.diaLocal(fechaActual()) + sufijo });
  const opciones = {
    title: t('exportar.titulo'),
    defaultPath: path.join(app.getPath('documents'), nombreSugerido),
    filters: [{ name: t('exportar.filtro'), extensions: ['csv'] }],
  };
  const hayPadre = ventanaPadre && !ventanaPadre.isDestroyed() && ventanaPadre.isVisible();
  const eleccion = hayPadre
    ? await dialog.showSaveDialog(ventanaPadre, opciones)
    : await dialog.showSaveDialog(opciones);
  if (eleccion.canceled || !eleccion.filePath) return { ok: false, cancelado: true };

  try {
    const cantidad = exportar.guardarCsv(eleccion.filePath, config.historial, config.limiteDiario);
    alertas.enviarExportado(cantidad, eleccion.filePath);
    return { ok: true, ruta: eleccion.filePath, cantidad };
  } catch (error) {
    return { ok: false, error: t('exportar.error', { mensaje: error.message }) };
  }
}

// ----- Estadísticas e informe -----
// Todo sale de lo que ya está guardado (ver estadisticas.js); no se consulta nada a claude.ai.
function estadisticasDe(w) {
  const cuenta = almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva();
  const uso = lecturaDe(cuenta.id).uso;
  return {
    nombre: nombreSiHayVarias(cuenta) || null,
    limite: uso ? uso.limiteDiario : cuenta.limiteDiario,
    ...estadisticas.calcular({
      historial: cuenta.historial, semanasPasadas: cuenta.semanasPasadas, sesiones: cuenta.sesiones,
      limiteDiario: cuenta.limiteDiario, ahora: fechaActual(),
    }),
  };
}

// Guarda el informe como una página (se abre en el navegador; desde ahí se imprime o se guarda como PDF).
async function guardarInforme(w, ventanaPadre) {
  const datos = estadisticasDe(w);
  const eleccion = await dialog.showSaveDialog(...cuadroCon(ventanaPadre), {
    title: t('est.informe'),
    defaultPath: path.join(app.getPath('documents'), t('informe.archivo', { fecha: calculo.diaLocal(new Date()) })),
    filters: [{ name: t('informe.filtro'), extensions: ['html'] }],
  });
  if (eleccion.canceled || !eleccion.filePath) return { ok: false, cancelado: true };
  try {
    fs.writeFileSync(eleccion.filePath, informe.construir(datos, { cuenta: datos.nombre, ahora: new Date() }), 'utf8');
    shell.openPath(eleccion.filePath); // se abre para verlo (es un archivo tuyo, en tu computador)
    return { ok: true, mensaje: t('est.informe.listo') };
  } catch (error) {
    return { ok: false, error: t('exportar.error', { mensaje: error.message }) };
  }
}

// ----- Copia de seguridad -----
// "Guardar copia" escribe en un archivo todo lo que la app recuerda (ajustes, cuentas, límites e historial).
// "Restaurar copia" lo lee, pide confirmación, reemplaza los datos y vuelve a abrir la app.
// La copia no lleva sesiones: en otro computador hay que entrar de nuevo a cada cuenta.
const cuadroCon = (ventanaPadre) => (ventanaPadre && !ventanaPadre.isDestroyed() && ventanaPadre.isVisible() ? [ventanaPadre] : []);

async function guardarCopia(ventanaPadre) {
  const eleccion = await dialog.showSaveDialog(...cuadroCon(ventanaPadre), {
    title: t('copia.guardar.titulo'),
    defaultPath: path.join(app.getPath('documents'), 'headroom-copia-' + calculo.diaLocal(new Date()) + '.json'),
    filters: [{ name: t('copia.filtro'), extensions: ['json'] }],
  });
  if (eleccion.canceled || !eleccion.filePath) return { ok: false, cancelado: true };
  try {
    fs.writeFileSync(eleccion.filePath, copia.crear(almacen.leer(), app.getVersion()), 'utf8');
    return { ok: true, mensaje: t('copia.guardada') };
  } catch (error) {
    return { ok: false, error: t('exportar.error', { mensaje: error.message }) };
  }
}

async function restaurarCopia(ventanaPadre) {
  const eleccion = await dialog.showOpenDialog(...cuadroCon(ventanaPadre), {
    title: t('copia.restaurar.titulo'),
    defaultPath: app.getPath('documents'),
    filters: [{ name: t('copia.filtro'), extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (eleccion.canceled || !eleccion.filePaths[0]) return { ok: false, cancelado: true };
  let leida = { ok: false };
  try {
    if (fs.statSync(eleccion.filePaths[0]).size <= copia.TAMANO_MAXIMO) leida = copia.leer(fs.readFileSync(eleccion.filePaths[0], 'utf8'));
  } catch (error) { /* no se pudo leer: se trata como un archivo que no sirve */ }
  if (!leida.ok) return { ok: false, error: t('copia.invalida') };

  const fecha = leida.fecha && !Number.isNaN(Date.parse(leida.fecha))
    ? new Date(leida.fecha).toLocaleDateString(idiomas.locale(), { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';
  const confirmacion = await dialog.showMessageBox(...cuadroCon(ventanaPadre), {
    type: 'warning',
    buttons: [t('copia.confirmar.si'), t('copia.confirmar.no')],
    defaultId: 1,
    cancelId: 1,
    title: t('copia.restaurar.titulo'),
    message: t('copia.confirmar', { fecha, n: leida.datos.cuentas.length }),
    detail: t('copia.confirmar.detalle'),
  });
  if (confirmacion.response !== 0) return { ok: false, cancelado: true };

  // Las cuentas de ahora que no vienen en la copia: se cierra su sesión, para que no quede guardada sin dueño.
  const queQuedan = new Set(leida.datos.cuentas.map((c) => c.id));
  for (const cuenta of almacen.leer().cuentas) {
    if (!queQuedan.has(cuenta.id)) {
      try { await sesion.olvidar(cuenta.id); } catch (error) { /* no importa: igual se restaura */ }
    }
  }
  almacen.reemplazar(leida.datos);
  // Se vuelve a abrir la app, para que todo (ventanas, cuentas, idioma...) parta de los datos restaurados.
  app.relaunch();
  app.exit(0);
  return { ok: true };
}

// ----- Ícono de la bandeja de color -----
// Verde, amarillo o rojo según cuánto llevas de tu límite de hoy (en la cuenta que se muestra), igual que la barra de Hoy;
// gris si la última lectura falló, y el naranja de siempre si no hay datos o si apagaste esta opción.
let iconoActual = null;

function colorDelIcono() {
  if (!almacen.leer().iconoDeColor) return 'normal';
  const { uso: datos, error } = lecturaDe(cuentaActivaId());
  if (error) return 'gris';
  if (!datos || !datos.limiteDiario) return 'normal';
  const proporcion = datos.hoy / datos.limiteDiario;
  if (proporcion < 0.7) return 'verde';
  if (proporcion < 1) return 'amarillo';
  return 'rojo';
}

function actualizarIconoDeBandeja() {
  if (!bandeja) return;
  const color = colorDelIcono();
  if (color === iconoActual) return;
  iconoActual = color;
  bandeja.setImage(nativeImage.createFromPath(rutaDeAsset(`bandeja-${color}.png`)));
}

// ----- No molestar: silenciar los avisos por un rato -----
let temporizadorSilencio = null;

function silenciarAvisos(hasta) {
  almacen.guardar({ silencioHasta: hasta });
  alertas.silenciarHasta(hasta);
  clearTimeout(temporizadorSilencio);
  // Cuando termina el silencio, el menú vuelve a decir "Silenciar avisos".
  if (hasta > Date.now()) temporizadorSilencio = setTimeout(() => { if (bandeja) construirMenu(); }, hasta - Date.now() + 1000);
  if (bandeja) construirMenu();
}

// La medianoche que viene (hora de tu computador): "hasta mañana".
function proximaMedianoche() {
  const manana = new Date();
  manana.setHours(24, 0, 0, 0);
  return manana.getTime();
}

// ----- Atajo de teclado global: Ctrl + Alt + C muestra u oculta el widget desde cualquier programa -----
const ATAJO = 'CommandOrControl+Alt+C';

function aplicarAtajoGlobal() {
  const quiere = almacen.leer().atajoGlobal;
  const registrado = globalShortcut.isRegistered(ATAJO);
  if (quiere && !registrado) {
    if (!globalShortcut.register(ATAJO, mostrarOcultar)) console.log('El atajo Ctrl + Alt + C ya lo usa otro programa');
  } else if (!quiere && registrado) {
    globalShortcut.unregister(ATAJO);
  }
}

// ----- Versión nueva en GitHub -----
// La búsqueda y la instalación están en actualizaciones.js; aquí solo se programa una vez al día, se avisa y se arma el menú.
let temporizadorActualizaciones = null;
const UN_DIA_MS = 24 * 60 * 60 * 1000;
actualizaciones.alCambiarElEstado(() => { if (bandeja) construirMenu(); });

async function buscarVersionNueva() {
  clearTimeout(temporizadorActualizaciones);
  temporizadorActualizaciones = setTimeout(buscarVersionNueva, UN_DIA_MS); // se vuelve a revisar una vez al día
  if (!almacen.leer().buscarActualizaciones) return;
  const nueva = await actualizaciones.buscarVersionNueva(app.getVersion());
  // Se avisa una sola vez por cada versión nueva. Al hacer clic en el aviso se actualiza.
  if (nueva && almacen.leer().versionAvisada !== nueva.version) {
    almacen.guardar({ versionAvisada: nueva.version });
    alertas.enviarVersionNueva(nueva.version, actualizaciones.actualizarAhora);
  }
}

// "Buscar actualización" (botón de Ajustes): pregunta ahora mismo, aunque el aviso automático esté apagado.
// Responde { ok: true, version } si hay una más nueva, { ok: true, alDia: true } si no, o { ok: false } si no se pudo saber.
async function buscarActualizacionAhora() {
  const ultima = await actualizaciones.ultimaVersion();
  if (!ultima) return { ok: false, error: t('acerca.sinRespuesta') };
  if (actualizaciones.compararVersiones(ultima.version, app.getVersion()) <= 0) return { ok: true, alDia: true };
  const nueva = await actualizaciones.buscarVersionNueva(app.getVersion()); // (deja lista la actualización con un clic)
  return nueva ? { ok: true, version: nueva.version } : { ok: false, error: t('acerca.sinRespuesta') };
}

// Quién hizo la app (se muestra en Ajustes → Acerca de).
const AUTOR = 'OkazoKoroma';

// Crea el ícono junto al reloj y su menú (clic derecho).
function crearBandeja() {
  const icono = nativeImage.createFromPath(rutaDeAsset('bandeja-normal.png'));
  bandeja = new Tray(icono);
  iconoActual = 'normal';
  actualizarTooltip();
  construirMenu();
  actualizarIconoDeBandeja();

  // Un clic normal sobre el ícono también muestra u oculta el widget.
  bandeja.on('click', mostrarOcultar);
}

// Arma el menú del ícono. Se vuelve a armar cuando cambia la sesión,
// para que "Cerrar sesión" solo esté activo cuando hay una sesión abierta.
function construirMenu() {
  const config = almacen.leer();
  const activa = almacen.cuentaActiva();
  const hayConexion = hayAlgunaConectada();
  const activaConectada = sesion.estadoDe(activa.id) === 'conectado';

  const silenciado = alertas.estaSilenciado();
  const menu = Menu.buildFromTemplate([
    ...(actualizaciones.estado.versionNueva
      ? [{
          label: actualizaciones.estado.descargando
            ? t('tray.actualizando', { progreso: actualizaciones.estado.progreso })
            : t('tray.versionNueva', { version: actualizaciones.estado.versionNueva.version }),
          enabled: !actualizaciones.estado.descargando,
          click: actualizaciones.actualizarAhora,
        }, { type: 'separator' }]
      : []),
    { label: t('tray.actualizar'), enabled: hayConexion, click: () => actualizarUso() },
    { label: t('tray.mostrarOcultar'), click: mostrarOcultar },
    {
      label: t('tray.siempreEncima'),
      type: 'checkbox',
      checked: almacen.leer().siempreEncima,
      click: (item) => cambiarSiempreEncima(item.checked),
    },
    {
      label: t('tray.cuenta'),
      submenu: [
        ...config.cuentas.map((cuenta) => ({
          label: nombreDeCuenta(cuenta),
          type: 'radio',
          checked: cuenta.id === activa.id,
          click: () => activarCuenta(cuenta.id),
        })),
        { type: 'separator' },
        { label: t('tray.cuentaAgregar'), click: () => pedirPanel('agregar-cuenta') },
        { label: t('tray.cuentasAdministrar'), click: () => pedirPanel('cuentas') },
      ],
    },
    { label: t('tray.verEnClaude'), click: () => shell.openExternal(PAGINA_DE_USO) },
    { label: t('tray.historial'), click: () => pedirPanel('historial') },
    { label: t('tray.desglose'), click: () => pedirPanel('desglose') },
    { label: t('tray.proyeccion'), click: () => pedirPanel('proyeccion') },
    { label: t('tray.productos'), click: () => pedirPanel('productos') },
    {
      label: t('tray.vista'),
      submenu: [
        // De menos a más información
        { label: t('tray.vista.mini'), type: 'radio', checked: principal.vista.modo === 'mini', click: () => cambiarVista(principal, { modo: 'mini' }) },
        { label: t('tray.vista.compacto'), type: 'radio', checked: principal.vista.modo === 'compacto', click: () => cambiarVista(principal, { modo: 'compacto' }) },
        { label: t('tray.vista.normal'), type: 'radio', checked: principal.vista.modo === 'normal', click: () => cambiarVista(principal, { modo: 'normal' }) },
        { label: t('tray.vista.completo'), type: 'radio', checked: principal.vista.modo === 'completo', click: () => cambiarVista(principal, { modo: 'completo' }) },
        { label: t('tray.vista.tablero'), type: 'radio', checked: principal.vista.modo === 'tablero', click: () => cambiarVista(principal, { modo: 'tablero' }) },
        { label: t('tray.vista.cuentas'), type: 'radio', checked: principal.vista.modo === 'cuentas', click: () => cambiarVista(principal, { modo: 'cuentas' }) },
        { type: 'separator' },
        { label: t('tray.disposicion.vertical'), type: 'radio', checked: principal.vista.orientacion === 'vertical', click: () => cambiarVista(principal, { orientacion: 'vertical' }) },
        { label: t('tray.disposicion.horizontal'), type: 'radio', checked: principal.vista.orientacion === 'horizontal', click: () => cambiarVista(principal, { orientacion: 'horizontal' }) },
      ],
    },
    {
      label: silenciado ? t('tray.silencio.hasta', { hora: textoDeHora(new Date(almacen.leer().silencioHasta)) }) : t('tray.silencio'),
      submenu: [
        { label: t('tray.silencio.unaHora'), click: () => silenciarAvisos(Date.now() + 60 * 60 * 1000) },
        { label: t('tray.silencio.manana'), click: () => silenciarAvisos(proximaMedianoche()) },
        { type: 'separator' },
        { label: t('tray.silencio.reactivar'), enabled: silenciado, click: () => silenciarAvisos(0) },
      ],
    },
    { label: t('tray.exportar'), click: () => exportarHistorial(principal, principal.ventana) },
    { label: t('tray.ajustes'), click: () => pedirPanel('ajustes') },
    { label: t('tray.bienvenida'), click: () => pedirPanel('bienvenida') },
    {
      label: config.cuentas.length > 1 ? t('tray.cerrarSesionDe', { nombre: nombreDeCuenta(activa) }) : t('tray.cerrarSesion'),
      enabled: activaConectada,
      click: () => sesion.cerrarSesion(activa.id),
    },
    ...(MODO_PRUEBA ? [menuDePrueba()] : []),
    { type: 'separator' },
    { label: t('tray.salir'), click: () => app.quit() },
  ]);
  bandeja.setContextMenu(menu);
}

// Submenú que solo existe en el modo de prueba: permite inventar consumo.
function menuDePrueba() {
  const accion = (texto, nombre) => ({ label: texto, enabled: hayAlgunaConectada(), click: () => accionDePrueba(nombre) });
  return {
    label: 'PRUEBA (datos inventados)',
    submenu: [
      accion('Sumar 2% de uso', 'sumar-2'),
      accion('Sumar 5% de uso', 'sumar-5'),
      accion('Sesión 5 h: sumar 25%', 'sesion-sumar-25'),
      accion('Sesión 5 h: simular reinicio', 'sesion-reiniciar'),
      accion('Simular reinicio semanal', 'reiniciar-semana'),
      accion('Simular que pasó un día', 'nuevo-dia'),
      accion('Simular que pasaron 4 horas', 'pasan-horas-4'),
      accion('Simular error de formato (activar / desactivar)', 'formato-alternar'),
      accion('Borrar datos de prueba', 'borrar'),
    ],
  };
}

// Ejecuta una acción del menú de prueba y vuelve a calcular todo con el nuevo valor inventado.
async function accionDePrueba(nombre) {
  if (!MODO_PRUEBA) return;

  if (nombre.startsWith('sumar-')) {
    simulacion.semana += Number(nombre.slice('sumar-'.length));
  } else if (nombre.startsWith('sesion-sumar-')) {
    simulacion.sesion += Number(nombre.slice('sesion-sumar-'.length));
  } else if (nombre === 'sesion-reiniciar') {
    // Empieza una sesión nueva: poco uso y una hora de reinicio nueva, 5 horas más adelante.
    simulacion.sesion = 5;
    simulacion.reinicioSesion = new Date(Date.now() + 5 * HORAS);
  } else if (nombre === 'reiniciar-semana') {
    simulacion.semana = 1;
    // La semana nueva empieza justo ahora: su hora de reinicio queda dentro de 7 días.
    simulacion.reinicio = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  } else if (nombre === 'nuevo-dia') {
    simulacion.diasAdelantados += 1;
  } else if (nombre === 'formato-alternar') {
    simulacion.fallaFormato = !simulacion.fallaFormato;
  } else if (nombre.startsWith('pasan-horas-')) {
    simulacion.horasAdelantadas += Number(nombre.slice('pasan-horas-'.length));
  } else if (nombre === 'borrar') {
    simulacion.semana = 20;
    simulacion.diasAdelantados = 0;
    simulacion.horasAdelantadas = 0;
    simulacion.fallaFormato = false;
    simulacion.reinicio = null;
    simulacion.sesion = 30;
    simulacion.reinicioSesion = new Date(Date.now() + 3 * HORAS);
    for (const cuenta of almacen.leer().cuentas) almacen.guardarCuenta(cuenta.id, { diario: null, historial: [], estadoSesion: null });
  }
  await actualizarUso();
}

// Lectura inventada del uso, con la misma forma que la real (ver uso.js).
function lecturaSimulada(indiceDeCuenta = 0) {
  // Para probar el aviso de "claude.ai cambió su formato": la lectura falla como fallaría de verdad.
  if (simulacion.fallaFormato) throw new ErrorUso('formato', 'Formato inventado para la prueba');
  return {
    semana: Math.min(100, simulacion.semana + indiceDeCuenta * 8),
    reinicio: simulacion.reinicio || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    sesion5h: { porcentaje: Math.min(100, simulacion.sesion + indiceDeCuenta * 15), reinicio: simulacion.reinicioSesion },
    plan: indiceDeCuenta === 0 ? { clave: 'pro', multiplo: null } : { clave: 'max', multiplo: 5 }, // inventado, para ver cómo se muestra
    limitesExtra: [{ nombre: 'Fable', porcentaje: 12 + indiceDeCuenta * 20, reinicio: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) }], // inventado
    creditos: indiceDeCuenta === 1
      ? { porcentaje: 32, usado: { minor: 1600, moneda: 'USD', exponente: 2 }, limite: { minor: 5000, moneda: 'USD', exponente: 2 } }
      : null, // inventado
    // El reparto cambia un poco cada día (inventado), para que los gráficos por producto se vean como de verdad
    desglose: repartoSimulado(simulacion.diasAdelantados + indiceDeCuenta),
  };
}

function repartoSimulado(dia) {
  const codigo = Math.round(46 + 14 * Math.sin(dia * 1.3));
  const chats = Math.round(20 + 8 * Math.cos(dia * 0.9));
  const otros = 4 + (dia % 3);
  return [
    { clave: 'claude_code', nombre: 'Claude Code', porcentaje: codigo },
    { clave: 'cowork', nombre: 'Cowork', porcentaje: 100 - codigo - chats - otros },
    { clave: 'chat', nombre: 'Chats', porcentaje: chats },
    { clave: 'other', nombre: 'Otros', porcentaje: otros },
  ];
}

// La fecha y hora "de ahora". En el modo de prueba se puede adelantar (días y horas) para simular el paso del tiempo.
function fechaActual() {
  return new Date(Date.now() + simulacion.diasAdelantados * 24 * HORAS + simulacion.horasAdelantadas * HORAS);
}

// Convierte una proyección (ver calculo.js) en algo simple de enviar a la pantalla, con las horas ya escritas
// en hora de Chile. "esSemanal" decide si la hora de "cuando" lleva el día de la semana.
function proyeccionParaLaPantalla(proyeccion, esSemanal) {
  const resultado = { tipo: proyeccion.tipo };
  if (proyeccion.cuando) {
    resultado.cuandoTexto = esSemanal
      ? textoDeReinicio(proyeccion.cuando)
      : textoDeHora(redondearAlMinuto(proyeccion.cuando));
  }
  if (proyeccion.finDelDia !== undefined) resultado.fin = proyeccion.finDelDia;
  if (proyeccion.finDeSemana !== undefined) resultado.fin = proyeccion.finDeSemana;
  if (proyeccion.finDeSesion !== undefined) resultado.fin = proyeccion.finDeSesion;
  return resultado;
}

// Calcula "a este ritmo..." para hoy, para la semana y para la sesión de 5 horas, con los últimos datos leídos.
function calcularProyecciones(id) {
  const ahora = fechaActual();
  const lectura = lecturaDe(id);
  const diaria = calculo.proyeccionDiaria({
    hoy: lectura.uso.hoy, limite: lectura.uso.limiteDiario, inicioMs: lectura.inicioHoyMs, ahora,
  });
  const semanal = calculo.proyeccionSemanal({
    semana: lectura.uso.semana, inicioSemana: lectura.inicioSemana, reinicio: lectura.reinicioSemana, ahora,
  });
  const sesion = calculo.proyeccionDeSesion({ sesion5h: lectura.uso.sesion5h, ahora });
  return {
    diaria: proyeccionParaLaPantalla(diaria, false),
    semanal: proyeccionParaLaPantalla(semanal, true),
    sesion: proyeccionParaLaPantalla(sesion, false),
  };
}

// Calcula el uso de hoy con la lectura semanal nueva, lo guarda y envía las alertas que correspondan.
// "cuenta" son los datos guardados de esa cuenta (sus límites, su historial...).
// "reinicio" es la fecha del reinicio semanal (la usa el límite automático).
function registrarLectura(cuenta, semana, inicioSemana, reinicio) {
  const ahora = fechaActual();
  // Si es la primera lectura de hoy y la anterior fue ayer: el resumen de ayer (después de guardar, más abajo).
  const ayer = calculo.ultimosDias(ahora, 2)[0];
  const resumenDeAyer = cuenta.diario && cuenta.diario.dia === ayer
    ? (cuenta.historial || []).find((entrada) => entrada.dia === ayer)
    : null;
  // El límite y el aviso previo de HOY (pueden ser distintos según el día de la semana).
  let { limite, umbral } = calculo.limitesDelDia({
    limiteBase: cuenta.limiteDiario,
    umbralBase: cuenta.umbralAviso,
    limitesPorDia: cuenta.limitesPorDia,
    ahora,
  });
  // Límite automático: lo que queda de la semana repartido entre los días que faltan. El aviso previo guarda la misma
  // proporción que tienen tu límite y tu aviso en Ajustes (por ejemplo 10 de 14 = al 71% del límite).
  if (cuenta.limiteAutomatico && reinicio) {
    const semanaAlEmpezar = calculo.semanaAlEmpezarElDia({ estado: cuenta.diario, semana, inicioSemana, ahora });
    limite = calculo.limiteAutomatico({ semanaAlEmpezar, reinicio, ahora });
    const proporcion = cuenta.limiteDiario > 0 ? cuenta.umbralAviso / cuenta.limiteDiario : 0.7;
    umbral = Math.round(Math.min(limite * proporcion, limite * 0.95) * 10) / 10;
  }
  const resultado = calculo.procesarLectura({
    estado: cuenta.diario,
    historial: cuenta.historial,
    semana,
    inicioSemana,
    ahora,
    limite,
    umbralAviso: umbral,
  });

  // Guardamos PRIMERO (así las alertas quedan marcadas como enviadas aunque algo falle después).
  almacen.guardarCuenta(cuenta.id, { diario: resultado.estado, historial: resultado.historial });
  for (const tipo of resultado.alertas) {
    alertas.enviar(tipo, resultado.hoy, limite, nombreSiHayVarias(cuenta));
  }
  if (resumenDeAyer && almacen.leer().resumenes) {
    alertas.enviarResumenDia(resumenDeAyer.uso, resumenDeAyer.limite ?? limite, nombreSiHayVarias(cuenta));
  }
  return { hoy: resultado.hoy, limiteDiario: limite, inicioMs: resultado.estado.inicioMs };
}

// Anota la lectura en el gráfico del día: la hora, el uso de hoy y la sesión de 5 horas. Al cambiar el día se empieza de nuevo.
const MAXIMO_DE_PUNTOS_DEL_DIA = 400; // de sobra para una lectura cada 5 minutos
// También anota cuánto lleva cada producto en la semana (en % de la cuota) y lo que usó cada uno hoy (en el historial del día).
// "modelos": cuánto lleva cada límite por modelo (por ejemplo { Fable: 12 }, en % de su propio límite semanal), o null.
function anotarLecturaDeHoy(cuenta, hoy, sesion5h, semana, desglose, modelos = null) {
  const ahora = fechaActual();
  const dia = calculo.diaLocal(ahora);
  const anteriores = cuenta.lecturasDeHoy && cuenta.lecturasDeHoy.dia === dia ? cuenta.lecturasDeHoy.puntos : [];
  const productos = productosDeLaSemana(semana, desglose);
  const punto = { t: ahora.getTime(), hoy, sesion: sesion5h ? sesion5h.porcentaje : null, productos };
  if (modelos) punto.modelos = modelos;
  const puntos = [...anteriores, punto].slice(-MAXIMO_DE_PUNTOS_DEL_DIA);
  const cambios = { lecturasDeHoy: { dia, puntos } };
  // Cuánto se usó en cada hora de hoy (para "a qué horas usas más"): se guarda con el día en el historial
  const horas = calculo.usoPorHora(puntos, cuenta.diario ? cuenta.diario.inicioMs : null);
  cambios.historial = (cuenta.historial || []).map((d) => (d.dia === dia ? { ...d, horas } : d));
  if (productos) {
    // Los nombres de los productos (para los que claude.ai agregue y no conozcamos)
    cambios.nombresDeProductos = { ...(cuenta.nombresDeProductos || {}), ...Object.fromEntries(desglose.map((p) => [p.clave, p.nombre])) };
    // Lo que usó cada producto hoy: lo que lleva ahora menos lo que llevaba en la primera lectura del día
    // (si la semana se reinició hoy, lo que lleva desde el reinicio).
    const inicio = (puntos.find((p) => p.productos) || punto).productos;
    const delDia = {};
    for (const [clave, valor] of Object.entries(productos)) {
      const antes = inicio[clave] || 0;
      delDia[clave] = Math.round((valor >= antes ? valor - antes : valor) * 100) / 100;
    }
    cambios.historial = cambios.historial.map((d) => (d.dia === dia ? { ...d, productos: delDia } : d));
  }
  if (modelos) {
    // Igual con los límites por modelo: lo que subió cada uno hoy (si su semana se reinició hoy, lo que lleva desde entonces)
    const inicio = (puntos.find((p) => p.modelos) || punto).modelos;
    const delDia = {};
    for (const [nombre, valor] of Object.entries(modelos)) {
      const antes = inicio[nombre] || 0;
      delDia[nombre] = Math.round((valor >= antes ? valor - antes : valor) * 100) / 100;
    }
    cambios.historial = cambios.historial.map((d) => (d.dia === dia ? { ...d, modelos: delDia } : d));
  }
  almacen.guardarCuenta(cuenta.id, cambios);
}

// Los límites por modelo de una lectura (Fable...), como { nombre: % de su propio límite }. null si el plan no tiene ninguno.
// (El crédito extra no cuenta: es dinero, no un límite de uso.)
function modelosDeLaLectura(limitesExtra) {
  const modelos = (limitesExtra || []).filter((extra) => !extra.credito && typeof extra.nombre === 'string' && Number.isFinite(extra.porcentaje));
  return modelos.length ? Object.fromEntries(modelos.map((extra) => [extra.nombre.slice(0, 30), extra.porcentaje])) : null;
}

// Guarda cómo va subiendo el límite semanal de cada modelo (Fable...) y le pone a cada barra su "comparacion"
// contra la semana anterior de ese modelo a esta misma altura (null mientras no haya una semana anterior guardada).
const MAXIMO_DE_MODELOS = 8;
function anotarCurvasDeModelos(cuenta, limitesExtra) {
  const deModelo = (limitesExtra || []).filter((extra) => !extra.credito && extra.reinicio instanceof Date && Number.isFinite(extra.porcentaje));
  if (deModelo.length === 0) return;
  const curvas = { ...(cuenta.curvasDeModelos || {}) };
  for (const extra of deModelo) {
    const nombre = extra.nombre.slice(0, 30);
    const { guardado, comparacion } = calculo.seguirCurvaDeModelo(curvas[nombre], {
      porcentaje: extra.porcentaje, reinicioMs: extra.reinicio.getTime(), ahoraMs: fechaActual().getTime(),
      historial: cuenta.historial, nombre,
    });
    delete curvas[nombre]; // (así el que se acaba de leer queda al final y no se pierde al recortar)
    curvas[nombre] = guardado;
    extra.comparacion = comparacion;
  }
  almacen.guardarCuenta(cuenta.id, { curvasDeModelos: Object.fromEntries(Object.entries(curvas).slice(-MAXIMO_DE_MODELOS)) });
}

// Guarda cómo va subiendo el uso de hoy y el de la sesión de 5 horas, y los compara con ayer a esta misma hora y con la
// sesión anterior a esta misma altura. Devuelve { hoy, sesion } (cada una { diferencia, antes } o null si no hay con qué comparar).
const MAXIMO_DE_SESIONES = 300; // unas diez semanas de sesiones
function anotarCurvas(cuenta, hoy, sesion5h) {
  const ahora = fechaActual();
  const dia = calculo.diaLocal(ahora);
  const ayer = calculo.ultimosDias(ahora, 2)[0];
  const inicioDelDia = new Date(ahora);
  inicioDelDia.setHours(0, 0, 0, 0);
  const horasDelDia = (ahora.getTime() - inicioDelDia.getTime()) / HORAS;
  const cambios = {};

  // --- Hoy contra ayer
  let deHoy = cuenta.curvaDeHoy;
  let deAyer = cuenta.curvaDeAyer;
  if (!deHoy || deHoy.dia !== dia) {
    if (deHoy && deHoy.dia === ayer) deAyer = deHoy; // el día cambió: la curva de hoy pasa a ser la de ayer
    // (la primera vez, la curva de hoy se arma con las lecturas de hoy que ya estaban guardadas)
    const guardadas = cuenta.lecturasDeHoy && cuenta.lecturasDeHoy.dia === dia ? cuenta.lecturasDeHoy.puntos : [];
    const puntos = guardadas.reduce((curva, p) => calculo.agregarALaCurva(curva, (p.t - inicioDelDia.getTime()) / HORAS, p.hoy, 0.25), []);
    deHoy = { dia, puntos };
  }
  if (deAyer && deAyer.dia !== ayer) deAyer = null;
  deHoy = { dia, puntos: calculo.agregarALaCurva(deHoy.puntos, horasDelDia, hoy, 0.25) };
  cambios.curvaDeHoy = deHoy;
  cambios.curvaDeAyer = deAyer;
  const comparacionHoy = deAyer ? calculo.compararConCurva(hoy, deAyer.puntos, horasDelDia) : null;

  // --- La sesión de 5 horas contra la anterior
  let comparacionSesion = null;
  if (sesion5h) {
    const reinicioMs = Math.round(sesion5h.reinicio.getTime() / 60000) * 60000;
    const horasDeSesion = (ahora.getTime() - (reinicioMs - 5 * HORAS)) / HORAS;
    let enCurso = cuenta.sesionEnCurso;
    let pasada = cuenta.sesionPasada;
    // (la hora de reinicio que entrega claude.ai baila unos segundos: es la misma sesión si difiere en menos de 5 minutos)
    if (!enCurso || Math.abs(enCurso.reinicioMs - reinicioMs) > 5 * 60 * 1000) {
      if (enCurso && enCurso.puntos.length >= 2) pasada = enCurso;
      // La sesión que terminó queda anotada en el historial de sesiones (hasta dónde llegó y, si se agotó, cuándo)
      if (enCurso && enCurso.puntos.length >= 1) {
        const terminada = {
          inicioMs: enCurso.reinicioMs - 5 * HORAS,
          finMs: enCurso.reinicioMs,
          maximo: Math.max(...enCurso.puntos.map(([, valor]) => valor)),
          llenaMs: Number.isFinite(enCurso.llenaMs) ? enCurso.llenaMs : null,
        };
        cambios.sesiones = [...(cuenta.sesiones || []).filter((sesionVieja) => sesionVieja.finMs !== terminada.finMs), terminada].slice(-MAXIMO_DE_SESIONES);
      }
      enCurso = { reinicioMs, puntos: [] };
    }
    enCurso = {
      reinicioMs: enCurso.reinicioMs,
      puntos: calculo.agregarALaCurva(enCurso.puntos, horasDeSesion, sesion5h.porcentaje, 0.1),
      // (el momento en que la sesión llegó al 100%, si llegó)
      llenaMs: Number.isFinite(enCurso.llenaMs) ? enCurso.llenaMs : sesion5h.porcentaje >= 100 ? ahora.getTime() : null,
    };
    cambios.sesionEnCurso = enCurso;
    cambios.sesionPasada = pasada;
    comparacionSesion = pasada ? calculo.compararConCurva(sesion5h.porcentaje, pasada.puntos, horasDeSesion) : null;
  }
  almacen.guardarCuenta(cuenta.id, cambios);
  return { hoy: comparacionHoy, sesion: comparacionSesion };
}

// Cuánto lleva cada producto en la semana, en % de la cuota: { claude_code: 12.4, chat: 3.1, ... } (null si no hay desglose).
function productosDeLaSemana(semana, desglose) {
  if (!Array.isArray(desglose) || desglose.length === 0 || !Number.isFinite(semana)) return null;
  return Object.fromEntries(desglose.map((p) => [p.clave, Math.round(((p.porcentaje * semana) / 100) * 100) / 100]));
}

// Para el panel "Uso por producto": hoy (cuánto lleva cada producto desde que empezó el día, lectura a lectura)
// o los últimos 7 o 30 días (lo que usó cada producto cada día).
// "modo": 1 (hoy), 'semana' (los 7 días de la semana de tu plan, desde el día en que se reinicia), 30 (días) o 'semanas'.
function datosDeProductos(w, modo) {
  const cuenta = almacen.cuenta(cuentaDe(w)) || almacen.cuentaActiva();
  const nombres = cuenta.nombresDeProductos || {};
  const ordenar = (lista) => lista.sort((a, b) => b.total - a.total).map(({ total, ...resto }) => resto);
  const cantidadDeDias = Number(modo);
  // Los límites por modelo (Fable...) van como una línea más, marcada "propio": su % es de su propio límite, no de la cuota semanal.
  //   registros → de dónde se saca cada punto: [{ x, modelos }] (modelos = { nombre: valor } o nada)
  const lineasDeModelos = (registros) => {
    const nombresDeModelos = [...new Set(registros.flatMap((registro) => Object.keys(registro.modelos || {})))];
    return nombresDeModelos.map((nombre) => ({
      clave: 'modelo:' + nombre, nombre, propio: true,
      puntos: registros.map((registro) => [registro.x, registro.sinDato || !registro.modelos ? null : registro.modelos[nombre] || 0]),
    }));
  };

  // Histórico de semanas: lo que usó cada producto en cada semana (la semana en curso va al final, con lo que lleva)
  if (modo === 'semanas') {
    const lectura = lecturaDe(cuenta.id);
    const semanas = [...(cuenta.semanasPasadas || [])];
    if (cuenta.semanaEnCurso && lectura.inicioSemana) {
      semanas.push({ inicio: calculo.diaLocal(lectura.inicioSemana), semana: cuenta.semanaEnCurso.semana, productos: cuenta.semanaEnCurso.productos, modelos: cuenta.semanaEnCurso.modelos, enCurso: true });
    }
    const claves = [...new Set(semanas.flatMap((s) => Object.keys(s.productos || {})))];
    const productos = claves.map((clave) => {
      const puntos = semanas.map((s, j) => [j, s.productos ? s.productos[clave] || 0 : null]);
      return { clave, nombre: nombres[clave] || clave, puntos, total: puntos.reduce((suma, [, v]) => suma + (v || 0), 0) };
    });
    const modelos = lineasDeModelos(semanas.map((s, j) => ({ x: j, modelos: s.modelos })));
    return { semanas: semanas.map((s) => ({ inicio: s.inicio, enCurso: Boolean(s.enCurso) })), productos: [...ordenar(productos), ...modelos] };
  }

  // Esta semana: los 7 días desde el día en que se reinicia tu plan (los que aún no llegan quedan vacíos)
  if (modo === 'semana') {
    const inicio = lecturaDe(cuenta.id).inicioSemana || fechaActual();
    const primerDia = calculo.diaLocal(inicio);
    const [anio, mes, dia] = primerDia.split('-').map(Number);
    const dias = [0, 1, 2, 3, 4, 5, 6].map((i) => new Date(Date.UTC(anio, mes - 1, dia + i)).toISOString().slice(0, 10));
    const hoy = calculo.diaLocal(fechaActual());
    const porDia = new Map((cuenta.historial || []).map((d) => [d.dia, d]));
    const claves = [...new Set(dias.flatMap((d) => Object.keys((porDia.get(d) || {}).productos || {})))];
    const productos = claves.map((clave) => {
      const puntos = dias.map((d, j) => {
        if (d > hoy) return [j, null];
        const registro = porDia.get(d);
        return [j, registro && registro.productos ? registro.productos[clave] || 0 : null];
      });
      return { clave, nombre: nombres[clave] || clave, puntos, total: puntos.reduce((suma, [, v]) => suma + (v || 0), 0) };
    });
    const modelos = lineasDeModelos(dias.map((d, j) => ({ x: j, sinDato: d > hoy, modelos: (porDia.get(d) || {}).modelos })));
    return { delDia: false, dias, hoy, productos: [...ordenar(productos), ...modelos] };
  }
  if (cantidadDeDias === 1) {
    const dia = calculo.diaLocal(fechaActual());
    const puntos = (cuenta.lecturasDeHoy && cuenta.lecturasDeHoy.dia === dia ? cuenta.lecturasDeHoy.puntos : []).filter((p) => p.productos);
    const inicio = fechaActual();
    inicio.setHours(0, 0, 0, 0);
    const claves = [...new Set(puntos.flatMap((p) => Object.keys(p.productos)))];
    const primero = puntos.length ? puntos[0].productos : {};
    const productos = claves.map((clave) => {
      const serie = puntos.map((p) => {
        const antes = primero[clave] || 0;
        const valor = p.productos[clave] || 0;
        return [p.t, Math.round((valor >= antes ? valor - antes : valor) * 100) / 100];
      });
      return { clave, nombre: nombres[clave] || clave, puntos: serie, total: serie.length ? serie[serie.length - 1][1] : 0 };
    });
    // Los límites por modelo: lo que subió cada uno desde la primera lectura de hoy
    const conModelos = (cuenta.lecturasDeHoy && cuenta.lecturasDeHoy.dia === dia ? cuenta.lecturasDeHoy.puntos : []).filter((p) => p.modelos);
    const alEmpezar = conModelos.length ? conModelos[0].modelos : {};
    const modelos = lineasDeModelos(conModelos.map((p) => ({
      x: p.t,
      modelos: Object.fromEntries(Object.entries(p.modelos).map(([nombre, valor]) => {
        const antes = alEmpezar[nombre] || 0;
        return [nombre, Math.round((valor >= antes ? valor - antes : valor) * 100) / 100];
      })),
    })));
    return { delDia: true, inicioMs: inicio.getTime(), ahoraMs: fechaActual().getTime(), productos: [...ordenar(productos), ...modelos] };
  }
  const cantidad = cantidadDeDias === 30 ? 30 : 7;
  const dias = calculo.ultimosDias(fechaActual(), cantidad);
  const porDia = new Map((cuenta.historial || []).map((d) => [d.dia, d]));
  const claves = [...new Set(dias.flatMap((dia) => Object.keys((porDia.get(dia) || {}).productos || {})))];
  const productos = claves.map((clave) => {
    const puntos = dias.map((dia, j) => {
      const registro = porDia.get(dia);
      return [j, registro && registro.productos ? registro.productos[clave] || 0 : null];
    });
    return { clave, nombre: nombres[clave] || clave, puntos, total: puntos.reduce((suma, [, v]) => suma + (v || 0), 0) };
  });
  const modelos = lineasDeModelos(dias.map((dia, j) => ({ x: j, modelos: (porDia.get(dia) || {}).modelos })));
  return { delDia: false, dias, hoy: calculo.diaLocal(fechaActual()), productos: [...ordenar(productos), ...modelos] };
}

// Los datos del gráfico del día de una cuenta (vacío si hoy aún no hay lecturas).
function graficoDelDia(cuenta) {
  const dia = calculo.diaLocal(fechaActual());
  const guardadas = cuenta.lecturasDeHoy && cuenta.lecturasDeHoy.dia === dia ? cuenta.lecturasDeHoy.puntos : [];
  const uso = lecturaDe(cuenta.id).uso;
  return { id: cuenta.id, nombre: nombreDeCuenta(cuenta), puntos: guardadas, limite: uso ? uso.limiteDiario : cuenta.limiteDiario };
}

// Recuerda la semana en curso y su último %. Cuando la fecha de reinicio salta a la semana siguiente, la anterior terminó:
// se avisa cuánto se usó y cuál fue el día más alto de esa semana.
// También guarda cada semana que termina en el histórico de semanas (con lo que usó cada producto), hasta 26 semanas.
const MAXIMO_DE_SEMANAS = 26;
function resumirSemanaSiTermino(cuenta, semana, reinicio, desglose, modelos = null) {
  const anterior = cuenta.semanaEnCurso;
  const reinicioMs = reinicio.getTime();
  const termino = anterior && reinicioMs - anterior.reinicioMs > 12 * HORAS;
  // La curva de la semana: cuánto llevaba a cada hora desde que empezó (para comparar la semana que viene con esta)
  const horasDeSemana = (fechaActual().getTime() - (reinicioMs - 7 * 24 * HORAS)) / HORAS;
  const curva = calculo.agregarALaCurva(anterior && !termino ? anterior.curva : [], horasDeSemana, semana);
  const cambios = { semanaEnCurso: { reinicioMs, semana, productos: productosDeLaSemana(semana, desglose), curva, modelos } };
  if (termino) {
    cambios.curvaSemanaPasada = { reinicioMs: anterior.reinicioMs, puntos: anterior.curva || [] };
    const terminada = {
      inicio: calculo.diaLocal(new Date(anterior.reinicioMs - 7 * 24 * HORAS)),
      semana: anterior.semana,
      productos: anterior.productos || null,
      modelos: anterior.modelos || null,
    };
    cambios.semanasPasadas = [...(cuenta.semanasPasadas || []).filter((s) => s.inicio !== terminada.inicio), terminada].slice(-MAXIMO_DE_SEMANAS);
  }
  almacen.guardarCuenta(cuenta.id, cambios);
  if (!termino || !almacen.leer().resumenes) return;
  // El día más alto entre los 7 días que terminaron con ese reinicio.
  const desde = calculo.diaLocal(new Date(anterior.reinicioMs - 7 * 24 * HORAS));
  const hasta = calculo.diaLocal(new Date(anterior.reinicioMs));
  const dias = (cuenta.historial || []).filter((d) => d.dia >= desde && d.dia <= hasta && d.uso > 0);
  const masAlto = dias.reduce((mayor, d) => (!mayor || d.uso > mayor.uso ? d : mayor), null);
  const diaMasAlto = masAlto && {
    uso: masAlto.uso,
    nombre: new Date(`${masAlto.dia}T12:00:00Z`).toLocaleDateString(idiomas.locale(), { weekday: 'long', timeZone: 'UTC' }),
  };
  alertas.enviarResumenSemana(anterior.semana, diaMasAlto, nombreSiHayVarias(cuenta));
}

// Revisa la sesión de 5 horas y envía las alertas que correspondan (si las tienes activadas en Ajustes).
function registrarSesion(cuenta, sesion5h) {
  const config = almacen.leer();
  if (!config.alertasSesion) return;

  const resultado = calculo.procesarSesion({
    estado: cuenta.estadoSesion,
    sesion5h,
    umbral: config.umbralSesion,
    ahora: fechaActual(),
    avisoRitmo: config.avisoRitmo !== false,
  });

  // Igual que con el límite diario: se guarda PRIMERO, y después se avisa.
  almacen.guardarCuenta(cuenta.id, { estadoSesion: resultado.estado });
  const porcentaje = sesion5h ? sesion5h.porcentaje : null;
  const reinicioTexto = sesion5h ? textoDeHora(redondearAlMinuto(sesion5h.reinicio)) : null;
  for (const tipo of resultado.alertas) {
    if (tipo === 'sesion-ritmo') {
      // En el aviso de ritmo va la hora a la que llegarías al límite.
      const llegada = textoDeHora(redondearAlMinuto(new Date(resultado.estado.llegadaMs)));
      alertas.enviarSesion(tipo, llegada, reinicioTexto, nombreSiHayVarias(cuenta));
    } else {
      alertas.enviarSesion(tipo, porcentaje, reinicioTexto, nombreSiHayVarias(cuenta));
    }
  }
}

// Revisa la cuota semanal y avisa una vez por semana al llegar al porcentaje elegido (si lo tienes activado en Ajustes).
// Y, una vez por semana, si a este ritmo la agotarías antes del reinicio (otra opción de Ajustes).
function registrarSemana(cuenta, semana, reinicio) {
  const config = almacen.leer();
  const conRitmo = config.avisoRitmoSemana !== false;
  if (!config.alertasSemana && !conRitmo) return;
  const resultado = calculo.procesarSemana({
    estado: cuenta.estadoSemana, semana, reinicio,
    umbral: config.alertasSemana ? config.umbralSemana : Infinity, // (apagado: nunca llega)
    avisoRitmo: conRitmo, inicioSemana: lecturaDe(cuenta.id).inicioSemana, ahora: fechaActual(),
  });
  almacen.guardarCuenta(cuenta.id, { estadoSemana: resultado.estado });
  for (const tipo of resultado.alertas) {
    if (tipo === 'semana-aviso') alertas.enviarSemana(semana, textoDeReinicio(reinicio), nombreSiHayVarias(cuenta));
    if (tipo === 'semana-ritmo') {
      alertas.enviarRitmoSemana(textoDeReinicio(new Date(resultado.estado.llegadaMs)), textoDeReinicio(reinicio), nombreSiHayVarias(cuenta));
    }
  }
}

// Se llama cada vez que cambia el estado de la sesión de una cuenta:
// avisa a la pantalla del widget (si es la cuenta que se muestra) y actualiza el menú de la bandeja.
function alCambiarSesion(id, estado) {
  for (const w of todasLasVentanas()) {
    if (estaViva(w) && id === cuentaDe(w)) w.ventana.webContents.send('estado-sesion', estado);
  }
  if (bandeja) construirMenu();

  if (estado === 'conectado') {
    // Acabas de entrar: leemos el uso de esa cuenta de inmediato.
    actualizarUso({ solo: id });
  } else {
    // Sin sesión no hay nada que consultar: olvidamos los datos de esa cuenta.
    lecturas.delete(id);
    programarProximaConsulta();
  }
  enviarUso();
}

// Convierte la fecha de reinicio a texto en hora de Chile. Ejemplo: "viernes 04:00".
function textoDeReinicio(fecha) {
  fecha = redondearAlMinuto(fecha);
  const dia = fecha.toLocaleDateString(idiomas.locale(), { weekday: 'long', timeZone: ZONA_HORARIA });
  return `${dia} ${textoDeHora(fecha)}`;
}

// claude.ai a veces entrega la hora con fracciones de segundo (ej. 06:59:59.9):
// redondeamos al minuto más cercano para mostrar 04:00 y no 03:59.
function redondearAlMinuto(fecha) {
  return new Date(Math.round(fecha.getTime() / 60000) * 60000);
}

// Convierte una fecha a "HH:MM" en hora de Chile. Ejemplo: "14:40".
function textoDeHora(fecha) {
  // "h23" = reloj de 24 horas (04:00, 14:40), igual en todos los idiomas
  return fecha.toLocaleTimeString(idiomas.locale(), {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ZONA_HORARIA,
  });
}

// Traduce un error de lectura a la clave de un mensaje corto que cabe en el widget (ver idiomas/es.js).
function claveDeError(error) {
  if (error.tipo === 'sin-internet') return 'error.sinConexion';
  if (error.tipo === 'formato') return 'error.formato';
  return 'error.generico';
}

// Lo que la pantalla del widget necesita para dibujarse.
// El nombre del plan para mostrar: "Pro", "Max 5x"... ("Gratis" / "Free" se traduce).
function textoDePlan(plan) {
  if (!plan) return null;
  if (plan.clave === 'free') return t('plan.free');
  if (plan.clave === 'max') return plan.multiplo ? `Max ${plan.multiplo}x` : 'Max';
  return { pro: 'Pro', team: 'Team', enterprise: 'Enterprise' }[plan.clave] || null;
}

// Un monto de dinero como texto: "US$16", "US$ 50"... según el idioma.
function textoDeDinero(dinero) {
  const valor = dinero.minor / Math.pow(10, dinero.exponente);
  try {
    return new Intl.NumberFormat(idiomas.locale(), {
      style: 'currency', currency: dinero.moneda, minimumFractionDigits: 0, maximumFractionDigits: dinero.exponente,
    }).format(valor);
  } catch (error) {
    return `${valor} ${dinero.moneda}`;
  }
}

// Las barras extra de una cuenta, a partir de una lectura:
//   - los límites semanales por modelo (Fable...), solo si el plan no es Pro ni Gratis;
//   - el crédito extra del mes, si lo tiene activado y con tope (en cualquier plan).
function armarLimitesExtra(resultado) {
  const lista = [];
  const esPlanBasico = resultado.plan && ['pro', 'free'].includes(resultado.plan.clave);
  if (!esPlanBasico && resultado.limitesExtra) {
    for (const extra of resultado.limitesExtra) lista.push({ ...extra, reinicioTexto: textoDeReinicio(extra.reinicio) });
  }
  if (resultado.creditos) {
    const extra = { credito: resultado.creditos, porcentaje: resultado.creditos.porcentaje };
    escribirTextosDelCredito(extra);
    lista.push(extra);
  }
  return lista.length > 0 ? lista : null;
}

// El nombre y el detalle de la barra del crédito extra ("US$16 / US$50"), en el idioma elegido.
function escribirTextosDelCredito(extra) {
  extra.nombre = t('extra.etiqueta');
  const { usado, limite } = extra.credito;
  extra.detalleTexto = usado && limite ? `${textoDeDinero(usado)} / ${textoDeDinero(limite)}` : '';
}

// Un resumen de cada cuenta (para la lista de cuentas y para la vista completa).
function resumenDeCuentas() {
  return almacen.leer().cuentas.map((cuenta) => {
    const { uso: datos, error } = lecturaDe(cuenta.id);
    return {
      id: cuenta.id,
      nombre: nombreDeCuenta(cuenta),
      estado: sesion.estadoDe(cuenta.id),
      error: error ? t(error) : null,
      plan: datos ? textoDePlan(datos.plan) : null,
      // Para el desglose y la proyección de todas las cuentas a la vez
      desglose: datos ? datos.desglose || null : null,
      proyeccion: datos ? datos.proyeccion || null : null,
      comparacion: datos ? datos.comparacion || null : null,
      reinicioTexto: datos ? datos.reinicioTexto : null,
      sesionReinicioTexto: datos && datos.sesion5h ? datos.sesion5h.reinicioTexto : null,
      extras: limitesExtraDe(cuenta.id).map((extra) => ({ nombre: extra.nombre, porcentaje: extra.porcentaje })),
      uso: datos && {
        hoy: datos.hoy,
        limiteDiario: datos.limiteDiario,
        semana: datos.semana,
        sesion5h: datos.sesion5h && { porcentaje: datos.sesion5h.porcentaje },
      },
    };
  });
}

// Lo que la pantalla de una ventana necesita: el dato de la cuenta que muestra y el resumen de todas.
// "propia" = es la ventana propia de una cuenta (no la principal).
function datosParaLaPantalla(w) {
  const activa = cuentaDe(w);
  const { uso: datos, error } = lecturaDe(activa);
  const uso = datos && { ...datos, limitesExtra: limitesExtraDe(activa) };
  return {
    uso, error: error ? t(error) : null, prueba: MODO_PRUEBA, activa, propia: w !== principal,
    // Una ventana propia de una cuenta (o una parte separada de ella) muestra solo esa cuenta
    resumen: hayResumenDeCuentas() && !w.cuentaId, cuentas: resumenDeCuentas(),
    // los chats de Claude Code: en la ventana principal, o en su propia ventana si la sacaste
    chats: (w === principal && !partes.has(CHATS_SEPARADOS)) || w.parte === 'chats' ? chatsParaLaPantalla() : [],
  };
}

// Manda a la pantalla de cada ventana el último dato (o el último error).
function enviarUso() {
  actualizarIconoDeBandeja();
  for (const w of todasLasVentanas()) {
    // Si la cuenta que se muestra tiene límites extra (o dejó de tenerlos), la tarjeta cambia de tamaño.
    const cantidad = limitesExtraDe(cuentaDe(w)).length;
    if (cantidad !== w.limitesExtra) {
      w.limitesExtra = cantidad;
      reajustarLaVentana(w);
    }
    // En la vista normal vertical con todas las cuentas, el alto de la ventana depende de cuáles tienen datos.
    if (todasALaVez(w) || esVistaCompleta(w.vista)) reajustarLaVentana(w);
    if (estaViva(w)) w.ventana.webContents.send('datos-uso', datosParaLaPantalla(w));
  }
}

// Lee el uso de UNA cuenta, lo guarda y lo deja listo para mostrar. Si falla, el error queda anotado en esa cuenta.
async function leerCuenta(cuenta, indice) {
  const lectura = lecturaDe(cuenta.id);
  try {
    const resultado = MODO_PRUEBA ? lecturaSimulada(indice) : await uso.leerUso(cuenta.particion);
    const ahora = textoDeHora(new Date());
    // La semana empezó 7 días antes de su hora de reinicio.
    lectura.reinicioSemana = resultado.reinicio;
    lectura.inicioSemana = new Date(resultado.reinicio.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hoy = registrarLectura(almacen.cuenta(cuenta.id), resultado.semana, lectura.inicioSemana, resultado.reinicio);
    lectura.inicioHoyMs = hoy.inicioMs;
    registrarSesion(almacen.cuenta(cuenta.id), resultado.sesion5h);
    const limitesExtra = armarLimitesExtra(resultado); // barras extra: límites por modelo (Fable...) y crédito extra (puede ser null)
    const modelos = modelosDeLaLectura(limitesExtra);
    anotarLecturaDeHoy(almacen.cuenta(cuenta.id), hoy.hoy, resultado.sesion5h, resultado.semana, resultado.desglose, modelos);
    const comparaciones = anotarCurvas(almacen.cuenta(cuenta.id), hoy.hoy, resultado.sesion5h);
    anotarCurvasDeModelos(almacen.cuenta(cuenta.id), limitesExtra);
    registrarSemana(almacen.cuenta(cuenta.id), resultado.semana, resultado.reinicio);
    resumirSemanaSiTermino(almacen.cuenta(cuenta.id), resultado.semana, resultado.reinicio, resultado.desglose, modelos);
    lectura.uso = {
      semana: resultado.semana,
      hoy: hoy.hoy,                   // % usado hoy
      limiteDiario: hoy.limiteDiario, // límite diario en %
      reinicio: resultado.reinicio,   // fecha del reinicio semanal (con ella se escribe el texto en el idioma elegido)
      reinicioTexto: textoDeReinicio(resultado.reinicio),
      // Sesión de 5 horas (puede ser null si claude.ai no la entregó)
      sesion5h: resultado.sesion5h && {
        porcentaje: resultado.sesion5h.porcentaje,
        reinicio: resultado.sesion5h.reinicio,
        reinicioTexto: textoDeHora(redondearAlMinuto(resultado.sesion5h.reinicio)),
      },
      desglose: resultado.desglose, // reparto de la semana por producto (puede ser null)
      plan: resultado.plan,         // { clave, multiplo } del plan de esta cuenta (puede ser null)
      limitesExtra,
      actualizado: ahora,
    };
    lectura.uso.proyeccion = calcularProyecciones(cuenta.id); // "a este ritmo..." de hoy y de la semana
    // Cómo vas contra la semana pasada a esta misma altura (null si todavía no hay con qué comparar)
    const guardada = almacen.cuenta(cuenta.id);
    lectura.uso.comparacionHoy = comparaciones.hoy;       // contra ayer a esta misma hora
    lectura.uso.comparacionSesion = comparaciones.sesion; // contra la sesión anterior a esta misma altura
    lectura.uso.comparacion = calculo.compararConSemanaPasada({
      semana: resultado.semana, inicioSemana: lectura.inicioSemana, ahora: fechaActual(),
      curvaPasada: guardada.curvaSemanaPasada, historial: guardada.historial,
    });
    lectura.error = null;
    lectura.fallosDeFormato = 0; // una lectura buena borra la cuenta de fallos
    formatoAvisado = false;
    console.log(`Lectura ${ahora} [${nombreDeCuenta(cuenta)}]: semana ${resultado.semana}%, hoy ${hoy.hoy}%`);
    horaActualizada = ahora;
    actualizarTooltip();
  } catch (error) {
    // Cualquier fallo se muestra en el widget, pero la app sigue funcionando.
    console.error(`No se pudo leer el uso [${nombreDeCuenta(cuenta)}]:`, error.message);
    lectura.error = claveDeError(error);
    if (error.tipo === 'sesion') sesion.marcarExpirada(cuenta.id);

    // Si claude.ai entrega datos que no entendemos 3 veces seguidas (unos 15 minutos), probablemente
    // cambió su página: se avisa con una notificación, UNA sola vez (no cada 5 minutos).
    if (error.tipo === 'formato') {
      lectura.fallosDeFormato += 1;
      if (lectura.fallosDeFormato === 3 && !formatoAvisado) {
        formatoAvisado = true;
        alertas.enviarProblemaDeFormato();
      }
    }
  }
  enviarUso();
}

// Consulta el uso de todas las cuentas con sesión (una tras otra) y lo muestra. Se puede llamar a mano (menú "Actualizar")
// o desde el temporizador. Con { solo: id } se lee únicamente esa cuenta (por ejemplo, justo después de iniciar sesión).
async function actualizarUso({ solo } = {}) {
  if (consultando) {
    if (solo) pendientesDeLeer.add(solo); // se lee apenas termine la consulta en curso
    return;
  }
  const cuentas = almacen.leer().cuentas.filter((c) => sesion.estadoDe(c.id) === 'conectado' && (!solo || c.id === solo));
  if (cuentas.length === 0) return;

  // Con el widget oculto (y la opción activada) no se consulta nada: al volver a mostrarlo se retoma.
  // (Una cuenta que acabas de agregar o en la que acabas de entrar sí se lee: tú lo pediste.)
  if (!solo && estaEnPausa()) {
    clearTimeout(temporizadorUso);
    consultasEnPausa = true;
    console.log('Widget oculto: las consultas quedan en pausa');
    return;
  }

  // Respetamos el mínimo entre consultas: si fue hace poco, no volvemos a preguntar.
  // (En el modo de prueba no hay consulta real, así que no hace falta esperar.)
  // Se dan 2 segundos de margen, porque el temporizador puede despertar unos milisegundos antes
  // de tiempo (con el intervalo en 5 minutos, igual al mínimo, eso dejaba la app sin actualizar).
  if (!solo && !MODO_PRUEBA && Date.now() - ultimaConsulta < minimoEntreConsultas() - 2000) {
    // Aunque no consultemos ahora, la próxima consulta automática tiene que seguir programada.
    programarProximaConsulta();
    return;
  }

  consultando = true;
  if (!solo) ultimaConsulta = Date.now();
  clearTimeout(temporizadorUso);

  try {
    const todas = almacen.leer().cuentas;
    for (const cuenta of cuentas) await leerCuenta(cuenta, todas.findIndex((c) => c.id === cuenta.id));
  } finally {
    consultando = false;
    enviarUso();
    programarProximaConsulta();
    for (const id of [...pendientesDeLeer]) {
      pendientesDeLeer.delete(id);
      actualizarUso({ solo: id });
    }
  }
}

// ¿Las consultas están en pausa? Sí, si la opción está activada y el widget está oculto.
let consultasEnPausa = false;
function estaEnPausa() {
  return almacen.leer().pausarOculto !== false && estaViva(principal) && !principal.ventana.isVisible();
}

// Al volver a mostrar el widget (o al apagar la opción): si estaba en pausa, se consulta de inmediato
// (respetando el mínimo entre consultas) y se vuelve a programar la siguiente.
function retomarConsultas() {
  if (!consultasEnPausa || estaEnPausa()) return;
  consultasEnPausa = false;
  actualizarUso();
}

// Programa la próxima consulta automática: pasado el intervalo de Ajustes desde la última consulta,
// o a los 5 minutos si la última falló (para recuperarse pronto).
// También se llama al cambiar el intervalo en Ajustes, para que se aplique sin reiniciar.
// ¿Toca consultar más seguido ahora? Sí, si la opción está activada y la sesión de alguna cuenta va alta.
function hayConsultaRapida() {
  if (!almacen.leer().consultaRapida) return false;
  return almacen.leer().cuentas.some((c) => {
    const { uso: datos, error } = lecturaDe(c.id);
    return !error && datos && datos.sesion5h && datos.sesion5h.porcentaje >= CONSULTA_RAPIDA_DESDE && datos.sesion5h.porcentaje < 100;
  });
}
// El mínimo entre dos consultas en este momento (2 minutos con la consulta rápida; si no, 5).
const minimoEntreConsultas = () => (hayConsultaRapida() ? CONSULTA_RAPIDA_MS : MINIMO_ENTRE_CONSULTAS_MS);

function programarProximaConsulta() {
  clearTimeout(temporizadorUso);
  if (!hayAlgunaConectada()) return;

  const hayError = almacen.leer().cuentas.some((c) => lecturaDe(c.id).error);
  const intervalo = hayConsultaRapida()
    ? CONSULTA_RAPIDA_MS
    : Math.max(MINIMO_ENTRE_CONSULTAS_MS, almacen.leer().intervaloMin * 60 * 1000); // nunca más seguido que el mínimo
  const espera = hayError ? Math.min(REINTENTO_TRAS_ERROR_MS, intervalo) : intervalo;
  const yaPasado = Date.now() - ultimaConsulta;
  const faltan = Math.max(1000, espera - yaPasado);
  temporizadorUso = setTimeout(() => actualizarUso(), faltan);
  console.log(`Próxima consulta en ${Math.round(faltan / 60000)} min`);
}

// ----- Cuentas -----

// El título de la ventana de inicio de sesión (con varias cuentas dice de cuál es).
function tituloDeInicioDeSesion(cuenta) {
  return totalDeCuentas > 1 ? t('login.tituloCuenta', { nombre: nombreDeCuenta(cuenta) }) : t('login.titulo');
}

// Avisa a las pantallas y al menú que algo de las cuentas cambió.
function avisarCambioDeCuentas() {
  sincronizarVentanas();
  cerrarPartesDeCuentasEliminadas();
  revisarContexto(); // la ventana de contexto solo se muestra con una cuenta
  if (bandeja) construirMenu();
  enviarUso();
}

// Con "cada cuenta en su propia ventana": la principal muestra la cuenta elegida y cada una de las demás tiene
// su ventana. Abre las que faltan y cierra las que sobran (por ejemplo al apagar la opción o al eliminar una cuenta).
function sincronizarVentanas() {
  if (!estaViva(principal)) return;
  const activa = cuentaActivaId();
  const queridas = ventanasSeparadas ? almacen.leer().cuentas.filter((c) => c.id !== activa).map((c) => c.id) : [];
  for (const [id, w] of secundarias) {
    if (queridas.includes(id)) continue;
    secundarias.delete(id);
    if (estaViva(w)) w.ventana.destroy();
  }
  for (const id of queridas) {
    if (secundarias.has(id)) continue;
    const guardado = (almacen.cuenta(id) || {}).ventana || {};
    const vista = {
      modo: ajustes.OPCIONES_MODO.includes(guardado.modo) ? guardado.modo : 'normal',
      orientacion: ajustes.OPCIONES_ORIENTACION.includes(guardado.orientacion) ? guardado.orientacion : 'vertical',
    };
    const w = nuevoWidget(id, vista);
    w.limitesExtra = limitesExtraDe(id).length;
    secundarias.set(id, w);
    crearVentana(w);
    if (!principal.ventana.isVisible()) w.ventana.hide();
  }
}

// Pasa a mostrar otra cuenta en la tarjeta.
function activarCuenta(id) {
  const config = almacen.leer();
  if (id === config.cuentaActiva || !config.cuentas.some((c) => c.id === id)) return;
  almacen.guardar({ cuentaActiva: id });
  if (estaViva(principal)) principal.ventana.webContents.send('estado-sesion', sesion.estadoDe(id));
  avisarCambioDeCuentas();
}

const NOMBRE_MAXIMO = 20;
const limpiarNombre = (nombre) => String(nombre ?? '').trim().slice(0, NOMBRE_MAXIMO);

// Agrega una cuenta nueva, la muestra y abre la ventana para que inicies sesión en ella.
async function agregarCuenta(nombre) {
  nombre = limpiarNombre(nombre);
  if (!nombre) return { ok: false, error: t('cuentas.err.nombre') };
  const nueva = almacen.agregarCuenta(nombre);
  if (!nueva) return { ok: false, error: t('cuentas.err.maximo', { n: almacen.MAXIMO_DE_CUENTAS }) };
  await sesion.registrar(nueva, MODO_PRUEBA);
  actualizarTotalDeCuentas();
  reajustarTodas();
  activarCuenta(nueva.id);
  if (sesion.estadoDe(nueva.id) === 'conectado') actualizarUso({ solo: nueva.id }); // (solo pasa en el modo de prueba)
  if (!MODO_PRUEBA) sesion.abrirLogin(nueva.id, tituloDeInicioDeSesion(nueva));
  return { ok: true };
}

function renombrarCuenta(id, nombre) {
  nombre = limpiarNombre(nombre);
  if (!nombre) return { ok: false, error: t('cuentas.err.nombre') };
  if (!almacen.cuenta(id)) return { ok: false };
  almacen.guardarCuenta(id, { nombre });
  avisarCambioDeCuentas();
  return { ok: true };
}

// Elimina una cuenta (con su historial, sus límites y su sesión). Siempre queda al menos una.
async function eliminarCuenta(id) {
  const config = almacen.leer();
  if (config.cuentas.length <= 1 || !config.cuentas.some((c) => c.id === id)) return { ok: false };
  await sesion.olvidar(id);
  almacen.quitarCuenta(id);
  lecturas.delete(id);
  actualizarTotalDeCuentas();
  if (id === config.cuentaActiva && estaViva(principal)) {
    principal.ventana.webContents.send('estado-sesion', sesion.estadoDe(cuentaActivaId()));
  }
  reajustarTodas();
  avisarCambioDeCuentas();
  programarProximaConsulta();
  return { ok: true };
}

// Evitamos que se abran dos widgets a la vez si se ejecuta la app dos veces.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Cuando Electron termina de prepararse, creamos la ventana y el ícono.
  app.whenReady().then(async () => {
    // La pantalla del widget puede preguntar el estado y pedir abrir el inicio de sesión.
    ipcMain.handle('obtener-estado', (evento) => sesion.estadoDe(cuentaDe(ventanaDelEvento(evento))));
    ipcMain.on('iniciar-sesion', (evento) => {
      const id = cuentaDe(ventanaDelEvento(evento));
      const cuenta = almacen.cuenta(id);
      if (cuenta) sesion.abrirLogin(id, tituloDeInicioDeSesion(cuenta));
    });
    // Cuentas: cambiar la que se muestra, agregar, renombrar, eliminar y entrar / salir de cada una.
    const esId = (id) => typeof id === 'string' && almacen.cuenta(id);
    ipcMain.on('cuentas-activar', (evento, id) => { if (esId(id)) activarCuenta(id); });
    ipcMain.handle('cuentas-agregar', (evento, nombre) => agregarCuenta(nombre));
    ipcMain.handle('cuentas-renombrar', (evento, id, nombre) => renombrarCuenta(id, nombre));
    ipcMain.handle('cuentas-eliminar', (evento, id) => (esId(id) ? eliminarCuenta(id) : { ok: false }));
    ipcMain.on('cuentas-cerrar-sesion', (evento, id) => { if (esId(id)) sesion.cerrarSesion(id); });
    ipcMain.on('cuentas-iniciar-sesion', (evento, id) => { if (esId(id)) sesion.abrirLogin(id, tituloDeInicioDeSesion(almacen.cuenta(id))); });
    ipcMain.handle('obtener-uso', (evento) => datosParaLaPantalla(ventanaDelEvento(evento)));
    ipcMain.handle('obtener-apariencia', (evento) => aparienciaActual(ventanaDelEvento(evento)));
    ipcMain.handle('obtener-idioma', () => datosDeIdioma());
    ipcMain.on('alternar-modo', (evento, modo) => {
      if (!['compacto', 'completo', 'tablero', 'cuentas', 'mini'].includes(modo)) return;
      const w = ventanaDelEvento(evento);
      cambiarVista(w, { modo: w.vista.modo === modo ? 'normal' : modo }); // pulsar el mismo botón otra vez vuelve a la vista normal
    });
    ipcMain.on('fijar-escala', (evento, porcentaje) => {
      if (!Number.isFinite(porcentaje)) return;
      aplicarEscala(Math.max(ajustes.ESCALA_MINIMA, Math.min(Math.round(porcentaje), ajustes.ESCALA_MAXIMA)));
    });
    ipcMain.on('redimensionar-inicio', (evento, borde, minimos) => empezarRedimension(ventanaDelEvento(evento), borde, minimos));
    ipcMain.on('redimensionar-fin', (evento) => terminarRedimension(ventanaDelEvento(evento)));
    ipcMain.on('restablecer-tamano', (evento) => restablecerTamano(ventanaDelEvento(evento)));
    ipcMain.on('alternar-orientacion', (evento) => {
      const w = ventanaDelEvento(evento);
      // La orientación solo se nota en la vista normal; en las otras no hay nada que cambiar.
      if (w.vista.modo !== 'normal') return;
      cambiarVista(w, { orientacion: w.vista.orientacion === 'vertical' ? 'horizontal' : 'vertical' });
    });
    ipcMain.on('cambiar-escala', (evento, paso) => {
      if (!Number.isFinite(paso) || Math.abs(paso) > 50) return;
      const nueva = Math.round(escalaActual * 100 + paso);
      aplicarEscala(Math.max(ajustes.ESCALA_MINIMA, Math.min(nueva, ajustes.ESCALA_MAXIMA)));
    });
    ipcMain.on('separar-parte', (evento, parte) => separarParte(String(parte), ventanaDelEvento(evento).cuentaId));
    ipcMain.on('juntar-parte', (evento) => { const w = ventanaDelEvento(evento); if (w.parte) juntarParte(w.clave); });
    ipcMain.on('bienvenida-vista', () => { if (!almacen.leer().bienvenidaVista) almacen.guardar({ bienvenidaVista: true }); });
    ipcMain.handle('exportar-historial', (evento) => exportarHistorial(ventanaDelEvento(evento), BrowserWindow.fromWebContents(evento.sender)));
    ipcMain.handle('buscar-actualizacion', () => buscarActualizacionAhora());
    ipcMain.on('actualizar-ahora', () => actualizaciones.actualizarAhora());
    ipcMain.handle('obtener-estadisticas', (evento) => estadisticasDe(ventanaDelEvento(evento)));
    ipcMain.handle('guardar-informe', (evento) => guardarInforme(ventanaDelEvento(evento), BrowserWindow.fromWebContents(evento.sender)));
    ipcMain.handle('guardar-copia', (evento) => guardarCopia(BrowserWindow.fromWebContents(evento.sender)));
    ipcMain.handle('restaurar-copia', (evento) => restaurarCopia(BrowserWindow.fromWebContents(evento.sender)));
    ipcMain.handle('ajustar-ventana', (evento, abierto, alto, anchoPanel, preferirAbajo, panel) => {
      const w = ventanaDelEvento(evento);
      w.panelAbierto = abierto && typeof panel === 'string' ? panel : null; // (Ajustes puede quedar encima de otras ventanas)
      return ajustarVentanaAlPanel(w, Boolean(abierto), alto, anchoPanel, Boolean(preferirAbajo));
    });
    ipcMain.handle('obtener-ajustes', (evento) => ajustesActuales(ventanaDelEvento(evento)));
    ipcMain.handle('guardar-ajustes', (evento, datos) => guardarAjustes(ventanaDelEvento(evento), datos));
    ipcMain.handle('obtener-historial', (evento, dias) => datosDelHistorial(ventanaDelEvento(evento), dias === 'horas' ? 'horas' : Number(dias)));
    ipcMain.handle('obtener-productos', (evento, modo) => datosDeProductos(ventanaDelEvento(evento), ['semana', 'semanas'].includes(modo) ? modo : Number(modo)));
    if (MODO_PRUEBA) ipcMain.handle('prueba', (evento, nombre) => accionDePrueba(nombre));

    // Primero averiguamos si ya hay sesión guardada, luego mostramos todo.
    const cuentasGuardadas = almacen.leer().cuentas;
    actualizarTotalDeCuentas();
    verTodasLasCuentas = almacen.leer().todasLasCuentas !== false;
    ventanasSeparadas = almacen.leer().ventanasSeparadas === true;
    sinBarras = almacen.leer().sinBarras === true;
    ocultarHoy = almacen.leer().ocultarHoy === true;
    tamanosGuardados = almacen.leer().tamanos || {};
    await sesion.iniciar(cuentasGuardadas, alCambiarSesion, MODO_PRUEBA);
    idiomas.fijar(almacen.leer().idioma); // el idioma guardado, antes de crear el menú y las pantallas

    // El tamaño de la ventana depende de la vista y de la orientación guardadas.
    const guardadaVista = almacen.leer();
    principal.vista = {
      modo: ajustes.OPCIONES_MODO.includes(guardadaVista.modo) ? guardadaVista.modo : 'normal',
      orientacion: ajustes.OPCIONES_ORIENTACION.includes(guardadaVista.orientacion) ? guardadaVista.orientacion : 'vertical',
    };
    const guardada = almacen.leer().escala;   // y del tamaño elegido (en %)
    escalaActual = Math.max(ajustes.ESCALA_MINIMA, Math.min(guardada, ajustes.ESCALA_MAXIMA)) / 100;
    ajustes.migrarArranqueDeCupo(); // (la app antes se llamaba Cupo)
    // "Mostrar solo mientras Claude está abierto": se mira antes de crear la ventana, para que no aparezca y desaparezca.
    if (almacen.leer().seguirAClaude) claudeAbierto = await claudeEstaAbierto();
    setInterval(seguirAClaude, 5 * 1000);
    crearVentana(principal);
    crearBandeja();
    sincronizarVentanas(); // las ventanas propias de las demás cuentas (si está activada esa opción)
    abrirPartesGuardadas(); // las partes del widget que habías sacado a su propia ventana

    // La primera vez (nunca se vio la bienvenida y ninguna cuenta ha iniciado sesión), se explica qué es cada cosa.
    const datosIniciales = almacen.leer();
    if (!datosIniciales.bienvenidaVista && !datosIniciales.cuentas.some((c) => c.habiaSesion)) {
      principal.ventana.webContents.once('did-finish-load', () => setTimeout(() => pedirPanel('bienvenida'), 900));
    }

    // "No molestar" que había quedado activo, el atajo de teclado y, al rato, la búsqueda de una versión nueva.
    const silencioGuardado = almacen.leer().silencioHasta || 0;
    if (silencioGuardado > Date.now()) silenciarAvisos(silencioGuardado);
    aplicarAtajoGlobal();
    setTimeout(buscarVersionNueva, 15 * 1000);

    // El contexto del chat de Claude Code cambia con cada mensaje: se mira cada 15 segundos.
    revisarContexto();
    setInterval(revisarContexto, 15 * 1000);

    // Si ya había sesión guardada de otras veces, leemos el uso al arrancar.
    actualizarUso();
  });
}

// Aunque la ventana esté oculta, la app sigue viva en la bandeja.
// Solo se cierra del todo con "Salir".
app.on('window-all-closed', () => {
  app.quit();
});

// Al salir, se suelta el atajo de teclado (para que otro programa lo pueda usar).
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
