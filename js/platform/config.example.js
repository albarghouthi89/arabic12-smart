// ============================================================================
// config.example.js — قالب الإعداد. انسخ هذا الملف إلى config.js وعبِّئ القيم
// الحقيقية لمشروعك على Supabase (المتاحة من: Project Settings → API).
//
// تنويه أمني: القيمتان أدناه (URL + Publishable/Anon Key) آمنتان للنشر العلني
// داخل كود الواجهة — هذا هو الغرض الرسمي لهذا المفتاح في Supabase، وهو محكوم
// بالكامل بسياسات Row Level Security. لا تضع هنا أبدًا مفتاح service_role أو
// secret — ذلك المفتاح لا يجوز أن يظهر في أي كود يصل إليه المتصفح.
// ============================================================================
window.PLATFORM_CONFIG = {
  ENABLE_ACCOUNTS: true,
  REQUIRE_ACCOUNT: true,
  ENABLE_COMMERCIAL_LAYER: false,
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-PUBLISHABLE-KEY",
};
