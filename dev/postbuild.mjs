/**
 * After `vite build`: publish the built page a second time as
 * assignments.html. The organizer is reachable at both / and /assignments(.html),
 * and both must serve the identical built output (hashed asset URLs), which a
 * source-file copy in public/ can no longer provide now that the app is a
 * bundled module.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';

if (!existsSync('dist/index.html')) {
  console.error('postbuild: dist/index.html is missing, run vite build first.');
  process.exit(1);
}

const built = readFileSync('dist/index.html', 'utf8');
if (!built.includes('/assets/')) {
  console.error('postbuild: dist/index.html has no hashed assets, the build did not bundle the app.');
  process.exit(1);
}

copyFileSync('dist/index.html', 'dist/assignments.html');
console.log('postbuild: dist/assignments.html written');
