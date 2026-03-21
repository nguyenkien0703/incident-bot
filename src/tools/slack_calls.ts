/**
 * Slack Calls API wrappers
 * Required scopes: calls:write, calls:read
 */

async function slackCallsApi(
  method: string,
  body: Record<string, unknown>,
  token: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!data.ok) throw new Error(`Slack ${method} failed: ${data.error}`);
  return data;
}

/**
 * Creates a Slack Call. Returns the call_id to be used in subsequent calls.
 * @param external_unique_id - Unique ID to prevent duplicate calls (e.g. "INC-xxx-Uxxxxx")
 * @param join_url           - URL shown to invitees as the "join" button
 */
export async function slack_calls_add(
  external_unique_id: string,
  join_url: string,
  token: string
): Promise<{ call_id: string; join_url: string }> {
  const data = await slackCallsApi(
    "calls.add",
    { external_unique_id, join_url, title: `Incident Response Call` },
    token
  );
  const call = data.call as { id: string; join_url: string };
  return { call_id: call.id, join_url: call.join_url };
}

/**
 * Invites one or more Slack users to an existing call.
 * Invitees receive a call notification (like a huddle ring).
 */
export async function slack_calls_invite(
  call_id: string,
  slack_ids: string[],
  token: string
): Promise<void> {
  await slackCallsApi(
    "calls.invite",
    {
      id: call_id,
      users: JSON.stringify(slack_ids.map((slack_id) => ({ slack_id }))),
    },
    token
  );
}

/**
 * Returns the current participants of a call.
 * Empty array = no one joined yet.
 */
export async function slack_calls_info(
  call_id: string,
  token: string
): Promise<{ participants: { slack_id: string }[] }> {
  const data = await slackCallsApi("calls.info", { id: call_id }, token);
  const call = data.call as { users?: { slack_id: string }[] };
  return { participants: call.users ?? [] };
}

/**
 * Ends a Slack Call so it doesn't stay open indefinitely.
 */
export async function slack_calls_end(
  call_id: string,
  token: string
): Promise<void> {
  await slackCallsApi("calls.end", { id: call_id }, token);
}
