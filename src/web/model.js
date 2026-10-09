// Web mode model: converts between the GrapesJS canvas and our component format (schema/project.schema.json),
// renders pages to HTML/CSS, and compiles interactions to JavaScript. Pure functions except fromEditor/toEditor.

const STYLE_CSS = {
  padding: 'padding', margin: 'margin', color: 'color', background: 'background-color',
  fontSize: 'font-size', fontWeight: 'font-weight', textAlign: 'text-align',
  borderRadius: 'border-radius', width: 'width', height: 'height',
};
const TAGS = { section: 'section', container: 'div', heading: 'h', paragraph: 'p', button: 'button', link: 'a', list: 'ul' };
const LEVEL_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const px = (v) => (typeof v === 'number' ? `${v}px` : String(v));
const safeId = (s) => /^[a-zA-Z0-9_-]{1,64}$/.test(String(s || '')) ? String(s) : null;

// ---------- Editor -> component tree ----------

function textOf(comp) {
  return comp.components().map((c) => (c.get('type') === 'textnode' ? c.get('content') : textOf(c))).join('');
}

function treeFromComponent(comp) {
  const node = treeFromComponentInner(comp);
  const attrs = comp.getAttributes();
  if (attrs.hidden !== undefined) node.props = { ...node.props, hidden: true };
  return node;
}

function treeFromComponentInner(comp) {
  const attrs = comp.getAttributes();
  const id = safeId(attrs.id) || safeId(comp.getId()) || `n${Math.random().toString(36).slice(2, 8)}`;
  const tag = String(comp.get('tagName') || 'div').toLowerCase();
  const style = comp.getStyle() || {};
  const cleanStyle = {};
  for (const k of Object.keys(STYLE_CSS)) if (style[STYLE_CSS[k]] ?? style[k]) cleanStyle[k] = style[STYLE_CSS[k]] ?? style[k];
  const node = { id, type: 'container', props: {}, style: cleanStyle };

  const level = /^h([1-3])$/.exec(tag);
  if (level) {
    node.type = 'heading';
    node.props = { level: Number(level[1]), text: textOf(comp) };
    return node;
  }
  if (tag === 'p') return Object.assign(node, { type: 'paragraph', props: { text: textOf(comp) } });
  if (tag === 'button') return Object.assign(node, { type: 'button', props: { text: textOf(comp) } });
  if (tag === 'a') {
    const props = { text: textOf(comp) };
    if (attrs['data-page-id']) props.pageId = attrs['data-page-id'];
    else props.href = attrs.href && attrs.href !== '#' ? attrs.href : '';
    return Object.assign(node, { type: 'link', props });
  }
  if (tag === 'section') node.type = 'section';
  node.children = comp.components().filter((c) => c.get('type') !== 'textnode').map(treeFromComponent);
  return node;
}

// The page's root is a virtual section; its children are the top-level canvas components.
export function treeFromEditor(editor) {
  const top = editor.getWrapper().components().filter((c) => c.get('type') !== 'textnode');
  return { id: 'root', type: 'section', props: {}, style: {}, children: top.map(treeFromComponent) };
}

// ---------- Component tree -> editor JSON ----------

function editorJsonFor(node) {
  const style = {};
  for (const [k, v] of Object.entries(node.style || {})) if (STYLE_CSS[k]) style[STYLE_CSS[k]] = px(v);
  const attributes = { id: node.id };
  if (node.props?.hidden) attributes.hidden = '';
  const base = { attributes, style };
  switch (node.type) {
    case 'heading':
      return { ...base, tagName: LEVEL_TAGS[node.props.level] || 'h2', components: [{ type: 'textnode', content: node.props.text || '' }] };
    case 'paragraph':
      return { ...base, tagName: 'p', components: [{ type: 'textnode', content: node.props.text || '' }] };
    case 'button':
      return { ...base, tagName: 'button', components: [{ type: 'textnode', content: node.props.text || '' }] };
    case 'link': {
      const linkAttrs = { id: node.id, href: node.props.pageId ? '#' : node.props.href || '#' };
      if (node.props.pageId) linkAttrs['data-page-id'] = node.props.pageId;
      return { ...base, tagName: 'a', attributes: { ...linkAttrs, ...(node.props.hidden ? { hidden: '' } : {}) }, components: [{ type: 'textnode', content: node.props.text || '' }] };
    }
    case 'section':
      return { ...base, tagName: 'section', components: (node.children || []).map(editorJsonFor) };
    default:
      return { ...base, tagName: 'div', components: (node.children || []).map(editorJsonFor) };
  }
}

export function toEditor(editor, root) {
  editor.setComponents((root.children || []).map(editorJsonFor));
}

// ---------- Rendering ----------

function cssFor(node, out) {
  const decls = [];
  for (const [k, v] of Object.entries(node.style || {})) if (STYLE_CSS[k]) decls.push(`${STYLE_CSS[k]}: ${px(v)};`);
  if (decls.length) out.push(`#${node.id} { ${decls.join(' ')} }`);
  (node.children || []).forEach((c) => cssFor(c, out));
}

function htmlFor(node, pages) {
  const id = ` id="${esc(node.id)}"`;
  const kids = () => (node.children || []).map((c) => htmlFor(c, pages)).join('');
  const hidden = node.props?.hidden ? ' hidden' : '';
  switch (node.type) {
    case 'heading': {
      const t = LEVEL_TAGS[node.props.level] || 'h2';
      return `<${t}${id}${hidden}>${esc(node.props.text)}</${t}>`;
    }
    case 'paragraph':
      return `<p${id}${hidden}>${esc(node.props.text)}</p>`;
    case 'button':
      return `<button type="button"${id}${hidden}>${esc(node.props.text)}</button>`;
    case 'link': {
      const page = pages.find((p) => p.id === node.props.pageId);
      const href = page ? `${page.path}.html` : node.props.href || '#';
      return `<a${id} href="${esc(href)}"${hidden}>${esc(node.props.text)}</a>`;
    }
    case 'section':
      return `<section${id}${hidden}>${kids()}</section>`;
    case 'container':
    case 'columns':
      return `<div${id}${hidden}>${kids()}</div>`;
    default:
      return ''; // Components not yet implemented are skipped rather than exported broken.
  }
}

export function renderPage(page, pages, { site = true } = {}) {
  const css = [];
  page.root.children?.forEach((c) => cssFor(c, css));
  const body = (page.root.children || []).map((c) => htmlFor(c, pages)).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(page.title || page.name)}</title>
${site ? '<link rel="stylesheet" href="styles.css">' : `<style>${'[hidden]{display:none !important}\n' + css.join('\n')}</style>`}
</head>
<body data-page="${esc(page.id)}">
<main>
${body}
</main>
${site ? '<script src="script.js" defer></script>' : ''}
</body>
</html>
`;
}

export function renderStyles(theme) {
  const primary = theme?.primaryColor || '#0F766E';
  return `:root { --primary: ${primary}; }
[hidden] { display: none !important; }
body { margin: 0; font-family: Inter, Nunito, Poppins, system-ui, sans-serif; color: #1d2433; }
`;
}

// ---------- Interactions -> JavaScript ----------

const ACTION_JS = {
  show: (a) => `{ const x = document.getElementById(${JSON.stringify(a.params.targetId)}); if (x) x.hidden = false; }`,
  hide: (a) => `{ const x = document.getElementById(${JSON.stringify(a.params.targetId)}); if (x) x.hidden = true; }`,
  toggle: (a) => `{ const x = document.getElementById(${JSON.stringify(a.params.targetId)}); if (x) x.hidden = !x.hidden; }`,
  setText: (a) => `{ const x = document.getElementById(${JSON.stringify(a.params.targetId)}); if (x) x.textContent = ${JSON.stringify(String(a.params.text ?? ''))}; }`,
  goToPage: (a, pages) => {
    const p = pages.find((pg) => pg.id === a.params.pageId);
    return p ? `window.location.href = ${JSON.stringify(p.path + '.html')};` : '';
  },
  openLink: (a) => `window.open(${JSON.stringify(String(a.params.url || ''))}, '_blank', 'noopener');`,
  setTextColor: (a) => {
    const c = a.params.color;
    return /^#[0-9a-fA-F]{6}$/.test(c || '') ? `{ const x = document.getElementById(${JSON.stringify(a.params.targetId)}); if (x) x.style.color = ${JSON.stringify(c)}; }` : '';
  },
  setBackground: (a) => {
    const c = a.params.color;
    return /^#[0-9a-fA-F]{6}$/.test(c || '') ? `{ const x = document.getElementById(${JSON.stringify(a.params.targetId)}); if (x) x.style.backgroundColor = ${JSON.stringify(c)}; }` : '';
  },
};

function actionsJs(actions, pages) {
  return actions.map((a) => (ACTION_JS[a.type] ? ACTION_JS[a.type](a, pages) : `/* unsupported action: ${a.type} */`)).join('\n    ');
}

export function interactionsScript(pages) {
  const blocks = pages.map((page) => {
    const parts = (page.interactions || []).map((ix) => {
      const body = actionsJs(ix.actions, pages);
      if (ix.trigger.type === 'pageLoaded') return `    ${body}`;
      const events = { clicked: 'click', hovered: 'mouseenter', mouseLeft: 'mouseleave' };
      if (events[ix.trigger.type] && safeId(ix.targetId)) {
        return `    { const t = document.getElementById(${JSON.stringify(ix.targetId)}); if (t) t.addEventListener('${events[ix.trigger.type]}', function () { ${body} }); }`;
      }
      return `    /* unsupported trigger: ${ix.trigger.type} */`;
    });
    if (!parts.length) return '';
    return `  if (document.body.dataset.page === ${JSON.stringify(page.id)}) {\n${parts.join('\n')}\n  }`;
  });
  return `// Generated from blocks. Do not edit by hand.\ndocument.addEventListener('DOMContentLoaded', function () {\n${blocks.filter(Boolean).join('\n')}\n});\n`;
}

// ---------- Site export ----------

export function siteFiles(project) {
  const { pages, theme } = project.web;
  const files = {};
  for (const page of pages) files[`${page.path}.html`] = renderPage(page, pages);
  files['styles.css'] = renderStyles(theme) + pages.flatMap((p) => { const c = []; p.root.children?.forEach((n) => cssFor(n, c)); return c; }).join('\n') + '\n';
  files['script.js'] = interactionsScript(pages);
  return files;
}

export function previewHtml(page, pages) {
  return renderPage(page, pages, { site: false });
}
