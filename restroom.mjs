import fs from 'fs';
import readdirp from 'readdirp';
import express from "express";
import chalk from "chalk";
import bodyParser from "body-parser";
import zencode from "@restroom-mw/core";
import timestamp from "@restroom-mw/timestamp";
import git from "@restroom-mw/git";
import db from "@restroom-mw/db";
import files from "@restroom-mw/files";
import rrredis from "@restroom-mw/redis";
import rrhttp from "@restroom-mw/http";
import fabric from "@restroom-mw/fabric";
import planetmint from "@restroom-mw/planetmint";
import ethereum from "@restroom-mw/ethereum";
import logger from "@restroom-mw/logger";
import ui from "@restroom-mw/ui";

import http from "http";
import morgan from "morgan"
import dotenv from "dotenv";
dotenv.config();

const HTTP_PORT = parseInt(process.env.HTTP_PORT || "3000", 10);
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
  httpServer.listen(HTTP_PORT, HOST, () => {
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
  });
} else {
  console.log(`🚨 The ${chalk.magenta.underline(ZENCODE_DIR)} folder is empty, please add some ZENCODE smart contract before running Restroom`);
}

