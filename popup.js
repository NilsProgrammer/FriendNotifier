const userIdInput = document.getElementById("userId");
const nicknameInput = document.getElementById("nickname");
const userList = document.getElementById("userList");
const modal = document.getElementById("modal");
const friendHistory = document.getElementById("friendHistory");
let currentHistoryUserId = null;

document.getElementById("clearStorage").onclick = async () => {
    const confirmed = confirm(
      "This will delete ALL tracked users and history. Continue?"
    );
  
    if (!confirmed) return;
  
    await chrome.storage.local.clear();
    renderUsers();
  
    // Close modal if open
    modal.style.display = "none";
  };

document.getElementById("addUser").onclick = addUser;
document.getElementById("reload").onclick = () => {
  chrome.runtime.sendMessage({ action: "manualCheck" });
};

document.getElementById("closeModal").onclick = () => {
    modal.style.display = "none";
  };

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "checkDone") {
      renderUsers();
    }
  });

  async function addUser() {
    const userId = userIdInput.value.trim();
    const nickname = nicknameInput.value.trim();
    if (!userId) return;
  
    const data = await chrome.storage.local.get(["trackedUsers", "userCache"]);
    const trackedUsers = data.trackedUsers || {};
    const userCache = data.userCache || {};
  
    // Create user entry if missing
    if (!trackedUsers[userId]) {
      trackedUsers[userId] = {
        nickname,
        friends: [],
        allFriendsEver: []
      };
    }
  
    // Fetch friends
    try {
      const res = await fetch(`https://friends.roblox.com/v1/users/${userId}/friends`);
      const json = await res.json();
      const now = Date.now();
  
      if (json.data && Array.isArray(json.data)) {
        for (const friend of json.data) {
          // Add to current friends
          if (!trackedUsers[userId].friends.includes(friend.id)) {
            trackedUsers[userId].friends.push(friend.id);
          }
  
          // Add to allFriendsEver or mark stillFriend = true
          const existing = trackedUsers[userId].allFriendsEver.find(f => f.id === friend.id);
          if (!existing) {
            trackedUsers[userId].allFriendsEver.push({
              id: friend.id,
              firstSeen: now,
              stillFriend: true
            });
          } else {
            existing.stillFriend = true;
          }
  
          // Cache username/displayName
          if (!userCache[friend.id]) {
            try {
              const userRes = await fetch(`https://users.roblox.com/v1/users/${friend.id}`);
              const userJson = await userRes.json();
              userCache[friend.id] = {
                username: userJson.name,
                displayName: userJson.displayName
              };
            } catch (e) { console.error(e); }
          }
        }
      }
    } catch (e) {
      console.error("Failed to fetch friends for new user", e);
    }
  
    // ✅ Save to storage **after all friends are fetched**
    await chrome.storage.local.set({ trackedUsers, userCache });
  
    // ✅ Render users after storage is updated
    renderUsers();
  }
  

async function deleteUser(userId) {
  const { trackedUsers = {} } = await chrome.storage.local.get("trackedUsers");
  delete trackedUsers[userId];
  await chrome.storage.local.set({ trackedUsers });
  renderUsers();
}

async function showHistory(userId) {
    currentHistoryUserId = userId; // store currently displayed user
    const data = await chrome.storage.local.get(["trackedUsers", "userCache"]);
    const user = data.trackedUsers[userId];
    const cache = data.userCache || {};
  
    friendHistory.innerHTML = "";
  
    if (!user.allFriendsEver.length) {
      friendHistory.innerHTML = "<li>No friends tracked yet</li>";
      modal.style.display = "block";
      return;
    }
  
    const sorted = [...user.allFriendsEver]
      .sort((a, b) => b.firstSeen - a.firstSeen);
  
    for (const entry of sorted) {
      const li = document.createElement("li");
  
      const btn = document.createElement("button");
        btn.style.width = "100%";
        btn.style.textAlign = "left";

        const userData = cache[entry.id];
        const username = userData?.username || entry.id;
        const displayName = userData?.displayName || "";

        // color based on friend status
        btn.style.color = entry.stillFriend ? "green" : "red";

        let text;
        if (displayName && displayName !== username) {
        text = `${displayName} (${username}) - added: ${new Date(entry.firstSeen).toLocaleString()}`;
        } else {
        text = `${username} - added: ${new Date(entry.firstSeen).toLocaleString()}`;
        }
        text += entry.isNew ? " (NEW)" : "";

        btn.textContent = text;

        btn.onclick = () => {
        chrome.tabs.create({ url: `https://www.roblox.com/users/${entry.id}/profile` });
        };

  
      li.appendChild(btn);
      friendHistory.appendChild(li);
    }
  
    modal.style.display = "block";
  }
  

async function renderUsers() {
  const { trackedUsers = {} } = await chrome.storage.local.get("trackedUsers");
  userList.innerHTML = "";

  for (const id in trackedUsers) {
    const li = document.createElement("li");

    const name = document.createElement("a");
    name.textContent = trackedUsers[id].nickname || id;
    name.href = `https://www.roblox.com/users/${id}/profile`;
    name.target = "_blank";
    name.style.textDecoration = "none";
    name.style.color = "blue";


    const actions = document.createElement("div");
    actions.className = "actions";

    const view = document.createElement("button");
    view.textContent = "View History";
    view.onclick = () => showHistory(id);

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.onclick = () => deleteUser(id);

    actions.append(view, del);
    li.append(name, actions);
    userList.appendChild(li);
  }
}

const exportBtn = document.getElementById("exportHistory");
exportBtn.onclick = async () => {
  if (!currentHistoryUserId) return;

  const data = await chrome.storage.local.get("trackedUsers");
  const user = data.trackedUsers[currentHistoryUserId];
  if (!user) return;

  const exportData = {
    nickname: user.nickname,
    friends: user.friends,
    allFriendsEver: user.allFriendsEver
  };

  const jsonData = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonData], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${currentHistoryUserId}_history.json`;
  a.click();
  URL.revokeObjectURL(url);
};

renderUsers();
