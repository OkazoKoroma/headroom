// preload.js: es el "puente" seguro entre la pantalla del widget y el resto de la app.
// La pantalla no puede tocar archivos ni el sistema; solo puede usar las funciones de abajo.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  // Pregunta cuál es el estado de la sesión ahora mismo.
  obtenerEstado: () => ipcRenderer.invoke('obtener-estado'),

  // Registra una función que se llama cada vez que el estado cambia.
  alCambiarEstado: (funcion) => {
    ipcRenderer.on('estado-sesion', (evento, estado) => funcion(estado));
  },

  // Pregunta cuál es el último dato de uso leído (o null si todavía no hay).
  obtenerUso: () => ipcRenderer.invoke('obtener-uso'),

  // Registra una función que se llama cada vez que hay datos de uso nuevos (o un error al leerlos).
  alCambiarUso: (funcion) => {
    ipcRenderer.on('datos-uso', (evento, datos) => funcion(datos));
  },

  // Hace crecer la ventana del widget para mostrar un panel de ese alto (true) o la devuelve a su tamaño (false).
  // Responde { haciaArriba }: hacia dónde creció, para poner el panel del lado correcto.
  // Si ya había un panel abierto y el nuevo no cabe en la pantalla, responde también { noCabe: true }.
  ajustarVentana: (abierto, alto, ancho, preferirAbajo, panel) => ipcRenderer.invoke('ajustar-ventana', abierto, alto, ancho, preferirAbajo, panel),

  // Registra una función que se llama cuando el menú de la bandeja pide abrir un panel
  // ('historial', 'desglose', 'proyeccion' o 'ajustes').
  alPedirPanel: (funcion) => {
    ipcRenderer.on('abrir-panel', (evento, nombre) => funcion(nombre));
  },

  // Idioma: los textos del idioma activo ({ idioma, locale, textos }), y avisar cuando cambie.
  obtenerIdioma: () => ipcRenderer.invoke('obtener-idioma'),
  alCambiarIdioma: (funcion) => {
    ipcRenderer.on('idioma', (evento, datos) => funcion(datos));
  },

  // Apariencia (tema, transparencia, vista y orientación): leerla, y enterarse cuando cambie.
  obtenerApariencia: () => ipcRenderer.invoke('obtener-apariencia'),
  alCambiarApariencia: (funcion) => {
    ipcRenderer.on('apariencia', (evento, apariencia) => funcion(apariencia));
  },

  // Registra una función que se llama cuando la app avisa qué borde de la tarjeta queda quieto al cambiar
  // de modo (true = el de abajo, false = el de arriba).
  alCambiarAncla: (funcion) => {
    ipcRenderer.on('ancla', (evento, anclaAbajo) => funcion(anclaAbajo));
  },

  // Fija el tamaño de la interfaz en un porcentaje (por ejemplo, 125). Lo usan los tamaños rápidos de Ajustes.
  fijarEscala: (porcentaje) => ipcRenderer.send('fijar-escala', porcentaje),

  // Cambia entre la disposición vertical y la horizontal (solo en la vista normal).
  alternarOrientacion: () => ipcRenderer.send('alternar-orientacion'),
  // Menos (-1) o más (+1) información: pasa al tamaño anterior o siguiente
  cambiarTamano: (paso) => ipcRenderer.send('cambiar-tamano', paso),
  asomar: () => ipcRenderer.send('asomar'), // la mínima: muestra la compacta un momento

  // Sube (paso positivo) o baja (paso negativo) el tamaño del widget, en puntos porcentuales. Lo usa Ctrl + rueda del mouse.
  cambiarEscala: (paso) => ipcRenderer.send('cambiar-escala', paso),

  // Pasa a la vista indicada ('compacto' o 'completo'); si ya está en esa vista, vuelve a la normal.
  alternarModo: (modo) => ipcRenderer.send('alternar-modo', modo),

  // La app pide cerrar el panel desplegable (antes de cambiar de vista, que cambia el tamaño de la ventana).
  alPedirCerrarPanel: (funcion) => {
    ipcRenderer.on('cerrar-panel', () => funcion());
  },

  // Guarda el historial en un archivo CSV que se abre en Excel (muestra el cuadro de "Guardar como").
  // Responde { ok, ruta, cantidad } o { ok: false, error } o { ok: false, cancelado: true }.
  exportarHistorial: () => ipcRenderer.invoke('exportar-historial'),
  // Copia de seguridad: guardar todo en un archivo, o restaurarlo (pide confirmación y vuelve a abrir la app).
  // Estadísticas (récords, rachas, costumbres) y el informe para guardar o imprimir.
  obtenerEstadisticas: () => ipcRenderer.invoke('obtener-estadisticas'),
  obtenerPanel: () => ipcRenderer.invoke('obtener-panel'), // todo lo que muestra el Panel (por preguntas)
  guardarInforme: () => ipcRenderer.invoke('guardar-informe'),
  guardarCopia: () => ipcRenderer.invoke('guardar-copia'),
  restaurarCopia: () => ipcRenderer.invoke('restaurar-copia'),
  // Acerca de: buscar ahora si hay una versión nueva ({ ok, version } / { ok, alDia } / { ok: false, error }) e instalarla.
  buscarActualizacion: () => ipcRenderer.invoke('buscar-actualizacion'),
  actualizarAhora: () => ipcRenderer.send('actualizar-ahora'),
  bienvenidaVista: () => ipcRenderer.send('bienvenida-vista'),
  separarParte: (parte) => ipcRenderer.send('separar-parte', parte), // saca una parte del widget a su propia ventana
  juntarParte: () => ipcRenderer.send('juntar-parte'),
  mostrarParte: (parte) => ipcRenderer.send('mostrar-parte', parte),     // (desde el Panel) trae al frente la ventana de esa franja
  juntarParteDe: (parte) => ipcRenderer.send('juntar-parte-de', parte), // (desde el Panel) devuelve esa franja al Panel               // (desde la ventana de una parte) la devuelve al widget // la bienvenida ya se mostró: no vuelve a salir sola // abre claude.ai → Configuración → Uso en el navegador

  // Ajustes: leer los actuales y guardar nuevos (la app responde { ok } o { ok: false, error }).
  obtenerAjustes: () => ipcRenderer.invoke('obtener-ajustes'),
  guardarAjustes: (datos) => ipcRenderer.invoke('guardar-ajustes', datos),

  // Historial: el uso de cada uno de los últimos 7 días.
  obtenerProductos: (dias) => ipcRenderer.invoke('obtener-productos', dias), // el uso por producto a lo largo del tiempo
  obtenerHistorial: (dias) => ipcRenderer.invoke('obtener-historial', dias),

  // Solo sirve en el modo de prueba (en el modo normal la app no responde a esto).
  prueba: (accion) => ipcRenderer.invoke('prueba', accion),

  // Estirar la ventana arrastrando un borde ('n', 's', 'e', 'w', 'ne', 'nw', 'se' o 'sw'): empieza, termina, y vuelve al tamaño de siempre.
  // (con un panel desplegado se estira el panel: "minimos" es su tamaño de siempre, { alto, ancho })
  redimensionarInicio: (borde, minimos) => ipcRenderer.send('redimensionar-inicio', borde, minimos),
  redimensionarFin: () => ipcRenderer.send('redimensionar-fin'),
  restablecerTamano: () => ipcRenderer.send('restablecer-tamano'),
  altoDelContenido: (alto) => ipcRenderer.send('alto-del-contenido', alto), // (franja del Panel en su ventana) cuánto alto necesita

  // Pide abrir la ventana de inicio de sesión.
  iniciarSesion: () => ipcRenderer.send('iniciar-sesion'),

  // Cuentas de Claude: mostrar otra en la tarjeta, agregar (responde { ok } o { ok: false, error }), renombrar,
  // eliminar, y cerrar o iniciar la sesión de una cuenta.
  activarCuenta: (id) => ipcRenderer.send('cuentas-activar', id),
  panelTodas: (todas) => ipcRenderer.send('panel-todas', todas), // el Panel: "Todas" (true) o una cuenta (false)
  agregarCuenta: (nombre) => ipcRenderer.invoke('cuentas-agregar', nombre),
  renombrarCuenta: (id, nombre) => ipcRenderer.invoke('cuentas-renombrar', id, nombre),
  eliminarCuenta: (id) => ipcRenderer.invoke('cuentas-eliminar', id),
  cerrarSesionDeCuenta: (id) => ipcRenderer.send('cuentas-cerrar-sesion', id),
  iniciarSesionDeCuenta: (id) => ipcRenderer.send('cuentas-iniciar-sesion', id),
});
