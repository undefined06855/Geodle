import { Brain, BrainConfig } from "brain";
import Geodle from "./geodle";

const brain = new Brain(new BrainConfig().setSiteDataPath("./site").setDebug((process.env.DEBUG ?? "true") == "true"));
await brain.init();

const geodle = new Geodle(brain);
await geodle.init();

const server = Bun.serve({
    routes: {
        "/*": req => {
            return brain.generatePage(new URL(req.url).pathname, geodle.getBrainParams());
        },
    },

    port: process.env.PORT ?? 8080,
});

console.info(`Geodle started on port ${server.port}!`);
