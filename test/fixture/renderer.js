import logger from '../../index.js';
import {bridgeNamespace} from '../../lib/common.js';

const test = (new URLSearchParams(globalThis.location.search)).get('test');
const bridge = globalThis[bridgeNamespace];

// Run different code for different tests
switch (test) {
	case 'hookConsole': {
		let unhook = logger.hookConsole();
		console.log('Renderer log console');
		console.warn('Renderer warn console');
		unhook();
		console.log('Renderer log console');
		console.warn('Renderer warn console');

		unhook = logger.hookConsole();
		console.error('Renderer error console');
		console.time('Renderer timer console');
		console.timeEnd('Renderer timer console');
		unhook();
		console.error('Renderer error console');
		console.time('Renderer timer console');
		console.timeEnd('Renderer timer console');
		break;
	}

	case 'securityWarning': {
		// The console is hooked from the main process. This is how Electron logs its security warnings in the renderer.
		console.warn('%cElectron Security Warning (Insecure Content-Security-Policy)', 'font-weight: bold;', 'This renderer process has no Content Security Policy set.');
		console.warn('Renderer warn console');
		break;
	}

	case 'defaults': {
		logger.log('Renderer defaults', JSON.stringify(logger.getDefaults()));
		break;
	}

	case 'logLevel': {
		bridge?.on('logger', (method, ...arguments_) => {
			logger[method](...arguments_);
		});
		break;
	}

	default: {
		logger.log('Renderer log');
		logger.warn('Renderer warn');
		logger.error('Renderer error');
		logger.time('Renderer timer');
		logger.timeEnd('Renderer timer');
	}
}
