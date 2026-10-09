// Sprites and backdrops for Blocks mode. Built-in assets only, so project files stay valid against the schema
// (asset sources must be "builtin:<name>" or "assets/<file>"). Uploads come later.

export const COSTUMES = {
  'builtin:cat': { label: 'Cat', color: '#f59e0b' },
  'builtin:dog': { label: 'Dog', color: '#92400e' },
  'builtin:star': { label: 'Star', color: '#facc15' },
};

export const BACKDROPS = {
  'builtin:meadow': { label: 'Meadow', color: '#e8f5e9' },
  'builtin:sky': { label: 'Sky', color: '#dbeafe' },
  'builtin:night': { label: 'Night', color: '#0f172a' },
  'builtin:plain': { label: 'Plain', color: '#ffffff' },
};

export const costumeColor = (source) => COSTUMES[source]?.color || '#9ca3af';
export const backdropColor = (source) => BACKDROPS[source]?.color || '#e8f5e9';

// A new sprite starts at the centre, facing up, with no scripts.
export function newSprite(index, costume = 'builtin:star') {
  const id = `sprite-${Date.now().toString(36)}-${index}`;
  const name = `${COSTUMES[costume]?.label || 'Sprite'} ${index}`;
  return {
    id,
    name,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    costumes: [{ id: `${id}-c`, name: COSTUMES[costume]?.label || 'Costume', type: 'vector', source: costume, rotationCenterX: 50, rotationCenterY: 50 }],
    currentCostume: 0,
    scripts: [],
  };
}

export const spriteCostume = (sprite) => sprite.costumes?.[sprite.currentCostume || 0]?.source || 'builtin:star';
