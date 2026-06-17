/**
 * 风险与机遇分析引擎
 * 综合 MACD、KDJ、RSI、价格位置等多维度分析
 */
const RiskEngine = (() => {

  function fmt(n) {
    if (n === null || n === undefined) return '--';
    return n.toFixed(3);
  }

  function getRiskLevel(score) {
    if (score >= 50) return { text: '强烈看多', color: 'green', emoji: '🟢' };
    if (score >= 25) return { text: '偏多', color: 'green', emoji: '🟢' };
    if (score >= 10) return { text: '谨慎乐观', color: 'blue', emoji: '🔵' };
    if (score >= -10) return { text: '中性', color: 'yellow', emoji: '🟡' };
    if (score >= -25) return { text: '偏空', color: 'red', emoji: '🔴' };
    return { text: '强烈看空', color: 'red', emoji: '🔴' };
  }

  /**
   * 分析单只股票的风险和机遇
   */
  function analyze(quote, macd, kdj, rsi, holding) {
    var alerts = [];
    var riskScore = 0;

    if (!quote) return { alerts: alerts, riskLevel: 'unknown', score: 0 };

    // === MACD Analysis ===
    if (macd) {
      if (macd.goldenCross) {
        alerts.push({
          type: 'opportunity',
          icon: '🟢',
          title: 'MACD 金叉',
          detail: 'DIF(' + fmt(macd.latestDif) + ')上穿DEA(' + fmt(macd.latestDea) + ')，短期动能转强',
          weight: 25
        });
        riskScore += 25;
      }

      if (macd.deathCross) {
        alerts.push({
          type: 'risk',
          icon: '🔴',
          title: 'MACD 死叉',
          detail: 'DIF(' + fmt(macd.latestDif) + ')下穿DEA(' + fmt(macd.latestDea) + ')，短期动能转弱',
          weight: -25
        });
        riskScore -= 25;
      }

      if (macd.trend === 'strong_up') {
        alerts.push({
          type: 'opportunity',
          icon: '🟢',
          title: 'MACD 多头强势',
          detail: 'DIF>DEA且均在零轴上方，上升趋势强劲',
          weight: 15
        });
        riskScore += 15;
      }

      if (macd.trend === 'strong_down') {
        alerts.push({
          type: 'risk',
          icon: '🔴',
          title: 'MACD 空头强势',
          detail: 'DIF<DEA且均在零轴下方，下降趋势明显',
          weight: -15
        });
        riskScore -= 15;
      }

      // MACD 柱状图连续放大/缩小
      if (macd.macd && macd.macd.length >= 3) {
        var recent = macd.macd.filter(function(v) { return v !== undefined; }).slice(-3);
        if (recent.length === 3) {
          if (recent[2] > recent[1] && recent[1] > recent[0] && recent[2] > 0) {
            alerts.push({
              type: 'info',
              icon: '📈',
              title: 'MACD 红柱放大',
              detail: '动能持续增强，多头力量在积聚',
              weight: 8
            });
            riskScore += 8;
          }
          if (recent[2] < recent[1] && recent[1] < recent[0] && recent[2] < 0) {
            alerts.push({
              type: 'warning',
              icon: '📉',
              title: 'MACD 绿柱放大',
              detail: '空头动能持续增强',
              weight: -8
            });
            riskScore -= 8;
          }
        }
      }
    }

    // === KDJ Analysis ===
    if (kdj) {
      if (kdj.goldenCross) {
        alerts.push({
          type: 'opportunity',
          icon: '🟢',
          title: 'KDJ 金叉',
          detail: 'K(' + fmt(kdj.latestK) + ')上穿D(' + fmt(kdj.latestD) + ')，短期看多信号',
          weight: 20
        });
        riskScore += 20;
      }

      if (kdj.deathCross) {
        alerts.push({
          type: 'risk',
          icon: '🔴',
          title: 'KDJ 死叉',
          detail: 'K(' + fmt(kdj.latestK) + ')下穿D(' + fmt(kdj.latestD) + ')，短期看空信号',
          weight: -20
        });
        riskScore -= 20;
      }

      if (kdj.overbought) {
        alerts.push({
          type: 'risk',
          icon: '⚠️',
          title: 'KDJ 超买区',
          detail: 'K=' + fmt(kdj.latestK) + ', D=' + fmt(kdj.latestD) + '，均>80，注意回调风险',
          weight: -15
        });
        riskScore -= 15;
      }

      if (kdj.oversold) {
        alerts.push({
          type: 'opportunity',
          icon: '💡',
          title: 'KDJ 超卖区',
          detail: 'K=' + fmt(kdj.latestK) + ', D=' + fmt(kdj.latestD) + '，均<20，可能超跌反弹',
          weight: 15
        });
        riskScore += 15;
      }

      if (kdj.latestJ !== null && kdj.latestJ !== undefined) {
        if (kdj.latestJ > 100) {
          alerts.push({
            type: 'warning',
            icon: '⚠️',
            title: 'J值超买',
            detail: 'J=' + fmt(kdj.latestJ) + '，>100，短期可能面临调整',
            weight: -10
          });
          riskScore -= 10;
        }
        if (kdj.latestJ < 0) {
          alerts.push({
            type: 'opportunity',
            icon: '💡',
            title: 'J值超卖',
            detail: 'J=' + fmt(kdj.latestJ) + '，<0，短期可能反弹',
            weight: 10
          });
          riskScore += 10;
        }
      }
    }

    // === RSI Analysis ===
    if (rsi && rsi.latest !== null) {
      if (rsi.overbought) {
        alerts.push({
          type: 'risk',
          icon: '⚠️',
          title: 'RSI 超买',
          detail: 'RSI=' + fmt(rsi.latest) + '，>70，估值偏高',
          weight: -12
        });
        riskScore -= 12;
      }

      if (rsi.oversold) {
        alerts.push({
          type: 'opportunity',
          icon: '💡',
          title: 'RSI 超卖',
          detail: 'RSI=' + fmt(rsi.latest) + '，<30，可能被低估',
          weight: 12
        });
        riskScore += 12;
      }
    }

    // === Price Position Analysis ===
    if (quote) {
      if (quote.changePercent > 5) {
        alerts.push({
          type: 'warning',
          icon: '🚀',
          title: '大幅上涨',
          detail: '今日涨幅 ' + quote.changePercent.toFixed(2) + '%，注意追高风险',
          weight: -5
        });
        riskScore -= 5;
      }

      if (quote.changePercent < -5) {
        alerts.push({
          type: 'warning',
          icon: '💥',
          title: '大幅下跌',
          detail: '今日跌幅 ' + quote.changePercent.toFixed(2) + '%，关注是否止跌',
          weight: -5
        });
        riskScore -= 5;
      }

      if (quote.turnoverRate > 15) {
        alerts.push({
          type: 'warning',
          icon: '🔥',
          title: '换手率异常',
          detail: '换手率 ' + quote.turnoverRate.toFixed(2) + '%，交易活跃度极高',
          weight: -5
        });
        riskScore -= 5;
      }

      // 持仓盈亏分析
      if (holding && holding.shares > 0 && holding.cost > 0) {
        var pnlPercent = ((quote.currentPrice - holding.cost) / holding.cost) * 100;

        if (pnlPercent > 30) {
          alerts.push({
            type: 'warning',
            icon: '💰',
            title: '大幅盈利',
            detail: '持仓盈利 ' + pnlPercent.toFixed(1) + '%，可考虑部分止盈',
            weight: -8
          });
          riskScore -= 8;
        }

        if (pnlPercent < -20) {
          alerts.push({
            type: 'risk',
            icon: '😰',
            title: '深度套牢',
            detail: '持仓亏损 ' + pnlPercent.toFixed(1) + '%，评估是否止损或补仓',
            weight: -10
          });
          riskScore -= 10;
        }

        if (pnlPercent > 0 && pnlPercent < 10 && kdj && kdj.oversold) {
          alerts.push({
            type: 'opportunity',
            icon: '💡',
            title: '加仓机会',
            detail: '持仓盈利且KDJ超卖，可考虑逢低加仓',
            weight: 10
          });
          riskScore += 10;
        }
      }
    }

    // === Confluence signals (多指标共振) ===
    var bullishCount = 0;
    var bearishCount = 0;

    if (macd) {
      if (macd.trend === 'up' || macd.trend === 'strong_up') bullishCount++;
      if (macd.trend === 'down' || macd.trend === 'strong_down') bearishCount++;
    }
    if (kdj) {
      if (kdj.latestK > kdj.latestD) bullishCount++;
      else bearishCount++;
      if (kdj.oversold) bullishCount++;
      if (kdj.overbought) bearishCount++;
    }
    if (rsi && rsi.latest !== null) {
      if (rsi.oversold) bullishCount++;
      if (rsi.overbought) bearishCount++;
      if (rsi.latest > 50) bullishCount++;
      else bearishCount++;
    }

    if (bullishCount >= 4) {
      alerts.push({
        type: 'opportunity',
        icon: '⭐',
        title: '多指标共振看多',
        detail: bullishCount + '个指标同时发出看多信号，共振效应强',
        weight: 20
      });
      riskScore += 20;
    }

    if (bearishCount >= 4) {
      alerts.push({
        type: 'risk',
        icon: '💀',
        title: '多指标共振看空',
        detail: bearishCount + '个指标同时发出看空信号，风险较大',
        weight: -20
      });
      riskScore -= 20;
    }

    // === Generate summary ===
    var riskLevel = getRiskLevel(riskScore);

    return {
      alerts: alerts.sort(function(a, b) { return Math.abs(b.weight) - Math.abs(a.weight); }),
      riskLevel: riskLevel,
      score: Math.max(-100, Math.min(100, riskScore))
    };
  }

  return { analyze: analyze };
})();
