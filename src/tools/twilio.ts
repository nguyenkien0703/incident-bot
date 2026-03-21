/**
 * Twilio Voice — phone escalation fallback
 * TwiML is served by our own Fastify server at GET /twiml?msg=...
 */

import { Buffer } from "node:buffer";

export async function phone_call(
  to: string,
  message: string,
  env: {
    TWILIO_ACCOUNT_SID: string;
    TWILIO_AUTH_TOKEN: string;
    TWILIO_FROM_NUMBER: string;
    SERVER_URL: string; // e.g. https://incident-bot.yourcompany.com
  }
): Promise<void> {
  const twimlUrl = `${env.SERVER_URL}/twiml?msg=${encodeURIComponent(message)}`;

  const params = new URLSearchParams({
    To: to,
    From: env.TWILIO_FROM_NUMBER,
    Url: twimlUrl,
  });

  const auth = Buffer.from(
    `${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`
  ).toString("base64");

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio call failed: ${err}`);
  }
}
