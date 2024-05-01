import {remote} from 'electron';
import logger from './index.js';

const defaultsNameSpace = '__ELECTRON_TIMBER_DEFAULTS__';
const {shouldHookConsole} = remote.getGlobal(defaultsNameSpace);

if (shouldHookConsole) {
	logger.hookConsole();
}
