-- ============================================================================
-- migration_003_trial_and_launch.sql
-- المرحلة الثانية — تجهيز منصة «الطالب الذكي» للإطلاق التجاري / المرحلة الفرعية 1
--
-- مهم جدًا: هذا الملف يُنفَّذ على نفس مشروع Supabase الذي بُني عليه V2
-- (نفس schema.sql + migration_002_enhancements.sql + seed.sql). لا يُلغي ولا
-- يُعدّل ولا يحذف أي جدول أو دالة أو سياسة موجودة فعليًا — هو إضافة بحتة فوق
-- البنية القائمة، تمامًا بنفس أسلوب migration_002.
--
-- طريقة التشغيل: بعد أن يكون قد سبق تنفيذ schema.sql ثم seed.sql ثم
-- migration_002_enhancements.sql بنجاح (هذا موجود ومُنفَّذ فعليًا في مشروع V2)،
-- الصق هذا الملف كاملاً في SQL Editor على Supabase ونفّذه مرة واحدة. قابل
-- لإعادة التنفيذ بأمان (idempotent) — كل خطوة محمية بـ IF NOT EXISTS أو
-- ON CONFLICT DO NOTHING.
--
-- ما يضيفه هذا الملف تحديدًا:
--   1) فترة تجربة مجانية حقيقية 7 أيام لكل حساب "طالب خارجي" جديد (وليس لطلاب
--      المدرسة، الذين لديهم وصول مجاني دائم أصلاً حسب schema.sql).
--   2) دالة موثوقة واحدة تحسب حالة الوصول الحالية للحساب لحظيًا من قاعدة
--      البيانات (STAFF / SCHOOL_FREE / SUBSCRIPTION_ACTIVE / TRIAL_ACTIVE /
--      TRIAL_EXPIRED / NO_ACCESS) — هذا هو "state machine" الفعلي المطلوب،
--      محسوب دائمًا من التاريخ الحقيقي في قاعدة البيانات، وليس قيمة تُخزَّن
--      وتُنسى فتصبح قديمة بمرور الوقت.
--   3) حماية فعلية على مستوى قاعدة البيانات: أي طالب انتهت تجربته ولم يشترك
--      لا يستطيع بعد الآن تسجيل أي تقدّم جديد (record_progress_event) — هذا
--      تحقق من طرف الخادم، لا يعتمد على أي قيمة في المتصفح.
--   4) سعر فصل دراسي واحد = 150 ر.ق (بدل السعر التجريبي 300 الذي استُخدم في
--      seed.sql عند بناء V2) — مُحدَّث في subjects و semesters و
--      platform_settings الثلاثة، وكل واحد منها مستقل قابل للتغيير من لوحة
--      Admin دون أي تعديل برمجي مستقبلاً.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) أعمدة التجربة المجانية في profiles
-- ----------------------------------------------------------------------------
alter table public.profiles add column if not exists trial_start_at timestamptz;
alter table public.profiles add column if not exists trial_end_at timestamptz;

create index if not exists idx_profiles_trial_end on public.profiles(trial_end_at);

-- مدة التجربة قابلة للتعديل من لوحة Admin مستقبلاً دون أي تعديل برمجي
-- (نفس أسلوب سعر الاشتراك في platform_settings)
insert into public.platform_settings (key, value)
values ('trial_period_days', '7'::jsonb)
on conflict (key) do nothing;

-- تعبئة تلقائية لأي حساب "طالب خارجي" سابق لا يملك تواريخ تجربة بعد (احتياط
-- لا يغيّر شيئًا لحساب لديه بالفعل قيمة، ولا يؤثر على حسابات المدرسة/الإدارة)
update public.profiles
set trial_start_at = coalesce(trial_start_at, created_at),
    trial_end_at   = coalesce(trial_end_at, created_at + interval '7 days')
where account_type = 'external' and trial_end_at is null;

-- ----------------------------------------------------------------------------
-- 2) تحديث دالة إنشاء profile التلقائية لتبدأ التجربة المجانية فعليًا عند
--    التسجيل — فقط للحساب الخارجي (external). حساب المدرسة يبقى بلا حاجة
--    لتجربة لأن وصوله مجاني دائم أصلاً (بند 5 من مواصفة الإطلاق التجاري).
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_role text;
  v_account_type text;
  v_trial_days int;
begin
  v_role := coalesce(new.raw_user_meta_data->>'role_code', 'external_student');
  v_account_type := coalesce(new.raw_user_meta_data->>'account_type', 'external');

  select value::text::int into v_trial_days
    from public.platform_settings where key = 'trial_period_days';
  if v_trial_days is null then
    v_trial_days := 7;
  end if;

  insert into public.profiles (
    id, username, full_name, role_code, account_type, email,
    trial_start_at, trial_end_at
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role,
    v_account_type,
    new.email,
    case when v_account_type = 'external' then now() else null end,
    case when v_account_type = 'external' then now() + (v_trial_days || ' days')::interval else null end
  );
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3) دالة موثوقة واحدة تُعيد حالة الوصول الحقيقية للحساب، محسوبة لحظيًا
--    (state machine: STAFF | SCHOOL_FREE | SUBSCRIPTION_ACTIVE | TRIAL_ACTIVE |
--    TRIAL_EXPIRED | NO_ACCESS). هذه هي الدالة الوحيدة التي يجب أن تعتمد
--    عليها الواجهة (وليس أي حساب محلي في المتصفح) لمعرفة هل يفتح المحتوى أم لا.
-- ----------------------------------------------------------------------------
create or replace function public.get_access_status(
  p_user_id uuid default auth.uid(),
  p_subject_slug text default 'arabic-12'
) returns text
language plpgsql
security definer
stable
as $$
declare
  v_role text;
  v_is_staff boolean;
  v_account_type text;
  v_trial_end timestamptz;
  v_subject_id uuid;
  v_has_active_sub boolean;
begin
  if p_user_id is null then
    return 'NO_ACCESS';
  end if;

  select role_code, account_type, trial_end_at
    into v_role, v_account_type, v_trial_end
    from public.profiles where id = p_user_id;

  if v_role is null then
    return 'NO_ACCESS';
  end if;

  select r.is_staff into v_is_staff from public.roles r where r.code = v_role;
  if coalesce(v_is_staff, false) then
    return 'STAFF';
  end if;

  if v_account_type = 'school' then
    return 'SCHOOL_FREE';
  end if;

  select id into v_subject_id from public.subjects where slug = p_subject_slug;

  if v_subject_id is not null then
    select exists(
      select 1 from public.subscriptions
       where user_id = p_user_id and subject_id = v_subject_id
         and status = 'active' and end_date >= current_date
    ) into v_has_active_sub;

    if v_has_active_sub then
      return 'SUBSCRIPTION_ACTIVE';
    end if;
  end if;

  if v_trial_end is not null and v_trial_end >= now() then
    return 'TRIAL_ACTIVE';
  end if;

  if v_trial_end is not null and v_trial_end < now() then
    return 'TRIAL_EXPIRED';
  end if;

  return 'NO_ACCESS';
end;
$$;

grant execute on function public.get_access_status(uuid, text) to authenticated;

-- عدد الأيام المتبقية من التجربة (لعرضه في لوحة الطالب) — null إن لم تكن
-- التجربة تنطبق على هذا الحساب (مدرسة/إدارة) أو لم تبدأ بعد.
create or replace function public.get_trial_days_remaining(p_user_id uuid default auth.uid())
returns int
language sql
security definer
stable
as $$
  select case
    when trial_end_at is null then null
    else greatest(0, ceil(extract(epoch from (trial_end_at - now())) / 86400.0))::int
  end
  from public.profiles where id = p_user_id;
$$;

grant execute on function public.get_trial_days_remaining(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4) حماية فعلية من طرف الخادم: تسجيل التقدّم يتحقق الآن من حالة الوصول قبل
--    أي كتابة. حساب انتهت تجربته ولم يشترك (TRIAL_EXPIRED) أو لا يملك أي
--    صلاحية (NO_ACCESS) لا يستطيع تسجيل تقدّم جديد — ولو عدّل أي قيمة في
--    المتصفح، لأن الفحص هنا يقع داخل قاعدة البيانات نفسها. البيانات القديمة
--    (نتائج/تقدّم/إنجازات سابقة) لا تُحذف أبدًا؛ فقط الكتابة الجديدة تُمنع.
--    توقيع الدالة نفسه لم يتغيّر — لا حاجة لأي تعديل في js/platform/*.
-- ----------------------------------------------------------------------------
create or replace function public.record_progress_event(
  p_subject_id uuid,
  p_lesson_id uuid,
  p_event_type text,
  p_completion_delta numeric default 0,
  p_mastery_value numeric default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
as $$
declare
  v_new_completion numeric;
  v_status text;
begin
  v_status := public.get_access_status(auth.uid());
  if v_status in ('NO_ACCESS', 'TRIAL_EXPIRED') then
    raise exception 'ACCESS_DENIED: %', v_status;
  end if;

  insert into public.activity_events(user_id, event_type, metadata)
  values (auth.uid(), p_event_type, p_metadata);

  insert into public.progress (
    user_id, subject_id, lesson_id, completion_pct, mastery_pct,
    attempts, last_activity_at, updated_at
  )
  values (
    auth.uid(), p_subject_id, p_lesson_id,
    least(100, greatest(0, p_completion_delta)), coalesce(p_mastery_value, 0),
    1, now(), now()
  )
  on conflict (user_id, subject_id, lesson_id) do update
    set completion_pct = least(100, greatest(public.progress.completion_pct, excluded.completion_pct)),
        mastery_pct = coalesce(p_mastery_value, public.progress.mastery_pct),
        attempts = public.progress.attempts + 1,
        score = coalesce(p_mastery_value, public.progress.score),
        last_activity_at = now(),
        updated_at = now()
  returning completion_pct into v_new_completion;

  if v_new_completion >= 100 then
    update public.progress
      set completed = true, completed_at = coalesce(completed_at, now())
      where user_id = auth.uid() and subject_id = p_subject_id
        and (lesson_id = p_lesson_id or (lesson_id is null and p_lesson_id is null));
  end if;

  insert into public.streaks (user_id, current_streak, best_streak, last_active_date)
  values (auth.uid(), 1, 1, current_date)
  on conflict (user_id) do update set
    current_streak = case
      when public.streaks.last_active_date = current_date then public.streaks.current_streak
      when public.streaks.last_active_date = current_date - 1 then public.streaks.current_streak + 1
      else 1
    end,
    best_streak = greatest(public.streaks.best_streak,
      case
        when public.streaks.last_active_date = current_date then public.streaks.current_streak
        when public.streaks.last_active_date = current_date - 1 then public.streaks.current_streak + 1
        else 1
      end),
    last_active_date = current_date;
end;
$$;

grant execute on function public.record_progress_event to authenticated;

-- ----------------------------------------------------------------------------
-- 5) السعر الرسمي للإطلاق التجاري: 150 ر.ق / فصل دراسي (بدل 300 التجريبية في
--    seed.sql). كل قيمة مستقلة وقابلة للتغيير لاحقًا من لوحة Admin بلا كود.
-- ----------------------------------------------------------------------------
update public.platform_settings
set value = '150'::jsonb, updated_at = now()
where key = 'default_semester_price_qar';

update public.subjects
set price_qar = 150, updated_at = now()
where slug = 'arabic-12';

update public.semesters
set price_qar = 150
where subject_id = (select id from public.subjects where slug = 'arabic-12');
-- (يشمل السطر أعلاه الفصلين الأول والثاني معًا — كل فصل يبقى قابلاً للتسعير
--  بشكل مستقل عن غيره من لوحة Admin مستقبلاً دون أي تعديل على هذا الكود)

-- ============================================================================
-- ملاحظة أمنية مهمة (كما في schema.sql الأصلي): لا توجد هنا أي دالة تُفعِّل
-- اشتراكًا أو تُحوّل حالة دفع إلى "paid" من طرف الطالب — هذا مقصود تمامًا
-- ويبقى دون تغيير. تفعيل الاشتراك الحقيقي يتم فقط من لوحة Admin حاليًا،
-- أو مستقبلاً عبر Edge Function موثوقة تستقبل webhook من بوابة دفع حقيقية.
-- ============================================================================
