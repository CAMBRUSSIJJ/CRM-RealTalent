-- Cloud Task Notifications: enable read-only access for the real queue.
-- A per-task RLS policy already restricts rows to tasks visible to the member.
-- Do not grant INSERT/UPDATE/DELETE or token/provider fields to browsers.
GRANT SELECT (
  id, organization_id, task_id, assignee_id, event_type,
  channel, status, scheduled_at, processed_at, created_at, last_error
) ON TABLE public.task_notification_outbox TO authenticated;
