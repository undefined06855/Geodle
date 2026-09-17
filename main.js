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

        "/r/:score": {
            POST: req => {
                let res = geodle.onSubmitResults(req, server);
                return res;
            }
        },

        "/*": req => {
            return brain.generatePage(new URL(req.url).pathname, geodle.getBrainParams());
        },
    },

    port: process.env.PORT ?? 8080,
    development: process.env.DEBUG == "true"
});

console.info(`Geodle started on port ${server.port}!`);
