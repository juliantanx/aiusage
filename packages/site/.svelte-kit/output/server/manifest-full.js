export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["manifest.json","og-image.png","og-image.svg","robots.txt","sitemap.xml"]),
	mimeTypes: {".json":"application/json",".png":"image/png",".svg":"image/svg+xml",".txt":"text/plain",".xml":"text/xml"},
	_: {
		client: {"start":"_app/immutable/entry/start.CBpXdlfr.js","app":"_app/immutable/entry/app.DJ4rLXhk.js","imports":["_app/immutable/entry/start.CBpXdlfr.js","_app/immutable/chunks/entry.BLk1neLm.js","_app/immutable/chunks/scheduler.CIQE85uB.js","_app/immutable/chunks/index.CypAiTRZ.js","_app/immutable/entry/app.DJ4rLXhk.js","_app/immutable/chunks/scheduler.CIQE85uB.js","_app/immutable/chunks/index.CZCqcyiN.js"],"stylesheets":[],"fonts":[],"uses_env_dynamic_public":false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js')),
			__memo(() => import('./nodes/2.js')),
			__memo(() => import('./nodes/3.js'))
		],
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/docs",
				pattern: /^\/docs\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			}
		],
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
