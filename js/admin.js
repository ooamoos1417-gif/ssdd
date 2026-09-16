/* =====================================================================
   منطق لوحة الإدارة
   ===================================================================== */

let adminUser = null;

(async function init() {
  const auth = await requireRole("admin");
  if (!auth) return;
  adminUser = auth.session.user;

  document.getElementById("sidebarName").textContent = adminUser.email;
  document.getElementById("avatarInitial").textContent = initials(adminUser.email);

  bindNav();
  bindSidebarToggle();
  bindModals();
  bindLogout();
  bindCreateTeacherForm();
  bindEditTeacherForm();
  bindGeneratePassword();

  await Promise.all([loadTeachers(), loadAllShareLinks(), loadStorageUsage()]);
})();

/* ---------------------- التنقّل ---------------------- */
function bindNav() {
  const links = document.querySelectorAll(".nav-link");
  const sections = document.querySelectorAll(".section");
  const topbarTitle = document.getElementById("topbarTitle");

  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.dataset.target;
      links.forEach((l) => l.classList.remove("active"));
      link.classList.add("active");
      sections.forEach((s) => (s.style.display = s.id === targetId ? "block" : "none"));
      topbarTitle.textContent = link.textContent.trim();
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("sidebarOverlay").classList.remove("show");
    });
  });
  sections.forEach((s) => (s.style.display = s.id === "overview" ? "block" : "none"));
}

function bindSidebarToggle() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  document.getElementById("menuToggle").addEventListener("click", () => { sidebar.classList.add("open"); overlay.classList.add("show"); });
  overlay.addEventListener("click", () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); });
}

function bindLogout() {
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
  });
}

function bindModals() {
  document.querySelectorAll("[data-modal]").forEach((btn) => btn.addEventListener("click", () => document.getElementById(btn.dataset.modal).classList.add("show")));
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => btn.closest(".modal-overlay").classList.remove("show")));
  document.querySelectorAll(".modal-overlay").forEach((overlay) => overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("show"); }));
}
function closeModal(id) { document.getElementById(id).classList.remove("show"); }

function bindGeneratePassword() {
  document.getElementById("generatePasswordBtn").addEventListener("click", () => {
    document.getElementById("newTeacherPassword").value = generateStrongPassword(10);
  });
}

/* ---------------------- استدعاء دالة الخادم الوحيدة ---------------------- */
async function callAdminApi(body) {
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !sessionData?.session) {
    throw new Error("انتهت جلستك — سجّل الدخول مرة أخرى");
  }

  const res = await fetch("/api/admin/teachers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session.access_token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const debugParts = [data.debugReason, data.debugDetail, data.debugRole ? `role=${data.debugRole}` : null]
      .filter(Boolean)
      .join(" | ");
    throw new Error(debugParts ? `${data.error} (${debugParts})` : data.error || "حدث خطأ غير متوقع");
  }
  return data;
}

/* =====================================================================
   إنشاء حساب معلمة
   ===================================================================== */
function bindCreateTeacherForm() {
  document.getElementById("createTeacherForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("createTeacherSubmitBtn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>`;

    try {
      await callAdminApi({
        action: "create",
        fullName: val("newTeacherName"),
        email: val("newTeacherEmail"),
        password: val("newTeacherPassword"),
        subject: val("newTeacherSubject"),
        school: val("newTeacherSchool"),
        endDate: val("newTeacherEndDate") || null,
      });
      showToast("تم إنشاء حساب المعلمة بنجاح — أرسلي لها بيانات الدخول", "success");
      e.target.reset();
      closeModal("createTeacherModal");
      loadTeachers();
    } catch (err) {
      showToast(err.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = "إنشاء الحساب";
    }
  });
}

/* =====================================================================
   عرض/تعديل/إيقاف/حذف المعلمين
   ===================================================================== */
async function loadTeachers() {
  const { data, error } = await supabaseClient
    .from("accounts")
    .select("id, subscription_status, subscription_end_date, suspended, profiles(email, full_name, subject, school)")
    .eq("role", "teacher")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  document.getElementById("statTotalTeachers").textContent = data.length;
  document.getElementById("statActiveSubs").textContent = data.filter((t) => t.subscription_status === "active").length;
  document.getElementById("statExpiredSubs").textContent = data.filter((t) => t.subscription_status === "expired").length;
  document.getElementById("statSuspended").textContent = data.filter((t) => t.suspended).length;

  const body = document.getElementById("teachersTableBody");
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="7"><p class="empty-state">لا توجد معلمات بعد</p></td></tr>`;
    return;
  }

  const statusBadge = { active: '<span class="badge success">نشط</span>', trial: '<span class="badge gold">تجربة</span>', expired: '<span class="badge danger">منتهي</span>' };

  body.innerHTML = data.map((t) => {
    const p = t.profiles || {};
    return `
    <tr>
      <td>${escapeHtml(p.full_name || "—")}</td>
      <td style="direction:ltr; text-align:left;">${escapeHtml(p.email || "—")}</td>
      <td>${escapeHtml(p.school || "—")}</td>
      <td>${statusBadge[t.subscription_status] || t.subscription_status}</td>
      <td>${t.subscription_end_date ? formatDate(t.subscription_end_date) : "—"}</td>
      <td>${t.suspended ? '<span class="badge danger">موقوف</span>' : '<span class="badge success">فعّال</span>'}</td>
      <td style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="icon-btn" title="عرض الملف" onclick="openTeacherPortfolio('${t.id}', '${escapeHtml(p.full_name || "—")}')">👁️</button>
        <button class="icon-btn" title="تعديل" onclick='openEditTeacher(${JSON.stringify({ id: t.id, full_name: p.full_name, subject: p.subject, school: p.school, subscription_status: t.subscription_status, subscription_end_date: t.subscription_end_date })})'>✏️</button>
        <button class="icon-btn" title="${t.suspended ? "إعادة تفعيل" : "إيقاف"}" onclick="toggleSuspend('${t.id}', ${!t.suspended})">${t.suspended ? "✅" : "🚫"}</button>
        <button class="icon-btn" title="حذف نهائي" onclick="deleteTeacher('${t.id}', '${escapeHtml(p.full_name || "")}')">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

function openEditTeacher(t) {
  document.getElementById("editTeacherId").value = t.id;
  document.getElementById("editTeacherName").value = t.full_name || "";
  document.getElementById("editTeacherSubject").value = t.subject || "";
  document.getElementById("editTeacherSchool").value = t.school || "";
  document.getElementById("editTeacherStatus").value = t.subscription_status || "active";
  document.getElementById("editTeacherEndDate").value = t.subscription_end_date || "";
  document.getElementById("editTeacherModal").classList.add("show");
}

function bindEditTeacherForm() {
  document.getElementById("editTeacherForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = val("editTeacherId");

    const { error: profileError } = await supabaseClient.from("profiles").update({
      full_name: val("editTeacherName"), subject: val("editTeacherSubject"), school: val("editTeacherSchool"),
    }).eq("id", id);

    const { error: accountError } = await supabaseClient.from("accounts").update({
      subscription_status: val("editTeacherStatus"), subscription_end_date: val("editTeacherEndDate") || null,
    }).eq("id", id);

    if (profileError || accountError) { showToast("تعذّر حفظ التعديلات", "error"); return; }
    showToast("تم حفظ التعديلات", "success");
    closeModal("editTeacherModal");
    loadTeachers();
  });
}

async function toggleSuspend(id, suspend) {
  if (!confirm(suspend ? "إيقاف هذا الحساب سيمنع المعلمة من الدخول فورًا. متابعة؟" : "إعادة تفعيل هذا الحساب؟")) return;
  const { error } = await supabaseClient.from("accounts").update({ suspended: suspend }).eq("id", id);
  if (error) return showToast("تعذّر تحديث الحساب", "error");
  showToast(suspend ? "تم إيقاف الحساب" : "تم تفعيل الحساب", "success");
  loadTeachers();
}

async function deleteTeacher(id, name) {
  if (!confirm(`سيتم حذف حساب "${name}" وكل بياناته نهائيًا ولا يمكن التراجع. متابعة؟`)) return;
  try {
    await callAdminApi({ action: "delete", teacherId: id });
    showToast("تم حذف الحساب", "success");
    loadTeachers();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* =====================================================================
   روابط المشاركة (إشراف الأدمن على كل الروابط)
   ===================================================================== */
async function loadAllShareLinks() {
  const { data, error } = await supabaseClient
    .from("share_links")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return; }

  const body = document.getElementById("allSharesTableBody");
  if (!data.length) {
    body.innerHTML = `<tr><td colspan="6"><p class="empty-state">لا توجد روابط مشاركة بعد</p></td></tr>`;
    return;
  }

  body.innerHTML = data.map((l) => {
    const status = l.disabled ? "disabled" : (l.expires_at && new Date(l.expires_at).getTime() < Date.now()) ? "expired" : "active";
    const badge = { active: '<span class="badge success">فعّال</span>', expired: '<span class="badge warn">منتهي</span>', disabled: '<span class="badge mute">معطّل</span>' }[status];
    return `
      <tr>
        <td>${escapeHtml(l.profiles?.full_name || "—")}</td>
        <td>${formatDate(l.created_at)}</td>
        <td>${l.expires_at ? formatDate(l.expires_at) : "بدون انتهاء"}</td>
        <td>${l.view_count}</td>
        <td>${badge}</td>
        <td>${status !== "disabled" ? `<button class="icon-btn" onclick="adminDisableLink('${l.id}')" title="تعطيل">🚫</button>` : ""}</td>
      </tr>`;
  }).join("");
}

async function adminDisableLink(id) {
  if (!confirm("تعطيل هذا الرابط فورًا؟")) return;
  const { error } = await supabaseClient.from("share_links").update({ disabled: true }).eq("id", id);
  if (error) return showToast("تعذّر تعطيل الرابط", "error");
  showToast("تم تعطيل الرابط", "success");
  loadAllShareLinks();
}

/* =====================================================================
   مساحة التخزين
   ===================================================================== */
async function loadStorageUsage() {
  const { data, error } = await supabaseClient.from("evidence_files").select("teacher_id, file_size, profiles(full_name)");
  if (error) { console.error(error); return; }

  const totals = {};
  let grandTotal = 0;
  data.forEach((f) => {
    const key = f.teacher_id;
    if (!totals[key]) totals[key] = { name: f.profiles?.full_name || "—", count: 0, size: 0 };
    totals[key].count++;
    totals[key].size += f.file_size || 0;
    grandTotal += f.file_size || 0;
  });

  document.getElementById("totalStorageUsed").textContent = formatFileSize(grandTotal) || "0 ميجابايت";

  const rows = Object.values(totals).sort((a, b) => b.size - a.size);
  const body = document.getElementById("storageTableBody");
  body.innerHTML = rows.length
    ? rows.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.count}</td><td>${formatFileSize(r.size)}</td></tr>`).join("")
    : `<tr><td colspan="3"><p class="empty-state">لا توجد ملفات مرفوعة بعد</p></td></tr>`;
}

function val(id) { return document.getElementById(id).value.trim(); }

/* =====================================================================
   عرض ملف معلمة كامل (قراءة فقط للمديرة) — نفس ما يراه المشرف عبر
   رابط المشاركة، لكن مباشرة من لوحة الإدارة بدون الحاجة لرابط خاص.
   لا يوجد هنا أي أداة تعديل أو حذف — عرض فقط.
   ===================================================================== */
const ADMIN_CRITERIA = [
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
  { id: "other-criteria", title: "معايير أخرى" },
];

async function openTeacherPortfolio(teacherId, teacherName) {
  document.getElementById("viewTeacherTitle").textContent = `ملف ${teacherName}`;
  document.getElementById("viewTeacherContent").innerHTML = `<p class="empty-state">جارٍ التحميل...</p>`;
  document.getElementById("viewTeacherModal").classList.add("show");

  const [profileRes, scheduleRes, certsRes, coursesRes, visitsRes, evalsRes, criteriaRes, filesRes] = await Promise.all([
    supabaseClient.from("profiles").select("*").eq("id", teacherId).maybeSingle(),
    supabaseClient.from("schedule").select("*").eq("teacher_id", teacherId).order("created_at", { ascending: false }),
    supabaseClient.from("certificates").select("*").eq("teacher_id", teacherId).order("issue_date", { ascending: false }),
    supabaseClient.from("courses").select("*").eq("teacher_id", teacherId).order("course_date", { ascending: false }),
    supabaseClient.from("classroom_visits").select("*").eq("teacher_id", teacherId).order("visit_date", { ascending: false }),
    supabaseClient.from("evaluations").select("*").eq("teacher_id", teacherId),
    supabaseClient.from("criteria_evidence").select("*").eq("teacher_id", teacherId),
    supabaseClient.from("evidence_files").select("*").eq("teacher_id", teacherId).order("uploaded_at", { ascending: false }),
  ]);

  const p = profileRes.data || {};
  const schedule = scheduleRes.data || [];
  const certificates = certsRes.data || [];
  const courses = coursesRes.data || [];
  const visits = visitsRes.data || [];
  const evaluations = evalsRes.data || [];
  const criteriaEvidence = criteriaRes.data || [];
  const files = filesRes.data || [];

  document.getElementById("viewTeacherContent").innerHTML = `
    <div style="text-align:center; padding-bottom:16px; border-bottom:1px solid var(--line); margin-bottom:16px;">
      ${p.avatar_url
        ? `<img src="${p.avatar_url}" alt="" style="width:72px; height:72px; border-radius:50%; object-fit:cover; border:2px solid var(--gold); margin-bottom:8px;" />`
        : `<div class="avatar" style="width:72px; height:72px; font-size:24px; margin:0 auto 8px;">${initials(p.full_name)}</div>`}
      <h3 style="font-size:18px;">${escapeHtml(p.full_name || teacherName)}</h3>
      <p style="color:var(--ink-soft); font-size:13px;">${[p.subject, p.school].filter(Boolean).map(escapeHtml).join(" — ") || "—"}</p>
    </div>

    <div class="grid cols-3" style="margin-bottom:20px;">
      <div class="stat-tile"><b>${schedule.length}</b><span>حصص دراسية</span></div>
      <div class="stat-tile"><b>${certificates.length}</b><span>شهادات</span></div>
      <div class="stat-tile"><b>${courses.length}</b><span>دورات تدريبية</span></div>
    </div>

    <h4 style="margin-bottom:8px;">🗓️ الجدول الدراسي</h4>
    <div class="grid cols-2" style="margin-bottom:20px;">
      ${schedule.length ? schedule.map((s) => `
        <div class="card list-card">
          <h3>${iconForFileType(s.file_type || "")} صورة الجدول</h3>
          ${s.file_url ? `<a class="btn btn-outline btn-sm" href="${s.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
        </div>`).join("") : `<p class="empty-state">لا توجد بيانات</p>`}
    </div>

    <h4 style="margin-bottom:8px;">🏅 الشهادات</h4>
    <div class="grid cols-2" style="margin-bottom:20px;">
      ${certificates.length ? certificates.map((c) => `
        <div class="card list-card"><h3>${escapeHtml(c.title)}</h3>
          <div class="meta-row">${c.issuer ? `<span class="badge">${escapeHtml(c.issuer)}</span>` : ""}${c.issue_date ? `<span class="badge gold">${formatDate(c.issue_date)}</span>` : ""}</div>
          ${c.file_url ? `<a class="btn btn-outline btn-sm" href="${c.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
        </div>`).join("") : `<p class="empty-state">لا توجد شهادات</p>`}
    </div>

    <h4 style="margin-bottom:8px;">🎓 الدورات التدريبية</h4>
    <div class="grid cols-2" style="margin-bottom:20px;">
      ${courses.length ? courses.map((c) => `
        <div class="card list-card"><h3>${escapeHtml(c.title)}</h3>
          <div class="meta-row">
            ${c.provider ? `<span class="badge">${escapeHtml(c.provider)}</span>` : ""}
            ${c.hours ? `<span class="badge gold">${c.hours} ساعة</span>` : ""}
            ${c.course_date ? `<span class="badge">${formatDate(c.course_date)}</span>` : ""}
          </div>
          ${c.file_url ? `<a class="btn btn-outline btn-sm" href="${c.file_url}" target="_blank">عرض الملف 📄</a>` : ""}
        </div>`).join("") : `<p class="empty-state">لا توجد دورات</p>`}
    </div>

    <h4 style="margin-bottom:8px;">🚪 الزيارات الصفية</h4>
    <div class="grid cols-2" style="margin-bottom:20px;">
      ${visits.length ? visits.map((v) => `
        <div class="card list-card"><h3>${escapeHtml(v.visitor_name)}</h3>
          <div class="meta-row"><span class="badge">${formatDate(v.visit_date)}</span>${v.rating != null ? `<span class="rating-pill">⭐ ${v.rating}/100</span>` : ""}</div>
          ${v.notes ? `<p class="notes">${escapeHtml(v.notes)}</p>` : ""}
        </div>`).join("") : `<p class="empty-state">لا توجد زيارات</p>`}
    </div>

    <h4 style="margin-bottom:8px;">📊 التقييم الأدائي</h4>
    <div class="grid cols-2" style="margin-bottom:20px;">
      ${evaluations.length ? evaluations.map((ev) => `
        <div class="card list-card"><h3>${escapeHtml(ev.period)}</h3>
          <div class="meta-row">${ev.score != null ? `<span class="rating-pill">${ev.score}/100</span>` : ""}</div>
          ${ev.notes ? `<p class="notes">${escapeHtml(ev.notes)}</p>` : ""}
        </div>`).join("") : `<p class="empty-state">لا توجد تقييمات</p>`}
    </div>

    <h4 style="margin-bottom:8px;">📋 المعايير</h4>
    <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:20px;">
      ${ADMIN_CRITERIA.map((crit) => {
        const items = criteriaEvidence.filter((e) => e.criterion_id === crit.id);
        return `
          <div class="card" style="padding:14px 16px;">
            <div class="top" style="margin-bottom:${items.length ? "8px" : "0"};">
              <h3 style="font-size:14px;">${escapeHtml(crit.title)}</h3>
              <span class="badge gold">${items.length} ${items.length === 1 ? "شاهد" : "شواهد"}</span>
            </div>
            ${items.length ? `<div class="file-list" style="margin-top:0;">
              ${items.map((f) => `
                <div class="file-row">
                  <div class="ficon">${iconForFileType(f.file_type || f.file_name)}</div>
                  <div class="finfo"><div class="fname">${escapeHtml(f.title || f.file_name)}</div><div class="fmeta">${formatDate(f.uploaded_at)}</div></div>
                  <div class="factions"><a class="icon-btn" href="${f.file_url}" target="_blank" title="عرض">👁️</a></div>
                </div>`).join("")}
            </div>` : ""}
          </div>`;
      }).join("")}
    </div>

    <h4 style="margin-bottom:8px;">📎 ملفات الشواهد العامة</h4>
    <div class="file-list">
      ${files.length ? files.map((f) => `
        <div class="file-row">
          <div class="ficon">${iconForFileType(f.file_type || f.file_name)}</div>
          <div class="finfo"><div class="fname">${escapeHtml(f.file_name)}</div><div class="fmeta">${f.category || "عام"} · ${formatDate(f.uploaded_at)}</div></div>
          <div class="factions"><a class="icon-btn" href="${f.file_url}" target="_blank" title="عرض">👁️</a></div>
        </div>`).join("") : `<p class="empty-state">لا توجد ملفات</p>`}
    </div>
  `;
}
