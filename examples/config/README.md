# Configuration examples

- `settings.example.json` — every setting with its default value, plus example model roles.
  Settings are normally edited in the app (⚙ Settings). From the command line:

  ```bash
  localcode config show                                  # print current settings
  localcode config import examples/config/settings.example.json
  localcode config set generation.numCtx 8192
  localcode config set permissions.mode '"strict"'
  ```

- `LOCALCODE.md` — an example per-project instructions file. Copy it to the root of your
  project and adapt it; the agent reads it at the start of every task.
