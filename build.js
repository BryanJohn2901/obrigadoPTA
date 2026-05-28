#!/usr/bin/env node
/**
 * Build de produção — Obrigado PTA (pos.personaltraineracademy.com.br)
 * Gera dist/ pronta para deploy estático.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { minify: minifyHtml } = require('html-minifier-terser');
const CleanCSS = require('clean-css');
const { minify: minifyJs } = require('terser');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const ASSETS_SRC = path.join(ROOT, 'assets');
const ASSETS_DIST = path.join(DIST, 'assets');
const CANONICAL_BASE = 'https://pos.personaltraineracademy.com.br';
const GTM_ID = 'GTM-55TLN64G';

const PAGE = {
  title: 'Inscrição Confirmada | Summit Personal Trainer Academy',
  description:
    'Parabéns! Sua inscrição foi confirmada com sucesso. Garanta agora seu ingresso no Summit Personal Trainer Academy — o maior encontro de profissionais da Educação Física do Brasil.',
  ogImage: `${CANONICAL_BASE}/assets/andre.webp`,
};

const GTM_HEAD = `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');</script>
<!-- End Google Tag Manager -->`;

const GTM_BODY = `<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${GTM_ID}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;

/** @type {Map<string, string>} original filename → webp filename */
const webpMap = new Map();

function log(msg) {
  console.log(`[build] ${msg}`);
}

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
  }
}

async function optimizeAssets() {
  ensureDir(ASSETS_DIST);
  if (!fs.existsSync(ASSETS_SRC)) {
    log('Pasta assets/ não encontrada — pulando.');
    return;
  }

  copyRecursive(ASSETS_SRC, ASSETS_DIST);

  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    log('sharp indisponível — imagens copiadas sem WebP.');
    return;
  }

  const rasterExt = /\.(png|jpe?g)$/i;
  for (const file of fs.readdirSync(ASSETS_DIST)) {
    if (!rasterExt.test(file)) continue;
    const srcPath = path.join(ASSETS_DIST, file);
    const base = file.replace(rasterExt, '');
    const webpPath = path.join(ASSETS_DIST, `${base}.webp`);
    try {
      await sharp(srcPath).webp({ quality: 82, effort: 4 }).toFile(webpPath);
      const origKb = Math.round(fs.statSync(srcPath).size / 1024);
      const webpKb = Math.round(fs.statSync(webpPath).size / 1024);
      webpMap.set(file, `${base}.webp`);
      log(`${file} → ${base}.webp (${origKb}KB → ${webpKb}KB)`);
      fs.unlinkSync(srcPath);
    } catch (err) {
      log(`Aviso: falha ao converter ${file}: ${err.message}`);
    }
  }
}

function buildTailwind() {
  const outFile = path.join(DIST, 'css', 'tailwind.css');
  ensureDir(path.dirname(outFile));
  execSync(
    `npx tailwindcss -i "${path.join(ROOT, 'build', 'tailwind-input.css')}" -o "${outFile}" --minify`,
    { cwd: ROOT, stdio: 'inherit' }
  );
  let tw = fs.readFileSync(outFile, 'utf8');
  tw = tw.replace(/url\((['"]?)assets\//g, 'url($1../assets/');
  fs.writeFileSync(outFile, tw);
  log('Tailwind purgado → dist/css/tailwind.css');
}

function fixCssAssetPaths(css) {
  let out = css.replace(/url\((['"]?)assets\//g, 'url($1../assets/');
  for (const [orig, webp] of webpMap.entries()) {
    const re = new RegExp(orig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    out = out.replace(re, webp);
  }
  return out;
}

function minifyCss(css, label) {
  const result = new CleanCSS({ level: 2 }).minify(fixCssAssetPaths(css));
  if (result.errors.length) console.warn(`[build] Avisos CSS (${label}):`, result.errors);
  return result.styles;
}

async function minifyJsCode(code, label) {
  const result = await minifyJs(code, {
    compress: { passes: 2 },
    mangle: false,
    format: { comments: false },
  });
  if (result.error) throw result.error;
  return result.code;
}

function extractStyle(html) {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1].trim() : '';
}

function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = (m[1] || '').toLowerCase();
    const body = m[2].trim();
    if (attrs.includes('src=')) continue;
    if (attrs.includes('application/ld+json')) continue;
    if (attrs.includes('data-inline')) continue;
    if (!body) continue;
    if (body.includes('tailwind.config')) continue;
    if (body.includes('googletagmanager') || body.includes('GTM-')) continue;
    scripts.push(body);
  }
  return scripts.join('\n\n');
}

function removeTailwindCdn(html) {
  return html
    .replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/gi, '')
    .replace(/<script>\s*tailwind\.config\s*=[\s\S]*?<\/script>\s*/i, '');
}

function removeInlineStyle(html) {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>\s*/i, '');
}

function removeInlineAppScripts(html) {
  return html.replace(/<script(\s[^>]*)?>[\s\S]*?<\/script>/gi, (full, attrs) => {
    const a = (attrs || '').toLowerCase();
    if (a.includes('src=')) return full;
    if (a.includes('application/ld+json')) return full;
    if (a.includes('data-inline')) return full;
    if (full.includes('googletagmanager') || full.includes('GTM-')) return full;
    return '';
  });
}

function injectGtm(html) {
  let out = html;
  if (!/googletagmanager\.com\/gtm\.js/i.test(out)) {
    out = out.replace(/<head>/i, `<head>\n    ${GTM_HEAD}`);
  }
  if (!/googletagmanager\.com\/ns\.html/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i, `<body$1>\n    ${GTM_BODY}`);
  }
  return out;
}

function applySeoHead(html) {
  const canonical = `${CANONICAL_BASE}/`;
  let out = html;

  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${PAGE.title}</title>`);
  out = out.replace(
    /<meta name="description"[^>]*>/i,
    `<meta name="description" content="${PAGE.description}">`
  );

  if (!/<meta name="robots"/i.test(out)) {
    out = out.replace(
      /<meta name="description"[^>]*>/i,
      `$&\n    <meta name="robots" content="noindex, nofollow">`
    );
  }

  if (/<link rel="canonical"/i.test(out)) {
    out = out.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}">`);
  } else {
    out = out.replace(
      /<meta charset="UTF-8">/i,
      `$&\n    <link rel="canonical" href="${canonical}">`
    );
  }

  const ogTags = `
    <meta property="og:title" content="${PAGE.title}">
    <meta property="og:description" content="${PAGE.description}">
    <meta property="og:image" content="${PAGE.ogImage}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="pt_BR">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${PAGE.title}">
    <meta name="twitter:description" content="${PAGE.description}">
    <meta name="twitter:image" content="${PAGE.ogImage}">`;

  if (/<meta property="og:title"/i.test(out)) {
    out = out.replace(
      /<meta property="og:title"[\s\S]*?<meta property="og:type"[^>]*>/i,
      ogTags.trim()
    );
  } else {
    out = out.replace(/<\/head>/i, `    ${ogTags.trim()}\n</head>`);
  }

  const preconnects = `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="preconnect" href="https://unpkg.com" crossorigin>
    <link rel="preconnect" href="https://www.youtube.com" crossorigin>
    <link rel="preconnect" href="https://www.google.com" crossorigin>
    <link rel="preconnect" href="https://www.googletagmanager.com" crossorigin>
    <link rel="dns-prefetch" href="https://hook.us1.make.com">`;

  out = out.replace(/<link rel="preconnect"[^>]*>\s*/gi, '');
  out = out.replace(/<link rel="dns-prefetch"[^>]*>\s*/gi, '');
  out = out.replace(/<\/head>/i, `    ${preconnects.trim()}\n</head>`);

  return out;
}

function applyA11y(html) {
  const altMap = {
    'prof03.webp': 'Palestrante confirmado — Summit PTA',
    'prof04.webp': 'Palestrante — revelação em breve',
    'prof02.webp': 'Palestrante — revelação em breve',
    'prof01.webp': 'Palestrante — em breve',
    'prof05.webp': 'Palestrante — em breve',
  };
  let out = html;
  for (const [file, alt] of Object.entries(altMap)) {
    out = out.replace(
      new RegExp(`src="assets/${file.replace('.', '\\.')}" alt=""`, 'g'),
      `src="assets/${file}" alt="${alt}"`
    );
  }
  return out;
}

function replaceRasterWithWebp(html) {
  let out = html;
  for (const [orig, webp] of webpMap.entries()) {
    out = out.split(`assets/${orig}`).join(`assets/${webp}`);
  }
  return out;
}

function injectProductionAssets(html) {
  const cssLinks = `
    <link rel="stylesheet" href="css/tailwind.css">
    <link rel="stylesheet" href="css/main.css">`;

  const thirdPartyHead = `
    <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700;800&family=Oswald:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">`;

  let out = removeTailwindCdn(html);
  out = removeInlineStyle(out);
  out = removeInlineAppScripts(out);

  out = out.replace(/<link href="https:\/\/unpkg\.com\/aos[^>]*>\s*/i, '');
  out = out.replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/gi, '');
  out = out.replace(/<link rel="stylesheet" href="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome[^>]*>\s*/i, '');

  out = out.replace('</head>', `${cssLinks}\n${thirdPartyHead}\n</head>`);

  const bodyScripts = `
    <script src="https://www.youtube.com/iframe_api"></script>
    <script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
    <script src="js/main.js"></script>`;

  out = out.replace(/<script src="https:\/\/www\.youtube\.com\/iframe_api"><\/script>\s*/i, '');
  out = out.replace(/<script src="https:\/\/unpkg\.com\/aos[^>]*><\/script>\s*/i, '');

  out = out.replace('</body>', `${bodyScripts}\n</body>`);
  return out;
}

async function processPage() {
  const srcPath = path.join(ROOT, 'index.html');
  let html = fs.readFileSync(srcPath, 'utf8');

  const customCss = extractStyle(html);
  let customJs = extractInlineScripts(html);
  customJs = replaceRasterWithWebp(customJs);

  if (customCss) {
    fs.writeFileSync(path.join(DIST, 'css', 'main.css'), minifyCss(customCss, 'main.css'));
    log('CSS → dist/css/main.css');
  }

  if (customJs) {
    const minJs = await minifyJsCode(customJs, 'main.js');
    fs.writeFileSync(path.join(DIST, 'js', 'main.js'), minJs);
    log('JS → dist/js/main.js');
  }

  html = applySeoHead(html);
  html = replaceRasterWithWebp(html);
  html = applyA11y(html);
  html = injectProductionAssets(html);

  const minified = await minifyHtml(html, {
    collapseWhitespace: true,
    removeComments: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    minifyCSS: false,
    minifyJS: false,
    keepClosingSlash: true,
    caseSensitive: true,
  });

  fs.writeFileSync(path.join(DIST, 'index.html'), injectGtm(minified));
  log('HTML → dist/index.html');
}

function writeHtaccess() {
  const htaccess = `# Cache control — Obrigado PTA
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/html "access plus 0 seconds"
</IfModule>

<IfModule mod_headers.c>
    <FilesMatch "\\.html$">
        Header set Cache-Control "no-cache, must-revalidate"
        Header unset ETag
    </FilesMatch>
    <FilesMatch "\\.(jpg|jpeg|png|webp|svg|gif|ico|woff|woff2|ttf)$">
        Header set Cache-Control "public, max-age=604800, stale-while-revalidate=86400"
    </FilesMatch>
    <FilesMatch "\\.(css|js)$">
        Header set Cache-Control "public, max-age=86400, stale-while-revalidate=3600"
    </FilesMatch>
</IfModule>
`;
  fs.writeFileSync(path.join(DIST, '.htaccess'), htaccess);
  log('.htaccess → dist/.htaccess');
}

function printSummary() {
  const walk = (dir, prefix = '') => {
    const entries = fs.readdirSync(dir).sort();
    for (const e of entries) {
      const full = path.join(dir, e);
      const rel = prefix ? `${prefix}/${e}` : e;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else {
        const kb = Math.round(fs.statSync(full).size / 1024);
        console.log(`  ${rel} (${kb}KB)`);
      }
    }
  };
  log('Estrutura dist/:');
  walk(DIST);
}

async function main() {
  log('Limpando dist/...');
  rimraf(DIST);
  ensureDir(DIST);
  ensureDir(path.join(DIST, 'css'));
  ensureDir(path.join(DIST, 'js'));

  log('Otimizando assets...');
  await optimizeAssets();

  log('Gerando Tailwind purgado...');
  buildTailwind();

  await processPage();
  writeHtaccess();
  printSummary();

  log('Build concluído — dist/ pronta para deploy.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
