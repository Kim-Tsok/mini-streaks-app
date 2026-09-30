# Mini Streaks website

A plain static site with no build step: `index.html`, `style.css`, `download.js` and `assets/`.

- **Preview:** `python3 -m http.server -d mini-streaks-website 8000`, then open http://localhost:8000
- **Publish on Vercel:** import the repo, set *Root Directory* to `mini-streaks-website`, and choose Framework Preset *Other*. There's no build command or output directory to set.
- **Downloads:** `download.js` asks GitHub for the newest *published* release of `Kim-Tsok/mini-streaks-app` and links each button to the matching installer. Until a release is published, every button opens the releases page.
