import { spawnSync } from "node:child_process";
import { parseEngines } from "../lib";
import { revokeSavedToken } from "../revoke";

async function post(): Promise<void> {
  const logout = (process.env.INPUT_LOGOUT || "true").trim().toLowerCase();
  const registry = process.env.STATE_loggedInRegistry;
  const engines = parseEngines(process.env.STATE_loggedInEngines);
  if (registry && logout !== "false") {
    for (const engine of engines) {
      const result = spawnSync(engine, ["logout", registry], { stdio: "inherit" });
      if (result.status !== 0) {
        console.log(`${engine} logout ${registry} failed (already logged out?).`);
      }
    }
  }

  await revokeSavedToken();
}

post();
