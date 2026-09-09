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
