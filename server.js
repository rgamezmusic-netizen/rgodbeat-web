const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for signature image
app.use(express.static(__dirname)); // Serve static files

// Database file
const DB_FILE = path.join(__dirname, 'database.json');

// Helper to read DB
const readDB = () => {
    if (!fs.existsSync(DB_FILE)) return { orders: [] };
    return JSON.parse(fs.readFileSync(DB_FILE));
};

// Helper to write DB
const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// Admin password (CHANGE THIS!)
const ADMIN_PASSWORD = 'Lary20590483*';

// Ticket helper functions
const generateTicketCode = () => {
    // Generate random 16-character code: BEAT-XXXX-XXXX-XXXX
    const randomBytes = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `BEAT-${randomBytes.slice(0, 4)}-${randomBytes.slice(4, 8)}-${randomBytes.slice(8, 12)}`;
};

const hashTicketCode = (code) => {
    return crypto.createHash('sha256').update(code).digest('hex');
};

const initializeTicketsDB = () => {
    const db = readDB();
    if (!db.tickets) {
        db.tickets = [];
        writeDB(db);
    }
};

// --- ROUTES ---

// Initialize tickets database
initializeTicketsDB();

// 1. Admin: Generate Ticket
app.post('/api/admin/generate-ticket', (req, res) => {
    const { adminPassword, ticketType, discountValue, specificBeat, expirationDate, maxUses } = req.body;

    // Verify admin password
    if (adminPassword !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });
    }

    // Validate ticket type
    const validTypes = ['free', 'percentage', 'fixed'];
    if (!validTypes.includes(ticketType)) {
        return res.status(400).json({ error: 'Tipo de ticket inválido. Usa: free, percentage, o fixed' });
    }

    // Generate unique ticket code
    const ticketCode = generateTicketCode();
    const ticketHash = hashTicketCode(ticketCode);

    // Create ticket object
    const newTicket = {
        code: ticketCode,
        hash: ticketHash,
        type: ticketType,
        discountValue: discountValue || (ticketType === 'free' ? 100 : 0),
        specificBeat: specificBeat || null,
        expirationDate: expirationDate || null,
        maxUses: maxUses || 1,
        currentUses: 0,
        usedBy: [],
        createdAt: new Date().toISOString(),
        status: 'active'
    };

    // Save to database
    const db = readDB();
    db.tickets.push(newTicket);
    writeDB(db);

    console.log(`[TICKET CREATED] ${ticketCode} - Type: ${ticketType}, Value: ${discountValue}`);

    res.json({
        success: true,
        ticketCode: ticketCode,
        ticketDetails: {
            type: ticketType,
            discountValue: discountValue,
            validUntil: expirationDate || 'Sin expiración',
            remainingUses: maxUses || 1
        }
    });
});

// 2. Validate Ticket
app.post('/api/validate-ticket', (req, res) => {
    const { ticketCode, beatName } = req.body;

    if (!ticketCode) {
        return res.status(400).json({ error: 'Código de ticket requerido' });
    }

    const db = readDB();
    const ticketHash = hashTicketCode(ticketCode);

    // Find ticket by hash
    const ticket = db.tickets.find(t => t.hash === ticketHash);

    if (!ticket) {
        return res.json({
            valid: false,
            message: 'Ticket no válido o no existe'
        });
    }

    // Check if ticket is already fully used
    if (ticket.currentUses >= ticket.maxUses) {
        return res.json({
            valid: false,
            message: 'Este ticket ya ha sido usado'
        });
    }

    // Check if expired
    if (ticket.expirationDate) {
        const expDate = new Date(ticket.expirationDate);
        const now = new Date();
        if (now > expDate) {
            return res.json({
                valid: false,
                message: 'Este ticket ha expirado'
            });
        }
    }

    // Check if ticket is for specific beat
    if (ticket.specificBeat && beatName && ticket.specificBeat !== beatName) {
        return res.json({
            valid: false,
            message: `Este ticket solo es válido para el beat: ${ticket.specificBeat}`
        });
    }

    // Calculate discount
    let finalPrice = 30; // Default beat price
    let discountAmount = 0;

    if (ticket.type === 'free') {
        finalPrice = 0;
        discountAmount = 30;
    } else if (ticket.type === 'percentage') {
        discountAmount = (30 * ticket.discountValue) / 100;
        finalPrice = 30 - discountAmount;
    } else if (ticket.type === 'fixed') {
        discountAmount = ticket.discountValue;
        finalPrice = Math.max(0, 30 - ticket.discountValue);
    }

    res.json({
        valid: true,
        discount: {
            type: ticket.type,
            value: ticket.discountValue,
            originalPrice: 30,
            discountAmount: discountAmount,
            finalPrice: finalPrice
        },
        message: ticket.type === 'free' ? 'Beat gratis con este ticket!' : `Descuento aplicado: $${discountAmount.toFixed(2)}`
    });
});

// 3. Get All Tickets (Admin)
app.post('/api/admin/tickets', (req, res) => {
    const { adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Contraseña de administrador incorrecta' });
    }

    const db = readDB();

    // Return tickets without the hash (security)
    const tickets = db.tickets.map(t => ({
        code: t.code,
        type: t.type,
        discountValue: t.discountValue,
        specificBeat: t.specificBeat,
        expirationDate: t.expirationDate,
        maxUses: t.maxUses,
        currentUses: t.currentUses,
        usedBy: t.usedBy,
        createdAt: t.createdAt,
        status: t.status
    }));

    res.json({ tickets });
});

// 4. Get Beats Endpoint
app.get('/api/beats', (req, res) => {
    const beatsDir = path.join(__dirname, 'BEATS');
    const beats = [];
    let beatCounter = 0; // Global counter for unique IDs

    try {
        if (fs.existsSync(beatsDir)) {
            const genres = fs.readdirSync(beatsDir).filter(file => {
                return fs.statSync(path.join(beatsDir, file)).isDirectory();
            });

            genres.forEach(genre => {
                const genreDir = path.join(beatsDir, genre);
                const files = fs.readdirSync(genreDir).filter(file => {
                    return !file.startsWith('.') && ['.wav', '.mp3', '.m4a'].includes(path.extname(file).toLowerCase());
                });

                files.forEach((file) => {
                    const nameWithoutExt = path.parse(file).name;

                    // Robust BPM detection (looks for 2-3 digits followed optionally by 'bpm')
                    const bpmMatch = nameWithoutExt.match(/\b(\d{2,3})\s*(?:bpm)?\b/i);
                    const bpm = bpmMatch ? bpmMatch[1] + ' BPM' : 'N/A';

                    // Robust Key detection
                    // Matches: C, C#, Cb, Cmaj, Cmin, C major, C minor, etc.
                    const keyMatch = nameWithoutExt.match(/\b([A-G][#b]?)\s*(?:m|min|maj|major|minor)?\b/i);
                    let key = 'N/A';
                    if (keyMatch) {
                        const root = keyMatch[1];
                        const isMinor = /m|min|minor/i.test(keyMatch[0]);
                        key = root + (isMinor ? 'm' : '');
                    }

                    // Image detection logic
                    const imagesDir = path.join(beatsDir, 'imagen');
                    const validExtensions = ['.jpg', '.jpeg', '.png', '.JPG', '.PNG'];
                    let cover = null; // Will determine below

                    // 1. Try to find exact match in the SAME FOLDER as the beat (genreDir)
                    for (const ext of validExtensions) {
                        const potentialImageLocal = path.join(genreDir, nameWithoutExt + ext);
                        if (fs.existsSync(potentialImageLocal)) {
                            // Path relative to the server root
                            cover = `BEATS/${genre}/${encodeURIComponent(nameWithoutExt + ext)}`;
                            break;
                        }
                    }

                    // 2. If not found, try to find exact match in the CENTRAL images folder
                    if (!cover) {
                        for (const ext of validExtensions) {
                            const potentialImageCentral = path.join(imagesDir, nameWithoutExt + ext);
                            if (fs.existsSync(potentialImageCentral)) {
                                cover = `BEATS/imagen/${encodeURIComponent(nameWithoutExt + ext)}`;
                                break;
                            }
                        }
                    }

                    // 3. If not found, try to find "empty" default image in CENTRAL images folder
                    if (!cover) {
                        for (const ext of validExtensions) {
                            const emptyImage = path.join(imagesDir, 'empty' + ext);
                            if (fs.existsSync(emptyImage)) {
                                cover = `BEATS/imagen/empty${ext}`;
                                break;
                            }
                        }
                    }

                    // 4. Fallback hardcoded (should rarely be reached if empty.png exists)
                    if (!cover) {
                        cover = 'BEATS/imagen/empty.png';
                    }

                    // Map folder genre to frontend filter format
                    // Folders are now normalized to: country, trap, reggaeton, house, afrobeat, hiphop, rnb
                    const filterGenre = genre;
                    const displayGenre = genre.toUpperCase();

                    // Use global counter for truly unique IDs
                    beatCounter++;

                    beats.push({
                        id: `beat_${beatCounter}`,
                        title: nameWithoutExt,
                        genre: filterGenre, // For filtering
                        displayGenre: displayGenre, // For display if needed
                        bpm: bpm,
                        key: key,
                        price: 30,
                        cover: cover,
                        // CRITICAL: URL Encode the filename to handle spaces and special chars
                        audio: `BEATS/${genre}/${encodeURIComponent(file)}`
                    });
                });
            });
        }
        res.json(beats);
    } catch (error) {
        console.error('Error scanning beats:', error);
        res.status(500).json({ error: 'Failed to load beats' });
    }
});

// 5. Checkout Endpoint (Updated with Ticket Support)
app.post('/api/checkout', (req, res) => {
    const { name, email, country, beatName, price, ticketCode } = req.body;

    if (!name || !email || !beatName) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    let finalPrice = price || 30;
    let ticketUsed = null;

    // If ticket code provided, validate and apply it
    if (ticketCode) {
        const db = readDB();
        const ticketHash = hashTicketCode(ticketCode);
        const ticketIndex = db.tickets.findIndex(t => t.hash === ticketHash);

        if (ticketIndex !== -1) {
            const ticket = db.tickets[ticketIndex];

            // Validate ticket
            if (ticket.currentUses < ticket.maxUses && ticket.status === 'active') {
                // Check expiration
                let isExpired = false;
                if (ticket.expirationDate) {
                    const expDate = new Date(ticket.expirationDate);
                    if (new Date() > expDate) {
                        isExpired = true;
                    }
                }

                // Check specific beat
                let isCorrectBeat = true;
                if (ticket.specificBeat && ticket.specificBeat !== beatName) {
                    isCorrectBeat = false;
                }

                if (!isExpired && isCorrectBeat) {
                    // Apply discount
                    if (ticket.type === 'free') {
                        finalPrice = 0;
                    } else if (ticket.type === 'percentage') {
                        finalPrice = price - ((price * ticket.discountValue) / 100);
                    } else if (ticket.type === 'fixed') {
                        finalPrice = Math.max(0, price - ticket.discountValue);
                    }

                    // Mark ticket as used
                    ticket.currentUses += 1;
                    ticket.usedBy.push({
                        name: name,
                        email: email,
                        beatName: beatName,
                        usedAt: new Date().toISOString()
                    });

                    if (ticket.currentUses >= ticket.maxUses) {
                        ticket.status = 'used';
                    }

                    db.tickets[ticketIndex] = ticket;
                    writeDB(db);

                    ticketUsed = {
                        code: ticketCode,
                        type: ticket.type,
                        discount: price - finalPrice
                    };

                    console.log(`[TICKET REDEEMED] ${ticketCode} by ${name} for ${beatName}`);
                }
            }
        }
    }

    // Simulate Payment Processing (Stripe/PayPal placeholder)
    console.log(`Processing payment for ${name} ($${finalPrice}) - Beat: ${beatName}${ticketUsed ? ' [TICKET APPLIED]' : ''}`);

    // In a real app, you'd verify payment here.
    // For now, we assume success.

    res.json({
        success: true,
        message: ticketUsed ? `Payment successful! Ticket applied: $${ticketUsed.discount.toFixed(2)} discount` : 'Payment successful',
        finalPrice: finalPrice,
        ticketApplied: ticketUsed !== null,
        redirectUrl: '/complete-license.html'
    });
});

// 2. Sign Contract & Complete Order Endpoint
app.post('/api/sign-contract', async (req, res) => {
    const { name, email, beatName, price, signatureData, date } = req.body;

    if (!name || !email || !signatureData) {
        return res.status(400).json({ error: 'Missing signature or data' });
    }

    try {
        // A. Create PDF Contract
        const doc = new PDFDocument();
        const contractFileName = `Contract_${name.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        const contractsDir = path.join(__dirname, 'contracts');

        if (!fs.existsSync(contractsDir)) fs.mkdirSync(contractsDir);

        const contractPath = path.join(contractsDir, contractFileName);
        const writeStream = fs.createWriteStream(contractPath);

        doc.pipe(writeStream);

        // -- PDF CONTENT START --
        doc.font('Helvetica-Bold').fontSize(18).text('CONTRATO DE LICENCIA NO EXCLUSIVA DE BEAT', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).font('Helvetica').text('Tipo de Licencia: WAV de Alta Calidad (High-Quality WAV)');
        doc.text(`Hecho y Efectivo a partir de la Fecha de Compra: ${date}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').text('I. PARTES DEL ACUERDO');
        doc.font('Helvetica').text('1. LICENCIANTE (Productor Musical):');
        doc.text('• Nombre: Rafael Gámez');
        doc.text('• Nombre Artístico: RGodbeat');
        doc.text('• Correo Electrónico: RGamezmusic@gmail.com');
        doc.moveDown();
        doc.text('2. LICENCIATARIO (Comprador/Artista):');
        doc.text(`• Nombre Completo: ${name}`);
        doc.text(`• Fecha de Compra: ${date}`);
        doc.text(`• Beat/Instrumental Licenciado: ${beatName}`);
        doc.text(`• Precio de la Licencia: $${price}`);
        doc.moveDown();

        doc.font('Helvetica-Bold').text('II. DEFINICIÓN Y ENTREGA');
        doc.font('Helvetica').text('El Licenciante otorga al Licenciatario una licencia de uso del Beat en formato WAV de alta calidad sin compresión, ideal para grabación y mezcla profesional.');
        doc.text('El archivo entregado incluye WAV + MP3 sin marcas de voz.');
        doc.text('Esta licencia NO incluye stems.');
        doc.moveDown();

        doc.font('Helvetica-Bold').text('III. DERECHOS OTORGADOS (NO EXCLUSIVOS)');
        doc.font('Helvetica').text('1. Distribución digital: límite 250,000 streams combinados.');
        doc.text('2. Ventas físicas: límite 5,000 copias.');
        doc.text('3. Radio/Shows: 2 videos musicales y 20 presentaciones en vivo.');
        doc.text('4. Monetización en YouTube permitida sin usar Content ID.');
        doc.text('5. Duración: 10 años desde la fecha de compra.');
        doc.text('6. Propiedad: El Licenciante conserva copyright del beat.');
        doc.moveDown();

        doc.font('Helvetica-Bold').text('IV. CRÉDITO Y REGALÍAS');
        doc.font('Helvetica').text('1. Crédito obligatorio:');
        doc.text('• “Beat producido por RGodbeat”');
        doc.text('• o “Prod. by RGodbeat”');
        doc.text('2. Regalías de publicación estándar:');
        doc.text('• 50% del compositor reservado para el Licenciante.');
        doc.moveDown();

        doc.font('Helvetica-Bold').text('V. CLÁUSULA DE NO GARANTÍA Y CONTACTO');
        doc.font('Helvetica').text('1. Licencia NO exclusiva.');
        doc.text('2. Para derechos ilimitados o exclusivos, debe contactarse directamente con RGodbeat.');
        doc.text('3. Si el Licenciatario supera los límites sin renovar, el Licenciante puede rescindir la licencia.');
        doc.moveDown();

        doc.font('Helvetica-Bold').text('ACEPTACIÓN DEL ACUERDO');
        doc.font('Helvetica').text('Al completar la compra y descargar el Beat, el Licenciatario acepta todos los términos de esta Licencia No Exclusiva.');
        doc.moveDown(2);

        doc.text('Rafael Gámez (RGodbeat)');
        doc.text('Licenciante');
        doc.moveDown(2);

        doc.text('Firma del Licenciatario:');
        // Add Signature Image
        const signatureBuffer = Buffer.from(signatureData.split(',')[1], 'base64');
        doc.image(signatureBuffer, { width: 150 });

        // -- PDF CONTENT END --
        doc.end();

        // Wait for PDF to finish writing
        writeStream.on('finish', async () => {
            // B. Save to DB
            const db = readDB();
            db.orders.push({
                id: Date.now(),
                name,
                email,
                beatName,
                price,
                date,
                contractPath
            });
            writeDB(db);

            // C. Send Email (Simulation)
            // In production, configure transporter with real credentials
            const transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email', // Placeholder
                port: 587,
                auth: {
                    user: 'ethereal.user@example.com',
                    pass: 'secret'
                }
            });

            // Mock email sending for now
            console.log(`[MOCK EMAIL] Sending contract to ${email}`);
            console.log(`[MOCK EMAIL] Attachment: ${contractPath}`);
            console.log(`[MOCK EMAIL] Download Link: (Simulated Link for ${beatName})`);

            res.json({ success: true, message: 'Contract generated and sent!' });
        });

    } catch (error) {
        console.error('Error generating contract:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
