import { Brain, BrainConfig } from "brain";
import Geodle from "./geodle";

const brain = new Brain(new BrainConfig().setSiteDataPath("./site").setDebug((process.env.DEBUG ?? "true") == "true"));
await brain.init();

const geodle = new Geodle(brain);
await geodle.init();

const server = Bun.serve({
    routes: {
        "/hljs.css": Bun.file("node_modules/highlight.js/styles/vs-dark.min.css"),

        "/fuse/:file": req => {
            let file = Bun.file(`node_modules/fuse.js/dist/${req.params.file}`);
            return new Response(file, { headers: { "Content-Type": file.type } });
        },

        // result
        "/r/:score": {
            POST: req => {
                let res = geodle.onSubmitResults(req, server);
                return res;
            },
        },

        // smallified logo
        "/s/:id/:size": async req => {
            let size = parseInt(req.params.size);
            if (isNaN(size) || size > 10 || size < 0) size = 3;
            let icon = await fetch(`https://api.geode-sdk.org/v1/mods/${req.params.id}/logo`);
            return new Response(await (await icon.blob()).image().resize(size, size).blob());
        },

        "/*": req => {
            return brain.generatePage(new URL(req.url).pathname, geodle.getBrainParams());
        },
    },

    port: process.env.PORT ?? 8080,
    development: process.env.DEBUG == "true",
});

console.info(`Geodle started on port ${server.port}!`);
