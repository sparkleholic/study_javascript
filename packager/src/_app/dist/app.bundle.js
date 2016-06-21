/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};

/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {

/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId])
/******/ 			return installedModules[moduleId].exports;

/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			exports: {},
/******/ 			id: moduleId,
/******/ 			loaded: false
/******/ 		};

/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);

/******/ 		// Flag the module as loaded
/******/ 		module.loaded = true;

/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}


/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;

/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;

/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";

/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(0);
/******/ })
/************************************************************************/
/******/ ([
/* 0 */
/***/ function(module, exports, __webpack_require__) {

	/**
		Define and instantiate your enyo.Application kind in this file.  Note,
		application rendering should be deferred until DOM is ready by wrapping
		it in a call to ready().
	*/

	var
		kind = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"enyo/kind\""); e.code = 'MODULE_NOT_FOUND'; throw e; }())),
		ready = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"enyo/ready\""); e.code = 'MODULE_NOT_FOUND'; throw e; }())),
		view = __webpack_require__(1);

	var
		Application = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"enyo/Application\""); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

		var MyApp = module.exports = kind({
		name: "myApp.Application",
		kind: Application,
		view: view
	});

	ready(function () {
		new MyApp({name: "app"});

	});

/***/ },
/* 1 */
/***/ function(module, exports, __webpack_require__) {

	/**
		For simple applications, you might define all of your views in this file.  
		For more complex applications, you might choose to separate these kind definitions 
		into multiple files under this folder.
	*/

	var 
		kind = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"enyo/kind\""); e.code = 'MODULE_NOT_FOUND'; throw e; }())),
		Panels = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"moonstone/Panels\""); e.code = 'MODULE_NOT_FOUND'; throw e; }())),
		Panel = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"moonstone/Panel\""); e.code = 'MODULE_NOT_FOUND'; throw e; }())),
		BodyText = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"moonstone/BodyText\""); e.code = 'MODULE_NOT_FOUND'; throw e; }())),
		IconButton = __webpack_require__(!(function webpackMissingModule() { var e = new Error("Cannot find module \"moonstone/IconButton\""); e.code = 'MODULE_NOT_FOUND'; throw e; }()));

	module.exports = kind({
		name: "myapp.MainView",
		kind: Panels,
		classes: "moon enyo-fit main-view",
		pattern:"activity",
		components: [
			{kind: Panel, title: "Hello World!", headerComponents: [
				{kind: IconButton, src: "assets/icon-like.png"}
			], components: [
				{kind: BodyText, content: "Your content here"}
			]}
		]
	});


/***/ }
/******/ ]);