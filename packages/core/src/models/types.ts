export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Set when the call was recovered from plain text rather than a structured API field. */
  salvaged?: boolean;
  /** Raw argument text when it could not be parsed as JSON. */
  parseError?: string;
}

export interface ChatMessage {
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  /** For role === 'tool': the id of the call this result answers. */
  toolCallId?: string;
  /** For role === 'tool': the tool name. */
  toolName?: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (object) describing the arguments. */
  parameters: Record<string, unknown>;
}

export interface GenerationOptions {
  temperature?: number;
  topP?: number;
  /** Context window to allocate (tokens). */
  numCtx?: number;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** Number of layers to offload to GPU (Ollama num_gpu). Undefined = server default. */
  numGpu?: number;
  seed?: number;
  /** Enable reasoning/thinking output on models that support it. */
  think?: boolean;
  keepAlive?: string;
  stop?: string[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  options?: GenerationOptions;
  signal?: AbortSignal;
  /** Seconds without receiving any bytes before the request is treated as stalled. */
  idleTimeoutSec?: number;
}

export type StreamEvent = { type: 'text'; text: string } | { type: 'thinking'; text: string };

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalDurationMs?: number;
  loadDurationMs?: number;
  promptTokensPerSec?: number;
  evalTokensPerSec?: number;
  timeToFirstTokenMs?: number;
}

export interface ChatResponse {
  content: string;
  thinking?: string;
  toolCalls: ToolCall[];
  usage: Usage;
  finishReason?: string;
}

export interface ModelInfo {
  name: string;
  providerId: string;
  sizeBytes?: number;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  modifiedAt?: string;
}

export interface ModelDetails extends ModelInfo {
  /** Capabilities reported by the server, e.g. completion, tools, thinking, embedding, vision, insert. */
  capabilities: string[];
  /** True when capabilities came from the server rather than being unknown. */
  capabilitiesReported: boolean;
  contextLength?: number;
  architecture?: string;
  layers?: number;
  kvHeads?: number;
  /** Per-head key + value dimension sum (for KV cache estimate). */
  kvDimPerHead?: number;
  embeddingLength?: number;
}

export interface LoadedModel {
  name: string;
  sizeBytes?: number;
  vramBytes?: number;
  contextLength?: number;
  expiresAt?: string;
}

export interface ProviderHealth {
  ok: boolean;
  version?: string;
  error?: string;
  latencyMs?: number;
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  digest?: string;
}

export type ProviderKind = 'ollama' | 'openai';

export interface ProviderConfig {
  id: string;
  kind: ProviderKind;
  label: string;
  baseUrl: string;
  enabled: boolean;
  /** Optional API key for OpenAI-compatible local servers that require one. Never sent to the model. */
  apiKey?: string;
}

export interface ModelProvider {
  readonly config: ProviderConfig;
  health(signal?: AbortSignal): Promise<ProviderHealth>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  showModel(name: string, signal?: AbortSignal): Promise<ModelDetails>;
  chat(req: ChatRequest, onEvent?: (e: StreamEvent) => void): Promise<ChatResponse>;
  listLoaded?(signal?: AbortSignal): Promise<LoadedModel[]>;
  pull?(name: string, onProgress: (p: PullProgress) => void, signal?: AbortSignal): Promise<void>;
  deleteModel?(name: string): Promise<void>;
  embed?(model: string, input: string[], signal?: AbortSignal): Promise<number[][]>;
  unload?(name: string): Promise<void>;
}

export interface ModelRef {
  providerId: string;
  model: string;
}
