#!/usr/bin/env node
/**
 * build-android.js
 * Copies latest web files into www/ then runs Capacitor sync for Android.
 * Run: node build-android.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WEB_FILES = [
    'index.html',
    'sw.js',
    'manifest.json',
    'logo.png',
    'favicon.png',
    'icon.svg',
];

const wwwDir = path.join(__dirname, 'www');

// Ensure www/ exists
if (!fs.existsSync(wwwDir)) {
    fs.mkdirSync(wwwDir, { recursive: true });
}

// Copy web files
console.log('📦 Copying web files to www/...');
for (const file of WEB_FILES) {
    const src = path.join(__dirname, file);
    const dest = path.join(wwwDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`  ✓ ${file}`);
    } else {
        console.log(`  ⚠ ${file} (not found, skipping)`);
    }
}

// Also copy any subdirectories (css/, js/, img/, etc.)
const srcDirs = fs.readdirSync(__dirname).filter(f => {
    const full = path.join(__dirname, f);
    return fs.statSync(full).isDirectory() 
        && !f.startsWith('.') 
        && f !== 'node_modules' 
        && f !== 'android'
        && f !== 'www';
});

for (const dir of srcDirs) {
    // Skip api/ (serverless, runs on Vercel not in the app)
    if (dir === 'api') continue;
    const destDir = path.join(wwwDir, dir);
    fs.cpSync(path.join(__dirname, dir), destDir, { recursive: true });
    console.log(`  ✓ ${dir}/`);
}

// Run Capacitor sync
console.log('\n🔄 Running Capacitor sync for Android...');
try {
    execSync('npx cap sync android', { stdio: 'inherit', cwd: __dirname });
    console.log('\n✅ Android project synced successfully!');
    console.log('\n📱 To build the APK:');
    console.log('   cd android && ./gradlew assembleDebug');
    console.log('   APK will be at: android/app/build/outputs/apk/debug/app-debug.apk');
    console.log('\n📦 To build the release AAB for Play Store:');
    console.log('   cd android && ./gradlew bundleRelease');
    console.log('   AAB will be at: android/app/build/outputs/bundle/release/app-release.aab');
} catch (e) {
    console.error('\n❌ Capacitor sync failed:', e.message);
    process.exit(1);
}
