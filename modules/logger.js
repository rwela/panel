'use strict';

const RESET = '\x1b[0m';

const COLORS = {
  log: '\x1b[37m',     // white
  success: '\x1b[32m', // green
  info: '\x1b[36m',    // cyan
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
};

function format(color, message) {
  return `${color}● System ${RESET}| ${message}`;
}

const Logger = {
  log(message) {
    console.log(format(COLORS.info, message));
  },

  success(message) {
    console.log(format(COLORS.success, message));
  },

  info(message) {
    console.log(format(COLORS.info, message));
  },

  warn(message) {
    console.log(format(COLORS.warn, message));
  },

  error(message) {
    console.log(format(COLORS.error, message));
  },
};

module.exports = Logger;
