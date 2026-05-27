export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["logo-icon.svg","logo.svg","manifest.json","og-image.png","og-image.svg","robots.txt","screenshots/cost.png","screenshots/dashboard-home.png","screenshots/models.png","screenshots/overview.png","screenshots/pricing.png","screenshots/projects.png","screenshots/quotas.png","screenshots/session-detail.png","screenshots/sessions.png","screenshots/settings.png","screenshots/tokens.png","screenshots/tool-calls.png","sitemap.xml"]),
	mimeTypes: {".svg":"image/svg+xml",".json":"application/json",".png":"image/png",".txt":"text/plain",".xml":"text/xml"},
	_: {
		client: {"start":"_app/immutable/entry/start.SgD-IaD1.js","app":"_app/immutable/entry/app.WTqQFJ8A.js","imports":["_app/immutable/entry/start.SgD-IaD1.js","_app/immutable/chunks/entry.D6nKOufS.js","_app/immutable/chunks/scheduler.CRzCUlSA.js","_app/immutable/chunks/index.-2gVFq1h.js","_app/immutable/entry/app.WTqQFJ8A.js","_app/immutable/chunks/scheduler.CRzCUlSA.js","_app/immutable/chunks/index.BXd_S5Pc.js"],"stylesheets":[],"fonts":[],"uses_env_dynamic_public":false},
		nodes: [
			__memo(() => import('./nodes/0.js')),
			__memo(() => import('./nodes/1.js'))
		],
		routes: [
			
		],
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
