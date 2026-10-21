// ============================================================================
// auth.js — حسابات الطلاب عبر Supabase Auth الرسمي (البريد الإلكتروني فقط).
// لا تخزين لكلمات مرور ولا رموز هنا: كل شيء يمرّ عبر Supabase Auth، والجلسة
// تحفظها المكتبة نفسها وتجدّدها تلقائيًا.
//
// كل دالة تُرجع أخطاء مُترجمة (AuthError.messageAr) بدل رسائل الخادم الخام.
// ============================================================================
const PlatformAuth = (function () {
  const RESEND_COOLDOWN_MS = 60 * 1000;   // يطابق حد Supabase الافتراضي لإعادة الإرسال
  const COOLDOWN_KEY = "tamakkun_auth_cooldowns_v1";
  const NAME_MAX = 40;
  const PASSWORD_MIN = 8;

  function db() { return window.PLATFORM_DB; }
  function isEnabled() { return !!window.PLATFORM_DB; }

  // روابط البريد تعود إلى صفحة الموقع نفسها (بلا معاملات سابقة). إن فُتحت الصفحة
  // من ملف محلي (origin = "null") نترك Supabase يستخدم Site URL بدل عنوان غير صالح.
  function redirectUrl() {
    return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : undefined;
  }

  // ---------------------------------------------------------------- الأخطاء
  const MESSAGES = {
    invalid_credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
    email_not_confirmed: "لم يُفعَّل حسابك بعد. افتح رسالة التفعيل في بريدك، أو اطلب رسالة جديدة.",
    weak_password: `كلمة المرور ضعيفة. استخدم ${PASSWORD_MIN} أحرف على الأقل، وامزج بين الحروف الإنجليزية والأرقام.`,
    same_password: "كلمة المرور الجديدة مطابقة للقديمة. اختر كلمة مرور مختلفة.",
    over_email_send_rate_limit: "أُرسلت رسائل كثيرة إلى هذا البريد مؤخرًا. انتظر قليلًا ثم حاول مجددًا.",
    over_request_rate_limit: "محاولات كثيرة في وقت قصير. انتظر دقيقة ثم حاول مجددًا.",
    email_address_invalid: "عنوان البريد الإلكتروني غير صالح.",
    signup_disabled: "إنشاء الحسابات متوقف مؤقتًا. حاول لاحقًا.",
    email_provider_disabled: "التسجيل بالبريد متوقف مؤقتًا. حاول لاحقًا.",
    user_banned: "هذا الحساب موقوف. تواصل مع المعلم.",
    session_not_found: "انتهت جلستك. سجّل الدخول مجددًا.",
    reauthentication_needed: "لأسباب أمنية، سجّل الدخول مجددًا ثم أعد المحاولة.",
    otp_expired: "انتهت صلاحية الرابط أو استُخدم من قبل.",
    network: "تعذّر الاتصال بالخدمة. تحقق من الإنترنت ثم حاول مجددًا.",
    cooldown: "انتظر قليلًا قبل طلب رسالة جديدة.",
    unknown: "حدث خطأ غير متوقع. حاول مجددًا بعد قليل.",
  };

  class AuthError extends Error {
    constructor(code, retryAfterSec) {
      super(code);
      this.code = code;
      this.messageAr = MESSAGES[code] || MESSAGES.unknown;
      this.retryAfterSec = retryAfterSec || 0;
    }
  }

  // يحوّل خطأ Supabase إلى رمز معروف دون تمرير نص الخادم الخام للواجهة.
  function normalize(err) {
    if (err instanceof AuthError) return err;
    if (!err) return new AuthError("unknown");
    const name = err.name || "";
    if (name === "AuthRetryableFetchError" || err.status === 0 || err instanceof TypeError) return new AuthError("network");
    if (err.code && MESSAGES[err.code]) return new AuthError(err.code);
    if (err.status === 429) return new AuthError("over_request_rate_limit");
    if (err.code === "validation_failed" || err.code === "email_address_not_authorized") return new AuthError("email_address_invalid");
    return new AuthError("unknown");
  }

  async function call(fn) {
    if (!isEnabled()) throw new AuthError("network");
    try {
      const { data, error } = await fn();
      if (error) throw error;
      return data;
    } catch (e) {
      throw normalize(e);
    }
  }

  // ------------------------------------------------------------- التحقق المحلي
  function validateEmail(email) {
    const v = (email || "").trim();
    if (!v || v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return "أدخل بريدًا إلكترونيًا صحيحًا، مثل: name@example.com";
    return null;
  }
  function validatePassword(pw) {
    if (!pw || pw.length < PASSWORD_MIN) return `كلمة المرور ${PASSWORD_MIN} أحرف على الأقل.`;
    if (pw.length > 72) return "كلمة المرور طويلة جدًا (72 حرفًا كحد أقصى).";
    // يطابق إعداد Supabase «Letters and digits» (حروف إنجليزية فقط)
    if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "استخدم حروفًا إنجليزية وأرقامًا معًا في كلمة المرور.";
    return null;
  }
  function cleanName(name) {
    return (name || "").replace(/[\u0000-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim();
  }
  function validateName(name) {
    const v = cleanName(name);
    if (v.length < 2) return "اكتب اسمك (حرفان على الأقل).";
    if (v.length > NAME_MAX) return `الاسم ${NAME_MAX} حرفًا كحد أقصى.`;
    return null;
  }

  // ------------------------------------------------- مهلة إعادة الإرسال (لكل بريد)
  // طبقة لطف في الواجهة فقط؛ الحماية الفعلية هي حدود Supabase على الخادم.
  function readCooldowns() {
    try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY)) || {}; } catch (e) { return {}; }
  }
  function cooldownKey(kind, email) { return kind + ":" + (email || "").trim().toLowerCase(); }
  function cooldownRemaining(kind, email) {
    const until = readCooldowns()[cooldownKey(kind, email)] || 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }
  function startCooldown(kind, email) {
    const all = readCooldowns();
    const now = Date.now();
    Object.keys(all).forEach(k => { if (all[k] < now) delete all[k]; });
    all[cooldownKey(kind, email)] = now + RESEND_COOLDOWN_MS;
    try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ }
  }
  function guardCooldown(kind, email) {
    const left = cooldownRemaining(kind, email);
    if (left > 0) throw new AuthError("cooldown", left);
  }

  // ------------------------------------------------------------------- العمليات
  // التسجيل: لا يعني أن الحساب مفعّل. needsConfirmation=true ما دام لا جلسة.
  // لا نكشف إن كان البريد مسجّلًا من قبل (Supabase يُرجع نتيجة متطابقة عمدًا).
  async function signUp({ displayName, email, password }) {
    const data = await call(() => db().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectUrl(),
        data: { display_name: cleanName(displayName).slice(0, NAME_MAX) },
      },
    }));
    startCooldown("signup", email);
    return { needsConfirmation: !data.session };
  }

  async function signIn({ email, password }) {
    return call(() => db().auth.signInWithPassword({ email: email.trim(), password }));
  }

  async function resendConfirmation(email) {
    guardCooldown("signup", email);
    await call(() => db().auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: redirectUrl() } }));
    startCooldown("signup", email);
  }

  async function requestPasswordReset(email) {
    guardCooldown("recovery", email);
    await call(() => db().auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectUrl() }));
    startCooldown("recovery", email);
  }

  async function updatePassword(newPassword) {
    await call(() => db().auth.updateUser({ password: newPassword }));
  }

  // الخروج من هذا الجهاز: يُبطل رمز التجديد على الخادم ويحذف الجلسة المحلية.
  // حتى لو فشل الاتصال تُحذف الجلسة المحلية، فلا يبقى الطالب «داخلًا» على الجهاز.
  async function signOut() {
    if (!isEnabled()) return;
    try {
      const { error } = await db().auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch (e) {
      try { await db().auth.signOut({ scope: "local" }); } catch (e2) { /* ignore */ }
    }
  }

  // الجلسة المحفوظة محليًا (سريعة، دون شبكة) — للعرض فقط.
  async function getSession() {
    if (!isEnabled()) return null;
    try {
      const { data } = await db().auth.getSession();
      return data.session || null;
    } catch (e) { return null; }
  }

  // تحقق من الخادم أن الجلسة ما زالت صالحة (لا نثق بالنسخة المحلية وحدها).
  // يُرجع: user | null (جلسة مرفوضة) | undefined (تعذّر الاتصال، فلا نحكم).
  async function verifyUser() {
    if (!isEnabled()) return null;
    try {
      const { data, error } = await db().auth.getUser();
      if (error) {
        const n = normalize(error);
        return n.code === "network" ? undefined : null;
      }
      return data.user || null;
    } catch (e) { return undefined; }
  }

  // رابط تفعيل بقالب token_hash (إن عُدّل قالب البريد في Supabase لاحقًا).
  async function verifyTokenHash(tokenHash, type) {
    return call(() => db().auth.verifyOtp({ token_hash: tokenHash, type: type === "recovery" ? "recovery" : "email" }));
  }

  // ------------------------------------------------------------- ملف الطالب
  async function getProfile(user) {
    if (!user) return null;
    const fallback = { id: user.id, display_name: cleanName((user.user_metadata || {}).display_name || "") };
    try {
      const { data, error } = await db().from("profiles").select("id, display_name").eq("id", user.id).maybeSingle();
      if (error || !data) return fallback;
      return data;
    } catch (e) { return fallback; }
  }

  async function updateDisplayName(userId, displayName) {
    const name = cleanName(displayName).slice(0, NAME_MAX);
    await call(() => db().from("profiles").update({ display_name: name }).eq("id", userId).select("id"));
    return name;
  }

  function onChange(callback) {
    if (!isEnabled()) return () => {};
    const { data } = db().auth.onAuthStateChange((event, session) => {
      // عدم استدعاء Supabase من داخل هذا المستمع مباشرة (توصية المكتبة)
      setTimeout(() => callback(event, session), 0);
    });
    return () => data.subscription.unsubscribe();
  }

  return {
    isEnabled, AuthError, MESSAGES,
    validateEmail, validatePassword, validateName, cooldownRemaining,
    signUp, signIn, resendConfirmation, requestPasswordReset, updatePassword, signOut,
    getSession, verifyUser, verifyTokenHash, getProfile, updateDisplayName, onChange,
  };
})();
