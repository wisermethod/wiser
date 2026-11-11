import { createRequire as wiserCreateRequire } from "node:module";
const require = wiserCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// tools/keynote-render/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = Symbol.for("yaml.alias");
    var DOC = Symbol.for("yaml.document");
    var MAP = Symbol.for("yaml.map");
    var PAIR = Symbol.for("yaml.pair");
    var SCALAR = Symbol.for("yaml.scalar");
    var SEQ = Symbol.for("yaml.seq");
    var NODE_TYPE = Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap2 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap2;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// tools/keynote-render/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// tools/keynote-render/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version] = parts;
            if (version === "1.1" || version === "1.2") {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// tools/keynote-render/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// tools/keynote-render/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = "This should not happen: Alias anchor was not resolved?";
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0)
            data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = "Excessive alias count indicates a resource exhaustion attack";
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// tools/keynote-render/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// tools/keynote-render/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// tools/keynote-render/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// tools/keynote-render/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// tools/keynote-render/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// tools/keynote-render/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === "number")
          version = String(version);
        let opt;
        switch (version) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version;
            else
              this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document;
  }
});

// tools/keynote-render/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "…" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "…";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "…\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep3, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep3) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep3 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep3, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep3 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep3 + cb;
              sep3 = "";
              break;
            }
            case "newline":
              if (comment)
                sep3 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap2 = fc.start.source === "{";
      const fcName = isMap2 ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap2 ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep3, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep3?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep3 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap2 && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap2 && !sep3 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep3, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep3 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap2 && !props.found && ctx.options.strict) {
              if (sep3)
                for (const st of sep3) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep3, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap2) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap2 ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep3 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep3 === " ")
            sep3 = "\n";
          else if (!prevMoreIndented && sep3 === "\n")
            sep3 = "\n\n";
          value += sep3 + indent.slice(trimIndent) + content;
          sep3 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep3 === "\n")
            value += "\n";
          else
            sep3 = "\n";
        } else {
          value += sep3 + content;
          sep3 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp("(.*?)(?<![ 	])[ 	]*\r?\n", "sy");
        line = new RegExp("[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n", "sy");
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match)
        return source;
      let res = match[1];
      let sep3 = " ";
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while (match = line.exec(source)) {
        if (match[1] === "") {
          if (sep3 === "\n")
            res += sep3;
          else
            sep3 = "\n";
        } else {
          res += sep3 + match[1];
          sep3 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep3 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "",
      // Unicode next line
      _: " ",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// tools/keynote-render/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// tools/keynote-render/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// tools/keynote-render/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep3, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep3)
        for (const st of sep3)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// tools/keynote-render/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = Symbol("break visit");
    var SKIP = Symbol("skip children");
    var REMOVE = Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// tools/keynote-render/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// tools/keynote-render/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// tools/keynote-render/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// tools/keynote-render/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep3;
          if (scalar.end) {
            sep3 = scalar.end;
            sep3.push(this.sourceToken);
            delete scalar.end;
          } else
            sep3 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep3 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep3 = it.sep;
                  sep3.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep3 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep3 = fc.end.splice(1, fc.end.length);
            sep3.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep3 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// tools/keynote-render/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  }
});

// tools/keynote-render/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "tools/keynote-render/node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// tools/keynote-render/scripts/lib/brand.js
var brand_exports = {};
__export(brand_exports, {
  loadBrand: () => loadBrand
});
import { readFileSync as readFileSync3 } from "node:fs";
import { dirname as dirname3 } from "node:path";
function loadBrand(file) {
  let brand;
  try {
    brand = (0, import_yaml.parse)(readFileSync3(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not valid YAML: ${e.message}`);
  }
  if (!isMap(brand)) {
    throw new Error(`${file} is empty or is not a YAML mapping.`);
  }
  const problems = [];
  for (const key of Object.keys(brand)) {
    if (!["theme", "layouts", "texts", "logo"].includes(key)) {
      problems.push(`"${key}" is not part of a brand file; the sections are theme, layouts, texts, logo`);
    }
  }
  if (brand.theme !== void 0 && typeof brand.theme !== "string") {
    problems.push("theme must be the name of an installed theme");
  }
  if (brand.layouts !== void 0) {
    if (!isMap(brand.layouts)) problems.push("layouts must map intent names to master layout names");
    else for (const [intent, master] of Object.entries(brand.layouts)) {
      if (typeof master !== "string") problems.push(`layouts.${intent} must be a master layout name`);
    }
  }
  if (brand.texts !== void 0) {
    if (!isMap(brand.texts)) problems.push("texts must map a master layout name to its semantic keys");
    else for (const [layout, keys] of Object.entries(brand.texts)) {
      if (!isMap(keys)) {
        problems.push(`texts.${layout} must map semantic keys to text item indices`);
        continue;
      }
      for (const [key, index] of Object.entries(keys)) {
        if (!Number.isInteger(index) || index < 0) {
          problems.push(`texts.${layout}.${key} must be a text item index, a whole number from 0`);
        }
      }
    }
  }
  if (brand.logo !== void 0) {
    if (!isMap(brand.logo)) problems.push("logo must be a mapping carrying at least a path");
    else {
      if (typeof brand.logo.path !== "string") problems.push("logo.path is required and must be a file path");
      for (const key of Object.keys(brand.logo)) {
        if (!LOGO_KEYS.has(key)) {
          problems.push(`logo.${key} is not part of a logo; the fields are ${[...LOGO_KEYS].join(", ")}`);
        } else if (key !== "path" && key !== "slides" && typeof brand.logo[key] !== "number") {
          problems.push(`logo.${key} must be a number of points`);
        }
      }
      if (brand.logo.slides !== void 0 && !isSlideTarget(brand.logo.slides)) {
        problems.push('logo.slides must be "all", "first", or an array of slide numbers from 1');
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`${file} is not a valid brand file:
- ${problems.join("\n- ")}`);
  }
  return { brand, dir: dirname3(file) };
}
function isMap(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function isSlideTarget(value) {
  if (value === "all" || value === "first") return true;
  return Array.isArray(value) && value.length > 0 && value.every((n) => Number.isInteger(n) && n > 0);
}
var import_yaml, LOGO_KEYS;
var init_brand = __esm({
  "tools/keynote-render/scripts/lib/brand.js"() {
    import_yaml = __toESM(require_dist(), 1);
    LOGO_KEYS = /* @__PURE__ */ new Set(["path", "x", "y", "width", "height", "slides"]);
  }
});

// tools/keynote-render/scripts/lib/jxa.js
var jxa_exports = {};
__export(jxa_exports, {
  KeynoteError: () => KeynoteError,
  keynoteBundle: () => keynoteBundle,
  osascriptPresent: () => osascriptPresent,
  runJXA: () => runJXA
});
import { execFile, execFileSync } from "node:child_process";
import { existsSync as existsSync3 } from "node:fs";
function keynoteBundle() {
  return BUNDLES.find((b) => existsSync3(b.path)) ?? null;
}
function osascriptPresent() {
  try {
    execFileSync(OSASCRIPT, ["-l", "JavaScript", "-e", "JSON.stringify(true)"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function runJXA(body, params = {}, { timeout = 6e4 } = {}) {
  const bundle = keynoteBundle();
  const script = rewriteAppName(
    `function run(argv) {
  const params = JSON.parse(argv[0]);
${body}
}
`,
    bundle?.app ?? "Keynote"
  );
  return new Promise((resolvePromise, reject) => {
    execFile(
      OSASCRIPT,
      ["-l", "JavaScript", "-e", script, JSON.stringify(params)],
      { timeout, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            reject(new Error(`Keynote did not answer within ${timeout / 1e3}s. A dialog may be open in Keynote, or the deck may be larger than this timeout allows.`));
            return;
          }
          reject(new KeynoteError(stderr || error.message, error.code));
          return;
        }
        const text = String(stdout).trim();
        if (!text) {
          resolvePromise(void 0);
          return;
        }
        try {
          resolvePromise(JSON.parse(text));
        } catch {
          resolvePromise(text);
        }
      }
    );
  });
}
function rewriteAppName(script, app) {
  if (app === "Keynote") return script;
  return script.replaceAll('Application("Keynote")', `Application("${app}")`).replaceAll('application "Keynote"', `application "${app}"`);
}
var OSASCRIPT, BUNDLES, FIXES, KeynoteError;
var init_jxa = __esm({
  "tools/keynote-render/scripts/lib/jxa.js"() {
    OSASCRIPT = "/usr/bin/osascript";
    BUNDLES = [
      { path: "/Applications/Keynote Creator Studio.app", app: "Keynote Creator Studio" },
      { path: "/Applications/Keynote.app", app: "Keynote" }
    ];
    FIXES = {
      "-1743": "Keynote automation is not permitted for this terminal. Allow it under System Settings, Privacy & Security, Automation, then run the command again.",
      "-1728": "Keynote could not find the document, slide, or item the command named.",
      "-1700": "Keynote refused the value type this operation passed.",
      "-1708": "Keynote does not understand this command; the installed version may not support it.",
      "-10810": "Keynote could not be launched.",
      "-128": "The operation was cancelled in the Keynote interface."
    };
    KeynoteError = class extends Error {
      constructor(stderr, exitCode) {
        const raw = String(stderr).trim();
        const code = (raw.match(/\((-?\d+)\)\s*$/) ?? [])[1];
        const detail = raw.replace(/^execution error:\s*/i, "").replace(/\s*\(-?\d+\)$/, "").replace(/^(Error:\s*)+/i, "").trim();
        const fix = code ? FIXES[code] : void 0;
        const suffix = code && code !== "-2700" ? ` (AppleScript ${code})` : "";
        super(
          fix ? `${fix}${suffix}` : detail ? `${detail}${suffix}` : `Keynote scripting failed (osascript exit ${exitCode ?? "unknown"}).`
        );
        this.name = "KeynoteError";
        this.appleScriptCode = code ? Number(code) : null;
      }
    };
  }
});

// tools/keynote-render/scripts/lib/archive.js
var archive_exports = {};
__export(archive_exports, {
  archiveBeside: () => archiveBeside
});
import { copyFileSync, existsSync as existsSync4, mkdirSync as mkdirSync2, readdirSync, statSync as statSync2 } from "node:fs";
import { basename as basename2, dirname as dirname4, join as join4, resolve as resolve2 } from "node:path";
function archiveBeside(filePath, options = {}) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("archiveBeside requires an absolute file path.");
  }
  const source = resolve2(filePath);
  if (!existsSync4(source)) {
    throw new Error(`cannot archive: no file at ${source}`);
  }
  let sourceStat;
  try {
    sourceStat = statSync2(source);
  } catch (error) {
    throw new Error(`cannot archive: could not read ${source}: ${error.message}`);
  }
  if (!sourceStat.isFile()) {
    throw new Error(`cannot archive: ${source} is not a regular file`);
  }
  const archiveDir = options.archiveDir ? resolve2(options.archiveDir) : join4(dirname4(source), "zArchive");
  mkdirSync2(archiveDir, { recursive: true });
  const originalName = basename2(source);
  const prefix = todayPrefix();
  const version = nextVersion(archiveDir, prefix, originalName);
  const archiveName = `${prefix} V${version} - ${originalName}`;
  const archivePath = join4(archiveDir, archiveName);
  if (existsSync4(archivePath)) {
    throw new Error(
      `archive path already occupied at ${archivePath}. Scan of ${archiveDir} for free Vn failed; do not overwrite prior archives.`
    );
  }
  try {
    copyFileSync(source, archivePath);
  } catch (error) {
    throw new Error(
      `archive copy failed (${source} → ${archivePath}): ${error.message}. The original was not modified.`
    );
  }
  if (!existsSync4(archivePath)) {
    throw new Error(
      `archive copy reported success but ${archivePath} is missing. The original was not modified.`
    );
  }
  return archivePath;
}
function todayPrefix() {
  const now = /* @__PURE__ */ new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function nextVersion(archiveDir, prefix, originalName) {
  const escaped = originalName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${prefix.replace(/-/g, "\\-")} V(\\d+) - ${escaped}$`);
  let max = 0;
  let names;
  try {
    names = readdirSync(archiveDir);
  } catch (error) {
    throw new Error(`cannot read archive directory ${archiveDir}: ${error.message}`);
  }
  for (const name of names) {
    const match = name.match(re);
    if (match) {
      const n = Number(match[1]);
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return max + 1;
}
var init_archive = __esm({
  "tools/keynote-render/scripts/lib/archive.js"() {
  }
});

// tools/keynote-render/scripts/lib/deck.js
var deck_exports = {};
__export(deck_exports, {
  resolveDeck: () => resolveDeck
});
import { existsSync as existsSync5 } from "node:fs";
import { isAbsolute, join as join5, resolve as resolve3 } from "node:path";
function resolveDeck(slides, brandEntry, themeOverride, specDir) {
  const brand = brandEntry?.brand ?? null;
  const theme = themeOverride || brand?.theme;
  if (!theme) {
    throw new Error('no theme. Pass --theme "<installed theme>", or a --brand file that names one. Run "themes" to list what is installed.');
  }
  const resolved = slides.map((slide, i) => {
    const layout = slide.layout && brand?.layouts?.[slide.layout] || slide.layout;
    let texts = slide.texts;
    if (texts) {
      const keys = brand?.texts?.[layout] ?? {};
      const byIndex = {};
      for (const [key, value] of Object.entries(texts)) {
        if (/^\d+$/.test(key)) {
          byIndex[key] = value;
        } else if (keys[key] !== void 0) {
          byIndex[String(keys[key])] = value;
        } else {
          throw new Error(
            `slide ${i + 1}: texts key "${key}" is not an index, and no brand maps it on layout "${layout}". Build one slide on that layout, run inspect to read its text item indices, then map the key under that layout in the brand file.`
          );
        }
      }
      texts = byIndex;
    }
    const images = (slide.images ?? []).map((image, j) => normalizeImage(image, specDir, `slide ${i + 1}, image ${j + 1}`));
    return { ...slide, layout, texts, images };
  });
  if (brand?.logo) {
    const logo = normalizeImage(brand.logo, brandEntry.dir, "the brand logo");
    const target = brand.logo.slides ?? "all";
    resolved.forEach((slide, i) => {
      const wanted = target === "all" || target === "first" && i === 0 || Array.isArray(target) && target.includes(i + 1);
      if (wanted) slide.images.push(logo);
    });
  }
  return { theme, slides: resolved };
}
function normalizeImage(image, baseDir, label) {
  const path = isAbsolute(image.path) ? image.path : resolve3(join5(baseDir, image.path));
  if (!existsSync5(path)) throw new Error(`${label}: no file at ${path}.`);
  return {
    path,
    x: image.x ?? null,
    y: image.y ?? null,
    width: image.width ?? null,
    height: image.height ?? null
  };
}
var init_deck = __esm({
  "tools/keynote-render/scripts/lib/deck.js"() {
  }
});

// tools/keynote-render/scripts/lib/keynote.js
var keynote_exports = {};
__export(keynote_exports, {
  applyOps: () => applyOps,
  buildDeck: () => buildDeck,
  deleteSlide: () => deleteSlide,
  exportDeck: () => exportDeck,
  insertSlide: () => insertSlide,
  inspectDeck: () => inspectDeck,
  inspectSlide: () => inspectSlide,
  listLayouts: () => listLayouts,
  listThemes: () => listThemes,
  moveSlide: () => moveSlide,
  snapshotDeck: () => snapshotDeck,
  updateSlide: () => updateSlide
});
function listThemes() {
  return runJXA(`
    const app = Application("Keynote");
    return JSON.stringify(app.themes.name());
  `);
}
function listLayouts(theme) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");

    const doc = app.Document({ documentTheme: app.themes[params.theme] });
    app.documents.push(doc);
    const docName = doc.name().replace(/"/g, '\\\\"');

    const script = $.NSAppleScript.alloc.initWithSource(
      'tell application "Keynote" to tell document "' + docName + '" to return name of every master slide'
    );
    const errDict = Ref();
    const result = script.executeAndReturnError(errDict);
    doc.close({ saving: "no" });
    if (!result) throw new Error("Could not read master slides of theme " + params.theme);

    const names = [];
    for (let i = 1; i <= result.numberOfItems; i++) {
      names.push(result.descriptorAtIndex(i).stringValue.js);
    }
    return JSON.stringify(names);
  `, { theme }, { timeout: 6e4 });
}
function buildDeck(theme, slides, outputPath) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");

    // Saving over a file Keynote still holds open fails, so release it first.
    for (let i = app.documents.length - 1; i >= 0; i--) {
      try {
        const f = app.documents[i].file();
        if (f && f.toString() === params.outputPath) app.documents[i].close({ saving: "no" });
      } catch (e) {}
    }

    const doc = app.Document({ documentTheme: app.themes[params.theme] });
    app.documents.push(doc);
    const docName = doc.name().replace(/"/g, '\\\\"');

    function addSlideWithLayout(layout, slideNumber) {
      const escaped = layout.replace(/"/g, '\\\\"');
      const script = $.NSAppleScript.alloc.initWithSource(
        'tell application "Keynote" to tell document "' + docName +
        '" to make new slide with properties {base slide:master slide "' + escaped + '"}'
      );
      const errDict = Ref();
      if (!script.executeAndReturnError(errDict)) {
        const info = ObjC.deepUnwrap(errDict[0]);
        throw new Error("Slide " + slideNumber + ", layout \\"" + layout + "\\": " +
          (info.NSAppleScriptErrorBriefMessage || "no master by that name in this theme"));
      }
    }

    const results = [];
    for (let i = 0; i < params.slides.length; i++) {
      const s = params.slides[i];

      // A new document opens with one slide already on the theme's default
      // master. The first spec slide reuses it, unless it names a layout, in
      // which case the layouted slide is created and the default removed.
      if (i === 0) {
        if (s.layout) {
          addSlideWithLayout(s.layout, 1);
          app.delete(doc.slides[0]);
        }
      } else if (s.layout) {
        addSlideWithLayout(s.layout, i + 1);
      } else {
        doc.slides.push(app.Slide({}));
      }

      const slide = doc.slides[doc.slides.length - 1];

      let titleSet = null;
      if (s.title !== undefined) {
        titleSet = false;
        try {
          slide.defaultTitleItem().objectText = s.title;
          titleSet = slide.titleShowing() ? true : "hidden";
        } catch (e) {}
      }

      let bodySet = null;
      if (s.body !== undefined) {
        bodySet = false;
        try {
          slide.defaultBodyItem().objectText = s.body;
          bodySet = slide.bodyShowing() ? true : "hidden";
        } catch (e) {}
      }

      let textsSet = null;
      if (s.texts !== undefined) {
        textsSet = {};
        for (const idx of Object.keys(s.texts)) {
          textsSet[idx] = false;
          try {
            slide.textItems[Number(idx)].objectText = s.texts[idx];
            textsSet[idx] = true;
          } catch (e) {}
        }
      }

      if (s.notes !== undefined) slide.presenterNotes = s.notes;

      for (const im of (s.images || [])) {
        const props = { file: Path(im.path) };
        if (im.width !== null) props.width = im.width;
        if (im.height !== null) props.height = im.height;
        const image = app.Image(props);
        slide.images.push(image);
        if (im.x !== null) image.position = { x: im.x, y: im.y || 0 };
      }

      results.push({ slideNumber: i + 1, layout: s.layout || null, titleSet, bodySet, textsSet });
    }

    // Save, then reopen from the saved path to read back what landed on disk,
    // and close again so no document is left open in the user's Keynote.
    doc.save({ in: Path(params.outputPath) });
    doc.close({ saving: "no" });
    const saved = app.open(Path(params.outputPath));
    const name = saved.name();
    const slideCount = saved.slides.length;
    saved.close({ saving: "no" });

    return JSON.stringify({ name, slideCount, slides: results });
  `, { theme, slides, outputPath }, { timeout: 18e4 });
}
function inspectSlide(deckPath, slideNumber) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");

    const doc = app.open(Path(params.deckPath));
    if (params.slideNumber < 1 || params.slideNumber > doc.slides.length) {
      const count = doc.slides.length;
      doc.close({ saving: "no" });
      throw new Error("Slide " + params.slideNumber + " is out of range; this deck has " + count + " slides");
    }
    const slide = doc.slides[params.slideNumber - 1];

    const out = {
      slideNumber: params.slideNumber,
      slideCount: doc.slides.length,
      titleShowing: slide.titleShowing(),
      bodyShowing: slide.bodyShowing(),
      layout: null
    };

    const docName = doc.name().replace(/"/g, '\\\\"');
    const script = $.NSAppleScript.alloc.initWithSource(
      'tell application "Keynote" to tell document "' + docName +
      '" to return name of base slide of slide ' + params.slideNumber
    );
    const errDict = Ref();
    const result = script.executeAndReturnError(errDict);
    if (result) out.layout = result.stringValue.js;

    try { out.defaultTitle = slide.defaultTitleItem().objectText(); } catch (e) { out.defaultTitle = null; }
    try { out.defaultBody = slide.defaultBodyItem().objectText(); } catch (e) { out.defaultBody = null; }
    try { out.presenterNotes = slide.presenterNotes(); } catch (e) { out.presenterNotes = null; }

    out.textItems = [];
    const items = slide.textItems();
    for (let i = 0; i < items.length; i++) {
      const item = { index: i };
      try { item.text = items[i].objectText(); } catch (e) { item.text = null; }
      try { item.position = items[i].position(); } catch (e) {}
      try { item.width = items[i].width(); item.height = items[i].height(); } catch (e) {}
      out.textItems.push(item);
    }
    try { out.imageCount = slide.images.length; } catch (e) { out.imageCount = null; }
    try { out.shapeCount = slide.shapes.length; } catch (e) { out.shapeCount = null; }

    doc.close({ saving: "no" });
    return JSON.stringify(out);
  `, { deckPath, slideNumber }, { timeout: 6e4 });
}
function snapshotDeck(deckPath, outDir) {
  return runJXA(`
    const app = Application("Keynote");
    const doc = app.open(Path(params.deckPath));
    app.export(doc, { to: Path(params.outDir), as: "slide images" });
    const slideCount = doc.slides.length;
    doc.close({ saving: "no" });
    return JSON.stringify({ slideCount, outDir: params.outDir });
  `, { deckPath, outDir }, { timeout: 18e4 });
}
function exportDeck(deckPath, format, outPath) {
  return runJXA(`
    const app = Application("Keynote");
    const doc = app.open(Path(params.deckPath));
    app.export(doc, { to: Path(params.outPath), as: params.format });
    doc.close({ saving: "no" });
    return JSON.stringify({ exported: true, outPath: params.outPath });
  `, { deckPath, format, outPath }, { timeout: 3e5 });
}
function inspectDeck(deckPath) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const count = doc.slides.length;
    const slides = [];

    for (let n = 1; n <= count; n++) {
      const slide = doc.slides[n - 1];
      const out = {
        slideNumber: n,
        titleShowing: null,
        bodyShowing: null,
        layout: null,
        defaultTitle: null,
        defaultBody: null,
        presenterNotes: null,
        textItems: [],
        imageCount: null,
        shapeCount: null
      };
      try { out.titleShowing = slide.titleShowing(); } catch (e) {}
      try { out.bodyShowing = slide.bodyShowing(); } catch (e) {}
      out.layout = masterNameOf(doc, n);
      try { out.defaultTitle = slide.defaultTitleItem().objectText(); } catch (e) { out.defaultTitle = null; }
      try { out.defaultBody = slide.defaultBodyItem().objectText(); } catch (e) { out.defaultBody = null; }
      try { out.presenterNotes = slide.presenterNotes(); } catch (e) { out.presenterNotes = null; }
      try {
        const items = slide.textItems();
        for (let i = 0; i < items.length; i++) {
          const item = { index: i };
          try { item.text = items[i].objectText(); } catch (e) { item.text = null; }
          try { item.position = items[i].position(); } catch (e) {}
          try { item.width = items[i].width(); item.height = items[i].height(); } catch (e) {}
          out.textItems.push(item);
        }
      } catch (e) {}
      try { out.imageCount = slide.images.length; } catch (e) {}
      try { out.shapeCount = slide.shapes.length; } catch (e) {}
      slides.push(out);
    }

    closeIfNeeded(doc, opened.alreadyOpen);
    return JSON.stringify({ slideCount: count, slides });
  `, { deckPath }, { timeout: 18e4 });
}
function updateSlide(deckPath, slideNumber, slide) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    if (params.slideNumber < 1 || params.slideNumber > doc.slides.length) {
      const count = doc.slides.length;
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Slide " + params.slideNumber + " is out of range; this deck has " + count + " slides");
    }

    if (params.slide.layout) {
      setMaster(doc, params.slideNumber, params.slide.layout);
    }

    const target = doc.slides[params.slideNumber - 1];
    const written = writePlaceholders(target, params.slide);
    const imageResult = addImages(
      app,
      target,
      params.slide.images || [],
      Boolean(params.slide.replaceImages)
    );

    doc.save();
    const slideCount = doc.slides.length;
    const layout = masterNameOf(doc, params.slideNumber);
    closeIfNeeded(doc, opened.alreadyOpen);

    return JSON.stringify({
      slideNumber: params.slideNumber,
      slideCount,
      layout,
      titleSet: written.titleSet,
      bodySet: written.bodySet,
      textsSet: written.textsSet,
      imageCount: imageResult.imageCount,
      imagesReplaced: imageResult.replaced
    });
  `, { deckPath, slideNumber, slide }, { timeout: 12e4 });
}
function insertSlide(deckPath, after, slide) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const beforeCount = doc.slides.length;
    const after = params.after;
    if (after < 0 || after > beforeCount) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("--after must be from 0 (before first) through " + beforeCount + " (append); got " + after);
    }

    const docName = doc.name().replace(/"/g, '\\\\"');
    let newIndex; // 1-based position of the new slide after insert

    if (params.slide.layout) {
      const escaped = params.slide.layout.replace(/"/g, '\\\\"');
      let source;
      if (after === 0) {
        source = 'tell application "Keynote" to tell document "' + docName +
          '" to make new slide at before slide 1 with properties {base slide:master slide "' + escaped + '"}';
        newIndex = 1;
      } else if (after >= beforeCount) {
        source = 'tell application "Keynote" to tell document "' + docName +
          '" to make new slide with properties {base slide:master slide "' + escaped + '"}';
        newIndex = beforeCount + 1;
      } else {
        source = 'tell application "Keynote" to tell document "' + docName +
          '" to make new slide at after slide ' + after +
          ' with properties {base slide:master slide "' + escaped + '"}';
        newIndex = after + 1;
      }
      const script = $.NSAppleScript.alloc.initWithSource(source);
      const errDict = Ref();
      if (!script.executeAndReturnError(errDict)) {
        const info = ObjC.deepUnwrap(errDict[0]);
        closeIfNeeded(doc, opened.alreadyOpen);
        throw new Error("insert layout \\"" + params.slide.layout + "\\": " +
          (info.NSAppleScriptErrorBriefMessage || "no master by that name in this theme"));
      }
    } else {
      // Default master: push a plain slide, then move it into place if needed.
      doc.slides.push(app.Slide({}));
      newIndex = doc.slides.length;
      if (after < beforeCount) {
        // Move the new last slide into place via AppleScript.
        const moveSource = 'tell application "Keynote" to tell document "' + docName +
          '" to move slide ' + newIndex + ' to after slide ' + Math.max(after, 1);
        // When after is 0, move to beginning:
        const moveToFront = after === 0
          ? 'tell application "Keynote" to tell document "' + docName +
            '" to move slide ' + newIndex + ' to before slide 1'
          : moveSource;
        const moveScript = $.NSAppleScript.alloc.initWithSource(after === 0 ? moveToFront : moveSource);
        const moveErr = Ref();
        if (!moveScript.executeAndReturnError(moveErr)) {
          // Leave at end rather than fail the whole insert; report the fallback.
          newIndex = doc.slides.length;
        } else {
          newIndex = after === 0 ? 1 : after + 1;
        }
      }
    }

    const target = doc.slides[newIndex - 1];
    const written = writePlaceholders(target, params.slide);
    const imageResult = addImages(app, target, params.slide.images || [], false);

    doc.save();
    const slideCount = doc.slides.length;
    const layout = masterNameOf(doc, newIndex);
    closeIfNeeded(doc, opened.alreadyOpen);

    return JSON.stringify({
      slideNumber: newIndex,
      slideCount,
      layout,
      titleSet: written.titleSet,
      bodySet: written.bodySet,
      textsSet: written.textsSet,
      imageCount: imageResult.imageCount,
      insertedAfter: after
    });
  `, { deckPath, after, slide }, { timeout: 12e4 });
}
function deleteSlide(deckPath, slideNumber) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const beforeCount = doc.slides.length;
    if (params.slideNumber < 1 || params.slideNumber > beforeCount) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Slide " + params.slideNumber + " is out of range; this deck has " + beforeCount + " slides");
    }
    if (beforeCount <= 1) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Cannot delete the only slide in the deck; Keynote requires at least one slide");
    }

    app.delete(doc.slides[params.slideNumber - 1]);
    doc.save();
    const slideCount = doc.slides.length;
    closeIfNeeded(doc, opened.alreadyOpen);

    return JSON.stringify({
      deleted: params.slideNumber,
      slideCount,
      renumbered: true
    });
  `, { deckPath, slideNumber }, { timeout: 6e4 });
}
function moveSlide(deckPath, from, after) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const count = doc.slides.length;
    if (params.from < 1 || params.from > count) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("Slide " + params.from + " is out of range; this deck has " + count + " slides");
    }
    if (params.after < 0 || params.after > count) {
      closeIfNeeded(doc, opened.alreadyOpen);
      throw new Error("--after must be from 0 through " + count);
    }
    // No-op when already in place
    if (params.after === params.from || params.after === params.from - 1) {
      closeIfNeeded(doc, opened.alreadyOpen);
      return JSON.stringify({ moved: true, from: params.from, after: params.after, slideCount: count, noop: true });
    }

    const docName = doc.name().replace(/"/g, '\\\\"');
    let source;
    if (params.after === 0) {
      source = 'tell application "Keynote" to tell document "' + docName +
        '" to move slide ' + params.from + ' to before slide 1';
    } else {
      source = 'tell application "Keynote" to tell document "' + docName +
        '" to move slide ' + params.from + ' to after slide ' + params.after;
    }
    const script = $.NSAppleScript.alloc.initWithSource(source);
    const errDict = Ref();
    if (!script.executeAndReturnError(errDict)) {
      const info = ObjC.deepUnwrap(errDict[0]);
      closeIfNeeded(doc, opened.alreadyOpen);
      return JSON.stringify({
        moved: false,
        from: params.from,
        after: params.after,
        reason: info.NSAppleScriptErrorBriefMessage || "Keynote refused the move",
        fallback: "delete+insert (custom shapes on that slide will not survive)"
      });
    }

    doc.save();
    const slideCount = doc.slides.length;
    closeIfNeeded(doc, opened.alreadyOpen);
    return JSON.stringify({
      moved: true,
      from: params.from,
      after: params.after,
      slideCount,
      noop: false
    });
  `, { deckPath, from, after }, { timeout: 6e4 });
}
function applyOps(deckPath, ops) {
  return runJXA(`
    const app = Application("Keynote");
    ObjC.import("Foundation");
    ${OPEN_DECK_HELPER}

    const opened = openDeck(app, params.deckPath);
    const doc = opened.doc;
    const results = [];

    function insertAt(after, slideData) {
      const beforeCount = doc.slides.length;
      const docName = doc.name().replace(/"/g, '\\\\"');
      let newIndex;
      if (slideData.layout) {
        const escaped = slideData.layout.replace(/"/g, '\\\\"');
        let source;
        if (after === 0) {
          source = 'tell application "Keynote" to tell document "' + docName +
            '" to make new slide at before slide 1 with properties {base slide:master slide "' + escaped + '"}';
          newIndex = 1;
        } else if (after >= beforeCount) {
          source = 'tell application "Keynote" to tell document "' + docName +
            '" to make new slide with properties {base slide:master slide "' + escaped + '"}';
          newIndex = beforeCount + 1;
        } else {
          source = 'tell application "Keynote" to tell document "' + docName +
            '" to make new slide at after slide ' + after +
            ' with properties {base slide:master slide "' + escaped + '"}';
          newIndex = after + 1;
        }
        const script = $.NSAppleScript.alloc.initWithSource(source);
        const errDict = Ref();
        if (!script.executeAndReturnError(errDict)) {
          const info = ObjC.deepUnwrap(errDict[0]);
          throw new Error("insert layout \\"" + slideData.layout + "\\": " +
            (info.NSAppleScriptErrorBriefMessage || "no master by that name"));
        }
      } else {
        doc.slides.push(app.Slide({}));
        newIndex = doc.slides.length;
        if (after < beforeCount) {
          const moveSource = after === 0
            ? 'tell application "Keynote" to tell document "' + docName +
              '" to move slide ' + newIndex + ' to before slide 1'
            : 'tell application "Keynote" to tell document "' + docName +
              '" to move slide ' + newIndex + ' to after slide ' + after;
          const moveScript = $.NSAppleScript.alloc.initWithSource(moveSource);
          const moveErr = Ref();
          if (moveScript.executeAndReturnError(moveErr)) {
            newIndex = after === 0 ? 1 : after + 1;
          }
        }
      }
      const target = doc.slides[newIndex - 1];
      const written = writePlaceholders(target, slideData);
      const imageResult = addImages(app, target, slideData.images || [], false);
      return {
        op: "insert",
        slideNumber: newIndex,
        layout: masterNameOf(doc, newIndex),
        titleSet: written.titleSet,
        bodySet: written.bodySet,
        textsSet: written.textsSet,
        imageCount: imageResult.imageCount
      };
    }

    for (let i = 0; i < params.ops.length; i++) {
      const op = params.ops[i];
      if (op.op === "update") {
        if (op.slide < 1 || op.slide > doc.slides.length) {
          throw new Error("update slide " + op.slide + " out of range (" + doc.slides.length + " slides)");
        }
        if (op.slideData && op.slideData.layout) {
          setMaster(doc, op.slide, op.slideData.layout);
        }
        const target = doc.slides[op.slide - 1];
        const written = writePlaceholders(target, op.slideData || {});
        const imageResult = addImages(
          app, target,
          (op.slideData && op.slideData.images) || [],
          Boolean(op.slideData && op.slideData.replaceImages)
        );
        results.push({
          op: "update",
          slideNumber: op.slide,
          layout: masterNameOf(doc, op.slide),
          titleSet: written.titleSet,
          bodySet: written.bodySet,
          textsSet: written.textsSet,
          imageCount: imageResult.imageCount,
          imagesReplaced: imageResult.replaced
        });
      } else if (op.op === "insert") {
        results.push(insertAt(op.after, op.slideData || {}));
      } else if (op.op === "delete") {
        if (op.slide < 1 || op.slide > doc.slides.length) {
          throw new Error("delete slide " + op.slide + " out of range (" + doc.slides.length + " slides)");
        }
        if (doc.slides.length <= 1) {
          throw new Error("Cannot delete the only slide in the deck");
        }
        app.delete(doc.slides[op.slide - 1]);
        results.push({ op: "delete", deleted: op.slide, slideCount: doc.slides.length });
      } else {
        throw new Error("unknown op: " + op.op);
      }
    }

    doc.save();
    const slideCount = doc.slides.length;
    closeIfNeeded(doc, opened.alreadyOpen);
    return JSON.stringify({ slideCount, applied: results });
  `, { deckPath, ops }, { timeout: 3e5 });
}
var OPEN_DECK_HELPER;
var init_keynote = __esm({
  "tools/keynote-render/scripts/lib/keynote.js"() {
    init_jxa();
    OPEN_DECK_HELPER = `
    function openDeck(app, deckPath) {
      for (let i = 0; i < app.documents.length; i++) {
        try {
          const f = app.documents[i].file();
          if (f && f.toString() === deckPath) {
            return { doc: app.documents[i], alreadyOpen: true };
          }
        } catch (e) {}
      }
      return { doc: app.open(Path(deckPath)), alreadyOpen: false };
    }

    function closeIfNeeded(doc, alreadyOpen) {
      if (!alreadyOpen) {
        try { doc.close({ saving: "no" }); } catch (e) {}
      }
    }

    function masterNameOf(doc, slideNumber) {
      const docName = doc.name().replace(/"/g, '\\\\"');
      const script = $.NSAppleScript.alloc.initWithSource(
        'tell application "Keynote" to tell document "' + docName +
        '" to return name of base slide of slide ' + slideNumber
      );
      const errDict = Ref();
      const result = script.executeAndReturnError(errDict);
      return result ? result.stringValue.js : null;
    }

    function setMaster(doc, slideNumber, layout) {
      const docName = doc.name().replace(/"/g, '\\\\"');
      const escaped = layout.replace(/"/g, '\\\\"');
      const script = $.NSAppleScript.alloc.initWithSource(
        'tell application "Keynote" to tell document "' + docName +
        '" to set base slide of slide ' + slideNumber + ' to master slide "' + escaped + '"'
      );
      const errDict = Ref();
      if (!script.executeAndReturnError(errDict)) {
        const info = ObjC.deepUnwrap(errDict[0]);
        throw new Error("layout \\"" + layout + "\\": " +
          (info.NSAppleScriptErrorBriefMessage || "no master by that name in this theme"));
      }
    }

    function writePlaceholders(slide, s) {
      let titleSet = null;
      if (s.title !== undefined && s.title !== null) {
        titleSet = false;
        try {
          slide.defaultTitleItem().objectText = s.title;
          titleSet = slide.titleShowing() ? true : "hidden";
        } catch (e) {}
      }

      let bodySet = null;
      if (s.body !== undefined && s.body !== null) {
        bodySet = false;
        try {
          slide.defaultBodyItem().objectText = s.body;
          bodySet = slide.bodyShowing() ? true : "hidden";
        } catch (e) {}
      }

      let textsSet = null;
      if (s.texts !== undefined && s.texts !== null) {
        textsSet = {};
        for (const idx of Object.keys(s.texts)) {
          textsSet[idx] = false;
          try {
            slide.textItems[Number(idx)].objectText = s.texts[idx];
            textsSet[idx] = true;
          } catch (e) {}
        }
      }

      if (s.notes !== undefined && s.notes !== null) {
        try { slide.presenterNotes = s.notes; } catch (e) {}
      }

      return { titleSet, bodySet, textsSet };
    }

    function addImages(app, slide, images, replaceExisting) {
      if (!images || images.length === 0) return { imageCount: null, replaced: false };
      if (replaceExisting) {
        try {
          const existing = slide.images();
          for (let i = existing.length - 1; i >= 0; i--) {
            try { app.delete(existing[i]); } catch (e) {}
          }
        } catch (e) {}
      }
      for (const im of images) {
        const props = { file: Path(im.path) };
        if (im.width !== null && im.width !== undefined) props.width = im.width;
        if (im.height !== null && im.height !== undefined) props.height = im.height;
        const image = app.Image(props);
        slide.images.push(image);
        if (im.x !== null && im.x !== undefined) image.position = { x: im.x, y: im.y || 0 };
      }
      let imageCount = null;
      try { imageCount = slide.images.length; } catch (e) {}
      return { imageCount, replaced: Boolean(replaceExisting) };
    }
`;
  }
});

// tools/keynote-render/scripts/lib/markdown.js
var markdown_exports = {};
__export(markdown_exports, {
  normalizeBody: () => normalizeBody,
  parseMarkdownDeck: () => parseMarkdownDeck,
  sameBody: () => sameBody,
  sameText: () => sameText
});
import { existsSync as existsSync6, readFileSync as readFileSync4 } from "node:fs";
import { dirname as dirname5, isAbsolute as isAbsolute2, join as join6, resolve as resolve4 } from "node:path";
function parseMarkdownDeck(file) {
  let text;
  try {
    text = readFileSync4(file, "utf8");
  } catch (error) {
    throw new Error(`cannot read markdown at ${file}: ${error.message}`);
  }
  const baseDir = dirname5(file);
  const lines = text.split(/\r?\n/);
  const deckTitle = extractDeckTitle(lines);
  const sections = splitSlideSections(lines);
  if (sections.length === 0) {
    throw new Error(
      `${file} has no slides. Expected sections headed "## Slide N. Title" or "## Title" with a following "On slide:" block. See TOOL.md § Markdown deck format.`
    );
  }
  const slides = sections.map((section, i) => parseSection(section, i + 1, baseDir, file));
  return { slides, meta: { title: deckTitle, path: file } };
}
function extractDeckTitle(lines) {
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m && !/^#\s*Slide\b/i.test(line)) {
      return m[1].replace(/\s*:.*/, "").trim() || m[1].trim();
    }
    if (/^##\s+/.test(line)) break;
  }
  return null;
}
function splitSlideSections(lines) {
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isSlideHeading(lines[i])) starts.push(i);
  }
  if (starts.length === 0) return [];
  const sections = [];
  for (let s = 0; s < starts.length; s += 1) {
    const from = starts[s];
    const to = s + 1 < starts.length ? starts[s + 1] : lines.length;
    sections.push({ heading: lines[from], lines: lines.slice(from + 1, to), sourceLine: from + 1 });
  }
  return sections;
}
function isSlideHeading(line) {
  if (!/^##\s+/.test(line)) return false;
  if (/^##\s+Slide\s+\d+/i.test(line)) return true;
  if (/^##\s+(Context|Inputs|Usage|Dependencies|Success|Troubleshooting|Output|Quick Start|Deck spec|Brand file|Script Contract|Markdown|Archive|Diff|Workstream)\b/i.test(line)) {
    return false;
  }
  return true;
}
function parseSection(section, fallbackNumber, baseDir, file) {
  const headingTitle = titleFromHeading(section.heading);
  const body = section.lines;
  const meta = {};
  const texts = {};
  let contentStart = 0;
  for (let i = 0; i < body.length; i += 1) {
    const line = body[i];
    const layoutMatch = line.match(/^layout:\s*(.+?)\s*$/i);
    if (layoutMatch) {
      meta.layout = layoutMatch[1].trim();
      contentStart = i + 1;
      continue;
    }
    const imageMatch = line.match(/^image:\s*(.+?)\s*$/i);
    if (imageMatch) {
      meta.images = meta.images || [];
      meta.images.push(imageMatch[1].trim());
      contentStart = i + 1;
      continue;
    }
    const textKeyMatch = line.match(/^texts\.(\w+):\s*(.+?)\s*$/i);
    if (textKeyMatch) {
      texts[textKeyMatch[1]] = textKeyMatch[2];
      contentStart = i + 1;
      continue;
    }
    if (line.trim() === "") {
      contentStart = i + 1;
      continue;
    }
    if (/^\*\*Purpose:/i.test(line)) {
      contentStart = i + 1;
      continue;
    }
    break;
  }
  const rest = body.slice(contentStart);
  const blocks = splitNamedBlocks(rest);
  let onSlideLines = blocks.onSlide;
  let notesLines = blocks.notes;
  let visualPaths = blocks.visuals;
  if (onSlideLines === null) {
    onSlideLines = blocks.default;
  }
  if (notesLines === null) notesLines = [];
  if (visualPaths.length > 0) {
    meta.images = [...meta.images || [], ...visualPaths];
  }
  for (const line of rest) {
    const layoutBold = line.match(/^\*\*Layout:\*\*\s*(.+?)\s*$/i);
    if (layoutBold) meta.layout = layoutBold[1].trim();
  }
  const parsed = bodyFromOnSlide(onSlideLines, headingTitle);
  const notes = notesLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const images = (meta.images || []).map((p) => {
    const cleaned = p.replace(/^`|`$/g, "").trim();
    const abs = isAbsolute2(cleaned) ? cleaned : resolve4(join6(baseDir, cleaned));
    return { path: abs, declared: cleaned };
  });
  if (parsed.subtitle && texts.subtitle === void 0) {
    texts.subtitle = parsed.subtitle;
  }
  const slide = {
    title: parsed.title || headingTitle || `Slide ${fallbackNumber}`,
    body: parsed.body,
    notes: notes || void 0,
    layout: meta.layout,
    texts: Object.keys(texts).length > 0 ? texts : void 0,
    images: images.length > 0 ? images.map(({ path }) => ({ path })) : [],
    sourceIndex: fallbackNumber,
    sourceLine: section.sourceLine,
    sourceFile: file
  };
  if (slide.body === "" || slide.body === void 0) delete slide.body;
  if (!slide.notes) delete slide.notes;
  if (!slide.layout) delete slide.layout;
  if (!slide.texts) delete slide.texts;
  return slide;
}
function titleFromHeading(heading) {
  const slideForm = heading.match(/^##\s+Slide\s+\d+\s*[.:]\s*(.+?)\s*$/i);
  if (slideForm) return slideForm[1].trim();
  const bare = heading.match(/^##\s+(.+?)\s*$/);
  return bare ? bare[1].trim() : "";
}
function splitNamedBlocks(lines) {
  let mode = "default";
  const defaultLines = [];
  const onSlide = [];
  const notes = [];
  const visuals = [];
  let sawOnSlide = false;
  let sawNotes = false;
  for (const raw of lines) {
    const line = raw;
    const visualMatch = line.match(
      /^\*\*Visual(?:\s*\([^)]*\))?:\*\*\s*(.+?)\s*$/i
    ) || line.match(/^visual:\s*(.+?)\s*$/i);
    if (visualMatch) {
      visuals.push(visualMatch[1].trim());
      continue;
    }
    if (/^\*\*On-slide label/i.test(line)) {
      mode = "onSlide";
      sawOnSlide = true;
      continue;
    }
    if (/^On[\s-]?slide:\s*$/i.test(line) || /^On[\s-]?slide:\s+/i.test(line)) {
      mode = "onSlide";
      sawOnSlide = true;
      const after = line.replace(/^On[\s-]?slide:\s*/i, "");
      if (after.trim()) onSlide.push(after);
      continue;
    }
    if (/^Presenter notes:\s*$/i.test(line) || /^Notes:\s*$/i.test(line)) {
      mode = "notes";
      sawNotes = true;
      continue;
    }
    if (mode === "default" && /^\*\*Purpose:/i.test(line)) continue;
    if (mode === "onSlide") onSlide.push(line);
    else if (mode === "notes") notes.push(line);
    else defaultLines.push(line);
  }
  return {
    default: defaultLines,
    onSlide: sawOnSlide ? onSlide : null,
    notes: sawNotes ? notes : null,
    visuals
  };
}
function bodyFromOnSlide(lines, headingTitle) {
  const cleaned = [];
  for (const line of lines) {
    cleaned.push(line);
  }
  while (cleaned.length && cleaned[0].trim() === "") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].trim() === "") cleaned.pop();
  let title = headingTitle || "";
  let subtitle;
  const bodyLines = [];
  let i = 0;
  if (cleaned.length && normalizeTitle(cleaned[0]) === normalizeTitle(headingTitle)) {
    title = cleaned[0].trim();
    i = 1;
    while (i < cleaned.length && cleaned[i].trim() === "") i += 1;
  }
  if (i < cleaned.length) {
    const lead = cleaned[i].trim();
    if (lead.endsWith(":") && !isListItem(lead) && !lead.startsWith("**") && lead.length < 120) {
      subtitle = lead;
      i += 1;
      while (i < cleaned.length && cleaned[i].trim() === "") i += 1;
    }
  }
  for (; i < cleaned.length; i += 1) {
    const line = cleaned[i];
    if (line.trim() === "") {
      if (bodyLines.length && bodyLines[bodyLines.length - 1] !== "") bodyLines.push("");
      continue;
    }
    bodyLines.push(stripMdInline(line));
  }
  while (bodyLines.length && bodyLines[bodyLines.length - 1] === "") bodyLines.pop();
  const normalized = bodyLines.map((line) => {
    const m = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (m) return m[1];
    return line;
  });
  const body = normalized.length ? normalized.join("\n") : void 0;
  return { title, subtitle, body };
}
function isListItem(line) {
  return /^\s*(?:[-*]|\d+\.)\s+/.test(line);
}
function stripMdInline(line) {
  return line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "$1").replace(/`([^`]+)`/g, "$1");
}
function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase().replace(/[.。]+$/g, "");
}
function sameBody(a, b) {
  return normalizeBody(a) === normalizeBody(b);
}
function normalizeBody(value) {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join("\n") : String(value);
  return text.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();
}
function sameText(a, b) {
  return String(a ?? "").trim() === String(b ?? "").trim();
}
var init_markdown = __esm({
  "tools/keynote-render/scripts/lib/markdown.js"() {
  }
});

// tools/keynote-render/scripts/lib/diff.js
var diff_exports = {};
__export(diff_exports, {
  diffDeck: () => diffDeck,
  planApplication: () => planApplication
});
function diffDeck(mdSlides, deckSlides, options = {}) {
  const allowDelete = Boolean(options.allowDelete);
  const ops = [];
  const mdCount = mdSlides.length;
  const deckCount = deckSlides.length;
  const shared = Math.min(mdCount, deckCount);
  for (let i = 0; i < shared; i += 1) {
    const md = mdSlides[i];
    const live = deckSlides[i];
    const slideNumber = i + 1;
    const changes = contentChanges(md, live);
    if (Object.keys(changes).length === 0) {
      ops.push({
        op: "keep",
        slide: slideNumber,
        title: md.title,
        reason: "content matches"
      });
    } else {
      ops.push({
        op: "update",
        slide: slideNumber,
        title: md.title,
        changes,
        // Fields the mutator will apply
        patch: buildPatch(md, changes)
      });
    }
  }
  if (mdCount > deckCount) {
    for (let i = deckCount; i < mdCount; i += 1) {
      const md = mdSlides[i];
      ops.push({
        op: "insert",
        after: i,
        // after slide i (0 = before first when inserting into empty, else after last existing at this point)
        // When applying left-to-right, after = current deck length at insert time.
        // We store the markdown index (0-based) and the intended final position.
        at: i + 1,
        title: md.title,
        layout: md.layout,
        slide: md
      });
    }
  }
  if (deckCount > mdCount) {
    for (let i = mdCount; i < deckCount; i += 1) {
      const live = deckSlides[i];
      const slideNumber = i + 1;
      if (allowDelete) {
        ops.push({
          op: "delete",
          slide: slideNumber,
          title: live.defaultTitle || live.title || null,
          reason: "not present in markdown (--allow-delete)"
        });
      } else {
        ops.push({
          op: "keep-extra",
          slide: slideNumber,
          title: live.defaultTitle || live.title || null,
          reason: "deck has a slide not in markdown; pass --allow-delete to remove it"
        });
      }
    }
  }
  for (let i = 0; i < shared; i += 1) {
    const md = mdSlides[i];
    const live = deckSlides[i];
    const liveTitle = live.defaultTitle || live.title || "";
    if (liveTitle && md.title && !sameText(md.title, liveTitle)) {
      const op = ops[i];
      if (op && (op.op === "update" || op.op === "keep")) {
        op.titleMismatch = {
          markdown: md.title,
          deck: liveTitle
        };
      }
    }
  }
  const summary = {
    markdownSlides: mdCount,
    deckSlides: deckCount,
    keep: ops.filter((o) => o.op === "keep").length,
    update: ops.filter((o) => o.op === "update").length,
    insert: ops.filter((o) => o.op === "insert").length,
    delete: ops.filter((o) => o.op === "delete").length,
    keepExtra: ops.filter((o) => o.op === "keep-extra").length,
    allowDelete
  };
  return { ops, summary };
}
function contentChanges(md, live) {
  const changes = {};
  const liveTitle = live.defaultTitle ?? live.title ?? null;
  const liveBody = live.defaultBody ?? live.body ?? null;
  const liveNotes = live.presenterNotes ?? live.notes ?? null;
  if (md.title !== void 0 && !sameText(md.title, liveTitle)) {
    changes.title = { from: liveTitle, to: md.title };
  }
  if (md.body !== void 0 && !sameBody(md.body, liveBody)) {
    changes.body = { from: normalizeBody(liveBody), to: normalizeBody(md.body) };
  }
  if (md.notes !== void 0 && !sameText(md.notes, liveNotes)) {
    changes.notes = { from: liveNotes, to: md.notes };
  }
  if (md.texts) {
    const textDiff = {};
    for (const [key, value] of Object.entries(md.texts)) {
      const liveItem = liveTextForKey(live, key);
      if (liveItem === void 0 || !sameText(value, liveItem)) {
        textDiff[key] = { from: liveItem ?? null, to: value };
      }
    }
    if (Object.keys(textDiff).length > 0) changes.texts = textDiff;
  }
  if (md.images && md.images.length > 0) {
    const liveCount = live.imageCount ?? 0;
    changes.images = {
      fromCount: liveCount,
      to: md.images.map((im) => im.path),
      policy: liveCount > 0 ? "replace-existing-then-add" : "add"
    };
  }
  return changes;
}
function liveTextForKey(live, key) {
  if (!live) return void 0;
  if (key === "subtitle" && Array.isArray(live.textItems)) {
    const item = live.textItems.find((t) => t.index === 1);
    return item?.text;
  }
  if (/^\d+$/.test(key) && Array.isArray(live.textItems)) {
    const item = live.textItems.find((t) => t.index === Number(key));
    return item?.text;
  }
  return void 0;
}
function buildPatch(md, changes) {
  const patch = {};
  if (changes.title) patch.title = md.title;
  if (changes.body) patch.body = md.body;
  if (changes.notes) patch.notes = md.notes;
  if (changes.texts) {
    patch.texts = {};
    for (const key of Object.keys(changes.texts)) {
      patch.texts[key] = md.texts[key];
    }
  }
  if (changes.images) patch.images = md.images;
  if (md.layout) patch.layout = md.layout;
  return patch;
}
function planApplication(ops) {
  const updates = ops.filter((o) => o.op === "update");
  const inserts = ops.filter((o) => o.op === "insert");
  const deletes = ops.filter((o) => o.op === "delete").sort((a, b) => b.slide - a.slide);
  const keeps = ops.filter((o) => o.op === "keep" || o.op === "keep-extra");
  const ordered = [];
  for (const u of updates) ordered.push({ ...u });
  let lastAfter = null;
  for (const ins of inserts) {
    const after = lastAfter === null ? ins.after : lastAfter;
    ordered.push({ ...ins, after });
    lastAfter = after + 1;
  }
  for (const d of deletes) ordered.push({ ...d });
  return { apply: ordered, report: [...keeps, ...updates, ...inserts, ...ops.filter((o) => o.op === "delete")] };
}
var init_diff = __esm({
  "tools/keynote-render/scripts/lib/diff.js"() {
    init_markdown();
  }
});

// tools/keynote-render/scripts/render.js
import { execFileSync as execFileSync2 } from "node:child_process";
import { accessSync, constants as constants2, existsSync as existsSync7, mkdirSync as mkdirSync3, readFileSync as readFileSync5, realpathSync as realpathSync3, statSync as statSync3 } from "node:fs";
import { basename as basename3, dirname as dirname6, isAbsolute as isAbsolute3, join as join7, resolve as resolve5, sep as sep2 } from "node:path";
import { fileURLToPath as fileURLToPath2, pathToFileURL as pathToFileURL2 } from "node:url";

// tools/lib/one-file.js
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function packagesBundled() {
  return true;
}
async function packagesAvailable(marker, loadPackages, external = []) {
  return (await packageAvailability(marker, loadPackages, external)).available;
}
async function packageAvailability(marker, loadPackages, external) {
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
    await loadPackages();
    return { available: true };
  } catch {
    return unavailable;
  }
}
async function compiledEntry(marker, loadPackages, entryUrl, name, external = []) {
  const state = await packageAvailability(marker, loadPackages, external);
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

// tools/lib/consent.js
import { closeSync, constants, existsSync as existsSync2, fstatSync, lstatSync, mkdirSync, openSync, readFileSync as readFileSync2, realpathSync as realpathSync2, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname as dirname2, join as join3 } from "node:path";

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

// tools/lib/consent.js
var INSTALL_ONCE = "You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
var INSTALL_HELP = "Say yes to the download this tool needs. You'll only be asked once: your yes also covers anything else Wiser needs to download later, including after updates.";
var INSTALL_COPY_ONLY = "Wiser will install this, but it can only remember your yes until the next Wiser update, so you may be asked again then. Reason: ";
var INSTALL_NOT_SAVED = "Wiser will install this now, but it couldn't remember your yes, so you'll be asked again next time. Reason: ";
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
var MARKER_NAME = ".wiser-consent";
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
var warned = /* @__PURE__ */ new Set();
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
var INSTALL_BYTES = Object.freeze({
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

// tools/keynote-render/scripts/render.js
var HERE = realpathSync3(fileURLToPath2(import.meta.url));
var SCRIPT_DIR = dirname6(HERE);
var TOOL_DIR = resolve5(SCRIPT_DIR, "..");
async function main(argv = process.argv.slice(2)) {
  const DEP_MARKER = join7(TOOL_DIR, "node_modules", "yaml", "package.json");
  const COMMANDS = /* @__PURE__ */ new Set([
    "check",
    "themes",
    "layouts",
    "build",
    "inspect",
    "snapshot",
    "export",
    "update-slide",
    "insert-slide",
    "delete-slide",
    "sync"
  ]);
  const EXPORT_FORMATS = {
    pdf: { keynote: "PDF", extension: ".pdf" },
    pptx: { keynote: "Microsoft PowerPoint", extension: ".pptx" },
    html: { keynote: "HTML", extension: ".html" },
    images: { keynote: "slide images", extension: "-images" }
  };
  const SLIDE_KEYS = /* @__PURE__ */ new Set(["layout", "title", "body", "texts", "notes", "images"]);
  const IMAGE_KEYS = /* @__PURE__ */ new Set(["path", "x", "y", "width", "height"]);
  const USAGE = `keynote-render - native Keynote build and in-place markdown sync

Primary workstream (agent entry):
  node scripts/render.js sync --md <path.md> --deck <path.key> [--brand <path.yaml>] [--theme "<name>"] [--confirm] [--allow-delete] [--out <dir for snapshot>]

  1. Load the markdown SSOT (--md).
  2. If the .key exists: archive it to sibling zArchive/ (standards/conventions.md § Archives),
     inspect the live deck, diff, apply minimal update/insert/delete, save in place.
  3. If the .key does not exist: full build from markdown (same as build), no archive.
  4. Optionally snapshot and report ops + archivePath.

Low-level mutators (each archives an existing .key first; require --confirm):
  node scripts/render.js update-slide --deck <path.key> --slide <n> [--title ...] [--body ...] [--notes ...] [--texts <json>] [--image <path>] [--confirm]
  node scripts/render.js insert-slide --deck <path.key> --after <n> --layout <master|intent> [--brand ...] [--title ...] [--body ...] [--notes ...] [--confirm]
  node scripts/render.js delete-slide --deck <path.key> --slide <n> [--confirm]

Greenfield / inspection:
  node scripts/render.js help
  node scripts/render.js check
  node scripts/render.js themes
  node scripts/render.js layouts --theme "<installed theme>"
  node scripts/render.js build --spec <path.json> [options]
  node scripts/render.js inspect --deck <path.key> --slide <n>
  node scripts/render.js snapshot --deck <path.key> [--out <dir>] [--confirm]
  node scripts/render.js export --deck <path.key> --format <format> [--out <path>] [--confirm]

Commands:
  sync          Markdown SSOT → archive → diff → patch existing .key (or build if missing)
  update-slide  V1: update title/body/notes/texts/images on one slide in place
  insert-slide  V2: insert a slide after index N (0 = front; omit/--after count = end)
  delete-slide  V2: delete slide N (renumbers remaining)
  check         Report whether osascript and Keynote are present; launches nothing
  themes        List every installed theme name
  layouts       List one theme's master layout names
  build         Build a deck JSON spec into a .key file
  inspect       Report one slide's master, placeholders, text items, and notes
  snapshot      Write one image per slide
  export        Export a deck as pdf, pptx, html, or images
  help          Print this message

Options:
  --md <path>         Markdown deck SSOT, absolute. Required by sync
  --spec <path>       Deck spec JSON, absolute. Required by build
  --deck <path>       Saved .key deck, absolute
  --brand <path>      Brand YAML, absolute
  --theme "<name>"    Installed theme name; overrides the brand's theme
  --out <path>        Output path, absolute (build/export/snapshot)
  --slide <n>         Slide number from 1
  --after <n>         Insert after slide n (0 = before first). insert-slide
  --layout <name>     Master name or brand layout intent
  --title <text>      Slide title
  --body <text|json>  Body string, or JSON array of lines
  --notes <text>      Presenter notes
  --texts <json>      JSON object of semantic keys or indices to text
  --image <path>      Absolute image path to place on the slide (repeatable via JSON in --texts only for multi; single --image)
  --format <fmt>      pdf, pptx, html, or images. Required by export
  --allow-delete      sync only: delete deck slides not present in markdown (off by default)
  --archive-dir <path> Override zArchive directory (same naming rules; absolute)
  --confirm           Required for mutators that change an existing .key; also replaces build/export outputs
  --install          ${INSTALL_HELP}
                     WISER_ALLOW_INSTALL=1 does the same for an unattended run.
  --help, -h          Print this message

Archive safety (every mutator on an existing .key):
  Copy to zArchive/ beside the .key as "YY-MM-DD Vn - <original name>" per
  standards/conventions.md § Archives. If the copy fails, the deck is not mutated.
  Result JSON includes archivePath.

Every path is absolute. Success prints one JSON object to stdout. Errors go to stderr with exit 1.`;
  function fail(message) {
    process.stderr.write(`${message}
`);
    process.exit(1);
  }
  function emit(object) {
    process.stdout.write(`${JSON.stringify(object)}
`);
    process.exit(0);
  }
  const command = argv[0] ?? "help";
  if (command === "help" || argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}
`);
    process.exit(0);
  }
  if (["build", "sync", "update-slide", "insert-slide"].includes(command) && argv.includes("--brand")) {
    const compiled = await compiledEntry(DEP_MARKER, () => Promise.resolve().then(() => (init_brand(), brand_exports)), import.meta.url, "render");
    if (compiled) return (await import(compiled)).main(argv);
  }
  if (!COMMANDS.has(command)) {
    fail(`Error: unknown command "${command}". Run "node scripts/render.js help" for usage.`);
  }
  const VALUE_FLAGS = /* @__PURE__ */ new Set([
    "--spec",
    "--deck",
    "--brand",
    "--theme",
    "--out",
    "--slide",
    "--format",
    "--md",
    "--after",
    "--layout",
    "--title",
    "--body",
    "--notes",
    "--texts",
    "--image",
    "--archive-dir"
  ]);
  const BARE_FLAGS = /* @__PURE__ */ new Set([
    "--install",
    "--confirm",
    "--help",
    "-h",
    "--allow-delete"
  ]);
  const valuePositions = /* @__PURE__ */ new Set();
  for (let index = 1; index < argv.length; index += 1) {
    if (VALUE_FLAGS.has(argv[index])) valuePositions.add(index + 1);
  }
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (valuePositions.has(index)) continue;
    if (option.startsWith("-") && !VALUE_FLAGS.has(option) && !BARE_FLAGS.has(option)) {
      fail(`Error: unknown option "${option}". Run "node scripts/render.js help" for usage.`);
    }
  }
  const install = parsedInstallFlag(argv, VALUE_FLAGS);
  function flag(name) {
    const index = argv.indexOf(name);
    if (index === -1) return void 0;
    const value = argv[index + 1];
    if (argv.indexOf(name, index + 1) !== -1) {
      fail(`Error: ${name} was given more than once and takes one value. Run "node scripts/render.js help" for usage.`);
    }
    if (value === void 0 || value.startsWith("--")) {
      fail(`Error: ${name} needs a value. Run "node scripts/render.js help" for usage.`);
    }
    return value;
  }
  const confirmed = argv.includes("--confirm");
  function canonical(label, candidate) {
    const absolute = resolve5(candidate);
    const missing = [];
    let head = absolute;
    for (; ; ) {
      try {
        const real = realpathSync3(head);
        return missing.length === 0 ? real : join7(real, ...missing);
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") {
          fail(`Error: ${label} could not be resolved to a real path at ${head}. Confirm every folder on the way is readable by this account and that no symbolic link on it points at itself.`);
        }
        const parent = dirname6(head);
        if (parent === head) return absolute;
        missing.unshift(basename3(head));
        head = parent;
      }
    }
  }
  function insideToolDirectory(target) {
    const root = canonical("this tool directory", TOOL_DIR);
    if (target === root || target.startsWith(root + sep2)) return true;
    let rootId;
    try {
      rootId = statSync3(root);
    } catch {
      return false;
    }
    let head = target;
    for (; ; ) {
      try {
        const id = statSync3(head);
        if (id.dev === rootId.dev && id.ino === rootId.ino) return true;
      } catch {
      }
      const parent = dirname6(head);
      if (parent === head) return false;
      head = parent;
    }
  }
  function requirePath(name, value, { mustExist = true } = {}) {
    if (!value) fail(`Error: ${name} is required. Pass ${name} <absolute path>.`);
    if (!isAbsolute3(value)) {
      fail(`Error: ${name} must be absolute; got "${value}". Pass a full path, not one relative to the current directory.`);
    }
    const target = canonical(name, value);
    if (mustExist && !existsSync7(target)) fail(`Error: no file at ${target}. Check the path.`);
    return target;
  }
  function guardOutside(target, label) {
    const resolved = canonical(label, target);
    if (insideToolDirectory(resolved)) {
      fail(`Error: ${label} resolves inside this tool directory (${canonical("this tool directory", TOOL_DIR)}). Pass a path in a work directory of the owning root.`);
    }
    return resolved;
  }
  function guardExisting(target, label) {
    if (existsSync7(target) && !confirmed) {
      fail(`Error: ${label} already exists at ${target}. Pass --confirm to replace it, or choose another path with --out.`);
    }
    return target;
  }
  const { keynoteBundle: keynoteBundle2, osascriptPresent: osascriptPresent2 } = await Promise.resolve().then(() => (init_jxa(), jxa_exports));
  function requireRuntimes() {
    if (!osascriptPresent2()) {
      fail("Error: missing osascript; check: osascript -l JavaScript -e 'JSON.stringify(true)'. This tool drives Keynote through JXA and runs on macOS only. See the Dependencies section of TOOL.md.");
    }
    if (!keynoteBundle2()) {
      fail("Error: missing Keynote; check: /Applications/Keynote.app or /Applications/Keynote Creator Studio.app exists. See the Dependencies section of TOOL.md; install steps live nowhere in this tool.");
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
  const WILL_FETCH_BROWSER = false;
  function installPlan() {
    let names = [];
    try {
      names = Object.keys(JSON.parse(readFileSync5(join7(TOOL_DIR, "package.json"), "utf8")).dependencies || {});
    } catch {
    }
    const browser = names.includes("playwright");
    return {
      list: names.length ? names.join(", ") : "the packages package.json declares",
      hosts: "registry.npmjs.org",
      // KEYED ON THIS RUN, not on the tool. Round 8 found this promising a browser
      // download on `deck-export scaffold --install`, which makes none; round 9
      // found the hedge that replaced it naming "a survey" as an example of a
      // command that fetches no browser, which `check --install` had just
      // falsified in the same commit. `WILL_FETCH_BROWSER` is set by each entry
      // script from the command it is actually running, so the report describes
      // this run rather than the tool's general capabilities.
      size: browser && WILL_FETCH_BROWSER ? " This run then fetches the Chromium build, several hundred megabytes, from cdn.playwright.dev, or from playwright.download.prss.microsoft.com when Playwright falls back. That build does NOT land here: it goes wherever Playwright keeps browser builds on this machine, which tools/AGENTS.md names for each platform." : ""
    };
  }
  function requireInstallConsent(what) {
    if (installAuthorised(HERE, install)) {
      writeConsent(HERE, "keynote-render", install);
      return;
    }
    if (what === "browser") {
      fail(
        `${installQuestion("a private copy of the Chromium browser", "build and edit Keynote decks", formatInstallSize(INSTALL_BYTES.chromium))}

Details for the assistant: this tool's packages are installed but the Chromium build they drive is not, and this person has not authorised a Wiser install. Installing fetches that build from cdn.playwright.dev, or playwright.download.prss.microsoft.com when Playwright falls back, several hundred megabytes, into wherever Playwright keeps browser builds on this machine. No package is fetched and npm is not run. tools/AGENTS.md lists every write an install makes and names where the build lands. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
      );
    }
    const { list, hosts, size } = installPlan();
    fail(
      `${installQuestion("a small file-format library", "build and edit Keynote decks", formatInstallSize(INSTALL_BYTES.keynote))}

Details for the assistant: this tool is not installed yet and this person has not authorised a Wiser install. Installing fetches ${list} from ${hosts} into ${TOOL_DIR}, and npm writes its own cache outside this plugin.${size} tools/AGENTS.md lists every write an install makes. Re-run the same command with --install to authorise it, or set WISER_ALLOW_INSTALL=1 for an unattended run. Nothing is read from stdin, so this is the only way to answer.`
    );
  }
  if (command === "check") {
    const bundle = keynoteBundle2();
    emit({ osascript: osascriptPresent2(), keynote: Boolean(bundle), keynoteApp: bundle?.app ?? null });
  }
  async function requirePackages() {
    if (await packagesAvailable(DEP_MARKER, () => Promise.resolve().then(() => (init_brand(), brand_exports)))) return;
    requireInstallConsent("packages");
    process.stderr.write("First run: installing dependencies in this tool directory.\n");
    try {
      const npm = process.platform === "win32" ? "npm.cmd" : "npm";
      execFileSync2(npm, ["ci"], { cwd: TOOL_DIR, stdio: ["ignore", "ignore", "inherit"] });
    } catch {
      if (!isWritable(TOOL_DIR)) {
        fail(`Error: cannot install dependencies because ${TOOL_DIR} is not writable. This tool installs its dependencies into its own directory on the run that authorises it with --install, so that directory has to be writable. Install this plugin somewhere you own, or make that directory writable, then run the command again.`);
      }
      fail(`Error: npm ci failed in ${TOOL_DIR}. Confirm Node 18 or newer, then that package-lock.json is present and matches package.json, which is what npm ci requires and will not resolve around. Delete node_modules there and run "npm ci" by hand to see npm's own message. A lockfile that is missing or out of step with the manifest is a defect in this copy of the plugin, not something a re-run fixes. See SETUP.md.`);
    }
    if (!await packagesAvailable(DEP_MARKER, () => Promise.resolve().then(() => (init_brand(), brand_exports)))) {
      fail("Error: npm ci finished but the required packages do not load. Restore this plugin copy and run again.");
    }
  }
  try {
    if (command === "themes") await themes();
    else if (command === "layouts") await layouts();
    else if (command === "build") await build();
    else if (command === "inspect") await inspectSlideCommand();
    else if (command === "snapshot") await snapshot();
    else if (command === "export") await exportDeckCommand();
    else if (command === "update-slide") await updateSlideCommand();
    else if (command === "insert-slide") await insertSlideCommand();
    else if (command === "delete-slide") await deleteSlideCommand();
    else if (command === "sync") await syncCommand();
  } catch (error) {
    fail(`Error: ${error.message}`);
  }
  function archiveDeck(deckPath) {
    const archiveDir = flag("--archive-dir") ? guardOutside(requirePath("--archive-dir", flag("--archive-dir"), { mustExist: false }), "--archive-dir") : void 0;
    return Promise.resolve().then(() => (init_archive(), archive_exports)).then(({ archiveBeside: archiveBeside2 }) => archiveBeside2(deckPath, archiveDir ? { archiveDir } : {}));
  }
  function requireConfirm(action) {
    if (!confirmed) {
      fail(`Error: ${action} changes an existing deck. Pass --confirm after reviewing the planned change. A copy is written to sibling zArchive/ first (standards/conventions.md § Archives).`);
    }
  }
  function parseBodyFlag(raw) {
    if (raw === void 0) return void 0;
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch (e) {
        fail(`Error: --body looks like JSON but failed to parse: ${e.message}`);
      }
      if (!Array.isArray(parsed) || !parsed.every((line) => typeof line === "string")) {
        fail("Error: --body as JSON must be an array of strings.");
      }
      return parsed.join("\n");
    }
    return raw;
  }
  function parseTextsFlag(raw) {
    if (raw === void 0) return void 0;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      fail(`Error: --texts must be JSON object: ${e.message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      fail("Error: --texts must be a JSON object mapping keys or indices to text.");
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== "string") fail(`Error: --texts.${k} must be a string.`);
    }
    return parsed;
  }
  function warningsFromWrite(where, result) {
    const warnings = [];
    for (const [field, status] of [["title", result.titleSet], ["body", result.bodySet]]) {
      if (status === false) warnings.push(`${where}: this master has no ${field} placeholder; that text was not written`);
      if (status === "hidden") warnings.push(`${where}: this master hides the ${field} placeholder; route that text through "texts" with an item index instead`);
    }
    for (const [index, ok] of Object.entries(result.textsSet ?? {})) {
      if (!ok) warnings.push(`${where}: no text item at index ${index}; that text was not written`);
    }
    return warnings;
  }
  async function resolveSlideContent(slide, brandPath, themeOverride, baseDir) {
    let brandEntry = null;
    if (brandPath) {
      await requirePackages();
      const { loadBrand: loadBrand2 } = await Promise.resolve().then(() => (init_brand(), brand_exports));
      brandEntry = loadBrand2(brandPath);
    }
    const { resolveDeck: resolveDeck2 } = await Promise.resolve().then(() => (init_deck(), deck_exports));
    const needsTheme = Boolean(slide.layout) || Boolean(brandEntry) || Boolean(themeOverride);
    let theme = themeOverride || brandEntry?.brand?.theme;
    if (!theme && needsTheme && slide.layout && brandEntry?.brand?.layouts?.[slide.layout]) {
      theme = brandEntry.brand.theme;
    }
    if (!theme) {
      const texts = slide.texts;
      if (texts) {
        for (const key of Object.keys(texts)) {
          if (!/^\d+$/.test(key)) {
            fail(`Error: texts key "${key}" is not an index, and no --brand maps it. Pass --brand or use numeric indices.`);
          }
        }
      }
      const images = (slide.images ?? []).map((image, j) => {
        const p = image.path;
        if (!isAbsolute3(p)) fail(`Error: image path must be absolute; got "${p}".`);
        if (!existsSync7(p)) fail(`Error: no image at ${p}.`);
        return { path: p, x: image.x ?? null, y: image.y ?? null, width: image.width ?? null, height: image.height ?? null };
      });
      return {
        theme: null,
        slide: {
          layout: slide.layout,
          title: slide.title,
          body: Array.isArray(slide.body) ? slide.body.join("\n") : slide.body,
          texts: slide.texts,
          notes: slide.notes,
          images,
          replaceImages: slide.replaceImages
        }
      };
    }
    const resolved = resolveDeck2(
      [{
        layout: slide.layout,
        title: slide.title,
        body: Array.isArray(slide.body) ? slide.body.join("\n") : slide.body,
        texts: slide.texts,
        notes: slide.notes,
        images: slide.images ?? []
      }],
      brandEntry,
      themeOverride,
      baseDir
    );
    return {
      theme: resolved.theme,
      slide: { ...resolved.slides[0], replaceImages: slide.replaceImages }
    };
  }
  async function themes() {
    requireRuntimes();
    const { listThemes: listThemes2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    emit({ themes: await listThemes2() });
  }
  async function layouts() {
    const theme = flag("--theme");
    if (!theme) fail('Error: --theme is required. Pass --theme "<installed theme>"; run "themes" to list what is installed.');
    requireRuntimes();
    const { listLayouts: listLayouts2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    emit({ theme, layouts: await listLayouts2(theme) });
  }
  async function build() {
    const specPath = requirePath("--spec", flag("--spec"));
    const brandPath = flag("--brand") ? requirePath("--brand", flag("--brand")) : null;
    const themeOverride = flag("--theme") ?? null;
    const outPath = guardOutside(
      flag("--out") ? requirePath("--out", flag("--out"), { mustExist: false }) : specPath.replace(/\.json$/i, "") + ".key",
      "--out"
    );
    guardExisting(outPath, "The deck");
    const slides = readSpec(specPath);
    let brandEntry = null;
    if (brandPath) {
      await requirePackages();
      const { loadBrand: loadBrand2 } = await Promise.resolve().then(() => (init_brand(), brand_exports));
      brandEntry = loadBrand2(brandPath);
    }
    const { resolveDeck: resolveDeck2 } = await Promise.resolve().then(() => (init_deck(), deck_exports));
    const resolved = resolveDeck2(slides, brandEntry, themeOverride, dirname6(specPath));
    requireRuntimes();
    mkdirSync3(dirname6(outPath), { recursive: true });
    const { buildDeck: buildDeck2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    const result = await buildDeck2(resolved.theme, resolved.slides, outPath);
    const warnings = [];
    for (const slide of result.slides) {
      const where = `slide ${slide.slideNumber} (${slide.layout || "default layout"})`;
      for (const [field, status] of [["title", slide.titleSet], ["body", slide.bodySet]]) {
        if (status === false) warnings.push(`${where}: this master has no ${field} placeholder; that text was not written`);
        if (status === "hidden") warnings.push(`${where}: this master hides the ${field} placeholder; route that text through "texts" with an item index instead`);
      }
      for (const [index, ok] of Object.entries(slide.textsSet ?? {})) {
        if (!ok) warnings.push(`${where}: no text item at index ${index}; that text was not written`);
      }
    }
    emit({
      name: result.name,
      theme: resolved.theme,
      slideCount: result.slideCount,
      outputPath: outPath,
      slides: result.slides,
      warnings
    });
  }
  async function inspectSlideCommand() {
    const deckPath = requirePath("--deck", flag("--deck"));
    const slideNumber = Number(flag("--slide"));
    if (!Number.isInteger(slideNumber) || slideNumber < 1) {
      fail("Error: --slide must be a whole number from 1.");
    }
    requireRuntimes();
    const { inspectSlide: inspectSlide2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    emit(await inspectSlide2(deckPath, slideNumber));
  }
  async function snapshot() {
    const deckPath = requirePath("--deck", flag("--deck"));
    const outDir = guardOutside(
      flag("--out") ? requirePath("--out", flag("--out"), { mustExist: false }) : deckPath.replace(/\.key$/i, "") + "-slides",
      "--out"
    );
    guardExisting(outDir, "The snapshot directory");
    requireRuntimes();
    const { snapshotDeck: snapshotDeck2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    emit(await snapshotDeck2(deckPath, outDir));
  }
  async function exportDeckCommand() {
    const deckPath = requirePath("--deck", flag("--deck"));
    const format = String(flag("--format") ?? "").toLowerCase();
    if (!EXPORT_FORMATS[format]) {
      fail(`Error: --format must be one of ${Object.keys(EXPORT_FORMATS).join(", ")}.`);
    }
    const outPath = guardOutside(
      flag("--out") ? requirePath("--out", flag("--out"), { mustExist: false }) : deckPath.replace(/\.key$/i, "") + EXPORT_FORMATS[format].extension,
      "--out"
    );
    guardExisting(outPath, "The export");
    requireRuntimes();
    const { exportDeck: exportDeck2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    const result = await exportDeck2(deckPath, EXPORT_FORMATS[format].keynote, outPath);
    emit({ ...result, format });
  }
  async function updateSlideCommand() {
    const deckPath = requirePath("--deck", flag("--deck"));
    const slideNumber = Number(flag("--slide"));
    if (!Number.isInteger(slideNumber) || slideNumber < 1) {
      fail("Error: --slide must be a whole number from 1.");
    }
    requireConfirm("update-slide");
    const title = flag("--title");
    const body = parseBodyFlag(flag("--body"));
    const notes = flag("--notes");
    const texts = parseTextsFlag(flag("--texts"));
    const imagePath = flag("--image") ? requirePath("--image", flag("--image")) : null;
    const layout = flag("--layout");
    const brandPath = flag("--brand") ? requirePath("--brand", flag("--brand")) : null;
    if (title === void 0 && body === void 0 && notes === void 0 && !texts && !imagePath && !layout) {
      fail("Error: update-slide needs at least one of --title, --body, --notes, --texts, --image, --layout.");
    }
    const raw = {
      title,
      body,
      notes,
      texts,
      layout: layout || void 0,
      images: imagePath ? [{ path: imagePath }] : [],
      replaceImages: Boolean(imagePath)
    };
    for (const key of Object.keys(raw)) {
      if (raw[key] === void 0) delete raw[key];
    }
    const { slide } = await resolveSlideContent(
      raw,
      brandPath,
      flag("--theme") ?? null,
      dirname6(deckPath)
    );
    requireRuntimes();
    const archivePath = await archiveDeck(deckPath);
    const { updateSlide: updateSlide2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    const result = await updateSlide2(deckPath, slideNumber, slide);
    const warnings = warningsFromWrite(`slide ${slideNumber}`, result);
    emit({
      op: "update-slide",
      deck: deckPath,
      archivePath,
      ...result,
      warnings
    });
  }
  async function insertSlideCommand() {
    const deckPath = requirePath("--deck", flag("--deck"));
    const afterRaw = flag("--after");
    const after = afterRaw === void 0 ? null : Number(afterRaw);
    if (afterRaw !== void 0 && (!Number.isInteger(after) || after < 0)) {
      fail("Error: --after must be a whole number from 0 (before first slide).");
    }
    requireConfirm("insert-slide");
    const layout = flag("--layout");
    const brandPath = flag("--brand") ? requirePath("--brand", flag("--brand")) : null;
    const title = flag("--title");
    const body = parseBodyFlag(flag("--body"));
    const notes = flag("--notes");
    const texts = parseTextsFlag(flag("--texts"));
    const imagePath = flag("--image") ? requirePath("--image", flag("--image")) : null;
    const raw = {
      layout: layout || void 0,
      title,
      body,
      notes,
      texts,
      images: imagePath ? [{ path: imagePath }] : []
    };
    for (const key of Object.keys(raw)) {
      if (raw[key] === void 0) delete raw[key];
    }
    const { slide } = await resolveSlideContent(
      raw,
      brandPath,
      flag("--theme") ?? null,
      dirname6(deckPath)
    );
    requireRuntimes();
    const { inspectDeck: inspectDeck2, insertSlide: insertSlide2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    let afterIndex = after;
    if (afterIndex === null) {
      const live = await inspectDeck2(deckPath);
      afterIndex = live.slideCount;
    }
    const archivePath = await archiveDeck(deckPath);
    const result = await insertSlide2(deckPath, afterIndex, slide);
    const warnings = warningsFromWrite(`inserted slide ${result.slideNumber}`, result);
    emit({
      op: "insert-slide",
      deck: deckPath,
      archivePath,
      ...result,
      warnings
    });
  }
  async function deleteSlideCommand() {
    const deckPath = requirePath("--deck", flag("--deck"));
    const slideNumber = Number(flag("--slide"));
    if (!Number.isInteger(slideNumber) || slideNumber < 1) {
      fail("Error: --slide must be a whole number from 1.");
    }
    requireConfirm("delete-slide");
    requireRuntimes();
    const archivePath = await archiveDeck(deckPath);
    const { deleteSlide: deleteSlide2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    const result = await deleteSlide2(deckPath, slideNumber);
    emit({
      op: "delete-slide",
      deck: deckPath,
      archivePath,
      ...result
    });
  }
  async function syncCommand() {
    const mdPath = requirePath("--md", flag("--md"));
    const deckArg = flag("--deck");
    if (!deckArg) fail("Error: --deck is required. Pass --deck <absolute .key> (existing or destination for a new build).");
    if (!isAbsolute3(deckArg)) {
      fail(`Error: --deck must be absolute; got "${deckArg}".`);
    }
    const deckPath = guardOutside(
      requirePath("--deck", deckArg, { mustExist: false }),
      "--deck"
    );
    const brandPath = flag("--brand") ? requirePath("--brand", flag("--brand")) : null;
    const themeOverride = flag("--theme") ?? null;
    const allowDelete = argv.includes("--allow-delete");
    const deckExists = existsSync7(deckPath);
    const { parseMarkdownDeck: parseMarkdownDeck2 } = await Promise.resolve().then(() => (init_markdown(), markdown_exports));
    const { slides: mdSlides, meta } = parseMarkdownDeck2(mdPath);
    if (!deckExists) {
      if (!brandPath && !themeOverride) {
        fail("Error: building a new deck requires --brand or --theme so Keynote knows which theme to use.");
      }
      guardExisting(deckPath, "The deck");
      let brandEntry2 = null;
      if (brandPath) {
        await requirePackages();
        const { loadBrand: loadBrand2 } = await Promise.resolve().then(() => (init_brand(), brand_exports));
        brandEntry2 = loadBrand2(brandPath);
      }
      const { resolveDeck: resolveDeck2 } = await Promise.resolve().then(() => (init_deck(), deck_exports));
      const forResolve = mdSlides.map((s) => ({
        layout: s.layout,
        title: s.title,
        body: s.body,
        texts: s.texts,
        notes: s.notes,
        images: (s.images ?? []).map((im) => ({ path: im.path }))
      }));
      const resolved = resolveDeck2(forResolve, brandEntry2, themeOverride, dirname6(mdPath));
      requireRuntimes();
      mkdirSync3(dirname6(deckPath), { recursive: true });
      const { buildDeck: buildDeck2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
      const result = await buildDeck2(resolved.theme, resolved.slides, deckPath);
      const warnings2 = [];
      for (const slide of result.slides) {
        warnings2.push(...warningsFromWrite(`slide ${slide.slideNumber} (${slide.layout || "default layout"})`, slide));
      }
      emit({
        op: "sync",
        mode: "build",
        markdown: mdPath,
        deck: deckPath,
        archivePath: null,
        theme: resolved.theme,
        slideCount: result.slideCount,
        ops: mdSlides.map((s, i) => ({ op: "build", slide: i + 1, title: s.title })),
        summary: {
          markdownSlides: mdSlides.length,
          deckSlides: 0,
          built: result.slideCount,
          update: 0,
          insert: 0,
          delete: 0,
          keep: 0
        },
        slides: result.slides,
        warnings: warnings2,
        meta
      });
    }
    requireConfirm("sync against an existing deck");
    requireRuntimes();
    const { inspectDeck: inspectDeck2, applyOps: applyOps2, snapshotDeck: snapshotDeck2, inspectSlide: inspectSlide2 } = await Promise.resolve().then(() => (init_keynote(), keynote_exports));
    const live = await inspectDeck2(deckPath);
    const { diffDeck: diffDeck2, planApplication: planApplication2 } = await Promise.resolve().then(() => (init_diff(), diff_exports));
    const { ops, summary } = diffDeck2(mdSlides, live.slides, { allowDelete });
    const { apply: applyPlan } = planApplication2(ops);
    let brandEntry = null;
    if (brandPath) {
      await requirePackages();
      const { loadBrand: loadBrand2 } = await Promise.resolve().then(() => (init_brand(), brand_exports));
      brandEntry = loadBrand2(brandPath);
    }
    const resolveWarnings = [];
    function mapTextsSoft(texts, masterOrIntent) {
      if (!texts) return void 0;
      const brand = brandEntry?.brand;
      const master = brand?.layouts?.[masterOrIntent] || masterOrIntent || null;
      const keys = master && brand?.texts?.[master] || {};
      const byIndex = {};
      for (const [key, value] of Object.entries(texts)) {
        if (/^\d+$/.test(key)) {
          byIndex[key] = value;
        } else if (keys[key] !== void 0) {
          byIndex[String(keys[key])] = value;
        } else {
          resolveWarnings.push(
            `texts key "${key}" is not mapped on layout "${master || "(none)"}"; skipped (add it under texts in the brand, or use a numeric index)`
          );
        }
      }
      return Object.keys(byIndex).length > 0 ? byIndex : void 0;
    }
    function resolveOne(slideLike, layoutHint = null) {
      const images = (slideLike.images ?? []).map((im) => {
        if (!existsSync7(im.path)) {
          throw new Error(`no image at ${im.path}`);
        }
        return {
          path: im.path,
          x: im.x ?? null,
          y: im.y ?? null,
          width: im.width ?? null,
          height: im.height ?? null
        };
      });
      if (!brandEntry?.brand?.theme && !themeOverride) {
        if (slideLike.texts) {
          for (const key of Object.keys(slideLike.texts)) {
            if (!/^\d+$/.test(key)) {
              throw new Error(
                `texts key "${key}" is not an index, and no --brand maps it. Pass --brand or use numeric indices.`
              );
            }
          }
        }
        return {
          layout: slideLike.layout,
          title: slideLike.title,
          body: slideLike.body,
          texts: slideLike.texts,
          notes: slideLike.notes,
          images,
          replaceImages: Boolean(slideLike.images && slideLike.images.length)
        };
      }
      let layout = slideLike.layout;
      if (layout && brandEntry?.brand?.layouts?.[layout]) {
        layout = brandEntry.brand.layouts[layout];
      }
      const textMapLayout = layout || layoutHint || null;
      const texts = mapTextsSoft(slideLike.texts, textMapLayout);
      const out = {
        layout: slideLike.layout ? layout : void 0,
        title: slideLike.title,
        body: slideLike.body,
        texts,
        notes: slideLike.notes,
        images,
        replaceImages: Boolean(slideLike.images && slideLike.images.length)
      };
      if (!out.layout) delete out.layout;
      if (!out.texts) delete out.texts;
      return out;
    }
    const keynoteOps = [];
    for (const op of applyPlan) {
      if (op.op === "update") {
        const md = mdSlides[op.slide - 1];
        const liveSlide = live.slides[op.slide - 1];
        const patch = { ...op.patch };
        delete patch.layout;
        const toResolve = {
          title: patch.title,
          body: patch.body,
          notes: patch.notes,
          // Only resolve texts when the diff asked for a texts change
          texts: patch.texts,
          images: patch.images
        };
        const slideData = resolveOne(toResolve, liveSlide?.layout || null);
        const data = {};
        if (patch.title !== void 0) data.title = slideData.title;
        if (patch.body !== void 0) data.body = slideData.body;
        if (patch.notes !== void 0) data.notes = slideData.notes;
        if (patch.texts !== void 0) data.texts = slideData.texts;
        if (patch.images !== void 0) {
          data.images = slideData.images;
          data.replaceImages = true;
        }
        keynoteOps.push({ op: "update", slide: op.slide, slideData: data, title: op.title });
      } else if (op.op === "insert") {
        const md = op.slide;
        const slideData = resolveOne(md, null);
        keynoteOps.push({
          op: "insert",
          after: op.after,
          slideData,
          title: op.title
        });
      } else if (op.op === "delete") {
        keynoteOps.push({ op: "delete", slide: op.slide, title: op.title });
      }
    }
    if (keynoteOps.length === 0) {
      emit({
        op: "sync",
        mode: "noop",
        markdown: mdPath,
        deck: deckPath,
        archivePath: null,
        slideCount: live.slideCount,
        ops,
        summary,
        applied: [],
        warnings: [],
        meta
      });
    }
    const archivePath = await archiveDeck(deckPath);
    const jxaOps = keynoteOps.map(({ op: o, slide, after, slideData }) => {
      if (o === "update") return { op: o, slide, slideData };
      if (o === "insert") return { op: o, after, slideData };
      if (o === "delete") return { op: o, slide };
      return { op: o };
    });
    const applied = await applyOps2(deckPath, jxaOps);
    const warnings = [...resolveWarnings];
    for (const r of applied.applied) {
      if (r.op === "update" || r.op === "insert") {
        warnings.push(...warningsFromWrite(`${r.op} slide ${r.slideNumber}`, r));
      }
    }
    let verify = null;
    const firstUpdate = applied.applied.find((r) => r.op === "update");
    if (firstUpdate) {
      verify = await inspectSlide2(deckPath, firstUpdate.slideNumber);
    }
    let snapshot2 = null;
    if (flag("--out")) {
      const outDir = guardOutside(
        requirePath("--out", flag("--out"), { mustExist: false }),
        "--out"
      );
      if (existsSync7(outDir) && !confirmed) {
      }
      snapshot2 = await snapshotDeck2(deckPath, outDir);
    }
    emit({
      op: "sync",
      mode: "patch",
      markdown: mdPath,
      deck: deckPath,
      archivePath,
      slideCount: applied.slideCount,
      ops,
      summary: {
        ...summary,
        appliedUpdates: applied.applied.filter((r) => r.op === "update").length,
        appliedInserts: applied.applied.filter((r) => r.op === "insert").length,
        appliedDeletes: applied.applied.filter((r) => r.op === "delete").length
      },
      applied: applied.applied,
      verify: verify ? {
        slideNumber: verify.slideNumber,
        layout: verify.layout,
        defaultTitle: verify.defaultTitle,
        presenterNotes: verify.presenterNotes ? String(verify.presenterNotes).slice(0, 200) : null,
        shapeCount: verify.shapeCount
      } : null,
      snapshot: snapshot2,
      warnings,
      meta
    });
  }
  function readSpec(file) {
    let spec;
    try {
      spec = JSON.parse(readFileSync5(file, "utf8"));
    } catch (e) {
      fail(`Error: ${file} is not valid JSON: ${e.message}`);
    }
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
      fail(`Error: ${file} must hold a JSON object with a "slides" array.`);
    }
    const problems = [];
    for (const key of Object.keys(spec)) {
      if (key !== "slides") problems.push(`top level: "${key}" is not part of a deck spec; pass presentation on the command line (--theme, --brand, --out)`);
    }
    if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
      problems.push('top level: "slides" must be a non-empty array');
    }
    const slides = [];
    (Array.isArray(spec.slides) ? spec.slides : []).forEach((slide, i) => {
      const where = `slide ${i + 1}`;
      if (!slide || typeof slide !== "object" || Array.isArray(slide)) {
        problems.push(`${where}: must be an object`);
        return;
      }
      for (const key of Object.keys(slide)) {
        if (!SLIDE_KEYS.has(key)) problems.push(`${where}: "${key}" is not a slide field; the fields are ${[...SLIDE_KEYS].join(", ")}`);
      }
      if (slide.layout !== void 0 && typeof slide.layout !== "string") problems.push(`${where}: "layout" must be a layout intent or master name`);
      if (slide.title !== void 0 && typeof slide.title !== "string") problems.push(`${where}: "title" must be text`);
      if (slide.notes !== void 0 && typeof slide.notes !== "string") problems.push(`${where}: "notes" must be text`);
      if (slide.body !== void 0) {
        const lines = Array.isArray(slide.body) ? slide.body : [slide.body];
        if (!lines.every((line) => typeof line === "string")) problems.push(`${where}: "body" must be text or an array of text lines`);
      }
      if (slide.texts !== void 0) {
        if (!slide.texts || typeof slide.texts !== "object" || Array.isArray(slide.texts)) {
          problems.push(`${where}: "texts" must map semantic keys or text item indices to text`);
        } else if (!Object.values(slide.texts).every((value) => typeof value === "string")) {
          problems.push(`${where}: every value under "texts" must be text`);
        }
      }
      if (slide.images !== void 0) {
        if (!Array.isArray(slide.images)) problems.push(`${where}: "images" must be an array`);
        else slide.images.forEach((image, j) => {
          if (!image || typeof image !== "object" || Array.isArray(image)) {
            problems.push(`${where}, image ${j + 1}: must be an object`);
            return;
          }
          if (typeof image.path !== "string") problems.push(`${where}, image ${j + 1}: "path" is required`);
          for (const key of Object.keys(image)) {
            if (!IMAGE_KEYS.has(key)) problems.push(`${where}, image ${j + 1}: "${key}" is not an image field; the fields are ${[...IMAGE_KEYS].join(", ")}`);
            else if (key !== "path" && typeof image[key] !== "number") problems.push(`${where}, image ${j + 1}: "${key}" must be a number of points`);
          }
        });
      }
      slides.push({
        layout: slide.layout,
        title: slide.title,
        body: Array.isArray(slide.body) ? slide.body.join("\n") : slide.body,
        texts: slide.texts,
        notes: slide.notes,
        images: slide.images ?? []
      });
    });
    if (problems.length > 0) {
      fail(`Error: ${file} is not a valid deck spec:
- ${problems.join("\n- ")}`);
    }
    return slides;
  }
}
if (isMain(import.meta.url)) {
  if (HERE !== fileURLToPath2(import.meta.url)) await import(pathToFileURL2(HERE).href);
  else await main();
}

// one-file-entry.mjs
init_archive();
init_brand();
init_deck();
init_diff();
init_jxa();
init_keynote();
init_markdown();
export {
  archive_exports as lib_archive_js,
  brand_exports as lib_brand_js,
  deck_exports as lib_deck_js,
  diff_exports as lib_diff_js,
  jxa_exports as lib_jxa_js,
  keynote_exports as lib_keynote_js,
  markdown_exports as lib_markdown_js,
  main
};

// Source SHA-256: 98f53b6aaf2ac8a0267a0e4659a2e515dddb1982b5af1dd5d744a33aed75d3f7
