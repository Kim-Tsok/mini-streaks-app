// Points the download buttons at the newest published GitHub release.
// Change REPO if the app moves.
const REPO = 'Kim-Tsok/mini-streaks-app';
const RELEASES = `https://github.com/${REPO}/releases`;

// How to recognise each installer tauri-action uploads.
const MATCHERS = {
  exe: n => /-setup\.exe$/i.test(n),
  msi: n => /\.msi$/i.test(n),
  'dmg-arm': n => /(aarch64|arm64).*\.dmg$/i.test(n),
  'dmg-intel': n => /(x64|x86_64|intel).*\.dmg$/i.test(n),
  appimage: n => /\.AppImage$/i.test(n),
  deb: n => /\.deb$/i.test(n),
  rpm: n => /\.rpm$/i.test(n),
};

function detectOS() {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent).toLowerCase();
  if (p.includes('win')) return 'windows';
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux') || p.includes('x11')) return 'linux';
  return null;
}

const OS_NAME = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };
const PRIMARY_ASSET = { windows: 'exe', mac: 'dmg-arm', linux: 'appimage' };

function setLinks(urls) {
  document.querySelectorAll('[data-asset]').forEach(a => {
    a.href = urls[a.dataset.asset] || RELEASES;
  });
}

async function init() {
  document.getElementById('all-releases').href = RELEASES;
  document.getElementById('source-link').href = `https://github.com/${REPO}`;

  const os = detectOS();
  const primary = document.getElementById('primary-download');
  if (os) {
    primary.textContent = `Download for ${OS_NAME[os]}`;
    document.querySelector(`.platform[data-os="${os}"]`)?.classList.add('is-yours');
  }
  setLinks({});

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub said ${res.status}`);
    const release = await res.json();
    const urls = {};
    for (const asset of release.assets || []) {
      for (const [key, test] of Object.entries(MATCHERS)) {
        if (!urls[key] && test(asset.name)) urls[key] = asset.browser_download_url;
      }
    }
    setLinks(urls);
    const version = (release.tag_name || '').replace(/^v/, '');
    document.getElementById('release-line').textContent = `Version ${version}. Pick the file for your computer.`;
    if (os && urls[PRIMARY_ASSET[os]]) {
      primary.href = urls[PRIMARY_ASSET[os]];
      document.getElementById('primary-note').textContent =
        `Version ${version}, free. Also for ${Object.keys(OS_NAME).filter(k => k !== os).map(k => OS_NAME[k]).join(' and ')}.`;
    }
  } catch {
    // No published release yet (or offline): every button opens the releases page instead.
    document.getElementById('release-line').textContent = 'Downloads open on the GitHub releases page.';
  }
}

init();
