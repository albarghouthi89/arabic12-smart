// ============================================================================
// auth-gate.js — إقلاع طبقة الحسابات.
//
// window.PlatformBoot(onReady) هي نقطة الدخول التي يستدعيها app.js. onReady()
// هو ما يرسم المنصة (اللوحة والدروس…)، فلا يُستدعى إلا عند السماح بالدخول.
//
// وضعان حسب PLATFORM_CONFIG.REQUIRE_ACCOUNT:
//   - true (الافتراضي الآن): الدخول إلزامي. قبل تسجيل الدخول بحساب مفعّل لا يظهر
//     إلا شاشة الحساب؛ لا لوحة ولا دروس ولا ملفات. المنصة مجانية في هذه المرحلة:
//     أي حساب مفعّل البريد يدخل (انظر contentAllowed).
//   - false: الحساب اختياري والضيف يرى المنصة كاملة (السلوك السابق).
//
// في الوضعين: معالجة روابط البريد (تفعيل/استعادة) وحذف الرموز من العنوان،
// والتحقق من الجلسة من الخادم.
//
// حد معروف: هذه بوابة واجهة. ملفات المحتوى (js/lessons وبنك الأسئلة والكتاب)
// ما زالت ملفات عامة يمكن طلبها مباشرة؛ حمايتها الفعلية تحتاج تقديمها من الخادم.
// ============================================================================
window.PlatformBoot = (function () {
  const SESSION_WAIT_MS = 4000;
  const REQUIRE = !!(window.PLATFORM_CONFIG && window.PLATFORM_CONFIG.REQUIRE_ACCOUNT === true);
  let contentShown = false; // رُسمت المنصة (onReady) — يلزم إعادة التحميل عند الخروج

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(undefined), ms))]);
  }

  // من يحق له رؤية المحتوى. المرحلة الحالية مجانية: حساب مفعّل البريد يكفي.
  // عند تفعيل الاشتراكات يُضاف هنا فحص صلاحية يأتي من الخادم (لا من المتصفح).
  function contentAllowed(user) {
    return !!(user && (user.email_confirmed_at || user.confirmed_at));
  }

  // نتيجة رابط البريد → إشعار يُعرض في شاشة الحساب
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

  // الصفحة التعريفية للزائر (landing.js): أول ما يراه من لم يسجّل الدخول.
  // لا تعرض أي محتوى تعليمي؛ أزرارها تفتح شاشتي الحساب الموجودتين.
  function showLanding(onAllowed) {
    if (typeof PlatformLanding === "undefined") { showGate(onAllowed, null); return; }
    document.body.classList.add("tk-gated", "tk-landing");
    const main = document.getElementById("app-main");
    main.textContent = "";
    PlatformLanding.render(main, {
      onSignup: () => showGate(onAllowed, null, "signup", true),
      onLogin: () => showGate(onAllowed, null, "login", true),
    });
    window.scrollTo(0, 0);
  }

  // شاشة الدخول الإلزامية: تملأ الصفحة وحدها، ولا يُرسم شيء من المنصة خلفها.
  // fromLanding: فُتحت من الصفحة التعريفية، فيظهر زر العودة إليها.
  function showGate(onAllowed, notice, screen, fromLanding) {
    document.body.classList.remove("tk-landing");
    document.body.classList.add("tk-gated");
    const main = document.getElementById("app-main");
    const title = document.getElementById("header-title");
    if (title) title.textContent = "تمكّن";
    main.textContent = "";
    window.scrollTo(0, 0);
    PlatformUI.viewAccount(main, {
      gate: true,
      notice,
      screen,
      onBack: fromLanding ? () => showLanding(onAllowed) : undefined,
      offerResend: notice === "link_expired" || notice === "link_invalid",
      onSignedIn: async (user) => {
        const fresh = (await PlatformAuth.verifyUser()) || user;
        if (!contentAllowed(fresh)) return false; // يبقى على شاشة الحساب
        PlatformUI.state.user = fresh;
        document.body.classList.remove("tk-gated", "tk-landing");
        contentShown = true;
        onAllowed();
        return true;
      },
    });
  }

  // الدخول إلزامي لكن خدمة الحسابات غير متاحة (إعداد ناقص أو تعذّر تحميل المكتبة)
  function showUnavailable() {
    document.body.classList.add("tk-gated");
    const main = document.getElementById("app-main");
    main.textContent = "";
    const box = document.createElement("div");
    box.className = "auth-screen";
    const card = document.createElement("div");
    card.className = "qz-card auth-card";
    const h = document.createElement("h2");
    h.className = "auth-title";
    h.textContent = "تعذّر تحميل خدمة تسجيل الدخول";
    const p = document.createElement("p");
    p.className = "auth-sub";
    p.textContent = "تحقق من اتصالك بالإنترنت ثم أعد تحميل الصفحة. إن استمرت المشكلة فأبلغ المعلم.";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "qz-btn qz-btn-primary auth-submit";
    btn.textContent = "إعادة المحاولة";
    btn.addEventListener("click", () => location.reload());
    card.append(h, p, btn);
    box.appendChild(card);
    main.appendChild(box);
  }

  async function boot(onReady) {
    const enabled = typeof PlatformAuth !== "undefined" && PlatformAuth.isEnabled();
    if (!enabled) {
      if (REQUIRE) showUnavailable(); else onReady();
      return;
    }

    const ctx = window.PLATFORM_AUTH_URL_CONTEXT;

    PlatformAuth.onChange(async (event, session) => {
      if (event === "PASSWORD_RECOVERY") PlatformUI.state.recovery = true;
      if (event === "SIGNED_OUT") {
        await PlatformUI.setUser(null);
        // الدخول إلزامي: خروج بعد ظهور المنصة (من هذا التبويب أو غيره) يعيد إلى
        // شاشة الدخول. قبل ظهورها (جلسة قديمة رفضها الخادم أثناء الإقلاع) لا داعي لذلك.
        if (REQUIRE) { if (contentShown) location.replace(location.pathname); return; }
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
      console.warn("[platform] تعذّر إقلاع الحسابات.");
    }
    if (ctx) cleanUrl();

    if (REQUIRE) {
      // لا نثق بالجلسة المحفوظة وحدها: تحقق من الخادم قبل إظهار المحتوى.
      // إن تعذّر الاتصال (undefined) نقبل الجلسة المحفوظة كي لا يُحرم الطالب بسبب الشبكة.
      if (PlatformUI.state.user) {
        const verified = await withTimeout(PlatformAuth.verifyUser(), SESSION_WAIT_MS);
        if (verified === null) { await PlatformAuth.signOut(); await PlatformUI.setUser(null); }
        else if (verified) PlatformUI.state.user = verified;
      }
      const user = PlatformUI.state.user;
      if (PlatformUI.state.recovery || !contentAllowed(user)) {
        // زائر بلا رابط بريد ولا حساب: الصفحة التعريفية. غير ذلك (نتيجة رابط
        // تفعيل/استعادة، أو حساب لم يُفعَّل بعد): شاشة الحساب مباشرة.
        if (!notice && !PlatformUI.state.recovery && !user) showLanding(onReady);
        else showGate(onReady, notice);
        return;
      }
      contentShown = true;
      onReady();
      if (ctx && notice && window.AppShell) window.AppShell.go("account", "👤 حسابي", { notice });
      return;
    }

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
