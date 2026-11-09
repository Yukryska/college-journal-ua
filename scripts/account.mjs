import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = new URL("../.dev.vars", import.meta.url);
const [address, ...extra] = process.argv.slice(2);
const email = address?.trim().toLowerCase();
if (!email || extra.length || email.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
  console.error("Використання: npm run account -- user@example.com");
  process.exit(1);
}

const source = existsSync(path) ? readFileSync(path, "utf8") : "";
const entry = source.match(/^JOURNAL_ACCESS=(.*)$/m);
const config = entry ? JSON.parse(entry[1].trim().replace(/^'|'$/g, "")) : { owner: email, keys: {} };
const key = "jrn_" + randomBytes(24).toString("base64url");
config.keys[email] = createHash("sha256").update(key).digest("hex");
const line = "JOURNAL_ACCESS='" + JSON.stringify(config) + "'";
const updated = entry ? source.replace(entry[0], () => line) : source.trimEnd() + "\n" + line + "\n";
writeFileSync(path, updated.trimStart(), { mode: 0o600 });

console.log("Електронна пошта: " + email);
console.log("Код доступу: " + key);
if (config.owner === email) console.log("Роль: власник журналу.");
