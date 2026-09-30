# Mini Streaks website

A plain static site with no build step: `index.html`, `style.css`, `download.js` and `assets/`.

- **Preview:** `python3 -m http.server -d mini-streaks-website 8000`, then open http://localhost:8000
- **Publish:** `.github/workflows/website.yml` deploys this folder to GitHub Pages on every push to `main` that changes it. It needs a one-time setting: repo Settings → Pages → Source: *GitHub Actions*.
- **Downloads:** `download.js` asks GitHub for the newest *published* release of `Kim-Tsok/mini-streaks-app` and links each button to the matching installer. Until a release is published, every button opens the releases page.
