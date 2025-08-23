# Contributing to GalleryPlus

Thanks for your interest in improving GalleryPlus! The project is small and informal, but please follow these guidelines to keep contributions consistent.

## Tooling Requirements
- [Node.js](https://nodejs.org/) 16 or later
- `npm` (comes with Node.js)
- [`web-ext`](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/) for building and linting

Install the global tooling:
```bash
npm install --global web-ext
```

## Getting Started
1. Fork and clone the repository.
2. Create a topic branch for your change.
3. Run `web-ext lint` to validate the extension structure.
4. Make your changes using 2-space indentation and descriptive commit messages.
5. Submit a pull request.

## Building for Release
To produce a ZIP bundle suitable for distribution:
```bash
web-ext build
```
The output appears in the `web-ext-artifacts/` directory.

## Reporting Issues
Please use the issue tracker to report bugs or request features. Include steps to reproduce and screenshots when possible.

Thanks again for contributing!
