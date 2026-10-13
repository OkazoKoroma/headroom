// panel-ajustes.js: el panel de Ajustes (el formulario que se despliega dentro del widget).
// Muestra los ajustes actuales, revisa lo que escribes y se los entrega a la app para guardarlos.
// La app los aplica al instante: no hace falta cerrar ni volver a abrir nada.
//
// Todo va dentro de una función para no mezclar nombres con los de widget.js.
// Lo único que se comparte hacia afuera es "panelAjustes.cargar()", que widget.js llama cada vez
// que se abre el panel, para que el formulario muestre siempre los valores actuales.

const panelAjustes = (() => {
  const campoLimite = document.getElementById('limiteDiario');
  const campoAviso = document.getElementById('umbralAviso');
  const campoUsarLimitesPorDia = document.getElementById('usarLimitesPorDia');
  const campoLimiteAuto = document.getElementById('limiteAutomatico');
  const ayudaLimiteAuto = document.getElementById('ayuda-limite-auto');
  let limiteDeHoy = null; // el límite que rige hoy (con el automático, el que calculó Headroom)

  // Con el límite automático, el límite fijo y los límites por día no se usan: se apagan, y la ayuda dice cuánto toca hoy.
  function mostrarLimiteAuto() {
    const auto = campoLimiteAuto.checked;
    campoLimite.disabled = auto;
    campoUsarLimitesPorDia.disabled = auto;
    document.getElementById('casilla-limites-por-dia').classList.toggle('apagada', auto);
    if (auto) mostrarCajitasDeDias(false);
    else mostrarCajitasDeDias(campoUsarLimitesPorDia.checked);
    ayudaLimiteAuto.textContent = auto && limiteDeHoy !== null
      ? t('aj.limiteAuto.hoy', { limite: String(limiteDeHoy).replace('.', ',') })
      : t('aj.limiteAuto.ayuda');
  }
  const cajaDias = document.getElementById('dias');
  const filaDias = document.getElementById('dias-fila');
  const campoIntervalo = document.getElementById('intervaloMin');
  const campoAlertasSesion = document.getElementById('alertasSesion');
  const campoUmbralSesion = document.getElementById('umbralSesion');
  const campoAlertasSemana = document.getElementById('alertasSemana');
  const campoAvisoRitmo = document.getElementById('avisoRitmo');
  const campoFormatoReinicio = document.getElementById('formatoReinicio');
  const campoIconoDeColor = document.getElementById('iconoDeColor');
  const campoAtajo = document.getElementById('atajoGlobal');
  const campoResumenes = document.getElementById('resumenes');
  const campoSeguirAClaude = document.getElementById('seguirAClaude');
  const campoSinBarras = document.getElementById('sinBarras');
  const campoOcultarHoy = document.getElementById('ocultarHoy');
  const campoConsultaRapida = document.getElementById('consultaRapida');
  const campoRitmoSemana = document.getElementById('avisoRitmoSemana');
  const campoActualizaciones = document.getElementById('buscarActualizaciones');
  const campoPausarOculto = document.getElementById('pausarOculto');
  const camposDeColor = {
    acento: document.getElementById('color-acento'),
    verde: document.getElementById('color-verde'),
    amarillo: document.getElementById('color-amarillo'),
    rojo: document.getElementById('color-rojo'),
  };
  let coloresPropios = false; // true si cambiaste algún color (si no, se guardan los de siempre)

  function mostrarColores(colores) {
    for (const [clave, campo] of Object.entries(camposDeColor)) campo.value = (colores || COLORES_DE_SIEMPRE)[clave];
  }
  const campoUmbralSemana = document.getElementById('umbralSemana');
  const campoContextoVisible = document.getElementById('contextoVisible');
  const campoAvisoContexto = document.getElementById('avisoContexto');
  const campoUmbralContexto = document.getElementById('umbralContexto');
  const campoTamanoContexto = document.getElementById('tamanoContexto');
  const campoTema = document.getElementById('tema');
  const campoIdioma = document.getElementById('idioma');
  const campoEscala = document.getElementById('escala');
  const textoEscala = document.getElementById('escala-valor');
  const campoOpacidad = document.getElementById('opacidad');
  const textoOpacidad = document.getElementById('opacidad-valor');
  const campoModo = document.getElementById('modo');
  const campoOrientacion = document.getElementById('orientacion');
  const campoTodas = document.getElementById('todasLasCuentas');
  const campoSeparadas = document.getElementById('ventanasSeparadas');
  const campoEncima = document.getElementById('siempreEncima');
  const campoArranque = document.getElementById('arrancarConWindows');
  const formulario = document.getElementById('formulario-ajustes');
  const mensaje = document.getElementById('mensaje-ajustes');
  const mensajeExportar = document.getElementById('mensaje-exportar');
  const mensajeCopia = document.getElementById('mensaje-copia');
  const botonActualizacion = document.getElementById('buscar-actualizacion');
  const mensajeActualizacion = document.getElementById('mensaje-actualizacion');
  let acercaDe = { version: '', autor: '', versionNueva: null }; // lo que muestra "Acerca de"

  // Acerca de: la versión instalada y quién la hizo. Si ya hay una versión nueva esperando, el botón pasa a "Actualizar a la X".
  function mostrarAcercaDe() {
    document.getElementById('acerca-version').textContent = t('acerca.version', { version: acercaDe.version });
    document.getElementById('acerca-credito').textContent = t('acerca.credito', { autor: acercaDe.autor });
    botonActualizacion.textContent = acercaDe.versionNueva ? t('acerca.actualizar', { version: acercaDe.versionNueva }) : t('acerca.buscar');
    botonActualizacion.classList.toggle('destacado', Boolean(acercaDe.versionNueva));
  }

  function decirDeLaActualizacion(texto, tipo = '') {
    mensajeActualizacion.textContent = texto;
    mensajeActualizacion.className = `mensaje-chico ${tipo}`.trim();
  }

  botonActualizacion.addEventListener('click', async () => {
    // Ya se encontró una versión nueva: este clic la descarga y la instala (la app se cierra y se vuelve a abrir sola)
    if (acercaDe.versionNueva) {
      window.widget.actualizarAhora();
      decirDeLaActualizacion(t('acerca.descargando'), 'ok');
      return;
    }
    botonActualizacion.disabled = true;
    decirDeLaActualizacion(t('acerca.buscando'));
    const respuesta = await window.widget.buscarActualizacion();
    botonActualizacion.disabled = false;
    if (!respuesta.ok) return decirDeLaActualizacion(respuesta.error, 'error');
    if (respuesta.alDia) return decirDeLaActualizacion(t('acerca.alDia'), 'ok');
    acercaDe.versionNueva = respuesta.version;
    mostrarAcercaDe();
    decirDeLaActualizacion(t('acerca.hayNueva', { version: respuesta.version }), 'ok');
  });
  const tituloLimite = document.getElementById('titulo-limite');
  let nombreDeCuenta = null; // nombre de la cuenta a la que pertenecen los límites (null si hay una sola cuenta)

  const DIAS = [0, 1, 2, 3, 4, 5, 6]; // de lunes a domingo (sus nombres cortos salen del idioma: 'aj.dia.0'...)
  const camposDeDias = []; // las 7 cajitas, en el mismo orden
  const textosDeDias = []; // el texto de cada letra (Lu, Ma... o Mo, Tu...), para cambiarlo con el idioma

  // Escribe un mensaje junto al botón Guardar. "tipo" es 'ok' (verde) o 'error' (amarillo).
  function decir(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = tipo;
  }

  // Cambia la coma por punto, para aceptar "12,5" además de "12.5" (formato chileno).
  function aNumero(texto) {
    return Number(String(texto).replace(',', '.'));
  }

  // Crea las siete cajitas de los límites por día.
  function crearCajitasDeDias() {
    DIAS.forEach((posicion) => {
      const etiqueta = document.createElement('label');
      etiqueta.className = 'dia';
      textosDeDias[posicion] = document.createTextNode('');
      etiqueta.append(textosDeDias[posicion]);

      const campo = document.createElement('input');
      campo.type = 'number';
      campo.min = '1';
      campo.max = '100';
      campo.step = '0.5';
      camposDeDias[posicion] = campo;

      etiqueta.appendChild(campo);
      filaDias.appendChild(etiqueta);
    });
  }

  // Muestra u oculta las siete cajitas. Al mostrarlas por primera vez se rellenan con el límite general.
  function mostrarCajitasDeDias(mostrar) {
    cajaDias.hidden = !mostrar;
    if (mostrar) {
      for (const campo of camposDeDias) {
        if (campo.value === '') campo.value = campoLimite.value;
      }
    }
  }

  // Muestra el porcentaje de la barra de transparencia.
  function mostrarOpacidad() {
    textoOpacidad.textContent = `${campoOpacidad.value}%`;
  }

  // Muestra el tamaño del widget en % junto a su barra.
  function mostrarEscala(valor) {
    if (valor !== undefined) campoEscala.value = valor;
    textoEscala.textContent = `${campoEscala.value}%`;
  }

  // El texto de una opción del intervalo de consulta ("15 minutos", "1 hora").
  function textoDelIntervalo(minutos) {
    return minutos === 60 ? t('aj.intervalo.hora') : t('aj.intervalo.minutos', { n: minutos });
  }

  // El título de la sección de límites: con varias cuentas dice de cuál son ("Límite diario · Trabajo").
  function escribirTituloDelLimite() {
    tituloLimite.textContent = nombreDeCuenta
      ? t('aj.seccion.limiteDe', { nombre: nombreDeCuenta })
      : t('aj.seccion.limite');
  }

  // Escribe los textos que arma este formulario en el idioma activo: las letras de los días y las opciones del intervalo.
  // Se llama al abrir la pantalla y cada vez que cambia el idioma.
  function traducir() {
    escribirTituloDelLimite();
    DIAS.forEach((posicion) => {
      const nombre = t('aj.dia.' + posicion);
      textosDeDias[posicion].nodeValue = nombre;
      camposDeDias[posicion].setAttribute('aria-label', t('aj.dia.aria', { dia: nombre }));
    });
    for (const opcion of campoIntervalo.options) opcion.textContent = textoDelIntervalo(Number(opcion.value));
    mostrarAcercaDe();
  }

  // Rellena el formulario con los ajustes que tiene la app ahora.
  async function cargar() {
    const actuales = await window.widget.obtenerAjustes();

    campoIntervalo.innerHTML = '';
    for (const minutos of actuales.opcionesIntervalo) {
      const opcion = document.createElement('option');
      opcion.value = String(minutos);
      opcion.textContent = textoDelIntervalo(minutos);
      campoIntervalo.appendChild(opcion);
    }

    nombreDeCuenta = actuales.nombreDeCuenta;
    escribirTituloDelLimite();
    campoLimite.value = actuales.limiteDiario;
    campoAviso.value = actuales.umbralAviso;
    campoIntervalo.value = String(actuales.intervaloMin);
    campoAlertasSesion.checked = actuales.alertasSesion;
    campoUmbralSesion.value = actuales.umbralSesion;
    campoAlertasSemana.checked = actuales.alertasSemana;
    campoAvisoRitmo.checked = actuales.avisoRitmo;
    campoFormatoReinicio.value = actuales.formatoReinicio;
    campoIconoDeColor.checked = actuales.iconoDeColor;
    campoAtajo.checked = actuales.atajoGlobal;
    campoResumenes.checked = actuales.resumenes;
    campoSeguirAClaude.checked = actuales.seguirAClaude;
    campoSinBarras.checked = actuales.sinBarras;
    campoOcultarHoy.checked = actuales.ocultarHoy === true;
    campoConsultaRapida.checked = actuales.consultaRapida;
    campoRitmoSemana.checked = actuales.avisoRitmoSemana;
    campoActualizaciones.checked = actuales.buscarActualizaciones;
    campoPausarOculto.checked = actuales.pausarOculto;
    coloresPropios = Boolean(actuales.colores);
    mostrarColores(actuales.colores);
    campoUmbralSemana.value = actuales.umbralSemana;
    campoContextoVisible.checked = actuales.contextoVisible;
    campoAvisoContexto.checked = actuales.avisoContexto;
    campoUmbralContexto.value = actuales.umbralContexto;
    campoTamanoContexto.value = actuales.tamanoContexto;
    campoTema.value = actuales.tema;
    campoIdioma.value = actuales.idioma;
    campoOpacidad.value = actuales.opacidad;
    mostrarOpacidad();
    mostrarEscala(actuales.escala);
    campoModo.value = actuales.modo;
    campoOrientacion.value = actuales.orientacion;
    campoTodas.checked = actuales.todasLasCuentas;
    campoSeparadas.checked = actuales.ventanasSeparadas;
    campoEncima.checked = actuales.siempreEncima;
    campoArranque.checked = actuales.arrancarConWindows;

    // Límites por día: si hay una lista guardada, se muestran las cajitas con esos valores.
    const hayLimitesPorDia = Array.isArray(actuales.limitesPorDia);
    campoUsarLimitesPorDia.checked = hayLimitesPorDia;
    camposDeDias.forEach((campo, posicion) => {
      campo.value = hayLimitesPorDia ? actuales.limitesPorDia[posicion] : '';
    });
    mostrarCajitasDeDias(hayLimitesPorDia);
    campoLimiteAuto.checked = actuales.limiteAutomatico;
    limiteDeHoy = actuales.limiteDeHoy;
    mostrarLimiteAuto();

    acercaDe = { version: actuales.version, autor: actuales.autor, versionNueva: actuales.versionNueva };
    mostrarAcercaDe();
    decirDeLaActualizacion(actuales.versionNueva ? t('acerca.hayNueva', { version: actuales.versionNueva }) : '', actuales.versionNueva ? 'ok' : '');

    decir('', '');
    mensajeExportar.textContent = '';
    mensajeCopia.textContent = '';
  }

  // Colores: al tocar uno, pasan a ser "propios"; Restablecer vuelve a los de siempre (se aplica al pulsar Guardar).
  for (const campo of Object.values(camposDeColor)) campo.addEventListener('input', () => { coloresPropios = true; });
  document.getElementById('colores-restablecer').addEventListener('click', () => {
    coloresPropios = false;
    mostrarColores(null);
    decir('', '');
  });

  campoLimiteAuto.addEventListener('change', mostrarLimiteAuto);
  campoUsarLimitesPorDia.addEventListener('change', () => {
    mostrarCajitasDeDias(campoUsarLimitesPorDia.checked);
  });
  campoOpacidad.addEventListener('input', mostrarOpacidad);
  campoEscala.addEventListener('input', () => mostrarEscala());
  // La escala se aplica apenas sueltas la barra (sin esperar a "Guardar"), para ver el resultado al instante.
  campoEscala.addEventListener('change', () => window.widget.fijarEscala(Number(campoEscala.value)));
  // Los tamaños rápidos (70%, 85%, 100%, 125%, 150%) también se aplican al instante.
  for (const boton of document.querySelectorAll('[data-escala]')) {
    boton.addEventListener('click', () => {
      campoEscala.value = boton.dataset.escala;
      mostrarEscala();
      window.widget.fijarEscala(Number(boton.dataset.escala));
    });
  }

  // Al pulsar Guardar: se revisa y se manda a la app.
  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const respuesta = await window.widget.guardarAjustes({
      limiteDiario: aNumero(campoLimite.value),
      umbralAviso: aNumero(campoAviso.value),
      intervaloMin: Number(campoIntervalo.value),
      limitesPorDia: campoUsarLimitesPorDia.checked ? camposDeDias.map((c) => aNumero(c.value)) : null,
      limiteAutomatico: campoLimiteAuto.checked,
      alertasSesion: campoAlertasSesion.checked,
      umbralSesion: aNumero(campoUmbralSesion.value),
      alertasSemana: campoAlertasSemana.checked,
      avisoRitmo: campoAvisoRitmo.checked,
      formatoReinicio: campoFormatoReinicio.value,
      iconoDeColor: campoIconoDeColor.checked,
      atajoGlobal: campoAtajo.checked,
      resumenes: campoResumenes.checked,
      seguirAClaude: campoSeguirAClaude.checked,
      sinBarras: campoSinBarras.checked,
      ocultarHoy: campoOcultarHoy.checked,
      consultaRapida: campoConsultaRapida.checked,
      avisoRitmoSemana: campoRitmoSemana.checked,
      buscarActualizaciones: campoActualizaciones.checked,
      pausarOculto: campoPausarOculto.checked,
      colores: coloresPropios
        ? Object.fromEntries(Object.entries(camposDeColor).map(([clave, campo]) => [clave, campo.value]))
        : null,
      umbralSemana: aNumero(campoUmbralSemana.value),
      contextoVisible: campoContextoVisible.checked,
      avisoContexto: campoAvisoContexto.checked,
      umbralContexto: aNumero(campoUmbralContexto.value),
      tamanoContexto: campoTamanoContexto.value,
      tema: campoTema.value,
      idioma: campoIdioma.value,
      opacidad: Number(campoOpacidad.value),
      escala: Number(campoEscala.value),
      modo: campoModo.value,
      orientacion: campoOrientacion.value,
      todasLasCuentas: campoTodas.checked,
      ventanasSeparadas: campoSeparadas.checked,
      siempreEncima: campoEncima.checked,
      arrancarConWindows: campoArranque.checked,
    });

    if (respuesta.ok) {
      decir(t('aj.guardado'), 'ok');
    } else {
      decir(respuesta.error, 'error');
    }
  });

  // Si empiezas a cambiar algo de nuevo, se borra el mensaje anterior.
  formulario.addEventListener('input', () => decir('', ''));

  // Exportar el historial: la app muestra el cuadro de "Guardar como" y responde cómo salió.
  document.getElementById('exportar').addEventListener('click', async () => {
    mensajeExportar.textContent = '';
    mensajeExportar.className = 'mensaje-chico';
    const respuesta = await window.widget.exportarHistorial();

    if (respuesta.ok) {
      mensajeExportar.textContent = t('aj.exportado', { n: respuesta.cantidad });
      mensajeExportar.className = 'mensaje-chico ok';
    } else if (!respuesta.cancelado) {
      mensajeExportar.textContent = respuesta.error;
      mensajeExportar.className = 'mensaje-chico error';
    }
  });

  // Copia de seguridad: la app muestra sus cuadros (dónde guardar, cuál abrir, confirmar) y responde cómo salió.
  // Si se restaura, la app se vuelve a abrir sola con los datos de la copia.
  for (const [id, accion] of [['guardar-copia', 'guardarCopia'], ['restaurar-copia', 'restaurarCopia']]) {
    document.getElementById(id).addEventListener('click', async () => {
      mensajeCopia.textContent = '';
      mensajeCopia.className = 'mensaje-chico';
      const respuesta = await window.widget[accion]();
      if (respuesta.ok && respuesta.mensaje) {
        mensajeCopia.textContent = respuesta.mensaje;
        mensajeCopia.className = 'mensaje-chico ok';
      } else if (!respuesta.ok && !respuesta.cancelado) {
        mensajeCopia.textContent = respuesta.error;
        mensajeCopia.className = 'mensaje-chico error';
      }
    });
  }

  crearCajitasDeDias();

  // Igual con la vista y la disposición: cambian con los botones del widget o con el menú de la bandeja.
  function mostrarVista(modo, orientacion) {
    if (modo) campoModo.value = modo;
    if (orientacion) campoOrientacion.value = orientacion;
  }

  // widget.js llama a "mostrarEscala" cuando el tamaño cambia por otro lado (Ctrl + rueda del mouse),
  // para que la barra del formulario muestre siempre el valor real.
  return { cargar, mostrarEscala, mostrarVista, traducir };
})();
