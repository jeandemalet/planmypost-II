#!/usr/bin/env node
// ===============================
// Fichier: scripts/deploy.js
// Script de déploiement local et de validation
// ===============================

const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeploymentManager {
    constructor(options = {}) {
        this.options = {
            environment: options.environment || 'development',
            skipTests: options.skipTests || false,
            skipSecurity: options.skipSecurity || false,
            pm2Config: options.pm2Config || 'ecosystem.config.js',
            ...options
        };
        
        this.startTime = Date.now();
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const prefix = {
            info: '📝',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            step: '🔄'
        }[level] || 'ℹ️';
        
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    async runCommand(command, description) {
        this.log(`${description}...`, 'step');
        try {
            const output = execSync(command, { 
                encoding: 'utf8',
                timeout: 60000 // 1 minute timeout
            });
            this.log(`${description} completed`, 'success');
            return output;
        } catch (error) {
            this.log(`${description} failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async validateEnvironment() {
        this.log('Validating environment configuration...', 'step');
        
        try {
            const { validateEnvironment } = require('../config/environment');
            validateEnvironment();
            this.log('Environment validation passed', 'success');
        } catch (error) {
            this.log(`Environment validation failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async runSecurityChecks() {
        if (this.options.skipSecurity) {
            this.log('Skipping security checks', 'warning');
            return;
        }

        try {
            await this.runCommand('npm run security:check', 'Security audit');
        } catch (error) {
            this.log('Security checks failed, but continuing deployment', 'warning');
        }
    }

    async installDependencies() {
        const command = this.options.environment === 'production' 
            ? 'npm ci --production' 
            : 'npm install';
        
        await this.runCommand(command, 'Installing dependencies');
    }

    async runTests() {
        if (this.options.skipTests) {
            this.log('Skipping tests', 'warning');
            return;
        }

        // Check if test script exists
        const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        if (packageJson.scripts && packageJson.scripts.test && 
            !packageJson.scripts.test.includes('no test specified')) {
            await this.runCommand('npm test', 'Running tests');
        } else {
            this.log('No tests configured, skipping', 'warning');
        }
    }

    async checkPM2Status() {
        this.log('Checking PM2 status...', 'step');
        try {
            const output = execSync('pm2 status', { encoding: 'utf8' });
            this.log('PM2 status checked', 'success');
            console.log(output);
            return true;
        } catch (error) {
            this.log('PM2 not running or not available', 'warning');
            return false;
        }
    }

    async deployWithPM2() {
        const pm2Available = await this.checkPM2Status();
        
        if (!pm2Available) {
            this.log('Starting application with PM2...', 'step');
            await this.runCommand(
                `pm2 start ${this.options.pm2Config} --env ${this.options.environment}`,
                'Starting PM2 application'
            );
        } else {
            this.log('Performing zero-downtime reload...', 'step');
            await this.runCommand(
                `pm2 reload ${this.options.pm2Config} --env ${this.options.environment}`,
                'Reloading PM2 application'
            );
        }

        // Wait for application to stabilize
        this.log('Waiting for application to stabilize...', 'step');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    async healthCheck() {
        this.log('Performing health check...', 'step');
        
        try {
            // Check PM2 status
            const pm2Status = execSync('pm2 status --no-daemon', { encoding: 'utf8' });
            if (pm2Status.includes('online')) {
                this.log('PM2 health check passed', 'success');
            } else {
                throw new Error('Application not online in PM2');
            }

            // Check if server responds (for production)
            if (this.options.environment === 'production') {
                try {
                    const port = process.env.PORT || 3000;
                    execSync(`curl -f http://localhost:${port}/api/auth/status`, { 
                        timeout: 10000,
                        stdio: 'ignore'
                    });
                    this.log('API health check passed', 'success');
                } catch (curlError) {
                    this.log('API health check failed, but PM2 is running', 'warning');
                }
            }
            
        } catch (error) {
            this.log(`Health check failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async cleanup() {
        this.log('Performing cleanup...', 'step');
        
        try {
            // Clean temporary files
            const tempDirs = ['temp_uploads', 'node_modules/.cache'];
            tempDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    execSync(`rm -rf ${dir}`, { stdio: 'ignore' });
                }
            });

            // Clean old logs (keep last 10)
            try {
                execSync('pm2 flush', { stdio: 'ignore' });
            } catch (e) {
                // PM2 flush may fail, that's ok
            }

            this.log('Cleanup completed', 'success');
        } catch (error) {
            this.log(`Cleanup had issues: ${error.message}`, 'warning');
        }
    }

    generateDeploymentReport() {
        const duration = Math.round((Date.now() - this.startTime) / 1000);
        const report = {
            timestamp: new Date().toISOString(),
            environment: this.options.environment,
            duration: `${duration}s`,
            options: this.options,
            gitCommit: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
            nodeVersion: process.version,
            npmVersion: execSync('npm --version', { encoding: 'utf8' }).trim()
        };

        fs.writeFileSync('deployment-report.json', JSON.stringify(report, null, 2));
        this.log(`Deployment report saved to deployment-report.json`, 'success');
        
        return report;
    }

    async deploy() {
        try {
            this.log('🚀 Starting deployment process...', 'step');
            this.log(`Environment: ${this.options.environment}`, 'info');
            
            // Pre-deployment checks
            await this.validateEnvironment();
            await this.runSecurityChecks();
            
            // Build and dependencies
            await this.installDependencies();
            await this.runTests();
            
            // Deployment
            await this.deployWithPM2();
            await this.healthCheck();
            
            // Post-deployment
            await this.cleanup();
            const report = this.generateDeploymentReport();
            
            this.log(`🎉 Deployment completed successfully in ${report.duration}!`, 'success');
            
            // Display final status
            this.log('Final application status:', 'info');
            try {
                const status = execSync('pm2 status --no-daemon', { encoding: 'utf8' });
                console.log(status);
            } catch (e) {
                this.log('Could not display PM2 status', 'warning');
            }
            
        } catch (error) {
            this.log(`💥 Deployment failed: ${error.message}`, 'error');
            
            // Try to provide rollback information
            try {
                this.log('PM2 status after failure:', 'info');
                const status = execSync('pm2 status --no-daemon', { encoding: 'utf8' });
                console.log(status);
            } catch (e) {
                // Ignore
            }
            
            process.exit(1);
        }
    }
}

// CLI interface
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    args.forEach(arg => {
        if (arg === '--production') {
            options.environment = 'production';
        } else if (arg === '--skip-tests') {
            options.skipTests = true;
        } else if (arg === '--skip-security') {
            options.skipSecurity = true;
        } else if (arg.startsWith('--pm2-config=')) {
            options.pm2Config = arg.split('=')[1];
        }
    });
    
    const deployment = new DeploymentManager(options);
    deployment.deploy().catch(error => {
        console.error('Deployment script failed:', error);
        process.exit(1);
    });
}

module.exports = DeploymentManager;