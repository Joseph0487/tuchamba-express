            import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
            import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
            import { getDatabase, ref, set, get, onValue, remove, runTransaction, push } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
            import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

            const firebaseConfig = {
            apiKey: "AIzaSyB1k1lnQjQXiGYJRT9E9-KYzGSBBmrQGFI",
            authDomain: "vacancy-page-v2.firebaseapp.com",
            databaseURL: "https://vacancy-page-v2-default-rtdb.firebaseio.com",
            projectId: "vacancy-page-v2",
            storageBucket: "vacancy-page-v2.firebasestorage.app",
            messagingSenderId: "242419485392",
            appId: "1:242419485392:web:c486a767a1810ada876cd5"
            };

            // Función para cargar librerías externas bajo demanda
            async function loadExternalLibrary(url, libraryName) {
                if (window[libraryName] || (libraryName === 'XLSX' && window.XLSX)) return true;
                
                window.showToast(`📥 Cargando herramienta de ${libraryName}...`);
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = url;
                    script.onload = () => {
                        resolve(true);
                    };
                    script.onerror = () => reject(new Error(`Error al cargar ${libraryName}`));
                    document.head.appendChild(script);
                });
            }

            const app = initializeApp(firebaseConfig);

            // --- ACTIVACIÓN DE APP CHECK (MODO SEGURO) ---
            // NOTA: Si el sitio no carga vacantes, verifica en Firebase Console → App Check
            // que el dominio tuchamba-express.vercel.app esté en la lista de dominios permitidos
            // y que el enforcement esté activado SOLO después de registrar el dominio.
            let appCheck;
            try {
                appCheck = initializeAppCheck(app, {
                    provider: new ReCaptchaEnterpriseProvider('6LfZB4csAAAAAMKI99IZpkh7rWkJrYkAhI28cA0z'),
                    isTokenAutoRefreshEnabled: true
                });
            } catch (err) {
                console.warn("⚠️ App Check no pudo iniciar (datos aún accesibles si enforcement está desactivado):", err);
            }
            const auth = getAuth(app);
            const db = getDatabase(app);

            let isAdmin = false;
            let recruitersLoaded = false; // <--- NUEVA BANDERA DE CONTROL
            let isRecruiterMode = false; 
            let currentViewMode = 'grid'; 

            let currentUserEmail = ""; 
            let currentEditId = null;
            let jobs = {};
            let jobStats = {}; 
            let recruiters = {}; 
            let clickLogs = {};
            
            let activeRecruiter = null; 
            let centralPhone = ''; 
            let editingRecruiterId = null;

            // --- CHAT INTERNO ---
            let activeChatId = null;
            let chatUnsubscribe = null;
            let chatNotifUnsubscribe = null;
            let lastSeenMessageCount = JSON.parse(localStorage.getItem('lastSeenMsgs') || '{}');
            let notifSound = null;

            // ID único por pestaña/dispositivo — persiste en la misma pestaña
            const deviceSessionId = sessionStorage.getItem('deviceSessionId') || (() => {
                const id = Math.random().toString(36).substring(2, 10);
                sessionStorage.setItem('deviceSessionId', id);
                return id;
            })();

            // Inicializar sonido de notificación
            function initNotifSound() {
                try {
                    const ctx = new (window.AudioContext || window.webkitAudioContext)();
                    notifSound = () => {
                        const o = ctx.createOscillator();
                        const g = ctx.createGain();
                        o.connect(g); g.connect(ctx.destination);
                        o.frequency.setValueAtTime(880, ctx.currentTime);
                        o.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
                        g.gain.setValueAtTime(0.3, ctx.currentTime);
                        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
                        o.start(ctx.currentTime);
                        o.stop(ctx.currentTime + 0.4);
                    };
                } catch(e) {}
            } 

            let tempReqs = [];
            let tempBens = [];
            
            let currentPage = 1;
            const itemsPerPage = 15;
            let currentFilteredJobs = []; 

            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            
            // --- TAREA 13: LÓGICA DE REFERIDOS BLINDADA (V26.2) ---
            const urlParams = new URLSearchParams(window.location.search);
            // 1. Detectamos si la URL trae un referido hoy
            let refEnUrl = urlParams.get('ref');
            // 2. Si hay referido en URL, lo guardamos para que mande los WhatsApps a ese reclutador
            if (refEnUrl) {
            localStorage.setItem('recruiterCode', refEnUrl.toUpperCase());
            }
            // 3. El código "maestro" de la sesión es lo que está en memoria
            let refCode = localStorage.getItem('recruiterCode');
            // --- FASE 2: DETECCIÓN DE ORIGEN DE TRÁFICO ---
            function detectTrafficSource() {
                const ref = document.referrer;
                const params = new URLSearchParams(window.location.search);
                // 1. Si viene con parámetros UTM de Google Ads o campañas
                if (params.get('utm_source')) return params.get('utm_source').toLowerCase();
                // 2. Si el referrer es Google (búsqueda orgánica)
                if (ref.includes('google.com')) return 'google_organico';
                // 3. Redes sociales
                if (ref.includes('facebook.com') || ref.includes('fb.com')) return 'facebook';
                if (ref.includes('instagram.com')) return 'instagram';
                if (ref.includes('tiktok.com')) return 'tiktok';
                if (ref.includes('twitter.com') || ref.includes('t.co')) return 'twitter';
                if (ref.includes('linkedin.com')) return 'linkedin';
                // 4. WhatsApp (no deja referrer - llega como directo)
                if (ref === '' && params.has('ref')) return 'whatsapp_referido';
                // 5. Directo / sin fuente identificada
                if (ref === '') return 'directo';
                return 'otro';
            }
            const trafficSource = detectTrafficSource();

            function actualizarBotonLogin() {
                    const botonAdmin = document.querySelector('.admin-toggle-link');
                    if (!botonAdmin) return;

                    // LÓGICA DE VISIBILIDAD:
                    // Solo ocultamos el botón si la URL trae un ?ref=... 
                    // Si la URL está limpia (Original), el botón APARECE para que puedas loguearte.
                    if (urlParams.has('ref')) {
                        botonAdmin.style.display = 'none';
                    } else {
                        botonAdmin.style.display = 'block';
                    }
            }

            // Ejecutamos la revisión
            actualizarBotonLogin();
            document.addEventListener("DOMContentLoaded", actualizarBotonLogin);
            window.addEventListener('load', actualizarBotonLogin);

            // Ejecutamos la revisión en tres momentos clave para que nunca falle:
            actualizarBotonLogin(); // 1. En cuanto carga el script.
            document.addEventListener("DOMContentLoaded", actualizarBotonLogin); // 2. Cuando el diseño está listo.
            window.addEventListener('load', actualizarBotonLogin); // 3. Por si las dudas, al final de todo.

            // 2. Validamos y guardamos (o renovamos)
            if (refCode) {
                refCode = refCode.toUpperCase(); // Siempre mayúsculas
                localStorage.setItem('recruiterCode', refCode); // Usamos localStorage (Persistente)

                // 3. UX: Ocultar el botón de "Ingresa aquí" para no distraer al candidato referido
                document.addEventListener("DOMContentLoaded", () => {
                    const adminLink = document.querySelector('.admin-toggle-link');
                    if(adminLink) adminLink.style.display = 'none';
                });
            }

            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('searchInput').value = '';
                document.getElementById('stateFilter').value = '';
                document.getElementById('cityFilter').value = '';
            });

            window.addEventListener('pageshow', function(event) {
            if (event.persisted) {
                // Limpieza extra + recarga limpia
                document.getElementById('searchInput').value = '';
                document.getElementById('stateFilter').value = '';
                document.getElementById('cityFilter').value = '';
                window.location.reload();
            }
            });

            // === FORZAR RECARGA FRESCA CUANDO LA PÁGINA VIENE DE BFCACHE ===
            window.addEventListener('pageshow', function(event) {
                if (event.persisted) {
                    // Se restauró desde caché → recargamos limpia
                    window.location.reload();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === "Escape") {
                    if(document.getElementById('recruiterChatModal') && document.getElementById('recruiterChatModal').classList.contains('active')) { window.closeRecruiterChatModal(); return; }
                    else if(document.getElementById('chatsListModal') && document.getElementById('chatsListModal').classList.contains('active')) { window.closeChatsPanel(); return; }
                    else if(document.getElementById('chatModal') && document.getElementById('chatModal').classList.contains('active')) { window.closeChatModal(); return; }
                    else if(document.getElementById('viewModal').classList.contains('active')) closeViewModal();
                    else if(document.getElementById('formModal').classList.contains('active')) closeFormModal();
                    else if(document.getElementById('metricsModal').classList.contains('active')) closeMetricsModal();
                    else if(document.getElementById('teamModal').classList.contains('active')) closeTeamModal();
                    else if(document.getElementById('settingsModal').classList.contains('active')) closeSettingsModal();
                    else if(document.getElementById('privacyModal').classList.contains('active')) closePrivacyModal();
                    
                    document.querySelectorAll('.admin-actions').forEach(m => m.classList.remove('active'));
                }
            });

            // ----------------------------------------------------
            // 4. AUTENTICACIÓN BLINDADA (ROLES + RECLUTADORES) 🛡️
            // ----------------------------------------------------
            onAuthStateChanged(auth, (user) => {
                const urlJobId = urlParams.get('id'); 
                const isRecruiterSession = sessionStorage.getItem('isRecruiterSession') === 'true';

                if (user) {
                    const roleRef = ref(db, 'userRoles/' + user.uid);
                    onValue(roleRef, (snapshot) => {
                        const roleData = snapshot.val();
                        if (roleData && roleData.role === 'admin') {
                            isAdmin = true; 
                            currentUserEmail = user.email; 
                            setAdminMode(true); 
                            localStorage.setItem('iamsuperadmin', 'true');
                            if(!document.body.classList.contains('admin-active-flag')) {
                                window.showToast("✅ Modo Admin Activo");
                                document.body.classList.add('admin-active-flag');
                            }
                        } else {
                            signOut(auth); 
                            setAdminMode(false);
                        }
                    });
                } else {
                    isAdmin = false;
                    currentUserEmail = "";
                    localStorage.removeItem('iamsuperadmin');
                    document.body.classList.remove('admin-active-flag');

                    if (isRecruiterSession) return; 

                    // --- FIX INVITADO: ABRIR LA PUERTA ---
                    if (sessionStorage.getItem('isGuest') === 'true' || urlJobId) { 
                        document.getElementById('loginScreen').style.display = 'none'; 
                        document.getElementById('mainApp').style.display = 'block';
                        setAdminMode(false); 
                    } 
                    else { 
                        showLogin(); 
                    }
                }
            });     

            window.onclick = function(event) {
                if (event.target.classList.contains('modal')) {
                    event.target.classList.remove('active');
                }
                document.querySelectorAll('.admin-actions').forEach(m => m.classList.remove('active'));
            }

            window.openMetricsModal = function() {
                document.getElementById('metricsModal').classList.add('active');
                if (isRecruiterMode && activeRecruiter) {
                    // Leer clickLogs FRESCO de Firebase para asegurar datos actualizados
                    const modal = document.querySelector('#metricsModal .modal-content');
                    if (modal) modal.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">Cargando tus métricas...</p>';
                    get(ref(db, 'clickLogs')).then(snap => {
                        clickLogs = snap.val() || {};
                        renderRecruiterMetrics();
                    }).catch(() => renderRecruiterMetrics());
                } else {
                    setupMetricsTabs();
                    populateMetricsList();
                    renderTrafficChart();
                }
            }

            // Normalizador de texto (sin acentos, minúsculas)
            function normalizeRec(str) {
                return (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
            }

            // Obtener logs filtrados por reclutador activo
            function getMyLogs() {
                const allLogs = Object.values(clickLogs).filter(l => l && l.timestamp);
                if (!isRecruiterMode || !activeRecruiter) return allLogs;
                const myName = normalizeRec(activeRecruiter.name);
                const myCode = normalizeRec(activeRecruiter.code || '');
                return allLogs.filter(l => {
                    const logRec = normalizeRec(l.recruiter || '');
                    return logRec === myName || logRec === myCode;
                });
            }

            // --- PANEL DE MÉTRICAS PARA RECLUTADOR ---
            function renderRecruiterMetrics() {
                const modal = document.querySelector('#metricsModal .modal-content');
                if (!modal) return;

                // Obtener meses disponibles en sus logs (filtrados al momento de renderizar)
                const myLogs = getMyLogs();
                const months = [...new Set(myLogs.map(l => l.timestamp.substring(0,7)))].sort().reverse();
                if (months.length === 0) months.push(currentMonthKey);

                const selectedMonth = months[0]; // Por defecto el mes más reciente

                modal.innerHTML = `
                    <button class="close-btn" onclick="closeMetricsModal()">×</button>
                    <h2>📊 Mis Métricas</h2>
                    <p style="color:#666; font-size:13px; margin-bottom:12px;">
                        Hola <b>${activeRecruiter.name}</b> — aquí están tus resultados:
                    </p>

                    <!-- Selector de mes -->
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                        <label style="font-size:13px; font-weight:600; color:#333;">📅 Mes:</label>
                        <select id="recruiterMonthFilter" onchange="updateRecruiterMetrics()" style="padding:6px 12px; border-radius:8px; border:1px solid #ddd; font-size:13px;">
                            ${months.map(m => `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${m}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Tarjetas resumen -->
                    <div id="recruiterSummaryCards" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;"></div>

                    <!-- Tabla de vacantes -->
                    <div id="recruiterVacantesTable"></div>
                `;

                updateRecruiterMetrics();
            }

            window.updateRecruiterMetrics = function() {
                const month = document.getElementById('recruiterMonthFilter')?.value || currentMonthKey;
                const myLogs = getMyLogs().filter(l => l.timestamp.substring(0,7) === month);

                const totalClics = myLogs.length;

                // Agrupar por vacante
                const byJob = {};
                myLogs.forEach(l => {
                    if (!l.jobId) return;
                    if (!byJob[l.jobId]) byJob[l.jobId] = 0;
                    byJob[l.jobId]++;
                });

                // Top vacante
                let topJob = '—';
                let topCount = 0;
                Object.entries(byJob).forEach(([id, count]) => {
                    if (count > topCount) {
                        topCount = count;
                        topJob = jobs[id] ? jobs[id].title : id;
                    }
                });

                // Renderizar tarjetas
                const cards = document.getElementById('recruiterSummaryCards');
                if (cards) {
                    cards.innerHTML = `
                        <div style="flex:1; min-width:120px; background:#e8f5e9; border-radius:10px; padding:14px; text-align:center;">
                            <div style="font-size:28px; font-weight:800; color:#2e7d32;">${totalClics}</div>
                            <div style="font-size:12px; color:#555; margin-top:4px;">Clics este mes</div>
                        </div>
                        <div style="flex:2; min-width:180px; background:#e3f2fd; border-radius:10px; padding:14px; text-align:center;">
                            <div style="font-size:13px; font-weight:700; color:#1565c0;">🏆 Vacante más solicitada</div>
                            <div style="font-size:13px; color:#333; margin-top:6px;">${topJob}</div>
                            <div style="font-size:11px; color:#888;">${topCount > 0 ? topCount + ' clics' : 'Sin datos'}</div>
                        </div>
                    `;
                }

                // Renderizar tabla por vacante
                const table = document.getElementById('recruiterVacantesTable');
                if (table) {
                    const rows = Object.entries(byJob)
                        .sort(([,a],[,b]) => b - a)
                        .map(([id, count]) => {
                            const j = jobs[id] || {};
                            return `<tr>
                                <td style="padding:8px; border-bottom:1px solid #eee;">${j.title || id}</td>
                                <td style="padding:8px; border-bottom:1px solid #eee; color:#666;">${j.company || '—'}</td>
                                <td style="padding:8px; border-bottom:1px solid #eee; text-align:center; font-weight:700; color:#1a73e8;">${count}</td>
                            </tr>`;
                        }).join('');

                    table.innerHTML = rows.length > 0 ? `
                        <p style="font-size:13px; font-weight:600; color:#333; margin-bottom:8px;">📋 Clics por vacante:</p>
                        <table style="width:100%; border-collapse:collapse; font-size:13px;">
                            <thead>
                                <tr style="background:#f5f5f5;">
                                    <th style="padding:8px; text-align:left;">Vacante</th>
                                    <th style="padding:8px; text-align:left;">Empresa</th>
                                    <th style="padding:8px; text-align:center;">Clics</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    ` : '<p style="text-align:center; color:#aaa; padding:20px;">Sin actividad en este mes.</p>';
                }
            }
            
            // --- PANEL DE MÉTRICAS PRO: Orgánico vs Reclutadores ---
            function renderTrafficChart(filterMonth) {
                const container = document.getElementById('trafficChartContainer');
                if (!container) return;

                const allLogs = Object.values(clickLogs).filter(l => l && l.timestamp);
                const availableMonths = [...new Set(allLogs.map(l => l.timestamp.substring(0,7)))].sort().reverse();

                // Crear selector solo si no existe todavía
                if (!document.getElementById('adminMonthFilter')) {
                    const selectorHtml = `
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
                            <label style="font-size:13px; font-weight:600; color:#333;">📅 Mes:</label>
                            <select id="adminMonthFilter" onchange="renderTrafficChartData()" style="padding:6px 12px; border-radius:8px; border:1px solid #ddd; font-size:13px;">
                                <option value="">Todos los meses</option>
                                ${availableMonths.map(m => `<option value="${m}">${m}</option>`).join('')}
                            </select>
                            <span style="font-size:12px; color:#888;">${availableMonths.length} mes(es) con actividad</span>
                        </div>
                        <div id="trafficChartData"></div>
                    `;
                    container.innerHTML = selectorHtml;
                    // Seleccionar el mes más reciente por defecto
                    const sel = document.getElementById('adminMonthFilter');
                    if (sel && availableMonths.length > 0) sel.value = availableMonths[0];
                }

                // Aplicar filterMonth si se pasó explícitamente
                if (filterMonth !== undefined) {
                    const sel = document.getElementById('adminMonthFilter');
                    if (sel) sel.value = filterMonth;
                }

                renderTrafficChartData();
            }

            window.renderTrafficChartData = function() {
                const dataDiv = document.getElementById('trafficChartData');
                if (!dataDiv) return;

                const sel = document.getElementById('adminMonthFilter');
                const activeMonth = sel ? sel.value : '';

                const allLogs = Object.values(clickLogs).filter(l => l && l.timestamp);
                const logs = activeMonth ? allLogs.filter(l => l.timestamp.substring(0,7) === activeMonth) : allLogs;

                let organico = 0, reclutadores = 0, googleOrg = 0, facebook = 0, directo = 0, otro = 0;
                logs.forEach(l => {
                    const isRec = l.recruiter && l.recruiter !== 'Orgánico' && l.recruiter !== 'directo';
                    if (isRec) {
                        reclutadores++;
                    } else {
                        organico++;
                        const src = l.source || 'directo';
                        if (src === 'google_organico') googleOrg++;
                        else if (src === 'facebook') facebook++;
                        else if (src === 'directo' || src === 'whatsapp_referido') directo++;
                        else otro++;
                    }
                });

                const total = organico + reclutadores || 1;
                const pOrgPct = Math.round((organico / total) * 100);
                const pRecPct = 100 - pOrgPct;

                dataDiv.innerHTML = `
                    <div style="padding: 14px; background: #f8f9fa; border-radius: 12px; border: 1px solid #e0e0e0;">
                        <h3 style="margin: 0 0 12px; font-size: 15px; color: #333;">📊 Tráfico${activeMonth ? ' — ' + activeMonth : ' Total'}: ${organico + reclutadores} clics</h3>
                        <div style="display:flex; height: 28px; border-radius: 8px; overflow: hidden; margin-bottom: 8px;">
                            <div style="width: ${pOrgPct}%; background: #4CAF50; display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700;">
                                ${pOrgPct > 10 ? pOrgPct + '%' : ''}
                            </div>
                            <div style="width: ${pRecPct}%; background: #2196F3; display:flex; align-items:center; justify-content:center; color:white; font-size:12px; font-weight:700;">
                                ${pRecPct > 10 ? pRecPct + '%' : ''}
                            </div>
                        </div>
                        <div style="display:flex; gap: 16px; flex-wrap: wrap; margin-bottom: 14px;">
                            <span style="display:flex; align-items:center; gap:5px; font-size:13px;">
                                <span style="width:12px; height:12px; background:#4CAF50; border-radius:3px; display:inline-block;"></span>
                                🌿 Orgánico: <b>${organico}</b>
                            </span>
                            <span style="display:flex; align-items:center; gap:5px; font-size:13px;">
                                <span style="width:12px; height:12px; background:#2196F3; border-radius:3px; display:inline-block;"></span>
                                👥 Reclutadores: <b>${reclutadores}</b>
                            </span>
                        </div>
                        ${organico > 0 ? `
                        <div style="font-size: 12px; color: #666; border-top: 1px solid #e0e0e0; padding-top: 10px;">
                            <b>Desglose orgánico:</b>
                            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
                                ${googleOrg > 0 ? `<span>🔍 Google: <b>${googleOrg}</b></span>` : ''}
                                ${facebook > 0 ? `<span>📘 Facebook: <b>${facebook}</b></span>` : ''}
                                ${directo > 0 ? `<span>🔗 Directo/WhatsApp: <b>${directo}</b></span>` : ''}
                                ${otro > 0 ? `<span>🌐 Otro: <b>${otro}</b></span>` : ''}
                                ${googleOrg === 0 && facebook === 0 && directo === 0 && otro === 0 ? '<span style="color:#aaa;">Sin datos de fuente aún</span>' : ''}
                            </div>
                        </div>` : ''}
                    </div>
                `;
            }
            window.closeMetricsModal = function() {
                document.getElementById('metricsModal').classList.remove('active');
                // Limpiar el selector para que se reconstruya con datos frescos la próxima vez
                const container = document.getElementById('trafficChartContainer');
                if (container) container.innerHTML = '';
            }

            // Ocultar pestaña GA4 en modo reclutador
            function setupMetricsTabs() {
                const tabGA4 = document.getElementById('tabGA4');
                if (tabGA4) {
                    tabGA4.style.display = (isRecruiterMode) ? 'none' : 'inline-block';
                }
            }

            window.switchMetricsTab = function(tab) {
                const firebase = document.getElementById('panelFirebase');
                const ga4 = document.getElementById('panelGA4');
                const btnF = document.getElementById('tabFirebase');
                const btnG = document.getElementById('tabGA4');

                if (tab === 'firebase') {
                    firebase.style.display = 'block';
                    ga4.style.display = 'none';
                    btnF.style.background = '#1a73e8'; btnF.style.color = 'white';
                    btnG.style.background = '#eee'; btnG.style.color = '#555';
                } else {
                    firebase.style.display = 'none';
                    ga4.style.display = 'block';
                    btnF.style.background = '#eee'; btnF.style.color = '#555';
                    btnG.style.background = '#1a73e8'; btnG.style.color = 'white';
                    loadLookerStudio();
                }
            }

            function loadLookerStudio() {
                const container = document.getElementById('lookerContainer');
                if (!container) return;
                // Si ya cargó el iframe no lo volvemos a crear
                if (container.querySelector('iframe')) return;

                onValue(ref(db, 'settings/lookerUrl'), (s) => {
                    const url = s.val();
                    if (url) {
                        container.innerHTML = `<iframe src="${url}" width="100%" height="480" style="border:none; border-radius:10px;" allowfullscreen sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`;
                    }
                    // Si no hay URL, el placeholder ya se ve en el HTML
                }, { onlyOnce: true });
            }

            window.closeTeamModal = function() { document.getElementById('teamModal').classList.remove('active'); }

            window.saveWelcomeMessage = function() {
                const msg = document.getElementById('settingsWelcomeMsg')?.value.trim();
                if (!msg) return window.showToast("⚠️ Escribe el mensaje de bienvenida");
                set(ref(db, 'settings/welcomeMessage'), msg).then(() => {
                    window.showToast("✅ Mensaje de bienvenida guardado");
                });
            }

            window.openWelcomeConfig = function() {
                const myCode = activeRecruiter ? activeRecruiter.code : null;
                if (!myCode) return;
                get(ref(db, 'recruiters')).then(snap => {
                    const all = snap.val() || {};
                    const key = Object.keys(all).find(k => all[k].code === myCode);
                    if (!key) return;
                    const current = all[key].welcomeMessage || '';
                    const nuevo = prompt('✏️ Mensaje de bienvenida automático:\n(Se envía cuando el candidato abre el chat por primera vez)', current);
                    if (nuevo === null) return;
                    set(ref(db, `recruiters/${key}/welcomeMessage`), nuevo.trim()).then(() => {
                        window.showToast('✅ Mensaje de bienvenida guardado');
                    });
                });
            }

            window.openSettingsModal = function() {
                document.getElementById('settingsModal').classList.add('active');
                if(document.getElementById('settingsPhoneInput')) document.getElementById('settingsPhoneInput').value = centralPhone;
                onValue(ref(db, 'settings/welcomeMessage'), s => {
                    const el = document.getElementById('settingsWelcomeMsg');
                    if(el && s.val()) el.value = s.val();
                }, { onlyOnce: true });
                // Cargar config GitHub guardada
                onValue(ref(db, 'settings/githubRepo'), s => {
                    const el = document.getElementById('settingsGithubRepo');
                    if(el && s.val()) el.value = s.val();
                }, { onlyOnce: true });
                onValue(ref(db, 'settings/githubToken'), s => {
                    const el = document.getElementById('settingsGithubToken');
                    if(el && s.val()) el.placeholder = '🔒 Token guardado (escribe para cambiar)';
                }, { onlyOnce: true });
                onValue(ref(db, 'settings/lookerUrl'), s => {
                    const el = document.getElementById('settingsLookerUrl');
                    if(el && s.val()) el.placeholder = '🔒 URL guardada (escribe para cambiar)';
                }, { onlyOnce: true });
            }
            window.closeSettingsModal = function() { document.getElementById('settingsModal').classList.remove('active'); }

            window.saveLookerUrl = function() {
                const url = document.getElementById('settingsLookerUrl')?.value.trim();
                if (!url) return window.showToast("⚠️ Pega el link de Looker Studio");
                set(ref(db, 'settings/lookerUrl'), url).then(() => {
                    window.showToast("✅ Dashboard de Looker Studio guardado");
                    document.getElementById('settingsLookerUrl').value = '';
                    document.getElementById('settingsLookerUrl').placeholder = '🔒 URL guardada (escribe para cambiar)';
                });
            }

            window.saveGithubConfig = function() {
                const repo = document.getElementById('settingsGithubRepo')?.value.trim();
                const token = document.getElementById('settingsGithubToken')?.value.trim();
                if (!repo) return window.showToast("⚠️ Escribe el repo (usuario/nombre-repo)");
                const updates = [];
                updates.push(set(ref(db, 'settings/githubRepo'), repo));
                if (token) updates.push(set(ref(db, 'settings/githubToken'), token));
                Promise.all(updates).then(() => {
                    window.showToast("✅ Configuración GitHub guardada");
                    if(token) document.getElementById('settingsGithubToken').value = '';
                });
            }

            window.openPrivacyModal = function() { document.getElementById('privacyModal').classList.add('active'); }
            window.closePrivacyModal = function() { document.getElementById('privacyModal').classList.remove('active'); }

            // FUNCIÓN ZONA DE PELIGRO (COMPATIBLE SIN CAMBIAR IMPORTS) 🛠️
            window.performSafeAction = function(action) {
                // 1. Solo validamos isAdmin (quitamos el email para que no falle)
                if (!isAdmin) {
                    alert("⛔ Acceso denegado. No tienes permisos de Administrador.");
                    return;
                }

                if(confirm("⚠️ ¿ESTÁS REALMENTE SEGURO?\n\nEsta acción borrará los datos permanentemente.")) {
                    
                    // CASO A: RESETEAR MÉTRICAS
                    if (action === 'resetMetrics') {
                        // Como NO importamos 'update', usamos 'remove' 3 veces al mismo tiempo.
                        // Esto funciona con lo que ya tienes arriba.
                        Promise.all([
                            remove(ref(db, 'siteStats')),
                            remove(ref(db, 'jobStats')),
                            remove(ref(db, 'clickLogs'))
                        ]).then(() => {
                            window.showToast("✅ Métricas reseteadas a 0");
                            // Ponemos visualmente en cero
                            if(document.getElementById('totalVisits')) document.getElementById('totalVisits').innerText = "0";
                            if(document.getElementById('monthlyVisits')) document.getElementById('monthlyVisits').innerText = "0";
                        }).catch(error => {
                            console.error(error);
                            alert("❌ Error al borrar: " + error.message);
                        });
                    }

                    // CASO B: BORRAR VACANTES
                    if (action === 'deleteJobs') {
                        remove(ref(db, 'jobs'))
                            .then(() => {
                                window.showToast("🔥 Todas las vacantes eliminadas");
                                jobs = {};
                                renderJobs();
                            })
                            .catch(error => {
                                alert("❌ Error: " + error.message);
                            });
                    }
                }
            }

            window.showToast = function(message) {
                const x = document.getElementById("toast");
                if(x) {
                    x.textContent = message;
                    x.className = "show";
                    setTimeout(function(){ x.className = x.className.replace("show", ""); }, 3000);
                }
            }

            function deleteAllJobs() {
                remove(ref(db, 'jobs')).then(() => {
                    window.showToast("🔥 Todas las vacantes eliminadas");
                    autoSyncSitemap(); // Actualiza sitemap en GitHub automáticamente
                });
            }

            window.toggleMobileFilters = function() {
                const container = document.getElementById('filterContainer');
                container.classList.toggle('active');
            }

            window.toggleAdminLogin = function() { 
                const f = document.getElementById('adminForm'); 
                f.style.display = (f.style.display==='none'||f.style.display==='') ? 'block' : 'none'; 
            }
            
            // --- FUNCIÓN DEL OJITO (VERSIÓN IMÁGENES PNG) ---
            window.togglePasswordVisibility = function() {
                const input = document.getElementById('adminPassword');
                const imagen = document.getElementById('ojoIcono'); // Buscamos la imagen

                if (input.type === "password") {
                    input.type = "text"; // Muestra la contraseña
                    imagen.src = "ocultar.png"; // Cambia a la foto del ojo tachado
                } else {
                    input.type = "password"; // Oculta la contraseña
                    imagen.src = "ver.png"; // Cambia a la foto del ojo normal
                }
            }

            window.login = async function() {
                const emailField = document.getElementById('adminEmail');
                const passField = document.getElementById('adminPassword');
                const btn = document.getElementById('btnLogin');
                
                let inputVal = emailField.value.trim();
                const passVal = passField.value.trim();

                if (!inputVal || !passVal) return alert("Por favor llena todos los campos");

                // Evitamos doble clic
                if (btn.innerText.includes('Verificando')) return; 

                const originalText = btn.innerHTML;
                btn.innerHTML = "🔄 Verificando...";
                btn.disabled = true;

                try {
                    // --- CAMINO 1: LOGIN ADMIN (Correo) ---
                    if (inputVal.includes('@')) {
                        await setPersistence(auth, browserSessionPersistence); 
                        await signInWithEmailAndPassword(auth, inputVal, passVal); 
                        sessionStorage.removeItem('isGuest'); 
                        localStorage.setItem('iamsuperadmin', 'true'); 
                        isRecruiterMode = false;
                        return; // Firebase se encarga del resto
                    } 

                    // --- CAMINO 2: LOGIN RECLUTADOR (Código) ---
                    // 1. Semáforo: ¿Ya bajaron los datos?
                        if (!recruitersLoaded) {
                            throw new Error("⏳ Los datos siguen cargando. Espera 5 segundos e intenta de nuevo.");
                        }

                        inputVal = inputVal.replace(/\s/g, '').toUpperCase(); // Limpiar espacios del código

                        // 2. Buscamos primero al reclutador por su código
                        const foundRec = Object.values(recruiters).find(r => r.code === inputVal);

                        if (foundRec) {
                            // 3. Definimos la contraseña esperada para este usuario específico
                            const expectedPass = `Express*${foundRec.code}`; 
                            if (passVal !== expectedPass) {
                            throw new Error("❌ Contraseña incorrecta para este código.");
                            }

                        // ÉXITO: Configuramos la sesión
                        sessionStorage.removeItem('isGuest');
                        sessionStorage.setItem('recruiterCode', foundRec.code.toLowerCase());
                        localStorage.setItem('recruiterCode', foundRec.code.toLowerCase());
                        sessionStorage.setItem('isRecruiterSession', 'true'); 
    
                        // Recarga limpia
                        window.location.reload(); 
                        } else {
                        // El código no existe en la base de datos
                        throw new Error(`❌ El código '${inputVal}' no existe.`);
                    }   

                } catch (error) {
                    // SI ALGO FALLA, DESBLOQUEAMOS EL BOTÓN
                    console.error(error);
                    btn.innerHTML = originalText; 
                    btn.disabled = false;
                    
                    // Si el error es de carga, forzamos la carga de nuevo
                    if (error.message.includes('datos siguen cargando')) {
                        initRecruitersData(); 
                    }
                    
                    alert(error.message);
                }
            }
            
        window.enterAsGuest = function() { 
            sessionStorage.setItem('isGuest', 'true'); 
            isAdmin = false; 
            isRecruiterMode = false;
    
            const searchInput = document.getElementById('searchInput');
            if(searchInput) searchInput.value = '';
    
            // --- CAMBIO VISUAL INMEDIATO ---
            document.getElementById('loginScreen').style.display = 'none'; 
            document.getElementById('mainApp').style.display = 'block';
    
            loadData(); 
            if(typeof actualizarBotonLogin === 'function') actualizarBotonLogin();
            window.showToast("🔍 Entrando como invitado...");
        }   

        // FUNCIÓN SALIR INTELIGENTE (V25.0 - SOLO PRESERVA REF SI ESTABA EN LA URL ORIGINAL)
        window.logout = function() {
            if (!confirm("¿Salir de la aplicación?")) return;

            // 1. SOLO tomamos el ?ref= que realmente traía la URL al entrar
            //    (Admin y Reclutador entran sin ?ref= → siempre salen al link limpio)
            const urlParams = new URLSearchParams(window.location.search);
            const savedRef = urlParams.get('ref');

            // 2. Feedback visual
            document.body.style.opacity = "0.5";
            document.body.style.pointerEvents = "none";

            // 3. LIMPIEZA TOTAL
            localStorage.removeItem('iamsuperadmin');
            localStorage.removeItem('isGuest');
            localStorage.clear();
            sessionStorage.clear();

            // 4. DESTINO
            let targetUrl = window.location.origin;
            if (savedRef) {
                targetUrl += `/?ref=${savedRef}`;
            }

            // 5. SALIDA SEGURA
            try {
             if (typeof auth !== 'undefined' && auth && auth.currentUser) {
                    signOut(auth)
                        .then(() => { window.location.href = targetUrl; })
                        .catch(() => { window.location.href = targetUrl; });
                } else {
                    window.location.href = targetUrl;
                }
            } catch (e) {
                console.error("Forzando salida:", e);
                window.location.href = targetUrl;
            }
        };

            function showLogin() { 
                document.getElementById('loginScreen').style.display = 'block'; 
                document.getElementById('mainApp').style.display = 'none'; 
                document.getElementById('adminForm').style.display = 'none'; 
                
                // --- CORRECCIÓN: Reseteamos el botón por si se quedó trabado ---
                const btn = document.getElementById('btnLogin');
                if(btn) { 
                    btn.innerHTML = 'Entrar al Panel'; 
                    btn.disabled = false; 
                }
            }
            function setAdminMode(enableAdmin) {
    
                // Inyectar el template del flyer solo si es Admin o Reclutador
                if (enableAdmin && !document.getElementById('flyerTemplate')) {
                    const flyerHtml = `
                    <div id="flyerTemplate">
                        <div style="position: absolute; top:0; left:0; width: 100%; height: 100%; background: url('https://images.unsplash.com/photo-1542744173-8e7e53415bb0?ixlib=rb-1.2.1&auto=format&fit=crop&w=1080&q=60') center center / cover no-repeat; opacity: 0.1; z-index: 0;"></div>
                        <div style="position: absolute; top:0; left:0; width: 100%; height: 100%; background: rgba(10, 25, 45, 0.05); z-index: 1;"></div>
                        <div class="flyer-badge-top">¡SE SOLICITA!</div>
                        <div class="flyer-company">RECONOCIDA EMPRESA BUSCA:</div>
                        <div id="flyerTitle" class="flyer-title">PUESTO VACANTE</div>
                        <div id="flyerSalary" class="flyer-salary" style="margin-bottom: 5px;">$0,000</div>
                        <div id="flyerLocation" style="font-size: 50px; color: #FFFFFF !important; font-family: sans-serif; font-weight: 800; margin-top: 5px; margin-bottom: 40px; text-transform: uppercase; text-shadow: 0 4px 10px rgba(0,0,0,1); z-index: 10; position: relative; display: block;">
                            📍 UBICACIÓN PENDIENTE
                        </div>
                        <div class="flyer-benefits-container">
                            <div class="flyer-benefits-title">OFRECEMOS:</div>
                            <ul id="flyerBenefitsList" class="flyer-benefits-list">
                                <li>✅ Prestaciones de Ley</li>
                            </ul>
                        </div>
                        <div class="flyer-cta-box">
                            🔗 DALE CLIC AL LINK DE LA PUBLICACIÓN PARA CONOCER DETALLES Y AGENDAR ENTREVISTA
                            <div id="flyerQr"></div>
                        </div>
                    </div>`;
                    document.body.insertAdjacentHTML('afterbegin', flyerHtml);
                }

                // --- el resto de la función sigue igual desde aquí ---
                document.getElementById('loginScreen').style.display = 'none';

                document.getElementById('loginScreen').style.display = 'none'; document.getElementById('mainApp').style.display = 'block';
                
                const isRefMode = !!refCode;
                
                // Limpieza de clases (Reset)
                document.body.classList.remove('admin-mode', 'recruiter-view');

                if (enableAdmin && (!isRefMode || isRecruiterMode)) {
                    document.body.classList.add('admin-mode');

                    // Ocultar subtítulo en modo admin/reclutador
                    setTimeout(() => {
                        const headerSubtitle = document.getElementById('headerSubtitle');
                        if (headerSubtitle) headerSubtitle.style.display = 'none';
                    }, 100);

                    if (isRecruiterMode) {
                        // ACTIVAMOS LA VISTA RECLUTADOR
                        document.body.classList.add('recruiter-view');
                        
                        // --- VERSIÓN SEGURA A PRUEBA DE FALLOS ---
                        // Usamos concatenación simple (+) para evitar errores de sintaxis
                        var link = window.location.origin + "/?ref=" + (refCode || '');
                        
                        // Creamos el botón con HTML simple
                        var botonHtml = '<button class="copy-link-btn" onclick="copyRecruiterLink(\'' + link + '\')" title="Copiar mi link">🔗 Copiar Link</button>';
                        
                        // Inyectamos el botón en el encabezado
                        var indicator = document.getElementById('modeIndicator');
                        if (indicator) {
                            indicator.innerHTML = botonHtml;
                        }
                        
                        // Ocultamos el botón de cambiar vista
                        var toggleBtn = document.getElementById('viewToggleBtn');
                        if (toggleBtn) {
                            toggleBtn.style.display = 'none';
                        }

                        // Mostramos el botón de chats al reclutador
                        var btnChats = document.getElementById('btnChatsPanel');
                        if (btnChats) btnChats.style.display = 'inline-flex';

                        // Arrancar notificaciones al primer clic del usuario
                        const arrancarNotifs = () => {
                            initNotifSound();
                            document.removeEventListener('click', arrancarNotifs);
                        };
                        document.addEventListener('click', arrancarNotifs);
                        startChatNotifications(activeRecruiter ? activeRecruiter.code : refCode);
                    
                    } else {
                        document.getElementById('modeIndicator').innerHTML = '<span class="admin-mode-indicator">Super Admin</span>';
                        document.getElementById('viewToggleBtn').style.display = 'inline-flex'; 
                    }
                    document.getElementById('adminControls').style.display = 'block';
                } else {
                    document.getElementById('modeIndicator').innerHTML = '';
                    document.getElementById('adminControls').style.display = 'none';
                    document.getElementById('viewToggleBtn').style.display = 'none';
                }
                loadData();
            }

            window.toggleViewMode = function(forceMode) {
                if (forceMode) {
                    currentViewMode = forceMode;
                } else {
                    currentViewMode = currentViewMode === 'grid' ? 'table' : 'grid';
                }

                const grid = document.getElementById('jobGrid');
                const table = document.getElementById('jobTableContainer');
                const btn = document.getElementById('viewToggleBtn');
                
                // --- CAMBIO IMPORTANTE: YA NO TOCAMOS LA BARRA DE BÚSQUEDA AQUÍ ---
                // const searchBar = document.getElementById('userStickyTools'); 

                if (currentViewMode === 'table') {
                    // MODO GESTIÓN (Tabla)
                    grid.style.display = 'none';
                    table.style.display = 'block';
                    
                    // searchBar.style.display = 'none';  <--- ESTA LÍNEA LA BORRAMOS O COMENTAMOS
                    
                    if(btn) btn.innerHTML = '🖼️ Vista Usuario'; // Icono de imagen para volver a las fichas
                    renderJobsTable();
                } else {
                    // MODO USUARIO (Fichas)
                    grid.style.display = 'grid';
                    table.style.display = 'none';
                    
                    // searchBar.style.display = 'block'; <--- ESTA TAMBIÉN LA BORRAMOS O COMENTAMOS

                    if(btn) btn.innerHTML = '👁️ Vista Gestión'; // Ojo para ir a tabla
                    filterJobs(); 
                }
            }

            function parseJobDate(dateString) {
                if (!dateString) return 0;
                let jobDate;
                if (dateString.includes('/')) { 
                    const parts = dateString.split('/');
                    if (parts.length === 3) jobDate = new Date(parts[2], parts[1] - 1, parts[0]);
                } else if (dateString.includes('-')) { 
                    const parts = dateString.split('-');
                    if (parts.length === 3) jobDate = new Date(parts[0], parts[1] - 1, parts[2]);
                }
                return jobDate && !isNaN(jobDate.getTime()) ? jobDate.getTime() : 0;
            }

            // 1. FUNCIÓN GLOBAL: Carga reclutadores INDEPENDIENTEMENTE del login
            function initRecruitersData() {
                onValue(ref(db, 'recruiters'), (s) => { 
                    recruiters = s.val() || {}; 
                    recruitersLoaded = true; // ¡SEMÁFORO EN VERDE!

                    // AUTO-LOGIN: Si recargaste el celular, aquí te recuperamos
                    // IMPORTANTE: Esto corre AUTOMÁTICAMENTE al abrir la página
                    if(sessionStorage.getItem('isRecruiterSession') === 'true' && !isAdmin) {
                        const savedCode = sessionStorage.getItem('recruiterCode');
                        if (savedCode) {
                            const foundRec = Object.values(recruiters).find(r => r.code.toLowerCase() === savedCode);
                            if(foundRec) {
                                isAdmin = true; 
                                isRecruiterMode = true; 
                                activeRecruiter = foundRec;
                                setAdminMode(true);
                                if(typeof toggleViewMode === 'function') toggleViewMode('table'); 
                                window.showToast(`👋 Sesión restaurada: ${foundRec.name}`);
                            }
                        }
                    }
                    
                    checkActiveRecruiter(); 
                    if(isAdmin) renderRecruitersTable(); 
                });
            }

            // ¡EJECUTAR YA! (Esta línea es vital)
            initRecruitersData();

            // Ejecutamos esto INMEDIATAMENTE al arrancar
            initRecruitersData();


        // FUNCIÓN CARGA DE DATOS (OPTIMIZADA V23.1 + FIX SCROLL) ⚡
        function loadData() {
            // 1. PRIORIDAD TOTAL: Cargar Vacantes primero
            // Timeout de seguridad: si en 8s no llegan datos, ocultamos skeleton y mostramos error
            const skeletonTimeout = setTimeout(() => {
                const skel = document.getElementById('skeletonLoader');
                if (skel && skel.style.display !== 'none') {
                    skel.style.display = 'none';
                    const grid = document.getElementById('jobGrid');
                    if (grid) {
                        grid.style.display = 'grid';
                        grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px;grid-column:1/-1">⚠️ No se pudieron cargar las vacantes. Verifica tu conexión e intenta de nuevo.</p>';
                    }
                    console.warn("⏱️ Timeout: Firebase no respondió. Posible bloqueo de App Check o red.");
                }
            }, 8000);

            onValue(ref(db, 'jobs'), (s) => { 
                clearTimeout(skeletonTimeout);
                jobs = s.val() || {}; 
                
                // Matamos el esqueleto de carga DE INMEDIATO
                const skel = document.getElementById('skeletonLoader');
                if(skel) skel.style.display = 'none'; 
                
                window.scrollTo(0, 0);

                if (isRecruiterMode) {
                    toggleViewMode('table');
                } else {
                    document.getElementById('jobGrid').style.display = 'grid';
                    document.getElementById('jobTableContainer').style.display = 'none';
                }

                populateFilters(jobs); 
                if (currentViewMode === 'grid') renderJobs(); 
                else renderJobsTable();
                
                checkUrlForJob(); // Revisar si hay ?id=...
                }, (error) => {
                    // ERROR HANDLER: captura errores de permisos o App Check
                    clearTimeout(skeletonTimeout);
                    const skel = document.getElementById('skeletonLoader');
                    if(skel) skel.style.display = 'none';
                    const grid = document.getElementById('jobGrid');
                    if (grid) {
                        grid.style.display = 'grid';
                        grid.innerHTML = '<p style="text-align:center;color:#888;padding:40px;grid-column:1/-1">⚠️ Error al cargar vacantes. Intenta recargar la página.</p>';
                    }
                    console.error("🔥 Firebase onValue error:", error.code, error.message);
                }); // onValue con manejo de error

                // 2. Las estadísticas las cargamos por separado para que no estorben al renderizado
                onValue(ref(db, 'jobStats'), (s) => { jobStats = s.val() || {}; });
                onValue(ref(db, 'clickLogs'), (s) => { clickLogs = s.val() || {}; });
                onValue(ref(db, 'settings/centralPhone'), (s) => { 
                centralPhone = s.val() || '';
                updateBanner();

            });

            // ... (el resto de la función loadData que sigue abajo con los setTimeout se queda igual) ...

                // 2. SEGUNDO PLANO: Cargar estadísticas y configuración (Sin bloquear la pantalla)
                // Esto corre "por detrás" mientras el usuario ya está viendo vacantes
                setTimeout(() => {
                    onValue(ref(db, 'jobStats'), (s) => { jobStats = s.val() || {}; });
                    onValue(ref(db, 'clickLogs'), (s) => { clickLogs = s.val() || {}; });
                    
                    onValue(ref(db, 'settings/centralPhone'), (s) => { 
                        centralPhone = s.val() || '';
                        if(document.getElementById('settingsPhoneInput')) document.getElementById('settingsPhoneInput').value = centralPhone;
                        updateBanner();
                    });
                }, 500); // Pequeño retraso intencional para liberar la red
            }
            
            // Función auxiliar para limpiar el loadData principal
        function checkUrlForJob() {
                const urlJobId = urlParams.get('id');
                if (urlJobId && jobs[urlJobId]) {
                    const job = jobs[urlJobId];
                    if (job.status !== 'No Vigente' || isAdmin) {
                        document.getElementById('loginScreen').style.display = 'none';
                        document.getElementById('mainApp').style.display = 'block';
                        if(!isAdmin) sessionStorage.setItem('isGuest', 'true');
                        window.openViewModal(urlJobId);
                    }
                }
            }

            function populateFilters(jobsData) {
                const allJobsArr = Object.values(jobsData);
                const stateSelect = document.getElementById('stateFilter');

                const uniqueStates = [...new Set(allJobsArr.map(j => j.state).filter(Boolean))].sort();
                
                const currState = stateSelect.value;

                let stateHtml = '<option value="">📍 Estado</option>';
                uniqueStates.forEach(s => {
                    stateHtml += `<option value="${s}">${s}</option>`;
                });
                stateSelect.innerHTML = stateHtml;
                stateSelect.value = currState;

                updateCityOptions();
            }

            window.updateCityOptions = function() {
                const stateSelect = document.getElementById('stateFilter');
                const citySelect = document.getElementById('cityFilter');
                const selectedState = stateSelect.value;

                const allJobsArr = Object.values(jobs);

                let availableCities = new Set();
                allJobsArr.forEach(j => {
                    if (!selectedState || j.state === selectedState) {
                        if (j.city) availableCities.add(j.city);
                    }
                });

                const sortedCities = [...availableCities].sort();

                citySelect.innerHTML = '<option value="">🏙️ Municipio</option>';
                sortedCities.forEach(c => {
                    citySelect.innerHTML += `<option value="${c}">${c}</option>`;
                });
                
                citySelect.value = "";
            }

            window.handleStateChange = function() {
                updateCityOptions(); 
                filterJobs();        
            }

            function checkActiveRecruiter() {
                // CORRECCIÓN V25.10: Usar localStorage (Persistente)
                const savedCode = localStorage.getItem('recruiterCode');
                
                activeRecruiter = null; 
                if (savedCode && recruiters) {
                    const foundKey = Object.keys(recruiters).find(key => 
                        recruiters[key].code.toLowerCase() === savedCode.toLowerCase()
                    );
                    if (foundKey) { 
                        activeRecruiter = recruiters[foundKey]; 
                    }
                }
                updateBanner();
            }

            function updateBanner() {
                const bannerName = document.getElementById('recruiterNameDisplay');
                if(activeRecruiter) {
                    bannerName.textContent = activeRecruiter.name;
                } else {
                    bannerName.textContent = "Oficina Central";
                }
            }

            window.contactCentralOffice = function() {
                let phoneToContact = '';
                if(activeRecruiter) {
                    phoneToContact = activeRecruiter.phone;
                } else {
                    phoneToContact = centralPhone;
                }

                if(phoneToContact) {
                    const cleanPhone = phoneToContact.replace(/\D/g, '');
                    window.open(`https://wa.me/${cleanPhone}?text=Hola,%20necesito%20ayuda%20general`, '_blank');
                } else {
                    alert("No hay un número de contacto general configurado.");
                }
            }

            window.saveCentralConfig = function() {
                const val = document.getElementById('settingsPhoneInput').value.trim();
                const btn = document.getElementById('btnSaveCentral');
                const originalText = btn.textContent;
                
                btn.textContent = "Guardando...";
                set(ref(db, 'settings/centralPhone'), val)
                    .then(() => {
                        window.showToast('✅ Teléfono de Oficina Central actualizado.');
                        btn.style.backgroundColor = '#2ecc71'; 
                        btn.textContent = '✅ ¡Guardado!';
                        setTimeout(() => { btn.style.backgroundColor = '#0a66c2'; btn.textContent = originalText; }, 2000);
                    })
                    .catch((error) => {
                        window.showToast('❌ Error al guardar: ' + error.message);
                        btn.style.backgroundColor = '#e74c3c'; btn.textContent = 'Error';
                        setTimeout(() => { btn.style.backgroundColor = '#0a66c2'; btn.textContent = originalText; }, 2000);
                    });
            }

            window.closeTeamModal = function() { document.getElementById('teamModal').classList.remove('active'); }

            window.editRecruiter = function(id) {
                const r = recruiters[id]; if(!r) return;
                document.getElementById('recName').value = r.name; 
                
                let phoneVal = r.phone;
                if(phoneVal.startsWith('+52')) { document.getElementById('recPhoneCode').value = '+52'; phoneVal = phoneVal.replace('+52',''); }
                else if(phoneVal.startsWith('+1')) { document.getElementById('recPhoneCode').value = '+1'; phoneVal = phoneVal.replace('+1',''); }
                document.getElementById('recPhone').value = phoneVal; 

                document.getElementById('recCode').value = r.code;
                editingRecruiterId = id; const btn = document.getElementById('btnSaveRecruiter'); btn.textContent = "Guardar Cambios"; btn.style.backgroundColor = "#f57c00"; 
                document.getElementById('btnCancelRecruiter').style.display = 'block';
            }

            window.resetRecruiterForm = function() {
                document.getElementById('recName').value = ''; document.getElementById('recPhone').value = ''; document.getElementById('recCode').value = ''; editingRecruiterId = null;
                const btn = document.getElementById('btnSaveRecruiter'); btn.textContent = "Agregar"; btn.style.backgroundColor = "#0a66c2"; 
                document.getElementById('btnCancelRecruiter').style.display = 'none';
            }

            window.deleteRecruiter = function(id) { if(confirm('¿Seguro que quieres eliminar a este reclutador?')) { remove(ref(db, 'recruiters/' + id)); if(editingRecruiterId === id) resetRecruiterForm(); } }
            
            window.copyLink = function(code) { 
                const link = `${window.location.origin}/?ref=${code}`; 
                navigator.clipboard.writeText(link).then(() => window.showToast('Link copiado')); 
            }

            window.copyJobLink = function(jobId) {
                // Revisamos quién es el reclutador dueño de esta sesión
                const savedRef = activeRecruiter ? activeRecruiter.code : localStorage.getItem('recruiterCode');
                // Armamos la URL pegando el ID de la vacante y el código de referido si existe
                const urlParaCompartir = `${window.location.origin}/?id=${jobId}${savedRef ? '&ref=' + savedRef.toLowerCase() : ''}`;
                // Lo mandamos al portapapeles
                navigator.clipboard.writeText(urlParaCompartir).then(() => {
                    window.showToast('🔗 Link con referido copiado al portapapeles');
                }).catch(err => {
                    console.error("Error al copiar:", err);
                });
            }

            function populateMetricsList() {
                const list = document.getElementById('metricsMonthList');
                if(!jobStats) { list.innerHTML = 'No hay datos'; return; }
                
                const months = new Set();
                Object.values(clickLogs).forEach(log => {
                    if(log && log.timestamp && typeof log.timestamp === 'string') {
                        try { months.add(log.timestamp.substring(0, 7)); } catch(e){}
                    }
                });
                Object.values(jobStats).forEach(stat => {
                    if(stat && stat.monthlyViews) {
                        Object.keys(stat.monthlyViews).forEach(m => months.add(m));
                    }
                });

                if(months.size === 0) months.add(currentMonthKey);

                const sortedMonths = Array.from(months).sort().reverse();
                
                list.innerHTML = sortedMonths.map(m => 
                    `<label style="display:block; padding:5px; border-bottom:1px solid #eee;">
                        <input type="checkbox" value="${m}" checked> ${m}
                    </label>`
                ).join('');
            }

            window.downloadSelectedMetrics = async function() {
                const checkboxes = document.querySelectorAll('#metricsMonthList input:checked');
                const selectedMonths = Array.from(checkboxes).map(cb => cb.value);
                
                if(selectedMonths.length === 0) return alert("Selecciona al menos un mes");

                try {
                    // Carga de la librería de Excel solo cuando se necesita
                    await loadExternalLibrary("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js", "XLSX");
                    window.showToast("📊 Generando Reporte Maestro V25.7...");

                    // Función interna para nombres de mes legibles
                    const getMonthName = (monthKey) => {
                        const [year, month] = monthKey.split('-');
                        const date = new Date(year, month - 1);
                        return date.toLocaleString('es-MX', { month: 'short', year: 'numeric' }).toUpperCase();
                    };

                    const dataRows = [];
                    const recruiterRows = [];
                    const detailRows = [];
                    const clickEventRows = [];

                    // 1. PROCESAMIENTO CONGLOMERADO (Dato en Bruto por Mes)
                    selectedMonths.sort().forEach(m => {
                        const monthLabel = getMonthName(m);

                        // Hoja: Desempeño Vacantes
                        Object.keys(jobs).forEach(jobId => {
                            const j = jobs[jobId];
                            const s = jobStats[jobId] || {};
                            const views = (s.monthlyViews && s.monthlyViews[m]) ? s.monthlyViews[m] : 0;
                            const clicks = Object.values(clickLogs).filter(l => 
                                l && l.jobId === jobId && 
                                l.timestamp && typeof l.timestamp === 'string' &&
                                l.timestamp.substring(0,7) === m
                            ).length;

                            if(views > 0 || clicks > 0) {
                                dataRows.push({
                                    'MES': monthLabel,
                                    'ID': jobId,
                                    'Título': j.title,
                                    'Empresa': j.company,
                                    'Vistas': views,
                                    'Clics WhatsApp': clicks,
                                    'Estatus': j.status
                                });
                            }
                        });

                        // Hoja: Rendimiento Equipo
                        const recruiterMonthMap = {};
                        let totalMonthClicks = 0;
                        Object.values(clickLogs).forEach(l => {
                            if(l && l.timestamp && typeof l.timestamp === 'string' && l.timestamp.substring(0,7) === m) {
                                const recName = l.recruiter || 'Orgánico';
                                if(!recruiterMonthMap[recName]) recruiterMonthMap[recName] = 0;
                                recruiterMonthMap[recName]++;
                                totalMonthClicks++;
                            }
                        });

                        Object.keys(recruiterMonthMap).forEach(name => {
                            recruiterRows.push({
                                'MES': monthLabel,
                                'Reclutador': name,
                                'Clics Generados': recruiterMonthMap[name],
                                '% del Mes': totalMonthClicks > 0 ? ((recruiterMonthMap[name] / totalMonthClicks) * 100).toFixed(1) + '%' : '0%'
                            });
                        });

                        // Hoja: Detalle Rec-Vacante (Validación de WhatsApp Real)
                        const detailMonthMap = {};
                        Object.values(clickLogs).forEach(l => {
                            if(l && l.jobId && l.timestamp && typeof l.timestamp === 'string' && l.timestamp.substring(0,7) === m) {
                                const j = jobs[l.jobId];
                                if(!j) return;
                                const recName = l.recruiter || 'Orgánico';
                                const key = `${m}_${l.jobId}_${recName}`;

                                if (!detailMonthMap[key]) {
                                    // VALIDACIÓN DE TELÉFONO DESTINO
                                    let destPhone = 'Sin Número';
                                    if (l.recruiter && l.recruiter !== 'Orgánico' && l.recruiter !== 'directo') {
                                        const foundRec = Object.values(recruiters).find(r => r.name === l.recruiter);
                                        destPhone = foundRec ? foundRec.phone : (j.contact || centralPhone);
                                    } else {
                                        destPhone = j.contact || centralPhone;
                                    }

                                    detailMonthMap[key] = {
                                        'MES': monthLabel,
                                        'ID Vacante': l.jobId,
                                        'Reclutador': recName,
                                        'Empresa': j.company,
                                        'Vacante': j.title,
                                        'Clics': 0,
                                        'WhatsApp Destino': destPhone
                                    };
                                }
                                detailMonthMap[key]['Clics']++;
                            }
                        });
                        Object.values(detailMonthMap).forEach(row => detailRows.push(row));
                    });

                    // 2. HOJA NUEVA: Log de Clics Individuales (Bitácora)
                    Object.values(clickLogs).forEach(l => {
                        if(l && l.jobId && l.timestamp && typeof l.timestamp === 'string' && selectedMonths.includes(l.timestamp.substring(0,7))) {
                            const j = jobs[l.jobId];
                            if(!j) return;
                            const recName = l.recruiter || 'Orgánico';
                            
                            let destPhone = 'Sin Número';
                            if (l.recruiter && l.recruiter !== 'Orgánico' && l.recruiter !== 'directo') {
                                const foundRec = Object.values(recruiters).find(r => r.name === l.recruiter);
                                destPhone = foundRec ? foundRec.phone : (j.contact || centralPhone);
                            } else {
                                destPhone = j.contact || centralPhone;
                            }

                            const dateObj = new Date(l.timestamp);
                            const formattedDate = dateObj.toLocaleDateString('es-MX', {day:'2-digit', month:'2-digit', year:'numeric'}) + ' ' + 
                                                dateObj.toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit', hour12: false});

                            clickEventRows.push({
                                'ID Vacante': l.jobId,
                                'Reclutador': recName,
                                'Empresa': j.company,
                                'Vacante': j.title,
                                'WhatsApp Destino': destPhone,
                                'Fecha y Hora': formattedDate
                            });
                        }
                    });
                    
                    // Ordenar logs: Lo más reciente arriba
                    clickEventRows.sort((a,b) => b['Fecha y Hora'].localeCompare(a['Fecha y Hora']));

                    // 3. ARMADO DEL LIBRO EXCEL
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataRows), "Desempeño Vacantes");
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recruiterRows), "Rendimiento Equipo");
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), "Detalle Rec-Vacante");
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clickEventRows), "Log de Clics Individuales");
                    
                    const summaryRows = [
                        { 'Métrica': 'Periodo Seleccionado', 'Valor': selectedMonths.map(getMonthName).join(', ') },
                        { 'Métrica': 'Total Clics Verdes en Periodo', 'Valor': clickEventRows.length }
                    ];
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Resumen Global");

                    XLSX.writeFile(wb, `Reporte_KPIs_TuChamba_${selectedMonths.join('_')}.xlsx`);
                    window.showToast("✅ Reporte Maestro Generado");

                } catch (err) {
                    console.error(err);
                    alert("❌ Error al generar el reporte avanzado.");
                }
            };

            let lastClickTime = 0; 
            window.handleWhatsAppClick = function(btn, jobId, recruiterName, link) {
                const now = Date.now(); 
                if (now - lastClickTime < 5000) return; 
                lastClickTime = now;

                if (typeof gtag === 'function') {
                    const job = jobs[jobId] || {};
                    
                    // Evento base: todos los clics de WhatsApp
                    gtag('event', 'contact_click', {
                        'job_title': job.title || 'Desconocido',
                        'job_id': jobId,
                        'recruiter': recruiterName || 'directo',
                        'traffic_source': trafficSource
                    });

                    // Evento específico para clics desde Google orgánico
                    if (trafficSource === 'google_organico') {
                        gtag('event', 'whatsapp_click_organico', {
                            'job_title': job.title || 'Desconocido',
                            'job_id': jobId,
                            'job_company': job.company || 'Desconocida',
                            'job_city': job.city || 'Desconocida'
                        });
                    }

                    // Evento específico para clics desde Facebook/redes sociales
                    if (['facebook', 'instagram', 'tiktok'].includes(trafficSource)) {
                        gtag('event', 'whatsapp_click_social', {
                            'job_title': job.title || 'Desconocido',
                            'job_id': jobId,
                            'red_social': trafficSource
                        });
                    }
                }

                btn.disabled = true;
                btn.innerHTML = '🔄 Abriendo...';

                const logRef = push(ref(db, 'clickLogs'));
                set(logRef, {
                    jobId: jobId,
                    recruiter: recruiterName || 'directo',
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    source: trafficSource
                });

                runTransaction(ref(db, `jobStats/${jobId}/contactClicks`), (c) => (c || 0) + 1);

                const cleanLink = link.replace(/\s/g, '');
                setTimeout(() => {
                    window.open(cleanLink, '_blank'); 
                    btn.disabled = false;
                    btn.innerHTML = '📅 ¡PIDE INFORMES Y EMPIEZA YA! CLIC';
                }, 500);
            };

            window.registerClick = function(jobId, recruiterName) {
                runTransaction(ref(db, `jobStats/${jobId}/contactClicks`), (c) => (c || 0) + 1);
                push(ref(db, 'clickLogs'), { jobId, recruiter: recruiterName || 'Orgánico', timestamp: new Date().toISOString(), date_readable: new Date().toLocaleString(), source: trafficSource });
            }

            // FUNCIÓN FLYER (Depurada para gastar menos datos)
            window.generateFlyer = async function(jobId) {
                const j = jobs[jobId];
                if (!j) return;

                try {
                    // 1. CARGA PEREZOSA: Solo descarga la librería si no está presente
                    await loadExternalLibrary("https://html2canvas.hertzen.com/dist/html2canvas.min.js", "html2canvas");
                    
                    window.showToast("🎨 Diseñando Flyer...");

                    // 2. Datos Básicos
                    document.getElementById('flyerTitle').innerText = j.title;
                    document.getElementById('flyerSalary').innerText = j.salary || 'Sueldo Competitivo';
                    
                    let locText = "";
                    if (j.city) {
                        locText = j.city;
                        if (j.state) locText += `, ${j.state}`;
                    } else if (j.location) {
                        locText = j.location;
                    } else {
                        locText = "MÉXICO";
                    }

                    const locElement = document.getElementById('flyerLocation');
                    if(locElement) {
                        locElement.innerText = "📍 " + locText.toUpperCase();
                    }

                    // 3. Beneficios
                    const benefitsList = document.getElementById('flyerBenefitsList');
                    benefitsList.innerHTML = '';
                    if(j.benefits && j.benefits.length > 0) {
                        j.benefits.slice(0, 4).forEach(ben => {
                            const li = document.createElement('li');
                            li.innerText = '✅ ' + ben;
                            benefitsList.appendChild(li);
                        });
                    } else {
                        benefitsList.innerHTML = '<li>✅ Prestaciones de Ley</li><li>✅ Contratación Inmediata</li>';
                    }

                    // 4. QR (Cargamos la librería solo cuando se necesita)
                    await loadExternalLibrary("https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js", "QRCode");
                    const qrContainer = document.getElementById('flyerQr');
                    qrContainer.innerHTML = ''; 

                    const urlParams = new URLSearchParams(window.location.search);
                    let refCode = urlParams.get('ref') || sessionStorage.getItem('recruiterCode') || localStorage.getItem('recruiterCode');

                    let linkDelQr = `${window.location.origin}/?id=${jobId}`;
                    if (refCode) linkDelQr += `&ref=${refCode.toLowerCase()}`;

                    new QRCode(qrContainer, {
                        text: linkDelQr,
                        width: 256,
                        height: 256,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });

                    // 5. GENERAR IMAGEN (html2canvas ya está disponible gracias al await de arriba)
                    setTimeout(() => {
                        const flyerNode = document.getElementById('flyerTemplate');
                        
                        html2canvas(flyerNode, { 
                            scale: 2, 
                            useCORS: true, 
                            allowTaint: false, 
                            backgroundColor: null 
                        }).then(canvas => {
                            const link = document.createElement('a');
                            link.download = `Flyer_${j.title.replace(/\s+/g, '_')}.png`;
                            link.href = canvas.toDataURL();
                            link.click();
                            window.showToast("✅ ¡Flyer listo!");
                        }).catch(err => {
                            console.error(err);
                            alert("Error al generar imagen: " + err.message);
                        });
                    }, 1000);

                } catch (err) {
                    console.error(err);
                    alert("❌ No se pudo cargar la herramienta de diseño: " + err.message);
                }
            };

            const visitsRef = ref(db, 'siteStats/visits');
            // Mantenemos la ruta correcta que ya tenías
            const monthlyRef = ref(db, `siteStats/monthly/${currentMonthKey}`);
            
            const isMyDevice = localStorage.getItem('iamsuperadmin');

            // CAMBIO CLAVE: sessionStorage se borra al cerrar la pestaña
            const alreadyVisited = sessionStorage.getItem('visited_session'); 

            if (!alreadyVisited && !isMyDevice) { 
                // Agregamos .catch para que si falla, te avise en la consola (F12)
                runTransaction(visitsRef, (c) => (c || 0) + 1).catch(err => console.error("Error visita total:", err)); 
                runTransaction(monthlyRef, (c) => (c || 0) + 1).catch(err => console.error("Error visita mes:", err)); 
                
                // Guardamos la marca solo por esta sesión
                sessionStorage.setItem('visited_session', 'true'); 
            }
            
            onValue(visitsRef, (s) => { 
                const val = s.val() || 0;
                if(document.getElementById('totalVisits')) document.getElementById('totalVisits').innerText = val;
                if(document.getElementById('totalVisitsMobile')) document.getElementById('totalVisitsMobile').innerText = val;
            });
            
            onValue(monthlyRef, (s) => { 
                const val = s.val() || 0;
                if(document.getElementById('monthlyVisits')) document.getElementById('monthlyVisits').innerText = val;
                if(document.getElementById('monthlyVisitsMobile')) document.getElementById('monthlyVisitsMobile').innerText = val;
            });

            window.saveJob = function(e) {
                e.preventDefault();
                
                const phoneCode = document.getElementById('jobPhoneCode').value;
                const rawPhone = document.getElementById('jobContact').value.trim();
                
                let cleanPhone = rawPhone.replace(/\D/g, '');
                const codeDigits = phoneCode.replace('+', '');
                if (cleanPhone.startsWith(codeDigits)) {
                    cleanPhone = cleanPhone.substring(codeDigits.length);
                }
                const finalPhone = cleanPhone ? (phoneCode + cleanPhone) : '';

                const isFeaturedVal = document.getElementById('jobIsFeatured').value === 'true';

                const jobData = {
                    title: document.getElementById('jobTitle').value,
                    company: document.getElementById('jobCompany').value,
                    showCompany: document.getElementById('jobShowCompany').value === 'true', 
                    state: document.getElementById('jobState').value,
                    city: document.getElementById('jobCity').value,
                    zone: document.getElementById('jobZone').value,
                    location: `${document.getElementById('jobCity').value}, ${document.getElementById('jobState').value}`,
                    
                    fecha: document.getElementById('jobDate').value, 
                    
                    salary: document.getElementById('jobSalary').value,
                    description: document.getElementById('jobDescription').value,
                    schedule: document.getElementById('jobSchedule').value, 
                    // BORRADO: tags
                    contact: finalPhone, 
                    status: document.getElementById('jobStatus').value,
                    agency: document.getElementById('jobAgency').value,
                    requirements: tempReqs,
                    benefits: tempBens,
                    isFeatured: isFeaturedVal 
                };
                const id = currentEditId || 'job-' + Date.now();
                set(ref(db, 'jobs/' + id), jobData).then(() => {
                    window.showToast("✅ Vacante guardada");
                    window.closeFormModal();
                    autoSyncSitemap(); // Actualiza sitemap en GitHub automáticamente
                });
            }

            window.deleteJob = function(id) { 
                if(confirm('¿Borrar vacante?')) {
                    remove(ref(db, 'jobs/' + id)).then(() => {
                        autoSyncSitemap(); // Actualiza sitemap en GitHub automáticamente
                    });
                }
            }

            function normalizeText(text) { return text ? text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : ""; }

            function formatDateFriendly(dateString) {
                return dateString || '';
            }

            function isNewJob(dateString) {
                if (!dateString) return false;
                let jobDate;
                
                if (dateString.includes('/')) {
                    const parts = dateString.split('/');
                    if (parts.length === 3) {
                        jobDate = new Date(parts[2], parts[1] - 1, parts[0]);
                    }
                } 
                else if (dateString.includes('-')) {
                    const parts = dateString.split('-');
                    if (parts.length === 3) {
                        jobDate = new Date(parts[0], parts[1] - 1, parts[2]);
                    }
                }

                if (!jobDate || isNaN(jobDate.getTime())) return false;

                const today = new Date();
                today.setHours(0, 0, 0, 0); 

                const diffTime = Math.abs(today - jobDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                return diffDays <= 3;
            }

            // --- VARIABLES DE ORDENAMIENTO ---
            let currentSortCol = '';   // Qué columna estamos ordenando
            let currentSortAsc = true; // true = A-Z, false = Z-A

            // Función para cambiar el orden al dar clic
            window.handleSort = function(colName) {
                if (currentSortCol === colName) {
                    currentSortAsc = !currentSortAsc; // Si es la misma, invierte el orden
                } else {
                    currentSortCol = colName;
                    currentSortAsc = true; // Si es nueva, empieza A-Z
                }
                renderJobsTable(); // Redibuja la tabla
            }

            // --- FUNCIÓN TABLA (V19.5: FILTRO EXACTO + TODO EL CONTENIDO) ---
            window.renderJobsTable = function() {
                let keys = Object.keys(jobs);
                
                // 1. LLENAR SELECT (Usamos trim para limpiar basura del Excel)
                const companySelect = document.getElementById('headerCompanyFilter');
                if (companySelect && companySelect.options.length <= 1) {
                    // Obtenemos empresas limpias
                    const companies = [...new Set(Object.values(jobs).map(j => j.company.trim()))].sort();
                    companies.forEach(c => {
                        const opt = document.createElement('option');
                        opt.value = c; 
                        opt.textContent = c;
                        companySelect.appendChild(opt);
                    });
                }

                // 2. APLICAR FILTRO DE EMPRESA
                // Nota: Aquí NO filtramos por estatus. Mostramos todo lo que coincida con el nombre.
                const selectedCompany = companySelect ? companySelect.value : '';
                if (selectedCompany) {
                    // Comparamos el nombre limpio de la vacante con el seleccionado
                    keys = keys.filter(id => jobs[id].company.trim() === selectedCompany);
                }

                // 3. ACTUALIZAR CONTADOR (Absoluto)
                updateUniversalCounter(); 

                // 4. ORDENAMIENTO (Sin cambios)
                if (currentSortCol && currentSortCol !== 'company') {
                    keys.sort((a, b) => {
                        let valA = '', valB = '';
                        const jA = jobs[a]; const jB = jobs[b];
                        switch(currentSortCol) {
                            case 'title': valA = jA.title; valB = jB.title; break;
                            case 'status': valA = jA.status; valB = jB.status; break;
                            case 'location': valA = jA.city + jA.state; valB = jB.city + jB.state; break;
                            case 'salary': valA = jA.salary; valB = jB.salary; break;
                            default: return 0;
                        }
                        valA = valA ? valA.toString().toLowerCase() : "";
                        valB = valB ? valB.toString().toLowerCase() : "";
                        if (valA < valB) return currentSortAsc ? -1 : 1;
                        if (valA > valB) return currentSortAsc ? 1 : -1;
                        return 0;
                    });
                } else {
                    keys.sort((a,b) => b.localeCompare(a));
                }

                // 5. DIBUJAR TABLA
                const tableBody = document.getElementById('jobTableBody');
                tableBody.innerHTML = keys.map((id, index) => {
                    const j = jobs[id];
                    const loc = `${j.city}, ${j.state}`;
                    
                    const statusBadge = j.status === 'No Vigente' 
                        ? '<span style="background:#ffebee; color:#c62828; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px;">🔴 No Vigente</span>' 
                        : '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 8px; border-radius:12px; font-weight:bold; font-size:11px;">🟢 Vigente</span>';

                    return `
                        <tr>
                            <td>${index + 1}</td>
                            <td style="font-weight:bold; color:#0a66c2;">${j.company}</td>
                            <td>${j.title}</td>
                            <td>${loc}</td>
                            <td style="color:#d32f2f; font-weight:bold;">${j.salary || 'N/A'}</td>
                            <td style="text-align:center;">${statusBadge}</td>
                            <td>
                                <div class="actions-flex">
                                    <button class="action-icon-btn" title="Flyer" onclick="window.generateFlyer('${id}')">🖼️</button>
                                    <button class="action-icon-btn" title="Link" onclick="window.copyJobLink('${id}')">🔗</button>
                                    ${isAdmin && !isRecruiterMode ? `<button class="action-icon-btn" title="Editar" onclick="window.editJob('${id}')">✏️</button>` : ''}
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            }

            
            // --- FUNCIÓN CONTADOR INTELIGENTE (OBSERVACIÓN 1) ---
            function updateUniversalCounter() { 
                const counterDiv = document.getElementById('universalCounter');
                if(!counterDiv) return;
                
                const allJobs = Object.values(jobs); 
                const total = allJobs.length;

                // Si no hay vacantes, ocultamos
                if (total === 0) { 
                    counterDiv.style.display = 'none'; 
                    return; 
                } else {
                    counterDiv.style.display = 'flex';
                }

                const vigentes = allJobs.filter(j => j.status !== 'No Vigente').length;
                const noVigentes = total - vigentes;

                // --- AQUÍ ESTÁ EL CAMBIO DE LÓGICA ---
                if (!isAdmin && !isRecruiterMode) {
                    // MODO USUARIO: Solo mostramos lo positivo
                    counterDiv.innerHTML = `
                        <span class="counter-tag tag-active" style="font-size: 15px;">🚀 ${vigentes} Vacantes Disponibles</span>
                    `;
                } else {
                    // MODO ADMIN/RECLUTADOR: Mostramos el reporte completo
                    counterDiv.innerHTML = `
                        <span class="counter-tag tag-total">Total: ${total}</span>
                        <span class="counter-tag tag-active">🟢 ${vigentes} Vigentes</span>
                        <span class="counter-tag tag-inactive">🔴 ${noVigentes} No Vigentes</span>
                    `;
                }
            }

            function renderJobs() {
                let keys = Object.keys(jobs);
                
                keys.sort((a, b) => {
                    const jobA = jobs[a]; const jobB = jobs[b];
                    const statusA = jobA.status === 'No Vigente' ? 1 : 0;
                    const statusB = jobB.status === 'No Vigente' ? 1 : 0;
                    if (statusA !== statusB) return statusA - statusB;
                    
                    const featA = jobA.isFeatured ? 1 : 0;
                    const featB = jobB.isFeatured ? 1 : 0;
                    if (featA !== featB) return featB - featA; 

                    const dateA = parseJobDate(jobA.fecha);
                    const dateB = parseJobDate(jobB.fecha);
                    
                    if (dateA !== dateB) {
                        return dateB - dateA; 
                    }
                    return b.localeCompare(a); 
                });

                currentFilteredJobs = keys; 
                currentPage = 1; 
                applyFilterAndRender();
            }

            window.clearSearch = function() {
                document.getElementById('searchInput').value = '';
                filterJobs();
                document.getElementById('searchInput').focus();
            }

            function applyFilterAndRender() {
                if (currentViewMode === 'table') return;

                const stateVal = document.getElementById('stateFilter').value;
                const cityVal = document.getElementById('cityFilter').value;
                const searchInput = document.getElementById('searchInput');
                const searchText = normalizeText(searchInput.value);

                const clearBtn = document.getElementById('clearSearchBtn');
                clearBtn.style.display = searchText.length > 0 ? 'flex' : 'none';

                const matchedKeys = currentFilteredJobs.filter(id => {
                    const j = jobs[id];
                    if (!isAdmin && j.status === 'No Vigente') return false;

                    const matchState = stateVal === '' || j.state === stateVal;
                    const matchCity = cityVal === '' || j.city === cityVal;

                    let matchSearch = true;
                    if(searchText) {
                        const fullText = normalizeText(`${j.title} ${j.company} ${j.description} ${j.city} ${j.state} ${j.zone} ${j.salary} ${j.schedule} ${j.agency}`);
                        matchSearch = fullText.includes(searchText);
                    }

                    return matchState && matchCity && matchSearch;
                });

                updateUniversalCounter();

                if (matchedKeys.length === 0) {
                    document.getElementById('jobGrid').innerHTML = '';
                    document.getElementById('paginationContainer').style.display = 'none';
                    document.getElementById('emptyState').style.display = 'block';
                    return;
                }
                document.getElementById('emptyState').style.display = 'none';

                const totalPages = Math.ceil(matchedKeys.length / itemsPerPage);
                if(currentPage > totalPages) currentPage = 1;

                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const visibleKeys = matchedKeys.slice(startIndex, endIndex);

                const grid = document.getElementById('jobGrid');
                grid.innerHTML = visibleKeys.map(id => {
                    const j = jobs[id];
                    
                    const isVigente = j.status !== 'No Vigente';
                    let statusBadge = '<span class="badge-closed">Cerrada</span>';
                    if(isVigente) statusBadge = '<span class="badge-vigente">🟢 Vigente</span>';

                    const showAdminButtons = isAdmin && !refCode;
                    const showNamePublicly = j.showCompany === true || j.showCompany === 'true';
                    const finalCompanyName = (isAdmin && !refCode) || showNamePublicly ? j.company : "Empresa Confidencial";
                    const verifiedHtml = showNamePublicly ? '<span class="verified-badge" title="Empresa Verificada">✓</span>' : '';

                    let displayLocation = j.location;
                    if (j.city && j.state) displayLocation = `${j.city}, ${j.state}`;

                    const niceDate = formatDateFriendly(j.fecha);
                    const dateHtml = niceDate ? `<span class="card-header-date">📅 Publicación: ${niceDate}</span>` : '';
                    const newBadge = isNewJob(j.fecha) ? '<span class="badge-new">🔥 Nueva</span>' : '';
                    const featuredBadge = j.isFeatured ? '<div class="badge-featured">⭐ DESTACADA</div>' : '';

                    return `
                        <div class="job-card" onclick="window.openViewModal('${id}')">
                            ${featuredBadge}
                            ${showAdminButtons ? `<button class="more-btn" onclick="event.stopPropagation(); window.toggleMenu('${id}')">⋮</button>
                            <div class="admin-actions" id="menu-${id}">
                                <button class="admin-action" onclick="event.stopPropagation(); window.editJob('${id}')">✏️ Editar</button>
                                <button class="admin-action" onclick="event.stopPropagation(); window.generateFlyer('${id}')">🖼️ Descargar Flyer</button>
                                <button class="admin-action delete" onclick="event.stopPropagation(); window.deleteJob('${id}')">🗑️ Eliminar</button>
                            </div>` : ''}
                            
                            <div class="card-header-top">
                                <div>${statusBadge} ${newBadge}</div>
                            </div>
                            ${dateHtml}
                            
                            <div style="display: flex; gap: 15px; margin-bottom: 15px; margin-top: 10px;">
                                <div class="company-logo">${j.company.charAt(0)}</div>
                                <div>
                                    <h3 class="job-title" style="margin: 0 0 4px 0;">${j.title}</h3>
                                    <div class="company-name">${finalCompanyName} ${verifiedHtml}</div>
                                </div>
                            </div>
                            
                            <div class="location">📍 ${displayLocation}</div>
                            <div class="salary-text">💰 ${j.salary || 'A convenir'}</div>
                        </div>
                    `;
                }).join('');

                renderPaginationControls(totalPages);
            }

            function renderPaginationControls(totalPages) {
                const container = document.getElementById('paginationContainer');
                if (totalPages <= 1) {
                    container.style.display = 'none';
                    return;
                }
                container.style.display = 'flex';
                
                let html = '';
                
                html += `<button class="page-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Anterior</button>`;
                
                for (let i = 1; i <= totalPages; i++) {
                    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                        html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
                    } else if (i === currentPage - 2 || i === currentPage + 2) {
                        html += `<span style="color:#999;">...</span>`;
                    }
                }

                html += `<button class="page-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Siguiente &raquo;</button>`;
                
                html += `<div class="page-info">Página ${currentPage} de ${totalPages}</div>`;
                
                container.innerHTML = html;
            }

            // Función para cambiar página: TÉCNICA "DESAPARECER EL ANCLA" ⚓🚫
            window.changePage = function(newPage) {
                // 1. Quitar foco del clic
                if (document.activeElement) document.activeElement.blur();
                
                currentPage = newPage;
                
                if (currentViewMode === 'table') {
                    // Renderizamos los datos nuevos
                    renderJobsTable(); 
                    
                    // --- TRUCO MAESTRO ---
                    // Forzamos que los botones de abajo DESAPAREZCAN un instante.
                    // Al no haber "piso" abajo, el navegador no puede anclarse y subirá sí o sí.
                    const pagContainer = document.getElementById('paginationContainer');
                    if(pagContainer) pagContainer.style.display = 'none';

                    // Ordenamos subir (ahora sí nos obedecerá)
                    window.scrollTo(0, 0);
                    document.body.scrollTop = 0;
                    document.documentElement.scrollTop = 0;
                    
                    // Hacemos reaparecer los botones un parpadeo después
                    setTimeout(() => {
                        if(pagContainer) {
                            // RenderJobsTable calcula si debe ser flex o none, aquí lo forzamos a flex si hay páginas
                            pagContainer.style.display = 'flex'; 
                        }
                    }, 100);

                } else {
                    // MODO USUARIO (Fichas) - Este ya funcionaba, no le movemos
                    applyFilterAndRender(); 
                    const topHeader = document.querySelector('.header');
                    if(topHeader) {
                        setTimeout(() => {
                            topHeader.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 100); 
                    }
                }
            }

        // --- TAREA 12: FILTROS INTELIGENTES ---
            window.filterJobs = function() {
                currentPage = 1; 
                const searchText = normalizeText(document.getElementById('searchInput').value);
                
                // 1. Primero actualizamos los municipios disponibles
                updateSmartFilters(searchText);

                // 2. Luego filtramos visualmente
                applyFilterAndRender();
            }

            function updateSmartFilters(searchText) {
                const stateSelect = document.getElementById('stateFilter');
                const citySelect = document.getElementById('cityFilter');
                const selectedState = stateSelect.value;
                const selectedCity = citySelect.value;

                // Filtramos vacantes considerando si están VIGENTES
                const availableJobs = Object.values(jobs).filter(j => {
                    // REGLA DE ORO: Si no es Admin, ocultamos las NO VIGENTES del filtro
                    if (!isAdmin && j.status === 'No Vigente') return false;
                    
                    if (!searchText) return true;
                    const fullText = normalizeText(`${j.title} ${j.company} ${j.description} ${j.city} ${j.state} ${j.zone} ${j.salary} ${j.schedule} ${j.agency}`);
                    return fullText.includes(searchText);
                });

                const availableStates = new Set();
                const availableCities = new Set();

                availableJobs.forEach(j => {
                    if (j.state) availableStates.add(j.state);
                    if (!selectedState || j.state === selectedState) {
                        if (j.city) availableCities.add(j.city);
                    }
                });

                // Reconstruir Estados
                let stateHtml = '<option value="">📍 Estado</option>';
                [...availableStates].sort().forEach(s => {
                    stateHtml += `<option value="${s}" ${s === selectedState ? 'selected' : ''}>${s}</option>`;
                });
                stateSelect.innerHTML = stateHtml;

                // Reconstruir Municipios
                let cityHtml = '<option value="">🏙️ Municipio</option>';
                [...availableCities].sort().forEach(c => {
                    cityHtml += `<option value="${c}" ${c === selectedCity ? 'selected' : ''}>${c}</option>`;
                });
                citySelect.innerHTML = cityHtml;
            }
            
            // Agregar esto para que al cambiar estado, se refresquen los municipios
            window.handleStateChange = function() { filterJobs(); }

            window.loadMoreJobs = function() {
                displayLimit += 20;
                applyFilterAndRender();
            }

            window.toggleMenu = function(id) { 
                document.querySelectorAll('.admin-actions').forEach(m => m.classList.remove('active')); 
                document.getElementById(`menu-${id}`).classList.toggle('active'); 
            }

            window.openViewModal = function(id) {
                const j = jobs[id];
                updateJobSEO(j, id);
                const isRefMode = !!refCode;

                // Creamos una "marca" para saber si ya vio esta vacante en esta pestaña
                const yaLoVio = sessionStorage.getItem(`visto_${id}`);

                // Solo contamos la vista si NO es Admin Y si NO lo ha visto antes en esta sesión
                if ((!isAdmin || isRefMode) && !yaLoVio) {
                    runTransaction(ref(db, `jobStats/${id}/totalViews`), (c) => (c || 0) + 1);
                    runTransaction(ref(db, `jobStats/${id}/monthlyViews/${currentMonthKey}`), (c) => (c || 0) + 1);
                    
                    const recCodeSafe = activeRecruiter ? activeRecruiter.code : 'ORGANICO';
                    runTransaction(ref(db, `jobStats/${id}/viewsByRecruiter/${recCodeSafe}`), (c) => (c || 0) + 1);

                    // Dejamos la marca puesta para que no vuelva a contar
                    sessionStorage.setItem(`visto_${id}`, 'true');
                }
                
                document.title = `Trabajo en ${j.city || 'México'} - ${j.title} | TuChamba`;

                const stats = jobStats[id] || {};
                const totalViews = stats.totalViews || 0;
                const showNamePublicly = j.showCompany === true || j.showCompany === 'true';
                const companyDisplay = (isAdmin && !isRefMode) || showNamePublicly ? j.company : "Empresa Confidencial";
                
                let contactHtml = '';
                let targetPhone = '';
                let isReferral = false;

                let excelContact = j.contact ? j.contact.replace(/\D/g, '') : '';
                let isExcelContactValid = excelContact.length >= 10;

                if (activeRecruiter) { 
                    targetPhone = activeRecruiter.phone; 
                    isReferral = true; 
                } 
                else if (isExcelContactValid) { 
                    targetPhone = excelContact; 
                } 
                else if (centralPhone) { 
                    targetPhone = centralPhone.replace(/\D/g, ''); 
                }

               if (targetPhone) {
                    const recNameSafe = activeRecruiter ? activeRecruiter.name : 'Orgánico';
                    const recCodeSafe = activeRecruiter ? activeRecruiter.code : 'CENTRAL';

                    contactHtml = `<div class="sticky-footer" style="padding: 10px 15px 15px;">
                                        <p style="font-size:11px; color:#666; margin: 0 0 4px 0; font-weight:600;">
                                            👇🏻 Respuesta Inmediata 👇🏻
                                        </p>
                                        <button onclick="window.openChatModal('${id}', '${recCodeSafe}', '${recNameSafe}')" class="whatsapp-btn-large" style="display: flex; align-items: center; justify-content: center; gap: 8px;">
                                            <span style="white-space: nowrap;">💬 ¡PIDE INFORMES Y EMPIEZA YA! CLIC</span>
                                        </button>
                                        <p style="font-size:11px; color:#666; margin: 4px 0 0 0; font-weight:600;">
                                            👆🏻 ¡No pierdas tu oportunidad, postúlate ahora! 👆🏻
                                        </p>
                                    </div>`;
                }

                let adminInfoHtml = '';
                if (isAdmin && !isRefMode) {
                    adminInfoHtml = `<div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom: 15px;">
                            <div class="view-count-badge">👁️ ${totalViews} Vistas</div>
                            <div class="agency-badge">${j.agency || 'Sin asignar'}</div>
                        </div>`;
                }

                let locationDetail = j.location;
                if (j.state && j.city) locationDetail = `${j.city}, ${j.state} ${j.zone ? '('+j.zone+')' : ''}`;
                
                const isVigente = j.status !== 'No Vigente';
                const badgeHtml = isVigente ? '<span class="badge-vigente">🟢 Vigente</span>' : '<span class="badge-closed">Cerrada</span>';
                const niceDate = formatDateFriendly(j.fecha);
                const dateHtml = niceDate ? `<span class="card-header-date">📅 Publicación: ${niceDate}</span>` : '';
                const newBadge = isNewJob(j.fecha) ? '<span class="badge-new">🔥 Nueva</span>' : '';

                const shareUrl = `${window.location.origin}/?id=${id}${refCode ? '&ref='+refCode : ''}`;
                
                document.getElementById('viewModalBody').innerHTML = `
                    ${adminInfoHtml}
                    
                    <div style="margin-bottom:10px;">
                        ${badgeHtml} ${newBadge}
                    </div>
                    ${dateHtml}

                    <h2 style="font-size: 26px; margin-top: 15px; margin-bottom: 10px; color:#222; line-height:1.2;">
                        ${j.title}
                    </h2>
                    
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
                        <div style="font-size: 18px; color: #0a66c2; font-weight:600;">${companyDisplay}</div>
                        <button class="modal-share-btn" onclick="navigator.clipboard.writeText('${shareUrl}').then(() => window.showToast('🔗 Link copiado'))">🔗 Compartir</button>
                    </div>

                    <div class="job-details" style="background:#f8f9fa; padding:15px; border-radius:12px;">
                        <div class="detail-item">
                            <div style="font-weight:bold; color:#555;">📍 Zona:</div>
                            <div>${locationDetail}</div>
                        </div>
                        <div class="detail-item">
                            <div style="font-weight:bold; color:#d32f2f;">💰 Sueldo:</div>
                            <div class="salary-text" style="margin-top:0;">${j.salary || 'A convenir'}</div>
                        </div>
                        <div class="detail-item">
                            <div style="font-weight:bold; color:#555;">🕒 Jornada:</div>
                            <div>${j.schedule || 'Horario a definir'}</div>
                        </div>
                    </div>

                    <div class="section-title">Descripción del Puesto</div>
                    <p style="color: #444; line-height: 1.45; font-size:15px; margin-bottom:20px;">${j.description}</p>
                    
                    ${(j.requirements||[]).length ? `<div class="section-title">Requisitos</div><ul class="item-list">${j.requirements.map(r=>`<li>${r}</li>`).join('')}</ul>` : ''}
                    
                    ${(j.benefits||[]).length ? `<div class="section-title">Ofrecemos</div><ul class="item-list">${j.benefits.map(b=>`<li>${b}</li>`).join('')}</ul>` : ''}
                    
                    ${contactHtml}
                `;
                document.getElementById('viewModal').classList.add('active');
            }










            
            window.closeViewModal = function() { 
                // RESTAURAR TÍTULO
                document.title = "TuChamba Express | Vacantes Urgentes en Nuevo León, CDMX y EdoMex 2026";
                
                // RESTAURAR CANONICAL (ESTO ES LO NUEVO)
                const canonical = document.getElementById('canonicalLink');
                if(canonical) canonical.href = "https://tuchamba-express.vercel.app/";

                document.getElementById('viewModal').classList.remove('active'); 
            }

            // ============================================================
            // MÓDULO DE CHAT INTERNO
            // ============================================================

            window.pedirDatosCandidate = function() {
                return new Promise((resolve) => {
                    const overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
                    overlay.innerHTML = `
                        <div style="background:white;border-radius:16px;padding:24px;width:100%;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
                            <div style="font-size:22px;text-align:center;margin-bottom:4px;">💬</div>
                            <h3 style="margin:0 0 4px;text-align:center;font-size:17px;color:#222;">¡Un paso más!</h3>
                            <p style="margin:0 0 16px;text-align:center;font-size:13px;color:#666;">El reclutador necesita saber quién eres</p>
                            <div style="margin-bottom:12px;">
                                <label style="font-size:12px;font-weight:700;color:#555;display:block;margin-bottom:4px;">Hola 👋🏻 ¿Cómo te llamas?</label>
                                <input id="cdNombre" type="text" placeholder="Ej. María López" autocomplete="name"
                                    style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #ddd;border-radius:10px;font-size:15px;outline:none;">
                            </div>
                            <div style="margin-bottom:20px;">
                                <label style="font-size:12px;font-weight:700;color:#555;display:block;margin-bottom:4px;">📱 ¿Y tu WhatsApp? (10 dígitos)</label>
                                <input id="cdTelefono" type="tel" placeholder="Ej. 5512345678" maxlength="10" autocomplete="tel"
                                    style="width:100%;box-sizing:border-box;padding:10px 14px;border:1.5px solid #ddd;border-radius:10px;font-size:15px;outline:none;">
                            </div>
                            <button id="cdConfirmar"
                                style="width:100%;padding:12px;background:#0a66c2;color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
                                Iniciar Chat 💬
                            </button>
                            <button id="cdCancelar"
                                style="width:100%;padding:10px;background:none;border:none;color:#999;font-size:13px;cursor:pointer;margin-top:8px;">
                                Cancelar
                            </button>
                        </div>
                    `;
                    document.body.appendChild(overlay);
                    setTimeout(() => document.getElementById('cdNombre').focus(), 100);

                    document.getElementById('cdConfirmar').onclick = () => {
                        const nombre = document.getElementById('cdNombre').value.trim();
                        const telefono = document.getElementById('cdTelefono').value.trim();
                        if (!nombre) { document.getElementById('cdNombre').style.borderColor = '#e53935'; return; }
                        if (!telefono || telefono.length < 10) { document.getElementById('cdTelefono').style.borderColor = '#e53935'; return; }
                        document.body.removeChild(overlay);
                        resolve({ nombre, telefono });
                    };

                    document.getElementById('cdCancelar').onclick = () => {
                        document.body.removeChild(overlay);
                        resolve(null);
                    };

                    overlay.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            document.getElementById('cdCancelar').click();
                        }
                    });

                    document.getElementById('cdTelefono').onkeydown = (e) => {
                        if (e.key === 'Enter') document.getElementById('cdConfirmar').click();
                        if (e.key === 'Escape') document.getElementById('cdCancelar').click();
                    };
                    document.getElementById('cdNombre').onkeydown = (e) => {
                        if (e.key === 'Escape') document.getElementById('cdCancelar').click();
                    };
                });
            }

            window.openChatModal = async function(jobId, recCode, recName) {
                const modal = document.getElementById('chatModal');
                if (!modal) return;

                const vacantTitle = (jobs[jobId] || {}).title || jobId;
                let chatId, candidateName, candidatePhone;

                // Revisar si ya existe chat guardado en localStorage (sin teléfono aún)
                const savedChatKey = `chat_${jobId}_${recCode}`;
                const savedChat = localStorage.getItem(savedChatKey);

                if (savedChat) {
                    const parsed = JSON.parse(savedChat);
                    // Verificar si el chat aún existe en Firebase
                    const existCheck = await get(ref(db, `chats/${parsed.chatId}`));
                    if (existCheck.exists()) {
                        // Chat existe — retomar
                        chatId = parsed.chatId;
                        candidateName = parsed.candidateName;
                        candidatePhone = parsed.candidatePhone;
                    } else {
                        // Chat fue eliminado — limpiar localStorage y pedir datos de nuevo
                        localStorage.removeItem(savedChatKey);
                        const datos = await window.pedirDatosCandidate();
                        if (!datos) return;
                        candidateName = datos.nombre;
                        candidatePhone = datos.telefono;
                        const telefonoLimpio = candidatePhone.replace(/\D/g, '');
                        chatId = `${jobId}_${recCode}_${telefonoLimpio}`;
                        const chatMeta = {
                            vacantId: jobId,
                            vacantTitle: vacantTitle,
                            refCode: recCode,
                            recruiterName: recName,
                            candidateName: candidateName,
                            candidatePhone: candidatePhone,
                            createdAt: Date.now(),
                            lastMessage: '',
                            lastMessageAt: Date.now(),
                            status: 'open'
                        };
                        set(ref(db, `chats/${chatId}`), chatMeta);
                        localStorage.setItem(savedChatKey, JSON.stringify({ chatId, candidateName, candidatePhone }));
                        window.registerClick(jobId, recName);

                        // Mensaje de bienvenida automático
                        get(ref(db, 'recruiters')).then(snap => {
                            const all = snap.val() || {};
                            const rec = Object.values(all).find(r => (r.code || '').toUpperCase() === (recCode || '').toUpperCase());
                            const welcome = (rec && rec.welcomeMessage) || '👋 Hola, gracias por tu interés en la vacante. En breve te atendemos.';
                            const msgRef = push(ref(db, `messages/${chatId}`));
                            set(msgRef, { sender: recName, senderType: 'recruiter', text: welcome, timestamp: Date.now() });
                            set(ref(db, `chats/${chatId}/lastMessage`), welcome);
                            set(ref(db, `chats/${chatId}/lastMessageAt`), Date.now());
                            set(ref(db, `chats/${chatId}/lastSenderType`), 'recruiter');
                        });
                    }
                } else {
                    // Nueva conversación — pedir datos
                    const datos = await window.pedirDatosCandidate();
                    if (!datos) return;

                    candidateName = datos.nombre;
                    candidatePhone = datos.telefono;

                    // ChatId único por vacante + reclutador + teléfono (sin duplicados)
                    const telefonoLimpio = candidatePhone.replace(/\D/g, '');
                    chatId = `${jobId}_${recCode}_${telefonoLimpio}`;

                    // Verificar si ya existe este chat en Firebase
                    const existingSnap = await get(ref(db, `chats/${chatId}`));
                    if (!existingSnap.exists()) {
                        // Chat nuevo — crear metadata
                        const chatMeta = {
                            vacantId: jobId,
                            vacantTitle: vacantTitle,
                            refCode: recCode,
                            recruiterName: recName,
                            candidateName: candidateName,
                            candidatePhone: candidatePhone,
                            createdAt: Date.now(),
                            lastMessage: '',
                            lastMessageAt: Date.now(),
                            status: 'open'
                        };
                        set(ref(db, `chats/${chatId}`), chatMeta);
                        window.registerClick(jobId, recName);

                        // Mensaje de bienvenida automático
                        get(ref(db, 'recruiters')).then(snap => {
                            const all = snap.val() || {};
                            const rec = Object.values(all).find(r => (r.code || '').toUpperCase() === (recCode || '').toUpperCase());
                            const welcome = (rec && rec.welcomeMessage) || '👋 Hola, gracias por tu interés en la vacante. En breve te atendemos.';
                            const msgRef = push(ref(db, `messages/${chatId}`));
                            set(msgRef, { sender: recName, senderType: 'recruiter', text: welcome, timestamp: Date.now() });
                            set(ref(db, `chats/${chatId}/lastMessage`), welcome);
                            set(ref(db, `chats/${chatId}/lastMessageAt`), Date.now());
                            set(ref(db, `chats/${chatId}/lastSenderType`), 'recruiter');
                        });
                    }

                    // Guardar en localStorage para retomar después
                    localStorage.setItem(savedChatKey, JSON.stringify({
                        chatId,
                        candidateName,
                        candidatePhone
                    }));
                }

                activeChatId = chatId;

                document.getElementById('chatModalTitle').textContent = `Chat: ${vacantTitle}`;
                document.getElementById('chatMessages').innerHTML = '<p style="text-align:center;color:#aaa;font-size:13px;padding:20px;">Escribe tu primera pregunta 👇</p>';
                modal.classList.add('active');

                if (chatUnsubscribe) chatUnsubscribe();
                const messagesRef = ref(db, `messages/${chatId}`);
                chatUnsubscribe = onValue(messagesRef, (snap) => {
                    renderChatMessages(snap.val(), candidateName);
                });

                sessionStorage.setItem('chatCandidateName', candidateName);
                sessionStorage.setItem('chatCandidatePhone', candidatePhone);
                sessionStorage.setItem('activeChatId', chatId);

                setTimeout(() => {
                    const inp = document.getElementById('chatInput');
                    if (inp) inp.focus();
                }, 300);
            }

            window.closeChatModal = function() {
                document.getElementById('chatModal').classList.remove('active');
                if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
                activeChatId = null;
            }

            window.sendChatMessage = function() {
                const input = document.getElementById('chatInput');
                const text = input ? input.value.trim() : '';
                if (!text || !activeChatId) return;

                const candidateName = sessionStorage.getItem('chatCandidateName') || 'Candidato';
                const msgRef = push(ref(db, `messages/${activeChatId}`));
                set(msgRef, {
                    sender: candidateName,
                    senderType: 'candidate',
                    text: text,
                    timestamp: Date.now()
                });

                // Actualizar lastMessage y des-archivar si estaba archivado
                set(ref(db, `chats/${activeChatId}/lastMessage`), text);
                set(ref(db, `chats/${activeChatId}/lastMessageAt`), Date.now());
                set(ref(db, `chats/${activeChatId}/lastSenderType`), 'candidate');
                set(ref(db, `chats/${activeChatId}/archived`), false);

                input.value = '';
            }

            function renderChatMessages(data, myName) {
                const container = document.getElementById('chatMessages');
                if (!container) return;
                if (!data) {
                    container.innerHTML = '<p style="text-align:center;color:#aaa;font-size:13px;padding:20px;">Escribe tu primera pregunta 👇</p>';
                    return;
                }
                const msgs = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
                container.innerHTML = msgs.map(m => {
                    const isMe = m.senderType === 'candidate';
                    const time = new Date(m.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                    return `
                        <div style="display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:10px;">
                            <div class="${isMe ? 'bubble-candidate' : 'bubble-recruiter'}">
                                ${!isMe ? `<div style="font-size:11px;font-weight:700;color:#0a66c2;margin-bottom:2px;">${m.sender}</div>` : ''}
                                <div>${m.text}</div>
                                <div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px;">${time}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                container.scrollTop = container.scrollHeight;
            }

            // Chat del reclutador (responder desde el portal)
            window.openRecruiterChat = function(chatId) {
                const modal = document.getElementById('recruiterChatModal');
                if (!modal) return;

                activeChatId = chatId;

                // Cargar metadata
                get(ref(db, `chats/${chatId}`)).then(snap => {
                    const meta = snap.val();
                    if (!meta) return;
                    document.getElementById('recruiterChatTitle').textContent = `${meta.candidateName} — ${meta.vacantTitle}`;
                    document.getElementById('recruiterChatPhone').textContent = `📱 ${meta.candidatePhone}`;
                });

                document.getElementById('recruiterChatMessages').innerHTML = '';
                modal.classList.add('active');

                if (chatUnsubscribe) chatUnsubscribe();
                const messagesRef = ref(db, `messages/${chatId}`);
                chatUnsubscribe = onValue(messagesRef, (snap) => {
                    renderRecruiterChatMessages(snap.val());
                });

                // Escuchar si el reclutador está escribiendo — se muestra en el header del candidato
                onValue(ref(db, `chats/${activeChatId}/recruiterTyping`), (snap) => {
                    const txt = document.getElementById('typingIndicatorText');
                    if (txt) txt.textContent = snap.val() ? '✍️ Escribiendo...' : 'Tu reclutador responderá en breve';
                });

                setTimeout(() => {
                    const inp = document.getElementById('recruiterChatInput');
                    if (inp) inp.focus();
                }, 300);
            }

            // Respuestas rápidas por defecto
            const defaultQuickReplies = [
                "Hola, gracias por tu interés en la vacante. ¿Tienes disponibilidad para una entrevista esta semana?",
                "¿Podrías confirmarme tu nombre completo y municipio de residencia?",
                "El proceso de selección tiene una duración aproximada de 3 días hábiles.",
                "Te contactaremos en las próximas 24 horas para agendar tu entrevista.",
                "¿Tienes experiencia previa en este tipo de puesto?",
                "La entrevista es presencial. ¿Tienes facilidad de traslado a la zona?"
            ];

            function getQuickReplies() {
                const saved = localStorage.getItem('quickReplies');
                return saved ? JSON.parse(saved) : defaultQuickReplies;
            }

            window.toggleQuickReplies = function() {
                const panel = document.getElementById('quickRepliesPanel');
                if (!panel) return;
                if (panel.style.display === 'none') {
                    renderQuickReplies();
                    panel.style.display = 'block';
                } else {
                    panel.style.display = 'none';
                }
            }

            function renderQuickReplies() {
                const panel = document.getElementById('quickRepliesPanel');
                if (!panel) return;
                const replies = getQuickReplies();
                panel.innerHTML = replies.map((r, i) => `
                    <div style="display:flex; align-items:center; gap:4px; margin-bottom:6px;">
                        <button onclick="window.useQuickReply(${i})" 
                            style="flex:1; text-align:left; background:white; border:1px solid #c5cae9; border-radius:8px; padding:7px 10px; font-size:12px; color:#1a237e; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;">
                            ${r}
                        </button>
                        <button onclick="window.editQuickReply(${i})" style="background:none;border:none;font-size:14px;cursor:pointer;color:#888;padding:2px;flex-shrink:0;">✏️</button>
                        <button onclick="window.deleteQuickReply(${i})" style="background:none;border:none;font-size:14px;cursor:pointer;color:#e53935;padding:2px;flex-shrink:0;">🗑️</button>
                    </div>
                `).join('') + `
                    <button onclick="window.addQuickReply()" 
                        style="width:100%; background:#e8eaf6; border:1px dashed #9fa8da; border-radius:8px; padding:7px; font-size:12px; color:#1a237e; cursor:pointer; margin-top:4px;">
                        ➕ Agregar respuesta rápida
                    </button>
                `;
            }

            window.useQuickReply = function(i) {
                const replies = getQuickReplies();
                const input = document.getElementById('recruiterChatInput');
                if (input) {
                    input.value = replies[i];
                    input.focus();
                }
                document.getElementById('quickRepliesPanel').style.display = 'none';
            }

            window.addQuickReply = function() {
                const texto = prompt('Escribe la nueva respuesta rápida:');
                if (!texto || !texto.trim()) return;
                const replies = getQuickReplies();
                replies.push(texto.trim());
                localStorage.setItem('quickReplies', JSON.stringify(replies));
                renderQuickReplies();
            }

            window.editQuickReply = function(i) {
                const replies = getQuickReplies();
                const nuevo = prompt('Editar respuesta:', replies[i]);
                if (!nuevo || !nuevo.trim()) return;
                replies[i] = nuevo.trim();
                localStorage.setItem('quickReplies', JSON.stringify(replies));
                renderQuickReplies();
            }

            window.deleteQuickReply = function(i) {
                if (!confirm('¿Eliminar esta respuesta rápida?')) return;
                const replies = getQuickReplies();
                replies.splice(i, 1);
                localStorage.setItem('quickReplies', JSON.stringify(replies));
                renderQuickReplies();
            }

            window.closeRecruiterChatModal = function() {
                document.getElementById('recruiterChatModal').classList.remove('active');
                if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
                activeChatId = null;
                // Re-renderizar lista — el render recalcula no leídos con lastSeenMessageCount actualizado
                if (document.getElementById('chatsListModal')?.classList.contains('active')) {
                    loadRecruiterChats();
                }
            }

            // Indicador "escribiendo" en tiempo real
            let typingTimeout = null;
            window.recruiterTyping = function() {
                if (!activeChatId) return;
                set(ref(db, `chats/${activeChatId}/recruiterTyping`), true);
                clearTimeout(typingTimeout);
                typingTimeout = setTimeout(() => {
                    set(ref(db, `chats/${activeChatId}/recruiterTyping`), false);
                }, 2000);
            }            

            window.sendRecruiterMessage = function() {
                const input = document.getElementById('recruiterChatInput');
                const text = input ? input.value.trim() : '';
                if (!text || !activeChatId) return;

                const recruiterName = activeRecruiter ? activeRecruiter.name : 'Reclutador';
                const msgRef = push(ref(db, `messages/${activeChatId}`));
                set(msgRef, {
                    sender: recruiterName,
                    senderType: 'recruiter',
                    text: text,
                    timestamp: Date.now()
                });

                set(ref(db, `chats/${activeChatId}/lastMessage`), text);
                set(ref(db, `chats/${activeChatId}/lastMessageAt`), Date.now());
                set(ref(db, `chats/${activeChatId}/lastSenderType`), 'recruiter');
                set(ref(db, `chats/${activeChatId}/lastSenderDevice`), deviceSessionId);
                lastSeenMessageCount[activeChatId] = Date.now();
                localStorage.setItem('lastSeenMsgs', JSON.stringify(lastSeenMessageCount));

                input.value = '';
            }

            function renderRecruiterChatMessages(data) {
                const container = document.getElementById('recruiterChatMessages');
                if (!container) return;
                if (!data) { container.innerHTML = '<p style="text-align:center;color:#aaa;font-size:13px;padding:20px;">Sin mensajes aún.</p>'; return; }
                const msgs = Object.values(data).sort((a, b) => a.timestamp - b.timestamp);
                const lastRecruiterIdx = msgs.map(m => m.senderType).lastIndexOf('recruiter');
                const candidateRespondio = msgs.slice(lastRecruiterIdx + 1).some(m => m.senderType === 'candidate');
                container.innerHTML = msgs.map((m, i) => {
                    const isMe = m.senderType === 'recruiter';
                    const time = new Date(m.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                    const leido = isMe && candidateRespondio;
                    const palomitas = isMe ? `<span style="color:${leido ? '#4fc3f7' : '#aaa'};font-size:11px;margin-left:4px;">${leido ? '✓✓' : '✓'}</span>` : '';
                    return `
                        <div style="display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; margin-bottom:10px;">
                            <div class="${isMe ? 'bubble-candidate' : 'bubble-recruiter'}" style="${isMe ? 'background:#e3f2fd;' : ''}">
                                ${!isMe ? `<div style="font-size:11px;font-weight:700;color:#e53935;margin-bottom:2px;">${m.sender}</div>` : ''}
                                <div>${m.text}</div>
                                <div style="font-size:10px;color:#aaa;text-align:right;margin-top:4px;">${time}${palomitas}</div>
                            </div>
                        </div>
                    `;
                }).join('');
                container.scrollTop = container.scrollHeight;
            }

            // Iniciar escucha de notificaciones para el reclutador
            function startChatNotifications(myCode) {
                if (chatNotifUnsubscribe) { chatNotifUnsubscribe(); chatNotifUnsubscribe = null; }

                // Pedir permiso para Web Push
                if ('Notification' in window && Notification.permission === 'default') {
                    Notification.requestPermission();
                }

                const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
                let primeraVez = true;

                chatNotifUnsubscribe = onValue(ref(db, 'chats'), snap => {
                    // En la primera carga, marcar todos como vistos para no spamear al recargar
                    if (primeraVez) {
                        primeraVez = false;
                        const all = snap.val() || {};
                        Object.entries(all).forEach(([chatId, c]) => {
                            if ((c.refCode || '').toUpperCase() !== myCode.toUpperCase()) return;
                            if (!lastSeenMessageCount[chatId] && c.lastMessageAt) {
                                // Solo marcar como visto si no tenemos registro previo
                                lastSeenMessageCount[chatId] = c.lastMessageAt;
                            }
                        });
                        localStorage.setItem('lastSeenMsgs', JSON.stringify(lastSeenMessageCount));
                        return;
                    }
                    const all = snap.val() || {};
                    let unread = 0;

                    Object.entries(all).forEach(([chatId, c]) => {
                        if ((c.refCode || '').toUpperCase() !== myCode.toUpperCase()) return;
                        if (c.archived) return;
                        if ((c.createdAt || 0) < cutoff) return;

                        const lastMsgAt = c.lastMessageAt || 0;
                        const lastSeen = lastSeenMessageCount[chatId] || 0;

                        const fueElReclutadorDeEsteDispositivo = c.lastSenderType === 'recruiter' && c.lastSenderDevice === deviceSessionId;
                        if (lastMsgAt > lastSeen && c.lastMessage && !fueElReclutadorDeEsteDispositivo) {
                            unread++;

                            const panelAbierto = document.getElementById('chatsListModal')?.classList.contains('active');
                            const esMio = activeChatId === chatId;

                            if (!esMio) {
                                // Sonido siempre que no estés dentro del chat
                                if (notifSound) notifSound();

                                // Web Push solo si el panel está cerrado
                                if (!panelAbierto && 'Notification' in window && Notification.permission === 'granted') {
                                    new Notification('💬 Nuevo mensaje — TuChamba', {
                                        body: `${c.candidateName}: ${c.lastMessage}`,
                                        icon: '/favicon.png',
                                        tag: chatId
                                    });
                                }
                            }

                            // Marcar como visto solo si estás dentro del chat individual
                            if (esMio) {
                                lastSeenMessageCount[chatId] = lastMsgAt;
                            }
                        }
                    });

                    // Actualizar badge del botón
                    const badge = document.getElementById('chatsBadge');
                    if (badge) {
                        if (unread > 0) {
                            badge.textContent = unread > 9 ? '9+' : unread;
                            badge.style.display = 'inline-flex';
                        } else {
                            badge.style.display = 'none';
                        }
                    }

                    // Actualizar contador dentro del panel
                    const unreadLabel = document.getElementById('unreadChatsLabel');
                    const unreadCount = document.getElementById('unreadChatsCount');
                    if (unreadLabel && unreadCount) {
                        if (unread > 0) {
                            unreadCount.textContent = unread === 1 ? '1 conversación' : `${unread} conversaciones`;
                            unreadLabel.style.display = 'inline-flex';
                        } else {
                            unreadLabel.style.display = 'none';
                        }
                    }
                });
            }

            // Limpiar badge al abrir el panel

            // Panel de chats del reclutador
            window.openChatsPanel = function() {
                const modal = document.getElementById('chatsListModal');
                if (!modal) return;
                modal.classList.add('active');
                loadRecruiterChats();
                // Limpiar badge del botón
                const badge = document.getElementById('chatsBadge');
                if (badge) badge.style.display = 'none';
            }

            window.closeChatsPanel = function() {
                document.getElementById('chatsListModal').classList.remove('active');
                if (chatsUnsubscribe) { chatsUnsubscribe(); chatsUnsubscribe = null; }
            }

            let chatsUnsubscribe = null;

            function loadRecruiterChats() {
                const container = document.getElementById('chatsList');
                if (!container) return;
                container.innerHTML = '<p style="text-align:center;color:#aaa;padding:20px;">Cargando...</p>';

                const myCode = activeRecruiter ? activeRecruiter.code : (isAdmin ? 'ALL' : null);
                if (!myCode) return;

                // Cancelar listener anterior si existe
                if (chatsUnsubscribe) { chatsUnsubscribe(); chatsUnsubscribe = null; }

                chatsUnsubscribe = onValue(ref(db, 'chats'), snap => {
                    const all = snap.val() || {};
                    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);

                    // Borrado automático silencioso de chats +7 días
                    Object.entries(all).forEach(([chatId, c]) => {
                        if ((c.createdAt || 0) < cutoff) {
                            remove(ref(db, `chats/${chatId}`));
                            remove(ref(db, `messages/${chatId}`));
                        }
                    });

                    let chats = Object.entries(all);

                    // Filtrar por reclutador y excluir archivados y viejos
                    if (!isAdmin || isRecruiterMode) {
                        chats = chats.filter(([id, c]) =>
                            (c.refCode || '').toUpperCase() === (myCode || '').toUpperCase() &&
                            !c.archived &&
                            (c.createdAt || 0) >= cutoff
                        );
                    } else {
                        chats = chats.filter(([id, c]) => !c.archived && (c.createdAt || 0) >= cutoff);
                    }

                    // Ordenar por más reciente
                    chats.sort(([,a],[,b]) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));

                    if (chats.length === 0) {
                        container.innerHTML = '<p style="text-align:center;color:#aaa;padding:20px;">No hay conversaciones aún.</p>';
                        return;
                    }

                    // Calcular no leídos para el contador del panel
                    const totalUnread = chats.filter(([chatId, c]) => {
                        const lastMsgAt = c.lastMessageAt || 0;
                        const lastSeen = lastSeenMessageCount[chatId] || 0;
                        return lastMsgAt > lastSeen && !!c.lastMessage;
                    }).length;

                    const unreadLabel = document.getElementById('unreadChatsLabel');
                    const unreadCount = document.getElementById('unreadChatsCount');
                    if (unreadLabel && unreadCount) {
                        if (totalUnread > 0) {
                            unreadCount.textContent = totalUnread === 1 ? '1 conversación' : `${totalUnread} conversaciones`;
                            unreadLabel.style.display = 'inline-flex';
                        } else {
                            unreadLabel.style.display = 'none';
                        }
                    }

                    container.innerHTML = chats.map(([chatId, c]) => {
                        const timeAgo = c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
                        const diasRestantes = Math.max(0, 7 - Math.floor((Date.now() - (c.createdAt || 0)) / (1000 * 60 * 60 * 24)));
                        const lastMsgAt = c.lastMessageAt || 0;
                        const lastSeen = lastSeenMessageCount[chatId] || 0;
                        const fueYoMismo = c.lastSenderType === 'recruiter' && c.lastSenderDevice === deviceSessionId;
                        const tieneNuevo = lastMsgAt > lastSeen && !!c.lastMessage && !fueYoMismo;
                        const bgColor = tieneNuevo ? '#e8f0fe' : 'white';
                        const borderLeft = tieneNuevo ? 'border-left:3px solid #1a237e;' : '';
                        return `
                            <div data-unread="${tieneNuevo}" style="padding:14px;border-bottom:1px solid #eee;background:${bgColor};${borderLeft}cursor:pointer;" 
                                onclick="window.abrirChatReclutador('${chatId}', ${lastMsgAt});">
                                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                                    <div style="flex:1;">
                                        <div style="display:flex;justify-content:space-between;align-items:center;">
                                            <div style="font-weight:${tieneNuevo ? '800' : '700'};color:#222;font-size:14px;">👤 ${c.candidateName}</div>
                                            <div style="display:flex;align-items:center;gap:6px;">
                                                ${tieneNuevo ? `<span style="background:#1a237e;color:white;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700;display:inline-flex;align-items:center;">Nuevo mensaje</span>` : ''}
                                                <div style="font-size:11px;color:#aaa;">${timeAgo}</div>
                                            </div>
                                        </div>
                                        <div style="font-size:12px;color:#0a66c2;margin-top:2px;">💼 ${c.vacantTitle}</div>
                                        <div style="font-size:11px;color:#888;margin-top:1px;">🏢 ${(jobs[c.vacantId] || {}).company || ''}</div>
                                        <div style="display:flex;gap:8px;align-items:center;margin-top:6px;">
                                            <span style="font-size:11px;color:#aaa;">📱 ${c.candidatePhone}</span>
                                            <span style="font-size:10px;color:${diasRestantes <= 2 ? '#e53935' : '#aaa'};">⏳ ${diasRestantes}d restantes</span>
                                        </div>
                                    </div>
                                    <button onclick="event.stopPropagation(); window.deleteChat('${chatId}')" 
                                        style="background:#ffebee;color:#c62828;border:1px solid #ffcdd2;border-radius:6px;padding:4px 8px;font-size:11px;cursor:pointer;flex-shrink:0;">
                                        🗑️ Eliminar
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('');
                });
            }

            window.abrirChatReclutador = function(chatId, lastMsgAt) {
                lastSeenMessageCount[chatId] = lastMsgAt;
                localStorage.setItem('lastSeenMsgs', JSON.stringify(lastSeenMessageCount));
                window.openRecruiterChat(chatId);
            }

            // Archivar chat individual (no se borra, se oculta de la bandeja)
            window.deleteChat = function(chatId) {
                if (!confirm('¿Archivar esta conversación? El candidato puede seguir escribiendo.')) return;
                set(ref(db, `chats/${chatId}/archived`), true).then(() => {
                    window.showToast('📦 Conversación archivada');
                });
            }

            // Borrar chats viejos (más de 7 días)
            window.deleteOldChats = function() {
                if (!confirm('¿Borrar todas las conversaciones con más de 7 días? Esta acción no se puede deshacer.')) return;
                const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
                get(ref(db, 'chats')).then(snap => {
                    const all = snap.val() || {};
                    let deleted = 0;
                    const promises = [];
                    Object.entries(all).forEach(([chatId, c]) => {
                        if ((c.createdAt || 0) < cutoff) {
                            promises.push(remove(ref(db, `chats/${chatId}`)));
                            promises.push(remove(ref(db, `messages/${chatId}`)));
                            deleted++;
                        }
                    });
                    Promise.all(promises).then(() => {
                        window.showToast(`🗑️ ${deleted} conversación(es) eliminada(s)`);
                        loadRecruiterChats();
                    });
                });
            }

            window.closeFormModal = function() { document.getElementById('formModal').classList.remove('active'); }
            window.closeTeamModal = function() { document.getElementById('teamModal').classList.remove('active'); }
            
            window.openJobForm = function() {
                currentEditId = null; document.getElementById('formTitle').textContent = 'Nueva Vacante'; document.getElementById('jobForm').reset();
                const todayISO = new Date().toISOString().split('T')[0];
                document.getElementById('jobDate').value = todayISO; 
                
                tempReqs = []; tempBens = []; updateList('reqList', tempReqs, 'req'); updateList('benList', tempBens, 'ben');
                document.getElementById('jobShowCompany').value = 'true';
                document.getElementById('formModal').classList.add('active');
            }

            window.editJob = function(id) {
                currentEditId = id; const j = jobs[id];
                document.getElementById('formTitle').textContent = 'Editar Vacante';
                document.getElementById('jobTitle').value = j.title; document.getElementById('jobCompany').value = j.company;
                document.getElementById('jobShowCompany').value = (j.showCompany === false || j.showCompany === 'false') ? 'false' : 'true';
                document.getElementById('jobState').value = j.state || '';
                document.getElementById('jobCity').value = j.city || '';
                document.getElementById('jobZone').value = j.zone || '';
                
                document.getElementById('jobDate').value = j.fecha || ''; 

                if(!j.city && j.location) document.getElementById('jobCity').value = j.location;
                document.getElementById('jobSalary').value = j.salary||'';
                document.getElementById('jobDescription').value = j.description; document.getElementById('jobStatus').value = j.status||'Vigente';
                document.getElementById('jobAgency').value = j.agency||'';
                
                let contactVal = j.contact || '';
                let codeVal = '+52';
                if(contactVal.startsWith('+52')) { codeVal = '+52'; contactVal = contactVal.replace('+52',''); }
                else if(contactVal.startsWith('+1')) { codeVal = '+1'; contactVal = contactVal.replace('+1',''); }
                document.getElementById('jobPhoneCode').value = codeVal;
                document.getElementById('jobContact').value = contactVal;

                document.getElementById('jobSchedule').value = j.schedule||''; 
                tempReqs = j.requirements||[]; tempBens = j.benefits||[];
                updateList('reqList', tempReqs, 'req'); updateList('benList', tempBens, 'ben');
                document.getElementById('formModal').classList.add('active');
            }

            window.addItem = function(type) {
                const val = document.getElementById(type+'Input').value.trim();
                if(val) { (type==='req'?tempReqs:tempBens).push(val); updateList(type+'List', (type==='req'?tempReqs:tempBens), type); document.getElementById(type+'Input').value=''; }
            }
            window.removeItem = function(type, i) { (type==='req'?tempReqs:tempBens).splice(i,1); updateList(type+'List', (type==='req'?tempReqs:tempBens), type); }
            function updateList(id, arr, type) { document.getElementById(id).innerHTML = arr.map((item,i)=>`<li>${item}<button onclick="removeItem('${type}',${i})" style="color:red;border:none;background:none;cursor:pointer">×</button></li>`).join(''); }

            window.exportToExcel = async function() {
                if(!Object.keys(jobs).length) return alert('Sin datos');
                
                try {
                    // Carga la librería de Excel si no está
                    await loadExternalLibrary("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js", "XLSX");
                    
                    const data = Object.keys(jobs).map(id => {
                        const j = jobs[id];
                        return { 
                            'ID': id, 'Título': j.title, 'Empresa': j.company, 
                            'Mostrar Empresa Publicamente': (j.showCompany === true || j.showCompany === 'true') ? 'SI' : 'NO',
                            'Estado': j.state, 'Municipio': j.city, 'Zona': j.zone, 
                            'Fecha': j.fecha, 
                            'Salario': j.salary, 'Descripción': j.description, 
                            'Jornada': j.schedule, 
                            'Requisitos': (j.requirements||[]).join(' | '), 
                            'Beneficios': (j.benefits||[]).join(' | '),
                            'Contacto': j.contact, 'Estatus': j.status, 'Tipo de Servicio o Agencia': j.agency,
                            'IMPULSAR': j.isFeatured ? 'SI' : 'NO' 
                        };
                    });
                    const ws = XLSX.utils.json_to_sheet(data); 
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Vacantes"); 
                    XLSX.writeFile(wb, "Respaldo_Completo.xlsx");
                } catch (err) {
                    alert("No se pudo cargar la función de Excel: " + err.message);
                }
            }

            window.downloadTemplate = async function() {
                try {
                    // Carga la librería de Excel antes de generar la plantilla
                    await loadExternalLibrary("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js", "XLSX");

                    const data = [{
                        'ID': 'ej-1', 
                        'FECHA': '15/01/2026', 
                        'TÍTULO': 'Ejemplo', 
                        'EMPRESA': 'Empresa S.A.', 
                        'MOSTRAR EMPRESA PUBLICAMENTE': 'SI',
                        'ESTADO': 'CDMX', 
                        'MUNICIPIO': 'Coyoacán', 
                        'ZONA': 'Centro',
                        'SALARIO': '10000', 
                        'DESCRIPCIÓN': 'Descripción del puesto...', 
                        'JORNADA': 'Lunes a Viernes', 
                        'REQUISITOS': 'Req 1 | Req 2', 
                        'BENEFICIOS': 'Ben 1 | Ben 2', 
                        'CONTACTO': '5512345678', 
                        'ESTATUS': 'Vigente', 
                        'TIPO DE SERVICIO O AGENCIA': 'Agencia Interna',
                        'IMPULSAR': 'SI'
                    }];
                    const ws = XLSX.utils.json_to_sheet(data); 
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Plantilla'); 
                    XLSX.writeFile(wb, 'plantilla_tuchamba.xlsx');
                    
                    window.showToast("✅ Plantilla descargada");
                } catch (err) {
                    console.error(err);
                    alert("❌ Error al cargar la herramienta de Excel.");
                }
            }

            window.shareApp = async function() {
                // CORRECCIÓN: Usar localStorage
                const refCode = localStorage.getItem('recruiterCode');
                const encodedRef = refCode ? encodeURIComponent(refCode) : '';
                const url = encodedRef ? `${window.location.origin}/?ref=${encodedRef}` : window.location.origin;
                
                const data = { 
                    title: 'TuChamba Express', 
                    text: '¡Checa esta vacante! Contratación rápida en CDMX, NL y EdoMex. Detalles aquí:', 
                    url: url
                };

                if(navigator.share) await navigator.share(data); else window.open(`https://wa.me/?text=${encodeURIComponent(data.text+' '+data.url)}`);
            }
            
            window.importFromExcel = async function(e) {
                const file = e.target.files[0];
                if (!file) return;

                try {
                    // 1. CARGA PEREZOSA: Solo descargamos la herramienta si intentas usarla
                    await loadExternalLibrary("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js", "XLSX");

                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        try {
                            const data = new Uint8Array(evt.target.result);
                            const wb = XLSX.read(data, {type:'array'});
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            const json = XLSX.utils.sheet_to_json(ws);
                            
                            if(!json.length) { 
                                alert('⚠️ El archivo parece estar vacío.'); 
                                return; 
                            }

                            let count = 0;
                            // Tus funciones de limpieza de texto
                            const normalizeKey = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                            const findKey = (row, keyName) => {
                                return Object.keys(row).find(k => normalizeKey(k) === normalizeKey(keyName));
                            };

                            json.forEach((row, i) => {
                                const titleKey = findKey(row, 'título');
                                const companyKey = findKey(row, 'empresa');
                                const title = titleKey ? row[titleKey] : null;
                                const company = companyKey ? row[companyKey] : null;
                                
                                if(!title || !company) return;
                                
                                // Lógica de IDs y Ubicación
                                const id = row['ID'] || 'job-' + Date.now() + '-' + i;
                                const state = row[findKey(row, 'estado')] || ''; 
                                const city = row[findKey(row, 'municipio')] || ''; 
                                const zone = row[findKey(row, 'zona')] || '';
                                const legacyLoc = row['Ubicación'] || ''; 

                                // Configuración de visibilidad
                                const showCompKey = findKey(row, 'mostrar empresa publicamente');
                                let showCompanyRaw = 'SI';
                                if (showCompKey && row[showCompKey]) {
                                    showCompanyRaw = String(row[showCompKey]).trim().toUpperCase();
                                }

                                // Configuración de Vacante Destacada
                                const featuredKey = findKey(row, 'impulsar') || findKey(row, 'destacar') || findKey(row, 'top');
                                let isFeaturedRaw = 'NO';
                                if(featuredKey && row[featuredKey]) {
                                    isFeaturedRaw = String(row[featuredKey]).trim().toUpperCase();
                                }

                                // Limpieza de Teléfono y Lada (Acepta múltiples nombres de columna)
                                let contactRaw = row[findKey(row, 'contacto')] || row[findKey(row, 'whatsapp')] || '';
                                    contactRaw = String(contactRaw).replace(/\D/g, ''); 
                                    // Si el número viene de 10 dígitos, le ponemos el +52 por defecto (México)
                                    if(contactRaw.length === 10) {
                                    contactRaw = '+52' + contactRaw;
                                    } 
                                    // Si ya trae lada pero no el '+', se lo ponemos
                                    else if (contactRaw.length > 10 && !contactRaw.startsWith('+')) {
                                    contactRaw = '+' + contactRaw;
                                }

                                // Armado del objeto para Firebase
                                const jobData = {
                                    title: title, 
                                    company: company, 
                                    showCompany: showCompanyRaw === 'SI', 
                                    state: state, 
                                    city: city, 
                                    zone: zone,
                                    location: (city && state) ? `${city}, ${state}` : legacyLoc, 
                                    fecha: row[findKey(row, 'fecha')] || '', 
                                    salary: row[findKey(row, 'salario')] || '', 
                                    description: row[findKey(row, 'descripción')] || '',
                                    schedule: row[findKey(row, 'jornada')] || 'Horario a definir',
                                    requirements: (row[findKey(row, 'requisitos')]) ? String(row[findKey(row, 'requisitos')]).split(' | ') : [],
                                    benefits: (row[findKey(row, 'beneficios')]) ? String(row[findKey(row, 'beneficios')]).split(/\s*\|\s*/) : [],
                                    contact: contactRaw, 
                                    status: row[findKey(row, 'estatus')] || 'Vigente',
                                    agency: row[findKey(row, 'tipo de servicio o agencia')] || '',
                                    isFeatured: isFeaturedRaw === 'SI' 
                                };

                                // Guardado en tiempo real
                                set(ref(db, 'jobs/' + id), jobData);
                                count++;
                            });

                            window.showToast(`✅ ${count} vacantes cargadas con éxito`);
                            autoSyncSitemap(); // Actualiza sitemap en GitHub automáticamente
                        } catch(err) { 
                            console.error(err);
                            alert('❌ Error al procesar los datos del archivo.'); 
                        }
                        e.target.value = ''; 
                    };
                    reader.readAsArrayBuffer(file);

                } catch (err) {
                    console.error(err);
                    alert("❌ No se pudo cargar la librería necesaria para importar el archivo.");
                }
            };
                
                // --- MOTOR SEO (V25.10) ---
            function updateJobSEO(j, id) {
                // A. Título de Pestaña Atractivo
                document.title = `${j.title} en ${j.city} | TuChamba Express`;

                // B. Meta Descripción (Para Google y compartir link)
                const metaDesc = document.querySelector('meta[name="description"]');
                if (metaDesc) {
                    metaDesc.setAttribute("content", `Vacante: ${j.title} ($${j.salary}) en ${j.city}. ¡Postúlate hoy mismo vía WhatsApp!`);
                }

                // --- NUEVO: CANONICAL DINÁMICO ---
                const canonical = document.getElementById('canonicalLink');
                if(canonical) {
                    // Apuntamos a la versión LIMPIA (sin referido)
                    canonical.href = `https://tuchamba-express.vercel.app/?id=${id}`;
                }

                // C. JSON-LD (Datos Estructurados para Google Jobs)
                const oldScript = document.getElementById('job-schema');
                if (oldScript) oldScript.remove();

                // Convertir fecha de Excel (DD/MM/YYYY) a ISO (YYYY-MM-DD)
                let isoDate = new Date().toISOString().split('T')[0];
                if (j.fecha && j.fecha.includes('/')) {
                    const p = j.fecha.split('/');
                    if(p.length === 3) isoDate = `${p[2]}-${p[1]}-${p[0]}`;
                }

                const schemaData = {
                    "@context": "https://schema.org/",
                    "@type": "JobPosting",
                    "title": j.title,
                    "description": j.description,
                    "identifier": { "@type": "PropertyValue", "name": "TuChamba", "value": id },
                    "datePosted": isoDate,
                    "validThrough": "2026-12-31",
                    "employmentType": "FULL_TIME",
                    "hiringOrganization": {
                        "@type": "Organization",
                        "name": (j.showCompany === true || j.showCompany === 'true') ? j.company : "Empresa Confidencial",
                        "logo": "https://tuchamba-express.vercel.app/favicon.png"
                    },
                    "jobLocation": {
                        "@type": "Place",
                        "address": {
                            "@type": "PostalAddress",
                            "addressLocality": j.city,
                            "addressRegion": j.state,
                            "addressCountry": "MX"
                        }
                    },
                    "baseSalary": {
                        "@type": "MonetaryAmount",
                        "currency": "MXN",
                        "value": {
                            "@type": "QuantitativeValue",
                            "value": parseFloat(j.salary.replace(/[^0-9.]/g, '')) || 0,
                            "unitText": "MONTH"
                        }
                    }
                };

                const script = document.createElement('script');
                script.id = 'job-schema';
                script.type = 'application/ld+json';
                script.text = JSON.stringify(schemaData);
                document.head.appendChild(script);
            }
            
            // --- HERRAMIENTA ADMIN: GENERADOR DE SITEMAP SEO (V27 - FILTRADO + AUTO GITHUB) ---
            
            // Sube el sitemap.xml al repositorio de GitHub automáticamente
            async function pushSitemapToGitHub(xmlContent) {
                // Lee token y repo desde Firebase settings (el admin los configura en ⚙️ Ajustes)
                const tokenSnap = await new Promise(res => {
                    const r = ref(db, 'settings/githubToken');
                    onValue(r, snap => res(snap), { onlyOnce: true });
                });
                const repoSnap = await new Promise(res => {
                    const r = ref(db, 'settings/githubRepo');
                    onValue(r, snap => res(snap), { onlyOnce: true });
                });

                const token = tokenSnap.val();
                const repo = repoSnap.val(); // formato: "usuario/nombre-repo"

                if (!token || !repo) {
                    window.showToast("⚠️ Configura GitHub Token y Repo en ⚙️ Ajustes primero");
                    return false;
                }

                // Obtener SHA del archivo actual (necesario para sobreescribir)
                let sha = null;
                try {
                    const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/myweb/sitemap.xml`, {
                        headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' }
                    });
                    if (getRes.ok) {
                        const data = await getRes.json();
                        sha = data.sha;
                    }
                } catch(e) { /* archivo no existe aún, sha queda null */ }

                // Subir (crear o actualizar)
                const body = {
                    message: `🤖 Sitemap actualizado automáticamente - ${new Date().toLocaleString('es-MX')}`,
                    content: btoa(unescape(encodeURIComponent(xmlContent))),
                    ...(sha ? { sha } : {})
                };

                const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/myweb/sitemap.xml`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });

                return putRes.ok;
            }

            // Genera el XML del sitemap con las vacantes vigentes actuales
            function generateSitemapXML() {
                let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
                xmlContent += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
                xmlContent += '  <url>\n    <loc>https://tuchamba-express.vercel.app/</loc>\n    <priority>1.0</priority>\n  </url>\n';
                Object.keys(jobs).forEach(id => {
                    const j = jobs[id];
                    if (j.status !== 'No Vigente') {
                        let isoDate = new Date().toISOString().split('T')[0];
                        if (j.fecha && j.fecha.includes('/')) {
                            const parts = j.fecha.split('/');
                            if (parts.length === 3) {
                                const [d, m, y] = parts;
                                isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                            }
                        }
                        const urlLimpia = `https://tuchamba-express.vercel.app/?id=${id}`.replace(/&/g, '&amp;');
                        xmlContent += '  <url>\n';
                        xmlContent += `    <loc>${urlLimpia}</loc>\n`;
                        xmlContent += `    <lastmod>${isoDate}</lastmod>\n`;
                        xmlContent += '    <changefreq>weekly</changefreq>\n';
                        xmlContent += '    <priority>0.8</priority>\n';
                        xmlContent += '  </url>\n';
                    }
                });
                xmlContent += '</urlset>';
                return xmlContent;
            }

            // Sube el sitemap a GitHub silenciosamente (sin descarga local)
            async function autoSyncSitemap() {
                try {
                    const xml = generateSitemapXML();
                    const success = await pushSitemapToGitHub(xml);
                    if (success) window.showToast('🗺️ Sitemap actualizado en Google');
                } catch(e) {
                    // Falla silenciosa — no interrumpir el flujo del admin
                }
            }

            window.downloadSitemap = async function() {
                const xmlContent = generateSitemapXML();

                // 1. Descarga local del archivo
                const blob = new Blob([xmlContent], { type: 'application/xml' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'sitemap.xml';
                link.click();
                
                window.showToast("✅ Sitemap generado. Subiendo a GitHub...");
                
                // 2. Subida automática a GitHub
                try {
                    const success = await pushSitemapToGitHub(xmlContent);
                    if (success) {
                        window.showToast("🚀 Sitemap subido a GitHub exitosamente");
                    } else {
                        window.showToast("⚠️ Sitemap descargado, pero falló la subida a GitHub");
                    }
                } catch(e) {
                    window.showToast("⚠️ Sitemap descargado. Error GitHub: " + e.message);
                }
            };
        
            /* =========================================================
            BLOQUE DE RECUPERACIÓN TOTAL (V22.FIX) 🚑
            (Incluye: Descargas, Equipo, Directorio y Accesos)
            ========================================================= */

            // --- HERRAMIENTA CORREGIDA: DESCARGAR BASE DE RECLUTADORES (SIN DUPLICADOS) ---
            window.downloadRecruiters = async function() {
                // 1. Candado de seguridad para evitar doble descarga
                if (window.isDownloadingRecruiters) return;
                window.isDownloadingRecruiters = true;

                try {
                    // 2. Carga la librería solo si no existe
                    await loadExternalLibrary("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js", "XLSX");

                    if(!recruiters || Object.keys(recruiters).length === 0) {
                        alert('⚠️ No hay reclutadores registrados.');
                        window.isDownloadingRecruiters = false;
                        return;
                    }
                    
                    window.showToast("📂 Generando Excel...");

                    // 3. Mapeo de datos (Puro número y sin ID)
                    const data = Object.keys(recruiters).map(id => {
                        const r = recruiters[id];
                        return {
                            'Nombre': r.name || 'N/A',
                            'Código': r.code || 'N/A',
                            'Teléfono': r.phone ? r.phone.replace(/\D/g, '') : '',
                            'Link Personal': `${window.location.origin}/?ref=${r.code.toLowerCase()}`
                        };
                    });

                    // 4. Generación y descarga
                    const ws = XLSX.utils.json_to_sheet(data);
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Reclutadores");
                    
                    XLSX.writeFile(wb, "Base_Reclutadores_TuChamba.xlsx");
                    window.showToast("✅ Descarga completa");

                } catch (err) {
                    console.error("Error:", err);
                    alert("❌ Error al descargar.");
                } finally {
                    // 5. Liberamos el candado después de un segundo
                    setTimeout(() => {
                        window.isDownloadingRecruiters = false;
                    }, 1000);
                }
            };

            // 2. MÓDULO DE EQUIPO (EL QUE FALTABA)
            window.openTeamModal = function() {
                const modal = document.getElementById('teamModal');
                if (modal) {
                    modal.classList.add('active');
                    modal.style.display = 'flex';
                    resetRecruiterForm(); 
                    renderRecruitersTable(); // <--- PINTA LA LISTA
                }
            };

            window.closeTeamModal = function() {
                const modal = document.getElementById('teamModal');
                if(modal) {
                    modal.classList.remove('active');
                    modal.style.display = 'none';
                }
            };

            window.renderRecruitersTable = function() {
                const list = document.getElementById('recruitersList');
                if (!list) return;

                if (!recruiters || Object.keys(recruiters).length === 0) {
                    list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">No hay reclutadores registrados.</td></tr>';
                    return;
                }

                list.innerHTML = Object.keys(recruiters).map((key, index) => {
                    const r = recruiters[key];
                    const personalLink = `${window.location.origin}/?ref=${r.code.toLowerCase()}`;
                    
                    return `
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="text-align: center; font-size: 11px; color: #888; font-weight: bold; padding: 10px; width: 40px;">${index + 1}</td>
                        <td style="padding: 10px; width: 45%; overflow: hidden;">
                            <div style="font-weight: bold; color: #333; font-size: 12px; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${r.name}</div>
                            <div style="font-size: 10px; color: #007bff;">📱 ${r.phone}</div>
                        </td>
                        <td style="padding: 10px; width: 80px;">
                            <span style="background: #e3f2fd; color: #1565c0; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 10px;">${r.code}</span>
                        </td>
                        <td style="padding: 10px; text-align: center; width: 50px;">
                            <button onclick="copyRecruiterLink('${personalLink}')" style="background: #f5f5f5; border: 1px solid #ccc; padding: 6px; border-radius: 6px; cursor: pointer; font-size: 12px;">🔗</button>
                        </td>
                        <td style="padding: 10px; text-align: right; width: 80px; white-space: nowrap;">
                            <button onclick="editRecruiter('${key}')" style="border: none; background: transparent; cursor: pointer; font-size: 16px;">✏️</button>
                            <button onclick="deleteRecruiter('${key}')" style="border: none; background: transparent; cursor: pointer; font-size: 16px; color: #d32f2f; margin-left: 8px;">🗑️</button>
                        </td>
                    </tr>`;
                }).join('');
            };

            // --- GUARDADO DE RECLUTADOR CON MEMORIA ---
            window.saveRecruiter = function() {
                const name = document.getElementById('recName').value.trim();
                const code = document.getElementById('recCode').value.toUpperCase().replace(/\s/g, '');
                const lada = document.getElementById('teamCountryCode').value; // ID Único corregido
                const num = document.getElementById('recPhone').value.trim();

                if (!name || !num || !code) return alert('⚠️ Llena todos los campos');

                let cleanNum = num.replace(/\D/g, '');
                let cleanLada = lada.replace('+', '');
                
                if (cleanNum.startsWith(cleanLada)) {
                    cleanNum = cleanNum.substring(cleanLada.length);
                }

                const phoneToSave = cleanLada + cleanNum;
                const recruiterData = { name, phone: phoneToSave, code };
                
                // Si editingRecruiterId tiene valor, Firebase sobreescribe el mismo registro
                const idToSave = editingRecruiterId || 'rec-' + Date.now();

                set(ref(db, 'recruiters/' + idToSave), recruiterData)
                    .then(() => {
                        window.showToast('✅ Registro guardado correctamente');
                        resetRecruiterForm(); // Limpia el formulario y resetea el ID de edición
                        renderRecruitersTable(); 
                    });
            };

            // --- EDICIÓN DE RECLUTADOR CON DETECCIÓN DE PAÍS ---
            window.editRecruiter = function(key) {
                const r = recruiters[key];
                if(!r) return;
                
                document.getElementById('recName').value = r.name;
                document.getElementById('recCode').value = r.code;
                
                const fullPhone = r.phone; 
                const selectLada = document.getElementById('teamCountryCode'); // ID Único corregido
                
                // Lista de prefijos para detectar el país automáticamente
                const prefijos = ["52", "54", "591", "55", "56", "57", "506", "53", "593", "503", "34", "1", "502", "504", "505", "507", "595", "51", "598", "58"];
                prefijos.sort((a, b) => b.length - a.length); // Ordenar para no confundir 5 con 52

                let encontrado = false;
                for (let p of prefijos) {
                    if (fullPhone.startsWith(p)) {
                        selectLada.value = "+" + p;
                        document.getElementById('recPhone').value = fullPhone.substring(p.length);
                        encontrado = true;
                        break;
                    }
                }

                if(!encontrado) document.getElementById('recPhone').value = fullPhone;
                
                editingRecruiterId = key; // Guardamos el ID en memoria para el guardado posterior
                const btnSave = document.getElementById('btnSaveRecruiter');
                if(btnSave) btnSave.innerHTML = "💾 Actualizar Reclutador";
            };

            window.deleteRecruiter = function(key) {
                if (confirm("¿Eliminar?")) {
                    remove(ref(db, 'recruiters/' + key))
                        .then(() => {
                            window.showToast("🗑️ Eliminado");
                            renderRecruitersTable();
                        });
                }
            };

            window.resetRecruiterForm = function() {
                // 1. Limpiamos los campos de texto
                document.getElementById('recName').value = '';
                document.getElementById('recCode').value = '';
                document.getElementById('recPhone').value = '';
                
                // 2. IMPORTANTE: Limpiamos el selector de país (poniéndolo en México por defecto)
                const selectLada = document.getElementById('teamCountryCode');
                if(selectLada) selectLada.value = '+52';
                
                // 3. Matamos la memoria del ID para que la siguiente acción sea una "Alta Nueva"
                editingRecruiterId = null; 
                
                // 4. Restauramos el botón a su estado original (Azul y texto de Guardar)
                const btnSave = document.getElementById('btnSaveRecruiter');
                if(btnSave) {
                    btnSave.innerHTML = "💾 Guardar Reclutador";
                    btnSave.style.backgroundColor = "#0a66c2"; 
                }
};
          
        // COPIAR LINK PERSONAL - VERSIÓN DEBUG (para ver por qué falla)
        window.copyRecruiterLink = function(specificLink = null) {
            let linkToCopy;
            let debugInfo = [];

            if (specificLink) {
                linkToCopy = specificLink;
                debugInfo.push("Usando link específico pasado: " + specificLink);
            } else {
                // Intentamos obtener refCode de varias fuentes
                const urlParams = new URLSearchParams(window.location.search);
                let refCode = urlParams.get('ref');
                debugInfo.push("De URL (?ref=): " + (refCode || "NO ENCONTRADO"));

                if (!refCode) {
                    refCode = sessionStorage.getItem('recruiterCode');
                    debugInfo.push("De sessionStorage ('recruiterCode'): " + (refCode || "NO ENCONTRADO"));
                }

                if (!refCode) {
                    refCode = localStorage.getItem('recruiterCode');
                    debugInfo.push("De localStorage ('recruiterCode'): " + (refCode || "NO ENCONTRADO"));
                }

                if (!refCode && window.activeRecruiter && window.activeRecruiter.code) {
                    refCode = window.activeRecruiter.code;
                    debugInfo.push("De window.activeRecruiter.code: " + refCode);
                }

                if (!refCode) {
                    window.showToast("⚠️ No se encontró código de reclutador en ninguna fuente");
                    return;
                }

                linkToCopy = `${window.location.origin}/?ref=${refCode.toLowerCase()}`;
                debugInfo.push("Link final construido: " + linkToCopy);
            }

            navigator.clipboard.writeText(linkToCopy)
                .then(() => {
                    window.showToast("✅ Link copiado: " + linkToCopy);
                })
                .catch(err => {
                    console.error("Error al copiar:", err);
                    prompt("Copia manual (Ctrl+C):", linkToCopy);
                });
        };

            window.toggleAdminSearch = function() {
                const searchBar = document.getElementById('userStickyTools');
                if(searchBar) {
                    searchBar.classList.toggle('active');
                    if(searchBar.classList.contains('active')) {
                        setTimeout(() => {
                            const input = document.getElementById('searchInput');
                            if(input) input.focus();
                        }, 100);
                    }
                }
            };

            // --- DETECTIVE DE EVENTOS EXTERNOS ---
            const EventManager = {
                repoURL: './assets/eventos/',

                async init() {
                    // --- EL CANDADO ---
                    // Si ya se mostraron los corazones en esta sesión, no hacer nada
                    if (sessionStorage.getItem('eventShown')) return;

                    const mesActual = new Date().getMonth();
                    try {
                        const response = await fetch(this.repoURL + 'config-eventos.json');
                        const config = await response.json();
                        
                        if (config[mesActual]) {
                            this.lanzarEfecto(config[mesActual]);
                            // --- MARCAR COMO MOSTRADO ---
                            // Guardamos en la memoria de la sesión que ya salieron
                            sessionStorage.setItem('eventShown', 'true');
                        }
                    } catch (e) {
                    }
                },

                lanzarEfecto(datos) {
                    // Crear capa invisible
                    const capa = document.createElement('div');
                    capa.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9999; overflow:hidden;';
                    document.body.appendChild(capa);

                    // Lanzar 15 elementos aleatorios
                    for (let i = 0; i < 15; i++) {
                        const imgIndex = Math.floor(Math.random() * datos.elementos.length);
                        const img = document.createElement('img');
                        img.src = this.repoURL + datos.elementos[imgIndex];
                        img.style.cssText = `
                            position: absolute; 
                            bottom: -200px; /* Bajamos un poco más el inicio por ser más grandes */
                            /* Ajustamos el tamaño: mínimo 120px, máximo 180px */
                            width: ${Math.random() * 60 + 120}px; 
                            left: ${Math.random() * 100}%; 
                            transform: translateX(-50%);
                            z-index: 6000; 
                            opacity: 0.8;
                            animation: subirFlotando ${Math.random() * 3 + 4}s linear forwards;
                        `;
                        capa.appendChild(img);
                    }

                    // Estilo de la animación
                    const style = document.createElement('style');
                    style.innerHTML = `
                        @keyframes subirFlotando {
                            0% { 
                                transform: translate(-50%, 0) scale(1) rotate(0deg); 
                                opacity: 0; 
                            }
                            15% { opacity: 0.8; }
                            85% { opacity: 0.8; }
                            100% { 
                                /* Quitamos el scale(0.1) para que no se encojan */
                                transform: translate(-50%, -125vh) scale(1) rotate(15deg); 
                                opacity: 0; 
                            }
                        }
                    `;
                    document.head.appendChild(style);

                    // Mostrar mensaje central (Opcional)
                    this.mostrarMensaje(datos.mensaje, datos.colorPrimario);
                },

                mostrarMensaje(texto, color) {
                    const contenedor = document.createElement('div');
                    const textoLimpio = texto.replace('❤️', '').replace('🤍', '');
                    const colorContorno = `${color}cc`;

                    contenedor.style.cssText = `
                        position: fixed; top: 50%; left: 50%; 
                        transform: translate(-50%, -50%) scale(0);
                        /* Reducimos el tamaño para que no tape todo */
                        width: 260px; height: 240px; 
                        display: flex; align-items: center; justify-content: center;
                        text-align: center; color: white; font-weight: bold; font-size: 1.05rem;
                        /* Z-INDEX: Lo ponemos en 5000 (los pequeños deben tener más de 5000 para pasar por enfrente) */
                        z-index: 5000; 
                        transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${encodeURIComponent(color)}' stroke='${encodeURIComponent(colorContorno)}' stroke-width='0.3'><path d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'/></svg>");
                        background-size: contain;
                        background-repeat: no-repeat;
                        background-position: center;
                        /* Un poco de transparencia para que se vea lo de atrás */
                        opacity: 0.95;
                        filter: drop-shadow(0 5px 15px rgba(0,0,0,0.2));
                    `;

                    contenedor.innerHTML = `
                        <div style="padding: 15px; padding-bottom: 50px; line-height: 1.2; max-width: 85%;">
                            ${textoLimpio}
                        </div>
                    `;
                    
                    document.body.appendChild(contenedor);
                    
                    setTimeout(() => contenedor.style.transform = "translate(-50%, -50%) scale(1.1)", 100);
                    
                    setTimeout(() => {
                        contenedor.style.transition = "all 0.3s linear"; 
                        contenedor.style.transform = "translate(-50%, -50%) scale(0.01)";
                        contenedor.style.opacity = "0";
                        setTimeout(() => contenedor.remove(), 350);
                    }, 4500);
                }
            };

            // Arrancar al cargar la página
            document.addEventListener('DOMContentLoaded', () => EventManager.init());
            
