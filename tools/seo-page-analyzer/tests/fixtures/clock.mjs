// The same timestamp makes saved answers and complete CLI byte checks stable.
const NativeDate = Date;
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : ['2026-11-09T00:00:00.000Z'])); }
  static now() { return NativeDate.parse('2026-11-09T00:00:00.000Z'); }
};
