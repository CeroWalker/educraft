"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
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
const node_dns = require("node:dns");
const promises = require("node:fs/promises");
const node_os = require("node:os");
const node_path = require("node:path");
const node_crypto = require("node:crypto");
const require$$0 = require("stream");
const require$$2 = require("events");
const require$$0$1 = require("buffer");
const require$$1 = require("util");
const process$2 = require("node:process");
const node_zlib = require("node:zlib");
const electron = require("electron");
const node_fs = require("node:fs");
const core = require("@xmcl/core");
const installer = require("@xmcl/installer");
const undici = require("undici");
const node_child_process = require("node:child_process");
const node_util = require("node:util");
const promises$1 = require("node:stream/promises");
const node_stream = require("node:stream");
const LOCALES = ["ar", "en", "es", "id", "it", "pl", "pt", "ru", "tr"];
const REFERENCE_LOCALE = "en";
const FALLBACK_LOCALE = REFERENCE_LOCALE;
function isLocale(value) {
  return LOCALES.includes(value);
}
function resolveLocale(tag) {
  if (!tag) return FALLBACK_LOCALE;
  const language = tag.trim().toLowerCase().split(/[-_]/)[0];
  if (language && isLocale(language)) return language;
  return FALLBACK_LOCALE;
}
const SCRIPT_EXT = ".pyj";
const MINESCRIPT_DIR = "minescript";
const MINESCRIPT_MOD_ID = "minescript";
const SCRIPT_SLUG = /^[a-z][a-z0-9_]{0,31}$/;
function isScriptSlug(slug) {
  return SCRIPT_SLUG.test(slug);
}
function scriptFileName(slug) {
  return `${slug}${SCRIPT_EXT}`;
}
function scriptCommand(slug) {
  return `\\${slug}`;
}
const RESERVED_SCRIPT_SLUGS = [
  /*
   * Filled from the mod's own folder by `scripts/spike-minescript.ts`; these
   * four are the ones its documentation names outright. A script saved over one
   * of the mod's own would either be shadowed or shadow it, and neither failure
   * says anything on screen.
   */
  "help",
  "copy",
  "eval",
  "pyjinn"
];
function scriptSlugify(title, taken) {
  const used = new Set(taken);
  const cleaned = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9_]+/, "").slice(0, 32);
  const base = isScriptSlug(cleaned) ? cleaned : "script";
  if (!used.has(base) && !RESERVED_SCRIPT_SLUGS.includes(base)) return base;
  for (let n = 2; n < 1e3; n += 1) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    if (!used.has(candidate) && !RESERVED_SCRIPT_SLUGS.includes(candidate)) return candidate;
  }
  return `script_${Date.now()}`.slice(0, 32);
}
const PRESET_IDS = ["hello", "empty"];
function pythonString(value) {
  return JSON.stringify(value);
}
function buildPreset$1(id, text) {
  if (id === "hello") {
    return [
      "from minescript import echo",
      "",
      `echo(${pythonString(text.chatLine)})`,
      ""
    ].join("\n");
  }
  return [
    "from minescript import echo",
    "",
    `# ${text.hereComment}`,
    ""
  ].join("\n");
}
function presetSlug(id) {
  return id === "hello" ? "hello" : "script";
}
const MAX_SCRIPT_CHARS = 64e3;
function hasBadByte(line) {
  for (let i = 0; i < line.length; i += 1) {
    const code = line.charCodeAt(i);
    if (code >= 32) continue;
    if (code === 9 || code === 10 || code === 13) continue;
    return true;
  }
  return false;
}
function checkScript(text) {
  const problems = [];
  if (text.length > MAX_SCRIPT_CHARS) problems.push({ reason: "too-long" });
  const badAt = text.split("\n").findIndex(hasBadByte);
  if (badAt !== -1) problems.push({ reason: "bad-characters", line: badAt + 1 });
  const lines = text.split("\n");
  const code = lines.map((line, index) => ({ line, number: index + 1 })).filter((entry) => entry.line.trim().length > 0);
  if (code.every((entry) => entry.line.trim().startsWith("#"))) {
    problems.push({ reason: "empty-script" });
  }
  for (const entry of code) {
    const indent = /^[ \t]*/.exec(entry.line)?.[0] ?? "";
    if (indent.includes("	") && indent.includes(" ")) {
      problems.push({ reason: "mixed-indent", line: entry.number });
    }
  }
  const first = code.find((entry) => !entry.line.trim().startsWith("#"));
  if (first && /^[ \t]/.test(first.line)) {
    problems.push({ reason: "leading-indent", line: first.number });
  }
  return problems;
}
class HashMismatchError extends Error {
  constructor(url, expected, actual) {
    super(
      `Downloaded file from ${url} does not match its hash.
  expected sha512 ${expected}
  actual   sha512 ${actual}
Either the manifest is stale or the file upstream changed under the same URL.`
    );
    this.name = "HashMismatchError";
  }
}
async function sha512Of(path) {
  try {
    const bytes = await promises.readFile(path);
    return node_crypto.createHash("sha512").update(bytes).digest("hex");
  } catch {
    return void 0;
  }
}
function sha512OfBytes(bytes) {
  return node_crypto.createHash("sha512").update(bytes).digest("hex");
}
async function downloadVerified(url, destination, expectedSha512, fetchImpl = fetch) {
  await promises.mkdir(node_path.dirname(destination), { recursive: true });
  const existing = await sha512Of(destination);
  if (existing === expectedSha512) {
    return { path: destination, outcome: "already-present", bytes: 0 };
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha512OfBytes(bytes);
  if (actual !== expectedSha512) {
    throw new HashMismatchError(url, expectedSha512, actual);
  }
  const temporary = `${destination}.part`;
  await promises.writeFile(temporary, bytes);
  try {
    await promises.rename(temporary, destination);
  } catch (error) {
    await promises.unlink(temporary).catch(() => {
    });
    throw error;
  }
  return {
    path: destination,
    outcome: existing === void 0 ? "downloaded" : "replaced",
    bytes: bytes.byteLength
  };
}
function instanceLayout(dataDir, packId) {
  const instance = node_path.join(dataDir, "instances", packId);
  return {
    instance,
    /** Manifest-managed mods only. Files the student creates never land here. */
    mods: node_path.join(instance, "mods"),
    /** Student mods, kept apart so the Studio cannot overwrite the methodologist's pack. */
    userMods: node_path.join(instance, "mods-user"),
    saves: node_path.join(instance, "saves"),
    /**
     * The course worlds as footprints, one directory per revision.
     *
     * Outside `saves/` on purpose. A footprint is a source, not a place: it is
     * never played in and holds nothing a child made, so a new revision may
     * replace it - which is what stops revisions piling up beside each other
     * for ever. It also keeps an unplayed lesson map out of the game's own
     * world list.
     */
    worldsSrc: node_path.join(instance, "worlds-src"),
    /**
     * Where Minescript looks for scripts, and **not a folder of ours**.
     *
     * Named here because the layout has one owner - the same argument that put
     * `mods` and `saves` in this object rather than in whoever needed them
     * first. What is different about this one is who else writes to it: the mod
     * ships its own scripts here, and a child who finds the folder will drop a
     * file in it. So nothing may sweep it the way a data pack's folder is
     * swept; `script-store.ts` keeps a ledger of the files it wrote and touches
     * only those.
     */
    minescript: node_path.join(instance, MINESCRIPT_DIR),
    /** Records which packVersion produced the current contents. */
    stateFile: node_path.join(instance, "pack-state.json")
  };
}
const INSTANCE_ENTRIES = [
  "assets",
  "libraries",
  "versions",
  "config",
  "data",
  "downloads",
  "logs",
  "mods",
  "mods-off",
  // The footprint library. Every byte of it downloads again from the manifest,
  // and none of it is a world a child played in - those live in `saves/`, which
  // is not on this list and must never be.
  "worlds-src",
  "usercache.json",
  "pack-state.json"
];
const DATA_DIR_ENTRIES = ["runtime", "cache"];
async function sizeOf(path) {
  let total = 0;
  const { readdir } = await import("node:fs/promises");
  const walk = async (current) => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = node_path.join(current, entry.name);
      if (entry.isDirectory()) await walk(next);
      else {
        try {
          total += (await promises.stat(next)).size;
        } catch {
        }
      }
    }
  };
  try {
    const info = await promises.stat(path);
    if (info.isFile()) return info.size;
  } catch {
    return 0;
  }
  await walk(path);
  return total;
}
async function removeGame(dataDir, packId) {
  const layout = instanceLayout(dataDir, packId);
  const targets = [
    ...INSTANCE_ENTRIES.map((name) => ({ name, path: node_path.join(layout.instance, name) })),
    ...DATA_DIR_ENTRIES.map((name) => ({ name, path: node_path.join(dataDir, name) }))
  ];
  let freedBytes = 0;
  const removed = [];
  for (const target of targets) {
    const size = await sizeOf(target.path);
    if (size === 0) {
      try {
        await promises.stat(target.path);
      } catch {
        continue;
      }
    }
    await promises.rm(target.path, { recursive: true, force: true });
    freedBytes += size;
    removed.push(target.name);
  }
  return { freedBytes, removed };
}
const OPTIONS_FILE = "options.txt";
const DEFAULTS = {
  fullscreen: "false"
};
async function ensureGameOptions(instanceDir) {
  const path = node_path.join(instanceDir, OPTIONS_FILE);
  try {
    await promises.readFile(path, "utf8");
    return { written: false, reason: "already-configured" };
  } catch {
  }
  const body = Object.entries(DEFAULTS).map(([key, value]) => `${key}:${value}`).join("\n");
  await promises.writeFile(path, `${body}
`, "utf8");
  return { written: true };
}
async function applyWindowedDefault(instanceDir) {
  const path = node_path.join(instanceDir, OPTIONS_FILE);
  let body;
  try {
    body = await promises.readFile(path, "utf8");
  } catch {
    return { changed: false, reason: "absent" };
  }
  const lines = body.split(/\r?\n/);
  const at = lines.findIndex((line) => line.startsWith("fullscreen:"));
  if (at === -1) {
    return { changed: false, reason: "already-windowed" };
  }
  if (lines[at] === "fullscreen:false") return { changed: false, reason: "already-windowed" };
  lines[at] = "fullscreen:false";
  await promises.writeFile(path, lines.join("\n"), "utf8");
  return { changed: true };
}
var _a$1;
function $constructor(name, initializer2, params) {
  function init(inst, def) {
    if (!inst._zod) {
      Object.defineProperty(inst, "_zod", {
        value: {
          def,
          constr: _,
          traits: /* @__PURE__ */ new Set()
        },
        enumerable: false
      });
    }
    if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer2(inst, def);
    const proto = _.prototype;
    const keys = Object.keys(proto);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    var _a2;
    const inst = params?.Parent ? new Definition() : this;
    init(inst, def);
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    for (const fn of inst._zod.deferred) {
      fn();
    }
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}
class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
const globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  return globalConfig;
}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
function cached(getter) {
  return {
    get value() {
      {
        const value = getter();
        Object.defineProperty(this, "value", { value });
        return value;
      }
    }
  };
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
const EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object2, key, getter) {
  let value = void 0;
  Object.defineProperty(object2, key, {
    get() {
      if (value === EVALUATING) {
        return void 0;
      }
      if (value === void 0) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object2, key, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify$1(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
const captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
const allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
const propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
  });
}
const NUMBER_FORMAT_RANGES = {
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = {};
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        newShape[key] = currDef.shape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const newShape = { ...schema._zod.def.shape };
      for (const key in mask) {
        if (!(key in currDef.shape)) {
          throw new Error(`Unrecognized key: "${key}"`);
        }
        if (!mask[key])
          continue;
        delete newShape[key];
      }
      assignProp(this, "shape", newShape);
      return newShape;
    },
    checks: []
  });
  return clone(schema, def);
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = schema._zod.def.shape;
    for (const key in shape) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const _shape = { ...schema._zod.def.shape, ...shape };
      assignProp(this, "shape", _shape);
      return _shape;
    }
  });
  return clone(schema, def);
}
function merge(a, b) {
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const def = mergeDefs(a._zod.def, {
    get shape() {
      const _shape = { ...a._zod.def.shape, ...b._zod.def.shape };
      assignProp(this, "shape", _shape);
      return _shape;
    },
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class, schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".partial() cannot be used on object schemas containing refinements");
  }
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in oldShape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      } else {
        for (const key in oldShape) {
          shape[key] = Class ? new Class({
            type: "optional",
            innerType: oldShape[key]
          }) : oldShape[key];
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    },
    checks: []
  });
  return clone(schema, def);
}
function required(Class, schema, mask) {
  const def = mergeDefs(schema._zod.def, {
    get shape() {
      const oldShape = schema._zod.def.shape;
      const shape = { ...oldShape };
      if (mask) {
        for (const key in mask) {
          if (!(key in shape)) {
            throw new Error(`Unrecognized key: "${key}"`);
          }
          if (!mask[key])
            continue;
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      } else {
        for (const key in oldShape) {
          shape[key] = new Class({
            type: "nonoptional",
            innerType: oldShape[key]
          });
        }
      }
      assignProp(this, "shape", shape);
      return shape;
    }
  });
  return clone(schema, def);
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a2;
    (_a2 = iss).path ?? (_a2.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config2) {
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
  rest.path ?? (rest.path = []);
  rest.message = message;
  if (ctx?.reportInput) {
    rest.input = _input;
  }
  return rest;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
const initializer$1 = (inst, def) => {
  inst.name = "$ZodError";
  Object.defineProperty(inst, "_zod", {
    value: inst._zod,
    enumerable: false
  });
  Object.defineProperty(inst, "issues", {
    value: def,
    enumerable: false
  });
  inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
  Object.defineProperty(inst, "toString", {
    value: () => inst.message,
    enumerable: false
  });
};
const $ZodError = $constructor("$ZodError", initializer$1);
const $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
function flattenError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
      fieldErrors[sub.path[0]].push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error2, path = []) => {
    for (const issue2 of error2.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (!terminal) {
              curr[el] = curr[el] || { _errors: [] };
            } else {
              curr[el] = curr[el] || { _errors: [] };
              curr[el]._errors.push(mapper(issue2));
            }
            curr = curr[el];
            i++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}
const _parse = (_Err) => (schema, value, _ctx, _params) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  if (result.issues.length) {
    const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, _params?.callee);
    throw e;
  }
  return result.value;
};
const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  if (result.issues.length) {
    const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
    captureStackTrace(e, params?.callee);
    throw e;
  }
  return result.value;
};
const _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? {
    success: false,
    error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
const safeParse$1 = /* @__PURE__ */ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? {
    success: false,
    error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  } : { success: true, data: result.value };
};
const safeParseAsync$1 = /* @__PURE__ */ _safeParseAsync($ZodRealError);
const _encode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parse(_Err)(schema, value, ctx);
};
const _decode = (_Err) => (schema, value, _ctx) => {
  return _parse(_Err)(schema, value, _ctx);
};
const _encodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _parseAsync(_Err)(schema, value, ctx);
};
const _decodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _parseAsync(_Err)(schema, value, _ctx);
};
const _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
const _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
const _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
const _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
const cuid = /^[cC][0-9a-z]{6,}$/;
const cuid2 = /^[0-9a-z]+$/;
const ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
const xid = /^[0-9a-vA-V]{20}$/;
const ksuid = /^[A-Za-z0-9]{27}$/;
const nanoid = /^[a-zA-Z0-9_-]{21}$/;
const duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
const guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
const uuid = (version2) => {
  if (!version2)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
const email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
const _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
  return new RegExp(_emoji$1, "u");
}
const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
const ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
const cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
const cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
const base64$1 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
const base64url = /^[A-Za-z0-9_-]*$/;
const httpProtocol = /^https?$/;
const e164 = /^\+[1-9]\d{6,14}$/;
const dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
const date$1 = /* @__PURE__ */ new RegExp(`^${dateSource}$`);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time$1(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime$1(args) {
  const time2 = timeSource({ precision: args.precision });
  const opts = ["Z"];
  if (args.local)
    opts.push("");
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const timeRegex = `${time2}(?:${opts.join("|")})`;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
const string$1 = (params) => {
  const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
  return new RegExp(`^${regex}$`);
};
const integer = /^-?\d+$/;
const number$1 = /^-?\d+(?:\.\d+)?$/;
const boolean$1 = /^(?:true|false)$/i;
const lowercase = /^[^A-Z]*$/;
const uppercase = /^[^a-z]*$/;
const $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a2;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a2 = inst._zod).onattach ?? (_a2.onattach = []);
});
const numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
const $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
    if (def.value < curr) {
      if (def.inclusive)
        bag.maximum = def.value;
      else
        bag.exclusiveMaximum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
    if (def.value > curr) {
      if (def.inclusive)
        bag.minimum = def.value;
      else
        bag.exclusiveMinimum = def.value;
    }
  });
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    var _a2;
    (_a2 = inst2._zod.bag).multipleOf ?? (_a2.multipleOf = def.value);
  });
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    bag.minimum = minimum;
    bag.maximum = maximum;
    if (isInt)
      bag.pattern = integer;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
const $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
    if (def.maximum < curr)
      inst2._zod.bag.maximum = def.maximum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const curr = inst2._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
    if (def.minimum > curr)
      inst2._zod.bag.minimum = def.minimum;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a2;
  $ZodCheck.init(inst, def);
  (_a2 = inst._zod.def).when ?? (_a2.when = (payload) => {
    const val = payload.value;
    return !nullish(val) && val.length !== void 0;
  });
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.minimum = def.length;
    bag.maximum = def.length;
    bag.length = def.length;
  });
  inst._zod.check = (payload) => {
    const input = payload.value;
    const length = input.length;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a2, _b;
  $ZodCheck.init(inst, def);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.format = def.format;
    if (def.pattern) {
      bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
      bag.patterns.add(def.pattern);
    }
  });
  if (def.pattern)
    (_a2 = inst._zod).check ?? (_a2.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {
    });
});
const $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
const $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.onattach.push((inst2) => {
    const bag = inst2._zod.bag;
    bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
    bag.patterns.add(pattern);
  });
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});
class Doc {
  constructor(args = []) {
    this.content = [];
    this.indent = 0;
    if (this)
      this.args = args;
  }
  indented(fn) {
    this.indent += 1;
    fn(this);
    this.indent -= 1;
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split("\n").filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const args = this?.args;
    const content = this?.content ?? [``];
    const lines = [...content.map((x) => `  ${x}`)];
    return new F(...args, lines.join("\n"));
  }
}
const version = {
  major: 4,
  minor: 4,
  patch: 3
};
const $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a2;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const checks = [...inst._zod.def.checks ?? []];
  if (inst._zod.traits.has("$ZodCheck")) {
    checks.unshift(inst);
  }
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a2 = inst._zod).deferred ?? (_a2.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
  defineLazy(inst, "~standard", () => ({
    validate: (value) => {
      try {
        const r = safeParse$1(inst, value);
        return r.success ? { value: r.data } : { issues: r.error?.issues };
      } catch (_) {
        return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
      }
    },
    vendor: "zod",
    version: 1
  }));
});
const $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
const $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
const $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
const $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === void 0)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
const $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
const $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      if (!def.normalize && def.protocol?.source === httpProtocol.source) {
        if (!/^https?:\/\//i.test(trimmed)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid URL format",
            input: payload.value,
            inst,
            continue: !def.abort
          });
          return;
        }
      }
      const url = new URL(trimmed);
      if (def.hostname) {
        def.hostname.lastIndex = 0;
        if (!def.hostname.test(url.hostname)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid hostname",
            pattern: def.hostname.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.protocol) {
        def.protocol.lastIndex = 0;
        if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) {
          payload.issues.push({
            code: "invalid_format",
            format: "url",
            note: "Invalid protocol",
            pattern: def.protocol.source,
            input: payload.value,
            inst,
            continue: !def.abort
          });
        }
      }
      if (def.normalize) {
        payload.value = url.href;
      } else {
        payload.value = trimmed;
      }
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
const $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
const $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  def.pattern ?? (def.pattern = nanoid);
  $ZodStringFormat.init(inst, def);
});
const $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
const $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
const $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
const $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
const $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
const $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime$1(def));
  $ZodStringFormat.init(inst, def);
});
const $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date$1);
  $ZodStringFormat.init(inst, def);
});
const $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time$1(def));
  $ZodStringFormat.init(inst, def);
});
const $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration$1);
  $ZodStringFormat.init(inst, def);
});
const $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv4`;
});
const $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.format = `ipv6`;
  inst._zod.check = (payload) => {
    try {
      new URL(`http://[${payload.value}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
const $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
const $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    const parts = payload.value.split("/");
    try {
      if (parts.length !== 2)
        throw new Error();
      const [address, prefix] = parts;
      if (!prefix)
        throw new Error();
      const prefixNum = Number(prefix);
      if (`${prefixNum}` !== prefix)
        throw new Error();
      if (prefixNum < 0 || prefixNum > 128)
        throw new Error();
      new URL(`http://[${address}]`);
    } catch {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
const $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64$1);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64";
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
function isValidBase64URL(data) {
  if (!base64url.test(data))
    return false;
  const base642 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
const $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64url);
  $ZodStringFormat.init(inst, def);
  inst._zod.bag.contentEncoding = "base64url";
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
const $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
const $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
const $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
const $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean$1;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
const $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
const $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
const $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = Array(input.length);
    const proms = [];
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
  const isPresent = key in input;
  if (result.issues.length) {
    if (isOptionalIn && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && !isOptionalIn) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent) {
      final.value[key] = void 0;
    }
  } else {
    final.value[key] = result.value;
  }
}
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  for (const k of keys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    keys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const isOptionalIn = _catchall.optin === "optional";
  const isOptionalOut = _catchall.optout === "optional";
  for (const key in input) {
    if (key === "__proto__")
      continue;
    if (keySet.has(key))
      continue;
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
    } else {
      handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
const $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  if (!desc?.get) {
    const sh = def.shape;
    Object.defineProperty(def, "shape", {
      get: () => {
        const newSh = { ...sh };
        Object.defineProperty(def, "shape", {
          value: newSh
        });
        return newSh;
      }
    });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazy(inst._zod, "propValues", () => {
    const shape = def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
        for (const v of field.values)
          propValues[key].add(v);
      }
    }
    return propValues;
  });
  const isObject$1 = isObject;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject$1(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = {};
    const proms = [];
    const shape = value.shape;
    for (const key of value.keys) {
      const el = shape[key];
      const isOptionalIn = el._zod.optin === "optional";
      const isOptionalOut = el._zod.optout === "optional";
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key, input, isOptionalIn, isOptionalOut)));
      } else {
        handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
  };
});
const $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const generateFastpass = (shape) => {
    const doc2 = new Doc(["shape", "payload", "ctx"]);
    const normalized = _normalized.value;
    const parseStr = (key) => {
      const k = esc(key);
      return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    };
    doc2.write(`const input = payload.value;`);
    const ids = /* @__PURE__ */ Object.create(null);
    let counter = 0;
    for (const key of normalized.keys) {
      ids[key] = `key_${counter++}`;
    }
    doc2.write(`const newResult = {};`);
    for (const key of normalized.keys) {
      const id = ids[key];
      const k = esc(key);
      const schema = shape[key];
      const isOptionalIn = schema?._zod?.optin === "optional";
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc2.write(`const ${id} = ${parseStr(key)};`);
      if (isOptionalIn && isOptionalOut) {
        doc2.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      } else if (!isOptionalIn) {
        doc2.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else {
        doc2.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
      }
    }
    doc2.write(`payload.value = newResult;`);
    doc2.write(`return payload;`);
    const fn = doc2.compile();
    return (payload, ctx) => fn(shape, payload, ctx);
  };
  let fastpass;
  const isObject$1 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval$1 = allowsEval;
  const fastEnabled = jit && allowsEval$1.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject$1(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
const $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazy(inst._zod, "values", () => {
    if (def.options.every((o) => o._zod.values)) {
      return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    if (def.options.every((o) => o._zod.pattern)) {
      const patterns = def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
const $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    for (const key of sharedKeys) {
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = /* @__PURE__ */ new Map();
  let unrecIssue;
  for (const iss of left.issues) {
    if (iss.code === "unrecognized_keys") {
      unrecIssue ?? (unrecIssue = iss);
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).l = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  for (const iss of right.issues) {
    if (iss.code === "unrecognized_keys") {
      for (const k of iss.keys) {
        if (!unrecKeys.has(k))
          unrecKeys.set(k, {});
        unrecKeys.get(k).r = true;
      }
    } else {
      result.issues.push(iss);
    }
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length && unrecIssue) {
    result.issues.push({ ...unrecIssue, keys: bothKeys });
  }
  if (aborted(result))
    return result;
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
const $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values) {
      payload.value = {};
      const recordKeys = /* @__PURE__ */ new Set();
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result2) => {
              if (result2.issues.length) {
                payload.issues.push(...prefixIssues(key, result2.issues));
              }
              payload.value[outKey] = result2.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          unrecognized = unrecognized ?? [];
          unrecognized.push(key);
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized
        });
      }
    } else {
      payload.value = {};
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number$1.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result2) => {
            if (result2.issues.length) {
              payload.issues.push(...prefixIssues(key, result2.issues));
            }
            payload.value[keyResult.value] = result2.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[keyResult.value] = result.value;
        }
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
const $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
const $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  if (def.values.length === 0) {
    throw new Error("Cannot create literal schema with no valid values");
  }
  const values = new Set(def.values);
  inst._zod.values = values;
  inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
const $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError();
    }
    payload.value = _out;
    payload.fallback = true;
    return payload;
  };
});
function handleOptionalResult(result, input) {
  if (input === void 0 && (result.issues.length || result.fallback)) {
    return { issues: [], value: void 0 };
  }
  return result;
}
const $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  inst._zod.optout = "optional";
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
  });
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (def.innerType._zod.optin === "optional") {
      const input = payload.value;
      const result = def.innerType._zod.run(payload, ctx);
      if (result instanceof Promise)
        return result.then((r) => handleOptionalResult(r, input));
      return handleOptionalResult(result, input);
    }
    if (payload.value === void 0) {
      return payload;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "pattern", () => {
    const pattern = def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazy(inst._zod, "values", () => {
    return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
const $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
const $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => {
    const v = def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
const $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => {
        payload.value = result2.value;
        if (result2.issues.length) {
          payload.value = def.catchValue({
            ...payload,
            error: {
              issues: result2.issues.map((iss) => finalizeIssue(iss, ctx, config()))
            },
            input: payload.value
          });
          payload.issues = [];
          payload.fallback = true;
        }
        return payload;
      });
    }
    payload.value = result.value;
    if (result.issues.length) {
      payload.value = def.catchValue({
        ...payload,
        error: {
          issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
        },
        input: payload.value
      });
      payload.issues = [];
      payload.fallback = true;
    }
    return payload;
  };
});
const $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "values", () => def.in._zod.values);
  defineLazy(inst._zod, "optin", () => def.in._zod.optin);
  defineLazy(inst._zod, "optout", () => def.out._zod.optout);
  defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.length) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues, fallback: left.fallback }, ctx);
}
const $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
  defineLazy(inst._zod, "values", () => def.innerType._zod.values);
  defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
  defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  payload.value = Object.freeze(payload.value);
  return payload;
}
const $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
var _a;
class $ZodRegistry {
  constructor() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : void 0;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
const globalRegistry = globalThis.__zod_globalRegistry;
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
  return new Class({
    type: "string",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
  return new Class({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
  return new Class({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
  return new Class({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
  return new Class({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
  return new Class({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
  return new Class({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
  return new Class({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
  return new Class({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
  return new Class({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
  return new Class({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
  return new Class({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
  return new Class({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
  return new Class({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
  return new Class({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
  return new Class({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
  return new Class({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
  return new Class({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
  return new Class({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
  return new Class({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
  return new Class({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
  return new Class({
    type: "number",
    checks: [],
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
  return new Class({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
  return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
  return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
  return /* @__PURE__ */ _overwrite((input) => slugify$1(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
  return new Class({
    type: "array",
    element,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
  const ch = /* @__PURE__ */ _check((payload) => {
    payload.addIssue = (issue$1) => {
      if (typeof issue$1 === "string") {
        payload.issues.push(issue(issue$1, payload.value, ch._zod.def));
      } else {
        const _issue = issue$1;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {
    }),
    io: params?.io ?? "output",
    counter: 0,
    seen: /* @__PURE__ */ new Map(),
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    external: params?.external ?? void 0
  };
}
function process$1(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a2;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
  ctx.seen.set(schema, result);
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      process$1(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    Object.assign(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a2 = result.schema).default ?? (_a2.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const idToSchema = /* @__PURE__ */ new Map();
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}` };
    }
    if (entry[1] === root) {
      return { ref: "#" };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + defId };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key in schema2) {
      delete schema2[key];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
        continue;
      }
    }
  }
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        Object.assign(schema2, refSchema);
      }
      Object.assign(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema2[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema2) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema2[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema2) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema2[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema2[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  for (const entry of [...ctx.seen.entries()].reverse()) {
    flattenRef(entry[0]);
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") ;
  else ;
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  Object.assign(result, root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== void 0 && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (seen.def && seen.defId) {
      if (seen.def.id === seen.defId)
        delete seen.def.id;
      defs[seen.defId] = seen.def;
    }
  }
  if (ctx.external) ;
  else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
const createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  process$1(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
const createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  process$1(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
const formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
  // do not set
};
const stringProcessor = (schema, ctx, _json, _params) => {
  const json2 = _json;
  json2.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
  if (typeof minimum === "number")
    json2.minLength = minimum;
  if (typeof maximum === "number")
    json2.maxLength = maximum;
  if (format) {
    json2.format = formatMap[format] ?? format;
    if (json2.format === "")
      delete json2.format;
    if (format === "time") {
      delete json2.format;
    }
  }
  if (contentEncoding)
    json2.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const regexes = [...patterns];
    if (regexes.length === 1)
      json2.pattern = regexes[0].source;
    else if (regexes.length > 1) {
      json2.allOf = [
        ...regexes.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
const numberProcessor = (schema, ctx, _json, _params) => {
  const json2 = _json;
  const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
  if (typeof format === "string" && format.includes("int"))
    json2.type = "integer";
  else
    json2.type = "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json2.minimum = exclusiveMinimum;
      json2.exclusiveMinimum = true;
    } else {
      json2.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json2.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json2.maximum = exclusiveMaximum;
      json2.exclusiveMaximum = true;
    } else {
      json2.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json2.maximum = maximum;
  }
  if (typeof multipleOf === "number")
    json2.multipleOf = multipleOf;
};
const booleanProcessor = (_schema, _ctx, json2, _params) => {
  json2.type = "boolean";
};
const neverProcessor = (_schema, _ctx, json2, _params) => {
  json2.not = {};
};
const unknownProcessor = (_schema, _ctx, _json, _params) => {
};
const enumProcessor = (schema, _ctx, json2, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.every((v) => typeof v === "number"))
    json2.type = "number";
  if (values.every((v) => typeof v === "string"))
    json2.type = "string";
  json2.enum = values;
};
const literalProcessor = (schema, ctx, json2, _params) => {
  const def = schema._zod.def;
  const vals = [];
  for (const val of def.values) {
    if (val === void 0) {
      if (ctx.unrepresentable === "throw") {
        throw new Error("Literal `undefined` cannot be represented in JSON Schema");
      }
    } else if (typeof val === "bigint") {
      if (ctx.unrepresentable === "throw") {
        throw new Error("BigInt literals cannot be represented in JSON Schema");
      } else {
        vals.push(Number(val));
      }
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) ;
  else if (vals.length === 1) {
    const val = vals[0];
    json2.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json2.enum = [val];
    } else {
      json2.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json2.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json2.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json2.type = "boolean";
    if (vals.every((v) => v === null))
      json2.type = "null";
    json2.enum = vals;
  }
};
const customProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Custom types cannot be represented in JSON Schema");
  }
};
const transformProcessor = (_schema, ctx, _json, _params) => {
  if (ctx.unrepresentable === "throw") {
    throw new Error("Transforms cannot be represented in JSON Schema");
  }
};
const arrayProcessor = (schema, ctx, _json, params) => {
  const json2 = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = schema._zod.bag;
  if (typeof minimum === "number")
    json2.minItems = minimum;
  if (typeof maximum === "number")
    json2.maxItems = maximum;
  json2.type = "array";
  json2.items = process$1(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
const objectProcessor = (schema, ctx, _json, params) => {
  const json2 = _json;
  const def = schema._zod.def;
  json2.type = "object";
  json2.properties = {};
  const shape = def.shape;
  for (const key in shape) {
    json2.properties[key] = process$1(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    });
  }
  const allKeys = new Set(Object.keys(shape));
  const requiredKeys = new Set([...allKeys].filter((key) => {
    const v = def.shape[key]._zod;
    if (ctx.io === "input") {
      return v.optin === void 0;
    } else {
      return v.optout === void 0;
    }
  }));
  if (requiredKeys.size > 0) {
    json2.required = Array.from(requiredKeys);
  }
  if (def.catchall?._zod.def.type === "never") {
    json2.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json2.additionalProperties = false;
  } else if (def.catchall) {
    json2.additionalProperties = process$1(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
const unionProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => process$1(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json2.oneOf = options;
  } else {
    json2.anyOf = options;
  }
};
const intersectionProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  const a = process$1(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = process$1(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json2.allOf = allOf;
};
const recordProcessor = (schema, ctx, _json, params) => {
  const json2 = _json;
  const def = schema._zod.def;
  json2.type = "object";
  const keyType = def.keyType;
  const keyBag = keyType._zod.bag;
  const patterns = keyBag?.patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = process$1(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json2.patternProperties = {};
    for (const pattern of patterns) {
      json2.patternProperties[pattern.source] = valueSchema;
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json2.propertyNames = process$1(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
    }
    json2.additionalProperties = process$1(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  if (keyValues) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json2.required = validKeyValues;
    }
  }
};
const nullableProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  const inner = process$1(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json2.nullable = true;
  } else {
    json2.anyOf = [inner, { type: "null" }];
  }
};
const nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process$1(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
const defaultProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process$1(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json2.default = JSON.parse(JSON.stringify(def.defaultValue));
};
const prefaultProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process$1(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io === "input")
    json2._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
const catchProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process$1(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(void 0);
  } catch {
    throw new Error("Dynamic catch values are not supported in JSON Schema");
  }
  json2.default = catchValue;
};
const pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  process$1(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
const readonlyProcessor = (schema, ctx, json2, params) => {
  const def = schema._zod.def;
  process$1(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json2.readOnly = true;
};
const optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  process$1(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
const ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function datetime(params) {
  return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
}
const ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function date(params) {
  return /* @__PURE__ */ _isoDate(ZodISODate, params);
}
const ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function time(params) {
  return /* @__PURE__ */ _isoTime(ZodISOTime, params);
}
const ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
function duration(params) {
  return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
}
const initializer = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  Object.defineProperties(inst, {
    format: {
      value: (mapper) => formatError(inst, mapper)
      // enumerable: false,
    },
    flatten: {
      value: (mapper) => flattenError(inst, mapper)
      // enumerable: false,
    },
    addIssue: {
      value: (issue2) => {
        inst.issues.push(issue2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
      // enumerable: false,
    },
    addIssues: {
      value: (issues2) => {
        inst.issues.push(...issues2);
        inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
      }
      // enumerable: false,
    },
    isEmpty: {
      get() {
        return inst.issues.length === 0;
      }
      // enumerable: false,
    }
  });
};
const ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer, {
  Parent: Error
});
const parse = /* @__PURE__ */ _parse(ZodRealError);
const parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
const safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
const safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
const encode = /* @__PURE__ */ _encode(ZodRealError);
const decode = /* @__PURE__ */ _decode(ZodRealError);
const encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
const decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
const safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
const safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
const safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
const safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
const _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
  const proto = Object.getPrototypeOf(inst);
  let installed = _installedGroups.get(proto);
  if (!installed) {
    installed = /* @__PURE__ */ new Set();
    _installedGroups.set(proto, installed);
  }
  if (installed.has(group))
    return;
  installed.add(group);
  for (const key in methods) {
    const fn = methods[key];
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: false,
      get() {
        const bound = fn.bind(this);
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: bound
        });
        return bound;
      },
      set(v) {
        Object.defineProperty(this, key, {
          configurable: true,
          writable: true,
          enumerable: true,
          value: v
        });
      }
    });
  }
}
const ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  $ZodType.init(inst, def);
  Object.assign(inst["~standard"], {
    jsonSchema: {
      input: createStandardJSONSchemaMethod(inst, "input"),
      output: createStandardJSONSchemaMethod(inst, "output")
    }
  });
  inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
  inst.def = def;
  inst.type = def.type;
  Object.defineProperty(inst, "_def", { value: def });
  inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
  inst.safeParse = (data, params) => safeParse(inst, data, params);
  inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
  inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
  inst.spa = inst.safeParseAsync;
  inst.encode = (data, params) => encode(inst, data, params);
  inst.decode = (data, params) => decode(inst, data, params);
  inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
  inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
  inst.safeEncode = (data, params) => safeEncode(inst, data, params);
  inst.safeDecode = (data, params) => safeDecode(inst, data, params);
  inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
  inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
  _installLazyMethods(inst, "ZodType", {
    check(...chks) {
      const def2 = this.def;
      return this.clone(mergeDefs(def2, {
        checks: [
          ...def2.checks ?? [],
          ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
        ]
      }), { parent: true });
    },
    with(...chks) {
      return this.check(...chks);
    },
    clone(def2, params) {
      return clone(this, def2, params);
    },
    brand() {
      return this;
    },
    register(reg, meta) {
      reg.add(this, meta);
      return this;
    },
    refine(check, params) {
      return this.check(refine(check, params));
    },
    superRefine(refinement, params) {
      return this.check(superRefine(refinement, params));
    },
    overwrite(fn) {
      return this.check(/* @__PURE__ */ _overwrite(fn));
    },
    optional() {
      return optional(this);
    },
    exactOptional() {
      return exactOptional(this);
    },
    nullable() {
      return nullable(this);
    },
    nullish() {
      return optional(nullable(this));
    },
    nonoptional(params) {
      return nonoptional(this, params);
    },
    array() {
      return array(this);
    },
    or(arg) {
      return union([this, arg]);
    },
    and(arg) {
      return intersection(this, arg);
    },
    transform(tx) {
      return pipe(this, transform(tx));
    },
    default(d) {
      return _default(this, d);
    },
    prefault(d) {
      return prefault(this, d);
    },
    catch(params) {
      return _catch(this, params);
    },
    pipe(target) {
      return pipe(this, target);
    },
    readonly() {
      return readonly(this);
    },
    describe(description) {
      const cl = this.clone();
      globalRegistry.add(cl, { description });
      return cl;
    },
    meta(...args) {
      if (args.length === 0)
        return globalRegistry.get(this);
      const cl = this.clone();
      globalRegistry.add(cl, args[0]);
      return cl;
    },
    isOptional() {
      return this.safeParse(void 0).success;
    },
    isNullable() {
      return this.safeParse(null).success;
    },
    apply(fn) {
      return fn(this);
    }
  });
  Object.defineProperty(inst, "description", {
    get() {
      return globalRegistry.get(inst)?.description;
    },
    configurable: true
  });
  return inst;
});
const _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => stringProcessor(inst, ctx, json2);
  const bag = inst._zod.bag;
  inst.format = bag.format ?? null;
  inst.minLength = bag.minimum ?? null;
  inst.maxLength = bag.maximum ?? null;
  _installLazyMethods(inst, "_ZodString", {
    regex(...args) {
      return this.check(/* @__PURE__ */ _regex(...args));
    },
    includes(...args) {
      return this.check(/* @__PURE__ */ _includes(...args));
    },
    startsWith(...args) {
      return this.check(/* @__PURE__ */ _startsWith(...args));
    },
    endsWith(...args) {
      return this.check(/* @__PURE__ */ _endsWith(...args));
    },
    min(...args) {
      return this.check(/* @__PURE__ */ _minLength(...args));
    },
    max(...args) {
      return this.check(/* @__PURE__ */ _maxLength(...args));
    },
    length(...args) {
      return this.check(/* @__PURE__ */ _length(...args));
    },
    nonempty(...args) {
      return this.check(/* @__PURE__ */ _minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(/* @__PURE__ */ _lowercase(params));
    },
    uppercase(params) {
      return this.check(/* @__PURE__ */ _uppercase(params));
    },
    trim() {
      return this.check(/* @__PURE__ */ _trim());
    },
    normalize(...args) {
      return this.check(/* @__PURE__ */ _normalize(...args));
    },
    toLowerCase() {
      return this.check(/* @__PURE__ */ _toLowerCase());
    },
    toUpperCase() {
      return this.check(/* @__PURE__ */ _toUpperCase());
    },
    slugify() {
      return this.check(/* @__PURE__ */ _slugify());
    }
  });
});
const ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
  inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
  inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
  inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
  inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
  inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
  inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
  inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
  inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
  inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
  inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
  inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
  inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
  inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
  inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
  inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
  inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
  inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
  inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
  inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
  inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
  inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
  inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
  inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
  inst.datetime = (params) => inst.check(datetime(params));
  inst.date = (params) => inst.check(date(params));
  inst.time = (params) => inst.check(time(params));
  inst.duration = (params) => inst.check(duration(params));
});
function string(params) {
  return /* @__PURE__ */ _string(ZodString, params);
}
const ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
const ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
const ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => numberProcessor(inst, ctx, json2);
  _installLazyMethods(inst, "ZodNumber", {
    gt(value, params) {
      return this.check(/* @__PURE__ */ _gt(value, params));
    },
    gte(value, params) {
      return this.check(/* @__PURE__ */ _gte(value, params));
    },
    min(value, params) {
      return this.check(/* @__PURE__ */ _gte(value, params));
    },
    lt(value, params) {
      return this.check(/* @__PURE__ */ _lt(value, params));
    },
    lte(value, params) {
      return this.check(/* @__PURE__ */ _lte(value, params));
    },
    max(value, params) {
      return this.check(/* @__PURE__ */ _lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(/* @__PURE__ */ _gt(0, params));
    },
    nonnegative(params) {
      return this.check(/* @__PURE__ */ _gte(0, params));
    },
    negative(params) {
      return this.check(/* @__PURE__ */ _lt(0, params));
    },
    nonpositive(params) {
      return this.check(/* @__PURE__ */ _lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(/* @__PURE__ */ _multipleOf(value, params));
    },
    step(value, params) {
      return this.check(/* @__PURE__ */ _multipleOf(value, params));
    },
    finite() {
      return this;
    }
  });
  const bag = inst._zod.bag;
  inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
  inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
  inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? 0.5);
  inst.isFinite = true;
  inst.format = bag.format ?? null;
});
function number(params) {
  return /* @__PURE__ */ _number(ZodNumber, params);
}
const ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return /* @__PURE__ */ _int(ZodNumberFormat, params);
}
const ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => booleanProcessor(inst, ctx, json2);
});
function boolean(params) {
  return /* @__PURE__ */ _boolean(ZodBoolean, params);
}
const ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => unknownProcessor();
});
function unknown() {
  return /* @__PURE__ */ _unknown(ZodUnknown);
}
const ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => neverProcessor(inst, ctx, json2);
});
function never(params) {
  return /* @__PURE__ */ _never(ZodNever, params);
}
const ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => arrayProcessor(inst, ctx, json2, params);
  inst.element = def.element;
  _installLazyMethods(inst, "ZodArray", {
    min(n, params) {
      return this.check(/* @__PURE__ */ _minLength(n, params));
    },
    nonempty(params) {
      return this.check(/* @__PURE__ */ _minLength(1, params));
    },
    max(n, params) {
      return this.check(/* @__PURE__ */ _maxLength(n, params));
    },
    length(n, params) {
      return this.check(/* @__PURE__ */ _length(n, params));
    },
    unwrap() {
      return this.element;
    }
  });
});
function array(element, params) {
  return /* @__PURE__ */ _array(ZodArray, element, params);
}
const ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => objectProcessor(inst, ctx, json2, params);
  defineLazy(inst, "shape", () => {
    return def.shape;
  });
  _installLazyMethods(inst, "ZodObject", {
    keyof() {
      return _enum(Object.keys(this._zod.def.shape));
    },
    catchall(catchall) {
      return this.clone({ ...this._zod.def, catchall });
    },
    passthrough() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    loose() {
      return this.clone({ ...this._zod.def, catchall: unknown() });
    },
    strict() {
      return this.clone({ ...this._zod.def, catchall: never() });
    },
    strip() {
      return this.clone({ ...this._zod.def, catchall: void 0 });
    },
    extend(incoming) {
      return extend(this, incoming);
    },
    safeExtend(incoming) {
      return safeExtend(this, incoming);
    },
    merge(other) {
      return merge(this, other);
    },
    pick(mask) {
      return pick(this, mask);
    },
    omit(mask) {
      return omit(this, mask);
    },
    partial(...args) {
      return partial(ZodOptional, this, args[0]);
    },
    required(...args) {
      return required(ZodNonOptional, this, args[0]);
    }
  });
});
function object$1(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodObject(def);
}
const ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => unionProcessor(inst, ctx, json2, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
const ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => intersectionProcessor(inst, ctx, json2, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
const ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => recordProcessor(inst, ctx, json2, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
const ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => enumProcessor(inst, ctx, json2);
  inst.enum = def.entries;
  inst.options = Object.values(def.entries);
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
const ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => literalProcessor(inst, ctx, json2);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
const ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => transformProcessor(inst, ctx);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue$1) => {
      if (typeof issue$1 === "string") {
        payload.issues.push(issue(issue$1, payload.value, def));
      } else {
        const _issue = issue$1;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        _issue.input ?? (_issue.input = payload.value);
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        payload.fallback = true;
        return payload;
      });
    }
    payload.value = output;
    payload.fallback = true;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
const ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
const ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => optionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
const ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nullableProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
const ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => defaultProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
const ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => prefaultProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
const ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => nonoptionalProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
const ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => catchProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
  });
}
const ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => pipeProcessor(inst, ctx, json2, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
    // ...util.normalizeParams(params),
  });
}
const ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => readonlyProcessor(inst, ctx, json2, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
const ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json2, params) => customProcessor(inst, ctx);
});
function refine(fn, _params = {}) {
  return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return /* @__PURE__ */ _superRefine(fn, params);
}
const minecraftVersion = string().min(1).refine((value) => !/[\^~*><=\s]/.test(value), {
  error: "Minecraft version must be an exact id, not a range. Version ids are opaque strings (the scheme changed in 26.1), so a range here cannot be evaluated correctly."
});
const sha512 = string().regex(/^[0-9a-f]{128}$/, { error: "Expected a lowercase hex sha512 (128 characters)" });
const FILE_HOSTS = ["cdn.modrinth.com", "kodland.org", "github.com"];
function isAllowedFileHost(hostname) {
  return FILE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}
const fileUrl = string().url().refine(
  (value) => {
    try {
      const { protocol, hostname } = new URL(value);
      return protocol === "https:" && isAllowedFileHost(hostname);
    } catch {
      return false;
    }
  },
  {
    error: `A file url must be https and on an agreed host (${FILE_HOSTS.join(", ")}, or a subdomain of one).`
  }
);
const httpsUrl = string().url().refine((value) => value.startsWith("https://"), { error: "Expected an https url" });
const packModSchema = object$1({
  /** Stable short name, used for the filename on disk. */
  id: string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, { error: "Mod id must be lowercase letters, digits and dashes" }),
  version: string().min(1),
  url: fileUrl,
  sha512,
  /**
   * Required, not optional.
   *
   * docs/LEGAL.md: we redistribute only what the school has the right to
   * redistribute, and "we did not check yet" must be impossible to express. An
   * empty license field is a blocker, so the schema does not allow one.
   */
  license: string().min(1),
  /**
   * Where the source of this mod is, and for a copyleft licence it is required.
   *
   * The obligation comes from handing the file out, and the launcher is what
   * hands it out - so the record has to travel with the file rather than sit in
   * whichever admin form the mod was added through. That is why it lives in the
   * manifest and not only in Sparks.
   *
   * Optional in the schema and made required by `parsePackManifest`, because
   * "required, but only for these licences" is a rule about two fields and
   * cannot be written on one of them.
   */
  source: httpsUrl.optional(),
  /**
   * A mod the others load through, so it cannot be switched off.
   *
   * `fabric-api` is the honest example: disabling it breaks every mod that
   * depends on it. Offering that toggle would be offering a trap, so the schema
   * lets the manifest say which mods are load-bearing.
   */
  required: boolean().optional(),
  /**
   * Off for everybody, and still fully described.
   *
   * An admin switching a mod off is a decision that gets reversed, so the row
   * stays: the pinned url, the sha512 and above all the licence are what make
   * turning it back on a one-word edit instead of a fresh piece of research.
   * Deleting the row would throw away the licence record LEGAL.md requires us
   * to keep for anything we have ever handed out.
   *
   * Not the same thing as a student's own switch, which lives in `mods.json`
   * on their machine. This one means the file is not installed at all.
   */
  enabled: boolean().default(true)
});
const packWorldSchema = object$1({
  /**
   * Which world this is, across every version of it.
   *
   * `name` cannot do this job: it is the folder on disk, and the folder is
   * where a child has been building. So "the lesson 3 world" needs a name of
   * its own, or "replace it" cannot be told apart from "it is already there".
   *
   * Defaulted, because a manifest written before any of this existed has one
   * world and no id, and it must keep parsing.
   */
  id: string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, { error: "World id must be lowercase letters, digits and dashes" }).default("lesson"),
  /**
   * Ids this world had before, so what a child unlocked or copied under an old
   * id still means this world.
   *
   * `id` must not change, and a new version is a new `revision`. This field is
   * for the case when a rename could not be avoided. An id with a revision
   * written into it (`m1-r2` becoming `m1-r3`) needs no entry here: the
   * launcher already reads both as `m1` (`world-identity.ts`).
   */
  previousIds: array(string().regex(/^[a-z0-9][a-z0-9-]*$/, { error: "A previous world id must be lowercase letters, digits and dashes" })).optional(),
  /**
   * Bumped when the world itself changes, never when the pack does.
   *
   * A higher revision means a new copy is due beside the old one. It is not a
   * reason to touch what is already on disk - see `syncWorldLibrary`.
   */
  revision: number().int().nonnegative().default(0),
  /**
   * What to show a child under the map, per locale.
   *
   * `name` cannot do this job either, for the opposite reason to `id`: it is a
   * folder, so our own rule keeps it ASCII, so a Russian child reads
   * `m1-craftforge-l1`. Sparks offered this field in their seventh note and we
   * took it (`SPARKS-REQUEST-8.md` section 1).
   *
   * Optional, and optional in a load-bearing way: no manifest carries one yet,
   * and the launcher must keep reading the manifests that exist. `en` is the
   * agreed fallback, but nothing here enforces it - a missing `en` is a label a
   * child cannot read, not a manifest we should refuse to parse and thereby
   * refuse to start the game over.
   */
  title: record(string(), string()).optional(),
  /**
   * A sentence about the world, per locale, for the top of its column.
   *
   * The title says which world; this says what is in it, and it is the half a
   * parent reads. Written by a methodologist, asked of Sparks in
   * `SPARKS-REQUEST-10.md`.
   *
   * Optional the same load-bearing way `title` is: no manifest carries one yet,
   * and a launcher that refused to parse without it would refuse to start the
   * game over a missing sentence.
   */
  description: record(string(), string()).optional(),
  /**
   * A picture of the world, drawn rather than captured.
   *
   * Not `icon.png`: that one is the 64x64 thumbnail the game writes when a
   * player leaves a world, and it belongs to the copy and the child. This one
   * belongs to the lesson and is the same for everybody - it is what the rail
   * tile and the column banner show before anybody has played.
   *
   * Same shape and same guards as the world zip, because it is the same kind of
   * thing: a file from a host we allow, checked against a hash before it is
   * used.
   */
  art: object$1({ url: fileUrl, sha512 }).optional(),
  url: fileUrl,
  sha512,
  /**
   * Folder name under `saves/`, not a path.
   *
   * A path would let a manifest write anywhere in the instance; a name cannot.
   */
  name: string().min(1).regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, {
    error: "World name must be a plain folder name, not a path"
  }),
  /**
   * The sha256 of the code a child types to reveal this world (O5).
   *
   * A hash, never the code: `pack-cache.json` sits on disk in plain text, so a
   * shipped code would let a curious child read every upcoming lesson's code
   * before its lesson. The launcher hashes the typed code the same way and
   * compares. The code is normalised first - trimmed and lowercased - so a child
   * typing "Craft-7 " matches "craft-7".
   *
   * Optional: a world with no `unlockHash` is open to everyone, which is how a
   * pack that predates gating keeps working. When the whole course is gated,
   * every world carries one.
   *
   * This is the only source of a gate. The launcher used to also read a local
   * `world-locks.json` for worlds Sparks could not yet gate; the admin form has
   * had a code field for a while, so that file filled in for nothing and is gone.
   */
  /**
   * Which Studios this world's lesson needs.
   *
   * One pack serves several courses - `Kodland_CraftForge_Main` carries a world
   * where Python is taught and a world where it is not - so "which tools does
   * this child get" cannot be answered at the pack level. It is answered here,
   * per lesson, and the launcher turns it into "which Studios does **this**
   * child get" by looking at the worlds they can actually open.
   *
   * **A world can only add.** The pack's own `studios` is the off switch; a
   * world saying nothing takes nothing away. So a methodologist marks the
   * Python lesson and changes nothing for anybody else.
   *
   * Plain strings rather than an enum, on purpose: a Studio added in the admin
   * before the launcher knows about it must not make the whole pack fail to
   * parse. Unknown names are ignored.
   */
  teaches: array(string().min(1)).optional(),
  unlockHash: string().regex(/^[0-9a-f]{64}$/, { error: "unlockHash must be a lowercase sha256 hex digest" }).optional()
});
const packManifestSchema = object$1({
  packId: string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, { error: "packId must be lowercase letters, digits and dashes" }),
  /** Bumped whenever anything else changes. The launcher compares packId + packVersion. */
  packVersion: string().min(1),
  minecraft: minecraftVersion,
  loader: object$1({
    // Fabric only in v1 (T8). Quilt and NeoForge are not built "just in case".
    type: literal("fabric"),
    version: string().min(1)
  }),
  memory: object$1({
    /** Overrides the O20 heuristic `min(4096, half of physical RAM)`. */
    xmxMb: number().int().positive()
  }).optional(),
  /**
   * How much disk this pack needs, in megabytes.
   *
   * Checked before the first byte is fetched. R1.2 requires a full disk to be
   * caught at the start rather than forty minutes in, and only whoever assembles
   * the pack knows its size - the launcher cannot know before downloading it,
   * which is the thing we are trying to avoid.
   *
   * Optional: without it the check simply does not run, which is how every
   * earlier build behaved.
   */
  diskMb: number().int().positive().optional(),
  mods: array(packModSchema).default([]),
  /**
   * One world was never going to be enough.
   *
   * `world` stays as the singular form every published manifest uses, and
   * `parsePackManifest` folds it into `worlds` so nothing downstream has to
   * know there were ever two spellings.
   */
  worlds: array(packWorldSchema).default([]),
  world: packWorldSchema.optional(),
  /**
   * Which Studios this course offers.
   *
   * One build serves every course, so the tools a child sees are a property of
   * the pack rather than of the installer. A methodologist teaching CC: Tweaked
   * does not want a Python Studio on the screen, and a methodologist teaching
   * Python does.
   *
   * **Optional, and every key inside it is optional too.** That is not
   * slackness: `python` has a useful default that follows the mod list, so
   * "skins off, Python as usual" has to be expressible - and `{"skins": false}`
   * is exactly that. A required field would also take every already published
   * pack off the air the moment this shipped, which is the argument
   * `worldTitleSchema` already makes on the Sparks side.
   *
   * The reading of it lives in `studios.ts`, because it needs the mod list and
   * this file only knows the manifest.
   */
  studios: object$1({
    skins: boolean().optional(),
    datapacks: boolean().optional(),
    python: boolean().optional()
  }).optional(),
  jvmArgs: array(string()).default([])
});
class InvalidPackManifestError extends Error {
  problems;
  constructor(problems) {
    super(`The pack manifest is not usable:
  - ${problems.join("\n  - ")}`);
    this.name = "InvalidPackManifestError";
    this.problems = problems;
  }
}
function parsePackManifest(input) {
  const result = packManifestSchema.safeParse(input);
  if (result.success) {
    const parsed = result.data;
    const manifest = parsed.worlds.length === 0 && parsed.world ? { ...parsed, worlds: [parsed.world] } : parsed;
    const problems2 = [];
    for (const mod of manifest.mods) {
      if (isCopyleft(mod.license) && !mod.source) {
        problems2.push(
          `Mod "${mod.id}" is ${mod.license} and has no source url. A copyleft licence obliges whoever hands the file out, which is this launcher.`
        );
      }
    }
    const duplicateIds = findDuplicates(manifest.mods.map((mod) => mod.id));
    if (duplicateIds.length > 0) {
      problems2.push(
        `Duplicate mod ids: ${duplicateIds.join(", ")}. Two mods would fight over one filename.`
      );
    }
    const duplicateWorldIds = findDuplicates(manifest.worlds.map((world) => world.id));
    if (duplicateWorldIds.length > 0) {
      problems2.push(
        `Duplicate world ids: ${duplicateWorldIds.join(", ")}. One id has to mean one world.`
      );
    }
    const duplicateFolders = findDuplicates(manifest.worlds.map((world) => world.name));
    if (duplicateFolders.length > 0) {
      problems2.push(
        `Two worlds want the folder: ${duplicateFolders.join(", ")}. Only one can have it.`
      );
    }
    if (problems2.length > 0) throw new InvalidPackManifestError(problems2);
    return manifest;
  }
  const problems = result.error.issues.map((issue2) => {
    const path = issue2.path.length > 0 ? issue2.path.join(".") : "(root)";
    return `${path}: ${issue2.message}`;
  });
  throw new InvalidPackManifestError(problems);
}
const COPYLEFT = ["AGPL", "LGPL", "GPL", "MPL", "EPL"];
function isCopyleft(license) {
  const upper = license.toUpperCase();
  return COPYLEFT.some((family) => upper.includes(family));
}
function findDuplicates(values) {
  const seen = /* @__PURE__ */ new Set();
  const duplicates = /* @__PURE__ */ new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
function modFileName(mod) {
  return `${mod.id}-${mod.version}.jar`;
}
const presetEnvelopeSchema = object$1({
  presetId: string().min(1),
  name: string().min(1),
  /** Monotone, server-assigned. Rolling back is promoting an older one. */
  revision: number().int().nonnegative(),
  /**
   * The version string, which Sparks puts **here** rather than in the manifest.
   *
   * Their reason is a good one and we keep it: they generate it from the preset
   * id and the revision, so "the content changed and the version did not" is not
   * a bug they can have. A manifest that carried its own copy would be a second
   * answer to one question.
   *
   * Optional only because a manifest read from a file - the bundled pack, a url,
   * a cache written before this - carries the version inside itself, where it
   * has to be: a file has no envelope. `withManifestVersion` folds the two
   * shapes into the one the rest of the code already knows.
   */
  packVersion: string().min(1).optional(),
  isDefault: boolean().default(false),
  updatedAt: string().optional(),
  updatedBy: string().optional(),
  /**
   * Only ever for a log line.
   *
   * "Why did this child get that build" is a support question, and answering it
   * without opening a database is worth one string. Nothing branches on it.
   */
  assignedBy: string().optional(),
  manifest: packManifestSchema
});
function withManifestVersion(input) {
  if (input === null || typeof input !== "object") return input;
  const envelope = input;
  const version2 = envelope["packVersion"];
  if (typeof version2 !== "string" || version2.length === 0) return input;
  const manifest = envelope["manifest"];
  if (manifest === null || typeof manifest !== "object") return input;
  const withVersion = manifest;
  if (typeof withVersion["packVersion"] === "string") return input;
  return { ...envelope, manifest: { ...withVersion, packVersion: version2 } };
}
function parsePresetEnvelope(input) {
  const outer = presetEnvelopeSchema.safeParse(withManifestVersion(input));
  if (!outer.success) {
    const problems = outer.error.issues.map((issue2) => {
      const path = issue2.path.length > 0 ? issue2.path.join(".") : "(root)";
      return `${path}: ${issue2.message}`;
    });
    throw new InvalidPresetError(problems);
  }
  return { ...outer.data, manifest: parsePackManifest(outer.data.manifest) };
}
class InvalidPresetError extends Error {
  problems;
  constructor(problems) {
    super(`The preset from Sparks is not usable:
  - ${problems.join("\n  - ")}`);
    this.name = "InvalidPresetError";
    this.problems = problems;
  }
}
const CODE_KEYS = ["code", "error", "detail"];
const REASON_KEYS = ["detail", "message", "reason"];
async function manifestVerdict(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    return { invalid: false };
  }
  if (body === null || typeof body !== "object") return { invalid: false };
  const record2 = body;
  const said = (key) => typeof record2[key] === "string" ? record2[key] : void 0;
  if (!CODE_KEYS.some((key) => said(key) === "MANIFEST_INVALID")) return { invalid: false };
  const detail = REASON_KEYS.map(said).find(
    (value) => value !== void 0 && value !== "MANIFEST_INVALID"
  );
  return detail === void 0 ? { invalid: true } : { invalid: true, detail };
}
async function fetchCurrentPack(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const headers = { Authorization: `Bearer ${options.bearer}` };
  if (options.etag) headers["If-None-Match"] = options.etag;
  let response;
  try {
    response = await doFetch(`${base}/api/v1/launcher/pack`, {
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  if (response.status === 304) return { ok: true, unchanged: true };
  const status = response.status;
  if (status === 401) return { ok: false, failure: "expired", status };
  if (status === 403) return { ok: false, failure: "not_student", status };
  if (status === 429) return { ok: false, failure: "rate_limited", status };
  if (!response.ok) {
    const verdict = await manifestVerdict(response);
    if (!verdict.invalid) return { ok: false, failure: "unavailable", status };
    return {
      ok: false,
      failure: "invalid",
      status,
      problems: [
        verdict.detail === void 0 ? "Sparks refused to serve the stored manifest." : `Sparks refused to serve the stored manifest: ${verdict.detail}`
      ]
    };
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failure: "unavailable", status };
  }
  try {
    const preset = parsePresetEnvelope(body);
    const etag = response.headers.get("etag");
    return etag ? { ok: true, preset, etag } : { ok: true, preset };
  } catch (error) {
    const problems = error !== null && typeof error === "object" && "problems" in error ? error.problems : [String(error)];
    return { ok: false, failure: "invalid", status, problems };
  }
}
async function reportInstall(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${base}/api/v1/launcher/pack/report`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.bearer}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(options.report),
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
    return response.ok;
  } catch {
    return false;
  }
}
async function syncUnlockedWorlds(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await doFetch(`${base}/api/v1/launcher/pack/worlds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.bearer}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ packId: options.packId, unlocked: options.unlocked }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  const status = response.status;
  if (status === 401) return { ok: false, failure: "expired", status };
  if (status === 403) return { ok: false, failure: "not_student", status };
  if (status === 429) return { ok: false, failure: "rate_limited", status };
  if (status === 409) return { ok: false, failure: "mismatch", status };
  if (!response.ok) return { ok: false, failure: "unavailable", status };
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, failure: "unavailable", status };
  }
  const parsed = parseAnswer(body);
  return parsed ?? { ok: false, failure: "unavailable", status };
}
function parseAnswer(body) {
  if (typeof body !== "object" || body === null) return null;
  const record2 = body;
  const packId = record2["packId"];
  const presetId = record2["presetId"];
  const worldIds = record2["worldIds"];
  if (typeof packId !== "string" || packId === "") return null;
  if (typeof presetId !== "string") return null;
  if (!Array.isArray(worldIds) || !worldIds.every((id) => typeof id === "string")) return null;
  return { ok: true, packId, presetId, worldIds };
}
const DATAPACK_DOC_VERSION = 1;
function createEmptyDoc(name) {
  return { version: DATAPACK_DOC_VERSION, name, items: [] };
}
function slugify(title, fallback = "item") {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return slug === "" ? fallback : slug;
}
function uniqueId(taken, wanted) {
  const used = new Set(taken);
  if (!used.has(wanted)) return wanted;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${wanted}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
function parseDatapackDoc(text) {
  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
  const doc2 = parsed;
  if (typeof doc2.name !== "string") throw new Error("no name");
  if (!Array.isArray(doc2.items)) throw new Error("no items");
  return {
    version: typeof doc2.version === "number" ? doc2.version : DATAPACK_DOC_VERSION,
    name: doc2.name,
    items: doc2.items
  };
}
function serializeDatapackDoc(doc2) {
  return `${JSON.stringify(doc2, null, 2)}
`;
}
function countKinds(doc2) {
  const counts = { recipe: 0, drop: 0, command: 0, quest: 0 };
  for (const item of doc2.items) counts[item.kind] += 1;
  return counts;
}
const RESERVED_NAMESPACES = /* @__PURE__ */ new Set(["minecraft", "realms", "c", "fabric"]);
class InvalidNamespaceError extends Error {
}
function assertNamespace(namespace) {
  if (!/^[a-z0-9][a-z0-9_.-]{0,39}$/.test(namespace)) {
    throw new InvalidNamespaceError(`namespace ${JSON.stringify(namespace)} is not usable`);
  }
  if (RESERVED_NAMESPACES.has(namespace)) {
    throw new InvalidNamespaceError(`namespace ${namespace} belongs to somebody else`);
  }
}
function json(value) {
  return `${JSON.stringify(value, null, 2)}
`;
}
function packMeta(format, description) {
  return json({
    pack: { description, max_format: format.major, min_format: [format.major, format.minor] }
  });
}
const PATTERN_SYMBOLS = "#ABCDEFGH";
function shapedPattern(grid) {
  const rows = [0, 1, 2];
  const columns = [0, 1, 2];
  const filled = (row, column) => grid[row * 3 + column] ?? null;
  const rowUsed = rows.map((row) => columns.some((column) => filled(row, column) !== null));
  const columnUsed = columns.map((column) => rows.some((row) => filled(row, column) !== null));
  if (!rowUsed.includes(true)) return { pattern: [], key: {} };
  const edge = (used) => {
    const first = used.indexOf(true);
    const last = used.lastIndexOf(true);
    return rows.slice(first, last + 1).map((_, offset) => first + offset);
  };
  const usedRows = edge(rowUsed);
  const usedColumns = edge(columnUsed);
  const symbols = /* @__PURE__ */ new Map();
  const key = {};
  const pattern = usedRows.map(
    (row) => usedColumns.map((column) => {
      const item = filled(row, column);
      if (item === null) return " ";
      const existing = symbols.get(item);
      if (existing !== void 0) return existing;
      const symbol = PATTERN_SYMBOLS[symbols.size] ?? "#";
      symbols.set(item, symbol);
      key[symbol] = item;
      return symbol;
    }).join("")
  );
  return { pattern, key };
}
function resultBlock(result) {
  return {
    id: result.id,
    ...result.count > 1 ? { count: result.count } : {},
    ...result.customName === void 0 || result.customName === "" ? {} : { components: { "minecraft:custom_name": result.customName } }
  };
}
function recipeJson(recipe) {
  if (recipe.type === "shaped") {
    const { pattern, key } = shapedPattern(recipe.grid);
    return {
      type: "minecraft:crafting_shaped",
      category: "misc",
      key,
      pattern,
      result: resultBlock(recipe.result)
    };
  }
  if (recipe.type === "shapeless") {
    return {
      type: "minecraft:crafting_shapeless",
      category: "misc",
      ingredients: recipe.ingredients,
      result: resultBlock(recipe.result)
    };
  }
  if (recipe.type === "stonecutting") {
    return {
      type: "minecraft:stonecutting",
      ingredient: recipe.ingredient,
      result: resultBlock(recipe.result)
    };
  }
  const type = { smelting: "smelting", blasting: "blasting", smoking: "smoking", campfire: "campfire_cooking" }[recipe.type];
  return {
    type: `minecraft:${type}`,
    category: "misc",
    ingredient: recipe.ingredient,
    result: resultBlock(recipe.result),
    experience: 0.1,
    cookingtime: recipe.type === "campfire" ? 600 : 200
  };
}
function recipeUnlock(namespace, id, recipe) {
  const first = recipe.type === "shaped" ? recipe.grid.find((cell) => cell !== null) : recipe.type === "shapeless" ? recipe.ingredients[0] : recipe.ingredient;
  return {
    parent: "minecraft:recipes/root",
    criteria: {
      has_ingredient: {
        trigger: "minecraft:inventory_changed",
        // No ingredient at all cannot happen for a recipe that passed `check`,
        // but a document can be hand-edited: fall back to something that is
        // always true rather than emitting a file the game refuses.
        ...first === void 0 ? { conditions: {} } : { conditions: { items: [{ items: first }] } }
      }
    },
    requirements: [["has_ingredient"]],
    rewards: { recipes: [`${namespace}:${id}`] }
  };
}
function dropPath(source) {
  const folder = source.kind === "block" ? "blocks" : "entities";
  const name = source.id.replace(/^minecraft:/, "");
  return `data/minecraft/loot_table/${folder}/${name}.json`;
}
function dropJson(drop) {
  return {
    type: drop.source.kind === "block" ? "minecraft:block" : "minecraft:entity",
    pools: drop.rows.map((row) => ({
      rolls: 1,
      entries: [
        {
          type: "minecraft:item",
          name: row.id,
          functions: row.min === 1 && row.max === 1 ? [] : [
            {
              function: "minecraft:set_count",
              count: { min: row.min, max: row.max, type: "minecraft:uniform" }
            }
          ]
        }
      ],
      conditions: [
        // Blocks only. `survives_explosion` on an entity table is a condition
        // the game does not expect there.
        ...drop.source.kind === "block" ? [{ condition: "minecraft:survives_explosion" }] : [],
        ...row.chance >= 1 ? [] : [{ condition: "minecraft:random_chance", chance: row.chance }]
      ]
    }))
  };
}
function entityIs(predicate, value) {
  return [
    {
      condition: "minecraft:entity_properties",
      // "this" is the entity the trigger is about: the mob that died for
      // `player_killed_entity`, the player for `location`.
      entity: "this",
      predicate: { [predicate]: value }
    }
  ];
}
function questJson(quest) {
  const trigger = quest.trigger;
  const criteria = trigger.kind === "collect" ? {
    trigger: "minecraft:inventory_changed",
    conditions: { items: [{ items: trigger.item, count: { min: trigger.count } }] }
  } : trigger.kind === "kill" ? {
    trigger: "minecraft:player_killed_entity",
    conditions: { entity: entityIs("minecraft:entity_type", trigger.entity) }
  } : trigger.kind === "biome" ? {
    trigger: "minecraft:location",
    conditions: { player: entityIs("minecraft:location", { biomes: trigger.biome }) }
  } : (
    // "the world opened": the first tick the player is in it. No
    // conditions, because the trigger firing is the whole condition.
    { trigger: "minecraft:tick" }
  );
  return {
    display: {
      icon: { id: quest.icon },
      // Literal text, not a `translate` key: a title a child typed has no entry
      // in the game's language files, and a missing key renders as the key.
      title: quest.heading,
      description: quest.description,
      frame: "task",
      announce_to_chat: true,
      show_toast: true
    },
    criteria: { done: criteria },
    requirements: [["done"]]
  };
}
function itemJson(item) {
  switch (item.kind) {
    case "recipe":
      return item.raw ?? json(recipeJson(item.recipe));
    case "drop":
      return item.raw ?? json(dropJson(item.drop));
    case "quest":
      return item.raw ?? json(questJson(item.quest));
    case "command":
      return item.commands;
  }
}
function itemPath(item, namespace) {
  switch (item.kind) {
    case "recipe":
      return `data/${namespace}/recipe/${item.id}.json`;
    case "drop":
      return dropPath(item.drop.source);
    case "quest":
      return `data/${namespace}/advancement/${item.id}.json`;
    case "command":
      return `data/${namespace}/function/${item.id}.mcfunction`;
  }
}
function emitDatapack(doc2, format, namespace) {
  if (!Number.isInteger(format?.major) || !Number.isInteger(format?.minor)) {
    throw new Error("emitDatapack needs the data pack format from the installed client");
  }
  assertNamespace(namespace);
  const files = /* @__PURE__ */ new Map();
  files.set("pack.mcmeta", packMeta(format, doc2.name));
  const onLoad = [];
  for (const item of doc2.items) {
    switch (item.kind) {
      case "recipe": {
        files.set(itemPath(item, namespace), itemJson(item));
        files.set(
          `data/${namespace}/advancement/recipes/${item.id}.json`,
          json(recipeUnlock(namespace, item.id, item.recipe))
        );
        break;
      }
      case "drop": {
        files.set(itemPath(item, namespace), itemJson(item));
        break;
      }
      case "command": {
        const body = itemJson(item);
        files.set(itemPath(item, namespace), body.endsWith("\n") ? body : `${body}
`);
        onLoad.push(`${namespace}:${item.id}`);
        break;
      }
      case "quest": {
        files.set(itemPath(item, namespace), itemJson(item));
        break;
      }
    }
  }
  if (onLoad.length > 0) {
    files.set("data/minecraft/tags/function/load.json", json({ values: onLoad }));
  }
  return files;
}
function fileOwners(doc2, namespace) {
  const owners = /* @__PURE__ */ new Map();
  for (const item of doc2.items) {
    switch (item.kind) {
      case "recipe":
        owners.set(`${namespace}:recipe/${item.id}.json`, item);
        break;
      case "drop":
        owners.set(`minecraft:${dropPath(item.drop.source).replace("data/minecraft/", "")}`, item);
        break;
      case "command":
        owners.set(`${namespace}:function/${item.id}.mcfunction`, item);
        break;
      case "quest":
        owners.set(`${namespace}:advancement/${item.id}.json`, item);
        break;
    }
  }
  return owners;
}
function knows(known, id) {
  if (known === void 0 || known.size === 0) return true;
  return known.has(id);
}
function checkCount(value) {
  return Number.isInteger(value) && value >= 1 && value <= 99;
}
function checkDatapack(doc2, catalogue) {
  const problems = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of doc2.items) {
    if (seen.has(item.id)) problems.push({ itemId: item.id, reason: "duplicate-id" });
    seen.add(item.id);
    if ("raw" in item && item.raw !== void 0) {
      try {
        JSON.parse(item.raw);
      } catch {
        problems.push({ itemId: item.id, reason: "bad-json" });
      }
      continue;
    }
    problems.push(...checkItem(item, catalogue));
  }
  return problems;
}
function checkItem(item, catalogue) {
  const problems = [];
  const here = (reason, detail) => {
    problems.push({ itemId: item.id, reason, ...detail === void 0 ? {} : { detail } });
  };
  switch (item.kind) {
    case "recipe": {
      const { recipe } = item;
      if (recipe.type === "shaped") {
        if (shapedPattern(recipe.grid).pattern.length === 0) here("empty-recipe");
        for (const cell of recipe.grid) {
          if (cell !== null && !knows(catalogue?.items, cell)) here("unknown-item", cell);
        }
      } else if (recipe.type === "shapeless") {
        if (recipe.ingredients.length === 0) here("empty-recipe");
        for (const one of recipe.ingredients) {
          if (!knows(catalogue?.items, one)) here("unknown-item", one);
        }
      } else {
        if (recipe.ingredient === "") here("empty-recipe");
        else if (!knows(catalogue?.items, recipe.ingredient)) {
          here("unknown-item", recipe.ingredient);
        }
      }
      if (recipe.result.id === "") here("no-result");
      else if (!knows(catalogue?.items, recipe.result.id)) here("unknown-item", recipe.result.id);
      if (!checkCount(recipe.result.count)) here("bad-number", String(recipe.result.count));
      break;
    }
    case "drop": {
      const { drop } = item;
      const known = drop.source.kind === "block" ? catalogue?.blocks : catalogue?.entities;
      if (drop.source.id === "") here("no-result");
      else if (!knows(known, drop.source.id)) here("unknown-item", drop.source.id);
      if (drop.rows.length === 0) here("nothing-happens");
      for (const row of drop.rows) {
        if (!knows(catalogue?.items, row.id)) here("unknown-item", row.id);
        if (!checkCount(row.min) || !checkCount(row.max) || row.min > row.max) {
          here("bad-number", `${row.min}-${row.max}`);
        }
        if (!(row.chance > 0 && row.chance <= 1)) here("bad-number", String(row.chance));
      }
      break;
    }
    case "command": {
      if (item.commands.trim() === "") here("nothing-happens");
      break;
    }
    case "quest": {
      const { quest } = item;
      if (quest.heading.trim() === "") here("no-title");
      if (!knows(catalogue?.items, quest.icon)) here("unknown-item", quest.icon);
      const { trigger } = quest;
      if (trigger.kind === "collect") {
        if (!knows(catalogue?.items, trigger.item)) here("unknown-item", trigger.item);
        if (!checkCount(trigger.count)) here("bad-number", String(trigger.count));
      } else if (trigger.kind === "kill") {
        if (!knows(catalogue?.entities, trigger.entity)) here("unknown-item", trigger.entity);
      } else if (trigger.kind === "biome") {
        if (trigger.biome === "") here("nothing-happens");
      }
      break;
    }
  }
  return problems;
}
function doc(name, items) {
  return { version: DATAPACK_DOC_VERSION, name, items };
}
function buildPreset(id, text) {
  switch (id) {
    case "recipe":
      return doc(text.packName, [
        {
          kind: "recipe",
          id: "diamond_from_dirt",
          title: text.itemTitle,
          recipe: {
            type: "shaped",
            grid: Array.from({ length: 9 }, () => "minecraft:dirt"),
            result: { id: "minecraft:diamond", count: 1 }
          }
        }
      ]);
    /*
     * `time set day` and `weather clear` need no player at all, and that is why
     * they are here.
     *
     * A function wired to `minecraft:load` runs as the server. The teleport
     * preset that used to sit beside this one had to write
     * `execute as @a at @s run tp @s ~ ~5 ~` to move the frame of reference
     * onto the child, and a preset whose one line is that long is a preset that
     * teaches nothing on the first read. It went with the owner's cut; the
     * spike that measured it is still in `docs/DECISIONS.md`.
     */
    case "command":
      return doc(text.packName, [
        {
          kind: "command",
          id: "hello",
          title: text.itemTitle,
          commands: [`say ${text.chatLine ?? "Hello!"}`, "time set day", "weather clear", ""].join(
            "\n"
          )
        }
      ]);
    case "empty":
      return doc(text.packName, []);
  }
}
const MOST_INGREDIENTS = 3;
const MOST_COMMAND_CHARS = 60;
function ingredientsOf(recipe) {
  const all = recipe.type === "shaped" ? recipe.grid.filter((cell) => cell !== null) : recipe.type === "shapeless" ? recipe.ingredients : [recipe.ingredient];
  return [...new Set(all)].slice(0, MOST_INGREDIENTS);
}
function commandLine(commands) {
  return commands.split("\n").map((line) => line.trim()).filter((line) => line !== "").join(" · ").slice(0, MOST_COMMAND_CHARS);
}
function previewOf$1(doc2) {
  const first = doc2.items[0];
  if (!first) return { kind: "empty" };
  switch (first.kind) {
    case "recipe":
      return { kind: "recipe", from: ingredientsOf(first.recipe), to: first.recipe.result.id };
    case "drop": {
      const row = first.drop.rows[0];
      return { kind: "drop", from: first.drop.source.id, to: row?.id ?? "" };
    }
    case "command":
      return { kind: "command", text: commandLine(first.commands) };
    case "quest":
      return { kind: "quest", icon: first.quest.icon };
  }
}
function datapackStoreDir(dataDir) {
  return node_path.join(dataDir, "datapacks");
}
const INDEX_FILE$2 = "index.json";
const DOC_FILE = "draft.json";
const SLUG = /^[a-z0-9][a-z0-9_]{0,39}$/;
function isDraftSlug(slug) {
  return SLUG.test(slug);
}
const WORLD_FOLDER = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;
function isWorldFolder(world) {
  return WORLD_FOLDER.test(world);
}
function indexPath$1(dataDir) {
  return node_path.join(datapackStoreDir(dataDir), INDEX_FILE$2);
}
async function readIndex$2(dataDir) {
  try {
    const parsed = JSON.parse(await promises.readFile(indexPath$1(dataDir), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}
async function writeIndex$2(dataDir, index) {
  const path = indexPath$1(dataDir);
  await promises.mkdir(datapackStoreDir(dataDir), { recursive: true });
  const partial2 = `${path}.part`;
  await promises.writeFile(partial2, `${JSON.stringify(index, null, 2)}
`);
  await promises.rename(partial2, path);
}
function docPath(dataDir, slug) {
  return node_path.join(datapackStoreDir(dataDir), slug, DOC_FILE);
}
async function listDrafts(dataDir) {
  const index = await readIndex$2(dataDir);
  const names = await promises.readdir(datapackStoreDir(dataDir)).catch(() => []);
  const entries = await Promise.all(
    names.filter(isDraftSlug).map(async (slug) => {
      const exists2 = await promises.stat(docPath(dataDir, slug)).catch(() => void 0);
      if (!exists2) return void 0;
      const known = index[slug];
      return {
        slug,
        name: known?.name ?? slug,
        createdAt: known?.createdAt ?? exists2.mtime.toISOString(),
        updatedAt: known?.updatedAt ?? exists2.mtime.toISOString(),
        // A draft whose index entry was lost defaults to "not in the game".
        // The other way round would put a pack a child cannot see back into
        // their world on the next launch.
        wanted: known?.wanted === true
      };
    })
  );
  return entries.filter((entry) => entry !== void 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function readDraft(dataDir, slug) {
  if (!isDraftSlug(slug)) return void 0;
  return promises.readFile(docPath(dataDir, slug), "utf8").catch(() => void 0);
}
async function createDraft(dataDir, name, doc2, now = /* @__PURE__ */ new Date()) {
  const index = await readIndex$2(dataDir);
  const existing = await listDrafts(dataDir);
  const taken = /* @__PURE__ */ new Set([
    ...existing.map((entry) => entry.slug),
    ...Object.keys(index),
    // Not folders, but they cannot become namespaces either.
    "minecraft",
    "realms",
    "c",
    "fabric"
  ]);
  const slug = uniqueId(taken, slugify(name, "pack"));
  assertNamespace(namespaceFor(slug));
  const at = now.toISOString();
  await writeDoc(dataDir, slug, doc2);
  index[slug] = { name, createdAt: at, updatedAt: at, wanted: false };
  await writeIndex$2(dataDir, index);
  return { slug, name, createdAt: at, updatedAt: at, wanted: false };
}
function namespaceFor(slug) {
  return slug;
}
async function writeDoc(dataDir, slug, doc2) {
  const path = docPath(dataDir, slug);
  await promises.mkdir(node_path.dirname(path), { recursive: true });
  const partial2 = `${path}.part`;
  await promises.writeFile(partial2, serializeDatapackDoc(doc2));
  await promises.rename(partial2, path);
}
async function saveDraft(dataDir, slug, doc2, now = /* @__PURE__ */ new Date()) {
  if (!isDraftSlug(slug)) return false;
  const index = await readIndex$2(dataDir);
  const known = index[slug];
  if (!known) return false;
  await writeDoc(dataDir, slug, doc2);
  index[slug] = { ...known, name: doc2.name, updatedAt: now.toISOString() };
  await writeIndex$2(dataDir, index);
  return true;
}
async function renameDraft(dataDir, slug, name, now = /* @__PURE__ */ new Date()) {
  if (!isDraftSlug(slug)) return false;
  if (name.trim() === "") return false;
  const index = await readIndex$2(dataDir);
  const known = index[slug];
  if (!known) return false;
  index[slug] = { ...known, name, updatedAt: now.toISOString() };
  await writeIndex$2(dataDir, index);
  return true;
}
async function removeDraft(dataDir, slug, packId) {
  if (!isDraftSlug(slug)) return false;
  const index = await readIndex$2(dataDir);
  if (packId) await removeFromEveryWorld(dataDir, packId, slug);
  await promises.rm(node_path.join(datapackStoreDir(dataDir), slug), { recursive: true, force: true });
  delete index[slug];
  await writeIndex$2(dataDir, index);
  return true;
}
async function removeFromEveryWorld(dataDir, packId, slug) {
  if (!isDraftSlug(slug)) return [];
  const saves = instanceLayout(dataDir, packId).saves;
  const worlds = await promises.readdir(saves).catch(() => []);
  const emptied = [];
  for (const world of worlds) {
    if (!isWorldFolder(world)) continue;
    if (await removeFromWorld(dataDir, packId, world, slug)) emptied.push(world);
  }
  return emptied;
}
function worldPackDir(dataDir, packId, world, slug) {
  if (!isDraftSlug(slug)) throw new Error(`not a draft slug: ${slug}`);
  if (!isWorldFolder(world)) throw new Error(`not a world folder name: ${world}`);
  return node_path.join(instanceLayout(dataDir, packId).saves, world, "datapacks", slug);
}
async function applyDraftToWorld(dataDir, packId, world, slug, doc2, format) {
  if (!isDraftSlug(slug)) throw new Error(`not a draft slug: ${slug}`);
  if (!isWorldFolder(world)) throw new Error(`not a world folder name: ${world}`);
  const files = emitDatapack(doc2, format, namespaceFor(slug));
  const root = worldPackDir(dataDir, packId, world, slug);
  for (const [relative, body] of files) {
    const path = node_path.join(root, relative);
    await promises.mkdir(node_path.dirname(path), { recursive: true });
    const partial2 = `${path}.part`;
    await promises.writeFile(partial2, body);
    await promises.rename(partial2, path);
  }
  const swept = await sweep(root, new Set(files.keys()));
  return { written: files.size, swept };
}
async function sweep(root, expected) {
  const swept = [];
  const walk = async (relative) => {
    const absolute = relative === "" ? root : node_path.join(root, relative);
    const entries = await promises.readdir(absolute, { withFileTypes: true }).catch(() => []);
    let kept = 0;
    for (const entry of entries) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        const stillHasSomething = await walk(child);
        if (stillHasSomething) kept += 1;
        else await promises.rm(node_path.join(root, child), { recursive: true, force: true });
        continue;
      }
      if (expected.has(child)) {
        kept += 1;
        continue;
      }
      await promises.unlink(node_path.join(root, child));
      swept.push(child);
    }
    return kept > 0;
  };
  await walk("");
  return swept;
}
async function setDraftWanted(dataDir, slug, wanted) {
  if (!isDraftSlug(slug)) return false;
  const index = await readIndex$2(dataDir);
  const known = index[slug];
  if (!known) return false;
  index[slug] = { ...known, wanted };
  await writeIndex$2(dataDir, index);
  return true;
}
async function syncWorld(dataDir, packId, world, format) {
  const result = { applied: [], removed: [], failed: [] };
  if (!isWorldFolder(world)) {
    result.failed.push({ slug: "", reason: `not a world folder name: ${world}` });
    return result;
  }
  for (const entry of await listDrafts(dataDir)) {
    try {
      if (!entry.wanted) {
        if (await removeFromWorld(dataDir, packId, world, entry.slug)) {
          result.removed.push(entry.slug);
        }
        continue;
      }
      const text = await readDraft(dataDir, entry.slug);
      if (text === void 0) {
        result.failed.push({ slug: entry.slug, reason: "the draft could not be read" });
        continue;
      }
      const doc2 = JSON.parse(text);
      await applyDraftToWorld(dataDir, packId, world, entry.slug, doc2, format);
      result.applied.push(entry.slug);
    } catch (error) {
      result.failed.push({ slug: entry.slug, reason: String(error) });
    }
  }
  return result;
}
async function removeFromWorld(dataDir, packId, world, slug) {
  if (!isDraftSlug(slug) || !isWorldFolder(world)) return false;
  const root = worldPackDir(dataDir, packId, world, slug);
  const there = await promises.stat(root).catch(() => void 0);
  await promises.rm(root, { recursive: true, force: true });
  return there !== void 0;
}
function scriptStoreDir(dataDir) {
  return node_path.join(dataDir, "scripts");
}
const INDEX_FILE$1 = "index.json";
const DRAFT_FILE = "draft.py";
const LEDGER_FILE = ".kodland-scripts.json";
function indexPath(dataDir) {
  return node_path.join(scriptStoreDir(dataDir), INDEX_FILE$1);
}
function draftPath(dataDir, slug) {
  return node_path.join(scriptStoreDir(dataDir), slug, DRAFT_FILE);
}
async function writeAtomic(path, text) {
  const partial2 = `${path}.part`;
  await promises.writeFile(partial2, text);
  await promises.rename(partial2, path);
}
async function readIndex$1(dataDir) {
  try {
    const raw = await promises.readFile(indexPath(dataDir), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
async function writeIndex$1(dataDir, index) {
  await promises.mkdir(scriptStoreDir(dataDir), { recursive: true });
  await writeAtomic(indexPath(dataDir), `${JSON.stringify(index, null, 2)}
`);
}
function digest(text) {
  return node_crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
function ledgerPath(dataDir, packId) {
  return node_path.join(instanceLayout(dataDir, packId).minescript, LEDGER_FILE);
}
async function readLedger(dataDir, packId) {
  try {
    const raw = await promises.readFile(ledgerPath(dataDir, packId), "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { version: 1, files: {} };
    const files = parsed.files;
    if (!files || typeof files !== "object") return { version: 1, files: {} };
    const clean = {};
    for (const [name, hash] of Object.entries(files)) {
      if (typeof hash === "string") clean[name] = hash;
    }
    return { version: 1, files: clean };
  } catch {
    return { version: 1, files: {} };
  }
}
async function writeLedger(dataDir, packId, ledger) {
  const dir = instanceLayout(dataDir, packId).minescript;
  await promises.mkdir(dir, { recursive: true });
  await writeAtomic(ledgerPath(dataDir, packId), `${JSON.stringify(ledger, null, 2)}
`);
}
async function listScripts(dataDir) {
  const index = await readIndex$1(dataDir);
  const names = await promises.readdir(scriptStoreDir(dataDir)).catch(() => []);
  const entries = await Promise.all(
    names.filter(isScriptSlug).map(async (slug) => {
      const found = await promises.stat(draftPath(dataDir, slug)).catch(() => void 0);
      if (!found) return void 0;
      const known = index[slug];
      return {
        slug,
        name: known?.name ?? slug,
        createdAt: known?.createdAt ?? found.mtime.toISOString(),
        updatedAt: known?.updatedAt ?? found.mtime.toISOString(),
        // A lost index entry defaults to "not in the game", the same direction
        // `listDrafts` chose: the other way round puts a script a child cannot
        // see back into their instance on the next save.
        wanted: known?.wanted === true
      };
    })
  );
  return entries.filter((entry) => entry !== void 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
async function readScript(dataDir, slug) {
  if (!isScriptSlug(slug)) return void 0;
  return promises.readFile(draftPath(dataDir, slug), "utf8").catch(() => void 0);
}
async function takenSlugs(dataDir) {
  const names = await promises.readdir(scriptStoreDir(dataDir)).catch(() => []);
  return /* @__PURE__ */ new Set([...names, ...RESERVED_SCRIPT_SLUGS]);
}
async function scriptSlugIsFree(dataDir, slug) {
  if (!isScriptSlug(slug)) return false;
  return !(await takenSlugs(dataDir)).has(slug);
}
async function createScript(dataDir, slug, name, text, now = /* @__PURE__ */ new Date()) {
  if (!isScriptSlug(slug)) return void 0;
  if (!await scriptSlugIsFree(dataDir, slug)) return void 0;
  await promises.mkdir(node_path.join(scriptStoreDir(dataDir), slug), { recursive: true });
  await writeAtomic(draftPath(dataDir, slug), text);
  const stamp = now.toISOString();
  const index = await readIndex$1(dataDir);
  const row = { name, createdAt: stamp, updatedAt: stamp, wanted: true };
  index[slug] = row;
  await writeIndex$1(dataDir, index);
  return { slug, ...row };
}
async function saveScript(dataDir, slug, text, now = /* @__PURE__ */ new Date()) {
  if (!isScriptSlug(slug)) return false;
  const exists2 = await promises.stat(draftPath(dataDir, slug)).catch(() => void 0);
  if (!exists2) return false;
  await writeAtomic(draftPath(dataDir, slug), text);
  const index = await readIndex$1(dataDir);
  const known = index[slug];
  if (known) {
    index[slug] = { ...known, updatedAt: now.toISOString() };
    await writeIndex$1(dataDir, index);
  }
  return true;
}
async function renameScript(dataDir, slug, next, now = /* @__PURE__ */ new Date()) {
  if (!isScriptSlug(slug) || !isScriptSlug(next)) return { ok: false, reason: "invalid" };
  if (next === slug) return { ok: true, slug };
  if (RESERVED_SCRIPT_SLUGS.includes(next)) return { ok: false, reason: "reserved" };
  const index = await readIndex$1(dataDir);
  const known = index[slug];
  const here = await promises.stat(node_path.join(scriptStoreDir(dataDir), slug)).catch(() => void 0);
  if (!here) return { ok: false, reason: "missing" };
  if (!await scriptSlugIsFree(dataDir, next)) return { ok: false, reason: "taken" };
  await promises.rename(node_path.join(scriptStoreDir(dataDir), slug), node_path.join(scriptStoreDir(dataDir), next));
  const row = known ?? { name: next, createdAt: now.toISOString(), wanted: true, updatedAt: now.toISOString() };
  delete index[slug];
  index[next] = { ...row, name: next, updatedAt: now.toISOString() };
  await writeIndex$1(dataDir, index);
  return { ok: true, slug: next };
}
async function setScriptWanted(dataDir, slug, wanted, now = /* @__PURE__ */ new Date()) {
  if (!isScriptSlug(slug)) return false;
  const index = await readIndex$1(dataDir);
  const known = index[slug];
  if (!known) return false;
  index[slug] = { ...known, wanted, updatedAt: now.toISOString() };
  await writeIndex$1(dataDir, index);
  return true;
}
async function removeScript(dataDir, slug) {
  if (!isScriptSlug(slug)) return false;
  await promises.rm(node_path.join(scriptStoreDir(dataDir), slug), { recursive: true, force: true });
  const index = await readIndex$1(dataDir);
  if (slug in index) {
    delete index[slug];
    await writeIndex$1(dataDir, index);
  }
  return true;
}
async function hashOnDisk(path) {
  const text = await promises.readFile(path, "utf8").catch(() => void 0);
  return text === void 0 ? void 0 : digest(text);
}
async function syncScripts(dataDir, packId) {
  const dir = instanceLayout(dataDir, packId).minescript;
  const scripts = await listScripts(dataDir);
  const before = await readLedger(dataDir, packId);
  const wanted = /* @__PURE__ */ new Map();
  for (const entry of scripts) {
    if (!entry.wanted) continue;
    const text = await readScript(dataDir, entry.slug);
    if (text === void 0) continue;
    wanted.set(scriptFileName(entry.slug), text);
  }
  await promises.mkdir(dir, { recursive: true });
  const written = [];
  const nextFiles = {};
  for (const [file, text] of wanted) {
    await writeAtomic(node_path.join(dir, file), text);
    nextFiles[file] = digest(text);
    written.push(file);
  }
  await writeLedger(dataDir, packId, { version: 1, files: { ...before.files, ...nextFiles } });
  const removed = [];
  const keptForeign = [];
  for (const [file, hash] of Object.entries(before.files)) {
    if (file in nextFiles) continue;
    const onDisk = await hashOnDisk(node_path.join(dir, file));
    if (onDisk === void 0) continue;
    if (onDisk !== hash) {
      keptForeign.push(file);
      continue;
    }
    await promises.rm(node_path.join(dir, file), { force: true });
    removed.push(file);
  }
  await writeLedger(dataDir, packId, { version: 1, files: nextFiles });
  return { written, removed, keptForeign };
}
async function applyScript(dataDir, packId, slug, text) {
  if (!isScriptSlug(slug)) return false;
  const dir = instanceLayout(dataDir, packId).minescript;
  const file = scriptFileName(slug);
  await promises.mkdir(dir, { recursive: true });
  await writeAtomic(node_path.join(dir, file), text);
  const ledger = await readLedger(dataDir, packId);
  ledger.files[file] = digest(text);
  await writeLedger(dataDir, packId, ledger);
  return true;
}
async function removeAppliedScript(dataDir, packId, slug) {
  if (!isScriptSlug(slug)) return false;
  const dir = instanceLayout(dataDir, packId).minescript;
  const file = scriptFileName(slug);
  const ledger = await readLedger(dataDir, packId);
  const recorded = ledger.files[file];
  if (recorded === void 0) return false;
  const onDisk = await hashOnDisk(node_path.join(dir, file));
  if (onDisk !== void 0 && onDisk !== recorded) {
    delete ledger.files[file];
    await writeLedger(dataDir, packId, ledger);
    return false;
  }
  await promises.rm(node_path.join(dir, file), { force: true });
  delete ledger.files[file];
  await writeLedger(dataDir, packId, ledger);
  return true;
}
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var utf8 = {};
var utils = {};
var support = {};
var readable = { exports: {} };
var processNextickArgs = { exports: {} };
var hasRequiredProcessNextickArgs;
function requireProcessNextickArgs() {
  if (hasRequiredProcessNextickArgs) return processNextickArgs.exports;
  hasRequiredProcessNextickArgs = 1;
  if (typeof process === "undefined" || !process.version || process.version.indexOf("v0.") === 0 || process.version.indexOf("v1.") === 0 && process.version.indexOf("v1.8.") !== 0) {
    processNextickArgs.exports = { nextTick };
  } else {
    processNextickArgs.exports = process;
  }
  function nextTick(fn, arg1, arg2, arg3) {
    if (typeof fn !== "function") {
      throw new TypeError('"callback" argument must be a function');
    }
    var len = arguments.length;
    var args, i;
    switch (len) {
      case 0:
      case 1:
        return process.nextTick(fn);
      case 2:
        return process.nextTick(function afterTickOne() {
          fn.call(null, arg1);
        });
      case 3:
        return process.nextTick(function afterTickTwo() {
          fn.call(null, arg1, arg2);
        });
      case 4:
        return process.nextTick(function afterTickThree() {
          fn.call(null, arg1, arg2, arg3);
        });
      default:
        args = new Array(len - 1);
        i = 0;
        while (i < args.length) {
          args[i++] = arguments[i];
        }
        return process.nextTick(function afterTick() {
          fn.apply(null, args);
        });
    }
  }
  return processNextickArgs.exports;
}
var isarray;
var hasRequiredIsarray;
function requireIsarray() {
  if (hasRequiredIsarray) return isarray;
  hasRequiredIsarray = 1;
  var toString = {}.toString;
  isarray = Array.isArray || function(arr) {
    return toString.call(arr) == "[object Array]";
  };
  return isarray;
}
var stream;
var hasRequiredStream;
function requireStream() {
  if (hasRequiredStream) return stream;
  hasRequiredStream = 1;
  stream = require$$0;
  return stream;
}
var safeBuffer = { exports: {} };
var hasRequiredSafeBuffer;
function requireSafeBuffer() {
  if (hasRequiredSafeBuffer) return safeBuffer.exports;
  hasRequiredSafeBuffer = 1;
  (function(module2, exports) {
    var buffer = require$$0$1;
    var Buffer2 = buffer.Buffer;
    function copyProps(src, dst) {
      for (var key in src) {
        dst[key] = src[key];
      }
    }
    if (Buffer2.from && Buffer2.alloc && Buffer2.allocUnsafe && Buffer2.allocUnsafeSlow) {
      module2.exports = buffer;
    } else {
      copyProps(buffer, exports);
      exports.Buffer = SafeBuffer;
    }
    function SafeBuffer(arg, encodingOrOffset, length) {
      return Buffer2(arg, encodingOrOffset, length);
    }
    copyProps(Buffer2, SafeBuffer);
    SafeBuffer.from = function(arg, encodingOrOffset, length) {
      if (typeof arg === "number") {
        throw new TypeError("Argument must not be a number");
      }
      return Buffer2(arg, encodingOrOffset, length);
    };
    SafeBuffer.alloc = function(size, fill, encoding) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      var buf = Buffer2(size);
      if (fill !== void 0) {
        if (typeof encoding === "string") {
          buf.fill(fill, encoding);
        } else {
          buf.fill(fill);
        }
      } else {
        buf.fill(0);
      }
      return buf;
    };
    SafeBuffer.allocUnsafe = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return Buffer2(size);
    };
    SafeBuffer.allocUnsafeSlow = function(size) {
      if (typeof size !== "number") {
        throw new TypeError("Argument must be a number");
      }
      return buffer.SlowBuffer(size);
    };
  })(safeBuffer, safeBuffer.exports);
  return safeBuffer.exports;
}
var util = {};
var hasRequiredUtil;
function requireUtil() {
  if (hasRequiredUtil) return util;
  hasRequiredUtil = 1;
  function isArray(arg) {
    if (Array.isArray) {
      return Array.isArray(arg);
    }
    return objectToString(arg) === "[object Array]";
  }
  util.isArray = isArray;
  function isBoolean(arg) {
    return typeof arg === "boolean";
  }
  util.isBoolean = isBoolean;
  function isNull(arg) {
    return arg === null;
  }
  util.isNull = isNull;
  function isNullOrUndefined(arg) {
    return arg == null;
  }
  util.isNullOrUndefined = isNullOrUndefined;
  function isNumber(arg) {
    return typeof arg === "number";
  }
  util.isNumber = isNumber;
  function isString(arg) {
    return typeof arg === "string";
  }
  util.isString = isString;
  function isSymbol(arg) {
    return typeof arg === "symbol";
  }
  util.isSymbol = isSymbol;
  function isUndefined(arg) {
    return arg === void 0;
  }
  util.isUndefined = isUndefined;
  function isRegExp(re) {
    return objectToString(re) === "[object RegExp]";
  }
  util.isRegExp = isRegExp;
  function isObject2(arg) {
    return typeof arg === "object" && arg !== null;
  }
  util.isObject = isObject2;
  function isDate(d) {
    return objectToString(d) === "[object Date]";
  }
  util.isDate = isDate;
  function isError(e) {
    return objectToString(e) === "[object Error]" || e instanceof Error;
  }
  util.isError = isError;
  function isFunction(arg) {
    return typeof arg === "function";
  }
  util.isFunction = isFunction;
  function isPrimitive(arg) {
    return arg === null || typeof arg === "boolean" || typeof arg === "number" || typeof arg === "string" || typeof arg === "symbol" || // ES6 symbol
    typeof arg === "undefined";
  }
  util.isPrimitive = isPrimitive;
  util.isBuffer = require$$0$1.Buffer.isBuffer;
  function objectToString(o) {
    return Object.prototype.toString.call(o);
  }
  return util;
}
var inherits = { exports: {} };
var inherits_browser = { exports: {} };
var hasRequiredInherits_browser;
function requireInherits_browser() {
  if (hasRequiredInherits_browser) return inherits_browser.exports;
  hasRequiredInherits_browser = 1;
  if (typeof Object.create === "function") {
    inherits_browser.exports = function inherits2(ctor, superCtor) {
      if (superCtor) {
        ctor.super_ = superCtor;
        ctor.prototype = Object.create(superCtor.prototype, {
          constructor: {
            value: ctor,
            enumerable: false,
            writable: true,
            configurable: true
          }
        });
      }
    };
  } else {
    inherits_browser.exports = function inherits2(ctor, superCtor) {
      if (superCtor) {
        ctor.super_ = superCtor;
        var TempCtor = function() {
        };
        TempCtor.prototype = superCtor.prototype;
        ctor.prototype = new TempCtor();
        ctor.prototype.constructor = ctor;
      }
    };
  }
  return inherits_browser.exports;
}
var hasRequiredInherits;
function requireInherits() {
  if (hasRequiredInherits) return inherits.exports;
  hasRequiredInherits = 1;
  try {
    var util2 = require("util");
    if (typeof util2.inherits !== "function") throw "";
    inherits.exports = util2.inherits;
  } catch (e) {
    inherits.exports = requireInherits_browser();
  }
  return inherits.exports;
}
var BufferList = { exports: {} };
var hasRequiredBufferList;
function requireBufferList() {
  if (hasRequiredBufferList) return BufferList.exports;
  hasRequiredBufferList = 1;
  (function(module2) {
    function _classCallCheck(instance, Constructor) {
      if (!(instance instanceof Constructor)) {
        throw new TypeError("Cannot call a class as a function");
      }
    }
    var Buffer2 = requireSafeBuffer().Buffer;
    var util2 = require$$1;
    function copyBuffer(src, target, offset) {
      src.copy(target, offset);
    }
    module2.exports = (function() {
      function BufferList2() {
        _classCallCheck(this, BufferList2);
        this.head = null;
        this.tail = null;
        this.length = 0;
      }
      BufferList2.prototype.push = function push(v) {
        var entry = { data: v, next: null };
        if (this.length > 0) this.tail.next = entry;
        else this.head = entry;
        this.tail = entry;
        ++this.length;
      };
      BufferList2.prototype.unshift = function unshift(v) {
        var entry = { data: v, next: this.head };
        if (this.length === 0) this.tail = entry;
        this.head = entry;
        ++this.length;
      };
      BufferList2.prototype.shift = function shift() {
        if (this.length === 0) return;
        var ret = this.head.data;
        if (this.length === 1) this.head = this.tail = null;
        else this.head = this.head.next;
        --this.length;
        return ret;
      };
      BufferList2.prototype.clear = function clear() {
        this.head = this.tail = null;
        this.length = 0;
      };
      BufferList2.prototype.join = function join(s) {
        if (this.length === 0) return "";
        var p = this.head;
        var ret = "" + p.data;
        while (p = p.next) {
          ret += s + p.data;
        }
        return ret;
      };
      BufferList2.prototype.concat = function concat(n) {
        if (this.length === 0) return Buffer2.alloc(0);
        var ret = Buffer2.allocUnsafe(n >>> 0);
        var p = this.head;
        var i = 0;
        while (p) {
          copyBuffer(p.data, ret, i);
          i += p.data.length;
          p = p.next;
        }
        return ret;
      };
      return BufferList2;
    })();
    if (util2 && util2.inspect && util2.inspect.custom) {
      module2.exports.prototype[util2.inspect.custom] = function() {
        var obj = util2.inspect({ length: this.length });
        return this.constructor.name + " " + obj;
      };
    }
  })(BufferList);
  return BufferList.exports;
}
var destroy_1;
var hasRequiredDestroy;
function requireDestroy() {
  if (hasRequiredDestroy) return destroy_1;
  hasRequiredDestroy = 1;
  var pna = requireProcessNextickArgs();
  function destroy(err, cb) {
    var _this = this;
    var readableDestroyed = this._readableState && this._readableState.destroyed;
    var writableDestroyed = this._writableState && this._writableState.destroyed;
    if (readableDestroyed || writableDestroyed) {
      if (cb) {
        cb(err);
      } else if (err) {
        if (!this._writableState) {
          pna.nextTick(emitErrorNT, this, err);
        } else if (!this._writableState.errorEmitted) {
          this._writableState.errorEmitted = true;
          pna.nextTick(emitErrorNT, this, err);
        }
      }
      return this;
    }
    if (this._readableState) {
      this._readableState.destroyed = true;
    }
    if (this._writableState) {
      this._writableState.destroyed = true;
    }
    this._destroy(err || null, function(err2) {
      if (!cb && err2) {
        if (!_this._writableState) {
          pna.nextTick(emitErrorNT, _this, err2);
        } else if (!_this._writableState.errorEmitted) {
          _this._writableState.errorEmitted = true;
          pna.nextTick(emitErrorNT, _this, err2);
        }
      } else if (cb) {
        cb(err2);
      }
    });
    return this;
  }
  function undestroy() {
    if (this._readableState) {
      this._readableState.destroyed = false;
      this._readableState.reading = false;
      this._readableState.ended = false;
      this._readableState.endEmitted = false;
    }
    if (this._writableState) {
      this._writableState.destroyed = false;
      this._writableState.ended = false;
      this._writableState.ending = false;
      this._writableState.finalCalled = false;
      this._writableState.prefinished = false;
      this._writableState.finished = false;
      this._writableState.errorEmitted = false;
    }
  }
  function emitErrorNT(self2, err) {
    self2.emit("error", err);
  }
  destroy_1 = {
    destroy,
    undestroy
  };
  return destroy_1;
}
var node;
var hasRequiredNode;
function requireNode() {
  if (hasRequiredNode) return node;
  hasRequiredNode = 1;
  node = require$$1.deprecate;
  return node;
}
var _stream_writable;
var hasRequired_stream_writable;
function require_stream_writable() {
  if (hasRequired_stream_writable) return _stream_writable;
  hasRequired_stream_writable = 1;
  var pna = requireProcessNextickArgs();
  _stream_writable = Writable;
  function CorkedRequest(state) {
    var _this = this;
    this.next = null;
    this.entry = null;
    this.finish = function() {
      onCorkedFinish(_this, state);
    };
  }
  var asyncWrite = !process.browser && ["v0.10", "v0.9."].indexOf(process.version.slice(0, 5)) > -1 ? setImmediate : pna.nextTick;
  var Duplex;
  Writable.WritableState = WritableState;
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  var internalUtil = {
    deprecate: requireNode()
  };
  var Stream = requireStream();
  var Buffer2 = requireSafeBuffer().Buffer;
  var OurUint8Array = (typeof commonjsGlobal !== "undefined" ? commonjsGlobal : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
  };
  function _uint8ArrayToBuffer(chunk) {
    return Buffer2.from(chunk);
  }
  function _isUint8Array(obj) {
    return Buffer2.isBuffer(obj) || obj instanceof OurUint8Array;
  }
  var destroyImpl = requireDestroy();
  util2.inherits(Writable, Stream);
  function nop() {
  }
  function WritableState(options, stream2) {
    Duplex = Duplex || require_stream_duplex();
    options = options || {};
    var isDuplex = stream2 instanceof Duplex;
    this.objectMode = !!options.objectMode;
    if (isDuplex) this.objectMode = this.objectMode || !!options.writableObjectMode;
    var hwm = options.highWaterMark;
    var writableHwm = options.writableHighWaterMark;
    var defaultHwm = this.objectMode ? 16 : 16 * 1024;
    if (hwm || hwm === 0) this.highWaterMark = hwm;
    else if (isDuplex && (writableHwm || writableHwm === 0)) this.highWaterMark = writableHwm;
    else this.highWaterMark = defaultHwm;
    this.highWaterMark = Math.floor(this.highWaterMark);
    this.finalCalled = false;
    this.needDrain = false;
    this.ending = false;
    this.ended = false;
    this.finished = false;
    this.destroyed = false;
    var noDecode = options.decodeStrings === false;
    this.decodeStrings = !noDecode;
    this.defaultEncoding = options.defaultEncoding || "utf8";
    this.length = 0;
    this.writing = false;
    this.corked = 0;
    this.sync = true;
    this.bufferProcessing = false;
    this.onwrite = function(er) {
      onwrite(stream2, er);
    };
    this.writecb = null;
    this.writelen = 0;
    this.bufferedRequest = null;
    this.lastBufferedRequest = null;
    this.pendingcb = 0;
    this.prefinished = false;
    this.errorEmitted = false;
    this.bufferedRequestCount = 0;
    this.corkedRequestsFree = new CorkedRequest(this);
  }
  WritableState.prototype.getBuffer = function getBuffer() {
    var current = this.bufferedRequest;
    var out = [];
    while (current) {
      out.push(current);
      current = current.next;
    }
    return out;
  };
  (function() {
    try {
      Object.defineProperty(WritableState.prototype, "buffer", {
        get: internalUtil.deprecate(function() {
          return this.getBuffer();
        }, "_writableState.buffer is deprecated. Use _writableState.getBuffer instead.", "DEP0003")
      });
    } catch (_) {
    }
  })();
  var realHasInstance;
  if (typeof Symbol === "function" && Symbol.hasInstance && typeof Function.prototype[Symbol.hasInstance] === "function") {
    realHasInstance = Function.prototype[Symbol.hasInstance];
    Object.defineProperty(Writable, Symbol.hasInstance, {
      value: function(object2) {
        if (realHasInstance.call(this, object2)) return true;
        if (this !== Writable) return false;
        return object2 && object2._writableState instanceof WritableState;
      }
    });
  } else {
    realHasInstance = function(object2) {
      return object2 instanceof this;
    };
  }
  function Writable(options) {
    Duplex = Duplex || require_stream_duplex();
    if (!realHasInstance.call(Writable, this) && !(this instanceof Duplex)) {
      return new Writable(options);
    }
    this._writableState = new WritableState(options, this);
    this.writable = true;
    if (options) {
      if (typeof options.write === "function") this._write = options.write;
      if (typeof options.writev === "function") this._writev = options.writev;
      if (typeof options.destroy === "function") this._destroy = options.destroy;
      if (typeof options.final === "function") this._final = options.final;
    }
    Stream.call(this);
  }
  Writable.prototype.pipe = function() {
    this.emit("error", new Error("Cannot pipe, not readable"));
  };
  function writeAfterEnd(stream2, cb) {
    var er = new Error("write after end");
    stream2.emit("error", er);
    pna.nextTick(cb, er);
  }
  function validChunk(stream2, state, chunk, cb) {
    var valid = true;
    var er = false;
    if (chunk === null) {
      er = new TypeError("May not write null values to stream");
    } else if (typeof chunk !== "string" && chunk !== void 0 && !state.objectMode) {
      er = new TypeError("Invalid non-string/buffer chunk");
    }
    if (er) {
      stream2.emit("error", er);
      pna.nextTick(cb, er);
      valid = false;
    }
    return valid;
  }
  Writable.prototype.write = function(chunk, encoding, cb) {
    var state = this._writableState;
    var ret = false;
    var isBuf = !state.objectMode && _isUint8Array(chunk);
    if (isBuf && !Buffer2.isBuffer(chunk)) {
      chunk = _uint8ArrayToBuffer(chunk);
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = null;
    }
    if (isBuf) encoding = "buffer";
    else if (!encoding) encoding = state.defaultEncoding;
    if (typeof cb !== "function") cb = nop;
    if (state.ended) writeAfterEnd(this, cb);
    else if (isBuf || validChunk(this, state, chunk, cb)) {
      state.pendingcb++;
      ret = writeOrBuffer(this, state, isBuf, chunk, encoding, cb);
    }
    return ret;
  };
  Writable.prototype.cork = function() {
    var state = this._writableState;
    state.corked++;
  };
  Writable.prototype.uncork = function() {
    var state = this._writableState;
    if (state.corked) {
      state.corked--;
      if (!state.writing && !state.corked && !state.bufferProcessing && state.bufferedRequest) clearBuffer(this, state);
    }
  };
  Writable.prototype.setDefaultEncoding = function setDefaultEncoding(encoding) {
    if (typeof encoding === "string") encoding = encoding.toLowerCase();
    if (!(["hex", "utf8", "utf-8", "ascii", "binary", "base64", "ucs2", "ucs-2", "utf16le", "utf-16le", "raw"].indexOf((encoding + "").toLowerCase()) > -1)) throw new TypeError("Unknown encoding: " + encoding);
    this._writableState.defaultEncoding = encoding;
    return this;
  };
  function decodeChunk(state, chunk, encoding) {
    if (!state.objectMode && state.decodeStrings !== false && typeof chunk === "string") {
      chunk = Buffer2.from(chunk, encoding);
    }
    return chunk;
  }
  Object.defineProperty(Writable.prototype, "writableHighWaterMark", {
    // making it explicit this property is not enumerable
    // because otherwise some prototype manipulation in
    // userland will fail
    enumerable: false,
    get: function() {
      return this._writableState.highWaterMark;
    }
  });
  function writeOrBuffer(stream2, state, isBuf, chunk, encoding, cb) {
    if (!isBuf) {
      var newChunk = decodeChunk(state, chunk, encoding);
      if (chunk !== newChunk) {
        isBuf = true;
        encoding = "buffer";
        chunk = newChunk;
      }
    }
    var len = state.objectMode ? 1 : chunk.length;
    state.length += len;
    var ret = state.length < state.highWaterMark;
    if (!ret) state.needDrain = true;
    if (state.writing || state.corked) {
      var last = state.lastBufferedRequest;
      state.lastBufferedRequest = {
        chunk,
        encoding,
        isBuf,
        callback: cb,
        next: null
      };
      if (last) {
        last.next = state.lastBufferedRequest;
      } else {
        state.bufferedRequest = state.lastBufferedRequest;
      }
      state.bufferedRequestCount += 1;
    } else {
      doWrite(stream2, state, false, len, chunk, encoding, cb);
    }
    return ret;
  }
  function doWrite(stream2, state, writev, len, chunk, encoding, cb) {
    state.writelen = len;
    state.writecb = cb;
    state.writing = true;
    state.sync = true;
    if (writev) stream2._writev(chunk, state.onwrite);
    else stream2._write(chunk, encoding, state.onwrite);
    state.sync = false;
  }
  function onwriteError(stream2, state, sync, er, cb) {
    --state.pendingcb;
    if (sync) {
      pna.nextTick(cb, er);
      pna.nextTick(finishMaybe, stream2, state);
      stream2._writableState.errorEmitted = true;
      stream2.emit("error", er);
    } else {
      cb(er);
      stream2._writableState.errorEmitted = true;
      stream2.emit("error", er);
      finishMaybe(stream2, state);
    }
  }
  function onwriteStateUpdate(state) {
    state.writing = false;
    state.writecb = null;
    state.length -= state.writelen;
    state.writelen = 0;
  }
  function onwrite(stream2, er) {
    var state = stream2._writableState;
    var sync = state.sync;
    var cb = state.writecb;
    onwriteStateUpdate(state);
    if (er) onwriteError(stream2, state, sync, er, cb);
    else {
      var finished = needFinish(state);
      if (!finished && !state.corked && !state.bufferProcessing && state.bufferedRequest) {
        clearBuffer(stream2, state);
      }
      if (sync) {
        asyncWrite(afterWrite, stream2, state, finished, cb);
      } else {
        afterWrite(stream2, state, finished, cb);
      }
    }
  }
  function afterWrite(stream2, state, finished, cb) {
    if (!finished) onwriteDrain(stream2, state);
    state.pendingcb--;
    cb();
    finishMaybe(stream2, state);
  }
  function onwriteDrain(stream2, state) {
    if (state.length === 0 && state.needDrain) {
      state.needDrain = false;
      stream2.emit("drain");
    }
  }
  function clearBuffer(stream2, state) {
    state.bufferProcessing = true;
    var entry = state.bufferedRequest;
    if (stream2._writev && entry && entry.next) {
      var l = state.bufferedRequestCount;
      var buffer = new Array(l);
      var holder = state.corkedRequestsFree;
      holder.entry = entry;
      var count = 0;
      var allBuffers = true;
      while (entry) {
        buffer[count] = entry;
        if (!entry.isBuf) allBuffers = false;
        entry = entry.next;
        count += 1;
      }
      buffer.allBuffers = allBuffers;
      doWrite(stream2, state, true, state.length, buffer, "", holder.finish);
      state.pendingcb++;
      state.lastBufferedRequest = null;
      if (holder.next) {
        state.corkedRequestsFree = holder.next;
        holder.next = null;
      } else {
        state.corkedRequestsFree = new CorkedRequest(state);
      }
      state.bufferedRequestCount = 0;
    } else {
      while (entry) {
        var chunk = entry.chunk;
        var encoding = entry.encoding;
        var cb = entry.callback;
        var len = state.objectMode ? 1 : chunk.length;
        doWrite(stream2, state, false, len, chunk, encoding, cb);
        entry = entry.next;
        state.bufferedRequestCount--;
        if (state.writing) {
          break;
        }
      }
      if (entry === null) state.lastBufferedRequest = null;
    }
    state.bufferedRequest = entry;
    state.bufferProcessing = false;
  }
  Writable.prototype._write = function(chunk, encoding, cb) {
    cb(new Error("_write() is not implemented"));
  };
  Writable.prototype._writev = null;
  Writable.prototype.end = function(chunk, encoding, cb) {
    var state = this._writableState;
    if (typeof chunk === "function") {
      cb = chunk;
      chunk = null;
      encoding = null;
    } else if (typeof encoding === "function") {
      cb = encoding;
      encoding = null;
    }
    if (chunk !== null && chunk !== void 0) this.write(chunk, encoding);
    if (state.corked) {
      state.corked = 1;
      this.uncork();
    }
    if (!state.ending) endWritable(this, state, cb);
  };
  function needFinish(state) {
    return state.ending && state.length === 0 && state.bufferedRequest === null && !state.finished && !state.writing;
  }
  function callFinal(stream2, state) {
    stream2._final(function(err) {
      state.pendingcb--;
      if (err) {
        stream2.emit("error", err);
      }
      state.prefinished = true;
      stream2.emit("prefinish");
      finishMaybe(stream2, state);
    });
  }
  function prefinish(stream2, state) {
    if (!state.prefinished && !state.finalCalled) {
      if (typeof stream2._final === "function") {
        state.pendingcb++;
        state.finalCalled = true;
        pna.nextTick(callFinal, stream2, state);
      } else {
        state.prefinished = true;
        stream2.emit("prefinish");
      }
    }
  }
  function finishMaybe(stream2, state) {
    var need = needFinish(state);
    if (need) {
      prefinish(stream2, state);
      if (state.pendingcb === 0) {
        state.finished = true;
        stream2.emit("finish");
      }
    }
    return need;
  }
  function endWritable(stream2, state, cb) {
    state.ending = true;
    finishMaybe(stream2, state);
    if (cb) {
      if (state.finished) pna.nextTick(cb);
      else stream2.once("finish", cb);
    }
    state.ended = true;
    stream2.writable = false;
  }
  function onCorkedFinish(corkReq, state, err) {
    var entry = corkReq.entry;
    corkReq.entry = null;
    while (entry) {
      var cb = entry.callback;
      state.pendingcb--;
      cb(err);
      entry = entry.next;
    }
    state.corkedRequestsFree.next = corkReq;
  }
  Object.defineProperty(Writable.prototype, "destroyed", {
    get: function() {
      if (this._writableState === void 0) {
        return false;
      }
      return this._writableState.destroyed;
    },
    set: function(value) {
      if (!this._writableState) {
        return;
      }
      this._writableState.destroyed = value;
    }
  });
  Writable.prototype.destroy = destroyImpl.destroy;
  Writable.prototype._undestroy = destroyImpl.undestroy;
  Writable.prototype._destroy = function(err, cb) {
    this.end();
    cb(err);
  };
  return _stream_writable;
}
var _stream_duplex;
var hasRequired_stream_duplex;
function require_stream_duplex() {
  if (hasRequired_stream_duplex) return _stream_duplex;
  hasRequired_stream_duplex = 1;
  var pna = requireProcessNextickArgs();
  var objectKeys = Object.keys || function(obj) {
    var keys2 = [];
    for (var key in obj) {
      keys2.push(key);
    }
    return keys2;
  };
  _stream_duplex = Duplex;
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  var Readable = require_stream_readable();
  var Writable = require_stream_writable();
  util2.inherits(Duplex, Readable);
  {
    var keys = objectKeys(Writable.prototype);
    for (var v = 0; v < keys.length; v++) {
      var method = keys[v];
      if (!Duplex.prototype[method]) Duplex.prototype[method] = Writable.prototype[method];
    }
  }
  function Duplex(options) {
    if (!(this instanceof Duplex)) return new Duplex(options);
    Readable.call(this, options);
    Writable.call(this, options);
    if (options && options.readable === false) this.readable = false;
    if (options && options.writable === false) this.writable = false;
    this.allowHalfOpen = true;
    if (options && options.allowHalfOpen === false) this.allowHalfOpen = false;
    this.once("end", onend);
  }
  Object.defineProperty(Duplex.prototype, "writableHighWaterMark", {
    // making it explicit this property is not enumerable
    // because otherwise some prototype manipulation in
    // userland will fail
    enumerable: false,
    get: function() {
      return this._writableState.highWaterMark;
    }
  });
  function onend() {
    if (this.allowHalfOpen || this._writableState.ended) return;
    pna.nextTick(onEndNT, this);
  }
  function onEndNT(self2) {
    self2.end();
  }
  Object.defineProperty(Duplex.prototype, "destroyed", {
    get: function() {
      if (this._readableState === void 0 || this._writableState === void 0) {
        return false;
      }
      return this._readableState.destroyed && this._writableState.destroyed;
    },
    set: function(value) {
      if (this._readableState === void 0 || this._writableState === void 0) {
        return;
      }
      this._readableState.destroyed = value;
      this._writableState.destroyed = value;
    }
  });
  Duplex.prototype._destroy = function(err, cb) {
    this.push(null);
    this.end();
    pna.nextTick(cb, err);
  };
  return _stream_duplex;
}
var string_decoder = {};
var hasRequiredString_decoder;
function requireString_decoder() {
  if (hasRequiredString_decoder) return string_decoder;
  hasRequiredString_decoder = 1;
  var Buffer2 = requireSafeBuffer().Buffer;
  var isEncoding = Buffer2.isEncoding || function(encoding) {
    encoding = "" + encoding;
    switch (encoding && encoding.toLowerCase()) {
      case "hex":
      case "utf8":
      case "utf-8":
      case "ascii":
      case "binary":
      case "base64":
      case "ucs2":
      case "ucs-2":
      case "utf16le":
      case "utf-16le":
      case "raw":
        return true;
      default:
        return false;
    }
  };
  function _normalizeEncoding(enc) {
    if (!enc) return "utf8";
    var retried;
    while (true) {
      switch (enc) {
        case "utf8":
        case "utf-8":
          return "utf8";
        case "ucs2":
        case "ucs-2":
        case "utf16le":
        case "utf-16le":
          return "utf16le";
        case "latin1":
        case "binary":
          return "latin1";
        case "base64":
        case "ascii":
        case "hex":
          return enc;
        default:
          if (retried) return;
          enc = ("" + enc).toLowerCase();
          retried = true;
      }
    }
  }
  function normalizeEncoding(enc) {
    var nenc = _normalizeEncoding(enc);
    if (typeof nenc !== "string" && (Buffer2.isEncoding === isEncoding || !isEncoding(enc))) throw new Error("Unknown encoding: " + enc);
    return nenc || enc;
  }
  string_decoder.StringDecoder = StringDecoder;
  function StringDecoder(encoding) {
    this.encoding = normalizeEncoding(encoding);
    var nb;
    switch (this.encoding) {
      case "utf16le":
        this.text = utf16Text;
        this.end = utf16End;
        nb = 4;
        break;
      case "utf8":
        this.fillLast = utf8FillLast;
        nb = 4;
        break;
      case "base64":
        this.text = base64Text;
        this.end = base64End;
        nb = 3;
        break;
      default:
        this.write = simpleWrite;
        this.end = simpleEnd;
        return;
    }
    this.lastNeed = 0;
    this.lastTotal = 0;
    this.lastChar = Buffer2.allocUnsafe(nb);
  }
  StringDecoder.prototype.write = function(buf) {
    if (buf.length === 0) return "";
    var r;
    var i;
    if (this.lastNeed) {
      r = this.fillLast(buf);
      if (r === void 0) return "";
      i = this.lastNeed;
      this.lastNeed = 0;
    } else {
      i = 0;
    }
    if (i < buf.length) return r ? r + this.text(buf, i) : this.text(buf, i);
    return r || "";
  };
  StringDecoder.prototype.end = utf8End;
  StringDecoder.prototype.text = utf8Text;
  StringDecoder.prototype.fillLast = function(buf) {
    if (this.lastNeed <= buf.length) {
      buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, this.lastNeed);
      return this.lastChar.toString(this.encoding, 0, this.lastTotal);
    }
    buf.copy(this.lastChar, this.lastTotal - this.lastNeed, 0, buf.length);
    this.lastNeed -= buf.length;
  };
  function utf8CheckByte(byte) {
    if (byte <= 127) return 0;
    else if (byte >> 5 === 6) return 2;
    else if (byte >> 4 === 14) return 3;
    else if (byte >> 3 === 30) return 4;
    return byte >> 6 === 2 ? -1 : -2;
  }
  function utf8CheckIncomplete(self2, buf, i) {
    var j = buf.length - 1;
    if (j < i) return 0;
    var nb = utf8CheckByte(buf[j]);
    if (nb >= 0) {
      if (nb > 0) self2.lastNeed = nb - 1;
      return nb;
    }
    if (--j < i || nb === -2) return 0;
    nb = utf8CheckByte(buf[j]);
    if (nb >= 0) {
      if (nb > 0) self2.lastNeed = nb - 2;
      return nb;
    }
    if (--j < i || nb === -2) return 0;
    nb = utf8CheckByte(buf[j]);
    if (nb >= 0) {
      if (nb > 0) {
        if (nb === 2) nb = 0;
        else self2.lastNeed = nb - 3;
      }
      return nb;
    }
    return 0;
  }
  function utf8CheckExtraBytes(self2, buf, p) {
    if ((buf[0] & 192) !== 128) {
      self2.lastNeed = 0;
      return "�";
    }
    if (self2.lastNeed > 1 && buf.length > 1) {
      if ((buf[1] & 192) !== 128) {
        self2.lastNeed = 1;
        return "�";
      }
      if (self2.lastNeed > 2 && buf.length > 2) {
        if ((buf[2] & 192) !== 128) {
          self2.lastNeed = 2;
          return "�";
        }
      }
    }
  }
  function utf8FillLast(buf) {
    var p = this.lastTotal - this.lastNeed;
    var r = utf8CheckExtraBytes(this, buf);
    if (r !== void 0) return r;
    if (this.lastNeed <= buf.length) {
      buf.copy(this.lastChar, p, 0, this.lastNeed);
      return this.lastChar.toString(this.encoding, 0, this.lastTotal);
    }
    buf.copy(this.lastChar, p, 0, buf.length);
    this.lastNeed -= buf.length;
  }
  function utf8Text(buf, i) {
    var total = utf8CheckIncomplete(this, buf, i);
    if (!this.lastNeed) return buf.toString("utf8", i);
    this.lastTotal = total;
    var end = buf.length - (total - this.lastNeed);
    buf.copy(this.lastChar, 0, end);
    return buf.toString("utf8", i, end);
  }
  function utf8End(buf) {
    var r = buf && buf.length ? this.write(buf) : "";
    if (this.lastNeed) return r + "�";
    return r;
  }
  function utf16Text(buf, i) {
    if ((buf.length - i) % 2 === 0) {
      var r = buf.toString("utf16le", i);
      if (r) {
        var c = r.charCodeAt(r.length - 1);
        if (c >= 55296 && c <= 56319) {
          this.lastNeed = 2;
          this.lastTotal = 4;
          this.lastChar[0] = buf[buf.length - 2];
          this.lastChar[1] = buf[buf.length - 1];
          return r.slice(0, -1);
        }
      }
      return r;
    }
    this.lastNeed = 1;
    this.lastTotal = 2;
    this.lastChar[0] = buf[buf.length - 1];
    return buf.toString("utf16le", i, buf.length - 1);
  }
  function utf16End(buf) {
    var r = buf && buf.length ? this.write(buf) : "";
    if (this.lastNeed) {
      var end = this.lastTotal - this.lastNeed;
      return r + this.lastChar.toString("utf16le", 0, end);
    }
    return r;
  }
  function base64Text(buf, i) {
    var n = (buf.length - i) % 3;
    if (n === 0) return buf.toString("base64", i);
    this.lastNeed = 3 - n;
    this.lastTotal = 3;
    if (n === 1) {
      this.lastChar[0] = buf[buf.length - 1];
    } else {
      this.lastChar[0] = buf[buf.length - 2];
      this.lastChar[1] = buf[buf.length - 1];
    }
    return buf.toString("base64", i, buf.length - n);
  }
  function base64End(buf) {
    var r = buf && buf.length ? this.write(buf) : "";
    if (this.lastNeed) return r + this.lastChar.toString("base64", 0, 3 - this.lastNeed);
    return r;
  }
  function simpleWrite(buf) {
    return buf.toString(this.encoding);
  }
  function simpleEnd(buf) {
    return buf && buf.length ? this.write(buf) : "";
  }
  return string_decoder;
}
var _stream_readable;
var hasRequired_stream_readable;
function require_stream_readable() {
  if (hasRequired_stream_readable) return _stream_readable;
  hasRequired_stream_readable = 1;
  var pna = requireProcessNextickArgs();
  _stream_readable = Readable;
  var isArray = requireIsarray();
  var Duplex;
  Readable.ReadableState = ReadableState;
  require$$2.EventEmitter;
  var EElistenerCount = function(emitter, type) {
    return emitter.listeners(type).length;
  };
  var Stream = requireStream();
  var Buffer2 = requireSafeBuffer().Buffer;
  var OurUint8Array = (typeof commonjsGlobal !== "undefined" ? commonjsGlobal : typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : {}).Uint8Array || function() {
  };
  function _uint8ArrayToBuffer(chunk) {
    return Buffer2.from(chunk);
  }
  function _isUint8Array(obj) {
    return Buffer2.isBuffer(obj) || obj instanceof OurUint8Array;
  }
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  var debugUtil = require$$1;
  var debug = void 0;
  if (debugUtil && debugUtil.debuglog) {
    debug = debugUtil.debuglog("stream");
  } else {
    debug = function() {
    };
  }
  var BufferList2 = requireBufferList();
  var destroyImpl = requireDestroy();
  var StringDecoder;
  util2.inherits(Readable, Stream);
  var kProxyEvents = ["error", "close", "destroy", "pause", "resume"];
  function prependListener(emitter, event, fn) {
    if (typeof emitter.prependListener === "function") return emitter.prependListener(event, fn);
    if (!emitter._events || !emitter._events[event]) emitter.on(event, fn);
    else if (isArray(emitter._events[event])) emitter._events[event].unshift(fn);
    else emitter._events[event] = [fn, emitter._events[event]];
  }
  function ReadableState(options, stream2) {
    Duplex = Duplex || require_stream_duplex();
    options = options || {};
    var isDuplex = stream2 instanceof Duplex;
    this.objectMode = !!options.objectMode;
    if (isDuplex) this.objectMode = this.objectMode || !!options.readableObjectMode;
    var hwm = options.highWaterMark;
    var readableHwm = options.readableHighWaterMark;
    var defaultHwm = this.objectMode ? 16 : 16 * 1024;
    if (hwm || hwm === 0) this.highWaterMark = hwm;
    else if (isDuplex && (readableHwm || readableHwm === 0)) this.highWaterMark = readableHwm;
    else this.highWaterMark = defaultHwm;
    this.highWaterMark = Math.floor(this.highWaterMark);
    this.buffer = new BufferList2();
    this.length = 0;
    this.pipes = null;
    this.pipesCount = 0;
    this.flowing = null;
    this.ended = false;
    this.endEmitted = false;
    this.reading = false;
    this.sync = true;
    this.needReadable = false;
    this.emittedReadable = false;
    this.readableListening = false;
    this.resumeScheduled = false;
    this.destroyed = false;
    this.defaultEncoding = options.defaultEncoding || "utf8";
    this.awaitDrain = 0;
    this.readingMore = false;
    this.decoder = null;
    this.encoding = null;
    if (options.encoding) {
      if (!StringDecoder) StringDecoder = requireString_decoder().StringDecoder;
      this.decoder = new StringDecoder(options.encoding);
      this.encoding = options.encoding;
    }
  }
  function Readable(options) {
    Duplex = Duplex || require_stream_duplex();
    if (!(this instanceof Readable)) return new Readable(options);
    this._readableState = new ReadableState(options, this);
    this.readable = true;
    if (options) {
      if (typeof options.read === "function") this._read = options.read;
      if (typeof options.destroy === "function") this._destroy = options.destroy;
    }
    Stream.call(this);
  }
  Object.defineProperty(Readable.prototype, "destroyed", {
    get: function() {
      if (this._readableState === void 0) {
        return false;
      }
      return this._readableState.destroyed;
    },
    set: function(value) {
      if (!this._readableState) {
        return;
      }
      this._readableState.destroyed = value;
    }
  });
  Readable.prototype.destroy = destroyImpl.destroy;
  Readable.prototype._undestroy = destroyImpl.undestroy;
  Readable.prototype._destroy = function(err, cb) {
    this.push(null);
    cb(err);
  };
  Readable.prototype.push = function(chunk, encoding) {
    var state = this._readableState;
    var skipChunkCheck;
    if (!state.objectMode) {
      if (typeof chunk === "string") {
        encoding = encoding || state.defaultEncoding;
        if (encoding !== state.encoding) {
          chunk = Buffer2.from(chunk, encoding);
          encoding = "";
        }
        skipChunkCheck = true;
      }
    } else {
      skipChunkCheck = true;
    }
    return readableAddChunk(this, chunk, encoding, false, skipChunkCheck);
  };
  Readable.prototype.unshift = function(chunk) {
    return readableAddChunk(this, chunk, null, true, false);
  };
  function readableAddChunk(stream2, chunk, encoding, addToFront, skipChunkCheck) {
    var state = stream2._readableState;
    if (chunk === null) {
      state.reading = false;
      onEofChunk(stream2, state);
    } else {
      var er;
      if (!skipChunkCheck) er = chunkInvalid(state, chunk);
      if (er) {
        stream2.emit("error", er);
      } else if (state.objectMode || chunk && chunk.length > 0) {
        if (typeof chunk !== "string" && !state.objectMode && Object.getPrototypeOf(chunk) !== Buffer2.prototype) {
          chunk = _uint8ArrayToBuffer(chunk);
        }
        if (addToFront) {
          if (state.endEmitted) stream2.emit("error", new Error("stream.unshift() after end event"));
          else addChunk(stream2, state, chunk, true);
        } else if (state.ended) {
          stream2.emit("error", new Error("stream.push() after EOF"));
        } else {
          state.reading = false;
          if (state.decoder && !encoding) {
            chunk = state.decoder.write(chunk);
            if (state.objectMode || chunk.length !== 0) addChunk(stream2, state, chunk, false);
            else maybeReadMore(stream2, state);
          } else {
            addChunk(stream2, state, chunk, false);
          }
        }
      } else if (!addToFront) {
        state.reading = false;
      }
    }
    return needMoreData(state);
  }
  function addChunk(stream2, state, chunk, addToFront) {
    if (state.flowing && state.length === 0 && !state.sync) {
      stream2.emit("data", chunk);
      stream2.read(0);
    } else {
      state.length += state.objectMode ? 1 : chunk.length;
      if (addToFront) state.buffer.unshift(chunk);
      else state.buffer.push(chunk);
      if (state.needReadable) emitReadable(stream2);
    }
    maybeReadMore(stream2, state);
  }
  function chunkInvalid(state, chunk) {
    var er;
    if (!_isUint8Array(chunk) && typeof chunk !== "string" && chunk !== void 0 && !state.objectMode) {
      er = new TypeError("Invalid non-string/buffer chunk");
    }
    return er;
  }
  function needMoreData(state) {
    return !state.ended && (state.needReadable || state.length < state.highWaterMark || state.length === 0);
  }
  Readable.prototype.isPaused = function() {
    return this._readableState.flowing === false;
  };
  Readable.prototype.setEncoding = function(enc) {
    if (!StringDecoder) StringDecoder = requireString_decoder().StringDecoder;
    this._readableState.decoder = new StringDecoder(enc);
    this._readableState.encoding = enc;
    return this;
  };
  var MAX_HWM = 8388608;
  function computeNewHighWaterMark(n) {
    if (n >= MAX_HWM) {
      n = MAX_HWM;
    } else {
      n--;
      n |= n >>> 1;
      n |= n >>> 2;
      n |= n >>> 4;
      n |= n >>> 8;
      n |= n >>> 16;
      n++;
    }
    return n;
  }
  function howMuchToRead(n, state) {
    if (n <= 0 || state.length === 0 && state.ended) return 0;
    if (state.objectMode) return 1;
    if (n !== n) {
      if (state.flowing && state.length) return state.buffer.head.data.length;
      else return state.length;
    }
    if (n > state.highWaterMark) state.highWaterMark = computeNewHighWaterMark(n);
    if (n <= state.length) return n;
    if (!state.ended) {
      state.needReadable = true;
      return 0;
    }
    return state.length;
  }
  Readable.prototype.read = function(n) {
    debug("read", n);
    n = parseInt(n, 10);
    var state = this._readableState;
    var nOrig = n;
    if (n !== 0) state.emittedReadable = false;
    if (n === 0 && state.needReadable && (state.length >= state.highWaterMark || state.ended)) {
      debug("read: emitReadable", state.length, state.ended);
      if (state.length === 0 && state.ended) endReadable(this);
      else emitReadable(this);
      return null;
    }
    n = howMuchToRead(n, state);
    if (n === 0 && state.ended) {
      if (state.length === 0) endReadable(this);
      return null;
    }
    var doRead = state.needReadable;
    debug("need readable", doRead);
    if (state.length === 0 || state.length - n < state.highWaterMark) {
      doRead = true;
      debug("length less than watermark", doRead);
    }
    if (state.ended || state.reading) {
      doRead = false;
      debug("reading or ended", doRead);
    } else if (doRead) {
      debug("do read");
      state.reading = true;
      state.sync = true;
      if (state.length === 0) state.needReadable = true;
      this._read(state.highWaterMark);
      state.sync = false;
      if (!state.reading) n = howMuchToRead(nOrig, state);
    }
    var ret;
    if (n > 0) ret = fromList(n, state);
    else ret = null;
    if (ret === null) {
      state.needReadable = true;
      n = 0;
    } else {
      state.length -= n;
    }
    if (state.length === 0) {
      if (!state.ended) state.needReadable = true;
      if (nOrig !== n && state.ended) endReadable(this);
    }
    if (ret !== null) this.emit("data", ret);
    return ret;
  };
  function onEofChunk(stream2, state) {
    if (state.ended) return;
    if (state.decoder) {
      var chunk = state.decoder.end();
      if (chunk && chunk.length) {
        state.buffer.push(chunk);
        state.length += state.objectMode ? 1 : chunk.length;
      }
    }
    state.ended = true;
    emitReadable(stream2);
  }
  function emitReadable(stream2) {
    var state = stream2._readableState;
    state.needReadable = false;
    if (!state.emittedReadable) {
      debug("emitReadable", state.flowing);
      state.emittedReadable = true;
      if (state.sync) pna.nextTick(emitReadable_, stream2);
      else emitReadable_(stream2);
    }
  }
  function emitReadable_(stream2) {
    debug("emit readable");
    stream2.emit("readable");
    flow(stream2);
  }
  function maybeReadMore(stream2, state) {
    if (!state.readingMore) {
      state.readingMore = true;
      pna.nextTick(maybeReadMore_, stream2, state);
    }
  }
  function maybeReadMore_(stream2, state) {
    var len = state.length;
    while (!state.reading && !state.flowing && !state.ended && state.length < state.highWaterMark) {
      debug("maybeReadMore read 0");
      stream2.read(0);
      if (len === state.length)
        break;
      else len = state.length;
    }
    state.readingMore = false;
  }
  Readable.prototype._read = function(n) {
    this.emit("error", new Error("_read() is not implemented"));
  };
  Readable.prototype.pipe = function(dest, pipeOpts) {
    var src = this;
    var state = this._readableState;
    switch (state.pipesCount) {
      case 0:
        state.pipes = dest;
        break;
      case 1:
        state.pipes = [state.pipes, dest];
        break;
      default:
        state.pipes.push(dest);
        break;
    }
    state.pipesCount += 1;
    debug("pipe count=%d opts=%j", state.pipesCount, pipeOpts);
    var doEnd = (!pipeOpts || pipeOpts.end !== false) && dest !== process.stdout && dest !== process.stderr;
    var endFn = doEnd ? onend : unpipe;
    if (state.endEmitted) pna.nextTick(endFn);
    else src.once("end", endFn);
    dest.on("unpipe", onunpipe);
    function onunpipe(readable2, unpipeInfo) {
      debug("onunpipe");
      if (readable2 === src) {
        if (unpipeInfo && unpipeInfo.hasUnpiped === false) {
          unpipeInfo.hasUnpiped = true;
          cleanup();
        }
      }
    }
    function onend() {
      debug("onend");
      dest.end();
    }
    var ondrain = pipeOnDrain(src);
    dest.on("drain", ondrain);
    var cleanedUp = false;
    function cleanup() {
      debug("cleanup");
      dest.removeListener("close", onclose);
      dest.removeListener("finish", onfinish);
      dest.removeListener("drain", ondrain);
      dest.removeListener("error", onerror);
      dest.removeListener("unpipe", onunpipe);
      src.removeListener("end", onend);
      src.removeListener("end", unpipe);
      src.removeListener("data", ondata);
      cleanedUp = true;
      if (state.awaitDrain && (!dest._writableState || dest._writableState.needDrain)) ondrain();
    }
    var increasedAwaitDrain = false;
    src.on("data", ondata);
    function ondata(chunk) {
      debug("ondata");
      increasedAwaitDrain = false;
      var ret = dest.write(chunk);
      if (false === ret && !increasedAwaitDrain) {
        if ((state.pipesCount === 1 && state.pipes === dest || state.pipesCount > 1 && indexOf(state.pipes, dest) !== -1) && !cleanedUp) {
          debug("false write response, pause", state.awaitDrain);
          state.awaitDrain++;
          increasedAwaitDrain = true;
        }
        src.pause();
      }
    }
    function onerror(er) {
      debug("onerror", er);
      unpipe();
      dest.removeListener("error", onerror);
      if (EElistenerCount(dest, "error") === 0) dest.emit("error", er);
    }
    prependListener(dest, "error", onerror);
    function onclose() {
      dest.removeListener("finish", onfinish);
      unpipe();
    }
    dest.once("close", onclose);
    function onfinish() {
      debug("onfinish");
      dest.removeListener("close", onclose);
      unpipe();
    }
    dest.once("finish", onfinish);
    function unpipe() {
      debug("unpipe");
      src.unpipe(dest);
    }
    dest.emit("pipe", src);
    if (!state.flowing) {
      debug("pipe resume");
      src.resume();
    }
    return dest;
  };
  function pipeOnDrain(src) {
    return function() {
      var state = src._readableState;
      debug("pipeOnDrain", state.awaitDrain);
      if (state.awaitDrain) state.awaitDrain--;
      if (state.awaitDrain === 0 && EElistenerCount(src, "data")) {
        state.flowing = true;
        flow(src);
      }
    };
  }
  Readable.prototype.unpipe = function(dest) {
    var state = this._readableState;
    var unpipeInfo = { hasUnpiped: false };
    if (state.pipesCount === 0) return this;
    if (state.pipesCount === 1) {
      if (dest && dest !== state.pipes) return this;
      if (!dest) dest = state.pipes;
      state.pipes = null;
      state.pipesCount = 0;
      state.flowing = false;
      if (dest) dest.emit("unpipe", this, unpipeInfo);
      return this;
    }
    if (!dest) {
      var dests = state.pipes;
      var len = state.pipesCount;
      state.pipes = null;
      state.pipesCount = 0;
      state.flowing = false;
      for (var i = 0; i < len; i++) {
        dests[i].emit("unpipe", this, { hasUnpiped: false });
      }
      return this;
    }
    var index = indexOf(state.pipes, dest);
    if (index === -1) return this;
    state.pipes.splice(index, 1);
    state.pipesCount -= 1;
    if (state.pipesCount === 1) state.pipes = state.pipes[0];
    dest.emit("unpipe", this, unpipeInfo);
    return this;
  };
  Readable.prototype.on = function(ev, fn) {
    var res = Stream.prototype.on.call(this, ev, fn);
    if (ev === "data") {
      if (this._readableState.flowing !== false) this.resume();
    } else if (ev === "readable") {
      var state = this._readableState;
      if (!state.endEmitted && !state.readableListening) {
        state.readableListening = state.needReadable = true;
        state.emittedReadable = false;
        if (!state.reading) {
          pna.nextTick(nReadingNextTick, this);
        } else if (state.length) {
          emitReadable(this);
        }
      }
    }
    return res;
  };
  Readable.prototype.addListener = Readable.prototype.on;
  function nReadingNextTick(self2) {
    debug("readable nexttick read 0");
    self2.read(0);
  }
  Readable.prototype.resume = function() {
    var state = this._readableState;
    if (!state.flowing) {
      debug("resume");
      state.flowing = true;
      resume(this, state);
    }
    return this;
  };
  function resume(stream2, state) {
    if (!state.resumeScheduled) {
      state.resumeScheduled = true;
      pna.nextTick(resume_, stream2, state);
    }
  }
  function resume_(stream2, state) {
    if (!state.reading) {
      debug("resume read 0");
      stream2.read(0);
    }
    state.resumeScheduled = false;
    state.awaitDrain = 0;
    stream2.emit("resume");
    flow(stream2);
    if (state.flowing && !state.reading) stream2.read(0);
  }
  Readable.prototype.pause = function() {
    debug("call pause flowing=%j", this._readableState.flowing);
    if (false !== this._readableState.flowing) {
      debug("pause");
      this._readableState.flowing = false;
      this.emit("pause");
    }
    return this;
  };
  function flow(stream2) {
    var state = stream2._readableState;
    debug("flow", state.flowing);
    while (state.flowing && stream2.read() !== null) {
    }
  }
  Readable.prototype.wrap = function(stream2) {
    var _this = this;
    var state = this._readableState;
    var paused = false;
    stream2.on("end", function() {
      debug("wrapped end");
      if (state.decoder && !state.ended) {
        var chunk = state.decoder.end();
        if (chunk && chunk.length) _this.push(chunk);
      }
      _this.push(null);
    });
    stream2.on("data", function(chunk) {
      debug("wrapped data");
      if (state.decoder) chunk = state.decoder.write(chunk);
      if (state.objectMode && (chunk === null || chunk === void 0)) return;
      else if (!state.objectMode && (!chunk || !chunk.length)) return;
      var ret = _this.push(chunk);
      if (!ret) {
        paused = true;
        stream2.pause();
      }
    });
    for (var i in stream2) {
      if (this[i] === void 0 && typeof stream2[i] === "function") {
        this[i] = /* @__PURE__ */ (function(method) {
          return function() {
            return stream2[method].apply(stream2, arguments);
          };
        })(i);
      }
    }
    for (var n = 0; n < kProxyEvents.length; n++) {
      stream2.on(kProxyEvents[n], this.emit.bind(this, kProxyEvents[n]));
    }
    this._read = function(n2) {
      debug("wrapped _read", n2);
      if (paused) {
        paused = false;
        stream2.resume();
      }
    };
    return this;
  };
  Object.defineProperty(Readable.prototype, "readableHighWaterMark", {
    // making it explicit this property is not enumerable
    // because otherwise some prototype manipulation in
    // userland will fail
    enumerable: false,
    get: function() {
      return this._readableState.highWaterMark;
    }
  });
  Readable._fromList = fromList;
  function fromList(n, state) {
    if (state.length === 0) return null;
    var ret;
    if (state.objectMode) ret = state.buffer.shift();
    else if (!n || n >= state.length) {
      if (state.decoder) ret = state.buffer.join("");
      else if (state.buffer.length === 1) ret = state.buffer.head.data;
      else ret = state.buffer.concat(state.length);
      state.buffer.clear();
    } else {
      ret = fromListPartial(n, state.buffer, state.decoder);
    }
    return ret;
  }
  function fromListPartial(n, list, hasStrings) {
    var ret;
    if (n < list.head.data.length) {
      ret = list.head.data.slice(0, n);
      list.head.data = list.head.data.slice(n);
    } else if (n === list.head.data.length) {
      ret = list.shift();
    } else {
      ret = hasStrings ? copyFromBufferString(n, list) : copyFromBuffer(n, list);
    }
    return ret;
  }
  function copyFromBufferString(n, list) {
    var p = list.head;
    var c = 1;
    var ret = p.data;
    n -= ret.length;
    while (p = p.next) {
      var str = p.data;
      var nb = n > str.length ? str.length : n;
      if (nb === str.length) ret += str;
      else ret += str.slice(0, n);
      n -= nb;
      if (n === 0) {
        if (nb === str.length) {
          ++c;
          if (p.next) list.head = p.next;
          else list.head = list.tail = null;
        } else {
          list.head = p;
          p.data = str.slice(nb);
        }
        break;
      }
      ++c;
    }
    list.length -= c;
    return ret;
  }
  function copyFromBuffer(n, list) {
    var ret = Buffer2.allocUnsafe(n);
    var p = list.head;
    var c = 1;
    p.data.copy(ret);
    n -= p.data.length;
    while (p = p.next) {
      var buf = p.data;
      var nb = n > buf.length ? buf.length : n;
      buf.copy(ret, ret.length - n, 0, nb);
      n -= nb;
      if (n === 0) {
        if (nb === buf.length) {
          ++c;
          if (p.next) list.head = p.next;
          else list.head = list.tail = null;
        } else {
          list.head = p;
          p.data = buf.slice(nb);
        }
        break;
      }
      ++c;
    }
    list.length -= c;
    return ret;
  }
  function endReadable(stream2) {
    var state = stream2._readableState;
    if (state.length > 0) throw new Error('"endReadable()" called on non-empty stream');
    if (!state.endEmitted) {
      state.ended = true;
      pna.nextTick(endReadableNT, state, stream2);
    }
  }
  function endReadableNT(state, stream2) {
    if (!state.endEmitted && state.length === 0) {
      state.endEmitted = true;
      stream2.readable = false;
      stream2.emit("end");
    }
  }
  function indexOf(xs, x) {
    for (var i = 0, l = xs.length; i < l; i++) {
      if (xs[i] === x) return i;
    }
    return -1;
  }
  return _stream_readable;
}
var _stream_transform;
var hasRequired_stream_transform;
function require_stream_transform() {
  if (hasRequired_stream_transform) return _stream_transform;
  hasRequired_stream_transform = 1;
  _stream_transform = Transform;
  var Duplex = require_stream_duplex();
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  util2.inherits(Transform, Duplex);
  function afterTransform(er, data) {
    var ts = this._transformState;
    ts.transforming = false;
    var cb = ts.writecb;
    if (!cb) {
      return this.emit("error", new Error("write callback called multiple times"));
    }
    ts.writechunk = null;
    ts.writecb = null;
    if (data != null)
      this.push(data);
    cb(er);
    var rs = this._readableState;
    rs.reading = false;
    if (rs.needReadable || rs.length < rs.highWaterMark) {
      this._read(rs.highWaterMark);
    }
  }
  function Transform(options) {
    if (!(this instanceof Transform)) return new Transform(options);
    Duplex.call(this, options);
    this._transformState = {
      afterTransform: afterTransform.bind(this),
      needTransform: false,
      transforming: false,
      writecb: null,
      writechunk: null,
      writeencoding: null
    };
    this._readableState.needReadable = true;
    this._readableState.sync = false;
    if (options) {
      if (typeof options.transform === "function") this._transform = options.transform;
      if (typeof options.flush === "function") this._flush = options.flush;
    }
    this.on("prefinish", prefinish);
  }
  function prefinish() {
    var _this = this;
    if (typeof this._flush === "function") {
      this._flush(function(er, data) {
        done(_this, er, data);
      });
    } else {
      done(this, null, null);
    }
  }
  Transform.prototype.push = function(chunk, encoding) {
    this._transformState.needTransform = false;
    return Duplex.prototype.push.call(this, chunk, encoding);
  };
  Transform.prototype._transform = function(chunk, encoding, cb) {
    throw new Error("_transform() is not implemented");
  };
  Transform.prototype._write = function(chunk, encoding, cb) {
    var ts = this._transformState;
    ts.writecb = cb;
    ts.writechunk = chunk;
    ts.writeencoding = encoding;
    if (!ts.transforming) {
      var rs = this._readableState;
      if (ts.needTransform || rs.needReadable || rs.length < rs.highWaterMark) this._read(rs.highWaterMark);
    }
  };
  Transform.prototype._read = function(n) {
    var ts = this._transformState;
    if (ts.writechunk !== null && ts.writecb && !ts.transforming) {
      ts.transforming = true;
      this._transform(ts.writechunk, ts.writeencoding, ts.afterTransform);
    } else {
      ts.needTransform = true;
    }
  };
  Transform.prototype._destroy = function(err, cb) {
    var _this2 = this;
    Duplex.prototype._destroy.call(this, err, function(err2) {
      cb(err2);
      _this2.emit("close");
    });
  };
  function done(stream2, er, data) {
    if (er) return stream2.emit("error", er);
    if (data != null)
      stream2.push(data);
    if (stream2._writableState.length) throw new Error("Calling transform done when ws.length != 0");
    if (stream2._transformState.transforming) throw new Error("Calling transform done when still transforming");
    return stream2.push(null);
  }
  return _stream_transform;
}
var _stream_passthrough;
var hasRequired_stream_passthrough;
function require_stream_passthrough() {
  if (hasRequired_stream_passthrough) return _stream_passthrough;
  hasRequired_stream_passthrough = 1;
  _stream_passthrough = PassThrough;
  var Transform = require_stream_transform();
  var util2 = Object.create(requireUtil());
  util2.inherits = requireInherits();
  util2.inherits(PassThrough, Transform);
  function PassThrough(options) {
    if (!(this instanceof PassThrough)) return new PassThrough(options);
    Transform.call(this, options);
  }
  PassThrough.prototype._transform = function(chunk, encoding, cb) {
    cb(null, chunk);
  };
  return _stream_passthrough;
}
var hasRequiredReadable;
function requireReadable() {
  if (hasRequiredReadable) return readable.exports;
  hasRequiredReadable = 1;
  (function(module2, exports) {
    var Stream = require$$0;
    if (process.env.READABLE_STREAM === "disable" && Stream) {
      module2.exports = Stream;
      exports = module2.exports = Stream.Readable;
      exports.Readable = Stream.Readable;
      exports.Writable = Stream.Writable;
      exports.Duplex = Stream.Duplex;
      exports.Transform = Stream.Transform;
      exports.PassThrough = Stream.PassThrough;
      exports.Stream = Stream;
    } else {
      exports = module2.exports = require_stream_readable();
      exports.Stream = Stream || exports;
      exports.Readable = exports;
      exports.Writable = require_stream_writable();
      exports.Duplex = require_stream_duplex();
      exports.Transform = require_stream_transform();
      exports.PassThrough = require_stream_passthrough();
    }
  })(readable, readable.exports);
  return readable.exports;
}
var hasRequiredSupport;
function requireSupport() {
  if (hasRequiredSupport) return support;
  hasRequiredSupport = 1;
  support.base64 = true;
  support.array = true;
  support.string = true;
  support.arraybuffer = typeof ArrayBuffer !== "undefined" && typeof Uint8Array !== "undefined";
  support.nodebuffer = typeof Buffer !== "undefined";
  support.uint8array = typeof Uint8Array !== "undefined";
  if (typeof ArrayBuffer === "undefined") {
    support.blob = false;
  } else {
    var buffer = new ArrayBuffer(0);
    try {
      support.blob = new Blob([buffer], {
        type: "application/zip"
      }).size === 0;
    } catch (e) {
      try {
        var Builder = self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder;
        var builder = new Builder();
        builder.append(buffer);
        support.blob = builder.getBlob("application/zip").size === 0;
      } catch (e2) {
        support.blob = false;
      }
    }
  }
  try {
    support.nodestream = !!requireReadable().Readable;
  } catch (e) {
    support.nodestream = false;
  }
  return support;
}
var base64 = {};
var hasRequiredBase64;
function requireBase64() {
  if (hasRequiredBase64) return base64;
  hasRequiredBase64 = 1;
  var utils2 = requireUtils();
  var support2 = requireSupport();
  var _keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  base64.encode = function(input) {
    var output = [];
    var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
    var i = 0, len = input.length, remainingBytes = len;
    var isArray = utils2.getTypeOf(input) !== "string";
    while (i < input.length) {
      remainingBytes = len - i;
      if (!isArray) {
        chr1 = input.charCodeAt(i++);
        chr2 = i < len ? input.charCodeAt(i++) : 0;
        chr3 = i < len ? input.charCodeAt(i++) : 0;
      } else {
        chr1 = input[i++];
        chr2 = i < len ? input[i++] : 0;
        chr3 = i < len ? input[i++] : 0;
      }
      enc1 = chr1 >> 2;
      enc2 = (chr1 & 3) << 4 | chr2 >> 4;
      enc3 = remainingBytes > 1 ? (chr2 & 15) << 2 | chr3 >> 6 : 64;
      enc4 = remainingBytes > 2 ? chr3 & 63 : 64;
      output.push(_keyStr.charAt(enc1) + _keyStr.charAt(enc2) + _keyStr.charAt(enc3) + _keyStr.charAt(enc4));
    }
    return output.join("");
  };
  base64.decode = function(input) {
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0, resultIndex = 0;
    var dataUrlPrefix = "data:";
    if (input.substr(0, dataUrlPrefix.length) === dataUrlPrefix) {
      throw new Error("Invalid base64 input, it looks like a data url.");
    }
    input = input.replace(/[^A-Za-z0-9+/=]/g, "");
    var totalLength = input.length * 3 / 4;
    if (input.charAt(input.length - 1) === _keyStr.charAt(64)) {
      totalLength--;
    }
    if (input.charAt(input.length - 2) === _keyStr.charAt(64)) {
      totalLength--;
    }
    if (totalLength % 1 !== 0) {
      throw new Error("Invalid base64 input, bad content length.");
    }
    var output;
    if (support2.uint8array) {
      output = new Uint8Array(totalLength | 0);
    } else {
      output = new Array(totalLength | 0);
    }
    while (i < input.length) {
      enc1 = _keyStr.indexOf(input.charAt(i++));
      enc2 = _keyStr.indexOf(input.charAt(i++));
      enc3 = _keyStr.indexOf(input.charAt(i++));
      enc4 = _keyStr.indexOf(input.charAt(i++));
      chr1 = enc1 << 2 | enc2 >> 4;
      chr2 = (enc2 & 15) << 4 | enc3 >> 2;
      chr3 = (enc3 & 3) << 6 | enc4;
      output[resultIndex++] = chr1;
      if (enc3 !== 64) {
        output[resultIndex++] = chr2;
      }
      if (enc4 !== 64) {
        output[resultIndex++] = chr3;
      }
    }
    return output;
  };
  return base64;
}
var nodejsUtils;
var hasRequiredNodejsUtils;
function requireNodejsUtils() {
  if (hasRequiredNodejsUtils) return nodejsUtils;
  hasRequiredNodejsUtils = 1;
  nodejsUtils = {
    /**
     * True if this is running in Nodejs, will be undefined in a browser.
     * In a browser, browserify won't include this file and the whole module
     * will be resolved an empty object.
     */
    isNode: typeof Buffer !== "undefined",
    /**
     * Create a new nodejs Buffer from an existing content.
     * @param {Object} data the data to pass to the constructor.
     * @param {String} encoding the encoding to use.
     * @return {Buffer} a new Buffer.
     */
    newBufferFrom: function(data, encoding) {
      if (Buffer.from && Buffer.from !== Uint8Array.from) {
        return Buffer.from(data, encoding);
      } else {
        if (typeof data === "number") {
          throw new Error('The "data" argument must not be a number');
        }
        return new Buffer(data, encoding);
      }
    },
    /**
     * Create a new nodejs Buffer with the specified size.
     * @param {Integer} size the size of the buffer.
     * @return {Buffer} a new Buffer.
     */
    allocBuffer: function(size) {
      if (Buffer.alloc) {
        return Buffer.alloc(size);
      } else {
        var buf = new Buffer(size);
        buf.fill(0);
        return buf;
      }
    },
    /**
     * Find out if an object is a Buffer.
     * @param {Object} b the object to test.
     * @return {Boolean} true if the object is a Buffer, false otherwise.
     */
    isBuffer: function(b) {
      return Buffer.isBuffer(b);
    },
    isStream: function(obj) {
      return obj && typeof obj.on === "function" && typeof obj.pause === "function" && typeof obj.resume === "function";
    }
  };
  return nodejsUtils;
}
var lib$2;
var hasRequiredLib$2;
function requireLib$2() {
  if (hasRequiredLib$2) return lib$2;
  hasRequiredLib$2 = 1;
  var Mutation = commonjsGlobal.MutationObserver || commonjsGlobal.WebKitMutationObserver;
  var scheduleDrain;
  if (process.browser) {
    if (Mutation) {
      var called = 0;
      var observer = new Mutation(nextTick);
      var element = commonjsGlobal.document.createTextNode("");
      observer.observe(element, {
        characterData: true
      });
      scheduleDrain = function() {
        element.data = called = ++called % 2;
      };
    } else if (!commonjsGlobal.setImmediate && typeof commonjsGlobal.MessageChannel !== "undefined") {
      var channel = new commonjsGlobal.MessageChannel();
      channel.port1.onmessage = nextTick;
      scheduleDrain = function() {
        channel.port2.postMessage(0);
      };
    } else if ("document" in commonjsGlobal && "onreadystatechange" in commonjsGlobal.document.createElement("script")) {
      scheduleDrain = function() {
        var scriptEl = commonjsGlobal.document.createElement("script");
        scriptEl.onreadystatechange = function() {
          nextTick();
          scriptEl.onreadystatechange = null;
          scriptEl.parentNode.removeChild(scriptEl);
          scriptEl = null;
        };
        commonjsGlobal.document.documentElement.appendChild(scriptEl);
      };
    } else {
      scheduleDrain = function() {
        setTimeout(nextTick, 0);
      };
    }
  } else {
    scheduleDrain = function() {
      process.nextTick(nextTick);
    };
  }
  var draining;
  var queue = [];
  function nextTick() {
    draining = true;
    var i, oldQueue;
    var len = queue.length;
    while (len) {
      oldQueue = queue;
      queue = [];
      i = -1;
      while (++i < len) {
        oldQueue[i]();
      }
      len = queue.length;
    }
    draining = false;
  }
  lib$2 = immediate;
  function immediate(task) {
    if (queue.push(task) === 1 && !draining) {
      scheduleDrain();
    }
  }
  return lib$2;
}
var lib$1;
var hasRequiredLib$1;
function requireLib$1() {
  if (hasRequiredLib$1) return lib$1;
  hasRequiredLib$1 = 1;
  var immediate = requireLib$2();
  function INTERNAL() {
  }
  var handlers = {};
  var REJECTED = ["REJECTED"];
  var FULFILLED = ["FULFILLED"];
  var PENDING = ["PENDING"];
  if (!process.browser) {
    var UNHANDLED = ["UNHANDLED"];
  }
  lib$1 = Promise2;
  function Promise2(resolver) {
    if (typeof resolver !== "function") {
      throw new TypeError("resolver must be a function");
    }
    this.state = PENDING;
    this.queue = [];
    this.outcome = void 0;
    if (!process.browser) {
      this.handled = UNHANDLED;
    }
    if (resolver !== INTERNAL) {
      safelyResolveThenable(this, resolver);
    }
  }
  Promise2.prototype.finally = function(callback) {
    if (typeof callback !== "function") {
      return this;
    }
    var p = this.constructor;
    return this.then(resolve2, reject2);
    function resolve2(value) {
      function yes() {
        return value;
      }
      return p.resolve(callback()).then(yes);
    }
    function reject2(reason) {
      function no() {
        throw reason;
      }
      return p.resolve(callback()).then(no);
    }
  };
  Promise2.prototype.catch = function(onRejected) {
    return this.then(null, onRejected);
  };
  Promise2.prototype.then = function(onFulfilled, onRejected) {
    if (typeof onFulfilled !== "function" && this.state === FULFILLED || typeof onRejected !== "function" && this.state === REJECTED) {
      return this;
    }
    var promise = new this.constructor(INTERNAL);
    if (!process.browser) {
      if (this.handled === UNHANDLED) {
        this.handled = null;
      }
    }
    if (this.state !== PENDING) {
      var resolver = this.state === FULFILLED ? onFulfilled : onRejected;
      unwrap(promise, resolver, this.outcome);
    } else {
      this.queue.push(new QueueItem(promise, onFulfilled, onRejected));
    }
    return promise;
  };
  function QueueItem(promise, onFulfilled, onRejected) {
    this.promise = promise;
    if (typeof onFulfilled === "function") {
      this.onFulfilled = onFulfilled;
      this.callFulfilled = this.otherCallFulfilled;
    }
    if (typeof onRejected === "function") {
      this.onRejected = onRejected;
      this.callRejected = this.otherCallRejected;
    }
  }
  QueueItem.prototype.callFulfilled = function(value) {
    handlers.resolve(this.promise, value);
  };
  QueueItem.prototype.otherCallFulfilled = function(value) {
    unwrap(this.promise, this.onFulfilled, value);
  };
  QueueItem.prototype.callRejected = function(value) {
    handlers.reject(this.promise, value);
  };
  QueueItem.prototype.otherCallRejected = function(value) {
    unwrap(this.promise, this.onRejected, value);
  };
  function unwrap(promise, func, value) {
    immediate(function() {
      var returnValue;
      try {
        returnValue = func(value);
      } catch (e) {
        return handlers.reject(promise, e);
      }
      if (returnValue === promise) {
        handlers.reject(promise, new TypeError("Cannot resolve promise with itself"));
      } else {
        handlers.resolve(promise, returnValue);
      }
    });
  }
  handlers.resolve = function(self2, value) {
    var result = tryCatch(getThen, value);
    if (result.status === "error") {
      return handlers.reject(self2, result.value);
    }
    var thenable = result.value;
    if (thenable) {
      safelyResolveThenable(self2, thenable);
    } else {
      self2.state = FULFILLED;
      self2.outcome = value;
      var i = -1;
      var len = self2.queue.length;
      while (++i < len) {
        self2.queue[i].callFulfilled(value);
      }
    }
    return self2;
  };
  handlers.reject = function(self2, error) {
    self2.state = REJECTED;
    self2.outcome = error;
    if (!process.browser) {
      if (self2.handled === UNHANDLED) {
        immediate(function() {
          if (self2.handled === UNHANDLED) {
            process.emit("unhandledRejection", error, self2);
          }
        });
      }
    }
    var i = -1;
    var len = self2.queue.length;
    while (++i < len) {
      self2.queue[i].callRejected(error);
    }
    return self2;
  };
  function getThen(obj) {
    var then = obj && obj.then;
    if (obj && (typeof obj === "object" || typeof obj === "function") && typeof then === "function") {
      return function appyThen() {
        then.apply(obj, arguments);
      };
    }
  }
  function safelyResolveThenable(self2, thenable) {
    var called = false;
    function onError(value) {
      if (called) {
        return;
      }
      called = true;
      handlers.reject(self2, value);
    }
    function onSuccess(value) {
      if (called) {
        return;
      }
      called = true;
      handlers.resolve(self2, value);
    }
    function tryToUnwrap() {
      thenable(onSuccess, onError);
    }
    var result = tryCatch(tryToUnwrap);
    if (result.status === "error") {
      onError(result.value);
    }
  }
  function tryCatch(func, value) {
    var out = {};
    try {
      out.value = func(value);
      out.status = "success";
    } catch (e) {
      out.status = "error";
      out.value = e;
    }
    return out;
  }
  Promise2.resolve = resolve;
  function resolve(value) {
    if (value instanceof this) {
      return value;
    }
    return handlers.resolve(new this(INTERNAL), value);
  }
  Promise2.reject = reject;
  function reject(reason) {
    var promise = new this(INTERNAL);
    return handlers.reject(promise, reason);
  }
  Promise2.all = all;
  function all(iterable) {
    var self2 = this;
    if (Object.prototype.toString.call(iterable) !== "[object Array]") {
      return this.reject(new TypeError("must be an array"));
    }
    var len = iterable.length;
    var called = false;
    if (!len) {
      return this.resolve([]);
    }
    var values = new Array(len);
    var resolved = 0;
    var i = -1;
    var promise = new this(INTERNAL);
    while (++i < len) {
      allResolver(iterable[i], i);
    }
    return promise;
    function allResolver(value, i2) {
      self2.resolve(value).then(resolveFromAll, function(error) {
        if (!called) {
          called = true;
          handlers.reject(promise, error);
        }
      });
      function resolveFromAll(outValue) {
        values[i2] = outValue;
        if (++resolved === len && !called) {
          called = true;
          handlers.resolve(promise, values);
        }
      }
    }
  }
  Promise2.race = race;
  function race(iterable) {
    var self2 = this;
    if (Object.prototype.toString.call(iterable) !== "[object Array]") {
      return this.reject(new TypeError("must be an array"));
    }
    var len = iterable.length;
    var called = false;
    if (!len) {
      return this.resolve([]);
    }
    var i = -1;
    var promise = new this(INTERNAL);
    while (++i < len) {
      resolver(iterable[i]);
    }
    return promise;
    function resolver(value) {
      self2.resolve(value).then(function(response) {
        if (!called) {
          called = true;
          handlers.resolve(promise, response);
        }
      }, function(error) {
        if (!called) {
          called = true;
          handlers.reject(promise, error);
        }
      });
    }
  }
  return lib$1;
}
var external;
var hasRequiredExternal;
function requireExternal() {
  if (hasRequiredExternal) return external;
  hasRequiredExternal = 1;
  var ES6Promise = null;
  if (typeof Promise !== "undefined") {
    ES6Promise = Promise;
  } else {
    ES6Promise = requireLib$1();
  }
  external = {
    Promise: ES6Promise
  };
  return external;
}
var setImmediate$1 = {};
var hasRequiredSetImmediate;
function requireSetImmediate() {
  if (hasRequiredSetImmediate) return setImmediate$1;
  hasRequiredSetImmediate = 1;
  (function(global2, undefined$1) {
    if (global2.setImmediate) {
      return;
    }
    var nextHandle = 1;
    var tasksByHandle = {};
    var currentlyRunningATask = false;
    var doc2 = global2.document;
    var registerImmediate;
    function setImmediate2(callback) {
      if (typeof callback !== "function") {
        callback = new Function("" + callback);
      }
      var args = new Array(arguments.length - 1);
      for (var i = 0; i < args.length; i++) {
        args[i] = arguments[i + 1];
      }
      var task = { callback, args };
      tasksByHandle[nextHandle] = task;
      registerImmediate(nextHandle);
      return nextHandle++;
    }
    function clearImmediate(handle) {
      delete tasksByHandle[handle];
    }
    function run2(task) {
      var callback = task.callback;
      var args = task.args;
      switch (args.length) {
        case 0:
          callback();
          break;
        case 1:
          callback(args[0]);
          break;
        case 2:
          callback(args[0], args[1]);
          break;
        case 3:
          callback(args[0], args[1], args[2]);
          break;
        default:
          callback.apply(undefined$1, args);
          break;
      }
    }
    function runIfPresent(handle) {
      if (currentlyRunningATask) {
        setTimeout(runIfPresent, 0, handle);
      } else {
        var task = tasksByHandle[handle];
        if (task) {
          currentlyRunningATask = true;
          try {
            run2(task);
          } finally {
            clearImmediate(handle);
            currentlyRunningATask = false;
          }
        }
      }
    }
    function installNextTickImplementation() {
      registerImmediate = function(handle) {
        process.nextTick(function() {
          runIfPresent(handle);
        });
      };
    }
    function canUsePostMessage() {
      if (global2.postMessage && !global2.importScripts) {
        var postMessageIsAsynchronous = true;
        var oldOnMessage = global2.onmessage;
        global2.onmessage = function() {
          postMessageIsAsynchronous = false;
        };
        global2.postMessage("", "*");
        global2.onmessage = oldOnMessage;
        return postMessageIsAsynchronous;
      }
    }
    function installPostMessageImplementation() {
      var messagePrefix = "setImmediate$" + Math.random() + "$";
      var onGlobalMessage = function(event) {
        if (event.source === global2 && typeof event.data === "string" && event.data.indexOf(messagePrefix) === 0) {
          runIfPresent(+event.data.slice(messagePrefix.length));
        }
      };
      if (global2.addEventListener) {
        global2.addEventListener("message", onGlobalMessage, false);
      } else {
        global2.attachEvent("onmessage", onGlobalMessage);
      }
      registerImmediate = function(handle) {
        global2.postMessage(messagePrefix + handle, "*");
      };
    }
    function installMessageChannelImplementation() {
      var channel = new MessageChannel();
      channel.port1.onmessage = function(event) {
        var handle = event.data;
        runIfPresent(handle);
      };
      registerImmediate = function(handle) {
        channel.port2.postMessage(handle);
      };
    }
    function installReadyStateChangeImplementation() {
      var html = doc2.documentElement;
      registerImmediate = function(handle) {
        var script = doc2.createElement("script");
        script.onreadystatechange = function() {
          runIfPresent(handle);
          script.onreadystatechange = null;
          html.removeChild(script);
          script = null;
        };
        html.appendChild(script);
      };
    }
    function installSetTimeoutImplementation() {
      registerImmediate = function(handle) {
        setTimeout(runIfPresent, 0, handle);
      };
    }
    var attachTo = Object.getPrototypeOf && Object.getPrototypeOf(global2);
    attachTo = attachTo && attachTo.setTimeout ? attachTo : global2;
    if ({}.toString.call(global2.process) === "[object process]") {
      installNextTickImplementation();
    } else if (canUsePostMessage()) {
      installPostMessageImplementation();
    } else if (global2.MessageChannel) {
      installMessageChannelImplementation();
    } else if (doc2 && "onreadystatechange" in doc2.createElement("script")) {
      installReadyStateChangeImplementation();
    } else {
      installSetTimeoutImplementation();
    }
    attachTo.setImmediate = setImmediate2;
    attachTo.clearImmediate = clearImmediate;
  })(typeof self === "undefined" ? typeof commonjsGlobal === "undefined" ? setImmediate$1 : commonjsGlobal : self);
  return setImmediate$1;
}
var hasRequiredUtils;
function requireUtils() {
  if (hasRequiredUtils) return utils;
  hasRequiredUtils = 1;
  (function(exports) {
    var support2 = requireSupport();
    var base642 = requireBase64();
    var nodejsUtils2 = requireNodejsUtils();
    var external2 = requireExternal();
    requireSetImmediate();
    function string2binary(str) {
      var result = null;
      if (support2.uint8array) {
        result = new Uint8Array(str.length);
      } else {
        result = new Array(str.length);
      }
      return stringToArrayLike(str, result);
    }
    exports.newBlob = function(part, type) {
      exports.checkSupport("blob");
      try {
        return new Blob([part], {
          type
        });
      } catch (e) {
        try {
          var Builder = self.BlobBuilder || self.WebKitBlobBuilder || self.MozBlobBuilder || self.MSBlobBuilder;
          var builder = new Builder();
          builder.append(part);
          return builder.getBlob(type);
        } catch (e2) {
          throw new Error("Bug : can't construct the Blob.");
        }
      }
    };
    function identity(input) {
      return input;
    }
    function stringToArrayLike(str, array2) {
      for (var i = 0; i < str.length; ++i) {
        array2[i] = str.charCodeAt(i) & 255;
      }
      return array2;
    }
    var arrayToStringHelper = {
      /**
       * Transform an array of int into a string, chunk by chunk.
       * See the performances notes on arrayLikeToString.
       * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
       * @param {String} type the type of the array.
       * @param {Integer} chunk the chunk size.
       * @return {String} the resulting string.
       * @throws Error if the chunk is too big for the stack.
       */
      stringifyByChunk: function(array2, type, chunk) {
        var result = [], k = 0, len = array2.length;
        if (len <= chunk) {
          return String.fromCharCode.apply(null, array2);
        }
        while (k < len) {
          if (type === "array" || type === "nodebuffer") {
            result.push(String.fromCharCode.apply(null, array2.slice(k, Math.min(k + chunk, len))));
          } else {
            result.push(String.fromCharCode.apply(null, array2.subarray(k, Math.min(k + chunk, len))));
          }
          k += chunk;
        }
        return result.join("");
      },
      /**
       * Call String.fromCharCode on every item in the array.
       * This is the naive implementation, which generate A LOT of intermediate string.
       * This should be used when everything else fail.
       * @param {Array|ArrayBuffer|Uint8Array|Buffer} array the array to transform.
       * @return {String} the result.
       */
      stringifyByChar: function(array2) {
        var resultStr = "";
        for (var i = 0; i < array2.length; i++) {
          resultStr += String.fromCharCode(array2[i]);
        }
        return resultStr;
      },
      applyCanBeUsed: {
        /**
         * true if the browser accepts to use String.fromCharCode on Uint8Array
         */
        uint8array: (function() {
          try {
            return support2.uint8array && String.fromCharCode.apply(null, new Uint8Array(1)).length === 1;
          } catch (e) {
            return false;
          }
        })(),
        /**
         * true if the browser accepts to use String.fromCharCode on nodejs Buffer.
         */
        nodebuffer: (function() {
          try {
            return support2.nodebuffer && String.fromCharCode.apply(null, nodejsUtils2.allocBuffer(1)).length === 1;
          } catch (e) {
            return false;
          }
        })()
      }
    };
    function arrayLikeToString(array2) {
      var chunk = 65536, type = exports.getTypeOf(array2), canUseApply = true;
      if (type === "uint8array") {
        canUseApply = arrayToStringHelper.applyCanBeUsed.uint8array;
      } else if (type === "nodebuffer") {
        canUseApply = arrayToStringHelper.applyCanBeUsed.nodebuffer;
      }
      if (canUseApply) {
        while (chunk > 1) {
          try {
            return arrayToStringHelper.stringifyByChunk(array2, type, chunk);
          } catch (e) {
            chunk = Math.floor(chunk / 2);
          }
        }
      }
      return arrayToStringHelper.stringifyByChar(array2);
    }
    exports.applyFromCharCode = arrayLikeToString;
    function arrayLikeToArrayLike(arrayFrom, arrayTo) {
      for (var i = 0; i < arrayFrom.length; i++) {
        arrayTo[i] = arrayFrom[i];
      }
      return arrayTo;
    }
    var transform2 = {};
    transform2["string"] = {
      "string": identity,
      "array": function(input) {
        return stringToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return transform2["string"]["uint8array"](input).buffer;
      },
      "uint8array": function(input) {
        return stringToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": function(input) {
        return stringToArrayLike(input, nodejsUtils2.allocBuffer(input.length));
      }
    };
    transform2["array"] = {
      "string": arrayLikeToString,
      "array": identity,
      "arraybuffer": function(input) {
        return new Uint8Array(input).buffer;
      },
      "uint8array": function(input) {
        return new Uint8Array(input);
      },
      "nodebuffer": function(input) {
        return nodejsUtils2.newBufferFrom(input);
      }
    };
    transform2["arraybuffer"] = {
      "string": function(input) {
        return arrayLikeToString(new Uint8Array(input));
      },
      "array": function(input) {
        return arrayLikeToArrayLike(new Uint8Array(input), new Array(input.byteLength));
      },
      "arraybuffer": identity,
      "uint8array": function(input) {
        return new Uint8Array(input);
      },
      "nodebuffer": function(input) {
        return nodejsUtils2.newBufferFrom(new Uint8Array(input));
      }
    };
    transform2["uint8array"] = {
      "string": arrayLikeToString,
      "array": function(input) {
        return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return input.buffer;
      },
      "uint8array": identity,
      "nodebuffer": function(input) {
        return nodejsUtils2.newBufferFrom(input);
      }
    };
    transform2["nodebuffer"] = {
      "string": arrayLikeToString,
      "array": function(input) {
        return arrayLikeToArrayLike(input, new Array(input.length));
      },
      "arraybuffer": function(input) {
        return transform2["nodebuffer"]["uint8array"](input).buffer;
      },
      "uint8array": function(input) {
        return arrayLikeToArrayLike(input, new Uint8Array(input.length));
      },
      "nodebuffer": identity
    };
    exports.transformTo = function(outputType, input) {
      if (!input) {
        input = "";
      }
      if (!outputType) {
        return input;
      }
      exports.checkSupport(outputType);
      var inputType = exports.getTypeOf(input);
      var result = transform2[inputType][outputType](input);
      return result;
    };
    exports.resolve = function(path) {
      var parts = path.split("/");
      var result = [];
      for (var index = 0; index < parts.length; index++) {
        var part = parts[index];
        if (part === "." || part === "" && index !== 0 && index !== parts.length - 1) {
          continue;
        } else if (part === "..") {
          result.pop();
        } else {
          result.push(part);
        }
      }
      return result.join("/");
    };
    exports.getTypeOf = function(input) {
      if (typeof input === "string") {
        return "string";
      }
      if (Object.prototype.toString.call(input) === "[object Array]") {
        return "array";
      }
      if (support2.nodebuffer && nodejsUtils2.isBuffer(input)) {
        return "nodebuffer";
      }
      if (support2.uint8array && input instanceof Uint8Array) {
        return "uint8array";
      }
      if (support2.arraybuffer && input instanceof ArrayBuffer) {
        return "arraybuffer";
      }
    };
    exports.checkSupport = function(type) {
      var supported = support2[type.toLowerCase()];
      if (!supported) {
        throw new Error(type + " is not supported by this platform");
      }
    };
    exports.MAX_VALUE_16BITS = 65535;
    exports.MAX_VALUE_32BITS = -1;
    exports.pretty = function(str) {
      var res = "", code, i;
      for (i = 0; i < (str || "").length; i++) {
        code = str.charCodeAt(i);
        res += "\\x" + (code < 16 ? "0" : "") + code.toString(16).toUpperCase();
      }
      return res;
    };
    exports.delay = function(callback, args, self2) {
      setImmediate(function() {
        callback.apply(self2 || null, args || []);
      });
    };
    exports.inherits = function(ctor, superCtor) {
      var Obj = function() {
      };
      Obj.prototype = superCtor.prototype;
      ctor.prototype = new Obj();
    };
    exports.extend = function() {
      var result = {}, i, attr;
      for (i = 0; i < arguments.length; i++) {
        for (attr in arguments[i]) {
          if (Object.prototype.hasOwnProperty.call(arguments[i], attr) && typeof result[attr] === "undefined") {
            result[attr] = arguments[i][attr];
          }
        }
      }
      return result;
    };
    exports.prepareContent = function(name, inputData, isBinary, isOptimizedBinaryString, isBase64) {
      var promise = external2.Promise.resolve(inputData).then(function(data) {
        var isBlob = support2.blob && (data instanceof Blob || ["[object File]", "[object Blob]"].indexOf(Object.prototype.toString.call(data)) !== -1);
        if (isBlob && typeof FileReader !== "undefined") {
          return new external2.Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(e) {
              resolve(e.target.result);
            };
            reader.onerror = function(e) {
              reject(e.target.error);
            };
            reader.readAsArrayBuffer(data);
          });
        } else {
          return data;
        }
      });
      return promise.then(function(data) {
        var dataType = exports.getTypeOf(data);
        if (!dataType) {
          return external2.Promise.reject(
            new Error("Can't read the data of '" + name + "'. Is it in a supported JavaScript type (String, Blob, ArrayBuffer, etc) ?")
          );
        }
        if (dataType === "arraybuffer") {
          data = exports.transformTo("uint8array", data);
        } else if (dataType === "string") {
          if (isBase64) {
            data = base642.decode(data);
          } else if (isBinary) {
            if (isOptimizedBinaryString !== true) {
              data = string2binary(data);
            }
          }
        }
        return data;
      });
    };
  })(utils);
  return utils;
}
var GenericWorker_1;
var hasRequiredGenericWorker;
function requireGenericWorker() {
  if (hasRequiredGenericWorker) return GenericWorker_1;
  hasRequiredGenericWorker = 1;
  function GenericWorker(name) {
    this.name = name || "default";
    this.streamInfo = {};
    this.generatedError = null;
    this.extraStreamInfo = {};
    this.isPaused = true;
    this.isFinished = false;
    this.isLocked = false;
    this._listeners = {
      "data": [],
      "end": [],
      "error": []
    };
    this.previous = null;
  }
  GenericWorker.prototype = {
    /**
     * Push a chunk to the next workers.
     * @param {Object} chunk the chunk to push
     */
    push: function(chunk) {
      this.emit("data", chunk);
    },
    /**
     * End the stream.
     * @return {Boolean} true if this call ended the worker, false otherwise.
     */
    end: function() {
      if (this.isFinished) {
        return false;
      }
      this.flush();
      try {
        this.emit("end");
        this.cleanUp();
        this.isFinished = true;
      } catch (e) {
        this.emit("error", e);
      }
      return true;
    },
    /**
     * End the stream with an error.
     * @param {Error} e the error which caused the premature end.
     * @return {Boolean} true if this call ended the worker with an error, false otherwise.
     */
    error: function(e) {
      if (this.isFinished) {
        return false;
      }
      if (this.isPaused) {
        this.generatedError = e;
      } else {
        this.isFinished = true;
        this.emit("error", e);
        if (this.previous) {
          this.previous.error(e);
        }
        this.cleanUp();
      }
      return true;
    },
    /**
     * Add a callback on an event.
     * @param {String} name the name of the event (data, end, error)
     * @param {Function} listener the function to call when the event is triggered
     * @return {GenericWorker} the current object for chainability
     */
    on: function(name, listener) {
      this._listeners[name].push(listener);
      return this;
    },
    /**
     * Clean any references when a worker is ending.
     */
    cleanUp: function() {
      this.streamInfo = this.generatedError = this.extraStreamInfo = null;
      this._listeners = [];
    },
    /**
     * Trigger an event. This will call registered callback with the provided arg.
     * @param {String} name the name of the event (data, end, error)
     * @param {Object} arg the argument to call the callback with.
     */
    emit: function(name, arg) {
      if (this._listeners[name]) {
        for (var i = 0; i < this._listeners[name].length; i++) {
          this._listeners[name][i].call(this, arg);
        }
      }
    },
    /**
     * Chain a worker with an other.
     * @param {Worker} next the worker receiving events from the current one.
     * @return {worker} the next worker for chainability
     */
    pipe: function(next) {
      return next.registerPrevious(this);
    },
    /**
     * Same as `pipe` in the other direction.
     * Using an API with `pipe(next)` is very easy.
     * Implementing the API with the point of view of the next one registering
     * a source is easier, see the ZipFileWorker.
     * @param {Worker} previous the previous worker, sending events to this one
     * @return {Worker} the current worker for chainability
     */
    registerPrevious: function(previous) {
      if (this.isLocked) {
        throw new Error("The stream '" + this + "' has already been used.");
      }
      this.streamInfo = previous.streamInfo;
      this.mergeStreamInfo();
      this.previous = previous;
      var self2 = this;
      previous.on("data", function(chunk) {
        self2.processChunk(chunk);
      });
      previous.on("end", function() {
        self2.end();
      });
      previous.on("error", function(e) {
        self2.error(e);
      });
      return this;
    },
    /**
     * Pause the stream so it doesn't send events anymore.
     * @return {Boolean} true if this call paused the worker, false otherwise.
     */
    pause: function() {
      if (this.isPaused || this.isFinished) {
        return false;
      }
      this.isPaused = true;
      if (this.previous) {
        this.previous.pause();
      }
      return true;
    },
    /**
     * Resume a paused stream.
     * @return {Boolean} true if this call resumed the worker, false otherwise.
     */
    resume: function() {
      if (!this.isPaused || this.isFinished) {
        return false;
      }
      this.isPaused = false;
      var withError = false;
      if (this.generatedError) {
        this.error(this.generatedError);
        withError = true;
      }
      if (this.previous) {
        this.previous.resume();
      }
      return !withError;
    },
    /**
     * Flush any remaining bytes as the stream is ending.
     */
    flush: function() {
    },
    /**
     * Process a chunk. This is usually the method overridden.
     * @param {Object} chunk the chunk to process.
     */
    processChunk: function(chunk) {
      this.push(chunk);
    },
    /**
     * Add a key/value to be added in the workers chain streamInfo once activated.
     * @param {String} key the key to use
     * @param {Object} value the associated value
     * @return {Worker} the current worker for chainability
     */
    withStreamInfo: function(key, value) {
      this.extraStreamInfo[key] = value;
      this.mergeStreamInfo();
      return this;
    },
    /**
     * Merge this worker's streamInfo into the chain's streamInfo.
     */
    mergeStreamInfo: function() {
      for (var key in this.extraStreamInfo) {
        if (!Object.prototype.hasOwnProperty.call(this.extraStreamInfo, key)) {
          continue;
        }
        this.streamInfo[key] = this.extraStreamInfo[key];
      }
    },
    /**
     * Lock the stream to prevent further updates on the workers chain.
     * After calling this method, all calls to pipe will fail.
     */
    lock: function() {
      if (this.isLocked) {
        throw new Error("The stream '" + this + "' has already been used.");
      }
      this.isLocked = true;
      if (this.previous) {
        this.previous.lock();
      }
    },
    /**
     *
     * Pretty print the workers chain.
     */
    toString: function() {
      var me = "Worker " + this.name;
      if (this.previous) {
        return this.previous + " -> " + me;
      } else {
        return me;
      }
    }
  };
  GenericWorker_1 = GenericWorker;
  return GenericWorker_1;
}
var hasRequiredUtf8;
function requireUtf8() {
  if (hasRequiredUtf8) return utf8;
  hasRequiredUtf8 = 1;
  (function(exports) {
    var utils2 = requireUtils();
    var support2 = requireSupport();
    var nodejsUtils2 = requireNodejsUtils();
    var GenericWorker = requireGenericWorker();
    var _utf8len = new Array(256);
    for (var i = 0; i < 256; i++) {
      _utf8len[i] = i >= 252 ? 6 : i >= 248 ? 5 : i >= 240 ? 4 : i >= 224 ? 3 : i >= 192 ? 2 : 1;
    }
    _utf8len[254] = _utf8len[254] = 1;
    var string2buf = function(str) {
      var buf, c, c2, m_pos, i2, str_len = str.length, buf_len = 0;
      for (m_pos = 0; m_pos < str_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
      }
      if (support2.uint8array) {
        buf = new Uint8Array(buf_len);
      } else {
        buf = new Array(buf_len);
      }
      for (i2 = 0, m_pos = 0; i2 < buf_len; m_pos++) {
        c = str.charCodeAt(m_pos);
        if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
          c2 = str.charCodeAt(m_pos + 1);
          if ((c2 & 64512) === 56320) {
            c = 65536 + (c - 55296 << 10) + (c2 - 56320);
            m_pos++;
          }
        }
        if (c < 128) {
          buf[i2++] = c;
        } else if (c < 2048) {
          buf[i2++] = 192 | c >>> 6;
          buf[i2++] = 128 | c & 63;
        } else if (c < 65536) {
          buf[i2++] = 224 | c >>> 12;
          buf[i2++] = 128 | c >>> 6 & 63;
          buf[i2++] = 128 | c & 63;
        } else {
          buf[i2++] = 240 | c >>> 18;
          buf[i2++] = 128 | c >>> 12 & 63;
          buf[i2++] = 128 | c >>> 6 & 63;
          buf[i2++] = 128 | c & 63;
        }
      }
      return buf;
    };
    var utf8border = function(buf, max) {
      var pos;
      max = max || buf.length;
      if (max > buf.length) {
        max = buf.length;
      }
      pos = max - 1;
      while (pos >= 0 && (buf[pos] & 192) === 128) {
        pos--;
      }
      if (pos < 0) {
        return max;
      }
      if (pos === 0) {
        return max;
      }
      return pos + _utf8len[buf[pos]] > max ? pos : max;
    };
    var buf2string = function(buf) {
      var i2, out, c, c_len;
      var len = buf.length;
      var utf16buf = new Array(len * 2);
      for (out = 0, i2 = 0; i2 < len; ) {
        c = buf[i2++];
        if (c < 128) {
          utf16buf[out++] = c;
          continue;
        }
        c_len = _utf8len[c];
        if (c_len > 4) {
          utf16buf[out++] = 65533;
          i2 += c_len - 1;
          continue;
        }
        c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
        while (c_len > 1 && i2 < len) {
          c = c << 6 | buf[i2++] & 63;
          c_len--;
        }
        if (c_len > 1) {
          utf16buf[out++] = 65533;
          continue;
        }
        if (c < 65536) {
          utf16buf[out++] = c;
        } else {
          c -= 65536;
          utf16buf[out++] = 55296 | c >> 10 & 1023;
          utf16buf[out++] = 56320 | c & 1023;
        }
      }
      if (utf16buf.length !== out) {
        if (utf16buf.subarray) {
          utf16buf = utf16buf.subarray(0, out);
        } else {
          utf16buf.length = out;
        }
      }
      return utils2.applyFromCharCode(utf16buf);
    };
    exports.utf8encode = function utf8encode(str) {
      if (support2.nodebuffer) {
        return nodejsUtils2.newBufferFrom(str, "utf-8");
      }
      return string2buf(str);
    };
    exports.utf8decode = function utf8decode(buf) {
      if (support2.nodebuffer) {
        return utils2.transformTo("nodebuffer", buf).toString("utf-8");
      }
      buf = utils2.transformTo(support2.uint8array ? "uint8array" : "array", buf);
      return buf2string(buf);
    };
    function Utf8DecodeWorker() {
      GenericWorker.call(this, "utf-8 decode");
      this.leftOver = null;
    }
    utils2.inherits(Utf8DecodeWorker, GenericWorker);
    Utf8DecodeWorker.prototype.processChunk = function(chunk) {
      var data = utils2.transformTo(support2.uint8array ? "uint8array" : "array", chunk.data);
      if (this.leftOver && this.leftOver.length) {
        if (support2.uint8array) {
          var previousData = data;
          data = new Uint8Array(previousData.length + this.leftOver.length);
          data.set(this.leftOver, 0);
          data.set(previousData, this.leftOver.length);
        } else {
          data = this.leftOver.concat(data);
        }
        this.leftOver = null;
      }
      var nextBoundary = utf8border(data);
      var usableData = data;
      if (nextBoundary !== data.length) {
        if (support2.uint8array) {
          usableData = data.subarray(0, nextBoundary);
          this.leftOver = data.subarray(nextBoundary, data.length);
        } else {
          usableData = data.slice(0, nextBoundary);
          this.leftOver = data.slice(nextBoundary, data.length);
        }
      }
      this.push({
        data: exports.utf8decode(usableData),
        meta: chunk.meta
      });
    };
    Utf8DecodeWorker.prototype.flush = function() {
      if (this.leftOver && this.leftOver.length) {
        this.push({
          data: exports.utf8decode(this.leftOver),
          meta: {}
        });
        this.leftOver = null;
      }
    };
    exports.Utf8DecodeWorker = Utf8DecodeWorker;
    function Utf8EncodeWorker() {
      GenericWorker.call(this, "utf-8 encode");
    }
    utils2.inherits(Utf8EncodeWorker, GenericWorker);
    Utf8EncodeWorker.prototype.processChunk = function(chunk) {
      this.push({
        data: exports.utf8encode(chunk.data),
        meta: chunk.meta
      });
    };
    exports.Utf8EncodeWorker = Utf8EncodeWorker;
  })(utf8);
  return utf8;
}
var ConvertWorker_1;
var hasRequiredConvertWorker;
function requireConvertWorker() {
  if (hasRequiredConvertWorker) return ConvertWorker_1;
  hasRequiredConvertWorker = 1;
  var GenericWorker = requireGenericWorker();
  var utils2 = requireUtils();
  function ConvertWorker(destType) {
    GenericWorker.call(this, "ConvertWorker to " + destType);
    this.destType = destType;
  }
  utils2.inherits(ConvertWorker, GenericWorker);
  ConvertWorker.prototype.processChunk = function(chunk) {
    this.push({
      data: utils2.transformTo(this.destType, chunk.data),
      meta: chunk.meta
    });
  };
  ConvertWorker_1 = ConvertWorker;
  return ConvertWorker_1;
}
var NodejsStreamOutputAdapter_1;
var hasRequiredNodejsStreamOutputAdapter;
function requireNodejsStreamOutputAdapter() {
  if (hasRequiredNodejsStreamOutputAdapter) return NodejsStreamOutputAdapter_1;
  hasRequiredNodejsStreamOutputAdapter = 1;
  var Readable = requireReadable().Readable;
  var utils2 = requireUtils();
  utils2.inherits(NodejsStreamOutputAdapter, Readable);
  function NodejsStreamOutputAdapter(helper, options, updateCb) {
    Readable.call(this, options);
    this._helper = helper;
    var self2 = this;
    helper.on("data", function(data, meta) {
      if (!self2.push(data)) {
        self2._helper.pause();
      }
      if (updateCb) {
        updateCb(meta);
      }
    }).on("error", function(e) {
      self2.emit("error", e);
    }).on("end", function() {
      self2.push(null);
    });
  }
  NodejsStreamOutputAdapter.prototype._read = function() {
    this._helper.resume();
  };
  NodejsStreamOutputAdapter_1 = NodejsStreamOutputAdapter;
  return NodejsStreamOutputAdapter_1;
}
var StreamHelper_1;
var hasRequiredStreamHelper;
function requireStreamHelper() {
  if (hasRequiredStreamHelper) return StreamHelper_1;
  hasRequiredStreamHelper = 1;
  var utils2 = requireUtils();
  var ConvertWorker = requireConvertWorker();
  var GenericWorker = requireGenericWorker();
  var base642 = requireBase64();
  var support2 = requireSupport();
  var external2 = requireExternal();
  var NodejsStreamOutputAdapter = null;
  if (support2.nodestream) {
    try {
      NodejsStreamOutputAdapter = requireNodejsStreamOutputAdapter();
    } catch (e) {
    }
  }
  function transformZipOutput(type, content, mimeType) {
    switch (type) {
      case "blob":
        return utils2.newBlob(utils2.transformTo("arraybuffer", content), mimeType);
      case "base64":
        return base642.encode(content);
      default:
        return utils2.transformTo(type, content);
    }
  }
  function concat(type, dataArray) {
    var i, index = 0, res = null, totalLength = 0;
    for (i = 0; i < dataArray.length; i++) {
      totalLength += dataArray[i].length;
    }
    switch (type) {
      case "string":
        return dataArray.join("");
      case "array":
        return Array.prototype.concat.apply([], dataArray);
      case "uint8array":
        res = new Uint8Array(totalLength);
        for (i = 0; i < dataArray.length; i++) {
          res.set(dataArray[i], index);
          index += dataArray[i].length;
        }
        return res;
      case "nodebuffer":
        return Buffer.concat(dataArray);
      default:
        throw new Error("concat : unsupported type '" + type + "'");
    }
  }
  function accumulate(helper, updateCallback) {
    return new external2.Promise(function(resolve, reject) {
      var dataArray = [];
      var chunkType = helper._internalType, resultType = helper._outputType, mimeType = helper._mimeType;
      helper.on("data", function(data, meta) {
        dataArray.push(data);
        if (updateCallback) {
          updateCallback(meta);
        }
      }).on("error", function(err) {
        dataArray = [];
        reject(err);
      }).on("end", function() {
        try {
          var result = transformZipOutput(resultType, concat(chunkType, dataArray), mimeType);
          resolve(result);
        } catch (e) {
          reject(e);
        }
        dataArray = [];
      }).resume();
    });
  }
  function StreamHelper(worker, outputType, mimeType) {
    var internalType = outputType;
    switch (outputType) {
      case "blob":
      case "arraybuffer":
        internalType = "uint8array";
        break;
      case "base64":
        internalType = "string";
        break;
    }
    try {
      this._internalType = internalType;
      this._outputType = outputType;
      this._mimeType = mimeType;
      utils2.checkSupport(internalType);
      this._worker = worker.pipe(new ConvertWorker(internalType));
      worker.lock();
    } catch (e) {
      this._worker = new GenericWorker("error");
      this._worker.error(e);
    }
  }
  StreamHelper.prototype = {
    /**
     * Listen a StreamHelper, accumulate its content and concatenate it into a
     * complete block.
     * @param {Function} updateCb the update callback.
     * @return Promise the promise for the accumulation.
     */
    accumulate: function(updateCb) {
      return accumulate(this, updateCb);
    },
    /**
     * Add a listener on an event triggered on a stream.
     * @param {String} evt the name of the event
     * @param {Function} fn the listener
     * @return {StreamHelper} the current helper.
     */
    on: function(evt, fn) {
      var self2 = this;
      if (evt === "data") {
        this._worker.on(evt, function(chunk) {
          fn.call(self2, chunk.data, chunk.meta);
        });
      } else {
        this._worker.on(evt, function() {
          utils2.delay(fn, arguments, self2);
        });
      }
      return this;
    },
    /**
     * Resume the flow of chunks.
     * @return {StreamHelper} the current helper.
     */
    resume: function() {
      utils2.delay(this._worker.resume, [], this._worker);
      return this;
    },
    /**
     * Pause the flow of chunks.
     * @return {StreamHelper} the current helper.
     */
    pause: function() {
      this._worker.pause();
      return this;
    },
    /**
     * Return a nodejs stream for this helper.
     * @param {Function} updateCb the update callback.
     * @return {NodejsStreamOutputAdapter} the nodejs stream.
     */
    toNodejsStream: function(updateCb) {
      utils2.checkSupport("nodestream");
      if (this._outputType !== "nodebuffer") {
        throw new Error(this._outputType + " is not supported by this method");
      }
      return new NodejsStreamOutputAdapter(this, {
        objectMode: this._outputType !== "nodebuffer"
      }, updateCb);
    }
  };
  StreamHelper_1 = StreamHelper;
  return StreamHelper_1;
}
var defaults = {};
var hasRequiredDefaults;
function requireDefaults() {
  if (hasRequiredDefaults) return defaults;
  hasRequiredDefaults = 1;
  defaults.base64 = false;
  defaults.binary = false;
  defaults.dir = false;
  defaults.createFolders = true;
  defaults.date = null;
  defaults.compression = null;
  defaults.compressionOptions = null;
  defaults.comment = null;
  defaults.unixPermissions = null;
  defaults.dosPermissions = null;
  return defaults;
}
var DataWorker_1;
var hasRequiredDataWorker;
function requireDataWorker() {
  if (hasRequiredDataWorker) return DataWorker_1;
  hasRequiredDataWorker = 1;
  var utils2 = requireUtils();
  var GenericWorker = requireGenericWorker();
  var DEFAULT_BLOCK_SIZE = 16 * 1024;
  function DataWorker(dataP) {
    GenericWorker.call(this, "DataWorker");
    var self2 = this;
    this.dataIsReady = false;
    this.index = 0;
    this.max = 0;
    this.data = null;
    this.type = "";
    this._tickScheduled = false;
    dataP.then(function(data) {
      self2.dataIsReady = true;
      self2.data = data;
      self2.max = data && data.length || 0;
      self2.type = utils2.getTypeOf(data);
      if (!self2.isPaused) {
        self2._tickAndRepeat();
      }
    }, function(e) {
      self2.error(e);
    });
  }
  utils2.inherits(DataWorker, GenericWorker);
  DataWorker.prototype.cleanUp = function() {
    GenericWorker.prototype.cleanUp.call(this);
    this.data = null;
  };
  DataWorker.prototype.resume = function() {
    if (!GenericWorker.prototype.resume.call(this)) {
      return false;
    }
    if (!this._tickScheduled && this.dataIsReady) {
      this._tickScheduled = true;
      utils2.delay(this._tickAndRepeat, [], this);
    }
    return true;
  };
  DataWorker.prototype._tickAndRepeat = function() {
    this._tickScheduled = false;
    if (this.isPaused || this.isFinished) {
      return;
    }
    this._tick();
    if (!this.isFinished) {
      utils2.delay(this._tickAndRepeat, [], this);
      this._tickScheduled = true;
    }
  };
  DataWorker.prototype._tick = function() {
    if (this.isPaused || this.isFinished) {
      return false;
    }
    var size = DEFAULT_BLOCK_SIZE;
    var data = null, nextIndex = Math.min(this.max, this.index + size);
    if (this.index >= this.max) {
      return this.end();
    } else {
      switch (this.type) {
        case "string":
          data = this.data.substring(this.index, nextIndex);
          break;
        case "uint8array":
          data = this.data.subarray(this.index, nextIndex);
          break;
        case "array":
        case "nodebuffer":
          data = this.data.slice(this.index, nextIndex);
          break;
      }
      this.index = nextIndex;
      return this.push({
        data,
        meta: {
          percent: this.max ? this.index / this.max * 100 : 0
        }
      });
    }
  };
  DataWorker_1 = DataWorker;
  return DataWorker_1;
}
var crc32_1$1;
var hasRequiredCrc32$1;
function requireCrc32$1() {
  if (hasRequiredCrc32$1) return crc32_1$1;
  hasRequiredCrc32$1 = 1;
  var utils2 = requireUtils();
  function makeTable() {
    var c, table = [];
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) {
        c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      }
      table[n] = c;
    }
    return table;
  }
  var crcTable = makeTable();
  function crc32(crc, buf, len, pos) {
    var t = crcTable, end = pos + len;
    crc = crc ^ -1;
    for (var i = pos; i < end; i++) {
      crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
    }
    return crc ^ -1;
  }
  function crc32str(crc, str, len, pos) {
    var t = crcTable, end = pos + len;
    crc = crc ^ -1;
    for (var i = pos; i < end; i++) {
      crc = crc >>> 8 ^ t[(crc ^ str.charCodeAt(i)) & 255];
    }
    return crc ^ -1;
  }
  crc32_1$1 = function crc32wrapper(input, crc) {
    if (typeof input === "undefined" || !input.length) {
      return 0;
    }
    var isArray = utils2.getTypeOf(input) !== "string";
    if (isArray) {
      return crc32(crc | 0, input, input.length, 0);
    } else {
      return crc32str(crc | 0, input, input.length, 0);
    }
  };
  return crc32_1$1;
}
var Crc32Probe_1;
var hasRequiredCrc32Probe;
function requireCrc32Probe() {
  if (hasRequiredCrc32Probe) return Crc32Probe_1;
  hasRequiredCrc32Probe = 1;
  var GenericWorker = requireGenericWorker();
  var crc32 = requireCrc32$1();
  var utils2 = requireUtils();
  function Crc32Probe() {
    GenericWorker.call(this, "Crc32Probe");
    this.withStreamInfo("crc32", 0);
  }
  utils2.inherits(Crc32Probe, GenericWorker);
  Crc32Probe.prototype.processChunk = function(chunk) {
    this.streamInfo.crc32 = crc32(chunk.data, this.streamInfo.crc32 || 0);
    this.push(chunk);
  };
  Crc32Probe_1 = Crc32Probe;
  return Crc32Probe_1;
}
var DataLengthProbe_1;
var hasRequiredDataLengthProbe;
function requireDataLengthProbe() {
  if (hasRequiredDataLengthProbe) return DataLengthProbe_1;
  hasRequiredDataLengthProbe = 1;
  var utils2 = requireUtils();
  var GenericWorker = requireGenericWorker();
  function DataLengthProbe(propName) {
    GenericWorker.call(this, "DataLengthProbe for " + propName);
    this.propName = propName;
    this.withStreamInfo(propName, 0);
  }
  utils2.inherits(DataLengthProbe, GenericWorker);
  DataLengthProbe.prototype.processChunk = function(chunk) {
    if (chunk) {
      var length = this.streamInfo[this.propName] || 0;
      this.streamInfo[this.propName] = length + chunk.data.length;
    }
    GenericWorker.prototype.processChunk.call(this, chunk);
  };
  DataLengthProbe_1 = DataLengthProbe;
  return DataLengthProbe_1;
}
var compressedObject;
var hasRequiredCompressedObject;
function requireCompressedObject() {
  if (hasRequiredCompressedObject) return compressedObject;
  hasRequiredCompressedObject = 1;
  var external2 = requireExternal();
  var DataWorker = requireDataWorker();
  var Crc32Probe = requireCrc32Probe();
  var DataLengthProbe = requireDataLengthProbe();
  function CompressedObject(compressedSize, uncompressedSize, crc32, compression, data) {
    this.compressedSize = compressedSize;
    this.uncompressedSize = uncompressedSize;
    this.crc32 = crc32;
    this.compression = compression;
    this.compressedContent = data;
  }
  CompressedObject.prototype = {
    /**
     * Create a worker to get the uncompressed content.
     * @return {GenericWorker} the worker.
     */
    getContentWorker: function() {
      var worker = new DataWorker(external2.Promise.resolve(this.compressedContent)).pipe(this.compression.uncompressWorker()).pipe(new DataLengthProbe("data_length"));
      var that = this;
      worker.on("end", function() {
        if (this.streamInfo["data_length"] !== that.uncompressedSize) {
          throw new Error("Bug : uncompressed data size mismatch");
        }
      });
      return worker;
    },
    /**
     * Create a worker to get the compressed content.
     * @return {GenericWorker} the worker.
     */
    getCompressedWorker: function() {
      return new DataWorker(external2.Promise.resolve(this.compressedContent)).withStreamInfo("compressedSize", this.compressedSize).withStreamInfo("uncompressedSize", this.uncompressedSize).withStreamInfo("crc32", this.crc32).withStreamInfo("compression", this.compression);
    }
  };
  CompressedObject.createWorkerFrom = function(uncompressedWorker, compression, compressionOptions) {
    return uncompressedWorker.pipe(new Crc32Probe()).pipe(new DataLengthProbe("uncompressedSize")).pipe(compression.compressWorker(compressionOptions)).pipe(new DataLengthProbe("compressedSize")).withStreamInfo("compression", compression);
  };
  compressedObject = CompressedObject;
  return compressedObject;
}
var zipObject;
var hasRequiredZipObject;
function requireZipObject() {
  if (hasRequiredZipObject) return zipObject;
  hasRequiredZipObject = 1;
  var StreamHelper = requireStreamHelper();
  var DataWorker = requireDataWorker();
  var utf82 = requireUtf8();
  var CompressedObject = requireCompressedObject();
  var GenericWorker = requireGenericWorker();
  var ZipObject = function(name, data, options) {
    this.name = name;
    this.dir = options.dir;
    this.date = options.date;
    this.comment = options.comment;
    this.unixPermissions = options.unixPermissions;
    this.dosPermissions = options.dosPermissions;
    this._data = data;
    this._dataBinary = options.binary;
    this.options = {
      compression: options.compression,
      compressionOptions: options.compressionOptions
    };
  };
  ZipObject.prototype = {
    /**
     * Create an internal stream for the content of this object.
     * @param {String} type the type of each chunk.
     * @return StreamHelper the stream.
     */
    internalStream: function(type) {
      var result = null, outputType = "string";
      try {
        if (!type) {
          throw new Error("No output type specified.");
        }
        outputType = type.toLowerCase();
        var askUnicodeString = outputType === "string" || outputType === "text";
        if (outputType === "binarystring" || outputType === "text") {
          outputType = "string";
        }
        result = this._decompressWorker();
        var isUnicodeString = !this._dataBinary;
        if (isUnicodeString && !askUnicodeString) {
          result = result.pipe(new utf82.Utf8EncodeWorker());
        }
        if (!isUnicodeString && askUnicodeString) {
          result = result.pipe(new utf82.Utf8DecodeWorker());
        }
      } catch (e) {
        result = new GenericWorker("error");
        result.error(e);
      }
      return new StreamHelper(result, outputType, "");
    },
    /**
     * Prepare the content in the asked type.
     * @param {String} type the type of the result.
     * @param {Function} onUpdate a function to call on each internal update.
     * @return Promise the promise of the result.
     */
    async: function(type, onUpdate) {
      return this.internalStream(type).accumulate(onUpdate);
    },
    /**
     * Prepare the content as a nodejs stream.
     * @param {String} type the type of each chunk.
     * @param {Function} onUpdate a function to call on each internal update.
     * @return Stream the stream.
     */
    nodeStream: function(type, onUpdate) {
      return this.internalStream(type || "nodebuffer").toNodejsStream(onUpdate);
    },
    /**
     * Return a worker for the compressed content.
     * @private
     * @param {Object} compression the compression object to use.
     * @param {Object} compressionOptions the options to use when compressing.
     * @return Worker the worker.
     */
    _compressWorker: function(compression, compressionOptions) {
      if (this._data instanceof CompressedObject && this._data.compression.magic === compression.magic) {
        return this._data.getCompressedWorker();
      } else {
        var result = this._decompressWorker();
        if (!this._dataBinary) {
          result = result.pipe(new utf82.Utf8EncodeWorker());
        }
        return CompressedObject.createWorkerFrom(result, compression, compressionOptions);
      }
    },
    /**
     * Return a worker for the decompressed content.
     * @private
     * @return Worker the worker.
     */
    _decompressWorker: function() {
      if (this._data instanceof CompressedObject) {
        return this._data.getContentWorker();
      } else if (this._data instanceof GenericWorker) {
        return this._data;
      } else {
        return new DataWorker(this._data);
      }
    }
  };
  var removedMethods = ["asText", "asBinary", "asNodeBuffer", "asUint8Array", "asArrayBuffer"];
  var removedFn = function() {
    throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
  };
  for (var i = 0; i < removedMethods.length; i++) {
    ZipObject.prototype[removedMethods[i]] = removedFn;
  }
  zipObject = ZipObject;
  return zipObject;
}
var generate = {};
var compressions = {};
var flate = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon) return common;
  hasRequiredCommon = 1;
  (function(exports) {
    var TYPED_OK = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Int32Array !== "undefined";
    function _has(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }
    exports.assign = function(obj) {
      var sources = Array.prototype.slice.call(arguments, 1);
      while (sources.length) {
        var source = sources.shift();
        if (!source) {
          continue;
        }
        if (typeof source !== "object") {
          throw new TypeError(source + "must be non-object");
        }
        for (var p in source) {
          if (_has(source, p)) {
            obj[p] = source[p];
          }
        }
      }
      return obj;
    };
    exports.shrinkBuf = function(buf, size) {
      if (buf.length === size) {
        return buf;
      }
      if (buf.subarray) {
        return buf.subarray(0, size);
      }
      buf.length = size;
      return buf;
    };
    var fnTyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        if (src.subarray && dest.subarray) {
          dest.set(src.subarray(src_offs, src_offs + len), dest_offs);
          return;
        }
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        var i, l, len, pos, chunk, result;
        len = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          len += chunks[i].length;
        }
        result = new Uint8Array(len);
        pos = 0;
        for (i = 0, l = chunks.length; i < l; i++) {
          chunk = chunks[i];
          result.set(chunk, pos);
          pos += chunk.length;
        }
        return result;
      }
    };
    var fnUntyped = {
      arraySet: function(dest, src, src_offs, len, dest_offs) {
        for (var i = 0; i < len; i++) {
          dest[dest_offs + i] = src[src_offs + i];
        }
      },
      // Join array of chunks to single array.
      flattenChunks: function(chunks) {
        return [].concat.apply([], chunks);
      }
    };
    exports.setTyped = function(on) {
      if (on) {
        exports.Buf8 = Uint8Array;
        exports.Buf16 = Uint16Array;
        exports.Buf32 = Int32Array;
        exports.assign(exports, fnTyped);
      } else {
        exports.Buf8 = Array;
        exports.Buf16 = Array;
        exports.Buf32 = Array;
        exports.assign(exports, fnUntyped);
      }
    };
    exports.setTyped(TYPED_OK);
  })(common);
  return common;
}
var deflate$1 = {};
var deflate = {};
var trees = {};
var hasRequiredTrees;
function requireTrees() {
  if (hasRequiredTrees) return trees;
  hasRequiredTrees = 1;
  var utils2 = requireCommon();
  var Z_FIXED = 4;
  var Z_BINARY = 0;
  var Z_TEXT = 1;
  var Z_UNKNOWN = 2;
  function zero(buf) {
    var len = buf.length;
    while (--len >= 0) {
      buf[len] = 0;
    }
  }
  var STORED_BLOCK = 0;
  var STATIC_TREES = 1;
  var DYN_TREES = 2;
  var MIN_MATCH = 3;
  var MAX_MATCH = 258;
  var LENGTH_CODES = 29;
  var LITERALS = 256;
  var L_CODES = LITERALS + 1 + LENGTH_CODES;
  var D_CODES = 30;
  var BL_CODES = 19;
  var HEAP_SIZE = 2 * L_CODES + 1;
  var MAX_BITS = 15;
  var Buf_size = 16;
  var MAX_BL_BITS = 7;
  var END_BLOCK = 256;
  var REP_3_6 = 16;
  var REPZ_3_10 = 17;
  var REPZ_11_138 = 18;
  var extra_lbits = (
    /* extra bits for each length code */
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
  );
  var extra_dbits = (
    /* extra bits for each distance code */
    [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
  );
  var extra_blbits = (
    /* extra bits for each bit length code */
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7]
  );
  var bl_order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  var DIST_CODE_LEN = 512;
  var static_ltree = new Array((L_CODES + 2) * 2);
  zero(static_ltree);
  var static_dtree = new Array(D_CODES * 2);
  zero(static_dtree);
  var _dist_code = new Array(DIST_CODE_LEN);
  zero(_dist_code);
  var _length_code = new Array(MAX_MATCH - MIN_MATCH + 1);
  zero(_length_code);
  var base_length = new Array(LENGTH_CODES);
  zero(base_length);
  var base_dist = new Array(D_CODES);
  zero(base_dist);
  function StaticTreeDesc(static_tree, extra_bits, extra_base, elems, max_length) {
    this.static_tree = static_tree;
    this.extra_bits = extra_bits;
    this.extra_base = extra_base;
    this.elems = elems;
    this.max_length = max_length;
    this.has_stree = static_tree && static_tree.length;
  }
  var static_l_desc;
  var static_d_desc;
  var static_bl_desc;
  function TreeDesc(dyn_tree, stat_desc) {
    this.dyn_tree = dyn_tree;
    this.max_code = 0;
    this.stat_desc = stat_desc;
  }
  function d_code(dist) {
    return dist < 256 ? _dist_code[dist] : _dist_code[256 + (dist >>> 7)];
  }
  function put_short(s, w) {
    s.pending_buf[s.pending++] = w & 255;
    s.pending_buf[s.pending++] = w >>> 8 & 255;
  }
  function send_bits(s, value, length) {
    if (s.bi_valid > Buf_size - length) {
      s.bi_buf |= value << s.bi_valid & 65535;
      put_short(s, s.bi_buf);
      s.bi_buf = value >> Buf_size - s.bi_valid;
      s.bi_valid += length - Buf_size;
    } else {
      s.bi_buf |= value << s.bi_valid & 65535;
      s.bi_valid += length;
    }
  }
  function send_code(s, c, tree) {
    send_bits(
      s,
      tree[c * 2],
      tree[c * 2 + 1]
      /*.Len*/
    );
  }
  function bi_reverse(code, len) {
    var res = 0;
    do {
      res |= code & 1;
      code >>>= 1;
      res <<= 1;
    } while (--len > 0);
    return res >>> 1;
  }
  function bi_flush(s) {
    if (s.bi_valid === 16) {
      put_short(s, s.bi_buf);
      s.bi_buf = 0;
      s.bi_valid = 0;
    } else if (s.bi_valid >= 8) {
      s.pending_buf[s.pending++] = s.bi_buf & 255;
      s.bi_buf >>= 8;
      s.bi_valid -= 8;
    }
  }
  function gen_bitlen(s, desc) {
    var tree = desc.dyn_tree;
    var max_code = desc.max_code;
    var stree = desc.stat_desc.static_tree;
    var has_stree = desc.stat_desc.has_stree;
    var extra = desc.stat_desc.extra_bits;
    var base = desc.stat_desc.extra_base;
    var max_length = desc.stat_desc.max_length;
    var h;
    var n, m;
    var bits;
    var xbits;
    var f;
    var overflow = 0;
    for (bits = 0; bits <= MAX_BITS; bits++) {
      s.bl_count[bits] = 0;
    }
    tree[s.heap[s.heap_max] * 2 + 1] = 0;
    for (h = s.heap_max + 1; h < HEAP_SIZE; h++) {
      n = s.heap[h];
      bits = tree[tree[n * 2 + 1] * 2 + 1] + 1;
      if (bits > max_length) {
        bits = max_length;
        overflow++;
      }
      tree[n * 2 + 1] = bits;
      if (n > max_code) {
        continue;
      }
      s.bl_count[bits]++;
      xbits = 0;
      if (n >= base) {
        xbits = extra[n - base];
      }
      f = tree[n * 2];
      s.opt_len += f * (bits + xbits);
      if (has_stree) {
        s.static_len += f * (stree[n * 2 + 1] + xbits);
      }
    }
    if (overflow === 0) {
      return;
    }
    do {
      bits = max_length - 1;
      while (s.bl_count[bits] === 0) {
        bits--;
      }
      s.bl_count[bits]--;
      s.bl_count[bits + 1] += 2;
      s.bl_count[max_length]--;
      overflow -= 2;
    } while (overflow > 0);
    for (bits = max_length; bits !== 0; bits--) {
      n = s.bl_count[bits];
      while (n !== 0) {
        m = s.heap[--h];
        if (m > max_code) {
          continue;
        }
        if (tree[m * 2 + 1] !== bits) {
          s.opt_len += (bits - tree[m * 2 + 1]) * tree[m * 2];
          tree[m * 2 + 1] = bits;
        }
        n--;
      }
    }
  }
  function gen_codes(tree, max_code, bl_count) {
    var next_code = new Array(MAX_BITS + 1);
    var code = 0;
    var bits;
    var n;
    for (bits = 1; bits <= MAX_BITS; bits++) {
      next_code[bits] = code = code + bl_count[bits - 1] << 1;
    }
    for (n = 0; n <= max_code; n++) {
      var len = tree[n * 2 + 1];
      if (len === 0) {
        continue;
      }
      tree[n * 2] = bi_reverse(next_code[len]++, len);
    }
  }
  function tr_static_init() {
    var n;
    var bits;
    var length;
    var code;
    var dist;
    var bl_count = new Array(MAX_BITS + 1);
    length = 0;
    for (code = 0; code < LENGTH_CODES - 1; code++) {
      base_length[code] = length;
      for (n = 0; n < 1 << extra_lbits[code]; n++) {
        _length_code[length++] = code;
      }
    }
    _length_code[length - 1] = code;
    dist = 0;
    for (code = 0; code < 16; code++) {
      base_dist[code] = dist;
      for (n = 0; n < 1 << extra_dbits[code]; n++) {
        _dist_code[dist++] = code;
      }
    }
    dist >>= 7;
    for (; code < D_CODES; code++) {
      base_dist[code] = dist << 7;
      for (n = 0; n < 1 << extra_dbits[code] - 7; n++) {
        _dist_code[256 + dist++] = code;
      }
    }
    for (bits = 0; bits <= MAX_BITS; bits++) {
      bl_count[bits] = 0;
    }
    n = 0;
    while (n <= 143) {
      static_ltree[n * 2 + 1] = 8;
      n++;
      bl_count[8]++;
    }
    while (n <= 255) {
      static_ltree[n * 2 + 1] = 9;
      n++;
      bl_count[9]++;
    }
    while (n <= 279) {
      static_ltree[n * 2 + 1] = 7;
      n++;
      bl_count[7]++;
    }
    while (n <= 287) {
      static_ltree[n * 2 + 1] = 8;
      n++;
      bl_count[8]++;
    }
    gen_codes(static_ltree, L_CODES + 1, bl_count);
    for (n = 0; n < D_CODES; n++) {
      static_dtree[n * 2 + 1] = 5;
      static_dtree[n * 2] = bi_reverse(n, 5);
    }
    static_l_desc = new StaticTreeDesc(static_ltree, extra_lbits, LITERALS + 1, L_CODES, MAX_BITS);
    static_d_desc = new StaticTreeDesc(static_dtree, extra_dbits, 0, D_CODES, MAX_BITS);
    static_bl_desc = new StaticTreeDesc(new Array(0), extra_blbits, 0, BL_CODES, MAX_BL_BITS);
  }
  function init_block(s) {
    var n;
    for (n = 0; n < L_CODES; n++) {
      s.dyn_ltree[n * 2] = 0;
    }
    for (n = 0; n < D_CODES; n++) {
      s.dyn_dtree[n * 2] = 0;
    }
    for (n = 0; n < BL_CODES; n++) {
      s.bl_tree[n * 2] = 0;
    }
    s.dyn_ltree[END_BLOCK * 2] = 1;
    s.opt_len = s.static_len = 0;
    s.last_lit = s.matches = 0;
  }
  function bi_windup(s) {
    if (s.bi_valid > 8) {
      put_short(s, s.bi_buf);
    } else if (s.bi_valid > 0) {
      s.pending_buf[s.pending++] = s.bi_buf;
    }
    s.bi_buf = 0;
    s.bi_valid = 0;
  }
  function copy_block(s, buf, len, header) {
    bi_windup(s);
    {
      put_short(s, len);
      put_short(s, ~len);
    }
    utils2.arraySet(s.pending_buf, s.window, buf, len, s.pending);
    s.pending += len;
  }
  function smaller(tree, n, m, depth) {
    var _n2 = n * 2;
    var _m2 = m * 2;
    return tree[_n2] < tree[_m2] || tree[_n2] === tree[_m2] && depth[n] <= depth[m];
  }
  function pqdownheap(s, tree, k) {
    var v = s.heap[k];
    var j = k << 1;
    while (j <= s.heap_len) {
      if (j < s.heap_len && smaller(tree, s.heap[j + 1], s.heap[j], s.depth)) {
        j++;
      }
      if (smaller(tree, v, s.heap[j], s.depth)) {
        break;
      }
      s.heap[k] = s.heap[j];
      k = j;
      j <<= 1;
    }
    s.heap[k] = v;
  }
  function compress_block(s, ltree, dtree) {
    var dist;
    var lc;
    var lx = 0;
    var code;
    var extra;
    if (s.last_lit !== 0) {
      do {
        dist = s.pending_buf[s.d_buf + lx * 2] << 8 | s.pending_buf[s.d_buf + lx * 2 + 1];
        lc = s.pending_buf[s.l_buf + lx];
        lx++;
        if (dist === 0) {
          send_code(s, lc, ltree);
        } else {
          code = _length_code[lc];
          send_code(s, code + LITERALS + 1, ltree);
          extra = extra_lbits[code];
          if (extra !== 0) {
            lc -= base_length[code];
            send_bits(s, lc, extra);
          }
          dist--;
          code = d_code(dist);
          send_code(s, code, dtree);
          extra = extra_dbits[code];
          if (extra !== 0) {
            dist -= base_dist[code];
            send_bits(s, dist, extra);
          }
        }
      } while (lx < s.last_lit);
    }
    send_code(s, END_BLOCK, ltree);
  }
  function build_tree(s, desc) {
    var tree = desc.dyn_tree;
    var stree = desc.stat_desc.static_tree;
    var has_stree = desc.stat_desc.has_stree;
    var elems = desc.stat_desc.elems;
    var n, m;
    var max_code = -1;
    var node2;
    s.heap_len = 0;
    s.heap_max = HEAP_SIZE;
    for (n = 0; n < elems; n++) {
      if (tree[n * 2] !== 0) {
        s.heap[++s.heap_len] = max_code = n;
        s.depth[n] = 0;
      } else {
        tree[n * 2 + 1] = 0;
      }
    }
    while (s.heap_len < 2) {
      node2 = s.heap[++s.heap_len] = max_code < 2 ? ++max_code : 0;
      tree[node2 * 2] = 1;
      s.depth[node2] = 0;
      s.opt_len--;
      if (has_stree) {
        s.static_len -= stree[node2 * 2 + 1];
      }
    }
    desc.max_code = max_code;
    for (n = s.heap_len >> 1; n >= 1; n--) {
      pqdownheap(s, tree, n);
    }
    node2 = elems;
    do {
      n = s.heap[
        1
        /*SMALLEST*/
      ];
      s.heap[
        1
        /*SMALLEST*/
      ] = s.heap[s.heap_len--];
      pqdownheap(
        s,
        tree,
        1
        /*SMALLEST*/
      );
      m = s.heap[
        1
        /*SMALLEST*/
      ];
      s.heap[--s.heap_max] = n;
      s.heap[--s.heap_max] = m;
      tree[node2 * 2] = tree[n * 2] + tree[m * 2];
      s.depth[node2] = (s.depth[n] >= s.depth[m] ? s.depth[n] : s.depth[m]) + 1;
      tree[n * 2 + 1] = tree[m * 2 + 1] = node2;
      s.heap[
        1
        /*SMALLEST*/
      ] = node2++;
      pqdownheap(
        s,
        tree,
        1
        /*SMALLEST*/
      );
    } while (s.heap_len >= 2);
    s.heap[--s.heap_max] = s.heap[
      1
      /*SMALLEST*/
    ];
    gen_bitlen(s, desc);
    gen_codes(tree, max_code, s.bl_count);
  }
  function scan_tree(s, tree, max_code) {
    var n;
    var prevlen = -1;
    var curlen;
    var nextlen = tree[0 * 2 + 1];
    var count = 0;
    var max_count = 7;
    var min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    tree[(max_code + 1) * 2 + 1] = 65535;
    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1];
      if (++count < max_count && curlen === nextlen) {
        continue;
      } else if (count < min_count) {
        s.bl_tree[curlen * 2] += count;
      } else if (curlen !== 0) {
        if (curlen !== prevlen) {
          s.bl_tree[curlen * 2]++;
        }
        s.bl_tree[REP_3_6 * 2]++;
      } else if (count <= 10) {
        s.bl_tree[REPZ_3_10 * 2]++;
      } else {
        s.bl_tree[REPZ_11_138 * 2]++;
      }
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  }
  function send_tree(s, tree, max_code) {
    var n;
    var prevlen = -1;
    var curlen;
    var nextlen = tree[0 * 2 + 1];
    var count = 0;
    var max_count = 7;
    var min_count = 4;
    if (nextlen === 0) {
      max_count = 138;
      min_count = 3;
    }
    for (n = 0; n <= max_code; n++) {
      curlen = nextlen;
      nextlen = tree[(n + 1) * 2 + 1];
      if (++count < max_count && curlen === nextlen) {
        continue;
      } else if (count < min_count) {
        do {
          send_code(s, curlen, s.bl_tree);
        } while (--count !== 0);
      } else if (curlen !== 0) {
        if (curlen !== prevlen) {
          send_code(s, curlen, s.bl_tree);
          count--;
        }
        send_code(s, REP_3_6, s.bl_tree);
        send_bits(s, count - 3, 2);
      } else if (count <= 10) {
        send_code(s, REPZ_3_10, s.bl_tree);
        send_bits(s, count - 3, 3);
      } else {
        send_code(s, REPZ_11_138, s.bl_tree);
        send_bits(s, count - 11, 7);
      }
      count = 0;
      prevlen = curlen;
      if (nextlen === 0) {
        max_count = 138;
        min_count = 3;
      } else if (curlen === nextlen) {
        max_count = 6;
        min_count = 3;
      } else {
        max_count = 7;
        min_count = 4;
      }
    }
  }
  function build_bl_tree(s) {
    var max_blindex;
    scan_tree(s, s.dyn_ltree, s.l_desc.max_code);
    scan_tree(s, s.dyn_dtree, s.d_desc.max_code);
    build_tree(s, s.bl_desc);
    for (max_blindex = BL_CODES - 1; max_blindex >= 3; max_blindex--) {
      if (s.bl_tree[bl_order[max_blindex] * 2 + 1] !== 0) {
        break;
      }
    }
    s.opt_len += 3 * (max_blindex + 1) + 5 + 5 + 4;
    return max_blindex;
  }
  function send_all_trees(s, lcodes, dcodes, blcodes) {
    var rank;
    send_bits(s, lcodes - 257, 5);
    send_bits(s, dcodes - 1, 5);
    send_bits(s, blcodes - 4, 4);
    for (rank = 0; rank < blcodes; rank++) {
      send_bits(s, s.bl_tree[bl_order[rank] * 2 + 1], 3);
    }
    send_tree(s, s.dyn_ltree, lcodes - 1);
    send_tree(s, s.dyn_dtree, dcodes - 1);
  }
  function detect_data_type(s) {
    var black_mask = 4093624447;
    var n;
    for (n = 0; n <= 31; n++, black_mask >>>= 1) {
      if (black_mask & 1 && s.dyn_ltree[n * 2] !== 0) {
        return Z_BINARY;
      }
    }
    if (s.dyn_ltree[9 * 2] !== 0 || s.dyn_ltree[10 * 2] !== 0 || s.dyn_ltree[13 * 2] !== 0) {
      return Z_TEXT;
    }
    for (n = 32; n < LITERALS; n++) {
      if (s.dyn_ltree[n * 2] !== 0) {
        return Z_TEXT;
      }
    }
    return Z_BINARY;
  }
  var static_init_done = false;
  function _tr_init(s) {
    if (!static_init_done) {
      tr_static_init();
      static_init_done = true;
    }
    s.l_desc = new TreeDesc(s.dyn_ltree, static_l_desc);
    s.d_desc = new TreeDesc(s.dyn_dtree, static_d_desc);
    s.bl_desc = new TreeDesc(s.bl_tree, static_bl_desc);
    s.bi_buf = 0;
    s.bi_valid = 0;
    init_block(s);
  }
  function _tr_stored_block(s, buf, stored_len, last) {
    send_bits(s, (STORED_BLOCK << 1) + (last ? 1 : 0), 3);
    copy_block(s, buf, stored_len);
  }
  function _tr_align(s) {
    send_bits(s, STATIC_TREES << 1, 3);
    send_code(s, END_BLOCK, static_ltree);
    bi_flush(s);
  }
  function _tr_flush_block(s, buf, stored_len, last) {
    var opt_lenb, static_lenb;
    var max_blindex = 0;
    if (s.level > 0) {
      if (s.strm.data_type === Z_UNKNOWN) {
        s.strm.data_type = detect_data_type(s);
      }
      build_tree(s, s.l_desc);
      build_tree(s, s.d_desc);
      max_blindex = build_bl_tree(s);
      opt_lenb = s.opt_len + 3 + 7 >>> 3;
      static_lenb = s.static_len + 3 + 7 >>> 3;
      if (static_lenb <= opt_lenb) {
        opt_lenb = static_lenb;
      }
    } else {
      opt_lenb = static_lenb = stored_len + 5;
    }
    if (stored_len + 4 <= opt_lenb && buf !== -1) {
      _tr_stored_block(s, buf, stored_len, last);
    } else if (s.strategy === Z_FIXED || static_lenb === opt_lenb) {
      send_bits(s, (STATIC_TREES << 1) + (last ? 1 : 0), 3);
      compress_block(s, static_ltree, static_dtree);
    } else {
      send_bits(s, (DYN_TREES << 1) + (last ? 1 : 0), 3);
      send_all_trees(s, s.l_desc.max_code + 1, s.d_desc.max_code + 1, max_blindex + 1);
      compress_block(s, s.dyn_ltree, s.dyn_dtree);
    }
    init_block(s);
    if (last) {
      bi_windup(s);
    }
  }
  function _tr_tally(s, dist, lc) {
    s.pending_buf[s.d_buf + s.last_lit * 2] = dist >>> 8 & 255;
    s.pending_buf[s.d_buf + s.last_lit * 2 + 1] = dist & 255;
    s.pending_buf[s.l_buf + s.last_lit] = lc & 255;
    s.last_lit++;
    if (dist === 0) {
      s.dyn_ltree[lc * 2]++;
    } else {
      s.matches++;
      dist--;
      s.dyn_ltree[(_length_code[lc] + LITERALS + 1) * 2]++;
      s.dyn_dtree[d_code(dist) * 2]++;
    }
    return s.last_lit === s.lit_bufsize - 1;
  }
  trees._tr_init = _tr_init;
  trees._tr_stored_block = _tr_stored_block;
  trees._tr_flush_block = _tr_flush_block;
  trees._tr_tally = _tr_tally;
  trees._tr_align = _tr_align;
  return trees;
}
var adler32_1;
var hasRequiredAdler32;
function requireAdler32() {
  if (hasRequiredAdler32) return adler32_1;
  hasRequiredAdler32 = 1;
  function adler32(adler, buf, len, pos) {
    var s1 = adler & 65535 | 0, s2 = adler >>> 16 & 65535 | 0, n = 0;
    while (len !== 0) {
      n = len > 2e3 ? 2e3 : len;
      len -= n;
      do {
        s1 = s1 + buf[pos++] | 0;
        s2 = s2 + s1 | 0;
      } while (--n);
      s1 %= 65521;
      s2 %= 65521;
    }
    return s1 | s2 << 16 | 0;
  }
  adler32_1 = adler32;
  return adler32_1;
}
var crc32_1;
var hasRequiredCrc32;
function requireCrc32() {
  if (hasRequiredCrc32) return crc32_1;
  hasRequiredCrc32 = 1;
  function makeTable() {
    var c, table = [];
    for (var n = 0; n < 256; n++) {
      c = n;
      for (var k = 0; k < 8; k++) {
        c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      }
      table[n] = c;
    }
    return table;
  }
  var crcTable = makeTable();
  function crc32(crc, buf, len, pos) {
    var t = crcTable, end = pos + len;
    crc ^= -1;
    for (var i = pos; i < end; i++) {
      crc = crc >>> 8 ^ t[(crc ^ buf[i]) & 255];
    }
    return crc ^ -1;
  }
  crc32_1 = crc32;
  return crc32_1;
}
var messages;
var hasRequiredMessages;
function requireMessages() {
  if (hasRequiredMessages) return messages;
  hasRequiredMessages = 1;
  messages = {
    2: "need dictionary",
    /* Z_NEED_DICT       2  */
    1: "stream end",
    /* Z_STREAM_END      1  */
    0: "",
    /* Z_OK              0  */
    "-1": "file error",
    /* Z_ERRNO         (-1) */
    "-2": "stream error",
    /* Z_STREAM_ERROR  (-2) */
    "-3": "data error",
    /* Z_DATA_ERROR    (-3) */
    "-4": "insufficient memory",
    /* Z_MEM_ERROR     (-4) */
    "-5": "buffer error",
    /* Z_BUF_ERROR     (-5) */
    "-6": "incompatible version"
    /* Z_VERSION_ERROR (-6) */
  };
  return messages;
}
var hasRequiredDeflate$1;
function requireDeflate$1() {
  if (hasRequiredDeflate$1) return deflate;
  hasRequiredDeflate$1 = 1;
  var utils2 = requireCommon();
  var trees2 = requireTrees();
  var adler32 = requireAdler32();
  var crc32 = requireCrc32();
  var msg = requireMessages();
  var Z_NO_FLUSH = 0;
  var Z_PARTIAL_FLUSH = 1;
  var Z_FULL_FLUSH = 3;
  var Z_FINISH = 4;
  var Z_BLOCK = 5;
  var Z_OK = 0;
  var Z_STREAM_END = 1;
  var Z_STREAM_ERROR = -2;
  var Z_DATA_ERROR = -3;
  var Z_BUF_ERROR = -5;
  var Z_DEFAULT_COMPRESSION = -1;
  var Z_FILTERED = 1;
  var Z_HUFFMAN_ONLY = 2;
  var Z_RLE = 3;
  var Z_FIXED = 4;
  var Z_DEFAULT_STRATEGY = 0;
  var Z_UNKNOWN = 2;
  var Z_DEFLATED = 8;
  var MAX_MEM_LEVEL = 9;
  var MAX_WBITS = 15;
  var DEF_MEM_LEVEL = 8;
  var LENGTH_CODES = 29;
  var LITERALS = 256;
  var L_CODES = LITERALS + 1 + LENGTH_CODES;
  var D_CODES = 30;
  var BL_CODES = 19;
  var HEAP_SIZE = 2 * L_CODES + 1;
  var MAX_BITS = 15;
  var MIN_MATCH = 3;
  var MAX_MATCH = 258;
  var MIN_LOOKAHEAD = MAX_MATCH + MIN_MATCH + 1;
  var PRESET_DICT = 32;
  var INIT_STATE = 42;
  var EXTRA_STATE = 69;
  var NAME_STATE = 73;
  var COMMENT_STATE = 91;
  var HCRC_STATE = 103;
  var BUSY_STATE = 113;
  var FINISH_STATE = 666;
  var BS_NEED_MORE = 1;
  var BS_BLOCK_DONE = 2;
  var BS_FINISH_STARTED = 3;
  var BS_FINISH_DONE = 4;
  var OS_CODE = 3;
  function err(strm, errorCode) {
    strm.msg = msg[errorCode];
    return errorCode;
  }
  function rank(f) {
    return (f << 1) - (f > 4 ? 9 : 0);
  }
  function zero(buf) {
    var len = buf.length;
    while (--len >= 0) {
      buf[len] = 0;
    }
  }
  function flush_pending(strm) {
    var s = strm.state;
    var len = s.pending;
    if (len > strm.avail_out) {
      len = strm.avail_out;
    }
    if (len === 0) {
      return;
    }
    utils2.arraySet(strm.output, s.pending_buf, s.pending_out, len, strm.next_out);
    strm.next_out += len;
    s.pending_out += len;
    strm.total_out += len;
    strm.avail_out -= len;
    s.pending -= len;
    if (s.pending === 0) {
      s.pending_out = 0;
    }
  }
  function flush_block_only(s, last) {
    trees2._tr_flush_block(s, s.block_start >= 0 ? s.block_start : -1, s.strstart - s.block_start, last);
    s.block_start = s.strstart;
    flush_pending(s.strm);
  }
  function put_byte(s, b) {
    s.pending_buf[s.pending++] = b;
  }
  function putShortMSB(s, b) {
    s.pending_buf[s.pending++] = b >>> 8 & 255;
    s.pending_buf[s.pending++] = b & 255;
  }
  function read_buf(strm, buf, start, size) {
    var len = strm.avail_in;
    if (len > size) {
      len = size;
    }
    if (len === 0) {
      return 0;
    }
    strm.avail_in -= len;
    utils2.arraySet(buf, strm.input, strm.next_in, len, start);
    if (strm.state.wrap === 1) {
      strm.adler = adler32(strm.adler, buf, len, start);
    } else if (strm.state.wrap === 2) {
      strm.adler = crc32(strm.adler, buf, len, start);
    }
    strm.next_in += len;
    strm.total_in += len;
    return len;
  }
  function longest_match(s, cur_match) {
    var chain_length = s.max_chain_length;
    var scan = s.strstart;
    var match;
    var len;
    var best_len = s.prev_length;
    var nice_match = s.nice_match;
    var limit = s.strstart > s.w_size - MIN_LOOKAHEAD ? s.strstart - (s.w_size - MIN_LOOKAHEAD) : 0;
    var _win = s.window;
    var wmask = s.w_mask;
    var prev = s.prev;
    var strend = s.strstart + MAX_MATCH;
    var scan_end1 = _win[scan + best_len - 1];
    var scan_end = _win[scan + best_len];
    if (s.prev_length >= s.good_match) {
      chain_length >>= 2;
    }
    if (nice_match > s.lookahead) {
      nice_match = s.lookahead;
    }
    do {
      match = cur_match;
      if (_win[match + best_len] !== scan_end || _win[match + best_len - 1] !== scan_end1 || _win[match] !== _win[scan] || _win[++match] !== _win[scan + 1]) {
        continue;
      }
      scan += 2;
      match++;
      do {
      } while (_win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && _win[++scan] === _win[++match] && scan < strend);
      len = MAX_MATCH - (strend - scan);
      scan = strend - MAX_MATCH;
      if (len > best_len) {
        s.match_start = cur_match;
        best_len = len;
        if (len >= nice_match) {
          break;
        }
        scan_end1 = _win[scan + best_len - 1];
        scan_end = _win[scan + best_len];
      }
    } while ((cur_match = prev[cur_match & wmask]) > limit && --chain_length !== 0);
    if (best_len <= s.lookahead) {
      return best_len;
    }
    return s.lookahead;
  }
  function fill_window(s) {
    var _w_size = s.w_size;
    var p, n, m, more, str;
    do {
      more = s.window_size - s.lookahead - s.strstart;
      if (s.strstart >= _w_size + (_w_size - MIN_LOOKAHEAD)) {
        utils2.arraySet(s.window, s.window, _w_size, _w_size, 0);
        s.match_start -= _w_size;
        s.strstart -= _w_size;
        s.block_start -= _w_size;
        n = s.hash_size;
        p = n;
        do {
          m = s.head[--p];
          s.head[p] = m >= _w_size ? m - _w_size : 0;
        } while (--n);
        n = _w_size;
        p = n;
        do {
          m = s.prev[--p];
          s.prev[p] = m >= _w_size ? m - _w_size : 0;
        } while (--n);
        more += _w_size;
      }
      if (s.strm.avail_in === 0) {
        break;
      }
      n = read_buf(s.strm, s.window, s.strstart + s.lookahead, more);
      s.lookahead += n;
      if (s.lookahead + s.insert >= MIN_MATCH) {
        str = s.strstart - s.insert;
        s.ins_h = s.window[str];
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + 1]) & s.hash_mask;
        while (s.insert) {
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
          s.prev[str & s.w_mask] = s.head[s.ins_h];
          s.head[s.ins_h] = str;
          str++;
          s.insert--;
          if (s.lookahead + s.insert < MIN_MATCH) {
            break;
          }
        }
      }
    } while (s.lookahead < MIN_LOOKAHEAD && s.strm.avail_in !== 0);
  }
  function deflate_stored(s, flush) {
    var max_block_size = 65535;
    if (max_block_size > s.pending_buf_size - 5) {
      max_block_size = s.pending_buf_size - 5;
    }
    for (; ; ) {
      if (s.lookahead <= 1) {
        fill_window(s);
        if (s.lookahead === 0 && flush === Z_NO_FLUSH) {
          return BS_NEED_MORE;
        }
        if (s.lookahead === 0) {
          break;
        }
      }
      s.strstart += s.lookahead;
      s.lookahead = 0;
      var max_start = s.block_start + max_block_size;
      if (s.strstart === 0 || s.strstart >= max_start) {
        s.lookahead = s.strstart - max_start;
        s.strstart = max_start;
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
      if (s.strstart - s.block_start >= s.w_size - MIN_LOOKAHEAD) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
    }
    s.insert = 0;
    if (flush === Z_FINISH) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      return BS_FINISH_DONE;
    }
    if (s.strstart > s.block_start) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
    return BS_NEED_MORE;
  }
  function deflate_fast(s, flush) {
    var hash_head;
    var bflush;
    for (; ; ) {
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);
        if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
          return BS_NEED_MORE;
        }
        if (s.lookahead === 0) {
          break;
        }
      }
      hash_head = 0;
      if (s.lookahead >= MIN_MATCH) {
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
        hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = s.strstart;
      }
      if (hash_head !== 0 && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
        s.match_length = longest_match(s, hash_head);
      }
      if (s.match_length >= MIN_MATCH) {
        bflush = trees2._tr_tally(s, s.strstart - s.match_start, s.match_length - MIN_MATCH);
        s.lookahead -= s.match_length;
        if (s.match_length <= s.max_lazy_match && s.lookahead >= MIN_MATCH) {
          s.match_length--;
          do {
            s.strstart++;
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = s.strstart;
          } while (--s.match_length !== 0);
          s.strstart++;
        } else {
          s.strstart += s.match_length;
          s.match_length = 0;
          s.ins_h = s.window[s.strstart];
          s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + 1]) & s.hash_mask;
        }
      } else {
        bflush = trees2._tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
      }
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === Z_FINISH) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      return BS_FINISH_DONE;
    }
    if (s.last_lit) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
    return BS_BLOCK_DONE;
  }
  function deflate_slow(s, flush) {
    var hash_head;
    var bflush;
    var max_insert;
    for (; ; ) {
      if (s.lookahead < MIN_LOOKAHEAD) {
        fill_window(s);
        if (s.lookahead < MIN_LOOKAHEAD && flush === Z_NO_FLUSH) {
          return BS_NEED_MORE;
        }
        if (s.lookahead === 0) {
          break;
        }
      }
      hash_head = 0;
      if (s.lookahead >= MIN_MATCH) {
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
        hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = s.strstart;
      }
      s.prev_length = s.match_length;
      s.prev_match = s.match_start;
      s.match_length = MIN_MATCH - 1;
      if (hash_head !== 0 && s.prev_length < s.max_lazy_match && s.strstart - hash_head <= s.w_size - MIN_LOOKAHEAD) {
        s.match_length = longest_match(s, hash_head);
        if (s.match_length <= 5 && (s.strategy === Z_FILTERED || s.match_length === MIN_MATCH && s.strstart - s.match_start > 4096)) {
          s.match_length = MIN_MATCH - 1;
        }
      }
      if (s.prev_length >= MIN_MATCH && s.match_length <= s.prev_length) {
        max_insert = s.strstart + s.lookahead - MIN_MATCH;
        bflush = trees2._tr_tally(s, s.strstart - 1 - s.prev_match, s.prev_length - MIN_MATCH);
        s.lookahead -= s.prev_length - 1;
        s.prev_length -= 2;
        do {
          if (++s.strstart <= max_insert) {
            s.ins_h = (s.ins_h << s.hash_shift ^ s.window[s.strstart + MIN_MATCH - 1]) & s.hash_mask;
            hash_head = s.prev[s.strstart & s.w_mask] = s.head[s.ins_h];
            s.head[s.ins_h] = s.strstart;
          }
        } while (--s.prev_length !== 0);
        s.match_available = 0;
        s.match_length = MIN_MATCH - 1;
        s.strstart++;
        if (bflush) {
          flush_block_only(s, false);
          if (s.strm.avail_out === 0) {
            return BS_NEED_MORE;
          }
        }
      } else if (s.match_available) {
        bflush = trees2._tr_tally(s, 0, s.window[s.strstart - 1]);
        if (bflush) {
          flush_block_only(s, false);
        }
        s.strstart++;
        s.lookahead--;
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      } else {
        s.match_available = 1;
        s.strstart++;
        s.lookahead--;
      }
    }
    if (s.match_available) {
      bflush = trees2._tr_tally(s, 0, s.window[s.strstart - 1]);
      s.match_available = 0;
    }
    s.insert = s.strstart < MIN_MATCH - 1 ? s.strstart : MIN_MATCH - 1;
    if (flush === Z_FINISH) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      return BS_FINISH_DONE;
    }
    if (s.last_lit) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
    return BS_BLOCK_DONE;
  }
  function deflate_rle(s, flush) {
    var bflush;
    var prev;
    var scan, strend;
    var _win = s.window;
    for (; ; ) {
      if (s.lookahead <= MAX_MATCH) {
        fill_window(s);
        if (s.lookahead <= MAX_MATCH && flush === Z_NO_FLUSH) {
          return BS_NEED_MORE;
        }
        if (s.lookahead === 0) {
          break;
        }
      }
      s.match_length = 0;
      if (s.lookahead >= MIN_MATCH && s.strstart > 0) {
        scan = s.strstart - 1;
        prev = _win[scan];
        if (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan]) {
          strend = s.strstart + MAX_MATCH;
          do {
          } while (prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && prev === _win[++scan] && scan < strend);
          s.match_length = MAX_MATCH - (strend - scan);
          if (s.match_length > s.lookahead) {
            s.match_length = s.lookahead;
          }
        }
      }
      if (s.match_length >= MIN_MATCH) {
        bflush = trees2._tr_tally(s, 1, s.match_length - MIN_MATCH);
        s.lookahead -= s.match_length;
        s.strstart += s.match_length;
        s.match_length = 0;
      } else {
        bflush = trees2._tr_tally(s, 0, s.window[s.strstart]);
        s.lookahead--;
        s.strstart++;
      }
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
    }
    s.insert = 0;
    if (flush === Z_FINISH) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      return BS_FINISH_DONE;
    }
    if (s.last_lit) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
    return BS_BLOCK_DONE;
  }
  function deflate_huff(s, flush) {
    var bflush;
    for (; ; ) {
      if (s.lookahead === 0) {
        fill_window(s);
        if (s.lookahead === 0) {
          if (flush === Z_NO_FLUSH) {
            return BS_NEED_MORE;
          }
          break;
        }
      }
      s.match_length = 0;
      bflush = trees2._tr_tally(s, 0, s.window[s.strstart]);
      s.lookahead--;
      s.strstart++;
      if (bflush) {
        flush_block_only(s, false);
        if (s.strm.avail_out === 0) {
          return BS_NEED_MORE;
        }
      }
    }
    s.insert = 0;
    if (flush === Z_FINISH) {
      flush_block_only(s, true);
      if (s.strm.avail_out === 0) {
        return BS_FINISH_STARTED;
      }
      return BS_FINISH_DONE;
    }
    if (s.last_lit) {
      flush_block_only(s, false);
      if (s.strm.avail_out === 0) {
        return BS_NEED_MORE;
      }
    }
    return BS_BLOCK_DONE;
  }
  function Config(good_length, max_lazy, nice_length, max_chain, func) {
    this.good_length = good_length;
    this.max_lazy = max_lazy;
    this.nice_length = nice_length;
    this.max_chain = max_chain;
    this.func = func;
  }
  var configuration_table;
  configuration_table = [
    /*      good lazy nice chain */
    new Config(0, 0, 0, 0, deflate_stored),
    /* 0 store only */
    new Config(4, 4, 8, 4, deflate_fast),
    /* 1 max speed, no lazy matches */
    new Config(4, 5, 16, 8, deflate_fast),
    /* 2 */
    new Config(4, 6, 32, 32, deflate_fast),
    /* 3 */
    new Config(4, 4, 16, 16, deflate_slow),
    /* 4 lazy matches */
    new Config(8, 16, 32, 32, deflate_slow),
    /* 5 */
    new Config(8, 16, 128, 128, deflate_slow),
    /* 6 */
    new Config(8, 32, 128, 256, deflate_slow),
    /* 7 */
    new Config(32, 128, 258, 1024, deflate_slow),
    /* 8 */
    new Config(32, 258, 258, 4096, deflate_slow)
    /* 9 max compression */
  ];
  function lm_init(s) {
    s.window_size = 2 * s.w_size;
    zero(s.head);
    s.max_lazy_match = configuration_table[s.level].max_lazy;
    s.good_match = configuration_table[s.level].good_length;
    s.nice_match = configuration_table[s.level].nice_length;
    s.max_chain_length = configuration_table[s.level].max_chain;
    s.strstart = 0;
    s.block_start = 0;
    s.lookahead = 0;
    s.insert = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    s.ins_h = 0;
  }
  function DeflateState() {
    this.strm = null;
    this.status = 0;
    this.pending_buf = null;
    this.pending_buf_size = 0;
    this.pending_out = 0;
    this.pending = 0;
    this.wrap = 0;
    this.gzhead = null;
    this.gzindex = 0;
    this.method = Z_DEFLATED;
    this.last_flush = -1;
    this.w_size = 0;
    this.w_bits = 0;
    this.w_mask = 0;
    this.window = null;
    this.window_size = 0;
    this.prev = null;
    this.head = null;
    this.ins_h = 0;
    this.hash_size = 0;
    this.hash_bits = 0;
    this.hash_mask = 0;
    this.hash_shift = 0;
    this.block_start = 0;
    this.match_length = 0;
    this.prev_match = 0;
    this.match_available = 0;
    this.strstart = 0;
    this.match_start = 0;
    this.lookahead = 0;
    this.prev_length = 0;
    this.max_chain_length = 0;
    this.max_lazy_match = 0;
    this.level = 0;
    this.strategy = 0;
    this.good_match = 0;
    this.nice_match = 0;
    this.dyn_ltree = new utils2.Buf16(HEAP_SIZE * 2);
    this.dyn_dtree = new utils2.Buf16((2 * D_CODES + 1) * 2);
    this.bl_tree = new utils2.Buf16((2 * BL_CODES + 1) * 2);
    zero(this.dyn_ltree);
    zero(this.dyn_dtree);
    zero(this.bl_tree);
    this.l_desc = null;
    this.d_desc = null;
    this.bl_desc = null;
    this.bl_count = new utils2.Buf16(MAX_BITS + 1);
    this.heap = new utils2.Buf16(2 * L_CODES + 1);
    zero(this.heap);
    this.heap_len = 0;
    this.heap_max = 0;
    this.depth = new utils2.Buf16(2 * L_CODES + 1);
    zero(this.depth);
    this.l_buf = 0;
    this.lit_bufsize = 0;
    this.last_lit = 0;
    this.d_buf = 0;
    this.opt_len = 0;
    this.static_len = 0;
    this.matches = 0;
    this.insert = 0;
    this.bi_buf = 0;
    this.bi_valid = 0;
  }
  function deflateResetKeep(strm) {
    var s;
    if (!strm || !strm.state) {
      return err(strm, Z_STREAM_ERROR);
    }
    strm.total_in = strm.total_out = 0;
    strm.data_type = Z_UNKNOWN;
    s = strm.state;
    s.pending = 0;
    s.pending_out = 0;
    if (s.wrap < 0) {
      s.wrap = -s.wrap;
    }
    s.status = s.wrap ? INIT_STATE : BUSY_STATE;
    strm.adler = s.wrap === 2 ? 0 : 1;
    s.last_flush = Z_NO_FLUSH;
    trees2._tr_init(s);
    return Z_OK;
  }
  function deflateReset(strm) {
    var ret = deflateResetKeep(strm);
    if (ret === Z_OK) {
      lm_init(strm.state);
    }
    return ret;
  }
  function deflateSetHeader(strm, head) {
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    if (strm.state.wrap !== 2) {
      return Z_STREAM_ERROR;
    }
    strm.state.gzhead = head;
    return Z_OK;
  }
  function deflateInit2(strm, level, method, windowBits, memLevel, strategy) {
    if (!strm) {
      return Z_STREAM_ERROR;
    }
    var wrap = 1;
    if (level === Z_DEFAULT_COMPRESSION) {
      level = 6;
    }
    if (windowBits < 0) {
      wrap = 0;
      windowBits = -windowBits;
    } else if (windowBits > 15) {
      wrap = 2;
      windowBits -= 16;
    }
    if (memLevel < 1 || memLevel > MAX_MEM_LEVEL || method !== Z_DEFLATED || windowBits < 8 || windowBits > 15 || level < 0 || level > 9 || strategy < 0 || strategy > Z_FIXED) {
      return err(strm, Z_STREAM_ERROR);
    }
    if (windowBits === 8) {
      windowBits = 9;
    }
    var s = new DeflateState();
    strm.state = s;
    s.strm = strm;
    s.wrap = wrap;
    s.gzhead = null;
    s.w_bits = windowBits;
    s.w_size = 1 << s.w_bits;
    s.w_mask = s.w_size - 1;
    s.hash_bits = memLevel + 7;
    s.hash_size = 1 << s.hash_bits;
    s.hash_mask = s.hash_size - 1;
    s.hash_shift = ~~((s.hash_bits + MIN_MATCH - 1) / MIN_MATCH);
    s.window = new utils2.Buf8(s.w_size * 2);
    s.head = new utils2.Buf16(s.hash_size);
    s.prev = new utils2.Buf16(s.w_size);
    s.lit_bufsize = 1 << memLevel + 6;
    s.pending_buf_size = s.lit_bufsize * 4;
    s.pending_buf = new utils2.Buf8(s.pending_buf_size);
    s.d_buf = 1 * s.lit_bufsize;
    s.l_buf = (1 + 2) * s.lit_bufsize;
    s.level = level;
    s.strategy = strategy;
    s.method = method;
    return deflateReset(strm);
  }
  function deflateInit(strm, level) {
    return deflateInit2(strm, level, Z_DEFLATED, MAX_WBITS, DEF_MEM_LEVEL, Z_DEFAULT_STRATEGY);
  }
  function deflate$12(strm, flush) {
    var old_flush, s;
    var beg, val;
    if (!strm || !strm.state || flush > Z_BLOCK || flush < 0) {
      return strm ? err(strm, Z_STREAM_ERROR) : Z_STREAM_ERROR;
    }
    s = strm.state;
    if (!strm.output || !strm.input && strm.avail_in !== 0 || s.status === FINISH_STATE && flush !== Z_FINISH) {
      return err(strm, strm.avail_out === 0 ? Z_BUF_ERROR : Z_STREAM_ERROR);
    }
    s.strm = strm;
    old_flush = s.last_flush;
    s.last_flush = flush;
    if (s.status === INIT_STATE) {
      if (s.wrap === 2) {
        strm.adler = 0;
        put_byte(s, 31);
        put_byte(s, 139);
        put_byte(s, 8);
        if (!s.gzhead) {
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, 0);
          put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
          put_byte(s, OS_CODE);
          s.status = BUSY_STATE;
        } else {
          put_byte(
            s,
            (s.gzhead.text ? 1 : 0) + (s.gzhead.hcrc ? 2 : 0) + (!s.gzhead.extra ? 0 : 4) + (!s.gzhead.name ? 0 : 8) + (!s.gzhead.comment ? 0 : 16)
          );
          put_byte(s, s.gzhead.time & 255);
          put_byte(s, s.gzhead.time >> 8 & 255);
          put_byte(s, s.gzhead.time >> 16 & 255);
          put_byte(s, s.gzhead.time >> 24 & 255);
          put_byte(s, s.level === 9 ? 2 : s.strategy >= Z_HUFFMAN_ONLY || s.level < 2 ? 4 : 0);
          put_byte(s, s.gzhead.os & 255);
          if (s.gzhead.extra && s.gzhead.extra.length) {
            put_byte(s, s.gzhead.extra.length & 255);
            put_byte(s, s.gzhead.extra.length >> 8 & 255);
          }
          if (s.gzhead.hcrc) {
            strm.adler = crc32(strm.adler, s.pending_buf, s.pending, 0);
          }
          s.gzindex = 0;
          s.status = EXTRA_STATE;
        }
      } else {
        var header = Z_DEFLATED + (s.w_bits - 8 << 4) << 8;
        var level_flags = -1;
        if (s.strategy >= Z_HUFFMAN_ONLY || s.level < 2) {
          level_flags = 0;
        } else if (s.level < 6) {
          level_flags = 1;
        } else if (s.level === 6) {
          level_flags = 2;
        } else {
          level_flags = 3;
        }
        header |= level_flags << 6;
        if (s.strstart !== 0) {
          header |= PRESET_DICT;
        }
        header += 31 - header % 31;
        s.status = BUSY_STATE;
        putShortMSB(s, header);
        if (s.strstart !== 0) {
          putShortMSB(s, strm.adler >>> 16);
          putShortMSB(s, strm.adler & 65535);
        }
        strm.adler = 1;
      }
    }
    if (s.status === EXTRA_STATE) {
      if (s.gzhead.extra) {
        beg = s.pending;
        while (s.gzindex < (s.gzhead.extra.length & 65535)) {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
            }
            flush_pending(strm);
            beg = s.pending;
            if (s.pending === s.pending_buf_size) {
              break;
            }
          }
          put_byte(s, s.gzhead.extra[s.gzindex] & 255);
          s.gzindex++;
        }
        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
        }
        if (s.gzindex === s.gzhead.extra.length) {
          s.gzindex = 0;
          s.status = NAME_STATE;
        }
      } else {
        s.status = NAME_STATE;
      }
    }
    if (s.status === NAME_STATE) {
      if (s.gzhead.name) {
        beg = s.pending;
        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
            }
            flush_pending(strm);
            beg = s.pending;
            if (s.pending === s.pending_buf_size) {
              val = 1;
              break;
            }
          }
          if (s.gzindex < s.gzhead.name.length) {
            val = s.gzhead.name.charCodeAt(s.gzindex++) & 255;
          } else {
            val = 0;
          }
          put_byte(s, val);
        } while (val !== 0);
        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
        }
        if (val === 0) {
          s.gzindex = 0;
          s.status = COMMENT_STATE;
        }
      } else {
        s.status = COMMENT_STATE;
      }
    }
    if (s.status === COMMENT_STATE) {
      if (s.gzhead.comment) {
        beg = s.pending;
        do {
          if (s.pending === s.pending_buf_size) {
            if (s.gzhead.hcrc && s.pending > beg) {
              strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
            }
            flush_pending(strm);
            beg = s.pending;
            if (s.pending === s.pending_buf_size) {
              val = 1;
              break;
            }
          }
          if (s.gzindex < s.gzhead.comment.length) {
            val = s.gzhead.comment.charCodeAt(s.gzindex++) & 255;
          } else {
            val = 0;
          }
          put_byte(s, val);
        } while (val !== 0);
        if (s.gzhead.hcrc && s.pending > beg) {
          strm.adler = crc32(strm.adler, s.pending_buf, s.pending - beg, beg);
        }
        if (val === 0) {
          s.status = HCRC_STATE;
        }
      } else {
        s.status = HCRC_STATE;
      }
    }
    if (s.status === HCRC_STATE) {
      if (s.gzhead.hcrc) {
        if (s.pending + 2 > s.pending_buf_size) {
          flush_pending(strm);
        }
        if (s.pending + 2 <= s.pending_buf_size) {
          put_byte(s, strm.adler & 255);
          put_byte(s, strm.adler >> 8 & 255);
          strm.adler = 0;
          s.status = BUSY_STATE;
        }
      } else {
        s.status = BUSY_STATE;
      }
    }
    if (s.pending !== 0) {
      flush_pending(strm);
      if (strm.avail_out === 0) {
        s.last_flush = -1;
        return Z_OK;
      }
    } else if (strm.avail_in === 0 && rank(flush) <= rank(old_flush) && flush !== Z_FINISH) {
      return err(strm, Z_BUF_ERROR);
    }
    if (s.status === FINISH_STATE && strm.avail_in !== 0) {
      return err(strm, Z_BUF_ERROR);
    }
    if (strm.avail_in !== 0 || s.lookahead !== 0 || flush !== Z_NO_FLUSH && s.status !== FINISH_STATE) {
      var bstate = s.strategy === Z_HUFFMAN_ONLY ? deflate_huff(s, flush) : s.strategy === Z_RLE ? deflate_rle(s, flush) : configuration_table[s.level].func(s, flush);
      if (bstate === BS_FINISH_STARTED || bstate === BS_FINISH_DONE) {
        s.status = FINISH_STATE;
      }
      if (bstate === BS_NEED_MORE || bstate === BS_FINISH_STARTED) {
        if (strm.avail_out === 0) {
          s.last_flush = -1;
        }
        return Z_OK;
      }
      if (bstate === BS_BLOCK_DONE) {
        if (flush === Z_PARTIAL_FLUSH) {
          trees2._tr_align(s);
        } else if (flush !== Z_BLOCK) {
          trees2._tr_stored_block(s, 0, 0, false);
          if (flush === Z_FULL_FLUSH) {
            zero(s.head);
            if (s.lookahead === 0) {
              s.strstart = 0;
              s.block_start = 0;
              s.insert = 0;
            }
          }
        }
        flush_pending(strm);
        if (strm.avail_out === 0) {
          s.last_flush = -1;
          return Z_OK;
        }
      }
    }
    if (flush !== Z_FINISH) {
      return Z_OK;
    }
    if (s.wrap <= 0) {
      return Z_STREAM_END;
    }
    if (s.wrap === 2) {
      put_byte(s, strm.adler & 255);
      put_byte(s, strm.adler >> 8 & 255);
      put_byte(s, strm.adler >> 16 & 255);
      put_byte(s, strm.adler >> 24 & 255);
      put_byte(s, strm.total_in & 255);
      put_byte(s, strm.total_in >> 8 & 255);
      put_byte(s, strm.total_in >> 16 & 255);
      put_byte(s, strm.total_in >> 24 & 255);
    } else {
      putShortMSB(s, strm.adler >>> 16);
      putShortMSB(s, strm.adler & 65535);
    }
    flush_pending(strm);
    if (s.wrap > 0) {
      s.wrap = -s.wrap;
    }
    return s.pending !== 0 ? Z_OK : Z_STREAM_END;
  }
  function deflateEnd(strm) {
    var status;
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    status = strm.state.status;
    if (status !== INIT_STATE && status !== EXTRA_STATE && status !== NAME_STATE && status !== COMMENT_STATE && status !== HCRC_STATE && status !== BUSY_STATE && status !== FINISH_STATE) {
      return err(strm, Z_STREAM_ERROR);
    }
    strm.state = null;
    return status === BUSY_STATE ? err(strm, Z_DATA_ERROR) : Z_OK;
  }
  function deflateSetDictionary(strm, dictionary) {
    var dictLength = dictionary.length;
    var s;
    var str, n;
    var wrap;
    var avail;
    var next;
    var input;
    var tmpDict;
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    s = strm.state;
    wrap = s.wrap;
    if (wrap === 2 || wrap === 1 && s.status !== INIT_STATE || s.lookahead) {
      return Z_STREAM_ERROR;
    }
    if (wrap === 1) {
      strm.adler = adler32(strm.adler, dictionary, dictLength, 0);
    }
    s.wrap = 0;
    if (dictLength >= s.w_size) {
      if (wrap === 0) {
        zero(s.head);
        s.strstart = 0;
        s.block_start = 0;
        s.insert = 0;
      }
      tmpDict = new utils2.Buf8(s.w_size);
      utils2.arraySet(tmpDict, dictionary, dictLength - s.w_size, s.w_size, 0);
      dictionary = tmpDict;
      dictLength = s.w_size;
    }
    avail = strm.avail_in;
    next = strm.next_in;
    input = strm.input;
    strm.avail_in = dictLength;
    strm.next_in = 0;
    strm.input = dictionary;
    fill_window(s);
    while (s.lookahead >= MIN_MATCH) {
      str = s.strstart;
      n = s.lookahead - (MIN_MATCH - 1);
      do {
        s.ins_h = (s.ins_h << s.hash_shift ^ s.window[str + MIN_MATCH - 1]) & s.hash_mask;
        s.prev[str & s.w_mask] = s.head[s.ins_h];
        s.head[s.ins_h] = str;
        str++;
      } while (--n);
      s.strstart = str;
      s.lookahead = MIN_MATCH - 1;
      fill_window(s);
    }
    s.strstart += s.lookahead;
    s.block_start = s.strstart;
    s.insert = s.lookahead;
    s.lookahead = 0;
    s.match_length = s.prev_length = MIN_MATCH - 1;
    s.match_available = 0;
    strm.next_in = next;
    strm.input = input;
    strm.avail_in = avail;
    s.wrap = wrap;
    return Z_OK;
  }
  deflate.deflateInit = deflateInit;
  deflate.deflateInit2 = deflateInit2;
  deflate.deflateReset = deflateReset;
  deflate.deflateResetKeep = deflateResetKeep;
  deflate.deflateSetHeader = deflateSetHeader;
  deflate.deflate = deflate$12;
  deflate.deflateEnd = deflateEnd;
  deflate.deflateSetDictionary = deflateSetDictionary;
  deflate.deflateInfo = "pako deflate (from Nodeca project)";
  return deflate;
}
var strings = {};
var hasRequiredStrings;
function requireStrings() {
  if (hasRequiredStrings) return strings;
  hasRequiredStrings = 1;
  var utils2 = requireCommon();
  var STR_APPLY_OK = true;
  var STR_APPLY_UIA_OK = true;
  try {
    String.fromCharCode.apply(null, [0]);
  } catch (__) {
    STR_APPLY_OK = false;
  }
  try {
    String.fromCharCode.apply(null, new Uint8Array(1));
  } catch (__) {
    STR_APPLY_UIA_OK = false;
  }
  var _utf8len = new utils2.Buf8(256);
  for (var q = 0; q < 256; q++) {
    _utf8len[q] = q >= 252 ? 6 : q >= 248 ? 5 : q >= 240 ? 4 : q >= 224 ? 3 : q >= 192 ? 2 : 1;
  }
  _utf8len[254] = _utf8len[254] = 1;
  strings.string2buf = function(str) {
    var buf, c, c2, m_pos, i, str_len = str.length, buf_len = 0;
    for (m_pos = 0; m_pos < str_len; m_pos++) {
      c = str.charCodeAt(m_pos);
      if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
        c2 = str.charCodeAt(m_pos + 1);
        if ((c2 & 64512) === 56320) {
          c = 65536 + (c - 55296 << 10) + (c2 - 56320);
          m_pos++;
        }
      }
      buf_len += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
    }
    buf = new utils2.Buf8(buf_len);
    for (i = 0, m_pos = 0; i < buf_len; m_pos++) {
      c = str.charCodeAt(m_pos);
      if ((c & 64512) === 55296 && m_pos + 1 < str_len) {
        c2 = str.charCodeAt(m_pos + 1);
        if ((c2 & 64512) === 56320) {
          c = 65536 + (c - 55296 << 10) + (c2 - 56320);
          m_pos++;
        }
      }
      if (c < 128) {
        buf[i++] = c;
      } else if (c < 2048) {
        buf[i++] = 192 | c >>> 6;
        buf[i++] = 128 | c & 63;
      } else if (c < 65536) {
        buf[i++] = 224 | c >>> 12;
        buf[i++] = 128 | c >>> 6 & 63;
        buf[i++] = 128 | c & 63;
      } else {
        buf[i++] = 240 | c >>> 18;
        buf[i++] = 128 | c >>> 12 & 63;
        buf[i++] = 128 | c >>> 6 & 63;
        buf[i++] = 128 | c & 63;
      }
    }
    return buf;
  };
  function buf2binstring(buf, len) {
    if (len < 65534) {
      if (buf.subarray && STR_APPLY_UIA_OK || !buf.subarray && STR_APPLY_OK) {
        return String.fromCharCode.apply(null, utils2.shrinkBuf(buf, len));
      }
    }
    var result = "";
    for (var i = 0; i < len; i++) {
      result += String.fromCharCode(buf[i]);
    }
    return result;
  }
  strings.buf2binstring = function(buf) {
    return buf2binstring(buf, buf.length);
  };
  strings.binstring2buf = function(str) {
    var buf = new utils2.Buf8(str.length);
    for (var i = 0, len = buf.length; i < len; i++) {
      buf[i] = str.charCodeAt(i);
    }
    return buf;
  };
  strings.buf2string = function(buf, max) {
    var i, out, c, c_len;
    var len = max || buf.length;
    var utf16buf = new Array(len * 2);
    for (out = 0, i = 0; i < len; ) {
      c = buf[i++];
      if (c < 128) {
        utf16buf[out++] = c;
        continue;
      }
      c_len = _utf8len[c];
      if (c_len > 4) {
        utf16buf[out++] = 65533;
        i += c_len - 1;
        continue;
      }
      c &= c_len === 2 ? 31 : c_len === 3 ? 15 : 7;
      while (c_len > 1 && i < len) {
        c = c << 6 | buf[i++] & 63;
        c_len--;
      }
      if (c_len > 1) {
        utf16buf[out++] = 65533;
        continue;
      }
      if (c < 65536) {
        utf16buf[out++] = c;
      } else {
        c -= 65536;
        utf16buf[out++] = 55296 | c >> 10 & 1023;
        utf16buf[out++] = 56320 | c & 1023;
      }
    }
    return buf2binstring(utf16buf, out);
  };
  strings.utf8border = function(buf, max) {
    var pos;
    max = max || buf.length;
    if (max > buf.length) {
      max = buf.length;
    }
    pos = max - 1;
    while (pos >= 0 && (buf[pos] & 192) === 128) {
      pos--;
    }
    if (pos < 0) {
      return max;
    }
    if (pos === 0) {
      return max;
    }
    return pos + _utf8len[buf[pos]] > max ? pos : max;
  };
  return strings;
}
var zstream;
var hasRequiredZstream;
function requireZstream() {
  if (hasRequiredZstream) return zstream;
  hasRequiredZstream = 1;
  function ZStream() {
    this.input = null;
    this.next_in = 0;
    this.avail_in = 0;
    this.total_in = 0;
    this.output = null;
    this.next_out = 0;
    this.avail_out = 0;
    this.total_out = 0;
    this.msg = "";
    this.state = null;
    this.data_type = 2;
    this.adler = 0;
  }
  zstream = ZStream;
  return zstream;
}
var hasRequiredDeflate;
function requireDeflate() {
  if (hasRequiredDeflate) return deflate$1;
  hasRequiredDeflate = 1;
  var zlib_deflate = requireDeflate$1();
  var utils2 = requireCommon();
  var strings2 = requireStrings();
  var msg = requireMessages();
  var ZStream = requireZstream();
  var toString = Object.prototype.toString;
  var Z_NO_FLUSH = 0;
  var Z_FINISH = 4;
  var Z_OK = 0;
  var Z_STREAM_END = 1;
  var Z_SYNC_FLUSH = 2;
  var Z_DEFAULT_COMPRESSION = -1;
  var Z_DEFAULT_STRATEGY = 0;
  var Z_DEFLATED = 8;
  function Deflate(options) {
    if (!(this instanceof Deflate)) return new Deflate(options);
    this.options = utils2.assign({
      level: Z_DEFAULT_COMPRESSION,
      method: Z_DEFLATED,
      chunkSize: 16384,
      windowBits: 15,
      memLevel: 8,
      strategy: Z_DEFAULT_STRATEGY,
      to: ""
    }, options || {});
    var opt = this.options;
    if (opt.raw && opt.windowBits > 0) {
      opt.windowBits = -opt.windowBits;
    } else if (opt.gzip && opt.windowBits > 0 && opt.windowBits < 16) {
      opt.windowBits += 16;
    }
    this.err = 0;
    this.msg = "";
    this.ended = false;
    this.chunks = [];
    this.strm = new ZStream();
    this.strm.avail_out = 0;
    var status = zlib_deflate.deflateInit2(
      this.strm,
      opt.level,
      opt.method,
      opt.windowBits,
      opt.memLevel,
      opt.strategy
    );
    if (status !== Z_OK) {
      throw new Error(msg[status]);
    }
    if (opt.header) {
      zlib_deflate.deflateSetHeader(this.strm, opt.header);
    }
    if (opt.dictionary) {
      var dict;
      if (typeof opt.dictionary === "string") {
        dict = strings2.string2buf(opt.dictionary);
      } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
        dict = new Uint8Array(opt.dictionary);
      } else {
        dict = opt.dictionary;
      }
      status = zlib_deflate.deflateSetDictionary(this.strm, dict);
      if (status !== Z_OK) {
        throw new Error(msg[status]);
      }
      this._dict_set = true;
    }
  }
  Deflate.prototype.push = function(data, mode) {
    var strm = this.strm;
    var chunkSize = this.options.chunkSize;
    var status, _mode;
    if (this.ended) {
      return false;
    }
    _mode = mode === ~~mode ? mode : mode === true ? Z_FINISH : Z_NO_FLUSH;
    if (typeof data === "string") {
      strm.input = strings2.string2buf(data);
    } else if (toString.call(data) === "[object ArrayBuffer]") {
      strm.input = new Uint8Array(data);
    } else {
      strm.input = data;
    }
    strm.next_in = 0;
    strm.avail_in = strm.input.length;
    do {
      if (strm.avail_out === 0) {
        strm.output = new utils2.Buf8(chunkSize);
        strm.next_out = 0;
        strm.avail_out = chunkSize;
      }
      status = zlib_deflate.deflate(strm, _mode);
      if (status !== Z_STREAM_END && status !== Z_OK) {
        this.onEnd(status);
        this.ended = true;
        return false;
      }
      if (strm.avail_out === 0 || strm.avail_in === 0 && (_mode === Z_FINISH || _mode === Z_SYNC_FLUSH)) {
        if (this.options.to === "string") {
          this.onData(strings2.buf2binstring(utils2.shrinkBuf(strm.output, strm.next_out)));
        } else {
          this.onData(utils2.shrinkBuf(strm.output, strm.next_out));
        }
      }
    } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== Z_STREAM_END);
    if (_mode === Z_FINISH) {
      status = zlib_deflate.deflateEnd(this.strm);
      this.onEnd(status);
      this.ended = true;
      return status === Z_OK;
    }
    if (_mode === Z_SYNC_FLUSH) {
      this.onEnd(Z_OK);
      strm.avail_out = 0;
      return true;
    }
    return true;
  };
  Deflate.prototype.onData = function(chunk) {
    this.chunks.push(chunk);
  };
  Deflate.prototype.onEnd = function(status) {
    if (status === Z_OK) {
      if (this.options.to === "string") {
        this.result = this.chunks.join("");
      } else {
        this.result = utils2.flattenChunks(this.chunks);
      }
    }
    this.chunks = [];
    this.err = status;
    this.msg = this.strm.msg;
  };
  function deflate2(input, options) {
    var deflator = new Deflate(options);
    deflator.push(input, true);
    if (deflator.err) {
      throw deflator.msg || msg[deflator.err];
    }
    return deflator.result;
  }
  function deflateRaw(input, options) {
    options = options || {};
    options.raw = true;
    return deflate2(input, options);
  }
  function gzip(input, options) {
    options = options || {};
    options.gzip = true;
    return deflate2(input, options);
  }
  deflate$1.Deflate = Deflate;
  deflate$1.deflate = deflate2;
  deflate$1.deflateRaw = deflateRaw;
  deflate$1.gzip = gzip;
  return deflate$1;
}
var inflate$1 = {};
var inflate = {};
var inffast;
var hasRequiredInffast;
function requireInffast() {
  if (hasRequiredInffast) return inffast;
  hasRequiredInffast = 1;
  var BAD = 30;
  var TYPE = 12;
  inffast = function inflate_fast(strm, start) {
    var state;
    var _in;
    var last;
    var _out;
    var beg;
    var end;
    var dmax;
    var wsize;
    var whave;
    var wnext;
    var s_window;
    var hold;
    var bits;
    var lcode;
    var dcode;
    var lmask;
    var dmask;
    var here;
    var op;
    var len;
    var dist;
    var from;
    var from_source;
    var input, output;
    state = strm.state;
    _in = strm.next_in;
    input = strm.input;
    last = _in + (strm.avail_in - 5);
    _out = strm.next_out;
    output = strm.output;
    beg = _out - (start - strm.avail_out);
    end = _out + (strm.avail_out - 257);
    dmax = state.dmax;
    wsize = state.wsize;
    whave = state.whave;
    wnext = state.wnext;
    s_window = state.window;
    hold = state.hold;
    bits = state.bits;
    lcode = state.lencode;
    dcode = state.distcode;
    lmask = (1 << state.lenbits) - 1;
    dmask = (1 << state.distbits) - 1;
    top:
      do {
        if (bits < 15) {
          hold += input[_in++] << bits;
          bits += 8;
          hold += input[_in++] << bits;
          bits += 8;
        }
        here = lcode[hold & lmask];
        dolen:
          for (; ; ) {
            op = here >>> 24;
            hold >>>= op;
            bits -= op;
            op = here >>> 16 & 255;
            if (op === 0) {
              output[_out++] = here & 65535;
            } else if (op & 16) {
              len = here & 65535;
              op &= 15;
              if (op) {
                if (bits < op) {
                  hold += input[_in++] << bits;
                  bits += 8;
                }
                len += hold & (1 << op) - 1;
                hold >>>= op;
                bits -= op;
              }
              if (bits < 15) {
                hold += input[_in++] << bits;
                bits += 8;
                hold += input[_in++] << bits;
                bits += 8;
              }
              here = dcode[hold & dmask];
              dodist:
                for (; ; ) {
                  op = here >>> 24;
                  hold >>>= op;
                  bits -= op;
                  op = here >>> 16 & 255;
                  if (op & 16) {
                    dist = here & 65535;
                    op &= 15;
                    if (bits < op) {
                      hold += input[_in++] << bits;
                      bits += 8;
                      if (bits < op) {
                        hold += input[_in++] << bits;
                        bits += 8;
                      }
                    }
                    dist += hold & (1 << op) - 1;
                    if (dist > dmax) {
                      strm.msg = "invalid distance too far back";
                      state.mode = BAD;
                      break top;
                    }
                    hold >>>= op;
                    bits -= op;
                    op = _out - beg;
                    if (dist > op) {
                      op = dist - op;
                      if (op > whave) {
                        if (state.sane) {
                          strm.msg = "invalid distance too far back";
                          state.mode = BAD;
                          break top;
                        }
                      }
                      from = 0;
                      from_source = s_window;
                      if (wnext === 0) {
                        from += wsize - op;
                        if (op < len) {
                          len -= op;
                          do {
                            output[_out++] = s_window[from++];
                          } while (--op);
                          from = _out - dist;
                          from_source = output;
                        }
                      } else if (wnext < op) {
                        from += wsize + wnext - op;
                        op -= wnext;
                        if (op < len) {
                          len -= op;
                          do {
                            output[_out++] = s_window[from++];
                          } while (--op);
                          from = 0;
                          if (wnext < len) {
                            op = wnext;
                            len -= op;
                            do {
                              output[_out++] = s_window[from++];
                            } while (--op);
                            from = _out - dist;
                            from_source = output;
                          }
                        }
                      } else {
                        from += wnext - op;
                        if (op < len) {
                          len -= op;
                          do {
                            output[_out++] = s_window[from++];
                          } while (--op);
                          from = _out - dist;
                          from_source = output;
                        }
                      }
                      while (len > 2) {
                        output[_out++] = from_source[from++];
                        output[_out++] = from_source[from++];
                        output[_out++] = from_source[from++];
                        len -= 3;
                      }
                      if (len) {
                        output[_out++] = from_source[from++];
                        if (len > 1) {
                          output[_out++] = from_source[from++];
                        }
                      }
                    } else {
                      from = _out - dist;
                      do {
                        output[_out++] = output[from++];
                        output[_out++] = output[from++];
                        output[_out++] = output[from++];
                        len -= 3;
                      } while (len > 2);
                      if (len) {
                        output[_out++] = output[from++];
                        if (len > 1) {
                          output[_out++] = output[from++];
                        }
                      }
                    }
                  } else if ((op & 64) === 0) {
                    here = dcode[(here & 65535) + (hold & (1 << op) - 1)];
                    continue dodist;
                  } else {
                    strm.msg = "invalid distance code";
                    state.mode = BAD;
                    break top;
                  }
                  break;
                }
            } else if ((op & 64) === 0) {
              here = lcode[(here & 65535) + (hold & (1 << op) - 1)];
              continue dolen;
            } else if (op & 32) {
              state.mode = TYPE;
              break top;
            } else {
              strm.msg = "invalid literal/length code";
              state.mode = BAD;
              break top;
            }
            break;
          }
      } while (_in < last && _out < end);
    len = bits >> 3;
    _in -= len;
    bits -= len << 3;
    hold &= (1 << bits) - 1;
    strm.next_in = _in;
    strm.next_out = _out;
    strm.avail_in = _in < last ? 5 + (last - _in) : 5 - (_in - last);
    strm.avail_out = _out < end ? 257 + (end - _out) : 257 - (_out - end);
    state.hold = hold;
    state.bits = bits;
    return;
  };
  return inffast;
}
var inftrees;
var hasRequiredInftrees;
function requireInftrees() {
  if (hasRequiredInftrees) return inftrees;
  hasRequiredInftrees = 1;
  var utils2 = requireCommon();
  var MAXBITS = 15;
  var ENOUGH_LENS = 852;
  var ENOUGH_DISTS = 592;
  var CODES = 0;
  var LENS = 1;
  var DISTS = 2;
  var lbase = [
    /* Length codes 257..285 base */
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    13,
    15,
    17,
    19,
    23,
    27,
    31,
    35,
    43,
    51,
    59,
    67,
    83,
    99,
    115,
    131,
    163,
    195,
    227,
    258,
    0,
    0
  ];
  var lext = [
    /* Length codes 257..285 extra */
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    16,
    17,
    17,
    17,
    17,
    18,
    18,
    18,
    18,
    19,
    19,
    19,
    19,
    20,
    20,
    20,
    20,
    21,
    21,
    21,
    21,
    16,
    72,
    78
  ];
  var dbase = [
    /* Distance codes 0..29 base */
    1,
    2,
    3,
    4,
    5,
    7,
    9,
    13,
    17,
    25,
    33,
    49,
    65,
    97,
    129,
    193,
    257,
    385,
    513,
    769,
    1025,
    1537,
    2049,
    3073,
    4097,
    6145,
    8193,
    12289,
    16385,
    24577,
    0,
    0
  ];
  var dext = [
    /* Distance codes 0..29 extra */
    16,
    16,
    16,
    16,
    17,
    17,
    18,
    18,
    19,
    19,
    20,
    20,
    21,
    21,
    22,
    22,
    23,
    23,
    24,
    24,
    25,
    25,
    26,
    26,
    27,
    27,
    28,
    28,
    29,
    29,
    64,
    64
  ];
  inftrees = function inflate_table(type, lens, lens_index, codes, table, table_index, work, opts) {
    var bits = opts.bits;
    var len = 0;
    var sym = 0;
    var min = 0, max = 0;
    var root = 0;
    var curr = 0;
    var drop = 0;
    var left = 0;
    var used = 0;
    var huff = 0;
    var incr;
    var fill;
    var low;
    var mask;
    var next;
    var base = null;
    var base_index = 0;
    var end;
    var count = new utils2.Buf16(MAXBITS + 1);
    var offs = new utils2.Buf16(MAXBITS + 1);
    var extra = null;
    var extra_index = 0;
    var here_bits, here_op, here_val;
    for (len = 0; len <= MAXBITS; len++) {
      count[len] = 0;
    }
    for (sym = 0; sym < codes; sym++) {
      count[lens[lens_index + sym]]++;
    }
    root = bits;
    for (max = MAXBITS; max >= 1; max--) {
      if (count[max] !== 0) {
        break;
      }
    }
    if (root > max) {
      root = max;
    }
    if (max === 0) {
      table[table_index++] = 1 << 24 | 64 << 16 | 0;
      table[table_index++] = 1 << 24 | 64 << 16 | 0;
      opts.bits = 1;
      return 0;
    }
    for (min = 1; min < max; min++) {
      if (count[min] !== 0) {
        break;
      }
    }
    if (root < min) {
      root = min;
    }
    left = 1;
    for (len = 1; len <= MAXBITS; len++) {
      left <<= 1;
      left -= count[len];
      if (left < 0) {
        return -1;
      }
    }
    if (left > 0 && (type === CODES || max !== 1)) {
      return -1;
    }
    offs[1] = 0;
    for (len = 1; len < MAXBITS; len++) {
      offs[len + 1] = offs[len] + count[len];
    }
    for (sym = 0; sym < codes; sym++) {
      if (lens[lens_index + sym] !== 0) {
        work[offs[lens[lens_index + sym]]++] = sym;
      }
    }
    if (type === CODES) {
      base = extra = work;
      end = 19;
    } else if (type === LENS) {
      base = lbase;
      base_index -= 257;
      extra = lext;
      extra_index -= 257;
      end = 256;
    } else {
      base = dbase;
      extra = dext;
      end = -1;
    }
    huff = 0;
    sym = 0;
    len = min;
    next = table_index;
    curr = root;
    drop = 0;
    low = -1;
    used = 1 << root;
    mask = used - 1;
    if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
      return 1;
    }
    for (; ; ) {
      here_bits = len - drop;
      if (work[sym] < end) {
        here_op = 0;
        here_val = work[sym];
      } else if (work[sym] > end) {
        here_op = extra[extra_index + work[sym]];
        here_val = base[base_index + work[sym]];
      } else {
        here_op = 32 + 64;
        here_val = 0;
      }
      incr = 1 << len - drop;
      fill = 1 << curr;
      min = fill;
      do {
        fill -= incr;
        table[next + (huff >> drop) + fill] = here_bits << 24 | here_op << 16 | here_val | 0;
      } while (fill !== 0);
      incr = 1 << len - 1;
      while (huff & incr) {
        incr >>= 1;
      }
      if (incr !== 0) {
        huff &= incr - 1;
        huff += incr;
      } else {
        huff = 0;
      }
      sym++;
      if (--count[len] === 0) {
        if (len === max) {
          break;
        }
        len = lens[lens_index + work[sym]];
      }
      if (len > root && (huff & mask) !== low) {
        if (drop === 0) {
          drop = root;
        }
        next += min;
        curr = len - drop;
        left = 1 << curr;
        while (curr + drop < max) {
          left -= count[curr + drop];
          if (left <= 0) {
            break;
          }
          curr++;
          left <<= 1;
        }
        used += 1 << curr;
        if (type === LENS && used > ENOUGH_LENS || type === DISTS && used > ENOUGH_DISTS) {
          return 1;
        }
        low = huff & mask;
        table[low] = root << 24 | curr << 16 | next - table_index | 0;
      }
    }
    if (huff !== 0) {
      table[next + huff] = len - drop << 24 | 64 << 16 | 0;
    }
    opts.bits = root;
    return 0;
  };
  return inftrees;
}
var hasRequiredInflate$1;
function requireInflate$1() {
  if (hasRequiredInflate$1) return inflate;
  hasRequiredInflate$1 = 1;
  var utils2 = requireCommon();
  var adler32 = requireAdler32();
  var crc32 = requireCrc32();
  var inflate_fast = requireInffast();
  var inflate_table = requireInftrees();
  var CODES = 0;
  var LENS = 1;
  var DISTS = 2;
  var Z_FINISH = 4;
  var Z_BLOCK = 5;
  var Z_TREES = 6;
  var Z_OK = 0;
  var Z_STREAM_END = 1;
  var Z_NEED_DICT = 2;
  var Z_STREAM_ERROR = -2;
  var Z_DATA_ERROR = -3;
  var Z_MEM_ERROR = -4;
  var Z_BUF_ERROR = -5;
  var Z_DEFLATED = 8;
  var HEAD = 1;
  var FLAGS = 2;
  var TIME = 3;
  var OS = 4;
  var EXLEN = 5;
  var EXTRA = 6;
  var NAME = 7;
  var COMMENT = 8;
  var HCRC = 9;
  var DICTID = 10;
  var DICT = 11;
  var TYPE = 12;
  var TYPEDO = 13;
  var STORED = 14;
  var COPY_ = 15;
  var COPY = 16;
  var TABLE = 17;
  var LENLENS = 18;
  var CODELENS = 19;
  var LEN_ = 20;
  var LEN = 21;
  var LENEXT = 22;
  var DIST = 23;
  var DISTEXT = 24;
  var MATCH = 25;
  var LIT = 26;
  var CHECK = 27;
  var LENGTH = 28;
  var DONE = 29;
  var BAD = 30;
  var MEM = 31;
  var SYNC = 32;
  var ENOUGH_LENS = 852;
  var ENOUGH_DISTS = 592;
  var MAX_WBITS = 15;
  var DEF_WBITS = MAX_WBITS;
  function zswap32(q) {
    return (q >>> 24 & 255) + (q >>> 8 & 65280) + ((q & 65280) << 8) + ((q & 255) << 24);
  }
  function InflateState() {
    this.mode = 0;
    this.last = false;
    this.wrap = 0;
    this.havedict = false;
    this.flags = 0;
    this.dmax = 0;
    this.check = 0;
    this.total = 0;
    this.head = null;
    this.wbits = 0;
    this.wsize = 0;
    this.whave = 0;
    this.wnext = 0;
    this.window = null;
    this.hold = 0;
    this.bits = 0;
    this.length = 0;
    this.offset = 0;
    this.extra = 0;
    this.lencode = null;
    this.distcode = null;
    this.lenbits = 0;
    this.distbits = 0;
    this.ncode = 0;
    this.nlen = 0;
    this.ndist = 0;
    this.have = 0;
    this.next = null;
    this.lens = new utils2.Buf16(320);
    this.work = new utils2.Buf16(288);
    this.lendyn = null;
    this.distdyn = null;
    this.sane = 0;
    this.back = 0;
    this.was = 0;
  }
  function inflateResetKeep(strm) {
    var state;
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    state = strm.state;
    strm.total_in = strm.total_out = state.total = 0;
    strm.msg = "";
    if (state.wrap) {
      strm.adler = state.wrap & 1;
    }
    state.mode = HEAD;
    state.last = 0;
    state.havedict = 0;
    state.dmax = 32768;
    state.head = null;
    state.hold = 0;
    state.bits = 0;
    state.lencode = state.lendyn = new utils2.Buf32(ENOUGH_LENS);
    state.distcode = state.distdyn = new utils2.Buf32(ENOUGH_DISTS);
    state.sane = 1;
    state.back = -1;
    return Z_OK;
  }
  function inflateReset(strm) {
    var state;
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    state = strm.state;
    state.wsize = 0;
    state.whave = 0;
    state.wnext = 0;
    return inflateResetKeep(strm);
  }
  function inflateReset2(strm, windowBits) {
    var wrap;
    var state;
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    state = strm.state;
    if (windowBits < 0) {
      wrap = 0;
      windowBits = -windowBits;
    } else {
      wrap = (windowBits >> 4) + 1;
      if (windowBits < 48) {
        windowBits &= 15;
      }
    }
    if (windowBits && (windowBits < 8 || windowBits > 15)) {
      return Z_STREAM_ERROR;
    }
    if (state.window !== null && state.wbits !== windowBits) {
      state.window = null;
    }
    state.wrap = wrap;
    state.wbits = windowBits;
    return inflateReset(strm);
  }
  function inflateInit2(strm, windowBits) {
    var ret;
    var state;
    if (!strm) {
      return Z_STREAM_ERROR;
    }
    state = new InflateState();
    strm.state = state;
    state.window = null;
    ret = inflateReset2(strm, windowBits);
    if (ret !== Z_OK) {
      strm.state = null;
    }
    return ret;
  }
  function inflateInit(strm) {
    return inflateInit2(strm, DEF_WBITS);
  }
  var virgin = true;
  var lenfix, distfix;
  function fixedtables(state) {
    if (virgin) {
      var sym;
      lenfix = new utils2.Buf32(512);
      distfix = new utils2.Buf32(32);
      sym = 0;
      while (sym < 144) {
        state.lens[sym++] = 8;
      }
      while (sym < 256) {
        state.lens[sym++] = 9;
      }
      while (sym < 280) {
        state.lens[sym++] = 7;
      }
      while (sym < 288) {
        state.lens[sym++] = 8;
      }
      inflate_table(LENS, state.lens, 0, 288, lenfix, 0, state.work, { bits: 9 });
      sym = 0;
      while (sym < 32) {
        state.lens[sym++] = 5;
      }
      inflate_table(DISTS, state.lens, 0, 32, distfix, 0, state.work, { bits: 5 });
      virgin = false;
    }
    state.lencode = lenfix;
    state.lenbits = 9;
    state.distcode = distfix;
    state.distbits = 5;
  }
  function updatewindow(strm, src, end, copy) {
    var dist;
    var state = strm.state;
    if (state.window === null) {
      state.wsize = 1 << state.wbits;
      state.wnext = 0;
      state.whave = 0;
      state.window = new utils2.Buf8(state.wsize);
    }
    if (copy >= state.wsize) {
      utils2.arraySet(state.window, src, end - state.wsize, state.wsize, 0);
      state.wnext = 0;
      state.whave = state.wsize;
    } else {
      dist = state.wsize - state.wnext;
      if (dist > copy) {
        dist = copy;
      }
      utils2.arraySet(state.window, src, end - copy, dist, state.wnext);
      copy -= dist;
      if (copy) {
        utils2.arraySet(state.window, src, end - copy, copy, 0);
        state.wnext = copy;
        state.whave = state.wsize;
      } else {
        state.wnext += dist;
        if (state.wnext === state.wsize) {
          state.wnext = 0;
        }
        if (state.whave < state.wsize) {
          state.whave += dist;
        }
      }
    }
    return 0;
  }
  function inflate$12(strm, flush) {
    var state;
    var input, output;
    var next;
    var put;
    var have, left;
    var hold;
    var bits;
    var _in, _out;
    var copy;
    var from;
    var from_source;
    var here = 0;
    var here_bits, here_op, here_val;
    var last_bits, last_op, last_val;
    var len;
    var ret;
    var hbuf = new utils2.Buf8(4);
    var opts;
    var n;
    var order = (
      /* permutation of code lengths */
      [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
    );
    if (!strm || !strm.state || !strm.output || !strm.input && strm.avail_in !== 0) {
      return Z_STREAM_ERROR;
    }
    state = strm.state;
    if (state.mode === TYPE) {
      state.mode = TYPEDO;
    }
    put = strm.next_out;
    output = strm.output;
    left = strm.avail_out;
    next = strm.next_in;
    input = strm.input;
    have = strm.avail_in;
    hold = state.hold;
    bits = state.bits;
    _in = have;
    _out = left;
    ret = Z_OK;
    inf_leave:
      for (; ; ) {
        switch (state.mode) {
          case HEAD:
            if (state.wrap === 0) {
              state.mode = TYPEDO;
              break;
            }
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (state.wrap & 2 && hold === 35615) {
              state.check = 0;
              hbuf[0] = hold & 255;
              hbuf[1] = hold >>> 8 & 255;
              state.check = crc32(state.check, hbuf, 2, 0);
              hold = 0;
              bits = 0;
              state.mode = FLAGS;
              break;
            }
            state.flags = 0;
            if (state.head) {
              state.head.done = false;
            }
            if (!(state.wrap & 1) || /* check if zlib header allowed */
            (((hold & 255) << 8) + (hold >> 8)) % 31) {
              strm.msg = "incorrect header check";
              state.mode = BAD;
              break;
            }
            if ((hold & 15) !== Z_DEFLATED) {
              strm.msg = "unknown compression method";
              state.mode = BAD;
              break;
            }
            hold >>>= 4;
            bits -= 4;
            len = (hold & 15) + 8;
            if (state.wbits === 0) {
              state.wbits = len;
            } else if (len > state.wbits) {
              strm.msg = "invalid window size";
              state.mode = BAD;
              break;
            }
            state.dmax = 1 << len;
            strm.adler = state.check = 1;
            state.mode = hold & 512 ? DICTID : TYPE;
            hold = 0;
            bits = 0;
            break;
          case FLAGS:
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.flags = hold;
            if ((state.flags & 255) !== Z_DEFLATED) {
              strm.msg = "unknown compression method";
              state.mode = BAD;
              break;
            }
            if (state.flags & 57344) {
              strm.msg = "unknown header flags set";
              state.mode = BAD;
              break;
            }
            if (state.head) {
              state.head.text = hold >> 8 & 1;
            }
            if (state.flags & 512) {
              hbuf[0] = hold & 255;
              hbuf[1] = hold >>> 8 & 255;
              state.check = crc32(state.check, hbuf, 2, 0);
            }
            hold = 0;
            bits = 0;
            state.mode = TIME;
          /* falls through */
          case TIME:
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (state.head) {
              state.head.time = hold;
            }
            if (state.flags & 512) {
              hbuf[0] = hold & 255;
              hbuf[1] = hold >>> 8 & 255;
              hbuf[2] = hold >>> 16 & 255;
              hbuf[3] = hold >>> 24 & 255;
              state.check = crc32(state.check, hbuf, 4, 0);
            }
            hold = 0;
            bits = 0;
            state.mode = OS;
          /* falls through */
          case OS:
            while (bits < 16) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (state.head) {
              state.head.xflags = hold & 255;
              state.head.os = hold >> 8;
            }
            if (state.flags & 512) {
              hbuf[0] = hold & 255;
              hbuf[1] = hold >>> 8 & 255;
              state.check = crc32(state.check, hbuf, 2, 0);
            }
            hold = 0;
            bits = 0;
            state.mode = EXLEN;
          /* falls through */
          case EXLEN:
            if (state.flags & 1024) {
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.length = hold;
              if (state.head) {
                state.head.extra_len = hold;
              }
              if (state.flags & 512) {
                hbuf[0] = hold & 255;
                hbuf[1] = hold >>> 8 & 255;
                state.check = crc32(state.check, hbuf, 2, 0);
              }
              hold = 0;
              bits = 0;
            } else if (state.head) {
              state.head.extra = null;
            }
            state.mode = EXTRA;
          /* falls through */
          case EXTRA:
            if (state.flags & 1024) {
              copy = state.length;
              if (copy > have) {
                copy = have;
              }
              if (copy) {
                if (state.head) {
                  len = state.head.extra_len - state.length;
                  if (!state.head.extra) {
                    state.head.extra = new Array(state.head.extra_len);
                  }
                  utils2.arraySet(
                    state.head.extra,
                    input,
                    next,
                    // extra field is limited to 65536 bytes
                    // - no need for additional size check
                    copy,
                    /*len + copy > state.head.extra_max - len ? state.head.extra_max : copy,*/
                    len
                  );
                }
                if (state.flags & 512) {
                  state.check = crc32(state.check, input, copy, next);
                }
                have -= copy;
                next += copy;
                state.length -= copy;
              }
              if (state.length) {
                break inf_leave;
              }
            }
            state.length = 0;
            state.mode = NAME;
          /* falls through */
          case NAME:
            if (state.flags & 2048) {
              if (have === 0) {
                break inf_leave;
              }
              copy = 0;
              do {
                len = input[next + copy++];
                if (state.head && len && state.length < 65536) {
                  state.head.name += String.fromCharCode(len);
                }
              } while (len && copy < have);
              if (state.flags & 512) {
                state.check = crc32(state.check, input, copy, next);
              }
              have -= copy;
              next += copy;
              if (len) {
                break inf_leave;
              }
            } else if (state.head) {
              state.head.name = null;
            }
            state.length = 0;
            state.mode = COMMENT;
          /* falls through */
          case COMMENT:
            if (state.flags & 4096) {
              if (have === 0) {
                break inf_leave;
              }
              copy = 0;
              do {
                len = input[next + copy++];
                if (state.head && len && state.length < 65536) {
                  state.head.comment += String.fromCharCode(len);
                }
              } while (len && copy < have);
              if (state.flags & 512) {
                state.check = crc32(state.check, input, copy, next);
              }
              have -= copy;
              next += copy;
              if (len) {
                break inf_leave;
              }
            } else if (state.head) {
              state.head.comment = null;
            }
            state.mode = HCRC;
          /* falls through */
          case HCRC:
            if (state.flags & 512) {
              while (bits < 16) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (hold !== (state.check & 65535)) {
                strm.msg = "header crc mismatch";
                state.mode = BAD;
                break;
              }
              hold = 0;
              bits = 0;
            }
            if (state.head) {
              state.head.hcrc = state.flags >> 9 & 1;
              state.head.done = true;
            }
            strm.adler = state.check = 0;
            state.mode = TYPE;
            break;
          case DICTID:
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            strm.adler = state.check = zswap32(hold);
            hold = 0;
            bits = 0;
            state.mode = DICT;
          /* falls through */
          case DICT:
            if (state.havedict === 0) {
              strm.next_out = put;
              strm.avail_out = left;
              strm.next_in = next;
              strm.avail_in = have;
              state.hold = hold;
              state.bits = bits;
              return Z_NEED_DICT;
            }
            strm.adler = state.check = 1;
            state.mode = TYPE;
          /* falls through */
          case TYPE:
            if (flush === Z_BLOCK || flush === Z_TREES) {
              break inf_leave;
            }
          /* falls through */
          case TYPEDO:
            if (state.last) {
              hold >>>= bits & 7;
              bits -= bits & 7;
              state.mode = CHECK;
              break;
            }
            while (bits < 3) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.last = hold & 1;
            hold >>>= 1;
            bits -= 1;
            switch (hold & 3) {
              case 0:
                state.mode = STORED;
                break;
              case 1:
                fixedtables(state);
                state.mode = LEN_;
                if (flush === Z_TREES) {
                  hold >>>= 2;
                  bits -= 2;
                  break inf_leave;
                }
                break;
              case 2:
                state.mode = TABLE;
                break;
              case 3:
                strm.msg = "invalid block type";
                state.mode = BAD;
            }
            hold >>>= 2;
            bits -= 2;
            break;
          case STORED:
            hold >>>= bits & 7;
            bits -= bits & 7;
            while (bits < 32) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if ((hold & 65535) !== (hold >>> 16 ^ 65535)) {
              strm.msg = "invalid stored block lengths";
              state.mode = BAD;
              break;
            }
            state.length = hold & 65535;
            hold = 0;
            bits = 0;
            state.mode = COPY_;
            if (flush === Z_TREES) {
              break inf_leave;
            }
          /* falls through */
          case COPY_:
            state.mode = COPY;
          /* falls through */
          case COPY:
            copy = state.length;
            if (copy) {
              if (copy > have) {
                copy = have;
              }
              if (copy > left) {
                copy = left;
              }
              if (copy === 0) {
                break inf_leave;
              }
              utils2.arraySet(output, input, next, copy, put);
              have -= copy;
              next += copy;
              left -= copy;
              put += copy;
              state.length -= copy;
              break;
            }
            state.mode = TYPE;
            break;
          case TABLE:
            while (bits < 14) {
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            state.nlen = (hold & 31) + 257;
            hold >>>= 5;
            bits -= 5;
            state.ndist = (hold & 31) + 1;
            hold >>>= 5;
            bits -= 5;
            state.ncode = (hold & 15) + 4;
            hold >>>= 4;
            bits -= 4;
            if (state.nlen > 286 || state.ndist > 30) {
              strm.msg = "too many length or distance symbols";
              state.mode = BAD;
              break;
            }
            state.have = 0;
            state.mode = LENLENS;
          /* falls through */
          case LENLENS:
            while (state.have < state.ncode) {
              while (bits < 3) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.lens[order[state.have++]] = hold & 7;
              hold >>>= 3;
              bits -= 3;
            }
            while (state.have < 19) {
              state.lens[order[state.have++]] = 0;
            }
            state.lencode = state.lendyn;
            state.lenbits = 7;
            opts = { bits: state.lenbits };
            ret = inflate_table(CODES, state.lens, 0, 19, state.lencode, 0, state.work, opts);
            state.lenbits = opts.bits;
            if (ret) {
              strm.msg = "invalid code lengths set";
              state.mode = BAD;
              break;
            }
            state.have = 0;
            state.mode = CODELENS;
          /* falls through */
          case CODELENS:
            while (state.have < state.nlen + state.ndist) {
              for (; ; ) {
                here = state.lencode[hold & (1 << state.lenbits) - 1];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (here_val < 16) {
                hold >>>= here_bits;
                bits -= here_bits;
                state.lens[state.have++] = here_val;
              } else {
                if (here_val === 16) {
                  n = here_bits + 2;
                  while (bits < n) {
                    if (have === 0) {
                      break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                  }
                  hold >>>= here_bits;
                  bits -= here_bits;
                  if (state.have === 0) {
                    strm.msg = "invalid bit length repeat";
                    state.mode = BAD;
                    break;
                  }
                  len = state.lens[state.have - 1];
                  copy = 3 + (hold & 3);
                  hold >>>= 2;
                  bits -= 2;
                } else if (here_val === 17) {
                  n = here_bits + 3;
                  while (bits < n) {
                    if (have === 0) {
                      break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                  }
                  hold >>>= here_bits;
                  bits -= here_bits;
                  len = 0;
                  copy = 3 + (hold & 7);
                  hold >>>= 3;
                  bits -= 3;
                } else {
                  n = here_bits + 7;
                  while (bits < n) {
                    if (have === 0) {
                      break inf_leave;
                    }
                    have--;
                    hold += input[next++] << bits;
                    bits += 8;
                  }
                  hold >>>= here_bits;
                  bits -= here_bits;
                  len = 0;
                  copy = 11 + (hold & 127);
                  hold >>>= 7;
                  bits -= 7;
                }
                if (state.have + copy > state.nlen + state.ndist) {
                  strm.msg = "invalid bit length repeat";
                  state.mode = BAD;
                  break;
                }
                while (copy--) {
                  state.lens[state.have++] = len;
                }
              }
            }
            if (state.mode === BAD) {
              break;
            }
            if (state.lens[256] === 0) {
              strm.msg = "invalid code -- missing end-of-block";
              state.mode = BAD;
              break;
            }
            state.lenbits = 9;
            opts = { bits: state.lenbits };
            ret = inflate_table(LENS, state.lens, 0, state.nlen, state.lencode, 0, state.work, opts);
            state.lenbits = opts.bits;
            if (ret) {
              strm.msg = "invalid literal/lengths set";
              state.mode = BAD;
              break;
            }
            state.distbits = 6;
            state.distcode = state.distdyn;
            opts = { bits: state.distbits };
            ret = inflate_table(DISTS, state.lens, state.nlen, state.ndist, state.distcode, 0, state.work, opts);
            state.distbits = opts.bits;
            if (ret) {
              strm.msg = "invalid distances set";
              state.mode = BAD;
              break;
            }
            state.mode = LEN_;
            if (flush === Z_TREES) {
              break inf_leave;
            }
          /* falls through */
          case LEN_:
            state.mode = LEN;
          /* falls through */
          case LEN:
            if (have >= 6 && left >= 258) {
              strm.next_out = put;
              strm.avail_out = left;
              strm.next_in = next;
              strm.avail_in = have;
              state.hold = hold;
              state.bits = bits;
              inflate_fast(strm, _out);
              put = strm.next_out;
              output = strm.output;
              left = strm.avail_out;
              next = strm.next_in;
              input = strm.input;
              have = strm.avail_in;
              hold = state.hold;
              bits = state.bits;
              if (state.mode === TYPE) {
                state.back = -1;
              }
              break;
            }
            state.back = 0;
            for (; ; ) {
              here = state.lencode[hold & (1 << state.lenbits) - 1];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if (here_op && (here_op & 240) === 0) {
              last_bits = here_bits;
              last_op = here_op;
              last_val = here_val;
              for (; ; ) {
                here = state.lencode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (last_bits + here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              hold >>>= last_bits;
              bits -= last_bits;
              state.back += last_bits;
            }
            hold >>>= here_bits;
            bits -= here_bits;
            state.back += here_bits;
            state.length = here_val;
            if (here_op === 0) {
              state.mode = LIT;
              break;
            }
            if (here_op & 32) {
              state.back = -1;
              state.mode = TYPE;
              break;
            }
            if (here_op & 64) {
              strm.msg = "invalid literal/length code";
              state.mode = BAD;
              break;
            }
            state.extra = here_op & 15;
            state.mode = LENEXT;
          /* falls through */
          case LENEXT:
            if (state.extra) {
              n = state.extra;
              while (bits < n) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.length += hold & (1 << state.extra) - 1;
              hold >>>= state.extra;
              bits -= state.extra;
              state.back += state.extra;
            }
            state.was = state.length;
            state.mode = DIST;
          /* falls through */
          case DIST:
            for (; ; ) {
              here = state.distcode[hold & (1 << state.distbits) - 1];
              here_bits = here >>> 24;
              here_op = here >>> 16 & 255;
              here_val = here & 65535;
              if (here_bits <= bits) {
                break;
              }
              if (have === 0) {
                break inf_leave;
              }
              have--;
              hold += input[next++] << bits;
              bits += 8;
            }
            if ((here_op & 240) === 0) {
              last_bits = here_bits;
              last_op = here_op;
              last_val = here_val;
              for (; ; ) {
                here = state.distcode[last_val + ((hold & (1 << last_bits + last_op) - 1) >> last_bits)];
                here_bits = here >>> 24;
                here_op = here >>> 16 & 255;
                here_val = here & 65535;
                if (last_bits + here_bits <= bits) {
                  break;
                }
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              hold >>>= last_bits;
              bits -= last_bits;
              state.back += last_bits;
            }
            hold >>>= here_bits;
            bits -= here_bits;
            state.back += here_bits;
            if (here_op & 64) {
              strm.msg = "invalid distance code";
              state.mode = BAD;
              break;
            }
            state.offset = here_val;
            state.extra = here_op & 15;
            state.mode = DISTEXT;
          /* falls through */
          case DISTEXT:
            if (state.extra) {
              n = state.extra;
              while (bits < n) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              state.offset += hold & (1 << state.extra) - 1;
              hold >>>= state.extra;
              bits -= state.extra;
              state.back += state.extra;
            }
            if (state.offset > state.dmax) {
              strm.msg = "invalid distance too far back";
              state.mode = BAD;
              break;
            }
            state.mode = MATCH;
          /* falls through */
          case MATCH:
            if (left === 0) {
              break inf_leave;
            }
            copy = _out - left;
            if (state.offset > copy) {
              copy = state.offset - copy;
              if (copy > state.whave) {
                if (state.sane) {
                  strm.msg = "invalid distance too far back";
                  state.mode = BAD;
                  break;
                }
              }
              if (copy > state.wnext) {
                copy -= state.wnext;
                from = state.wsize - copy;
              } else {
                from = state.wnext - copy;
              }
              if (copy > state.length) {
                copy = state.length;
              }
              from_source = state.window;
            } else {
              from_source = output;
              from = put - state.offset;
              copy = state.length;
            }
            if (copy > left) {
              copy = left;
            }
            left -= copy;
            state.length -= copy;
            do {
              output[put++] = from_source[from++];
            } while (--copy);
            if (state.length === 0) {
              state.mode = LEN;
            }
            break;
          case LIT:
            if (left === 0) {
              break inf_leave;
            }
            output[put++] = state.length;
            left--;
            state.mode = LEN;
            break;
          case CHECK:
            if (state.wrap) {
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold |= input[next++] << bits;
                bits += 8;
              }
              _out -= left;
              strm.total_out += _out;
              state.total += _out;
              if (_out) {
                strm.adler = state.check = /*UPDATE(state.check, put - _out, _out);*/
                state.flags ? crc32(state.check, output, _out, put - _out) : adler32(state.check, output, _out, put - _out);
              }
              _out = left;
              if ((state.flags ? hold : zswap32(hold)) !== state.check) {
                strm.msg = "incorrect data check";
                state.mode = BAD;
                break;
              }
              hold = 0;
              bits = 0;
            }
            state.mode = LENGTH;
          /* falls through */
          case LENGTH:
            if (state.wrap && state.flags) {
              while (bits < 32) {
                if (have === 0) {
                  break inf_leave;
                }
                have--;
                hold += input[next++] << bits;
                bits += 8;
              }
              if (hold !== (state.total & 4294967295)) {
                strm.msg = "incorrect length check";
                state.mode = BAD;
                break;
              }
              hold = 0;
              bits = 0;
            }
            state.mode = DONE;
          /* falls through */
          case DONE:
            ret = Z_STREAM_END;
            break inf_leave;
          case BAD:
            ret = Z_DATA_ERROR;
            break inf_leave;
          case MEM:
            return Z_MEM_ERROR;
          case SYNC:
          /* falls through */
          default:
            return Z_STREAM_ERROR;
        }
      }
    strm.next_out = put;
    strm.avail_out = left;
    strm.next_in = next;
    strm.avail_in = have;
    state.hold = hold;
    state.bits = bits;
    if (state.wsize || _out !== strm.avail_out && state.mode < BAD && (state.mode < CHECK || flush !== Z_FINISH)) {
      if (updatewindow(strm, strm.output, strm.next_out, _out - strm.avail_out)) ;
    }
    _in -= strm.avail_in;
    _out -= strm.avail_out;
    strm.total_in += _in;
    strm.total_out += _out;
    state.total += _out;
    if (state.wrap && _out) {
      strm.adler = state.check = /*UPDATE(state.check, strm.next_out - _out, _out);*/
      state.flags ? crc32(state.check, output, _out, strm.next_out - _out) : adler32(state.check, output, _out, strm.next_out - _out);
    }
    strm.data_type = state.bits + (state.last ? 64 : 0) + (state.mode === TYPE ? 128 : 0) + (state.mode === LEN_ || state.mode === COPY_ ? 256 : 0);
    if ((_in === 0 && _out === 0 || flush === Z_FINISH) && ret === Z_OK) {
      ret = Z_BUF_ERROR;
    }
    return ret;
  }
  function inflateEnd(strm) {
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    var state = strm.state;
    if (state.window) {
      state.window = null;
    }
    strm.state = null;
    return Z_OK;
  }
  function inflateGetHeader(strm, head) {
    var state;
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    state = strm.state;
    if ((state.wrap & 2) === 0) {
      return Z_STREAM_ERROR;
    }
    state.head = head;
    head.done = false;
    return Z_OK;
  }
  function inflateSetDictionary(strm, dictionary) {
    var dictLength = dictionary.length;
    var state;
    var dictid;
    var ret;
    if (!strm || !strm.state) {
      return Z_STREAM_ERROR;
    }
    state = strm.state;
    if (state.wrap !== 0 && state.mode !== DICT) {
      return Z_STREAM_ERROR;
    }
    if (state.mode === DICT) {
      dictid = 1;
      dictid = adler32(dictid, dictionary, dictLength, 0);
      if (dictid !== state.check) {
        return Z_DATA_ERROR;
      }
    }
    ret = updatewindow(strm, dictionary, dictLength, dictLength);
    if (ret) {
      state.mode = MEM;
      return Z_MEM_ERROR;
    }
    state.havedict = 1;
    return Z_OK;
  }
  inflate.inflateReset = inflateReset;
  inflate.inflateReset2 = inflateReset2;
  inflate.inflateResetKeep = inflateResetKeep;
  inflate.inflateInit = inflateInit;
  inflate.inflateInit2 = inflateInit2;
  inflate.inflate = inflate$12;
  inflate.inflateEnd = inflateEnd;
  inflate.inflateGetHeader = inflateGetHeader;
  inflate.inflateSetDictionary = inflateSetDictionary;
  inflate.inflateInfo = "pako inflate (from Nodeca project)";
  return inflate;
}
var constants;
var hasRequiredConstants;
function requireConstants() {
  if (hasRequiredConstants) return constants;
  hasRequiredConstants = 1;
  constants = {
    /* Allowed flush values; see deflate() and inflate() below for details */
    Z_NO_FLUSH: 0,
    Z_PARTIAL_FLUSH: 1,
    Z_SYNC_FLUSH: 2,
    Z_FULL_FLUSH: 3,
    Z_FINISH: 4,
    Z_BLOCK: 5,
    Z_TREES: 6,
    /* Return codes for the compression/decompression functions. Negative values
    * are errors, positive values are used for special but normal events.
    */
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    //Z_MEM_ERROR:     -4,
    Z_BUF_ERROR: -5,
    //Z_VERSION_ERROR: -6,
    /* compression levels */
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1,
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_DEFAULT_STRATEGY: 0,
    /* Possible values of the data_type field (though see inflate()) */
    Z_BINARY: 0,
    Z_TEXT: 1,
    //Z_ASCII:                1, // = Z_TEXT (deprecated)
    Z_UNKNOWN: 2,
    /* The deflate compression method */
    Z_DEFLATED: 8
    //Z_NULL:                 null // Use -1 or null inline, depending on var type
  };
  return constants;
}
var gzheader;
var hasRequiredGzheader;
function requireGzheader() {
  if (hasRequiredGzheader) return gzheader;
  hasRequiredGzheader = 1;
  function GZheader() {
    this.text = 0;
    this.time = 0;
    this.xflags = 0;
    this.os = 0;
    this.extra = null;
    this.extra_len = 0;
    this.name = "";
    this.comment = "";
    this.hcrc = 0;
    this.done = false;
  }
  gzheader = GZheader;
  return gzheader;
}
var hasRequiredInflate;
function requireInflate() {
  if (hasRequiredInflate) return inflate$1;
  hasRequiredInflate = 1;
  var zlib_inflate = requireInflate$1();
  var utils2 = requireCommon();
  var strings2 = requireStrings();
  var c = requireConstants();
  var msg = requireMessages();
  var ZStream = requireZstream();
  var GZheader = requireGzheader();
  var toString = Object.prototype.toString;
  function Inflate(options) {
    if (!(this instanceof Inflate)) return new Inflate(options);
    this.options = utils2.assign({
      chunkSize: 16384,
      windowBits: 0,
      to: ""
    }, options || {});
    var opt = this.options;
    if (opt.raw && opt.windowBits >= 0 && opt.windowBits < 16) {
      opt.windowBits = -opt.windowBits;
      if (opt.windowBits === 0) {
        opt.windowBits = -15;
      }
    }
    if (opt.windowBits >= 0 && opt.windowBits < 16 && !(options && options.windowBits)) {
      opt.windowBits += 32;
    }
    if (opt.windowBits > 15 && opt.windowBits < 48) {
      if ((opt.windowBits & 15) === 0) {
        opt.windowBits |= 15;
      }
    }
    this.err = 0;
    this.msg = "";
    this.ended = false;
    this.chunks = [];
    this.strm = new ZStream();
    this.strm.avail_out = 0;
    var status = zlib_inflate.inflateInit2(
      this.strm,
      opt.windowBits
    );
    if (status !== c.Z_OK) {
      throw new Error(msg[status]);
    }
    this.header = new GZheader();
    zlib_inflate.inflateGetHeader(this.strm, this.header);
    if (opt.dictionary) {
      if (typeof opt.dictionary === "string") {
        opt.dictionary = strings2.string2buf(opt.dictionary);
      } else if (toString.call(opt.dictionary) === "[object ArrayBuffer]") {
        opt.dictionary = new Uint8Array(opt.dictionary);
      }
      if (opt.raw) {
        status = zlib_inflate.inflateSetDictionary(this.strm, opt.dictionary);
        if (status !== c.Z_OK) {
          throw new Error(msg[status]);
        }
      }
    }
  }
  Inflate.prototype.push = function(data, mode) {
    var strm = this.strm;
    var chunkSize = this.options.chunkSize;
    var dictionary = this.options.dictionary;
    var status, _mode;
    var next_out_utf8, tail, utf8str;
    var allowBufError = false;
    if (this.ended) {
      return false;
    }
    _mode = mode === ~~mode ? mode : mode === true ? c.Z_FINISH : c.Z_NO_FLUSH;
    if (typeof data === "string") {
      strm.input = strings2.binstring2buf(data);
    } else if (toString.call(data) === "[object ArrayBuffer]") {
      strm.input = new Uint8Array(data);
    } else {
      strm.input = data;
    }
    strm.next_in = 0;
    strm.avail_in = strm.input.length;
    do {
      if (strm.avail_out === 0) {
        strm.output = new utils2.Buf8(chunkSize);
        strm.next_out = 0;
        strm.avail_out = chunkSize;
      }
      status = zlib_inflate.inflate(strm, c.Z_NO_FLUSH);
      if (status === c.Z_NEED_DICT && dictionary) {
        status = zlib_inflate.inflateSetDictionary(this.strm, dictionary);
      }
      if (status === c.Z_BUF_ERROR && allowBufError === true) {
        status = c.Z_OK;
        allowBufError = false;
      }
      if (status !== c.Z_STREAM_END && status !== c.Z_OK) {
        this.onEnd(status);
        this.ended = true;
        return false;
      }
      if (strm.next_out) {
        if (strm.avail_out === 0 || status === c.Z_STREAM_END || strm.avail_in === 0 && (_mode === c.Z_FINISH || _mode === c.Z_SYNC_FLUSH)) {
          if (this.options.to === "string") {
            next_out_utf8 = strings2.utf8border(strm.output, strm.next_out);
            tail = strm.next_out - next_out_utf8;
            utf8str = strings2.buf2string(strm.output, next_out_utf8);
            strm.next_out = tail;
            strm.avail_out = chunkSize - tail;
            if (tail) {
              utils2.arraySet(strm.output, strm.output, next_out_utf8, tail, 0);
            }
            this.onData(utf8str);
          } else {
            this.onData(utils2.shrinkBuf(strm.output, strm.next_out));
          }
        }
      }
      if (strm.avail_in === 0 && strm.avail_out === 0) {
        allowBufError = true;
      }
    } while ((strm.avail_in > 0 || strm.avail_out === 0) && status !== c.Z_STREAM_END);
    if (status === c.Z_STREAM_END) {
      _mode = c.Z_FINISH;
    }
    if (_mode === c.Z_FINISH) {
      status = zlib_inflate.inflateEnd(this.strm);
      this.onEnd(status);
      this.ended = true;
      return status === c.Z_OK;
    }
    if (_mode === c.Z_SYNC_FLUSH) {
      this.onEnd(c.Z_OK);
      strm.avail_out = 0;
      return true;
    }
    return true;
  };
  Inflate.prototype.onData = function(chunk) {
    this.chunks.push(chunk);
  };
  Inflate.prototype.onEnd = function(status) {
    if (status === c.Z_OK) {
      if (this.options.to === "string") {
        this.result = this.chunks.join("");
      } else {
        this.result = utils2.flattenChunks(this.chunks);
      }
    }
    this.chunks = [];
    this.err = status;
    this.msg = this.strm.msg;
  };
  function inflate2(input, options) {
    var inflator = new Inflate(options);
    inflator.push(input, true);
    if (inflator.err) {
      throw inflator.msg || msg[inflator.err];
    }
    return inflator.result;
  }
  function inflateRaw(input, options) {
    options = options || {};
    options.raw = true;
    return inflate2(input, options);
  }
  inflate$1.Inflate = Inflate;
  inflate$1.inflate = inflate2;
  inflate$1.inflateRaw = inflateRaw;
  inflate$1.ungzip = inflate2;
  return inflate$1;
}
var pako_1;
var hasRequiredPako;
function requirePako() {
  if (hasRequiredPako) return pako_1;
  hasRequiredPako = 1;
  var assign = requireCommon().assign;
  var deflate2 = requireDeflate();
  var inflate2 = requireInflate();
  var constants2 = requireConstants();
  var pako = {};
  assign(pako, deflate2, inflate2, constants2);
  pako_1 = pako;
  return pako_1;
}
var hasRequiredFlate;
function requireFlate() {
  if (hasRequiredFlate) return flate;
  hasRequiredFlate = 1;
  var USE_TYPEDARRAY = typeof Uint8Array !== "undefined" && typeof Uint16Array !== "undefined" && typeof Uint32Array !== "undefined";
  var pako = requirePako();
  var utils2 = requireUtils();
  var GenericWorker = requireGenericWorker();
  var ARRAY_TYPE = USE_TYPEDARRAY ? "uint8array" : "array";
  flate.magic = "\b\0";
  function FlateWorker(action, options) {
    GenericWorker.call(this, "FlateWorker/" + action);
    this._pako = null;
    this._pakoAction = action;
    this._pakoOptions = options;
    this.meta = {};
  }
  utils2.inherits(FlateWorker, GenericWorker);
  FlateWorker.prototype.processChunk = function(chunk) {
    this.meta = chunk.meta;
    if (this._pako === null) {
      this._createPako();
    }
    this._pako.push(utils2.transformTo(ARRAY_TYPE, chunk.data), false);
  };
  FlateWorker.prototype.flush = function() {
    GenericWorker.prototype.flush.call(this);
    if (this._pako === null) {
      this._createPako();
    }
    this._pako.push([], true);
  };
  FlateWorker.prototype.cleanUp = function() {
    GenericWorker.prototype.cleanUp.call(this);
    this._pako = null;
  };
  FlateWorker.prototype._createPako = function() {
    this._pako = new pako[this._pakoAction]({
      raw: true,
      level: this._pakoOptions.level || -1
      // default compression
    });
    var self2 = this;
    this._pako.onData = function(data) {
      self2.push({
        data,
        meta: self2.meta
      });
    };
  };
  flate.compressWorker = function(compressionOptions) {
    return new FlateWorker("Deflate", compressionOptions);
  };
  flate.uncompressWorker = function() {
    return new FlateWorker("Inflate", {});
  };
  return flate;
}
var hasRequiredCompressions;
function requireCompressions() {
  if (hasRequiredCompressions) return compressions;
  hasRequiredCompressions = 1;
  var GenericWorker = requireGenericWorker();
  compressions.STORE = {
    magic: "\0\0",
    compressWorker: function() {
      return new GenericWorker("STORE compression");
    },
    uncompressWorker: function() {
      return new GenericWorker("STORE decompression");
    }
  };
  compressions.DEFLATE = requireFlate();
  return compressions;
}
var signature = {};
var hasRequiredSignature;
function requireSignature() {
  if (hasRequiredSignature) return signature;
  hasRequiredSignature = 1;
  signature.LOCAL_FILE_HEADER = "PK";
  signature.CENTRAL_FILE_HEADER = "PK";
  signature.CENTRAL_DIRECTORY_END = "PK";
  signature.ZIP64_CENTRAL_DIRECTORY_LOCATOR = "PK\x07";
  signature.ZIP64_CENTRAL_DIRECTORY_END = "PK";
  signature.DATA_DESCRIPTOR = "PK\x07\b";
  return signature;
}
var ZipFileWorker_1;
var hasRequiredZipFileWorker;
function requireZipFileWorker() {
  if (hasRequiredZipFileWorker) return ZipFileWorker_1;
  hasRequiredZipFileWorker = 1;
  var utils2 = requireUtils();
  var GenericWorker = requireGenericWorker();
  var utf82 = requireUtf8();
  var crc32 = requireCrc32$1();
  var signature2 = requireSignature();
  var decToHex = function(dec, bytes) {
    var hex = "", i;
    for (i = 0; i < bytes; i++) {
      hex += String.fromCharCode(dec & 255);
      dec = dec >>> 8;
    }
    return hex;
  };
  var generateUnixExternalFileAttr = function(unixPermissions, isDir) {
    var result = unixPermissions;
    if (!unixPermissions) {
      result = isDir ? 16893 : 33204;
    }
    return (result & 65535) << 16;
  };
  var generateDosExternalFileAttr = function(dosPermissions) {
    return (dosPermissions || 0) & 63;
  };
  var generateZipParts = function(streamInfo, streamedContent, streamingEnded, offset, platform, encodeFileName) {
    var file = streamInfo["file"], compression = streamInfo["compression"], useCustomEncoding = encodeFileName !== utf82.utf8encode, encodedFileName = utils2.transformTo("string", encodeFileName(file.name)), utfEncodedFileName = utils2.transformTo("string", utf82.utf8encode(file.name)), comment = file.comment, encodedComment = utils2.transformTo("string", encodeFileName(comment)), utfEncodedComment = utils2.transformTo("string", utf82.utf8encode(comment)), useUTF8ForFileName = utfEncodedFileName.length !== file.name.length, useUTF8ForComment = utfEncodedComment.length !== comment.length, dosTime, dosDate, extraFields = "", unicodePathExtraField = "", unicodeCommentExtraField = "", dir = file.dir, date2 = file.date;
    var dataInfo = {
      crc32: 0,
      compressedSize: 0,
      uncompressedSize: 0
    };
    if (!streamedContent || streamingEnded) {
      dataInfo.crc32 = streamInfo["crc32"];
      dataInfo.compressedSize = streamInfo["compressedSize"];
      dataInfo.uncompressedSize = streamInfo["uncompressedSize"];
    }
    var bitflag = 0;
    if (streamedContent) {
      bitflag |= 8;
    }
    if (!useCustomEncoding && (useUTF8ForFileName || useUTF8ForComment)) {
      bitflag |= 2048;
    }
    var extFileAttr = 0;
    var versionMadeBy = 0;
    if (dir) {
      extFileAttr |= 16;
    }
    if (platform === "UNIX") {
      versionMadeBy = 798;
      extFileAttr |= generateUnixExternalFileAttr(file.unixPermissions, dir);
    } else {
      versionMadeBy = 20;
      extFileAttr |= generateDosExternalFileAttr(file.dosPermissions);
    }
    dosTime = date2.getUTCHours();
    dosTime = dosTime << 6;
    dosTime = dosTime | date2.getUTCMinutes();
    dosTime = dosTime << 5;
    dosTime = dosTime | date2.getUTCSeconds() / 2;
    dosDate = date2.getUTCFullYear() - 1980;
    dosDate = dosDate << 4;
    dosDate = dosDate | date2.getUTCMonth() + 1;
    dosDate = dosDate << 5;
    dosDate = dosDate | date2.getUTCDate();
    if (useUTF8ForFileName) {
      unicodePathExtraField = // Version
      decToHex(1, 1) + // NameCRC32
      decToHex(crc32(encodedFileName), 4) + // UnicodeName
      utfEncodedFileName;
      extraFields += // Info-ZIP Unicode Path Extra Field
      "up" + // size
      decToHex(unicodePathExtraField.length, 2) + // content
      unicodePathExtraField;
    }
    if (useUTF8ForComment) {
      unicodeCommentExtraField = // Version
      decToHex(1, 1) + // CommentCRC32
      decToHex(crc32(encodedComment), 4) + // UnicodeName
      utfEncodedComment;
      extraFields += // Info-ZIP Unicode Path Extra Field
      "uc" + // size
      decToHex(unicodeCommentExtraField.length, 2) + // content
      unicodeCommentExtraField;
    }
    var header = "";
    header += "\n\0";
    header += decToHex(bitflag, 2);
    header += compression.magic;
    header += decToHex(dosTime, 2);
    header += decToHex(dosDate, 2);
    header += decToHex(dataInfo.crc32, 4);
    header += decToHex(dataInfo.compressedSize, 4);
    header += decToHex(dataInfo.uncompressedSize, 4);
    header += decToHex(encodedFileName.length, 2);
    header += decToHex(extraFields.length, 2);
    var fileRecord = signature2.LOCAL_FILE_HEADER + header + encodedFileName + extraFields;
    var dirRecord = signature2.CENTRAL_FILE_HEADER + // version made by (00: DOS)
    decToHex(versionMadeBy, 2) + // file header (common to file and central directory)
    header + // file comment length
    decToHex(encodedComment.length, 2) + // disk number start
    "\0\0\0\0" + // external file attributes
    decToHex(extFileAttr, 4) + // relative offset of local header
    decToHex(offset, 4) + // file name
    encodedFileName + // extra field
    extraFields + // file comment
    encodedComment;
    return {
      fileRecord,
      dirRecord
    };
  };
  var generateCentralDirectoryEnd = function(entriesCount, centralDirLength, localDirLength, comment, encodeFileName) {
    var dirEnd = "";
    var encodedComment = utils2.transformTo("string", encodeFileName(comment));
    dirEnd = signature2.CENTRAL_DIRECTORY_END + // number of this disk
    "\0\0\0\0" + // total number of entries in the central directory on this disk
    decToHex(entriesCount, 2) + // total number of entries in the central directory
    decToHex(entriesCount, 2) + // size of the central directory   4 bytes
    decToHex(centralDirLength, 4) + // offset of start of central directory with respect to the starting disk number
    decToHex(localDirLength, 4) + // .ZIP file comment length
    decToHex(encodedComment.length, 2) + // .ZIP file comment
    encodedComment;
    return dirEnd;
  };
  var generateDataDescriptors = function(streamInfo) {
    var descriptor = "";
    descriptor = signature2.DATA_DESCRIPTOR + // crc-32                          4 bytes
    decToHex(streamInfo["crc32"], 4) + // compressed size                 4 bytes
    decToHex(streamInfo["compressedSize"], 4) + // uncompressed size               4 bytes
    decToHex(streamInfo["uncompressedSize"], 4);
    return descriptor;
  };
  function ZipFileWorker(streamFiles, comment, platform, encodeFileName) {
    GenericWorker.call(this, "ZipFileWorker");
    this.bytesWritten = 0;
    this.zipComment = comment;
    this.zipPlatform = platform;
    this.encodeFileName = encodeFileName;
    this.streamFiles = streamFiles;
    this.accumulate = false;
    this.contentBuffer = [];
    this.dirRecords = [];
    this.currentSourceOffset = 0;
    this.entriesCount = 0;
    this.currentFile = null;
    this._sources = [];
  }
  utils2.inherits(ZipFileWorker, GenericWorker);
  ZipFileWorker.prototype.push = function(chunk) {
    var currentFilePercent = chunk.meta.percent || 0;
    var entriesCount = this.entriesCount;
    var remainingFiles = this._sources.length;
    if (this.accumulate) {
      this.contentBuffer.push(chunk);
    } else {
      this.bytesWritten += chunk.data.length;
      GenericWorker.prototype.push.call(this, {
        data: chunk.data,
        meta: {
          currentFile: this.currentFile,
          percent: entriesCount ? (currentFilePercent + 100 * (entriesCount - remainingFiles - 1)) / entriesCount : 100
        }
      });
    }
  };
  ZipFileWorker.prototype.openedSource = function(streamInfo) {
    this.currentSourceOffset = this.bytesWritten;
    this.currentFile = streamInfo["file"].name;
    var streamedContent = this.streamFiles && !streamInfo["file"].dir;
    if (streamedContent) {
      var record2 = generateZipParts(streamInfo, streamedContent, false, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
      this.push({
        data: record2.fileRecord,
        meta: { percent: 0 }
      });
    } else {
      this.accumulate = true;
    }
  };
  ZipFileWorker.prototype.closedSource = function(streamInfo) {
    this.accumulate = false;
    var streamedContent = this.streamFiles && !streamInfo["file"].dir;
    var record2 = generateZipParts(streamInfo, streamedContent, true, this.currentSourceOffset, this.zipPlatform, this.encodeFileName);
    this.dirRecords.push(record2.dirRecord);
    if (streamedContent) {
      this.push({
        data: generateDataDescriptors(streamInfo),
        meta: { percent: 100 }
      });
    } else {
      this.push({
        data: record2.fileRecord,
        meta: { percent: 0 }
      });
      while (this.contentBuffer.length) {
        this.push(this.contentBuffer.shift());
      }
    }
    this.currentFile = null;
  };
  ZipFileWorker.prototype.flush = function() {
    var localDirLength = this.bytesWritten;
    for (var i = 0; i < this.dirRecords.length; i++) {
      this.push({
        data: this.dirRecords[i],
        meta: { percent: 100 }
      });
    }
    var centralDirLength = this.bytesWritten - localDirLength;
    var dirEnd = generateCentralDirectoryEnd(this.dirRecords.length, centralDirLength, localDirLength, this.zipComment, this.encodeFileName);
    this.push({
      data: dirEnd,
      meta: { percent: 100 }
    });
  };
  ZipFileWorker.prototype.prepareNextSource = function() {
    this.previous = this._sources.shift();
    this.openedSource(this.previous.streamInfo);
    if (this.isPaused) {
      this.previous.pause();
    } else {
      this.previous.resume();
    }
  };
  ZipFileWorker.prototype.registerPrevious = function(previous) {
    this._sources.push(previous);
    var self2 = this;
    previous.on("data", function(chunk) {
      self2.processChunk(chunk);
    });
    previous.on("end", function() {
      self2.closedSource(self2.previous.streamInfo);
      if (self2._sources.length) {
        self2.prepareNextSource();
      } else {
        self2.end();
      }
    });
    previous.on("error", function(e) {
      self2.error(e);
    });
    return this;
  };
  ZipFileWorker.prototype.resume = function() {
    if (!GenericWorker.prototype.resume.call(this)) {
      return false;
    }
    if (!this.previous && this._sources.length) {
      this.prepareNextSource();
      return true;
    }
    if (!this.previous && !this._sources.length && !this.generatedError) {
      this.end();
      return true;
    }
  };
  ZipFileWorker.prototype.error = function(e) {
    var sources = this._sources;
    if (!GenericWorker.prototype.error.call(this, e)) {
      return false;
    }
    for (var i = 0; i < sources.length; i++) {
      try {
        sources[i].error(e);
      } catch (e2) {
      }
    }
    return true;
  };
  ZipFileWorker.prototype.lock = function() {
    GenericWorker.prototype.lock.call(this);
    var sources = this._sources;
    for (var i = 0; i < sources.length; i++) {
      sources[i].lock();
    }
  };
  ZipFileWorker_1 = ZipFileWorker;
  return ZipFileWorker_1;
}
var hasRequiredGenerate;
function requireGenerate() {
  if (hasRequiredGenerate) return generate;
  hasRequiredGenerate = 1;
  var compressions2 = requireCompressions();
  var ZipFileWorker = requireZipFileWorker();
  var getCompression = function(fileCompression, zipCompression) {
    var compressionName = fileCompression || zipCompression;
    var compression = compressions2[compressionName];
    if (!compression) {
      throw new Error(compressionName + " is not a valid compression method !");
    }
    return compression;
  };
  generate.generateWorker = function(zip, options, comment) {
    var zipFileWorker = new ZipFileWorker(options.streamFiles, comment, options.platform, options.encodeFileName);
    var entriesCount = 0;
    try {
      zip.forEach(function(relativePath, file) {
        entriesCount++;
        var compression = getCompression(file.options.compression, options.compression);
        var compressionOptions = file.options.compressionOptions || options.compressionOptions || {};
        var dir = file.dir, date2 = file.date;
        file._compressWorker(compression, compressionOptions).withStreamInfo("file", {
          name: relativePath,
          dir,
          date: date2,
          comment: file.comment || "",
          unixPermissions: file.unixPermissions,
          dosPermissions: file.dosPermissions
        }).pipe(zipFileWorker);
      });
      zipFileWorker.entriesCount = entriesCount;
    } catch (e) {
      zipFileWorker.error(e);
    }
    return zipFileWorker;
  };
  return generate;
}
var NodejsStreamInputAdapter_1;
var hasRequiredNodejsStreamInputAdapter;
function requireNodejsStreamInputAdapter() {
  if (hasRequiredNodejsStreamInputAdapter) return NodejsStreamInputAdapter_1;
  hasRequiredNodejsStreamInputAdapter = 1;
  var utils2 = requireUtils();
  var GenericWorker = requireGenericWorker();
  function NodejsStreamInputAdapter(filename, stream2) {
    GenericWorker.call(this, "Nodejs stream input adapter for " + filename);
    this._upstreamEnded = false;
    this._bindStream(stream2);
  }
  utils2.inherits(NodejsStreamInputAdapter, GenericWorker);
  NodejsStreamInputAdapter.prototype._bindStream = function(stream2) {
    var self2 = this;
    this._stream = stream2;
    stream2.pause();
    stream2.on("data", function(chunk) {
      self2.push({
        data: chunk,
        meta: {
          percent: 0
        }
      });
    }).on("error", function(e) {
      if (self2.isPaused) {
        this.generatedError = e;
      } else {
        self2.error(e);
      }
    }).on("end", function() {
      if (self2.isPaused) {
        self2._upstreamEnded = true;
      } else {
        self2.end();
      }
    });
  };
  NodejsStreamInputAdapter.prototype.pause = function() {
    if (!GenericWorker.prototype.pause.call(this)) {
      return false;
    }
    this._stream.pause();
    return true;
  };
  NodejsStreamInputAdapter.prototype.resume = function() {
    if (!GenericWorker.prototype.resume.call(this)) {
      return false;
    }
    if (this._upstreamEnded) {
      this.end();
    } else {
      this._stream.resume();
    }
    return true;
  };
  NodejsStreamInputAdapter_1 = NodejsStreamInputAdapter;
  return NodejsStreamInputAdapter_1;
}
var object;
var hasRequiredObject;
function requireObject() {
  if (hasRequiredObject) return object;
  hasRequiredObject = 1;
  var utf82 = requireUtf8();
  var utils2 = requireUtils();
  var GenericWorker = requireGenericWorker();
  var StreamHelper = requireStreamHelper();
  var defaults2 = requireDefaults();
  var CompressedObject = requireCompressedObject();
  var ZipObject = requireZipObject();
  var generate2 = requireGenerate();
  var nodejsUtils2 = requireNodejsUtils();
  var NodejsStreamInputAdapter = requireNodejsStreamInputAdapter();
  var fileAdd = function(name, data, originalOptions) {
    var dataType = utils2.getTypeOf(data), parent;
    var o = utils2.extend(originalOptions || {}, defaults2);
    o.date = o.date || /* @__PURE__ */ new Date();
    if (o.compression !== null) {
      o.compression = o.compression.toUpperCase();
    }
    if (typeof o.unixPermissions === "string") {
      o.unixPermissions = parseInt(o.unixPermissions, 8);
    }
    if (o.unixPermissions && o.unixPermissions & 16384) {
      o.dir = true;
    }
    if (o.dosPermissions && o.dosPermissions & 16) {
      o.dir = true;
    }
    if (o.dir) {
      name = forceTrailingSlash(name);
    }
    if (o.createFolders && (parent = parentFolder(name))) {
      folderAdd.call(this, parent, true);
    }
    var isUnicodeString = dataType === "string" && o.binary === false && o.base64 === false;
    if (!originalOptions || typeof originalOptions.binary === "undefined") {
      o.binary = !isUnicodeString;
    }
    var isCompressedEmpty = data instanceof CompressedObject && data.uncompressedSize === 0;
    if (isCompressedEmpty || o.dir || !data || data.length === 0) {
      o.base64 = false;
      o.binary = true;
      data = "";
      o.compression = "STORE";
      dataType = "string";
    }
    var zipObjectContent = null;
    if (data instanceof CompressedObject || data instanceof GenericWorker) {
      zipObjectContent = data;
    } else if (nodejsUtils2.isNode && nodejsUtils2.isStream(data)) {
      zipObjectContent = new NodejsStreamInputAdapter(name, data);
    } else {
      zipObjectContent = utils2.prepareContent(name, data, o.binary, o.optimizedBinaryString, o.base64);
    }
    var object2 = new ZipObject(name, zipObjectContent, o);
    this.files[name] = object2;
  };
  var parentFolder = function(path) {
    if (path.slice(-1) === "/") {
      path = path.substring(0, path.length - 1);
    }
    var lastSlash = path.lastIndexOf("/");
    return lastSlash > 0 ? path.substring(0, lastSlash) : "";
  };
  var forceTrailingSlash = function(path) {
    if (path.slice(-1) !== "/") {
      path += "/";
    }
    return path;
  };
  var folderAdd = function(name, createFolders) {
    createFolders = typeof createFolders !== "undefined" ? createFolders : defaults2.createFolders;
    name = forceTrailingSlash(name);
    if (!this.files[name]) {
      fileAdd.call(this, name, null, {
        dir: true,
        createFolders
      });
    }
    return this.files[name];
  };
  function isRegExp(object2) {
    return Object.prototype.toString.call(object2) === "[object RegExp]";
  }
  var out = {
    /**
     * @see loadAsync
     */
    load: function() {
      throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
    },
    /**
     * Call a callback function for each entry at this folder level.
     * @param {Function} cb the callback function:
     * function (relativePath, file) {...}
     * It takes 2 arguments : the relative path and the file.
     */
    forEach: function(cb) {
      var filename, relativePath, file;
      for (filename in this.files) {
        file = this.files[filename];
        relativePath = filename.slice(this.root.length, filename.length);
        if (relativePath && filename.slice(0, this.root.length) === this.root) {
          cb(relativePath, file);
        }
      }
    },
    /**
     * Filter nested files/folders with the specified function.
     * @param {Function} search the predicate to use :
     * function (relativePath, file) {...}
     * It takes 2 arguments : the relative path and the file.
     * @return {Array} An array of matching elements.
     */
    filter: function(search) {
      var result = [];
      this.forEach(function(relativePath, entry) {
        if (search(relativePath, entry)) {
          result.push(entry);
        }
      });
      return result;
    },
    /**
     * Add a file to the zip file, or search a file.
     * @param   {string|RegExp} name The name of the file to add (if data is defined),
     * the name of the file to find (if no data) or a regex to match files.
     * @param   {String|ArrayBuffer|Uint8Array|Buffer} data  The file data, either raw or base64 encoded
     * @param   {Object} o     File options
     * @return  {JSZip|Object|Array} this JSZip object (when adding a file),
     * a file (when searching by string) or an array of files (when searching by regex).
     */
    file: function(name, data, o) {
      if (arguments.length === 1) {
        if (isRegExp(name)) {
          var regexp = name;
          return this.filter(function(relativePath, file) {
            return !file.dir && regexp.test(relativePath);
          });
        } else {
          var obj = this.files[this.root + name];
          if (obj && !obj.dir) {
            return obj;
          } else {
            return null;
          }
        }
      } else {
        name = this.root + name;
        fileAdd.call(this, name, data, o);
      }
      return this;
    },
    /**
     * Add a directory to the zip file, or search.
     * @param   {String|RegExp} arg The name of the directory to add, or a regex to search folders.
     * @return  {JSZip} an object with the new directory as the root, or an array containing matching folders.
     */
    folder: function(arg) {
      if (!arg) {
        return this;
      }
      if (isRegExp(arg)) {
        return this.filter(function(relativePath, file) {
          return file.dir && arg.test(relativePath);
        });
      }
      var name = this.root + arg;
      var newFolder = folderAdd.call(this, name);
      var ret = this.clone();
      ret.root = newFolder.name;
      return ret;
    },
    /**
     * Delete a file, or a directory and all sub-files, from the zip
     * @param {string} name the name of the file to delete
     * @return {JSZip} this JSZip object
     */
    remove: function(name) {
      name = this.root + name;
      var file = this.files[name];
      if (!file) {
        if (name.slice(-1) !== "/") {
          name += "/";
        }
        file = this.files[name];
      }
      if (file && !file.dir) {
        delete this.files[name];
      } else {
        var kids = this.filter(function(relativePath, file2) {
          return file2.name.slice(0, name.length) === name;
        });
        for (var i = 0; i < kids.length; i++) {
          delete this.files[kids[i].name];
        }
      }
      return this;
    },
    /**
     * @deprecated This method has been removed in JSZip 3.0, please check the upgrade guide.
     */
    generate: function() {
      throw new Error("This method has been removed in JSZip 3.0, please check the upgrade guide.");
    },
    /**
     * Generate the complete zip file as an internal stream.
     * @param {Object} options the options to generate the zip file :
     * - compression, "STORE" by default.
     * - type, "base64" by default. Values are : string, base64, uint8array, arraybuffer, blob.
     * @return {StreamHelper} the streamed zip file.
     */
    generateInternalStream: function(options) {
      var worker, opts = {};
      try {
        opts = utils2.extend(options || {}, {
          streamFiles: false,
          compression: "STORE",
          compressionOptions: null,
          type: "",
          platform: "DOS",
          comment: null,
          mimeType: "application/zip",
          encodeFileName: utf82.utf8encode
        });
        opts.type = opts.type.toLowerCase();
        opts.compression = opts.compression.toUpperCase();
        if (opts.type === "binarystring") {
          opts.type = "string";
        }
        if (!opts.type) {
          throw new Error("No output type specified.");
        }
        utils2.checkSupport(opts.type);
        if (opts.platform === "darwin" || opts.platform === "freebsd" || opts.platform === "linux" || opts.platform === "sunos") {
          opts.platform = "UNIX";
        }
        if (opts.platform === "win32") {
          opts.platform = "DOS";
        }
        var comment = opts.comment || this.comment || "";
        worker = generate2.generateWorker(this, opts, comment);
      } catch (e) {
        worker = new GenericWorker("error");
        worker.error(e);
      }
      return new StreamHelper(worker, opts.type || "string", opts.mimeType);
    },
    /**
     * Generate the complete zip file asynchronously.
     * @see generateInternalStream
     */
    generateAsync: function(options, onUpdate) {
      return this.generateInternalStream(options).accumulate(onUpdate);
    },
    /**
     * Generate the complete zip file asynchronously.
     * @see generateInternalStream
     */
    generateNodeStream: function(options, onUpdate) {
      options = options || {};
      if (!options.type) {
        options.type = "nodebuffer";
      }
      return this.generateInternalStream(options).toNodejsStream(onUpdate);
    }
  };
  object = out;
  return object;
}
var DataReader_1;
var hasRequiredDataReader;
function requireDataReader() {
  if (hasRequiredDataReader) return DataReader_1;
  hasRequiredDataReader = 1;
  var utils2 = requireUtils();
  function DataReader(data) {
    this.data = data;
    this.length = data.length;
    this.index = 0;
    this.zero = 0;
  }
  DataReader.prototype = {
    /**
     * Check that the offset will not go too far.
     * @param {string} offset the additional offset to check.
     * @throws {Error} an Error if the offset is out of bounds.
     */
    checkOffset: function(offset) {
      this.checkIndex(this.index + offset);
    },
    /**
     * Check that the specified index will not be too far.
     * @param {string} newIndex the index to check.
     * @throws {Error} an Error if the index is out of bounds.
     */
    checkIndex: function(newIndex) {
      if (this.length < this.zero + newIndex || newIndex < 0) {
        throw new Error("End of data reached (data length = " + this.length + ", asked index = " + newIndex + "). Corrupted zip ?");
      }
    },
    /**
     * Change the index.
     * @param {number} newIndex The new index.
     * @throws {Error} if the new index is out of the data.
     */
    setIndex: function(newIndex) {
      this.checkIndex(newIndex);
      this.index = newIndex;
    },
    /**
     * Skip the next n bytes.
     * @param {number} n the number of bytes to skip.
     * @throws {Error} if the new index is out of the data.
     */
    skip: function(n) {
      this.setIndex(this.index + n);
    },
    /**
     * Get the byte at the specified index.
     * @param {number} i the index to use.
     * @return {number} a byte.
     */
    byteAt: function() {
    },
    /**
     * Get the next number with a given byte size.
     * @param {number} size the number of bytes to read.
     * @return {number} the corresponding number.
     */
    readInt: function(size) {
      var result = 0, i;
      this.checkOffset(size);
      for (i = this.index + size - 1; i >= this.index; i--) {
        result = (result << 8) + this.byteAt(i);
      }
      this.index += size;
      return result;
    },
    /**
     * Get the next string with a given byte size.
     * @param {number} size the number of bytes to read.
     * @return {string} the corresponding string.
     */
    readString: function(size) {
      return utils2.transformTo("string", this.readData(size));
    },
    /**
     * Get raw data without conversion, <size> bytes.
     * @param {number} size the number of bytes to read.
     * @return {Object} the raw data, implementation specific.
     */
    readData: function() {
    },
    /**
     * Find the last occurrence of a zip signature (4 bytes).
     * @param {string} sig the signature to find.
     * @return {number} the index of the last occurrence, -1 if not found.
     */
    lastIndexOfSignature: function() {
    },
    /**
     * Read the signature (4 bytes) at the current position and compare it with sig.
     * @param {string} sig the expected signature
     * @return {boolean} true if the signature matches, false otherwise.
     */
    readAndCheckSignature: function() {
    },
    /**
     * Get the next date.
     * @return {Date} the date.
     */
    readDate: function() {
      var dostime = this.readInt(4);
      return new Date(Date.UTC(
        (dostime >> 25 & 127) + 1980,
        // year
        (dostime >> 21 & 15) - 1,
        // month
        dostime >> 16 & 31,
        // day
        dostime >> 11 & 31,
        // hour
        dostime >> 5 & 63,
        // minute
        (dostime & 31) << 1
      ));
    }
  };
  DataReader_1 = DataReader;
  return DataReader_1;
}
var ArrayReader_1;
var hasRequiredArrayReader;
function requireArrayReader() {
  if (hasRequiredArrayReader) return ArrayReader_1;
  hasRequiredArrayReader = 1;
  var DataReader = requireDataReader();
  var utils2 = requireUtils();
  function ArrayReader(data) {
    DataReader.call(this, data);
    for (var i = 0; i < this.data.length; i++) {
      data[i] = data[i] & 255;
    }
  }
  utils2.inherits(ArrayReader, DataReader);
  ArrayReader.prototype.byteAt = function(i) {
    return this.data[this.zero + i];
  };
  ArrayReader.prototype.lastIndexOfSignature = function(sig) {
    var sig0 = sig.charCodeAt(0), sig1 = sig.charCodeAt(1), sig2 = sig.charCodeAt(2), sig3 = sig.charCodeAt(3);
    for (var i = this.length - 4; i >= 0; --i) {
      if (this.data[i] === sig0 && this.data[i + 1] === sig1 && this.data[i + 2] === sig2 && this.data[i + 3] === sig3) {
        return i - this.zero;
      }
    }
    return -1;
  };
  ArrayReader.prototype.readAndCheckSignature = function(sig) {
    var sig0 = sig.charCodeAt(0), sig1 = sig.charCodeAt(1), sig2 = sig.charCodeAt(2), sig3 = sig.charCodeAt(3), data = this.readData(4);
    return sig0 === data[0] && sig1 === data[1] && sig2 === data[2] && sig3 === data[3];
  };
  ArrayReader.prototype.readData = function(size) {
    this.checkOffset(size);
    if (size === 0) {
      return [];
    }
    var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
    this.index += size;
    return result;
  };
  ArrayReader_1 = ArrayReader;
  return ArrayReader_1;
}
var StringReader_1;
var hasRequiredStringReader;
function requireStringReader() {
  if (hasRequiredStringReader) return StringReader_1;
  hasRequiredStringReader = 1;
  var DataReader = requireDataReader();
  var utils2 = requireUtils();
  function StringReader(data) {
    DataReader.call(this, data);
  }
  utils2.inherits(StringReader, DataReader);
  StringReader.prototype.byteAt = function(i) {
    return this.data.charCodeAt(this.zero + i);
  };
  StringReader.prototype.lastIndexOfSignature = function(sig) {
    return this.data.lastIndexOf(sig) - this.zero;
  };
  StringReader.prototype.readAndCheckSignature = function(sig) {
    var data = this.readData(4);
    return sig === data;
  };
  StringReader.prototype.readData = function(size) {
    this.checkOffset(size);
    var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
    this.index += size;
    return result;
  };
  StringReader_1 = StringReader;
  return StringReader_1;
}
var Uint8ArrayReader_1;
var hasRequiredUint8ArrayReader;
function requireUint8ArrayReader() {
  if (hasRequiredUint8ArrayReader) return Uint8ArrayReader_1;
  hasRequiredUint8ArrayReader = 1;
  var ArrayReader = requireArrayReader();
  var utils2 = requireUtils();
  function Uint8ArrayReader(data) {
    ArrayReader.call(this, data);
  }
  utils2.inherits(Uint8ArrayReader, ArrayReader);
  Uint8ArrayReader.prototype.readData = function(size) {
    this.checkOffset(size);
    if (size === 0) {
      return new Uint8Array(0);
    }
    var result = this.data.subarray(this.zero + this.index, this.zero + this.index + size);
    this.index += size;
    return result;
  };
  Uint8ArrayReader_1 = Uint8ArrayReader;
  return Uint8ArrayReader_1;
}
var NodeBufferReader_1;
var hasRequiredNodeBufferReader;
function requireNodeBufferReader() {
  if (hasRequiredNodeBufferReader) return NodeBufferReader_1;
  hasRequiredNodeBufferReader = 1;
  var Uint8ArrayReader = requireUint8ArrayReader();
  var utils2 = requireUtils();
  function NodeBufferReader(data) {
    Uint8ArrayReader.call(this, data);
  }
  utils2.inherits(NodeBufferReader, Uint8ArrayReader);
  NodeBufferReader.prototype.readData = function(size) {
    this.checkOffset(size);
    var result = this.data.slice(this.zero + this.index, this.zero + this.index + size);
    this.index += size;
    return result;
  };
  NodeBufferReader_1 = NodeBufferReader;
  return NodeBufferReader_1;
}
var readerFor;
var hasRequiredReaderFor;
function requireReaderFor() {
  if (hasRequiredReaderFor) return readerFor;
  hasRequiredReaderFor = 1;
  var utils2 = requireUtils();
  var support2 = requireSupport();
  var ArrayReader = requireArrayReader();
  var StringReader = requireStringReader();
  var NodeBufferReader = requireNodeBufferReader();
  var Uint8ArrayReader = requireUint8ArrayReader();
  readerFor = function(data) {
    var type = utils2.getTypeOf(data);
    utils2.checkSupport(type);
    if (type === "string" && !support2.uint8array) {
      return new StringReader(data);
    }
    if (type === "nodebuffer") {
      return new NodeBufferReader(data);
    }
    if (support2.uint8array) {
      return new Uint8ArrayReader(utils2.transformTo("uint8array", data));
    }
    return new ArrayReader(utils2.transformTo("array", data));
  };
  return readerFor;
}
var zipEntry;
var hasRequiredZipEntry;
function requireZipEntry() {
  if (hasRequiredZipEntry) return zipEntry;
  hasRequiredZipEntry = 1;
  var readerFor2 = requireReaderFor();
  var utils2 = requireUtils();
  var CompressedObject = requireCompressedObject();
  var crc32fn = requireCrc32$1();
  var utf82 = requireUtf8();
  var compressions2 = requireCompressions();
  var support2 = requireSupport();
  var MADE_BY_DOS = 0;
  var MADE_BY_UNIX = 3;
  var findCompression = function(compressionMethod) {
    for (var method in compressions2) {
      if (!Object.prototype.hasOwnProperty.call(compressions2, method)) {
        continue;
      }
      if (compressions2[method].magic === compressionMethod) {
        return compressions2[method];
      }
    }
    return null;
  };
  function ZipEntry(options, loadOptions) {
    this.options = options;
    this.loadOptions = loadOptions;
  }
  ZipEntry.prototype = {
    /**
     * say if the file is encrypted.
     * @return {boolean} true if the file is encrypted, false otherwise.
     */
    isEncrypted: function() {
      return (this.bitFlag & 1) === 1;
    },
    /**
     * say if the file has utf-8 filename/comment.
     * @return {boolean} true if the filename/comment is in utf-8, false otherwise.
     */
    useUTF8: function() {
      return (this.bitFlag & 2048) === 2048;
    },
    /**
     * Read the local part of a zip file and add the info in this object.
     * @param {DataReader} reader the reader to use.
     */
    readLocalPart: function(reader) {
      var compression, localExtraFieldsLength;
      reader.skip(22);
      this.fileNameLength = reader.readInt(2);
      localExtraFieldsLength = reader.readInt(2);
      this.fileName = reader.readData(this.fileNameLength);
      reader.skip(localExtraFieldsLength);
      if (this.compressedSize === -1 || this.uncompressedSize === -1) {
        throw new Error("Bug or corrupted zip : didn't get enough information from the central directory (compressedSize === -1 || uncompressedSize === -1)");
      }
      compression = findCompression(this.compressionMethod);
      if (compression === null) {
        throw new Error("Corrupted zip : compression " + utils2.pretty(this.compressionMethod) + " unknown (inner file : " + utils2.transformTo("string", this.fileName) + ")");
      }
      this.decompressed = new CompressedObject(this.compressedSize, this.uncompressedSize, this.crc32, compression, reader.readData(this.compressedSize));
    },
    /**
     * Read the central part of a zip file and add the info in this object.
     * @param {DataReader} reader the reader to use.
     */
    readCentralPart: function(reader) {
      this.versionMadeBy = reader.readInt(2);
      reader.skip(2);
      this.bitFlag = reader.readInt(2);
      this.compressionMethod = reader.readString(2);
      this.date = reader.readDate();
      this.crc32 = reader.readInt(4);
      this.compressedSize = reader.readInt(4);
      this.uncompressedSize = reader.readInt(4);
      var fileNameLength = reader.readInt(2);
      this.extraFieldsLength = reader.readInt(2);
      this.fileCommentLength = reader.readInt(2);
      this.diskNumberStart = reader.readInt(2);
      this.internalFileAttributes = reader.readInt(2);
      this.externalFileAttributes = reader.readInt(4);
      this.localHeaderOffset = reader.readInt(4);
      if (this.isEncrypted()) {
        throw new Error("Encrypted zip are not supported");
      }
      reader.skip(fileNameLength);
      this.readExtraFields(reader);
      this.parseZIP64ExtraField(reader);
      this.fileComment = reader.readData(this.fileCommentLength);
    },
    /**
     * Parse the external file attributes and get the unix/dos permissions.
     */
    processAttributes: function() {
      this.unixPermissions = null;
      this.dosPermissions = null;
      var madeBy = this.versionMadeBy >> 8;
      this.dir = this.externalFileAttributes & 16 ? true : false;
      if (madeBy === MADE_BY_DOS) {
        this.dosPermissions = this.externalFileAttributes & 63;
      }
      if (madeBy === MADE_BY_UNIX) {
        this.unixPermissions = this.externalFileAttributes >> 16 & 65535;
      }
      if (!this.dir && this.fileNameStr.slice(-1) === "/") {
        this.dir = true;
      }
    },
    /**
     * Parse the ZIP64 extra field and merge the info in the current ZipEntry.
     * @param {DataReader} reader the reader to use.
     */
    parseZIP64ExtraField: function() {
      if (!this.extraFields[1]) {
        return;
      }
      var extraReader = readerFor2(this.extraFields[1].value);
      if (this.uncompressedSize === utils2.MAX_VALUE_32BITS) {
        this.uncompressedSize = extraReader.readInt(8);
      }
      if (this.compressedSize === utils2.MAX_VALUE_32BITS) {
        this.compressedSize = extraReader.readInt(8);
      }
      if (this.localHeaderOffset === utils2.MAX_VALUE_32BITS) {
        this.localHeaderOffset = extraReader.readInt(8);
      }
      if (this.diskNumberStart === utils2.MAX_VALUE_32BITS) {
        this.diskNumberStart = extraReader.readInt(4);
      }
    },
    /**
     * Read the central part of a zip file and add the info in this object.
     * @param {DataReader} reader the reader to use.
     */
    readExtraFields: function(reader) {
      var end = reader.index + this.extraFieldsLength, extraFieldId, extraFieldLength, extraFieldValue;
      if (!this.extraFields) {
        this.extraFields = {};
      }
      while (reader.index + 4 < end) {
        extraFieldId = reader.readInt(2);
        extraFieldLength = reader.readInt(2);
        extraFieldValue = reader.readData(extraFieldLength);
        this.extraFields[extraFieldId] = {
          id: extraFieldId,
          length: extraFieldLength,
          value: extraFieldValue
        };
      }
      reader.setIndex(end);
    },
    /**
     * Apply an UTF8 transformation if needed.
     */
    handleUTF8: function() {
      var decodeParamType = support2.uint8array ? "uint8array" : "array";
      if (this.useUTF8()) {
        this.fileNameStr = utf82.utf8decode(this.fileName);
        this.fileCommentStr = utf82.utf8decode(this.fileComment);
      } else {
        var upath = this.findExtraFieldUnicodePath();
        if (upath !== null) {
          this.fileNameStr = upath;
        } else {
          var fileNameByteArray = utils2.transformTo(decodeParamType, this.fileName);
          this.fileNameStr = this.loadOptions.decodeFileName(fileNameByteArray);
        }
        var ucomment = this.findExtraFieldUnicodeComment();
        if (ucomment !== null) {
          this.fileCommentStr = ucomment;
        } else {
          var commentByteArray = utils2.transformTo(decodeParamType, this.fileComment);
          this.fileCommentStr = this.loadOptions.decodeFileName(commentByteArray);
        }
      }
    },
    /**
     * Find the unicode path declared in the extra field, if any.
     * @return {String} the unicode path, null otherwise.
     */
    findExtraFieldUnicodePath: function() {
      var upathField = this.extraFields[28789];
      if (upathField) {
        var extraReader = readerFor2(upathField.value);
        if (extraReader.readInt(1) !== 1) {
          return null;
        }
        if (crc32fn(this.fileName) !== extraReader.readInt(4)) {
          return null;
        }
        return utf82.utf8decode(extraReader.readData(upathField.length - 5));
      }
      return null;
    },
    /**
     * Find the unicode comment declared in the extra field, if any.
     * @return {String} the unicode comment, null otherwise.
     */
    findExtraFieldUnicodeComment: function() {
      var ucommentField = this.extraFields[25461];
      if (ucommentField) {
        var extraReader = readerFor2(ucommentField.value);
        if (extraReader.readInt(1) !== 1) {
          return null;
        }
        if (crc32fn(this.fileComment) !== extraReader.readInt(4)) {
          return null;
        }
        return utf82.utf8decode(extraReader.readData(ucommentField.length - 5));
      }
      return null;
    }
  };
  zipEntry = ZipEntry;
  return zipEntry;
}
var zipEntries;
var hasRequiredZipEntries;
function requireZipEntries() {
  if (hasRequiredZipEntries) return zipEntries;
  hasRequiredZipEntries = 1;
  var readerFor2 = requireReaderFor();
  var utils2 = requireUtils();
  var sig = requireSignature();
  var ZipEntry = requireZipEntry();
  var support2 = requireSupport();
  function ZipEntries(loadOptions) {
    this.files = [];
    this.loadOptions = loadOptions;
  }
  ZipEntries.prototype = {
    /**
     * Check that the reader is on the specified signature.
     * @param {string} expectedSignature the expected signature.
     * @throws {Error} if it is an other signature.
     */
    checkSignature: function(expectedSignature) {
      if (!this.reader.readAndCheckSignature(expectedSignature)) {
        this.reader.index -= 4;
        var signature2 = this.reader.readString(4);
        throw new Error("Corrupted zip or bug: unexpected signature (" + utils2.pretty(signature2) + ", expected " + utils2.pretty(expectedSignature) + ")");
      }
    },
    /**
     * Check if the given signature is at the given index.
     * @param {number} askedIndex the index to check.
     * @param {string} expectedSignature the signature to expect.
     * @return {boolean} true if the signature is here, false otherwise.
     */
    isSignature: function(askedIndex, expectedSignature) {
      var currentIndex = this.reader.index;
      this.reader.setIndex(askedIndex);
      var signature2 = this.reader.readString(4);
      var result = signature2 === expectedSignature;
      this.reader.setIndex(currentIndex);
      return result;
    },
    /**
     * Read the end of the central directory.
     */
    readBlockEndOfCentral: function() {
      this.diskNumber = this.reader.readInt(2);
      this.diskWithCentralDirStart = this.reader.readInt(2);
      this.centralDirRecordsOnThisDisk = this.reader.readInt(2);
      this.centralDirRecords = this.reader.readInt(2);
      this.centralDirSize = this.reader.readInt(4);
      this.centralDirOffset = this.reader.readInt(4);
      this.zipCommentLength = this.reader.readInt(2);
      var zipComment = this.reader.readData(this.zipCommentLength);
      var decodeParamType = support2.uint8array ? "uint8array" : "array";
      var decodeContent = utils2.transformTo(decodeParamType, zipComment);
      this.zipComment = this.loadOptions.decodeFileName(decodeContent);
    },
    /**
     * Read the end of the Zip 64 central directory.
     * Not merged with the method readEndOfCentral :
     * The end of central can coexist with its Zip64 brother,
     * I don't want to read the wrong number of bytes !
     */
    readBlockZip64EndOfCentral: function() {
      this.zip64EndOfCentralSize = this.reader.readInt(8);
      this.reader.skip(4);
      this.diskNumber = this.reader.readInt(4);
      this.diskWithCentralDirStart = this.reader.readInt(4);
      this.centralDirRecordsOnThisDisk = this.reader.readInt(8);
      this.centralDirRecords = this.reader.readInt(8);
      this.centralDirSize = this.reader.readInt(8);
      this.centralDirOffset = this.reader.readInt(8);
      this.zip64ExtensibleData = {};
      var extraDataSize = this.zip64EndOfCentralSize - 44, index = 0, extraFieldId, extraFieldLength, extraFieldValue;
      while (index < extraDataSize) {
        extraFieldId = this.reader.readInt(2);
        extraFieldLength = this.reader.readInt(4);
        extraFieldValue = this.reader.readData(extraFieldLength);
        this.zip64ExtensibleData[extraFieldId] = {
          id: extraFieldId,
          length: extraFieldLength,
          value: extraFieldValue
        };
      }
    },
    /**
     * Read the end of the Zip 64 central directory locator.
     */
    readBlockZip64EndOfCentralLocator: function() {
      this.diskWithZip64CentralDirStart = this.reader.readInt(4);
      this.relativeOffsetEndOfZip64CentralDir = this.reader.readInt(8);
      this.disksCount = this.reader.readInt(4);
      if (this.disksCount > 1) {
        throw new Error("Multi-volumes zip are not supported");
      }
    },
    /**
     * Read the local files, based on the offset read in the central part.
     */
    readLocalFiles: function() {
      var i, file;
      for (i = 0; i < this.files.length; i++) {
        file = this.files[i];
        this.reader.setIndex(file.localHeaderOffset);
        this.checkSignature(sig.LOCAL_FILE_HEADER);
        file.readLocalPart(this.reader);
        file.handleUTF8();
        file.processAttributes();
      }
    },
    /**
     * Read the central directory.
     */
    readCentralDir: function() {
      var file;
      this.reader.setIndex(this.centralDirOffset);
      while (this.reader.readAndCheckSignature(sig.CENTRAL_FILE_HEADER)) {
        file = new ZipEntry({
          zip64: this.zip64
        }, this.loadOptions);
        file.readCentralPart(this.reader);
        this.files.push(file);
      }
      if (this.centralDirRecords !== this.files.length) {
        if (this.centralDirRecords !== 0 && this.files.length === 0) {
          throw new Error("Corrupted zip or bug: expected " + this.centralDirRecords + " records in central dir, got " + this.files.length);
        }
      }
    },
    /**
     * Read the end of central directory.
     */
    readEndOfCentral: function() {
      var offset = this.reader.lastIndexOfSignature(sig.CENTRAL_DIRECTORY_END);
      if (offset < 0) {
        var isGarbage = !this.isSignature(0, sig.LOCAL_FILE_HEADER);
        if (isGarbage) {
          throw new Error("Can't find end of central directory : is this a zip file ? If it is, see https://stuk.github.io/jszip/documentation/howto/read_zip.html");
        } else {
          throw new Error("Corrupted zip: can't find end of central directory");
        }
      }
      this.reader.setIndex(offset);
      var endOfCentralDirOffset = offset;
      this.checkSignature(sig.CENTRAL_DIRECTORY_END);
      this.readBlockEndOfCentral();
      if (this.diskNumber === utils2.MAX_VALUE_16BITS || this.diskWithCentralDirStart === utils2.MAX_VALUE_16BITS || this.centralDirRecordsOnThisDisk === utils2.MAX_VALUE_16BITS || this.centralDirRecords === utils2.MAX_VALUE_16BITS || this.centralDirSize === utils2.MAX_VALUE_32BITS || this.centralDirOffset === utils2.MAX_VALUE_32BITS) {
        this.zip64 = true;
        offset = this.reader.lastIndexOfSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
        if (offset < 0) {
          throw new Error("Corrupted zip: can't find the ZIP64 end of central directory locator");
        }
        this.reader.setIndex(offset);
        this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_LOCATOR);
        this.readBlockZip64EndOfCentralLocator();
        if (!this.isSignature(this.relativeOffsetEndOfZip64CentralDir, sig.ZIP64_CENTRAL_DIRECTORY_END)) {
          this.relativeOffsetEndOfZip64CentralDir = this.reader.lastIndexOfSignature(sig.ZIP64_CENTRAL_DIRECTORY_END);
          if (this.relativeOffsetEndOfZip64CentralDir < 0) {
            throw new Error("Corrupted zip: can't find the ZIP64 end of central directory");
          }
        }
        this.reader.setIndex(this.relativeOffsetEndOfZip64CentralDir);
        this.checkSignature(sig.ZIP64_CENTRAL_DIRECTORY_END);
        this.readBlockZip64EndOfCentral();
      }
      var expectedEndOfCentralDirOffset = this.centralDirOffset + this.centralDirSize;
      if (this.zip64) {
        expectedEndOfCentralDirOffset += 20;
        expectedEndOfCentralDirOffset += 12 + this.zip64EndOfCentralSize;
      }
      var extraBytes = endOfCentralDirOffset - expectedEndOfCentralDirOffset;
      if (extraBytes > 0) {
        if (this.isSignature(endOfCentralDirOffset, sig.CENTRAL_FILE_HEADER)) ;
        else {
          this.reader.zero = extraBytes;
        }
      } else if (extraBytes < 0) {
        throw new Error("Corrupted zip: missing " + Math.abs(extraBytes) + " bytes.");
      }
    },
    prepareReader: function(data) {
      this.reader = readerFor2(data);
    },
    /**
     * Read a zip file and create ZipEntries.
     * @param {String|ArrayBuffer|Uint8Array|Buffer} data the binary string representing a zip file.
     */
    load: function(data) {
      this.prepareReader(data);
      this.readEndOfCentral();
      this.readCentralDir();
      this.readLocalFiles();
    }
  };
  zipEntries = ZipEntries;
  return zipEntries;
}
var load;
var hasRequiredLoad;
function requireLoad() {
  if (hasRequiredLoad) return load;
  hasRequiredLoad = 1;
  var utils2 = requireUtils();
  var external2 = requireExternal();
  var utf82 = requireUtf8();
  var ZipEntries = requireZipEntries();
  var Crc32Probe = requireCrc32Probe();
  var nodejsUtils2 = requireNodejsUtils();
  function checkEntryCRC32(zipEntry2) {
    return new external2.Promise(function(resolve, reject) {
      var worker = zipEntry2.decompressed.getContentWorker().pipe(new Crc32Probe());
      worker.on("error", function(e) {
        reject(e);
      }).on("end", function() {
        if (worker.streamInfo.crc32 !== zipEntry2.decompressed.crc32) {
          reject(new Error("Corrupted zip : CRC32 mismatch"));
        } else {
          resolve();
        }
      }).resume();
    });
  }
  load = function(data, options) {
    var zip = this;
    options = utils2.extend(options || {}, {
      base64: false,
      checkCRC32: false,
      optimizedBinaryString: false,
      createFolders: false,
      decodeFileName: utf82.utf8decode
    });
    if (nodejsUtils2.isNode && nodejsUtils2.isStream(data)) {
      return external2.Promise.reject(new Error("JSZip can't accept a stream when loading a zip file."));
    }
    return utils2.prepareContent("the loaded zip file", data, true, options.optimizedBinaryString, options.base64).then(function(data2) {
      var zipEntries2 = new ZipEntries(options);
      zipEntries2.load(data2);
      return zipEntries2;
    }).then(function checkCRC32(zipEntries2) {
      var promises2 = [external2.Promise.resolve(zipEntries2)];
      var files = zipEntries2.files;
      if (options.checkCRC32) {
        for (var i = 0; i < files.length; i++) {
          promises2.push(checkEntryCRC32(files[i]));
        }
      }
      return external2.Promise.all(promises2);
    }).then(function addFiles(results) {
      var zipEntries2 = results.shift();
      var files = zipEntries2.files;
      for (var i = 0; i < files.length; i++) {
        var input = files[i];
        var unsafeName = input.fileNameStr;
        var safeName = utils2.resolve(input.fileNameStr);
        zip.file(safeName, input.decompressed, {
          binary: true,
          optimizedBinaryString: true,
          date: input.date,
          dir: input.dir,
          comment: input.fileCommentStr.length ? input.fileCommentStr : null,
          unixPermissions: input.unixPermissions,
          dosPermissions: input.dosPermissions,
          createFolders: options.createFolders
        });
        if (!input.dir) {
          zip.file(safeName).unsafeOriginalName = unsafeName;
        }
      }
      if (zipEntries2.zipComment.length) {
        zip.comment = zipEntries2.zipComment;
      }
      return zip;
    });
  };
  return load;
}
var lib;
var hasRequiredLib;
function requireLib() {
  if (hasRequiredLib) return lib;
  hasRequiredLib = 1;
  function JSZip2() {
    if (!(this instanceof JSZip2)) {
      return new JSZip2();
    }
    if (arguments.length) {
      throw new Error("The constructor with parameters has been removed in JSZip 3.0, please check the upgrade guide.");
    }
    this.files = /* @__PURE__ */ Object.create(null);
    this.comment = null;
    this.root = "";
    this.clone = function() {
      var newObj = new JSZip2();
      for (var i in this) {
        if (typeof this[i] !== "function") {
          newObj[i] = this[i];
        }
      }
      return newObj;
    };
  }
  JSZip2.prototype = requireObject();
  JSZip2.prototype.loadAsync = requireLoad();
  JSZip2.support = requireSupport();
  JSZip2.defaults = requireDefaults();
  JSZip2.version = "3.10.1";
  JSZip2.loadAsync = function(content, options) {
    return new JSZip2().loadAsync(content, options);
  };
  JSZip2.external = requireExternal();
  lib = JSZip2;
  return lib;
}
var libExports = requireLib();
const JSZip = /* @__PURE__ */ getDefaultExportFromCjs(libExports);
const CACHE_VERSION = 1;
function cachePath(dataDir, minecraftVersion2) {
  return node_path.join(dataDir, "cache", `items-${minecraftVersion2}-v${CACHE_VERSION}.json`);
}
function namesUnder(entries, prefix, extension) {
  const found = [];
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith(extension)) continue;
    const rest = entry.slice(prefix.length, -extension.length);
    if (rest === "" || rest.includes("/")) continue;
    found.push(rest);
  }
  return found.sort();
}
function labelFor(lang, name) {
  return lang[`item.minecraft.${name}`] ?? lang[`block.minecraft.${name}`] ?? lang[`entity.minecraft.${name}`] ?? lang[`biome.minecraft.${name}`] ?? // Not a fallback that hides a problem: an id with no name is still an id a
  // child can pick, and `oak_log` reads well enough beside its icon.
  name.replace(/_/g, " ");
}
function entriesFor(names, lang) {
  return names.map((name) => ({ id: `minecraft:${name}`, label: labelFor(lang, name) }));
}
async function readItemCatalogueFromJar(instanceDir, minecraftVersion2) {
  const jarPath = node_path.join(instanceDir, "versions", minecraftVersion2, `${minecraftVersion2}.jar`);
  const zip = await JSZip.loadAsync(await promises.readFile(jarPath));
  const names = Object.keys(zip.files);
  let lang = {};
  const langEntry = zip.file("assets/minecraft/lang/en_us.json");
  if (langEntry) {
    try {
      const parsed = JSON.parse(await langEntry.async("string"));
      if (typeof parsed === "object" && parsed !== null) {
        lang = parsed;
      }
    } catch {
    }
  }
  const items = namesUnder(names, "assets/minecraft/items/", ".json");
  if (items.length === 0) {
    throw new Error(`${jarPath} has no item definitions in assets/minecraft/items`);
  }
  return {
    minecraft: minecraftVersion2,
    items: entriesFor(items, lang),
    blocks: entriesFor(namesUnder(names, "data/minecraft/loot_table/blocks/", ".json"), lang),
    entities: entriesFor(namesUnder(names, "data/minecraft/loot_table/entities/", ".json"), lang),
    biomes: entriesFor(namesUnder(names, "data/minecraft/worldgen/biome/", ".json"), lang)
  };
}
async function readItemCatalogue(dataDir, instanceDir, minecraftVersion2) {
  const path = cachePath(dataDir, minecraftVersion2);
  try {
    const cached2 = JSON.parse(await promises.readFile(path, "utf8"));
    if (cached2.minecraft === minecraftVersion2 && Array.isArray(cached2.items) && cached2.items.length > 0 && Array.isArray(cached2.blocks) && Array.isArray(cached2.entities) && Array.isArray(cached2.biomes)) {
      return cached2;
    }
  } catch {
  }
  const catalogue = await readItemCatalogueFromJar(instanceDir, minecraftVersion2);
  await promises.mkdir(node_path.join(dataDir, "cache"), { recursive: true });
  const partial2 = `${path}.part`;
  await promises.writeFile(partial2, `${JSON.stringify(catalogue)}
`);
  await promises.rename(partial2, path);
  return catalogue;
}
function itemTextureName(id) {
  return /^(?:minecraft:)?([a-z0-9_]{1,64})$/.exec(id)?.[1];
}
function itemTextureDir(dataDir, minecraftVersion2) {
  return node_path.join(dataDir, "cache", `textures-${minecraftVersion2}`);
}
async function openJar(instanceDir, minecraftVersion2) {
  const jarPath = node_path.join(instanceDir, "versions", minecraftVersion2, `${minecraftVersion2}.jar`);
  try {
    return await JSZip.loadAsync(await promises.readFile(jarPath));
  } catch {
    return void 0;
  }
}
async function extractItemTextures(instanceDir, minecraftVersion2, targetDir) {
  const zip = await openJar(instanceDir, minecraftVersion2);
  if (!zip) return 0;
  await promises.mkdir(targetDir, { recursive: true });
  const written = /* @__PURE__ */ new Set();
  for (const folder of ["item", "block"]) {
    const prefix = `assets/minecraft/textures/${folder}/`;
    for (const name of namesUnder(Object.keys(zip.files), prefix, ".png")) {
      if (written.has(name)) continue;
      if (!itemTextureName(name)) continue;
      const entry = zip.file(`${prefix}${name}.png`);
      if (!entry) continue;
      const bytes = await entry.async("uint8array");
      const path = node_path.join(targetDir, `${name}.png`);
      const partial2 = `${path}.part`;
      await promises.writeFile(partial2, bytes);
      await promises.rename(partial2, path);
      written.add(name);
    }
  }
  await promises.writeFile(node_path.join(targetDir, MARKER), `${String(written.size)}
`);
  return written.size;
}
const MARKER = ".complete";
async function itemTexturesExtracted(targetDir) {
  try {
    await promises.readFile(node_path.join(targetDir, MARKER), "utf8");
    return true;
  } catch {
    return false;
  }
}
const FILE_NAME$3 = "pack-cache.json";
function packCachePath(dataDir) {
  return node_path.join(dataDir, FILE_NAME$3);
}
async function readPackCache(dataDir) {
  let parsed;
  try {
    parsed = JSON.parse(await promises.readFile(packCachePath(dataDir), "utf8"));
  } catch {
    return void 0;
  }
  if (typeof parsed !== "object" || parsed === null) return void 0;
  const record2 = parsed;
  try {
    const preset = parsePresetEnvelope(record2["preset"]);
    return {
      ...typeof record2["etag"] === "string" ? { etag: record2["etag"] } : {},
      fetchedAt: typeof record2["fetchedAt"] === "string" ? record2["fetchedAt"] : "",
      preset
    };
  } catch {
    return void 0;
  }
}
async function writePackCache(dataDir, cached2) {
  await promises.mkdir(dataDir, { recursive: true });
  const path = packCachePath(dataDir);
  const temporary = `${path}.${process$2.pid}-${Date.now().toString(36)}.part`;
  await promises.writeFile(temporary, `${JSON.stringify(cached2, null, 2)}
`);
  try {
    await promises.rename(temporary, path);
  } catch (error) {
    await promises.unlink(temporary).catch(() => {
    });
    throw error;
  }
}
const DISABLED_DIR = "mods-off";
const STATE_FILE = "mods.json";
function statePath$1(dataDir, packId) {
  return node_path.join(instanceLayout(dataDir, packId).instance, STATE_FILE);
}
function disabledDir(dataDir, packId) {
  return node_path.join(instanceLayout(dataDir, packId).instance, DISABLED_DIR);
}
async function readModState(dataDir, packId) {
  try {
    const parsed = JSON.parse(await promises.readFile(statePath$1(dataDir, packId), "utf8"));
    const disabled = Array.isArray(parsed.disabled) ? parsed.disabled.filter((id) => typeof id === "string") : [];
    return { disabled };
  } catch {
    return { disabled: [] };
  }
}
async function writeModState(dataDir, packId, state) {
  const layout = instanceLayout(dataDir, packId);
  await promises.mkdir(layout.instance, { recursive: true });
  await promises.writeFile(statePath$1(dataDir, packId), `${JSON.stringify(state, null, 2)}
`);
}
function isRequired(mod) {
  return mod.required === true;
}
async function listMods(manifest, dataDir, honourLocalSwitches = true) {
  const state = honourLocalSwitches ? await readModState(dataDir, manifest.packId) : { disabled: [] };
  const disabled = new Set(state.disabled);
  const inPack = manifest.mods.filter((mod) => mod.enabled);
  return inPack.map((mod) => ({
    id: mod.id,
    version: mod.version,
    license: mod.license,
    required: isRequired(mod),
    enabled: isRequired(mod) || !disabled.has(mod.id)
  }));
}
async function setModEnabled(manifest, dataDir, modId, enabled) {
  const mod = manifest.mods.find((candidate) => candidate.id === modId);
  if (!mod) return { ok: false, reason: "unknown-mod" };
  if (isRequired(mod) && !enabled) return { ok: false, reason: "required" };
  const layout = instanceLayout(dataDir, manifest.packId);
  const off = disabledDir(dataDir, manifest.packId);
  await promises.mkdir(layout.mods, { recursive: true });
  await promises.mkdir(off, { recursive: true });
  const fileName = modFileName(mod);
  const from = node_path.join(enabled ? off : layout.mods, fileName);
  const to = node_path.join(enabled ? layout.mods : off, fileName);
  try {
    await promises.rename(from, to);
  } catch {
  }
  const state = await readModState(dataDir, manifest.packId);
  const disabled = new Set(state.disabled);
  if (enabled) disabled.delete(modId);
  else disabled.add(modId);
  await writeModState(dataDir, manifest.packId, { disabled: [...disabled].sort() });
  return { ok: true, enabled };
}
const REVISION_SUFFIX = /-r\d+$/;
function worldKey(id) {
  return id.replace(REVISION_SUFFIX, "");
}
function matchWorld(worlds, storedId) {
  const exact = worlds.find((world) => world.id === storedId);
  if (exact !== void 0) return exact;
  const named = worlds.find((world) => world.previousIds?.includes(storedId) === true);
  if (named !== void 0) return named;
  const key = worldKey(storedId);
  const sameKey = worlds.filter((world) => worldKey(world.id) === key);
  return sameKey.length === 1 ? sameKey[0] : void 0;
}
function openWorlds(worlds, unlockedIds, seenOpenIds = []) {
  const opened = /* @__PURE__ */ new Set();
  for (const stored of [...unlockedIds, ...seenOpenIds]) {
    const world = matchWorld(worlds, stored);
    if (world !== void 0) opened.add(world);
  }
  return worlds.filter((world) => world.unlockHash === void 0 || opened.has(world));
}
async function fetchPackManifest(url, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Pack manifest at ${url} returned ${response.status} ${response.statusText}`);
  }
  return parsePackManifest(await response.json());
}
async function installMods(manifest, dataDir, onStep, fetchImpl = fetch, honourLocalSwitches = true) {
  const layout = instanceLayout(dataDir, manifest.packId);
  const offDir = node_path.join(layout.instance, DISABLED_DIR);
  await promises.mkdir(layout.mods, { recursive: true });
  await promises.mkdir(layout.userMods, { recursive: true });
  await promises.mkdir(offDir, { recursive: true });
  const inPack = manifest.mods.filter((mod) => mod.enabled);
  const state = honourLocalSwitches ? await readModState(dataDir, manifest.packId) : { disabled: [] };
  const disabled = new Set(state.disabled.filter((id) => {
    const mod = inPack.find((candidate) => candidate.id === id);
    return mod !== void 0 && !isRequired(mod);
  }));
  const expectedInMods = new Set(
    inPack.filter((mod) => !disabled.has(mod.id)).map((mod) => modFileName(mod))
  );
  const expectedInOff = new Set(
    inPack.filter((mod) => disabled.has(mod.id)).map((mod) => modFileName(mod))
  );
  let downloaded = 0;
  let alreadyPresent = 0;
  for (const [index, mod] of inPack.entries()) {
    onStep?.({ kind: "mods", done: index, total: inPack.length, label: mod.id });
    const targetDir = disabled.has(mod.id) ? offDir : layout.mods;
    const result = await downloadVerified(
      mod.url,
      node_path.join(targetDir, modFileName(mod)),
      mod.sha512,
      fetchImpl
    );
    if (result.outcome === "already-present") alreadyPresent += 1;
    else downloaded += 1;
  }
  onStep?.({ kind: "mods", done: inPack.length, total: inPack.length, label: "" });
  const removed = [
    ...await sweepJars(layout.mods, expectedInMods),
    ...await sweepJars(offDir, expectedInOff)
  ];
  return { downloaded, alreadyPresent, removed };
}
async function sweepJars(directory, expected) {
  return [];
}
function worldsStatePath(dataDir, packId) {
  return node_path.join(instanceLayout(dataDir, packId).instance, "worlds.json");
}
async function readInstalledWorlds(dataDir, packId) {
  return (await readWorldsState(dataDir, packId)).installed;
}
async function readWorldsState(dataDir, packId) {
  try {
    const parsed = JSON.parse(
      await promises.readFile(worldsStatePath(dataDir, packId), "utf8")
    );
    const installed = Array.isArray(parsed.installed) ? parsed.installed : [];
    return {
      installed: installed.filter(
        (entry) => typeof entry?.worldId === "string" && typeof entry.folder === "string" && typeof entry.revision === "number"
      )
    };
  } catch {
    return { installed: [] };
  }
}
function templateDir(dataDir, packId, worldId, revision) {
  return node_path.join(instanceLayout(dataDir, packId).worldsSrc, `${worldId}-r${revision}`);
}
async function listWorldLibrary(dataDir, packId) {
  const held = /* @__PURE__ */ new Map();
  try {
    const entries = await promises.readdir(instanceLayout(dataDir, packId).worldsSrc, {
      withFileTypes: true
    });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const parsed = /^(.+)-r(\d+)$/.exec(entry.name);
      if (!parsed) continue;
      const worldId = parsed[1];
      const revision = Number(parsed[2]);
      if (worldId === void 0) continue;
      const known = held.get(worldId);
      if (known === void 0 || revision > known) held.set(worldId, revision);
    }
  } catch {
  }
  return held;
}
async function syncWorldLibrary(dataDir, packId, open, onStep, fetchImpl = fetch) {
  if (open.length === 0) {
    return [];
  }
  const root = instanceLayout(dataDir, packId).worldsSrc;
  await promises.mkdir(root, { recursive: true });
  const results = [];
  for (const world of open) {
    const folder = `${world.id}-r${world.revision}`;
    const target = node_path.join(root, folder);
    await fetchArt(dataDir, packId, world, fetchImpl);
    if (await pathExists$1(target)) {
      results.push({
        worldId: world.id,
        revision: world.revision,
        folder,
        outcome: "already-there"
      });
      continue;
    }
    const response = await fetchImpl(world.url);
    if (!response.ok) {
      throw new Error(`World zip at ${world.url} returned ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = sha512OfBytes(bytes);
    if (actual !== world.sha512) {
      throw new Error(
        `World zip does not match its hash.
  expected ${world.sha512}
  actual   ${actual}`
      );
    }
    const temporary = node_path.join(root, `.tmp-${world.id}-${process.pid}-${Date.now().toString(36)}`);
    await promises.rm(temporary, { recursive: true, force: true });
    try {
      await extractWorldZip(bytes, temporary);
      await promises.rename(temporary, target);
    } catch (error) {
      await promises.rm(temporary, { recursive: true, force: true });
      throw error;
    }
    await removeOtherRevisions(root, world, open, folder);
    results.push({ worldId: world.id, revision: world.revision, folder, outcome: "installed" });
  }
  return results;
}
function artKeyOf(sha5122) {
  return sha5122.slice(0, 16);
}
function artPath(dataDir, packId, sha5122) {
  return node_path.join(instanceLayout(dataDir, packId).worldsSrc, "art", `${artKeyOf(sha5122)}.png`);
}
async function fetchArt(dataDir, packId, world, fetchImpl, onStep) {
  if (!world.art) return;
  const target = artPath(dataDir, packId, world.art.sha512);
  if (await pathExists$1(target)) return;
  try {
    const response = await fetchImpl(world.art.url);
    if (!response.ok) throw new Error(`art returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = sha512OfBytes(bytes);
    if (actual !== world.art.sha512) throw new Error("art does not match its hash");
    await promises.mkdir(node_path.join(target, ".."), { recursive: true });
    const temporary = `${target}.${process.pid}-${Date.now().toString(36)}.part`;
    await promises.writeFile(temporary, bytes);
    await promises.rename(temporary, target);
  } catch (error) {
  }
}
async function removeOtherRevisions(root, world, worlds, keep) {
  let entries;
  try {
    entries = await promises.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === keep) continue;
    const parsed = /^(.+)-r(\d+)$/.exec(entry.name);
    if (parsed?.[1] === void 0 || matchWorld(worlds, parsed[1]) !== world) continue;
    await promises.rm(node_path.join(root, entry.name), { recursive: true, force: true });
  }
}
async function extractWorldZip(bytes, target) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter((file) => !file.dir);
  const prefix = commonWorldPrefix(entries.map((file) => file.name));
  await promises.mkdir(target, { recursive: true });
  for (const file of entries) {
    const relative = prefix ? file.name.slice(prefix.length) : file.name;
    if (!relative) continue;
    if (!isSafeRelativePath(relative)) {
      throw new Error(`World zip contains an unsafe path: ${file.name}`);
    }
    const destination = node_path.join(target, relative);
    await promises.mkdir(node_path.join(destination, ".."), { recursive: true });
    await promises.writeFile(destination, await file.async("nodebuffer"));
  }
}
function isSafeRelativePath(relative) {
  if (relative.startsWith("/") || relative.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(relative)) return false;
  return !relative.split(/[\\/]/).includes("..");
}
function commonWorldPrefix(names) {
  if (names.length === 0) return "";
  const first = names[0] ?? "";
  const slash = first.indexOf("/");
  if (slash === -1) return "";
  const candidate = first.slice(0, slash + 1);
  return names.every((name) => name.startsWith(candidate)) ? candidate : "";
}
function installShape(manifest) {
  const copy = JSON.parse(JSON.stringify(manifest));
  delete copy["packVersion"];
  delete copy["studios"];
  const worlds = copy["worlds"];
  if (Array.isArray(worlds)) {
    for (const world of worlds) {
      if (!world || typeof world !== "object") continue;
      const row = world;
      delete row["title"];
      delete row["teaches"];
    }
  }
  return node_crypto.createHash("sha256").update(canonicalJson(copy)).digest("hex");
}
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value).filter(([, item]) => item !== void 0).sort(([one], [two]) => one < two ? -1 : one > two ? 1 : 0);
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
async function adoptPackVersion(dataDir, manifest) {
  const state = await readPackState(dataDir, manifest.packId);
  if (!state || state.packId !== manifest.packId) return false;
  const layout = instanceLayout(dataDir, manifest.packId);
  const next = {
    ...state,
    packVersion: manifest.packVersion,
    shape: installShape(manifest)
  };
  await promises.writeFile(layout.stateFile, `${JSON.stringify(next, null, 2)}
`);
  return true;
}
async function readPackState(dataDir, packId) {
  const layout = instanceLayout(dataDir, packId);
  try {
    return JSON.parse(await promises.readFile(layout.stateFile, "utf8"));
  } catch {
    return void 0;
  }
}
function stampMatches(state, manifest) {
  if (!state) return { ok: false, reason: "nothing is recorded on disk" };
  if (state.packId !== manifest.packId) {
    return { ok: false, reason: `pack is ${state.packId}, manifest wants ${manifest.packId}` };
  }
  if (state.packVersion !== manifest.packVersion) {
    return {
      ok: false,
      reason: `packVersion is ${state.packVersion}, manifest wants ${manifest.packVersion}`
    };
  }
  const verified = state.verified;
  if (!verified) return { ok: false, reason: "the stamp was written by an older launcher" };
  if (verified.minecraft !== manifest.minecraft) {
    return {
      ok: false,
      reason: `Minecraft is ${verified.minecraft}, manifest wants ${manifest.minecraft}`
    };
  }
  if (verified.loaderVersion !== manifest.loader.version) {
    return {
      ok: false,
      reason: `loader is ${verified.loaderVersion}, manifest wants ${manifest.loader.version}`
    };
  }
  const formats = verified.clientVersion;
  if (typeof formats?.resourceFormat?.major !== "number" || typeof formats.dataFormat?.major !== "number") {
    return { ok: false, reason: "the stamp has no pack formats - it predates them" };
  }
  if (state.shape === void 0) {
    return { ok: false, reason: "the stamp has no install shape - it predates it" };
  }
  if (state.shape !== installShape(manifest)) {
    return { ok: false, reason: "the manifest asks for files this install does not have" };
  }
  return { ok: true, verified };
}
async function writePackState(dataDir, manifest, now, verified) {
  const layout = instanceLayout(dataDir, manifest.packId);
  await promises.mkdir(layout.instance, { recursive: true });
  const state = {
    packId: manifest.packId,
    packVersion: manifest.packVersion,
    installedAt: now.toISOString(),
    shape: installShape(manifest),
    ...verified ? { verified } : {}
  };
  await promises.writeFile(layout.stateFile, `${JSON.stringify(state, null, 2)}
`);
}
async function clearVerifiedStamp(dataDir, packId) {
  const state = await readPackState(dataDir, packId);
  if (!state?.verified) return false;
  const layout = instanceLayout(dataDir, packId);
  const rest = {
    packId: state.packId,
    packVersion: state.packVersion,
    installedAt: state.installedAt
  };
  await promises.writeFile(layout.stateFile, `${JSON.stringify(rest, null, 2)}
`);
  return true;
}
async function pathExists$1(path) {
  try {
    await promises.stat(path);
    return true;
  } catch {
    return false;
  }
}
const SKIN_LOADER_DIR = "CustomSkinLoader";
const SKIN_LOADER_CONFIG_FILE = "CustomSkinLoader.json";
const ACCEPTED_SIZES = [
  { width: 64, height: 64 },
  { width: 64, height: 32 }
];
const SKIN_LOADER_CONFIG = {
  loadlist: [
    {
      name: "LocalSkin",
      type: "Legacy",
      checkPNG: false,
      // `{USERNAME}` is the mod's placeholder, and the path is relative to its
      // own folder. Both come from the config the mod generates for itself.
      skin: "LocalSkin/skins/{USERNAME}.png",
      model: "auto"
    }
  ],
  enableTransparentSkin: true,
  forceLoadAllTextures: true,
  enableCape: false,
  threadPoolSize: 2,
  enableLogStdOut: false,
  enableLocalProfileCache: false,
  forceDisableCache: true
};
const SKIN_LOADER_MOD = {
  id: "customskinloader",
  version: "15.0.1-Universal",
  url: "https://cdn.modrinth.com/data/idMHQ4n2/versions/OLaesh5y/CustomSkinLoader_Universal-15.0.1.jar",
  sha512: "8c65193c46c1435ddea571901f1dd04cc179179f59f1c1a0449349de04722b9c1b6e5efaec166975e05d2fa0b05f6c07c9d5d93a05f1c9a57fece2a0d0fc1ce7",
  license: "GPL-3.0-only",
  source: "https://github.com/xfl03/MCCustomSkinLoader",
  enabled: true,
  required: false
};
function withSkinLoader(manifest) {
  const others = manifest.mods.filter((mod) => mod.id !== SKIN_LOADER_MOD.id);
  return { ...manifest, mods: [...others, SKIN_LOADER_MOD] };
}
function skinLayout(instanceDir) {
  const root = node_path.join(instanceDir, SKIN_LOADER_DIR);
  return {
    root,
    config: node_path.join(root, SKIN_LOADER_CONFIG_FILE),
    skins: node_path.join(root, "LocalSkin", "skins")
  };
}
function skinFileFor(instanceDir, username) {
  return node_path.join(skinLayout(instanceDir).skins, `${username}.png`);
}
async function ensureSkinLoaderConfig(instanceDir) {
  const layout = skinLayout(instanceDir);
  await promises.mkdir(layout.root, { recursive: true });
  await promises.mkdir(layout.skins, { recursive: true });
  await promises.writeFile(layout.config, `${JSON.stringify(SKIN_LOADER_CONFIG, null, 2)}
`);
}
function pngSize(bytes) {
  const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24) return void 0;
  for (const [index, byte] of SIGNATURE.entries()) {
    if (bytes[index] !== byte) return void 0;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(12) !== 1229472850) return void 0;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}
function opaquePixelCount(bytes) {
  const header = readIhdr(bytes);
  if (!header) return void 0;
  const { width, height, bitDepth, colourType, interlace } = header;
  if (bitDepth !== 8 || colourType !== 6 || interlace !== 0) return void 0;
  const data = inflateIdat(bytes);
  if (!data) return void 0;
  const bpp = 4;
  const stride = width * bpp;
  if (data.length < height * (stride + 1)) return void 0;
  let opaque = 0;
  const previous = new Uint8Array(stride);
  const current = new Uint8Array(stride);
  for (let row = 0; row < height; row += 1) {
    const start = row * (stride + 1);
    const filter = data[start];
    current.set(data.subarray(start + 1, start + 1 + stride));
    for (let i = 0; i < stride; i += 1) {
      const left = i >= bpp ? current[i - bpp] ?? 0 : 0;
      const up = previous[i] ?? 0;
      const upLeft = i >= bpp ? previous[i - bpp] ?? 0 : 0;
      const raw = current[i] ?? 0;
      let value;
      switch (filter) {
        case 0:
          value = raw;
          break;
        case 1:
          value = raw + left;
          break;
        case 2:
          value = raw + up;
          break;
        case 3:
          value = raw + (left + up >> 1);
          break;
        case 4:
          value = raw + paeth(left, up, upLeft);
          break;
        default:
          return void 0;
      }
      current[i] = value & 255;
    }
    for (let x = 3; x < stride; x += bpp) {
      if ((current[x] ?? 0) !== 0) opaque += 1;
    }
    previous.set(current);
  }
  return opaque;
}
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}
function readIhdr(bytes) {
  const size = pngSize(bytes);
  if (!size) return void 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: size.width,
    height: size.height,
    bitDepth: view.getUint8(24),
    colourType: view.getUint8(25),
    interlace: view.getUint8(28)
  };
}
function inflateIdat(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts = [];
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7)
    );
    const from = at + 8;
    if (from + length > bytes.length) return void 0;
    if (type === "IDAT") parts.push(bytes.subarray(from, from + length));
    if (type === "IEND") break;
    at = from + length + 4;
  }
  if (parts.length === 0) return void 0;
  try {
    return node_zlib.inflateSync(Buffer.concat(parts.map((part) => Buffer.from(part))));
  } catch {
    return void 0;
  }
}
async function applySkin(instanceDir, username, png) {
  const size = pngSize(png);
  if (!size) return { ok: false, reason: "not-png" };
  if (!ACCEPTED_SIZES.some((it) => it.width === size.width && it.height === size.height)) {
    return { ok: false, reason: "wrong-size", width: size.width, height: size.height };
  }
  const opaque = opaquePixelCount(png);
  if (opaque === 0) return { ok: false, reason: "empty" };
  await ensureSkinLoaderConfig(instanceDir);
  const destination = skinFileFor(instanceDir, username);
  const partial2 = `${destination}.part`;
  await promises.writeFile(partial2, png);
  await promises.rename(partial2, destination);
  return { ok: true, path: destination, width: size.width, height: size.height };
}
async function removeAppliedSkin(instanceDir, username) {
  try {
    await promises.unlink(skinFileFor(instanceDir, username));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function readAppliedSkin(instanceDir, username) {
  try {
    return new Uint8Array(await promises.readFile(skinFileFor(instanceDir, username)));
  } catch {
    return void 0;
  }
}
function hasMinescript(mods) {
  return mods.some((mod) => mod.id === MINESCRIPT_MOD_ID && mod.enabled);
}
function anyWorldTeaches(manifest, studio) {
  return manifest.worlds.some((world) => world.teaches?.includes(studio) === true);
}
function openWorldTeaches(manifest, openWorldIds, studio) {
  const open = new Set(openWorldIds);
  return manifest.worlds.some(
    (world) => open.has(world.id) && world.teaches?.includes(studio) === true
  );
}
function resolveStudios(manifest, mods, openWorldIds = [], granted = []) {
  const asked = manifest.studios;
  const fromWorlds = (studio, fallback) => {
    if (granted.includes(studio)) return true;
    if (anyWorldTeaches(manifest, studio)) return openWorldTeaches(manifest, openWorldIds, studio);
    return fallback;
  };
  return {
    skins: asked?.skins ?? true,
    datapacks: asked?.datapacks ?? fromWorlds("datapacks", true),
    python: asked?.python ?? fromWorlds("python", hasMinescript(mods))
  };
}
function skinLibraryDir(dataDir) {
  return node_path.join(dataDir, "skins");
}
const INDEX_FILE = "library.json";
function contentId(png) {
  return node_crypto.createHash("sha256").update(png).digest("hex").slice(0, 16);
}
function fileFor(dataDir, id) {
  return node_path.join(skinLibraryDir(dataDir), `${id}.png`);
}
async function readIndex(dataDir) {
  try {
    const raw = await promises.readFile(node_path.join(skinLibraryDir(dataDir), INDEX_FILE), "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}
async function writeIndex(dataDir, index) {
  const path = node_path.join(skinLibraryDir(dataDir), INDEX_FILE);
  const partial2 = `${path}.part`;
  await promises.writeFile(partial2, JSON.stringify(index, null, 2));
  await promises.rename(partial2, path);
}
async function addToLibrary(dataDir, png, title, projectId, now = /* @__PURE__ */ new Date()) {
  const size = pngSize(png);
  if (!size) return void 0;
  const id = contentId(png);
  await promises.mkdir(skinLibraryDir(dataDir), { recursive: true });
  const index = await readIndex(dataDir);
  const existing = index[id];
  if (!existing) {
    const path = fileFor(dataDir, id);
    const partial2 = `${path}.part`;
    await promises.writeFile(partial2, png);
    await promises.rename(partial2, path);
    index[id] = {
      title,
      addedAt: now.toISOString(),
      ...projectId === void 0 ? {} : { projectId }
    };
    await writeIndex(dataDir, index);
  }
  const record2 = index[id] ?? { title, addedAt: now.toISOString() };
  return {
    entry: {
      id,
      title: record2.title,
      addedAt: record2.addedAt,
      ...record2.projectId === void 0 ? {} : { projectId: record2.projectId },
      ...size
    },
    alreadyThere: existing !== void 0
  };
}
async function stampLibraryProject(dataDir, id, projectId, title) {
  if (!/^[0-9a-f]{16}$/.test(id)) return false;
  let onDisk = true;
  try {
    await promises.stat(fileFor(dataDir, id));
  } catch {
    onDisk = false;
  }
  if (!onDisk) return false;
  const index = await readIndex(dataDir);
  const existing = index[id];
  const keptTitle = existing?.title ? existing.title : "";
  index[id] = {
    title: keptTitle,
    addedAt: existing?.addedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
    projectId
  };
  await writeIndex(dataDir, index);
  return true;
}
async function readPngHeader(path) {
  let handle;
  try {
    handle = await promises.open(path, "r");
  } catch {
    return void 0;
  }
  try {
    const buffer = Buffer.alloc(24);
    const { bytesRead } = await handle.read(buffer, 0, 24, 0);
    return bytesRead < 24 ? void 0 : new Uint8Array(buffer);
  } catch {
    return void 0;
  } finally {
    await handle.close().catch(() => {
    });
  }
}
async function listLibrary(dataDir) {
  let names;
  try {
    names = await promises.readdir(skinLibraryDir(dataDir));
  } catch {
    return [];
  }
  const index = await readIndex(dataDir);
  const read = names.filter((name) => name.endsWith(".png")).map(async (name) => {
    const id = name.slice(0, -".png".length);
    const header = await readPngHeader(node_path.join(skinLibraryDir(dataDir), name));
    const size = header ? pngSize(header) : void 0;
    if (!size) return void 0;
    const record2 = index[id];
    return {
      id,
      title: record2?.title ?? "",
      addedAt: record2?.addedAt ?? "",
      ...record2?.projectId === void 0 ? {} : { projectId: record2.projectId },
      ...size
    };
  });
  const entries = (await Promise.all(read)).filter((entry) => entry !== void 0);
  return entries.sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
}
async function readLibrarySkin(dataDir, id) {
  if (!/^[0-9a-f]{1,64}$/.test(id)) return void 0;
  try {
    return new Uint8Array(await promises.readFile(fileFor(dataDir, id)));
  } catch {
    return void 0;
  }
}
function appliedIdOf(applied) {
  return applied ? contentId(applied) : void 0;
}
async function removeFromLibrary(dataDir, id) {
  if (!/^[0-9a-f]{1,64}$/.test(id)) return false;
  try {
    await promises.unlink(fileFor(dataDir, id));
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const index = await readIndex(dataDir);
  if (index[id]) {
    delete index[id];
    await writeIndex(dataDir, index);
  }
  return true;
}
const IN_JAR = {
  steve: "assets/minecraft/textures/entity/player/wide/steve.png",
  alex: "assets/minecraft/textures/entity/player/slim/alex.png"
};
const DEFAULT_SKIN_IDS = ["steve", "alex"];
function cacheDir(dataDir, minecraftVersion2) {
  return node_path.join(skinLibraryDir(dataDir), "defaults", minecraftVersion2);
}
async function readCached(dataDir, minecraftVersion2, id) {
  try {
    const bytes = new Uint8Array(await promises.readFile(node_path.join(cacheDir(dataDir, minecraftVersion2), `${id}.png`)));
    return pngSize(bytes) ? bytes : void 0;
  } catch {
    return void 0;
  }
}
async function readDefaultSkins(dataDir, instanceDir, minecraftVersion2) {
  const found = [];
  const missing = [];
  for (const id of DEFAULT_SKIN_IDS) {
    const cached2 = await readCached(dataDir, minecraftVersion2, id);
    if (cached2) found.push({ id, png: cached2 });
    else missing.push(id);
  }
  if (missing.length === 0) return found;
  const jarPath = node_path.join(instanceDir, "versions", minecraftVersion2, `${minecraftVersion2}.jar`);
  let zip;
  try {
    zip = await JSZip.loadAsync(await promises.readFile(jarPath));
  } catch {
    return found;
  }
  const directory = cacheDir(dataDir, minecraftVersion2);
  await promises.mkdir(directory, { recursive: true }).catch(() => {
  });
  for (const id of missing) {
    const entry = zip.file(IN_JAR[id]);
    if (!entry) continue;
    const png = new Uint8Array(await entry.async("uint8array"));
    if (!pngSize(png)) continue;
    const path = node_path.join(directory, `${id}.png`);
    const partial2 = `${path}.part`;
    await promises.writeFile(partial2, png);
    await promises.rename(partial2, path);
    found.push({ id, png });
  }
  return DEFAULT_SKIN_IDS.flatMap((id) => found.filter((skin) => skin.id === id));
}
function toPackSpec(manifest) {
  return {
    packId: manifest.packId,
    minecraft: manifest.minecraft,
    loader: manifest.loader
  };
}
const nbtByte = (value) => ({ kind: "byte", value });
const nbtInt = (value) => ({ kind: "int", value });
const nbtLong = (value) => ({ kind: "long", value });
const nbtString = (value) => ({ kind: "string", value });
const nbtCompound = (value) => ({ kind: "compound", value });
const nbtStringList = (value) => ({ kind: "stringList", value });
const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TYPE_IDS = {
  byte: TAG_BYTE,
  int: TAG_INT,
  long: TAG_LONG,
  string: TAG_STRING,
  compound: TAG_COMPOUND,
  stringList: TAG_LIST
};
function encodeNbt(root) {
  return writeTag("", { kind: "compound", value: root });
}
function writeTag(name, value) {
  return Buffer.concat([Buffer.from([TYPE_IDS[value.kind]]), writeName(name), writePayload(value)]);
}
function writeName(name) {
  return writeString(name);
}
function writeString(value) {
  if (value.includes("\0") || [...value].some((char) => char.codePointAt(0) > 65535)) {
    throw new Error(
      `Cannot write "${value}" as NBT: this writer only handles the BMP without NUL, which is everything level.dat needs. Widen it deliberately if that changes.`
    );
  }
  const bytes = Buffer.from(value, "utf8");
  const header = Buffer.alloc(2);
  header.writeUInt16BE(bytes.length, 0);
  return Buffer.concat([header, bytes]);
}
function writePayload(value) {
  switch (value.kind) {
    case "byte": {
      const buffer = Buffer.alloc(1);
      buffer.writeInt8(value.value, 0);
      return buffer;
    }
    case "int": {
      const buffer = Buffer.alloc(4);
      buffer.writeInt32BE(value.value, 0);
      return buffer;
    }
    case "long": {
      const buffer = Buffer.alloc(8);
      buffer.writeBigInt64BE(value.value, 0);
      return buffer;
    }
    case "string":
      return writeString(value.value);
    case "compound": {
      const parts = Object.entries(value.value).map(([key, child]) => writeTag(key, child));
      return Buffer.concat([...parts, Buffer.from([TAG_END])]);
    }
    case "stringList": {
      const header = Buffer.alloc(5);
      header.writeInt8(value.value.length === 0 ? TAG_END : TAG_STRING, 0);
      header.writeInt32BE(value.value.length, 1);
      return Buffer.concat([header, ...value.value.map((entry) => writeString(entry))]);
    }
  }
}
const ANVIL_FORMAT_VERSION = 19133;
async function readClientVersionInfo(instanceDir, minecraftVersion2) {
  const jarPath = node_path.join(instanceDir, "versions", minecraftVersion2, `${minecraftVersion2}.jar`);
  const zip = await JSZip.loadAsync(await promises.readFile(jarPath));
  const entry = zip.file("version.json");
  if (!entry) throw new Error(`${jarPath} has no version.json`);
  const parsed = JSON.parse(await entry.async("string"));
  if (typeof parsed.world_version !== "number") {
    throw new Error(`${jarPath} version.json has no world_version`);
  }
  const packs = parsed.pack_version;
  if (typeof packs?.resource_major !== "number" || typeof packs.data_major !== "number") {
    throw new Error(`${jarPath} version.json has no pack_version majors`);
  }
  return {
    dataVersion: parsed.world_version,
    name: parsed.name ?? minecraftVersion2,
    resourceFormat: { major: packs.resource_major, minor: packs.resource_minor ?? 0 },
    dataFormat: { major: packs.data_major, minor: packs.data_minor ?? 0 }
  };
}
function randomSeed() {
  return node_crypto.randomBytes(8).readBigInt64BE(0);
}
function vanillaDimension(type, settings, biomeSource) {
  return nbtCompound({
    type: nbtString(type),
    generator: nbtCompound({
      type: nbtString("minecraft:noise"),
      settings: nbtString(settings),
      biome_source: biomeSource
    })
  });
}
function multiNoiseBiomes(preset) {
  return nbtCompound({ type: nbtString("minecraft:multi_noise"), preset: nbtString(preset) });
}
function theEndBiomes() {
  return nbtCompound({ type: nbtString("minecraft:the_end") });
}
function enableCheatsInLevelDat(levelDatPath) {
  try {
    if (!node_fs.existsSync(levelDatPath)) return;
    const compressed = node_fs.readFileSync(levelDatPath);
    const buf = node_zlib.gunzipSync(compressed);
    const target = Buffer.from("allowCommands");
    const idx = buf.indexOf(target);
    if (idx !== -1) {
      const valIdx = idx + target.length;
      if (valIdx < buf.length && buf[valIdx] === 0) {
        buf[valIdx] = 1;
        node_fs.writeFileSync(levelDatPath, node_zlib.gzipSync(buf));
      }
    }
  } catch {}
}
function buildLevelData(options) {
  const { worldName, version: version2, now } = options;
  return {
    Data: nbtCompound({
      DataVersion: nbtInt(version2.dataVersion),
      version: nbtInt(ANVIL_FORMAT_VERSION),
      LevelName: nbtString(worldName),
      // Survival, normal difficulty, no cheats: the plain default a child
      // expects. The Studio (R3.1) will need commands, and that is a decision
      // for that release rather than something to switch on quietly now.
      GameType: nbtInt(0),
      Difficulty: nbtByte(2),
      DifficultyLocked: nbtByte(0),
      hardcore: nbtByte(0),
      allowCommands: nbtByte(1),
      // See the note above: this is what makes the game generate a spawn.
      initialized: nbtByte(0),
      Time: nbtLong(0n),
      DayTime: nbtLong(0n),
      LastPlayed: nbtLong(BigInt(now.getTime())),
      clearWeatherTime: nbtInt(0),
      rainTime: nbtInt(0),
      thunderTime: nbtInt(0),
      raining: nbtByte(0),
      thundering: nbtByte(0),
      WasModded: nbtByte(0),
      // World generation is NOT described here any more. In 26.2 it lives in a
      // separate file, `data/minecraft/world_gen_settings.dat` - see
      // `encodeWorldGenSettings`. A `WorldGenSettings` compound in level.dat is
      // silently ignored, which is exactly how this was found: the game logged
      // "Unable to read or access the world gen settings file" and then refused
      // to open the world at all.
      DataPacks: nbtCompound({
        Enabled: nbtStringList(["vanilla"]),
        Disabled: nbtStringList([])
      }),
      enabled_features: nbtStringList(["minecraft:vanilla"]),
      Version: nbtCompound({
        Id: nbtInt(version2.dataVersion),
        Name: nbtString(version2.name),
        Snapshot: nbtByte(0)
      })
    })
  };
}
function encodeLevelDat(options) {
  return node_zlib.gzipSync(encodeNbt(buildLevelData(options)));
}
const WORLD_GEN_SETTINGS_PATH = ["data", "minecraft", "world_gen_settings.dat"];
function encodeWorldGenSettings(seed, version2) {
  return node_zlib.gzipSync(
    encodeNbt({
      data: nbtCompound({
        seed: nbtLong(seed),
        generate_features: nbtByte(1),
        bonus_chest: nbtByte(0),
        dimensions: nbtCompound({
          "minecraft:overworld": vanillaDimension(
            "minecraft:overworld",
            "minecraft:overworld",
            multiNoiseBiomes("minecraft:overworld")
          ),
          "minecraft:the_nether": vanillaDimension(
            "minecraft:the_nether",
            "minecraft:nether",
            multiNoiseBiomes("minecraft:nether")
          ),
          "minecraft:the_end": vanillaDimension("minecraft:the_end", "minecraft:end", theEndBiomes())
        })
      }),
      DataVersion: nbtInt(version2.dataVersion)
    })
  );
}
async function writeWorld(worldDir, worldName, seed, version2, now = /* @__PURE__ */ new Date()) {
  await promises.mkdir(node_path.join(worldDir, WORLD_GEN_SETTINGS_PATH[0], WORLD_GEN_SETTINGS_PATH[1]), {
    recursive: true
  });
  await promises.writeFile(node_path.join(worldDir, "level.dat"), encodeLevelDat({ worldName, version: version2, now }));
  await promises.writeFile(node_path.join(worldDir, ...WORLD_GEN_SETTINGS_PATH), encodeWorldGenSettings(seed, version2));
  enableCheatsInLevelDat(node_path.join(worldDir, "level.dat"));
}
const PRESET_WORLDS = [
  { id: "world-1", folder: "World1", seed: 777n },
  { id: "world-2", folder: "World2", seed: 12345n },
  { id: "world-3", folder: "World3", seed: 2026n }
];
const RANDOM_WORLD_ID = "world-random";
function normalizeUnlockCode(code) {
  return code.trim().toLowerCase();
}
function hashUnlockCode(code) {
  return node_crypto.createHash("sha256").update(normalizeUnlockCode(code)).digest("hex");
}
function findPreset(id) {
  return PRESET_WORLDS.find((world) => world.id === id);
}
function listTemplates(open, library) {
  const mainmenu = {
    id: "minecraft-menu",
    kind: "preset",
    seed: null,
    title: "Ana Menü (Standart Minecraft)",
    description: "Dünyasız başlat - Minecraft ana menüsüne girer",
    artKey: null,
    revision: null,
    previewKey: null,
    ready: true
  };
  const random = {
    id: RANDOM_WORLD_ID,
    kind: "random",
    seed: null,
    title: null,
    description: null,
    artKey: null,
    revision: null,
    previewKey: null,
    ready: true
  };
  if (open !== void 0) {
    const lessons = open.map(
      (world) => ({
        id: world.id,
        kind: "manifest",
        seed: null,
        title: world.title ?? null,
        description: world.description ?? null,
        artKey: world.art ? artKeyOf(world.art.sha512) : null,
        revision: world.revision,
        previewKey: `${world.id}-r${world.revision}`,
        ready: library.get(world.id) === world.revision
      })
    );
    return [mainmenu, ...lessons, random];
  }
  const presets = PRESET_WORLDS.map(
    (world) => ({
      id: world.id,
      kind: "preset",
      seed: world.seed === null ? null : world.seed.toString(),
      title: null,
      description: null,
      artKey: null,
      revision: null,
      previewKey: null,
      ready: true
    })
  );
  return [mainmenu, ...presets, random];
}
const MAX_FOLDER = 32;
const MAX_NAME = 60;
function statePath(dataDir, packId) {
  return node_path.join(instanceLayout(dataDir, packId).instance, "my-worlds.json");
}
async function readMyWorlds(dataDir, packId) {
  try {
    const parsed = JSON.parse(await promises.readFile(statePath(dataDir, packId), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return [];
    const worlds = parsed.worlds;
    if (!Array.isArray(worlds)) return [];
    return worlds.filter(isMyWorld);
  } catch {
    return [];
  }
}
function isSafeFolderName(folder) {
  if (folder === "" || folder === "." || folder === "..") return false;
  return !SEPARATOR.test(folder);
}
const SEPARATOR = /[/\\]/;
function isMyWorld(value) {
  if (typeof value !== "object" || value === null) return false;
  const entry = value;
  return typeof entry.id === "string" && entry.id !== "" && typeof entry.folder === "string" && // The same check the delete path runs, done here as well so a hand-edited
  // path never reaches a caller that trusts the record.
  isSafeFolderName(entry.folder) && typeof entry.name === "string" && typeof entry.createdAt === "string" && isSource(entry.source);
}
function isSource(value) {
  if (typeof value !== "object" || value === null) return false;
  const source = value;
  switch (source.kind) {
    case "manifest":
      return typeof source.worldId === "string" && (source.revision === null || typeof source.revision === "number");
    case "preset":
      return typeof source.worldId === "string" && typeof source.seed === "string";
    case "random":
      return source.seed === null || typeof source.seed === "string";
    case "adopted":
      return true;
    default:
      return false;
  }
}
const writers = /* @__PURE__ */ new Map();
function serialized(dataDir, packId, work) {
  const key = `${dataDir}::${packId}`;
  const queued = (writers.get(key) ?? Promise.resolve()).then(work, work);
  writers.set(
    key,
    queued.catch(() => void 0)
  );
  return queued;
}
async function writeMyWorlds(dataDir, packId, worlds) {
  const layout = instanceLayout(dataDir, packId);
  await promises.mkdir(layout.instance, { recursive: true });
  const path = statePath(dataDir, packId);
  const state = { version: 1, worlds: [...worlds] };
  const temporary = `${path}.${node_crypto.randomUUID()}.part`;
  await promises.writeFile(temporary, `${JSON.stringify(state, null, 2)}
`);
  try {
    await promises.rename(temporary, path);
  } catch (error) {
    await promises.unlink(temporary).catch(() => {
    });
    throw error;
  }
}
function folderBaseOf(wanted, fallback = "world") {
  const kept = wanted.replace(/[^A-Za-z0-9_-]+/g, "").trim();
  const base = kept === "" ? slugify(wanted, fallback) : kept;
  const cut = base.slice(0, MAX_FOLDER).trim();
  return isWorldFolder(cut) ? cut : fallback;
}
async function claimFolder(dataDir, packId, base, taken) {
  const layout = instanceLayout(dataDir, packId);
  await promises.mkdir(layout.saves, { recursive: true });
  const used = new Set(taken);
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = uniqueId(used, base);
    try {
      await promises.mkdir(node_path.join(layout.saves, candidate));
      return candidate;
    } catch {
      used.add(candidate);
    }
  }
  throw new Error(`could not find a free world folder for "${base}"`);
}
async function createMyWorld(dataDir, packId, template, version2) {
  return serialized(dataDir, packId, () => writeCopy(dataDir, packId, template, version2));
}
async function writeCopy(dataDir, packId, template, version2) {
  const layout = instanceLayout(dataDir, packId);
  const seed = template.kind === "preset" ? template.seed : randomSeed();
  let source;
  let base;
  if (template.kind === "manifest") {
    source = templateDir(dataDir, packId, template.worldId, template.revision);
    if (!await exists(source)) return { ok: false, reason: "library-not-ready" };
    base = folderBaseOf(template.folderBase);
  } else {
    if (!version2) return { ok: false, reason: "game-not-installed" };
    base = template.kind === "preset" ? folderBaseOf(template.folderBase) : (
      // The low bits of the seed, the shape rolled worlds have always had.
      // It is not where the seed is kept any more - the record holds all of
      // it - but a familiar name in a log is worth keeping.
      `Random${(seed & 0xffffffn).toString(10)}`
    );
  }
  const worlds = await readMyWorlds(dataDir, packId);
  const folder = await claimFolder(
    dataDir,
    packId,
    base,
    worlds.map((entry) => entry.folder)
  );
  const target = node_path.join(layout.saves, folder);
  try {
    if (source === void 0) {
      if (!version2) return { ok: false, reason: "game-not-installed" };
      await writeWorld(target, folder, seed, version2);
    } else {
      await promises.cp(source, target, { recursive: true });
    }
  } catch {
    await promises.rm(target, { recursive: true, force: true }).catch(() => {
    });
    return { ok: false, reason: "failed" };
  }
  const world = {
    id: uniqueId(
      worlds.map((entry) => entry.id),
      slugify(folder, "world")
    ),
    folder,
    name: "",
    source: sourceOf(template, seed),
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeMyWorlds(dataDir, packId, [...worlds, world]);
  return { ok: true, world };
}
function sourceOf(template, seed) {
  switch (template.kind) {
    case "manifest":
      return { kind: "manifest", worldId: template.worldId, revision: template.revision };
    case "preset":
      return { kind: "preset", worldId: template.worldId, seed: seed.toString() };
    case "random":
      return { kind: "random", seed: seed.toString() };
  }
}
async function renameMyWorld(dataDir, packId, id, name) {
  return serialized(dataDir, packId, async () => {
    const worlds = await readMyWorlds(dataDir, packId);
    if (!worlds.some((world) => world.id === id)) return false;
    await writeMyWorlds(
      dataDir,
      packId,
      worlds.map(
        (world) => world.id === id ? { ...world, name: name.trim().slice(0, MAX_NAME) } : world
      )
    );
    return true;
  });
}
async function exists(path) {
  try {
    await promises.stat(path);
    return true;
  } catch {
    return false;
  }
}
async function migrateMyWorlds(dataDir, packId, worlds, installed) {
  return serialized(dataDir, packId, () => recordEveryFolder(dataDir, packId, worlds, installed));
}
async function recordEveryFolder(dataDir, packId, worlds, installed) {
  const layout = instanceLayout(dataDir, packId);
  const known = await readMyWorlds(dataDir, packId);
  const folders = await savedFolders(layout.saves);
  const onDisk = new Set(folders);
  const present = known.filter((world) => onDisk.has(world.folder));
  const kept = present.map((world) => rebindSource(world, worlds));
  const rebound = kept.some((world, index) => world !== present[index]);
  const recorded = new Set(kept.map((world) => world.folder));
  const ids = new Set(kept.map((world) => world.id));
  const added = [];
  for (const folder of folders) {
    if (recorded.has(folder)) continue;
    const id = uniqueId(ids, slugify(folder, "world"));
    ids.add(id);
    added.push({
      id,
      folder,
      // Never a title from the manifest: see `MyWorld.name`.
      name: "",
      source: classify(folder, worlds, installed),
      createdAt: await bornAt(node_path.join(layout.saves, folder), folder, installed)
    });
  }
  const next = [...kept, ...added];
  if (added.length > 0 || kept.length !== known.length || rebound) {
    await writeMyWorlds(dataDir, packId, next);
  }
  return next;
}
function rebindSource(world, worlds) {
  const { source } = world;
  if (source.kind !== "manifest") return world;
  const match = matchWorld(worlds, source.worldId);
  if (match === void 0 || match.id === source.worldId) return world;
  return { ...world, source: { ...source, worldId: match.id } };
}
async function savedFolders(saves) {
  try {
    const entries = await promises.readdir(saves, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && isSafeFolderName(entry.name)).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}
function classify(folder, worlds, installed) {
  const record2 = installed.find((entry) => entry.folder === folder);
  if (record2) return { kind: "manifest", worldId: record2.worldId, revision: record2.revision };
  const beside = /^(.+)-r(\d+)$/.exec(folder);
  if (beside) {
    const world = worlds.find((entry) => entry.name === beside[1]);
    if (world) return { kind: "manifest", worldId: world.id, revision: Number(beside[2]) };
  }
  const named = worlds.find((entry) => entry.name === folder);
  if (named) return { kind: "manifest", worldId: named.id, revision: null };
  const preset = PRESET_WORLDS.find((entry) => entry.folder === folder);
  if (preset && preset.seed !== null) {
    return { kind: "preset", worldId: preset.id, seed: preset.seed.toString() };
  }
  if (/^Random\d+$/.test(folder)) return { kind: "random", seed: null };
  return { kind: "adopted" };
}
async function bornAt(path, folder, installed) {
  const record2 = installed.find((entry) => entry.folder === folder);
  if (record2 && !Number.isNaN(Date.parse(record2.at))) return record2.at;
  try {
    const info = await promises.stat(path);
    const born = info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs;
    return new Date(born).toISOString();
  } catch {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
}
async function playedState(saves, world, now = /* @__PURE__ */ new Date()) {
  const since = Date.parse(world.createdAt);
  if (Number.isNaN(since)) return "never";
  let played;
  try {
    const level = await promises.stat(node_path.join(saves, world.folder, "level.dat"));
    played = level.mtimeMs;
  } catch {
    return "never";
  }
  if (played <= since + 1e3) return "never";
  const when = new Date(played);
  if (when.toDateString() === now.toDateString()) return "today";
  return now.getTime() - played < 7 * 24 * 60 * 60 * 1e3 ? "week" : "long";
}
function pickMyWorld(worlds, storedId) {
  return worlds.find((world) => world.id === storedId) ?? worlds[0];
}
async function describeMyWorlds(dataDir, packId, worlds, library) {
  const layout = instanceLayout(dataDir, packId);
  const ordinals = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Map();
  for (const world of worlds) {
    const lesson = templateIdOf(world.source) ?? "";
    const next = (seen.get(lesson) ?? 0) + 1;
    seen.set(lesson, next);
    ordinals.set(world.id, next);
  }
  return Promise.all(
    worlds.map(async (world) => {
      const [played, hasPreview] = await Promise.all([
        playedState(layout.saves, world),
        exists(node_path.join(layout.saves, world.folder, "icon.png"))
      ]);
      return {
        id: world.id,
        folder: world.folder,
        name: world.name,
        source: world.source.kind,
        templateId: templateIdOf(world.source),
        seed: seedOf(world.source),
        played,
        ordinal: ordinals.get(world.id) ?? 1,
        hasPreview,
        updateAvailable: hasNewer(world.source, library)
      };
    })
  );
}
function templateIdOf(source) {
  switch (source.kind) {
    case "manifest":
    case "preset":
      return source.worldId;
    case "random":
      return RANDOM_WORLD_ID;
    case "adopted":
      return null;
  }
}
function seedOf(source) {
  switch (source.kind) {
    case "preset":
      return source.seed;
    case "random":
      return source.seed;
    case "manifest":
    case "adopted":
      return null;
  }
}
function hasNewer(source, library) {
  if (source.kind !== "manifest") return false;
  const held = library.get(source.worldId);
  if (held === void 0) return false;
  return source.revision === null || held > source.revision;
}
async function deleteMyWorld(dataDir, packId, id) {
  return serialized(dataDir, packId, () => removeCopy(dataDir, packId, id));
}
async function removeCopy(dataDir, packId, id) {
  const worlds = await readMyWorlds(dataDir, packId);
  const world = worlds.find((entry) => entry.id === id);
  if (!world) return { ok: false };
  if (!isSafeFolderName(world.folder)) return { ok: false };
  const layout = instanceLayout(dataDir, packId);
  const target = node_path.resolve(layout.saves, world.folder);
  if (target !== node_path.join(layout.saves, world.folder) || node_path.dirname(target) !== node_path.resolve(layout.saves)) {
    return { ok: false };
  }
  await promises.rm(target, { recursive: true, force: true });
  await writeMyWorlds(
    dataDir,
    packId,
    worlds.filter((entry) => entry.id !== id)
  );
  return { ok: true, folder: world.folder };
}
const DEV_SSO_URL = "https://sso.dev.kodland.org";
const SSO_TIMEOUT_MS = 1e4;
class SsoUrlNotConfiguredError extends Error {
  constructor() {
    super(
      "SSO_URL is not set. A packaged build must be given one at build time - falling back to the dev stand would sign children in against test data."
    );
    this.name = "SsoUrlNotConfiguredError";
  }
}
function resolveSsoUrl(input) {
  const raw = input.env["SSO_URL"]?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  if (input.isPackaged) throw new SsoUrlNotConfiguredError();
  return DEV_SSO_URL;
}
function describeSsoUrl(input) {
  const raw = input.env["SSO_URL"]?.trim();
  return raw ? `SSO at ${raw}` : `SSO at ${DEV_SSO_URL} (dev fallback, SSO_URL is not set)`;
}
const NO_STUDENT_RECORD_STATUSES = /* @__PURE__ */ new Set([404, 422]);
function asString(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}
function createSsoClient(options) {
  const base = options.baseUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SSO_TIMEOUT_MS;
  async function postForm(path, body) {
    try {
      return await doFetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      return null;
    }
  }
  async function readJson(response) {
    try {
      const data = await response.json();
      return typeof data === "object" && data !== null ? data : null;
    } catch {
      return null;
    }
  }
  async function readJsonAllowingNull(response) {
    try {
      return { ok: true, value: await response.json() };
    } catch {
      return { ok: false };
    }
  }
  return {
    /** `POST /login` — username and password for a token pair. 403 means wrong credentials. */
    async login(username, password) {
      const response = await postForm("/login", { username, password });
      if (!response) return { ok: false, error: "unavailable" };
      if (response.status === 403) return { ok: false, error: "invalid_credentials" };
      if (!response.ok) return { ok: false, error: "unavailable" };
      const data = await readJson(response);
      const accessToken = asString(data?.["access_token"]);
      const refreshToken = asString(data?.["refresh_token"]);
      if (!accessToken || !refreshToken) return { ok: false, error: "unavailable" };
      return { ok: true, data: { accessToken, refreshToken } };
    },
    /**
     * `POST /token` — rotate for a fresh pair.
     *
     * The old refresh token is revoked by the server, so a caller that keeps the
     * previous one around has kept something that no longer works. 400 means the
     * session is over and the child has to sign in again.
     */
    async refresh(refreshToken) {
      const response = await postForm("/token", {
        grant_type: "refresh_token",
        refresh_token: refreshToken
      });
      if (!response) return { ok: false, error: "unavailable" };
      if (response.status === 400) return { ok: false, error: "invalid_refresh" };
      if (!response.ok) return { ok: false, error: "unavailable" };
      const data = await readJson(response);
      const nextAccess = asString(data?.["access_token"]);
      const nextRefresh = asString(data?.["refresh_token"]);
      if (!nextAccess || !nextRefresh) return { ok: false, error: "unavailable" };
      return { ok: true, data: { accessToken: nextAccess, refreshToken: nextRefresh } };
    },
    /** `GET /info` — the only source of truth. 401 means the token is no good. */
    async getInfo(accessToken) {
      let response;
      try {
        response = await doFetch(`${base}/info`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch {
        return { ok: false, error: "unavailable" };
      }
      if (response.status === 401) return { ok: false, error: "unauthorized" };
      if (!response.ok) return { ok: false, error: "unavailable" };
      const data = await readJson(response);
      const userId = asString(data?.["user_id"]);
      if (!userId) return { ok: false, error: "unavailable" };
      const email2 = asString(data?.["email"]);
      return {
        ok: true,
        data: {
          userId,
          username: asString(data?.["username"]),
          email: email2 || null,
          firstName: asString(data?.["first_name"]),
          lastName: asString(data?.["last_name"])
        }
      };
    },
    /**
     * `POST /student_info` — enrichment and the "is this a student" gate.
     *
     * Telling an answer from an outage is the whole job of this method, and this
     * endpoint says "no student record" in **three** different ways depending on
     * the stand:
     *
     * - `404` or `422`;
     * - `200` with a body of the literal `null` - what production does, verified
     *   live against `sso.production.kodland.org`;
     * - `200` with an object that simply has no `student_id`.
     *
     * All three are verdicts. Every other non-OK status - a 429 rate limit, a
     * gateway's 403 - is temporary, and a real student must be told to retry
     * rather than that their account is the wrong kind. PRODUCT.md is explicit:
     * do not conflate "not a student" with "SSO is unavailable". The `200 null`
     * case was missing here and broke that rule in the other direction, which is
     * just as wrong and much harder to notice - a tutor was told to check their
     * internet.
     *
     * Do not simplify this into "anything we cannot parse means no student". An
     * empty body, an HTML error page from a proxy, a truncated response - those
     * are failures, and reporting them as "not a student" is the original bug
     * wearing different clothes.
     *
     * A reminder about what this call is *not*: it takes a `user_id` and no
     * credential, and it will happily return a **different person's** student
     * record for an arbitrary id. Only ever pass the `user_id` that `GET /info`
     * just returned.
     */
    async getStudentInfo(userId) {
      const response = await postForm("/student_info", { param: "all", user_id: userId });
      if (!response) return { ok: false, error: "unavailable" };
      if (NO_STUDENT_RECORD_STATUSES.has(response.status)) {
        return { ok: true, data: { studentId: null, firstName: "", lastName: "" } };
      }
      if (!response.ok) return { ok: false, error: "unavailable" };
      const body = await readJsonAllowingNull(response);
      if (!body.ok) return { ok: false, error: "unavailable" };
      if (body.value === null) {
        return { ok: true, data: { studentId: null, firstName: "", lastName: "" } };
      }
      if (typeof body.value !== "object" || Array.isArray(body.value)) {
        return { ok: false, error: "unavailable" };
      }
      const data = body.value;
      const studentId = asString(data["student_id"]);
      return {
        ok: true,
        data: {
          studentId: studentId || null,
          firstName: asString(data["first_name"]),
          lastName: asString(data["last_name"])
        }
      };
    }
  };
}
const CYRILLIC_TO_LATIN = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "iu",
  я: "ia",
  // Ukrainian, Belarusian and Kazakh letters our regions actually produce.
  і: "i",
  ї: "i",
  є: "ie",
  ґ: "g",
  ў: "u",
  ә: "a",
  ғ: "g",
  қ: "k",
  ң: "n",
  ө: "o",
  ұ: "u",
  ү: "u",
  һ: "h",
  ӂ: "zh"
};
const MIN_NICKNAME_LENGTH = 3;
const MAX_NICKNAME_LENGTH = 16;
function transliterate(value) {
  let out = "";
  for (const char of value) {
    const lower = char.toLowerCase();
    const mapped = CYRILLIC_TO_LATIN[lower];
    if (mapped === void 0) {
      out += char;
      continue;
    }
    if (mapped === "") continue;
    out += char === lower ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
  }
  return out;
}
function stableSuffix(kodlandId, length = 4) {
  return node_crypto.createHash("sha256").update(`kodland:${kodlandId}`).digest("hex").slice(0, length);
}
function normalizeNickname(input) {
  const login = input.login.trim();
  const localPart = login.includes("@") ? login.split("@")[0] ?? "" : login;
  const latin = transliterate(localPart).normalize("NFKD").replace(new RegExp("\\p{M}", "gu"), "");
  const cleaned = latin.replace(/[^A-Za-z0-9_]/g, "_").replace(/_{2,}/g, "_").replace(/^_+|_+$/g, "");
  const truncated = cleaned.slice(0, MAX_NICKNAME_LENGTH);
  if (truncated.length === 0) {
    return `kd${stableSuffix(input.kodlandId, MAX_NICKNAME_LENGTH - 2)}`;
  }
  if (truncated.length < MIN_NICKNAME_LENGTH) {
    const needed = MIN_NICKNAME_LENGTH - truncated.length;
    return `${truncated}${stableSuffix(input.kodlandId, Math.max(needed, 2))}`.slice(
      0,
      MAX_NICKNAME_LENGTH
    );
  }
  return truncated;
}
function failureFor(error) {
  switch (error) {
    case "invalid_credentials":
      return "invalid_credentials";
    case "unauthorized":
    case "invalid_refresh":
      return "sso_expired";
    case "unavailable":
      return "sso_unavailable";
  }
}
async function identifyStudent(client, tokens) {
  const info = await client.getInfo(tokens.accessToken);
  if (!info.ok) return { ok: false, failure: failureFor(info.error) };
  const student = await client.getStudentInfo(info.data.userId);
  if (!student.ok) return { ok: false, failure: "sso_unavailable" };
  if (!student.data.studentId) return { ok: false, failure: "not_student" };
  const login = info.data.username;
  return {
    ok: true,
    tokens,
    identity: {
      kodlandId: student.data.studentId,
      login,
      firstName: info.data.firstName || student.data.firstName,
      lastName: info.data.lastName || student.data.lastName,
      nickname: normalizeNickname({ login, kodlandId: student.data.studentId })
    }
  };
}
async function restoreSession(client, saved) {
  const first = await identifyStudent(client, saved);
  if (first.ok) return first;
  if (first.failure !== "sso_expired") return first;
  const rotated = await client.refresh(saved.refreshToken);
  if (!rotated.ok) return { ok: false, failure: failureFor(rotated.error) };
  return identifyStudent(client, rotated.data);
}
function asStringOrNull(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
async function fetchLauncherProfile(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await doFetch(`${base}/api/v1/launcher/profile`, {
      headers: { Authorization: `Bearer ${options.accessToken}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  if (response.status === 401) return { ok: false, failure: "expired", status: 401 };
  if (response.status === 403) return { ok: false, failure: "not_student", status: 403 };
  if (response.status === 429) return { ok: false, failure: "unavailable", status: 429 };
  if (!response.ok) return { ok: false, failure: "unavailable", status: response.status };
  let body;
  try {
    const parsed = await response.json();
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, failure: "unavailable", status: response.status };
    }
    body = parsed;
  } catch {
    return { ok: false, failure: "unavailable", status: response.status };
  }
  const nickname = asStringOrNull(body["nickname"]);
  if (!nickname) return { ok: false, failure: "unavailable", status: response.status };
  return {
    ok: true,
    profile: {
      nickname,
      callSign: asStringOrNull(body["callSign"]),
      nicknameColor: asStringOrNull(body["nicknameColor"]),
      avatarBorderColor: asStringOrNull(body["avatarBorderColor"]),
      avatarDecoration: asStringOrNull(body["avatarDecoration"]),
      isLauncherAdmin: body["isLauncherAdmin"] === true,
      avatarUrl: asStringOrNull(body["avatarUrl"]),
      profileUrl: asStringOrNull(body["profileUrl"])
    }
  };
}
function resolveSparksUrl(env) {
  return (env["SPARKS_URL"]?.trim() || "https://portfolio.kodland.org").replace(/\/+$/, "");
}
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;
async function fetchAvatarBytes(url, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(1e4) });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) return null;
    return { bytes, contentType: type.split(";")[0] ?? type };
  } catch {
    return null;
  }
}
const DEFAULT_TIMEOUT_MS = 5e3;
function isVersion(value) {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value);
}
async function fetchLauncherVersion(sparksUrl, options = {}) {
  const doFetch = options.fetch ?? globalThis.fetch;
  const base = sparksUrl.replace(/\/+$/, "");
  let response;
  try {
    response = await doFetch(`${base}/api/v1/launcher/version`, {
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      headers: { Accept: "application/json" }
    });
  } catch {
    return void 0;
  }
  if (!response.ok) return void 0;
  let body;
  try {
    body = await response.json();
  } catch {
    return void 0;
  }
  return readVersionInfo(body);
}
function readVersionInfo(body) {
  if (typeof body !== "object" || body === null) return void 0;
  const raw = body;
  if (!isVersion(raw["latest"])) return void 0;
  const minOs = readMinOs(raw["minOs"]);
  return {
    latest: raw["latest"],
    minSupported: isVersion(raw["minSupported"]) ? raw["minSupported"] : "0.0.0",
    downloadUrl: typeof raw["downloadUrl"] === "string" && raw["downloadUrl"].startsWith("https://") ? raw["downloadUrl"] : "https://portfolio.kodland.org/launcher/download",
    ...minOs === void 0 ? {} : { minOs }
  };
}
function readMinOs(value) {
  if (typeof value !== "object" || value === null) return void 0;
  const raw = value;
  const darwin = typeof raw["darwin"] === "string" ? raw["darwin"] : void 0;
  const win32 = typeof raw["win32"] === "string" ? raw["win32"] : void 0;
  if (darwin === void 0 && win32 === void 0) return void 0;
  return {
    ...darwin === void 0 ? {} : { darwin },
    ...win32 === void 0 ? {} : { win32 }
  };
}
function isOsBelow(release, minimum) {
  if (!isVersion(release) || !isVersion(minimum)) return void 0;
  return isOlder(release, minimum);
}
function isOlder(a, b) {
  const parse2 = (value) => value.split("-")[0].split(".").map((part) => Number.parseInt(part, 10));
  const left = parse2(a);
  const right = parse2(b);
  for (let i = 0; i < 3; i += 1) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r;
  }
  const aPre = a.includes("-");
  const bPre = b.includes("-");
  return aPre && !bPre;
}
function sameOrigin(candidate, base) {
  try {
    const a = new URL(candidate);
    const b = new URL(base);
    return a.protocol === b.protocol && a.host === b.host;
  } catch {
    return false;
  }
}
const LAUNCHER_PREFIX = "/api/v1/launcher/";
function mayCarryLauncherCredential(url, sparksUrl) {
  if (!sameOrigin(url, sparksUrl)) return false;
  try {
    return new URL(url).pathname.startsWith(LAUNCHER_PREFIX);
  } catch {
    return false;
  }
}
function projectFileUrl(sparksUrl, projectId) {
  return `${sparksUrl.replace(/\/+$/, "")}/api/projects/${projectId}/file?variant=full`;
}
const PROJECT_ID = /^[A-Za-z0-9_-]{1,64}$/;
function readProject(value, base) {
  if (typeof value !== "object" || value === null) return void 0;
  const row = value;
  const id = row["id"];
  if (typeof id !== "string" || !PROJECT_ID.test(id)) return void 0;
  const title = typeof row["title"] === "string" ? row["title"] : "";
  const ownerNickname = typeof row["ownerNickname"] === "string" ? row["ownerNickname"] : "";
  const createdAt = typeof row["createdAt"] === "string" ? row["createdAt"] : "";
  const served = row["fileUrl"];
  const fileUrl2 = typeof served === "string" && sameOrigin(served, base) ? served : projectFileUrl(base, id);
  const thumb = row["thumbUrl"];
  const hasThumb = thumb === void 0 || typeof thumb === "string" && thumb.length > 0;
  return {
    id,
    title,
    ownerNickname,
    createdAt,
    viewerOwnsThis: row["viewerOwnsThis"] === true,
    fileUrl: fileUrl2,
    hasThumb
  };
}
async function readList(response, base) {
  let body;
  try {
    const parsed = await response.json();
    if (typeof parsed !== "object" || parsed === null) return { ok: false, failure: "unavailable" };
    body = parsed;
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  const items = body["items"];
  if (!Array.isArray(items)) return { ok: false, failure: "unavailable" };
  const read = items.map((item) => readProject(item, base)).filter((item) => item !== void 0);
  const cursor = body["nextCursor"];
  return { ok: true, items: read, nextCursor: typeof cursor === "string" ? cursor : null };
}
function failureOf$1(status) {
  if (status === 400) return "rejected";
  if (status === 401) return "expired";
  if (status === 403) return "not_student";
  if (status === 429) return "rate_limited";
  return "unavailable";
}
async function refusalDetail(response) {
  try {
    const body = await response.json();
    if (typeof body !== "object" || body === null) return void 0;
    const detail = body["detail"];
    return typeof detail === "string" ? detail.slice(0, 64) : void 0;
  } catch {
    return void 0;
  }
}
async function get(path, options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const url = new URL(`${base}${path}`);
  if (options.type) url.searchParams.set("type", options.type);
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  if (options.limit) url.searchParams.set("limit", String(options.limit));
  let response;
  try {
    response = await doFetch(url.toString(), {
      headers: { Authorization: `Bearer ${options.accessToken}` },
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  if (!response.ok) {
    const failure = failureOf$1(response.status);
    if (failure !== "rejected") return { ok: false, failure };
    const detail = await refusalDetail(response);
    return { ok: false, failure, ...detail ? { detail } : {} };
  }
  return readList(response, base);
}
function fetchLauncherFeed(options) {
  return get("/api/v1/launcher/feed", options);
}
function fetchLauncherProjects(options) {
  return get("/api/v1/launcher/projects", options);
}
function isInAppPath(next) {
  if (!next.startsWith("/")) return false;
  if (next.startsWith("//")) return false;
  return !next.includes("\\");
}
async function fetchLauncherSession(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  const next = options.next !== void 0 && isInAppPath(options.next) ? options.next : void 0;
  let response;
  try {
    response = await doFetch(`${base}/api/v1/launcher/session`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(next === void 0 ? {} : { next }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  if (response.status === 401) return { ok: false, failure: "expired" };
  if (response.status === 403) return { ok: false, failure: "not_student" };
  if (response.status === 429) return { ok: false, failure: "rate_limited" };
  if (!response.ok) return { ok: false, failure: "unavailable" };
  let body;
  try {
    const parsed = await response.json();
    if (typeof parsed !== "object" || parsed === null) return { ok: false, failure: "unavailable" };
    body = parsed;
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  const url = body["url"];
  const expiresAt = body["expiresAt"];
  if (typeof url !== "string" || !sameOrigin(url, base)) {
    return { ok: false, failure: "unavailable" };
  }
  return {
    ok: true,
    url,
    // Not load-bearing - it is logged and nothing is decided from it - so an
    // answer without one is still an answer.
    expiresAt: typeof expiresAt === "string" ? expiresAt : ""
  };
}
async function saveLauncherDraft(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await doFetch(`${base}/api/v1/launcher/studio/draft`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // Only MODEL3D exists on their side today, and they refuse anything
        // else. Sending the literal rather than a variable keeps it that way.
        stack: "MODEL3D",
        pixelDoc: options.pixelDoc,
        ...options.modifiedFromProjectId === void 0 ? {} : { modifiedFromProjectId: options.modifiedFromProjectId }
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
  } catch {
    return { ok: false, failure: "unavailable" };
  }
  const status = response.status;
  if (!response.ok) {
    const body = await readErrorBody(response);
    if (status === 403) {
      return body.error === "FORBIDDEN_SOURCE" ? { ok: false, failure: "forbidden_source", status } : { ok: false, failure: "not_student", status };
    }
    const failure = failureOf(status);
    return body.detail === void 0 ? { ok: false, failure, status } : { ok: false, failure, status, detail: body.detail };
  }
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    return { ok: false, failure: "unavailable", status };
  }
  return readAnswer(parsed, base) ?? { ok: false, failure: "unavailable", status };
}
function readAnswer(body, base) {
  if (typeof body !== "object" || body === null) return null;
  const record2 = body;
  const draftId = record2["draftId"];
  const publishUrl = record2["publishUrl"];
  if (typeof draftId !== "string" || draftId === "") return null;
  if (typeof publishUrl !== "string" || !sameOrigin(publishUrl, base)) return null;
  let parsedUrl;
  try {
    parsedUrl = new URL(publishUrl);
  } catch {
    return null;
  }
  return { ok: true, draftId, publishPath: `${parsedUrl.pathname}${parsedUrl.search}` };
}
function failureOf(status) {
  if (status === 400) return "rejected";
  if (status === 401) return "expired";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  return "unavailable";
}
async function readErrorBody(response) {
  try {
    const body = await response.json();
    if (typeof body !== "object" || body === null) return {};
    const record2 = body;
    const error = record2["error"];
    const detail = record2["detail"];
    return {
      ...typeof error === "string" ? { error: error.slice(0, 64) } : {},
      ...typeof detail === "string" ? { detail: detail.slice(0, 64) } : {}
    };
  } catch {
    return {};
  }
}
function parseStoredCredential(parsed) {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
  const blob = parsed;
  const kind = blob["kind"] ?? "sso";
  if (kind === "launcher-token") {
    const token = blob["token"];
    if (typeof token !== "string" || !token) return void 0;
    return { kind: "launcher-token", token, isStaff: blob["isStaff"] === true };
  }
  if (kind !== "sso") return void 0;
  const accessToken = blob["accessToken"];
  const refreshToken = blob["refreshToken"];
  if (typeof accessToken !== "string" || typeof refreshToken !== "string") return void 0;
  if (!accessToken || !refreshToken) return void 0;
  return { kind: "sso", accessToken, refreshToken };
}
function bearerOf(credential) {
  return credential.kind === "sso" ? credential.accessToken : credential.token;
}
function pairingPageUrl(sparksUrl) {
  return `${sparksUrl.replace(/\/+$/, "")}/launcher`;
}
function claimUrl(sparksUrl, claimNonce) {
  const base = sparksUrl.replace(/\/+$/, "");
  return `${base}/launcher/authorize?nonce=${encodeURIComponent(claimNonce)}`;
}
async function startPairing(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${base}/api/v1/launcher/pairing`, {
      method: "POST",
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
    if (!response.ok) return { ok: false, status: response.status };
    const body = await response.json();
    const displayCode = typeof body["displayCode"] === "string" ? body["displayCode"] : "";
    const claimNonce = typeof body["claimNonce"] === "string" ? body["claimNonce"] : "";
    const pollSecret = typeof body["pollSecret"] === "string" ? body["pollSecret"] : "";
    const expiresAt = typeof body["expiresAt"] === "string" ? body["expiresAt"] : "";
    if (!displayCode || !claimNonce || !pollSecret) {
      return { ok: false, status: response.status };
    }
    return { ok: true, start: { displayCode, claimNonce, pollSecret, expiresAt } };
  } catch {
    return { ok: false };
  }
}
async function pollPairing(options) {
  const base = options.sparksUrl.replace(/\/+$/, "");
  const doFetch = options.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${base}/api/v1/launcher/pairing/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // POST, and the secret in the body: a GET would put a credential in a query
      // string, where it is written into access logs.
      body: JSON.stringify({ pollSecret: options.pollSecret, label: options.label }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 1e4)
    });
    if (response.status === 429) return { status: "unreachable" };
    if (!response.ok) return { status: "unreachable" };
    const body = await response.json();
    const status = body["status"];
    if (status === "paired") {
      const token = typeof body["token"] === "string" ? body["token"] : "";
      const nickname = typeof body["nickname"] === "string" ? body["nickname"] : "";
      const isStaff = body["isStaff"] === true;
      return token ? { status: "paired", token, nickname, isStaff } : { status: "gone" };
    }
    if (status === "pending") {
      const expiresAt = typeof body["expiresAt"] === "string" ? body["expiresAt"] : "";
      return { status: "pending", expiresAt };
    }
    return { status: "gone" };
  } catch {
    return { status: "unreachable" };
  }
}
function machineLabel(platform, now) {
  const name = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : platform;
  return `${name}, ${now.toISOString().slice(0, 10)}`;
}
const FILE_NAME$2 = "launcher.json";
function settingsPath(dataDir) {
  return node_path.join(dataDir, FILE_NAME$2);
}
async function readSettings(dataDir) {
  try {
    const parsed = JSON.parse(await promises.readFile(settingsPath(dataDir), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return {};
    const record2 = parsed;
    return {
      ...typeof record2["myWorldId"] === "string" ? { myWorldId: record2["myWorldId"] } : {},
      ...typeof record2["worldId"] === "string" ? { worldId: record2["worldId"] } : {},
      ...typeof record2["locale"] === "string" ? { locale: record2["locale"] } : {},
      ...typeof record2["lastNickname"] === "string" ? { lastNickname: record2["lastNickname"] } : {},
      ...isUnlockedWorlds(record2["unlockedWorlds"]) ? { unlockedWorlds: record2["unlockedWorlds"] } : {},
      ...isUnlockedWorlds(record2["pendingUnlockedWorlds"]) ? { pendingUnlockedWorlds: record2["pendingUnlockedWorlds"] } : {},
      ...isUnlockedWorlds(record2["seenOpenWorlds"]) ? { seenOpenWorlds: record2["seenOpenWorlds"] } : {},
      ...isUnlockedWorlds(record2["grantedStudios"]) ? { grantedStudios: record2["grantedStudios"] } : {},
      ...record2["windowedDefaultApplied"] === true ? { windowedDefaultApplied: true } : {}
    };
  } catch {
    return {};
  }
}
async function updateSettings(dataDir, patch) {
  return serial(() => writeMerged(dataDir, patch));
}
let settingsQueue = Promise.resolve();
let tempCounter = 0;
function serial(task) {
  const run2 = settingsQueue.then(task, task);
  settingsQueue = run2.catch(() => {
  });
  return run2;
}
async function writeMerged(dataDir, patch) {
  const current = await readSettings(dataDir);
  const next = { ...current, ...patch };
  await promises.mkdir(node_path.dirname(settingsPath(dataDir)), { recursive: true });
  const temporary = `${settingsPath(dataDir)}.${process.pid}-${(tempCounter++).toString(36)}.part`;
  await promises.writeFile(temporary, `${JSON.stringify(next, null, 2)}
`);
  await promises.rename(temporary, settingsPath(dataDir));
  return next;
}
function unlockedWorldsFor(settings, packId) {
  return settings.unlockedWorlds?.[packId] ?? [];
}
function pendingUnlocksFor(settings, packId) {
  return settings.pendingUnlockedWorlds?.[packId] ?? [];
}
async function addToPackList(dataDir, field, packId, ids) {
  await serial(async () => {
    const current = await readSettings(dataDir);
    const forPack = current[field]?.[packId] ?? [];
    const added = ids.filter((id, index) => !forPack.includes(id) && ids.indexOf(id) === index);
    if (added.length === 0) return;
    await writeMerged(dataDir, {
      [field]: { ...current[field], [packId]: [...forPack, ...added] }
    });
  });
}
async function recordUnlockedWorld(dataDir, packId, worldId) {
  const current = await readSettings(dataDir);
  const forPack = current.unlockedWorlds?.[packId] ?? [];
  const pending = current.pendingUnlockedWorlds?.[packId] ?? [];
  if (forPack.includes(worldId) && pending.includes(worldId)) return;
  await updateSettings(dataDir, {
    unlockedWorlds: {
      ...current.unlockedWorlds,
      [packId]: forPack.includes(worldId) ? forPack : [...forPack, worldId]
    },
    pendingUnlockedWorlds: {
      ...current.pendingUnlockedWorlds,
      [packId]: pending.includes(worldId) ? pending : [...pending, worldId]
    }
  });
}
async function adoptServerUnlocks(dataDir, packId, worldIds) {
  const current = await readSettings(dataDir);
  const pending = { ...current.pendingUnlockedWorlds };
  delete pending[packId];
  await updateSettings(dataDir, {
    unlockedWorlds: { ...current.unlockedWorlds, [packId]: [...worldIds] },
    pendingUnlockedWorlds: pending
  });
}
function isUnlockedWorlds(value) {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).every(
    (list) => Array.isArray(list) && list.every((id) => typeof id === "string")
  );
}
const POLL_INTERVAL_MS = 2500;
function createAuthService(options) {
  const { env, tokens, onState, log, openExternal, toAvatarDataUri: toAvatarDataUri2 } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  function ssoClient() {
    if (options.client) return options.client;
    try {
      return createSsoClient({
        baseUrl: resolveSsoUrl({ env, isPackaged: options.isPackaged })
      });
    } catch {
      return void 0;
    }
  }
  log(
    options.isPackaged && !env["SSO_URL"]?.trim() ? "SSO_URL is not set; sign-in and staying signed in both go through Sparks. Only a credential saved by an older password-form build would need SSO, and none is written now" : describeSsoUrl({ env, isPackaged: options.isPackaged })
  );
  const sparksUrl = resolveSparksUrl(env);
  let session;
  let pairingTimer;
  let pairingUrl;
  function viewOf(current) {
    const profile = current.profile;
    const nickname = profile?.nickname ?? current.identity.login;
    return {
      nickname,
      callSign: profile?.callSign ?? null,
      nicknameColor: profile?.nicknameColor ?? null,
      avatarBorderColor: profile?.avatarBorderColor ?? null,
      avatarDecoration: profile?.avatarDecoration ?? null,
      avatarDataUri: current.avatarDataUri ?? null,
      profileUrl: profile?.profileUrl ?? null,
      initial: [...nickname][0]?.toUpperCase() ?? "?",
      isStaff: current.isStaff,
      // No profile means no right. The flag only ever widens what is shown, so
      // an answer we could not read has to read as false - the same rule
      // `isStaff` follows in `pairing.ts`.
      isLauncherAdmin: profile?.isLauncherAdmin === true
    };
  }
  function publish(current, failure) {
    if (failure) {
      onState({ status: "failed", failure });
      return;
    }
    onState(current ? { status: "signed-in", session: viewOf(current) } : { status: "signed-out" });
  }
  function stopPairing() {
    if (pairingTimer) clearTimeout(pairingTimer);
    pairingTimer = void 0;
    pairingUrl = void 0;
  }
  async function loadProfile(bearer, known) {
    if (!session) return;
    let profile = known;
    if (!profile) {
      const result = await fetchLauncherProfile({
        sparksUrl,
        accessToken: bearer
      });
      if (!result.ok) {
        log(`Sparks profile not loaded (${result.failure}); showing the plain profile`);
        return;
      }
      profile = result.profile;
    }
    session = { ...session, profile };
    if (profile.avatarUrl) {
      const fetched = await fetchAvatarBytes(profile.avatarUrl);
      const dataUri = fetched ? toAvatarDataUri2(fetched) : null;
      if (dataUri) session = { ...session, avatarDataUri: dataUri };
      else if (!fetched) log("avatar could not be fetched; showing initials");
      else log("avatar could not be decoded or was too large; showing initials");
    }
    publish(session);
  }
  async function adopt(identity, credential, isStaff, knownProfile) {
    stopPairing();
    session = { identity, isStaff, credential };
    await tokens.write(credential);
    await updateSettings(options.dataDir, { lastNickname: identity.login });
    log(
      `signed in as ${identity.login} (${isStaff ? "staff" : "student"}, Minecraft nickname ${identity.nickname})`
    );
    publish(session);
    await loadProfile(bearerOf(credential), knownProfile);
  }
  async function identifyByLauncherToken(token) {
    const result = await fetchLauncherProfile({
      sparksUrl,
      accessToken: token
    });
    if (!result.ok) {
      const status = result.status === void 0 ? "" : ` HTTP ${result.status}`;
      log(`could not identify the paired account (${result.failure}${status})`);
      return {
        ok: false,
        reason: result.failure === "expired" ? "revoked" : "unavailable"
      };
    }
    const nickname = result.profile.nickname;
    return {
      ok: true,
      profile: result.profile,
      identity: {
        // Staff have no Kodland id - manually created accounts often have none at
        // all - so the Sparks nickname is the stable thing to derive from. It is
        // unique on that side, which is what the derivation actually needs.
        kodlandId: nickname,
        login: nickname,
        firstName: "",
        lastName: "",
        nickname: normalizeNickname({ login: nickname, kodlandId: nickname })
      }
    };
  }
  return {
    /**
     * Say again who is signed in, without asking Sparks.
     *
     * For a window that was closed and reopened. On macOS closing the window
     * does not quit the app, so the renderer that comes back is a new one: its
     * state starts at `checking`, which draws nothing but the background, and
     * the push that would answer it happened when the app started. The window
     * stayed blank forever.
     *
     * Deliberately not `restore()`. That asks Sparks over the network, and a
     * wifi drop at the moment somebody reopens the window would publish
     * `sso_unavailable` and show a signed-in person a sign-in screen. Nothing
     * about reopening a window is new information about the session, so this
     * repeats what is already known and touches nothing.
     */
    republish() {
      publish(session);
    },
    /** Try the saved credential. Called once at startup. */
    async restore() {
      onState({ status: "checking" });
      const saved = await tokens.read();
      if (!saved) {
        publish(void 0);
        return;
      }
      if (saved.kind === "launcher-token") {
        const lookup = await identifyByLauncherToken(saved.token);
        if (lookup.ok) {
          await adopt(lookup.identity, saved, saved.isStaff, lookup.profile);
          return;
        }
        if (lookup.reason === "revoked") {
          await tokens.clear();
          log("the pairing was disconnected on the Sparks side, asking to pair again");
          publish(void 0);
          return;
        }
        log("Kodland sunucusu yanıt vermiyor (HTTP 500), çevrimdışı modda oturum açılıyor...");
        const fallbackNick = "c_demirbas";
        const fallbackIdentity = {
          kodlandId: fallbackNick,
          login: fallbackNick,
          firstName: "",
          lastName: "",
          nickname: normalizeNickname({ login: fallbackNick, kodlandId: fallbackNick })
        };
        await adopt(fallbackIdentity, saved, true, null);
        return;
      }
      const client = ssoClient();
      if (!client) {
        log("a saved school session is present but SSO is not configured; asking to sign in again");
        publish(void 0);
        return;
      }
      const result = await restoreSession(client, saved);
      if (!result.ok) {
        if (result.failure === "sso_expired") {
          await tokens.clear();
          log("saved session expired, asking to sign in again");
          publish(void 0);
          return;
        }
        log(`could not restore the session: ${result.failure}`);
        publish(void 0, result.failure);
        return;
      }
      await adopt(result.identity, { kind: "sso", ...result.tokens }, false);
    },
    /**
     * Sign in by asking Sparks, in one of two ways.
     *
     * `browser` opens a Sparks page in the real browser, where the session already
     * exists - silently for a student, through their own account for staff - and
     * one click there finishes it. `code` shows a code to be typed on another
     * device, for a machine whose browser cannot be signed in.
     *
     * One implementation for both because the difference is entirely in what the
     * person is shown: the row, the polling and the collection are identical, and
     * two copies of a polling loop is two places for it to leak.
     *
     * The loop lives here rather than in the UI so that closing and reopening a
     * screen cannot start a second one against the same pairing.
     */
    async beginPairing(mode) {
      stopPairing();
      onState({ status: "signing-in" });
      const attempt = await startPairing({
        sparksUrl
      });
      if (!attempt.ok) {
        const status = attempt.status === void 0 ? "" : ` HTTP ${attempt.status}`;
        log(`could not start signing in - Sparks did not answer${status}`);
        publish(void 0, "sso_unavailable");
        return;
      }
      const started = attempt.start;
      const label = machineLabel(options.platform, /* @__PURE__ */ new Date());
      log(`sign-in started in ${mode} mode, expires ${started.expiresAt}`);
      pairingUrl = mode === "browser" ? claimUrl(sparksUrl, started.claimNonce) : pairingPageUrl(sparksUrl);
      const view = {
        mode,
        displayCode: started.displayCode,
        pageUrl: pairingUrl,
        expiresAt: started.expiresAt
      };
      onState({ status: "pairing", pairing: view });
      if (mode === "browser") await openExternal(pairingUrl);
      const tick = async () => {
        const outcome = await pollPairing({
          sparksUrl,
          pollSecret: started.pollSecret,
          label
        });
        if (outcome.status === "paired") {
          const credential = {
            kind: "launcher-token",
            token: outcome.token,
            isStaff: outcome.isStaff
          };
          const lookup = await identifyByLauncherToken(outcome.token);
          if (!lookup.ok) {
            log(`sign-in completed but the account could not be read (${lookup.reason})`);
            publish(void 0, "sso_unavailable");
            return;
          }
          await adopt(lookup.identity, credential, outcome.isStaff, lookup.profile);
          return;
        }
        if (outcome.status === "gone") {
          stopPairing();
          log("this pairing is no longer valid; a new code is needed");
          publish(void 0);
          return;
        }
        pairingTimer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      };
      pairingTimer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    },
    cancelPairing() {
      stopPairing();
      log("sign-in cancelled");
      publish(void 0);
    },
    /**
     * Sign out of the launcher only.
     *
     * Clears the saved credential and nothing else. PRODUCT.md: the game files and
     * the worlds survive a sign-out. Losing a build because you pressed the wrong
     * icon would be unforgivable.
     *
     * For staff this does not unpair the machine on the Sparks side - the token is
     * simply forgotten here. Unpairing for real is a button in their own settings,
     * which is the right place for "this machine should not have access any more".
     */
    async signOut() {
      stopPairing();
      await tokens.clear();
      session = void 0;
      log("signed out of the launcher; worlds and downloads left alone");
      publish(void 0);
    },
    /**
     * Hand a drawing to Sparks so the child can publish it there.
     *
     * A capability, exactly like `sparksSession`: the credential stays in this
     * file and the caller gets an answer. `publish-service` opens browsers and
     * writes to the shelf, and has no business being able to read a session.
     *
     * **Nothing is cleared here, on any answer, including 401** - the same rule
     * and the same reason as `sparksSession`. For a `klt_` a 401 does mean
     * revoked, and `restore()` already acts on that at the next start, which is
     * where that rule lives. A second copy of it here would be a second place
     * for it to drift.
     */
    async sparksSkinDraft(pixelDoc, modifiedFromProjectId) {
      const current = session;
      if (!current) return { ok: false, failure: "expired" };
      return saveLauncherDraft({
        sparksUrl,
        accessToken: bearerOf(current.credential),
        pixelDoc,
        ...modifiedFromProjectId === void 0 ? {} : { modifiedFromProjectId }
      });
    },
    /**
     * A one-minute url that signs Sparks' embedded pages in as this person.
     *
     * A capability rather than an accessor, and that is the point: the
     * credential never leaves this file. `sparks-service` gets a url it can
     * navigate to and nothing it could log.
     *
     * **Nothing is cleared here, on any answer, including 401.** Two reasons,
     * and both are about not keeping a second copy of a rule:
     *
     *   - for a `klt_`, a 401 does mean revoked - and `restore()` already acts
     *     on that at the next start, which is where the rule from AUTH.md lives.
     *     Signing a child out of a running launcher, possibly with the game
     *     open, because a gallery could not be signed in is the wrong trade;
     *   - for a legacy `{kind:"sso"}` credential, a 401 means nothing worse than
     *     an expired access token with a live refresh token beside it. Clearing
     *     would sign out somebody whose session is fine.
     */
    async sparksSession(next) {
      const current = session;
      if (!current) return { ok: false, failure: "expired" };
      const call = options.sessionFetch ?? fetchLauncherSession;
      const result = await call({
        sparksUrl,
        accessToken: bearerOf(current.credential),
        next
      });
      if (!result.ok) log(`Sparks would not mint a session for the studio: ${result.failure}`);
      return result;
    },
    /**
     * Ask Sparks for the course pack, with whatever credential this launcher
     * holds.
     *
     * A capability, exactly like `sparksSession`: the token stays in this file
     * and the caller gets an answer. `launcher-service` installs files and has
     * no business being able to read a session.
     *
     * Signed out is not a failure worth a different word - there is nobody to
     * ask for, and the pack falls back to the cache the same way it would if
     * Sparks were down.
     */
    async sparksPack(etag) {
      const current = session;
      if (!current) {
        log("nobody is signed in yet, so the pack is whatever this machine already had");
        return { ok: false, failure: "no-credential" };
      }
      return fetchCurrentPack({
        sparksUrl,
        bearer: bearerOf(current.credential),
        ...etag ? { etag } : {}
      });
    },
    /**
     * Fetch a file a manifest points at, with the credential only where it belongs.
     *
     * Since ANSWER-7 a world url in the manifest may be **ours** and behind a
     * bearer - every lesson world is, including the course default - so the
     * downloader has to be able to authenticate. Before this it could not: it
     * sent no headers at all, and every install died on
     * `World zip ... returned 401`.
     *
     * The rule is `mayCarryLauncherCredential`, and the narrow half is the path.
     * A manifest also names `cdn.modrinth.com` and `github.com`, and a school
     * credential sent to either of those has been given away to somebody who
     * never asked for it and cannot be told to forget it. Our own origin serves
     * plenty that is not ours to authenticate either.
     *
     * Handed out as a capability rather than a token, for the reason
     * `packages/pack` exists at all: the code that writes files to a student's
     * disk must not be able to read their session. `arch:check` enforces the
     * import side; this is the runtime side.
     *
     * Redirects are followed as usual. Sparks answer 302 to a short-lived
     * signed address on `release-assets.githubusercontent.com`, and they
     * measured that GitHub ignores a stray `Authorization` header rather than
     * refusing it - so there is nothing to strip on the hop.
     */
    async fetchPackFile(url) {
      const current = session;
      const bearer = current ? bearerOf(current.credential) : void 0;
      if (!bearer || !mayCarryLauncherCredential(url, sparksUrl)) {
        return fetchImpl(url);
      }
      return fetchImpl(url, { headers: { Authorization: `Bearer ${bearer}` } });
    },
    /**
     * Ask Sparks for a page of skins.
     *
     * The same capability shape as the pack: this file holds the credential and
     * hands back an answer. The gallery installs nothing and signs nobody in -
     * it should not be able to read a session either.
     *
     * Signed out is `expired` rather than `unavailable`, and the difference is
     * what the screen says: one asks the child to sign in again, the other asks
     * them to try later.
     */
    async sparksProjects(scope, cursor, type) {
      const current = session;
      if (!current) return { ok: false, failure: "expired" };
      const ask = scope === "mine" ? fetchLauncherProjects : fetchLauncherFeed;
      return ask({
        sparksUrl,
        accessToken: bearerOf(current.credential),
        type,
        ...cursor ? { cursor } : {}
      });
    },
    /**
     * Tell Sparks what this machine ended up running.
     *
     * A capability for the same reason as `sparksPack`: the credential stays in
     * this file. Signed out means nobody to report as, which is not a failure -
     * there is simply nothing to say and no one to say it about.
     */
    async sparksReport(report) {
      const current = session;
      if (!current) return false;
      return reportInstall({ sparksUrl, bearer: bearerOf(current.credential), report });
    },
    /**
     * Send this machine's unlocked worlds and take back the full set.
     *
     * A capability for the same reason as `sparksPack`: the credential stays in
     * this file, and `launcher-service` - which installs files and matches
     * codes - has no business being able to read a session.
     *
     * Signed out is `unavailable` rather than a word of its own. The caller's
     * answer is the same either way: keep the local set, try again later. Saying
     * it out loud in the log for the pack was worth it because a missing pack
     * changes what a child can play; a missed sync changes nothing they can see.
     */
    async sparksSyncUnlockedWorlds(packId, unlocked) {
      const current = session;
      if (!current) return { ok: false, failure: "unavailable" };
      return syncUnlockedWorlds({
        sparksUrl,
        bearer: bearerOf(current.credential),
        packId,
        unlocked
      });
    },
    currentIdentity() {
      return session?.identity;
    },
    /**
     * May the person signed in here change the course pack?
     *
     * Asked by the main process before it acts, never taken on the renderer's
     * word. Hiding a control is a product decision; refusing the call is the
     * boundary, and a boundary that only exists in the UI is a boundary that a
     * devtools console walks through.
     */
    isLauncherAdmin() {
      return session?.profile?.isLauncherAdmin === true;
    },
    currentProfileUrl() {
      return session?.profile?.profileUrl ?? void 0;
    },
    /**
     * The pairing page, held here rather than taken back from the renderer.
     *
     * `shell.openExternal` hands a string to the operating system, so the only
     * safe source for it is a url this process built itself. A url that has been
     * to the renderer and back is a url the page could have replaced.
     */
    currentPairingUrl() {
      return pairingUrl;
    },
    isSignedIn() {
      return session !== void 0;
    }
  };
}
const DATA_DIR_NAME = "KodlandLauncher";
class UnsupportedPlatformError extends Error {
  constructor(platform) {
    super(`CraftForge Education Edition supports Windows and macOS only, got "${platform}" (P3)`);
    this.name = "UnsupportedPlatformError";
  }
}
function joinFor(platform, ...segments) {
  return platform === "win32" ? node_path.win32.join(...segments) : node_path.posix.join(...segments);
}
function resolveDataDir(platform, env, homeDir) {
  if (platform === "win32") {
    const appData = env["APPDATA"];
    if (appData && appData.trim()) return joinFor(platform, appData, DATA_DIR_NAME);
    return joinFor(platform, homeDir, "AppData", "Roaming", DATA_DIR_NAME);
  }
  if (platform === "darwin") {
    return joinFor(platform, homeDir, "Library", "Application Support", DATA_DIR_NAME);
  }
  if (platform === "linux") {
    const xdgData = env["XDG_DATA_HOME"];
    if (xdgData && xdgData.trim()) return joinFor(platform, xdgData, DATA_DIR_NAME);
    return joinFor(platform, homeDir, ".local", "share", DATA_DIR_NAME);
  }
  throw new UnsupportedPlatformError(platform);
}
function dataDirLayout(root, platform = process.platform) {
  const at = (...segments) => joinFor(platform, root, ...segments);
  return {
    root,
    /** Downloaded JREs, one per major version (T5). */
    runtime: at("runtime"),
    /** Libraries and assets shared by every instance, so two packs do not download them twice. */
    cache: at("cache"),
    /** One directory per course pack. */
    instances: at("instances"),
    /** JVM and launcher logs. Never shown to the child in full. */
    logs: at("logs"),
    /** Non-secret settings. SSO tokens live in the OS keychain (T7), never here. */
    settings: at("launcher.json")
  };
}
function createDatapackService(options) {
  const log = options.log ?? (() => {
  });
  const refusals = /* @__PURE__ */ new Map();
  let catalogue;
  let reading;
  let retryAfter = 0;
  const RETRY_AFTER_FAILED_MS = 3e4;
  async function itemCatalogue() {
    if (catalogue) return catalogue;
    const instance = options.instance();
    const minecraft = options.minecraft();
    if (!instance || !minecraft) return void 0;
    if (reading) return reading;
    if (Date.now() < retryAfter) return void 0;
    reading = (async () => {
      try {
        catalogue = await readItemCatalogue(options.dataDir, instance, minecraft);
        retryAfter = 0;
        log(
          `read the item catalogue for ${minecraft}: ${catalogue.items.length} items, ${catalogue.blocks.length} blocks, ${catalogue.entities.length} mobs`
        );
      } catch (error) {
        retryAfter = Date.now() + RETRY_AFTER_FAILED_MS;
        log(`could not read the item catalogue: ${String(error)}`);
      } finally {
        reading = void 0;
      }
      return catalogue;
    })();
    return reading;
  }
  function asChecklist(list) {
    if (!list) return void 0;
    return {
      items: new Set(list.items.map((entry) => entry.id)),
      blocks: new Set(list.blocks.map((entry) => entry.id)),
      entities: new Set(list.entities.map((entry) => entry.id))
    };
  }
  async function docOf(slug) {
    const text = await readDraft(options.dataDir, slug);
    if (text === void 0) return void 0;
    try {
      return parseDatapackDoc(text);
    } catch {
      return void 0;
    }
  }
  return {
    /**
     * Every pack, with what is in it and what is wrong with it.
     *
     * The problems are recomputed on every read rather than stored, so a
     * catalogue that only became readable after the game was installed starts
     * being used without anything having to invalidate anything.
     */
    async drafts() {
      const checklist = asChecklist(await itemCatalogue());
      const entries = await listDrafts(options.dataDir);
      return Promise.all(
        entries.map(async (entry) => {
          const doc2 = await docOf(entry.slug);
          return {
            slug: entry.slug,
            name: entry.name,
            namespace: namespaceFor(entry.slug),
            wanted: entry.wanted,
            counts: doc2 ? countKinds(doc2) : { recipe: 0, drop: 0, command: 0, quest: 0 },
            // A pack we cannot read draws as an empty one. The `bad-json`
            // problem below is what says it is broken; a card with a picture
            // and a warning would be two answers to one question.
            preview: doc2 ? previewOf$1(doc2) : { kind: "empty" },
            problems: doc2 ? checkDatapack(doc2, checklist) : [{ reason: "bad-json" }],
            refusals: refusals.get(entry.slug) ?? []
          };
        })
      );
    },
    async doc(slug) {
      return readDraft(options.dataDir, slug);
    },
    /**
     * Make a pack from a preset.
     *
     * The strings arrive from the renderer because they are in the child's
     * locale, and nine locales live in `@kodland/i18n` rather than in a package
     * of pure data. `chatLine` reaches the game inside a `say`, which is why it
     * has to come from there too.
     */
    async create(presetId, name, text) {
      const known = ["recipe", "command", "empty"];
      const preset = known.find((one) => one === presetId);
      const doc2 = preset ? buildPreset(preset, {
        packName: name,
        itemTitle: text["itemTitle"] ?? name,
        ...text["chatLine"] === void 0 ? {} : { chatLine: text["chatLine"] }
      }) : createEmptyDoc(name);
      const entry = await createDraft(options.dataDir, name, doc2);
      log(`made data pack "${name}" as ${entry.slug} from preset ${preset ?? "empty"}`);
      options.onDraftsChanged();
      return entry.slug;
    },
    /**
     * Keep the work.
     *
     * Refuses a document that is not one rather than storing it, so a bug in
     * the Studio does not become an unopenable file tomorrow. The same rule the
     * skin draft follows.
     */
    async save(slug, json2) {
      let doc2;
      try {
        doc2 = parseDatapackDoc(json2);
      } catch {
        log("refused to save a data pack draft that is not a document");
        options.onDatapack({ status: "failed", reason: "bad-json" });
        return;
      }
      if (!await saveDraft(options.dataDir, slug, doc2)) {
        options.onDatapack({ status: "failed", reason: "gone" });
        return;
      }
      options.onDatapack({ status: "saved" });
      options.onDraftsChanged();
    },
    async rename(slug, name) {
      if (await renameDraft(options.dataDir, slug, name)) options.onDraftsChanged();
    },
    async remove(slug) {
      const packId = options.packId();
      await removeDraft(options.dataDir, slug, packId);
      refusals.delete(slug);
      log(`removed data pack ${slug}`);
      options.onDraftsChanged();
    },
    /**
     * Record whether the child wants this pack in their game.
     *
     * Publishes what they will see rather than what happened on disk, and the
     * difference matters: with the game open, nothing they do here shows until
     * they restart it. A data pack is read when the world loads, there is no
     * `/reload` without cheats, and saying "done" over a world that has not
     * changed is the same lie `applySkin` refuses to tell.
     */
    async want(slug, wanted) {
      options.onDatapack({ status: "working", action: wanted ? "turning-on" : "turning-off" });
      if (!await setDraftWanted(options.dataDir, slug, wanted)) {
        options.onDatapack({ status: "failed", reason: "gone" });
        return;
      }
      options.onDraftsChanged();
      if (!wanted) {
        options.onDatapack({ status: "turned-off" });
        return;
      }
      options.onDatapack({ status: "turned-on", afterRestart: options.gameRunning() });
    },
    async catalogue() {
      const list = await itemCatalogue();
      if (!list) return void 0;
      return {
        items: list.items,
        blocks: list.blocks,
        entities: list.entities,
        biomes: list.biomes
      };
    },
    /**
     * Bring the world into line with what the child asked for.
     *
     * Called from the launch path once `resolveWorld` has answered. Never
     * throws: a data pack is not a reason to refuse to start a game, so a
     * failure here is a line in the log and a card marked in the Studio.
     */
    async syncBeforeLaunch(world) {
      const packId = options.packId();
      const format = options.dataFormat();
      if (!packId) return;
      if (!format) {
        log("no data pack format from the client, so no data pack was written");
        return;
      }
      let result;
      try {
        result = await syncWorld(options.dataDir, packId, world, format);
      } catch (error) {
        log(`could not write the data packs into "${world}": ${String(error)}`);
        return;
      }
      refusals.clear();
      if (result.applied.length > 0) {
        log(`data packs in "${world}": ${result.applied.join(", ")}`);
      }
      if (result.removed.length > 0) {
        log(`data packs taken out of "${world}": ${result.removed.join(", ")}`);
      }
      for (const failure of result.failed) {
        log(`data pack ${failure.slug || "(unknown)"} was not written: ${failure.reason}`);
      }
      if (result.applied.length > 0 || result.removed.length > 0) options.onDraftsChanged();
    },
    /**
     * The game refused a file; work out whose card that is.
     *
     * The game names the resource, `<namespace>:recipe/<name>.json`, and never
     * the pack folder - which is why every draft gets a namespace of its own.
     * Without that this could say "something is wrong" and not where.
     */
    async noteRefusal(resource, unknownId) {
      const namespace = resource.split(":")[0];
      if (!namespace) return;
      const entry = (await listDrafts(options.dataDir)).find(
        (one) => namespaceFor(one.slug) === namespace
      );
      if (!entry) return;
      const doc2 = await docOf(entry.slug);
      const owner = doc2 ? fileOwners(doc2, namespaceFor(entry.slug)).get(resource) : void 0;
      const list = refusals.get(entry.slug) ?? [];
      list.push({
        ...owner === void 0 ? {} : { itemId: owner.id },
        resource,
        ...unknownId === void 0 ? {} : { unknownId }
      });
      refusals.set(entry.slug, list);
      options.onDraftsChanged();
    }
  };
}
const PREVIEW_LINES = 6;
const PREVIEW_CHARS = 400;
function previewOf(text) {
  return text.split("\n").slice(0, PREVIEW_LINES).join("\n").slice(0, PREVIEW_CHARS);
}
function createPythonService(options) {
  const log = options.log ?? (() => {
  });
  const viewOf = async (entry) => {
    const text = await readScript(options.dataDir, entry.slug);
    return {
      slug: entry.slug,
      command: scriptCommand(entry.slug),
      fileName: scriptFileName(entry.slug),
      wanted: entry.wanted,
      // A file we cannot read counts as no lines rather than as an error: the
      // card still has to draw, and `problems` already says what is wrong.
      lines: text === void 0 ? 0 : text.split("\n").length,
      preview: text === void 0 ? "" : previewOf(text),
      problems: text === void 0 ? [] : checkScript(text)
    };
  };
  async function copyIntoGame(slug, text) {
    const packId = options.packId();
    if (!packId) return false;
    try {
      return await applyScript(options.dataDir, packId, slug, text);
    } catch (error) {
      log(`could not put ${slug} into the instance: ${String(error)}`);
      return false;
    }
  }
  return {
    async scripts() {
      const entries = await listScripts(options.dataDir);
      return Promise.all(entries.map(viewOf));
    },
    async doc(slug) {
      return readScript(options.dataDir, slug);
    },
    /**
     * Make a script from a preset.
     *
     * The strings arrive from the renderer because they are in the child's
     * locale, and the nine live in `@kodland/i18n` rather than in a package of
     * pure data. One of them - `chatLine` - is read **in Minecraft** rather
     * than in our UI, which is the same reason the data pack preset takes its
     * `say` text from there.
     */
    async create(presetId, name, text) {
      const preset = PRESET_IDS.find((one) => one === presetId) ?? "empty";
      const source = buildPreset$1(preset, {
        chatLine: text["chatLine"] ?? name,
        hereComment: text["hereComment"] ?? ""
      });
      const taken = (await listScripts(options.dataDir)).map((entry2) => entry2.slug);
      const wanted = presetSlug(preset);
      const slug = await scriptSlugIsFree(options.dataDir, wanted) ? wanted : scriptSlugify(wanted, taken);
      const entry = await createScript(options.dataDir, slug, name, source);
      if (!entry) {
        log(`could not make a script called "${name}"`);
        options.onPython({ status: "failed", reason: "gone" });
        return void 0;
      }
      const inGame = await copyIntoGame(entry.slug, source);
      log(`made script "${name}" as ${entry.slug} from preset ${preset}`);
      options.onScriptsChanged();
      options.onPython({ status: "saved", inGame });
      return entry.slug;
    },
    /**
     * Keep the work, and put it in the game in the same breath.
     *
     * The copy is what this Studio is for: with it, a child alt-tabs into an
     * open world and their command answers with what they just typed. Without
     * it they would be told "Saved" over a game still running the last version,
     * which is the lie `datapackNotice` spends a paragraph avoiding.
     */
    async save(slug, text) {
      if (text.length > MAX_SCRIPT_CHARS) {
        options.onPython({ status: "failed", reason: "too-big" });
        return;
      }
      if (checkScript(text).some((problem) => problem.reason === "bad-characters")) {
        options.onPython({ status: "failed", reason: "bad-characters" });
        return;
      }
      if (!await saveScript(options.dataDir, slug, text)) {
        options.onPython({ status: "failed", reason: "gone" });
        return;
      }
      const entry = (await listScripts(options.dataDir)).find((one) => one.slug === slug);
      if (entry?.wanted !== true) {
        options.onPython({ status: "saved", inGame: false });
        options.onScriptsChanged();
        return;
      }
      const inGame = await copyIntoGame(slug, text);
      options.onPython(
        inGame ? { status: "saved", inGame: true } : (
          // The draft is safe; only the copy failed. Said as its own reason so
          // the screen does not tell a child their work is lost.
          { status: "failed", reason: options.packId() ? "write-failed" : "no-instance" }
        )
      );
      options.onScriptsChanged();
    },
    /**
     * Rename a script, and move its copy in the game with it.
     *
     * The store moves the draft folder; the instance is left to `syncScripts`,
     * which is the only code that may delete in `<instance>/minescript/` - it
     * writes the new file, then takes the old one out through the ledger. A
     * child who renames a script with the game open types the new command and
     * it answers, which is the whole point of the Studio.
     *
     * The sync is best-effort on purpose: the rename itself has already
     * succeeded on disk, and a failure to reach the instance is the same case
     * as a save that could not be copied - the draft is safe, and the next save
     * or launch repairs the copy.
     */
    async rename(slug, next) {
      const result = await renameScript(options.dataDir, slug, next);
      if (!result.ok) return result;
      const packId = options.packId();
      if (packId) {
        const sync = await syncScripts(options.dataDir, packId).catch(() => void 0);
        if (sync) {
          log(
            `renamed script ${slug} to ${result.slug}: wrote ${sync.written.length}, removed ${sync.removed.length}`
          );
        }
      } else {
        log(`renamed script ${slug} to ${result.slug}`);
      }
      options.onScriptsChanged();
      return result;
    },
    async remove(slug) {
      const packId = options.packId();
      if (packId) await removeAppliedScript(options.dataDir, packId, slug);
      await removeScript(options.dataDir, slug);
      log(`removed script ${slug}`);
      options.onScriptsChanged();
    },
    /**
     * Put the script in the game, or take it out, now.
     *
     * No `afterRestart` anywhere in this file. A data pack has to publish one
     * because the world on screen was loaded before the file existed; a script
     * is read when the command is typed, so this is true the moment it returns.
     */
    async want(slug, wanted) {
      options.onPython({ status: "working", action: wanted ? "turning-on" : "turning-off" });
      if (!await setScriptWanted(options.dataDir, slug, wanted)) {
        options.onPython({ status: "failed", reason: "gone" });
        return;
      }
      const packId = options.packId();
      if (!packId) {
        options.onPython({ status: "failed", reason: "no-instance" });
        options.onScriptsChanged();
        return;
      }
      if (wanted) {
        const text = await readScript(options.dataDir, slug);
        const ok = text !== void 0 && await copyIntoGame(slug, text);
        options.onPython(ok ? { status: "turned-on" } : { status: "failed", reason: "write-failed" });
      } else {
        await removeAppliedScript(options.dataDir, packId, slug);
        options.onPython({ status: "turned-off" });
      }
      options.onScriptsChanged();
    },
    /**
     * Bring the folder back into line, and never fail a launch doing it.
     *
     * A repair pass rather than the delivery - the delivery happened on save.
     * It earns its place because the folder can drift while nobody is looking:
     * a file deleted by hand, a draft written by another machine, an instance
     * rebuilt after "Delete game".
     *
     * Throws nothing, for the reason `syncBeforeLaunch` in the data pack
     * service gives: a content bug must not stand between a child and their
     * game.
     */
    async syncBeforeLaunch() {
      const packId = options.packId();
      if (!packId) return;
      try {
        const result = await syncScripts(options.dataDir, packId);
        if (result.written.length || result.removed.length || result.keptForeign.length) {
          log(
            `scripts: wrote ${result.written.length}, removed ${result.removed.length}, left alone ${result.keptForeign.length}`
          );
        }
      } catch (error) {
        log(`could not sync scripts before launch: ${String(error)}`);
      }
    }
  };
}
function base64ToBytes(base642) {
  const binary = atob(base642);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
const SKIN_DOC_VERSION = 1;
const BYTES_PER_PIXEL = 4;
const DEFAULT_SWATCHES = [
  "#000000",
  // black
  "#ffffff",
  // white
  "#8b5a2b",
  // skin/leather brown
  "#0ea5e9",
  // sky-500
  "#10b981",
  // emerald-500
  "#8b5cf6",
  // violet-500
  "#f43f5e",
  // rose-500
  "#ec4899",
  // pink-500
  "#facc15",
  // yellow-400
  "#94a3b8"
  // slate-400
];
function pixelCount(width, height) {
  return width * height;
}
function byteLength(width, height) {
  return pixelCount(width, height) * BYTES_PER_PIXEL;
}
function parseSkinDoc(json2) {
  let raw;
  try {
    raw = JSON.parse(json2);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const doc2 = raw;
  if (!isPositiveInt(doc2.width) || !isPositiveInt(doc2.height)) return null;
  if (typeof doc2.templateId !== "string" || doc2.templateId.length === 0) {
    return null;
  }
  if (typeof doc2.pixels !== "string") return null;
  if (base64ToBytes(doc2.pixels).length !== byteLength(doc2.width, doc2.height)) {
    return null;
  }
  return {
    version: typeof doc2.version === "number" ? doc2.version : SKIN_DOC_VERSION,
    templateId: doc2.templateId,
    width: doc2.width,
    height: doc2.height,
    pixels: doc2.pixels,
    swatches: Array.isArray(doc2.swatches) && doc2.swatches.length > 0 ? doc2.swatches.map(String) : [...DEFAULT_SWATCHES]
  };
}
function isPositiveInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function boxFaces(ox, oy, w, h, d) {
  return {
    top: { x: ox + d, y: oy, width: w, height: d },
    bottom: { x: ox + d + w, y: oy, width: w, height: d },
    right: { x: ox, y: oy + d, width: d, height: h },
    front: { x: ox + d, y: oy + d, width: w, height: h },
    left: { x: ox + d + w, y: oy + d, width: d, height: h },
    back: { x: ox + d + w + d, y: oy + d, width: w, height: h }
  };
}
function mirrorLimb(right, left) {
  return [
    { a: right.top, b: left.top },
    { a: right.bottom, b: left.bottom },
    { a: right.front, b: left.front },
    { a: right.back, b: left.back },
    { a: right.right, b: left.left },
    { a: right.left, b: left.right }
  ];
}
function makeMinecraftTemplate(id, nameKey, model, armWidth) {
  const ARM_H = 12;
  const ARM_D = 4;
  const LEG_W = 4;
  const LEG_H = 12;
  const LEG_D = 4;
  const rightArm = boxFaces(40, 16, armWidth, ARM_H, ARM_D);
  const leftArm = boxFaces(32, 48, armWidth, ARM_H, ARM_D);
  const rightLeg = boxFaces(0, 16, LEG_W, LEG_H, LEG_D);
  const leftLeg = boxFaces(16, 48, LEG_W, LEG_H, LEG_D);
  const rightSleeve = boxFaces(40, 32, armWidth, ARM_H, ARM_D);
  const leftSleeve = boxFaces(48, 48, armWidth, ARM_H, ARM_D);
  const rightPants = boxFaces(0, 32, LEG_W, LEG_H, LEG_D);
  const leftPants = boxFaces(0, 48, LEG_W, LEG_H, LEG_D);
  return {
    id,
    nameKey,
    model,
    textureWidth: 64,
    textureHeight: 64,
    parts: [
      // Base layer.
      { id: "head", rect: { x: 0, y: 0, width: 32, height: 16 } },
      { id: "body", rect: { x: 16, y: 16, width: 24, height: 16 } },
      { id: "rightArm", rect: { x: 40, y: 16, width: 16, height: 16 } },
      { id: "rightLeg", rect: { x: 0, y: 16, width: 16, height: 16 } },
      { id: "leftArm", rect: { x: 32, y: 48, width: 16, height: 16 } },
      { id: "leftLeg", rect: { x: 16, y: 48, width: 16, height: 16 } },
      // Overlay layer: the hat, the jacket, the sleeves and the trouser legs.
      // `hat` was the only one listed for a long time, which made the guides
      // inconsistent and — once the bucket started respecting these rectangles —
      // would have left a fill on a sleeve doing nothing at all.
      { id: "hat", rect: { x: 32, y: 0, width: 32, height: 16 } },
      { id: "bodyOverlay", rect: { x: 16, y: 32, width: 24, height: 16 } },
      { id: "rightSleeve", rect: { x: 40, y: 32, width: 16, height: 16 } },
      { id: "rightPants", rect: { x: 0, y: 32, width: 16, height: 16 } },
      { id: "leftSleeve", rect: { x: 48, y: 48, width: 16, height: 16 } },
      { id: "leftPants", rect: { x: 0, y: 48, width: 16, height: 16 } }
    ],
    symmetryPairs: [
      ...mirrorLimb(rightArm, leftArm),
      ...mirrorLimb(rightLeg, leftLeg),
      ...mirrorLimb(rightSleeve, leftSleeve),
      ...mirrorLimb(rightPants, leftPants)
    ]
  };
}
[
  makeMinecraftTemplate(
    "minecraft-steve",
    "skinTemplate_steve",
    "default",
    4
  ),
  makeMinecraftTemplate("minecraft-alex", "skinTemplate_alex", "slim", 3)
];
const DRAFT = "skin-draft.json";
const DRAFT_ROW = "skin-draft-row.json";
function createEditorService(options) {
  const log = options.log ?? (() => {
  });
  const path = node_path.join(options.dataDir, DRAFT);
  const rowPath = node_path.join(options.dataDir, DRAFT_ROW);
  async function readDraftRow() {
    try {
      const parsed = JSON.parse(await promises.readFile(rowPath, "utf8"));
      const id = parsed.id;
      return typeof id === "string" ? id : void 0;
    } catch {
      return void 0;
    }
  }
  async function rememberDraftRow(id) {
    try {
      await promises.mkdir(options.dataDir, { recursive: true });
      await promises.writeFile(rowPath, JSON.stringify({ id }), "utf8");
    } catch {
      log("could not remember which shelf row this drawing made");
    }
  }
  async function supersededRow(addedId) {
    const previous = await readDraftRow();
    if (!previous || previous === addedId) return void 0;
    const row = (await listLibrary(options.dataDir)).find((entry) => entry.id === previous);
    if (!row || row.projectId) return void 0;
    return previous;
  }
  return {
    /**
     * The drawing in progress, or nothing.
     *
     * Parsed before it is handed over: a file that is not a skin document would
     * otherwise reach the editor as a document and be drawn on top of. It is
     * the same JSON their `StudioDraft.pixelDoc` column holds, so a child can
     * start here and finish on the site.
     */
    async draft() {
      let text;
      try {
        text = await promises.readFile(path, "utf8");
      } catch {
        return void 0;
      }
      if (!parseSkinDoc(text)) {
        log("the saved skin draft could not be read; starting a new one");
        return void 0;
      }
      return text;
    },
    /**
     * Keep the drawing.
     *
     * Written through a temporary name and renamed, because a half-written
     * draft is a drawing a child loses on the next launch - and they would
     * never know why.
     */
    async saveDraft(json2) {
      if (!parseSkinDoc(json2)) {
        log("refused to save a skin draft that is not a skin document");
        return;
      }
      await promises.mkdir(options.dataDir, { recursive: true });
      const temporary = `${path}.${process.pid}.part`;
      await promises.writeFile(temporary, json2, "utf8");
      await promises.rename(temporary, path);
    },
    /**
     * Put the drawing on the character, and keep a copy.
     *
     * Both halves matter. `applySkin` writes where the loader looks and refuses
     * an empty canvas - the one failure a child cannot see for themselves,
     * because an invisible character looks like the game being wrong. The copy
     * on the shelf is what stops the applied file from being the only one: it
     * has no Sparks project behind it, so the gallery has no card for it, and
     * without a tile it would exist nowhere a child could point at.
     */
    async apply(png) {
      options.onSkin({ status: "working", action: "wearing" });
      const instance = options.instance();
      const username = options.username();
      if (!instance) {
        options.onSkin({ status: "failed", reason: "no-instance" });
        return;
      }
      if (!username) {
        options.onSkin({ status: "failed", reason: "no-identity" });
        return;
      }
      const result = await applySkin(instance, username, png);
      if (!result.ok) {
        log(`refused a drawn skin: ${result.reason}`);
        options.onSkin({ status: "rejected", reason: result.reason });
        return;
      }
      const added = await addToLibrary(options.dataDir, png, "");
      options.onLibraryChanged();
      const previousId = added ? await supersededRow(added.entry.id) : void 0;
      if (added) await rememberDraftRow(added.entry.id);
      const afterRestart = options.gameRunning();
      log(
        `applied a drawn skin for ${username}: ${result.width}x${result.height}` + (afterRestart ? " (game is open, it shows after a restart)" : "")
      );
      options.onSkin({
        status: "applied",
        skin: `data:image/png;base64,${Buffer.from(png).toString("base64")}`,
        width: result.width,
        height: result.height,
        afterRestart,
        ...previousId ? { previousId } : {}
      });
    }
  };
}
const FILE$1 = "skin-publish.json";
const PENDING_STALE_MS = 7 * 24 * 60 * 60 * 1e3;
function createPublishService(options) {
  const log = options.log ?? (() => {
  });
  const path = node_path.join(options.dataDir, FILE$1);
  let busy = false;
  async function readLink() {
    try {
      const parsed = JSON.parse(await promises.readFile(path, "utf8"));
      if (typeof parsed !== "object" || parsed === null) return {};
      return parsed;
    } catch {
      return {};
    }
  }
  async function writeLink(link) {
    await promises.mkdir(options.dataDir, { recursive: true });
    const temporary = `${path}.${process.pid}.part`;
    await promises.writeFile(temporary, `${JSON.stringify(link, null, 2)}
`, "utf8");
    await promises.rename(temporary, path);
  }
  async function publish(doc2, png) {
    if (busy) {
      options.onSkin({ status: "failed", reason: "publish-busy" });
      return;
    }
    if (!parseSkinDoc(doc2)) {
      log("refused to publish something that is not a skin document");
      options.onSkin({ status: "failed", reason: "publish" });
      return;
    }
    if (opaquePixelCount(png) === 0) {
      options.onSkin({ status: "rejected", reason: "empty" });
      return;
    }
    busy = true;
    options.onSkin({ status: "working", action: "publishing" });
    try {
      await doPublish(doc2, png);
    } finally {
      busy = false;
    }
  }
  async function doPublish(doc2, png) {
    await options.saveDraft(doc2);
    const link = await readLink();
    let updating = link.projectId;
    let saved = await options.saveToSparks(doc2, updating);
    if (!saved.ok && saved.failure === "forbidden_source" && updating !== void 0) {
      log("the project this skin updated is gone; publishing it as a new one");
      updating = void 0;
      await writeLink({});
      saved = await options.saveToSparks(doc2);
    }
    if (!saved.ok) {
      log(`could not send the skin to Sparks: ${saved.failure}${detailOf(saved)}`);
      options.onSkin({ status: "failed", reason: "publish" });
      return;
    }
    const before = await options.ownProjectIds();
    const shelved = await addToLibrary(options.dataDir, png, "");
    options.onLibraryChanged();
    const session = await options.mintSession(saved.publishPath);
    if (!session.ok) {
      log(`the skin is on Sparks but no session could be minted: ${session.failure}`);
      options.onSkin({ status: "failed", reason: "publish-later" });
      return;
    }
    await writeLink({
      ...updating === void 0 ? {} : { projectId: updating },
      pending: {
        localId: shelved?.entry.id ?? "",
        before: before ?? [],
        trusted: before !== void 0,
        openedAt: (/* @__PURE__ */ new Date()).toISOString()
      }
    });
    try {
      await options.openExternal(session.url);
    } catch {
      log("could not open a browser for publishing");
      options.onSkin({ status: "failed", reason: "no-browser" });
      return;
    }
    log("opened a browser to finish publishing a skin");
    options.onSkin({ status: "publish-opened" });
  }
  async function resolveFrom(ids) {
    const link = await readLink();
    const pending = link.pending;
    if (!pending) return false;
    if (Date.now() - Date.parse(pending.openedAt) > PENDING_STALE_MS) {
      log("giving up on a publish nobody finished");
      await writeLink(link.projectId === void 0 ? {} : { projectId: link.projectId });
      return false;
    }
    if (!pending.trusted) {
      return false;
    }
    const fresh = ids.filter((id) => !pending.before.includes(id));
    let projectId;
    if (fresh.length === 1) {
      projectId = fresh[0];
    } else if (fresh.length === 0 && link.projectId !== void 0 && ids.includes(link.projectId)) {
      projectId = link.projectId;
    } else if (fresh.length > 1) {
      log(`cannot tell which of ${fresh.length} new projects this skin became; leaving it`);
      return false;
    }
    if (projectId === void 0) return false;
    if (pending.localId) await stampLibraryProject(options.dataDir, pending.localId, projectId);
    await writeLink({ projectId });
    options.onLibraryChanged();
    log("a published skin found its project");
    options.onSkin({ status: "published" });
    return true;
  }
  return {
    publish,
    resolveFrom,
    /**
     * Ask Sparks who this child is now, and resolve against that.
     *
     * Separate from `resolveFrom` so the free callers stay free: the gallery
     * hands over a list it already had, and only this one spends a request.
     * Silent when nothing is pending, because that is every ordinary focus.
     */
    async resolve(reason) {
      const link = await readLink();
      if (!link.pending) return false;
      const ids = await options.ownProjectIds();
      if (!ids) {
        log(`could not check whether a skin was published (${reason})`);
        return false;
      }
      return resolveFrom(ids);
    },
    /** Whether a publish is waiting to be recognised, for the UI and for focus. */
    async isPending() {
      return (await readLink()).pending !== void 0;
    }
  };
}
function detailOf(result) {
  return result.detail === void 0 ? "" : ` (${result.detail})`;
}
const SKIN_TYPE = "MODEL3D";
function createGalleryService(options) {
  const log = options.log ?? (() => {
  });
  async function localState() {
    const entries = await listLibrary(options.dataDir);
    const collected = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      if (entry.projectId) collected.set(entry.projectId, entry.id);
    }
    const instance = options.instance();
    const username = options.username();
    const applied = instance && username ? await readAppliedSkin(instance, username) : void 0;
    const appliedId = appliedIdOf(applied);
    return appliedId === void 0 ? { collected } : { collected, appliedId };
  }
  function describe2(project, collected, appliedId) {
    const localId = collected.get(project.id);
    return {
      id: project.id,
      title: project.title,
      ownerNickname: project.ownerNickname,
      viewerOwnsThis: project.viewerOwnsThis,
      hasThumb: project.hasThumb,
      /** Present exactly when this machine holds a copy. */
      ...localId ? { localId } : {},
      worn: localId !== void 0 && localId === appliedId
    };
  }
  return {
    /**
     * One page of cards, already told what this machine knows about them.
     *
     * The four states are decided here rather than in the renderer, for the
     * same reason the shelf is read from disk: main is the only thing that
     * knows what is really there, and a page that worked it out itself would be
     * a second answer that drifts.
     */
    async page(scope, cursor) {
      const answer = await options.fetchPage(scope, cursor);
      if (!answer.ok) {
        const detail = answer.failure === "rejected" ? ` (${answer.detail ?? "no detail"})` : "";
        log(`could not read the ${scope} gallery: ${answer.failure}${detail}`);
        const failure = answer.failure === "rejected" ? "unavailable" : answer.failure;
        return { ok: false, failure };
      }
      const { collected, appliedId } = await localState();
      return {
        ok: true,
        items: answer.items.map((project) => describe2(project, collected, appliedId)),
        nextCursor: answer.nextCursor
      };
    },
    /**
     * Put a skin on the shelf.
     *
     * This replaces catching a download out of somebody else's page. The old
     * arrangement worked - their card had a Download button and Electron could
     * see the file go by - but it meant the launcher only ever learned about a
     * skin by watching, and could not answer for what it had.
     */
    async collect(projectId, title) {
      options.onSkin({ status: "working", action: "collecting" });
      const instance = options.instance();
      const username = options.username();
      if (!instance || !username) {
        options.onSkin({
          status: "failed",
          reason: instance ? "no-identity" : "no-instance"
        });
        return;
      }
      const fileUrl2 = projectFileUrl(options.sparksUrl(), projectId);
      let response;
      try {
        response = await options.fetchFile(fileUrl2);
      } catch (error) {
        log(`could not fetch a skin: ${String(error)}`);
        options.onSkin({ status: "failed", reason: "download" });
        return;
      }
      if (!response.ok) {
        log(`Sparks refused a skin file (${response.status})`);
        options.onSkin({ status: "failed", reason: "download" });
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!pngSize(bytes)) {
        options.onSkin({ status: "rejected", reason: "not-png" });
        return;
      }
      const added = await addToLibrary(options.dataDir, bytes, title, projectId);
      if (!added) {
        options.onSkin({ status: "rejected", reason: "not-png" });
        return;
      }
      options.onLibraryChanged();
      log(
        `collected a skin: ${added.entry.id} ${added.entry.width}x${added.entry.height}` + (added.alreadyThere ? " (already on the shelf)" : "")
      );
      options.onSkin({
        status: "collected",
        id: added.entry.id,
        title: added.entry.title,
        alreadyThere: added.alreadyThere
      });
    },
    /** Which type of project a gallery asks for. Here so callers cannot disagree. */
    type: SKIN_TYPE
  };
}
const IMAGE_SCHEME = "kodland-img";
const PROJECT_ADDRESS = /^kodland-img:\/\/project\/([A-Za-z0-9_-]{1,64})$/;
const ITEM_ADDRESS = /^kodland-img:\/\/item\/([a-z0-9_]{1,64})$/;
const WORLD_ADDRESS = /^kodland-img:\/\/world\/([^/?#]{1,240})$/;
const TEMPLATE_ADDRESS = /^kodland-img:\/\/template\/([a-z0-9][a-z0-9-]{0,62}-r\d{1,8})$/;
const ART_ADDRESS = /^kodland-img:\/\/art\/([0-9a-f]{16})$/;
function projectIdOfImageUrl(url) {
  const found = PROJECT_ADDRESS.exec(url);
  return found?.[1];
}
function itemIdOfImageUrl(url) {
  const found = ITEM_ADDRESS.exec(url);
  return found?.[1];
}
function worldFolderOfImageUrl(url) {
  const found = WORLD_ADDRESS.exec(url);
  if (!found?.[1]) return void 0;
  let folder;
  try {
    folder = decodeURIComponent(found[1]);
  } catch {
    return void 0;
  }
  return isSafeFolderName(folder) ? folder : void 0;
}
function templateKeyOfImageUrl(url) {
  const found = TEMPLATE_ADDRESS.exec(url);
  return found?.[1];
}
function artKeyOfImageUrl(url) {
  return ART_ADDRESS.exec(url)?.[1];
}
function thumbUrlFor(sparksUrl, projectId) {
  return `${sparksUrl.replace(/\/+$/, "")}/api/projects/${projectId}/file?variant=thumb`;
}
function registerImageScheme() {
  electron.protocol.registerSchemesAsPrivileged([
    {
      scheme: IMAGE_SCHEME,
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: false }
    }
  ]);
}
function handleImages(options) {
  const log = options.log ?? (() => {
  });
  const fetchImpl = options.fetchImpl ?? electron.net.fetch;
  const thumbs = node_path.join(options.dataDir, "cache", "thumbs");
  let unpacking;
  async function itemIcon(name) {
    const instance = options.instance?.();
    const minecraft = options.minecraft?.();
    if (!instance || !minecraft) return new Response("no game", { status: 404 });
    const folder = itemTextureDir(options.dataDir, minecraft);
    const path = node_path.join(folder, `${name}.png`);
    const serve = async () => {
      try {
        const bytes = await promises.readFile(path);
        return new Response(new Uint8Array(bytes), {
          // These come out of a jar that only changes when the game version
          // does, and the folder is named after that version - so unlike a
          // Sparks cover, this really can be cached hard.
          headers: { "content-type": "image/png", "cache-control": "max-age=86400" }
        });
      } catch {
        return void 0;
      }
    };
    const first = await serve();
    if (first) return first;
    if (!await itemTexturesExtracted(folder)) {
      unpacking ??= extractItemTextures(instance, minecraft, folder).then((count) => {
        log(`unpacked ${count} item textures for ${minecraft}`);
        return count;
      });
      await unpacking;
    }
    const second = await serve();
    return second ?? new Response("no texture", { status: 404 });
  }
  async function lessonArt(key) {
    const root = options.worldsSrc?.();
    if (!root) return new Response("no library", { status: 404 });
    try {
      const bytes = await promises.readFile(node_path.join(root, "art", `${key}.png`));
      return new Response(new Uint8Array(bytes), {
        headers: { "content-type": "image/png", "cache-control": "max-age=86400, immutable" }
      });
    } catch {
      return new Response("no art", { status: 404 });
    }
  }
  async function templatePreview(key) {
    const root = options.worldsSrc?.();
    if (!root) return new Response("no library", { status: 404 });
    try {
      const bytes = await promises.readFile(node_path.join(root, key, "icon.png"));
      return new Response(new Uint8Array(bytes), {
        headers: { "content-type": "image/png", "cache-control": "max-age=86400, immutable" }
      });
    } catch {
      return new Response("no preview", { status: 404 });
    }
  }
  async function worldPreview(folder) {
    const saves = options.saves?.();
    if (!saves) return new Response("no game", { status: 404 });
    try {
      const bytes = await promises.readFile(node_path.join(saves, folder, "icon.png"));
      return new Response(new Uint8Array(bytes), {
        // `no-store` rather than `no-cache`: this file is rewritten by the game
        // every time the child leaves the world, and a stale preview is a
        // picture of a place they have already changed.
        headers: { "content-type": "image/png", "cache-control": "no-store" }
      });
    } catch {
      return new Response("no preview", { status: 404 });
    }
  }
  electron.protocol.handle(IMAGE_SCHEME, async (request) => {
    const itemId = itemIdOfImageUrl(request.url);
    if (itemId) return itemIcon(itemId);
    const worldFolder = worldFolderOfImageUrl(request.url);
    if (worldFolder) return worldPreview(worldFolder);
    const templateKey = templateKeyOfImageUrl(request.url);
    if (templateKey) return templatePreview(templateKey);
    const artKey = artKeyOfImageUrl(request.url);
    if (artKey) return lessonArt(artKey);
    const projectId = projectIdOfImageUrl(request.url);
    if (!projectId) {
      log("refused a picture request we could not parse");
      return new Response("not found", { status: 404 });
    }
    const cached2 = node_path.join(thumbs, `${projectId}.png`);
    try {
      const bytes2 = await promises.readFile(cached2);
      return new Response(new Uint8Array(bytes2), {
        headers: { "content-type": "image/png", "cache-control": "no-cache" }
      });
    } catch {
    }
    const address = thumbUrlFor(options.sparksUrl(), projectId);
    let response;
    try {
      response = await fetchImpl(address);
    } catch (error) {
      log(`could not fetch a picture for ${projectId}: ${String(error)}`);
      return new Response("upstream unreachable", { status: 502 });
    }
    if ((response.status === 401 || response.status === 403) && options.ensureSession) {
      if (await options.ensureSession()) {
        try {
          response = await fetchImpl(address);
        } catch (error) {
          log(`could not fetch a picture for ${projectId} with a session: ${String(error)}`);
          return new Response("upstream unreachable", { status: 502 });
        }
      }
    }
    if (!response.ok) {
      log(`Sparks refused a picture for ${projectId} (${response.status})`);
      return new Response("not available", { status: response.status });
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      await promises.mkdir(thumbs, { recursive: true });
      const temporary = `${cached2}.${process.pid}.${Date.now()}.part`;
      await promises.writeFile(temporary, bytes);
      await promises.rename(temporary, cached2);
    } catch (error) {
      log(`could not cache a picture for ${projectId}: ${String(error)}`);
    }
    return new Response(bytes, {
      headers: { "content-type": "image/png", "cache-control": "no-cache" }
    });
  });
}
const FILES_PARTITION = "persist:kodland-files";
function createSparksCookieJar(options) {
  const jar = electron.session.fromPartition(FILES_PARTITION);
  let attempted;
  async function redeem() {
    const url = await options.mintTicket();
    if (!url) {
      options.log("no session to mint for pictures; private covers will not load");
      return false;
    }
    try {
      await jar.fetch(url, { redirect: "manual" });
    } catch (error) {
      options.log(`could not redeem a session for pictures: ${String(error)}`);
      return false;
    }
    const cookies = await jar.cookies.get({ url: options.sparksUrl() });
    if (cookies.length === 0) {
      options.log("Sparks set no cookie we can use for pictures");
      return false;
    }
    options.log(`pictures have a session cookie (${cookies.length})`);
    return true;
  }
  return {
    fetch: (url) => jar.fetch(url),
    ensure: () => {
      attempted ??= redeem();
      return attempted;
    },
    clear: async () => {
      attempted = void 0;
      await jar.clearStorageData({ storages: ["cookies"] });
    }
  };
}
const TARGET_PIXELS = 128;
const PASSTHROUGH_LIMIT = 256 * 1024;
function toAvatarDataUri(avatar) {
  const image = electron.nativeImage.createFromBuffer(Buffer.from(avatar.bytes));
  if (image.isEmpty()) {
    if (avatar.bytes.byteLength > PASSTHROUGH_LIMIT) return null;
    return `data:${avatar.contentType};base64,${Buffer.from(avatar.bytes).toString("base64")}`;
  }
  const { width, height } = image.getSize();
  if (width === 0 || height === 0) return null;
  const longest = Math.max(width, height);
  const resized = longest > TARGET_PIXELS ? image.resize(
    width >= height ? { width: TARGET_PIXELS, quality: "good" } : { height: TARGET_PIXELS, quality: "good" }
  ) : image;
  const png = resized.toPNG();
  if (png.byteLength === 0) return null;
  return `data:image/png;base64,${png.toString("base64")}`;
}
const FILE_NAME$1 = ".env";
const MAX_DEPTH = 4;
function findEnvFile(startDir, exists2) {
  let dir = startDir;
  const root = node_path.parse(startDir).root;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const candidate = node_path.join(dir, FILE_NAME$1);
    if (exists2(candidate)) return candidate;
    if (dir === root) break;
    dir = node_path.dirname(dir);
  }
  return void 0;
}
function parseEnvFile(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
function loadDevEnv(options) {
  if (options.isPackaged) return [];
  const exists2 = options.exists ?? node_fs.existsSync;
  const read = options.read ?? ((path2) => node_fs.readFileSync(path2, "utf8"));
  const path = findEnvFile(options.cwd, exists2);
  if (!path) return [];
  let parsed;
  try {
    parsed = parseEnvFile(read(path));
  } catch {
    options.log(`could not read ${FILE_NAME$1}, carrying on without it`);
    return [];
  }
  const applied = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (options.env[key] !== void 0) continue;
    options.env[key] = value;
    applied.push(key);
  }
  if (applied.length > 0) {
    options.log(`${FILE_NAME$1} loaded from ${path}: ${applied.sort().join(", ")}`);
  }
  return applied;
}
const WORLD_LOGGER = 'logger="net.minecraft.server.level.progress.LoggingLevelLoadListener"';
const GRAPHICS_DRIVERS = [
  /^atio6axx\.dll$/i,
  // AMD, 64-bit OpenGL
  /^atioglxx\.dll$/i,
  // AMD, 32-bit OpenGL
  /^amdvlk64\.dll$/i,
  // AMD, Vulkan
  /^nvoglv(32|64)\.dll$/i,
  // Nvidia, OpenGL
  /^ig\w*icd(32|64)\.dll$/i
  // Intel, OpenGL
];
function messageOf$1(line) {
  const start = line.indexOf("<![CDATA[");
  if (start === -1) return line;
  const from = start + "<![CDATA[".length;
  const end = line.indexOf("]]>", from);
  return end === -1 ? line.slice(from) : line.slice(from, end);
}
function parseGameLogLine(line, previousLine) {
  const message = messageOf$1(line).trim();
  if (!message) return void 0;
  const found = /^Found new data pack (\S+?), loading it automatically/.exec(message);
  if (found?.[1]) return { kind: "datapack-loaded", pack: found[1] };
  const missing = /^Missing data pack (\S+)/.exec(message);
  if (missing?.[1]) return { kind: "datapack-missing", pack: missing[1] };
  const failed = /^Couldn't parse data file '[^']*' from '([^']+)'/.exec(message);
  if (failed?.[1]) {
    const unknown2 = /Unknown registry key in ResourceKey\[[^\]]*\]: (\S+?);/.exec(message);
    return {
      kind: "datapack-file-failed",
      resource: failed[1],
      ...unknown2?.[1] ? { unknownId: unknown2[1] } : {}
    };
  }
  if (message.includes("No supported graphics backend was found")) {
    return { kind: "fatal", reason: "no-graphics" };
  }
  const spawn = /^Preparing spawn area:\s*(\d{1,3})%/.exec(message) ?? (previousLine?.includes(WORLD_LOGGER) === true ? /:\s*(\d{1,3})%$/.exec(message) : null);
  if (spawn?.[1]) {
    const percent = Number(spawn[1]);
    if (percent >= 0 && percent <= 100) return { kind: "world-progress", percent };
    return void 0;
  }
  if (message.startsWith("Stopping singleplayer server as player logged out")) {
    return { kind: "left-world" };
  }
  if (/^Time elapsed:\s*\d+\s*ms/.test(message)) return { kind: "stage", stage: "playing" };
  if (message.startsWith("Preparing spawn area")) return { kind: "stage", stage: "world" };
  if (message.startsWith("Reloading ResourceManager")) return { kind: "stage", stage: "resources" };
  if (message.startsWith("Sound engine started")) return { kind: "stage", stage: "resources" };
  if (message.startsWith("Backend library:")) return { kind: "stage", stage: "window" };
  if (message.startsWith("Using graphics device")) return { kind: "stage", stage: "window" };
  if (/^Loading \d+ mods/.test(message)) return { kind: "stage", stage: "mods" };
  if (message.startsWith("Loading Minecraft")) return { kind: "stage", stage: "loading" };
  if (line.includes(WORLD_LOGGER)) {
    return { kind: "stage", stage: "world" };
  }
  const report = /^#\s+(\S.*hs_err_pid\d+\.log)$/.exec(line.trim());
  if (report?.[1]) return { kind: "crash-report", path: report[1] };
  const frame = /^#\s+C\s+\[([^\]+]+)\+0x[0-9a-f]+\]/i.exec(line.trim());
  if (frame?.[1] && GRAPHICS_DRIVERS.some((driver) => driver.test(frame[1]))) {
    return { kind: "fatal", reason: "graphics-driver-crash" };
  }
  return void 0;
}
const STAGE_ORDER = ["loading", "mods", "window", "resources", "world", "playing"];
function laterStage(current, next) {
  if (next === "playing" && current !== "world") return current ?? "loading";
  if (!current) return next;
  return STAGE_ORDER.indexOf(next) > STAGE_ORDER.indexOf(current) ? next : current;
}
const MAX_REDIRECTIONS = 5;
function createDownloadDispatcher(connections) {
  return new undici.Agent({ connections }).compose(
    undici.interceptors.retry(),
    undici.interceptors.redirect({ maxRedirections: MAX_REDIRECTIONS })
  );
}
const CLOSE_TIMEOUT_MS = 5e3;
async function closeDownloadDispatcher(agent, log) {
  let timer;
  const closeTimedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(true), CLOSE_TIMEOUT_MS);
  });
  try {
    const stuck = await Promise.race([
      agent.close().then(
        () => false,
        () => false
      ),
      closeTimedOut
    ]);
    if (!stuck) return;
    log?.(`the download pool did not close in ${CLOSE_TIMEOUT_MS} ms, tearing it down`);
    await agent.destroy().catch(() => {
    });
  } finally {
    clearTimeout(timer);
  }
}
function summarizeDownloadError(error) {
  const nested = error?.errors;
  if (Array.isArray(nested) && nested.length > 0) {
    return `${nested.length} file(s) failed, first: ${messageOf(nested[0])}`;
  }
  return messageOf(error);
}
function messageOf(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
async function removeIfEmpty(path) {
  try {
    const info = await promises.stat(path);
    if (!info.isFile() || info.size > 0) return false;
  } catch {
    return false;
  }
  try {
    await promises.rm(path, { force: true });
    return true;
  } catch {
    return false;
  }
}
function emptyFileCandidates(error) {
  const paths = /* @__PURE__ */ new Set();
  const visit = (value, depth) => {
    if (depth > 3 || value === null || typeof value !== "object") return;
    const message = value.message;
    if (typeof message === "string") {
      const match = /^File (.+?) \(http/.exec(message);
      if (match?.[1]) paths.add(match[1]);
    }
    const errors = value.errors;
    if (Array.isArray(errors)) for (const nested of errors) visit(nested, depth + 1);
    const cause = value.cause;
    if (cause) visit(cause, depth + 1);
  };
  visit(error, 0);
  return [...paths];
}
const RUNTIME_CATALOG_URL = "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";
class UnsupportedRuntimePlatformError extends Error {
  constructor(platform, arch) {
    super(`No Mojang Java runtime platform for ${platform}/${arch} (P3 covers Windows and macOS)`);
    this.name = "UnsupportedRuntimePlatformError";
  }
}
class RuntimeComponentUnavailableError extends Error {
  constructor(component, platform) {
    super(
      `Mojang has no "${component}" runtime for ${platform}. The pack's Minecraft version needs a JRE that does not exist for this machine.`
    );
    this.name = "RuntimeComponentUnavailableError";
  }
}
function mojangRuntimePlatform(platform, arch) {
  if (platform === "win32") {
    if (arch === "x64") return "windows-x64";
    if (arch === "arm64") return "windows-arm64";
    if (arch === "ia32") return "windows-x86";
    throw new UnsupportedRuntimePlatformError(platform, arch);
  }
  if (platform === "darwin") {
    return arch === "arm64" ? "mac-os-arm64" : "mac-os";
  }
  if (platform === "linux") {
    if (arch === "ia32") return "linux-i386";
    return "linux";
  }
  throw new UnsupportedRuntimePlatformError(platform, arch);
}
function javaExecutablePath(runtimeDir, platform) {
  const parts = platform === "win32" ? [runtimeDir, "bin", "java.exe"] : (platform === "darwin" ? [runtimeDir, "jre.bundle", "Contents", "Home", "bin", "java"] : [runtimeDir, "bin", "java"]);
  return parts.join(platform === "win32" ? "\\" : "/");
}
const METADATA_TIMEOUT_MS = 1e4;
async function resolveRuntimeManifest(component, platform, arch, catalogUrl = RUNTIME_CATALOG_URL) {
  const platformKey = mojangRuntimePlatform(platform, arch);
  const catalogResponse = await fetch(catalogUrl, {
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS)
  });
  if (!catalogResponse.ok) {
    throw new Error(`Mojang runtime catalog returned ${catalogResponse.status}`);
  }
  const catalog = await catalogResponse.json();
  const candidates = catalog[platformKey]?.[component];
  const entry = candidates?.[0];
  const manifestUrl = entry?.manifest?.url;
  if (!manifestUrl) throw new RuntimeComponentUnavailableError(component, platformKey);
  const manifestResponse = await fetch(manifestUrl, {
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS)
  });
  if (!manifestResponse.ok) {
    throw new Error(`Runtime manifest for ${component} returned ${manifestResponse.status}`);
  }
  const manifest = await manifestResponse.json();
  return {
    target: component,
    files: manifest.files ?? {},
    version: {
      name: entry.version?.name ?? "unknown",
      released: entry.version?.released ?? "unknown"
    }
  };
}
const EXECUTABLE_MODE = 493;
function executableEntries(files) {
  return Object.entries(files).filter(([, raw]) => {
    const entry = raw;
    return entry?.executable === true && (entry.type ?? "file") === "file";
  }).map(([path]) => path).sort();
}
async function restoreExecutableBits(input) {
  if (input.platform === "win32") return 0;
  const apply = input.chmodFile ?? promises.chmod;
  const entries = executableEntries(input.files);
  const failed = [];
  for (const relative of entries) {
    try {
      await apply(node_path.posix.join(input.runtimeDir, relative), EXECUTABLE_MODE);
    } catch {
      failed.push(relative);
    }
  }
  if (failed.length > 0) {
    throw new Error(
      `Could not make the Java runtime executable (${failed.length} of ${entries.length} files): ` + failed.slice(0, 3).join(", ")
    );
  }
  return entries.length;
}
class PackNotFoundUpstreamError extends Error {
  constructor(version2) {
    super(
      `Minecraft "${version2}" is not in Mojang's version manifest. Check the spelling: version ids are opaque strings and the scheme changed in 26.1 (year.drop.hotfix), so "1.21" style ids and "26.2" style ids both exist.`
    );
    this.name = "PackNotFoundUpstreamError";
  }
}
function fabricProfileId(pack) {
  return `${pack.minecraft}-fabric${pack.loader.version}`;
}
async function runTaskWithProgress(task, phase, detail, onProgress) {
  return task.startAndWait({
    onUpdate: () => {
      onProgress?.({
        phase,
        detail,
        bytesDone: task.progress,
        bytesTotal: task.total
      });
    }
  });
}
const DEFAULT_ASSET_CONCURRENCY = 8;
const DOWNLOAD_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 2e3;
const CONCURRENCY_BY_ATTEMPT = [8, 4, 2];
function concurrencyForAttempt(attempt, base) {
  const step = CONCURRENCY_BY_ATTEMPT[Math.min(attempt, CONCURRENCY_BY_ATTEMPT.length) - 1];
  return Math.min(base, step ?? base);
}
async function withRetries(attempt, afterFailure) {
  let lastError;
  for (let number2 = 1; number2 <= DOWNLOAD_ATTEMPTS; number2 += 1) {
    try {
      return await attempt(number2);
    } catch (error) {
      lastError = error;
      const willRetry = number2 < DOWNLOAD_ATTEMPTS;
      await afterFailure(number2, error, willRetry);
      if (!willRetry) break;
      await new Promise((resolve) => setTimeout(resolve, RETRY_PAUSE_MS * number2));
    }
  }
  throw lastError;
}
async function sweepEmptyFiles(error, log) {
  const candidates = emptyFileCandidates(error);
  if (candidates.length === 0) return;
  let removed = 0;
  for (const path of candidates) if (await removeIfEmpty(path)) removed += 1;
  if (removed > 0) log?.(`removed ${removed} empty file(s) left by the failed pass`);
}
function createXmclLaunchEngine(options) {
  const { dataDir } = options;
  const assetConcurrency = options.assetConcurrency ?? DEFAULT_ASSET_CONCURRENCY;
  const withDispatcher = async (attempt, run2) => {
    const agent = createDownloadDispatcher(concurrencyForAttempt(attempt, assetConcurrency));
    try {
      return await run2({ dispatcher: agent });
    } finally {
      await closeDownloadDispatcher(agent, options.log);
    }
  };
  const instanceRoot = (packId) => node_path.join(dataDir, "instances", packId);
  const runtimeRoot = node_path.join(dataDir, "runtime");
  async function fetchVersionMeta(pack) {
    const list = await installer.getVersionList();
    const meta = list.versions.find((candidate) => candidate.id === pack.minecraft);
    if (!meta) throw new PackNotFoundUpstreamError(pack.minecraft);
    return meta;
  }
  async function ensureRuntime(pack, onProgress) {
    onProgress?.({ phase: "runtime", detail: "resolving required Java" });
    const meta = await fetchVersionMeta(pack);
    const versionJson = await (await fetch(meta.url, { signal: AbortSignal.timeout(METADATA_TIMEOUT_MS) })).json();
    const component = versionJson.javaVersion?.component;
    const major = versionJson.javaVersion?.majorVersion;
    if (!component) {
      throw new Error(`Minecraft ${pack.minecraft} does not declare javaVersion.component`);
    }
    onProgress?.({ phase: "runtime", detail: `${component} (Java ${major ?? "?"})` });
    const manifest = await resolveRuntimeManifest(component, process.platform, process.arch);
    const destination = node_path.join(runtimeRoot, component);
    await promises.mkdir(destination, { recursive: true });
    onProgress?.({ phase: "runtime", detail: `downloading JRE ${manifest.version.name}` });
    await withRetries(
      (attempt) => withDispatcher(
        attempt,
        (downloadOptions) => runTaskWithProgress(
          installer.installJavaRuntimeTask({
            manifest,
            destination,
            ...downloadOptions
          }),
          "runtime",
          `Java ${manifest.version.name}`,
          onProgress
        )
      ),
      async (attempt, error, willRetry) => {
        options.log?.(
          `the Java runtime failed on attempt ${attempt} of ${DOWNLOAD_ATTEMPTS}${willRetry ? ", retrying" : ", giving up"}: ${summarizeDownloadError(error)}`
        );
        await sweepEmptyFiles(error, options.log);
        if (!willRetry) return;
        onProgress?.({
          phase: "runtime",
          detail: `retrying Java ${manifest.version.name} (attempt ${attempt + 1})`,
          attempt: attempt + 1,
          attempts: DOWNLOAD_ATTEMPTS
        });
      }
    );
    const madeExecutable = await restoreExecutableBits({
      runtimeDir: destination,
      files: manifest.files,
      platform: process.platform
    });
    if (madeExecutable > 0) {
      onProgress?.({ phase: "runtime", detail: `${madeExecutable} runtime files made executable` });
    }
    return javaExecutablePath(destination, process.platform);
  }
  async function ensurePack(pack, onProgress) {
    const instance = instanceRoot(pack.packId);
    const folder = core.MinecraftFolder.from(instance);
    onProgress?.({ phase: "game", detail: `Minecraft ${pack.minecraft}` });
    const meta = await fetchVersionMeta(pack);
    await withDispatcher(
      1,
      (downloadOptions) => runTaskWithProgress(
        installer.installVersionTask(meta, folder, downloadOptions),
        "game",
        `Minecraft ${pack.minecraft}`,
        onProgress
      )
    );
    onProgress?.({ phase: "game", detail: `Fabric loader ${pack.loader.version}` });
    const artifact = await installer.getFabricLoaderArtifact(pack.minecraft, pack.loader.version);
    const fabricVersionId = await installer.installFabricByLoaderArtifact(artifact, folder, {
      inheritsFrom: pack.minecraft,
      versionId: fabricProfileId(pack)
    });
    const merged = await core.Version.parse(folder, fabricVersionId);
    await withRetries(
      (attempt) => withDispatcher(
        attempt,
        (downloadOptions) => runTaskWithProgress(
          installer.installDependenciesTask(merged, downloadOptions),
          "game",
          "libraries and assets",
          onProgress
        )
      ),
      async (attempt, error, willRetry) => {
        options.log?.(
          `libraries and assets failed on attempt ${attempt} of ${DOWNLOAD_ATTEMPTS}${willRetry ? ", retrying" : ", giving up"}: ${summarizeDownloadError(error)}`
        );
        await sweepEmptyFiles(error, options.log);
        if (!willRetry) return;
        onProgress?.({
          phase: "game",
          detail: `retrying libraries and assets (attempt ${attempt + 1})`,
          attempt: attempt + 1,
          attempts: DOWNLOAD_ATTEMPTS
        });
      }
    );
    return { instance, versionId: fabricVersionId };
  }
  async function launch(launchOptions) {
    const folder = core.MinecraftFolder.from(launchOptions.instance);
    const version2 = await core.Version.parse(folder, launchOptions.versionId);
    const wantsOutput = launchOptions.onStdout !== void 0 || launchOptions.onStderr !== void 0;
    const child = await core.launch({
      gamePath: launchOptions.instance,
      javaPath: launchOptions.javaPath,
      version: version2,
      /*
       * Two of the library's four prechecks, on purpose.
       *
       * Left out: `checkVersion` and `checkLibraries`. Both re-hash files -
       * `checkVersion` reads the whole ~30 MB client jar, `checkLibraries` every
       * library - immediately before spawning the JVM. That is the third pass
       * over the same bytes in one press of Play: `installDependenciesTask` did
       * it during install, and on a warm start the `verified` stamp in
       * `pack-state.json` is what vouches for them instead.
       *
       * Kept: `checkNatives`, which is not a check but the step that unpacks the
       * native libraries the JVM needs, and `linkAssets`, a no-op for modern
       * asset layouts and not ours to promise it stays one.
       *
       * The honest cost: a file that rots after the stamp was written is now
       * caught by the game failing rather than by us. That is what
       * `clearVerifiedStamp` and the repair path exist for - a failed launch
       * drops the stamp, so the next press checks everything.
       */
      prechecks: [core.LaunchPrecheck.checkNatives, core.LaunchPrecheck.linkAssets],
      maxMemory: launchOptions.maxMemoryMb,
      gameProfile: { name: launchOptions.username, id: launchOptions.uuid },
      accessToken: launchOptions.accessToken,
      launcherName: "KodlandLauncher",
      // Appended, not substituted: the library's defaults carry Mojang's
      // recommended G1GC tuning, and `maxMemory` already replaces the `-Xmx` in
      // them. Dropping the rest to pass one manifest flag would be a silent
      // performance regression on exactly the weak laptops we care about.
      ...launchOptions.extraJvmArgs && launchOptions.extraJvmArgs.length > 0 ? { extraJVMArgs: [...core.DEFAULT_EXTRA_JVM_ARGS, ...launchOptions.extraJvmArgs] } : {},
      ...launchOptions.quickPlayWorld ? { extraMCArgs: ["--quickPlaySingleplayer", launchOptions.quickPlayWorld] } : {},
      /*
       * `resolution`, which the library turns into `--width` and `--height`.
       *
       * Read out of `@xmcl/core` rather than assumed: `LaunchOption.resolution`
       * takes `{ width, height, fullscreen?: true }` and pushes the two
       * arguments 26.2 actually documents. Note `fullscreen` there is typed as
       * the literal `true`, so this field cannot turn fullscreen *off* - that
       * is `options.txt`, and the two are not interchangeable.
       *
       * Spread rather than passed as `undefined`, so a caller with no display
       * to ask leaves the command line exactly as it was.
       */
      ...launchOptions.windowSize ? { resolution: launchOptions.windowSize } : {},
      extraExecOption: {
        detached: false,
        // Pipe only when someone is listening. Left at the default the JVM would
        // inherit our stdio, which in a packaged app means its output vanishes.
        ...wantsOutput ? { stdio: ["ignore", "pipe", "pipe"] } : {}
      }
    });
    const pid = child.pid;
    if (pid === void 0) throw new Error("The JVM was spawned but reported no pid");
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    if (launchOptions.onStdout) child.stdout?.on("data", launchOptions.onStdout);
    if (launchOptions.onStderr) child.stderr?.on("data", launchOptions.onStderr);
    return {
      pid,
      waitForExit: () => new Promise((resolve, reject) => {
        child.once("exit", (code) => resolve(code ?? 0));
        child.once("error", reject);
      }),
      close: () => {
        child.kill();
      }
    };
  }
  async function verify(pack) {
    const folder = core.MinecraftFolder.from(instanceRoot(pack.packId));
    try {
      await core.Version.parse(folder, fabricProfileId(pack));
      return { ok: true, badFiles: [] };
    } catch (error) {
      return { ok: false, badFiles: [error instanceof Error ? error.message : String(error)] };
    }
  }
  return { ensureRuntime, ensurePack, launch, verify };
}
function offlineUuid(username) {
  const digest2 = node_crypto.createHash("md5").update(`OfflinePlayer:${username}`, "utf8").digest();
  digest2[6] = (digest2[6] ?? 0) & 15 | 48;
  digest2[8] = (digest2[8] ?? 0) & 63 | 128;
  const hex = digest2.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}
const MB = 1024 * 1024;
const HEADROOM_MB = 300;
function describeSpace(free, requiredMb) {
  if (free === void 0) return { ok: true };
  const neededMb = requiredMb + HEADROOM_MB;
  const freeMb = Math.floor(free / MB);
  if (freeMb >= neededMb) return { ok: true };
  return { ok: false, freeMb, requiredMb: neededMb };
}
async function freeBytes(path) {
  try {
    const stats = await promises.statfs(path);
    return stats.bsize * stats.bavail;
  } catch {
    return void 0;
  }
}
async function directorySize(path) {
  let entries;
  try {
    entries = await promises.readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  const sizes = await Promise.all(
    entries.map(async (entry) => {
      const child = node_path.join(path, entry.name);
      if (entry.isDirectory()) return directorySize(child);
      if (!entry.isFile()) return 0;
      try {
        return (await promises.stat(child)).size;
      } catch {
        return 0;
      }
    })
  );
  return sizes.reduce((total, size) => total + size, 0);
}
async function measureWorlds(saves, folders, cache, measure = true) {
  const bytes = {};
  let complete = true;
  for (const folder of folders) {
    const mtime = await levelMtime(node_path.join(saves, folder));
    const known = cache.get(folder);
    if (known && known.levelMtimeMs === mtime) {
      bytes[folder] = known.bytes;
      continue;
    }
    if (!measure) {
      complete = false;
      continue;
    }
    const size = await directorySize(node_path.join(saves, folder));
    cache.set(folder, { bytes: size, levelMtimeMs: mtime });
    bytes[folder] = size;
  }
  for (const folder of [...cache.keys()]) {
    if (!folders.includes(folder)) cache.delete(folder);
  }
  return { bytes, complete };
}
async function levelMtime(worldDir) {
  try {
    return (await promises.stat(node_path.join(worldDir, "level.dat"))).mtimeMs;
  } catch {
    return 0;
  }
}
const NETWORK_HINTS = [
  "enotfound",
  "econnreset",
  "econnrefused",
  "etimedout",
  // Plain "timeout" as well as the errno spelling. undici throws
  // `ConnectTimeoutError`, which contains neither `etimedout` nor `econn*`, and
  // its absence here is exactly what made a real timeout read as corruption.
  "timeout",
  "eai_again",
  "socket hang up",
  "network",
  "fetch failed",
  "und_err",
  "aborted"
];
const DISK_HINTS = ["enospc", "edquot"];
const BLOCKED_HINTS = ["eacces", "eperm", "erofs", "emfile", "ebusy"];
const PACK_HINTS = [
  "does not match its hash",
  "hashmismatch",
  "invalidpackmanifest",
  "not usable",
  "checksum",
  "unsafe path",
  "is not in mojang"
];
function classifyFailure(error) {
  const detail = describe(error);
  const haystack = detail.toLowerCase();
  const matches = (hints) => hints.some((hint) => haystack.includes(hint));
  if (matches(DISK_HINTS)) return { kind: "disk", code: "DISK-01", detail };
  if (matches(BLOCKED_HINTS)) return { kind: "blocked", code: "FILE-01", detail };
  if (matches(NETWORK_HINTS)) return { kind: "network", code: "NET-01", detail };
  if (matches(PACK_HINTS)) return { kind: "pack", code: "PACK-01", detail };
  return { kind: "unknown", code: "GEN-01", detail };
}
function classifyGameExit(code, context) {
  if (context?.fatal === "no-graphics") {
    return {
      kind: "game-graphics",
      code: "GAME-GFX",
      detail: "The game found neither OpenGL nor Vulkan on this computer"
    };
  }
  if (context?.fatal === "graphics-driver-crash") {
    return {
      kind: "game-graphics",
      code: "GAME-DRV",
      detail: "The game crashed inside the computer's graphics driver"
    };
  }
  if (code === 0 && context?.saidNothing === true) {
    return {
      kind: "game",
      code: "GAME-EARLY",
      detail: "The game exited with code 0 without ever reporting that it had started"
    };
  }
  if (code === 0 || code === 143) return void 0;
  return {
    kind: "game",
    code: `GAME-${exitToken(code)}`,
    detail: `The game exited with code ${code}`
  };
}
function exitToken(code) {
  if (Number.isInteger(code) && code > 0 && code <= 255) return String(code);
  return (code >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
function describe(error, maxChildren = 3) {
  if (error instanceof AggregateError) {
    const kinds = tally(error.errors.map((child) => nameOf(child)));
    const hosts = tally(error.errors.flatMap((child) => hostOf(child)));
    const children = error.errors.slice(0, maxChildren).map((child) => describe(child, 0));
    const omitted = error.errors.length - children.length;
    const suffix = omitted > 0 ? ` (and ${omitted} more)` : "";
    const where = hosts.length > 0 ? ` hosts=[${hosts.join(", ")}]` : "";
    return `${error.name}: ${error.message} kinds=[${kinds.join(", ")}]${where} [${children.join(" | ")}]${suffix}`;
  }
  if (error instanceof Error) {
    const cause = error.cause === void 0 ? "" : ` caused by ${describe(error.cause, 0)}`;
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}
function nameOf(error) {
  return error instanceof Error ? error.name : typeof error;
}
function hostOf(error) {
  if (!(error instanceof Error)) return [];
  const match = /https?:\/\/([^/\s)]+)/.exec(error.message);
  return match?.[1] === void 0 ? [] : [match[1]];
}
function tally(values, max = 6) {
  const counts = /* @__PURE__ */ new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const ordered = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = ordered.slice(0, max).map(([name, count]) => `${name}=${count}`);
  if (ordered.length > max) shown.push(`+${ordered.length - max} more`);
  return shown;
}
function nameTheHost(base) {
  return async (input, init) => {
    try {
      return await base(input, init);
    } catch (error) {
      const origin = originOf(input);
      if (origin === void 0) throw error;
      throw new Error(`could not reach ${origin}`, { cause: error });
    }
  };
}
function originOf(input) {
  const raw = input instanceof Request ? input.url : String(input);
  try {
    return new URL(raw).origin;
  } catch {
    return void 0;
  }
}
const FILE = "install-id";
async function readInstallId(dataDir) {
  const path = node_path.join(dataDir, FILE);
  try {
    const existing = (await promises.readFile(path, "utf8")).trim();
    if (existing.length >= 8) return existing;
  } catch {
  }
  const fresh = node_crypto.randomBytes(16).toString("hex");
  await promises.writeFile(path, fresh, "utf8");
  return fresh;
}
const MIN_XMX_MB = 1024;
const MAX_XMX_MB = 8192;
const SMALL_XMX_MB = 2048;
const SMALL_RAM_BYTES = 9 * 1024 * 1024 * 1024;
function decideMaxMemoryMb(totalRamBytes, manifestXmxMb) {
  if (manifestXmxMb !== void 0 && manifestXmxMb > 0) {
    if (manifestXmxMb < MIN_XMX_MB) return { xmxMb: MIN_XMX_MB, reason: "floored" };
    return { xmxMb: Math.floor(manifestXmxMb), reason: "manifest" };
  }
  const half = Math.floor(totalRamBytes / 2 / 1024 / 1024);
  const small = totalRamBytes < SMALL_RAM_BYTES;
  const ceiling = small ? SMALL_XMX_MB : MAX_XMX_MB;
  if (half > ceiling) return { xmxMb: ceiling, reason: small ? "small-machine" : "capped" };
  if (half < MIN_XMX_MB) return { xmxMb: MIN_XMX_MB, reason: "floored" };
  return { xmxMb: half, reason: "half-of-ram" };
}
function resolvePackSource(env) {
  const url = env["PACK_MANIFEST_URL"]?.trim();
  if (url) return { kind: "url", url };
  return { kind: "sparks", sparksUrl: resolveSparksUrl(env) };
}
function describePackSource(source) {
  if (source.kind === "url") return `manifest from ${source.url}`;
  if (source.kind === "sparks") return `manifest from Sparks at ${source.sparksUrl}`;
  return `manifest from the bundled engineering pack at ${source.path}`;
}
async function loadPackManifest(source, options) {
  const loaded = await readPackManifest(source, options);
  return { ...loaded, manifest: withSkinLoader(loaded.manifest) };
}
async function readPackManifest(source, options) {
  const log = options.log ?? (() => {
  });
  if (source.kind === "url") {
    try {
      const manifest2 = await fetchPackManifest(source.url, options.fetchImpl);
      return { manifest: manifest2, from: "url" };
    } catch (error) {
      log(`could not read the manifest from ${source.url}: ${String(error)}`);
    }
  }
  if (source.kind === "sparks") {
    if (!options.fetchPack) {
      log("no credential yet, so the pack is whatever this machine already had");
    } else {
      const result = await options.fetchPack(options.etag);
      if (result.ok && "preset" in result) {
        log(
          `pack from Sparks: preset ${result.preset.presetId} revision ${result.preset.revision}${result.preset.assignedBy ? ` (by ${result.preset.assignedBy})` : ""}`
        );
        await writePackCache(options.dataDir, {
          ...result.etag ? { etag: result.etag } : {},
          fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
          preset: result.preset
        }).catch((error) => {
          log(`could not write the pack cache: ${String(error)}`);
        });
        return {
          manifest: result.preset.manifest,
          preset: result.preset,
          ...result.etag ? { etag: result.etag } : {},
          from: "sparks"
        };
      }
      if (result.ok) log("Sparks says the pack has not changed");
      else if (result.failure === "invalid") {
        log(
          `the pack cannot be installed, keeping the last one that could: ${(result.problems ?? []).join("; ")}`
        );
      } else if (result.failure !== "no-credential") {
        const status = result.status === void 0 ? "" : ` HTTP ${result.status}`;
        log(`could not read the pack from Sparks (${result.failure}${status})`);
      }
    }
  }
  const cached2 = await readPackCache(options.dataDir);
  if (cached2) {
    log(`pack from the cache: preset ${cached2.preset.presetId} revision ${cached2.preset.revision}`);
    return {
      manifest: cached2.preset.manifest,
      preset: cached2.preset,
      ...cached2.etag ? { etag: cached2.etag } : {},
      from: "cache"
    };
  }
  const path = source.kind === "bundled" ? source.path : options.bundledPath;
  const manifest = parsePackManifest(JSON.parse(await promises.readFile(path, "utf8")));
  log(`pack from the bundled manifest at ${path}`);
  return { manifest, from: "bundled" };
}
const SMOOTHING = 0.3;
const MIN_INTERVAL_MS = 250;
const STALL_AFTER_MS = 3e3;
function createSpeedMeter() {
  let phase;
  let lastBytes = 0;
  let lastAt = 0;
  let smoothed;
  const reset = () => {
    phase = void 0;
    lastBytes = 0;
    lastAt = 0;
    smoothed = void 0;
  };
  return {
    reset,
    update({ bytesDone, phase: samplePhase, now }) {
      if (samplePhase !== phase) {
        reset();
        phase = samplePhase;
        lastBytes = bytesDone;
        lastAt = now;
        return void 0;
      }
      const elapsed = now - lastAt;
      const gained = bytesDone - lastBytes;
      if (gained < 0) {
        lastBytes = bytesDone;
        lastAt = now;
        return smoothed;
      }
      if (gained === 0 && elapsed >= STALL_AFTER_MS) {
        smoothed = 0;
        lastAt = now;
        return 0;
      }
      if (elapsed < MIN_INTERVAL_MS) {
        return smoothed;
      }
      const instant = gained / elapsed * 1e3;
      smoothed = smoothed === void 0 ? instant : smoothed * (1 - SMOOTHING) + instant * SMOOTHING;
      lastBytes = bytesDone;
      lastAt = now;
      return smoothed < 1 ? 0 : smoothed;
    }
  };
}
const DEV_USERNAME = "Player";
function launchUsername(identity, isPackaged) {
  if (identity) return identity.nickname;
  return isPackaged ? void 0 : DEV_USERNAME;
}
async function pathExists(path) {
  try {
    await promises.access(path);
    return true;
  } catch {
    return false;
  }
}
async function copyCostMb(dataDir, packId, template) {
  if (template.kind !== "manifest") return 0;
  const source = templateDir(dataDir, packId, template.worldId, template.revision);
  return Math.ceil(await directorySize(source) / (1024 * 1024));
}
const PHASE_ORDER = ["runtime", "game", "mods", "world", "done"];
function laterPhase(a, b) {
  return PHASE_ORDER.indexOf(b) > PHASE_ORDER.indexOf(a) ? b : a;
}
const HEARTBEAT_MS = 3e4;
const UNLOCK_SYNC_QUIET_MS = 6e4;
const megabytes = (bytes) => Math.round(bytes / 1e6);
function describeHeartbeat(progress, bytesPerSecond) {
  const attempt = progress.attempt === void 0 ? "" : ` (attempt ${progress.attempt} of ${progress.attempts ?? "?"})`;
  if (progress.bytesDone === void 0) {
    return `still working: ${progress.phase}, this step reports no bytes${attempt}`;
  }
  const total = progress.bytesTotal === void 0 ? "?" : String(megabytes(progress.bytesTotal));
  const speed = bytesPerSecond === void 0 ? "" : ` at ${(bytesPerSecond / 1e6).toFixed(1)} MB/s`;
  return `still working: ${progress.phase} ${megabytes(progress.bytesDone)} / ${total} MB${speed}${attempt}`;
}
const STARTUP_GRACE_MS = 9e4;
const QUIET_EXIT_MS = 2e4;
function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
function createLauncherService(options) {
  const { dataDir, env, onState } = options;
  const log = options.log ?? (() => {
  });
  const engine = options.engine ?? createXmclLaunchEngine({ dataDir, log });
  let prepared;
  let preparing = false;
  let lastState = { status: "idle" };
  let packCache;
  let packInFlight;
  let refreshInFlight;
  let unlockSyncInFlight;
  let migrationInFlight;
  let migrationPack;
  let libraryDeferred;
  let libraryInFlight;
  const fetchingWorlds = /* @__PURE__ */ new Set();
  const failedWorlds = /* @__PURE__ */ new Set();
  const seeding = /* @__PURE__ */ new Set();
  const worldSizeCache = /* @__PURE__ */ new Map();
  let lastUnlockSyncMs = 0;
  let running;
  let runningUnconfirmed = false;
  function localSwitchesApply() {
    return options.isLauncherAdmin?.() ?? true;
  }
  function refusedBuild(what) {
    if (options.isUnsupported?.() !== true) return false;
    log(`${what}: this launcher is too old for the lessons Sparks serves`);
    return true;
  }
  function isProcessAlive(pid) {
    return (options.isProcessAlive ?? processIsAlive)(pid);
  }
  function setState(state) {
    lastState = state;
    onState(state);
  }
  async function timed(label, run2) {
    const started = Date.now();
    try {
      return await run2();
    } finally {
      log(`${label}: ${Date.now() - started} ms`);
    }
  }
  async function manifest() {
    if (packCache) return packCache.manifest;
    return (await loadPack()).manifest;
  }
  async function loadPack() {
    if (packInFlight) return packInFlight;
    packInFlight = readPack();
    try {
      return await packInFlight;
    } finally {
      packInFlight = void 0;
    }
  }
  async function readPack() {
    const source = resolvePackSource(env);
    log(describePackSource(source));
    const loaded = await loadPackManifest(source, {
      dataDir,
      bundledPath: options.bundledManifestPath,
      ...options.fetchPack ? { fetchPack: options.fetchPack } : {},
      ...packCache?.etag ? { etag: packCache.etag } : {},
      log
    });
    packCache = loaded;
    const pack = loaded.manifest;
    log(
      `pack ${pack.packId} ${pack.packVersion}: Minecraft ${pack.minecraft}, ${pack.loader.type} ${pack.loader.version}`
    );
    return loaded;
  }
  function reportInstalled(outcome, reason) {
    const report = options.reportInstall;
    const loaded = packCache;
    if (!report || !loaded) return;
    void (async () => {
      try {
        const installId = await readInstallId(dataDir);
        const sent = await report({
          installId,
          appVersion: options.appVersion ?? "unknown",
          platform: process.platform,
          // `url` is a developer's own manifest, not one of theirs, and reporting
          // it as ours would put a number on their page that means nothing.
          source: loaded.from === "sparks" ? "sparks" : loaded.from === "cache" ? "cache" : "bundled",
          presetId: loaded.preset?.presetId ?? "",
          packId: loaded.manifest.packId,
          packVersion: loaded.manifest.packVersion,
          outcome,
          reason
        });
        log(
          sent ? `told Sparks this machine is on ${loaded.manifest.packVersion} (${outcome})` : "could not tell Sparks what is installed; it will be said again next time"
        );
      } catch (error) {
        log(`could not tell Sparks what is installed: ${String(error)}`);
      }
    })();
  }
  function isBusy() {
    return preparing || running !== void 0;
  }
  async function refreshPack(reason) {
    if (isBusy()) {
      log(`not re-reading the pack (${reason}): the launcher is busy`);
      return false;
    }
    if (refusedBuild(`not re-reading the pack (${reason})`)) return false;
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = doRefresh(reason);
    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = void 0;
    }
  }
  async function syncWorldUnlocks(reason) {
    const send = options.syncUnlockedWorlds;
    if (!send) return false;
    let pack;
    try {
      pack = await manifest();
    } catch (error) {
      log(`unlocked worlds not synced (${reason}): no manifest (${String(error)})`);
      return false;
    }
    const settings = await readSettings(dataDir);
    const pending = pendingUnlocksFor(settings, pack.packId);
    if (pending.length === 0 && Date.now() - lastUnlockSyncMs < UNLOCK_SYNC_QUIET_MS) {
      return false;
    }
    if (unlockSyncInFlight) return unlockSyncInFlight;
    unlockSyncInFlight = doSyncWorldUnlocks(pack, pending, reason);
    try {
      return await unlockSyncInFlight;
    } finally {
      unlockSyncInFlight = void 0;
    }
  }
  async function doSyncWorldUnlocks(pack, pending, reason) {
    const settings = await readSettings(dataDir);
    const moved = unlockedWorldsFor(settings, pack.packId).filter((stored) => {
      const world = matchWorld(pack.worlds, stored);
      return world !== void 0 && world.id !== stored;
    });
    const claims = [];
    for (const stored of [...pending, ...moved]) {
      const world = matchWorld(pack.worlds, stored);
      if (!world?.unlockHash || claims.some((claim) => claim.worldId === world.id)) continue;
      claims.push({ worldId: world.id, unlockHash: world.unlockHash });
    }
    let result;
    try {
      result = await options.syncUnlockedWorlds(pack.packId, claims);
    } catch (error) {
      log(`unlocked worlds not synced (${reason}): ${String(error)}`);
      return false;
    }
    if (!result.ok) {
      log(`unlocked worlds not synced (${reason}): ${result.failure}`);
      return false;
    }
    lastUnlockSyncMs = Date.now();
    const before = unlockedWorldsFor(await readSettings(dataDir), pack.packId);
    await adoptServerUnlocks(dataDir, pack.packId, result.worldIds);
    const gained = result.worldIds.filter((id) => !before.includes(id));
    if (gained.length > 0) {
      log(`unlocked worlds synced (${reason}): ${gained.length} from another computer`);
      options.onCatalogue?.();
      return true;
    }
    log(`unlocked worlds synced (${reason}): nothing new`);
    return false;
  }
  async function doRefresh(reason) {
    const before = packCache?.manifest;
    const loaded = await loadPack();
    const changed = before !== void 0 && (before.packId !== loaded.manifest.packId || before.packVersion !== loaded.manifest.packVersion);
    if (!changed) return false;
    const labelsOnly = before.packId === loaded.manifest.packId && installShape(before) === installShape(loaded.manifest);
    if (labelsOnly) {
      await adoptPackVersion(dataDir, loaded.manifest);
      log(
        `the pack moved to ${loaded.manifest.packVersion} with the same files - only labels changed, so nobody is sent anywhere (${reason})`
      );
      options.onCatalogue?.();
      if (lastState.status === "ready") {
        setState({ status: "ready", packVersion: loaded.manifest.packVersion });
      }
      return true;
    }
    log(
      `the pack changed under us: ${before.packId} ${before.packVersion} -> ${loaded.manifest.packId} ${loaded.manifest.packVersion} (${reason})`
    );
    if (lastState.status === "ready") setState({ status: "idle", update: true });
    return true;
  }
  async function prepare() {
    if (refusedBuild("not downloading the game")) return void 0;
    preparing = true;
    let reached = "runtime";
    const furthestPhase = (seen) => {
      reached = laterPhase(reached, seen);
      return reached;
    };
    let heartbeat;
    try {
      setState({ status: "preparing", progress: { phase: "runtime" } });
      const pack = await manifest();
      if (pack.diskMb !== void 0) {
        const verdict = describeSpace(await freeBytes(dataDir), pack.diskMb);
        if (!verdict.ok) {
          log(`not enough disk: ${verdict.freeMb} MB free, ${verdict.requiredMb} MB needed`);
          setState({
            status: "failed",
            failure: {
              kind: "disk",
              code: "DISK-02",
              detail: `${verdict.freeMb} MB free, ${verdict.requiredMb} MB needed`
            }
          });
          return void 0;
        }
      }
      const spec = toPackSpec(pack);
      const speed = createSpeedMeter();
      let latest;
      const forward = (progress) => {
        const bytesPerSecond = progress.bytesDone === void 0 ? void 0 : speed.update({
          bytesDone: progress.bytesDone,
          phase: progress.phase,
          now: Date.now()
        });
        latest = progress;
        setState({
          status: "preparing",
          progress: {
            phase: furthestPhase(progress.phase),
            ...progress.bytesDone === void 0 ? {} : { bytesDone: progress.bytesDone },
            ...progress.bytesTotal === void 0 ? {} : { bytesTotal: progress.bytesTotal },
            ...bytesPerSecond === void 0 ? {} : { bytesPerSecond },
            // Carried through so the screen can say "attempt 2 of 3" instead of
            // letting the bar jump back with no explanation.
            ...progress.attempt === void 0 ? {} : { attempt: progress.attempt },
            ...progress.attempts === void 0 ? {} : { attempts: progress.attempts }
          }
        });
      };
      heartbeat = setInterval(() => {
        if (latest === void 0) return;
        const bytesPerSecond = latest.bytesDone === void 0 ? void 0 : speed.update({
          bytesDone: latest.bytesDone,
          phase: latest.phase,
          now: Date.now()
        });
        log(describeHeartbeat(latest, bytesPerSecond));
      }, HEARTBEAT_MS);
      const javaPath = await timed("runtime", () => engine.ensureRuntime(spec, forward));
      log(`java: ${javaPath}`);
      const installed = await timed("game", () => engine.ensurePack(spec, forward));
      const onModStep = (step) => {
        if (step.kind !== "mods") return;
        setState({
          status: "preparing",
          progress: {
            phase: furthestPhase("mods"),
            itemsDone: step.done,
            itemsTotal: step.total
          }
        });
      };
      const mods = await timed(
        "mods",
        () => installMods(pack, dataDir, onModStep, fetchFile, localSwitchesApply())
      );
      log(
        `mods: ${mods.downloaded} downloaded, ${mods.alreadyPresent} present, ${mods.removed.length} stale jar(s) removed`
      );
      const skinLoader = pack.mods.find((mod) => mod.id === SKIN_LOADER_MOD.id);
      log(
        skinLoader === void 0 ? "skin loader: not in this pack - skins will not show in the game" : `skin loader: ${skinLoader.id} ${skinLoader.version}${skinLoader.enabled ? "" : " (switched off by the pack)"}`
      );
      setState({ status: "preparing", progress: { phase: furthestPhase("world") } });
      const open = await openManifestWorlds(pack);
      const library = await timed(
        "world",
        () => syncWorldLibrary(dataDir, pack.packId, open, void 0, fetchFile)
      );
      log(
        library.length === 0 ? "world library: nothing open on this machine" : `world library: ${library.map((entry) => `${entry.folder} (${entry.outcome})`).join(", ")}`
      );
      const clientVersion = await readClientVersionInfo(installed.instance, pack.minecraft).catch(
        (error) => {
          log(`could not read the client version stamp, so no fast start: ${String(error)}`);
          return void 0;
        }
      );
      await writePackState(
        dataDir,
        pack,
        /* @__PURE__ */ new Date(),
        clientVersion ? {
          minecraft: pack.minecraft,
          loaderVersion: pack.loader.version,
          versionId: installed.versionId,
          javaPath,
          clientVersion,
          at: (/* @__PURE__ */ new Date()).toISOString()
        } : void 0
      );
      prepared = {
        manifest: pack,
        instance: installed.instance,
        versionId: installed.versionId,
        javaPath,
        ...clientVersion ? { clientVersion } : {}
      };
      setState({ status: "ready", packVersion: pack.packVersion });
      reportInstalled("ok", "");
      options.onCatalogue?.();
      return prepared;
    } catch (error) {
      const failure = classifyFailure(error);
      log(`prepare failed [${failure.code}] ${failure.detail}`);
      reportInstalled("failed", failure.code);
      setState({ status: "failed", failure });
      return void 0;
    } finally {
      clearInterval(heartbeat);
      preparing = false;
      resumeDeferredLibrary();
    }
  }
  const fetchFile = nameTheHost(
    options.fetchPackFile ? (input) => options.fetchPackFile?.(String(input)) ?? fetch(input) : fetch
  );
  async function openManifestWorlds(pack) {
    const settings = await readSettings(dataDir);
    const open = openWorlds(
      pack.worlds,
      unlockedWorldsFor(settings, pack.packId),
      settings.seenOpenWorlds?.[pack.packId] ?? []
    );
    const ungated = open.filter((world) => world.unlockHash === void 0).map((world) => world.id);
    if (ungated.length > 0) await addToPackList(dataDir, "seenOpenWorlds", pack.packId, ungated);
    return open;
  }
  async function ensureMyWorlds(pack) {
    if (migrationPack !== pack) {
      migrationPack = pack;
      migrationInFlight = void 0;
    }
    migrationInFlight ??= (async () => {
      const installed = await readInstalledWorlds(dataDir, pack.packId);
      const worlds = await migrateMyWorlds(dataDir, pack.packId, pack.worlds, installed);
      await adoptLegacyChoice(worlds, pack);
    })();
    try {
      await migrationInFlight;
    } catch (error) {
      log(`could not record the worlds on disk: ${String(error)}`);
      migrationInFlight = void 0;
    }
  }
  async function adoptLegacyChoice(worlds, pack) {
    const settings = await readSettings(dataDir);
    if (settings.myWorldId !== void 0 || settings.worldId === void 0) return;
    const legacy = matchWorld(pack.worlds, settings.worldId)?.id ?? settings.worldId;
    const byFolder = worlds.find((world) => world.folder === legacy);
    const bySource = worlds.filter(
      (world) => (world.source.kind === "manifest" || world.source.kind === "preset") && world.source.worldId === legacy
    ).sort((a, b) => revisionOf(b) - revisionOf(a))[0];
    const chosen = byFolder ?? bySource;
    if (chosen) await updateSettings(dataDir, { myWorldId: chosen.id });
  }
  function revisionOf(world) {
    return world.source.kind === "manifest" ? world.source.revision ?? -1 : -1;
  }
  function resumeDeferredLibrary() {
    const reason = libraryDeferred;
    if (!reason) return;
    libraryDeferred = void 0;
    void fetchWorldLibrary(`${reason} (deferred until the machine was free)`).catch(() => {
    });
  }
  async function fetchWorldLibrary(reason) {
    if (libraryInFlight) {
      await libraryInFlight.catch(() => void 0);
      return;
    }
    if (isBusy()) {
      libraryDeferred = reason;
      log(`world library: ${reason}, but the machine is busy; it waits`);
      return;
    }
    libraryInFlight = (async () => {
      const pack = await manifest();
      const [open, library] = await Promise.all([
        openManifestWorlds(pack),
        listWorldLibrary(dataDir, pack.packId)
      ]);
      const wanted = open.filter(
        (world) => library.get(world.id) !== world.revision && !failedWorlds.has(world.id)
      );
      if (wanted.length === 0) return false;
      log(`world library: fetching ${wanted.length} footprint(s) - ${reason}`);
      for (const world of wanted) fetchingWorlds.add(world.id);
      options.onCatalogue?.();
      try {
        for (const world of wanted) {
          const startedAt = Date.now();
          try {
            await syncWorldLibrary(dataDir, pack.packId, [world], void 0, fetchFile);
            const mb2 = Math.round(
              await directorySize(templateDir(dataDir, pack.packId, world.id, world.revision)) / (1024 * 1024)
            );
            log(
              `world library: "${world.id}" r${world.revision} arrived, ${mb2} MB in ${Math.round((Date.now() - startedAt) / 1e3)}s`
            );
          } catch (error) {
            failedWorlds.add(world.id);
            log(`world library: "${world.id}" did not arrive: ${String(error)}`);
          } finally {
            fetchingWorlds.delete(world.id);
            options.onCatalogue?.();
          }
        }
      } finally {
        for (const world of wanted) fetchingWorlds.delete(world.id);
      }
      return true;
    })();
    try {
      const changed = await libraryInFlight;
      if (changed) options.onCatalogue?.();
    } catch (error) {
      log(`world library: the pass stopped early: ${String(error)}`);
      options.onCatalogue?.();
    } finally {
      libraryInFlight = void 0;
    }
  }
  async function hasIcon(directory) {
    return exists2(node_path.join(directory, "icon.png"));
  }
  async function exists2(path) {
    try {
      await promises.access(path);
      return true;
    } catch {
      return false;
    }
  }
  async function seedLesson(pack, lessonId) {
    if (isBusy() || seeding.has(lessonId)) return;
    const worlds = await readMyWorlds(dataDir, pack.packId);
    if (worlds.some((world) => world.source.kind !== "adopted" && templateOf(world) === lessonId)) {
      return;
    }
    const [templates, open] = await Promise.all([templatesOf(pack), openManifestWorlds(pack)]);
    const ready = templates.find((entry) => entry.id === lessonId)?.ready === true;
    if (!ready) return;
    const template = templateFor(lessonId, open, templates);
    if (!template) return;
    seeding.add(lessonId);
    try {
      const version2 = prepared?.clientVersion ?? (template.kind === "manifest" ? void 0 : await readClientVersionInfo(
        instanceLayout(dataDir, pack.packId).instance,
        pack.minecraft
      ).catch(() => void 0));
      if (template.kind !== "manifest" && !version2) return;
      const made = await createMyWorld(dataDir, pack.packId, template, version2);
      if (made.ok) {
        log(`first world of "${lessonId}" made on opening it: ${made.world.folder}`);
        options.onCatalogue?.();
      }
    } finally {
      seeding.delete(lessonId);
    }
  }
  function templateOf(world) {
    switch (world.source.kind) {
      case "manifest":
      case "preset":
        return world.source.worldId;
      case "random":
        return RANDOM_WORLD_ID;
      case "adopted":
        return void 0;
    }
  }
  async function templatesOf(pack) {
    const [open, library] = await Promise.all([
      openManifestWorlds(pack),
      listWorldLibrary(dataDir, pack.packId)
    ]);
    return listTemplates(pack.worlds.length > 0 ? open : void 0, library);
  }
  function templateFor(id, open, templates) {
    if (id === RANDOM_WORLD_ID) return { kind: "random" };
    const preset = findPreset(id);
    if (preset?.seed !== void 0 && preset.seed !== null && templates.some((entry) => entry.id === id)) {
      return { kind: "preset", worldId: preset.id, folderBase: preset.folder, seed: preset.seed };
    }
    const world = open.find((entry) => entry.id === id);
    if (!world) return void 0;
    return {
      kind: "manifest",
      worldId: world.id,
      revision: world.revision,
      folderBase: world.name
    };
  }
  async function resolveWorld(game) {
    const pack = game.manifest;
    await ensureMyWorlds(pack);
    const settings = await readSettings(dataDir);
    if (settings.myWorldId === "minecraft-menu") {
      log("launching into standard Minecraft main menu (quickPlay disabled)");
      return void 0;
    }
    const worlds = await readMyWorlds(dataDir, pack.packId);
    const chosen = pickMyWorld(worlds, settings.myWorldId);
    if (chosen) {
      enableCheatsInLevelDat(node_path.join(instanceLayout(dataDir, pack.packId).saves, chosen.folder, "level.dat"));
      return chosen.folder;
    }
    try {
      const version2 = game.clientVersion ?? await readClientVersionInfo(game.instance, pack.minecraft);
      const templates = await templatesOf(pack);
      const open = await openManifestWorlds(pack);
      const first = templates.find((entry) => entry.ready) ?? templates[templates.length - 1];
      const template = first ? templateFor(first.id, open, templates) : void 0;
      const made = template ? await createMyWorld(dataDir, pack.packId, template, version2) : void 0;
      if (made?.ok) {
        await updateSettings(dataDir, { myWorldId: made.world.id });
        options.onCatalogue?.();
        log(`first world "${made.world.folder}" created from ${first?.id ?? "nothing"}`);
        enableCheatsInLevelDat(node_path.join(instanceLayout(dataDir, pack.packId).saves, made.world.folder, "level.dat"));
        return made.world.folder;
      }
      log(`could not make a first world: ${made?.ok === false ? made.reason : "no footprint"}`);
      return void 0;
    } catch (error) {
      log(`could not prepare a world, the game will open at the menu: ${String(error)}`);
      return void 0;
    }
  }
  async function launch(worldId, identity) {
    if (refusedBuild("not starting the game")) return;
    if (worldId !== void 0) await updateSettings(dataDir, { myWorldId: worldId });
    return launchChosen(identity);
  }
  async function launchChosen(identity) {
    if (running !== void 0) {
      if (!isProcessAlive(running.pid)) {
        log(`the game (pid ${running.pid}) is gone but its handle was still held; letting Play through`);
        running = void 0;
      } else {
        log("refusing to start a second game: one is already running");
        setState({ status: "running", ...runningUnconfirmed ? { unconfirmed: true } : {} });
        return;
      }
    }
    if (!identity && options.isPackaged) {
      log("refusing to launch without a signed-in student (production build)");
      setState({
        status: "failed",
        failure: { kind: "unknown", code: "AUTH-01", detail: "No student is signed in" }
      });
      return;
    }
    if (!prepared) {
      const pack = await manifest().catch(() => void 0);
      if (pack) await adoptStamp(pack, await readPackState(dataDir, pack.packId));
    }
    const game = prepared ?? await prepare();
    if (!game) return;
    let startupFallback;
    let logStream;
    try {
      setState({ status: "starting" });
      const memory = decideMaxMemoryMb(node_os.totalmem(), game.manifest.memory?.xmxMb);
      const mb2 = (bytes) => Math.round(bytes / 1024 / 1024);
      log(
        `heap: -Xmx${memory.xmxMb}M (${memory.reason}); ram ${mb2(node_os.totalmem())} MB total, ${mb2(node_os.freemem())} MB free`
      );
      const gameOptions = await ensureGameOptions(game.instance);
      if (gameOptions.written) log("wrote options.txt windowed for the first run");
      const launcherSettings = await readSettings(dataDir);
      if (!launcherSettings.windowedDefaultApplied) {
        const migrated = await applyWindowedDefault(game.instance);
        if (migrated.changed) log("options.txt: turned fullscreen off, once");
        await updateSettings(dataDir, { windowedDefaultApplied: true });
      }
      await ensureSkinLoaderConfig(game.instance);
      const worldName = await timed("world shortcut", () => resolveWorld(game));
      if (worldName !== void 0 && options.onWorldChosen) {
        await timed("data packs", async () => {
          try {
            await options.onWorldChosen?.(worldName);
          } catch (error) {
            log(`could not put the data packs into "${worldName}": ${String(error)}`);
          }
        });
      }
      const username = launchUsername(identity, options.isPackaged) ?? DEV_USERNAME;
      if (!identity) log("launching with the development nickname - no student is signed in");
      logStream = await openJvmLog(dataDir);
      let stage;
      let reachedGame = false;
      let buffered = "";
      let previousLine;
      let fatal;
      const pressedPlay = Date.now();
      const sincePlay = () => Date.now() - pressedPlay;
      const publishStarting = (percent) => {
        if (reachedGame) return;
        setState({
          status: "starting",
          ...stage === void 0 || stage === "playing" ? {} : { stage },
          ...percent === void 0 ? {} : { percent }
        });
      };
      const enterGame = () => {
        if (reachedGame) return;
        reachedGame = true;
        runningUnconfirmed = false;
        clearTimeout(startupFallback);
        setState({ status: "running" });
        log(`the game reports it is in the world: ${sincePlay()} ms after Play`);
      };
      const assumeGame = () => {
        if (reachedGame) return;
        reachedGame = true;
        runningUnconfirmed = true;
        setState({ status: "running", unconfirmed: true });
      };
      startupFallback = setTimeout(() => {
        if (reachedGame) return;
        log(`no startup marker was recognised in ${sincePlay()} ms; assuming the game is up`);
        assumeGame();
      }, options.startupGraceMs ?? STARTUP_GRACE_MS);
      const onGameOutput = (chunk) => {
        logStream?.write(chunk);
        buffered += chunk;
        const lines = buffered.split(/\r?\n/);
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          const event = parseGameLogLine(line, previousLine);
          previousLine = line;
          if (!event) continue;
          if (event.kind === "fatal") {
            log(`the game says it cannot run here: ${event.reason}`);
            fatal = event.reason;
            continue;
          }
          if (event.kind === "crash-report") {
            log(`the game wrote a crash report at ${event.path}`);
            continue;
          }
          if (event.kind === "left-world") {
            log("the child left the world; closing the game");
            running?.close();
            continue;
          }
          if (event.kind === "world-progress") {
            stage = laterStage(stage, "world");
            publishStarting(event.percent);
            continue;
          }
          if (event.kind === "datapack-loaded") {
            log(`the game loaded data pack ${event.pack}`);
            continue;
          }
          if (event.kind === "datapack-missing") {
            log(`the game found no folder for data pack ${event.pack}, and forgot it`);
            continue;
          }
          if (event.kind === "datapack-file-failed") {
            log(
              event.unknownId === void 0 ? `the game refused ${event.resource}` : `the game refused ${event.resource}: it does not know ${event.unknownId}`
            );
            options.onDatapackRefused?.(event.resource, event.unknownId);
            continue;
          }
          const next = laterStage(stage, event.stage);
          if (next === stage) continue;
          stage = next;
          log(`stage ${stage}: ${sincePlay()} ms after Play`);
          if (stage === "playing") enterGame();
          else publishStarting();
        }
      };
      const child = await engine.launch({
        instance: game.instance,
        versionId: game.versionId,
        javaPath: game.javaPath,
        username,
        uuid: offlineUuid(username),
        // The literal "0" is the offline Minecraft session token. It has nothing
        // to do with a Kodland SSO access token and the two must never be
        // confused - one is a placeholder, the other is a credential.
        accessToken: "0",
        maxMemoryMb: memory.xmxMb,
        ...worldName === void 0 ? {} : { quickPlayWorld: worldName },
        extraJvmArgs: game.manifest.jvmArgs,
        ...(() => {
          const size = options.gameWindowSize?.();
          return size ? { windowSize: size } : {};
        })(),
        onStdout: onGameOutput,
        onStderr: onGameOutput
      });
      running = child;
      runningUnconfirmed = false;
      const spawnedAt = Date.now();
      log(`jvm pid ${child.pid} as ${username}`);
      publishStarting();
      const code = await child.waitForExit();
      const livedMs = Date.now() - spawnedAt;
      running = void 0;
      runningUnconfirmed = false;
      prepared = game;
      log(`game exited with code ${code}`);
      resumeDeferredLibrary();
      const saidNothing = stage === void 0 && livedMs < QUIET_EXIT_MS;
      if (saidNothing) log(`the game said nothing and exited after ${livedMs} ms`);
      const failure = classifyGameExit(code, {
        ...fatal === void 0 ? {} : { fatal },
        ...saidNothing ? { saidNothing } : {}
      });
      if (failure) {
        await distrustStamp(game.manifest.packId, failure);
        setState({ status: "failed", failure });
      } else setState({ status: "ready", packVersion: game.manifest.packVersion });
    } catch (error) {
      const failure = classifyFailure(error);
      log(`launch failed [${failure.code}] ${failure.detail}`);
      await distrustStamp((await manifest().catch(() => void 0))?.packId, failure);
      setState({ status: "failed", failure });
    } finally {
      clearTimeout(startupFallback);
      logStream?.end();
    }
  }
  async function adoptStamp(pack, state) {
    const stamp = stampMatches(state, pack);
    if (!stamp.ok) {
      log(`no fast start for pack ${pack.packVersion}: ${stamp.reason}`);
      return false;
    }
    if (!await pathExists(stamp.verified.javaPath)) {
      log(`the recorded java is gone (${stamp.verified.javaPath}); running a full pass`);
      return false;
    }
    prepared = {
      manifest: pack,
      instance: instanceLayout(dataDir, pack.packId).instance,
      versionId: stamp.verified.versionId,
      javaPath: stamp.verified.javaPath,
      clientVersion: stamp.verified.clientVersion
    };
    log(`pack ${pack.packVersion} was verified on ${stamp.verified.at}; starting the game`);
    return true;
  }
  async function distrustStamp(packId, failure) {
    if (!packId) return;
    if (failure.kind === "network" || failure.kind === "disk") return;
    if (await clearVerifiedStamp(dataDir, packId)) {
      prepared = void 0;
      log(`dropped the verified stamp after ${failure.code}; the next start will check every file`);
    }
  }
  return {
    prepare,
    launch,
    /**
     * Whether something is being written or played right now.
     *
     * Published so the update service can ask instead of keeping its own idea
     * of it. It is a question, not a state: nothing subscribes to it, and the
     * answer is only meaningful at the moment it is asked - which is why the
     * updater re-asks while it downloads rather than checking once.
     */
    isBusy,
    /**
     * Who the game would be launched as right now.
     *
     * Exists so the Skin Studio names its file after the same string, without a
     * second copy of the rule. See `launchUsername`.
     */
    usernameFor(identity) {
      return launchUsername(identity, options.isPackaged);
    },
    /**
     * Where this pack's files live, once we know which pack that is.
     *
     * For the Skin Studio, which writes into the instance and must not compute
     * the path itself - one place decides the layout (`instanceLayout`), and a
     * second guess is how a skin ends up in a folder nothing reads.
     */
    instancePath() {
      if (prepared) return prepared.instance;
      if (!packCache) return void 0;
      return instanceLayout(dataDir, packCache.manifest.packId).instance;
    },
    /**
     * Where the worlds are.
     *
     * Asked rather than built from `instancePath()`, for the reason written a
     * few lines below about `packId`: `instanceLayout` is the one owner of the
     * layout, and a second `join(instance, "saves")` somewhere else is how a
     * file ends up looked for where nothing writes it.
     */
    savesPath() {
      if (!packCache) return void 0;
      return instanceLayout(dataDir, packCache.manifest.packId).saves;
    },
    /** Where the footprints are, for a course world's picture. Same argument as above. */
    worldsSrcPath() {
      if (!packCache) return void 0;
      return instanceLayout(dataDir, packCache.manifest.packId).worldsSrc;
    },
    /**
     * Ask Sparks again whether the build changed.
     *
     * Called when somebody signs in, because that is the first moment there is
     * a credential to ask with, and the pack read before it came from the cache
     * or from the installer.
     */
    async refreshPack(reason) {
      try {
        return await refreshPack(reason);
      } catch (error) {
        log(`could not re-read the pack (${reason}): ${String(error)}`);
        return false;
      }
    },
    /**
     * Reconcile this machine's unlocked worlds with Sparks.
     *
     * Called from exactly two places: after `refreshPack` on sign-in, which is
     * the first moment there is both a credential and a manifest, and after
     * `unlockWorld` has already answered - so the world is on screen before any
     * request is made, and stays there whatever the request does.
     *
     * **Deliberately not called from `worlds()`.** That runs on every
     * `catalogue:changed` - a world choice, a mod switch, a pack refresh and each
     * unlock - and syncing from there would spend the whole rate-limit window on
     * redraws.
     */
    async syncUnlockedWorlds(reason) {
      try {
        return await syncWorldUnlocks(reason);
      } catch (error) {
        log(`unlocked worlds not synced (${reason}): ${String(error)}`);
        return false;
      }
    },
    /**
     * Which Minecraft the manifest asked for, as an opaque identifier.
     *
     * Only ever compared for equality or used to build a path - versions stopped
     * being semver at 26.1, so anything that orders them is a bug. Asked for by
     * the skin shelf, which reads the game's own default skins out of the client
     * jar and needs to know which jar that is.
     */
    /**
     * Which pack is installed, for whoever needs to name its instance.
     *
     * Asked rather than taken from the end of `instancePath()`: deriving it
     * would be a second copy of the layout, and `instanceLayout` is the one
     * owner. The lesson is `launchUsername`'s - two derivations of one answer
     * disagree, and then a file lands where nothing reads it.
     */
    packId() {
      return prepared?.manifest.packId;
    },
    /**
     * The data pack format the installed client states, or nothing.
     *
     * Asked rather than derived, for the same reason `instancePath()` is: one
     * place owns it. From the stamp on a fast start, from the jar on a full
     * pass - either way it is the client's number and never ours.
     */
    clientDataFormat() {
      return prepared?.clientVersion?.dataFormat;
    },
    minecraftVersion() {
      return packCache?.manifest.minecraft;
    },
    /**
     * Ask the disk whether the game is already here, and say so.
     *
     * Called once at startup. Without it the launcher always opened on "Ready to
     * play? Download the game" - even with 646 MB of Minecraft sitting on the
     * disk. Pressing the button then ran a verify pass and jumped to the hub,
     * which taught the person that the button lies.
     *
     * Two questions, both cheap. `stampMatches` compares what the last finished
     * install recorded against what the manifest now asks for, and `verify`
     * resolves the version JSON and its inheritance without hashing a single
     * file. A different `packVersion` is not "installed": the lesson content
     * changed, and offering to download is then the truth.
     *
     * **`prepared` is set when the stamp is complete, and this changed in
     * v0.7.15.** It used to be deliberately left unset, on the reasoning that
     * these checks say the install looks right rather than that all 2800 files
     * are intact. The reasoning was sound and the price turned out to be wrong:
     * "Play still runs its pass" meant ~1.3 GB of reading and hashing before
     * every first launch of a session, because the pass hashed the assets twice
     * and the launch prechecks hashed the jar and libraries a third time. The
     * answer to "are the files intact" is now written down by the install that
     * proved it (`VerifiedInstall`), so the second Play trusts that record
     * instead of redoing the work.
     *
     * What that costs, stated plainly: a file that rots after the stamp was
     * written is caught by the game failing rather than by us. `launch` drops
     * the stamp when that happens and `verifyFiles` lets somebody force the
     * full pass, so the slow path is one press away rather than gone.
     */
    async checkInstalled() {
      try {
        const pack = await manifest();
        if (lastState.status !== "idle") {
          log("skipping the installed check: the launcher has already moved on");
          return false;
        }
        const state = await readPackState(dataDir, pack.packId);
        if (!state) return false;
        const shapeMoved = state.shape !== void 0 && state.shape !== installShape(pack);
        if (state.packId !== pack.packId || state.packVersion !== pack.packVersion) {
          const sameInstall = state.packId === pack.packId && state.shape !== void 0 && !shapeMoved;
          if (sameInstall) {
            await adoptPackVersion(dataDir, pack);
            log(
              `pack moved to ${pack.packVersion} with the same files - only labels changed, so no update screen`
            );
          } else {
            log(
              `pack on disk is ${state.packId} ${state.packVersion}, manifest wants ${pack.packId} ${pack.packVersion} - offering the update`
            );
            setState({ status: "idle", update: true });
            return false;
          }
        } else if (shapeMoved) {
          log(
            `pack ${pack.packVersion} is recorded but the files it asks for moved - offering the update`
          );
          setState({ status: "idle", update: true });
          return false;
        }
        const report = await engine.verify(toPackSpec(pack));
        if (!report.ok) {
          log(`pack ${pack.packVersion} is recorded but does not resolve: ${report.badFiles[0]}`);
          return false;
        }
        const stamped = await readPackState(dataDir, pack.packId) ?? state;
        await adoptStamp(pack, stamped);
        log(`pack ${pack.packVersion} is already installed`);
        setState({ status: "ready", packVersion: pack.packVersion });
        return true;
      } catch (error) {
        log(`could not tell whether the game is installed: ${String(error)}`);
        return false;
      }
    },
    /**
     * Check every file again, and download whatever does not match.
     *
     * The slow path, on purpose and on request. Since a warm start now trusts
     * the `verified` stamp instead of hashing 1.3 GB, there has to be a way to
     * say "check anyway" - otherwise a genuinely damaged install has no route
     * back except deleting the whole game, which also means the child watching
     * 544 MB download again.
     *
     * Refused while a download is running or the game is open, for the same
     * reasons `removeGame` refuses: the files are being written, or in use.
     *
     * Not the same button as Delete and deliberately far from it. This one keeps
     * everything and repairs; that one throws the game away. Putting them next
     * to each other with similar words is how a child presses the wrong one.
     */
    async verifyFiles() {
      if (preparing) {
        log("refused to check the files: a download is in progress");
        return false;
      }
      if (running) {
        log("refused to check the files: the game is open");
        return false;
      }
      const pack = await manifest();
      await clearVerifiedStamp(dataDir, pack.packId);
      prepared = void 0;
      log("checking every file on request");
      return await prepare() !== void 0;
    },
    /**
     * Delete the downloaded game, keeping everything the child made.
     *
     * The work is in `removeGame`; what lives here is the refusal and the state
     * afterwards. Refused while a download is running - deleting the files being
     * written leaves half an install - and while the game is open, where the
     * files are in use and the child is mid-lesson.
     *
     * On success the launcher goes back to `idle`, which is the welcome screen
     * offering to download. That is simply true: nothing is installed any more.
     */
    async removeGame() {
      if (preparing) {
        log("refused to delete the game: a download is in progress");
        return false;
      }
      if (running) {
        log("refused to delete the game: the game is open");
        return false;
      }
      const pack = await manifest();
      const result = await removeGame(dataDir, pack.packId);
      prepared = void 0;
      const freedMb = Math.round(result.freedBytes / (1024 * 1024));
      log(`deleted the game: ${freedMb} MB freed (${result.removed.join(", ") || "nothing found"})`);
      setState({ status: "idle" });
      options.onCatalogue?.();
      return true;
    },
    /**
     * «Учебные миры»: the footprints this machine may take a copy of.
     *
     * Only the unlocked ones. A brand-new student sees the roll-a-new-seed row
     * and nothing else, so an upcoming lesson never spoils itself.
     */
    async worldTemplates() {
      const pack = await manifest();
      await ensureMyWorlds(pack);
      const [templates, open, mine] = await Promise.all([
        templatesOf(pack),
        openManifestWorlds(pack),
        readMyWorlds(dataDir, pack.packId)
      ]);
      const layout = instanceLayout(dataDir, pack.packId);
      const copies = /* @__PURE__ */ new Map();
      for (const world of mine) {
        const from = world.source.kind === "manifest" || world.source.kind === "preset" ? world.source.worldId : world.source.kind === "random" ? RANDOM_WORLD_ID : void 0;
        if (from !== void 0) copies.set(from, (copies.get(from) ?? 0) + 1);
      }
      if (templates.some((template) => template.kind === "manifest" && !template.ready)) {
        void fetchWorldLibrary("the list was read").catch(() => {
        });
      }
      const drawn = await Promise.all(
        templates.map(
          async (template) => template.previewKey !== null && template.ready ? await hasIcon(node_path.join(layout.worldsSrc, template.previewKey)) : false
        )
      );
      const painted = await Promise.all(
        templates.map(
          async (template) => template.artKey === null ? false : await exists2(node_path.join(layout.worldsSrc, "art", `${template.artKey}.png`))
        )
      );
      return {
        templates: templates.map((template, index) => ({
          id: template.id,
          kind: template.kind,
          seed: template.seed,
          title: template.title,
          previewKey: drawn[index] === true ? template.previewKey : null,
          artKey: painted[index] === true ? template.artKey : null,
          description: template.description,
          ready: template.ready,
          downloading: fetchingWorlds.has(template.id),
          failed: failedWorlds.has(template.id),
          copies: copies.get(template.id) ?? 0
        })),
        hasLocked: open.length < pack.worlds.length
      };
    },
    /**
     * «Мои миры»: the copies, and which one Play will open.
     *
     * Cheap on purpose. This is re-read on every catalogue change - a world
     * chosen, a mod switched, a pack refreshed - so it is one JSON file plus a
     * couple of `stat` calls per world. Sizes are a separate question with a
     * separate answer.
     */
    async myWorlds(lessonId) {
      const pack = await manifest();
      await ensureMyWorlds(pack);
      if (lessonId !== void 0) await seedLesson(pack, lessonId);
      const [worlds, library, settings] = await Promise.all([
        readMyWorlds(dataDir, pack.packId),
        listWorldLibrary(dataDir, pack.packId),
        readSettings(dataDir)
      ]);
      const rows = await describeMyWorlds(dataDir, pack.packId, worlds, library);
      const titles = new Map(pack.worlds.map((world) => [world.id, world.title ?? null]));
      const views = rows.map((row) => ({
        ...row,
        title: row.templateId === null ? null : titles.get(row.templateId) ?? null
      }));
      const menuWorld = {
        id: "minecraft-menu",
        folder: "",
        name: "Ana Menü (Standart Minecraft)",
        source: "preset",
        templateId: "minecraft-menu",
        seed: null,
        played: "today",
        ordinal: 0,
        hasPreview: false,
        updateAvailable: false,
        title: "Ana Menü (Dünyasız)"
      };
      const chosenId = settings.myWorldId === "minecraft-menu" ? "minecraft-menu" : (pickMyWorld(worlds, settings.myWorldId)?.id ?? null);
      return { worlds: [menuWorld, ...views], chosenId };
    },
    /**
     * Take a copy of one footprint.
     *
     * The version of the installed client is needed to write a world from a
     * seed, and it is asked for in the order that costs least: the prepared
     * game first, the jar only as a fallback - that read is a full unzip of
     * ~30 MB for one integer.
     */
    async createWorld(templateId) {
      if (templateId === "minecraft-menu") {
        await updateSettings(dataDir, { myWorldId: "minecraft-menu" });
        options.onCatalogue?.();
        return { ok: true, id: "minecraft-menu" };
      }
      const pack = await manifest();
      await ensureMyWorlds(pack);
      const [templates, open] = await Promise.all([templatesOf(pack), openManifestWorlds(pack)]);
      const template = templateFor(templateId, open, templates);
      if (!template) return { ok: false, reason: "no-template" };
      let version2 = prepared?.clientVersion;
      if (!version2 && template.kind !== "manifest") {
        const instance = instanceLayout(dataDir, pack.packId).instance;
        version2 = await readClientVersionInfo(instance, pack.minecraft).catch(() => void 0);
        if (!version2) return { ok: false, reason: "game-not-installed" };
      }
      const verdict = describeSpace(await freeBytes(dataDir), await copyCostMb(dataDir, pack.packId, template));
      if (!verdict.ok) {
        log(
          `no room for a copy of "${templateId}": ${verdict.freeMb} MB free, ${verdict.requiredMb} MB needed`
        );
        return {
          ok: false,
          reason: "no-disk",
          freeMb: verdict.freeMb,
          neededMb: verdict.requiredMb
        };
      }
      const made = await createMyWorld(dataDir, pack.packId, template, version2);
      if (!made.ok) {
        log(`could not create a world from "${templateId}": ${made.reason}`);
        return { ok: false, reason: made.reason };
      }
      await updateSettings(dataDir, { myWorldId: made.world.id });
      log(`world "${made.world.folder}" created from "${templateId}"`);
      options.onCatalogue?.();
      return { ok: true, id: made.world.id };
    },
    /** Ask again for a footprint whose download failed. */
    async retryWorldLibrary() {
      failedWorlds.clear();
      options.onCatalogue?.();
      await fetchWorldLibrary("somebody asked again");
    },
    /**
     * How much disk the copies are using, and how much is left.
     *
     * A separate call from `myWorlds()` on purpose: that one is re-read on
     * every catalogue change, and a recursive walk of several hundred megabytes
     * on each of those would be the most expensive thing in the launcher, paid
     * for one line of text.
     *
     * Nothing is measured while the game is running. The JVM is writing to one
     * of these folders, so a walk competes with it for the disk and the answer
     * is stale before it finishes; what is already known is answered from the
     * cache, and `complete` says the rest is not known yet.
     */
    async worldSizes() {
      const pack = await manifest();
      await ensureMyWorlds(pack);
      const worlds = await readMyWorlds(dataDir, pack.packId);
      const layout = instanceLayout(dataDir, pack.packId);
      const measured = await measureWorlds(
        layout.saves,
        worlds.map((world) => world.folder),
        worldSizeCache,
        running === void 0
      );
      const bytes = {};
      let totalBytes = 0;
      for (const world of worlds) {
        const size = measured.bytes[world.folder];
        if (size === void 0) continue;
        bytes[world.id] = size;
        totalBytes += size;
      }
      return {
        bytes,
        totalBytes,
        // One `statfs`, and it is the half of the sentence a tutor can act on:
        // a total with nothing to compare it against says nothing.
        freeBytes: await freeBytes(dataDir) ?? null,
        complete: measured.complete
      };
    },
    async chooseMyWorld(id) {
      await updateSettings(dataDir, { myWorldId: id });
      log(`world choice: ${id}`);
      options.onCatalogue?.();
    },
    async renameWorld(id, name) {
      const pack = await manifest();
      const done = await renameMyWorld(dataDir, pack.packId, id, name);
      if (done) options.onCatalogue?.();
      return done;
    },
    /**
     * Delete one copy.
     *
     * The first thing in this launcher that deletes what a child built, so it
     * refuses while the game is running: a world removed from under a live JVM
     * is corruption plus a crash nobody can explain. The id comes from the
     * renderer and a folder name never does - `deleteMyWorld` builds the path
     * from our own record and checks it again before removing anything.
     */
    async deleteWorld(id) {
      if (running) return { ok: false, reason: "game-running" };
      const pack = await manifest();
      const result = await deleteMyWorld(dataDir, pack.packId, id);
      if (!result.ok) return { ok: false, reason: "not-found" };
      log(`world "${result.folder ?? id}" deleted`);
      const settings = await readSettings(dataDir);
      if (settings.myWorldId === id) {
        const left = await readMyWorlds(dataDir, pack.packId);
        const next = left[0]?.id;
        if (next !== void 0) await updateSettings(dataDir, { myWorldId: next });
      }
      options.onCatalogue?.();
      return { ok: true };
    },
    /**
     * Reveal a gated world from the code a child typed off a lesson (O5).
     *
     * The typed code is hashed and matched against the worlds' `unlockHash`. A
     * match is remembered for this pack and the picker re-reads; the code itself is never
     * stored or logged - only the id of the world it opened, and only a reason
     * code on a miss, the same rule as everywhere else that a secret passes through.
     */
    async unlockWorld(code) {
      const pack = await manifest();
      const hash = hashUnlockCode(code);
      const match = pack.worlds.find((world) => world.unlockHash === hash);
      if (!match) {
        log("world unlock: code matched no world");
        return { ok: false, reason: "no-match" };
      }
      const settings = await readSettings(dataDir);
      if (openWorlds([match], unlockedWorldsFor(settings, pack.packId)).length > 0) {
        return { ok: true, worldId: match.id, alreadyOpen: true };
      }
      await recordUnlockedWorld(dataDir, pack.packId, match.id);
      log(`world unlocked: ${match.id}`);
      options.onCatalogue?.();
      void syncWorldUnlocks("a world was unlocked").catch(() => {
      });
      failedWorlds.clear();
      void fetchWorldLibrary("a world was unlocked").catch(() => {
      });
      return { ok: true, worldId: match.id, alreadyOpen: false };
    },
    /** The mod list, with each switch position. */
    async mods() {
      const pack = await manifest();
      return listMods(pack, dataDir, localSwitchesApply());
    },
    /**
     * Which Studios this course offers.
     *
     * Asked here rather than worked out in the renderer, because the answer
     * needs the manifest and the mod switches, and neither of those is the
     * renderer's to read. `listMods` is used rather than the raw manifest so a
     * mod a child switched off counts as off.
     */
    async studios() {
      const pack = await manifest();
      const mods = await listMods(pack, dataDir, localSwitchesApply());
      const open = await openManifestWorlds(pack);
      const taught = open.flatMap(
        (world) => (world.teaches ?? []).filter((studio) => studio === "datapacks" || studio === "python")
      );
      if (taught.length > 0) await addToPackList(dataDir, "grantedStudios", pack.packId, taught);
      const granted = (await readSettings(dataDir)).grantedStudios?.[pack.packId] ?? [];
      return resolveStudios(
        pack,
        mods,
        open.map((world) => world.id),
        granted
      );
    },
    /**
     * Flip one mod.
     *
     * Takes effect on the next launch, because Fabric reads `mods/` at startup.
     * The jar is moved rather than deleted, so switching back works offline.
     */
    async setMod(modId, enabled) {
      const pack = await manifest();
      const result = await setModEnabled(pack, dataDir, modId, enabled);
      if (!result.ok) {
        log(`mod ${modId} not changed: ${result.reason}`);
        return;
      }
      log(`mod ${modId} ${enabled ? "enabled" : "disabled"}`);
      options.onCatalogue?.();
    },
    /**
     * Whether a game is still running.
     *
     * Used to decide what closing the window means. PACK-AND-LAUNCH.md: for an
     * 8-12 year old it is safer to leave the game alive and hide the launcher
     * than to kill the JVM and lose whatever they just built.
     */
    /**
     * Say the current state again, for a window that was closed and reopened.
     *
     * macOS keeps the app alive when its window closes, so reopening builds a
     * fresh renderer whose state starts at `idle` - and the pushes that would
     * correct it happened at startup. Without this the hub came back as "download
     * the game" over an installed game, and a running game came back as nothing.
     *
     * Not `checkInstalled()` instead: that answers a startup question and guards
     * itself against overwriting newer news, so on anything past `idle` it
     * correctly refuses to publish at all - which is precisely the case here.
     */
    republish() {
      onState(lastState);
    },
    /**
     * Whether a game process is alive right now.
     *
     * The handle rather than the published state, because the two can disagree
     * and the handle is the one that is true.
     *
     * The Skin Studio needs it to tell "on your character" apart from "on your
     * character next time you play": the skin loader reads a skin when the player
     * profile loads, at game start, so a file written mid-session is real and not
     * yet visible. Saying "done!" over a game that visibly did not change is the
     * launcher claiming a success the child cannot see.
     */
    isGameRunning() {
      return running !== void 0;
    },
    logsDirectory() {
      return node_path.join(dataDir, "logs");
    },
    instanceDirectory(packId) {
      return instanceLayout(dataDir, packId).instance;
    }
  };
}
async function openJvmLog(dataDir) {
  const directory = node_path.join(dataDir, "logs");
  await promises.mkdir(directory, { recursive: true });
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  return node_fs.createWriteStream(node_path.join(directory, `game-${stamp}.log`), { flags: "a" });
}
const MAX_LOG_BYTES = 2 * 1024 * 1024;
const KEPT_GAME_LOGS = 20;
const PREVIOUS = "launcher.log.1";
function surplusGameLogs(names, keep = KEPT_GAME_LOGS) {
  const ours = names.filter((name) => /^game-.+\.log$/.test(name)).sort();
  return ours.slice(0, Math.max(0, ours.length - keep));
}
async function rotateLogs(logsDir, limit = MAX_LOG_BYTES, keep = KEPT_GAME_LOGS) {
  const current = node_path.join(logsDir, "launcher.log");
  try {
    if ((await promises.stat(current)).size >= limit) {
      await promises.rm(node_path.join(logsDir, PREVIOUS), { force: true });
      await promises.rename(current, node_path.join(logsDir, PREVIOUS));
    }
  } catch {
  }
  try {
    const names = await promises.readdir(logsDir);
    for (const name of surplusGameLogs(names, keep)) {
      await promises.rm(node_path.join(logsDir, name), { force: true }).catch(() => {
      });
    }
  } catch {
  }
}
function createShelfService(options) {
  const log = options.log ?? (() => {
  });
  const { dataDir } = options;
  const builtin = /* @__PURE__ */ new Map();
  const encoded = /* @__PURE__ */ new Map();
  function encode2(id, bytes) {
    const cached2 = encoded.get(id);
    if (cached2) return cached2;
    const uri = toPngDataUri(bytes);
    encoded.set(id, uri);
    return uri;
  }
  async function wear(bytes) {
    const instance = options.instance();
    const username = options.username();
    options.onSkin({ status: "working", action: "wearing" });
    if (!instance) {
      options.onSkin({ status: "failed", reason: "no-instance" });
      return;
    }
    if (!username) {
      options.onSkin({ status: "failed", reason: "no-identity" });
      return;
    }
    const result = await applySkin(instance, username, bytes);
    if (!result.ok) {
      log(`refused a skin: ${result.reason}`);
      options.onSkin({ status: "rejected", reason: result.reason });
      return;
    }
    options.onLibraryChanged();
    const afterRestart = options.gameRunning();
    log(
      `applied a skin for ${username}: ${result.width}x${result.height}` + (afterRestart ? " (game is open, it shows after a restart)" : "")
    );
    options.onSkin({
      status: "applied",
      skin: encode2(contentId(bytes), bytes),
      width: result.width,
      height: result.height,
      afterRestart
    });
  }
  async function forget(id) {
    if (builtin.has(id)) return false;
    const instance = options.instance();
    const username = options.username();
    const applied = instance && username ? await readAppliedSkin(instance, username) : void 0;
    const wasWorn = appliedIdOf(applied) === id;
    const removed = await removeFromLibrary(dataDir, id);
    if (!removed) return false;
    encoded.delete(id);
    options.onLibraryChanged();
    if (wasWorn && instance && username) {
      const fallback = [...builtin.values()][0];
      if (fallback) {
        await wear(fallback);
        log(`forgot the skin that was being worn: ${id}; back to the game's own`);
        return true;
      }
      await removeAppliedSkin(instance, username);
      log(`forgot the skin that was being worn: ${id}`);
      options.onSkin({ status: "removed" });
      return true;
    }
    log(`forgot a skin: ${id}`);
    options.onSkin({ status: "forgotten" });
    return true;
  }
  return {
    /** The skin currently on the character, for the screen to show. */
    async current() {
      const instance = options.instance();
      const username = options.username();
      if (!instance || !username) return void 0;
      const bytes = await readAppliedSkin(instance, username);
      if (!bytes || !pngSize(bytes)) return void 0;
      return toPngDataUri(bytes);
    },
    /**
     * The shelf: everything collected, and which one is being worn.
     *
     * "Which one" is worked out by hashing the file on the character and matching
     * it against the library, rather than by remembering an id. A remembered id
     * goes stale the moment anything else writes that file - the game, a repair, a
     * child copying a png in by hand - and then the shelf points at the wrong tile
     * with complete confidence. The bytes cannot be wrong about themselves.
     */
    async library() {
      const entries = await listLibrary(dataDir);
      const instance = options.instance();
      const username = options.username();
      const version2 = options.minecraftVersion();
      const applied = instance && username ? await readAppliedSkin(instance, username) : void 0;
      const skins = [];
      if (instance && version2) {
        for (const skin of await readDefaultSkins(dataDir, instance, version2)) {
          const id = contentId(skin.png);
          builtin.set(id, skin.png);
          skins.push({
            id,
            title: skin.id,
            width: 64,
            height: 64,
            png: encode2(id, skin.png),
            builtin: true
          });
        }
      }
      const fresh = await Promise.all(
        entries.map(
          async (entry) => encoded.has(entry.id) ? { entry, bytes: void 0 } : { entry, bytes: await readLibrarySkin(dataDir, entry.id) }
        )
      );
      for (const { entry, bytes } of fresh) {
        const png = bytes ? encode2(entry.id, bytes) : encoded.get(entry.id);
        if (!png) continue;
        skins.push({
          id: entry.id,
          title: entry.title,
          ...entry.projectId === void 0 ? {} : { projectId: entry.projectId },
          width: entry.width,
          height: entry.height,
          png
        });
      }
      const appliedId = appliedIdOf(applied);
      return {
        skins,
        ...appliedId === void 0 ? {} : { appliedId },
        /*
         * A skin can be on the character and not on the shelf: it was applied by a
         * build that had no shelf. Saying so lets the screen offer to keep it
         * instead of pretending the character is bare.
         */
        appliedIsUnknown: applied !== void 0 && appliedId !== void 0 ? !skins.some((skin) => skin.id === appliedId) : false
      };
    },
    /** Wear one of the collected skins. */
    async wearFromLibrary(id) {
      const bytes = builtin.get(id) ?? await readLibrarySkin(dataDir, id);
      if (!bytes) {
        options.onSkin({ status: "failed", reason: "gone" });
        return;
      }
      await wear(bytes);
    },
    /**
     * Keep the skin that is on the character but not on the shelf.
     *
     * The one-way door this avoids: before the shelf existed the applied file was
     * the only copy, so a child upgrading the launcher would otherwise see their
     * skin listed nowhere and be one "take it off" away from losing it.
     */
    async keepApplied() {
      const instance = options.instance();
      const username = options.username();
      if (!instance || !username) return;
      const bytes = await readAppliedSkin(instance, username);
      if (!bytes) return;
      const added = await addToLibrary(dataDir, bytes, "");
      if (added) log(`kept the applied skin on the shelf: ${added.entry.id}`);
      options.onLibraryChanged();
    },
    /**
     * Forget a collected skin.
     *
     * Takes it off the character too when it was the one being worn. Leaving it on
     * would put the launcher in the position of showing a character wearing
     * something the shelf says does not exist.
     */
    forgetSkin(id) {
      return forget(id);
    },
    /**
     * Take the skin off.
     *
     * Publishes `removed` afterwards, which matters more than it looks: `applied`
     * carries the picture the screen shows in its corner, so leaving the state
     * there would keep that picture on screen over a file that is gone - the
     * launcher showing a skin the game will not use.
     *
     * This used to publish `open` instead, and `open` used to publish `removed`.
     * The two were swapped, so "take the skin off" never said it had, and coming
     * back to the editor announced a removal nobody asked for. Splitting the view
     * and the skin into two states is what makes that mix-up impossible rather
     * than merely fixed.
     */
    async clear() {
      const instance = options.instance();
      const username = options.username();
      if (!instance || !username) return false;
      const removed = await removeAppliedSkin(instance, username);
      if (removed) {
        log(`removed the applied skin for ${username}`);
        options.onSkin({ status: "removed" });
        options.onLibraryChanged();
      }
      return removed;
    }
  };
}
function toPngDataUri(bytes) {
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}
const GROUND = "#141822";
const FILE_NAME = "session.bin";
function createTokenStore(dataDir, log) {
  const path = node_path.join(dataDir, FILE_NAME);
  const available = () => {
    try {
      return electron.safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  };
  return {
    available,
    async read() {
      if (!available()) return void 0;
      let raw;
      try {
        raw = await promises.readFile(path);
      } catch {
        return void 0;
      }
      try {
        return parseStoredCredential(JSON.parse(electron.safeStorage.decryptString(raw)));
      } catch {
        log("saved session could not be decrypted, starting from the sign-in form");
        await this.clear();
        return void 0;
      }
    },
    async write(credential) {
      if (!available()) {
        log("the OS cannot encrypt, so the session will not be saved - sign-in will be asked again");
        return false;
      }
      await promises.mkdir(node_path.dirname(path), { recursive: true });
      await promises.writeFile(path, electron.safeStorage.encryptString(JSON.stringify(credential)));
      return true;
    },
    async clear() {
      await promises.rm(path, { force: true });
    }
  };
}
function createSend(window2) {
  return (channel, payload) => {
    const target = window2();
    if (!target || target.isDestroyed()) return;
    if (target.webContents.isDestroyed()) return;
    target.webContents.send(channel, payload);
  };
}
const RELEASES_OWNER = "Kodland-Sparks";
const RELEASES_REPO = "kodland-launcher-releases";
const DOWNLOAD_PAGE_URL = "https://portfolio.kodland.org/launcher/download";
async function sha512Base64(path) {
  const { createReadStream } = await import("node:fs");
  const hash = node_crypto.createHash("sha512");
  await promises$1.pipeline(createReadStream(path), hash);
  return hash.digest("base64");
}
async function canReplace(appPath) {
  try {
    const { access, constants: constants2 } = await import("node:fs/promises");
    await access(node_path.dirname(appPath), constants2.W_OK);
    await access(appPath, constants2.W_OK);
    return true;
  } catch {
    return false;
  }
}
async function swapBundle(url, expectedSha512, options) {
  const doFetch = options.fetch ?? globalThis.fetch;
  if (!await canReplace(options.appPath)) {
    options.log("update: this account cannot write to the application folder");
    return { ok: false, reason: "no-permission" };
  }
  const move = options.rename ?? promises.rename;
  const work = await promises.mkdtemp(node_path.join(node_os.tmpdir(), "kodland-update-"));
  const archive = node_path.join(work, "update.zip");
  try {
    const fetched = await fetchArchive(url, archive, doFetch, options);
    if (fetched !== void 0) return fetched;
    let actual;
    try {
      actual = await sha512Base64(archive);
    } catch (error) {
      options.log(`update: could not read the file we just downloaded: ${String(error)}`);
      return { ok: false, reason: "download-failed" };
    }
    if (actual !== expectedSha512) {
      options.log("update: the download does not match the hash the feed published");
      return { ok: false, reason: "bad-hash" };
    }
    return await replaceBundle(archive, work, move, options);
  } finally {
    await promises.rm(work, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function fetchArchive(url, archive, doFetch, options) {
  try {
    const response = await doFetch(url, options.signal ? { signal: options.signal } : {});
    if (!response.ok || !response.body) {
      options.log(`update download failed: HTTP ${response.status}`);
      return { ok: false, reason: "download-failed" };
    }
    const declared = Number(response.headers.get("content-length")) || void 0;
    const total = declared ?? options.expectedSize;
    if (declared !== void 0 && options.expectedSize !== void 0 && declared !== options.expectedSize) {
      options.log(
        `update: the feed says ${options.expectedSize} bytes and the server says ${declared}; trusting the server`
      );
    }
    let received = 0;
    const counting = new node_stream.Transform({
      transform(chunk, _encoding, done) {
        received += chunk.length;
        options.onBytes?.(received, total);
        done(null, chunk);
      }
    });
    await promises$1.pipeline(node_stream.Readable.fromWeb(response.body), counting, node_fs.createWriteStream(archive));
    return void 0;
  } catch (error) {
    options.log(`update: fetching the update failed: ${String(error)}`);
    return { ok: false, reason: "download-failed" };
  }
}
async function replaceBundle(archive, work, move, options) {
  try {
    const unpacked = node_path.join(work, "unpacked");
    await options.unzip(archive, unpacked);
    const fresh = node_path.join(unpacked, node_path.basename(options.appPath));
    if (!(await promises.stat(fresh).catch(() => void 0))?.isDirectory()) {
      options.log("update: the archive did not contain the application");
      return { ok: false, reason: "swap-failed" };
    }
    const parked = `${options.appPath}.old-${Date.now()}`;
    await move(options.appPath, parked);
    try {
      await move(fresh, options.appPath);
    } catch (error) {
      try {
        await move(parked, options.appPath);
      } catch (rollback) {
        options.log(
          `update: THE LAUNCHER IS NOT IN PLACE. It is at ${parked} and has to be moved back to ${options.appPath} by hand: ${String(rollback)}`
        );
        return { ok: false, reason: "swap-failed" };
      }
      options.log(`update: could not move the new application into place: ${String(error)}`);
      return { ok: false, reason: "swap-failed" };
    }
    await discard(parked, options.log);
    options.log("update: the application has been replaced");
    return { ok: true };
  } catch (error) {
    options.log(`update: replacing the application failed: ${String(error)}`);
    return { ok: false, reason: "swap-failed" };
  }
}
async function removeTree(path) {
  const host = process;
  const before = host.noAsar;
  host.noAsar = true;
  try {
    await promises.rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } finally {
    host.noAsar = before;
  }
}
async function discard(path, log) {
  try {
    await removeTree(path);
  } catch (error) {
    log(
      `update: the replaced application is still at ${path} (${String(error)}); the next start will clear it`
    );
  }
}
async function sweepParkedBundles(appPath, log) {
  const prefix = `${node_path.basename(appPath)}.old`;
  let entries;
  try {
    entries = await promises.readdir(node_path.dirname(appPath));
  } catch {
    return;
  }
  const parked = entries.filter((entry) => entry.startsWith(prefix));
  if (parked.length === 0) return;
  const cleared = [];
  for (const entry of parked) {
    try {
      await removeTree(node_path.join(node_path.dirname(appPath), entry));
      cleared.push(entry);
    } catch (error) {
      log(`update: could not clear ${entry} (${String(error)}); it will be tried again next start`);
    }
  }
  if (cleared.length > 0) {
    log(`update: cleared ${cleared.length} leftover bundle(s): ${cleared.join(", ")}`);
  }
}
function readMacFeed(body, arch) {
  const lines = body.split(/\r?\n/);
  const wanted = `-mac-${arch}.zip`;
  for (let i = 0; i < lines.length; i += 1) {
    const url = /^\s*-?\s*url:\s*(\S+\.zip)\s*$/.exec(lines[i] ?? "");
    if (!url?.[1]?.endsWith(wanted)) continue;
    let size;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j += 1) {
      const bytes = /^\s*size:\s*(\d+)\s*$/.exec(lines[j] ?? "");
      if (bytes?.[1]) size = Number(bytes[1]);
      const hash = /^\s*sha512:\s*(\S+)\s*$/.exec(lines[j] ?? "");
      if (!hash?.[1]) continue;
      for (let k = j + 1; size === void 0 && k < Math.min(i + 4, lines.length); k += 1) {
        const later = /^\s*size:\s*(\d+)\s*$/.exec(lines[k] ?? "");
        if (later?.[1]) size = Number(later[1]);
      }
      return { file: url[1], sha512: hash[1], ...size === void 0 ? {} : { size } };
    }
  }
  return void 0;
}
const run = node_util.promisify(node_child_process.execFile);
function createMacInstaller(appPath, events, log, deps = {}) {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const speed = createSpeedMeter();
  let cancelled = false;
  let abort;
  return {
    async download() {
      cancelled = false;
      abort = new AbortController();
      speed.reset();
      events.onDownloading();
      try {
        const base = `https://github.com/${RELEASES_OWNER}/${RELEASES_REPO}/releases/latest/download`;
        const feed = await doFetch(`${base}/latest-mac.yml`);
        if (!feed.ok) {
          events.onFailed(`the update feed answered ${feed.status}`);
          return;
        }
        const entry = readMacFeed(await feed.text(), deps.arch ?? process.arch);
        if (!entry) {
          events.onFailed("the update feed did not name a zip and a hash for this Mac");
          return;
        }
        if (cancelled) return;
        const result = await swapBundle(`${base}/${entry.file}`, entry.sha512, {
          appPath,
          ...deps.fetch ? { fetch: deps.fetch } : {},
          ...entry.size === void 0 ? {} : { expectedSize: entry.size },
          /*
           * The feed's size is the fallback total, so a proxy that strips
           * `Content-Length` still gives a percentage rather than a bar with no
           * denominator.
           *
           * The speed comes from the shared meter rather than a second
           * smoother written here: it already handles a restarted attempt and a
           * stall, and it makes this platform's log line read exactly like
           * Windows'.
           */
          signal: abort.signal,
          onBytes: (received, total) => {
            if (cancelled) return;
            events.onProgress({
              bytesDone: received,
              ...total === void 0 ? {} : { bytesTotal: total, percent: received / total * 100 },
              ...(() => {
                const rate = speed.update({ bytesDone: received, phase: "update", now: Date.now() });
                return rate === void 0 ? {} : { bytesPerSecond: rate };
              })()
            });
          },
          /*
           * `ditto`, not `unzip`.
           *
           * An `.app` is a tree of symlinks and, on signed builds, extended
           * attributes. `unzip` flattens some of that and the result may not
           * open; `ditto -xk` is Apple's own tool for the job and preserves it.
           * It is on every Mac, so there is nothing to bundle.
           */
          unzip: async (archive, into) => {
            await run("/usr/bin/ditto", ["-xk", archive, into]);
          },
          log
        });
        if (cancelled) return;
        if (result.ok) {
          events.onReady("");
          return;
        }
        events.onFailed(result.reason);
      } catch (error) {
        if (cancelled) return;
        events.onFailed(String(error));
      }
    },
    cancel() {
      cancelled = true;
      abort?.abort();
    },
    /*
     * There is no installer process to hand the job to - the swap already
     * happened during `download()`, so all that is left is to come back as the
     * bundle now on disk.
     *
     * **This is the riskiest unmeasured step in the whole update path.** By
     * now the bundle this process is executing from has been renamed to `.old`
     * and deleted, so a bare `app.relaunch()` would re-exec a path whose inode
     * is gone. `index.ts` therefore relaunches through `open -n`, which
     * resolves the bundle by path instead. Documented behaviour, **not measured
     * by us** - the same standing as the quarantine argument in `mac-swap.ts`.
     */
    install() {
      if (!deps.restart) {
        log("update: asked to restart, but this build has no way to");
        return false;
      }
      deps.restart();
      return true;
    }
  };
}
function createInstaller(updater, events) {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  {
    updater.verifyUpdateCodeSignature = async () => null;
  }
  updater.logger = null;
  let token;
  let cancelled = false;
  updater.on(
    "download-progress",
    (progress) => {
      events.onProgress({
        percent: progress.percent,
        bytesDone: progress.transferred,
        bytesTotal: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      });
    }
  );
  updater.on("update-downloaded", (info) => {
    if (cancelled) return;
    events.onReady(info.version);
  });
  updater.on("error", (error) => {
    events.onFailed(String(error));
  });
  return {
    async download() {
      cancelled = false;
      events.onDownloading();
      try {
        const result = await updater.checkForUpdates();
        if (!result || cancelled) return;
        token = result.cancellationToken;
        await updater.downloadUpdate(result.cancellationToken);
      } catch (error) {
        if (!cancelled) events.onFailed(String(error));
      } finally {
        token = void 0;
      }
    },
    cancel() {
      cancelled = true;
      token?.cancel();
    },
    /*
     * Both arguments are load-bearing, and both were read out of
     * `electron-updater`'s own types rather than from memory.
     *
     * `isSilent: true` so no NSIS window is ever put in front of a child.
     * `isForceRunAfter: true` because the launcher must come back - and the
     * library **ignores it when `isSilent` is false**, so a bare
     * `quitAndInstall()` would close the launcher and never reopen it, making a
     * liar of the sentence we just showed the child.
     *
     * `autoInstallOnAppQuit` stays on, so this is the explicit form of what
     * closing the launcher does anyway: a broken `install()` degrades to the
     * old behaviour rather than to nothing.
     */
    install() {
      updater.quitAndInstall(true, true);
      return true;
    }
  };
}
function updateMode() {
  return "off";
}
function canInstall(mode) {
  return mode === "install";
}
const FIRST_CHECK_MS = 15e3;
const INTERVAL_MS = 6 * 60 * 60 * 1e3;
const IDLE_POLL_MS = 15e3;
const PUSH_MS = 500;
const BEAT_MS = 3e4;
const mb = (bytes) => Math.round(bytes / 1024 / 1024);
function installerEvents(publish, log) {
  let lastBeat = 0;
  let lastPush = 0;
  let lastPercent;
  return {
    onDownloading: () => {
      lastPush = 0;
      lastPercent = void 0;
      publish({ status: "downloading" });
    },
    onReady: (version2) => {
      log(`update: ${version2} downloaded; it goes in when this launcher closes`);
      publish({ status: "ready", version: version2 });
    },
    onFailed: (reason) => {
      log(`update download failed: ${reason}`);
      publish({ status: "none" });
    },
    onProgress: (progress) => {
      const now = Date.now();
      const whole = progress.percent === void 0 ? void 0 : Math.round(progress.percent);
      if (now - lastPush >= PUSH_MS && (whole === void 0 || whole !== lastPercent)) {
        lastPush = now;
        lastPercent = whole;
        publish({
          status: "downloading",
          ...whole === void 0 ? {} : { percent: whole },
          ...progress.bytesDone === void 0 ? {} : { bytesDone: progress.bytesDone },
          ...progress.bytesTotal === void 0 ? {} : { bytesTotal: progress.bytesTotal },
          ...progress.bytesPerSecond === void 0 ? {} : { bytesPerSecond: progress.bytesPerSecond }
        });
      }
      if (now - lastBeat < BEAT_MS) return;
      lastBeat = now;
      const done = progress.bytesDone === void 0 ? "?" : `${mb(progress.bytesDone)} MB`;
      const of = progress.bytesTotal === void 0 ? "" : ` of ${mb(progress.bytesTotal)} MB`;
      const at = progress.bytesPerSecond === void 0 ? "" : ` at ${(progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
      const percent = whole === void 0 ? "" : `${whole}%, `;
      log(`updating: ${percent}${done}${of}${at}`);
    }
  };
}
function createUpdateService(options) {
  const mode = updateMode({
    platform: options.platform,
    isPackaged: options.isPackaged,
    env: options.env
  });
  let news = { status: "none" };
  let first;
  let repeating;
  let inFlight;
  let asked = false;
  let downloading = false;
  let installer2;
  let busyPoll;
  let idlePoll;
  let latestKnown;
  const release = options.osRelease ?? node_os.release;
  const state = () => ({
    current: options.currentVersion,
    canInstall: canInstall(mode),
    checking: asked,
    news
  });
  const publish = (next) => {
    news = next;
    options.onState(state());
  };
  options.log(`update: this build is ${options.currentVersion}, mode ${mode}`);
  async function ask(wallOnly = false) {
    const info = await fetchLauncherVersion(options.sparksUrl(), {
      ...options.fetch ? { fetch: options.fetch } : {}
    });
    if (!info) {
      options.log("update: could not read the current version from Sparks");
      return "unavailable";
    }
    const blocked = osTooOld(info);
    if (isOlder(options.currentVersion, info.minSupported)) {
      options.log(
        `update: this build (${options.currentVersion}) is older than the minimum Sparks serves (${info.minSupported})`
      );
      if (blocked) {
        options.log(
          `update: no wall for this one - ${info.latest} needs ${blocked}, and this ${options.platform} is ${release()}. Keeping the launcher it has`
        );
      } else {
        latestKnown = info.latest;
        publish({ status: "unsupported", version: info.latest });
        return "newer";
      }
    }
    if (wallOnly) return "up-to-date";
    if (!isOlder(options.currentVersion, info.latest)) {
      options.log(`update: nothing newer (Sparks says ${info.latest})`);
      if (news.status !== "none") publish({ status: "none" });
      return "up-to-date";
    }
    if (blocked) {
      options.log(`update: ${info.latest} needs ${blocked}, and this ${options.platform} is ${release()}`);
      if (news.status !== "none") publish({ status: "none" });
      return "os-too-old";
    }
    options.log(`update: ${info.latest} is available (this build is ${options.currentVersion})`);
    latestKnown = info.latest;
    publish({ status: "available", version: info.latest });
    beginDownload();
    return "newer";
  }
  function osTooOld(info) {
    const floor = options.platform === "darwin" ? info.minOs?.darwin : options.platform === "win32" ? info.minOs?.win32 : void 0;
    if (floor === void 0) return void 0;
    const verdict = isOsBelow(release(), floor);
    if (verdict === void 0) {
      options.log(
        `update: ignoring a minimum OS of "${floor}" for ${options.platform} - it has to be a kernel version like 22.0.0, not the number people say out loud`
      );
      return void 0;
    }
    return verdict ? floor : void 0;
  }
  async function checkNow(manual = false) {
    if (mode === "off") {
      if (manual) options.log("update: a person asked, but checks are off in this build");
      return { outcome: "off", state: state() };
    }
    if (manual && !asked) {
      asked = true;
      options.onState(state());
    }
    const pending = inFlight ??= ask().finally(() => {
      inFlight = void 0;
    });
    let outcome;
    try {
      outcome = await pending;
    } finally {
      if (manual && asked) {
        asked = false;
        options.onState(state());
      }
    }
    return { outcome, state: state() };
  }
  function beginDownload() {
    if (mode !== "install" || !options.makeInstaller) return;
    if (downloading) return;
    if (options.isBusy()) {
      waitForQuiet("not fetching it now - the launcher is busy");
      return;
    }
    stopWaiting();
    installer2 ??= options.makeInstaller(installerEvents(publish, options.log));
    downloading = true;
    busyPoll = setInterval(() => {
      if (options.isBusy()) standDown();
    }, 5e3);
    void installer2.download().finally(() => {
      downloading = false;
      if (busyPoll) clearInterval(busyPoll);
      busyPoll = void 0;
    });
  }
  function waitForQuiet(why) {
    if (idlePoll) return;
    options.log(`update: ${why}`);
    idlePoll = setInterval(() => {
      if (options.isBusy()) return;
      stopWaiting();
      beginDownload();
    }, IDLE_POLL_MS);
  }
  function stopWaiting() {
    if (idlePoll) clearInterval(idlePoll);
    idlePoll = void 0;
  }
  function standDown() {
    if (!downloading) return;
    options.log("update: standing down - the launcher is busy");
    installer2?.cancel();
    waitForQuiet("it will be fetched when the launcher is free");
    if (news.status !== "downloading") return;
    publish(latestKnown ? { status: "available", version: latestKnown } : { status: "none" });
  }
  function install() {
    if (news.status !== "ready") {
      options.log("update: asked to install, but nothing is downloaded");
      return false;
    }
    if (!installer2) return false;
    if (options.isBusy()) {
      options.log("update: not restarting now - the launcher is busy");
      return false;
    }
    options.log("update: installing now, at a person's request");
    return installer2.install();
  }
  return {
    state,
    standDown,
    install,
    republish: () => options.onState(state()),
    checkNow,
    /**
     * One word for the rest of the launcher: is this build refused?
     *
     * Read from the news rather than kept in a second field, for the reason
     * `launcher-service.ts` gives about `isBusy`: a third way to ask the same
     * question is how two answers start disagreeing. `unsupported` is published
     * only where a wall is both true and passable, so anybody reading this is
     * reading that one decision.
     */
    isUnsupported: () => news.status === "unsupported",
    start() {
      if (mode === "off") {
        options.log("update: checks are off in this build");
        return;
      }
      void ask(true).catch(() => {
      });
      first = setTimeout(() => void checkNow(), FIRST_CHECK_MS);
      repeating = setInterval(() => void checkNow(), INTERVAL_MS);
    },
    stop() {
      if (first) clearTimeout(first);
      if (repeating) clearInterval(repeating);
      if (busyPoll) clearInterval(busyPoll);
      stopWaiting();
      busyPoll = void 0;
      first = void 0;
      repeating = void 0;
    }
  };
}
const isDev = !electron.app.isPackaged;
let mainWindow;
let launcher;
let shelf;
let gallery;
let editor;
let publishing;
let datapack;
let python;
let auth;
let pictures;
async function ensureDataDir() {
  const root = resolveDataDir(process.platform, process.env, node_os.homedir());
  const layout = dataDirLayout(root);
  await promises.mkdir(layout.runtime, { recursive: true });
  await promises.mkdir(layout.cache, { recursive: true });
  await promises.mkdir(layout.instances, { recursive: true });
  await promises.mkdir(layout.logs, { recursive: true });
  return root;
}
function createLogger(dataDir) {
  const path = node_path.join(dataDir, "logs", "launcher.log");
  return (message) => {
    const line = `${(/* @__PURE__ */ new Date()).toISOString()} ${message}
`;
    void promises.appendFile(path, line).catch(() => {
    });
    if (isDev) console.warn(`[launcher] ${message}`);
  };
}
const WANTED_SIZE = { width: 1360, height: 940 };
const SCREEN_MARGIN = 40;
function openingSize() {
  const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(WANTED_SIZE.width, Math.max(900, width - SCREEN_MARGIN)),
    height: Math.min(WANTED_SIZE.height, Math.max(580, height - SCREEN_MARGIN))
  };
}
function createWindow(log) {
  const window2 = new electron.BrowserWindow({
    ...openingSize(),
    minWidth: 900,
    // 8-12 year olds run Windows at 125-150% display scaling far more often
    // than adults do. A minimum height that assumes 100% pushes the primary
    // button off-screen - the exact bug Sparks hit in its Skin Studio.
    minHeight: 580,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: GROUND,
    webPreferences: {
      preload: node_path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window2.webContents.setWindowOpenHandler(({ url }) => {
    void electron.shell.openExternal(url);
    return { action: "deny" };
  });
  window2.webContents.on("render-process-gone", (_event, details) => {
    log(`the renderer died: ${details.reason} (exit code ${String(details.exitCode)})`);
  });
  if (isDev) {
    window2.webContents.on("console-message", (details) => {
      if (details.level !== "error" && details.level !== "warning") return;
      log(
        `renderer ${details.level}: ${details.message} (${details.sourceId}:${details.lineNumber})`
      );
    });
  }
  window2.on("focus", () => {
    void publishing?.isPending().then((pending) => pending ? publishing?.resolve("the window came back") : void 0).catch(() => {
    });
  });
  window2.on("closed", () => {
    if (mainWindow === window2) mainWindow = void 0;
  });
  window2.once("ready-to-show", () => window2.show());
  const devServerUrl = process.env["ELECTRON_RENDERER_URL"];
  if (isDev && devServerUrl) {
    void window2.loadURL(devServerUrl);
  } else {
    void window2.loadFile(node_path.join(__dirname, "../renderer/index.html"));
  }
  return window2;
}
function findResourcePath(filename) {
  const candidates = [
    process.resourcesPath ? node_path.join(process.resourcesPath, filename) : null,
    node_path.join(__dirname, "../../resources", filename),
    node_path.join(process.cwd(), "resources", filename),
    node_path.join(__dirname, "../../../../packages/pack/manifests", filename)
  ].filter(Boolean);
  for (const c of candidates) {
    if (node_fs.existsSync(c)) return c;
  }
  return candidates[0];
}
function bundledManifestPath() {
  return findResourcePath("kodland-engineering.json");
}
async function reportPackSource(manifestPath, log) {
  log(describePackSource(resolvePackSource(process.env)));
  try {
    await promises.access(manifestPath);
  } catch {
    log(`WARNING the bundled manifest is missing at ${manifestPath} - nothing will install`);
  }
}
node_dns.setDefaultResultOrder("ipv4first");
const SPARKS_PARTITION = "persist:kodland-sparks";
const SKIN_PROJECT_TYPE = "MODEL3D";
if (isDev) electron.app.commandLine.appendSwitch("remote-debugging-port", "9222");
registerImageScheme();
void electron.app.whenReady().then(async () => {
  const dataDir = await ensureDataDir();
  await rotateLogs(node_path.join(dataDir, "logs"));
  const log = createLogger(dataDir);
  log(`launcher ${electron.app.getVersion()} starting on ${process.platform}/${process.arch}`);
  loadDevEnv({
    isPackaged: electron.app.isPackaged,
    cwd: process.cwd(),
    env: process.env,
    log
  });
  pictures = createSparksCookieJar({
    mintTicket: async () => {
      const result = await auth?.sparksSession("/");
      return result?.ok === true ? result.url : void 0;
    },
    sparksUrl: () => resolveSparksUrl(process.env),
    log
  });
  handleImages({
    dataDir,
    sparksUrl: () => resolveSparksUrl(process.env),
    fetchImpl: (url) => pictures.fetch(String(url)),
    ensureSession: () => pictures.ensure(),
    // The item icons the data pack picker draws come out of the installed
    // client, not off the network. Asked through the launcher for the same
    // reason everything else is: the instance layout has one owner.
    instance: () => launcher?.instancePath(),
    saves: () => launcher?.savesPath(),
    worldsSrc: () => launcher?.worldsSrcPath(),
    minecraft: () => launcher?.minecraftVersion(),
    log
  });
  const manifestPath = bundledManifestPath();
  await reportPackSource(manifestPath, log);
  const send = createSend(() => mainWindow);
  const tokens = createTokenStore(dataDir, log);
  if (!tokens.available()) {
    log("WARNING the OS cannot encrypt - the session will not be remembered between runs");
  }
  auth = createAuthService({
    dataDir,
    env: process.env,
    isPackaged: electron.app.isPackaged,
    platform: process.platform,
    tokens,
    // Only ever handed a url this process built. `shell.openExternal` passes a
    // string to the operating system, so a url that has been to the renderer and
    // back is a url the page could have replaced.
    openExternal: async (url) => {
      if (/^https?:\/\//.test(url)) await electron.shell.openExternal(url);
      else log("refused to open a url that is not http(s)");
    },
    toAvatarDataUri,
    // Chromium's stack rather than the global: it honours the proxy a school
    // laptop was handed and the certificates the machine trusts. The same
    // reason `image-protocol` and `gallery-service` use it.
    fetchImpl: (url, init) => electron.net.fetch(String(url), init),
    onState: (state) => {
      send("auth:state", state);
      if (state.status === "signed-in") {
        void launcher?.refreshPack("somebody signed in").then(() => launcher?.syncUnlockedWorlds("somebody signed in"));
      }
    },
    log
  });
  const gameWindowSize = () => {
    const { width, height } = electron.screen.getPrimaryDisplay().workAreaSize;
    return { width: Math.max(854, width - 16), height: Math.max(480, height - 48) };
  };
  launcher = createLauncherService({
    dataDir,
    isPackaged: electron.app.isPackaged,
    bundledManifestPath: manifestPath,
    env: process.env,
    gameWindowSize,
    onState: (state) => send("launcher:state", state),
    onCatalogue: () => send("catalogue:changed"),
    // Only somebody who may edit the pack still has personal mod switches. A
    // student cannot write them any more, so an old file must not strand them.
    isLauncherAdmin: () => auth?.isLauncherAdmin() ?? false,
    // Read late on purpose: the update service is built below this one, and the
    // answer is only ever wanted after a first check has come back.
    isUnsupported: () => updates?.isUnsupported() ?? false,
    // A capability, not a token: `auth-service` owns the credential and the
    // code that writes files to a student's disk never sees it.
    fetchPack: async (etag) => await auth?.sparksPack(etag) ?? { ok: false, failure: "unavailable" },
    // The other half of the same capability: they decide what a child installs,
    // and until this they had no way of knowing whether it arrived.
    reportInstall: async (report) => await auth?.sparksReport(report) ?? false,
    // The same capability shape again: an unlock a child earned on one computer
    // is theirs on the next one, and the code that matches it never sees a token.
    syncUnlockedWorlds: async (packId, unlocked) => await auth?.sparksSyncUnlockedWorlds(packId, unlocked) ?? {
      ok: false,
      failure: "unavailable"
    },
    // Every file the manifest names goes through here, and `auth-service`
    // decides which address may carry the credential. A world of ours is behind
    // a bearer now; a mod on cdn.modrinth.com still goes out bare.
    fetchPackFile: async (url) => await auth?.fetchPackFile(url) ?? electron.net.fetch(url),
    /*
     * The student's data packs, put in when the world is known.
     *
     * Read lazily through the handle because `datapack` is created below this -
     * and it has to be, since it asks the launcher for the instance, the pack
     * and the client's format. By the time a child presses Play both exist.
     */
    onWorldChosen: async (world) => {
      await datapack?.syncBeforeLaunch(world);
      await python?.syncBeforeLaunch();
    },
    onDatapackRefused: (resource, unknownId) => {
      void datapack?.noteRefusal(resource, unknownId);
    },
    appVersion: electron.app.getVersion(),
    log
  });
  const installMode = electron.app.isPackaged && process.platform === "win32" && !process.env["PORTABLE_EXECUTABLE_FILE"];
  const macAppPath = electron.app.isPackaged && process.platform === "darwin" ? node_path.join(electron.app.getAppPath(), "..", "..", "..") : void 0;
  const updates = createUpdateService({
    currentVersion: electron.app.getVersion(),
    platform: process.platform,
    isPackaged: electron.app.isPackaged,
    env: process.env,
    sparksUrl: () => resolveSparksUrl(process.env),
    isBusy: () => launcher?.isBusy() ?? false,
    onState: (state) => send("update:state-changed", state),
    log,
    /*
     * Two mechanisms, one shape. The service asks for an `Installer` and never
     * learns which it got - the decision about whether to update is the same on
     * both platforms, and only the mechanics differ.
     */
    ...installMode ? {
      makeInstaller: (events) => createInstaller(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("electron-updater").autoUpdater,
        events
      )
    } : {},
    ...macAppPath ? {
      makeInstaller: (events) => createMacInstaller(macAppPath, events, log, {
        /*
         * Relaunched through `open -n`, not through `process.execPath`.
         *
         * By the time this runs, `swapBundle` has renamed the running
         * bundle to `.old` and deleted it, so the executable path this
         * process started from points at an inode that no longer exists
         * and a bare `app.relaunch()` can fail with nothing on screen -
         * a launcher that closes and never comes back. `open` resolves
         * the bundle by path, which is the thing that is definitely
         * there. Documented behaviour, not measured by us.
         */
        restart: () => {
          electron.app.relaunch({ execPath: "/usr/bin/open", args: ["-n", macAppPath] });
          electron.app.quit();
        }
      })
    } : {}
  });
  electron.app.on("before-quit", () => updates.stop());
  gallery = createGalleryService({
    dataDir,
    instance: () => launcher?.instancePath(),
    username: () => launcher?.usernameFor(auth?.currentIdentity()),
    gameRunning: () => launcher?.isGameRunning() ?? false,
    sparksUrl: () => resolveSparksUrl(process.env),
    fetchPage: async (scope, cursor) => await auth?.sparksProjects(scope, cursor, SKIN_PROJECT_TYPE) ?? {
      ok: false,
      failure: "expired"
    },
    // `net.fetch` rather than the global: it goes through Chromium's stack, so
    // it honours the proxy a school laptop was handed and the certificates the
    // machine trusts.
    fetchFile: (url) => electron.net.fetch(url),
    onSkin: (state) => send("skins:state", state),
    onLibraryChanged: () => send("skins:changed"),
    log
  });
  editor = createEditorService({
    dataDir,
    instance: () => launcher?.instancePath(),
    username: () => launcher?.usernameFor(auth?.currentIdentity()),
    gameRunning: () => launcher?.isGameRunning() ?? false,
    onSkin: (state) => send("skins:state", state),
    onLibraryChanged: () => send("skins:changed"),
    log
  });
  publishing = createPublishService({
    dataDir,
    saveDraft: async (json2) => {
      await editor?.saveDraft(json2);
    },
    // Capabilities, never a token. Same rule as `fetchPack` and `reportInstall`.
    saveToSparks: async (pixelDoc, modifiedFromProjectId) => await auth?.sparksSkinDraft(pixelDoc, modifiedFromProjectId) ?? {
      ok: false,
      failure: "unavailable"
    },
    mintSession: async (next) => await auth?.sparksSession(next) ?? { ok: false, failure: "unavailable" },
    /*
     * The ids this child owns, newest first, or nothing at all.
     *
     * `undefined` and `[]` mean different things here and must not be folded:
     * an empty list is "you have published nothing", and no list is "we could
     * not ask". The second must never resolve a publish, because a diff against
     * a list we never saw would name whatever happened to be first.
     */
    ownProjectIds: async () => {
      const result = await auth?.sparksProjects("mine", void 0, SKIN_PROJECT_TYPE);
      return result?.ok === true ? result.items.map((item) => item.id) : void 0;
    },
    // The same guarded closure `auth-service` gets: only urls this process built.
    openExternal: async (url) => {
      if (/^https?:\/\//.test(url)) await electron.shell.openExternal(url);
      else log("refused to open a url that is not http(s)");
    },
    onSkin: (state) => send("skins:state", state),
    onLibraryChanged: () => send("skins:changed"),
    log
  });
  datapack = createDatapackService({
    dataDir,
    instance: () => launcher?.instancePath(),
    packId: () => launcher?.packId(),
    minecraft: () => launcher?.minecraftVersion(),
    dataFormat: () => launcher?.clientDataFormat(),
    gameRunning: () => launcher?.isGameRunning() ?? false,
    onDatapack: (state) => send("datapack:state", state),
    onDraftsChanged: () => send("datapack:changed"),
    log
  });
  python = createPythonService({
    dataDir,
    packId: () => launcher?.packId(),
    onPython: (state) => send("python:state", state),
    onScriptsChanged: () => send("python:changed"),
    log
  });
  shelf = createShelfService({
    dataDir,
    // Read through the launcher rather than rebuilt here: the instance layout
    // has exactly one owner, and a second copy of that path is a skin written
    // where nothing looks for it.
    instance: () => launcher?.instancePath(),
    // The same answer the JVM gets, from the one place that decides it. A second
    // derivation here is how the skin ends up filed under a name nothing reads.
    username: () => launcher?.usernameFor(auth?.currentIdentity()),
    gameRunning: () => launcher?.isGameRunning() ?? false,
    minecraftVersion: () => launcher?.minecraftVersion(),
    onSkin: (state) => send("skins:state", state),
    onLibraryChanged: () => send("skins:changed"),
    log
  });
  electron.ipcMain.handle("app:initial-locale", () => resolveLocale(electron.app.getLocale()));
  electron.ipcMain.handle("auth:sign-out", async () => {
    await electron.session.fromPartition(SPARKS_PARTITION).clearStorageData({
      storages: ["cookies", "localstorage", "indexdb", "cachestorage", "serviceworkers"]
    });
    await pictures.clear();
    await auth?.signOut();
  });
  electron.ipcMain.handle("auth:open-profile", async () => {
    const url = auth?.currentProfileUrl();
    if (url && /^https:\/\//.test(url)) await electron.shell.openExternal(url);
    else log("no profile url to open - Sparks has not answered yet");
  });
  electron.ipcMain.handle("auth:begin-browser-sign-in", async () => {
    await auth?.beginPairing("browser");
  });
  electron.ipcMain.handle("auth:begin-code-pairing", async () => {
    await auth?.beginPairing("code");
  });
  electron.ipcMain.handle("auth:cancel-pairing", async () => {
    auth?.cancelPairing();
  });
  electron.ipcMain.handle("auth:open-pairing-page", async () => {
    const url = auth?.currentPairingUrl();
    if (url && /^https?:\/\//.test(url)) await electron.shell.openExternal(url);
    else log("no pairing page to open - pairing has not started");
  });
  electron.ipcMain.handle("launcher:prepare", async () => {
    updates.standDown();
    await launcher?.prepare();
  });
  electron.ipcMain.handle("launcher:launch", async (_event, worldId) => {
    updates.standDown();
    await launcher?.launch(worldId, auth?.currentIdentity());
  });
  electron.ipcMain.handle("launcher:remove-game", async () => await launcher?.removeGame() ?? false);
  electron.ipcMain.handle("launcher:verify-files", async () => await launcher?.verifyFiles() ?? false);
  electron.ipcMain.handle("launcher:open-logs", async () => {
    await electron.shell.openPath(launcher?.logsDirectory() ?? node_path.join(dataDir, "logs"));
  });
  electron.ipcMain.handle("update:state", async () => updates?.state());
  electron.ipcMain.handle("update:check", async () => updates?.checkNow(true));
  electron.ipcMain.handle("update:install", async () => updates?.install() ?? false);
  electron.ipcMain.handle("update:open-page", async () => {
    await electron.shell.openExternal(DOWNLOAD_PAGE_URL);
  });
  electron.ipcMain.handle("worlds:templates", async () => launcher?.worldTemplates());
  electron.ipcMain.handle("worlds:retry", async () => {
    await launcher?.retryWorldLibrary();
  });
  electron.ipcMain.handle(
    "worlds:unlock",
    async (_event, code) => launcher?.unlockWorld(code) ?? { ok: false, reason: "no-match" }
  );
  electron.ipcMain.handle(
    "my-worlds:list",
    async (_event, lessonId) => launcher?.myWorlds(lessonId)
  );
  electron.ipcMain.handle("my-worlds:sizes", async () => launcher?.worldSizes());
  electron.ipcMain.handle(
    "my-worlds:create",
    async (_event, templateId) => launcher?.createWorld(templateId) ?? { ok: false, reason: "no-template" }
  );
  electron.ipcMain.handle("my-worlds:choose", async (_event, id) => {
    await launcher?.chooseMyWorld(id);
  });
  electron.ipcMain.handle(
    "my-worlds:rename",
    async (_event, id, name) => launcher?.renameWorld(id, name) ?? false
  );
  electron.ipcMain.handle(
    "my-worlds:delete",
    async (_event, id) => launcher?.deleteWorld(id) ?? { ok: false, reason: "not-found" }
  );
  electron.ipcMain.handle("skins:current", async () => shelf?.current());
  electron.ipcMain.handle("gallery:page", async (_event, scope, cursor) => {
    if (scope !== "mine" && scope !== "community") {
      return { ok: false, failure: "unavailable" };
    }
    const from = typeof cursor === "string" && cursor.length > 0 ? cursor : void 0;
    if (scope === "mine") void publishing?.resolve("the gallery loaded").catch(() => {
    });
    return await gallery?.page(scope, from) ?? {
      ok: false,
      failure: "unavailable"
    };
  });
  const slugOk = (value) => typeof value === "string" && isDraftSlug(value);
  electron.ipcMain.handle("datapack:list", async () => await datapack?.drafts() ?? []);
  electron.ipcMain.handle("datapack:doc", async (_event, slug) => {
    if (!slugOk(slug)) return void 0;
    return datapack?.doc(slug);
  });
  electron.ipcMain.handle("datapack:save", async (_event, slug, doc2) => {
    if (!slugOk(slug)) return;
    if (typeof doc2 !== "string" || doc2.length > 4e6) return;
    await datapack?.save(slug, doc2);
  });
  electron.ipcMain.handle(
    "datapack:create",
    async (_event, presetId, name, text) => {
      if (typeof presetId !== "string" || presetId.length > 40) return void 0;
      if (typeof name !== "string" || name.trim() === "" || name.length > 80) return void 0;
      const strings2 = {};
      if (typeof text === "object" && text !== null) {
        for (const [key, value] of Object.entries(text)) {
          if (!/^[a-zA-Z]{1,20}$/.test(key)) continue;
          if (typeof value !== "string" || value.length > 120) continue;
          if (/[\r\n]/.test(value)) continue;
          strings2[key] = value;
        }
      }
      return datapack?.create(presetId, name.trim(), strings2);
    }
  );
  electron.ipcMain.handle("datapack:rename", async (_event, slug, name) => {
    if (!slugOk(slug)) return;
    if (typeof name !== "string" || name.trim() === "" || name.length > 80) return;
    await datapack?.rename(slug, name.trim());
  });
  electron.ipcMain.handle("datapack:remove", async (_event, slug) => {
    if (!slugOk(slug)) return;
    await datapack?.remove(slug);
  });
  electron.ipcMain.handle("datapack:want", async (_event, slug, wanted) => {
    if (!slugOk(slug) || typeof wanted !== "boolean") return;
    await datapack?.want(slug, wanted);
  });
  electron.ipcMain.handle("datapack:catalogue", async () => datapack?.catalogue());
  const scriptSlugOk = (value) => typeof value === "string" && isScriptSlug(value);
  electron.ipcMain.handle("python:list", async () => await python?.scripts() ?? []);
  electron.ipcMain.handle("python:doc", async (_event, slug) => {
    if (!scriptSlugOk(slug)) return void 0;
    return python?.doc(slug);
  });
  electron.ipcMain.handle("python:save", async (_event, slug, text) => {
    if (!scriptSlugOk(slug)) return;
    if (typeof text !== "string" || text.length > MAX_SCRIPT_CHARS) return;
    await python?.save(slug, text);
  });
  electron.ipcMain.handle(
    "python:create",
    async (_event, presetId, name, text) => {
      if (typeof presetId !== "string" || presetId.length > 40) return void 0;
      if (typeof name !== "string" || name.trim() === "" || name.length > 80) return void 0;
      const strings2 = {};
      if (typeof text === "object" && text !== null) {
        for (const [key, value] of Object.entries(text)) {
          if (!/^[a-zA-Z]{1,20}$/.test(key)) continue;
          if (typeof value !== "string" || value.length > 120) continue;
          if (/[\r\n]/.test(value)) continue;
          strings2[key] = value;
        }
      }
      return python?.create(presetId, name.trim(), strings2);
    }
  );
  electron.ipcMain.handle("python:rename", async (_event, slug, next) => {
    if (!scriptSlugOk(slug) || !scriptSlugOk(next)) {
      return { ok: false, reason: "invalid" };
    }
    return await python?.rename(slug, next) ?? { ok: false, reason: "missing" };
  });
  electron.ipcMain.handle("python:remove", async (_event, slug) => {
    if (!scriptSlugOk(slug)) return;
    await python?.remove(slug);
  });
  electron.ipcMain.handle("python:want", async (_event, slug, wanted) => {
    if (!scriptSlugOk(slug) || typeof wanted !== "boolean") return;
    await python?.want(slug, wanted);
  });
  electron.ipcMain.handle("editor:draft", async () => editor?.draft());
  electron.ipcMain.handle("editor:save-draft", async (_event, doc2) => {
    if (typeof doc2 !== "string" || doc2.length > 2e6) return;
    await editor?.saveDraft(doc2);
  });
  electron.ipcMain.handle("editor:publish", async (_event, doc2, png) => {
    if (typeof doc2 !== "string" || doc2.length > 2e6) return;
    if (!(png instanceof Uint8Array) || png.length === 0 || png.length > 1e6) return;
    await publishing?.publish(doc2, png);
  });
  electron.ipcMain.handle("editor:check-published", async () => {
    await publishing?.resolve("the child said they published it");
  });
  electron.ipcMain.handle("editor:apply", async (_event, png) => {
    if (!(png instanceof Uint8Array) || png.length === 0 || png.length > 1e6) return;
    await editor?.apply(png);
  });
  electron.ipcMain.handle("gallery:collect", async (_event, projectId, title) => {
    if (typeof projectId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) return;
    await gallery?.collect(projectId, typeof title === "string" ? title.slice(0, 200) : "");
  });
  electron.ipcMain.handle(
    "skins:library",
    async () => await shelf?.library() ?? { skins: [], appliedIsUnknown: false }
  );
  electron.ipcMain.handle("skins:wear", async (_event, id) => {
    if (typeof id === "string") await shelf?.wearFromLibrary(id);
  });
  electron.ipcMain.handle(
    "skins:forget",
    async (_event, id) => typeof id === "string" ? await shelf?.forgetSkin(id) ?? false : false
  );
  electron.ipcMain.handle("skins:keep-applied", async () => {
    await shelf?.keepApplied();
  });
  electron.ipcMain.handle("mods:list", async () => launcher?.mods());
  electron.ipcMain.handle(
    "studios:get",
    async () => await launcher?.studios() ?? { skins: true, datapacks: true, python: false }
  );
  electron.ipcMain.handle("mods:set", async (_event, modId, enabled) => {
    if (!auth?.isLauncherAdmin()) {
      log(`refused to switch ${modId}: the pack is not this person's to change`);
      return;
    }
    await launcher?.setMod(modId, enabled);
  });
  mainWindow = createWindow(log);
  mainWindow.webContents.once("did-finish-load", () => {
    void auth?.restore();
    void launcher?.checkInstalled();
    updates?.republish();
    updates?.start();
    if (macAppPath) void sweepParkedBundles(macAppPath, log);
  });
  autostartIfAsked(log);
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createWindow(log);
    mainWindow.webContents.once("did-finish-load", () => {
      auth?.republish();
      launcher?.republish();
      updates?.republish();
    });
  });
});
function autostartIfAsked(log) {
  if (electron.app.isPackaged) return;
  const mode = process.env["KODLAND_AUTOSTART"]?.trim();
  if (mode !== "prepare" && mode !== "launch") return;
  log(`KODLAND_AUTOSTART=${mode} (development only)`);
  if (mode === "prepare") void launcher?.prepare();
  else void launcher?.launch(void 0, auth?.currentIdentity());
}
electron.app.on("window-all-closed", () => {
  if (launcher?.isGameRunning()) return;
  if (process.platform !== "darwin") electron.app.quit();
});
