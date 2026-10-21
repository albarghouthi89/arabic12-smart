/* ==========================================================================
   progress.js — محرك التقدم والإتقان (XP / Mastery / Streak / Badges / Retrieval)
   يعتمد كليًا على localStorage في هذا الإصدار (لا Backend)، لكن كل الدوال
   معزولة خلف واجهة Progress.* بحيث يسهل لاحقًا استبدال التخزين بخادم فعلي
   دون تغيير أي كود في app.js / quiz.js / mindmap.js.
   ========================================================================== */

const Progress = (function () {
  const STORAGE_KEY = "arabic12_smart_system_v1";
  const SKILLS = ["فهم", "تطبيق", "تمييز", "تحليل"];

  const BADGES_CATALOG = [
    { id: "explorer", title: "مستكشف الدرس", icon: "🧭", desc: "استعرضت كل بطاقات مفاهيم الدرس." },
    { id: "practitioner", title: "متمرّن مثابر", icon: "✍️", desc: "أجبت عن جميع أسئلة مرحلة «جرّب»." },
    { id: "challenger100", title: "100% Challenger", icon: "🏆", desc: "حققت 100% في تحدي الإتقان." },
    { id: "trap_hunter", title: "صياد المصائد", icon: "🕵️", desc: "تخطّيت كل مصائد الاختبار بلا خطأ متكرر." },
    { id: "error_analyst", title: "خبير مختبر الأخطاء", icon: "🔬", desc: "حللت جميع حالات مختبر الأخطاء بنجاح." },
    { id: "rhetoric_master", title: "Rhetoric Analyst", icon: "🎭", desc: "بلغ إتقانك في البلاغة 90% فأكثر." },
    { id: "streak3", title: "مواظب 3 أيام", icon: "🔥", desc: "راجعت 3 أيام متتالية." },
    { id: "streak7", title: "مواظب أسبوع كامل", icon: "🔥🔥", desc: "راجعت 7 أيام متتالية." },
    { id: "retrieval_master", title: "سيد الاسترجاع", icon: "🧠", desc: "أتقنت كل مهارات الاسترجاع الذكي." }
  ];

  function todayStr() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function daysBetween(a, b) {
    const d1 = new Date(a), d2 = new Date(b);
    return Math.round((d2 - d1) / 86400000);
  }

  function defaultLessonState() {
    return {
      conceptsViewed: [],
      practice: {},      // questionId -> {attempts, correctFirstTry, lastCorrect, history:[]}
      challenge100: { attempts: [], bestOverall: 0, bestBySkill: {} },
      examTraps: {},      // trapId -> {attempts, solvedCleanly}
      errorLab: {},       // errorId -> {solved}
      teachIt: {},        // id -> {bestScore, lastAnswer, lastFeedback}
      mindMap: { viewedBranches: [], blankBestScore: 0 },
      diagnostic: { done: false, weakConcepts: [] },
      skillStats: { "فهم": { correct: 0, total: 0 }, "تطبيق": { correct: 0, total: 0 }, "تمييز": { correct: 0, total: 0 }, "تحليل": { correct: 0, total: 0 } },
      retrieval: {},      // key -> {status:'new'|'needs'|'mastered', lastSeen, dueDate, reps}
      recentErrors: []    // {conceptId, skill, date, stem}
    };
  }

  function defaultState() {
    return {
      version: 1,
      studentName: null,
      xp: 0,
      streak: { count: 0, lastActiveDate: null },
      badges: [],
      dailyChallenge: { lastDate: null, history: {} },
      lessons: {}
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      console.warn("Progress: تعذّر قراءة التخزين المحلي، بدء حالة جديدة.", e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Progress: تعذّر الحفظ في التخزين المحلي.", e);
    }
  }

  let state = load();

  function ensureLesson(lessonId) {
    if (!state.lessons[lessonId]) state.lessons[lessonId] = defaultLessonState();
    return state.lessons[lessonId];
  }

  function touchStreak() {
    const today = todayStr();
    if (state.streak.lastActiveDate === today) return; // already counted today
    if (state.streak.lastActiveDate) {
      const gap = daysBetween(state.streak.lastActiveDate, today);
      if (gap === 1) state.streak.count += 1;
      else if (gap > 1) state.streak.count = 1;
    } else {
      state.streak.count = 1;
    }
    state.streak.lastActiveDate = today;
  }

  function addXP(amount) {
    state.xp = Math.max(0, state.xp + amount);
  }

  function awardBadge(id) {
    if (!state.badges.includes(id)) {
      state.badges.push(id);
      return BADGES_CATALOG.find(b => b.id === id) || null;
    }
    return null;
  }

  // ------------------------------------------------------------------
  // نظام الاسترجاع المتباعد (Spaced Retrieval — نسخة مبسطة)
  // ------------------------------------------------------------------
  function updateRetrieval(lessonState, key, correct) {
    let r = lessonState.retrieval[key];
    if (!r) r = { status: "new", lastSeen: null, dueDate: null, reps: 0 };
    r.lastSeen = todayStr();
    if (correct) {
      r.reps += 1;
      r.status = r.reps >= 2 ? "mastered" : "needs";
      const gapDays = r.status === "mastered" ? Math.min(14, 2 * r.reps) : 1;
      const due = new Date();
      due.setDate(due.getDate() + gapDays);
      r.dueDate = due.toISOString().slice(0, 10);
    } else {
      r.reps = 0;
      r.status = "needs";
      const due = new Date();
      due.setDate(due.getDate() + 1);
      r.dueDate = due.toISOString().slice(0, 10);
    }
    lessonState.retrieval[key] = r;
  }

  function getRetrievalSummary(lessonId) {
    const ls = ensureLesson(lessonId);
    const items = Object.entries(ls.retrieval);
    const out = { "new": 0, "needs": 0, "mastered": 0, due: [] };
    const today = todayStr();
    items.forEach(([key, r]) => {
      out[r.status] = (out[r.status] || 0) + 1;
      if (r.dueDate && r.dueDate <= today) out.due.push(key);
    });
    return out;
  }

  // ------------------------------------------------------------------
  // تسجيل إجابة (من أي مصدر: جرّب / تحدي 100% / مصائد / تشخيص)
  // ------------------------------------------------------------------
  function recordAnswer({ lessonId, questionId, skill, correct, source, xp }) {
    const ls = ensureLesson(lessonId);
    touchStreak();

    if (skill && SKILLS.includes(skill)) {
      ls.skillStats[skill].total += 1;
      if (correct) ls.skillStats[skill].correct += 1;
    }

    if (questionId) {
      updateRetrieval(ls, questionId, correct);
      if (!ls.practice[questionId]) ls.practice[questionId] = { attempts: 0, correctFirstTry: null, lastCorrect: null, history: [] };
      const p = ls.practice[questionId];
      p.attempts += 1;
      if (p.correctFirstTry === null) p.correctFirstTry = correct;
      p.lastCorrect = correct;
      p.history.push({ date: todayStr(), correct, source: source || "practice" });
      if (!correct) {
        ls.recentErrors.unshift({ questionId, skill, date: todayStr() });
        ls.recentErrors = ls.recentErrors.slice(0, 20);
      }
    }

    addXP(typeof xp === "number" ? xp : (correct ? 10 : 2));
    save(state);
    return computeMastery(lessonId);
  }

  function recordConceptViewed(lessonId, conceptId) {
    const ls = ensureLesson(lessonId);
    if (!ls.conceptsViewed.includes(conceptId)) {
      ls.conceptsViewed.push(conceptId);
      addXP(3);
    }
    touchStreak();
    save(state);
  }

  function recordExamTrap(lessonId, trapId, correctFirstTry) {
    const ls = ensureLesson(lessonId);
    if (!ls.examTraps[trapId]) ls.examTraps[trapId] = { attempts: 0, solvedCleanly: false };
    ls.examTraps[trapId].attempts += 1;
    if (correctFirstTry) ls.examTraps[trapId].solvedCleanly = true;
    ls.skillStats["تمييز"].total += 1;
    if (correctFirstTry) ls.skillStats["تمييز"].correct += 1;
    touchStreak();
    addXP(correctFirstTry ? 15 : 5);
    save(state);
  }

  function recordErrorLab(lessonId, errorId, solved) {
    const ls = ensureLesson(lessonId);
    ls.errorLab[errorId] = { solved };
    touchStreak();
    addXP(solved ? 12 : 3);
    save(state);
  }

  function recordTeachIt(lessonId, id, score, feedback, answerText) {
    const ls = ensureLesson(lessonId);
    const prev = ls.teachIt[id] || { bestScore: 0 };
    ls.teachIt[id] = { bestScore: Math.max(prev.bestScore, score), lastScore: score, lastFeedback: feedback, lastAnswer: answerText, date: todayStr() };
    touchStreak();
    addXP(Math.round(score * 20));
    save(state);
  }

  function recordChallenge100(lessonId, scoresBySkill, overall) {
    const ls = ensureLesson(lessonId);
    ls.challenge100.attempts.push({ date: todayStr(), scoresBySkill, overall });
    ls.challenge100.bestOverall = Math.max(ls.challenge100.bestOverall, overall);
    Object.keys(scoresBySkill).forEach(k => {
      ls.challenge100.bestBySkill[k] = Math.max(ls.challenge100.bestBySkill[k] || 0, scoresBySkill[k]);
    });
    touchStreak();
    addXP(Math.round(overall * 0.5));
    save(state);
    checkBadges(lessonId);
    return ls.challenge100;
  }

  function recordDailyChallenge(correct) {
    const today = todayStr();
    state.dailyChallenge.history[today] = correct;
    state.dailyChallenge.lastDate = today;
    touchStreak();
    addXP(correct ? 8 : 2);
    save(state);
  }

  function setStudentName(name) {
    state.studentName = name;
    save(state);
  }

  // ------------------------------------------------------------------
  // حساب الإتقان (Mastery) — من نتائج حقيقية فقط
  // ------------------------------------------------------------------
  function computeMastery(lessonId) {
    const ls = ensureLesson(lessonId);
    const bySkill = {};
    let sumCorrect = 0, sumTotal = 0;
    SKILLS.forEach(sk => {
      const s = ls.skillStats[sk];
      bySkill[sk] = s.total > 0 ? Math.round((s.correct / s.total) * 100) : null;
      sumCorrect += s.correct; sumTotal += s.total;
    });
    const overall = sumTotal > 0 ? Math.round((sumCorrect / sumTotal) * 100) : 0;
    return { overall, bySkill, hasData: sumTotal > 0 };
  }

  function checkBadges(lessonId) {
    const ls = ensureLesson(lessonId);
    const newly = [];
    const lessonData = (typeof ARABIC12_DATA !== "undefined") ? ARABIC12_DATA.lessons.find(l => l.id === lessonId) : null;

    if (lessonData && ls.conceptsViewed.length >= lessonData.concepts.length) {
      const b = awardBadge("explorer"); if (b) newly.push(b);
    }
    if (lessonData && lessonData.practice.every(p => ls.practice[p.id] && ls.practice[p.id].attempts > 0)) {
      const b = awardBadge("practitioner"); if (b) newly.push(b);
    }
    if (ls.challenge100.bestOverall >= 100) {
      const b = awardBadge("challenger100"); if (b) newly.push(b);
    }
    if (lessonData && lessonData.examTraps.length > 0 && lessonData.examTraps.every(t => ls.examTraps[t.id] && ls.examTraps[t.id].solvedCleanly)) {
      const b = awardBadge("trap_hunter"); if (b) newly.push(b);
    }
    if (lessonData && lessonData.errorLab.length > 0 && lessonData.errorLab.every(e => ls.errorLab[e.id] && ls.errorLab[e.id].solved)) {
      const b = awardBadge("error_analyst"); if (b) newly.push(b);
    }
    const mastery = computeMastery(lessonId);
    if (mastery.overall >= 90 && mastery.hasData) {
      const b = awardBadge("rhetoric_master"); if (b) newly.push(b);
    }
    if (state.streak.count >= 3) { const b = awardBadge("streak3"); if (b) newly.push(b); }
    if (state.streak.count >= 7) { const b = awardBadge("streak7"); if (b) newly.push(b); }
    const retrSummary = getRetrievalSummary(lessonId);
    const totalRetr = retrSummary["new"] + retrSummary["needs"] + retrSummary["mastered"];
    if (totalRetr > 0 && retrSummary["mastered"] === totalRetr) {
      const b = awardBadge("retrieval_master"); if (b) newly.push(b);
    }
    save(state);
    return newly;
  }

  // ------------------------------------------------------------------
  // نظام التوصيات — بناءً على أضعف مهارة/مفهوم فعليًا
  // ------------------------------------------------------------------
  function getRecommendation(lessonId) {
    const ls = ensureLesson(lessonId);
    const mastery = computeMastery(lessonId);
    if (!mastery.hasData) return null;
    let weakestSkill = null, weakestScore = 101;
    SKILLS.forEach(sk => {
      if (mastery.bySkill[sk] !== null && mastery.bySkill[sk] < weakestScore) {
        weakestScore = mastery.bySkill[sk]; weakestSkill = sk;
      }
    });
    if (weakestSkill === null || weakestScore >= 85) return null;
    return { skill: weakestSkill, score: weakestScore };
  }

  function resetAll() {
    state = defaultState();
    save(state);
  }

  return {
    STORAGE_KEY, SKILLS, BADGES_CATALOG,
    getState: () => state,
    setStudentName,
    ensureLesson,
    recordAnswer,
    recordConceptViewed,
    recordExamTrap,
    recordErrorLab,
    recordTeachIt,
    recordChallenge100,
    recordDailyChallenge,
    computeMastery,
    checkBadges,
    getRecommendation,
    getRetrievalSummary,
    resetAll,
    todayStr
  };
})();
