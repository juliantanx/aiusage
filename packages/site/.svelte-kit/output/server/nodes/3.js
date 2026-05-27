

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/docs/_page.svelte.js')).default;
export const imports = ["_app/immutable/nodes/3.X4A24U7I.js","_app/immutable/chunks/scheduler.CRzCUlSA.js","_app/immutable/chunks/index.BXd_S5Pc.js","_app/immutable/chunks/each.CZ1pnjD_.js","_app/immutable/chunks/lang.D_QClmZJ.js","_app/immutable/chunks/index.-2gVFq1h.js"];
export const stylesheets = ["_app/immutable/assets/3.CsFdTGsH.css"];
export const fonts = [];
