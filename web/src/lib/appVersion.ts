export const GITHUB_REPO = 'https://github.com/dodgerbluee/famOS';

const rawVersion = (import.meta.env.VITE_APP_VERSION || 'dev').trim();
const cleanVersion = rawVersion.replace(/^v/, '');
const isCommit = /^[0-9a-f]{40}$/i.test(cleanVersion);
const isRelease = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(cleanVersion);

export const appVersion = {
  label: isCommit ? cleanVersion.slice(0, 7) : isRelease ? `v${cleanVersion}` : cleanVersion,
  url: isCommit
    ? `${GITHUB_REPO}/commit/${cleanVersion}`
    : isRelease
      ? `${GITHUB_REPO}/releases/tag/v${cleanVersion}`
      : GITHUB_REPO,
  description: isCommit ? `famOS commit ${cleanVersion.slice(0, 7)}` : `famOS ${isRelease ? `v${cleanVersion}` : cleanVersion}`,
};
