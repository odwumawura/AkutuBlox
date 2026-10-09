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

ScratchBlocks.ScratchMsgs?.setLocale?.('en');
ScratchBlocks.setLocale('en');
const ws = ScratchBlocks.inject(document.getElementById('sb'), {
  media: '/sb-media/',
  toolbox: TOOLBOX,
  zoom: { controls: true, startScale: 0.675 },
  theme: ScratchBlocks.ScratchBlocksTheme,
});

const status = document.getElementById('status');
status.textContent = `scratch-blocks spike: editor loaded (${ws ? 'workspace ok' : 'no workspace'})`;
window.__sbWorkspace = ws;

