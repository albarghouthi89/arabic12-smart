/* ==========================================================================
   splash.js — إخفاء شاشة الافتتاح + شريط التحميل العلوي (إضافة جديدة)
   - الشاشة تظهر مرة واحدة لكل جلسة تصفّح (sessionStorage) ثم تُزال من DOM.
   - لا تعطّل الإقلاع أبدًا: مهلة قصوى + حماية من أي خطأ؛ والتطبيق يُبنى خلفها.
   ========================================================================== */
(function () {
  var KEY = "tamakkun_splash_seen_v1";
  var splash = document.getElementById("tk-splash");
  var MIN_MS = 1700, MAX_MS = 4500;
  var start = (window.__tkSplashStart || Date.now());
  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* */ }
  var closed = false;

  function finish() {
    if (closed) return; closed = true;
    try { sessionStorage.setItem(KEY, "1"); } catch (e) { /* */ }
    if (!splash) return;
    document.body.classList.add("app-entering");
    splash.classList.add("tk-out");
    var remove = function () { if (splash && splash.parentNode) splash.parentNode.removeChild(splash); document.documentElement.classList.remove("tk-splashing"); };
    setTimeout(remove, reduce ? 200 : 650);
    setTimeout(function () { document.body.classList.remove("app-entering"); }, 1400);
  }

  function schedule() {
    var wait = Math.max(0, (reduce ? 700 : MIN_MS) - (Date.now() - start));
    setTimeout(finish, wait);
  }
  if (splash) {
    if (document.readyState === "complete") schedule(); else window.addEventListener("load", schedule, { once: true });
    setTimeout(finish, MAX_MS);
    splash.addEventListener("click", finish); // لمن لا يريد الانتظار
  }

  // شريط التحميل العلوي (أسلوب يوتيوب): يُستدعى عند كل انتقال بين الشاشات
  var bar = document.getElementById("top-loader");
  var t1 = null;
  window.TopLoader = {
    pulse: function () {
      if (!bar || reduce) return;
      clearTimeout(t1);
      bar.className = "";
      void bar.offsetWidth;
      bar.className = "run";
      t1 = setTimeout(function () { bar.className = "done"; }, 380);
    }
  };
})();
