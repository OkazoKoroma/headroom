// cuentas.js: todo lo que se ve de las cuentas de Claude:
//   - la pestañita con el nombre de la cuenta que se muestra (arriba de la tarjeta),
//   - el panel "Cuentas" (cambiar de cuenta, renombrar, entrar / salir, agregar y eliminar),
//   - el resumen de todas las cuentas juntas en la vista completa.
// widget.js le entrega los datos con "panelCuentas.mostrar(datos)" cada vez que llegan datos nuevos.

const panelCuentas = (() => {
  const pestana = document.getElementById('boton-cuenta');
  const lista = document.getElementById('cuentas-lista');
  const formularioNueva = document.getElementById('cuentas-nueva');
  const campoNueva = document.getElementById('cuentas-nombre-nueva');
  const mensaje = document.getElementById('cuentas-mensaje');
  const resumen = document.getElementById('resumen-cuentas');

  let cuentasActuales = [];
  const filas = new Map();          // id → los elementos de su fila en el panel
  const filasDelResumen = new Map(); // id → los elementos de su fila en el resumen

  const colorDeEstado = (estado) => ({ conectado: VERDE, expirada: AMARILLO }[estado] || '#8a8a95');
  const CLAVES_DE_ESTADO = {
    conectado: 'cuentas.estado.conectado',
    expirada: 'cuentas.estado.expirada',
    'sin-sesion': 'cuentas.estado.sinSesion',
  };

  function crear(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) elemento.className = clase;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
  }

  function decir(texto) {
    mensaje.textContent = texto;
  }

  // ----- Pestañita de la tarjeta -----

  function mostrarPestana(activa) {
    if (!activa) return;
    // Con el plan: "Personal · Pro"
    pestana.textContent = activa.plan ? `${activa.nombre} · ${activa.plan}` : activa.nombre;
    pestana.title = t('boton.cuenta', { nombre: activa.nombre }) + (activa.plan ? ' — ' + t('plan.titulo', { plan: activa.plan }) : '');
    pestana.setAttribute('aria-label', t('boton.cuenta', { nombre: activa.nombre }));
  }

  // ----- Panel "Cuentas" -----

  function crearFila(cuenta) {
    const fila = crear('div', 'cuenta-fila');

    const usar = crear('button', 'cuenta-radio');
    usar.type = 'button';
    usar.addEventListener('click', () => window.widget.activarCuenta(cuenta.id));

    const nombre = crear('input', 'cuenta-nombre');
    nombre.type = 'text';
    nombre.maxLength = 20;
    nombre.autocomplete = 'off';
    nombre.spellcheck = false;
    // Al terminar de escribir (Enter o al salir del campo) se guarda el nombre nuevo.
    nombre.addEventListener('change', async () => {
      const respuesta = await window.widget.renombrarCuenta(cuenta.id, nombre.value);
      if (!respuesta.ok) {
        decir(respuesta.error || '');
        const actual = cuentasActuales.find((c) => c.id === cuenta.id);
        if (actual) nombre.value = actual.nombre;
      } else {
        decir('');
      }
    });
    nombre.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') nombre.blur();
    });

    const plan = crear('span', 'cuenta-plan');
    const punto = crear('span', 'cuenta-estado');

    const accion = crear('button', 'boton-secundario cuenta-accion');
    accion.type = 'button';

    const eliminar = crear('button', 'cuenta-eliminar');
    eliminar.type = 'button';
    eliminar.title = t('cuentas.eliminar');
    eliminar.setAttribute('aria-label', t('cuentas.eliminar'));
    eliminar.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
    let temporizadorSeguro = null;
    eliminar.addEventListener('click', async () => {
      // Eliminar borra todo: se pide una segunda pulsación para confirmar.
      if (!eliminar.classList.contains('seguro')) {
        eliminar.classList.add('seguro');
        eliminar.textContent = t('cuentas.eliminarSeguro');
        temporizadorSeguro = setTimeout(() => restaurarEliminar(), 3000);
        return;
      }
      clearTimeout(temporizadorSeguro);
      await window.widget.eliminarCuenta(cuenta.id);
    });
    function restaurarEliminar() {
      clearTimeout(temporizadorSeguro);
      eliminar.classList.remove('seguro');
      eliminar.innerHTML = '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';
    }

    fila.append(usar, nombre, plan, punto, accion, eliminar);
    lista.appendChild(fila);
    return { fila, usar, nombre, plan, punto, accion, eliminar, restaurarEliminar };
  }

  function dibujarLista(cuentas, activa) {
    // Se quitan las filas de cuentas que ya no existen y se crean las que faltan.
    for (const [id, elementos] of filas) {
      if (!cuentas.some((c) => c.id === id)) {
        elementos.fila.remove();
        filas.delete(id);
      }
    }
    cuentas.forEach((cuenta, posicion) => {
      if (!filas.has(cuenta.id)) filas.set(cuenta.id, crearFila(cuenta));
      const elementos = filas.get(cuenta.id);
      lista.appendChild(elementos.fila); // mantiene el orden

      const esActiva = cuenta.id === activa;
      elementos.fila.classList.toggle('activa', esActiva);
      elementos.usar.setAttribute('aria-pressed', String(esActiva));
      elementos.usar.title = t('cuentas.usar');
      elementos.usar.setAttribute('aria-label', t('cuentas.usar'));
      // Si estás escribiendo el nombre, no se pisa lo que escribes.
      if (document.activeElement !== elementos.nombre) elementos.nombre.value = cuenta.nombre;
      elementos.nombre.setAttribute('aria-label', t('cuentas.nombre'));
      elementos.plan.textContent = cuenta.plan || '';
      elementos.plan.title = cuenta.plan ? t('plan.titulo', { plan: cuenta.plan }) : '';
      elementos.punto.style.backgroundColor = colorDeEstado(cuenta.estado);
      elementos.punto.title = t(CLAVES_DE_ESTADO[cuenta.estado]);
      const conectada = cuenta.estado === 'conectado';
      elementos.accion.textContent = t(conectada ? 'cuentas.cerrarSesion' : 'cuentas.iniciarSesion');
      elementos.accion.onclick = () => (conectada
        ? window.widget.cerrarSesionDeCuenta(cuenta.id)
        : window.widget.iniciarSesionDeCuenta(cuenta.id));
      // Siempre queda al menos una cuenta: la última no se puede eliminar.
      elementos.eliminar.hidden = cuentas.length <= 1;
      elementos.eliminar.title = t('cuentas.eliminar');
      elementos.eliminar.setAttribute('aria-label', t('cuentas.eliminar'));
    });
    campoNueva.placeholder = t('cuentas.nueva');
  }

  formularioNueva.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const respuesta = await window.widget.agregarCuenta(campoNueva.value);
    if (respuesta.ok) {
      campoNueva.value = '';
      decir('');
    } else {
      decir(respuesta.error || '');
    }
  });

  // ----- Resumen de todas las cuentas (vista completa) -----

  // Llena una barrita. "colorDe" elige el color según qué tan llena está.
  function pintarMini(relleno, porcentaje, colorDe) {
    const real = Math.max(0, porcentaje);
    relleno.style.width = `${Math.min(real, 100)}%`;
    relleno.style.setProperty('--c', colorDe(real / 100));
  }

  function crearMedidorDelResumen(claveEtiqueta) {
    const medidor = crear('div', 'resumen-medidor');
    const etiqueta = crear('span', 'resumen-etiqueta');
    etiqueta.dataset.clave = claveEtiqueta;
    const barra = crear('div', 'barra');
    const relleno = crear('div', 'barra-relleno');
    barra.appendChild(relleno);
    const valor = crear('span', 'resumen-valor');
    medidor.append(etiqueta, barra, valor);
    return { medidor, etiqueta, relleno, valor };
  }

  function crearFilaDelResumen(cuenta) {
    const fila = crear('div', 'resumen-fila');
    const nombre = crear('button', 'resumen-nombre');
    nombre.type = 'button';
    nombre.addEventListener('click', () => window.widget.activarCuenta(cuenta.id));
    const nombreTexto = crear('span', 'resumen-nombre-texto');
    const planTexto = crear('span', 'resumen-plan');
    nombre.append(nombreTexto, planTexto);
    const hoy = crearMedidorDelResumen('hoy.etiqueta');
    const sesion = crearMedidorDelResumen('sesion.etiqueta');
    const semana = crearMedidorDelResumen('semana.etiqueta');
    const aviso = crear('span', 'resumen-aviso');
    fila.append(nombre, hoy.medidor, sesion.medidor, semana.medidor, aviso);
    resumen.appendChild(fila);
    return { fila, nombre, nombreTexto, planTexto, hoy, sesion, semana, aviso, extras: [] };
  }

  // "conResumen": la vista completa lleva las filas de todas las cuentas (no, si cada cuenta tiene su propia ventana).
  function dibujarResumen(cuentas, activa, conResumen = true) {
    resumen.style.setProperty('--resumen-n', String(cuentas.length));
    // Columnas de las filas anchas: Hoy, Sesión, Semana y una más por cada límite extra (Fable...) de la cuenta que más tenga
    const maximoExtras = cuentas.reduce((mayor, c) => Math.max(mayor, (c.extras || []).length), 0);
    resumen.style.setProperty('--n-cols-lista', String((document.body.classList.contains('sin-hoy') ? 2 : 3) + maximoExtras));
    document.body.classList.toggle('con-resumen', cuentas.length >= 2 && conResumen);

    for (const [id, elementos] of filasDelResumen) {
      if (!cuentas.some((c) => c.id === id)) {
        elementos.fila.remove();
        filasDelResumen.delete(id);
      }
    }
    for (const cuenta of cuentas) {
      if (!filasDelResumen.has(cuenta.id)) filasDelResumen.set(cuenta.id, crearFilaDelResumen(cuenta));
      const e = filasDelResumen.get(cuenta.id);
      resumen.appendChild(e.fila);
      e.fila.classList.toggle('activa', cuenta.id === activa);
      e.nombreTexto.textContent = cuenta.nombre;
      e.planTexto.textContent = cuenta.plan || '';
      e.nombre.title = t('cuentas.usar') + (cuenta.plan ? ' — ' + t('plan.titulo', { plan: cuenta.plan }) : '');

      const datos = cuenta.uso;
      // Sin datos (sin sesión, error o cargando), en vez de las barras va un aviso corto.
      const textoDeAviso = cuenta.estado !== 'conectado'
        ? t('resumen.sinSesion')
        : (cuenta.error ? `⚠ ${cuenta.error}` : (datos ? null : t('lectura.cargando')));
      e.fila.classList.toggle('sin-datos', textoDeAviso !== null);
      e.aviso.textContent = textoDeAviso || '';
      e.aviso.classList.toggle('error', Boolean(cuenta.error) && cuenta.estado === 'conectado');
      if (textoDeAviso !== null) continue;

      e.hoy.etiqueta.textContent = t('hoy.etiqueta');
      e.sesion.etiqueta.textContent = t('sesion.etiqueta');
      e.semana.etiqueta.textContent = t('semana.etiqueta');
      pintarMini(e.hoy.relleno, (datos.hoy / datos.limiteDiario) * 100, colorDiario);
      e.hoy.valor.textContent = `${formatear(datos.hoy)}/${formatear(datos.limiteDiario)}%`;
      if (datos.sesion5h) {
        pintarMini(e.sesion.relleno, datos.sesion5h.porcentaje, colorSemanal);
        e.sesion.valor.textContent = `${formatear(datos.sesion5h.porcentaje)}%`;
      } else {
        pintarMini(e.sesion.relleno, 0, colorSemanal);
        e.sesion.valor.textContent = '—';
      }
      pintarMini(e.semana.relleno, datos.semana, colorSemanal);
      e.semana.valor.textContent = `${formatear(datos.semana)}%`;

      // Los límites extra por modelo (Fable...): un medidor más por cada uno
      const extras = cuenta.extras || [];
      while (e.extras.length < extras.length) {
        const nuevo = crearMedidorDelResumen('');
        e.fila.insertBefore(nuevo.medidor, e.aviso);
        e.extras.push(nuevo);
      }
      while (e.extras.length > extras.length) e.extras.pop().medidor.remove();
      extras.forEach((extra, i) => {
        e.extras[i].etiqueta.textContent = extra.nombre;
        pintarMini(e.extras[i].relleno, extra.porcentaje, colorSemanal);
        e.extras[i].valor.textContent = `${formatear(extra.porcentaje)}%`;
      });
      e.fila.style.setProperty('--n-extras-fila', String(extras.length));
    }
  }

  // ----- Lo que usa widget.js -----

  function mostrar(datos) {
    cuentasActuales = datos.cuentas || [];
    const activa = cuentasActuales.find((c) => c.id === datos.activa);
    mostrarPestana(activa);
    dibujarLista(cuentasActuales, datos.activa);
    dibujarResumen(cuentasActuales, datos.activa, datos.resumen !== false);
  }

  return { mostrar };
})();
