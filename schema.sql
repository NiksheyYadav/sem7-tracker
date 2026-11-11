create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  roll_no text unique not null,
  name text not null,
  section text,
  password_hash text not null,
  is_admin boolean not null default false,
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists subjects (
  id serial primary key,
  code text,
  name text not null,
  short text not null,
  credits int,
  kind text not null default 'theory',          -- theory | seminar | training | elective
  is_default boolean not null default true,     -- shown to everyone unless hidden
  exam_date date,
  exam_slot text,
  units jsonb not null default '[]'::jsonb,     -- [{title, topics:[...]}]
  color text,
  owner_id uuid references users(id) on delete cascade,  -- null = shared subject
  sort int not null default 100
);

-- batch-wide deadlines set by admins (e.g. "TA2 for BDA due 20 Nov")
create table if not exists batch_deadlines (
  id serial primary key,
  subject_id int not null references subjects(id) on delete cascade,
  kind text not null,
  due_date date,
  note text,
  updated_at timestamptz not null default now(),
  unique (subject_id, kind)
);

create table if not exists assessments (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  subject_id int not null references subjects(id) on delete cascade,
  kind text not null,                 -- TA1..TA5, ERLA1, ERLA2, PA
  topic text,
  due_date date,
  report boolean not null default false,
  ppt boolean not null default false,
  viva boolean not null default false,
  submitted boolean not null default false,
  marks numeric,
  max_marks numeric,
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, subject_id, kind)
);

create table if not exists assignments (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  subject_id int references subjects(id) on delete set null,
  title text not null,
  due_date date,
  done boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists todos (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists topic_progress (
  user_id uuid not null references users(id) on delete cascade,
  subject_id int not null references subjects(id) on delete cascade,
  topic_key text not null,
  done boolean not null default true,
  primary key (user_id, subject_id, topic_key)
);

create table if not exists files (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  subject_id int references subjects(id) on delete set null,
  kind text,                      -- optional link to TA1.. / ERLA / PA / general
  name text not null,
  url text not null,
  pathname text not null,
  size bigint,
  content_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assess_user on assessments(user_id);
create index if not exists idx_assign_user on assignments(user_id);
create index if not exists idx_files_user on files(user_id);
create index if not exists idx_todos_user on todos(user_id);
