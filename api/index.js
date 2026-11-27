// Vercel entry point: runs the same DhuanTrace server as a serverless function.
// Vercel's file system is read-only except /tmp, so saved data goes there.
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/dhuantrace-data';
const { server } = require('../app');

module.exports = (req, res) => server.emit('request', req, res);
