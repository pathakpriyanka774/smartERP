// Test-only preload: moves every service's fixed port up by TEST_PORT_OFFSET,
// so the suite runs beside a normal instance without touching it.
const express = require('express');
const offset = parseInt(process.env.TEST_PORT_OFFSET || '20000', 10);
const listen = express.application.listen;
express.application.listen = function (port, ...rest) {
  return listen.call(this, Number(port) + offset, ...rest);
};
