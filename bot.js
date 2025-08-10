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
    debugMode: true
  };

  // Улучшенное логирование
  const logger = {
    log: (...args) => console.log('[BOT]', ...args),
    error: (...args) => {
      console.error('[BOT ERROR]', ...args);
      updateUI(`Error: ${args[0]} (see console)`, 'error');
    },
    debug: (...args) => state.debugMode && console.debug('[BOT DEBUG]', ...args)
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const fetchAPI = async (url, options = {}) => {
    try {
      logger.debug(`Fetching URL: ${url}`, options);
      
      const res = await fetch(url, {
        credentials: 'include',
        ...options
      });
      
      logger.debug(`Response status: ${res.status}`, res);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      
      const data = await res.json();
      logger.debug('API response:', data);
      
      if (data?.error) {
        throw new Error(`API Error: ${data.error}`);
      }
      
      return data;
    } catch (e) {
      logger.error(`API request failed to ${url}`, {
        error: e.message,
        stack: e.stack,
        options
      });
      return null;
    }
  };

  const paintPixel = async (x, y) => {
    const randomColor = Math.floor(Math.random() * 31) + 1;
    const payload = { 
      coords: [x, y], 
      colors: [randomColor],
      timestamp: Date.now()
    };
    
    logger.debug('Attempting to paint pixel:', payload);
    
    try {
      const response = await fetchAPI(
        `https://backend.wplace.live/s0/pixel/${CONFIG.START_X}/${CONFIG.START_Y}`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'text/plain;charset=UTF-8',
            'X-Debug-Request': 'true'
          },
          body: JSON.stringify(payload)
        }
      );
      
      if (!response) {
        throw new Error('No response from server');
      }
      
      logger.debug('Paint response:', response);
      
      if (response.painted !== 1) {
        throw new Error(`Paint rejected. Full response: ${JSON.stringify(response)}`);
      }
      
      return response;
    } catch (e) {
      logger.error(`Failed to paint at (${x},${y})`, {
        error: e.message,
        payload,
        charges: state.charges,
        auth: !!document.cookie
      });
      return null;
    }
  };

  // Остальные функции (getCharge, paintLoop, UI) остаются аналогичными предыдущему примеру,
  // но с использованием logger вместо прямых console.log

  // Добавим проверку авторизации
  const checkAuth = async () => {
    try {
      logger.debug('Checking authentication...');
      const res = await fetch('https://backend.wplace.live/me', {
        credentials: 'include'
      });
      
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      
      const data = await res.json();
      logger.log('User authenticated as:', data.name);
      return true;
    } catch (e) {
      logger.error('Authentication failed!', e.message);
      updateUI('ERROR: Not authenticated!', 'error');
      return false;
    }
  };

  // Инициализация
  const init = async () => {
    logger.log('Initializing bot...');
    
    if (!await checkAuth()) {
      logger.error('Cannot start without authentication');
      return;
    }
    
    await detectUserLocation();
    createUI();
    await getCharge();
    updateStats();
    
    logger.log('Bot initialized successfully');
    updateUI('Ready to start', 'success');
  };

  init();
})();
