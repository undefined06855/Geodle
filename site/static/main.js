// @ts-nocheck
import { FuseWorker } from "./fuse/fuse-worker.mjs";

/** @type {HTMLInputElement} */
let input = document.querySelector("input#guess");
let suggestions = document.querySelector("div#autofill");
let guesses = document.querySelector("div#guessed-box");

/** @type {Array<import("../../geodle").GeodeMod>} */
let guessHistory = [];

if (localStorage.getItem("date") == geodleData.date) {
    guessHistory = JSON.parse(localStorage.getItem("guessHistory") ?? "[]").map(id =>
        geodleData.allMods.find(mod => mod.id == id),
    );
} else {
    localStorage.setItem("date", geodleData.date);
    localStorage.setItem("guessHistory", "[]");
}

function updateHint() {
    /** @type {import("../../geodle").GeodeMod} */
    let hintState = {
        id: "???.???",
        developer: "????",
        developerID: 0,
        downloads: "????",
        name: "?????????",
        tags: ["????"],
        version: "????",
        updateDate: "????",
    };

    // guess 3, metadata (this isn't really helpful in most cases)
    if (guessHistory.length >= 3) {
        hintState.tags = geodleData.mod.tags;
        hintState.version = geodleData.mod.version;
        hintState.updateDate = geodleData.mod.updateDate;
        hintState.downloads = geodleData.mod.downloads;
    }

    // guess 4, show developer
    if (guessHistory.length >= 4) {
        hintState.developer = geodleData.mod.developer;
        hintState.developerID = geodleData.mod.developerID;
    }

    let guess = Guess({ addTick: false, mod: hintState });

    // guess 5+, mod icon but blurred
    if (guessHistory.length >= 5) {
        let icon = guess.querySelector("#mod-icon");
        icon.src = `https://api.geode-sdk.org/v1/mods/${geodleData.mod.id}/logo`;
        icon.style.filter = `blur(${12 - guessHistory.length*2}px)`;
    }

    guess.id = "hint-guess";
    let hintBox = document.querySelector("#info-box");

    let existing;
    if ((existing = hintBox.querySelector("#hint-guess"))) {
        existing.remove();
    }

    hintBox.appendChild(guess);
}

function checkGameOver() {
    if (guessHistory.length == 0) return;

    let mod = guessHistory[guessHistory.length - 1];
    if (mod.id == geodleData.mod.id || guessHistory.length == 7) {
        input.disabled = "yeah";
        document.querySelector("main").appendChild(GameOverBox({ guessHistory }));
    }
}

(async () => {
    // don't do anything if the server had an exception
    if (geodleError) {
        console.error(geodleError);
        return;
    }

    const fuse = new FuseWorker(
        geodleData.allMods,
        {
            keys: ["id", "name", "developer"],
        },
        {
            workerUrl: "./fuse/fuse.worker.mjs",
        },
    );

    input.addEventListener("input", async event => {
        if (input.value.trim() == "") {
            suggestions.innerHTML = "";
            return;
        }

        let results = await fuse.search(input.value);
        suggestions.innerHTML = "";

        for (let result of results.slice(0, 5)) {
            let mod = result.item;
            let suggestion = AutofillSuggestion({
                modID: mod.id,
                modName: mod.name,
            });

            suggestion.addEventListener("click", () => {
                input.value = mod.name;
                input.dispatchEvent(new InputEvent("input"));
                input.focus();
            });

            suggestions.appendChild(suggestion);
        }
    });

    input.addEventListener("keydown", async event => {
        if (event.code != "Enter") return;

        let results = await fuse.search(input.value);
        if (results.length == 0) return;

        let mod = results[0].item;

        guesses.appendChild(Guess({ mod }));
        guessHistory.push(mod);
        localStorage.setItem("guessHistory", JSON.stringify(guessHistory.map(guess => guess.id)));

        checkGameOver();
        updateHint();

        suggestions.innerHTML = "";
        input.value = "";
    });

    input.focus();

    for (let mod of guessHistory) {
        guesses.appendChild(Guess({ mod }));
    }

    checkGameOver();
    updateHint();
})();
