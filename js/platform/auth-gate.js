// ============================================================================
// auth-gate.js — إقلاع طبقة الحسابات دون حجب أي شيء.
//
// window.PlatformBoot(onReady) هي نقطة الدخول التي يستدعيها app.js. لا تُعرض
// هنا أي شاشة دخول إلزامية: الضيف يدخل المنصة كاملة كما كان. ما يفعله فقط:
//   1) يعرف إن كان الطالب داخلًا (من الجلسة المحفوظة) ليظهر الرابط الصحيح.
//   2) يعالج روابط البريد (تفعيل / استعادة) ويعرض نتيجتها بوضوح.
//   3) يتحقق من الجلسة من الخادم في الخلفية، ويخرج محليًا إن رُفضت.
// إن تعذّر الاتصال بـ Supabase لأي سبب، تُكمل المنصة بلا حساب هذه الزيارة.
// ============================================================================
window.PlatformBoot = (function () {
  const SESSION_WAIT_MS = 4000;

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(undefined), ms))]);
  }

  // نتيجة رابط البريد → إشعار يُعرض في صفحة «حسابي»
  async function handleEmailLink(ctx) {
    if (!ctx) return null;
    if (ctx.hasError) return ctx.errorCode === "otp_expired" ? "link_expired" : "link_invalid";
    if (ctx.tokenHash) {
      // قالب بريد مخصّص بـ token_hash (اختياري)
      try { await PlatformAuth.verifyTokenHash(ctx.tokenHash, ctx.type); }
      catch (e) { return e.code === "network" ? "link_network" : "link_expired"; }
    }
    const session = await PlatformAuth.getSession();
    if (!session) return "link_invalid";
    if (ctx.type === "recovery") { PlatformUI.state.recovery = true; return null; }
    return "confirmed";
  }

  // إزالة الرموز من شريط العنوان بعد معالجتها (لا تبقى في السجل أو عند المشاركة)
  function cleanUrl() {
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* ignore */ }
  }

  async function boot(onReady) {
    if (typeof PlatformAuth === "undefined" || !PlatformAuth.isEnabled()) { onReady(); return; }

    const ctx = window.PLATFORM_AUTH_URL_CONTEXT;

    PlatformAuth.onChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") PlatformUI.state.recovery = true;
      if (event === "SIGNED_OUT") {
        await PlatformUI.setUser(null);
        // خروج من تبويب آخر أو انتهاء الجلسة: لا تبقى بيانات الحساب معروضة
        if (document.querySelector(".auth-facts") && window.AppShell) window.AppShell.goRoot("dashboard", "تمكّن");
        return;
      }
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        const sameUser = PlatformUI.state.user && session && PlatformUI.state.user.id === session.user.id;
        if (session && (!sameUser || event === "USER_UPDATED")) await PlatformUI.setUser(session.user);
      }
    });

    let notice = null;
    try {
      notice = await withTimeout(handleEmailLink(ctx), SESSION_WAIT_MS);
      const session = await withTimeout(PlatformAuth.getSession(), SESSION_WAIT_MS);
      await withTimeout(PlatformUI.setUser(session ? session.user : null), SESSION_WAIT_MS);
    } catch (e) {
      console.warn("[platform] تعذّر إقلاع الحسابات — استمرار بلا حساب هذه الزيارة.");
    }
    if (ctx) cleanUrl();

    onReady();

    if (ctx && window.AppShell && (notice || PlatformUI.state.recovery)) {
      window.AppShell.go("account", "👤 حسابي", { notice });
    }

    // تحقق من الخادم: جلسة محلية لم يعد الخادم يقبلها ← خروج محلي
    if (PlatformUI.state.user) {
      const user = await PlatformAuth.verifyUser();
      if (user === null) { await PlatformAuth.signOut(); await PlatformUI.setUser(null); }
      else if (user) PlatformUI.state.user = user;
    }
  }

  return boot;
})();
