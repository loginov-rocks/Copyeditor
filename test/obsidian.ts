// The `obsidian` package ships only type definitions — it has no runtime module — so any source
// file that imports from it can't be loaded under Jest without a stand-in. Wired up in
// jest.config.json via moduleNameMapper. Add exports here as tests need them.

import { dump, load } from 'js-yaml';

// Obsidian's YAML helpers are thin wrappers over js-yaml, so back the stand-ins with the same
// library to keep frontmatter round-tripping faithful to production.
export function parseYaml(input: string): unknown {
  return load(input);
}

export function requestUrl(): never {
  throw new Error('requestUrl is not implemented in the obsidian test mock');
}

export function stringifyYaml(data: unknown): string {
  return dump(data);
}
