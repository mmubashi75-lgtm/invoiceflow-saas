/**
 * InvoiceFlow — Configuration (classic script — NO import.meta)
 * Put real keys here OR in js/config.local.js (loaded after this file).
 */
(function () {
  'use strict';

  function env(key, fallback) {
    fallback = fallback === undefined ? '' : fallback;
    try {
      if (window.__ENV__ && window.__ENV__[key] != null && String(window.__ENV__[key]) !== '') {
        return String(window.__ENV__[key]);
      }
    } catch (_) {}
    try {
      var raw = localStorage.getItem('invoiceflow_config');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed[key] != null && String(parsed[key]) !== '') {
          return String(parsed[key]);
        }
      }
    } catch (_) {}
    return fallback;
  }

  function looksLikePlaceholder(val) {
    if (!val) return true;
    var s = String(val);
    return s.indexOf('YOUR_') !== -1 || s.indexOf('xxxxx') !== -1 || s.indexOf('pri_starter') !== -1;
  }

  var CONFIG = {
    SUPABASE_URL: env('VITE_SUPABASE_URL', 'https://ijkenjbnddcphojwsmhz.supabase.co'),
    SUPABASE_ANON_KEY: env('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqa2VuamJuZGRjcGhvandzbWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NjI4NjEsImV4cCI6MjEwNzAzODg2MX0.ABeWwkp-u-Y2Fl_xz0IbmQ0Al4kbX10Sxmjyu9vIGwQ'),

    PADDLE_CLIENT_TOKEN: env('VITE_PADDLE_CLIENT_TOKEN', 'live_e9bb7ce58e3ef32a6dca1daee0c'),
    PADDLE_ENVIRONMENT: env('VITE_PADDLE_ENVIRONMENT', 'production'),

    PADDLE_PRICE_STARTER: env('VITE_PADDLE_PRICE_STARTER', 'pri_01m4st76n4ysbw3g0gk413pen4'),
    PADDLE_PRICE_PRO: env('VITE_PADDLE_PRICE_PRO', 'pri_01m4st9345f1msam36b1eb5j0f'),
    PADDLE_PRICE_BUSINESS: env('VITE_PADDLE_PRICE_BUSINESS', 'pri_01m4sta23h3v7c1jmmsbm60r2h'),

    APP_NAME: env('VITE_APP_NAME', 'InvoiceFlow'),
    TRIAL_DAYS: 14,
    SUPPORT_EMAIL: env('VITE_SUPPORT_EMAIL', 'mmubashi75@gmail.com'),
    RESEND_API_KEY: env('VITE_RESEND_API_KEY', ''),
    RESEND_FROM: env('VITE_RESEND_FROM', 'InvoiceFlow <onboarding@resend.dev>')
  };

  /** Safe merge: never let placeholders overwrite real keys */
  function mergeConfig(overrides) {
    if (!overrides) return;
    Object.keys(overrides).forEach(function (k) {
      var v = overrides[k];
      if (v == null || v === '') return;
      if (looksLikePlaceholder(v) && !looksLikePlaceholder(CONFIG[k])) return;
      CONFIG[k] = v;
    });
  }

  function isSupabaseConfigured() {
    var url = (CONFIG.SUPABASE_URL || '').trim();
    var key = (CONFIG.SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return false;
    if (looksLikePlaceholder(url) || looksLikePlaceholder(key)) return false;
    if (url.indexOf('supabase.co') === -1 && url.indexOf('localhost') === -1) return false;
    if (key.length < 20) return false;
    return true;
  }

  var PLANS = {
    free: {
      id: 'free', name: 'Free', price: 0, priceLabel: '$0',
      invoicesPerMonth: 10, customers: 20, products: 20, users: 1, businesses: 1, templates: 1,
      features: { pdf: true, branding: true, customLogo: false, paymentTracking: false, recurring: false, paymentReminders: false, reports: false, whatsapp: false, customBranding: false, multipleBusinesses: false, api: false, advancedReports: false, accountantAccess: false, documentsGb: 0 }
    },
    starter: {
      id: 'starter', name: 'Starter', price: 5, priceLabel: '$5/mo',
      invoicesPerMonth: 100, customers: 500, products: 500, users: 2, businesses: 1, templates: 3,
      features: { pdf: true, branding: true, customLogo: true, paymentTracking: true, recurring: true, paymentReminders: false, reports: false, whatsapp: false, customBranding: false, multipleBusinesses: false, api: false, advancedReports: false, accountantAccess: false, documentsGb: 0 }
    },
    pro: {
      id: 'pro', name: 'Pro', price: 12, priceLabel: '$12/mo',
      invoicesPerMonth: -1, customers: 5000, products: 5000, users: 10, businesses: 1, templates: -1,
      features: { pdf: true, branding: true, customLogo: true, paymentTracking: true, recurring: true, paymentReminders: true, reports: true, whatsapp: true, customBranding: true, multipleBusinesses: false, api: false, advancedReports: false, accountantAccess: false, documentsGb: 0 }
    },
    business: {
      id: 'business', name: 'Business', price: 25, priceLabel: '$25/mo',
      invoicesPerMonth: -1, customers: 50000, products: -1, users: 25, businesses: -1, templates: -1,
      features: { pdf: true, branding: true, customLogo: true, paymentTracking: true, recurring: true, paymentReminders: true, reports: true, whatsapp: true, customBranding: true, multipleBusinesses: true, api: true, advancedReports: true, accountantAccess: true, documentsGb: 100 }
    }
  };

  window.CONFIG = CONFIG;
  window.PLANS = PLANS;
  window.isSupabaseConfigured = isSupabaseConfigured;
  window.mergeConfig = mergeConfig;

  // Debug helper in console
  window.__debugInvoiceFlowConfig = function () {
    console.log({
      url: CONFIG.SUPABASE_URL,
      keyLen: (CONFIG.SUPABASE_ANON_KEY || '').length,
      keyPrefix: (CONFIG.SUPABASE_ANON_KEY || '').slice(0, 12),
      configured: isSupabaseConfigured()
    });
  };
})();
