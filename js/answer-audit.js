/* ==========================================================================
   answer-audit.js — أداة "Answer Audit": تدقيق جودة الإجابات المُضافة لبنك
   الأسئلة (845 سؤال)، مستقلة تمامًا عن QuestionAudit (question-audit.js).
   ==========================================================================
   الفرق عن QuestionAudit: ذاك يفحص تناسق/صياغة السؤال نفسه (نوع محتواه مقابل
   خياراته، نص مقطوع، تصنيف...). هذا الملف يفحص فقط جودة الإجابة المُضافة:
   - سؤال بلا إجابة رغم عدم تصنيفه "بحاجة مراجعة".
   - سؤال له أكثر من إجابة محتملة (تغيّرت الإجابة أكثر من مرة في answerHistory).
   - إجابة لا تُناسب نوع السؤال (مثل نص لسؤال mcq بدل رقم فهرس).
   - إجابة ضعيفة (قصيرة جدًا قياسًا بما يتطلبه نوع السؤال).
   - إجابة قد لا تطابق مضمون السؤال (تقاطع كلمات ضعيف جدًا — إشارة لا حكم).
   - سؤال بحاجة مراجعة المعلم (needsAnswerReview=true).
   - سؤال إنشائي بلا Rubric تقييم.
   - إجابة مكررة حرفيًا مع سؤال آخر مختلف المحتوى.
   - تعليل/تسبيب غير منطقي (يكرر نص السؤال حرفيًا، أو متناقض مع الإجابة).

   قواعد صارمة (كما في question-audit.js):
   - لا يُعدّل أي سؤال أو إجابة أو يحذف أي شيء أبدًا — قراءة وتحليل فقط.
   - لا يعمل تلقائيًا عند زيارة الطالب — يُشغَّل يدويًا من وضع المعلم فقط
     (answer-audit-ui.js)، ونتائجه تُحفظ في مفتاح تخزين محلي خاص منفصل تمامًا
     عن كل من question-audit.js و progress.js و questions-bank.js.
   - كل إشارة هنا احتمالية/إرشادية موجَّهة للمعلم؛ لا حكم نهائي آلي على صحة
     أي إجابة.
   ========================================================================== */

const AnswerAudit = (function () {
  const STORAGE_KEY = "arabic12_bank_answer_audit_v1";

  function allQuestions() {
    return (typeof QUESTIONS_BANK !== "undefined" && QUESTIONS_BANK.questions) ? QUESTIONS_BANK.questions : [];
  }

  const ARABIC_STOPWORDS = new Set([
    "في", "من", "إلى", "على", "عن", "أو", "ما", "لا", "إن", "بين", "مع", "كل", "غير",
    "هذا", "هذه", "ذلك", "التي", "الذي", "التالية", "الآتي", "السابق", "السابقة"
  ]);
  function stripDiacritics(s) { return (s || "").replace(/[ً-ٰٟ]/g, ""); }
  function normalizeArabicLoose(s) {
    return stripDiacritics(s || "").replace(/[إأآا]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ه");
  }
  function tokenize(text) {
    return normalizeArabicLoose(text)
      .split(/[^؀-ۿ]+/)
      .map(w => w.replace(/^(وال|فال|بال|كال|ال)/, ""))
      .filter(w => w.length >= 3 && !ARABIC_STOPWORDS.has(w));
  }
  function normText(s) { return (s || "").toString().trim().replace(/\s+/g, " "); }

  // ------------------------------------------------------------------
  // 1) سؤال بلا إجابة رغم عدم تصنيفه "بحاجة مراجعة" — شبكة أمان: يجب أن
  //    تكون هذه الحالة صفرًا دائمًا إن التزم أي دمج مستقبلي بالسياسة
  //    المعتمدة، لكنها هنا كفحص دائم يكشف أي انحراف لاحق عن السياسة.
  // ------------------------------------------------------------------
  function checkNoAnswerContract(q, reasons) {
    if (q.needsAnswerReview) return; // مُصرَّح بغياب الإجابة هنا (فحص 6 يتولاه)
    if (q.questionType === "mcq") {
      if (typeof q.correctAnswer !== "number" || q.correctAnswer < 0 || q.correctAnswer >= (q.choices || []).length) {
        reasons.push({ severity: "خطأ واضح", code: "no-answer-mcq",
          message: "سؤال اختيار من متعدد بلا إجابة صحيحة صالحة رغم عدم تصنيفه كمحتاج مراجعة.",
          suggestedAction: "مراجعة عاجلة — هذا انحراف عن سياسة عدم اختلاق الإجابات." });
      }
    } else if (q.questionType === "short_answer") {
      if (typeof q.correctAnswer !== "string" || !q.correctAnswer.trim()) {
        reasons.push({ severity: "خطأ واضح", code: "no-answer-short",
          message: "سؤال إجابة قصيرة بلا نموذج إجابة رغم عدم تصنيفه كمحتاج مراجعة.",
          suggestedAction: "مراجعة عاجلة — هذا انحراف عن سياسة عدم اختلاق الإجابات." });
      }
    }
  }

  // ------------------------------------------------------------------
  // 2) إجابة لا تناسب نوع السؤال + سؤال إنشائي بلا Rubric
  // ------------------------------------------------------------------
  function checkAnswerFitsType(q, reasons) {
    if (q.questionType === "essay") {
      if (q.correctAnswer !== null && q.correctAnswer !== undefined) {
        reasons.push({ severity: "يحتاج مراجعة", code: "essay-has-single-answer",
          message: "سؤال إنشائي يحمل قيمة في correctAnswer، بينما لا يجوز أن يكون له إجابة نموذجية واحدة بطبيعته.",
          suggestedAction: "مراجعة بشرية — يجب أن يُقيَّم هذا السؤال عبر Rubric لا إجابة واحدة." });
      }
      if (!Array.isArray(q.rubric) || q.rubric.length === 0) {
        reasons.push({ severity: "خطأ واضح", code: "essay-missing-rubric",
          message: "سؤال إنشائي بلا معايير تقييم (Rubric) — الطالب لن يحصل على أي تقييم إرشادي لإجابته.",
          suggestedAction: "بناء Rubric من 9 عناصر لهذا السؤال." });
      }
      return;
    }
    if (q.questionType === "mcq" && q.correctAnswer !== null && q.correctAnswer !== undefined) {
      if (typeof q.correctAnswer !== "number") {
        reasons.push({ severity: "خطأ واضح", code: "type-mismatch-mcq",
          message: `إجابة سؤال الاختيار من متعدد ليست رقم فهرس (النوع الفعلي: ${typeof q.correctAnswer}) — لن تعمل واجهة التصحيح الآلي بشكل صحيح.`,
          suggestedAction: "تحويل الإجابة إلى فهرس صحيح مطابق لأحد الخيارات، أو ترحيلها لمراجعة المعلم." });
      }
    }
    if (q.questionType === "short_answer" && q.correctAnswer !== null && q.correctAnswer !== undefined) {
      if (typeof q.correctAnswer !== "string") {
        reasons.push({ severity: "خطأ واضح", code: "type-mismatch-short",
          message: `إجابة سؤال الإجابة القصيرة ليست نصًا (النوع الفعلي: ${typeof q.correctAnswer}).`,
          suggestedAction: "تحويل الإجابة إلى نموذج نصي، أو ترحيلها لمراجعة المعلم." });
      }
    }
  }

  // ------------------------------------------------------------------
  // 3) سؤال له أكثر من إجابة محتملة عبر الزمن (سجل answerHistory)
  // ------------------------------------------------------------------
  function checkMultiplePossibleAnswers(q, reasons) {
    const hist = Array.isArray(q.answerHistory) ? q.answerHistory : [];
    const changed = hist.filter(h => h.previousAnswer !== null && h.previousAnswer !== undefined &&
      normText(String(h.previousAnswer)) !== normText(String(h.newAnswer)));
    if (changed.length) {
      reasons.push({ severity: "يحتاج مراجعة", code: "multiple-possible-answers",
        message: `هذا السؤال كانت له إجابة سابقة مختلفة تغيّرت ${changed.length} مرة/مرات — قد يعني وجود أكثر من إجابة محتملة أو عدم استقرار في الإجابة.`,
        suggestedAction: "مراجعة بشرية لتأكيد الإجابة الحالية والفصل بين الإجابتين إن اختلفا فعليًا." });
    }
  }

  // ------------------------------------------------------------------
  // 4) إجابة ضعيفة (قصيرة جدًا) قياسًا بنوع السؤال ومتطلباته
  // ------------------------------------------------------------------
  const EXPLANATION_VERBS = ["علّل", "علل", "اشرح", "وضّح", "وضح", "استخرج", "قارن", "بيّن", "بين", "حلّل", "حلل", "اذكر"];
  function checkWeakAnswer(q, reasons) {
    if (q.questionType !== "short_answer") return;
    if (q.needsAnswerReview || typeof q.correctAnswer !== "string") return;
    const ans = q.correctAnswer.trim();
    const qt = q.question || "";
    const looksLikeExplanation = EXPLANATION_VERBS.some(v => qt.includes(v));
    if (looksLikeExplanation && ans.length < 12 && !(Array.isArray(q.acceptedElements) && q.acceptedElements.length)) {
      reasons.push({ severity: "يحتاج مراجعة", code: "weak-answer-too-short",
        message: `الإجابة قصيرة جدًا (${ans.length} حرفًا) لسؤال يبدو أنه يتطلب شرحًا أو تعليلًا («${qt.slice(0, 30)}...»)، ولا توجد عناصر إجابة (acceptedElements) تعوّض ذلك.`,
        suggestedAction: "مراجعة بشرية لتوسيع الإجابة أو إضافة عناصر إجابة أساسية." });
    }
  }

  // ------------------------------------------------------------------
  // 5) إجابة قد لا تطابق مضمون السؤال — تقاطع كلمات ضعيف جدًا (إشارة فقط)
  // ------------------------------------------------------------------
  function checkAnswerQuestionOverlap(q, reasons) {
    if (q.needsAnswerReview) return;
    if (q.questionType !== "short_answer") return;
    if (typeof q.correctAnswer !== "string" || !q.correctAnswer.trim()) return;
    const qTokens = new Set(tokenize([q.question, q.context].filter(Boolean).join(" ")));
    if (qTokens.size < 3) return; // نص قصير جدًا لإجراء فحص موثوق
    const ansText = [q.correctAnswer, q.answerRationale, ...(q.acceptedElements || [])].filter(Boolean).join(" ");
    const ansTokens = new Set(tokenize(ansText));
    if (!ansTokens.size) return;
    let overlap = 0;
    ansTokens.forEach(t => { if (qTokens.has(t)) overlap++; });
    if (overlap === 0) {
      reasons.push({ severity: "يحتاج مراجعة", code: "answer-question-low-overlap",
        message: "لم يُعثر على أي تقاطع كلمات مميّزة بين نص السؤال/سياقه ونص الإجابة/التعليل — إشارة غير مؤكدة على احتمال عدم تطابق الإجابة مع السؤال (قد يكون طبيعيًا في بعض الأسئلة اللغوية المجردة).",
        suggestedAction: "مراجعة بشرية للتأكد من أن الإجابة تخص هذا السؤال بالتحديد." });
    }
  }

  // ------------------------------------------------------------------
  // 6) سؤال بحاجة مراجعة المعلم — إعادة عرض السبب الموجود أصلًا في البيانات
  // ------------------------------------------------------------------
  function checkNeedsTeacherReview(q, reasons) {
    if (q.questionType === "essay") return; // له فحصه الخاص (Rubric) أعلاه
    if (q.needsAnswerReview) {
      reasons.push({ severity: "يحتاج مراجعة", code: "needs-teacher-review",
        message: `سؤال بحاجة لمراجعة المعلم${q.reviewReason ? " — السبب: " + q.reviewReason : "."}`,
        suggestedAction: "مراجعة بشرية لتحديد الإجابة النهائية." });
    }
  }

  // ------------------------------------------------------------------
  // 7) تعليل غير منطقي — يكرر نص السؤال حرفيًا (أثر توليد آلي متعطّل)
  // ------------------------------------------------------------------
  function checkIllogicalRationale(q, reasons) {
    if (!q.answerRationale) return;
    const r = normText(q.answerRationale);
    const qt = normText(q.question);
    if (r.length > 15 && (r === qt || qt.includes(r))) {
      reasons.push({ severity: "خطأ واضح", code: "illogical-rationale-echo",
        message: "التعليل (answerRationale) يكرر نص السؤال حرفيًا أو يكاد — قد يكون هذا أثرًا لخلل في التوليد الآلي لا تعليلًا حقيقيًا.",
        suggestedAction: "مراجعة بشرية لكتابة تعليل حقيقي أو حذف الحقل إن لم يتوفر تعليل فعلي." });
    }
  }

  // ------------------------------------------------------------------
  // 8) إجابة مكررة حرفيًا بين سؤالين مختلفي المحتوى (يُبنى فهرس مرة واحدة)
  // ------------------------------------------------------------------
  function buildDuplicateAnswerIndex(list) {
    const byAnswer = {};
    list.forEach(q => {
      if (q.questionType !== "short_answer") return;
      if (typeof q.correctAnswer !== "string") return;
      const norm = normText(q.correctAnswer);
      if (norm.length < 15) return; // نتجنّب المطابقات التافهة القصيرة
      (byAnswer[norm] = byAnswer[norm] || []).push(q.id);
    });
    const dupSets = {};
    Object.entries(byAnswer).forEach(([norm, ids]) => {
      if (ids.length > 1) ids.forEach(id => { dupSets[id] = ids; });
    });
    return dupSets;
  }
  function checkDuplicateAnswer(q, reasons, dupIndex) {
    const ids = dupIndex[q.id];
    if (ids && ids.length > 1) {
      const others = ids.filter(id => id !== q.id);
      reasons.push({ severity: "يحتاج مراجعة", code: "duplicate-answer",
        message: `نص الإجابة مطابق حرفيًا لإجابة سؤال آخر مختلف (${others.join("، ")}) — تحقق من عدم وقوع خطأ نسخ بين سؤالين مختلفي المحتوى.`,
        suggestedAction: "مراجعة بشرية لتأكيد أن الإجابتين صحيحتان بالفعل لسؤاليهما، أو تصحيح خطأ النسخ." });
    }
  }

  // ------------------------------------------------------------------
  // تجميع النتيجة النهائية لسؤال واحد
  // ------------------------------------------------------------------
  function auditQuestion(q, dupIndex) {
    const reasons = [];
    checkNoAnswerContract(q, reasons);
    checkAnswerFitsType(q, reasons);
    checkMultiplePossibleAnswers(q, reasons);
    checkWeakAnswer(q, reasons);
    checkAnswerQuestionOverlap(q, reasons);
    checkNeedsTeacherReview(q, reasons);
    checkIllogicalRationale(q, reasons);
    checkDuplicateAnswer(q, reasons, dupIndex);

    const hasRed = reasons.some(r => r.severity === "خطأ واضح");
    const hasAmber = reasons.some(r => r.severity === "يحتاج مراجعة");
    const status = hasRed ? "🔴" : (hasAmber ? "🟠" : "🟢");
    const statusLabel = hasRed ? "خطأ واضح" : (hasAmber ? "يحتاج مراجعة" : "سليمة");
    return {
      id: q.id, status, statusLabel,
      category: q.category, subcategory: q.subcategory, questionType: q.questionType,
      answerSource: q.answerSource || null, answerConfidence: q.answerConfidence || null,
      questionExcerpt: (q.question || "").slice(0, 140),
      reasons
    };
  }

  // ------------------------------------------------------------------
  // تشغيل التدقيق الكامل — يدويًا فقط من وضع المعلم (answer-audit-ui.js)
  // ------------------------------------------------------------------
  function runFullAudit() {
    const list = allQuestions();
    const dupIndex = buildDuplicateAnswerIndex(list);
    const results = list.map(q => auditQuestion(q, dupIndex));
    const summary = {
      total: results.length,
      clean: results.filter(r => r.status === "🟢").length,
      amber: results.filter(r => r.status === "🟠").length,
      red: results.filter(r => r.status === "🔴").length,
      generatedAt: new Date().toISOString()
    };
    const payload = { summary, results };
    save(payload);
    return payload;
  }

  function save(payload) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
    catch (e) { console.warn("AnswerAudit: تعذّر حفظ نتائج التدقيق.", e); }
  }
  function loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSaved() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }
  function getResultFor(qid) {
    const saved = loadSaved();
    return saved ? (saved.results.find(r => r.id === qid) || null) : null;
  }

  return { runFullAudit, loadSaved, clearSaved, getResultFor, auditQuestion, STORAGE_KEY };
})();
