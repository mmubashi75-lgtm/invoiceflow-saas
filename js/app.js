/**
 * InvoiceFlow SaaS — Main application
 * Auth + multi-tenant data via Supabase + Paddle billing
 */

(function () {
  'use strict';

  let customers = [], products = [], invoices = [];
  let currentView = 'dashboard';
  let editingInvoiceId = null;
  let charts = {};

  // ─── Boot ──────────────────────────────────────────────────────────────
  async function boot() {
    IF.initSupabase();

    // If Supabase keys missing, keep auth UI but warn (signup will show error)
    if (!IF.client) {
      console.warn('Supabase not configured — set keys in js/config.js or .env');
      bindAuthForms();
      initTheme();
      initSidebar();
      showAuth();
      return;
    }

    // Auth state listener — only react to real sign-in / sign-out
    IF.client.auth.onAuthStateChange(async (event, session) => {
      console.log('[auth]', event, !!session);
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (session?.user) {
          IF.currentUser = session.user;
          try {
            await IF.loadProfile();
          } catch (e) {
            console.error(e);
          }
          await showApp();
        }
      } else if (event === 'SIGNED_OUT') {
        IF.currentUser = null;
        IF.currentProfile = null;
        showLanding();
      }
      // Ignore INITIAL_SESSION here — handled below to avoid race
    });

    try {
      const session = await IF.getSession();
      if (session?.user) {
        IF.currentUser = session.user;
        try {
          await IF.loadProfile();
        } catch (e) {
          console.error(e);
        }
        await showApp();
      } else {
        showAuth();
      }
    } catch (e) {
      console.error('session check failed', e);
      showAuth();
    }

    bindAuthForms();
    initTheme();
    initSidebar();
  }

  function showLanding() {
    const land = document.getElementById('landing-screen');
    const auth = document.getElementById('auth-screen');
    const appShell = document.getElementById('app-shell');
    if (land) land.classList.remove('hidden');
    if (auth) auth.classList.add('hidden');
    if (appShell) appShell.classList.add('hidden');
  }

  function showSignup(isSignup = true) {
    const land = document.getElementById('landing-screen');
    const auth = document.getElementById('auth-screen');
    const appShell = document.getElementById('app-shell');
    if (land) land.classList.add('hidden');
    if (auth) auth.classList.remove('hidden');
    if (appShell) appShell.classList.add('hidden');
    const login = document.getElementById('login-form');
    const signup = document.getElementById('signup-form');
    if (isSignup) {
      if (login) login.classList.add('hidden');
      if (signup) signup.classList.remove('hidden');
    } else {
      if (signup) signup.classList.add('hidden');
      if (login) login.classList.remove('hidden');
    }
    if (typeof clearAuthFields === 'function') clearAuthFields();
    showConfigBanner(isSignup ? 'signup-error' : 'login-error');
  }

  function showAuth() {
    // After logout → landing; deep link ?signup=1 or ?login=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('login') === '1') {
      showSignup(false);
    } else if (params.get('signup') === '1' || params.get('auth') === '1') {
      showSignup(true);
    } else {
      showLanding();
    }
  }

  async function showApp() {
    try {
    const land = document.getElementById('landing-screen');
    if (land) land.classList.add('hidden');
    const authEl = document.getElementById('auth-screen');
    const shell = document.getElementById('app-shell');
    if (authEl) authEl.classList.add('hidden');
    if (shell) shell.classList.remove('hidden');

    const profile = IF.currentProfile || {};
    const avatar = document.getElementById('userAvatar');
    if (avatar) avatar.textContent = (profile.full_name || profile.email || 'U')[0].toUpperCase();
    try { updatePlanBadge(); } catch (e) { console.warn(e); }

    // Load data
    try {
      [customers, products, invoices] = await Promise.all([
        IF.getCustomers(),
        IF.getProducts(),
        IF.getInvoices()
      ]);
    } catch (e) {
      console.error(e);
      IFUtils.toast('Failed to load data. Check RLS policies.', 'error');
    }

    // Nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.onclick = () => navigate(btn.dataset.view);
    });
    const createBtn = document.getElementById('createInvoiceBtn');
    if (createBtn) createBtn.onclick = () => createInvoice();
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.onclick = async () => {
      await IF.signOut();
      showLanding();
    };

    navigate('dashboard');
    } catch (e) {
      console.error('showApp failed', e);
      IFUtils.toast('Could not open app: ' + (e.message || e), 'error');
    }
  }

  function updatePlanBadge() {
    const plan = getCurrentPlan();
    const p = IF.currentProfile || {};
    let text = plan.name;
    if (p.subscription_status === 'trialing' || (p.trial_ends_at && new Date(p.trial_ends_at) > new Date() && p.subscription_status !== 'active')) {
      text = 'Trial';
    }
    document.getElementById('plan-badge').textContent = text;
  }


  function showConfigBanner(targetErrId) {
    if (IF.client) return;
    var el = document.getElementById(targetErrId);
    if (!el) return;
    el.className = 'text-sm text-red-600';
    el.innerHTML = 'Supabase is not connected. <strong>.env.local is NOT read by the browser.</strong><br>1) Copy <code>js/config.local.example.js</code> → <code>js/config.local.js</code><br>2) Paste your real SUPABASE_URL and SUPABASE_ANON_KEY<br>3) Hard refresh (Ctrl+Shift+R)';
    el.classList.remove('hidden');
  }

  // ─── Auth forms ────────────────────────────────────────────────────────
  function clearAuthFields() {
    ['login-email', 'login-password', 'signup-name', 'signup-email', 'signup-password'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.value = '';
      el.setAttribute('value', '');
      // Block browser autofill briefly
      el.setAttribute('readonly', 'readonly');
      setTimeout(() => el.removeAttribute('readonly'), 150);
    });
    const loginErr = document.getElementById('login-error');
    const signupErr = document.getElementById('signup-error');
    if (loginErr) { loginErr.classList.add('hidden'); loginErr.textContent = ''; }
    if (signupErr) { signupErr.classList.add('hidden'); signupErr.textContent = ''; }
  }

  function bindAuthForms() {
    clearAuthFields();
    showConfigBanner('signup-error');
    showConfigBanner('login-error');

    document.getElementById('show-signup').onclick = () => {
      clearAuthFields();
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('signup-form').classList.remove('hidden');
    };
    document.getElementById('show-login').onclick = () => {
      clearAuthFields();
      document.getElementById('signup-form').classList.add('hidden');
      document.getElementById('login-form').classList.remove('hidden');
    };

    document.querySelectorAll('[data-legal]').forEach(btn => {
      btn.onclick = () => showLegal(btn.getAttribute('data-legal'));
    });

    document.getElementById('btn-login').onclick = async () => {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      const btn = document.getElementById('btn-login');
      errEl.classList.add('hidden');
      if (!email || !password) {
        errEl.textContent = 'Please type your email and password.';
        errEl.classList.remove('hidden');
        return;
      }
      if (!IF.client) {
        errEl.textContent = 'Supabase not ready. Open console, run __debugInvoiceFlowConfig(), fix js/config.js keys, hard-refresh.';
        errEl.classList.remove('hidden');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        const data = await IF.signIn(email, password);
        const user = data?.user || data?.session?.user;
        if (user) {
          IF.currentUser = user;
          try { await IF.loadProfile(); } catch (e) { console.error(e); }
          await showApp();
        } else {
          errEl.textContent = 'Sign in succeeded but no session. Disable email confirmation in Supabase Auth settings, or confirm your email.';
          errEl.classList.remove('hidden');
        }
      } catch (e) {
        errEl.textContent = e.message || 'Sign in failed';
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    };

    document.getElementById('btn-signup').onclick = async () => {
      const name = document.getElementById('signup-name').value.trim();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const errEl = document.getElementById('signup-error');
      const btn = document.getElementById('btn-signup');
      errEl.classList.add('hidden');
      if (!email || !password) {
        errEl.textContent = 'Please type your email and password (fields must not be empty).';
        errEl.classList.remove('hidden');
        return;
      }
      if (password.length < 6) {
        errEl.textContent = 'Password must be at least 6 characters';
        errEl.classList.remove('hidden');
        return;
      }
      if (!IF.client) {
        errEl.textContent = 'Supabase not ready. Open console, run __debugInvoiceFlowConfig(), fix js/config.js keys, hard-refresh.';
        errEl.classList.remove('hidden');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Creating…';
      try {
        const data = await IF.signUp(email, password, name);
        // If Supabase returns a session → go straight to dashboard
        if (data?.session?.user || data?.user?.id && data?.session) {
          IF.currentUser = data.session.user;
          try { await IF.loadProfile(); } catch (e) { console.error(e); }
          IFUtils.toast('Welcome! Account created.');
          await showApp();
          return;
        }
        // Email confirmation required — try immediate sign-in (works if confirm is off)
        try {
          const loginData = await IF.signIn(email, password);
          if (loginData?.user || loginData?.session?.user) {
            IF.currentUser = loginData.user || loginData.session.user;
            try { await IF.loadProfile(); } catch (e) { console.error(e); }
            IFUtils.toast('Welcome! Account created.');
            await showApp();
            return;
          }
        } catch (signInErr) {
          console.warn('post-signup sign-in', signInErr);
        }
        // Still no session → tell user to confirm email OR disable confirmation
        errEl.className = 'text-sm text-amber-600';
        errEl.textContent = 'Account created. If you did not enter the app: Supabase → Authentication → Providers → Email → turn OFF "Confirm email", then Sign in.';
        errEl.classList.remove('hidden');
        document.getElementById('signup-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('login-email').value = email;
      } catch (e) {
        errEl.className = 'text-sm text-red-600';
        errEl.textContent = e.message || 'Sign up failed';
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create account';
      }
    };
  }

  // ─── Legal pages ───────────────────────────────────────────────────────
  const LEGAL = {
    terms: {
      title: 'Terms of Service',
      body: `
        <p class="text-sm text-slate-500 mb-4">Last updated: October 2026</p>
        <h4 class="font-semibold mt-4 mb-2">1. Acceptance</h4>
        <p>By creating an account or using InvoiceFlow ("Service"), you agree to these Terms of Service. If you do not agree, do not use the Service.</p>
        <h4 class="font-semibold mt-4 mb-2">2. Description of service</h4>
        <p>InvoiceFlow is an online invoicing and billing tool for freelancers, agencies, and businesses. Features and limits depend on your subscription plan.</p>
        <h4 class="font-semibold mt-4 mb-2">3. Accounts</h4>
        <p>You must provide accurate information and keep your password secure. You are responsible for all activity under your account. You must be at least 18 years old to use the Service.</p>
        <h4 class="font-semibold mt-4 mb-2">4. Subscriptions &amp; billing</h4>
        <p>Paid plans are billed in advance via Paddle. Prices are shown on the Billing page. We may change prices with notice. Failure to pay may result in suspension or downgrade to the Free plan.</p>
        <h4 class="font-semibold mt-4 mb-2">5. Acceptable use</h4>
        <p>You may not use the Service for illegal activity, spam, abuse, or to infringe others' rights. We may suspend accounts that violate these terms.</p>
        <h4 class="font-semibold mt-4 mb-2">6. Your content</h4>
        <p>You retain ownership of invoices, customer data, and other content you upload. You grant us a limited license to host and process that content solely to provide the Service.</p>
        <h4 class="font-semibold mt-4 mb-2">7. Disclaimer</h4>
        <p>The Service is provided "as is". We do not guarantee uninterrupted availability. We are not liable for indirect or consequential damages to the fullest extent permitted by law.</p>
        <h4 class="font-semibold mt-4 mb-2">8. Termination</h4>
        <p>You may cancel anytime. We may terminate accounts for breach of these Terms. Upon termination, your right to use the Service ends.</p>
        <h4 class="font-semibold mt-4 mb-2">9. Contact</h4>
        <p>Questions: mmubashi75@gmail.com</p>
      `
    },
    privacy: {
      title: 'Privacy Policy',
      body: `
        <p class="text-sm text-slate-500 mb-4">Last updated: October 2026</p>
        <h4 class="font-semibold mt-4 mb-2">1. What we collect</h4>
        <p>Account data (name, email, password hash), company settings, invoices, customers, products, payments you enter, and billing information processed by Paddle. We also collect basic usage and technical logs for security.</p>
        <h4 class="font-semibold mt-4 mb-2">2. How we use data</h4>
        <p>To provide and improve the Service, process subscriptions, send transactional emails, and comply with law. We do not sell your personal data.</p>
        <h4 class="font-semibold mt-4 mb-2">3. Processors</h4>
        <p>We use Supabase (auth &amp; database) and Paddle (payments). Their privacy policies apply to data they process on our behalf.</p>
        <h4 class="font-semibold mt-4 mb-2">4. Data retention</h4>
        <p>We keep your data while your account is active. After deletion we may remove or anonymize data within a reasonable period, except where law requires longer retention.</p>
        <h4 class="font-semibold mt-4 mb-2">5. Security</h4>
        <p>We use industry-standard measures (encryption in transit, access controls). Use a strong unique password.</p>
        <h4 class="font-semibold mt-4 mb-2">6. Your rights</h4>
        <p>You may request access, correction, export, or deletion of your personal data. Contact mmubashi75@gmail.com.</p>
        <h4 class="font-semibold mt-4 mb-2">7. Cookies</h4>
        <p>We use essential storage for login session and preferences. We do not use third-party advertising cookies.</p>
        <h4 class="font-semibold mt-4 mb-2">8. Children</h4>
        <p>The Service is not directed at children under 16.</p>
        <h4 class="font-semibold mt-4 mb-2">9. Changes</h4>
        <p>We may update this policy. Continued use after changes constitutes acceptance.</p>
      `
    },
    refund: {
      title: 'Refund Policy',
      body: `
        <p class="text-sm text-slate-500 mb-4">Last updated: October 2026</p>
        <h4 class="font-semibold mt-4 mb-2">1. Free trial</h4>
        <p>New accounts receive a 7-day free trial with Pro-level features. No credit card is required. You will not be charged unless you subscribe to a paid plan.</p>
        <h4 class="font-semibold mt-4 mb-2">2. Paid subscriptions</h4>
        <p>Subscriptions (Starter, Pro, Business) are billed monthly in advance through Paddle. You can cancel anytime; access continues until the end of the current billing period.</p>
        <h4 class="font-semibold mt-4 mb-2">3. Refund eligibility</h4>
        <p>We offer a <strong>7-day money-back guarantee</strong> on your first paid charge if you are not satisfied. After 7 days, or for renewal charges, fees are generally non-refundable except where required by law.</p>
        <h4 class="font-semibold mt-4 mb-2">4. How to request a refund</h4>
        <p>Email mmubashi75@gmail.com within 7 days of the charge with your account email and reason. Approved refunds are processed via Paddle (typically 5–10 business days).</p>
        <h4 class="font-semibold mt-4 mb-2">5. Chargebacks</h4>
        <p>Please contact us before filing a chargeback so we can resolve the issue.</p>
        <h4 class="font-semibold mt-4 mb-2">6. Plan changes</h4>
        <p>Upgrades take effect immediately; downgrades apply at the next billing cycle. We do not prorate refunds for unused time except at our discretion.</p>
      `
    }
  };

  function showLegal(key) {
    const doc = LEGAL[key];
    if (!doc) return;
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-backdrop">
        <div class="modal modal-lg p-0 max-h-[85vh] flex flex-col">
          <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
            <h3 class="text-lg font-semibold">${doc.title}</h3>
            <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('modalRoot').innerHTML=''">&times;</button>
          </div>
          <div class="p-6 overflow-y-auto text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            ${doc.body}
          </div>
          <div class="px-6 py-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalRoot').innerHTML=''">Close</button>
          </div>
        </div>
      </div>`;
  }

  // ─── Navigation ────────────────────────────────────────────────────────
  function navigate(view, opts = {}) {
    currentView = view;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    const el = document.getElementById('view-' + view);
    if (el) el.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    const titles = {
      dashboard: 'Dashboard', invoices: 'Invoices', customers: 'Customers',
      products: 'Products & Services', payments: 'Payments', reports: 'Reports',
      billing: 'Pricing & Plans', settings: 'Settings',
      'invoice-builder': editingInvoiceId ? 'Edit Invoice' : 'Create Invoice',
      'invoice-detail': 'Invoice'
    };
    document.getElementById('pageTitle').textContent = titles[view] || 'InvoiceFlow';

    document.getElementById('sidebar').classList.add('-translate-x-full');
    document.getElementById('sidebarOverlay').classList.add('hidden');

    renderView(opts);
  }

  function renderView(opts) {
    switch (currentView) {
      case 'dashboard': renderDashboard(); break;
      case 'invoices': renderInvoices(); break;
      case 'customers': renderCustomers(); break;
      case 'products': renderProducts(); break;
      case 'payments': renderPayments(); break;
      case 'reports': renderReports(); break;
      case 'billing': renderBilling(); break; // Pricing page
      case 'settings': renderSettings(); break;
      case 'invoice-builder': renderInvoiceBuilder(); break;
      case 'invoice-detail': renderInvoiceDetail(opts.id); break;
    }
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────
  function renderDashboard() {
    const list = invoices.map(inv => {
      const status = IF.deriveStatus(inv);
      const totals = IF.calcTotals(inv);
      return { ...inv, status, ...totals };
    });
    const revenue = list.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
    const outstanding = list.filter(i => ['sent','viewed','partially_paid','overdue'].includes(i.status)).reduce((s, i) => s + i.balance, 0);
    const overdue = list.filter(i => i.status === 'overdue').reduce((s, i) => s + i.balance, 0);
    const paidCount = list.filter(i => i.status === 'paid').length;
    const sym = IF.currentProfile?.currency_symbol || '$';
    const recent = [...list].slice(0, 8);

    document.getElementById('view-dashboard').innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-value text-emerald-600">${IFUtils.formatCurrency(revenue, sym)}</div></div>
        <div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-value text-amber-600">${IFUtils.formatCurrency(outstanding, sym)}</div></div>
        <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value text-red-600">${IFUtils.formatCurrency(overdue, sym)}</div></div>
        <div class="stat-card"><div class="stat-label">Paid Invoices</div><div class="stat-value">${paidCount}</div></div>
      </div>
      <div class="flex justify-between items-center mb-4">
        <h2 class="font-semibold">Recent Invoices</h2>
        <button class="btn btn-primary btn-sm" onclick="App.createInvoice()">+ Create Invoice</button>
      </div>
      <div class="card overflow-hidden">
        <table class="data-table w-full">
          <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${recent.length === 0 ? '<tr><td colspan="6" class="text-center py-8 text-slate-500">No invoices yet</td></tr>' :
              recent.map(inv => {
                const cust = customers.find(c => c.id === inv.customer_id);
                return `<tr class="cursor-pointer" onclick="App.viewInvoice('${inv.id}')">
                  <td class="font-medium">${IFUtils.escapeHtml(inv.number)}</td>
                  <td>${IFUtils.escapeHtml(cust?.name || '—')}</td>
                  <td>${IFUtils.formatDateShort(inv.issue_date)}</td>
                  <td>${IFUtils.formatCurrency(inv.total, sym)}</td>
                  <td><span class="${IFUtils.statusClass(inv.status)}">${IFUtils.statusLabel(inv.status)}</span></td>
                  <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();App.viewInvoice('${inv.id}')">View</button></td>
                </tr>`;
              }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ─── Invoices (simplified list + builder entry) ────────────────────────
  function renderInvoices() {
    const sym = IF.currentProfile?.currency_symbol || '$';
    const list = invoices.map(inv => ({ ...inv, status: IF.deriveStatus(inv), ...IF.calcTotals(inv) }));

    document.getElementById('view-invoices').innerHTML = `
      <div class="flex justify-between mb-4">
        <input id="inv-search" class="form-input max-w-xs" placeholder="Search…" oninput="App.filterInvoices()">
        <button class="btn btn-primary" onclick="App.createInvoice()">+ New Invoice</button>
      </div>
      <div class="card overflow-hidden">
        <table class="data-table w-full">
          <thead><tr><th>Number</th><th>Customer</th><th>Issue</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead>
          <tbody id="inv-tbody">
            ${list.map(inv => {
              const cust = customers.find(c => c.id === inv.customer_id);
              return `<tr>
                <td class="font-medium">${IFUtils.escapeHtml(inv.number)}</td>
                <td>${IFUtils.escapeHtml(cust?.name || '—')}</td>
                <td>${IFUtils.formatDateShort(inv.issue_date)}</td>
                <td>${IFUtils.formatDateShort(inv.due_date)}</td>
                <td>${IFUtils.formatCurrency(inv.total, sym)}</td>
                <td>${IFUtils.formatCurrency(inv.balance, sym)}</td>
                <td><span class="${IFUtils.statusClass(inv.status)}">${IFUtils.statusLabel(inv.status)}</span></td>
                <td class="whitespace-nowrap">
                  <button class="btn btn-ghost btn-sm" onclick="App.viewInvoice('${inv.id}')">View</button>
                  <button class="btn btn-ghost btn-sm" onclick="App.editInvoice('${inv.id}')">Edit</button>
                </td>
              </tr>`;
            }).join('') || '<tr><td colspan="8" class="text-center py-8 text-slate-500">No invoices</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  // ─── Customers ─────────────────────────────────────────────────────────
  function renderCustomers() {
    document.getElementById('view-customers').innerHTML = `
      <div class="flex justify-between mb-4">
        <h2 class="font-semibold">Customers</h2>
        <button class="btn btn-primary btn-sm" onclick="App.openCustomerModal()">+ Add</button>
      </div>
      <div class="card overflow-hidden">
        <table class="data-table w-full">
          <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th></th></tr></thead>
          <tbody>
            ${customers.map(c => `
              <tr>
                <td class="font-medium">${IFUtils.escapeHtml(c.name)}</td>
                <td>${IFUtils.escapeHtml(c.company || '—')}</td>
                <td>${IFUtils.escapeHtml(c.email || '—')}</td>
                <td>${IFUtils.escapeHtml(c.phone || '—')}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="App.openCustomerModal('${c.id}')">Edit</button>
                  <button class="btn btn-ghost btn-sm text-red-600" onclick="App.deleteCustomer('${c.id}')">Delete</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="5" class="text-center py-8 text-slate-500">No customers</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function openCustomerModal(id) {
    if (!id) {
      const check = checkLimit('customers');
      if (!check.allowed) {
        showUpgradeModal(`You've reached the limit of ${check.limit} customers on the ${getCurrentPlan().name} plan. Upgrade to add more.`);
        return;
      }
    }
    const c = id ? customers.find(x => x.id === id) : null;
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-backdrop"><div class="modal p-6">
        <h3 class="text-lg font-semibold mb-4">${c ? 'Edit' : 'New'} Customer</h3>
        <form id="custForm" class="space-y-3">
          <input name="name" class="form-input" placeholder="Full name *" required value="${IFUtils.escapeHtml(c?.name||'')}">
          <input name="company" class="form-input" placeholder="Company" value="${IFUtils.escapeHtml(c?.company||'')}">
          <input name="email" type="email" class="form-input" placeholder="Email" value="${IFUtils.escapeHtml(c?.email||'')}">
          <input name="phone" class="form-input" placeholder="Phone" value="${IFUtils.escapeHtml(c?.phone||'')}">
          <textarea name="address" class="form-textarea" placeholder="Billing address">${IFUtils.escapeHtml(c?.address||'')}</textarea>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalRoot').innerHTML=''">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div></div>`;
    document.getElementById('custForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = Object.fromEntries(fd);
      try {
        if (c) {
          await IF.updateCustomer(c.id, payload);
          Object.assign(c, payload);
        } else {
          const created = await IF.createCustomer(payload);
          customers.push(created);
        }
        document.getElementById('modalRoot').innerHTML = '';
        IFUtils.toast('Saved');
        renderCustomers();
      } catch (err) {
        IFUtils.toast(err.message, 'error');
      }
    };
  }

  async function deleteCustomer(id) {
    if (!(await IFUtils.confirm('Delete this customer?'))) return;
    try {
      await IF.deleteCustomer(id);
      customers = customers.filter(c => c.id !== id);
      IFUtils.toast('Deleted');
      renderCustomers();
    } catch (e) {
      IFUtils.toast(e.message, 'error');
    }
  }

  // ─── Products (same pattern) ───────────────────────────────────────────
  function renderProducts() {
    const sym = IF.currentProfile?.currency_symbol || '$';
    document.getElementById('view-products').innerHTML = `
      <div class="flex justify-between mb-4">
        <h2 class="font-semibold">Products & Services</h2>
        <button class="btn btn-primary btn-sm" onclick="App.openProductModal()">+ Add</button>
      </div>
      <div class="card overflow-hidden">
        <table class="data-table w-full">
          <thead><tr><th>Name</th><th>SKU</th><th>Price</th><th>Unit</th><th></th></tr></thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td class="font-medium">${IFUtils.escapeHtml(p.name)}</td>
                <td class="text-xs font-mono">${IFUtils.escapeHtml(p.sku||'—')}</td>
                <td>${IFUtils.formatCurrency(p.price, sym)}</td>
                <td>${IFUtils.escapeHtml(p.unit||'—')}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="App.openProductModal('${p.id}')">Edit</button>
                  <button class="btn btn-ghost btn-sm text-red-600" onclick="App.deleteProduct('${p.id}')">Delete</button>
                </td>
              </tr>`).join('') || '<tr><td colspan="5" class="text-center py-8 text-slate-500">No products</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  function openProductModal(id) {
    if (!id) {
      const check = checkLimit('products');
      if (!check.allowed) {
        showUpgradeModal(`You've reached the limit of ${check.limit} products on the ${getCurrentPlan().name} plan. Upgrade to add more.`);
        return;
      }
    }
    const p = id ? products.find(x => x.id === id) : null;
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-backdrop"><div class="modal p-6">
        <h3 class="text-lg font-semibold mb-4">${p ? 'Edit' : 'New'} Product</h3>
        <form id="prodForm" class="space-y-3">
          <input name="name" class="form-input" placeholder="Name *" required value="${IFUtils.escapeHtml(p?.name||'')}">
          <input name="description" class="form-input" placeholder="Description" value="${IFUtils.escapeHtml(p?.description||'')}">
          <div class="grid grid-cols-2 gap-3">
            <input name="sku" class="form-input" placeholder="SKU" value="${IFUtils.escapeHtml(p?.sku||'')}">
            <input name="unit" class="form-input" placeholder="Unit" value="${IFUtils.escapeHtml(p?.unit||'')}">
            <input name="price" type="number" step="0.01" class="form-input" placeholder="Price" required value="${p?.price??''}">
            <input name="tax_rate" type="number" step="0.01" class="form-input" placeholder="Tax %" value="${p?.tax_rate??0}">
          </div>
          <div class="flex justify-end gap-2">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modalRoot').innerHTML=''">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div></div>`;
    document.getElementById('prodForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        name: fd.get('name'),
        description: fd.get('description'),
        sku: fd.get('sku'),
        unit: fd.get('unit'),
        price: parseFloat(fd.get('price')) || 0,
        tax_rate: parseFloat(fd.get('tax_rate')) || 0
      };
      try {
        if (p) {
          await IF.updateProduct(p.id, payload);
          Object.assign(p, payload);
        } else {
          const created = await IF.createProduct(payload);
          products.push(created);
        }
        document.getElementById('modalRoot').innerHTML = '';
        IFUtils.toast('Saved');
        renderProducts();
      } catch (err) {
        IFUtils.toast(err.message, 'error');
      }
    };
  }

  async function deleteProduct(id) {
    if (!(await IFUtils.confirm('Delete product?'))) return;
    await IF.deleteProduct(id);
    products = products.filter(p => p.id !== id);
    IFUtils.toast('Deleted');
    renderProducts();
  }

  // ─── Payments ──────────────────────────────────────────────────────────
  function renderPayments() {
    const all = [];
    invoices.forEach(inv => {
      (inv.payments || []).forEach(p => all.push({ ...p, invoice_number: inv.number, customer_id: inv.customer_id }));
    });
    const sym = IF.currentProfile?.currency_symbol || '$';
    document.getElementById('view-payments').innerHTML = `
      <div class="card overflow-hidden">
        <table class="data-table w-full">
          <thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th>Reference</th><th>Amount</th></tr></thead>
          <tbody>
            ${all.length === 0 ? '<tr><td colspan="5" class="text-center py-8 text-slate-500">No payments yet</td></tr>' :
              all.map(p => `<tr>
                <td>${IFUtils.formatDate(p.payment_date)}</td>
                <td>${IFUtils.escapeHtml(p.invoice_number)}</td>
                <td>${IFUtils.escapeHtml(p.method||'—')}</td>
                <td class="font-mono text-xs">${IFUtils.escapeHtml(p.reference||'—')}</td>
                <td class="text-emerald-600 font-medium">${IFUtils.formatCurrency(p.amount, sym)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ─── Reports ───────────────────────────────────────────────────────────
  function renderReports() {
    const list = invoices.map(inv => {
      const status = IF.deriveStatus(inv);
      const totals = IF.calcTotals(inv);
      return { ...inv, status, ...totals };
    });
    const sym = IF.currentProfile?.currency_symbol || '$';
    const paid = list.filter(i => i.status === 'paid');
    const outstanding = list.filter(i => ['sent', 'viewed', 'partially_paid', 'overdue'].includes(i.status));
    const overdueList = list.filter(i => i.status === 'overdue');
    const revenue = paid.reduce((s, i) => s + i.total, 0);
    const outstandingAmt = outstanding.reduce((s, i) => s + i.balance, 0);
    const overdueAmt = overdueList.reduce((s, i) => s + i.balance, 0);

    // Monthly income last 6 months
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      let amount = 0;
      paid.forEach(inv => {
        (inv.payments || []).forEach(p => {
          const pd = p.payment_date || p.date || '';
          if (String(pd).startsWith(key)) amount += Number(p.amount) || 0;
        });
        // fallback: paid invoice issue month if no payments array
        if (!(inv.payments || []).length && (inv.issue_date || '').startsWith(key)) {
          amount += inv.total || 0;
        }
      });
      months.push({ key, label, amount });
    }

    const statusCounts = {};
    list.forEach(i => { statusCounts[i.status] = (statusCounts[i.status] || 0) + 1; });

    document.getElementById('view-reports').innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="stat-card">
          <div class="stat-label">Total Revenue (Paid)</div>
          <div class="stat-value text-emerald-600">${IFUtils.formatCurrency(revenue, sym)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Outstanding</div>
          <div class="stat-value text-amber-600">${IFUtils.formatCurrency(outstandingAmt, sym)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Overdue</div>
          <div class="stat-value text-red-600">${IFUtils.formatCurrency(overdueAmt, sym)}</div>
        </div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div class="card p-5">
          <h3 class="font-semibold mb-4">Monthly Income</h3>
          <canvas id="chart-monthly" height="220"></canvas>
        </div>
        <div class="card p-5">
          <h3 class="font-semibold mb-4">Status Breakdown</h3>
          <canvas id="chart-status" height="220"></canvas>
        </div>
      </div>
      <div class="card overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 class="font-semibold">Overdue Invoices</h3>
        </div>
        <table class="data-table w-full">
          <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            ${overdueList.length === 0
              ? '<tr><td colspan="5" class="text-center py-6 text-slate-500">No overdue invoices</td></tr>'
              : overdueList.map(inv => {
                  const cust = customers.find(c => c.id === inv.customer_id);
                  return `<tr>
                    <td class="font-medium">${IFUtils.escapeHtml(inv.number)}</td>
                    <td>${IFUtils.escapeHtml(cust?.name || '—')}</td>
                    <td>${IFUtils.formatDate(inv.due_date)}</td>
                    <td class="font-medium text-red-600">${IFUtils.formatCurrency(inv.balance, sym)}</td>
                    <td><button class="btn btn-ghost btn-sm" onclick="App.viewInvoice('${inv.id}')">View</button></td>
                  </tr>`;
                }).join('')}
          </tbody>
        </table>
      </div>`;

    setTimeout(() => {
      if (window.charts) {
        if (charts.monthly) charts.monthly.destroy();
        if (charts.status) charts.status.destroy();
      } else {
        window.charts = {};
      }
      const ctx1 = document.getElementById('chart-monthly');
      if (ctx1 && window.Chart) {
        charts.monthly = new Chart(ctx1, {
          type: 'bar',
          data: {
            labels: months.map(m => m.label),
            datasets: [{ label: 'Income', data: months.map(m => m.amount), backgroundColor: '#3b82f6', borderRadius: 6 }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { callback: v => sym + v } } }
          }
        });
      }
      const ctx2 = document.getElementById('chart-status');
      if (ctx2 && window.Chart) {
        const labels = Object.keys(statusCounts);
        charts.status = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: labels.map(s => IFUtils.statusLabel(s)),
            datasets: [{
              data: Object.values(statusCounts),
              backgroundColor: ['#94a3b8', '#3b82f6', '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#64748b']
            }]
          },
          options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
      }
    }, 50);
  }

  // ─── Plan helpers ──────────────────────────────────────────────────────
  function getCurrentPlanId() {
    // Uses Supabase profile + expiry rules: expired/canceled → free until resubscribe
    if (typeof IF.getEffectivePlanId === 'function') {
      return IF.getEffectivePlanId();
    }
    const p = IF.currentProfile || {};
    const status = (p.subscription_status || '').toLowerCase();
    const plan = (p.subscription_plan || 'free').toLowerCase();
    const now = new Date();
    if (status === 'active' && plan && plan !== 'free') {
      if (p.subscription_ends_at && new Date(p.subscription_ends_at) < now) return 'free';
      return plan;
    }
    if ((status === 'trialing' || status === 'trial') && p.trial_ends_at && new Date(p.trial_ends_at) > now) {
      return 'pro';
    }
    return 'free';
  }

  function getCurrentPlan() {
    return PLANS[getCurrentPlanId()] || PLANS.free;
  }

  function checkLimit(type) {
    const plan = getCurrentPlan();
    const limits = {
      invoices: plan.invoicesPerMonth,
      customers: plan.customers,
      products: plan.products
    };
    const limit = limits[type];
    if (limit === -1 || limit == null) return { allowed: true, limit: -1, current: 0 };

    let current = 0;
    if (type === 'customers') current = customers.length;
    else if (type === 'products') current = products.length;
    else if (type === 'invoices') {
      // Count invoices created this calendar month
      const now = new Date();
      const ym = now.toISOString().slice(0, 7);
      current = invoices.filter(i => (i.created_at || i.issue_date || '').startsWith(ym)).length;
    }
    return { allowed: current < limit, limit, current };
  }

  function showUpgradeModal(reason) {
    document.getElementById('modalRoot').innerHTML = `
      <div class="modal-backdrop">
        <div class="modal p-6 max-w-md text-center">
          <h3 class="text-lg font-semibold mb-2">Upgrade required</h3>
          <p class="text-sm text-slate-600 dark:text-slate-400 mb-6">${reason}</p>
          <button class="btn btn-primary w-full" onclick="document.getElementById('modalRoot').innerHTML=''; App.navigate('billing')">View Plans</button>
          <button class="btn btn-ghost w-full mt-2" onclick="document.getElementById('modalRoot').innerHTML=''">Maybe later</button>
        </div>
      </div>`;
  }

  // ─── Billing (Paddle) ──────────────────────────────────────────────────
  function renderBilling() {
    const p = IF.currentProfile || {};
    const currentPlanId = getCurrentPlanId();
    const isActive = p.subscription_status === 'active';
    const isTrial = p.subscription_status === 'trialing' || (p.trial_ends_at && new Date(p.trial_ends_at) > new Date());

    const planCards = [
      {
        id: 'free',
        name: 'Free',
        price: '$0',
        period: '',
        features: [
          '10 invoices / month',
          '20 customers',
          '20 products',
          '1 business',
          '1 invoice template',
          'PDF export',
          'Your branding'
        ],
        cta: null
      },
      {
        id: 'starter',
        name: 'Starter',
        price: '$5',
        period: '/month',
        features: [
          '100 invoices / month',
          '500 customers',
          '500 products',
          '3 templates',
          'Custom logo',
          'Payment tracking',
          'Recurring invoices',
          '2 users'
        ],
        cta: 'starter'
      },
      {
        id: 'pro',
        name: 'Pro',
        price: '$15',
        period: '/month',
        features: [
          'Unlimited invoices',
          '5,000 customers',
          '5,000 products',
          '10 users',
          'Unlimited templates',
          'Recurring invoices',
          'Payment reminders',
          'Reports',
          'WhatsApp sharing',
          'Custom branding'
        ],
        cta: 'pro',
        popular: true
      },
      {
        id: 'business',
        name: 'Business',
        price: '$29',
        period: '/month',
        features: [
          'Unlimited invoices',
          '50,000 customers',
          '25 users',
          'Multiple businesses',
          'API access',
          'Advanced reports',
          'Accountant access',
          '100 GB documents'
        ],
        cta: 'business'
      }
    ];

    document.getElementById('view-billing').innerHTML = `
      <div class="max-w-5xl mx-auto space-y-6">
        <div class="card p-6">
          <h2 class="text-lg font-semibold mb-1">Pricing — Your plan</h2>
          <p class="text-3xl font-bold mb-1">${isActive ? (PLANS[p.subscription_plan]?.name || p.subscription_plan || 'Pro').toUpperCase() : isTrial ? 'Pro (Trial)' : 'Free'}</p>
          <p class="text-sm text-slate-500">
            ${isTrial && p.trial_ends_at ? `Trial ends ${IFUtils.formatDate(p.trial_ends_at.slice(0,10))}. ` : ''}
            ${isActive ? 'Thank you for subscribing!' : 'Upgrade anytime to unlock higher limits & features.'}
          </p>
        </div>

        <div class="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
          ${planCards.map(plan => {
            const isCurrent = currentPlanId === plan.id || (isTrial && plan.id === 'pro' && !isActive);
            return `
            <div class="card p-5 flex flex-col border-2 ${isCurrent ? 'border-blue-500 ring-1 ring-blue-500' : plan.popular ? 'border-blue-200 dark:border-blue-800' : 'border-transparent'} relative">
              ${plan.popular ? '<span class="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-medium px-2 py-0.5 rounded-full">Popular</span>' : ''}
              <h3 class="font-semibold text-lg">${plan.name}</h3>
              <p class="text-3xl font-bold my-2">${plan.price}<span class="text-base font-normal text-slate-500">${plan.period}</span></p>
              <ul class="text-sm space-y-1.5 mb-6 text-slate-600 dark:text-slate-400 flex-1">
                ${plan.features.map(f => `<li class="flex gap-2"><span class="text-emerald-500 shrink-0">✓</span><span>${f}</span></li>`).join('')}
              </ul>
              ${plan.cta ? `
                <button class="btn ${isCurrent ? 'btn-secondary' : 'btn-primary'} w-full" 
                  onclick="App.checkout('${plan.cta}')" 
                  ${isCurrent && isActive ? 'disabled' : ''}>
                  ${isCurrent && isActive ? 'Current plan' : 'Subscribe'}
                </button>` : `
                <button class="btn btn-secondary w-full" disabled>Free plan</button>`}
            </div>`;
          }).join('')}
        </div>
        <p class="text-xs text-slate-400 text-center">Starter $5 · Pro $15 · Business $29 / month. All plans include a 7-day trial. When the trial or paid period ends you return to Free until you subscribe again. Support: mmubashi75@gmail.com</p>
      </div>`;
  }

  async function checkout(plan) {
    if (!window.Paddle || !CONFIG.PADDLE_CLIENT_TOKEN || CONFIG.PADDLE_CLIENT_TOKEN.includes('YOUR_')) {
      IFUtils.toast('Paddle not configured. Add your keys in js/config.js', 'error');
      return;
    }
    const priceMap = {
      starter: CONFIG.PADDLE_PRICE_STARTER,
      pro: CONFIG.PADDLE_PRICE_PRO,
      business: CONFIG.PADDLE_PRICE_BUSINESS
    };
    const priceId = priceMap[plan];
    if (!priceId || priceId.includes('xxxxx')) {
      IFUtils.toast('Create the price in Paddle and put the Price ID in config.js', 'error');
      return;
    }
    try {
      Paddle.Initialize({
        token: CONFIG.PADDLE_CLIENT_TOKEN,
        environment: CONFIG.PADDLE_ENVIRONMENT
      });
      Paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: { email: IF.currentUser.email },
        customData: { user_id: IF.currentUser.id, plan },
        settings: { successUrl: window.location.origin + '/?upgraded=1' }
      });
    } catch (e) {
      console.error(e);
      IFUtils.toast('Checkout failed. Check Paddle configuration.', 'error');
    }
  }

  // ─── Settings ──────────────────────────────────────────────────────────
  function renderSettings() {
    const p = IF.currentProfile || {};
    document.getElementById('view-settings').innerHTML = `
      <form id="settingsForm" class="max-w-xl space-y-4 card p-6">
        <h3 class="font-semibold">Company Settings</h3>
        <input name="company_name" class="form-input" placeholder="Company name" value="${IFUtils.escapeHtml(p.company_name||'')}">
        <input name="email" class="form-input" placeholder="Email" value="${IFUtils.escapeHtml(p.email||'')}">
        <input name="phone" class="form-input" placeholder="Phone" value="${IFUtils.escapeHtml(p.phone||'')}">
        <textarea name="address" class="form-textarea" placeholder="Address">${IFUtils.escapeHtml(p.address||'')}</textarea>
        <div class="grid grid-cols-2 gap-3">
          <input name="currency_symbol" class="form-input" placeholder="Currency $" value="${IFUtils.escapeHtml(p.currency_symbol||'$')}">
          <input name="invoice_prefix" class="form-input" placeholder="Prefix INV-" value="${IFUtils.escapeHtml(p.invoice_prefix||'INV-')}">
          <input name="brand_color" type="color" class="form-input h-10" value="${p.brand_color||'#2563eb'}">
          <select name="template" class="form-select">
            <option value="modern" ${p.template==='modern'?'selected':''}>Modern</option>
            <option value="classic" ${p.template==='classic'?'selected':''}>Classic</option>
            <option value="minimal" ${p.template==='minimal'?'selected':''}>Minimal</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary">Save Settings</button>
      </form>
      <div class="max-w-xl mt-6 card p-5">
        <h3 class="font-semibold mb-3">Legal</h3>
        <div class="flex flex-wrap gap-3 text-sm">
          <button type="button" class="text-blue-600 hover:underline" onclick="App.showLegal('terms')">Terms of Service</button>
          <button type="button" class="text-blue-600 hover:underline" onclick="App.showLegal('privacy')">Privacy Policy</button>
          <button type="button" class="text-blue-600 hover:underline" onclick="App.showLegal('refund')">Refund Policy</button>
        </div>
      </div>`;
    document.getElementById('settingsForm').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updates = Object.fromEntries(fd);
      try {
        await IF.updateProfile(updates);
        IFUtils.toast('Settings saved');
        updatePlanBadge();
      } catch (err) {
        IFUtils.toast(err.message, 'error');
      }
    };
  }

  // ─── Invoice builder & detail (core) ───────────────────────────────────
  function createInvoice() {
    const check = checkLimit('invoices');
    if (!check.allowed) {
      showUpgradeModal(`You've reached the limit of ${check.limit} invoices this month on the ${getCurrentPlan().name} plan. Upgrade to create more.`);
      return;
    }
    editingInvoiceId = null;
    navigate('invoice-builder');
  }
  function editInvoice(id) {
    editingInvoiceId = id;
    navigate('invoice-builder');
  }
  function viewInvoice(id) {
    navigate('invoice-detail', { id });
  }

  let builderItems = [];

  function renderInvoiceBuilder() {
    const inv = editingInvoiceId ? invoices.find(i => i.id === editingInvoiceId) : null;
    const profile = IF.currentProfile || {};
    const number = inv ? inv.number : `${profile.invoice_prefix || 'INV-'}${profile.next_invoice_number || 1001}`;
    const sym = profile.currency_symbol || '$';

    builderItems = inv?.items && inv.items.length
      ? inv.items.map(it => ({
          name: it.name || '',
          description: it.description || '',
          qty: Number(it.qty) || 1,
          price: Number(it.price) || 0
        }))
      : [{ name: '', description: '', qty: 1, price: 0 }];

    document.getElementById('view-invoice-builder').innerHTML = `
      <div class="max-w-3xl mx-auto card p-6 space-y-5">
        <div class="flex justify-between items-center">
          <h2 class="text-xl font-semibold">${inv ? 'Edit' : 'Create'} Invoice</h2>
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('invoices')">← Back</button>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="form-label">Customer *</label>
            <select id="ib-customer" class="form-select">
              <option value="">Select customer…</option>
              ${customers.map(c => `<option value="${c.id}" ${inv?.customer_id===c.id?'selected':''}>${IFUtils.escapeHtml(c.name)}${c.email ? ' (' + IFUtils.escapeHtml(c.email) + ')' : ''}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Invoice #</label>
            <input id="ib-number" class="form-input" value="${IFUtils.escapeHtml(number)}">
          </div>
          <div>
            <label class="form-label">Issue Date</label>
            <input id="ib-issue" type="date" class="form-input" value="${inv?.issue_date || IFUtils.today()}">
          </div>
          <div>
            <label class="form-label">Due Date</label>
            <input id="ib-due" type="date" class="form-input" value="${inv?.due_date || IFUtils.addDays(IFUtils.today(), 14)}">
          </div>
          <div class="sm:col-span-2">
            <label class="form-label">PDF Template</label>
            <select id="ib-template" class="form-select">
              ${['modern','classic','minimal','bold','elegant'].map(id => {
                const labels = { modern:'Modern', classic:'Classic', minimal:'Minimal', bold:'Bold', elegant:'Elegant' };
                const sel = (inv?.template || profile.default_template || 'modern') === id ? 'selected' : '';
                return '<option value="'+id+'" '+sel+'>'+labels[id]+'</option>';
              }).join('')}
            </select>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-3">
            <label class="form-label mb-0">Line Items</label>
            <button type="button" class="btn btn-secondary btn-sm" onclick="App.addLineItem()">+ Add item</button>
          </div>
          <div class="hidden sm:grid sm:grid-cols-12 gap-2 text-xs text-slate-500 px-1 mb-1">
            <div class="sm:col-span-5">Item name</div>
            <div class="sm:col-span-2">Qty</div>
            <div class="sm:col-span-2">Price</div>
            <div class="sm:col-span-2">Amount</div>
            <div class="sm:col-span-1"></div>
          </div>
          <div id="ib-line-items" class="space-y-2"></div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="form-label">Discount (${sym})</label>
            <input id="ib-discount" type="number" step="0.01" min="0" class="form-input" value="${inv?.discount||0}" oninput="App.updateBuilderTotals()">
          </div>
          <div>
            <label class="form-label">Tax %</label>
            <input id="ib-tax" type="number" step="0.01" min="0" class="form-input" value="${inv?.tax_rate||0}" oninput="App.updateBuilderTotals()">
          </div>
          <div>
            <label class="form-label">Shipping</label>
            <input id="ib-shipping" type="number" step="0.01" min="0" class="form-input" value="${inv?.shipping||0}" oninput="App.updateBuilderTotals()">
          </div>
        </div>

        <div class="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><span id="ib-subtotal">${sym}0.00</span></div>
          <div class="flex justify-between font-semibold text-base pt-2 border-t border-slate-200 dark:border-slate-700">
            <span>Total</span><span id="ib-total" class="text-blue-600">${sym}0.00</span>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="form-label">Notes</label>
            <textarea id="ib-notes" class="form-textarea" rows="2">${IFUtils.escapeHtml(inv?.notes || profile.default_notes || '')}</textarea>
          </div>
          <div>
            <label class="form-label">Terms</label>
            <textarea id="ib-terms" class="form-textarea" rows="2">${IFUtils.escapeHtml(inv?.terms || profile.default_terms || '')}</textarea>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 justify-end">
          <button class="btn btn-secondary" onclick="App.saveInvoice(true)">Save Draft</button>
          <button class="btn btn-primary" onclick="App.saveInvoice(false)">Save &amp; Send</button>
        </div>
      </div>`;

    App.renderLineItems();
    App.updateBuilderTotals();
  }

  function renderLineItems() {
    const container = document.getElementById('ib-line-items');
    if (!container) return;
    const sym = IF.currentProfile?.currency_symbol || '$';
    // Full rebuild only when adding/removing rows — NOT on every keystroke
    container.innerHTML = builderItems.map((item, idx) => `
      <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start p-3 rounded-lg border border-slate-200 dark:border-slate-700" data-line-idx="${idx}">
        <div class="sm:col-span-5 space-y-1">
          <input class="form-input" placeholder="Item name" value="${IFUtils.escapeHtml(item.name)}"
            oninput="App.updateLineItem(${idx}, 'name', this.value)">
          <input class="form-input text-sm" placeholder="Description (optional)" value="${IFUtils.escapeHtml(item.description || '')}"
            oninput="App.updateLineItem(${idx}, 'description', this.value)">
        </div>
        <div class="sm:col-span-2">
          <input type="number" min="0.01" step="0.01" class="form-input" value="${item.qty}"
            oninput="App.updateLineItem(${idx}, 'qty', this.value)">
        </div>
        <div class="sm:col-span-2">
          <input type="number" min="0" step="0.01" class="form-input" value="${item.price}"
            oninput="App.updateLineItem(${idx}, 'price', this.value)">
        </div>
        <div class="sm:col-span-2 flex items-center h-10 text-sm font-medium" data-line-amount="${idx}">
          ${IFUtils.formatCurrency((Number(item.qty)||0) * (Number(item.price)||0), sym)}
        </div>
        <div class="sm:col-span-1 flex items-center">
          <button type="button" class="btn btn-ghost btn-sm text-red-500" title="Remove"
            onclick="App.removeLineItem(${idx})" ${builderItems.length <= 1 ? 'disabled' : ''}>×</button>
        </div>
      </div>
    `).join('');
  }

  function updateLineItem(idx, field, value) {
    if (!builderItems[idx]) return;
    if (field === 'qty' || field === 'price') {
      builderItems[idx][field] = parseFloat(value) || 0;
    } else {
      builderItems[idx][field] = value;
    }
    // Do NOT re-render inputs (that steals focus after each character).
    // Only refresh the amount cell + totals.
    const sym = IF.currentProfile?.currency_symbol || '$';
    const amtEl = document.querySelector('[data-line-amount="' + idx + '"]');
    if (amtEl) {
      const it = builderItems[idx];
      amtEl.textContent = IFUtils.formatCurrency((Number(it.qty) || 0) * (Number(it.price) || 0), sym);
    }
    App.updateBuilderTotals();
  }

  function addLineItem() {
    builderItems.push({ name: '', description: '', qty: 1, price: 0 });
    App.renderLineItems();
    App.updateBuilderTotals();
  }

  function removeLineItem(idx) {
    if (builderItems.length <= 1) return;
    builderItems.splice(idx, 1);
    App.renderLineItems();
    App.updateBuilderTotals();
  }

  function updateBuilderTotals() {
    const subtotal = builderItems.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0);
    const discount = parseFloat(document.getElementById('ib-discount')?.value) || 0;
    const taxRate = parseFloat(document.getElementById('ib-tax')?.value) || 0;
    const shipping = parseFloat(document.getElementById('ib-shipping')?.value) || 0;
    const after = Math.max(0, subtotal - discount);
    const tax = after * (taxRate / 100);
    const total = after + tax + shipping;
    const sym = IF.currentProfile?.currency_symbol || '$';
    const subEl = document.getElementById('ib-subtotal');
    const totEl = document.getElementById('ib-total');
    if (subEl) subEl.textContent = IFUtils.formatCurrency(subtotal, sym);
    if (totEl) totEl.textContent = IFUtils.formatCurrency(total, sym);
  }

  async function sendInvoiceToCustomer(invoice, customer) {
    if (!customer?.email) {
      IFUtils.toast('Invoice saved as Sent, but customer has no email address', 'error');
      return false;
    }
    const profile = IF.currentProfile || {};
    const sym = profile.currency_symbol || '$';
    const totals = IF.calcTotals(invoice);
    const company = profile.company_name || profile.full_name || 'InvoiceFlow';
    const subject = `Invoice ${invoice.number} from ${company}`;
    const lines = (invoice.items || []).map(it =>
      `• ${it.name} — ${it.qty} × ${sym}${Number(it.price).toFixed(2)} = ${sym}${(it.qty * it.price).toFixed(2)}`
    ).join('\n');
    const body = [
      `Hello ${customer.name || ''},`,
      '',
      `Please find your invoice details below.`,
      '',
      `Invoice: ${invoice.number}`,
      `Issue date: ${invoice.issue_date}`,
      `Due date: ${invoice.due_date}`,
      '',
      lines,
      '',
      `Total: ${sym}${totals.total.toFixed(2)}`,
      invoice.notes ? ('\nNotes: ' + invoice.notes) : '',
      invoice.terms ? ('\nTerms: ' + invoice.terms) : '',
      '',
      `Thank you,`,
      company,
      profile.email || ''
    ].filter(Boolean).join('\n');

    // Optional: Resend API (set CONFIG.RESEND_API_KEY + from email)
    if (CONFIG.RESEND_API_KEY && !String(CONFIG.RESEND_API_KEY).includes('YOUR_')) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + CONFIG.RESEND_API_KEY,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: CONFIG.RESEND_FROM || 'InvoiceFlow <onboarding@resend.dev>',
            to: [customer.email],
            subject,
            text: body
          })
        });
        if (res.ok) {
          IFUtils.toast('Invoice emailed to ' + customer.email);
          return true;
        }
        const err = await res.json().catch(() => ({}));
        console.warn('Resend error', err);
      } catch (e) {
        console.warn(e);
      }
    }

    // Fallback: open user's email client (mailto)
    const mailto = 'mailto:' + encodeURIComponent(customer.email)
      + '?subject=' + encodeURIComponent(subject)
      + '&body=' + encodeURIComponent(body);
    window.open(mailto, '_blank');
    IFUtils.toast('Email app opened for ' + customer.email + ' — click Send in your mail client');
    return true;
  }

  async function saveInvoice(asDraft) {
    const items = builderItems
      .filter(it => (it.name || '').trim())
      .map(it => ({
        name: it.name.trim(),
        description: (it.description || '').trim(),
        qty: Number(it.qty) || 0,
        price: Number(it.price) || 0
      }));

    if (!items.length) {
      IFUtils.toast('Add at least one line item with a name', 'error');
      return;
    }

    const payload = {
      customer_id: document.getElementById('ib-customer').value || null,
      number: document.getElementById('ib-number').value,
      issue_date: document.getElementById('ib-issue').value,
      due_date: document.getElementById('ib-due').value,
      status: asDraft ? 'draft' : 'sent',
      items,
      discount: parseFloat(document.getElementById('ib-discount').value) || 0,
      discount_type: 'fixed',
      tax_rate: parseFloat(document.getElementById('ib-tax').value) || 0,
      shipping: parseFloat(document.getElementById('ib-shipping').value) || 0,
      notes: document.getElementById('ib-notes')?.value || '',
      terms: document.getElementById('ib-terms')?.value || '',
      template: document.getElementById('ib-template')?.value || 'modern'
    };

    if (!payload.customer_id) {
      IFUtils.toast('Select a customer', 'error');
      return;
    }

    try {
      let saved;
      if (editingInvoiceId) {
        saved = await IF.updateInvoice(editingInvoiceId, payload);
        const idx = invoices.findIndex(i => i.id === editingInvoiceId);
        if (idx >= 0) invoices[idx] = { ...invoices[idx], ...payload, id: editingInvoiceId };
        saved = invoices[idx] || { ...payload, id: editingInvoiceId };
      } else {
        saved = await IF.createInvoice(payload);
        invoices.unshift(saved);
      }

      if (!asDraft) {
        const customer = customers.find(c => c.id === payload.customer_id);
        await sendInvoiceToCustomer(saved, customer);
      } else {
        IFUtils.toast('Draft saved');
      }
      navigate('invoices');
    } catch (e) {
      IFUtils.toast(e.message, 'error');
    }
  }

  function renderInvoiceDetail(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) { navigate('invoices'); return; }
    const status = IF.deriveStatus(inv);
    const totals = IF.calcTotals(inv);
    const cust = customers.find(c => c.id === inv.customer_id) || {};
    const profile = IF.currentProfile || {};
    const sym = profile.currency_symbol || '$';
    const items = inv.items || [];

    const itemsRows = items.length
      ? items.map(it => {
          const qty = Number(it.qty) || 0;
          const price = Number(it.price) || 0;
          const amount = qty * price;
          return `<tr class="border-b border-slate-100 dark:border-slate-800">
            <td class="py-3 pr-3">
              <div class="font-medium">${IFUtils.escapeHtml(it.name || '—')}</div>
              ${it.description ? `<div class="text-xs text-slate-500 mt-0.5">${IFUtils.escapeHtml(it.description)}</div>` : ''}
            </td>
            <td class="py-3 text-center text-slate-600 dark:text-slate-400">${qty}</td>
            <td class="py-3 text-right text-slate-600 dark:text-slate-400">${IFUtils.formatCurrency(price, sym)}</td>
            <td class="py-3 text-right font-medium">${IFUtils.formatCurrency(amount, sym)}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="4" class="py-8 text-center text-slate-400">No line items</td></tr>`;

    document.getElementById('view-invoice-detail').innerHTML = `
      <div class="max-w-3xl mx-auto">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div class="flex items-center gap-3">
            <button class="btn btn-ghost btn-sm" onclick="App.navigate('invoices')">← Back</button>
            <div>
              <h2 class="text-xl font-semibold flex flex-wrap items-center gap-2">
                ${IFUtils.escapeHtml(inv.number)}
                <span class="${IFUtils.statusClass(status)}">${IFUtils.statusLabel(status)}</span>
              </h2>
              <p class="text-xs text-slate-500 mt-0.5">Template: ${IFUtils.escapeHtml(inv.template || 'modern')}</p>
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-secondary btn-sm" onclick="App.editInvoice('${inv.id}')">Edit</button>
            <button class="btn btn-primary btn-sm" onclick="App.downloadPdf('${inv.id}')">⬇ Download PDF</button>
          </div>
        </div>

        <div class="card overflow-hidden">
          <!-- Header -->
          <div class="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-5 flex flex-wrap justify-between gap-4">
            <div>
              <div class="text-lg font-bold">${IFUtils.escapeHtml(profile.company_name || profile.full_name || 'InvoiceFlow')}</div>
              ${profile.email ? `<div class="text-sm text-blue-100 mt-1">${IFUtils.escapeHtml(profile.email)}</div>` : ''}
              ${profile.phone ? `<div class="text-sm text-blue-100">${IFUtils.escapeHtml(profile.phone)}</div>` : ''}
            </div>
            <div class="text-right">
              <div class="text-2xl font-bold tracking-wide">INVOICE</div>
              <div class="text-sm text-blue-100 mt-1">${IFUtils.escapeHtml(inv.number)}</div>
            </div>
          </div>

          <div class="p-6 space-y-6">
            <!-- Meta + parties -->
            <div class="grid sm:grid-cols-2 gap-6">
              <div>
                <div class="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Bill To</div>
                <div class="font-semibold text-base">${IFUtils.escapeHtml(cust.name || '—')}</div>
                ${cust.company ? `<div class="text-sm text-slate-600 dark:text-slate-400">${IFUtils.escapeHtml(cust.company)}</div>` : ''}
                ${cust.email ? `<div class="text-sm text-slate-500">${IFUtils.escapeHtml(cust.email)}</div>` : ''}
                ${cust.phone ? `<div class="text-sm text-slate-500">${IFUtils.escapeHtml(cust.phone)}</div>` : ''}
                ${cust.address ? `<div class="text-sm text-slate-500 mt-1 whitespace-pre-line">${IFUtils.escapeHtml(cust.address)}</div>` : ''}
              </div>
              <div class="sm:text-right space-y-1 text-sm">
                <div class="flex sm:justify-end gap-2"><span class="text-slate-500">Issue date</span><span class="font-medium">${IFUtils.formatDate(inv.issue_date)}</span></div>
                <div class="flex sm:justify-end gap-2"><span class="text-slate-500">Due date</span><span class="font-medium">${IFUtils.formatDate(inv.due_date)}</span></div>
                <div class="flex sm:justify-end gap-2 items-center"><span class="text-slate-500">Status</span><span class="${IFUtils.statusClass(status)}">${IFUtils.statusLabel(status)}</span></div>
              </div>
            </div>

            <!-- Line items table -->
            <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-slate-50 dark:bg-slate-900/60 text-slate-500 text-xs uppercase tracking-wide">
                    <th class="text-left py-3 px-4 font-semibold">Item</th>
                    <th class="text-center py-3 px-3 font-semibold w-20">Qty</th>
                    <th class="text-right py-3 px-3 font-semibold w-28">Price</th>
                    <th class="text-right py-3 px-4 font-semibold w-28">Amount</th>
                  </tr>
                </thead>
                <tbody class="px-4">
                  ${itemsRows.replace(/class="py-3/g, 'class="py-3 px-4')}
                </tbody>
              </table>
            </div>

            <!-- Totals -->
            <div class="flex justify-end">
              <div class="w-full max-w-xs space-y-2 text-sm">
                <div class="flex justify-between text-slate-600 dark:text-slate-400">
                  <span>Subtotal</span>
                  <span>${IFUtils.formatCurrency(totals.subtotal, sym)}</span>
                </div>
                ${(Number(inv.discount) || 0) > 0 ? `<div class="flex justify-between text-slate-600 dark:text-slate-400"><span>Discount</span><span>− ${IFUtils.formatCurrency(totals.discount || inv.discount, sym)}</span></div>` : ''}
                ${(Number(inv.tax_rate) || 0) > 0 ? `<div class="flex justify-between text-slate-600 dark:text-slate-400"><span>Tax (${inv.tax_rate}%)</span><span>${IFUtils.formatCurrency(totals.tax, sym)}</span></div>` : ''}
                ${(Number(inv.shipping) || 0) > 0 ? `<div class="flex justify-between text-slate-600 dark:text-slate-400"><span>Shipping</span><span>${IFUtils.formatCurrency(totals.shipping || inv.shipping, sym)}</span></div>` : ''}
                <div class="flex justify-between text-base font-bold pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span>Total</span>
                  <span class="text-blue-600">${IFUtils.formatCurrency(totals.total, sym)}</span>
                </div>
                <div class="flex justify-between font-medium ${totals.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}">
                  <span>Balance due</span>
                  <span>${IFUtils.formatCurrency(totals.balance, sym)}</span>
                </div>
              </div>
            </div>

            ${inv.notes ? `<div class="pt-2 border-t border-slate-100 dark:border-slate-800"><div class="text-xs font-semibold uppercase text-slate-400 mb-1">Notes</div><p class="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line">${IFUtils.escapeHtml(inv.notes)}</p></div>` : ''}
            ${inv.terms ? `<div><div class="text-xs font-semibold uppercase text-slate-400 mb-1">Terms</div><p class="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-line">${IFUtils.escapeHtml(inv.terms)}</p></div>` : ''}
          </div>
        </div>
      </div>`;
  }

  async function downloadPdf(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    const customer = customers.find(c => c.id === inv.customer_id) || {};
    const settings = {
      companyName: IF.currentProfile?.company_name || IF.currentProfile?.full_name || 'Company',
      address: IF.currentProfile?.address || '',
      email: IF.currentProfile?.email || '',
      phone: IF.currentProfile?.phone || '',
      brandColor: IF.currentProfile?.brand_color || '#2563eb',
      currencySymbol: IF.currentProfile?.currency_symbol || '$',
      template: inv.template || IF.currentProfile?.default_template || 'modern',
      logo: IF.currentProfile?.logo_url || ''
    };
    const adapted = {
      ...inv,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      taxRate: inv.tax_rate,
      discountType: inv.discount_type,
      status: inv.status
    };
    IFUtils.toast('Generating PDF…');
    try {
      await IFPdf.generate(adapted, customer, settings, { template: settings.template });
    } catch (e) {
      console.error(e);
      IFUtils.toast(e.message || 'PDF failed', 'error');
    }
  }

  // ─── Theme & sidebar ───────────────────────────────────────────────────
  function initTheme() {
    if (localStorage.getItem('if_theme') === 'dark') document.documentElement.classList.add('dark');
    document.getElementById('themeToggle').onclick = () => {
      document.documentElement.classList.toggle('dark');
      localStorage.setItem('if_theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    };
  }
  function initSidebar() {
    document.getElementById('menuBtn').onclick = () => {
      document.getElementById('sidebar').classList.remove('-translate-x-full');
      document.getElementById('sidebarOverlay').classList.remove('hidden');
    };
    document.getElementById('sidebarOverlay').onclick = () => {
      document.getElementById('sidebar').classList.add('-translate-x-full');
      document.getElementById('sidebarOverlay').classList.add('hidden');
    };
  }

  // Expose
  window.App = {
    navigate, createInvoice, editInvoice, viewInvoice, saveInvoice,
    openCustomerModal, deleteCustomer, openProductModal, deleteProduct,
    downloadPdf, checkout, showLegal, filterInvoices: () => {},
    renderLineItems, updateLineItem, addLineItem, removeLineItem, updateBuilderTotals,
    showSignup, showLanding
  };

  // Start
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
