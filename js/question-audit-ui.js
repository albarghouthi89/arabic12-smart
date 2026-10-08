/* ==========================================================================
   question-audit-ui.js — واجهة "وضع المعلم" لتشغيل تدقيق الأسئلة وعرض نتائجه
   ==========================================================================
   - لا تظهر هذه الصفحة في أي تنقّل يراه الطالب العادي: لا يوجد رابط إليها
     من الصفحة الرئيسية لبنك الأسئلة إلا حين يكون وضع المعلم مفعَّلًا
     (window.TEACHER_MODE ، مفعَّل فقط عبر رابط خاص — انظر app.js) — دون
     أي نظام تسجيل دخول أو اشتراكات أو Supabase.
   - لا تُعدّل أي سؤال من هنا؛ فقط تُشغِّل QuestionAudit.runFullAudit()
     صريحًا بضغطة المعلم، وتعرض/تُصفّي النتائج المحفوظة مسبقًا.
   ========================================================================== */

const QAuditUI = (function () {
  function shell() { return window.AppShell; }
  function el(tag, cls, html) { return shell().el(tag, cls, html); }
  function clear(c) { return shell().clear(c); }

  const SEVERITY_ORDER = { "🔴": 0, "🟠": 1, "🟢": 2 };

  function viewAudit(container) {
    container.appendChild(el("div", "qz-panel qz-panel-info",
      "🛠️ <strong>وضع المعلم — تدقيق منطقي لبنك الأسئلة</strong><br>" +
      "هذه الأداة تحلّل الأسئلة وتصنّفها فقط (🟢 متوافق / 🟠 يحتاج مراجعة / 🔴 خطأ واضح) دون أي تعديل تلقائي على أي سؤال أو إجابة أو حذف لها. " +
      "التدقيق عملية مستقلة تُشغَّل يدويًا من هنا فقط، ولا تُعاد تلقائيًا عند دخول الطلاب — النتائج تُحفظ على هذا الجهاز وتُعرض فورًا في المرة القادمة."));

    const controls = el("div", "qz-actions");
    const runBtn = el("button", "qz-btn qz-btn-primary", "▶ تشغيل التدقيق الآن (على كل الأسئلة)");
    const clearBtn = el("button", "qz-btn qz-btn-ghost", "🗑️ حذف النتائج المحفوظة");
    controls.appendChild(runBtn); controls.appendChild(clearBtn);
    container.appendChild(controls);

    const statusLine = el("p", "qz-muted");
    container.appendChild(statusLine);

    const summaryBox = el("div", "stats-row");
    container.appendChild(summaryBox);

    const filterRow = el("div", "bk-toggle-row");
    container.appendChild(filterRow);
    const resultsBox = el("div");
    container.appendChild(resultsBox);

    let currentFilter = "flagged"; // flagged | all | red | amber | green

    function renderSummary(payload) {
      clear(summaryBox);
      if (!payload) { statusLine.textContent = "لم يُشغَّل التدقيق بعد على هذا الجهاز — اضغط «تشغيل التدقيق الآن» للبدء."; return; }
      statusLine.textContent = `آخر تدقيق: ${new Date(payload.summary.generatedAt).toLocaleString("ar-QA")} — ${payload.summary.total} سؤالًا مفحوصًا`;
      summaryBox.appendChild(el("div", "stat-box", `<strong>${payload.summary.green}</strong><span>🟢 متوافق</span>`));
      summaryBox.appendChild(el("div", "stat-box", `<strong>${payload.summary.amber}</strong><span>🟠 يحتاج مراجعة</span>`));
      summaryBox.appendChild(el("div", "stat-box", `<strong>${payload.summary.red}</strong><span>🔴 خطأ واضح</span>`));
    }

    function renderResults(payload) {
      clear(resultsBox);
      if (!payload) return;
      let list = payload.results.slice().sort((a, b) => SEVERITY_ORDER[a.status] - SEVERITY_ORDER[b.status]);
      if (currentFilter === "flagged") list = list.filter(r => r.status !== "🟢");
      else if (currentFilter === "red") list = list.filter(r => r.status === "🔴");
      else if (currentFilter === "amber") list = list.filter(r => r.status === "🟠");
      else if (currentFilter === "green") list = list.filter(r => r.status === "🟢");

      if (!list.length) {
        resultsBox.appendChild(el("div", "qz-panel qz-panel-good", "لا توجد عناصر مطابقة لهذا الفلتر."));
        return;
      }
      list.forEach(r => {
        const card = el("div", "bk-browse-item");
        card.appendChild(el("div", "bk-meta-row",
          `<span class="bk-badge">${r.status} ${r.statusLabel}</span> ` +
          `<span class="bk-badge bk-badge-cat">${r.category || "—"}</span> ` +
          (r.subcategory ? `<span class="bk-badge bk-badge-topic">${r.subcategory}</span>` : "") +
          ` <span class="qz-muted">#${r.id}${r.sourcePage ? " · ص " + r.sourcePage : ""}</span>`));
        card.appendChild(el("p", "bk-browse-stem", r.questionExcerpt + (r.questionExcerpt.length >= 140 ? "…" : "")));
        if (r.reasons.length) {
          const reasonsList = el("div");
          r.reasons.forEach(rs => {
            reasonsList.appendChild(el("div", "qz-panel " + (rs.severity === "خطأ واضح" ? "qz-panel-bad" : "qz-panel-warn"),
              `${rs.severity === "خطأ واضح" ? "🔴" : "🟠"} ${rs.message}<br><span class="qz-muted">الإجراء المقترح: ${rs.suggestedAction}</span>`));
          });
          card.appendChild(reasonsList);
        } else {
          card.appendChild(el("div", "qz-panel qz-panel-good", "🟢 لم يُعثر على أي ملاحظة آلية على هذا السؤال."));
        }
        resultsBox.appendChild(card);
      });
    }

    function makeFilterBtn(label, key) {
      const b = el("button", "qz-btn qz-btn-outline bk-toggle-btn" + (currentFilter === key ? " active" : ""), label);
      b.addEventListener("click", () => {
        currentFilter = key;
        [...filterRow.children].forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        renderResults(QuestionAudit.loadSaved());
      });
      filterRow.appendChild(b);
    }
    makeFilterBtn("المطلوب مراجعتها (🟠+🔴)", "flagged");
    makeFilterBtn("الكل", "all");
    makeFilterBtn("🔴 خطأ واضح فقط", "red");
    makeFilterBtn("🟠 يحتاج مراجعة فقط", "amber");
    makeFilterBtn("🟢 متوافق فقط", "green");

    runBtn.addEventListener("click", () => {
      runBtn.disabled = true;
      statusLine.textContent = "جارٍ تشغيل التدقيق على كل الأسئلة...";
      setTimeout(() => {
        const payload = QuestionAudit.runFullAudit();
        renderSummary(payload);
        renderResults(payload);
        runBtn.disabled = false;
      }, 20);
    });

    clearBtn.addEventListener("click", () => {
      QuestionAudit.clearSaved();
      renderSummary(null);
      clear(resultsBox);
    });

    // عرض آخر نتيجة محفوظة فورًا دون إعادة التحليل (يفي بمتطلب الأداء:
    // لا إعادة تحليل الـ845 سؤالًا في كل زيارة)
    const saved = QuestionAudit.loadSaved();
    renderSummary(saved);
    renderResults(saved);
  }

  return { viewAudit };
})();
