import fs from 'fs';

import path from 'path'
import readdirp from 'readdirp';
import express from "express";
import chalk from "chalk";
import bodyParser from "body-parser";
import zencode from "@restroom-mw/core";
import db from "@restroom-mw/db";
import fabric from "@restroom-mw/fabric";
import rrhttp from "@restroom-mw/http";
import rrredis from "@restroom-mw/redis";
import sawroom from "@restroom-mw/sawroom";
import ethereum from "@restroom-mw/ethereum";
import planetmintmw from "@restroom-mw/planetmint";
import timestamp from "@restroom-mw/timestamp";
import files from "@restroom-mw/files";
import ui from "@restroom-mw/ui";
import mqtt from "mqtt"
import cors from "cors"
import web3EthAbi from "web3-eth-abi"

import http from "http";
import morgan from "morgan";
import winston from "winston";
import dotenv from "dotenv";
import axios from 'axios';
import WebSocket from 'ws';
import readLastLines from 'read-last-lines';

dotenv.config();
const L = new winston.createLogger({
    level: 'debug',
    transports: [
        new winston.transports.File({
            filename: './access.log',
            level: 'debug'
        }),
    ],
    exitOnError: false
});

const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || "8000", 10);
const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const EXT_HOST = process.env.EXT_HOST || `https://${HOST}`;
const COUNTRY = process.env.COUNTRY || "NONE";
const ZENCODE_DIR = process.env.ZENCODE_DIR || "contracts";
const OPENAPI = JSON.parse(process.env.OPENAPI || true);
const STATE = process.env.STATE || "NONE";
const SUBSCRIPTIONS = process.env.SUBSCRIPTIONS || "";
const ANNOUNCE_URL = process.env.ANNOUNCE_URL || "";
const DEANNOUNCE_URL = process.env.DEANNOUNCE_URL || ""
const L0_DEST = process.env.L0_DEST || "planetmint";
const ETH2PLNT = process.env.ETH2PLNT || "";


/*
 * Load current L1 blockchains database
 */
import {
    readFile
} from 'fs/promises';
const blockchainDB = JSON.parse(
    await readFile(
        new URL('./blockchain_db.json',
            import.meta.url)
    )
).subscriptions;
Object.keys(blockchainDB).forEach(key => blockchainDB[key].name = key);

const readContracts = () => readdirp(ZENCODE_DIR, {
    fileFilter: '*.zen|*.yaml|*.yml'
})

const deannounce = (identity) => {
    if(ANNOUNCE_URL && DEANNOUNCE_URL) {
        axios.post(DEANNOUNCE_URL, identity)
            .then(res => {
                L.info("GRACEFUL_SHUTDOWN");
                process.exit(0);
            })
            .catch(e => {
                console.log(e.response);
                L.warn("DEANNOUNE_FAILED");
                process.exit(0);
            });
    }
}

/*
 * Post announce message to Issuer
 */
const announce = (identity) => {
    if(ANNOUNCE_URL) {
        const dataIdentity = {
            "data": {
                identity
            }
        };
        const data = {
            "add-identity": ANNOUNCE_URL,
            "post": dataIdentity
        }
        axios
            .post(`http://127.0.0.1:${HTTP_PORT}/api/zenswarm-oracle-announce`, {
                "data": data
            })
            .then(res => {
                process.on('SIGINT', () => deannounce(dataIdentity));
                console.log(JSON.stringify(res.data))
                dispatchSubscriptions();
                subscribeEth2Plt();
            })
            .catch(e => {
                console.log(e);
                console.error("Error in announce contract");
                process.exit(-1);
            });
    } else {
        dispatchSubscriptions()
        subscribeEth2Plt();
    }
};

const fsReadAPIs = async () => {
    let apis = []
    return new Promise((resolve, reject) => {
        readContracts()
            .on('data', (entry) => {
                apis.push(`/api/${entry.basename.substr(0, entry.basename.lastIndexOf('.'))}`)
            })
            .on('end', () => resolve(apis))
            .on('error', error => reject(error))
    })
}

/*
 * Create VMLet identity
 */
const saveVMLetStatus = async () => {
    const apis = fsReadAPIs();
    // generate relative public keys
    axios
        .get(`http://127.0.0.1:${HTTP_PORT}/api/zenswarm-oracle-generate-all-public-keys`)
        .then(async (res) => {
            // put all togheter in the identity
            const identity = {
                "API": await apis,
                "uid": `${HOST}:${HTTPS_PORT}`,
                "ip": HOST,
                "baseUrl": EXT_HOST,
                "port_https": `${HTTPS_PORT}`,
                "version": "3",
                "tracker": "https://apiroom.net/",
                "description": "restroom-mw",
                "State": STATE,
                "Country": `${COUNTRY}`,
                "L0": L0_DEST
            }
            Object.assign(identity, res.data)
            fs.writeFileSync(
                path.join(ZENCODE_DIR, "identity.json"),
                JSON.stringify({
                    "identity": identity
                }))

            announce(identity)
        })
        .catch(e => {
            console.error("Error in generate public key contract");
            console.error(e)
            process.exit(-1);
        })
}

const app = express();

// Used by the dashboard
app.use(cors())
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());
app.use(morgan('combined', {
    stream: L.stream.write
}))
app.set("json spaces", 2);


app.use(db.default);
app.use(fabric.default);
app.use(rrhttp.default);
app.use(rrredis.default);
app.use(sawroom.default);
app.use(ethereum.default);
app.use(planetmintmw.default);
app.use(timestamp.default);
app.use(files.default);
if (OPENAPI) {
    app.use("/docs", ui.default({
        path: ZENCODE_DIR,
        isDataPublic: true,
    }));
}

app.use("/api/*", zencode.default);
app.get('/logs', async (req, res) => {
    const logs = await readLastLines.read('./access.log', 200)
    res.send(logs)
})
app.use(function (err, req, res, next) {
    L.error(`${req.method} - ${err.message}  - ${req.originalUrl} - ${req.ip}`);
    next(err)
})

if (!fs.existsSync(ZENCODE_DIR)) {
    fs.mkdirSync(ZENCODE_DIR, {
        recursive: true
    });
}
const contracts = fs.readdirSync(ZENCODE_DIR);

if (contracts.length > 0) {
    const httpStarted = async () => {
        await saveVMLetStatus();
        console.log(`🚻 Restroom started on ${HTTP_PORT}`);
        console.log(`📁 the ZENCODE directory is: ${chalk.magenta.underline(ZENCODE_DIR)} \n`);

        if (OPENAPI) {
            console.log(`To see the OpenApi interface head your browser to: ${chalk.bold.blue.underline('http://' + HOST + ':' + HTTP_PORT + '/docs')}`);
            console.log(`To disable OpenApi, run ${chalk.bold('OPENAPI=0 yarn start')}`);
        } else {
            console.log(`⚠️ The OpenApi is not enabled! NO UI IS SERVED. To enable it run run ${chalk.bold('OPENAPI=1 yarn start')}`);
        }

        console.log("\nExposing");
        readContracts().on('data', (c) => {
            const endpoint = `/api/${c.path.replace('.zen', '')}`
            console.log(`\t${chalk.bold.green(endpoint)}`);
        });
    }
    const server = http.createServer(app);
    server.listen(HTTP_PORT, httpStarted);

} else {
    console.log(`🚨 The ${chalk.magenta.underline(ZENCODE_DIR)} folder is empty, please add some ZENCODE smart contract before running Restroom`);
}

function notarizationUrl(from) {
    return `http://127.0.0.1:${HTTP_PORT}/api/${from}-to-${L0_DEST}-notarization.chain`;
}

/*
 * Subscribe to ETH node
 */
function subscribeEth(blockchain) {
    try {
        const ws = new WebSocket(blockchain.sub);
        ws.onopen = function () {
            const id = Math.floor(Math.random() * 65536);
            let subscriptionId = null;
            ws.send(JSON.stringify({
                id,
                jsonrpc: "2.0",
                method: "eth_subscribe",
                params: ["newHeads"]
            }));
            const processMsg = function (event) {
                let msg = JSON.parse(event.data)
                if (msg.method == "eth_subscription" &&
                    msg.params && msg.params.subscription == subscriptionId) {
                    const block = msg.params.result;
                    msg['endpoint'] = blockchain.api;
                    Object.assign(msg, {
                        blockchain
                    })
                    L.info("ETH_NEW_HEAD " + block.hash);
                    axios.post(notarizationUrl("ethereum"), {
                            data: msg
                        })
                        .then(function (data) {
                            L.info(`ETH_NOTARIZE ${data.data.txid || data.data.txId}`);
                        }).catch(function (e) {
                            L.warn(`ETH_NOTARIZE_ERROR ${e}`)
                        });
                }
            }
            ws.onmessage = function (e) {
                const msg = JSON.parse(e.data);
                if (msg.result && msg.id == id) {
                    subscriptionId = msg.result
                    // from now on messages will be processed as blocks
                    ws.onmessage = processMsg;
                }

            }
            ws.onclose = function () {
                Log.warn("ETH_CLOSE")
            }
        }
    } catch (e) {
        L.error(`ETH_WS_ERROR ${e}`);
        process.exit(-1);
    }
}


function subscribeSaw(blockchain) {
    try {
        const ws = new WebSocket(blockchain.sub);
        ws.onopen = function () {
            ws.send(JSON.stringify({
                action: "subscribe"
            }));
            ws.onmessage = function (event) {
                try {
                    let msg = JSON.parse(event.data)
                    const block = msg.block_id;
                    msg['endpoint'] = blockchain.api;
                    Object.assign(msg, {
                        blockchain
                    })
                    L.info("SAW_NEW_HEAD " + block);
                    axios.post(notarizationUrl("sawroom"), {
                            data: msg
                        })
                        .then(function (data) {
                            L.info(`SAW_NOTARIZE ${data.data.txid || data.data.txId}`);
                        }).catch(function (e) {
                          console.log(e.response)
                            L.warn(`SAW_NOTARIZE_ERROR ${e}`)
                        });
                } catch (e) {
                    L.warn(`SAW_WS_ERROR: ${e}`)
                }
            }
            ws.onclose = function () {
                L.warn("SAW_CLOSE")
            }
        }
    } catch (e) {
        L.error(`SAW_WS_ERROR ${e}`);
        process.exit(-1);
    }
}

function subscribeIota(blockchain) {
    try {
        const client = mqtt.connect(blockchain.sub);
        client.subscribe('milestones/latest');
        client.on('message', function (topic, message) {
            try {
                let msg = JSON.parse(message.toString('utf-8'));
                msg['index'] = msg['index'].toString();
                msg['timestamp'] = msg['timestamp'].toString();
                const block_index = msg.index;
                msg['endpoint'] = blockchain.api;
                Object.assign(msg, {
                    blockchain
                });
                L.info("IOTA_NEW_HEAD " + block_index);
                axios.get(`${blockchain.api}api/v1/milestones/${block_index}`)
                    .then(function (res) {
                        msg['messageId'] = res.data.data.messageId;
                        L.info(`IOTA_ID: ${res.data.data.messageId}`);
                        axios.get(`${blockchain.api}api/v1/messages/${msg.messageId}`)
                            .then(function (res) {
                                Object.assign(msg, {
                                    parentMessageIds: res.data.data.parentMessageIds
                                });
                                axios.post(notarizationUrl("iota"), {
                                        data: msg
                                    })
                                    .then(function (data) {
                                        L.info(`IOTA_NOTARIZE ${data.data.txid || data.data.txId}`);
                                    }).catch(function (e) {
                                        L.warn(`IOTA_NOTARIZE_ERROR ${e}`)
                                    });
                            })
                    }).catch(function (e) {
                        L.warn(`IOTA_MESSAGE_ID_ERROR ${e}`);
                    });
            } catch (e) {
                L.warn(`IOTA_MESSAGE_ERROR: ${e}`);
            }
        });
    } catch (e) {
        L.error(`IOTA_MQTT_ERROR ${e}`);
        process.exit(-1);
    }
}

const subscribeFn = {
    "ethereum": subscribeEth,
    "sawtooth": subscribeSaw,
    "iota": subscribeIota
}

function dispatchSubscriptions() {
    let subscriptions = {}
    if (SUBSCRIPTIONS != '') {
        SUBSCRIPTIONS.split(" ").forEach((v) => {
            try {
                const blockchain = blockchainDB[v]
                if (!blockchain) {
                    console.log("UNKNOWN_BLOCKCHAIN " + v);
                    return
                }
                const fn = subscribeFn[blockchain['type']];
                if (!fn) {
                    console.log("UNKNOWN_SUBSCRIPTION " + v);
                    return
                }
                subscriptions[v] = blockchain;
                fn({
                    ...blockchain,
                    name: `${v}-${L0_DEST}`
                });
            } catch (e) {
                console.warn(e)
            }
        });
    }
    fs.writeFileSync(
        path.join(ZENCODE_DIR, "blockchain-subscriptions.json"),
        JSON.stringify({
            subscriptions
        }));
}



// Listen to transfer from eth to planetmint

function subscribeEth2Plt() {
    let events_subscriptions = {}
    if(ETH2PLNT != "") {
        const [blockchain, address] = ETH2PLNT.split(" ")

        try {
            const ws = new WebSocket(blockchainDB[blockchain].sub);
            ws.onopen = function () {
                const id = Math.floor(Math.random() * 65536);
                let subscriptionId = null;

                const params = JSON.stringify({
                    jsonrpc:  "2.0",
                    id,
                    method:  "eth_subscribe",
                    params:  ["logs",  {
                        address,
                        topics:  ["0xe1ba5a54ca8f489003348eb7320bf1f27b39f586af90dfeed84f70eb39f7fa65"]
                    }]
                });
                ws.send(params)

                const processMsg = function (event) {
                    let msg = JSON.parse(event.data)
                    if (msg.method == "eth_subscription" &&
                        msg.params && msg.params.subscription == subscriptionId) {
                        const from = web3EthAbi.decodeParameter(
                            'address', msg.params.result.topics[1])
                        const erc721_address = web3EthAbi.decodeParameter(
                            'address', msg.params.result.topics[2])
                        const erc721_id = web3EthAbi.decodeParameter(
                            'uint256', msg.params.result.topics[3])
                        const to = Buffer.from(
                            web3EthAbi.decodeParameter(
                                'bytes', msg.params.result.data)
                            .substring(2),
                            'hex').toString('utf-8')
                        const planetmint_endpoint = "https://test.ipdb.io/api/v1/"
                        const fabchain_endpoint = "http://test.fabchain.net:8545"
                        const data = {
                            erc721_id,
                            to,
                            erc721_address,
                            planetmint_endpoint,
                            fabchain_endpoint,
                        }
                        axios.post(`http://127.0.0.1:${HTTP_PORT}/api/eth2pltmnt.chain`, {data, keys: {}})
                            .then(res => {
                                L.info(`ETH2PLNTMNT  ${res.data.txid}`)
                            })
                            .catch(e => {
                                L.error("ETH2TPLNTMNT ERROR")
                                console.log("Error")
                                console.log(e.response)
                            });
                    }
                }
                ws.onmessage = function (e) {
                    const msg = JSON.parse(e.data);
                    if (msg.result && msg.id == id) {
                        subscriptionId = msg.result
                        // from now on messages will be processed as blocks
                        ws.onmessage = processMsg;
                    }

                }
                ws.onclose = function () {
                    Log.warn("ETH_CLOSE")
                }
            }
            const desc = "transfer-nft-ethereum-to-planetmint";
            events_subscriptions[desc] = blockchainDB[blockchain]
            events_subscriptions[desc]["contract_address"] = address
        } catch (e) {
            L.error(`ETH_WS_ERROR ${e}`);
            process.exit(-1);
        }
    }
    fs.writeFileSync(
        path.join(ZENCODE_DIR, "event-subscriptions.json"),
        JSON.stringify({
            events_subscriptions
        }));
}
