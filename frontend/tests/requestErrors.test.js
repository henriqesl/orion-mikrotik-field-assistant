import test from "node:test";
import assert from "node:assert/strict";
import { requestErrorMessage } from "../src/services/requestErrors.js";

test("validation arrays become useful messages without echoing input", () => {
  const message = requestErrorMessage([{ loc: ["body", "configuration", "ap_bssid"], msg: "Value error, Informe o MAC do AP.", type: "value_error", input: "private-password" }]);
  assert.equal(message, "MAC do AP: Informe o MAC do AP.");
  assert.equal(message.includes("private-password"), false);
});
test("clean legacy escaped spaces and unknown responses", () => {
  assert.equal(requestErrorMessage("ether1. &#x20;"), "ether1.");
  assert.equal(typeof requestErrorMessage(null), "string");
});
