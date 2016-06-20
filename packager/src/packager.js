var Promise = require('bluebird'),
    path = require('path'),
    util = require('util')

var fs = Promise.promisifyAll(require('fs'));

(function () {
    'use strict';
    const DIR_TYPE = {
        'APP': 0,
        'SERVICE': 1,
        'PACKAGE' : 2
    };
    const METAFILE = {
        'appinfo.json' : DIR_TYPE.APP,
        'package.json': DIR_TYPE.SERVICE,
        'services.json': DIR_TYPE.SERIVCE,
        'packageinfo.json': DIR_TYPE.PACKAGE
    };

    function Packager(options) {
    }
    Packager.prototype = {
        checkInDirs: function(inDirs, options, next) {
        },

        genPackage: function(inDirs, destDir, options, next) {
            if (! inDirs instanceof Array || !inDirs) { return next(new Error('invalid parameters')); };
            let metaFile= {};
            _classifyDirs(inDirs)
            .then( (fileInfos)=> {
                if (fileInfos.length < 1) {
                    return next(new Error('failure finding metafiles'));
                }
                fileInfos.forEach( (info)=> {
                    for (let i in info ) {
                        metaFile[info[i]] = [].concat(i);
                    }
                })
                if (!metaFile[DIR_TYPE.APP] || metaFile[DIR_TYPE.APP].length > 1) {
                    return next(new Error('failure finding app directory'));
                }
                return metaFile[DIR_TYPE.APP][0];
            })
            .then ( _loadAppInfo )
            .then ( (appinfo)=> {
                console.log("appid:", appinfo.id);
            })
            .then( () => {
                next(null, "done!");
            })
            .catch( (err) => {
                return next(err, "error!")
            })
        },

        forcePackage: function(inDir, options, next) {
            // force ipk from inDir
        }
    }

    function _classifyDirs(inDirs) {
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

    function _loadAppInfo(appMetaFile) {
        return fs.readFileAsync(appMetaFile)
                .then( (data)=>{
                    return JSON.parse(data);
                });
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
