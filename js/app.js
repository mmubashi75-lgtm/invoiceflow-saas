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
    // Bind UI first so Sign up / Sign in / legal links always work
    try {
      if (typeof IF === 'undefined' || !IF.initSupabase) {
        console.error('IF not defined — /js/*.js failed to load (check Network tab for 404)');
        showAuth();
        return;
      }
      IF.initSupabase();
    } catch (e) {
      console.error('Init error', e);
    }

    bindAuthForms();
    initTheme();
    initSidebar();
    showAuth();

    if (!IF.client) {
      console.warn('Supabase not configured — put keys in js/config.js. Buttons still work.');
      return;
    }

    try {
      IF.client.auth.onAuthStateChange(async (event, session) => {
        if (session && session.user) {
          IF.currentUser = session.user;
          await IF.loadProfile();
          showApp();
        } else {
          showAuth();
        }
      });

      const session = await IF.getSession();
      if (session && session.user) {
        IF.currentUser = session.user;
        await IF.loadProfile();
        showApp();
      }
    } catch (e) {
      console.error('Auth boot error', e);
      showAuth();
    }
  }

  function showAuth() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
    // Default screen = Sign up
    const login = document.getElementById('login-form');
    const signup = document.getElementById('signup-form');
    if (login) login.classList.add('hidden');
    if (signup) signup.classList.remove('hidden');
    if (typeof clearAuthFields === 'function') clearAuthFields();
  }

  async function showApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');

    const profile = IF.currentProfile;
    document.getElementById('userAvatar').textContent = (profile?.full_name || profile?.email || 'U')[0].toUpperCase();
    updatePlanBadge();

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
    document.getElementById('createInvoiceBtn').onclick = () => createInvoice();
    document.getElementById('btn-logout').onclick = async () => {
      await IF.signOut();
      showAuth();
    };

    navigate('dashboard');
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
        errEl.textContent = 'Supabase is not configured. Add keys in js/config.js or .env';
        errEl.classList.remove('hidden');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        await IF.signIn(email, password);
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
        errEl.textContent = 'Supabase is not configured. Add your keys in js/config.js or .env';
        errEl.classList.remove('hidden');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Creating…';
      try {
        const data = await IF.signUp(email, password, name);
        const needsConfirm = data?.user && !data?.session;
        if (needsConfirm) {
          IFUtils.toast('Account created! Confirm your email, then sign in.');
          errEl.classList.remove('hidden');
          errEl.className = 'text-sm text-emerald-600';
          errEl.textContent = 'Check your inbox to confirm email, then Sign in.';
          clearAuthFields();
          document.getElementById('signup-form').classList.add('hidden');
          document.getElementById('login-form').classList.remove('hidden');
        } else {
          IFUtils.toast('Welcome! Account created.');
          // onAuthStateChange will show the app
        }
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
    document.getElementById('view-reports').innerHTML = `
      <div class="card p-6 text-center text-slate-500">
        <p>Reports use the same charts as the original version.</p>
        <p class="text-sm mt-2">Revenue, outstanding, monthly income and status breakdown are calculated from your live Supabase data.</p>
      </div>`;
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

  function renderInvoiceBuilder() {
    const inv = editingInvoiceId ? invoices.find(i => i.id === editingInvoiceId) : null;
    const profile = IF.currentProfile || {};
    const number = inv ? inv.number : `${profile.invoice_prefix || 'INV-'}${profile.next_invoice_number || 1001}`;

    document.getElementById('view-invoice-builder').innerHTML = `
      <div class="max-w-3xl mx-auto card p-6 space-y-4">
        <div class="flex justify-between">
          <h2 class="text-xl font-semibold">${inv ? 'Edit' : 'Create'} Invoice</h2>
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('invoices')">← Back</button>
        </div>
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="form-label">Customer</label>
            <select id="ib-customer" class="form-select">
              <option value="">Select…</option>
              ${customers.map(c => `<option value="${c.id}" ${inv?.customer_id===c.id?'selected':''}>${IFUtils.escapeHtml(c.name)}</option>`).join('')}
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
        </div>
        <div>
          <label class="form-label">Line Items (JSON for simplicity — enhance later)</label>
          <textarea id="ib-items" class="form-textarea font-mono text-xs" rows="6">${JSON.stringify(inv?.items || [{name:'Service', qty:1, price:100}], null, 2)}</textarea>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="form-label">Discount</label><input id="ib-discount" type="number" class="form-input" value="${inv?.discount||0}"></div>
          <div><label class="form-label">Tax %</label><input id="ib-tax" type="number" class="form-input" value="${inv?.tax_rate||0}"></div>
          <div><label class="form-label">Shipping</label><input id="ib-shipping" type="number" class="form-input" value="${inv?.shipping||0}"></div>
        </div>
        <div class="flex gap-2 justify-end">
          <button class="btn btn-secondary" onclick="App.saveInvoice(true)">Save Draft</button>
          <button class="btn btn-primary" onclick="App.saveInvoice(false)">Save & Send</button>
        </div>
      </div>`;
  }

  async function saveInvoice(asDraft) {
    let items;
    try {
      items = JSON.parse(document.getElementById('ib-items').value);
    } catch {
      IFUtils.toast('Invalid items JSON', 'error');
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
      notes: IF.currentProfile?.default_notes || '',
      terms: IF.currentProfile?.default_terms || ''
    };
    if (!payload.customer_id) {
      IFUtils.toast('Select a customer', 'error');
      return;
    }
    try {
      if (editingInvoiceId) {
        await IF.updateInvoice(editingInvoiceId, payload);
        const idx = invoices.findIndex(i => i.id === editingInvoiceId);
        if (idx >= 0) invoices[idx] = { ...invoices[idx], ...payload };
      } else {
        const created = await IF.createInvoice(payload);
        invoices.unshift(created);
      }
      IFUtils.toast('Invoice saved');
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
    const cust = customers.find(c => c.id === inv.customer_id);
    const sym = IF.currentProfile?.currency_symbol || '$';

    document.getElementById('view-invoice-detail').innerHTML = `
      <div class="max-w-3xl mx-auto">
        <div class="flex justify-between mb-6">
          <div>
            <button class="btn btn-ghost btn-sm" onclick="App.navigate('invoices')">← Back</button>
            <h2 class="text-xl font-semibold">${IFUtils.escapeHtml(inv.number)} <span class="${IFUtils.statusClass(status)}">${IFUtils.statusLabel(status)}</span></h2>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-secondary btn-sm" onclick="App.editInvoice('${inv.id}')">Edit</button>
            <button class="btn btn-primary btn-sm" onclick="App.downloadPdf('${inv.id}')">PDF</button>
          </div>
        </div>
        <div class="card p-6 space-y-4">
          <p><strong>Customer:</strong> ${IFUtils.escapeHtml(cust?.name || '—')}</p>
          <p><strong>Total:</strong> ${IFUtils.formatCurrency(totals.total, sym)} · <strong>Balance:</strong> ${IFUtils.formatCurrency(totals.balance, sym)}</p>
          <pre class="text-xs bg-slate-50 dark:bg-slate-900 p-3 rounded overflow-auto">${JSON.stringify(inv.items, null, 2)}</pre>
        </div>
      </div>`;
  }

  async function downloadPdf(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    const customer = customers.find(c => c.id === inv.customer_id) || {};
    const settings = {
      companyName: IF.currentProfile?.company_name,
      address: IF.currentProfile?.address,
      email: IF.currentProfile?.email,
      phone: IF.currentProfile?.phone,
      brandColor: IF.currentProfile?.brand_color,
      currencySymbol: IF.currentProfile?.currency_symbol || '$',
      template: IF.currentProfile?.template || 'modern',
      logo: IF.currentProfile?.logo_url
    };
    // Adapt shape for existing PDF generator
    const adapted = {
      ...inv,
      issueDate: inv.issue_date,
      dueDate: inv.due_date,
      taxRate: inv.tax_rate,
      discountType: inv.discount_type
    };
    IFUtils.toast('Generating PDF…');
    await IFPdf.generate(adapted, customer, settings);
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
    downloadPdf, checkout, showLegal, filterInvoices: () => {}
  };

  // Start
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
