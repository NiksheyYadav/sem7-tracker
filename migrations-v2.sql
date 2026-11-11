-- v2: unit assessments, calendar events, update log, push notifications, study notes
create table if not exists exams (id serial primary key, subject_id int not null references subjects(id) on delete cascade, name text not null, exam_date date, slot text, note text, updated_at timestamptz not null default now());
insert into exams (subject_id, name, exam_date, slot) select id, 'UA-3', exam_date, exam_slot from subjects where exam_date is not null and not exists (select 1 from exams e where e.subject_id = subjects.id and e.name = 'UA-3');
insert into exams (subject_id, name, exam_date, slot, note) values (5, 'UA-2', '2026-11-25', 'Timing to be announced', 'Seminar on Emerging Technologies is a theory subject (30 marks). Prepare the 15 important questions in Study notes.');
create table if not exists events (id bigserial primary key, user_id uuid references users(id) on delete cascade, subject_id int references subjects(id) on delete set null, title text not null, event_date date not null, event_time text, note text, color text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists idx_events_user on events(user_id);
insert into events (user_id, subject_id, title, event_date, note) values (null, 4, 'ERLA Assessment — Adhoc & WSN', '2026-11-13', 'ERLA assessment for Adhoc and Wireless Sensor Network.');
create table if not exists updates (id serial primary key, version text, title text not null, body text, kind text not null default 'release', created_at timestamptz not null default now());
create table if not exists push_subs (endpoint text primary key, user_id uuid not null references users(id) on delete cascade, p256dh text not null, auth text not null, created_at timestamptz not null default now());
create table if not exists push_log (user_id uuid not null references users(id) on delete cascade, key text not null, sent_at timestamptz not null default now(), primary key (user_id, key));
alter table subjects add column if not exists notes_md text;
update subjects set kind='minor', is_default=true, short='Cyber Sec', credits=2, color='#e11d48', sort=7 where id=8;
update subjects set name='Seminar on Emerging Technologies' where id=5;

-- v3: sections/groups, scoped admins, feedback, class notes uploads
alter table users add column if not exists grp text;
alter table updates add column if not exists target_section text, add column if not exists target_group text, add column if not exists author_roll text;
alter table events add column if not exists target_section text, add column if not exists target_group text;
alter table exams add column if not exists target_section text, add column if not exists target_group text;
alter table batch_deadlines add column if not exists target_section text, add column if not exists target_group text;
alter table batch_deadlines drop constraint if exists batch_deadlines_subject_id_kind_key;
create unique index if not exists batch_deadlines_target_uq on batch_deadlines (subject_id, kind, (coalesce(target_section,'')), (coalesce(target_group,'')));
create table if not exists admins (roll_no text primary key, scope_section text, added_by text, created_at timestamptz not null default now());
create table if not exists feedback (id bigserial primary key, user_id uuid references users(id) on delete set null, category text not null default 'idea',
  rating int, message text not null, status text not null default 'new', reply text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists shared_notes (id bigserial primary key, subject_id int not null references subjects(id) on delete cascade, unit_idx int,
  title text, name text not null, pathname text not null unique, size bigint not null default 0, content_type text,
  uploaded_by uuid references users(id) on delete set null, author_roll text, target_section text, target_group text, created_at timestamptz not null default now());
create index if not exists shared_notes_subject on shared_notes (subject_id);
-- v2.4b: custom assessment types per subject
alter table subjects add column if not exists custom_kinds jsonb not null default '[]'::jsonb, add column if not exists default_kinds jsonb;
