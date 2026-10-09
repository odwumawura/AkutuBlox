// Web mode model: converts between the GrapesJS canvas and our component format (schema/project.schema.json),
// renders pages to HTML/CSS, and compiles interactions to JavaScript. Pure functions except treeFromEditor/toEditor.

const STYLE_CSS = {
  padding: 'padding', margin: 'margin', color: 'color', background: 'background-color',
  fontSize: 'font-size', fontWeight: 'font-weight', textAlign: 'text-align',
  borderRadius: 'border-radius', width: 'width', height: 'height',
};
const LEVEL_TAGS = { 1: 'h1', 2: 'h2', 3: 'h3' };
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

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
      return { ...base, tagName: 'a', attributes: { ...linkAttrs, ...(node.props.hidden ? { hidden: '' } : {}) }, components: text };
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
];

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
      return `<button type="${node.props?.submit ? 'submit' : 'button'}"${id}${hidden}>${esc(node.props.text)}</button>`;
    case 'link': {
      const page = pages.find((p) => p.id === node.props.pageId);
      const href = page ? `${page.path}.html` : node.props.href || '#';
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
    case 'columns':
      return `<div${id}${hidden}>${kids()}</div>`;
    default:
      return ''; // Components not yet implemented are skipped rather than exported broken.
  }
}

export function renderPage(page, pages, { site = true, script = '' } = {}) {
  const css = [];
  page.root.children?.forEach((c) => cssFor(c, css));
  const body = (page.root.children || []).map((c) => htmlFor(c, pages)).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(page.title || page.name)}</title>
${site ? '<link rel="stylesheet" href="styles.css">' : `<style>${'[hidden]{display:none !important}\\n' + css.join('\\n')}</style>`}
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
`;
}

// ---------- Interactions -> JavaScript ----------

const COLOR_OK = (c) => /^#[0-9a-fA-F]{6}$/.test(c || '');
const el = (id) => `document.getElementById(${JSON.stringify(id)})`;
const num = (v) => Number(v) || 0;

// Each action compiles to statements. Handlers are async, so "wait" can pause a sequence.
const ACTION_JS = {
  show: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.hidden = false; }`,
  hide: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.hidden = true; }`,
  toggle: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.hidden = !x.hidden; }`,
  setText: (a) => `{ const x = ${el(a.params.targetId)}; if (x) x.textContent = ${JSON.stringify(String(a.params.text ?? ''))}; }`,
  setTextColor: (a) => (COLOR_OK(a.params.color) ? `{ const x = ${el(a.params.targetId)}; if (x) x.style.color = ${JSON.stringify(a.params.color)}; }` : ''),
  setBackground: (a) => (COLOR_OK(a.params.color) ? `{ const x = ${el(a.params.targetId)}; if (x) x.style.backgroundColor = ${JSON.stringify(a.params.color)}; }` : ''),
  goToPage: (a, pages) => {
    const p = pages.find((pg) => pg.id === a.params.pageId);
    return p ? `window.location.href = ${JSON.stringify(p.path + '.html')};` : '';
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
    'function setVar(name, value) {',
    '  vars[name] = value;',
    '  watchers.forEach(function (w) { if (w.name === name && String(value) === w.value) w.run(); });',
    '}',
    "document.addEventListener('DOMContentLoaded', function () {",
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
  for (const page of pages) files[`${page.path}.html`] = renderPage(page, pages);
  files['styles.css'] = renderStyles(theme) + pages.flatMap((p) => { const c = []; p.root.children?.forEach((n) => cssFor(n, c)); return c; }).join('\n') + '\n';
  files['script.js'] = interactionsScript(pages, variables || []);
  return files;
}

// The preview runs the same interactions as the exported site, inline.
export function previewHtml(page, pages, variables = []) {
  return renderPage(page, pages, { site: false, script: interactionsScript(pages, variables) });
}
