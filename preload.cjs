// The preload runs sandboxed by default (`sandbox: true` since Electron 20). Sandboxed preloads run as plain CommonJS without an ESM context, and their `require` only resolves `electron` and a few Node.js built-ins, not relative files. So this file must stay a single self-contained CommonJS file. Use the free `process` variable instead of `require('node:process')`.
/* eslint-disable unicorn/no-global-object-property-assignment -- Sharing values with the renderer through globals is the job of this preload. */
const {contextBridge, ipcRenderer} = require('electron');

// Must match `lib/common.js`.
const defaultsNamespace = '__ELECTRON_TIMBER_DEFAULTS__';
const bridgeNamespace = '__ELECTRON_TIMBER_BRIDGE__';
const defaultsRequestChannel = 'timber-get-defaults';
const defaultsUpdatedChannel = 'timber-defaults-updated';
const updateChannel = '__ELECTRON_TIMBER_UPDATE__';

// Fetch the current defaults set via `setDefaults()` in the main process.
// The preload runs before any renderer code, so the exposed defaults are ready
// when the renderer logger loads. It must be synchronous, as CommonJS has no top-level await.
const defaults = ipcRenderer.sendSync(defaultsRequestChannel);

// Generic IPC bridge for renderers loaded as plain ESM (`<script type="module">`),
// where bare specifiers like `import … from 'electron'` do not resolve even with
// `nodeIntegration: true`. Callbacks run in the renderer when invoked.
const bridge = {
	send(channel, data) {
		ipcRenderer.send(channel, data);
	},
	on(channel, callback) {
		ipcRenderer.on(channel, (event, ...arguments_) => {
			callback(...arguments_);
		});
	},
};

// With `contextIsolation: true` (the default since Electron 12), assigning to
// `globalThis` here would only be visible in the isolated preload world, so
// expose the values to the main world instead.
try {
	// The sandboxed preload gets `process` as a wrapper parameter, not as `globalThis.process`.
	// eslint-disable-next-line n/prefer-global/process -- The sandboxed preload cannot require `node:process`.
	if (process.contextIsolated) {
		contextBridge.exposeInMainWorld(defaultsNamespace, defaults);
		contextBridge.exposeInMainWorld(bridgeNamespace, bridge);
	} else {
		globalThis[defaultsNamespace] = defaults;
		globalThis[bridgeNamespace] = bridge;
	}
} catch {
	globalThis[defaultsNamespace] = defaults;
	globalThis[bridgeNamespace] = bridge;
}

// Keep the preload-world copy in sync. Renderers maintain their own main-world
// copy through the bridge, as the exposed object is a snapshot.
ipcRenderer.on(defaultsUpdatedChannel, (event, newDefaults) => {
	globalThis[defaultsNamespace] = newDefaults;
});

ipcRenderer.on(updateChannel, (event, flag) => {
	if (globalThis[defaultsNamespace] !== undefined) {
		globalThis[defaultsNamespace].shouldHookConsole = flag;
	}
});
