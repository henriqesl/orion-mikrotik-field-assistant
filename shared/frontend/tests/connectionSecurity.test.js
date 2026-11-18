import test from "node:test";
import assert from "node:assert/strict";
import { withTls, needsCertificateAcknowledgement } from "../src/services/connectionSecurity.js";

test("TLS defaults change standard ports but never overwrite a custom API port", () => {
  assert.equal(withTls({ port: 8728 }, true).port, 8729);
  assert.equal(withTls({ port: 8729 }, false).port, 8728);
  assert.equal(withTls({ port: "9000" }, true).port, "9000");
  assert.equal(withTls({ port: 9000, verify_tls: false }, true).verify_tls, true);
});
test("unverified TLS requires an explicit lab exception", () => {
  assert.equal(needsCertificateAcknowledgement({ use_tls: true, verify_tls: false }, false), true);
  assert.equal(needsCertificateAcknowledgement({ use_tls: true, verify_tls: true }, false), false);
  assert.equal(needsCertificateAcknowledgement({ use_tls: true, verify_tls: false }, true), false);
});
