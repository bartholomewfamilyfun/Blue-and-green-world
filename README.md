# Blue and Green World

Personal website: writings (poetry, reflections, America), Bartholomew Family Fun travel videos, and short posts.

## Posting

Go to **yoursite.com/admin** (or https://app.pagescms.org), sign in with GitHub, and pick Writings, Videos, Posts, or About. Fill in the form and save. The site updates itself within a minute or two.

- **Poems:** press Enter at the end of each line; leave an empty line between stanzas.
- **Videos:** upload to YouTube first, then paste the link from YouTube's Share button. Shorts work too.
- **Drafts:** tick "Draft" to save something without showing it on the site.

## How it's hosted

- Files live in this GitHub repository.
- Cloudflare (Workers) builds the site whenever something changes:
  - Build command: `node build.js`
  - Deploy command: `npx wrangler deploy`
  - `wrangler.jsonc` tells Cloudflare to serve the `dist` folder
- No packages to install.

## Folders

- `content/` — everything you post (one file per piece)
- `static/` — styles, icon, and uploaded images
- `.pages.yml` — what the admin page shows
- `build.js` — turns content into web pages
