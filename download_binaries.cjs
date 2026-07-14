const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LLAMA_VERSION = 'b4604';
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
    fs.unlinkSync(path.join(BIN_DIR, file));
  }

  const targetArg = process.argv.slice(2).join(' ');
  let downloadUrl = '';
  let platform = process.platform;
  
  if (platform === 'win32') {
    downloadUrl = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-win-vulkan-x64.zip`;
  } else if (platform === 'darwin') {
    if (targetArg.includes('x86_64')) {
      downloadUrl = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-macos-x64.zip`;
    } else {
      downloadUrl = `https://github.com/ggerganov/llama.cpp/releases/download/${LLAMA_VERSION}/llama-${LLAMA_VERSION}-bin-macos-arm64.zip`;
    }
  } else {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  const zipPath = path.join(BIN_DIR, 'llama.zip');
  console.log(`Downloading ${downloadUrl}...`);
  await downloadFile(downloadUrl, zipPath);
  console.log('Download complete. Extracting...');

  if (platform === 'win32') {
    // Windows extraction
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${BIN_DIR}' -Force"`);
    // Rename llama-cli.exe to llama-completion.exe
    if (fs.existsSync(path.join(BIN_DIR, 'llama-cli.exe'))) {
      fs.renameSync(path.join(BIN_DIR, 'llama-cli.exe'), path.join(BIN_DIR, 'llama-completion.exe'));
    }
  } else {
    // macOS extraction
    execSync(`unzip -o "${zipPath}" -d "${BIN_DIR}"`);
    let llamaCliPath = path.join(BIN_DIR, 'llama-cli');
    if (!fs.existsSync(llamaCliPath)) {
      if (fs.existsSync(path.join(BIN_DIR, 'build', 'bin', 'llama-cli'))) {
        llamaCliPath = path.join(BIN_DIR, 'build', 'bin', 'llama-cli');
      }
    }
    if (fs.existsSync(llamaCliPath)) {
      fs.renameSync(llamaCliPath, path.join(BIN_DIR, 'llama-completion'));
      execSync(`chmod +x "${path.join(BIN_DIR, 'llama-completion')}"`);
    }
  }

  fs.unlinkSync(zipPath);
  
  // Also clean up llama-server and other heavy executables we don't need
  const extractedFiles = fs.readdirSync(BIN_DIR);
  for (const file of extractedFiles) {
    const fullPath = path.join(BIN_DIR, file);
    const isDir = fs.statSync(fullPath).isDirectory();
    if (isDir) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      if (file.endsWith('.exe') && file !== 'llama-completion.exe') {
        fs.unlinkSync(fullPath);
      } else if (platform === 'darwin' && !file.includes('.') && file !== 'llama-completion') {
        fs.unlinkSync(fullPath);
      }
    }
  }

  console.log('Successfully prepared llama.cpp binaries and DLLs.');
}

main().catch(console.error);
