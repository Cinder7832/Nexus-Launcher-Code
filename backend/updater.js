// backend/updater.js
const https = require("https");

// ✅ CHANGE THIS to your RAW store.json URL:
const REMOTE_STORE_URL =
  "https://raw.githubusercontent.com/Cinder7832/unity-games/main/store.json";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "NexusLauncher",
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`HTTP ${res.statusCode}`));
            }
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

async function fetchRemoteStore() {
  // ✅ cache-buster query param avoids GitHub RAW caching issues
  const url = `${REMOTE_STORE_URL}?t=${Date.now()}`;
  const store = await fetchJson(url);

  // normalize shape
  return { games: Array.isArray(store?.games) ? store.games : [] };
}

// ✅ NEW: fetch a remote changelog json (online)
async function fetchRemoteChangelog(changelogUrl) {
  const raw = String(changelogUrl || "").trim();
  if (!raw) throw new Error("Missing changelogUrl");

  const joiner = raw.includes("?") ? "&" : "?";
  const url = `${raw}${joiner}t=${Date.now()}`;
  return await fetchJson(url);
}

// very simple semver-ish compare: "1.2.3"
function cmpVersion(a, b) {
  const pa = String(a || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0.0.0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function computeUpdates(remoteStore, installed) {
  const updates = [];
  const remoteGames = remoteStore?.games || [];
  const inst = installed || {};

  for (const g of remoteGames) {
    const id = String(g.id);
    const local = inst[id];
    if (!local) continue;

    const fromV = local.version || "0.0.0";
    const toV = g.version || "0.0.0";

    if (cmpVersion(toV, fromV) > 0) {
      updates.push({
        id,
        gameId: id,
        name: g.name || local.name || id,
        fromVersion: fromV,
        toVersion: toV
      });
    }
  }

  return updates;
}

module.exports = {
  fetchRemoteStore,
  computeUpdates,
  fetchRemoteChangelog
};
