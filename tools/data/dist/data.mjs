import { createRequire as wiserCreateRequire } from "node:module";
const require = wiserCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// tools/lib/one-file.js
var one_file_exports = {};
__export(one_file_exports, {
  compiledEntry: () => compiledEntry,
  isMain: () => isMain,
  packagesAvailable: () => packagesAvailable,
  packagesBundled: () => packagesBundled
});
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function packagesBundled() {
  return true;
}
async function packagesAvailable(marker, loadPackages2, external = []) {
  return (await packageAvailability(marker, loadPackages2, external)).available;
}
async function packageAvailability(marker, loadPackages2, external) {
  if (packagesBundled()) return { available: true };
  const unavailable = { available: false };
  if (!existsSync(marker)) return unavailable;
  try {
    let dir = dirname(marker);
    while (dirname(dir) !== dir && basename(dir) !== "node_modules") dir = dirname(dir);
    if (basename(dir) !== "node_modules") return unavailable;
    dir = dirname(dir);
    const lock = JSON.parse(readFileSync(join(dir, "package-lock.json")));
    const requested = relative(dir, dirname(marker)).split(sep).join("/");
    if (!lock.packages[requested]?.version) return unavailable;
    let incomplete = false;
    for (const [path, expected] of Object.entries(lock.packages)) {
      if (!path.startsWith("node_modules/") || external.includes(path.slice("node_modules/".length))) continue;
      let installed;
      try {
        installed = JSON.parse(readFileSync(join(dir, path, "package.json"))).version;
      } catch {
        incomplete = true;
        continue;
      }
      if (!expected.version || !installed) {
        incomplete = true;
        continue;
      }
      if (installed !== expected.version) return {
        available: false,
        mismatch: { package: path.slice("node_modules/".length), installed, locked: expected.version }
      };
    }
    if (incomplete) return unavailable;
    await loadPackages2();
    return { available: true };
  } catch {
    return unavailable;
  }
}
async function compiledEntry(marker, loadPackages2, entryUrl, name, external = []) {
  const state = await packageAvailability(marker, loadPackages2, external);
  if (state.available) return null;
  const url = pathToFileURL(resolve(dirname(realpathSync(fileURLToPath(entryUrl))), "..", "dist", `${name}.mjs`));
  if (!existsSync(url)) return null;
  if (state.mismatch) {
    const { package: pkg, installed, locked } = state.mismatch;
    process.stderr.write(`Using compiled ${name}: ${pkg} installed version ${installed} differs from locked version ${locked}.
`);
  }
  return url.href;
}
function sameFile(a, b) {
  if (process.platform === "win32" && a.toLowerCase() === b.toLowerCase()) return true;
  const x = statSync(a, { bigint: true }), y = statSync(b, { bigint: true });
  return x.ino !== 0n && x.dev === y.dev && x.ino === y.ino;
}
function isMain(url) {
  const file = fileURLToPath(url);
  try {
    if (!process.argv[1]) throw new Error("process.argv[1] is missing");
    const a = realpathSync(file), b = realpathSync(process.argv[1]);
    return a === b || sameFile(a, b);
  } catch (error) {
    if (process.argv[1] && resolve(file) === resolve(process.argv[1])) return true;
    const cause = String(error.message).replace(/[\r\n]+/g, " ");
    process.stderr.write(`Cannot determine whether ${file} is the program: ${cause}. Run this file directly with node.
`);
    process.exitCode = 1;
    return false;
  }
}
var init_one_file = __esm({
  "tools/lib/one-file.js"() {
  }
});

// tools/lib/user-config.js
import { homedir } from "node:os";
import { join as join2 } from "node:path";
function wiserUserConfigDir(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === "win32") {
    const base = env.APPDATA && env.APPDATA.length > 0 ? env.APPDATA : join2(home, "AppData", "Roaming");
    return join2(base, "wiser");
  }
  if (platform === "darwin") return join2(home, "Library", "Application Support", "wiser");
  const xdg = env.XDG_CONFIG_HOME;
  if (typeof xdg === "string" && xdg.length > 0) return join2(xdg, "wiser");
  return join2(home, ".config", "wiser");
}
var init_user_config = __esm({
  "tools/lib/user-config.js"() {
  }
});

// tools/lib/consent.js
var consent_exports = {};
__export(consent_exports, {
  INSTALL_BYTES: () => INSTALL_BYTES,
  INSTALL_COPY_ONLY: () => INSTALL_COPY_ONLY,
  INSTALL_HELP: () => INSTALL_HELP,
  INSTALL_NOT_SAVED: () => INSTALL_NOT_SAVED,
  INSTALL_ONCE: () => INSTALL_ONCE,
  flagAuthorised: () => flagAuthorised,
  formatInstallSize: () => formatInstallSize,
  installAuthorised: () => installAuthorised,
  installQuestion: () => installQuestion,
  parsedInstallFlag: () => parsedInstallFlag,
  pluginRoot: () => pluginRoot,
  trustedDirectory: () => trustedDirectory,
  writeConsent: () => writeConsent
});
import { closeSync, constants, existsSync as existsSync2, fstatSync, lstatSync, mkdirSync, openSync, readFileSync as readFileSync2, realpathSync as realpathSync2, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname as dirname2, join as join3 } from "node:path";
function installQuestion(what, purpose, size) {
  return "This Wiser skill needs to download and install " + what + " on your machine in order to " + purpose + "." + (size ? " It's about " + size + "." : "") + " " + INSTALL_ONCE;
}
function formatInstallSize(bytes) {
  const kb = Math.max(1, Math.round(bytes / 1e3));
  const tenths = Math.round(bytes / 1e5);
  const mb = bytes / 1e6;
  if (mb < 1) return kb < 1e3 ? `${kb} KB` : "1.0 MB";
  if (mb < 10) return tenths < 100 ? `${(tenths / 10).toFixed(1)} MB` : "10 MB";
  const rounded = Math.round(mb / (mb >= 100 ? 10 : 1)) * (mb >= 100 ? 10 : 1);
  return rounded >= 1e3 ? `${(Math.round(bytes / 1e8) / 10).toFixed(1)} GB` : `${rounded} MB`;
}
function pluginRoot(fromFile) {
  let dir = dirname2(fromFile);
  for (; ; ) {
    if (existsSync2(join3(dir, "tools", "AGENTS.md"))) {
      try {
        return realpathSync2(dir);
      } catch {
        return null;
      }
    }
    const parent = dirname2(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function parsedInstallFlag(argv, valueFlags) {
  const flags = valueFlags || /* @__PURE__ */ new Set();
  const values = /* @__PURE__ */ new Set();
  for (let index = 0; index < argv.length; index += 1) {
    if (values.has(index)) continue;
    if (flags.has(argv[index])) values.add(index + 1);
  }
  for (let index = 0; index < argv.length; index += 1) {
    if (values.has(index)) continue;
    if (argv[index] === "--install") return true;
  }
  return false;
}
function flagAuthorised(install) {
  return install === true || process.env.WISER_ALLOW_INSTALL === "1";
}
function trustedDirectory(dir) {
  const info = lstatSync(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("the user-config directory is not a real directory");
  if (process.platform !== "win32") {
    if (info.uid !== process.getuid()) throw new Error("the user-config directory is owned by another user");
    if (info.mode & 18) throw new Error("the user-config directory is writable by group or others");
  }
}
function personConsent() {
  let fd;
  try {
    const dir = wiserUserConfigDir();
    trustedDirectory(dir);
    fd = openSync(join3(dir, MARKER_NAME), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const info = fstatSync(fd);
    if (!info.isFile() || process.platform !== "win32" && (info.uid !== process.getuid() || info.mode & 18)) return false;
    const data = JSON.parse(readFileSync2(fd, "utf8"));
    return data?.scope === "person" && typeof data.tool === "string" && data.tool.length > 0 && typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date) && !data.date.startsWith("0000-") && Number.isFinite(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0, 10) === data.date;
  } catch {
    return false;
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function installAuthorised(fromFile, install) {
  if (flagAuthorised(install) || personConsent()) return true;
  const root = pluginRoot(fromFile);
  if (!root) return false;
  let fd;
  try {
    fd = openSync(join3(root, MARKER_NAME), constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    if (!fstatSync(fd).isFile()) return false;
    const data = JSON.parse(readFileSync2(fd, "utf8"));
    return typeof data?.realpath === "string" && data.realpath === root;
  } catch {
    return false;
  } finally {
    if (fd !== void 0) closeSync(fd);
  }
}
function writeMarker(file, data) {
  const temporary = `${file}.tmp-${randomUUID()}`;
  let fd;
  try {
    fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 384);
    writeFileSync(fd, `${JSON.stringify(data)}
`);
    closeSync(fd);
    fd = void 0;
    renameSync(temporary, file);
  } finally {
    if (fd !== void 0) closeSync(fd);
    rmSync(temporary, { force: true });
  }
}
function copyOnly(error, saved = true) {
  const reason = String(error.message || error.code || error).split(/[\r\n]/)[0];
  const message = `${saved ? INSTALL_COPY_ONLY : INSTALL_NOT_SAVED}${reason}.`;
  if (!warned.has(message)) {
    process.stderr.write(`${message}
`);
    warned.add(message);
  }
}
function writeConsent(fromFile, tool, install) {
  if (!flagAuthorised(install)) {
    if (!installAuthorised(fromFile, false)) return;
    if (!personConsent()) {
      try {
        trustedDirectory(wiserUserConfigDir());
      } catch (error) {
        copyOnly(error);
      }
    }
    return;
  }
  const root = pluginRoot(fromFile);
  const date = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  let personError;
  let copySaved = false;
  try {
    const dir = wiserUserConfigDir();
    mkdirSync(dir, { recursive: true, mode: 448 });
    trustedDirectory(dir);
    writeMarker(join3(dir, MARKER_NAME), { scope: "person", date, tool });
  } catch (error) {
    personError = error;
  }
  if (root) {
    try {
      writeMarker(join3(root, MARKER_NAME), { realpath: root, date, tool });
      copySaved = true;
    } catch {
    }
  }
  if (personError) copyOnly(personError, copySaved);
}
var INSTALL_ONCE, INSTALL_HELP, INSTALL_COPY_ONLY, INSTALL_NOT_SAVED, MARKER_NAME, warned, INSTALL_BYTES;
var init_consent = __esm({
  "tools/lib/consent.js"() {
    init_user_config();
    INSTALL_ONCE = "You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
    INSTALL_HELP = "Say yes to the download this tool needs. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
    INSTALL_COPY_ONLY = "Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: ";
    INSTALL_NOT_SAVED = "Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: ";
    MARKER_NAME = ".wiser-consent";
    warned = /* @__PURE__ */ new Set();
    INSTALL_BYTES = Object.freeze({
      chromium: 578678784,
      playwright: 19120128,
      mermaid: 64602112,
      reveal: 6045696,
      image: 16936960,
      harvester: 3768320,
      request: 1617920,
      data: 1499136,
      keynote: 1310720
    });
  }
});

// tools/data/node_modules/csv-parse/lib/api/CsvError.js
var CsvError;
var init_CsvError = __esm({
  "tools/data/node_modules/csv-parse/lib/api/CsvError.js"() {
    CsvError = class _CsvError extends Error {
      constructor(code, message, options, ...contexts) {
        if (Array.isArray(message)) message = message.join(" ").trim();
        super(message);
        if (Error.captureStackTrace !== void 0) {
          Error.captureStackTrace(this, _CsvError);
        }
        this.code = code;
        for (const context of contexts) {
          for (const key in context) {
            const value = context[key];
            this[key] = Buffer.isBuffer(value) ? value.toString(options.encoding) : value == null ? value : JSON.parse(JSON.stringify(value));
          }
        }
      }
    };
  }
});

// tools/data/node_modules/csv-parse/lib/utils/is_object.js
var is_object;
var init_is_object = __esm({
  "tools/data/node_modules/csv-parse/lib/utils/is_object.js"() {
    is_object = function(obj) {
      return typeof obj === "object" && obj !== null && !Array.isArray(obj);
    };
  }
});

// tools/data/node_modules/csv-parse/lib/api/normalize_columns_array.js
var normalize_columns_array;
var init_normalize_columns_array = __esm({
  "tools/data/node_modules/csv-parse/lib/api/normalize_columns_array.js"() {
    init_CsvError();
    init_is_object();
    normalize_columns_array = function(columns) {
      const normalizedColumns = [];
      for (let i = 0, l = columns.length; i < l; i++) {
        const column = columns[i];
        if (column === void 0 || column === null || column === false) {
          normalizedColumns[i] = { disabled: true };
        } else if (typeof column === "string") {
          normalizedColumns[i] = { name: column };
        } else if (is_object(column)) {
          if (typeof column.name !== "string") {
            throw new CsvError("CSV_OPTION_COLUMNS_MISSING_NAME", [
              "Option columns missing name:",
              `property "name" is required at position ${i}`,
              "when column is an object literal"
            ]);
          }
          normalizedColumns[i] = column;
        } else {
          throw new CsvError("CSV_INVALID_COLUMN_DEFINITION", [
            "Invalid column definition:",
            "expect a string or a literal object,",
            `got ${JSON.stringify(column)} at position ${i}`
          ]);
        }
      }
      return normalizedColumns;
    };
  }
});

// tools/data/node_modules/csv-parse/lib/utils/ResizeableBuffer.js
var ResizeableBuffer, ResizeableBuffer_default;
var init_ResizeableBuffer = __esm({
  "tools/data/node_modules/csv-parse/lib/utils/ResizeableBuffer.js"() {
    ResizeableBuffer = class {
      constructor(size = 100) {
        this.size = size;
        this.length = 0;
        this.buf = Buffer.allocUnsafe(size);
      }
      prepend(val) {
        if (Buffer.isBuffer(val)) {
          const length = this.length + val.length;
          if (length >= this.size) {
            this.resize();
            if (length >= this.size) {
              throw Error("INVALID_BUFFER_STATE");
            }
          }
          const buf = this.buf;
          this.buf = Buffer.allocUnsafe(this.size);
          val.copy(this.buf, 0);
          buf.copy(this.buf, val.length);
          this.length += val.length;
        } else {
          const length = this.length++;
          if (length === this.size) {
            this.resize();
          }
          const buf = this.clone();
          this.buf[0] = val;
          buf.copy(this.buf, 1, 0, length);
        }
      }
      append(val) {
        const length = this.length++;
        if (length === this.size) {
          this.resize();
        }
        this.buf[length] = val;
      }
      clone() {
        return Buffer.from(this.buf.slice(0, this.length));
      }
      resize() {
        const length = this.length;
        this.size = this.size * 2;
        const buf = Buffer.allocUnsafe(this.size);
        this.buf.copy(buf, 0, 0, length);
        this.buf = buf;
      }
      toString(encoding) {
        if (encoding) {
          return this.buf.slice(0, this.length).toString(encoding);
        } else {
          return Uint8Array.prototype.slice.call(this.buf.slice(0, this.length));
        }
      }
      toJSON() {
        return this.toString("utf8");
      }
      reset() {
        this.length = 0;
      }
    };
    ResizeableBuffer_default = ResizeableBuffer;
  }
});

// tools/data/node_modules/csv-parse/lib/api/init_state.js
var np, cr, nl, space, tab, init_state;
var init_init_state = __esm({
  "tools/data/node_modules/csv-parse/lib/api/init_state.js"() {
    init_ResizeableBuffer();
    np = 12;
    cr = 13;
    nl = 10;
    space = 32;
    tab = 9;
    init_state = function(options) {
      return {
        bomSkipped: false,
        bufBytesStart: 0,
        castField: options.cast_function,
        commenting: false,
        // Current error encountered by a record
        error: void 0,
        enabled: options.from_line === 1,
        escaping: false,
        escapeIsQuote: Buffer.isBuffer(options.escape) && Buffer.isBuffer(options.quote) && Buffer.compare(options.escape, options.quote) === 0,
        // columns can be `false`, `true`, `Array`
        expectedRecordLength: Array.isArray(options.columns) ? options.columns.length : void 0,
        field: new ResizeableBuffer_default(20),
        firstLineToHeaders: options.cast_first_line_to_header,
        needMoreDataSize: Math.max(
          // Skip if the remaining buffer smaller than comment
          options.comment !== null ? options.comment.length : 0,
          ...options.delimiter.map((delimiter) => delimiter.length),
          // Skip if the remaining buffer can be escape sequence
          options.quote !== null ? options.quote.length : 0
        ),
        previousBuf: void 0,
        quoting: false,
        stop: false,
        rawBuffer: new ResizeableBuffer_default(100),
        record: [],
        recordHasError: false,
        record_length: 0,
        recordDelimiterMaxLength: options.record_delimiter.length === 0 ? 0 : Math.max(...options.record_delimiter.map((v) => v.length)),
        trimChars: [
          Buffer.from(" ", options.encoding)[0],
          Buffer.from("	", options.encoding)[0]
        ],
        wasQuoting: false,
        wasRowDelimiter: false,
        timchars: [
          Buffer.from(Buffer.from([cr], "utf8").toString(), options.encoding),
          Buffer.from(Buffer.from([nl], "utf8").toString(), options.encoding),
          Buffer.from(Buffer.from([np], "utf8").toString(), options.encoding),
          Buffer.from(Buffer.from([space], "utf8").toString(), options.encoding),
          Buffer.from(Buffer.from([tab], "utf8").toString(), options.encoding)
        ]
      };
    };
  }
});

// tools/data/node_modules/csv-parse/lib/utils/underscore.js
var underscore;
var init_underscore = __esm({
  "tools/data/node_modules/csv-parse/lib/utils/underscore.js"() {
    underscore = function(str) {
      return str.replace(/([A-Z])/g, function(_, match) {
        return "_" + match.toLowerCase();
      });
    };
  }
});

// tools/data/node_modules/csv-parse/lib/api/normalize_options.js
var normalize_options;
var init_normalize_options = __esm({
  "tools/data/node_modules/csv-parse/lib/api/normalize_options.js"() {
    init_normalize_columns_array();
    init_CsvError();
    init_underscore();
    normalize_options = function(opts) {
      const options = {};
      for (const opt in opts) {
        options[underscore(opt)] = opts[opt];
      }
      if (options.encoding === void 0 || options.encoding === true) {
        options.encoding = "utf8";
      } else if (options.encoding === null || options.encoding === false) {
        options.encoding = null;
      } else if (typeof options.encoding !== "string" && options.encoding !== null) {
        throw new CsvError(
          "CSV_INVALID_OPTION_ENCODING",
          [
            "Invalid option encoding:",
            "encoding must be a string or null to return a buffer,",
            `got ${JSON.stringify(options.encoding)}`
          ],
          options
        );
      }
      if (options.bom === void 0 || options.bom === null || options.bom === false) {
        options.bom = false;
      } else if (options.bom !== true) {
        throw new CsvError(
          "CSV_INVALID_OPTION_BOM",
          [
            "Invalid option bom:",
            "bom must be true,",
            `got ${JSON.stringify(options.bom)}`
          ],
          options
        );
      }
      options.cast_function = null;
      if (options.cast === void 0 || options.cast === null || options.cast === false || options.cast === "") {
        options.cast = void 0;
      } else if (typeof options.cast === "function") {
        options.cast_function = options.cast;
        options.cast = true;
      } else if (options.cast !== true) {
        throw new CsvError(
          "CSV_INVALID_OPTION_CAST",
          [
            "Invalid option cast:",
            "cast must be true or a function,",
            `got ${JSON.stringify(options.cast)}`
          ],
          options
        );
      }
      if (options.cast_date === void 0 || options.cast_date === null || options.cast_date === false || options.cast_date === "") {
        options.cast_date = false;
      } else if (options.cast_date === true) {
        options.cast_date = function(value) {
          const date = Date.parse(value);
          return !isNaN(date) ? new Date(date) : value;
        };
      } else if (typeof options.cast_date !== "function") {
        throw new CsvError(
          "CSV_INVALID_OPTION_CAST_DATE",
          [
            "Invalid option cast_date:",
            "cast_date must be true or a function,",
            `got ${JSON.stringify(options.cast_date)}`
          ],
          options
        );
      }
      options.cast_first_line_to_header = null;
      if (options.columns === true) {
        options.cast_first_line_to_header = void 0;
      } else if (typeof options.columns === "function") {
        options.cast_first_line_to_header = options.columns;
        options.columns = true;
      } else if (Array.isArray(options.columns)) {
        options.columns = normalize_columns_array(options.columns);
      } else if (options.columns === void 0 || options.columns === null || options.columns === false) {
        options.columns = false;
      } else {
        throw new CsvError(
          "CSV_INVALID_OPTION_COLUMNS",
          [
            "Invalid option columns:",
            "expect an array, a function or true,",
            `got ${JSON.stringify(options.columns)}`
          ],
          options
        );
      }
      if (options.group_columns_by_name === void 0 || options.group_columns_by_name === null || options.group_columns_by_name === false) {
        options.group_columns_by_name = false;
      } else if (options.group_columns_by_name !== true) {
        throw new CsvError(
          "CSV_INVALID_OPTION_GROUP_COLUMNS_BY_NAME",
          [
            "Invalid option group_columns_by_name:",
            "expect an boolean,",
            `got ${JSON.stringify(options.group_columns_by_name)}`
          ],
          options
        );
      } else if (options.columns === false) {
        throw new CsvError(
          "CSV_INVALID_OPTION_GROUP_COLUMNS_BY_NAME",
          [
            "Invalid option group_columns_by_name:",
            "the `columns` mode must be activated."
          ],
          options
        );
      }
      if (options.comment === void 0 || options.comment === null || options.comment === false || options.comment === "") {
        options.comment = null;
      } else {
        if (typeof options.comment === "string") {
          options.comment = Buffer.from(options.comment, options.encoding);
        }
        if (!Buffer.isBuffer(options.comment)) {
          throw new CsvError(
            "CSV_INVALID_OPTION_COMMENT",
            [
              "Invalid option comment:",
              "comment must be a buffer or a string,",
              `got ${JSON.stringify(options.comment)}`
            ],
            options
          );
        }
      }
      if (options.comment_no_infix === void 0 || options.comment_no_infix === null || options.comment_no_infix === false) {
        options.comment_no_infix = false;
      } else if (options.comment_no_infix !== true) {
        throw new CsvError(
          "CSV_INVALID_OPTION_COMMENT",
          [
            "Invalid option comment_no_infix:",
            "value must be a boolean,",
            `got ${JSON.stringify(options.comment_no_infix)}`
          ],
          options
        );
      }
      const delimiter_json = JSON.stringify(options.delimiter);
      if (!Array.isArray(options.delimiter))
        options.delimiter = [options.delimiter];
      if (options.delimiter.length === 0) {
        throw new CsvError(
          "CSV_INVALID_OPTION_DELIMITER",
          [
            "Invalid option delimiter:",
            "delimiter must be a non empty string or buffer or array of string|buffer,",
            `got ${delimiter_json}`
          ],
          options
        );
      }
      options.delimiter = options.delimiter.map(function(delimiter) {
        if (delimiter === void 0 || delimiter === null || delimiter === false) {
          return Buffer.from(",", options.encoding);
        }
        if (typeof delimiter === "string") {
          delimiter = Buffer.from(delimiter, options.encoding);
        }
        if (!Buffer.isBuffer(delimiter) || delimiter.length === 0) {
          throw new CsvError(
            "CSV_INVALID_OPTION_DELIMITER",
            [
              "Invalid option delimiter:",
              "delimiter must be a non empty string or buffer or array of string|buffer,",
              `got ${delimiter_json}`
            ],
            options
          );
        }
        return delimiter;
      });
      if (options.escape === void 0 || options.escape === true) {
        options.escape = Buffer.from('"', options.encoding);
      } else if (typeof options.escape === "string") {
        options.escape = Buffer.from(options.escape, options.encoding);
      } else if (options.escape === null || options.escape === false) {
        options.escape = null;
      }
      if (options.escape !== null) {
        if (!Buffer.isBuffer(options.escape)) {
          throw new Error(
            `Invalid Option: escape must be a buffer, a string or a boolean, got ${JSON.stringify(options.escape)}`
          );
        }
      }
      if (options.from === void 0 || options.from === null) {
        options.from = 1;
      } else {
        if (typeof options.from === "string" && /\d+/.test(options.from)) {
          options.from = parseInt(options.from);
        }
        if (Number.isInteger(options.from)) {
          if (options.from < 0) {
            throw new Error(
              `Invalid Option: from must be a positive integer, got ${JSON.stringify(opts.from)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: from must be an integer, got ${JSON.stringify(options.from)}`
          );
        }
      }
      if (options.from_line === void 0 || options.from_line === null) {
        options.from_line = 1;
      } else {
        if (typeof options.from_line === "string" && /\d+/.test(options.from_line)) {
          options.from_line = parseInt(options.from_line);
        }
        if (Number.isInteger(options.from_line)) {
          if (options.from_line <= 0) {
            throw new Error(
              `Invalid Option: from_line must be a positive integer greater than 0, got ${JSON.stringify(opts.from_line)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: from_line must be an integer, got ${JSON.stringify(opts.from_line)}`
          );
        }
      }
      if (options.ignore_last_delimiters === void 0 || options.ignore_last_delimiters === null) {
        options.ignore_last_delimiters = false;
      } else if (typeof options.ignore_last_delimiters === "number") {
        options.ignore_last_delimiters = Math.floor(options.ignore_last_delimiters);
        if (options.ignore_last_delimiters === 0) {
          options.ignore_last_delimiters = false;
        }
      } else if (typeof options.ignore_last_delimiters !== "boolean") {
        throw new CsvError(
          "CSV_INVALID_OPTION_IGNORE_LAST_DELIMITERS",
          [
            "Invalid option `ignore_last_delimiters`:",
            "the value must be a boolean value or an integer,",
            `got ${JSON.stringify(options.ignore_last_delimiters)}`
          ],
          options
        );
      }
      if (options.ignore_last_delimiters === true && options.columns === false) {
        throw new CsvError(
          "CSV_IGNORE_LAST_DELIMITERS_REQUIRES_COLUMNS",
          [
            "The option `ignore_last_delimiters`",
            "requires the activation of the `columns` option"
          ],
          options
        );
      }
      if (options.info === void 0 || options.info === null || options.info === false) {
        options.info = false;
      } else if (options.info !== true) {
        throw new Error(
          `Invalid Option: info must be true, got ${JSON.stringify(options.info)}`
        );
      }
      if (options.max_record_size === void 0 || options.max_record_size === null || options.max_record_size === false) {
        options.max_record_size = 0;
      } else if (Number.isInteger(options.max_record_size) && options.max_record_size >= 0) {
      } else if (typeof options.max_record_size === "string" && /\d+/.test(options.max_record_size)) {
        options.max_record_size = parseInt(options.max_record_size);
      } else {
        throw new Error(
          `Invalid Option: max_record_size must be a positive integer, got ${JSON.stringify(options.max_record_size)}`
        );
      }
      if (options.objname === void 0 || options.objname === null || options.objname === false) {
        options.objname = void 0;
      } else if (Buffer.isBuffer(options.objname)) {
        if (options.objname.length === 0) {
          throw new Error(`Invalid Option: objname must be a non empty buffer`);
        }
        if (options.encoding === null) {
        } else {
          options.objname = options.objname.toString(options.encoding);
        }
      } else if (typeof options.objname === "string") {
        if (options.objname.length === 0) {
          throw new Error(`Invalid Option: objname must be a non empty string`);
        }
      } else if (typeof options.objname === "number") {
      } else {
        throw new Error(
          `Invalid Option: objname must be a string or a buffer, got ${options.objname}`
        );
      }
      if (options.objname !== void 0) {
        if (typeof options.objname === "number") {
          if (options.columns !== false) {
            throw Error(
              "Invalid Option: objname index cannot be combined with columns or be defined as a field"
            );
          }
        } else {
          if (options.columns === false) {
            throw Error(
              "Invalid Option: objname field must be combined with columns or be defined as an index"
            );
          }
        }
      }
      if (options.on_record === void 0 || options.on_record === null) {
        options.on_record = void 0;
      } else if (typeof options.on_record !== "function") {
        throw new CsvError(
          "CSV_INVALID_OPTION_ON_RECORD",
          [
            "Invalid option `on_record`:",
            "expect a function,",
            `got ${JSON.stringify(options.on_record)}`
          ],
          options
        );
      }
      if (options.on_skip !== void 0 && options.on_skip !== null && typeof options.on_skip !== "function") {
        throw new Error(
          `Invalid Option: on_skip must be a function, got ${JSON.stringify(options.on_skip)}`
        );
      }
      if (options.quote === null || options.quote === false || options.quote === "") {
        options.quote = null;
      } else {
        if (options.quote === void 0 || options.quote === true) {
          options.quote = Buffer.from('"', options.encoding);
        } else if (typeof options.quote === "string") {
          options.quote = Buffer.from(options.quote, options.encoding);
        }
        if (!Buffer.isBuffer(options.quote)) {
          throw new Error(
            `Invalid Option: quote must be a buffer or a string, got ${JSON.stringify(options.quote)}`
          );
        }
      }
      if (options.raw === void 0 || options.raw === null || options.raw === false) {
        options.raw = false;
      } else if (options.raw !== true) {
        throw new Error(
          `Invalid Option: raw must be true, got ${JSON.stringify(options.raw)}`
        );
      }
      if (options.record_delimiter === void 0) {
        options.record_delimiter = [];
      } else if (typeof options.record_delimiter === "string" || Buffer.isBuffer(options.record_delimiter)) {
        if (options.record_delimiter.length === 0) {
          throw new CsvError(
            "CSV_INVALID_OPTION_RECORD_DELIMITER",
            [
              "Invalid option `record_delimiter`:",
              "value must be a non empty string or buffer,",
              `got ${JSON.stringify(options.record_delimiter)}`
            ],
            options
          );
        }
        options.record_delimiter = [options.record_delimiter];
      } else if (!Array.isArray(options.record_delimiter)) {
        throw new CsvError(
          "CSV_INVALID_OPTION_RECORD_DELIMITER",
          [
            "Invalid option `record_delimiter`:",
            "value must be a string, a buffer or array of string|buffer,",
            `got ${JSON.stringify(options.record_delimiter)}`
          ],
          options
        );
      }
      options.record_delimiter = options.record_delimiter.map(function(rd, i) {
        if (typeof rd !== "string" && !Buffer.isBuffer(rd)) {
          throw new CsvError(
            "CSV_INVALID_OPTION_RECORD_DELIMITER",
            [
              "Invalid option `record_delimiter`:",
              "value must be a string, a buffer or array of string|buffer",
              `at index ${i},`,
              `got ${JSON.stringify(rd)}`
            ],
            options
          );
        } else if (rd.length === 0) {
          throw new CsvError(
            "CSV_INVALID_OPTION_RECORD_DELIMITER",
            [
              "Invalid option `record_delimiter`:",
              "value must be a non empty string or buffer",
              `at index ${i},`,
              `got ${JSON.stringify(rd)}`
            ],
            options
          );
        }
        if (typeof rd === "string") {
          rd = Buffer.from(rd, options.encoding);
        }
        return rd;
      });
      if (typeof options.relax_column_count === "boolean") {
      } else if (options.relax_column_count === void 0 || options.relax_column_count === null) {
        options.relax_column_count = false;
      } else {
        throw new Error(
          `Invalid Option: relax_column_count must be a boolean, got ${JSON.stringify(options.relax_column_count)}`
        );
      }
      if (typeof options.relax_column_count_less === "boolean") {
      } else if (options.relax_column_count_less === void 0 || options.relax_column_count_less === null) {
        options.relax_column_count_less = false;
      } else {
        throw new Error(
          `Invalid Option: relax_column_count_less must be a boolean, got ${JSON.stringify(options.relax_column_count_less)}`
        );
      }
      if (typeof options.relax_column_count_more === "boolean") {
      } else if (options.relax_column_count_more === void 0 || options.relax_column_count_more === null) {
        options.relax_column_count_more = false;
      } else {
        throw new Error(
          `Invalid Option: relax_column_count_more must be a boolean, got ${JSON.stringify(options.relax_column_count_more)}`
        );
      }
      if (typeof options.relax_quotes === "boolean") {
      } else if (options.relax_quotes === void 0 || options.relax_quotes === null) {
        options.relax_quotes = false;
      } else {
        throw new Error(
          `Invalid Option: relax_quotes must be a boolean, got ${JSON.stringify(options.relax_quotes)}`
        );
      }
      if (typeof options.skip_empty_lines === "boolean") {
      } else if (options.skip_empty_lines === void 0 || options.skip_empty_lines === null) {
        options.skip_empty_lines = false;
      } else {
        throw new Error(
          `Invalid Option: skip_empty_lines must be a boolean, got ${JSON.stringify(options.skip_empty_lines)}`
        );
      }
      if (typeof options.skip_records_with_empty_values === "boolean") {
      } else if (options.skip_records_with_empty_values === void 0 || options.skip_records_with_empty_values === null) {
        options.skip_records_with_empty_values = false;
      } else {
        throw new Error(
          `Invalid Option: skip_records_with_empty_values must be a boolean, got ${JSON.stringify(options.skip_records_with_empty_values)}`
        );
      }
      if (typeof options.skip_records_with_error === "boolean") {
      } else if (options.skip_records_with_error === void 0 || options.skip_records_with_error === null) {
        options.skip_records_with_error = false;
      } else {
        throw new Error(
          `Invalid Option: skip_records_with_error must be a boolean, got ${JSON.stringify(options.skip_records_with_error)}`
        );
      }
      if (options.rtrim === void 0 || options.rtrim === null || options.rtrim === false) {
        options.rtrim = false;
      } else if (options.rtrim !== true) {
        throw new Error(
          `Invalid Option: rtrim must be a boolean, got ${JSON.stringify(options.rtrim)}`
        );
      }
      if (options.ltrim === void 0 || options.ltrim === null || options.ltrim === false) {
        options.ltrim = false;
      } else if (options.ltrim !== true) {
        throw new Error(
          `Invalid Option: ltrim must be a boolean, got ${JSON.stringify(options.ltrim)}`
        );
      }
      if (options.trim === void 0 || options.trim === null || options.trim === false) {
        options.trim = false;
      } else if (options.trim !== true) {
        throw new Error(
          `Invalid Option: trim must be a boolean, got ${JSON.stringify(options.trim)}`
        );
      }
      if (options.trim === true && opts.ltrim !== false) {
        options.ltrim = true;
      } else if (options.ltrim !== true) {
        options.ltrim = false;
      }
      if (options.trim === true && opts.rtrim !== false) {
        options.rtrim = true;
      } else if (options.rtrim !== true) {
        options.rtrim = false;
      }
      if (options.to === void 0 || options.to === null) {
        options.to = -1;
      } else {
        if (typeof options.to === "string" && /\d+/.test(options.to)) {
          options.to = parseInt(options.to);
        }
        if (Number.isInteger(options.to)) {
          if (options.to <= 0) {
            throw new Error(
              `Invalid Option: to must be a positive integer greater than 0, got ${JSON.stringify(opts.to)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: to must be an integer, got ${JSON.stringify(opts.to)}`
          );
        }
      }
      if (options.to_line === void 0 || options.to_line === null) {
        options.to_line = -1;
      } else {
        if (typeof options.to_line === "string" && /\d+/.test(options.to_line)) {
          options.to_line = parseInt(options.to_line);
        }
        if (Number.isInteger(options.to_line)) {
          if (options.to_line <= 0) {
            throw new Error(
              `Invalid Option: to_line must be a positive integer greater than 0, got ${JSON.stringify(opts.to_line)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: to_line must be an integer, got ${JSON.stringify(opts.to_line)}`
          );
        }
      }
      return options;
    };
  }
});

// tools/data/node_modules/csv-parse/lib/api/index.js
var isRecordEmpty, cr2, nl2, boms, transform;
var init_api = __esm({
  "tools/data/node_modules/csv-parse/lib/api/index.js"() {
    init_normalize_columns_array();
    init_init_state();
    init_normalize_options();
    init_CsvError();
    isRecordEmpty = function(record) {
      return record.every(
        (field) => field == null || field.toString && field.toString().trim() === ""
      );
    };
    cr2 = 13;
    nl2 = 10;
    boms = {
      // Note, the following are equals:
      // Buffer.from("\ufeff")
      // Buffer.from([239, 187, 191])
      // Buffer.from('EFBBBF', 'hex')
      utf8: Buffer.from([239, 187, 191]),
      // Note, the following are equals:
      // Buffer.from "\ufeff", 'utf16le
      // Buffer.from([255, 254])
      utf16le: Buffer.from([255, 254])
    };
    transform = function(original_options = {}) {
      const info = {
        bytes: 0,
        comment_lines: 0,
        empty_lines: 0,
        invalid_field_length: 0,
        lines: 1,
        records: 0
      };
      const options = normalize_options(original_options);
      return {
        info,
        original_options,
        options,
        state: init_state(options),
        __needMoreData: function(i, bufLen, end) {
          if (end) return false;
          const { encoding, escape, quote } = this.options;
          const { quoting, needMoreDataSize, recordDelimiterMaxLength } = this.state;
          const numOfCharLeft = bufLen - i - 1;
          const requiredLength = Math.max(
            needMoreDataSize,
            // Skip if the remaining buffer smaller than record delimiter
            // If "record_delimiter" is yet to be discovered:
            // 1. It is equals to `[]` and "recordDelimiterMaxLength" equals `0`
            // 2. We set the length to windows line ending in the current encoding
            // Note, that encoding is known from user or bom discovery at that point
            // recordDelimiterMaxLength,
            recordDelimiterMaxLength === 0 ? Buffer.from("\r\n", encoding).length : recordDelimiterMaxLength,
            // Skip if remaining buffer can be an escaped quote
            quoting ? (escape === null ? 0 : escape.length) + quote.length : 0,
            // Skip if remaining buffer can be record delimiter following the closing quote
            quoting ? quote.length + recordDelimiterMaxLength : 0
          );
          return numOfCharLeft < requiredLength;
        },
        // Central parser implementation
        parse: function(nextBuf, end, push, close) {
          const {
            bom,
            comment_no_infix,
            encoding,
            from_line,
            ltrim,
            max_record_size,
            raw,
            relax_quotes,
            rtrim,
            skip_empty_lines,
            to,
            to_line
          } = this.options;
          let { comment, escape, quote, record_delimiter } = this.options;
          const { bomSkipped, previousBuf, rawBuffer, escapeIsQuote } = this.state;
          let buf;
          if (previousBuf === void 0) {
            if (nextBuf === void 0) {
              close();
              return;
            } else {
              buf = nextBuf;
            }
          } else if (previousBuf !== void 0 && nextBuf === void 0) {
            buf = previousBuf;
          } else {
            buf = Buffer.concat([previousBuf, nextBuf]);
          }
          if (bomSkipped === false) {
            if (bom === false) {
              this.state.bomSkipped = true;
            } else if (buf.length < 3) {
              if (end === false) {
                this.state.previousBuf = buf;
                return;
              }
            } else {
              for (const encoding2 in boms) {
                if (boms[encoding2].compare(buf, 0, boms[encoding2].length) === 0) {
                  const bomLength = boms[encoding2].length;
                  this.state.bufBytesStart += bomLength;
                  buf = buf.slice(bomLength);
                  this.options = normalize_options({
                    ...this.original_options,
                    encoding: encoding2
                  });
                  ({ comment, escape, quote } = this.options);
                  break;
                }
              }
              this.state.bomSkipped = true;
            }
          }
          const bufLen = buf.length;
          let pos;
          for (pos = 0; pos < bufLen; pos++) {
            if (this.__needMoreData(pos, bufLen, end)) {
              break;
            }
            if (this.state.wasRowDelimiter === true) {
              this.info.lines++;
              this.state.wasRowDelimiter = false;
            }
            if (to_line !== -1 && this.info.lines > to_line) {
              this.state.stop = true;
              close();
              return;
            }
            if (this.state.quoting === false && record_delimiter.length === 0) {
              const record_delimiterCount = this.__autoDiscoverRecordDelimiter(
                buf,
                pos
              );
              if (record_delimiterCount) {
                record_delimiter = this.options.record_delimiter;
              }
            }
            const chr = buf[pos];
            if (raw === true) {
              rawBuffer.append(chr);
            }
            if ((chr === cr2 || chr === nl2) && this.state.wasRowDelimiter === false) {
              this.state.wasRowDelimiter = true;
            }
            if (this.state.escaping === true) {
              this.state.escaping = false;
            } else {
              if (escape !== null && this.state.quoting === true && this.__isEscape(buf, pos, chr) && pos + escape.length < bufLen) {
                if (escapeIsQuote) {
                  if (this.__isQuote(buf, pos + escape.length)) {
                    this.state.escaping = true;
                    pos += escape.length - 1;
                    continue;
                  }
                } else {
                  this.state.escaping = true;
                  pos += escape.length - 1;
                  continue;
                }
              }
              if (this.state.commenting === false && this.__isQuote(buf, pos)) {
                if (this.state.quoting === true) {
                  const nextChr = buf[pos + quote.length];
                  const isNextChrTrimable = rtrim && this.__isCharTrimable(buf, pos + quote.length);
                  const isNextChrComment = comment !== null && this.__compareBytes(comment, buf, pos + quote.length, nextChr);
                  const isNextChrDelimiter = this.__isDelimiter(
                    buf,
                    pos + quote.length,
                    nextChr
                  );
                  const isNextChrRecordDelimiter = record_delimiter.length === 0 ? this.__autoDiscoverRecordDelimiter(buf, pos + quote.length) : this.__isRecordDelimiter(nextChr, buf, pos + quote.length);
                  if (escape !== null && this.__isEscape(buf, pos, chr) && this.__isQuote(buf, pos + escape.length)) {
                    pos += escape.length - 1;
                  } else if (!nextChr || isNextChrDelimiter || isNextChrRecordDelimiter || isNextChrComment || isNextChrTrimable) {
                    this.state.quoting = false;
                    this.state.wasQuoting = true;
                    pos += quote.length - 1;
                    continue;
                  } else if (relax_quotes === false) {
                    const err = this.__error(
                      new CsvError(
                        "CSV_INVALID_CLOSING_QUOTE",
                        [
                          "Invalid Closing Quote:",
                          `got "${String.fromCharCode(nextChr)}"`,
                          `at line ${this.info.lines}`,
                          "instead of delimiter, record delimiter, trimable character",
                          "(if activated) or comment"
                        ],
                        this.options,
                        this.__infoField()
                      )
                    );
                    if (err !== void 0) return err;
                  } else {
                    this.state.quoting = false;
                    this.state.wasQuoting = true;
                    this.state.field.prepend(quote);
                    pos += quote.length - 1;
                  }
                } else {
                  if (this.state.field.length !== 0) {
                    if (relax_quotes === false) {
                      const info2 = this.__infoField();
                      const bom2 = Object.keys(boms).map(
                        (b) => boms[b].equals(this.state.field.toString()) ? b : false
                      ).filter(Boolean)[0];
                      const err = this.__error(
                        new CsvError(
                          "INVALID_OPENING_QUOTE",
                          [
                            "Invalid Opening Quote:",
                            `a quote is found on field ${JSON.stringify(info2.column)} at line ${info2.lines}, value is ${JSON.stringify(this.state.field.toString(encoding))}`,
                            bom2 ? `(${bom2} bom)` : void 0
                          ],
                          this.options,
                          info2,
                          {
                            field: this.state.field
                          }
                        )
                      );
                      if (err !== void 0) return err;
                    }
                  } else {
                    this.state.quoting = true;
                    pos += quote.length - 1;
                    continue;
                  }
                }
              }
              if (this.state.quoting === false) {
                const recordDelimiterLength = this.__isRecordDelimiter(
                  chr,
                  buf,
                  pos
                );
                if (recordDelimiterLength !== 0) {
                  const skipCommentLine = this.state.commenting && this.state.wasQuoting === false && this.state.record.length === 0 && this.state.field.length === 0;
                  if (skipCommentLine) {
                    this.info.comment_lines++;
                  } else {
                    if (this.state.enabled === false && this.info.lines + (this.state.wasRowDelimiter === true ? 1 : 0) >= from_line) {
                      this.state.enabled = true;
                      this.__resetField();
                      this.__resetRecord();
                      pos += recordDelimiterLength - 1;
                      continue;
                    }
                    if (skip_empty_lines === true && this.state.wasQuoting === false && this.state.record.length === 0 && this.state.field.length === 0) {
                      this.info.empty_lines++;
                      pos += recordDelimiterLength - 1;
                      continue;
                    }
                    this.info.bytes = this.state.bufBytesStart + pos;
                    const errField = this.__onField();
                    if (errField !== void 0) return errField;
                    this.info.bytes = this.state.bufBytesStart + pos + recordDelimiterLength;
                    const errRecord = this.__onRecord(push);
                    if (errRecord !== void 0) return errRecord;
                    if (to !== -1 && this.info.records >= to) {
                      this.state.stop = true;
                      close();
                      return;
                    }
                  }
                  this.state.commenting = false;
                  pos += recordDelimiterLength - 1;
                  continue;
                }
                if (this.state.commenting) {
                  continue;
                }
                if (comment !== null && (comment_no_infix === false || this.state.record.length === 0 && this.state.field.length === 0)) {
                  const commentCount = this.__compareBytes(comment, buf, pos, chr);
                  if (commentCount !== 0) {
                    this.state.commenting = true;
                    continue;
                  }
                }
                const delimiterLength = this.__isDelimiter(buf, pos, chr);
                if (delimiterLength !== 0) {
                  this.info.bytes = this.state.bufBytesStart + pos;
                  const errField = this.__onField();
                  if (errField !== void 0) return errField;
                  pos += delimiterLength - 1;
                  continue;
                }
              }
            }
            if (this.state.commenting === false) {
              if (max_record_size !== 0 && this.state.record_length + this.state.field.length > max_record_size) {
                return this.__error(
                  new CsvError(
                    "CSV_MAX_RECORD_SIZE",
                    [
                      "Max Record Size:",
                      "record exceed the maximum number of tolerated bytes",
                      `of ${max_record_size}`,
                      `at line ${this.info.lines}`
                    ],
                    this.options,
                    this.__infoField()
                  )
                );
              }
            }
            const lappend = ltrim === false || this.state.quoting === true || this.state.field.length !== 0 || !this.__isCharTrimable(buf, pos);
            const rappend = rtrim === false || this.state.wasQuoting === false;
            if (lappend === true && rappend === true) {
              this.state.field.append(chr);
            } else if (rtrim === true && !this.__isCharTrimable(buf, pos)) {
              return this.__error(
                new CsvError(
                  "CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE",
                  [
                    "Invalid Closing Quote:",
                    "found non trimable byte after quote",
                    `at line ${this.info.lines}`
                  ],
                  this.options,
                  this.__infoField()
                )
              );
            } else {
              if (lappend === false) {
                pos += this.__isCharTrimable(buf, pos) - 1;
              }
              continue;
            }
          }
          if (end === true) {
            if (this.state.quoting === true) {
              const err = this.__error(
                new CsvError(
                  "CSV_QUOTE_NOT_CLOSED",
                  [
                    "Quote Not Closed:",
                    `the parsing is finished with an opening quote at line ${this.info.lines}`
                  ],
                  this.options,
                  this.__infoField()
                )
              );
              if (err !== void 0) return err;
            } else {
              if (this.state.wasQuoting === true || this.state.record.length !== 0 || this.state.field.length !== 0) {
                this.info.bytes = this.state.bufBytesStart + pos;
                const errField = this.__onField();
                if (errField !== void 0) return errField;
                const errRecord = this.__onRecord(push);
                if (errRecord !== void 0) return errRecord;
              } else if (this.state.wasRowDelimiter === true) {
                this.info.empty_lines++;
              } else if (this.state.commenting === true) {
                this.info.comment_lines++;
              }
            }
          } else {
            this.state.bufBytesStart += pos;
            this.state.previousBuf = buf.slice(pos);
          }
          if (this.state.wasRowDelimiter === true) {
            this.info.lines++;
            this.state.wasRowDelimiter = false;
          }
        },
        __onRecord: function(push) {
          const {
            columns,
            group_columns_by_name,
            encoding,
            info: info2,
            from: from2,
            relax_column_count,
            relax_column_count_less,
            relax_column_count_more,
            raw,
            skip_records_with_empty_values
          } = this.options;
          const { enabled, record } = this.state;
          if (enabled === false) {
            return this.__resetRecord();
          }
          const recordLength = record.length;
          if (columns === true) {
            if (skip_records_with_empty_values === true && isRecordEmpty(record)) {
              this.__resetRecord();
              return;
            }
            return this.__firstLineToColumns(record);
          }
          if (columns === false && this.info.records === 0) {
            this.state.expectedRecordLength = recordLength;
          }
          if (recordLength !== this.state.expectedRecordLength) {
            const err = columns === false ? new CsvError(
              "CSV_RECORD_INCONSISTENT_FIELDS_LENGTH",
              [
                "Invalid Record Length:",
                `expect ${this.state.expectedRecordLength},`,
                `got ${recordLength} on line ${this.info.lines}`
              ],
              this.options,
              this.__infoField(),
              {
                record
              }
            ) : new CsvError(
              "CSV_RECORD_INCONSISTENT_COLUMNS",
              [
                "Invalid Record Length:",
                `columns length is ${columns.length},`,
                // rename columns
                `got ${recordLength} on line ${this.info.lines}`
              ],
              this.options,
              this.__infoField(),
              {
                record
              }
            );
            if (relax_column_count === true || relax_column_count_less === true && recordLength < this.state.expectedRecordLength || relax_column_count_more === true && recordLength > this.state.expectedRecordLength) {
              this.info.invalid_field_length++;
              this.state.error = err;
            } else {
              const finalErr = this.__error(err);
              if (finalErr) return finalErr;
            }
          }
          if (skip_records_with_empty_values === true && isRecordEmpty(record)) {
            this.__resetRecord();
            return;
          }
          if (this.state.recordHasError === true) {
            this.__resetRecord();
            this.state.recordHasError = false;
            return;
          }
          this.info.records++;
          if (from2 === 1 || this.info.records >= from2) {
            const { objname } = this.options;
            if (columns !== false) {
              const obj = {};
              for (let i = 0, l = record.length; i < l; i++) {
                if (columns[i] === void 0 || columns[i].disabled) continue;
                if (group_columns_by_name === true && obj[columns[i].name] !== void 0) {
                  if (Array.isArray(obj[columns[i].name])) {
                    obj[columns[i].name] = obj[columns[i].name].concat(record[i]);
                  } else {
                    obj[columns[i].name] = [obj[columns[i].name], record[i]];
                  }
                } else {
                  obj[columns[i].name] = record[i];
                }
              }
              if (raw === true || info2 === true) {
                const extRecord = Object.assign(
                  { record: obj },
                  raw === true ? { raw: this.state.rawBuffer.toString(encoding) } : {},
                  info2 === true ? { info: this.__infoRecord() } : {}
                );
                const err = this.__push(
                  objname === void 0 ? extRecord : [obj[objname], extRecord],
                  push
                );
                if (err) {
                  return err;
                }
              } else {
                const err = this.__push(
                  objname === void 0 ? obj : [obj[objname], obj],
                  push
                );
                if (err) {
                  return err;
                }
              }
            } else {
              if (raw === true || info2 === true) {
                const extRecord = Object.assign(
                  { record },
                  raw === true ? { raw: this.state.rawBuffer.toString(encoding) } : {},
                  info2 === true ? { info: this.__infoRecord() } : {}
                );
                const err = this.__push(
                  objname === void 0 ? extRecord : [record[objname], extRecord],
                  push
                );
                if (err) {
                  return err;
                }
              } else {
                const err = this.__push(
                  objname === void 0 ? record : [record[objname], record],
                  push
                );
                if (err) {
                  return err;
                }
              }
            }
          }
          this.__resetRecord();
        },
        __firstLineToColumns: function(record) {
          const { firstLineToHeaders } = this.state;
          try {
            const headers = firstLineToHeaders === void 0 ? record : firstLineToHeaders.call(null, record);
            if (!Array.isArray(headers)) {
              return this.__error(
                new CsvError(
                  "CSV_INVALID_COLUMN_MAPPING",
                  [
                    "Invalid Column Mapping:",
                    "expect an array from column function,",
                    `got ${JSON.stringify(headers)}`
                  ],
                  this.options,
                  this.__infoField(),
                  {
                    headers
                  }
                )
              );
            }
            const normalizedHeaders = normalize_columns_array(headers);
            this.state.expectedRecordLength = normalizedHeaders.length;
            this.options.columns = normalizedHeaders;
            this.__resetRecord();
            return;
          } catch (err) {
            return err;
          }
        },
        __resetRecord: function() {
          if (this.options.raw === true) {
            this.state.rawBuffer.reset();
          }
          this.state.error = void 0;
          this.state.record = [];
          this.state.record_length = 0;
        },
        __onField: function() {
          const { cast, encoding, rtrim, max_record_size } = this.options;
          const { enabled, wasQuoting } = this.state;
          if (enabled === false) {
            return this.__resetField();
          }
          let field = this.state.field.toString(encoding);
          if (rtrim === true && wasQuoting === false) {
            field = field.trimRight();
          }
          if (cast === true) {
            const [err, f] = this.__cast(field);
            if (err !== void 0) return err;
            field = f;
          }
          this.state.record.push(field);
          if (max_record_size !== 0 && typeof field === "string") {
            this.state.record_length += field.length;
          }
          this.__resetField();
        },
        __resetField: function() {
          this.state.field.reset();
          this.state.wasQuoting = false;
        },
        __push: function(record, push) {
          const { on_record } = this.options;
          if (on_record !== void 0) {
            const info2 = this.__infoRecord();
            try {
              record = on_record.call(null, record, info2);
            } catch (err) {
              return err;
            }
            if (record === void 0 || record === null) {
              return;
            }
          }
          push(record);
        },
        // Return a tuple with the error and the casted value
        __cast: function(field) {
          const { columns, relax_column_count } = this.options;
          const isColumns = Array.isArray(columns);
          if (isColumns === true && relax_column_count && this.options.columns.length <= this.state.record.length) {
            return [void 0, void 0];
          }
          if (this.state.castField !== null) {
            try {
              const info2 = this.__infoField();
              return [void 0, this.state.castField.call(null, field, info2)];
            } catch (err) {
              return [err];
            }
          }
          if (this.__isFloat(field)) {
            return [void 0, parseFloat(field)];
          } else if (this.options.cast_date !== false) {
            const info2 = this.__infoField();
            return [void 0, this.options.cast_date.call(null, field, info2)];
          }
          return [void 0, field];
        },
        // Helper to test if a character is a space or a line delimiter
        __isCharTrimable: function(buf, pos) {
          const isTrim = (buf2, pos2) => {
            const { timchars } = this.state;
            loop1: for (let i = 0; i < timchars.length; i++) {
              const timchar = timchars[i];
              for (let j = 0; j < timchar.length; j++) {
                if (timchar[j] !== buf2[pos2 + j]) continue loop1;
              }
              return timchar.length;
            }
            return 0;
          };
          return isTrim(buf, pos);
        },
        // Keep it in case we implement the `cast_int` option
        // __isInt(value){
        //   // return Number.isInteger(parseInt(value))
        //   // return !isNaN( parseInt( obj ) );
        //   return /^(\-|\+)?[1-9][0-9]*$/.test(value)
        // }
        __isFloat: function(value) {
          return value - parseFloat(value) + 1 >= 0;
        },
        __compareBytes: function(sourceBuf, targetBuf, targetPos, firstByte) {
          if (sourceBuf[0] !== firstByte) return 0;
          const sourceLength = sourceBuf.length;
          for (let i = 1; i < sourceLength; i++) {
            if (sourceBuf[i] !== targetBuf[targetPos + i]) return 0;
          }
          return sourceLength;
        },
        __isDelimiter: function(buf, pos, chr) {
          const { delimiter, ignore_last_delimiters } = this.options;
          if (ignore_last_delimiters === true && this.state.record.length === this.options.columns.length - 1) {
            return 0;
          } else if (ignore_last_delimiters !== false && typeof ignore_last_delimiters === "number" && this.state.record.length === ignore_last_delimiters - 1) {
            return 0;
          }
          loop1: for (let i = 0; i < delimiter.length; i++) {
            const del = delimiter[i];
            if (del[0] === chr) {
              for (let j = 1; j < del.length; j++) {
                if (del[j] !== buf[pos + j]) continue loop1;
              }
              return del.length;
            }
          }
          return 0;
        },
        __isRecordDelimiter: function(chr, buf, pos) {
          const { record_delimiter } = this.options;
          const recordDelimiterLength = record_delimiter.length;
          loop1: for (let i = 0; i < recordDelimiterLength; i++) {
            const rd = record_delimiter[i];
            const rdLength = rd.length;
            if (rd[0] !== chr) {
              continue;
            }
            for (let j = 1; j < rdLength; j++) {
              if (rd[j] !== buf[pos + j]) {
                continue loop1;
              }
            }
            return rd.length;
          }
          return 0;
        },
        __isEscape: function(buf, pos, chr) {
          const { escape } = this.options;
          if (escape === null) return false;
          const l = escape.length;
          if (escape[0] === chr) {
            for (let i = 0; i < l; i++) {
              if (escape[i] !== buf[pos + i]) {
                return false;
              }
            }
            return true;
          }
          return false;
        },
        __isQuote: function(buf, pos) {
          const { quote } = this.options;
          if (quote === null) return false;
          const l = quote.length;
          for (let i = 0; i < l; i++) {
            if (quote[i] !== buf[pos + i]) {
              return false;
            }
          }
          return true;
        },
        __autoDiscoverRecordDelimiter: function(buf, pos) {
          const { encoding } = this.options;
          const rds = [
            // Important, the windows line ending must be before mac os 9
            Buffer.from("\r\n", encoding),
            Buffer.from("\n", encoding),
            Buffer.from("\r", encoding)
          ];
          loop: for (let i = 0; i < rds.length; i++) {
            const l = rds[i].length;
            for (let j = 0; j < l; j++) {
              if (rds[i][j] !== buf[pos + j]) {
                continue loop;
              }
            }
            this.options.record_delimiter.push(rds[i]);
            this.state.recordDelimiterMaxLength = rds[i].length;
            return rds[i].length;
          }
          return 0;
        },
        __error: function(msg) {
          const { encoding, raw, skip_records_with_error } = this.options;
          const err = typeof msg === "string" ? new Error(msg) : msg;
          if (skip_records_with_error) {
            this.state.recordHasError = true;
            if (this.options.on_skip !== void 0) {
              this.options.on_skip(
                err,
                raw ? this.state.rawBuffer.toString(encoding) : void 0
              );
            }
            return void 0;
          } else {
            return err;
          }
        },
        __infoDataSet: function() {
          return {
            ...this.info,
            columns: this.options.columns
          };
        },
        __infoRecord: function() {
          const { columns, raw, encoding } = this.options;
          return {
            ...this.__infoDataSet(),
            error: this.state.error,
            header: columns === true,
            index: this.state.record.length,
            raw: raw ? this.state.rawBuffer.toString(encoding) : void 0
          };
        },
        __infoField: function() {
          const { columns } = this.options;
          const isColumns = Array.isArray(columns);
          return {
            ...this.__infoRecord(),
            column: isColumns === true ? columns.length > this.state.record.length ? columns[this.state.record.length].name : null : this.state.record.length,
            quoting: this.state.wasQuoting
          };
        }
      };
    };
  }
});

// tools/data/node_modules/csv-parse/lib/sync.js
var sync_exports = {};
__export(sync_exports, {
  CsvError: () => CsvError,
  parse: () => parse
});
var parse;
var init_sync = __esm({
  "tools/data/node_modules/csv-parse/lib/sync.js"() {
    init_api();
    parse = function(data, opts = {}) {
      if (typeof data === "string") {
        data = Buffer.from(data);
      }
      const records = opts && opts.objname ? {} : [];
      const parser = transform(opts);
      const push = (record) => {
        if (parser.options.objname === void 0) records.push(record);
        else {
          records[record[0]] = record[1];
        }
      };
      const close = () => {
      };
      const err1 = parser.parse(data, false, push, close);
      if (err1 !== void 0) throw err1;
      const err2 = parser.parse(void 0, true, push, close);
      if (err2 !== void 0) throw err2;
      return records;
    };
  }
});

// tools/data/node_modules/csv-parse/dist/esm/sync.js
var sync_exports2 = {};
__export(sync_exports2, {
  CsvError: () => CsvError2,
  parse: () => parse2
});
function init() {
  inited = true;
  var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (var i = 0, len = code.length; i < len; ++i) {
    lookup[i] = code[i];
    revLookup[code.charCodeAt(i)] = i;
  }
  revLookup["-".charCodeAt(0)] = 62;
  revLookup["_".charCodeAt(0)] = 63;
}
function toByteArray(b64) {
  if (!inited) {
    init();
  }
  var i, j, l, tmp, placeHolders, arr;
  var len = b64.length;
  if (len % 4 > 0) {
    throw new Error("Invalid string. Length must be a multiple of 4");
  }
  placeHolders = b64[len - 2] === "=" ? 2 : b64[len - 1] === "=" ? 1 : 0;
  arr = new Arr(len * 3 / 4 - placeHolders);
  l = placeHolders > 0 ? len - 4 : len;
  var L = 0;
  for (i = 0, j = 0; i < l; i += 4, j += 3) {
    tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)];
    arr[L++] = tmp >> 16 & 255;
    arr[L++] = tmp >> 8 & 255;
    arr[L++] = tmp & 255;
  }
  if (placeHolders === 2) {
    tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4;
    arr[L++] = tmp & 255;
  } else if (placeHolders === 1) {
    tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2;
    arr[L++] = tmp >> 8 & 255;
    arr[L++] = tmp & 255;
  }
  return arr;
}
function tripletToBase64(num) {
  return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
}
function encodeChunk(uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + uint8[i + 2];
    output.push(tripletToBase64(tmp));
  }
  return output.join("");
}
function fromByteArray(uint8) {
  if (!inited) {
    init();
  }
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3;
  var output = "";
  var parts = [];
  var maxChunkLength = 16383;
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength));
  }
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    output += lookup[tmp >> 2];
    output += lookup[tmp << 4 & 63];
    output += "==";
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
    output += lookup[tmp >> 10];
    output += lookup[tmp >> 4 & 63];
    output += lookup[tmp << 2 & 63];
    output += "=";
  }
  parts.push(output);
  return parts.join("");
}
function read(buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? nBytes - 1 : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];
  i += d;
  e = s & (1 << -nBits) - 1;
  s >>= -nBits;
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {
  }
  m = e & (1 << -nBits) - 1;
  e >>= -nBits;
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {
  }
  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : (s ? -1 : 1) * Infinity;
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
}
function write(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
  var i = isLE ? 0 : nBytes - 1;
  var d = isLE ? 1 : -1;
  var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
  value = Math.abs(value);
  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }
    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }
  for (; mLen >= 8; buffer[offset + i] = m & 255, i += d, m /= 256, mLen -= 8) {
  }
  e = e << mLen | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 255, i += d, e /= 256, eLen -= 8) {
  }
  buffer[offset + i - d] |= s * 128;
}
function kMaxLength() {
  return Buffer2.TYPED_ARRAY_SUPPORT ? 2147483647 : 1073741823;
}
function createBuffer(that, length) {
  if (kMaxLength() < length) {
    throw new RangeError("Invalid typed array length");
  }
  if (Buffer2.TYPED_ARRAY_SUPPORT) {
    that = new Uint8Array(length);
    that.__proto__ = Buffer2.prototype;
  } else {
    if (that === null) {
      that = new Buffer2(length);
    }
    that.length = length;
  }
  return that;
}
function Buffer2(arg, encodingOrOffset, length) {
  if (!Buffer2.TYPED_ARRAY_SUPPORT && !(this instanceof Buffer2)) {
    return new Buffer2(arg, encodingOrOffset, length);
  }
  if (typeof arg === "number") {
    if (typeof encodingOrOffset === "string") {
      throw new Error(
        "If encoding is specified then the first argument must be a string"
      );
    }
    return allocUnsafe(this, arg);
  }
  return from(this, arg, encodingOrOffset, length);
}
function from(that, value, encodingOrOffset, length) {
  if (typeof value === "number") {
    throw new TypeError('"value" argument must not be a number');
  }
  if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
    return fromArrayBuffer(that, value, encodingOrOffset, length);
  }
  if (typeof value === "string") {
    return fromString(that, value, encodingOrOffset);
  }
  return fromObject(that, value);
}
function assertSize(size) {
  if (typeof size !== "number") {
    throw new TypeError('"size" argument must be a number');
  } else if (size < 0) {
    throw new RangeError('"size" argument must not be negative');
  }
}
function alloc(that, size, fill2, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(that, size);
  }
  if (fill2 !== void 0) {
    return typeof encoding === "string" ? createBuffer(that, size).fill(fill2, encoding) : createBuffer(that, size).fill(fill2);
  }
  return createBuffer(that, size);
}
function allocUnsafe(that, size) {
  assertSize(size);
  that = createBuffer(that, size < 0 ? 0 : checked(size) | 0);
  if (!Buffer2.TYPED_ARRAY_SUPPORT) {
    for (var i = 0; i < size; ++i) {
      that[i] = 0;
    }
  }
  return that;
}
function fromString(that, string, encoding) {
  if (typeof encoding !== "string" || encoding === "") {
    encoding = "utf8";
  }
  if (!Buffer2.isEncoding(encoding)) {
    throw new TypeError('"encoding" must be a valid string encoding');
  }
  var length = byteLength(string, encoding) | 0;
  that = createBuffer(that, length);
  var actual = that.write(string, encoding);
  if (actual !== length) {
    that = that.slice(0, actual);
  }
  return that;
}
function fromArrayLike(that, array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  that = createBuffer(that, length);
  for (var i = 0; i < length; i += 1) {
    that[i] = array[i] & 255;
  }
  return that;
}
function fromArrayBuffer(that, array, byteOffset, length) {
  array.byteLength;
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError("'offset' is out of bounds");
  }
  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError("'length' is out of bounds");
  }
  if (byteOffset === void 0 && length === void 0) {
    array = new Uint8Array(array);
  } else if (length === void 0) {
    array = new Uint8Array(array, byteOffset);
  } else {
    array = new Uint8Array(array, byteOffset, length);
  }
  if (Buffer2.TYPED_ARRAY_SUPPORT) {
    that = array;
    that.__proto__ = Buffer2.prototype;
  } else {
    that = fromArrayLike(that, array);
  }
  return that;
}
function fromObject(that, obj) {
  if (internalIsBuffer(obj)) {
    var len = checked(obj.length) | 0;
    that = createBuffer(that, len);
    if (that.length === 0) {
      return that;
    }
    obj.copy(that, 0, 0, len);
    return that;
  }
  if (obj) {
    if (typeof ArrayBuffer !== "undefined" && obj.buffer instanceof ArrayBuffer || "length" in obj) {
      if (typeof obj.length !== "number" || isnan(obj.length)) {
        return createBuffer(that, 0);
      }
      return fromArrayLike(that, obj);
    }
    if (obj.type === "Buffer" && isArray(obj.data)) {
      return fromArrayLike(that, obj.data);
    }
  }
  throw new TypeError("First argument must be a string, Buffer, ArrayBuffer, Array, or array-like object.");
}
function checked(length) {
  if (length >= kMaxLength()) {
    throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x" + kMaxLength().toString(16) + " bytes");
  }
  return length | 0;
}
function internalIsBuffer(b) {
  return !!(b != null && b._isBuffer);
}
function byteLength(string, encoding) {
  if (internalIsBuffer(string)) {
    return string.length;
  }
  if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function" && (ArrayBuffer.isView(string) || string instanceof ArrayBuffer)) {
    return string.byteLength;
  }
  if (typeof string !== "string") {
    string = "" + string;
  }
  var len = string.length;
  if (len === 0) return 0;
  var loweredCase = false;
  for (; ; ) {
    switch (encoding) {
      case "ascii":
      case "latin1":
      case "binary":
        return len;
      case "utf8":
      case "utf-8":
      case void 0:
        return utf8ToBytes(string).length;
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return len * 2;
      case "hex":
        return len >>> 1;
      case "base64":
        return base64ToBytes(string).length;
      default:
        if (loweredCase) return utf8ToBytes(string).length;
        encoding = ("" + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
function slowToString(encoding, start, end) {
  var loweredCase = false;
  if (start === void 0 || start < 0) {
    start = 0;
  }
  if (start > this.length) {
    return "";
  }
  if (end === void 0 || end > this.length) {
    end = this.length;
  }
  if (end <= 0) {
    return "";
  }
  end >>>= 0;
  start >>>= 0;
  if (end <= start) {
    return "";
  }
  if (!encoding) encoding = "utf8";
  while (true) {
    switch (encoding) {
      case "hex":
        return hexSlice(this, start, end);
      case "utf8":
      case "utf-8":
        return utf8Slice(this, start, end);
      case "ascii":
        return asciiSlice(this, start, end);
      case "latin1":
      case "binary":
        return latin1Slice(this, start, end);
      case "base64":
        return base64Slice(this, start, end);
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
        return utf16leSlice(this, start, end);
      default:
        if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
        encoding = (encoding + "").toLowerCase();
        loweredCase = true;
    }
  }
}
function swap(b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}
function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
  if (buffer.length === 0) return -1;
  if (typeof byteOffset === "string") {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 2147483647) {
    byteOffset = 2147483647;
  } else if (byteOffset < -2147483648) {
    byteOffset = -2147483648;
  }
  byteOffset = +byteOffset;
  if (isNaN(byteOffset)) {
    byteOffset = dir ? 0 : buffer.length - 1;
  }
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1;
    else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;
    else return -1;
  }
  if (typeof val === "string") {
    val = Buffer2.from(val, encoding);
  }
  if (internalIsBuffer(val)) {
    if (val.length === 0) {
      return -1;
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
  } else if (typeof val === "number") {
    val = val & 255;
    if (Buffer2.TYPED_ARRAY_SUPPORT && typeof Uint8Array.prototype.indexOf === "function") {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
      }
    }
    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
  }
  throw new TypeError("val must be string, number or Buffer");
}
function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;
  if (encoding !== void 0) {
    encoding = String(encoding).toLowerCase();
    if (encoding === "ucs2" || encoding === "ucs-2" || encoding === "utf16le" || encoding === "utf-16le") {
      if (arr.length < 2 || val.length < 2) {
        return -1;
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }
  function read2(buf, i2) {
    if (indexSize === 1) {
      return buf[i2];
    } else {
      return buf.readUInt16BE(i2 * indexSize);
    }
  }
  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read2(arr, i) === read2(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read2(arr, i + j) !== read2(val, j)) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
  }
  return -1;
}
function hexWrite(buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }
  var strLen = string.length;
  if (strLen % 2 !== 0) throw new TypeError("Invalid hex string");
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (isNaN(parsed)) return i;
    buf[offset + i] = parsed;
  }
  return i;
}
function utf8Write(buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
}
function asciiWrite(buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length);
}
function latin1Write(buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length);
}
function base64Write(buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length);
}
function ucs2Write(buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
}
function base64Slice(buf, start, end) {
  if (start === 0 && end === buf.length) {
    return fromByteArray(buf);
  } else {
    return fromByteArray(buf.slice(start, end));
  }
}
function utf8Slice(buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];
  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = firstByte > 239 ? 4 : firstByte > 223 ? 3 : firstByte > 191 ? 2 : 1;
    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;
      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 128) {
            codePoint = firstByte;
          }
          break;
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 192) === 128) {
            tempCodePoint = (firstByte & 31) << 6 | secondByte & 63;
            if (tempCodePoint > 127) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 192) === 128 && (thirdByte & 192) === 128) {
            tempCodePoint = (firstByte & 15) << 12 | (secondByte & 63) << 6 | thirdByte & 63;
            if (tempCodePoint > 2047 && (tempCodePoint < 55296 || tempCodePoint > 57343)) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 192) === 128 && (thirdByte & 192) === 128 && (fourthByte & 192) === 128) {
            tempCodePoint = (firstByte & 15) << 18 | (secondByte & 63) << 12 | (thirdByte & 63) << 6 | fourthByte & 63;
            if (tempCodePoint > 65535 && tempCodePoint < 1114112) {
              codePoint = tempCodePoint;
            }
          }
      }
    }
    if (codePoint === null) {
      codePoint = 65533;
      bytesPerSequence = 1;
    } else if (codePoint > 65535) {
      codePoint -= 65536;
      res.push(codePoint >>> 10 & 1023 | 55296);
      codePoint = 56320 | codePoint & 1023;
    }
    res.push(codePoint);
    i += bytesPerSequence;
  }
  return decodeCodePointsArray(res);
}
function decodeCodePointsArray(codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints);
  }
  var res = "";
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(
      String,
      codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH)
    );
  }
  return res;
}
function asciiSlice(buf, start, end) {
  var ret = "";
  end = Math.min(buf.length, end);
  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 127);
  }
  return ret;
}
function latin1Slice(buf, start, end) {
  var ret = "";
  end = Math.min(buf.length, end);
  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret;
}
function hexSlice(buf, start, end) {
  var len = buf.length;
  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;
  var out = "";
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out;
}
function utf16leSlice(buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = "";
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res;
}
function checkOffset(offset, ext, length) {
  if (offset % 1 !== 0 || offset < 0) throw new RangeError("offset is not uint");
  if (offset + ext > length) throw new RangeError("Trying to access beyond buffer length");
}
function checkInt(buf, value, offset, ext, max, min) {
  if (!internalIsBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
  if (offset + ext > buf.length) throw new RangeError("Index out of range");
}
function objectWriteUInt16(buf, value, offset, littleEndian) {
  if (value < 0) value = 65535 + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 2); i < j; ++i) {
    buf[offset + i] = (value & 255 << 8 * (littleEndian ? i : 1 - i)) >>> (littleEndian ? i : 1 - i) * 8;
  }
}
function objectWriteUInt32(buf, value, offset, littleEndian) {
  if (value < 0) value = 4294967295 + value + 1;
  for (var i = 0, j = Math.min(buf.length - offset, 4); i < j; ++i) {
    buf[offset + i] = value >>> (littleEndian ? i : 3 - i) * 8 & 255;
  }
}
function checkIEEE754(buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError("Index out of range");
  if (offset < 0) throw new RangeError("Index out of range");
}
function writeFloat(buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4);
  }
  write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4;
}
function writeDouble(buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8);
  }
  write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8;
}
function base64clean(str) {
  str = stringtrim(str).replace(INVALID_BASE64_RE, "");
  if (str.length < 2) return "";
  while (str.length % 4 !== 0) {
    str = str + "=";
  }
  return str;
}
function stringtrim(str) {
  if (str.trim) return str.trim();
  return str.replace(/^\s+|\s+$/g, "");
}
function toHex(n) {
  if (n < 16) return "0" + n.toString(16);
  return n.toString(16);
}
function utf8ToBytes(string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];
  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);
    if (codePoint > 55295 && codePoint < 57344) {
      if (!leadSurrogate) {
        if (codePoint > 56319) {
          if ((units -= 3) > -1) bytes.push(239, 191, 189);
          continue;
        } else if (i + 1 === length) {
          if ((units -= 3) > -1) bytes.push(239, 191, 189);
          continue;
        }
        leadSurrogate = codePoint;
        continue;
      }
      if (codePoint < 56320) {
        if ((units -= 3) > -1) bytes.push(239, 191, 189);
        leadSurrogate = codePoint;
        continue;
      }
      codePoint = (leadSurrogate - 55296 << 10 | codePoint - 56320) + 65536;
    } else if (leadSurrogate) {
      if ((units -= 3) > -1) bytes.push(239, 191, 189);
    }
    leadSurrogate = null;
    if (codePoint < 128) {
      if ((units -= 1) < 0) break;
      bytes.push(codePoint);
    } else if (codePoint < 2048) {
      if ((units -= 2) < 0) break;
      bytes.push(
        codePoint >> 6 | 192,
        codePoint & 63 | 128
      );
    } else if (codePoint < 65536) {
      if ((units -= 3) < 0) break;
      bytes.push(
        codePoint >> 12 | 224,
        codePoint >> 6 & 63 | 128,
        codePoint & 63 | 128
      );
    } else if (codePoint < 1114112) {
      if ((units -= 4) < 0) break;
      bytes.push(
        codePoint >> 18 | 240,
        codePoint >> 12 & 63 | 128,
        codePoint >> 6 & 63 | 128,
        codePoint & 63 | 128
      );
    } else {
      throw new Error("Invalid code point");
    }
  }
  return bytes;
}
function asciiToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    byteArray.push(str.charCodeAt(i) & 255);
  }
  return byteArray;
}
function utf16leToBytes(str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break;
    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }
  return byteArray;
}
function base64ToBytes(str) {
  return toByteArray(base64clean(str));
}
function blitBuffer(src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if (i + offset >= dst.length || i >= src.length) break;
    dst[i + offset] = src[i];
  }
  return i;
}
function isnan(val) {
  return val !== val;
}
function isBuffer(obj) {
  return obj != null && (!!obj._isBuffer || isFastBuffer(obj) || isSlowBuffer(obj));
}
function isFastBuffer(obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === "function" && obj.constructor.isBuffer(obj);
}
function isSlowBuffer(obj) {
  return typeof obj.readFloatLE === "function" && typeof obj.slice === "function" && isFastBuffer(obj.slice(0, 0));
}
var global$1, lookup, revLookup, Arr, inited, toString, isArray, INSPECT_MAX_BYTES, MAX_ARGUMENTS_LENGTH, INVALID_BASE64_RE, CsvError2, is_object2, normalize_columns_array2, ResizeableBuffer2, np2, cr$1, nl$1, space2, tab2, init_state2, underscore2, normalize_options2, isRecordEmpty2, cr3, nl3, boms2, transform2, parse2;
var init_sync2 = __esm({
  "tools/data/node_modules/csv-parse/dist/esm/sync.js"() {
    global$1 = typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {};
    lookup = [];
    revLookup = [];
    Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    inited = false;
    toString = {}.toString;
    isArray = Array.isArray || function(arr) {
      return toString.call(arr) == "[object Array]";
    };
    INSPECT_MAX_BYTES = 50;
    Buffer2.TYPED_ARRAY_SUPPORT = global$1.TYPED_ARRAY_SUPPORT !== void 0 ? global$1.TYPED_ARRAY_SUPPORT : true;
    kMaxLength();
    Buffer2.poolSize = 8192;
    Buffer2._augment = function(arr) {
      arr.__proto__ = Buffer2.prototype;
      return arr;
    };
    Buffer2.from = function(value, encodingOrOffset, length) {
      return from(null, value, encodingOrOffset, length);
    };
    if (Buffer2.TYPED_ARRAY_SUPPORT) {
      Buffer2.prototype.__proto__ = Uint8Array.prototype;
      Buffer2.__proto__ = Uint8Array;
      if (typeof Symbol !== "undefined" && Symbol.species && Buffer2[Symbol.species] === Buffer2) ;
    }
    Buffer2.alloc = function(size, fill2, encoding) {
      return alloc(null, size, fill2, encoding);
    };
    Buffer2.allocUnsafe = function(size) {
      return allocUnsafe(null, size);
    };
    Buffer2.allocUnsafeSlow = function(size) {
      return allocUnsafe(null, size);
    };
    Buffer2.isBuffer = isBuffer;
    Buffer2.compare = function compare(a, b) {
      if (!internalIsBuffer(a) || !internalIsBuffer(b)) {
        throw new TypeError("Arguments must be Buffers");
      }
      if (a === b) return 0;
      var x = a.length;
      var y = b.length;
      for (var i = 0, len = Math.min(x, y); i < len; ++i) {
        if (a[i] !== b[i]) {
          x = a[i];
          y = b[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer2.isEncoding = function isEncoding(encoding) {
      switch (String(encoding).toLowerCase()) {
        case "hex":
        case "utf8":
        case "utf-8":
        case "ascii":
        case "latin1":
        case "binary":
        case "base64":
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return true;
        default:
          return false;
      }
    };
    Buffer2.concat = function concat(list, length) {
      if (!isArray(list)) {
        throw new TypeError('"list" argument must be an Array of Buffers');
      }
      if (list.length === 0) {
        return Buffer2.alloc(0);
      }
      var i;
      if (length === void 0) {
        length = 0;
        for (i = 0; i < list.length; ++i) {
          length += list[i].length;
        }
      }
      var buffer = Buffer2.allocUnsafe(length);
      var pos = 0;
      for (i = 0; i < list.length; ++i) {
        var buf = list[i];
        if (!internalIsBuffer(buf)) {
          throw new TypeError('"list" argument must be an Array of Buffers');
        }
        buf.copy(buffer, pos);
        pos += buf.length;
      }
      return buffer;
    };
    Buffer2.byteLength = byteLength;
    Buffer2.prototype._isBuffer = true;
    Buffer2.prototype.swap16 = function swap16() {
      var len = this.length;
      if (len % 2 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 16-bits");
      }
      for (var i = 0; i < len; i += 2) {
        swap(this, i, i + 1);
      }
      return this;
    };
    Buffer2.prototype.swap32 = function swap32() {
      var len = this.length;
      if (len % 4 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 32-bits");
      }
      for (var i = 0; i < len; i += 4) {
        swap(this, i, i + 3);
        swap(this, i + 1, i + 2);
      }
      return this;
    };
    Buffer2.prototype.swap64 = function swap64() {
      var len = this.length;
      if (len % 8 !== 0) {
        throw new RangeError("Buffer size must be a multiple of 64-bits");
      }
      for (var i = 0; i < len; i += 8) {
        swap(this, i, i + 7);
        swap(this, i + 1, i + 6);
        swap(this, i + 2, i + 5);
        swap(this, i + 3, i + 4);
      }
      return this;
    };
    Buffer2.prototype.toString = function toString2() {
      var length = this.length | 0;
      if (length === 0) return "";
      if (arguments.length === 0) return utf8Slice(this, 0, length);
      return slowToString.apply(this, arguments);
    };
    Buffer2.prototype.equals = function equals(b) {
      if (!internalIsBuffer(b)) throw new TypeError("Argument must be a Buffer");
      if (this === b) return true;
      return Buffer2.compare(this, b) === 0;
    };
    Buffer2.prototype.inspect = function inspect() {
      var str = "";
      var max = INSPECT_MAX_BYTES;
      if (this.length > 0) {
        str = this.toString("hex", 0, max).match(/.{2}/g).join(" ");
        if (this.length > max) str += " ... ";
      }
      return "<Buffer " + str + ">";
    };
    Buffer2.prototype.compare = function compare2(target, start, end, thisStart, thisEnd) {
      if (!internalIsBuffer(target)) {
        throw new TypeError("Argument must be a Buffer");
      }
      if (start === void 0) {
        start = 0;
      }
      if (end === void 0) {
        end = target ? target.length : 0;
      }
      if (thisStart === void 0) {
        thisStart = 0;
      }
      if (thisEnd === void 0) {
        thisEnd = this.length;
      }
      if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
        throw new RangeError("out of range index");
      }
      if (thisStart >= thisEnd && start >= end) {
        return 0;
      }
      if (thisStart >= thisEnd) {
        return -1;
      }
      if (start >= end) {
        return 1;
      }
      start >>>= 0;
      end >>>= 0;
      thisStart >>>= 0;
      thisEnd >>>= 0;
      if (this === target) return 0;
      var x = thisEnd - thisStart;
      var y = end - start;
      var len = Math.min(x, y);
      var thisCopy = this.slice(thisStart, thisEnd);
      var targetCopy = target.slice(start, end);
      for (var i = 0; i < len; ++i) {
        if (thisCopy[i] !== targetCopy[i]) {
          x = thisCopy[i];
          y = targetCopy[i];
          break;
        }
      }
      if (x < y) return -1;
      if (y < x) return 1;
      return 0;
    };
    Buffer2.prototype.includes = function includes(val, byteOffset, encoding) {
      return this.indexOf(val, byteOffset, encoding) !== -1;
    };
    Buffer2.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
    };
    Buffer2.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
      return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
    };
    Buffer2.prototype.write = function write2(string, offset, length, encoding) {
      if (offset === void 0) {
        encoding = "utf8";
        length = this.length;
        offset = 0;
      } else if (length === void 0 && typeof offset === "string") {
        encoding = offset;
        length = this.length;
        offset = 0;
      } else if (isFinite(offset)) {
        offset = offset | 0;
        if (isFinite(length)) {
          length = length | 0;
          if (encoding === void 0) encoding = "utf8";
        } else {
          encoding = length;
          length = void 0;
        }
      } else {
        throw new Error(
          "Buffer.write(string, encoding, offset[, length]) is no longer supported"
        );
      }
      var remaining = this.length - offset;
      if (length === void 0 || length > remaining) length = remaining;
      if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
        throw new RangeError("Attempt to write outside buffer bounds");
      }
      if (!encoding) encoding = "utf8";
      var loweredCase = false;
      for (; ; ) {
        switch (encoding) {
          case "hex":
            return hexWrite(this, string, offset, length);
          case "utf8":
          case "utf-8":
            return utf8Write(this, string, offset, length);
          case "ascii":
            return asciiWrite(this, string, offset, length);
          case "latin1":
          case "binary":
            return latin1Write(this, string, offset, length);
          case "base64":
            return base64Write(this, string, offset, length);
          case "ucs2":
          case "ucs-2":
          case "utf16le":
          case "utf-16le":
            return ucs2Write(this, string, offset, length);
          default:
            if (loweredCase) throw new TypeError("Unknown encoding: " + encoding);
            encoding = ("" + encoding).toLowerCase();
            loweredCase = true;
        }
      }
    };
    Buffer2.prototype.toJSON = function toJSON() {
      return {
        type: "Buffer",
        data: Array.prototype.slice.call(this._arr || this, 0)
      };
    };
    MAX_ARGUMENTS_LENGTH = 4096;
    Buffer2.prototype.slice = function slice(start, end) {
      var len = this.length;
      start = ~~start;
      end = end === void 0 ? len : ~~end;
      if (start < 0) {
        start += len;
        if (start < 0) start = 0;
      } else if (start > len) {
        start = len;
      }
      if (end < 0) {
        end += len;
        if (end < 0) end = 0;
      } else if (end > len) {
        end = len;
      }
      if (end < start) end = start;
      var newBuf;
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        newBuf = this.subarray(start, end);
        newBuf.__proto__ = Buffer2.prototype;
      } else {
        var sliceLen = end - start;
        newBuf = new Buffer2(sliceLen, void 0);
        for (var i = 0; i < sliceLen; ++i) {
          newBuf[i] = this[i + start];
        }
      }
      return newBuf;
    };
    Buffer2.prototype.readUIntLE = function readUIntLE(offset, byteLength2, noAssert) {
      offset = offset | 0;
      byteLength2 = byteLength2 | 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      var val = this[offset];
      var mul = 1;
      var i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      return val;
    };
    Buffer2.prototype.readUIntBE = function readUIntBE(offset, byteLength2, noAssert) {
      offset = offset | 0;
      byteLength2 = byteLength2 | 0;
      if (!noAssert) {
        checkOffset(offset, byteLength2, this.length);
      }
      var val = this[offset + --byteLength2];
      var mul = 1;
      while (byteLength2 > 0 && (mul *= 256)) {
        val += this[offset + --byteLength2] * mul;
      }
      return val;
    };
    Buffer2.prototype.readUInt8 = function readUInt8(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 1, this.length);
      return this[offset];
    };
    Buffer2.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] | this[offset + 1] << 8;
    };
    Buffer2.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 2, this.length);
      return this[offset] << 8 | this[offset + 1];
    };
    Buffer2.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 4, this.length);
      return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 16777216;
    };
    Buffer2.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] * 16777216 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
    };
    Buffer2.prototype.readIntLE = function readIntLE(offset, byteLength2, noAssert) {
      offset = offset | 0;
      byteLength2 = byteLength2 | 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      var val = this[offset];
      var mul = 1;
      var i = 0;
      while (++i < byteLength2 && (mul *= 256)) {
        val += this[offset + i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer2.prototype.readIntBE = function readIntBE(offset, byteLength2, noAssert) {
      offset = offset | 0;
      byteLength2 = byteLength2 | 0;
      if (!noAssert) checkOffset(offset, byteLength2, this.length);
      var i = byteLength2;
      var mul = 1;
      var val = this[offset + --i];
      while (i > 0 && (mul *= 256)) {
        val += this[offset + --i] * mul;
      }
      mul *= 128;
      if (val >= mul) val -= Math.pow(2, 8 * byteLength2);
      return val;
    };
    Buffer2.prototype.readInt8 = function readInt8(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 1, this.length);
      if (!(this[offset] & 128)) return this[offset];
      return (255 - this[offset] + 1) * -1;
    };
    Buffer2.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 2, this.length);
      var val = this[offset] | this[offset + 1] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 2, this.length);
      var val = this[offset + 1] | this[offset] << 8;
      return val & 32768 ? val | 4294901760 : val;
    };
    Buffer2.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
    };
    Buffer2.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 4, this.length);
      return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
    };
    Buffer2.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 4, this.length);
      return read(this, offset, true, 23, 4);
    };
    Buffer2.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 4, this.length);
      return read(this, offset, false, 23, 4);
    };
    Buffer2.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 8, this.length);
      return read(this, offset, true, 52, 8);
    };
    Buffer2.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
      if (!noAssert) checkOffset(offset, 8, this.length);
      return read(this, offset, false, 52, 8);
    };
    Buffer2.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset | 0;
      byteLength2 = byteLength2 | 0;
      if (!noAssert) {
        var maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      var mul = 1;
      var i = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset | 0;
      byteLength2 = byteLength2 | 0;
      if (!noAssert) {
        var maxBytes = Math.pow(2, 8 * byteLength2) - 1;
        checkInt(this, value, offset, byteLength2, maxBytes, 0);
      }
      var i = byteLength2 - 1;
      var mul = 1;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        this[offset + i] = value / mul & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 1, 255, 0);
      if (!Buffer2.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
      } else {
        objectWriteUInt16(this, value, offset, true);
      }
      return offset + 2;
    };
    Buffer2.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 2, 65535, 0);
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
      } else {
        objectWriteUInt16(this, value, offset, false);
      }
      return offset + 2;
    };
    Buffer2.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset + 3] = value >>> 24;
        this[offset + 2] = value >>> 16;
        this[offset + 1] = value >>> 8;
        this[offset] = value & 255;
      } else {
        objectWriteUInt32(this, value, offset, true);
      }
      return offset + 4;
    };
    Buffer2.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 4, 4294967295, 0);
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
      } else {
        objectWriteUInt32(this, value, offset, false);
      }
      return offset + 4;
    };
    Buffer2.prototype.writeIntLE = function writeIntLE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) {
        var limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      var i = 0;
      var mul = 1;
      var sub = 0;
      this[offset] = value & 255;
      while (++i < byteLength2 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeIntBE = function writeIntBE(value, offset, byteLength2, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) {
        var limit = Math.pow(2, 8 * byteLength2 - 1);
        checkInt(this, value, offset, byteLength2, limit - 1, -limit);
      }
      var i = byteLength2 - 1;
      var mul = 1;
      var sub = 0;
      this[offset + i] = value & 255;
      while (--i >= 0 && (mul *= 256)) {
        if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
          sub = 1;
        }
        this[offset + i] = (value / mul >> 0) - sub & 255;
      }
      return offset + byteLength2;
    };
    Buffer2.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 1, 127, -128);
      if (!Buffer2.TYPED_ARRAY_SUPPORT) value = Math.floor(value);
      if (value < 0) value = 255 + value + 1;
      this[offset] = value & 255;
      return offset + 1;
    };
    Buffer2.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
      } else {
        objectWriteUInt16(this, value, offset, true);
      }
      return offset + 2;
    };
    Buffer2.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 2, 32767, -32768);
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset] = value >>> 8;
        this[offset + 1] = value & 255;
      } else {
        objectWriteUInt16(this, value, offset, false);
      }
      return offset + 2;
    };
    Buffer2.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset] = value & 255;
        this[offset + 1] = value >>> 8;
        this[offset + 2] = value >>> 16;
        this[offset + 3] = value >>> 24;
      } else {
        objectWriteUInt32(this, value, offset, true);
      }
      return offset + 4;
    };
    Buffer2.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
      value = +value;
      offset = offset | 0;
      if (!noAssert) checkInt(this, value, offset, 4, 2147483647, -2147483648);
      if (value < 0) value = 4294967295 + value + 1;
      if (Buffer2.TYPED_ARRAY_SUPPORT) {
        this[offset] = value >>> 24;
        this[offset + 1] = value >>> 16;
        this[offset + 2] = value >>> 8;
        this[offset + 3] = value & 255;
      } else {
        objectWriteUInt32(this, value, offset, false);
      }
      return offset + 4;
    };
    Buffer2.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
      return writeFloat(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
      return writeFloat(this, value, offset, false, noAssert);
    };
    Buffer2.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
      return writeDouble(this, value, offset, true, noAssert);
    };
    Buffer2.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
      return writeDouble(this, value, offset, false, noAssert);
    };
    Buffer2.prototype.copy = function copy(target, targetStart, start, end) {
      if (!start) start = 0;
      if (!end && end !== 0) end = this.length;
      if (targetStart >= target.length) targetStart = target.length;
      if (!targetStart) targetStart = 0;
      if (end > 0 && end < start) end = start;
      if (end === start) return 0;
      if (target.length === 0 || this.length === 0) return 0;
      if (targetStart < 0) {
        throw new RangeError("targetStart out of bounds");
      }
      if (start < 0 || start >= this.length) throw new RangeError("sourceStart out of bounds");
      if (end < 0) throw new RangeError("sourceEnd out of bounds");
      if (end > this.length) end = this.length;
      if (target.length - targetStart < end - start) {
        end = target.length - targetStart + start;
      }
      var len = end - start;
      var i;
      if (this === target && start < targetStart && targetStart < end) {
        for (i = len - 1; i >= 0; --i) {
          target[i + targetStart] = this[i + start];
        }
      } else if (len < 1e3 || !Buffer2.TYPED_ARRAY_SUPPORT) {
        for (i = 0; i < len; ++i) {
          target[i + targetStart] = this[i + start];
        }
      } else {
        Uint8Array.prototype.set.call(
          target,
          this.subarray(start, start + len),
          targetStart
        );
      }
      return len;
    };
    Buffer2.prototype.fill = function fill(val, start, end, encoding) {
      if (typeof val === "string") {
        if (typeof start === "string") {
          encoding = start;
          start = 0;
          end = this.length;
        } else if (typeof end === "string") {
          encoding = end;
          end = this.length;
        }
        if (val.length === 1) {
          var code = val.charCodeAt(0);
          if (code < 256) {
            val = code;
          }
        }
        if (encoding !== void 0 && typeof encoding !== "string") {
          throw new TypeError("encoding must be a string");
        }
        if (typeof encoding === "string" && !Buffer2.isEncoding(encoding)) {
          throw new TypeError("Unknown encoding: " + encoding);
        }
      } else if (typeof val === "number") {
        val = val & 255;
      }
      if (start < 0 || this.length < start || this.length < end) {
        throw new RangeError("Out of range index");
      }
      if (end <= start) {
        return this;
      }
      start = start >>> 0;
      end = end === void 0 ? this.length : end >>> 0;
      if (!val) val = 0;
      var i;
      if (typeof val === "number") {
        for (i = start; i < end; ++i) {
          this[i] = val;
        }
      } else {
        var bytes = internalIsBuffer(val) ? val : utf8ToBytes(new Buffer2(val, encoding).toString());
        var len = bytes.length;
        for (i = 0; i < end - start; ++i) {
          this[i + start] = bytes[i % len];
        }
      }
      return this;
    };
    INVALID_BASE64_RE = /[^+\/0-9A-Za-z-_]/g;
    CsvError2 = class _CsvError extends Error {
      constructor(code, message, options, ...contexts) {
        if (Array.isArray(message)) message = message.join(" ").trim();
        super(message);
        if (Error.captureStackTrace !== void 0) {
          Error.captureStackTrace(this, _CsvError);
        }
        this.code = code;
        for (const context of contexts) {
          for (const key in context) {
            const value = context[key];
            this[key] = isBuffer(value) ? value.toString(options.encoding) : value == null ? value : JSON.parse(JSON.stringify(value));
          }
        }
      }
    };
    is_object2 = function(obj) {
      return typeof obj === "object" && obj !== null && !Array.isArray(obj);
    };
    normalize_columns_array2 = function(columns) {
      const normalizedColumns = [];
      for (let i = 0, l = columns.length; i < l; i++) {
        const column = columns[i];
        if (column === void 0 || column === null || column === false) {
          normalizedColumns[i] = { disabled: true };
        } else if (typeof column === "string") {
          normalizedColumns[i] = { name: column };
        } else if (is_object2(column)) {
          if (typeof column.name !== "string") {
            throw new CsvError2("CSV_OPTION_COLUMNS_MISSING_NAME", [
              "Option columns missing name:",
              `property "name" is required at position ${i}`,
              "when column is an object literal"
            ]);
          }
          normalizedColumns[i] = column;
        } else {
          throw new CsvError2("CSV_INVALID_COLUMN_DEFINITION", [
            "Invalid column definition:",
            "expect a string or a literal object,",
            `got ${JSON.stringify(column)} at position ${i}`
          ]);
        }
      }
      return normalizedColumns;
    };
    ResizeableBuffer2 = class {
      constructor(size = 100) {
        this.size = size;
        this.length = 0;
        this.buf = Buffer2.allocUnsafe(size);
      }
      prepend(val) {
        if (isBuffer(val)) {
          const length = this.length + val.length;
          if (length >= this.size) {
            this.resize();
            if (length >= this.size) {
              throw Error("INVALID_BUFFER_STATE");
            }
          }
          const buf = this.buf;
          this.buf = Buffer2.allocUnsafe(this.size);
          val.copy(this.buf, 0);
          buf.copy(this.buf, val.length);
          this.length += val.length;
        } else {
          const length = this.length++;
          if (length === this.size) {
            this.resize();
          }
          const buf = this.clone();
          this.buf[0] = val;
          buf.copy(this.buf, 1, 0, length);
        }
      }
      append(val) {
        const length = this.length++;
        if (length === this.size) {
          this.resize();
        }
        this.buf[length] = val;
      }
      clone() {
        return Buffer2.from(this.buf.slice(0, this.length));
      }
      resize() {
        const length = this.length;
        this.size = this.size * 2;
        const buf = Buffer2.allocUnsafe(this.size);
        this.buf.copy(buf, 0, 0, length);
        this.buf = buf;
      }
      toString(encoding) {
        if (encoding) {
          return this.buf.slice(0, this.length).toString(encoding);
        } else {
          return Uint8Array.prototype.slice.call(this.buf.slice(0, this.length));
        }
      }
      toJSON() {
        return this.toString("utf8");
      }
      reset() {
        this.length = 0;
      }
    };
    np2 = 12;
    cr$1 = 13;
    nl$1 = 10;
    space2 = 32;
    tab2 = 9;
    init_state2 = function(options) {
      return {
        bomSkipped: false,
        bufBytesStart: 0,
        castField: options.cast_function,
        commenting: false,
        // Current error encountered by a record
        error: void 0,
        enabled: options.from_line === 1,
        escaping: false,
        escapeIsQuote: isBuffer(options.escape) && isBuffer(options.quote) && Buffer2.compare(options.escape, options.quote) === 0,
        // columns can be `false`, `true`, `Array`
        expectedRecordLength: Array.isArray(options.columns) ? options.columns.length : void 0,
        field: new ResizeableBuffer2(20),
        firstLineToHeaders: options.cast_first_line_to_header,
        needMoreDataSize: Math.max(
          // Skip if the remaining buffer smaller than comment
          options.comment !== null ? options.comment.length : 0,
          ...options.delimiter.map((delimiter) => delimiter.length),
          // Skip if the remaining buffer can be escape sequence
          options.quote !== null ? options.quote.length : 0
        ),
        previousBuf: void 0,
        quoting: false,
        stop: false,
        rawBuffer: new ResizeableBuffer2(100),
        record: [],
        recordHasError: false,
        record_length: 0,
        recordDelimiterMaxLength: options.record_delimiter.length === 0 ? 0 : Math.max(...options.record_delimiter.map((v) => v.length)),
        trimChars: [
          Buffer2.from(" ", options.encoding)[0],
          Buffer2.from("	", options.encoding)[0]
        ],
        wasQuoting: false,
        wasRowDelimiter: false,
        timchars: [
          Buffer2.from(Buffer2.from([cr$1], "utf8").toString(), options.encoding),
          Buffer2.from(Buffer2.from([nl$1], "utf8").toString(), options.encoding),
          Buffer2.from(Buffer2.from([np2], "utf8").toString(), options.encoding),
          Buffer2.from(Buffer2.from([space2], "utf8").toString(), options.encoding),
          Buffer2.from(Buffer2.from([tab2], "utf8").toString(), options.encoding)
        ]
      };
    };
    underscore2 = function(str) {
      return str.replace(/([A-Z])/g, function(_, match) {
        return "_" + match.toLowerCase();
      });
    };
    normalize_options2 = function(opts) {
      const options = {};
      for (const opt in opts) {
        options[underscore2(opt)] = opts[opt];
      }
      if (options.encoding === void 0 || options.encoding === true) {
        options.encoding = "utf8";
      } else if (options.encoding === null || options.encoding === false) {
        options.encoding = null;
      } else if (typeof options.encoding !== "string" && options.encoding !== null) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_ENCODING",
          [
            "Invalid option encoding:",
            "encoding must be a string or null to return a buffer,",
            `got ${JSON.stringify(options.encoding)}`
          ],
          options
        );
      }
      if (options.bom === void 0 || options.bom === null || options.bom === false) {
        options.bom = false;
      } else if (options.bom !== true) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_BOM",
          [
            "Invalid option bom:",
            "bom must be true,",
            `got ${JSON.stringify(options.bom)}`
          ],
          options
        );
      }
      options.cast_function = null;
      if (options.cast === void 0 || options.cast === null || options.cast === false || options.cast === "") {
        options.cast = void 0;
      } else if (typeof options.cast === "function") {
        options.cast_function = options.cast;
        options.cast = true;
      } else if (options.cast !== true) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_CAST",
          [
            "Invalid option cast:",
            "cast must be true or a function,",
            `got ${JSON.stringify(options.cast)}`
          ],
          options
        );
      }
      if (options.cast_date === void 0 || options.cast_date === null || options.cast_date === false || options.cast_date === "") {
        options.cast_date = false;
      } else if (options.cast_date === true) {
        options.cast_date = function(value) {
          const date = Date.parse(value);
          return !isNaN(date) ? new Date(date) : value;
        };
      } else if (typeof options.cast_date !== "function") {
        throw new CsvError2(
          "CSV_INVALID_OPTION_CAST_DATE",
          [
            "Invalid option cast_date:",
            "cast_date must be true or a function,",
            `got ${JSON.stringify(options.cast_date)}`
          ],
          options
        );
      }
      options.cast_first_line_to_header = null;
      if (options.columns === true) {
        options.cast_first_line_to_header = void 0;
      } else if (typeof options.columns === "function") {
        options.cast_first_line_to_header = options.columns;
        options.columns = true;
      } else if (Array.isArray(options.columns)) {
        options.columns = normalize_columns_array2(options.columns);
      } else if (options.columns === void 0 || options.columns === null || options.columns === false) {
        options.columns = false;
      } else {
        throw new CsvError2(
          "CSV_INVALID_OPTION_COLUMNS",
          [
            "Invalid option columns:",
            "expect an array, a function or true,",
            `got ${JSON.stringify(options.columns)}`
          ],
          options
        );
      }
      if (options.group_columns_by_name === void 0 || options.group_columns_by_name === null || options.group_columns_by_name === false) {
        options.group_columns_by_name = false;
      } else if (options.group_columns_by_name !== true) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_GROUP_COLUMNS_BY_NAME",
          [
            "Invalid option group_columns_by_name:",
            "expect an boolean,",
            `got ${JSON.stringify(options.group_columns_by_name)}`
          ],
          options
        );
      } else if (options.columns === false) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_GROUP_COLUMNS_BY_NAME",
          [
            "Invalid option group_columns_by_name:",
            "the `columns` mode must be activated."
          ],
          options
        );
      }
      if (options.comment === void 0 || options.comment === null || options.comment === false || options.comment === "") {
        options.comment = null;
      } else {
        if (typeof options.comment === "string") {
          options.comment = Buffer2.from(options.comment, options.encoding);
        }
        if (!isBuffer(options.comment)) {
          throw new CsvError2(
            "CSV_INVALID_OPTION_COMMENT",
            [
              "Invalid option comment:",
              "comment must be a buffer or a string,",
              `got ${JSON.stringify(options.comment)}`
            ],
            options
          );
        }
      }
      if (options.comment_no_infix === void 0 || options.comment_no_infix === null || options.comment_no_infix === false) {
        options.comment_no_infix = false;
      } else if (options.comment_no_infix !== true) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_COMMENT",
          [
            "Invalid option comment_no_infix:",
            "value must be a boolean,",
            `got ${JSON.stringify(options.comment_no_infix)}`
          ],
          options
        );
      }
      const delimiter_json = JSON.stringify(options.delimiter);
      if (!Array.isArray(options.delimiter))
        options.delimiter = [options.delimiter];
      if (options.delimiter.length === 0) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_DELIMITER",
          [
            "Invalid option delimiter:",
            "delimiter must be a non empty string or buffer or array of string|buffer,",
            `got ${delimiter_json}`
          ],
          options
        );
      }
      options.delimiter = options.delimiter.map(function(delimiter) {
        if (delimiter === void 0 || delimiter === null || delimiter === false) {
          return Buffer2.from(",", options.encoding);
        }
        if (typeof delimiter === "string") {
          delimiter = Buffer2.from(delimiter, options.encoding);
        }
        if (!isBuffer(delimiter) || delimiter.length === 0) {
          throw new CsvError2(
            "CSV_INVALID_OPTION_DELIMITER",
            [
              "Invalid option delimiter:",
              "delimiter must be a non empty string or buffer or array of string|buffer,",
              `got ${delimiter_json}`
            ],
            options
          );
        }
        return delimiter;
      });
      if (options.escape === void 0 || options.escape === true) {
        options.escape = Buffer2.from('"', options.encoding);
      } else if (typeof options.escape === "string") {
        options.escape = Buffer2.from(options.escape, options.encoding);
      } else if (options.escape === null || options.escape === false) {
        options.escape = null;
      }
      if (options.escape !== null) {
        if (!isBuffer(options.escape)) {
          throw new Error(
            `Invalid Option: escape must be a buffer, a string or a boolean, got ${JSON.stringify(options.escape)}`
          );
        }
      }
      if (options.from === void 0 || options.from === null) {
        options.from = 1;
      } else {
        if (typeof options.from === "string" && /\d+/.test(options.from)) {
          options.from = parseInt(options.from);
        }
        if (Number.isInteger(options.from)) {
          if (options.from < 0) {
            throw new Error(
              `Invalid Option: from must be a positive integer, got ${JSON.stringify(opts.from)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: from must be an integer, got ${JSON.stringify(options.from)}`
          );
        }
      }
      if (options.from_line === void 0 || options.from_line === null) {
        options.from_line = 1;
      } else {
        if (typeof options.from_line === "string" && /\d+/.test(options.from_line)) {
          options.from_line = parseInt(options.from_line);
        }
        if (Number.isInteger(options.from_line)) {
          if (options.from_line <= 0) {
            throw new Error(
              `Invalid Option: from_line must be a positive integer greater than 0, got ${JSON.stringify(opts.from_line)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: from_line must be an integer, got ${JSON.stringify(opts.from_line)}`
          );
        }
      }
      if (options.ignore_last_delimiters === void 0 || options.ignore_last_delimiters === null) {
        options.ignore_last_delimiters = false;
      } else if (typeof options.ignore_last_delimiters === "number") {
        options.ignore_last_delimiters = Math.floor(options.ignore_last_delimiters);
        if (options.ignore_last_delimiters === 0) {
          options.ignore_last_delimiters = false;
        }
      } else if (typeof options.ignore_last_delimiters !== "boolean") {
        throw new CsvError2(
          "CSV_INVALID_OPTION_IGNORE_LAST_DELIMITERS",
          [
            "Invalid option `ignore_last_delimiters`:",
            "the value must be a boolean value or an integer,",
            `got ${JSON.stringify(options.ignore_last_delimiters)}`
          ],
          options
        );
      }
      if (options.ignore_last_delimiters === true && options.columns === false) {
        throw new CsvError2(
          "CSV_IGNORE_LAST_DELIMITERS_REQUIRES_COLUMNS",
          [
            "The option `ignore_last_delimiters`",
            "requires the activation of the `columns` option"
          ],
          options
        );
      }
      if (options.info === void 0 || options.info === null || options.info === false) {
        options.info = false;
      } else if (options.info !== true) {
        throw new Error(
          `Invalid Option: info must be true, got ${JSON.stringify(options.info)}`
        );
      }
      if (options.max_record_size === void 0 || options.max_record_size === null || options.max_record_size === false) {
        options.max_record_size = 0;
      } else if (Number.isInteger(options.max_record_size) && options.max_record_size >= 0) ;
      else if (typeof options.max_record_size === "string" && /\d+/.test(options.max_record_size)) {
        options.max_record_size = parseInt(options.max_record_size);
      } else {
        throw new Error(
          `Invalid Option: max_record_size must be a positive integer, got ${JSON.stringify(options.max_record_size)}`
        );
      }
      if (options.objname === void 0 || options.objname === null || options.objname === false) {
        options.objname = void 0;
      } else if (isBuffer(options.objname)) {
        if (options.objname.length === 0) {
          throw new Error(`Invalid Option: objname must be a non empty buffer`);
        }
        if (options.encoding === null) ;
        else {
          options.objname = options.objname.toString(options.encoding);
        }
      } else if (typeof options.objname === "string") {
        if (options.objname.length === 0) {
          throw new Error(`Invalid Option: objname must be a non empty string`);
        }
      } else if (typeof options.objname === "number") ;
      else {
        throw new Error(
          `Invalid Option: objname must be a string or a buffer, got ${options.objname}`
        );
      }
      if (options.objname !== void 0) {
        if (typeof options.objname === "number") {
          if (options.columns !== false) {
            throw Error(
              "Invalid Option: objname index cannot be combined with columns or be defined as a field"
            );
          }
        } else {
          if (options.columns === false) {
            throw Error(
              "Invalid Option: objname field must be combined with columns or be defined as an index"
            );
          }
        }
      }
      if (options.on_record === void 0 || options.on_record === null) {
        options.on_record = void 0;
      } else if (typeof options.on_record !== "function") {
        throw new CsvError2(
          "CSV_INVALID_OPTION_ON_RECORD",
          [
            "Invalid option `on_record`:",
            "expect a function,",
            `got ${JSON.stringify(options.on_record)}`
          ],
          options
        );
      }
      if (options.on_skip !== void 0 && options.on_skip !== null && typeof options.on_skip !== "function") {
        throw new Error(
          `Invalid Option: on_skip must be a function, got ${JSON.stringify(options.on_skip)}`
        );
      }
      if (options.quote === null || options.quote === false || options.quote === "") {
        options.quote = null;
      } else {
        if (options.quote === void 0 || options.quote === true) {
          options.quote = Buffer2.from('"', options.encoding);
        } else if (typeof options.quote === "string") {
          options.quote = Buffer2.from(options.quote, options.encoding);
        }
        if (!isBuffer(options.quote)) {
          throw new Error(
            `Invalid Option: quote must be a buffer or a string, got ${JSON.stringify(options.quote)}`
          );
        }
      }
      if (options.raw === void 0 || options.raw === null || options.raw === false) {
        options.raw = false;
      } else if (options.raw !== true) {
        throw new Error(
          `Invalid Option: raw must be true, got ${JSON.stringify(options.raw)}`
        );
      }
      if (options.record_delimiter === void 0) {
        options.record_delimiter = [];
      } else if (typeof options.record_delimiter === "string" || isBuffer(options.record_delimiter)) {
        if (options.record_delimiter.length === 0) {
          throw new CsvError2(
            "CSV_INVALID_OPTION_RECORD_DELIMITER",
            [
              "Invalid option `record_delimiter`:",
              "value must be a non empty string or buffer,",
              `got ${JSON.stringify(options.record_delimiter)}`
            ],
            options
          );
        }
        options.record_delimiter = [options.record_delimiter];
      } else if (!Array.isArray(options.record_delimiter)) {
        throw new CsvError2(
          "CSV_INVALID_OPTION_RECORD_DELIMITER",
          [
            "Invalid option `record_delimiter`:",
            "value must be a string, a buffer or array of string|buffer,",
            `got ${JSON.stringify(options.record_delimiter)}`
          ],
          options
        );
      }
      options.record_delimiter = options.record_delimiter.map(function(rd, i) {
        if (typeof rd !== "string" && !isBuffer(rd)) {
          throw new CsvError2(
            "CSV_INVALID_OPTION_RECORD_DELIMITER",
            [
              "Invalid option `record_delimiter`:",
              "value must be a string, a buffer or array of string|buffer",
              `at index ${i},`,
              `got ${JSON.stringify(rd)}`
            ],
            options
          );
        } else if (rd.length === 0) {
          throw new CsvError2(
            "CSV_INVALID_OPTION_RECORD_DELIMITER",
            [
              "Invalid option `record_delimiter`:",
              "value must be a non empty string or buffer",
              `at index ${i},`,
              `got ${JSON.stringify(rd)}`
            ],
            options
          );
        }
        if (typeof rd === "string") {
          rd = Buffer2.from(rd, options.encoding);
        }
        return rd;
      });
      if (typeof options.relax_column_count === "boolean") ;
      else if (options.relax_column_count === void 0 || options.relax_column_count === null) {
        options.relax_column_count = false;
      } else {
        throw new Error(
          `Invalid Option: relax_column_count must be a boolean, got ${JSON.stringify(options.relax_column_count)}`
        );
      }
      if (typeof options.relax_column_count_less === "boolean") ;
      else if (options.relax_column_count_less === void 0 || options.relax_column_count_less === null) {
        options.relax_column_count_less = false;
      } else {
        throw new Error(
          `Invalid Option: relax_column_count_less must be a boolean, got ${JSON.stringify(options.relax_column_count_less)}`
        );
      }
      if (typeof options.relax_column_count_more === "boolean") ;
      else if (options.relax_column_count_more === void 0 || options.relax_column_count_more === null) {
        options.relax_column_count_more = false;
      } else {
        throw new Error(
          `Invalid Option: relax_column_count_more must be a boolean, got ${JSON.stringify(options.relax_column_count_more)}`
        );
      }
      if (typeof options.relax_quotes === "boolean") ;
      else if (options.relax_quotes === void 0 || options.relax_quotes === null) {
        options.relax_quotes = false;
      } else {
        throw new Error(
          `Invalid Option: relax_quotes must be a boolean, got ${JSON.stringify(options.relax_quotes)}`
        );
      }
      if (typeof options.skip_empty_lines === "boolean") ;
      else if (options.skip_empty_lines === void 0 || options.skip_empty_lines === null) {
        options.skip_empty_lines = false;
      } else {
        throw new Error(
          `Invalid Option: skip_empty_lines must be a boolean, got ${JSON.stringify(options.skip_empty_lines)}`
        );
      }
      if (typeof options.skip_records_with_empty_values === "boolean") ;
      else if (options.skip_records_with_empty_values === void 0 || options.skip_records_with_empty_values === null) {
        options.skip_records_with_empty_values = false;
      } else {
        throw new Error(
          `Invalid Option: skip_records_with_empty_values must be a boolean, got ${JSON.stringify(options.skip_records_with_empty_values)}`
        );
      }
      if (typeof options.skip_records_with_error === "boolean") ;
      else if (options.skip_records_with_error === void 0 || options.skip_records_with_error === null) {
        options.skip_records_with_error = false;
      } else {
        throw new Error(
          `Invalid Option: skip_records_with_error must be a boolean, got ${JSON.stringify(options.skip_records_with_error)}`
        );
      }
      if (options.rtrim === void 0 || options.rtrim === null || options.rtrim === false) {
        options.rtrim = false;
      } else if (options.rtrim !== true) {
        throw new Error(
          `Invalid Option: rtrim must be a boolean, got ${JSON.stringify(options.rtrim)}`
        );
      }
      if (options.ltrim === void 0 || options.ltrim === null || options.ltrim === false) {
        options.ltrim = false;
      } else if (options.ltrim !== true) {
        throw new Error(
          `Invalid Option: ltrim must be a boolean, got ${JSON.stringify(options.ltrim)}`
        );
      }
      if (options.trim === void 0 || options.trim === null || options.trim === false) {
        options.trim = false;
      } else if (options.trim !== true) {
        throw new Error(
          `Invalid Option: trim must be a boolean, got ${JSON.stringify(options.trim)}`
        );
      }
      if (options.trim === true && opts.ltrim !== false) {
        options.ltrim = true;
      } else if (options.ltrim !== true) {
        options.ltrim = false;
      }
      if (options.trim === true && opts.rtrim !== false) {
        options.rtrim = true;
      } else if (options.rtrim !== true) {
        options.rtrim = false;
      }
      if (options.to === void 0 || options.to === null) {
        options.to = -1;
      } else {
        if (typeof options.to === "string" && /\d+/.test(options.to)) {
          options.to = parseInt(options.to);
        }
        if (Number.isInteger(options.to)) {
          if (options.to <= 0) {
            throw new Error(
              `Invalid Option: to must be a positive integer greater than 0, got ${JSON.stringify(opts.to)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: to must be an integer, got ${JSON.stringify(opts.to)}`
          );
        }
      }
      if (options.to_line === void 0 || options.to_line === null) {
        options.to_line = -1;
      } else {
        if (typeof options.to_line === "string" && /\d+/.test(options.to_line)) {
          options.to_line = parseInt(options.to_line);
        }
        if (Number.isInteger(options.to_line)) {
          if (options.to_line <= 0) {
            throw new Error(
              `Invalid Option: to_line must be a positive integer greater than 0, got ${JSON.stringify(opts.to_line)}`
            );
          }
        } else {
          throw new Error(
            `Invalid Option: to_line must be an integer, got ${JSON.stringify(opts.to_line)}`
          );
        }
      }
      return options;
    };
    isRecordEmpty2 = function(record) {
      return record.every(
        (field) => field == null || field.toString && field.toString().trim() === ""
      );
    };
    cr3 = 13;
    nl3 = 10;
    boms2 = {
      // Note, the following are equals:
      // Buffer.from("\ufeff")
      // Buffer.from([239, 187, 191])
      // Buffer.from('EFBBBF', 'hex')
      utf8: Buffer2.from([239, 187, 191]),
      // Note, the following are equals:
      // Buffer.from "\ufeff", 'utf16le
      // Buffer.from([255, 254])
      utf16le: Buffer2.from([255, 254])
    };
    transform2 = function(original_options = {}) {
      const info = {
        bytes: 0,
        comment_lines: 0,
        empty_lines: 0,
        invalid_field_length: 0,
        lines: 1,
        records: 0
      };
      const options = normalize_options2(original_options);
      return {
        info,
        original_options,
        options,
        state: init_state2(options),
        __needMoreData: function(i, bufLen, end) {
          if (end) return false;
          const { encoding, escape, quote } = this.options;
          const { quoting, needMoreDataSize, recordDelimiterMaxLength } = this.state;
          const numOfCharLeft = bufLen - i - 1;
          const requiredLength = Math.max(
            needMoreDataSize,
            // Skip if the remaining buffer smaller than record delimiter
            // If "record_delimiter" is yet to be discovered:
            // 1. It is equals to `[]` and "recordDelimiterMaxLength" equals `0`
            // 2. We set the length to windows line ending in the current encoding
            // Note, that encoding is known from user or bom discovery at that point
            // recordDelimiterMaxLength,
            recordDelimiterMaxLength === 0 ? Buffer2.from("\r\n", encoding).length : recordDelimiterMaxLength,
            // Skip if remaining buffer can be an escaped quote
            quoting ? (escape === null ? 0 : escape.length) + quote.length : 0,
            // Skip if remaining buffer can be record delimiter following the closing quote
            quoting ? quote.length + recordDelimiterMaxLength : 0
          );
          return numOfCharLeft < requiredLength;
        },
        // Central parser implementation
        parse: function(nextBuf, end, push, close) {
          const {
            bom,
            comment_no_infix,
            encoding,
            from_line,
            ltrim,
            max_record_size,
            raw,
            relax_quotes,
            rtrim,
            skip_empty_lines,
            to,
            to_line
          } = this.options;
          let { comment, escape, quote, record_delimiter } = this.options;
          const { bomSkipped, previousBuf, rawBuffer, escapeIsQuote } = this.state;
          let buf;
          if (previousBuf === void 0) {
            if (nextBuf === void 0) {
              close();
              return;
            } else {
              buf = nextBuf;
            }
          } else if (previousBuf !== void 0 && nextBuf === void 0) {
            buf = previousBuf;
          } else {
            buf = Buffer2.concat([previousBuf, nextBuf]);
          }
          if (bomSkipped === false) {
            if (bom === false) {
              this.state.bomSkipped = true;
            } else if (buf.length < 3) {
              if (end === false) {
                this.state.previousBuf = buf;
                return;
              }
            } else {
              for (const encoding2 in boms2) {
                if (boms2[encoding2].compare(buf, 0, boms2[encoding2].length) === 0) {
                  const bomLength = boms2[encoding2].length;
                  this.state.bufBytesStart += bomLength;
                  buf = buf.slice(bomLength);
                  this.options = normalize_options2({
                    ...this.original_options,
                    encoding: encoding2
                  });
                  ({ comment, escape, quote } = this.options);
                  break;
                }
              }
              this.state.bomSkipped = true;
            }
          }
          const bufLen = buf.length;
          let pos;
          for (pos = 0; pos < bufLen; pos++) {
            if (this.__needMoreData(pos, bufLen, end)) {
              break;
            }
            if (this.state.wasRowDelimiter === true) {
              this.info.lines++;
              this.state.wasRowDelimiter = false;
            }
            if (to_line !== -1 && this.info.lines > to_line) {
              this.state.stop = true;
              close();
              return;
            }
            if (this.state.quoting === false && record_delimiter.length === 0) {
              const record_delimiterCount = this.__autoDiscoverRecordDelimiter(
                buf,
                pos
              );
              if (record_delimiterCount) {
                record_delimiter = this.options.record_delimiter;
              }
            }
            const chr = buf[pos];
            if (raw === true) {
              rawBuffer.append(chr);
            }
            if ((chr === cr3 || chr === nl3) && this.state.wasRowDelimiter === false) {
              this.state.wasRowDelimiter = true;
            }
            if (this.state.escaping === true) {
              this.state.escaping = false;
            } else {
              if (escape !== null && this.state.quoting === true && this.__isEscape(buf, pos, chr) && pos + escape.length < bufLen) {
                if (escapeIsQuote) {
                  if (this.__isQuote(buf, pos + escape.length)) {
                    this.state.escaping = true;
                    pos += escape.length - 1;
                    continue;
                  }
                } else {
                  this.state.escaping = true;
                  pos += escape.length - 1;
                  continue;
                }
              }
              if (this.state.commenting === false && this.__isQuote(buf, pos)) {
                if (this.state.quoting === true) {
                  const nextChr = buf[pos + quote.length];
                  const isNextChrTrimable = rtrim && this.__isCharTrimable(buf, pos + quote.length);
                  const isNextChrComment = comment !== null && this.__compareBytes(comment, buf, pos + quote.length, nextChr);
                  const isNextChrDelimiter = this.__isDelimiter(
                    buf,
                    pos + quote.length,
                    nextChr
                  );
                  const isNextChrRecordDelimiter = record_delimiter.length === 0 ? this.__autoDiscoverRecordDelimiter(buf, pos + quote.length) : this.__isRecordDelimiter(nextChr, buf, pos + quote.length);
                  if (escape !== null && this.__isEscape(buf, pos, chr) && this.__isQuote(buf, pos + escape.length)) {
                    pos += escape.length - 1;
                  } else if (!nextChr || isNextChrDelimiter || isNextChrRecordDelimiter || isNextChrComment || isNextChrTrimable) {
                    this.state.quoting = false;
                    this.state.wasQuoting = true;
                    pos += quote.length - 1;
                    continue;
                  } else if (relax_quotes === false) {
                    const err = this.__error(
                      new CsvError2(
                        "CSV_INVALID_CLOSING_QUOTE",
                        [
                          "Invalid Closing Quote:",
                          `got "${String.fromCharCode(nextChr)}"`,
                          `at line ${this.info.lines}`,
                          "instead of delimiter, record delimiter, trimable character",
                          "(if activated) or comment"
                        ],
                        this.options,
                        this.__infoField()
                      )
                    );
                    if (err !== void 0) return err;
                  } else {
                    this.state.quoting = false;
                    this.state.wasQuoting = true;
                    this.state.field.prepend(quote);
                    pos += quote.length - 1;
                  }
                } else {
                  if (this.state.field.length !== 0) {
                    if (relax_quotes === false) {
                      const info2 = this.__infoField();
                      const bom2 = Object.keys(boms2).map(
                        (b) => boms2[b].equals(this.state.field.toString()) ? b : false
                      ).filter(Boolean)[0];
                      const err = this.__error(
                        new CsvError2(
                          "INVALID_OPENING_QUOTE",
                          [
                            "Invalid Opening Quote:",
                            `a quote is found on field ${JSON.stringify(info2.column)} at line ${info2.lines}, value is ${JSON.stringify(this.state.field.toString(encoding))}`,
                            bom2 ? `(${bom2} bom)` : void 0
                          ],
                          this.options,
                          info2,
                          {
                            field: this.state.field
                          }
                        )
                      );
                      if (err !== void 0) return err;
                    }
                  } else {
                    this.state.quoting = true;
                    pos += quote.length - 1;
                    continue;
                  }
                }
              }
              if (this.state.quoting === false) {
                const recordDelimiterLength = this.__isRecordDelimiter(
                  chr,
                  buf,
                  pos
                );
                if (recordDelimiterLength !== 0) {
                  const skipCommentLine = this.state.commenting && this.state.wasQuoting === false && this.state.record.length === 0 && this.state.field.length === 0;
                  if (skipCommentLine) {
                    this.info.comment_lines++;
                  } else {
                    if (this.state.enabled === false && this.info.lines + (this.state.wasRowDelimiter === true ? 1 : 0) >= from_line) {
                      this.state.enabled = true;
                      this.__resetField();
                      this.__resetRecord();
                      pos += recordDelimiterLength - 1;
                      continue;
                    }
                    if (skip_empty_lines === true && this.state.wasQuoting === false && this.state.record.length === 0 && this.state.field.length === 0) {
                      this.info.empty_lines++;
                      pos += recordDelimiterLength - 1;
                      continue;
                    }
                    this.info.bytes = this.state.bufBytesStart + pos;
                    const errField = this.__onField();
                    if (errField !== void 0) return errField;
                    this.info.bytes = this.state.bufBytesStart + pos + recordDelimiterLength;
                    const errRecord = this.__onRecord(push);
                    if (errRecord !== void 0) return errRecord;
                    if (to !== -1 && this.info.records >= to) {
                      this.state.stop = true;
                      close();
                      return;
                    }
                  }
                  this.state.commenting = false;
                  pos += recordDelimiterLength - 1;
                  continue;
                }
                if (this.state.commenting) {
                  continue;
                }
                if (comment !== null && (comment_no_infix === false || this.state.record.length === 0 && this.state.field.length === 0)) {
                  const commentCount = this.__compareBytes(comment, buf, pos, chr);
                  if (commentCount !== 0) {
                    this.state.commenting = true;
                    continue;
                  }
                }
                const delimiterLength = this.__isDelimiter(buf, pos, chr);
                if (delimiterLength !== 0) {
                  this.info.bytes = this.state.bufBytesStart + pos;
                  const errField = this.__onField();
                  if (errField !== void 0) return errField;
                  pos += delimiterLength - 1;
                  continue;
                }
              }
            }
            if (this.state.commenting === false) {
              if (max_record_size !== 0 && this.state.record_length + this.state.field.length > max_record_size) {
                return this.__error(
                  new CsvError2(
                    "CSV_MAX_RECORD_SIZE",
                    [
                      "Max Record Size:",
                      "record exceed the maximum number of tolerated bytes",
                      `of ${max_record_size}`,
                      `at line ${this.info.lines}`
                    ],
                    this.options,
                    this.__infoField()
                  )
                );
              }
            }
            const lappend = ltrim === false || this.state.quoting === true || this.state.field.length !== 0 || !this.__isCharTrimable(buf, pos);
            const rappend = rtrim === false || this.state.wasQuoting === false;
            if (lappend === true && rappend === true) {
              this.state.field.append(chr);
            } else if (rtrim === true && !this.__isCharTrimable(buf, pos)) {
              return this.__error(
                new CsvError2(
                  "CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE",
                  [
                    "Invalid Closing Quote:",
                    "found non trimable byte after quote",
                    `at line ${this.info.lines}`
                  ],
                  this.options,
                  this.__infoField()
                )
              );
            } else {
              if (lappend === false) {
                pos += this.__isCharTrimable(buf, pos) - 1;
              }
              continue;
            }
          }
          if (end === true) {
            if (this.state.quoting === true) {
              const err = this.__error(
                new CsvError2(
                  "CSV_QUOTE_NOT_CLOSED",
                  [
                    "Quote Not Closed:",
                    `the parsing is finished with an opening quote at line ${this.info.lines}`
                  ],
                  this.options,
                  this.__infoField()
                )
              );
              if (err !== void 0) return err;
            } else {
              if (this.state.wasQuoting === true || this.state.record.length !== 0 || this.state.field.length !== 0) {
                this.info.bytes = this.state.bufBytesStart + pos;
                const errField = this.__onField();
                if (errField !== void 0) return errField;
                const errRecord = this.__onRecord(push);
                if (errRecord !== void 0) return errRecord;
              } else if (this.state.wasRowDelimiter === true) {
                this.info.empty_lines++;
              } else if (this.state.commenting === true) {
                this.info.comment_lines++;
              }
            }
          } else {
            this.state.bufBytesStart += pos;
            this.state.previousBuf = buf.slice(pos);
          }
          if (this.state.wasRowDelimiter === true) {
            this.info.lines++;
            this.state.wasRowDelimiter = false;
          }
        },
        __onRecord: function(push) {
          const {
            columns,
            group_columns_by_name,
            encoding,
            info: info2,
            from: from2,
            relax_column_count,
            relax_column_count_less,
            relax_column_count_more,
            raw,
            skip_records_with_empty_values
          } = this.options;
          const { enabled, record } = this.state;
          if (enabled === false) {
            return this.__resetRecord();
          }
          const recordLength = record.length;
          if (columns === true) {
            if (skip_records_with_empty_values === true && isRecordEmpty2(record)) {
              this.__resetRecord();
              return;
            }
            return this.__firstLineToColumns(record);
          }
          if (columns === false && this.info.records === 0) {
            this.state.expectedRecordLength = recordLength;
          }
          if (recordLength !== this.state.expectedRecordLength) {
            const err = columns === false ? new CsvError2(
              "CSV_RECORD_INCONSISTENT_FIELDS_LENGTH",
              [
                "Invalid Record Length:",
                `expect ${this.state.expectedRecordLength},`,
                `got ${recordLength} on line ${this.info.lines}`
              ],
              this.options,
              this.__infoField(),
              {
                record
              }
            ) : new CsvError2(
              "CSV_RECORD_INCONSISTENT_COLUMNS",
              [
                "Invalid Record Length:",
                `columns length is ${columns.length},`,
                // rename columns
                `got ${recordLength} on line ${this.info.lines}`
              ],
              this.options,
              this.__infoField(),
              {
                record
              }
            );
            if (relax_column_count === true || relax_column_count_less === true && recordLength < this.state.expectedRecordLength || relax_column_count_more === true && recordLength > this.state.expectedRecordLength) {
              this.info.invalid_field_length++;
              this.state.error = err;
            } else {
              const finalErr = this.__error(err);
              if (finalErr) return finalErr;
            }
          }
          if (skip_records_with_empty_values === true && isRecordEmpty2(record)) {
            this.__resetRecord();
            return;
          }
          if (this.state.recordHasError === true) {
            this.__resetRecord();
            this.state.recordHasError = false;
            return;
          }
          this.info.records++;
          if (from2 === 1 || this.info.records >= from2) {
            const { objname } = this.options;
            if (columns !== false) {
              const obj = {};
              for (let i = 0, l = record.length; i < l; i++) {
                if (columns[i] === void 0 || columns[i].disabled) continue;
                if (group_columns_by_name === true && obj[columns[i].name] !== void 0) {
                  if (Array.isArray(obj[columns[i].name])) {
                    obj[columns[i].name] = obj[columns[i].name].concat(record[i]);
                  } else {
                    obj[columns[i].name] = [obj[columns[i].name], record[i]];
                  }
                } else {
                  obj[columns[i].name] = record[i];
                }
              }
              if (raw === true || info2 === true) {
                const extRecord = Object.assign(
                  { record: obj },
                  raw === true ? { raw: this.state.rawBuffer.toString(encoding) } : {},
                  info2 === true ? { info: this.__infoRecord() } : {}
                );
                const err = this.__push(
                  objname === void 0 ? extRecord : [obj[objname], extRecord],
                  push
                );
                if (err) {
                  return err;
                }
              } else {
                const err = this.__push(
                  objname === void 0 ? obj : [obj[objname], obj],
                  push
                );
                if (err) {
                  return err;
                }
              }
            } else {
              if (raw === true || info2 === true) {
                const extRecord = Object.assign(
                  { record },
                  raw === true ? { raw: this.state.rawBuffer.toString(encoding) } : {},
                  info2 === true ? { info: this.__infoRecord() } : {}
                );
                const err = this.__push(
                  objname === void 0 ? extRecord : [record[objname], extRecord],
                  push
                );
                if (err) {
                  return err;
                }
              } else {
                const err = this.__push(
                  objname === void 0 ? record : [record[objname], record],
                  push
                );
                if (err) {
                  return err;
                }
              }
            }
          }
          this.__resetRecord();
        },
        __firstLineToColumns: function(record) {
          const { firstLineToHeaders } = this.state;
          try {
            const headers = firstLineToHeaders === void 0 ? record : firstLineToHeaders.call(null, record);
            if (!Array.isArray(headers)) {
              return this.__error(
                new CsvError2(
                  "CSV_INVALID_COLUMN_MAPPING",
                  [
                    "Invalid Column Mapping:",
                    "expect an array from column function,",
                    `got ${JSON.stringify(headers)}`
                  ],
                  this.options,
                  this.__infoField(),
                  {
                    headers
                  }
                )
              );
            }
            const normalizedHeaders = normalize_columns_array2(headers);
            this.state.expectedRecordLength = normalizedHeaders.length;
            this.options.columns = normalizedHeaders;
            this.__resetRecord();
            return;
          } catch (err) {
            return err;
          }
        },
        __resetRecord: function() {
          if (this.options.raw === true) {
            this.state.rawBuffer.reset();
          }
          this.state.error = void 0;
          this.state.record = [];
          this.state.record_length = 0;
        },
        __onField: function() {
          const { cast, encoding, rtrim, max_record_size } = this.options;
          const { enabled, wasQuoting } = this.state;
          if (enabled === false) {
            return this.__resetField();
          }
          let field = this.state.field.toString(encoding);
          if (rtrim === true && wasQuoting === false) {
            field = field.trimRight();
          }
          if (cast === true) {
            const [err, f] = this.__cast(field);
            if (err !== void 0) return err;
            field = f;
          }
          this.state.record.push(field);
          if (max_record_size !== 0 && typeof field === "string") {
            this.state.record_length += field.length;
          }
          this.__resetField();
        },
        __resetField: function() {
          this.state.field.reset();
          this.state.wasQuoting = false;
        },
        __push: function(record, push) {
          const { on_record } = this.options;
          if (on_record !== void 0) {
            const info2 = this.__infoRecord();
            try {
              record = on_record.call(null, record, info2);
            } catch (err) {
              return err;
            }
            if (record === void 0 || record === null) {
              return;
            }
          }
          push(record);
        },
        // Return a tuple with the error and the casted value
        __cast: function(field) {
          const { columns, relax_column_count } = this.options;
          const isColumns = Array.isArray(columns);
          if (isColumns === true && relax_column_count && this.options.columns.length <= this.state.record.length) {
            return [void 0, void 0];
          }
          if (this.state.castField !== null) {
            try {
              const info2 = this.__infoField();
              return [void 0, this.state.castField.call(null, field, info2)];
            } catch (err) {
              return [err];
            }
          }
          if (this.__isFloat(field)) {
            return [void 0, parseFloat(field)];
          } else if (this.options.cast_date !== false) {
            const info2 = this.__infoField();
            return [void 0, this.options.cast_date.call(null, field, info2)];
          }
          return [void 0, field];
        },
        // Helper to test if a character is a space or a line delimiter
        __isCharTrimable: function(buf, pos) {
          const isTrim = (buf2, pos2) => {
            const { timchars } = this.state;
            loop1: for (let i = 0; i < timchars.length; i++) {
              const timchar = timchars[i];
              for (let j = 0; j < timchar.length; j++) {
                if (timchar[j] !== buf2[pos2 + j]) continue loop1;
              }
              return timchar.length;
            }
            return 0;
          };
          return isTrim(buf, pos);
        },
        // Keep it in case we implement the `cast_int` option
        // __isInt(value){
        //   // return Number.isInteger(parseInt(value))
        //   // return !isNaN( parseInt( obj ) );
        //   return /^(\-|\+)?[1-9][0-9]*$/.test(value)
        // }
        __isFloat: function(value) {
          return value - parseFloat(value) + 1 >= 0;
        },
        __compareBytes: function(sourceBuf, targetBuf, targetPos, firstByte) {
          if (sourceBuf[0] !== firstByte) return 0;
          const sourceLength = sourceBuf.length;
          for (let i = 1; i < sourceLength; i++) {
            if (sourceBuf[i] !== targetBuf[targetPos + i]) return 0;
          }
          return sourceLength;
        },
        __isDelimiter: function(buf, pos, chr) {
          const { delimiter, ignore_last_delimiters } = this.options;
          if (ignore_last_delimiters === true && this.state.record.length === this.options.columns.length - 1) {
            return 0;
          } else if (ignore_last_delimiters !== false && typeof ignore_last_delimiters === "number" && this.state.record.length === ignore_last_delimiters - 1) {
            return 0;
          }
          loop1: for (let i = 0; i < delimiter.length; i++) {
            const del = delimiter[i];
            if (del[0] === chr) {
              for (let j = 1; j < del.length; j++) {
                if (del[j] !== buf[pos + j]) continue loop1;
              }
              return del.length;
            }
          }
          return 0;
        },
        __isRecordDelimiter: function(chr, buf, pos) {
          const { record_delimiter } = this.options;
          const recordDelimiterLength = record_delimiter.length;
          loop1: for (let i = 0; i < recordDelimiterLength; i++) {
            const rd = record_delimiter[i];
            const rdLength = rd.length;
            if (rd[0] !== chr) {
              continue;
            }
            for (let j = 1; j < rdLength; j++) {
              if (rd[j] !== buf[pos + j]) {
                continue loop1;
              }
            }
            return rd.length;
          }
          return 0;
        },
        __isEscape: function(buf, pos, chr) {
          const { escape } = this.options;
          if (escape === null) return false;
          const l = escape.length;
          if (escape[0] === chr) {
            for (let i = 0; i < l; i++) {
              if (escape[i] !== buf[pos + i]) {
                return false;
              }
            }
            return true;
          }
          return false;
        },
        __isQuote: function(buf, pos) {
          const { quote } = this.options;
          if (quote === null) return false;
          const l = quote.length;
          for (let i = 0; i < l; i++) {
            if (quote[i] !== buf[pos + i]) {
              return false;
            }
          }
          return true;
        },
        __autoDiscoverRecordDelimiter: function(buf, pos) {
          const { encoding } = this.options;
          const rds = [
            // Important, the windows line ending must be before mac os 9
            Buffer2.from("\r\n", encoding),
            Buffer2.from("\n", encoding),
            Buffer2.from("\r", encoding)
          ];
          loop: for (let i = 0; i < rds.length; i++) {
            const l = rds[i].length;
            for (let j = 0; j < l; j++) {
              if (rds[i][j] !== buf[pos + j]) {
                continue loop;
              }
            }
            this.options.record_delimiter.push(rds[i]);
            this.state.recordDelimiterMaxLength = rds[i].length;
            return rds[i].length;
          }
          return 0;
        },
        __error: function(msg) {
          const { encoding, raw, skip_records_with_error } = this.options;
          const err = typeof msg === "string" ? new Error(msg) : msg;
          if (skip_records_with_error) {
            this.state.recordHasError = true;
            if (this.options.on_skip !== void 0) {
              this.options.on_skip(
                err,
                raw ? this.state.rawBuffer.toString(encoding) : void 0
              );
            }
            return void 0;
          } else {
            return err;
          }
        },
        __infoDataSet: function() {
          return {
            ...this.info,
            columns: this.options.columns
          };
        },
        __infoRecord: function() {
          const { columns, raw, encoding } = this.options;
          return {
            ...this.__infoDataSet(),
            error: this.state.error,
            header: columns === true,
            index: this.state.record.length,
            raw: raw ? this.state.rawBuffer.toString(encoding) : void 0
          };
        },
        __infoField: function() {
          const { columns } = this.options;
          const isColumns = Array.isArray(columns);
          return {
            ...this.__infoRecord(),
            column: isColumns === true ? columns.length > this.state.record.length ? columns[this.state.record.length].name : null : this.state.record.length,
            quoting: this.state.wasQuoting
          };
        }
      };
    };
    parse2 = function(data, opts = {}) {
      if (typeof data === "string") {
        data = Buffer2.from(data);
      }
      const records = opts && opts.objname ? {} : [];
      const parser = transform2(opts);
      const push = (record) => {
        if (parser.options.objname === void 0) records.push(record);
        else {
          records[record[0]] = record[1];
        }
      };
      const close = () => {
      };
      const err1 = parser.parse(data, false, push, close);
      if (err1 !== void 0) throw err1;
      const err2 = parser.parse(void 0, true, push, close);
      if (err2 !== void 0) throw err2;
      return records;
    };
  }
});

// tools/data/scripts/read-core.js
var read_core_exports = {};
__export(read_core_exports, {
  readTable: () => readTable,
  toNumber: () => toNumber
});
function detectFormat(content, format) {
  if (format === "json") return { format: "json", delimiter: "" };
  if (format === "tsv") return { format: "delimited", delimiter: "	" };
  if (format === "csv") return { format: "delimited", delimiter: "," };
  const firstLine = content.split("\n")[0] || "";
  if (content.trimStart().startsWith("[") || content.trimStart().startsWith("{")) {
    return { format: "json", delimiter: "" };
  }
  if (firstLine.includes("	")) return { format: "delimited", delimiter: "	" };
  if (firstLine.includes(";") && !firstLine.includes(",")) return { format: "delimited", delimiter: ";" };
  if (firstLine.includes("|") && !firstLine.includes(",") && !firstLine.includes("	")) {
    return { format: "delimited", delimiter: "|" };
  }
  return { format: "delimited", delimiter: "," };
}
function toNumber(value) {
  if (value === null || value === void 0 || value === "") return null;
  const str = String(value).trim().replace(/[$,\s]/g, "");
  if (str === "") return null;
  const num = Number(str);
  return Number.isNaN(num) || !Number.isFinite(num) ? null : num;
}
function inferType(value) {
  if (value === null || value === void 0 || value === "") return null;
  const str = String(value).trim();
  if (str === "") return null;
  if (toNumber(str) !== null) return "number";
  if (["true", "false", "yes", "no"].includes(str.toLowerCase())) return "boolean";
  if (ISO_DATE_RE.test(str) || COMMON_DATE_RE.test(str)) return "date";
  return "string";
}
function detectColumnType(values) {
  const types = {};
  let nonNull = 0;
  for (const v of values) {
    const t = inferType(v);
    if (t !== null) {
      types[t] = (types[t] || 0) + 1;
      nonNull++;
    }
  }
  if (nonNull === 0) return "string";
  for (const [type, count] of Object.entries(types)) {
    if (count / nonNull >= TYPE_THRESHOLD) return type;
  }
  return "mixed";
}
function readJSON(content) {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const rows = parsed.filter(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return { rows, errors: [`${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`] };
      }
      return { rows, errors: [] };
    }
    return { rows: [], errors: ["JSON content is not an array of objects"] };
  } catch {
    return { rows: [], errors: ["The content could not be parsed as JSON"] };
  }
}
function readDelimited(content, delimiter) {
  try {
    const rows = parse2(content, {
      delimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
    return { rows, errors: [] };
  } catch {
    return {
      rows: [],
      errors: [`The content could not be parsed as delimited text with delimiter ${JSON.stringify(delimiter)}`]
    };
  }
}
function readTable(input) {
  const { content, format, delimiter: userDelimiter } = input;
  if (!content || content.trim() === "") {
    return { rows: [], columns: [], readErrors: ["File content is empty"] };
  }
  const detected = detectFormat(content, format);
  const effectiveDelimiter = userDelimiter || detected.delimiter;
  const { rows, errors } = detected.format === "json" ? readJSON(content) : readDelimited(content, effectiveDelimiter);
  if (rows.length === 0) {
    return { rows: [], columns: [], readErrors: errors.length > 0 ? errors : ["No data rows found"] };
  }
  const colNames = /* @__PURE__ */ new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) colNames.add(key);
  }
  const columns = Array.from(colNames).map((name) => ({
    name,
    type: detectColumnType(rows.map((row) => row[name]))
  }));
  return { rows, columns, readErrors: errors };
}
var TYPE_THRESHOLD, ISO_DATE_RE, COMMON_DATE_RE;
var init_read_core = __esm({
  "tools/data/scripts/read-core.js"() {
    init_sync2();
    TYPE_THRESHOLD = 0.8;
    ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
    COMMON_DATE_RE = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
  }
});

// tools/data/scripts/parse-core.js
var parse_core_exports = {};
__export(parse_core_exports, {
  executeParse: () => executeParse
});
function detectFormat2(content, format) {
  if (format === "json") return { format: "json", delimiter: "" };
  if (format === "tsv") return { format: "csv", delimiter: "	" };
  if (format === "csv") return { format: "csv", delimiter: "," };
  const firstLine = content.split("\n")[0] || "";
  if (content.trimStart().startsWith("[") || content.trimStart().startsWith("{")) {
    return { format: "json", delimiter: "" };
  }
  if (firstLine.includes("	")) return { format: "csv", delimiter: "	" };
  if (firstLine.includes(";") && !firstLine.includes(",")) return { format: "csv", delimiter: ";" };
  if (firstLine.includes("|") && !firstLine.includes(",") && !firstLine.includes("	")) {
    return { format: "csv", delimiter: "|" };
  }
  return { format: "csv", delimiter: "," };
}
function inferType2(value) {
  if (value === null || value === void 0 || value === "") return null;
  const str = String(value).trim();
  if (str === "") return null;
  const numStr = str.replace(/[$,\s]/g, "");
  if (numStr !== "" && !isNaN(Number(numStr)) && isFinite(Number(numStr))) return "number";
  if (["true", "false", "yes", "no"].includes(str.toLowerCase())) return "boolean";
  if (ISO_DATE_RE2.test(str) || COMMON_DATE_RE2.test(str)) return "date";
  return "string";
}
function detectColumnType2(values) {
  const types = {};
  let nonNull = 0;
  for (const v of values) {
    const t = inferType2(v);
    if (t !== null) {
      types[t] = (types[t] || 0) + 1;
      nonNull++;
    }
  }
  if (nonNull === 0) return "string";
  for (const [type, count] of Object.entries(types)) {
    if (count / nonNull >= TYPE_THRESHOLD2) return type;
  }
  return "mixed";
}
function parseJSON(content) {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      const rows = parsed.filter(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return { rows, errors: [`${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`] };
      }
      return { rows, errors: [] };
    }
    return { rows: [], errors: ["JSON content is not an array of objects"] };
  } catch {
    return { rows: [], errors: ["The content could not be parsed as JSON"] };
  }
}
function parseCSV(content, delimiter, hasHeader) {
  const errors = [];
  try {
    const records = parse2(content, {
      delimiter,
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
    if (!Array.isArray(records) || records.length === 0) {
      return { rows: [], errors, raggedRowCount: 0 };
    }
    let colNames;
    let dataRecords;
    if (hasHeader) {
      colNames = records[0].map((name, i) => {
        const text = name === null || name === void 0 ? "" : String(name).trim();
        return text === "" ? `column_${i + 1}` : text;
      });
      dataRecords = records.slice(1);
    } else {
      const width = Array.isArray(records[0]) ? records[0].length : 0;
      colNames = Array.from({ length: width }, (_, i) => `column_${i + 1}`);
      dataRecords = records;
    }
    const expectedWidth = colNames.length;
    let raggedRowCount = 0;
    const rows = dataRecords.map((row) => {
      if (!Array.isArray(row) || row.length !== expectedWidth) raggedRowCount += 1;
      const obj = /* @__PURE__ */ Object.create(null);
      for (let i = 0; i < expectedWidth; i += 1) {
        obj[colNames[i]] = i < row.length ? row[i] : null;
      }
      return obj;
    });
    if (raggedRowCount > 0) {
      errors.push(
        `${raggedRowCount} of ${dataRecords.length} data rows had a column count different from the header (${expectedWidth}); short rows filled missing columns as null and long rows dropped extra values`
      );
    }
    return { rows, errors, raggedRowCount };
  } catch {
    return { rows: [], errors: [`The content could not be parsed as delimited text with delimiter ${JSON.stringify(delimiter)}`], raggedRowCount: 0 };
  }
}
function executeParse(input) {
  const { content, delimiter: userDelimiter, hasHeader = true } = input;
  if (!content || content.trim() === "") {
    return { columns: [], rowCount: 0, raggedRowCount: 0, parseErrors: ["File content is empty"] };
  }
  const detected = detectFormat2(content, input.format);
  const effectiveDelimiter = userDelimiter || detected.delimiter;
  let rows;
  let errors;
  let raggedRowCount = 0;
  if (detected.format === "json") {
    ({ rows, errors } = parseJSON(content));
  } else {
    ({ rows, errors, raggedRowCount } = parseCSV(content, effectiveDelimiter, hasHeader));
  }
  if (rows.length === 0) {
    return {
      columns: [],
      rowCount: 0,
      raggedRowCount: 0,
      parseErrors: errors.length > 0 ? errors : ["No data rows found"]
    };
  }
  const colNamesSet = /* @__PURE__ */ new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) colNamesSet.add(key);
  }
  const colNames = Array.from(colNamesSet);
  const columns = colNames.map((name) => {
    const values = rows.map((row) => row[name]);
    const nonNullValues = values.filter((v) => v !== null && v !== void 0 && v !== "");
    const sampleValues = nonNullValues.slice(0, MAX_SAMPLE_VALUES).map((v) => typeof v === "string" ? v.trim() : v);
    return {
      name,
      type: detectColumnType2(values),
      nonNullCount: nonNullValues.length,
      sampleValues
    };
  });
  return { columns, rowCount: rows.length, raggedRowCount, parseErrors: errors };
}
var MAX_SAMPLE_VALUES, TYPE_THRESHOLD2, ISO_DATE_RE2, COMMON_DATE_RE2;
var init_parse_core = __esm({
  "tools/data/scripts/parse-core.js"() {
    init_sync2();
    MAX_SAMPLE_VALUES = 5;
    TYPE_THRESHOLD2 = 0.8;
    ISO_DATE_RE2 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
    COMMON_DATE_RE2 = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
  }
});

// tools/data/scripts/describe-core.js
var describe_core_exports = {};
__export(describe_core_exports, {
  executeDescribe: () => executeDescribe
});
function round(n) {
  return Math.round(n * 1e4) / 1e4;
}
function sumOf(values) {
  let total = 0;
  let carried = 0;
  for (const v of values) {
    const next = total + v;
    carried += Math.abs(total) >= Math.abs(v) ? total - next + v : v - next + total;
    total = next;
  }
  return total + carried;
}
function meanOf(values) {
  return sumOf(values) / values.length;
}
function stdDevOf(values) {
  const avg = meanOf(values);
  let squares = 0;
  for (const v of values) squares += (v - avg) * (v - avg);
  return Math.sqrt(squares / values.length);
}
function quantileOf(sorted, p) {
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}
function describeColumn(name, rows) {
  const values = [];
  let nullCount = 0;
  for (const row of rows) {
    const num = toNumber(row[name]);
    if (num === null) nullCount++;
    else values.push(num);
  }
  if (values.length === 0) {
    return { name, count: 0, mean: 0, median: 0, min: 0, max: 0, stdDev: 0, p25: 0, p75: 0, nullCount };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    name,
    count: values.length,
    mean: round(meanOf(values)),
    median: round(quantileOf(sorted, 0.5)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    stdDev: round(stdDevOf(values)),
    p25: round(quantileOf(sorted, 0.25)),
    p75: round(quantileOf(sorted, 0.75)),
    nullCount
  };
}
function executeDescribe(input) {
  const { content, format, delimiter, columns: requestedColumns } = input;
  const table = readTable({ content, format, delimiter });
  if (table.rows.length === 0) {
    return {
      columns: [],
      skippedColumns: [],
      totalRows: 0,
      errors: [...table.readErrors, "No data rows to analyze"]
    };
  }
  const errors = [...table.readErrors];
  const skippedColumns = [];
  const targetColumns = [];
  if (requestedColumns && requestedColumns.length > 0) {
    const available = table.columns.map((c) => c.name).join(", ");
    for (const name of requestedColumns) {
      const col = table.columns.find((c) => c.name === name);
      if (!col) {
        errors.push(`Column "${name}" not found. Available: ${available}`);
      } else if (col.type !== "number") {
        skippedColumns.push({
          name,
          reason: `type is "${col.type}", not numeric`
        });
        errors.push(`Column "${name}" is type "${col.type}", not numeric. Skipped.`);
      } else {
        targetColumns.push(col);
      }
    }
  } else {
    for (const col of table.columns) {
      if (col.type === "number") targetColumns.push(col);
      else skippedColumns.push({ name: col.name, reason: `type is "${col.type}", not numeric` });
    }
  }
  if (targetColumns.length === 0) {
    return {
      columns: [],
      skippedColumns,
      totalRows: table.rows.length,
      errors: [...errors, "No numeric columns to analyze"]
    };
  }
  return {
    columns: targetColumns.map((col) => describeColumn(col.name, table.rows)),
    skippedColumns,
    totalRows: table.rows.length,
    errors
  };
}
var init_describe_core = __esm({
  "tools/data/scripts/describe-core.js"() {
    init_read_core();
  }
});

// tools/data/scripts/aggregate-core.js
var aggregate_core_exports = {};
__export(aggregate_core_exports, {
  FUNCTIONS: () => FUNCTIONS,
  executeAggregate: () => executeAggregate
});
function detectFormat3(content, format) {
  if (format === "json") return { format: "json", delimiter: "" };
  if (format === "tsv") return { format: "csv", delimiter: "	" };
  if (format === "csv") return { format: "csv", delimiter: "," };
  const firstLine = content.split("\n")[0] || "";
  if (content.trimStart().startsWith("[") || content.trimStart().startsWith("{")) {
    return { format: "json", delimiter: "" };
  }
  if (firstLine.includes("	")) return { format: "csv", delimiter: "	" };
  if (firstLine.includes(";") && !firstLine.includes(",")) return { format: "csv", delimiter: ";" };
  if (firstLine.includes("|") && !firstLine.includes(",") && !firstLine.includes("	")) {
    return { format: "csv", delimiter: "|" };
  }
  return { format: "csv", delimiter: "," };
}
function inferType3(value) {
  if (value === null || value === void 0 || value === "") return null;
  const str = String(value).trim();
  if (str === "") return null;
  const numStr = str.replace(/[$,\s]/g, "");
  if (numStr !== "" && !isNaN(Number(numStr)) && isFinite(Number(numStr))) return "number";
  if (["true", "false", "yes", "no"].includes(str.toLowerCase())) return "boolean";
  if (ISO_DATE_RE3.test(str) || COMMON_DATE_RE3.test(str)) return "date";
  return "string";
}
function detectColumnType3(values) {
  const types = {};
  let nonNull = 0;
  for (const v of values) {
    const t = inferType3(v);
    if (t !== null) {
      types[t] = (types[t] || 0) + 1;
      nonNull++;
    }
  }
  if (nonNull === 0) return "string";
  for (const [type, count] of Object.entries(types)) {
    if (count / nonNull >= TYPE_THRESHOLD3) return type;
  }
  return "mixed";
}
function parseNumericValue(value) {
  if (value === null || value === void 0 || value === "") return null;
  const str = String(value).trim().replace(/[$,\s]/g, "");
  if (str === "") return null;
  const num = Number(str);
  return isNaN(num) || !isFinite(num) ? null : num;
}
function readRows(content, format, delimiter) {
  const detected = detectFormat3(content, format);
  const effectiveDelimiter = delimiter || detected.delimiter;
  if (detected.format === "json") {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return { rows: [], notes: ["JSON content is not an array of objects"] };
      }
      const rows = parsed.filter(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return {
          rows,
          notes: [`${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`]
        };
      }
      return { rows, notes: [] };
    } catch {
      return { rows: [], notes: ["The content could not be parsed as JSON"] };
    }
  }
  try {
    const records = parse2(content, {
      delimiter: effectiveDelimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
    return { rows: records, notes: [] };
  } catch {
    return {
      rows: [],
      notes: [`The content could not be parsed as delimited text with delimiter ${JSON.stringify(effectiveDelimiter)}`]
    };
  }
}
function columnTypes(rows) {
  const names = /* @__PURE__ */ new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) names.add(key);
  }
  const types = /* @__PURE__ */ new Map();
  for (const name of names) {
    types.set(name, detectColumnType3(rows.map((row) => row[name])));
  }
  return types;
}
function sum(values) {
  let total = 0;
  let compensation = 0;
  for (const v of values) {
    const next = total + v;
    compensation += Math.abs(total) >= Math.abs(v) ? total - next + v : v - next + total;
    total = next;
  }
  return total + compensation;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const half = sorted.length / 2;
  return sorted.length % 2 === 1 ? sorted[Math.floor(half)] : (sorted[half - 1] + sorted[half]) / 2;
}
function extreme(values, keepLeft) {
  let out = values[0];
  for (const v of values) {
    if (keepLeft(v, out)) out = v;
  }
  return out;
}
function round2(n) {
  return Math.round(n * 1e4) / 1e4;
}
function computeAggregate(values, fn) {
  if (values.length === 0) return fn === "count" || fn === "sum" ? 0 : null;
  switch (fn) {
    case "sum":
      return round2(sum(values));
    case "mean":
      return round2(sum(values) / values.length);
    case "median":
      return round2(median(values));
    case "min":
      return round2(extreme(values, (v, best) => v < best));
    case "max":
      return round2(extreme(values, (v, best) => v > best));
    case "count":
      return values.length;
    default:
      return 0;
  }
}
function noGroups(errors, totalRows = 0) {
  return { groups: [], groupCount: 0, totalRows, errors };
}
function executeAggregate(input) {
  const { content, format, delimiter, groupBy, metrics } = input;
  if (!Array.isArray(groupBy) || groupBy.length === 0) {
    return noGroups(["groupBy is required and must name at least one column"]);
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return noGroups(["metrics is required and must name at least one column and function"]);
  }
  if (!content || content.trim() === "") {
    return noGroups(["File content is empty", "No data rows to aggregate"]);
  }
  const { rows, notes } = readRows(content, format, delimiter);
  if (rows.length === 0) {
    return noGroups([...notes.length > 0 ? notes : ["No data rows found"], "No data rows to aggregate"]);
  }
  const types = columnTypes(rows);
  const available = [...types.keys()];
  const rejections = [];
  for (const col of groupBy) {
    if (!types.has(col)) {
      rejections.push(`groupBy column "${col}" not found. Available: ${available.join(", ")}`);
    }
  }
  for (const m of metrics) {
    if (!FUNCTIONS.includes(m.function)) {
      rejections.push(`Metric function "${m.function}" is not one of ${FUNCTIONS.join(", ")}`);
    } else if (!types.has(m.column)) {
      rejections.push(`Metric column "${m.column}" not found. Available: ${available.join(", ")}`);
    } else if (m.function !== "count" && types.get(m.column) !== "number") {
      rejections.push(
        `Metric column "${m.column}" is type "${types.get(m.column)}", not numeric. Only count works on a non-numeric column.`
      );
    }
  }
  if (rejections.length > 0) {
    return noGroups([...notes, ...rejections], rows.length);
  }
  const groupMap = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = {};
    for (const col of groupBy) key[col] = String(row[col] ?? "null");
    const id = JSON.stringify(groupBy.map((col) => key[col]));
    const existing = groupMap.get(id);
    if (existing) existing.rows.push(row);
    else groupMap.set(id, { key, rows: [row] });
  }
  const groups = [];
  for (const group of groupMap.values()) {
    const values = {};
    for (const m of metrics) {
      const field = `${m.column}_${m.function}`;
      if (m.function === "count") {
        values[field] = group.rows.length;
      } else {
        const numbers = [];
        for (const row of group.rows) {
          const num = parseNumericValue(row[m.column]);
          if (num !== null) numbers.push(num);
        }
        values[field] = computeAggregate(numbers, m.function);
      }
    }
    groups.push({ key: group.key, values });
  }
  groups.sort((a, b) => (a.key[groupBy[0]] ?? "").localeCompare(b.key[groupBy[0]] ?? ""));
  return { groups, groupCount: groups.length, totalRows: rows.length, errors: notes };
}
var TYPE_THRESHOLD3, ISO_DATE_RE3, COMMON_DATE_RE3, FUNCTIONS;
var init_aggregate_core = __esm({
  "tools/data/scripts/aggregate-core.js"() {
    init_sync2();
    TYPE_THRESHOLD3 = 0.8;
    ISO_DATE_RE3 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?/;
    COMMON_DATE_RE3 = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
    FUNCTIONS = ["sum", "mean", "median", "min", "max", "count"];
  }
});

// tools/data/scripts/compute-core.js
var compute_core_exports = {};
__export(compute_core_exports, {
  OPS: () => OPS,
  executeCompute: () => executeCompute,
  lookupField: () => lookupField
});
function isNumeric(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function lookupField(root, path) {
  const parts = String(path).split(".");
  let current = root;
  for (const part of parts) {
    if (current === null || current === void 0) return { found: false };
    if (Array.isArray(current)) {
      if (/^\d+$/.test(part)) {
        const index = Number(part);
        if (index >= current.length) return { found: false };
        current = current[index];
      } else {
        const hit = current.find(
          (item) => item !== null && typeof item === "object" && !Array.isArray(item) && item.name === part
        );
        if (!hit) return { found: false };
        current = hit;
      }
    } else if (typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, part)) return { found: false };
      current = current[part];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: current };
}
function roundTo(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
function notFinite(result) {
  const { value, ...rest } = result;
  return { ...rest, error: "the result is not a finite number" };
}
function executeCompute(input) {
  const { data, op, aField, bField, digits } = input;
  const aLookup = lookupField(data, aField);
  if (!aLookup.found || !isNumeric(aLookup.value)) {
    return { ok: false, field: aField };
  }
  const bLookup = lookupField(data, bField);
  if (!bLookup.found || !isNumeric(bLookup.value)) {
    return { ok: false, field: bField };
  }
  const a = aLookup.value;
  const b = bLookup.value;
  if ((op === "percentage" || op === "rate") && b === 0) {
    return {
      ok: true,
      result: {
        op,
        a: { field: aField, value: a },
        b: { field: bField, value: b },
        error: "b is zero"
      }
    };
  }
  let value;
  switch (op) {
    case "percentage":
      value = a / b * 100;
      break;
    case "difference":
      value = a - b;
      break;
    case "rate":
      value = a / b;
      break;
    default:
      return { ok: false, field: aField };
  }
  if (digits !== void 0) {
    value = roundTo(value, digits);
  }
  const result = {
    op,
    a: { field: aField, value: a },
    b: { field: bField, value: b },
    value
  };
  if (!Number.isFinite(value)) {
    return { ok: true, result: notFinite(result) };
  }
  return { ok: true, result };
}
var OPS;
var init_compute_core = __esm({
  "tools/data/scripts/compute-core.js"() {
    OPS = ["percentage", "difference", "rate"];
  }
});

// tools/data/scripts/chart-core.js
var chart_core_exports = {};
__export(chart_core_exports, {
  CHART_TYPES: () => CHART_TYPES,
  DEFAULT_HEIGHT: () => DEFAULT_HEIGHT,
  DEFAULT_WIDTH: () => DEFAULT_WIDTH,
  buildChart: () => buildChart,
  collectPoints: () => collectPoints,
  renderHtml: () => renderHtml,
  toNumber: () => toNumber2
});
function detectFormat4(content, format) {
  if (format === "json") return { format: "json", delimiter: "" };
  if (format === "tsv") return { format: "csv", delimiter: "	" };
  if (format === "csv") return { format: "csv", delimiter: "," };
  const firstLine = content.split("\n")[0] || "";
  if (content.trimStart().startsWith("[") || content.trimStart().startsWith("{")) {
    return { format: "json", delimiter: "" };
  }
  if (firstLine.includes("	")) return { format: "csv", delimiter: "	" };
  if (firstLine.includes(";") && !firstLine.includes(",")) return { format: "csv", delimiter: ";" };
  if (firstLine.includes("|") && !firstLine.includes(",") && !firstLine.includes("	")) {
    return { format: "csv", delimiter: "|" };
  }
  return { format: "csv", delimiter: "," };
}
function readRows2(content, format, delimiter) {
  if (!content || content.trim() === "") {
    return { rows: [], notes: ["File content is empty"] };
  }
  const detected = detectFormat4(content, format);
  const effectiveDelimiter = delimiter || detected.delimiter;
  if (detected.format === "json") {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return { rows: [], notes: ["JSON content is not an array of objects"] };
      }
      const rows = parsed.filter(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return {
          rows,
          notes: [
            `${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`
          ]
        };
      }
      return { rows, notes: [] };
    } catch {
      return { rows: [], notes: ["The content could not be parsed as JSON"] };
    }
  }
  try {
    const records = parse2(content, {
      delimiter: effectiveDelimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
    return { rows: records, notes: [] };
  } catch {
    return {
      rows: [],
      notes: [
        `The content could not be parsed as delimited text with delimiter ${JSON.stringify(effectiveDelimiter)}`
      ]
    };
  }
}
function columnNames(rows) {
  const names = /* @__PURE__ */ new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) names.add(key);
  }
  return [...names];
}
function toNumber2(value) {
  if (value === null || value === void 0 || value === "") return null;
  const str = String(value).trim().replace(/[$,\s]/g, "");
  if (str === "") return null;
  const num = Number(str);
  return Number.isNaN(num) || !Number.isFinite(num) ? null : num;
}
function escapeXml(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function niceMax(max) {
  if (!(max > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  let nice;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}
function formatTick(value) {
  if (Number.isInteger(value)) return String(value);
  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}
function collectPoints(rows, xColumn, yColumn) {
  const points = [];
  let skipped = 0;
  for (const row of rows) {
    const y = toNumber2(row[yColumn]);
    if (y === null) {
      skipped += 1;
      continue;
    }
    const rawX = row[xColumn];
    const x = rawX === null || rawX === void 0 || rawX === "" ? "" : String(rawX).trim();
    points.push({ x, y });
  }
  return { points, skipped };
}
function buildSvg(points, type, title, width, height) {
  const margin = { top: title ? 48 : 24, right: 24, bottom: 56, left: 56 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const maxY = niceMax(Math.max(...points.map((p) => p.y), 0));
  const minY = 0;
  const yScale = (v) => margin.top + plotH - (v - minY) / (maxY - minY || 1) * plotH;
  const tickCount = 5;
  const ticks = [];
  for (let i = 0; i <= tickCount; i += 1) {
    const value = maxY / tickCount * i;
    ticks.push(value);
  }
  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title || type + " chart")}">`
  );
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  if (title) {
    parts.push(
      `<text x="${width / 2}" y="28" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" font-weight="600" fill="#111827">${escapeXml(title)}</text>`
    );
  }
  for (const tick of ticks) {
    const y = yScale(tick);
    parts.push(
      `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`
    );
    parts.push(
      `<text x="${margin.left - 8}" y="${y + 4}" text-anchor="end" font-family="system-ui,sans-serif" font-size="11" fill="#6b7280">${escapeXml(formatTick(tick))}</text>`
    );
  }
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`
  );
  parts.push(
    `<line x1="${margin.left}" y1="${margin.top + plotH}" x2="${margin.left + plotW}" y2="${margin.top + plotH}" stroke="#9ca3af" stroke-width="1"/>`
  );
  if (type === "bar") {
    const gap = 0.2;
    const band = plotW / points.length;
    const barW = band * (1 - gap);
    points.forEach((point, index) => {
      const x = margin.left + band * index + (band - barW) / 2;
      const y = yScale(point.y);
      const h = margin.top + plotH - y;
      parts.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${Math.max(h, 0).toFixed(2)}" fill="#2563eb"/>`
      );
      const labelX = margin.left + band * index + band / 2;
      const label = point.x.length > 12 ? `${point.x.slice(0, 11)}...` : point.x;
      parts.push(
        `<text x="${labelX.toFixed(2)}" y="${margin.top + plotH + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#374151">${escapeXml(label)}</text>`
      );
    });
  } else {
    const n = points.length;
    const xAt = (index) => n === 1 ? margin.left + plotW / 2 : margin.left + plotW * index / (n - 1);
    const coords = points.map((point, index) => ({
      x: xAt(index),
      y: yScale(point.y),
      label: point.x
    }));
    if (coords.length > 1) {
      const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(" ");
      parts.push(`<path d="${d}" fill="none" stroke="#2563eb" stroke-width="2"/>`);
    }
    for (const c of coords) {
      parts.push(
        `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="3.5" fill="#2563eb"/>`
      );
      const label = c.label.length > 12 ? `${c.label.slice(0, 11)}...` : c.label;
      parts.push(
        `<text x="${c.x.toFixed(2)}" y="${margin.top + plotH + 18}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#374151">${escapeXml(label)}</text>`
      );
    }
  }
  parts.push("</svg>");
  return parts.join("");
}
function renderHtml({ points, type, title, width, height }) {
  const safeTitle = title || `${type} chart`;
  const svg = buildSvg(points, type, title, width, height);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(safeTitle)}</title>
<style>
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; color: #111827; background: #f9fafb; }
  .frame { max-width: ${width + 32}px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px; }
  svg { display: block; max-width: 100%; height: auto; }
</style>
</head>
<body>
<div class="frame">
${svg}
</div>
</body>
</html>
`;
}
function buildChart(input) {
  const {
    content,
    x,
    y,
    type = "bar",
    title = "",
    format,
    delimiter,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT
  } = input;
  if (!x || String(x).trim() === "") {
    return { ok: false, errors: ["x is required and must name the category column"] };
  }
  if (!y || String(y).trim() === "") {
    return { ok: false, errors: ["y is required and must name the numeric column"] };
  }
  if (!CHART_TYPES.includes(type)) {
    return { ok: false, errors: [`type "${type}" is not one of ${CHART_TYPES.join(", ")}`] };
  }
  const { rows, notes } = readRows2(content, format, delimiter);
  if (rows.length === 0) {
    return {
      ok: false,
      errors: notes.length > 0 ? notes : ["No data rows found"]
    };
  }
  const available = columnNames(rows);
  const rejections = [];
  if (!available.includes(x)) {
    rejections.push(`x column "${x}" not found. Available: ${available.join(", ")}`);
  }
  if (!available.includes(y)) {
    rejections.push(`y column "${y}" not found. Available: ${available.join(", ")}`);
  }
  if (rejections.length > 0) {
    return { ok: false, errors: [...notes, ...rejections] };
  }
  const { points, skipped } = collectPoints(rows, x, y);
  if (points.length === 0) {
    return {
      ok: false,
      errors: [
        ...notes,
        `No numeric values found in y column "${y}". Every row was empty or non-numeric after stripping $, commas, and spaces.`
      ]
    };
  }
  const html = renderHtml({ points, type, title, width, height });
  return {
    ok: true,
    html,
    type,
    points: points.length,
    width,
    height,
    skipped,
    notes
  };
}
var CHART_TYPES, DEFAULT_WIDTH, DEFAULT_HEIGHT;
var init_chart_core = __esm({
  "tools/data/scripts/chart-core.js"() {
    init_sync2();
    CHART_TYPES = ["bar", "line"];
    DEFAULT_WIDTH = 720;
    DEFAULT_HEIGHT = 400;
  }
});

// tools/data/scripts/data-core.js
var data_core_exports = {};
__export(data_core_exports, {
  MAX_ANSWER_CHARACTERS: () => MAX_ANSWER_CHARACTERS,
  MAX_COLUMNS: () => MAX_COLUMNS,
  MAX_INPUT_BYTES: () => MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES: () => MAX_OUTPUT_BYTES,
  MAX_ROWS: () => MAX_ROWS,
  MAX_TABLE_CELLS: () => MAX_TABLE_CELLS,
  checkDataOutput: () => checkDataOutput,
  runData: () => runData
});
function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !commands.has(input.command)) problem("choose a hosted data command: parse, describe, aggregate, chart, compute.");
  for (const key of ["format", "delimiter", "columnsList", "x", "y", "type", "title", "output", "op", "aField", "bField"]) {
    if (input[key] !== void 0 && typeof input[key] !== "string") problem(`${key} must be text.`);
  }
  if (input.format !== void 0 && !["csv", "tsv", "json"].includes(input.format)) problem("format must be csv, tsv, or json.");
  if (input.delimiter !== void 0 && (input.delimiter.length < 1 || input.delimiter.length > 8)) problem("delimiter must be 1 to 8 characters.");
  if (input.hasHeader !== void 0 && typeof input.hasHeader !== "boolean") problem("hasHeader must be a boolean.");
  for (const key of ["columns", "groupBy"]) {
    if (input[key] !== void 0 && (!Array.isArray(input[key]) || input[key].some((v) => typeof v !== "string"))) problem(`${key} must be an array of column names.`);
  }
  if (input.metrics !== void 0 && (!Array.isArray(input.metrics) || input.metrics.some((m) => !m || typeof m.column !== "string" || typeof m.function !== "string"))) problem("metrics must contain column and function strings.");
  if (input.command === "compute") {
    if (!["percentage", "difference", "rate"].includes(input.op) || !input.aField || !input.bField) problem("compute needs op (percentage, difference, rate), aField and bField.");
    if (input.format !== void 0 && input.format !== "json") problem("compute reads a JSON object.");
    if (input.digits !== void 0 && (!Number.isInteger(input.digits) || input.digits < 0 || input.digits > 20)) problem("digits must be an integer from 0 to 20.");
  }
}
function tableBudget(rows, columns) {
  if (rows > MAX_ROWS) throw new TableLimitError("Error: the table exceeds 50,000 data rows; use a smaller file.");
  if (columns > MAX_COLUMNS) throw new TableLimitError("Error: the table exceeds 2,048 columns; use a smaller file.");
  if (rows * columns > MAX_TABLE_CELLS) throw new TableLimitError("Error: the table exceeds 250,000 row-by-column cells; use a smaller file.");
}
function checkDelimitedFields(content, delimiter) {
  let fields = 1, quoted = false, fieldStart = true;
  let recordDelimiter;
  for (let i = 0; i < content.length; i++) {
    const character = content[i];
    if (quoted) {
      if (character === '"') {
        if (content[i + 1] === '"') {
          fieldStart = false;
          i++;
        } else quoted = false;
      } else fieldStart = false;
      continue;
    }
    if (recordDelimiter === void 0 && (character === "\r" || character === "\n")) {
      recordDelimiter = character === "\r" && content[i + 1] === "\n" ? "\r\n" : character;
    }
    if (character === '"') {
      if (!fieldStart) return;
      quoted = true;
    } else if (recordDelimiter && content.startsWith(recordDelimiter, i)) {
      fields = 1;
      fieldStart = true;
      i += recordDelimiter.length - 1;
    } else if (content.startsWith(delimiter, i)) {
      if (++fields > MAX_COLUMNS) tableBudget(0, fields);
      fieldStart = true;
      i += delimiter.length - 1;
    } else if (!" 	\r\n\f".includes(character)) {
      fieldStart = false;
    }
  }
}
async function checkTableWork(input, content) {
  if (input.command === "compute" || !content.trim()) return;
  const first = content.trimStart()[0];
  if (input.format === "json" || input.format === void 0 && (first === "[" || first === "{")) {
    let data;
    try {
      data = JSON.parse(content);
    } catch {
      return;
    }
    if (!Array.isArray(data)) return;
    let rows = 0;
    const names = /* @__PURE__ */ new Set();
    for (const row of data) {
      if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
      rows++;
      for (const key of Object.keys(row)) names.add(key);
      tableBudget(rows, names.size);
    }
    return;
  }
  const firstLine = content.split("\n", 1)[0];
  const detected = input.format === "tsv" ? "	" : input.format === "csv" ? "," : firstLine.includes("	") ? "	" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : firstLine.includes("|") && !firstLine.includes(",") ? "|" : ",";
  const delimiter = input.delimiter || detected;
  checkDelimitedFields(content, delimiter);
  const { parse: parse3 } = await Promise.resolve().then(() => (init_sync2(), sync_exports2));
  let records = 0, columns = 0;
  const hasHeader = input.command !== "parse" || input.hasHeader !== false;
  try {
    parse3(content, {
      delimiter,
      columns: false,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      on_record(record) {
        records++;
        if (records === 1) columns = record.length;
        tableBudget(records - (hasHeader ? 1 : 0), columns);
        return null;
      }
    });
  } catch (error) {
    if (error instanceof TableLimitError) throw error;
  }
}
async function describeColumns(input, content) {
  if (input.columnsList === void 0) return input.columns;
  if (input.columns?.length) problem("--column and --columns were both given. Use --column for one header, including a header that contains a comma; --columns cannot name such a header.");
  const parts = input.columnsList.split(",").map((name) => name.trim()).filter(Boolean);
  if (!parts.length) problem("--columns needs at least one column name. Omit it to describe every numeric column.");
  const { readTable: readTable2 } = await Promise.resolve().then(() => (init_read_core(), read_core_exports));
  const headers = readTable2({ ...input, content }).columns.map((column) => column.name).filter((name) => typeof name === "string");
  const names = new Set(headers);
  if (!parts.every((name) => names.has(name))) {
    for (const name of headers) {
      if (name.includes(",") && input.columnsList.includes(name)) problem(`--columns cannot name a header that contains a comma ("${name}"). Use --column for that header.`);
    }
  }
  return parts;
}
function checkDataOutput(result) {
  const answer = result?.files ? result.answer : result;
  if (JSON.stringify(answer).length > MAX_ANSWER_CHARACTERS) problem("the answer exceeds 48,000 serialized characters; request a smaller result.");
  if (result?.files?.reduce((total, file) => total + file.bytes.byteLength, 0) > MAX_OUTPUT_BYTES) problem("output files exceed 4 MiB in total; use a smaller input.");
  return result;
}
async function runData(input, files) {
  validate(input);
  if (!Array.isArray(files) || files.length !== 1 || typeof files[0]?.name !== "string" || typeof files[0]?.mediaType !== "string" || !(files[0]?.bytes instanceof Uint8Array)) problem("supply exactly one file with name, mediaType and Uint8Array bytes.");
  const file = files[0];
  if (file.bytes.byteLength > MAX_INPUT_BYTES) problem("the input file exceeds 8 MiB; use a smaller file.");
  const content = new TextDecoder("utf-8", { ignoreBOM: true }).decode(file.bytes);
  await checkTableWork(input, content);
  const args = { ...input, content };
  let result;
  switch (input.command) {
    case "parse":
      result = (await Promise.resolve().then(() => (init_parse_core(), parse_core_exports))).executeParse(args);
      break;
    case "describe":
      result = (await Promise.resolve().then(() => (init_describe_core(), describe_core_exports))).executeDescribe({ ...args, columns: await describeColumns(input, content) });
      break;
    case "aggregate":
      result = (await Promise.resolve().then(() => (init_aggregate_core(), aggregate_core_exports))).executeAggregate(args);
      break;
    case "compute": {
      let data;
      try {
        data = JSON.parse(content);
      } catch {
        problem(`${file.name} is not valid JSON. Pass a file holding one JSON object, such as a saved aggregate or describe result.`);
      }
      if (data === null || typeof data !== "object" || Array.isArray(data)) problem(`${file.name} does not hold one JSON object. Pass a file holding one JSON object, such as a saved aggregate or describe result.`);
      const computed = (await Promise.resolve().then(() => (init_compute_core(), compute_core_exports))).executeCompute({ ...input, data });
      if (!computed.ok) problem(`field ${computed.field} is missing or not a number in ${file.name}`);
      result = computed.result;
      break;
    }
    case "chart": {
      const built = (await Promise.resolve().then(() => (init_chart_core(), chart_core_exports))).buildChart(args);
      if (!built.ok) problem(built.errors.join("; "));
      const output = input.output ?? "chart.html";
      const name = output.split(/[\\/]/).pop();
      if (!name || !/\.html$/i.test(name)) problem("chart output must name an .html file.");
      const { type, points, width, height, skipped, notes } = built;
      result = {
        answer: { output, type, points, width, height, skipped, notes },
        files: [{ name, mediaType: "text/html", bytes: new TextEncoder().encode(built.html) }]
      };
    }
  }
  return checkDataOutput(result);
}
var MAX_INPUT_BYTES, MAX_ANSWER_CHARACTERS, MAX_OUTPUT_BYTES, MAX_ROWS, MAX_COLUMNS, MAX_TABLE_CELLS, commands, problem, TableLimitError;
var init_data_core = __esm({
  "tools/data/scripts/data-core.js"() {
    MAX_INPUT_BYTES = 8 * 1024 * 1024;
    MAX_ANSWER_CHARACTERS = 48e3;
    MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
    MAX_ROWS = 5e4;
    MAX_COLUMNS = 2048;
    MAX_TABLE_CELLS = 25e4;
    commands = /* @__PURE__ */ new Set(["parse", "describe", "aggregate", "chart", "compute"]);
    problem = (message) => {
      throw new Error(`Error: ${message}`);
    };
    TableLimitError = class extends Error {
    };
  }
});

// tools/data/scripts/join-core.js
var join_core_exports = {};
__export(join_core_exports, {
  HOW: () => HOW,
  executeJoin: () => executeJoin
});
function detectFormat5(content, format) {
  if (format === "json") return { format: "json", delimiter: "" };
  if (format === "tsv") return { format: "csv", delimiter: "	" };
  if (format === "csv") return { format: "csv", delimiter: "," };
  const firstLine = content.split("\n")[0] || "";
  if (content.trimStart().startsWith("[") || content.trimStart().startsWith("{")) {
    return { format: "json", delimiter: "" };
  }
  if (firstLine.includes("	")) return { format: "csv", delimiter: "	" };
  if (firstLine.includes(";") && !firstLine.includes(",")) return { format: "csv", delimiter: ";" };
  if (firstLine.includes("|") && !firstLine.includes(",") && !firstLine.includes("	")) {
    return { format: "csv", delimiter: "|" };
  }
  return { format: "csv", delimiter: "," };
}
function readRows3(content, format, delimiter, side) {
  if (!content || content.trim() === "") {
    return { rows: [], notes: [`${side} file content is empty`] };
  }
  const detected = detectFormat5(content, format);
  const effectiveDelimiter = delimiter || detected.delimiter;
  if (detected.format === "json") {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) {
        return { rows: [], notes: [`${side}: JSON content is not an array of objects`] };
      }
      const rows = parsed.filter(
        (item) => typeof item === "object" && item !== null && !Array.isArray(item)
      );
      if (rows.length < parsed.length) {
        return {
          rows,
          notes: [
            `${side}: ${parsed.length - rows.length} of ${parsed.length} array entries were not objects and were skipped`
          ]
        };
      }
      return { rows, notes: [] };
    } catch {
      return { rows: [], notes: [`${side}: the content could not be parsed as JSON`] };
    }
  }
  try {
    const records = parse(content, {
      delimiter: effectiveDelimiter,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true
    });
    return { rows: records, notes: [] };
  } catch {
    return {
      rows: [],
      notes: [
        `${side}: the content could not be parsed as delimited text with delimiter ${JSON.stringify(effectiveDelimiter)}`
      ]
    };
  }
}
function columnNames2(rows) {
  const names = /* @__PURE__ */ new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) names.add(key);
  }
  return [...names];
}
function keyOf(value) {
  if (value === null || value === void 0) return "null";
  return String(value);
}
function emptyResult(errors, extras = {}) {
  return {
    columns: [],
    rows: [],
    leftRows: extras.leftRows ?? 0,
    rightRows: extras.rightRows ?? 0,
    matchedRows: 0,
    how: extras.how ?? "inner",
    on: extras.on ?? "",
    errors
  };
}
function resultColumns(leftNames, rightNames, on) {
  const leftSet = new Set(leftNames);
  const columns = [...leftNames];
  for (const name of rightNames) {
    if (name === on) continue;
    if (leftSet.has(name)) columns.push(`${name}_right`);
    else columns.push(name);
  }
  return columns;
}
function mapRightColumn(name, on, leftSet) {
  if (name === on) return null;
  if (leftSet.has(name)) return `${name}_right`;
  return name;
}
function executeJoin(input) {
  const { leftContent, rightContent, on, format, delimiter } = input;
  const how = input.how ?? "inner";
  if (!on || String(on).trim() === "") {
    return emptyResult(["on is required and must name the key column present on both sides"], { how, on: on ?? "" });
  }
  if (!HOW.includes(how)) {
    return emptyResult([`how "${how}" is not one of ${HOW.join(", ")}`], { how, on });
  }
  const left = readRows3(leftContent, format, delimiter, "left");
  const right = readRows3(rightContent, format, delimiter, "right");
  const notes = [...left.notes, ...right.notes];
  if (left.rows.length === 0) {
    return emptyResult(
      [...notes, ...left.notes.length > 0 ? [] : ["left: no data rows found"]],
      { leftRows: 0, rightRows: right.rows.length, how, on }
    );
  }
  if (right.rows.length === 0 && how === "inner") {
    return emptyResult(
      [...notes, ...right.notes.length > 0 ? [] : ["right: no data rows found"]],
      { leftRows: left.rows.length, rightRows: 0, how, on }
    );
  }
  const leftNames = columnNames2(left.rows);
  const rightNames = columnNames2(right.rows);
  const rejections = [];
  if (!leftNames.includes(on)) {
    rejections.push(
      `left key column "${on}" not found. Available: ${leftNames.join(", ") || "(none)"}`
    );
  }
  if (right.rows.length > 0 && !rightNames.includes(on)) {
    rejections.push(
      `right key column "${on}" not found. Available: ${rightNames.join(", ") || "(none)"}`
    );
  }
  if (rejections.length > 0) {
    return emptyResult([...notes, ...rejections], {
      leftRows: left.rows.length,
      rightRows: right.rows.length,
      how,
      on
    });
  }
  const rightIndex = /* @__PURE__ */ new Map();
  for (const row of right.rows) {
    const key = keyOf(row[on]);
    const bucket = rightIndex.get(key);
    if (bucket) bucket.push(row);
    else rightIndex.set(key, [row]);
  }
  const leftSet = new Set(leftNames);
  const columns = resultColumns(leftNames, rightNames, on);
  const rows = [];
  let matchedRows = 0;
  for (const leftRow of left.rows) {
    const key = keyOf(leftRow[on]);
    const matches = rightIndex.get(key);
    if (matches && matches.length > 0) {
      for (const rightRow of matches) {
        const out = {};
        for (const name of leftNames) out[name] = leftRow[name] ?? null;
        for (const name of rightNames) {
          const dest = mapRightColumn(name, on, leftSet);
          if (dest === null) continue;
          out[dest] = rightRow[name] ?? null;
        }
        rows.push(out);
        matchedRows += 1;
      }
    } else if (how === "left") {
      const out = {};
      for (const name of leftNames) out[name] = leftRow[name] ?? null;
      for (const name of rightNames) {
        const dest = mapRightColumn(name, on, leftSet);
        if (dest === null) continue;
        out[dest] = null;
      }
      rows.push(out);
    }
  }
  return {
    columns,
    rows,
    leftRows: left.rows.length,
    rightRows: right.rows.length,
    matchedRows,
    how,
    on,
    errors: notes
  };
}
var HOW;
var init_join_core = __esm({
  "tools/data/scripts/join-core.js"() {
    init_sync();
    HOW = ["inner", "left"];
  }
});

// tools/data/scripts/data.js
import { execFileSync } from "node:child_process";
import {
  accessSync,
  constants as constants2,
  existsSync as existsSync3,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync3,
  realpathSync as realpathSync3,
  statSync as statSync2,
  writeFileSync as writeFileSync2
} from "node:fs";
import { basename as basename2, dirname as dirname3, isAbsolute, join as join4, resolve as resolve2, sep as sep2 } from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL as pathToFileURL2 } from "node:url";
var HERE = realpathSync3(fileURLToPath2(import.meta.url));
var { compiledEntry: compiledEntry2, isMain: isMain2, packagesAvailable: packagesAvailable2 } = await (true ? Promise.resolve().then(() => (init_one_file(), one_file_exports)) : import(new URL("../../lib/one-file.js", pathToFileURL2(HERE)).href));
var { INSTALL_HELP: INSTALL_HELP2, installQuestion: installQuestion2, formatInstallSize: formatInstallSize2, INSTALL_BYTES: INSTALL_BYTES2, installAuthorised: installAuthorised2, parsedInstallFlag: parsedInstallFlag2, writeConsent: writeConsent2 } = await (true ? Promise.resolve().then(() => (init_consent(), consent_exports)) : import(new URL("../../lib/consent.js", pathToFileURL2(HERE)).href));
var SCRIPT_DIR = dirname3(HERE);
var TOOL_DIR = resolve2(SCRIPT_DIR, "..");
var DEP_MARKER = join4(TOOL_DIR, "node_modules", "csv-parse", "package.json");
async function loadPackages(command) {
  if (command === "compute") return;
  if (command === "join") await Promise.resolve().then(() => (init_sync(), sync_exports));
  else await Promise.resolve().then(() => (init_sync2(), sync_exports2));
}
var FORMATS = /* @__PURE__ */ new Set(["csv", "json", "tsv"]);
var SUBCOMMANDS = /* @__PURE__ */ new Set(["parse", "describe", "aggregate", "join", "chart", "compute"]);
var FUNCTIONS2 = /* @__PURE__ */ new Set(["sum", "mean", "median", "min", "max", "count"]);
var HOW2 = /* @__PURE__ */ new Set(["inner", "left"]);
var TYPES = /* @__PURE__ */ new Set(["bar", "line"]);
var OPS2 = /* @__PURE__ */ new Set(["percentage", "difference", "rate"]);
var USAGE = `data - parse, describe, aggregate, join, chart, and compute over data files

Usage:
  node scripts/data.js help
  node scripts/data.js parse --file <path> [--format csv|json|tsv] [--delimiter <char>] [--no-header]
  node scripts/data.js describe --file <path> [--format csv|json|tsv] [--delimiter <char>] [--columns a,b]
                                [--column <name> ...]
  node scripts/data.js aggregate --file <path> --group-by <column> --metric <column>:<function>
                                 [--group-by <column> ...] [--metric <column>:<function> ...]
                                 [--format csv|json|tsv] [--delimiter <char>]
  node scripts/data.js join --left <path> --right <path> --on <column>
                            [--how inner|left] [--format csv|json|tsv] [--delimiter <char>]
  node scripts/data.js chart --file <path> --x <column> --y <column> --output <path.html>
                             [--type bar|line] [--title <text>] [--format csv|json|tsv]
                             [--delimiter <char>] [--overwrite]
  node scripts/data.js compute --file <path> --op <percentage|difference|rate> --a <field> --b <field>
                               [--digits <n>] [--format <fmt>] [--delimiter <char>]

Commands:
  parse            Read a file and report its columns, types, and row count
  describe         Compute count, mean, median, min, max, standard deviation,
                   p25, p75, and null count for each numeric column
  aggregate        Group a file's rows and compute each metric over each group
  join             Join two files on a named key column
  chart            Read a file, build the chart HTML, write it to --output
  compute          Compute a percentage, difference, or rate from two numeric fields
  help             Print this message

Run "node scripts/data.js <command> help" for that command's options.

  --install          ${INSTALL_HELP2}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Reads the files the caller names. chart writes one HTML file; the others write
nothing. Needs no credentials and no configuration file, so no command takes --env.
Success prints one JSON object to stdout; a file it cannot read or a bad option go
to stderr with exit 1.`;
var PARSE_USAGE = `data parse - parse a CSV, JSON, or TSV file into a column profile

Usage:
  node scripts/data.js parse help
  node scripts/data.js parse --file <path> [--format csv|json|tsv] [--delimiter <char>] [--no-header]

Commands:
  parse            Read the file and report its columns, types, and row count
  help             Print this message

Options:
  --file <path>    Data file to parse (absolute path), outside this tool
                   directory. Required.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --no-header      Treat the first row as data; columns are named column_1, column_2, ...
  --install          ${INSTALL_HELP2}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Reads one file the caller names and writes nothing. Needs no credentials and no
configuration file, so no command takes --env. Success prints one JSON object to
stdout; a file it cannot read or a bad option go to stderr with exit 1. Malformed
data is not a failure: it comes back inside the JSON as parseErrors with exit 0.`;
var DESCRIBE_USAGE = `data describe - descriptive statistics for the numeric columns of a data file

Usage:
  node scripts/data.js describe help
  node scripts/data.js describe --file <path> [--format csv|json|tsv] [--delimiter <char>] [--columns a,b]
                                [--column <name> ...]

Commands:
  describe         Compute count, mean, median, min, max, standard deviation,
                   p25, p75, and null count for each numeric column
  help             Print this message

Options:
  --file <path>    Data file to read (absolute path), outside this tool
                   directory. Required.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --columns <list> Comma-separated column names to describe. Split names are
                   resolved against the file's headers. A name that cannot be
                   represented, because a header contains a comma, is refused.
                   Omit for every numeric column. Not valid with --column.
  --column <name>  One header, repeated to name more. The argument after this
                   flag is the name, including a name that contains commas or
                   starts with --. Not valid with --columns.
  --install          ${INSTALL_HELP2}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Reads one file the caller names and writes nothing. Needs no credentials and no
configuration file, so no command takes --env. The first row of a delimited file
is read as its header. Success prints one JSON object to stdout; a bad option or
a file that cannot be opened goes to stderr with exit 1. Anything that took
reading the file to discover, an unparseable file, a column that is not there, a
column that is not numeric, comes back inside the JSON as errors with exit 0.`;
var AGGREGATE_USAGE = `data aggregate - group a CSV, JSON, or TSV file's rows and aggregate them

Usage:
  node scripts/data.js aggregate help
  node scripts/data.js aggregate --file <path> --group-by <column> --metric <column>:<function>
                                 [--group-by <column> ...] [--metric <column>:<function> ...]
                                 [--format csv|json|tsv] [--delimiter <char>]

Commands:
  aggregate        Group the file's rows and compute each metric over each group
  help             Print this message

Options:
  --file <path>    Data file to read (absolute path), outside this tool
                   directory. Required.
  --group-by <col> Column whose values form the groups. Required, repeatable;
                   repeat it to group by a tuple, in the order given.
  --metric <spec>  Column and function to compute, as <column>:<function>.
                   Required, repeatable. Functions: sum, mean, median, min, max, count.
                   The column name is everything before the last colon.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --install          ${INSTALL_HELP2}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Reads one file the caller names and writes nothing. Needs no credentials and no
configuration file, so no command takes --env. Success prints one JSON object to
stdout; a file it cannot read or a bad option go to stderr with exit 1. A column
that is missing or not numeric is not a failure: it comes back inside the JSON as
errors, with an empty group list and exit 0.`;
var JOIN_USAGE = `data join - join two CSV, JSON, or TSV files on a shared key column

Usage:
  node scripts/data.js join help
  node scripts/data.js join --left <path> --right <path> --on <column>
                            [--how inner|left] [--format csv|json|tsv] [--delimiter <char>]

Commands:
  join             Join the two files on the named key column
  help             Print this message

Options:
  --left <path>    Left data file (absolute path), outside this tool directory. Required.
  --right <path>   Right data file (absolute path), outside this tool directory. Required.
  --on <column>    Key column present on both sides. Required.
  --how <mode>     inner (default) or left.
  --format <fmt>   Force csv, json, or tsv on both sides. Omit to auto-detect each side.
  --delimiter <c>  Field delimiter for delimited text on both sides. Omit to auto-detect.
  --install          ${INSTALL_HELP2}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Reads the two files the caller names and writes nothing. Needs no credentials and
no configuration file, so no command takes --env. Success prints one JSON object
to stdout; a file it cannot read or a bad option go to stderr with exit 1. A key
column that is missing is not a failure: it comes back inside the JSON as errors,
with an empty row list and exit 0.`;
var CHART_USAGE = `data chart - build a self-contained HTML SVG bar or line chart from a data file

Usage:
  node scripts/data.js chart help
  node scripts/data.js chart --file <path> --x <column> --y <column> --output <path.html>
                             [--type bar|line] [--title <text>] [--format csv|json|tsv]
                             [--delimiter <char>] [--overwrite]

Commands:
  chart            Read the file, build the chart HTML, write it to --output
  help             Print this message

Options:
  --file <path>    Data file to read (absolute path), outside this tool directory. Required.
  --x <column>     Category (label) column. Required.
  --y <column>     Numeric value column. Required.
  --output <path>  HTML file to write, absolute, ending .html, outside this tool
                   directory. Required. Missing folders on the way are created.
  --type <kind>    bar (default) or line.
  --title <text>   Optional chart title drawn above the plot.
  --format <fmt>   Force csv, json, or tsv. Omit to auto-detect from the content.
  --delimiter <c>  Field delimiter for delimited text. Omit to auto-detect.
  --overwrite      Replace a file already at --output. Without it, an occupied
                   path is refused and nothing is written.
  --install          ${INSTALL_HELP2}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Reads one file and writes one HTML file. The HTML is self-contained: inline SVG,
no network, no external scripts. Needs no credentials and no configuration file,
so no command takes --env. Success prints one JSON object to stdout; failures go
to stderr with exit 1.`;
var COMPUTE_USAGE = `data compute - compute a percentage, difference, or rate from two numeric fields

Usage:
  node scripts/data.js compute help
  node scripts/data.js compute --file <path> --op <percentage|difference|rate> --a <field> --b <field>
                               [--digits <n>] [--format <fmt>] [--delimiter <char>]

Commands:
  compute          Compute a percentage, difference, or rate from two numeric fields
  help             Print this message

Options:
  --file <path>    JSON file to read (absolute path), outside this tool
                   directory. One object, such as the output of aggregate or
                   describe, or an object with a top-level rows array. Required.
  --op <op>        percentage (a / b * 100), difference (a - b), or rate (a / b). Required.
  --a <field>      Numeric field for a, a dotted path where nested. Required.
  --b <field>      Numeric field for b, a dotted path where nested. Required.
  --digits <n>     Round the result to this many decimal places. Omit to leave
                   the JavaScript double unrounded.
  --format <fmt>   Force json. Omit to read the file as JSON.
  --delimiter <c>  Accepted; compute reads JSON, so the delimiter is unused.
  --install          ${INSTALL_HELP2}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h       Print this message

Reads one JSON object the caller names and writes nothing. Needs no credentials
and no configuration file, so no command takes --env. Success prints one JSON
object to stdout; a missing or non-numeric field, a file it cannot read, or a
bad option go to stderr with exit 1. A zero b for percentage or rate is not a
failure: it comes back on stdout as error "b is zero" with exit 0.`;
var SUB_USAGE = {
  parse: PARSE_USAGE,
  describe: DESCRIBE_USAGE,
  aggregate: AGGREGATE_USAGE,
  join: JOIN_USAGE,
  chart: CHART_USAGE,
  compute: COMPUTE_USAGE
};
function fail(message) {
  process.stderr.write(`${message}
`);
  process.exit(1);
}
function helpRef(command) {
  return `node scripts/data.js ${command} help`;
}
function canonical(name, candidate) {
  const absolute = resolve2(candidate);
  const missing = [];
  let head = absolute;
  for (; ; ) {
    try {
      const real = realpathSync3(head);
      return missing.length === 0 ? real : join4(real, ...missing);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
        fail(`Error: ${name} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
      }
      const parent = dirname3(head);
      if (parent === head) return absolute;
      missing.unshift(basename2(head));
      head = parent;
    }
  }
}
function insideToolDirectory(target) {
  const root = canonical("this tool directory", TOOL_DIR);
  if (target === root || target.startsWith(root + sep2)) return true;
  let rootId;
  try {
    rootId = statSync2(root);
  } catch {
    return false;
  }
  let head = target;
  for (; ; ) {
    try {
      const id = statSync2(head);
      if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
    } catch {
    }
    const parent = dirname3(head);
    if (parent === head) return false;
    head = parent;
  }
}
function screenedInputPath(name, value) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  const target = canonical(name, value);
  if (insideToolDirectory(target)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical("this tool directory", TOOL_DIR)}). This tool reads the caller's data; pass a path in a work directory in the owning root.`);
  }
  return target;
}
function screenedOutputPath(name, value) {
  if (!isAbsolute(value)) {
    fail(`Error: ${name} must be absolute; got "${value}". A relative path resolves against whichever directory the caller happened to be in.`);
  }
  const target = canonical(name, value);
  if (insideToolDirectory(target)) {
    fail(`Error: ${name} resolves inside this tool directory (${canonical("this tool directory", TOOL_DIR)}). Scripts write only to a work directory in the owning root; pass that path instead.`);
  }
  return target;
}
function valuePositionsOf(argv, valueFlags) {
  const positions = /* @__PURE__ */ new Set();
  for (let index = 1; index < argv.length; index += 1) {
    if (positions.has(index)) continue;
    if (valueFlags.has(argv[index])) positions.add(index + 1);
  }
  return positions;
}
function hasBare(argv, name, valueFlags) {
  const positions = valuePositionsOf(argv, valueFlags);
  for (let index = 1; index < argv.length; index += 1) {
    if (positions.has(index)) continue;
    if (argv[index] === name) return true;
  }
  return false;
}
function refuseUnknown(argv, valueFlags, bareFlags, usageCmd) {
  const valuePositions = valuePositionsOf(argv, valueFlags);
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (valuePositions.has(index)) continue;
    if (option.startsWith("-") && !valueFlags.has(option) && !bareFlags.has(option)) {
      fail(`Error: unknown option "${option}". Run "${usageCmd}" for usage.`);
    }
  }
}
function isWritable(dir) {
  try {
    accessSync(dir, constants2.W_OK);
    return true;
  } catch {
    return false;
  }
}
var WILL_FETCH_BROWSER = false;
function installPlan() {
  let names = [];
  try {
    names = Object.keys(JSON.parse(readFileSync3(join4(TOOL_DIR, "package.json"), "utf8")).dependencies || {});
  } catch {
  }
  const browser = names.includes("playwright");
  return {
    list: names.length ? names.join(", ") : "the packages package.json declares",
    hosts: "registry.npmjs.org",
    size: browser && WILL_FETCH_BROWSER ? " This run then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform." : ""
  };
}
function requireInstallConsent(what, install) {
  if (installAuthorised2(HERE, install)) {
    writeConsent2(HERE, "data", install);
    return;
  }
  if (what === "browser") {
    fail(
      `${installQuestion2("a private copy of the Chromium browser", "read your data files and draw charts from them", formatInstallSize2(INSTALL_BYTES2.chromium))}

Details for the assistant: this tool's packages are installed but the Chromium build they drive is not, and this person has not authorised a Wiser install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  const { list, hosts, size } = installPlan();
  fail(
    `${installQuestion2("a spreadsheet-file reader", "read your data files and draw charts from them", formatInstallSize2(INSTALL_BYTES2.data))}

Details for the assistant: this tool is not installed yet and this person has not authorised a Wiser install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
  );
}
async function ensureDependencies(install, command = "parse") {
  if (await packagesAvailable2(DEP_MARKER, () => loadPackages(command))) return;
  requireInstallConsent("packages", install);
  process.stderr.write("First run: installing dependencies in this tool directory.\n");
  try {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    execFileSync(npm, ["ci"], { cwd: TOOL_DIR, stdio: ["ignore", "ignore", "inherit"] });
  } catch {
    if (!isWritable(TOOL_DIR)) {
      fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
    }
    fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes.`);
  }
  if (!await packagesAvailable2(DEP_MARKER, () => loadPackages(command))) {
    fail(`Error: npm ci finished but the csv-parse files are still unavailable. Check that package.json lists every package this script imports and that npm ci completed in ${TOOL_DIR}.`);
  }
}
async function coreResult(input, content, filePath) {
  const { runData: runData2 } = await Promise.resolve().then(() => (init_data_core(), data_core_exports));
  try {
    return await runData2(input, [{ name: filePath, mediaType: "application/octet-stream", bytes: content }]);
  } catch (error) {
    fail(error.message);
  }
}
async function runParse(argv) {
  const usageCmd = helpRef("parse");
  const VALUE_FLAGS = /* @__PURE__ */ new Set(["--file", "--format", "--delimiter"]);
  const BARE_FLAGS = /* @__PURE__ */ new Set(["--install", "--no-header", "--help", "-h"]);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return void 0;
    const value = argv[index + 1];
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    if (value === void 0 || value.startsWith("--")) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }
  const fileArgument = flag("--file");
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
  }
  const filePath = screenedInputPath("--file", fileArgument);
  let fileStat;
  try {
    fileStat = statSync2(filePath);
  } catch {
    fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
  }
  if (!fileStat.isFile()) {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  const format = flag("--format");
  if (format !== void 0 && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }
  const delimiter = flag("--delimiter");
  const hasHeader = !argv.includes("--no-header");
  await ensureDependencies(parsedInstallFlag2(argv, VALUE_FLAGS));
  let content;
  try {
    content = new Uint8Array(readFileSync3(filePath));
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  const result = await coreResult({ command: "parse", format, delimiter, hasHeader }, content, filePath);
  process.stdout.write(`${JSON.stringify(result)}
`);
}
async function runDescribe(argv) {
  const usageCmd = helpRef("describe");
  const VALUE_FLAGS = /* @__PURE__ */ new Set(["--file", "--format", "--delimiter", "--columns", "--column"]);
  const BARE_FLAGS = /* @__PURE__ */ new Set(["--install", "--help", "-h"]);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  function flag(name) {
    const positions = valuePositionsOf(argv, VALUE_FLAGS);
    const indexes = [];
    for (let index = 0; index < argv.length; index += 1) {
      if (positions.has(index)) continue;
      if (argv[index] === name) indexes.push(index);
    }
    if (indexes.length === 0) return void 0;
    if (indexes.length > 1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    const value = argv[indexes[0] + 1];
    if (value === void 0 || value.startsWith("--")) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }
  function columnNames3() {
    const found = [];
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] !== "--column") continue;
      const value = argv[i + 1];
      if (value === void 0) {
        fail(`Error: --column needs a value. Run "${usageCmd}" for usage.`);
      }
      found.push(value);
      i += 1;
    }
    return found;
  }
  const fileArgument = flag("--file");
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
  }
  const filePath = screenedInputPath("--file", fileArgument);
  function failUnreadable() {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  let fileStats;
  try {
    fileStats = statSync2(filePath, { throwIfNoEntry: false });
  } catch {
    failUnreadable();
  }
  if (fileStats === void 0) {
    fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
  }
  if (!fileStats.isFile()) {
    failUnreadable();
  }
  const format = flag("--format");
  if (format !== void 0 && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }
  const delimiter = flag("--delimiter");
  const columnsArg = flag("--columns");
  const namedColumns = columnNames3();
  if (columnsArg !== void 0 && namedColumns.length > 0) {
    fail("Error: --column and --columns were both given. Use --column for one header, including a header that contains a comma; --columns cannot name such a header.");
  }
  await ensureDependencies(parsedInstallFlag2(argv, VALUE_FLAGS));
  let content;
  try {
    content = new Uint8Array(readFileSync3(filePath));
  } catch {
    failUnreadable();
  }
  const result = await coreResult({
    command: "describe",
    format,
    delimiter,
    columns: namedColumns.length > 0 ? namedColumns : void 0,
    columnsList: columnsArg
  }, content, filePath);
  process.stdout.write(`${JSON.stringify(result)}
`);
}
async function runAggregate(argv) {
  const usageCmd = helpRef("aggregate");
  const VALUE_FLAGS = /* @__PURE__ */ new Set(["--file", "--group-by", "--metric", "--format", "--delimiter"]);
  const BARE_FLAGS = /* @__PURE__ */ new Set(["--install", "--help", "-h"]);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  function flagValues(name) {
    const found = [];
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] !== name) continue;
      const value = argv[i + 1];
      if (value === void 0 || value.startsWith("--")) {
        fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
      }
      found.push(value);
    }
    return found;
  }
  function flag(name) {
    const found = flagValues(name);
    if (found.length > 1) {
      fail(`Error: ${name} was given ${found.length} times and takes one value. Run "${usageCmd}" for usage.`);
    }
    return found[0];
  }
  const fileArgument = flag("--file");
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
  }
  const filePath = screenedInputPath("--file", fileArgument);
  let fileStat;
  try {
    fileStat = statSync2(filePath);
  } catch {
    fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
  }
  if (!fileStat.isFile()) {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  const groupBy = flagValues("--group-by");
  if (groupBy.length === 0) {
    fail("Error: --group-by is required. Name the column whose values form the groups; repeat it to group by a tuple.");
  }
  const metricSpecs = flagValues("--metric");
  if (metricSpecs.length === 0) {
    fail(`Error: --metric is required, as <column>:<function>. Functions: ${[...FUNCTIONS2].join(", ")}.`);
  }
  const metrics = metricSpecs.map((spec) => {
    const cut = spec.lastIndexOf(":");
    if (cut <= 0 || cut === spec.length - 1) {
      fail(`Error: --metric "${spec}" is not in the form <column>:<function>. The function follows the last colon.`);
    }
    const fn = spec.slice(cut + 1);
    if (!FUNCTIONS2.has(fn)) {
      fail(`Error: --metric "${spec}" names function "${fn}"; use one of ${[...FUNCTIONS2].join(", ")}.`);
    }
    return { column: spec.slice(0, cut), function: fn };
  });
  const format = flag("--format");
  if (format !== void 0 && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }
  const delimiter = flag("--delimiter");
  await ensureDependencies(parsedInstallFlag2(argv, VALUE_FLAGS));
  let content;
  try {
    content = new Uint8Array(readFileSync3(filePath));
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  const result = await coreResult({ command: "aggregate", format, delimiter, groupBy, metrics }, content, filePath);
  process.stdout.write(`${JSON.stringify(result)}
`);
}
async function runJoin(argv) {
  const usageCmd = helpRef("join");
  const VALUE_FLAGS = /* @__PURE__ */ new Set(["--left", "--right", "--on", "--how", "--format", "--delimiter"]);
  const BARE_FLAGS = /* @__PURE__ */ new Set(["--install", "--help", "-h"]);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return void 0;
    const value = argv[index + 1];
    if (value === void 0 || value.startsWith("--")) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }
  function requireReadableFile(name, value) {
    if (!value) {
      fail(`Error: ${name} is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
    }
    const filePath = screenedInputPath(name, value);
    let fileStat;
    try {
      fileStat = statSync2(filePath);
    } catch {
      fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
    }
    if (!fileStat.isFile()) {
      fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
    }
    return filePath;
  }
  const leftPath = requireReadableFile("--left", flag("--left"));
  const rightPath = requireReadableFile("--right", flag("--right"));
  const on = flag("--on");
  if (!on) {
    fail("Error: --on is required. Name the key column present on both sides.");
  }
  const how = flag("--how") ?? "inner";
  if (!HOW2.has(how)) {
    fail(`Error: --how must be one of inner, left; got "${how}".`);
  }
  const format = flag("--format");
  if (format !== void 0 && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }
  const delimiter = flag("--delimiter");
  await ensureDependencies(parsedInstallFlag2(argv, VALUE_FLAGS), "join");
  const { executeJoin: executeJoin2 } = await Promise.resolve().then(() => (init_join_core(), join_core_exports));
  function readContent(path) {
    try {
      return readFileSync3(path, "utf8");
    } catch {
      fail(`Error: could not read ${path}. Confirm it is a readable file, not a directory.`);
    }
  }
  const result = executeJoin2({
    leftContent: readContent(leftPath),
    rightContent: readContent(rightPath),
    on,
    how,
    format,
    delimiter
  });
  process.stdout.write(`${JSON.stringify(result)}
`);
}
async function runChart(argv) {
  const usageCmd = helpRef("chart");
  const VALUE_FLAGS = /* @__PURE__ */ new Set([
    "--file",
    "--x",
    "--y",
    "--output",
    "--type",
    "--title",
    "--format",
    "--delimiter"
  ]);
  const BARE_FLAGS = /* @__PURE__ */ new Set(["--install", "--overwrite", "--help", "-h"]);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return void 0;
    const value = argv[index + 1];
    if (value === void 0 || value.startsWith("--")) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }
  const fileArgument = flag("--file");
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a CSV, JSON, or TSV file. Run "${usageCmd}" for usage.`);
  }
  const filePath = screenedInputPath("--file", fileArgument);
  let fileStat;
  try {
    fileStat = statSync2(filePath);
  } catch {
    fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
  }
  if (!fileStat.isFile()) {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  const x = flag("--x");
  if (!x) {
    fail("Error: --x is required. Name the category (label) column.");
  }
  const y = flag("--y");
  if (!y) {
    fail("Error: --y is required. Name the numeric value column.");
  }
  const outputArgument = flag("--output");
  if (!outputArgument) {
    fail("Error: --output is required. Pass the absolute path of the .html file to write, in a work directory in the owning root.");
  }
  const outputPath = screenedOutputPath("--output", outputArgument);
  if (!/\.html$/i.test(outputPath)) {
    fail(`Error: --output must end in .html; got "${outputPath}".`);
  }
  let existing;
  try {
    existing = statSync2(outputPath, { throwIfNoEntry: false });
  } catch {
    existing = void 0;
  }
  if (existing?.isDirectory()) {
    fail(`Error: --output names an existing directory (${outputPath}). Pass the path of the HTML file to write, not the folder to write it into.`);
  }
  if (existing && !argv.includes("--overwrite")) {
    fail(`Error: a file already exists at ${outputPath}. Pass --overwrite to replace it, or name a path that is free.`);
  }
  const type = flag("--type") ?? "bar";
  if (!TYPES.has(type)) {
    fail(`Error: --type must be one of bar, line; got "${type}".`);
  }
  const title = flag("--title") ?? "";
  const format = flag("--format");
  if (format !== void 0 && !FORMATS.has(format)) {
    fail(`Error: --format must be one of csv, json, tsv; got "${format}". Omit it to auto-detect from the content.`);
  }
  const delimiter = flag("--delimiter");
  await ensureDependencies(parsedInstallFlag2(argv, VALUE_FLAGS));
  let content;
  try {
    content = new Uint8Array(readFileSync3(filePath));
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  const built = await coreResult({ command: "chart", x, y, type, title, format, delimiter, output: outputPath }, content, filePath);
  const outputDir = dirname3(outputPath);
  try {
    mkdirSync2(outputDir, { recursive: true });
  } catch {
    fail(`Error: could not create the folder for ${outputPath}. Confirm the parent path is writable.`);
  }
  try {
    writeFileSync2(outputPath, built.files[0].bytes);
  } catch {
    fail(`Error: could not write ${outputPath}. Confirm the path is writable and not a directory.`);
  }
  process.stdout.write(`${JSON.stringify(built.answer)}
`);
}
async function runCompute(argv) {
  const usageCmd = helpRef("compute");
  const VALUE_FLAGS = /* @__PURE__ */ new Set(["--file", "--op", "--a", "--b", "--digits", "--format", "--delimiter"]);
  const BARE_FLAGS = /* @__PURE__ */ new Set(["--install", "--help", "-h"]);
  refuseUnknown(argv, VALUE_FLAGS, BARE_FLAGS, usageCmd);
  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return void 0;
    const value = argv[index + 1];
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "${usageCmd}" for usage.`);
    }
    if (value === void 0 || value.startsWith("--")) {
      fail(`Error: ${name} needs a value. Run "${usageCmd}" for usage.`);
    }
    return value;
  }
  const fileArgument = flag("--file");
  if (!fileArgument) {
    fail(`Error: --file is required. Pass the absolute path to a JSON object. Run "${usageCmd}" for usage.`);
  }
  const op = flag("--op");
  if (!op) {
    fail(`Error: --op is required. Use one of percentage, difference, rate. Run "${usageCmd}" for usage.`);
  }
  if (!OPS2.has(op)) {
    fail(`Error: --op must be one of percentage, difference, rate; got "${op}".`);
  }
  const aField = flag("--a");
  if (!aField) {
    fail(`Error: --a is required. Name the numeric field for a. Run "${usageCmd}" for usage.`);
  }
  const bField = flag("--b");
  if (!bField) {
    fail(`Error: --b is required. Name the numeric field for b. Run "${usageCmd}" for usage.`);
  }
  const digitsArg = flag("--digits");
  let digits;
  if (digitsArg !== void 0) {
    if (!/^\d+$/.test(digitsArg) || Number(digitsArg) > 20) {
      fail(`Error: --digits must be an integer from 0 to 20; got "${digitsArg}".`);
    }
    digits = Number(digitsArg);
  }
  const format = flag("--format");
  if (format !== void 0 && format !== "json") {
    fail(`Error: --format must be json; got "${format}". compute reads a JSON object.`);
  }
  flag("--delimiter");
  const filePath = screenedInputPath("--file", fileArgument);
  let fileStat;
  try {
    fileStat = statSync2(filePath);
  } catch {
    fail(`Error: no file at ${filePath}. Pass the absolute path to the data file.`);
  }
  if (!fileStat.isFile()) {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  let content;
  try {
    content = new Uint8Array(readFileSync3(filePath));
  } catch {
    fail(`Error: could not read ${filePath}. Confirm it is a readable file, not a directory.`);
  }
  const result = await coreResult({ command: "compute", op, aField, bField, digits }, content, filePath);
  process.stdout.write(`${JSON.stringify(result)}
`);
}
async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "help";
  if (command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(`${USAGE}
`);
    return;
  }
  if (!SUBCOMMANDS.has(command)) {
    fail(`Error: unknown command "${command}". Run "node scripts/data.js help" for usage.`);
  }
  const COMMAND_VALUE_FLAGS = {
    parse: /* @__PURE__ */ new Set(["--file", "--format", "--delimiter"]),
    describe: /* @__PURE__ */ new Set(["--file", "--format", "--delimiter", "--columns", "--column"]),
    aggregate: /* @__PURE__ */ new Set(["--file", "--group-by", "--metric", "--format", "--delimiter"]),
    join: /* @__PURE__ */ new Set(["--left", "--right", "--on", "--how", "--format", "--delimiter"]),
    chart: /* @__PURE__ */ new Set(["--file", "--x", "--y", "--output", "--type", "--title", "--format", "--delimiter"]),
    compute: /* @__PURE__ */ new Set(["--file", "--op", "--a", "--b", "--digits", "--format", "--delimiter"])
  };
  if (argv[1] === "help" || hasBare(argv, "--help", COMMAND_VALUE_FLAGS[command]) || hasBare(argv, "-h", COMMAND_VALUE_FLAGS[command])) {
    process.stdout.write(`${SUB_USAGE[command]}
`);
    return;
  }
  const compiled = await compiledEntry2(DEP_MARKER, () => loadPackages(command), import.meta.url, "data");
  if (compiled) return (await import(compiled)).main(argv);
  if (command === "parse") await runParse(argv);
  else if (command === "describe") await runDescribe(argv);
  else if (command === "aggregate") await runAggregate(argv);
  else if (command === "join") await runJoin(argv);
  else if (command === "chart") await runChart(argv);
  else if (command === "compute") await runCompute(argv);
}
if (isMain2(import.meta.url)) {
  if (HERE !== fileURLToPath2(import.meta.url)) await import(pathToFileURL2(HERE).href);
  else await main();
}

// one-file-entry.mjs
init_aggregate_core();
init_chart_core();
init_compute_core();
init_data_core();
init_describe_core();
init_join_core();
init_parse_core();
init_read_core();
export {
  aggregate_core_exports as aggregate_core_js,
  chart_core_exports as chart_core_js,
  compute_core_exports as compute_core_js,
  data_core_exports as data_core_js,
  describe_core_exports as describe_core_js,
  join_core_exports as join_core_js,
  main,
  parse_core_exports as parse_core_js,
  read_core_exports as read_core_js
};

// Source SHA-256: 9f67e476df3d4409aec64dc73a5ee62a67a05649bb82d1703172add4a073e805
