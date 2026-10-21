/* ==========================================================================
   question-audit.js — طبقة تدقيق منطقي مستقلة لبنك الأسئلة (845 سؤال)
   ==========================================================================
   قواعد صارمة (لا يُخالفها هذا الملف أبدًا):
   - لا يُعدّل أي سؤال. لا يغيّر نص سؤال. لا يغيّر إجابة. لا يحذف سؤالًا.
   - لا يعيد صياغة أي سؤال وزاري. لا يفترض أن إجابة معينة صحيحة من نفسه.
   - فقط يقرأ ويحلّل ويُصنّف كل سؤال إلى حالة تُعرَض على المعلم للمراجعة
     البشرية: 🟢 متوافق / 🟠 يحتاج مراجعة / 🔴 خطأ واضح — مع سبب واضح لكل حالة.
   - لا يعمل تلقائيًا عند أي زيارة عادية للطالب: لا يوجد هنا أي استدعاء
     ذاتي لـ runFullAudit(). يُشغَّل فقط يدويًا من واجهة وضع المعلم
     (question-audit-ui.js)، ثم تُحفظ نتيجته في تخزين محلي منفصل تمامًا
     (مفتاح خاص لا يتقاطع مع progress.js أو questions-bank.js) ليُعاد
     عرضه فورًا في الزيارات التالية دون إعادة تحليل الـ845 سؤالًا من جديد.
   - يعتمد فقط على القراءة من window.QUESTIONS_BANK (لا يُعدّله ولا ينسخه
     بشكل يُغيّر ترتيبه أو محتواه).
   ========================================================================== */

const QuestionAudit = (function () {
  const STORAGE_KEY = "arabic12_bank_audit_v1";

  function allQuestions() {
    return (typeof QUESTIONS_BANK !== "undefined" && QUESTIONS_BANK.questions) ? QUESTIONS_BANK.questions : [];
  }

  // ------------------------------------------------------------------
  // كل ما يلي هو كشف بالكلمات المفتاحية (Heuristic) بهدف واحد فقط:
  // "الإشارة إلى ما يستحق مراجعة بشرية" — وليس حكمًا نهائيًا على صحة
  // أي سؤال أو إجابة. لا نفترض هنا أن أي إجابة معينة صحيحة أو خاطئة.
  // ------------------------------------------------------------------
  const QUESTION_TYPE_HINTS = {
    hadith: ["الحديث الشريف", "حديث النبي", "حديث شريف", "قال رسول الله", "صلى الله عليه وسلم", /(^|\s)الحديث(\s|$)/],
    quran: ["الآية الكريمة", "القرآن الكريم", "قوله تعالى", "السورة", /(^|\s)الآية(\s|$)/],
    poetry: ["البيت الشعري", "البيت التالي", "الأبيات", "الشاعر", "القصيدة"],
    meaning: ["معنى كلمة", "المعنى المناسب", "معنى العبارة", "مرادف", /(^|\s)معنى(\s|$)/],
    grammarRule: ["الإعراب الصحيح", "علامة إعراب", "القاعدة النحوية", "متعلق ب"],
    rhetorical: ["الصورة البيانية", "المحسن البديعي", "الأسلوب البلاغي", "نوع الاستعارة", "نوع التشبيه", "نوع الكناية"]
  };

  const CHOICE_TYPE_SIGNS = {
    quran: [/[﴿﴾]/, "سبحانه وتعالى"],
    hadith: ["صلى الله عليه وسلم", "رواه البخاري", "رواه مسلم", /رواه\s+\S+/]
  };

  function textMatchesHints(text, hints) {
    if (!text) return false;
    return hints.some(h => (h instanceof RegExp) ? h.test(text) : text.includes(h));
  }

  function detectQuestionTypeHints(q) {
    const hay = [q.question, q.context].filter(Boolean).join(" \n ");
    return Object.entries(QUESTION_TYPE_HINTS).filter(([, hints]) => textMatchesHints(hay, hints)).map(([k]) => k);
  }

  function detectChoiceTypeSigns(choiceText) {
    return Object.entries(CHOICE_TYPE_SIGNS).filter(([, hints]) => textMatchesHints(choiceText, hints)).map(([k]) => k);
  }

  // ------------------------------------------------------------------
  // فحص 1: تعارض نوع محتوى السؤال مع نوع محتوى الخيارات
  // (المثال المذكور: سؤال يطلب حديثًا والخيارات آيات قرآنية)
  // ------------------------------------------------------------------
  function checkTypeContentMismatch(q, reasons) {
    if (q.questionType !== "mcq" || !Array.isArray(q.choices) || !q.choices.length) return;
    const qHints = detectQuestionTypeHints(q);
    if (!qHints.length) return;
    const choiceSigns = q.choices.map(detectChoiceTypeSigns);
    if (!choiceSigns.some(s => s.length)) return;

    if (qHints.includes("hadith")) {
      const quranish = choiceSigns.filter(s => s.includes("quran") && !s.includes("hadith")).length;
      if (quranish >= Math.ceil(q.choices.length / 2)) {
        reasons.push({
          severity: "خطأ واضح", code: "type-content-mismatch",
          message: `عدم توافق نوع المحتوى: يبدو أن السؤال يطلب حديثًا نبويًا، بينما ${quranish} من خياراته تحمل علامات آية قرآنية (﴿ ﴾).`,
          suggestedAction: "مراجعة بشرية لمطابقة نوع الخيارات مع نوع السؤال."
        });
      }
    }
    if (qHints.includes("quran")) {
      const hadithish = choiceSigns.filter(s => s.includes("hadith") && !s.includes("quran")).length;
      if (hadithish >= Math.ceil(q.choices.length / 2)) {
        reasons.push({
          severity: "خطأ واضح", code: "type-content-mismatch",
          message: `عدم توافق نوع المحتوى: يبدو أن السؤال يطلب آية قرآنية، بينما ${hadithish} من خياراته تحمل علامات حديث نبوي (رواه/صلى الله عليه وسلم).`,
          suggestedAction: "مراجعة بشرية لمطابقة نوع الخيارات مع نوع السؤال."
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // فحص 2: مشاكل الخيارات/الإجابة (بلا إجابة صحيحة صالحة، تكرار خيارات،
  // إجابة قصيرة بلا نموذج، اختيار من متعدد مُصنَّف خطأً كإجابة قصيرة)
  // ------------------------------------------------------------------
  function normalizeChoice(s) { return (s || "").toString().trim().replace(/\s+/g, " "); }

  function checkAnswerOptions(q, reasons) {
    if (q.questionType === "mcq") {
      const choices = Array.isArray(q.choices) ? q.choices : [];
      if (choices.length < 2) {
        reasons.push({
          severity: "خطأ واضح", code: "insufficient-choices",
          message: `عدد خيارات غير كافٍ (${choices.length}) لسؤال اختيار من متعدد.`,
          suggestedAction: "مراجعة بشرية لاستكمال الخيارات من المصدر الأصلي."
        });
      }
      const ca = q.correctAnswer;
      if (typeof ca !== "number" || ca < 0 || ca >= choices.length) {
        reasons.push({
          severity: "خطأ واضح", code: "no-valid-correct-answer",
          message: `لا توجد إجابة صحيحة محدَّدة بشكل صالح ضمن الخيارات (correctAnswer = ${JSON.stringify(ca)}).`,
          suggestedAction: "مراجعة بشرية لتحديد الإجابة الصحيحة من المصدر — لا يجوز للنظام تخمينها."
        });
      }
      const seen = new Map();
      choices.forEach((c, i) => {
        const norm = normalizeChoice(c);
        if (!norm) return;
        if (seen.has(norm)) {
          reasons.push({
            severity: "يحتاج مراجعة", code: "duplicate-choices",
            message: `خياران متطابقان نصيًا على الأقل: «${c}» (في الموضعين ${seen.get(norm) + 1} و${i + 1}).`,
            suggestedAction: "مراجعة بشرية للتأكد من أن الخيارين مختلفان فعليًا في المصدر."
          });
        } else {
          seen.set(norm, i);
        }
      });
    } else if (q.questionType === "short_answer") {
      const hasModel = typeof q.correctAnswer === "string" && q.correctAnswer.trim();
      if (!hasModel && !q.needsAnswerReview) {
        reasons.push({
          severity: "يحتاج مراجعة", code: "missing-model-answer",
          message: "سؤال إجابة قصيرة بلا نموذج إجابة موثّق من المصدر.",
          suggestedAction: "مراجعة بشرية لإضافة نموذج إجابة إن توفّر في المصدر الأصلي."
        });
      }
      const qt = q.question || "";
      const looksLikeEmbeddedMcq = /[أب]\s*[)\.:]/.test(qt) && /ج\s*[)\.:]/.test(qt);
      if (looksLikeEmbeddedMcq) {
        reasons.push({
          severity: "خطأ واضح", code: "mcq-embedded-in-short-answer",
          message: "يبدو أن نص السؤال يحتوي على خيارات مرقّمة (أ/ب/ج...) مضمَّنة داخله، بينما صُنِّف السؤال كـ«إجابة قصيرة» — احتمال أن نوع السؤال (questionType) غير دقيق.",
          suggestedAction: "مراجعة بشرية لتصنيف نوع السؤال (mcq أم short_answer) دون أي تعديل آلي."
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // فحص 3: مشاكل صياغة السؤال (نص مقطوع، مرجع معلَّق بلا سياق،
  // اعتماد على نص/أبيات سابقة غير مرفقة، آثار نسخ واضحة)
  // ------------------------------------------------------------------
  const DANGLING_DEMONSTRATIVES = ["هذا", "هذه", "هذان", "هاتان", "ذلك", "تلك", "هؤلاء"];
  const PRIOR_TEXT_REFERENCES = ["النص السابق", "القطعة السابقة", "الأبيات السابقة", "البيت السابق", "الفقرة السابقة", "القصيدة السابقة", "ما سبق"];

  function checkPhrasing(q, reasons) {
    const text = (q.question || "").trim();
    if (!text) {
      reasons.push({ severity: "خطأ واضح", code: "empty-question-text", message: "نص السؤال فارغ تمامًا.", suggestedAction: "مراجعة بشرية عاجلة." });
      return;
    }
    if (text.length < 8) {
      reasons.push({
        severity: "خطأ واضح", code: "too-short",
        message: `نص السؤال قصير جدًا (${text.length} حرفًا فقط) — قد يكون مقطوعًا أو غير مكتمل.`,
        suggestedAction: "مراجعة بشرية لاستكمال النص من المصدر."
      });
    }
    // ملاحظة: استُبعدت هنا عمدًا حالة "ينتهي النص بنقاط (...)" من هذا الفحص —
    // فحص فعلي على بيانات البنك الحقيقية أظهر أنها بالكامل فراغات إجابة
    // نمطية (مثل "الأسلوب الخبري: .........") لا نصوصًا مقطوعة، وإبقاء هذا
    // الشرط كان يُنتج إنذارات كاذبة على نحو 380 سؤالًا من 845 — وهو ضرر أكبر
    // من فائدته. نعتمد فقط على أنماط أوضح: فاصلة أو كلمة وصل معلّقة في آخر النص.
    if (/،\s*$/.test(text) || /(\s|^)(و|أن|التي|الذي|كما)\s*$/.test(text)) {
      reasons.push({
        severity: "يحتاج مراجعة", code: "possibly-truncated",
        message: "نص السؤال ينتهي بفاصلة أو كلمة وصل معلّقة قد تشير إلى جملة غير مكتملة.",
        suggestedAction: "مراجعة بشرية للتأكد من اكتمال النص في المصدر."
      });
    }
    const leadSlice = text.slice(0, 14);
    const startsWithDangling = DANGLING_DEMONSTRATIVES.some(w => leadSlice.includes(w));
    if (startsWithDangling && !q.context) {
      reasons.push({
        severity: "يحتاج مراجعة", code: "dangling-reference",
        message: "السؤال يبدأ بإشارة (مثل «هذا/هذه/ذلك») دون سياق (context) مرفق يوضّح المرجع.",
        suggestedAction: "مراجعة بشرية للتأكد من وجود مرجع واضح أو ضرورة إرفاق سياق."
      });
    }
    const needsPriorText = PRIOR_TEXT_REFERENCES.some(w => text.includes(w));
    if (needsPriorText && !q.context) {
      reasons.push({
        severity: "خطأ واضح", code: "missing-referenced-text",
        message: "السؤال يشير إلى نص/أبيات سابقة (مثل «النص السابق» أو «الأبيات السابقة») لكن لا يوجد سياق (context) مرفق بها.",
        suggestedAction: "مراجعة بشرية لإرفاق النص المرجعي من المصدر الأصلي."
      });
    }
    if (/(\S+)\s+\1(\s|$)/.test(text)) {
      reasons.push({
        severity: "يحتاج مراجعة", code: "repeated-word",
        message: "يوجد تكرار مباشر لكلمة واحدة في نص السؤال — قد يكون خطأ نسخ من المصدر.",
        suggestedAction: "مراجعة بشرية للتأكد من سلامة النص."
      });
    }
    if (/[�]|\{\{|\}\}|\[\s*\]/.test(text)) {
      reasons.push({
        severity: "خطأ واضح", code: "artifact-characters",
        message: "يحتوي نص السؤال على رموز أو أقواس تبدو أثرًا من استخراج/نسخ آلي (مثل [] أو {{ }} أو محارف غير صالحة).",
        suggestedAction: "مراجعة بشرية لتنقية النص من آثار الاستخراج."
      });
    }
  }

  // ------------------------------------------------------------------
  // فحص 4: عدم تطابق التصنيف الفرعي (Category/Topic mismatch)
  // ------------------------------------------------------------------
  // ملاحظة مهمة عن التصميم: تجربة أولى اعتمدت "غياب كلمة من اسم الموضوع
  // الفرعي نفسه" كإشارة على عدم التطابق، فتبيّن أنها تُطلق إنذارات على
  // نحو 87% من الأسئلة (لأن أسماء الموضوعات النحوية/البلاغية نادرًا ما
  // تتكرر حرفيًا داخل نص سؤال يطبّق القاعدة لا يسمّيها) — وهذا أسوأ من
  // عدم وجود الفحص أصلًا لأنه يُغرق المعلم بإنذارات كاذبة ويُفقِد الأداة
  // مصداقيتها. البديل المعتمد هنا أدق: نبني — من بيانات البنك نفسها
  // فقط، دون أي قائمة كلمات مُخترَعة يدويًا — فهرس "الكلمات المميّزة"
  // لكل موضوع فرعي داخل فئته (كلمات في اسمه لا تتشاركها الموضوعات
  // الفرعية الأخرى في نفس الفئة). لا نُصعِّد الحالة إلى 🔴 في هذا الفحص
  // أبدًا؛ فقط 🟠 بصياغة صريحة تُقرّ بأنها "إشارة غير مؤكدة".
  // ------------------------------------------------------------------
  const ARABIC_STOPWORDS = new Set([
    "في", "من", "إلى", "على", "عن", "أو", "ما", "لا", "إن", "بين", "مع", "كل", "غير",
    "هذا", "هذه", "ذلك", "نوع", "حدد", "اذكر", "الذي", "التي"
  ]);
  const TOPIC_MISMATCH_MIN_LEN = 3;

  function stripDiacritics(s) { return (s || "").replace(/[ً-ٰٟ]/g, ""); }
  function normalizeArabicLoose(s) {
    return stripDiacritics(s || "").replace(/[إأآا]/g, "ا").replace(/[ىي]/g, "ي").replace(/ة/g, "ه");
  }
  function stripDefiniteArticle(w) { return w.replace(/^(وال|فال|بال|كال|ال)/, ""); }
  function tokenize(text) {
    return normalizeArabicLoose(text)
      .split(/[^؀-ۿ]+/)
      .map(stripDefiniteArticle)
      .filter(w => w.length >= TOPIC_MISMATCH_MIN_LEN && !ARABIC_STOPWORDS.has(w));
  }
  function subcategoryKeywords(subcategory) { return tokenize(subcategory); }

  // يُبنى مرة واحدة فقط في بداية كل تشغيل تدقيق كامل (لا يُعاد بناؤه لكل
  // سؤال على حدة) اعتمادًا فقط على قائمة الفئات/الموضوعات الفعلية
  // الموجودة في window.QUESTIONS_BANK.
  function buildTopicIndex(list) {
    const byCategory = {};
    list.forEach(q => {
      if (!q.category || !q.subcategory) return;
      (byCategory[q.category] = byCategory[q.category] || new Set()).add(q.subcategory);
    });
    const exclusiveKeywords = {};
    Object.entries(byCategory).forEach(([cat, subsSet]) => {
      const subs = [...subsSet];
      const kwMap = {};
      subs.forEach(s => { kwMap[s] = new Set(subcategoryKeywords(s)); });
      exclusiveKeywords[cat] = {};
      subs.forEach(s => {
        const others = new Set();
        subs.filter(s2 => s2 !== s).forEach(s2 => kwMap[s2].forEach(k => others.add(k)));
        exclusiveKeywords[cat][s] = [...kwMap[s]].filter(k => !others.has(k));
      });
    });
    return { byCategory, exclusiveKeywords };
  }

  function checkCategoryTopicMismatch(q, reasons, topicIndex) {
    if (!topicIndex || !q.category || !q.subcategory) return;
    const ownKw = subcategoryKeywords(q.subcategory);
    if (!ownKw.length) return; // لا كلمات مميّزة كافية من اسم الموضوع نفسه لإجراء فحص موثوق
    const hayTokens = new Set(tokenize([q.question, q.context].filter(Boolean).join(" ")));
    const ownPresent = ownKw.some(k => hayTokens.has(k));
    if (ownPresent) return; // كلمة من اسم موضوعه الخاص موجودة فعليًا -> لا اشتباه

    const siblings = [...(topicIndex.byCategory[q.category] || [])].filter(s => s !== q.subcategory);
    const matchedSibling = siblings.find(s2 => {
      const excl = (topicIndex.exclusiveKeywords[q.category] || {})[s2] || [];
      return excl.some(k => hayTokens.has(k));
    });
    if (matchedSibling) {
      reasons.push({
        severity: "يحتاج مراجعة", code: "topic-mismatch-heuristic",
        message: `إشارة غير مؤكدة لعدم تطابق التصنيف: لم يظهر في نص السؤال أي كلمة من عنوان موضوعه الفرعي «${q.subcategory}»، بينما ظهرت كلمة مميِّزة لموضوع آخر ضمن نفس الفئة («${matchedSibling}»). قد يكون هذا طبيعيًا (تداخل مشروع بين موضوعين)، وقد يكون تصنيفًا غير دقيق.`,
        suggestedAction: "مراجعة بشرية لتأكيد صحة تصنيف هذا السؤال ضمن هذا الموضوع الفرعي — هذه إشارة احتمالية فقط وليست جزمًا."
      });
    }
  }

  // ------------------------------------------------------------------
  // تجميع النتيجة النهائية لسؤال واحد
  // ------------------------------------------------------------------
  function auditQuestion(q, topicIndex) {
    const reasons = [];
    checkAnswerOptions(q, reasons);
    checkPhrasing(q, reasons);
    checkTypeContentMismatch(q, reasons);
    checkCategoryTopicMismatch(q, reasons, topicIndex);
    if (q.needsAnswerReview) {
      reasons.push({
        severity: "يحتاج مراجعة", code: "flagged-at-extraction",
        message: "هذا السؤال موسوم مسبقًا (من مرحلة استخراج البيانات) بأنه بحاجة لمراجعة المعلم.",
        suggestedAction: "مراجعة بشرية — هذه العلامة موجودة أصلًا في بيانات المصدر ولم يُنشئها المدقق."
      });
    }
    const hasRed = reasons.some(r => r.severity === "خطأ واضح");
    const hasAmber = reasons.some(r => r.severity === "يحتاج مراجعة");
    const status = hasRed ? "🔴" : (hasAmber ? "🟠" : "🟢");
    const statusLabel = hasRed ? "خطأ واضح" : (hasAmber ? "يحتاج مراجعة" : "متوافق");
    return {
      id: q.id, status, statusLabel,
      category: q.category, subcategory: q.subcategory,
      source: q.source, sourcePage: q.sourcePage, questionType: q.questionType,
      questionExcerpt: (q.question || "").slice(0, 140),
      reasons
    };
  }

  // ------------------------------------------------------------------
  // تشغيل التدقيق الكامل — يُستدعى فقط يدويًا من واجهة وضع المعلم،
  // ولا يُستدعى تلقائيًا من أي مكان آخر في الموقع.
  // ------------------------------------------------------------------
  function runFullAudit() {
    const list = allQuestions();
    const topicIndex = buildTopicIndex(list); // يُبنى مرة واحدة فقط لكل التشغيل، لا لكل سؤال
    const results = list.map(q => auditQuestion(q, topicIndex));
    const summary = {
      total: results.length,
      green: results.filter(r => r.status === "🟢").length,
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
    catch (e) { console.warn("QuestionAudit: تعذّر حفظ نتائج التدقيق.", e); }
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
