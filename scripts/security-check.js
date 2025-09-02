#!/usr/bin/env node
// ===============================
// Fichier: scripts/security-check.js
// Script automatisé de vérification de sécurité
// ===============================

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class SecurityChecker {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.info = [];
    }

    log(level, message) {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${message}`;
        
        switch(level) {
            case 'error':
                this.errors.push(formattedMessage);
                console.error(`🔴 ERROR: ${message}`);
                break;
            case 'warning':
                this.warnings.push(formattedMessage);
                console.warn(`⚠️  WARNING: ${message}`);
                break;
            case 'info':
                this.info.push(formattedMessage);
                console.log(`ℹ️  INFO: ${message}`);
                break;
        }
    }

    async runNpmAudit() {
        this.log('info', 'Running npm audit...');
        try {
            const auditOutput = execSync('npm audit --audit-level=low --json', { 
                encoding: 'utf8',
                cwd: __dirname + '/..'
            });
            
            const auditResult = JSON.parse(auditOutput);
            
            if (auditResult.metadata.vulnerabilities.total === 0) {
                this.log('info', 'No vulnerabilities found in dependencies');
                return true;
            } else {
                const { low, moderate, high, critical } = auditResult.metadata.vulnerabilities;
                this.log('warning', `Found vulnerabilities: ${critical} critical, ${high} high, ${moderate} moderate, ${low} low`);
                
                if (critical > 0 || high > 0) {
                    this.log('error', 'Critical or high severity vulnerabilities detected!');
                    return false;
                }
                return true;
            }
        } catch (error) {
            if (error.status === 1) {
                // npm audit found vulnerabilities
                this.log('warning', 'npm audit found vulnerabilities (exit code 1)');
                return false;
            }
            this.log('error', `npm audit failed: ${error.message}`);
            return false;
        }
    }

    checkOutdatedPackages() {
        this.log('info', 'Checking for outdated packages...');
        try {
            const outdatedOutput = execSync('npm outdated --json', { 
                encoding: 'utf8',
                cwd: __dirname + '/..'
            });
            
            if (outdatedOutput.trim()) {
                const outdated = JSON.parse(outdatedOutput);
                const outdatedCount = Object.keys(outdated).length;
                
                if (outdatedCount > 0) {
                    this.log('warning', `${outdatedCount} packages are outdated`);
                    
                    // Check for major version differences
                    Object.entries(outdated).forEach(([pkg, info]) => {
                        const currentMajor = info.current.split('.')[0];
                        const wantedMajor = info.wanted.split('.')[0];
                        const latestMajor = info.latest.split('.')[0];
                        
                        if (currentMajor !== latestMajor) {
                            this.log('warning', `${pkg}: major version difference (current: ${info.current}, latest: ${info.latest})`);
                        }
                    });
                }
            } else {
                this.log('info', 'All packages are up to date');
            }
            return true;
        } catch (error) {
            if (error.status === 1) {
                // npm outdated found outdated packages
                this.log('info', 'Some packages are outdated (this is normal)');
                return true;
            }
            this.log('error', `Failed to check outdated packages: ${error.message}`);
            return false;
        }
    }

    checkEnvironmentSecurity() {
        this.log('info', 'Checking environment security...');
        
        const envPath = path.join(__dirname, '..', '.env');
        if (!fs.existsSync(envPath)) {
            this.log('warning', '.env file not found');
            return true;
        }

        const envContent = fs.readFileSync(envPath, 'utf8');
        
        // Check for default/weak secrets
        const weakSecrets = [
            'secret',
            'password',
            'default',
            '123456',
            'changeme',
            'a8b3d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d1e2f3'
        ];

        weakSecrets.forEach(weak => {
            if (envContent.includes(weak)) {
                this.log('error', `Potential weak secret detected in .env file: ${weak}`);
            }
        });

        // Check for required production variables
        if (process.env.NODE_ENV === 'production') {
            const requiredProdVars = ['JWT_SECRET', 'MONGODB_URI', 'SESSION_SECRET', 'FRONTEND_URL'];
            requiredProdVars.forEach(varName => {
                if (!process.env[varName]) {
                    this.log('error', `Required production environment variable missing: ${varName}`);
                }
            });
        }

        return this.errors.filter(e => e.includes('weak secret') || e.includes('missing')).length === 0;
    }

    checkFilePermissions() {
        this.log('info', 'Checking file permissions...');
        
        const sensitiveFiles = [
            '.env',
            'config/environment.js',
            'middleware/auth.js',
            'package.json'
        ];

        sensitiveFiles.forEach(file => {
            const filePath = path.join(__dirname, '..', file);
            if (fs.existsSync(filePath)) {
                try {
                    const stats = fs.statSync(filePath);
                    // Check if file is readable by others (basic check)
                    if (stats.mode & parseInt('044', 8)) {
                        this.log('warning', `File ${file} may be readable by others`);
                    }
                } catch (error) {
                    this.log('warning', `Could not check permissions for ${file}: ${error.message}`);
                }
            }
        });

        return true;
    }

    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            status: this.errors.length === 0 ? 'PASS' : 'FAIL',
            summary: {
                errors: this.errors.length,
                warnings: this.warnings.length,
                info: this.info.length
            },
            errors: this.errors,
            warnings: this.warnings,
            info: this.info
        };

        const reportPath = path.join(__dirname, '..', 'security-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        this.log('info', `Security report saved to ${reportPath}`);
        return report;
    }

    async run() {
        console.log('🔒 Starting Security Check...\n');
        
        const checks = [
            { name: 'NPM Audit', fn: () => this.runNpmAudit() },
            { name: 'Outdated Packages', fn: () => this.checkOutdatedPackages() },
            { name: 'Environment Security', fn: () => this.checkEnvironmentSecurity() },
            { name: 'File Permissions', fn: () => this.checkFilePermissions() }
        ];

        let allPassed = true;

        for (const check of checks) {
            console.log(`\n🔍 Running ${check.name}...`);
            try {
                const result = await check.fn();
                if (!result) {
                    allPassed = false;
                }
            } catch (error) {
                this.log('error', `${check.name} failed: ${error.message}`);
                allPassed = false;
            }
        }

        const report = this.generateReport();
        
        console.log('\n📊 Security Check Summary:');
        console.log(`  Status: ${report.status}`);
        console.log(`  Errors: ${report.summary.errors}`);
        console.log(`  Warnings: ${report.summary.warnings}`);
        console.log(`  Info: ${report.summary.info}`);

        if (allPassed && report.summary.errors === 0) {
            console.log('\n✅ All security checks passed!');
            process.exit(0);
        } else {
            console.log('\n❌ Some security checks failed or found issues.');
            console.log('Please review the output above and the security-report.json file.');
            process.exit(1);
        }
    }
}

// Run the security checker if this script is executed directly
if (require.main === module) {
    const checker = new SecurityChecker();
    checker.run().catch(error => {
        console.error('Security check failed:', error);
        process.exit(1);
    });
}

module.exports = SecurityChecker;