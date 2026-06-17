/**
 * 技术指标计算模块
 * MACD, KDJ, RSI, BOLL 等
 */
const Indicators = (() => {

  /**
   * 计算 EMA (指数移动平均)
   */
  function ema(data, period) {
    const result = [];
    const multiplier = 2 / (period + 1);

    // First EMA uses SMA
    let sum = 0;
    for (let i = 0; i < period && i < data.length; i++) {
      sum += data[i];
    }
    result[period - 1] = sum / period;

    for (let i = period; i < data.length; i++) {
      result[i] = (data[i] - result[i - 1]) * multiplier + result[i - 1];
    }

    return result;
  }

  /**
   * 计算 MACD
   * @param {number[]} closes - 收盘价数组
   * @param {number} fastPeriod - 快线周期 (默认12)
   * @param {number} slowPeriod - 慢线周期 (默认26)
   * @param {number} signalPeriod - 信号线周期 (默认9)
   * @returns {Object} { dif, dea, macd, signal }
   */
  function calcMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (closes.length < slowPeriod + signalPeriod) {
      return { dif: [], dea: [], macd: [], signal: [] };
    }

    const emaFast = ema(closes, fastPeriod);
    const emaSlow = ema(closes, slowPeriod);

    // DIF = EMA(fast) - EMA(slow)
    const dif = [];
    for (let i = 0; i < closes.length; i++) {
      if (emaFast[i] !== undefined && emaSlow[i] !== undefined) {
        dif[i] = emaFast[i] - emaSlow[i];
      }
    }

    // DEA = EMA(DIF, signal)
    const validDif = dif.filter(v => v !== undefined);
    const deaRaw = ema(validDif, signalPeriod);

    const dea = [];
    const macd = [];
    let validIdx = 0;
    for (let i = 0; i < dif.length; i++) {
      if (dif[i] !== undefined) {
        dea[i] = deaRaw[validIdx] !== undefined ? deaRaw[validIdx] : undefined;
        if (dea[i] !== undefined) {
          macd[i] = 2 * (dif[i] - dea[i]);
        }
        validIdx++;
      }
    }

    return {
      dif,
      dea,
      macd,
      latestDif: getLastValid(dif),
      latestDea: getLastValid(dea),
      latestMacd: getLastValid(macd),
      // Trend signals
      goldenCross: detectGoldenCross(dif, dea),
      deathCross: detectDeathCross(dif, dea),
      trend: getMACDTrend(dif, dea, macd)
    };
  }

  /**
   * 计算 KDJ
   * @param {Object[]} klineData - K线数据 [{high, low, close}]
   * @param {number} period - RSV周期 (默认9)
   * @param {number} kPeriod - K平滑周期 (默认3)
   * @param {number} dPeriod - D平滑周期 (默认3)
   */
  function calcKDJ(klineData, period = 9, kPeriod = 3, dPeriod = 3) {
    if (klineData.length < period) {
      return { k: [], d: [], j: [] };
    }

    const kValues = [];
    const dValues = [];
    const jValues = [];

    let prevK = 50;
    let prevD = 50;

    for (let i = 0; i < klineData.length; i++) {
      if (i < period - 1) {
        kValues[i] = undefined;
        dValues[i] = undefined;
        jValues[i] = undefined;
        continue;
      }

      // Calculate RSV
      let highestHigh = -Infinity;
      let lowestLow = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        if (klineData[j].high > highestHigh) highestHigh = klineData[j].high;
        if (klineData[j].low < lowestLow) lowestLow = klineData[j].low;
      }

      const close = klineData[i].close;
      const rsv = highestHigh === lowestLow ? 50 : ((close - lowestLow) / (highestHigh - lowestLow)) * 100;

      // K = 2/3 * prevK + 1/3 * RSV
      const k = (2 / 3) * prevK + (1 / 3) * rsv;
      // D = 2/3 * prevD + 1/3 * K
      const d = (2 / 3) * prevD + (1 / 3) * k;
      // J = 3K - 2D
      const j = 3 * k - 2 * d;

      kValues[i] = k;
      dValues[i] = d;
      jValues[i] = j;

      prevK = k;
      prevD = d;
    }

    return {
      k: kValues,
      d: dValues,
      j: jValues,
      latestK: getLastValid(kValues),
      latestD: getLastValid(dValues),
      latestJ: getLastValid(jValues),
      goldenCross: detectKDJGoldenCross(kValues, dValues),
      deathCross: detectKDJDeathCross(kValues, dValues),
      overbought: getLastValid(kValues) > 80 && getLastValid(dValues) > 80,
      oversold: getLastValid(kValues) < 20 && getLastValid(dValues) < 20
    };
  }

  /**
   * 计算 RSI
   */
  function calcRSI(closes, period = 14) {
    if (closes.length < period + 1) return { values: [], latest: null };

    const rsiValues = [];
    let avgGain = 0;
    let avgLoss = 0;

    // Initial average
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) avgGain += diff;
      else avgLoss += Math.abs(diff);
    }
    avgGain /= period;
    avgLoss /= period;

    rsiValues[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rsiValues[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }

    return {
      values: rsiValues,
      latest: getLastValid(rsiValues),
      overbought: getLastValid(rsiValues) > 70,
      oversold: getLastValid(rsiValues) < 30
    };
  }

  // === Helper functions ===

  function getLastValid(arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== undefined && !isNaN(arr[i])) return arr[i];
    }
    return null;
  }

  function getSecondLastValid(arr) {
    let count = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] !== undefined && !isNaN(arr[i])) {
        count++;
        if (count === 2) return arr[i];
      }
    }
    return null;
  }

  function detectGoldenCross(dif, dea) {
    const currDif = getLastValid(dif);
    const currDea = getLastValid(dea);
    const prevDif = getSecondLastValid(dif);
    const prevDea = getSecondLastValid(dea);

    if (currDif === null || currDea === null || prevDif === null || prevDea === null) return false;
    return prevDif <= prevDea && currDif > currDea;
  }

  function detectDeathCross(dif, dea) {
    const currDif = getLastValid(dif);
    const currDea = getLastValid(dea);
    const prevDif = getSecondLastValid(dif);
    const prevDea = getSecondLastValid(dea);

    if (currDif === null || currDea === null || prevDif === null || prevDea === null) return false;
    return prevDif >= prevDea && currDif < currDea;
  }

  function detectKDJGoldenCross(k, d) {
    const currK = getLastValid(k);
    const currD = getLastValid(d);
    const prevK = getSecondLastValid(k);
    const prevD = getSecondLastValid(d);

    if (currK === null || currD === null || prevK === null || prevD === null) return false;
    return prevK <= prevD && currK > currD;
  }

  function detectKDJDeathCross(k, d) {
    const currK = getLastValid(k);
    const currD = getLastValid(d);
    const prevK = getSecondLastValid(k);
    const prevD = getSecondLastValid(d);

    if (currK === null || currD === null || prevK === null || prevD === null) return false;
    return prevK >= prevD && currK < currD;
  }

  function getMACDTrend(dif, dea, macd) {
    const latestDif = getLastValid(dif);
    const latestDea = getLastValid(dea);
    const latestMacd = getLastValid(macd);
    const prevMacd = getSecondLastValid(macd);

    if (latestDif === null || latestDea === null) return 'unknown';

    if (latestDif > latestDea && latestDif > 0) return 'strong_up';
    if (latestDif > latestDea) return 'up';
    if (latestDif < latestDea && latestDif < 0) return 'strong_down';
    if (latestDif < latestDea) return 'down';
    return 'neutral';
  }

  return {
    calcMACD,
    calcKDJ,
    calcRSI,
    ema
  };
})();
