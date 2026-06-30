// `__BUILD_ID__` is injected by Vite's `define` at build time (the Vercel commit
// SHA, or "dev" locally — see vite.config.ts). Vite's `vite build` applies the
// replacement, but `vite dev` doesn't reliably (the define plugin doesn't fire
// for files transformed by @vitejs/plugin-react in serve mode), which would
// leave a bare `__BUILD_ID__` and throw a ReferenceError at runtime. `typeof`
// on an undeclared global is safe (returns "undefined", never throws), so this
// resolves to the injected value in a build and falls back to "dev" otherwise.
export const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'
