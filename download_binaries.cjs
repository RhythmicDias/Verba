const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LLAMA_VERSION = 'b10020';
const BIN_DIR = path.join(__dirname, 'src-tauri', 'binaries');

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
};

async function main() {
  if (!fs.existsSync(BIN_DIR)) {
    fs.mkdirSync(BIN_DIR, { recursive: true });
  }

  // Clear existing dummy binaries
  const files = fs.readdirSync(BIN_DIR);
  for (const file of files) {
    try {
      fs.unlinkSync(path.join(BIN_DIR, file));
    } catch (e) {
      console.warn(`Could not delete existing file ${file}: ${e.message}`);
    }
  }

  const targetArg = process.argv.slice(2).join(' ');
  let downloadUrl = '';
  let platform = process.platform;
  const isMac = platform === 'darwin';
  const archiveExt = isMac ? '.tar.gz' : '.zip';
  const archivePath = path.join(BIN_DIR, `llama${archiveExt}`);
  
  if (platform === 'win32') {
    downloadUrl = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-win-vulkan-x64.zip`;
  } else if (platform === 'darwin') {
    if (targetArg.includes('x86_64')) {
      downloadUrl = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-macos-x64.tar.gz`;
    } else {
      downloadUrl = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-macos-arm64.tar.gz`;
    }
  } else {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  console.log(`Downloading ${downloadUrl}...`);
  await downloadFile(downloadUrl, archivePath);
  console.log('Download complete. Extracting...');

  if (platform === 'win32') {
    // Windows extraction
    execSync(`powershell -command "Expand-Archive -Path '${archivePath}' -DestinationPath '${BIN_DIR}' -Force"`);
    // Rename llama-cli.exe to verba-engine.exe
    if (fs.existsSync(path.join(BIN_DIR, 'llama-cli.exe'))) {
      fs.renameSync(path.join(BIN_DIR, 'llama-cli.exe'), path.join(BIN_DIR, 'verba-engine.exe'));
    }
    // Copy llama-cli-impl.dll to verba-engine-impl.dll
    if (fs.existsSync(path.join(BIN_DIR, 'llama-cli-impl.dll'))) {
      fs.copyFileSync(path.join(BIN_DIR, 'llama-cli-impl.dll'), path.join(BIN_DIR, 'verba-engine-impl.dll'));
    }
  } else {
    // macOS extraction
    execSync(`tar -xzf "${archivePath}" -C "${BIN_DIR}"`);
    
    let llamaCliPath = path.join(BIN_DIR, 'llama-cli');
    if (!fs.existsSync(llamaCliPath)) {
      const entries = fs.readdirSync(BIN_DIR);
      for (const entry of entries) {
        const fullEntry = path.join(BIN_DIR, entry);
        if (fs.statSync(fullEntry).isDirectory()) {
          const candidate = path.join(fullEntry, 'llama-cli');
          if (fs.existsSync(candidate)) {
            // Move all extracted contents from subfolder up to BIN_DIR
            const subFiles = fs.readdirSync(fullEntry);
            for (const subFile of subFiles) {
              const src = path.join(fullEntry, subFile);
              const dest = path.join(BIN_DIR, subFile);
              if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
              fs.renameSync(src, dest);
            }
            fs.rmSync(fullEntry, { recursive: true, force: true });
            break;
          }
        }
      }
    }

    llamaCliPath = path.join(BIN_DIR, 'llama-cli');
    if (fs.existsSync(llamaCliPath)) {
      fs.renameSync(llamaCliPath, path.join(BIN_DIR, 'verba-engine'));
      execSync(`chmod +x "${path.join(BIN_DIR, 'verba-engine')}"`);
    } else {
      console.error('ERROR: llama-cli binary was not found after macOS tar extraction!');
      process.exit(1);
    }
  }

  try {
    fs.unlinkSync(archivePath);
  } catch (e) {
    console.warn(`Could not delete archive file: ${e.message}`);
  }
  
  // Also clean up llama-server and other heavy executables we don't need
  const extractedFiles = fs.readdirSync(BIN_DIR);
  for (const file of extractedFiles) {
    const fullPath = path.join(BIN_DIR, file);
    try {
      const isDir = fs.statSync(fullPath).isDirectory();
      if (isDir) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        if (file.endsWith('.exe') && file !== 'verba-engine.exe') {
          fs.unlinkSync(fullPath);
        } else if (platform === 'darwin' && !file.includes('.') && file !== 'verba-engine') {
          fs.unlinkSync(fullPath);
        }
      }
    } catch (e) {
      console.warn(`Could not process/delete ${file}: ${e.message}`);
    }
  }

  console.log('Successfully prepared llama.cpp binaries and DLLs.');
}

main().catch(console.error);
