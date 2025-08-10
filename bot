(async () => {
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
    language: 'en',
    debugMode: true // Добавлен режим отладки
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const logError = (errorType, details) => {
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] ERROR: ${errorType} | ${JSON.stringify(details)}`;
    console.error(message);
    if (state.debugMode) {
      updateUI(`${errorType} (см. консоль)`, 'error');
    }
    return message;
  };

  const fetchAPI = async (url, options = {}) => {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        ...options
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      
      const data = await res.json();
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
    } catch (e) {
      logError('API_REQUEST_FAILED', {
        url,
        error: e.message,
        stack: e.stack
      });
      return null;
    }
  };

  const getRandomPosition = () => ({
    x: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE),
    y: Math.floor(Math.random() * CONFIG.PIXELS_PER_LINE)
  });

  const paintPixel = async (x, y) => {
    const randomColor = Math.floor(Math.random() * 31) + 1;
    const payload = { coords: [x, y], colors: [randomColor] };
    
    try {
      const response = await fetchAPI(`https://backend.wplace.live/s0/pixel/${CONFIG.START_X}/${CONFIG.START_Y}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(payload)
      });
      
      if (!response) {
        throw new Error('No response from server');
      }
      
      if (response.painted !== 1) {
        throw new Error(`Server rejected painting. Response: ${JSON.stringify(response)}`);
      }
      
      return response;
    } catch (e) {
      logError('PAINT_FAILED', {
        coords: {x, y},
        color: randomColor,
        error: e.message,
        payload
      });
      return null;
    }
  };

  const getCharge = async () => {
    try {
      const data = await fetchAPI('https://backend.wplace.live/me');
      
      if (!data) {
        throw new Error('Failed to fetch user data');
      }
      
      state.userInfo = data;
      state.charges = {
        count: Math.floor(data.charges.count),
        max: Math.floor(data.charges.max),
        cooldownMs: data.charges.cooldownMs
      };
      
      if (state.userInfo.level) {
        state.userInfo.level = Math.floor(state.userInfo.level);
      }
      
      return state.charges;
    } catch (e) {
      logError('CHARGE_FETCH_FAILED', {
        error: e.message
      });
      return null;
    }
  };

  // ... (остальные функции остаются такими же, как в предыдущей версии)

  const paintLoop = async () => {
    while (state.running) {
      const charges = await getCharge();
      
      if (!charges) {
        await sleep(5000);
        continue;
      }
      
      const { count, cooldownMs } = charges;
      
      if (count < 1) {
        const waitTime = Math.ceil(cooldownMs/1000);
        updateUI(state.language === 'pt' 
          ? `⌛ Sem cargas. Esperando ${waitTime}s...` 
          : `⌛ No charges. Waiting ${waitTime}s...`, 'status');
        await sleep(cooldownMs);
        continue;
      }

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
        
        updateUI(state.language === 'pt' 
          ? `✅ Pixel pintado! (${randomPos.x},${randomPos.y})` 
          : `✅ Pixel painted! (${randomPos.x},${randomPos.y})`, 'success');
      } else {
        updateUI(state.language === 'pt' 
          ? '❌ Falha ao pintar (ver console)' 
          : '❌ Failed to paint (see console)', 'error');
      }

      await sleep(CONFIG.DELAY);
      updateStats();
    }
  };

  // ... (остальной код UI остается без изменений)

  await detectUserLocation();
  createUI();
  await getCharge();
  updateStats();
  
  console.log('Bot initialized in debug mode. All errors will be logged to console.');
})();
