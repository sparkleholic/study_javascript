var Promise = require('bluebird'),
    path = require('path'),
    util = require('util'),
    temp = require('temp'),
    fstream = require('fstream'),
    zlib = require('zlib'),
    CombinedStream = require('combined-stream'),
    stream = require('stream'),
    UglifyJS = require("uglify-js"),
    log = require('npmlog'),
    tarFilterPack = require('./tar-filter-pack'),
    Metadata = require('./metadata')

var fs = Promise.promisifyAll(require('fs'));
var copyDir = Promise.promisify(require('ncp').ncp);
var mkdirp = Promise.promisify(require('mkdirp'));

(function () {
    'use strict';

    log.heading = 'packager';
    log.level = 'warn';

    const DIR_TYPE = {
        'APP': 0,
        'SERVICE': 1,
        'PACKAGE' : 2
    };
    const METAFILE = {
        'appinfo.json' : DIR_TYPE.APP,
        'services.json': DIR_TYPE.SERVICE,
        'package.json': DIR_TYPE.SERVICE,
        'packageinfo.json': DIR_TYPE.PACKAGE
    };
    const METADATA_KEY = {
        'appinfo.json' : "id",
        'services.json': "id",
        'package.json': "name",
        'packageinfo.json': "id"
    }

    function Packager(options) {
    }
    Packager.prototype = {
        checkInDirs: function(inDirs, options, next) {
        },

        genPackage: function(inDirs, destDir, options, next) {
            let tempDir;

            if (! inDirs instanceof Array || !inDirs) { return next(new Error('invalid parameters')); };
            _findMetaFiles(inDirs)
            .then ( (metafileMap) => _loadMetadata(metafileMap) )
            .then ( (infos) => {
                /* info
                {
                    DIR_TYPE.APP : [{ dir: path, file: metaFilePath, data: metadata (obj) }],
                    ...
                }
                */
                return _prepareElements(infos, options)
            })
            .then ( (workDirInfos) => {
                /* workDirInfos
                {

                    DIR_TYPE.APP : [{ dir: path, file: metaFilePath, data: metadata (obj) }],
                    ...
                }
                */
                tempDir = workDirInfos['TEMP-INFO']['tempDir']; //temp = working-dir
                return _fillElements(workDirInfos, options);
            })
            .then ( () => _outputPackage(tempDir, destDir) )
            .then ( (ipkFile) => next(null, {ipk:ipkFile, msg: "Success"}) )
            .catch( (err) => {return next(err)} )
        },

        forcePackage: function(inDir, options, next) {
            // force ipk from inDir
        }
    }

    function _outputPackage(tempDir, destDir ) {
        let ctrlDir = path.join(tempDir, "ctrl");

        return _makeTgz(tempDir, 'data', 'data.tar.gz')
            .then( () => mkdirp(path.join(tempDir, "ctrl")))
            .then( () => _createControlFile({}, path.join(ctrlDir, 'control')))
            .then( () => _makeTgz(tempDir, 'ctrl', 'control.tar.gz'))
            .then( () => _createDebianBinary(path.join(tempDir, "debian-binary")))
            .then( () => _makeIpk(tempDir, destDir, 'test.ipk'));
    }

    function _padSpace(input,length) {
		// max field length in ar is 16
		var ret = String(input + '                                     ' ) ;
		return ret.slice(0,length) ;
	}

	function _arFileHeader(name, size ) {
		var epoch = Math.floor(Date.now() / 1000) ;
		return _padSpace(name, 16)
			+ _padSpace(epoch, 12)
			+ "0     " // UID, 6 bytes
			+ "0     " // GID, 6 bytes
			+ "100644  " // file mode, 8 bytes
			+ _padSpace(size, 10)
			+ "\x60\x0A"   // don't ask
			;
	}

    function _makeIpk(tempDir, destDir, ipkFileName) {
        let ipk = path.join(destDir, ipkFileName);
        console.log("makeIpk in dir " + destDir + " file " + ipkFileName);

        return new Promise( (resolve, reject)=>{
            var arStream = CombinedStream.create();

    		// global header, see http://en.wikipedia.org/wiki/Ar_%28Unix%29
    		var header = "!<arch>\n" ;
    		var debBinary = _arFileHeader("debian-binary",4) + "2.0\n" ;

    		arStream.append(header + debBinary);

    		var pkgFiles = [ 'control.tar.gz', 'data.tar.gz' ] ;
    		var ipkStream  = fstream.Writer(ipk) ;

    		pkgFiles.forEach( function (f) {
    			var fpath = path.join(tempDir,f) ;
    			var s = fstream.Reader({ path: fpath, type: 'File'}) ;
    			var stat = fs.statSync(fpath) ; // TODO: move to asynchronous processing

    			arStream.append(_arFileHeader(f, stat.size));
    			arStream.append(s);
                if ((stat.size % 2) !== 0) {
                    console.log('Adding a filler for file ' + f);
                    arStream.append('\n');
                }
    		}, this);

    		arStream.pipe(ipkStream) ;

    		ipkStream.on('close', function() {
    			console.log("Creating package " + ipkFileName + " in " + destDir);
    			resolve(ipk);
    		});
    		ipkStream.on('error', reject);
        });
    }

    function _createControlFile(pkgInfo, writeFile) {

        var lines = [
			"Package: " + pkgInfo.name || 'com.u.a',
			"Version: " + pkgInfo.version || '1.0.0',
			"Section: misc",
			"Priority: optional",
			"Architecture: " + (pkgInfo.architecture || "all"),
			"Installed-Size: " + (pkgInfo.size || 1234),          // TODO: TBC
			"Maintainer: N/A <nobody@example.com>",          // TODO: TBC
			"Description: This is a webOS application.",
			"webOS-Package-Format-Version: 2",               // TODO: TBC
			"webOS-Packager-Version: x.y.x",                 // TODO: TBC
			''  // for the trailing \n
		];

        return fs.writeFileAsync(writeFile, lines.join("\n"));
    }

    function _createDebianBinary(writeFile) {
        return fs.writeFileAsync(writeFile, "2.0\n");
    }

    function _makeTgz(tempDir, subdir, output, options) {
        let inPath = path.join(tempDir, subdir);
        return new Promise( (resolve, reject)=>{
            var chopAt = String(inPath).length ;
    		var filter = function(p) {
    			return '.' + p.slice(chopAt) ;
    		};

            let pkgServiceNames = '';
            let packageProperties = {};
            //@see https://github.com/isaacs/node-tar/issues/7
            // it is a workaround for packaged ipk on windows can set +x into directory
            var fixupDir = function(entry) {
                // Make sure readable directories have execute permission
                if (entry.props.type === "Directory") {
                    let maskingBits = 0o311;
                    // special case for service directory should have writable permission.
                    if (pkgServiceNames.indexOf(entry.props.basename) !== -1) {
                        maskingBits = 0o333;
                    }
                    entry.props.mode |= (entry.props.mode >>> 2) & maskingBits;
                }

                return true;
            }

    		fstream
    			.Reader( {path: inPath, type: 'Directory', filter: fixupDir } )
    			.pipe(tarFilterPack({ noProprietary: true, pathFilter: filter, permission : packageProperties }))
    			.pipe(zlib.createGzip())
    			.pipe(fstream.Writer(path.join(tempDir,output)))
    			.on("close", resolve)
    		    .on('error', reject);
        });
    }

    function _findMetaFiles(inDirs) {
        return Promise.all(inDirs)
                    .map( (inDir)=>{
                        for (let f in METAFILE) {
                            let file = path.join(inDir,f);
                            if (fs.existsSync(file)) {
                                let type = {};
                                type[file] = METAFILE[f];
                                return type;
                            }
                        }
                    })
                    .then( (fileTypes) => {
                        let metaFileMap= {};
                        fileTypes.forEach( (type)=> {
                            for (let i in type) {
                                metaFileMap[type[i]] = [].concat(i);
                            }
                        });
                        return metaFileMap;
                    } );
    }

    /**
     * @method _fillElements
     * @param {object} wDirInfos - directory infos '{ DIR_TYPE: [dir:path, file:path, data: json] , ...}'
     * @param {object} options - undefined
     * @returns {type} packageInfo - package info '{id, version, etc}'
     * @description write packageinfo.json
     * @example
     * ` ``js
     *
     * ` ``
     */
    function _fillElements (wDirInfos, options) {
        let packageInfo,
            packageDir,
            packageFile,
            data,
            tempDirInfo = wDirInfos['TEMP-INFO'];
            console.log("tempDirInfo:", tempDirInfo);
        if (wDirInfos[DIR_TYPE.PACKAGE].length < 1) {
            let serviceIDs = wDirInfos[DIR_TYPE.SERVICE].map( (dirInfo) => {
                let data = dirInfo['data'],
                    key = dirInfo['key'];
                return data.getValue(key);
            });
            let metadata = wDirInfos[DIR_TYPE.APP][0]['data'];
            let appInfo = metadata.getData();
            packageInfo = _fillPackageInfo(appInfo, serviceIDs);
            data = JSON.stringify(packageInfo, null, 2) + "\n";
            packageDir = path.join(tempDirInfo['packageTempRoot'], packageInfo['id']);
            packageFile = path.join(packageDir, 'packageinfo.json');
            return mkdirp(packageDir)
                .then( () => fs.writeFileAsync(packageFile, data) )
                .then( () => packageInfo )
                .catch( (err) => { throw err; });
        } else {
            packageDir = wDirInfos[DIR_TYPE.PACKAGE][0]['workDir'];
            packageFile = path.join(packageDir, 'packageinfo.json');
            return fs.readFileAsync(packageFile);
        }
    }

    function _fillPackageInfo(appinfo, serviceIDs) {
        let pkginfo = {
            "app": appinfo.id,
            "id": appinfo.id,
            "loc_name": appinfo.title,
            "package_format_version": appinfo.uiRevision,      // TODO: Ok ?
            "vendor": appinfo.vendor,
            "version": appinfo.version || "1.0.0"
        };
        if (serviceIDs.length > 0) {
            pkginfo["services"] = serviceIDs;
        }
        return pkginfo;
    }

    /**
     * @method _prepareElements
     * @param {object} dirInfos - directory infos '{ DIR_TYPE: [dir:path, file:metafile, data: metadata(json)] , ...}'
     * @param {object} options - undefined
     * @returns {type} workInfos - working directory infos '{ DIR_TYPE: [dir:path, file:path, data: json, workDir: path] , ...}'
     * @description copy directories to working directories and return working directories information
     * @example
     * ` ``js
     *
     * ` ``
     */
    function _prepareElements (dirInfos, options) {
        let tempDir = temp.path({prefix: 'com.webos.ares.cli'}) + '.d';
        let _filter = function (name) {
            var include = true;
            return include;
        };
        let _transform = function (read, write, file) {
            if ('.js' === path.extname(file.name) &&
                    file.name.indexOf('node_modules') === -1) {
                let sourceMapFile = write.path + '.map';
                let uglifiedCode = UglifyJS.minify(file.name, {
                    fromString: false,
                    mangle: {
                        except: ['require', 'request']
                    },
                    output: {
                        space_colon: false,
                        beautify: false,
                        semicolons: false
                    },
                    outSourceMap: path.basename(sourceMapFile),
                    sourceMapIncludeSources: true
                });

                read.close();
                if (uglifiedCode.map) {
                    let sMap = JSON.parse(uglifiedCode.map);
                    let rewriteSources = sMap.sources.map( (source) => {
                        return path.relative(copyDir.options.srcDir, source); //FIXME: TBD
                    });
                    sMap.sources = rewriteSources;
                    uglifiedCode.map = JSON.stringify(sMap);
                    let writeSm = fs.createWriteStream(sourceMapFile, { mode: 0o666} );
                    writeSm.write(uglifiedCode.map, 'utf8', (err)=> {
                        if(err) console.error("writing-err:", err, "at", sourceMapFile);
                        writeSm.end();
                    });
                }
                write.write(uglifiedCode.code, 'utf8', (err)=> {
                    if(err) console.error("writing-err:", err, "at", file.name);
                    write.end();
                });
            } else { read.pipe(write); }
        }
        let appTempRoot = path.join(tempDir, '/data/usr/palm/applications'),
            serviceTempRoot = path.join(tempDir, '/data/usr/palm/services'),
            packageTempRoot = path.join(tempDir, '/data/usr/palm/packages');

        return _copyToTemp(dirInfos, DIR_TYPE.APP, appTempRoot, _filter, _transform)
            .then( (infos)=>{
                dirInfos[DIR_TYPE.APP] = infos;
                return _copyToTemp(dirInfos, DIR_TYPE.SERVICE, serviceTempRoot, _filter, _transform);
            })
            .then( (infos)=>{
                dirInfos[DIR_TYPE.SERVICE] = infos;
                return _copyToTemp(dirInfos, DIR_TYPE.PACKAGE, packageTempRoot, _filter, _transform)
            })
            .then ( (infos)=>{
                dirInfos[DIR_TYPE.PACKAGE] = infos;
                dirInfos['TEMP-INFO'] = {   //FIXME: TBD
                    tempDir: tempDir,
                    appTempRoot: appTempRoot,
                    serviceTempRoot: serviceTempRoot,
                    packageTempRoot:  packageTempRoot
                }
                return dirInfos;
            })
    }

    function _copyToTemp (dirInfos, dirType, tempDir, filterFunc, transformFunc) {
        return Promise.all(dirInfos[dirType]).map( (dirInfo)=>{
            let dir = path.join(tempDir,  dirInfo.data.getValue(dirInfo.key) || '');
            copyDir.options = { //FIXME: this variable is being used in the filter func.
                srcDir: dirInfo.dir,
                dstDir: dir,
                type: dirType
            }
            return mkdirp(dir)
                    .then( ()=>{
                        return copyDir(dirInfo.dir, dir, {"filter": filterFunc, "transform": transformFunc})
                            .then( ()=> {
                                dirInfo['workDir'] = dir;
                                return dirInfo;
                            })
                            .catch( (err)=> { throw err;} )
                    });
            });
    }

    function _loadMetadata (metaFiles) {
        let appMetaFiles = metaFiles[DIR_TYPE.APP] || [];
        let serviceMetaFiles = metaFiles[DIR_TYPE.SERVICE] || [];
        let packageMetaFiles = metaFiles[DIR_TYPE.PACKAGE] || [];
        let result = {}

        return Promise.all(appMetaFiles.map(_metadata)).then( (metaObjs)=> {
            result[DIR_TYPE.APP] = metaObjs;
        }).then ( ()=> {
            return Promise.all(serviceMetaFiles.map(_metadata)).then( (metaObjs)=> {
                result[DIR_TYPE.SERVICE] = metaObjs;
            });
        }).then ( ()=> {
            return Promise.all(packageMetaFiles.map(_metadata)).then( (metaObjs)=> {
                result[DIR_TYPE.PACKAGE] = metaObjs;
            })
        }).then( ()=> result )
/* return type
        {
            DIR_TYPE.APP : [{ dir: path, file: metaFilePath, data: metadata (obj) }],
            ...
        }
*/
    }

    function _metadata (file) {
        return fs.readFileAsync(file)
                .then( (data)=>{
                    let meta = {};
                    meta['dir'] = path.dirname(file);
                    meta['file'] = file;
                    meta['key'] = METADATA_KEY[path.basename(file)];
                    meta['data'] = new Metadata(data);
                    return meta;
                })
    }

    if (module && module.exports) {
        module.exports = Packager;
    }

    if (require.main === module) {
        let pkgr = new Packager({});
        pkgr.genPackage([path.join(process.cwd(), '_app'), path.join(process.cwd(), '_svc')], './out', {},
            function(err, result) {
                if (err) console.error(err.stack);
                if (result) console.log (result);
            }
        );
    }
}());
