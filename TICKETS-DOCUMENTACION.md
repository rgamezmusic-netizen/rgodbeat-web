# 🎫 Sistema de Tickets - Documentación de Uso

## 📋 Descripción General

El sistema de tickets permite ofrecer promociones y descuentos especiales en la compra de beats. Los tickets pueden ser para:

- **Beats Gratis (100% descuento)**
- **Descuentos Porcentuales** (ej: 50% off)
- **Descuentos Fijos** (ej: $10 de descuento)

### Características de Seguridad

✅ **Códigos Únicos**: Cada ticket tiene un código alfanumérico único imposible de adivinar  
✅ **Hash Criptográfico**: SHA-256 previene falsificación  
✅ **Un Solo Uso**: Los tickets se marcan como "usados" automáticamente  
✅ **Fecha de Expiración**: Opcional, para limitar validez temporal  
✅ **Beat Específico**: Opcional, para restringir a un beat en particular  

---

## 👨‍💼 Uso del Panel de Administración

### Acceder al Panel

1. Abre tu navegador y ve a: `http://localhost:3000/admin-tickets.html`
2. Ingresa la contraseña de administrador: **`RGodbeat2025!`**
   > ⚠️ **IMPORTANTE**: Cambia esta contraseña en `server.js` línea 35 antes de desplegar a producción
3. Click en "🔐 Acceder"

### Generar un Ticket

#### Ticket Gratis (Beat 100% Gratis)

1. Selecciona tipo: **"🎁 Gratis (100% descuento)"**
2. Completa los campos opcionales:
   - **Beat Específico**: Deja vacío para cualquier beat, o escribe el nombre exacto del beat
   - **Fecha de Expiración**: Opcional, formato YYYY-MM-DD
   - **Usos Máximos**: Por defecto 1 (un solo uso)
3. Click "🎫 Generar Ticket"
4. **Copia el código generado** (ej: `BEAT-A7F9-2K4L-X8Q3`)

#### Ticket con Descuento Porcentual

1. Selecciona tipo: **"📊 Descuento Porcentual"**
2. Ingresa el **Valor del Descuento** (ej: `50` para 50% off)
3. Completa campos opcionales
4. Click "🎫 Generar Ticket"

#### Ticket con Descuento Fijo

1. Selecciona tipo: **"💰 Descuento Fijo"**
2. Ingresa la **cantidad en dólares** (ej: `10` para $10 de descuento)
3. Completa campos opcionales
4. Click "🎫 Generar Ticket"

### Ver Tickets Generados

La tabla inferior muestra todos los tickets con código, tipo, descuento, beat específico (si aplica), usos, estado, y fecha de creación.

---

## 🛒 Uso del Cliente (Canje de Tickets)

### Cómo Usar un Ticket al Comprar

1. Ve a la **Beat Store** en la página principal
2. Selecciona un beat y haz click en **"BUY NOW"**
3. En el modal de checkout:
   - Completa tu nombre y email
   - En el campo **"¿TIENES UN TICKET? 🎫"** ingresa el código
   - Click en **"APLICAR"**
4. Si es válido, verás el mensaje de éxito y el precio actualizado
5. Click en **"COMPLETE PURCHASE"** con el precio ajustado

---

## 🔐 Información de Seguridad

### Contraseña de Admin

La contraseña por defecto es `RGodbeat2025!`. Para cambiarla:


1. Abre `server.js`, línea 35
2. Cambia el valor de `ADMIN_PASSWORD`
3. Reinicia el servidor

### Cómo Funcionan los Tickets

1. **Generación**: Se crea un código aleatorio (ej: `BEAT-A7F9-2K4L-X8Q3`)
2. **Hash**: Se guarda un hash SHA-256 del código en la base de datos
3. **Validación**: Al canjear, se compara el hash del código ingresado
4. **Uso**: Se marca el timestamp, usuario, y beat canjeado
5. **Bloqueo**: Cuando `currentUses >= maxUses`, el ticket se marca como "usado"

---

## 🚀 Endpoints de API

### `POST /api/admin/generate-ticket`
Genera un nuevo ticket (requiere password de admin)

### `POST /api/validate-ticket`
Valida un ticket sin canjearlo

### `POST /api/checkout`
Procesa la compra con ticket opcional

---

## ❓ Solución de Problemas

### El servidor no arranca
```bash
cd /Volumes/RGodbeat\ XXX/Paginas\ Web/antigravity-producer
npm start
```

### No se puede acceder al panel admin
1. Verifica que el servidor esté corriendo en `http://localhost:3000`
2. Asegúrate de usar la URL correcta: `http://localhost:3000/admin-tickets.html`
3. Revisa la contraseña en `server.js` línea 35

### El ticket no se aplica en el checkout
1. Asegúrate de hacer click en **"APLICAR"** antes de completar la compra
2. Verifica que el código esté escrito correctamente (sin espacios)
3. Comprueba que el ticket no haya expirado o sido usado

---

**Versión**: 1.0  
**Última actualización**: Diciembre 2025
