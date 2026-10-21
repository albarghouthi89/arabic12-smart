/* ==========================================================================
   pdf-viewer.js — عارض PDF داخل المنصة (يعتمد على PDF.js المحلي vendor/pdfjs)
   --------------------------------------------------------------------------
   - تحميل كسول: مكتبة PDF.js (~1.4MB) لا تُحمَّل إلا عند فتح الكتاب/الخطة.
   - يعمل دون إنترنت إن كان الملف نفسه متاحًا (لا CDN، لا خدمة خارجية).
   - تنقّل بين الصفحات (أزرار/لوحة مفاتيح/القفز لرقم صفحة)، تكبير/تصغير/ملاءمة
     العرض، وحفظ آخر صفحة وتكبير في localStorage واستئنافها تلقائيًا.
   - التحقق من هوية الملف: عدد صفحات الملف الفعلي يجب أن يطابق expectedPages في
     السجل؛ عند عدم التطابق يُرفض العرض برسالة صريحة بدل عرض ملف خاطئ بصمت.
   - لا يحفظ ولا يرسل أي بيانات للخادم.
   ========================================================================== */

const PdfViewer = (function () {
  const POS_KEY = "arabic12_library_pos_v1";
  const PDFJS_SRC = "vendor/pdfjs/pdf.min.js";
  const WORKER_SRC = "vendor/pdfjs/pdf.worker.min.js";
  let libPromise = null;

  function loadLib() {
    if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC; return Promise.resolve(window.pdfjsLib); }
    if (libPromise) return libPromise;
    libPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = PDFJS_SRC;
      s.onload = () => {
        if (!window.pdfjsLib) { reject(new Error("تعذّر تهيئة مكتبة PDF.js")); return; }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
        resolve(window.pdfjsLib);
      };
      s.onerror = () => { libPromise = null; reject(new Error("تعذّر تحميل مكتبة عرض PDF من الموقع")); };
      document.head.appendChild(s);
    });
    return libPromise;
  }

  function readPositions() {
    try { return JSON.parse(localStorage.getItem(POS_KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function getPosition(key) { return key ? (readPositions()[key] || null) : null; }
  function savePosition(key, page, zoom) {
    if (!key) return;
    try {
      const all = readPositions();
      all[key] = { page, zoom, ts: Date.now() };
      localStorage.setItem(POS_KEY, JSON.stringify(all));
    } catch (e) { /* التخزين غير متاح: نتجاهل بهدوء */ }
  }

  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  const ZOOM_MIN = 0.5, ZOOM_MAX = 3, ZOOM_STEP = 0.25;

  /**
   * mount(container, opts)
   *  opts.url           — مسار ملف PDF (أو blob: للمعاينة المحلية)
   *  opts.expectedPages — عدد الصفحات المتوقع (للتحقق من الهوية) أو null
   *  opts.positionKey   — مفتاح حفظ آخر موضع (أو null بلا حفظ)
   *  opts.downloadUrl / opts.downloadName — لإظهار زر تنزيل (اختياري)
   *  opts.label         — اسم يُقرأ لقارئ الشاشة
   * يعيد { destroy, goTo, getState, ready: Promise }
   */
  function mount(container, opts) {
    const state = { doc: null, page: 1, zoom: 1, rendering: false, pending: null, destroyed: false, task: null };

    const root = h("div", "pv-root");
    const bar = h("div", "pv-bar");
    bar.innerHTML = `
      <button type="button" class="pv-btn" data-act="prev" aria-label="الصفحة السابقة" title="السابقة">›</button>
      <span class="pv-pageinfo"><input type="number" class="pv-page-input" min="1" value="1" aria-label="رقم الصفحة" inputmode="numeric"> <span class="pv-of">/ —</span></span>
      <button type="button" class="pv-btn" data-act="next" aria-label="الصفحة التالية" title="التالية">‹</button>
      <span class="pv-sep"></span>
      <button type="button" class="pv-btn" data-act="zoomout" aria-label="تصغير" title="تصغير">−</button>
      <span class="pv-zoomval" aria-live="polite">100%</span>
      <button type="button" class="pv-btn" data-act="zoomin" aria-label="تكبير" title="تكبير">+</button>
      <button type="button" class="pv-btn pv-btn-text" data-act="fit" title="ملاءمة العرض">ملاءمة</button>
      <span class="pv-flex"></span>`;
    if (opts.downloadUrl) {
      const a = h("a", "pv-btn pv-btn-text pv-download", "⬇ تنزيل");
      a.href = opts.downloadUrl;
      a.setAttribute("download", opts.downloadName || "");
      bar.appendChild(a);
    }
    const stage = h("div", "pv-stage");
    stage.tabIndex = 0;
    stage.setAttribute("role", "document");
    stage.setAttribute("aria-label", opts.label || "عارض ملف PDF");
    const canvasWrap = h("div", "pv-canvas-wrap");
    const canvas = h("canvas", "pv-canvas");
    canvasWrap.appendChild(canvas);
    stage.appendChild(canvasWrap);
    const status = h("div", "pv-status", "⏳ جارٍ تحميل الملف…");
    stage.appendChild(status);
    root.appendChild(bar);
    root.appendChild(stage);
    container.appendChild(root);

    const pageInput = bar.querySelector(".pv-page-input");
    const ofSpan = bar.querySelector(".pv-of");
    const zoomVal = bar.querySelector(".pv-zoomval");
    const prevBtn = bar.querySelector('[data-act="prev"]');
    const nextBtn = bar.querySelector('[data-act="next"]');

    function setStatus(html, isError) {
      status.className = "pv-status" + (isError ? " pv-status-error" : "");
      status.innerHTML = html;
      status.style.display = html ? "" : "none";
    }

    function updateUi() {
      const n = state.doc ? state.doc.numPages : 0;
      pageInput.value = state.page;
      pageInput.max = n || "";
      ofSpan.textContent = "/ " + (n || "—");
      zoomVal.textContent = Math.round(state.zoom * 100) + "%";
      prevBtn.disabled = !state.doc || state.page <= 1;
      nextBtn.disabled = !state.doc || state.page >= n;
    }

    async function renderPage() {
      if (!state.doc || state.destroyed) return;
      if (state.rendering) { state.pending = true; return; }
      state.rendering = true;
      try {
        const page = await state.doc.getPage(state.page);
        const base = page.getViewport({ scale: 1 });
        const avail = Math.max(240, stage.clientWidth - 24);
        const cssWidth = avail * state.zoom;
        const scale = cssWidth / base.width;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const viewport = page.getViewport({ scale: scale * dpr });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = Math.floor(viewport.width / dpr) + "px";
        canvas.style.height = Math.floor(viewport.height / dpr) + "px";
        if (state.task) { try { state.task.cancel(); } catch (e) { /* */ } }
        state.task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
        await state.task.promise;
        setStatus("");
        canvas.classList.add("pv-ready");
      } catch (e) {
        if (!(e && e.name === "RenderingCancelledException")) {
          setStatus("تعذّر رسم هذه الصفحة. جرّب صفحة أخرى أو أعد فتح القسم.", true);
        }
      } finally {
        state.rendering = false;
        if (state.pending) { state.pending = false; renderPage(); }
      }
    }

    function goTo(n, noSave) {
      if (!state.doc) return;
      const clamped = Math.min(Math.max(1, Math.round(Number(n) || 1)), state.doc.numPages);
      state.page = clamped;
      updateUi();
      renderPage();
      stage.scrollTop = 0;
      if (!noSave) savePosition(opts.positionKey, state.page, state.zoom);
    }
    function setZoom(z) {
      state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
      updateUi();
      renderPage();
      savePosition(opts.positionKey, state.page, state.zoom);
    }

    bar.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-act]");
      if (!b) return;
      const act = b.getAttribute("data-act");
      if (act === "prev") goTo(state.page - 1);
      else if (act === "next") goTo(state.page + 1);
      else if (act === "zoomin") setZoom(state.zoom + ZOOM_STEP);
      else if (act === "zoomout") setZoom(state.zoom - ZOOM_STEP);
      else if (act === "fit") setZoom(1);
    });
    pageInput.addEventListener("change", () => goTo(pageInput.value));
    pageInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { goTo(pageInput.value); pageInput.blur(); } });
    // مفاتيح الأسهم: في الواجهة العربية (RTL) السهم الأيسر = التالية
    stage.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "PageDown") { e.preventDefault(); goTo(state.page + 1); }
      else if (e.key === "ArrowRight" || e.key === "PageUp") { e.preventDefault(); goTo(state.page - 1); }
      else if (e.key === "+" || e.key === "=") { setZoom(state.zoom + ZOOM_STEP); }
      else if (e.key === "-") { setZoom(state.zoom - ZOOM_STEP); }
    });
    // إعادة الرسم عند تغيّر عرض الشاشة (تدوير الجوال/تغيير حجم النافذة)
    let rzTimer = null, lastW = 0;
    function onResize() {
      if (!root.isConnected) { api.destroy(); return; }   // غادر الطالب الشاشة: لا نترك مستمعًا معلّقًا
      clearTimeout(rzTimer);
      rzTimer = setTimeout(() => {
        if (stage.clientWidth && Math.abs(stage.clientWidth - lastW) > 4) { lastW = stage.clientWidth; renderPage(); }
      }, 150);
    }
    window.addEventListener("resize", onResize);

    updateUi();

    const ready = loadLib().then(async (pdfjsLib) => {
      if (state.destroyed) return null;
      // disableFontFace: رسم الحروف كمسارات (paths) بدل FontFace: يتفادى تشويه ربط الحروف العربية الذي يظهر
      // مع خطوط ملفات Word/InDesign المضمَّنة عندما يعيد المتصفح تشكيلها (اختُبر على الكتاب والخطة).
      const task = pdfjsLib.getDocument({ url: opts.url, disableAutoFetch: true, disableStream: false,
        disableFontFace: opts.disableFontFace !== false });
      state.loadTask = task;
      const doc = await task.promise;
      if (state.destroyed) { try { doc.destroy(); } catch (e) { /* */ } return null; }
      // التحقق من هوية الملف قبل عرض أي صفحة
      if (opts.expectedPages && doc.numPages !== opts.expectedPages) {
        try { doc.destroy(); } catch (e) { /* */ }
        throw new Error(`الملف المعروض لا يطابق السجل المعتمد (عدد الصفحات ${doc.numPages} بدل ${opts.expectedPages}). لم يُعرض الملف لتفادي عرض نسخة خاطئة. أبلغ المعلم.`);
      }
      state.doc = doc;
      const saved = getPosition(opts.positionKey);
      if (saved && saved.page >= 1 && saved.page <= doc.numPages) {
        state.page = saved.page;
        if (saved.zoom) state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved.zoom));
        container.dispatchEvent(new CustomEvent("pv-resumed", { detail: { page: state.page } }));
      }
      lastW = stage.clientWidth;
      updateUi();
      await renderPage();
      return { resumed: !!(saved && saved.page === state.page), page: state.page, numPages: doc.numPages };
    }).catch((err) => {
      let msg = err && err.message ? err.message : "تعذّر فتح الملف";
      if (err && err.name === "MissingPDFException") msg = "ملف PDF غير موجود على الخادم (404). لم يُرفع الملف المسجَّل في السجل بعد.";
      else if (err && err.name === "InvalidPDFException") msg = "الملف المرفوع ليس ملف PDF صالحًا.";
      else if (err && err.name === "UnexpectedResponseException") msg = "تعذّر تحميل الملف من الخادم (استجابة غير متوقعة). تحقّق من الاتصال ثم أعد المحاولة.";
      const where = (window.TEACHER_MODE && opts.url && opts.url.indexOf("blob:") !== 0)
        ? '<br><small dir="ltr">المسار المطلوب على الخادم: ' + String(opts.url).replace(/[<>&"]/g, "") + '</small>' : "";
      setStatus("⚠️ " + msg + where + '<br><small>أبلغ المعلم إن استمرت المشكلة.</small>', true);
      throw err;
    });
    // لا نترك رفضًا غير معالَج
    ready.catch(() => {});

    const api = {
      ready,
      goTo,
      setZoom,
      getState: () => ({ page: state.page, zoom: state.zoom, numPages: state.doc ? state.doc.numPages : 0 }),
      destroy() {
        state.destroyed = true;
        window.removeEventListener("resize", onResize);
        try { if (state.task) state.task.cancel(); } catch (e) { /* */ }
        try { if (state.loadTask) state.loadTask.destroy(); } catch (e) { /* */ }
        try { if (state.doc) state.doc.destroy(); } catch (e) { /* */ }
      }
    };
    return api;
  }

  return { mount, loadLib, getPosition, savePosition };
})();

window.PdfViewer = PdfViewer;
