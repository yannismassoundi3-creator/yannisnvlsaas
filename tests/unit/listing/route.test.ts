import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The AI listing route with everything external mocked: the Anthropic SDK
 * (never called for real), the workspace, Supabase and the rate limiter.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  constructed: vi.fn(),
  rpc: vi.fn(),
  usage: vi.fn(),
  adminRpc: vi.fn(),
  rateLimit: vi.fn(),
  workspace: vi.fn(),
  cookie: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  const Real = actual.default;
  class FakeAnthropic {
    beta = { messages: { create: mocks.create } };
    constructor(options: unknown) {
      mocks.constructed(options);
    }
    static APIError = Real.APIError;
    static APIUserAbortError = Real.APIUserAbortError;
    static APIConnectionError = Real.APIConnectionError;
    static RateLimitError = Real.RateLimitError;
    static InternalServerError = Real.InternalServerError;
    static BadRequestError = Real.BadRequestError;
  }
  return { ...actual, default: FakeAnthropic };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => mocks.cookie(name) }) }));
vi.mock("@/i18n/request", () => ({ getRequestLocale: async () => "fr" }));
vi.mock("@/lib/auth/workspace", () => ({ getWorkspace: () => mocks.workspace() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: (...args: unknown[]) => mocks.rateLimit(...args) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.adminRpc }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (...args: unknown[]) => ({ maybeSingle: () => mocks.rpc(...args) }),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => mocks.usage() }) }) }) }),
  }),
}));

const { GET, POST } = await import("@/app/api/listing/route");
const Anthropic = (await import("@anthropic-ai/sdk")).default;

const ORG = "11111111-1111-4111-8111-111111111111";
const workspace = (canWrite = true) => ({ user: { id: "user-1" }, organization: { id: ORG, name: "Org" }, entitlements: { canWrite } });

const listing = {
  title: "Veste en jean bleue",
  description: "Veste en jean bleue.\nLégère usure.",
  brand: null,
  brandConfidence: "unknown",
  category: "Veste",
  colors: ["Bleu"],
  material: null,
  materialConfidence: "unknown",
  size: null,
  condition: "bon",
  defects: ["Usure"],
  priceRange: { low: 1500, high: 2500 },
  priceNote: "Estimation sans données de marché.",
  targetAudience: "Adultes",
  platforms: [{ platform: "vinted", reason: "Vêtements" }],
  keywords: ["veste"],
};

const message = (stop_reason: string, text = JSON.stringify(listing), extra: object = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  stop_reason,
  stop_details: null,
  content: [{ type: "text", text }],
  usage: { input_tokens: 1800, output_tokens: 600 },
  ...extra,
});

const jpeg = () => {
  const b = Buffer.alloc(200, 0x22);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b.toString("base64");
};

const post = (body: unknown = { images: [jpeg()], name: "Veste", price: "6,50", locale: "fr" }) =>
  POST(new Request("http://localhost/api/listing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const ENV = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  delete process.env.LISTING_AI_FAKE;
  delete process.env.LISTING_AI_MODEL;
  delete process.env.LISTING_AI_MONTHLY_LIMIT;
  mocks.workspace.mockResolvedValue(workspace());
  mocks.rateLimit.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: { remaining: 12, period: "2026-10-01" }, error: null });
  mocks.adminRpc.mockResolvedValue({ error: null });
  mocks.usage.mockResolvedValue({ data: { used: 38 }, error: null });
  mocks.cookie.mockReturnValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("POST /api/listing", () => {
  it("returns the validated listing and what is left this month", async () => {
    mocks.create.mockResolvedValue(message("end_turn"));
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, remaining: 12, limit: 50, test: false });
    expect(body.listing.title).toBe("Veste en jean bleue");
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_listing_analysis", { p_organization_id: ORG, p_limit: 50 });
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.rateLimit).toHaveBeenCalledWith("listing-ai:user-1", 10, 600);
  });

  it("calls Claude once with the requested parameters", async () => {
    mocks.create.mockResolvedValue(message("end_turn"));
    await post();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const [params, options] = mocks.create.mock.calls[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect(params).not.toHaveProperty("thinking");
    expect(params.system).toMatch(/français/);
    expect(params.messages).toHaveLength(1);
    expect(params.messages[0].role).toBe("user");
    const content = params.messages[0].content;
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg" } });
    expect(content.at(-1)).toMatchObject({ type: "text" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses LISTING_AI_MODEL and LISTING_AI_MONTHLY_LIMIT", async () => {
    process.env.LISTING_AI_MODEL = "claude-opus-5-5-custom";
    process.env.LISTING_AI_MONTHLY_LIMIT = "20";
    mocks.create.mockResolvedValue(message("end_turn"));
    await post();
    expect(mocks.create.mock.calls[0][0].model).toBe("claude-opus-5-5-custom");
    expect(mocks.rpc).toHaveBeenCalledWith("reserve_listing_analysis", { p_organization_id: ORG, p_limit: 20 });
  });

  it("refunds the analysis on a refusal", async () => {
    mocks.create.mockResolvedValue(message("refusal", "", { stop_details: { type: "refusal", category: null, explanation: null } }));
    const res = await post();
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("refusal");
    expect(mocks.adminRpc).toHaveBeenCalledWith("release_listing_analysis", { p_organization_id: ORG, p_period: "2026-10-01" });
  });

  it("refunds the analysis when the answer is cut by max_tokens", async () => {
    mocks.create.mockResolvedValue(message("max_tokens", '{"title": "Veste'));
    const res = await post();
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("truncated");
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });

  it("refunds the analysis when the JSON does not match the schema", async () => {
    mocks.create.mockResolvedValue(message("end_turn", JSON.stringify({ ...listing, condition: "parfait" })));
    const res = await post();
    expect((await res.json()).code).toBe("invalid_output");
    expect(mocks.adminRpc).toHaveBeenCalledTimes(1);
  });

  it("maps SDK typed errors and refunds", async () => {
    mocks.create.mockRejectedValueOnce(new Anthropic.RateLimitError(429, { type: "error" }, "rate limited", new Headers()));
    expect((await (await post()).json()).code).toBe("rate_limited");
    mocks.create.mockRejectedValueOnce(new Anthropic.InternalServerError(529, { type: "error" }, "overloaded", new Headers()));
    expect((await (await post()).json()).code).toBe("overloaded");
    mocks.create.mockRejectedValueOnce(new Anthropic.APIConnectionError({ message: "down" }));
    expect((await (await post()).json()).code).toBe("unavailable");
    mocks.create.mockRejectedValueOnce(new Anthropic.APIUserAbortError());
    expect((await post()).status).toBe(499);
    expect(mocks.adminRpc).toHaveBeenCalledTimes(4);
  });

  it("does not call Claude when the monthly quota is exhausted", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "quota_exhausted" } });
    const res = await post();
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("quota");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("is disabled when ANTHROPIC_API_KEY is missing: nothing is reserved or sent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("unavailable");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("is disabled while the database has no reservation function", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const res = await post();
    expect(res.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses paused workspaces, rate-limited users and bad images before reserving", async () => {
    mocks.workspace.mockResolvedValueOnce(workspace(false));
    expect((await post()).status).toBe(403);
    mocks.rateLimit.mockResolvedValueOnce(false);
    expect((await post()).status).toBe(429);
    expect((await post({ images: [Buffer.from("<svg/>").toString("base64")], locale: "fr" })).status).toBe(400);
    expect((await (await post({ images: [jpeg(), jpeg(), jpeg(), jpeg()], locale: "fr" })).json()).code).toBe("too_many");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses bodies over 5 MB", async () => {
    const big = "A".repeat(5 * 1024 * 1024 + 10);
    const res = await post({ images: [big], locale: "fr" });
    expect(res.status).toBe(413);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns a canned listing in fake mode without calling Claude (never in production)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.LISTING_AI_FAKE = "1";
    const res = await post();
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, test: true });
    expect(body.listing.title).toMatch(/DONNÉES DE TEST/);
    expect(mocks.create).not.toHaveBeenCalled();
    vi.stubEnv("NODE_ENV", "production");
    expect((await post()).status).toBe(503);
    vi.unstubAllEnvs();
  });

  it("requires a signed-in member", async () => {
    mocks.workspace.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    expect((await post()).status).toBe(401);
  });
});

describe("GET /api/listing", () => {
  it("says unavailable without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(await (await GET()).json()).toEqual({ status: "unavailable" });
  });

  it("returns the remaining analyses", async () => {
    expect(await (await GET()).json()).toEqual({ status: "ready", remaining: 12, limit: 50 });
  });

  it("says unavailable while the ai_usage table does not exist", async () => {
    mocks.usage.mockResolvedValue({ data: null, error: { code: "PGRST205" } });
    expect(await (await GET()).json()).toEqual({ status: "unavailable" });
  });

  it("honours the test cookie only in fake mode", async () => {
    mocks.cookie.mockReturnValue({ value: "off" });
    expect((await (await GET()).json()).status).toBe("ready");
    delete process.env.ANTHROPIC_API_KEY;
    process.env.LISTING_AI_FAKE = "1";
    expect((await (await GET()).json()).status).toBe("unavailable");
  });
});
