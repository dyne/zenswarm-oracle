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
import timestamp from "@restroom-mw/timestamp";
import files from "@restroom-mw/files";
import ui from "@restroom-mw/ui";
import { zencode_exec } from "zenroom"

import http from "http";
import morgan from "morgan";
import winston from "winston";
import dotenv from "dotenv";
import axios from 'axios';
import chokidar from 'chokidar';
import yaml from 'js-yaml';
import WebSocket from 'ws';
import readLastLines from 'read-last-lines';

dotenv.config();
const L = new winston.createLogger({
  level: 'debug',
  transports: [
    new winston.transports.File({ filename: './access.log', level: 'debug' }),
  ],
  exitOnError: false
});
const MIN_PORT = 25000;
const MAX_PORT = 30000;
/*
 * Load current L1 blockchains database
 */
import { readFile } from 'fs/promises';
const blockchainDB = JSON.parse(
  await readFile(
    new URL('./blockchain_db.json', import.meta.url)
  )
).subscriptions;

/*
 * Run a zenroom script (outside restroom mw)
 */
const zen = async (zencode, keys, data) => {
  const params = {};
  if (keys !== undefined && keys !== null) {
    params.keys = typeof keys === 'string' ? keys : JSON.stringify(keys);
  }
  if (data !== undefined && data !== null) {
    params.data = typeof data === 'string' ? data : JSON.stringify(data);
  }
  try {
    return await zencode_exec(zencode, params);
  } catch (e) {
    console.log("Error from zencode_exec: ", e);
  }
}

/*
 * Monitor file with L1 data to be monitored
 */
const intervalIDs = []

const startL1Cron = (path) => {
  // clean all intervals
  while(intervalIDs.length > 0) {
    clearInterval(intervalIDs.pop())
  }

  fs.readFile(path, (err, data) => {
    if(err) {
      console.error("Could not read L1 nodes");
      return;
    }
    //start the new ones as in the file
    data = yaml.load(data);
    console.log(`UPDATE_L1_LIST ${Date.now()}`)
    if(!data) {
      console.log("Could not read YAML")
      return;
    }

    Object.keys(data.ledgers).forEach( (key) => {
      const ledger = data.ledgers[key];
      const fnLogger = msg => console.log(`POLLING ${key} ${Date.now()} ${msg}`)
      if(ledger.interval > 0) {
        intervalIDs.push(setInterval(() => {
          axios
            .post(`http://127.0.0.1:${HTTP_PORT}/api/${ledger.contract}`)
            .then( res => {
              fnLogger(JSON.stringify(res.data))
            })
            .catch( err => {
              fnLogger(JSON.stringify(err))
            })
        }, ledger.interval * 1000))
      }
    })
  });
}

const startL1Watcher = () => {
  const file = path.join(FILES_DIR, L1NODES);
  //startL1Cron(file);
  chokidar.watch(file).on('all', (_, path) => {
    startL1Cron(path);
  });
}

/*
 * Post announce message to Issuer
 */
const announce = (identity) => {
  const data = {
    "add-identity": "https://apiroom.net/api/zenswarm/zenswarm-issuer-add-identity.chain",
    "post": {
      "data": {
        "identity": identity
      }
    }
  }

  axios
    .post(`http://127.0.0.1:${HTTP_PORT}/api/zenswarm-oracle-announce`, {"data": data})
    .then( res => {
      console.log(JSON.stringify(res.data))
      //startL1Watcher();
      dispatchSubscriptions();
    })
    .catch( e => {
      console.log(e)
      console.error("Error in announce contract");
      process.exit(-1);
    })
};

/*
 * Create VMLet identity
 */
const saveVMLetStatus = async () => {
  // generate private keys
  const generatePrivateKeysScript = fs.readFileSync(path.join(PRIVATE_ZENCODE_DIR,
                  "consensus-generate-all-private-keys.zen"), 'utf8')

  const keys = await zen(generatePrivateKeysScript, null, null);
  if(!keys) {
    process.exit(-1)
  }
  fs.writeFileSync(
    path.join(ZENCODE_DIR, "zenswarm-oracle-generate-all-public-keys.keys"),
    keys.result)
  fs.writeFileSync(
    path.join(ZENCODE_DIR, "keyring.json"),
    keys.result)

  // generate relative public keys
  axios
    .get(`http://127.0.0.1:${HTTP_PORT}/api/zenswarm-oracle-generate-all-public-keys`)
    .then( res => {
      // put all togheter in the identity
      const identity = {
        "uid":`${HOST}:${HTTP_PORT}`,
        "ip":HOST,
        "baseUrl":`http://${HOST}`,
        "port_http":`${HTTP_PORT}`,
        "port_https":`${HTTPS_PORT}`,
        "version":"2",
        "announceAPI":"/api/zenswarm-oracle-announce",
        "timestampAPI":"/api/zenswarm-oracle-get-timestamp.zen",
        "updateAPI":"/api/zenswarm-oracle-update",
        "http-postAPI": "/api/zenswarm-oracle-http-post",
        "pingAPI" : "/api/zenswarm-oracle-ping.zen",
        "oracle-key-issuance": "/api/zenswarm-oracle-key-issuance.chain",
        "tracker":"https://apiroom.net/",
        "ethereum-notarizationAPI":"/api/ethereum-notarization.chain",
        "sawroom-notarizationAPI":"/api/sawroom-notarization.chain",
        "get-identityAPI":"/api/zenswarm-oracle-get-identity",
        "type": "restroom-mw",
        "region": REGION,
        "country": `${COUNTRY}`
      }
      Object.assign(identity, res.data)
      fs.writeFileSync(
        path.join(ZENCODE_DIR, "identity.json"),
        JSON.stringify({"identity": identity}))

      announce(identity)
    })
    .catch(e => {
      console.error("Error in generate public key contract");
      console.error(e)
      process.exit(-1);
    })
}

/*
 * Utils: generate a random number between min and max
 */
function between(min, max) {
  return Math.floor(
    Math.random() * (max - min) + min
  )
}

function startHttp(initial_port, callback) {
  let port = initial_port;
  const httpServer = http.createServer(app);
  let retry = 1000;
  if(port <= 0) port = between(MIN_PORT, MAX_PORT);
  console.log(`CHOSEN_HTTP_PORT ${port}`)
  httpServer.listen(port, function() {
    console.log(`LISTENING ${httpServer.address().port}`);
    callback();
  }).on('error', function(err) {
    console.log(`ERROR ${err.code}`)
    if(err.code == 'EADDRINUSE') {
      port = between(MIN_PORT, MAX_PORT);
      console.log(`CHOSEN_HTTP_PORT ${port}`)
      if(retry-- > 0)
        httpServer.listen(port);
      else
        throw new Error("Could not find a free port")
    } else {
      console.log(err);
      process.exit(-1);
    }
  });
  return port
}

let HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 0;
let HTTPS_PORT = parseInt(process.env.HTTPS_PORT, 10) || 0;
const HOST = process.env.HOST || "0.0.0.0";
const COUNTRY = process.env.COUNTRY || "NONE";
const ZENCODE_DIR = process.env.ZENCODE_DIR;
const PRIVATE_ZENCODE_DIR = process.env.PRIVATE_ZENCODE_DIR;
const OPENAPI = JSON.parse(process.env.OPENAPI || true);
const L1NODES = process.env.L1NODES || "L1.yaml";
const FILES_DIR = process.env.FILES_DIR || "contracts";
const REGION = process.env.REGION || "NONE";
const SUBSCRIPTIONS = process.env.SUBSCRIPTIONS || "";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan('combined', { stream: L.stream.write }))
app.set("json spaces", 2);

// Used by the dashboard
app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.use(db.default);
app.use(fabric.default);
app.use(rrhttp.default);
app.use(rrredis.default);
app.use(sawroom.default);
app.use(timestamp.default);
app.use(files.default);
if (OPENAPI) {
  app.use("/docs", ui.default({ path: ZENCODE_DIR }));
}

app.use("/api/*", zencode.default);
app.get('/logs', async (req, res) => {
  const logs = await readLastLines.read('./access.log', 200)
  res.send(logs)
})
app.use(function(err, req, res, next) {
  L.error(`${req.method} - ${err.message}  - ${req.originalUrl} - ${req.ip}`);
  next(err)
})

if(!fs.existsSync(ZENCODE_DIR)) {
  fs.mkdirSync(ZENCODE_DIR, { recursive: true });
}
const contracts = fs.readdirSync(ZENCODE_DIR);

if (contracts.length > 0) {
  const httpStarted = async () => {
    process.env.HTTPS_PORT = HTTPS_PORT;
    await saveVMLetStatus();
    console.log(`🚻 Restroom started on http://${chalk.bold.blue(HOST)}:${HTTP_PORT} and http://${chalk.bold.blue(HOST)}:${HTTPS_PORT}`);
    console.log(`📁 the ZENCODE directory is: ${chalk.magenta.underline(ZENCODE_DIR)} \n`);

    if (OPENAPI) {
      console.log(`To see the OpenApi interface head your browser to: ${chalk.bold.blue.underline('http://' + HOST + ':' + HTTP_PORT + '/docs')}`);
      console.log(`To disable OpenApi, run ${chalk.bold('OPENAPI=0 yarn start')}`);
    } else {
      console.log(`⚠️ The OpenApi is not enabled! NO UI IS SERVED. To enable it run run ${chalk.bold('OPENAPI=1 yarn start')}`);
    }

    console.log("\nExposing");
    readdirp(ZENCODE_DIR, { fileFilter: '*.zen|*.yaml|*.yml' }).on('data', (c) => {
      const endpoint = `/api/${c.path.replace('.zen', '')}`
      console.log(`\t${chalk.bold.green(endpoint)}`);
    });
  }
  HTTP_PORT = startHttp(HTTP_PORT, () => {
    process.env.HTTP_PORT = HTTP_PORT;
    HTTPS_PORT = startHttp(HTTPS_PORT, httpStarted);
  });

} else {
  console.log(`🚨 The ${chalk.magenta.underline(ZENCODE_DIR)} folder is empty, please add some ZENCODE smart contract before running Restroom`);
}

/*
 * Subscribe to ETH node
 */
function subscribeEth(blockchain) {
  try {
    const ws = new WebSocket(blockchain.ws);
    ws.onopen = function() {
      const id = Math.floor(Math.random() * 65536);
      let subscriptionId = null;
      ws.send(JSON.stringify({
        id,
        jsonrpc:"2.0",
        method: "eth_subscribe",
        params: ["newHeads"]
      }));
      const processMsg = function(event) {
        let msg = JSON.parse(event.data)
        if(msg.method == "eth_subscription"
           && msg.params && msg.params.subscription == subscriptionId) {
          const block = msg.params.result;
          msg['endpoint'] = blockchain.http;
          Object.assign(msg, {blockchain})
          L.info("ETH_NEW_HEAD " + block.hash);
          axios.post(`http://127.0.0.1:${HTTP_PORT}/api/ethereum-notarization.chain`,
            {data: msg}).then(function(data) {
              L.info(`ETH_NOTARIZE ${data.data.txid}`);
            }).catch(function(e) {
              L.warn(`ETH_NOTARIZE_ERROR ${e}`)
            });
        }
      }
      ws.onmessage = function(e) {
        const msg = JSON.parse(e.data);
        if(msg.result && msg.id == id) {
          subscriptionId = msg.result
          // from now on messages will be processed as blocks
          ws.onmessage = processMsg;
        }

      }
      ws.onclose = function() {
        Log.warn("ETH_CLOSE")
      }
    }
  } catch(e) {
    L.error(`ETH_WS_ERROR ${e}`);
    process.exit(-1);
  }
}


function subscribeSaw(blockchain) {
  try {
    const ws = new WebSocket(blockchain.ws);
    ws.onopen = function() {
      ws.send(JSON.stringify({
        action: "subscribe"
      }));
      ws.onmessage = function(event) {
        try {
          let msg = JSON.parse(event.data)
          const block = msg.block_id;
          msg['endpoint'] = blockchain.http;
          Object.assign(msg, {blockchain})
          console.log(msg)
          L.info("SAW_NEW_HEAD " + block);
          //console.log(msg)
          /*axios.post('https://apiroom.net/api/dyneebsi/sawroom-notarization.chain', {data: msg})
            .then(function(data) {
              console.log(data);
            })*/
        } catch(e) {
          L.warn(`SAW_WS_ERROR: ${e}`)
        }
      }
      ws.onclose = function() {
        L.warn("SAW_CLOSE")
      }
    }
  } catch(e) {
    L.error(`SAW_WS_ERROR ${e}`);
    process.exit(-1);
  }
}

const subscribeFn = {
  "ethereum": subscribeEth,
  "sawtooth": subscribeSaw
}

function dispatchSubscriptions() {
  let subscriptions = {}
  if(SUBSCRIPTIONS != '') {
    SUBSCRIPTIONS.split(" ").forEach( (v) => {
      try {
        const blockchain = blockchainDB[v]
        if(!blockchain) {
          console.log("UNKNOWN_BLOCKCHAIN " + v);
          return
        }
        const fn = subscribeFn[blockchain['type']];
        if(!fn) {
          console.log("UNKNOWN_SUBSCRIPTION " + v);
          return
        }
        subscriptions[v] = blockchain;
        fn({name: v, ...blockchain});
      } catch(e) {
        console.warn(e)
      }
    });
  }
  fs.writeFileSync(
    path.join(ZENCODE_DIR, "blockchain-subscriptions.json"),
    JSON.stringify({subscriptions}));
}
