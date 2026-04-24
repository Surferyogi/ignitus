-- ═══════════════════════════════════════════════════════════════
--  Kizuna 絆 — RLS Circular Dependency Fix
--  Run this in Supabase SQL Editor.
--  Fixes: "infinite recursion detected in policy" error
--  which causes SYNC ERROR in the app.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. SECURITY DEFINER functions — bypass RLS safely ───────────
-- These run with postgres-level permissions, breaking the circular
-- dependency between entries_read → workspace_members → members_read

-- Returns workspace IDs the current user belongs to
CREATE OR REPLACE FUNCTION public.my_workspace_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid();
$$;

-- Returns user IDs of all workspace members the current user shares a workspace with
CREATE OR REPLACE FUNCTION public.my_workspace_member_ids()
RETURNS SETOF uuid
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT DISTINCT wm2.user_id
  FROM public.workspace_members wm1
  JOIN public.workspace_members wm2
    ON wm1.workspace_id = wm2.workspace_id
  WHERE wm1.user_id = auth.uid()
    AND wm2.user_id != auth.uid();
$$;

-- ── 2. Fix entries_read — use SECURITY DEFINER function ─────────
DROP POLICY IF EXISTS "entries_read" ON public.entries;

CREATE POLICY "entries_read" ON public.entries
  FOR SELECT USING (
    -- Own entries: always readable
    auth.uid() = user_id
    OR
    -- Shared entries from workspace members: use SECURITY DEFINER to avoid recursion
    (
      (data->>'visibility') = 'shared'
      AND user_id IN (SELECT public.my_workspace_member_ids())
    )
  );

-- ── 3. Fix members_read — use SECURITY DEFINER function ─────────
-- The old policy queried workspace_members to check workspace_members
-- (self-referential), causing the infinite recursion.
DROP POLICY IF EXISTS "members_read" ON public.workspace_members;

CREATE POLICY "members_read" ON public.workspace_members
  FOR SELECT USING (
    workspace_id IN (SELECT public.my_workspace_ids())
  );

-- ── 4. Fix workspace_read similarly ─────────────────────────────
DROP POLICY IF EXISTS "workspace_read" ON public.workspaces;

CREATE POLICY "workspace_read" ON public.workspaces
  FOR SELECT USING (
    id IN (SELECT public.my_workspace_ids())
  );

-- ── 5. Fix profiles_workspace_read similarly ────────────────────
DROP POLICY IF EXISTS "profiles_workspace_read" ON public.profiles;

CREATE POLICY "profiles_workspace_read" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR id IN (SELECT public.my_workspace_member_ids())
  );

-- ── 6. Fix invites_admin similarly ──────────────────────────────
DROP POLICY IF EXISTS "invites_admin" ON public.workspace_invites;

CREATE POLICY "invites_admin" ON public.workspace_invites
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Done. The SECURITY DEFINER functions bypass RLS at the function
-- level, preventing the circular dependency that caused SYNC ERROR.
