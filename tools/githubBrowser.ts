export async function fetchGithubRepoFile(owner: string, repo: string, path: string): Promise<string> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`);
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      return `Target is a directory with ${data.length} items. Please specify a file path.`;
    }
    if (data.content && data.encoding === 'base64') {
      const decoded = Buffer.from(data.content, 'base64').toString('utf8');
      return decoded.substring(0, 20000);
    }
    return 'File could not be decoded.';
  } catch (error: any) {
    return `Error fetching from GitHub: ${error.message}`;
  }
}
