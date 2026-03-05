// renderer/pages/friends.page.js
(function () {
  // ---- State ----
  let myProfile = null;
  let currentTab = "friends"; // friends | requests
  let friendsList = [];       // accepted friendships with profile data
  let pendingIncoming = [];   // incoming pending requests
  let pendingSent = [];       // outgoing pending requests
  let activeChatFriend = null;
  let chatMessages = [];
  let realtimeSubs = [];
  let presenceInterval = null;
  let unreadCounts = {};      // friendId -> count
  let searchFilter = "";      // live search filter for friends list
  let typingChannel = null;
  let friendIsTyping = false; // whether the active chat friend is currently typing
  let friendTypingTimer = null;
  let myTypingTimer = null;
  let lastTypingSent = 0;
  let msgPollInterval = null;      // polling fallback for chat messages
  let friendPollInterval = null;   // polling fallback for friend requests / list changes

  // ---- Helpers ----
  function sb() { return window.sb; }
  function myId() { return myProfile?.id || null; }

  function avatarLetter(name) {
    return String(name || "?").charAt(0).toUpperCase();
  }

  function timeAgo(dateStr) {
    const d = new Date(dateStr);
    const s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function formatTime(dateStr) {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  function readReceiptHtml(msg) {
    const isMine = msg.sender_id === myId();
    if (!isMine) return "";
    const isTemp = String(msg.id).startsWith("temp-");
    if (isTemp) return `<span class="nxFrMsgCheck"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg></span>`;
    if (msg.is_read) return `<span class="nxFrMsgCheck read"><svg viewBox="0 0 24 24"><path d="M17 6L6 17l-5-5"></path><path d="M23 6L12 17"></path></svg></span>`;
    return `<span class="nxFrMsgCheck"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"></path></svg></span>`;
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function playingStatusHtml(gameName, gameId) {
    if (!gameName) return "";
    if (gameId) {
      return `Playing <span class="nxFrGameLink" data-game-id="${escapeHtml(gameId)}" title="View game page">${escapeHtml(gameName)}<svg viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></span>`;
    }
    return `Playing ${escapeHtml(gameName)}`;
  }

  // Stale-presence check: treat a profile as online only if is_online
  // AND last_seen is within 90 seconds (3× the 30-second heartbeat).
  const PRESENCE_STALE_MS = 90000;
  function isOnline(profile) {
    if (!profile?.is_online) return false;
    if (!profile.last_seen) return false;
    return (Date.now() - new Date(profile.last_seen).getTime()) < PRESENCE_STALE_MS;
  }

  // ---- Profile Management ----
  async function loadMyProfile() {
    const client = sb();
    if (!client) return null;

    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;

    const { data, error } = await client.from("profiles").select("*").eq("id", user.id).single();
    if (error && error.code === "PGRST116") {
      // No profile yet
      return null;
    }
    if (data) {
      myProfile = data;
      window.__nxCachedProfile = data;
      return data;
    }
    return null;
  }

  async function createProfile(username) {
    const client = sb();
    if (!client) return { ok: false, error: "Supabase not ready" };

    const { data: { user } } = await client.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in" };

    const clean = String(username || "").trim().replace(/[^a-zA-Z0-9_\-\.]/g, "");
    if (clean.length < 3 || clean.length > 20) {
      return { ok: false, error: "Username must be 3-20 chars (letters, numbers, _ - .)" };
    }

    const { data, error } = await client.from("profiles").upsert({
      id: user.id,
      username: clean,
      display_name: clean,
      is_online: true,
      last_seen: new Date().toISOString()
    }, { onConflict: "id" }).select().single();

    if (error) {
      if (String(error.message || "").includes("unique") || String(error.code || "") === "23505") {
        return { ok: false, error: "Username already taken" };
      }
      return { ok: false, error: error.message || "Failed to create profile" };
    }

    myProfile = data;
    window.__nxCachedProfile = data;
    return { ok: true, profile: data };
  }

  async function changeUsername(newName) {
    const client = sb();
    if (!client || !myId()) return { ok: false, error: "Not ready" };

    const clean = String(newName || "").trim().replace(/[^a-zA-Z0-9_\-\.]/g, "");
    if (clean.length < 3 || clean.length > 20) {
      return { ok: false, error: "Username must be 3-20 chars (letters, numbers, _ - .)" };
    }

    // Update profiles table (username + display_name)
    const { data, error } = await client.from("profiles").update({
      username: clean,
      display_name: clean
    }).eq("id", myId()).select().single();

    if (error) {
      if (String(error.message || "").includes("unique") || String(error.code || "") === "23505") {
        return { ok: false, error: "Username already taken" };
      }
      return { ok: false, error: error.message || "Failed to update username" };
    }

    if (data) {
      myProfile = data;
      window.__nxCachedProfile = data;
    }

    // Also update all old comments to show new name
    try {
      await client.from("game_comments")
        .update({ display_name: clean })
        .eq("user_id", myId());
    } catch (e) {
      console.warn("[Friends] Could not sync comment display names:", e);
    }

    // Sync localStorage fallback
    try { localStorage.setItem(`nx.comments.display_name.${myId()}`, clean); } catch {}

    return { ok: true, profile: data };
  }

  // ---- Presence ----
  async function updatePresence(gameId, gameName) {
    const client = sb();
    if (!client || !myId()) return;

    await client.from("profiles").update({
      is_online: true,
      current_game_id: gameId || null,
      current_game: gameName || null,
      last_seen: new Date().toISOString()
    }).eq("id", myId());
  }

  async function goOffline() {
    const client = sb();
    if (!client || !myId()) return;

    await client.from("profiles").update({
      is_online: false,
      current_game: null,
      current_game_id: null,
      last_seen: new Date().toISOString()
    }).eq("id", myId());
  }

  function startPresenceHeartbeat() {
    if (presenceInterval) clearInterval(presenceInterval);
    presenceInterval = setInterval(async () => {
      if (!myId()) return;
      try {
        // Check if we're playing a game
        let gameId = null;
        let gameName = null;
        if (window.api?.getRunningGames) {
          const running = await window.api.getRunningGames();
          if (running?.length) {
            gameId = running[0];
            // Try to get game name from store
            try {
              const installed = await window.api.getInstalled();
              const g = installed?.[gameId];
              if (g?.name) gameName = g.name;
            } catch {}
          }
        }
        await updatePresence(gameId, gameName);
      } catch {}
    }, 30000); // every 30s
  }

  function stopPresenceHeartbeat() {
    if (presenceInterval) {
      clearInterval(presenceInterval);
      presenceInterval = null;
    }
  }

  // ---- Friends Data ----
  async function loadFriendships() {
    const client = sb();
    if (!client || !myId()) return;

    const uid = myId();

    // Load all friendships involving me
    const { data, error } = await client
      .from("friendships")
      .select("*, sender:profiles!friendships_sender_id_fkey(*), receiver:profiles!friendships_receiver_id_fkey(*)")
      .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);

    if (error) {
      console.error("[Friends] Load friendships error:", error);
      return;
    }

    friendsList = [];
    pendingIncoming = [];
    pendingSent = [];

    for (const f of (data || [])) {
      const isSender = f.sender_id === uid;
      const friendProfile = isSender ? f.receiver : f.sender;

      if (f.status === "accepted") {
        friendsList.push({ ...f, friend: friendProfile });
      } else if (f.status === "pending") {
        if (isSender) {
          pendingSent.push({ ...f, friend: friendProfile });
        } else {
          pendingIncoming.push({ ...f, friend: friendProfile });
        }
      }
    }

    // Sort friends: online first, then alphabetical
    friendsList.sort((a, b) => {
      const aOn = isOnline(a.friend), bOn = isOnline(b.friend);
      if (aOn && !bOn) return -1;
      if (!aOn && bOn) return 1;
      return String(a.friend.display_name || "").localeCompare(String(b.friend.display_name || ""));
    });
  }

  // ---- Unread Message Counts ----
  async function loadUnreadCounts() {
    const client = sb();
    if (!client || !myId()) return;

    const { data, error } = await client
      .from("messages")
      .select("sender_id")
      .eq("receiver_id", myId())
      .eq("is_read", false);

    if (error) return;

    unreadCounts = {};
    for (const m of (data || [])) {
      const sid = m.sender_id;
      unreadCounts[sid] = (unreadCounts[sid] || 0) + 1;
    }

    updateSidebarBadge();
  }

  function totalUnread() {
    return Object.values(unreadCounts).reduce((a, b) => a + b, 0);
  }

  function updateSidebarBadge() {
    const badge = document.getElementById("friendsBadge");
    if (badge) {
      badge.textContent = "";
      badge.classList.remove("visible");
      badge.style.display = "none";
    }
  }

  // ---- Friend Actions ----
  async function sendFriendRequest(friendCode) {
    const client = sb();
    if (!client || !myId()) return { ok: false, error: "Not ready" };

    const code = String(friendCode || "").trim().toLowerCase();
    if (!code) return { ok: false, error: "Enter a friend code" };
    if (code === (myProfile?.friend_code || "").toLowerCase()) {
      return { ok: false, error: "That's your own code!" };
    }

    // Find user by friend code
    const { data: target, error: findErr } = await client
      .from("profiles")
      .select("id, username, display_name, friend_code")
      .ilike("friend_code", code)
      .single();

    if (findErr || !target) return { ok: false, error: "No user found with that code" };

    // Check if friendship already exists
    const { data: existing } = await client
      .from("friendships")
      .select("id, status")
      .or(`and(sender_id.eq.${myId()},receiver_id.eq.${target.id}),and(sender_id.eq.${target.id},receiver_id.eq.${myId()})`)
      .limit(1);

    if (existing?.length) {
      const st = existing[0].status;
      if (st === "accepted") return { ok: false, error: "Already friends!" };
      if (st === "pending") return { ok: false, error: "Request already pending" };
    }

    const { error: insertErr } = await client.from("friendships").insert({
      sender_id: myId(),
      receiver_id: target.id,
      status: "pending"
    });

    if (insertErr) return { ok: false, error: insertErr.message || "Failed to send request" };

    await loadFriendships();
    return { ok: true };
  }

  async function acceptRequest(friendshipId) {
    const client = sb();
    if (!client) return;

    await client.from("friendships").update({
      status: "accepted",
      updated_at: new Date().toISOString()
    }).eq("id", friendshipId);

    await loadFriendships();
  }

  async function rejectRequest(friendshipId) {
    const client = sb();
    if (!client) return;

    await client.from("friendships").delete().eq("id", friendshipId);
    await loadFriendships();
  }

  async function removeFriend(friendshipId) {
    const client = sb();
    if (!client) return;

    await client.from("friendships").delete().eq("id", friendshipId);
    await loadFriendships();
  }

  // ---- Messaging ----
  async function loadMessages(friendId) {
    const client = sb();
    if (!client || !myId()) return [];

    const uid = myId();

    const { data, error } = await client
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${uid},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${uid})`)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("[Friends] Load messages error:", error);
      return [];
    }

    // Mark unread messages as read
    const unreadIds = (data || [])
      .filter(m => m.receiver_id === uid && !m.is_read)
      .map(m => m.id);

    if (unreadIds.length) {
      await client.from("messages").update({ is_read: true }).in("id", unreadIds);
      if (unreadCounts[friendId]) {
        delete unreadCounts[friendId];
        updateSidebarBadge();
      }
    }

    return data || [];
  }

  async function sendMessage(friendId, content) {
    const client = sb();
    if (!client || !myId()) return { ok: false };

    const text = String(content || "").trim();
    if (!text) return { ok: false };

    const { error } = await client.from("messages").insert({
      sender_id: myId(),
      receiver_id: friendId,
      content: text
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function deleteMessage(messageId) {
    const client = sb();
    if (!client || !myId()) return { ok: false, error: "Not ready" };

    const { error } = await client
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("sender_id", myId());

    if (error) return { ok: false, error: error.message };

    // Remove from local state
    const idx = chatMessages.findIndex(m => m.id === messageId);
    if (idx >= 0) chatMessages.splice(idx, 1);

    // Remove from DOM
    const el = document.querySelector(`.nxFrMsg[data-msg-id="${messageId}"]`);
    if (el) el.remove();

    // Show empty state if no messages left
    if (!chatMessages.length) {
      const container = document.getElementById("nxFrChatMessages");
      if (container) container.innerHTML = `<div class="nxFrEmpty" style="padding:20px;">No messages yet. Say hi!</div>`;
    }

    return { ok: true };
  }

  // ---- Message Context Menu ----
  let _msgCtxCloseHandler = null;

  function closeMsgContextMenu() {
    document.querySelectorAll(".nxFrMsgCtxMenu").forEach(m => m.remove());
    if (_msgCtxCloseHandler) {
      document.removeEventListener("click", _msgCtxCloseHandler);
      document.removeEventListener("contextmenu", _msgCtxCloseHandler);
      _msgCtxCloseHandler = null;
    }
  }

  function showMsgContextMenu(e, messageId) {
    e.preventDefault();
    closeMsgContextMenu();

    const menu = document.createElement("div");
    menu.className = "nxFrMsgCtxMenu";
    menu.innerHTML = `
      <button class="nxFrMsgCtxItem danger" type="button">
        <svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
        Delete message
      </button>
    `;

    menu.style.position = "fixed";
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    document.body.appendChild(menu);

    // Keep menu within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + "px";
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + "px";

    menu.querySelector(".nxFrMsgCtxItem").addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeMsgContextMenu();
      showDeleteMessageDialog(messageId);
    });

    _msgCtxCloseHandler = () => closeMsgContextMenu();
    setTimeout(() => {
      document.addEventListener("click", _msgCtxCloseHandler);
      document.addEventListener("contextmenu", _msgCtxCloseHandler);
    }, 0);
  }

  function showDeleteMessageDialog(messageId) {
    document.querySelector(".nxFrConfirmOverlay")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "nxFrConfirmOverlay";
    overlay.innerHTML = `
      <div class="nxFrConfirmCard" role="dialog" aria-modal="true">
        <div class="nxFrConfirmTitle">Delete message</div>
        <div class="nxFrConfirmMsg">Are you sure you want to delete this message? This cannot be undone.</div>
        <div class="nxFrConfirmActions">
          <button class="nxFrBtn" data-act="cancel" type="button">Cancel</button>
          <button class="nxFrBtn danger" data-act="confirm" type="button">Delete</button>
        </div>
      </div>
    `;

    function close() {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }
    function onKey(e) { if (e.key === "Escape") close(); }

    overlay.querySelector('[data-act="cancel"]').addEventListener("click", close);
    overlay.querySelector('[data-act="confirm"]').addEventListener("click", async () => {
      close();
      const res = await deleteMessage(messageId);
      if (res.ok) {
        if (typeof showToast === "function") showToast("Message deleted", "info");
      } else {
        if (typeof showToast === "function") showToast(res.error || "Failed to delete message", "error");
      }
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
  }

  // ---- In-place DOM update for friend sidebar items (avoids nuking chat input) ----
  function updateFriendItemInPlace(profile) {
    const item = document.querySelector(`.nxFrItem[data-friend-id="${profile.id}"]`);
    if (!item) return;
    const online = isOnline(profile);
    const playing = online && profile.current_game;
    const dot = item.querySelector(".nxFrOnlineDot");
    if (dot) {
      dot.classList.toggle("online", online);
      dot.classList.toggle("offline", !online);
    }
    const statusEl = item.querySelector(".nxFrStatus");
    if (statusEl) {
      let st = "Offline";
      if (playing) st = playingStatusHtml(profile.current_game, profile.current_game_id);
      else if (online) st = "Online";
      else if (profile.last_seen) st = "Last seen " + timeAgo(profile.last_seen);
      statusEl.innerHTML = st;
      statusEl.classList.toggle("playing", !!playing);
    }
    const nameEl = item.querySelector(".nxFrName");
    if (nameEl) nameEl.textContent = profile.display_name || profile.username || "";
  }

  function updateFriendUnreadBadge(friendId) {
    const item = document.querySelector(`.nxFrItem[data-friend-id="${friendId}"]`);
    if (!item) return;
    const meta = item.querySelector(".nxFrItemMeta");
    if (!meta) return;
    // Remove old badge first
    const old = meta.querySelector(".nxFrUnreadBadge");
    if (old) old.remove();
    // Add updated badge if there are unread messages
    const count = unreadCounts[friendId] || 0;
    if (count > 0) {
      const badge = document.createElement("span");
      badge.className = "nxFrUnreadBadge";
      badge.textContent = count > 99 ? "99+" : String(count);
      meta.appendChild(badge);
    }
  }

  // ---- Realtime Subscriptions ----
  function setupRealtime() {
    cleanupRealtime();
    const client = sb();
    if (!client || !myId()) return;

    // Listen for friendship changes
    const friendSub = client
      .channel("friendships-changes")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `receiver_id=eq.${myId()}`
      }, async () => {
        await loadFriendships();
        await loadUnreadCounts();
        if (window.__currentPage === "friends") renderContent();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "friendships",
        filter: `sender_id=eq.${myId()}`
      }, async () => {
        await loadFriendships();
        if (window.__currentPage === "friends") renderContent();
      })
      .subscribe();

    // Listen for new messages (incoming)
    const msgSub = client
      .channel("messages-changes")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${myId()}`
      }, async (payload) => {
        const msg = payload?.new;
        if (!msg) return;

        // If chat is open with this sender, append in real-time
        if (activeChatFriend && msg.sender_id === activeChatFriend.id) {
          // Deduplicate
          if (!chatMessages.some(m => m.id === msg.id)) {
            chatMessages.push(msg);
            appendChatMessage(msg);
          }
          // Mark as read immediately
          try { await sb().from("messages").update({ is_read: true }).eq("id", msg.id); } catch {}
        } else {
          // Increment unread count and update badges in-place (no full re-render)
          unreadCounts[msg.sender_id] = (unreadCounts[msg.sender_id] || 0) + 1;
          updateSidebarBadge();
          updateFriendUnreadBadge(msg.sender_id);
        }
      })
      // Listen for sent message confirmations (replace temp messages)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `sender_id=eq.${myId()}`
      }, (payload) => {
        const msg = payload?.new;
        if (!msg) return;

        // Only process if chat is open with the receiver
        if (!activeChatFriend || msg.receiver_id !== activeChatFriend.id) return;

        // Replace the temp message with the confirmed server message
        const tempIdx = chatMessages.findIndex(m =>
          String(m.id).startsWith("temp-") &&
          m.content === msg.content &&
          m.receiver_id === msg.receiver_id
        );
        if (tempIdx >= 0) {
          chatMessages[tempIdx] = msg;
          // Update the DOM element's data-msg-id from temp to real and refresh receipt
          const els = document.querySelectorAll("#nxFrChatMessages .nxFrMsg");
          if (els[tempIdx]) {
            els[tempIdx].setAttribute("data-msg-id", msg.id);
            const timeEl = els[tempIdx].querySelector(".nxFrMsgTime");
            if (timeEl) timeEl.innerHTML = `${formatTime(msg.created_at)}${readReceiptHtml(msg)}`;
          }
        } else if (!chatMessages.some(m => m.id === msg.id)) {
          // Edge case: temp was missed, add the confirmed message
          chatMessages.push(msg);
          appendChatMessage(msg);
        }
      })
      // Listen for read status updates on our sent messages
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "messages",
        filter: `sender_id=eq.${myId()}`
      }, (payload) => {
        const updated = payload?.new;
        if (!updated || !updated.is_read) return;

        // Update local state
        const msg = chatMessages.find(m => m.id === updated.id);
        if (msg) msg.is_read = true;

        // Update the checkmark in the DOM
        const el = document.querySelector(`.nxFrMsg[data-msg-id="${updated.id}"] .nxFrMsgCheck`);
        if (el) {
          el.classList.add("read");
          el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 6L7 17l-5-5"></path><path d="M22 6L11 17"></path></svg>`;
        }
      })
      // Listen for deleted messages
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "messages"
      }, (payload) => {
        const old = payload?.old;
        if (!old || !old.id) return;

        // Remove from local state if in current chat
        const idx = chatMessages.findIndex(m => m.id === old.id);
        if (idx >= 0) {
          chatMessages.splice(idx, 1);
          const el = document.querySelector(`.nxFrMsg[data-msg-id="${old.id}"]`);
          if (el) el.remove();

          if (!chatMessages.length) {
            const container = document.getElementById("nxFrChatMessages");
            if (container) container.innerHTML = `<div class="nxFrEmpty" style="padding:20px;">No messages yet. Say hi!</div>`;
          }
        }
      })
      .subscribe();

    // Listen for friend profile changes (online status, game activity)
    // Build a set of friend IDs so we only react to relevant profile changes
    const friendIds = new Set(friendsList.map(f => f.friend.id));

    const profileSub = client
      .channel("profiles-changes")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles"
      }, async (payload) => {
        const updated = payload?.new;
        if (!updated) return;
        // Only process updates for our friends
        if (!friendIds.has(updated.id)) return;
        // Update local friend data
        let changed = false;
        for (const f of friendsList) {
          if (f.friend.id === updated.id) {
            Object.assign(f.friend, updated);
            changed = true;
          }
        }
        // Also update activeChatFriend header without nuking the chat input
        if (activeChatFriend && activeChatFriend.id === updated.id) {
          Object.assign(activeChatFriend, updated);
          // Only update the header, not the entire page
          const statusEl = document.querySelector(".nxFrChatStatus");
          const nameEl = document.querySelector(".nxFrChatName");
          if (statusEl) {
            const online = isOnline(updated);
            let st = "Offline";
            if (online && updated.current_game) st = playingStatusHtml(updated.current_game, updated.current_game_id);
            else if (online) st = "Online";
            else if (updated.last_seen) st = "last seen " + timeAgo(updated.last_seen);
            statusEl.innerHTML = st;
            statusEl.classList.toggle("online", online);
            statusEl.classList.toggle("playing", !!(online && updated.current_game));
          }
          if (nameEl) nameEl.textContent = updated.display_name || updated.username || "";
          // Update sidebar item in-place
          updateFriendItemInPlace(updated);
          return;
        }
        if (changed && window.__currentPage === "friends") renderContent();
      })
      .subscribe();

    realtimeSubs = [friendSub, msgSub, profileSub];
  }

  function cleanupRealtime() {
    const client = sb();
    for (const sub of realtimeSubs) {
      try { client?.removeChannel(sub); } catch {}
    }
    realtimeSubs = [];
  }

  // ---- Polling Fallback (ensures updates even if Realtime misses events) ----
  function startMessagePolling() {
    stopMessagePolling();
    msgPollInterval = setInterval(pollMessages, 3000);
  }

  function stopMessagePolling() {
    if (msgPollInterval) { clearInterval(msgPollInterval); msgPollInterval = null; }
  }

  async function pollMessages() {
    if (!activeChatFriend || !myId()) return;
    const client = sb();
    if (!client) return;

    const uid = myId();
    const friendId = activeChatFriend.id;

    try {
      const { data } = await client
        .from("messages")
        .select("*")
        .or(`and(sender_id.eq.${uid},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${uid})`)
        .order("created_at", { ascending: true })
        .limit(100);

      if (!data) return;

      const existingIds = new Set(chatMessages.filter(m => !String(m.id).startsWith("temp-")).map(m => m.id));
      let added = false;

      for (const msg of data) {
        if (existingIds.has(msg.id)) {
          // Check for read-receipt updates on already-known messages
          const local = chatMessages.find(m => m.id === msg.id);
          if (local && !local.is_read && msg.is_read) {
            local.is_read = true;
            const el = document.querySelector(`.nxFrMsg[data-msg-id="${msg.id}"] .nxFrMsgCheck`);
            if (el) {
              el.classList.add("read");
              el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 6L7 17l-5-5"></path><path d="M22 6L11 17"></path></svg>`;
            }
          }
          continue;
        }

        // Check if this server message confirms a temp optimistic message
        const tempIdx = chatMessages.findIndex(m =>
          String(m.id).startsWith("temp-") &&
          m.content === msg.content &&
          m.receiver_id === msg.receiver_id
        );
        if (tempIdx >= 0) {
          chatMessages[tempIdx] = msg;
          const els = document.querySelectorAll("#nxFrChatMessages .nxFrMsg");
          if (els[tempIdx]) {
            els[tempIdx].setAttribute("data-msg-id", msg.id);
            const timeEl = els[tempIdx].querySelector(".nxFrMsgTime");
            if (timeEl) timeEl.innerHTML = `${formatTime(msg.created_at)}${readReceiptHtml(msg)}`;
          }
        } else {
          chatMessages.push(msg);
          appendChatMessage(msg);
          added = true;
        }
      }

      // Mark new incoming messages as read
      if (added) {
        const unreadIds = data
          .filter(m => m.receiver_id === uid && !m.is_read && !existingIds.has(m.id))
          .map(m => m.id);
        if (unreadIds.length) {
          try { await client.from("messages").update({ is_read: true }).in("id", unreadIds); } catch {}
        }
      }

      // Detect deleted messages
      const serverIds = new Set(data.map(m => m.id));
      const toRemove = chatMessages.filter(m => !String(m.id).startsWith("temp-") && !serverIds.has(m.id));
      for (const del of toRemove) {
        const idx = chatMessages.findIndex(m => m.id === del.id);
        if (idx >= 0) {
          chatMessages.splice(idx, 1);
          const el = document.querySelector(`.nxFrMsg[data-msg-id="${del.id}"]`);
          if (el) el.remove();
        }
      }

      if (toRemove.length && !chatMessages.length) {
        const container = document.getElementById("nxFrChatMessages");
        if (container) container.innerHTML = `<div class="nxFrEmpty" style="padding:20px;">No messages yet. Say hi!</div>`;
      }
    } catch (e) {
      console.warn("[Friends] Message poll error:", e);
    }
  }

  function startFriendshipPolling() {
    stopFriendshipPolling();
    friendPollInterval = setInterval(pollFriendships, 5000);
  }

  function stopFriendshipPolling() {
    if (friendPollInterval) { clearInterval(friendPollInterval); friendPollInterval = null; }
  }

  async function pollFriendships() {
    if (!myId()) return;
    try {
      const prevIncoming = pendingIncoming.length;
      const prevFriends = friendsList.length;
      const prevSent = pendingSent.length;

      // Snapshot profile data before reload to detect game/status changes
      const prevProfiles = {};
      for (const f of friendsList) {
        const p = f.friend;
        prevProfiles[p.id] = {
          is_online: p.is_online,
          current_game: p.current_game,
          current_game_id: p.current_game_id,
          last_seen: p.last_seen
        };
      }

      await loadFriendships();
      await loadUnreadCounts();

      const countChanged = pendingIncoming.length !== prevIncoming
        || friendsList.length !== prevFriends
        || pendingSent.length !== prevSent;

      if (window.__currentPage === "friends") {
        if (countChanged) {
          if (activeChatFriend) {
            const stillFriend = friendsList.find(f => f.friend.id === activeChatFriend.id);
            if (!stillFriend) {
              cleanupTypingChannel();
              activeChatFriend = null;
              chatMessages = [];
              stopMessagePolling();
            }
          }
          renderContent();
        } else {
          // Check for profile data changes (game activity, online status)
          for (const f of friendsList) {
            const p = f.friend;
            const prev = prevProfiles[p.id];
            if (!prev) continue;
            const profileChanged = prev.is_online !== p.is_online
              || prev.current_game !== p.current_game
              || prev.current_game_id !== p.current_game_id
              || prev.last_seen !== p.last_seen;
            if (profileChanged) {
              updateFriendItemInPlace(p);
              // Update chat header if this friend's chat is open
              if (activeChatFriend && activeChatFriend.id === p.id) {
                Object.assign(activeChatFriend, p);
                const statusEl = document.querySelector(".nxFrChatStatus");
                if (statusEl) {
                  const online = isOnline(p);
                  let st = "Offline";
                  if (online && p.current_game) st = playingStatusHtml(p.current_game, p.current_game_id);
                  else if (online) st = "Online";
                  else if (p.last_seen) st = "last seen " + timeAgo(p.last_seen);
                  statusEl.innerHTML = st;
                  statusEl.classList.toggle("online", online);
                  statusEl.classList.toggle("playing", !!(online && p.current_game));
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("[Friends] Friendship poll error:", e);
    }
  }

  // ---- Typing Indicator (Supabase Broadcast) ----
  function setupTypingChannel(friendId) {
    cleanupTypingChannel();
    const client = sb();
    if (!client || !myId() || !friendId) return;

    // Create a deterministic channel name for this pair
    const ids = [myId(), friendId].sort();
    const channelName = `typing:${ids[0]}:${ids[1]}`;

    friendIsTyping = false;
    clearTimeout(friendTypingTimer);

    typingChannel = client.channel(channelName);
    typingChannel.on("broadcast", { event: "typing" }, (payload) => {
      const senderId = payload?.payload?.userId;
      if (!senderId || senderId === myId()) return;
      if (senderId !== activeChatFriend?.id) return;

      friendIsTyping = true;
      updateTypingIndicatorUI();

      clearTimeout(friendTypingTimer);
      friendTypingTimer = setTimeout(() => {
        friendIsTyping = false;
        updateTypingIndicatorUI();
      }, 3000);
    });

    typingChannel.subscribe();
  }

  function cleanupTypingChannel() {
    const client = sb();
    if (typingChannel) {
      try { client?.removeChannel(typingChannel); } catch {}
      typingChannel = null;
    }
    friendIsTyping = false;
    clearTimeout(friendTypingTimer);
    clearTimeout(myTypingTimer);
    lastTypingSent = 0;
  }

  function broadcastTyping() {
    if (!typingChannel || !activeChatFriend) return;
    const now = Date.now();
    // Throttle: only send once per 2s
    if (now - lastTypingSent < 2000) return;
    lastTypingSent = now;
    typingChannel.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: myId() }
    });
  }

  function updateTypingIndicatorUI() {
    const el = document.getElementById("nxFrTypingIndicator");
    if (!el) return;
    if (friendIsTyping && activeChatFriend) {
      const name = activeChatFriend.display_name || activeChatFriend.username || "Friend";
      el.innerHTML = `<span class="nxFrTypingDots"><span></span><span></span><span></span></span> <span class="nxFrTypingText">${escapeHtml(name)} is typing</span>`;
      el.classList.add("visible");
    } else {
      el.classList.remove("visible");
    }
  }

  // ---- Game Activity Listener ----
  function setupGameActivityListener() {
    if (window.__friendsGameListener) return;
    window.__friendsGameListener = true;

    window.api?.onGameRunningChanged?.(async (p) => {
      if (!myId()) return;
      if (p.running) {
        // Game started
        let gameName = null;
        try {
          const installed = await window.api.getInstalled();
          const g = installed?.[p.gameId];
          if (g?.name) gameName = g.name;
        } catch {}
        await updatePresence(p.gameId, gameName);
      } else {
        // Game stopped
        await updatePresence(null, null);
      }
    });
  }

  // ---- Rendering ----
  function renderContent() {
    const wrap = document.getElementById("friendsWrap");
    if (!wrap) return;

    if (!myProfile) {
      renderSetup(wrap);
      return;
    }

    const requestCount = pendingIncoming.length;
    const msgUnread = totalUnread();
    const displayName = escapeHtml(myProfile.display_name || myProfile.username || "—");
    const friendCode = escapeHtml(myProfile.friend_code || "—");

    // Build left sidebar
    let leftHtml = `
      <div class="nxFrSidebar">
        <!-- Header -->
        <div class="nxFrSidebarHeader">
          <div class="nxFrMyAvatar">${avatarLetter(myProfile.display_name || myProfile.username)}</div>
          <div class="nxFrMyInfo">
            <div class="nxFrMyName">${displayName}</div>
            <div class="nxFrMyCode" id="nxFrCopyCode" title="Click to copy">${friendCode}</div>
          </div>
          <div class="nxFrHeaderActions">
            <button class="nxFrHeaderBtn" id="nxFrChangeUsername" type="button" title="Edit profile">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </button>
          </div>
        </div>

        <!-- Profile editor placeholder -->
        <div id="nxFrProfileEditorSlot"></div>

        <!-- Search friends -->
        <div class="nxFrSearchBar">
          <div class="nxFrSearchWrap">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.35-4.35"></path></svg>
            <input type="text" id="nxFrSearchInput" placeholder="Search friends..." maxlength="40" spellcheck="false" autocomplete="off" />
          </div>
        </div>

        <!-- Tabs -->
        <div class="nxFrTabs">
          <button class="nxFrTab ${currentTab === "friends" ? "active" : ""}" data-tab="friends">Friends</button>
          <button class="nxFrTab ${currentTab === "requests" ? "active" : ""}" data-tab="requests">Requests</button>
        </div>

        <!-- List content -->
        <div class="nxFrList" id="nxFrListContent">
    `;

    if (currentTab === "friends") {
      leftHtml += renderFriendsTab();
    } else if (currentTab === "requests") {
      leftHtml += renderRequestsTab();
    }

    leftHtml += `
        </div>

        <!-- Add Friend FAB -->
        <button class="nxFrFab" id="nxFrFabBtn" type="button" title="Add friend">
          <svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
        </button>

        <!-- Add Friend Popover -->
        <div class="nxFrAddPopover" id="nxFrAddPopover">
          <div class="nxFrAddPopoverTitle">Add Friend</div>
          <div class="nxFrAddPopoverRow">
            <input type="text" id="nxFrAddInput" placeholder="Enter friend code..." maxlength="20" spellcheck="false" autocomplete="off" />
            <button class="nxFrBtn primary" id="nxFrAddBtn" type="button">Send</button>
          </div>
        </div>
      </div>
    `;

    // Build right panel
    let rightHtml = `<div class="nxFrRight" id="nxFrRightPanel">`;
    if (activeChatFriend) {
      rightHtml += renderChatPanel();
    } else {
      rightHtml += `
        <div class="nxFrRightEmpty">
          <div class="nxFrRightEmptyIcon">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
          </div>
          <div class="nxFrRightEmptyTitle">Nexus Messenger</div>
          <div class="nxFrRightEmptySub">Select a friend to start chatting, or add someone with their friend code.</div>
        </div>
      `;
    }
    rightHtml += `</div>`;

    wrap.classList.toggle("chatOpen", !!activeChatFriend);
    wrap.innerHTML = leftHtml + rightHtml;

    bindAllEvents(wrap);

    // If chat is open, load messages
    if (activeChatFriend) {
      loadChatMessages();
    }

    // Highlight active chat friend in sidebar
    if (activeChatFriend) {
      const activeItem = wrap.querySelector(`.nxFrItem[data-friend-id="${activeChatFriend.id}"]`);
      if (activeItem) activeItem.classList.add("active");
    }
  }

  function renderSetup(wrap) {
    wrap.innerHTML = `
      <div class="nxFrSetup">
        <h3>Set up your profile</h3>
        <p>Choose a username to start using Friends. Your friends will find you using your unique friend code.</p>
        <div class="nxFrSetupRow">
          <input type="text" id="nxFrUsernameInput" placeholder="Pick a username (3-20 chars)" maxlength="20" spellcheck="false" autocomplete="off" />
          <button class="nxFrBtn primary" id="nxFrCreateBtn" type="button">Create Profile</button>
        </div>
        <div id="nxFrSetupError" style="color: rgba(255,80,100,.9); font-size:13px; font-weight:750; display:none;"></div>
      </div>
    `;

    const input = wrap.querySelector("#nxFrUsernameInput");
    const btn = wrap.querySelector("#nxFrCreateBtn");
    const errEl = wrap.querySelector("#nxFrSetupError");

    async function doCreate() {
      const val = input?.value || "";
      btn.disabled = true;
      btn.textContent = "Creating...";
      errEl.style.display = "none";

      const res = await createProfile(val);
      if (res.ok) {
        setupRealtime();
        startPresenceHeartbeat();
        await loadFriendships();
        await loadUnreadCounts();
        renderContent();
      } else {
        errEl.textContent = res.error || "Failed";
        errEl.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Create Profile";
      }
    }

    btn?.addEventListener("click", doCreate);
    input?.addEventListener("keydown", (e) => { if (e.key === "Enter") doCreate(); });
  }

  function renderFriendsTab() {
    let html = "";

    if (!friendsList.length) {
      html += `
        <div class="nxFrEmpty">
          <div class="emptyIcon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
          No friends yet. Share your code or add someone!
        </div>
      `;
      return html;
    }

    for (const f of friendsList) {
      const p = f.friend;
      const online = isOnline(p);
      const playing = online && p.current_game;
      const unread = unreadCounts[p.id] || 0;

      let statusText = "Offline";
      if (online && playing) {
        statusText = playingStatusHtml(p.current_game, p.current_game_id);
      } else if (online) {
        statusText = "Online";
      } else if (p.last_seen) {
        statusText = `Last seen ${timeAgo(p.last_seen)}`;
      }

      html += `
        <div class="nxFrItem" data-friendship-id="${escapeHtml(f.id)}" data-friend-id="${escapeHtml(p.id)}" data-action="open-chat">
          <div class="nxFrAvatar">
            ${avatarLetter(p.display_name || p.username)}
            <div class="nxFrOnlineDot ${online ? "online" : "offline"}"></div>
          </div>
          <div class="nxFrInfo">
            <div class="nxFrName">${escapeHtml(p.display_name || p.username)}</div>
            <div class="nxFrStatus ${playing ? "playing" : ""}">${statusText}</div>
          </div>
          <div class="nxFrItemMeta">
            ${unread > 0 ? `<span class="nxFrUnreadBadge">${unread > 99 ? "99+" : unread}</span>` : ""}
            <div class="nxFrKebabWrap">
              <button class="nxFrKebab" data-action="kebab" data-friendship-id="${escapeHtml(f.id)}" data-friend-id="${escapeHtml(p.id)}" data-friend-name="${escapeHtml(p.display_name || p.username)}" type="button" title="More options">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }
    return html;
  }

  function renderRequestsTab() {
    let html = "";

    if (pendingIncoming.length) {
      html += `<div class="nxFrSectionLabel">Incoming</div>`;
      for (const f of pendingIncoming) {
        const p = f.friend;
        html += `
          <div class="nxFrItem">
            <div class="nxFrAvatar">${avatarLetter(p.display_name || p.username)}</div>
            <div class="nxFrInfo">
              <div class="nxFrName">${escapeHtml(p.display_name || p.username)}</div>
              <div class="nxFrStatus">Wants to be your friend</div>
            </div>
            <div class="nxFrActions">
              <button class="nxFrBtn primary" data-action="accept" data-friendship-id="${escapeHtml(f.id)}" type="button">Accept</button>
              <button class="nxFrBtn danger" data-action="reject" data-friendship-id="${escapeHtml(f.id)}" type="button">Decline</button>
            </div>
          </div>
        `;
      }
    }

    if (pendingSent.length) {
      html += `<div class="nxFrSectionLabel">Sent</div>`;
      for (const f of pendingSent) {
        const p = f.friend;
        html += `
          <div class="nxFrItem">
            <div class="nxFrAvatar">${avatarLetter(p.display_name || p.username)}</div>
            <div class="nxFrInfo">
              <div class="nxFrName">${escapeHtml(p.display_name || p.username)}</div>
              <div class="nxFrStatus">Pending...</div>
            </div>
            <div class="nxFrActions">
              <button class="nxFrBtn danger" data-action="cancel" data-friendship-id="${escapeHtml(f.id)}" type="button">Cancel</button>
            </div>
          </div>
        `;
      }
    }

    if (!pendingIncoming.length && !pendingSent.length) {
      html += `
        <div class="nxFrEmpty">
          <div class="emptyIcon"><svg viewBox="0 0 24 24"><path d="M22 12h-6l-2 3H10l-2-3H2"></path><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg></div>
          No pending requests
        </div>
      `;
    }

    return html;
  }

  function renderChatPanel() {
    if (!activeChatFriend) return "";
    const p = activeChatFriend;
    const online = isOnline(p);
    const playing = online && p.current_game;

    let statusText = "Offline";
    if (playing) {
      statusText = playingStatusHtml(p.current_game, p.current_game_id);
    } else if (online) {
      statusText = "Online";
    } else if (p.last_seen) {
      statusText = "last seen " + timeAgo(p.last_seen);
    }

    return `
      <div class="nxFrChatHeader">
        <button class="nxFrChatBackBtn" id="nxFrChatBack" type="button" title="Back">
          <svg viewBox="0 0 24 24"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
        </button>
        <div class="nxFrChatAvatar">${avatarLetter(p.display_name || p.username)}</div>
        <div class="nxFrChatHeaderInfo">
          <div class="nxFrChatName">${escapeHtml(p.display_name || p.username)}</div>
          <div class="nxFrChatStatus ${online ? "online" : ""} ${playing ? "playing" : ""}">${statusText}</div>
        </div>
      </div>
      <div class="nxFrChatMessages" id="nxFrChatMessages">
        <div class="nxFrEmpty" style="padding:20px;">Loading messages...</div>
      </div>
      <div class="nxFrTypingIndicator" id="nxFrTypingIndicator"></div>
      <div class="nxFrChatInput">
        <input type="text" id="nxFrChatMsgInput" placeholder="Type a message..." maxlength="500" spellcheck="true" autocomplete="off" />
        <button class="nxFrSendBtn" id="nxFrSendBtn" type="button" title="Send">
          <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>
    `;
  }

  // Legacy wrapper kept for compatibility
  function renderChatView(wrap) {
    renderContent();
  }

  async function loadChatMessages() {
    if (!activeChatFriend) return;
    chatMessages = await loadMessages(activeChatFriend.id);
    renderChatMessages();
    startMessagePolling();
  }

  function renderChatMessages() {
    const container = document.getElementById("nxFrChatMessages");
    if (!container) return;

    if (!chatMessages.length) {
      container.innerHTML = `<div class="nxFrEmpty" style="padding:20px;">No messages yet. Say hi!</div>`;
      return;
    }

    const uid = myId();
    let html = "";
    for (const m of chatMessages) {
      const isMine = m.sender_id === uid;
      html += `
        <div class="nxFrMsg ${isMine ? "sent" : "received"}" data-msg-id="${escapeHtml(m.id)}">
          ${escapeHtml(m.content)}
          <div class="nxFrMsgTime">${formatTime(m.created_at)}${readReceiptHtml(m)}</div>
        </div>
      `;
    }
    container.innerHTML = html;

    // Scroll to bottom on initial load
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  function appendChatMessage(msg) {
    const container = document.getElementById("nxFrChatMessages");
    if (!container) return;

    // Remove empty placeholder if present
    const empty = container.querySelector(".nxFrEmpty");
    if (empty) empty.remove();

    // Smart scroll: only auto-scroll if user is already near the bottom
    const wasNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;

    const uid = myId();
    const isMine = msg.sender_id === uid;
    const div = document.createElement("div");
    div.className = `nxFrMsg ${isMine ? "sent" : "received"}`;
    div.setAttribute("data-msg-id", msg.id);
    div.innerHTML = `${escapeHtml(msg.content)}<div class="nxFrMsgTime">${formatTime(msg.created_at)}${readReceiptHtml(msg)}</div>`;
    container.appendChild(div);

    if (wasNearBottom || isMine) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  }

  // ---- Event Binding ----
  let _popoverCloseHandler = null;
  let _kebabCloseHandler = null;

  function closeOpenKebabMenu() {
    document.querySelectorAll(".nxFrKebabMenu").forEach(m => m.remove());
    document.querySelectorAll(".nxFrKebab.open").forEach(b => b.classList.remove("open"));
    if (_kebabCloseHandler) {
      document.removeEventListener("click", _kebabCloseHandler);
      _kebabCloseHandler = null;
    }
  }

  function showRemoveConfirmDialog(friendshipId, friendId, friendName) {
    document.querySelector(".nxFrConfirmOverlay")?.remove();

    const overlay = document.createElement("div");
    overlay.className = "nxFrConfirmOverlay";
    overlay.innerHTML = `
      <div class="nxFrConfirmCard" role="dialog" aria-modal="true">
        <div class="nxFrConfirmTitle">Remove friend</div>
        <div class="nxFrConfirmMsg">Are you sure you want to remove <strong>${escapeHtml(friendName)}</strong> from your friends list?</div>
        <div class="nxFrConfirmActions">
          <button class="nxFrBtn" data-act="cancel" type="button">Cancel</button>
          <button class="nxFrBtn danger" data-act="confirm" type="button">Remove</button>
        </div>
      </div>
    `;

    function close() {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }

    function onKey(e) {
      if (e.key === "Escape") close();
    }

    overlay.querySelector('[data-act="cancel"]').addEventListener("click", close);
    overlay.querySelector('[data-act="confirm"]').addEventListener("click", async () => {
      close();
      await removeFriend(friendshipId);
      if (typeof showToast === "function") showToast("Friend removed", "info");
      if (activeChatFriend && activeChatFriend.id === friendId) {
        cleanupTypingChannel();
        activeChatFriend = null;
        chatMessages = [];
        stopMessagePolling();
      }
      renderContent();
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
  }

  function bindAllEvents(wrap) {
    // Clean up previous popover close handler
    if (_popoverCloseHandler) {
      document.removeEventListener("click", _popoverCloseHandler);
      _popoverCloseHandler = null;
    }
    closeOpenKebabMenu();

    // Game link click handler (delegated so it works for dynamically inserted links)
    wrap.addEventListener("click", (e) => {
      const gameLink = e.target.closest(".nxFrGameLink");
      if (gameLink) {
        e.stopPropagation();
        e.preventDefault();
        const gameId = gameLink.dataset.gameId;
        if (gameId && window.showDetailsPage) {
          window.showDetailsPage(gameId);
        }
      }
    });

    // Copy friend code
    wrap.querySelector("#nxFrCopyCode")?.addEventListener("click", () => {
      const code = myProfile?.friend_code || "";
      if (code && navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          if (typeof showToast === "function") showToast("Friend code copied!", "success");
        });
      }
    });

    // Change username
    wrap.querySelector("#nxFrChangeUsername")?.addEventListener("click", async () => {
      const current = myProfile?.display_name || myProfile?.username || "";
      const slot = wrap.querySelector("#nxFrProfileEditorSlot");
      if (!slot) return;

      slot.innerHTML = `
        <div class="nxFrProfileEditor">
          <div style="font-size:12px;font-weight:850;color:rgba(255,255,255,.50);margin-bottom:2px;">Change Username</div>
          <div class="nxFrProfileEditorRow">
            <input type="text" id="nxFrNewNameInput" value="${escapeHtml(current)}" placeholder="3-20 chars" maxlength="20" spellcheck="false" autocomplete="off" />
            <button class="nxFrBtn primary" id="nxFrSaveNameBtn" type="button">Save</button>
            <button class="nxFrBtn" id="nxFrCancelNameBtn" type="button">Cancel</button>
          </div>
          <div id="nxFrNameError" style="color: rgba(255,80,100,.9); font-size:12px; font-weight:750; display:none;"></div>
        </div>
      `;

      const nameInput = slot.querySelector("#nxFrNewNameInput");
      const saveBtn = slot.querySelector("#nxFrSaveNameBtn");
      const cancelBtn = slot.querySelector("#nxFrCancelNameBtn");
      const errEl = slot.querySelector("#nxFrNameError");

      nameInput?.focus();
      nameInput?.select();

      cancelBtn?.addEventListener("click", () => { slot.innerHTML = ""; });

      async function doSave() {
        const val = nameInput?.value || "";
        saveBtn.disabled = true;
        errEl.style.display = "none";

        const res = await changeUsername(val);
        if (res.ok) {
          if (typeof showToast === "function") showToast("Username updated!", "success");
          renderContent();
        } else {
          errEl.textContent = res.error || "Failed to update";
          errEl.style.display = "block";
          saveBtn.disabled = false;
        }
      }

      saveBtn?.addEventListener("click", doSave);
      nameInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); });
    });

    // Tab switching
    wrap.querySelectorAll(".nxFrTab").forEach(btn => {
      btn.addEventListener("click", () => {
        currentTab = btn.dataset.tab || "friends";
        activeChatFriend = null;
        chatMessages = [];
        stopMessagePolling();
        renderContent();
      });
    });

    // Search filter
    const searchInput = wrap.querySelector("#nxFrSearchInput");
    if (searchInput) {
      searchInput.value = searchFilter;
      searchInput.addEventListener("input", () => {
        searchFilter = searchInput.value;
        const listEl = wrap.querySelector("#nxFrListContent");
        if (!listEl) return;
        // Filter friend items in-place (no full re-render)
        const q = searchFilter.trim().toLowerCase();
        listEl.querySelectorAll(".nxFrItem").forEach(item => {
          const name = item.querySelector(".nxFrName")?.textContent?.toLowerCase() || "";
          item.style.display = (!q || name.includes(q)) ? "" : "none";
        });
      });
    }

    // FAB + Add Friend Popover
    const fabBtn = wrap.querySelector("#nxFrFabBtn");
    const addPopover = wrap.querySelector("#nxFrAddPopover");
    const addInput = wrap.querySelector("#nxFrAddInput");
    const addBtn = wrap.querySelector("#nxFrAddBtn");

    fabBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      addPopover?.classList.toggle("open");
      if (addPopover?.classList.contains("open")) {
        setTimeout(() => addInput?.focus(), 50);
      }
    });

    // Close popover on outside click
    _popoverCloseHandler = function(e) {
      if (addPopover?.classList.contains("open") && !addPopover.contains(e.target) && e.target !== fabBtn) {
        addPopover.classList.remove("open");
      }
    };
    document.addEventListener("click", _popoverCloseHandler);

    async function doAdd() {
      const code = addInput?.value || "";
      if (!code.trim()) return;
      addBtn.disabled = true;
      addBtn.textContent = "...";

      const res = await sendFriendRequest(code);
      if (res.ok) {
        if (typeof showToast === "function") showToast("Friend request sent!", "success");
        if (addInput) addInput.value = "";
        addPopover?.classList.remove("open");
      } else {
        if (typeof showToast === "function") showToast(res.error || "Failed", "error");
      }

      addBtn.disabled = false;
      addBtn.textContent = "Send";
      renderContent();
    }

    addBtn?.addEventListener("click", doAdd);
    addInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });

    // Friend / request actions
    wrap.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const friendshipId = btn.dataset.friendshipId;
        const friendId = btn.dataset.friendId;

        if (action === "accept") {
          await acceptRequest(friendshipId);
          if (typeof showToast === "function") showToast("Friend request accepted!", "success");
          renderContent();
        } else if (action === "reject" || action === "cancel") {
          await rejectRequest(friendshipId);
          renderContent();
        } else if (action === "kebab") {
          closeOpenKebabMenu();
          const kebabWrap = btn.closest(".nxFrKebabWrap");
          if (!kebabWrap) return;
          btn.classList.add("open");
          const menu = document.createElement("div");
          menu.className = "nxFrKebabMenu";
          menu.innerHTML = `
            <button class="nxFrKebabMenuItem" type="button">
              <svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
              Remove friend
            </button>
          `;
          kebabWrap.appendChild(menu);
          menu.querySelector(".nxFrKebabMenuItem").addEventListener("click", (ev) => {
            ev.stopPropagation();
            closeOpenKebabMenu();
            showRemoveConfirmDialog(friendshipId, friendId, btn.dataset.friendName || "this friend");
          });
          _kebabCloseHandler = function (ev) {
            if (!kebabWrap.contains(ev.target)) {
              closeOpenKebabMenu();
            }
          };
          setTimeout(() => document.addEventListener("click", _kebabCloseHandler), 0);
        } else if (action === "open-chat") {
          closeOpenKebabMenu();
          const friend = friendsList.find(f => f.friend.id === friendId)?.friend;
          if (friend) {
            activeChatFriend = friend;
            chatMessages = [];
            setupTypingChannel(friend.id);
            renderContent();
          }
        }
      });
    });

    // Message context menu (right-click to delete own messages)
    const chatContainer = wrap.querySelector("#nxFrChatMessages");
    if (chatContainer) {
      chatContainer.addEventListener("contextmenu", (e) => {
        const msgEl = e.target.closest(".nxFrMsg.sent");
        if (!msgEl) return;
        const msgId = msgEl.getAttribute("data-msg-id");
        if (!msgId || String(msgId).startsWith("temp-")) return;
        showMsgContextMenu(e, msgId);
      });
    }

    // Chat events (back, send)
    const backBtn = wrap.querySelector("#nxFrChatBack");
    const sendBtn = wrap.querySelector("#nxFrSendBtn");
    const msgInput = wrap.querySelector("#nxFrChatMsgInput");

    backBtn?.addEventListener("click", () => {
      cleanupTypingChannel();
      activeChatFriend = null;
      chatMessages = [];
      stopMessagePolling();
      renderContent();
    });

    async function doSend() {
      if (!activeChatFriend) return;
      const text = msgInput?.value || "";
      if (!text.trim()) return;
      sendBtn.disabled = true;

      // Optimistic: show message instantly before server confirms
      const tempMsg = {
        id: "temp-" + Date.now(),
        sender_id: myId(),
        receiver_id: activeChatFriend.id,
        content: text.trim(),
        is_read: false,
        created_at: new Date().toISOString()
      };
      msgInput.value = "";
      chatMessages.push(tempMsg);
      appendChatMessage(tempMsg);

      const res = await sendMessage(activeChatFriend.id, text);
      if (!res.ok) {
        // Remove the optimistic message on failure
        const idx = chatMessages.indexOf(tempMsg);
        if (idx >= 0) chatMessages.splice(idx, 1);
        const failEl = document.querySelector(`[data-msg-id="${tempMsg.id}"]`);
        if (failEl) failEl.remove();
        if (typeof showToast === "function") showToast("Failed to send message", "error");
      }
      sendBtn.disabled = false;
      msgInput?.focus();
    }

    sendBtn?.addEventListener("click", doSend);
    msgInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });
    msgInput?.addEventListener("input", () => { broadcastTyping(); });
  }

  // ---- Main Render Entry ----
  window.renderFriends = async function () {
    const wrap = document.getElementById("friendsWrap");
    if (!wrap) return;

    wrap.innerHTML = `<div class="nxFrEmpty">Loading...</div>`;

    try {
      await window.ensureAnonSession?.();
      await loadMyProfile();

      if (myProfile) {
        await loadFriendships();
        await loadUnreadCounts();
        setupRealtime();
        startPresenceHeartbeat();
        setupGameActivityListener();
        startFriendshipPolling();
      }

      renderContent();
    } catch (e) {
      console.error("[Friends] Render error:", e);
      wrap.innerHTML = `<div class="nxFrEmpty">Failed to load Friends. Check your connection.</div>`;
    }
  };

  // ---- Cleanup on page leave ----
  const origLoadPage = window.loadPage;
  if (origLoadPage && !window.__friendsPageHooked) {
    window.__friendsPageHooked = true;

    // We don't override loadPage; instead we use a lighter approach:
    // presence heartbeat continues even off-page (so friends see you online).
    // Realtime subs stay alive for badge updates.
    // We just reset chat state when leaving.
    const _origLoadPage = window.loadPage;
    window.loadPage = async function (page) {
      if (window.__currentPage === "friends" && page !== "friends") {
        cleanupTypingChannel();
        activeChatFriend = null;
        chatMessages = [];
        stopMessagePolling();
      }
      return _origLoadPage.call(this, page);
    };
  }

  // ---- Offline on window close / unload ----
  // Use fetch with keepalive so the request survives the page unload.
  function goOfflineSync() {
    try {
      const uid = myId();
      const url = window.__SUPABASE_URL;
      const key = window.__SUPABASE_ANON_KEY;
      if (!uid || !url || !key) return;

      const token = localStorage.getItem("nx.sb.auth.v1");
      let jwt = key;
      try {
        const parsed = JSON.parse(token);
        if (parsed?.access_token) jwt = parsed.access_token;
      } catch {}

      fetch(`${url}/rest/v1/profiles?id=eq.${uid}`, {
        method: "PATCH",
        headers: {
          "apikey": key,
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          is_online: false,
          current_game: null,
          current_game_id: null,
          last_seen: new Date().toISOString()
        }),
        keepalive: true
      }).catch(() => {});
    } catch {}
  }

  window.addEventListener("beforeunload", () => {
    goOfflineSync();
    stopPresenceHeartbeat();
    cleanupTypingChannel();
    cleanupRealtime();
    stopMessagePolling();
    stopFriendshipPolling();
  });

  // Also listen for the main-process quit signal (fires before beforeunload)
  window.api?.onBeforeQuit?.(() => {
    goOfflineSync();
  });

  // ✅ Go offline when minimized to tray, come back online when restored
  window.api?.onHiddenToTray?.(() => {
    goOfflineSync();
    stopPresenceHeartbeat();
    stopMessagePolling();
    stopFriendshipPolling();
  });
  window.api?.onRestoredFromTray?.(async () => {
    try { await updatePresence(null, null); } catch {}
    startPresenceHeartbeat();
    startFriendshipPolling();
    if (activeChatFriend) startMessagePolling();
  });

})();
