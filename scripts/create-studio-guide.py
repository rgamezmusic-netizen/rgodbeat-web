"""Create the Spanish Studio manual and AI demo production pack from verified UI.

Run with the bundled Python (ReportLab, Pillow, pypdf). Screenshots are captured
separately from the local anonymous demo with synthetic browser audio.
"""
from pathlib import Path
from html import escape
import shutil
import zipfile

from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output'
PACK = OUT / 'studio-demo'
ASSETS = PACK / 'assets'
PDF = OUT / 'pdf' / 'RGodbeat-Studio-Guia-de-Uso.pdf'
VIDEO_PDF = OUT / 'pdf' / 'RGodbeat-Studio-Guion-de-Video.pdf'
PDF.parent.mkdir(parents=True, exist_ok=True)
ASSETS.mkdir(parents=True, exist_ok=True)
fontdir = Path('/System/Library/Fonts/Supplemental')
pdfmetrics.registerFont(TTFont('RG', str(fontdir / 'Arial.ttf')))
pdfmetrics.registerFont(TTFont('RG-Bold', str(fontdir / 'Arial Bold.ttf')))
pdfmetrics.registerFontFamily('RG', normal='RG', bold='RG-Bold', italic='RG', boldItalic='RG-Bold')

W, H = A4
M = 44
CW = W - 2 * M
INK = colors.HexColor('#151724')
MUTED = colors.HexColor('#555C6A')
AMBER = colors.HexColor('#D69C25')
PURPLE = colors.HexColor('#7444BF')
BG = colors.HexColor('#F4F5F8')
LINE = colors.HexColor('#DFE2E9')
c = canvas.Canvas(str(PDF), pagesize=A4)
c.setTitle('RGodbeat Studio | Guía de uso')
c.setAuthor('RGodbeat Studio')
c.setSubject('Instrucciones de uso de RGodbeat Studio')
document_label = 'GUÍA DE USO'
total_pages = 7
page = 0
y = 0
editable = []

def para(text, size=10.5, color=INK, width=CW, leading=None, bold=False):
    style = ParagraphStyle('p', fontName='RG-Bold' if bold else 'RG', fontSize=size,
                           leading=leading or size * 1.42, textColor=color, spaceAfter=0)
    p = Paragraph(text, style)
    _, height = p.wrap(width, H)
    return p, height

def write(text, size=10.5, color=INK, gap=9, bold=False):
    global y
    p, height = para(text, size, color, bold=bold)
    if y - height < 62:
        raise ValueError(f'Page {page} overflows: {text[:90]} (y={y}, h={height})')
    p.drawOn(c, M, y - height)
    y -= height + gap
    editable.append(text.replace('<b>', '**').replace('</b>', '**').replace('<br/>', '\n'))

def title(text):
    write(text, 15, INK, gap=9, bold=True)

def step(number, heading, body):
    write(f'<font color="#7444BF">{number:02d}</font>  <b>{heading}</b>', 11, gap=4)
    write(body, gap=13)

def note(heading, text):
    global y
    p, h = para(f'<b>{heading}</b><br/>{text}', 10, width=CW-28)
    boxh = h + 22
    if y-boxh < 62:
        raise ValueError(f'Note overflow on page {page}: {heading}')
    c.setFillColor(BG)
    c.roundRect(M, y-boxh, CW, boxh, 8, fill=1, stroke=0)
    c.setFillColor(AMBER)
    c.roundRect(M, y-boxh, 3, boxh, 1, fill=1, stroke=0)
    p.drawOn(c, M+14, y-11-h)
    y -= boxh + 14
    editable.append(f'**{heading}**\n{text}')

def table(headers, rows, widths=None, size=9.7):
    global y
    widths = widths or [CW / len(headers)] * len(headers)
    data = [[para(h, size, colors.white, width=w-20, bold=True)[0] for h,w in zip(headers,widths)]]
    for row in rows:
        data.append([para(s, size, width=w-20)[0] for s,w in zip(row,widths)])
    t = Table(data, colWidths=widths, hAlign='LEFT')
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0),INK), ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1),10), ('RIGHTPADDING',(0,0),(-1,-1),10),
        ('TOPPADDING',(0,0),(-1,-1),10), ('BOTTOMPADDING',(0,0),(-1,-1),10),
        ('ROWBACKGROUNDS',(0,1),(-1,-1),[BG,colors.white]),
        ('LINEBELOW',(0,0),(-1,0),1,AMBER),
        ('LINEBELOW',(0,1),(-1,-1),0.4,LINE),
    ]))
    _, height = t.wrap(CW,H)
    if y-height<62: raise ValueError(f'Table overflow on page {page}: {height}, {y}')
    t.drawOn(c,M,y-height)
    y -= height+17
    editable.append('| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+'\n'.join('| '+' | '.join(row)+' |' for row in rows))

def shot(filename, caption, maxheight=255):
    global y
    path=ASSETS/filename
    iw,ih=Image.open(path).size
    scale=min(CW/iw,maxheight/ih)
    dw,dh=iw*scale,ih*scale
    c.setFillColor(INK)
    c.roundRect(M-1,y-dh-1,CW+2,dh+2,6,fill=1,stroke=0)
    c.drawImage(str(path),M+(CW-dw)/2,y-dh,width=dw,height=dh,mask='auto')
    y-=dh+8
    write(caption,8.4,MUTED,gap=16)
    editable.append(f'![{caption}](assets/{filename})')

def newpage(tag, heading, sub):
    global page,y
    if page: c.showPage()
    page+=1
    c.setFillColor(colors.white);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(INK);c.setFont('RG-Bold',9);c.drawString(M,H-30,'RGODBEAT / STUDIO')
    c.setFillColor(MUTED);c.setFont('RG',8);c.drawRightString(W-M,H-30,document_label)
    c.setStrokeColor(LINE);c.line(M,49,W-M,49)
    c.setFont('RG',8);c.setFillColor(MUTED);c.drawString(M,34,'Edición 02 | 10 octubre 2026')
    c.drawRightString(W-M,34,f'{page:02d} / {total_pages:02d}')
    y=H-65
    write(tag.upper(),8.5,PURPLE,gap=11,bold=True)
    write(heading,27,INK,gap=11,bold=True)
    write(sub,10.6,MUTED,gap=22)
    editable.append(f'\n---\n\n## Página {page:02d}: {heading}\n')

def scene(time, heading, visual, voice, screen):
    title(f'{time}  /  {heading}')
    write(f'<b>Plano y acción.</b> {visual}',gap=6)
    write(f'<b>Locución.</b> “{voice}”',gap=6)
    write(f'<b>Texto en pantalla.</b> {screen}',size=10,color=PURPLE,gap=17)

def prompt(heading,text):
    title(heading)
    note('PROMPT PARA COPIAR',escape(text))

# 01
newpage('Guía de uso','RGodbeat Studio',
        'Carga un beat, graba tu voz, edita las tomas y guarda tu proyecto.')
shot('01-grabador.png','Vista Grabador.',maxheight=300)
title('Contenido')
write('<b>02</b>  Empezar e instalar la app<br/><b>03</b>  Cargar y preparar el beat<br/><b>04</b>  Grabar la voz<br/><b>05</b>  Editar las tomas<br/><b>06</b>  Ajustar los efectos<br/><b>07</b>  Guardar y exportar',11)

# 02
newpage('01 / Empezar','Ubícate en Studio','El flujo principal vive en dos vistas: Grabador y Edición.')
table(['CONTROL','QUÉ HACE'],[
    ['Beat / icono de nota musical','Abre Top 23, Subir Beat, slots guardados y presets.'],
    ['Grabador','Reproductor del beat, selección de voz, REC, conteo y acceso a FX.'],
    ['Edición','Timeline del beat y las voces, cortes, movimiento, mute, solo y mezcla.'],
    ['Opciones de Proyecto','Archivos .rgodbeat, nube, nuevo proyecto e instalación.'],
    ['EXPORTAR PROYECTO','Abre las salidas WAV y stems, según el acceso de tu cuenta.'],
],widths=[145,CW-145])
title('Antes de tu primera toma')
write('Abre la sección <b>Studio (/studio)</b>. Conecta audífonos, busca un lugar silencioso y haz una prueba corta. Para grabar, permite el acceso al micrófono cuando pulses REC. Los audífonos con cable facilitan revisar el tiempo de la toma.')
note('Modo demo y pase','El modo demo permite grabar en Lead 1. Grabar en otros canales y exportar audio requiere un pase activo. Consulta el estado de tu acceso en la app.')
title('Abrirla como app')
write('<b>iPhone:</b> en Safari, Compartir > Agregar a Inicio. <b>Android:</b> en Chrome, menú > Instalar aplicación o Agregar a inicio, si aparece. La web también tiene una sección Android APK. En Studio puedes abrir la guía del dispositivo desde Opciones de Proyecto > Instalar App Móvil.',9.7)
write('Instalar la app no activa por sí solo las funciones de un pase.',9.2,MUTED)

# 03
newpage('02 / Tu instrumental','Carga y prepara el beat','Puedes usar un beat disponible en Top 23, un preset o un archivo propio.')
shot('02-cargar-beat.png','Selector de beat: pestaña Subir Beat. Usa archivos cuyo audio pueda decodificar tu navegador.',maxheight=230)
step(1,'Abre el selector de beat','Toca el icono de nota musical de la barra superior. En Top 23, elige una pista con audio disponible; en Subir Beat, selecciona tu instrumental.')
step(2,'Revisa BPM y tonalidad','La app analiza el tempo y la tonalidad del archivo importado. Escucha el resultado y corrige los valores manualmente si no coinciden con tu beat; la detección es una estimación.')
step(3,'Reproduce una prueba','Pulsa Play y comprueba que escuchas el beat. La reproducción por sí sola no requiere grabar una toma ni activar el micrófono.')
note('23 slots de beats','El almacenamiento local admite hasta 23 beats importados. Son slots de instrumentales, no 23 proyectos en la nube. Si están llenos, elimina un beat que ya no necesites. WAV y MP3 son buenas primeras opciones; otros formatos dependen del navegador.')

# 04
newpage('03 / Grabar','Construye tu primera voz','Empieza con una toma breve; después añade capas si tu pase permite grabación multipista.')
step(1,'Selecciona el canal','En Grabador elige Lead 1 para la voz principal. Los canales iniciales son Lead 1, Lead 2, Double, Harmony 1, Harmony 2 y Adlibs. Hay hasta dos pistas de apoyo adicionales; su grabación también depende del acceso.')
step(2,'Elige dónde comienza la toma','Ubica el cabezal antes de la frase. Si necesitas entrada, activa el icono de conteo: la app ofrece un compás previo. En Loop puedes elegir 4, 8, 16 compases o el beat completo.')
step(3,'Pulsa REC y permite el micrófono','Graba la frase escuchando el beat por audífonos. Observa el medidor; si aparece saturación, baja el nivel en tu micrófono/interfaz o aléjate un poco antes de repetir.')
step(4,'Detén y escucha','Pulsa STOP. Reproduce la toma y revisa pronunciación, ruido y tiempo. Play escucha el proyecto sin iniciar una nueva grabación.')
step(5,'Haz una segunda pasada con intención','Prueba una voz de apoyo, una armonía o adlibs. Antes de regrabar sobre material existente, guarda una copia: el punch-in modifica el tramo que estás sustituyendo.')
note('Si hay retraso','La app ofrece una compensación fija para Bluetooth. Compara una toma corta y ajusta su posición en Edición si lo necesitas. Los audífonos con cable facilitan revisar el tiempo de la grabación.')
write('<b>Ejercicio:</b> graba una frase de 5-10 segundos, detén, escucha y conserva solo la toma que comunique mejor la idea.',10.5,PURPLE)

# 05
newpage('04 / Edición','Ordena las tomas','La vista Edición permite trabajar sobre los clips grabados, sin perder de vista el beat.')
shot('03-edicion.png','Timeline real con una toma de muestra. El audio de esta captura es un tono sintético de prueba.',maxheight=230)
step(1,'Selecciona y ubica el cabezal','Toca un clip y pausa la reproducción. Coloca el cabezal dentro de la toma para elegir el punto de corte. Usa zoom si necesitas más precisión.')
step(2,'Corta, recorta o mueve','Usa Cortar / Dividir para separar una frase. Recortar inicio o final elimina el audio del lado correspondiente del cabezal. Para mover una toma, desactiva su Seguro (Hold); después arrástrala o utiliza los ajustes finos.')
step(3,'Comprueba el conjunto','Mute silencia una pista y Solo permite escucharla aislada. Ajusta volumen y paneo, y vuelve a escuchar con el beat. Deshacer / Rehacer permite revisar cambios de edición.')
note('Antes de borrar o mover','Verifica el clip seleccionado y elimina solo el fragmento que quieres corregir.')

# 06
newpage('05 / Sonido','Ajusta la voz con FX','La app incluye afinación, ecualización, compresión, saturación, delay y reverb por canal.')
shot('04-efectos.png','Panel real de FX vocales. Los controles inferiores pueden requerir desplazamiento dentro del panel.',maxheight=230)
table(['CONTROL','CÓMO EMPEZAR'],[
    ['Afinador vocal','Selecciona nota raíz y escala correctas. Sube el control desde OFF y compara con bypass.'],
    ['EQ / Compresión','Usa el filtro de graves y ajustes suaves para claridad. Controla la dinámica sin borrar la expresión de la voz.'],
    ['Saturación','Añade carácter con moderación. Comprueba que las consonantes siguen claras.'],
    ['Delay / Reverb','Ajusta mezcla y tipo. Mantén la voz principal al frente y deja los efectos acompañarla.'],
],widths=[126,CW-126],size=9.8)
note('Compara tus ajustes','Escucha la misma toma con los efectos activados y en bypass. Mantén un volumen similar para decidir si el ajuste mejora el sonido.')

# 07
newpage('06 / Conservar y entregar','Guarda antes de exportar','Un archivo de proyecto sirve para volver a editar. Un WAV sirve para escuchar o enviar audio.')
table(['SALIDA','CONTENIDO Y USO'],[
    ['Archivo .rgodbeat','Opciones de Proyecto > Descargar archivo (.rgodbeat). Conserva el proyecto para reabrirlo con Abrir archivo (.rgodbeat). Verifica la descarga.'],
    ['Nube','Inicia sesión. Guardar en la Nube permite nombrar el proyecto y elegir entre 2 espacios. Reemplazar otro proyecto requiere confirmación. Espera el mensaje de guardado.'],
    ['Master Mezclado Completo','Mezcla en WAV de 24 bits. Requiere pase activo. La frecuencia de muestreo se indica en el panel.'],
    ['Stems RAW / Dry','Voces separadas sin los FX del canal, para continuar una mezcla externa. El exportador indica 32-bit float.'],
    ['Stems Wet / Beat WAV','Voces con FX o instrumental por separado. Descarga la salida que corresponda a tu entrega.'],
],widths=[136,CW-136],size=9.8)
title('Rutina de cierre')
write('<b>1.</b> Escucha el inicio y el final. <b>2.</b> Descarga tu .rgodbeat. <b>3.</b> Con el acceso requerido, exporta WAV/stems y revisa los archivos. <b>4.</b> Si usas la nube, comprueba el espacio y la confirmación.')
note('Respaldo y publicación','Mantén una copia descargada de tu proyecto. La publicación en YouTube requiere que la integración esté disponible y conectada; completa los datos y confirma los derechos antes de publicar.')
write('Usar un preview o exportar una maqueta no sustituye la licencia del beat ni los permisos de publicación.',9.4,MUTED)
title('Si algo no responde')
write('<b>Micrófono:</b> revisa el permiso del sitio y la entrada seleccionada en tu sistema. <b>Audio:</b> pulsa Play, comprueba volumen y salida. <b>Nube:</b> revisa sesión y conexión; conserva tu copia local y descarga el .rgodbeat antes de empezar otro proyecto.',9.6)

# Video document: separate PDF, title, header and page numbering.
c.save()
manual_editable = editable
editable = []
c = canvas.Canvas(str(VIDEO_PDF), pagesize=A4)
c.setTitle('RGodbeat Studio | Guion de video')
c.setAuthor('RGodbeat Studio')
c.setSubject('Storyboard, locución y prompts para un video de presentación')
document_label = 'GUION DE VIDEO'
page = 0

newpage('Producción audiovisual','Video de presentación','RGodbeat Studio | Concepto: “De la idea a tu próxima canción”. Duración: 60 segundos.')
table(['DECISIÓN','PROPUESTA DE PRODUCCIÓN'],[
    ['Objetivo','Mostrar un recorrido creíble: cargar beat > grabar voz > editar > ajustar FX > guardar/exportar.'],
    ['Público','Artistas independientes que quieren desarrollar una canción sobre un instrumental.'],
    ['Formato principal','16:9, 1920 x 1080, 30 fps. Versión vertical independiente en 1080 x 1920; no recortes toda la interfaz a ciegas.'],
    ['Estilo','Negro y grafito, acentos ámbar, detalles morados. Cámara estable, luz cálida, transiciones breves y tipografía limpia.'],
    ['Material principal','Captura real de Studio. IA para el ambiente, micrófono o planos de cierre. Logo y textos exactos añadidos en edición.'],
],widths=[126,CW-126],size=9.8)
title('Prepara estos materiales')
write('<b>Audio:</b> un instrumental autorizado y una frase vocal propia. <b>Producto:</b> grabaciones de las dos vistas, carga del beat, FX y exportación. <b>Marca:</b> logo original. <b>Montaje:</b> locución separada, subtítulos y cierre con la ruta de Studio.')
note('Capturas incluidas','Los PNG del kit muestran la interfaz local real en modo demo; la toma visible usa un tono sintético de prueba. Sirven para preparar la producción. Para el anuncio final, graba una voz musical real y usa un pase activo para mostrar las funciones de pago en funcionamiento.')
write('Tiempo en pantalla: aproximadamente 47 segundos de producto y 13 de apertura/cierre. La interfaz es la protagonista.',10.4,PURPLE)

# 09
newpage('Storyboard / 00:00-00:26','Presenta y demuestra','Los tiempos son objetivos de montaje. Genera los planos de IA por separado y recórtalos al editar.')
scene('00:00-00:05','La idea',
      'Plano corto de micrófono y audífonos, luz ámbar lateral y fondo grafito. Acercamiento suave. IA o rodaje real; ningún botón inventado.',
      'Esa idea que tienes merece escucharse.',
      'TU PRÓXIMA CANCIÓN EMPIEZA AQUÍ')
scene('00:05-00:11','El producto',
      'Corte a una captura real de Grabador. Entra el logo original como gráfico. Enmarca el reproductor y los controles, sin ocultarlos.',
      'RGodbeat Studio reúne tu beat y tu voz en un mismo espacio.',
      'RGODBEAT STUDIO')
scene('00:11-00:18','El beat',
      'Abre el icono de nota musical. Muestra Subir Beat y selecciona el archivo autorizado. Corte limpio al beat ya cargado; conserva el título y BPM reales.',
      'Elige una pista del catálogo o carga tu propio instrumental.',
      'ELIGE TU BEAT')
scene('00:18-00:26','La toma',
      'Selecciona Lead 1, activa conteo y pulsa REC. Muestra brevemente el medidor y el resultado tras STOP. La voz escuchada corresponde a esa toma.',
      'Selecciona tu canal, activa el conteo y graba tu primera toma.',
      'GRABA TU VOZ')

# 10
newpage('Storyboard / 00:26-01:00','Haz visible el resultado','Mantén acciones simples y lectura clara. El espectador debe entender qué cambió.')
scene('00:26-00:34','La edición',
      'Abre Edición. En una captura real, selecciona una toma, coloca el cabezal y divide. Acerca el plano al resultado; si la mueves, muestra que desbloqueaste Hold.',
      'En Edición, corta, acomoda y organiza cada parte.',
      'DALE FORMA A TU TOMA')
scene('00:34-00:43','El sonido',
      'Abre FX de la misma voz. Enseña tonalidad correcta y un ajuste pequeño de reverb. Alterna 2 segundos de voz seca y 2 segundos con FX al mismo volumen.',
      'Ajusta afinación, ecualización, compresión, delay y reverb. Escucha la diferencia.',
      'TU VOZ / TU SONIDO')
scene('00:43-00:52','La entrega',
      'Captura Descargar archivo (.rgodbeat). Con un pase activo real, abre EXPORTAR PROYECTO y muestra WAV y stems. Usa una descarga verdadera; no fabriques el mensaje de éxito.',
      'Guarda tu proyecto. Con un pase activo, exporta tu mezcla WAV y tus voces por separado.',
      'GUARDA + EXPORTA<br/>Exportación de audio con pase activo')
scene('00:52-01:00','La invitación',
      'Plano de ambiente o cierre limpio con el logo original añadido en montaje. Deja la ruta de Studio al menos los últimos 3 segundos, sin animación que dificulte leerla.',
      'De la idea a tu próxima canción. Empieza en RGodbeat Studio.',
      'EMPIEZA EN STUDIO / rgodbeat.com/studio')

# 11
newpage('Prompts / Planos de ambiente','Genera el ambiente con IA','Prompts en inglés para copiar; la locución y los rótulos finales se mantienen en español.')
prompt('A / Apertura de micrófono',
       'Cinematic close-up of a real studio microphone and wired headphones on a graphite desk, warm amber side light, subtle violet background glow, intimate independent music studio at night. Slow controlled camera push-in, shallow depth of field, realistic materials, premium music product film. Leave clean dark negative space on the left for a title added later. No text, no logos, no interface, no dialogue, no music.')
prompt('B / Plano de manos opcional',
       'Close-up of an adult music artist placing wired headphones beside a microphone in the same graphite studio, warm amber light from camera right, subtle violet background. Natural hand movement, physically correct fingers, calm confident mood, stable camera, realistic commercial cinematography. Do not show readable device screens. No text, no logos, no dialogue, no generated music.')
prompt('C / Cierre de marca',
       'Minimal cinematic graphite studio background with a soft warm amber light reflection and a subtle violet edge light. Slow almost imperceptible camera drift, elegant restrained atmosphere, clean center and lower area reserved for a logo and call to action added in editing. No text, no logos, no interface, no people, no dialogue, no music.')
write('<b>Continuidad:</b> conserva dirección de luz, escritorio y paleta entre planos. Usa la misma imagen de referencia si tu herramienta lo permite. Genera variantes y selecciona la más natural; la duración final se fija en el montaje.',9.6,MUTED)

# 12
newpage('IA / Ensamblaje','Cómo llevarlo a Flow o similar','Flujo adaptable. Verifica qué controles de video y referencias ofrece tu modelo antes de generar.')
step(1,'Crea el proyecto y define el formato','En Google Flow abre o crea un proyecto, selecciona Video y revisa relación de aspecto y duración. Genera la apertura y el cierre como clips independientes. [1]')
step(2,'Añade referencias coherentes','Cuando estén disponibles, usa Ingredients para mantener objetos/estilo o Frames para definir el inicio/final. Añade un prompt que describa la acción y complemente la imagen. [1]')
step(3,'Graba la app fuera del generador','Registra las acciones de las escenas 2-7 en Studio. Importa esas grabaciones al editor de video que uses; no pidas al modelo recrear menús, textos o resultados de la aplicación.')
step(4,'Monta, mezcla y subtitula','Ordena los clips con los tiempos del storyboard. Añade la voz, el instrumental, los rótulos exactos, el logo y los subtítulos del kit. La disponibilidad de funciones de Flow puede variar; el montaje final puede hacerse en otro editor.')
note('Prompt maestro para una IA de guion o edición',
     'Usa esta guía como fuente de verdad para producir un demo de RGodbeat Studio de 60 segundos en español, 16:9. Respeta los ocho bloques del storyboard y la locución. Utiliza mis capturas reales para toda interacción con la app; genera solo los planos de ambiente. Mantén negro/grafito, luz ámbar y detalles morados. Añade el logo original y los rótulos en edición. Indica que exportar audio requiere un pase activo. No inventes controles, precios, resultados, compatibilidad ni una publicación exitosa. Entrega lista de clips, orden de montaje y tareas pendientes con los materiales que falten.')
write('[1] Google Flow Help, “Create videos in Google Flow”. Fuente oficial consultada el 10/10/2026. Enlace completo en la página 7.',8.7,MUTED)

# 13
newpage('Audio / Adaptaciones','Locución lista para producir','Voz cercana y segura, español latino neutro. Ritmo natural, sin estilo de anuncio exagerado.')
voice = [
    ('00:00-00:05','Esa idea que tienes merece escucharse.'),
    ('00:05-00:11','RGodbeat Studio reúne tu beat y tu voz en un mismo espacio.'),
    ('00:11-00:18','Elige una pista del catálogo o carga tu propio instrumental.'),
    ('00:18-00:26','Selecciona tu canal, activa el conteo y graba tu primera toma.'),
    ('00:26-00:34','En Edición, corta, acomoda y organiza cada parte.'),
    ('00:34-00:43','Ajusta afinación, ecualización, compresión, delay y reverb. Escucha la diferencia.'),
    ('00:43-00:52','Guarda tu proyecto. Con un pase activo, exporta tu mezcla WAV y tus voces por separado.'),
    ('00:52-01:00','De la idea a tu próxima canción. Empieza en RGodbeat Studio.'),
]
for time,text in voice:
    write(f'<font color="#7444BF"><b>{time}</b></font>  {text}',10.5,gap=10)
title('Versión vertical de 15 segundos')
write('<b>0-3 s:</b> “Tu beat. Tu voz.” + micrófono. <b>3-7 s:</b> captura de REC. <b>7-11 s:</b> edición y FX, una acción por plano. <b>11-15 s:</b> logo + “Empieza en RGodbeat Studio” + ruta. Este recorte puede centrarse en crear; si muestra exportación, conserva la condición de pase activo.',9.9)
title('Cuatro piezas educativas')
write('1. Cargar un instrumental y revisar su BPM. 2. Grabar una primera voz con conteo. 3. Cortar una toma y usar Hold. 4. Diferencia entre proyecto .rgodbeat, master WAV y stems. Cada pieza demuestra una sola acción real.',9.9)
note('Sonido del demo','Durante el antes/después de FX deja respirar la voz musical. Baja la locución y la música de fondo para que el cambio sea audible. El SRT incluido es una base de tiempos: ajústalo a la interpretación final y revisa la pronunciación de RGodbeat.')

# 14
newpage('Entrega / Verificación','Antes de publicar','Una revisión final mantiene coherencia entre lo que enseñas y lo que la app permite hacer.')
table(['REVISIÓN','CRITERIO DE ENTREGA'],[
    ['Producto','Botones y pantallas reales, nombres correctos, pase activo para demostrar exportación/multipista. No señales una descarga como exitosa sin comprobar el archivo.'],
    ['Imagen','Cursor visible cuando aporte claridad, zoom moderado, textos nítidos, logo original. En vertical, usa encuadres específicos para cada control.'],
    ['Audio','Voz inteligible, beat autorizado y comparación de FX al mismo volumen. Sin saturación, saltos bruscos o tomas sintéticas en el anuncio final.'],
    ['Montaje','Duración cercana a 60 s, ritmo claro, subtítulos sincronizados y CTA legible durante al menos 3 s. Revisa la ruta pública antes de lanzar la campaña.'],
],widths=[100,CW-100],size=9.5)
title('Fuentes y alcance')
write('<b>Producto:</b> componentes StudioApp, TopBar, LoadBeatModal, TimelineWorkspace, VocalFXModal y ExportModal; módulos de guardado local y nube; API de acceso. Revisados en el repositorio rgodbeat-v2 el 10/10/2026. No se probaron compras, guardados de cuenta ni publicaciones reales para crear esta guía.',9.3,MUTED)
write('<b>[1] Fuente oficial de Flow:</b><br/><link href="https://support.google.com/flow/answer/16353334" color="#7444BF">support.google.com/flow/answer/16353334</link><br/>Respalda la creación por prompts y el uso de Ingredients/Frames. Los parámetros de cámara, la duración de 60 segundos y el montaje aquí propuestos son dirección creativa para RGodbeat.',9.3,MUTED)
note('Kit editable','Guion y prompts en Markdown, subtítulos SRT de referencia, cuatro capturas PNG y el logo original. Las capturas de prueba no acreditan acceso premium ni una exportación real.')

c.save()
shutil.copy2(ROOT/'public/images/rgodbeat-studio-logo.png', ASSETS/'rgodbeat-studio-logo.png')
# Preserve useful plain Markdown for pasting into text-oriented AI tools.
import re
def save_markdown(path, heading, content):
    markdown = f'# RGodbeat Studio - {heading}\n\nEdición 02 - 10 octubre 2026.\n\n'+'\n\n'.join(content)
    markdown = re.sub(r'<[^>]+>','',markdown)
    markdown = markdown.replace('&gt;','>').replace('&lt;','<').replace('&amp;','&')
    path.write_text(markdown,encoding='utf-8')
save_markdown(OUT/'pdf'/'RGodbeat-Studio-Guia-de-Uso.md','Guía de uso',manual_editable)
save_markdown(PACK/'Guion-y-prompts.md','Guion de video',editable)
subtitles = [
    ('00:00:00,000','00:00:05,000','Esa idea que tienes\nmerece escucharse.'),
    ('00:00:05,000','00:00:11,000','RGodbeat Studio reúne tu beat\ny tu voz en un mismo espacio.'),
    ('00:00:11,000','00:00:18,000','Elige una pista del catálogo\no carga tu propio instrumental.'),
    ('00:00:18,000','00:00:22,000','Selecciona tu canal,\nactiva el conteo'),
    ('00:00:22,000','00:00:26,000','y graba tu primera toma.'),
    ('00:00:26,000','00:00:30,000','En Edición, corta, acomoda'),
    ('00:00:30,000','00:00:34,000','y organiza cada parte.'),
    ('00:00:34,000','00:00:39,000','Ajusta afinación, ecualización,\ncompresión, delay y reverb.'),
    ('00:00:39,000','00:00:43,000','Escucha la diferencia.'),
    ('00:00:43,000','00:00:47,000','Guarda tu proyecto. Con un pase activo,\nexporta tu mezcla WAV'),
    ('00:00:47,000','00:00:52,000','y tus voces por separado.'),
    ('00:00:52,000','00:00:56,000','De la idea a tu próxima canción.'),
    ('00:00:56,000','00:01:00,000','Empieza en RGodbeat Studio.'),
]
(PACK/'Demo-60s-es.srt').write_text('\n\n'.join(f'{i}\n{start} --> {end}\n{text}' for i,(start,end,text) in enumerate(subtitles,1))+'\n',encoding='utf-8')
(PACK/'LEEME.txt').write_text('RGODBEAT STUDIO - KIT DE PRODUCCIÓN\n\nRGodbeat-Studio-Guia-de-Uso.pdf: instrucciones de la app.\nRGodbeat-Studio-Guion-de-Video.pdf: storyboard, locución y prompts para el video de 60 segundos.\nSon documentos separados.\nGuion-y-prompts.md: texto editable para una IA de guion/edición.\nDemo-60s-es.srt: subtítulos con tiempos objetivo; sincronizar tras grabar voz.\nassets/: interfaz local real en modo demo y logo original.\nLa toma de la captura 03 usa audio sintético de prueba; sustituir en el anuncio.\nNo hay un video final renderizado en este kit.\n',encoding='utf-8')
with zipfile.ZipFile(OUT/'RGodbeat-Studio-Kit-Demo-IA.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.write(PDF,PDF.name)
    z.write(VIDEO_PDF,VIDEO_PDF.name)
    for path in sorted(PACK.rglob('*')):
        if path.is_file(): z.write(path,Path('kit')/path.relative_to(PACK))
print(f'Created 7-page manual: {PDF}')
print(f'Created {page}-page video plan: {VIDEO_PDF}')
print(f'Editable pack: {OUT / "RGodbeat-Studio-Kit-Demo-IA.zip"}')
(OUT/'pdf'/'RGodbeat-Studio-Guia-y-Demo-IA.pdf').unlink(missing_ok=True)
