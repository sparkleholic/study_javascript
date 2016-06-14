'use strict'

let Promise = require("bluebird"),
    fs = Promise.promisifyAll(require('fs')),
    path = require('path')

let OPTION_KEYS = ['subPaths', 'fileNames'];

function search(searchDir, searchKeys) {
    function _validOptions(searchKeys) {

    }
}

function traverseDirParallel(dir, callback) {
    let results = [];
    fs.readdir(dir, (err, files) => {
        if (err) throw err;
        let pending = files.length;
        if (!pending) return callback(results);
        files.forEach( (file)=> {
            let filePath = path.join(dir, file);
            // console.log("filePath:", filePath);
            let stats = fs.lstatSync(filePath);
            if (stats.isFile()) {
                results.push(filePath);
                if (!--pending) { return callback(results); }
            } else {
                traverseDirParallel(filePath, (ret) => {
                    results = results.concat(ret);
                    if (!--pending) return callback(results);
                })
            }
        })
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

module.exports = search;
if (require.main === module) {
    let traverseDir = traverseDirSerial;
    traverseDir(process.cwd(), (result) => {
        console.log("list:", result.length);
    });
}
//
// if (require.main === module) {
//     traverseDir(process.cwd())
//         .then( (list) => {
//             console.log(list);
//         })
//         .catch( (err) => {
//             console.error(err.stack);
//         })
// }
