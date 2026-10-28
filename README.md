# OntoBDC dDock

**dDock** is a browser-based workspace for [OntoBDC](https://github.com/OntoBDC/ontobdc-core) containers. It brings document navigation, semantic entities, metadata, and OntoBDC CLI operations into a dockable interface without requiring a separate desktop application.

dDock is the **generic interface layer**. OntoBDC provides the underlying container and semantic capabilities; applications such as InfoBIM may add domain-specific behavior independently.

## Features

- **Local containers:** create, open, inspect, and refresh OntoBDC containers selected from the local filesystem.
- **Remote containers:** sign in to a configured service, list accessible containers, and connect to a remote container.
- **Document explorer:** navigate files, open previews, upload, rename, delete, and relate documents where the relevant operations are available.
- **Semantic information:** browse entity groups, inspect and edit entities through OntoBDC facades, and work with linked information rather than duplicating it in a separate application database.
- **Document viewers:** built-in panels for PDF, DOCX, XLSX, CSV, Markdown, HTML, text, and image formats, including HEIC.
- **Annotations and comments:** work with contextual notes and comment threads; the repository includes an annotations add-on.
- **History and tags:** access the available history/calendar and tag views for container information.
- **Productivity add-on:** panels for tasks, goals, milestones, and related views.
- **Integrated terminal:** execute supported OntoBDC commands through an in-browser Pyodide runtime, with a command queue and event/debug panels.
- **Configurable interface:** dockable panels, light/dark themes, and English, Brazilian Portuguese, and Spanish translations.

Features depend on the selected container, its data, available facades, and whether the browser has read or write permission.

## How it works

```text
Browser
  ├── dDock interface (TypeScript, Vite, Dockview)
  │     ├── Document explorer and viewers
  │     ├── Semantic entity panels
  │     ├── Terminal, command queue, and event log
  │     └── Optional add-on panels
  ├── File System Access API
  │     └── User-selected local OntoBDC container
  └── Web Worker
        └── Pyodide
              └── OntoBDC Python CLI and dependencies
```

For local work, the browser accesses the directory selected by the user. Supported OntoBDC CLI commands run inside a Web Worker with Pyodide. The worker keeps a mount session and synchronizes changes between the browser filesystem and the Python runtime.

Local containers are OntoBDC containers, not arbitrary folders. Opening an existing container uses its RO-Crate inventory (`.__ontobdc__/ro-crate-metadata.json`) and its registration metadata (`.__ontobdc__/container.ttl`).

Remote connectivity is a separate path and uses the service URLs configured in `src/asset/config.yaml`. It requires the corresponding service and authentication flow.

## Getting started

Open **http://localhost:5173**.

The initial startup prepares the local Pyodide distribution and Python wheels, so it needs network access and may download substantial assets. When building wheels from local Python source packages, Python 3 and the corresponding build tooling are also required.

### Open a container

1. Open the application in a browser that supports the File System Access API (for example, a current Chromium-based browser).
2. Choose **New** to create a container or **Open** to select an existing OntoBDC container directory.
3. Grant filesystem access when prompted. Write operations require write permission.
4. Use the explorer, entity panels, viewers, and terminal.

For remote containers, sign in and use **Connect**; availability depends on the configured server.

## Python runtime and dependency management

The application runs OntoBDC Python functionality in the browser through **Pyodide**, not through a Python process on the web server.

- `src/python/manifest.json` specifies the Pyodide version, required packages, wheel versions, and local package sources.
- `src/scripts/vendor-python.mjs` prepares the runtime and wheels in `src/public/python/`.
- `src/scripts/local-wheels.mjs` builds local Python packages when their source checkouts are available.
- `npm run dev` and `npm run build` invoke the Python vendoring step automatically through their pre-scripts.
- After the runtime has been prepared, the application serves these Python assets locally rather than loading the interpreter from a CDN.

The first vendoring run requires downloads. Working with local containers does not inherently require a remote OntoBDC server; remote-container and login functions do.

## Repository layout

```text
ontobdc-ddock/
├── docker/                     Dockerfile and Compose configurations
├── src/
│   ├── addon/                  Optional application add-ons
│   │   ├── annotations/
│   │   └── productivity/
│   ├── asset/                  Shared styles, images, configuration
│   ├── ontobdc/
│   │   ├── container/          Container workflows and panels
│   │   ├── run/                CLI command execution workflows
│   │   ├── shared/             Models, adapters, event bus, runtime
│   │   ├── user/               Login and user workflows
│   │   └── web/                Shell, views, UI plugins
│   ├── python/manifest.json    Python runtime dependency manifest
│   ├── scripts/                Python vendoring and build utilities
│   ├── tests/                  Unit and integration-oriented tests
│   ├── index.html
│   ├── package.json
│   └── package-lock.json
└── up.sh                       Docker launch helper
```

The application separates **domain models**, **adapters**, and **plugins**. Its workflows use events, listeners, capabilities, and YAML-defined statecharts. Panels are registered through the application's plugin-loading conventions.

## Development commands

Run these commands from `src/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite with Python assets prepared |
| `npm run build` | Type-check and build the web application |
| `npm run preview` | Serve a built application locally |
| `npm run python:vendor` | Prepare Pyodide and wheels |
| `npm run test:unit` | Run TypeScript unit tests |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run test` | Run both test suites |
| `npm run check:arch` | Check architectural dependencies |
| `npm run test:python:container` | Run the Python/container inspection test script |

Playwright browsers must be installed to run the end-to-end suite.

## Extending dDock

dDock is designed as a generic host for container-oriented capabilities. New behavior should be introduced through the existing **plugin, event, capability, and statechart** conventions rather than by embedding domain-specific logic into the core shell.

Existing examples are available in `src/addon/annotations/` and `src/addon/productivity/`. Refer to the current plugin loaders and event contracts under `src/ontobdc/` when adding panels, listeners, or workflows.

The separate OntoBDC CLI also provides a `ddock --install` workflow that composes a dDock application from a `system.obdc` descriptor and additional packages. That workflow belongs to OntoBDC and requires an accessible source repository; it is not necessary for running this source checkout.

## Browser and security notes

- Local file access is mediated by browser permissions and the user-selected directory. Writable operations depend on File System Access API support.
- The Docker setup runs a **Vite development server**. It is not a production deployment configuration.
- The web app's configurable remote API endpoints are independent of its local-file operations.
- Initial setup and rebuilding Python assets may require network access; remote authentication and remote-container operations require access to their configured services.

## License

Licensed under the [Apache License 2.0](LICENSE).
