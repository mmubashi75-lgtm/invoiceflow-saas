/**
 * InvoiceFlow SaaS — Configuration
 */

function env(key, fallback) {
  fallback = fallback || '';
  try {
    if (typeof window !== 'undefined' && window.__ENV__ && window.__ENV__[key]) {
      return window.__ENV__[key];
    }
  } catch (_) {}
  return fallback;
}

const CONFIG = {
  SUPABASE_URL: 'https://ijkenjbnddcphojwsmhz.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlqa2VuamJuZGRjcGhvandzbWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0NjI4NjEsImV4cCI6MjEwNzAzODg2MX0.ABeWwkp-u-Y2Fl_xz0IbmQ0Al4kbX10Sxmjyu9vIGwQ',

  PADDLE_CLIENT_TOKEN: env('VITE_PADDLE_CLIENT_TOKEN', 'live_e9bb7ce58e3ef32a6dca1daee0c'),
  PADDLE_ENVIRONMENT: env('VITE_PADDLE_ENVIRONMENT', 'production'),

  PADDLE_PRICE_STARTER: env('VITE_PADDLE_PRICE_STARTER', 'pri_01m4st76n4ysbw3g0gk413pen4'),
  PADDLE_PRICE_PRO: env('VITE_PADDLE_PRICE_PRO', 'pri_01m4st9345f1msam36b1eb5j0f'),
  PADDLE_PRICE_BUSINESS: env('VITE_PADDLE_PRICE_BUSINESS', 'pri_01m4sta23h3v7c1jmmsbm60r2h'),

  APP_NAME: env('VITE_APP_NAME', 'InvoiceFlow'),
  TRIAL_DAYS: 7,
  SUPPORT_EMAIL: env('VITE_SUPPORT_EMAIL', 'mmubashi75@gmail.com')
};

window.CONFIG = CONFIG;
/**
 * Plan limits — enforced in the app
 * -1 = unlimited
 */
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    priceLabel: '$0',
    invoicesPerMonth: 10,
    customers: 20,
    products: 20,
    users: 1,
    businesses: 1,
    templates: 1,
    features: {
      pdf: true, branding: true, customLogo: false, paymentTracking: false,
      recurring: false, paymentReminders: false, reports: false, whatsapp: false,
      customBranding: false, multipleBusinesses: false, api: false,
      advancedReports: false, accountantAccess: false, documentsGb: 0
    }
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 5,
    priceLabel: '$5/mo',
    invoicesPerMonth: 100,
    customers: 500,
    products: 500,
    users: 2,
    businesses: 1,
    templates: 3,
    features: {
      pdf: true, branding: true, customLogo: true, paymentTracking: true,
      recurring: true, paymentReminders: false, reports: false, whatsapp: false,
      customBranding: false, multipleBusinesses: false, api: false,
      advancedReports: false, accountantAccess: false, documentsGb: 0
    }
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 15,
    priceLabel: '$15/mo',
    invoicesPerMonth: -1,
    customers: 5000,
    products: 5000,
    users: 10,
    businesses: 1,
    templates: -1,
    features: {
      pdf: true, branding: true, customLogo: true, paymentTracking: true,
      recurring: true, paymentReminders: true, reports: true, whatsapp: true,
      customBranding: true, multipleBusinesses: false, api: false,
      advancedReports: false, accountantAccess: false, documentsGb: 0
    }
  },
  business: {
    id: 'business',
    name: 'Business',
    price: 29,
    priceLabel: '$29/mo',
    invoicesPerMonth: -1,
    customers: 50000,
    products: -1,
    users: 25,
    businesses: -1,
    templates: -1,
    features: {
      pdf: true, branding: true, customLogo: true, paymentTracking: true,
      recurring: true, paymentReminders: true, reports: true, whatsapp: true,
      customBranding: true, multipleBusinesses: true, api: true,
      advancedReports: true, accountantAccess: true, documentsGb: 100
    }
  }
};

window.CONFIG = CONFIG;
window.PLANS = PLANS;
