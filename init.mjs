import {
    promises as fsp
} from 'fs';
import path from 'path'

import { zencode_exec } from "zenroom"

import dotenv from "dotenv";
dotenv.config();

const PRIVATE_ZENCODE_DIR = process.env.PRIVATE_ZENCODE_DIR;
const ZENCODE_DIR = process.env.ZENCODE_DIR || "contracts";
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


// generate private keys
const generatePrivateKeysScript = await fsp.readFile(path.join(PRIVATE_ZENCODE_DIR, "consensus-generate-all-private-keys.zen"), 'utf8')
let keyring = {}
const keys = await zen(generatePrivateKeysScript, null, null);
if (!keys) {
    console.error("Error in generate private keys");
    process.exit(-1)
}
Object.assign(keyring, JSON.parse(keys.result))

await fsp.writeFile(
    path.join(ZENCODE_DIR, "zenswarm-oracle-generate-all-public-keys.keys"),
    keys.result)
await fsp.writeFile(
    path.join(ZENCODE_DIR, "keyring.json"),
    JSON.stringify(keyring), {mode: 0o600})
try {
    await fsp.unlink(path.join(ZENCODE_DIR, "identity.json"))
} catch(e) {}
