/**
 * Statuspage.io — public status page updates
 */

export type StatusPageStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved";

export async function status_page_update(
  status: StatusPageStatus,
  message: string,
  env: {
    STATUSPAGE_API_KEY: string;
    STATUSPAGE_PAGE_ID: string;
    STATUSPAGE_COMPONENT_ID: string;
    STATUSPAGE_INCIDENT_ID?: string; // if updating an existing incident
  }
): Promise<string> {
  const componentStatus: Record<StatusPageStatus, string> = {
    investigating: "degraded_performance",
    identified: "partial_outage",
    monitoring: "degraded_performance",
    resolved: "operational",
  };

  if (!env.STATUSPAGE_INCIDENT_ID) {
    // Create new incident
    const body = {
      incident: {
        name: message.slice(0, 100),
        status,
        body: message,
        components: { [env.STATUSPAGE_COMPONENT_ID]: componentStatus[status] },
      },
    };

    const res = await fetch(
      `https://api.statuspage.io/v1/pages/${env.STATUSPAGE_PAGE_ID}/incidents`,
      {
        method: "POST",
        headers: {
          Authorization: `OAuth ${env.STATUSPAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) throw new Error(`Statuspage create failed: ${await res.text()}`);
    const data = (await res.json()) as { id: string };
    return data.id;
  } else {
    // Update existing incident
    const body = {
      incident: {
        status,
        body: message,
        components: { [env.STATUSPAGE_COMPONENT_ID]: componentStatus[status] },
      },
    };

    await fetch(
      `https://api.statuspage.io/v1/pages/${env.STATUSPAGE_PAGE_ID}/incidents/${env.STATUSPAGE_INCIDENT_ID}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `OAuth ${env.STATUSPAGE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    return env.STATUSPAGE_INCIDENT_ID;
  }
}
