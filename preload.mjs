// The preload runs in a sandboxed context without access to `node:` imports,
// so only `electron` and relative imports are allowed here. Use the global
// `process` instead of `import process from 'node:process'`.
import {contextBridge, ipcRenderer} from 'electron';
import {
	defaultsNamespace,
	bridgeNamespace,
	defaultsRequestChannel,
	defaultsUpdatedChannel,
	updateChannel,
} from './lib/common.js';

// Fetch the current defaults set via `setDefaults()` in the main process.
// The preload runs before any renderer code, so the exposed defaults are ready
// when the renderer logger loads.
const defaults = await ipcRenderer.invoke(defaultsRequestChannel);

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
	// eslint-disable-next-line n/prefer-global/process -- The preload is sandboxed and cannot use `node:` imports.
	if (globalThis.process?.contextIsolated) {
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
