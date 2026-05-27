
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * Environment variables [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env`. Like [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), this module cannot be imported into client-side code. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * _Unlike_ [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), the values exported from this module are statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * ```ts
 * import { API_KEY } from '$env/static/private';
 * ```
 * 
 * Note that all environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * 
 * ```
 * MY_FEATURE_FLAG=""
 * ```
 * 
 * You can override `.env` values from the command line like so:
 * 
 * ```bash
 * MY_FEATURE_FLAG="enabled" npm run dev
 * ```
 */
declare module '$env/static/private' {
	export const NVM_INC: string;
	export const WEBIDE_VM_OPTIONS: string;
	export const PYCHARM_VM_OPTIONS: string;
	export const LDFLAGS: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const TERM_PROGRAM: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const NODE: string;
	export const NVM_CD_FLAGS: string;
	export const INIT_CWD: string;
	export const SHELL: string;
	export const JETBRAINSCLIENT_VM_OPTIONS: string;
	export const TERM: string;
	export const HOMEBREW_API_DOMAIN: string;
	export const HOMEBREW_BOTTLE_DOMAIN: string;
	export const TMPDIR: string;
	export const HOMEBREW_REPOSITORY: string;
	export const CPPFLAGS: string;
	export const ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: string;
	export const npm_config_global_prefix: string;
	export const TERM_PROGRAM_VERSION: string;
	export const VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
	export const FPATH: string;
	export const MallocNanoZone: string;
	export const ZDOTDIR: string;
	export const COLOR: string;
	export const npm_config_home: string;
	export const npm_config_noproxy: string;
	export const npm_config_local_prefix: string;
	export const GIT_EDITOR: string;
	export const USER: string;
	export const NVM_DIR: string;
	export const COMMAND_MODE: string;
	export const npm_config_globalconfig: string;
	export const ENABLE_TOOL_SEARCH: string;
	export const SSH_AUTH_SOCK: string;
	export const PHPSTORM_VM_OPTIONS: string;
	export const CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const VSCODE_PROFILE_INITIALIZED: string;
	export const GOLAND_VM_OPTIONS: string;
	export const HOMEBREW_PIP_INDEX_URL: string;
	export const npm_execpath: string;
	export const ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
	export const PATH: string;
	export const DEVECOSTUDIO_VM_OPTIONS: string;
	export const RUSTROVER_VM_OPTIONS: string;
	export const npm_package_json: string;
	export const __CFBundleIdentifier: string;
	export const USER_ZDOTDIR: string;
	export const npm_config_init_module: string;
	export const npm_config_userconfig: string;
	export const PWD: string;
	export const npm_command: string;
	export const ANTHROPIC_MODEL: string;
	export const SENTRY_DSN_ADMIN: string;
	export const OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
	export const EDITOR: string;
	export const npm_lifecycle_event: string;
	export const CLION_VM_OPTIONS: string;
	export const IDEA_VM_OPTIONS: string;
	export const LANG: string;
	export const npm_package_name: string;
	export const NODE_PATH: string;
	export const XPC_FLAGS: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const npm_config_npm_version: string;
	export const WEBSTORM_VM_OPTIONS: string;
	export const DATASPELL_VM_OPTIONS: string;
	export const ANTHROPIC_DEFAULT_OPUS_MODEL: string;
	export const npm_config_node_gyp: string;
	export const XPC_SERVICE_NAME: string;
	export const AQUA_VM_OPTIONS: string;
	export const npm_package_version: string;
	export const VSCODE_INJECTION: string;
	export const HOME: string;
	export const STUDIO_VM_OPTIONS: string;
	export const SHLVL: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const ANTHROPIC_BASE_URL: string;
	export const HOMEBREW_PREFIX: string;
	export const LOGNAME: string;
	export const ANTHROPIC_AUTH_TOKEN: string;
	export const npm_config_cache: string;
	export const ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: string;
	export const npm_lifecycle_script: string;
	export const GATEWAY_VM_OPTIONS: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const DATAGRIP_VM_OPTIONS: string;
	export const NVM_BIN: string;
	export const PKG_CONFIG_PATH: string;
	export const npm_config_user_agent: string;
	export const HOMEBREW_CELLAR: string;
	export const INFOPATH: string;
	export const GIT_ASKPASS: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const DISABLE_AUTOUPDATER: string;
	export const OSLogRateLimit: string;
	export const JETBRAINS_CLIENT_VM_OPTIONS: string;
	export const RIDER_VM_OPTIONS: string;
	export const RUBYMINE_VM_OPTIONS: string;
	export const CLAUDECODE: string;
	export const ANTHROPIC_DEFAULT_SONNET_MODEL: string;
	export const COLORTERM: string;
	export const npm_config_prefix: string;
	export const npm_node_execpath: string;
	export const NODE_ENV: string;
}

/**
 * Similar to [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private), except that it only includes environment variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Values are replaced statically at build time.
 * 
 * ```ts
 * import { PUBLIC_BASE_URL } from '$env/static/public';
 * ```
 */
declare module '$env/static/public' {
	
}

/**
 * This module provides access to runtime environment variables, as defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`. This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured).
 * 
 * This module cannot be imported into client-side code.
 * 
 * Dynamic environment variables cannot be used during prerendering.
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * console.log(env.DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 * 
 * > In `dev`, `$env/dynamic` always includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 */
declare module '$env/dynamic/private' {
	export const env: {
		NVM_INC: string;
		WEBIDE_VM_OPTIONS: string;
		PYCHARM_VM_OPTIONS: string;
		LDFLAGS: string;
		NoDefaultCurrentDirectoryInExePath: string;
		TERM_PROGRAM: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		NODE: string;
		NVM_CD_FLAGS: string;
		INIT_CWD: string;
		SHELL: string;
		JETBRAINSCLIENT_VM_OPTIONS: string;
		TERM: string;
		HOMEBREW_API_DOMAIN: string;
		HOMEBREW_BOTTLE_DOMAIN: string;
		TMPDIR: string;
		HOMEBREW_REPOSITORY: string;
		CPPFLAGS: string;
		ANTHROPIC_DEFAULT_OPUS_MODEL_NAME: string;
		npm_config_global_prefix: string;
		TERM_PROGRAM_VERSION: string;
		VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
		FPATH: string;
		MallocNanoZone: string;
		ZDOTDIR: string;
		COLOR: string;
		npm_config_home: string;
		npm_config_noproxy: string;
		npm_config_local_prefix: string;
		GIT_EDITOR: string;
		USER: string;
		NVM_DIR: string;
		COMMAND_MODE: string;
		npm_config_globalconfig: string;
		ENABLE_TOOL_SEARCH: string;
		SSH_AUTH_SOCK: string;
		PHPSTORM_VM_OPTIONS: string;
		CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: string;
		__CF_USER_TEXT_ENCODING: string;
		VSCODE_PROFILE_INITIALIZED: string;
		GOLAND_VM_OPTIONS: string;
		HOMEBREW_PIP_INDEX_URL: string;
		npm_execpath: string;
		ANTHROPIC_DEFAULT_HAIKU_MODEL: string;
		PATH: string;
		DEVECOSTUDIO_VM_OPTIONS: string;
		RUSTROVER_VM_OPTIONS: string;
		npm_package_json: string;
		__CFBundleIdentifier: string;
		USER_ZDOTDIR: string;
		npm_config_init_module: string;
		npm_config_userconfig: string;
		PWD: string;
		npm_command: string;
		ANTHROPIC_MODEL: string;
		SENTRY_DSN_ADMIN: string;
		OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: string;
		EDITOR: string;
		npm_lifecycle_event: string;
		CLION_VM_OPTIONS: string;
		IDEA_VM_OPTIONS: string;
		LANG: string;
		npm_package_name: string;
		NODE_PATH: string;
		XPC_FLAGS: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		npm_config_npm_version: string;
		WEBSTORM_VM_OPTIONS: string;
		DATASPELL_VM_OPTIONS: string;
		ANTHROPIC_DEFAULT_OPUS_MODEL: string;
		npm_config_node_gyp: string;
		XPC_SERVICE_NAME: string;
		AQUA_VM_OPTIONS: string;
		npm_package_version: string;
		VSCODE_INJECTION: string;
		HOME: string;
		STUDIO_VM_OPTIONS: string;
		SHLVL: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		ANTHROPIC_BASE_URL: string;
		HOMEBREW_PREFIX: string;
		LOGNAME: string;
		ANTHROPIC_AUTH_TOKEN: string;
		npm_config_cache: string;
		ANTHROPIC_DEFAULT_SONNET_MODEL_NAME: string;
		npm_lifecycle_script: string;
		GATEWAY_VM_OPTIONS: string;
		VSCODE_GIT_IPC_HANDLE: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		DATAGRIP_VM_OPTIONS: string;
		NVM_BIN: string;
		PKG_CONFIG_PATH: string;
		npm_config_user_agent: string;
		HOMEBREW_CELLAR: string;
		INFOPATH: string;
		GIT_ASKPASS: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		DISABLE_AUTOUPDATER: string;
		OSLogRateLimit: string;
		JETBRAINS_CLIENT_VM_OPTIONS: string;
		RIDER_VM_OPTIONS: string;
		RUBYMINE_VM_OPTIONS: string;
		CLAUDECODE: string;
		ANTHROPIC_DEFAULT_SONNET_MODEL: string;
		COLORTERM: string;
		npm_config_prefix: string;
		npm_node_execpath: string;
		NODE_ENV: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * Similar to [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private), but only includes variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`), and can therefore safely be exposed to client-side code.
 * 
 * Note that public dynamic environment variables must all be sent from the server to the client, causing larger network requests — when possible, use `$env/static/public` instead.
 * 
 * Dynamic environment variables cannot be used during prerendering.
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.PUBLIC_DEPLOYMENT_SPECIFIC_VARIABLE);
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
