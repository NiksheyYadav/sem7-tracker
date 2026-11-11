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
