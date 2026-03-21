/**
 * GitHub REST API — write incident report files to the repo
 */

export async function file_write(
  path: string,
  content: string,
  env: {
    GITHUB_TOKEN: string;
    GITHUB_REPO_OWNER: string;
    GITHUB_REPO_NAME: string;
  }
): Promise<string> {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${path}`;

  // Check if file already exists (to get SHA for update)
  let sha: string | undefined;
  const getRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (getRes.ok) {
    const existing = (await getRes.json()) as { sha: string };
    sha = existing.sha;
  }

  const body: Record<string, string> = {
    message: `docs: add incident report ${path}`,
    content: btoa(unescape(encodeURIComponent(content))), // base64 encode UTF-8
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`GitHub file_write failed: ${await res.text()}`);

  const data = (await res.json()) as { content: { html_url: string } };
  return data.content.html_url;
}
