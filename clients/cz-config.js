// ============================================================
// OmniGrowth Client Zone — configuration
// Safe to expose publicly: the publishable key only ever grants
// what Row Level Security allows for the signed-in user.
// ============================================================

export const SUPABASE_URL = 'https://csgjyvjanugjgyceervf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ABWpbuBnsL6bSSQ-vzSQVQ_JYqYA76q';

// Shown in the header and on the login screen
export const BRAND = {
  name: 'OmniGrowth',
  suffix: 'Client Zone',
  logo: '/logo.png',
  supportEmail: 'gareth@omnigrowthpartner.com',
  site: 'https://omnigrowthpartner.com',
};

export const CURRENCY_DEFAULT = 'ZAR';
