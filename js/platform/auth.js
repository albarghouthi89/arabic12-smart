// ============================================================================
// auth.js — مصادقة حقيقية عبر Supabase Auth (Hashing + Sessions + RLS).
// لا يوجد هنا أي تخزين لكلمات مرور — كل شيء يمرّ عبر GoTrue (نظام Supabase Auth).
// نفس البنية المُختبَرة فعليًا في النسخة V2، مع إضافتين لهذه المرحلة التجارية:
// getAccessStatus() و getTrialDaysRemaining() (انظر access.js أيضًا).
// ============================================================================
const PlatformAuth = (function () {
  // بريد اصطناعي داخلي لحسابات المدرسة فقط (نفس النطاق المُستخدم في V2 عمدًا،
  // لأن الحسابات تعيش في نفس مشروع Supabase وقاعدة auth.users نفسها).
  const SCHOOL_EMAIL_DOMAIN = "school.arabic12.local";

  function db() {
    if (!window.PLATFORM_DB) {
      throw new Error("Supabase غير مُهيّأ — تحقق من js/platform/config.js");
    }
    return window.PLATFORM_DB;
  }

  // اسم المستخدم: أحرف إنجليزية/أرقام فقط (بلا مسافات أو عربية أو رموز) لأنه
  // يُستخدم لبناء بريد داخلي صالح لحسابات المدرسة، ولأنه معرّف تسجيل الدخول
  // لكل الحسابات.
  function sanitizeUsername(raw) {
    const cleaned = (raw || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (cleaned.length < 3) {
      throw new Error("اسم المستخدم يجب أن يكون 3 أحرف إنجليزية/أرقام على الأقل، بدون مسافات أو حروف عربية أو رموز (مثال: ahmad_2010).");
    }
    return cleaned;
  }

  // ------------------------------------------------------------------ signUp
  async function signUpSchoolStudent({ username, fullName, password, schoolId }) {
    const cleanUsername = sanitizeUsername(username);
    const email = `${cleanUsername}@${SCHOOL_EMAIL_DOMAIN}`;
    const { data, error } = await db().auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
          full_name: fullName,
          role_code: "school_student",
          account_type: "school",
        },
      },
    });
    if (error) throw error;
    if (schoolId && data.user) {
      await db().from("profiles").update({ school_id: schoolId }).eq("id", data.user.id);
    }
    return data;
  }

  async function signUpExternalStudent({ username, fullName, email, password }) {
    const cleanUsername = sanitizeUsername(username);
    const { data, error } = await db().auth.signUp({
      email,
      password,
      options: {
        data: {
          username: cleanUsername,
          full_name: fullName,
          role_code: "external_student",
          account_type: "external",
        },
      },
    });
    if (error) throw error;
    return data;
  }

  // ------------------------------------------------------------------ signIn
  async function signInWithUsername({ username, password }) {
    const { data: email, error: lookupError } = await db().rpc("email_for_username", {
      p_username: username.trim().toLowerCase(),
    });
    if (lookupError) throw lookupError;
    if (!email) throw new Error("اسم المستخدم غير موجود");

    const { data, error } = await db().auth.signInWithPassword({ email, password });
    if (error) throw error;

    await recordDeviceAndSession();
    await logEvent("login", {});
    await touchLastLogin();
    return data;
  }

  async function signOut() {
    await logEvent("logout", {});
    await db().auth.signOut();
  }

  // -------------------------------------------------------------- profile
  async function getSession() {
    const { data } = await db().auth.getSession();
    return data.session;
  }

  async function getCurrentProfile() {
    const session = await getSession();
    if (!session) return null;
    const { data, error } = await db()
      .from("profiles")
      .select("*, schools(name_ar)")
      .eq("id", session.user.id)
      .single();
    if (error) return null;
    return data;
  }

  async function touchLastLogin() {
    const session = await getSession();
    if (!session) return;
    await db().from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", session.user.id);
  }

  // -------------------------------------------------- حالة الوصول التجارية
  // (المرحلة الثانية) — تُحسب دائمًا من قاعدة البيانات نفسها، لا من أي قيمة
  // محفوظة في المتصفح. راجع migration_003_trial_and_launch.sql.
  async function getAccessStatus(subjectSlug) {
    const { data, error } = await db().rpc("get_access_status", {
      p_subject_slug: subjectSlug || "arabic-12",
    });
    if (error) throw error;
    return data; // 'STAFF' | 'SCHOOL_FREE' | 'SUBSCRIPTION_ACTIVE' | 'TRIAL_ACTIVE' | 'TRIAL_EXPIRED' | 'NO_ACCESS'
  }

  async function getTrialDaysRemaining() {
    const { data, error } = await db().rpc("get_trial_days_remaining");
    if (error) return null;
    return data;
  }

  // ---------------------------------------------- إجبار تغيير كلمة المرور
  async function needsPasswordChange() {
    const profile = await getCurrentProfile();
    return !!(profile && profile.must_change_password);
  }

  async function changePassword(newPassword) {
    const { error: updateError } = await db().auth.updateUser({ password: newPassword });
    if (updateError) throw updateError;

    const session = await getSession();
    await db().from("profiles").update({ must_change_password: false }).eq("id", session.user.id);
  }

  // --------------------------------------------------------- الأجهزة (حد جهازين)
  function getOrCreateDeviceFingerprint() {
    let fp = localStorage.getItem("platform_device_fp");
    if (!fp) {
      fp = "dev-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
      localStorage.setItem("platform_device_fp", fp);
    }
    return fp;
  }

  function detectDeviceType() {
    const ua = navigator.userAgent || "";
    if (/tablet|ipad/i.test(ua)) return "tablet";
    if (/mobi|android|iphone/i.test(ua)) return "mobile";
    return "desktop";
  }

  async function recordDeviceAndSession() {
    try {
      const fingerprint = getOrCreateDeviceFingerprint();
      const deviceType = detectDeviceType();
      const deviceName = `${deviceType} — ${navigator.platform || "unknown"}`;
      const { data, error } = await db().rpc("register_device", {
        p_fingerprint: fingerprint,
        p_device_name: deviceName,
        p_device_type: deviceType,
      });
      if (error) throw error;
      if (data === "limit_reached") {
        return { status: "limit_reached" };
      }
      return { status: "ok" };
    } catch (e) {
      console.warn("[platform] تعذّر تسجيل الجهاز:", e.message);
      return { status: "error" };
    }
  }

  async function listMyDevices() {
    const session = await getSession();
    if (!session) return [];
    const { data } = await db()
      .from("devices")
      .select("*")
      .eq("user_id", session.user.id)
      .order("last_seen_at", { ascending: false });
    return data || [];
  }

  async function retireDevice(deviceId) {
    await db().rpc("retire_device", { p_device_id: deviceId });
  }

  // ------------------------------------------------------------------- log
  async function logEvent(eventType, metadata) {
    try {
      const session = await getSession();
      if (!session) return;
      await db().from("activity_events").insert({
        user_id: session.user.id,
        event_type: eventType,
        metadata: metadata || {},
      });
    } catch (e) {
      /* لا نوقف تجربة الطالب بسبب فشل تسجيل حدث تحليلي */
    }
  }

  return {
    signUpSchoolStudent,
    signUpExternalStudent,
    signInWithUsername,
    signOut,
    getSession,
    getCurrentProfile,
    getAccessStatus,
    getTrialDaysRemaining,
    needsPasswordChange,
    changePassword,
    listMyDevices,
    retireDevice,
    logEvent,
  };
})();
