// @ts-nocheck
import { FuseWorker } from "./fuse/fuse-worker.mjs";

(async () => {
    // don't do anything if the server had an exception
    if (geodleError) {
        console.error(geodleError);
        return;
    }

    const fuse = new FuseWorker(geodleData.allMods, {
        keys: [ "id", "name" ]
    }, {
        workerUrl: "./fuse/fuse.worker.mjs"
    });

    let input = document.querySelector("input#guess");
    let suggestions = document.querySelector("div#autofill");
    let guesses = document.querySelector("div#guessed-box");

    input.addEventListener("input", async event => {
        if (input.value.trim() == "") {
            suggestions.innerHTMl = "";
            return;
        }

        let results = await fuse.search(input.value);
        suggestions.innerHTML = "";

        for (let result of results.slice(0, 5)) {
            let mod = result.item;
            suggestions.appendChild(AutofillSuggestion({
                modID: mod.id,
                modName: mod.name
            }));
        }
    });

    input.addEventListener("keydown", async event => {
        if (event.code != "Enter") return;
        console.log("guess");

        let results = await fuse.search(input.value);
        if (results.length == 0) return;

        let mod = results[0].item;

        guesses.appendChild(Guess({
            modID: mod.id,
            modName: mod.name
        }));
    });
})();

/*****************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
