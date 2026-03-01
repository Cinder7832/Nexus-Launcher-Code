// renderer/pages/friends.page.js
(function () {
  // ---- State ----
  let myProfile = null;
  let currentTab = "friends"; // friends | requests | messages
  let friendsList = [];       // accepted friendships with profile data
  let pendingIncoming = [];   // incoming pending requests
  let pendingSent = [];       // outgoing pending requests
  let conversations = [];     // friend profiles for message tab
  let activeChatFriend = null; // friend profile we're chatting with
  let chatMessages = [];
  let realtimeSubs = [];
  let presenceInterval = null;
  let unreadCounts = {};      // friendId -> count

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

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
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
      if (a.friend.is_online && !b.friend.is_online) return -1;
      if (!a.friend.is_online && b.friend.is_online) return 1;
      return String(a.friend.display_name || "").localeCompare(String(b.friend.display_name || ""));
    });

    conversations = friendsList.map(f => f.friend);
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
    const total = totalUnread() + pendingIncoming.length;
    if (badge) {
      badge.textContent = String(total);
      badge.classList.toggle("visible", total > 0);
      badge.style.display = total > 0 ? "inline-flex" : "none";
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

    // Listen for new messages
    const msgSub = client
      .channel("messages-changes")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${myId()}`
      }, async (payload) => {
        const msg = payload?.new;
        if (msg) {
          // If chat is open with this sender, add to view
          if (activeChatFriend && msg.sender_id === activeChatFriend.id) {
            chatMessages.push(msg);
            // Mark as read immediately
            await sb().from("messages").update({ is_read: true }).eq("id", msg.id);
            renderChatMessages();
          } else {
            // Increment unread
            unreadCounts[msg.sender_id] = (unreadCounts[msg.sender_id] || 0) + 1;
            updateSidebarBadge();
          }
          if (window.__currentPage === "friends" && currentTab === "messages" && !activeChatFriend) {
            renderContent();
          }
        }
      })
      .subscribe();

    // Listen for friend profile changes (online status, game activity)
    const profileSub = client
      .channel("profiles-changes")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles"
      }, async (payload) => {
        const updated = payload?.new;
        if (!updated) return;
        // Update local friend data
        for (const f of friendsList) {
          if (f.friend.id === updated.id) {
            Object.assign(f.friend, updated);
          }
        }
        if (window.__currentPage === "friends") renderContent();
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

    let html = "";

    // Profile card with username + friend code
    html += `
      <div class="nxFrCodeCard" style="flex-wrap:wrap;">
        <div style="flex:1; min-width:0;">
          <div class="nxFrCodeLabel">Your Username</div>
          <div style="font-size:16px; font-weight:950; color:#fff; margin-top:2px;">${escapeHtml(myProfile.display_name || myProfile.username || "—")}</div>
        </div>
        <button class="nxFrCopyBtn" id="nxFrChangeUsername" type="button">Change</button>
      </div>
      <div class="nxFrCodeCard">
        <div>
          <div class="nxFrCodeLabel">Your Friend Code</div>
          <div class="nxFrCode">${escapeHtml(myProfile.friend_code || "—")}</div>
        </div>
        <button class="nxFrCopyBtn" id="nxFrCopyCode" type="button">Copy</button>
      </div>
    `;

    // Tabs
    const requestCount = pendingIncoming.length;
    const msgUnread = totalUnread();
    html += `<div class="nxFrTabs">`;
    html += `<button class="nxFrTab ${currentTab === "friends" ? "active" : ""}" data-tab="friends">Friends (${friendsList.length})</button>`;
    html += `<button class="nxFrTab ${currentTab === "requests" ? "active" : ""}" data-tab="requests">Requests${requestCount > 0 ? `<span class="nxFrTabBadge">${requestCount}</span>` : ""}</button>`;
    html += `<button class="nxFrTab ${currentTab === "messages" ? "active" : ""}" data-tab="messages">Messages${msgUnread > 0 ? `<span class="nxFrTabBadge">${msgUnread}</span>` : ""}</button>`;
    html += `</div>`;

    if (currentTab === "friends") {
      html += renderFriendsTab();
    } else if (currentTab === "requests") {
      html += renderRequestsTab();
    } else if (currentTab === "messages") {
      if (activeChatFriend) {
        // Will render chat separately
        wrap.innerHTML = html;
        bindTabEvents(wrap);
        renderChatView(wrap);
        return;
      }
      html += renderMessagesTab();
    }

    wrap.innerHTML = html;
    bindTabEvents(wrap);
    bindContentEvents(wrap);
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

    // Add friend row
    html += `
      <div class="nxFrAddRow">
        <input type="text" id="nxFrAddInput" placeholder="Enter friend code..." maxlength="20" spellcheck="false" autocomplete="off" />
        <button class="nxFrBtn primary" id="nxFrAddBtn" type="button">Add Friend</button>
      </div>
    `;

    if (!friendsList.length) {
      html += `
        <div class="nxFrEmpty">
          <div class="emptyIcon"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
          No friends yet. Share your friend code or add someone!
        </div>
      `;
      return html;
    }

    html += `<div class="nxFrList">`;
    for (const f of friendsList) {
      const p = f.friend;
      const online = !!p.is_online;
      const playing = online && p.current_game;

      let statusText = "Offline";
      if (online && playing) {
        statusText = `Playing ${escapeHtml(p.current_game)}`;
      } else if (online) {
        statusText = "Online";
      } else if (p.last_seen) {
        statusText = `Last seen ${timeAgo(p.last_seen)}`;
      }

      html += `
        <div class="nxFrItem" data-friendship-id="${escapeHtml(f.id)}" data-friend-id="${escapeHtml(p.id)}">
          <div class="nxFrAvatar">
            ${avatarLetter(p.display_name || p.username)}
            <div class="nxFrOnlineDot ${online ? "online" : "offline"}"></div>
          </div>
          <div class="nxFrInfo">
            <div class="nxFrName">${escapeHtml(p.display_name || p.username)}</div>
            <div class="nxFrStatus ${playing ? "playing" : ""}">${statusText}</div>
          </div>
          <div class="nxFrActions">
            <button class="nxFrBtn" data-action="message" data-friend-id="${escapeHtml(p.id)}" type="button">Message</button>
            <button class="nxFrBtn danger" data-action="remove" data-friendship-id="${escapeHtml(f.id)}" type="button">Remove</button>
          </div>
        </div>
      `;
    }
    html += `</div>`;
    return html;
  }

  function renderRequestsTab() {
    let html = "";

    if (pendingIncoming.length) {
      html += `<div style="font-size:13px;font-weight:850;color:rgba(255,255,255,.55);margin-bottom:10px;">Incoming Requests</div>`;
      html += `<div class="nxFrList" style="margin-bottom:20px;">`;
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
      html += `</div>`;
    }

    if (pendingSent.length) {
      html += `<div style="font-size:13px;font-weight:850;color:rgba(255,255,255,.55);margin-bottom:10px;">Sent Requests</div>`;
      html += `<div class="nxFrList">`;
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
      html += `</div>`;
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

  function renderMessagesTab() {
    let html = "";

    if (!conversations.length) {
      html += `
        <div class="nxFrEmpty">
          <div class="emptyIcon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></div>
          Add friends to start messaging
        </div>
      `;
      return html;
    }

    html += `<div class="nxFrList">`;
    for (const p of conversations) {
      const unread = unreadCounts[p.id] || 0;
      html += `
        <div class="nxFrItem" style="cursor:pointer;" data-action="open-chat" data-friend-id="${escapeHtml(p.id)}">
          <div class="nxFrAvatar">
            ${avatarLetter(p.display_name || p.username)}
            <div class="nxFrOnlineDot ${p.is_online ? "online" : "offline"}"></div>
          </div>
          <div class="nxFrInfo">
            <div class="nxFrName">${escapeHtml(p.display_name || p.username)}</div>
            <div class="nxFrStatus">${p.is_online ? (p.current_game ? "Playing " + escapeHtml(p.current_game) : "Online") : "Offline"}</div>
          </div>
          ${unread > 0 ? `<span class="nxFrTabBadge">${unread}</span>` : ""}
        </div>
      `;
    }
    html += `</div>`;
    return html;
  }

  function renderChatView(wrap) {
    if (!activeChatFriend) return;
    const p = activeChatFriend;

    const chatHtml = `
      <div class="nxFrChat" id="nxFrChatBox">
        <div class="nxFrChatHeader">
          <button class="nxFrChatBackBtn" id="nxFrChatBack" type="button">← Back</button>
          <div class="nxFrChatName">${escapeHtml(p.display_name || p.username)}</div>
        </div>
        <div class="nxFrChatMessages" id="nxFrChatMessages"></div>
        <div class="nxFrChatInput">
          <input type="text" id="nxFrChatMsgInput" placeholder="Type a message..." maxlength="500" spellcheck="true" autocomplete="off" />
          <button class="nxFrSendBtn" id="nxFrSendBtn" type="button">Send</button>
        </div>
      </div>
    `;

    // Append chat after tabs
    const existing = wrap.querySelector("#nxFrChatBox");
    if (existing) existing.remove();

    wrap.insertAdjacentHTML("beforeend", chatHtml);

    // Bind chat events
    const backBtn = wrap.querySelector("#nxFrChatBack");
    const sendBtn = wrap.querySelector("#nxFrSendBtn");
    const msgInput = wrap.querySelector("#nxFrChatMsgInput");

    backBtn?.addEventListener("click", () => {
      activeChatFriend = null;
      chatMessages = [];
      renderContent();
    });

    async function doSend() {
      const text = msgInput?.value || "";
      if (!text.trim()) return;
      sendBtn.disabled = true;

      const res = await sendMessage(activeChatFriend.id, text);
      if (res.ok) {
        msgInput.value = "";
        // Add optimistically
        chatMessages.push({
          id: "temp-" + Date.now(),
          sender_id: myId(),
          receiver_id: activeChatFriend.id,
          content: text.trim(),
          is_read: false,
          created_at: new Date().toISOString()
        });
        renderChatMessages();
      }
      sendBtn.disabled = false;
      msgInput?.focus();
    }

    sendBtn?.addEventListener("click", doSend);
    msgInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doSend(); });

    // Load messages
    loadChatMessages();
  }

  async function loadChatMessages() {
    if (!activeChatFriend) return;
    chatMessages = await loadMessages(activeChatFriend.id);
    renderChatMessages();
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
        <div class="nxFrMsg ${isMine ? "sent" : "received"}">
          ${escapeHtml(m.content)}
          <div class="nxFrMsgTime">${formatTime(m.created_at)}</div>
        </div>
      `;
    }
    container.innerHTML = html;

    // Scroll to bottom
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }

  // ---- Event Binding ----
  function bindTabEvents(wrap) {
    // Copy code
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

      // Replace the username card with an inline editor
      const card = wrap.querySelector("#nxFrChangeUsername")?.closest(".nxFrCodeCard");
      if (!card) return;

      card.innerHTML = `
        <div style="flex:1; min-width:0;">
          <div class="nxFrCodeLabel">New Username</div>
          <div class="nxFrSetupRow" style="margin-top:6px;">
            <input type="text" id="nxFrNewNameInput" value="${escapeHtml(current)}" placeholder="3-20 chars" maxlength="20" spellcheck="false" autocomplete="off" />
            <button class="nxFrBtn primary" id="nxFrSaveNameBtn" type="button">Save</button>
            <button class="nxFrBtn" id="nxFrCancelNameBtn" type="button">Cancel</button>
          </div>
          <div id="nxFrNameError" style="color: rgba(255,80,100,.9); font-size:12.5px; font-weight:750; margin-top:6px; display:none;"></div>
        </div>
      `;

      const nameInput = card.querySelector("#nxFrNewNameInput");
      const saveBtn = card.querySelector("#nxFrSaveNameBtn");
      const cancelBtn = card.querySelector("#nxFrCancelNameBtn");
      const errEl = card.querySelector("#nxFrNameError");

      nameInput?.focus();
      nameInput?.select();

      cancelBtn?.addEventListener("click", () => renderContent());

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
        renderContent();
      });
    });
  }

  function bindContentEvents(wrap) {
    // Add friend
    const addInput = wrap.querySelector("#nxFrAddInput");
    const addBtn = wrap.querySelector("#nxFrAddBtn");

    async function doAdd() {
      const code = addInput?.value || "";
      if (!code.trim()) return;
      addBtn.disabled = true;
      addBtn.textContent = "Sending...";

      const res = await sendFriendRequest(code);
      if (res.ok) {
        if (typeof showToast === "function") showToast("Friend request sent!", "success");
        if (addInput) addInput.value = "";
      } else {
        if (typeof showToast === "function") showToast(res.error || "Failed", "error");
      }

      addBtn.disabled = false;
      addBtn.textContent = "Add Friend";
      renderContent();
    }

    addBtn?.addEventListener("click", doAdd);
    addInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });

    // Friend actions
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
        } else if (action === "remove") {
          await removeFriend(friendshipId);
          if (typeof showToast === "function") showToast("Friend removed", "info");
          renderContent();
        } else if (action === "message") {
          const friend = friendsList.find(f => f.friend.id === friendId)?.friend;
          if (friend) {
            currentTab = "messages";
            activeChatFriend = friend;
            chatMessages = [];
            renderContent();
          }
        } else if (action === "open-chat") {
          const friend = conversations.find(p => p.id === friendId);
          if (friend) {
            activeChatFriend = friend;
            chatMessages = [];
            renderContent();
          }
        }
      });
    });

    // Clickable friend items for messages tab
    wrap.querySelectorAll(".nxFrItem[data-action='open-chat']").forEach(item => {
      item.addEventListener("click", async () => {
        const friendId = item.dataset.friendId;
        const friend = conversations.find(p => p.id === friendId);
        if (friend) {
          activeChatFriend = friend;
          chatMessages = [];
          renderContent();
        }
      });
    });
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
        activeChatFriend = null;
        chatMessages = [];
      }
      return _origLoadPage.call(this, page);
    };
  }

  // ---- Offline on window close / unload ----
  window.addEventListener("beforeunload", () => {
    goOffline();
    stopPresenceHeartbeat();
    cleanupRealtime();
  });

})();
