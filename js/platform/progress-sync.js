// ============================================================================
// progress-sync.js — يربط محرك التقدم المحلي الحالي (Progress من js/progress.js)
// بقاعدة البيانات الحقيقية، دون تعديل حرف واحد داخل progress.js نفسه.
// الأسلوب: تغليف (wrap) دوال Progress العامة — تُنفَّذ الدالة الأصلية كما هي
// أولاً (فتبقى تجربة الطالب المحلية والفورية كما هي تمامًا)، ثم تُرسَل نسخة من
// الحدث إلى Supabase في الخلفية دون أي تأخير محسوس في الواجهة.
//
// إن حاول حساب انتهت تجربته المجانية (TRIAL_EXPIRED) بدون اشتراك تسجيل تقدّم
// جديد، فستُرفض العملية من قاعدة البيانات نفسها (انظر migration_003 —
// record_progress_event تتحقق من public.get_access_status() قبل الكتابة)؛
// هذا الملف لا يفعل شيئًا حيال ذلك سوى تسجيل تحذير في console، والتجربة
// المحلية (progress.js) تستمر كما هي دون أي كسر للواجهة.
//
// يُحمَّل هذا الملف بعد js/progress.js وبعد js/platform/auth.js في index.html.
// ============================================================================
(function () {
  if (typeof Progress === "undefined") return; // لا شيء لتغليفه إن لم يوجد المحرك

  const CURRENT_SUBJECT_SLUG = "arabic-12";
  let subjectIdCache = null;
  let lessonKeyToId = null; // { lessonKey: lessonUUID }

  async function ensureCatalog() {
    if (subjectIdCache && lessonKeyToId) return;
    if (!window.PLATFORM_DB) return;
    try {
      const { data: subject } = await window.PLATFORM_DB
        .from("subjects").select("id").eq("slug", CURRENT_SUBJECT_SLUG).single();
      if (!subject) return;
      subjectIdCache = subject.id;

      const { data: lessons } = await window.PLATFORM_DB
        .from("lessons").select("id, lesson_key").eq("subject_id", subjectIdCache);
      lessonKeyToId = {};
      (lessons || []).forEach((l) => { lessonKeyToId[l.lesson_key] = l.id; });
    } catch (e) {
      console.warn("[platform] تعذّرت مزامنة كتالوج الدروس مع قاعدة البيانات:", e.message);
    }
  }

  async function pushProgress(lessonKey, completionDelta, masteryValue, eventType, metadata) {
    try {
      await ensureCatalog();
      if (!subjectIdCache || !window.PLATFORM_DB) return;
      const session = await PlatformAuth.getSession();
      if (!session) return; // ضيف غير مسجَّل — لا مزامنة، التجربة المحلية تبقى تعمل
      const lessonId = lessonKeyToId ? lessonKeyToId[lessonKey] : null;

      await window.PLATFORM_DB.rpc("record_progress_event", {
        p_subject_id: subjectIdCache,
        p_lesson_id: lessonId || null,
        p_event_type: eventType,
        p_completion_delta: completionDelta || 0,
        p_mastery_value: masteryValue,
        p_metadata: metadata || {},
      });
    } catch (e) {
      console.warn("[platform] تعذّرت مزامنة التقدم (قد يكون السبب انتهاء التجربة/الاشتراك):", e.message);
    }
  }

  // خريطة شارات progress.js المحلية → أكواد achievements في قاعدة البيانات
  const BADGE_TO_ACHIEVEMENT = {
    challenger100: null,
    rhetoric_master: "rhetoric_mastery",
    streak7: null,
    error_analyst: "error_review",
  };

  function wrap(name, buildSync) {
    const original = Progress[name];
    if (typeof original !== "function") return;
    Progress[name] = function (...args) {
      const result = original.apply(Progress, args);
      try {
        buildSync(args, result);
      } catch (e) {
        console.warn(`[platform] progress-sync (${name}):`, e.message);
      }
      return result;
    };
  }

  wrap("recordAnswer", (args, masteryResult) => {
    const [{ lessonId, correct }] = args;
    pushProgress(lessonId, correct ? 5 : 1, masteryResult ? masteryResult.overall : null, "lesson_completed", { correct });
  });

  wrap("recordConceptViewed", (args) => {
    const [lessonId] = args;
    pushProgress(lessonId, 2, null, "lesson_opened", {});
  });

  wrap("recordExamTrap", (args) => {
    const [lessonId, , correctFirstTry] = args;
    pushProgress(lessonId, correctFirstTry ? 6 : 2, null, "test_completed", { type: "exam_trap", correctFirstTry });
  });

  wrap("recordErrorLab", (args) => {
    const [lessonId, , solved] = args;
    pushProgress(lessonId, solved ? 6 : 2, null, "review_completed", { type: "error_lab", solved });
    if (solved) grantIfEarned("error_review");
  });

  wrap("recordChallenge100", (args) => {
    const [lessonId, , overall] = args;
    pushProgress(lessonId, Math.round(overall / 5), overall, "test_completed", { type: "challenge100", overall });
  });

  wrap("checkBadges", (args, newlyAwarded) => {
    const [lessonId] = args;
    (newlyAwarded || []).forEach((badge) => {
      const code = BADGE_TO_ACHIEVEMENT[badge.id];
      if (code) grantIfEarned(code);
    });
    grantIfEarned("first_test");
  });

  async function grantIfEarned(code) {
    try {
      const session = await PlatformAuth.getSession();
      if (!session || !window.PLATFORM_DB) return;
      await window.PLATFORM_DB.rpc("grant_achievement", { p_code: code });
    } catch (e) {
      /* صامت — تحفيزي وليس حرجًا */
    }
  }
})();
