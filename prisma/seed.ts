import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const teams = ['Alpha Team', 'Beta Team', 'Gamma Team', 'Delta Team'];

  for (const name of teams) {
    await prisma.team.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log(`Seeded ${teams.length} teams.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
