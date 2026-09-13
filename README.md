# Geodle

Play Geodle at https://geodle.undefined0.dev/!

## Hosting

1. Clone the repo (obviously)
1. Install dependencies by running `bun i` in the project folder
1. Add a `.env` file (or set the environment variables manually) with the following variables:
```env
DEBUG=true                  # Whether Brain (the framework) and Bun.serve runs in debug mode
PORT=8080                   # The port to serve Geodle on
TIMEZONE=UTC                # The timezone to refresh Geodle at midnight in
LINE_COUNT=25               # The amount of lines to show in the code snippet
ZEROTH_DAY=2024-09-10       # The day that Geodle considers day #0
GEODE_API_TOKEN=            # An API token for the Geode index API, which should have index staff permissions to fetch the direct download link for mods
GEODE_API_ENDPOINT=https://api.geode-sdk.org    # The endpoint that mods are fetched from
SEED_OFFSET=                # A string which is appended to another string, both hashed to generate a random number for the mod for the day (this can be used to quickly refresh the Geodle for testing, or to ensure that the official Geodle cannot be exactly recreated by someone else)
```
1. Run `bun geodle` to start hosting!

This project was created using `bun init` in bun v1.4.2. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
