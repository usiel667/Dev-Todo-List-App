# Dev Environment Setup

Reference for getting the Dev Todo app running locally from scratch.

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | v22 LTS (recommended) | v26+ breaks Electron postinstall — see workaround below |
| npm | bundled with Node | |
| Electron | v28.3.3 | Defined in `package.json` |

---

## Install

```bash
git clone <repo-url>
cd Dev-Todo-List-App
npm install
```

---

## Electron Binary Workaround (Node v26+)

If `npm start` fails with `Cannot find Electron app`, the Electron binary didn't extract during postinstall. This is a known incompatibility between Node v26+ and Electron v28's postinstall script.

**Symptoms:**
- `npm install` succeeds with no errors
- `npm start` throws `Error: Cannot find module '/path/to/electron'` or similar
- `node_modules/electron/dist/` is empty or missing

**Fix:**
```bash
unzip -o ~/.cache/electron/*/electron-v*-linux-x64.zip \
  -d node_modules/electron/dist/
echo "electron" > node_modules/electron/path.txt
```

Run this after every `npm install` if you're on Node v26+. Switching to Node v22 LTS avoids the issue entirely.

---

## npm Scripts

| Script | Command | Use |
|--------|---------|-----|
| `npm start` | `electron .` | Launch in production mode |
| `npm run dev` | `NODE_ENV=development electron .` | Launch with hot-reload (`electron-reload`) |

**Hot reload** — in `dev` mode, `electron-reload` watches `src/` and reloads the renderer window on file changes. `main.js` changes still require a full restart.

---

## Project Structure

```
Dev-Todo-List-App/
├── main.js          ← Electron main process
├── preload.js       ← Context bridge (window.vault.*)
├── package.json
├── src/
│   ├── index.html   ← App shell
│   ├── renderer.js  ← All UI logic
│   └── styles.css   ← Tokyo Night theme
└── markdown files/  ← This vault (project notes)
```

---

## Node Version Management

Recommended: use `nvm` or `fnm` to switch Node versions per project.

```bash
# with nvm
nvm install 22
nvm use 22

# with fnm
fnm install 22
fnm use 22
```

---

## Opening a Vault

On first launch, click **Open vault** and select any folder containing `.md` files. The app reads all markdown recursively. The most recently opened vault is saved to localStorage and offered via **Open recent**.

For this project's own notes, open the `markdown files/` folder inside the project root.
