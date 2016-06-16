'use strict';
let Promise = require("bluebird"),
    fs = Promise.promisifyAll(require('fs')),
    path = require('path');

let OPTION_KEYS = ['subPaths', 'fileNames'];

function search (searchDir, searchKeys) {
    function _validOptions(searchKeys) {

    }
}

function walkDir (dir) {
    let results = [];
    return new Promise( (resolve, reject) => {
        fs.readdirAsync(dir)
            .then( (files)=> {
                let pending = files.length;
                return Promise.all( files.map( (file) => {
                        let filePath = path.join(dir, file);
                        return fs.statAsync(filePath)
                            .then( (stats) => {
                                if (stats.isDirectory()) {
                                    return walkDir(filePath).then( (res) => {
                                        results = results.concat(res);
                                        if (!--pending) return results;
                                    });
                                } else {
                                    results.push(filePath);
                                    if (!--pending) return results;
                                }
                            })
                            .catch( (err) => { reject(err); });
                }));
            }).then ( () => {
                resolve(results);
            }).catch( (err) => {
                reject(err);
            });
    });
}

function walkDirParallel(dir, callback) {
    let results = [];
    fs.readdir(dir, (err, files) => {
        if (err) throw err;
        let pending = files.length;
        if (!pending) return callback(results);
        files.forEach( (file)=> {
            let filePath = path.join(dir, file);
            let stats = fs.lstatSync(filePath);
            if (stats.isFile()) {
                results.push(filePath);
                if (!--pending) { return callback(results); }
            } else {
                walkDirParallel(filePath, (ret) => {
                    results = results.concat(ret);
                    if (!--pending) return callback(results);
                });
            }
        });
    });
}

function walkDirSerial(dir, callback) {
    let results = [];
    fs.readdir(dir, (err, files) => {
        if (err) throw err;
        let pending = files.length;
        if (!pending) return callback(results);
        let i = 0;
        (function next() {
            let file = files[i++];
            if (!file) return callback(results);
            let filePath = path.join(dir, file);
            fs.stat(filePath, (err, stats) => {
                if (stats.isDirectory()) {
                    walkDirSerial(filePath, (res) => {
                        results = results.concat(res);
                        next();
                    });
                } else {
                    results.push(filePath);
                    next();
                }
            });
        })();
    });
}

if (require.main === module) {
    walkDirSerial(process.cwd(), (result) => {
        console.log("walkDirSerial's result.length:", result.length);
    });
    walkDirParallel(process.cwd(), (result) => {
        console.log("walkDirParallel's result.length:", result.length);
    });
    walkDir(process.cwd()).then( (result) => {
        console.log("walkDirPromise's result.length:", result.length);
    });
}
