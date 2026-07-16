import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const deployedRoots = ['handlers', 'lib'];
const prohibitedRuntimeTokens = [
  /\bsetTimeout\s*\(/,
  /\bsetInterval\s*\(/,
  /\bprocess\b/,
  /\bBuffer\b/,
  /from\s+['"](?:fs|path|node:|http|https|grammy)['"]/,
];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

const files = [join(root, 'schema.js')];
for (const directory of deployedRoots) {
  files.push(...(await filesUnder(join(root, directory))));
}

const errors = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const display = relative(root, file);
  const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (syntax.status !== 0) errors.push(`${display}: ${syntax.stderr.trim()}`);

  if (/from\s+['"]\.?\.\//.test(source)) {
    errors.push(`${display}: Serverless modules must use bare imports, never relative imports.`);
  }
  if (/from\s+['"][^'"/]+\.js['"]/.test(source)) {
    errors.push(`${display}: Serverless imports omit the .js extension.`);
  }
  for (const token of prohibitedRuntimeTokens) {
    if (token.test(source)) errors.push(`${display}: prohibited runtime dependency: ${token}`);
  }
}

for (const directory of ['handlers']) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  if (entries.some((entry) => entry.isDirectory())) {
    errors.push(`${directory}/ must stay flat because Telegram Serverless maps filenames to update types.`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${files.length} deployable JavaScript modules.`);
}
