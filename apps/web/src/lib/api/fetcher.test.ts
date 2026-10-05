import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, apiFetch } from "./fetcher";

function mockFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function lastRequest(fetchMock: ReturnType<typeof mockFetch>) {
  const call = fetchMock.mock.calls[0];
  if (!call) {
    throw new Error("fetch was not called");
  }
  const init = call[1] ?? {};
  return { url: String(call[0]), init, headers: new Headers(init.headers) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends a JSON body with a JSON content type and the session cookie", async () => {
    const fetchMock = mockFetch(Response.json({ ok: true }));

    await apiFetch("/things", { method: "POST", body: { a: 1 }, schema: z.object({ ok: z.boolean() }) });

    const { init, headers } = lastRequest(fetchMock);
    expect(init.body).toBe('{"a":1}');
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.credentials).toBe("include");
  });

  it("sends FormData untouched and lets the browser set the multipart content type", async () => {
    const fetchMock = mockFetch(Response.json({ id: "x" }));
    const form = new FormData();
    form.append("targetRole", "Engineer");

    await apiFetch("/upload", { method: "POST", body: form, schema: z.object({ id: z.string() }) });

    const { init, headers } = lastRequest(fetchMock);
    expect(init.body).toBe(form);
    expect(headers.has("content-type")).toBe(false);
  });

  it("normalises an error body into an ApiError with its code and field errors", async () => {
    mockFetch(
      Response.json(
        { statusCode: 400, code: "VALIDATION_ERROR", message: "Invalid request", fieldErrors: { file: ["Only PDF files are accepted"] } },
        { status: 400 },
      ),
    );

    const failure = await apiFetch("/upload", { method: "POST" }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fieldErrors: { file: ["Only PDF files are accepted"] },
    });
  });

  it("keeps the distinct 422 extraction failure code", async () => {
    mockFetch(
      Response.json(
        { statusCode: 422, code: "PDF_EXTRACTION_FAILED", message: "No readable text was found in the PDF." },
        { status: 422 },
      ),
    );

    const failure = await apiFetch("/upload", { method: "POST" }).catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 422, code: "PDF_EXTRACTION_FAILED" });
  });

  it("does not try to parse a 204 response", async () => {
    mockFetch(new Response(null, { status: 204 }));

    await expect(apiFetch("/things/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("turns a network failure into a safe ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));

    const failure = await apiFetch("/things").catch((error: unknown) => error);

    expect(failure).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("rejects a success body that does not match the schema instead of trusting it", async () => {
    mockFetch(Response.json({ id: 42 }));

    const failure = await apiFetch("/things", { schema: z.object({ id: z.string() }) }).catch(
      (error: unknown) => error,
    );

    expect(failure).toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
