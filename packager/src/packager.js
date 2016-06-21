var Promise = require('bluebird'),
    path = require('path'),
    util = require('util'),
    temp = require('temp'),
    fstream = require('fstream'),
    zlib = require('zlib'),
    CombinedStream = require('combined-stream'),
    stream = require('stream'),
    UglifyJS = require("uglify-js"),
    tarFilterPack = require('./tar-filter-pack'),
    Metadata = require('./metadata')

var fs = Promise.promisifyAll(require('fs'));
var copyDir = Promise.promisify(require('ncp').ncp);
var mkdirp = Promise.promisify(require('mkdirp'));

(function () {
    'use strict';
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
        'package.json': "name",
        'services.json': "id",
        'packageinfo.json': "id"
    }

    function Packager(options) {
    }
    Packager.prototype = {
        checkInDirs: function(inDirs, options, next) {
        },

        genPackage: function(inDirs, destDir, options, next) {
            if (! inDirs instanceof Array || !inDirs) { return next(new Error('invalid parameters')); };
            _classifyMetaFile(inDirs)
            .then( (fileInfos)=> {
                let metaFile= {};
                if (fileInfos.length < 1) { return next(new Error('failure finding metafiles'));}
                fileInfos.forEach( (info)=> {
                    for (let i in info ) { metaFile[info[i]] = [].concat(i); }
                })
                if (!metaFile[DIR_TYPE.APP] || metaFile[DIR_TYPE.APP].length > 1) {
                    return next(new Error('failure finding app directory')); }
                return metaFile;
            })
            .then ( _loadMetadata )
            .then ( _constructTempDir )
            .then ( (tempDir) => _outputPackage(tempDir, destDir) )
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
			"Package: " + pkgInfo.name || 'test',
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

    function _classifyMetaFile(inDirs) {
        return Promise.all(inDirs)
                    .map( (inDir)=>{
                        for (let f in METAFILE) {
                            let file = path.join(inDir,f);
                            if (fs.existsSync(file)) {
                                let info = {};
                                info[file] = METAFILE[f];
                                return info;
                            }
                        }
                    });
    }

    function _constructTempDir (metaObjs, excludeOptions) {
        let tempDir = temp.path({prefix: 'com.webos.ares.cli'}) + '.d';
        let _filter = function (name) {
            var include = true;
            return include;
        };
        let _transform = function (read, write, file) {
            if ('.js' === path.extname(file.name)) {
                var T = new stream.Transform;
                T._transform = function(chunk, encoding, cb) {
                //   this.push(chunk.toString().toUpperCase());
                  this.push(UglifyJS.minify(chunk.toString(), {fromString: true}).code);
                  cb();
                };

                read.pipe(T)
                    .pipe(write)
                    .on('error', (err)=>{console.error("file:",file, ", err:", err)})
            } else { read.pipe(write); }
        }
        return _copyToTemp(metaObjs, DIR_TYPE.APP, '/data/usr/palm/applications', tempDir, _filter, _transform)
            .then( ()=>_copyToTemp(metaObjs, DIR_TYPE.SERVICE, '/data/usr/palm/services', tempDir, _filter, _transform))
            .then( ()=>_copyToTemp(metaObjs, DIR_TYPE.PACKAGE, '/data/usr/palm/packages', tempDir, _filter, _transform))
            .then ( ()=>tempDir)
    }

    function _copyToTemp (metaObjs, dirType, appendDir, tempDir, filterFunc, transformFunc) {
        return Promise.all(metaObjs[dirType]).map( (metaObj)=>{
            let dir = path.join(tempDir, appendDir,  metaObj.data.getValue(metaObj.key) || '');
            console.log("_copyToTemp:", dir);
            return mkdirp(dir)
                    .then( ()=>{
                        return copyDir(metaObj.dir, dir, {"filter": filterFunc, "transform": transformFunc})
                            .then( ()=> {
                                console.log("copy done:", dir);
                            })
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
        }).then( ()=> {
            return result;
        })
/* return type
        {
            DIR_TYPE.APP : [{
                dir: path,
                file: metaFilePath,
                data: metadata (obj)
            }],
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
