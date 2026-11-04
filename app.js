// ==========================================================================
// BOBY CREATOR STUDIO 5.0 — APPLICATION CORE ENGINE
// File: app.js
// ==========================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- 1. FIREBASE CONFIGURATION & INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyBts_aqGp_1EosViZfHink-eJDpV9QAijw",
  authDomain: "boby-creator-studio.firebaseapp.com",
  projectId: "boby-creator-studio",
  storageBucket: "boby-creator-studio.firebasestorage.app",
  messagingSenderId: "133686903556",
  appId: "1:133686903556:web:ff7cf35c3b02fb95860651",
  measurementId: "G-YDEGTXNBT"
};

const app = initializeApp(firebaseConfig);
const firestoreDb = getFirestore(app);
const docRef = doc(firestoreDb, 'bobyStudioWorkspace', 'mainData');

// --- 2. STORAGE KEYS & APP STATE ---
const STORAGE_KEY = 'BOBY_CREATOR_STUDIO_DB_V2';
const THEME_KEY = 'BOBY_STUDIO_THEME_MODE';
const TARGET_KEY = 'BOBY_STUDIO_MONTHLY_TARGET';

let db = {
  clients: [],
  accounts: [],
  contents: [],
  analytics: [],
  affiliates: [],
  tasks: [],
  transactions: [],
  libraries: {
    hook: [],
    cta: [],
    hashtag: [],
    template: []
  }
};

let activeTab = 'dashboard';
let currentPlannerView = 'list';
let currentCalendarDate = new Date();
let dashboardRange = 'this_month';
let perfChartInstance = null;
let financeChartInstance = null;
let monthlyIncomeTarget = 10000000;
let isSidebarCollapsed = false;

// --- 3. UTILITY FUNCTIONS ---
function uid() {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
}

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function formatRupiah(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, isErr = false) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `px-4 py-2.5 rounded-xl shadow-lg text-xs font-bold text-white pointer-events-auto transition-all ${
    isErr ? 'bg-rose-600' : 'bg-slate-900 dark:bg-slate-800 border-l-4 border-emerald-500'
  }`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// --- 4. THEME MANAGEMENT (LIGHT & DARK MODE) ---
window.toggleThemeMode = function() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
  updateThemeIcon(isDark);
  refreshChartsTheme();
};

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved === 'dark' || (!saved && prefersDark);
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
  const icon = document.getElementById('theme-toggle-icon');
  if (icon) {
    icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
    if (window.lucide) window.lucide.createIcons();
  }
}

// --- 5. SIDEBAR COLLAPSE & EXPAND ---
window.toggleSidebarCollapse = function() {
  const sidebar = document.getElementById('main-sidebar');
  const wrapper = document.getElementById('main-content-wrapper');
  isSidebarCollapsed = !isSidebarCollapsed;
  if (sidebar && wrapper) {
    sidebar.classList.toggle('collapsed', isSidebarCollapsed);
    wrapper.classList.toggle('sidebar-collapsed', isSidebarCollapsed);
  }
};

// --- 6. REALTIME FIREBASE SYNC (ZERO DATA LOSS) ---
async function saveToCloud() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    updateSyncIndicator('saving');
    await setDoc(docRef, {
      payload: JSON.stringify(db),
      updatedAt: new Date().toISOString()
    });
    updateSyncIndicator('saved');
  } catch (err) {
    console.warn('Gagal sinkron cloud, tersimpan di antrean lokal:', err);
    updateSyncIndicator('offline');
  }
  refreshAll();
}

function initRealtime() {
  // Load Local Cache First
  const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('BOBY_CREATOR_STUDIO_DB_V1');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      db = sanitizeDatabaseSchema(parsed);
      refreshAll();
    } catch(e) {}
  }

  const savedTarget = localStorage.getItem(TARGET_KEY);
  if (savedTarget) monthlyIncomeTarget = Number(savedTarget);

  updateSyncIndicator('syncing');

  // Realtime Snapshot Listener
  onSnapshot(docRef, (snap) => {
    if (snap.exists() && snap.data().payload) {
      try {
        const cloudData = JSON.parse(snap.data().payload);
        db = sanitizeDatabaseSchema(cloudData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        updateSyncIndicator('saved');
        refreshAll();
      } catch(e) {
        console.error('Error parsing cloud data:', e);
      }
    } else {
      saveToCloud();
    }
  }, (err) => {
    console.warn('Firestore Snapshot error:', err);
    updateSyncIndicator('error');
  });
}

function sanitizeDatabaseSchema(data) {
  return {
    clients: Array.isArray(data.clients) ? data.clients : [],
    accounts: Array.isArray(data.accounts) ? data.accounts : [],
    contents: Array.isArray(data.contents) ? data.contents : [],
    analytics: Array.isArray(data.analytics) ? data.analytics : [],
    affiliates: Array.isArray(data.affiliates) ? data.affiliates : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    libraries: data.libraries && typeof data.libraries === 'object' ? data.libraries : {
      hook: [], cta: [], hashtag: [], template: []
    }
  };
}

function updateSyncIndicator(status) {
  const pill = document.getElementById('header-sync-pill');
  const text = document.getElementById('header-sync-text');
  const deskBadge = document.getElementById('storage-badge-desktop');
  if (!pill || !text) return;

  if (status === 'saved') {
    pill.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800";
    text.textContent = "Cloud Firestore Aktif";
    if (deskBadge) deskBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Realtime Aktif`;
  } else if (status === 'saving' || status === 'syncing') {
    pill.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800";
    text.textContent = status === 'saving' ? "Menyimpan ke Cloud..." : "Sinkronisasi Data...";
    if (deskBadge) deskBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span> Menyimpan...`;
  } else {
    pill.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800";
    text.textContent = "Mode Offline / Standby";
    if (deskBadge) deskBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span> Offline Cache`;
  }
}

// --- 7. NAVIGATION & TAB SWITCHING ---
window.switchTab = function(tabName) {
  activeTab = tabName;
  document.querySelectorAll('.tab-section').forEach(sec => sec.classList.add('hidden'));
  const target = document.getElementById(`sec-${tabName}`);
  if (target) target.classList.remove('hidden');

  // Breadcrumb & Page Titles
  const titleMap = {
    dashboard: 'Executive Dashboard 2.0',
    clients: 'Client Management Pro',
    accounts: 'Manajemen Akun Media Sosial',
    planner: 'Content Studio Pro',
    analytics: 'Social Media Analytics Intelligence',
    affiliate: 'Affiliate Intelligence Center',
    finance: 'Finance & Cash Flow Center',
    tasks: 'Task & Workflow Management',
    reports: 'Report Center Pro',
    ai: 'AI Assistant Ready (Sandbox)',
    settings: 'Database & Cloud Firestore'
  };

  const breadcrumb = document.getElementById('breadcrumb-current');
  const pageTitle = document.getElementById('page-title');
  if (breadcrumb) breadcrumb.textContent = tabName.toUpperCase();
  if (pageTitle) pageTitle.textContent = titleMap[tabName] || 'Command Center';

  // Desktop Nav Highlight
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.tab === tabName) {
      btn.className = 'nav-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shadow-sm transition-all';
    } else {
      btn.className = 'nav-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all';
    }
  });

  refreshAll();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// --- 8. GLOBAL SEARCH & QUICK ADD DROPDOWNS ---
window.openGlobalSearch = function() {
  const modal = document.getElementById('modal-global-search');
  const input = document.getElementById('global-search-input');
  if (modal) modal.classList.remove('hidden');
  if (input) {
    input.value = '';
    input.focus();
    executeGlobalSearch();
  }
};

window.executeGlobalSearch = function() {
  const query = (document.getElementById('global-search-input')?.value || '').toLowerCase().trim();
  const resultsContainer = document.getElementById('global-search-results');
  if (!resultsContainer) return;

  if (!query) {
    resultsContainer.innerHTML = '<p class="text-slate-400 p-2">Ketik nama klien, judul konten, tugas, atau produk...</p>';
    return;
  }

  let html = '';
  // Search Clients
  db.clients.filter(c => c.name.toLowerCase().includes(query) || c.brand.toLowerCase().includes(query)).forEach(c => {
    html += `<div onclick="switchTab('clients'); closeModal('modal-global-search');" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer flex justify-between">
      <span class="font-bold text-slate-800 dark:text-slate-200">Klien: ${escapeHtml(c.name)} (${escapeHtml(c.brand)})</span>
      <span class="text-indigo-500 font-semibold">Buka Klien &rarr;</span>
    </div>`;
  });

  // Search Content
  db.contents.filter(c => c.title.toLowerCase().includes(query) || (c.pillar || '').toLowerCase().includes(query)).forEach(c => {
    html += `<div onclick="switchTab('planner'); closeModal('modal-global-search');" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer flex justify-between">
      <span class="font-bold text-slate-800 dark:text-slate-200">Konten: ${escapeHtml(c.title)}</span>
      <span class="text-indigo-500 font-semibold">${escapeHtml(c.platform)} &rarr;</span>
    </div>`;
  });

  // Search Tasks
  db.tasks.filter(t => t.title.toLowerCase().includes(query)).forEach(t => {
    html += `<div onclick="switchTab('tasks'); closeModal('modal-global-search');" class="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer flex justify-between">
      <span class="font-bold text-slate-800 dark:text-slate-200">Tugas: ${escapeHtml(t.title)}</span>
      <span class="text-rose-500 font-semibold">${escapeHtml(t.priority)} &rarr;</span>
    </div>`;
  });

  resultsContainer.innerHTML = html || '<p class="text-slate-400 p-2">Tidak ditemukan data yang sesuai.</p>';
};

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openGlobalSearch();
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
    document.getElementById('quick-add-dropdown')?.classList.add('hidden');
    document.getElementById('notif-dropdown')?.classList.add('hidden');
  }
});

window.toggleQuickAddDropdown = function() {
  document.getElementById('quick-add-dropdown')?.classList.toggle('hidden');
};

window.toggleNotificationCenter = function() {
  document.getElementById('notif-dropdown')?.classList.toggle('hidden');
};

// --- 9. NOTIFICATION SYSTEM BASED ON REAL DATA ---
function updateNotificationCenter() {
  const list = document.getElementById('notif-list');
  const badge = document.getElementById('notif-badge');
  const banner = document.getElementById('urgent-reminder-banner');
  const bannerMsg = document.getElementById('urgent-reminder-message');
  if (!list) return;

  const notifications = [];
  const today = todayISO();

  // 1. Check Overdue or Urgent Tasks
  db.tasks.forEach(t => {
    if (t.status !== 'Selesai' && t.deadline) {
      if (t.deadline < today) {
        notifications.push({ type: 'danger', text: `Tugas terlambat: "${t.title}" (Deadline ${t.deadline})` });
      } else if (t.deadline === today) {
        notifications.push({ type: 'warning', text: `Tugas jatuh tempo hari ini: "${t.title}"` });
      }
    }
  });

  // 2. Check Unpaid Invoices
  db.transactions.forEach(tr => {
    if (tr.status === 'Unpaid') {
      notifications.push({ type: 'warning', text: `Piutang belum lunas: "${tr.title}" (${formatRupiah(tr.amount)})` });
    }
  });

  // 3. Check Scheduled Content for Today
  db.contents.forEach(c => {
    if (c.date === today && c.status !== 'Sudah upload') {
      notifications.push({ type: 'info', text: `Jadwal publikasi konten hari ini: "${c.title}" (${c.platform})` });
    }
  });

  if (notifications.length > 0) {
    if (badge) badge.classList.remove('hidden');
    if (banner) {
      banner.classList.remove('hidden');
      bannerMsg.textContent = notifications[0].text;
    }
    list.innerHTML = notifications.map(n => `
      <div class="p-2.5 rounded-xl border text-xs flex items-start gap-2 bg-slate-50 dark:bg-slate-700/50">
        <i data-lucide="${n.type === 'danger' ? 'alert-circle' : 'bell'}" class="w-3.5 h-3.5 mt-0.5 shrink-0 ${
          n.type === 'danger' ? 'text-rose-500' : 'text-amber-500'
        }"></i>
        <span class="text-slate-800 dark:text-slate-200">${escapeHtml(n.text)}</span>
      </div>
    `).join('');
  } else {
    if (badge) badge.classList.add('hidden');
    if (banner) banner.classList.add('hidden');
    list.innerHTML = '<p class="text-xs text-slate-400 p-2">Semua tugas, jadwal, dan invoice dalam kondisi aman!</p>';
  }
}

window.markAllNotificationsRead = function() {
  document.getElementById('notif-badge')?.classList.add('hidden');
  document.getElementById('urgent-reminder-banner')?.classList.add('hidden');
  document.getElementById('notif-dropdown')?.classList.add('hidden');
  showToast('Semua notifikasi ditandai sudah dibaca.');
};

// --- 10. EXECUTIVE DASHBOARD LOGIC ---
window.setDashboardRange = function(range) {
  dashboardRange = range;
  document.querySelectorAll('.dash-range-btn').forEach(btn => {
    if (btn.dataset.range === range) {
      btn.className = "dash-range-btn px-3 py-1 rounded-xl text-xs font-bold bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs";
    } else {
      btn.className = "dash-range-btn px-3 py-1 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300";
    }
  });
  renderDashboard();
};

window.openSetTargetModal = function() {
  const newTarget = prompt("Masukkan target pendapatan bulanan baru (Rp):", monthlyIncomeTarget);
  if (newTarget && !isNaN(newTarget)) {
    monthlyIncomeTarget = Number(newTarget);
    localStorage.setItem(TARGET_KEY, monthlyIncomeTarget);
    renderDashboard();
    showToast(`Target diperbarui ke ${formatRupiah(monthlyIncomeTarget)}`);
  }
};

function renderDashboard() {
  // 1. KPI Counts
  const totalClients = db.clients.length;
  const activeClients = db.clients.filter(c => c.status === 'Aktif').length;
  const totalAccounts = db.accounts.length;
  const totalContents = db.contents.length;
  const uploadedContents = db.contents.filter(c => c.status === 'Sudah upload').length;

  const totalViews = db.analytics.reduce((acc, a) => acc + Number(a.views || 0), 0);
  const totalReach = db.analytics.reduce((acc, a) => acc + Number(a.reach || 0), 0);
  const totalFollowers = db.accounts.reduce((acc, a) => acc + Number(a.followers || 0), 0);
  const followersGained = db.analytics.reduce((acc, a) => acc + Number(a.followersGained || 0), 0);

  const avgERViews = db.analytics.length > 0 
    ? (db.analytics.reduce((acc, a) => acc + Number(a.er || 0), 0) / db.analytics.length).toFixed(2) 
    : '0.00';
  
  const avgERReach = totalReach > 0 
    ? ((db.analytics.reduce((acc, a) => acc + Number(a.likes || 0) + Number(a.comments || 0) + Number(a.shares || 0) + Number(a.saves || 0), 0) / totalReach) * 100).toFixed(2)
    : '0.00';

  const affClicks = db.affiliates.reduce((acc, f) => acc + Number(f.clicks || 0), 0);
  const affOrders = db.affiliates.reduce((acc, f) => acc + Number(f.orders || 0), 0);
  const affGMV = db.affiliates.reduce((acc, f) => acc + Number(f.gmv || 0), 0);
  const affCommission = db.affiliates.reduce((acc, f) => acc + Number(f.commission || 0), 0);
  const affCR = affClicks > 0 ? ((affOrders / affClicks) * 100).toFixed(2) : '0.00';

  // 2. Finance Totals
  const clientRevenue = db.transactions.filter(t => t.category.includes('Pendapatan') && t.status === 'Paid').reduce((acc, t) => acc + Number(t.amount || 0), 0);
  const totalRevenue = clientRevenue + affCommission;
  const totalExpenses = db.transactions.filter(t => t.category.includes('Pengeluaran')).reduce((acc, t) => acc + Number(t.amount || 0), 0);
  const netProfit = totalRevenue - totalExpenses;
  const outstanding = db.transactions.filter(t => t.status === 'Unpaid').reduce((acc, t) => acc + Number(t.amount || 0), 0);

  // Update DOM KPI Text
  document.getElementById('dash-active-clients').textContent = activeClients;
  document.getElementById('dash-total-clients').textContent = `Total: ${totalClients} Klien`;
  document.getElementById('dash-total-accounts').textContent = totalAccounts;
  document.getElementById('dash-uploaded-content').textContent = uploadedContents;
  document.getElementById('dash-total-content').textContent = `Dari ${totalContents} Terencana`;
  document.getElementById('dash-total-views').textContent = formatNumber(totalViews);
  document.getElementById('dash-total-reach').textContent = `Reach: ${formatNumber(totalReach)}`;
  document.getElementById('dash-total-followers').textContent = formatNumber(totalFollowers);
  document.getElementById('dash-followers-growth').textContent = `+${formatNumber(followersGained)} Pertumbuhan`;
  document.getElementById('dash-avg-er').textContent = `${avgERViews}%`;
  document.getElementById('dash-er-reach').textContent = `ER by Reach: ${avgERReach}%`;
  document.getElementById('dash-aff-orders').textContent = formatNumber(affOrders);
  document.getElementById('dash-aff-clicks-cr').textContent = `${formatNumber(affClicks)} Klik (CR: ${affCR}%)`;
  document.getElementById('dash-aff-commission').textContent = formatRupiah(affCommission);
  document.getElementById('dash-aff-gmv').textContent = `GMV: ${formatRupiah(affGMV)}`;
  document.getElementById('dash-business-revenue').textContent = formatRupiah(totalRevenue);
  document.getElementById('dash-total-expenses').textContent = formatRupiah(totalExpenses);
  document.getElementById('dash-net-profit').textContent = formatRupiah(netProfit);
  document.getElementById('dash-outstanding-invoices').textContent = formatRupiah(outstanding);

  // Target Bar
  const targetPct = monthlyIncomeTarget > 0 ? Math.min(100, Math.round((totalRevenue / monthlyIncomeTarget) * 100)) : 0;
  document.getElementById('dash-target-text').textContent = `${formatRupiah(totalRevenue)} / ${formatRupiah(monthlyIncomeTarget)} (${targetPct}%)`;
  document.getElementById('dash-target-bar').style.width = `${targetPct}%`;

  // Highlight Strips
  renderDashboardHighlights();

  // Render Charts
  renderDashboardCharts();
}

function renderDashboardHighlights() {
  // Top Client
  const clientBox = document.getElementById('dash-top-client-box');
  if (clientBox) {
    const topClient = db.clients.find(c => Number(c.contractValue || 0) > 0) || db.clients[0];
    clientBox.innerHTML = topClient ? `
      <p class="font-extrabold text-xs text-slate-900 dark:text-white truncate">${escapeHtml(topClient.name)}</p>
      <p class="text-[11px] text-indigo-600 font-semibold">${escapeHtml(topClient.brand)}</p>
    ` : '<p class="text-xs text-slate-400">Belum ada klien.</p>';
  }

  // Top Content
  const contentBox = document.getElementById('dash-top-content-box');
  if (contentBox) {
    const sorted = [...db.analytics].sort((a, b) => Number(b.views || 0) - Number(a.views || 0));
    contentBox.innerHTML = sorted.length > 0 ? `
      <p class="font-extrabold text-xs text-slate-900 dark:text-white truncate">${escapeHtml(sorted[0].title)}</p>
      <p class="text-[11px] text-emerald-600 font-semibold">${formatNumber(sorted[0].views)} Views • ER: ${sorted[0].er}%</p>
    ` : '<p class="text-xs text-slate-400">Belum ada analitik.</p>';
  }

  // Top Affiliate
  const affBox = document.getElementById('dash-top-affiliate-box');
  if (affBox) {
    const sortedAff = [...db.affiliates].sort((a, b) => Number(b.commission || 0) - Number(a.commission || 0));
    affBox.innerHTML = sortedAff.length > 0 ? `
      <p class="font-extrabold text-xs text-slate-900 dark:text-white truncate">${escapeHtml(sortedAff[0].product)}</p>
      <p class="text-[11px] text-amber-600 font-semibold">${formatRupiah(sortedAff[0].commission)} Komisi</p>
    ` : '<p class="text-xs text-slate-400">Belum ada affiliate.</p>';
  }

  // Deadlines
  const deadlineList = document.getElementById('dash-upcoming-list');
  if (deadlineList) {
    const pendingTasks = db.tasks.filter(t => t.status !== 'Selesai').slice(0, 4);
    deadlineList.innerHTML = pendingTasks.length > 0 ? pendingTasks.map(t => `
      <div class="p-1.5 rounded-lg border text-[11px] flex justify-between bg-slate-50 dark:bg-slate-800/50">
        <span class="font-bold text-slate-800 dark:text-slate-200 truncate">${escapeHtml(t.title)}</span>
        <span class="text-rose-500 font-semibold shrink-0">${t.deadline || '-'}</span>
      </div>
    `).join('') : '<p class="text-xs text-slate-400">Tidak ada tugas mendesak.</p>';
  }
}

function renderDashboardCharts() {
  const isDark = document.documentElement.classList.contains('dark');
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? '#1e293b' : '#f1f5f9';

  // 1. Performance Views Chart
  const perfCtx = document.getElementById('dashboardPerformanceChart');
  if (perfCtx) {
    if (perfChartInstance) perfChartInstance.destroy();
    const sorted = [...db.analytics].slice(-7);
    perfChartInstance = new Chart(perfCtx, {
      type: 'bar',
      data: {
        labels: sorted.map(x => x.title.slice(0, 10)),
        datasets: [
          { label: 'Views', data: sorted.map(x => x.views), backgroundColor: '#4f46e5', borderRadius: 8 },
          { label: 'Reach', data: sorted.map(x => x.reach || 0), backgroundColor: '#0ea5e9', borderRadius: 8 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } }
        },
        plugins: { legend: { labels: { color: textColor, boxWidth: 10, font: { size: 10 } } } }
      }
    });
  }

  // 2. Finance Cash Flow Chart
  const finCtx = document.getElementById('dashboardFinanceChart');
  if (finCtx) {
    if (financeChartInstance) financeChartInstance.destroy();
    const paidRevenue = db.transactions.filter(t => t.category.includes('Pendapatan') && t.status === 'Paid').reduce((s, x) => s + Number(x.amount || 0), 0);
    const expenses = db.transactions.filter(t => t.category.includes('Pengeluaran')).reduce((s, x) => s + Number(x.amount || 0), 0);
    const affRev = db.affiliates.reduce((s, x) => s + Number(x.commission || 0), 0);

    financeChartInstance = new Chart(finCtx, {
      type: 'doughnut',
      data: {
        labels: ['Pendapatan Klien', 'Komisi Affiliate', 'Pengeluaran Operasional'],
        datasets: [{
          data: [paidRevenue, affRev, expenses],
          backgroundColor: ['#4f46e5', '#10b981', '#f43f5e']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 10, font: { size: 10 } } } }
      }
    });
  }
}

function refreshChartsTheme() {
  renderDashboardCharts();
}

// --- 11. CLIENT MANAGEMENT PRO ---
window.openClientModal = function(id = null) {
  document.getElementById('client-id').value = '';
  document.getElementById('client-name').value = '';
  document.getElementById('client-brand').value = '';
  document.getElementById('client-pic').value = '';
  document.getElementById('client-contract').value = 0;
  document.getElementById('client-date').value = todayISO();
  document.getElementById('client-status').value = 'Aktif';
  document.getElementById('client-notes').value = '';
  document.getElementById('modal-client-title').textContent = 'Tambah Klien Baru';

  if (id) {
    const c = db.clients.find(x => x.id === id);
    if (c) {
      document.getElementById('client-id').value = c.id;
      document.getElementById('client-name').value = c.name;
      document.getElementById('client-brand').value = c.brand;
      document.getElementById('client-pic').value = c.pic || '';
      document.getElementById('client-contract').value = c.contractValue || 0;
      document.getElementById('client-date').value = c.startDate;
      document.getElementById('client-status').value = c.status;
      document.getElementById('client-notes').value = c.notes || '';
      document.getElementById('modal-client-title').textContent = 'Edit Data Klien';
    }
  }
  document.getElementById('modal-client').classList.remove('hidden');
};

window.saveClient = function(e) {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const payload = {
    id: id || uid(),
    name: document.getElementById('client-name').value.trim(),
    brand: document.getElementById('client-brand').value.trim(),
    pic: document.getElementById('client-pic').value.trim(),
    contractValue: Number(document.getElementById('client-contract').value || 0),
    startDate: document.getElementById('client-date').value,
    status: document.getElementById('client-status').value,
    notes: document.getElementById('client-notes').value.trim()
  };

  if (id) {
    const idx = db.clients.findIndex(x => x.id === id);
    if (idx > -1) db.clients[idx] = payload;
    showToast('Data klien diperbarui!');
  } else {
    db.clients.unshift(payload);
    showToast('Klien baru berhasil ditambahkan!');
  }
  closeModal('modal-client');
  saveToCloud();
};

window.renderClients = function() {
  const q = (document.getElementById('search-clients')?.value || '').toLowerCase();
  const sf = document.getElementById('filter-clients-status')?.value || 'ALL';

  const filtered = db.clients.filter(c => {
    const matchQ = c.name.toLowerCase().includes(q) || c.brand.toLowerCase().includes(q) || (c.pic || '').toLowerCase().includes(q);
    const matchS = sf === 'ALL' || c.status === sf;
    return matchQ && matchS;
  });

  const tbody = document.getElementById('clients-table-body');
  const cards = document.getElementById('clients-mobile-cards');
  if (!tbody || !cards) return;

  tbody.innerHTML = filtered.map(c => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="p-3.5">
        <p class="font-extrabold text-slate-900 dark:text-white">${escapeHtml(c.name)}</p>
        <p class="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">${escapeHtml(c.brand)}</p>
      </td>
      <td class="p-3.5 text-slate-600 dark:text-slate-300">${escapeHtml(c.pic || '-')}</td>
      <td class="p-3.5 font-bold text-slate-900 dark:text-white">${formatRupiah(c.contractValue || 0)}</td>
      <td class="p-3.5"><span class="status-pill status-${c.status === 'Aktif' ? 'published' : 'review'}">${escapeHtml(c.status)}</span></td>
      <td class="p-3.5 text-slate-500">${c.startDate || '-'}</td>
      <td class="p-3.5 text-right space-x-1.5">
        <button onclick="openClientModal('${c.id}')" class="px-2 py-1 border rounded-lg text-xs font-bold text-slate-700 dark:text-slate-300">Edit</button>
        <button onclick="deleteClient('${c.id}')" class="px-2 py-1 border border-rose-200 text-xs font-bold text-rose-600 rounded-lg">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = filtered.map(c => `
    <div class="surface-card p-4 space-y-2">
      <div class="flex justify-between items-start">
        <div>
          <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(c.name)}</h4>
          <p class="text-xs text-indigo-600 font-semibold">${escapeHtml(c.brand)}</p>
        </div>
        <span class="status-pill status-published">${escapeHtml(c.status)}</span>
      </div>
      <p class="text-xs text-slate-500">Fee: ${formatRupiah(c.contractValue || 0)} • PIC: ${escapeHtml(c.pic || '-')}</p>
      <div class="flex justify-end gap-2 pt-2 border-t text-xs">
        <button onclick="openClientModal('${c.id}')" class="px-3 py-1 border rounded-lg font-bold">Edit</button>
        <button onclick="deleteClient('${c.id}')" class="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
};

window.deleteClient = function(id) {
  if (confirm("Hapus klien ini beserta seluruh referensinya?")) {
    db.clients = db.clients.filter(x => x.id !== id);
    saveToCloud();
    showToast('Klien dihapus.');
  }
};

// --- 12. AKUN MEDIA SOSIAL ---
window.openAccountModal = function(id = null) {
  populateSelectOptions();
  document.getElementById('account-id').value = '';
  document.getElementById('account-name').value = '';
  document.getElementById('account-username').value = '';
  document.getElementById('account-platform').value = 'TikTok';
  document.getElementById('account-followers').value = 0;
  document.getElementById('modal-account-title').textContent = 'Tambah Akun Media Sosial';

  if (id) {
    const a = db.accounts.find(x => x.id === id);
    if (a) {
      document.getElementById('account-id').value = a.id;
      document.getElementById('account-name').value = a.name;
      document.getElementById('account-username').value = a.username;
      document.getElementById('account-platform').value = a.platform;
      document.getElementById('account-followers').value = a.followers;
      document.getElementById('modal-account-title').textContent = 'Edit Akun Media Sosial';
    }
  }
  document.getElementById('modal-account').classList.remove('hidden');
};

window.saveAccount = function(e) {
  e.preventDefault();
  const id = document.getElementById('account-id').value;
  const payload = {
    id: id || uid(),
    name: document.getElementById('account-name').value.trim(),
    username: document.getElementById('account-username').value.trim(),
    platform: document.getElementById('account-platform').value,
    client: document.getElementById('account-client-select').value,
    followers: Number(document.getElementById('account-followers').value || 0)
  };

  if (id) {
    const idx = db.accounts.findIndex(x => x.id === id);
    if (idx > -1) db.accounts[idx] = payload;
    showToast('Akun diperbarui!');
  } else {
    db.accounts.unshift(payload);
    showToast('Akun ditambahkan!');
  }
  closeModal('modal-account');
  saveToCloud();
};

window.renderAccounts = function() {
  const q = (document.getElementById('search-accounts')?.value || '').toLowerCase();
  const pf = document.getElementById('filter-accounts-platform')?.value || 'ALL';

  const filtered = db.accounts.filter(a => {
    const matchQ = a.name.toLowerCase().includes(q) || a.username.toLowerCase().includes(q);
    const matchP = pf === 'ALL' || a.platform === pf;
    return matchQ && matchP;
  });

  const tbody = document.getElementById('accounts-table-body');
  const cards = document.getElementById('accounts-mobile-cards');
  if (!tbody || !cards) return;

  tbody.innerHTML = filtered.map(a => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="p-3.5">
        <p class="font-extrabold text-slate-900 dark:text-white">${escapeHtml(a.name)}</p>
        <p class="text-[11px] text-slate-500">${escapeHtml(a.username)}</p>
      </td>
      <td class="p-3.5"><span class="status-pill status-brief">${escapeHtml(a.platform)}</span></td>
      <td class="p-3.5 text-slate-700 dark:text-slate-300">${escapeHtml(a.client || 'Pribadi')}</td>
      <td class="p-3.5 font-bold text-slate-900 dark:text-white">${formatNumber(a.followers)}</td>
      <td class="p-3.5 text-slate-400">-</td>
      <td class="p-3.5 text-right space-x-1.5">
        <button onclick="openAccountModal('${a.id}')" class="px-2 py-1 border rounded-lg text-xs font-bold">Edit</button>
        <button onclick="deleteAccount('${a.id}')" class="px-2 py-1 border border-rose-200 text-xs font-bold text-rose-600 rounded-lg">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = filtered.map(a => `
    <div class="surface-card p-4 space-y-2">
      <div class="flex justify-between items-start">
        <div>
          <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(a.name)}</h4>
          <p class="text-xs text-slate-500">${escapeHtml(a.username)}</p>
        </div>
        <span class="status-pill status-brief">${escapeHtml(a.platform)}</span>
      </div>
      <p class="text-xs text-slate-600 dark:text-slate-300">Followers: <strong>${formatNumber(a.followers)}</strong> • Klien: ${escapeHtml(a.client)}</p>
      <div class="flex justify-end gap-2 pt-2 border-t text-xs">
        <button onclick="openAccountModal('${a.id}')" class="px-3 py-1 border rounded-lg font-bold">Edit</button>
        <button onclick="deleteAccount('${a.id}')" class="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
};

window.deleteAccount = function(id) {
  if (confirm("Hapus akun media sosial ini?")) {
    db.accounts = db.accounts.filter(x => x.id !== id);
    saveToCloud();
    showToast('Akun dihapus.');
  }
};

// --- 13. CONTENT STUDIO PRO (4 VIEWS + KANBAN + CALENDAR + LIBRARY) ---
const STAGES_10 = [
  'Ide', 'Brief', 'Script', 'Produksi', 'Editing', 
  'Review', 'Approval', 'Siap upload', 'Sudah upload', 'Performance Review'
];

window.setPlannerView = function(view) {
  currentPlannerView = view;
  document.getElementById('planner-list-container')?.classList.toggle('hidden', view !== 'list');
  document.getElementById('planner-kanban-container')?.classList.toggle('hidden', view !== 'kanban');
  document.getElementById('planner-calendar-container')?.classList.toggle('hidden', view !== 'calendar');
  document.getElementById('planner-library-container')?.classList.toggle('hidden', view !== 'library');

  ['list', 'kanban', 'calendar', 'library'].forEach(v => {
    const btn = document.getElementById(`btn-view-${v}`);
    if (btn) {
      btn.className = v === view 
        ? "px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs"
        : "px-2.5 py-1 rounded-lg text-slate-500 dark:text-slate-400";
    }
  });

  renderPlanner();
};

window.openContentModal = function(id = null, presetDate = null) {
  populateSelectOptions();
  document.getElementById('content-id').value = '';
  document.getElementById('content-date').value = presetDate || todayISO();
  document.getElementById('content-platform').value = 'TikTok';
  document.getElementById('content-title').value = '';
  document.getElementById('content-status').value = 'Ide';
  document.getElementById('content-pillar').value = '';
  document.getElementById('content-hook').value = '';
  document.getElementById('content-script').value = '';
  document.getElementById('content-cta').value = '';
  document.getElementById('content-hashtag').value = '';
  document.getElementById('modal-content-title').textContent = 'Buat Rencana Konten';

  if (id) {
    const c = db.contents.find(x => x.id === id);
    if (c) {
      document.getElementById('content-id').value = c.id;
      document.getElementById('content-date').value = c.date;
      document.getElementById('content-platform').value = c.platform;
      document.getElementById('content-title').value = c.title;
      document.getElementById('content-status').value = c.status;
      document.getElementById('content-pillar').value = c.pillar || '';
      document.getElementById('content-hook').value = c.hook || '';
      document.getElementById('content-script').value = c.script || '';
      document.getElementById('content-cta').value = c.cta || '';
      document.getElementById('content-hashtag').value = c.hashtag || '';
      document.getElementById('modal-content-title').textContent = 'Edit Konten';
    }
  }
  document.getElementById('modal-content').classList.remove('hidden');
};

window.saveContent = function(e) {
  e.preventDefault();
  const id = document.getElementById('content-id').value;
  const payload = {
    id: id || uid(),
    date: document.getElementById('content-date').value,
    platform: document.getElementById('content-platform').value,
    client: document.getElementById('content-client-select').value,
    title: document.getElementById('content-title').value.trim(),
    status: document.getElementById('content-status').value,
    pillar: document.getElementById('content-pillar').value.trim(),
    hook: document.getElementById('content-hook').value.trim(),
    script: document.getElementById('content-script').value.trim(),
    cta: document.getElementById('content-cta').value.trim(),
    hashtag: document.getElementById('content-hashtag').value.trim()
  };

  if (id) {
    const idx = db.contents.findIndex(x => x.id === id);
    if (idx > -1) db.contents[idx] = payload;
    showToast('Konten diperbarui!');
  } else {
    db.contents.unshift(payload);
    showToast('Konten berhasil dibuat!');
  }
  closeModal('modal-content');
  saveToCloud();
};

window.renderPlanner = function() {
  // 1. Stage summary pill strip
  const summaryStrip = document.getElementById('planner-status-summary');
  if (summaryStrip) {
    summaryStrip.innerHTML = STAGES_10.map(st => {
      const count = db.contents.filter(c => c.status === st).length;
      return `
        <div class="surface-card p-2 text-center">
          <p class="text-[10px] text-slate-400 font-bold truncate">${escapeHtml(st)}</p>
          <p class="text-xs font-extrabold text-indigo-600 dark:text-indigo-400">${count}</p>
        </div>`;
    }).join('');
  }

  // 2. Render Based on View
  if (currentPlannerView === 'kanban') {
    renderKanbanBoard();
  } else if (currentPlannerView === 'calendar') {
    renderCalendarGrid();
  } else if (currentPlannerView === 'library') {
    renderLibraries();
  } else {
    renderPlannerList();
  }
};

function renderPlannerList() {
  const q = (document.getElementById('search-planner')?.value || '').toLowerCase();
  const sf = document.getElementById('filter-planner-status')?.value || 'ALL';
  const cf = document.getElementById('filter-planner-client')?.value || 'ALL';

  const filtered = db.contents.filter(c => {
    const matchQ = c.title.toLowerCase().includes(q) || (c.pillar || '').toLowerCase().includes(q);
    const matchS = sf === 'ALL' || c.status === sf;
    const matchC = cf === 'ALL' || c.client === cf;
    return matchQ && matchS && matchC;
  });

  const tbody = document.getElementById('planner-table-body');
  const cards = document.getElementById('planner-mobile-cards');
  if (!tbody || !cards) return;

  tbody.innerHTML = filtered.map(c => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="p-3.5">
        <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">${c.date}</span>
        <p class="font-extrabold text-slate-900 dark:text-white">${escapeHtml(c.title)}</p>
      </td>
      <td class="p-3.5">
        <p class="font-bold text-slate-800 dark:text-slate-200">${escapeHtml(c.client || 'Pribadi')}</p>
        <span class="status-pill status-brief">${escapeHtml(c.platform)}</span>
      </td>
      <td class="p-3.5">
        <span class="status-pill status-ide">${escapeHtml(c.pillar || 'General')}</span>
        <p class="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">Hook: ${escapeHtml(c.hook || '-')}</p>
      </td>
      <td class="p-3.5">
        <span class="status-pill status-${c.status === 'Sudah upload' ? 'published' : 'script'} font-bold">${escapeHtml(c.status)}</span>
      </td>
      <td class="p-3.5 text-right space-x-1.5">
        <button onclick="openContentModal('${c.id}')" class="px-2 py-1 border rounded-lg text-xs font-bold">Edit</button>
        <button onclick="deleteContent('${c.id}')" class="px-2 py-1 border border-rose-200 text-xs font-bold text-rose-600 rounded-lg">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = filtered.map(c => `
    <div class="surface-card p-4 space-y-2">
      <div class="flex justify-between items-start">
        <div>
          <span class="text-[10px] font-bold text-indigo-600">${c.date} • ${escapeHtml(c.platform)}</span>
          <h4 class="font-bold text-sm text-slate-900 dark:text-white mt-0.5">${escapeHtml(c.title)}</h4>
        </div>
        <span class="status-pill status-script">${escapeHtml(c.status)}</span>
      </div>
      <p class="text-xs text-slate-500">Pillar: ${escapeHtml(c.pillar || '-')} • Klien: ${escapeHtml(c.client || '-')}</p>
      <div class="flex justify-end gap-2 pt-2 border-t text-xs">
        <button onclick="openContentModal('${c.id}')" class="px-3 py-1 border rounded-lg font-bold">Edit</button>
        <button onclick="deleteContent('${c.id}')" class="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
}

function renderKanbanBoard() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  board.innerHTML = STAGES_10.map(stage => {
    const items = db.contents.filter(c => c.status === stage);
    return `
      <div class="kanban-column">
        <div class="flex justify-between items-center mb-2 px-1">
          <span class="font-extrabold text-xs text-slate-900 dark:text-white uppercase tracking-wider">${escapeHtml(stage)}</span>
          <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">${items.length}</span>
        </div>
        <div class="kanban-column-list" ondragover="event.preventDefault()" ondrop="dropOnKanbanStage(event, '${stage}')">
          ${items.map(it => `
            <div class="kanban-card" draggable="true" ondragstart="event.dataTransfer.setData('text/plain', '${it.id}')" onclick="openContentModal('${it.id}')">
              <span class="text-[10px] font-bold text-indigo-500">${it.date} • ${escapeHtml(it.platform)}</span>
              <p class="font-bold text-xs text-slate-900 dark:text-white mt-1 leading-snug">${escapeHtml(it.title)}</p>
              <p class="text-[10px] text-slate-400 mt-1">${escapeHtml(it.pillar || 'General')}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

window.dropOnKanbanStage = function(e, newStage) {
  e.preventDefault();
  const id = e.dataTransfer.getData('text/plain');
  const item = db.contents.find(x => x.id === id);
  if (item && item.status !== newStage) {
    item.status = newStage;
    saveToCloud();
    showToast(`Status dipindah ke ${newStage}`);
  }
};

function renderCalendarGrid() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  const label = document.getElementById('calendar-month-label');
  if (label) label.textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  let html = '';
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="min-h-[70px] rounded-xl bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const items = db.contents.filter(c => c.date === dateStr);
    const isToday = dateStr === todayISO();

    html += `
      <div onclick="openContentModal(null, '${dateStr}')" class="min-h-[70px] p-1.5 rounded-xl border ${
        isToday ? 'border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/20' : 'border-slate-200 dark:border-slate-800 surface-card'
      } cursor-pointer hover:border-indigo-400 transition flex flex-col justify-between">
        <div class="flex justify-between items-center">
          <span class="text-[11px] font-extrabold ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}">${d}</span>
          ${items.length > 0 ? `<span class="text-[10px] font-bold text-indigo-500">${items.length}</span>` : ''}
        </div>
        <div class="space-y-1 overflow-hidden">
          ${items.slice(0, 2).map(it => `
            <div class="text-[9px] font-semibold truncate px-1 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
              ${escapeHtml(it.title)}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  grid.innerHTML = html;
}

window.changeCalendarMonth = function(offset) {
  if (offset === 0) {
    currentCalendarDate = new Date();
  } else {
    currentCalendarDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + offset, 1);
  }
  renderCalendarGrid();
};

function renderLibraries() {
  ['hook', 'cta', 'hashtag', 'template'].forEach(type => {
    const list = document.getElementById(`lib-${type}-list`);
    const items = db.libraries[type] || [];
    if (list) {
      list.innerHTML = items.length > 0 ? items.map((it, idx) => `
        <div class="p-2 rounded-lg border text-xs flex justify-between items-center bg-slate-50 dark:bg-slate-800/40">
          <span class="truncate text-slate-800 dark:text-slate-200">${escapeHtml(it)}</span>
          <button onclick="deleteLibraryItem('${type}', ${idx})" class="text-rose-500 font-bold ml-2">&times;</button>
        </div>
      `).join('') : '<p class="text-[11px] text-slate-400">Belum ada item.</p>';
    }
  });
}

window.openLibraryModal = function(type) {
  const text = prompt(`Tambahkan item baru ke ${type.toUpperCase()} Library:`);
  if (text && text.trim()) {
    if (!db.libraries[type]) db.libraries[type] = [];
    db.libraries[type].unshift(text.trim());
    saveToCloud();
    renderLibraries();
    showToast(`Ditambahkan ke ${type} library.`);
  }
};

window.deleteLibraryItem = function(type, index) {
  if (db.libraries[type]) {
    db.libraries[type].splice(index, 1);
    saveToCloud();
    renderLibraries();
  }
};

window.deleteContent = function(id) {
  if (confirm("Hapus rencana konten ini?")) {
    db.contents = db.contents.filter(x => x.id !== id);
    saveToCloud();
    showToast('Konten dihapus.');
  }
};

// --- 14. SOCIAL MEDIA ANALYTICS INTELLIGENCE ---
window.openAnalyticsModal = function(id = null) {
  document.getElementById('analytics-id').value = '';
  document.getElementById('analytics-date').value = todayISO();
  document.getElementById('analytics-platform').value = 'TikTok';
  document.getElementById('analytics-title').value = '';
  document.getElementById('analytics-views').value = 0;
  document.getElementById('analytics-reach').value = 0;
  document.getElementById('analytics-followers').value = 0;
  document.getElementById('analytics-likes').value = 0;
  document.getElementById('analytics-comments').value = 0;
  document.getElementById('analytics-shares').value = 0;
  document.getElementById('analytics-saves').value = 0;
  document.getElementById('modal-analytics-title').textContent = 'Input Performa Konten';

  if (id) {
    const a = db.analytics.find(x => x.id === id);
    if (a) {
      document.getElementById('analytics-id').value = a.id;
      document.getElementById('analytics-date').value = a.date;
      document.getElementById('analytics-platform').value = a.platform;
      document.getElementById('analytics-title').value = a.title;
      document.getElementById('analytics-views').value = a.views;
      document.getElementById('analytics-reach').value = a.reach;
      document.getElementById('analytics-followers').value = a.followersGained || 0;
      document.getElementById('analytics-likes').value = a.likes;
      document.getElementById('analytics-comments').value = a.comments;
      document.getElementById('analytics-shares').value = a.shares || 0;
      document.getElementById('analytics-saves').value = a.saves || 0;
      document.getElementById('modal-analytics-title').textContent = 'Edit Data Analitik';
    }
  }
  document.getElementById('modal-analytics').classList.remove('hidden');
};

window.saveAnalytics = function(e) {
  e.preventDefault();
  const id = document.getElementById('analytics-id').value;
  const views = Number(document.getElementById('analytics-views').value || 0);
  const reach = Number(document.getElementById('analytics-reach').value || 0);
  const likes = Number(document.getElementById('analytics-likes').value || 0);
  const comments = Number(document.getElementById('analytics-comments').value || 0);
  const shares = Number(document.getElementById('analytics-shares').value || 0);
  const saves = Number(document.getElementById('analytics-saves').value || 0);
  const followersGained = Number(document.getElementById('analytics-followers').value || 0);

  const engagement = likes + comments + shares + saves;
  const erByViews = views > 0 ? Number(((engagement / views) * 100).toFixed(2)) : 0;
  const erByReach = reach > 0 ? Number(((engagement / reach) * 100).toFixed(2)) : 0;

  const payload = {
    id: id || uid(),
    date: document.getElementById('analytics-date').value,
    platform: document.getElementById('analytics-platform').value,
    title: document.getElementById('analytics-title').value.trim(),
    views,
    reach,
    likes,
    comments,
    shares,
    saves,
    followersGained,
    er: erByViews,
    erReach: erByReach
  };

  if (id) {
    const idx = db.analytics.findIndex(x => x.id === id);
    if (idx > -1) db.analytics[idx] = payload;
    showToast('Analitik diperbarui!');
  } else {
    db.analytics.unshift(payload);
    showToast('Data performa disimpan!');
  }
  closeModal('modal-analytics');
  saveToCloud();
};

window.renderAnalytics = function() {
  const q = (document.getElementById('search-analytics')?.value || '').toLowerCase();
  const pf = document.getElementById('filter-analytics-platform')?.value || 'ALL';

  const filtered = db.analytics.filter(a => {
    const matchQ = a.title.toLowerCase().includes(q);
    const matchP = pf === 'ALL' || a.platform === pf;
    return matchQ && matchP;
  });

  const tbody = document.getElementById('analytics-table-body');
  const cards = document.getElementById('analytics-mobile-cards');
  if (!tbody || !cards) return;

  tbody.innerHTML = filtered.map(a => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="p-3.5">
        <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">${a.date}</span>
        <p class="font-extrabold text-slate-900 dark:text-white">${escapeHtml(a.title)}</p>
      </td>
      <td class="p-3.5"><span class="status-pill status-brief">${escapeHtml(a.platform)}</span></td>
      <td class="p-3.5">
        <p class="font-extrabold text-slate-900 dark:text-white">${formatNumber(a.views)} Views</p>
        <p class="text-[11px] text-slate-400">Reach: ${formatNumber(a.reach || 0)}</p>
      </td>
      <td class="p-3.5 text-slate-600 dark:text-slate-300">
        L: ${formatNumber(a.likes)} • C: ${formatNumber(a.comments)}<br/>
        S: ${formatNumber(a.shares || 0)} • Sv: ${formatNumber(a.saves || 0)}
      </td>
      <td class="p-3.5">
        <span class="status-pill status-review font-extrabold">${a.er}% (Views)</span>
        <p class="text-[10px] text-slate-400 mt-0.5">${a.erReach || 0}% (Reach)</p>
      </td>
      <td class="p-3.5 font-bold text-emerald-600">+${formatNumber(a.followersGained || 0)}</td>
      <td class="p-3.5 text-right space-x-1.5">
        <button onclick="openAnalyticsModal('${a.id}')" class="px-2 py-1 border rounded-lg text-xs font-bold">Edit</button>
        <button onclick="deleteAnalytics('${a.id}')" class="px-2 py-1 border border-rose-200 text-xs font-bold text-rose-600 rounded-lg">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = filtered.map(a => `
    <div class="surface-card p-4 space-y-2">
      <div class="flex justify-between items-start">
        <div>
          <span class="text-[10px] font-bold text-indigo-600">${a.date} • ${escapeHtml(a.platform)}</span>
          <h4 class="font-bold text-sm text-slate-900 dark:text-white mt-0.5">${escapeHtml(a.title)}</h4>
        </div>
        <span class="status-pill status-review">${a.er}% ER</span>
      </div>
      <p class="text-xs text-slate-500">Views: <strong>${formatNumber(a.views)}</strong> • Reach: ${formatNumber(a.reach || 0)}</p>
      <div class="flex justify-end gap-2 pt-2 border-t text-xs">
        <button onclick="openAnalyticsModal('${a.id}')" class="px-3 py-1 border rounded-lg font-bold">Edit</button>
        <button onclick="deleteAnalytics('${a.id}')" class="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
};

window.deleteAnalytics = function(id) {
  if (confirm("Hapus data analitik ini?")) {
    db.analytics = db.analytics.filter(x => x.id !== id);
    saveToCloud();
    showToast('Data analitik dihapus.');
  }
};

// --- 15. AFFILIATE INTELLIGENCE CENTER ---
window.openAffiliateModal = function(id = null) {
  document.getElementById('aff-id').value = '';
  document.getElementById('aff-product').value = '';
  document.getElementById('aff-clicks').value = 0;
  document.getElementById('aff-orders').value = 0;
  document.getElementById('aff-gmv').value = 0;
  document.getElementById('aff-commission').value = 0;
  document.getElementById('modal-affiliate-title').textContent = 'Catat Produk Affiliate';

  if (id) {
    const f = db.affiliates.find(x => x.id === id);
    if (f) {
      document.getElementById('aff-id').value = f.id;
      document.getElementById('aff-product').value = f.product;
      document.getElementById('aff-clicks').value = f.clicks;
      document.getElementById('aff-orders').value = f.orders;
      document.getElementById('aff-gmv').value = f.gmv;
      document.getElementById('aff-commission').value = f.commission;
      document.getElementById('modal-affiliate-title').textContent = 'Edit Produk Affiliate';
    }
  }
  document.getElementById('modal-affiliate').classList.remove('hidden');
};

window.saveAffiliate = function(e) {
  e.preventDefault();
  const id = document.getElementById('aff-id').value;
  const clicks = Number(document.getElementById('aff-clicks').value || 0);
  const orders = Number(document.getElementById('aff-orders').value || 0);
  const cr = clicks > 0 ? Number(((orders / clicks) * 100).toFixed(2)) : 0;

  const payload = {
    id: id || uid(),
    product: document.getElementById('aff-product').value.trim(),
    platform: 'Shopee',
    clicks,
    orders,
    cr,
    gmv: Number(document.getElementById('aff-gmv').value || 0),
    commission: Number(document.getElementById('aff-commission').value || 0)
  };

  if (id) {
    const idx = db.affiliates.findIndex(x => x.id === id);
    if (idx > -1) db.affiliates[idx] = payload;
    showToast('Affiliate diperbarui!');
  } else {
    db.affiliates.unshift(payload);
    showToast('Produk affiliate dicatat!');
  }
  closeModal('modal-affiliate');
  saveToCloud();
};

window.renderAffiliate = function() {
  const q = (document.getElementById('search-affiliate')?.value || '').toLowerCase();
  const pf = document.getElementById('filter-affiliate-platform')?.value || 'ALL';

  const filtered = db.affiliates.filter(f => {
    const matchQ = f.product.toLowerCase().includes(q);
    const matchP = pf === 'ALL' || f.platform === pf;
    return matchQ && matchP;
  });

  const tbody = document.getElementById('affiliate-table-body');
  const cards = document.getElementById('affiliate-mobile-cards');
  if (!tbody || !cards) return;

  tbody.innerHTML = filtered.map(f => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="p-3.5 font-extrabold text-slate-900 dark:text-white">${escapeHtml(f.product)}</td>
      <td class="p-3.5"><span class="status-pill status-brief">${escapeHtml(f.platform || 'Shopee')}</span></td>
      <td class="p-3.5 text-slate-700 dark:text-slate-300">${formatNumber(f.clicks)} Klik / ${formatNumber(f.orders)} Order</td>
      <td class="p-3.5 font-bold text-amber-600">${f.cr}%</td>
      <td class="p-3.5 font-bold text-slate-900 dark:text-white">${formatRupiah(f.gmv)}</td>
      <td class="p-3.5 font-extrabold text-emerald-600">${formatRupiah(f.commission)}</td>
      <td class="p-3.5 text-right space-x-1.5">
        <button onclick="openAffiliateModal('${f.id}')" class="px-2 py-1 border rounded-lg text-xs font-bold">Edit</button>
        <button onclick="deleteAffiliate('${f.id}')" class="px-2 py-1 border border-rose-200 text-xs font-bold text-rose-600 rounded-lg">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = filtered.map(f => `
    <div class="surface-card p-4 space-y-2">
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(f.product)}</h4>
        <span class="status-pill status-brief">${escapeHtml(f.platform || 'Shopee')}</span>
      </div>
      <p class="text-xs text-slate-500">Komisi: <strong class="text-emerald-600">${formatRupiah(f.commission)}</strong> • GMV: ${formatRupiah(f.gmv)}</p>
      <div class="flex justify-end gap-2 pt-2 border-t text-xs">
        <button onclick="openAffiliateModal('${f.id}')" class="px-3 py-1 border rounded-lg font-bold">Edit</button>
        <button onclick="deleteAffiliate('${f.id}')" class="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
};

window.deleteAffiliate = function(id) {
  if (confirm("Hapus produk affiliate ini?")) {
    db.affiliates = db.affiliates.filter(x => x.id !== id);
    saveToCloud();
    showToast('Affiliate dihapus.');
  }
};

// --- 16. FINANCE & BUSINESS CENTER ---
window.openTransactionModal = function() {
  document.getElementById('trans-date').value = todayISO();
  document.getElementById('trans-title').value = '';
  document.getElementById('trans-amount').value = 0;
  document.getElementById('trans-category').value = 'Pendapatan Klien';
  document.getElementById('trans-status').value = 'Paid';
  document.getElementById('modal-transaction').classList.remove('hidden');
};

window.saveTransaction = function(e) {
  e.preventDefault();
  const payload = {
    id: uid(),
    date: document.getElementById('trans-date').value,
    title: document.getElementById('trans-title').value.trim(),
    category: document.getElementById('trans-category').value,
    amount: Number(document.getElementById('trans-amount').value || 0),
    status: document.getElementById('trans-status').value
  };

  db.transactions.unshift(payload);
  closeModal('modal-transaction');
  saveToCloud();
  showToast('Transaksi berhasil dicatat!');
};

window.renderFinance = function() {
  const tbody = document.getElementById('finance-table-body');
  const cards = document.getElementById('finance-mobile-cards');
  if (!tbody || !cards) return;

  tbody.innerHTML = db.transactions.map(t => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="p-3.5 text-slate-500">${t.date}</td>
      <td class="p-3.5 font-extrabold text-slate-900 dark:text-white">${escapeHtml(t.title)}</td>
      <td class="p-3.5"><span class="status-pill status-${t.category.includes('Pengeluaran') ? 'review' : 'published'}">${escapeHtml(t.category)}</span></td>
      <td class="p-3.5 font-extrabold ${t.category.includes('Pengeluaran') ? 'text-rose-600' : 'text-emerald-600'}">${formatRupiah(t.amount)}</td>
      <td class="p-3.5"><span class="status-pill status-${t.status === 'Paid' ? 'published' : 'produksi'} font-bold">${t.status}</span></td>
      <td class="p-3.5 text-right">
        <button onclick="deleteTransaction('${t.id}')" class="text-rose-600 font-bold text-xs">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = db.transactions.map(t => `
    <div class="surface-card p-4 space-y-2">
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-sm text-slate-900 dark:text-white">${escapeHtml(t.title)}</h4>
        <span class="status-pill status-${t.status === 'Paid' ? 'published' : 'produksi'}">${t.status}</span>
      </div>
      <p class="text-xs font-bold ${t.category.includes('Pengeluaran') ? 'text-rose-600' : 'text-emerald-600'}">${formatRupiah(t.amount)} • ${escapeHtml(t.category)}</p>
      <div class="flex justify-end pt-2 border-t text-xs">
        <button onclick="deleteTransaction('${t.id}')" class="text-rose-600 font-bold">Hapus</button>
      </div>
    </div>
  `).join('');
};

window.deleteTransaction = function(id) {
  if (confirm("Hapus transaksi ini?")) {
    db.transactions = db.transactions.filter(x => x.id !== id);
    saveToCloud();
    showToast('Transaksi dihapus.');
  }
};

// --- 17. TASK & WORKFLOW MANAGEMENT ---
window.openTaskModal = function(id = null) {
  document.getElementById('task-id').value = '';
  document.getElementById('task-title').value = '';
  document.getElementById('task-deadline').value = todayISO();
  document.getElementById('task-priority').value = 'Sedang';
  document.getElementById('modal-task-title').textContent = 'Tambah Pekerjaan';

  if (id) {
    const t = db.tasks.find(x => x.id === id);
    if (t) {
      document.getElementById('task-id').value = t.id;
      document.getElementById('task-title').value = t.title;
      document.getElementById('task-deadline').value = t.deadline;
      document.getElementById('task-priority').value = t.priority;
      document.getElementById('modal-task-title').textContent = 'Edit Pekerjaan';
    }
  }
  document.getElementById('modal-task').classList.remove('hidden');
};

window.saveTask = function(e) {
  e.preventDefault();
  const id = document.getElementById('task-id').value;
  const payload = {
    id: id || uid(),
    title: document.getElementById('task-title').value.trim(),
    deadline: document.getElementById('task-deadline').value,
    priority: document.getElementById('task-priority').value,
    status: 'Belum Dikerjakan'
  };

  if (id) {
    const idx = db.tasks.findIndex(x => x.id === id);
    if (idx > -1) db.tasks[idx] = { ...db.tasks[idx], ...payload };
    showToast('Tugas diperbarui!');
  } else {
    db.tasks.unshift(payload);
    showToast('Tugas ditambahkan!');
  }
  closeModal('modal-task');
  saveToCloud();
};

window.toggleTaskStatus = function(id) {
  const t = db.tasks.find(x => x.id === id);
  if (t) {
    t.status = t.status === 'Selesai' ? 'Belum Dikerjakan' : 'Selesai';
    saveToCloud();
    showToast(`Status tugas: ${t.status}`);
  }
};

window.renderTasks = function() {
  const q = (document.getElementById('search-tasks')?.value || '').toLowerCase();
  const sf = document.getElementById('filter-tasks-status')?.value || 'ALL';

  const filtered = db.tasks.filter(t => {
    const matchQ = t.title.toLowerCase().includes(q);
    const matchS = sf === 'ALL' || t.status === sf;
    return matchQ && matchS;
  });

  const tbody = document.getElementById('tasks-table-body');
  const cards = document.getElementById('tasks-mobile-cards');
  if (!tbody || !cards) return;

  tbody.innerHTML = filtered.map(t => `
    <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td class="p-3.5">
        <p class="font-extrabold ${t.status === 'Selesai' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}">${escapeHtml(t.title)}</p>
      </td>
      <td class="p-3.5 text-slate-500 font-semibold">${t.deadline || '-'}</td>
      <td class="p-3.5"><span class="status-pill status-${t.priority === 'Tinggi' ? 'review' : 'brief'}">${t.priority}</span></td>
      <td class="p-3.5">
        <button onclick="toggleTaskStatus('${t.id}')" class="px-2.5 py-1 rounded-lg text-xs font-bold border ${
          t.status === 'Selesai' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700'
        }">${t.status}</button>
      </td>
      <td class="p-3.5 text-right space-x-1.5">
        <button onclick="openTaskModal('${t.id}')" class="px-2 py-1 border rounded-lg text-xs font-bold">Edit</button>
        <button onclick="deleteTask('${t.id}')" class="px-2 py-1 border border-rose-200 text-xs font-bold text-rose-600 rounded-lg">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = filtered.map(t => `
    <div class="surface-card p-4 space-y-2">
      <div class="flex justify-between items-start">
        <h4 class="font-bold text-sm ${t.status === 'Selesai' ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}">${escapeHtml(t.title)}</h4>
        <span class="status-pill status-brief">${t.priority}</span>
      </div>
      <p class="text-xs text-slate-500">Deadline: ${t.deadline || '-'}</p>
      <div class="flex justify-between items-center pt-2 border-t text-xs">
        <button onclick="toggleTaskStatus('${t.id}')" class="font-bold text-indigo-600">${t.status === 'Selesai' ? 'Buka Kembali' : 'Tandai Selesai'}</button>
        <div class="space-x-1">
          <button onclick="openTaskModal('${t.id}')" class="px-2.5 py-1 border rounded-lg font-bold">Edit</button>
          <button onclick="deleteTask('${t.id}')" class="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-lg font-bold">Hapus</button>
        </div>
      </div>
    </div>
  `).join('');
};

window.deleteTask = function(id) {
  if (confirm("Hapus tugas ini?")) {
    db.tasks = db.tasks.filter(x => x.id !== id);
    saveToCloud();
    showToast('Tugas dihapus.');
  }
};

// --- 18. REPORT CENTER PRO & VALID EXPORTS ---
window.renderReportCenter = function() {
  const period = document.getElementById('report-filter-period')?.value || 'monthly';
  const client = document.getElementById('report-filter-client')?.value || 'ALL';
  document.getElementById('report-date-badge').textContent = `Tanggal: ${todayISO()} • Filter: ${client}`;

  const summary = document.getElementById('report-summary-strip');
  if (!summary) return;

  const totalRev = db.transactions.filter(t => t.category.includes('Pendapatan') && t.status === 'Paid').reduce((s, x) => s + Number(x.amount || 0), 0) + db.affiliates.reduce((s, x) => s + Number(x.commission || 0), 0);
  const totalViews = db.analytics.reduce((s, x) => s + Number(x.views || 0), 0);

  summary.innerHTML = `
    <div class="p-3 border rounded-xl"><p class="text-slate-400">Total Konten</p><p class="text-sm font-extrabold">${db.contents.length}</p></div>
    <div class="p-3 border rounded-xl"><p class="text-slate-400">Total Views</p><p class="text-sm font-extrabold">${formatNumber(totalViews)}</p></div>
    <div class="p-3 border rounded-xl"><p class="text-slate-400">Total Klien Aktif</p><p class="text-sm font-extrabold">${db.clients.filter(c => c.status === 'Aktif').length}</p></div>
    <div class="p-3 border rounded-xl"><p class="text-slate-400">Total Pendapatan Riil</p><p class="text-sm font-extrabold text-emerald-600">${formatRupiah(totalRev)}</p></div>
  `;
};

window.exportReportCSV = function() {
  let csv = 'MODUL,TANGGAL,DESKRIPSI/JUDUL,DETAIL/PLATFORM,NILAI/NOMINAL\n';
  db.contents.forEach(c => csv += `"Konten","${c.date}","${c.title.replace(/"/g, '""')}","${c.platform}","${c.status}"\n`);
  db.analytics.forEach(a => csv += `"Analitik","${a.date}","${a.title.replace(/"/g, '""')}","${a.platform}","Views: ${a.views}"\n`);
  db.affiliates.forEach(f => csv += `"Affiliate","-","${f.product.replace(/"/g, '""')}","Shopee","Komisi: ${f.commission}"\n`);
  db.transactions.forEach(t => csv += `"Finance","${t.date}","${t.title.replace(/"/g, '""')}","${t.category}","${t.amount}"\n`);

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  a.download = `Laporan_Eksekutif_Boby_Studio_${todayISO()}.csv`;
  a.click();
  showToast('Laporan CSV berhasil diunduh!');
};

window.exportReportXLSX = function() {
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel sedang dimuat, gunakan CSV terlebih dahulu.', true);
    return;
  }
  const wb = XLSX.utils.book_new();

  // Sheet 1: Konten
  const wsContent = XLSX.utils.json_to_sheet(db.contents.map(c => ({
    Tanggal: c.date, Judul: c.title, Platform: c.platform, Pillar: c.pillar, Status: c.status
  })));
  XLSX.utils.book_append_sheet(wb, wsContent, "Rencana Konten");

  // Sheet 2: Analitik
  const wsAnalytics = XLSX.utils.json_to_sheet(db.analytics.map(a => ({
    Tanggal: a.date, Judul: a.title, Platform: a.platform, Views: a.views, Reach: a.reach, Likes: a.likes, Comments: a.comments, ER: `${a.er}%`
  })));
  XLSX.utils.book_append_sheet(wb, wsAnalytics, "Social Analytics");

  // Sheet 3: Finance
  const wsFinance = XLSX.utils.json_to_sheet(db.transactions.map(t => ({
    Tanggal: t.date, Judul: t.title, Kategori: t.category, Nominal: t.amount, Status: t.status
  })));
  XLSX.utils.book_append_sheet(wb, wsFinance, "Finance & Invoices");

  XLSX.writeFile(wb, `Laporan_Resmi_Boby_Creator_Studio_${todayISO()}.xlsx`);
  showToast('Laporan Excel (.xlsx) resmi berhasil diunduh!');
};

// --- 19. BACKUP & RESTORE JSON ---
window.downloadBackupJSON = function() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }));
  a.download = `Backup_Boby_Creator_Studio_5.0_${todayISO()}.json`;
  a.click();
  showToast('File backup cadangan berhasil diunduh!');
};

window.restoreBackupJSON = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const parsed = JSON.parse(ev.target.result);
      if (parsed && typeof parsed === 'object') {
        db = sanitizeDatabaseSchema(parsed);
        saveToCloud();
        showToast('Data backup berhasil dipulihkan!');
      }
    } catch(err) {
      showToast('File backup tidak valid!', true);
    }
  };
  reader.readAsText(file);
};

// --- 20. POPULATE SELECT DROPDOWNS & GLOBAL REFRESH ---
function populateSelectOptions() {
  const selects = ['account-client-select', 'content-client-select', 'filter-planner-client', 'report-filter-client'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    if (id.includes('filter')) {
      el.innerHTML = '<option value="ALL">Semua Klien & Proyek</option><option value="Pribadi">Pribadi / Internal</option>';
    } else {
      el.innerHTML = '<option value="Pribadi">Pribadi / Internal</option>';
    }
    db.clients.forEach(c => {
      el.innerHTML += `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} (${escapeHtml(c.brand)})</option>`;
    });
    if (currentVal) el.value = currentVal;
  });
}

function refreshAll() {
  populateSelectOptions();
  updateNotificationCenter();
  renderDashboard();
  renderClients();
  renderAccounts();
  renderPlanner();
  renderAnalytics();
  renderAffiliate();
  renderFinance();
  renderTasks();
  renderReportCenter();

  // Task Badge Update
  const pending = db.tasks.filter(t => t.status !== 'Selesai');
  const badge = document.getElementById('sidebar-task-badge');
  if (badge) {
    badge.textContent = pending.length;
    badge.classList.toggle('hidden', pending.length === 0);
  }

  if (window.lucide) window.lucide.createIcons();
}

// --- 21. INITIALIZATION ON LOAD ---
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initRealtime();
  switchTab('dashboard');
});
