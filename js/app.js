/**
 * 股票看板 - 主应用（简化版：只看行情和指标）
 */
const App = (() => {
  let holdings = [];
  let stockData = {};
  let currentFilter = 'all';
  let refreshTimer = null;
  let isRefreshing = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function init() {
    holdings = Storage.getHoldings();
    bindEvents();
    renderStockGrid();
    refreshAll();
    startAutoRefresh();
  }

  function bindEvents() {
    $('#btnRefresh').addEventListener('click', () => refreshAll());
    $('#btnAdd').addEventListener('click', () => showModal('modalAdd'));
    $('#btnSettings').addEventListener('click', () => {
      var s = Storage.getSettings();
      $('#inputInterval').value = s.refreshInterval;
      showModal('modalSettings');
    });

    $('#btnCloseAdd').addEventListener('click', () => hideModal('modalAdd'));
    $('#btnCancelAdd').addEventListener('click', () => hideModal('modalAdd'));
    $('#btnConfirmAdd').addEventListener('click', handleAddStock);

    var searchTimer;
    $('#inputCode').addEventListener('input', function(e) {
      clearTimeout(searchTimer);
      var val = e.target.value.trim();
      if (val.length >= 1) {
        searchTimer = setTimeout(function() { searchStocks(val); }, 300);
      } else {
        hideSearchHints();
      }
    });

    $('#btnCloseDetail').addEventListener('click', () => hideModal('modalDetail'));
    $('#btnCloseSettings').addEventListener('click', () => hideModal('modalSettings'));
    $('#btnSaveSettings').addEventListener('click', handleSaveSettings);
    $('#btnExport').addEventListener('click', handleExport);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', handleImport);

    $$('.tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        $$('.tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderStockGrid();
      });
    });

    $$('.modal-overlay').forEach(function(overlay) {
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        $$('.modal-overlay').forEach(function(m) { m.style.display = 'none'; });
      }
    });
  }

  async function refreshAll() {
    if (isRefreshing || holdings.length === 0) {
      if (holdings.length === 0) {
        $('#emptyState').style.display = 'block';
        $('#stockGrid').innerHTML = '';
      }
      return;
    }

    isRefreshing = true;
    updateRefreshTime();

    try {
      var codes = holdings.map(function(h) { return h.code; });
      var quotes = await StockAPI.fetchQuotes(codes);

      for (var i = 0; i < holdings.length; i++) {
        var code = holdings[i].code;
        var quote = quotes[code];
        if (!quote) continue;

        var kline = Storage.getCachedKline(code);
        if (!kline) {
          kline = await StockAPI.fetchKline(code, 120);
          if (kline.length > 0) Storage.setCachedKline(code, kline);
        }

        var closes = kline.map(function(k) { return k.close; });
        var macd = Indicators.calcMACD(closes);
        var kdj = Indicators.calcKDJ(kline);
        var rsi = Indicators.calcRSI(closes);
        var analysis = RiskEngine.analyze(quote, macd, kdj, rsi, null);

        stockData[code] = { quote: quote, macd: macd, kdj: kdj, rsi: rsi, analysis: analysis };
      }

      renderStockGrid();
      renderSummary();
    } catch (err) {
      console.error('Refresh error:', err);
      showToast('数据刷新失败', 'error');
    }

    isRefreshing = false;
  }

  function startAutoRefresh() {
    var settings = Storage.getSettings();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function() { refreshAll(); }, settings.refreshInterval * 1000);
  }

  function updateRefreshTime() {
    var now = new Date();
    $('#updateTime').textContent = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
  }

  function renderStockGrid() {
    var grid = $('#stockGrid');
    var emptyState = $('#emptyState');

    if (holdings.length === 0) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    var filtered = holdings.slice();

    if (currentFilter === 'alert') {
      filtered = filtered.filter(function(h) {
        var d = stockData[h.code];
        return d && d.analysis && d.analysis.alerts.some(function(a) {
          return a.type === 'risk' || a.type === 'warning';
        });
      });
    }

    grid.innerHTML = filtered.map(function(h) { return renderStockCard(h); }).join('');

    grid.querySelectorAll('.stock-card').forEach(function(card) {
      card.addEventListener('click', function() {
        showStockDetail(card.dataset.code);
      });
    });
  }

  function renderStockCard(holding) {
    var data = stockData[holding.code];
    var q = data ? data.quote : null;
    var analysis = data ? data.analysis : null;

    if (!q) {
      return '<div class="stock-card flat" data-code="' + holding.code + '">' +
        '<div class="card-header"><div>' +
        '<div class="card-name">' + holding.code + '</div>' +
        '<div class="card-code">加载中...</div>' +
        '</div></div></div>';
    }

    var changeDir = q.changePercent > 0 ? 'up' : q.changePercent < 0 ? 'down' : 'flat';
    var changeColor = q.changePercent > 0 ? 'text-green' : q.changePercent < 0 ? 'text-red' : 'text-muted';
    var changeSign = q.changePercent > 0 ? '+' : '';

    // Indicators
    var macd = data ? data.macd : null;
    var kdj = data ? data.kdj : null;
    var rsi = data ? data.rsi : null;
    var indicatorsHtml = '';

    if (macd && macd.latestDif !== null) {
      var macdColor = macd.latestDif > macd.latestDea ? 'var(--green)' : 'var(--red)';
      var macdLabel = macd.goldenCross ? '🟢 金叉' : macd.deathCross ? '🔴 死叉' : '';
      indicatorsHtml += '<div class="indicator">' +
        '<span class="indicator-dot" style="background:' + macdColor + '"></span>' +
        '<span class="indicator-name">MACD</span>' +
        '<span class="indicator-value" style="color:' + macdColor + '">' +
        (macdLabel || 'DIF ' + fmt(macd.latestDif)) +
        '</span></div>';
    }

    if (kdj && kdj.latestK !== null) {
      var kdjColor = kdj.latestK > kdj.latestD ? 'var(--green)' : 'var(--red)';
      var kdjLabel = kdj.overbought ? '⚠️ 超买' : kdj.oversold ? '💡 超卖' : '';
      indicatorsHtml += '<div class="indicator">' +
        '<span class="indicator-dot" style="background:' + kdjColor + '"></span>' +
        '<span class="indicator-name">KDJ</span>' +
        '<span class="indicator-value" style="color:' + kdjColor + '">' +
        (kdjLabel || 'K' + fmt(kdj.latestK) + ' D' + fmt(kdj.latestD)) +
        '</span></div>';
    }

    if (rsi && rsi.latest !== null) {
      var rsiColor = rsi.overbought ? 'var(--red)' : rsi.oversold ? 'var(--green)' : 'var(--text-secondary)';
      var rsiLabel = rsi.overbought ? '⚠️ 超买' : rsi.oversold ? '💡 超卖' : '';
      indicatorsHtml += '<div class="indicator">' +
        '<span class="indicator-dot" style="background:' + rsiColor + '"></span>' +
        '<span class="indicator-name">RSI</span>' +
        '<span class="indicator-value" style="color:' + rsiColor + '">' +
        (rsiLabel || fmt(rsi.latest)) +
        '</span></div>';
    }

    // Alerts
    var alertsHtml = '';
    if (analysis && analysis.alerts.length > 0) {
      var topAlerts = analysis.alerts.slice(0, 3);
      alertsHtml = '<div class="card-alerts">';
      if (analysis.riskLevel) {
        alertsHtml += '<span class="alert-badge alert-' +
          (analysis.riskLevel.color === 'green' ? 'opportunity' : analysis.riskLevel.color === 'red' ? 'risk' : 'warning') +
          '">' + analysis.riskLevel.emoji + ' ' + analysis.riskLevel.text + '</span>';
      }
      for (var i = 0; i < topAlerts.length; i++) {
        alertsHtml += '<span class="alert-badge alert-' + topAlerts[i].type + '">' +
          topAlerts[i].icon + ' ' + topAlerts[i].title + '</span>';
      }
      alertsHtml += '</div>';
    }

    return '<div class="stock-card ' + changeDir + '" data-code="' + holding.code + '">' +
      '<div class="card-header">' +
        '<div>' +
          '<div class="card-name">' + q.name + '</div>' +
          '<div class="card-code">' + q.code + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="card-price ' + changeColor + '">' + q.currentPrice.toFixed(2) + '</div>' +
          '<div class="card-change ' + changeColor + '">' +
            changeSign + q.changeAmount.toFixed(2) + ' (' + changeSign + q.changePercent.toFixed(2) + '%)' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="card-metrics">' +
        '<div class="metric">' +
          '<span class="metric-label">成交量</span>' +
          '<span class="metric-value">' + StockAPI.formatVolume(q.volume) + '</span>' +
        '</div>' +
        '<div class="metric">' +
          '<span class="metric-label">换手率</span>' +
          '<span class="metric-value">' + q.turnoverRate.toFixed(2) + '%</span>' +
        '</div>' +
        '<div class="metric">' +
          '<span class="metric-label">振幅</span>' +
          '<span class="metric-value">' + q.amplitude.toFixed(2) + '%</span>' +
        '</div>' +
      '</div>' +
      (indicatorsHtml ? '<div class="card-indicators">' + indicatorsHtml + '</div>' : '') +
      alertsHtml +
    '</div>';
  }

  function renderSummary() {
    var upCount = 0, downCount = 0, flatCount = 0;
    for (var i = 0; i < holdings.length; i++) {
      var d = stockData[holdings[i].code];
      if (!d || !d.quote) continue;
      if (d.quote.changePercent > 0) upCount++;
      else if (d.quote.changePercent < 0) downCount++;
      else flatCount++;
    }

    $('#totalValue').textContent = holdings.length + ' 只';
    $('#totalPnl').textContent = upCount + ' 涨';
    $('#totalPnl').className = 'summary-value text-green';
    $('#todayPnl').textContent = downCount + ' 跌';
    $('#todayPnl').className = 'summary-value text-red';
    $('#holdingsCount').textContent = flatCount + ' 平';
  }

  function showStockDetail(code) {
    var data = stockData[code];
    if (!data || !data.quote) return;

    var q = data.quote;
    var analysis = data.analysis;
    var macd = data.macd;
    var kdj = data.kdj;
    var rsi = data.rsi;

    $('#detailTitle').textContent = q.name + ' (' + q.code + ')';

    var changeColor = q.changePercent > 0 ? 'text-green' : q.changePercent < 0 ? 'text-red' : 'text-muted';
    var changeSign = q.changePercent > 0 ? '+' : '';

    // Market data
    var marketHtml = '<div class="detail-section">' +
      '<h3>📈 行情数据</h3>' +
      '<div class="detail-grid">' +
        '<div class="detail-item"><span class="detail-label">当前价</span><span class="detail-value ' + changeColor + '">¥' + q.currentPrice.toFixed(2) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">涨跌幅</span><span class="detail-value ' + changeColor + '">' + changeSign + q.changePercent.toFixed(2) + '%</span></div>' +
        '<div class="detail-item"><span class="detail-label">今开</span><span class="detail-value">¥' + q.open.toFixed(2) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">昨收</span><span class="detail-value">¥' + q.prevClose.toFixed(2) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">最高</span><span class="detail-value text-green">¥' + q.high.toFixed(2) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">最低</span><span class="detail-value text-red">¥' + q.low.toFixed(2) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">成交量</span><span class="detail-value">' + StockAPI.formatVolume(q.volume) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">换手率</span><span class="detail-value">' + q.turnoverRate.toFixed(2) + '%</span></div>' +
        '<div class="detail-item"><span class="detail-label">市盈率</span><span class="detail-value">' + q.pe.toFixed(2) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">市净率</span><span class="detail-value">' + q.pb.toFixed(2) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">总市值</span><span class="detail-value">' + StockAPI.formatMarketCap(q.totalMarketCap) + '</span></div>' +
        '<div class="detail-item"><span class="detail-label">振幅</span><span class="detail-value">' + q.amplitude.toFixed(2) + '%</span></div>' +
      '</div></div>';

    // Indicators
    var indHtml = '<div class="detail-section"><h3>📊 技术指标</h3><div class="detail-grid">';
    if (macd && macd.latestDif !== null) {
      indHtml += '<div class="detail-item"><span class="detail-label">MACD DIF</span><span class="detail-value">' + fmt(macd.latestDif) + '</span></div>';
      indHtml += '<div class="detail-item"><span class="detail-label">MACD DEA</span><span class="detail-value">' + fmt(macd.latestDea) + '</span></div>';
      indHtml += '<div class="detail-item"><span class="detail-label">MACD 柱</span><span class="detail-value ' + (macd.latestMacd >= 0 ? 'text-green' : 'text-red') + '">' + fmt(macd.latestMacd) + '</span></div>';
      indHtml += '<div class="detail-item"><span class="detail-label">MACD 信号</span><span class="detail-value">' + (macd.goldenCross ? '🟢 金叉' : macd.deathCross ? '🔴 死叉' : getTrendText(macd.trend)) + '</span></div>';
    }
    if (kdj && kdj.latestK !== null) {
      indHtml += '<div class="detail-item"><span class="detail-label">KDJ K</span><span class="detail-value">' + fmt(kdj.latestK) + '</span></div>';
      indHtml += '<div class="detail-item"><span class="detail-label">KDJ D</span><span class="detail-value">' + fmt(kdj.latestD) + '</span></div>';
      indHtml += '<div class="detail-item"><span class="detail-label">KDJ J</span><span class="detail-value">' + fmt(kdj.latestJ) + '</span></div>';
      indHtml += '<div class="detail-item"><span class="detail-label">KDJ 信号</span><span class="detail-value">' + (kdj.overbought ? '⚠️ 超买' : kdj.oversold ? '💡 超卖' : kdj.goldenCross ? '🟢 金叉' : kdj.deathCross ? '🔴 死叉' : '中性') + '</span></div>';
    }
    if (rsi && rsi.latest !== null) {
      indHtml += '<div class="detail-item"><span class="detail-label">RSI(14)</span><span class="detail-value">' + fmt(rsi.latest) + '</span></div>';
      indHtml += '<div class="detail-item"><span class="detail-label">RSI 信号</span><span class="detail-value">' + (rsi.overbought ? '⚠️ 超买' : rsi.oversold ? '💡 超卖' : '中性') + '</span></div>';
    }
    indHtml += '</div></div>';

    // Alerts
    var alertsHtml = '';
    if (analysis && analysis.alerts.length > 0) {
      alertsHtml = '<div class="detail-section"><h3>🔔 风险与机遇分析</h3>';
      if (analysis.riskLevel) {
        alertsHtml += '<div style="text-align:center;margin-bottom:16px;padding:12px;background:var(--bg-primary);border-radius:var(--radius-sm);">' +
          '<div style="font-size:2rem;">' + analysis.riskLevel.emoji + '</div>' +
          '<div style="font-size:1.1rem;font-weight:700;margin:4px 0;">' + analysis.riskLevel.text + '</div>' +
          '<div style="color:var(--text-muted);font-size:0.85rem;">综合评分: ' + analysis.score + '</div></div>';
      }
      alertsHtml += '<div class="detail-alerts">';
      for (var i = 0; i < analysis.alerts.length; i++) {
        var a = analysis.alerts[i];
        alertsHtml += '<div class="detail-alert-item ' + a.type + '">' +
          '<span class="detail-alert-icon">' + a.icon + '</span>' +
          '<div><strong>' + a.title + '</strong><br>' + a.detail + '</div></div>';
      }
      alertsHtml += '</div></div>';
    }

    var actionsHtml = '<div class="detail-actions">' +
      '<button class="btn btn-danger btn-sm" onclick="App.deleteHolding(\'' + code + '\')">🗑️ 删除</button></div>';

    $('#detailBody').innerHTML = marketHtml + indHtml + alertsHtml + actionsHtml;
    showModal('modalDetail');
  }

  async function searchStocks(keyword) {
    var hints = $('#searchHints');
    if (keyword.length < 1) { hideSearchHints(); return; }

    // Show a simple hint for 6-digit codes
    if (/^\d{6}$/.test(keyword)) {
      hints.innerHTML = '<div class="hint-item" data-code="' + keyword + '">' +
        '<span class="hint-code">' + keyword + '</span>' +
        '<span class="hint-name">✓ 点击添加</span></div>';
      hints.querySelectorAll('.hint-item').forEach(function(item) {
        item.addEventListener('click', function() {
          $('#inputCode').value = item.dataset.code;
          $('#inputCode').dataset.selectedCode = item.dataset.code;
          hideSearchHints();
        });
      });
      hints.classList.add('visible');
      return;
    }

    hints.innerHTML = '<div class="hint-item"><span class="hint-name">请输入6位股票代码</span></div>';
    hints.classList.add('visible');
  }

  function hideSearchHints() {
    $('#searchHints').classList.remove('visible');
  }

  async function handleAddStock() {
    var codeInput = $('#inputCode');
    var raw = codeInput.value.trim();
    var code = (codeInput.dataset.selectedCode || raw).replace(/[^0-9]/g, '');
    var errorEl = $('#formError');

    if (code.length !== 6) {
      errorEl.textContent = '请输入6位数字代码';
      return;
    }

    errorEl.textContent = '';
    Storage.addHolding({ code: code });
    holdings = Storage.getHoldings();
    codeInput.value = '';
    codeInput.dataset.selectedCode = '';
    hideModal('modalAdd');
    showToast('已添加 ' + code, 'success');
    refreshAll();
  }

  function deleteHolding(code) {
    if (!confirm('确定删除这只股票？')) return;
    Storage.removeHolding(code);
    holdings = Storage.getHoldings();
    delete stockData[code];
    hideModal('modalDetail');
    renderStockGrid();
    renderSummary();
    showToast('已删除', 'info');
  }

  function handleSaveSettings() {
    var settings = { refreshInterval: parseInt($('#inputInterval').value) || 30 };
    Storage.saveSettings(settings);
    hideModal('modalSettings');
    startAutoRefresh();
    showToast('设置已保存', 'success');
  }

  function handleExport() {
    var data = Storage.exportData();
    var blob = new Blob([data], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'stock_dashboard_' + formatDate(new Date()) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
  }

  function handleImport(e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      var result = Storage.importData(ev.target.result);
      if (result.success) {
        holdings = Storage.getHoldings();
        renderStockGrid();
        refreshAll();
        showToast('成功导入 ' + result.count + ' 只股票', 'success');
      } else {
        showToast('导入失败: ' + result.error, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function showModal(id) { $('#' + id).style.display = 'flex'; }
  function hideModal(id) { $('#' + id).style.display = 'none'; }

  function showToast(msg, type) {
    type = type || 'info';
    var container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    var toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function() {
      toast.remove();
      if (container.children.length === 0) container.remove();
    }, 3000);
  }

  function fmt(n) {
    if (n === null || n === undefined) return '--';
    return n.toFixed(3);
  }

  function pad(n) { return n.toString().padStart(2, '0'); }

  function formatDate(d) {
    return d.getFullYear() + '' + pad(d.getMonth() + 1) + pad(d.getDate());
  }

  function getTrendText(trend) {
    var map = {
      'strong_up': '🟢 强势上涨', 'up': '🟢 上涨',
      'neutral': '🟡 震荡', 'down': '🔴 下跌',
      'strong_down': '🔴 强势下跌', 'unknown': '⚪ 未知'
    };
    return map[trend] || trend;
  }

  return { init: init, deleteHolding: deleteHolding, refreshAll: refreshAll };
})();

document.addEventListener('DOMContentLoaded', App.init);
</script>
</body>
</html>
