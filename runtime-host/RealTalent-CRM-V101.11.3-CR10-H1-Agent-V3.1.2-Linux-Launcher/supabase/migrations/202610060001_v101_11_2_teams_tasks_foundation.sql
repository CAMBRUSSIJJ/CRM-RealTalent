begin;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text not null default '',
  leader_id uuid null references auth.users(id) on delete set null,
  color text not null default '#1D9E75',
  active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_not_blank check (length(trim(name)) > 0),
  constraint teams_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists teams_org_name_unique on public.teams(organization_id, lower(name));
create index if not exists teams_org_active_idx on public.teams(organization_id, active);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('leader','member')),
  allocation_percent integer not null default 100 check (allocation_percent between 0 and 100),
  created_at timestamptz not null default now(),
  unique(team_id, user_id)
);
create index if not exists team_members_org_idx on public.team_members(organization_id);
create index if not exists team_members_user_idx on public.team_members(user_id);

create table if not exists public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null default 'todo' check (status in ('todo','in_progress','blocked','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  starts_at timestamptz null,
  due_at timestamptz null,
  completed_at timestamptz null,
  assignee_id uuid null references auth.users(id) on delete set null,
  assignee_name text not null default '',
  team_id uuid null references public.teams(id) on delete set null,
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekly','monthly')),
  tags text[] not null default '{}'::text[],
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_tasks_title_not_blank check (length(trim(title)) > 0)
);
create index if not exists work_tasks_org_status_idx on public.work_tasks(organization_id, status);
create index if not exists work_tasks_org_due_idx on public.work_tasks(organization_id, due_at);
create index if not exists work_tasks_assignee_idx on public.work_tasks(organization_id, assignee_id);
create index if not exists work_tasks_team_idx on public.work_tasks(organization_id, team_id);

create table if not exists public.task_relations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  entity_type text not null check (entity_type in ('contact','company','opportunity','lead','pipeline','playbook','meeting')),
  entity_id text not null,
  entity_label text not null default '',
  created_at timestamptz not null default now(),
  unique(task_id, entity_type, entity_id)
);
create index if not exists task_relations_entity_idx on public.task_relations(organization_id, entity_type, entity_id);

create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_checklist_title_not_blank check (length(trim(title)) > 0)
);
create index if not exists task_checklist_task_idx on public.task_checklist_items(task_id, position);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_id uuid not null references public.work_tasks(id) on delete cascade,
  author_id uuid null references auth.users(id) on delete set null,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_comment_body_not_blank check (length(trim(body)) > 0)
);
create index if not exists task_comments_task_idx on public.task_comments(task_id, created_at);

create trigger teams_touch_updated_at before update on public.teams for each row execute function public.touch_updated_at();
create trigger work_tasks_touch_updated_at before update on public.work_tasks for each row execute function public.touch_updated_at();
create trigger task_checklist_touch_updated_at before update on public.task_checklist_items for each row execute function public.touch_updated_at();
create trigger task_comments_touch_updated_at before update on public.task_comments for each row execute function public.touch_updated_at();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.work_tasks enable row level security;
alter table public.task_relations enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_comments enable row level security;

create policy teams_select on public.teams for select to authenticated using (public.is_organization_member(organization_id));
create policy teams_write on public.teams for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));
create policy team_members_select on public.team_members for select to authenticated using (public.is_organization_member(organization_id));
create policy team_members_write on public.team_members for all to authenticated using (public.is_organization_admin(organization_id)) with check (public.is_organization_admin(organization_id));

create policy work_tasks_select on public.work_tasks for select to authenticated using (public.is_organization_member(organization_id));
create policy work_tasks_write on public.work_tasks for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy task_relations_select on public.task_relations for select to authenticated using (public.is_organization_member(organization_id));
create policy task_relations_write on public.task_relations for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy task_checklist_select on public.task_checklist_items for select to authenticated using (public.is_organization_member(organization_id));
create policy task_checklist_write on public.task_checklist_items for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));
create policy task_comments_select on public.task_comments for select to authenticated using (public.is_organization_member(organization_id));
create policy task_comments_write on public.task_comments for all to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id));

commit;
