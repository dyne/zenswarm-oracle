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
import ui from "@restroom-mw/ui";
import getPort, {portNumbers} from 'get-port';

import http from "http";
import morgan from "morgan"
import dotenv from "dotenv";
dotenv.config();

let HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 0;
let HTTPS_PORT = parseInt(process.env.HTTPS_PORT, 10) || 0;
const HOST = process.env.HOST || "0.0.0.0";
const ZENCODE_DIR = process.env.ZENCODE_DIR;
const OPENAPI = JSON.parse(process.env.OPENAPI || true);


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
if (OPENAPI) {
  app.use("/docs", ui.default({ path: ZENCODE_DIR }));
}

app.use("/api/*", zencode.default);

if(!fs.existsSync(ZENCODE_DIR)) {
  fs.mkdirSync(ZENCODE_DIR, { recursive: true });
}
const contracts = fs.readdirSync(ZENCODE_DIR);

if (contracts.length > 0) {
  const httpStarted = () => {
    fs.writeFileSync(path.join(ZENCODE_DIR, "identity.keys"), `{"identity":{"uid":"random","ip":"${HOST}","baseUrl":"http://${HOST}","port_http":"${HTTP_PORT}","port_https":"${HTTPS_PORT}","public_key":"BGiQeHz55rNc/k/iy7wLzR1jNcq/MOy8IyS6NBZ0kY3Z4sExlyFXcILcdmWDJZp8FyrILOC6eukLkRNt7Q5tzWU=","version":"2","announceAPI":"/api/consensusroom-announce","get-6-timestampsAPI":"/api/consensusroom-get-6-timestamps","timestampAPI":"/api/consensusroom-get-timestamp","tracker":"https://apiroom.net/"}}`)
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
  httpServer.listen(HTTP_PORT, HOST, () => {
    if(HTTP_PORT == 0) HTTP_PORT = httpServer.address().port
    const httpsServer = http.createServer(app);
    httpsServer.listen(HTTPS_PORT, HOST, () => {
      if(HTTPS_PORT == 0) HTTPS_PORT = httpsServer.address().port
      httpStarted()
    });
  });
} else {
  console.log(`🚨 The ${chalk.magenta.underline(ZENCODE_DIR)} folder is empty, please add some ZENCODE smart contract before running Restroom`);
}

