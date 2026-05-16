document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    // Navbar & Parallax scroll effect
    const navbar = document.querySelector('.navbar');
    const heroBg = document.querySelector('.hero-bg-image');
    
    window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;

        // Navbar effect
        if (scrollY > 50) {
            navbar.style.background = 'rgba(0, 0, 0, 0.95)';
            navbar.style.padding = '0.5rem 0';
        } else {
            navbar.style.background = 'rgba(0, 0, 0, 0.8)';
            navbar.style.padding = '1rem 0';
        }

        // Parallax Background effect
        if (heroBg) {
            // Scale slightly as we scroll
            const scale = 1 + (scrollY * 0.0004);
            // Move slightly to create depth
            const translateY = scrollY * 0.1;
            heroBg.style.transform = `translate(-50%, calc(-50% + ${translateY}px)) scale(${scale})`;
            
            // Adjust opacity slightly as we scroll deeper
            const opacity = 0.35 - (scrollY * 0.0001);
            heroBg.style.opacity = Math.max(0.1, opacity);
        }
    });

    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 100);
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.section-title, .service-card, .beat-card, .contact-form, .plaza-content, .plaza-image').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease-out';
        observer.observe(el);
    });

    // --- DYNAMIC BEAT LOADING ---
    const beatGrid = document.querySelector('.beat-grid');
    let allBeats = []; // Store beats for filtering

    async function loadBeats() {
        try {
            // Use absolute URL to allow working when opening file directly (if CORS allows)
            const response = await fetch('/api/beats');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const beats = await response.json();
            allBeats = beats;
            renderBeats(beats);
        } catch (error) {
            console.warn('Server not reachable, loading fallback beats:', error);

            // FALLBACK DATA (For when server is not running)
            const fallbackBeats = [
                {
                    id: 'fb_1',
                    title: 'DM2025 94 Em',
                    genre: 'reggaeton',
                    bpm: '94 BPM',
                    key: 'Em',
                    price: 30,
                    cover: 'imagenes/RGCARBON.JPG',
                    audio: 'BEATS/reggaeton/dm2025_94_em.wav'
                },
                {
                    id: 'fb_2',
                    title: 'Chrisms WHATTT 160 G#m',
                    genre: 'reggaeton',
                    bpm: '160 BPM',
                    key: 'G#m',
                    price: 30,
                    cover: 'imagenes/RGCARBON.JPG',
                    audio: 'BEATS/reggaeton/chrisms_whattt_160_gsm.wav'
                },
                {
                    id: 'fb_3',
                    title: 'Gotshi 145 A#m',
                    genre: 'trap',
                    bpm: '145 BPM',
                    key: 'A#m',
                    price: 30,
                    cover: 'imagenes/RGCARBON.JPG',
                    audio: 'BEATS/trap/gotshi_145_asm.wav'
                }
            ];

            allBeats = fallbackBeats;
            renderBeats(fallbackBeats);

            // Show a small toast or message indicating offline mode
            const offlineMsg = document.createElement('div');
            offlineMsg.style.position = 'fixed';
            offlineMsg.style.bottom = '10px';
            offlineMsg.style.right = '10px';
            offlineMsg.style.background = 'rgba(255, 100, 0, 0.8)';
            offlineMsg.style.color = 'white';
            offlineMsg.style.padding = '10px';
            offlineMsg.style.borderRadius = '5px';
            offlineMsg.style.zIndex = '1000';
            offlineMsg.style.fontSize = '12px';
            offlineMsg.textContent = 'Demo Mode (Server Offline)';
            document.body.appendChild(offlineMsg);
            setTimeout(() => offlineMsg.remove(), 5000);
        }
    }

    function renderBeats(beatsToRender) {
        beatGrid.innerHTML = ''; // Clear existing

        if (beatsToRender.length === 0) {
            beatGrid.innerHTML = '<p style="color: white; text-align: center; width: 100%;">No beats found for this category.</p>';
            return;
        }

        beatsToRender.forEach(beat => {
            const card = document.createElement('div');
            card.className = 'beat-card';
            card.setAttribute('data-genre', beat.genre);

            // Create unique ID for audio element
            const audioId = `audio_${beat.id}`;

            card.innerHTML = `
                <div class="beat-cover">
                    <img src="${beat.cover}" alt="${beat.title} Cover" onerror="this.src='BEATS/imagen/empty.png'">
                    <div class="beat-overlay">
                        <button class="play-btn-large" data-audio="${audioId}">▶</button>
                    </div>
                </div>
                <div class="beat-info">
                    <h3>${beat.title}</h3>
                    <p>${beat.bpm} | ${beat.key}</p>
                    <div class="beat-price">$${beat.price}.00</div>
                    <button class="buy-btn" onclick="openCheckout('${beat.title.replace(/'/g, "\\'")}', ${beat.price})">BUY NOW</button>
                </div>
                <audio id="${audioId}" src="${beat.audio}" preload="none"></audio>
            `;

            beatGrid.appendChild(card);

            // Observe for animation
            observer.observe(card);
        });
    }

    // Call loadBeats on startup
    loadBeats();

    // --- AUDIO PLAYER LOGIC ---
    let currentAudio = null;
    let currentBtn = null;
    const bottomPlayer = document.getElementById('bottomPlayer');
    const playerCover = document.getElementById('playerCover');
    const playerTrackName = document.getElementById('playerTrackName');
    const playerPlayPauseBtn = document.getElementById('playerPlayPauseBtn');
    const progressBar = document.getElementById('progressBar');
    const timeCurrent = document.getElementById('timeCurrent');
    const timeTotal = document.getElementById('timeTotal');

    function formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function updateProgress() {
        if (!currentAudio) return;
        const progress = (currentAudio.currentTime / currentAudio.duration) * 100;
        progressBar.value = progress || 0;
        timeCurrent.textContent = formatTime(currentAudio.currentTime);
    }

    if (progressBar) {
        progressBar.addEventListener('input', (e) => {
            if (currentAudio) {
                const seekTime = (e.target.value / 100) * currentAudio.duration;
                currentAudio.currentTime = seekTime;
            }
        });
    }

    if (playerPlayPauseBtn) {
        playerPlayPauseBtn.addEventListener('click', () => {
            if (!currentAudio) return;
            if (currentAudio.paused) {
                currentAudio.play();
                playerPlayPauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
                if (currentBtn) currentBtn.textContent = '❚❚';
            } else {
                currentAudio.pause();
                playerPlayPauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                if (currentBtn) currentBtn.textContent = '▶';
            }
        });
    }

    beatGrid.addEventListener('click', (e) => {
        if (e.target.classList.contains('play-btn-large')) {
            const btn = e.target;
            const audioId = btn.getAttribute('data-audio');
            const audio = document.getElementById(audioId);
            const card = btn.closest('.beat-card');

            if (!audio) return;

            if (bottomPlayer) bottomPlayer.classList.add('active');

            if (currentAudio === audio) {
                if (audio.paused) {
                    audio.play();
                    btn.textContent = '❚❚';
                    if (playerPlayPauseBtn) playerPlayPauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
                } else {
                    audio.pause();
                    btn.textContent = '▶';
                    if (playerPlayPauseBtn) playerPlayPauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                }
            } else {
                if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                    currentAudio.removeEventListener('timeupdate', updateProgress);
                    if (currentBtn) currentBtn.textContent = '▶';
                }
                currentAudio = audio;
                currentBtn = btn;
                
                if (card && playerCover && playerTrackName) {
                    const coverImg = card.querySelector('.beat-cover img').src;
                    const trackName = card.querySelector('h3').textContent;
                    playerCover.src = coverImg;
                    playerTrackName.textContent = trackName;
                }
                
                audio.addEventListener('loadedmetadata', () => {
                    if (timeTotal) timeTotal.textContent = formatTime(audio.duration);
                });
                audio.addEventListener('timeupdate', updateProgress);
                audio.addEventListener('ended', () => {
                    btn.textContent = '▶';
                    if (playerPlayPauseBtn) playerPlayPauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
                    if (progressBar) progressBar.value = 0;
                    if (timeCurrent) timeCurrent.textContent = '0:00';
                });

                audio.play();
                btn.textContent = '❚❚';
                if (playerPlayPauseBtn) playerPlayPauseBtn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
            }
        }
    });

    // --- CHECKOUT MODAL LOGIC ---
    const modal = document.getElementById('checkoutModal');
    const closeModal = document.querySelector('.close-modal');
    const checkoutForm = document.getElementById('checkoutForm');

    // Open Modal Function (Global)
    window.openCheckout = (beatName, price) => {
        document.getElementById('checkout-beat-name').textContent = beatName;
        document.getElementById('beatName').value = beatName;
        document.getElementById('price').value = price;
        modal.style.display = 'flex';
    };

    // Close Modal
    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Payment Method Selection
    const paymentOptions = document.querySelectorAll('.payment-option');
    paymentOptions.forEach(option => {
        option.addEventListener('click', () => {
            paymentOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
        });
    });

    // --- TICKET VALIDATION ---
    let appliedTicket = null;

    window.validateTicket = async function () {
        const ticketCode = document.getElementById('ticketCode').value.trim();
        const beatName = document.getElementById('beatName').value;
        const feedbackDiv = document.getElementById('ticketFeedback');

        if (!ticketCode) {
            feedbackDiv.innerHTML = '<span style="color: #ff0044;">⚠️ Ingresa un código de ticket</span>';
            return;
        }

        feedbackDiv.innerHTML = '<span style="color: #cccccc;">⏳ Validando...</span>';

        try {
            const response = await fetch('/api/validate-ticket', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticketCode, beatName })
            });

            const result = await response.json();

            if (result.valid) {
                appliedTicket = {
                    code: ticketCode,
                    discount: result.discount
                };

                const originalPrice = parseInt(document.getElementById('price').value) || 30;
                const finalPrice = result.discount.finalPrice;

                // Update UI
                if (finalPrice === 0) {
                    feedbackDiv.innerHTML = `<span style="color: #00ff00;">✅ ${result.message} - ¡Beat GRATIS!</span>`;
                } else {
                    feedbackDiv.innerHTML = `<span style="color: #00ff00;">✅ ${result.message} - Precio final: $${finalPrice.toFixed(2)}</span>`;
                }

                // Update button text
                document.getElementById('finalPriceDisplay').textContent = finalPrice === 0 ? 'GRATIS' : `$${finalPrice.toFixed(2)}`;

            } else {
                appliedTicket = null;
                feedbackDiv.innerHTML = `<span style="color: #ff0044;">❌ ${result.message}</span>`;
                document.getElementById('finalPriceDisplay').textContent = '$30';
            }
        } catch (error) {
            console.error('Error validating ticket:', error);
            feedbackDiv.innerHTML = '<span style="color: #ff0044;">❌ Error de conexión con el servidor</span>';
        }
    };

    // Handle Checkout Submission
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
            name: document.getElementById('buyerName').value,
            email: document.getElementById('buyerEmail').value,
            country: document.getElementById('buyerCountry').value,
            beatName: document.getElementById('beatName').value,
            price: document.getElementById('price').value,
            ticketCode: appliedTicket ? appliedTicket.code : null
        };

        const btn = document.querySelector('.checkout-btn');
        const originalText = btn.textContent;
        btn.textContent = 'PROCESSING...';
        btn.disabled = true;

        try {
            const response = await fetch('/api/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                // Save order data to LocalStorage for the next step
                localStorage.setItem('pendingOrder', JSON.stringify(formData));

                // Redirect to signature page
                window.location.href = 'complete-license.html';
            } else {
                alert('Payment failed: ' + result.error);
                btn.textContent = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error('Error:', error);
            // Fallback for demo mode
            alert('Server connection failed. In DEMO mode, we will proceed to the next step anyway.');
            localStorage.setItem('pendingOrder', JSON.stringify(formData));
            window.location.href = 'complete-license.html';

            btn.textContent = originalText;
            btn.disabled = false;
        }
    });
});

// --- GENRE FILTER LOGIC ---
const filterButtons = document.querySelectorAll('.filter-btn');

// Note: beatCards variable is no longer static, we query dynamically or filter data

filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all buttons
        filterButtons.forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        btn.classList.add('active');

        const filterValue = btn.getAttribute('data-filter');
        const beatCards = document.querySelectorAll('.beat-card');

        beatCards.forEach(card => {
            const cardGenre = card.getAttribute('data-genre');

            if (filterValue === 'all' || cardGenre === filterValue) {
                card.classList.remove('hidden');
                // Small delay to allow display:block to apply before opacity transition
                setTimeout(() => {
                    card.style.opacity = '1';
                    card.style.transform = 'scale(1)';
                }, 10);
            } else {
                card.style.opacity = '0';
                card.style.transform = 'scale(0.8)';
                // Wait for transition to finish before hiding
                setTimeout(() => {
                    card.classList.add('hidden');
                }, 500);
            }
        });
    });
});

// --- YOUTUBE BACKGROUND MUSIC PLAYER ---

