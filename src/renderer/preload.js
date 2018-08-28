const {remote} = require('electron');
const {channel, defaults, hookableMethods} = require('../common/constants');

// Exit early if loader is a chrome/devTools extension.
// They throw errors because the Electron API is not available on them.
// Nevertheless, it makes no sense loading the logger and watching the console on them!
// This affects to all extra extensions added to the app, like Devtron or any of the
// incredibly useful extensions provided by the package `electron-devtools-installer`.
const url = window.location.href || document.URL;

if (!/^chrome-(?:devtools|extension):\/\/.+$/.test(url)) {
	const {shouldHookConsole} = remote.getGlobal(defaults.nameSpace);
	if (shouldHookConsole) {
		const logger = require('./logger'); // Default `timber` logger.
		logger._toggleHook(shouldHookConsole);
	}
} else if (!remote.getCurrentWindow()) {
	const isElectronInspector = url.startsWith('chrome-devtools://devtools/bundled/inspector.html' +
		'?remoteBase=https://chrome-devtools-frontend.appspot.com/serve_file/');
	const logger = require('./logger'); // `timber [renderer]`.
	const getPriority = hookableMethod => {
		switch (hookableMethod) {
			case 'error': return 0;
			case 'warn': return 1;
			default: return 2;
		}
	};

	// Replace chromium extension/devTools console to allow filtering undesired messages.
	// Fixes https://github.com/sindresorhus/electron-timber/issues/13
	// NOTE: The `inspector` does NOT return a BrowserWindow when invoking `remote.getCurrentWindow()`.
	const nativeConsole = {};
	hookableMethods.forEach(hookableMethod => {
		nativeConsole[hookableMethod] = console[hookableMethod];
		console[hookableMethod] = (...args) => {
			const mute = logger._options.muteElectronInspector;
			if (isElectronInspector && (mute === true || getPriority(hookableMethod) >= parseInt(mute, 10))) {
				return;
			}
			logger[hookableMethod](...args);
		};
	});

	// Chromium extension/devTools cannot receive normal defaults updates on IPC
	// `channel.rebuildContexts` because we cannot retrieve the BrowserWindow
	// because of not having (and cannot infer) an ID.
	remote.ipcMain.on(channel.updateExtensions, (event, rebuild, maxNameLength) => {
		if (rebuild.contexts) {
			logger._buildContexts(maxNameLength);
		}
		if (rebuild.helpers) {
			logger._bindLevelHelpers();
		}
	});
}
