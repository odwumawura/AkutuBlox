// Web mode model: converts between the GrapesJS canvas and our component format (schema/project.schema.json),
// renders pages to HTML/CSS, and compiles interactions to JavaScript. Pure functions except treeFromEditor/toEditor.

export const STYLE_CSS = {
  padding: 'padding', margin: 'margin', color: 'color', background: 'background-color',
  fontSize: 'font-size', fontWeight: 'font-weight', textAlign: 'text-align',
  borderRadius: 'border-radius', width: 'width', height: 'height',
};
const LEVEL_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3' };

// Style panel (B4): students choose from these presets only. No free-form CSS.
// Each value is checked again when a file is read or rendered (safeStyleValue).
export const STYLE_OPTIONS = {
  color: { label: 'Text colour', kind: 'colour' },
  background: { label: 'Background colour', kind: 'colour' },
  padding: { label: 'Padding', kind: 'select', options: [['0px', 'None'], ['8px', 'Small'], ['16px', 'Medium'], ['32px', 'Large']] },
  margin: { label: 'Margin', kind: 'select', options: [['0px', 'None'], ['8px', 'Small'], ['16px', 'Medium'], ['32px', 'Large']] },
  fontSize: { label: 'Font size', kind: 'select', options: [['14px', 'Small'], ['18px', 'Normal'], ['24px', 'Large'], ['32px', 'Extra large']] },
  fontWeight: { label: 'Font weight', kind: 'select', options: [['400', 'Normal'], ['700', 'Bold']] },
  textAlign: { label: 'Alignment', kind: 'select', options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']] },
  borderRadius: { label: 'Corner radius', kind: 'select', options: [['0px', 'Square'], ['6px', 'Soft'], ['16px', 'Round'], ['999px', 'Pill']] },
  width: { label: 'Width', kind: 'select', options: [['auto', 'Automatic'], ['50%', 'Half'], ['100%', 'Full'], ['300px', '300 px']] },
  height: { label: 'Height', kind: 'select', options: [['auto', 'Automatic'], ['120px', '120 px'], ['240px', '240 px']] },
};

// Components with a CSS class (the class does the layout; no inline styles, so the CSP holds).
const EXTRA_CLASSES = { columns: ['akutu-columns'], modal: ['akutu-modal'], youtube: ['akutu-video'], counter: ['akutu-counter'], timerDisplay: ['akutu-timer'] };
export const COMPONENT_CSS = `.akutu-columns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.akutu-modal { border: 1px solid #cbd5e1; border-radius: 12px; padding: 24px; background: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.2); }
.akutu-counter, .akutu-timer { font-weight: 700; font-variant-numeric: tabular-nums; }
.akutu-video { display: block; width: 100%; aspect-ratio: 16 / 9; border: 0; }
.akutu-video-note { display: flex; align-items: center; justify-content: center; aspect-ratio: 16 / 9; border: 2px dashed #94a3b8; border-radius: 8px; color: #475569; text-align: center; padding: 8px; }
textarea, select { font: inherit; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; }
@media (max-width: 600px) { .akutu-columns { grid-template-columns: 1fr; } .akutu-modal { padding: 16px; } }
`;

// A YouTube video ID is 11 letters, digits, - or _. Accepts a link or a bare ID; returns '' when there is none.
export function youtubeIdFrom(text) {
  const s = String(text || '').trim();
  const m = /(?:youtu\.be\/|[?&]v=|\/embed\/)([A-Za-z0-9_-]{11})/.exec(s) || /^([A-Za-z0-9_-]{11})$/.exec(s);
  return m ? m[1] : '';
}
const embedUrl = (id) => `https://www.youtube-nocookie.com/embed/${id}`;

const STYLE_VALUE_RULES = {
  color: /^#[0-9a-fA-F]{6}$/,
  background: /^#[0-9a-fA-F]{6}$/,
  textAlign: /^(left|center|right)$/,
  fontWeight: /^(400|700)$/,
};
const LENGTH_RULE = /^(auto|0|\d{1,4}(\.\d{1,2})?(px|%|rem|em))$/;

// Returns the value as a CSS string, or null when it is not one of the allowed forms.
export function safeStyleValue(key, value) {
  const v = typeof value === 'number' ? `${value}px` : String(value ?? '');
  const rule = STYLE_VALUE_RULES[key] || (STYLE_CSS[key] ? LENGTH_RULE : null);
  return rule && rule.test(v) ? v : null;
}
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
// Hidden elements carry this class on the canvas, so they stay visible and selectable there. Saved as props.hidden.
export const HIDDEN_CLASS = 'akutu-hidden';
const classNames = (comp) => (comp.getClasses?.() || []).map((c) => (typeof c === 'string' ? c : c.name ?? c.getName?.() ?? ''));
export function setComponentHidden(comp, hidden) {
  if (hidden) comp.addClass(HIDDEN_CLASS);
  else comp.removeClass(HIDDEN_CLASS);
}
export function isComponentHidden(comp) {
  return classNames(comp).includes(HIDDEN_CLASS);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const px = (v) => (typeof v === 'number' ? `${v}px` : String(v));
const safeId = (s) => /^[a-zA-Z0-9_-]{1,64}$/.test(String(s || '')) ? String(s) : null;
// Only http(s) links or plain relative paths. No javascript: or data: URLs.
const safeUrl = (s) => (/^https?:\/\/[^\s"'<>]+$/.test(String(s || '')) || /^[\w./-]+$/.test(String(s || '')) ? String(s) : '');

// ---------- Editor -> component tree ----------

function textOf(comp) {
  return comp.components().map((c) => (c.get('type') === 'textnode' ? c.get('content') : textOf(c))).join('');
}

function treeFromComponent(comp) {
  const node = treeFromComponentInner(comp);
  const attrs = comp.getAttributes();
  // Older files used the hidden attribute; both forms mean hidden.
  if (attrs.hidden !== undefined || isComponentHidden(comp)) node.props = { ...node.props, hidden: true };
  return node;
}

function treeFromComponentInner(comp) {
  const attrs = comp.getAttributes();
  const id = safeId(attrs.id) || safeId(comp.getId()) || `n${Math.random().toString(36).slice(2, 8)}`;
  const tag = String(comp.get('tagName') || 'div').toLowerCase();
  const style = comp.getStyle() || {};
  const cleanStyle = {};
  for (const k of Object.keys(STYLE_CSS)) {
    const v = safeStyleValue(k, style[STYLE_CSS[k]] ?? style[k]);
    if (v !== null) cleanStyle[k] = v;
  }
  const node = { id, type: 'container', props: {}, style: cleanStyle };

  const level = /^h([1-3])$/.exec(tag);
  if (level) return Object.assign(node, { type: 'heading', props: { level: Number(level[1]), text: textOf(comp) } });
  if (tag === 'p') return Object.assign(node, { type: 'paragraph', props: { text: textOf(comp) } });
  if (tag === 'button') {
    const props = { text: textOf(comp) };
    if (attrs.type === 'submit') props.submit = true;
    return Object.assign(node, { type: 'button', props });
  }
  if (tag === 'a') {
    const props = { text: textOf(comp) };
    if (attrs['data-page-id']) props.pageId = attrs['data-page-id'];
    else props.href = attrs.href && attrs.href !== '#' ? attrs.href : '';
    return Object.assign(node, { type: 'link', props });
  }
  if (tag === 'input' && attrs.type === 'checkbox') return Object.assign(node, { type: 'checkbox', props: { label: attrs['aria-label'] || '' } });
  if (tag === 'input') return Object.assign(node, { type: 'textInput', props: { placeholder: attrs.placeholder || '' } });
  if (tag === 'img') return Object.assign(node, { type: 'image', props: { src: attrs.src || '', alt: attrs.alt || '' } });
  if (tag === 'form') {
    node.type = 'form';
    node.children = comp.components().filter((c) => c.get('type') !== 'textnode').map(treeFromComponent);
    return node;
  }
  if (tag === 'span' && attrs['data-kind']) return Object.assign(node, { type: attrs['data-kind'] === 'timer' ? 'timerDisplay' : 'counter', props: { name: attrs['data-show'] || '' } });
  if (tag === 'textarea') return Object.assign(node, { type: 'textArea', props: { placeholder: attrs.placeholder || '' } });
  if (tag === 'select') return Object.assign(node, { type: 'dropdown', props: { options: comp.components().map((o) => textOf(o)) } });
  if (tag === 'ul') return Object.assign(node, { type: 'list', props: { items: comp.components().map((li) => textOf(li)) } });
  if (tag === 'iframe') return Object.assign(node, { type: 'youtube', props: { youtubeId: youtubeIdFrom(attrs['data-youtube-id']) } });
  if (tag === 'nav' || classNames(comp).includes(EXTRA_CLASSES.columns[0]) || classNames(comp).includes(EXTRA_CLASSES.modal[0]) || tag === 'div') {
    const cls = classNames(comp);
    if (tag === 'nav') node.type = 'navigation';
    else if (cls.includes(EXTRA_CLASSES.columns[0])) node.type = 'columns';
    else if (cls.includes(EXTRA_CLASSES.modal[0])) node.type = 'modal';
    node.children = comp.components().filter((c) => c.get('type') !== 'textnode').map(treeFromComponent);
    if (node.type !== 'container' || tag !== 'div') return node;
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
  for (const [k, v] of Object.entries(node.style || {})) {
    const ok = STYLE_CSS[k] ? safeStyleValue(k, v) : null;
    if (ok !== null) style[STYLE_CSS[k]] = ok;
  }
  const attributes = { id: node.id };
  const classes = [...(node.props?.hidden ? [HIDDEN_CLASS] : []), ...(EXTRA_CLASSES[node.type] || [])];
  const base = { attributes, style, classes };
  const text = [{ type: 'textnode', content: node.props?.text || '' }];
  switch (node.type) {
    case 'heading':
      return { ...base, tagName: LEVEL_TAGS[node.props.level] || 'h2', components: text };
    case 'paragraph':
      return { ...base, tagName: 'p', components: text };
    case 'button':
      if (node.props?.submit) attributes.type = 'submit';
      return { ...base, tagName: 'button', components: text };
    case 'link': {
      const linkAttrs = { id: node.id, href: node.props.pageId ? '#' : node.props.href || '#' };
      if (node.props.pageId) linkAttrs['data-page-id'] = node.props.pageId;
      return { ...base, tagName: 'a', attributes: linkAttrs, components: text };
    }
    case 'textInput':
      return { ...base, tagName: 'input', attributes: { ...attributes, type: 'text', placeholder: node.props?.placeholder || '' } };
    case 'checkbox':
      return { ...base, tagName: 'input', attributes: { ...attributes, type: 'checkbox', 'aria-label': node.props?.label || '' } };
    case 'image':
      return { ...base, tagName: 'img', attributes: { ...attributes, src: safeUrl(node.props?.src), alt: node.props?.alt || '' } };
    case 'form':
      return { ...base, tagName: 'form', components: (node.children || []).map(editorJsonFor) };
    case 'section':
      return { ...base, tagName: 'section', components: (node.children || []).map(editorJsonFor) };
    case 'counter':
    case 'timerDisplay':
      return { ...base, tagName: 'span', attributes: { ...attributes, 'data-kind': node.type === 'timerDisplay' ? 'timer' : 'counter', 'data-show': node.props?.name || '' }, components: [{ type: 'textnode', content: '0' }] };
    case 'textArea':
      return { ...base, tagName: 'textarea', attributes: { ...attributes, placeholder: node.props?.placeholder || '' }, components: [] };
    case 'dropdown':
      return { ...base, tagName: 'select', components: (node.props?.options || []).map((o) => ({ tagName: 'option', components: [{ type: 'textnode', content: String(o) }] })) };
    case 'list':
      return { ...base, tagName: 'ul', components: (node.props?.items || []).map((i) => ({ tagName: 'li', components: [{ type: 'textnode', content: String(i) }] })) };
    case 'navigation':
      return { ...base, tagName: 'nav', components: (node.children || []).map(editorJsonFor) };
    case 'columns':
      return { ...base, tagName: 'div', components: (node.children || []).map(editorJsonFor) };
    case 'modal':
      return { ...base, tagName: 'div', attributes: { ...attributes, role: 'dialog' }, components: (node.children || []).map(editorJsonFor) };
    case 'youtube': {
      const id = youtubeIdFrom(node.props?.youtubeId);
      return { ...base, tagName: 'iframe', attributes: { ...attributes, 'data-youtube-id': id, title: 'YouTube video' } }; // no src: the editor shows a placeholder, the Preview and the site show the video
    }
    default:
      return { ...base, tagName: 'div', components: (node.children || []).map(editorJsonFor) };
  }
}

export function toEditor(editor, root) {
  editor.setComponents((root.children || []).map(editorJsonFor));
}

// Palette entries for the canvas. Each adds one component with a fresh id (see main.js).
export const PALETTE = [
  { id: 'heading', label: 'Heading', content: { tagName: 'h2', components: [{ type: 'textnode', content: 'A heading' }] } },
  { id: 'paragraph', label: 'Paragraph', content: { tagName: 'p', components: [{ type: 'textnode', content: 'Some text.' }] } },
  { id: 'button', label: 'Button', content: { tagName: 'button', components: [{ type: 'textnode', content: 'Click me' }] } },
  { id: 'link', label: 'Link', content: { tagName: 'a', attributes: { href: '#' }, components: [{ type: 'textnode', content: 'A link' }] } },
  { id: 'section', label: 'Section', content: { tagName: 'section', components: [] } },
  { id: 'image', label: 'Image', content: { tagName: 'img', attributes: { src: '', alt: 'Picture' } } },
  { id: 'form', label: 'Form', content: { tagName: 'form', components: [] } },
  { id: 'textInput', label: 'Text input', content: { tagName: 'input', attributes: { type: 'text', placeholder: 'Type here' } } },
  { id: 'checkbox', label: 'Checkbox', content: { tagName: 'input', attributes: { type: 'checkbox', 'aria-label': 'Tick me' } } },
  { id: 'submit', label: 'Submit button', content: { tagName: 'button', attributes: { type: 'submit' }, components: [{ type: 'textnode', content: 'Send' }] } },
  { id: 'textArea', label: 'Text area', content: { tagName: 'textarea', attributes: { placeholder: 'Type a longer message' }, components: [] } },
  { id: 'dropdown', label: 'Dropdown', content: { tagName: 'select', components: [{ tagName: 'option', components: [{ type: 'textnode', content: 'Choice 1' }] }, { tagName: 'option', components: [{ type: 'textnode', content: 'Choice 2' }] }] } },
  { id: 'list', label: 'List', content: { tagName: 'ul', components: [{ tagName: 'li', components: [{ type: 'textnode', content: 'First item' }] }, { tagName: 'li', components: [{ type: 'textnode', content: 'Second item' }] }] } },
  { id: 'columns', label: 'Two columns', content: { tagName: 'div', classes: ['akutu-columns'], components: [{ tagName: 'p', components: [{ type: 'textnode', content: 'Left column' }] }, { tagName: 'p', components: [{ type: 'textnode', content: 'Right column' }] }] } },
  { id: 'navigation', label: 'Navigation', content: { tagName: 'nav', components: [{ tagName: 'a', attributes: { href: '#' }, components: [{ type: 'textnode', content: 'Home' }] }] } },
  { id: 'youtube', label: 'Video (YouTube)', content: { tagName: 'iframe', classes: ['akutu-video'], attributes: { 'data-youtube-id': '', title: 'YouTube video' } } },
  { id: 'counter', label: 'Counter', content: { tagName: 'span', classes: ['akutu-counter'], attributes: { 'data-kind': 'counter', 'data-show': '' }, components: [{ type: 'textnode', content: '0' }] } },
  { id: 'timerDisplay', label: 'Timer display', content: { tagName: 'span', classes: ['akutu-timer'], attributes: { 'data-kind': 'timer', 'data-show': '' }, components: [{ type: 'textnode', content: '0' }] } },
  { id: 'modal', label: 'Pop-up box', content: { tagName: 'div', classes: ['akutu-modal'], attributes: { role: 'dialog' }, components: [{ tagName: 'p', components: [{ type: 'textnode', content: 'Pop-up text' }] }] } },
];

// ---------- Rendering ----------

function cssFor(node, out) {
  const decls = [];
  for (const [k, v] of Object.entries(node.style || {})) {
    const ok = STYLE_CSS[k] ? safeStyleValue(k, v) : null;
    if (ok !== null) decls.push(`${STYLE_CSS[k]}: ${ok};`);
  }
  if (decls.length) out.push(`#${node.id} { ${decls.join(' ')} }`);
  (node.children || []).forEach((c) => cssFor(c, out));
}

function htmlFor(node, pages, site = true) {
  const id = ` id="${esc(node.id)}"`;
  const kids = () => (node.children || []).map((c) => htmlFor(c, pages, site)).join('');
  const hidden = node.props?.hidden ? ' hidden' : '';
  switch (node.type) {
    case 'heading': {
      const t = LEVEL_TAGS[node.props.level] || 'h2';
      return `<${t}${id}${hidden}>${esc(node.props.text)}</${t}>`;
    }
    case 'paragraph':
      return `<p${id}${hidden}>${esc(node.props.text)}</p>`;
    case 'button':
      return `<button type="${node.props?.submit ? 'submit' : 'button'}"${id}${hidden}>${esc(node.props.text)}</button>`;
    case 'link': {
      const page = pages.find((p) => p.id === node.props.pageId);
      const href = page ? pageFile(page) : node.props.href || '#';
      return `<a${id} href="${esc(href)}"${hidden}>${esc(node.props.text)}</a>`;
    }
    case 'textInput':
      return `<input${id} type="text" placeholder="${esc(node.props?.placeholder)}"${hidden}>`;
    case 'checkbox':
      return `<input${id} type="checkbox" aria-label="${esc(node.props?.label)}"${hidden}>`;
    case 'image':
      return `<img${id} src="${esc(safeUrl(node.props?.src))}" alt="${esc(node.props?.alt)}"${hidden}>`;
    case 'form':
      return `<form${id}${hidden}>${kids()}</form>`;
    case 'section':
      return `<section${id}${hidden}>${kids()}</section>`;
    case 'container':
      return `<div${id}${hidden}>${kids()}</div>`;
    case 'columns':
      return `<div${id} class="akutu-columns"${hidden}>${kids()}</div>`;
    case 'modal':
      return `<div${id} class="akutu-modal" role="dialog" aria-modal="true"${hidden}>${kids()}</div>`;
    case 'navigation':
      return `<nav${id}${hidden}>${kids()}</nav>`;
    case 'counter':
    case 'timerDisplay': {
      const timer = node.type === 'timerDisplay';
      const name = VAR_NAME.test(node.props?.name || '') ? node.props.name : '';
      const show = name ? ` data-show="${esc(name)}"${timer ? ' data-suffix=" s"' : ''}` : '';
      return `<span${id} class="${timer ? 'akutu-timer' : 'akutu-counter'}"${show}${hidden}>${timer ? '0 s' : '0'}</span>`;
    }
    case 'textArea':
      return `<textarea${id}${hidden} placeholder="${esc(node.props?.placeholder)}"></textarea>`;
    case 'dropdown':
      return `<select${id}${hidden}>${(node.props?.options || []).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`;
    case 'list':
      return `<ul${id}${hidden}>${(node.props?.items || []).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
    case 'youtube': {
      const yid = youtubeIdFrom(node.props?.youtubeId);
      if (!yid) return '';
      // The Preview runs in a sandbox with no network, so it shows a placeholder; the exported site plays the video.
      if (!site) return `<div${id} class="akutu-video-note"${hidden}>Video ${esc(yid)} (plays on the exported site)</div>`;
      return `<iframe${id} class="akutu-video" src="${embedUrl(yid)}" title="YouTube video" loading="lazy" allowfullscreen${hidden}></iframe>`;
    }
    default:
      return ''; // Components not yet implemented are skipped rather than exported broken.
  }
}

// Exported sites load only their own files. Images may come from https or be uploaded as data: URLs.
export const SITE_CSP = "default-src 'self'; img-src 'self' https: data:; style-src 'self'; script-src 'self'; object-src 'none'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'self'";

// The file a page is written to. The home page is always index.html.
export function pageFile(page) {
  return page.isHome ? 'index.html' : `${page.path}.html`;
}

export function renderPage(page, pages, { site = true, script = '' } = {}) {
  const css = [COMPONENT_CSS];
  page.root.children?.forEach((c) => cssFor(c, css));
  const body = (page.root.children || []).map((c) => htmlFor(c, pages, site)).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${site ? `<meta http-equiv="Content-Security-Policy" content="${SITE_CSP}">` : ''}
<title>${esc(page.title || page.name)}</title>
${site ? '<link rel="stylesheet" href="styles.css">' : `<style>${'[hidden]{display:none !important}\n' + css.join('\n')}</style>`}
</head>
<body data-page="${esc(page.id)}">
<main>
${body}
</main>
${site ? '<script src="script.js" defer></script>' : script ? `<script>\n${script}</script>` : ''}
</body>
</html>
`;
}

export function renderStyles(theme) {
  const primary = theme?.primaryColor || '#0F766E';
  return `:root { --primary: ${primary}; }
[hidden] { display: none !important; }
body { margin: 0; font-family: Inter, Nunito, Poppins, system-ui, sans-serif; color: #1d2433; }
${COMPONENT_CSS}`;
}

// ---------- Interactions -> JavaScript ----------

const COLOR_OK = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const el = (id) => `document.getElementById(${JSON.stringify(id)})`;
const num = (v) => Number(v) || 0;

// Each action compiles to statements. Handlers are async, so "wait" can pause a sequence.
// Code for a yes-or-no tree. Unknown or empty parts are false, so a half-built condition does nothing.
function condJs(c) {
  if (!c) return 'false';
  switch (c.kind) {
    case 'compare': return VAR_NAME.test(c.name || '') ? `cmp(vars[${JSON.stringify(c.name)}], ${JSON.stringify(String(c.op || 'equals'))}, ${JSON.stringify(String(c.value ?? ''))})` : 'false';
    case 'checked': return safeId(c.targetId) ? `(function () { const x = ${el(c.targetId)}; return !!(x && x.checked); })()` : 'false';
    case 'not': return `!(${condJs(c.item)})`;
    case 'and': return `(${condJs(c.items?.[0])} && ${condJs(c.items?.[1])})`;
    case 'or': return `(${condJs(c.items?.[0])} || ${condJs(c.items?.[1])})`;
    default: return 'false';
  }
}

const ACTION_JS = {
  show: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.hidden = false; }`,
  hide: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.hidden = true; }`,
  toggle: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.hidden = !x.hidden; }`,
  setText: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.textContent = ${JSON.stringify(String(a.params.text ?? ''))}; }`,
  setTextColor: (a) => (COLOR_OK(a.params.color) ? `{ const x = ${el(a.params.targetId)}; if (x) x.style.color = ${JSON.stringify(a.params.color)}; }` : ''),
  setBackground: (a) => (COLOR_OK(a.params.color) ? `{ const x = ${el(a.params.targetId)}; if (x) x.style.backgroundColor = ${JSON.stringify(a.params.color)}; }` : ''),
  goToPage: (a, pages) => {
    const p = pages.find((pg) => pg.id === a.params.pageId);
    return p ? `window.location.href = ${JSON.stringify(pageFile(p))};` : '';
  },
  openLink: (a) => (safeUrl(a.params.url) && /^https?:/.test(a.params.url) ? `window.open(${JSON.stringify(a.params.url)}, '_blank', 'noopener');` : ''),
  fadeIn: (a) => `{ const x = ${el(a.params.targetId)}; if (x) { x.style.transition = 'opacity 0.4s'; x.style.opacity = '0'; x.hidden = false; x.offsetHeight; x.style.opacity = '1'; await sleep(400); } }`,
  fadeOut: (a) => `{ const x = ${el(a.params.targetId)}; if (x) { x.style.transition = 'opacity 0.4s'; x.style.opacity = '1'; x.style.opacity = '0'; await sleep(400); x.hidden = true; x.style.opacity = ''; x.style.transition = ''; } }`,
  move: (a) => `{ const x = ${el(a.params.targetId)}; if (x) { x.dataset.ox = String(num(x.dataset.ox) + ${num(a.params.dx)}); x.dataset.oy = String(num(x.dataset.oy) + ${num(a.params.dy)}); x.style.transition = 'transform 0.4s'; x.style.transform = 'translate(' + x.dataset.ox + 'px, ' + x.dataset.oy + 'px)'; await sleep(400); } }`,
  setImage: (a) => (safeUrl(a.params.url) ? `{ const x = ${el(a.params.targetId)}; if (x) x.src = ${JSON.stringify(a.params.url)}; }` : ''),
  playSound: (a) => (/^https?:\/\//.test(a.params.url || '') && safeUrl(a.params.url) ? `new Audio(${JSON.stringify(a.params.url)}).play().catch(function () {});` : ''),
  setVariable: (a) => (VAR_NAME.test(a.params.name || '') ? `setVar(${JSON.stringify(a.params.name)}, ${JSON.stringify(a.params.value ?? '')});` : ''),
  changeVariable: (a) => (VAR_NAME.test(a.params.name || '') ? `setVar(${JSON.stringify(a.params.name)}, (Number(vars[${JSON.stringify(a.params.name)}]) || 0) + ${num(a.params.by)});` : ''),
  showVariable: (a) => (VAR_NAME.test(a.params.name || '') ? `{ const x = ${el(a.params.targetId)}; if (x) x.textContent = String(vars[${JSON.stringify(a.params.name)}]); }` : ''),
  readField: (a) => (VAR_NAME.test(a.params.name || '') ? `{ const x = ${el(a.params.targetId)}; if (x) setVar(${JSON.stringify(a.params.name)}, x.value); }` : ''),
  wait: (a) => `await sleep(${Math.max(0, num(a.params.seconds))} * 1000);`,
  if: (a, pages) => (VAR_NAME.test(a.params.name || '')
    ? `if (cmp(vars[${JSON.stringify(a.params.name)}], ${JSON.stringify(String(a.params.op || 'equals'))}, ${JSON.stringify(String(a.params.value ?? ''))})) {\n      ${actionsJs(a.params.then || [], pages)}\n    } else {\n      ${actionsJs(a.params.else || [], pages)}\n    }`
    : ''),
  ifcond: (a, pages) => `if (${condJs(a.params.cond)}) {\n      ${actionsJs(a.params.then || [], pages)}\n    } else {\n      ${actionsJs(a.params.else || [], pages)}\n    }`,
  startTimer: (a) => (VAR_NAME.test(a.params.name || '') ? `startTimer(${JSON.stringify(a.params.name)});` : ''),
  stopTimer: (a) => (VAR_NAME.test(a.params.name || '') ? `stopTimer(${JSON.stringify(a.params.name)});` : ''),
  resetTimer: (a) => (VAR_NAME.test(a.params.name || '') ? `resetTimer(${JSON.stringify(a.params.name)});` : ''),
  clearForm: (a) => `{ const x = ${el(a.params.targetId)}; if (x && x.reset) x.reset(); }`,
  showValidation: (a) => `{ const x = ${el(a.params.targetId)}; if (x) { x.setCustomValidity(${JSON.stringify(String(a.params.message ?? ''))}); x.reportValidity(); x.addEventListener('input', function clear() { x.setCustomValidity(''); x.removeEventListener('input', clear); }); } }`,
};

function actionsJs(actions, pages) {
  return actions.map((a) => (ACTION_JS[a.type] ? ACTION_JS[a.type](a, pages) : `/* unsupported action: ${a.type} */`)).join('\n      ');
}

// Element events. Form submits are always stopped, because the exported site has no server.
const EVENTS = {
  clicked: { on: 'click' },
  hovered: { on: 'mouseenter' },
  mouseLeft: { on: 'mouseleave' },
  formSubmitted: { on: 'submit', pre: 'e.preventDefault();' },
  textChanged: { on: 'input' },
  checkboxChecked: { on: 'change', pre: 'if (!this.checked) return;' },
};

function triggerJs(ix, body, pages) {
  const type = ix.trigger.type;
  const params = ix.trigger.params || {};
  if (type === 'pageLoaded') return `(async function () {\n      ${body}\n    })();`;
  if (type === 'pageVisited') {
    if (!safeId(params.pageId)) return '';
    return `if (before.indexOf(${JSON.stringify(params.pageId)}) !== -1) { (async function () {\n      ${body}\n    })(); }`;
  }
  if (type === 'timerReached') return `setTimeout(async function () {\n      ${body}\n    }, ${Math.max(0, num(params.seconds))} * 1000);`;
  if (type === 'variableEquals') {
    if (!VAR_NAME.test(params.name || '')) return '';
    return `watchers.push({ name: ${JSON.stringify(params.name)}, value: ${JSON.stringify(String(params.value ?? ''))}, run: async function () {\n      ${body}\n    } });`;
  }
  const ev = EVENTS[type];
  if (ev && safeId(ix.targetId)) {
    return `{ const t = ${el(ix.targetId)}; if (t) t.addEventListener('${ev.on}', async function (e) { ${ev.pre || ''} ${body} }); }`;
  }
  return `/* unsupported trigger: ${type} */`;
}

export function interactionsScript(pages, variables = []) {
  const blocks = pages.map((page) => {
    const parts = (page.interactions || []).map((ix) => triggerJs(ix, actionsJs(ix.actions, pages), pages)).filter(Boolean);
    if (!parts.length) return '';
    return `  if (document.body.dataset.page === ${JSON.stringify(page.id)}) {\n    ${parts.join('\n    ')}\n  }`;
  });
  const init = variables.filter((v) => VAR_NAME.test(v.name || '')).map((v) => `vars[${JSON.stringify(v.name)}] = ${JSON.stringify(v.value ?? '')};`);
  return [
    '// Generated from blocks. Do not edit by hand.',
    'const vars = {};',
    init.join('\n'),
    'const watchers = [];',
    'const sleep = function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); };',
    'const num = function (v) { return Number(v) || 0; };',
    'function cmp(a, op, b) {',
    '  const x = String(a), y = String(b);',
    '  const nx = Number(x), ny = Number(y);',
    "  const numeric = x !== '' && y !== '' && !isNaN(nx) && !isNaN(ny);",
    '  const l = numeric ? nx : x, r = numeric ? ny : y;',
    '  switch (op) {',
    "    case 'equals': return l === r;",
    "    case 'notEquals': return l !== r;",
    "    case 'less': return l < r;",
    "    case 'greater': return l > r;",
    "    case 'lessOrEqual': return l <= r;",
    "    case 'greaterOrEqual': return l >= r;",
    '    default: return false;',
    '  }',
    '}',
    'const timers = {};',
    'function startTimer(n) { if (timers[n]) return; timers[n] = setInterval(function () { setVar(n, num(vars[n]) + 1); }, 1000); }',
    'function stopTimer(n) { clearInterval(timers[n]); delete timers[n]; }',
    'function resetTimer(n) { stopTimer(n); setVar(n, 0); }',
    "function visitsBefore() { try { return JSON.parse(sessionStorage.getItem('akutu-visits') || '[]'); } catch (e) { return []; } }",
    "function recordVisit(id) { try { const v = visitsBefore(); if (v.indexOf(id) === -1) v.push(id); sessionStorage.setItem('akutu-visits', JSON.stringify(v)); } catch (e) {} }",
    'function showVars(name) { document.querySelectorAll("[data-show]").forEach(function (e) { if (!name || e.dataset.show === name) e.textContent = String(vars[e.dataset.show] ?? 0) + (e.dataset.suffix || ""); }); }',
    'function setVar(name, value) {',
    '  vars[name] = value;',
    '  showVars(name);',
    '  watchers.forEach(function (w) { if (w.name === name && String(value) === w.value) w.run(); });',
    '}',
    "document.addEventListener('DOMContentLoaded', function () {",
    "  showVars(null);",
    "  const before = visitsBefore();",
    "  recordVisit(document.body.dataset.page);",
    blocks.filter(Boolean).join('\n'),
    '});',
    '',
  ].join('\n');
}

// ---------- Site export ----------

export function siteFiles(project) {
  const { pages, theme, variables } = project.web;
  const files = {};
  for (const page of pages) files[pageFile(page)] = renderPage(page, pages);
  files['styles.css'] = renderStyles(theme) + pages.flatMap((p) => { const c = []; p.root.children?.forEach((n) => cssFor(n, c)); return c; }).join('\n') + '\n';
  files['script.js'] = interactionsScript(pages, variables || []);
  return files;
}

// The preview runs the same interactions as the exported site, inline.
export function previewHtml(page, pages, variables = []) {
  return renderPage(page, pages, { site: false, script: interactionsScript(pages, variables) });
}
