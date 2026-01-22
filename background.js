const SLEEP_MS = 3000; // 3 seconds between users

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("checkFriends", { periodInMinutes: 5 });
  return true;
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "checkFriends") {
    checkAllUsers();
    return true;
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "manualCheck") {
    checkAllUsers();
    return true;
  }
});

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

  async function checkAllUsers() {
    const data = await chrome.storage.local.get(["trackedUsers", "userCache"]);
    const trackedUsers = data.trackedUsers || {};
    const userCache = data.userCache || {};
  
    for (const userId of Object.keys(trackedUsers)) {
      await checkUser(userId, trackedUsers[userId], userCache);
      await sleep(SLEEP_MS);
    }
  
    await chrome.storage.local.set({ trackedUsers, userCache });
  
    // Notify popup that check is done
    chrome.runtime.sendMessage({ action: "checkDone" });
  }
  

async function checkUser(userId, userData, userCache) {
    try {
      const res = await fetch(
        `https://friends.roblox.com/v1/users/${userId}/friends`
      );
      const json = await res.json();
      const currentFriends = json.data.map(f => f.id);
      const now = Date.now();
  
      const oldFriendsMap = {};
      userData.allFriendsEver.forEach(f => oldFriendsMap[f.id] = f);
  
      // Track added friends
      const addedFriends = [];
      for (const friendId of currentFriends) {
        if (!oldFriendsMap[friendId]) {
          // if new friend
          addedFriends.push(friendId);
          userData.allFriendsEver.push({ id: friendId, firstSeen: now, stillFriend: true, isNew: true });
        
        } else {
          // existing friend 
          oldFriendsMap[friendId].isNew = oldFriendsMap[friendId].stillFriend === false ? true : false;
          oldFriendsMap[friendId].stillFriend = true;
        }
  
        // cache usernames if missing
        if (!userCache[friendId]) {
          try {
            const userRes = await fetch(`https://users.roblox.com/v1/users/${friendId}`);
            const userJson = await userRes.json();
            userCache[friendId] = { username: userJson.name, displayName: userJson.displayName };
          } catch {}
        }
      }
  
      // Track removed friends
      const removedFriends = [];
      for (const f of userData.allFriendsEver) {
        if (!currentFriends.includes(f.id) && f.stillFriend !== false) {
          f.stillFriend = false;
          f.isNew = true;
          removedFriends.push(f.id);
        }
      }
  
      // Update current friends list
      userData.friends = currentFriends;
  
      // Send notifications
      if (addedFriends.length) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icon.png"), // optional
          title: "New Friend Detected",
          message: `${userData.nickname || userId} added ${addedFriends.length} friend(s)`
        });
      }
  
      if (removedFriends.length) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: chrome.runtime.getURL("icon.png"),
          title: "Friend Removed",
          message: `${userData.nickname || userId} lost ${removedFriends.length} friend(s)`
        });
      }
  
    } catch (e) {
      console.error("Fetch failed for", userId, e);
    }
}