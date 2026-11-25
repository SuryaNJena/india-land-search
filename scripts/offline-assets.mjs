import {createHash} from 'node:crypto';

export function configureOfflineWorker(source, contents) {
  const shell=Object.keys(contents).filter(path=>/\.(?:css|mjs|js|html|svg|webmanifest)$/.test(path) && path!=='offline-worker.js').sort();
  const revision=createHash('sha256').update(JSON.stringify(contents)).digest('hex').slice(0,14);
  return source.replace('/* BUILD_ASSETS */ []',JSON.stringify(shell.map(path=>'./'+path)))
    .replace('/* BUILD_REVISION */',revision);
}
