// ============================================================================
// auth-gate.js — بوابة الدخول الحقيقية (تسجيل دخول / حساب مدرسة مجاني / حساب
// خارجي بتجربة مجانية 7 أيام) تُعرض قبل الوصول لأي شيء آخر في المنصة.
//
// إضافية بالكامل: إن لم يكن Supabase مُهيّأ بعد (js/platform/config.js بدون
// قيم حقيقية، أو تعذّر تحميل مكتبة supabase-js) فإن window.PlatformBoot
// يستدعي onReady() فورًا دون أي شاشة إضافية — فتعمل المنصة تمامًا كنسختها
// الأصلية في المرحلة الأولى، بلا أي حساب أو اشتراك.
//
// window.PlatformBoot(onReady) هي نقطة الدخول الوحيدة التي يستدعيها app.js
// (تعديل إضافي واحد صغير في نهاية app.js فقط — انظر التعليق هناك).
// ============================================================================
window.PlatformBoot = (function () {
  function mainEl() { return document.getElementById("app-main"); }
  function headerTitle() { return document.getElementById("header-title"); }
  function backBtn() { return document.getElementById("back-btn"); }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function isConfigured() {
    return !!window.PLATFORM_DB;
  }

  async function boot(onReady) {
    if (!isConfigured()) { onReady(); return; }

    try {
      backBtn().classList.add("hidden");

      const session = await PlatformAuth.getSession();
      if (!session) { renderLogin(onReady); return; }

      const profile = await PlatformAuth.getCurrentProfile();
      if (!profile) { renderLogin(onReady); return; }

      if (profile.status !== "active") {
        renderBlocked(profile);
        return;
      }

      if (profile.must_change_password) {
        renderForcePasswordChange(onReady);
        return;
      }

      // نجح الدخول — نجهّز حالة PlatformUI (الحساب + حالة الوصول التجارية
      // الحقيقية من قاعدة البيانات) ثم ننطلق للوحة الطالب المعتادة تمامًا.
      window.PlatformUI.state.profile = profile;
      try {
        window.PlatformUI.state.accessStatus = await PlatformAccess.getStatus(window.PlatformUI.state.subjectSlug);
        window.PlatformUI.state.trialDaysRemaining = await PlatformAccess.getTrialDaysRemaining();
      } catch (e) {
        console.warn("[platform] تعذّر تحديد حالة الوصول:", e.message);
        window.PlatformUI.state.accessStatus = null;
      }

      onReady();
    } catch (e) {
      // أي خطأ غير متوقع في الاتصال بـ Supabase (مثل انقطاع الإنترنت) لا يجب
      // أن يحجب الطالب عن نسخته المحلية — نُكمل بلا حساب حقيقي هذه الجلسة فقط.
      console.warn("[platform] تعذّر إقلاع طبقة الحسابات — استمرار بالوضع المحلي:", e.message);
      onReady();
    }
  }

  function screen(html) {
    headerTitle().textContent = "نظام الطالب الذكي";
    const m = mainEl();
    m.innerHTML = "";
    const wrap = el("div", "namecard auth-screen");
    wrap.innerHTML = html;
    m.appendChild(wrap);
    return m;
  }

  function renderBlocked() {
    screen(`
      <p style="font-weight:700">🚫 حسابك موقوف مؤقتًا</p>
      <p class="qz-muted">تواصل مع إدارة المنصة لمعرفة السبب.</p>
    `);
  }

  function renderLogin(onReady) {
    const m = screen(`
      <div class="auth-tabs">
        <button class="qz-btn qz-btn-outline active" data-tab="login">تسجيل الدخول</button>
        <button class="qz-btn qz-btn-outline" data-tab="signup-school">حساب مدرسة (مجاني)</button>
        <button class="qz-btn qz-btn-outline" data-tab="signup-external">حساب جديد (تجربة 7 أيام)</button>
      </div>
      <div id="auth-tab-body"></div>
    `);

    const tabs = m.querySelectorAll(".auth-tabs button");
    const body = m.querySelector("#auth-tab-body");

    function setActive(tabKey) {
      tabs.forEach((b) => b.classList.toggle("active", b.dataset.tab === tabKey));
      if (tabKey === "login") renderLoginForm(body, onReady);
      if (tabKey === "signup-school") renderSignupSchoolForm(body, onReady);
      if (tabKey === "signup-external") renderSignupExternalForm(body, onReady);
    }
    tabs.forEach((b) => b.addEventListener("click", () => setActive(b.dataset.tab)));
    setActive("login");
  }

  function formRow(labelText, inputHtml) {
    return `<label class="auth-field"><span>${labelText}</span>${inputHtml}</label>`;
  }

  function renderLoginForm(body, onReady) {
    body.innerHTML = `
      ${formRow("اسم المستخدم", `<input type="text" id="af-username" autocomplete="username" />`)}
      ${formRow("كلمة المرور", `<input type="password" id="af-password" autocomplete="current-password" />`)}
      <p id="auth-error" class="auth-error"></p>
      <button id="auth-submit" class="qz-btn qz-btn-primary">دخول</button>
    `;
    body.querySelector("#auth-submit").addEventListener("click", async () => {
      const username = body.querySelector("#af-username").value.trim();
      const password = body.querySelector("#af-password").value;
      const errEl = body.querySelector("#auth-error");
      errEl.textContent = "";
      if (!username || !password) { errEl.textContent = "أدخل اسم المستخدم وكلمة المرور."; return; }
      try {
        await PlatformAuth.signInWithUsername({ username, password });
        boot(onReady);
      } catch (e) {
        errEl.textContent = "بيانات الدخول غير صحيحة.";
      }
    });
  }

  function renderSignupSchoolForm(body, onReady) {
    body.innerHTML = `
      <p class="qz-muted">حساب مجاني بالكامل لطلاب المدرسة الفلسطينية في قطر — لا حاجة لأي دفع أو تجربة مؤقتة.</p>
      ${formRow("الاسم الكامل", `<input type="text" id="af-fullname" />`)}
      ${formRow("اسم مستخدم (حروف إنجليزية وأرقام فقط، بلا مسافات)", `<input type="text" id="af-username" autocomplete="username" placeholder="مثال: ahmad_2010" />`)}
      ${formRow("كلمة المرور", `<input type="password" id="af-password" autocomplete="new-password" />`)}
      <p id="auth-error" class="auth-error"></p>
      <button id="auth-submit" class="qz-btn qz-btn-primary">إنشاء الحساب</button>
    `;
    body.querySelector("#auth-submit").addEventListener("click", async () => {
      const fullName = body.querySelector("#af-fullname").value.trim();
      const username = body.querySelector("#af-username").value.trim();
      const password = body.querySelector("#af-password").value;
      const errEl = body.querySelector("#auth-error");
      errEl.textContent = "";
      if (!fullName || !username || password.length < 6) {
        errEl.textContent = "أكمل الحقول (كلمة المرور 6 أحرف على الأقل).";
        return;
      }
      try {
        await PlatformAuth.signUpSchoolStudent({ username, fullName, password });
        boot(onReady);
      } catch (e) {
        errEl.textContent = e.message || "تعذّر إنشاء الحساب، تحقق من اسم المستخدم.";
      }
    });
  }

  function renderSignupExternalForm(body, onReady) {
    body.innerHTML = `
      <p class="qz-muted">تجربة مجانية حقيقية 7 أيام كاملة، ثم اشتراك فصلي (150 ر.ق) لمواصلة تسجيل التقدّم. حسابك وتقدّمك لن يُحذفا أبدًا حتى بعد انتهاء التجربة.</p>
      ${formRow("الاسم الكامل", `<input type="text" id="af-fullname" />`)}
      ${formRow("اسم مستخدم (حروف إنجليزية وأرقام فقط، بلا مسافات)", `<input type="text" id="af-username" autocomplete="username" placeholder="مثال: ahmad_2010" />`)}
      ${formRow("البريد الإلكتروني", `<input type="email" id="af-email" autocomplete="email" />`)}
      ${formRow("كلمة المرور", `<input type="password" id="af-password" autocomplete="new-password" />`)}
      <p id="auth-error" class="auth-error"></p>
      <button id="auth-submit" class="qz-btn qz-btn-primary">إنشاء الحساب وبدء التجربة</button>
    `;
    body.querySelector("#auth-submit").addEventListener("click", async () => {
      const fullName = body.querySelector("#af-fullname").value.trim();
      const username = body.querySelector("#af-username").value.trim();
      const email = body.querySelector("#af-email").value.trim();
      const password = body.querySelector("#af-password").value;
      const errEl = body.querySelector("#auth-error");
      errEl.textContent = "";
      if (!fullName || !username || !email || password.length < 6) {
        errEl.textContent = "أكمل الحقول (كلمة المرور 6 أحرف على الأقل).";
        return;
      }
      try {
        await PlatformAuth.signUpExternalStudent({ username, fullName, email, password });
        boot(onReady);
      } catch (e) {
        errEl.textContent = e.message || "تعذّر إنشاء الحساب، تحقق من البيانات.";
      }
    });
  }

  function renderForcePasswordChange(onReady) {
    const m = screen(`
      <p style="font-weight:700">🔐 يجب تغيير كلمة المرور المؤقتة قبل المتابعة</p>
      ${formRow("كلمة المرور الجديدة", `<input type="password" id="af-newpass" autocomplete="new-password" />`)}
      ${formRow("تأكيد كلمة المرور", `<input type="password" id="af-newpass2" autocomplete="new-password" />`)}
      <p id="auth-error" class="auth-error"></p>
      <button id="auth-submit" class="qz-btn qz-btn-primary">تحديث كلمة المرور</button>
    `);
    m.querySelector("#auth-submit").addEventListener("click", async () => {
      const p1 = m.querySelector("#af-newpass").value;
      const p2 = m.querySelector("#af-newpass2").value;
      const errEl = m.querySelector("#auth-error");
      if (p1.length < 8) { errEl.textContent = "8 أحرف على الأقل."; return; }
      if (p1 !== p2) { errEl.textContent = "كلمتا المرور غير متطابقتين."; return; }
      try {
        await PlatformAuth.changePassword(p1);
        boot(onReady);
      } catch (e) {
        errEl.textContent = "تعذّر التحديث: " + e.message;
      }
    });
  }

  return boot;
})();
