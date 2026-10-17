// alertas.js: notificaciones de Windows (los avisos que aparecen en la esquina de la pantalla).
// Todos los textos salen del idioma elegido (ver idiomas.js).

const { Notification } = require('electron');
const { rutaDeAsset } = require('./rutas');
const { t, locale } = require('./idiomas');

// Formato de números según el idioma: coma para los decimales en español (12,5), punto en inglés (12.5).
function formatear(numero) {
  return numero.toLocaleString(locale(), { maximumFractionDigits: 1 });
}

// "No molestar": hasta este momento (en ms) los avisos no se muestran. 0 = los avisos están activos.
let silencioHasta = 0;

function silenciarHasta(momento) {
  silencioHasta = momento;
}

function estaSilenciado() {
  return Date.now() < silencioHasta;
}

// Muestra una notificación de Windows. "opciones": { alHacerClic, siempre } (siempre = aunque estén silenciados,
// para lo que tú mismo pediste, como exportar el historial).
function mostrar(titulo, mensaje, opciones = {}) {
  if (estaSilenciado() && !opciones.siempre) {
    console.log(`Aviso silenciado: ${titulo} | ${mensaje}`);
    return;
  }
  console.log(`Notificación enviada: ${titulo} | ${mensaje}`);
  if (!Notification.isSupported()) return;
  const notificacion = new Notification({
    title: titulo,
    body: mensaje,
    icon: rutaDeAsset('icono.png'),
  });
  if (opciones.alHacerClic) notificacion.on('click', opciones.alHacerClic);
  notificacion.show();
}

// Antepone el nombre de la cuenta al título: "[Trabajo] Llegaste a tu límite...". Sin nombre, el título queda igual.
function conCuenta(titulo, cuenta) {
  return cuenta ? `[${cuenta}] ${titulo}` : titulo;
}

// Envía la alerta del límite diario que corresponda.
//   tipo        → 'aviso' (te acercas al límite) o 'limite' (lo alcanzaste)
//   hoy         → % usado hoy
//   limite      → límite diario en %
//   cuenta      → nombre de la cuenta (solo si hay varias: se antepone al título para saber de cuál es el aviso)
function enviar(tipo, hoy, limite, cuenta) {
  const cuerpo = t('alerta.diario.cuerpo', { hoy: formatear(hoy), limite: formatear(limite) });
  if (tipo === 'limite') {
    mostrar(conCuenta(t('alerta.limite.titulo'), cuenta), cuerpo);
  } else if (tipo === 'aviso') {
    mostrar(conCuenta(t('alerta.aviso.titulo'), cuenta), cuerpo);
  }
}

// Avisa que el historial se guardó en un archivo.
function enviarExportado(cantidad, ruta) {
  mostrar(
    t('alerta.exportado.titulo'),
    cantidad === 1 ? t('alerta.exportado.uno', { ruta }) : t('alerta.exportado.varios', { n: cantidad, ruta }),
    { siempre: true }
  );
}

// Avisa que hay una versión nueva de Headroom. Al hacer clic se abre la página para descargarla.
function enviarVersionNueva(version, alHacerClic) {
  mostrar(t('alerta.version.titulo'), t('alerta.version.cuerpo', { version }), { alHacerClic, siempre: true });
}

// Avisa que claude.ai parece haber cambiado su página y el widget ya no entiende los datos.
function enviarProblemaDeFormato() {
  mostrar(t('alerta.formato.titulo'), t('alerta.formato.cuerpo'));
}

// Envía una alerta de la sesión de 5 horas.
//   tipo           → 'sesion-aviso', 'sesion-limite' o 'sesion-reiniciada'
//   porcentaje     → % usado de la sesión (null si no se conoce)
//   reinicioTexto  → hora a la que se reinicia la sesión, ej. "14:40" (null si no se conoce)
//   cuenta         → nombre de la cuenta (solo si hay varias)
function enviarSesion(tipo, porcentaje, reinicioTexto, cuenta) {
  if (tipo === 'sesion-aviso') {
    const cuando = reinicioTexto ? t('alerta.sesionReinicia', { hora: reinicioTexto }) : '';
    mostrar(
      conCuenta(t('alerta.sesionAviso.titulo'), cuenta),
      t('alerta.sesionAviso.cuerpo', { porcentaje: formatear(porcentaje) }) + cuando
    );
  } else if (tipo === 'sesion-limite') {
    mostrar(
      conCuenta(t('alerta.sesionLimite.titulo'), cuenta),
      reinicioTexto ? t('alerta.sesionLimite.conHora', { hora: reinicioTexto }) : t('alerta.sesionLimite.sinHora')
    );
  } else if (tipo === 'sesion-ritmo') {
    // "porcentaje" aquí es la hora a la que llegarías al límite (ya escrita), y "reinicioTexto" la hora del reinicio.
    mostrar(
      conCuenta(t('alerta.sesionRitmo.titulo'), cuenta),
      t('alerta.sesionRitmo.cuerpo', { hora: porcentaje, reinicio: reinicioTexto })
    );
  } else if (tipo === 'sesion-reiniciada') {
    mostrar(conCuenta(t('alerta.sesionReiniciada.titulo'), cuenta), t('alerta.sesionReiniciada.cuerpo'));
  }
}

// Avisa que la cuota semanal va alta.
function enviarSemana(porcentaje, reinicioTexto, cuenta) {
  mostrar(
    conCuenta(t('alerta.semanaAviso.titulo'), cuenta),
    t('alerta.semanaAviso.cuerpo', { porcentaje: formatear(porcentaje) }) + (reinicioTexto ? t('alerta.semanaAviso.reinicia', { cuando: reinicioTexto }) : '')
  );
}

// Avisa que, a este ritmo, la cuota semanal se agotaría antes del reinicio.
function enviarRitmoSemana(cuandoTexto, reinicioTexto, cuenta) {
  mostrar(conCuenta(t('alerta.semanaRitmo.titulo'), cuenta), t('alerta.semanaRitmo.cuerpo', { cuando: cuandoTexto, reinicio: reinicioTexto }));
}

// Recuerda compactar el chat de Claude Code que se está llenando.
function enviarContexto(porcentaje, chat) {
  mostrar(t('alerta.contexto.titulo'), t('alerta.contexto.cuerpo', { porcentaje: formatear(porcentaje), chat: chat || 'Claude Code' }));
}

// Varios chats a la vez, en un solo aviso: "3 chats ya llevan mucho contexto: «A» 88%, «B» 81%, «C» 75%".
function enviarContextoVarios(chats) {
  const lista = chats.slice(0, 4).map((chat) => `«${chat.titulo || 'Claude Code'}» ${formatear(chat.porcentaje)}%`).join(', ') + (chats.length > 4 ? '…' : '');
  mostrar(t('alerta.contexto.titulo'), t('alerta.contexto.varios', { n: chats.length, lista }));
}

// Resumen de ayer: "Ayer usaste 9% de tu cuota (límite: 14%)".
function enviarResumenDia(uso, limite, cuenta) {
  const clave = uso > limite ? 'alerta.resumenDia.pasado' : 'alerta.resumenDia.cuerpo';
  mostrar(conCuenta(t('alerta.resumenDia.titulo'), cuenta), t(clave, { uso: formatear(uso), limite: formatear(limite) }));
}

// Resumen de la semana que terminó: cuánto usaste y tu día más alto (si se sabe).
function enviarResumenSemana(semana, diaMasAlto, cuenta) {
  const cuerpo = t('alerta.resumenSemana.cuerpo', { semana: formatear(semana) }) +
    (diaMasAlto ? ' ' + t('alerta.resumenSemana.dia', { dia: diaMasAlto.nombre, uso: formatear(diaMasAlto.uso) }) : '');
  mostrar(conCuenta(t('alerta.resumenSemana.titulo'), cuenta), cuerpo);
}

module.exports = {
  enviarContextoVarios, enviarRitmoSemana, enviarResumenDia, enviarResumenSemana, enviarContexto, silenciarHasta, estaSilenciado, enviarVersionNueva, enviar, enviarSesion, enviarSemana, enviarProblemaDeFormato, enviarExportado };
