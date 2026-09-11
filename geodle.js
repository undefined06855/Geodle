import { Brain } from "brain";
import { Result } from "result-js";
import * as jsc from "bun:jsc";
import * as unzipper from "unzipper";

/**
 * @typedef GeodleData
 * @property {Temporal.PlainDate} date
 * @property {number} day
 * @property {GeodeMod} mod
 * @property {string} developerName
 * @property {string} code
 * @property {Array<string>} tags
 */

/**
 * @typedef GeodeMod
 * @property {string} id
 * @property {string} name
 * @property {string} version
 */

export default class Geodle {
    /** @type {Brain} */ brain;
    /** @type {Temporal.PlainDate} */ zerothDay;
    /** @type {GeodleData | string} */ data = "day has not been generated yet";
    /** @type {Array<GeodeMod>} */ mods = [];

    /**
     * @param {Brain} brain
     */
    constructor(brain) {
        this.brain = brain;
        this.zerothDay = Temporal.PlainDate.from(process.env.ZEROTH_DAY ?? "2000-00-00");
    }

    async init() {
        this.brain.registerParameterHook({ "Geodle.self": this });

        Bun.cron(
            "0 0 * * *",
            async () => {
                this.data = (await this.generateToday()).merge();
            },
            { tz: process.env.TIMEZONE },
        );

        this.data = (await this.generateToday()).merge();
    }

    /**
     * Generates the information for today.
     * @returns {Promise<Result<GeodleData>>}
     */
    async generateToday() {
        console.timeEnd("generating day");
        console.time("generating day");

        let today = Temporal.Now.plainDateISO(process.env.TIMEZONE);
        console.info(`Wakey wakey eggs and bakey, today is ${today.toString()}, my dudes.`);

        // update our local mods list
        let allModsRes = await this.fetchAllMods();
        if (allModsRes.isErr()) return allModsRes.forceErr();
        this.mods = allModsRes.unwrap();
        console.info(`we have ${this.mods.length} mods on the index`);

        // then get the mod
        let daysSinceStart = today.since(this.zerothDay).total("days");
        jsc.setRandomSeed(Number(Bun.hash(daysSinceStart.toString(16))));

        let mod = undefined;
        let fileContents = undefined;
        let modData = undefined;

        let validMod = false;
        modLoop: while (!validMod) {
            let modIndex = ~~(Math.random() * this.mods.length);
            mod = this.mods[modIndex];
            if (!mod) return Result.err("unreachable 1");

            console.info(`...which will be Geodle #${daysSinceStart}, which is mod index ${modIndex}, ${mod.id}`);

            // find if we can get the source code by doing shit to a zip file in memory
            let modDataRes = await this.queryGeode(`/v1/mods/${mod.id}/versions/${mod.version}`);
            if (modDataRes.isErr()) return modDataRes.forceErr();
            modData = modDataRes.unwrap();

            let regex = /^(https?:\/\/[^\/]+)\/([^\/]+)\/([^\/]+)/;
            let matches = regex.exec(modData["direct_download_link"]);
            if (!matches) {
                console.warn(`failed to match a valid download link for ${mod.id}, skipping...`);
                continue;
            }

            let zipUrl = `${matches[1]}/${matches[2]}/${matches[3]}/archive/refs/heads/main.zip`;
            console.info(`evaluated zip url to ${zipUrl}`);

            let res = await fetch(zipUrl);
            if (res.status != 200) {
                console.warn(`failed to use the zip url, status code ${res.status}, skipping...`);
                continue;
            }

            let zipRes = await Result.fromPromise(unzipper.Open.buffer(Buffer.from(await res.arrayBuffer())));
            if (zipRes.isErr()) {
                console.warn("invalid zip file, skipping...");
                continue;
            }

            // find a good file, valid extension + not too short
            let zip = zipRes.unwrap();
            let validExtensions = [
                ".c",
                ".h",
                ".cpp",
                ".cc",
                ".cxx",
                ".c++",
                ".hpp",
                ".hh",
                ".hxx",
                ".h++",
                ".m",
                ".mm",
            ];

            let files = zip.files.filter(file => validExtensions.some(extension => file.path.endsWith(extension)));

            while (!fileContents) {
                if (files.length == 0) {
                    console.warn(`zero valid files left in zip file (from ${zip.files.length})`);
                    continue modLoop;
                }

                let fileIndex = ~~(Math.random() * files.length);
                let file = files[fileIndex];
                if (!file) return Result.err("unreachable 2");

                console.info(`${files.length} valid files left, we chose file index ${fileIndex}, ${file.path}`);

                let contents = (await file.buffer()).toString();

                let lines = contents.split("\n");
                if (lines.length < 17) {
                    console.warn(`file was too small (${lines.length} lines), picking a different one...`);
                    files.splice(fileIndex, 1);
                    continue;
                }

                let start = ~~(Math.random() * (lines.length - 9));
                let end = start + 17;

                console.info(`choosing from line ${start} to ${end}`);
                fileContents = lines.slice(start, end).join("\n");
            }

            validMod = true;
        }

        console.timeEnd("generating day");

        // @ts-ignore
        return Result.ok({
            date: today,
            day: daysSinceStart,
            mod: mod,
            code: fileContents,
            developerName: modData["developers"][0]["display_name"],
            tags: modData["tags"],
        });
    }

    /**
     * Updates the local mod cache.
     * @returns {Promise<Result<Array<GeodeMod>>>}
     */
    async fetchAllMods() {
        let page = 0;
        let total = Infinity;

        /** @type {Array<GeodeMod>} */
        let mods = [];

        while (mods.length < total) {
            page++;
            let res = await this.queryGeode("/v1/mods", { page: page.toString(), per_page: "100" });
            if (res.isErr()) return res.forceErr();

            let data = res.unwrap();
            total = data["count"];

            mods.push(
                ...data["data"].map(
                    /** @param {any} mod */ mod => {
                        return /** @type {GeodeMod} */ ({
                            id: mod["id"],
                            name: mod["versions"][0]["name"],
                            version: mod["versions"][0]["version"],
                        });
                    },
                ),
            );
        }

        return Result.ok(mods);
    }

    /**
     * Called from the main page
     */
    generateDataHTML() {
        if (typeof this.data === "string") {
            return `
                <script>
                    const geodleError = ${JSON.stringify(this.data)};
                    const geodleData = {};
                </script>
            `;
        } else {
            return `
                <script>
                    const geodleError = null;
                    const geodleData = {
                        date: ${JSON.stringify(this.data.date.toString())},
                        day: ${this.data.day},
                        modID: ${JSON.stringify(this.data.mod.id)},
                        modName: ${JSON.stringify(this.data.mod.name)},
                        developerName: ${JSON.stringify(this.data.developerName)},
                        code: ${JSON.stringify(this.data.code)},
                        tags: ${JSON.stringify(this.data.tags)},
                        allMods: ${JSON.stringify(this.mods)},
                    }
                </script>
            `;
        }
    }

    getBrainParams() {
        return {
            "Geodle.title": typeof this.data == "string" ? this.data : `Geodle #${this.data.day}`,
            "Geodle.code": typeof this.data == "string" ? "" : this.data.code
        };
    }

    /**
     * @param {string} endpoint
     * @param {Record<string, string>} params
     * @returns {Promise<Result<any>>}
     */
    async queryGeode(endpoint, params = {}) {
        let url = `${process.env.GEODE_API_ENDPOINT}${endpoint}`;
        let query = new URLSearchParams(params).toString();

        let res = await fetch(`${url}?${query}`, {
            headers: {
                Authorization: `Bearer ${process.env.GEODE_API_TOKEN}`,
            },
        });
        if (res.status != 200) {
            return Result.err(`unknown status code ${res.status} when fetching ${endpoint}`);
        }

        /** @type {any} */
        let json = await res.json();

        if (json["error"].length != 0) {
            return Result.err(`geode server error ${json["error"]} when fetching ${endpoint}`);
        }

        return Result.ok(json["payload"]);
    }
}
