// ============================================================================
// supabase-client.js — تهيئة الاتصال بـ Supabase Auth.
// يعتمد على مكتبة @supabase/supabase-js (إصدار مثبَّت في index.html)، وعلى
// القيم الموجودة في js/platform/config.js.
//
// إن كانت الحسابات معطّلة، أو config.js بقيم قالبية، أو تعذّر تحميل المكتبة
// (لا إنترنت)، تبقى window.PLATFORM_DB = null وتعمل المنصة كما هي بلا حسابات،
// دون أي خطأ يوقف الصفحة.
// ============================================================================
(function () {
  window.PLATFORM_DB = null;

  // روابط البريد (تفعيل/استعادة) تعود إلى الموقع ومعها معاملات في الرابط. نلتقطها
  // هنا قبل أن تقرأها المكتبة وتحذفها، لنعرض للطالب نتيجة واضحة (نجح/انتهى/غير صالح).
  function readParams(str) {
    const out = {};
    new URLSearchParams(str).forEach((v, k) => { out[k] = v; });
    return out;
  }
  const hash = readParams(location.hash.replace(/^#/, ""));
  const query = readParams(location.search.replace(/^\?/, ""));
  const ctx = {
    type: hash.type || query.type || null, // signup | recovery | email | magiclink
    hasTokens: !!(hash.access_token || query.token_hash || query.code),
    tokenHash: query.token_hash || null,
    errorCode: hash.error_code || query.error_code || null,
    hasError: !!(hash.error || query.error || hash.error_code || query.error_code),
  };
  window.PLATFORM_AUTH_URL_CONTEXT = (ctx.hasTokens || ctx.hasError) ? ctx : null;

  const cfg = window.PLATFORM_CONFIG;
  if (!cfg || cfg.ENABLE_ACCOUNTS !== true) return;
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT-REF") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.startsWith("YOUR-")) {
    console.info("[platform] الحسابات غير مُعدّة بعد (config.js بقيم قالبية) — المنصة تعمل بلا حسابات.");
    return;
  }

  try {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      window.PLATFORM_DB = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,      // يبقى الطالب داخلًا بين الزيارات
          autoRefreshToken: true,    // تجديد الجلسة تلقائيًا قبل انتهائها
          detectSessionInUrl: true,  // قراءة نتيجة روابط التفعيل/الاستعادة
          flowType: "implicit",      // يعمل حتى لو فُتح رابط البريد على جهاز آخر
        },
      });
    }
  } catch (e) {
    console.warn("[platform] تعذّر تهيئة Supabase — المنصة تعمل بلا حسابات.");
    window.PLATFORM_DB = null;
  }
})();
