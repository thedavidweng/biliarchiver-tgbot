import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'sdk') return nextResolve(new URL('./sdk.mjs', import.meta.url).href, context);
    if (specifier === 'sdk/db') return nextResolve(new URL('./db.mjs', import.meta.url).href, context);
    if (specifier === 'schema') return nextResolve(new URL('./schema.mjs', import.meta.url).href, context);
    if (specifier.startsWith('lib/')) return nextResolve(new URL(`../../${specifier}.js`, import.meta.url).href, context);
    return nextResolve(specifier, context);
  },
});
