import { seedDefaults } from "../services/settings.js";

async function main() {
  console.info("Seeding default settings...");
  const result = await seedDefaults();
  console.info(`Seeded ${result.seeded} settings rows (existing rows untouched).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Settings seed failed:", err);
  process.exit(1);
});
