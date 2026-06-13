/**
 * Minimal Cloudflare Workers type stubs.
 *
 * We define only the interfaces we actually use, rather than pulling in
 * `@cloudflare/workers-types` which would pollute the global type namespace
 * and potentially conflict with Node.js types in the same project.
 *
 * These stubs cover R2, KV, and Vectorize — the three services used by
 * R2StorageProvider.
 */

// ---------------------------------------------------------------------------
// R2 types
// ---------------------------------------------------------------------------

export interface R2ListOptions {
  prefix?: string;
  delimiter?: string;
  cursor?: string;
  limit?: number;
}

export interface R2Object {
  key: string;
  size: number;
  uploaded: Date;
  httpEtag: string;
}

export interface R2ObjectBody extends R2Object {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2PutOptions {
  onlyIf?: {
    etagMatches?: string;
  };
}

export interface R2Objects {
  objects: R2Object[];
  delimitedPrefixes: string[];
  truncated: boolean;
  cursor?: string;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream, options?: R2PutOptions): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
  head(key: string): Promise<R2Object | null>;
  list(options?: R2ListOptions): Promise<R2Objects>;
}

// ---------------------------------------------------------------------------
// KV types
// ---------------------------------------------------------------------------

export interface KVNamespace {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string, type?: "text"): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Vectorize types
// ---------------------------------------------------------------------------

export interface VectorizeVector {
  id: string;
  values: number[];
  metadata?: Record<string, string>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, string>;
}

export interface VectorizeQueryOptions {
  topK: number;
  returnMetadata?: "all" | "indexed" | "none";
}

export interface VectorizeMatches {
  matches: VectorizeMatch[];
  count: number;
}

export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<{ count: number }>;
  query(vector: number[], options: VectorizeQueryOptions): Promise<VectorizeMatches>;
  deleteByIds(ids: string[]): Promise<{ count: number }>;
  /** Fetch stored vectors (values + metadata) by id. Absent ids are omitted. */
  getByIds(ids: string[]): Promise<VectorizeVector[]>;
}

// ---------------------------------------------------------------------------
// Workers AI — minimal binding type
// ---------------------------------------------------------------------------

/** Response shape from an embedding model run (e.g. @cf/baai/bge-m3). */
export interface AiEmbeddingResponse {
  shape: number[];
  data: number[][];
}

/** Inputs for an embedding model run. `pooling: "cls"` is recommended for
 *  bge-m3 (the default "mean" yields lower-quality embeddings). */
export interface AiEmbeddingInputs {
  text: string | string[];
  pooling?: "cls" | "mean";
}

/** Inputs for an image-to-text / vision model run (e.g.
 *  @cf/meta/llama-3.2-11b-vision-instruct or @cf/llava-hf/llava-1.5-7b-hf).
 *  `image` is the raw bytes as an array of integers. */
export interface AiImageToTextInputs {
  image: number[];
  prompt: string;
  max_tokens?: number;
}

/** Response from a vision model run. Different models name the text field
 *  differently (`response` for llama-vision, `description` for llava), so both
 *  are optional and read defensively. */
export interface AiImageToTextResponse {
  response?: string;
  description?: string;
}

/** Minimal Workers AI binding surface — `run()` for embeddings and vision.
 *  Overload resolution relies on the inputs' required keys being DISJOINT
 *  (`text` for embeddings vs `image`+`prompt` for vision); keep them disjoint. */
export interface Ai {
  run(model: string, inputs: AiEmbeddingInputs): Promise<AiEmbeddingResponse>;
  run(model: string, inputs: AiImageToTextInputs): Promise<AiImageToTextResponse>;
}

// ---------------------------------------------------------------------------
// Cloudflare env bindings
// ---------------------------------------------------------------------------

export interface CloudflareEnv {
  /** R2 bucket for file storage (wiki pages, raw sources, assets) */
  YOPEDIA_BUCKET: R2Bucket;
  /** KV namespace for derived indexes (config, query history, etc.) */
  YOPEDIA_CONFIG: KVNamespace;
  /** Vectorize index for embedding search (optional — not all deployments need it) */
  YOPEDIA_VECTORIZE?: VectorizeIndex;
  /** Workers AI binding for embeddings (e.g. @cf/baai/bge-m3, optional) */
  AI?: Ai;
}
