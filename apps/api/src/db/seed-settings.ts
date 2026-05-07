import { log } from "../lib/logger.js";
import { seedDefaults } from "../services/settings.js";

async function main() {
  log.info({ event: "seed.settings.start" }, "seeding default settings");
  const result = await seedDefaults();
  log.info(
    { event: "seed.settings.done", seeded: result.seeded },
    "settings seed complete (existing rows untouched)",
  );
  process.exit(0);
}

main().catch((err) => {
  log.error({ event: "seed.settings.failed", err }, "settings seed failed");
  process.exit(1);
});
