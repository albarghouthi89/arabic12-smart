// ============================================================================
// platform-ui.js — واجهة الحساب: رابط «تسجيل الدخول / حسابي» في اللوحة، وصفحة
// «حسابي» بشاشاتها (دخول، إنشاء حساب، انتظار التفعيل، نسيت كلمة المرور، كلمة
// مرور جديدة، ملف الطالب).
//
// الحساب اختياري: لا شيء هنا يحجب أي محتوى. المنصة مجانية بالكامل، ولا يوجد
// أي سعر أو دفع أو اشتراك في هذه الواجهة.
//
// كل نص مصدره المستخدم (الاسم، البريد) يُكتب عبر textContent فقط.
// ============================================================================
window.PlatformUI = (function () {
  const state = {
    user: null,        // مستخدم Supabase الحالي (أو null للضيف)
    profile: null,     // { id, display_name }
    recovery: false,   // فُتح رابط استعادة كلمة المرور ولم تُعيَّن الجديدة بعد
  };

  // ------------------------------------------------------------- أداة DOM آمنة
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

  function displayName() {
    return (state.profile && state.profile.display_name) || "";
  }

  // ------------------------------------------------------------ حالة الجلسة
  async function setUser(user) {
    state.user = user || null;
    state.profile = user ? await PlatformAuth.getProfile(user) : null;
    if (!user) state.recovery = false;
    refreshAccountLink();
  }

  // ------------------------------------------------------- رابط الحساب في اللوحة
  function renderStatusBanner() { /* لا أشرطة تجارية في هذه المرحلة */ }

  function renderAccountLink(container, go) {
    if (!PlatformAuth.isEnabled()) return;
    const btn = h("button", { type: "button", class: "tk-account-link", id: "tk-account-link", onclick: () => go("account", "👤 حسابي") });
    container.appendChild(btn);
    refreshAccountLink();
  }

  function refreshAccountLink() {
    const btn = document.getElementById("tk-account-link");
    if (!btn) return;
    btn.textContent = "";
    if (state.user) {
      btn.append(h("span", { class: "tk-account-ico", "aria-hidden": "true", text: "👤" }),
        h("span", { text: displayName() || "حسابي" }));
      btn.setAttribute("aria-label", "حسابي");
    } else {
      btn.append(h("span", { class: "tk-account-ico", "aria-hidden": "true", text: "🔐" }),
        h("span", { text: "تسجيل الدخول أو إنشاء حساب مجاني" }));
      btn.removeAttribute("aria-label");
    }
  }

  // ----------------------------------------------------------- عناصر النماذج
  function field(label, input, hint) {
    const id = "af-" + Math.random().toString(36).slice(2, 8);
    input.id = id;
    return h("div", { class: "auth-field" },
      h("label", { for: id, text: label }),
      input,
      hint ? h("small", { class: "auth-hint", text: hint }) : null);
  }
  function emailInput(value) {
    return h("input", { type: "email", dir: "ltr", autocomplete: "email", inputmode: "email", maxlength: "254", required: true, value: value || "" });
  }
  function passwordInput(autocomplete) {
    const input = h("input", { type: "password", dir: "ltr", autocomplete, maxlength: "72", required: true });
    return input;
  }
  function withToggle(input) {
    const toggle = h("button", { type: "button", class: "auth-pw-toggle", "aria-label": "إظهار كلمة المرور", text: "إظهار" });
    toggle.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.textContent = show ? "إخفاء" : "إظهار";
      toggle.setAttribute("aria-label", show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    });
    return h("div", { class: "auth-pw-wrap" }, input, toggle);
  }
  function messageBox() {
    return h("p", { class: "auth-msg", role: "status", "aria-live": "polite" });
  }
  function setMsg(box, kind, text) {
    box.className = "auth-msg" + (kind ? " auth-msg-" + kind : "");
    box.textContent = text || "";
  }
  function submitButton(label) {
    return h("button", { type: "submit", class: "qz-btn qz-btn-primary auth-submit", text: label });
  }
  async function busy(button, labelWhileBusy, fn) {
    const original = button.textContent;
    button.disabled = true;
    button.classList.add("is-busy");
    button.textContent = labelWhileBusy;
    try { return await fn(); }
    finally { button.disabled = false; button.classList.remove("is-busy"); button.textContent = original; }
  }
  function linkButton(text, onclick) {
    return h("button", { type: "button", class: "auth-link", text, onclick });
  }
  function errorText(e) {
    return (e && e.messageAr) || PlatformAuth.MESSAGES.unknown;
  }

  // زر إعادة إرسال بعدّاد تنازلي (لكل بريد) — يمنع الطلبات المتكررة من الواجهة.
  function resendButton(kind, getEmail, msgBox, doSend, label) {
    const btn = h("button", { type: "button", class: "qz-btn qz-btn-outline auth-resend" });
    let timer = null;
    function paint() {
      const email = getEmail();
      const left = email ? PlatformAuth.cooldownRemaining(kind, email) : 0;
      btn.disabled = left > 0;
      btn.textContent = left > 0 ? `${label} (بعد ${left} ث)` : label;
      if (left > 0 && !timer) timer = setInterval(() => { if (!btn.isConnected) { clearInterval(timer); timer = null; return; } paint(); }, 1000);
      if (left === 0 && timer) { clearInterval(timer); timer = null; }
    }
    btn.addEventListener("click", async () => {
      const email = getEmail();
      const err = PlatformAuth.validateEmail(email);
      if (err) { setMsg(msgBox, "error", err); return; }
      try {
        await busy(btn, "جارٍ الإرسال...", () => doSend(email));
        setMsg(msgBox, "ok", "أُرسلت رسالة جديدة. افحص بريدك، ومجلد الرسائل غير المرغوب فيها أيضًا.");
      } catch (e) {
        setMsg(msgBox, "error", e.code === "cooldown" ? `${errorText(e)} (${e.retryAfterSec} ث)` : errorText(e));
      }
      paint();
    });
    paint();
    btn.repaint = paint;
    return btn;
  }

  // ------------------------------------------------------------- الشاشات
  const NOTICES = {
    confirmed: ["ok", "تم تفعيل حسابك بنجاح، وأنت الآن داخل حسابك."],
    link_expired: ["error", "انتهت صلاحية الرابط أو استُخدم من قبل. إن كان حسابك مفعّلًا فسجّل الدخول مباشرة، وإلا فاطلب رسالة تفعيل جديدة."],
    link_invalid: ["error", "الرابط غير صالح أو استُخدم من قبل. إن كان حسابك مفعّلًا فسجّل الدخول مباشرة."],
    link_network: ["error", "تعذّر التحقق من الرابط بسبب الاتصال. أعد فتح الرابط من بريدك بعد التأكد من الإنترنت."],
    password_updated: ["ok", "تم تغيير كلمة المرور بنجاح."],
    signed_out: ["ok", "تم تسجيل الخروج."],
  };

  function viewAccount(container, opts) {
    opts = opts || {};
    const wrap = h("div", { class: "auth-screen" });
    container.appendChild(wrap);

    if (!PlatformAuth.isEnabled()) {
      wrap.append(h("div", { class: "qz-card" }, h("p", { text: "الحسابات غير متاحة حاليًا. يمكنك استخدام المنصة كاملة دون حساب." })));
      return;
    }

    function show(screen, extra) {
      wrap.textContent = "";
      const card = h("div", { class: "qz-card auth-card" });
      wrap.appendChild(card);
      const notice = extra && extra.notice && NOTICES[extra.notice];
      if (notice) card.appendChild(h("p", { class: "auth-msg auth-msg-" + notice[0], role: "status", text: notice[1] }));
      SCREENS[screen](card, extra || {});
      const first = card.querySelector("input");
      if (first && window.matchMedia("(min-width: 700px)").matches) first.focus();
    }

    const SCREENS = {
      // ---------------------------------------------------------- تسجيل الدخول
      login(card, extra) {
        const email = emailInput(extra.email);
        const pw = passwordInput("current-password");
        const msg = messageBox();
        const submit = submitButton("تسجيل الدخول");
        const form = h("form", { class: "auth-form", novalidate: true },
          h("h2", { class: "auth-title", text: "تسجيل الدخول" }),
          h("p", { class: "auth-sub", text: "الحساب اختياري ومجاني. المنصة متاحة كاملة بدونه." }),
          field("البريد الإلكتروني", email),
          field("كلمة المرور", withToggle(pw)),
          msg, submit,
          h("div", { class: "auth-links" },
            linkButton("نسيت كلمة المرور؟", () => show("forgot", { email: email.value })),
            linkButton("إنشاء حساب جديد", () => show("signup", { email: email.value }))));
        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const e1 = PlatformAuth.validateEmail(email.value);
          if (e1) { setMsg(msg, "error", e1); email.focus(); return; }
          if (!pw.value) { setMsg(msg, "error", "أدخل كلمة المرور."); pw.focus(); return; }
          setMsg(msg, "", "");
          try {
            const data = await busy(submit, "جارٍ تسجيل الدخول...", () => PlatformAuth.signIn({ email: email.value, password: pw.value }));
            pw.value = "";
            await setUser(data.user);
            show("profile", { notice: null });
          } catch (e) {
            if (e.code === "email_not_confirmed") { show("pending", { email: email.value.trim(), fromLogin: true }); return; }
            setMsg(msg, "error", errorText(e));
          }
        });
        card.appendChild(form);
        if (extra.offerResend) {
          const rmsg = messageBox();
          card.appendChild(h("div", { class: "auth-aside" },
            h("p", { text: "لم يُفعَّل حسابك؟ اكتب بريدك في الأعلى ثم اطلب رسالة تفعيل جديدة:" }),
            resendButton("signup", () => email.value, rmsg, (v) => PlatformAuth.resendConfirmation(v), "إرسال رسالة تفعيل جديدة"),
            rmsg));
        }
      },

      // ----------------------------------------------------------- حساب جديد
      signup(card, extra) {
        const name = h("input", { type: "text", autocomplete: "name", maxlength: "40", required: true });
        const email = emailInput(extra.email);
        const pw = passwordInput("new-password");
        const pw2 = passwordInput("new-password");
        const msg = messageBox();
        const submit = submitButton("إنشاء الحساب");
        const form = h("form", { class: "auth-form", novalidate: true },
          h("h2", { class: "auth-title", text: "إنشاء حساب جديد" }),
          h("p", { class: "auth-sub", text: "مجاني بالكامل، دون أي دفع أو بيانات بنكية." }),
          field("الاسم الذي يظهر في المنصة", name),
          field("البريد الإلكتروني", email, "سنرسل إليه رسالة لتفعيل الحساب."),
          field("كلمة المرور", withToggle(pw), "8 أحرف على الأقل، حروف إنجليزية وأرقام معًا."),
          field("تأكيد كلمة المرور", pw2),
          msg, submit,
          h("div", { class: "auth-links" },
            linkButton("لديك حساب؟ سجّل الدخول", () => show("login", { email: email.value }))));
        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const err = PlatformAuth.validateName(name.value) || PlatformAuth.validateEmail(email.value) || PlatformAuth.validatePassword(pw.value)
            || (pw.value !== pw2.value ? "كلمتا المرور غير متطابقتين." : null);
          if (err) { setMsg(msg, "error", err); return; }
          setMsg(msg, "", "");
          try {
            const res = await busy(submit, "جارٍ إنشاء الحساب...", () => PlatformAuth.signUp({ displayName: name.value, email: email.value, password: pw.value }));
            pw.value = ""; pw2.value = "";
            if (res.needsConfirmation) { show("pending", { email: email.value.trim() }); return; }
            // التفعيل بالبريد معطّل في الإعدادات: الجلسة جاهزة مباشرة
            await setUser(await PlatformAuth.verifyUser());
            show("profile", {});
          } catch (e) {
            setMsg(msg, "error", errorText(e));
          }
        });
        card.appendChild(form);
      },

      // ------------------------------------------------------ بانتظار التفعيل
      pending(card, extra) {
        const msg = messageBox();
        card.append(
          h("h2", { class: "auth-title", text: "فعّل حسابك من بريدك" }),
          h("p", { text: extra.fromLogin ? "حسابك موجود لكنه غير مفعّل بعد. افتح رسالة التفعيل التي أُرسلت إلى:" : "إن لم يكن هذا البريد مسجّلًا من قبل، فقد أرسلنا رسالة تفعيل إلى:" }),
          h("p", { class: "auth-email", dir: "ltr", text: extra.email }),
          h("ul", { class: "auth-steps" },
            h("li", { text: "افتح الرسالة واضغط رابط التفعيل." }),
            h("li", { text: "إن لم تجدها خلال دقائق فافحص مجلد الرسائل غير المرغوب فيها (Spam)." }),
            h("li", { text: "لن يعمل تسجيل الدخول قبل التفعيل." })),
          resendButton("signup", () => extra.email, msg, (v) => PlatformAuth.resendConfirmation(v), "إعادة إرسال رسالة التفعيل"),
          msg,
          h("div", { class: "auth-links" },
            linkButton("فعّلت حسابي — تسجيل الدخول", () => show("login", { email: extra.email })),
            linkButton("لديك حساب مفعّل؟ نسيت كلمة المرور", () => show("forgot", { email: extra.email })),
            linkButton("استخدام بريد آخر", () => show("signup", {}))));
      },

      // ---------------------------------------------------- نسيت كلمة المرور
      forgot(card, extra) {
        const email = emailInput(extra.email);
        const msg = messageBox();
        const submit = submitButton("إرسال رابط الاستعادة");
        const form = h("form", { class: "auth-form", novalidate: true },
          h("h2", { class: "auth-title", text: "استعادة كلمة المرور" }),
          h("p", { class: "auth-sub", text: "اكتب بريد حسابك، وسنرسل إليه رابطًا لتعيين كلمة مرور جديدة." }),
          field("البريد الإلكتروني", email),
          msg, submit,
          h("div", { class: "auth-links" }, linkButton("العودة إلى تسجيل الدخول", () => show("login", { email: email.value }))));
        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const err = PlatformAuth.validateEmail(email.value);
          if (err) { setMsg(msg, "error", err); return; }
          try {
            await busy(submit, "جارٍ الإرسال...", () => PlatformAuth.requestPasswordReset(email.value));
            // الرسالة نفسها سواء كان البريد مسجّلًا أم لا (لا نكشف الحسابات الموجودة)
            setMsg(msg, "ok", "إن كان هذا البريد مسجّلًا لدينا فستصله رسالة خلال دقائق. افتحها من هذا الجهاز أو غيره، ثم عيّن كلمة المرور الجديدة.");
          } catch (e) {
            setMsg(msg, "error", e.code === "cooldown" ? `${errorText(e)} (${e.retryAfterSec} ث)` : errorText(e));
          }
        });
        card.appendChild(form);
      },

      // ------------------------------------------ تعيين كلمة مرور جديدة (رابط الاستعادة)
      newPassword(card) {
        const pw = passwordInput("new-password");
        const pw2 = passwordInput("new-password");
        const msg = messageBox();
        const submit = submitButton("حفظ كلمة المرور الجديدة");
        const form = h("form", { class: "auth-form", novalidate: true },
          h("h2", { class: "auth-title", text: "تعيين كلمة مرور جديدة" }),
          field("كلمة المرور الجديدة", withToggle(pw), "8 أحرف على الأقل، حروف إنجليزية وأرقام معًا."),
          field("تأكيد كلمة المرور", pw2),
          msg, submit);
        form.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const err = PlatformAuth.validatePassword(pw.value) || (pw.value !== pw2.value ? "كلمتا المرور غير متطابقتين." : null);
          if (err) { setMsg(msg, "error", err); return; }
          try {
            await busy(submit, "جارٍ الحفظ...", () => PlatformAuth.updatePassword(pw.value));
            pw.value = ""; pw2.value = "";
            state.recovery = false;
            show("profile", { notice: "password_updated" });
          } catch (e) {
            setMsg(msg, "error", errorText(e));
          }
        });
        card.appendChild(form);
      },

      // ----------------------------------------------------------- ملف الطالب
      profile(card) {
        if (!state.user) { show("login", {}); return; }
        const nameInput = h("input", { type: "text", autocomplete: "name", maxlength: "40", value: displayName() });
        const nameMsg = messageBox();
        const nameSave = submitButton("حفظ الاسم");
        const nameForm = h("form", { class: "auth-form auth-inline", novalidate: true }, field("الاسم في المنصة", nameInput), nameMsg, nameSave);
        nameForm.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const err = PlatformAuth.validateName(nameInput.value);
          if (err) { setMsg(nameMsg, "error", err); return; }
          try {
            const saved = await busy(nameSave, "جارٍ الحفظ...", () => PlatformAuth.updateDisplayName(state.user.id, nameInput.value));
            state.profile = Object.assign({}, state.profile, { display_name: saved });
            refreshAccountLink();
            const title = card.querySelector(".auth-title");
            if (title) title.textContent = displayName() || "حسابي";
            setMsg(nameMsg, "ok", "تم حفظ الاسم.");
          } catch (e) { setMsg(nameMsg, "error", errorText(e)); }
        });

        const pw = passwordInput("new-password");
        const pw2 = passwordInput("new-password");
        const pwMsg = messageBox();
        const pwSave = submitButton("تغيير كلمة المرور");
        const pwForm = h("form", { class: "auth-form auth-inline", novalidate: true },
          field("كلمة مرور جديدة", withToggle(pw), "8 أحرف على الأقل، حروف إنجليزية وأرقام معًا."), field("تأكيدها", pw2), pwMsg, pwSave);
        pwForm.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const err = PlatformAuth.validatePassword(pw.value) || (pw.value !== pw2.value ? "كلمتا المرور غير متطابقتين." : null);
          if (err) { setMsg(pwMsg, "error", err); return; }
          try {
            await busy(pwSave, "جارٍ الحفظ...", () => PlatformAuth.updatePassword(pw.value));
            pw.value = ""; pw2.value = "";
            setMsg(pwMsg, "ok", "تم تغيير كلمة المرور.");
          } catch (e) { setMsg(pwMsg, "error", errorText(e)); }
        });

        const outMsg = messageBox();
        const outBtn = h("button", { type: "button", class: "qz-btn qz-btn-outline auth-signout", text: "تسجيل الخروج" });
        outBtn.addEventListener("click", async () => {
          await busy(outBtn, "جارٍ تسجيل الخروج...", () => PlatformAuth.signOut());
          await setUser(null);
          if (window.AppShell) window.AppShell.goRoot("dashboard", "تمكّن");
        });

        const verified = !!(state.user.email_confirmed_at || state.user.confirmed_at);
        card.append(
          h("h2", { class: "auth-title", text: displayName() || "حسابي" }),
          h("dl", { class: "auth-facts" },
            h("dt", { text: "البريد الإلكتروني" }), h("dd", { dir: "ltr", text: state.user.email || "" }),
            h("dt", { text: "حالة الحساب" }), h("dd", { text: verified ? "✓ مفعّل" : "غير مفعّل" }),
            h("dt", { text: "الاشتراك" }), h("dd", { text: "المنصة مجانية بالكامل" })),
          h("details", { class: "auth-section" }, h("summary", { text: "تعديل الاسم" }), nameForm),
          h("details", { class: "auth-section" }, h("summary", { text: "تغيير كلمة المرور" }), pwForm),
          outBtn, outMsg,
          h("p", { class: "auth-note", text: "تقدّمك في الدروس والأسئلة ما زال محفوظًا على هذا الجهاز كما كان." }));
      },
    };

    if (state.recovery && state.user) show("newPassword", {});
    else if (state.user) show("profile", { notice: opts.notice });
    else show(opts.screen || "login", { notice: opts.notice, offerResend: opts.notice === "link_expired" || opts.notice === "link_invalid" });
  }

  return { state, setUser, renderStatusBanner, renderAccountLink, refreshAccountLink, viewAccount };
})();
