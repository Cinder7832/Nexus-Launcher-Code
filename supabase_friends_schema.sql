-- ============================================================
-- Nexus Launcher – Friends System Schema
-- Run this SQL in your Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  friend_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  current_game text default null,
  current_game_id text default null,
  is_online boolean default false,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

-- Enable RLS
alter table profiles enable row level security;

-- Anyone can read profiles (needed to search friend codes / see friends)
create policy "Profiles are viewable by everyone" on profiles
  for select using (true);

-- Users can insert/update their own profile
create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);


-- 2) Friendships
create table if not exists friendships (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete cascade not null,
  receiver_id uuid references profiles(id) on delete cascade not null,
  status text check (status in ('pending', 'accepted', 'blocked')) default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(sender_id, receiver_id)
);

alter table friendships enable row level security;

-- Users can see friendships they're part of
create policy "Users see own friendships" on friendships
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Users can create friendships as sender
create policy "Users can send friend requests" on friendships
  for insert with check (auth.uid() = sender_id);

-- Users can update friendships they received (accept/reject) or sent (cancel)
create policy "Users can update own friendships" on friendships
  for update using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Users can delete friendships they're part of (unfriend)
create policy "Users can delete own friendships" on friendships
  for delete using (auth.uid() = sender_id or auth.uid() = receiver_id);


-- 3) Messages
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete cascade not null,
  receiver_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

alter table messages enable row level security;

-- Users can see messages they sent or received
create policy "Users see own messages" on messages
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Users can send messages
create policy "Users can send messages" on messages
  for insert with check (auth.uid() = sender_id);

-- Users can mark messages as read (receiver only)
create policy "Receiver can update messages" on messages
  for update using (auth.uid() = receiver_id);

-- Users can delete their own sent messages
create policy "Sender can delete own messages" on messages
  for delete using (auth.uid() = sender_id);

-- Index for fast message queries
create index if not exists idx_messages_conversation
  on messages (least(sender_id, receiver_id), greatest(sender_id, receiver_id), created_at desc);

-- Indexes for sender/receiver lookups and realtime filter paths
create index if not exists idx_messages_sender on messages (sender_id, created_at desc);
create index if not exists idx_messages_receiver on messages (receiver_id, created_at desc);

-- Partial index for fast unread count queries
create index if not exists idx_messages_unread
  on messages (receiver_id, is_read) where is_read = false;

-- Index for friendship lookups
create index if not exists idx_friendships_sender on friendships (sender_id);
create index if not exists idx_friendships_receiver on friendships (receiver_id);

-- ============================================================
-- Stale-presence cleanup
-- Marks users offline if their last heartbeat (last_seen) is
-- older than 2 minutes.  Call via pg_cron every minute:
--   select cron.schedule('cleanup-stale-presence', '* * * * *',
--     $$ select mark_stale_profiles_offline(); $$);
-- ============================================================
create or replace function mark_stale_profiles_offline()
returns void language sql security definer as $$
  update profiles
  set is_online = false,
      current_game = null,
      current_game_id = null
  where is_online = true
    and last_seen < now() - interval '2 minutes';
$$;

-- ============================================================
-- Enable Realtime on these tables (for live updates)
-- Go to Supabase Dashboard → Database → Replication
-- and enable realtime for: profiles, friendships, messages
-- ============================================================
