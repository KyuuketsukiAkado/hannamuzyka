import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

console.log('🚀 Starting Notion Blog Builder...');

const notionKey = process.env.NOTION_KEY;
const databaseId = process.env.NOTION_DATABASE_ID;

if (!notionKey) {
  console.error('❌ Error: NOTION_KEY environment variable is missing in GitHub Secrets!');
  process.exit(1);
}

if (!databaseId) {
  console.error('❌ Error: NOTION_DATABASE_ID environment variable is missing in GitHub Secrets!');
  process.exit(1);
}

console.log(`🔑 NOTION_KEY is present (length: ${notionKey.length})`);
console.log(`📊 NOTION_DATABASE_ID: ${databaseId}`);

const notion = new Client({ auth: notionKey });
const n2m = new NotionToMarkdown({ notionClient: notion });

const BLOG_DIR = path.join(process.cwd(), 'blog');
const IMAGES_DIR = path.join(process.cwd(), 'assets', 'images', 'blog');

if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

async function downloadImage(url, filename) {
  const filepath = path.join(IMAGES_DIR, filename);
  const relativePath = `../assets/images/blog/${filename}`;
  if (fs.existsSync(filepath)) return relativePath;

  return new Promise((resolve) => {
    const file = fs.createWriteStream(filepath);
    https.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(relativePath)));
    }).on('error', (err) => {
      console.warn(`⚠️ Failed to download image ${url}:`, err.message);
      resolve(url);
    });
  });
}

const HEADER_HTML = `
<header class="site-header">
  <div class="nav-container">
    <a href="../" class="nav-logo">Hanna Muzyka</a>
    <nav class="nav-links">
      <a href="../#work">Работы</a>
      <a href="../#about">Обо мне</a>
      <a href="../blog.html" class="active">Блог</a>
      <a href="https://t.me/KyuuketsukiAkado" target="_blank" rel="noopener">Telegram ↗</a>
    </nav>
  </div>
</header>
`;

const BLOG_CSS = `
<style>
  :root {
    --bg-color: #0b0b0d;
    --card-bg: #121215;
    --card-border: #1e1e24;
    --text-primary: #eceef2;
    --text-muted: #8e8e9c;
    --accent: #ffffff;
    --code-bg: #18181c;
    --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  }
  body { background-color: var(--bg-color); color: var(--text-primary); font-family: var(--font-sans); line-height: 1.7; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
  a { color: inherit; text-decoration: none; }
  .site-header { border-bottom: 1px solid var(--card-border); padding: 1.25rem 2rem; position: sticky; top: 0; background: rgba(11, 11, 13, 0.85); backdrop-filter: blur(12px); z-index: 100; }
  .nav-container { max-width: 900px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
  .nav-logo { font-weight: 700; font-size: 1.1rem; letter-spacing: -0.02em; }
  .nav-links a { color: var(--text-muted); margin-left: 1.5rem; font-size: 0.9rem; transition: color 0.2s; }
  .nav-links a:hover, .nav-links a.active { color: var(--accent); }
  .container { max-width: 780px; margin: 0 auto; padding: 3rem 1.5rem 6rem; }
  .article-header { margin-bottom: 3rem; }
  .article-meta { font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem; }
  .article-title { font-size: 2.4rem; font-weight: 800; letter-spacing: -0.03em; line-height: 1.2; margin: 0 0 1rem; color: #fff; }
  .tag-badge { display: inline-block; font-family: var(--font-mono); font-size: 0.75rem; background: #1c1c22; color: var(--text-muted); padding: 0.25rem 0.6rem; border-radius: 6px; margin-right: 0.4rem; margin-bottom: 0.4rem; border: 1px solid var(--card-border); }
  .article-body { font-size: 1.05rem; }
  .article-body h1, .article-body h2, .article-body h3 { color: #fff; margin-top: 2.5rem; margin-bottom: 1rem; letter-spacing: -0.02em; }
  .article-body p { margin-bottom: 1.4rem; color: #d1d1d6; }
  .article-body ul, .article-body ol { margin-bottom: 1.4rem; padding-left: 1.5rem; color: #d1d1d6; }
  .article-body li { margin-bottom: 0.4rem; }
  .article-body img { max-width: 100%; height: auto; border-radius: 12px; border: 1px solid var(--card-border); margin: 2rem 0; display: block; }
  .article-body blockquote { border-left: 3px solid #3b3b4f; padding-left: 1.2rem; color: var(--text-muted); font-style: italic; margin: 2rem 0; }
  .article-body pre { background: var(--code-bg); padding: 1.2rem; border-radius: 10px; overflow-x: auto; border: 1px solid var(--card-border); font-family: var(--font-mono); font-size: 0.9em; }
  .article-body code { font-family: var(--font-mono); background: var(--code-bg); padding: 0.2rem 0.4rem; border-radius: 4px; font-size: 0.9em; }
  .back-link { display: inline-flex; align-items: center; color: var(--text-muted); font-size: 0.9rem; margin-bottom: 2rem; transition: color 0.2s; }
  .back-link:hover { color: var(--accent); }
  footer.site-footer { border-top: 1px solid var(--card-border); margin-top: 5rem; padding-top: 2rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; }
</style>
`;

async function main() {
  console.log('🔄 Fetching database query from Notion...');

  let response;
  try {
    response = await notion.databases.query({
      database_id: databaseId,
      filter: { property: 'Published', checkbox: { equals: true } },
    });
  } catch (err) {
    console.error('❌ Notion Database Query Failed! Reason:', err.message);
    console.error('💡 Make sure you added the "GitHub Blog Bot" connection in Notion Database settings!');
    process.exit(1);
  }

  console.log(`📚 Found ${response.results.length} published pages.`);

  const posts = [];

  for (const page of response.results) {
    const props = page.properties;

    const titleObj = props.Title || props.Name || props.title || props.name;
    const title = titleObj?.title[0]?.plain_text || 'Без названия';

    const slugObj = props.Slug || props.slug;
    const rawSlug = slugObj?.rich_text[0]?.plain_text || page.id;
    const slug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-');

    const dateObj = props.Date || props.date;
    const date = dateObj?.date?.start || page.created_time.split('T')[0];

    const tagObj = props.Tags || props.Tag || props.tags || props.tag;
    const tags = tagObj?.multi_select?.map((t) => t.name) || [];

    const descObj = props.Description || props.description;
    const description = descObj?.rich_text[0]?.plain_text || '';

    console.log(`⏳ Processing post: "${title}" (slug: ${slug})...`);

    let coverUrl = '';
    if (page.cover) {
      const rawCoverUrl = page.cover.type === 'external' ? page.cover.external.url : page.cover.file.url;
      const ext = rawCoverUrl.split('?')[0].split('.').pop() || 'jpg';
      coverUrl = await downloadImage(rawCoverUrl, `cover-${slug}.${ext}`);
    }

    let mdString = '';
    try {
      const mdblocks = await n2m.pageToMarkdown(page.id);
      mdString = n2m.toMarkdownString(mdblocks).parent || '';
    } catch (err) {
      console.warn(`⚠️ Failed to parse blocks for ${title}:`, err.message);
    }

    const imgRegex = /!\[(.*?)\]\((https?:\/\/.*?)\)/g;
    let match;
    let imgCounter = 1;
    while ((match = imgRegex.exec(mdString)) !== null) {
      const rawImgUrl = match[2];
      const ext = rawImgUrl.split('?')[0].split('.').pop() || 'png';
      const localImgPath = await downloadImage(rawImgUrl, `${slug}-img-${imgCounter}.${ext}`);
      mdString = mdString.replace(rawImgUrl, localImgPath);
      imgCounter++;
    }

    let htmlContent = mdString
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
      .replace(/\!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" />')
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`(.*?)`/gim, '<code>$1</code>')
      .replace(/\n\n/g, '</p><p>');

    const articleHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Hanna Muzyka</title>
  <meta name="description" content="${description || title}">
  ${BLOG_CSS}
</head>
<body>
  ${HEADER_HTML}
  <div class="container">
    <a href="../blog.html" class="back-link">← К списку всех статей</a>
    <article>
      <header class="article-header">
        <div class="article-meta">${date}</div>
        <h1 class="article-title">${title}</h1>
        ${tags.length ? `<div>${tags.map((t) => `<span class="tag-badge">#${t}</span>`).join('')}</div>` : ''}
      </header>
      ${coverUrl ? `<img src="${coverUrl}" alt="${title}" style="width:100%; border-radius:12px; margin-bottom:2rem;" />` : ''}
      <div class="article-body"><p>${htmlContent}</p></div>
    </article>
    <footer class="site-footer"><p>© 2026 Hanna Muzyka · <a href="../blog.html">Блог</a></p></footer>
  </div>
</body>
</html>`;

    fs.writeFileSync(path.join(BLOG_DIR, `${slug}.html`), articleHtml, 'utf8');
    posts.push({ title, slug, date, tags, description });
  }

  console.log('📝 Generating blog catalog (blog.html)...');

  const catalogHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Блог — Hanna Muzyka</title>
  <meta name="description" content="Заметки о продуктовом дизайне, AI, вайбкодинге и геймдеве">
  ${BLOG_CSS}
  <style>
    .blog-grid { display: grid; gap: 1.5rem; margin-top: 2rem; }
    .blog-card { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 12px; padding: 1.75rem; display: block; transition: transform 0.2s, border-color 0.2s; }
    .blog-card:hover { transform: translateY(-2px); border-color: #3b3b4f; }
    .blog-card-title { font-size: 1.35rem; font-weight: 700; color: #fff; margin: 0.4rem 0 0.6rem; }
    .blog-card-desc { color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1rem; }
  </style>
</head>
<body>
  ${HEADER_HTML.replace(/\.\.\//g, './')}
  <div class="container">
    <section style="margin-bottom: 3rem;">
      <h1 style="font-size: 2.2rem; color: #fff; margin-bottom: 0.5rem;">Заметки с полей ✦</h1>
      <p style="color: var(--text-muted); font-size: 1.1rem;">Мысли про AI-воркфлоу, продукты, вайбкодинг и эксперименты.</p>
    </section>
    <div class="blog-grid">
      ${posts.length === 0 ? '<p style="color: var(--text-muted);">Пока нет опубликованных статей. Поставьте галочку "Published" в Notion!</p>' : posts.map((p) => `
        <a href="blog/${p.slug}.html" class="blog-card">
          <div class="article-meta">${p.date}</div>
          <div class="blog-card-title">${p.title}</div>
          ${p.description ? `<div class="blog-card-desc">${p.description}</div>` : ''}
          ${p.tags.length ? `<div>${p.tags.map((t) => `<span class="tag-badge">#${t}</span>`).join('')}</div>` : ''}
        </a>
      `).join('')}
    </div>
    <footer class="site-footer"><p>© 2026 Hanna Muzyka · <a href="./">Главная страница</a></p></footer>
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(process.cwd(), 'blog.html'), catalogHtml, 'utf8');
  console.log('✅ Blog build completed successfully!');
}

main().catch((err) => {
  console.error('❌ Build script crashed:', err);
  process.exit(1);
});
