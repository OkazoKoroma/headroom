// tema.js: aplica la apariencia elegida en Ajustes (tema, transparencia y modo compacto).
// Lo usa el widget (y su panel de Ajustes). La app principal manda la apariencia con este formato:
//   { tema: 'oscuro' | 'claro' | 'auto', opacidad: 40 a 100,
//     modo: 'normal' | 'compacto' | 'completo' | 'cuentas', todas: true | false, orientacion: 'vertical' | 'horizontal' }

let aparienciaActual = { tema: 'oscuro', opacidad: 100, modo: 'normal', orientacion: 'vertical' };

// Pone el tema (oscuro o claro) y la transparencia. "auto" sigue el tema de Windows.
function aplicarApariencia(apariencia) {
  aparienciaActual = apariencia;

  const windowsEsClaro = window.matchMedia('(prefers-color-scheme: light)').matches;
  const claro = apariencia.tema === 'claro' || (apariencia.tema === 'auto' && windowsEsClaro);
  document.body.dataset.tema = claro ? 'claro' : 'oscuro';

  // La transparencia solo afecta al fondo (el texto y las barras se siguen viendo nítidos).
  document.documentElement.style.setProperty('--op', String(apariencia.opacidad / 100));
  // La vista se refleja en clases del cuerpo, que widget.css usa para acomodar todo:
  //   compacto: una sola línea | completo: barras arriba y paneles abajo | horizontal: barras lado a lado
  //   franja: el estilo de "barras lado a lado" (lo usan la vista horizontal y la completa)
  const modo = apariencia.modo || 'normal';
  const horizontal = modo === 'normal' && apariencia.orientacion === 'horizontal';
  document.body.classList.toggle('compacto', modo === 'compacto');
  document.body.classList.toggle('mini', modo === 'mini');
  // (el panel de control es la vista completa con una sección más de gráficos debajo)
  document.body.classList.toggle('completo', modo === 'completo' || modo === 'tablero');
  document.body.classList.toggle('tablero', modo === 'tablero');
  document.body.classList.toggle('sin-barras', Boolean(apariencia.sinBarras)); // solo números: la tarjeta no dibuja las barras
  document.body.classList.toggle('sin-hoy', Boolean(apariencia.ocultarHoy));    // sin la barra de Hoy
  document.body.classList.toggle('vista-cuentas', modo === 'cuentas');   // la vista "Cuentas" (todas a la vez, sin la tarjeta)
  document.body.classList.toggle('todas', Boolean(apariencia.todas));   // en vez de la tarjeta se ve la lista con todas las cuentas
  document.body.classList.toggle('horizontal', horizontal);
  document.body.classList.toggle('franja', horizontal || modo === 'completo' || modo === 'tablero');
  aplicarExtra(apariencia);
  aplicarColores(apariencia.colores);
}

// Colores propios (Ajustes): el acento cambia en todo el widget; los de las barras los usa colores.js.
// Se ponen en el cuerpo de la página para que valgan en el tema oscuro y en el claro.
function aplicarColores(colores) {
  fijarColores(colores);
  if (colores && colores.acento) {
    document.body.style.setProperty('--acento', colores.acento);
    document.body.style.setProperty('--acento-suave', `color-mix(in srgb, ${colores.acento} 16%, transparent)`);
  } else {
    document.body.style.removeProperty('--acento');
    document.body.style.removeProperty('--acento-suave');
  }
}

// Cuánto estiraste la ventana (alto extra en píxeles): la tarjeta o el panel de abajo crecen lo mismo.
// Mientras arrastras un borde las animaciones se apagan, para que el contenido siga al mouse sin retraso.
function aplicarExtra(apariencia) {
  const extra = apariencia.extra || { ancho: 0, alto: 0 };
  document.documentElement.style.setProperty('--extra-alto', `${extra.alto}px`);
  // Lo que TÚ estiraste (sin lo que creció por las cuentas): el panel de control lo reparte entre arriba y abajo
  document.documentElement.style.setProperty('--extra-estirado', `${Math.max(0, extra.alto - (apariencia.extraPorCuentas || 0))}px`);
  document.body.classList.toggle('redimensionando', Boolean(apariencia.redimensionando));
  // Panel de control: cuánto se achicó la sección de gráficos para caber en la pantalla
  document.documentElement.style.setProperty('--tablero-recorte', `${apariencia.recorteTablero || 0}px`);
  // La tarjeta mide lo que mide su vista, aunque la ventana se ensanche para un panel más ancho (como Ajustes).
  // (Va aquí porque el ancho de la vista también cambia sin cambiar de vista: por ejemplo, al aparecer una columna extra.)
  if (apariencia.anchoVista) document.documentElement.style.setProperty('--ancho-vista', `${apariencia.anchoVista}px`);
  if (apariencia.altoLista) document.documentElement.style.setProperty('--alto-lista', `${apariencia.altoLista}px`);
}

// Si el tema es "auto" y cambias el tema de Windows, el widget lo sigue al instante.
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  aplicarApariencia(aparienciaActual);
});
