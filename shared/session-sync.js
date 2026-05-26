/** Firebase session state sync for Squidly mini-apps. */

function sanitizePathToken(value) {
  const safe = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "default";
}

function deriveSessionToken(sessionInfo) {
  const params = new URLSearchParams(window.location.search || "");
  const fromInfo =
    sessionInfo?.sessionId || sessionInfo?.session || sessionInfo?.room || sessionInfo?.roomId;
  const fromQuery =
    params.get("session") || params.get("sessionId") || params.get("room") || params.get("roomId");
  const fromHash = window.location.hash ? window.location.hash.slice(1) : "";
  const fromPath = window.location.pathname
    ? window.location.pathname.split("/").filter(Boolean).pop()
    : "";
  return sanitizePathToken(fromInfo || fromQuery || fromHash || fromPath || "default");
}

/**
 * @param {{ gameSlug: string, serialize: () => string, apply: (payload: string) => void | Promise<void> }} options
 */
export function createSessionSync({ gameSlug, serialize, apply }) {
  let sharedSessionPath = null;
  let lastSyncedState = "";
  let isApplyingRemoteState = false;
  const subscribedStatePaths = new Set();

  function publish(squidlyAPI) {
    if (!sharedSessionPath || !squidlyAPI?.firebaseSet || isApplyingRemoteState) return;
    const payload = serialize();
    if (payload === lastSyncedState) return;
    lastSyncedState = payload;
    squidlyAPI.firebaseSet(`${sharedSessionPath}/state`, payload);
  }

  function subscribe(squidlyAPI) {
    if (!sharedSessionPath || !squidlyAPI?.firebaseOnValue) return;
    const statePath = `${sharedSessionPath}/state`;
    if (subscribedStatePaths.has(statePath)) return;
    subscribedStatePaths.add(statePath);
    squidlyAPI.firebaseOnValue(statePath, (payload) => {
      if (`${sharedSessionPath}/state` !== statePath) return;
      if (typeof payload !== "string" || !payload.trim() || payload === lastSyncedState) return;
      isApplyingRemoteState = true;
      Promise.resolve(apply(payload))
        .then(() => {
          lastSyncedState = payload;
        })
        .finally(() => {
          isApplyingRemoteState = false;
        });
    });
  }

  function init(sessionInfo, squidlyAPI) {
    const path = `${gameSlug}/sessions/${deriveSessionToken(sessionInfo)}`;
    if (path === sharedSessionPath) return;
    sharedSessionPath = path;
    subscribe(squidlyAPI);
  }

  return { init, publish };
}
