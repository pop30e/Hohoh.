// ==UserScript==
// @name         WPlace Auto-Painter (Debug)
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Auto-paint tool for wplace.live with detailed debugging
// @author       YourName
// @match        https://wplace.live/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(async function() {
    'use strict';

    // Configuration
    const CONFIG = {
        START_X: 742,
        START_Y: 1148,
        PIXELS_PER_LINE: 100,
        DELAY: 1000,
        MAX_RETRIES: 3,
        DEBUG: true,
        THEME: {
            primary: '#1a1a2e',
            secondary: '#16213e',
            accent: '#0f3460',
            text: '#e94560',
            highlight: '#00ff00',
            success: '#4CAF50',
            error: '#F44336'
        }
    };

    // State management
    const state = {
        running: false,
        paintedCount: 0,
        charges: { count: 0, max: 80, cooldownMs: 30000 },
        userInfo: null,
        lastPixel: null,
        minimized: false,
        menuOpen: false,
        language: 'en',
        retryCount: 0
    };

    // Enhanced logger
    const logger = {
        log: (...args) => console.log('%c[BOT]', 'color: #4CAF50; font-weight: bold', ...args),
        error: (...args) => {
            console.error('%c[BOT ERROR]', 'color: #F44336; font-weight: bold', ...args);
            updateUI(`Error: ${args[0]} (see console)`, 'error');
        },
        debug: (...args) => {
            if (CONFIG.DEBUG) {
                console.debug('%c[BOT DEBUG]', 'color: #2196F3; font-weight: bold', ...args);
            }
        },
        warn: (...args) => console.warn('%c[BOT WARN]', 'color: #FF9800; font-weight: bold', ...args)
    };

    // Utility functions
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    const getRandomPosition = () => ({
        x: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
        y: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE)
    });

    // API functions
    const fetchAPI = async (url, options = {}) => {
        try {
            logger.debug(`Making request to: ${url}`, options);

            const startTime = Date.now();
            const res = await fetch(url, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                ...options
            });

            const responseTime = Date.now() - startTime;
            logger.debug(`Response received in ${responseTime}ms`, {
                status: res.status,
                headers: [...res.headers.entries()],
                url: res.url
            });

            if (!res.ok) {
                let errorText;
                try {
                    errorText = await res.text();
                } catch (e) {
                    errorText = 'Failed to parse error response';
                }
                throw new Error(`HTTP ${res.status}: ${errorText}`);
            }

            const data = await res.json().catch(e => {
                throw new Error(`Failed to parse JSON: ${e.message}`);
            });

            logger.debug('API response:', data);
            return data;

        } catch (e) {
            logger.error(`API request failed`, {
                url,
                error: e.message,
                stack: e.stack,
                options
            });
            return null;
        }
    };

    // Core painting function
    const paintPixel = async (x, y, attempt = 1) => {
        const randomColor = Math.floor(Math.random() * 31) + 1;
        const payload = {
            coords: [x, y],
            colors: [randomColor],
            timestamp: Date.now(),
            attempt
        };

        logger.debug(`Painting attempt #${attempt}`, payload);

        try {
            const response = await fetchAPI(
                `https://backend.wplace.live/s0/pixel/${CONFIG.START_X}/${CONFIG.START_Y}`,
                {
                    method: 'POST',
                    body: JSON.stringify(payload)
                }
            );

            if (!response) {
                throw new Error('No response from server');
            }

            if (response.painted === 1) {
                logger.log(`Successfully painted at (${x}, ${y})`);
                return {
                    success: true,
                    response
                };
            } else {
                throw new Error(`Server rejected painting: ${JSON.stringify(response)}`);
            }
        } catch (e) {
            if (attempt < CONFIG.MAX_RETRIES) {
                logger.warn(`Retrying (${attempt + 1}/${CONFIG.MAX_RETRIES})...`);
                await sleep(1000 * attempt); // Exponential backoff
                return paintPixel(x, y, attempt + 1);
            } else {
                logger.error(`Failed to paint after ${CONFIG.MAX_RETRIES} attempts`, {
                    coordinates: {x, y},
                    error: e.message,
                    lastPayload: payload
                });
                return {
                    success: false,
                    error: e.message
                };
            }
        }
    };

    // User functions
    const getCharge = async () => {
        try {
            const data = await fetchAPI('https://backend.wplace.live/me');
            if (!data) throw new Error('No user data received');

            state.userInfo = data;
            state.charges = {
                count: Math.floor(data.charges.count),
                max: Math.floor(data.charges.max),
                cooldownMs: data.charges.cooldownMs
            };

            if (state.userInfo.level) {
                state.userInfo.level = Math.floor(state.userInfo.level);
            }

            logger.debug('Updated charges:', state.charges);
            return state.charges;

        } catch (e) {
            logger.error('Failed to get charge info', e.message);
            return null;
        }
    };

    // Main painting loop
    const paintLoop = async () => {
        logger.log('Starting painting loop');
        state.running = true;

        while (state.running) {
            try {
                const charges = await getCharge();
                if (!charges) {
                    await sleep(5000);
                    continue;
                }

                // Check charges
                if (charges.count < 1) {
                    const waitTime = Math.ceil(charges.cooldownMs / 1000);
                    updateUI(state.language === 'pt' 
                        ? `⌛ Sem cargas. Esperando ${waitTime}s...` 
                        : `⌛ No charges. Waiting ${waitTime}s...`, 'status');
                    await sleep(charges.cooldownMs);
                    continue;
                }

                // Get random position
                const pos = getRandomPosition();
                updateUI(state.language === 'pt' 
                    ? `🎨 Tentando pintar em (${pos.x}, ${pos.y})...` 
                    : `🎨 Trying to paint at (${pos.x}, ${pos.y})...`, 'status');

                // Paint pixel
                const result = await paintPixel(pos.x, pos.y);
                if (result.success) {
                    state.paintedCount++;
                    state.charges.count--;
                    state.lastPixel = {
                        x: CONFIG.START_X + pos.x,
                        y: CONFIG.START_Y + pos.y,
                        time: new Date(),
                        color: result.response.color
                    };

                    // Visual feedback
                    document.getElementById('paintEffect').style.animation = 'pulse 0.5s';
                    setTimeout(() => {
                        document.getElementById('paintEffect').style.animation = '';
                    }, 500);

                    updateUI(state.language === 'pt' 
                        ? `✅ Pixel pintado em (${pos.x}, ${pos.y})!` 
                        : `✅ Pixel painted at (${pos.x}, ${pos.y})!`, 'success');
                } else {
                    updateUI(state.language === 'pt' 
                        ? `❌ Falha ao pintar (tentativa ${state.retryCount + 1})` 
                        : `❌ Failed to paint (attempt ${state.retryCount + 1})`, 'error');
                    state.retryCount++;
                }

                await sleep(CONFIG.DELAY);
                updateStats();

            } catch (e) {
                logger.error('Critical error in paint loop', e);
                await sleep(5000);
            }
        }

        logger.log('Painting loop stopped');
    };

    // UI functions
    function createUI() {
        if (state.menuOpen) return;
        state.menuOpen = true;

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(76, 175, 80, 0); }
                100% { box-shadow: 0 0 0 0 rgba(76, 175, 80, 0); }
            }
            @keyframes slideIn {
                from { transform: translateY(20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            .wplace-bot-panel {
                position: fixed;
                top: 20px;
                right: 20px;
                width: 300px;
                background: ${CONFIG.THEME.primary};
                border: 2px solid ${CONFIG.THEME.accent};
                border-radius: 10px;
                padding: 0;
                box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                z-index: 9999;
                font-family: 'Segoe UI', Roboto, sans-serif;
                color: ${CONFIG.THEME.text};
                animation: slideIn 0.4s ease-out;
                overflow: hidden;
            }
            .wplace-header {
                padding: 12px 15px;
                background: ${CONFIG.THEME.secondary};
                color: ${CONFIG.THEME.highlight};
                font-size: 16px;
                font-weight: 600;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: move;
                user-select: none;
            }
            .wplace-header-title {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .wplace-header-controls {
                display: flex;
                gap: 10px;
            }
            .wplace-header-btn {
                background: none;
                border: none;
                color: ${CONFIG.THEME.text};
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            .wplace-header-btn:hover {
                opacity: 1;
            }
            .wplace-content {
                padding: 15px;
                display: ${state.minimized ? 'none' : 'block'};
            }
            .wplace-controls {
                display: flex;
                gap: 10px;
                margin-bottom: 15px;
            }
            .wplace-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: 6px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            }
            .wplace-btn:hover {
                transform: translateY(-2px);
            }
            .wplace-btn-primary {
                background: ${CONFIG.THEME.accent};
                color: white;
            }
            .wplace-btn-stop {
                background: ${CONFIG.THEME.error};
                color: white;
            }
            .wplace-stats {
                background: ${CONFIG.THEME.secondary};
                padding: 12px;
                border-radius: 6px;
                margin-bottom: 15px;
            }
            .wplace-stat-item {
                display: flex;
                justify-content: space-between;
                padding: 6px 0;
                font-size: 14px;
            }
            .wplace-stat-label {
                display: flex;
                align-items: center;
                gap: 6px;
                opacity: 0.8;
            }
            .wplace-status {
                padding: 8px;
                border-radius: 4px;
                text-align: center;
                font-size: 13px;
                margin-top: 10px;
            }
            .status-default {
                background: rgba(255,255,255,0.1);
            }
            .status-success {
                background: rgba(76, 175, 80, 0.1);
                color: ${CONFIG.THEME.success};
            }
            .status-error {
                background: rgba(244, 67, 54, 0.1);
                color: ${CONFIG.THEME.error};
            }
            #paintEffect {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                border-radius: 8px;
            }
            .debug-info {
                font-size: 12px;
                opacity: 0.7;
                margin-top: 10px;
                word-break: break-all;
            }
        `;
        document.head.appendChild(style);

        // Translations
        const translations = {
            pt: {
                title: "WPlace Auto-Farm",
                start: "Iniciar",
                stop: "Parar",
                ready: "Pronto para começar",
                user: "Usuário",
                pixels: "Pixels",
                charges: "Cargas",
                level: "Nível",
                debug: "Modo Debug"
            },
            en: {
                title: "WPlace Auto-Farm",
                start: "Start",
                stop: "Stop",
                ready: "Ready to start",
                user: "User",
                pixels: "Pixels",
                charges: "Charges",
                level: "Level",
                debug: "Debug Mode"
            }
        };

        const t = translations[state.language] || translations.en;

        // Create panel
        const panel = document.createElement('div');
        panel.className = 'wplace-bot-panel';
        panel.innerHTML = `
            <div id="paintEffect"></div>
            <div class="wplace-header">
                <div class="wplace-header-title">
                    <i class="fas fa-robot"></i>
                    <span>${t.title}</span>
                </div>
                <div class="wplace-header-controls">
                    <button id="minimizeBtn" class="wplace-header-btn" title="${state.language === 'pt' ? 'Minimizar' : 'Minimize'}">
                        <i class="fas fa-${state.minimized ? 'expand' : 'minus'}"></i>
                    </button>
                </div>
            </div>
            <div class="wplace-content">
                <div class="wplace-controls">
                    <button id="toggleBtn" class="wplace-btn wplace-btn-primary">
                        <i class="fas fa-play"></i>
                        <span>${t.start}</span>
                    </button>
                </div>
                
                <div class="wplace-stats">
                    <div id="statsArea">
                        <div class="wplace-stat-item">
                            <div class="wplace-stat-label"><i class="fas fa-circle-notch fa-spin"></i> ${state.language === 'pt' ? 'Carregando...' : 'Loading...'}</div>
                        </div>
                    </div>
                </div>
                
                <div id="statusText" class="wplace-status status-default">
                    ${t.ready}
                </div>
                
                ${CONFIG.DEBUG ? `<div class="debug-info">Debug Mode: ON</div>` : ''}
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // Make panel draggable
        const header = panel.querySelector('.wplace-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        header.onmousedown = dragMouseDown;
        
        function dragMouseDown(e) {
            if (e.target.closest('.wplace-header-btn')) return;
            
            e = e || window.event;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        
        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            panel.style.top = (panel.offsetTop - pos2) + "px";
            panel.style.left = (panel.offsetLeft - pos1) + "px";
        }
        
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
        
        // Add controls
        const toggleBtn = panel.querySelector('#toggleBtn');
        const minimizeBtn = panel.querySelector('#minimizeBtn');
        const content = panel.querySelector('.wplace-content');
        
        toggleBtn.addEventListener('click', () => {
            state.running = !state.running;
            
            if (state.running) {
                toggleBtn.innerHTML = `<i class="fas fa-stop"></i> <span>${t.stop}</span>`;
                toggleBtn.classList.remove('wplace-btn-primary');
                toggleBtn.classList.add('wplace-btn-stop');
                updateUI(state.language === 'pt' ? '🚀 Pintura iniciada!' : '🚀 Painting started!', 'success');
                paintLoop();
            } else {
                toggleBtn.innerHTML = `<i class="fas fa-play"></i> <span>${t.start}</span>`;
                toggleBtn.classList.add('wplace-btn-primary');
                toggleBtn.classList.remove('wplace-btn-stop');
                updateUI(state.language === 'pt' ? '⏸️ Pintura pausada' : '⏸️ Painting paused', 'default');
            }
        });
        
        minimizeBtn.addEventListener('click', () => {
            state.minimized = !state.minimized;
            content.style.display = state.minimized ? 'none' : 'block';
            minimizeBtn.innerHTML = `<i class="fas fa-${state.minimized ? 'expand' : 'minus'}"></i>`;
        });
    }

    // UI update functions
    function updateUI(message, type = 'default') {
        const statusText = document.querySelector('#statusText');
        if (statusText) {
            statusText.textContent = message;
            statusText.className = `wplace-status status-${type}`;
            statusText.style.animation = 'none';
            void statusText.offsetWidth;
            statusText.style.animation = 'slideIn 0.3s ease-out';
        }
    }

    async function updateStats() {
        await getCharge();
        const statsArea = document.querySelector('#statsArea');
        if (statsArea) {
            const t = {
                pt: {
                    user: "Usuário",
                    pixels: "Pixels",
                    charges: "Cargas",
                    level: "Nível"
                },
                en: {
                    user: "User",
                    pixels: "Pixels",
                    charges: "Charges",
                    level: "Level"
                }
            }[state.language] || translations.en;

            statsArea.innerHTML = `
                <div class="wplace-stat-item">
                    <div class="wplace-stat-label"><i class="fas fa-user"></i> ${t.user}</div>
                    <div>${state.userInfo?.name || 'N/A'}</div>
                </div>
                <div class="wplace-stat-item">
                    <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> ${t.pixels}</div>
                    <div>${state.paintedCount}</div>
                </div>
                <div class="wplace-stat-item">
                    <div class="wplace-stat-label"><i class="fas fa-bolt"></i> ${t.charges}</div>
                    <div>${Math.floor(state.charges.count)}/${Math.floor(state.charges.max)}</div>
                </div>
                <div class="wplace-stat-item">
                    <div class="wplace-stat-label"><i class="fas fa-star"></i> ${t.level}</div>
                    <div>${state.userInfo?.level || '0'}</div>
                </div>
            `;
        }
    }

    // Initialization
    async function init() {
        logger.log('Initializing WPlace Auto-Painter');
        
        // Load Font Awesome
        const fontAwesome = document.createElement('link');
        fontAwesome.rel = 'stylesheet';
        fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
        document.head.appendChild(fontAwesome);
        
        // Check if user is logged in
        try {
            const me = await fetchAPI('https://backend.wplace.live/me');
            if (!me || !me.name) {
                logger.error('User not authenticated');
                updateUI('Please login first!', 'error');
                return;
            }
            
            state.userInfo = me;
            logger.log(`Authenticated as: ${me.name}`);
            
            // Detect language
            if (navigator.language.startsWith('pt')) {
                state.language = 'pt';
            }
            
            // Create UI
            createUI();
            await getCharge();
            updateStats();
            
            logger.log('Initialization complete');
            updateUI(state.language === 'pt' ? 'Pronto para começar!' : 'Ready to start!', 'success');
            
        } catch (e) {
            logger.error('Initialization failed', e);
            updateUI('Initialization failed!', 'error');
        }
    }

    // Start the script
    init();
})();
