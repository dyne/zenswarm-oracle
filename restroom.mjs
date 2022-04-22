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
import timestamp from "@restroom-mw/timestamp";
import files from "@restroom-mw/files";
import ui from "@restroom-mw/ui";
import { zencode_exec } from "zenroom"

import http from "http";
import morgan from "morgan"
import dotenv from "dotenv";
import axios from 'axios';
import chokidar from 'chokidar';
import yaml from 'js-yaml';

dotenv.config();
const MIN_PORT = 25000;
const MAX_PORT = 30000;
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

const announce = (identity) => {
  const data = {
    "add-identity": "https://apiroom.net/api/dyneorg/consensusroom-server-add-identity",
    "post": {
      "data": {
        "identity": identity
      }
    }
  }

  axios
    .post(`http://127.0.0.1:${HTTP_PORT}/api/consensusroom-announce`, {"data": data})
    .then( res => {
      console.log(JSON.stringify(res.data))
    })
    .catch( _ => {
      console.error("Error in announce contract");
      process.exit(-1);
    })
  startL1Watcher();
};

const saveVMLetStatus = async () => {
  // generate private keys
  const generatePrivateKeysScript = fs.readFileSync(path.join(PRIVATE_ZENCODE_DIR,
                  "consensus-generate-all-private-keys.zen"), 'utf8')

  const keys = await zen(generatePrivateKeysScript, null, null);
  if(!keys) {
    process.exit(-1)
  }
  fs.writeFileSync(
    path.join(ZENCODE_DIR, "consensusroom-generate-all-public-keys.keys"),
    keys.result)
  fs.writeFileSync(
    path.join(ZENCODE_DIR, "keyring.json"),
    keys.result)

  // generate relative public keys
  axios
    .get(`http://127.0.0.1:${HTTP_PORT}/api/consensusroom-generate-all-public-keys`)
    .then( res => {
      // put all togheter in the identity
      const identity = {
        "uid":`${HOST}:${HTTP_PORT}`,
        "ip":HOST,
        "baseUrl":`http://${HOST}`,
        "port_http":`${HTTP_PORT}`,
        "port_https":`${HTTPS_PORT}`,
        "version":"2",
        "announceAPI":"/api/consensusroom-announce",
        "get-6-timestampsAPI":"/api/consensusroom-get-6-timestamps",
        "timestampAPI":"/api/consensusroom-get-timestamp",
        "updateAPI":"/api/consensusroom-update",
        "http-postAPI": "/api/consensusroom-http-post",
        "tracker":"https://apiroom.net/",
        "type": "restroom-mw",
        "region": "0"
      }
      Object.assign(identity, res.data)
      fs.writeFileSync(
        path.join(ZENCODE_DIR, "identity.keys"),
        JSON.stringify({"identity": identity}))

      announce(identity)
    })
    .catch(_ => {
      console.error("Error in generate public key contract");
      process.exit(-1);
    })

}
function between(min, max) {
  return Math.floor(
    Math.random() * (max - min) + min
  )
}
let HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 0;
let HTTPS_PORT = parseInt(process.env.HTTPS_PORT, 10) || 0;
const HOST = process.env.HOST || "0.0.0.0";
const ZENCODE_DIR = process.env.ZENCODE_DIR;
const PRIVATE_ZENCODE_DIR = process.env.PRIVATE_ZENCODE_DIR;
const OPENAPI = JSON.parse(process.env.OPENAPI || true);
const L1NODES = process.env.L1NODES || "L1.yaml";
const FILES_DIR = process.env.FILES_DIR || "contracts";


const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan("dev"));
app.set("json spaces", 2);

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

if(!fs.existsSync(ZENCODE_DIR)) {
  fs.mkdirSync(ZENCODE_DIR, { recursive: true });
}
const contracts = fs.readdirSync(ZENCODE_DIR);

if (contracts.length > 0) {
  const httpStarted = async () => {
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

  const httpServer = http.createServer(app);
  if(HTTP_PORT == 0) HTTP_PORT = between(MIN_PORT, MAX_PORT);
  let found = false;
  while(!found) {
    found = true;
    try {
      httpServer.listen(HTTP_PORT, () => {
        if(HTTPS_PORT == 0) HTTPS_PORT = between(MIN_PORT, MAX_PORT);
        let found = false;
        while(!found) {
          found = true;
          try {
            const httpsServer = http.createServer(app);
            httpsServer.listen(HTTPS_PORT, () => {
              if(HTTPS_PORT == 0) HTTPS_PORT = httpsServer.address().port
              httpStarted()
            });
          } catch(e) {
            found = false;
            HTTPS_PORT = between(MIN_PORT, MAX_PORT);
          }
        }
      });
    } catch(e) {
      found = false;
      HTTP_PORT = between(MIN_PORT, MAX_PORT);
    }
  }
} else {
  console.log(`🚨 The ${chalk.magenta.underline(ZENCODE_DIR)} folder is empty, please add some ZENCODE smart contract before running Restroom`);
}

