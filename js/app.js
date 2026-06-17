/**
 * 股票看板 - 主应用
 */
const App = (() => {
  // State
  let holdings = [];
  let stockData = {};     // code -> { quote, macd, kdj, rsi, analysis }
  let currentFilter = 'all';
  let refreshTimer = null;
  let isRefreshing = false;

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // === Initialization ===
  function init() {
    holdings = Storage.getHoldings();
    bindEvents();
    renderStockGrid();
    refreshAll();
    startAutoRefresh();
  }

  // === Event Binding ===
  function bindEvents() {
    // Header buttons
    $('#btnRefresh').addEventListener('click', () => refreshAll());
    $('#btnAdd').addEventListener('click', () => showModal('modalAdd'));
    $('#btnSettings').addEventListener('click', () => {
      const s = Storage.getSettings();
      $('#inputInterval').value = s.refreshInterval;
      $('#selectMacd').value = s.macdSensitivity;
      $('#selectKdj').value = s.kdjThreshold;
      showModal('modalSettings');
    });

    // Add modal
    $('#btnCloseAdd').addEventListener('click', () => hideModal('modalAdd'));
    $('#btnCancelAdd').addEventListener('click', () => hideModal('modalAdd'));
    $('#btnConfirmAdd').addEventListener('click', handleAddStock);

    // Search input with debounce
    let searchTimer;
    $('#inputCode').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const val = e.target.value.trim();
      if (val.length >= 1) {
        searchTimer = setTimeout(() => searchStocks(val), 300);
      } else {
        hideSearchHints();
      }
    });

    // Detail modal
    $('#btnCloseDetail').addEventListener('click', () => hideModal('modalDetail'));

    // Settings modal
    $('#btnCloseSettings').addEventListener('click', () => hideModal('modalSettings'));
    $('#btnSaveSettings').addEventListener('click', handleSaveSettings);
    $('#btnExport').addEventListener('click', handleExport);
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', handleImport);
    $('#btnPasteImport').addEventListener('click', () => {
      hideModal('modalSettings');
      $('#inputPasteData').value = '';
      $('#pastePreview').innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">粘贴数据后自动解析...</p>';
      $('#pasteError').textContent = '';
      $('#btnConfirmPaste').disabled = true;
      parsedPasteData = [];
      showModal('modalPaste');
    });

    // Paste modal
    $('#btnClosePaste').addEventListener('click', () => hideModal('modalPaste'));
    $('#btnCancelPaste').addEventListener('click', () => hideModal('modalPaste'));
    $('#btnConfirmPaste').addEventListener('click', handleConfirmPaste);
    let pasteTimer;
    $('#inputPasteData').addEventListener('input', (e) => {
      clearTimeout(pasteTimer);
      pasteTimer = setTimeout(() => parsePasteData(e.target.value), 200);
    });

    // Filter tabs
    $$('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        $$('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderStockGrid();
      });
    });

    // Close modals on overlay click
    $$('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $$('.modal-overlay').forEach(m => m.style.display = 'none');
      }
    });
  }

  // === Data Fetching ===
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
      const codes = holdings.map(h => h.code);
      const quotes = await StockAPI.fetchQuotes(codes);

      // Fetch kline data and calculate indicators for each stock
      for (const holding of holdings) {
        const code = holding.code;
        const quote = quotes[code];
        if (!quote) continue;

        // Get kline data (use cache)
        let kline = Storage.getCachedKline(code);
        if (!kline) {
          kline = await StockAPI.fetchKline(code, 120);
          if (kline.length > 0) {
            Storage.setCachedKline(code, kline);
          }
        }

        // Calculate indicators
        const closes = kline.map(k => k.close);
        const macd = Indicators.calcMACD(closes);
        const kdj = Indicators.calcKDJ(kline);
        const rsi = Indicators.calcRSI(closes);

        // Risk analysis
        const analysis = RiskEngine.analyze(quote, macd, kdj, rsi, holding);

        stockData[code] = { quote, macd, kdj, rsi, analysis };
      }

      renderStockGrid();
      renderSummary();
    } catch (err) {
      console.error('Refresh error:', err);
      showToast('数据刷新失败，请检查网络', 'error');
    }

    isRefreshing = false;
  }

  function startAutoRefresh() {
    const settings = Storage.getSettings();
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      refreshAll();
    }, settings.refreshInterval * 1000);
  }

  function updateRefreshTime() {
    const now = new Date();
    $('#updateTime').textContent =
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }

  // === Rendering ===
  function renderStockGrid() {
    const grid = $('#stockGrid');
    const emptyState = $('#emptyState');

    if (holdings.length === 0) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';

    let filteredHoldings = [...holdings];

    if (currentFilter === 'profit') {
      filteredHoldings = filteredHoldings.filter(h => {
        const d = stockData[h.code];
        return d && d.quote && d.quote.currentPrice > h.cost;
      });
    } else if (currentFilter === 'loss') {
      filteredHoldings = filteredHoldings.filter(h => {
        const d = stockData[h.code];
        return d && d.quote && d.quote.currentPrice < h.cost;
      });
    } else if (currentFilter === 'alert') {
      filteredHoldings = filteredHoldings.filter(h => {
        const d = stockData[h.code];
        return d && d.analysis && d.analysis.alerts.some(a =>
          a.type === 'risk' || a.type === 'warning'
        );
      });
    }

    grid.innerHTML = filteredHoldings.map(h => renderStockCard(h)).join('');

    // Bind card click events
    grid.querySelectorAll('.stock-card').forEach(card => {
      card.addEventListener('click', () => {
        const code = card.dataset.code;
        showStockDetail(code);
      });
    });
  }

  function renderStockCard(holding) {
    const data = stockData[holding.code];
    const q = data?.quote;
    const analysis = data?.analysis;

    if (!q) {
      return `
        <div class="stock-card flat" data-code="${holding.code}">
          <div class="card-header">
            <div>
              <div class="card-name">${holding.code}</div>
              <div class="card-code">加载中...</div>
            </div>
          </div>
        </div>`;
    }

    const changeDir = q.changePercent > 0 ? 'up' : q.changePercent < 0 ? 'down' : 'flat';
    const changeColor = q.changePercent > 0 ? 'text-green' : q.changePercent < 0 ? 'text-red' : 'text-muted';
    const changeSign = q.changePercent > 0 ? '+' : '';

    // P&L
    let pnlHtml = '';
    if (holding.shares > 0 && holding.cost > 0) {
      const pnl = (q.currentPrice - holding.cost) * holding.shares;
      const pnlPct = ((q.currentPrice - holding.cost) / holding.cost * 100);
      const pnlColor = pnl >= 0 ? 'text-green' : 'text-red';
      const pnlSign = pnl >= 0 ? '+' : '';
      pnlHtml = `
        <div class="metric">
          <span class="metric-label">持仓盈亏</span>
          <span class="metric-value ${pnlColor}">${pnlSign}${formatMoney(pnl)}</span>
        </div>`;
    }

    // Indicators
    const macd = data?.macd;
    const kdj = data?.kdj;
    let indicatorsHtml = '';

    if (macd && macd.latestDif !== null) {
      const macdColor = macd.latestDif > macd.latestDea ? 'var(--green)' : 'var(--red)';
      indicatorsHtml += `
        <div class="indicator">
          <span class="indicator-dot" style="background:${macdColor}"></span>
          <span class="indicator-name">MACD</span>
          <span class="indicator-value" style="color:${macdColor}">
            DIF ${fmt(macd.latestDif)}
          </span>
        </div>`;
    }

    if (kdj && kdj.latestK !== null) {
      const kdjColor = kdj.latestK > kdj.latestD ? 'var(--green)' : 'var(--red)';
      indicatorsHtml += `
        <div class="indicator">
          <span class="indicator-dot" style="background:${kdjColor}"></span>
          <span class="indicator-name">KDJ</span>
          <span class="indicator-value" style="color:${kdjColor}">
            K${fmt(kdj.latestK)} D${fmt(kdj.latestD)}
          </span>
        </div>`;
    }

    // Alerts
    let alertsHtml = '';
    if (analysis && analysis.alerts.length > 0) {
      const topAlerts = analysis.alerts.slice(0, 3);
      alertsHtml = `
        <div class="card-alerts">
          ${analysis.riskLevel ? `<span class="alert-badge alert-${analysis.riskLevel.color === 'green' ? 'opportunity' : analysis.riskLevel.color === 'red' ? 'risk' : 'warning'}">${analysis.riskLevel.emoji} ${analysis.riskLevel.text}</span>` : ''}
          ${topAlerts.map(a => `<span class="alert-badge alert-${a.type}">${a.icon} ${a.title}</span>`).join('')}
        </div>`;
    }

    return `
      <div class="stock-card ${changeDir}" data-code="${holding.code}">
        <div class="card-header">
          <div>
            <div class="card-name">${q.name}</div>
            <div class="card-code">${q.code}</div>
          </div>
          <div>
            <div class="card-price ${changeColor}">${q.currentPrice.toFixed(2)}</div>
            <div class="card-change ${changeColor}">
              ${changeSign}${q.changeAmount.toFixed(2)} (${changeSign}${q.changePercent.toFixed(2)}%)
            </div>
          </div>
        </div>

        <div class="card-metrics">
          <div class="metric">
            <span class="metric-label">成交量</span>
            <span class="metric-value">${StockAPI.formatVolume(q.volume)}</span>
          </div>
          <div class="metric">
            <span class="metric-label">成本价</span>
            <span class="metric-value">${holding.cost > 0 ? holding.cost.toFixed(2) : '--'}</span>
          </div>
          ${pnlHtml || `
          <div class="metric">
            <span class="metric-label">换手率</span>
            <span class="metric-value">${q.turnoverRate.toFixed(2)}%</span>
          </div>`}
        </div>

        ${indicatorsHtml ? `<div class="card-indicators">${indicatorsHtml}</div>` : ''}
        ${alertsHtml}
      </div>`;
  }

  function renderSummary() {
    let totalValue = 0;
    let totalCost = 0;
    let todayPnl = 0;

    for (const h of holdings) {
      const d = stockData[h.code];
      if (!d?.quote) continue;

      if (h.shares > 0) {
        totalValue += d.quote.currentPrice * h.shares;
        totalCost += h.cost * h.shares;
        todayPnl += d.quote.changeAmount * h.shares;
      }
    }

    const totalPnl = totalValue - totalCost;

    $('#totalValue').textContent = totalValue > 0 ? formatMoney(totalValue) : '--';
    $('#totalPnl').textContent = totalCost > 0 ? `${totalPnl >= 0 ? '+' : ''}${formatMoney(totalPnl)}` : '--';
    $('#totalPnl').className = `summary-value ${totalPnl >= 0 ? 'text-green' : 'text-red'}`;
    $('#todayPnl').textContent = `${todayPnl >= 0 ? '+' : ''}${formatMoney(todayPnl)}`;
    $('#todayPnl').className = `summary-value ${todayPnl >= 0 ? 'text-green' : 'text-red'}`;
    $('#holdingsCount').textContent = holdings.length;
  }

  // === Stock Detail ===
  function showStockDetail(code) {
    const holding = holdings.find(h => h.code === code);
    const data = stockData[code];
    if (!data?.quote) return;

    const q = data.quote;
    const analysis = data?.analysis;

    $('#detailTitle').textContent = `${q.name} (${q.code})`;

    const changeColor = q.changePercent > 0 ? 'text-green' : q.changePercent < 0 ? 'text-red' : 'text-muted';
    const changeSign = q.changePercent > 0 ? '+' : '';

    // P&L section
    let pnlDetailHtml = '';
    if (holding && holding.shares > 0 && holding.cost > 0) {
      const pnl = (q.currentPrice - holding.cost) * holding.shares;
      const pnlPct = ((q.currentPrice - holding.cost) / holding.cost * 100);
      const pnlColor = pnl >= 0 ? 'text-green' : 'text-red';

      pnlDetailHtml = `
        <div class="detail-section">
          <h3>💼 持仓信息</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="detail-label">持有数量</span>
              <span class="detail-value">${holding.shares.toLocaleString()} 股</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">持仓成本</span>
              <span class="detail-value">¥${holding.cost.toFixed(2)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">当前市值</span>
              <span class="detail-value">¥${formatMoney(q.currentPrice * holding.shares)}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">持仓盈亏</span>
              <span class="detail-value ${pnlColor}">${pnl >= 0 ? '+' : ''}¥${formatMoney(pnl)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>`;
    }

    // Indicators detail
    const macd = data?.macd;
    const kdj = data?.kdj;
    const rsi = data?.rsi;

    let indicatorsHtml = '<div class="detail-section"><h3>📊 技术指标</h3><div class="detail-grid">';

    if (macd && macd.latestDif !== null) {
      indicatorsHtml += `
        <div class="detail-item">
          <span class="detail-label">MACD DIF</span>
          <span class="detail-value">${fmt(macd.latestDif)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">MACD DEA</span>
          <span class="detail-value">${fmt(macd.latestDea)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">MACD 柱</span>
          <span class="detail-value ${macd.latestMacd >= 0 ? 'text-green' : 'text-red'}">${fmt(macd.latestMacd)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">MACD 趋势</span>
          <span class="detail-value">${getTrendText(macd.trend)}</span>
        </div>`;
    }

    if (kdj && kdj.latestK !== null) {
      indicatorsHtml += `
        <div class="detail-item">
          <span class="detail-label">KDJ K值</span>
          <span class="detail-value">${fmt(kdj.latestK)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">KDJ D值</span>
          <span class="detail-value">${fmt(kdj.latestD)}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">KDJ J值</span>
          <span class="detail-value">${fmt(kdj.latestJ)}</span>
        </div>`;
    }

    if (rsi && rsi.latest !== null) {
      indicatorsHtml += `
        <div class="detail-item">
          <span class="detail-label">RSI(14)</span>
          <span class="detail-value">${fmt(rsi.latest)}</span>
        </div>`;
    }

    indicatorsHtml += '</div></div>';

    // Alerts detail
    let alertsHtml = '';
    if (analysis && analysis.alerts.length > 0) {
      alertsHtml = `
        <div class="detail-section">
          <h3>🔔 风险与机遇分析</h3>
          ${analysis.riskLevel ? `
          <div style="text-align:center;margin-bottom:16px;padding:12px;background:var(--bg-primary);border-radius:var(--radius-sm);">
            <div style="font-size:2rem;">${analysis.riskLevel.emoji}</div>
            <div style="font-size:1.1rem;font-weight:700;margin:4px 0;">${analysis.riskLevel.text}</div>
            <div style="color:var(--text-muted);font-size:0.85rem;">综合评分: ${analysis.score}</div>
          </div>` : ''}
          <div class="detail-alerts">
            ${analysis.alerts.map(a => `
              <div class="detail-alert-item ${a.type}">
                <span class="detail-alert-icon">${a.icon}</span>
                <div>
                  <strong>${a.title}</strong><br>
                  ${a.detail}
                </div>
              </div>
            `).join('')}
          </div>
        </div>`;
    }

    // Market data
    const marketHtml = `
      <div class="detail-section">
        <h3>📈 行情数据</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">当前价</span>
            <span class="detail-value ${changeColor}">¥${q.currentPrice.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">涨跌幅</span>
            <span class="detail-value ${changeColor}">${changeSign}${q.changePercent.toFixed(2)}%</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">今开</span>
            <span class="detail-value">¥${q.open.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">昨收</span>
            <span class="detail-value">¥${q.prevClose.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">最高</span>
            <span class="detail-value text-green">¥${q.high.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">最低</span>
            <span class="detail-value text-red">¥${q.low.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">成交量</span>
            <span class="detail-value">${StockAPI.formatVolume(q.volume)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">换手率</span>
            <span class="detail-value">${q.turnoverRate.toFixed(2)}%</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">市盈率</span>
            <span class="detail-value">${q.pe.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">市净率</span>
            <span class="detail-value">${q.pb.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">总市值</span>
            <span class="detail-value">${StockAPI.formatMarketCap(q.totalMarketCap)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">振幅</span>
            <span class="detail-value">${q.amplitude.toFixed(2)}%</span>
          </div>
        </div>
      </div>`;

    // Action buttons
    const actionsHtml = `
      <div class="detail-actions">
        <button class="btn btn-secondary btn-sm" onclick="App.editHolding('${code}')">✏️ 修改持仓</button>
        <button class="btn btn-danger btn-sm" onclick="App.deleteHolding('${code}')">🗑️ 删除</button>
      </div>`;

    $('#detailBody').innerHTML =
      marketHtml + pnlDetailHtml + indicatorsHtml + alertsHtml + actionsHtml;

    showModal('modalDetail');
  }

  // === Search ===
  async function searchStocks(keyword) {
    const hints = $('#searchHints');
    if (keyword.length < 1) {
      hideSearchHints();
      return;
    }

    const results = await StockAPI.searchStock(keyword);
    if (results.length === 0) {
      hints.innerHTML = '<div class="hint-item"><span class="hint-name">未找到匹配股票</span></div>';
      hints.classList.add('visible');
      return;
    }

    hints.innerHTML = results.map(r => `
      <div class="hint-item" data-code="${r.code}" data-name="${r.name}">
        <span class="hint-code">${r.code}</span>
        <span class="hint-name">${r.name}</span>
      </div>
    `).join('');

    hints.querySelectorAll('.hint-item').forEach(item => {
      item.addEventListener('click', () => {
        const code = item.dataset.code;
        const name = item.dataset.name;
        if (code && name) {
          $('#inputCode').value = `${code} ${name}`;
          $('#inputCode').dataset.selectedCode = code;
          hideSearchHints();
        }
      });
    });

    hints.classList.add('visible');
  }

  function hideSearchHints() {
    $('#searchHints').classList.remove('visible');
  }

  // === Add Stock ===
  async function handleAddStock() {
    const codeInput = $('#inputCode');
    const code = (codeInput.dataset.selectedCode || codeInput.value).trim().replace(/\s.*/, '');
    const shares = parseFloat($('#inputShares').value) || 0;
    const cost = parseFloat($('#inputCost').value) || 0;
    const note = $('#inputNote').value.trim();
    const errorEl = $('#formError');

    if (!code || code.length < 6) {
      errorEl.textContent = '请输入有效的股票代码';
      return;
    }

    // Validate the stock exists
    errorEl.textContent = '验证中...';
    const quotes = await StockAPI.fetchQuotes([code]);
    if (!quotes[code]) {
      errorEl.textContent = '未找到该股票，请检查代码';
      return;
    }

    Storage.addHolding({ code, shares, cost, note });
    holdings = Storage.getHoldings();

    // Reset form
    codeInput.value = '';
    codeInput.dataset.selectedCode = '';
    $('#inputShares').value = '';
    $('#inputCost').value = '';
    $('#inputNote').value = '';
    errorEl.textContent = '';

    hideModal('modalAdd');
    showToast(`已添加 ${quotes[code].name}`, 'success');
    refreshAll();
  }

  // === Edit/Delete ===
  function editHolding(code) {
    const holding = holdings.find(h => h.code === code);
    if (!holding) return;

    hideModal('modalDetail');

    const data = stockData[code];
    const name = data?.quote?.name || '';

    $('#inputCode').value = `${code} ${name}`;
    $('#inputCode').dataset.selectedCode = code;
    $('#inputShares').value = holding.shares || '';
    $('#inputCost').value = holding.cost || '';
    $('#inputNote').value = holding.note || '';

    showModal('modalAdd');
  }

  function deleteHolding(code) {
    if (!confirm('确定删除这只股票的跟踪？')) return;

    Storage.removeHolding(code);
    holdings = Storage.getHoldings();
    delete stockData[code];

    hideModal('modalDetail');
    renderStockGrid();
    renderSummary();
    showToast('已删除', 'info');
  }

  // === Settings ===
  function handleSaveSettings() {
    const settings = {
      refreshInterval: parseInt($('#inputInterval').value) || 30,
      macdSensitivity: $('#selectMacd').value,
      kdjThreshold: $('#selectKdj').value
    };

    Storage.saveSettings(settings);
    hideModal('modalSettings');
    startAutoRefresh();
    showToast('设置已保存', 'success');
  }

  function handleExport() {
    const data = Storage.exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_dashboard_${formatDate(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出', 'success');
  }

  function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = Storage.importData(ev.target.result);
      if (result.success) {
        holdings = Storage.getHoldings();
        renderStockGrid();
        refreshAll();
        showToast(`成功导入 ${result.count} 只股票`, 'success');
      } else {
        showToast('导入失败: ' + result.error, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // === Paste Import ===
  let parsedPasteData = [];

  function parsePasteData(text) {
    const preview = $('#pastePreview');
    const errorEl = $('#pasteError');
    const confirmBtn = $('#btnConfirmPaste');
    errorEl.textContent = '';
    parsedPasteData = [];

    if (!text.trim()) {
      preview.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">粘贴数据后自动解析...</p>';
      confirmBtn.disabled = true;
      return;
    }

    const lines = text.trim().split(/\n/).filter(l => l.trim());
    const results = [];

    for (const line of lines) {
      // Split by tab, comma, multiple spaces, or pipe
      const parts = line.split(/[\t,|]+/).map(s => s.trim()).filter(s => s);
      if (parts.length < 2) continue;

      let code = null, name = null, shares = null, cost = null;

      // Try to identify fields
      for (const part of parts) {
        // Stock code: 6 digits
        const codeMatch = part.match(/\b(\d{6})\b/);
        if (codeMatch && !code) {
          code = codeMatch[1];
          continue;
        }
        // Shares: integer > 10
        const sharesMatch = part.match(/^(\d{1,8})(\.\d+)?$/);
        if (sharesMatch && code && !shares) {
          const val = parseFloat(part);
          // Distinguish shares from cost (shares are usually round numbers > 10)
          if (val >= 10 && val === Math.floor(val)) {
            shares = val;
            continue;
          }
        }
        // Cost price: decimal number
        const costMatch = part.match(/^(\d+\.\d{1,4})$/);
        if (costMatch && code && !cost) {
          cost = parseFloat(part);
          continue;
        }
        // Name: Chinese characters
        const nameMatch = part.match(/[\u4e00-\u9fff]+/);
        if (nameMatch && !name) {
          name = part;
          continue;
        }
      }

      // If no shares found but there's another number, try as cost
      if (code && !shares && !cost) {
        for (const part of parts) {
          const num = parseFloat(part);
          if (!isNaN(num) && num > 0 && part.match(/\d/)) {
            if (num >= 100 && num === Math.floor(num)) {
              shares = num;
            } else if (num < 10000) {
              cost = num;
            }
          }
        }
      }

      if (code) {
        results.push({
          code,
          name: name || '',
          shares: shares || 0,
          cost: cost || 0
        });
      }
    }

    if (results.length === 0) {
      preview.innerHTML = '<p style="color:var(--red);font-size:0.85rem;">未能识别出有效的股票数据，请检查格式</p>';
      confirmBtn.disabled = true;
      return;
    }

    parsedPasteData = results;

    // Render preview table
    let tableHtml = `
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="padding:8px;text-align:left;color:var(--text-muted);">代码</th>
              <th style="padding:8px;text-align:left;color:var(--text-muted);">名称</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted);">数量</th>
              <th style="padding:8px;text-align:right;color:var(--text-muted);">成本价</th>
              <th style="padding:8px;text-align:center;color:var(--text-muted);">状态</th>
            </tr>
          </thead>
          <tbody>`;

    for (const item of results) {
      const existing = holdings.find(h => h.code === item.code);
      const status = existing ? '🔄 更新' : '✨ 新增';
      const statusColor = existing ? 'var(--yellow)' : 'var(--green)';

      tableHtml += `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:8px;font-weight:600;color:var(--blue);">${item.code}</td>
              <td style="padding:8px;">${item.name || '--'}</td>
              <td style="padding:8px;text-align:right;">${item.shares || '--'}</td>
              <td style="padding:8px;text-align:right;">${item.cost ? '¥' + item.cost.toFixed(2) : '--'}</td>
              <td style="padding:8px;text-align:center;color:${statusColor};">${status}</td>
            </tr>`;
    }

    tableHtml += '</tbody></table></div>';
    preview.innerHTML = tableHtml;
    confirmBtn.disabled = false;
  }

  function handleConfirmPaste() {
    if (parsedPasteData.length === 0) return;

    let added = 0, updated = 0;
    for (const item of parsedPasteData) {
      const existing = holdings.find(h => h.code === item.code);
      Storage.addHolding({
        code: item.code,
        shares: item.shares,
        cost: item.cost,
        note: item.name || ''
      });
      if (existing) updated++;
      else added++;
    }

    holdings = Storage.getHoldings();
    hideModal('modalPaste');
    renderStockGrid();
    refreshAll();
    showToast(`导入完成：${added}只新增，${updated}只更新`, 'success');
  }

  // === UI Helpers ===
  function showModal(id) {
    $(`#${id}`).style.display = 'flex';
  }

  function hideModal(id) {
    $(`#${id}`).style.display = 'none';
  }

  function showToast(msg, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) container.remove();
    }, 3000);
  }

  // === Format Helpers ===
  function formatMoney(n) {
    if (Math.abs(n) >= 100000000) return (n / 100000000).toFixed(2) + '亿';
    if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + '万';
    return n.toFixed(2);
  }

  function fmt(n) {
    if (n === null || n === undefined) return '--';
    return n.toFixed(3);
  }

  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  function formatDate(d) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  function getTrendText(trend) {
    const map = {
      'strong_up': '🟢 强势上涨',
      'up': '🟢 上涨',
      'neutral': '🟡 震荡',
      'down': '🔴 下跌',
      'strong_down': '🔴 强势下跌',
      'unknown': '⚪ 未知'
    };
    return map[trend] || trend;
  }

  // === Public API ===
  return {
    init,
    editHolding,
    deleteHolding,
    refreshAll
  };
})();

// Start
document.addEventListener('DOMContentLoaded', App.init);
