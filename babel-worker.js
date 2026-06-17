// babel-worker.js — compiles JSX on a background thread
// Pinned to Babel 7.x AND classic runtime: Babel 8 changed the default JSX
// runtime to "automatic", which injects `import {...} from "react/jsx-runtime"`
// into the output. This app injects the compiled code as a PLAIN <script>
// (not type=module) and loads React via UMD global, so any import statement
// throws "Cannot use import statement outside a module". runtime:'classic'
// emits React.createElement instead — no imports. (Fixed 2026-06-17.)
importScripts('https://unpkg.com/@babel/standalone@7.26.4/babel.min.js');

self.onmessage = function(e) {
  const source = e.data;
  try {
    const result = Babel.transform(source, {
      presets: [['react', { runtime: 'classic' }]],
      compact: false,
    });
    self.postMessage({ ok: true, code: result.code });
  } catch(err) {
    self.postMessage({ ok: false, error: err.message + ' (line ' + (err.loc && err.loc.line) + ')' });
  }
};
