# Headroom

**Un widget de escritorio para Windows que te muestra cuánto llevas usado de tu plan de Claude y te avisa antes de pasarte.**

[English version](README.en.md)

![Headroom con una cuenta y la ventana de contexto de Claude Code](docs/captura-tarjeta.png)

> Proyecto **no oficial**. No tiene relación con Anthropic. "Claude" es una marca de Anthropic.
>
> Antes se llamaba **Cupo**. Si ya la tenías instalada, al actualizar conservas tus ajustes, tus cuentas y tu historial.

## ¿Para qué sirve?

Los planes de Claude (Pro, Max, Team…) tienen límites: una **sesión de 5 horas**, una **cuota semanal** y, en el plan Max, ventanas por modelo como **Fable**. claude.ai muestra esos números en *Configuración → Uso*, pero hay que ir a mirarlos. Headroom los deja **siempre a la vista** en una esquina de tu pantalla y te avisa a tiempo.

Además te ayuda a **repartir tu cuota semanal en el día a día**: tú eliges cuánto quieres usar como máximo por día (por ejemplo 14% de la semana) y Headroom te muestra cuánto llevas hoy y te avisa al acercarte.

- **Una sola cuenta:** ves Hoy, la sesión de 5 horas y la semana de un vistazo, con avisos, historial y proyección. Si usas Claude Code en ese mismo computador, también ves cuánto de su **ventana de contexto** lleva cada chat.
- **Varias cuentas** (por ejemplo, la personal y la del trabajo, o cuentas de distintos planes): ves **todas a la vez**, cada una con su plan, sus barras, sus propios límites y su propio historial, juntas en una ventana o **cada una en su propia ventana**. Los avisos dicen de qué cuenta son.

## Ejemplos

Las capturas usan **datos simulados** (10 días de uso inventado), para mostrar todo lo que se puede hacer.

### Con una sola cuenta

**Todo de un vistazo.** La vista completa junta las barras, la ventana de contexto de Claude Code, el historial, el desglose y la proyección:

![Vista completa con una cuenta](docs/captura-completo-una.png)

**Panel de control.** Todo a la vez: lo de la vista completa y, debajo, los gráficos en tres grupos (Hoy; Semana y mes; Hábitos), cada uno con su número: hora a hora, por producto, horas de más uso, últimos 30 días, semana a semana, por día de la semana y el mapa de día y hora. Se adapta al tamaño que le des:

![Panel de control con una cuenta](docs/captura-panel.png)

**Historial en gráficos de línea.** Hoy hora a hora, y los últimos 7 o 30 días, con tu límite marcado:

![Historial de hoy y de 7 días](docs/captura-historial.png)

**A qué horas usas más.** El promedio de cada hora del día, con tu hora pico. Y junto a la semana, cómo vas contra la **semana pasada a esta misma altura** (▼ 12% = vas un 12% por debajo). Los paneles se agrandan arrastrando sus bordes:

![Horas de más uso, con el panel agrandado](docs/captura-horas.png)

**Uso por producto a lo largo del tiempo.** Cuánto usaron Claude Code, Chats, Cowork y Otros: hoy, esta semana (desde el día en que se reinicia tu plan), 30 días o semana a semana:

| Esta semana | Semana a semana |
| --- | --- |
| ![Uso por producto esta semana](docs/captura-productos.png) | ![Uso por producto por semanas](docs/captura-semanas.png) |

**Solo números.** Si no quieres las barras, se ocultan y la tarjeta queda más baja, con las marquitas que comparan con ayer, con la sesión anterior y con la semana pasada (▲ más, ▼ menos):

![La tarjeta sin barras](docs/captura-numeros.png)

**Del tamaño que quieras.** Mínimo (un círculo), compacto (una línea) u horizontal:

![Vistas mínima, compacta y horizontal](docs/captura-vistas.png)

**Cada parte en su propia ventana.** Saca el historial, el desglose, la proyección, el uso por producto o la ventana de contexto y ponlos donde quieras; las ventanas nunca se tapan entre sí:

![El widget con el historial y el uso por producto en ventanas propias](docs/captura-partes.png)

### Con varias cuentas

**Todas a la vez**, cada una con su plan y sus barras (y las de Fable y uso extra, si las tiene):

| Varias cuentas a la vez | Panel de cuentas |
| --- | --- |
| ![Dos cuentas apiladas](docs/captura-normal.png) | ![Panel de cuentas](docs/captura-cuentas.png) |

![Vista "Cuentas": una fila por cuenta](docs/captura-lista.png)

**La vista completa compara las cuentas**: una línea por cuenta en el historial, una barra por cuenta en el desglose y la proyección de cada una:

![Vista completa con dos cuentas](docs/captura-completo.png)

**Y el panel de control**, con una línea por cuenta en cada gráfico:

![Panel de control con dos cuentas](docs/captura-panel-varias.png)

**O cada cuenta en su propia ventana**, para mover cada una por separado:

![Dos cuentas, cada una en su ventana](docs/captura-ventanas.png)

## Funciones

### Lo que muestra
- **Hoy:** lo que llevas del día contra un **límite diario que pones tú** (puede ser distinto para cada día de la semana), o un **límite automático** que reparte lo que te queda de la semana entre los días que faltan.
- **Sesión de 5 horas** y **cuota semanal**, con su porcentaje y **cuánto falta para que se reinicien** ("en 2 h 15 min"), o la hora exacta si lo prefieres.
- **Plan Max:** además, la ventana semanal de **Fable** (y otros límites por modelo que informe claude.ai). En Pro no aparece.
- **Uso extra:** si tienes crédito extra activado con tope mensual, lo gastado (por ejemplo US$16 / US$50).
- **Tipo de plan** de cada cuenta (Pro, Max 5x, Team…).
- **Historial** en gráficos de línea: **hoy** hora a hora, y los últimos **7 o 30 días**, con tu límite marcado y tu promedio diario.
- **Horas de más uso:** a qué horas del día se te va más cuota (el promedio de cada hora), con tu hora pico.
- **Comparación con la semana pasada:** junto a la barra de la semana, cuántos puntos llevas de más o de menos que la semana pasada a esta misma altura. Lo mismo para **Hoy** (contra ayer a esta hora) y para la **sesión de 5 horas** (contra la sesión anterior).
- **Desglose** de la semana por producto (Claude Code, Chats, Cowork…) y **uso por producto a lo largo del tiempo**: hoy, esta semana (desde el día en que se reinicia tu plan), 30 días o semana a semana. En los planes con límite por modelo (**Fable**), ese límite sale como una línea punteada más.
- **Proyección** de hoy, de la sesión de 5 horas y de la semana ("a este ritmo llegarías al límite a las 18:40", "agotarías la sesión hacia las 16:20"). La de la sesión también sale al pasar el mouse por su barra.
- **Estadísticas** en el panel de control, con lo que ya está guardado: tu día más alto, tu promedio, tu racha bajo el límite, qué días de la semana y a qué horas usas más (un mapa de día por hora), cuánto te sobra cada semana, un límite diario sugerido y cuántas sesiones de 5 horas agotas. Guarda hasta un año de historial y, desde Ajustes, saca un **informe** para imprimir o guardar como PDF.
- Con varias cuentas, el historial, el desglose y la proyección muestran todas las cuentas a la vez.
- **Al dejar el mouse sobre una barra** se explica qué muestra.
- **Solo números** (opcional): oculta las barras y deja solo los datos.
- **Ventana de contexto de Claude Code:** cuánto de su ventana de contexto lleva cada chat de Claude Code que usaste en las últimas 3 horas (hasta 5), para saber cuándo conviene compactarlo. Ver [más abajo](#ventana-de-contexto-de-claude-code) cuándo funciona.
- **Ícono junto al reloj** que se pone verde, amarillo o rojo según tu uso de hoy.

### Avisos (notificaciones de Windows)
- Al acercarte y al llegar a tu **límite diario**.
- Sesión de 5 horas: al llegar al porcentaje que elijas, al agotarse, cuando se reinicia y cuando **a este ritmo te quedarías sin sesión** antes del reinicio.
- **Cuota semanal** alta (85% por defecto), una vez por semana, y cuando **a este ritmo agotarías la semana** antes del reinicio.
- **Compactar un chat de Claude Code** cuando llega al porcentaje que elijas (70% por defecto), y de nuevo cada 10% más.
- **Resumen** de tu día de ayer (al empezar el día) y de tu semana (cuando se reinicia).
- **No molestar:** silencia los avisos por 1 hora o hasta mañana desde el menú de la bandeja.
- **Actualizar con un clic** cuando hay una versión nueva: se descarga, se instala y vuelve a abrirse sola.

### Vistas y aspecto
- Las vistas van de menos a más información: **Mínima** (dos anillos: afuera la semana, adentro la sesión de 5 horas), **Compacta** (una línea con los tres números y sus barritas), **Normal** (la tarjeta, vertical u horizontal: el número grande primero; los paneles se abren desde el botón ⋯), **Completa** (los números arriba; el historial grande a la izquierda; desglose y proyección a la derecha) y **Panel de control** (todo, con los gráficos por grupos: hora a hora, por producto, horas de más uso, 30 días, semana a semana, por día de la semana y el mapa de día y hora).
- **Cuentas:** todas tus cuentas en una lista, una fila por cuenta.
- **Cada cuenta en su propia ventana** (opcional): cada una se mueve por separado y tiene su propia vista.
- **Partes en su propia ventana:** el historial, el desglose, la proyección, el uso por producto y la ventana de contexto se pueden sacar del widget (botón junto a la X) y poner donde quieras. Con varias cuentas, cada una dice de qué cuenta es.
- **Las ventanas no se tapan:** si sueltas una encima de otra, se acomoda al lado y se imanta a los bordes. Solo Ajustes puede quedar encima mientras está abierto.
- **Ventanas y paneles estirables:** arrastra los bordes del widget, de un panel abierto o de una parte separada para cambiar su tamaño; las letras no cambian de tamaño y cada uno recuerda el suyo (doble clic en un borde para volver al tamaño original).
- Tema claro, oscuro o automático, transparencia, escala de 70% a 160% y **colores propios** (acento y colores de las barras).
- **Atajo de teclado** Ctrl + Alt + C para mostrarlo u ocultarlo desde cualquier programa.
- **Mostrar solo mientras Claude está abierto** (opcional): el widget aparece al abrir la app de Claude o Claude Code en ese computador, y se oculta al cerrarla.
- Exporta el historial a **CSV** (se abre en Excel).
- **Copia de seguridad:** guarda en un archivo tus ajustes, cuentas e historial, y restáuralos en otro computador o después de reinstalar Windows. (La copia no lleva tus sesiones: hay que volver a entrar a cada cuenta.)

![Ajustes](docs/captura-ajustes.png)

## Ventana de contexto de Claude Code

Cada chat de Claude Code tiene una "memoria" (la ventana de contexto). Cuando se llena, el chat se resume solo o hay que empezar otro. Headroom muestra cuánto lleva cada chat y te recuerda escribir `/compact` antes de que se llene.

- **Solo funciona con Claude Code usado en ese mismo computador:** Headroom lee los archivos donde Claude Code guarda sus chats (`%USERPROFILE%\.claude\projects`). Solo mira el nombre del chat y cuántos tokens lleva.
- **No ve los chats de claude.ai** (en la web o en la app), porque claude.ai no informa cuánto contexto lleva cada conversación. Tampoco ve los chats de otros equipos.
- **Solo aparece con una cuenta en Headroom.** Con varias (que suelen usarse en distintos equipos) no sirve, así que se oculta.
- Si no usas Claude Code, la sección simplemente no aparece.

## Idiomas

Español · English · Português (Brasil) · Français · Deutsch, o **automático** (el idioma de Windows). Se cambia en Ajustes y todo se traduce al instante: la ventana, el menú, los avisos y el CSV (con la coma o el punto decimal de cada idioma).

## Instalar

1. Descarga `Headroom-Setup-x.y.z.exe` desde la sección [Releases](../../releases).
2. Ábrelo. Se instala solo, sin permisos de administrador.
3. Windows puede mostrar un aviso azul de **SmartScreen** ("Windows protegió su PC"), porque el instalador no está firmado con un certificado de pago. Pulsa *Más información → Ejecutar de todas formas*. Si no te fías, el código está aquí completo y puedes [compilarlo tú](#compilarlo-tú-mismo).
4. La primera vez, una bienvenida corta explica qué es cada cosa. Pulsa **Iniciar sesión** y entra a claude.ai como siempre.

**Para agregar otra cuenta:** haz clic en la etiqueta con el nombre de la cuenta (arriba a la izquierda), o en el ícono junto al reloj → Cuenta → **Agregar cuenta…**. Escribe un nombre para reconocerla (por ejemplo, Trabajo), pulsa **Agregar** y entra a claude.ai con esa cuenta en la ventana que se abre.

Por ahora solo hay versión para **Windows** (10 y 11).

## Cómo funciona (y qué datos toca)

Anthropic no ofrece una forma oficial de consultar el uso del plan, así que Headroom hace lo mismo que tu navegador: abre claude.ai en una ventana invisible **con tu propia sesión** y lee los mismos números que muestra la página *Configuración → Uso*. **No gasta tu cuota:** nunca le envía mensajes a Claude.

- **Tu contraseña nunca pasa por Headroom.** El inicio de sesión ocurre en la página real de claude.ai.
- Cada cuenta tiene su sesión guardada en tu computador, en un espacio propio. Headroom solo comprueba si existe la cookie de sesión (sí / no); no la lee ni la copia.
- Los únicos datos que guarda son tus ajustes y el historial de porcentajes de uso por día, en un archivo local (`%APPDATA%\widget-uso-claude\datos.json`).
- **Consulta cada 5 minutos** por defecto (puedes elegir de 5 a 60; nunca menos de 5, para no molestar a claude.ai). Opcionalmente, **cada 2 minutos solo mientras la sesión de 5 horas va sobre 70%**, que es cuando importa enterarse a tiempo. **Mientras el widget está oculto no consulta nada**; al mostrarlo se actualiza al instante (se puede cambiar en Ajustes).
- No hay servidores, ni cuentas, ni telemetría. Lo que sale a internet: las consultas a claude.ai y, una vez al día, una consulta a GitHub para saber si hay una versión nueva (se puede apagar en Ajustes). La ventana de contexto de Claude Code solo lee archivos de tu computador.

## Limitaciones honestas

- **Puede dejar de funcionar sin aviso.** Como depende de cómo está hecha la página de claude.ai, si Anthropic la cambia el widget puede dejar de leer el uso. Headroom lo detecta y te avisa; el arreglo está en un solo archivo (`src/uso.js`).
- El "uso de hoy" lo calcula Headroom: es la diferencia entre el porcentaje semanal de ahora y el que había al empezar el día (medianoche de tu zona horaria).
- Headroom no cuenta tokens ni mensajes: muestra los porcentajes que informa claude.ai.
- Revisa que tu uso de esta herramienta esté de acuerdo con los términos de servicio de Claude. Úsala bajo tu responsabilidad.

## Compilarlo tú mismo

Necesitas [Node.js](https://nodejs.org) (versión 20 o más nueva).

```bash
npm install
npm start          # abre el widget
npm test           # pruebas de los cálculos, la ventana de contexto y los idiomas
npm run dist       # genera el instalador en la carpeta dist
```

## Estructura

```
src/main.js            arranque, ventana, bandeja, cuentas, avisos
src/sesion.js          inicio de sesión (una sesión por cuenta)
src/uso.js             lectura del uso desde claude.ai  ← lo único que depende de su página
src/calculo.js         cálculo diario, alertas, proyecciones (sin Electron: fácil de probar)
src/almacen.js         datos guardados en JSON
src/actualizaciones.js versión nueva y actualizar con un clic (GitHub)
src/contexto.js        ventana de contexto de los chats de Claude Code (archivos locales)
src/idiomas/           los textos, un archivo por idioma
src/ventanas/          la pantalla del widget (HTML, CSS y JS)
pruebas/               pruebas automáticas (npm test)
```

**Agregar un idioma:** copia `src/idiomas/es.js`, tradúcelo y regístralo en `src/idiomas.js`.

## Contribuir

Ideas, errores y mejoras son bienvenidos: abre un *issue* o un *pull request*. Si el widget dejó de leer tu uso, un issue con el mensaje de error es lo más útil.

## Licencia

[MIT](LICENSE)
