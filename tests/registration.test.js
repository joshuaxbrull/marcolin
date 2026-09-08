import test from "node:test";
import assert from "node:assert/strict";
import { registrationManifest, setupOrigin, validateRegistration } from "../scripts/register-manager-app.mjs";

test("temporary setup links require a plain HTTPS Cloudflare Tunnel origin", () => {
  assert.equal(setupOrigin(), "http://127.0.0.1:8736");
  assert.equal(setupOrigin("https://example-setup.trycloudflare.com/"), "https://example-setup.trycloudflare.com");
  for (const url of ["http://example.trycloudflare.com", "https://example.trycloudflare.com.attacker.example", "https://user@example.trycloudflare.com", "https://example.trycloudflare.com:8443", "https://example.trycloudflare.com/path", "https://example.trycloudflare.com/?query=1", "https://example.trycloudflare.com/#fragment"]) assert.throws(() => setupOrigin(url));
  const manifest = registrationManifest("https://manager.example", setupOrigin("https://example-setup.trycloudflare.com") + "/callback");
  assert.equal(manifest.redirect_url, "https://example-setup.trycloudflare.com/callback");
});

test("manager app registration stays private and requests only its repository permissions", () => {
  const manifest = registrationManifest("https://manager.example", "http://127.0.0.1:8736/callback");
  assert.equal(manifest.public, false);
  assert.deepEqual(manifest.default_permissions, { contents: "write", metadata: "read" });
  assert.equal(manifest.hook_attributes.active, false);
  assert.deepEqual(manifest.callback_urls, ["https://manager.example/auth/callback"]);
  assert.throws(() => registrationManifest("http://attacker.example", "http://127.0.0.1/callback"));
});

test("registration rejects another account or extra permissions and exposes no secret in its public result", () => {
  const app = { id: 1, owner: { login: "joshuaxbrull" }, client_id: "Iv-test", client_secret: "test-only", slug: "marcolin-test", html_url: "https://github.com/apps/marcolin-test", permissions: { contents: "write", metadata: "read" }, pem: "test-private-key", webhook_secret: "test-webhook" };
  const result = validateRegistration(app);
  assert.equal(result.owner, "joshuaxbrull");
  assert.equal(result.client_secret, undefined); assert.equal(result.pem, undefined); assert.equal(result.webhook_secret, undefined);
  assert.throws(() => validateRegistration({ ...app, owner: { login: "another-account" } }));
  assert.throws(() => validateRegistration({ ...app, permissions: { ...app.permissions, administration: "write" } }));
  assert.throws(() => validateRegistration({ ...app, html_url: "https://attacker.example/apps/marcolin-test" }));
});
