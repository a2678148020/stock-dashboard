/**
 * 股票数据 API 服务
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

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      var timeout = setTimeout(function() {
        cleanup();
        reject(new Error('timeout'));
      }, 8000);
      var script = document.createElement('script');
      function cleanup() {
        clearTimeout(timeout);
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      script.src = url;
      script.onload = function() { cleanup(); resolve(); };
      script.onerror = function() { cleanup(); reject(new Error('load failed')); };
      document.head.appendChild(script);
    });
  }

  // Fetch real-time quotes (CORS-enabled API)
  async function fetchQuotes(codes) {
    if (!codes || codes.length === 0) return {};
    var fullCodes = codes.map(function(c) { return getFullCode(c); });
    var url = BASE_URL + fullCodes.join(',');
    try {
      window._debug && _debug("Fetching kline: " + url);
      var resp = await fetch(url);
      window._debug && _debug("Kline status: " + resp.status);
      var text = await resp.text();
      window._debug && _debug("Kline response len: " + text.length);
      return parseQuotes(text);
    } catch (err) {
      console.error('Quotes error:', err);
      return {};
    }
  }

  function parseQuotes(text) {
    var results = {};
    var lines = text.split('\n').filter(function(l) { return l.trim(); });
    for (var i = 0; i < lines.length; i++) {
      try {
        var match = lines[i].match(/v_(\w+)="(.+)"/);
        if (!match) continue;
        var parts = match[2].split('~');
        if (parts.length < 50) continue;
        results[parts[2]] = {
          code: parts[2], name: parts[1], fullCode: match[1],
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
          pb: parseFloat(parts[46]) || 0
        };
      } catch (e) {}
    }
    return results;
  }

  // Fetch K-line: try script injection, fallback to fetch
  // Fetch K-line data (CORS-enabled API)
  async function fetchKline(code, days) {
    window._debug && _debug("fetchKline called: " + code);
    days = days || 120;
    var fullCode = getFullCode(code);
    var market = fullCode.slice(0, 2);
    var pureCode = fullCode.slice(2);
    var url = KLINE_URL + '?_var=kline_dayqfq&param=' + market + pureCode + ',day,,,' + days + ',qfq';
    try {
      window._debug && _debug("Fetching kline: " + url);
      var resp = await fetch(url);
      window._debug && _debug("Kline status: " + resp.status);
      var text = await resp.text();
      window._debug && _debug("Kline response len: " + text.length);
      var match = text.match(/=(\{.+\})/s);
      if (!match) return [];
      var data = JSON.parse(match[1]);
      if (data.code !== 0 || !data.data || !data.data[pureCode]) return [];
      var klineData = data.data[pureCode];
      var dayData = klineData.qfqday || klineData.day || [];
      return dayData.map(function(d) {
        return { date: d[0], open: parseFloat(d[1]), close: parseFloat(d[2]), high: parseFloat(d[3]), low: parseFloat(d[4]), volume: parseFloat(d[5]) };
      });
    } catch (e) {
      console.error('Kline fetch error:', e);
      return [];
    }
  }

  function parseKlineData(dayData) {
    return dayData.map(function(d) {
      return { date: d[0], open: parseFloat(d[1]), close: parseFloat(d[2]), high: parseFloat(d[3]), low: parseFloat(d[4]), volume: parseFloat(d[5]) };
    });
  }

  // Search: code=direct, name=smartbox API
  async function searchStock(keyword) {
    try {
      window.v_hint = null;
      await loadScript('https://smartbox.gtimg.cn/s3/?v=2&q=' + encodeURIComponent(keyword) + '&t=all');
      var hint = window.v_hint || '';
      delete window.v_hint;
      if (!hint) return [];
      var items = hint.split('^');
      var results = [];
      for (var i = 0; i < items.length; i++) {
        var parts = items[i].split('~');
        if (parts.length >= 3 && (parts[0] === 'sh' || parts[0] === 'sz')) {
          results.push({ code: parts[1], name: parts[2], market: parts[0] });
        }
      }
      return results.slice(0, 10);
    } catch (e) {
      console.error('Search error:', e);
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
