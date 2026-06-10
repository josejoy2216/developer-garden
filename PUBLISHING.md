# Publishing Developer Garden to the VS Code Marketplace

## 0. Put your name in it (2 minutes)

Search & replace these placeholders:

- `package.json` → `"publisher": "YOUR-PUBLISHER-ID"` (lowercase letters/numbers/hyphens, e.g. `rahul-dev`)
- `package.json` → `"author": { "name": "YOUR NAME" }`
- `package.json` → `repository.url` → your GitHub repo (recommended; push the code there)
- `LICENSE` → `YOUR NAME`

Your name then appears on the Marketplace page as the publisher/author.

## 1. Create a publisher account (one-time, ~10 minutes)

1. Sign in (or create a free account) at https://dev.azure.com — the Marketplace uses Microsoft's Azure DevOps for identity.
2. Create a **Personal Access Token**: profile icon → *Personal access tokens* → *New Token* →
   - Organization: **All accessible organizations**
   - Scopes: *Custom defined* → **Marketplace → Manage**
   - Copy the token (you only see it once).
3. Create your publisher at https://marketplace.visualstudio.com/manage → *Create publisher*. The **ID** you choose here must exactly match `"publisher"` in package.json. Add your display name — this is the name everyone sees.

## 2. Publish

```bash
npm install
npx vsce login YOUR-PUBLISHER-ID   # paste the token when asked
npx vsce publish                   # builds, packages, uploads
```

Done — it's live at `https://marketplace.visualstudio.com/items?itemName=YOUR-PUBLISHER-ID.developer-garden` within a few minutes, and anyone can install it from the Extensions panel by searching "Developer Garden".

**No-CLI alternative:** run `npx vsce package` to get a `.vsix`, then upload it manually at https://marketplace.visualstudio.com/manage → your publisher → *New extension* → *Visual Studio Code*.

## 3. Updating later

Bump the version and republish:

```bash
npx vsce publish patch   # 0.1.0 → 0.1.1 (or: minor / major)
```

## Notes

- `README.md` becomes your Marketplace page — it's already written, including the privacy statement.
- The `.vsix` file also works standalone: anyone can install it without the Marketplace via Extensions panel → `…` menu → *Install from VSIX*. Good for testing before going public.
- Optional polish before publishing: add a screenshot/GIF of the garden to the README, and push the repo to GitHub so the "Repository" link on your page works.
