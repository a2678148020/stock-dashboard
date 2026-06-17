/**
 * 本地存储模块
 * 管理持仓数据和设置的持久化
 */
const Storage = (() => {
  const KEYS = {
    holdings: 'stock_dashboard_holdings',
    settings: 'stock_dashboard_settings',
    klineCache: 'stock_dashboard_kline_cache'
  };

  const DEFAULT_SETTINGS = {
    refreshInterval: 30,  // seconds
    macdSensitivity: 'medium',
    kdjThreshold: 'medium'
  };

  // === Holdings ===

  function getHoldings() {
    try {
      const data = localStorage.getItem(KEYS.holdings);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveHoldings(holdings) {
    localStorage.setItem(KEYS.holdings, JSON.stringify(holdings));
  }

  function addHolding(holding) {
    const holdings = getHoldings();
    // Check if already exists
    const existingIdx = holdings.findIndex(h => h.code === holding.code);
    if (existingIdx >= 0) {
      // Update existing
      holdings[existingIdx] = { ...holdings[existingIdx], ...holding };
    } else {
      holdings.push({
        ...holding,
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        addedAt: Date.now()
      });
    }
    saveHoldings(holdings);
    return holdings;
  }

  function removeHolding(code) {
    const holdings = getHoldings().filter(h => h.code !== code);
    saveHoldings(holdings);
    return holdings;
  }

  function updateHolding(code, updates) {
    const holdings = getHoldings();
    const idx = holdings.findIndex(h => h.code === code);
    if (idx >= 0) {
      holdings[idx] = { ...holdings[idx], ...updates };
      saveHoldings(holdings);
    }
    return holdings;
  }

  // === Settings ===

  function getSettings() {
    try {
      const data = localStorage.getItem(KEYS.settings);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
  }

  // === K-line Cache ===

  function getCachedKline(code) {
    try {
      const data = localStorage.getItem(KEYS.klineCache + '_' + code);
      if (!data) return null;

      const cached = JSON.parse(data);
      // Cache valid for 4 hours
      if (Date.now() - cached.timestamp > 4 * 60 * 60 * 1000) return null;
      return cached.data;
    } catch {
      return null;
    }
  }

  function setCachedKline(code, data) {
    localStorage.setItem(KEYS.klineCache + '_' + code, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }

  // === Import/Export ===

  function exportData() {
    return JSON.stringify({
      holdings: getHoldings(),
      settings: getSettings(),
      exportedAt: new Date().toISOString(),
      version: '1.0'
    }, null, 2);
  }

  function importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data.holdings) saveHoldings(data.holdings);
      if (data.settings) saveSettings(data.settings);
      return { success: true, count: data.holdings?.length || 0 };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  return {
    getHoldings,
    saveHoldings,
    addHolding,
    removeHolding,
    updateHolding,
    getSettings,
    saveSettings,
    getCachedKline,
    setCachedKline,
    exportData,
    importData
  };
})();
