// Jalankan di: ROOT  ->  node scripts/vps-secrets.mjs > infra/.env.secrets
// Prints fresh random secrets for infra/.env: database password, JWT secret, a service_role JWT signed with it
// (PostgREST checks it) and the indexer cron token. Output goes straight to a file; never commit it.
import { createHmac, randomBytes } from "node:crypto";

const b64url = (b) => Buffer.from(b).toString("base64url");
const hex = (n) => randomBytes(n).toString("hex");

const jwtSecret = hex(32);
const now = Math.floor(Date.now() / 1000);
const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const body = b64url(JSON.stringify({ role: "service_role", iss: "asterrapools", iat: now, exp: now + 10 * 365 * 24 * 3600 }));
const sig = createHmac("sha256", jwtSecret).update(`${head}.${body}`).digest("base64url");

console.log(`POSTGRES_PASSWORD=${hex(24)}`);
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`SERVICE_ROLE_KEY=${head}.${body}.${sig}`);
console.log(`INDEXER_TOKEN=${hex(24)}`);
