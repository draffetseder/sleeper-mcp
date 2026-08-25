import { ALL_FIELDS_TOKEN } from "../players/types.js";
import { NOISE, type ShapeKey } from "./noise.js";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEmptyContainer = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
};

/**
 * Recursively drops null/undefined values and containers that hold nothing.
 * Empty strings are kept on purpose: Sleeper uses "" to mean something (an
 * auto-drafted pick has `picked_by: ""`), which is not the same as absent.
 */
export const prune = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(prune);
  if (!isPlainObject(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || entry === undefined) continue;
    const pruned = prune(entry);
    if (isEmptyContainer(pruned)) continue;
    result[key] = pruned;
  }
  return result;
};

const dropPath = (value: Record<string, unknown>, segments: string[]): void => {
  const [head, ...rest] = segments;

  if (rest.length === 0) {
    if (head.endsWith("*")) {
      const prefix = head.slice(0, -1);
      for (const key of Object.keys(value)) {
        if (key.startsWith(prefix)) delete value[key];
      }
    } else {
      delete value[head];
    }
    return;
  }

  const child = value[head];
  if (isPlainObject(child)) {
    const copy = { ...child };
    dropPath(copy, rest);
    value[head] = copy;
  }
};

/** Removes each dot-path from a response object (or every element of an array). */
export const dropFields = (value: unknown, paths: string[]): unknown => {
  if (Array.isArray(value)) return value.map((entry) => dropFields(entry, paths));
  if (!isPlainObject(value)) return value;

  const result = { ...value };
  for (const path of paths) {
    dropPath(result, path.split("."));
  }
  return result;
};

/**
 * Trims a Sleeper response for the model: prune empties, then drop the noise
 * this endpoint is known to carry.
 *
 * `fields` is the caller's escape hatch — ALL_FIELDS_TOKEN returns the raw
 * response untouched, and any other entry re-includes that exact drop-path.
 */
export const shapeResponse = (data: unknown, shape?: ShapeKey, fields: string[] = []): unknown => {
  if (fields.includes(ALL_FIELDS_TOKEN)) return data;

  const pruned = prune(data);
  if (!shape) return pruned;

  const paths = NOISE[shape].filter((path) => !fields.includes(path));
  return paths.length > 0 ? dropFields(pruned, paths) : pruned;
};
