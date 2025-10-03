#!/usr/bin/env node

/**
 * Configuration Wizard for Plex Watch Together
 * Interactive setup for environment variables and system configuration
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class ConfigurationWizard {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.config = {};
        this.colors = {
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            reset: '\x1b[0m',
            bold: '\x1b[1m'
        };
    }

    colorize(color, text) {
        return `${this.colors[color] || ''}${text}${this.colors.reset}`;
    }

    log(message, color = 'reset') {
        console.log(this.colorize(color, message));
    }

    async question(prompt, defaultValue = '') {
        const displayPrompt = defaultValue 
            ? `${prompt} ${this.colorize('yellow', `(default: ${defaultValue})`)} `
            : `${prompt} `;
        
        return new Promise((resolve) => {
            this.rl.question(displayPrompt, (answer) => {
                resolve(answer.trim() || defaultValue);
            });
        });
    }

    async confirm(prompt, defaultValue = false) {
        const defaultText = defaultValue ? 'Y/n' : 'y/N';
        const answer = await this.question(`${prompt} (${defaultText})`);
        
        if (!answer) return defaultValue;
        return answer.toLowerCase().startsWith('y');
    }

    generateSecureKey(length = 32) {
        return crypto.randomBytes(length).toString('base64');
    }

    async welcome() {
        console.clear();
        this.log('🎬 Plex Watch Together - Configuration Wizard', 'cyan');
        this.log('=' + '='.repeat(48), 'cyan');
        this.log('');
        this.log('This wizard will help you configure Plex Watch Together for your system.', 'blue');
        this.log('You can press Enter to use default values where available.', 'blue');
        this.log('');
        
        const proceed = await this.confirm('Ready to begin configuration?', true);
        if (!proceed) {
            this.log('Configuration cancelled.', 'yellow');
            process.exit(0);
        }
    }

    async configureBasicSettings() {
        this.log('\n📋 Basic Application Settings', 'green');
        this.log('-'.repeat(30), 'green');
        
        // Application Port
        const port = await this.question('Application port:', '3000');
        this.config.PORT = port;
        
        // Environment
        this.log('\nEnvironment types:');
        this.log('  1) Development (default, more verbose logging)');
        this.log('  2) Production (optimized for performance)');
        
        const envChoice = await this.question('Choose environment (1-2):', '1');
        this.config.NODE_ENV = envChoice === '2' ? 'production' : 'development';
        
        // NextAuth URL
        this.config.NEXTAUTH_URL = `http://localhost:${port}`;
        
        this.log(`\n✓ Application will run on port ${port} in ${this.config.NODE_ENV} mode`, 'green');
    }

    async configureSecuritySettings() {
        this.log('\n🔒 Security Configuration', 'green');
        this.log('-'.repeat(30), 'green');
        
        this.log('Generating secure keys...');
        
        // NextAuth Secret
        this.config.NEXTAUTH_SECRET = this.generateSecureKey(32);
        this.log('✓ NextAuth secret generated', 'green');
        
        // Encryption Key
        this.config.ENCRYPTION_KEY = this.generateSecureKey(32);
        this.log('✓ Encryption key generated', 'green');
        
        // Rate Limiting
        const enableRateLimit = await this.confirm('Enable rate limiting for security?', true);
        this.config.RATE_LIMIT_ENABLED = enableRateLimit.toString();
        
        if (enableRateLimit) {
            const isDev = this.config.NODE_ENV === 'development';
            this.config.RATE_LIMIT_GENERAL_POINTS = isDev ? '1000' : '300';
            this.config.RATE_LIMIT_AUTH_POINTS = isDev ? '100' : '50';
            this.log('✓ Rate limiting configured for ' + this.config.NODE_ENV, 'green');
        }
    }

    async configurePlexSettings() {
        this.log('\n🎬 Plex Server Configuration', 'green');
        this.log('-'.repeat(30), 'green');
        
        this.log('Please ensure your Plex Media Server is running and accessible.');
        this.log('You\'ll need your Plex authentication token.');
        this.log('');
        this.log('To find your Plex token:');
        this.log('1. Open Plex Web App');
        this.log('2. Go to Settings → Account');
        this.log('3. Look for "X-Plex-Token" in the URL or use browser dev tools');
        this.log('');
        
        // Plex URL
        const plexUrl = await this.question('Plex server URL (e.g., http://localhost:32400):');
        if (!plexUrl) {
            this.log('⚠️  Plex URL is required for the application to work', 'yellow');
        }
        this.config.PLEX_BASE_URL = plexUrl;
        
        // Plex Token
        const plexToken = await this.question('Plex authentication token:');
        if (!plexToken) {
            this.log('⚠️  Plex token is required for authentication', 'yellow');
        }
        this.config.PLEX_TOKEN = plexToken;
        
        if (plexUrl && plexToken) {
            this.log('✓ Plex configuration completed', 'green');
        }
    }

    async configureDatabaseSettings() {
        this.log('\n🗄️  Database Configuration', 'green');
        this.log('-'.repeat(30), 'green');
        
        this.log('Database options:');
        this.log('  1) SQLite (recommended for development/small deployments)');
        this.log('  2) PostgreSQL (recommended for production)');
        this.log('  3) Custom database URL');
        
        const dbChoice = await this.question('Choose database type (1-3):', '1');
        
        switch (dbChoice) {
            case '2':
                await this.configurePostgreSQL();
                break;
            case '3':
                await this.configureCustomDatabase();
                break;
            default:
                await this.configureSQLite();
                break;
        }
    }

    async configureSQLite() {
        this.log('\nSQLite Configuration:', 'blue');
        const dbPath = await this.question('Database file path:', './prisma/dev.db');
        this.config.DATABASE_URL = `file:${dbPath}`;
        
        // Ensure directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            this.log(`✓ Created directory: ${dbDir}`, 'green');
        }
        
        this.log('✓ SQLite database configured', 'green');
    }

    async configurePostgreSQL() {
        this.log('\nPostgreSQL Configuration:', 'blue');
        
        const host = await this.question('Database host:', 'localhost');
        const port = await this.question('Database port:', '5432');
        const database = await this.question('Database name:', 'plexwatchtogether');
        const username = await this.question('Database username:', 'postgres');
        const password = await this.question('Database password:');
        
        this.config.DATABASE_URL = `postgresql://${username}:${password}@${host}:${port}/${database}`;
        this.log('✓ PostgreSQL database configured', 'green');
    }

    async configureCustomDatabase() {
        this.log('\nCustom Database Configuration:', 'blue');
        const customUrl = await this.question('Enter complete database URL:');
        this.config.DATABASE_URL = customUrl;
        this.log('✓ Custom database configured', 'green');
    }

    async configureOptionalServices() {
        this.log('\n⚙️  Optional Services', 'green');
        this.log('-'.repeat(30), 'green');
        
        // Redis Configuration
        const useRedis = await this.confirm('Configure Redis for caching?', false);
        if (useRedis) {
            const redisUrl = await this.question('Redis URL:', 'redis://localhost:6379');
            this.config.REDIS_URL = redisUrl;
            this.log('✓ Redis configured for caching', 'green');
        }
        
        // Video Transcoding
        this.log('\nVideo Transcoding Settings:');
        
        // Check if FFmpeg is available
        let ffmpegAvailable = false;
        try {
            execSync('ffmpeg -version', { stdio: 'ignore' });
            ffmpegAvailable = true;
            this.log('✓ FFmpeg detected', 'green');
        } catch {
            this.log('⚠️  FFmpeg not found - transcoding will be limited', 'yellow');
        }
        
        const ffmpegPath = await this.question('FFmpeg path:', ffmpegAvailable ? 'ffmpeg' : '');
        if (ffmpegPath) {
            this.config.FFMPEG_PATH = ffmpegPath;
            
            this.log('Quality options: low, medium, high');
            const quality = await this.question('Transcoding quality:', 'medium');
            this.config.TRANSCODE_QUALITY = quality;
            
            const maxTranscodes = await this.question('Max concurrent transcodes:', '3');
            this.config.MAX_CONCURRENT_TRANSCODES = maxTranscodes;
            
            this.log('✓ Video transcoding configured', 'green');
        }
    }

    async reviewConfiguration() {
        this.log('\n📋 Configuration Review', 'cyan');
        this.log('=' + '='.repeat(30), 'cyan');
        
        this.log('\nBasic Settings:', 'yellow');
        this.log(`  Port: ${this.config.PORT}`);
        this.log(`  Environment: ${this.config.NODE_ENV}`);
        this.log(`  URL: ${this.config.NEXTAUTH_URL}`);
        
        this.log('\nSecurity:', 'yellow');
        this.log(`  Rate Limiting: ${this.config.RATE_LIMIT_ENABLED}`);
        this.log('  Secrets: Generated automatically ✓');
        
        this.log('\nPlex Server:', 'yellow');
        this.log(`  URL: ${this.config.PLEX_BASE_URL || 'Not configured'}`);
        this.log(`  Token: ${this.config.PLEX_TOKEN ? 'Configured ✓' : 'Not configured'}`);
        
        this.log('\nDatabase:', 'yellow');
        const dbType = this.config.DATABASE_URL?.startsWith('postgresql') ? 'PostgreSQL' : 
                      this.config.DATABASE_URL?.startsWith('file:') ? 'SQLite' : 'Custom';
        this.log(`  Type: ${dbType}`);
        
        if (this.config.REDIS_URL) {
            this.log('\nCaching:', 'yellow');
            this.log(`  Redis: ${this.config.REDIS_URL}`);
        }
        
        if (this.config.FFMPEG_PATH) {
            this.log('\nVideo Transcoding:', 'yellow');
            this.log(`  FFmpeg: ${this.config.FFMPEG_PATH}`);
            this.log(`  Quality: ${this.config.TRANSCODE_QUALITY}`);
            this.log(`  Max Concurrent: ${this.config.MAX_CONCURRENT_TRANSCODES}`);
        }
        
        this.log('');
        return await this.confirm('Save this configuration?', true);
    }

    generateEnvContent() {
        const lines = [
            '# Plex Watch Together Configuration',
            '# Generated by Configuration Wizard',
            `# Created: ${new Date().toISOString()}`,
            '',
            '# Application Settings',
            `NEXTAUTH_URL=${this.config.NEXTAUTH_URL}`,
            `NEXTAUTH_SECRET=${this.config.NEXTAUTH_SECRET}`,
            `PORT=${this.config.PORT}`,
            `NODE_ENV=${this.config.NODE_ENV}`,
            '',
            '# Database',
            `DATABASE_URL=${this.config.DATABASE_URL}`,
            '',
            '# Plex Configuration',
            `PLEX_BASE_URL=${this.config.PLEX_BASE_URL || ''}`,
            `PLEX_TOKEN=${this.config.PLEX_TOKEN || ''}`,
            '',
            '# Security',
            `ENCRYPTION_KEY=${this.config.ENCRYPTION_KEY}`,
            `RATE_LIMIT_ENABLED=${this.config.RATE_LIMIT_ENABLED}`,
        ];

        if (this.config.RATE_LIMIT_ENABLED === 'true') {
            lines.push(
                `RATE_LIMIT_GENERAL_POINTS=${this.config.RATE_LIMIT_GENERAL_POINTS}`,
                `RATE_LIMIT_AUTH_POINTS=${this.config.RATE_LIMIT_AUTH_POINTS}`
            );
        }

        if (this.config.REDIS_URL) {
            lines.push('', '# Caching', `REDIS_URL=${this.config.REDIS_URL}`);
        }

        if (this.config.FFMPEG_PATH) {
            lines.push(
                '',
                '# Video Transcoding',
                `FFMPEG_PATH=${this.config.FFMPEG_PATH}`,
                `TRANSCODE_QUALITY=${this.config.TRANSCODE_QUALITY}`,
                `MAX_CONCURRENT_TRANSCODES=${this.config.MAX_CONCURRENT_TRANSCODES}`
            );
        }

        lines.push('', '# Additional Settings (optional)', '#CUSTOM_VAR=value', '');
        
        return lines.join('\n');
    }

    async saveConfiguration() {
        const envContent = this.generateEnvContent();
        const envFile = '.env.local';
        
        // Backup existing file if it exists
        if (fs.existsSync(envFile)) {
            const backup = `${envFile}.backup.${Date.now()}`;
            fs.copyFileSync(envFile, backup);
            this.log(`✓ Existing configuration backed up to: ${backup}`, 'blue');
        }
        
        fs.writeFileSync(envFile, envContent, 'utf8');
        this.log(`✓ Configuration saved to: ${envFile}`, 'green');
        
        // Create example production file
        const prodContent = envContent.replace('NODE_ENV=development', 'NODE_ENV=production');
        fs.writeFileSync('.env.production.example', prodContent, 'utf8');
        this.log('✓ Production example created: .env.production.example', 'green');
    }

    async showNextSteps() {
        this.log('\n🚀 Next Steps', 'cyan');
        this.log('=' + '='.repeat(15), 'cyan');
        
        this.log('\n1. Install dependencies (if not already done):', 'yellow');
        this.log('   npm install', 'blue');
        
        this.log('\n2. Set up the database:', 'yellow');
        this.log('   npx prisma generate', 'blue');
        this.log('   npx prisma db push', 'blue');
        
        this.log('\n3. Validate your configuration:', 'yellow');
        this.log('   node validate-env.js', 'blue');
        
        this.log('\n4. Start the development server:', 'yellow');
        this.log('   npm run dev', 'blue');
        
        this.log('\n5. Access the application:', 'yellow');
        this.log(`   http://localhost:${this.config.PORT}`, 'blue');
        
        if (!this.config.PLEX_BASE_URL || !this.config.PLEX_TOKEN) {
            this.log('\n⚠️  Important:', 'red');
            this.log('   Plex server configuration is incomplete.', 'red');
            this.log('   Update your .env.local file with correct Plex settings.', 'red');
        }
        
        this.log('\n📚 Documentation:', 'yellow');
        this.log('   README.md - Project overview and setup', 'blue');
        this.log('   DEPLOYMENT.md - Production deployment guide', 'blue');
        this.log('');
    }

    async run() {
        try {
            await this.welcome();
            await this.configureBasicSettings();
            await this.configureSecuritySettings();
            await this.configurePlexSettings();
            await this.configureDatabaseSettings();
            await this.configureOptionalServices();
            
            const confirmed = await this.reviewConfiguration();
            if (confirmed) {
                await this.saveConfiguration();
                await this.showNextSteps();
                this.log('✅ Configuration wizard completed successfully!', 'green');
            } else {
                this.log('Configuration cancelled.', 'yellow');
            }
            
        } catch (error) {
            this.log(`\n❌ Configuration failed: ${error.message}`, 'red');
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }
}

// Run wizard if called directly
if (require.main === module) {
    const wizard = new ConfigurationWizard();
    wizard.run().catch(error => {
        console.error('Wizard failed:', error.message);
        process.exit(1);
    });
}

module.exports = ConfigurationWizard;