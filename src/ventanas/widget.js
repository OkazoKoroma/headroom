// widget.js: dibuja el widget (barras, números animados y paneles desplegables).
// Los datos de uso los lee y calcula la app principal (uso.js y calculo.js) y los manda hasta aquí.
// (Las funciones formatear, colorSemanal, colorDiario y las constantes de colores están en colores.js.)

// Si Windows tiene activada la opción de reducir animaciones, no animamos los números.
const REDUCIR_ANIMACIONES = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ----- Barras y textos -----

// Llena una barra. "porcentaje" va de 0 a 100 (o null para dejarla vacía).
// "colorDe" es la función que elige el color según qué tan llena está.
function pintarBarra(idRelleno, porcentaje, colorDe = colorSemanal) {
  const relleno = document.getElementById(idRelleno);
  const real = porcentaje === null ? 0 : Math.max(0, porcentaje);
  const color = colorDe(real / 100);
  // El color se elige con el valor real (puede pasar del 100%: ahí la barra se pone roja),
  // pero la barra nunca se dibuja más ancha que su caja.
  relleno.style.width = `${Math.min(real, 100)}%`;
  relleno.style.setProperty('--c', color);
  // Una barra en rojo late suavemente para llamar la atención.
  relleno.classList.toggle('critico', color === ROJO && porcentaje !== null);
}

// Escribe el texto pequeño de un medidor; "esAviso" lo pinta en amarillo (para errores).
function escribirDetalle(id, texto, esAviso = false) {
  const elemento = document.getElementById(id);
  delete elemento.dataset.reinicio; // ya no es un "Reinicio: ..." (no se actualiza solo)
  elemento.textContent = texto;
  elemento.classList.toggle('aviso', esAviso);
}

// ----- Reinicio: como cuenta regresiva ("en 2 h 15 min") o como hora ("15:06"), según Ajustes -----

let formatoReinicio = 'relativo'; // lo manda la app con la apariencia

// Cuánto falta para una fecha, en palabras cortas: "en 45 min", "en 2 h 15 min", "en 3 d 4 h".
function textoQueFalta(fechaMs) {
  const minutos = Math.round((fechaMs - Date.now()) / 60000);
  if (minutos <= 0) return t('tiempo.ahora');
  if (minutos < 60) return t('tiempo.min', { m: minutos });
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas < 24) return resto ? t('tiempo.horasMin', { h: horas, m: resto }) : t('tiempo.horas', { h: horas });
  const dias = Math.floor(horas / 24);
  const horasResto = horas % 24;
  return horasResto ? t('tiempo.diasHoras', { d: dias, h: horasResto }) : t('tiempo.dias', { d: dias });
}

// Vuelve a escribir un "Reinicio: ..." con lo que falta ahora (o la hora), y deja la otra forma al pasar el mouse.
function pintarReinicio(elemento) {
  const fechaMs = Number(elemento.dataset.reinicio);
  const hora = elemento.dataset.hora;
  const falta = textoQueFalta(fechaMs);
  const prefijo = document.createElement('span');
  prefijo.className = 'prefijo';
  prefijo.textContent = t('reinicio.prefijo');
  elemento.replaceChildren(prefijo, formatoReinicio === 'hora' ? hora : falta);
  elemento.title = formatoReinicio === 'hora' ? falta : hora;
}

// Escribe "Reinicio: ..." en un detalle. La palabra "Reinicio:" va en su propio trozo para poder esconderla
// en la vista horizontal, donde no hay espacio. "fecha" es cuándo se reinicia (para la cuenta regresiva).
function escribirReinicio(id, hora, fecha) {
  const elemento = document.getElementById(id);
  elemento.classList.remove('aviso');
  elemento.dataset.hora = hora;
  elemento.dataset.reinicio = String(fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime());
  pintarReinicio(elemento);
}

// La cuenta regresiva avanza sola: cada 30 segundos se vuelven a escribir todos los "Reinicio: ...".
function actualizarReinicios() {
  for (const elemento of document.querySelectorAll('[data-reinicio]')) pintarReinicio(elemento);
}
setInterval(actualizarReinicios, 30 * 1000);

// Muestra un número que "sube" (o baja) suavemente hasta su valor nuevo, en vez de saltar de golpe.
// "formato" convierte el número en el texto que se ve, ej. (v) => `${formatear(v)}%`.
const valoresMostrados = {}; // el último valor que se mostró en cada elemento
const cuadrosPendientes = {}; // la animación en curso de cada elemento

function animarNumero(id, destino, formato) {
  const elemento = document.getElementById(id);
  const desde = id in valoresMostrados ? valoresMostrados[id] : 0;
  cancelAnimationFrame(cuadrosPendientes[id]);
  valoresMostrados[id] = destino;

  if (REDUCIR_ANIMACIONES || desde === destino) {
    elemento.textContent = formato(destino);
    return;
  }

  const inicio = performance.now();
  const duracion = 700;
  const paso = (ahora) => {
    const avance = Math.min(1, (ahora - inicio) / duracion);
    const suave = 1 - Math.pow(1 - avance, 3); // frena al llegar
    elemento.textContent = formato(desde + (destino - desde) * suave);
    if (avance < 1) cuadrosPendientes[id] = requestAnimationFrame(paso);
  };
  cuadrosPendientes[id] = requestAnimationFrame(paso);
}

// ----- Límites extra por modelo (por ejemplo Fable, en el plan Max) -----

// Una barra por cada límite extra, debajo de Semana. Se crean con la misma forma que los otros medidores.
function dibujarLimitesExtra(extras) {
  const lista = extras || [];
  const contenedor = document.getElementById('extras');
  document.documentElement.style.setProperty('--n-extras', String(lista.length));
  document.documentElement.style.setProperty('--n-medidores', String((document.body.classList.contains('sin-hoy') ? 2 : 3) + lista.length));

  // Si cambió la cantidad o los nombres, se arman de nuevo; si no, solo se actualizan los valores (así los números se animan).
  const firma = lista.map((e) => e.nombre).join('|');
  if (contenedor.dataset.firma !== firma) {
    contenedor.dataset.firma = firma;
    contenedor.replaceChildren();
    lista.forEach((extra, i) => {
      const medidor = document.createElement('div');
      medidor.className = 'medidor';
      medidor.innerHTML = `
        <div class="medidor-texto">
          <span class="etiqueta-con-boton">
            <span class="etiqueta"></span>
            <span class="porcentaje" id="extra-${i}-porcentaje"></span>
            <span class="comparacion" id="extra-${i}-comparacion"></span>
          </span>
          <span class="detalle" id="extra-${i}-detalle"></span>
        </div>
        <div class="barra"><div class="barra-relleno" id="extra-${i}-relleno"></div></div>`;
      medidor.querySelector('.etiqueta').textContent = extra.nombre;

      contenedor.appendChild(medidor);
    });
  }
  lista.forEach((extra, i) => {
    pintarBarra(`extra-${i}-relleno`, extra.porcentaje);
    animarNumero(`extra-${i}-porcentaje`, extra.porcentaje, (v) => `${formatear(v)}%`);
    // Los límites por modelo muestran cuándo se reinician; el crédito extra, cuánto se gastó ("US$16 / US$50")
    ponerAyuda(`extra-${i}-relleno`, extra.detalleTexto !== undefined ? t('ayuda.credito') : t('ayuda.modelo', { nombre: extra.nombre }));
    pintarComparacion(extra.comparacion || null, `extra-${i}`, ''); // contra la semana anterior de ese modelo
    if (extra.detalleTexto !== undefined) escribirDetalle(`extra-${i}-detalle`, extra.detalleTexto);
    else escribirReinicio(`extra-${i}-detalle`, extra.reinicioTexto, extra.reinicio);
  });
}

// ----- Parte separada: esta ventana muestra solo una parte del widget (historial, desglose, proyección o chats) -----
const PARTE = new URLSearchParams(location.search).get('parte'); // null en el widget de siempre
const PARTES_DE_PANEL = ['historial', 'desglose', 'proyeccion', 'productos'];
// El botón junto a la X del panel: saca ese panel a su propia ventana (y lo cierra aquí).
document.getElementById('separar-panel').addEventListener('click', () => {
  if (!PARTES_DE_PANEL.includes(panelActual)) return;
  window.widget.separarParte(panelActual);
  cerrarPanel();
});
document.getElementById('separar-chats').addEventListener('click', () => window.widget.separarParte('chats'));
document.getElementById('juntar-chats').addEventListener('click', () => window.widget.juntarParte());


// En la ventana de una parte: el título y la vista de esa parte (una sola vez; después solo se refresca con los datos).
// Con varias cuentas, el título dice de cuál es ("Historial · Trabajo") o "Todas las cuentas".
let parteMostrada = false;
function mostrarVistaDeLaParte() {
  if (!PARTES_DE_PANEL.includes(PARTE)) return;
  if (!parteMostrada) {
    parteMostrada = true;
    mostrarVistaDelPanel(PARTE);
  }
  document.getElementById('panel-titulo').textContent = tituloDeLaParte();
}

function tituloDeLaParte() {
  const titulo = t(TITULOS_DE_PANEL[PARTE]);
  const cuentas = (ultimosDatos && ultimosDatos.cuentas) || [];
  if (cuentas.length < 2) return titulo;
  if (variasCuentas()) return `${titulo} · ${t('parte.todas')}`;
  const cuenta = cuentas.find((c) => c.id === ultimosDatos.activa);
  return cuenta ? `${titulo} · ${cuenta.nombre}` : titulo;
}

// ----- Modo mínimo -----
const PERIMETRO_MINI = 2 * Math.PI * 27;          // el anillo de afuera (la semana)
const PERIMETRO_MINI_SESION = 2 * Math.PI * 20;   // el de adentro (la sesión de 5 horas)
function pintarMini(uso) {
  const relleno = document.getElementById('mini-relleno');
  const valor = document.getElementById('mini-valor');
  const boton = document.getElementById('mini-boton');
  // Afuera, la semana; adentro, la sesión de 5 horas (lo que se agota sin avisar). El número es el de la sesión
  // (o el de la semana, si claude.ai no entregó una sesión activa).
  const semana = uso ? uso.semana / 100 : 0;
  relleno.style.strokeDasharray = String(PERIMETRO_MINI);
  relleno.style.strokeDashoffset = String(PERIMETRO_MINI * (1 - Math.min(1, semana)));
  relleno.style.stroke = uso ? colorSemanal(semana) : 'transparent';
  const sesion = uso && uso.sesion5h ? uso.sesion5h.porcentaje / 100 : null;
  const rellenoSesion = document.getElementById('mini-relleno-sesion');
  rellenoSesion.style.strokeDasharray = String(PERIMETRO_MINI_SESION);
  rellenoSesion.style.strokeDashoffset = String(PERIMETRO_MINI_SESION * (1 - Math.min(1, sesion || 0)));
  rellenoSesion.style.stroke = sesion !== null ? colorSemanal(sesion) : 'transparent';
  valor.textContent = uso ? `${formatear(Math.round(sesion !== null ? uso.sesion5h.porcentaje : uso.semana))}%` : '—';
  // Al pasar el mouse: todo el resumen
  boton.title = uso
    ? [
      t('hoy.de', { hoy: formatear(uso.hoy), limite: formatear(uso.limiteDiario) }),
      uso.sesion5h ? `${t('sesion.etiqueta')}: ${formatear(uso.sesion5h.porcentaje)}%` : null,
      `${t('semana.etiqueta')}: ${formatear(uso.semana)}%`,
      t('mini.volver'),
    ].filter(Boolean).join('\n')
    : t('mini.volver');
}

// ----- Chats de Claude Code -----
// Una fila por chat: su nombre, una barra con cuánto de su ventana de contexto lleva, y el porcentaje.
// Al pasar el mouse se ven los tokens ("348k / 1M").
const filasDeChats = new Map(); // sesión del chat → sus elementos

function dibujarChats(chats) {
  const lista = document.getElementById('chats-lista');
  document.body.classList.toggle('con-chats', chats.length > 0);
  document.documentElement.style.setProperty('--n-chats', String(chats.length));
  for (const [sesion, fila] of filasDeChats) {
    if (!chats.some((c) => c.sesion === sesion)) {
      fila.raiz.remove();
      filasDeChats.delete(sesion);
    }
  }
  chats.forEach((chat, i) => {
    let fila = filasDeChats.get(chat.sesion);
    if (!fila) {
      const raiz = document.createElement('div');
      raiz.className = 'chat-fila';
      raiz.innerHTML = `
        <span class="chat-nombre"></span>
        <div class="barra"><div class="barra-relleno" id="chat-${i}-${Date.now()}"></div></div>
        <span class="chat-porcentaje"></span>`;
      fila = {
        raiz,
        nombre: raiz.querySelector('.chat-nombre'),
        relleno: raiz.querySelector('.barra-relleno'),
        porcentaje: raiz.querySelector('.chat-porcentaje'),
      };
      filasDeChats.set(chat.sesion, fila);
    }
    lista.appendChild(fila.raiz); // también deja las filas en el orden nuevo (la más reciente arriba)
    fila.nombre.textContent = chat.titulo;
    fila.raiz.title = `${chat.titulo} · ${chat.detalle}`;
    fila.porcentaje.textContent = `${formatear(chat.porcentaje)}%`;
    pintarBarra(fila.relleno.id, chat.porcentaje);
  });
}

// ----- Ayuda de cada barra: al dejar el mouse encima, explica qué muestra -----
function ponerAyuda(idDelRelleno, texto) {
  const medidor = document.getElementById(idDelRelleno).closest('.medidor');
  if (!medidor) return;
  medidor.title = texto;
  medidor.querySelector('.medidor-texto').title = texto;
}

function ponerAyudasDeLasBarras(uso) {
  ponerAyuda('relleno-hoy', t('ayuda.hoy', { hoy: uso ? formatear(uso.hoy) : '—', limite: uso ? formatear(uso.limiteDiario) : '—' }));
  // La sesión también dice a qué hora la agotarías a este ritmo (si se puede estimar)
  const sesion = uso && uso.proyeccion && uso.proyeccion.sesion && uso.sesion5h ? textosDeLaProyeccionDeSesion(uso.proyeccion.sesion, uso.sesion5h.reinicioTexto) : null;
  ponerAyuda('relleno-sesion', sesion && ['llegaras', 'no-llegaras'].includes(uso.proyeccion.sesion.tipo) ? `${t('ayuda.sesion')}\n${sesion.titulo}. ${sesion.detalle}` : t('ayuda.sesion'));
  ponerAyuda('relleno-semana', t('ayuda.semana'));
}

// ----- Comparación con la semana pasada -----
// "c" es { diferencia, antes, aproximado }: cuántos puntos llevas de más (o de menos) que antes a esta misma altura.
// "contra" dice contra qué se compara: '' (la semana pasada), 'hoy.' (ayer a esta hora) o 'sesion.' (la sesión anterior).
// Devuelve { corto: '▲ 12', frase: 'Vas 12 puntos por encima...', tono } (o null si no hay con qué comparar).
function textosDeLaComparacion(c, contra = '') {
  if (!c || !Number.isFinite(c.diferencia)) return null;
  const puntos = Math.abs(c.diferencia);
  // Se dice en porcentaje: cuánto más (o menos) que antes. "Ibas en 10% y vas en 13%" = un 30% más.
  // (si antes ibas en 0, no hay porcentaje que valga: no se compara)
  if (!(c.antes > 0) && puntos >= 1) return null;
  const porcentaje = c.antes > 0 ? Math.round((puntos / c.antes) * 100) : 0;
  const valores = { n: formatear(porcentaje), antes: formatear(c.antes) };
  const tipo = puntos < 1 ? 'igual' : c.diferencia > 0 ? 'arriba' : 'abajo';
  const frase = t(`comp.${contra}${tipo}`, valores) + (c.aproximado ? ' ' + t('comp.aprox') : '');
  return {
    corto: tipo === 'igual' ? '=' : `${tipo === 'arriba' ? '▲' : '▼'} ${formatear(porcentaje)}%`,
    linea: t(`comp.${contra}corto.${tipo}`, valores),
    frase,
    tono: tipo === 'arriba' ? AMARILLO : tipo === 'abajo' ? VERDE : 'var(--texto-suave)',
  };
}

// La marquita junto al % de la semana ("▲ 12"); la frase completa sale al pasar el mouse.
// "donde": 'semana', 'hoy', 'sesion' o la barra de un modelo ('extra-0'...); "contra": con qué frases se dice.
function pintarComparacion(c, donde = 'semana', contra = donde === 'semana' ? '' : donde + '.') {
  const marca = document.getElementById(`${donde}-comparacion`);
  const textos = textosDeLaComparacion(c, contra);
  marca.textContent = textos ? textos.corto : '';
  marca.title = textos ? textos.frase : '';
  if (textos) marca.dataset.vs = t(`comp.${contra}vs`); // "vs. semana pasada": lo muestra la tarjeta vertical
  else delete marca.dataset.vs;
  marca.style.color = textos ? textos.tono : '';
}

// ----- Datos de uso -----

let ultimosDatos = null; // lo último recibido: { uso, error, prueba, activa, cuentas }
let cuentaMostrada = null; // el id de la cuenta que se está mostrando (para enterarse cuando cambia)

// Dibuja las barras con el último dato recibido.
// "datos" tiene la forma { uso: {...} o null, error: 'mensaje' o null, prueba: true/false }
function mostrarUso(datos) {
  ultimosDatos = datos;
  const { uso, error, prueba } = datos;

  // Las cuentas: la pestañita, el panel y el resumen de la vista completa.
  panelCuentas.mostrar(datos);
  if (cuentaMostrada !== null && datos.activa !== cuentaMostrada && panelActual === 'ajustes') {
    panelAjustes.cargar(); // los límites de Ajustes son de la cuenta que se muestra: se cargan los de la nueva
  }
  cuentaMostrada = datos.activa;

  // En el modo de prueba el uso es inventado: una pestañita "PRUEBA" lo avisa para no confundirnos.
  document.body.classList.toggle('prueba', Boolean(prueba));

  dibujarLimitesExtra(error || !uso ? null : uso.limitesExtra);
  dibujarChats(datos.chats || []);
  if (PARTE) mostrarVistaDeLaParte();
  pintarMini(error || !uso ? null : uso);

  ponerAyudasDeLasBarras(error || !uso ? null : uso);
  if (error || !uso) {
    // Con error (o mientras carga) las barras quedan vacías y se explica qué pasa.
    pintarBarra('relleno-hoy', null);
    escribirDetalle('hoy-detalle', '—');
    escribirDetalle('hoy-detalle-corto', '');
    document.getElementById('hoy-porcentaje').textContent = '';
    delete valoresMostrados['hoy-porcentaje'];
    pintarBarra('relleno-semana', null);
    pintarBarra('relleno-sesion', null);
    escribirDetalle('semana-detalle', error ? `⚠ ${error}` : t('lectura.cargando'), Boolean(error));
    escribirDetalle('sesion-detalle', '');
    document.getElementById('semana-porcentaje').textContent = '';
    document.getElementById('sesion-porcentaje').textContent = '';
    pintarComparacion(null);
    pintarComparacion(null, 'hoy');
    pintarComparacion(null, 'sesion');
    delete valoresMostrados['hoy-detalle'];
    delete valoresMostrados['semana-porcentaje'];
    delete valoresMostrados['sesion-porcentaje'];
    refrescarPanel(false);
    return;
  }

  // Hoy: la barra se llena según qué parte del límite diario llevas usada.
  pintarBarra('relleno-hoy', (uso.hoy / uso.limiteDiario) * 100, colorDiario);
  document.getElementById('hoy-detalle').classList.remove('aviso');
  animarNumero('hoy-detalle', uso.hoy, (v) => t('hoy.de', { hoy: formatear(v), limite: formatear(uso.limiteDiario) }));
  // La tarjeta vertical: el número grande aparte y, al lado, el límite y (si se puede estimar) a qué hora llegarías a él
  animarNumero('hoy-porcentaje', uso.hoy, (v) => `${formatear(v)}%`);
  const diaria = uso.proyeccion && uso.proyeccion.diaria;
  escribirDetalle('hoy-detalle-corto', diaria && diaria.tipo === 'llegaras'
    ? t('hoy.de.proy', { limite: formatear(uso.limiteDiario), hora: diaria.cuandoTexto })
    : t('hoy.de.corto', { limite: formatear(uso.limiteDiario) }));

  // Semana: la barra, el porcentaje en número (junto a la etiqueta) y la hora de reinicio.
  pintarComparacion(uso.comparacion);
  pintarComparacion(uso.comparacionHoy, 'hoy');
  pintarComparacion(uso.sesion5h ? uso.comparacionSesion : null, 'sesion');
  pintarBarra('relleno-semana', uso.semana);
  animarNumero('semana-porcentaje', uso.semana, (v) => `${formatear(v)}%`);
  escribirReinicio('semana-detalle', uso.reinicioTexto, uso.reinicio);

  // Sesión de 5 horas (si claude.ai no la entrega, la barra queda vacía)
  if (uso.sesion5h) {
    pintarBarra('relleno-sesion', uso.sesion5h.porcentaje);
    animarNumero('sesion-porcentaje', uso.sesion5h.porcentaje, (v) => `${formatear(v)}%`);
    escribirReinicio('sesion-detalle', uso.sesion5h.reinicioTexto, uso.sesion5h.reinicio);
  } else {
    pintarBarra('relleno-sesion', null);
    document.getElementById('sesion-porcentaje').textContent = '';
    delete valoresMostrados['sesion-porcentaje'];
    escribirDetalle('sesion-detalle', t('sesion.sinActividad'));
  }

  refrescarPanel(false); // datos nuevos: lo que ya está dibujado cambia sin volver a crecer desde cero
}

// ----- Panel desplegable -----
//
// Los íconos de "Hoy" despliegan un panel dentro de la misma ventana (historial, desglose, proyección
// o ajustes). Al abrirlo, la ventana crece (hacia arriba, o hacia abajo si no hay espacio) y al
// cerrarlo vuelve a su tamaño. Cada panel pide su propio alto: Ajustes es más alto que los demás.

// Las claves de los títulos (los textos están en los archivos de idiomas)
const TITULOS_DE_PANEL = {
  historial: 'panel.historial',
  desglose: 'panel.desglose',
  proyeccion: 'panel.proyeccion',
  ajustes: 'panel.ajustes',
  cuentas: 'panel.cuentas',
  bienvenida: 'panel.bienvenida',
  productos: 'panel.productos',
};
// Tamaño que pide cada panel, en píxeles: el alto, y el ancho solo si es más ancho que la vista (Ajustes lo es).
const TAMANOS_DE_PANEL = {
  historial: { alto: 222 },
  desglose: { alto: 226 },
  proyeccion: { alto: 300 },
  ajustes: { alto: 790, ancho: 940, altoCompleto: 950 }, // en la vista completa es más angosto (3 columnas): necesita más alto
  cuentas: { alto: 350 },
  bienvenida: { alto: 390 },
  productos: { alto: 300, ancho: 500 }, // más grande: muchas líneas a lo largo del tiempo
};
const DURACION_PANEL_MS = 340; // debe coincidir con --duracion-panel en widget.css

// Con un panel desplegado se pueden arrastrar los bordes de la ventana para agrandarlo: cada panel recuerda su tamaño
// (lo guarda la app y lo manda con la apariencia). Nunca queda más chico que su tamaño de siempre.
let tamanosGuardadosDePaneles = {}; // { historial: { ancho, alto }, ... }
// El tamaño de siempre de un panel. Con todas las cuentas a la vez, el desglose y la proyección crecen con ellas
// (una línea por cuenta), y el historial deja una línea para la leyenda. (Deben coincidir con main.js → medidasDeParte.)
function tamanoBaseDePanel(nombre) {
  const base = TAMANOS_DE_PANEL[nombre];
  const cuentas = variasCuentas() ? ultimosDatos.cuentas.length : 1;
  if (cuentas < 2) return base;
  if (nombre === 'proyeccion') return { ...base, alto: Math.max(base.alto, 150 + 51 * cuentas) }; // tres tarjetas con una línea por cuenta
  if (nombre === 'desglose') return { ...base, alto: Math.max(base.alto, 150 + 24 * cuentas) };
  if (nombre === 'historial') return { ...base, alto: base.alto + (cuentas >= 3 ? 40 : 0) }; // la leyenda ocupa hasta dos líneas
  return base;
}

function tamanoDePanel(nombre) {
  const base = tamanoBaseDePanel(nombre);
  const guardado = tamanosGuardadosDePaneles[nombre] || {};
  // (solo se recuerda el alto: el ancho es el de la vista, que se estira entera)
  return { alto: Math.max(base.alto, guardado.alto || 0), ancho: base.ancho || 0 };
}

let panelActual = null;        // 'historial', 'desglose', 'proyeccion', 'ajustes', 'cuentas' o null (cerrado)
// En la ventana de una parte (historial, desglose o proyección), ese panel está siempre abierto.
if (PARTE) {
  document.body.classList.add('parte', `parte-${PARTE}`);
  if (PARTES_DE_PANEL.includes(PARTE)) {
    panelActual = PARTE;
    document.body.classList.add('panel-abierto');
    document.getElementById('panel').setAttribute('aria-hidden', 'false');
  }
}
let altoDelPanel = TAMANOS_DE_PANEL.historial.alto; // alto con el que está dibujado el panel ahora
let anchoDelPanel = 0;         // ancho que pidió el panel abierto (0 = el de la vista)
let reabrirPanel = null;       // 'ajustes' o 'cuentas' si ese panel estaba abierto cuando se pidió cerrar el panel para cambiar de vista
let temporizadorCierre = null; // espera a que termine la animación antes de encoger la ventana

// En la vista completa los paneles (historial, desglose y proyección) están siempre a la vista.
const esCompleto = () => document.body.classList.contains('completo');

// Alto del lugar de los tres paneles en la vista completa (igual que en widget.css), y la separación entre la tarjeta y un panel.
const ALTO_PANELES_COMPLETO = 250;
const SEPARACION_PANEL = 8;

// Lo que creció la ventana en la vista completa para que quepa Ajustes: el panel de abajo crece lo mismo.
function ponerAltoExtraCompleto(alto) {
  document.documentElement.style.setProperty('--panel-extra', `${alto}px`);
}

// Ajustes y Cuentas, en la vista completa, ocupan el lugar de esos tres paneles.
const PANELES_EN_LUGAR = ['ajustes', 'cuentas', 'bienvenida', 'productos'];

// ¿Hay que dibujar este panel ahora? Si está abierto, o si la vista completa lo muestra junto a los demás.
function panelVisible(nombre) {
  if (panelActual === nombre) return true;
  return esCompleto() && !PANELES_EN_LUGAR.includes(panelActual) && !PANELES_EN_LUGAR.includes(nombre);
}

const esperar = (milisegundos) => new Promise((resolver) => setTimeout(resolver, milisegundos));

// Guarda el alto del panel donde lo usa el CSS (--panel-alto).
function ponerAltoDelPanel(alto) {
  altoDelPanel = alto;
  document.documentElement.style.setProperty('--panel-alto', `${alto}px`);
}

// Le pide a la app que haga crecer la ventana para un panel de ese alto.
// Si ya había un panel abierto y el nuevo no cabe en la pantalla, se cierra la ventana y se vuelve a abrir
// (así la app puede elegir de nuevo hacia dónde crecer). Devuelve { haciaArriba }.
async function pedirTamanoDeVentana(alto, ancho) {
  let respuesta = await window.widget.ajustarVentana(true, alto, ancho, false, panelActual);
  if (respuesta.noCabe) {
    await window.widget.ajustarVentana(false);
    respuesta = await window.widget.ajustarVentana(true, alto, ancho, false, panelActual);
  }
  return respuesta;
}

async function abrirPanel(nombre) {
  if (panelActual === nombre) return cerrarPanel(); // pulsar el mismo ícono otra vez lo cierra

  // En la vista completa no hay nada que desplegar: los paneles ya están a la vista. Solo Ajustes y Cuentas se abren,
  // y ocupan el lugar de los tres paneles (sin cambiar el tamaño de la ventana).
  if (esCompleto()) {
    if (!PANELES_EN_LUGAR.includes(nombre)) return;
    panelActual = nombre;
    document.body.classList.add('ajustes-abierto');
    marcarIconoActivo();
    mostrarVistaDelPanel(nombre);
    // Si el panel necesita más alto que el lugar de los tres paneles (Ajustes sí), la ventana crece hacia abajo.
    // (en el panel de control, el panel abierto usa también el lugar de los gráficos de abajo)
    // (y como es ancho, Ajustes cabe en sus cuatro columnas: no necesita el alto extra de la vista completa)
    const altoPedido = esTablero() ? TAMANOS_DE_PANEL[nombre].alto : TAMANOS_DE_PANEL[nombre].altoCompleto || TAMANOS_DE_PANEL[nombre].alto;
    const falta = altoPedido - ALTO_PANELES_COMPLETO - extraAlto - (esTablero() ? ALTO_DEL_TABLERO - recorteDelTablero : 0);
    if (falta > 0) {
      const { alto } = await window.widget.ajustarVentana(true, falta - SEPARACION_PANEL, 0, true, panelActual);
      if (panelActual === nombre) ponerAltoExtraCompleto(alto + SEPARACION_PANEL);
    } else {
      ponerAltoExtraCompleto(0);
      await window.widget.ajustarVentana(false);
    }
    return;
  }

  clearTimeout(temporizadorCierre);
  const { alto, ancho } = tamanoDePanel(nombre);
  const estabaCerrado = panelActual === null;
  panelActual = nombre;
  marcarIconoActivo();
  mostrarVistaDelPanel(nombre);

  if (estabaCerrado) {
    // 1. La ventana crece. 2. Recién entonces se anima el panel (así la animación se ve completa).
    const { haciaArriba, anclaDerecha, alto: altoReal } = await pedirTamanoDeVentana(alto, ancho);
    document.body.classList.toggle('ancla-derecha', Boolean(anclaDerecha)); // si la ventana se ensancha, la tarjeta queda en su lado
    ponerAltoDelPanel(altoReal);
    anchoDelPanel = ancho;
    document.body.classList.toggle('abajo', !haciaArriba);
    document.getElementById('panel').setAttribute('aria-hidden', 'false');
    despuesDelProximoCuadro(() => {
      if (panelActual !== null) document.body.classList.add('panel-abierto');
    });
  } else if (alto !== altoDelPanel || ancho !== anchoDelPanel) {
    // Se pasó a otro panel de distinto tamaño: la ventana y el panel cambian de tamaño en el mismo lugar.
    if (alto > altoDelPanel || ancho > anchoDelPanel) {
      const { haciaArriba, alto: altoReal } = await pedirTamanoDeVentana(alto, ancho); // primero crece la ventana...
      document.body.classList.toggle('abajo', !haciaArriba);
      ponerAltoDelPanel(altoReal);                                                     // ...y después el panel se agranda con animación
      anchoDelPanel = ancho;
    } else {
      ponerAltoDelPanel(alto);                                   // primero el panel se achica con animación...
      await esperar(DURACION_PANEL_MS + 40);
      if (panelActual !== null) {
        await window.widget.ajustarVentana(true, alto, ancho, false, panelActual);   // ...y después se achica la ventana
        anchoDelPanel = ancho;
      }
    }
  }
}

// Cierra el panel. Devuelve una promesa que se cumple cuando la ventana ya volvió a su tamaño.
function cerrarPanel() {
  // En la ventana de una parte, la X la devuelve al widget.
  if (PARTE) {
    window.widget.juntarParte();
    return Promise.resolve();
  }
  if (panelActual === null) return Promise.resolve();

  // En la vista completa solo hay que volver a mostrar los tres paneles.
  if (esCompleto()) {
    panelActual = null;
    document.body.classList.remove('ajustes-abierto');
    marcarIconoActivo();
    refrescarPanel();
    ponerAltoExtraCompleto(0);
    return window.widget.ajustarVentana(false);
  }

  panelActual = null;
  anchoDelPanel = 0;
  marcarIconoActivo();
  document.body.classList.remove('panel-abierto');
  document.getElementById('panel').setAttribute('aria-hidden', 'true');

  // Primero se anima el cierre y DESPUÉS se encoge la ventana (si no, se cortaría la animación).
  clearTimeout(temporizadorCierre);
  return new Promise((resolver) => {
    temporizadorCierre = setTimeout(async () => {
      if (panelActual === null) await window.widget.ajustarVentana(false);
      resolver();
    }, DURACION_PANEL_MS + 60);
  });
}

// Resalta (en naranja) el ícono cuyo panel está abierto.
function marcarIconoActivo() {
  // El botón para sacar el panel a su ventana solo está en el historial, el desglose y la proyección (y no en la parte ya separada).
  document.getElementById('separar-panel').style.display = PARTE || !PARTES_DE_PANEL.includes(panelActual) ? 'none' : '';
  for (const boton of document.querySelectorAll('[data-panel]')) {
    boton.setAttribute('aria-pressed', String(boton.dataset.panel === panelActual));
  }
}

// Muestra la vista del panel pedida (y oculta las otras), con su título.
function mostrarVistaDelPanel(nombre) {
  document.getElementById('panel-titulo').textContent = t(TITULOS_DE_PANEL[nombre]);
  for (const clave of Object.keys(TITULOS_DE_PANEL)) {
    const vista = document.getElementById(`vista-${clave}`);
    vista.classList.remove('activa');
    if (clave === nombre) {
      void vista.offsetWidth; // fuerza al navegador a reiniciar la animación de entrada
      vista.classList.add('activa');
    }
  }
  // El formulario se rellena con los valores actuales cada vez que se abre (no cada vez que llegan datos,
  // para no borrar lo que estés escribiendo).
  if (nombre === 'ajustes') panelAjustes.cargar();
  refrescarPanel();
}

// Vuelve a dibujar el contenido del panel abierto (al abrirlo y cada vez que llegan datos nuevos).
// "animar" = las columnas y los tramos crecen desde cero (al abrir un panel o cambiar de vista).
// Con datos nuevos (cada pocos minutos, o cuando cambia un chat de Claude Code) se dibujan ya en su tamaño.
let animarDibujo = true;
function refrescarPanel(animar = true) {
  animarDibujo = animar;
  if (panelVisible('productos')) dibujarProductos();
  if (panelVisible('historial')) dibujarHistorial();
  if (panelVisible('desglose')) dibujarDesglose();
  if (panelVisible('proyeccion')) dibujarProyeccion();
  dibujarTablero();
}

// ----- Estadísticas: lo que se puede saber con lo ya guardado (se muestran en el panel de control) -----
// Ocho fichas (récords, rachas, lo que sobra, límite sugerido, sesiones), el promedio de cada día de la semana
// y un mapa de la semana (día × hora: más color donde más se usa).
const nombreCortoDelDia = (n) => new Date(Date.UTC(2024, 0, 1 + n, 12)).toLocaleDateString(localeActual, { weekday: 'short', timeZone: 'UTC' }).replace('.', ''); // (el 1/1/2024 fue lunes)
// Las fichas con los números (día más alto, promedio, racha...). "datos" es lo que devuelve obtenerEstadisticas.
function pintarFichas(datos, contenedor) {
  const porcentaje = (valor) => `${formatear(valor)}%`;
  const fechaCorta = (dia) => new Date(`${dia}T12:00:00Z`).toLocaleDateString(localeActual, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const fichas = [
    [t('est.masAlto'), datos.masAlto ? porcentaje(datos.masAlto.uso) : '—', datos.masAlto ? fechaCorta(datos.masAlto.dia) : t('est.faltan')],
    [t('est.promedio'), datos.promedio !== null ? porcentaje(datos.promedio) : '—', t('est.de30')],
    [t('est.racha'), t('est.dias', { n: datos.racha }), ''],
    [t('est.sobre'), t('est.dias', { n: datos.sobreElLimite }), t('est.de30')],
    [t('est.sobra'), datos.semanas ? porcentaje(datos.semanas.sobra) : '—', datos.semanas ? t('est.semanas', { n: datos.semanas.cantidad }) : t('est.faltan')],
    [t('est.sugerido'), datos.sugerido ? porcentaje(datos.sugerido.limite) : '—', datos.sugerido ? t('est.sugerido.detalle', { n: datos.sugerido.diasPorSemana }) : t('est.faltan')],
    [t('est.sesiones'), datos.sesiones ? `${datos.sesiones.agotadas7} / ${datos.sesiones.total7}` : '—', datos.sesiones ? t('est.en7') : t('est.faltan')],
    [t('est.horaAgota'), datos.sesiones && datos.sesiones.horaTipica !== null ? `${String(datos.sesiones.horaTipica).padStart(2, '0')}:00` : '—',
      datos.sesiones && datos.sesiones.horaTipica !== null ? t('est.horaAgota.detalle') : t('est.faltan')],
  ];
  contenedor.replaceChildren(...fichas.map(([titulo, valor, detalle]) => {
    const ficha = crear('div', 'est-ficha');
    ficha.append(crear('span', 'est-ficha-titulo', titulo), crear('b', 'est-ficha-valor', valor), crear('span', 'est-ficha-detalle', detalle));
    ficha.title = [datos.nombre, titulo, valor, detalle].filter(Boolean).join(' · ');
    return ficha;
  }));
}

// Por día de la semana (una línea: el promedio de cada día)
function pintarPorDiaDeSemana(datos, en) {
  dibujarLineas({
    series: [{ nombre: t('est.promedio'), color: 'var(--acento)', relleno: true, puntos: datos.porDiaSemana.map((valor, n) => [n, valor]) }],
    marcas: [0, 1, 2, 3, 4, 5, 6].map((n) => ({ x: n, texto: nombreCortoDelDia(n) })),
    limites: datos.limite ? [[0, datos.limite]] : [],
    desde: 0, hasta: 6, conPuntos: true, numeroEn: 'maximo',
    vacio: t('est.faltan'),
    en,
  });
}

// El mapa de la semana: una fila por día, una casilla por hora
function pintarMapa(datos, mapa) {
  const porcentaje = (valor) => `${formatear(valor)}%`;
  mapa.replaceChildren();
  if (!datos.mapa) {
    mapa.appendChild(crear('p', 'grafico-vacio', t('horas.vacio')));
    return;
  }
  const maximo = Math.max(0.01, ...datos.mapa.flat().filter((valor) => valor !== null));
  mapa.appendChild(crear('span', 'est-mapa-dia', ''));
  for (let hora = 0; hora < 24; hora++) mapa.appendChild(crear('span', 'est-mapa-hora', hora % 3 === 0 ? String(hora).padStart(2, '0') : ''));
  datos.mapa.forEach((fila, n) => {
    mapa.appendChild(crear('span', 'est-mapa-dia', nombreCortoDelDia(n)));
    fila.forEach((valor, hora) => {
      const casilla = crear('span', 'est-mapa-casilla');
      if (valor === null) casilla.classList.add('sin-dato');
      else casilla.style.setProperty('--fuerza', String(Math.round((valor / maximo) * 100)));
      casilla.title = `${nombreCortoDelDia(n)} ${String(hora).padStart(2, '0')}:00 · ${valor === null ? '—' : porcentaje(valor)}`;
      mapa.appendChild(casilla);
    });
  });
}

// "Guardar informe…" (en Ajustes): la app pide dónde guardarlo y lo abre en el navegador.
document.getElementById('guardar-informe').addEventListener('click', async () => {
  const mensaje = document.getElementById('mensaje-informe');
  mensaje.textContent = '';
  mensaje.className = 'mensaje-chico';
  const respuesta = await window.widget.guardarInforme();
  if (respuesta.ok) {
    mensaje.textContent = respuesta.mensaje;
    mensaje.className = 'mensaje-chico ok';
  } else if (!respuesta.cancelado) {
    mensaje.textContent = respuesta.error;
    mensaje.className = 'mensaje-chico error';
  }
});

// ----- Panel de control: las fichas con los números y ocho gráficos, debajo de la vista completa -----
const esTablero = () => document.body.classList.contains('tablero');
const ALTO_DEL_TABLERO = 368; // lo que ocupa esa sección con su separación (igual que en widget.css y en main.js)
let turnoDelTablero = 0;      // si llegan dos pedidos seguidos, solo se dibuja el último

async function dibujarTablero() {
  if (!esTablero() || PARTE) return;
  const turno = ++turnoDelTablero;
  const lugar = (id) => ({
    grafico: document.getElementById(`tablero-${id}-grafico`),
    contenedor: document.getElementById(`tablero-${id}`),
    leyenda: document.getElementById(`tablero-${id}-leyenda`),
  });
  const [hoy, dias, horas, productosHoy, productosSemana, semanas, numeros] = await Promise.all([
    window.widget.obtenerHistorial(1), window.widget.obtenerHistorial(30), window.widget.obtenerHistorial('horas'),
    window.widget.obtenerProductos('1'), window.widget.obtenerProductos('semana'), window.widget.obtenerProductos('semanas'),
    window.widget.obtenerEstadisticas(),
  ]);
  if (!esTablero() || turno !== turnoDelTablero) return;
  dibujarGraficoDelDia(hoy, lugar('hoy'));
  dibujarGraficoDeDias(dias, lugar('dias'));
  dibujarGraficoDeHoras(horas, lugar('horas'));
  dibujarProductosEn(productosHoy, lugar('prod-hoy'));
  dibujarProductosEn(productosSemana, lugar('prod-semana'));
  dibujarProductosEn(semanas, lugar('semanas'));
  pintarPorDiaDeSemana(numeros, lugar('por-dia'));
  pintarMapa(numeros, document.getElementById('tablero-mapa'));
  pintarNumerosDelTablero({ hoy, horas, productosHoy, productosSemana, semanas, numeros });
}

// El número grande de cada gráfico del panel de control (y, en chico, qué es), con lo que ya se trajo para dibujarlo.
function pintarNumerosDelTablero({ horas, productosHoy, productosSemana, semanas, numeros }) {
  const porcentaje = (valor) => `${formatear(Math.round(valor * 10) / 10)}%`;
  const poner = (id, grande, chico) => {
    const sitio = document.getElementById(`tablero-${id}-numero`);
    sitio.replaceChildren(crear('b', '', grande), crear('small', '', chico));
  };
  const faltan = (id) => poner(id, '—', t('est.faltan'));
  const uso = ultimosDatos && ultimosDatos.uso;
  // Hoy: cuánto llevas de tu límite
  if (uso) poner('hoy', porcentaje(uso.hoy), t('hoy.de.corto', { limite: formatear(uso.limiteDiario) }));
  else faltan('hoy');
  // Por producto (hoy y esta semana): el que más usó
  const mayor = (datos) => {
    const candidatos = (datos && datos.productos ? datos.productos : []).filter((p) => !p.propio)
      .map((p) => ({ nombre: nombreDeProducto(p), valor: [...p.puntos].reverse().find((punto) => punto[1] !== null) }))
      .filter((p) => p.valor && p.valor[1] > 0);
    return candidatos.sort((a, b) => b.valor[1] - a.valor[1])[0] || null;
  };
  for (const [id, datos] of [['prod-hoy', productosHoy], ['prod-semana', productosSemana], ['semanas', semanas]]) {
    const top = mayor(datos);
    if (top) poner(id, porcentaje(top.valor[1]), top.nombre);
    else faltan(id);
  }
  // Horas de más uso: la hora pico de la cuenta que se muestra
  const cuenta = horas && horas.cuentas && horas.cuentas[0];
  const pico = cuenta && cuenta.dias > 0 && cuenta.horas.some((v) => v > 0) ? cuenta.horas.indexOf(Math.max(...cuenta.horas)) : -1;
  if (pico >= 0) poner('horas', `${String(pico).padStart(2, '0')}–${String(pico + 1).padStart(2, '0')} h`, t('tablero.pico'));
  else faltan('horas');
  // Últimos 30 días: el promedio por día (y el más alto)
  if (numeros.promedio !== null) poner('dias', porcentaje(numeros.promedio), `${t('tablero.porDia')}${numeros.masAlto ? ` · ${porcentaje(numeros.masAlto.uso)} ${t('tablero.masAlto')}` : ''}`);
  else faltan('dias');
  // Por día de la semana: tu día más alto (y la racha)
  const valores = numeros.porDiaSemana || [];
  const indice = valores.reduce((mejor, v, n) => (v !== null && (mejor < 0 || v > valores[mejor]) ? n : mejor), -1);
  if (indice >= 0) poner('por-dia', nombreCortoDelDia(indice), `${t('tablero.diaMasAlto')} · ${t('est.racha').toLowerCase()}: ${t('est.dias', { n: numeros.racha })}`);
  else faltan('por-dia');
  // El mapa: a qué hora sueles agotar la sesión (y cuántas se agotaron)
  if (numeros.sesiones) {
    const hora = numeros.sesiones.horaTipica !== null ? `${String(numeros.sesiones.horaTipica).padStart(2, '0')}:00` : '—';
    poner('mapa', hora, `${t('est.horaAgota').toLowerCase()} · ${t('est.sesiones').toLowerCase()}: ${numeros.sesiones.agotadas7} / ${numeros.sesiones.total7} ${t('est.en7')}`);
  } else faltan('mapa');
}

// Pone cada elemento en su tamaño final: [[elemento, 'height' o 'width', valor], ...].
// Con "animar", parten en 0 y crecen; si no, quedan directo en su tamaño (sin transición ni retraso).
function crecer(lista, animar) {
  if (animar) {
    despuesDelProximoCuadro(() => {
      for (const [elemento, propiedad, valor] of lista) elemento.style[propiedad] = valor;
    });
    return;
  }
  for (const [elemento, propiedad, valor] of lista) {
    elemento.style.transition = 'none';
    elemento.style.transitionDelay = '0s';
    elemento.style[propiedad] = valor;
  }
}

// Espera un par de cuadros para que el navegador registre el estado inicial y la transición se anime.
function despuesDelProximoCuadro(funcion) {
  requestAnimationFrame(() => requestAnimationFrame(funcion));
}

// --- Historial: una columna por cada uno de los últimos 7 días ---

const ALTO_BARRAS_BASE = 96;  // alto máximo de una columna, en píxeles
let extraAlto = 0;            // cuánto estiraste la ventana a lo alto (en la vista completa, el gráfico crece lo mismo)
let recorteDelTablero = 0;    // panel de control: cuánto se achicó la sección de gráficos para caber en la pantalla
const altoDeBarras = () => ALTO_BARRAS_BASE + (esCompleto() || PARTE ? extraAlto : 0);
const ALTO_ETIQUETA_DIA = 18; // espacio que ocupa el nombre del día bajo cada columna

// Nombre corto del día de la semana a partir de "2026-10-02" → "vie".
function nombreDelDia(fechaTexto) {
  // Se usa mediodía en UTC para que la zona horaria no cambie el día.
  const fecha = new Date(`${fechaTexto}T12:00:00Z`);
  return fecha.toLocaleDateString(localeActual, { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
}

// Cuántos días muestra el historial: 7 o 30 (se recuerda en esta computadora).
let diasDelHistorial = 7;
try {
  const guardado = localStorage.getItem('diasDelHistorial');
  if (guardado === '30' || guardado === '1') diasDelHistorial = Number(guardado);
  if (guardado === 'horas') diasDelHistorial = 'horas';
} catch (error) { /* sin almacenamiento: se queda en 7 */ }

function marcarDiasDelHistorial() {
  for (const boton of document.querySelectorAll('[data-dias]')) {
    boton.setAttribute('aria-pressed', String(boton.dataset.dias === String(diasDelHistorial)));
  }
}

for (const boton of document.querySelectorAll('[data-dias]')) {
  boton.addEventListener('click', () => {
    diasDelHistorial = boton.dataset.dias === 'horas' ? 'horas' : [1, 7, 30].includes(Number(boton.dataset.dias)) ? Number(boton.dataset.dias) : 7;
    try { localStorage.setItem('diasDelHistorial', String(diasDelHistorial)); } catch (error) { /* no importa */ }
    marcarDiasDelHistorial();
    dibujarHistorial();
  });
}
marcarDiasDelHistorial();

// ----- Gráfico del día: cómo fue subiendo el uso durante hoy -----
// Eje X: las horas del día (una marca por hora). Eje Y: el uso de hoy en % de la cuota semanal (el mismo número de la tarjeta),
// con tu límite diario como línea punteada. Con varias cuentas, una línea por cuenta.
const NS_SVG = 'http://www.w3.org/2000/svg';

function elementoSvg(nombre, atributos = {}, padre) {
  const elemento = document.createElementNS(NS_SVG, nombre);
  for (const [clave, valor] of Object.entries(atributos)) elemento.setAttribute(clave, String(valor));
  if (padre) padre.appendChild(elemento);
  return elemento;
}

// Curva suave que pasa por todos los puntos. Las tangentes salen de los puntos vecinos (como Catmull-Rom), así las curvas
// son amplias; donde la línea cambia de dirección se aplanan, para que nunca "se pase" de un punto (una subida no parece bajada).
function curvaSuave(puntos) {
  if (puntos.length === 0) return '';
  if (puntos.length === 1) return `M${puntos[0][0]} ${puntos[0][1]}`;
  const n = puntos.length;
  const pendientes = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = puntos[i + 1][0] - puntos[i][0];
    pendientes.push(dx === 0 ? 0 : (puntos[i + 1][1] - puntos[i][1]) / dx);
  }
  const tangentes = [pendientes[0]];
  for (let i = 1; i < n - 1; i++) {
    if (pendientes[i - 1] * pendientes[i] <= 0) { tangentes.push(0); continue; }
    // Catmull-Rom: la pendiente entre el punto anterior y el siguiente, limitada para no pasarse (Fritsch-Carlson)
    const dx = puntos[i + 1][0] - puntos[i - 1][0];
    const catmull = dx === 0 ? 0 : (puntos[i + 1][1] - puntos[i - 1][1]) / dx;
    const tope = 3 * Math.min(Math.abs(pendientes[i - 1]), Math.abs(pendientes[i]));
    tangentes.push(Math.sign(catmull) * Math.min(Math.abs(catmull), tope));
  }
  tangentes.push(pendientes[n - 2]);
  let d = `M${puntos[0][0].toFixed(1)} ${puntos[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = puntos[i];
    const [x1, y1] = puntos[i + 1];
    const tercio = (x1 - x0) / 3;
    d += ` C${(x0 + tercio).toFixed(1)} ${(y0 + tangentes[i] * tercio).toFixed(1)}, ${(x1 - tercio).toFixed(1)} ${(y1 - tangentes[i + 1] * tercio).toFixed(1)}, ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  return d;
}

// Dibuja un gráfico de líneas en el historial. Lo usan el de hoy (eje X: horas) y el de 7 o 30 días (eje X: días).
//   series     → [{ nombre, color, relleno, leyenda, puntos: [[x, valor o null], ...] }] (null = sin dato: la línea se corta)
//   desde/hasta→ el rango del eje X
//   marcas     → [{ x, texto }] las marcas de abajo (texto vacío = solo la rayita)
//   limites    → [[x, límite], ...] tu límite diario (si es igual en todo el rango, una línea recta con su nombre)
//   ahora      → x de "ahora" (una raya vertical fina), o null
//   conPuntos  → dibujar un puntito en cada dato (en 7 días, que son pocos)
//   vacio      → el texto si todavía no hay datos
//   en         → dónde dibujar: { grafico, contenedor, leyenda } (si no se dice, en el historial)
//   numeroEn   → 'final' (el número va al final de la línea) o 'maximo' (va sobre el punto más alto)
function dibujarLineas({ series, desde, hasta, marcas, limites, ahora = null, conPuntos = false, vacio, en = null, numeroEn = 'final' }) {
  const grafico = en ? en.grafico : document.querySelector('#vista-historial .grafico');
  grafico.classList.add('del-dia');
  grafico.classList.remove('largo');
  if (!en) document.getElementById('linea-limite').style.display = 'none';
  const contenedor = en ? en.contenedor : document.getElementById('columnas');
  contenedor.innerHTML = '';
  const leyenda = en ? en.leyenda : document.getElementById('historial-promedio');
  leyenda.replaceChildren();
  leyenda.title = '';
  // La leyenda se arma antes de medir: con tres líneas o más va en su propia línea (completa), y eso le quita alto al gráfico
  for (const serie of series) {
    const item = crear('span', 'leyenda-cuenta');
    const punto = crear('span', serie.punteada ? 'punto punto-hueco' : 'punto');
    punto.style.backgroundColor = serie.punteada ? 'transparent' : serie.color;
    punto.style.borderColor = serie.color;
    item.append(punto, crear('span', '', serie.leyenda || serie.nombre));
    leyenda.appendChild(item);
  }
  // (o si no cabe al lado de los botones, aunque sea una sola: "Pico 21–22 h" en un panel angosto)
  if (leyenda.parentElement) {
    leyenda.parentElement.classList.remove('leyenda-larga');
    const noCabe = leyenda.scrollWidth > leyenda.clientWidth + 1;
    leyenda.parentElement.classList.toggle('leyenda-larga', series.length >= 3 || noCabe);
  }

  const anchoTotal = Math.max(140, contenedor.clientWidth || 260);
  const altoTotal = Math.max(44, contenedor.clientHeight || 150);
  // En un lugar grande (panel agrandado, panel de control a pantalla completa) las letras del gráfico crecen, hasta 1,5 veces
  const k = Math.min(1.5, Math.max(1, Math.min(anchoTotal / 400, altoTotal / 170)));
  const IZQ = Math.round(30 * k);
  const ABAJO = Math.round(16 * k);
  const ancho = anchoTotal - IZQ - 8;
  const alto = altoTotal - ABAJO - 4;
  const valores = series.flatMap((serie) => serie.puntos.map(([, v]) => v).filter((v) => v !== null));
  const limiteMaximo = Math.max(0, ...limites.map(([, l]) => l));
  const maximo = Math.max(limiteMaximo || 1, ...valores) * 1.15;
  const x = (valor) => IZQ + (hasta > desde ? Math.min(1, Math.max(0, (valor - desde) / (hasta - desde))) : 0.5) * ancho;
  const y = (valor) => 4 + alto - (Math.max(0, valor) / maximo) * alto;

  const svg = elementoSvg('svg', { class: 'grafico-dia', width: anchoTotal, height: altoTotal });
  svg.style.setProperty('--k', String(Math.round(k * 100) / 100));
  const defs = elementoSvg('defs', {}, svg);
  const degradado = elementoSvg('linearGradient', { id: `degradado-${contenedor.id}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  elementoSvg('stop', { offset: '0%', 'stop-color': 'var(--acento)', 'stop-opacity': 0.35 }, degradado);
  elementoSvg('stop', { offset: '100%', 'stop-color': 'var(--acento)', 'stop-opacity': 0 }, degradado);

  // Escala de la izquierda: 0, la mitad y el límite (o, si no hay límite, el valor más alto)
  const tope = limiteMaximo || Math.ceil(Math.max(0, ...valores) * 10) / 10;
  for (const valor of tope ? [0, tope / 2, tope] : [0]) {
    elementoSvg('line', { x1: IZQ, x2: IZQ + ancho, y1: y(valor), y2: y(valor), class: 'rejilla' }, svg);
    const texto = elementoSvg('text', { x: IZQ - 5, y: y(valor) + 3 * k, class: 'escala' }, svg);
    texto.textContent = `${formatear(Math.round(valor * 10) / 10)}%`;
  }
  // Tu límite: recto si es igual siempre; si cambia de un día a otro, sigue cada día
  if (limiteMaximo) {
    const iguales = limites.every(([, l]) => l === limites[0][1]);
    const d = iguales
      ? `M${IZQ} ${y(limites[0][1])} H${IZQ + ancho}`
      : limites.map(([lx, l], i) => `${i ? 'L' : 'M'}${x(lx).toFixed(1)} ${y(l).toFixed(1)}`).join(' ');
    elementoSvg('path', { d, class: 'rejilla-limite', fill: 'none' }, svg);
    const nombreLimite = elementoSvg('text', { x: IZQ + 3, y: y(iguales ? limites[0][1] : limiteMaximo) - 3, class: 'escala nombre-limite' }, svg);
    nombreLimite.textContent = t('historial.limite');
  }

  // Marcas de abajo
  // Los textos no se enciman: si uno no cabe junto al anterior (o tapa al último, que siempre va), se deja solo su rayita.
  const anchoDelTexto = (marca) => marca.texto.length * 5.6 * k + 6;
  const ultimaMarca = marcas[marcas.length - 1];
  const topeDerecho = ultimaMarca && ultimaMarca.texto ? x(ultimaMarca.x) - anchoDelTexto(ultimaMarca) : Infinity; // (la última se alinea hacia adentro)
  let ocupadoHasta = -Infinity;
  marcas.forEach((marca, i) => {
    const posicion = x(marca.x);
    const esUltima = i === marcas.length - 1;
    const mitad = marca.texto ? anchoDelTexto(marca) / 2 : 0;
    const cabe = marca.texto && (esUltima || (posicion - mitad >= ocupadoHasta && posicion + mitad <= topeDerecho));
    elementoSvg('line', { x1: posicion, x2: posicion, y1: 4 + alto, y2: 4 + alto + (cabe ? 4 : 2), class: 'marca-hora' }, svg);
    if (!cabe) return;
    ocupadoHasta = posicion + mitad;
    const texto = elementoSvg('text', { x: posicion, y: altoTotal - 2, class: marca.destacada ? 'hora destacada' : 'hora' }, svg);
    // La última se alinea hacia adentro, para que no se corte en el borde
    if (esUltima) texto.style.textAnchor = 'end';
    texto.textContent = marca.texto;
  });
  if (ahora !== null) elementoSvg('line', { x1: x(ahora), x2: x(ahora), y1: 4, y2: 4 + alto, class: 'rejilla-ahora' }, svg);

  let hayPuntos = false;
  const etiquetasFinales = []; // [{ elemento, y }]: se separan al final si quedan encimadas
  for (const serie of series) {
    // Tramos sin cortes (un dato null corta la línea)
    const tramos = [[]];
    for (const [px, valor] of serie.puntos) {
      if (valor === null) { if (tramos[tramos.length - 1].length) tramos.push([]); continue; }
      tramos[tramos.length - 1].push([x(px), y(valor), valor]);
    }
    for (const tramo of tramos) {
      if (tramo.length === 0) continue;
      hayPuntos = true;
      const d = curvaSuave(tramo.map(([px, py]) => [px, py]));
      if (serie.relleno && tramo.length > 1) {
        const ultimo = tramo[tramo.length - 1];
        elementoSvg('path', { d: `${d} L${ultimo[0].toFixed(1)} ${(4 + alto).toFixed(1)} L${tramo[0][0].toFixed(1)} ${(4 + alto).toFixed(1)} Z`, fill: `url(#degradado-${contenedor.id})`, stroke: 'none' }, svg);
      }
      elementoSvg('path', { d, class: serie.punteada ? 'serie punteada' : 'serie', stroke: serie.color }, svg);
      if (conPuntos) for (const [px, py] of tramo) elementoSvg('circle', { cx: px, cy: py, r: 2.2, fill: serie.color }, svg);
    }
    // El último valor, al final de la línea
    const ultimoTramo = tramos.filter((tramo) => tramo.length).pop();
    if (!ultimoTramo) continue;
    const todos = tramos.flat();
    const masAlto = todos.reduce((mayor, punto) => (punto[2] > mayor[2] ? punto : mayor), todos[0]);
    if (numeroEn === 'maximo' && !(masAlto[2] > 0)) continue; // todo en cero: no hay hora más alta que marcar
    const [xf, yf, valorFinal] = numeroEn === 'maximo' ? masAlto : ultimoTramo[ultimoTramo.length - 1];
    elementoSvg('circle', { cx: xf, cy: yf, r: 3, fill: serie.color, class: 'punto-final' }, svg);
    const etiqueta = elementoSvg('text', { x: Math.min(IZQ + ancho - 2, xf + 5), y: Math.max(11, yf - 5), class: 'valor-final' }, svg);
    if (xf + 30 * k > IZQ + ancho) etiqueta.style.textAnchor = 'end';
    etiqueta.setAttribute('fill', serie.color);
    etiqueta.textContent = `${formatear(Math.round(valorFinal * 10) / 10)}%`;
    etiquetasFinales.push({ elemento: etiqueta, y: Math.max(11, yf - 5) });
  }
  // Separar los números que quedaron a menos de 13 px uno de otro (de arriba hacia abajo).
  // Con muchas líneas en un gráfico bajo no caben todos a 13 px: se juntan lo justo y se achican las letras.
  const piso = altoTotal - ABAJO - 2;
  const paso = Math.max(8, Math.min(13 * k, etiquetasFinales.length > 1 ? (piso - 10) / (etiquetasFinales.length - 1) : 13 * k));
  if (paso < 13 * k) for (const { elemento } of etiquetasFinales) elemento.style.fontSize = `${Math.max(7.5, paso - 2).toFixed(1)}px`;
  etiquetasFinales.sort((a, b) => a.y - b.y);
  for (let i = 1; i < etiquetasFinales.length; i++) {
    const minimo = etiquetasFinales[i - 1].y + paso;
    if (etiquetasFinales[i].y < minimo) etiquetasFinales[i].y = minimo;
  }
  // Si el de más abajo se sale por abajo, se suben todos lo necesario (y se vuelven a separar hacia arriba)
  for (let i = etiquetasFinales.length - 1; i >= 0; i--) {
    const techo = i === etiquetasFinales.length - 1 ? piso : etiquetasFinales[i + 1].y - paso;
    if (etiquetasFinales[i].y > techo) etiquetasFinales[i].y = techo;
  }
  for (const { elemento, y: posicion } of etiquetasFinales) elemento.setAttribute('y', String(Math.max(10, posicion)));
  contenedor.appendChild(svg);
  // (el aviso "se va dibujando con cada consulta" solo vale para los gráficos de hoy, que avanzan con cada lectura)
  const pocos = ahora !== null && numeroEn === 'final' && series.every((serie) => serie.puntos.filter(([, v]) => v !== null).length < 2);
  if (!hayPuntos) contenedor.appendChild(crear('p', 'grafico-vacio', vacio));
  else if (pocos) contenedor.appendChild(crear('p', 'grafico-vacio grafico-pocos', t('historial.pocos')));
}

// El gráfico de hoy: eje X = horas del día (una marca por hora), eje Y = el uso de hoy (como la tarjeta).
// "en": dónde dibujar ({ grafico, contenedor, leyenda }); si no se dice, en el panel del historial.
function dibujarGraficoDelDia({ inicioMs, ahoraMs, cuentas }, en = null) {
  const series = cuentas.map((cuenta, i) => {
    // Lecturas del mismo momento: queda la última, para que la línea no haga escalones.
    const puntos = cuenta.puntos.map((p) => [p.t, p.hoy]).sort((p, q) => p[0] - q[0])
      .filter((punto, j, lista) => j === lista.length - 1 || lista[j + 1][0] - punto[0] > 60 * 1000);
    return {
      nombre: cuentas.length === 1 ? t('hoy.etiqueta') : cuenta.nombre,
      color: cuentas.length === 1 ? 'var(--acento)' : colorDeCuenta(i),
      relleno: cuentas.length === 1,
      puntos,
    };
  });
  // Desde la hora de la primera lectura hasta la hora que viene (al menos 6 horas)
  const HORA = 60 * 60 * 1000;
  const tiempos = series.flatMap((serie) => serie.puntos.map(([tiempo]) => tiempo));
  const primeraHora = tiempos.length ? Math.floor((Math.min(...tiempos) - inicioMs) / HORA) : 0;
  let ultimaHora = Math.min(24, Math.ceil((ahoraMs - inicioMs) / HORA) + 1);
  const desdeHora = Math.max(0, Math.min(primeraHora, ultimaHora - 6));
  ultimaHora = Math.max(ultimaHora, Math.min(24, desdeHora + 6));
  const horas = ultimaHora - desdeHora;
  const anchoAprox = ((en ? en.contenedor : document.getElementById('columnas')).clientWidth || 260) - 38;
  const cadaCuanto = anchoAprox / horas >= 30 ? 1 : anchoAprox / horas >= 15 ? 2 : 3;
  const marcas = [];
  for (let hora = desdeHora; hora <= ultimaHora; hora++) {
    marcas.push({ x: inicioMs + hora * HORA, texto: (hora - desdeHora) % cadaCuanto === 0 ? `${String(hora % 24).padStart(2, '0')}:00` : '' });
  }
  const limite = Math.max(0, ...cuentas.map((cuenta) => cuenta.limite || 0));
  dibujarLineas({
    series, marcas, ahora: ahoraMs,
    desde: inicioMs + desdeHora * HORA, hasta: inicioMs + ultimaHora * HORA,
    limites: limite ? [[inicioMs, limite]] : [],
    vacio: t('historial.diaVacio'), en,
  });
}

// El gráfico de 7 o 30 días: eje X = los días, eje Y = el uso de cada día. Con varias cuentas, una línea por cuenta.
function dibujarGraficoDeDias(respuesta, en = null) {
  const varias = variasCuentas() && Array.isArray(respuesta.cuentas) && respuesta.cuentas.length >= 2;
  const cuentas = varias ? respuesta.cuentas : [{ nombre: t('historial.porDia'), dias: respuesta.dias, limiteDiario: respuesta.limiteDiario }];
  const dias = cuentas[0].dias;
  const largo = dias.length > 7;
  const promedioDe = (lista) => {
    const conDato = lista.filter((d) => d.uso !== null);
    return conDato.length ? Math.round((conDato.reduce((suma, d) => suma + d.uso, 0) / conDato.length) * 10) / 10 : null;
  };
  const series = cuentas.map((cuenta, i) => {
    const promedio = promedioDe(cuenta.dias);
    return {
      nombre: cuenta.nombre,
      // En la leyenda: el promedio por día de cada una
      leyenda: promedio === null ? cuenta.nombre
        : varias ? `${cuenta.nombre} ${formatear(promedio)}%` : t('historial.promedio', { valor: formatear(promedio) }),
      color: varias ? colorDeCuenta(i) : 'var(--acento)',
      relleno: !varias,
      puntos: cuenta.dias.map((d, j) => [j, d.uso]),
    };
  });
  // Abajo: el nombre del día (7 días) o el número cada 5 días contando desde hoy (30 días); hoy, destacado.
  const marcas = dias.map((d, j) => {
    const esHoy = d.dia === respuesta.hoy;
    const desdeHoy = dias.length - 1 - j;
    const texto = !largo ? (esHoy ? t('historial.hoy') : nombreDelDia(d.dia))
      : (esHoy ? t('historial.hoy') : desdeHoy % 5 === 0 && desdeHoy > 2 ? String(Number(d.dia.slice(8))) : '');
    return { x: j, texto, destacada: esHoy };
  });
  // Tu límite de cada día (si usas límites por día o el automático, cambia)
  const limites = varias ? [] : dias.map((d, j) => [j, typeof d.limite === 'number' ? d.limite : respuesta.limiteDiario]);
  dibujarLineas({
    series, marcas, limites,
    desde: 0, hasta: dias.length - 1,
    conPuntos: !largo,
    vacio: t('historial.diasVacio'), en,
  });
}

// A qué horas usas más: eje X = las 24 horas del día, eje Y = lo que se usa en promedio en cada hora (% de la cuota semanal).
// Con varias cuentas, una línea por cuenta. El número va sobre la hora más alta.
function dibujarGraficoDeHoras({ cuentas }, en = null) {
  const varias = cuentas.length >= 2;
  const textoDeHora = (hora) => `${String(hora % 24).padStart(2, '0')}:00`;
  const series = cuentas.map((cuenta, i) => {
    const conDatos = cuenta.dias > 0 && cuenta.horas.some((valor) => valor > 0);
    const pico = conDatos ? cuenta.horas.indexOf(Math.max(...cuenta.horas)) : -1;
    const textoDelPico = pico >= 0 ? t('horas.pico', { desde: String(pico), hasta: String(pico + 1) }) : '';
    return {
      nombre: cuenta.nombre,
      leyenda: varias ? (pico >= 0 ? `${cuenta.nombre} ${textoDeHora(pico)}` : cuenta.nombre) : (textoDelPico || t('historial.horas')),
      color: varias ? colorDeCuenta(i) : 'var(--acento)',
      relleno: !varias,
      // Cada hora se dibuja en su mitad (el uso de las 15 es el de 15:00 a 16:00)
      puntos: cuenta.horas.map((valor, hora) => [hora + 0.5, cuenta.dias > 0 ? valor : null]),
    };
  });
  const anchoAprox = ((en ? en.contenedor : document.getElementById('columnas')).clientWidth || 260) - 38;
  const cadaCuanto = anchoAprox / 24 >= 22 ? 2 : anchoAprox / 24 >= 10 ? 3 : 6;
  const marcas = [];
  for (let hora = 0; hora <= 24; hora++) marcas.push({ x: hora, texto: hora % cadaCuanto === 0 ? String(hora % 24).padStart(2, '0') : '' });
  const dias = Math.max(0, ...cuentas.map((cuenta) => cuenta.dias));
  dibujarLineas({
    series, marcas, limites: [],
    desde: 0, hasta: 24,
    numeroEn: 'maximo',
    vacio: t('horas.vacio'), en,
  });
  // Abajo de la leyenda no hay espacio: de cuántos días sale el promedio se dice al pasar el mouse
  (en ? en.leyenda : document.getElementById('historial-promedio')).title = dias ? t('horas.dias', { n: dias }) : '';
}

// ----- Varias cuentas a la vez -----
// Con más de una cuenta (y sin ventanas separadas), el historial, el desglose y la proyección muestran todas las cuentas.
const variasCuentas = () => Boolean(ultimosDatos && ultimosDatos.resumen && (ultimosDatos.cuentas || []).length >= 2);

// Un color para cada cuenta (por su lugar en la lista), para distinguirlas en el historial.
const COLORES_DE_CUENTA = ['#e8895f', '#5fa8e8', '#a78bfa', '#2dd4bf', '#f472b6'];
const colorDeCuenta = (posicion) => COLORES_DE_CUENTA[posicion % COLORES_DE_CUENTA.length];

function crear(etiqueta, clase, texto) {
  const elemento = document.createElement(etiqueta);
  if (clase) elemento.className = clase;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

// Desglose de varias cuentas: una barra dividida por cuenta y, abajo, qué color es cada producto.
function dibujarDesgloseDeVarias(cuentas) {
  const animar = animarDibujo;
  const barraTotal = document.getElementById('barra-total');
  const lista = document.getElementById('lista-desglose');
  barraTotal.innerHTML = '';
  lista.innerHTML = '';
  barraTotal.style.display = 'none';
  document.getElementById('nota-desglose').textContent = t('desglose.notaVarias');

  const productosVistos = new Map(); // clave → { nombre, color }
  const tramos = [];
  for (const cuenta of cuentas) {
    const fila = crear('li', 'fila fila-cuenta');
    const nombre = crear('span', 'nombre-cuenta', cuenta.nombre);
    const barra = crear('div', 'barra-total barra-cuenta');
    if (cuenta.desglose && cuenta.uso) {
      const productos = [...cuenta.desglose].sort((a, b) => b.porcentaje - a.porcentaje);
      productos.forEach((producto, posicion) => {
        const color = COLORES_POR_PRODUCTO[producto.clave] || COLORES_DE_REPUESTO[posicion % COLORES_DE_REPUESTO.length];
        if (!productosVistos.has(producto.clave)) productosVistos.set(producto.clave, { nombre: nombreDeProducto(producto), color });
        if (producto.porcentaje <= 0) return;
        const tramo = crear('div', 'tramo');
        tramo.style.backgroundColor = color;
        tramo.title = `${nombreDeProducto(producto)}: ${formatear(producto.porcentaje)}%`;
        barra.appendChild(tramo);
        tramos.push({ tramo, ancho: producto.porcentaje });
      });
    }
    const semana = crear('span', 'valor-producto', cuenta.uso ? `${formatear(cuenta.uso.semana)}%` : '—');
    semana.title = t('semana.etiqueta');
    fila.append(nombre, barra, semana);
    lista.appendChild(fila);
  }
  // Qué es cada color
  const leyenda = crear('li', 'fila leyenda-productos');
  for (const { nombre, color } of productosVistos.values()) {
    const item = crear('span', 'leyenda-cuenta');
    const punto = crear('span', 'punto');
    punto.style.backgroundColor = color;
    item.append(punto, crear('span', '', nombre));
    leyenda.appendChild(item);
  }
  lista.appendChild(leyenda);
  crecer(tramos.map(({ tramo, ancho }) => [tramo, 'width', `${ancho}%`]), animar);
}

// Proyección de varias cuentas: en cada tarjeta (Hoy y Semana), una línea por cuenta con su color.
function dibujarProyeccionDeVarias(cuentas) {
  for (const clave of ['hoy', 'sesion', 'semana']) {
    const tarjeta = document.getElementById(`proyeccion-${clave}`);
    tarjeta.classList.add('varias');
    tarjeta.style.setProperty('--tono', 'var(--linea)');
    let lineas = tarjeta.querySelector('.proyeccion-cuentas');
    if (!lineas) {
      lineas = crear('div', 'proyeccion-cuentas');
      tarjeta.appendChild(lineas);
    }
    lineas.replaceChildren();
    for (const cuenta of cuentas) {
      const p = cuenta.proyeccion;
      const textos = !p
        ? { titulo: t('proy.sinDatos'), detalle: t('proy.sinDatos.detalle'), tono: '#6e6e78' }
        : clave === 'hoy' ? textosDeLaProyeccionDiaria(p.diaria)
          : clave === 'sesion' ? textosDeLaProyeccionDeSesion(p.sesion || { tipo: 'sin-datos' }, cuenta.sesionReinicioTexto || '')
            : textosDeLaProyeccionSemanal(p.semanal, cuenta.reinicioTexto);
      const linea = crear('div', 'proyeccion-linea');
      linea.style.setProperty('--tono', textos.tono);
      // En la semana, al pasar el mouse: también cómo va contra la semana pasada
      const comparacion = clave === 'semana' ? textosDeLaComparacion(cuenta.comparacion) : null;
      linea.title = comparacion ? `${textos.detalle}\n${comparacion.frase}` : textos.detalle;
      linea.append(crear('span', 'nombre-cuenta', cuenta.nombre), crear('span', 'proyeccion-titulo', textos.titulo));
      lineas.appendChild(linea);
    }
  }
}

// Vuelve los paneles a mostrar una sola cuenta (deshace lo de varias cuentas).
function volverAUnaCuenta() {
  document.getElementById('barra-total').style.display = '';
  document.getElementById('proyeccion-semana-comparacion').textContent = '';
  document.getElementById('proyeccion-hoy-comparacion').textContent = '';
  document.getElementById('proyeccion-sesion-comparacion').textContent = '';
  for (const tarjeta of document.querySelectorAll('.proyeccion.varias')) {
    tarjeta.classList.remove('varias');
    const lineas = tarjeta.querySelector('.proyeccion-cuentas');
    if (lineas) lineas.remove();
  }
}

async function dibujarHistorial() {
  const respuesta = await window.widget.obtenerHistorial(diasDelHistorial);
  if (!panelVisible('historial')) return; // se cerró (o cambió) mientras esperábamos los datos
  if (respuesta.porHora) dibujarGraficoDeHoras(respuesta);
  else if (respuesta.delDia) dibujarGraficoDelDia(respuesta);
  else dibujarGraficoDeDias(respuesta);
}

// Al cambiar el tamaño de la ventana, los gráficos se vuelven a dibujar a su medida (sin animar).
let temporizadorDeRedibujo = null;
const anchosDibujados = new Map(); // lugar → "ancho x alto" con que se dibujó la última vez
const observadorDeTamano = new ResizeObserver((cambios) => {
  for (const cambio of cambios) {
    const { width, height } = cambio.contentRect;
    const medida = `${Math.round(width)}x${Math.round(height)}`;
    if (anchosDibujados.get(cambio.target.id) === medida || width < 20) continue;
    anchosDibujados.set(cambio.target.id, medida);
    clearTimeout(temporizadorDeRedibujo);
    temporizadorDeRedibujo = setTimeout(() => {
      if (panelVisible('historial')) dibujarHistorial();
      if (panelVisible('productos')) dibujarProductos();
          dibujarTablero();
    }, 120);
  }
});
observadorDeTamano.observe(document.getElementById('columnas'));
observadorDeTamano.observe(document.getElementById('productos-columnas'));
observadorDeTamano.observe(document.getElementById('tablero-hoy')); // (las seis celdas del panel de control miden lo mismo)

// --- Uso por producto a lo largo del tiempo ---
// Una línea por producto (con el color de siempre: Claude Code naranja, Chats azul...). Eje Y: % de la cuota semanal que usó.
// "1" (hoy), "semana" (la de tu plan, desde el reinicio), "30" (días) o "semanas" (histórico)
let diasDeProductos = '1';
try {
  const guardado = localStorage.getItem('diasDeProductos');
  if (['1', 'semana', '30', 'semanas'].includes(guardado)) diasDeProductos = guardado;
} catch (error) { /* sin almacenamiento: hoy */ }

function marcarDiasDeProductos() {
  for (const boton of document.querySelectorAll('[data-productos-dias]')) {
    boton.setAttribute('aria-pressed', String(boton.dataset.productosDias === diasDeProductos));
  }
}
for (const boton of document.querySelectorAll('[data-productos-dias]')) {
  boton.addEventListener('click', () => {
    diasDeProductos = boton.dataset.productosDias;
    try { localStorage.setItem('diasDeProductos', String(diasDeProductos)); } catch (error) { /* no importa */ }
    marcarDiasDeProductos();
    dibujarProductos();
  });
}
marcarDiasDeProductos();
document.getElementById('ver-productos').addEventListener('click', () => abrirPanel('productos'));

async function dibujarProductos() {
  const datos = await window.widget.obtenerProductos(diasDeProductos);
  if (!panelVisible('productos')) return;
  dibujarProductosEn(datos, {
    grafico: document.getElementById('productos-grafico'),
    contenedor: document.getElementById('productos-columnas'),
    leyenda: document.getElementById('productos-leyenda'),
    nota: document.getElementById('productos-nota'),
  });
}

// Dibuja el uso por producto en el lugar indicado ("en.nota", si viene, es donde se explica la línea punteada).
function dibujarProductosEn(datos, en) {
  const colorDe = (clave, i) => COLORES_POR_PRODUCTO[clave] || COLORES_DE_REPUESTO[i % COLORES_DE_REPUESTO.length];
  // Los límites por modelo (Fable...) van con línea punteada: su % es de su propio límite semanal, no de la cuota
  const modelos = datos.productos.filter((producto) => producto.propio);
  if (en.nota) {
    en.nota.textContent = modelos.length
      ? `${t('productos.nota')} ${t('productos.notaModelos', { nombres: modelos.map((m) => m.nombre).join(', ') })}`
      : t('productos.nota');
  }
  // (los modelos van primero: así su nombre no se corta en la leyenda cuando hay muchos productos)
  const series = [...modelos, ...datos.productos.filter((producto) => !producto.propio)].map((producto, i) => ({
    nombre: producto.propio ? producto.nombre : nombreDeProducto(producto),
    color: producto.propio ? COLORES_DE_MODELO[modelos.indexOf(producto) % COLORES_DE_MODELO.length] : colorDe(producto.clave, i),
    punteada: Boolean(producto.propio),
    relleno: false,
    // (en "hoy": lecturas del mismo momento, queda la última, para que la línea no haga escalones)
    puntos: datos.delDia
      ? producto.puntos.filter((punto, j, lista) => j === lista.length - 1 || lista[j + 1][0] - punto[0] > 60 * 1000)
      : producto.puntos,
  }));
  if (datos.semanas) {
    // Eje X: las semanas (por el día en que empezó cada una); la última es la semana en curso
    const marcas = datos.semanas.map((semana, j) => ({
      x: j,
      texto: semana.enCurso ? t('productos.estaSemana') : new Date(`${semana.inicio}T12:00:00Z`).toLocaleDateString(localeActual, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      destacada: semana.enCurso,
    }));
    dibujarLineas({
      series, marcas, limites: [], en, conPuntos: true,
      desde: 0, hasta: Math.max(1, datos.semanas.length - 1),
      vacio: t('productos.semanasVacio'),
    });
  } else if (datos.delDia) {
    // Eje X: las horas de hoy (desde la primera lectura)
    const HORA = 60 * 60 * 1000;
    const tiempos = series.flatMap((serie) => serie.puntos.map(([tiempo]) => tiempo));
    const primeraHora = tiempos.length ? Math.floor((Math.min(...tiempos) - datos.inicioMs) / HORA) : 0;
    let ultimaHora = Math.min(24, Math.ceil((datos.ahoraMs - datos.inicioMs) / HORA) + 1);
    const desdeHora = Math.max(0, Math.min(primeraHora, ultimaHora - 6));
    ultimaHora = Math.max(ultimaHora, Math.min(24, desdeHora + 6));
    const anchoAprox = (en.contenedor.clientWidth || 440) - 38;
    const cadaCuanto = anchoAprox / (ultimaHora - desdeHora) >= 30 ? 1 : 2;
    const marcas = [];
    for (let hora = desdeHora; hora <= ultimaHora; hora++) {
      marcas.push({ x: datos.inicioMs + hora * HORA, texto: (hora - desdeHora) % cadaCuanto === 0 ? `${String(hora % 24).padStart(2, '0')}:00` : '' });
    }
    dibujarLineas({
      series, marcas, limites: [], ahora: datos.ahoraMs, en,
      desde: datos.inicioMs + desdeHora * HORA, hasta: datos.inicioMs + ultimaHora * HORA,
      vacio: t('historial.diaVacio'),
    });
  } else {
    // Eje X: los días
    const largo = datos.dias.length > 7;
    const marcas = datos.dias.map((dia, j) => {
      const esHoy = dia === datos.hoy;
      const desdeHoy = datos.dias.length - 1 - j;
      const texto = !largo ? (esHoy ? t('historial.hoy') : nombreDelDia(dia))
        : (esHoy ? t('historial.hoy') : desdeHoy % 5 === 0 && desdeHoy > 2 ? String(Number(dia.slice(8))) : '');
      return { x: j, texto, destacada: esHoy };
    });
    dibujarLineas({
      series, marcas, limites: [], en, conPuntos: !largo,
      desde: 0, hasta: datos.dias.length - 1,
      vacio: t('productos.vacio'),
    });
  }
}

// --- Desglose: barra dividida y lista por producto ---

// Un color fijo para cada producto conocido, para que siempre sea el mismo.
const COLORES_POR_PRODUCTO = {
  claude_code: '#e8895f', // naranja
  chat: '#5fa8e8',        // azul
  cowork: '#a78bfa',      // morado
  other: '#8a8a95',       // gris
};
// Los límites por modelo (Fable...), en "Uso por producto": amarillo (y otros, si algún plan tiene más de uno).
const COLORES_DE_MODELO = ['#f5c542', '#2dd4bf', '#f472b6'];
// Colores de repuesto por si claude.ai agrega un producto nuevo.
const COLORES_DE_REPUESTO = ['#3fbf72', '#f2b84b', '#ec5a5f', '#2dd4bf'];

// El nombre de un producto en el idioma elegido. Si es un producto que no conocemos, se usa el nombre que entrega claude.ai.
function nombreDeProducto(producto) {
  const clave = 'producto.' + producto.clave;
  return existeTexto(clave) ? t(clave) : producto.nombre;
}

function dibujarDesglose() {
  const animar = animarDibujo;
  const barra = document.getElementById('barra-total');
  const lista = document.getElementById('lista-desglose');
  const nota = document.getElementById('nota-desglose');
  if (variasCuentas()) return dibujarDesgloseDeVarias(ultimosDatos.cuentas);
  volverAUnaCuenta();
  barra.innerHTML = '';
  lista.innerHTML = '';

  const uso = ultimosDatos && ultimosDatos.uso;
  if (!uso) {
    nota.textContent = t('desglose.sinDatos');
    return;
  }
  if (!uso.desglose) {
    nota.textContent = t('desglose.sinDesglose');
    return;
  }
  nota.textContent = t('desglose.nota', { semana: formatear(uso.semana) });

  // De mayor a menor
  const productos = [...uso.desglose].sort((a, b) => b.porcentaje - a.porcentaje);
  const tramos = [];

  productos.forEach((producto, posicion) => {
    const color = COLORES_POR_PRODUCTO[producto.clave] || COLORES_DE_REPUESTO[posicion % COLORES_DE_REPUESTO.length];

    // Un tramo de la barra, tan ancho como la parte que le corresponde (los productos en 0% no se dibujan).
    if (producto.porcentaje > 0) {
      const tramo = document.createElement('div');
      tramo.className = 'tramo';
      tramo.style.backgroundColor = color;
      barra.appendChild(tramo);
      tramos.push({ tramo, ancho: producto.porcentaje });
    }

    const fila = document.createElement('li');
    fila.className = 'fila';

    const punto = document.createElement('span');
    punto.className = 'punto';
    punto.style.backgroundColor = color;

    const nombre = document.createElement('span');
    nombre.className = 'nombre-producto';
    nombre.textContent = nombreDeProducto(producto);

    const valor = document.createElement('span');
    valor.className = 'valor-producto';
    valor.textContent = `${formatear(producto.porcentaje)}%`;

    fila.append(punto, nombre, valor);
    lista.appendChild(fila);
  });

  // Los tramos parten con ancho 0 y se abren hasta su tamaño.
  crecer(tramos.map(({ tramo, ancho }) => [tramo, 'width', `${ancho}%`]), animar);
}

// --- Proyección: "a este ritmo..." ---

// Redondea a un decimal para mostrar "~11,5%".
function aproximado(numero) {
  return formatear(Math.round(numero * 10) / 10);
}

// Textos para la proyección de HOY (límite diario). "tono" es el color de la franja lateral.
function textosDeLaProyeccionDiaria(p) {
  const con = (clave, tono, valores) => ({ titulo: t(clave, valores), detalle: t(clave + '.detalle', valores), tono });
  switch (p.tipo) {
    case 'ya-llegaste': return con('proy.dia.yaLlegaste', ROJO);
    case 'llegaras': return con('proy.dia.llegaras', AMARILLO, { hora: p.cuandoTexto });
    case 'no-llegaras': return con('proy.dia.noLlegaras', VERDE, { fin: aproximado(p.fin) });
    case 'sin-uso': return con('proy.dia.sinUso', VERDE);
    default: return con('proy.dia.sinDatos', '#6e6e78');
  }
}

// Textos para la proyección de la SESIÓN de 5 horas.
function textosDeLaProyeccionDeSesion(p, reinicioTexto) {
  const con = (clave, tono, valores) => ({ titulo: t(clave, valores), detalle: t(clave + '.detalle', valores), tono });
  switch (p.tipo) {
    case 'ya-llegaste': return con('proy.sesion.yaLlegaste', ROJO, { reinicio: reinicioTexto });
    case 'llegaras': return con('proy.sesion.llegaras', AMARILLO, { hora: p.cuandoTexto, reinicio: reinicioTexto });
    case 'no-llegaras': return con('proy.sesion.noLlegaras', VERDE, { fin: aproximado(p.fin), reinicio: reinicioTexto });
    case 'sin-uso': return con('proy.sesion.sinUso', VERDE);
    default: return con('proy.sesion.sinDatos', '#6e6e78');
  }
}

// Textos para la proyección de la SEMANA (cuota semanal).
function textosDeLaProyeccionSemanal(p, reinicioTexto) {
  const con = (clave, tono, valores) => ({ titulo: t(clave, valores), detalle: t(clave + '.detalle', valores), tono });
  switch (p.tipo) {
    case 'ya-llegaste': return con('proy.semana.yaLlegaste', ROJO, { reinicio: reinicioTexto });
    case 'llegaras': return con('proy.semana.llegaras', AMARILLO, { cuando: p.cuandoTexto, reinicio: reinicioTexto });
    case 'no-llegaras': return con('proy.semana.noLlegaras', VERDE, { fin: aproximado(p.fin) });
    case 'sin-uso': return con('proy.semana.sinUso', VERDE);
    default: return con('proy.semana.sinDatos', '#6e6e78');
  }
}

function dibujarProyeccion() {
  if (variasCuentas()) return dibujarProyeccionDeVarias(ultimosDatos.cuentas);
  volverAUnaCuenta();
  const uso = ultimosDatos && ultimosDatos.uso;
  const proyeccion = uso && uso.proyeccion;

  const sinDatos = { titulo: t('proy.sinDatos'), detalle: t('proy.sinDatos.detalle'), tono: '#6e6e78' };
  const hoy = proyeccion ? textosDeLaProyeccionDiaria(proyeccion.diaria) : sinDatos;
  const semana = proyeccion ? textosDeLaProyeccionSemanal(proyeccion.semanal, uso.reinicioTexto) : sinDatos;
  const sesion = proyeccion && proyeccion.sesion ? textosDeLaProyeccionDeSesion(proyeccion.sesion, uso.sesion5h ? uso.sesion5h.reinicioTexto : '') : sinDatos;

  for (const [clave, comparacion] of [
    ['semana', textosDeLaComparacion(uso && uso.comparacion)],
    ['hoy', textosDeLaComparacion(uso && uso.comparacionHoy, 'hoy.')],
    ['sesion', textosDeLaComparacion(uso && uso.sesion5h ? uso.comparacionSesion : null, 'sesion.')],
  ]) {
    const lineaDeComparacion = document.getElementById(`proyeccion-${clave}-comparacion`);
    lineaDeComparacion.textContent = comparacion ? comparacion.linea : '';
    lineaDeComparacion.title = comparacion ? comparacion.frase : '';
    lineaDeComparacion.style.color = comparacion ? comparacion.tono : '';
  }
  for (const [clave, textos] of [['hoy', hoy], ['sesion', sesion], ['semana', semana]]) {
    document.getElementById(`proyeccion-${clave}-titulo`).textContent = textos.titulo;
    document.getElementById(`proyeccion-${clave}-detalle`).textContent = textos.detalle;
    document.getElementById(`proyeccion-${clave}`).style.setProperty('--tono', textos.tono);
  }
}

// ----- Estado de la sesión -----

// Escribe el mensaje y el botón de la vista de inicio de sesión, según el estado.
function escribirTextosDeSesion(estado) {
  const expirada = estado === 'expirada';
  document.getElementById('mensaje-sesion').textContent = t(expirada ? 'login.expirada' : 'login.sinSesion');
  document.getElementById('boton-sesion').textContent = t(expirada ? 'login.reentrar' : 'login.iniciar');
}

// Según el estado de la sesión, muestra los datos o el botón para entrar.
let ultimoEstado = null; // el último estado de la sesión recibido
function aplicarEstado(estado) {
  ultimoEstado = estado;
  const vistaDatos = document.getElementById('vista-datos');
  const vistaSesion = document.getElementById('vista-sesion');

  if (estado === 'conectado') {
    vistaDatos.classList.remove('oculto');
    vistaSesion.classList.add('oculto');
    ubicarBarraDeHerramientas();
    return;
  }

  // 'sin-sesion' o 'expirada': mostramos el mensaje y el botón (y cerramos el panel, si estaba abierto;
  // cuando se ven todas las cuentas a la vez no, porque desde ahí mismo se entra y se sale de cada cuenta)
  if (!document.body.classList.contains('todas')) cerrarPanel();
  escribirTextosDeSesion(estado);
  vistaDatos.classList.add('oculto');
  vistaSesion.classList.remove('oculto');
}

// ----- Conexión con el resto de la app -----

// Al hacer clic en el botón, se abre la ventana de claude.ai
document.getElementById('boton-sesion').addEventListener('click', () => {
  window.widget.iniciarSesion();
});

// Cada ícono de "Hoy" despliega su panel (y la pestañita de la cuenta, el de las cuentas); el botón ✕ (o la tecla Escape) lo cierra.
for (const boton of document.querySelectorAll('[data-panel]')) {
  boton.addEventListener('click', () => abrirPanel(boton.dataset.panel));
}
document.getElementById('cerrar-panel').addEventListener('click', cerrarPanel);
// La bienvenida: al cerrarla (con "Entendido" o con la X) queda marcada como vista y no vuelve a salir sola.
document.getElementById('bienvenida-listo').addEventListener('click', cerrarPanel);
document.getElementById('cerrar-panel').addEventListener('click', () => window.widget.bienvenidaVista());
document.getElementById('bienvenida-listo').addEventListener('click', () => window.widget.bienvenidaVista());
document.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    cerrarPanel();
    return;
  }
  // Atajos para la escala de la interfaz: Ctrl + (más grande), Ctrl − (más chico) y Ctrl 0 (vuelve al 100%).
  if (!evento.ctrlKey) return;
  if (evento.key === '+' || evento.key === '=') {
    evento.preventDefault();
    window.widget.cambiarEscala(10);
  } else if (evento.key === '-' || evento.key === '_') {
    evento.preventDefault();
    window.widget.cambiarEscala(-10);
  } else if (evento.key === '0') {
    evento.preventDefault();
    window.widget.fijarEscala(100);
  }
});

// Cuando el estado cambie (entraste, venció la sesión, cerraste sesión), actualizamos la pantalla.
window.widget.alCambiarEstado(aplicarEstado);
// Cuando lleguen datos de uso nuevos (o un error al leerlos), actualizamos las barras.
window.widget.alCambiarUso(mostrarUso);
// Cuando cambie la apariencia (tema, transparencia, vista u orientación), la aplicamos al instante.
// Si cambia la vista o la orientación, se hace con una animación: el contenido se desvanece un instante mientras
// la tarjeta cambia de tamaño (widget.css), y vuelve a aparecer. Así se ve como un "despliegue", sin saltos.
let aparienciaMostrada = null;
function aplicarAparienciaAnimada(apariencia) {
  // Si solo cambió cuánto se estiró la ventana (se llama muchas veces por segundo mientras se arrastra un borde),
  // basta con actualizar eso, sin repintar el resto.
  const antes = aparienciaMostrada;
  const coloresIguales = antes !== null && JSON.stringify(apariencia.colores || null) === JSON.stringify(antes.colores || null);
  const soloTamano = antes !== null && coloresIguales && ['tema', 'opacidad', 'modo', 'orientacion', 'escala', 'todas', 'formatoReinicio', 'sinBarras', 'ocultarHoy']
    .every((clave) => apariencia[clave] === antes[clave]);
  // El formato del reinicio: se aplica al instante a todos los "Reinicio: ...".
  if (apariencia.formatoReinicio && apariencia.formatoReinicio !== formatoReinicio) {
    formatoReinicio = apariencia.formatoReinicio;
    actualizarReinicios();
  }
  const altoAnterior = extraAlto;
  extraAlto = (apariencia.extra && apariencia.extra.alto) || 0;
  recorteDelTablero = apariencia.recorteTablero || 0;
  tamanosGuardadosDePaneles = apariencia.paneles || {};
  if (soloTamano) {
    aparienciaMostrada = apariencia;
    aplicarExtra(apariencia);
    // Si lo que se está estirando es el panel desplegado, el panel sigue a la ventana.
    if (panelActual !== null && !PARTE && !esCompleto() && apariencia.altoPanel) {
      if (apariencia.altoPanel !== altoDelPanel) ponerAltoDelPanel(apariencia.altoPanel);
    }
    // Al terminar de arrastrar (o restablecer), las columnas del historial se redibujan con el alto nuevo.
    if (!apariencia.redimensionando && extraAlto !== altoAnterior) refrescarPanel();
    return;
  }

  const cambiaLaVista = aparienciaMostrada !== null &&
    (apariencia.modo !== aparienciaMostrada.modo || apariencia.orientacion !== aparienciaMostrada.orientacion);
  aparienciaMostrada = apariencia;

  // El tamaño, la vista y la orientación pueden haber cambiado desde fuera (Ctrl + rueda, botones, menú de la bandeja):
  // se reflejan en el formulario de Ajustes.
  if (apariencia.escala !== undefined) panelAjustes.mostrarEscala(apariencia.escala);
  panelAjustes.mostrarVista(apariencia.modo, apariencia.orientacion);
  // Si había un panel abierto y ya no cabía en la pantalla, la app lo achicó: se usa ese alto.
  if (panelActual !== null && apariencia.altoPanel && apariencia.altoPanel !== altoDelPanel) {
    ponerAltoDelPanel(apariencia.altoPanel);
  }

  // Los botones de vista muestran cuál está activa.
  document.getElementById('boton-compacto').setAttribute('aria-pressed', String(apariencia.modo === 'compacto'));
  document.getElementById('boton-completo').setAttribute('aria-pressed', String(apariencia.modo === 'completo'));
  for (const boton of document.querySelectorAll('[data-alternar="compacto"], [data-alternar="completo"], [data-alternar="tablero"]')) {
    boton.setAttribute('aria-pressed', String(apariencia.modo === boton.dataset.alternar));
  }

  const cambiar = () => {
    const eraCompleto = esCompleto();
    aplicarApariencia(apariencia);
    // Con colores nuevos, las barras se vuelven a pintar.
    if (!coloresIguales && ultimosDatos) mostrarUso(ultimosDatos);
    // Al salir de la vista completa con Ajustes (o Cuentas) abierto, ese panel se cierra (ya no está en su lugar).
    // (se vuelve a abrir en la vista nueva, como pasa con los otros cambios de vista)
    if (eraCompleto && !esCompleto() && PANELES_EN_LUGAR.includes(panelActual)) {
      reabrirPanel = panelActual;
      panelActual = null;
      document.body.classList.remove('ajustes-abierto');
      marcarIconoActivo();
    }
    // Al entrar a la vista completa o al cambiar de orientación, se vuelve a dibujar lo que ahora está a la vista.
    refrescarPanel();
  };

  // Si Ajustes (o Cuentas) estaba abierto y hubo que cerrarlo para cambiar de vista, se vuelve a abrir cuando termina el cambio.
  const reabrirSiHaceFalta = () => {
    if (!cambiaLaVista || !reabrirPanel) return;
    const nombre = reabrirPanel;
    reabrirPanel = null;
    setTimeout(() => abrirPanel(nombre), 450);
  };

  if (!cambiaLaVista || REDUCIR_ANIMACIONES) {
    cambiar();
    reabrirSiHaceFalta();
    return;
  }
  document.body.classList.add('cambiando-modo');   // 1. el contenido se desvanece
  setTimeout(() => {
    cambiar();                                      // 2. se cambia de vista: la tarjeta cambia de tamaño
    setTimeout(() => document.body.classList.remove('cambiando-modo'), 150); // 3. el contenido vuelve a aparecer
    reabrirSiHaceFalta();
  }, 140);
}
window.widget.alCambiarApariencia(aplicarAparienciaAnimada);

// Antes de cambiar de modo, la app avisa qué borde de la tarjeta queda quieto (true = el de abajo, false = el de arriba).
// La tarjeta se acomoda contra ese borde, y así no se mueve de lugar mientras cambia de alto.
window.widget.alCambiarAncla((anclaAbajo) => {
  if (panelActual === null && !esCompleto()) document.body.classList.toggle('abajo', !anclaAbajo);
});
// Los botones de vista: el de una barra pasa a la vista compacta, y el de cuatro cuadritos a la completa.
// Pulsar el mismo botón otra vez vuelve a la vista normal.
document.getElementById('boton-compacto').addEventListener('click', () => {
  window.widget.alternarModo('compacto');
});
document.getElementById('boton-completo').addEventListener('click', () => {
  window.widget.alternarModo('completo');
});
// Los botones de la lista de cuentas (cuando se ven todas a la vez): hacen lo mismo que los de la tarjeta.
// "Más" (⋯): muestra u oculta los íconos que no están siempre a la vista; pulsar cualquier otro ícono lo vuelve a cerrar
const botonMas = document.getElementById('boton-mas');
const cerrarMas = () => { document.body.classList.remove('mas-abierto'); botonMas.setAttribute('aria-pressed', 'false'); };
botonMas.addEventListener('click', () => {
  const abierto = document.body.classList.toggle('mas-abierto');
  botonMas.setAttribute('aria-pressed', String(abierto));
});
document.querySelector('.herramientas').addEventListener('click', (evento) => {
  const boton = evento.target.closest('.boton-icono');
  if (boton && boton !== botonMas) cerrarMas();
});

for (const boton of document.querySelectorAll('[data-alternar]')) {
  boton.addEventListener('click', () => {
    if (boton.dataset.alternar === 'orientacion') window.widget.alternarOrientacion();
    else window.widget.alternarModo(boton.dataset.alternar);
  });
}
// El botón de columnas/filas cambia entre la disposición vertical y la horizontal.
document.getElementById('boton-orientacion').addEventListener('click', () => {
  window.widget.alternarOrientacion();
});
// La app pide cerrar el panel antes de cambiar de vista (cambia el tamaño de la ventana).
window.widget.alPedirCerrarPanel(() => {
  reabrirPanel = PANELES_EN_LUGAR.includes(panelActual) ? panelActual : null; // si estabas en Ajustes o Cuentas, se vuelve a abrir cuando termine el cambio
  cerrarPanel();
});
// Cuando el menú de la bandeja pida un panel (Historial, Desglose o Proyección), lo desplegamos.
// "agregar-cuenta" (menú de la bandeja → Agregar cuenta…) abre el panel de cuentas con el cursor listo en el nombre nuevo.
window.widget.alPedirPanel(async (nombre) => {
  const agregar = nombre === 'agregar-cuenta';
  if (agregar) nombre = 'cuentas';
  if (panelActual !== nombre) await abrirPanel(nombre);
  if (agregar) setTimeout(() => document.getElementById('cuentas-nombre-nueva').focus(), 350);
});

// Los bordes y esquinas de la ventana: arrastrarlos la estira (la app mira dónde está el mouse). Doble clic: tamaño de siempre.
for (const agarre of document.querySelectorAll('.agarre')) {
  agarre.addEventListener('pointerdown', (evento) => {
    if (evento.button !== 0) return;
    agarre.setPointerCapture(evento.pointerId); // así el arrastre sigue aunque el mouse salga de la ventana
    // Con un panel desplegado se estira ese panel (se manda su tamaño de siempre, que es el mínimo)
    const conPanel = panelActual !== null && !PARTE && !esCompleto();
    window.widget.redimensionarInicio(agarre.dataset.borde, conPanel ? tamanoBaseDePanel(panelActual) : null);
  });
  const terminar = () => window.widget.redimensionarFin();
  agarre.addEventListener('pointerup', terminar);
  agarre.addEventListener('pointercancel', terminar);
  agarre.addEventListener('dblclick', async () => {
    window.widget.restablecerTamano();
    // Con un panel desplegado: el panel vuelve a su tamaño de siempre
    if (panelActual === null || PARTE || esCompleto()) return;
    const nombre = panelActual;
    delete tamanosGuardadosDePaneles[nombre];
    const { alto, ancho = 0 } = tamanoBaseDePanel(nombre);
    const respuesta = await window.widget.ajustarVentana(true, alto, ancho, false, nombre);
    if (panelActual !== nombre) return;
    ponerAltoDelPanel(respuesta.alto || alto);
    anchoDelPanel = ancho;
  });
}

// Ctrl + rueda del mouse sobre el widget: cambia su tamaño de a 5 puntos (hacia arriba agranda, hacia abajo achica).
// Se agrupan las vueltas de la rueda para no mandar decenas de cambios por segundo.
let pasoPendiente = 0;
let temporizadorRueda = null;
window.addEventListener('wheel', (evento) => {
  if (!evento.ctrlKey) return;
  evento.preventDefault();
  pasoPendiente += evento.deltaY < 0 ? 5 : -5;
  if (temporizadorRueda === null) {
    temporizadorRueda = setTimeout(() => {
      window.widget.cambiarEscala(pasoPendiente);
      pasoPendiente = 0;
      temporizadorRueda = null;
    }, 90);
  }
}, { passive: false });

// En la vista vertical, la barra de íconos va justo después de la palabra "Hoy". Como esa palabra cambia de ancho con el
// idioma (en inglés es "Today"), la posición se calcula con su ancho real.
function ubicarBarraDeHerramientas() {
  const etiqueta = document.getElementById('etiqueta-hoy');
  const tarjeta = document.querySelector('.tarjeta');
  // Posición de la palabra dentro de la tarjeta (se miden las dos en pantalla y se restan; el 1 es el borde de la tarjeta)
  const derecha = etiqueta.getBoundingClientRect().right - tarjeta.getBoundingClientRect().left - 1;
  if (derecha > 0) document.documentElement.style.setProperty('--herramientas-izq', `${Math.round(derecha + 10)}px`);
}

// La tarjeta entra con una animación (crece un poco): se vuelve a medir cuando termina, para que la medida sea exacta.
document.querySelector('.tarjeta').addEventListener('animationend', ubicarBarraDeHerramientas);

// Cuando cambie el idioma (desde Ajustes), se vuelven a escribir todos los textos al instante.
function aplicarIdioma(datos) {
  definirIdioma(datos);                       // i18n.js: guarda los textos y reescribe los textos fijos de la página
  if (panelActual) document.getElementById('panel-titulo').textContent = PARTE ? tituloDeLaParte() : t(TITULOS_DE_PANEL[panelActual]);
  if (ultimoEstado && ultimoEstado !== 'conectado') escribirTextosDeSesion(ultimoEstado);
  if (ultimosDatos) mostrarUso(ultimosDatos); // los textos con números y fechas
  refrescarPanel();                           // el panel abierto (nombres de días, proyección...)
  panelAjustes.traducir();                    // los textos que arma el formulario de Ajustes
  ubicarBarraDeHerramientas();                // la palabra "Hoy" cambia de ancho con el idioma
}
window.widget.alCambiarIdioma(aplicarIdioma);

// Al abrir: primero se pide el idioma (para no mostrar textos a medias), y después la apariencia, el estado
// y el último dato que la app ya tenga.
window.widget.obtenerIdioma().then((datos) => {
  definirIdioma(datos);
  panelAjustes.traducir();
  ubicarBarraDeHerramientas();
  window.widget.obtenerApariencia().then(aplicarAparienciaAnimada);
  window.widget.obtenerEstado().then(aplicarEstado);
  window.widget.obtenerUso().then(mostrarUso);
});
