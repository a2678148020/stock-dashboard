/**
 * 股票数据 API 服务
 * 数据源: 腾讯财经 API (免费，无需注册)
 */
const StockAPI = (() => {
  const BASE_URL = 'https://qt.gtimg.cn/q=';
  const KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';

  function getMarketPrefix(code) {
    code = code.replace(/\s/g, '');
    if (code.startsWith('6') || code.startsWith('5')) return 'sh';
    if (code.startsWith('0') || code.startsWith('3') || code.startsWith('1')) return 'sz';
    if (code.startsWith('8') || code.startsWith('4')) return 'bj';
    return 'sh';
  }

  function getFullCode(code) {
    code = code.replace(/\s/g, '');
    return getMarketPrefix(code) + code;
  }

  // Script injection helper (avoids CORS)
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('script timeout'));
      }, 8000);
      const script = document.createElement('script');
      function cleanup() {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      script.src = url;
      script.onload = function() { cleanup(); resolve(); };
      script.onerror = function() { cleanup(); reject(new Error('script error')); };
      document.head.appendChild(script);
    });
  }

  // Fetch real-time quotes
  async function fetchQuotes(codes) {
    if (!codes || codes.length === 0) return {};
    const fullCodes = codes.map(c => getFullCode(c));
    const url = BASE_URL + fullCodes.join(',');
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      return parseQuotes(text, codes);
    } catch (err) {
      console.error('Fetch quotes error:', err);
      return {};
    }
  }

  function parseQuotes(text, codes) {
    const results = {};
    const lines = text.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const match = line.match(/v_(\w+)="(.+)"/);
        if (!match) continue;
        const data = match[2];
        const parts = data.split('~');
        if (parts.length < 50) continue;
        results[parts[2]] = {
          code: parts[2],
          name: parts[1],
          fullCode: match[1],
          currentPrice: parseFloat(parts[3]) || 0,
          prevClose: parseFloat(parts[4]) || 0,
          open: parseFloat(parts[5]) || 0,
          high: parseFloat(parts[33]) || 0,
          low: parseFloat(parts[34]) || 0,
          volume: parseFloat(parts[6]) || 0,
          changeAmount: parseFloat(parts[31]) || 0,
          changePercent: parseFloat(parts[32]) || 0,
          turnoverRate: parseFloat(parts[38]) || 0,
          pe: parseFloat(parts[39]) || 0,
          amplitude: parseFloat(parts[43]) || 0,
          totalMarketCap: parseFloat(parts[45]) || 0,
          pb: parseFloat(parts[46]) || 0,
          timestamp: Date.now()
        };
      } catch (e) { console.warn('Parse error:', e); }
    }
    return results;
  }

  // Fetch K-line via script injection
  async function fetchKline(code, days) {
    days = days || 120;
    const fullCode = getFullCode(code);
    const market = fullCode.slice(0, 2);
    const pureCode = fullCode.slice(2);
    const varName = 'kline_dayqfq';
    try {
      window[varName] = null;
      await loadScript(KLINE_URL + '?_var=' + varName + '&param=' + market + pureCode + ',day,,,' + days + ',qfq');
      const data = window[varName];
      delete window[varName];
      if (!data || data.code !== 0) return [];
      const klineData = data.data && data.data[pureCode];
      if (!klineData) return [];
      const dayData = klineData.qfqday || klineData.day || [];
      return dayData.map(function(d) {
        return {
          date: d[0],
          open: parseFloat(d[1]),
          close: parseFloat(d[2]),
          high: parseFloat(d[3]),
          low: parseFloat(d[4]),
          volume: parseFloat(d[5])
        };
      });
    } catch (err) {
      console.error('Fetch kline error:', err);
      return [];
    }
  }

  // Search via Tencent smartbox script injection
  async function searchStock(keyword) {
    try {
      window.v_hint = null;
      await loadScript('https://smartbox.gtimg.cn/s3/?v=2&q=' + encodeURIComponent(keyword) + '&t=all');
      var result = window.v_hint || '';
      delete window.v_hint;
      if (!result) return [];
      var items = result.split('^');
      var results = [];
      for (var i = 0; i < items.length; i++) {
        var parts = items[i].split('~');
        if (parts.length < 4) continue;
        var market = parts[0];
        var code = parts[1];
        var name = parts[2];
        var type = parts[3];
        if ((market === 'sh' || market === 'sz') && type && type.indexOf('GP') === 0) {
          results.push({ code: code, name: name, market: market });
        }
      }
      return results.slice(0, 10);
    } catch (err) {
      console.error('Search error:', err);
      if (/^\d{6}$/.test(keyword)) {
        var prefix = keyword.charAt(0) === '6' || keyword.charAt(0) === '5' ? 'sh' : 'sz';
        return [{ code: keyword, name: '', market: prefix }];
      }
      return [];
    }
  }

  function formatVolume(vol) {
    if (vol >= 10000) return (vol / 10000).toFixed(2) + '万手';
    return vol.toFixed(0) + '手';
  }

  function formatMarketCap(cap) {
    if (cap >= 10000) return (cap / 10000).toFixed(0) + '亿';
    return cap.toFixed(0) + '万';
  }

  return {
    fetchQuotes: fetchQuotes,
    fetchKline: fetchKline,
    searchStock: searchStock,
    formatVolume: formatVolume,
    formatMarketCap: formatMarketCap,
    getFullCode: getFullCode,
    getMarketPrefix: getMarketPrefix
  };
})();
