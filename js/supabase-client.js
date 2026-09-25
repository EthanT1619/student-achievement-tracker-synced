/**
 * Single SAT Supabase client. Classic script — SDK is loaded as UMD from CDN.
 */
(function (SAT) {
  SAT.authRedirectTo = function authRedirectTo() {
    if (typeof window === 'undefined' || !window.location) return undefined;
    const loc = window.location;
    const origin = String(loc.origin || '').replace(/\/$/, '');
    const path = loc.pathname || '/';
    if (origin) return origin + path;
    const url = new URL(loc.href);
    url.search = '';
    url.hash = '';
    return url.toString();
  };

  SAT.isSupabaseConfigured = function isSupabaseConfigured() {
    const url = String(SAT.SUPABASE_URL || '');
    const key = String(SAT.SUPABASE_PUBLISHABLE_KEY || '');
    if (!url || url.includes('__SUPABASE')) return false;
    if (!key || key.includes('__SUPABASE')) return false;
    if (key.includes('service_role')) return false;
    return true;
  };

  SAT.getSupabaseClient = function getSupabaseClient() {
    if (SAT._supabaseClient) return SAT._supabaseClient;
    if (!SAT.isSupabaseConfigured()) {
      throw new Error('Supabase URL/publishable key is missing. Never use service_role.');
    }
    const lib = typeof window !== 'undefined' ? window.supabase : null;
    if (!lib || typeof lib.createClient !== 'function') {
      throw new Error('Supabase JS SDK failed to load.');
    }
    SAT._supabaseClient = lib.createClient(SAT.SUPABASE_URL, SAT.SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
      },
    });
    return SAT._supabaseClient;
  };
})(window.SAT = window.SAT || {});
