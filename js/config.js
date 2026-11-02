/**
 * InvoiceFlow — Configuration (classic script — NO import.meta)
 *
 * Load order:
 * 1) window.__ENV__
 * 2) localStorage "invoiceflow_config" (JSON)
 * 3) defaults below
 * 4) js/config.local.js overrides CONFIG after this file loads
 *
 * Put real keys in js/config.local.js (copy from config.local.example.js).
 * .env.local only works with `npm run dev` if you use a Vite plugin — for
 * plain open / static host, use config.local.js.
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

  var CONFIG = {
    SUPABASE_URL: env('VITE_SUPABASE_URL', 'https://YOUR_PROJECT_REF.supabase.co'),
    SUPABASE_ANON_KEY: env('VITE_SUPABASE_ANON_KEY', 'YOUR_SUPABASE_ANON_KEY'),

    PADDLE_CLIENT_TOKEN: env('VITE_PADDLE_CLIENT_TOKEN', 'YOUR_PADDLE_CLIENT_TOKEN'),
    PADDLE_ENVIRONMENT: env('VITE_PADDLE_ENVIRONMENT', 'sandbox'),

    PADDLE_PRICE_STARTER: env('VITE_PADDLE_PRICE_STARTER', 'pri_starter_xxxxx'),
    PADDLE_PRICE_PRO: env('VITE_PADDLE_PRICE_PRO', 'pri_pro_xxxxx'),
    PADDLE_PRICE_BUSINESS: env('VITE_PADDLE_PRICE_BUSINESS', 'pri_business_xxxxx'),

    APP_NAME: env('VITE_APP_NAME', 'InvoiceFlow'),
    TRIAL_DAYS: 14,
    SUPPORT_EMAIL: env('VITE_SUPPORT_EMAIL', 'support@yourdomain.com'),
    RESEND_API_KEY: env('VITE_RESEND_API_KEY', ''),
    RESEND_FROM: env('VITE_RESEND_FROM', 'InvoiceFlow <onboarding@resend.dev>')
  };

  function isSupabaseConfigured() {
    var url = (CONFIG.SUPABASE_URL || '').trim();
    var key = (CONFIG.SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return false;
    if (url.indexOf('YOUR_PROJECT') !== -1) return false;
    if (key.indexOf('YOUR_SUPABASE') !== -1) return false;
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
})();
