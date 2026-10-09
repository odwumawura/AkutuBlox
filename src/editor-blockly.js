// Blocks editor adapter for the current Blockly editor. Saved format = the project's block JSON.
import * as Blockly from 'blockly';

export function blocklyAdapter(ws, { hasEditorUi = false } = {}) {
  return {
    name: 'blockly',
    ws,
    getScripts() {
      return ws.getTopBlocks(true).map((block, i) => {
        const { x, y } = block.getRelativeToSurfaceXY();
        return { id: `s-${i + 1}`, x: Math.round(x), y: Math.round(y), blocks: [Blockly.serialization.blocks.save(block)] };
      });
    },
    setScripts(scripts) {
      ws.clear();
      for (const script of scripts || []) {
        for (const block of script.blocks) {
          Blockly.serialization.blocks.append({ ...block, x: script.x, y: script.y }, ws, { recordUndo: false });
        }
      }
    },
    onChange(cb) {
      ws.addChangeListener((e) => {
        if (e.isUiEvent || e.type === Blockly.Events.VIEWPORT_CHANGE) return;
        cb(e);
      });
    },
    resize() {
      Blockly.svgResize(ws);
    },
    quiet(fn) {
      Blockly.Events.disable();
      try {
        return fn();
      } finally {
        Blockly.Events.enable();
      }
    },
  };
}

export function injectBlockly(el, toolbox) {
  const ws = Blockly.inject(el, {
    toolbox,
    trashcan: true,
    renderer: 'geras',
    grid: { spacing: 20, length: 3, colour: '#dfe4ec', snap: true },
  });
  return blocklyAdapter(ws);
}
