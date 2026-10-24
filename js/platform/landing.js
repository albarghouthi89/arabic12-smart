// ============================================================================
// landing.js — الصفحة التعريفية للزائر غير المسجّل.
//
// يعرضها auth-gate.js بدل شاشة الدخول مباشرة: تشرح المنصة وقيمتها أولًا، ثم
// يفتح زرّا «إنشاء حساب» و«تسجيل الدخول» شاشات الحساب الموجودة (platform-ui.js).
// لا تقرأ أي محتوى تعليمي ولا تعرضه؛ كل النصوص هنا ثابتة ومأخوذة من مزايا المنصة
// الفعلية. الأيقونات من مكتبة SVG الموجودة في index.html.
// ============================================================================
window.PlatformLanding = (function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function h(tag, attrs, ...children) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    children.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return e;
  }

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "tk-ico");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVG_NS, "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }

  // ---------------------------------------------------------------- المحتوى
  const FEATURES = [
    { icon: "book-open", title: "دروس الفصل الأول كاملة", text: "13 درسًا مرتّبة وفق الخطة الفصلية، لكل درس: تشخيص، اكتشف، افهم، جرّب، والخريطة الذهنية." },
    { icon: "graduation", title: "بنك 845 سؤالًا", text: "أسئلة من اختبارات وتدريبات سابقة، مصنّفة حسب الموضوع والمهارة، مع إجابات نموذجية لمعظمها." },
    { icon: "clipboard-check", title: "محاكاة الاختبار الوزاري", text: "ابنِ اختبارًا تدريبيًا بالمواصفات التي تريدها، وحمّله بصيغة Word للطباعة والحل." },
    { icon: "book", title: "الكتاب والخطة والملزمة", text: "كتاب الطالب والخطة الفصلية والملزمة داخل المنصة، و20 ملف مراجعة من خرائط ذهنية وأوراق عمل." },
    { icon: "target", title: "تدريب يركّز على نقاط ضعفك", text: "تحدي 100%، مصائد الاختبار، المراجعة المتباعدة، ومختبر الأخطاء لتحويل أخطائك إلى نقاط قوة." },
    { icon: "trophy", title: "متابعة تقدّمك", text: "مستوى إتقانك لكل درس، وأيام إنجازك ونقاطك، لتعرف أين وصلت وماذا تراجع بعد ذلك." },
  ];

  const STEPS = [
    { title: "أنشئ حسابك", text: "بالاسم والبريد الإلكتروني وكلمة مرور. التسجيل مجاني في هذه المرحلة." },
    { title: "فعّل بريدك", text: "افتح رسالة التفعيل التي تصلك واضغط زر «تفعيل الحساب»." },
    { title: "ابدأ أول درس", text: "سجّل الدخول، واختر درسك، وتابع تقدّمك من لوحتك." },
  ];

  const SHOTS = [
    { src: "assets/landing/dashboard.png", alt: "لوحة الطالب في منصة تمكّن", caption: "لوحتك: الدرس الحالي، التحدي اليومي، وكل أدوات التعلّم في مكان واحد." },
    { src: "assets/landing/lesson.png", alt: "صفحة درس في منصة تمكّن", caption: "الدرس: مراحل واضحة من الاكتشاف إلى الخريطة الذهنية." },
    { src: "assets/landing/bank.png", alt: "بنك الأسئلة في منصة تمكّن", caption: "بنك الأسئلة: تدرّب حسب الموضوع أو ابنِ اختبارًا ذكيًا." },
    { src: "assets/landing/exam.png", alt: "محاكاة الاختبار الوزاري في منصة تمكّن", caption: "محاكاة الاختبار: اختبار تدريبي بمواصفاتك يُحمَّل بصيغة Word." },
  ];

  function whatsappLink() {
    const phone = (typeof ARABIC12_DATA !== "undefined" && ARABIC12_DATA.meta && ARABIC12_DATA.meta.phoneIntl) || "";
    const digits = phone.replace(/[^0-9]/g, "");
    return digits ? "https://wa.me/" + digits : null;
  }

  const FAQ = [
    { q: "هل التسجيل مجاني؟", a: "نعم، التسجيل مجاني في هذه المرحلة. تحتاج فقط إلى بريد إلكتروني لتفعيل حسابك." },
    { q: "لمن المنصة؟", a: "لطلاب الصف الثاني عشر العلمي في دولة قطر، في مادة اللغة العربية، الفصل الدراسي الأول 2026–2027." },
    { q: "هل تعمل على الجوال؟", a: "نعم، المنصة مصمّمة لتعمل على الجوال والجهاز اللوحي والكمبيوتر من المتصفح، دون تثبيت أي تطبيق." },
    { q: "كيف أتواصل مع المعلم؟", a: "عبر واتساب من الرابط في أسفل هذه الصفحة، أو من صفحة «عن المنصة» بعد تسجيل الدخول." },
  ];

  // ---------------------------------------------------------------- البناء
  function render(container, opts) {
    opts = opts || {};
    const signup = () => opts.onSignup && opts.onSignup();
    const login = () => opts.onLogin && opts.onLogin();
    const ctaSignup = (label, cls) => h("button", { type: "button", class: "lp-btn lp-btn-primary " + (cls || ""), onclick: signup }, label);
    const ctaLogin = (label, cls) => h("button", { type: "button", class: "lp-btn lp-btn-ghost " + (cls || ""), onclick: login }, label);

    const page = h("div", { class: "lp" });
    const scrollTo = (id) => () => { const t = page.querySelector("#" + id); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); };

    // 1) الشريط العلوي
    const brandMark = h("span", { class: "lp-mark", "aria-hidden": "true" });
    brandMark.innerHTML = '<svg viewBox="0 0 32 32" fill="none"><path d="M6 23 L12 15.5 L18 19.5 L25 9" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="25" cy="8.5" r="3.4" fill="#e8b04a"/></svg>';
    page.appendChild(h("header", { class: "lp-top" },
      h("div", { class: "lp-wrap lp-top-in" },
        h("div", { class: "lp-brand" }, brandMark, h("span", { class: "lp-brand-name", text: "تمكّن" })),
        h("nav", { class: "lp-nav", "aria-label": "روابط الصفحة" },
          h("button", { type: "button", class: "lp-nav-link", onclick: scrollTo("lp-features"), text: "المزايا" }),
          h("button", { type: "button", class: "lp-nav-link", onclick: scrollTo("lp-how"), text: "كيف تعمل" }),
          h("button", { type: "button", class: "lp-nav-link", onclick: scrollTo("lp-faq"), text: "الأسئلة الشائعة" })),
        h("div", { class: "lp-top-cta" },
          h("button", { type: "button", class: "lp-link-login", onclick: login, text: "تسجيل الدخول" }),
          ctaSignup("إنشاء حساب مجاني", "lp-btn-sm")))));

    // 2) القسم الافتتاحي
    page.appendChild(h("section", { class: "lp-hero", "aria-labelledby": "lp-hero-title" },
      h("div", { class: "lp-wrap lp-hero-in" },
        h("div", { class: "lp-hero-text" },
          h("p", { class: "lp-eyebrow", text: "اللغة العربية · الصف الثاني عشر العلمي · دولة قطر" }),
          h("h1", { id: "lp-hero-title", text: "استعد لاختبار اللغة العربية بثقة، خطوة بخطوة." }),
          h("p", { class: "lp-lead", text: "دروس الفصل الأول، وبنك أسئلة من اختبارات سابقة، ومحاكاة للاختبار الوزاري، ومتابعة لتقدّمك — في منصة واحدة من إعداد المعلم عبدالله البرغوثي." }),
          h("div", { class: "lp-hero-cta" }, ctaSignup("أنشئ حسابك مجانًا"), ctaLogin("لديّ حساب — تسجيل الدخول")),
          h("p", { class: "lp-note" }, icon("check"), h("span", { text: "التسجيل مجاني في هذه المرحلة · يعمل على الجوال والكمبيوتر" }))),
        h("figure", { class: "lp-hero-shot" },
          h("img", { src: SHOTS[0].src, alt: SHOTS[0].alt, width: "1280", height: "800", decoding: "async" }),
          h("figcaption", { text: "لقطة حقيقية من لوحة الطالب" })))));

    // 3) المزايا
    page.appendChild(h("section", { class: "lp-sec", id: "lp-features", "aria-labelledby": "lp-features-title" },
      h("div", { class: "lp-wrap" },
        h("div", { class: "lp-sec-head" },
          h("h2", { id: "lp-features-title", text: "كل ما تحتاجه للمادة في مكان واحد" }),
          h("p", { text: "محتوى مرتّب وفق الخطة الفصلية 2026–2027، وأدوات تدريب تساعدك على الفهم لا الحفظ فقط." })),
        h("div", { class: "lp-cards" }, FEATURES.map(f =>
          h("article", { class: "lp-card" },
            h("span", { class: "lp-card-ico" }, icon(f.icon)),
            h("h3", { text: f.title }),
            h("p", { text: f.text })))))));

    // 4) كيف تعمل
    page.appendChild(h("section", { class: "lp-sec lp-sec-soft", id: "lp-how", "aria-labelledby": "lp-how-title" },
      h("div", { class: "lp-wrap" },
        h("div", { class: "lp-sec-head" }, h("h2", { id: "lp-how-title", text: "كيف تبدأ؟ ثلاث خطوات" })),
        h("ol", { class: "lp-steps" }, STEPS.map((s, i) =>
          h("li", { class: "lp-step" },
            h("span", { class: "lp-step-num", "aria-hidden": "true", text: String(i + 1) }),
            h("h3", { text: s.title }),
            h("p", { text: s.text })))),
        h("div", { class: "lp-center" }, ctaSignup("أنشئ حسابك الآن")))));

    // 5) لقطات من داخل المنصة
    page.appendChild(h("section", { class: "lp-sec", id: "lp-shots", "aria-labelledby": "lp-shots-title" },
      h("div", { class: "lp-wrap" },
        h("div", { class: "lp-sec-head" },
          h("h2", { id: "lp-shots-title", text: "نظرة من داخل المنصة" }),
          h("p", { text: "لقطات حقيقية من الواجهة التي ستستخدمها بعد التسجيل." })),
        h("div", { class: "lp-shots" }, SHOTS.map(s =>
          h("figure", { class: "lp-shot" },
            h("img", { src: s.src, alt: s.alt, width: "1280", height: "800", loading: "lazy", decoding: "async" }),
            h("figcaption", { text: s.caption })))))));

    // لأولياء الأمور
    page.appendChild(h("section", { class: "lp-sec lp-sec-soft", "aria-labelledby": "lp-parents-title" },
      h("div", { class: "lp-wrap lp-parents" },
        h("span", { class: "lp-card-ico lp-parents-ico" }, icon("shield")),
        h("div", {},
          h("h2", { id: "lp-parents-title", text: "لأولياء الأمور" }),
          h("p", { text: "المحتوى من إعداد معلم المادة عبدالله البرغوثي، ومرتّب وفق الخطة الفصلية. لكل طالب حسابه الخاص، وبياناته لا يراها غيره، ولا يُطلب أي دفع أو بيانات بنكية في هذه المرحلة." })))));

    // 6) الأسئلة الشائعة
    const wa = whatsappLink();
    page.appendChild(h("section", { class: "lp-sec", id: "lp-faq", "aria-labelledby": "lp-faq-title" },
      h("div", { class: "lp-wrap lp-faq-wrap" },
        h("div", { class: "lp-sec-head" }, h("h2", { id: "lp-faq-title", text: "الأسئلة الشائعة" })),
        h("div", { class: "lp-faq" }, FAQ.map(f =>
          h("details", { class: "lp-faq-item" }, h("summary", { text: f.q }), h("p", { text: f.a })))))));

    // 7) الدعوة الختامية
    page.appendChild(h("section", { class: "lp-final", "aria-labelledby": "lp-final-title" },
      h("div", { class: "lp-wrap lp-final-in" },
        h("h2", { id: "lp-final-title", text: "ابدأ الاستعداد اليوم" }),
        h("p", { text: "أنشئ حسابك المجاني في أقل من دقيقة، وابدأ من الدرس الأول." }),
        h("div", { class: "lp-hero-cta lp-center" }, ctaSignup("أنشئ حسابك مجانًا", "lp-btn-light"), ctaLogin("تسجيل الدخول", "lp-btn-outline-light")))));

    // 8) التذييل
    page.appendChild(h("footer", { class: "lp-foot" },
      h("div", { class: "lp-wrap lp-foot-in" },
        h("div", { class: "lp-foot-col" },
          h("div", { class: "lp-brand" }, h("span", { class: "lp-brand-name", text: "تمكّن" })),
          h("p", { text: "اللغة العربية — الصف الثاني عشر العلمي · إعداد المعلم عبدالله البرغوثي" })),
        h("div", { class: "lp-foot-col" },
          h("h3", { text: "تواصل ومساعدة" }),
          wa ? h("a", { class: "lp-foot-link", href: wa, target: "_blank", rel: "noopener", text: "واتساب المعلم" }) : null,
          h("button", { type: "button", class: "lp-foot-link", onclick: scrollTo("lp-faq"), text: "الأسئلة الشائعة" }),
          h("button", { type: "button", class: "lp-foot-link", onclick: login, text: "تسجيل الدخول" })),
        h("div", { class: "lp-foot-col" },
          h("h3", { text: "السياسات" }),
          h("span", { class: "lp-foot-soon", text: "سياسة الخصوصية — قريبًا" }),
          h("span", { class: "lp-foot-soon", text: "الشروط والأحكام — قريبًا" }))),
      h("p", { class: "lp-copy", text: "© 2026 تمكّن" })));

    container.appendChild(page);
  }

  return { render };
})();
