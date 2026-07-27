/* =====================================================================
   منطق صفحة عرض المشاركة العامة (بدون تسجيل دخول)
   ===================================================================== */

// يجب أن تطابق هذي القائمة تمامًا نفس القائمة في js/dashboard.js
const CRITERIA = [
  { id: "job-duties", title: "أداء الواجبات الوظيفية" },
  { id: "professional-community", title: "التفاعل مع المجتمع المهني" },
  { id: "parents-interaction", title: "التفاعل مع أولياء الأمور" },
  { id: "teaching-strategies", title: "التنوع في استراتيجيات التدريس" },
  { id: "learners-results", title: "تحسين نتائج المتعلمين" },
  { id: "learning-plan", title: "إعداد وتنفيذ خطة التعلم" },
  { id: "learning-tech", title: "توظيف تقنيات ووسائل التعلم المناسبة" },
  { id: "learning-environment", title: "تهيئة بيئة تعليمية" },
  { id: "classroom-management", title: "الإدارة الصفية" },
  { id: "results-analysis", title: "تحليل نتائج المتعلمين وتشخيص مستوياتهم" },
  { id: "assessment-methods", title: "تنوع أساليب التقويم" },
];

const ERROR_MESSAGES = {
  invalid: { icon: "⚠️", title: "رابط غير صحيح" },
  disabled: { icon: "🚫", title: "تم تعطيل هذا الرابط من قِبل المعلم" },
  expired: { icon: "⏰", title: "انتهت صلاحية هذا الرابط" },
};

(async function init() {
  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) return showError("invalid");

  const { data, error } = await supabaseClient.rpc("get_shared_portfolio", { p_token: token });

  document.getElementById("loadingBox").style.display = "none";

  if (error || !data) return showError("invalid");
  if (data.error) return showError(data.error);

  renderPortfolio(data);
})();

function showError(kind) {
  document.getElementById("loadingBox").style.display = "none";
  const box = document.getElementById("errorBox");
  const info = ERROR_MESSAGES[kind] || ERROR_MESSAGES.invalid;
  document.getElementById("errorIcon").textContent = info.icon;
  document.getElementById("errorTitle").textContent = info.title;
  box.style.display = "block";
}

function renderPortfolio(data) {
  document.getElementById("docBox").style.display = "block";

  const p = data.profile || {};
  document.getElementById("teacherName").textContent = p.full_name || "معلم";
  document.getElementById("teacherMeta").textContent = [p.subject, p.school].filter(Boolean).join(" — ") || "—";
  document.getElementById("docAvatar").textContent = initials(p.full_name);

  document.getElementById("statSchedule").textContent = (data.schedule || []).length;
  document.getElementById("statCerts").textContent = (data.certificates || []).length;
  document.getElementById("statCourses").textContent = (data.courses || []).length;

  const criteriaEvidence = data.criteria_evidence || [];
  const documentedCriteriaCount = new Set(criteriaEvidence.map((e) => e.criterion_id)).size;
  document.getElementById("statCriteria").textContent = documentedCriteriaCount;

  // الجدول الدراسي
  const scheduleBody = document.getElementById("scheduleBody");
  scheduleBody.innerHTML = (data.schedule || []).length
    ? data.schedule.map((s) => `<tr><td>${escapeHtml(s.day)}</td><td>${escapeHtml(s.period)}</td><td>${escapeHtml(s.class_name)}</td><td>${escapeHtml(s.subject)}</td></tr>`).join("")
    : `<tr><td colspan="4"><p class="empty-state">لا توجد بيانات</p></td></tr>`;

  // الشهادات
  document.getElementById("certsGrid").innerHTML = (data.certificates || []).length
    ? data.certificates.map((c) => `
        <div class="card list-card">
          <h3>🏅 ${escapeHtml(c.title)}</h3>
          <div class="meta-row">${c.issuer ? `<span class="badge">${escapeHtml(c.issuer)}</span>` : ""}${c.issue_date ? `<span class="badge gold">${formatDate(c.issue_date)}</span>` : ""}</div>
          ${c.file_url ? `<a class="btn btn-outline btn-sm" href="${c.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
        </div>`).join("")
    : `<p class="empty-state">لا توجد شهادات</p>`;

  // الدورات
  document.getElementById("coursesGrid").innerHTML = (data.courses || []).length
    ? data.courses.map((c) => `
        <div class="card list-card">
          <h3>🎓 ${escapeHtml(c.title)}</h3>
          <div class="meta-row">
            ${c.provider ? `<span class="badge">${escapeHtml(c.provider)}</span>` : ""}
            ${c.hours ? `<span class="badge gold">${c.hours} ساعة</span>` : ""}
            ${c.course_date ? `<span class="badge">${formatDate(c.course_date)}</span>` : ""}
          </div>
          ${c.file_url ? `<a class="btn btn-outline btn-sm" href="${c.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
        </div>`).join("")
    : `<p class="empty-state">لا توجد دورات</p>`;

  // الزيارات
  document.getElementById("visitsGrid").innerHTML = (data.classroom_visits || []).length
    ? data.classroom_visits.map((v) => `
        <div class="card list-card">
          <h3>🚪 ${escapeHtml(v.visitor_name)}</h3>
          <div class="meta-row"><span class="badge">${formatDate(v.visit_date)}</span>${v.rating != null ? `<span class="rating-pill">⭐ ${v.rating}/100</span>` : ""}</div>
          ${v.notes ? `<p class="notes">${escapeHtml(v.notes)}</p>` : ""}
        </div>`).join("")
    : `<p class="empty-state">لا توجد زيارات</p>`;

  // التقييم
  document.getElementById("evalGrid").innerHTML = (data.evaluations || []).length
    ? data.evaluations.map((ev) => `
        <div class="card list-card">
          <h3>📊 ${escapeHtml(ev.period)}</h3>
          <div class="meta-row">${ev.score != null ? `<span class="rating-pill">${ev.score}/100</span>` : ""}</div>
          ${ev.notes ? `<p class="notes">${escapeHtml(ev.notes)}</p>` : ""}
        </div>`).join("")
    : `<p class="empty-state">لا توجد تقييمات</p>`;

  // ملفات الشواهد
  document.getElementById("filesList").innerHTML = (data.evidence_files || []).length
    ? data.evidence_files.map((f) => `
        <div class="file-row">
          <div class="ficon">${iconForFileType(f.file_type || f.file_name)}</div>
          <div class="finfo"><div class="fname">${escapeHtml(f.file_name)}</div><div class="fmeta">${f.category || "عام"} · ${formatDate(f.uploaded_at)}</div></div>
          <div class="factions"><a class="icon-btn" href="${f.file_url}" target="_blank" title="عرض">👁️</a></div>
        </div>`).join("")
    : `<p class="empty-state">لا توجد ملفات</p>`;

  // المعايير — تُعرض كل الـ11 معيارًا (وليس فقط الموثَّقة منها) حتى يرى
  // المدير/المشرف الصورة الكاملة لملف المعلم
  document.getElementById("criteriaList").innerHTML = CRITERIA.map((c) => {
    const items = criteriaEvidence.filter((e) => e.criterion_id === c.id);
    return `
      <div class="card" style="padding:16px 18px;">
        <div class="top" style="margin-bottom: ${items.length ? "10px" : "0"};">
          <h3>${escapeHtml(c.title)}</h3>
          <span class="badge gold">${items.length} ${items.length === 1 ? "شاهد" : "شواهد"}</span>
        </div>
        ${items.length
          ? `<div class="file-list" style="margin-top:0;">
              ${items.map((f) => `
                <div class="file-row">
                  <div class="ficon">${iconForFileType(f.file_type || f.file_name)}</div>
                  <div class="finfo"><div class="fname">${escapeHtml(f.title || f.file_name)}</div><div class="fmeta">${formatDate(f.uploaded_at)}</div></div>
                  <div class="factions"><a class="icon-btn" href="${f.file_url}" target="_blank" title="عرض">👁️</a></div>
                </div>`).join("")}
             </div>`
          : `<p class="empty-state" style="padding:10px 0;">لا توجد شواهد لهذا المعيار بعد</p>`}
      </div>`;
  }).join("");
}
