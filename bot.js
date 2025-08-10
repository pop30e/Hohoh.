(async () => {
const CONFIG = {
START_X: 742, // абсолютная X-координата верхнего левого угла вашей области
START_Y: 1148, // абсолютная Y-координата верхнего левого угла вашей области
PIXELS_PER_LINE: 100, // размер чанка (обычно 100)
DELAY: 1000, // задержка между попытками
THEME: {
primary: '#000000',
secondary: '#111111',
accent: '#222222',
text: '#ffffff',
highlight: '#775ce3',
success: '#00ff00',
error: '#ff0000'
}
};

const state = {
running: false,
paintedCount: 0,
charges: { count: 0, max: 80, cooldownMs: 30000 },
userInfo: null,
lastPixel: null,
minimized: false,
menuOpen: false,
language: 'en'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

const fetchAPI = async (url, options = {}) => {
try {
const res = await fetch(url, {
credentials: 'include',
redirect: 'follow',
...options
});
const text = await res.text();
let data = null;
try {
data = text ? JSON.parse(text) : null;
} catch {
data = text || null;
}
if (!res.ok) {
console.warn('Request failed', {
url,
status: res.status,
statusText: res.statusText,
response: data
});
}
return data;
} catch (e) {
console.error('Network error', e);
return null;
}
};

const getRandomPosition = () => ({
x: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE), // 0..99
y: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE) // 0..99
});

// ВАЖНО: считаем чанк динамически от абсолютной точки,
// чтобы не выходить за границы чанка при смещении
const paintPixel = async (x, y) => {
// Цвет случайно из 0..31 (если у сервера 1..31 — поменяйте на +1)
const randomColor = Math.floor(Math.random() * 32); // 0..31

// Абсолютные координаты пикселя, который хотим поставить
const absX = CONFIG.START_X + x;
const absY = CONFIG.START_Y + y;

// Координаты чанка (кратны PIXELS_PER_LINE)
const chunkX = Math.floor(absX / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;
const chunkY = Math.floor(absY / CONFIG.PIXELS_PER_LINE) * CONFIG.PIXELS_PER_LINE;

// Относительные координаты внутри чанка
const relX = absX - chunkX; // 0..99
const relY = absY - chunkY; // 0..99

return await fetchAPI(`https://backend.wplace.live/s0/pixel/${chunkX}/${chunkY}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
    // Если у сервера есть CSRF, возможно, нужен X-CSRF-Token — проверьте в DevTools/странице
  },
  body: JSON.stringify({
    coords: [relX, relY],
    colors: [randomColor]
  })
});
};

const getCharge = async () => {
const data = await fetchAPI('https://backend.wplace.live/s0/me'), {
method: 'POST',
headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
body: JSON.stringify({ coords: [x, y], colors: [randomColor] })
});
if (data && typeof data === 'object') {
state.userInfo = data || state.userInfo;
if (data.charges) {
state.charges = {
count: Math.floor(data.charges.count ?? state.charges.count ?? 0),
max: Math.floor(data.charges.max ?? state.charges.max ?? 0),
cooldownMs: data.charges.cooldownMs ?? state.charges.cooldownMs ?? 30000
};
}
if (state.userInfo?.level != null) {
state.userInfo.level = Math.floor(state.userInfo.level);
}
}
return state.charges;
};

const detectUserLocation = async () => {
try {
const response = await fetch('https://ipapi.co/json/'');
const data = await response.json();
if (data.country === 'BR') {
state.language = 'pt';
} else if (data.country === 'US') {
state.language = 'en';
} else {
state.language = 'en';
}
} catch {
state.language = 'en';
}
};

const paintLoop = async () => {
while (state.running) {
const { count, cooldownMs } = state.charges;

  if (count < 1) {
    updateUI(
      state.language === 'pt'
        ? `⌛ Sem cargas. Esperando ${Math.ceil(cooldownMs / 1000)}s...`
        : `⌛ No charges. Waiting ${Math.ceil(cooldownMs / 1000)}s...`,
      'status'
    );
    await sleep(cooldownMs);
    await getCharge();
    continue;
  }

  const randomPos = getRandomPosition();
  const paintResult = await paintPixel(randomPos.x, randomPos.y);

  // Ожидаем, что успешный ответ содержит { painted: 1 }
  if (paintResult && typeof paintResult === 'object' && paintResult.painted === 1) {
    state.paintedCount++;
    state.lastPixel = {
      x: CONFIG.START_X + randomPos.x,
      y: CONFIG.START_Y + randomPos.y,
      time: new Date()
    };
    state.charges.count = Math.max(0, (state.charges.count || 1) - 1);

    const pe = document.getElementById('paintEffect');
    if (pe) {
      pe.style.animation = 'pulse 0.5s';
      setTimeout(() => {
        pe.style.animation = '';
      }, 500);
    }

    updateUI(state.language === 'pt' ? '✅ Pixel pintado!' : '✅ Pixel painted!', 'success');
  } else {
    // Выведем причину (если сервер прислал message)
    const msg =
      (paintResult && paintResult.message) ||
      (paintResult && paintResult.error) ||
      (typeof paintResult === 'string' ? paintResult : null) ||
      (state.language === 'pt' ? 'Falha ao pintar' : 'Failed to paint');

    updateUI(`❌ ${msg}`, 'error');
    console.warn('Paint failed detail:', paintResult);
  }

  await sleep(CONFIG.DELAY);
  updateStats();
}
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
  .wplace-header-btn:hover { opacity: 1; }
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
  .wplace-btn:hover { transform: translateY(-2px); }
  .wplace-btn-primary { background: ${CONFIG.THEME.accent}; color: white; }
  .wplace-btn-stop { background: ${CONFIG.THEME.error}; color: white; }
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
  .status-default { background: rgba(255,255,255,0.1); }
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
    top: 0; left: 0;
    width: 100%; height: 100%;
    pointer-events: none;
    border-radius: 8px;
  }
`;
document.head.appendChild(style);

const translations = {
  pt: {
    title: "Sunaz Auto-Farm",
    start: "Iniciar",
    stop: "Parar",
    ready: "Pronto para começar",
    user: "Usuário",
    pixels: "Pixels",
    charges: "Cargas",
    level: "Level"
  },
  en: {
    title: "Sunaz Auto-Farm",
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

// Drag
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

// Controls
const toggleBtn = panel.querySelector('#toggleBtn');
const minimizeBtn = panel.querySelector('#minimizeBtn');
const content = panel.querySelector('.wplace-content');

toggleBtn.addEventListener('click', () => {
  state.running = !state.running;

  const translations = {
    start: state.language === 'pt' ? 'Iniciar' : 'Start',
    stop: state.language === 'pt' ? 'Parar' : 'Stop',
    started: state.language === 'pt' ? '🚀 Pintura iniciada!' : '🚀 Painting started!',
    paused: state.language === 'pt' ? '⏸️ Pintura pausada' : '⏸️ Painting paused'
  };

  if (state.running) {
    toggleBtn.innerHTML = `<i class="fas fa-stop"></i> <span>${translations.stop}</span>`;
    toggleBtn.classList.remove('wplace-btn-primary');
    toggleBtn.classList.add('wplace-btn-stop');
    updateUI(translations.started, 'success');
    paintLoop();
  } else {
    toggleBtn.innerHTML = `<i class="fas fa-play"></i> <span>${translations.start}</span>`;
    toggleBtn.classList.add('wplace-btn-primary');
    toggleBtn.classList.remove('wplace-btn-stop');
    updateUI(translations.paused, 'default');
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
statusText.className = wplace-status status-${type};
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
pt: { user: "Usuário", pixels: "Pixels", charges: "Cargas", level: "Level" },
en: { user: "User", pixels: "Pixels", charges: "Charges", level: "Level" }
}[state.language] || { user: "User", pixels: "Pixels", charges: "Charges", level: "Level" };

  statsArea.innerHTML = `
    <div class="wplace-stat-item">
      <div class="wplace-stat-label"><i class="fas fa-user"></i> ${t.user}</div>
      <div>${state.userInfo?.name ?? '-'}</div>
    </div>
    <div class="wplace-stat-item">
      <div class="wplace-stat-label"><i class="fas fa-paint-brush"></i> ${t.pixels}</div>
      <div>${state.paintedCount}</div>
    </div>
    <div class="wplace-stat-item">
      <div class="wplace-stat-label"><i class="fas fa-bolt"></i> ${t.charges}</div>
      <div>${Math.floor(state.charges.count || 0)}/${Math.floor(state.charges.max || 0)}</div>
    </div>
    <div class="wplace-stat-item">
      <div class="wplace-stat-label"><i class="fas fa-star"></i> ${t.level}</div>
      <div>${state.userInfo?.level ?? '0'}</div>
    </div>
  `;
}
};

await detectUserLocation();
createUI();
await getCharge();
updateStats();
})();
