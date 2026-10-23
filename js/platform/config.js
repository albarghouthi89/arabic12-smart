// ============================================================================
// config.js — إعداد الاتصال بمشروع Supabase الخاص بحسابات «تمكّن».
//
// تنويه أمني: القيمتان أدناه آمنتان للنشر العلني — Project URL ومفتاح
// Publishable/Anon فقط، محكوم بالكامل بسياسات RLS (backend/migration_004_accounts.sql).
// لا يوضع هنا ولا في أي ملف يصل إليه المتصفح مفتاح service_role أو secret.
//
// المشروع: tamakkun (South Asia — Mumbai). إن عادت القيمتان قالبيتين
// (YOUR-PROJECT-REF) تتعطّل الحسابات تلقائيًا وتعمل المنصة كما هي دون أي زر دخول.
// ============================================================================
window.PLATFORM_CONFIG = {
  // حسابات الطلاب (تسجيل بالبريد، تفعيل، دخول، استعادة، خروج) — مجانية بالكامل.
  // لا تحجب أي محتوى: الضيف يستخدم المنصة كاملة كما كان.
  ENABLE_ACCOUNTS: true,

  // الطبقة التجارية (تجربة/اشتراك/أسعار) — معطّلة، ولا تُحمَّل ملفاتها أصلًا.
  ENABLE_COMMERCIAL_LAYER: false,

  SUPABASE_URL: "https://rmaadpdenrpjbieiwrlk.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_pptNAuewiGsnRXpIBwKxdg_ZGV28Mdt",
};
