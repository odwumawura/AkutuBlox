// Spike: scratch-blocks editor in isolation. Not wired into the app yet.
import * as ScratchBlocks from 'scratch-blocks';

const TOOLBOX = `
<xml>
  <category name="Events" id="events" colour="#FFBF00">
    <block type="event_whenflagclicked"/>
  </category>
  <category name="Motion" id="motion" colour="#4C97FF">
    <block type="motion_movesteps"><value name="STEPS"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>
    <block type="motion_turnright"><value name="DEGREES"><shadow type="math_number"><field name="NUM">15</field></shadow></value></block>
  </category>
  <category name="Control" id="control" colour="#FFAB19">
    <block type="control_repeat"><value name="TIMES"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block>
    <block type="control_wait"><value name="DURATION"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block>
  </category>
</xml>`;

// Scratch colours for the block categories (scratch-blocks looks up styles by category name).
const SCRATCH_COLOURS = {
  motion: '#4C97FF', looks: '#9966FF', sounds: '#CF63CF', event: '#FFBF00',
  control: '#FFAB19', sensing: '#5CB1D6', operators: '#59C059', data: '#FF8C1A',
  data_lists: '#FF661A', pen: '#0FBD8C', more: '#FF6680',
};
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v * f));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
const blockStyles = {};
for (const [name, hex] of Object.entries(SCRATCH_COLOURS)) {
  blockStyles[name] = { colourPrimary: hex, colourSecondary: shade(hex, 0.9), colourTertiary: shade(hex, 0.8) };
}
const ScratchTheme = new ScratchBlocks.Theme('scratch-spike', blockStyles, {}, {
  workspaceBackgroundColour: '#F9F9F9',
  toolboxBackgroundColour: '#FFFFFF',
  flyoutBackgroundColour: '#F9F9F9',
  scrollbarColour: '#CECDCE',
});

ScratchBlocks.ScratchMsgs?.setLocale?.('en');
ScratchBlocks.setLocale('en');
const ws = ScratchBlocks.inject(document.getElementById('sb'), {
  media: '/sb-media/',
  toolbox: TOOLBOX,
  zoom: { controls: true, startScale: 0.675 },
  theme: ScratchTheme,
});

const status = document.getElementById('status');
status.textContent = `scratch-blocks spike: editor loaded (${ws ? 'workspace ok' : 'no workspace'})`;
window.__sbWorkspace = ws;
window.__SB = ScratchBlocks;

