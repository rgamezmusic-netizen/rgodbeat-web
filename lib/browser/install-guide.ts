import { BROWSER_LABELS, type BrowserName, type DeviceOS } from './device';

export const INSTALL_GUIDE_HIDDEN_KEY = 'rgodbeat_install_guide_hidden_v2';

export function hasSeenInstallGuide(): boolean {
  try {
    return localStorage.getItem(INSTALL_GUIDE_HIDDEN_KEY) === 'true'
      || localStorage.getItem('rgodbeat_install_prompt_seen') === 'true';
  } catch { return false; }
}

// This records dismissal of the tutorial, never proof of OS installation.
export function rememberInstallGuide(): void {
  try { localStorage.setItem(INSTALL_GUIDE_HIDDEN_KEY, 'true'); } catch { /* Storage may be restricted. */ }
}
interface Step { title: string; text: string }
export interface InstallGuide { steps: [Step, Step] | [Step, Step, Step]; note?: string; source?: string }

// Instructions checked against the linked browser documentation in October 2026.
// Menu presence remains conditional where the browser/vendor does not guarantee it.
export function getInstallGuide(os: DeviceOS, browser: BrowserName): InstallGuide {
  const name = BROWSER_LABELS[browser];
  const finish: Step = { title: 'Abre RGodbeat Studio', text: 'Busca el icono de RGodbeat Studio en tus aplicaciones o en la pantalla de inicio y ábrelo desde allí.' };
  const confirm: Step = { title: 'Confirma la instalación', text: 'Comprueba el nombre RGodbeat Studio y confirma con Instalar o Añadir en el aviso del dispositivo.' };
  if (browser === 'in-app') return {
    steps: [
      { title: 'Sal del navegador integrado', text: 'Estás dentro de otra aplicación. Abre su menú y busca «Abrir en navegador» o copia la dirección de esta página.' },
      { title: 'Abre tu navegador habitual', text: 'Pega la dirección en un navegador completo. La guía se adaptará al navegador al entrar de nuevo al Studio.' },
      { title: 'Sigue la guía de ese navegador', text: 'Desde el menú de Proyecto puedes volver a abrir «Instalar App» cuando quieras.' },
    ], note: 'Los navegadores integrados pueden limitar la instalación y el micrófono.',
  };
  if (os === 'ios') {
    if (browser === 'safari') return {
      steps: [
        { title: 'Abre Compartir en Safari', text: 'Toca el menú de página y después Compartir. Según la disposición de Safari, Compartir también puede aparecer directamente en la barra.' },
        { title: 'Añadir a pantalla de inicio', text: 'En la hoja de Compartir busca «Añadir a pantalla de inicio». Activa «Abrir como app web» si aparece y toca Añadir.' },
      ], source: 'https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios',
    };
    if (browser === 'chrome') return {
      steps: [
        { title: 'Abre Compartir en Chrome', text: 'En Chrome para iPhone o iPad, toca Compartir a la derecha de la barra de direcciones.' },
        { title: 'Añadir a pantalla de inicio', text: 'Desplázate por las acciones, toca «Añadir a pantalla de inicio», comprueba el nombre y confirma con Añadir.' },
      ], note: 'Si tu versión solo crea un acceso directo, puede abrirse en el navegador predeterminado.',
      source: 'https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=es',
    };
    return {
      steps: [
        { title: `Abre Compartir en ${name}`, text: `En ${name}, abre el menú de la página y busca Compartir para abrir la hoja de acciones de iOS.` },
        { title: 'Comprueba las acciones de iOS', text: 'Si aparece «Añadir a pantalla de inicio», selecciónalo y confirma con Añadir. La disponibilidad depende del navegador y de la versión de iOS.' },
      ], note: 'Si esa acción no aparece, abre esta dirección en Chrome o Safari y selecciona ese navegador en la guía. Un marcador interno del navegador no instala la app.',
      source: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable',
    };
  }
  if (os === 'android') {
    if (browser === 'chrome') return {
      steps: [
        { title: 'Abre el menú de Chrome', text: 'Toca los tres puntos ⋮ de Chrome con esta página abierta.' },
        { title: 'Instala en Android', text: 'Toca «Añadir a pantalla de inicio» y después Instalar. Sigue el aviso que muestre Android.' }, finish,
      ], source: 'https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=es',
    };
    if (browser === 'firefox') return {
      steps: [
        { title: 'Abre el menú de Firefox', text: 'Toca los tres puntos ⋮ de Firefox con RGodbeat Studio abierto.' },
        { title: 'Instala desde Firefox', text: 'Toca «Instalar» o «Añadir app a pantalla de inicio». En el panel de Android toca «Añadir automáticamente» o coloca el icono.' }, finish,
      ], source: 'https://support.mozilla.org/en-US/kb/use-web-apps-firefox-android',
    };
    if (browser === 'samsung') return {
      steps: [
        { title: 'Abre Samsung Internet', text: 'Busca el botón para añadir la página en la barra de direcciones o abre el menú de Samsung Internet.' },
        { title: 'Añade la página al inicio', text: 'Elige «Añadir página a» y «Pantalla de inicio», o «Añadir a pantalla de inicio», según tu versión. Confirma el aviso.' }, finish,
      ], source: 'https://samsunginternet.github.io/docs/homescreen',
    };
    if (browser === 'opera') return {
      steps: [
        { title: 'Abre el menú de la página en Opera', text: 'Toca el menú junto a la barra de direcciones de Opera, con el Studio abierto.' },
        { title: 'Añadir a pantalla de inicio', text: 'Busca «Añadir a» y elige la pantalla de inicio del dispositivo. Confirma el nombre y el aviso de Android.' }, finish,
      ], source: 'https://help.opera.com/en/mobile/android/',
    };
    return {
      steps: [
        { title: `Abre el menú de ${name}`, text: `Abre el menú principal de ${name} con esta página abierta.` },
        { title: 'Busca la opción de instalación', text: 'Si aparece «Instalar aplicación» o «Añadir a pantalla de inicio», tócala y confirma el aviso de Android.' }, finish,
      ], note: 'Si no aparece esa opción, puedes abrir esta misma dirección en Chrome o Firefox y seleccionar su guía. Un acceso directo puede abrirse dentro del navegador.',
    };
  }
  if (os === 'macos' && browser === 'safari') return {
    steps: [
      { title: 'Añadir al Dock', text: 'En Safari abre Archivo → Añadir al Dock. También puedes encontrarlo en Compartir → Añadir al Dock.' },
      { title: 'Confirma el nombre', text: 'Comprueba el nombre RGodbeat Studio y pulsa Añadir.' },
      { title: 'Abre desde el Dock', text: 'Haz clic en el icono del Dock para abrir el Studio en su propia ventana.' },
    ], note: 'Esta función requiere macOS Sonoma 14 o posterior. La app puede pedirte iniciar sesión de nuevo.', source: 'https://support.apple.com/en-us/104996',
  };
  if (browser === 'firefox' && (os === 'windows' || os === 'macos' || os === 'linux')) {
    if (os === 'windows') return {
      steps: [
        { title: 'Instala desde Firefox en Windows', text: 'Haz clic en el botón de aplicaciones web de la barra de direcciones de Firefox.' },
        { title: 'Crea la app de Firefox', text: 'Firefox abrirá la página como app y creará su acceso en Inicio. Si ofrece anclarla a la barra de tareas, confirma si lo deseas.' }, finish,
      ], note: 'Disponible desde Firefox 143 en Windows, y desde 150 en la edición Microsoft Store. No aparece en ventanas privadas.', source: 'https://support.mozilla.org/en-US/kb/web-apps-firefox-windows',
    };
    return {
      steps: [
        { title: 'Firefox en este sistema', text: 'Firefox para Mac y Linux no ofrece instalación de aplicaciones web integrada actualmente. Puedes seguir usando el Studio en esta pestaña.' },
        { title: 'Elige cómo abrir el Studio', text: 'Para instalarlo, abre esta dirección en Chrome o Edge. En Mac también puedes usar Safari. Selecciona el nuevo navegador en esta guía para ver sus pasos.' },
        { title: 'Conserva tus proyectos', text: 'Antes de cambiar de navegador, guarda tu proyecto en la nube o descarga su archivo desde Proyecto. Cada navegador tiene su propia copia local.' },
      ], source: 'https://support.mozilla.org/en-US/kb/web-apps-firefox-windows',
    };
  }
  if (os !== 'unknown' && (browser === 'chrome' || browser === 'edge' || browser === 'brave' || browser === 'vivaldi')) {
    const menus = {
      chrome: 'Abre ⋮ → Enviar, guardar y compartir → Instalar página como aplicación. También puede aparecer el icono Instalar en la barra de direcciones.',
      edge: 'Abre … → Más herramientas → Aplicaciones → Instalar este sitio como una aplicación. También puede aparecer el icono de instalación en la barra.',
      brave: 'Abre el menú principal → Guardar y compartir → Instalar. También puedes usar el icono de instalación de la barra de direcciones.',
      vivaldi: 'Pulsa el icono de instalación de la barra de direcciones, o haz clic derecho en la pestaña → Aplicaciones web progresivas → Instalar.',
    };
    const sources = {
      chrome: 'https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DDesktop&hl=es',
      edge: 'https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge',
      brave: 'https://support.brave.app/hc/en-us/articles/39077114659597-How-do-I-install-and-use-Web-Apps-in-Brave',
      vivaldi: 'https://help.vivaldi.com/desktop/miscellaneous/progressive-web-apps/',
    };
    return { steps: [{ title: `Instala desde ${name}`, text: menus[browser] }, confirm, finish], source: sources[browser] };
  }
  return {
    steps: [
      { title: `Revisa las opciones de ${name}`, text: 'Busca una opción de instalar esta página como aplicación en el menú o en la barra de direcciones. No todos los navegadores la ofrecen.' },
      { title: 'Elige una guía compatible', text: 'Si no aparece la opción, abre esta dirección en Chrome o Edge y selecciona su navegador y sistema en esta guía.' },
      { title: 'Guarda antes de cambiar de navegador', text: 'Guarda tu proyecto en la nube o descarga su archivo desde Proyecto para poder abrirlo en el otro navegador.' },
    ], note: 'La detección puede estar limitada por los ajustes de privacidad. Puedes corregir el navegador y el sistema debajo.',
  };
}
