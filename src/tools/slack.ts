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
 * Post a Block Kit message in a thread. Returns the new message ts.
 */
export async function slack_reply_blocks(
  channel: string,
  thread_ts: string,
  blocks: object[],
  text: string,
  token: string
): Promise<string> {
  const data = await slackApi(
    "chat.postMessage",
    { channel, thread_ts, blocks, text },
    token
  );
  return (data.ts as string) ?? "";
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
