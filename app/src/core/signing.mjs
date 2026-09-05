import {
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { sha256Hex } from "./canonical-json.mjs";

function publicKeyMetadata(publicKey) {
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  return {
    public_key_pem: publicKeyPem,
    key_fingerprint: sha256Hex(publicKeyDer),
  };
}

/** Creates an ephemeral Ed25519 signer. Private key material never enters the artifact. */
export function createRuntimeSigner() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const metadata = publicKeyMetadata(publicKey);
  return Object.freeze({
    algorithm: "Ed25519",
    ...metadata,
    sign(canonicalText) {
      if (typeof canonicalText !== "string") throw new TypeError("canonicalText must be a string");
      return cryptoSign(null, Buffer.from(canonicalText, "utf8"), privateKey).toString("base64");
    },
  });
}

export function fingerprintPublicKey(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  return publicKeyMetadata(key).key_fingerprint;
}

export function verifyEd25519(publicKeyPem, canonicalText, signatureBase64) {
  return cryptoVerify(
    null,
    Buffer.from(canonicalText, "utf8"),
    createPublicKey(publicKeyPem),
    Buffer.from(signatureBase64, "base64"),
  );
}
