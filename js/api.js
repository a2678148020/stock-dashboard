/**
 * 股票数据 API 服务
 * 数据源: 腾讯财经 API (免费，无需注册)
 */
const StockAPI = (() => {
  const BASE_URL = 'https://qt.gtimg.cn/q=';
  const KLINE_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';

  // Market prefix mapping
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

  /**
   * Fetch real-time quote for one or multiple stocks
   * @param {string[]} codes - Array of stock codes like ['600519', '000858']
   * @returns {Promise<Object>} Parsed stock data
   */
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

        const fullCode = match[1];
        const data = match[2];
        const parts = data.split('~');

        if (parts.length < 50) continue;

        const code = parts[2];
        const name = parts[1];
        const currentPrice = parseFloat(parts[3]) || 0;
        const prevClose = parseFloat(parts[4]) || 0;
        const open = parseFloat(parts[5]) || 0;
        const volume = parseFloat(parts[6]) || 0; // 手
        const buy1 = parseFloat(parts[9]) || 0;
        const sell1 = parseFloat(parts[19]) || 0;
        const high = parseFloat(parts[33]) || 0;
        const low = parseFloat(parts[34]) || 0;
        const changeAmount = parseFloat(parts[31]) || 0;
        const changePercent = parseFloat(parts[32]) || 0;
        const turnoverRate = parseFloat(parts[38]) || 0;
        const pe = parseFloat(parts[39]) || 0;
        const amplitude = parseFloat(parts[43]) || 0;
        const circulatingMarketCap = parseFloat(parts[44]) || 0;
        const totalMarketCap = parseFloat(parts[45]) || 0;
        const pb = parseFloat(parts[46]) || 0;

        results[code] = {
          code,
          name,
          fullCode,
          currentPrice,
          prevClose,
          open,
          high,
          low,
          volume,         // 成交量(手)
          buy1,
          sell1,
          changeAmount,
          changePercent,
          turnoverRate,   // 换手率%
          pe,             // 市盈率
          amplitude,      // 振幅%
          circulatingMarketCap,
          totalMarketCap,
          pb,             // 市净率
          timestamp: Date.now()
        };
      } catch (e) {
        console.warn('Parse quote line error:', e);
      }
    }

    return results;
  }

  /**
   * Fetch K-line data for technical indicators
   * @param {string} code - Stock code
   * @param {number} days - Number of days of history
   */
  async function fetchKline(code, days = 120) {
    const fullCode = getFullCode(code);
    const market = fullCode.slice(0, 2);
    const pureCode = fullCode.slice(2);

    const url = `${KLINE_URL}?_var=kline_dayqfq&param=${market}${pureCode},day,,,${days},qfq`;

    try {
      const resp = await fetch(url);
      const text = await resp.text();
      // Extract JSON from variable assignment
      const jsonMatch = text.match(/=(\{.+\})/s);
      if (!jsonMatch) return [];

      const data = JSON.parse(jsonMatch[1]);
      const klineData = data?.data?.[pureCode];

      if (!klineData) return [];

      // Try qfqday first, then day
      const dayData = klineData.qfqday || klineData.day || [];

      return dayData.map(d => ({
        date: d[0],
        open: parseFloat(d[1]),
        close: parseFloat(d[2]),
        high: parseFloat(d[3]),
        low: parseFloat(d[4]),
        volume: parseFloat(d[5])
      }));
    } catch (err) {
      console.error('Fetch kline error:', err);
      return [];
    }
  }

  /**
   * Search stock by code or name
   * Uses a simplified approach - check common patterns
   */
  async function searchStock(keyword) {
    // Use Tencent smartbox API
    const url = `https://smartbox.gtimg.cn/s3/?v=2&q=${encodeURIComponent(keyword)}&t=all`;

    try {
      const resp = await fetch(url);
      const text = await resp.text();
      const match = text.match(/v_hint="(.+)"/);
      if (!match) return [];

      const items = match[1].split('^');
      const results = [];

      for (const item of items) {
        const parts = item.split('~');
        if (parts.length < 5) continue;

        const market = parts[0]; // sh/sz
        const code = parts[1];
        const name = parts[2];
        const type = parts[3]; // GP=股票

        // Only include A-share stocks
        if (type === 'GP' && (market === 'sh' || market === 'sz')) {
          results.push({ code, name, market });
        }
      }

      return results.slice(0, 10);
    } catch (err) {
      console.error('Search error:', err);
      return [];
    }
  }

  /**
   * Format volume for display
   */
  function formatVolume(vol) {
    if (vol >= 10000) return (vol / 10000).toFixed(2) + '万手';
    return vol.toFixed(0) + '手';
  }

  /**
   * Format market cap
   */
  function formatMarketCap(cap) {
    if (cap >= 10000) return (cap / 10000).toFixed(0) + '亿';
    return cap.toFixed(0) + '万';
  }

  return {
    fetchQuotes,
    fetchKline,
    searchStock,
    formatVolume,
    formatMarketCap,
    getFullCode,
    getMarketPrefix
  };
})();
