-- Publish results for social_posts.
--
-- Until now social_posts was write-only: Ember inserted drafts and nothing in
-- the server ever advanced them. The admin PATCH could flip `status` to
-- 'posted' but called no publisher, so a row could read as live having never
-- reached Facebook. These two columns record what actually happened when
-- PATCH /api/admin/ember/social-posts/:id runs with { action: 'publish' }.
ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS platform_post_id text,
  ADD COLUMN IF NOT EXISTS failure_reason   text;
