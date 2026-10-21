/* ==========================================================================
   questions-bank.js — محرك بنك الأسئلة التجريبية والوزارية (منطق مستقل عن الواجهة)
   يعتمد على window.QUESTIONS_BANK (من questions-bank-data.js) كمصدر بيانات للقراءة فقط،
   ويخزّن كل تقدّم الطالب في بنك الأسئلة تحت مفتاح localStorage منفصل تمامًا
   ("arabic12_bank_v1") حتى لا يتقاطع إطلاقًا مع حالة الدروس في progress.js.
   يتكامل مع نظام Progress/XP الحالي عبر Progress.recordAnswer باستخدام
   "دروس اصطناعية" bank-KGB / bank-READ / bank-LIT / bank-WR فلا حاجة لتعديل progress.js.
   ========================================================================== */

const QuestionBank = (function () {
  const STORAGE_KEY = "arabic12_bank_v1";
  const CATEGORY_KEYS = ["KGB", "READ", "LIT", "WR"];
  const SYNTHETIC_LESSON = { KGB: "bank-KGB", READ: "bank-READ", LIT: "bank-LIT", WR: "bank-WR" };
  const CATEGORY_TO_PROGRESS_SKILL = {
    // تعيين تقريبي إلى مهارات Progress الأربع (فهم/تطبيق/تمييز/تحليل) حتى تتغذّى
    // أنظمة XP/الشارات/الإتقان العامة الموجودة مسبقًا من نشاط بنك الأسئلة أيضًا.
    mcq: "تطبيق",
    short_answer: "فهم",
    essay: "تحليل"
  };

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function daysBetween(a, b) {
    const d1 = new Date(a), d2 = new Date(b);
    return Math.round((d2 - d1) / 86400000);
  }

  function defaultState() {
    return {
      version: 1,
      attempts: {},        // qid -> {count, correctCount, lastCorrect, lastDate, history:[{date,correct}]}
      retrieval: {},        // qid -> {status:'new'|'needs'|'mastered', reps, dueDate, lastSeen}
      bookmarks: [],        // [qid]
      dailyBank: { lastDate: null, history: {} }, // date -> {qid, correct}
      hundredPercent: { recentIds: [] },
      simulations: [],      // [{date, categoryKey, totalQuestions, overall, byTopic:{topic:{correct,total}}, wrongIds:[]}]
      quickReview: { lastDate: null, lastSize: null }
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {
      console.warn("QuestionBank: تعذّر قراءة التخزين المحلي، بدء حالة جديدة.", e);
      return defaultState();
    }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn("QuestionBank: تعذّر الحفظ.", e); }
  }

  let state = load();

  // ------------------------------------------------------------------
  // الوصول إلى البيانات (قراءة فقط)
  // ------------------------------------------------------------------
  function allQuestions() {
    return (typeof QUESTIONS_BANK !== "undefined") ? QUESTIONS_BANK.questions : [];
  }
  function meta() {
    return (typeof QUESTIONS_BANK !== "undefined") ? QUESTIONS_BANK.meta : null;
  }
  function categoryMeta(key) {
    return meta().categories.find(c => c.key === key);
  }
  function byId(qid) {
    return allQuestions().find(q => q.id === qid) || null;
  }
  function byCategory(key) {
    const cm = categoryMeta(key);
    return allQuestions().filter(q => q.category === (cm ? cm.name : key));
  }
  function isAnswerable(q) {
    if (!q) return false;
    if (q.questionType === "mcq") return typeof q.correctAnswer === "number";
    if (q.questionType === "short_answer") return typeof q.correctAnswer === "string" && q.correctAnswer.trim().length > 0;
    return false; // essay: لا إجابة واحدة صحيحة بطبيعته
  }

  // ------------------------------------------------------------------
  // الفلترة والبحث
  // ------------------------------------------------------------------
  function normalizeSearch(s) { return (s || "").trim().replace(/[ً-ْ]/g, ""); } // تجاهل التشكيل

  function filterQuestions(opts) {
    opts = opts || {};
    let list = allQuestions();
    if (opts.categoryKey) {
      const cm = categoryMeta(opts.categoryKey);
      list = list.filter(q => q.category === (cm ? cm.name : opts.categoryKey));
    }
    if (opts.subcategory) list = list.filter(q => q.subcategory === opts.subcategory);
    if (opts.sourceType) list = list.filter(q => q.sourceType === opts.sourceType);
    if (opts.difficulty) list = list.filter(q => q.difficulty === opts.difficulty);
    if (opts.questionType) list = list.filter(q => q.questionType === opts.questionType);
    if (opts.onlyAnswerable) list = list.filter(isAnswerable);
    if (opts.onlyNeedsReview) list = list.filter(q => q.needsAnswerReview);
    if (opts.onlyBookmarked) list = list.filter(q => state.bookmarks.includes(q.id));
    if (opts.onlyWrong) list = list.filter(q => { const a = state.attempts[q.id]; return a && a.lastCorrect === false; });
    if (opts.onlyUnanswered) list = list.filter(q => !state.attempts[q.id]);
    if (opts.search) {
      const term = normalizeSearch(opts.search);
      if (term) {
        list = list.filter(q => {
          const hay = normalizeSearch([q.question, q.context, q.subcategory, q.skill, q.source].filter(Boolean).join(" "));
          return hay.includes(term);
        });
      }
    }
    return list;
  }

  function getSubtopics(categoryKey) {
    const cm = categoryMeta(categoryKey);
    return cm ? cm.subtopics : [];
  }

  // ------------------------------------------------------------------
  // الاسترجاع المتباعد الخاص ببنك الأسئلة (نفس منطق progress.js لكن بمعزل تام)
  // ------------------------------------------------------------------
  function updateRetrieval(qid, correct) {
    let r = state.retrieval[qid];
    if (!r) r = { status: "new", lastSeen: null, dueDate: null, reps: 0 };
    r.lastSeen = todayStr();
    if (correct) {
      r.reps += 1;
      r.status = r.reps >= 2 ? "mastered" : "needs";
      const gapDays = r.status === "mastered" ? Math.min(14, 2 * r.reps) : 1;
      const due = new Date(); due.setDate(due.getDate() + gapDays);
      r.dueDate = due.toISOString().slice(0, 10);
    } else {
      r.reps = 0;
      r.status = "needs";
      const due = new Date(); due.setDate(due.getDate() + 1);
      r.dueDate = due.toISOString().slice(0, 10);
    }
    state.retrieval[qid] = r;
  }

  function getDueQuestions(categoryKey) {
    const today = todayStr();
    const due = Object.entries(state.retrieval).filter(([qid, r]) => r.dueDate && r.dueDate <= today).map(([qid]) => qid);
    let qs = due.map(byId).filter(Boolean);
    if (categoryKey) { const cm = categoryMeta(categoryKey); qs = qs.filter(q => q.category === cm.name); }
    return qs;
  }

  function getRetrievalSummary(categoryKey) {
    const cm = categoryKey ? categoryMeta(categoryKey) : null;
    const out = { "new": 0, "needs": 0, "mastered": 0, dueCount: 0 };
    const today = todayStr();
    Object.entries(state.retrieval).forEach(([qid, r]) => {
      if (cm) { const q = byId(qid); if (!q || q.category !== cm.name) return; }
      out[r.status] = (out[r.status] || 0) + 1;
      if (r.dueDate && r.dueDate <= today) out.dueCount += 1;
    });
    return out;
  }

  // ------------------------------------------------------------------
  // مكافحة استغلال نقاط الخبرة (Anti-farming)
  // إجابة أولى صحيحة = نقاط كاملة. مراجعة مستحقة صحيحة = نقاط مخفّضة.
  // إعادة إجابة سؤال غير مستحق (تكرار متعمّد) = صفر نقاط.
  // ------------------------------------------------------------------
  function computeXp(q, correct, isDueReview) {
    if (!correct) return 2;
    const base = q.questionType === "mcq" ? 10 : (q.difficulty === "صعب" ? 16 : 12);
    const prior = state.attempts[q.id];
    if (!prior || prior.count === 0) return base; // أول محاولة على الإطلاق
    if (isDueReview) return Math.round(base * 0.4); // مراجعة مستحقة فعليًا
    return 0; // تكرار لسؤال ليس مستحقًا بعد — لا نقاط لمنع الاستغلال
  }

  function recordAttempt(q, correct, opts) {
    opts = opts || {};
    const today = todayStr();
    const wasDue = state.retrieval[q.id] && state.retrieval[q.id].dueDate && state.retrieval[q.id].dueDate <= today;
    const xp = computeXp(q, correct, wasDue);

    if (!state.attempts[q.id]) state.attempts[q.id] = { count: 0, correctCount: 0, lastCorrect: null, lastDate: null, history: [] };
    const a = state.attempts[q.id];
    a.count += 1;
    if (correct) a.correctCount += 1;
    a.lastCorrect = correct;
    a.lastDate = today;
    a.history.push({ date: today, correct, mode: opts.mode || "practice" });
    if (a.history.length > 30) a.history = a.history.slice(-30);

    updateRetrieval(q.id, correct);
    save();

    // تغذية نظام XP/الشارات/الاستمرارية الموجود مسبقًا دون تعديله
    if (typeof Progress !== "undefined") {
      const catKey = Object.keys(SYNTHETIC_LESSON).find(k => categoryMeta(k) && categoryMeta(k).name === q.category);
      const lessonId = SYNTHETIC_LESSON[catKey] || "bank-عام";
      const skill = CATEGORY_TO_PROGRESS_SKILL[q.questionType] || "فهم";
      Progress.recordAnswer({ lessonId, questionId: q.id, skill, correct, source: opts.mode || "bank", xp });
    }
    return { xp, wasDue };
  }

  function checkAnswer(q, userAnswer) {
    if (!isAnswerable(q)) return null;
    if (q.questionType === "mcq") return userAnswer === q.correctAnswer;
    if (q.questionType === "short_answer") {
      // تصحيح ذاتي: الطالب يقارن إجابته بالنموذج ويقيّم نفسه — لا مطابقة نصية آلية لأنها غير موثوقة لغويًا
      return null;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // إتقان الموضوعات الفرعية — من بيانات محاولات فعلية فقط
  // ------------------------------------------------------------------
  function computeTopicMastery(categoryKey) {
    const cm = categoryMeta(categoryKey);
    if (!cm) return {};
    const qs = byCategory(categoryKey);
    const byTopic = {};
    qs.forEach(q => {
      const topic = q.subcategory || "موضوعات أخرى";
      if (!byTopic[topic]) byTopic[topic] = { correct: 0, total: 0 };
      const a = state.attempts[q.id];
      if (a && a.count > 0) {
        byTopic[topic].total += a.count;
        byTopic[topic].correct += a.correctCount;
      }
    });
    const out = {};
    Object.entries(byTopic).forEach(([topic, v]) => {
      out[topic] = { pct: v.total > 0 ? Math.round((v.correct / v.total) * 100) : null, attempts: v.total };
    });
    return out;
  }

  function computeCategoryMastery(categoryKey) {
    const qs = byCategory(categoryKey);
    let correct = 0, total = 0;
    qs.forEach(q => {
      const a = state.attempts[q.id];
      if (a) { correct += a.correctCount; total += a.count; }
    });
    return { overall: total > 0 ? Math.round((correct / total) * 100) : null, hasData: total > 0 };
  }

  function getWrongQuestions(categoryKey) {
    let ids = Object.keys(state.attempts).filter(qid => state.attempts[qid].lastCorrect === false);
    let qs = ids.map(byId).filter(Boolean);
    if (categoryKey) { const cm = categoryMeta(categoryKey); qs = qs.filter(q => q.category === cm.name); }
    return qs;
  }
  function getUnansweredQuestions(categoryKey) {
    return filterQuestions({ categoryKey, onlyUnanswered: true, onlyAnswerable: true });
  }

  // ------------------------------------------------------------------
  // بناء اختبار ذكي — بلا تكرار IDs، وبترتيب أولوية واضح:
  // 1) عناصر استرجاع مستحقة اليوم  2) أسئلة لم تُجرَّب أبدًا  3) أسئلة أُخطئ فيها سابقًا وليست مستحقة بعد  4) الباقي عشوائيًا
  // ------------------------------------------------------------------
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function buildSmartQuiz(opts) {
    opts = opts || {};
    const count = opts.count || 10;
    let pool = filterQuestions({
      categoryKey: opts.categoryKey, subcategory: opts.subcategory, difficulty: opts.difficulty,
      onlyAnswerable: opts.onlyAnswerable !== false
    });
    const poolIds = new Set(pool.map(q => q.id));
    const due = getDueQuestions(opts.categoryKey).filter(q => poolIds.has(q.id));
    const unattempted = pool.filter(q => !state.attempts[q.id] && !due.find(d => d.id === q.id));
    const wrongNotDue = getWrongQuestions(opts.categoryKey).filter(q => poolIds.has(q.id) && !due.find(d => d.id === q.id));
    const rest = pool.filter(q => !due.find(d => d.id === q.id) && !unattempted.find(u => u.id === q.id) && !wrongNotDue.find(w => w.id === q.id));

    const ordered = [...shuffle(due), ...shuffle(unattempted), ...shuffle(wrongNotDue), ...shuffle(rest)];
    const seen = new Set();
    const result = [];
    for (const q of ordered) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      result.push(q);
      if (result.length >= count) break;
    }
    return result;
  }

  // ------------------------------------------------------------------
  // محاكاة اختبار وزاري — بلا تغذية راجعة فورية، تقرير نهائي مُفصَّل حسب الموضوع
  // ------------------------------------------------------------------
  function buildSimulation(opts) {
    opts = opts || {};
    const count = opts.count || 20;
    const pool = shuffle(filterQuestions({ categoryKey: opts.categoryKey, onlyAnswerable: true }));
    return pool.slice(0, Math.min(count, pool.length));
  }

  // correctnessMap: { [qid]: true | false | null } — يحدَّد مسبقًا في الواجهة:
  // للاختيار من متعدد: مقارنة آلية مباشرة (chosenIndex === correctAnswer).
  // للإجابات المفتوحة ذات نموذج إجابة معروف: تقييم ذاتي من الطالب بعد رؤية النموذج (self-check).
  // null = سؤال إنشائي بلا إجابة واحدة صحيحة، أو لم تتم الإجابة عنه — يُستبعد من نسبة الدرجة النهائية.
  function gradeSimulation(quizQuestions, correctnessMap, categoryKey) {
    let correct = 0, scored = 0;
    const byTopic = {};
    const wrongIds = [];
    const excludedIds = [];
    quizQuestions.forEach(q => {
      const v = correctnessMap[q.id];
      if (v === true || v === false) {
        scored += 1;
        if (v) correct++; else wrongIds.push(q.id);
        const topic = q.subcategory || "موضوعات أخرى";
        if (!byTopic[topic]) byTopic[topic] = { correct: 0, total: 0 };
        byTopic[topic].total += 1;
        if (v) byTopic[topic].correct += 1;
        recordAttempt(q, v, { mode: "simulation" });
      } else {
        excludedIds.push(q.id);
      }
    });
    const byTopicPct = {};
    Object.entries(byTopic).forEach(([t, v]) => { byTopicPct[t] = { pct: Math.round((v.correct / v.total) * 100), correct: v.correct, total: v.total }; });
    const overall = scored ? Math.round((correct / scored) * 100) : null;
    const record = {
      date: todayStr(), categoryKey: categoryKey || "الكل",
      totalQuestions: quizQuestions.length, scoredQuestions: scored, excludedCount: excludedIds.length,
      correct, overall, byTopic: byTopicPct, wrongIds, excludedIds
    };
    state.simulations.unshift(record);
    state.simulations = state.simulations.slice(0, 20);
    save();
    return record;
  }

  // ------------------------------------------------------------------
  // الإشارات المرجعية (حفظ الأسئلة)
  // ------------------------------------------------------------------
  function toggleBookmark(qid) {
    const i = state.bookmarks.indexOf(qid);
    if (i >= 0) state.bookmarks.splice(i, 1); else state.bookmarks.push(qid);
    save();
    return state.bookmarks.includes(qid);
  }
  function isBookmarked(qid) { return state.bookmarks.includes(qid); }
  function getBookmarked() { return state.bookmarks.map(byId).filter(Boolean); }

  // ------------------------------------------------------------------
  // سؤال اليوم (من بنك الأسئلة) — اختيار حتمي حسب تاريخ اليوم
  // ------------------------------------------------------------------
  function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }

  function getDailyBankQuestion() {
    const pool = filterQuestions({ onlyAnswerable: true });
    if (!pool.length) return null;
    const today = todayStr();
    const idx = hashStr(today) % pool.length;
    return pool[idx];
  }
  function recordDailyBank(qid, correct) {
    const today = todayStr();
    state.dailyBank.history[today] = { qid, correct };
    state.dailyBank.lastDate = today;
    save();
  }
  function dailyBankDoneToday() { return state.dailyBank.lastDate === todayStr(); }

  // ------------------------------------------------------------------
  // سؤال الـ100% — الأصعب المتاح، مع تجنّب التكرار الفوري، وبلا اختلاق شرح غير موجود في المصدر
  // ------------------------------------------------------------------
  function getHundredPercentQuestion() {
    let pool = filterQuestions({ difficulty: "صعب", onlyAnswerable: true });
    if (!pool.length) pool = filterQuestions({ onlyAnswerable: true }); // احتياط إن لم توجد أسئلة صعبة مجابة
    if (!pool.length) return null;
    const recent = state.hundredPercent.recentIds || [];
    let candidates = pool.filter(q => !recent.includes(q.id));
    if (!candidates.length) candidates = pool;
    const q = candidates[Math.floor(Math.random() * candidates.length)];
    state.hundredPercent.recentIds = [q.id, ...recent].slice(0, 15);
    save();
    return q;
  }

  // ------------------------------------------------------------------
  // مراجعة سريعة (5/10/20 دقيقة) — اختيار ذكي: مستحق أولًا ثم غير مُجرَّب
  // نفترض معدّل إجابة سؤال واحد كل 45 ثانية تقريبًا لتقدير العدد المناسب
  // ------------------------------------------------------------------
  function buildQuickReview(minutes, categoryKey) {
    const approxCount = Math.max(4, Math.round((minutes * 60) / 45));
    state.quickReview = { lastDate: todayStr(), lastSize: approxCount };
    save();
    return buildSmartQuiz({ count: approxCount, categoryKey });
  }

  // ------------------------------------------------------------------
  // إحصاءات عامة لعرضها في لوحة القسم
  // ------------------------------------------------------------------
  function overallStats() {
    const m = meta();
    let attempted = 0, correct = 0;
    Object.values(state.attempts).forEach(a => { attempted += a.count; correct += a.correctCount; });
    return {
      totalQuestions: m ? m.totalQuestions : 0,
      answerableCount: allQuestions().filter(isAnswerable).length,
      needsReviewCount: m ? m.answerCoverage.needsReview : 0,
      attemptedQuestions: Object.keys(state.attempts).length,
      totalAttempts: attempted,
      totalCorrect: correct,
      accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : null,
      bookmarkCount: state.bookmarks.length,
      dueCount: getRetrievalSummary().dueCount
    };
  }

  return {
    CATEGORY_KEYS,
    meta, categoryMeta, allQuestions, byCategory, byId, getSubtopics,
    isAnswerable, checkAnswer, filterQuestions,
    recordAttempt, getDueQuestions, getRetrievalSummary,
    computeTopicMastery, computeCategoryMastery,
    getWrongQuestions, getUnansweredQuestions,
    buildSmartQuiz, buildSimulation, gradeSimulation,
    toggleBookmark, isBookmarked, getBookmarked,
    getDailyBankQuestion, recordDailyBank, dailyBankDoneToday,
    getHundredPercentQuestion,
    buildQuickReview,
    overallStats,
    todayStr,
    getSimulationHistory: () => state.simulations,
    _debugState: () => state
  };
})();
