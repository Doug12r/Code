const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function clearOldTokens() {
  try {
    const result = await prisma.user.updateMany({
      where: {
        plexToken: { not: null }
      },
      data: {
        plexToken: null
      }
    });
    
    console.log(`Cleared ${result.count} old encrypted tokens`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

clearOldTokens();