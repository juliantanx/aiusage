import * as universal from '../entries/pages/_layout.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+layout.js";
export const imports = ["_app/immutable/nodes/0.CBqwdF0h.js","_app/immutable/chunks/scheduler.CIQE85uB.js","_app/immutable/chunks/index.CZCqcyiN.js","_app/immutable/chunks/stores.Cq06nygv.js","_app/immutable/chunks/entry.BLk1neLm.js","_app/immutable/chunks/index.CypAiTRZ.js","_app/immutable/chunks/lang.B0EBr4NW.js"];
export const stylesheets = ["_app/immutable/assets/0.Coun3Zo_.css"];
export const fonts = [];
