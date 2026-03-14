# Stroid

[![npm](https://img.shields.io/npm/v/stroid)](https://www.npmjs.com/package/stroid)
[![npm downloads](https://img.shields.io/npm/dm/stroid)](https://www.npmjs.com/package/stroid)
[![bundle size](https://img.shields.io/bundlephobia/minzip/stroid)](https://bundlephobia.com/package/stroid)
[![types](https://img.shields.io/npm/types/stroid)](https://www.npmjs.com/package/stroid)
[![license](https://img.shields.io/npm/l/stroid)](https://github.com/Himesh-Bhattarai/stroid/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Himesh-Bhattarai/stroid/ci.yml?branch=main)](https://github.com/Himesh-Bhattarai/stroid/actions)
[![issues](https://img.shields.io/github/issues/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid/issues)
[![stars](https://img.shields.io/github/stars/Himesh-Bhattarai/stroid)](https://github.com/Himesh-Bhattarai/stroid)

Stroid is a named-store state management library for JavaScript and React with optional persistence, async caching, cross-tab sync, and devtools. It keeps a small core API and lets you opt into extra behavior by explicit import paths.

## Install

```bash
npm install stroid
```

## Minimal Usage

```ts
import { createStore, getStore, setStore } from "stroid";

createStore("counter", { count: 0 });
setStore("counter", "count", 1);

console.log(getStore("counter"));
```

## Docs

- [Book Contents](docs/FRONT_MATTER/CONTENTS.md)
- [Start Here](docs/BODY_MATTER/BEGINNER_GUIDE/START_HERE.md)
- [Install and Imports](docs/BODY_MATTER/BEGINNER_GUIDE/INSTALL_AND_IMPORTS.md)
- [Core of Stroid](docs/BODY_MATTER/CORE_OF_STROID/INTRODUCTION.md)
- [React Layer](docs/BODY_MATTER/REACT_OF_STROID/INTRODUCTION.md)
- [Async Layer](docs/BODY_MATTER/ASYNC_OF_STROID/INTRODUCTION.md)
- [Persistence](docs/BODY_MATTER/PERSIST_OF_STROID/INTRODUCTION.md)
- [Sync](docs/BODY_MATTER/SYNC_OF_STROID/INTRODUCTION.md)
- [Runtime Operations](docs/BODY_MATTER/RUNTIME_OPERATIONS_OF_STROID/INTRODUCTION.md)
- [Server and SSR](docs/BODY_MATTER/SERVER_OF_STROID/INTRODUCTION.md)
- [Helpers](docs/BODY_MATTER/HELPERS_AND_CHAIN_OF_STROID/INTRODUCTION.md)