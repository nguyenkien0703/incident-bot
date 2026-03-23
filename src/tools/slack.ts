/**
 * Slack tool implementations
 */

export interface SlackEnv {
  SLACK_BOT_TOKEN: string;
  SLACK_INCIDENTS_CHANNEL: string;
}

async function slackApi(
  method: string,
  body: Record<string, unknown>,
  token: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

export async function slack_post_message(
  channel: string,
  text: string,
  token: string
): Promise<void> {
  await slackApi("chat.postMessage", { channel, text }, token);
}

export async function slack_create_thread(
  channel: string,
  text: string,
  token: string
): Promise<string> {
  const data = await slackApi("chat.postMessage", { channel, text }, token);
  const ts = (data.ts as string | undefined) ?? "";
  return ts;
}

export async function slack_reply_to_thread(
  channel: string,
  thread_ts: string,
  text: string,
  token: string
): Promise<void> {
  await slackApi("chat.postMessage", { channel, thread_ts, text }, token);
}

export function slack_tag_user(user_id: string): string {
  return `<@${user_id}>`;
}

/**
 * Opens a DM channel with a user and returns the channel ID.
 * Required scope: im:write
 */
export async function slack_open_dm(user_id: string, token: string): Promise<string> {
  const data = await slackApi("conversations.open", { users: user_id }, token);
  return ((data.channel as Record<string, unknown>).id as string);
}

export function slack_tag_group(group_name: string): string {
  return `<!subteam^${group_name}>`;
}

/**
 * Post a Block Kit message in a thread.
 * Returns { ts, channel } — channel is the real channel ID from Slack's response,
 * which is needed for chat.update (channel name alone won't work there).
 */
export async function slack_reply_blocks(
  channel: string,
  thread_ts: string,
  blocks: object[],
  text: string,
  token: string
): Promise<{ ts: string; channel: string }> {
  const data = await slackApi(
    "chat.postMessage",
    { channel, thread_ts, blocks, text },
    token
  );
  return {
    ts: (data.ts as string) ?? "",
    channel: (data.channel as string) ?? channel,
  };
}

/**
 * In-memory cache of workspace users: user_id → display name.
 * Built lazily on first lookup failure, refreshed every hour.
 */
let _userCache: Map<string, string> | null = null;
let _userCacheBuiltAt = 0;
const USER_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function build_user_cache(token: string): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  let cursor: string | undefined;
  do {
    const data = await slackApi(
      "users.list",
      { limit: 200, ...(cursor ? { cursor } : {}) },
      token
    ).catch(() => ({ members: [], response_metadata: {} }));

    for (const member of (data.members as Record<string, unknown>[]) ?? []) {
      const profile = (member.profile as Record<string, unknown>) ?? {};
      const name =
        (profile.display_name as string | undefined)?.trim() ||
        (profile.real_name as string | undefined)?.trim() ||
        (member.name as string | undefined)?.trim();
      if (name && member.id) cache.set(member.id as string, name);
    }
    cursor = ((data.response_metadata as Record<string, unknown>)?.next_cursor as string) || undefined;
  } while (cursor);

  console.log(`[slack] user cache built: ${cache.size} workspace members`);
  return cache;
}

async function lookup_user_in_workspace(user_id: string, token: string): Promise<string | null> {
  const now = Date.now();
  if (!_userCache || now - _userCacheBuiltAt > USER_CACHE_TTL_MS) {
    _userCache = await build_user_cache(token);
    _userCacheBuiltAt = now;
  }
  return _userCache.get(user_id) ?? null;
}

/**
 * Resolve a Slack user_id to a human-readable display name.
 * Strategy: users.info → workspace cache (users.list) → <@USERID> fallback
 */
export async function slack_get_user_name(user_id: string, token: string): Promise<string> {
  try {
    const data = await slackApi("users.info", { user: user_id }, token);
    const user = data.user as Record<string, unknown>;
    const profile = (user.profile as Record<string, unknown>) ?? {};
    return (
      (profile.display_name as string | undefined)?.trim() ||
      (profile.real_name as string | undefined)?.trim() ||
      (user.name as string | undefined)?.trim() ||
      user_id
    );
  } catch {
    // users.info failed — try full workspace member list
    const fromCache = await lookup_user_in_workspace(user_id, token);
    if (fromCache) return fromCache;
    console.warn(`[slack] could not resolve name for ${user_id} — not a workspace member`);
    return `<@${user_id}>`; // Slack renders this correctly in messages
  }
}

/**
 * Open a Slack modal. trigger_id must be used within 3 seconds of the action.
 */
export async function slack_open_modal(
  trigger_id: string,
  view: object,
  token: string
): Promise<void> {
  await slackApi("views.open", { trigger_id, view }, token);
}

/**
 * Update an existing message in place (e.g. to disable buttons after a click).
 */
export async function slack_update_message(
  channel: string,
  ts: string,
  blocks: object[],
  text: string,
  token: string
): Promise<void> {
  await slackApi("chat.update", { channel, ts, blocks, text }, token);
}
