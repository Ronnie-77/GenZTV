const fs = require('fs');
const path = require('path');

// __dirname = /home/z/my-project/mini-services/chat-service/scripts
// We need the parent project's node_modules at /home/z/my-project/node_modules
const nm = path.join(__dirname, '..', 'node_modules');
const parentNm = path.resolve(__dirname, '..', '..', '..', 'node_modules');

console.log(`[postinstall] Mini-service node_modules: ${nm}`);
console.log(`[postinstall] Parent project node_modules: ${parentNm}`);

const links = [
  {
    target: path.join(parentNm, '.prisma', 'client'),
    link: path.join(nm, '.prisma', 'client'),
  },
  {
    target: path.join(parentNm, '@prisma', 'client'),
    link: path.join(nm, '@prisma', 'client'),
  },
];

for (const { target, link } of links) {
  try {
    // Verify target exists
    if (!fs.existsSync(target)) {
      console.warn(`[postinstall] Target does not exist: ${target} — skipping`);
      continue;
    }
    // Remove existing (file, dir, or symlink)
    if (fs.existsSync(link)) {
      fs.rmSync(link, { recursive: true, force: true });
    }
    // Ensure parent directory exists
    fs.mkdirSync(path.dirname(link), { recursive: true });
    // Create symlink
    fs.symlinkSync(target, link);
    console.log(`[postinstall] Linked: ${link} -> ${target}`);
  } catch (e) {
    console.warn(`[postinstall] Link failed: ${e.message}`);
  }
}
