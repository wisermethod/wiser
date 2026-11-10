// Simulate Node 18.0's missing convenience globals on the installed Node.
Object.defineProperty(globalThis, 'crypto', {value:undefined, configurable:true});
Object.defineProperty(AbortSignal, 'any', {value:undefined, configurable:true});
