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
                let count = files.length;
                return Promise.all( files.map( (file) => {
                        let filePath = path.join(dir, file);
                        return fs.statAsync(filePath)
                            .then( (stats) => {
                                if (stats.isDirectory()) {
                                    return walkDir(filePath).then( (res) => results = results.concat(res));
                                } else {
                                    results.push(filePath);
                                    if (!--count) return results;
                                }
                            })
                            .catch( (err) => { reject(err); });
                }));
            }).then ( () => {
                resolve(results);
            })
            .catch( (err) => {
                console.error(err.stack);
                reject(err);
            });
    });
}

function traverseDirParallel(dir, callback) {
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
                traverseDirParallel(filePath, (ret) => {
                    results = results.concat(ret);
                    if (!--pending) return callback(results);
                });
            }
        });
    });
}

function traverseDirSerial(dir, callback) {
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
                    traverseDirSerial(filePath, (res) => {
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

// if (require.main === module) {
//     let traverseDir = traverseDirSerial;
//     traverseDir(process.cwd(), (result) => {
//         console.log("list:", result.length);
//     });
// }
//
if (require.main === module) {
    walkDir(process.cwd())
        .then( (result) => {
            // console.log(list);
            console.log("list:", result.length);
            console.log("done!");
        })
        .catch( (err) => {
            console.error(err.stack);
        });
}
