# Project file format v0.1

- One file per project. Each project is in one mode: `blocks` or `web`. Switching mode means opening or creating another project, with a save prompt first.
- Schema: `schema/project.schema.json` (JSON Schema 2020-12). Examples: `schema/example-blocks.json`, `schema/example-web.json`.
- All assets are referenced by relative paths inside the project bundle (`assets/...`). Projects never reference external URLs, so they work offline.
- Blockly scripts are stored as Blockly's own serialization. The file format treats them as opaque; the block engine validates them.
- Web styles come from a fixed set of properties. No free-form CSS.
- `schemaVersion` must match on open. Future versions add migrations rather than breaking old files.

## Save file
Projects save as a `.akutu` file (JSON). Export creates a separate deliverable: a zip for web projects and a standalone HTML page for blocks projects.
