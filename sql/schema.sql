-- =====================================================================
-- منصة ملفات إنجاز المعلمين (SaaS) — المخطط الكامل لقاعدة البيانات
-- نفّذ هذا الملف بالكامل مرة واحدة في Supabase SQL Editor
-- =====================================================================

-- =====================================================================
-- 1) الملفات الشخصية — بيانات يعدّلها المعلم بنفسه
-- =====================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  subject text default '',
  school text default '',
  stage text default '',
  created_at timestamptz default now()
);

-- =====================================================================
-- 2) الحسابات — بيانات إدارية لا يستطيع المعلم تعديلها إطلاقًا
--    (الدور، حالة الاشتراك، الإيقاف) — مفصولة عمدًا عن profiles
-- =====================================================================
create table if not exists public.accounts (
  id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  subscription_status text not null default 'active' check (subscription_status in ('active', 'expired', 'trial')),
  subscription_end_date date,
  suspended boolean not null default false,
  created_at timestamptz default now()
);

-- =====================================================================
-- 3) الجدول الدراسي
-- =====================================================================
create table if not exists public.schedule (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  day text not null,
  period text not null,
  class_name text not null,
  subject text not null,
  created_at timestamptz default now()
);

-- =====================================================================
-- 4) الشهادات
-- =====================================================================
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  issuer text default '',
  issue_date date,
  file_url text,
  file_path text,
  created_at timestamptz default now()
);

-- =====================================================================
-- 5) الدورات التدريبية
-- =====================================================================
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  provider text default '',
  hours numeric default 0,
  course_date date,
  file_url text,
  file_path text,
  created_at timestamptz default now()
);

-- =====================================================================
-- 6) الزيارات الصفية
-- =====================================================================
create table if not exists public.classroom_visits (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  visitor_name text not null,
  visit_date date,
  rating numeric,
  notes text,
  created_at timestamptz default now()
);

-- =====================================================================
-- 7) التقييمات الأدائية
-- =====================================================================
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  period text not null,
  score numeric,
  notes text,
  created_at timestamptz default now()
);

-- =====================================================================
-- 8) ملفات الشواهد العامة (PDF / Word / Excel / صور)
-- =====================================================================
create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  file_name text not null,
  category text default 'عام',
  file_url text not null,
  file_path text not null,
  file_type text,
  file_size bigint default 0,
  uploaded_at timestamptz default now()
);

-- =====================================================================
-- 9) روابط مشاركة الملف (للمدير/المشرف — عرض فقط، بدون تسجيل دخول)
-- =====================================================================
create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  disabled boolean not null default false,
  expires_at timestamptz,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists share_links_token_idx on public.share_links (token);

-- =====================================================================
-- تفعيل أمان الصفوف (RLS) على كل الجداول
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.schedule enable row level security;
alter table public.certificates enable row level security;
alter table public.courses enable row level security;
alter table public.classroom_visits enable row level security;
alter table public.evaluations enable row level security;
alter table public.evidence_files enable row level security;
alter table public.share_links enable row level security;

-- =====================================================================
-- دالة مساعدة: هل المستخدم الحالي أدمن؟ (تُستخدم داخل سياسات RLS)
-- security definer لتفادي التكرار اللانهائي عند قراءتها من داخل سياسة accounts
-- =====================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.accounts where id = auth.uid() and role = 'admin'
  );
$$;

-- =====================================================================
-- سياسات profiles: المعلم يرى/يعدّل ملفه فقط، الأدمن يرى/يعدّل الكل
-- =====================================================================
create policy "select own or admin" on public.profiles for select
  using (auth.uid() = id or public.is_admin());
create policy "update own or admin" on public.profiles for update
  using (auth.uid() = id or public.is_admin());
create policy "admin can insert profiles" on public.profiles for insert
  with check (public.is_admin() or auth.uid() = id);
create policy "admin can delete profiles" on public.profiles for delete
  using (public.is_admin());

-- =====================================================================
-- سياسات accounts: المعلم يرى حسابه فقط (بلا تعديل)، الأدمن يرى/يعدّل الكل
-- =====================================================================
create policy "teacher can view own account" on public.accounts for select
  using (auth.uid() = id or public.is_admin());
create policy "only admin can modify accounts" on public.accounts for all
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================================
-- سياسات موحّدة لجداول بيانات المعلم (نفس النمط لكل جدول)
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array['schedule','certificates','courses','classroom_visits','evaluations','evidence_files']
  loop
    execute format('create policy "select own %1$s" on public.%1$s for select using (auth.uid() = teacher_id or public.is_admin());', t);
    execute format('create policy "insert own %1$s" on public.%1$s for insert with check (auth.uid() = teacher_id);', t);
    execute format('create policy "update own %1$s" on public.%1$s for update using (auth.uid() = teacher_id);', t);
    execute format('create policy "delete own %1$s" on public.%1$s for delete using (auth.uid() = teacher_id);', t);
  end loop;
end $$;

-- =====================================================================
-- سياسات share_links: المعلم يدير روابطه فقط، الأدمن يرى الكل (للإشراف)
-- =====================================================================
create policy "teacher manages own share links" on public.share_links for all
  using (auth.uid() = teacher_id or public.is_admin())
  with check (auth.uid() = teacher_id or public.is_admin());

-- =====================================================================
-- إنشاء profile + account تلقائيًا عند إنشاء أي مستخدم جديد
-- (يعمل سواء أُنشئ المستخدم عبر Admin API من api/admin/teachers.js)
-- بيانات إضافية (الاسم، المادة...) تُمرَّر عبر raw_user_meta_data عند الإنشاء
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, subject, school, stage)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'subject', ''),
    coalesce(new.raw_user_meta_data->>'school', ''),
    coalesce(new.raw_user_meta_data->>'stage', '')
  );
  insert into public.accounts (id, role, subscription_status, subscription_end_date)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'teacher'),
    coalesce(new.raw_user_meta_data->>'subscription_status', 'active'),
    nullif(new.raw_user_meta_data->>'subscription_end_date', '')::date
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
-- دالة عرض الملف المشترك (عام — تتجاوز RLS بأمان بعد التحقق من صلاحية
-- الرابط فقط). يُستدعى من صفحة share.html عبر supabase.rpc() بمفتاح anon
-- =====================================================================
create or replace function public.get_shared_portfolio(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link record;
  v_result jsonb;
begin
  select * into v_link from public.share_links where token = p_token;

  if not found then
    return jsonb_build_object('error', 'invalid');
  end if;
  if v_link.disabled then
    return jsonb_build_object('error', 'disabled');
  end if;
  if v_link.expires_at is not null and v_link.expires_at < now() then
    return jsonb_build_object('error', 'expired');
  end if;

  update public.share_links
    set view_count = view_count + 1, last_viewed_at = now()
    where id = v_link.id;

  select jsonb_build_object(
    'profile', (select jsonb_build_object('full_name', full_name, 'subject', subject, 'school', school, 'stage', stage)
                from public.profiles where id = v_link.teacher_id),
    'schedule', (select coalesce(jsonb_agg(s.* order by s.day), '[]'::jsonb) from public.schedule s where s.teacher_id = v_link.teacher_id),
    'certificates', (select coalesce(jsonb_agg(c.* order by c.issue_date desc nulls last), '[]'::jsonb) from public.certificates c where c.teacher_id = v_link.teacher_id),
    'courses', (select coalesce(jsonb_agg(co.* order by co.course_date desc nulls last), '[]'::jsonb) from public.courses co where co.teacher_id = v_link.teacher_id),
    'classroom_visits', (select coalesce(jsonb_agg(v.* order by v.visit_date desc nulls last), '[]'::jsonb) from public.classroom_visits v where v.teacher_id = v_link.teacher_id),
    'evaluations', (select coalesce(jsonb_agg(e.*), '[]'::jsonb) from public.evaluations e where e.teacher_id = v_link.teacher_id),
    'evidence_files', (select coalesce(jsonb_agg(jsonb_build_object(
                          'file_name', file_name, 'category', category,
                          'file_url', file_url, 'file_type', file_type, 'uploaded_at', uploaded_at
                        )), '[]'::jsonb) from public.evidence_files f where f.teacher_id = v_link.teacher_id)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_shared_portfolio(text) to anon, authenticated;

-- =====================================================================
-- التخزين: حاوية ملفات الشواهد
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('evidence-files', 'evidence-files', true)
on conflict (id) do nothing;

-- كل معلم يرفع/يقرأ/يحذف فقط داخل مجلد باسم معرّف حسابه (uid/...)
create policy "teacher manages own files" on storage.objects for all
  using (bucket_id = 'evidence-files' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'evidence-files' and auth.uid()::text = (storage.foldername(name))[1]);

-- =====================================================================
-- ملاحظة: لا يوجد أي مسار "تسجيل حساب" في هذا التطبيق. الحسابات تُنشأ
-- حصرًا عبر api/admin/teachers.js باستخدام صلاحية service_role، بعد أن
-- يتأكد الخادم أن المستدعي أدمن فعليًا. يُنصح أيضًا بتعطيل "Enable email
-- signups" من Supabase Dashboard → Authentication → Providers → Email،
-- كطبقة حماية إضافية تمنع أي تسجيل ذاتي حتى عبر استدعاء مباشر لواجهة
-- Supabase Auth من خارج هذا التطبيق.
-- =====================================================================
