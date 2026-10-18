/* ==========================================================================
   answer-audit-ui.js — واجهة "وضع المعلم" لتشغيل Answer Audit وعرض نتائجه.
   ==========================================================================
   - لا تظهر هذه الصفحة لأي طالب عادي: تُضاف بطاقتها فقط ضمن نفس كتلة
     window.TEACHER_MODE الموجودة أصلًا في questions-bank-ui.js، بجانب بطاقة
     "تدقيق الأسئلة" الحالية، دون التأثير عليها.
   - لا تُعدّل أي سؤال أو إجابة من هنا؛ فقط تُشغِّل AnswerAudit.runFullAudit()
     صريحًا بضغطة المعلم، وتعرض/تُصفّي النتائج المحفوظة مسبقًا.
   ========================================================================== */

const AAuditUI = (function () {
  function shell() { return window.AppShell; }
  function el(tag, cls, html) { return shell().el(tag, cls, html); }
  function clear(c) { return shell().clear(c); }

  const SEVERITY_ORDER = { "🔴": 0, "🟠": 1, "🟢": 2 };

  function viewAnswerAudit(container) {
    container.appendChild(el("div", "qz-panel qz-panel-info",
      "🧪 <strong>وضع المعلم — Answer Audit (تدقيق جودة الإجابات المُضافة)</strong><br>" +
      "تفحص هذه الأداة جودة الإجابات التي أُضيفت لبنك الأسئلة فقط (لا صياغة السؤال نفسه — لذلك موجود في «تدقيق الأسئلة» المنفصل): إجابة مفقودة، إجابة لا تناسب نوع السؤال، إجابة ضعيفة أو مكررة أو ذات تعليل غير منطقي، وأسئلة إنشائية بلا Rubric. " +
      "التدقيق يدوي بالكامل ولا يُعدّل أي شيء — النتائج تُحفظ على هذا الجهاز فقط."));

    const controls = el("div", "qz-actions");
    const runBtn = el("button", "qz-btn qz-btn-primary", "▶ تشغيل Answer Audit الآن");
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

    let currentFilter = "flagged"; // flagged | all | red | amber | clean

    function renderSummary(payload) {
      clear(summaryBox);
      if (!payload) { statusLine.textContent = "لم يُشغَّل Answer Audit بعد على هذا الجهاز — اضغط «تشغيل Answer Audit الآن» للبدء."; return; }
      statusLine.textContent = `آخر تشغيل: ${new Date(payload.summary.generatedAt).toLocaleString("ar-QA")} — ${payload.summary.total} سؤالًا مفحوصًا`;
      summaryBox.appendChild(el("div", "stat-box", `<strong>${payload.summary.clean}</strong><span>🟢 إجابة سليمة</span>`));
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
      else if (currentFilter === "clean") list = list.filter(r => r.status === "🟢");

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
          (r.answerSource ? ` <span class="bk-badge">${r.answerSource}</span>` : "") +
          (r.answerConfidence ? ` <span class="bk-badge">ثقة: ${r.answerConfidence}</span>` : "") +
          ` <span class="qz-muted">#${r.id}</span>`));
        card.appendChild(el("p", "bk-browse-stem", r.questionExcerpt + (r.questionExcerpt.length >= 140 ? "…" : "")));
        if (r.reasons.length) {
          const reasonsList = el("div");
          r.reasons.forEach(rs => {
            reasonsList.appendChild(el("div", "qz-panel " + (rs.severity === "خطأ واضح" ? "qz-panel-bad" : "qz-panel-warn"),
              `${rs.severity === "خطأ واضح" ? "🔴" : "🟠"} ${rs.message}<br><span class="qz-muted">الإجراء المقترح: ${rs.suggestedAction}</span>`));
          });
          card.appendChild(reasonsList);
        } else {
          card.appendChild(el("div", "qz-panel qz-panel-good", "🟢 لم يُعثر على أي ملاحظة آلية على إجابة هذا السؤال."));
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
        renderResults(AnswerAudit.loadSaved());
      });
      filterRow.appendChild(b);
    }
    makeFilterBtn("المطلوب مراجعتها (🟠+🔴)", "flagged");
    makeFilterBtn("الكل", "all");
    makeFilterBtn("🔴 خطأ واضح فقط", "red");
    makeFilterBtn("🟠 يحتاج مراجعة فقط", "amber");
    makeFilterBtn("🟢 سليمة فقط", "clean");

    runBtn.addEventListener("click", () => {
      runBtn.disabled = true;
      statusLine.textContent = "جارٍ تشغيل Answer Audit على كل الأسئلة...";
      setTimeout(() => {
        const payload = AnswerAudit.runFullAudit();
        renderSummary(payload);
        renderResults(payload);
        runBtn.disabled = false;
      }, 20);
    });

    clearBtn.addEventListener("click", () => {
      AnswerAudit.clearSaved();
      renderSummary(null);
      clear(resultsBox);
    });

    const saved = AnswerAudit.loadSaved();
    renderSummary(saved);
    renderResults(saved);
  }

  return { viewAnswerAudit };
})();
