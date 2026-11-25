import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const output = process.argv[2] && resolve(process.argv[2]);
if (!output || !output.endsWith('.zip')) throw new Error('Usage: node scripts/package-release.mjs <output.zip>');

const require = createRequire(import.meta.url);
const JSZip = require('../dist/vendor/jszip.js');
const archive = new JSZip();
const root = fileURLToPath(new URL('../', import.meta.url));
const site = resolve(root, 'pages-out');
const date = new Date('2000-01-01T00:00:00Z');
const options = {date, createFolders:false};
const assets = /\.(?:html|mjs|js|css|json|txt|svg|webp|png|pdf|woff2|webmanifest)$/;
const runtime = await readFile(resolve(site,'runtime.mjs'),'utf8');
const configuration = /^export const runtime = (\{.*\});\s*$/.exec(runtime);
if (!configuration) throw new Error('Build the static Pages release first with node build-pages.mjs.');
const settings = JSON.parse(configuration[1]);
if (!settings.pages || settings.hosted || settings.indexBase) {
  throw new Error('Build with no LANDREVIEW_INDEX_ORIGIN for an offline release.');
}

for (const path of ['AGENTS.md','LICENSE','README.md','docs/BRD.md','docs/CODEX-EVIDENCE.md','docs/DATA-SOURCES.md','docs/DEPLOYMENT.md','docs/RELEASE-CHECKLIST.md','docs/TEST-PLAN.md','docs/TRD.md']) {
  archive.file(path, await readFile(resolve(root,path)), options);
}
archive.file('serve.mjs', await readFile(resolve(root,'scripts/serve-release.mjs')), options);
archive.file('START-HERE.txt', [
  'India Land Search challenge demo',
  '',
  '1. Extract every file into a new folder.',
  '2. Open a terminal in that folder and run: node serve.mjs',
  '3. Open http://127.0.0.1:8080/landreview/?demo=1 in your browser.',
  '',
  'Node.js 24 is required. The app and sample data work offline after extraction.',
  'The demo uses fictional ownership records. See docs/CODEX-EVIDENCE.md for the challenge evidence.',
  ...(/^[0-9a-f]{40}$/i.test(process.env.GITHUB_SHA ?? '') ? ['Source commit ' + process.env.GITHUB_SHA] : []),
  ''
].join('\n'), options);

for (const folder of ['', 'vendor']) {
  // Select assets from the tracked browser source layout so stale output files cannot enter the ZIP.
  const files = await readdir(resolve(root,'dist',folder), {withFileTypes:true});
  const names = files.filter(file => file.isFile() && assets.test(file.name)).map(file => file.name).sort();
  for (const name of names) {
    const asset = folder ? folder + '/' + name : name;
    archive.file('site/' + asset, await readFile(resolve(site,asset)), options);
  }
}

archive.file('site/odisha-map-snapshots.json',await readFile(resolve(site,'odisha-map-snapshots.json')),options);

const bytes = await archive.generateAsync({type:'nodebuffer', compression:'DEFLATE', compressionOptions:{level:9}});
await mkdir(dirname(output), {recursive:true});
await writeFile(output, bytes);
console.log('SHA-256 ' + createHash('sha256').update(bytes).digest('hex') + '  ' + output);
