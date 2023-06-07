import db from "@restroom-mw/db";
import ethereum from "@restroom-mw/ethereum";
import fabric from "@restroom-mw/fabric";
import files from "@restroom-mw/files";
import git from "@restroom-mw/git";
import logger from "@restroom-mw/logger";
import planetmint from "@restroom-mw/planetmint";
import rrhttp from "@restroom-mw/http";
import rrredis from "@restroom-mw/redis";
import timestamp from "@restroom-mw/timestamp";
import ui from "@restroom-mw/ui";
import zencode from "@restroom-mw/core";

import WebSocket from 'ws';
import axios from 'axios';
import bodyParser from "body-parser";
import chalk from "chalk";
import dotenv from "dotenv";
import express from "express";
import fs from 'fs';
import http from "http";
import morgan from "morgan";
import readdirp from 'readdirp';
import winston from "winston";

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

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "80", 10);
const LOCAL_PORT = parseInt(process.env.LOCAL_PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ZENCODE_DIR = process.env.ZENCODE_DIR;
const OPENAPI = JSON.parse(process.env.OPENAPI || true);
const YML_EXT = process.env.YML_EXT || "yaml";
const CHAIN_EXT = process.env.CHAIN_EXT || "chain";

const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan("dev"));
app.set("json spaces", 2);

app.use(db.default);
app.use(fabric.default);
app.use(files.default);
app.use(logger.default);
app.use(rrhttp.default);
app.use(rrredis.default);
app.use(ethereum.default);
app.use(planetmint.default);
app.use(timestamp.default);
app.use(git.default);


/*
 * Load current L1 blockchains database
 */
import {
  readFile
} from 'fs/promises';
const subscriptions = JSON.parse(
  await readFile(
    new URL('./subscriptions.json',
      import.meta.url)
  )
).oracleActions;
Object.keys(subscriptions).forEach(
  key => subscriptions[key].name = key);


/*
 * Subscribe to ETH node
 */
function subscribeEth(blockchain) {
  try {
    const ws = new WebSocket(blockchain.subscription);
    ws.onopen = function () {
      const id = Math.floor(Math.random() * 65536);
      let subscriptionId = null;
      ws.send(JSON.stringify({
        id,
        jsonrpc: "2.0",
        method: "eth_subscribe",
        params: [
          "logs",
          blockchain.listen
        ]
      }));
      const processMsg = function (evt) {
        let msg = JSON.parse(evt.data)
        console.log(msg)
        if (msg.method == "eth_subscription" &&
          msg.params && msg.params.subscription == subscriptionId) {
          msg['endpoint'] = blockchain.rpc;
          Object.assign(msg, {
            blockchain
          })
          console.log(msg.params.result);
          axios.post(blockchain.trigger, {
            data: msg.params.result
          })
            .then(function (data) {
              L.info(`ETH_RESTROOM ${JSON.stringify(data.data)}`);
            }).catch(function (e) {
              L.warn(`ETH_RESTROOM_ERROR ${e.response}`)
            });
        }
      }
      ws.onmessage = function (e) {
        const msg = JSON.parse(e.data);
        console.log(msg)
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

const subscribeFn = {
  ethereum: subscribeEth
}

function dispatchSubscriptions() {
  Object.keys(subscriptions).forEach(
    key => {
      try {
        const blockchain = subscriptions[key]
        const fn = subscribeFn[blockchain['blockchain']];
        if (!fn) {
          L.log("UNKNOWN_SUBSCRIPTION " + key);
          return
        }
        fn(blockchain);
      } catch (e) {
        console.warn(e)
      }
    });
}

app.get("/apis", async (req, res) => {
  let files = await readdirp.promise(ZENCODE_DIR, { fileFilter: '*.zen|*.yaml|*.yml' })
  let getEndpoint = (file) => file.path.replace('.zen', '').replace(`.${YML_EXT}`, `.${CHAIN_EXT}`);
  let endpoints = files.map(file => `/api/${getEndpoint(file)}`);
  res.json(endpoints)
});

if (OPENAPI) {
  app.use("/docs", ui.default({ path: ZENCODE_DIR }));
}

app.use("/api/*", zencode.default);

const contracts = fs.readdirSync(ZENCODE_DIR);

if (contracts.length > 0) {
  const httpServer = http.createServer(app);
  httpServer.listen(LOCAL_PORT, HOST, () => {
    console.log(`🚻 Restroom started on http://${chalk.bold.blue(HOST)}:${HTTP_PORT}`);
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
    dispatchSubscriptions();
  });
} else {
  console.log(`🚨 The ${chalk.magenta.underline(ZENCODE_DIR)} folder is empty, please add some ZENCODE smart contract before running Restroom`);
}

