// ============================================================================
// supabase-client.js — تهيئة الاتصال بـ Supabase (Backend + Database + Auth).
// يعتمد على مكتبة @supabase/supabase-js المحمّلة عبر CDN في index.html،
// وعلى القيم الموجودة في js/platform/config.js.
//
// إن لم يكن config.js موجودًا بقيم حقيقية بعد (أو تعذّر تحميل مكتبة Supabase
// لأي سبب — مثل عدم وجود اتصال إنترنت)، تبقى window.PLATFORM_DB = null وتعمل
// المنصة بالكامل بوضعها المحلي القديم دون أي حساب أو اشتراك، دون أي خطأ
// يوقف الصفحة.
// ============================================================================
(function () {
  if (!window.PLATFORM_CONFIG || !window.PLATFORM_CONFIG.SUPABASE_URL || window.PLATFORM_CONFIG.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    console.warn(
      "[platform] لم يتم إعداد Supabase بعد — انسخ js/platform/config.example.js إلى config.js وعبّئ القيم. " +
      "المنصة ستعمل الآن بوضع محلي محدود بدون حسابات حقيقية."
    );
  }

  // النسخة المجانية غير التجارية (نظام الطالب الذكي): الطبقة التجارية معطّلة
  // عمدًا عبر PLATFORM_CONFIG.ENABLE_COMMERCIAL_LAYER = false، دون حذف أي كود
  // تجاري من المشروع. لا نحاول حتى الاتصال بـ Supabase في هذه الحالة، فتبقى
  // window.PLATFORM_DB = null دائمًا، ويختفي معها تلقائيًا كل ما هو تجاري
  // (تسجيل/دخول/تجربة مجانية/اشتراك/حسابي) من واجهة الطالب.
  if (window.PLATFORM_CONFIG && window.PLATFORM_CONFIG.ENABLE_COMMERCIAL_LAYER === false) {
    window.PLATFORM_DB = null;
    return;
  }

  try {
    if (window.supabase && window.PLATFORM_CONFIG) {
      window.PLATFORM_DB = window.supabase.createClient(
        window.PLATFORM_CONFIG.SUPABASE_URL,
        window.PLATFORM_CONFIG.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }
      );
    } else {
      window.PLATFORM_DB = null;
    }
  } catch (e) {
    console.warn("[platform] تعذّر تهيئة Supabase — المنصة ستعمل بوضعها المحلي:", e.message);
    window.PLATFORM_DB = null;
  }
})();
