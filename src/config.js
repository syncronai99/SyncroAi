const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, 'data');
const uploadDir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(publicDir, 'uploads', 'projects');

// Hosts with ephemeral filesystems can point these at mounted persistent volumes.
[dataDir, uploadDir].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

module.exports = { rootDir, publicDir, dataDir, uploadDir };
