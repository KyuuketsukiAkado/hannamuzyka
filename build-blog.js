import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';

console.log('🚀 Starting Notion Blog Builder...');

const notionKey = process.env.NOTION_KEY;
let databaseId = process.env.NOTION_DATABASE_ID;

if (!notionKey) {
  console.error('❌ Error: NOTION_KEY environment variable is missing in GitHub Secrets!');
  process.exit(1);
}

console.log(`🔑 NOTION_KEY is present (length: ${notionKey.length})`);

const notion = new Client({ auth: notionKey });
const n2m = new NotionToMarkdown({ notionClient: notion });

const BLOG_DIR = path.join(process.cwd(), 'blog');
const IMAGES_DIR = path.join(process.cwd(), 'assets', 'images', 'blog');

// ── РУЧНЫЕ СТАТЬИ (добавлены вручную, до интеграции с Notion) ─────────────
// Формат: { slug, title, date, description, tags }
// Файл blog/<slug>.html должен существовать в репозитории.
// Такие посты не затрутся синхронизацией и попадут в blog.html.
const MANUAL_POSTS = [
  {
    slug: 'kadence-ai',
    title: 'Как гуманитарий без опыта в кодинге собрал инди-игру с AI-агентом за полтора месяца',
    date: '2026-07-30',
    description: 'От концепт-дизайна велосипедного магазина до релизной web-игры на GitHub Pages — и почему документация оказалась важнее промптов.',
    tags: ['GAMEDEV', 'AI'],
    coverUrl: '../assets/optimized/blog-habr-01-1200.webp',
  },
];


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

// Умный автопоиск базы данных в Notion
async function resolveDatabaseId() {
  try {
    console.log('🔍 Auto-discovering Notion Database shared with bot...');
    const searchRes = await notion.search({});

    if (searchRes.results && searchRes.results.length > 0) {
      console.log(`✨ Found ${searchRes.results.length} item(s) connected to the bot.`);

      for (const item of searchRes.results) {
        if (item.object === 'database' || item.object === 'data_source') {
          const dbTitle = item.title?.[0]?.plain_text || 'Untitled DB';
          console.log(`   📌 Found Database: "${dbTitle}" | ID: ${item.id}`);
          return item.id;
        }
      }

      for (const item of searchRes.results) {
        if (item.parent && item.parent.type === 'database_id') {
          console.log(`   📌 Found Page inside Database! Parent DB ID: ${item.parent.database_id}`);
          return item.parent.database_id;
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Auto-search notice:', err.message);
  }

  return databaseId ? databaseId.trim() : '';
}

async function queryNotionDatabase(targetDbId, params) {
  if (notion.databases && typeof notion.databases.query === 'function') {
    return await notion.databases.query({ database_id: targetDbId, ...params });
  } else if (notion.dataSources && typeof notion.dataSources.query === 'function') {
    return await notion.dataSources.query({ data_source_id: targetDbId, ...params });
  } else {
    const res = await fetch(`https://api.notion.com/v1/databases/${targetDbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${notionKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Notion API HTTP ${res.status}: ${errText}`);
    }
    return await res.json();
  }
}

// Умная вставка ровно 2 карточек в раздел БЛОГ и очистка верха
function updateHomepageBlogSection(posts) {
  const indexPath = path.join(process.cwd(), 'index.html');
  if (!fs.existsSync(indexPath)) return;

  console.log('🏠 Updating homepage index.html with 2 latest post cards...');
  let indexHtml = fs.readFileSync(indexPath, 'utf8');

  // 1. Срезаем случайный мусор перед <!DOCTYPE или <html (без повреждения структуры страницы!)
  indexHtml = indexHtml.replace(/^[\s\S]*?(?=(<!DOCTYPE|<html))/i, '');

  // 2. Вычищаем любые старые блоки карточек из прошлого запуска
  indexHtml = indexHtml.replace(/<!-- BLOG_POSTS_START -->[\s\S]*?<!-- BLOG_POSTS_END -->\s*/gi, '');
  indexHtml = indexHtml.replace(/<div\s+class="latest-posts-(container|grid)"[\s\S]*?<\/div>\s*/gi, '');

  // 3. Берем ровно 2 самые свежие статьи для секции "Заметки с полей"
  const top2Posts = posts.slice(0, 2);

  const homepagePostsHtml = `<!-- BLOG_POSTS_START -->
<div class="latest-posts-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; margin: 2rem 0; text-align: left;">
  ${top2Posts.map((p) => {
    const relativeCover = p.coverUrl ? p.coverUrl.replace('../', '') : '';
    return `
    <a href="blog/${p.slug}.html" class="latest-post-card" style="display: flex; flex-direction: column; background: #121215; border: 1px solid #1e1e24; border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; transition: border-color 0.2s, transform 0.2s;">
      ${relativeCover ? `<div style="width: 100%; height: 140px; background: #18181c; overflow: hidden;"><img src="${relativeCover}" alt="${p.title}" style="width: 100%; height: 100%; object-fit: cover;" /></div>` : ''}
      <div style="padding: 1.25rem; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <div style="font-family: monospace; font-size: 0.78rem; color: #8e8e9c; margin-bottom: 0.4rem;">${p.date}</div>
          <div style="font-weight: 700; font-size: 1.1rem; color: #fff; line-height: 1.35; margin-bottom: 0.5rem;">${p.title}</div>
          ${p.description ? `<div style="font-size: 0.88rem; color: #a1a1aa; line-height: 1.4; margin-bottom: 0.8rem;">${p.description}</div>` : ''}
        </div>
        ${p.tags.length ? `<div>${p.tags.map((t) => `<span style="font-family: monospace; font-size: 0.72rem; background: #1c1c22; color: #8e8e9c; padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid #1e1e24; margin-right: 0.3rem;">#${t}</span>`).join('')}</div>` : ''}
      </div>
    </a>
  `;
  }).join('')}
</div>
<!-- BLOG_POSTS_END -->`;

  // 4. Находим кнопку в секции БЛОГ и вставляем ровно перед ней 2 карточки
  // ВАЖНО: используем [^>]* вместо [\s\S]*? внутри тега <a ...>, чтобы регулярка НЕ захватывала другие теги от самого начала страницы!
  const blogInviteRegex = /(<a[^>]*data-i18n="blog\.invite"[^>]*>[\s\S]*?<\/a>)/i;
  const blogLinkRegex = /(<a[^>]*class="[^"]*blog-intro-link[^"]*"[^>]*>[\s\S]*?<\/a>)/i;

  if (blogInviteRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(blogInviteRegex, `${homepagePostsHtml}\n$1`);
  } else if (blogLinkRegex.test(indexHtml)) {
    indexHtml = indexHtml.replace(blogLinkRegex, `${homepagePostsHtml}\n$1`);
  } else {
    indexHtml = indexHtml.replace(/(Зайти почитать)/i, `${homepagePostsHtml}\n$1`);
  }

  // 5. Меняем текст и href кнопки на "Смотреть все статьи ↗" -> blog.html
  indexHtml = indexHtml.replace(
    /(<a[^>]*?(?:data-i18n="blog\.invite"|blog-intro-link)[^>]*>)[\s\S]*?(<\/a>)/gi,
    '<a class="arrow-link blog-intro-link" href="blog.html" data-i18n="blog.invite">Смотреть все статьи <span>↗</span></a>'
  );

  fs.writeFileSync(indexPath, indexHtml, 'utf8');
  console.log('✅ Wiped top junk and placed 2 cards in blog section of index.html!');
}

const BLOG_CSS = `
<link rel="icon" type="image/png" sizes="192x192" href="../assets/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../css/style.css">
<style>
  /* ── Блог: дополнения к основному стилю сайта ── */
  .nav-active{color:var(--blue)!important}
  .nav-active::after{width:100%}
  .tag-badge{display:inline-block;border:1px solid rgba(119,167,255,.2);background:rgba(119,167,255,.04);border-radius:999px;padding:5px 10px;color:var(--blue-2);font:10px 'DM Mono',monospace;margin-right:6px;margin-bottom:6px}
  .blog-post-body img{display:block;width:100%;max-width:100%;height:auto!important;border-radius:var(--radius);border:1px solid var(--line);margin:28px 0;object-fit:contain}
  .blog-post-body blockquote{border-left:3px solid var(--blue);background:rgba(119,167,255,.05);border-radius:0 var(--radius) var(--radius) 0;padding:18px 24px;margin:28px 0;color:var(--muted);font-style:italic}
  .blog-post-body blockquote p{margin:0}
  .blog-post-body a{color:var(--blue);text-decoration:underline;text-underline-offset:3px}
  .blog-post-body a:hover{color:var(--blue-2)}
  .blog-post-body h1{font-size:30px;letter-spacing:-.025em;margin:48px 0 18px;color:var(--text)}
</style>
`;

const HEADER_HTML = `
<header class="site-header">
    <a class="wordmark" href="../index.html" aria-label="Hanna Muzyka home">Hanna<span>Muzyka</span></a>
    <nav class="nav-links" aria-label="Main navigation">
      <a href="../index.html#about" data-i18n="nav.about">Обо мне</a>
      <a href="../index.html#work" data-i18n="nav.work">Работы</a>
      <a href="../index.html#skills" data-i18n="nav.skills">Навыки</a>
      <a href="../index.html#experience" data-i18n="nav.experience">Опыт</a>
      <a href="../blog.html" class="nav-active" data-i18n="nav.blog">Блог</a>
      <a href="../index.html#art" data-i18n="nav.art">Арт</a>
    </nav>
    <div class="header-actions">
      <button class="lang-switch" id="lang-toggle" aria-label="Switch language">EN</button>
      <a class="small-contact" href="../index.html#connect" data-i18n="nav.contact">Связаться</a>
      <button class="menu-toggle" id="menu-toggle" aria-label="Открыть меню" aria-expanded="false" aria-controls="mobile-menu"><span></span><span></span><span></span></button>
    </div>
  </header>
  <div class="mobile-menu" id="mobile-menu">
    <nav class="mobile-menu-links" aria-label="Mobile navigation">
      <a href="../index.html#about" data-i18n="nav.about">Обо мне</a>
      <a href="../index.html#work" data-i18n="nav.work">Работы</a>
      <a href="../index.html#skills" data-i18n="nav.skills">Навыки</a>
      <a href="../index.html#experience" data-i18n="nav.experience">Опыт</a>
      <a href="../blog.html" data-i18n="nav.blog">Блог</a>
      <a href="../index.html#art" data-i18n="nav.art">Арт</a>
      <a class="mobile-menu-contact" href="../index.html#connect" data-i18n="nav.contact">Связаться</a>
    </nav>
  </div>
`;

const FOOTER_HTML = `
<footer class="site-footer section-wrap">
    <div><strong>Hanna Muzyka</strong><span>Product Designer & AI-assisted Creative Technologist</span></div>
    <div class="footer-links">
      <a href="https://github.com/KyuuketsukiAkado" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="https://www.linkedin.com/in/hannamuzyka/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
      <a href="https://www.behance.net/repro4chful" target="_blank" rel="noopener noreferrer">Behance</a>
      <a href="https://www.artstation.com/repro4chful" target="_blank" rel="noopener noreferrer">ArtStation</a>
      <a href="https://t.me/KyuuketsukiAkado" target="_blank" rel="noopener noreferrer">Telegram</a>
    </div>
    <div class="footer-bottom"><span>© 2026 Hanna Muzyka</span><span>repro4chful</span><a href="../assets/Hanna-Muzyka-Resume.pdf" download>Скачать CV ↓</a></div>
  </footer>
`;
async function main() {
  const activeDbId = await resolveDatabaseId();

  if (!activeDbId) {
    console.error('❌ Could not find an active Notion Database ID!');
    process.exit(1);
  }

  console.log(`🔄 Querying Notion Database ID: ${activeDbId}...`);

  let response;
  try {
    response = await queryNotionDatabase(activeDbId, {
      filter: { property: 'Published', checkbox: { equals: true } },
    });
  } catch (err) {
    console.error('❌ Notion Database Query Failed! Reason:', err.message);
    process.exit(1);
  }

  console.log(`📚 Found ${response.results.length} published pages in Notion.`);

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
    let pageCoverUrl = '';
    if (page.cover) {
      const rawCoverUrl = page.cover.type === 'external' ? page.cover.external.url : page.cover.file.url;
      const ext = rawCoverUrl.split('?')[0].split('.').pop() || 'jpg';
      coverUrl = await downloadImage(rawCoverUrl, `cover-${slug}.${ext}`);
      pageCoverUrl = coverUrl;
    }

    let mdString = '';
    try {
      const mdblocks = await n2m.pageToMarkdown(page.id);
      mdString = n2m.toMarkdownString(mdblocks).parent || '';
    } catch (err) {
      console.warn(`⚠️ Failed to parse blocks for ${title}:`, err.message);
    }

    // ── ОБРАБОТКА КАРТИНОК ──────────────────────────────────────────────
    // ВАЖНО: имя файла = хэш URL картинки, а НЕ порядковый номер!
    // Раньше имена были img-1, img-2, ... — при добавлении/удалении картинки
    // в Notion нумерация сдвигалась, и старые файлы (уже закоммиченные в репо)
    // подставлялись не на свои места, а дедупликатор удалял "дубликаты".
    // Теперь каждая картинка привязана к своему URL — порядок всегда как в Notion.
    const imgMatches = [...mdString.matchAll(/!\[(.*?)\]\((https?:\/\/.*?)\)/g)];
    for (const match of imgMatches) {
      const rawImgUrl = match[2];
      // Базовый URL без query-параметров (userId, cache и т.п. меняются от запроса к запросу)
      const urlBase = rawImgUrl.split('?')[0];
      const urlHash = crypto.createHash('md5').update(urlBase).digest('hex').slice(0, 8);
      const extRaw = (urlBase.split('.').pop() || '').toLowerCase();
      const ext = /^[a-z0-9]{2,5}$/.test(extRaw) ? extRaw : 'png';
      const filename = `${slug}-img-${urlHash}.${ext}`;
      const localImgPath = await downloadImage(rawImgUrl, filename);

      if (!coverUrl) coverUrl = localImgPath;
      // Заменяем ВСЕ вхождения этого URL — если картинка вставлена в статье
      // несколько раз, все копии останутся на своих местах
      mdString = mdString.split(rawImgUrl).join(localImgPath);
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
  <meta name="theme-color" content="#0b0b12">
  ${BLOG_CSS}
</head>
<body>
  <a href="#top" class="skip-link">Перейти к содержимому</a>
  ${HEADER_HTML}
  <main id="top" tabindex="-1">
    <article class="blog-post section-wrap" lang="ru">
      <div class="blog-post-header">
        <a class="blog-back" href="../blog.html">← Назад к блогу</a>
        <div class="blog-post-meta">
          ${tags.length ? `<span>${tags.join(' · ')}</span>` : ''}
          <span>${date}</span>
        </div>
        <h1>${title}</h1>
        ${description ? `<p class="blog-post-sub">${description}</p>` : ''}
      </div>
      ${pageCoverUrl ? `<figure class="blog-figure"><img src="${pageCoverUrl}" alt="${title}" loading="lazy"></figure>` : ''}
      <div class="blog-post-body"><p>${htmlContent}</p></div>
      <div class="blog-post-footer">
        <div class="blog-post-links">
          <a class="arrow-link" href="../blog.html">← Все статьи</a>
        </div>
      </div>
    </article>
  </main>
  ${FOOTER_HTML}
  <script src="../js/main.js"></script>
</body>
</html>`;

    fs.writeFileSync(path.join(BLOG_DIR, `${slug}.html`), articleHtml, 'utf8');
    posts.push({ title, slug, date, tags, description, coverUrl });
  }

  // Объединяем посты из Notion и ручные статьи
  const notionSlugs = new Set(posts.map((p) => p.slug));
  const manualPosts = MANUAL_POSTS.filter((m) => !notionSlugs.has(m.slug));
  const allPosts = [...posts, ...manualPosts].sort((a, b) => (a.date > b.date ? -1 : 1));

  console.log('📝 Generating blog catalog (blog.html)...');

  const catalogHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Блог — Hanna Muzyka</title>
  <meta name="description" content="Заметки о продуктовом дизайне, AI, вайбкодинге и геймдеве">
  <meta name="theme-color" content="#0b0b12">
  ${BLOG_CSS.replace(/\.\.\//g, './')}
  <style>
    .blog-catalog{padding:70px 0 110px;border-top:1px solid var(--line)}
    .blog-catalog-head{margin-bottom:48px}
    .blog-catalog-head h1{font-size:clamp(38px,5vw,62px);line-height:1.03;letter-spacing:-.035em;margin:16px 0 18px}
    .blog-catalog-head h1 em{font-family:Georgia,serif;font-weight:400;color:var(--purple);letter-spacing:-.03em}
    .blog-catalog-head p{max-width:520px;color:var(--muted);font-size:16px;line-height:1.7;margin:0}
    .catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;align-items:stretch}
    .catalog-card{position:relative;display:flex;flex-direction:column;background:linear-gradient(140deg,#13182e,#141525,#101622);border:1px solid rgba(119,167,255,.15);border-radius:var(--radius);overflow:hidden;transition:border-color .3s,transform .3s,box-shadow .3s}
    .catalog-card:hover{border-color:rgba(119,167,255,.35);transform:translateY(-3px);box-shadow:0 16px 42px #00000024}
    .catalog-card-cover{display:block;aspect-ratio:16/9;overflow:hidden;background:#eef2ff;border-bottom:1px solid var(--line);position:relative;z-index:1}
    .catalog-card-cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s ease}
    .catalog-card:hover .catalog-card-cover img{transform:scale(1.04)}
    .catalog-card-copy{padding:22px 24px 26px;display:flex;flex-direction:column;flex:1;position:relative;z-index:1}
    .catalog-card-meta{display:flex;justify-content:space-between;gap:12px;font:10px 'DM Mono',monospace;letter-spacing:.08em;color:var(--muted);margin-bottom:12px;flex-wrap:wrap}
    .catalog-card-meta .cat-tag{color:var(--blue)}
    .catalog-card h2{font-size:20px;letter-spacing:-.02em;line-height:1.3;margin:0 0 10px}
    .catalog-card h2 a{transition:color .25s}
    .catalog-card h2 a:hover{color:var(--blue)}
    .catalog-card-copy>p{color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 16px;flex:1}
    .catalog-card-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
    .catalog-card-tags span{border:1px solid rgba(119,167,255,.2);background:rgba(119,167,255,.04);border-radius:999px;padding:4px 9px;color:var(--blue-2);font:10px 'DM Mono',monospace}
    .catalog-card .arrow-link{margin-top:auto}
    @media (max-width: 560px){.catalog-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <a href="#top" class="skip-link">Перейти к содержимому</a>
  ${HEADER_HTML.replace(/\.\.\//g, './')}
  <main id="top" tabindex="-1">
    <section class="blog-catalog section-wrap">
      <div class="blog-catalog-head">
        <div class="section-kicker"><span>✦ БЛОГ</span></div>
        <h1>Заметки <em>с полей.</em></h1>
        <p>Мысли про AI-воркфлоу, продукты, вайбкодинг и эксперименты.</p>
      </div>
      <div class="catalog-grid">
        ${allPosts.length === 0 ? '<p style="color: var(--text-muted);">Пока нет опубликованных статей. Поставьте галочку "Published" в Notion!</p>' : allPosts.map((p) => `
        <article class="catalog-card reveal">
          ${p.coverUrl ? `<a class="catalog-card-cover" href="blog/${p.slug}.html" tabindex="-1" aria-hidden="true"><img src="${p.coverUrl.replace('../', '')}" alt="" loading="lazy"></a>` : ''}
          <div class="catalog-card-copy">
            <div class="catalog-card-meta"><span>${p.date}</span>${p.tags.length ? `<span class="cat-tag">${p.tags.join(' · ')}</span>` : ''}</div>
            <h2><a href="blog/${p.slug}.html">${p.title}</a></h2>
            ${p.description ? `<p>${p.description}</p>` : ''}
            ${p.tags.length ? `<div class="catalog-card-tags">${p.tags.map((t) => `<span>#${t}</span>`).join('')}</div>` : ''}
            <a class="arrow-link" href="blog/${p.slug}.html">Читать статью <span>↗</span></a>
          </div>
        </article>
      `).join('')}
      </div>
    </section>
  </main>
  ${FOOTER_HTML.replace(/\.\.\//g, './')}
  <script src="js/main.js"></script>
</body>
</html>`;

  fs.writeFileSync(path.join(process.cwd(), 'blog.html'), catalogHtml, 'utf8');
  console.log('✅ Created blog.html successfully!');

  // Автоматически очищаем верхушку и вставляем 2 карточки в раздел БЛОГ
  updateHomepageBlogSection(allPosts);
}

main().catch((err) => {
  console.error('❌ Build script crashed:', err);
  process.exit(1);
});
