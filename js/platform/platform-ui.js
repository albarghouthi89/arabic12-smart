// ============================================================================
// platform-ui.js — عناصر واجهة إضافية فوق تجربة الطالب الحالية: شريط حالة
// الحساب/التجربة/الاشتراك في لوحة التحكم، ورابط "حسابي" الجديد، وصفحة
// "حسابي" التفصيلية. كل شيء هنا إضافي بحت؛ إن لم تُفعَّل Supabase بعد فلن
// يظهر شيء جديد على الإطلاق وستعمل المنصة تمامًا كنسختها الأصلية (Phase I).
//
// ملاحظة صريحة عن نطاق هذه المرحلة الفرعية (1 من 4): الشاشة أدناه تعرض حالة
// الحساب/التجربة/الاشتراك والسعر الحقيقيين من قاعدة البيانات، لكنها لا تحتوي
// بعد على صفحة دفع/اشتراك كاملة بكل تفاصيلها (تلك ستُبنى في المرحلة الفرعية
// التالية "2" مع طبقة حماية المحتوى المدفوع الكاملة). هذا مقصود ومُعلَن، وليس
// نقصًا غير مقصود.
// ============================================================================
window.PlatformUI = (function () {
  const state = {
    profile: null,
    accessStatus: null, // 'STAFF' | 'SCHOOL_FREE' | 'SUBSCRIPTION_ACTIVE' | 'TRIAL_ACTIVE' | 'TRIAL_EXPIRED' | 'NO_ACCESS' | null
    trialDaysRemaining: null,
    subjectSlug: "arabic-12",
  };

  // أداة DOM محلية صغيرة (نسخة مطابقة لأداة app.js) — كي تبقى دوال هذا الملف
  // قابلة للاستدعاء من جدول التوجيه VIEWS بنفس توقيع (container, opts) دون أي
  // اعتماد خارجي، ودون أي تعديل على app.js نفسه لتمرير أدوات إضافية.
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function statusLabel() {
    switch (state.accessStatus) {
      case "STAFF": return "🛠️ حساب طاقم";
      case "SCHOOL_FREE": return "🏫 حساب مدرسة — وصول مجاني بالكامل";
      case "SUBSCRIPTION_ACTIVE": return "✅ اشتراك فعّال";
      case "TRIAL_ACTIVE": return `🎁 تجربة مجانية — باقي ${state.trialDaysRemaining ?? "؟"} يوم`;
      case "TRIAL_EXPIRED": return "⏰ انتهت التجربة المجانية";
      case "NO_ACCESS": return "ℹ️ الحساب غير مُفعَّل";
      default: return "";
    }
  }

  // شريط رفيع فوق لوحة التحكم — غير مزعج (بدون نوافذ منبثقة)، يظهر فقط عند
  // وجود حساب حقيقي مسجَّل الدخول. لا شيء يظهر لضيف غير مسجَّل أو بدون Supabase.
  // يستقبل go() من app.js (تمريرها من نقطة الاستدعاء داخل viewDashboard فقط).
  function renderStatusBanner(container, go) {
    if (!window.PLATFORM_DB || !state.profile) return;

    if (state.accessStatus === "TRIAL_ACTIVE") {
      const b = el("button", "daily-banner trial-banner");
      b.innerHTML = `<span>🎁 تجربتك المجانية</span><span>باقي ${state.trialDaysRemaining ?? "؟"} يوم من 7 — استكشف المنصة بحرية · التفاصيل ←</span>`;
      b.addEventListener("click", () => go("account", "👤 حسابي"));
      container.appendChild(b);
      return;
    }

    if (state.accessStatus === "TRIAL_EXPIRED") {
      const b = el("button", "daily-banner trial-banner trial-banner-expired");
      b.innerHTML = `<span>⏰ انتهت فترتك التجريبية</span><span>بياناتك وتقدّمك محفوظون بالكامل — راجع خيار الاشتراك ←</span>`;
      b.addEventListener("click", () => go("account", "👤 حسابي"));
      container.appendChild(b);
      return;
    }

    // بقية الحالات (مدرسة/اشتراك فعّال/طاقم): شريحة صغيرة هادئة فقط، بلا بطاقة كبيرة
    if (state.accessStatus === "SCHOOL_FREE" || state.accessStatus === "SUBSCRIPTION_ACTIVE" || state.accessStatus === "STAFF") {
      const chipRow = el("div", "platform-chip-row");
      chipRow.innerHTML = `<span class="chip platform-chip">${statusLabel()}</span>`;
      container.appendChild(chipRow);
    }
  }

  // رابط صغير غير ملفت لصفحة "حسابي" — بجانب رابط "عن المنصة" الموجود، بنفس
  // أسلوبه البصري بالضبط (بند الحفاظ على الهوية وعدم إضافة ازدحام).
  function renderAccountLink(container, go) {
    if (!window.PLATFORM_DB || !state.profile) return;
    const link = el("button", "about-link account-link", "👤 حسابي واشتراكي");
    link.addEventListener("click", () => go("account", "👤 حسابي"));
    container.appendChild(link);
  }

  // ------------------------------------------------------------------------
  // صفحة "حسابي" الكاملة — مُسجَّلة في VIEWS.account وتُستدعى كـ (container, opts)
  // ------------------------------------------------------------------------
  function viewAccount(container) {
    const p = state.profile;
    if (!p) { container.appendChild(el("p", "qz-muted", "سجّل الدخول أولًا.")); return; }

    const card = el("div", "qz-card account-card");
    const typeLabel = p.account_type === "school" ? "🏫 حساب مدرسة (مجاني)" : "🎓 حساب خارجي";
    card.innerHTML = `
      <h2 style="margin-top:0">${p.full_name || p.username}</h2>
      <p class="qz-muted">${typeLabel} · اسم المستخدم: ${p.username}</p>
    `;
    container.appendChild(card);

    const statusCard = el("div", "qz-card account-status-card");
    statusCard.appendChild(el("h3", null, "حالة الحساب"));
    statusCard.appendChild(el("p", "account-status-line", statusLabel()));

    if (state.accessStatus === "TRIAL_ACTIVE") {
      statusCard.appendChild(el("p", "qz-muted",
        `تجربتك المجانية (7 أيام) سارية — باقي ${state.trialDaysRemaining ?? "؟"} يوم. بعد انتهائها ستحتاج لاشتراك لمواصلة تسجيل تقدّمك الجديد؛ كل ما أنجزته حتى الآن محفوظ ولن يُحذف مطلقًا.`));
      appendPriceLine(statusCard);
    } else if (state.accessStatus === "TRIAL_EXPIRED") {
      statusCard.appendChild(el("p", "qz-muted",
        `انتهت فترتك التجريبية المجانية. حسابك وتقدّمك ونتائجك محفوظة بالكامل ولن تُحذف أبدًا — فقط تسجيل تقدّم جديد يحتاج الآن اشتراكًا فعّالًا.`));
      appendPriceLine(statusCard);
      statusCard.appendChild(el("p", "qz-muted", "صفحة الاشتراك والدفع الكاملة قيد الإنجاز حاليًا (المرحلة التالية). للتواصل الآن مباشرة مع المعلم:"));
      appendWhatsappButton(statusCard);
    } else if (state.accessStatus === "SCHOOL_FREE") {
      statusCard.appendChild(el("p", "qz-muted", "بصفتك طالبًا في المدرسة الفلسطينية في قطر، وصولك للمنصة مجاني بالكامل ودائم — لا حاجة لأي اشتراك."));
    } else if (state.accessStatus === "SUBSCRIPTION_ACTIVE") {
      statusCard.appendChild(el("p", "qz-muted", "اشتراكك فعّال حاليًا. تفاصيل الفصل الدراسي وتاريخ الانتهاء ستظهر هنا بالتفصيل في صفحة الاشتراك القادمة."));
    } else if (state.accessStatus === "STAFF") {
      statusCard.appendChild(el("p", "qz-muted", "هذا حساب طاقم (معلم/إدارة) — لا تنطبق عليه قواعد التجربة أو الاشتراك."));
    } else {
      statusCard.appendChild(el("p", "qz-muted", "لم يتم تفعيل حسابك بعد. تواصل مع إدارة المنصة."));
      appendWhatsappButton(statusCard);
    }
    container.appendChild(statusCard);

    const logoutBtn = el("button", "qz-btn qz-btn-outline", "تسجيل الخروج");
    logoutBtn.addEventListener("click", async () => {
      logoutBtn.disabled = true;
      logoutBtn.textContent = "جارٍ تسجيل الخروج...";
      await PlatformAuth.signOut();
      location.reload();
    });
    container.appendChild(logoutBtn);
  }

  function appendPriceLine(container) {
    const priceP = el("p", "qz-muted price-line", "جارٍ تحميل السعر...");
    container.appendChild(priceP);
    PlatformAccess.getPrice(state.subjectSlug, 1).then((price) => {
      if (price !== null && price !== undefined) {
        priceP.textContent = `سعر الاشتراك: ${price} ر.ق / الفصل الدراسي الأول — اشتراك مستقل لكل فصل، وليس شهريًا.`;
      }
    });
  }

  function appendWhatsappButton(container) {
    if (typeof ARABIC12_DATA === "undefined" || !ARABIC12_DATA.meta || !ARABIC12_DATA.meta.phoneIntl) return;
    const waBtn = el("a", "qz-btn qz-btn-primary about-whatsapp-btn", "💬 تواصل عبر واتساب");
    waBtn.href = `https://wa.me/${ARABIC12_DATA.meta.phoneIntl.replace(/[^0-9]/g, "")}`;
    waBtn.target = "_blank";
    waBtn.rel = "noopener";
    container.appendChild(waBtn);
  }

  return { state, renderStatusBanner, renderAccountLink, viewAccount };
})();
