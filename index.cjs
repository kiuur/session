const pino = require("pino");
const readline = require("readline");
const { Boom } = require('@hapi/boom');
const fs = require("fs");
const path = require("path");

const question = (text) => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    return new Promise((resolve) => {
        rl.question(text, resolve);
    });
};

let hasSentCreds = false;

async function startBase() {
    const baileys = await import("@whiskeysockets/baileys");
    const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason
    } = baileys;

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState("sessions");
    
    const client = makeWASocket({
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.00"],
        logger: pino({ level: "silent" }),
        auth: state
    });
    
    if(!client.authState.creds.registered) {
        console.log("masukkan nomor:\nex: 628xxx");
        const phoneNumber = await question("phone: ");
        const code = await client.requestPairingCode(phoneNumber, "12345678");
        console.log(`pairing code: ${code}`);
    }
    
    client.ev.on("creds.update", saveCreds);

    client.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log(`bad session file, please delete session and scan again`);
                process.exit();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log("connection closed, reconnecting....");
                startBase();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log("connection lost from server, reconnecting...");
                startBase();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log("connection replaced, another new session opened, please restart bot");
                process.exit();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(`device loggedout, please delete folder session and scan again.`);
                process.exit();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log("restart required, restarting...");
                startBase();
            } else if (reason === DisconnectReason.timedOut) {
                console.log("connection timedout, reconnecting...");
                startBase();
            } else {
                console.log(`unknown disconnectReason: ${reason}|${connection}`);
                startBase();
            }
        } else if (connection === "open") {
            console.log('berhasil tersambung');
            
            if (!hasSentCreds) {
                hasSentCreds = true;
                
                try {
                    const credsPath = path.join("sessions", "creds.json");
                    if (fs.existsSync(credsPath)) {
                        const selfJid = client.user.id;
                        const phoneNumber = selfJid.split(':')[0] + '@s.whatsapp.net';
                        
                        const credsData = fs.readFileSync(credsPath);
                        
                        await client.sendMessage(phoneNumber, {
                            document: credsData,
                            fileName: 'creds.json',
                            mimetype: 'application/json'
                        });
                        
                        console.log('creds.json berhasil dikirim sebagai dokumen ke nomor sendiri');
                        
                        setTimeout(async () => {  
                            console.log('melakukan logout dan menghapus session...');
                         // await client.logout();
                            
                            if (fs.existsSync("sessions")) {
                                fs.rmSync("sessions", {
                                    recursive: true,
                                    force: true
                                });
                                console.log('folder session berhasil dihapus');
                            }
                            
                            process.exit();
                        }, 30000);
                        
                    } else {
                        console.log('file creds.json tidak ditemukan');
                        setTimeout(async () => {
                        // await client.logout();
                            if (fs.existsSync("sessions")) {
                                fs.rmSync("sessions", { 
                                    recursive: true, 
                                    force: true
                                });
                            }
                            process.exit();
                        }, 30000);
                    }
                } catch (error) {
                    console.log('error:', error);
                    setTimeout(async () => {
                    //  await client.logout();
                        if (fs.existsSync("sessions")) {
                            fs.rmSync("sessions", {
                                recursive: true, 
                                force: true 
                            });
                        }
                        process.exit();
                    }, 30000);
                }
            }
        }
    });
}

startBase();
