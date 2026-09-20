#!/usr/bin/env node
// Cuts a new Android build and publishes it: `eas build` (profile "preview",
// which eas.json already sets to build a plain installable .apk rather than
// an .aab), download the resulting artifact from Expo's own (temporary)
// hosting, re-upload it into R2 for a URL we control long-term, then record
// version/buildNumber/url via POST /api/internal/apk-release so the web
// Android-install banner and the app's own in-app update check both pick it
// up (both read GET /api/mobile/version).
//
// buildNumber (app.json's extra.buildNumber) is bumped here, before the
// build, so the number baked into the built app's JS bundle
// (Constants.expoConfig.extra.buildNumber, read by UpdateBanner.tsx) matches
// what this script publishes as "latest" — bumping after would ship a build
// that already thinks itself out of date.
//
// Needs on PATH: `eas` (or run via `npx eas-cli`) and a `eas login` session.
// Needs in env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
// R2_BUCKET, R2_PUBLIC_BASE_URL, APK_RELEASE_SECRET — same values as
// web/.env.local (loaded from there automatically if not already set).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(__dirname, "..");
const appJsonPath = path.join(mobileRoot, "app.json");

loadWebEnvFallback();

const REQUIRED_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "APK_RELEASE_SECRET",
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(", ")}. See web/.env.local.example.`);
  process.exit(1);
}

const API_BASE_URL = process.env.APK_RELEASE_API_BASE_URL ?? "https://www.xoldout.app";

const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));
const version = appJson.expo.version;
const buildNumber = (appJson.expo.extra?.buildNumber ?? 0) + 1;
appJson.expo.extra.buildNumber = buildNumber;
writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");
console.log(`Building ${version} (build ${buildNumber})...`);

const output = execFileSync(
  "npx",
  ["eas-cli", "build", "--platform", "android", "--profile", "preview", "--non-interactive", "--json"],
  { cwd: mobileRoot, encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] },
);
const [build] = JSON.parse(output);
const artifactUrl = build?.artifacts?.buildUrl;
if (!artifactUrl) {
  console.error("Build finished but no artifact URL was returned:", output);
  process.exit(1);
}

console.log("Downloading artifact from EAS...");
const apkRes = await fetch(artifactUrl);
if (!apkRes.ok) throw new Error(`Failed to download build artifact: ${apkRes.status}`);
const apkBytes = Buffer.from(await apkRes.arrayBuffer());

const key = `mobile-releases/xoldout-${version}-b${buildNumber}.apk`;
console.log(`Uploading to R2 as ${key}...`);
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
await s3.send(
  new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: key,
    Body: apkBytes,
    ContentType: "application/vnd.android.package-archive",
  }),
);
const url = `${process.env.R2_PUBLIC_BASE_URL}/${key}`;

console.log("Recording release...");
const releaseRes = await fetch(`${API_BASE_URL}/api/internal/apk-release`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.APK_RELEASE_SECRET}`, "Content-Type": "application/json" },
  body: JSON.stringify({ version, buildNumber, url }),
});
if (!releaseRes.ok) throw new Error(`apk-release POST failed: ${releaseRes.status} ${await releaseRes.text()}`);

console.log(`Published ${version} (build ${buildNumber}): ${url}`);

function loadWebEnvFallback() {
  const webEnvPath = path.join(mobileRoot, "..", "web", ".env.local");
  let raw;
  try {
    raw = readFileSync(webEnvPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^"(.*)"$/, "$1");
  }
}
