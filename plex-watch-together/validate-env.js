#!/usr/bin/env node

/**
 * Environment Validation Script
 * Validates system environment and configuration for Plex Watch Together
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

class EnvironmentValidator {
    constructor() {
        this.results = [];
        this.warnings = [];
        this.errors = [];
        this.config = {};
    }

    log(type, message, details = '') {
        const timestamp = new Date().toISOString();
        const color = colors[type] || colors.reset;
        
        console.log(`${color}[${type.toUpperCase()}]${colors.reset} ${message}`);
        if (details) {
            console.log(`${colors.blue}  → ${details}${colors.reset}`);
        }

        this.results.push({ timestamp, type, message, details });
    }

    async validateNodeEnvironment() {
        this.log('info', 'Validating Node.js environment...');

        try {
            const nodeVersion = process.version;
            const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
            
            if (majorVersion >= 18) {
                this.log('green', `Node.js ${nodeVersion} ✓`, 'Supported version');
            } else {
                this.log('red', `Node.js ${nodeVersion} ✗`, 'Version 18+ required');
                this.errors.push('Node.js version too old');
            }

            // Check npm
            try {
                const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
                this.log('green', `npm ${npmVersion} ✓`);
            } catch (error) {
                this.log('red', 'npm not found ✗');
                this.errors.push('npm not available');
            }

        } catch (error) {
            this.log('red', 'Node.js environment check failed', error.message);
            this.errors.push('Node.js environment invalid');
        }
    }

    validateProjectStructure() {
        this.log('info', 'Validating project structure...');

        const requiredFiles = [
            'package.json',
            'next.config.ts',
            'tsconfig.json',
            'src/app/layout.tsx',
            'src/app/page.tsx',
            'prisma/schema.prisma'
        ];

        const requiredDirectories = [
            'src/app',
            'src/components',
            'src/lib',
            'src/types',
            'prisma'
        ];

        let structureValid = true;

        // Check files
        for (const file of requiredFiles) {
            if (fs.existsSync(file)) {
                this.log('green', `${file} ✓`);
            } else {
                this.log('red', `${file} ✗`, 'Required file missing');
                this.errors.push(`Missing file: ${file}`);
                structureValid = false;
            }
        }

        // Check directories
        for (const dir of requiredDirectories) {
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                this.log('green', `${dir}/ ✓`);
            } else {
                this.log('red', `${dir}/ ✗`, 'Required directory missing');
                this.errors.push(`Missing directory: ${dir}`);
                structureValid = false;
            }
        }

        if (structureValid) {
            this.log('green', 'Project structure validated ✓');
        }
    }

    loadEnvironmentConfig() {
        this.log('info', 'Loading environment configuration...');

        const envFiles = ['.env.local', '.env', '.env.development'];
        let configLoaded = false;

        for (const envFile of envFiles) {
            if (fs.existsSync(envFile)) {
                try {
                    const envContent = fs.readFileSync(envFile, 'utf8');
                    const lines = envContent.split('\n');
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed && !trimmed.startsWith('#')) {
                            const [key, ...valueParts] = trimmed.split('=');
                            if (key && valueParts.length > 0) {
                                this.config[key] = valueParts.join('=');
                            }
                        }
                    }
                    
                    this.log('green', `Loaded ${envFile} ✓`);
                    configLoaded = true;
                } catch (error) {
                    this.log('yellow', `Error reading ${envFile}`, error.message);
                }
            }
        }

        if (!configLoaded) {
            this.log('yellow', 'No environment file found', 'Will use default configuration');
            this.warnings.push('No environment configuration found');
        }
    }

    validateEnvironmentVariables() {
        this.log('info', 'Validating environment variables...');

        const requiredVars = [
            { key: 'NEXTAUTH_SECRET', description: 'NextAuth.js secret key' },
            { key: 'PLEX_TOKEN', description: 'Plex authentication token' },
            { key: 'PLEX_BASE_URL', description: 'Plex server URL' },
            { key: 'ENCRYPTION_KEY', description: 'Data encryption key' }
        ];

        const optionalVars = [
            { key: 'DATABASE_URL', description: 'Database connection string', default: 'file:./dev.db' },
            { key: 'REDIS_URL', description: 'Redis connection string' },
            { key: 'PORT', description: 'Application port', default: '3000' },
            { key: 'NODE_ENV', description: 'Environment mode', default: 'development' }
        ];

        // Check required variables
        for (const { key, description } of requiredVars) {
            const value = this.config[key] || process.env[key];
            if (value && value.length > 0) {
                this.log('green', `${key} ✓`, description);
            } else {
                this.log('red', `${key} ✗`, `Required: ${description}`);
                this.errors.push(`Missing required environment variable: ${key}`);
            }
        }

        // Check optional variables
        for (const { key, description, default: defaultValue } of optionalVars) {
            const value = this.config[key] || process.env[key];
            if (value && value.length > 0) {
                this.log('green', `${key} ✓`, description);
            } else if (defaultValue) {
                this.log('yellow', `${key} (default)`, `${description} - using: ${defaultValue}`);
            } else {
                this.log('blue', `${key} (optional)`, description);
            }
        }
    }

    async validatePlexConnection() {
        this.log('info', 'Validating Plex server connection...');

        const plexUrl = this.config.PLEX_BASE_URL || process.env.PLEX_BASE_URL;
        const plexToken = this.config.PLEX_TOKEN || process.env.PLEX_TOKEN;

        if (!plexUrl || !plexToken) {
            this.log('yellow', 'Plex validation skipped', 'Missing URL or token');
            return;
        }

        try {
            const url = new URL('/identity', plexUrl);
            url.searchParams.append('X-Plex-Token', plexToken);

            await this.makeRequest(url.toString());
            this.log('green', 'Plex server connection ✓', `Connected to ${plexUrl}`);

        } catch (error) {
            this.log('red', 'Plex server connection ✗', error.message);
            this.errors.push('Plex server unreachable');
        }
    }

    async validateDatabaseConnection() {
        this.log('info', 'Validating database configuration...');

        const databaseUrl = this.config.DATABASE_URL || process.env.DATABASE_URL || 'file:./dev.db';

        if (databaseUrl.startsWith('file:')) {
            // SQLite validation
            const dbPath = databaseUrl.replace('file:', '');
            const dbDir = path.dirname(dbPath);
            
            if (!fs.existsSync(dbDir)) {
                try {
                    fs.mkdirSync(dbDir, { recursive: true });
                    this.log('green', 'Database directory created ✓');
                } catch (error) {
                    this.log('red', 'Cannot create database directory ✗', error.message);
                    this.errors.push('Database directory not accessible');
                    return;
                }
            }

            this.log('green', 'SQLite database configuration ✓', `Path: ${dbPath}`);

        } else if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
            // PostgreSQL validation (basic URL parsing)
            try {
                const url = new URL(databaseUrl);
                this.log('green', 'PostgreSQL configuration ✓', `Host: ${url.hostname}:${url.port || 5432}`);
            } catch (error) {
                this.log('red', 'Invalid PostgreSQL URL ✗', error.message);
                this.errors.push('Invalid database URL');
            }

        } else {
            this.log('yellow', 'Unknown database type', `URL: ${databaseUrl.substring(0, 20)}...`);
        }
    }

    validateDependencies() {
        this.log('info', 'Validating dependencies...');

        try {
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            
            const criticalDeps = [
                'next',
                'react',
                'prisma',
                '@prisma/client',
                'next-auth',
                'bcryptjs',
                'socket.io'
            ];

            let dependenciesValid = true;

            for (const dep of criticalDeps) {
                if (packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep]) {
                    this.log('green', `${dep} ✓`);
                } else {
                    this.log('red', `${dep} ✗`, 'Critical dependency missing');
                    this.errors.push(`Missing dependency: ${dep}`);
                    dependenciesValid = false;
                }
            }

            if (dependenciesValid) {
                // Check if node_modules exists
                if (fs.existsSync('node_modules')) {
                    this.log('green', 'Dependencies installed ✓');
                } else {
                    this.log('yellow', 'Dependencies not installed', 'Run: npm install');
                    this.warnings.push('Dependencies not installed');
                }
            }

        } catch (error) {
            this.log('red', 'Cannot validate dependencies', error.message);
            this.errors.push('package.json not readable');
        }
    }

    async validateSystemResources() {
        this.log('info', 'Validating system resources...');

        try {
            // Check available disk space
            const stats = fs.statSync('.');
            this.log('green', 'File system access ✓');

            // Check memory usage
            const memoryUsage = process.memoryUsage();
            const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
            
            this.log('green', 'Memory check ✓', `Heap: ${heapUsedMB}MB/${heapTotalMB}MB`);

            // Check for FFmpeg (optional)
            try {
                execSync('ffmpeg -version', { stdio: 'ignore' });
                this.log('green', 'FFmpeg available ✓', 'Video transcoding supported');
            } catch {
                this.log('yellow', 'FFmpeg not found', 'Video transcoding may be limited');
                this.warnings.push('FFmpeg not available for transcoding');
            }

        } catch (error) {
            this.log('red', 'System resource check failed', error.message);
            this.errors.push('System resources insufficient');
        }
    }

    async makeRequest(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https:') ? https : http;
            const timeout = 10000; // 10 seconds

            const req = client.get(url, { timeout }, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(res);
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                }
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Connection timeout'));
            });

            req.on('error', reject);
        });
    }

    generateReport() {
        console.log('\n' + '='.repeat(50));
        console.log(`${colors.bold}VALIDATION SUMMARY${colors.reset}`);
        console.log('='.repeat(50));

        if (this.errors.length === 0) {
            console.log(`${colors.green}✓ Environment validation passed!${colors.reset}`);
        } else {
            console.log(`${colors.red}✗ Environment validation failed!${colors.reset}`);
            console.log(`\n${colors.red}ERRORS:${colors.reset}`);
            this.errors.forEach(error => {
                console.log(`${colors.red}  • ${error}${colors.reset}`);
            });
        }

        if (this.warnings.length > 0) {
            console.log(`\n${colors.yellow}WARNINGS:${colors.reset}`);
            this.warnings.forEach(warning => {
                console.log(`${colors.yellow}  • ${warning}${colors.reset}`);
            });
        }

        console.log(`\n${colors.blue}RECOMMENDATIONS:${colors.reset}`);
        
        if (this.errors.length > 0) {
            console.log(`${colors.blue}  • Fix all errors before starting the application${colors.reset}`);
            console.log(`${colors.blue}  • Run this validation again after making changes${colors.reset}`);
        }
        
        if (this.warnings.length > 0) {
            console.log(`${colors.blue}  • Address warnings for optimal performance${colors.reset}`);
        }
        
        console.log(`${colors.blue}  • Keep environment files secure and backed up${colors.reset}`);
        console.log(`${colors.blue}  • Monitor application logs for runtime issues${colors.reset}`);

        return this.errors.length === 0;
    }

    async run() {
        console.log(`${colors.bold}🔍 Plex Watch Together - Environment Validation${colors.reset}`);
        console.log('=' + '='.repeat(48) + '\n');

        await this.validateNodeEnvironment();
        this.validateProjectStructure();
        this.loadEnvironmentConfig();
        this.validateEnvironmentVariables();
        await this.validatePlexConnection();
        await this.validateDatabaseConnection();
        this.validateDependencies();
        await this.validateSystemResources();

        const success = this.generateReport();
        process.exit(success ? 0 : 1);
    }
}

// Run validation if called directly
if (require.main === module) {
    const validator = new EnvironmentValidator();
    validator.run().catch(error => {
        console.error(`${colors.red}Validation failed:${colors.reset}`, error.message);
        process.exit(1);
    });
}

module.exports = EnvironmentValidator;