import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type Provider = "anthropic" | "deepseek";

export const PROVIDER: Provider =
  process.env.LLM_PROVIDER === "deepseek" ? "deepseek" : "anthropic";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

export const LLM_ENABLED =
  PROVIDER === "deepseek"
    ? !!process.env.DEEPSEEK_API_KEY
    : !!process.env.ANTHROPIC_API_KEY;

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

let _deepseek: OpenAI | null = null;
function deepseek(): OpenAI {
  if (!_deepseek) {
    _deepseek = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: "https://api.deepseek.com",
    });
  }
  return _deepseek;
}

export interface JsonTool {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  parameters: Record<string, unknown>;
}

/** Force the model to return a JSON object matching the tool's schema. */
export async function chatJson(
  system: string,
  user: string,
  tool: JsonTool,
  maxTokens = 512,
): Promise<unknown | null> {
  if (PROVIDER === "deepseek") {
    const res = await deepseek().chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: tool.name } },
    });
    const call = res.choices[0]?.message?.tool_calls?.[0];
    if (!call) return null;
    try {
      return JSON.parse(call.function.arguments);
    } catch {
      return null;
    }
  }

  const msg = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.parameters as any }],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: user }],
  });
  const tu = msg.content.find((b) => b.type === "tool_use");
  return tu && tu.type === "tool_use" ? tu.input : null;
}

/** Plain text completion. */
export async function chatText(
  system: string,
  user: string,
  maxTokens = 64,
): Promise<string> {
  if (PROVIDER === "deepseek") {
    const res = await deepseek().chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return res.choices[0]?.message?.content?.trim() ?? "";
  }

  const msg = await anthropic().messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text.trim() : "";
}
