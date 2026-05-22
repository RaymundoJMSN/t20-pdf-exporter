# Tormenta 20 — PDF Exporter

A Foundry VTT module that exports player character sheets from the [Tormenta 20](https://foundryvtt.com/packages/tormenta20) system to PDF.

> Status: **early scaffold**. No export feature implemented yet.

## Requirements

- Foundry VTT **v13** (build 351+)
- `tormenta20` system installed in the world

## Development

```bash
npm install
npm run dev     # vite watch build into dist/
```

Symlink this folder into your Foundry user data:

```
<FoundryUserData>/Data/modules/t20-pdf-exporter  ->  <this repo>
```

Then enable the module in a world running the Tormenta 20 system.

## License

[MIT](LICENSE)
