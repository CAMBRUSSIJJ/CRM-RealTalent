-- Server-only reminder queue foreign-key lookup indexes (Supabase advisor).
create index if not exists task_notification_outbox_assignee_idx
  on public.task_notification_outbox(assignee_id);
create index if not exists task_notification_outbox_organization_idx
  on public.task_notification_outbox(organization_id);
create index if not exists task_notification_preferences_user_idx
  on public.task_notification_preferences(user_id);
create index if not exists task_notification_verified_phones_user_idx
  on public.task_notification_verified_phones(user_id);
