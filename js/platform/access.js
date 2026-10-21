// ============================================================================
// access.js — الوصول للمحتوى المدفوع: مجاني دائم لطلاب المدرسة، بفترة تجربة
// حقيقية 7 أيام لكل حساب خارجي جديد، ثم اشتراك فصلي بعدها.
//
// حالة الوصول (STAFF / SCHOOL_FREE / SUBSCRIPTION_ACTIVE / TRIAL_ACTIVE /
// TRIAL_EXPIRED / NO_ACCESS) تُحسب دائمًا من قاعدة البيانات لحظيًا عبر
// public.get_access_status() — لا تُخزَّن أو تُحسب في المتصفح أبدًا، لأن أي
// قيمة محسوبة في المتصفح يمكن لطالب متمرّس تعديلها من localStorage أو من
// أدوات المطوّر. راجع backend/migration_003_trial_and_launch.sql.
//
// لا يوجد هنا أي مسار يُفعِّل اشتراكًا مباشرة من المتصفح — فقط "نية دفع"
// (Pending) عبر create_payment_intent. تفعيل الاشتراك الفعلي (status='active')
// يتم حصرًا من طرف Admin أو Edge Function موثوقة بعد تأكيد حقيقي من بوابة
// الدفع، تمامًا كما هو مصمَّم في schema.sql الأصلي.
// ============================================================================
const PlatformAccess = (function () {
  const CURRENT_SUBJECT_SLUG = "arabic-12";

  function db() { return window.PLATFORM_DB; }

  async function getSubjectBySlug(slug) {
    const { data } = await db().from("subjects").select("*").eq("slug", slug || CURRENT_SUBJECT_SLUG).single();
    return data;
  }

  async function getStatus(subjectSlug) {
    return PlatformAuth.getAccessStatus(subjectSlug || CURRENT_SUBJECT_SLUG);
  }

  async function getTrialDaysRemaining() {
    return PlatformAuth.getTrialDaysRemaining();
  }

  async function hasAccess(subjectSlug) {
    const status = await getStatus(subjectSlug);
    return status === "STAFF" || status === "SCHOOL_FREE" || status === "SUBSCRIPTION_ACTIVE" || status === "TRIAL_ACTIVE";
  }

  async function getMySubscriptions() {
    const profile = await PlatformAuth.getCurrentProfile();
    if (!profile) return [];
    const { data } = await db()
      .from("subscriptions")
      .select("*, subjects(name_ar), semesters(name_ar)")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });
    return data || [];
  }

  // السعر يُقرأ دائمًا من قاعدة البيانات (subjects.price_qar / semesters.price_qar
  // إن وُجد سعر مستقل للفصل)، ولا يُكتب أبدًا بشكل ثابت داخل الواجهة — قابل
  // للتعديل من Admin دون أي تعديل برمجي.
  async function getPrice(subjectSlug, semesterOrderIndex) {
    const subject = await getSubjectBySlug(subjectSlug);
    if (!subject) return null;
    if (semesterOrderIndex) {
      const { data: semester } = await db()
        .from("semesters").select("price_qar").eq("subject_id", subject.id).eq("order_index", semesterOrderIndex).maybeSingle();
      if (semester && semester.price_qar !== null && semester.price_qar !== undefined) {
        return Number(semester.price_qar);
      }
    }
    return Number(subject.price_qar);
  }

  async function requestPayment(subjectSlug, semesterOrderIndex = 1) {
    const subject = await getSubjectBySlug(subjectSlug);
    if (!subject) throw new Error("Subject not found");
    const { data: semester } = await db()
      .from("semesters").select("id").eq("subject_id", subject.id).eq("order_index", semesterOrderIndex).single();
    if (!semester) throw new Error("Semester not found");

    const { data: paymentId, error } = await db().rpc("create_payment_intent", {
      p_subject_id: subject.id,
      p_semester_id: semester.id,
    });
    if (error) throw error;

    await PlatformAuth.logEvent("payment_pending_created", { subject: subjectSlug, payment_id: paymentId });
    return paymentId;
  }

  return { getStatus, getTrialDaysRemaining, hasAccess, getMySubscriptions, getPrice, requestPayment, getSubjectBySlug };
})();
