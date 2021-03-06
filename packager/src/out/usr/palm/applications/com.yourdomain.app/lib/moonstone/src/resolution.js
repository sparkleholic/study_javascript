/**
* Defines TV-specific resolution values. See {@link module:enyo/resolution} for more details.
* @module moonstone/resolution
*/
var
	ri = require('enyo/resolution');

ri.defineScreenTypes([
	{name: 'hd',      pxPerRem: 16, width: 1280, height: 720,  aspectRatioName: 'hdtv'},
	{name: 'fhd',     pxPerRem: 24, width: 1920, height: 1080, aspectRatioName: 'hdtv', base: true},
	{name: 'uw-uxga', pxPerRem: 24, width: 2560, height: 1080, aspectRatioName: 'cinema'},
	{name: 'uhd',     pxPerRem: 48, width: 3840, height: 2160, aspectRatioName: 'hdtv'}
]);

module.exports = ri;
