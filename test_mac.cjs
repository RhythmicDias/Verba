const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

https.get('https://github.com/ggerganov/llama.cpp/releases/download/b4604/llama-b4604-bin-macos-arm64.zip', (res) => {
    if(res.statusCode === 302) {
        https.get(res.headers.location, (res2) => {
            const file = fs.createWriteStream('mac.zip');
            res2.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(execSync('powershell -command "Expand-Archive -Path mac.zip -DestinationPath mac_out -Force"').toString());
                console.log(fs.readdirSync('mac_out'));
            });
        });
    }
});
