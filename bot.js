(async () => {
  // Конфигурация
  const CONFIG = {
    START_X: 742,
    START_Y: 1148,
    PIXELS_PER_LINE: 100,
    DELAY: 1000,
    THEME: {
      primary: '#000000',
      secondary: '#111111',
      accent: '#222222',
      text: '#ffffff',
      highlight: '#775ce3',
      success: '#00ff00',
      error: '#ff0000'
    },
    PALETTE: {
      "0,0,0": 1, "60,60,60": 2, "120,120,120": 3, "210,210,210": 4, "255,255,255": 5,
      "96,0,24": 6, "237,28,36": 7, "255,127,39": 8, "246,170,9": 9, "249,221,59": 10,
      // ... (остальные цвета палитры)
    }
  };

  // Состояние приложения
  const state = {
    running: false,
    paintedCount: 0,
    charges: { count: 0, max: 80, cooldownMs: 30000 },
    userInfo: null,
    lastPixel: null,
    minimized: false,
    menuOpen: false,
    language: 'en',
    template: null,
    tileData: null,
    cookie: null
  };

  // Вспомогательные функции
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const duration = (durationMs) => {
    const seconds = Math.floor((durationMs / 1000) % 60);
    const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const parts = [];
    if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    if (seconds || parts.length === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
    return parts.join(' ');
  };

  // API функции
  const fetchAPI = async (url, options = {}) => {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...options.headers
        },
        ...options
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        return {
          error: true,
          status: res.status,
          message: errorData?.message || `HTTP error ${res.status}`
        };
      }
      
      return await res.json();
    } catch (e) {
      return {
        error: true,
        message: 'Network error'
      };
    }
  };

  // Функции для работы с пикселями
  const getRandomPosition = () => ({
    x: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
    y: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE)
  });

  const paintPixel = async (x, y, color) => {
    const absX = CONFIG.START_X + x;
    const absY = CONFIG.START_Y + y;
    const chunkX = Math.floor(absX / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;
    const chunkY = Math.floor(absY / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;
    const relX = absX - chunkX;
    const relY = absY - chunkY;

    return await fetchAPI(`https://backend.wplace.live/s0/pixel/${chunkX}/${chunkY}`, {
      method: 'POST',
      body: JSON.stringify({
        coords: [relX, relY],
        colors: [color || Math.floor(Math.random() * 31) + 1]
      })
    });
  };

  const loadTileData = async () => {
    const chunkX = Math.floor(CONFIG.START_X / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;
    const chunkY = Math.floor(CONFIG.START_Y / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;
    
    const response = await fetch(`https://backend.wplace.live/files/s0/tiles/${chunkX}/${chunkY}.png`);
    const blob = await response.blob();
    const img = await createImageBitmap(blob);
    
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    
    const tileData = Array.from({ length: img.width }, () => new Array(img.height).fill(0));
    
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const i = (y * img.width + x) * 4;
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];
        
        if (a === 255) {
          const colorKey = `${r},${g},${b}`;
          tileData[x][y] = CONFIG.PALETTE[colorKey] || 0;
        }
      }
    }
    
    state.tileData = tileData;
    return tileData;
  };

  // Функции пользователя
  const getCharge = async () => {
    const data = await fetchAPI('https://backend.wplace.live/s0/me');
    if (data && !data.error) {
      state.userInfo = data;
      state.charges = {
        count: Math.floor(data.charges?.count || 0),
        max: Math.floor(data.charges?.max || 0),
        cooldownMs: data.charges?.cooldownMs || 30000
      };
      if (state.userInfo.level) {
        state.userInfo.level = Math.floor(state.userInfo.level);
      }
    }
    return state.charges;
  };

  const detectUserLocation = () => {
    const browserLang = navigator.language || navigator.userLanguage;
    state.language = browserLang.startsWith('pt') ? 'pt' : 'en';
  };

  // Основной цикл рисования
  const paintLoop = async () => {
    while (state.running) {
      const { count, cooldownMs } = state.charges;
      
      if (count < 1) {
        updateUI(state.language === 'pt' 
          ? `⌛ Sem cargas. Esperando ${Math.ceil(cooldownMs/1000)}s...` 
          : `⌛ No charges. Waiting ${Math.ceil(cooldownMs/1000)}s...`, 
        'status');
        await sleep(cooldownMs);
        await getCharge();
        continue;
      }

      // Если есть шаблон - рисуем по нему
      if (state.template) {
        await paintTemplate();
      } 
      // Иначе - случайные пиксели
      else {
        const randomPos = getRandomPosition();
        const paintResult = await paintPixel(randomPos.x, randomPos.y);
        
        if (paintResult?.painted === 1) {
          state.paintedCount++;
          state.lastPixel = { 
            x: CONFIG.START_X + randomPos.x,
            y: CONFIG.START_Y + randomPos.y,
            time: new Date() 
          };
          state.charges.count--;
          
          document.getElementById('paintEffect').style.animation = 'pulse 0.5s';
          setTimeout(() => {
            document.getElementById('paintEffect').style.animation = '';
          }, 500);
          
          updateUI(state.language === 'pt' ? '✅ Pixel pintado!' : '✅ Pixel painted!', 'success');
        } else {
          let errorMsg = state.language === 'pt' ? '❌ Falha ao pintar' : '❌ Failed to paint';
          if (paintResult?.status === 403) {
            errorMsg = state.language === 'pt' 
              ? '❌ Proibido (sem autorização?)' 
              : '❌ Forbidden (unauthorized?)';
          }
          else if (paintResult?.message) {
            errorMsg = `❌ ${paintResult.message}`;
          }
          updateUI(errorMsg, 'error');
        }
      }

      await sleep(CONFIG.DELAY);
      updateStats();
    }
  };

  // Функции для работы с шаблонами
  const setTemplate = (template) => {
    state.template = template;
  };

  const paintTemplate = async () => {
    if (!state.template || !state.tileData) return 0;
    
    const body = { colors: [], coords: [] };
    let pixelsUsed = 0;
    
    for (let y = 0; y < state.template.height; y++) {
      for (let x = 0; x < state.template.width; x++) {
        const templateColor = state.template.data[x][y];
        const currentColor = state.tileData[CONFIG.START_X + x][CONFIG.START_Y + y];
        
        if (templateColor !== 0 && templateColor !== currentColor) {
          body.colors.push(templateColor);
          body.coords.push(x, y);
          pixelsUsed++;
          
          if (pixelsUsed >= state.charges.count) break;
        }
      }
      if (pixelsUsed >= state.charges.count) break;
    }
    
    if (pixelsUsed > 0) {
      const result = await paintArea(body);
      if (result?.painted === pixelsUsed) {
        state.paintedCount += pixelsUsed;
        return pixelsUsed;
      }
    }
    
    return 0;
  };

  const paintArea = async (body) => {
    const chunkX = Math.floor(CONFIG.START_X / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;
    const chunkY = Math.floor(CONFIG.START_Y / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;
    
    return await fetchAPI(`https://backend.wplace.live/s0/pixel/${chunkX}/${chunkY}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  };

  const createUI = () => {
    if (state.menuOpen) return;
    state.menuOpen = true;

    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fontAwesome);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0.7); }
        70% { box-shadow: 0 0 0 10px rgba(0, 255, 0, 0); }
        100% { box-shadow: 0 0 0 0 rgba(0, 255, 0, 0); }
      }
      @keyframes slideIn {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .wplace-bot-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 250px;
        background: ${CONFIG.THEME.primary};
        border: 1px solid ${CONFIG.THEME.accent};
        border-radius: 8px;
        padding: 0;
        box-shadow: 0 5px 15px rgba(0,0,0,0.5);
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
      }
      .status-default {
        background: rgba(255,255,255,0.1);
      }
      .status-success {
        background: rgba(0, 255, 0, 0.1);
        color: ${CONFIG.THEME.success};
      }
      .status-error {
        background: rgba(255, 0, 0, 0.1);
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
    `;
    document.head.appendChild(style);

    const translations = {
      pt: {
        title: "WPlace Auto-Farm",
        start: "Iniciar",
        stop: "Parar",
        ready: "Pronto para começar",
        user: "Usuário",
        pixels: "Pixels",
        charges: "Cargas",
        level: "Level"
      },
      en: {
        title: "WPlace Auto-Farm",
        start: "Start",
        stop: "Stop",
        ready: "Ready to start",
        user: "User",
        pixels: "Pixels",
        charges: "Charges",
        level: "Level"
      }
    };

    const t = translations[state.language] || translations.en;

    const panel = document.createElement('div');
    panel.className = 'wplace-bot-panel';
    panel.innerHTML = `
      <div id="paintEffect"></div>
      <div class="wplace-header">
        <div class="wplace-header-title">
          <i class="fas fa-paint-brush"></i>
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
              <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> ${state.language === 'pt' ? 'Carregando...' : 'Loading...'}</div>
            </div>
          </div>
        </div>
        
        <div id="statusText" class="wplace-status status-default">
          ${t.ready}
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    
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
    
    const toggleBtn = panel.querySelector('#toggleBtn');
    const minimizeBtn = panel.querySelector('#minimizeBtn');
    const statusText = panel.querySelector('#statusText');
    const content = panel.querySelector('.wplace-content');
    const statsArea = panel.querySelector('#statsArea');
    
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
    
    window.addEventListener('beforeunload', () => {
      state.menuOpen = false;
    });
  };

  window.updateUI = (message, type = 'default') => {
    const statusText = document.querySelector('#statusText');
    if (statusText) {
      statusText.textContent = message;
      statusText.className = `wplace-status status-${type}`;
      statusText.style.animation = 'none';
      void statusText.offsetWidth;
      statusText.style.animation = 'slideIn 0.3s ease-out';
    }
  };

  window.updateStats = async () => {
    await getCharge();
    const statsArea = document.querySelector('#statsArea');
    if (statsArea) {
      const t = {
        pt: {
          user: "Usuário",
          pixels: "Pixels",
          charges: "Cargas",
          level: "Level"
        },
        en: {
          user: "User",
          pixels: "Pixels",
          charges: "Charges",
          level: "Level"
        }
      }[state.language] || {
        user: "User",
        pixels: "Pixels",
        charges: "Charges",
        level: "Level"
      };

      statsArea.innerHTML = `
        <div class="wplace-stat-item">
          <div class="wplace-stat-label"><i class="fas fa-user"></i> ${t.user}</div>
          <div>${state.userInfo.name}</div>
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
  };

  detectUserLocation();
  createUI();
  await getCharge();
  await loadTileData();
  updateStats();
})();
