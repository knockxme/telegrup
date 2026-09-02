import "dotenv/config";
import { hashPassword } from "../src/lib/auth";
import { db } from "../src/lib/db";

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD env vars before seeding, e.g.\n" +
      "  ADMIN_USERNAME=you ADMIN_PASSWORD=secret npm run db:seed");
  }

  const passwordHash = await hashPassword(password);
  const user = await db.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(`Seeded site user "${user.username}" (id: ${user.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
