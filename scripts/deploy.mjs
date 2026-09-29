#!/usr/bin/env node
/* --------------------------------------------------------------------------
   npm run deploy — deploy the latest commit on GitHub `main` to Railway:
   staging first, then (after you type "yes") production. Both services,
   `api` and `web`, in each environment, at the SAME commit.

   It deploys what is on GitHub, never your local working tree — unmerged
   work cannot reach either environment this way.

     npm run deploy                  staging, then production after "yes"
     npm run deploy -- --staging     staging only
     npm run deploy -- --dry-run     show what would deploy, change nothing

   Auth is the Railway CLI's own login (`railway login`). It does NOT wait
   for GitHub's checks: run it only for commits that already passed them,
   or when you have decided to ship without them.
   -------------------------------------------------------------------------- */

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const PROJECT_ID = "1c11f29a-b569-4d14-98cf-e97a4d3ae209"; // Railway project "sponsorX"
const SERVICES = ["api", "web"];
const POLL_MS = 10_000;
const TIMEOUT_MS = 25 * 60_000;
const DONE_OK = new Set(["SUCCESS", "SLEEPING"]);
const DONE_BAD = new Set(["FAILED", "CRASHED", "REMOVED", "SKIPPED"]);

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const stagingOnly = args.has("--staging");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function run(cmd, argv) {
  return execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gql(query, variables = {}) {
  let out;
  try {
    out = run("railway", ["api", query, "--variables", JSON.stringify(variables)]);
  } catch (e) {
    fail(`Railway refused the request. Are you logged in? Run \`railway login\`.\n${e.stderr || e.message}`);
  }
  const body = JSON.parse(out);
  if (body.errors?.length) fail(`Railway: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data;
}

function latestMain() {
  try {
    run("git", ["fetch", "-q", "origin", "main"]);
    const sha = run("git", ["rev-parse", "origin/main"]);
    const subject = run("git", ["log", "-1", "--format=%s", sha]);
    return { sha, subject };
  } catch (e) {
    fail(`Could not read origin/main from GitHub.\n${e.stderr || e.message}`);
  }
}

function environments() {
  const data = gql(
    `query ($id: String!) { project(id: $id) { environments { edges { node { id name
       serviceInstances { edges { node { serviceId serviceName
         domains { serviceDomains { domain } customDomains { domain } } } } } } } } } }`,
    { id: PROJECT_ID },
  );
  const byName = {};
  for (const { node: env } of data.project.environments.edges) {
    const services = {};
    for (const { node: si } of env.serviceInstances.edges) {
      services[si.serviceName] = {
        id: si.serviceId,
        domains: [...si.domains.customDomains, ...si.domains.serviceDomains].map((d) => d.domain),
      };
    }
    byName[env.name] = { id: env.id, services };
  }
  return byName;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function deployOne(envName, env, serviceName, sha) {
  const service = env.services[serviceName];
  if (!service) fail(`${envName} has no service called "${serviceName}".`);
  const { serviceInstanceDeployV2: deploymentId } = gql(
    `mutation ($s: String!, $e: String!, $c: String) { serviceInstanceDeployV2(serviceId: $s, environmentId: $e, commitSha: $c) }`,
    { s: service.id, e: env.id, c: sha },
  );
  const label = `${envName}/${serviceName}`;
  console.log(`  ${label}: started (${deploymentId})`);

  const started = Date.now();
  let last = "";
  let approved = false;
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(POLL_MS);
    const { deployment } = gql(`query ($id: String!) { deployment(id: $id) { status } }`, { id: deploymentId });
    const status = deployment.status;
    if (status !== last) {
      console.log(`  ${label}: ${status.toLowerCase().replace(/_/g, " ")}`);
      last = status;
    }
    // Production may be set to hold deploys for approval. Typing "yes" at the
    // prompt already was that approval, so give it here.
    if (status === "NEEDS_APPROVAL" && !approved) {
      gql(`mutation ($id: String!) { deploymentApprove(id: $id) }`, { id: deploymentId });
      approved = true;
    }
    if (DONE_OK.has(status)) return { label, ok: true, status };
    if (DONE_BAD.has(status)) return { label, ok: false, status, deploymentId };
  }
  return { label, ok: false, status: "still running after 25 minutes", deploymentId };
}

async function deployEnv(envName, envs, sha) {
  const env = envs[envName];
  if (!env) fail(`Railway has no environment called "${envName}".`);
  console.log(`\n▶ Deploying to ${envName}…`);
  const results = await Promise.all(SERVICES.map((s) => deployOne(envName, env, s, sha)));
  const bad = results.filter((r) => !r.ok);
  if (bad.length) {
    fail(
      `${envName} did not deploy cleanly:\n` +
        bad.map((r) => `  ${r.label}: ${r.status} — see \`railway logs -d ${r.deploymentId}\``).join("\n"),
    );
  }
  const web = env.services.web?.domains ?? [];
  console.log(`✓ ${envName} is live${web.length ? ` at https://${web[0]}` : ""}`);
}

async function confirm(question) {
  if (!process.stdin.isTTY) fail("Production needs you to type \"yes\"; run this in a terminal.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim().toLowerCase() === "yes";
}

const { sha, subject } = latestMain();
const envs = environments();
const targets = stagingOnly ? ["staging"] : ["staging", "production"];

console.log(`Commit on GitHub main: ${sha.slice(0, 7)}  ${subject}`);
console.log(`Services: ${SERVICES.join(", ")}  ·  Environments: ${targets.join(" → ")}`);

if (dryRun) {
  for (const name of targets) {
    const env = envs[name];
    console.log(`  ${name}: ${SERVICES.map((s) => `${s}${env?.services[s] ? "" : " (MISSING)"}`).join(", ")}`);
  }
  console.log("\nDry run — nothing was deployed.");
  process.exit(0);
}

await deployEnv("staging", envs, sha);

if (!stagingOnly) {
  const go = await confirm(`\nStaging is up. Deploy ${sha.slice(0, 7)} to PRODUCTION (sponsorx.net)? Type "yes": `);
  if (!go) {
    console.log("Production not deployed.");
    process.exit(0);
  }
  await deployEnv("production", envs, sha);
}

console.log("\nDone.");
