(function(){
    'use strict';

    function Metadata(d) {
        var data;
        if (d instanceof Buffer) {
            data = JSON.parse(d);
        }

        this.setData = function(d) {
            data = d;
        }
        this.getData = function() {
            return data;
        }
        this.getValue = function(key) {
            return data[key];
        }
    }

    if (module && module.exports) {
        module.exports = Metadata;
    }
}());
