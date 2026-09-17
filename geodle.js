import { Brain } from "brain";
import { Result } from "result-js";
import * as jsc from "bun:jsc";
import * as unzipper from "unzipper";
import cpp from "highlight.js/lib/languages/cpp";
import hljs from "highlight.js/lib/core";
import { RateLimiter } from "@rabbit-company/rate-limiter";

hljs.registerLanguage("cpp", cpp);

/**
 * @typedef GeodleData
 * @property {Temporal.PlainDate} date
 * @property {number} day
 * @property {GeodeMod} mod
 * @property {string} code
 */

/**
 * @typedef GeodeMod
 * @property {string} id
 * @property {string} name
 * @property {string} version
 * @property {Array<string>} tags
 * @property {string} developer
 * @property {number} developerID
 * @property {number} downloads
 * @property {string} updateDate
 * @property {string} releaseDate
 */

export default class Geodle {
    /** @type {Brain} */ brain;
    /** @type {Temporal.PlainDate} */ zerothDay;
    /** @type {Result<GeodleData>} */ data = Result.err("day has not been generated yet");
    /** @type {Array<GeodeMod>} */ mods = [];

    // keep in mind this resets at the start of the new day so this is only for multiple people on the same ip for
    // whatever reason
    /** @type {RateLimiter} */ rateLimiter = new RateLimiter({
        window: 3e+6, // 50 minutes
        max: 1
    });
    /** @type {Object<1 | 2 | 3 | 4 | 5 | 6 | 7 | "X", number>} */ results;
    /** @type {Geodle["results"]} */ defaultResults;

    /**
     * @param {Brain} brain
     */
    constructor(brain) {
        this.brain = brain;
        this.zerothDay = Temporal.PlainDate.from(process.env.ZEROTH_DAY ?? "2000-01-01");

        this.results = this.defaultResults = {
            "1": 4,
            "2": 2,
            "3": 1,
            "4": 6,
            "5": 3,
            "6": 7,
            "7": 1,
            "X": 2
        };
    }

    async init() {
        await this.readResults();

        this.brain.registerParameterHook({ "Geodle.self": this });

        let userData = await this.queryGeode("/v1/me");
        if (userData.isErr() || !userData.unwrap()["admin"]) {
            console.warn("The token provided is either invalid or not an index staff token! Geodle will not work!!");
        }

        Bun.cron(
            "0 0 * * *",
            async () => {
                let webhookURL = process.env.WEBHOOK_URL;
                if (webhookURL && this.data.isOk()) {
                    let data = this.data.unwrap();
                    let total = Object.values(this.results).reduce((prev, cur) => prev + cur, 0);
                    let correct = Object.entries(this.results).filter(([k, v]) => k != "X").map(([k, v]) => v).reduce((prev, cur) => prev + cur, 0);
                    let max = Math.max(...Object.values(this.results));

                    let content = `Wordle #${data.day} on ${data.date.toString()}:\n`;
                    let squares = { "1": "🟩", "2": "🟩", "3": "🟩", "4": "🟨", "5": "🟨", "6": "🟨", "7": "🟥", "X": "⬛" };
                    let adjusters = { "1": " ", "2": "", "3": "", "4": "", "5": "", "6": "", "7": " ", "X": "" }
                    for (let [key, value] of Object.entries(this.results)) {

                        // @ts-ignore
                        content += `${key}/7: ${adjusters[key]}${squares[key].repeat(Math.ceil(10 * (value / max)))} ${value}\n`;
                    }

                    content += `${total} people guessed, with ${total == correct ? "everyone" : correct} guessing the answer, [${data.mod.name}](<https://geode-sdk.org/mods/${data.mod.id}>)!`

                    await fetch(webhookURL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            username: "Geodle",
                            avatar_url: "https://geodle.undefined0.dev/pfp.png",
                            content
                        })
                    });
                }

                this.data = await this.generateToday();

                this.rateLimiter.clear();
                this.results = structuredClone(this.defaultResults);
            },
            { tz: process.env.TIMEZONE },
        );

        this.data = await this.generateToday();

        let webhookURL = process.env.WEBHOOK_URL;
        if (webhookURL && this.data.isOk()) {
            let data = this.data.unwrap();
            let total = Object.values(this.results).reduce((prev, cur) => prev + cur, 0);
            let correct = Object.entries(this.results).filter(([k, v]) => k != "X").map(([k, v]) => v).reduce((prev, cur) => prev + cur, 0);
            let max = Math.max(...Object.values(this.results));

            let content = `Wordle #${data.day} on ${data.date.toString()}:\n`;
            let squares = { "1": "🟩", "2": "🟩", "3": "🟩", "4": "🟨", "5": "🟨", "6": "🟨", "7": "🟥", "X": "⬛" };
            let adjusters = { "1": " ", "2": "", "3": "", "4": "", "5": "", "6": "", "7": " ", "X": "" }
            for (let [key, value] of Object.entries(this.results)) {

                // @ts-ignore
                content += `${key}/7: ${adjusters[key]}${squares[key].repeat(Math.ceil(10 * (value / max)))} ${value}\n`;
            }

            content += `${total} people guessed, with ${total == correct ? "everyone" : correct} guessing the answer, [${data.mod.name}](<https://geode-sdk.org/mods/${data.mod.id}>)!`

            await fetch(webhookURL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: "Geodle",
                    avatar_url: "https://geodle.undefined0.dev/pfp.png",
                    content
                })
            });
        }
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

        // seed the rng with the current day
        let daysSinceStart = today.since(this.zerothDay).total("days");
        jsc.setRandomSeed(Number(Bun.hash(daysSinceStart.toString(16) + process.env.SEED_OFFSET)));

        console.info(`geodle #${daysSinceStart}`);

        let mod = undefined;
        let fileContents = undefined;
        let modData = undefined;

        // first, find a developer then take their mods, so people like ery can't be chosen all the time
        let validDeveloper = false;
        developerLoop: while (!validDeveloper) {
            let developers = this.mods.map(mod => mod.developerID);
            developers = Array.from(new Set(developers).values());
            developers.sort((a, b) => a - b);

            let developerIndex = ~~(Math.random() * developers.length);
            let developer = developers[developerIndex];
            if (!developer) return Result.err("unreachable");

            let mods = this.mods.filter(mod => mod.developerID == developer);
            console.info(
                `chosen developer index ${developerIndex}, developer #${developer}, they have ${mods.length} mods`,
            );

            let validMod = false;
            modLoop: while (!validMod) {
                if (mods.length == 0) {
                    console.warn("zero valid mods left by this developer");
                    continue developerLoop;
                }

                let modIndex = ~~(Math.random() * mods.length);
                mod = mods[modIndex];
                mods.splice(modIndex, 1);

                if (!mod) return Result.err("unreachable");

                console.info(`chosen mod index ${modIndex}, ${mod.id}`);

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

                let branchNames = [ "main", "master", "dev" ];
                let validBranch = false;
                /** @type {Response | undefined} */
                let res = undefined;

                for (let branchName of branchNames) {
                    let zipUrl = `${matches[1]}/${matches[2]}/${matches[3]}/archive/refs/heads/${branchName}.zip`;
                    console.info(`evaluated zip url to ${zipUrl}`);

                    res = await fetch(zipUrl);
                    if (res.status != 200) {
                        console.warn(`failed to use the branch name ${branchName}, status code ${res.status}, skipping...`);
                        continue;
                    }

                    validBranch = true;
                    console.info(`using branch name ${branchName}`);
                    break;
                }

                if (!validBranch) {
                    console.warn("could not find valid branch name, skipping this mod...");
                    continue;
                }

                if (!res) return Result.err("unreachable");

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
                    files.splice(fileIndex, 1);

                    if (!file) return Result.err("unreachable");

                    console.info(`${files.length} valid files left, we chose file index ${fileIndex}, ${file.path}`);

                    let contents = (await file.buffer()).toString();

                    let lineCount = parseInt(process.env.LINE_COUNT ?? "20");

                    let lines = contents.split("\n");
                    if (lines.length < lineCount) {
                        console.warn(`file was too small (${lines.length} lines), picking a different one...`);
                        continue;
                    }

                    let start = ~~(Math.random() * (lines.length - lineCount - 1));
                    let end = start + lineCount;

                    console.info(`choosing from line ${start} to ${end}`);
                    fileContents = lines.slice(start, end).join("\n");
                }

                validMod = true;
            }

            validDeveloper = true;
        }

        console.timeEnd("generating day");

        if (!mod || !today || !fileContents) return Result.err("unreachable");

        return Result.ok({
            date: today,
            day: daysSinceStart,
            mod: mod,
            code: fileContents,
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
                            tags: mod["tags"],
                            developer: mod["developers"][0]["display_name"],
                            developerID: mod["developers"][0]["id"],
                            downloads: mod["download_count"],
                            updateDate: mod["versions"][0]["updated_at"] ?? mod["created_at"],
                            releaseDate: mod["created_at"],
                        });
                    },
                ),
            );
        }

        return Result.ok(mods);
    }

    async writeResults() {
        let file = Bun.file("./results.json");
        await file.write(JSON.stringify({
            results: this.results,
            day: Temporal.Now.plainDateISO(process.env.TIMEZONE).toString()
        }));
    }

    async readResults() {
        let file = Bun.file("./results.json");
        if (!await file.exists()) return;
        let data = JSON.parse(await file.text());
        console.info("existing result data found, checking if it's today's...");
        if (data.day != Temporal.Now.plainDateISO(process.env.TIMEZONE).toString()) return;
        console.info("reading existing result data");
        this.results = data.results;
    }

    /**
     * @param {Bun.BunRequest<"/r/:score">} req
     * @param {Bun.Server<any>} server
     * @returns {Promise<Response>}
     */
    async onSubmitResults(req, server) {
        let ip = req.headers.get("cf-connecting-ip") ?? server.requestIP(req)?.address;
        if (ip) {
            let res = this.rateLimiter.check("/comments", ip);
            if (res.limited) {
                return new Response("rate limited")
            }
        }

        let result = req.params.score;
        if (!Object.keys(this.results).includes(result)) {
            return new Response("invalid");
        }

        // @ts-ignore
        this.results[req.params.score]++;
        await this.writeResults();

        console.debug(`submitted result of ${req.params.score}`);

        return new Response("submitted");
    }

    /**
     * Called from the main page
     */
    generateDataHTML() {
        if (this.data.isErr()) {
            return `
                <script>
                    const geodleError = ${JSON.stringify(this.data.unwrapErr())};
                    const geodleData = {};
                </script>
            `;
        } else {
            let data = this.data.unwrap();
            return `
                <script>
                    const geodleError = null;
                    const geodleData = {
                        date: ${JSON.stringify(data.date.toString())},
                        day: ${data.day},
                        mod: ${JSON.stringify(data.mod)},
                        code: ${JSON.stringify(data.code)},
                        allMods: ${JSON.stringify(this.mods)},
                    }
                </script>
            `;
        }
    }

    /**
     * Called from the main page
     */
    generateHighlightedCode() {
        if (this.data.isErr()) {
            return this.data.unwrapErr();
        }

        return `
            <pre><code>${
                hljs.highlight(this.data.unwrap().code, {
                    language: "cpp",
                }).value
            }</code></pre>
        `.trim();
    }

    getBrainParams() {
        return {
            "Geodle.title": this.data.isErr() ? "" : `Geodle #${this.data.unwrap().day}`,
            "Geodle.code": this.data.isErr() ? "" : this.data.unwrap().code,
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
