/* =====================================================================
   POST /api/admin/teachers
   نقطة النهاية الوحيدة في هذا المشروع التي تحتاج خادمًا — لأن إنشاء/حذف
   حساب مصادقة حقيقي في Supabase يتطلّب مفتاح service_role الذي لا يجوز
   إطلاقًا كشفه في المتصفح.

   body: { action: "create", fullName, email, password, subject, school,
           stage, endDate }
   body: { action: "delete", teacherId }
   body: { action: "reset-password", teacherId, newPassword }

   يتحقّق من هوية المستدعي عبر رمز الجلسة (Authorization: Bearer <token>)
   ثم يتأكد من جدول accounts أنه أدمن فعليًا، قبل تنفيذ أي عملية.
   ===================================================================== */

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCallerIfAdmin(req, supabase) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (!account || account.role !== "admin") return null;
  return userData.user;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const supabase = getServiceClient();
  if (!supabase) {
    res.status(500).json({ error: "لم يتم إعداد الخادم بشكل صحيح" });
    return;
  }

  const caller = await getCallerIfAdmin(req, supabase);
  if (!caller) {
    res.status(403).json({ error: "غير مصرح — يجب أن تكون مسجّلًا كأدمن" });
    return;
  }

  const { action } = req.body || {};

  if (action === "create") {
    const { fullName, email, password, subject, school, stage, endDate } = req.body || {};
    if (!fullName || !email || !password) {
      res.status(400).json({ error: "الاسم والبريد وكلمة المرور مطلوبة" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "يجب ألا تقل كلمة المرور عن 8 أحرف" });
      return;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        subject: subject || "",
        school: school || "",
        stage: stage || "",
        role: "teacher",
        subscription_status: "active",
        subscription_end_date: endDate || "",
      },
    });

    if (error) {
      console.error("admin/teachers create error:", error);
      res.status(400).json({ error: error.message.includes("already been registered") ? "هذا البريد الإلكتروني مسجّل مسبقًا" : "تعذّر إنشاء الحساب" });
      return;
    }

    res.status(200).json({ user: { id: data.user.id, email: data.user.email } });
    return;
  }

  if (action === "delete") {
    const { teacherId } = req.body || {};
    if (!teacherId) {
      res.status(400).json({ error: "معرّف المعلم مطلوب" });
      return;
    }
    const { error } = await supabase.auth.admin.deleteUser(teacherId);
    if (error) {
      console.error("admin/teachers delete error:", error);
      res.status(500).json({ error: "تعذّر حذف الحساب" });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === "reset-password") {
    const { teacherId, newPassword } = req.body || {};
    if (!teacherId || !newPassword || newPassword.length < 8) {
      res.status(400).json({ error: "بيانات غير صحيحة — كلمة المرور يجب ألا تقل عن 8 أحرف" });
      return;
    }
    const { error } = await supabase.auth.admin.updateUserById(teacherId, { password: newPassword });
    if (error) {
      console.error("admin/teachers reset-password error:", error);
      res.status(500).json({ error: "تعذّر تحديث كلمة المرور" });
      return;
    }
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: "action غير معروف" });
}
