/**
 * GitHub REST API — write incident report files to a specific branch.
 *
 * Branch strategy:
 *   1. Check if REPORT_BRANCH exists.
 *   2. If not → create it from the repo's default branch.
 *   3. Write / update the file on that branch.
 */

const REPORT_BRANCH = "Kien_test_incident_report";

type GhEnv = {
  GITHUB_TOKEN: string;
  GITHUB_REPO_OWNER: string;
  GITHUB_REPO_NAME: string;
};

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

async function get_default_branch(env: GhEnv): Promise<string> {
  const res = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`,
    { headers: ghHeaders(env.GITHUB_TOKEN) }
  );
  if (!res.ok) return "main";
  const data = (await res.json()) as { default_branch?: string };
  return data.default_branch ?? "main";
}

/**
 * Ensure the report branch exists.
 * If it doesn't, create it from the tip of the default branch.
 */
async function ensure_branch(env: GhEnv): Promise<void> {
  const base =
    `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;

  // 1. Check if branch already exists
  const checkRes = await fetch(
    `${base}/git/refs/heads/${REPORT_BRANCH}`,
    { headers: ghHeaders(env.GITHUB_TOKEN) }
  );
  if (checkRes.ok) return; // branch exists — nothing to do

  // 2. Get SHA of default branch tip
  const defaultBranch = await get_default_branch(env);
  const refRes = await fetch(
    `${base}/git/refs/heads/${defaultBranch}`,
    { headers: ghHeaders(env.GITHUB_TOKEN) }
  );
  if (!refRes.ok) throw new Error(`[github] could not read ref for ${defaultBranch}`);
  const refData = (await refRes.json()) as { object: { sha: string } };

  // 3. Create the branch
  const createRes = await fetch(`${base}/git/refs`, {
    method: "POST",
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify({
      ref: `refs/heads/${REPORT_BRANCH}`,
      sha: refData.object.sha,
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`[github] branch creation failed: ${err}`);
  }
  console.log(`[github] created branch ${REPORT_BRANCH}`);
}

/**
 * Write (or overwrite) a file on REPORT_BRANCH.
 * Returns the HTML URL of the file on GitHub.
 */
export async function file_write(
  path: string,
  content: string,
  env: GhEnv
): Promise<string> {
  // Ensure the branch exists before writing
  await ensure_branch(env);

  const base =
    `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;
  const fileUrl = `${base}/contents/${path}?ref=${REPORT_BRANCH}`;

  // Check if the file already exists (need SHA to overwrite)
  let sha: string | undefined;
  const getRes = await fetch(fileUrl, { headers: ghHeaders(env.GITHUB_TOKEN) });
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha: string };
    sha = existing.sha;
  }

  const body: Record<string, string> = {
    message: `docs: add incident report ${path}`,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: REPORT_BRANCH,
    ...(sha ? { sha } : {}),
  };

  const putRes = await fetch(`${base}/contents/${path}`, {
    method: "PUT",
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify(body),
  });
  if (!putRes.ok) throw new Error(`[github] file_write failed: ${await putRes.text()}`);

  const data = (await putRes.json()) as { content: { html_url: string } };
  return data.content.html_url;
}

/**
 * Replace the `## Action Items (Prevention)` placeholder in an already-written
 * report file with the actual action items text from B5.
 */
export async function update_action_items(
  path: string,
  action_items: string,
  env: GhEnv
): Promise<string> {
  const base =
    `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}`;

  // Fetch current file content + SHA
  const getRes = await fetch(
    `${base}/contents/${path}?ref=${REPORT_BRANCH}`,
    { headers: ghHeaders(env.GITHUB_TOKEN) }
  );
  if (!getRes.ok) throw new Error(`[github] could not fetch file for B5 update`);
  const existing = (await getRes.json()) as { sha: string; content: string };
  const currentContent = decodeURIComponent(escape(atob(existing.content.replace(/\n/g, ""))));

  // Replace the entire Action Items section (from header to end of file).
  // This works whether B4 wrote AI-generated content or a placeholder — action items
  // are always the last section in the report.
  const updated = currentContent.replace(
    /## Action Items \(Prevention\)[\s\S]*/,
    `## Action Items (Prevention)\n\n${action_items}\n`
  );

  const body = {
    message: `docs: update action items for ${path}`,
    content: btoa(unescape(encodeURIComponent(updated))),
    branch: REPORT_BRANCH,
    sha: existing.sha,
  };

  const putRes = await fetch(`${base}/contents/${path}`, {
    method: "PUT",
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify(body),
  });
  if (!putRes.ok) throw new Error(`[github] update_action_items failed: ${await putRes.text()}`);

  const data = (await putRes.json()) as { content: { html_url: string } };
  return data.content.html_url;
}
