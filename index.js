require('dotenv').config();
require('./setting/config');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { autoLoadPairs } = require('./autoload');

async function initializeSystem() {
  console.clear();
  console.log(chalk.cyan('╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('║') + chalk.bold.white('          ALIW MD WEB SYSTEM                ') + chalk.cyan('║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

  try {
    await autoLoadPairs();
    console.log(chalk.green('✅ Existing WhatsApp sessions loaded.'));
  } catch (error) {
    console.log(chalk.yellow('⚠️ Could not auto-load existing sessions:'), error.message);
  }

  try {
    require('./web');
    console.log(chalk.green('✅ Web pairing interface loaded.'));
  } catch (error) {
    console.log(chalk.red('❌ Failed to load web pairing interface:'), error.message);
  }

  const drenoxPath = path.join(__dirname, 'drenox.js');
  if (fs.existsSync(drenoxPath)) {
    try {
      require('./drenox');
      console.log(chalk.green('✅ WhatsApp command system loaded.'));
    } catch (error) {
      console.log(chalk.red('❌ Failed to load WhatsApp command system:'), error.message);
    }
  }

  console.log(chalk.cyan('\n═══════════════════════════════════════════════'));
  console.log(chalk.green('🌐 Pairing website: http://localhost:' + (process.env.PORT || 3000)));
  console.log(chalk.green('✅ Telegram control system has been removed.'));
  console.log(chalk.green('✅ Existing pairing method remains unchanged.'));
  console.log(chalk.cyan('═══════════════════════════════════════════════\n'));
}

process.on('unhandledRejection', (reason) => console.error('Unhandled Promise Rejection:', reason));
process.on('uncaughtException', (error) => console.error('Uncaught Exception:', error));
process.on('SIGINT', () => { console.log(chalk.yellow('\nShutting down gracefully...')); process.exit(0); });
process.on('SIGTERM', () => process.exit(0));

initializeSystem().catch((error) => {
  console.error(chalk.red('Fatal initialization error:'), error);
  process.exit(1);
});
