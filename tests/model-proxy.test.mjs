import { afterEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { callModel, imageForm, modelError } from "../lib/model-proxy.ts";

const previous = { url: process.env.MODEL_SERVER_URL, key: process.env.MODEL_SERVER_API_KEY };
afterEach(() => {
  mock.restoreAll();
  for (const [name, value] of [["MODEL_SERVER_URL", previous.url], ["MODEL_SERVER_API_KEY", previous.key]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
function configure() {
  process.env.MODEL_SERVER_URL = "https://example.ngrok-free.app";
  process.env.MODEL_SERVER_API_KEY = "test-only-key";
}
function request(form) {
  return new Request("https://app.example/api/model/predict", { method: "POST", body: form });
}

test("unconfigured proxy returns 503 without contacting the upstream", async () => {
  delete process.env.MODEL_SERVER_URL;
  const fetch = mock.method(globalThis, "fetch", () => assert.fail("must not fetch"));
  await assert.rejects(callModel("/health"), { status: 503 });
  assert.equal(fetch.mock.callCount(), 0);
});

test("server adds the secret header and forwards real label IDs without caching", async () => {
  configure();
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(String(url), "https://example.ngrok-free.app/labels");
    assert.equal(options.headers["X-API-Key"], "test-only-key");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    return Response.json({ labels: [{ id: "actual-db-id", name: "마우스" }] });
  });
  const response = await callModel("/labels");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { labels: [{ id: "actual-db-id", name: "마우스" }] });
});

test("unsafe server URLs are rejected before sending the shared key", async () => {
  configure();
  mock.method(globalThis, "fetch", () => assert.fail("must not fetch"));
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com?token=x", "https://example.com/extra"]) {
    process.env.MODEL_SERVER_URL = url;
    await assert.rejects(callModel("/health"), { status: 503 });
  }
});

test("upstream authentication failures never relay upstream secrets", async () => {
  configure();
  mock.method(globalThis, "fetch", async () => new Response("private-upstream-details", { status: 401 }));
  try {
    await callModel("/labels");
    assert.fail("must reject");
  } catch (error) {
    const response = modelError(error);
    assert.equal(response.status, 502);
    assert.doesNotMatch(await response.text(), /private-upstream-details|test-only-key/);
  }
});

test("network failures produce a generic response", async () => {
  configure();
  mock.method(globalThis, "fetch", async () => { throw new Error("private-url-and-key"); });
  const response = await callModel("/health").catch(modelError);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private-url-and-key/);
});

test("multipart upload forwards only the selected image", async () => {
  const form = new FormData();
  form.append("file", new File(["image bytes"], "photo.jpg", { type: "image/jpeg" }));
  form.append("untrusted-extra-field", "ignored");
  const output = await imageForm(request(form));
  assert.equal(output.get("file").type, "image/jpeg");
  assert.equal(await output.get("file").text(), "image bytes");
  assert.equal(output.get("untrusted-extra-field"), null);
});

test("missing, unsupported, oversized and malformed uploads are rejected", async () => {
  await assert.rejects(imageForm(request(new FormData())), { status: 400 });
  const unsupported = new FormData();
  unsupported.append("file", new File(["hello"], "x.txt", { type: "text/plain" }));
  await assert.rejects(imageForm(request(unsupported)), { status: 415 });
  const large = new FormData();
  large.append("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "x.jpg", { type: "image/jpeg" }));
  await assert.rejects(imageForm(request(large)), { status: 413 });
  await assert.rejects(imageForm(new Request("https://app.example", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=missing" }, body: "bad body",
  })), { status: 400 });
});

test("chunked oversized requests are bounded even without Content-Length", async () => {
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 128 * 1024));
    controller.close();
  } });
  await assert.rejects(imageForm(new Request("https://app.example", {
    method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=test" }, body, duplex: "half",
  })), { status: 413 });
});
