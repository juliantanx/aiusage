import * as universal from '../entries/pages/_layout.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+layout.js";
export const imports = ["_app/immutable/nodes/0.CtMQGjB0.js","_app/immutable/chunks/scheduler.CRzCUlSA.js","_app/immutable/chunks/index.BXd_S5Pc.js","_app/immutable/chunks/stores.Dpq44UO5.js","_app/immutable/chunks/entry.D6nKOufS.js","_app/immutable/chunks/index.-2gVFq1h.js","_app/immutable/chunks/lang.D_QClmZJ.js"];
export const stylesheets = ["_app/immutable/assets/0.OMJU7Xic.css"];
export const fonts = [];
