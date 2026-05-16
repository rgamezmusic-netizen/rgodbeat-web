# INSTRUCCIONES DE USO - ANTIGRAVITY PRODUCER

## 1. INSTALACIÓN INICIAL
Si es la primera vez que usas este proyecto, abre la terminal en esta carpeta y ejecuta:
```bash
npm install
```

## 2. CÓMO AGREGAR NUEVOS BEATS (AUTOMÁTICO)
Para que los beats aparezcan automáticamente en la página, sigue estos pasos:

1.  **Ubicación**: Coloca tus archivos de audio (`.wav` o `.mp3`) en la carpeta del género correspondiente dentro de `BEATS/`.
    *   Ejemplo: `BEATS/reggaeton/`
    *   Ejemplo: `BEATS/trap/`

2.  **Nombre del Archivo**: El sistema detecta automáticamente el BPM y la Nota (Key) si los incluyes en el nombre del archivo.
    *   **Formato ideal**: `Titulo del Beat 120bpm Cm.wav`
    *   Ejemplo: `Fuego Lento 94bpm Em.wav`
    *   Ejemplo: `Dark Vibes 140 Am.mp3`

    *Nota: El sistema ahora es inteligente y puede leer nombres con espacios, pero se recomienda mantenerlos simples.*

3.  **Imagen de Portada (Opcional)**:
    *   Si quieres una portada específica, coloca una imagen (`.jpg` o `.png`) en `BEATS/imagen/` con el **mismo nombre exacto** que el archivo de audio.
    *   Ejemplo Audio: `BEATS/reggaeton/Fuego Lento.wav`
    *   Ejemplo Imagen: `BEATS/imagen/Fuego Lento.jpg`
    *   Si no pones imagen, el sistema usará una por defecto.

## 3. INICIAR EL SERVIDOR (IMPORTANTE)
Para que la página funcione al 100% (cargue todos los beats, genere contratos, envíe correos), debes iniciar el servidor.

1.  Abre la terminal en la carpeta del proyecto.
2.  Ejecuta:
    ```bash
    npm start
    ```
3.  Verás un mensaje: `Server running on http://localhost:3000`
4.  Abre tu navegador y ve a: `http://localhost:3000`

## 4. MODO DEMO (SIN SERVIDOR)
Si solo abres el archivo `index.html` sin iniciar el servidor, la página funcionará en "Modo Demo".
*   Solo verás 3 beats de ejemplo.
*   No podrás comprar ni generar contratos.
*   Sirve solo para probar el diseño visual.

## 5. SOLUCIÓN DE PROBLEMAS
*   **"No se reproduce el audio"**: Verifica que el archivo de audio realmente existe en la carpeta y que su nombre no tenga caracteres muy extraños (aunque el sistema ya soporta espacios).
*   **"No cargan los beats"**: Asegúrate de haber ejecutado `npm start`.
