import { createHash } from "node:crypto";

function serialize(value, path) {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`Non-finite number at ${path}`);
      }
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case "object": {
      if (Array.isArray(value)) {
        return `[${value.map((item, index) => serialize(item, `${path}[${index}]`)).join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Unsupported object at ${path}`);
      }
      const entries = Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(value[key], `${path}.${key}`)}`);
      return `{${entries.join(",")}}`;
    }
    default:
      throw new TypeError(`Unsupported ${typeof value} at ${path}`);
  }
}

/** Stable competition canonical JSON: sorted object keys, preserved arrays. */
export function canonicalJson(value) {
  return serialize(value, "$");
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalHash(value, domain = "flux-canonical-v1") {
  return sha256Hex(`${domain}\n${canonicalJson(value)}`);
}
