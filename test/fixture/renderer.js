'use strict';
const electron = require('electron');
const logger = require('../..');

logger.log('Renderer log');
logger.warn('Renderer warn');
logger.error('Renderer error');
logger.time('Renderer timer');
logger.timeEnd('Renderer timer');

electron.ipcRenderer.on('logger', (event, method, ...args) => {
    logger[method](...args);
});
