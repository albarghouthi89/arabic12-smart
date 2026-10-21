/* ==========================================================================
   content-protection.js — طبقة حماية المحتوى (إضافة جديدة — المرحلة الثالثة)
   ==========================================================================
   الهدف الصادق والمُقيَّد لهذا الملف: تقليل سهولة النسخ العرضي/المشاركة
   السريعة للمحتوى التعليمي، وربط أي نسخة مرئية منه بعلامة مائية خاصة
   بالمستخدم — وليس منع الاستخراج المتعمّد. **لا يوجد هنا أي كود يزعم أنه
   يمنع لقطة الشاشة، أو يمنع الوصول إلى الكود المصدري، أو يمنع مستخدمًا
   متمرّسًا من نسخ المحتوى بطريقة أو بأخرى** — أي جافاسكربت يعمل في متصفح
   عادي لا يستطيع ضمان ذلك فعليًا على كل الأجهزة، ولا نكتب هنا ما يخالف هذه
   الحقيقة.

   ما يفعله هذا الملف فعليًا (وفقط):
   1) تعطيل النسخ (Ctrl/Cmd+C وحدث copy) والقائمة السياقية (كليك يمين) وتحديد
      النص داخل مناطق المحتوى التعليمي (.protect-content) — باستثناء صريح
      لأي حقل كتابة/إجابة (input/textarea/contenteditable) حتى لو كان داخل
      تلك المنطقة، لضمان عدم إعاقة كتابة الطالب أو تحديده لنص إجابته الخاصة.
   2) تعطيل اللصق (paste) خارج حقول الإجابة فقط — يبقى اللصق داخل حقل إجابة
      الطالب يعمل بشكل طبيعي دائمًا.
   3) محاولة تعطيل الطباعة (Ctrl/Cmd+P) + CSS طباعة يستبدل المحتوى برسالة
      واضحة عند الطباعة الفعلية (راجع content-protection.css).
   4) تعطيل اختصارات شائعة (Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12, Ctrl+Shift+J,
      Ctrl+Shift+C) كمثبِّطات بسيطة لا كحماية فعلية — أي متصفح يسمح بتعطيل
      قائمة "عرض الصفحة" الكاملة من إعداداته، وأدوات المطوّر يمكن فتحها
      بطرق أخرى؛ هذا الكود لا يضمن منعها.
   5) علامة مائية خفيفة جدًا وغير متحركة، لا تُغطّي أبدًا السؤال أو الإجابة
      (opacity منخفضة جدًا + pointer-events: none)، مرتبطة بمعرّف صامت خاص
      بهذا المتصفح/الجهاز (وباسم الطالب إن أدخله)، لتقليل مشاركة لقطات
      الشاشة دون التأثير على القراءة.
   لا شيء هنا يعطّل الكتابة، أو التنقل، أو استخدام الهاتف، أو لوحة المفاتيح
   في حقول الإجابة، أو الوصول الطبيعي للأسئلة — وأي سؤال بحاجة مراجعة يبقى
   ظاهرًا بالكامل لوضع المعلم (window.TEACHER_MODE) دون أي حجب.
   ========================================================================== */

(function () {
  const STUDENT_NAME_KEY = "arabic12_student_display_name";
  const ANON_ID_KEY = "arabic12_watermark_anon_id";

  function isEditableTarget(node) {
    let el = node;
    while (el && el !== document.body) {
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }
  function isInsideProtected(node) {
    let el = node;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains("protect-content")) return true;
      el = el.parentElement;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // 1) النسخ + القائمة السياقية + التحديد (التحديد مُعطَّل أصلًا عبر CSS؛
  //    هنا فقط حدث copy/contextmenu الفعلي كطبقة إضافية)
  // ------------------------------------------------------------------
  document.addEventListener("copy", (e) => {
    if (isInsideProtected(e.target) && !isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });
  document.addEventListener("contextmenu", (e) => {
    if (isInsideProtected(e.target) && !isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  // ------------------------------------------------------------------
  // 2) اللصق — يبقى مسموحًا دائمًا داخل حقول الإجابة الخاصة بالطالب فقط
  // ------------------------------------------------------------------
  document.addEventListener("paste", (e) => {
    if (isInsideProtected(e.target) && !isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  // ------------------------------------------------------------------
  // 3+4) اختصارات لوحة المفاتيح — مثبِّطات فقط، لا حماية فعلية مضمونة
  // ------------------------------------------------------------------
  document.addEventListener("keydown", (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd+P — طباعة
    if (ctrlOrCmd && (e.key === "p" || e.key === "P")) { e.preventDefault(); return; }

    // اختصارات لا علاقة لها أبدًا بأي حقل إجابة — تُعطَّل دائمًا
    if (ctrlOrCmd && (e.key === "s" || e.key === "S")) { e.preventDefault(); return; } // حفظ الصفحة
    if (ctrlOrCmd && (e.key === "u" || e.key === "U")) { e.preventDefault(); return; } // عرض المصدر
    if (e.key === "F12") { e.preventDefault(); return; }
    if (ctrlOrCmd && e.shiftKey && ["i", "I", "j", "J", "c", "C"].includes(e.key)) { e.preventDefault(); return; }

    // Ctrl/Cmd+C — فقط إن لم يكن التركيز داخل حقل إجابة الطالب
    if (ctrlOrCmd && (e.key === "c" || e.key === "C") && !isEditableTarget(e.target)) {
      e.preventDefault();
    }
  });

  // محاولة إضافية عبر beforeprint (طبقة أمان ثانية بجانب Ctrl+P وCSS الطباعة
  // في content-protection.css — لا تضمن شيئًا بمفردها أيضًا، فالمتصفح قد
  // يستدعي beforeprint دون أي سبيل حقيقي لإيقاف الطباعة من الجافاسكربت).
  window.addEventListener("beforeprint", () => {
    console.info("منصة الطالب الذكي: تنبيه طباعة — المحتوى التعليمي مُهيَّأ ليُستبدل برسالة عند الطباعة الفعلية.");
  });

  // ------------------------------------------------------------------
  // 5) العلامة المائية — خفيفة جدًا، لا تُغطّي أي سؤال أو إجابة أبدًا
  // ------------------------------------------------------------------
  function getWatermarkText() {
    let name = null;
    try { name = localStorage.getItem(STUDENT_NAME_KEY); } catch (e) { /* ignore */ }
    if (name && name.trim()) return `الطالب: ${name.trim()} — منصة الطالب الذكي`;

    let anonId = null;
    try {
      anonId = localStorage.getItem(ANON_ID_KEY);
      if (!anonId) {
        anonId = Math.random().toString(36).slice(2, 8).toUpperCase();
        localStorage.setItem(ANON_ID_KEY, anonId);
      }
    } catch (e) { anonId = "غير معروف"; }
    return `معرّف الجهاز: ${anonId} — منصة الطالب الذكي`;
  }

  function buildWatermarkSvgDataUri(text) {
    const safe = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="200">` +
      `<text x="10" y="60" transform="rotate(-28 130 100)" font-size="13" font-family="Tajawal, Arial, sans-serif" fill="#000000" text-anchor="start">${safe}</text>` +
      `</svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function applyWatermark() {
    const layer = document.getElementById("content-watermark-layer");
    if (!layer) return;
    const text = getWatermarkText();
    layer.style.backgroundImage = `url("${buildWatermarkSvgDataUri(text)}")`;
  }

  // يسمح لصفحة "حسابي" (عند تفعيل الطبقة التجارية لاحقًا فقط) بضبط اسم
  // الطالب الحقيقي في العلامة المائية دون أي تعديل على هذا الملف نفسه.
  window.ContentProtection = {
    setStudentDisplayName(name) {
      try { localStorage.setItem(STUDENT_NAME_KEY, name || ""); } catch (e) { /* ignore */ }
      applyWatermark();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyWatermark);
  } else {
    applyWatermark();
  }
})();
