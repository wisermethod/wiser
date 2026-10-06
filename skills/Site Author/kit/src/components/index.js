import ConversationPlayer from './ConversationPlayer.astro';

export { ConversationPlayer };
// A site's own components in src/custom/components/ join the kit's, each placed by its file name.
const custom = Object.fromEntries(Object.entries(import.meta.glob('../custom/components/*.astro', { eager: true })).map(([file, mod]) => [file.split('/').pop().replace(/\.astro$/, ''), mod.default]));
export const components = { ...custom, ConversationPlayer };
