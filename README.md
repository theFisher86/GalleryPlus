# GalleryPlus

GalleryPlus is an extension for [SillyTavern](https://github.com/SillyTavern/SillyTavern) that enhances the built-in image gallery with powerful navigation and slideshow controls.

## Features
- Left-aligned controls for saving, searching, play/pause, fullscreen, a speed slider, and transition selector
- Scroll-wheel zoom or optional hover-zoom with click-and-drag panning when hover-zoom is disabled
- Slideshow support with multiple transitions: crossfade, spiral sweep, horizontal push, and vertical push
- Preloads the next image for smoother playback and supports keyboard navigation and theme-aware highlights
- Respects MovingUI drag/resize behaviour and offers fullscreen toggling

## Installation
1. Download or clone this repository.
2. Copy the `GalleryPlus` folder into SillyTavern's `extensions` directory.
3. Restart SillyTavern and enable **GalleryPlus** from the extensions menu.

## Configuration
Open the extension settings via SillyTavern's gear icon. Options include:
- Enable/disable the extension
- Toggle hover zoom and adjust zoom scale
- Set slideshow speed and transition style
- Show or hide image captions
- Restrict to WebP images only

## Building and Packaging
No build step is required to run the extension. To create a packaged build for distribution:
1. Install Node.js and [web-ext](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/):
   ```bash
   npm install --global web-ext
   ```
2. Run `web-ext build` in the project root to produce a ZIP file in `web-ext-artifacts/`.

## Contributing
Pull requests and issue reports are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.
=======
A better version of the Silly Tavern Gallery

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.