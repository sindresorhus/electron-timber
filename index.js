const {is} = require('electron-util');

let logger;

if (is.main) {
	logger = require('./src/main/logger.js');
} else if (is.renderer) {
	logger = require('./src/renderer/logger.js');
}

module.exports = logger;
