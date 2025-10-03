const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkTokens() {
  try {
    const users = await prisma.user.findMany({
      select: {
        email: true,
        plexUsername: true,
        plexToken: true,
        plexUrl: true
      }
    });
    
    console.log('Users in database:');
    users.forEach(user => {
      console.log(`Email: ${user.email}`);
      console.log(`Username: ${user.plexUsername}`);
      console.log(`Token: ${user.plexToken ? user.plexToken.substring(0, 20) + '...' : 'null'}`);
      console.log(`URL: ${user.plexUrl}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTokens();