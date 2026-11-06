// Builds the Blue and Green World website into the "dist" folder.
// No packages needed: Cloudflare runs `node build.js` every time you publish.
// Use `node build.js --preview` to build a copy with relative links for previewing.

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CONTENT = path.join(ROOT, "content");
const STATIC = path.join(ROOT, "static");
const OUT = path.join(ROOT, "dist");
const PREVIEW = process.argv.includes("--preview");

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function parseScalar(v) {
  v = v.trim();
  if (v === "" || v === "~" || v === "null") return "";
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

// Small front-matter reader: flat "key: value" pairs, quoted strings, and | or > blocks.
function parseFrontMatter(raw) {
  raw = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const lines = m[1].split("\n");
  const data = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2];
    if (/^[|>][-+]?\s*$/.test(val)) {
      const folded = val.startsWith(">");
      const block = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === "")) {
        block.push(lines[++i]);
      }
      const indent = Math.min(...block.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length), 99);
      const text = block.map((l) => l.slice(indent));
      data[key] = (folded ? text.join(" ").replace(/ {2,}/g, "\n") : text.join("\n")).trim();
    } else {
      data[key] = parseScalar(val);
    }
  }
  return { data, body: m[2] };
}

// Body text: HTML from the editor is used as-is; plain text becomes paragraphs.
function bodyHtml(body) {
  const b = (body || "").trim();
  if (!b) return "";
  if (b.startsWith("<")) return b;
  return b
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function plainText(html, max = 180) {
  const t = String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/\s+\S*$/, "") + "…";
}

function toDate(value, filename) {
  let d = value ? new Date(String(value).length === 10 ? value + "T12:00:00Z" : value) : null;
  if (!d || isNaN(d)) {
    const fm = filename.match(/^(\d{4})-(\d{2})-(\d{2})/);
    d = fm ? new Date(`${fm[1]}-${fm[2]}-${fm[3]}T12:00:00Z`) : new Date();
  }
  return d;
}

const fmtDate = (d) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

function slugFrom(filename) {
  return filename
    .replace(/\.md$/, "")
    .replace(/^\d{4}-\d{2}-\d{2}-?/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

function youtubeInfo(url) {
  if (!url) return null;
  const u = String(url).trim();
  const m =
    u.match(/youtu\.be\/([\w-]{11})/) ||
    u.match(/[?&]v=([\w-]{11})/) ||
    u.match(/youtube(?:-nocookie)?\.com\/(?:embed|shorts|live)\/([\w-]{11})/);
  if (!m) return null;
  return { id: m[1], vertical: /\/shorts\//.test(u) };
}

function loadCollection(name) {
  const dir = path.join(CONTENT, name);
  if (!fs.existsSync(dir)) return [];
  const used = new Set();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data, body } = parseFrontMatter(fs.readFileSync(path.join(dir, f), "utf8"));
      let slug = slugFrom(f);
      while (used.has(slug)) slug += "-2";
      used.add(slug);
      return { ...data, file: f, slug, date: toDate(data.date, f), html: bodyHtml(body) };
    })
    .filter((item) => item.draft !== true)
    .sort((a, b) => b.date - a.date);
}

function write(urlPath, html) {
  const file = urlPath.endsWith("/") ? path.join(OUT, urlPath, "index.html") : path.join(OUT, urlPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// ---------- content ----------

const about = (() => {
  const f = path.join(CONTENT, "about.md");
  if (!fs.existsSync(f)) return { data: {}, html: "" };
  const { data, body } = parseFrontMatter(fs.readFileSync(f, "utf8"));
  return { data, html: bodyHtml(body) };
})();

const site = {
  title: "Blue and Green World",
  videoBrand: "Bartholomew Family Fun",
  tagline: about.data.tagline || "Poems, reflections, and travels.",
  url: (about.data.site_url || "").replace(/\/$/, ""),
};

const writings = loadCollection("writings");
const videos = loadCollection("videos");
const posts = loadCollection("posts");

const KINDS = [
  { name: "Poetry", slug: "poetry", blurb: "Poems." },
  { name: "Reflection", slug: "reflections", blurb: "Introspection, written down." },
  { name: "America", slug: "america", blurb: "Writing on America." },
  {
    name: "1865 Exercise",
    slug: "1865-exercise",
    series: true,
    blurb:
      "Emerging technology, seen from 1865. Standing at emancipation, no one could have predicted where the path would lead, yet it made sense in hindsight. Each article names the real costs and makes the case that a fantastic future is also a realistic one.",
  },
];
const SERIES = KINDS.find((k) => k.series);
const kindOf = (w) => KINDS.find((k) => k.name === w.kind) || KINDS[1];

const socials = [
  ["YouTube", about.data.youtube_channel],
  ["Instagram", about.data.instagram],
  ["TikTok", about.data.tiktok],
  ["Facebook", about.data.facebook],
].filter(([, url]) => url);

// ---------- templates ----------

function layout({ title, description, section, body, wide = false, ogImage = "" }) {
  const nav = [
    ["Writings", "/writings/", "writings"],
    ["1865 Exercise", `/writings/${SERIES.slug}/`, "series"],
    ["Videos", "/videos/", "videos"],
    ["Posts", "/posts/", "posts"],
    ["About", "/about/", "about"],
  ]
    .map(([label, href, key]) => `<a href="${href}"${section === key ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("");
  const fullTitle = title ? `${title} | ${site.title}` : site.title;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.tagline)}">
<meta property="og:title" content="${esc(title || site.title)}">
<meta property="og:description" content="${esc(description || site.tagline)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,500;0,700;1,400&family=Alegreya+Sans:wght@400;500;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
</head>
<body class="section-${section || "home"}">
<a class="skip" href="#main">Skip to content</a>
<header class="masthead">
  <div class="wrap masthead-inner">
    <a class="wordmark" href="/"><span class="dot" aria-hidden="true"></span>${esc(site.title)}</a>
    <nav aria-label="Main">${nav}</nav>
  </div>
</header>
<main id="main" class="${wide ? "" : "wrap"}">
${body}
</main>
<footer class="footer">
  <div class="wrap footer-inner">
        ${socials.length ? `<p class="footer-links">${socials.map(([n, u]) => `<a href="${esc(u)}" rel="me">${n}</a>`).join("")}</p>` : ""}
    <p class="footer-small">© ${new Date().getFullYear()} ${esc(site.title)}. <a href="/feed.xml">RSS feed</a></p>
  </div>
</footer>
</body>
</html>`;
}

function videoThumb(v, { large = false } = {}) {
  const yt = youtubeInfo(v.youtube);
  const src = v.thumbnail || (yt ? `https://i.ytimg.com/vi/${yt.id}/${large ? "maxresdefault" : "hqdefault"}.jpg` : "");
  if (src) return `<img src="${esc(src)}" alt="" loading="lazy">`;
  return `<span class="thumb-placeholder" aria-hidden="true"><span>${esc(v.place || "")}</span></span>`;
}

function videoCard(v) {
  return `<li class="video-card">
  <a href="/videos/${v.slug}/">
    <span class="thumb">${videoThumb(v)}<span class="play" aria-hidden="true"></span></span>
    <span class="video-title">${esc(v.title)}</span>
    <span class="meta">${v.place ? esc(v.place) + ", " : ""}${fmtDate(v.date)}</span>
  </a>
</li>`;
}

function writingItem(w) {
  const k = kindOf(w);
  return `<li class="writing-item">
  <a href="/writings/${w.slug}/">
    <span class="kind kind-${k.slug}">${esc(k.name)}</span>
    <span class="writing-title">${esc(w.title)}</span>
    <span class="summary">${esc(w.summary || plainText(w.html, 160))}</span>
    <span class="meta">${fmtDate(w.date)}</span>
  </a>
</li>`;
}

function postItem(p, { full = true } = {}) {
  return `<article class="post">
  <header>
    <h3><a href="/posts/${p.slug}/">${esc(p.title)}</a></h3>
    <time datetime="${p.date.toISOString().slice(0, 10)}">${fmtDate(p.date)}</time>
  </header>
  ${p.image ? `<img class="post-image" src="${esc(p.image)}" alt="" loading="lazy">` : ""}
  <div class="prose">${full ? p.html : `<p>${esc(plainText(p.html, 220))}</p>`}</div>
</article>`;
}

const empty = (what, hint) =>
  `<p class="empty">No ${what} yet. ${hint}</p>`;

// ---------- pages ----------

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
copyDir(STATIC, OUT);

// Home
write(
  "/",
  layout({
    section: "home",
    wide: true,
    body: `
<section class="horizon" aria-labelledby="site-title">
  <h1 id="site-title" aria-label="${esc(site.title)}">
    <span class="horizon-sky" aria-hidden="true"><span class="wrap">Blue and</span></span>
    <span class="horizon-land" aria-hidden="true"><span class="wrap">Green World</span></span>
  </h1>
  <div class="horizon-foot"><div class="wrap"><p class="tagline">${esc(site.tagline)}</p><a href="/about/">Why blue and green</a></div></div>
</section>

<div class="wrap home">
  <section class="home-writing" aria-labelledby="h-writing">
    <div class="section-head">
      <h2 id="h-writing">Latest writing</h2>
      <a class="more" href="/writings/">All writings</a>
    </div>
    ${writings.length ? `<ul class="writing-list">${writings.slice(0, 4).map(writingItem).join("")}</ul>` : empty("writings", "")}
  </section>

  <section class="home-videos" aria-labelledby="h-videos">
    <div class="section-head">
      <h2 id="h-videos" class="brand-heading">${esc(site.videoBrand)}</h2>
      <a class="more" href="/videos/">All videos</a>
    </div>
    <p class="section-intro">Family travel videos.</p>
    ${videos.length ? `<ul class="video-grid">${videos.slice(0, 3).map(videoCard).join("")}</ul>` : empty("videos", "")}
  </section>

  <section class="home-posts" aria-labelledby="h-posts">
    <div class="section-head">
      <h2 id="h-posts">Posts</h2>
      <a class="more" href="/posts/">All posts</a>
    </div>
    ${posts.length ? posts.slice(0, 3).map((p) => postItem(p, { full: false })).join("") : empty("posts", "")}
  </section>
</div>`,
  })
);

// Writings index + one page per kind
function writingsIndex(active) {
  const list = active ? writings.filter((w) => kindOf(w).slug === active.slug) : writings;
  const filters = [`<a href="/writings/"${!active ? ' aria-current="page"' : ""}>All</a>`]
    .concat(KINDS.map((k) => `<a href="/writings/${k.slug}/"${active === k ? ' aria-current="page"' : ""}>${k.name}</a>`))
    .join("");
  return layout({
    title: active ? active.name : "Writings",
    description: active ? active.blurb : "Poems, reflections, essays on America, and the 1865 Exercise.",
    section: active && active.series ? "series" : "writings",
    body: `
<header class="page-head">
  <h1>${active ? esc(active.name) : "Writings"}</h1>
  <p>${active ? esc(active.blurb) : "Poems, reflections, essays on America, and the 1865 Exercise."}</p>
  <nav class="filters" aria-label="Kinds of writing">${filters}</nav>
</header>
${list.length ? `<ul class="writing-list">${list.map(writingItem).join("")}</ul>` : empty("writings here", "")}`,
  });
}
write("/writings/", writingsIndex(null));
KINDS.forEach((k) => write(`/writings/${k.slug}/`, writingsIndex(k)));

writings.forEach((w) => {
  const k = kindOf(w);
  // 1865 Exercise articles page through the series; everything else pages through all writing
  const pool = k.series ? writings.filter((x) => kindOf(x) === k) : writings;
  const i = pool.indexOf(w);
  const newer = pool[i - 1];
  const older = pool[i + 1];
  const where = k.series ? ` in the ${k.name}` : "";
  write(
    `/writings/${w.slug}/`,
    layout({
      title: w.title,
      description: w.summary || plainText(w.html),
      section: k.series ? "series" : "writings",
      body: `
<article class="piece ${k.slug === "poetry" ? "is-poem" : ""}">
  <header class="piece-head">
    <a class="kind kind-${k.slug}" href="/writings/${k.slug}/">${esc(k.name)}</a>
    <h1>${esc(w.title)}</h1>
    <time datetime="${w.date.toISOString().slice(0, 10)}">${fmtDate(w.date)}</time>
  </header>
  <div class="prose ${k.slug === "poetry" ? "poem" : ""}">${w.html}</div>
  <aside class="signoff" aria-label="About Blue and Green World">
    <p>The world isn't a line with two ends, black and white, us and them. It's round, and we're all on it together.</p>
    <p class="signoff-slogan">The world isn't black and white. It's blue and green.</p>
  </aside>
  ${k.series ? `<p class="series-link">This article is part of the ${esc(k.name)}. <a href="/writings/${k.slug}/">See every ${esc(k.name)} article</a></p>` : ""}
</article>
<nav class="pager" aria-label="More writing">
  ${older ? `<a class="older" href="/writings/${older.slug}/"><span>Earlier${where}</span>${esc(older.title)}</a>` : "<span></span>"}
  ${newer ? `<a class="newer" href="/writings/${newer.slug}/"><span>Later${where}</span>${esc(newer.title)}</a>` : "<span></span>"}
</nav>`,
    })
  );
});

// Videos
write(
  "/videos/",
  layout({
    title: site.videoBrand,
    description: "Family travel videos from Bartholomew Family Fun.",
    section: "videos",
    body: `
<header class="page-head">
  <h1 class="brand-heading">${esc(site.videoBrand)}</h1>
  <p>Family travel videos.${about.data.youtube_channel ? ` <a href="${esc(about.data.youtube_channel)}">Subscribe on YouTube</a>.` : ""}</p>
</header>
${videos.length ? `<ul class="video-grid">${videos.map(videoCard).join("")}</ul>` : empty("videos", "")}`,
  })
);

videos.forEach((v) => {
  const yt = youtubeInfo(v.youtube);
  const player = yt
    ? `<div class="player ${yt.vertical ? "vertical" : ""}"><iframe src="https://www.youtube-nocookie.com/embed/${yt.id}" title="${esc(v.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`
    : `<div class="player player-missing"><span class="thumb-placeholder"><span>${esc(v.place || "")}</span></span><p>Add a YouTube link to this video in your admin page and it will play here.</p></div>`;
  write(
    `/videos/${v.slug}/`,
    layout({
      title: v.title,
      description: plainText(v.html) || `${v.title}, a ${site.videoBrand} video.`,
      section: "videos",
      ogImage: yt ? `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg` : "",
      body: `
<article class="video-page">
  <header class="piece-head">
    <a class="brand-small" href="/videos/">${esc(site.videoBrand)}</a>
    <h1>${esc(v.title)}</h1>
    <p class="meta">${v.place ? esc(v.place) + ", " : ""}${fmtDate(v.date)}</p>
  </header>
  ${player}
  ${v.html ? `<div class="prose">${v.html}</div>` : ""}
</article>`,
    })
  );
});

// Posts
write(
  "/posts/",
  layout({
    title: "Posts",
    description: "Short notes and updates.",
    section: "posts",
    body: `
<header class="page-head">
  <h1>Posts</h1>
  <p>Short notes and updates.</p>
</header>
<div class="post-stream">${posts.length ? posts.map((p) => postItem(p)).join("") : empty("posts", "")}</div>`,
  })
);
posts.forEach((p) =>
  write(
    `/posts/${p.slug}/`,
    layout({
      title: p.title,
      description: plainText(p.html),
      section: "posts",
      body: `<div class="post-stream single">${postItem(p)}</div>
<p class="back"><a href="/posts/">All posts</a></p>`,
    })
  )
);

// About
write(
  "/about/",
  layout({
    title: about.data.title || "About",
    description: plainText(about.html),
    section: "about",
    body: `
<article class="piece">
  <header class="piece-head"><h1>${esc(about.data.title || "About")}</h1></header>
  <div class="prose">${about.html}</div>
  ${socials.length ? `<ul class="social-list">${socials.map(([n, u]) => `<li><a href="${esc(u)}" rel="me">${n}</a></li>`).join("")}</ul>` : ""}
</article>`,
  })
);

// 404
write(
  "/404.html",
  layout({
    title: "Page not found",
    body: `<header class="page-head"><h1>Page not found</h1><p>That page doesn't exist. Try the <a href="/writings/">writings</a>, <a href="/videos/">videos</a>, or <a href="/">home page</a>.</p></header>`,
  })
);

// RSS feed (writings, videos and posts together)
const feedItems = [
  ...writings.map((w) => ({ t: w.title, u: `/writings/${w.slug}/`, d: w.date, h: w.html })),
  ...videos.map((v) => ({ t: v.title, u: `/videos/${v.slug}/`, d: v.date, h: v.html })),
  ...posts.map((p) => ({ t: p.title, u: `/posts/${p.slug}/`, d: p.date, h: p.html })),
]
  .sort((a, b) => b.d - a.d)
  .slice(0, 30);
write(
  "/feed.xml",
  `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<title>${esc(site.title)}</title><link>${esc(site.url || "/")}</link><description>${esc(site.tagline)}</description>
${feedItems
  .map(
    (i) =>
      `<item><title>${esc(i.t)}</title><link>${esc(site.url + i.u)}</link><guid>${esc(site.url + i.u)}</guid><pubDate>${i.d.toUTCString()}</pubDate><description>${esc(i.h)}</description></item>`
  )
  .join("\n")}
</channel></rss>`
);

// ---------- preview mode: make every link relative so the site works from any folder ----------

if (PREVIEW) {
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const file of walk(OUT).filter((f) => f.endsWith(".html"))) {
    const fromDir = path.dirname(path.relative(OUT, file));
    const html = fs.readFileSync(file, "utf8").replace(/(href|src)="\/(?!\/)([^"]*)"/g, (_, attr, target) => {
      let t = target;
      if (t === "" || t.endsWith("/")) t += "index.html";
      let rel = path.relative(fromDir, t) || "index.html";
      return `${attr}="${rel}"`;
    });
    fs.writeFileSync(file, html);
  }
}

console.log(`Built ${writings.length} writings, ${videos.length} videos, ${posts.length} posts into dist/`);
