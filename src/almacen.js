// almacen.js: guarda y lee los datos de la app en un archivo JSON.
// Guarda la posición de la ventana, los ajustes y, por cada cuenta de Claude, su historial de uso diario.
//
// IMPORTANTE: aquí nunca se guardan contraseñas, cookies ni tokens.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Valores generales (iguales para todas las cuentas) que se usan la primera vez, cuando todavía no existe el archivo.
const VALORES_INICIALES = {
  siempreEncima: true, // la ventana queda por encima de las demás
  posicion: null,      // { x, y } de la ventana; null = aún no se ha movido
  intervaloMin: 5,     // cada cuántos minutos se consulta el uso
  tema: 'oscuro',      // 'oscuro', 'claro' o 'auto' (sigue el tema de Windows)
  opacidad: 100,       // cuánto se ve el fondo del widget, de 40 a 100 (menos = más transparente)
  idioma: 'es',        // idioma de la app: 'es', 'en' o 'auto' (el idioma de Windows)
  modo: 'normal',      // vista del widget: 'normal', 'compacto' (una sola línea) o 'completo' (todo a la vez)
  orientacion: 'vertical', // en el modo normal: 'vertical' (barras apiladas) u 'horizontal' (lado a lado)
  escala: 100,         // tamaño del widget en %: 100 = normal, 70 = más chico, 160 = más grande
  alertasSesion: true, // avisar por la sesión de 5 horas (al llegar al umbral, al límite y al reiniciarse)
  umbralSesion: 80,    // % de la sesión de 5 horas en que llega el aviso
  avisoRitmo: true,    // avisar si a este ritmo te quedarías sin sesión antes de que se reinicie
  formatoReinicio: 'relativo', // cómo se muestra el reinicio: 'relativo' (en 2 h 15 min) u 'hora' (15:06)
  colores: null,       // colores propios: { acento, verde, amarillo, rojo } ('#rrggbb'); null = los de siempre
  iconoDeColor: true,  // el ícono de la bandeja cambia de color según el uso de hoy
  atajoGlobal: true,   // Ctrl + Alt + C muestra u oculta el widget desde cualquier programa
  buscarActualizaciones: true, // revisar en GitHub si hay una versión nueva
  pausarOculto: true,  // no consultar el uso mientras el widget está oculto
  consultaRapida: false, // consultar cada 2 minutos mientras la sesión de 5 horas va sobre 70% (el resto del tiempo, el intervalo normal)
  avisoRitmoSemana: true, // avisar si a este ritmo agotarías la cuota semanal antes del reinicio
  sinBarras: false,    // "solo números": la tarjeta no dibuja las barras (queda más baja)
  ocultarHoy: false,   // sin la barra de Hoy: solo la sesión de 5 horas, la semana y los límites por modelo
  panelTodas: false,   // en el Panel con varias cuentas: true = una fila por cuenta ("Todas"); false = la cabecera de la cuenta elegida
  seguirAClaude: false, // mostrar el widget al abrir Claude (la app o Claude Code) y ocultarlo al cerrarlo
  resumenes: true,     // avisar cuánto usaste ayer (al empezar el día) y en la semana (al reiniciarse)
  bienvenidaVista: false, // true cuando ya se mostró la bienvenida de la primera vez
  partes: {},          // las partes sacadas a su propia ventana: { historial: { abierta, posicion }, ... }
  versionAvisada: null, // la última versión nueva de la que ya se avisó (para no avisar dos veces)
  silencioHasta: 0,    // "no molestar": hasta cuándo (ms) los avisos están silenciados
  alertasSemana: true, // avisar cuando la cuota semanal llega a un porcentaje
  umbralSemana: 85,    // % de la cuota semanal en que llega el aviso
  contextoVisible: true,  // mostrar la barra "Contexto" del chat actual de Claude Code
  avisoContexto: true,    // recordar compactar el chat al llegar a umbralContexto (y cada 10% más)
  umbralContexto: 70,     // % del contexto en que llega el aviso
  avisosContexto: {},     // { sesión del chat: escalón ya avisado }: así no se repiten al reiniciar la app (las últimas 50)
  tamanoContexto: 'auto', // tamaño de la ventana de contexto: 'auto' (según el modelo), '200k' o '1m'
  todasLasCuentas: true, // en la vista normal y la compacta, mostrar todas las cuentas a la vez (si hay más de una)
  ventanasSeparadas: false, // cada cuenta en su propia ventana (cada una guarda su posición y su vista en "ventana")
  tamanos: {},         // cuánto estiraste la ventana de cada vista: { 'normal-vertical': { ancho, alto }, ... }
                       // (y el tamaño que le diste a cada panel desplegado: { 'panel-historial': { ancho, alto } })
  cuentas: [],         // las cuentas de Claude (ver CAMPOS_DE_CUENTA)
  cuentaActiva: null,  // id de la cuenta que se muestra en la tarjeta
};

// Lo que guarda cada cuenta (cada una tiene su propia sesión, sus límites y su historial).
const CAMPOS_DE_CUENTA = {
  habiaSesion: false,  // true si alguna vez se inició sesión (solo sí/no, nunca datos de la sesión)
  limiteDiario: 14,    // % de la cuota semanal que quieres usar como máximo por día
  umbralAviso: 10,     // % de uso diario en que llega el aviso previo
  limitesPorDia: null, // null = el mismo límite todos los días; o 7 números [lun ... dom]
  limiteAutomatico: false, // true = el límite de cada día lo calcula Headroom (lo que queda de la semana / los días que faltan)
  estadoSesion: null,  // estado de la sesión de 5 horas en curso (lo maneja calculo.js)
  estadoSemana: null,  // estado del aviso de la cuota semanal (lo maneja calculo.js)
  semanaEnCurso: null, // { reinicioMs, semana, productos, curva }: la semana actual, para el resumen y el histórico cuando se reinicia
  semanasPasadas: [],  // [{ inicio, semana, productos }]: las últimas semanas terminadas (para el histórico de semanas)
  curvaDeHoy: null,    // { dia, puntos: [[horas desde las 00:00, % de hoy], ...] }: cómo va subiendo el uso de hoy
  curvaDeAyer: null,   // lo mismo, del día anterior (para comparar "ayer a esta misma hora")
  sesionEnCurso: null, // { reinicioMs, puntos: [[horas desde que empezó, %], ...] }: la sesión de 5 horas actual
  sesionPasada: null,  // lo mismo, de la sesión anterior (para comparar con esta)
  sesiones: [],        // [{ inicioMs, finMs, maximo, llenaMs }]: las sesiones de 5 horas terminadas (las últimas 300), para las estadísticas
  curvaSemanaPasada: null, // { reinicioMs, puntos: [[horas, %], ...] }: cómo fue subiendo la semana anterior (para comparar con esta)
  curvasDeModelos: null,   // { Fable: { reinicioMs, puntos, pasada: { reinicioMs, puntos } } }: lo mismo, para el límite semanal de cada modelo
  lecturasDeAyer: null, // lo mismo, del día anterior (para que "últimas 24 h" no empiece de cero a medianoche)
  lecturasDeHoy: null, // { dia, puntos: [{ t, hoy, sesion, productos }] }: cada lectura de hoy, para los gráficos del día
  nombresDeProductos: {}, // { clave: nombre } de los productos que informa claude.ai (Claude Code, Chats...)
  diario: null,        // estado del día en curso (lo maneja calculo.js)
  historial: [],       // uso de cada día, últimos 30 días: [{ dia: '2026-10-02', uso: 9, limite: 14, productos, horas }, ...]
};

const PARTICION_PRIMERA = 'persist:claude'; // la sesión de la primera cuenta (la que ya existía antes de haber varias)
const MAXIMO_DE_CUENTAS = Infinity; // sin límite: se pueden agregar tantas cuentas como se quiera

// Nombre del archivo donde se guarda todo. El modo de prueba usa otro,
// para no mezclar datos inventados con tu historial real.
let nombreArchivo = 'datos.json';

function usarArchivo(nombre) {
  nombreArchivo = nombre;
}

// El archivo se guarda en la carpeta de datos de la app (dentro de tu usuario de Windows).
function rutaArchivo() {
  return path.join(app.getPath('userData'), nombreArchivo);
}

// Deja la lista de cuentas completa y ordenada. Si el archivo es de antes de que hubiera varias cuentas,
// los datos de siempre (límites, historial...) pasan a ser los de la primera cuenta, que sigue usando la misma sesión.
function normalizarCuentas(guardado) {
  let cuentas = Array.isArray(guardado.cuentas) ? guardado.cuentas.filter((c) => c && c.id) : [];
  if (cuentas.length === 0) {
    const vieja = { id: 'c1', nombre: '', particion: PARTICION_PRIMERA };
    for (const campo of Object.keys(CAMPOS_DE_CUENTA)) {
      if (guardado[campo] !== undefined) vieja[campo] = guardado[campo];
    }
    cuentas = [vieja];
  }
  for (const campo of Object.keys(CAMPOS_DE_CUENTA)) delete guardado[campo]; // ya no van sueltos
  guardado.cuentas = cuentas.map((cuenta) => ({
    ...CAMPOS_DE_CUENTA,
    historial: [],
    ...cuenta,
  }));
  if (!guardado.cuentas.some((c) => c.id === guardado.cuentaActiva)) guardado.cuentaActiva = guardado.cuentas[0].id;
}

// Lee los datos guardados. Si el archivo no existe o está dañado,
// devuelve los valores iniciales (así la app nunca se cae por esto).
function leer() {
  let guardado = {};
  try {
    guardado = JSON.parse(fs.readFileSync(rutaArchivo(), 'utf8'));
  } catch (error) {
    guardado = {};
  }
  // Antes había un "compacto: true/false"; ahora hay un "modo". Se traduce el valor viejo (y se deja de usar).
  if (guardado.modo === undefined && guardado.compacto === true) guardado.modo = 'compacto';
  delete guardado.compacto;
  normalizarCuentas(guardado);
  return { ...VALORES_INICIALES, ...guardado };
}

function escribir(datos) {
  try {
    fs.mkdirSync(path.dirname(rutaArchivo()), { recursive: true });
    fs.writeFileSync(rutaArchivo(), JSON.stringify(datos, null, 2));
  } catch (error) {
    console.error('No se pudo guardar el archivo de datos:', error.message);
  }
}

// Reemplaza TODOS los datos por otros (lo usa "Restaurar copia"). Lo que falte toma los valores de siempre al leer.
function reemplazar(datos) {
  escribir(datos);
}

// Guarda un cambio sin borrar el resto de los datos.
// Ejemplo: guardar({ siempreEncima: false })
function guardar(cambios) {
  escribir({ ...leer(), ...cambios });
}

// ----- Cuentas -----

// Los datos de una cuenta (o undefined si no existe).
function cuenta(id) {
  return leer().cuentas.find((c) => c.id === id);
}

// La cuenta que se muestra ahora.
function cuentaActiva() {
  const datos = leer();
  return datos.cuentas.find((c) => c.id === datos.cuentaActiva);
}

// Guarda un cambio en una cuenta. Ejemplo: guardarCuenta('c2', { limiteDiario: 20 })
function guardarCuenta(id, cambios) {
  const datos = leer();
  datos.cuentas = datos.cuentas.map((c) => (c.id === id ? { ...c, ...cambios } : c));
  escribir(datos);
}

// Agrega una cuenta nueva (con su propio espacio de sesión) y la devuelve. Devuelve null si ya hay el máximo.
function agregarCuenta(nombre) {
  const datos = leer();
  if (datos.cuentas.length >= MAXIMO_DE_CUENTAS) return null;
  let numero = datos.cuentas.length + 1;
  while (datos.cuentas.some((c) => c.id === 'c' + numero)) numero += 1;
  const id = 'c' + numero;
  const nueva = { ...CAMPOS_DE_CUENTA, historial: [], id, nombre, particion: `persist:claude-${id}` };
  datos.cuentas.push(nueva);
  escribir(datos);
  return nueva;
}

// Quita una cuenta de la lista (la sesión de su espacio la borra quien llame a esto). No quita la última.
function quitarCuenta(id) {
  const datos = leer();
  if (datos.cuentas.length <= 1) return false;
  datos.cuentas = datos.cuentas.filter((c) => c.id !== id);
  if (datos.cuentaActiva === id) datos.cuentaActiva = datos.cuentas[0].id;
  escribir(datos);
  return true;
}

module.exports = {
  leer, guardar, usarArchivo, reemplazar,
  cuenta, cuentaActiva, guardarCuenta, agregarCuenta, quitarCuenta,
  MAXIMO_DE_CUENTAS, VALORES_INICIALES, CAMPOS_DE_CUENTA,
};
