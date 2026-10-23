-- ============================================================================
-- migration_004_accounts.sql — حسابات الطلاب (البريد الإلكتروني فقط، مجانية)
--
-- يُنفَّذ مرة واحدة على مشروع Supabase **جديد** (لا يعتمد على schema.sql ولا
-- على migration_002/003 القديمة، ولا يجوز تنفيذه فوقها). قابل لإعادة التنفيذ.
--
-- ما يضيفه فقط:
--   1) جدول profiles: اسم العرض للطالب مربوطًا بمعرّف Supabase Auth.
--   2) سياسات RLS: كل مستخدم يقرأ ملفه فقط، ويعدّل اسمه فقط.
--   3) trigger ينشئ الملف عند التسجيل، ويأخذ من بيانات التسجيل الاسم وحده.
--
-- ما لا يضيفه عمدًا:
--   - لا أدوار ولا نوع حساب ولا حالة اشتراك في profiles: أي قيمة يرسلها
--     المتصفح عند التسجيل يمكن تزويرها، فلا تُستخدم إلا كاسم عرض.
--     الصلاحيات والاشتراكات لاحقًا تكون في جداول منفصلة لا يكتب فيها إلا
--     الخادم (service_role / Edge Functions).
--   - لا كلمات مرور ولا رموز جلسات: كلها داخل auth.* التي يديرها Supabase.
-- ============================================================================

-- 1) الجدول ---------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2) الصلاحيات -------------------------------------------------------------
-- Supabase يمنح anon/authenticated كل الصلاحيات على جداول public افتراضيًا؛
-- نسحبها ثم نعيد الحد الأدنى: قراءة، وتعديل عمود display_name وحده.
-- لا INSERT ولا DELETE من المتصفح: الإنشاء عبر الـ trigger، والحذف بحذف
-- المستخدم من auth.users (on delete cascade).
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 3) updated_at تلقائي -----------------------------------------------------
create or replace function public.profiles_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.profiles_touch_updated_at();

-- 4) إنشاء الملف عند التسجيل ----------------------------------------------
-- الاسم وحده من raw_user_meta_data، بعد إزالة محارف التحكم وقصّه إلى 40 حرفًا.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'display_name', ''), '[[:cntrl:]]', '', 'g')), 40)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
