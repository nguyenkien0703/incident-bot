/**
 * Google Calendar — create incident response meeting
 */

export interface MeetingResult {
  meeting_link: string;
  event_id: string;
}

export async function calendar_create_meeting(
  title: string,
  invite_list: string[], // list of email addresses
  description: string,
  env: {
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_REFRESH_TOKEN: string;
  }
): Promise<MeetingResult> {
  // 1. Refresh access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }).toString(),
  });

  const tokenData = (await tokenRes.json()) as { access_token: string };
  const accessToken = tokenData.access_token;

  // 2. Create event starting now, 30 min duration, with Meet link
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 60 * 1000);

  const event = {
    summary: title,
    description,
    start: { dateTime: now.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: invite_list.map((email) => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: `incident-${Date.now()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  const eventRes = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!eventRes.ok) {
    throw new Error(`Calendar create failed: ${await eventRes.text()}`);
  }

  const eventData = (await eventRes.json()) as {
    id: string;
    conferenceData?: { entryPoints?: { uri: string }[] };
  };

  const meeting_link =
    eventData.conferenceData?.entryPoints?.[0]?.uri ?? "https://meet.google.com";

  return { meeting_link, event_id: eventData.id };
}
