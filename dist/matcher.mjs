import { matchRows } from './core.mjs';
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id, matches:matchRows(data.rows, data.rules)}); }
  catch (error) { self.postMessage({id:data.id, error:error.message}); }
};
