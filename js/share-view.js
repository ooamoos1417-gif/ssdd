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

  document.getElementById("heroSlideshowContainer").innerHTML = buildHeroSlideshow(p);
  initHeroSlideshow();

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
  document.getElementById("scheduleGrid").innerHTML = (data.schedule || []).length
    ? data.schedule.map((s) => `
        <div class="card list-card">
          <h3>${iconForFileType(s.file_type || "")} صورة الجدول</h3>
          ${s.file_url ? `<a class="btn btn-outline btn-sm" href="${s.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
        </div>`).join("")
    : `<p class="empty-state">لا توجد بيانات</p>`;

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

/* =====================================================================
   عرض الشرائح التقديمي — تعريفي بالكامل، للقراءة فقط (بدون أي أزرار
   تعديل أو حذف)، ينتقل تلقائيًا كل 5 ثوانٍ، ويدعم التنقّل اليدوي
   ===================================================================== */
function buildHeroSlideshow(p) {
  const name = p.full_name ? `أ/ ${p.full_name}` : "أ/ ــــــــ";
  const school = p.school || "";
  const avatarHtml = p.avatar_url
    ? `<img class="hs-avatar" src="${p.avatar_url}" alt="${escapeHtml(p.full_name || "")}" />`
    : `<div class="hs-avatar-fallback">${initials(p.full_name)}</div>`;

  const slides = [
    // 1) الترحيب
    `<div class="hs-slide active" data-slide="0">
      <span class="hs-watermark">🎓</span>
      ${avatarHtml}
      <h1 class="hs-title">مرحبًا بكم في ملف إنجازاتي</h1>
      <p class="hs-name">${escapeHtml(name)}</p>
      ${school ? `<p class="hs-school">${escapeHtml(school)}</p>` : ""}
    </div>`,
    // 2) المقدمة
    `<div class="hs-slide" data-slide="1">
      <p class="hs-eyebrow">مقدمة</p>
      <div class="hs-divider"></div>
      <p class="hs-body">${escapeHtml(p.intro_text || "")}</p>
    </div>`,
    // 3) رسالتي
    `<div class="hs-slide" data-slide="2">
      <p class="hs-eyebrow">رسالتي</p>
      <div class="hs-divider"></div>
      <p class="hs-body">${escapeHtml(p.mission_text || "")}</p>
    </div>`,
    // 4) رؤيتي
    `<div class="hs-slide" data-slide="3">
      <p class="hs-eyebrow">رؤيتي</p>
      <div class="hs-divider"></div>
      <p class="hs-body">${escapeHtml(p.vision_text || "")}</p>
    </div>`,
    // 5) رؤيتي نحو السعودية 2030
    `<div class="hs-slide" data-slide="4">
      <span class="hs-flag">🇸🇦</span>
      <p class="hs-eyebrow">رؤيتي نحو السعودية 2030</p>
      <div class="hs-divider"></div>
      <p class="hs-body">${escapeHtml(p.vision2030_text || "")}</p>
    </div>`,
    // 6) الشاشة الختامية + زر الاستعراض
    `<div class="hs-slide" data-slide="5">
      <span class="hs-watermark">✨</span>
      <h1 class="hs-title">رحلة إنجاز مستمرة</h1>
      <p class="hs-body" style="margin-top:14px;">كل إنجاز هو خطوة نحو التميز، وكل تجربة فرصة للتعلم والنمو.</p>
      <button class="hs-cta" id="hsCtaBtn">استعراض إنجازاتي ↓</button>
    </div>`,
  ];

  return `
    <section class="hero-slideshow" id="heroSlideshow">
      ${slides.join("")}
      <button class="hs-nav prev" id="hsPrev" aria-label="السابق">‹</button>
      <button class="hs-nav next" id="hsNext" aria-label="التالي">›</button>
      <div class="hs-dots" id="hsDots">
        ${slides.map((_, i) => `<button class="hs-dot${i === 0 ? " active" : ""}" data-dot="${i}" aria-label="الشريحة ${i + 1}"></button>`).join("")}
      </div>
      <button class="hs-skip" id="hsSkip">تخطي المقدمة ↓</button>
    </section>`;
}

function initHeroSlideshow() {
  const root = document.getElementById("heroSlideshow");
  if (!root) return;

  const slideEls = Array.from(root.querySelectorAll(".hs-slide"));
  const dotEls = Array.from(root.querySelectorAll(".hs-dot"));
  let current = 0;
  let timer = null;

  function goTo(index) {
    current = (index + slideEls.length) % slideEls.length;
    slideEls.forEach((el, i) => el.classList.toggle("active", i === current));
    dotEls.forEach((el, i) => el.classList.toggle("active", i === current));
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function restartAutoplay() {
    if (timer) clearInterval(timer);
    timer = setInterval(next, 5000);
  }

  document.getElementById("hsNext").addEventListener("click", () => { next(); restartAutoplay(); });
  document.getElementById("hsPrev").addEventListener("click", () => { prev(); restartAutoplay(); });
  dotEls.forEach((dot) => dot.addEventListener("click", () => { goTo(Number(dot.dataset.dot)); restartAutoplay(); }));

  function scrollToPortfolio() {
    if (timer) clearInterval(timer);
    document.getElementById("docBox").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  document.getElementById("hsSkip").addEventListener("click", scrollToPortfolio);
  document.getElementById("hsCtaBtn").addEventListener("click", scrollToPortfolio);

  restartAutoplay();
}
