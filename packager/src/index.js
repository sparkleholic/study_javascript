var Packager = require('./packager');

if (module && module.exports) {
    packager = {};
    packager.Packager = Packager;
    module.exports = packager;
}
