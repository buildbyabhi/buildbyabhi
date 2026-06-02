/* =============================================
   SpendWise — Expense Tracker
   app.js — Full Application Logic
============================================= */

'use strict';

// ── PWA: Service Worker Registration ─────────
(function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  let swRegistration = null;
  let deferredInstallPrompt = null;

  // Register SW
  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      console.log('[PWA] Service worker registered:', swRegistration.scope);

      // Check for updates every 30 minutes
      setInterval(() => swRegistration.update(), 30 * 60 * 1000);

      // Listen for new SW waiting to activate
      swRegistration.addEventListener('updatefound', () => {
        const newWorker = swRegistration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBar();
          }
        });
      });
    } catch (err) {
      console.warn('[PWA] Service worker registration failed:', err);
    }
  });

  // ── Update bar ────────────────────────────
  function showUpdateBar() {
    const bar = document.getElementById('pwaUpdateBar');
    if (!bar) return;
    bar.classList.remove('hidden');

    document.getElementById('pwaUpdateBtn')?.addEventListener('click', () => {
      if (swRegistration?.waiting) {
        swRegistration.waiting.postMessage('SKIP_WAITING');
      }
      window.location.reload();
    });

    document.getElementById('pwaUpdateDismiss')?.addEventListener('click', () => {
      bar.classList.add('hidden');
    });
  }

  // ── Install prompt ────────────────────────
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    // Show our custom install banner (after 3 sec delay)
    setTimeout(() => {
      const banner = document.getElementById('pwaInstallBanner');
      if (banner && !localStorage.getItem('pwa_install_dismissed')) {
        banner.classList.remove('hidden');
      }
    }, 3000);
  });

  window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pwaInstallBtn')?.addEventListener('click', async () => {
      const banner = document.getElementById('pwaInstallBanner');
      banner?.classList.add('hidden');
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log('[PWA] Install outcome:', outcome);
      deferredInstallPrompt = null;
    });

    document.getElementById('pwaInstallClose')?.addEventListener('click', () => {
      document.getElementById('pwaInstallBanner')?.classList.add('hidden');
      localStorage.setItem('pwa_install_dismissed', '1');
    });
  });

  // ── Online / Offline indicator ────────────
  let offlineEl = null;

  function showOfflineNotice() {
    if (offlineEl) return;
    offlineEl = document.createElement('div');
    offlineEl.className = 'offline-toast';
    offlineEl.innerHTML = '📵 <span>You\'re offline — SpendWise is still fully available</span>';
    document.body.appendChild(offlineEl);
  }

  function hideOfflineNotice() {
    if (!offlineEl) return;
    offlineEl.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => { offlineEl?.remove(); offlineEl = null; }, 300);
    showToastWhenReady('Back online! ✅', 'success');
  }

  function showToastWhenReady(msg, type) {
    // Wait until showToast is available
    const try_ = () => {
      if (typeof showToast === 'function') showToast(msg, type);
      else setTimeout(try_, 300);
    };
    try_();
  }

  window.addEventListener('offline', showOfflineNotice);
  window.addEventListener('online', hideOfflineNotice);
  if (!navigator.onLine) showOfflineNotice();

  // ── Installed / standalone detection ─────
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] App installed!');
    document.getElementById('pwaInstallBanner')?.classList.add('hidden');
    deferredInstallPrompt = null;
    showToastWhenReady('🎉 SpendWise installed successfully!', 'success');
  });
})();


// ── Constants & Config ──────────────────────
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$' };

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food & Dining', emoji: '🍔', color: '#F97316' },
  { id: 'transport', name: 'Transport', emoji: '🚗', color: '#3B82F6' },
  { id: 'shopping', name: 'Shopping', emoji: '🛍️', color: '#EC4899' },
  { id: 'entertainment', name: 'Entertainment', emoji: '🎬', color: '#8B5CF6' },
  { id: 'health', name: 'Health', emoji: '❤️', color: '#10B981' },
  { id: 'utilities', name: 'Utilities', emoji: '💡', color: '#F59E0B' },
  { id: 'education', name: 'Education', emoji: '📚', color: '#06B6D4' },
  { id: 'travel', name: 'Travel', emoji: '✈️', color: '#84CC16' },
  { id: 'other', name: 'Other', emoji: '📦', color: '#6B7280' },
];

// ── State ────────────────────────────────────
let state = {
  expenses: [],
  budgets: [],
  categories: [...DEFAULT_CATEGORIES],
  currency: 'INR',
  theme: 'auto',
  currentPage: 'dashboard',
};

// ── Charts ───────────────────────────────────
let categoryChartInstance = null;
let trendChartInstance = null;
let weekdayChartInstance = null;
let dailyChartInstance = null;

// ── Storage ──────────────────────────────────
function saveState() {
  localStorage.setItem('spendwise_state', JSON.stringify({
    expenses: state.expenses,
    budgets: state.budgets,
    categories: state.categories,
    currency: state.currency,
    theme: state.theme,
  }));
}

function loadState() {
  try {
    const saved = localStorage.getItem('spendwise_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      state.expenses = parsed.expenses || [];
      state.budgets = parsed.budgets || [];
      state.categories = parsed.categories || [...DEFAULT_CATEGORIES];
      state.currency = parsed.currency || 'INR';
      state.theme = parsed.theme || 'auto';
    }
  } catch (e) {
    console.warn('Failed to load state', e);
  }
}

// ── Utilities ────────────────────────────────
function formatAmount(amount, currency) {
  const cur = currency || state.currency;
  const sym = CURRENCY_SYMBOLS[cur] || cur;
  const val = parseFloat(amount);
  if (isNaN(val)) return `${sym}0`;
  if (cur === 'JPY') return `${sym}${Math.round(val).toLocaleString()}`;
  return `${sym}${val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getCategory(id) {
  return state.categories.find(c => c.id === id) || { name: id, emoji: '📦', color: '#6B7280' };
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getMonthRange(offset = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
  return { start, end };
}

function getExpensesInRange(start, end) {
  return state.expenses.filter(e => e.date >= start && e.date <= end);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Theme ────────────────────────────────────
function applyTheme(theme) {
  state.theme = theme;
  const html = document.documentElement;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', theme);
  }
  const label = document.getElementById('themeLabel');
  if (label) label.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
}

// ── Toast ─────────────────────────────────────
function showToast(message, type = 'success') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3100);
}

// ── Navigation ───────────────────────────────
function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.remove('hidden');
  const navItem = document.getElementById(`nav-${page}`);
  if (navItem) navItem.classList.add('active');
  const titles = {
    dashboard: ['Dashboard', 'Welcome back! Here\'s your financial overview.'],
    transactions: ['Transactions', 'Browse and manage all your expenses.'],
    budgets: ['Budgets', 'Set and track your spending limits.'],
    analytics: ['Analytics', 'Deep insights into your spending patterns.'],
    settings: ['Settings', 'Customize your SpendWise experience.'],
  };
  const [title, subtitle] = titles[page] || ['SpendWise', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSubtitle').textContent = subtitle;

  if (page === 'dashboard') refreshDashboard();
  if (page === 'transactions') refreshTransactionsList();
  if (page === 'budgets') refreshBudgets();
  if (page === 'analytics') refreshAnalytics();
  if (page === 'settings') refreshSettings();
}

// ── Dashboard ────────────────────────────────
function refreshDashboard() {
  const { start: mStart, end: mEnd } = getMonthRange(0);
  const { start: pmStart, end: pmEnd } = getMonthRange(-1);

  const totalAll = state.expenses.reduce((s, e) => s + e.amount, 0);
  const monthExpenses = getExpensesInRange(mStart, mEnd);
  const prevMonthExpenses = getExpensesInRange(pmStart, pmEnd);
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const prevMonthTotal = prevMonthExpenses.reduce((s, e) => s + e.amount, 0);

  document.getElementById('totalSpent').textContent = formatAmount(totalAll);
  document.getElementById('monthSpent').textContent = formatAmount(monthTotal);
  document.getElementById('totalTransactions').textContent = state.expenses.length;

  if (prevMonthTotal > 0) {
    const pct = ((monthTotal - prevMonthTotal) / prevMonthTotal * 100).toFixed(1);
    const sign = pct >= 0 ? '+' : '';
    document.getElementById('monthChange').textContent = `${sign}${pct}% vs last month`;
    document.getElementById('monthChange').style.color = pct >= 0 ? 'var(--danger)' : 'var(--success)';
  }

  // Budget left
  const totalBudget = state.budgets.reduce((s, b) => s + b.amount, 0);
  const left = totalBudget - monthTotal;
  document.getElementById('budgetLeft').textContent = totalBudget > 0 ? formatAmount(Math.max(0, left)) : '—';
  if (totalBudget > 0 && left < 0) {
    document.getElementById('budgetChange').textContent = `Over by ${formatAmount(Math.abs(left))}`;
    document.getElementById('budgetChange').style.color = 'var(--danger)';
  }

  // Recent transactions
  const recent = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  renderTransactionItems(document.getElementById('recentTransactions'), recent, 'dashboardEmpty');

  // Charts
  renderCategoryChart();
  renderTrendChart();
}

// ── Category Chart ───────────────────────────
function renderCategoryChart() {
  const period = document.getElementById('chartPeriod')?.value || 'month';
  let expenses = [];
  if (period === 'month') {
    const { start, end } = getMonthRange(0);
    expenses = getExpensesInRange(start, end);
  } else if (period === 'year') {
    const y = new Date().getFullYear();
    expenses = state.expenses.filter(e => e.date.startsWith(y.toString()));
  } else {
    expenses = state.expenses;
  }

  const catTotals = {};
  expenses.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
  });

  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const labels = sorted.map(([id]) => getCategory(id).name);
  const data = sorted.map(([, v]) => v);
  const colors = sorted.map(([id]) => getCategory(id).color);
  const total = data.reduce((s, v) => s + v, 0);

  document.getElementById('donutTotal').textContent = formatAmount(total);

  const ctx = document.getElementById('categoryChart').getContext('2d');
  if (categoryChartInstance) categoryChartInstance.destroy();

  if (data.length === 0) {
    document.getElementById('categoryLegend').innerHTML = '<span style="color:var(--text-muted);font-size:0.82rem">No data</span>';
    return;
  }

  categoryChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: 'var(--bg-card)',
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: { legend: { display: false }, tooltip: {
        callbacks: {
          label: ctx => ` ${formatAmount(ctx.parsed)} (${((ctx.parsed / total) * 100).toFixed(1)}%)`
        }
      }},
    }
  });

  const legend = document.getElementById('categoryLegend');
  legend.innerHTML = sorted.slice(0, 6).map(([id, val]) => {
    const cat = getCategory(id);
    const pct = ((val / total) * 100).toFixed(0);
    return `<div class="legend-item"><span class="legend-dot" style="background:${cat.color}"></span><span>${cat.name} ${pct}%</span></div>`;
  }).join('');
}

// ── Trend Chart ──────────────────────────────
function renderTrendChart() {
  const months = parseInt(document.getElementById('trendPeriod')?.value || '6');
  const labels = [];
  const data = [];

  for (let i = months - 1; i >= 0; i--) {
    const { start, end } = getMonthRange(-i);
    const d = new Date(start + 'T00:00:00');
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));
    const total = getExpensesInRange(start, end).reduce((s, e) => s + e.amount, 0);
    data.push(total);
  }

  const ctx = document.getElementById('trendChart').getContext('2d');
  if (trendChartInstance) trendChartInstance.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';

  trendChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Spending',
        data,
        backgroundColor: data.map((_, i) => i === data.length - 1 ? 'hsl(258, 85%, 65%)' : 'hsl(258, 85%, 65%, 0.35)'),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${formatAmount(ctx.parsed.y)}` } }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        y: {
          grid: { color: gridColor },
          ticks: {
            color: textColor,
            font: { size: 11 },
            callback: v => formatAmount(v)
          }
        }
      }
    }
  });
}

// ── Transactions ─────────────────────────────
function renderTransactionItems(container, expenses, emptyId) {
  const empty = document.getElementById(emptyId);
  if (expenses.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    else container.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><p>No matching transactions.</p></div>`;
    return;
  }
  if (empty) empty.style.display = 'none';

  container.innerHTML = expenses.map(e => {
    const cat = getCategory(e.category);
    const bgColor = hexToRgba(cat.color, 0.15);
    const recBadge = e.recurring ? `<span class="recurring-badge">↻ ${e.recurringFrequency || 'monthly'}</span>` : '';
    return `
      <div class="transaction-item" data-id="${e.id}">
        <div class="transaction-cat-icon" style="background:${bgColor};">${cat.emoji}</div>
        <div class="transaction-details">
          <div class="transaction-desc">${escapeHtml(e.description)}</div>
          <div class="transaction-meta">
            <span class="transaction-cat-tag" style="background:${bgColor};color:${cat.color}">${cat.name}</span>
            <span>${formatDate(e.date)}</span>
            ${recBadge}
            ${e.note ? `<span title="${escapeHtml(e.note)}">📝</span>` : ''}
          </div>
        </div>
        <div class="transaction-amount">${formatAmount(e.amount, e.currency)}</div>
        <div class="transaction-actions">
          <button class="icon-btn edit-btn" data-id="${e.id}" title="Edit" aria-label="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn delete-btn" data-id="${e.id}" title="Delete" aria-label="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>`;
  }).join('');
}

function refreshTransactionsList() {
  const category = document.getElementById('filterCategory').value;
  const month = document.getElementById('filterMonth').value;
  const search = document.getElementById('filterSearch').value.toLowerCase();

  let filtered = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
  if (category) filtered = filtered.filter(e => e.category === category);
  if (month) filtered = filtered.filter(e => e.date.startsWith(month));
  if (search) filtered = filtered.filter(e =>
    e.description.toLowerCase().includes(search) ||
    getCategory(e.category).name.toLowerCase().includes(search)
  );

  renderTransactionItems(document.getElementById('allTransactionsList'), filtered, null);
}

// ── Budgets ──────────────────────────────────
function refreshBudgets() {
  const grid = document.getElementById('budgetsGrid');
  if (state.budgets.length === 0) {
    grid.innerHTML = `<div class="empty-state card" style="grid-column:1/-1"><div class="empty-icon">🎯</div><p>No budgets set. Click "Set Budget" to add one!</p></div>`;
    return;
  }

  const { start, end } = getMonthRange(0);
  const monthExpenses = getExpensesInRange(start, end);

  grid.innerHTML = state.budgets.map(budget => {
    const cat = getCategory(budget.category);
    const spent = monthExpenses
      .filter(e => e.category === budget.category)
      .reduce((s, e) => s + e.amount, 0);
    const pct = budget.amount > 0 ? Math.min((spent / budget.amount) * 100, 100) : 0;
    const rawPct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
    const level = rawPct >= 100 ? 'danger' : rawPct >= 75 ? 'warn' : 'safe';
    const bgColor = hexToRgba(cat.color, 0.12);

    return `
      <div class="budget-card">
        <div class="budget-card-header">
          <div class="budget-cat-info">
            <div class="budget-icon" style="background:${bgColor}">${cat.emoji}</div>
            <div>
              <div class="budget-cat-name">${cat.name}</div>
            </div>
          </div>
          <button class="budget-delete-btn" data-budget-id="${budget.id}" title="Delete budget" aria-label="Delete budget">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="budget-amounts">
          <span class="budget-spent">${formatAmount(spent)}</span>
          <span class="budget-limit">of ${formatAmount(budget.amount)}</span>
        </div>
        <div class="budget-bar-track">
          <div class="budget-bar-fill ${level}" style="width:${pct}%"></div>
        </div>
        <span class="budget-pct ${level}">${rawPct.toFixed(0)}% used${rawPct >= 100 ? ' — Over budget!' : ''}</span>
      </div>`;
  }).join('');
}

// ── Analytics ────────────────────────────────
function refreshAnalytics() {
  renderWeekdayChart();
  renderDailyChart();
  renderTopCategories();
  renderInsights();
}

function renderWeekdayChart() {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const totals = Array(7).fill(0);
  state.expenses.forEach(e => {
    const d = new Date(e.date + 'T00:00:00');
    totals[d.getDay()] += e.amount;
  });

  const ctx = document.getElementById('weekdayChart').getContext('2d');
  if (weekdayChartInstance) weekdayChartInstance.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  const maxIdx = totals.indexOf(Math.max(...totals));

  weekdayChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{
        data: totals,
        backgroundColor: totals.map((_, i) => i === maxIdx ? '#F97316' : 'hsl(258, 85%, 65%, 0.4)'),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${formatAmount(ctx.parsed.y)}` } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => formatAmount(v) } }
      }
    }
  });
}

function renderDailyChart() {
  const today = new Date();
  const labels = [];
  const data = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const str = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }));
    const total = state.expenses.filter(e => e.date === str).reduce((s, e) => s + e.amount, 0);
    data.push(total);
  }

  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (dailyChartInstance) dailyChartInstance.destroy();

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';

  dailyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Spending',
        data,
        borderColor: 'hsl(258, 85%, 65%)',
        backgroundColor: 'hsl(258, 85%, 65%, 0.1)',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${formatAmount(ctx.parsed.y)}` } } },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, maxTicksLimit: 10, maxRotation: 0 }
        },
        y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => formatAmount(v) } }
      }
    }
  });
}

function renderTopCategories() {
  const catTotals = {};
  state.expenses.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
  });

  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = sorted[0]?.[1] || 1;

  document.getElementById('topCategories').innerHTML = sorted.length === 0
    ? '<div class="empty-state"><div class="empty-icon">📊</div><p>No data yet</p></div>'
    : sorted.map(([id, val], i) => {
        const cat = getCategory(id);
        return `
          <div class="top-cat-item">
            <div class="top-cat-rank">${i + 1}</div>
            <div class="top-cat-bar-wrapper">
              <div class="top-cat-info">
                <span class="top-cat-name">${cat.emoji} ${cat.name}</span>
                <span class="top-cat-amount">${formatAmount(val)}</span>
              </div>
              <div class="top-cat-bar-track">
                <div class="top-cat-bar-fill" style="width:${(val / max * 100).toFixed(0)}%;background:${cat.color}"></div>
              </div>
            </div>
          </div>`;
      }).join('');
}

function renderInsights() {
  const insights = [];
  if (state.expenses.length === 0) {
    document.getElementById('insightsList').innerHTML = `<div class="empty-state"><div class="empty-icon">💡</div><p>Add expenses to get insights!</p></div>`;
    return;
  }

  // Most expensive category
  const catTotals = {};
  state.expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const cat = getCategory(topCat[0]);
    insights.push({ icon: '🏆', text: `Your biggest spending category is <strong>${cat.name}</strong> at <strong>${formatAmount(topCat[1])}</strong> total.` });
  }

  // Average daily spend (last 30 days)
  const { start } = getMonthRange(0);
  const monthExp = getExpensesInRange(start, getTodayStr());
  if (monthExp.length > 0) {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const avg = monthExp.reduce((s, e) => s + e.amount, 0) / dayOfMonth;
    insights.push({ icon: '📅', text: `Your average daily spending this month is <strong>${formatAmount(avg)}</strong>.` });
  }

  // Recurring expenses
  const recurringCount = state.expenses.filter(e => e.recurring).length;
  if (recurringCount > 0) {
    const recurringTotal = state.expenses.filter(e => e.recurring && e.recurringFrequency === 'monthly').reduce((s, e) => s + e.amount, 0);
    insights.push({ icon: '🔄', text: `You have <strong>${recurringCount}</strong> recurring expenses. Monthly recurring: <strong>${formatAmount(recurringTotal)}</strong>.` });
  }

  // Budget alert
  const { start: mStart, end: mEnd } = getMonthRange(0);
  const mExpenses = getExpensesInRange(mStart, mEnd);
  state.budgets.forEach(b => {
    const spent = mExpenses.filter(e => e.category === b.category).reduce((s, e) => s + e.amount, 0);
    const pct = (spent / b.amount) * 100;
    if (pct >= 90) {
      const cat = getCategory(b.category);
      insights.push({ icon: '⚠️', text: `${cat.name} budget is at <strong>${pct.toFixed(0)}%</strong>. You've spent <strong>${formatAmount(spent)}</strong> of your <strong>${formatAmount(b.amount)}</strong> limit.` });
    }
  });

  // Total transactions
  insights.push({ icon: '📊', text: `You have recorded <strong>${state.expenses.length}</strong> total transactions across <strong>${Object.keys(catTotals).length}</strong> categories.` });

  document.getElementById('insightsList').innerHTML = insights.map(i =>
    `<div class="insight-item"><span class="insight-icon">${i.icon}</span><span class="insight-text">${i.text}</span></div>`
  ).join('');
}

// ── Settings ─────────────────────────────────
function refreshSettings() {
  document.getElementById('settingsCurrency').value = state.currency;
  renderCategoriesList();
}

function renderCategoriesList() {
  document.getElementById('categoriesList').innerHTML = state.categories.map(cat =>
    `<div class="category-chip">
      <span class="category-chip-dot" style="background:${cat.color}"></span>
      <span>${cat.emoji} ${cat.name}</span>
      ${DEFAULT_CATEGORIES.some(d => d.id === cat.id) ? '' : `<button class="category-chip-delete" data-cat-id="${cat.id}" title="Delete category">✕</button>`}
    </div>`
  ).join('');
}

// ── Category Dropdowns ───────────────────────
function populateCategorySelects() {
  const selects = ['expenseCategory', 'budgetCategory', 'filterCategory'];
  selects.forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = id === 'filterCategory' ? '<option value="">All Categories</option>' : '';
    state.categories.forEach(cat => {
      sel.innerHTML += `<option value="${cat.id}">${cat.emoji} ${cat.name}</option>`;
    });
    if (current) sel.value = current;
  });
}

// ── Add / Edit Expense ───────────────────────
function openAddExpenseModal(id = null) {
  const overlay = document.getElementById('addExpenseOverlay');
  const form = document.getElementById('addExpenseForm');
  form.reset();
  document.getElementById('editExpenseId').value = '';
  document.getElementById('recurringOptions').classList.add('hidden');
  document.getElementById('expenseDate').value = getTodayStr();
  document.getElementById('expenseCurrency').value = state.currency;
  document.getElementById('amountPrefix').textContent = CURRENCY_SYMBOLS[state.currency];
  document.getElementById('modalTitle').textContent = 'Add Expense';
  document.getElementById('submitExpense').textContent = 'Add Expense';

  if (id) {
    const expense = state.expenses.find(e => e.id === id);
    if (expense) {
      document.getElementById('editExpenseId').value = id;
      document.getElementById('expenseAmount').value = expense.amount;
      document.getElementById('expenseDescription').value = expense.description;
      document.getElementById('expenseCategory').value = expense.category;
      document.getElementById('expenseDate').value = expense.date;
      document.getElementById('expenseNote').value = expense.note || '';
      document.getElementById('expenseRecurring').checked = expense.recurring || false;
      document.getElementById('expenseCurrency').value = expense.currency || state.currency;
      if (expense.recurring) {
        document.getElementById('recurringOptions').classList.remove('hidden');
        document.getElementById('recurringFrequency').value = expense.recurringFrequency || 'monthly';
      }
      document.getElementById('modalTitle').textContent = 'Edit Expense';
      document.getElementById('submitExpense').textContent = 'Save Changes';
    }
  }

  overlay.classList.add('open');
}

function closeAddExpenseModal() {
  document.getElementById('addExpenseOverlay').classList.remove('open');
}

function handleAddExpenseSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editExpenseId').value;
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const description = document.getElementById('expenseDescription').value.trim();
  const category = document.getElementById('expenseCategory').value;
  const date = document.getElementById('expenseDate').value;
  const note = document.getElementById('expenseNote').value.trim();
  const recurring = document.getElementById('expenseRecurring').checked;
  const recurringFrequency = document.getElementById('recurringFrequency').value;
  const currency = document.getElementById('expenseCurrency').value;

  if (!amount || !description || !category || !date) return;

  if (id) {
    const idx = state.expenses.findIndex(e => e.id === id);
    if (idx !== -1) {
      state.expenses[idx] = { ...state.expenses[idx], amount, description, category, date, note, recurring, recurringFrequency, currency };
      showToast('Expense updated!', 'success');
    }
  } else {
    state.expenses.push({ id: generateId(), amount, description, category, date, note, recurring, recurringFrequency, currency });
    showToast('Expense added!', 'success');
  }

  saveState();
  closeAddExpenseModal();
  navigateTo(state.currentPage);
}

// ── Delete ────────────────────────────────────
let pendingDeleteId = null;
let pendingDeleteType = null;

function openConfirm(message, onConfirm) {
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmOverlay').classList.add('open');
  document.getElementById('confirmDelete').onclick = () => {
    onConfirm();
    document.getElementById('confirmOverlay').classList.remove('open');
  };
}

// ── Export CSV ────────────────────────────────
function exportCSV(expenses) {
  const rows = [
    ['Date', 'Description', 'Category', 'Amount', 'Currency', 'Note', 'Recurring']
  ];
  expenses.forEach(e => {
    const cat = getCategory(e.category);
    rows.push([
      e.date,
      `"${e.description.replace(/"/g, '""')}"`,
      cat.name,
      e.amount,
      e.currency || state.currency,
      `"${(e.note || '').replace(/"/g, '""')}"`,
      e.recurring ? e.recurringFrequency : 'No'
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `spendwise_export_${getTodayStr()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported!', 'success');
}

// ── HTML Escape ───────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Event Listeners ───────────────────────────
function initEventListeners() {
  // Sidebar toggle
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('collapsed');
    document.body.classList.toggle('sidebar-collapsed');
  });

  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(item.dataset.page);
    });
  });

  // View All → Transactions
  document.getElementById('viewAllBtn').addEventListener('click', () => navigateTo('transactions'));

  // Theme toggle (sidebar)
  document.getElementById('themeToggle').addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
    saveState();
  });

  // Theme options (settings)
  document.querySelectorAll('.theme-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      saveState();
    });
  });

  // Add Expense button
  document.getElementById('openAddExpense').addEventListener('click', () => openAddExpenseModal());
  document.getElementById('closeAddExpense').addEventListener('click', closeAddExpenseModal);
  document.getElementById('cancelExpense').addEventListener('click', closeAddExpenseModal);
  document.getElementById('addExpenseOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeAddExpenseModal();
  });

  // Import button
  document.getElementById('openImport').addEventListener('click', openImportModal);

  // Expense form submit
  document.getElementById('addExpenseForm').addEventListener('submit', handleAddExpenseSubmit);

  // Recurring toggle
  document.getElementById('expenseRecurring').addEventListener('change', e => {
    document.getElementById('recurringOptions').classList.toggle('hidden', !e.target.checked);
  });

  // Currency selector (topbar)
  document.getElementById('currencySelector').addEventListener('change', e => {
    state.currency = e.target.value;
    document.getElementById('settingsCurrency').value = state.currency;
    document.getElementById('amountPrefix').textContent = CURRENCY_SYMBOLS[state.currency];
    document.getElementById('budgetPrefix').textContent = CURRENCY_SYMBOLS[state.currency];
    saveState();
    navigateTo(state.currentPage);
  });

  // Currency selector (settings)
  document.getElementById('settingsCurrency').addEventListener('change', e => {
    state.currency = e.target.value;
    document.getElementById('currencySelector').value = state.currency;
    saveState();
    navigateTo(state.currentPage);
  });

  // Chart period selectors
  document.getElementById('chartPeriod')?.addEventListener('change', renderCategoryChart);
  document.getElementById('trendPeriod')?.addEventListener('change', renderTrendChart);

  // Transaction actions (event delegation)
  document.getElementById('recentTransactions').addEventListener('click', handleTransactionClick);
  document.getElementById('allTransactionsList').addEventListener('click', handleTransactionClick);

  // Filters
  ['filterCategory', 'filterMonth', 'filterSearch'].forEach(id => {
    document.getElementById(id).addEventListener('input', refreshTransactionsList);
    document.getElementById(id).addEventListener('change', refreshTransactionsList);
  });

  document.getElementById('clearFilters').addEventListener('click', () => {
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterSearch').value = '';
    refreshTransactionsList();
  });

  // Export CSV
  document.getElementById('exportCsvBtn').addEventListener('click', () => exportCSV(state.expenses));
  document.getElementById('exportAllBtn').addEventListener('click', () => exportCSV(state.expenses));

  // Budget modal
  document.getElementById('openAddBudget').addEventListener('click', () => {
    document.getElementById('addBudgetOverlay').classList.add('open');
    document.getElementById('budgetPrefix').textContent = CURRENCY_SYMBOLS[state.currency];
  });
  document.getElementById('closeAddBudget').addEventListener('click', () => {
    document.getElementById('addBudgetOverlay').classList.remove('open');
  });
  document.getElementById('cancelBudget').addEventListener('click', () => {
    document.getElementById('addBudgetOverlay').classList.remove('open');
  });
  document.getElementById('addBudgetOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('addBudgetOverlay').classList.remove('open');
  });

  // Budget form submit
  document.getElementById('addBudgetForm').addEventListener('submit', e => {
    e.preventDefault();
    const category = document.getElementById('budgetCategory').value;
    const amount = parseFloat(document.getElementById('budgetAmount').value);
    if (!category || !amount) return;
    const existing = state.budgets.findIndex(b => b.category === category);
    if (existing !== -1) {
      state.budgets[existing].amount = amount;
      showToast('Budget updated!', 'success');
    } else {
      state.budgets.push({ id: generateId(), category, amount });
      showToast('Budget set!', 'success');
    }
    saveState();
    document.getElementById('addBudgetOverlay').classList.remove('open');
    refreshBudgets();
  });

  // Budget delete (event delegation)
  document.getElementById('budgetsGrid').addEventListener('click', e => {
    const btn = e.target.closest('[data-budget-id]');
    if (!btn) return;
    const id = btn.dataset.budgetId;
    openConfirm('Delete this budget?', () => {
      state.budgets = state.budgets.filter(b => b.id !== id);
      saveState();
      refreshBudgets();
      showToast('Budget deleted', 'info');
    });
  });

  // Confirm cancel
  document.getElementById('cancelConfirm').addEventListener('click', () => {
    document.getElementById('confirmOverlay').classList.remove('open');
  });
  document.getElementById('confirmOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('confirmOverlay').classList.remove('open');
  });

  // Settings: add category
  document.getElementById('addCategoryBtn').addEventListener('click', () => {
    const name = document.getElementById('newCategoryName').value.trim();
    const color = document.getElementById('newCategoryColor').value;
    if (!name) { showToast('Please enter a category name', 'error'); return; }
    const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();
    state.categories.push({ id, name, emoji: '📦', color });
    saveState();
    populateCategorySelects();
    renderCategoriesList();
    document.getElementById('newCategoryName').value = '';
    showToast('Category added!', 'success');
  });

  // Settings: delete category (event delegation)
  document.getElementById('categoriesList').addEventListener('click', e => {
    const btn = e.target.closest('[data-cat-id]');
    if (!btn) return;
    const id = btn.dataset.catId;
    openConfirm('Delete this category?', () => {
      state.categories = state.categories.filter(c => c.id !== id);
      saveState();
      populateCategorySelects();
      renderCategoriesList();
      showToast('Category deleted', 'info');
    });
  });

  // Clear all data
  document.getElementById('clearAllDataBtn').addEventListener('click', () => {
    openConfirm('This will permanently delete ALL your data. Are you sure?', () => {
      state.expenses = [];
      state.budgets = [];
      saveState();
      showToast('All data cleared', 'info');
      navigateTo('dashboard');
    });
  });

  // Add sample data keyboard shortcut (Ctrl+Shift+D)
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') addSampleData();
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(o => o.classList.remove('open'));
    }
  });
}

function handleTransactionClick(e) {
  const editBtn = e.target.closest('.edit-btn');
  const deleteBtn = e.target.closest('.delete-btn');
  if (editBtn) {
    openAddExpenseModal(editBtn.dataset.id);
  } else if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    openConfirm('Delete this expense?', () => {
      state.expenses = state.expenses.filter(ex => ex.id !== id);
      saveState();
      navigateTo(state.currentPage);
      showToast('Expense deleted', 'info');
    });
  }
}

// ── Sample Data ───────────────────────────────
function addSampleData() {
  if (state.expenses.length > 0) { showToast('Sample data already loaded', 'info'); return; }
  const today = new Date();
  const samples = [
    { desc: 'Grocery shopping', cat: 'food', amount: 1850, days: 1 },
    { desc: 'Uber to office', cat: 'transport', amount: 180, days: 1 },
    { desc: 'Netflix subscription', cat: 'entertainment', amount: 649, days: 2, recurring: true, freq: 'monthly' },
    { desc: 'Lunch at restaurant', cat: 'food', amount: 520, days: 2 },
    { desc: 'New shoes', cat: 'shopping', amount: 3500, days: 3 },
    { desc: 'Doctor visit', cat: 'health', amount: 800, days: 4 },
    { desc: 'Electricity bill', cat: 'utilities', amount: 1200, days: 5, recurring: true, freq: 'monthly' },
    { desc: 'Online course', cat: 'education', amount: 2999, days: 7 },
    { desc: 'Dinner with friends', cat: 'food', amount: 1250, days: 8 },
    { desc: 'Petrol', cat: 'transport', amount: 900, days: 10 },
    { desc: 'Amazon shopping', cat: 'shopping', amount: 2400, days: 12 },
    { desc: 'Movie tickets', cat: 'entertainment', amount: 450, days: 13 },
    { desc: 'Gym membership', cat: 'health', amount: 1500, days: 15, recurring: true, freq: 'monthly' },
    { desc: 'Internet bill', cat: 'utilities', amount: 799, days: 16, recurring: true, freq: 'monthly' },
    { desc: 'Swiggy order', cat: 'food', amount: 380, days: 18 },
    { desc: 'Train tickets', cat: 'travel', amount: 2800, days: 20 },
    { desc: 'Books', cat: 'education', amount: 650, days: 22 },
    { desc: 'Auto rickshaw', cat: 'transport', amount: 95, days: 25 },
    { desc: 'Coffee shop', cat: 'food', amount: 220, days: 28 },
    { desc: 'Spotify', cat: 'entertainment', amount: 119, days: 30, recurring: true, freq: 'monthly' },
  ];

  samples.forEach(s => {
    const d = new Date(today);
    d.setDate(d.getDate() - s.days);
    state.expenses.push({
      id: generateId(),
      amount: s.amount,
      description: s.desc,
      category: s.cat,
      date: d.toISOString().split('T')[0],
      note: '',
      currency: 'INR',
      recurring: s.recurring || false,
      recurringFrequency: s.freq || 'monthly',
    });
  });

  state.budgets = [
    { id: generateId(), category: 'food', amount: 8000 },
    { id: generateId(), category: 'transport', amount: 3000 },
    { id: generateId(), category: 'entertainment', amount: 2000 },
    { id: generateId(), category: 'shopping', amount: 5000 },
    { id: generateId(), category: 'health', amount: 3000 },
  ];

  saveState();
  navigateTo(state.currentPage);
  showToast('Sample data loaded! (Ctrl+Shift+D)', 'success');
}

// ══════════════════════════════════════════════════
// IMPORT MODULE — Excel / CSV / PDF
// ══════════════════════════════════════════════════

// Internal state for the import wizard
let importState = {
  file: null,
  fileType: null,      // 'excel' | 'pdf'
  rawRows: [],         // array of arrays (from SheetJS) or parsed objects (from PDF)
  headers: [],         // column header strings (Excel)
  mapping: {},         // { date, description, amount, category, note } -> column index
  parsedRows: [],      // [{date,description,amount,category,note,status}]
  step: 1,
};

// ── Open / Close ──────────────────────────────────
function openImportModal() {
  resetImportWizard();
  // Populate the default-category select in step 3
  const sel = document.getElementById('importDefaultCat');
  sel.innerHTML = '';
  state.categories.forEach(cat => {
    sel.innerHTML += `<option value="${cat.id}">${cat.emoji} ${cat.name}</option>`;
  });
  sel.value = 'other';
  document.getElementById('importOverlay').classList.add('open');
}

function closeImportModal() {
  document.getElementById('importOverlay').classList.remove('open');
}

function resetImportWizard() {
  importState = { file: null, fileType: null, rawRows: [], headers: [], mapping: {}, parsedRows: [], step: 1 };
  goToImportStep(1);
  document.getElementById('importDropzone').classList.remove('hidden');
  document.getElementById('importFileInfo').classList.add('hidden');
  document.getElementById('importNextStep1').disabled = true;
  document.getElementById('importFileInput').value = '';
  document.getElementById('importLoadingMsg').textContent = 'Processing file…';
  document.getElementById('importLoading').classList.add('hidden');
}

// ── Step navigation ───────────────────────────────
function goToImportStep(step) {
  importState.step = step;
  [1, 2, 3].forEach(s => {
    document.getElementById(`import-panel-${s}`).classList.toggle('hidden', s !== step);
    const el = document.getElementById(`istep-${s}`);
    el.classList.toggle('active', s === step);
    el.classList.toggle('done', s < step);
  });
}

// ── File selection ────────────────────────────────
function handleImportFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv', 'pdf'].includes(ext)) {
    showToast('Unsupported file type. Please use Excel, CSV, or PDF.', 'error');
    return;
  }
  importState.file = file;
  importState.fileType = ext === 'pdf' ? 'pdf' : 'excel';

  // Show file info card
  document.getElementById('importDropzone').classList.add('hidden');
  const info = document.getElementById('importFileInfo');
  info.classList.remove('hidden');
  document.getElementById('importFileName').textContent = file.name;
  document.getElementById('importFileSize').textContent = formatFileSize(file.size);
  document.getElementById('importFileIcon').textContent = ext === 'pdf' ? '\uD83D\uDCC4' : '\uD83D\uDCCA';
  document.getElementById('importNextStep1').disabled = false;

  // For PDF: Step 2 (mapping) is skipped — go directly to 3
  document.getElementById('importNextStep1').textContent =
    importState.fileType === 'pdf' ? 'Next: Preview \u2192' : 'Next: Map Columns \u2192';
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Excel / CSV parsing (SheetJS) ────────────────
async function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'YYYY-MM-DD' });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Auto-detect column index by common header names
function autoDetectColumns(headers) {
  const lower = headers.map(h => String(h || '').toLowerCase().trim());
  const find = (...keys) => {
    for (const k of keys) {
      const idx = lower.findIndex(h => h.includes(k));
      if (idx !== -1) return idx;
    }
    return '';
  };
  return {
    date: find('date', 'dt', 'time', 'day'),
    description: find('desc', 'narr', 'detail', 'particular', 'remark', 'note', 'transaction', 'name', 'merchant'),
    amount: find('amount', 'amt', 'debit', 'credit', 'value', 'sum', 'spend', 'price'),
    category: find('category', 'cat', 'type', 'group'),
    note: find('note', 'memo', 'remark', 'comment'),
  };
}

function buildColMapUI(headers) {
  const auto = autoDetectColumns(headers);
  const fields = [
    { key: 'date', label: 'Date', required: true },
    { key: 'description', label: 'Description', required: true },
    { key: 'amount', label: 'Amount', required: true },
    { key: 'category', label: 'Category', required: false },
    { key: 'note', label: 'Note', required: false },
  ];

  const optionNone = `<option value="">— Not mapped —</option>`;
  const optionsList = headers.map((h, i) => `<option value="${i}">${h || `Column ${i + 1}`}</option>`).join('');

  document.getElementById('colMapGrid').innerHTML = fields.map(f => `
    <div class="col-map-item">
      <label>${f.label} ${f.required ? '<span class="col-map-required">*</span>' : ''}</label>
      <select id="colmap-${f.key}">
        ${f.required ? '' : optionNone}
        ${optionsList}
      </select>
    </div>
  `).join('');

  // Apply auto-detected values
  fields.forEach(f => {
    const sel = document.getElementById(`colmap-${f.key}`);
    if (auto[f.key] !== '') sel.value = String(auto[f.key]);
  });
}

function buildSampleTable(headers, rows) {
  const sample = rows.slice(0, 5);
  const thead = `<thead><tr>${headers.map(h => `<th>${escapeHtml(String(h || ''))}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${sample.map(r =>
    `<tr>${headers.map((_, i) => `<td>${escapeHtml(String(r[i] ?? ''))}</td>`).join('')}</tr>`
  ).join('')}</tbody>`;
  document.getElementById('importSampleTable').innerHTML = thead + tbody;
}

// ── PDF parsing (PDF.js) ──────────────────────────
async function parsePdfFile(file) {
  // Configure PDF.js worker
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let allText = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Group items by Y position to reconstruct rows
    const lines = {};
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push({ x: item.transform[4], text: item.str });
    });
    const sorted = Object.keys(lines)
      .sort((a, b) => b - a)
      .map(y => lines[y].sort((a, b) => a.x - b.x).map(i => i.text).join(' '));
    allText += sorted.join('\n') + '\n';
  }
  return parsePdfTransactions(allText);
}

// Heuristic parser for bank statement text
function parsePdfTransactions(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Date patterns: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Mon YYYY, DD Mon YY
  const dateRe = /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/i;
  // Amount: numbers with optional commas/dots, optionally preceded by ₹/$
  const amtRe = /(?:[₹$€£]\s*)?(\d{1,3}(?:[,.]\d{3})*(?:\.\d{1,2})?|\d+\.\d{1,2})/g;

  lines.forEach(line => {
    const dateMatch = line.match(dateRe);
    if (!dateMatch) return;

    // Extract all amounts from the line
    const amounts = [];
    let m;
    while ((m = amtRe.exec(line)) !== null) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (!isNaN(val) && val > 0 && val < 10_000_000) amounts.push(val);
    }
    amtRe.lastIndex = 0;
    if (amounts.length === 0) return;

    // Description: text between date and first amount
    const afterDate = line.slice(dateMatch.index + dateMatch[0].length).trim();
    let description = afterDate.replace(/[₹$€£]?\s*\d{1,3}(?:[,.]\d{3})*(?:\.\d{1,2})?/g, '').trim();
    description = description.replace(/\s{2,}/g, ' ').trim();
    if (!description || description.length < 2) description = 'Transaction';

    // Use largest amount as the transaction amount (handles Debit/Credit/Balance columns)
    const amount = Math.max(...amounts);

    // Normalize date
    const dateStr = normalizeDate(dateMatch[0]);
    if (!dateStr) return;

    rows.push({
      date: dateStr,
      description: description.slice(0, 100),
      amount,
      category: '',
      note: '',
    });
  });

  return rows;
}

function normalizeDate(raw) {
  // Try various formats
  const s = raw.trim();
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    let [, d, mo, y] = dmy;
    if (y.length === 2) y = '20' + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // DD Mon YYYY
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  const mdy = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{2,4})$/i);
  if (mdy) {
    let [, d, mo, y] = mdy;
    if (y.length === 2) y = '20' + y;
    const moNum = months[mo.slice(0, 3).toLowerCase()];
    if (moNum) return `${y}-${moNum}-${d.padStart(2, '0')}`;
  }
  return null;
}

// ── Build preview rows ────────────────────────────
function buildParsedRowsFromExcel() {
  const getIdx = key => {
    const sel = document.getElementById(`colmap-${key}`);
    return sel && sel.value !== '' ? parseInt(sel.value) : null;
  };

  const dateIdx = getIdx('date');
  const descIdx = getIdx('description');
  const amtIdx = getIdx('amount');
  const catIdx = getIdx('category');
  const noteIdx = getIdx('note');

  if (dateIdx === null || descIdx === null || amtIdx === null) {
    showToast('Please map Date, Description, and Amount columns.', 'error');
    return null;
  }

  const rows = importState.rawRows;
  const parsed = [];

  rows.forEach((row, i) => {
    // Skip header row
    const rawDate = String(row[dateIdx] || '').trim();
    const rawDesc = String(row[descIdx] || '').trim();
    const rawAmt = String(row[amtIdx] || '').trim();
    const rawCat = catIdx !== null ? String(row[catIdx] || '').trim() : '';
    const rawNote = noteIdx !== null ? String(row[noteIdx] || '').trim() : '';

    const date = normalizeDate(rawDate) || rawDate;
    const amount = parseFloat(rawAmt.replace(/[^0-9.]/g, ''));
    const category = matchCategory(rawCat);

    let status = 'valid';
    const issues = [];
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) issues.push('bad date');
    if (isNaN(amount) || amount <= 0) issues.push('bad amount');
    if (!rawDesc) issues.push('no description');
    if (issues.length) status = 'invalid';

    // Duplicate check
    if (status === 'valid') {
      const isDup = state.expenses.some(e =>
        e.date === date && Math.abs(e.amount - amount) < 0.01 &&
        e.description.toLowerCase() === rawDesc.toLowerCase()
      );
      if (isDup) status = 'duplicate';
    }

    parsed.push({ date, description: rawDesc, amount: isNaN(amount) ? 0 : amount, category, note: rawNote, status, issues });
  });

  return parsed;
}

function buildParsedRowsFromPdf(rows) {
  return rows.map(row => {
    let status = 'valid';
    if (!row.date || !row.amount || !row.description) status = 'invalid';
    if (status === 'valid') {
      const isDup = state.expenses.some(e =>
        e.date === row.date && Math.abs(e.amount - row.amount) < 0.01 &&
        e.description.toLowerCase() === row.description.toLowerCase()
      );
      if (isDup) status = 'duplicate';
    }
    return { ...row, category: matchCategory(''), status };
  });
}

function matchCategory(raw) {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  const cat = state.categories.find(c =>
    c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase()) || c.id === lower
  );
  return cat ? cat.id : '';
}

// ── Render preview table ──────────────────────────
function renderImportPreview(rows) {
  const validCount = rows.filter(r => r.status === 'valid').length;
  const skipCount = rows.filter(r => r.status !== 'valid').length;
  document.getElementById('previewStatValid').textContent = `${validCount} valid`;
  document.getElementById('previewStatSkip').textContent = `${skipCount} skipped`;

  const catOptions = state.categories.map(c => `<option value="${c.id}">${c.emoji} ${c.name}</option>`).join('');

  const tbody = document.getElementById('importPreviewBody');
  tbody.innerHTML = rows.map((r, i) => {
    const checked = r.status === 'valid' ? 'checked' : '';
    const trClass = r.status !== 'valid' ? 'row-invalid' : '';
    const badge = r.status === 'valid'
      ? `<span class="row-status-badge valid">✓ Valid</span>`
      : r.status === 'duplicate'
        ? `<span class="row-status-badge duplicate">⚠ Duplicate</span>`
        : `<span class="row-status-badge invalid">✗ ${(r.issues || []).join(', ')}</span>`;

    const selectedCat = r.category;
    const catSel = `<select class="row-cat-select" data-row="${i}">${catOptions}</select>`;

    return `
      <tr class="${trClass}" data-row="${i}">
        <td><input type="checkbox" class="preview-row-check" data-row="${i}" ${checked} ${r.status === 'invalid' ? 'disabled' : ''}/></td>
        <td>${escapeHtml(r.date)}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(r.description)}">${escapeHtml(r.description)}</td>
        <td>${formatAmount(r.amount)}</td>
        <td>${catSel}</td>
        <td>${badge}</td>
      </tr>`;
  }).join('');

  // Set category values after rendering
  rows.forEach((r, i) => {
    const sel = tbody.querySelector(`[data-row="${i}"].row-cat-select`);
    if (sel && r.category) sel.value = r.category;
  });

  // Update check-all state
  updateCheckAllState();
}

function updateCheckAllState() {
  const checks = document.querySelectorAll('.preview-row-check:not([disabled])');
  const checked = document.querySelectorAll('.preview-row-check:not([disabled]):checked');
  const all = document.getElementById('previewCheckAll');
  if (all) all.checked = checks.length > 0 && checks.length === checked.length;

  const valid = document.querySelectorAll('.preview-row-check:not([disabled]):checked').length;
  document.getElementById('importConfirmBtn').textContent = `Import ${valid} Row${valid !== 1 ? 's' : ''}`;
}

// ── Confirm import ────────────────────────────────
function confirmImport() {
  const defaultCat = document.getElementById('importDefaultCat').value || 'other';
  const rows = importState.parsedRows;
  let imported = 0;

  rows.forEach((row, i) => {
    const check = document.querySelector(`.preview-row-check[data-row="${i}"]`);
    if (!check || !check.checked) return;
    const catSel = document.querySelector(`.row-cat-select[data-row="${i}"]`);
    const category = (catSel && catSel.value) ? catSel.value : (row.category || defaultCat);

    state.expenses.push({
      id: generateId(),
      amount: row.amount,
      description: row.description,
      category,
      date: row.date,
      note: row.note || '',
      currency: state.currency,
      recurring: false,
      recurringFrequency: 'monthly',
    });
    imported++;
  });

  saveState();
  closeImportModal();
  navigateTo('transactions');
  showToast(`✅ Imported ${imported} expense${imported !== 1 ? 's' : ''} successfully!`, 'success');
}

// ── Template download ─────────────────────────────
function downloadTemplate() {
  const rows = [
    ['Date', 'Description', 'Amount', 'Category', 'Note'],
    ['2024-01-15', 'Grocery Shopping', '850', 'Food & Dining', 'Weekly groceries'],
    ['2024-01-16', 'Uber Ride', '180', 'Transport', ''],
    ['2024-01-17', 'Netflix', '649', 'Entertainment', 'Monthly subscription'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
  XLSX.writeFile(wb, 'spendwise_template.xlsx');
  showToast('Template downloaded!', 'success');
}

// ── Event listeners for import modal ─────────────
function initImportListeners() {
  const overlay = document.getElementById('importOverlay');
  const fileInput = document.getElementById('importFileInput');
  const dropzone = document.getElementById('importDropzone');

  // Close
  document.getElementById('closeImport').addEventListener('click', closeImportModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeImportModal(); });

  // Browse button
  document.getElementById('importBrowseBtn').addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) handleImportFile(file);
  });

  // Remove file
  document.getElementById('importFileRemove').addEventListener('click', () => {
    importState.file = null;
    document.getElementById('importDropzone').classList.remove('hidden');
    document.getElementById('importFileInfo').classList.add('hidden');
    document.getElementById('importNextStep1').disabled = true;
    fileInput.value = '';
  });

  // Drag & drop
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.classList.remove('drag-over');
    const file = e.dataTransfer.files?.[0];
    if (file) handleImportFile(file);
  });

  // Step 1 → 2 or 3
  document.getElementById('importNextStep1').addEventListener('click', async () => {
    if (!importState.file) return;
    const loading = document.getElementById('importLoading');
    loading.classList.remove('hidden');
    document.getElementById('importLoadingMsg').textContent = 'Reading file…';
    try {
      if (importState.fileType === 'excel') {
        const rows = await parseExcelFile(importState.file);
        if (rows.length < 2) { showToast('File appears to be empty or has no data rows.', 'error'); return; }
        importState.headers = rows[0].map(h => String(h ?? ''));
        importState.rawRows = rows.slice(1).filter(r => r.some(c => c !== undefined && c !== ''));
        buildColMapUI(importState.headers);
        buildSampleTable(importState.headers, importState.rawRows);
        loading.classList.add('hidden');
        goToImportStep(2);
      } else {
        document.getElementById('importLoadingMsg').textContent = 'Extracting transactions from PDF…';
        const pdfRows = await parsePdfFile(importState.file);
        if (pdfRows.length === 0) {
          showToast('No transactions found in PDF. Try a text-based bank statement.', 'error');
          loading.classList.add('hidden'); return;
        }
        importState.parsedRows = buildParsedRowsFromPdf(pdfRows);
        loading.classList.add('hidden');
        renderImportPreview(importState.parsedRows);
        goToImportStep(3);
      }
    } catch (err) {
      loading.classList.add('hidden');
      console.error('Import error:', err);
      showToast('Failed to read file: ' + err.message, 'error');
    }
  });

  // Step 2 → 3 (Excel: process mapping)
  document.getElementById('importNextStep2').addEventListener('click', () => {
    const rows = buildParsedRowsFromExcel();
    if (!rows) return;
    importState.parsedRows = rows;
    renderImportPreview(rows);
    goToImportStep(3);
  });

  // Back buttons
  document.getElementById('importBackStep2').addEventListener('click', () => goToImportStep(1));
  document.getElementById('importBackStep3').addEventListener('click', () => {
    if (importState.fileType === 'pdf') goToImportStep(1);
    else goToImportStep(2);
  });

  // Cancel step 1
  document.getElementById('importCancelStep1').addEventListener('click', closeImportModal);

  // Preview: check-all
  document.getElementById('previewCheckAll').addEventListener('change', e => {
    document.querySelectorAll('.preview-row-check:not([disabled])').forEach(c => { c.checked = e.target.checked; });
    updateCheckAllState();
  });

  // Select / Deselect all buttons
  document.getElementById('previewSelectAll').addEventListener('click', () => {
    document.querySelectorAll('.preview-row-check:not([disabled])').forEach(c => { c.checked = true; });
    updateCheckAllState();
  });
  document.getElementById('previewDeselectAll').addEventListener('click', () => {
    document.querySelectorAll('.preview-row-check:not([disabled])').forEach(c => { c.checked = false; });
    updateCheckAllState();
  });

  // Individual row checks
  document.getElementById('importPreviewBody').addEventListener('change', e => {
    if (e.target.classList.contains('preview-row-check')) updateCheckAllState();
  });

  // Confirm import
  document.getElementById('importConfirmBtn').addEventListener('click', confirmImport);

  // Template download
  document.getElementById('downloadTemplateBtn').addEventListener('click', e => {
    e.preventDefault();
    if (typeof XLSX !== 'undefined') downloadTemplate();
    else showToast('SheetJS not loaded yet', 'error');
  });
}

// ── Initialize ────────────────────────────────────
function init() {
  loadState();
  applyTheme(state.theme);

  // Set currency selectors
  document.getElementById('currencySelector').value = state.currency;
  document.getElementById('settingsCurrency').value = state.currency;
  document.getElementById('expenseCurrency').value = state.currency;

  // Populate selects
  populateCategorySelects();

  // Init event listeners
  initEventListeners();
  initImportListeners();

  // Navigate to dashboard
  navigateTo('dashboard');

  // Load sample data if empty (first time)
  if (state.expenses.length === 0) {
    setTimeout(addSampleData, 300);
  }

  // Watch system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.theme === 'auto') applyTheme('auto');
  });
}

// Start!
document.addEventListener('DOMContentLoaded', init);
