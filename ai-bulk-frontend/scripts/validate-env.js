import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const patterns = [/localhost/, /127\.0\.0\.1/];

function scan(dir, relative = '') {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = join(relative, entry);
    if (entry.startsWith('node_modules') || entry.startsWith('dist') || entry.startsWith('.git')) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      scan(full, rel);
    } else if (stat.isFile() && /\.(ts|tsx|js|jsx|html|json|env)$/.test(entry)) {
      const content = readFileSync(full, 'utf-8');
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          console.error(`FAIL: Found "${match[0]}" in ${rel}`);
          process.exit(1);
        }
      }
    }
  }
}

scan(join(root, 'src'));
console.log('PASS: No localhost/127.0.0.1 references found in source');
