/*
	cram dependency analyzer
 	finds module/resource dependencies in a file.
*/

(function (global) {
"use strict";

	// regexes
	var removeCommentsRx, findDefineRx, cleanDepsRx;

	// TODO: this was an easy regexp to create, but find a more performant one?
	removeCommentsRx = /\/\*.*?\*\/|\/\/.*?\n/g;

	// regex to find dependency lists courtesy of Brian Cavalier @briancavalier
	findDefineRx = /define\s*\((\s*[^,]*,)?\s*\[([^\]]+)\]\s*,/mg;

	// removes commas and quotes
	cleanDepsRx = /["']+\s*([^"']+)/g;
	
	// It's probably too aggressive to put this so high up in the scope, but
	// for now, it'll do since we always start up a new VM for each build.
	seen = {};

	// analyzer constructor
	function Analyzer () {}

	Analyzer.prototype = {

		/* the following properties must be injected before calling parse() */

		// resolver is a module id and/or url resolver.
		Resolver: null,

		// loader is an AMD module loader object.
		loader: null,

		// fetcher is a text fetcher
		fetcher: null,
		
		analyze: function (moduleId, parentId, config) {
			var resolver, absId, pluginParts, pluginId, resource,
				moduleIds, url, moduleSource;

			resolver = new this.Resolver(parentId, config);
			moduleIds = [];

			if (resolver.isPluginResource(moduleId)) {
				pluginParts = resolver.parsePluginResourceId(moduleId);
				pluginId = resolver.toAbsMid(pluginParts.pluginId);
				resource = pluginParts.resource;
				moduleIds = this.analyze(pluginId, '', config);
				moduleIds = moduleIds.concat(this.analyzePluginResource(pluginId, resource, parentId, config));
			}
			else {
				absId = this.resolver.toAbsMid(moduleId);
				if(!seen[absId]) {
					seen[absId] = true;
					
					url = this.resolver.toUrl(absId);
					moduleSource = this.fetcher.fetch(url);
					moduleIds = this.parse(moduleSource, absId, config);
				}
			}

			return moduleIds.concat([{
				moduleId: moduleId,
				parentId: parentId
			}]);
		},

		parse: function parse (source, parentId, config) {
			// collect dependencies found
			var self, deps;

			self = this;
			deps = [];

			// remove those pesky comments
			source = source.replace(removeCommentsRx, '');

			// find any/all define()s
			this.scan(source, findDefineRx, function (match, id, depsList) {

				if (depsList) {
					// extract the ids
					self.scan(depsList, cleanDepsRx, function (match, depId) {
						deps = deps.concat(self.analyze(depId, parentId, config));
					});
				}

			});

			return deps;
		},

		scan: function scan (str, rx, lambda) {
			// replace() is a fast, easy way to search with a regex
			str.replace(rx, lambda);
		},

		analyzePluginResource: function (pluginId, resource, parentId, config) {
			var resolver, loader, module, url, deps, api, seen;

			deps = [];

			// get plugin module
			loader = this.loader;
			resolver = new this.Resolver('', config);
			url = resolver.toPluginUrl(pluginId);
			loader.resolver = resolver;
			module = loader.load(url);
			
			if(!module) {
				print("ERR module is null:", url, pluginId);
				return deps;
			}

			resolver = new this.Resolver(parentId, config);
			loader.resolver = resolver;

			// ask plugin to look for more dependencies
			if (typeof module.analyze == 'function') {				
				api = {
					load: function(id) { return loader.load(id); },
					toUrl: function (id) { return resolver.toUrl(id); },
					toAbsMid: function (id) { return resolver.toAbsMid(id); }
				};
				module.analyze(resource, api, function (resourceId) {
					deps = deps.concat(this.analyze(resourceId, parentId, config));
				});
			}
			
			return deps;
		},

		toString: function toString () {
			return '[object Analyzer]';
		}

	};

	global.Analyzer = Analyzer;

}(this));

/*

define("a", ["b", "c"], function (b, c) { return b + c; });
define("a", function () { return 1; });
define("a", { foo: 1; });
define("a", 1);
define("a", "foo");
define(["b", "c"], function (b, c) { return b + c; });
define(function () { return 1; });
define({ foo: 1; });
define(1);
define("foo");

define("a", ["b", "c"], myFunc);
define("a", myDepsArray, myFunc); // <- cram won't find these dependencies
define("a", myFunc);
define("a", myObj);
define("a", myValue);
define("a", myString);

*/