// `lib/main.js` is the main-process logger, so it can only be imported inside Electron. This stub
// stands in for the small part of the `electron` module that it touches, which is enough to drive
// the console hook and read what it sent to the renderers.
class FakeWebContents {
	sent = [];

	send(channel, data) {
		this.sent.push({channel, data});
	}
}

export class BrowserWindow {
	static #windows = [];

	static getAllWindows() {
		return BrowserWindow.#windows;
	}

	constructor() {
		this.webContents = new FakeWebContents();
		BrowserWindow.#windows.push(this);
	}
}

export const app = {
	whenReady: () => Promise.resolve(),
};

export const session = {
	defaultSession: {
		preloadScripts: [],
		getPreloadScripts() {
			return session.defaultSession.preloadScripts;
		},
		registerPreloadScript(script) {
			session.defaultSession.preloadScripts.push(script);
		},
	},
};

export const ipcMain = {
	listeners: new Map(),
	listenerCount(channel) {
		return (ipcMain.listeners.get(channel) ?? []).length;
	},
	on(channel, listener) {
		ipcMain.listeners.set(channel, [...(ipcMain.listeners.get(channel) ?? []), listener]);
	},
};

// Every value sent on the console update channel, in order, so a test can tell a hook that was
// undone from one that was never applied.
export const consoleUpdateFlags = windows => windows
	.flatMap(window => window.webContents.sent)
	.filter(({channel}) => channel === '__ELECTRON_TIMBER_UPDATE__')
	.map(({data}) => data);
