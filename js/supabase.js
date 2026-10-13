/**
 * InvoiceFlow — Supabase client + data layer
 */

let sb = null;
let currentUser = null;
let currentProfile = null;

function initSupabase() {
  // Guard: CDN may fail or be blocked — never throw at top level
  const createClient =
    (typeof supabase !== 'undefined' && supabase.createClient) ||
    (typeof window !== 'undefined' && window.supabase && window.supabase.createClient);

  if (!createClient) {
    console.error('Supabase SDK not loaded. Check CDN script or network.');
    return null;
  }

  if (!CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR_PROJECT') ||
      !CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')) {
    console.warn('Supabase not configured. Demo mode — buttons still work; auth shows an error.');
    return null;
  }

  try {
    sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  } catch (e) {
    console.error('Supabase init failed', e);
    return null;
  }
  return sb;
}

async function getSession() {
  if (!sb) return null;
  const { data: { session } } = await sb.auth.getSession();
  return session;
}

async function signUp(email, password, fullName) {
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
}

async function loadProfile() {
  if (!sb || !currentUser) return null;
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  if (error) throw error;
  currentProfile = data;
  // Downgrade expired trial / canceled / past_due subscriptions to Free
  await enforceSubscriptionStatus();
  return currentProfile;
}

/**
 * If trial ended or subscription is no longer active, force Free plan in DB + memory.
 * User stays Free until they subscribe again via Paddle.
 */
async function enforceSubscriptionStatus() {
  if (!currentProfile || !currentUser) return;

  const now = new Date();
  const status = (currentProfile.subscription_status || 'free').toLowerCase();
  const plan = (currentProfile.subscription_plan || 'free').toLowerCase();
  const trialEnds = currentProfile.trial_ends_at ? new Date(currentProfile.trial_ends_at) : null;
  const periodEnd = currentProfile.subscription_ends_at
    ? new Date(currentProfile.subscription_ends_at)
    : null;

  let shouldDowngrade = false;
  let reason = '';

  // Active paid plan but period ended
  if (status === 'active' && periodEnd && periodEnd < now) {
    shouldDowngrade = true;
    reason = 'subscription_period_ended';
  }
  // Explicitly canceled / past_due / paused / expired
  if (['canceled', 'cancelled', 'past_due', 'paused', 'expired'].includes(status)) {
    // Allow access until period end if set and still in future
    if (!periodEnd || periodEnd < now) {
      shouldDowngrade = true;
      reason = status;
    }
  }
  // Trialing but trial date passed
  if ((status === 'trialing' || status === 'trial') && trialEnds && trialEnds < now) {
    shouldDowngrade = true;
    reason = 'trial_ended';
  }
  // Marked as a paid plan but status is free/null and trial gone
  if (['starter', 'pro', 'business'].includes(plan) && status === 'free') {
    shouldDowngrade = true;
    reason = 'plan_without_active_status';
  }
  // Status says active but plan is free/empty → treat as free (no paid entitlement)
  if (status === 'active' && (!plan || plan === 'free')) {
    shouldDowngrade = true;
    reason = 'active_without_plan';
  }

  if (!shouldDowngrade) return;

  // Already free — just normalize local state
  if (plan === 'free' && (status === 'free' || status === 'canceled' || status === 'expired' || status === 'trialing' && trialEnds && trialEnds < now)) {
    currentProfile.subscription_status = 'free';
    currentProfile.subscription_plan = 'free';
    return;
  }

  try {
    const { data, error } = await sb
      .from('profiles')
      .update({
        subscription_status: 'free',
        subscription_plan: 'free',
        updated_at: new Date().toISOString()
      })
      .eq('id', currentUser.id)
      .select()
      .single();
    if (!error && data) {
      currentProfile = data;
      console.info('[InvoiceFlow] Subscription expired → downgraded to Free (' + reason + ')');
    } else {
      // Still apply in memory so limits work even if update fails
      currentProfile.subscription_status = 'free';
      currentProfile.subscription_plan = 'free';
    }
  } catch (e) {
    currentProfile.subscription_status = 'free';
    currentProfile.subscription_plan = 'free';
    console.warn('[InvoiceFlow] Could not persist Free downgrade', e);
  }
}

async function updateProfile(updates) {
  const { data, error } = await sb
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', currentUser.id)
    .select()
    .single();
  if (error) throw error;
  currentProfile = data;
  return data;
}

// ─── Customers ────────────────────────────────────────────────────────────
async function getCustomers() {
  const { data, error } = await sb.from('customers').select('*').order('name');
  if (error) throw error;
  return data || [];
}

async function createCustomer(payload) {
  const { data, error } = await sb.from('customers').insert({
    ...payload,
    user_id: currentUser.id
  }).select().single();
  if (error) throw error;
  return data;
}

async function updateCustomer(id, payload) {
  const { data, error } = await sb.from('customers').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteCustomer(id) {
  const { error } = await sb.from('customers').delete().eq('id', id);
  if (error) throw error;
}

// ─── Products ─────────────────────────────────────────────────────────────
async function getProducts() {
  const { data, error } = await sb.from('products').select('*').order('name');
  if (error) throw error;
  return data || [];
}

async function createProduct(payload) {
  const { data, error } = await sb.from('products').insert({
    ...payload,
    user_id: currentUser.id
  }).select().single();
  if (error) throw error;
  return data;
}

async function updateProduct(id, payload) {
  const { data, error } = await sb.from('products').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function deleteProduct(id) {
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) throw error;
}

// ─── Invoices ─────────────────────────────────────────────────────────────
async function getInvoices() {
  const { data, error } = await sb
    .from('invoices')
    .select('*, payments(*)')
    .order('issue_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getInvoice(id) {
  const { data, error } = await sb
    .from('invoices')
    .select('*, payments(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function createInvoice(payload) {
  const { data, error } = await sb.from('invoices').insert({
    ...payload,
    user_id: currentUser.id
  }).select().single();
  if (error) throw error;

  // Increment next number
  if (currentProfile) {
    await updateProfile({ next_invoice_number: (currentProfile.next_invoice_number || 1001) + 1 });
  }
  return data;
}

async function updateInvoice(id, payload) {
  const { data, error } = await sb
    .from('invoices')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteInvoice(id) {
  const { error } = await sb.from('invoices').delete().eq('id', id);
  if (error) throw error;
}

// ─── Payments ─────────────────────────────────────────────────────────────
async function createPayment(payload) {
  const { data, error } = await sb.from('payments').insert({
    ...payload,
    user_id: currentUser.id
  }).select().single();
  if (error) throw error;
  return data;
}

async function getPayments() {
  const { data, error } = await sb
    .from('payments')
    .select('*, invoices(number, customer_id)')
    .order('payment_date', { ascending: false });
  if (error) throw error;
  return data || [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function calcTotals(invoice) {
  const items = invoice.items || [];
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) * Number(i.price)), 0);
  let discountAmount = 0;
  if (invoice.discount_type === 'percent') {
    discountAmount = subtotal * (Number(invoice.discount || 0) / 100);
  } else {
    discountAmount = Number(invoice.discount || 0);
  }
  const after = Math.max(0, subtotal - discountAmount);
  const taxAmount = after * (Number(invoice.tax_rate || 0) / 100);
  const shipping = Number(invoice.shipping || 0);
  const total = after + taxAmount + shipping;
  const paid = (invoice.payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(0, total - paid);
  return { subtotal, discountAmount, taxAmount, shipping, total, paid, balance };
}

function deriveStatus(invoice) {
  if (['cancelled', 'draft'].includes(invoice.status)) return invoice.status;
  const { total, paid, balance } = calcTotals(invoice);
  if (paid >= total && total > 0) return 'paid';
  if (paid > 0 && balance > 0) return 'partially_paid';
  const today = new Date().toISOString().slice(0, 10);
  if (invoice.due_date < today && balance > 0) return 'overdue';
  return invoice.status || 'sent';
}

function isSubscribed() {
  if (!currentProfile) return false;
  const status = (currentProfile.subscription_status || '').toLowerCase();
  const plan = (currentProfile.subscription_plan || 'free').toLowerCase();
  const now = new Date();

  // Active paid plan with optional period end still in future
  if (status === 'active' && plan && plan !== 'free') {
    if (currentProfile.subscription_ends_at) {
      return new Date(currentProfile.subscription_ends_at) > now;
    }
    return true;
  }

  // Valid trial
  if ((status === 'trialing' || status === 'trial') && currentProfile.trial_ends_at) {
    return new Date(currentProfile.trial_ends_at) > now;
  }

  return false;
}

/** Effective plan id after expiry rules (always free if not entitled) */
function getEffectivePlanId() {
  if (!currentProfile) return 'free';
  if (!isSubscribed()) return 'free';
  const status = (currentProfile.subscription_status || '').toLowerCase();
  const plan = (currentProfile.subscription_plan || 'free').toLowerCase();
  if (status === 'active' && ['starter', 'pro', 'business'].includes(plan)) return plan;
  if (status === 'trialing' || status === 'trial') return 'pro'; // trial = Pro limits
  return 'free';
}

function canCreateInvoice() {
  // Free plan limit example: 5 invoices total while on free/expired
  // You can make this stricter later
  return true; // for now allow, enforce in UI with upgrade modal
}

window.IF = {
  initSupabase,
  getSession,
  signUp,
  signIn,
  signOut,
  loadProfile,
  updateProfile,
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  createPayment,
  getPayments,
  calcTotals,
  deriveStatus,
  isSubscribed,
  getEffectivePlanId,
  enforceSubscriptionStatus,
  get currentUser() { return currentUser; },
  set currentUser(u) { currentUser = u; },
  get currentProfile() { return currentProfile; },
  set currentProfile(p) { currentProfile = p; },
  get client() { return sb; }
};
