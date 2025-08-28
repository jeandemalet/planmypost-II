#!/usr/bin/env node

// ===============================
// Fichier: scripts/build.js
// Script de build pour optimiser les ressources frontend
// ===============================

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');
const assetsDir = path.join(publicDir, 'assets');

console.log('🏗️  Starting build process...');

async function cleanDist() {
    console.log('🧹 Cleaning dist directory...');
    await fs.remove(distDir);
    await fs.ensureDir(distDir);
    await fs.ensureDir(path.join(distDir, 'assets'));
    await fs.ensureDir(path.join(distDir, 'lib'));
    await fs.ensureDir(path.join(distDir, 'locales'));
}

async function copyAssets() {
    console.log('📁 Copying assets...');
    
    // Copy all assets
    if (await fs.pathExists(assetsDir)) {
        await fs.copy(assetsDir, path.join(distDir, 'assets'));
    }
    
    // Copy lib directory
    const libDir = path.join(publicDir, 'lib');
    if (await fs.pathExists(libDir)) {
        await fs.copy(libDir, path.join(distDir, 'lib'));
    }
    
    // Copy locales
    const localesDir = path.join(publicDir, 'locales');
    if (await fs.pathExists(localesDir)) {
        await fs.copy(localesDir, path.join(distDir, 'locales'));
    }
}

async function minifyJS() {
    console.log('⚡ Minifying JavaScript...');
    
    const jsFiles = ['script.js', 'admin.js'];
    
    for (const file of jsFiles) {
        const inputPath = path.join(publicDir, file);
        const outputPath = path.join(distDir, file);
        
        if (await fs.pathExists(inputPath)) {
            try {
                console.log(`  - Minifying ${file}...`);
                execSync(`npx terser "${inputPath}" -o "${outputPath}" --compress --mangle --source-map "filename='${file}.map',includeSources"`, {
                    stdio: 'inherit'
                });
                
                // Get file size reduction
                const originalSize = (await fs.stat(inputPath)).size;
                const minifiedSize = (await fs.stat(outputPath)).size;
                const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
                console.log(`    ✅ ${file}: ${originalSize} → ${minifiedSize} bytes (${reduction}% reduction)`);
            } catch (error) {
                console.error(`    ❌ Error minifying ${file}:`, error.message);
            }
        }
    }
}

async function minifyCSS() {
    console.log('🎨 Minifying CSS...');
    
    const cssFiles = ['style.css'];
    
    for (const file of cssFiles) {
        const inputPath = path.join(publicDir, file);
        const outputPath = path.join(distDir, file);
        
        if (await fs.pathExists(inputPath)) {
            try {
                console.log(`  - Minifying ${file}...`);
                execSync(`npx cleancss -o "${outputPath}" "${inputPath}"`, {
                    stdio: 'inherit'
                });
                
                // Get file size reduction
                const originalSize = (await fs.stat(inputPath)).size;
                const minifiedSize = (await fs.stat(outputPath)).size;
                const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
                console.log(`    ✅ ${file}: ${originalSize} → ${minifiedSize} bytes (${reduction}% reduction)`);
            } catch (error) {
                console.error(`    ❌ Error minifying ${file}:`, error.message);
            }
        }
    }
}

async function minifyHTML() {
    console.log('📄 Minifying HTML...');
    
    const htmlFiles = ['index.html', 'welcome.html', 'admin.html'];
    
    for (const file of htmlFiles) {
        const inputPath = path.join(publicDir, file);
        const outputPath = path.join(distDir, file);
        
        if (await fs.pathExists(inputPath)) {
            try {
                console.log(`  - Minifying ${file}...`);
                
                // Read the file and update asset paths to include cache busting
                let content = await fs.readFile(inputPath, 'utf8');
                
                // Add cache busting to CSS and JS files
                const timestamp = Date.now();
                content = content.replace(/\.css(\?v=[\d.]+)?"/g, `.css?v=${timestamp}"`);
                content = content.replace(/\.js(\?v=[\d.]+)?"/g, `.js?v=${timestamp}"`);
                
                // Write to temp file for html-minifier
                const tempPath = inputPath + '.temp';
                await fs.writeFile(tempPath, content);
                
                execSync(`npx html-minifier-terser --collapse-whitespace --remove-comments --remove-optional-tags --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype --minify-css true --minify-js true "${tempPath}" -o "${outputPath}"`, {
                    stdio: 'inherit'
                });
                
                // Clean up temp file
                await fs.remove(tempPath);
                
                // Get file size reduction
                const originalSize = (await fs.stat(inputPath)).size;
                const minifiedSize = (await fs.stat(outputPath)).size;
                const reduction = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
                console.log(`    ✅ ${file}: ${originalSize} → ${minifiedSize} bytes (${reduction}% reduction)`);
            } catch (error) {
                console.error(`    ❌ Error minifying ${file}:`, error.message);
            }
        }
    }
}

async function generateManifest() {
    console.log('📋 Generating build manifest...');
    
    const manifest = {
        buildTime: new Date().toISOString(),
        version: require('../package.json').version,
        nodeVersion: process.version,
        files: {}
    };
    
    // Get file sizes
    const files = await fs.readdir(distDir);
    for (const file of files) {
        const filePath = path.join(distDir, file);
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
            manifest.files[file] = {
                size: stats.size,
                modified: stats.mtime.toISOString()
            };
        }
    }
    
    await fs.writeFile(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log('    ✅ Build manifest created');
}

async function createBuildReport() {
    const reportPath = path.join(distDir, 'build-report.txt');
    const report = `
Build Report
============
Build Time: ${new Date().toISOString()}
Node Version: ${process.version}

Optimizations Applied:
- JavaScript minification with Terser
- CSS minification with CleanCSS  
- HTML minification with html-minifier-terser
- Cache busting with timestamps
- Source maps generated for debugging

Security Features:
- DOMPurify for XSS protection
- Helmet for security headers
- Input validation with express-validator
- Rate limiting protection
- CSRF protection
- Environment validation

Performance Features:
- Database indexes optimization
- Server-side caching
- Gzip compression
- Asset minification
- Lazy loading protection

For production deployment:
1. Ensure all environment variables are properly configured
2. Use HTTPS in production
3. Configure appropriate CORS settings
4. Set up proper database backup strategy
5. Monitor application performance and security logs
`;

    await fs.writeFile(reportPath, report.trim());
    console.log('📊 Build report generated');
}

async function main() {
    try {
        await cleanDist();
        await copyAssets();
        await minifyJS();
        await minifyCSS();
        await minifyHTML();
        await generateManifest();
        await createBuildReport();
        
        console.log('\n🎉 Build completed successfully!');
        console.log(`📁 Output directory: ${distDir}`);
        console.log('🚀 Ready for production deployment');
        
    } catch (error) {
        console.error('\n💥 Build failed:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };